/**
 * Caché de `analyzeRepo` por SHA de repo + huella del analizador — ver el informe de la
 * tarea que agregó este archivo ("cachear el análisis del corpus por SHA, sin servir
 * nunca un resultado viejo").
 *
 * POR QUÉ EXISTE. `census-golden.test.ts`/`graph/edge-coverage.test.ts`/
 * `detect/ranking-acceptance.test.ts` corren `analyzeRepo` DE VERDAD sobre los 8 repos de
 * `tests/golden/manifest.json` (SHA congelado). Sólo `guava` tarda ~357 s, y las tres
 * compuertas lo pagan cada una — la suite completa con `CK_CORPUS_DIR` seteado pasó de
 * ~30 s a 15-25 min. Con el corpus por crecer a 13 repos, sin caché eso se va a una hora
 * larga, y una compuerta que tarda una hora no se corre — y una que no se corre no
 * protege nada.
 *
 * LA TRAMPA — y es lo único que importa de verdad acá. El SHA del repo está congelado,
 * pero el ANALIZADOR no: este proyecto lleva nueve olas modificando detectores e
 * hipótesis. Cachear sólo por SHA del repo serviría, tarde o temprano, el resultado de
 * una versión VIEJA del analizador contra el SHA de hoy — y todas las mediciones del
 * proyecto (censo, cobertura de aristas, precisión) pasarían a ser mentira sin que nadie
 * se entere. Este proyecto ya tiene el antecedente de seis olas midiendo contra una
 * columna mal calculada (ver RAICES.md); esto no repite esa clase de error porque la
 * clave de caché NUNCA es sólo el SHA del repo.
 *
 * LA CLAVE, explicada — `cacheKeyFor` más abajo la arma con TRES ingredientes:
 *
 *   1. `repoSignature` — `gitContentSignature` (`code-content-signature.ts`, ya existe,
 *      ya probado, usado hoy por `code-inspector.ts` para el mismo propósito). NO es
 *      `git rev-parse HEAD` a secas: además hashea el contenido de cualquier archivo
 *      modificado/sin trackear sobre ese commit, así que un checkout "sucio" del corpus
 *      (no debería pasar con SHA congelado, pero si pasa) nunca sirve un resultado
 *      incorrecto por confiar ciegamente en el SHA.
 *
 *   2. `analyzerFingerprint` (`computeCodeFingerprint` + `grammarFingerprint`) — la
 *      huella del ANALIZADOR:
 *        a) sha256 de TODO archivo bajo `src/server/services/` (recursivo, CUALQUIER
 *           extensión — incluye `.test.ts`, fixtures, y los `.json` de datos como
 *           `graph/benchmarks.json`/`lexicon-inventory.json`, que sí alimentan umbrales
 *           `derivado()`/inventario léxico) MÁS `src/shared/types.ts` y
 *           `src/shared/interfaces.ts` — no son sólo tipos: `code-analyzer.ts` y otros
 *           importan de ahí código que SÍ corre (constantes, funciones). Verificado con
 *           grep que ningún otro archivo de `src/shared/`/`src/server/` fuera de estos
 *           dos y de `services/` aporta código en runtime al camino de análisis.
 *
 *           SE ELIGIÓ TODO EL ÁRBOL, no una lista de "los módulos que sí participan".
 *           La opción "sólo los módulos que participan" es más precisa pero más frágil:
 *           nueve olas de este proyecto llevan moviendo lógica de detección/hipótesis/
 *           grafo de archivo en archivo, y armar esa lista a mano es EXACTAMENTE el tipo
 *           de inventario que se desincroniza en silencio (ver R3 y el antecedente de
 *           seis olas con la columna mal calculada, RAICES.md). Hashear de más cuesta
 *           tiempo (una invalidación de más cuando cambia un comentario); hashear de
 *           menos corrompe la medición. La instrucción de esta tarea es explícita: "ante
 *           la duda, elegí de más" — y el costo de una invalidación de más es tiempo,
 *           nunca corrupción silenciosa.
 *
 *           PROPIEDAD QUE ESTO REGALA GRATIS: este mismo archivo (`analyze-cache.ts`)
 *           vive bajo `src/server/services/`, así que está DENTRO de su propio hasheo —
 *           si el día de mañana se cambia el FORMATO del envelope que este módulo escribe
 *           a disco, ese cambio YA es "un cambio al analizador" a los efectos de la
 *           huella, y cualquier entrada vieja queda invalidada sin que haga falta acordarse
 *           de nada aparte. `CACHE_FORMAT_VERSION` (más abajo) es un segundo cinturón,
 *           barato, para el caso de un proceso huérfano con una huella en memoria vieja
 *           escribiendo con código de escritura nuevo — nunca la defensa principal.
 *
 *        b) versión REAL de `tree-sitter-wasms` y `web-tree-sitter`, resueltas desde
 *           `node_modules` en el momento de correr (no el lockfile: lo que importa es lo
 *           que el proceso va a `require` de verdad — ver `wasmPath`/`loadRuntime` en
 *           `code-analyzer.ts`).
 *
 *   3. `limits` (`AnalyzeLimits` — `maxFindings`/`offset`) — el único campo de
 *      `AnalyzeOptions` que cambia la SALIDA de `analyzeRepo` entre los llamadores reales
 *      (`census.mts`/`edge-coverage.mts` piden `"unlimited"`; el worker de
 *      `ranking-acceptance.test.ts` pide el default). Si dos llamadores piden límites
 *      distintos sobre el mismo repo+analizador, son cachés DISTINTOS — nunca comparten
 *      entrada, así que ninguno puede leer un resultado paginado distinto del que pidió.
 *
 *   `opts.repoName` DELIBERADAMENTE NO entra en la clave. Verificado con grep
 *   (`grep -rn "\.repoName\b" src/server/services/{detect,hypotheses,graph}`, cero
 *   resultados fuera de tests) que `repoName` es un rótulo de un solo campo escalar en
 *   `CodeAnalysis` (`code-analyzer.ts` línea `repoName: input.repoName`, sin transformar)
 *   y no influye en NINGÚN detector/hipótesis/arista. Excluirlo deja que `census.mts`,
 *   `edge-coverage.mts` y `dump-hallazgos.mts` compartan la MISMA entrada de caché para
 *   el mismo repo+límites aunque pasen `repoName` distinto — y en cache-hit este módulo
 *   parchea `analysis.repoName` de vuelta al valor que el CALLER pidió (ver
 *   `analyzeRepoCachedWithFingerprint`), así que el resultado servido es byte-idéntico al
 *   que una corrida fresca con ESE `repoName` habría producido. `incremental`/
 *   `graphCache`/`onFacts` no están soportados por este wrapper — ésa es la vía de
 *   `code-inspector.ts` (su propio caché sqlite, ya probado); éste es sólo para la
 *   llamada FRÍA que hacen los scripts de medición del corpus.
 *
 *   Variables de entorno: verificado con grep que HOY ningún archivo del camino de
 *   análisis (`code-analyzer.ts`, `detect/`, `hypotheses/`, `graph/`, `facts/`,
 *   `census.ts`) lee `process.env` — los únicos usos de `process.env` bajo
 *   `src/server/services/` viven en código de caveman (`pty-service.ts`,
 *   `git-service.ts`, `cleanup-service.ts`, `caveman.ts`, `schema-script.ts`,
 *   `fs-browser.ts`, `command-runner.ts`), fuera del camino de análisis y prohibidos de
 *   tocar en esta tarea. No hay ningún env var que agregar a la clave hoy; si algún
 *   detector futuro empieza a leer uno, el cambio de código que lo agregue YA invalida
 *   el caché (es un archivo bajo `src/server/services/`, hasheado arriba) — pero el
 *   VALOR de ese env var en cada corrida no formaría parte de la clave, así que quedaría
 *   pendiente sumarlo acá el día que exista. Documentado, no adivinado.
 *
 * DÓNDE VIVEN LOS ARTEFACTOS. `claude-kanban-docs/analyzer-cache/` — un directorio
 * HERMANO de este repo (no tracké por git: `claude-kanban-docs` ni siquiera es un repo
 * git), nunca dentro de `src/` ni `tests/`. Si viviera ahí adentro, el análisis de `src/`
 * (una de las dos poblaciones oficiales del proyecto — RAICES.md, "cuántos problemas
 * reales detecta sobre código real") se analizaría a sí mismo analizando su propio
 * caché, agregando ruido a esa medición cada vez que el caché escribe una entrada nueva.
 * Override para tests/depuración: `CK_ANALYSIS_CACHE_DIR`.
 *
 * ESCAPE HATCH. `CK_ANALYSIS_CACHE=0` (también acepta "off"/"false"/"no") desactiva
 * LECTURA y ESCRITURA — `analyzeRepo` corre siempre fresco, exactamente como si este
 * módulo no existiera. Para cuando alguien sospeche del caché.
 *
 * VERIFICABILIDAD. El resultado siempre viaja envuelto en `{ analysis, cache }`, con
 * `cache.hit`/`cache.key`/`cache.reason`/`cache.analyzeMs` — cualquier integrador puede
 * saber, mirando ese campo (los tres callers de este módulo lo imprimen a STDERR), si el
 * número que está reportando lo MIDIÓ (`hit: false`, `analyzeMs` real) o lo LEYÓ
 * (`hit: true`, `analyzeMs: 0`).
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

import { analyzeRepo, type AnalyzeLimits } from "./code-analyzer.js";
import { gitContentSignature } from "./code-content-signature.js";
import type { CodeGraph } from "./graph/types.js";
import type { CodeAnalysis, CodeFinding } from "../../shared/types.js";

const require = createRequire(import.meta.url);

/** `src/server/services` — el propio directorio de este archivo. */
const SERVICES_DIR = path.resolve(import.meta.dirname);
const SHARED_DIR = path.resolve(import.meta.dirname, "..", "..", "shared");
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");

