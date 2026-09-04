/**
 * OLA V · V7 — lista, para los 8 patrones de este frente, qué filas de
 * `tests/golden/precision/*.hypotheses.csv` ya tienen `verdict` cargado (para no rejuzgar)
 * y cuáles siguen `stillPresent=true` sin veredicto (candidatas a juzgar).
 *
 * Uso: npx tsx scripts/v7-existing.mts
 */
import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "../src/server/services/detect/precision/csv.js";

const TARGET_PATTERNS = new Set([
  "Composite", "Prototype", "Command", "Iterator",
  "Abstract Factory", "Chain of Responsibility", "State", "Builder",
]);
const DIR = path.resolve("tests/golden/precision");

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".hypotheses.csv"))) {
  const { header, records } = parseCsv(fs.readFileSync(path.join(DIR, file), "utf8"));
  if (header.length === 0) continue;
  const idx = new Map(header.map((h, i) => [h, i]));
  const col = (name: string) => idx.get(name)!;
  for (const r of records) {
    const pattern = r[col("pattern")] ?? "";
    if (!TARGET_PATTERNS.has(pattern)) continue;
    const verdict = r[col("verdict")] ?? "";
    const stillPresent = (r[col("stillPresent")] ?? "true") !== "false";
    console.log(
      `${file}\t${pattern}\t${r[col("state")]}\t${verdict || "(SIN JUZGAR)"}\t${stillPresent ? "vivo" : "muerto"}\t${r[col("id")]}\t${r[col("file")]}:${r[col("startLine")]}`,
    );
  }
}
