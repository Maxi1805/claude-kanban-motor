/**
 * OLA U · FRENTE M0 — aplica veredictos humanos (verdict/causeTag/note) sobre
 * filas YA EXISTENTES de `tests/golden/precision/<slug>.hypotheses.csv` (el
 * esquema que produce `u-m0-sample-hypotheses.mts`/`sample-hypotheses-for-
 * judgment.mts`), por `id`, sin volver a correr `analyzeRepo`. Mismo rol que
 * `apply-precision-verdicts.mts` tiene para el nivel 1 — no se reusa ese
 * archivo porque lee/escribe el esquema `verdicts-io.ts` (`patternFit`), que
 * NO es el esquema de esta planilla (`pattern`/`state`/`toConfirm`/`places`).
 *
 * Uso:
 *   npx tsx scripts/u-m0-apply-hypothesis-verdicts.mts <csv> <judgments.json>
 *
 * `judgments.json`: { [id: string]: { verdict?, causeTag?, note? } }
 * Sólo actualiza filas cuyo `id` ya existe; ids desconocidos se reportan y
 * se ignoran.
 */
import fs from "node:fs";

import { encodeCsv, parseCsv } from "../src/server/services/detect/precision/csv.js";

function main(): void {
  const [csvPath, jsonPath] = process.argv.slice(2);
  if (!csvPath || !jsonPath) {
    console.error("Uso: npx tsx scripts/u-m0-apply-hypothesis-verdicts.mts <csv> <judgments.json>");
    process.exit(1);
  }
  const judgments = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as Record<string, { verdict?: string; causeTag?: string; note?: string }>;

  const text = fs.readFileSync(csvPath, "utf8");
  const { header, records } = parseCsv(text);
  const idx = new Map(header.map((h, i) => [h, i]));
  const idCol = idx.get("id");
  if (idCol === undefined) throw new Error(`${csvPath}: falta columna "id"`);
  const verdictCol = idx.get("verdict")!;
  const causeTagCol = idx.get("causeTag")!;
  const noteCol = idx.get("note")!;

  let applied = 0;
  const seen = new Set<string>();
  for (const r of records) {
    const id = r[idCol];
    seen.add(id!);
    const j = judgments[id!];
    if (!j) continue;
    if (j.verdict !== undefined) r[verdictCol] = j.verdict;
    if (j.causeTag !== undefined) r[causeTagCol] = j.causeTag;
    if (j.note !== undefined) r[noteCol] = j.note;
    applied++;
  }
  for (const id of Object.keys(judgments)) {
    if (!seen.has(id)) console.error(`[u-m0-apply-verdicts] id desconocido, ignorado: ${id}`);
  }

  fs.writeFileSync(csvPath, encodeCsv(header, records), "utf8");
  console.error(`[u-m0-apply-verdicts] ${applied} fila(s) actualizada(s) en ${csvPath}`);
}

main();