/**
 * Bump SÓLO cuando cambia la FORMA del envelope que este módulo escribe a disco
 * (agregar/quitar/renombrar un campo de forma incompatible) — nunca por un cambio de
 * lógica del analizador, que ya se cubre solo (ver el docstring del módulo, "PROPIEDAD
 * QUE ESTO REGALA GRATIS").
 */
const CACHE_FORMAT_VERSION = 1;

/* ────────────────────────────────────────────────────────────────────────
 * La huella del analizador — código + gramáticas.
 * ──────────────────────────────────────────────────────────────────────── */

export interface FingerprintRoots {
  /** Directorios a recorrer recursivamente; TODO archivo cuenta, sin importar extensión. */
  readonly dirs: readonly string[];
  /** Archivos sueltos, sumados a los de `dirs`. */
  readonly files: readonly string[];
}

const DEFAULT_FINGERPRINT_ROOTS: FingerprintRoots = {
  dirs: [SERVICES_DIR],
  files: [path.join(SHARED_DIR, "types.ts"), path.join(SHARED_DIR, "interfaces.ts")],
};

async function walkFiles(dir: string, into: string[]): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return; // directorio ausente/ilegible — tratado como vacío, nunca como fatal.
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walkFiles(full, into);
    else if (entry.isFile()) into.push(full);
  }
}

