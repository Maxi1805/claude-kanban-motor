/**
 * Y1 (Ola Y) — volcado detallado de las hipótesis Null Object (ancla + places
 * + checks), para JUZGAR a mano la población que sobrevive al arreglo sin
 * adivinar qué tipo señaló cada una.
 *
 * Misma forma que `b5-dump-prototype-detail.mts` (Ola X). Lo que agrega, y es
 * lo que hacía falta para juzgar: el `where` del hallazgo ANCLA al lado de las
 * `places` de la hipótesis — el defecto que esta ola cierra es justamente que
 * las dos cosas no se relacionaban, y no se puede ver sin ponerlas juntas.
 *
 * Uso: npx tsx scripts/y1-dump-null-object-detail.mts <dir> <salida.json>
 */
import { writeFileSync } from "node:fs";
import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";

const [, , dir, out] = process.argv;
if (!dir || !out) {
  console.error("Uso: npx tsx scripts/y1-dump-null-object-detail.mts <dir> <salida.json>");
  process.exit(1);
}

const { analysis: a } = await analyzeRepoCached({ dir, repoName: "dump", limits: { maxFindings: "unlimited" } });

const rows: unknown[] = [];
for (const f of a.findings) {
  for (const h of f.hypotheses ?? []) {
    if (h.pattern !== "Null Object") continue;
    rows.push({
      repo: dir,
      findingId: f.id,
      findingKind: f.kind,
      anclaWhere: f.locations.map((l) => `${l.file}:${l.startLine}-${l.endLine}`),
      state: h.state,
      confidence: h.confidence,
      places: h.places.map((p) => `${p.file}:${p.startLine}-${p.endLine} ${p.symbol ?? ""} (${p.role})`),
      checks: h.checks.map((c) => ({ label: c.label, passed: c.passed, why: c.why })),
    });
  }
}
writeFileSync(out, JSON.stringify(rows, null, 2));
console.error(`${out}: ${rows.length} hipótesis Null Object`);
