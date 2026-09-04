/**
 * Sonda P7 — reproduce `buildParallelHierarchiesFindings` (con el arreglo de
 * esta ola) sobre un volcado de grafo YA HECHO por otro frente
 * (`p8-dump-grafo.mts`, mismo esquema), sin re-pagar `analyzeRepo` ni el
 * semáforo. Importa la función REAL del detector (no una reimplementación) —
 * a diferencia de `p7-probe-parallel.mts`, que sondeaba el algoritmo viejo a
 * mano antes del arreglo.
 *
 * Uso: npx tsx scripts/p7-offline-from-dump.mts <volcado.json>
 */
import { readFileSync } from "node:fs";

import { buildParallelHierarchiesFindings } from "../src/server/services/detect/inter-file/parallel-hierarchies.js";
import { pisoDeclarado, presencia, resolveThreshold } from "../src/server/services/detect/thresholds.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";
import type { RepoUnit } from "../src/server/services/detect/types.js";

const RESOLVE_INPUT = { language: "*", sampleSize: () => 0, corpusP95: () => null };

const [, , dumpFile] = process.argv;
if (!dumpFile) {
  console.error("Uso: npx tsx scripts/p7-offline-from-dump.mts <volcado.json>");
  process.exit(1);
}

const dump = JSON.parse(readFileSync(dumpFile, "utf8")) as {
  slug: string;
  files: { path: string; lines: number; language: string }[];
  resolution: CodeGraph["resolution"];
  nodes: CodeGraph["nodes"];
  edges: CodeGraph["edges"];
};

const graph: CodeGraph = { nodes: dump.nodes, edges: dump.edges, resolution: dump.resolution };
const repo: RepoUnit = { repoName: dump.slug, files: dump.files, functions: [], clones: [], graph };

const minHierarchySize = resolveThreshold(pisoDeclarado(3, { rationale: "sonda" }), RESOLVE_INPUT);
const minGroupSize = resolveThreshold(presencia({ rationale: "sonda" }), RESOLVE_INPUT);

const findings = buildParallelHierarchiesFindings(repo, graph, minHierarchySize, minGroupSize);
const langOf = new Map(dump.files.map((f) => [f.path, f.language] as const));
const byLang = new Map<string, number>();
for (const f of findings) {
  const files = new Set(f.locations.map((l) => l.file));
  for (const file of files) {
    const lang = langOf.get(file) ?? "?";
    byLang.set(lang, (byLang.get(lang) ?? 0) + 1);
  }
}
console.log(`[${dump.slug}] parallel-hierarchies: ${findings.length} hallazgos`);
for (const [lang, n] of [...byLang.entries()].sort()) console.log(`    ${lang} = ${n} (volumen tipo censo)`);
for (const f of findings.slice(0, 40)) {
  console.log(`  - ${f.title} :: ${f.locations.map((l) => l.file).join(" | ")}`);
}
