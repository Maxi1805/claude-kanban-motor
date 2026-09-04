/**
 * Utilidad chica del frente de precisión de `detect/`: aplica veredictos
 * humanos (verdict/patternFit/note) sobre filas YA EXISTENTES en una
 * planilla `tests/golden/precision/<slug>.verdicts.csv`, por `id`, sin
 * pasar por `analyzeRepo` de nuevo. Complementa `sample-findings-for-
 * judgment.mts` (que muestrea) y `precision-report.mts` (que sólo lee):
 * éste es el que ESCRIBE un veredicto ya decidido a mano, vía JSON, para
 * no editar el CSV a mano y arriesgar romper el quoting RFC4180.
 *
 * Uso:
 *   npx tsx scripts/apply-precision-verdicts.mts <csv> <judgments.json>
 *
 * `judgments.json`: { [id: string]: { verdict?, patternFit?, note? } }
 * Sólo actualiza filas cuyo `id` ya existe en el CSV; ids desconocidos se
 * reportan y se ignoran (nunca crean una fila nueva — eso es trabajo de
 * `sample-findings-for-judgment.mts`).
 */
import fs from "node:fs";
import { readPrecisionCsv, writePrecisionCsv } from "../src/server/services/detect/precision/verdicts-io.js";

function main(): void {
  const [csvPath, jsonPath] = process.argv.slice(2);
  if (!csvPath || !jsonPath) {
    console.error("Uso: npx tsx scripts/apply-precision-verdicts.mts <csv> <judgments.json>");
    process.exit(1);
  }
  const judgments = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as Record<
    string,
    { verdict?: string; patternFit?: string; note?: string }
  >;
  const rows = readPrecisionCsv(csvPath);
  const byId = new Map(rows.map((r) => [r.id, r]));
  let applied = 0;
  for (const [id, j] of Object.entries(judgments)) {
    const row = byId.get(id);
    if (!row) {
      console.error(`[apply-precision-verdicts] id desconocido, ignorado: ${id}`);
      continue;
    }
    if (j.verdict !== undefined) row.verdict = j.verdict as typeof row.verdict;
    if (j.patternFit !== undefined) row.patternFit = j.patternFit as typeof row.patternFit;
    if (j.note !== undefined) row.note = j.note;
    applied++;
  }
  writePrecisionCsv(csvPath, rows);
  console.error(`[apply-precision-verdicts] ${applied} fila(s) actualizada(s) en ${csvPath}`);
}

main();
