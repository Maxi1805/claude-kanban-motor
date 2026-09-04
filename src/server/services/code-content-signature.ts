/**
 * Content-based signature of a git worktree — F2 (PLAN.md §F2).
 *
 * `worktreeSignature` (`code-analyzer.ts`, exported and left untouched here)
 * is mtime+size based: cheap, but wrong for exactly the case F2 needs to
 * fix — a brand-new worktree checked out from the same commit gets a FRESH
 * mtime for every file even though the bytes are identical, so it can never
 * recognise "this is content I already analysed". This one hashes content
 * instead, and does it the cheap way: git already knows the blob sha1 of
 * every file that is not locally modified (`git ls-files -s`, no file read
 * at all), so only the paths `git status` reports as modified/untracked are
 * actually opened and hashed. On a clean worktree — "second run, same
 * commit", the case this module exists to make fast — the whole thing costs
 * two git subprocess calls and zero file reads.
 *
 * Deliberately hashes EVERY tracked/untracked file under the worktree, not
 * just the ones `code-analyzer.ts` would parse: replicating its private
 * extension/skip-dir rules here would be a second, divergent copy of a list
 * that already lives there — the exact kind of duplication this project's
 * own inventory exists to catch (see `no-unlisted-lexicon.test.ts`), and
 * `code-analyzer.ts` is out of bounds for this task. Hashing a superset is
 * SAFE — the only cost is an occasional unnecessary cache miss when a file
 * `analyzeRepo` would ignore anyway changes — never a false hit.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const execFileAsync = promisify(execFile);

export interface FileContentHash {
  path: string;
  hash: string;
}

export interface ContentSignature {
  /** One entry per file currently in the worktree, sorted by path. */
  files: readonly FileContentHash[];
  /** Hash of the whole set: changes iff the file set or any file's content changed. */
  signature: string;
}

const GIT_TIMEOUT_MS = 30_000;
const GIT_MAX_BUFFER_BYTES = 256 * 1024 * 1024;

/** `git ls-files -s`: "<mode> <blob-sha> <stage>\t<path>" per line. */
function parseLsFilesS(stdout: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of stdout.split("\n")) {
    if (!line) continue;
    const tab = line.indexOf("\t");
    if (tab === -1) continue;
    const [mode, sha] = line.slice(0, tab).split(" ");
    const filePath = line.slice(tab + 1);
    if (mode === "160000") continue; // gitlink (submodule) — no blob to read here.
    if (sha) out.set(filePath, sha);
  }
  return out;
}

/** `git status --porcelain=v1 --untracked-files=all`: which paths do NOT reflect the index. */
function parseDirtyPaths(stdout: string): { changed: string[]; deleted: Set<string> } {
  const changed: string[] = [];
  const deleted = new Set<string>();
  for (const line of stdout.split("\n")) {
    if (!line) continue;
    const status = line.slice(0, 2);
    const rest = line.slice(3);
    // A rename is "old -> new"; only the destination still exists on disk.
    const filePath = rest.includes(" -> ") ? rest.split(" -> ")[1] : rest;
    if (status.includes("D")) deleted.add(filePath);
    else changed.push(filePath);
  }
  return { changed, deleted };
}

async function hashFile(root: string, relPath: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(path.join(root, relPath));
    return crypto.createHash("sha256").update(buf).digest("hex");
  } catch {
    return null; // vanished between `git status` and the read — treated as absent.
  }
}

/**
 * Content signature of the worktree at `root`. Throws if `root` is not a git
 * checkout — every task worktree is one (see `git-service.ts`), so the
 * caller (`code-inspector.ts`) treats a throw here as "cannot use the
 * persistent cache for this repo", falling back to a full `analyzeRepo`.
 */
export async function gitContentSignature(root: string): Promise<ContentSignature> {
  const [lsFiles, status] = await Promise.all([
    execFileAsync("git", ["ls-files", "-s"], {
      cwd: root,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: GIT_MAX_BUFFER_BYTES,
    }),
    execFileAsync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
      cwd: root,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: GIT_MAX_BUFFER_BYTES,
    }),
  ]);

  const base = parseLsFilesS(lsFiles.stdout);
  const { changed, deleted } = parseDirtyPaths(status.stdout);
  for (const d of deleted) base.delete(d);

  const rehashed = await Promise.all(
    changed
      .filter((p) => !deleted.has(p))
      .map(async (p) => ({ path: p, hash: await hashFile(root, p) })),
  );
  for (const { path: p, hash } of rehashed) {
    if (hash === null) base.delete(p);
    else base.set(p, hash);
  }

  const files = [...base.entries()]
    .map(([p, hash]) => ({ path: p, hash }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const joined = files.map((f) => `${f.path}\0${f.hash}`).join("\n");
  const signature = crypto.createHash("sha256").update(joined).digest("hex");

  return { files, signature };
}
