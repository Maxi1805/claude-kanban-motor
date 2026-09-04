/**
 * Mide la Forma 4 (`graph/edges/invocacion-indirecta.ts#extractIterationCallFacts`,
 * CONTRATO-F9.md §3.3 punto 4, Ola 11 §C1) sobre UN repo real — mismo patrón
 * que `scripts/measure-carries.mts` (léase ese docstring primero): `graph/
 * build.ts` no parsea nada, así que quien quiera correr `buildGraph` sobre un
 * repo real tiene que parsear y extraer él mismo.
 *
 * DIVERGENCIA DELIBERADA de `measure-carries.mts`: `code-analyzer.ts` (otro
 * dueño, registro de pendientes Problema 1) todavía no llama
 * `extractIterationCallFacts` ni arma `GraphFileFacts.loops` — así que este
 * script la corre él mismo y la ADJUNTA a cada `GraphFileFacts` antes de
 * pasarlo a `buildGraph`. `FileReferences.loops` es un campo OPCIONAL
 * (`invocacion-indirecta.ts`), así que `GraphFileFacts` (que no lo declara)
 * sigue siendo estructuralmente válido — no hace falta tocar `build.ts` ni
 * `code-analyzer.ts` para medir esto.
 *
 * UN repo por proceso, nunca dos pesados en simultáneo, guava sola — regla
 * de memoria de la ola, igual que el resto de `scripts/*.mts`.
 *
 * Uso:
 *   npx tsx scripts/measure-forma4.mts <dir> <language-id>[,<language-id>...] [salida.json]
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
import { extractIterationCallFacts, type IterationLoopFact } from "../src/server/services/graph/edges/invocacion-indirecta.js";
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

type GraphFileFactsWithLoops = GraphFileFacts & { readonly loops: readonly IterationLoopFact[] };

async function buildGraphFileFacts(
  rootDir: string,
  decl: LanguageDecl,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parser: any,
): Promise<GraphFileFactsWithLoops[]> {
  const probeRoot = parser.parse(decl.probeSource).rootNode as unknown as ProbeNode;
  const sets = deriveNodeSets(probeRoot);
  const scanned = await collectFiles(rootDir);
  const extSet = new Set(decl.extensions);
  const files: GraphFileFactsWithLoops[] = [];
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
      loops: extractIterationCallFacts(root, sets),
    });
  }
  return files;
}

async function main(): Promise<void> {
  const [, , dir, languageIds, outPath] = process.argv;
  if (!dir || !languageIds) {
    console.error("Uso: npx tsx scripts/measure-forma4.mts <dir> <language-id>[,<language-id>...] [salida.json]");
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
  const files: GraphFileFactsWithLoops[] = [];
  for (const decl of decls) {
    const parser = await loadParserFor(decl);
    files.push(...(await buildGraphFileFacts(rootDir, decl, parser)));
  }
  if (files.length === 0) {
    console.error(`0 archivos "${languageIds}" bajo ${rootDir} — nada que medir.`);
    process.exit(1);
  }

  const totalLoops = files.reduce((n, f) => n + f.loops.length, 0);
  const loopsWithCollection = files.reduce((n, f) => n + f.loops.filter((l) => l.collection !== null).length, 0);

  const graph = buildGraph(files);
  const elapsedMs = performance.now() - t0;

  const carries = graph.edges.filter((e) => e.kind === "carries");
  const invokesIndirect = graph.edges.filter((e) => e.kind === "invokes-indirect");

  // Distinguir cuántas `invokes-indirect` son Forma 4 (van a un portador con
  // symbolPath que coincide con alguno de los `loops.collection.name`) vs
  // Forma 3a (todas las demás) — aproximado por el propio nodo destino, ya
  // que el grafo no etiqueta la forma en la arista misma.
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const forma4CarrierIds = new Set<string>();
  for (const f of files) {
    for (const loop of f.loops) {
      if (!loop.collection) continue;
      const owner = loop.collection.ownerIsEnclosingClass ? loop.classPath : loop.containerPath;
      if (!owner || owner.length === 0) continue;
      // mismo criterio de id que `portadorCarrierId` — no se importa para no acoplar el script a un símbolo interno más de lo necesario.
      forma4CarrierIds.add(`carrier:${f.path}#${[...owner, loop.collection.name].join(".")}@0`);
    }
  }
  const forma4Edges = invokesIndirect.filter((e) => forma4CarrierIds.has(e.to));

  const sampleForma4 = forma4Edges.slice(0, 15).map((e) => {
    const to = nodeById.get(e.to);
    return { from: e.from, to: e.to, symbolPath: to?.symbolPath, carrierForm: to?.carrierForm, weight: e.weight };
  });

  const result = {
    slug: path.basename(rootDir),
    languages: languageIds,
    files: files.length,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    loopsFound: totalLoops,
    loopsWithAnchorableCollection: loopsWithCollection,
    carries: { total: carries.length },
    invokesIndirect: { total: invokesIndirect.length, forma4: forma4Edges.length, forma3a: invokesIndirect.length - forma4Edges.length },
    sampleForma4,
    elapsedMs: Math.round(elapsedMs),
  };

  console.log(JSON.stringify(result, null, 2));
  if (outPath) await fsp.writeFile(outPath, JSON.stringify(result, null, 2), "utf8");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
