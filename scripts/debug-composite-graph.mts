/**
 * Debug puntual (no de producto) — inspecciona el grafo real que produce
 * `analyzeRepo` sobre `tests/fixtures/patterns/composite`, para ver qué
 * aristas existen alrededor de `ShapeGroup`/`Shape`/`Invoice` antes de
 * diseñar el excluder estructural de `hypotheses/composite.ts`.
 *
 * Uso: npx tsx scripts/debug-composite-graph.mts <dir>
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";

async function main(): Promise<void> {
  const [, , dir] = process.argv;
  if (!dir) {
    console.error("Uso: npx tsx scripts/debug-composite-graph.mts <dir>");
    process.exit(1);
  }
  let graph: CodeGraph | null = null;
  await analyzeRepo({
    dir: path.resolve(dir),
    repoName: "debug-composite",
    limits: { maxFindings: "unlimited" },
    onGraph: (r) => {
      graph = r.graph;
    },
  });

  if (!graph) {
    console.log("graph null");
    return;
  }
  const g: CodeGraph = graph;
  console.log(`nodes: ${g.nodes.length}, edges: ${g.edges.length}`);
  for (const n of g.nodes) {
    if (n.kind === "symbol") {
      console.log(`NODE ${n.id} file=${n.file} family=${n.family} arity=${n.arity} vis=${n.visibility} path=${n.symbolPath.join(".")}`);
    } else if (n.kind === "carrier") {
      console.log(`CARRIER ${n.id} file=${n.file} carrierForm=${n.carrierForm} path=${n.symbolPath.join(".")}`);
    }
  }
  console.log("---edges---");
  for (const e of g.edges) {
    console.log(`${e.kind} ${e.from} -> ${e.to} prov=${e.provenance} roles=${e.roles ?? "none"} resolvedBy=${e.resolvedBy ?? ""}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
