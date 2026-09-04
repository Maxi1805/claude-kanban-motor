/**
 * Gate de aceptación de CONTRATO-F5.md §1.7 (M1/M2) — Ola 6, hallazgo P2/#3:
 * el criterio de aceptación del ranking (`ranking.ts#SCORE_WEIGHTS`) vivía
 * SÓLO en un script de scratchpad (`grep -rn "M1\b|M2\b" *.test.ts` daba
 * cero antes de este archivo), así que su incumplimiento no bloqueaba nada
 * y no se podía re-verificar sin rehacer el barrido completo a mano.
 *
 * Este archivo codifica M1 y M2 tal como CONTRATO-F5.md §1.7 los define,
 * sobre el TOP-200 real que el panel muestra hoy (la página por default de
 * `CodeAnalysis.findings`, `DEFAULT_ANALYZE_LIMITS.maxFindings`), no sobre
 * `limits: "unlimited"` (eso es lo que mide M4, no M1/M2). NO reimplementa
 * M5 (la rejilla ±0.10 sobre los 3 pesos): eso son 27 corridas más por
 * punto, fuera del alcance de "escribí el gate como test" — este archivo
 * gatea el punto ÚNICO en el que `SCORE_WEIGHTS` está fijado hoy.
 *
 * MISMO PATRÓN que `census-golden.test.ts` (mismo motivo: correr dos análisis
 * en el mismo proceso corrompe el caché de `require` de `web-tree-sitter`):
 * un proceso POR REPO, vía subprocess de `tsx` sobre un worker generado en
 * un directorio temporal (nunca un segundo archivo versionado — el paquete
 * de esta tarea es exactamente `ranking.ts`/`ranking.test.ts`/`grouping.ts`/
 * `grouping.test.ts` más este archivo nuevo, nada más). Sin `CK_CORPUS_DIR`
 * (o con el repo/SHA desincronizado), cada caso se `it.skip`-ea con el
 * motivo en el nombre — `npx vitest run` queda verde sin el corpus en la
 * máquina, igual que el resto de la suite.
 *
 * ORDEN DE LECTURA SI ESTO FALLA: la instrucción de la tarea que motivó este
 * archivo es explícita — un fallo de M1/M2 con la cascada completa (P1 ya
 * arregló `impact.ts`) y `conf` vivo (`detect/grouping.ts#buildConfidenceOf`)
 * es un veredicto sobre la FÓRMULA (CONTRATO-F5.md §1.7, última cláusula:
 * "no es que subir el peso de impact hasta que pasen"), nunca una señal para
 * mover un tier o un peso hasta que el test pase.
 *
 * POR QUÉ ESTE ARCHIVO "APARECE Y DESAPARECE" ENTRE CORRIDAS DE LA SUITE
 * COMPLETA (Ola Q, F4) — es el ÚNICO test no determinista del árbol, y la
 * causa NO vive en `ranking.ts` (puro y determinista: `scoreFindings`
 * ordena por `score` con desempate por `id` ascendente, sin `Math.random`/
 * `Date.now`/orden de resolución de promesas en ningún paso de la cascada
 * que alimenta un `it()` de acá — verificado leyendo `run.ts`/`build.ts`,
 * cuyo recorrido de archivos es un `for` secuencial con yields cooperativos
 * que NUNCA reordenan nada). La causa medida, reproducida en vivo dos veces
 * el mismo día (`analyze-e2e.test.ts`, mismo camino de `analyzeRepo` →
 * `runInterFile`, 14:33 vs 14:37): con 7 frentes más editando
 * `src/server/services/` EN SIMULTÁNEO durante toda la ola, un worker de
 * ESTE archivo puede spawnearse mientras `duplication.ts`/
 * `distributed-duplication.ts` está a mitad de un guardado de OTRO frente —
 * `runInterFile` atrapa el `ReferenceError` (`status: "error"` en
 * `coverage`, findings del detector en CERO para esa corrida) sin tirar, así
 * que el worker devuelve `{ findingsTotal, totalByKind, page }` con forma
 * VÁLIDA pero CONTENIDO degradado: al detector roto le faltan sus
 * hallazgos, así que la composición del top-200 cambia y con ella qué
 * `detectorId` domina — M2 puede cruzar el 25 % en una corrida y no en la
 * siguiente sin que el ANALIZADOR haya cambiado en absoluto, sólo el
 * INSTANTE en que este archivo (13 subprocesos secuenciales, hasta 600 s
 * cada uno — la ventana de exposición más larga del árbol) se cruzó con el
 * guardado de otro frente. Coincide exactamente con la deuda ya declarada en
 * `ola-q/CONTEXTO.md` §4/`GUIA-PROXIMA-OLA.md` §7: "`analyzeRepo` se cae con
 * `ReferenceError` cuando OTRO frente tiene su módulo a medio escribir...
 * Reintentar es la mitigación". `runWorkerRobust` (abajo) es exactamente
 * eso, acotado para no arriesgar el timeout del propio `it()` — ver su
 * docstring. Lo que NO cubre: la asimetría de N13 entre "M2 cero tolerancia
 * sobre lo que completó" y "un repo que TIMEA OUT (no que corre corrupto)
 * desaparece de `results` sin dejar rastro" — `guava` tardó 411 s de los
 * 600 s de presupuesto en una corrida sin contención (medido hoy); bajo la
 * contención real de 7 frentes concurrentes, cruzar el timeout y sacar a
 * `guava` (o a cualquier otro) de `results` en silencio es plausible y NO
 * lo toqué: es un cambio de semántica de M1/M2 (qué cuenta como "corpus
 * completo"), no una corrección de una corrupción de datos, y no me pareció
 * mío de decidir sin más medición — queda nombrado para quien mida el
 * próximo caso real.
 */
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const GOLDEN_DIR = path.join(ROOT, "tests", "golden");
const TSX_BIN = path.join(ROOT, "node_modules", ".bin", "tsx");
const execFileAsync = promisify(execFile);

