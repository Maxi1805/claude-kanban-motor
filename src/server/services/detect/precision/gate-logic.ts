/**
 * LÓGICA PURA de la compuerta de precisión — separada de `gate.test.ts` (que
 * sólo lee `tests/golden/precision/*.verdicts.csv` y llama a esto) para poder
 * probar el criterio de la compuerta con datos sintéticos, sin depender de
 * las planillas reales del corpus ni de correr el analizador.
 *
 * DEFECTO 2 QUE ESTO CORRIGE — "la compuerta no puede ver los arreglos": la
 * versión anterior de `gate.test.ts` leía la unión de TODAS las filas de
 * TODAS las planillas, vivas y muertas, sin filtrar por `stillPresent`. Eso
 * infla el denominador con hallazgos que el detector YA NO EMITE — medido:
 * `homonymous-delegation` reportaba 39% (mezclando filas muertas del
 * detector viejo) cuando el kind VIVO mide 83% (el arreglo funcionó, la
 * compuerta simplemente no lo veía).
 *
 * La corrección — filtrar por vigencia — es EXACTAMENTE el cambio que una
 * integración anterior identificó pero decidió NO tomar por su cuenta,
 * documentado en `PENDIENTES.md`: hacerlo la pondría verde de contrabando.
 * Acá se toma a propósito, con DOS condiciones que el encargo exige:
 *
 *   1. `disappeared` — un kind no puede desaparecer del pool vivo EN
 *      SILENCIO. Si `historical` (todas las filas) tenía `judged >=
 *      minJudged` para un kind y `live` (sólo `stillPresent`) no tiene NI UNA
 *      fila de ese kind, es una posible regresión del detector (dejó de
 *      emitir algo que antes emitía y que un humano ya había juzgado) — y
 *      `evaluateGate` lo reporta, no lo esconde. Un kind que se REDUCE (sigue
 *      con alguna fila viva, aunque menos) no dispara esto — eso es la
 *      medida funcionando, no una regresión.
 *   2. El número viejo (`historical`) viaja SIEMPRE junto al vigente
 *      (`live`) en el resultado — quien llama a esto puede imprimir ambos
 *      lado a lado para auditar el cambio, nunca sólo el que conviene.
 *
 * EL TERCER AGUJERO, encontrado por la AUDITORÍA de la integración de la Ola
 * J (`scripts/j-auditar-compuerta.mts`) y cerrado acá con `basisLost`. Las
 * dos condiciones de arriba cubren la desaparición TOTAL de un kind. No
 * cubrían la forma más común de la misma pérdida: **el kind sigue emitiendo,
 * pero se le mueren los VEREDICTOS**. Un detector que cambia de forma deja
 * huérfanas sus filas juzgadas (el contenido citado ya no se emite) y las
 * reemplaza por filas vivas que nadie juzgó todavía. Entonces:
 *   - `disappeared` NO dispara — el kind tiene filas vivas.
 *   - `brokenPrecision` NO dispara — exige `judged >= minJudged` entre las
 *     vivas, y ya no las hay.
 * El kind se cae de las dos cláusulas y la compuerta queda verde sobre él sin
 * decir una palabra. Medido sobre las planillas reales el día de la
 * auditoría: **4 kinds ya estaban en ese estado** (`feature-envy-inter`
 * 0/11 histórico → 0/2 vivo, `feature-envy-intra` 0/8 → 0/1,
 * `fanout-without-cohesion` 3/5 → 2/4, `primitive-obsession` 12/14 → 4/4), y
 * el primero de ellos, con la compuerta ANTERIOR (que no filtraba por
 * vigencia), habría entrado a `brokenPrecision` con 0% sobre n=11. Es decir:
 * el filtro por vigencia, sin esta tercera cláusula, SÍ se podía usar para
 * apagar un rojo. `basisLost` lo impide — la base de medición de un kind no
 * se puede evaporar en silencio, igual que el kind no puede desaparecer en
 * silencio. La salida NO es bajar el piso: es volver a muestrear y juzgar ese
 * kind hasta recuperar `minJudged` veredictos vigentes.
 *
 * `mergeRows` (`verdicts-io.ts`) ya tiene el antecedente de la misma clase de
 * error — ahí `stillPresent` se calculaba contra la MUESTRA de la corrida en
 * vez de contra el pool vivo completo, y "precisión después del arreglo" fue
 * inmedible durante seis olas hasta que se corrigió. Acá el riesgo análogo
 * sería calcular `disappeared` contra algo que no sea el conjunto COMPLETO
 * de filas de la planilla — por eso `evaluateGate` recibe `rows` entero
 * (todas las filas, de todas las planillas) y filtra INTERNAMENTE, nunca
 * recibe un `live`/`historical` ya separados por el llamador.
 */
