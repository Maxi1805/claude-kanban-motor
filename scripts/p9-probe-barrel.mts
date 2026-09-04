/**
 * SONDA DEL FRENTE P9 (Ola P) — cómo se ve, en el grafo, un módulo de
 * RE-EXPORT puro. Corre el pipeline real (`analyzeRepo`) y vuelca, para un
 * archivo dado, sus nodos `symbol` propios y las aristas `references` que
 * salen de él, para poder decidir con qué hecho estructural (no léxico)
 * distinguir "barril" de "archivo con lógica propia".
 *
 * Uso: npx tsx scripts/p9-probe-barrel.mts <dir> <slug> <archivo1> [archivo2 ...]
 */
import path from "node:path";
import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";

const [, , dir, slug, ...targets] = process.argv;
if (!dir || !slug || targets.length === 0) {
  console.error("uso: npx tsx scripts/p9-probe-barrel.mts <dir> <slug> <archivo1> [archivo2 ...]");
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
  console.error(`[p9] ${slug}: sin grafo.`);
  process.exit(1);
}
const g: CodeGraph = graph;

const fileOf = new Map(g.nodes.map((n) => [n.id, n.file] as const));

for (const target of targets) {
  console.log(`\n=== ${target} ===`);
  const own = g.nodes.filter((n) => n.kind === "symbol" && n.file === target);
  console.log(
    `nodos symbol propios (${own.length}):`,
    own.map((n) => `${n.symbolPath.join(".")}[${n.family ?? "?"}]`),
  );
  const outEdges = g.edges.filter((e) => fileOf.get(e.from) === target);
  const byKind = new Map<string, number>();
  for (const e of outEdges) byKind.set(e.kind, (byKind.get(e.kind) ?? 0) + 1);
  console.log(`aristas SALIENTES por kind:`, Object.fromEntries(byKind));
  const refsOut = outEdges.filter((e) => e.kind === "references");
  for (const e of refsOut.slice(0, 30)) {
    console.log(`  references -> ${e.to} (provenance=${e.provenance}, weight=${e.weight}, from=${e.from})`);
  }
  const inEdges = g.edges.filter((e) => fileOf.get(e.to) === target && e.kind !== "contains");
  console.log(`aristas ENTRANTES (no contains): ${inEdges.length}`);
}
