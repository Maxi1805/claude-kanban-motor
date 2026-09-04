/**
 * Generador de `src/server/services/graph/benchmarks.json` — CONTRATO-F4.md,
 * tarea "benchmarks".
 *
 * `derivado()` (`detect/thresholds.ts`, módulo CERRADO) resuelve
 * `Max(floor, p95(corpus, lenguaje))` cuando alguien le pasa un `Benchmarks`
 * real (`ThresholdResolveInput.corpusP95`). Sin `benchmarks.json` el valor
 * es siempre el `floor` — este script produce los datos que le dan cuerpo
 * al `p95(corpus)`.
 *
 * DOS SUBCOMANDOS, exactamente como `scripts/census.mts`/`census-all.sh`, y
 * por la MISMA razón (comentario de `loadRuntime`, `code-analyzer.ts`): dos
 * análisis de repos DISTINTOS en el mismo proceso node corrompen el caché de
 * `require` de `web-tree-sitter`. `scan` analiza UN repo por invocación;
 * `merge` sólo agrega JSON ya escrito, nunca vuelve a parsear nada.
 *
 *   scan:  npx tsx scripts/generate-benchmarks.mts scan <repoDir> <slug> <outFile>
 *   merge: npx tsx scripts/generate-benchmarks.mts merge <YYYY-MM-DD> <outFile> <scanFile...>
 *
 * `<YYYY-MM-DD>` es la fecha que se estampa en `generatedAt` — pasada por
 * quien invoca (`scripts/generate-benchmarks-all.sh` la toma de `date +%F`),
 * nunca `Date.now()` adentro de este archivo: así una corrida repetida con
 * los mismos `scanFile` produce bit-a-bit el mismo `benchmarks.json`, y un
 * test puede fijar una fecha y comparar el JSON exacto.
 *
 * Métricas que este script sabe extraer, las tres que hoy tienen un
 * `ThresholdKey` real en un detector (`memberCount`→`wmc` en
 * `large-class.ts`, ya `derivado()`; `chainLength`/`lines` en
 * `conditional-chain.ts`/`long-function.ts`, hoy `pisoDeclarado()` y
 * candidatas de una migración futura que NO es de esta tarea — "NO toques
 * las métricas individuales"). Cada valor es el mismo número que su detector
 * ya calcula puertas adentro (`members.length`, `fn.chain`,
 * `endLine-startLine+1`), leído de `FileFacts.functions` (`FunctionInfo`),
 * SIN pasar por ningún umbral — la muestra tiene que incluir los casos que
 * HOY no disparan, o el percentil estaría censurado por el propio floor.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { analyzeFile, collectFiles, worktreeSignature } from "../src/server/services/code-analyzer.js";

/** Las tres métricas que este generador puebla — ver el docstring del módulo. */
const METRIC_NAMES = ["wmc", "chainLength", "functionLines"] as const;
type MetricName = (typeof METRIC_NAMES)[number];

type SampleBucket = Record<string, number[]>; // language -> muestras

interface RepoScan {
  readonly slug: string;
  readonly worktreeSignature: string;
  readonly scannedFiles: number;
  readonly analysedFiles: number;
  /** archivos analizados, por lenguaje. */
  readonly languageFileCounts: Record<string, number>;
  readonly samples: Record<MetricName, SampleBucket>;
}

interface Percentiles {
  readonly n: number;
  readonly p50: number;
  readonly p90: number;
  readonly p95: number;
  readonly p99: number;
}