async function hashFileContent(absPath: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(absPath);
    return createHash("sha256").update(buf).digest("hex");
  } catch {
    return null; // vanished between el listado y la lectura — tratado como ausente.
  }
}

/**
 * sha256 determinístico del contenido de `roots` — mismo patrón que
 * `code-content-signature.ts#gitContentSignature` (lista ordenada, `path\0hash` por
 * línea, hash del conjunto). Parametrizado por `roots` (default: el analizador real)
 * ÚNICAMENTE para que `analyze-cache.test.ts` pueda probar sensibilidad a cambios de
 * contenido sin tocar ni un archivo real de `src/server/services/` — ningún caller de
 * producción pasa `roots` explícito.
 */
export async function computeCodeFingerprint(roots: FingerprintRoots = DEFAULT_FINGERPRINT_ROOTS): Promise<string> {
  const files: string[] = [...roots.files];
  for (const dir of roots.dirs) await walkFiles(dir, files);

  const hashed = (
    await Promise.all(files.map(async (abs) => ({ abs, hash: await hashFileContent(abs) })))
  ).filter((f): f is { abs: string; hash: string } => f.hash !== null);
  hashed.sort((a, b) => (a.abs < b.abs ? -1 : a.abs > b.abs ? 1 : 0));

  const joined = hashed.map((f) => `${f.abs}\0${f.hash}`).join("\n");
  return createHash("sha256").update(joined).digest("hex");
}

