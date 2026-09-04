/**
 * Persistent per-file facts cache — F2 (PLAN.md §F2, "Persistencia de hechos
 * y de descartes").
 *
 * Replaces the RAM-only `Map` that `code-inspector.ts` used to keep
 * (`code-inspector.ts:52` before this file existed): that cache lived only
 * for the life of the node process, so a systemd restart — or simply a
 * BRAND-NEW worktree checked out from the same commit for a new task —
 * started from zero every time, because its key was a per-process `Map` and
 * its signature was mtime-based (fresh mtimes on every fresh checkout, even
 * for byte-identical files). This cache is keyed by CONTENT instead: a repo
 * identity (`repoKey`, stable across worktrees of the same `project_repos`
 * row — never a worktree path) crossed with the sha of a file's bytes and
 * the analyzer version, in sqlite. A restart serves the same rows straight
 * from disk; a new worktree of the same repo hits on every file it did not
 * touch, because content — not mtime, not path — is the key.
 *
 * Two shapes of row share the table:
 *   - Per-file rows (`filePath` = a real repo-relative path): this file's
 *     contribution — the findings/opportunities whose locations/places
 *     touch it (same "one file, one entry, no matter how many locations"
 *     convention `census.ts` already uses for its own counts), its language
 *     and line count. Real, addressable by content hash, ready for the day
 *     the per-file walk (`code-analyzer.ts`, out of scope here — see the
 *     final report) grows a partial-repo entry point.
 *   - ONE sentinel row per repo (`filePath` = `""`, `contentHash` = the
 *     whole-tree {@link ContentSignature.signature}): the full serialized
 *     `CodeAnalysis` from the run that produced it. This is what actually
 *     buys the measured target today — `code-inspector.ts` skips calling
 *     `analyzeRepo` ENTIRELY when the current whole-tree signature matches
 *     this row, because there is no way to positively confirm "no file
 *     that `analyzeRepo` cares about changed" without either re-deriving
 *     its private file-selection rules (a second, divergent copy of a list
 *     that already lives in `code-analyzer.ts` — the duplication this
 *     project's own lint elsewhere exists to catch) or touching that file
 *     (explicitly out of bounds for this task). "Nothing AT ALL changed
 *     anywhere in the tree" is a safe, honest, easily-verified superset of
 *     "nothing `analyzeRepo` cares about changed", so that is the guarantee
 *     this actually gives.
 *
 * The precedent this follows is `schema-inspector.ts`'s `baseCache` — a Map
 * keyed by commit sha, checked out into a throwaway `git worktree add
 * --detach` on a miss. Same idea, one level more durable (sqlite instead of
 * RAM) and one level finer (per file, not just per whole repo).
 */
import { gzipSync, gunzipSync } from "node:zlib";
// OLA BC, FRENTE BC1 — `EngineDb`, no `DB` de `./index.js`. Los dos son
// exactamente `Database.Database` de better-sqlite3 (`db/index.ts` lo declara
// así: `export type DB = Database.Database`), pero `./index.js` importa
// `../config.js` — la ruta del `.db` del tablero, su puerto, su directorio de
// worktrees. Este repositorio es ALMACENAMIENTO DEL MOTOR: recibe la conexión,
// nunca la busca, y ya no queda una flecha desde el motor hacia la
// configuración del tablero ni siquiera en los tipos. Ver
// `services/engine/db.ts`.
import type { EngineDb } from "../services/engine/db.js";

/** A file's cached contribution, or the whole-repo snapshot when `filePath === ""`. */
export interface CodeFileFactRow {
  filePath: string;
  contentHash: string;
  language: string | null;
  lines: number;
  /** Per-file row: `CodeFinding[]` touching this file. Snapshot row: the whole `CodeAnalysis`. */
  findingsJson: string;
  /** Per-file row: `CodePatternOpportunity[]` touching this file. Snapshot row: unused, `""`. */
  opportunitiesJson: string;
}

interface FactRowDb {
  file_path: string;
  content_hash: string;
  language: string | null;
  lines: number;
  findings_json: string;
  opportunities_json: string;
}

/** The sentinel path for the whole-repo snapshot row — never a real repo-relative path. */
const REPO_SNAPSHOT_PATH = "";

/** Bind-param chunk size for `file_path IN (...)` reads — see {@link readMany}. */
const READ_CHUNK_SIZE = 500;

