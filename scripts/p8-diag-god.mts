/**
 * SONDA DEL FRENTE P8 (Ola P) — diagnóstico de recall de `god-component`.
 *
 * Imprime fan-in/fan-out de archivos concretos bajo VARIAS definiciones de
 * "arista de dependencia", para ver cuánta señal tira hoy la lista de kinds
 * de `pagerank.edgeKinds` frente a la que el grafo tiene.
 *
 * Uso: npx tsx scripts/p8-diag-god.mts <dump.json> <archivo> [...archivos]
 */
import { readFileSync } from "node:fs";

import { pagerank } from "../src/server/services/graph/metrics/pagerank.js";
import { projectGraph } from "../src/server/services/graph/metrics/projection.js";
import { createBudget } from "../src/server/services/graph/metrics/budget.js";
import type { CodeGraph, EdgeKind } from "../src/server/services/graph/types.js";

const [, , file, ...targets] = process.argv;
const dump = JSON.parse(readFileSync(file!, "utf8")) as {
  slug: string;
  files: { path: string; lines: number; language: string }[];
  resolution: CodeGraph["resolution"];
  nodes: CodeGraph["nodes"];
  edges: CodeGraph["edges"];
};
const graph: CodeGraph = { nodes: dump.nodes, edges: dump.edges, resolution: dump.resolution };
const known = new Set(dump.files.map((f) => f.path));

const KIND_SETS: Record<string, readonly EdgeKind[]> = {
  hoy: pagerank.edgeKinds,
  "hoy+calls": [...pagerank.edgeKinds, "calls"],
  "hoy+calls+indirect": [...pagerank.edgeKinds, "calls", "invokes-indirect"],
  "todas-menos-contains-affects": [
    "references",
    "extends",
    "implements",
    "mixes-in",
    "instantiates",
    "imports",
    "satisfies",
    "calls",
    "carries",
    "invokes-indirect",
  ],
};

const trusted: CodeGraph = {
  ...graph,
  edges: graph.edges.filter((e) => e.provenance !== "inferred" && e.provenance !== "ambiguous"),
};

for (const [name, kinds] of Object.entries(KIND_SETS)) {
  const projected = projectGraph(trusted, "file", kinds);
  const r = pagerank.compute(projected, { budget: createBudget() });
  if (r.status !== "computed" || !r.values) {
    console.log(`${name}: sin cómputo (${r.status})`);
    continue;
  }
  const vals = r.values;
  let over = 0;
  for (const [id, v] of vals) {
    if (!id.startsWith("file:") || !known.has(id.slice(5))) continue;
    if (v.fanIn >= 8 && v.fanOut >= 8) over++;
  }
  const parts = targets.map((t) => {
    const v = vals.get(`file:${t}`);
    return `${t.split("/").pop()}=${v ? `in${v.fanIn}/out${v.fanOut}` : "AUSENTE"}`;
  });
  console.log(`${dump.slug} ${name.padEnd(30)} candidatos(8/8)=${String(over).padStart(4)} ${parts.join(" ")}`);
}

const byKey = new Map<string, number>();
for (const e of graph.edges) {
  const k = `${e.kind}/${e.provenance}`;
  byKey.set(k, (byKey.get(k) ?? 0) + 1);
}
console.log(
  `${dump.slug} aristas por kind/provenance: ` +
    [...byKey.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}=${n}`).join(" "),
);
