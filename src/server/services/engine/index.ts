/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL MOTOR DE ANÁLISIS — SUPERFICIE PÚBLICA. OLA BC, FRENTE BC1.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ESTA ES LA PUERTA. Un consumidor nuevo —el servidor MCP que motiva esta ola,
 * un script, un test— entra por acá y no necesita leer nada más. Antes de esta
 * ola tenía dos opciones y las dos eran malas: entrar por `code-analyzer.ts`
 * (4.177 líneas, 27 exports, sin una jerarquía que diga cuál es el principal) o
 * entrar por `code-inspector.ts`, que le pide un `taskId` que no tiene.
 *
 * EL MOTOR NO SABE QUE EXISTE UN TABLERO. Ni una tarea, ni un proyecto, ni un
 * worktree de tarea, ni `config.ts`. Está probado, no prometido:
 * `no-board-imports.test.ts` recorre los 404 archivos del motor y falla si
 * alguno importa algo del tablero.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * QUÉ SE LE PUEDE PEDIR — LAS TRES COSAS, EN ORDEN DE MENOS A MÁS APARATO
 * ───────────────────────────────────────────────────────────────────────────
 *
 *  1. ANALIZAR UN DIRECTORIO, EN FRÍO — `analyzeDirectory`.
 *     Sin base de datos, sin estado, sin nada. Le das una ruta, te devuelve el
 *     `CodeAnalysis` completo (hallazgos rankeados con sus hipótesis de
 *     patrón, resumen por archivo, cobertura de detectores). Es una función
 *     pura respecto del disco: dos llamadas sobre el mismo árbol dan el mismo
 *     resultado. Cuesta lo que cuesta parsear el repo entero — segundos en un
 *     repo chico, ~350 s en guava.
 *
 *  2. ANALIZAR CON CACHÉ PERSISTENTE — `createAnalysisEngine(db)`.
 *     Para cuando vas a preguntar por el MISMO repo muchas veces (un panel que
 *     hace poll, un agente MCP que conversa). Guarda dos niveles en sqlite:
 *     una instantánea del repo entero por firma de contenido —si nada cambió,
 *     responde sin tocar el analizador— y los hechos POR ARCHIVO, así que
 *     cambiar un archivo re-parsea un archivo, no el árbol. También persiste
 *     el grafo de código y sirve los descartes.
 *     LA CONEXIÓN LA RECIBE, NUNCA LA BUSCA (ver `db.ts` y `schema.ts`).
 *
 *  3. ANALIZAR PARA MEDIR — `analyzeDirectoryCached`.
 *     La vía de los scripts de corpus y de las compuertas
 *     (`census-golden`/`ranking-acceptance`/`edge-coverage`). Cachea en DISCO
 *     por (firma del repo × huella del analizador × límites), así que una
 *     compuerta que tarda 18 minutos la primera vez tarda segundos la
 *     siguiente, y NUNCA sirve el resultado de una versión vieja del
 *     analizador: la huella hashea todo `src/server/services/`. Ver el
 *     docstring de `analyze-cache.ts`, que explica la trampa entera.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CÓMO ARRANCA UN CONSUMIDOR NUEVO — COPIABLE, LAS DOS FORMAS
 * ───────────────────────────────────────────────────────────────────────────
 *
 * (A) EN FRÍO, sin base de datos. Tres líneas, y es todo:
 *
 * ```ts
 * import { analyzeDirectory } from "./services/engine/index.js";
 *
 * const analysis = await analyzeDirectory({ dir: "/ruta/al/repo", repoName: "mi-repo" });
 * console.log(analysis.findings.length, analysis.findings[0]?.title);
 * ```
 *
 * (B) CON CACHÉ PERSISTENTE, incluido el caso "mi propia base de datos". Nada
 * de esto toca el tablero — ni `initDb`, ni `config.ts`, ni una tabla de
 * tareas:
 *
 * ```ts
 * import Database from "better-sqlite3";
 * import { createAnalysisEngine, ensureEngineSchema } from "./services/engine/index.js";
 *
 * const db = new Database("/donde/quieras/analizador.db");   // o ":memory:"
 * ensureEngineSchema(db);                                     // idempotente
 *
 * const engine = createAnalysisEngine(db);
 * const analysis = await engine.analyze({
 *   dir: "/ruta/al/repo",
 *   repoName: "mi-repo",
 *   repoKey: "/ruta/al/repo",   // string OPACO: sólo tiene que ser estable
 * });
 *
 * engine.discard(repoKey, analysis.findings[0].id!, "no aplica");
 * ```
 *
 * Guardá el `engine` entre llamadas: sus dos cachés en RAM son lo que hace
 * incremental la segunda corrida sobre el mismo `repoKey`.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * LO QUE EL MOTOR NO HACE, A PROPÓSITO
 * ───────────────────────────────────────────────────────────────────────────
 *
 *  · No abre bases de datos ni lee configuración. La conexión llega por
 *    parámetro; ninguna ruta de archivo está escrita en este paquete.
 *  · No sabe qué es una tarea. `repoKey` es un string opaco (ver
 *    `repo-analysis.ts`): el tablero le pasa `project_repos.id`, el MCP le
 *    puede pasar la ruta del repo.
 *  · No pagina para servir. Devuelve el ranking completo (topado por
 *    `MAX_STORED_FINDINGS`); rebanar es del que sirve.
 *  · No elige el ref contra el que comparar. Sabe comparar (punto 4, abajo),
 *    pero "la rama por defecto", "donde ramifiqué" y "el último push" son tres
 *    respuestas distintas y cuál corresponde depende de quién pregunta.
 */