/**
 * F3: a raw per-file `FileFacts` row — functions/clones/behavioral/
 * opportunities from JUST that file, BEFORE any cross-file join. A
 * DIFFERENT thing from {@link CodeFileFactRow}, whose `findingsJson`/
 * `opportunitiesJson` hold the already cross-file-pruned `CodeFinding[]`/
 * `CodePatternOpportunity[]` touching a file — real, but (per this file's
 * header) never read back by production. This IS read back: it is what
 * lets `code-inspector.ts` skip `analyzeFile` for an unchanged file.
 *
 * `factsJson` travels raw (not `JSON.parse`d here), same reason `readMany`
 * hands back raw `findingsJson`: this module has no dependency on the
 * services layer's `FileFacts` type, the caller does the typed parse.
 */
export interface FileFactsRow {
  filePath: string;
  contentHash: string;
  factsJson: string;
}

interface FileFactsRowDb {
  file_path: string;
  content_hash: string;
  /** Gzip level {@link FACTS_GZIP_LEVEL} of the UTF-8 `FileFacts` JSON — the form every write since P3 uses. `null` on a row that has never been rewritten since. */
  facts_blob: Buffer | null;
  /** Legacy uncompressed form. Populated on rows written before P3 that no upsert has touched since; `null` on every row written by the current code. */
  facts_json: string | null;
}

/**
 * P3 (see this file's header + PLAN.md): `facts_json` started as one raw
 * `FileFacts` JSON string per file, budgeted at ~2.6 KB/row. F3 then added
 * `symbols`/`references` (the code graph's raw material) to `FileFacts`,
 * uncompressed — measured on a real guava analysis at ~63 KB/row, ~24x the
 * original budget; at the (unchanged) `FACTS_MAX_ROWS` cap that is on the
 * order of 12 GB before the old row-count-only GC ever evicted anything.
 * Gzip level 1 (fast, not tightest) on that same corpus measured a ~10x
 * ratio — ~63 KB/row down to ~6.3 KB/row — for ~0.23 ms/row to compress and
 * ~0.11 ms/row to decompress (see the report for the exact run). Level 1 is
 * deliberate: bytes on disk, not CPU in the hot path, is the objective.
 */
const FACTS_GZIP_LEVEL = 1;

/**
 * Default disk budget for the `facts_blob`/`facts_json` payload across all of
 * `code_file_facts`, applied by {@link CodeFactsRepository.gc} when the caller
 * omits `maxBytes` (today's only caller, `code-inspector.ts`, does). 500 MB
 * matches the budget this phase's contract specified for this table.
 *
 * At the ~6.3 KB/row measured post-compression on guava, 500 MB holds
 * ~79,000 rows — well under the existing `FACTS_MAX_ROWS` (200,000) cap, so
 * in practice whichever of the two limits a real workload hits first is the
 * one that fires (`gc()` enforces both). The margin is deliberate: a
 * parallel fix to `graph/symbols.ts`/`references.ts` (ghost declarations from
 * leaked function-local names) is expected to SHRINK the real per-row size
 * further, and this number was not re-measured after that fix lands — see
 * the report for that caveat.
 */
export const FACTS_MAX_BYTES = 500 * 1024 * 1024;

/** What {@link CodeFactsRepository.upsertFacts} needs from a `FileFacts` — kept structural, not a `FileFacts` import (see {@link FileFactsRow}'s docstring). */
export interface UpsertFactsInput {
  path: string;
  contentHash: string;
  language: string;
  lines: number;
  schemaVersion: number;
  /** `JSON.stringify(fileFacts)` — this module never parses it, only stores/returns it. */
  json: string;
}

export interface FactsGcOptions {
  /** Rows unused for longer than this are reclaimed. */
  ttlMs: number;
  /** Hard cap on total rows; past it, oldest-`lastUsedAt`-first (true LRU, not insertion order) goes. */
  maxRows: number;
  /**
   * P3: hard cap, in bytes, on the `facts_blob`/`facts_json` payload summed
   * across every row; past it, oldest-`lastUsedAt`-first goes — same LRU
   * order as `maxRows`, applied independently (whichever cap the current
   * state violates gets enforced; a single `gc()` call can evict for both).
   * Defaults to {@link FACTS_MAX_BYTES} when omitted.
   */
  maxBytes?: number;
  now?: number;
}

