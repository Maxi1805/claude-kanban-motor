/**
 * B5 (Ola X) — volcado detallado de las hipótesis Prototype (places + checks),
 * para juzgar a mano una muestra sin adivinar qué clase señaló cada una.
 * Uso: npx tsx scripts/b5-dump-prototype-detail.mts <dir> <salida.json>
 */
import { writeFileSync } from "node:fs";
import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";

const [, , dir, out] = process.argv;
if (!dir || !out) {
  console.error("Uso: npx tsx scripts/b5-dump-prototype-detail.mts <dir> <salida.json>");
  process.exit(1);
}

const { analysis: a } = await analyzeRepoCached({ dir, repoName: "dump", limits: { maxFindings: "unlimited" } });

const rows: unknown[] = [];
for (const f of a.findings) {
  for (const h of f.hypotheses ?? []) {
    if (h.pattern !== "Prototype") continue;
    rows.push({
      findingId: f.id,
      findingKind: f.kind,
      state: h.state,
      places: h.places,
      checks: h.checks.map((c) => ({ label: c.label, passed: c.passed, why: c.why })),
    });
  }
}
writeFileSync(out, JSON.stringify(rows, null, 2));
console.error(`${out}: ${rows.length} hipótesis Prototype`);