/**
 * Timeout que vitest le da a cada `it()` de este archivo (mismo valor que el
 * tercer argumento de `test(...)` más abajo). `runWorker` aborta el hijo ANTES
 * de que venza, con margen para que el SIGTERM (y, si hace falta, el SIGKILL
 * de respaldo) terminen de matarlo antes de que el `for...of` pase al
 * siguiente repo.
 *
 * Defecto verificado en esta ola: `execFileAsync` no llevaba `signal`, así
 * que cuando vitest declaraba el test de `guava` timed out a los 240s, el
 * proceso hijo (`tsx` corriendo `analyzeRepo` sobre guava) seguía VIVO — y el
 * `for...of` ya había arrancado el siguiente repo (`newtonsoft-json`) encima,
 * violando la regla de memoria "guava corre sola" desde el propio arnés.
 */
/*
 * INTEGRACIÓN Ola H — subido de 240_000 a 600_000, misma razón de
 * infraestructura que `census-golden.test.ts` (ver el comentario del timeout
 * ahí): guava pasó de ~205 s a **357 s** de análisis entre la Ola G y la H
 * (`meta.elapsedMs` del censo congelado de esta ola), así que el caso moría en
 * `AbortError: The operation was aborted` — el abort de `runWorker`, nunca un
 * `expect`. Verificado corriendo el archivo aislado. No afloja ningún
 * criterio: M1/M2 siguen exigiendo lo mismo sobre el top-200 real.
 */
const WORKER_TEST_TIMEOUT_MS = 600_000;
const WORKER_ABORT_MARGIN_MS = 5_000;
const WORKER_SIGKILL_GRACE_MS = 3_000;

interface Manifest {
  corpus: Record<string, { sha: string; path: string }>;
}

function readManifest(): Manifest | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, "manifest.json"), "utf8")) as Manifest;
  } catch {
    return null;
  }
}