export interface FactsGcResult {
  deletedStaleVersion: number;
  deletedExpired: number;
  deletedOverCap: number;
  /** P3: rows evicted because the summed `facts_blob`/`facts_json` payload exceeded the byte budget. */
  deletedOverBytes: number;
}

export class CodeFactsRepository {
  constructor(
    private readonly db: EngineDb,
    private readonly analyzerVersion: string,
  ) {}

  /**
   * Rows for a subset of paths, current `analyzerVersion` only. The caller
   * compares `contentHash` against each file's CURRENT hash to tell hit from
   * miss — a row present here is not by itself a hit, it is what was true
   * last time. Reading does not bump `lastUsedAt`; call {@link touch} for the
   * paths that actually turned out to be hits, so LRU reflects real reuse.
   */
  readMany(repoKey: string, filePaths: readonly string[]): Map<string, CodeFileFactRow> {
    const out = new Map<string, CodeFileFactRow>();
    for (let i = 0; i < filePaths.length; i += READ_CHUNK_SIZE) {
      const chunk = filePaths.slice(i, i + READ_CHUNK_SIZE);
      if (chunk.length === 0) continue;
      const placeholders = chunk.map(() => "?").join(",");
      const rows = this.db
        .prepare(
          `SELECT file_path, content_hash, language, lines, findings_json, opportunities_json
             FROM code_file_facts
            WHERE repo_key = ? AND analyzer_version = ? AND file_path IN (${placeholders})`,
        )
        .all(repoKey, this.analyzerVersion, ...chunk) as FactRowDb[];
      for (const r of rows) out.set(r.file_path, fromDb(r));
    }
    return out;
  }

  /**
   * The whole-repo snapshot row, or `null` if none is cached for this exact
   * content signature **under this exact `factsSchemaVersion`**.
   *
   * OLA BB, FRENTE BB1 — POR QUÉ LA VERSIÓN DE ESQUEMA ESTÁ EN LA CLAVE.
   * Esta fila no es un dato crudo: es el `CodeAnalysis` PÚBLICO ya
   * serializado, y `code-inspector.ts#analyzeWithPersistentCache` la devuelve
   * con un `JSON.parse` a secas, sin volver a pasar por `toPublicHypothesis`.
   * O sea: **todo lo que esta fila NO trae, el panel NO lo recibe** — no hay
   * ninguna etapa posterior que pueda completarlo.
   *
   * Hasta la Ola BB la clave era sólo `(repo_key, analyzer_version,
   * file_path='', content_hash)`, y `analyzer_version`
   * (`census.ts#ANALYZER_VERSION`) es un número que un humano sube SÓLO
   * cuando cambian las reglas de conteo del censo — no cuando cambia la FORMA
   * de la salida. El resultado, medido sobre `data/claude-kanban.db` al
   * cerrar la Ola BA: **262 filas de snapshot servidas a diario, ninguna con
   * el campo `layer`** que esa ola declaró obligatorio en `shared/types.ts`,
   * porque BA1 subió {@link FACTS_SCHEMA_VERSION} (9 → 10) y ese número
   * **sólo entraba en {@link readFacts}**, el caché POR ARCHIVO. Se invalidó
   * un caché y se siguió sirviendo el otro: con `layer` ausente, la UI de BA2
   * (que filtra por igualdad estricta) no dibujaba NI UNA recomendación.
   *
   * `FACTS_SCHEMA_VERSION` es exactamente el contador de "la forma de la
   * salida cacheada del analizador se movió, no sirvas una fila escrita con
   * la forma vieja" (ver su docstring en `code-analyzer.ts`). Ponerlo también
   * acá hace que **un solo bump invalide los DOS cachés**, que es la única
   * forma de que esto no se repita: no queda un segundo número que alguien
   * tenga que acordarse de subir aparte. Una fila escrita antes de este
   * cambio no lleva `facts_schema_version` (la columna queda `NULL`:
   * {@link upsertOne} nunca la escribió), así que lee como MISS — nunca como
   * un parse a medias. Mismo contrato que {@link readFacts}: un mismatch de
   * esquema es un miss, no hay migrador.
   */
  readRepoSnapshot(repoKey: string, wholeTreeSignature: string, factsSchemaVersion: number): CodeFileFactRow | null {
    const row = this.db
      .prepare(
        `SELECT file_path, content_hash, language, lines, findings_json, opportunities_json
           FROM code_file_facts
          WHERE repo_key = ? AND analyzer_version = ? AND file_path = ? AND content_hash = ?
            AND facts_schema_version = ?`,
      )
      .get(repoKey, this.analyzerVersion, REPO_SNAPSHOT_PATH, wholeTreeSignature, factsSchemaVersion) as
      | FactRowDb
      | undefined;
    return row ? fromDb(row) : null;
  }