export interface BenchmarksFile {
  readonly schemaVersion: 1;
  /** Pasada como argumento a `merge` — nunca `Date.now()`, ver el docstring del módulo. */
  readonly generatedAt: string;
  /** sha256 de `slug:worktreeSignature` de los 8 repos, ordenados por slug — cambia si CUALQUIER repo del corpus cambia. */
  readonly corpusSha: string;
  readonly corpusRepos: readonly {
    readonly slug: string;
    readonly worktreeSignature: string;
    readonly scannedFiles: number;
    readonly analysedFiles: number;
    readonly languageFileCounts: Readonly<Record<string, number>>;
  }[];
  /** `metric -> language -> percentiles`, sobre la UNIÓN de muestras de los 8 repos para ese lenguaje. */
  readonly metrics: Readonly<Record<MetricName, Readonly<Record<string, Percentiles>>>>;
  /**
   * F4 §4 del contrato de esta tarea: régimen de cada repo — para que el
   * veredicto "p95 del repo vs p95 del corpus" quede con los números que lo
   * sostienen, no sólo en el texto de un reporte. NO lo consume
   * `loadBenchmarksFile` (abajo): es diagnóstico, para auditoría humana.
   */
  readonly diagnostics: {
    readonly perRepo: readonly {
      readonly slug: string;
      readonly metric: MetricName;
      readonly language: string;
      readonly repoPercentiles: Percentiles;
      readonly corpusPercentiles: Percentiles;
      /** `repoPercentiles.p95` sobre `corpusPercentiles.p95` sin este repo, redondeado a 2 decimales. */
      readonly repoToRestOfCorpusRatio: number | null;
    }[];
  };
}

/** Nearest-rank: `sorted[ceil(p/100 * n) - 1]`, clamped — determinista, sin interpolar (las tres métricas son enteras). */
function percentile(sorted: readonly number[], p: number): number {
  const n = sorted.length;
  const rank = Math.min(n, Math.max(1, Math.ceil((p / 100) * n)));
  return sorted[rank - 1] as number;
}

