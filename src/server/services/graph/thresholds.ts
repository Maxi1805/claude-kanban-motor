/**
 * F4 — el `Benchmarks` real, cargado de `benchmarks.json` (CONTRATO-F4.md,
 * tarea "benchmarks": *"graph/thresholds.ts (o donde lo ubique el
 * contrato)"*). El contrato no fija un archivo para esto — el mecanismo en
 * sí (`ThresholdSpec`/`resolveThreshold`/`Benchmarks`) ya vive, CERRADO, en
 * `detect/thresholds.ts` ("se usa, no se edita", igual que `run.ts`,
 * `detect/testing.ts`); este módulo NUEVO sólo aporta la pieza que faltaba:
 * una implementación real de `Benchmarks` que lee un archivo versionado en
 * vez de siempre devolver `null`.
 *
 * `resolveThreshold` (`detect/thresholds.ts`) YA resuelve `derivado` como
 * `Max(floor, corpusP95)` — con `corpusP95: () => null` (hoy, en todos los
 * call-sites de producción) el resultado es siempre el `floor`, tal como
 * documenta esa función. Lo único que falta para que un `derivado` empiece
 * a usar el corpus es que `runDetectors({ benchmarks: ... })` reciba un
 * `Benchmarks` no nulo — `getCorpusBenchmarks()`, acá abajo, es ese objeto.
 *
 * *** Cableado real pendiente, fuera de esta tarea (regla 6: "toca sólo tus
 * archivos"): *** `code-analyzer.ts` (dueño: W2/"cablear-detectores", NO
 * este archivo) hoy llama a `runDetectors({ …, benchmarks: null })` en dos
 * sitios (`analyzeFile` y `crossAnalyze`). Para que `derivado` deje de
 * resolver siempre al floor en producción, esas dos líneas tienen que pasar
 * a `benchmarks: getCorpusBenchmarks()`. Este módulo deja el objeto listo,
 * probado, y documentado — no edita ese archivo.
 *
 * Métricas que `benchmarks.json` trae hoy (ver `scripts/generate-benchmarks.mts`,
 * el generador, y su docstring para el porqué de exactamente estas tres):
 *   - `"wmc"` — miembros por clase (`large-class.ts`, ya usa
 *     `derivado({ of: "wmc", … })`).
 *   - `"chainLength"` / `"functionLines"` — el mismo número crudo que
 *     `conditional-chain.ts`/`long-function.ts` ya calculan puertas adentro.
 *     ACTUALIZADO (R3, auditoría de umbrales inventados): los dos migraron
 *     de `pisoDeclarado()` a `derivado({ of: "chainLength" | "functionLines", … })`
 *     con el MISMO `floor` de siempre (5 y 45) — cambio de sólo detect/**,
 *     este archivo no se tocó para eso. Sin el cableado de abajo (todavía
 *     pendiente, sigue siendo trabajo de `code-analyzer.ts`) las dos siguen
 *     resolviendo exactamente a su `floor`, igual que antes de la migración.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Benchmarks, MetricName } from "../detect/thresholds.js";

/** Percentiles de una (métrica, lenguaje), sobre la muestra combinada del corpus. */
export interface BenchmarkPercentiles {
  readonly n: number;
  readonly p50: number;
  readonly p90: number;
  readonly p95: number;
  readonly p99: number;
}

/** Una fila del diagnóstico de régimen — ver CONTRATO-F4.md, tarea "benchmarks", punto 4. */
export interface BenchmarkRegimeRow {
  readonly slug: string;
  readonly metric: string;
  readonly language: string;
  readonly repoPercentiles: BenchmarkPercentiles;
  readonly corpusPercentiles: BenchmarkPercentiles;
  /** `null` cuando este repo es el ÚNICO que aporta esta (métrica, lenguaje) — no hay "resto" contra qué comparar. */
  readonly repoToRestOfCorpusRatio: number | null;
}

/** La forma exacta de `benchmarks.json` — `scripts/generate-benchmarks.mts` produce esto, byte a byte. */
export interface BenchmarksFile {
  readonly schemaVersion: 1;
  /** Pasada como argumento al generador (`YYYY-MM-DD`) — nunca `Date.now()`. */
  readonly generatedAt: string;
  /** sha256 de `slug:worktreeSignature` de los 8 repos del corpus, ordenados por slug. */
  readonly corpusSha: string;
  readonly corpusRepos: readonly {
    readonly slug: string;
    readonly worktreeSignature: string;
    readonly scannedFiles: number;
    readonly analysedFiles: number;
    readonly languageFileCounts: Readonly<Record<string, number>>;
  }[];
  readonly metrics: Readonly<Record<string, Readonly<Record<string, BenchmarkPercentiles>>>>;
  readonly diagnostics: { readonly perRepo: readonly BenchmarkRegimeRow[] };
}

/**
 * Envuelve un `BenchmarksFile` ya parseado como el `Benchmarks` que
 * `detect/thresholds.ts#resolveThreshold` espera. Puro: no toca disco — eso
 * es trabajo de `getCorpusBenchmarks`, más abajo.
 */
export function loadBenchmarksFile(file: BenchmarksFile): Benchmarks {
  return {
    p95(metric: MetricName, language: string): number | null {
      return file.metrics[metric]?.[language]?.p95 ?? null;
    },
  };
}

const DEFAULT_BENCHMARKS_PATH = path.join(path.dirname(new URL(import.meta.url).pathname), "benchmarks.json");

let cached: Benchmarks | null | undefined;
let cachedPath: string | undefined;

/**
 * Carga `benchmarks.json` UNA vez por proceso (mismo criterio que
 * `edgeProfile`/`resolveLanguage`: cachear lo que no cambia durante la vida
 * del proceso) y lo expone como `Benchmarks`. `null` — nunca lanza — si el
 * archivo no existe todavía o está corrupto: un `derivado` sin benchmarks
 * simplemente sigue resolviendo al `floor`, que es exactamente el
 * comportamiento de "antes de F4" que `resolveThreshold` ya documenta.
 */
export function getCorpusBenchmarks(filePath: string = DEFAULT_BENCHMARKS_PATH): Benchmarks | null {
  if (cached !== undefined && cachedPath === filePath) return cached;
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as BenchmarksFile;
    cached = loadBenchmarksFile(parsed);
  } catch {
    cached = null;
  }
  cachedPath = filePath;
  return cached;
}

/** Sólo para tests: fuerza a `getCorpusBenchmarks` a releer disco en la próxima llamada. */
export function resetCorpusBenchmarksCacheForTests(): void {
  cached = undefined;
  cachedPath = undefined;
}
