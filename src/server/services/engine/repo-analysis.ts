/**
 * OLA BC, FRENTE BC1 — EL MOTOR DE ANÁLISIS POR REPOSITORIO, SIN TABLERO.
 *
 * Este archivo es el corazón de `code-inspector.ts` SIN la mitad que sabía de
 * tareas. Todo lo que hay acá adentro ya existía —salió de `code-inspector.ts`
 * tal cual, comentarios incluidos— y todo lo que hay acá adentro entra por
 * `repoKey`, `dir` y `repoName`: tres strings. Ninguno es un `taskId`, ninguno
 * obliga a tener un tablero.
 *
 * DÓNDE QUEDÓ LA LÍNEA, exactamente:
 *
 *   · ACÁ (motor): el caché persistente de dos niveles sobre sqlite (snapshot
 *     de repo entero + hechos por archivo), la construcción/persistencia
 *     incremental del grafo, el GC, los ids estables, el resumen de grafo, y
 *     los descartes por `(repoKey, findingId)`.
 *   · EN `code-inspector.ts` (tablero): traducir `taskId` → los repos de esa
 *     tarea, el caché en RAM por worktree con su `analyzing: true` (la forma
 *     que necesita un panel que hace poll — un consumidor que puede `await` no
 *     la necesita), y la paginación de servido.
 *
 * `repoKey` PARA EL MOTOR ES UN STRING OPACO. Hoy el tablero le pasa
 * `project_repos.id`; el MCP le puede pasar la ruta absoluta del repo, o un
 * hash de su remote. Lo único que el motor exige es que sea ESTABLE para "el
 * mismo repositorio" a lo largo del tiempo: es la primera columna de la PK de
 * las tres tablas. Dos consumidores que usen convenciones distintas sobre la
 * misma base no se corrompen entre sí — se ignoran, cada uno con su espacio de
 * claves.
 *
 * LA CONEXIÓN LLEGA, NO SE BUSCA (punto 5 del encargo). El constructor recibe
 * un `EngineDb` ya abierto y con `ensureEngineSchema` aplicado; este archivo no
 * conoce ninguna ruta de archivo, ninguna variable de entorno y ninguna
 * configuración.
 *
 * INVARIANTE DE ESTA OLA: es un REFACTOR. Ni una línea de lógica cambió de
 * comportamiento al mudarse — mismos umbrales de GC, mismas claves de caché,
 * misma `FACTS_SCHEMA_VERSION` en la clave del snapshot (la cicatriz de la Ola
 * BA/BB: ver el comentario dentro de `analyze`), mismo `ANALYZER_VERSION`.
 */
import {
  analyzeRepo,
  collectFiles,
  FACTS_SCHEMA_VERSION,
  type FileFacts,
  type IntraGraphCacheEntry,
} from "../code-analyzer.js";
import { gitContentSignature, type ContentSignature } from "../code-content-signature.js";
import { stableFindingId } from "../code-finding-ids.js";
import type { GraphBuildCache } from "../graph/build.js";
import type { CodeGraph } from "../graph/types.js";
import {
  CodeFactsRepository,
  CODE_FACTS_REPO_SNAPSHOT_PATH,
} from "../../db/code-facts-repository.js";
import { CodeDecisionsRepository, type CodeFindingDecision } from "../../db/code-decisions-repository.js";
export type { CodeFindingDecision };
import { CodeGraphRepository } from "../../db/code-graph-repository.js";
import { ANALYZER_VERSION } from "../census.js";
import type { EngineDb } from "./db.js";
import type { CodeAnalysis, CodeFinding, CodeGraphSummary } from "../../../shared/types.js";

/** Facts unused this long are reclaimed regardless of the row cap — see `CodeFactsRepository.gc`. */
const FACTS_TTL_MS = 14 * 24 * 60 * 60_000; // 14 days
/** Hard cap on total `code_file_facts` rows across every repo — desalojo LRU past this. */
const FACTS_MAX_ROWS = 200_000;
/**
 * F3: hard cap on total `code_graphs` rows across every repo. Much smaller
 * than `FACTS_MAX_ROWS` on purpose — a graph is ONE row per (repo, commit),
 * not one per file, so a generous few thousand covers every repo/commit this
 * process is realistically asked about between GC sweeps.
 */
const GRAPH_MAX_ROWS = 2_000;
/** GC is opportunistic, not per-request: sqlite would otherwise pay a sweep on every poll. */
const GC_MIN_INTERVAL_MS = 5 * 60_000;