  /**
   * F3: raw `FileFacts` blobs for a subset of paths, current `analyzerVersion`
   * AND `factsSchemaVersion` only — a row written under an older `FileFacts`
   * shape reads as a miss here, never a half-migrated parse (CONTRATO-F3
   * §1.5: schema mismatch is always a miss, there is no migrator). Same
   * "hand back what's there, caller decides hit/miss by comparing
   * `contentHash`" contract as {@link readMany}; doesn't bump `lastUsedAt` —
   * call {@link touch} for the paths that turned out to be hits.
   */
  readFacts(repoKey: string, filePaths: readonly string[], factsSchemaVersion: number): Map<string, FileFactsRow> {
    const out = new Map<string, FileFactsRow>();
    for (let i = 0; i < filePaths.length; i += READ_CHUNK_SIZE) {
      const chunk = filePaths.slice(i, i + READ_CHUNK_SIZE);
      if (chunk.length === 0) continue;
      const placeholders = chunk.map(() => "?").join(",");
      const rows = this.db
        .prepare(
          `SELECT file_path, content_hash, facts_blob, facts_json
             FROM code_file_facts
            WHERE repo_key = ? AND analyzer_version = ? AND facts_schema_version = ?
              AND (facts_blob IS NOT NULL OR facts_json IS NOT NULL) AND file_path IN (${placeholders})`,
        )
        .all(repoKey, this.analyzerVersion, factsSchemaVersion, ...chunk) as FileFactsRowDb[];
      for (const r of rows) {
        const factsJson = decodeFactsPayload(r);
        if (factsJson === null) continue; // corrupt/unreadable blob: a miss, never a crash.
        out.set(r.file_path, { filePath: r.file_path, contentHash: r.content_hash, factsJson });
      }
    }
    return out;
  }

  /**
   * F3: upserts raw `FileFacts` blobs. Same row/PK as {@link upsertMany} —
   * `(repo_key, file_path, content_hash, analyzer_version)` — so a file
   * already cached via the legacy per-file path (or reverted to a hash seen
   * before) lands on the SAME row instead of a duplicate; `findings_json`/
   * `opportunities_json` are written as `"[]"` on a fresh row (this path
   * never populates them — nothing reads them, see this file's header) and
   * left untouched by the `ON CONFLICT` when a legacy row already had real
   * content there.
   *
   * P3: `f.json` is gzipped (level {@link FACTS_GZIP_LEVEL}) into
   * `facts_blob` — this module's storage detail, invisible to the caller,
   * which still hands over/reads back a plain string (`UpsertFactsInput.json`,
   * `FileFactsRow.factsJson`). Every write — fresh row or an update to a row
   * a pre-P3 process left in the old uncompressed `facts_json` shape — lands
   * in the new form; `facts_json` is explicitly cleared on `ON CONFLICT` so a
   * row touched again after P3 does not keep paying for both copies.
   */
  upsertFacts(repoKey: string, facts: readonly UpsertFactsInput[]): void {
    if (facts.length === 0) return;
    const now = new Date().toISOString();
    const stmt = this.db.prepare(
      `INSERT INTO code_file_facts
         (repo_key, file_path, content_hash, analyzer_version, language, lines,
          findings_json, opportunities_json, facts_blob, facts_schema_version, created_at, last_used_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT (repo_key, file_path, content_hash, analyzer_version) DO UPDATE SET
         language = excluded.language,
         lines = excluded.lines,
         facts_blob = excluded.facts_blob,
         facts_json = NULL,
         facts_schema_version = excluded.facts_schema_version,
         last_used_at = excluded.last_used_at`,
    );
    const tx = this.db.transaction((items: readonly UpsertFactsInput[]) => {
      for (const f of items) {
        const blob = gzipSync(Buffer.from(f.json, "utf8"), { level: FACTS_GZIP_LEVEL });
        stmt.run(repoKey, f.path, f.contentHash, this.analyzerVersion, f.language, f.lines, "[]", "[]", blob, f.schemaVersion, now, now);
      }
    });
    tx(facts);
  }

