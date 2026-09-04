/**
 * N5 (Ola O) — medicion ad-hoc, NO produccion.
 *
 * Vuelca a JSON el grafo crudo + la lista de archivos (path/lines/language) de un
 * repo, para poder iterar sobre el embudo de `coupling-without-abstraction` sin
 * repagar `analyzeRepo` en cada experimento (13 frentes editando invalidan la
 * huella del cache de analisis en cada corrida).
 *
 * Uso: npx tsx scripts/probes/n5-dump-graph.mts <dir> <salida.json>
 */
import { writeFileSync } from "node:fs";

import { analyzeRepo } from "../../src/server/services/code-analyzer.js";
import type { CodeGraph } from "../../src/server/services/graph/types.js";

const [, , dir, out] = process.argv;
if (!dir || !out) {
  console.error("Uso: npx tsx scripts/probes/n5-dump-graph.mts <dir> <salida.json>");
  process.exit(1);
}

let graph: CodeGraph | null = null;
const analysis = await analyzeRepo({
  dir,
  repoName: "n5-dump",
  limits: { maxFindings: "unlimited" },
  onGraph: (r: { graph: CodeGraph }) => {
    graph = r.graph;
  },
});
if (!graph) {
  console.error("sin grafo");
  process.exit(1);
}
const g: CodeGraph = graph;

const files = analysis.files.map((f) => ({ path: f.path, lines: f.lines, language: f.language }));
const nodes = g.nodes.map((n) => ({
  id: n.id,
  kind: n.kind,
  file: n.file,
  symbolPath: n.symbolPath,
  family: n.family ?? null,
  arity: n.arity ?? null,
  visibility: n.visibility ?? null,
  startLine: n.startLine ?? null,
}));
const edges = g.edges.map((e) => ({ kind: e.kind, from: e.from, to: e.to, provenance: e.provenance }));

writeFileSync(out, JSON.stringify({ dir, files, nodes, edges }));
console.log(`${out}: ${files.length} archivos, ${nodes.length} nodos, ${edges.length} aristas`);