/**
 * P3 — the `AnalyzeLimits` this module ALWAYS passes to `analyzeRepo`,
 * regardless of what page the HTTP caller asked for this particular GET (see
 * `analyze`'s docstring for why: the cache/persistence
 * key does not vary by `limits`, so this module must not either). `"unlimited"`
 * is still bounded by `MAX_STORED_FINDINGS` inside `code-analyzer.ts` — the
 * real storage ceiling, not something this module opts into or out of.
 */
const UNLIMITED_STORAGE_LIMITS = { maxFindings: "unlimited" } as const;

/**
 * Lo único que el motor necesita para analizar un repositorio. Tres strings —
 * ni un `taskId`, ni un `Repositories`, ni nada que venga del tablero.
 */
export interface RepoAnalysisRequest {
  /** Directorio a analizar. Un worktree, un checkout, cualquier árbol en disco. */
  readonly dir: string;
  /** Rótulo que viaja en `CodeAnalysis.repoName`. No influye en ningún detector. */
  readonly repoName: string;
  /**
   * Identidad ESTABLE del repositorio, para el caché persistente. Opaca para el
   * motor: ver el docstring del módulo.
   */
  readonly repoKey: string;
}

/**
 * El caché persistente del analizador, sobre una conexión sqlite que le dan.
 * Una instancia por proceso alcanza y es lo recomendado: los dos cachés en RAM
 * (`graphBuildCache`, `intraGraphCache`) son lo que vuelve incremental la
 * segunda corrida sobre el mismo `repoKey`.
 */
export class RepoAnalysisEngine {
  /** L2: persistent, content-addressed, survives a restart — F2. */
  private readonly facts: CodeFactsRepository;
  private readonly decisions: CodeDecisionsRepository;
  /** F3: the code graph's own persistent, content-addressed store — see `code-graph-repository.ts`. */
  private readonly graphs: CodeGraphRepository;
  /**
   * P2 — the graph's OWN incremental state, per-repo, IN MEMORY ONLY (never
   * written to sqlite: `code_graphs` above still stores the flattened
   * `CodeGraph` JSON for cross-process/cross-worktree reuse, unchanged).
   * This is what makes `buildGraphIncremental` actually incremental across
   * polls of the SAME process instead of just chunked-but-still-full: the
   * next call for this `repoKey` passes THIS as `previous`, so only the
   * files that changed (or that reference a name whose declarations changed
   * — see `graph/build.ts`'s own docstring) get recomputed. A process
   * restart empties this map; the next build for that repo falls back to
   * the cold (still chunked, never a long unbroken block) path — slower
   * that one time, never wrong. Cleared for a `repoKey` whenever this
   * module cannot vouch for what state it corresponds to (see
   * `attachAndPersistGraph`) — correctness always wins over reuse.
   */
  private readonly graphBuildCache = new Map<string, GraphBuildCache>();
  /**
   * N13 — caché de la PASADA 2 (`AnalyzeOptions.intraGraphCache`, ver su
   * docstring en `code-analyzer.ts` para el porqué del par de clave exacto).
   * Alcance de UNA generación por `repoKey`: se REEMPLAZA entero apenas la
   * huella del grafo (`fingerprint`) cambia respecto de la última vez, nunca
   * ACUMULA entradas de una huella vieja — así que su tamaño nunca excede la
   * cantidad de archivos "que importan" del repo. Sin este límite, cada poll
   * que mueve el grafo (la mayoría, en un repo activo) dejaría atrás una
   * generación entera de entradas MUERTAS, sin cota, en un proceso de larga
   * vida — el mismo criterio de "correctness/memoria acotada gana a reuse
   * indiscriminado" que ya rige `graphBuildCache` arriba.
   */
  private readonly intraGraphCache = new Map<
    string,
    { fingerprint: string; entries: Map<string, IntraGraphCacheEntry> }
  >();
  private lastGcAt = 0;

  constructor(db: EngineDb) {
    this.facts = new CodeFactsRepository(db, ANALYZER_VERSION);
    this.decisions = new CodeDecisionsRepository(db, ANALYZER_VERSION);
    this.graphs = new CodeGraphRepository(db, ANALYZER_VERSION);
  }

  /** La versión del analizador con la que este motor lee y escribe. */
  get analyzerVersion(): string {
    return ANALYZER_VERSION;
  }