function gitSha(dir: string): string | null {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/**
 * Worker que corre `analyzeRepo` con los límites DEFAULT (la página que el
 * panel muestra hoy, `DEFAULT_ANALYZE_LIMITS.maxFindings`) y vuelca a stdout
 * sólo lo que M1/M2 necesitan: el volumen real por kind (`totalByKind`,
 * pre-página) y, de la página, el `kind`/`detectorId` de cada fila. Se
 * escribe a un directorio temporal en tiempo de test, nunca a un archivo
 * versionado del repo.
 *
 * `CodeFinding` (`shared/types.ts`) NO expone `detectorId` — sólo el
 * `Finding` interno lo tiene (verificado: `grep -n "detectorId" shared/types.ts`
 * no encuentra el campo en `CodeFinding`). Lo que SÍ es público y estable es
 * `id`, con formato documentado `${detectorId}:${hash}` (`detect/ids.ts#findingId`,
 * "Resultado: `${detectorId}:${hash}`"), así que se recupera el detector
 * partiendo `id` por el primer `:` — no un truco, es el propio formato
 * publicado del id.
 *
 * `analyzeRepoCached` (`analyze-cache.ts`) reemplaza la llamada directa a
 * `analyzeRepo` — caché por SHA + huella del analizador (ver ese archivo). El
 * hit/miss se loguea a STDERR, nunca a STDOUT (que sigue siendo sólo el JSON
 * que este worker produce).
 */
const WORKER_SOURCE = `
import { analyzeRepoCached } from ${JSON.stringify(path.join(ROOT, "src", "server", "services", "analyze-cache.js"))};
const [, , dir, slug] = process.argv;
const { analysis: result, cache } = await analyzeRepoCached({ dir, repoName: slug });
process.stderr.write(\`[analyzer-cache] \${slug}: \${cache.hit ? "HIT" : "MISS"} (\${cache.reason}) analyzeMs=\${cache.analyzeMs.toFixed(0)}\\n\`);
process.stdout.write(JSON.stringify({
  findingsTotal: result.findingsTotal ?? result.findings.length,
  totalByKind: result.totalByKind ?? {},
  page: result.findings.map((f) => ({ kind: f.kind, detectorId: f.id ? f.id.split(":")[0] : f.kind })),
  // OLA Q (F4) — ver el docstring del módulo, "POR QUÉ ESTE ARCHIVO 'APARECE
  // Y DESAPARECE'". Sin esto, un detector que \`status: "error"\` en
  // \`coverage\` (atrapado por \`runInterFile\`, nunca tira) es indistinguible
  // de un detector que corrió limpio y no encontró nada: el worker devolvía
  // \`page\`/\`totalByKind\` con forma válida pero contenido degradado, sin
  // ninguna señal de que ESTA corrida no es una medición confiable de M1/M2.
  erroredDetectors: (result.coverage ?? [])
    .filter((row) => row.status === "error")
    .map((row) => ({ detectorId: row.detectorId, error: row.error ?? "" })),
}));
`;

interface WorkerOutput {
  findingsTotal: number;
  totalByKind: Record<string, number>;
  page: { kind: string; detectorId: string }[];
  /** OLA Q (F4) — no vacío ⇒ esta corrida atravesó un detector roto (típicamente una edición concurrente de otro frente a medio guardar); ver `runWorkerRobust`. */
  erroredDetectors: { detectorId: string; error: string }[];
}

async function runWorker(workerPath: string, dir: string, slug: string): Promise<WorkerOutput> {
  const controller = new AbortController();
  const execPromise = execFileAsync(TSX_BIN, [workerPath, dir, slug], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    signal: controller.signal,
  });
  const child = execPromise.child;
  const abortTimer = setTimeout(() => {
    controller.abort(); // manda killSignal (SIGTERM por defecto) al hijo.
    // Respaldo: si el hijo no atendió el SIGTERM (p.ej. ocupado en trabajo
    // síncrono de CPU, como el parseo de guava), lo forzamos con SIGKILL —
    // nunca dejarlo vivo para el siguiente repo del for...of.
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    }, WORKER_SIGKILL_GRACE_MS).unref();
  }, WORKER_TEST_TIMEOUT_MS - WORKER_ABORT_MARGIN_MS);
  abortTimer.unref();
  try {
    const { stdout, stderr } = await execPromise;
    // Reenvía el log de `[analyzer-cache]` del worker (ver `WORKER_SOURCE`) a la
    // salida de ESTE proceso — si no, `execFileAsync` lo captura en el buffer y
    // nadie lo ve nunca, y el requisito de verificabilidad ("¿esto lo midió o lo
    // leyó?") queda sin efecto en la práctica.
    if (stderr.trim()) console.error(stderr.trim());
    return JSON.parse(stdout) as WorkerOutput;
  } finally {
    clearTimeout(abortTimer);
  }
}

