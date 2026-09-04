/**
 * LA COMPUERTA AUTOMÁTICA DE PRECISIÓN DE HALLAZGOS — mismo espíritu que
 * `graph/gate/precision-recall.test.ts` (compuerta de PRECISIÓN, con recall
 * siempre impreso, nunca bloqueante) pero para `Finding`s de detectores en
 * vez de aristas del grafo, y deliberadamente MÁS PERMISIVA: esa compuerta
 * exige 0,90 sobre 200 aristas etiquetadas con meses de trabajo detrás;
 * ÉSTA es la primera ola de un instrumento que hoy tiene, por kind, entre 0
 * y `--n` (15 por defecto — ver `scripts/sample-findings-for-judgment.mts`)
 * filas. Pedir 0,90 acá sería ruido estadístico, no una señal — con n=15 un
 * solo veredicto discutible mueve el punto un 6,7%. El piso es
 * deliberadamente bajo: sólo bloquea un kind que su propia muestra dice que
 * es "más falso que verdadero" (`< 50%`), la barra mínima para llamarlo
 * roto con confianza aun con una muestra chica.
 *
 * FILTRO POR VIGENCIA (tomado a propósito en esta ola) — la lógica real vive
 * en `gate-logic.ts#evaluateGate` (probada aparte, con datos sintéticos, en
 * `gate-logic.test.ts`); este archivo sólo lee las planillas reales, llama a
 * esa función, e imprime/asert. Antes de esta ola, este archivo agregaba la
 * unión de TODAS las filas de TODAS las planillas SIN filtrar por
 * `stillPresent` — sumando filas muertas (hallazgos que el detector ya no
 * emite) junto con las vivas. Medido: `homonymous-delegation` reportaba 39%
 * (mezclando el detector viejo) cuando el kind VIVO mide 83% — el arreglo de
 * otro frente funcionó y la compuerta, sin filtrar por vigencia, no podía
 * verlo. Una integración anterior identificó el defecto pero decidió NO
 * corregirlo por su cuenta (documentado en `PENDIENTES.md`): hacerlo la
 * pondría verde de contrabando, sin que nadie lo pidiera a propósito. Esta
 * ola SÍ lo pide, con dos condiciones:
 *   - El número HISTÓRICO (sin filtrar) se imprime siempre al lado del
 *     VIGENTE, para poder auditar el cambio — nunca sólo el que conviene.
 *   - Un kind no puede desaparecer del pool vivo en silencio: si tenía
 *     `judged >= MIN_JUDGED` en el histórico y hoy no queda NI UNA fila
 *     viva, `evaluateGate` lo reporta como `disappeared` y ESTE archivo lo
 *     hace fallar la compuerta — una regresión de un detector que deja de
 *     emitir algo que antes emitía (y que ya estaba juzgado) tiene que
 *     verse, no volverse invisible por no tener filas vivas que promediar.
 *   - TERCERA CONDICIÓN, agregada por la auditoría de la integración de la
 *     Ola J (`scripts/j-auditar-compuerta.mts`): las dos condiciones de
 *     arriba sólo cubrían la desaparición TOTAL de un kind. Un kind que
 *     SIGUE emitiendo pero al que se le mueren todos los veredictos se caía
 *     de las dos cláusulas y quedaba verde en silencio — y al momento de la
 *     auditoría eso YA le pasaba a 4 kinds reales, uno de los cuales
 *     (`feature-envy-inter`, 0/11) habría sido un ROJO con la compuerta
 *     anterior sin filtrar. `evaluateGate#basisLost` lo reporta y este
 *     archivo lo hace fallar.
 *
 *     PRECISIÓN DEL CRITERIO (aclarado tras la ola de `boolean-complexity`,
 *     ver `RAICES.md` PENDIENTES §1-BIS "el apagado"): `basisLost` NO exige
 *     que se mueran TODOS los veredictos vivos — dispara apenas los vivos
 *     caen BAJO `minJudged`, aunque queden algunos (`gate-logic.test.ts`
 *     tiene el caso "la base se encoge por debajo del piso aunque queden
 *     algunos veredictos vivos" probándolo desde la Ola J). Es la condición
 *     correcta ("el volumen se desplomó y la base quedó bajo el mínimo ⇒
 *     ROJO"): un kind con 18 juzgados históricos que cae a 4 vivos entra acá
 *     igual que uno que cae a 0 — `boolean-complexity` (289→10 hallazgos,
 *     18→0/4 juzgados vivos según el momento de la medición) es el caso real
 *     que confirmó esto, no un agujero nuevo que haya hecho falta tapar.
 *
 * QUÉ HACER CUANDO ESTO CRECE (próxima ola, no esta): una vez que cada kind
 * acumule más de una corrida de veredictos (dos archivos de planilla en el
 * tiempo, o una corrida con `--n` mayor que hace upsert sobre la anterior —
 * ver `verdicts-io.ts#mergeRows`), el paso siguiente es una CLÁUSULA 3 al
 * estilo de `precision-recall.test.ts`: comparar el extremo INFERIOR del
 * Wilson95 de la ola nueva contra el extremo SUPERIOR de la ola anterior
 * (no-regresión, no un piso absoluto) y subir gradualmente el piso absoluto
 * de la cláusula de precisión a medida que la muestra por kind crece más
 * allá de `MIN_JUDGED`. Ninguna de las dos existe todavía.
 *
 * Nunca rompe por FALTA de datos: un kind sin ninguna fila juzgada
 * (`judged === 0`) no entra a ninguna cláusula — es "todavía no medido", no
 * "medido y malo". Si NINGÚN archivo de veredictos tiene una sola fila
 * juzgada (el estado del día en que se generó la línea base, antes de que un
 * humano juzgue la primera fila), el caso se `it.skip`-ea con el motivo en
 * el propio nombre — misma disciplina que `census-golden.test.ts` y
 * `precision-recall.test.ts`: `npx vitest run` tiene que quedar verde SIN
 * haber juzgado nada todavía.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { evaluateGate, MIN_JUDGED, PRECISION_FLOOR } from "./gate-logic.js";
import { formatPrecisionReport } from "./report.js";
import { readPrecisionCsv } from "./verdicts-io.js";

const PRECISION_DIR = path.resolve(import.meta.dirname, "..", "..", "..", "..", "..", "tests", "golden", "precision");

function loadAllRows() {
  if (!fs.existsSync(PRECISION_DIR)) return [];
  const files = fs.readdirSync(PRECISION_DIR).filter((f) => f.endsWith(".verdicts.csv"));
  return files.flatMap((f) => readPrecisionCsv(path.join(PRECISION_DIR, f)));
}

const rows = loadAllRows();
const evaluation = evaluateGate(rows, { floor: PRECISION_FLOOR, minJudged: MIN_JUDGED });
const anyJudged = evaluation.historical.some((r) => r.judged > 0);
const test = anyJudged ? it : it.skip;

describe("compuerta de precisión de hallazgos — todas las planillas de tests/golden/precision/*.verdicts.csv juntas", () => {
  test(
    anyJudged
      ? `ningún kind VIGENTE con ≥${MIN_JUDGED} veredictos cae bajo ${(PRECISION_FLOOR * 100).toFixed(0)}% de precisión, ningún kind con ≥${MIN_JUDGED} veredictos históricos desaparece del pool vivo en silencio, y ninguno pierde en silencio la base de medición que ya tenía`
      : "SKIP: ningún archivo tests/golden/precision/*.verdicts.csv tiene veredictos cargados todavía — correr scripts/sample-findings-for-judgment.mts y juzgar a mano primero",
    () => {
      // eslint-disable-next-line no-console
      console.log(
        "\n════════════════════════════════════════════════════════════════════\n" +
          "COMPUERTA DE PRECISIÓN — REPORTE VIGENTE (sólo filas stillPresent=true, lo que el analizador emite HOY)\n" +
          "════════════════════════════════════════════════════════════════════\n" +
          formatPrecisionReport(evaluation.live) +
          "\n\n════════════════════════════════════════════════════════════════════\n" +
          "REPORTE HISTÓRICO — todas las filas, vivas y muertas (para auditar el cambio contra el vigente de arriba)\n" +
          "════════════════════════════════════════════════════════════════════\n" +
          formatPrecisionReport(evaluation.historical) +
          "\n════════════════════════════════════════════════════════════════════\n",
      );

      const brokenMessages = evaluation.brokenPrecision.map(
        (r) =>
          `${r.kind}: ${r.truePositive}/${r.judged} verdadero(s) (${((r.precision ?? 0) * 100).toFixed(0)}%, ` +
          `Wilson95 [${((r.wilson?.lower ?? 0) * 100).toFixed(0)}%, ${((r.wilson?.upper ?? 0) * 100).toFixed(0)}%]) ` +
          `— por debajo del piso ${(PRECISION_FLOOR * 100).toFixed(0)}% (vigente)`,
      );
      const disappearedMessages = evaluation.disappeared.map(
        (d) =>
          `${d.kind}: DESAPARECIÓ del pool vivo — históricamente ${d.historicalTruePositive}/${d.historicalJudged} ` +
          `(${(d.historicalPrecision * 100).toFixed(0)}%) con ≥${MIN_JUDGED} veredictos, hoy 0 filas vigentes. ` +
          `Posible regresión silenciosa del detector — confirmar si se retiró a propósito.`,
      );

      const basisLostMessages = evaluation.basisLost.map(
        (b) =>
          `${b.kind}: PERDIÓ LA BASE de medición — históricamente ${b.historicalTruePositive}/${b.historicalJudged} ` +
          `(${(b.historicalPrecision * 100).toFixed(0)}%) con ≥${MIN_JUDGED} veredictos, hoy ${b.liveSampled} fila(s) viva(s) ` +
          `pero sólo ${b.liveJudged} veredicto(s) vigente(s). El kind sigue emitiendo y ya no se puede medir: ` +
          `re-muestrear y juzgar (scripts/sample-findings-for-judgment.mts) hasta recuperar ≥${MIN_JUDGED} vigentes. ` +
          `NO se resuelve bajando el piso.`,
      );

      const messages = [...brokenMessages, ...disappearedMessages, ...basisLostMessages];
      expect(messages, messages.join("\n")).toHaveLength(0);
    },
  );
});
