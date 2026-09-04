/**
 * OLA V · V7 — precisión medida por ESTE frente sobre sus 8 patrones, misma regla de
 * vigencia que `u-int-precision-nivel2.mts` (una fila de M0/Ola-U sólo cuenta si la
 * hipótesis sigue viva HOY en la misma ubicación Y con el mismo estado), más los
 * veredictos propios de V7.json.
 *
 * Uso: npx tsx scripts/v7-precision.mts <censo-dir-con-*.json> <veredictos-v7.json>
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { parseCsv } from "../src/server/services/detect/precision/csv.js";
import { wilsonInterval } from "../src/server/services/graph/gate/wilson.js";

const TARGET_PATTERNS = new Set([
  "Composite", "Prototype", "Command", "Iterator",
  "Abstract Factory", "Chain of Responsibility", "State", "Builder",
]);
const PRECISION_DIR = path.resolve(import.meta.dirname, "..", "tests", "golden", "precision");

const [, , censoDir, veredictosPath] = process.argv;
if (!censoDir) {
  console.error("Uso: npx tsx scripts/v7-precision.mts <censo-dir> [veredictos-v7.json]");
  process.exit(1);
}

// vivos: pattern|slug|file|line -> state
const vivos = new Map<string, string>();
const allLive = new Map<string, { pattern: string; slug: string; file: string; line: number; state: string }>();
for (const f of readdirSync(censoDir).filter((f) => f.endsWith(".json"))) {
  const d = JSON.parse(readFileSync(path.join(censoDir, f), "utf8")) as { slug: string; rows: { id: string; repo: string; pattern: string; state: string; file: string; line: number }[] };
  for (const r of d.rows) {
    vivos.set(`${r.pattern}|${d.slug}|${r.file}|${r.line}`, r.state);
    allLive.set(r.id, { pattern: r.pattern, slug: d.slug, file: r.file, line: r.line, state: r.state });
  }
}

interface Veredicto { pattern: string; verdict: string; fuente: string; id: string }
const veredictos: Veredicto[] = [];
let csvTotal = 0;
let csvVencidos = 0;

for (const file of readdirSync(PRECISION_DIR).filter((f) => f.endsWith(".hypotheses.csv"))) {
  const slug = file.slice(0, file.indexOf("."));
  const { header, records } = parseCsv(readFileSync(path.join(PRECISION_DIR, file), "utf8"));
  if (header.length === 0) continue;
  const col = (name: string) => header.indexOf(name);
  for (const row of records) {
    const pattern = row[col("pattern")] ?? "";
    if (!TARGET_PATTERNS.has(pattern)) continue;
    const verdict = row[col("verdict")] ?? "";
    if (!verdict) continue;
    const id = row[col("id")] ?? "";
    const rowFile = row[col("file")] ?? "";
    const rowLine = Number(row[col("startLine")]);
    csvTotal++;
    const key = `${pattern}|${slug}|${rowFile}|${rowLine}`;
    if (vivos.get(key) !== row[col("state")]) {
      csvVencidos++;
      continue;
    }
    veredictos.push({ pattern, verdict, fuente: `csv:${slug}`, id });
  }
}

if (veredictosPath) {
  const v7 = JSON.parse(readFileSync(veredictosPath, "utf8")) as Record<string, { verdict: string; note?: string }>;
  for (const [id, j] of Object.entries(v7)) {
    const live = allLive.get(id);
    if (!live) {
      console.error(`[v7-precision] id NO VIVO en el censo actual, ignorado: ${id}`);
      continue;
    }
    veredictos.push({ pattern: live.pattern, verdict: j.verdict, fuente: "V7", id });
  }
}

const patterns = [...TARGET_PATTERNS].sort();
console.log("| Patrón | n total censo | n (V+F) csv-previo | n (V+F) V7 | n total (V+F) | V | F | precisión | Wilson 95% | problema-si-patron-no | dudoso |");
console.log("|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|");
let tV = 0, tF = 0, tP = 0, tD = 0;
const totalCenso = new Map<string, number>();
for (const [, l] of allLive) totalCenso.set(l.pattern, (totalCenso.get(l.pattern) ?? 0) + 1);

for (const p of patterns) {
  const mine = veredictos.filter((v) => v.pattern === p);
  const csvVF = mine.filter((v) => v.fuente.startsWith("csv") && (v.verdict === "verdadero" || v.verdict === "falso")).length;
  const v7VF = mine.filter((v) => v.fuente === "V7" && (v.verdict === "verdadero" || v.verdict === "falso")).length;
  const V = mine.filter((v) => v.verdict === "verdadero").length;
  const F = mine.filter((v) => v.verdict === "falso").length;
  const P = mine.filter((v) => v.verdict === "problema-si-patron-no").length;
  const D = mine.filter((v) => v.verdict === "dudoso").length;
  const n = V + F;
  const w = wilsonInterval(V, n);
  tV += V; tF += F; tP += P; tD += D;
  console.log(
    `| ${p} | ${totalCenso.get(p) ?? 0} | ${csvVF} | ${v7VF} | ${n} | ${V} | ${F} | ${n === 0 ? "—" : `${Math.round((100 * V) / n)}%`} | [${Math.round(w.lower * 100)}%, ${Math.round(w.upper * 100)}%] | ${P} | ${D} |`,
  );
}
const n = tV + tF;
const w = wilsonInterval(tV, n);
console.log(`| **TOTAL** | — | — | — | **${n}** | **${tV}** | **${tF}** | **${n === 0 ? "—" : `${Math.round((100 * tV) / n)}%`}** | [${Math.round(w.lower * 100)}%, ${Math.round(w.upper * 100)}%] | **${tP}** | **${tD}** |`);
console.log(`\ncsv: ${csvTotal} filas con verdict de mis 8 patrones, ${csvVencidos} vencidas (ubicación/estado cambió).`);