function summarize(samples: readonly number[]): Percentiles {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    n: sorted.length,
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

function pushSample(bucket: SampleBucket, language: string, value: number): void {
  (bucket[language] ??= []).push(value);
}

/** Analiza UN repo: `FileFacts.functions` da `chain`/parámetros de lugar sin pasar por ningún detector ni umbral. */
async function scanRepo(repoDir: string, slug: string): Promise<RepoScan> {
  const files = await collectFiles(repoDir);
  const wtSig = await worktreeSignature(repoDir);
  const languageFileCounts: Record<string, number> = {};
  const samples: Record<MetricName, SampleBucket> = { wmc: {}, chainLength: {}, functionLines: {} };
  let analysedFiles = 0;

  for (const f of files) {
    const facts = await analyzeFile({ dir: repoDir, path: f.path });
    if (!facts) continue;
    analysedFiles++;
    languageFileCounts[facts.language] = (languageFileCounts[facts.language] ?? 0) + 1;

    // wmc: miembros por clase DENTRO de este archivo — mismo agrupamiento que
    // `large-class.ts#run` (`byClass` sobre `file.functions`), nunca cruzando archivos.
    const byClass = new Map<string, number>();
    for (const fn of facts.functions) {
      if (fn.className !== null) byClass.set(fn.className, (byClass.get(fn.className) ?? 0) + 1);
      pushSample(samples.chainLength, facts.language, fn.chain);
      pushSample(samples.functionLines, facts.language, fn.endLine - fn.startLine + 1);
    }
    for (const memberCount of byClass.values()) pushSample(samples.wmc, facts.language, memberCount);
  }

  return {
    slug,
    worktreeSignature: wtSig,
    scannedFiles: files.length,
    analysedFiles,
    languageFileCounts,
    samples,
  };
}

async function runScan(argv: readonly string[]): Promise<void> {
  const [repoDir, slug, outFile] = argv;
  if (!repoDir || !slug || !outFile) {
    console.error("uso: generate-benchmarks.mts scan <repoDir> <slug> <outFile>");
    process.exitCode = 1;
    return;
  }
  const scan = await scanRepo(path.resolve(repoDir), slug);
  const outPath = path.resolve(outFile);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(scan, null, 2)}\n`, "utf8");
  const sampleCounts = METRIC_NAMES.map(
    (m) => `${m}=${Object.values(scan.samples[m]).reduce((a, b) => a + b.length, 0)}`,
  ).join(" ");
  console.error(
    `${slug}: ${scan.analysedFiles}/${scan.scannedFiles} archivos, ${sampleCounts} -> ${outPath}`,
  );
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function runMerge(argv: readonly string[]): Promise<void> {
  const [date, outFile, ...scanFiles] = argv;
  if (!date || !DATE_RE.test(date) || !outFile || scanFiles.length === 0) {
    console.error("uso: generate-benchmarks.mts merge <YYYY-MM-DD> <outFile> <scanFile...>");
    process.exitCode = 1;
    return;
  }

  const scans: RepoScan[] = [];
  for (const f of scanFiles) {
    scans.push(JSON.parse(await fs.readFile(path.resolve(f), "utf8")) as RepoScan);
  }
  scans.sort((a, b) => a.slug.localeCompare(b.slug));

  const corpusSha = crypto
    .createHash("sha256")
    .update(scans.map((s) => `${s.slug}:${s.worktreeSignature}`).join("\n"))
    .digest("hex");

  // metric -> language -> muestras combinadas de los 8 repos.
  const combined: Record<MetricName, SampleBucket> = { wmc: {}, chainLength: {}, functionLines: {} };
  for (const scan of scans) {
    for (const metric of METRIC_NAMES) {
      for (const [language, values] of Object.entries(scan.samples[metric])) {
        (combined[metric][language] ??= []).push(...values);
      }
    }
  }

  const metrics: Record<MetricName, Record<string, Percentiles>> = { wmc: {}, chainLength: {}, functionLines: {} };
  for (const metric of METRIC_NAMES) {
    for (const [language, values] of Object.entries(combined[metric])) {
      metrics[metric][language] = summarize(values);
    }
  }

  // Diagnóstico de régimen: para cada (repo, metric, language) con muestra
  // propia, comparar el p95 DEL REPO contra el p95 DEL RESTO DEL CORPUS (los
  // otros 7 repos, nunca incluyendo el propio — si no, un repo grande se
  // compara consigo mismo y el ratio da ~1 por construcción).
  const perRepo: BenchmarksFile["diagnostics"]["perRepo"][number][] = [];
  for (const scan of scans) {
    for (const metric of METRIC_NAMES) {
      for (const [language, values] of Object.entries(scan.samples[metric])) {
        if (values.length === 0) continue;
        const restValues = scans
          .filter((s) => s.slug !== scan.slug)
          .flatMap((s) => s.samples[metric][language] ?? []);
        const repoPercentiles = summarize(values);
        const corpusPercentiles = summarize(combined[metric][language] ?? []);
        const restP95 = restValues.length > 0 ? summarize(restValues).p95 : null;
        perRepo.push({
          slug: scan.slug,
          metric,
          language,
          repoPercentiles,
          corpusPercentiles,
          repoToRestOfCorpusRatio: restP95 && restP95 > 0 ? Math.round((repoPercentiles.p95 / restP95) * 100) / 100 : null,
        });
      }
    }
  }

  const file: BenchmarksFile = {
    schemaVersion: 1,
    generatedAt: date,
    corpusSha,
    corpusRepos: scans.map((s) => ({
      slug: s.slug,
      worktreeSignature: s.worktreeSignature,
      scannedFiles: s.scannedFiles,
      analysedFiles: s.analysedFiles,
      languageFileCounts: s.languageFileCounts,
    })),
    metrics,
    diagnostics: { perRepo },
  };

  const outPath = path.resolve(outFile);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  console.error(`merge: ${scans.length} repos, corpusSha=${corpusSha.slice(0, 12)} -> ${outPath}`);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "scan") return runScan(rest);
  if (cmd === "merge") return runMerge(rest);
  console.error("uso: generate-benchmarks.mts <scan|merge> ...");
  process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exitCode = 1;
});
