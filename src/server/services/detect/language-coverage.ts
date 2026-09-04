/**
 * Cobertura MEDIDA POR LENGUAJE — CONTRATO-F6.md Contrato 2.
 *
 * Pedido explícito del usuario: poder PROBAR que el sistema sirve para los 9
 * lenguajes soportados, sin privilegiar ninguno. Este módulo es la lógica
 * PURA (sin tocar disco, sin `analyzeRepo`) que agrega una lista de muestras
 * por repo (`RepoCoverageSample`, una por repo del corpus) en una matriz
 * `(lenguaje, detector)` y decide, celda por celda, si un detector "mudo"
 * (corrió y no encontró nada) tiene una razón declarada o es un hueco.
 *
 * Quién produce las muestras: `scripts/language-coverage.mts`, UN proceso por
 * repo (mismo motivo que `census.ts#censusRepo`: dos `analyzeRepo` en el
 * mismo proceso corrompen el caché de `require` de `web-tree-sitter`). Este
 * archivo nunca importa `code-analyzer.ts` ni `analyzeRepo` — sólo conoce la
 * forma ya serializada.
 *
 * `silentIn` — CONTRATO-F6.md §2.4: la razón de un detector mudo vive en el
 * propio detector (`<detector>.ts`, campo opcional), NO en un archivo central
 * nuevo.
 *
 * OLA 11b (frente B1): `DetectorBase` (`detect/types.ts`) YA DECLARA el
 * campo. Durante cuatro olas no lo declaró y este archivo lo leía por
 * duck-typing contra una forma local, esperando a "otro agente" que nunca
 * llegó — ese rodeo se retira acá: `silentReasonOf` lee `detector.silentIn`
 * directo, tipado. `DetectorWithSilence` se conserva como alias del tipo
 * `Detector` para no romper a los tests que ya lo importan, pero ya no
 * ensancha nada.
 */
import type { CoverageStatus, Detector, Scope } from "./types.js";

/** Los 9 lenguajes que la tarea pide medir — orden fijo, el mismo en todas las tablas. */
export const LANGUAGES_MEASURED = [
  "ruby",
  "typescript",
  "tsx",
  "javascript",
  "vue",
  "python",
  "go",
  "java",
  "csharp",
] as const;
export type MeasuredLanguage = (typeof LANGUAGES_MEASURED)[number];

/**
 * Piso de medición — CONTRATO-F6.md §2.5. `[provisional]`: el contrato pide
 * derivarlo por remuestreo de java (k = 10..800, 30 réplicas, ver a partir de
 * qué k el conjunto de detectores que disparan se estabiliza) y ESTA tarea no
 * volvió a correr ese remuestreo — se hereda el número que el contrato ya
 * declara provisional. Bajarlo a definitivo es un cambio propio, con la
 * medición adjunta (misma regla que `ceiling`/`provisional` en `hypotheses`).
 */
export const MEASUREMENT_FLOOR_FILES = 150;
export const MEASUREMENT_FLOOR_KLOC = 15;

/** Estadística de un lenguaje DENTRO de un repo — archivos analizados y líneas. */
export interface RepoLanguageFacts {
  filesAnalysed: number;
  lines: number;
}

/**
 * Forma JSON-safe de una fila de cobertura — mismos campos que
 * `detect/types.ts#DetectorCoverage`, sin `readonly` (el worker la arma) y
 * con `missingEdgeKinds`/`missingMetrics` como `string[]` llano (no hace
 * falta el tipo `EdgeKind` acá: esto sólo viaja y se muestra).
 */
export interface DetectorCoverageRow {
  detectorId: string;
  title: string;
  scope: Scope;
  kind: string;
  language?: string;
  status: CoverageStatus;
  missingCapabilities?: readonly string[];
  missingEdgeKinds?: readonly string[];
  missingMetrics?: readonly string[];
  unitsConsidered: number;
  findings: number;
  error?: string;
}

