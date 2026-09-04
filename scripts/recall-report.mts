/**
 * EL INSTRUMENTO DE RECALL, mitad 2 de 2 (la que NO corre el analizador) —
 * hermano exacto de `precision-report.mts`, y por la misma razón que aquél
 * está separado del muestreador: éste sólo lee las planillas
 * (`tests/golden/precision/*.verdicts.csv`) y las mediciones ya cruzadas
 * (`tests/golden/precision/recall/*.recall.json`), así que se puede correr
 * cuantas veces haga falta sin esperar un análisis de corpus.
 *
 * LA PREGUNTA QUE RESPONDE, y que hasta la ola que lo agregó nadie podía
 * responder: de los hallazgos que un humano juzgó VERDADEROS, ¿cuántos sigue
 * emitiendo el analizador? El árbol tenía compuerta de precisión y ninguna de
 * recall, y esa asimetría premia borrar — cada ola se medía por los falsos que
 * sacaba y nunca por los verdaderos que perdía.
 *
 * Uso:
 *   npx tsx scripts/recall-report.mts                       # todo el corpus medido
 *   npx tsx scripts/recall-report.mts --por-lenguaje        # + desglose (kind, lenguaje)
 *   npx tsx scripts/recall-report.mts --perdidos            # + la lista fila por fila
 *   npx tsx scripts/recall-report.mts --exigir-vigente      # + exige snapshots frescos y base completa
 *
 * ═══ EL CÓDIGO DE SALIDA — arreglado en la Ola AI, frente AI2 ═══
 *
 * Durante OCHO olas este script SALÍA CON CÓDIGO 0 AUNQUE HUBIERA PÉRDIDAS SIN
 * DECLARAR: imprimía la lista y devolvía 0, porque su único `process.exit`
 * colgaba de `stale` y de nada más. Reproducido con esas palabras en el cierre
 * de cada una de esas ocho olas, y reproducido de nuevo por AI2 sobre una copia
 * aislada del árbol antes de tocar una línea. **La decisión de con qué código
 * sale vive ahora en `scripts/recall-exit.mts`, es pura, y está probada en las
 * dos direcciones en `scripts/recall-report.test.mts`** — el docstring de
 * `recall-exit.mts` tiene los tres agujeros medidos, uno por uno.
 *
 *   0 — sin fallas.
 *   2 — `--exigir-vigente` y hay snapshots viejos. CÓDIGO HISTÓRICO, sin cambios.
 *   3 — hay pérdidas SIN DECLARAR. Se chequea SIEMPRE, con flags o sin ellos.
 *   4 — `--exigir-vigente` y hay verdaderos medibles SIN MEDIR.
 *
 * `--exigir-vigente` es LA CONDICIÓN DEL INTEGRADOR, y está acá y no en la
 * compuerta a propósito. La compuerta (`recall-gate.test.ts`) no puede exigir
 * snapshots frescos: todo frente cambia el analizador, así que estaría roja
 * siempre y terminaría desactivada — el mismo argumento con el que
 * `AVISO-recall-ck-analyzer.md` descarta medir contra repos sin SHA congelado.
 * Al cierre de ola, en cambio, el integrador SÍ tiene que exigirlo: un verde
 * sobre snapshots medidos con el analizador de la ola anterior no dice nada.
 * Lo que NO depende del flag es el código 3: una pérdida silenciosa es un
 * defecto en cualquier momento de la ola, y que este script opinara distinto
 * que `recall-gate.test.ts` es exactamente lo que hizo posible el agujero.
 *
 * Un número que este reporte NO deja comprar: declarar una pérdida
 * (`lossReason` en la planilla) cambia el veredicto de la compuerta pero NUNCA
 * el recall. Un verdadero muerto está muerto lo haya justificado alguien o no.
 *
 * ═══ APUNTAR EL INSTRUMENTO A OTRO ÁRBOL ═══
 *
 * `CK_RECALL_PRECISION_DIR`, `CK_RECALL_SNAPSHOT_DIR` y `CK_RECALL_FINGERPRINT`
 * reemplazan los dos directorios que este script lee y la huella del analizador
 * contra la que compara la vigencia. Sirven para dos cosas reales:
 *
 *   · Correr el instrumento contra un RESPALDO sin tocar el árbol vivo. Y ahí la
 *     tercera variable no es un extra: un respaldo se midió con OTRO analizador,
 *     así que si no se declara con qué huella, los 21 snapshots salen "viejos" y
 *     el reporte no dice nada. Apuntar los directorios sin poder declarar la
 *     huella es una media función.
 *   · Que `recall-report.test.mts` pruebe el código de salida contra fixtures
 *     propios, en un directorio temporal. Probar esta compuerta inyectando en
 *     `tests/golden/precision/recall/` es lo que se venía haciendo A MANO en
 *     cada cierre de ola, y es exactamente donde un `cmp` olvidado deja una
 *     planilla corrupta para la ola siguiente.
 *
 * Sin las variables, los dos directorios son los de siempre y la huella es la
 * que calcula `analyzerFingerprint()` sobre el árbol de hoy.
 */
import fs from "node:fs";
import path from "node:path";

import { EXIT_OK, evaluateRecallExit, formatRecallExit } from "./recall-exit.mjs";
import { analyzerFingerprint } from "../src/server/services/analyze-cache.js";
import {
  evaluateRecallGate,
  formatRecallCells,
  HERITAGE_PREFIX,
  POBLACIONES_SIN_SHA_CONGELADO,
} from "../src/server/services/detect/precision/recall-logic.js";
import { readAllRecallSnapshots, RECALL_DIR } from "../src/server/services/detect/precision/recall-snapshot-io.js";
import { readPrecisionCsv } from "../src/server/services/detect/precision/verdicts-io.js";