/* ── 1. Analizar un directorio, en frío ─────────────────────────────────── */

export {
  analyzeRepo as analyzeDirectory,
  analyzeFile,
  collectFiles,
  worktreeSignature,
  DEFAULT_ANALYZE_LIMITS,
  MAX_STORED_FINDINGS,
  FACTS_SCHEMA_VERSION,
} from "../code-analyzer.js";
export type {
  AnalyzeOptions as AnalyzeDirectoryOptions,
  AnalyzeLimits,
  FileFacts,
  ScannedFile,
} from "../code-analyzer.js";

/* ── 2. Analizar con caché persistente ──────────────────────────────────── */

export { RepoAnalysisEngine } from "./repo-analysis.js";
export type { RepoAnalysisRequest, CodeFindingDecision } from "./repo-analysis.js";
export { ensureEngineSchema, ENGINE_TABLES } from "./schema.js";
export type { EngineDb } from "./db.js";

import { RepoAnalysisEngine } from "./repo-analysis.js";
import type { EngineDb } from "./db.js";

/**
 * El constructor recomendado. `db` tiene que venir con `ensureEngineSchema`
 * aplicado (`initDb` del tablero ya lo hace; un consumidor propio lo llama él).
 */
export function createAnalysisEngine(db: EngineDb): RepoAnalysisEngine {
  return new RepoAnalysisEngine(db);
}

/* ── 3. Analizar para medir ─────────────────────────────────────────────── */

export {
  analyzeRepoCached as analyzeDirectoryCached,
  analyzeRepoCachedWithFingerprint,
  analyzerFingerprint,
} from "../analyze-cache.js";
export type { AnalyzeRepoCachedOpts, AnalyzeRepoCachedResult, AnalyzeRepoCacheInfo } from "../analyze-cache.js";

/* ── Identidad de hallazgos, censo, firma de contenido ──────────────────── */

export { stableFindingId, contentKeyForFinding } from "../code-finding-ids.js";
export { gitContentSignature } from "../code-content-signature.js";
export type { ContentSignature } from "../code-content-signature.js";
/**
 * `ANALYZER_VERSION` NO SE SUBE al refactorizar. Se estampa en
 * `CensusMeta.analyzerVersion`, `census-golden.test.ts` exige que no haya
 * mismatch, y `CodeFactsRepository.gc()` BORRA (no invalida) toda fila de otra
 * versión. Sube sólo cuando cambian las reglas de conteo del censo.
 */