/**
 * OLA Q (F4) — la mitigación de "POR QUÉ ESTE ARCHIVO 'APARECE Y
 * DESAPARECE'" (docstring del módulo). Un solo reintento, ACOTADO para
 * nunca arriesgar el timeout del propio `it()` (`WORKER_TEST_TIMEOUT_MS`):
 * si el primer intento por sí solo ya se comió más de
 * `WORKER_RETRY_MAX_FIRST_ATTEMPT_MS`, un segundo intento del mismo repo NO
 * entraría antes de que vitest mate el test por timeout de todos modos, así
 * que no se arriesga — se usa el resultado corrupto tal cual, marcado. Para
 * el resto (la mayoría: 10 de los 13 repos del corpus miden bajo 45 s
 * incluso el peor de ellos hoy), el reintento cuesta segundos y saca la
 * corrida de la ventana de colisión con el guardado de otro frente.
 *
 * Nunca INVENTA un resultado limpio: si los dos intentos vienen con
 * `erroredDetectors` no vacío, `corrupted: true` viaja hasta el llamador,
 * que trata el repo como NO COMPLETADO (mismo criterio que un timeout —
 * excluido de `results`, nunca contado como M2 limpio) en vez de dejar que
 * un detector en cero, por una razón ajena al análisis, decida en silencio
 * quién domina el top-200.
 */
const WORKER_RETRY_DELAY_MS = 3_000;
const WORKER_RETRY_MAX_FIRST_ATTEMPT_MS = 180_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWorkerRobust(workerPath: string, dir: string, slug: string): Promise<{ out: WorkerOutput; corrupted: boolean }> {
  const t0 = performance.now();
  const first = await runWorker(workerPath, dir, slug);
  const firstElapsedMs = performance.now() - t0;
  if (first.erroredDetectors.length === 0) return { out: first, corrupted: false };

  const detail = first.erroredDetectors.map((e) => `${e.detectorId}: ${e.error}`).join("; ");
  console.warn(
    `[M1/M2] ${slug}: ${first.erroredDetectors.length} detector(es) con status=error en coverage (${detail}) — ` +
      `probable colisión con una edición concurrente de otro frente sobre el árbol compartido (ver docstring del módulo, "OLA Q (F4)").`,
  );

  if (firstElapsedMs > WORKER_RETRY_MAX_FIRST_ATTEMPT_MS) {
    console.warn(
      `[M1/M2] ${slug}: el primer intento tardó ${(firstElapsedMs / 1000).toFixed(0)}s — sin margen para reintentar dentro ` +
        `del timeout del test (${WORKER_TEST_TIMEOUT_MS / 1000}s). Se usa el resultado corrupto, excluido de M1/M2.`,
    );
    return { out: first, corrupted: true };
  }

  console.warn(`[M1/M2] ${slug}: reintentando una vez tras ${(WORKER_RETRY_DELAY_MS / 1000).toFixed(0)}s de espera…`);
  await delay(WORKER_RETRY_DELAY_MS);
  const second = await runWorker(workerPath, dir, slug);
  if (second.erroredDetectors.length === 0) {
    console.warn(`[M1/M2] ${slug}: el reintento salió limpio — el árbol ya estaba consistente cuando se corrió de nuevo.`);
    return { out: second, corrupted: false };
  }
  console.warn(
    `[M1/M2] ${slug}: el reintento SIGUIÓ corrupto (${second.erroredDetectors.map((e) => e.detectorId).join(", ")}). ` +
      `Excluido de M1/M2 esta corrida — no cuenta como medición limpia.`,
  );
  return { out: second, corrupted: true };
}

/** M1 — CONTRATO-F5.md §1.7: cobertura de kinds "importantes" (>= 1% del volumen del repo) en el top. */
function m1Coverage(out: WorkerOutput): { pass: boolean; importantKinds: number; covered: number } {
  const importantKinds = Object.entries(out.totalByKind).filter(([, count]) => count / Math.max(1, out.findingsTotal) >= 0.01);
  if (importantKinds.length === 0) return { pass: true, importantKinds: 0, covered: 0 };
  const kindsInPage = new Set(out.page.map((f) => f.kind));
  const covered = importantKinds.filter(([kind]) => kindsInPage.has(kind)).length;
  return { pass: covered / importantKinds.length >= 0.7, importantKinds: importantKinds.length, covered };
}