  /** Bumps `lastUsedAt` for hits — cheap `readMany`/`readRepoSnapshot` callers should call this on what they kept. */
  touch(repoKey: string, filePaths: readonly string[]): void {
    if (filePaths.length === 0) return;
    const now = new Date().toISOString();
    const stmt = this.db.prepare(
      `UPDATE code_file_facts SET last_used_at = ?
        WHERE repo_key = ? AND analyzer_version = ? AND file_path = ?`,
    );
    const tx = this.db.transaction((paths: readonly string[]) => {
      for (const p of paths) stmt.run(now, repoKey, this.analyzerVersion, p);
    });
    tx(filePaths);
  }

  /** Upserts per-file rows. `content_hash` is part of the PK, so a reverted file lands on its own row again. */
  upsertMany(repoKey: string, rows: readonly CodeFileFactRow[]): void {
    if (rows.length === 0) return;
    const tx = this.db.transaction((items: readonly CodeFileFactRow[]) => {
      for (const r of items) this.upsertOne(repoKey, r);
    });
    tx(rows);
  }

  /**
   * Upserts the whole-repo snapshot row (see the file-level docstring for
   * what it holds), estampando el `factsSchemaVersion` con el que se produjo.
   *
   * OLA BB: no puede pasar por {@link upsertOne} porque ése es el camino de
   * las filas POR ARCHIVO, y ahí `facts_schema_version` NO se toca a
   * propósito — la fila por archivo lleva su `facts_blob` escrito por
   * {@link upsertFacts} bajo SU propia versión, y pisarla desde el camino
   * legacy de `findings_json` marcaría un blob viejo como si fuera nuevo. El
   * snapshot (`file_path = ''`) nunca tiene `facts_blob`, así que acá la
   * columna es libre y es justo lo que la clave de {@link readRepoSnapshot}
   * necesita. Se escribe con `INSERT … ON CONFLICT` sobre la MISMA PK de
   * siempre, así que una fila pre-BB (misma firma, `facts_schema_version`
   * `NULL`) se PISA en su lugar en cuanto el repo se re-analiza: el arreglo
   * no deja filas huérfanas duplicadas.
   */
  putRepoSnapshot(
    repoKey: string,
    wholeTreeSignature: string,
    analysisJson: string,
    factsSchemaVersion: number,
  ): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO code_file_facts
           (repo_key, file_path, content_hash, analyzer_version, language, lines,
            findings_json, opportunities_json, facts_schema_version, created_at, last_used_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT (repo_key, file_path, content_hash, analyzer_version) DO UPDATE SET
           language = excluded.language,
           lines = excluded.lines,
           findings_json = excluded.findings_json,
           opportunities_json = excluded.opportunities_json,
           facts_schema_version = excluded.facts_schema_version,
           last_used_at = excluded.last_used_at`,
      )
      .run(
        repoKey,
        REPO_SNAPSHOT_PATH,
        wholeTreeSignature,
        this.analyzerVersion,
        null,
        0,
        analysisJson,
        "",
        factsSchemaVersion,
        now,
        now,
      );
  }

  private upsertOne(repoKey: string, r: CodeFileFactRow): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO code_file_facts
           (repo_key, file_path, content_hash, analyzer_version, language, lines,
            findings_json, opportunities_json, created_at, last_used_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT (repo_key, file_path, content_hash, analyzer_version) DO UPDATE SET
           language = excluded.language,
           lines = excluded.lines,
           findings_json = excluded.findings_json,
           opportunities_json = excluded.opportunities_json,
           last_used_at = excluded.last_used_at`,
      )
      .run(
        repoKey,
        r.filePath,
        r.contentHash,
        this.analyzerVersion,
        r.language,
        r.lines,
        r.findingsJson,
        r.opportunitiesJson,
        now,
        now,
      );
  }

  /** Total rows currently held (every repo, every version) — for tests/diagnostics. */
  countAll(): number {
    return (this.db.prepare(`SELECT COUNT(*) AS n FROM code_file_facts`).get() as { n: number }).n;
  }

  /**
   * TTL + stale-version reclaim, then a hard cap enforced by true LRU
   * (oldest `last_used_at`, not oldest insert), then (P3) a byte-budget cap
   * over the `facts_blob`/`facts_json` payload, same LRU order. Both caps
   * are enforced independently in the same sweep — whichever the current
   * state violates gets trimmed; a workload that never grows a fat
   * `facts_blob` will only ever hit `maxRows`, one that does hits `maxBytes`
   * first. Cheap to call opportunistically — `code-inspector.ts` runs it on
   * a fraction of requests, not every one.
   */
  gc(opts: FactsGcOptions): FactsGcResult {
    const now = opts.now ?? Date.now();
    const cutoff = new Date(now - opts.ttlMs).toISOString();
    const maxBytes = opts.maxBytes ?? FACTS_MAX_BYTES;

    const deletedStaleVersion = this.db
      .prepare(`DELETE FROM code_file_facts WHERE analyzer_version != ?`)
      .run(this.analyzerVersion).changes as number;

    const deletedExpired = this.db
      .prepare(`DELETE FROM code_file_facts WHERE last_used_at < ?`)
      .run(cutoff).changes as number;

    const total = (this.db.prepare(`SELECT COUNT(*) AS n FROM code_file_facts`).get() as { n: number }).n;
    let deletedOverCap = 0;
    if (total > opts.maxRows) {
      const excess = total - opts.maxRows;
      deletedOverCap = this.db
        .prepare(
          `DELETE FROM code_file_facts WHERE rowid IN (
             SELECT rowid FROM code_file_facts ORDER BY last_used_at ASC LIMIT ?
           )`,
        )
        .run(excess).changes as number;
    }

    // P3: byte-budget cap, computed ONLY over rows carrying a facts payload
    // (`facts_blob` post-compression, or a pre-P3 `facts_json` row not yet
    // rewritten) — the same column the 500 MB budget was measured against.
    // A row with no facts payload (a legacy per-file `findingsJson`/
    // `opportunitiesJson`-only row, or the whole-repo snapshot row) never
    // enters this accounting and is never evicted by it; it is still
    // covered by `maxRows`/TTL above. Ranked newest-`last_used_at`-first by
    // a running byte total, so the rows kept are exactly "as many of the
    // most-recently-used facts rows as fit in `maxBytes`".
    const deletedOverBytes = this.db
      .prepare(
        `WITH sized AS (
           SELECT rowid, last_used_at,
                  COALESCE(length(facts_blob), length(facts_json)) AS bytes
             FROM code_file_facts
            WHERE facts_blob IS NOT NULL OR facts_json IS NOT NULL
         ), running AS (
           SELECT rowid,
                  SUM(bytes) OVER (ORDER BY last_used_at DESC, rowid DESC
                                   ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cum_bytes
             FROM sized
         )
         DELETE FROM code_file_facts
          WHERE rowid IN (SELECT rowid FROM running WHERE cum_bytes > ?)`,
      )
      .run(maxBytes).changes as number;

    return { deletedStaleVersion, deletedExpired, deletedOverCap, deletedOverBytes };
  }
}