  /** Descarta un hallazgo por `(repoKey, id estable)`, con motivo. */
  discard(repoKey: string, findingId: string, reason: string): void {
    this.decisions.discard(repoKey, findingId, reason);
  }

  /** Deshace un descarte. No-op si no estaba descartado. */
  restore(repoKey: string, findingId: string): void {
    this.decisions.restore(repoKey, findingId);
  }

  /** Los descartes vigentes de un repo, por id de hallazgo. */
  decisionsFor(repoKey: string): Map<string, CodeFindingDecision> {
    return this.decisions.listForRepo(repoKey);
  }

  /**
   * EL PUNTO DE ENTRADA. F2/F3's actual cache. Tries the content-addressed whole-repo snapshot
   * first; only on a miss does it pay for a real `analyzeRepo` call — but
   * (F3) that call reuses a per-file `FileFacts` for every file whose
   * content hash did not move, instead of re-parsing the whole tree, via
   * `AnalyzeOptions.incremental`. The result — WITH stable ids attached — is
   * persisted (both the fresh per-file facts and the new whole-repo
   * snapshot) for next time.
   *
   * `gitContentSignature` throws for a worktree that is not a git checkout
   * (a plain temp directory in a test, say): that degrades to "no persistent
   * cache for this run", never to a failed analysis — `analyzeRepo` still
   * runs, uncached, it just cannot be remembered past this process.
   *
   * P3 — DECISIÓN DE CACHÉ (ver el reporte final de esta tarea): esta función
   * (y `analyzeIncremental`, más abajo) siempre le pide a `analyzeRepo` el
   * ranking COMPLETO (`limits: { maxFindings: "unlimited" }`, topado sólo por
   * `MAX_STORED_FINDINGS`), sin importar qué página pidió el caller HTTP de
   * ESTA corrida — la paginación real por `offset`/`limit` ocurre DESPUÉS,
   * en `inspectRepo` (`paginate`, sólo un slice en memoria del array ya
   * cacheado/persistido). Deliberado: `AnalyzeOptions.limits` no forma parte
   * de `worktreeSignature` ni de la firma de contenido con la que se
   * persiste el snapshot (`code-analyzer.ts` lo advierte explícitamente en
   * el docstring de `.limits`) — si esta función variara `limits` según la
   * página pedida, una corrida sin cap se serviría bajo la MISMA clave que
   * una capada, y el orden de llegada de las peticiones decidiría qué queda
   * en caché para todo el mundo. Pedir siempre la MISMA cosa (todo, hasta el
   * techo de almacenamiento) evita el problema por construcción, y es más
   * barato que analizar de nuevo por página: cada GET con un `offset`
   * distinto paga sólo un `Array.prototype.slice`, nunca un nuevo
   * `analyzeRepo`/parseo — ver `code.test.ts` para la prueba de que
   * `analyzeRepo` se llama UNA sola vez para dos páginas distintas.
   */
  async analyze({ dir: worktreePath, repoName, repoKey }: RepoAnalysisRequest): Promise<CodeAnalysis> {
    let contentSig: ContentSignature | null = null;
    try {
      contentSig = await gitContentSignature(worktreePath);
    } catch {
      contentSig = null;
    }

    if (contentSig) {
      // OLA BB — `FACTS_SCHEMA_VERSION` ES PARTE DE LA CLAVE, y tiene que
      // estarlo: la línea de abajo (`JSON.parse(snapshot.findingsJson)`)
      // devuelve el `CodeAnalysis` público TAL CUAL quedó serializado en una
      // corrida anterior, sin volver a pasar por `toPublicHypothesis`. Lo que
      // esa fila no traiga, el panel no lo recibe nunca. Ver el docstring de
      // `readRepoSnapshot`: la Ola BA subió este mismo contador creyendo que
      // invalidaba este caché y en realidad sólo invalidó el de `readFacts`.
      const snapshot = this.facts.readRepoSnapshot(repoKey, contentSig.signature, FACTS_SCHEMA_VERSION);
      if (snapshot) {
        this.facts.touch(repoKey, [CODE_FACTS_REPO_SNAPSHOT_PATH]);
        // F3: the persisted graph for this exact signature (if any) was built
        // and stored the LAST time this signature was a miss — a snapshot hit
        // means nothing changed, so its `CodeAnalysis.graph` summary (already
        // embedded in `snapshot.findingsJson` from that run) is still
        // accurate. Only the graph's own LRU needs bumping, never a rebuild.
        this.graphs.touch(repoKey, contentSig.signature);
        this.maybeGc();
        return JSON.parse(snapshot.findingsJson) as CodeAnalysis;
      }
    }

    const raw = contentSig
      ? await this.analyzeIncremental(worktreePath, repoName, repoKey, contentSig)
      : await analyzeRepo({ dir: worktreePath, repoName, limits: UNLIMITED_STORAGE_LIMITS });
    const analysis = withStableIds(raw);

    // N13 — `safeStringify`, no `JSON.stringify` a secas: ver su docstring y
    // el de `analyzeIncremental`/`fresh` para la RAÍZ real (el `FileFacts`
    // por archivo, no `analysis`). `analysis.findings[].hypotheses` YA pasó
    // por `toPublicHypothesis` (`code-analyzer.ts`, Ola 10), que excluye
    // `refreshState` en punta — verificado leyendo el código: esta línea es
    // roja de más, nunca sirve un dato viejo por menos. La dejo igual, gratis
    // y sin costo real (el `analysis` público es chico comparado con el
    // grafo/facts): dos guardianes independientes valen más que confiar en
    // que ningún camino futuro vuelva a exponer `refreshState` acá.
    if (contentSig) {
      this.facts.putRepoSnapshot(repoKey, contentSig.signature, safeStringify(analysis, repoKey), FACTS_SCHEMA_VERSION);
    }
    this.maybeGc();
    return analysis;
  }

