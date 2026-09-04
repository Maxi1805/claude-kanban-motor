/**
 * OLA V · V6 — agrega los censos por-repo (salida de u-int-censo.mts) para Strategy,
 * Template Method y Facade: total/reales por patrón y por (patrón, lenguaje, estado),
 * y vuelca la lista completa de filas para poder muestrear con criterio.
 *
 * Uso: npx tsx scripts/v6-agregar.mts /tmp/v6/*.json
 */
import { readFileSync, writeFileSync } from "node:fs";

const MIS_PATRONES = new Set(["Strategy", "Template Method", "Facade"]);
const REALES = new Set(["ausente", "parcial"]);

interface Row {
  id: string;
  repo: string;
  kind: string;
  pattern: string;
  state: string;
  lang: string;
  file: string;
  line: number;
  confidence: string | null;
}

const files = process.argv.slice(2);
const allRows: Row[] = [];
for (const f of files) {
  const data = JSON.parse(readFileSync(f, "utf8")) as { rows: Row[] };
  allRows.push(...data.rows.filter((r) => MIS_PATRONES.has(r.pattern)));
}

console.log(`Total filas (3 patrones): ${allRows.length}\n`);

for (const pattern of MIS_PATRONES) {
  const rows = allRows.filter((r) => r.pattern === pattern);
  const reales = rows.filter((r) => REALES.has(r.state));
  console.log(`## ${pattern} — total ${rows.length}, reales ${reales.length}`);
  const byState = new Map<string, number>();
  for (const r of rows) byState.set(r.state, (byState.get(r.state) ?? 0) + 1);
  console.log(`  por estado: ${[...byState].map(([s, n]) => `${s}=${n}`).join(" ")}`);
  const byLang = new Map<string, number>();
  for (const r of rows) byLang.set(r.lang, (byLang.get(r.lang) ?? 0) + 1);
  console.log(`  por lenguaje: ${[...byLang].map(([l, n]) => `${l}=${n}`).join(" ")}`);
  const byLangState = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.lang}|${r.state}`;
    byLangState.set(k, (byLangState.get(k) ?? 0) + 1);
  }
  console.log(`  por (lenguaje,estado): ${[...byLangState].sort().map(([k, n]) => `${k}=${n}`).join(" ")}`);
  const byAncla = new Map<string, number>();
  for (const r of rows) byAncla.set(r.kind, (byAncla.get(r.kind) ?? 0) + 1);
  console.log(`  por ancla: ${[...byAncla].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}=${n}`).join(" ")}`);
  console.log("");
}

writeFileSync("/tmp/v6/todas-las-filas.json", JSON.stringify(allRows, null, 1));
console.log(`\nVolcado completo -> /tmp/v6/todas-las-filas.json (${allRows.length} filas)`);