function fromDb(r: FactRowDb): CodeFileFactRow {
  return {
    filePath: r.file_path,
    contentHash: r.content_hash,
    language: r.language,
    lines: r.lines,
    findingsJson: r.findings_json,
    opportunitiesJson: r.opportunities_json,
  };
}

/**
 * P3: decodes a `code_file_facts` row's facts payload back to the plain JSON
 * string {@link FileFactsRow.factsJson} promises — transparently to every
 * caller of {@link CodeFactsRepository.readFacts}. Prefers `facts_blob`
 * (gzip level {@link FACTS_GZIP_LEVEL}, every write since P3); falls back to
 * the legacy uncompressed `facts_json` for a row a pre-P3 process wrote and
 * nothing has rewritten since. `null` on a blob that fails to gunzip — same
 * "corrupt/unreadable row is a miss, never a crash" contract `code-inspector.ts`
 * already applies to a bad `JSON.parse`.
 */
function decodeFactsPayload(r: FileFactsRowDb): string | null {
  if (r.facts_blob != null) {
    try {
      return gunzipSync(r.facts_blob).toString("utf8");
    } catch {
      return null;
    }
  }
  return r.facts_json;
}

export const CODE_FACTS_REPO_SNAPSHOT_PATH = REPO_SNAPSHOT_PATH;
