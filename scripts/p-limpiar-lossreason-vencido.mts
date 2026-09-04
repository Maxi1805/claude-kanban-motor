/**
 * Borra la `lossReason` de las filas que VOLVIERON A EMITIRSE.
 *
 * POR QUÉ. `lossReason` es la vía de escape de la compuerta de recall: dice por
 * qué un `verdadero` juzgado dejó de emitirse. Cuando una ola RECUPERA uno de
 * esos hallazgos (la Ola P recuperó tres), la celda queda con una explicación
 * de una pérdida que ya no existe. Es inocua para la compuerta —sólo mira
 * `lossReason` cuando la medición dice `perdido`— pero es exactamente la
 * degradación que `declarar-perdida-recall.mts` existe para evitar del otro
 * lado: prosa que no corresponde a ninguna pérdida. Una ola más y nadie
 * confía en la columna.
 *
 * Criterio: se borra sólo si la MEDICIÓN VIGENTE (`tests/golden/precision/recall/
 * <slug>.recall.json`) dice que la fila está viva. Si no hay medición para ese
 * slug, no se toca nada: "no se sabe" no es "está viva".
 *
 * Uso: npx tsx scripts/p-limpiar-lossreason-vencido.mts [--dry]
 */
import fs from "node:fs";
import path from "node:path";

import { readRecallSnapshot, recallSnapshotPath } from "../src/server/services/detect/precision/recall-snapshot-io.js";
import { readPrecisionCsv, writePrecisionCsv } from "../src/server/services/detect/precision/verdicts-io.js";

const DIR = path.resolve(import.meta.dirname, "..", "tests", "golden", "precision");

function main(): void {
  const dry = process.argv.includes("--dry");
  let limpiadas = 0;
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".verdicts.csv"))) {
    const slug = f.replace(".verdicts.csv", "");
    const snap = readRecallSnapshot(recallSnapshotPath(slug));
    if (snap === null) continue;
    const file = path.join(DIR, f);
    const rows = readPrecisionCsv(file);
    let tocado = false;
    const out = rows.map((r) => {
      if (r.lossReason === "" || r.verdict !== "verdadero") return r;
      const estado = snap.status[r.id];
      if (estado !== "id" && estado !== "contenido") return r;
      tocado = true;
      limpiadas += 1;
      console.log(`${slug}/${r.id} — VIVA otra vez (${estado}); se borra la lossReason vencida.`);
      console.log(`   ${r.kind} ${r.file}${r.symbol ? ` (${r.symbol})` : ""}`);
      return { ...r, lossReason: "" };
    });
    if (tocado && !dry) writePrecisionCsv(file, out);
  }
  console.log(`${limpiadas} lossReason vencida(s) borrada(s)${dry ? " (DRY)" : ""}`);
}

main();