/** Versión REAL resuelta desde `node_modules`, no la del lockfile — ver el docstring del módulo. */
function resolvePackageVersion(pkgName: string): string {
  try {
    const pkgJsonPath = require.resolve(`${pkgName}/package.json`);
    const parsed = JSON.parse(fsSync.readFileSync(pkgJsonPath, "utf8")) as { version?: string };
    return parsed.version ?? "sin-version-en-package.json";
  } catch (err) {
    return `no-resuelto:${err instanceof Error ? err.message : String(err)}`;
  }
}

function grammarFingerprint(): { readonly treeSitterWasms: string; readonly webTreeSitter: string } {
  return {
    treeSitterWasms: resolvePackageVersion("tree-sitter-wasms"),
    webTreeSitter: resolvePackageVersion("web-tree-sitter"),
  };
}

/** Memoizada por proceso: el árbol de `src/server/services/` no cambia mientras este proceso vive. */
let memoizedAnalyzerFingerprint: Promise<string> | null = null;

/** Huella completa del analizador (código + gramáticas) con los roots REALES — lo que todo caller de producción usa. */
export async function analyzerFingerprint(): Promise<string> {
  memoizedAnalyzerFingerprint ??= (async () => {
    const codeFp = await computeCodeFingerprint();
    const combined = JSON.stringify({ codeFp, grammar: grammarFingerprint() });
    return createHash("sha256").update(combined).digest("hex");
  })();
  return memoizedAnalyzerFingerprint;
}

/* ────────────────────────────────────────────────────────────────────────
 * La clave, el directorio, el escape hatch.
 * ──────────────────────────────────────────────────────────────────────── */

function cacheKeyFor(parts: { repoSignature: string; analyzerFp: string; limits: AnalyzeLimits | undefined }): string {
  const canonical = JSON.stringify({
    formatVersion: CACHE_FORMAT_VERSION,
    repoSignature: parts.repoSignature,
    analyzerFingerprint: parts.analyzerFp,
    limits: parts.limits ?? null,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function cacheRootDir(): string {
  const override = process.env.CK_ANALYSIS_CACHE_DIR;
  if (override) return path.resolve(override);
  return path.resolve(REPO_ROOT, "..", "claude-kanban-docs", "analyzer-cache");
}

/** `null` ⇒ caché habilitado. Motivo legible ⇒ deshabilitado (ver el docstring del módulo). */
function cacheDisabledReason(): string | null {
  const raw = process.env.CK_ANALYSIS_CACHE;
  if (raw === undefined) return null;
  const normalized = raw.trim().toLowerCase();
  if (["0", "off", "false", "no"].includes(normalized)) return `deshabilitado por CK_ANALYSIS_CACHE=${raw}`;
  return null;
}

/* ────────────────────────────────────────────────────────────────────────
 * El envelope en disco.
 * ──────────────────────────────────────────────────────────────────────── */

interface CacheEnvelope {
  formatVersion: number;
  key: string;
  createdAt: string;
  analysis: CodeAnalysis;
  preCapFindings: readonly CodeFinding[] | null;
  graph: CodeGraph | null;
}

async function readCacheEnvelope(file: string): Promise<CacheEnvelope | null> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as CacheEnvelope;
    if (parsed.formatVersion !== CACHE_FORMAT_VERSION) return null;
    return parsed;
  } catch {
    return null; // ausente, corrupto, o de un formatVersion viejo — tratado como miss.
  }
}

/** Escritura atómica (tmp + rename): dos subprocesos escribiendo la MISMA clave a la vez nunca dejan un archivo a medio escribir. */
async function writeCacheEnvelope(file: string, envelope: CacheEnvelope): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
  await fs.writeFile(tmp, JSON.stringify(envelope), "utf8");
  await fs.rename(tmp, file);
}