  /**
   * F3: the per-file reuse path. `analyzeRepo` still runs — every existing
   * caller that watches it (tests spying on `codeAnalyzer.analyzeRepo`, and
   * the whole-repo snapshot check above, which decides whether to call it AT
   * ALL) sees exactly the call pattern it saw before this change — but for
   * every file whose CURRENT content hash (from `gitContentSignature`,
   * already paid for above) matches a cached `FileFacts`, `analyzeRepo`
   * skips `analyzeFile` (the read+parse+walk) for that file entirely. Only
   * genuinely changed files get re-parsed; this is the fix for "changing one
   * file re-parses the whole repo" (see `code-analyzer.ts`'s "F3" section).
   *
   * `collectFiles` is called once here (cheap: `fs.stat` plus, since D5, a
   * single 64 KiB read per file — the generated/minified exclusion has to see
   * the header; never a parse) to pre-fetch every candidate's cached row in
   * ONE query, rather than one sqlite round-trip per file inside
   * `analyzeRepo`'s loop. Measured cost of that read: +0.19 ms per file over
   * this repo's `tests/` tree (18 ms → 67 ms for 251 files), against the
   * ~200 s a large repo's analysis takes.
   */
  private async analyzeIncremental(
    worktreePath: string,
    repoName: string,
    repoKey: string,
    contentSig: ContentSignature,
  ): Promise<CodeAnalysis> {
    const hashByPath = new Map(contentSig.files.map((f) => [f.path, f.hash]));
    const scanned = await collectFiles(worktreePath);
    const cachedRows = this.facts.readFacts(repoKey, scanned.map((f) => f.path), FACTS_SCHEMA_VERSION);

    // N13 — cada entrada es la fila YA lista para `upsertFacts` (`path`,
    // `contentHash`, ..., `json`), NUNCA el `FileFacts` crudo guardado para
    // stringificar DESPUÉS. Motivo, medido (informe de esta ola): `analyzeRepo`
    // llama a este `put` DENTRO de su loop por archivo, ANTES de que
    // `crossAnalyze` corra — pero el `Finding` que cada `FileFacts.findings`
    // referencia es el MISMO objeto (por referencia, nunca copiado) que
    // `crossAnalyze` sigue usando después, y `refreshHypotheses` (dentro de
    // `crossAnalyze`, tras la pasada 2) lo MUTA en el sitio
    // (`finding.hypotheses = refreshed`). Si el `JSON.stringify` de esta fila
    // se posterga hasta después de `await analyzeRepo(...)` (como hacía este
    // método hasta esta corrección), serializa el finding YA mutado. RAÍZ
    // medida (ver `safeStringify`, más abajo): CUALQUIER hipótesis Template
    // Method sobre un ancla estructural (por AST puro, dentro de `analyzeFile`
    // — ni hace falta que el grafo la resuelva) trae `refreshState.finding
    // === finding` por diseño del builder — `finding.hypotheses[i].refreshState
    // .finding === finding` es CIRCULAR apenas se cierra sobre el mismo
    // `Finding` compartido. Cuando la variante ES la que se resuelve DESPUÉS
    // vía grafo (`resolveDeferredViaGraph`), hay ADEMÁS un bug de STALENESS
    // aparte, más allá del crash: lo que quedaría cacheado en
    // `code_file_facts` (clavado por archivo, reusado entre corridas)
    // cargaría datos de hipótesis DEPENDIENTES DEL GRAFO de ESTA corrida —
    // servidos otra vez para el mismo archivo aunque el grafo se haya
    // movido. Stringificar ACÁ, en el momento en que `analyzeFile` recién
    // terminó y nadie más tuvo la oportunidad de mutar nada, evita los dos
    // problemas a la vez — no sólo el crash.
    const fresh: { path: string; contentHash: string; language: string; lines: number; schemaVersion: number; json: string }[] = [];
    const touched: string[] = [];
    // DEFECTO A1 (code-analyzer.ts) — el conjunto de rutas cuyo contenido NO
    // coincidía con `code_file_facts`: ni un hash se recalcula acá, se reusa
    // la distinción que `cache.get`/`cache.put` ya hacen abajo. Pasado por
    // REFERENCIA (el mismo `Set`) como `graphCache.changedPaths`: como
    // `analyzeRepo` sólo construye el grafo (dentro de `crossAnalyze`)
    // DESPUÉS de que su propio loop por archivo terminó de rellenar este
    // `Set` vía cada `cache.put`, para cuando se lee ya tiene TODAS las
    // rutas frescas de esta corrida — nunca un snapshot vacío tomado antes
    // de tiempo.
    const changedPaths = new Set<string>();
    let builtGraph: { readonly graph: CodeGraph; readonly cache: GraphBuildCache; readonly buildMs: number } | null =
      null;

    const raw = await analyzeRepo({
      dir: worktreePath,
      repoName,
      // P3 — mismo motivo que en `analyze`: la firma de
      // contenido que llave este resultado no incluye `limits`, así que
      // siempre se pide el ranking completo acá también.
      limits: UNLIMITED_STORAGE_LIMITS,
      incremental: {
        contentHashes: hashByPath,
        cache: {
          get: (filePath, hash) => {
            const row = cachedRows.get(filePath);
            if (!row || row.contentHash !== hash) return undefined;
            try {
              const fact = JSON.parse(row.factsJson) as FileFacts;
              touched.push(filePath);
              return fact;
            } catch {
              return undefined; // corrupt/unreadable row: treated as a miss, never a failure.
            }
          },
          put: (fact) => {
            // N13 — `safeStringify` acá también: aunque estringificar EN
            // ESTE momento (antes de `crossAnalyze`) ya evita el ciclo
            // conocido, no hay garantía de que sea el ÚNICO — la red de
            // seguridad es gratis y ya existe.
            fresh.push({
              path: fact.path,
              contentHash: fact.contentHash,
              language: fact.language,
              lines: fact.lines,
              schemaVersion: fact.schemaVersion,
              json: safeStringify(fact, `${repoKey}:${fact.path}`),
            });
            changedPaths.add(fact.path);
          },
        },
      },
      // DEFECTO A1 — `crossAnalyze` ahora construye el `CodeGraph` él mismo
      // (necesita repo.graph real para dependency-cycle/orphan-file/
      // unused-symbol); esto le pasa el `GraphBuildCache` de la corrida
      // ANTERIOR de este `repoKey` para que sea incremental, no frío.
      graphCache: { previous: this.graphBuildCache.get(repoKey) ?? null, changedPaths },
      // Mismo patrón que `onFacts`: recibe el grafo recién construido para
      // persistirlo/adjuntarlo abajo SIN reconstruirlo — ver
      // `attachAndPersistGraph`.
      onGraph: (result) => {
        builtGraph = result;
      },
      // N13 — ver el docstring de `AnalyzeOptions.intraGraphCache` y el de
      // `this.intraGraphCache` (arriba): backing en RAM por `repoKey`, UNA
      // generación viva a la vez, clavado por `(path, contentHash)` DENTRO
      // de esa generación (la huella del grafo ya distingue la generación,
      // así que no hace falta repetirla en cada clave).
      intraGraphCache: {
        get: (filePath, contentHash, graphFingerprint) => {
          const bucket = this.intraGraphCache.get(repoKey);
          if (!bucket || bucket.fingerprint !== graphFingerprint) return undefined;
          return bucket.entries.get(`${filePath} ${contentHash}`);
        },
        put: (filePath, contentHash, graphFingerprint, entry) => {
          let bucket = this.intraGraphCache.get(repoKey);
          if (!bucket || bucket.fingerprint !== graphFingerprint) {
            bucket = { fingerprint: graphFingerprint, entries: new Map() };
            this.intraGraphCache.set(repoKey, bucket);
          }
          bucket.entries.set(`${filePath} ${contentHash}`, entry);
        },
      },
    });

    // N13 — `fresh` ya viene en la forma exacta que pide `upsertFacts`, con
    // `json` calculado en `put` (arriba), ANTES de que `crossAnalyze` (recién
    // llamado por `analyzeRepo`, más arriba) tuviera oportunidad de mutar
    // ningún `Finding` compartido — ver el comentario grande de `fresh`.
    this.facts.upsertFacts(repoKey, fresh);
    this.facts.touch(repoKey, touched);

    return this.attachAndPersistGraph(raw, builtGraph, repoKey, contentSig.signature);
  }

