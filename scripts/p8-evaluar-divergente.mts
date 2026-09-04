/**
 * SONDA DEL FRENTE P8 (Ola P) — variantes de `divergent-change`.
 *
 * La hipótesis a medir: una RAÍZ DE COMPOSICIÓN (el falso positivo que el
 * propio detector declara y que ningún umbral estructural sacaba) cablea sus
 * vecinos desde UN SOLO lugar del archivo — el cuerpo del módulo o un único
 * símbolo. Un archivo con razones de cambio realmente distintas las tiene
 * repartidas entre VARIOS símbolos suyos.
 *
 * Uso: npx tsx scripts/p8-evaluar-divergente.mts <dump.json> [...]
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

const verdicts: Record<string, string> = {};
for (const f of readdirSync("tests/golden/precision")) {
  if (!f.endsWith(".verdicts.csv")) continue;
  for (const r of parseCsv(readFileSync(`tests/golden/precision/${f}`, "utf8"))) {
    if (r.kind === "divergent-change" && r.verdict) verdicts[`${r.slug}|${r.file}`] = r.verdict!;
  }
}

const VARIANTS = ["hoy", "kinds-completos", "kc+reparto2", "kc+reparto3"] as const;
const emitted: Record<string, { slug: string; file: string; lang: string }[]> = Object.fromEntries(
  VARIANTS.map((v) => [v, []]),
) as never;

for (const file of process.argv.slice(2)) {
  const d = JSON.parse(readFileSync(file, "utf8")) as {
    slug: string;
    files: { path: string; lines: number; language: string }[];
    resolution: CodeGraph["resolution"];
    nodes: CodeGraph["nodes"];
    edges: CodeGraph["edges"];
  };
  const graph: CodeGraph = { nodes: d.nodes, edges: d.edges, resolution: d.resolution };
  const trusted = graph.edges.filter((e) => e.kind !== "contains" && e.provenance !== "inferred" && e.provenance !== "ambiguous");
  const langOf = new Map(d.files.map((f) => [f.path, f.language]));
  const known = new Set(d.files.map((f) => f.path));
  const nodeById = new Map(d.nodes.map((n) => [n.id, n] as const));

  // Reparto: cuántos SÍMBOLOS distintos del archivo originan sus aristas salientes
  // entre archivos (el nodo `file:` cuenta como uno solo).
  const reparto = new Map<string, Set<string>>();
  for (const e of trusted) {
    const f = nodeById.get(e.from);
    const t = nodeById.get(e.to);
    if (!f || !t || f.file === t.file) continue;
    (reparto.get(f.file) ?? reparto.set(f.file, new Set()).get(f.file)!).add(e.from);
  }

  const gTrusted: CodeGraph = { ...graph, edges: trusted };
  const projHoy = projectGraph(gTrusted, "file", pagerank.edgeKinds);
  const projNew = projectGraph(gTrusted, "file", DEP_KINDS);
  for (const [label, proj] of [
    ["hoy", projHoy],
    ["kinds-completos", projNew],
    ["kc+reparto2", projNew],
    ["kc+reparto3", projNew],
  ] as const) {
    const pr = pagerank.compute(proj, { budget: createBudget() }).values!;
    const cl = clustering.compute(proj, { budget: createBudget() }).values!;
    for (const [id, v] of pr) {
      if (!id.startsWith("file:")) continue;
      const path = id.slice(5);
      if (!known.has(path)) continue;
      if (v.fanOut < 6 || v.fanIn < 2) continue;
      const c = cl.get(id);
      if (c === undefined || c > 0.1) continue;
      const n = reparto.get(path)?.size ?? 0;
      if (label === "kc+reparto2" && n < 2) continue;
      if (label === "kc+reparto3" && n < 3) continue;
      emitted[label]!.push({ slug: d.slug, file: path, lang: langOf.get(path) ?? "?" });
    }
  }
}

for (const variant of VARIANTS) {
  const rows = emitted[variant]!;
  const byLang = new Map<string, number>();
  for (const r of rows) byLang.set(r.lang, (byLang.get(r.lang) ?? 0) + 1);
  let v = 0;
  let f = 0;
  const perdidos: string[] = [];
  for (const [k, verdict] of Object.entries(verdicts)) {
    const hit = rows.some((r) => `${r.slug}|${r.file}` === k);
    if (verdict === "verdadero") {
      if (hit) v++;
      else perdidos.push(k);
    } else if (verdict === "falso" && hit) f++;
  }
  console.log(
    `[${variant}] total=${rows.length} V=${v} F=${f} | ${[...byLang.entries()].sort((a, b) => b[1] - a[1]).map(([l, c]) => `${l}=${c}`).join(" ")} | perdidos: ${perdidos.join(", ")}`,
  );
}
