/**
 * Medición puntual de A6/CONTRATO-F9.md §4.4 — volumen de aristas
 * `provenance: "ambiguous"` por repo, ANTES de fijar `AMBIGUOUS_MAX_TARGETS`.
 * Reusa el mismo pipeline que `measure-cascade.mts` (mismo motivo de vivir
 * fuera de `src/`: un repo, una gramática, por proceso). Throwaway: no se
 * commitea, se corre y se borra.
 *
 * Uso: npx tsx scripts/measure-ambiguous.mts <dir> <language-id>[,<language-id>...]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import { deriveNodeSets, type ProbeNode } from "../src/server/services/code-grammar.js";
import type { AstNode } from "../src/server/services/detect/types.js";
import { extractReferences } from "../src/server/services/graph/references.js";
import { extractSymbols } from "../src/server/services/graph/symbols.js";
import { ALL_STAGES, resolveReferences } from "../src/server/services/graph/resolve.js";
import { buildCandidates, buildResolutionContext, type GraphFileFacts } from "../src/server/services/graph/build.js";
import { collectFiles, LANGUAGE_DECLS, type LanguageDecl } from "../src/server/services/code-analyzer.js";

const require = createRequire(import.meta.url);
/* eslint-disable @typescript-eslint/no-explicit-any */
let runtime: Promise<{ Parser: any; Language: any }> | null = null;
async function loadRuntime() {
  runtime ??= (async () => {
    const mod = require("web-tree-sitter") as any;
    const Parser = mod.Parser ?? mod.default ?? mod;
    await Parser.init();
    const Language = Parser.Language ?? mod.Language;
    return { Parser, Language };
  })();
  return runtime;
}
async function loadParserFor(decl: LanguageDecl) {
  const { Parser, Language } = await loadRuntime();
  const wasmDir = path.dirname(require.resolve("tree-sitter-wasms/package.json"));
  const language = await Language.load(path.join(wasmDir, "out", decl.wasm));
  const p = new Parser();
  p.setLanguage(language);
  return p;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function buildGraphFileFacts(rootDir: string, decl: LanguageDecl, parser: any): Promise<GraphFileFacts[]> {
  const probeRoot = parser.parse(decl.probeSource).rootNode as unknown as ProbeNode;
  const sets = deriveNodeSets(probeRoot);
  const scanned = await collectFiles(rootDir);
  const extSet = new Set(decl.extensions);
  const files: GraphFileFacts[] = [];
  for (const sf of scanned) {
    const ext = path.extname(sf.path).toLowerCase();
    if (!extSet.has(ext)) continue;
    const abs = path.join(rootDir, sf.path);
    let src: string;
    try {
      src = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    if (decl.extractScript) {
      const extracted = decl.extractScript(src);
      if (extracted == null) continue;
      src = extracted;
    }
    const root = parser.parse(src).rootNode as unknown as AstNode;
    files.push({ path: sf.path, language: decl.id, symbols: extractSymbols(root, sets), references: extractReferences(root, sets) });
  }
  return files;
}

async function main(): Promise<void> {
  const [, , dir, languageIds] = process.argv;
  if (!dir || !languageIds) {
    console.error("Uso: npx tsx scripts/measure-ambiguous.mts <dir> <language-id>[,<language-id>...]");
    process.exit(1);
  }
  const ids = languageIds.split(",").map((s) => s.trim());
  const decls = ids.map((id) => {
    const d = LANGUAGE_DECLS.find((x) => x.id === id);
    if (!d) throw new Error(`language-id desconocido: ${id}`);
    return d;
  });
  const rootDir = path.resolve(dir);
  const files: GraphFileFacts[] = [];
  for (const decl of decls) {
    const parser = await loadParserFor(decl);
    files.push(...(await buildGraphFileFacts(rootDir, decl, parser)));
  }
  const t0 = performance.now();
  const ctx = buildResolutionContext(files);
  const candidates = buildCandidates(files, undefined);
  const { stats, edges } = resolveReferences(ALL_STAGES, candidates, ctx);
  const elapsedMs = performance.now() - t0;

  const ambiguousEdgesEmitted = edges.filter((e) => e.provenance === "ambiguous").length;
  const pctOfResolved = stats.resolved > 0 ? (100 * (stats.ambiguousEdges ?? 0)) / stats.resolved : 0;
  console.log(
    JSON.stringify(
      {
        repo: path.basename(rootDir),
        languageIds,
        files: files.length,
        candidates: stats.candidates,
        resolved: stats.resolved,
        droppedAmbiguous: stats.droppedAmbiguous,
        unresolved: stats.unresolved,
        ambiguousEdges: stats.ambiguousEdges,
        ambiguousEdgesEmittedCheck: ambiguousEdgesEmitted,
        ambiguousOverflow: stats.ambiguousOverflow,
        pctAmbiguousOfResolved: Number(pctOfResolved.toFixed(2)),
        unresolvedByFileCount: (stats.unresolvedByFile ?? []).length,
        totalEdgesEmitted: edges.length,
        resolveMs: Number(elapsedMs.toFixed(0)),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