  /**
   * DEFECTO A1 (ver el reporte final de esta tarea) — `crossAnalyze`
   * (`code-analyzer.ts`) ahora construye el `CodeGraph` DE VERDAD él mismo
   * (`AnalyzeOptions.graphCache`/`.onGraph`, mismo patrón que `.onFacts`),
   * porque los 3 detectores `needsGraph` (`dependency-cycle`, `orphan-file`,
   * `unused-symbol`) lo necesitan para dejar de correr como `sin-grafo`.
   * ANTES de esta tarea este método reconstruía el grafo DESPUÉS de que
   * `analyzeRepo`/`crossAnalyze` ya habían terminado — una segunda
   * construcción completa, y la que de verdad llegaba a los detectores
   * (`repo.graph`, adentro de `crossAnalyze`) siempre era `null`. Ahora hay
   * UNA sola construcción — adentro de `crossAnalyze` — y este método sólo
   * la CONSUME: persiste `built.cache` en `this.graphBuildCache` (P2, en
   * memoria, el `previous` de la PRÓXIMA corrida de este `repoKey`), escribe
   * el grafo completo en `code_graphs` (sqlite) por la firma de contenido de
   * TODO el árbol, y adjunta el resumen liviano a `CodeAnalysis.graph`.
   *
   * `built` es `null` cuando `crossAnalyze` no llamó a `onGraph` (su propio
   * try/catch atrapó un fallo de build) — ahí este método no tiene nada que
   * persistir/adjuntar, y DESCARTA el `graphBuildCache` en memoria de este
   * `repoKey`: mejor pagar una corrida fría la próxima vez (dentro de
   * `crossAnalyze`, troceada, nunca un bloqueo largo) que arriesgar construir
   * sobre un estado que puede no corresponder a lo que de verdad hay en
   * disco ahora — mismo criterio de "correctness siempre gana a reuse" que
   * ya regía acá antes de esta tarea.
   *
   * NO vuelve a chequear `code_graphs` (sqlite) por un blob YA persistido
   * para esta firma antes de escribir: esa relectura evitaba una SEGUNDA
   * construcción del grafo, pero esa segunda construcción ya no existe —
   * `crossAnalyze` construyó el grafo UNA vez, arriba, como efecto
   * secundario obligatorio de correr los 3 detectores `needsGraph` (antes de
   * esta tarea esos detectores ni corrían: por eso ese chequeo tenía sentido
   * como optimización pura). `this.graphs.put` es un upsert idempotente
   * (`code-graph-repository.ts`), así que escribir de nuevo el mismo grafo
   * para la misma firma es correcto, sólo redundante en el caso raro (no
   * medido) de dos worktrees del mismo commit en el mismo proceso.
   */
  private async attachAndPersistGraph(
    raw: CodeAnalysis,
    built: { readonly graph: CodeGraph; readonly cache: GraphBuildCache; readonly buildMs: number } | null,
    repoKey: string,
    wholeTreeSignature: string,
  ): Promise<CodeAnalysis> {
    if (!built) {
      this.graphBuildCache.delete(repoKey);
      return raw;
    }
    try {
      this.graphBuildCache.set(repoKey, built.cache);
      this.graphs.put(
        repoKey,
        wholeTreeSignature,
        // N13 — `safeStringify`, no `JSON.stringify` a secas: mismo guardián
        // que `analyze` (ver su comentario). `built.graph`
        // no debería cargar nodos de hallazgo (`onGraph` dispara ANTES de
        // que `attachFindingNodes` entre en juego), así que el riesgo acá es
        // menor — pero es gratis y este `catch` ya degrada con gracia, así
        // que no hay razón para dejar la duda abierta.
        safeStringify(built.graph, repoKey),
        built.graph.nodes.length,
        built.graph.edges.length,
      );
      return { ...raw, graph: summarizeGraph(built.graph, built.buildMs) };
    } catch (err) {
      // OLA BC — el prefijo `[code-inspector]` se deja LITERAL a propósito,
      // acá y en `safeStringify`: es la cadena que este proceso viene
      // emitiendo y por la que se busca en los logs. Esta ola es un refactor;
      // cambiar el texto de una salida observable no es "renombrar", es
      // cambiar comportamiento. Se renombra el día que alguien lo pida.
      console.error(`[code-inspector] no se pudo persistir el grafo de código para ${repoKey}:`, err);
      this.graphBuildCache.delete(repoKey);
      return raw;
    }
  }

