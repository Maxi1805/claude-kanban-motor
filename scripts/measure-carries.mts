/**
 * Mide la relación mediada por un valor (CONTRATO-F9.md §3.3: `carries` /
 * `invokes-indirect`) sobre UN repo real — mismo patrón y mismas reglas de
 * proceso que `scripts/measure-cascade.mts` (léase ese docstring primero):
 * `graph/build.ts` no parsea nada, así que quien quiera correr `buildGraph`
 * sobre un repo real tiene que parsear y extraer él mismo — acá se agrega
 * `extractCarrierFacts` (forma 2) a la lista de `extractSymbols`/
 * `extractReferences` que `measure-cascade.mts` ya hacía. `carries-derive.ts`
 * (forma 1/5) e `invocacion-indirecta.ts` (forma 3a) las agrega `buildGraph`
 * él mismo — este script sólo TALLA lo que ya salió de ahí.
 *
 * UN repo por proceso, nunca dos pesados en simultáneo, guava sola —
 * regla de memoria de la ola, igual que el resto de `scripts/*.mts`.
 *
 * Uso:
 *   npx tsx scripts/measure-carries.mts <dir> <language-id>[,<language-id>...] [salida.json]
 */
import { createRequire } from "node:module";
import { promises as fsp } from "node:fs";
import fs from "node:fs";
import path from "node:path";

import { deriveNodeSets, type ProbeNode } from "../src/server/services/code-grammar.js";
import type { AstNode } from "../src/server/services/detect/types.js";
import { extractReferences } from "../src/server/services/graph/references.js";
import { extractSymbols } from "../src/server/services/graph/symbols.js";
import { extractCarrierFacts } from "../src/server/services/graph/edges/portador.js";
import { buildGraph, type GraphFileFacts } from "../src/server/services/graph/build.js";
import { collectFiles, LANGUAGE_DECLS, type LanguageDecl } from "../src/server/services/code-analyzer.js";

const require = createRequire(import.meta.url);

/* eslint-disable @typescript-eslint/no-explicit-any */
let runtime: Promise<{ Parser: any; Language: any }> | null = null;
async function loadRuntime(): Promise<{ Parser: any; Language: any }> {
  runtime ??= (async () => {
    const mod = require("web-tree-sitter") as any;
    const Parser = mod.Parser ?? mod.default ?? mod;
    await Parser.init();
    const Language = Parser.Language ?? mod.Language;
    return { Parser, Language };
  })();
  return runtime;
}
async function loadParserFor(decl: LanguageDecl): Promise<any> {
  const { Parser, Language } = await loadRuntime();
  const wasmDir = path.dirname(require.resolve("tree-sitter-wasms/package.json"));
  const language = await Language.load(path.join(wasmDir, "out", decl.wasm));
  const p = new Parser();
  p.setLanguage(language);
  return p;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function buildGraphFileFacts(
  rootDir: string,
  decl: LanguageDecl,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parser: any,
): Promise<GraphFileFacts[]> {
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
    files.push({
      path: sf.path,
      language: decl.id,
      symbols: extractSymbols(root, sets),
      references: extractReferences(root, sets),
      carrierFacts: extractCarrierFacts(root, sets),
    });
  }
  return files;
}

async function main(): Promise<void> {
  const [, , dir, languageIds, outPath] = process.argv;
  if (!dir || !languageIds) {
    console.error("Uso: npx tsx scripts/measure-carries.mts <dir> <language-id>[,<language-id>...] [salida.json]");
    process.exit(1);
  }
  const ids = languageIds.split(",").map((s) => s.trim());
  const decls: LanguageDecl[] = [];
  for (const id of ids) {
    const decl = LANGUAGE_DECLS.find((d) => d.id === id);
    if (!decl) {
      console.error(`language-id desconocido: "${id}". Válidos: ${LANGUAGE_DECLS.map((d) => d.id).join(", ")}`);
      process.exit(1);
    }
    decls.push(decl);
  }

  const rootDir = path.resolve(dir);
  const t0 = performance.now();
  const files: GraphFileFacts[] = [];
  for (const decl of decls) {
    const parser = await loadParserFor(decl);
    files.push(...(await buildGraphFileFacts(rootDir, decl, parser)));
  }
  if (files.length === 0) {
    console.error(`0 archivos "${languageIds}" bajo ${rootDir} — nada que medir.`);
    process.exit(1);
  }

  const graph = buildGraph(files);
  const elapsedMs = performance.now() - t0;

  const carries = graph.edges.filter((e) => e.kind === "carries");
  const invokesIndirect = graph.edges.filter((e) => e.kind === "invokes-indirect");
  const carrierNodes = graph.nodes.filter((n) => n.kind === "carrier");
  const carrierFormCounts: Record<string, number> = {};
  for (const n of carrierNodes) {
    const form = n.carrierForm ?? "sin-forma";
    carrierFormCounts[form] = (carrierFormCounts[form] ?? 0) + 1;
  }
  const carriesByProvenance: Record<string, number> = {};
  for (const e of carries) carriesByProvenance[e.provenance] = (carriesByProvenance[e.provenance] ?? 0) + 1;

  const fanIn = new Map<string, number>();
  for (const e of carries) fanIn.set(e.to, (fanIn.get(e.to) ?? 0) + 1);
  const observerCandidates = [...fanIn.entries()].filter(([, n]) => n >= 2);

  const sampleCarries = carries.slice(0, 5).map((e) => ({ from: e.from, to: e.to, provenance: e.provenance }));
  const sampleIndirect = invokesIndirect.slice(0, 5).map((e) => ({ from: e.from, to: e.to }));

  const result = {
    slug: path.basename(rootDir),
    languages: languageIds,
    files: files.length,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    carries: { total: carries.length, byProvenance: carriesByProvenance },
    invokesIndirect: { total: invokesIndirect.length },
    carrierNodes: { total: carrierNodes.length, byForm: carrierFormCounts },
    observerCandidates: observerCandidates.length,
    sampleCarries,
    sampleIndirect,
    wallMs: Math.round(elapsedMs),
  };

  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (outPath) {
    await fsp.mkdir(path.dirname(path.resolve(outPath)), { recursive: true });
    await fsp.writeFile(outPath, text, "utf8");
    console.error(`${result.slug}: carries=${carries.length} invokes-indirect=${invokesIndirect.length} carrierNodes=${carrierNodes.length} pared=${Math.round(elapsedMs)}ms -> ${outPath}`);
  } else {
    process.stdout.write(text);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
