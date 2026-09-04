/**
 * SONDA DEL FRENTE F1 (Ola Q) — volcado compacto del grafo de producción para
 * iterar el diseño OFFLINE sin re-pagar `analyzeRepo` por variante.
 *
 * HUELLA DEL GRAFO: el JSON lleva `generatedAt` + conteos. Un volcado SE
 * VENCE: sirve para aislar un DELTA de diseño, nunca para publicar un
 * absoluto de cierre (ver CONTEXTO.md §4).
 *
 * Uso: npx tsx scripts/q1-dump-grafo.mts <dir> <slug> <salida.json>
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";

const [, , dir, slug, outFile] = process.argv;
if (!dir || !slug || !outFile) {
  console.error("uso: npx tsx scripts/q1-dump-grafo.mts <dir> <slug> <salida.json>");
  process.exit(1);
}

const state: { graph: CodeGraph | null } = { graph: null };
await analyzeRepo({
  dir: path.resolve(dir),
  repoName: slug,
  limits: { maxFindings: "unlimited" },
  onGraph: (r) => {
    state.graph = r.graph;
  },
});

const graph = state.graph;
if (!graph) {
  console.error("sin grafo");
  process.exit(1);
}

const nodes = graph.nodes
  .filter((n) => n.kind === "symbol")
  .map((n) => ({
    i: n.id,
    f: n.file,
    p: n.symbolPath,
    m: n.family,
    s: n.startLine ?? null,
    e: n.endLine ?? null,
    a: n.arity ?? null,
  }));
const edges = graph.edges.map((e) => ({ f: e.from, t: e.to, k: e.kind, p: e.provenance }));

await fs.writeFile(
  outFile,
  JSON.stringify({ slug, generatedAt: new Date().toISOString(), nodes: nodes.length, edges: edges.length, n: nodes, e: edges }),
);
console.log(`${slug}: ${nodes.length} nodos symbol · ${graph.edges.length} aristas → ${outFile}`);
