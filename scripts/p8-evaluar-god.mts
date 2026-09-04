/**
 * SONDA DEL FRENTE P8 (Ola P) — evalúa variantes de la definición de
 * `god-component` contra (a) el volumen por lenguaje y (b) los veredictos
 * juzgados a mano, sin re-analizar ningún repo.
 *
 * Uso: npx tsx scripts/p8-evaluar-god.mts <dump.json> [...]
 */
import { readFileSync, readdirSync } from "node:fs";

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

const verdicts: Record<string, string> = {}; // `${slug}|${file}` -> verdict
for (const f of readdirSync("tests/golden/precision")) {
  if (!f.endsWith(".verdicts.csv")) continue;
  for (const r of parseCsv(readFileSync(`tests/golden/precision/${f}`, "utf8"))) {
    if (r.kind === "god-component" && r.verdict) verdicts[`${r.slug}|${r.file}`] = r.verdict!;
  }
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

const MIN_N_FOR_P95 = 20;
const RATIO = Number(process.env.P8_RATIO ?? "4");

interface Row {
  slug: string;
  file: string;
  lang: string;
  fanIn: number;
  fanOut: number;
  ratio: number;
  behavior: boolean;
}

const variants: Record<string, Row[]> = {
  hoy: [],
  "p95-puro": [],
  "min(8,p95)": [],
  "max(8,p95)": [],
  "min-sin-filtros": [],
  "min+outlier": [],
  "min+outlier-sin-behavior": [],
};

for (const file of process.argv.slice(2)) {
  const d = JSON.parse(readFileSync(file, "utf8")) as {
    slug: string;
    files: { path: string; lines: number; language: string }[];
    resolution: CodeGraph["resolution"];
    nodes: CodeGraph["nodes"];
    edges: CodeGraph["edges"];
  };
  const graph: CodeGraph = { nodes: d.nodes, edges: d.edges, resolution: d.resolution };
  const trusted: CodeGraph = {
    ...graph,
    edges: graph.edges.filter((e) => e.provenance !== "inferred" && e.provenance !== "ambiguous"),
  };
  const langOf = new Map(d.files.map((f) => [f.path, f.language]));
  const known = new Set(d.files.map((f) => f.path));
  const hasBehavior = new Set<string>();
  for (const n of d.nodes) if (n.kind === "symbol" && n.family === "function-like") hasBehavior.add(n.file);

  const prHoy = pagerank.compute(projectGraph(trusted, "file", pagerank.edgeKinds), { budget: createBudget() }).values!;
  const prNew = pagerank.compute(projectGraph(trusted, "file", DEP_KINDS), { budget: createBudget() }).values!;

  const ins: number[] = [];
  const outs: number[] = [];
  for (const [id, v] of prNew) {
    if (!id.startsWith("file:") || !known.has(id.slice(5))) continue;
    ins.push(v.fanIn);
    outs.push(v.fanOut);
  }
  ins.sort((a, b) => a - b);
  outs.sort((a, b) => a - b);
  const n = ins.length;
  const inFloor = n >= MIN_N_FOR_P95 ? pct(ins, 95) : 8;
  const outFloor = n >= MIN_N_FOR_P95 ? pct(outs, 95) : 8;

  for (const [label, pr, fi, fo, filtros] of [
    ["hoy", prHoy, 8, 8, false as boolean | "solo-ratio"],
    ["p95-puro", prNew, inFloor, outFloor, true],
    ["min(8,p95)", prNew, Math.min(8, inFloor), Math.min(8, outFloor), true],
    ["max(8,p95)", prNew, Math.max(8, inFloor), Math.max(8, outFloor), true],
    ["min-sin-filtros", prNew, Math.min(8, inFloor), Math.min(8, outFloor), false],
    ["min+outlier", prNew, Math.min(8, inFloor), Math.min(8, outFloor), true],
    ["min+outlier-sin-behavior", prNew, Math.min(8, inFloor), Math.min(8, outFloor), "solo-ratio"],
  ] as const) {
    for (const [id, v] of pr) {
      if (!id.startsWith("file:")) continue;
      const path = id.slice(5);
      if (!known.has(path)) continue;
      if (v.fanIn < fi || v.fanOut < fo) continue;
      const ratio = Math.max(v.fanIn, v.fanOut) / Math.max(1, Math.min(v.fanIn, v.fanOut));
      const behavior = hasBehavior.has(path);
      if (filtros) {
        if (ratio > RATIO) continue;
        if (filtros !== "solo-ratio" && !behavior) continue;
      }
      if (label.startsWith("min+outlier") && v.fanIn < inFloor && v.fanOut < outFloor) continue;
      variants[label]!.push({
        slug: d.slug,
        file: path,
        lang: langOf.get(path) ?? "?",
        fanIn: v.fanIn,
        fanOut: v.fanOut,
        ratio,
        behavior,
      });
    }
  }
  console.error(`${d.slug}: N=${n} pisos nuevos in=${inFloor} out=${outFloor}`);
}

for (const [label, rows] of Object.entries(variants)) {
  const byLang = new Map<string, number>();
  const bySlug = new Map<string, number>();
  for (const r of rows) {
    byLang.set(r.lang, (byLang.get(r.lang) ?? 0) + 1);
    bySlug.set(r.slug, (bySlug.get(r.slug) ?? 0) + 1);
  }
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
    `\n[${label}] total=${rows.length} | juzgados: verdaderos vivos=${v} falsos vivos=${f} | ` +
      `por lenguaje: ${[...byLang.entries()].sort((a, b) => b[1] - a[1]).map(([l, c]) => `${l}=${c}`).join(" ")}`,
  );
  console.log(`   por repo: ${[...bySlug.entries()].sort((a, b) => b[1] - a[1]).map(([s, c]) => `${s}=${c}`).join(" ")}`);
  console.log(`   verdaderos NO emitidos: ${perdidos.join(" | ")}`);
}