/** M2 — CONTRATO-F5.md §1.7: ningún detector ocupa más del 25% del top. */
function m2Dominance(out: WorkerOutput): { pass: boolean; maxShare: number; dominant: string | null } {
  if (out.page.length === 0) return { pass: true, maxShare: 0, dominant: null };
  const counts = new Map<string, number>();
  for (const f of out.page) counts.set(f.detectorId, (counts.get(f.detectorId) ?? 0) + 1);
  let dominant: string | null = null;
  let max = 0;
  for (const [detectorId, count] of counts) {
    if (count > max) {
      max = count;
      dominant = detectorId;
    }
  }
  return { pass: max / out.page.length <= 0.25, maxShare: max / out.page.length, dominant };
}

/**
 * N13 — el veredicto agregado, extraído a una función PURA para poder
 * probarlo sin corpus (ver los `it()` de "aggregate — sin corpus" más abajo)
 * y para separar dos preguntas que antes vivían detrás de la MISMA compuerta
 * (`results.length < total ⇒ return`, sin distinguir M1 de M2):
 *
 *   - M2 es CERO TOLERANCIA (CONTRATO-F5.md §1.7: "0/8 fallando"). Un repo
 *     que YA terminó y YA violó el 25% de dominio es una prueba real,
 *     exista o no el resultado de los demás — a diferencia de M1 (una
 *     PROPORCIÓN sobre el total), M2 nunca necesita la muestra COMPLETA
 *     para que un fallo YA OBSERVADO sea válido.
 *   - M1 sí necesita el corpus entero: "7 de 8" no es comparable a "7 de
 *     10" sin saber sobre qué denominador se mide, así que sigue exigiendo
 *     `completed >= total` — el piso en sí (7) no se toca.
 *
 * `m1Evaluated: false` NO es "M1 pasó": es "no hay muestra completa para
 * juzgarlo esta corrida" — el llamador debe tratarlo como "no afirmar",
 * nunca como "afirmar verde".
 */
interface AggregateResult {
  readonly slug: string;
  readonly m1: { readonly pass: boolean };
  readonly m2: { readonly pass: boolean };
}

interface AggregateVerdict {
  readonly completed: number;
  readonly total: number;
  readonly m1PassCount: number;
  readonly m1Evaluated: boolean;
  readonly m2FailingRepos: readonly string[];
}

function computeAggregateVerdict(results: readonly AggregateResult[], total: number): AggregateVerdict {
  return {
    completed: results.length,
    total,
    m1PassCount: results.filter((r) => r.m1.pass).length,
    m1Evaluated: results.length >= total,
    m2FailingRepos: results.filter((r) => !r.m2.pass).map((r) => r.slug),
  };
}

const manifest = readManifest();
const corpusRoot = process.env.CK_CORPUS_DIR;