  private maybeGc(): void {
    const now = Date.now();
    if (now - this.lastGcAt < GC_MIN_INTERVAL_MS) return;
    this.lastGcAt = now;
    try {
      this.facts.gc({ ttlMs: FACTS_TTL_MS, maxRows: FACTS_MAX_ROWS, now });
    } catch {
      /* best-effort: a GC failure must not take the panel down */
    }
    try {
      this.graphs.gc({ ttlMs: FACTS_TTL_MS, maxRows: GRAPH_MAX_ROWS, now });
    } catch {
      /* best-effort: a GC failure must not take the panel down */
    }
  }
}

/**
 * N13 — `JSON.stringify` que NUNCA tira por una referencia circular:
 * reemplaza cualquier objeto ya visitado en la MISMA cadena de ancestros por
 * un sentinel, en vez de dejar que `TypeError: Converting circular structure
 * to JSON` aborte toda la corrida.
 *
 * MEDIDO, no hipotético (informe de esta ola, N13): sobre guava real esto
 * dispara en DECENAS de archivos (`CharMatcher.java`, `TypeToken.java`,
 * `AbstractMapBasedMultimap.java`… no un caso aislado). LA RAÍZ, encontrada
 * leyendo `hypotheses/template-method.ts`: CUALQUIER hipótesis Template
 * Method construida sobre un ancla estructural (`large-class`/
 * `refused-bequest`/`inheritance-family`/`distributed-duplication`/
 * `parallel-hierarchies`) — incluso la exitosa por AST puro, dentro de
 * `analyzeFile`, SIN necesitar el grafo — se devuelve como `{ ...hyp,
 * refreshState: templateMethodProblem }` con `templateMethodProblem.finding
 * === problem` (`buildFromStructuralAnchor`/`resolveDeferredViaGraph`, las
 * dos): la hipótesis apunta al MISMO `Finding` del que cuelga, y ese
 * `Finding` es el mismo objeto que vive en `finding.hypotheses` — un
 * autorreferencia ORDINARIA, por diseño, del builder — `refreshState` es
 * justamente el payload opaco que `HypothesisBuilder.refresh` necesita
 * reencontrar más tarde (`hypotheses/types.ts#PatternHypothesis.refreshState`,
 * "nunca cruza a CodeFindingHypothesis"). Eso es exactamente correcto para
 * el `Finding` INTERNO (server-only, nunca serializado) que `crossAnalyze`
 * usa en memoria. El problema es un piso más abajo, en ESTE archivo
 * únicamente (hasta la Ola BC vivía en `code-inspector.ts`): `FileFacts` — el objeto que el caché F3 persiste POR ARCHIVO
 * en `code_file_facts` para reuso incremental — CARGA ese mismo `Finding`
 * (con su hipótesis autorreferenciada) dentro de `.findings`, y a
 * diferencia de `CodeAnalysis.findings` (que sí pasa por
 * `code-analyzer.ts#toPublicHypothesis`, Ola 10, que excluye `refreshState`
 * en punta antes de llegar a la UI), `FileFacts` es dato INTERNO que nunca
 * pasa por esa sanitización — no tendría por qué, es un caché de servidor,
 * no una respuesta HTTP. Serializarlo con `JSON.stringify` a secas revienta.
 * Ver `analyzeIncremental`/`fresh` para dónde se corta el problema de raíz
 * (capturar el `json` ANTES de que nada más mute el `Finding` compartido) —
 * ESTA función es la red de seguridad que queda puesta igual, gratis, por si
 * algún caller futuro le pasa al motor algo con la misma forma.
 *
 * SIN este guardián el síntoma es silencioso y grave, no sólo "una corrida
 * falla": la caché persistente NUNCA llega a poblarse para ese repo — cada
 * poll del panel en vivo recalcula todo desde cero, para siempre, y nada en
 * la respuesta HTTP distingue eso de "repo lento". `console.error` sólo
 * cuando de verdad se activa (nunca en el camino feliz) para que quede
 * visible y buscable, no silenciado dos veces.
 */
