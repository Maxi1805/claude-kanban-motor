/**
 * SONDA DEL FRENTE N1 (Ola O) — vuelca el `CodeGraph` crudo de un repo a JSON
 * para poder ITERAR el diseño del detector sin re-pagar `analyzeRepo` por cada
 * variante de regla (guava tarda 6,5 minutos por corrida).
 *
 * Sólo los campos que `unused-symbol` mira: nodos `symbol` con familia/línea/
 * visibilidad, y TODAS las aristas con `kind`/`provenance`/`weight`/`roles`/
 * `alternatives`. Pipeline de producción real (`analyzeRepo` + `onGraph`).
 *
 * Uso: npx tsx scripts/n1-dump-grafo.mts <dir> <slug> <salida.json>
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";

const [, , dir, slug, outFile] = process.argv;
if (!dir || !slug || !outFile) {
  console.error("uso: npx tsx scripts/n1-dump-grafo.mts <dir> <slug> <salida.json>");
  process.exit(1);
}

const state: { graph: CodeGraph | null } = { graph: null };
const analysis = await analyzeRepo({
  dir: path.resolve(dir),
  repoName: slug,
  limits: { maxFindings: "unlimited" },
  onGraph: (r) => {
    state.graph = r.graph;
  },
});
if (!state.graph) {
  console.error(`[n1-grafo] ${slug}: sin grafo.`);
  process.exit(1);
}

const out = {
  slug,
  files: analysis.files.map((f) => ({ path: f.path, lines: f.lines, language: f.language })),
  nodes: state.graph.nodes.map((n) => ({
    id: n.id,
    kind: n.kind,
    file: n.file,
    symbolPath: n.symbolPath,
    family: n.family,
    startLine: n.startLine,
    endLine: n.endLine,
    visibility: n.visibility,
    arity: n.arity,
  })),
  edges: state.graph.edges.map((e) => ({
    from: e.from,
    to: e.to,
    kind: e.kind,
    provenance: e.provenance,
    weight: e.weight,
    roles: e.roles,
    alternatives: e.alternatives,
  })),
};

await fs.mkdir(path.dirname(path.resolve(outFile)), { recursive: true });
await fs.writeFile(path.resolve(outFile), JSON.stringify(out), "utf8");
console.error(`[n1-grafo] ${slug}: ${out.nodes.length} nodos, ${out.edges.length} aristas -> ${outFile}`);