/** Mantenimiento mínimo, best-effort: entradas de más de 30 días se descartan en la próxima escritura. Nunca bloquea ni rompe una corrida. */
async function pruneOldEntries(dir: string, maxAgeMs: number): Promise<void> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const cutoff = Date.now() - maxAgeMs;
    await Promise.all(
      entries
        .filter((e) => e.isFile() && e.name.endsWith(".json"))
        .map(async (e) => {
          const full = path.join(dir, e.name);
          try {
            const stat = await fs.stat(full);
            if (stat.mtimeMs < cutoff) await fs.unlink(full);
          } catch {
            /* best-effort */
          }
        }),
    );
  } catch {
    /* best-effort: sin directorio todavía, o sin permiso — nunca fatal. */
  }
}

const PRUNE_MAX_AGE_MS = 30 * 24 * 60 * 60_000;

/* ────────────────────────────────────────────────────────────────────────
 * La orquestación.
 * ──────────────────────────────────────────────────────────────────────── */

export interface AnalyzeRepoCachedOpts {
  readonly dir: string;
  readonly repoName: string;
  readonly limits?: AnalyzeLimits;
}

export interface AnalyzeRepoCacheInfo {
  readonly enabled: boolean;
  readonly hit: boolean;
  readonly key: string;
  /** Legible por humanos — pensado para loguearse a STDERR (ver el docstring del módulo, "VERIFICABILIDAD"). */
  readonly reason: string;
  /** Tiempo real dentro de `analyzeRepo`. `0` en un hit: no se llamó. */
  readonly analyzeMs: number;
}

export interface AnalyzeRepoCachedResult {
  readonly analysis: CodeAnalysis;
  /** `onPreCapFindings` de `analyzeRepo` — lo que `census.ts#censusRepo` necesita. `null` si `analyzeRepo` nunca lo llamó (no debería pasar; ver su docstring). */
  readonly preCapFindings: readonly CodeFinding[] | null;
  /** `onGraph` de `analyzeRepo` — el `CodeGraph` completo (no sólo el resumen de `analysis.graph`). */
  readonly graph: CodeGraph | null;
  readonly cache: AnalyzeRepoCacheInfo;
}

async function runFresh(opts: AnalyzeRepoCachedOpts): Promise<{
  analysis: CodeAnalysis;
  preCapFindings: readonly CodeFinding[] | null;
  graph: CodeGraph | null;
  analyzeMs: number;
}> {
  let preCapFindings: readonly CodeFinding[] | null = null;
  let graph: CodeGraph | null = null;
  const t0 = performance.now();
  const analysis = await analyzeRepo({
    dir: opts.dir,
    repoName: opts.repoName,
    limits: opts.limits,
    onPreCapFindings: (f) => {
      preCapFindings = f;
    },
    onGraph: (r) => {
      graph = r.graph;
    },
  });
  const analyzeMs = performance.now() - t0;
  return { analysis, preCapFindings, graph, analyzeMs };
}

