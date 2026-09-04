/**
 * OLA V · V7 — para cada uno de los 8 patrones de este frente, lista las filas del censo
 * actual que NO tienen un veredicto vigente todavía (ni en las planillas `*.hypotheses.csv`
 * con `verdict` cargado y ubicación/estado vigente, ni en `veredictos/V7.json`).
 *
 * Uso: npx tsx scripts/v7-unjudged.mts <censo-dir> [veredictos-v7.json] [--pattern="Composite"]
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseCsv } from "../src/server/services/detect/precision/csv.js";

const TARGET_PATTERNS = new Set([
  "Composite", "Prototype", "Command", "Iterator",
  "Abstract Factory", "Chain of Responsibility", "State", "Builder",
]);
const PRECISION_DIR = path.resolve(import.meta.dirname, "..", "tests", "golden", "precision");

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const onlyPattern = process.argv.find((a) => a.startsWith("--pattern="))?.slice("--pattern=".length);
const [censoDir, veredictosPath] = args;
if (!censoDir) {
  console.error("Uso: npx tsx scripts/v7-unjudged.mts <censo-dir> [veredictos.json] [--pattern=X]");
  process.exit(1);
}

const judgedKeys = new Set<string>(); // pattern|slug|file|line
for (const file of readdirSync(PRECISION_DIR).filter((f) => f.endsWith(".hypotheses.csv"))) {
  const slug = file.slice(0, file.indexOf("."));
  const { header, records } = parseCsv(readFileSync(path.join(PRECISION_DIR, file), "utf8"));
  if (header.length === 0) continue;
  const col = (name: string) => header.indexOf(name);
  for (const row of records) {
    const pattern = row[col("pattern")] ?? "";
    if (!TARGET_PATTERNS.has(pattern)) continue;
    if (!(row[col("verdict")] ?? "")) continue;
    judgedKeys.add(`${pattern}|${slug}|${row[col("file")]}|${Number(row[col("startLine")])}`);
  }
}
if (veredictosPath) {
  const v7 = JSON.parse(readFileSync(veredictosPath, "utf8")) as Record<string, unknown>;
  // Se resuelve más abajo, contra el censo, para obtener pattern|slug|file|line.
  var v7Ids = new Set(Object.keys(v7)); // eslint-disable-line no-var
} else {
  var v7Ids = new Set<string>(); // eslint-disable-line no-var
}

for (const f of readdirSync(censoDir).filter((f) => f.endsWith(".json"))) {
  const d = JSON.parse(readFileSync(path.join(censoDir, f), "utf8")) as { slug: string; rows: { id: string; pattern: string; state: string; file: string; line: number; symbol: string; evidence: string }[] };
  for (const r of d.rows) {
    if (onlyPattern && r.pattern !== onlyPattern) continue;
    const key = `${r.pattern}|${d.slug}|${r.file}|${r.line}`;
    if (judgedKeys.has(key)) continue;
    if (v7Ids.has(r.id)) continue;
    console.log(`${r.pattern}\t${d.slug}\t${r.state}\t${r.file}:${r.line}\t${r.symbol}\t${r.id}\t${r.evidence.slice(0, 100)}`);
  }
}