/**
 * Lo que `scripts/language-coverage.mts` produce por repo. `coverage` es
 * `analysis.coverage` tal cual (una fila por `(detectorId, language)` para
 * intra-*, una fila repo-wide sin `language` para inter-file — MISMA regla
 * que `detect/types.ts#DetectorCoverage`).
 *
 * `interFileFindingsByLanguage`: SÓLO para detectores `inter-file`, que no
 * traen `language` en su fila de cobertura (son repo-wide). Atribución por
 * ARCHIVO DE LA PRIMER UBICACIÓN de cada hallazgo (aproximación declarada: la
 * ubicación ancla, no todas — un hallazgo cuyas ubicaciones cruzan lenguajes
 * queda atribuido a la del primer lugar, igual que "represntative" en el
 * resto del panel). Clave de lenguaje `"*cruzado*"` cuando el archivo de la
 * primera ubicación no se pudo resolver a un lenguaje conocido de este repo.
 */
export interface RepoCoverageSample {
  slug: string;
  languageFacts: Record<string, RepoLanguageFacts>;
  coverage: readonly DetectorCoverageRow[];
  interFileFindingsByLanguage: Record<string, Record<string, number>>;
}

/**
 * Alias histórico de `Detector`. Antes de la Ola 11b ensanchaba el tipo con
 * `silentIn` porque `DetectorBase` no lo declaraba; ahora lo declara, así que
 * esto es `Detector` a secas. Se conserva exportado sólo para no romper los
 * tests que ya lo importan por nombre.
 */
export type DetectorWithSilence = Detector;

export function silentReasonOf(detector: Detector, language: string): string | undefined {
  return detector.silentIn?.[language];
}

/**
 * CONTRATO-F6.md §2.2: por qué prevalece el "peor" status cuando el mismo
 * `(detector, lenguaje)` aparece en varios repos del corpus con estados
 * distintos (posible sobre todo en inter-file, donde `no-aplicable` depende
 * de la UNIÓN de lenguajes de CADA repo — dos repos con el mismo lenguaje de
 * destino pueden divergir si el resto de su mezcla de lenguajes difiere).
 * Mismo orden que `code-analyzer.ts#aggregateCoverage` — no una escala nueva.
 */
const STATUS_RANK: Record<CoverageStatus, number> = {
  error: 0,
  "presupuesto-agotado": 1,
  "no-aplicable": 2,
  "sin-grafo": 3,
  "sin-aristas": 4,
  "sin-metricas": 5,
  corrio: 6,
};

interface CombinedStatus {
  status: CoverageStatus;
  missingCapabilities?: string[];
  missingEdgeKinds?: string[];
  missingMetrics?: string[];
}

function combineStatuses(
  rows: readonly Pick<DetectorCoverageRow, "status" | "missingCapabilities" | "missingEdgeKinds" | "missingMetrics">[],
): CombinedStatus {
  let worst: CoverageStatus = "corrio";
  for (const row of rows) if (STATUS_RANK[row.status] < STATUS_RANK[worst]) worst = row.status;
  const contributing = rows.filter((r) => r.status === worst);
  const missingCapabilities = [...new Set(contributing.flatMap((r) => r.missingCapabilities ?? []))];
  const missingEdgeKinds = [...new Set(contributing.flatMap((r) => r.missingEdgeKinds ?? []))];
  const missingMetrics = [...new Set(contributing.flatMap((r) => r.missingMetrics ?? []))];
  return {
    status: worst,
    missingCapabilities: missingCapabilities.length ? missingCapabilities : undefined,
    missingEdgeKinds: missingEdgeKinds.length ? missingEdgeKinds : undefined,
    missingMetrics: missingMetrics.length ? missingMetrics : undefined,
  };
}

/** Una celda de la matriz 9 × 38 (o 9 × N para un subconjunto de detectores en un test). */
export interface LanguageDetectorCell {
  language: string;
  detectorId: string;
  title: string;
  scope: Scope;
  kind: string;
  status: CoverageStatus;
  missingCapabilities?: string[];
  missingEdgeKinds?: string[];
  missingMetrics?: string[];
  filesAnalysed: number;
  kloc: number;
  findings: number;
  findingsPerKloc: number | null;
  silenceReason?: string;
  /** El LENGUAJE está bajo el piso de medición — no el detector. Ver §2.5. */
  sampleInsufficient: boolean;
  /** En cuántos repos del corpus aparece este `(lenguaje, detector)` — diagnóstico, no entra en el veredicto. */
  repoCount: number;
}

