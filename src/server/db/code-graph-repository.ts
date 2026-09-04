/**
 * Persistent code-graph cache — F3 (this task: "persistir el grafo y
 * cablearlo al análisis").
 *
 * Same content-addressed pattern as `code-facts-repository.ts`'s whole-repo
 * snapshot row: one row per (repo, whole-tree content signature), so a
 * restart — or a brand-new worktree checked out from the same commit for a
 * new task — serves the same graph straight from disk instead of paying
 * `graph/build.ts`'s `buildGraph` again (measured in seconds on a large repo
 * like guava; see this task's final report).
 *
 * Kept in its OWN table rather than folded into `code_file_facts`'s snapshot
 * row for two concrete reasons:
 *   - Scale: a real repo's serialized graph (nodes + `contains`/`references`
 *     edges) is a much bigger blob than the findings/opportunities
 *     `code_file_facts` stores per repo — tens of thousands of edges, not a
 *     capped, ranked findings list.
 *   - Shape: a graph is ONE whole-repo unit, never a per-file row — it does
 *     not need `code_file_facts`'s per-file LRU semantics at all, only a
 *     single "one row per (repo, signature)" upsert/read/touch.
 *
 * GC is the same shape as `CodeFactsRepository.gc`: TTL + stale-analyzer-
 * version reclaim, then a hard row cap enforced by true LRU.
 */
// OLA BC, FRENTE BC1 — `EngineDb`, no `DB` de `./index.js`. Los dos son
// exactamente `Database.Database` de better-sqlite3 (`db/index.ts` lo declara
// así: `export type DB = Database.Database`), pero `./index.js` importa
// `../config.js` — la ruta del `.db` del tablero, su puerto, su directorio de
// worktrees. Este repositorio es ALMACENAMIENTO DEL MOTOR: recibe la conexión,
// nunca la busca, y ya no queda una flecha desde el motor hacia la
// configuración del tablero ni siquiera en los tipos. Ver
// `services/engine/db.ts`.
import type { EngineDb } from "../services/engine/db.js";

export interface CodeGraphGcOptions {
  /** Rows unused for longer than this are reclaimed. */
  ttlMs: number;
  /** Hard cap on total rows; past it, oldest-`last_used_at`-first (true LRU) goes. */
  maxRows: number;
  now?: number;
}

export interface CodeGraphGcResult {
  deletedStaleVersion: number;
  deletedExpired: number;
  deletedOverCap: number;
}

interface CodeGraphRowDb {
  graph_json: string;
}

/**
 * P1 — COSTO#4: hasta esta tarea, "¿seguimos dentro de presupuesto?" para el
 * blob `graph_json` era incontestable porque el presupuesto no existía en
 * código, sólo en cabeza de quien mirara `du` a mano. PREEXISTENTE, no una
 * regresión de esta ola: el blob nunca tuvo techo automatizado antes de
 * ahora; esto es la primera vez que la pregunta tiene una respuesta
 * programática, no la constatación de que algo se rompió.
 *
 * Techo con 50% de margen declarado sobre el PEOR CASO REAL medido en el
 * corpus (línea base P1, 2026-07-30 — `scripts/dump-graph-census.mts` da los
 * conteos; los bytes del blob se midieron aparte, corriendo el mismo
 * `analyzeRepo` + `onGraph` real y tomando `JSON.stringify(graph).length`):
 * guava (`corpus/guava`, SHA e87d019e47a29bf263a82fe81caede34e9728e15,
 * `tests/golden/manifest.json`) — el repo más grande y más denso del
 * corpus — dio 46496 nodos + 118718 aristas en 47 259 946 bytes: ~1016
 * B/nodo, ~398 B/arista. `corpus/cobra` (el más chico) dio ~653 B/nodo, ~219
 * B/arista — el mismo orden de magnitud, así que el techo de guava con
 * margen cubre razonablemente el resto del corpus, no sólo el punto medido.
 */
export const MAX_BYTES_PER_NODE = 1525;
export const MAX_BYTES_PER_EDGE = 600;

export interface GraphSizeBudgetReport {
  readonly bytes: number;
  readonly bytesPerNode: number;
  readonly bytesPerEdge: number;
  readonly withinBudget: boolean;
}

/**
 * Diagnóstico puro, no un gate de escritura: `put()` (abajo) sigue aceptando
 * cualquier blob tal cual — decidir qué hacer si el presupuesto se pasa
 * (¿rechazar? ¿alertar? ¿subir el techo con justificación?) es una decisión
 * de producto fuera del alcance de esta tarea. Lo que esta función cierra es
 * que "¿estamos dentro de presupuesto?" deja de ser una pregunta sin dueño
 * en código — cualquier caller (un test, un futuro chequeo de CI, un panel
 * de diagnóstico) puede hacerla contra un `graph_json` real.
 *
 * `bytes` se mide en UTF-8 (`Buffer.byteLength`, no `.length` de JS, que
 * cuenta unidades UTF-16) porque es lo que de verdad ocupa la columna
 * `graph_json` en sqlite. `bytesPerNode`/`bytesPerEdge` dividen el peso TOTAL
 * del blob por cada conteo por separado (no lo reparten entre ambos) — misma
 * convención con la que se midió la línea base de arriba: una cota simple,
 * pensada para detectar un blob que crece sin que su conteo de nodos/aristas
 * lo explique, no una atribución exacta de qué byte pertenece a qué mitad
 * del grafo.
 */
