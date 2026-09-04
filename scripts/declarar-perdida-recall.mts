/**
 * LA VÍA DE ESCAPE DE LA COMPUERTA DE RECALL, operada — escribe la columna
 * `lossReason` (`detect/precision/types.ts`) de una fila juzgada `verdadero`
 * que el analizador ya no emite.
 *
 * POR QUÉ EXISTE UN SCRIPT PARA ESCRIBIR UNA CELDA. La columna se puede llenar
 * a mano (la planilla es un CSV y un humano la abre y la edita — eso es todo el
 * punto del instrumento). Este script no reemplaza eso: agrega lo único que un
 * editor de texto no puede dar, que es **verificar que lo que se está
 * declarando sea de verdad una pérdida**. Sin esa verificación, la vía de
 * escape se degrada sola: se escriben motivos sobre filas que están vivas, o
 * sobre ids que ya no existen en ninguna planilla, y al cabo de dos olas la
 * columna tiene prosa que no corresponde a ninguna pérdida y nadie confía en
 * ella. Acá: si la fila no existe, no está juzgada `verdadero`, o la medición
 * vigente dice que sigue VIVA, no se escribe nada y se dice por qué.
 *
 * Uso:
 *   npx tsx scripts/declarar-perdida-recall.mts <slug> <id> "<motivo>"
 *   npx tsx scripts/declarar-perdida-recall.mts <slug> <id> "<motivo>" --aunque-siga-vivo
 *   npx tsx scripts/declarar-perdida-recall.mts --heredadas "<motivo>" --confirmo-deuda-previa
 *
 * `--aunque-siga-vivo` — para ANTICIPAR una declaración: un frente que sabe que
 * su cambio va a matar un verdadero puede dejar el motivo escrito ANTES de que
 * el integrador vuelva a medir, en vez de que la pérdida aparezca sin dueño en
 * el cierre de ola. La celda es inocua mientras el hallazgo siga vivo — la
 * compuerta sólo mira `lossReason` cuando la medición dice `perdido`.
 *
 * `--heredadas` — modo de UNA SOLA VEZ, el día que la compuerta se estrena:
 * declara TODAS las pérdidas que ya existían y que no se pueden atribuir a
 * nadie, con el prefijo `heredada:` que `recall-logic.ts` cuenta APARTE de las
 * demás. Pide una confirmación explícita a propósito: usado más tarde por un
 * frente apurado, sería exactamente el botón para amnistiar en bloque los
 * verdaderos que uno mismo acaba de matar. Que quede escrito acá no lo impide
 * —nada en un CSV impide nada— pero lo deja visible en el `git diff` de la
 * planilla y contado aparte en `scripts/recall-report.mts`.
 */
import fs from "node:fs";
import path from "node:path";

import { HERITAGE_PREFIX } from "../src/server/services/detect/precision/recall-logic.js";
import { readRecallSnapshot, recallSnapshotPath } from "../src/server/services/detect/precision/recall-snapshot-io.js";
import { readPrecisionCsv, writePrecisionCsv } from "../src/server/services/detect/precision/verdicts-io.js";

const PRECISION_DIR = path.resolve(import.meta.dirname, "..", "tests", "golden", "precision");

function csvPath(slug: string): string {
  return path.join(PRECISION_DIR, `${slug}.verdicts.csv`);
}

/** `null` si todavía no se midió ese slug — el llamador decide si eso alcanza para escribir. */
function estadoDe(slug: string, id: string): string | null {
  const snap = readRecallSnapshot(recallSnapshotPath(slug));
  return snap?.status[id] ?? null;
}

function declarar(slug: string, id: string, motivo: string, aunqueSigaVivo: boolean): boolean {
  const file = csvPath(slug);
  const rows = readPrecisionCsv(file);
  if (rows.length === 0) {
    console.error(`${slug}: no hay planilla en ${file}`);
    return false;
  }
  const targets = rows.filter((r) => r.id === id);
  if (targets.length === 0) {
    console.error(`${slug}/${id}: no hay ninguna fila con ese id en la planilla`);
    return false;
  }
  if (!targets.some((r) => r.verdict === "verdadero")) {
    console.error(`${slug}/${id}: la fila no está juzgada "verdadero" — el recall sólo mide verdaderos, no hay nada que declarar`);
    return false;
  }
  const estado = estadoDe(slug, id);
  if (estado !== "perdido" && !aunqueSigaVivo) {
    console.error(
      `${slug}/${id}: la medición vigente dice "${estado ?? "sin medir"}", no "perdido" — ` +
        "no se declara una pérdida que no está medida como tal. Usá --aunque-siga-vivo para anticipar una declaración.",
    );
    return false;
  }

  writePrecisionCsv(
    file,
    rows.map((r) => (r.id === id && r.verdict === "verdadero" ? { ...r, lossReason: motivo } : r)),
  );
  console.log(`${slug}/${id}: declarada (${estado ?? "sin medir"}) — ${motivo}`);
  return true;
}

function heredadas(motivo: string): void {
  const slugs = fs
    .readdirSync(PRECISION_DIR)
    .filter((f) => f.endsWith(".verdicts.csv"))
    .map((f) => f.replace(".verdicts.csv", ""));

  let total = 0;
  for (const slug of slugs) {
    const snap = readRecallSnapshot(recallSnapshotPath(slug));
    if (!snap) continue;
    const perdidos = new Set(Object.entries(snap.status).filter(([, s]) => s === "perdido").map(([id]) => id));
    if (perdidos.size === 0) continue;

    const file = csvPath(slug);
    const rows = readPrecisionCsv(file);
    let n = 0;
    const out = rows.map((r) => {
      if (r.verdict !== "verdadero" || !perdidos.has(r.id) || r.lossReason !== "") return r;
      n++;
      return { ...r, lossReason: `${HERITAGE_PREFIX} ${motivo}` };
    });
    if (n > 0) {
      writePrecisionCsv(file, out);
      console.log(`${slug.padEnd(18)} ${n} pérdida(s) declarada(s) como deuda previa`);
      total += n;
    }
  }
  console.log(`\n${total} pérdida(s) heredada(s) declarada(s) en total.`);
}

function main(): void {
  const argv = process.argv.slice(2);
  const aunqueSigaVivo = argv.includes("--aunque-siga-vivo");

  if (argv.includes("--heredadas")) {
    const motivo = argv[argv.indexOf("--heredadas") + 1];
    if (!motivo || motivo.startsWith("--")) {
      console.error('--heredadas necesita el motivo: --heredadas "texto"');
      process.exit(1);
    }
    if (!argv.includes("--confirmo-deuda-previa")) {
      console.error(
        "--heredadas declara EN BLOQUE todas las pérdidas sin motivo. Es para estrenar la compuerta, no para\n" +
          "amnistiar lo que uno acaba de matar. Si de verdad es deuda previa, repetilo con --confirmo-deuda-previa.",
      );
      process.exit(1);
    }
    heredadas(motivo);
    return;
  }

  const positional = argv.filter((a) => !a.startsWith("--"));
  const [slug, id, motivo] = positional;
  if (!slug || !id || !motivo) {
    console.error('Uso: npx tsx scripts/declarar-perdida-recall.mts <slug> <id> "<motivo>" [--aunque-siga-vivo]');
    console.error('     npx tsx scripts/declarar-perdida-recall.mts --heredadas "<motivo>" --confirmo-deuda-previa');
    process.exit(1);
    return;
  }
  if (!declarar(slug, id, motivo, aunqueSigaVivo)) process.exit(1);
}

main();