/**
 * Los 5 casos de la compuerta (CONTRATO-F6.md §2.3) más el catch-all que el
 * contrato exige que falle ("cualquier otra combinación"). `no-aplicable`/
 * `sin-aristas`/`sin-metricas` YA garantizan su lista no vacía por el tipo
 * (`detect/types.ts`, "Nunca vacío en ese caso") — se revalida acá de todos
 * modos porque esta capa no confía ciegamente en esa garantía ajena (si algún
 * día se rompe, la compuerta lo dice, no la esconde).
 */
export type CellVerdict = "ok" | "mudo-sin-razon" | "estado-no-contemplado";

export function verdictFor(cell: LanguageDetectorCell): CellVerdict {
  if (cell.sampleInsufficient) return "ok"; // caso 5
  switch (cell.status) {
    case "corrio":
      if (cell.findings > 0) return "ok"; // caso 1
      return cell.silenceReason ? "ok" : "mudo-sin-razon"; // caso 4 / EL HUECO
    case "no-aplicable":
      return (cell.missingCapabilities?.length ?? 0) > 0 ? "ok" : "estado-no-contemplado"; // caso 2
    case "sin-grafo":
      return "ok"; // caso 3 (sin lista propia: el status ya lo dice todo)
    case "sin-aristas":
      return (cell.missingEdgeKinds?.length ?? 0) > 0 ? "ok" : "estado-no-contemplado"; // caso 3
    case "sin-metricas":
      return (cell.missingMetrics?.length ?? 0) > 0 ? "ok" : "estado-no-contemplado"; // caso 3
    case "presupuesto-agotado":
      // OLA 11b (frente B1, ítem D1) — CORRECCIÓN DEL VEREDICTO, con el
      // argumento escrito porque cambia lo que la compuerta acepta.
      //
      // Hasta esta ola `presupuesto-agotado` caía en el catch-all junto con
      // `error` y rompía la compuerta SIEMPRE. Eso convertía en "celda muda
      // sin razón declarada" a la celda MENOS muda que existe: el detector
      // corrió, encontró MÁS de lo que su `maxFindings` le dejaba reportar, y
      // se truncó. Lo que esta compuerta persigue es lo contrario — un
      // detector que no encuentra nada en un lenguaje y no dice por qué.
      //
      // Las dos mitades NO son la misma cosa y por eso se parten:
      //
      //   findings > 0  ⇒ ok. Es la evidencia más fuerte posible de que el
      //     detector SÍ funciona en ese lenguaje. Que además esté truncado es
      //     un problema de volumen del detector (su `maxFindings`), no de
      //     cobertura por lenguaje, y tiene su propio lugar donde discutirse.
      //
      //   findings === 0 ⇒ SIGUE ROMPIENDO. Acá el truncamiento es peligroso
      //     de verdad: `run.ts#capDetectorFindings` conserva el top-N por
      //     severidad, así que los hallazgos de UN lenguaje entero pueden
      //     quedar del lado cortado. La celda se ve muda y no lo está, y
      //     nadie puede distinguirlo desde afuera. Es exactamente el tipo de
      //     cero disfrazado que esta compuerta existe para atrapar.
      //
      // Medido en la Ola 11b sobre `tests/fixtures/patterns` (sin corpus en
      // disco): las 6 celdas `presupuesto-agotado` del registro son UN solo
      // evento de truncamiento — `unused-symbol`, un detector `inter-file`
      // cuyo status es REPO-WIDE, repartido en 6 lenguajes por la atribución
      // de `interFileFindingsByLanguage`. Las 6 tienen findings > 0
      // (typescript 36, vue 43, javascript 42, ruby 41, python 37, go 1).
      return cell.findings > 0 ? "ok" : "estado-no-contemplado";
    default:
      // "error": el contrato no lo nombra entre los casos habilitados —
      // "cualquier otra combinación falla la compuerta" (§2.3), literal. Un
      // detector que explotó no dice NADA sobre el lenguaje.
      return "estado-no-contemplado";
  }
}

