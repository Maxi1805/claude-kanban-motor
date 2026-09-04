/**
 * OLA U · FRENTE M0 — reporte de precisión de HIPÓTESIS (nivel 2), hermano de
 * `hypotheses-precision-report.mts` pero con la CUARTA categoría de veredicto
 * que el nivel 2 tiene y el nivel 1 no (CONTEXTO.md §3): `problema-si-patron-no`
 * — el problema que el ancla señala es real, pero el patrón propuesto NO es
 * la respuesta. Es información DISTINTA de "falso" (que dice "ni siquiera hay
 * problema, o el patrón además de errado es irrelevante") — separarla evita
 * que un patrón con ancla razonable pero remedio equivocado se lea igual que
 * uno con ancla rota.
 *
 * `precision` se calcula sobre `verdadero / (verdadero + falso)` — igual que
 * el hermano de nivel 1 — porque "problema-si-patron-no" no es un desacierto
 * de DETECCIÓN sino de RECOMENDACIÓN: cuenta aparte, con su propia columna,
 * nunca mezclada en el numerador ni en el denominador de precisión.
 *
 * No se reimplementa el intervalo de confianza: reusa `wilsonInterval` de
 * `graph/gate/wilson.ts`.
 *
 * Uso:
 *   npx tsx scripts/u-m0-hypotheses-precision-report.mts tests/golden/precision/*.hypotheses.csv
 */
import fs from "node:fs";

import { parseCsv } from "../src/server/services/detect/precision/csv.js";
import { wilsonInterval, type WilsonInterval } from "../src/server/services/graph/gate/wilson.js";

interface Row {
  id: string;
  slug: string;
  pattern: string;
  state: string;
  verdict: "" | "verdadero" | "falso" | "problema-si-patron-no" | "dudoso";
  causeTag: string;
  stillPresent: boolean;
}

function readRows(filePath: string): Row[] {
  const text = fs.readFileSync(filePath, "utf8");
  const { header, records } = parseCsv(text);
  if (header.length === 0) return [];
  const idx = new Map(header.map((h, i) => [h, i]));
  const col = (name: string): number => {
    const i = idx.get(name);
    if (i === undefined) throw new Error(`${filePath}: falta la columna "${name}"`);
    return i;
  };
  const at = (r: readonly string[], name: string): string => r[col(name)] ?? "";
  return records.map((r) => ({
    id: at(r, "id"),
    slug: at(r, "slug"),
    pattern: at(r, "pattern"),
    state: at(r, "state"),
    verdict: at(r, "verdict") as Row["verdict"],
    causeTag: at(r, "causeTag"),
    stillPresent: at(r, "stillPresent") !== "false",
  }));
}

interface Bucket {
  sampled: number;
  pending: number;
  dudoso: number;
  verdadero: number;
  falso: number;
  problemaSiPatronNo: number;
}

function emptyBucket(): Bucket {
  return { sampled: 0, pending: 0, dudoso: 0, verdadero: 0, falso: 0, problemaSiPatronNo: 0 };
}

function addRow(b: Bucket, r: Row): void {
  b.sampled += 1;
  if (r.verdict === "") b.pending += 1;
  else if (r.verdict === "dudoso") b.dudoso += 1;
  else if (r.verdict === "verdadero") b.verdadero += 1;
  else if (r.verdict === "falso") b.falso += 1;
  else if (r.verdict === "problema-si-patron-no") b.problemaSiPatronNo += 1;
}

function judged(b: Bucket): number {
  return b.verdadero + b.falso;
}

function precisionOf(b: Bucket): number | null {
  const j = judged(b);
  return j > 0 ? b.verdadero / j : null;
}

function wilsonOf(b: Bucket): WilsonInterval | null {
  const j = judged(b);
  return j > 0 ? wilsonInterval(b.verdadero, j) : null;
}

function pct(x: number | null): string {
  return x === null ? "—" : `${(x * 100).toFixed(0)}%`;
}