function safeStringify(value: unknown, repoKeyForLog: string): string {
  const ancestors: unknown[] = [];
  let circularHits = 0;
  const json = JSON.stringify(value, function (_key, val: unknown) {
    if (typeof val !== "object" || val === null) return val;
    // `this` es el objeto CONTENEDOR que `JSON.stringify` está serializando
    // ahora mismo — al entrar a un hijo se apila, y hay que desapilar todo lo
    // que ya no es ancestro del valor actual antes de decidir. Sin este pop,
    // dos hermanos no circulares comparten un ancestro fantasma y todo par
    // "vi este objeto antes en OTRA rama" se reporta como ciclo por error.
    while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) ancestors.pop();
    if (ancestors.includes(val)) {
      circularHits++;
      return "[dato omitido: referencia circular]";
    }
    ancestors.push(val);
    return val;
  });
  if (circularHits > 0) {
    console.error(
      `[code-inspector] ${repoKeyForLog}: ${circularHits} referencia(s) circular(es) neutralizada(s) al serializar — ver el docstring de safeStringify (N13).`,
    );
  }
  return json;
}

/** Attaches the stable id (`code-finding-ids.ts`) every finding needs for F2 discards. */
function withStableIds(analysis: CodeAnalysis): CodeAnalysis {
  return {
    ...analysis,
    findings: analysis.findings.map((f) => withFindingId(f)),
  };
}