export interface LanguageHeader {
  language: string;
  filesAnalysed: number;
  kloc: number;
  findings: number;
  findingsPerKloc: number | null;
  repoCount: number;
  sampleInsufficient: boolean;
  detectorsRan: number;
  detectorsNoAplicable: number;
  detectorsBloqueado: number;
  detectorsMudoConRazon: number;
  detectorsMudoSinRazon: number;
  /**
   * OLA 11b — `presupuesto-agotado` CON hallazgos. `verdictFor` ya no lo
   * cuenta como incumplimiento (ver su comentario), pero sigue siendo un
   * problema REAL que la tabla tiene que mostrar: el detector encontró más de
   * lo que su `maxFindings` le deja reportar y lo que sobra se pierde por
   * severidad. Existe esta columna para que la corrección del veredicto NO
   * esconda el truncamiento — si el número no estuviera a la vista, la
   * corrección sería un silenciamiento.
   */
  detectorsTruncado: number;
  /** `error`, y `presupuesto-agotado` SIN hallazgos — el catch-all de `verdictFor`, fuera de los casos con nombre. Ver §2.3. */
  detectorsOtroIncumplimiento: number;
}

export interface JavaDependency {
  javaFileShare: number;
  javaFindingsShare: number;
  /** Detectores con >=1 hallazgo en el corpus, pero SÓLO en java. */
  detectorsFiringOnlyInJava: string[];
  /** Detectores con >=1 hallazgo en el corpus, en al menos un lenguaje ≠ java. */
  detectorsFiringBeyondJava: number;
  totalDetectorsWithAnyFinding: number;
}

/**
 * P5 (esta ola), CONTRATO-F6.md §2.5: partición EXPLÍCITA y verificable por
 * test de `headers` en "auditado" (`sampleInsufficient === false`: el
 * detector corrió sobre volumen real, por encima del piso de medición) vs
 * "muestra insuficiente" (aprobado hoy sólo porque no hubo con qué
 * desmentirlo — nunca "sin problemas"). Con `MEASUREMENT_FLOOR_FILES=150` /
 * `MEASUREMENT_FLOOR_KLOC=15` y el corpus de 8 repos, `audited` da 3/9
 * (java, csharp, typescript) — medido, no un literal a mano. Existe para que
 * ningún resumen pueda mostrar sólo `measured` (9) y leerse como "cobertura
 * de 9 lenguajes": `renderAuditSummary` siempre imprime numerador Y
 * denominador juntos.
 */
export interface LanguageAuditSummary {
  /** Cuántos lenguajes pidió medir esta corrida (`languages.length`, típicamente 9). */
  measured: number;
  /** Lenguajes con evidencia real (muestra >= piso) — orden de `languages`. */
  audited: readonly string[];
  /** Lenguajes "ok" hoy sólo por falta de muestra — orden de `languages`. */
  insufficientSample: readonly string[];
}

export interface LanguageCoverageReport {
  headers: LanguageHeader[];
  cells: LanguageDetectorCell[];
  violations: LanguageDetectorCell[];
  javaDependency: JavaDependency;
  audit: LanguageAuditSummary;
}