export { ANALYZER_VERSION, censusOf, censusRepo, diffCensus, parseCensus, serializeCensus } from "../census.js";
export type { Census, CensusKeys, CensusMeta, CensusDiff } from "../census.js";

/* ── Los tipos que viajan en las respuestas ─────────────────────────────── */

export type {
  CodeAnalysis,
  CodeFinding,
  CodeFindingHypothesis,
  CodeFileSummary,
  CodeGraphSummary,
} from "../../../shared/types.js";

/* ── 4. Comparar contra un ref de git — Ola BC, frente BC2 ──────────────── */

/**
 * DOS VISTAS, Y NO SE MEZCLAN — ver el docstring de `compare.ts`:
 *
 *   · `introduced` **(A)**: lo que NO existía en el ref base. Resta de ids.
 *     Contesta *"¿qué introduje?"*. Cuesta un segundo análisis.
 *   · `inTouchedFiles` **(B)**: lo que está en los archivos que tocaste,
 *     existiera antes o no. Contesta *"¿qué me conviene arreglar ya que estoy
 *     acá?"*. Es barata: `findingsInTouchedFiles` la da sin segundo análisis.
 *
 * Presentar un hallazgo de (B) que no está en (A) como "lo generaste vos" es
 * mentir; por eso cada fila de (B) trae `alsoIntroduced`.
 *
 * **OLA BD — Y LA MENTIRA SIMÉTRICA, QUE ES LA QUE CALLA.** `alsoIntroduced:
 * false` NO quiere decir "ya estaba" a secas: un hallazgo AGRUPADO puede
 * aparearse con su versión vieja y traer adentro la función que el usuario acaba
 * de escribir. Por eso cada fila trae también `newLocations` (las ubicaciones que
 * el base no tenía) y el resultado trae `partiallyIntroduced` **(A')**. Una vista
 * de "qué introduje" honesta es `introduced` **más** `partiallyIntroduced`.
 *
 * Y EL ID SOLO NO ALCANZA para saber qué es nuevo — medido sobre `preact`: una
 * función agregada a un archivo hace que el AGRUPAMIENTO de F5 colapse cinco
 * `complexity` en uno, y como `stableFindingId` hashea todas las ubicaciones,
 * la resta cruda reportaba 1 hallazgo viejo como introducido y 4 como
 * arreglados. Por eso el emparejamiento tiene cuatro pases (id → contenido →
 * ubicación → absorción) y el resultado trae `absorbed` ("no se arregló: se lo
 * comió un grupo") y `unreliableAttribution` ("acá no puedo afirmar cuál es
 * cuál"). Ver el docstring de `compare.ts`.
 *
 * ```ts
 * import { compareAgainstRef, createAnalysisEngine } from "./services/engine/index.js";
 *
 * const engine = createAnalysisEngine(db);            // guardalo entre llamadas
 * const cmp = await compareAgainstRef({
 *   dir: "/ruta/al/repo",
 *   baseRef: "origin/main",                           // lo elige el consumidor
 *   repoName: "mi-repo",
 *   analyze: ({ dir, repoName }) => engine.analyze({ dir, repoName, repoKey: "/ruta/al/repo" }),
 * });
 * cmp.introduced;            // (A)  lo que introdujiste
 * cmp.partiallyIntroduced;   // (A') lo que introdujiste adentro de algo viejo
 * cmp.inTouchedFiles;        // (B)  lo que hay en lo que tocaste
 * ```
 */
export {
  compareAgainstRef,
  diffAnalyses,
  findingsInTouchedFiles,
  findingsInFiles,
} from "./compare.js";
export type {
  CompareOptions,
  ComparisonResult,
  ComparisonCost,
  TouchedFinding,
  CarriedOverFinding,
  AbsorbedFinding,
  PartiallyIntroducedFinding,
  AttributionGroup,
  AnalyzeFn,
} from "./compare.js";
export {
  resolveBaseCommit,
  changedFilesSince,
  withRefWorktree,
  describeWorkingTree,
  isGitCheckout,
  GitRefError,
  RefWorktreeBusyError,
} from "./git-ref.js";
