/**
 * Discards — F2 (PLAN.md §F2). "Descartar con motivo" needs to survive a
 * re-analysis (edit the file → same finding, same id → still discarded) and
 * to survive across every future task on the same repository, not just the
 * one it was clicked from — so it is keyed by (`repoKey`, `findingId`), NOT
 * by task, worktree, or line number. `findingId` is the stable id already
 * defined in `detect/ids.ts#findingId` (detector/kind + sorted anchors, no
 * line numbers): editing the file, or a metric moving from 48 to 51, does
 * not mint a new id, so a discard keeps matching the same real-world problem.
 *
 * Deliberately NOT scoped by `analyzer_version` on reads (unlike
 * `code-facts-repository.ts`, which must be — see its docstring): a discard
 * is the user's judgement about a problem with a stable identity, not
 * derived data a detector change can make stale. The version is still
 * stored, purely as an audit trail of which analyzer was running when the
 * call was made.
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

export interface CodeFindingDecision {
  findingId: string;
  reason: string;
  decidedAt: string;
}

interface DecisionRowDb {
  finding_id: string;
  reason: string;
  decided_at: string;
}

export class CodeDecisionsRepository {
  constructor(
    private readonly db: EngineDb,
    private readonly analyzerVersion: string,
  ) {}

  /** Discards (or re-discards with a new reason) one finding for a repo. */
  discard(repoKey: string, findingId: string, reason: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO code_finding_decisions (repo_key, finding_id, reason, analyzer_version, decided_at)
         VALUES (?,?,?,?,?)
         ON CONFLICT (repo_key, finding_id) DO UPDATE SET
           reason = excluded.reason,
           analyzer_version = excluded.analyzer_version,
           decided_at = excluded.decided_at`,
      )
      .run(repoKey, findingId, reason, this.analyzerVersion, now);
  }

  /** Undoes a discard. A no-op if it was not discarded. */
  restore(repoKey: string, findingId: string): void {
    this.db
      .prepare(`DELETE FROM code_finding_decisions WHERE repo_key = ? AND finding_id = ?`)
      .run(repoKey, findingId);
  }

  /** Every current discard for a repo, keyed by finding id — for `code-inspector.ts` to fold into a result. */
  listForRepo(repoKey: string): Map<string, CodeFindingDecision> {
    const rows = this.db
      .prepare(`SELECT finding_id, reason, decided_at FROM code_finding_decisions WHERE repo_key = ?`)
      .all(repoKey) as DecisionRowDb[];
    return new Map(
      rows.map((r) => [r.finding_id, { findingId: r.finding_id, reason: r.reason, decidedAt: r.decided_at }]),
    );
  }

  /** Whether one specific finding is currently discarded for a repo — used before accepting a restore/discard call. */
  get(repoKey: string, findingId: string): CodeFindingDecision | null {
    const row = this.db
      .prepare(
        `SELECT finding_id, reason, decided_at FROM code_finding_decisions
          WHERE repo_key = ? AND finding_id = ?`,
      )
      .get(repoKey, findingId) as DecisionRowDb | undefined;
    return row ? { findingId: row.finding_id, reason: row.reason, decidedAt: row.decided_at } : null;
  }
}
