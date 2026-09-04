/**
 * Sonda T3 (Ola Q) — ¿existe ALGUNA arista entre dos archivos dados, de
 * cualquier kind/provenance? Corre el pipeline real una vez y filtra.
 * Uso: npx tsx scripts/q-t3-probe-edge-between.mts <dir> <slug> <archivoA> <archivoB>
 */
import path from "node:path";
import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";

const [, , dir, slug, fileA, fileB] = process.argv;
if (!dir || !slug || !fileA || !fileB) {
  console.error("uso: npx tsx scripts/q-t3-probe-edge-between.mts <dir> <slug> <archivoA> <archivoB>");
  process.exit(1);
}

let graph: CodeGraph | null = null;
await analyzeRepo({
  dir: path.resolve(dir),
  repoName: slug,
  limits: { maxFindings: "unlimited" },
  onGraph: (r) => {
    graph = r.graph;
  },
});
if (!graph) {
  console.error(`sin grafo`);
  process.exit(1);
}
const g: CodeGraph = graph;
const fileOf = new Map(g.nodes.map((n) => [n.id, n.file] as const));

let count = 0;
for (const e of g.edges) {
  const ff = fileOf.get(e.from);
  const ft = fileOf.get(e.to);
  if ((ff === fileA && ft === fileB) || (ff === fileB && ft === fileA)) {
    console.log(`${e.kind} (${e.provenance}) ${e.from} -> ${e.to} weight=${e.weight}`);
    count++;
  }
}
console.log(`total: ${count}`);