function withFindingId(f: CodeFinding): CodeFinding {
  return f.id ? f : { ...f, id: stableFindingId(f) };
}

/**
 * F3 — reduces a full `CodeGraph` (nodes + `contains`/`references` edges,
 * potentially tens of thousands of each on a real repo) to the lightweight
 * shape `CodeAnalysis.graph` actually carries. `buildMs` is passed in rather
 * than measured here so a cache-hit reuse (see `attachAndPersistGraph`) can
 * report `0` honestly instead of a fabricated fresh-build time.
 */
function summarizeGraph(graph: CodeGraph, buildMs: number): CodeGraphSummary {
  let folders = 0;
  let files = 0;
  let symbols = 0;
  for (const n of graph.nodes) {
    if (n.kind === "folder") folders++;
    else if (n.kind === "file") files++;
    else symbols++;
  }
  let containsEdges = 0;
  let referencesEdges = 0;
  for (const e of graph.edges) {
    if (e.kind === "contains") containsEdges++;
    else if (e.kind === "references") referencesEdges++;
  }
  return {
    nodes: graph.nodes.length,
    folders,
    files,
    symbols,
    edges: graph.edges.length,
    containsEdges,
    referencesEdges,
    resolution: {
      candidates: graph.resolution.candidates,
      resolved: graph.resolution.resolved,
      droppedAmbiguous: graph.resolution.droppedAmbiguous,
      unresolved: graph.resolution.unresolved,
      // CONTRATO-F9.md §4.5 — "Sólo el resumen, nunca el grafo". `resolve.ts`
      // ahora los puebla siempre (nunca `undefined`); el `?? 0`/`?? []`
      // defiende igual contra un `CodeGraph` cacheado de antes de esta ola
      // (`code_graphs` persiste sólo `contains`/`references` por archivo —
      // ver el docstring de `attachFindingNodes` — así que una corrida vieja
      // reconstruida en memoria puede llegar sin estos campos).
      ambiguousEdges: graph.resolution.ambiguousEdges ?? 0,
      ambiguousOverflow: graph.resolution.ambiguousOverflow ?? 0,
      unresolvedTopFiles: (graph.resolution.unresolvedByFile ?? []).slice(0, 20),
    },
    buildMs: Number(buildMs.toFixed(1)),
  };
}