function fmtBucket(label: string, b: Bucket): string {
  const w = wilsonOf(b);
  const wStr = w ? ` Wilson95 [${pct(w.lower)}, ${pct(w.upper)}]` : "";
  const extra = [
    b.problemaSiPatronNo ? `${b.problemaSiPatronNo} problema-si-patrón-no` : "",
    b.dudoso ? `${b.dudoso} dudoso` : "",
    b.pending ? `${b.pending} PENDIENTE` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    `${label.padEnd(46)} muestreados ${String(b.sampled).padStart(3)} · juzgados ${String(judged(b)).padStart(3)} ` +
    `(${b.verdadero}V/${b.falso}F) ⇒ ${pct(precisionOf(b)).padStart(4)}${wStr}${extra ? " · " + extra : ""}`
  );
}

function main(): void {
  const argv = process.argv.slice(2);
  const files = argv.filter((a) => !a.startsWith("--"));
  if (files.length === 0) {
    console.error("Uso: npx tsx scripts/u-m0-hypotheses-precision-report.mts <archivo.hypotheses.csv> [más...]");
    process.exit(1);
  }

  const rows = files.flatMap(readRows);
  if (rows.length === 0) {
    console.error(`Sin filas en: ${files.join(", ")}`);
    process.exit(1);
  }

  const patterns = [...new Set(rows.map((r) => r.pattern))].sort();
  const slugs = [...new Set(rows.map((r) => r.slug))].sort();

  console.log("=== Por patrón × población ===\n");
  for (const p of patterns) {
    for (const s of slugs) {
      const b = emptyBucket();
      for (const r of rows) if (r.pattern === p && r.slug === s) addRow(b, r);
      if (b.sampled === 0) continue;
      console.log("  " + fmtBucket(`${p} [${s}]`, b));
    }
  }

  console.log("\n=== Por patrón, combinado (todas las poblaciones muestreadas) — ésta es la fila que importa ===\n");
  for (const p of patterns) {
    const b = emptyBucket();
    for (const r of rows) if (r.pattern === p) addRow(b, r);
    console.log("  " + fmtBucket(p, b));
  }

  const overall = emptyBucket();
  for (const r of rows) addRow(overall, r);
  console.log("\n=== GLOBAL, muestra cruda (cada fila juzgada pesa igual) ===\n");
  console.log("  " + fmtBucket("Todos los patrones muestreados", overall));

  const dudosoTotal = rows.filter((r) => r.verdict === "dudoso").length;
  const pendingTotal = rows.filter((r) => r.verdict === "").length;
  const psnTotal = rows.filter((r) => r.verdict === "problema-si-patron-no").length;
  const staleTotal = rows.filter((r) => !r.stillPresent).length;
  console.log(
    `\nTotal: ${rows.length} filas · ${psnTotal} problema-si-patrón-no · ${dudosoTotal} dudoso(s) excluido(s) del cálculo · ${pendingTotal} pendiente(s)` +
      `${staleTotal ? ` · ${staleTotal} ya no presente(s) en el pool vivo (stillPresent=false)` : ""}.`,
  );

  console.log("\n=== Causas de los falsos, por patrón ===\n");
  for (const p of patterns) {
    const falsos = rows.filter((r) => r.pattern === p && r.verdict === "falso");
    if (falsos.length === 0) continue;
    const byCause = new Map<string, number>();
    for (const r of falsos) byCause.set(r.causeTag || "(sin tag)", (byCause.get(r.causeTag || "(sin tag)") ?? 0) + 1);
    const causeStr = [...byCause.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `${c}=${n}`)
      .join(", ");
    console.log(`  ${p.padEnd(32)} (${falsos.length} falsos) ${causeStr}`);
  }

  console.log("\n=== problema-si-patrón-no, por patrón (el ancla acierta, el remedio no) ===\n");
  for (const p of patterns) {
    const psn = rows.filter((r) => r.pattern === p && r.verdict === "problema-si-patron-no");
    if (psn.length === 0) continue;
    const byCause = new Map<string, number>();
    for (const r of psn) byCause.set(r.causeTag || "(sin tag)", (byCause.get(r.causeTag || "(sin tag)") ?? 0) + 1);
    const causeStr = [...byCause.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `${c}=${n}`)
      .join(", ");
    console.log(`  ${p.padEnd(32)} (${psn.length}) ${causeStr}`);
  }
}

main();
