/**
 * SONDA DEL FRENTE P8 (Ola P) — el p95 REAL de fan-in/fan-out sobre el grafo
 * de HOY, con la misma receta que el docstring de `god-component.ts` declara
 * (proyección `file`, sólo aristas `declared`/`resolved`, sin `contains`).
 *
 * Existe porque el piso 8/8 del detector se midió contra un grafo que ya no
 * existe: la Ola O sacó del resolvedor las aristas de `decl-name` (30 % de las
 * `references` en rubocop, 31 % en eslint) y nadie volvió a derivar el piso.
 *
 * Uso: npx tsx scripts/p8-medir-p95.mts <dump.json> [...]
 */
import { readFileSync } from "node:fs";

import { pagerank } from "../src/server/services/graph/metrics/pagerank.js";
import { projectGraph } from "../src/server/services/graph/metrics/projection.js";
import { createBudget } from "../src/server/services/graph/metrics/budget.js";
import type { CodeGraph, EdgeKind } from "../src/server/services/graph/types.js";

const DEP_KINDS: readonly EdgeKind[] = [
  "references",
  "calls",
  "extends",
  "implements",
  "mixes-in",
  "instantiates",
  "imports",
  "satisfies",
  "carries",
  "invokes-indirect",
];

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i]!;
}

const allIn: number[] = [];
const allOut: number[] = [];
for (const file of process.argv.slice(2)) {
  const d = JSON.parse(readFileSync(file, "utf8")) as {
    slug: string;
    files: { path: string }[];
    resolution: CodeGraph["resolution"];
    nodes: CodeGraph["nodes"];
    edges: CodeGraph["edges"];
  };
  const graph: CodeGraph = { nodes: d.nodes, edges: d.edges, resolution: d.resolution };
  const trusted: CodeGraph = {
    ...graph,
    edges: graph.edges.filter((e) => e.provenance !== "inferred" && e.provenance !== "ambiguous"),
  };
  const known = new Set(d.files.map((f) => f.path));
  for (const [label, kinds] of [
    ["hoy", pagerank.edgeKinds],
    ["full", DEP_KINDS],
  ] as const) {
    const pr = pagerank.compute(projectGraph(trusted, "file", kinds), { budget: createBudget() }).values!;
    const ins: number[] = [];
    const outs: number[] = [];
    for (const [id, v] of pr) {
      if (!id.startsWith("file:") || !known.has(id.slice(5))) continue;
      ins.push(v.fanIn);
      outs.push(v.fanOut);
    }
    ins.sort((a, b) => a - b);
    outs.sort((a, b) => a - b);
    if (label === "full") {
      allIn.push(...ins);
      allOut.push(...outs);
    }
    console.log(
      `${d.slug.padEnd(16)} ${label.padEnd(5)} N=${String(ins.length).padStart(5)} ` +
        `fanIn p90=${pct(ins, 90)} p95=${pct(ins, 95)} p99=${pct(ins, 99)} max=${ins[ins.length - 1]} | ` +
        `fanOut p90=${pct(outs, 90)} p95=${pct(outs, 95)} p99=${pct(outs, 99)} max=${outs[outs.length - 1]}`,
    );
  }
}
allIn.sort((a, b) => a - b);
allOut.sort((a, b) => a - b);
console.log(
  `CORPUS  full  N=${allIn.length} fanIn p90=${pct(allIn, 90)} p95=${pct(allIn, 95)} p99=${pct(allIn, 99)} | ` +
    `fanOut p90=${pct(allOut, 90)} p95=${pct(allOut, 95)} p99=${pct(allOut, 99)}`,
);
