/**
 * SONDA DEL FRENTE P8 (Ola P) — cruza los veredictos juzgados a mano de los
 * tres kinds del frente contra los números que el grafo de HOY produce, para
 * poder elegir un criterio con la evidencia a la vista en vez de a ojo.
 *
 * Uso: npx tsx scripts/p8-medir-juzgados.mts <dump.json> [...]
 */
import { readFileSync, readdirSync } from "node:fs";

import { pagerank } from "../src/server/services/graph/metrics/pagerank.js";
import { clustering } from "../src/server/services/graph/metrics/agrupamiento.js";
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

interface Verdict {
  slug: string;
  kind: string;
  file: string;
  verdict: string;
  title: string;
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQ = false;
      } else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const head = rows[0]!;
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

const verdicts: Verdict[] = [];
const dir = "tests/golden/precision";
for (const f of readdirSync(dir)) {
  if (!f.endsWith(".verdicts.csv")) continue;
  for (const r of parseCsv(readFileSync(`${dir}/${f}`, "utf8"))) {
    if (!r.verdict) continue;
    verdicts.push({ slug: r.slug!, kind: r.kind!, file: r.file!, verdict: r.verdict, title: r.title! });
  }
}

for (const file of process.argv.slice(2)) {
  const dump = JSON.parse(readFileSync(file, "utf8")) as {
    slug: string;
    files: { path: string; lines: number; language: string }[];
    resolution: CodeGraph["resolution"];
    nodes: CodeGraph["nodes"];
    edges: CodeGraph["edges"];
  };
  const graph: CodeGraph = { nodes: dump.nodes, edges: dump.edges, resolution: dump.resolution };
  const trusted: CodeGraph = {
    ...graph,
    edges: graph.edges.filter((e) => e.provenance !== "inferred" && e.provenance !== "ambiguous"),
  };
  const projHoy = projectGraph(trusted, "file", pagerank.edgeKinds);
  const projFull = projectGraph(trusted, "file", DEP_KINDS);
  const prHoy = pagerank.compute(projHoy, { budget: createBudget() }).values!;
  const prFull = pagerank.compute(projFull, { budget: createBudget() }).values!;
  const clFull = clustering.compute(projFull, { budget: createBudget() }).values!;

  // Fan-in por kind de arista entrante (para el discriminador "raíz de jerarquía").
  const nodeFile = new Map(dump.nodes.map((n) => [n.id, n.file] as const));
  const inByKind = new Map<string, Map<string, Set<string>>>();
  const outByKind = new Map<string, Map<string, Set<string>>>();
  for (const e of trusted.edges) {
    if (!DEP_KINDS.includes(e.kind)) continue;
    const f = nodeFile.get(e.from);
    const t = nodeFile.get(e.to);
    if (!f || !t || f === t) continue;
    const im = inByKind.get(t) ?? new Map<string, Set<string>>();
    inByKind.set(t, im);
    (im.get(e.kind) ?? im.set(e.kind, new Set()).get(e.kind)!).add(f);
    const om = outByKind.get(f) ?? new Map<string, Set<string>>();
    outByKind.set(f, om);
    (om.get(e.kind) ?? om.set(e.kind, new Set()).get(e.kind)!).add(t);
  }
  // Familias declaradas por archivo.
  const famByFile = new Map<string, Set<string>>();
  for (const n of dump.nodes) {
    if (n.kind !== "symbol") continue;
    const s = famByFile.get(n.file) ?? new Set<string>();
    famByFile.set(n.file, s);
    s.add(String(n.family));
  }

  for (const v of verdicts) {
    if (v.slug !== dump.slug) continue;
    if (v.kind !== "god-component" && v.kind !== "divergent-change") continue;
    const id = `file:${v.file}`;
    const a = prHoy.get(id);
    const b = prFull.get(id);
    const cl = clFull.get(id);
    const inK = [...(inByKind.get(v.file) ?? new Map())].map(([k, s]) => `${k}:${(s as Set<string>).size}`).join(",");
    const outK = [...(outByKind.get(v.file) ?? new Map())].map(([k, s]) => `${k}:${(s as Set<string>).size}`).join(",");
    const fams = [...(famByFile.get(v.file) ?? new Set())].sort().join("|");
    const ratio = b && b.fanIn > 0 && b.fanOut > 0 ? (Math.max(b.fanIn, b.fanOut) / Math.min(b.fanIn, b.fanOut)).toFixed(1) : "-";
    console.log(
      [
        v.kind,
        v.verdict.padEnd(8),
        dump.slug.padEnd(10),
        v.file,
        `hoy=${a ? `${a.fanIn}/${a.fanOut}` : "-"}`,
        `full=${b ? `${b.fanIn}/${b.fanOut}` : "-"}`,
        `ratio=${ratio}`,
        `clust=${cl === undefined ? "-" : cl.toFixed(3)}`,
        `in[${inK}]`,
        `out[${outK}]`,
        `fam[${fams}]`,
      ].join(" "),
    );
  }
}