function round(n: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function findingsPerKloc(findings: number, kloc: number): number | null {
  return kloc > 0 ? round(findings / kloc) : null;
}

/**
 * EL AGREGADOR. Puro: no lee disco, no llama `analyzeRepo`. `languages`
 * limita qué filas de la matriz se construyen (default: los 9 medidos);
 * `detectors` es el registro completo (o un subconjunto, en test).
 */
export function computeLanguageCoverage(
  samples: readonly RepoCoverageSample[],
  detectors: readonly Detector[],
  languages: readonly string[] = LANGUAGES_MEASURED,
): LanguageCoverageReport {
  // Cabecera por lenguaje: archivos/KLOC/repoCount, INDEPENDIENTE del detector.
  const langFiles = new Map<string, number>();
  const langLines = new Map<string, number>();
  const langRepoCount = new Map<string, number>();
  for (const lang of languages) {
    langFiles.set(lang, 0);
    langLines.set(lang, 0);
    langRepoCount.set(lang, 0);
  }
  for (const sample of samples) {
    for (const [lang, facts] of Object.entries(sample.languageFacts)) {
      if (!languages.includes(lang)) continue;
      langFiles.set(lang, (langFiles.get(lang) ?? 0) + facts.filesAnalysed);
      langLines.set(lang, (langLines.get(lang) ?? 0) + facts.lines);
      langRepoCount.set(lang, (langRepoCount.get(lang) ?? 0) + 1);
    }
  }

  const cells: LanguageDetectorCell[] = [];
  const totalFilesAllLanguages = [...langFiles.values()].reduce((a, b) => a + b, 0);
  const javaFileShare = totalFilesAllLanguages > 0 ? round((langFiles.get("java") ?? 0) / totalFilesAllLanguages, 4) : 0;

  let totalFindingsAllLanguages = 0;
  let javaFindings = 0;
  const findingsByDetectorLanguage = new Map<string, Map<string, number>>(); // detectorId -> lang -> findings

  for (const lang of languages) {
    const sampleInsufficient = (langFiles.get(lang) ?? 0) < MEASUREMENT_FLOOR_FILES || (langLines.get(lang) ?? 0) / 1000 < MEASUREMENT_FLOOR_KLOC;
    const kloc = (langLines.get(lang) ?? 0) / 1000;

    for (const detector of detectors) {
      const reason = silentReasonOf(detector, lang);
      let rows: Pick<DetectorCoverageRow, "status" | "missingCapabilities" | "missingEdgeKinds" | "missingMetrics">[];
      let unitsConsidered = 0;
      let findings = 0;
      let repoCount = 0;

      if (detector.scope === "inter-file") {
        rows = [];
        for (const sample of samples) {
          if (!(lang in sample.languageFacts)) continue; // este repo ni siquiera tiene el lenguaje
          const row = sample.coverage.find((r) => r.detectorId === detector.id && r.scope === "inter-file");
          if (!row) continue;
          repoCount += 1;
          rows.push(row);
          findings += sample.interFileFindingsByLanguage[detector.id]?.[lang] ?? 0;
        }
        unitsConsidered = langFiles.get(lang) ?? 0; // no hay unidad propia por lenguaje en inter-file — ver docstring del tipo.
      } else {
        rows = [];
        for (const sample of samples) {
          const row = sample.coverage.find((r) => r.detectorId === detector.id && r.language === lang);
          if (!row) continue;
          repoCount += 1;
          rows.push(row);
          unitsConsidered += row.unitsConsidered;
          findings += row.findings;
        }
      }

      totalFindingsAllLanguages += findings;
      if (lang === "java") javaFindings += findings;
      if (!findingsByDetectorLanguage.has(detector.id)) findingsByDetectorLanguage.set(detector.id, new Map());
      findingsByDetectorLanguage.get(detector.id)!.set(lang, findings);

      if (rows.length === 0) continue; // el lenguaje no aparece en NINGÚN repo de esta corrida — no hay celda que mostrar (misma regla que `aggregateCoverage`, no se sintetiza "no aplicable" de la nada).

      const combined = combineStatuses(rows);
      cells.push({
        language: lang,
        detectorId: detector.id,
        title: detector.title,
        scope: detector.scope,
        kind: detector.kind,
        status: combined.status,
        missingCapabilities: combined.missingCapabilities,
        missingEdgeKinds: combined.missingEdgeKinds,
        missingMetrics: combined.missingMetrics,
        filesAnalysed: unitsConsidered,
        kloc: round(kloc),
        findings,
        findingsPerKloc: findingsPerKloc(findings, kloc),
        silenceReason: reason,
        sampleInsufficient,
        repoCount,
      });
    }
  }

  const violations = cells.filter((c) => verdictFor(c) !== "ok");

  const headers: LanguageHeader[] = languages.map((lang) => {
    const langCells = cells.filter((c) => c.language === lang);
    const findings = langCells.reduce((sum, c) => sum + c.findings, 0);
    const kloc = (langLines.get(lang) ?? 0) / 1000;
    return {
      language: lang,
      filesAnalysed: langFiles.get(lang) ?? 0,
      kloc: round(kloc),
      findings,
      findingsPerKloc: findingsPerKloc(findings, kloc),
      repoCount: langRepoCount.get(lang) ?? 0,
      sampleInsufficient: (langFiles.get(lang) ?? 0) < MEASUREMENT_FLOOR_FILES || kloc < MEASUREMENT_FLOOR_KLOC,
      detectorsRan: langCells.filter((c) => c.status === "corrio" && c.findings > 0).length,
      detectorsNoAplicable: langCells.filter((c) => c.status === "no-aplicable").length,
      detectorsBloqueado: langCells.filter((c) => c.status === "sin-grafo" || c.status === "sin-aristas" || c.status === "sin-metricas").length,
      detectorsMudoConRazon: langCells.filter((c) => c.status === "corrio" && c.findings === 0 && !!c.silenceReason).length,
      detectorsMudoSinRazon: langCells.filter((c) => verdictFor(c) === "mudo-sin-razon").length,
      detectorsTruncado: langCells.filter((c) => c.status === "presupuesto-agotado" && c.findings > 0).length,
      detectorsOtroIncumplimiento: langCells.filter((c) => verdictFor(c) === "estado-no-contemplado").length,
    };
  });

  // "Cuánto de la genericidad afirmada se apoya en java" — pedido explícito
  // de la tarea: para cada detector con >=1 hallazgo EN ALGÚN lenguaje del
  // corpus, ¿disparó en algo que NO sea java?
  const detectorsFiringOnlyInJava: string[] = [];
  let detectorsFiringBeyondJava = 0;
  let totalDetectorsWithAnyFinding = 0;
  for (const [detectorId, byLang] of findingsByDetectorLanguage) {
    const totalForDetector = [...byLang.values()].reduce((a, b) => a + b, 0);
    if (totalForDetector === 0) continue;
    totalDetectorsWithAnyFinding += 1;
    const beyondJava = [...byLang.entries()].some(([lang, n]) => lang !== "java" && n > 0);
    if (beyondJava) detectorsFiringBeyondJava += 1;
    else detectorsFiringOnlyInJava.push(detectorId);
  }

  const audit: LanguageAuditSummary = {
    measured: languages.length,
    audited: headers.filter((h) => !h.sampleInsufficient).map((h) => h.language),
    insufficientSample: headers.filter((h) => h.sampleInsufficient).map((h) => h.language),
  };

  return {
    headers,
    cells,
    violations,
    javaDependency: {
      javaFileShare,
      javaFindingsShare: totalFindingsAllLanguages > 0 ? round(javaFindings / totalFindingsAllLanguages, 4) : 0,
      detectorsFiringOnlyInJava: detectorsFiringOnlyInJava.sort(),
      detectorsFiringBeyondJava,
      totalDetectorsWithAnyFinding,
    },
    audit,
  };
}

/**
 * La frase que evita la lectura errónea "cobertura de 9 lenguajes" cuando en
 * realidad se auditaron 3 — CONTRATO-F6.md §2.5. Numerador y denominador
 * SIEMPRE juntos; nunca imprime `measured` solo. Si algún lenguaje quedó sin
 * auditar, agrega una línea que lo dice de forma literal (no una nota al pie
 * que se pueda recortar).
 */
export function renderAuditSummary(audit: LanguageAuditSummary): string {
  const { measured, audited, insufficientSample } = audit;
  const lines = [
    `AUDITADO (evidencia real, muestra >= piso de medición): ${audited.length}/${measured} lenguajes${audited.length > 0 ? ` — ${audited.join(", ")}` : ""}.`,
    `MUESTRA INSUFICIENTE (sin evidencia real de silencio, NO "sin problemas"): ${insufficientSample.length}/${measured} lenguajes${insufficientSample.length > 0 ? ` — ${insufficientSample.join(", ")}` : ""}.`,
  ];
  if (audited.length < measured) {
    lines.push(`NO es cobertura de ${measured} lenguajes: sólo ${audited.length}/${measured} fueron auditados con evidencia real.`);
  }
  return lines.join("\n");
}

/** Tabla markdown de la cabecera por lenguaje — lo que el informe imprime primero. */
export function renderHeaderTable(headers: readonly LanguageHeader[]): string {
  const lines = [
    "| lenguaje | archivos | KLOC | hallazgos | hallazgos/KLOC | corrieron | no-aplicable | bloqueado | truncado | mudo c/razón | **MUDO SIN RAZÓN** | otro incumplimiento | muestra |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const h of headers) {
    lines.push(
      `| ${h.language} | ${h.filesAnalysed} | ${h.kloc} | ${h.findings} | ${h.findingsPerKloc ?? "—"} | ${h.detectorsRan} | ${h.detectorsNoAplicable} | ${h.detectorsBloqueado} | ${h.detectorsTruncado} | ${h.detectorsMudoConRazon} | **${h.detectorsMudoSinRazon}** | ${h.detectorsOtroIncumplimiento} | ${h.sampleInsufficient ? "insuficiente" : "ok"} |`,
    );
  }
  return lines.join("\n");
}