import { buildPrecisionReport, MIN_JUDGED_FOR_SIGNAL, type KindPrecisionReport } from "./report.js";
import type { PrecisionRow } from "./types.js";

/** Deliberadamente bajo — ver el docstring de `gate.test.ts`: la primera ola de un instrumento con pocas filas por kind no puede pedir 0.90 con confianza. */
export const PRECISION_FLOOR = 0.5;
/** Mismo piso que `report.ts#MIN_JUDGED_FOR_SIGNAL` — reexportado acá para que `gate.test.ts` no importe de dos módulos el mismo número con dos nombres. */
export const MIN_JUDGED = MIN_JUDGED_FOR_SIGNAL;

export interface GateOptions {
  floor: number;
  minJudged: number;
}

export interface DisappearedKind {
  kind: string;
  historicalJudged: number;
  historicalTruePositive: number;
  /** El `precision` histórico — nunca `null` acá: `disappeared` sólo incluye kinds con `historicalJudged >= minJudged`, que ya implica `judged > 0`. */
  historicalPrecision: number;
}

/**
 * Un kind que SIGUE VIVO pero cuya BASE DE MEDICIÓN se evaporó: tenía
 * `>= minJudged` veredictos en el histórico y hoy tiene menos de `minJudged`
 * entre sus filas vigentes. Ver el "TERCER AGUJERO" en el docstring del módulo.
 */
export interface BasisLostKind {
  kind: string;
  historicalJudged: number;
  historicalTruePositive: number;
  historicalPrecision: number;
  /** Cuántos veredictos quedan entre las filas VIVAS — por construcción, `< minJudged`. */
  liveJudged: number;
  /** Cuántas filas vivas tiene el kind (juzgadas o no) — si fuera 0 sería `disappeared`, no esto. */
  liveSampled: number;
}

export interface GateResult {
  /** Reporte por kind sobre SÓLO las filas `stillPresent` — lo que el analizador emite hoy. Lo que manda para `brokenPrecision`. */
  live: readonly KindPrecisionReport[];
  /** Reporte por kind sobre TODAS las filas (vivas y muertas) — el número viejo, para auditar al lado del vigente. */
  historical: readonly KindPrecisionReport[];
  /** Kinds vivos, con `judged >= minJudged`, por debajo de `floor` — el criterio clásico de la compuerta, ahora medido sólo sobre lo vigente. */
  brokenPrecision: readonly KindPrecisionReport[];
  /** Kinds con `historicalJudged >= minJudged` que no tienen NI UNA fila viva — posible regresión silenciosa del detector, nunca invisible. */
  disappeared: readonly DisappearedKind[];
  /** Kinds que siguen vivos pero perdieron la base de medición que ya tenían — el tercer agujero, ver el docstring del módulo. */
  basisLost: readonly BasisLostKind[];
}

const DEFAULT_OPTIONS: GateOptions = { floor: PRECISION_FLOOR, minJudged: MIN_JUDGED };

/**
 * `rows` — TODAS las filas de TODAS las planillas, vivas y muertas; filtrar
 * por vigencia es responsabilidad de ESTA función, nunca del llamador (ver
 * el docstring del módulo, el antecedente de `mergeRows`).
 */
export function evaluateGate(rows: readonly PrecisionRow[], opts: GateOptions = DEFAULT_OPTIONS): GateResult {
  const historical = buildPrecisionReport(rows);
  const live = buildPrecisionReport(rows.filter((r) => r.stillPresent));
  const liveKinds = new Set(live.map((r) => r.kind));

  const brokenPrecision = live.filter(
    (r) => r.judged >= opts.minJudged && r.precision !== null && r.precision < opts.floor,
  );

  const disappeared: DisappearedKind[] = historical
    .filter((r) => r.judged >= opts.minJudged && !liveKinds.has(r.kind))
    .map((r) => ({
      kind: r.kind,
      historicalJudged: r.judged,
      historicalTruePositive: r.truePositive,
      // `r.precision` no puede ser `null` acá: `judged >= opts.minJudged` (>=1 en la práctica, minJudged>=1) ya implica `judged > 0`.
      historicalPrecision: r.precision ?? 0,
    }));

  const liveByKind = new Map(live.map((r) => [r.kind, r]));
  const basisLost: BasisLostKind[] = historical
    .filter((r) => r.judged >= opts.minJudged && liveKinds.has(r.kind))
    .filter((r) => (liveByKind.get(r.kind)?.judged ?? 0) < opts.minJudged)
    .map((r) => {
      const l = liveByKind.get(r.kind);
      return {
        kind: r.kind,
        historicalJudged: r.judged,
        historicalTruePositive: r.truePositive,
        historicalPrecision: r.precision ?? 0,
        liveJudged: l?.judged ?? 0,
        liveSampled: l?.sampledTotal ?? 0,
      };
    });

  return { live, historical, brokenPrecision, disappeared, basisLost };
}
