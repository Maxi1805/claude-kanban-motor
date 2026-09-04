/**
 * El muestreo mismo — puro, sin tocar disco (la lectura de la línea de
 * evidencia y la persistencia en CSV viven en el CLI y en `verdicts-io.ts`
 * respectivamente, para que esto se pueda probar sin analizar ningún repo).
 */
import type { CodeFinding } from "../../../../shared/types.js";
import type { PrecisionRow } from "./types.js";
import { fnv1a32, seededShuffle } from "./rng.js";
import { contentKeyForFinding, stableFindingId } from "../../code-finding-ids.js";

/**
 * `analyzeRepo` (llamado directo, como acá — no a través de `code-
 * inspector.ts`) NO estampa `Finding.id`: eso lo hace `withStableIds` en
 * `code-inspector.ts`, una capa por ENCIMA de `analyzeRepo` que este
 * instrumento no usa (no necesita paginación, descartes ni caché — ver el
 * docstring de `sample-findings-for-judgment.mts`). Mismo cálculo que ahí
 * (`code-finding-ids.ts#stableFindingId`), aplicado acá porque el muestreo
 * SÍ necesita el id estable (es la clave del upsert de `verdicts-io.ts`).
 */
function withStableId(f: CodeFinding): CodeFinding {
  return f.id ? f : { ...f, id: stableFindingId(f) };
}

export interface SampleOptions {
  slug: string;
  /** Cuántos hallazgos como máximo por celda (`kind`, o `(kind, lenguaje)` si se pasa `languageOf`). */
  n: number;
  /** Semilla base — junto con `slug` y cada grupo deriva una semilla propia (ver `rng.ts#fnv1a32`), así que agrandar `n` en una corrida futura extiende el mismo prefijo determinista en vez de reproducir un sorteo distinto. */
  seedBase: number;
  /**
   * Resuelve el lenguaje de un hallazgo — cuando se pasa, el muestreo
   * estratifica por `(kind, lenguaje)` en vez de sólo por `kind`. Sin esto,
   * un repo que mezcla lenguajes (`vueuse`: TS y Vue; `preact`: JS y JSX)
   * puede sortear TODA la muestra de un kind del lenguaje que más archivos
   * tiene y dejar al otro en 0 sin que nada lo avise — exactamente el
   * promedio-que-esconde que motiva `report.ts#buildPrecisionReportByLanguage`,
   * pero un turno antes: en el MUESTREO, no sólo en el reporte. Ausente ⇒
   * compatibilidad con llamadores viejos, una sola celda por `kind` como
   * antes de esta opción.
   */
  languageOf?: (finding: CodeFinding) => string;
}

/**
 * Agrupa `findings` por `kind` (o por `(kind, languageOf(finding))` si se
 * pasa `languageOf` — ver `SampleOptions`), ordena cada grupo por `id`
 * (determinismo PREVIO al shuffle: el orden de `analysis.findings` no está
 * garantizado estable entre versiones del analizador, y barajar un orden
 * inestable con una semilla fija no produce nada reproducible) y devuelve,
 * por grupo, hasta `n` hallazgos elegidos con una permutación determinista
 * propia de `(seedBase, slug, grupo)`.
 *
 * Hallazgos sin `id` (una corrida contra una versión del analizador anterior
 * a F2) se excluyen del muestreo — sin id estable no hay forma de
 * re-identificar el mismo hallazgo en una corrida futura para hacer upsert.
 */
export function selectSample(findings: readonly CodeFinding[], opts: SampleOptions): Map<string, CodeFinding[]> {
  const byGroup = new Map<string, CodeFinding[]>();
  for (const raw of findings) {
    const f = withStableId(raw);
    if (!f.id) continue;
    // Sin `languageOf`: grupo = `kind` a secas — MISMA clave que antes de
    // esta opción, byte a byte, para que un llamador viejo (sin lenguaje) no
    // note ninguna diferencia. Separador NUL EXPLÍCITO (\u0000, no espacio):
    // `kind` es un identificador controlado sin espacios, pero un separador
    // visible podría en teoría colisionar con un lenguaje que lo contuviera.
    const group = opts.languageOf ? `${f.kind}\u0000${opts.languageOf(f)}` : f.kind;
    const bucket = byGroup.get(group);
    if (bucket) bucket.push(f);
    else byGroup.set(group, [f]);
  }

  const selected = new Map<string, CodeFinding[]>();
  for (const [group, pool] of byGroup) {
    const sorted = pool.slice().sort((a, b) => (a.id! < b.id! ? -1 : a.id! > b.id! ? 1 : 0));
    const seed = fnv1a32(`${opts.seedBase}:${opts.slug}:${group}`);
    const shuffled = seededShuffle(sorted, seed);
    selected.set(group, shuffled.slice(0, opts.n));
  }
  return selected;
}

/**
 * id → clave de contenido (`code-finding-ids.ts#contentKeyForFinding`), para
 * TODO `findings` — no sólo lo que `selectSample` elige. Es lo que
 * `mergeRows` (`verdicts-io.ts`) necesita para reconciliar una fila huérfana
 * cuyo id cambió (un detector que empezó a adjuntar/sacar una ubicación
 * secundaria) contra el hallazgo vivo que, para quien lo juzgó, sigue siendo
 * el mismo: sin el pool COMPLETO acá, un hallazgo que el sorteo de esta
 * corrida no eligió nunca podría reclamar la fila huérfana que le
 * corresponde.
 */
export function buildLiveContentKeyIndex(findings: readonly CodeFinding[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const raw of findings) {
    const f = withStableId(raw);
    if (!f.id) continue;
    index.set(f.id, contentKeyForFinding(f));
  }
  return index;
}

/**
 * Nombres de patrón en estado ACCIONABLE colgando de este hallazgo —
 * `ausente`/`parcial` son las únicas dos que compiten en el ranking de
 * oportunidades (ver `CodeFindingHypothesis.state`); `ya-aplicado`/
 * `aplicado-eludido` describen un patrón que YA está en el código, no una
 * recomendación pendiente, así que no cuentan acá.
 */
export function actionablePatterns(finding: CodeFinding): string[] {
  return (finding.hypotheses ?? []).filter((h) => h.state === "ausente" || h.state === "parcial").map((h) => h.pattern);
}

export function toPrecisionRow(finding: CodeFinding, slug: string, evidence: string, language: string): PrecisionRow {
  const loc = finding.locations[0];
  return {
    id: finding.id ?? "",
    slug,
    kind: finding.kind,
    language,
    pattern: actionablePatterns(finding).join(";"),
    file: loc?.file ?? "",
    startLine: loc?.startLine ?? 0,
    endLine: loc?.endLine ?? 0,
    symbol: loc?.symbol ?? "",
    title: finding.title,
    detail: finding.detail,
    metricLabel: finding.metric.label,
    metricValue: String(finding.metric.value),
    evidence,
    verdict: "",
    patternFit: "",
    note: "",
    stillPresent: true,
    lossReason: "",
  };
}
