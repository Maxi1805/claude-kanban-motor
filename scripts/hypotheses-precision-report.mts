/**
 * Reporte de precisión de HIPÓTESIS, hermano de `precision-report.mts` (ese
 * mide `kind` de HALLAZGO vía `PrecisionRow`; éste mide PATRÓN de HIPÓTESIS
 * vía `tests/golden/precision/*.hypotheses.csv`, esquema propio de
 * `sample-hypotheses-for-judgment.mts` — una fila ya es un patrón+estado
 * específico, no una lista de patrones colgando de un hallazgo).
 *
 * NO se reimplementa el intervalo de confianza: se reusa `wilsonInterval`
 * de `graph/gate/wilson.ts`, igual que hace `detect/precision/report.ts`.
 *
 * Dos precisiones globales, a propósito:
 *   - "muestra cruda" — cuenta cada fila juzgada por igual, sin importar
 *     cuántas hipótesis reales representa su patrón.
 *   - "ponderada por población" — pondera la precisión de cada patrón por
 *     su volumen REAL en el censo (columna --census, un JSON
 *     `{poblacion: {slug: {patron: n}}}`), porque Decorator con 78
 *     hipótesis en el Rails pesa más en "qué ve el usuario hoy" que
 *     Strategy con 10. Sin --census, sólo se imprime la cruda.
 *
 * Uso:
 *   npx tsx scripts/hypotheses-precision-report.mts tests/golden/precision/*.hypotheses.csv
 *   npx tsx scripts/hypotheses-precision-report.mts tests/golden/precision/*.hypotheses.csv --census=ruta.json
 */
import fs from "node:fs";

import { parseCsv } from "../src/server/services/detect/precision/csv.js";
import { wilsonInterval, type WilsonInterval } from "../src/server/services/graph/gate/wilson.js";

interface Row {
  id: string;
  slug: string;
  pattern: string;
  state: string;
  verdict: "" | "verdadero" | "falso" | "dudoso";
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
}

function emptyBucket(): Bucket {
  return { sampled: 0, pending: 0, dudoso: 0, verdadero: 0, falso: 0 };
}

function addRow(b: Bucket, r: Row): void {
  b.sampled += 1;
  if (r.verdict === "") b.pending += 1;
  else if (r.verdict === "dudoso") b.dudoso += 1;
  else if (r.verdict === "verdadero") b.verdadero += 1;
  else if (r.verdict === "falso") b.falso += 1;
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
  const extra = [b.dudoso ? `${b.dudoso} dudoso` : "", b.pending ? `${b.pending} PENDIENTE` : ""]
    .filter(Boolean)
    .join(" · ");
  return (
    `${label.padEnd(46)} muestreados ${String(b.sampled).padStart(3)} · juzgados ${String(judged(b)).padStart(3)} ` +
    `(${b.verdadero}V/${b.falso}F) ⇒ ${pct(precisionOf(b)).padStart(4)}${wStr}${extra ? " · " + extra : ""}`
  );
}

interface CensusJson {
  poblacion: Record<string, Record<string, number>>;
}

function main(): void {
  const argv = process.argv.slice(2);
  const files = argv.filter((a) => !a.startsWith("--"));
  const censusFlag = argv.find((a) => a.startsWith("--census="));
  if (files.length === 0) {
    console.error("Uso: npx tsx scripts/hypotheses-precision-report.mts <archivo.hypotheses.csv> [más...] [--census=ruta.json]");
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
  const byPatternSlug = new Map<string, Bucket>();
  for (const p of patterns) {
    for (const s of slugs) {
      const b = emptyBucket();
      for (const r of rows) if (r.pattern === p && r.slug === s) addRow(b, r);
      if (b.sampled === 0) continue;
      byPatternSlug.set(`${p}::${s}`, b);
      console.log("  " + fmtBucket(`${p} [${s}]`, b));
    }
  }

  console.log("\n=== Por patrón, combinado (todas las poblaciones muestreadas) ===\n");
  const byPattern = new Map<string, Bucket>();
  for (const p of patterns) {
    const b = emptyBucket();
    for (const r of rows) if (r.pattern === p) addRow(b, r);
    byPattern.set(p, b);
    console.log("  " + fmtBucket(p, b));
  }

  const overall = emptyBucket();
  for (const r of rows) addRow(overall, r);
  console.log("\n=== GLOBAL, muestra cruda (cada fila juzgada pesa igual) ===\n");
  console.log("  " + fmtBucket("Los cuatro patrones, ambas poblaciones", overall));

  if (censusFlag) {
    const censusPath = censusFlag.slice("--census=".length);
    const census: CensusJson = JSON.parse(fs.readFileSync(censusPath, "utf8"));
    console.log("\n=== GLOBAL, ponderada por población real (censo, no muestra) ===\n");
    let num = 0;
    let den = 0;
    for (const [key, b] of byPatternSlug) {
      const [p, s] = key.split("::");
      const prec = precisionOf(b);
      if (prec === null) continue;
      const n = census.poblacion[s]?.[p];
      if (n === undefined) {
        console.error(`  (sin censo para ${p} [${s}], se excluye de la ponderación)`);
        continue;
      }
      console.log(`  ${p.padEnd(32)} [${s.padEnd(12)}] precisión muestra ${pct(prec).padStart(4)} × censo ${n}`);
      num += prec * n;
      den += n;
    }
    if (den > 0) {
      console.log(`\n  Precisión ponderada por volumen real: ${pct(num / den)} (censo total ${den} hipótesis)`);
    }
  }

  const dudosoTotal = rows.filter((r) => r.verdict === "dudoso").length;
  const pendingTotal = rows.filter((r) => r.verdict === "").length;
  const staleTotal = rows.filter((r) => !r.stillPresent).length;
  console.log(
    `\nTotal: ${rows.length} filas · ${dudosoTotal} dudoso(s) excluido(s) del cálculo · ${pendingTotal} pendiente(s)` +
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
}

main();
