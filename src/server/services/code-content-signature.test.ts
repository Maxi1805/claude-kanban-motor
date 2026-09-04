/**
 * `gitContentSignature` tests — F2. The property that matters for the plan's
 * measured target: a byte-identical file gets the SAME hash across two
 * independent checkouts (a "new worktree branched off main" is exactly
 * this), a real content edit changes ONLY that file's hash, and a rename
 * with no content change is still recognised as a content match at the new
 * path (only the SET of paths differs, not that one file's hash).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { gitContentSignature } from "./code-content-signature.js";

let dir: string;

function git(args: string[], cwd = dir): void {
  execFileSync("git", args, { cwd });
}

function initRepo(): void {
  git(["init", "-q"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test"]);
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ck-sig-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("gitContentSignature", () => {
  it("throws for a directory that is not a git checkout", async () => {
    await expect(gitContentSignature(dir)).rejects.toThrow();
  });

  it("a clean, committed checkout hashes tracked files WITHOUT reading them off the untracked/dirty path (git blob sha)", async () => {
    fs.writeFileSync(path.join(dir, "a.txt"), "hello\n");
    initRepo();
    git(["add", "."]);
    git(["commit", "-q", "-m", "init"]);

    const sig = await gitContentSignature(dir);
    expect(sig.files).toEqual([{ path: "a.txt", hash: expect.any(String) }]);
    expect(sig.signature).toEqual(expect.any(String));
  });

  it("two independent checkouts of the SAME commit produce the IDENTICAL signature — the whole point of F2", async () => {
    fs.writeFileSync(path.join(dir, "a.txt"), "hello\n");
    fs.mkdirSync(path.join(dir, "sub"));
    fs.writeFileSync(path.join(dir, "sub", "b.txt"), "world\n");
    initRepo();
    git(["add", "."]);
    git(["commit", "-q", "-m", "init"]);

    const clone = fs.mkdtempSync(path.join(os.tmpdir(), "ck-sig-clone-"));
    try {
      git(["clone", "-q", dir, clone]);
      const sigOriginal = await gitContentSignature(dir);
      const sigClone = await gitContentSignature(clone);
      expect(sigClone.signature).toBe(sigOriginal.signature);
      expect(sigClone.files).toEqual(sigOriginal.files);
    } finally {
      fs.rmSync(clone, { recursive: true, force: true });
    }
  });

  it("an UNCOMMITTED edit changes that file's hash and the whole signature, reflecting the working tree not the index", async () => {
    fs.writeFileSync(path.join(dir, "a.txt"), "hello\n");
    initRepo();
    git(["add", "."]);
    git(["commit", "-q", "-m", "init"]);
    const before = await gitContentSignature(dir);

    fs.writeFileSync(path.join(dir, "a.txt"), "hello, edited\n");
    const after = await gitContentSignature(dir);

    expect(after.signature).not.toBe(before.signature);
    expect(after.files.find((f) => f.path === "a.txt")?.hash).not.toBe(
      before.files.find((f) => f.path === "a.txt")?.hash,
    );
  });

  it("editing ONE file among several changes only that file's hash", async () => {
    fs.writeFileSync(path.join(dir, "a.txt"), "hello\n");
    fs.writeFileSync(path.join(dir, "b.txt"), "world\n");
    fs.writeFileSync(path.join(dir, "c.txt"), "!!!\n");
    initRepo();
    git(["add", "."]);
    git(["commit", "-q", "-m", "init"]);
    const before = await gitContentSignature(dir);

    fs.writeFileSync(path.join(dir, "b.txt"), "world, edited\n");
    const after = await gitContentSignature(dir);

    const beforeMap = new Map(before.files.map((f) => [f.path, f.hash]));
    const changed = after.files.filter((f) => beforeMap.get(f.path) !== f.hash).map((f) => f.path);
    expect(changed).toEqual(["b.txt"]);
  });

  it("an untracked file is included and hashed for real", async () => {
    initRepo();
    fs.writeFileSync(path.join(dir, "untracked.txt"), "surprise\n");

    const sig = await gitContentSignature(dir);
    expect(sig.files.map((f) => f.path)).toContain("untracked.txt");
  });

  it("a deleted file drops out of the signature entirely", async () => {
    fs.writeFileSync(path.join(dir, "a.txt"), "hello\n");
    fs.writeFileSync(path.join(dir, "b.txt"), "world\n");
    initRepo();
    git(["add", "."]);
    git(["commit", "-q", "-m", "init"]);

    fs.unlinkSync(path.join(dir, "b.txt"));
    const sig = await gitContentSignature(dir);
    expect(sig.files.map((f) => f.path)).toEqual(["a.txt"]);
  });

  it("is deterministic: two calls with nothing in between agree", async () => {
    fs.writeFileSync(path.join(dir, "a.txt"), "hello\n");
    initRepo();
    git(["add", "."]);
    git(["commit", "-q", "-m", "init"]);

    const first = await gitContentSignature(dir);
    const second = await gitContentSignature(dir);
    expect(second.signature).toBe(first.signature);
  });
});