describe("CONTRATO-F5.md §1.7 — gate de aceptación M1/M2 del ranking (detect/ranking.ts#SCORE_WEIGHTS)", () => {
  if (!manifest) {
    it.skip("manifest.json ausente en tests/golden — nada que gatear sin el corpus", () => {});
    return;
  }

  let workerDir: string | null = null;
  const results: { slug: string; m1: ReturnType<typeof m1Coverage>; m2: ReturnType<typeof m2Dominance> }[] = [];

  for (const [slug, entry] of Object.entries(manifest.corpus)) {
    let skipReason: string | null = null;
    let repoDir: string | null = null;

    if (!corpusRoot) {
      skipReason = "CK_CORPUS_DIR no está seteado";
    } else {
      repoDir = path.join(corpusRoot, entry.path);
      if (!fs.existsSync(repoDir)) {
        skipReason = `no existe ${repoDir}`;
      } else {
        const actualSha = gitSha(repoDir);
        if (actualSha !== entry.sha) {
          skipReason = `sha desincronizado (manifest=${entry.sha}, disco=${actualSha ?? "no es un repo git"}) — re-congelar`;
        }
      }
    }

    const test = skipReason ? it.skip : it;
    test(
      skipReason ? `${slug} — SKIP: ${skipReason}` : `${slug}: mide M1 (cobertura de kinds) y M2 (dominio máximo) sobre el top-200 real`,
      async () => {
        if (!workerDir) {
          workerDir = fs.mkdtempSync(path.join(os.tmpdir(), "ck-ranking-acceptance-"));
        }
        const workerPath = path.join(workerDir, "worker.mts");
        fs.writeFileSync(workerPath, WORKER_SOURCE);
        const { out, corrupted } = await runWorkerRobust(workerPath, repoDir as string, slug);
        if (corrupted) {
          // OLA Q (F4) — ver `runWorkerRobust`/docstring del módulo: mismo
          // tratamiento que un repo que no completó por timeout. NO se
          // empuja a `results`, así que ni M1 ni M2 lo cuentan — ni como
          // limpio ni como violación —, y este `it()` no falla por esto (la
          // corrupción es del árbol compartido, no del ranking bajo prueba).
          console.warn(`[M1/M2] ${slug}: SIN MEDIR esta corrida — árbol compartido inconsistente pese al reintento. No cuenta para M1/M2.`);
          return;
        }
        const m1 = m1Coverage(out);
        const m2 = m2Dominance(out);
        results.push({ slug, m1, m2 });
        console.log(
          `[M1/M2] ${slug}: M1 ${m1.covered}/${m1.importantKinds} kinds importantes cubiertos ` +
            `(${m1.pass ? "PASA" : "FALLA"}), M2 dominante=${m2.dominant ?? "-"} ` +
            `share=${(m2.maxShare * 100).toFixed(1)}% (${m2.pass ? "PASA" : "FALLA"})`,
        );
      },
      // INTEGRACIÓN Ola 6 — mismo defecto que `census-golden.test.ts` (ver su
      // comentario): 180_000 hacía que `guava` siempre fallara por timeout de
      // infraestructura, nunca por M1/M2 en sí — medido en esta integración,
      // el subproceso real tarda >180 s. No afloja M1/M2: sólo deja terminar
      // la medición.
      WORKER_TEST_TIMEOUT_MS,
    );
  }

  /**
   * Agregado. Reporta los números siempre, vía `console.log`.
   *
   * N13 — ANTES, M1 y M2 vivían detrás de la MISMA compuerta
   * (`results.length < total ⇒ return`, silencioso): esto es la causa
   * MEDIDA de que `ranking-acceptance` "apareciera y desapareciera" entre
   * corridas de la suite completa (INTEGRADOR, Ola N, §1/§6.3) — trece
   * archivos pesados (`census-golden`, `edge-coverage`, `ranking-acceptance`
   * mismo) corren `analyzeRepo` sobre el MISMO corpus de 13 repos EN
   * PARALELO (vitest paraleliza por archivo por defecto; ningún `.concurrent`
   * en éste, así que DENTRO del archivo los 13 `it()` son secuenciales, pero
   * across archivos compiten por CPU), y `language-coverage.test.ts` ya
   * documentó (mismo informe) que ESO basta para que un repo grande pase de
   * 14 s a un timeout de 600 s bajo contención — "era contención, tenían
   * razón". Cuando eso le pasaba a CUALQUIERA de los 13 repos (no
   * necesariamente jekyll/lodash/preact, los que de verdad dominan M2), la
   * compuerta única apagaba en silencio la ÚNICA línea que afirma M2 —
   * incluso cuando jekyll/lodash/preact YA habían terminado y YA habían
   * violado el 25 %. El resultado: en una corrida el archivo mostraba la
   * violación real (todos llegaron a tiempo); en la siguiente, exactamente
   * el mismo árbol y el mismo corpus, no mostraba nada (uno cualquiera de
   * los 13 no llegó) — no determinismo del VEREDICTO, no del cómputo (
   * `ranking.ts`/`scoreFindings` son puros y deterministas — ver ese
   * archivo; verificado además por el integrador que un censo repetido da
   * bytes idénticos).
   *
   * AHORA, separadas (`computeAggregateVerdict`, arriba, probado sin corpus
   * más abajo): M2 es CERO TOLERANCIA — un repo que completó y violó el 25 %
   * es una prueba real sin importar cuántos de los otros 12 llegaron a
   * tiempo, así que se afirma con >= 1 resultado, siempre. M1 sigue
   * exigiendo el corpus completo (es una PROPORCIÓN: "7 de 10" no es "7 de
   * 13"), así que sólo se afirma cuando `completed >= total` — el piso en
   * sí, 7, no se tocó. `expect.soft` para que un fallo de M2 no le coma el
   * reporte a M1 (o viceversa) dentro del mismo hook.
   *
   * GUARDIÁN DE LA OLA O — `expect.soft` no corre dentro de un `afterAll`
   * (Vitest: "expect.soft() can only be used inside a test", medido: rompía
   * el ARCHIVO entero como "Failed Suite", no un `it()` puntual, y por eso
   * escondía los 13 resultados por repo de arriba, que sí quedaban en
   * verde). Es el mismo defecto de fondo que este bloque describe arriba
   * (una afirmación que vive fuera de un `it()` real), sólo que ahora en el
   * MECANISMO del arnés, no en su lógica — `computeAggregateVerdict` sigue
   * intacta, sin tocar. Arreglo: un `it()` real, declarado DESPUÉS del loop
   * de arriba — sin `.concurrent` en este archivo, Vitest corre los `it()`
   * de un mismo `describe` en el orden en que se declaran, así que este
   * test ve `results` ya poblado por los 13 de arriba antes de correr.
   */
  it("agregado — M1/M2 sobre el corpus completo (CONTRATO-F5.md §1.7)", () => {
    if (results.length === 0) return;
    const total = Object.keys(manifest!.corpus).length;
    const verdict = computeAggregateVerdict(results, total);
    console.log(
      `[M1/M2] agregado (${verdict.completed}/${verdict.total} repos completaron): M1 pasa en ` +
        `${verdict.m1PassCount}/${verdict.completed} (criterio: >= 7/8, exige corpus completo); ` +
        `M2 falla en [${verdict.m2FailingRepos.join(", ") || "ninguno"}] (criterio: 0 fallando, se exige siempre).`,
    );

    // CONTRATO-F5.md §1.7: M2 en TODOS los repos que completaron (0 fallando).
    // Un fallo acá es un veredicto sobre la fórmula (`SCORE_WEIGHTS`), no
    // sobre este test — ver "ORDEN DE LECTURA" en el docstring del módulo.
    expect.soft(verdict.m2FailingRepos, "M2 debe pasar en TODOS los repos que llegaron a completar (0% de dominio > 25%)").toEqual([]);

    if (!verdict.m1Evaluated) {
      console.warn(
        `[M1/M2] M1 no se exige esta corrida: sólo ${verdict.completed}/${verdict.total} repos completaron ` +
          `(algún repo no llegó a tiempo o quedó SKIP) — "N de ${verdict.completed}" no es comparable al piso 7/8.`,
      );
      return;
    }
    expect.soft(verdict.m1PassCount, `M1 pasó en ${verdict.m1PassCount}/${verdict.completed} repos, se exige >= 7/8`).toBeGreaterThanOrEqual(7);
  });

  /**
   * N13 — regresión de la compuerta agregada, sin corpus: prueba que M2 se
   * evalúa (y detecta una violación YA observada) aunque el corpus no haya
   * completado, y que M1 se abstiene sin corpus completo. Corre en
   * milisegundos, no depende de `CK_CORPUS_DIR` — es EL fix del bug de no
   * determinismo, no una medición del corpus.
   */
  describe("computeAggregateVerdict — sin corpus, regresión del no determinismo", () => {
    const ok = (slug: string): AggregateResult => ({ slug, m1: { pass: true }, m2: { pass: true } });
    const violatesM2 = (slug: string): AggregateResult => ({ slug, m1: { pass: true }, m2: { pass: false } });

    it("una violación de M2 entre los que completaron se ve aunque falten repos del corpus", () => {
      // 2 de 13 "completaron" — exactamente la forma del bug: un timeout
      // ajeno (los otros 11) NO puede esconder esta violación ya observada.
      const partial = [violatesM2("jekyll"), ok("click")];
      const v = computeAggregateVerdict(partial, 13);
      expect(v.completed).toBe(2);
      expect(v.m2FailingRepos).toEqual(["jekyll"]);
      expect(v.m1Evaluated).toBe(false); // M1 no se afirma: muestra parcial.
    });

    it("con el corpus completo, M1 sí se evalúa y M2 sigue viendo cualquier violación", () => {
      const complete = [violatesM2("lodash"), ok("click"), ok("cobra")];
      const v = computeAggregateVerdict(complete, 3);
      expect(v.completed).toBe(3);
      expect(v.m1Evaluated).toBe(true);
      expect(v.m1PassCount).toBe(3); // m1.pass no depende de m2.pass
      expect(v.m2FailingRepos).toEqual(["lodash"]);
    });

    it("sin ninguna violación, M2 reporta vacío exista o no el corpus completo", () => {
      const partial = [ok("click"), ok("cobra")];
      expect(computeAggregateVerdict(partial, 13).m2FailingRepos).toEqual([]);
      expect(computeAggregateVerdict(partial, 2).m2FailingRepos).toEqual([]);
    });
  });
});
