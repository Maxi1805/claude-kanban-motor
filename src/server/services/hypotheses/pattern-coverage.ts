/**
 * "SIN-INSUMO" VS "EVALUADO", DEL LADO DE LOS PATRONES — Ola A3, ítem 3.
 *
 * El lado de los detectores ya resuelve esta distinción: `DetectorCoverage`
 * (`detect/types.ts`) separa `sin-aristas`/`sin-grafo`/`no-aplicable` (no
 * llegó a intentarlo de verdad) de `corrio` (miró y decidió, aunque haya
 * decidido "cero"). `measure-hypothesis-states.mts` ya cuenta, por patrón,
 * cuántas hipótesis se construyeron esta corrida (`silentPatterns` = total
 * 0), pero un patrón en cero por falta de insumo y uno en cero porque
 * genuinamente se evaluó y no aplicó se ven IGUAL en ese conteo — el mismo
 * problema que motivó `needsEdges`/`sin-aristas`, ahora un nivel más arriba.
 *
 * POR QUÉ NO ES UN CAMPO EN `PatternHypothesis`: `HypothesisBuilder.build`
 * exige un `Finding` YA EXISTENTE como primer parámetro (`hypotheses/
 * types.ts`, "un patrón sin problema es inexpresable") — así que cuando el
 * detector-ancla de un patrón está `sin-aristas` (cero `Finding`s de ese
 * `kind`), NINGÚN `build()` de ese patrón llega a ejecutarse siquiera: no
 * hay ningún `PatternHypothesis` donde colgar un `missingEdgeKinds` propio,
 * porque no hay ningún objeto. La distinción sólo puede vivir AFUERA del
 * objeto — cruzando el registro de patrones (`HypothesisBuilder.anchors`)
 * contra la cobertura YA CALCULADA de sus detectores-ancla (`DETECTORS`).
 * Esto es la MISMA relación que ya cablea `attachHypotheses`
 * (`registry.filter((b) => b.anchors.includes(finding.kind))`), leída al
 * revés: en vez de "qué builders aplican a este Finding", "qué detectores
 * alimentan a este builder".
 *
 * Función PURA — sin tocar disco ni `analyzeRepo`, mismo espíritu que
 * `detect/language-coverage.ts#computeLanguageCoverage` — para que se pueda
 * testear con registros falsos y correr desde cualquier script (hoy:
 * `measure-hypothesis-states.mts`) sin acoplarse a su CLI.
 */

/** Los únicos dos status de detector que cuentan como "corrió de verdad" —
 *  el resto (`sin-grafo`/`sin-aristas`/`no-aplicable`/`sin-metricas`/`error`)
 *  significa "no llegó a intentarlo", nunca "lo intentó y no había nada". */
const RAN_FOR_REAL = new Set(["corrio", "presupuesto-agotado"]);

export type PatternCoverageStatus = "evaluado" | "sin-insumo";

/** Lo mínimo de `HypothesisBuilder` que esta función necesita — evita acoplar
 *  este módulo al tipo completo (`build`/`refresh` no hacen falta acá). */
export interface PatternAnchors {
  pattern: string;
  anchors: readonly string[];
}

/** Lo mínimo de `DetectorCoverage`/`CodeDetectorCoverage` que hace falta —
 *  mismo motivo. Acepta tanto la fila server-only como la que cruza a la UI. */
export interface DetectorCoverageLite {
  detectorId: string;
  kind: string;
  status: string;
}

/** Un `blockedBy` por fila: no colapsado por detector, porque un detector
 *  `intra-*` tiene UNA fila por lenguaje y las razones pueden diferir entre
 *  lenguajes ("no-aplicable" en Go, "sin-aristas" en Ruby). */
export interface PatternBlocker {
  detectorId: string;
  kind: string;
  status: string;
}

export interface PatternCoverage {
  pattern: string;
  status: PatternCoverageStatus;
  /** Cuántas hipótesis de este patrón se construyeron esta corrida (0 ⇒ lo que decide el resto de este tipo). */
  totalHypotheses: number;
  /**
   * Sólo con status `"sin-insumo"`: las filas de cobertura de TODOS los
   * detectores-ancla de este patrón, ninguna en `RAN_FOR_REAL` — la
   * evidencia de POR QUÉ ninguna hipótesis pudo construirse. Nunca vacío en
   * ese caso (si no hay ningún detector-ancla en absoluto, el status es
   * `"evaluado"` — ver `computePatternCoverage`, no hay insumo que culpar
   * de una ausencia que no se puede atribuir a nada concreto).
   */
  blockedBy?: readonly PatternBlocker[];
}

/**
 * Por cada patrón registrado: si construyó al menos una hipótesis esta
 * corrida, `"evaluado"` sin más (hubo Finding-ancla, `build()` corrió,
 * cuenta el resultado real, sea cual sea). Si NO construyó ninguna, la razón
 * depende de sus detectores-ancla:
 *
 *   - Si CUALQUIER fila de cobertura de CUALQUIER detector-ancla (en
 *     cualquier lenguaje, para los `intra-*`) corrió de verdad
 *     (`RAN_FOR_REAL`), el silencio es una lectura genuina: el detector SÍ
 *     tuvo oportunidad de producir el `Finding` que este patrón necesita
 *     como ancla y no lo hizo (o lo hizo y ningún `required` de la hipótesis
 *     se cumplió) — `"evaluado"`, no `"sin-insumo"`.
 *   - Si NINGUNA fila de NINGÚN detector-ancla corrió de verdad (todas
 *     `sin-grafo`/`sin-aristas`/`no-aplicable`/`sin-metricas`/`error`, o
 *     directamente no hay fila de cobertura para ese `kind`), el silencio es
 *     estructural: no hubo insumo, no que se evaluó y no aplicó —
 *     `"sin-insumo"`, con `blockedBy` listando la evidencia.
 *   - Caso borde: NINGÚN detector registrado tiene ese `kind` en absoluto
 *     (`anchorRows.length === 0` — el registro de patrones y el de
 *     detectores se desincronizaron, o el `kind` nunca se corrió esta
 *     corrida y no dejó ni una fila). Sin ninguna fila que citar como
 *     evidencia, no hay insumo faltante que nombrar con precisión — se
 *     reporta `"evaluado"` en vez de inventar una excusa sin respaldo.
 */
export function computePatternCoverage(
  patterns: readonly PatternAnchors[],
  totalHypothesesByPattern: ReadonlyMap<string, number>,
  detectorCoverage: readonly DetectorCoverageLite[],
): readonly PatternCoverage[] {
  return patterns.map((p): PatternCoverage => {
    const totalHypotheses = totalHypothesesByPattern.get(p.pattern) ?? 0;
    if (totalHypotheses > 0) {
      return { pattern: p.pattern, status: "evaluado", totalHypotheses };
    }

    const anchorRows = detectorCoverage.filter((r) => p.anchors.includes(r.kind));
    const ranForReal = anchorRows.some((r) => RAN_FOR_REAL.has(r.status));
    if (anchorRows.length === 0 || ranForReal) {
      return { pattern: p.pattern, status: "evaluado", totalHypotheses };
    }

    return {
      pattern: p.pattern,
      status: "sin-insumo",
      totalHypotheses,
      blockedBy: anchorRows.map((r) => ({ detectorId: r.detectorId, kind: r.kind, status: r.status })),
    };
  });
}