/**
 * La orquestación real de lectura/escritura, parametrizada por `analyzerFp` en vez de
 * calcularla ella misma — separado de `analyzeRepoCached` (que sí usa los roots REALES)
 * ÚNICAMENTE para que `analyze-cache.test.ts` pueda probar la invalidación de punta a
 * punta (repo real, lectura/escritura real a disco) inyectando una huella de prueba, SIN
 * tocar ni un archivo de `src/server/services/` para simular "el analizador cambió".
 * Ningún caller de producción llama esto directo — todos (`census.ts`, `edge-coverage.mts`,
 * `dump-hallazgos.mts`, el worker de `ranking-acceptance.test.ts`) pasan por
 * `analyzeRepoCached`, que calcula `analyzerFp` con `computeCodeFingerprint()` real.
 */
export async function analyzeRepoCachedWithFingerprint(
  opts: AnalyzeRepoCachedOpts,
  analyzerFp: string,
): Promise<AnalyzeRepoCachedResult> {
  const disabledReason = cacheDisabledReason();
  if (disabledReason) {
    const fresh = await runFresh(opts);
    return { ...fresh, cache: { enabled: false, hit: false, key: "", reason: disabledReason, analyzeMs: fresh.analyzeMs } };
  }

  let repoSignature: string;
  try {
    repoSignature = (await gitContentSignature(opts.dir)).signature;
  } catch (err) {
    const fresh = await runFresh(opts);
    const reason = `sin caché: "${opts.dir}" no es un checkout git (${err instanceof Error ? err.message : String(err)})`;
    return { ...fresh, cache: { enabled: true, hit: false, key: "", reason, analyzeMs: fresh.analyzeMs } };
  }

  const key = cacheKeyFor({ repoSignature, analyzerFp, limits: opts.limits });
  const file = path.join(cacheRootDir(), `${key}.json`);

  const cached = await readCacheEnvelope(file);
  if (cached) {
    // `repoName` deliberadamente fuera de la clave (ver el docstring del módulo) — se
    // parchea acá para que el resultado servido sea byte-idéntico al que una corrida
    // fresca con ESTE `opts.repoName` habría producido.
    return {
      analysis: { ...cached.analysis, repoName: opts.repoName },
      preCapFindings: cached.preCapFindings,
      graph: cached.graph,
      cache: { enabled: true, hit: true, key, reason: "hit: mismo repo + mismo analizador + mismos límites", analyzeMs: 0 },
    };
  }

  const fresh = await runFresh(opts);
  try {
    await writeCacheEnvelope(file, {
      formatVersion: CACHE_FORMAT_VERSION,
      key,
      createdAt: new Date().toISOString(),
      analysis: fresh.analysis,
      preCapFindings: fresh.preCapFindings,
      graph: fresh.graph,
    });
    void pruneOldEntries(cacheRootDir(), PRUNE_MAX_AGE_MS);
  } catch (err) {
    console.error(`[analyzer-cache] no se pudo persistir ${file}:`, err);
  }
  return { ...fresh, cache: { enabled: true, hit: false, key, reason: "miss: calculado y guardado", analyzeMs: fresh.analyzeMs } };
}

/**
 * El punto de entrada real. Calcula la huella del analizador con los roots de
 * PRODUCCIÓN (`src/server/services/` + `src/shared/{types,interfaces}.ts`) y delega en
 * `analyzeRepoCachedWithFingerprint`. Usar SIEMPRE esta función, nunca la de arriba,
 * fuera de `analyze-cache.test.ts`.
 */
export async function analyzeRepoCached(opts: AnalyzeRepoCachedOpts): Promise<AnalyzeRepoCachedResult> {
  const fp = await analyzerFingerprint();
  return analyzeRepoCachedWithFingerprint(opts, fp);
}