export function graphSizeBudget(graphJson: string, nodeCount: number, edgeCount: number): GraphSizeBudgetReport {
  const bytes = Buffer.byteLength(graphJson, "utf8");
  const bytesPerNode = nodeCount > 0 ? bytes / nodeCount : 0;
  const bytesPerEdge = edgeCount > 0 ? bytes / edgeCount : 0;
  return {
    bytes,
    bytesPerNode,
    bytesPerEdge,
    withinBudget: bytesPerNode <= MAX_BYTES_PER_NODE && bytesPerEdge <= MAX_BYTES_PER_EDGE,
  };
}

export class CodeGraphRepository {
  constructor(
    private readonly db: EngineDb,
    private readonly analyzerVersion: string,
  ) {}

  /**
   * The graph's raw JSON for this exact whole-tree signature, or `null` on a
   * miss. Travels raw (not `JSON.parse`d here) — this module has no
   * dependency on `graph/types.ts`'s `CodeGraph`, the caller does the typed
   * parse, same convention as `CodeFactsRepository`'s `factsJson`. Does not
   * bump `last_used_at` — call {@link touch} for a hit you keep.
   */
  read(repoKey: string, wholeTreeSignature: string): string | null {
    const row = this.db
      .prepare(
        `SELECT graph_json FROM code_graphs
          WHERE repo_key = ? AND analyzer_version = ? AND content_hash = ?`,
      )
      .get(repoKey, this.analyzerVersion, wholeTreeSignature) as CodeGraphRowDb | undefined;
    return row ? row.graph_json : null;
  }

  /** Upserts the whole-repo graph row. `nodeCount`/`edgeCount` are informational (diagnostics), never re-derived from `graphJson` here. */
  put(repoKey: string, wholeTreeSignature: string, graphJson: string, nodeCount: number, edgeCount: number): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO code_graphs
           (repo_key, content_hash, analyzer_version, graph_json, node_count, edge_count, created_at, last_used_at)
         VALUES (?,?,?,?,?,?,?,?)
         ON CONFLICT (repo_key, content_hash, analyzer_version) DO UPDATE SET
           graph_json = excluded.graph_json,
           node_count = excluded.node_count,
           edge_count = excluded.edge_count,
           last_used_at = excluded.last_used_at`,
      )
      .run(repoKey, wholeTreeSignature, this.analyzerVersion, graphJson, nodeCount, edgeCount, now, now);
  }

  /** Bumps `last_used_at` for a hit. A missing row is a silent no-op — nothing to touch. */
  touch(repoKey: string, wholeTreeSignature: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE code_graphs SET last_used_at = ?
          WHERE repo_key = ? AND analyzer_version = ? AND content_hash = ?`,
      )
      .run(now, repoKey, this.analyzerVersion, wholeTreeSignature);
  }

  /** Total rows currently held (every repo, every version) — for tests/diagnostics. */
  countAll(): number {
    return (this.db.prepare(`SELECT COUNT(*) AS n FROM code_graphs`).get() as { n: number }).n;
  }

  /**
   * TTL + stale-version reclaim, then a hard cap enforced by true LRU
   * (oldest `last_used_at`, not oldest insert) — same shape as
   * `CodeFactsRepository.gc`. Cheap to call opportunistically.
   */
  gc(opts: CodeGraphGcOptions): CodeGraphGcResult {
    const now = opts.now ?? Date.now();
    const cutoff = new Date(now - opts.ttlMs).toISOString();

    const deletedStaleVersion = this.db
      .prepare(`DELETE FROM code_graphs WHERE analyzer_version != ?`)
      .run(this.analyzerVersion).changes as number;

    const deletedExpired = this.db
      .prepare(`DELETE FROM code_graphs WHERE last_used_at < ?`)
      .run(cutoff).changes as number;

    const total = (this.db.prepare(`SELECT COUNT(*) AS n FROM code_graphs`).get() as { n: number }).n;
    let deletedOverCap = 0;
    if (total > opts.maxRows) {
      const excess = total - opts.maxRows;
      deletedOverCap = this.db
        .prepare(
          `DELETE FROM code_graphs WHERE rowid IN (
             SELECT rowid FROM code_graphs ORDER BY last_used_at ASC LIMIT ?
           )`,
        )
        .run(excess).changes as number;
    }

    return { deletedStaleVersion, deletedExpired, deletedOverCap };
  }
}
