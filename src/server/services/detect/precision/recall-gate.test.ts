/**
 * LA COMPUERTA AUTOMÁTICA DE RECALL — la mitad que faltaba, y la asimetría que
 * corrige está en una frase: hasta esta ola el árbol tenía
 * `gate.test.ts` (precisión, piso 50 %) y NADA que mirara los verdaderos que se
 * perdían por el camino. Cada ola se medía por los falsos que sacaba. Tres olas
 * seguidas optimizaron contra ese incentivo y el usuario lo notó sin
 * instrumento: *"es verdad que estamos bajando el ruido, pero parece que
 * también bajamos los positivos en gran medida"*. Un kind en 0 % de precisión
 * sube a 50 % achicándolo hasta que sólo emita lo obvio; esta compuerta es lo
 * que hace que eso se vea.
 *
 * QUÉ ROMPE ESTE TEST, exactamente una cosa: **un hallazgo que un humano juzgó
 * `verdadero` que el analizador ya no emite (ni por `id` ni por contenido) y
 * que nadie declaró.** Ni un umbral, ni un promedio, ni un piso: una lista de
 * casos con nombre y apellido.
 *
 * LA VÍA DE ESCAPE — y NO es aflojar el test. Un verdadero puede morir
 * legítimamente: el criterio del detector cambió y el veredicto viejo quedó
 * vencido, el archivo resultó ser una copia de upstream, el kind se
 * redefinió. Quien lo mató escribe el motivo en la columna `lossReason` de
 * `tests/golden/precision/<slug>.verdicts.csv` (`types.ts#lossReason`) y la
 * pérdida pasa de silenciosa a DECLARADA: el test deja de romper, el motivo
 * queda en `git diff` de la planilla, y `scripts/recall-report.mts` lo imprime
 * cada vez. Lo que la columna NO compra es la cifra: `evaluateRecallGate`
 * cuenta el hallazgo como perdido igual, esté declarado o no
 * (`recall-logic.test.ts`, "declarar no sube el recall ni un punto"). Si la
 * moviera, la columna sería un botón para apagar la medición.
 *
 * ═══ EL COSTO, que es la razón de que esta compuerta exista como archivo y no
 * como una idea ═══
 *
 * Cruzar los verdaderos contra el pool vivo exige un volcado COMPLETO de los 13
 * repos: **7 min 30 s de reloj medidos, 5 min 21 s de ellos sólo `guava`**. Una
 * compuerta que cobre eso en cada `npx vitest run` no se corre, y una compuerta
 * que no se corre no protege nada. Así que este archivo NO analiza nada: lee
 * las planillas y las mediciones ya cruzadas de
 * `tests/golden/precision/recall/*.recall.json` (`recall-snapshot-io.ts`), y
 * corre en milisegundos. El análisis se paga aparte, con
 * `scripts/dump-hallazgos.mts` + `scripts/recall-snapshot.mts`, y por slug: un
 * frente que tocó un detector de Go vuelca `cobra` y `hugo` (48 s medidos),
 * regenera esos dos snapshots, y esta compuerta le contesta si mató un
 * verdadero en su lenguaje.
 *
 * LA CONTRACARA HONESTA DE ESA DECISIÓN: sobre snapshots viejos, un verde no
 * dice nada. Por eso `evaluateRecallGate` compara la huella del analizador
 * guardada en cada snapshot contra la del árbol de hoy y este archivo IMPRIME
 * SIEMPRE cuáles quedaron viejos. No los hace fallar a propósito: todo frente
 * cambia el analizador, así que fallar por vejez dejaría la compuerta roja
 * siempre y terminaría desactivada — exactamente el argumento con el que
 * `ola-p/informes/AVISO-recall-ck-analyzer.md` descarta medir contra repos sin
 * SHA congelado. La exigencia de frescura vive donde sí se puede cumplir: al
 * cierre de ola, `npx tsx scripts/recall-report.mts --exigir-vigente` sale con
 * código != 0 si algún snapshot quedó atrás.
 *
 * QUÉ POBLACIONES ENTRAN. Sólo las que tienen el CÓDIGO clavado a un SHA
 * congelado (`tests/golden/manifest.json`). `ck-analyzer` queda afuera por
 * construcción (`recall-logic.ts#POBLACIONES_SIN_SHA_CONGELADO`): es el repo
 * del propio analizador, lo reescribimos nosotros, y ahí un verdadero
 * desaparece porque el archivo que lo contenía ya no existe — aporta 33
 * pérdidas sobre 33 verdaderos juzgados, el 100 %, y los kinds que más
 * "pierde" son `long-function`, `complexity` y `primitive-obsession`:
 * intocados y al 100 % de precisión. Esa es la firma de un confusor, no de una
 * regresión.
 *
 * LA LÍNEA BASE con la que nace: **275 verdaderos juzgados sobre los 13 repos,
 * 250 vivos (90,9 %), 25 perdidos** en las olas N y O — reproducida por este
 * frente volcando el árbol congelado del cierre de la ola anterior
 * (`respaldo-post-olaO.tgz`) contra los SHA del manifiesto, no tomada de un
 * informe ajeno. Esas 25 llevan `lossReason` con el prefijo `heredada:`: son
 * deuda previa, no se pueden atribuir a ningún frente, y se cuentan APARTE de
 * las declaradas para que su volumen nunca tape una pérdida nueva.
 *
 * Nunca rompe por FALTA de datos: sin ninguna medición en
 * `tests/golden/precision/recall/`, el caso se `it.skip`-ea con el motivo en el
 * propio nombre — misma disciplina que `gate.test.ts` y `census-golden.test.ts`.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { analyzerFingerprint } from "../../analyze-cache.js";
import {
  evaluateRecallGate,
  formatRecallCells,
  formatSilentLoss,
  HERITAGE_PREFIX,
} from "./recall-logic.js";
import { readAllRecallSnapshots, RECALL_DIR } from "./recall-snapshot-io.js";
import { readPrecisionCsv } from "./verdicts-io.js";

const PRECISION_DIR = path.resolve(import.meta.dirname, "..", "..", "..", "..", "..", "tests", "golden", "precision");

function loadAllRows() {
  if (!fs.existsSync(PRECISION_DIR)) return [];
  return fs
    .readdirSync(PRECISION_DIR)
    .filter((f) => f.endsWith(".verdicts.csv"))
    .flatMap((f) => readPrecisionCsv(path.join(PRECISION_DIR, f)));
}

const rows = loadAllRows();
const snapshots = readAllRecallSnapshots();
const hayMedicion = snapshots.some((s) => Object.keys(s.status).length > 0);
const test = hayMedicion ? it : it.skip;

describe("compuerta de recall — los verdaderos juzgados que el analizador todavía emite", () => {
  test(
    hayMedicion
      ? "ningún hallazgo juzgado verdadero deja de emitirse sin motivo escrito en la columna lossReason de su planilla"
      : `SKIP: no hay ninguna medición en ${RECALL_DIR} — correr scripts/dump-hallazgos.mts + scripts/recall-snapshot.mts primero (ver sus docstrings)`,
    async () => {
      const evaluation = evaluateRecallGate(rows, snapshots, await analyzerFingerprint());

      const recall = evaluation.measured > 0 ? evaluation.alive / evaluation.measured : null;
      // eslint-disable-next-line no-console
      console.log(
        "\n════════════════════════════════════════════════════════════════════\n" +
          "COMPUERTA DE RECALL — de los verdaderos juzgados, cuántos sigue emitiendo el analizador\n" +
          "════════════════════════════════════════════════════════════════════\n" +
          `  medidos ${evaluation.measured} · VIVOS ${evaluation.alive} ` +
          `(${recall === null ? "—" : (recall * 100).toFixed(1) + "%"}) · ` +
          `perdidos ${evaluation.measured - evaluation.alive} — ` +
          `${evaluation.declaredLoss.length} declarada(s) (${evaluation.inheritedLoss.length} heredada(s)) · ` +
          `${evaluation.silentLoss.length} SIN DECLARAR\n` +
          `  vivos por id ${evaluation.aliveById} · vivos sólo por contenido ${evaluation.aliveByContent}\n` +
          "\n— por kind —\n" +
          formatRecallCells(evaluation.byKind) +
          "\n\n— por lenguaje —\n" +
          formatRecallCells(evaluation.byLanguage) +
          "\n\n— por población —\n" +
          formatRecallCells(evaluation.bySlug) +
          (evaluation.unmeasured.length > 0
            ? "\n\n— SIN MEDIR (ni vivo ni perdido: no se sabe) —\n" +
              evaluation.unmeasured.map((u) => `  ${u.slug.padEnd(18)} ${u.judgedTrue} verdadero(s) · ${u.reason}`).join("\n")
            : "") +
          (evaluation.stale.length > 0
            ? `\n\n— ${evaluation.stale.length} SNAPSHOT(S) VIEJO(S), medidos con OTRO analizador que el del árbol de hoy —\n` +
              evaluation.stale.map((s) => `  ${s.slug.padEnd(18)} medido ${s.measuredAt}`).join("\n") +
              "\n  Sobre snapshots viejos este verde no dice nada: re-volcá esos repos\n" +
              "  (scripts/dump-hallazgos.mts) y regenerá su medición (scripts/recall-snapshot.mts).\n" +
              "  Al cierre de ola: npx tsx scripts/recall-report.mts --exigir-vigente"
            : "") +
          (evaluation.declaredLoss.length > 0
            ? `\n\n— ${evaluation.declaredLoss.length} pérdida(s) DECLARADA(S) (${evaluation.inheritedLoss.length} heredada(s) con el prefijo "${HERITAGE_PREFIX}") —\n` +
              evaluation.declaredLoss
                .map((o) => `  ${o.kind} [${o.slug}] ${o.file}${o.symbol === "" ? "" : ` (${o.symbol})`}\n      ${o.lossReason}`)
                .join("\n")
            : "") +
          "\n════════════════════════════════════════════════════════════════════\n",
      );

      const messages = evaluation.silentLoss.map((o, i) => `  ${i + 1}. ${formatSilentLoss(o)}`);
      expect(
        messages,
        `${messages.length} hallazgo(s) juzgado(s) VERDADERO dejaron de emitirse sin que nadie declarara por qué:\n` +
          messages.join("\n"),
      ).toHaveLength(0);
    },
  );
});