const PRECISION_DIR = process.env.CK_RECALL_PRECISION_DIR
  ? path.resolve(process.env.CK_RECALL_PRECISION_DIR)
  : path.resolve(import.meta.dirname, "..", "tests", "golden", "precision");
const SNAPSHOT_DIR = process.env.CK_RECALL_SNAPSHOT_DIR ? path.resolve(process.env.CK_RECALL_SNAPSHOT_DIR) : RECALL_DIR;

function pct(x: number | null): string {
  return x === null ? "—" : `${(x * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const porLenguaje = argv.includes("--por-lenguaje");
  const listarPerdidos = argv.includes("--perdidos");
  const exigirVigente = argv.includes("--exigir-vigente");

  const rows = fs.existsSync(PRECISION_DIR)
    ? fs
        .readdirSync(PRECISION_DIR)
        .filter((f) => f.endsWith(".verdicts.csv"))
        .flatMap((f) => readPrecisionCsv(path.join(PRECISION_DIR, f)))
    : [];
  const snapshots = readAllRecallSnapshots(SNAPSHOT_DIR);
  if (snapshots.length === 0) {
    console.error(
      `Sin mediciones en ${SNAPSHOT_DIR}. Volcá los repos y corré scripts/recall-snapshot.mts primero — ver su docstring.`,
    );
    process.exit(1);
  }

  const fp = process.env.CK_RECALL_FINGERPRINT ?? (await analyzerFingerprint());
  const r = evaluateRecallGate(rows, snapshots, fp);

  console.log("═══ RECALL SOBRE LOS VERDADEROS JUZGADOS ═══");
  console.log(
    `  medidos ${r.measured} · VIVOS ${r.alive} (${pct(r.measured > 0 ? r.alive / r.measured : null)}) · ` +
      `perdidos ${r.measured - r.alive} — ${r.declaredLoss.length} declarada(s) ` +
      `(${r.inheritedLoss.length} heredada(s)) · ${r.silentLoss.length} SIN DECLARAR`,
  );
  console.log(`  cómo se encontraron vivos: ${r.aliveById} por id · ${r.aliveByContent} sólo por contenido`);

  console.log("\n— por población —");
  console.log(formatRecallCells(r.bySlug));

  console.log("\n— por kind —");
  console.log(formatRecallCells(r.byKind));

  console.log("\n— por lenguaje —");
  console.log(formatRecallCells(r.byLanguage));

  if (porLenguaje) {
    console.log("\n— por (kind, lenguaje) —");
    console.log(formatRecallCells(r.byKindLanguage));
  }

  if (r.declaredLoss.length > 0) {
    console.log(`\n— pérdidas DECLARADAS (${r.declaredLoss.length}) —`);
    for (const o of r.declaredLoss) {
      const marca = o.lossReason.startsWith(HERITAGE_PREFIX) ? "[deuda previa] " : "";
      console.log(`  ${marca}${o.kind} [${o.slug}] ${o.file}${o.symbol === "" ? "" : ` (${o.symbol})`}\n      ${o.lossReason}`);
    }
  }

  if (r.silentLoss.length > 0) {
    console.log(`\n— pérdidas SIN DECLARAR (${r.silentLoss.length}) — esto rompe recall-gate.test.ts —`);
    for (const o of r.silentLoss) {
      console.log(`  ${o.kind} [${o.slug}] ${o.file}${o.symbol === "" ? "" : ` (${o.symbol})`} — "${o.title}" · id=${o.id}`);
    }
  }

  if (listarPerdidos) {
    console.log("\n— TODOS los verdaderos medidos, fila por fila —");
    for (const c of r.byKind) console.log(`  ${c.key}: ${c.alive}/${c.measured}`);
  }

  if (r.unmeasured.length > 0) {
    console.log("\n— SIN MEDIR (ni vivo ni perdido: no se sabe) —");
    for (const u of r.unmeasured) {
      console.log(`  ${u.slug.padEnd(18)} ${u.judgedTrue} verdadero(s) · ${u.reason}`);
    }
    console.log(
      `  (\`poblacion-sin-sha-congelado\` = ${POBLACIONES_SIN_SHA_CONGELADO.join(", ")}: su código lo reescribimos nosotros,\n` +
        "   así que un verdadero desaparece porque el archivo ya no existe — no es una regresión del detector.\n" +
        "   Ver ola-p/informes/AVISO-recall-ck-analyzer.md.)",
    );
  }

  if (r.stale.length > 0) {
    console.log(`\n— SNAPSHOTS VIEJOS (${r.stale.length}) — medidos con OTRO analizador que el del árbol de hoy —`);
    for (const s of r.stale) console.log(`  ${s.slug.padEnd(18)} medido ${s.measuredAt}`);
    console.log("  Re-volcá esos repos y regenerá su snapshot antes de creerle al verde.");
  }

  // EL CÓDIGO DE SALIDA. Ocho olas de "sale 0 aunque haya pérdidas SIN DECLARAR"
  // terminan acá: la decisión es pura (`recall-exit.mts`), mira lo que el reporte
  // acaba de imprimir, y se prueba en las dos direcciones sin spawnear nada.
  const veredicto = evaluateRecallExit(r, { exigirVigente });
  if (veredicto.code !== EXIT_OK) {
    console.error(formatRecallExit(veredicto));
    process.exit(veredicto.code);
  }
}

await main();
