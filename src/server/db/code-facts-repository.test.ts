/**
 * `CodeFactsRepository` unit tests — F2. Exercises real better-sqlite3
 * (in-memory): the content-hash keying (revert hits the old row again),
 * the whole-repo snapshot sentinel, `analyzer_version` isolation, and GC
 * (TTL + stale-version + LRU cap).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { initDb, type DB } from "./index.js";
import { CodeFactsRepository, FACTS_MAX_BYTES, type CodeFileFactRow, type UpsertFactsInput } from "./code-facts-repository.js";

const V1 = "1";
const V2 = "2";

function row(overrides: Partial<CodeFileFactRow> = {}): CodeFileFactRow {
  return {
    filePath: "src/a.ts",
    contentHash: "hash-a",
    language: "typescript",
    lines: 10,
    findingsJson: "[]",
    opportunitiesJson: "[]",
    ...overrides,
  };
}

describe("CodeFactsRepository", () => {
  let db: DB;

  beforeEach(() => {
    db = initDb(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("readMany misses on an empty table", () => {
    const facts = new CodeFactsRepository(db, V1);
    expect(facts.readMany("repo-1", ["src/a.ts"]).size).toBe(0);
  });

  it("round-trips a per-file row, and a hash mismatch reads as a miss for the caller to decide", () => {
    const facts = new CodeFactsRepository(db, V1);
    facts.upsertMany("repo-1", [row()]);

    const hit = facts.readMany("repo-1", ["src/a.ts"]).get("src/a.ts");
    expect(hit?.contentHash).toBe("hash-a");
    expect(hit?.language).toBe("typescript");

    // The repository itself does not compare hashes — it hands back what it
    // has and the caller (code-inspector.ts) decides hit/miss. A DIFFERENT
    // current hash for the path is simply a row the caller will treat as stale.
    expect(hit?.contentHash).not.toBe("some-other-hash");
  });

  it("content hash is part of the identity: a reverted file lands on its OWN row instead of overwriting", () => {
    const facts = new CodeFactsRepository(db, V1);
    facts.upsertMany("repo-1", [row({ contentHash: "hash-v1", findingsJson: "[1]" })]);
    facts.upsertMany("repo-1", [row({ contentHash: "hash-v2", findingsJson: "[2]" })]);
    // Revert to v1's content — v1's row is still there, untouched.
    facts.upsertMany("repo-1", [row({ contentHash: "hash-v1", findingsJson: "[1]" })]);

    expect(facts.countAll()).toBe(2);
  });

  it("upserting the SAME (repo, path, hash, version) again updates in place, not a new row", () => {
    const facts = new CodeFactsRepository(db, V1);
    facts.upsertMany("repo-1", [row({ findingsJson: "[]" })]);
    facts.upsertMany("repo-1", [row({ findingsJson: "[1,2,3]" })]);

    expect(facts.countAll()).toBe(1);
    expect(facts.readMany("repo-1", ["src/a.ts"]).get("src/a.ts")?.findingsJson).toBe("[1,2,3]");
  });

  it("readRepoSnapshot round-trips the whole-repo sentinel row by (repo, signature)", () => {
    const facts = new CodeFactsRepository(db, V1);
    facts.putRepoSnapshot("repo-1", "sig-abc", '{"findings":[]}', 10);

    expect(facts.readRepoSnapshot("repo-1", "sig-abc", 10)?.findingsJson).toBe('{"findings":[]}');
    expect(facts.readRepoSnapshot("repo-1", "sig-does-not-exist", 10)).toBeNull();
    expect(facts.readRepoSnapshot("repo-2", "sig-abc", 10)).toBeNull(); // different repo, no cross-talk
  });

  /**
   * OLA BB, FRENTE BB1 — la mitad de abajo del arreglo. La mitad que prueba
   * que el defecto REAL se cerró (por HTTP, sobre un repo git, dos corridas
   * contra la misma sqlite) vive en `api/code.test.ts`, describe "OLA BB".
   */
  it("un snapshot escrito bajo OTRA facts_schema_version nunca se sirve para la versión actual", () => {
    const facts = new CodeFactsRepository(db, V1);
    facts.putRepoSnapshot("repo-1", "sig-abc", '{"findings":["forma vieja"]}', 9);

    expect(facts.readRepoSnapshot("repo-1", "sig-abc", 10)).toBeNull();
    // Es un filtro de LECTURA, no un borrado: la fila sigue físicamente ahí…
    expect(facts.readRepoSnapshot("repo-1", "sig-abc", 9)?.findingsJson).toBe('{"findings":["forma vieja"]}');
    // …y re-analizar bajo la versión nueva la PISA en su lugar (misma PK), no
    // deja dos filas compitiendo por la misma firma de contenido.
    facts.putRepoSnapshot("repo-1", "sig-abc", '{"findings":["forma nueva"]}', 10);
    expect(facts.countAll()).toBe(1);
    expect(facts.readRepoSnapshot("repo-1", "sig-abc", 10)?.findingsJson).toBe('{"findings":["forma nueva"]}');
    expect(facts.readRepoSnapshot("repo-1", "sig-abc", 9)).toBeNull();
  });

  /**
   * La forma EXACTA de las 262 filas que había en `data/claude-kanban.db` al
   * cerrar la Ola BA: escritas por un `putRepoSnapshot` pre-BB, que no tocaba
   * `facts_schema_version` — la columna quedó `NULL`. Un `= ?` de SQL nunca
   * matchea `NULL`, así que leen como miss. Queda fijado por escrito para que
   * nadie lo "arregle" con un `COALESCE`.
   */
  it("una fila pre-BB (facts_schema_version NULL) lee como miss, no como acierto", () => {
    db.prepare(
      `INSERT INTO code_file_facts
         (repo_key, file_path, content_hash, analyzer_version, language, lines,
          findings_json, opportunities_json, created_at, last_used_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run("repo-1", "", "sig-abc", V1, null, 0, '{"findings":["sin capa"]}', "", "2026-01-01", "2026-01-01");

    const facts = new CodeFactsRepository(db, V1);
    expect(facts.readRepoSnapshot("repo-1", "sig-abc", 10)).toBeNull();
  });

  it("rows are isolated by repo_key", () => {
    const facts = new CodeFactsRepository(db, V1);
    facts.upsertMany("repo-1", [row()]);
    expect(facts.readMany("repo-2", ["src/a.ts"]).size).toBe(0);
  });

  it("a row written under a DIFFERENT analyzer_version never matches a read of the current one", () => {
    const factsV1 = new CodeFactsRepository(db, V1);
    factsV1.upsertMany("repo-1", [row()]);

    const factsV2 = new CodeFactsRepository(db, V2);
    expect(factsV2.readMany("repo-1", ["src/a.ts"]).size).toBe(0);
    // The row is still physically there — this is a READ filter, not a delete.
    expect(factsV1.countAll()).toBe(1);
  });

  it("gc reclaims rows from another analyzer_version", () => {
    const factsV1 = new CodeFactsRepository(db, V1);
    factsV1.upsertMany("repo-1", [row({ filePath: "src/old.ts" })]);

    const factsV2 = new CodeFactsRepository(db, V2);
    factsV2.upsertMany("repo-1", [row({ filePath: "src/new.ts" })]);
    expect(factsV2.countAll()).toBe(2);

    const result = factsV2.gc({ ttlMs: 999_999_999, maxRows: 1000 });
    expect(result.deletedStaleVersion).toBe(1);
    expect(factsV2.countAll()).toBe(1);
    expect(factsV2.readMany("repo-1", ["src/new.ts"]).size).toBe(1);
  });

  it("gc reclaims rows unused past the TTL", () => {
    const facts = new CodeFactsRepository(db, V1);
    facts.upsertMany("repo-1", [row()]);

    const farFuture = Date.now() + 100_000;
    const result = facts.gc({ ttlMs: 1, maxRows: 1000, now: farFuture });
    expect(result.deletedExpired).toBe(1);
    expect(facts.countAll()).toBe(0);
  });

  it("gc enforces the row cap by true LRU (oldest last_used_at first), not insertion order", async () => {
    // `last_used_at` has millisecond resolution — a real delay between writes
    // (rather than three same-tick inserts) is what makes "oldest" meaningful
    // to assert against, here and in production alike.
    const tick = () => new Promise((r) => setTimeout(r, 5));

    const facts = new CodeFactsRepository(db, V1);
    facts.upsertMany("repo-1", [row({ filePath: "src/a.ts", contentHash: "h-a" })]);
    await tick();
    facts.upsertMany("repo-1", [row({ filePath: "src/b.ts", contentHash: "h-b" })]);
    await tick();
    facts.upsertMany("repo-1", [row({ filePath: "src/c.ts", contentHash: "h-c" })]);
    await tick();

    // Touch "a" so it is the MOST recently used, even though it was inserted first.
    facts.touch("repo-1", ["src/a.ts"]);

    const result = facts.gc({ ttlMs: 999_999_999, maxRows: 2 });
    expect(result.deletedOverCap).toBe(1);
    expect(facts.countAll()).toBe(2);
    expect(facts.readMany("repo-1", ["src/a.ts"]).size).toBe(1); // survives: touched
    expect(facts.readMany("repo-1", ["src/b.ts"]).size).toBe(0); // evicted: oldest untouched
  });

  it("readMany chunks large path lists without erroring", () => {
    const facts = new CodeFactsRepository(db, V1);
    const many = Array.from({ length: 1200 }, (_, i) => row({ filePath: `src/f${i}.ts`, contentHash: `h${i}` }));
    facts.upsertMany("repo-1", many);

    const paths = many.map((r) => r.filePath);
    expect(facts.readMany("repo-1", paths).size).toBe(1200);
  });

  /** A repetitive, realistically-sized (~2 KB) `FileFacts` JSON string — real payloads compress well; a 20-byte toy string would not. */
  function factsInput(overrides: Partial<UpsertFactsInput> = {}): UpsertFactsInput {
    return {
      path: "src/a.ts",
      contentHash: "hash-a",
      language: "typescript",
      lines: 10,
      schemaVersion: 2,
      json: JSON.stringify({
        functions: Array.from({ length: 40 }, (_, i) => ({ name: `fn${i}`, kind: "function", startLine: i, endLine: i + 5 })),
      }),
      ...overrides,
    };
  }

  describe("P3: facts_blob compression (gzip level 1)", () => {
    it("round-trips a FileFacts blob transparently: upsertFacts writes compressed, readFacts hands back the same plain string", () => {
      const facts = new CodeFactsRepository(db, V1);
      const input = factsInput();
      facts.upsertFacts("repo-1", [input]);

      const hit = facts.readFacts("repo-1", ["src/a.ts"], 2).get("src/a.ts");
      expect(hit?.factsJson).toBe(input.json);
      expect(hit?.contentHash).toBe("hash-a");

      // The stored column is actually compressed, not a pass-through TEXT write.
      const raw = db
        .prepare(`SELECT facts_blob, facts_json FROM code_file_facts WHERE file_path = 'src/a.ts'`)
        .get() as { facts_blob: Buffer | null; facts_json: string | null };
      expect(raw.facts_blob).toBeInstanceOf(Buffer);
      expect(raw.facts_blob!.length).toBeLessThan(Buffer.byteLength(input.json, "utf8"));
      expect(raw.facts_json).toBeNull();
    });

    it("reads a legacy pre-P3 row (facts_json populated, no facts_blob) as a hit — backward compatibility", () => {
      const facts = new CodeFactsRepository(db, V1);
      const legacyJson = JSON.stringify({ legacy: true });
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO code_file_facts
           (repo_key, file_path, content_hash, analyzer_version, language, lines,
            findings_json, opportunities_json, facts_json, facts_schema_version, created_at, last_used_at)
         VALUES ('repo-1', 'src/legacy.ts', 'hash-legacy', ?, 'typescript', 5, '[]', '[]', ?, 2, ?, ?)`,
      ).run(V1, legacyJson, now, now);

      const hit = facts.readFacts("repo-1", ["src/legacy.ts"], 2).get("src/legacy.ts");
      expect(hit?.factsJson).toBe(legacyJson);
    });

    it("re-upserting a legacy row migrates it to facts_blob and clears facts_json", () => {
      const facts = new CodeFactsRepository(db, V1);
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO code_file_facts
           (repo_key, file_path, content_hash, analyzer_version, language, lines,
            findings_json, opportunities_json, facts_json, facts_schema_version, created_at, last_used_at)
         VALUES ('repo-1', 'src/a.ts', 'hash-a', ?, 'typescript', 5, '[]', '[]', '{"old":true}', 2, ?, ?)`,
      ).run(V1, now, now);

      facts.upsertFacts("repo-1", [factsInput()]);

      const raw = db
        .prepare(`SELECT facts_blob, facts_json FROM code_file_facts WHERE file_path = 'src/a.ts'`)
        .get() as { facts_blob: Buffer | null; facts_json: string | null };
      expect(raw.facts_blob).toBeInstanceOf(Buffer);
      expect(raw.facts_json).toBeNull();
      expect(facts.readFacts("repo-1", ["src/a.ts"], 2).get("src/a.ts")?.factsJson).toBe(factsInput().json);
    });

    it("a corrupt facts_blob reads as a miss, not a crash", () => {
      const facts = new CodeFactsRepository(db, V1);
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO code_file_facts
           (repo_key, file_path, content_hash, analyzer_version, language, lines,
            findings_json, opportunities_json, facts_blob, facts_schema_version, created_at, last_used_at)
         VALUES ('repo-1', 'src/broken.ts', 'hash-broken', ?, 'typescript', 5, '[]', '[]', ?, 2, ?, ?)`,
      ).run(V1, Buffer.from("not gzip data"), now, now);

      expect(facts.readFacts("repo-1", ["src/broken.ts"], 2).size).toBe(0);
    });

    it("FACTS_MAX_BYTES has a sane positive default", () => {
      expect(FACTS_MAX_BYTES).toBeGreaterThan(0);
    });
  });

  describe("P3: gc byte budget (maxBytes)", () => {
    it("evicts the oldest-used facts rows once the summed facts payload exceeds maxBytes", async () => {
      const tick = () => new Promise((r) => setTimeout(r, 5));
      const facts = new CodeFactsRepository(db, V1);

      // Each row's compressed payload is a few bytes; a tiny maxBytes forces eviction.
      facts.upsertFacts("repo-1", [factsInput({ path: "src/a.ts", contentHash: "h-a" })]);
      await tick();
      facts.upsertFacts("repo-1", [factsInput({ path: "src/b.ts", contentHash: "h-b" })]);
      await tick();
      facts.upsertFacts("repo-1", [factsInput({ path: "src/c.ts", contentHash: "h-c" })]);
      await tick();

      const rowBytes = (
        db.prepare(`SELECT length(facts_blob) AS n FROM code_file_facts WHERE file_path = 'src/c.ts'`).get() as {
          n: number;
        }
      ).n;

      // Budget for exactly the two most-recently-used rows (c, b) — a evicted.
      const result = facts.gc({ ttlMs: 999_999_999, maxRows: 1000, maxBytes: rowBytes * 2 });
      expect(result.deletedOverBytes).toBe(1);
      expect(facts.readFacts("repo-1", ["src/a.ts"], 2).size).toBe(0);
      expect(facts.readFacts("repo-1", ["src/b.ts"], 2).size).toBe(1);
      expect(facts.readFacts("repo-1", ["src/c.ts"], 2).size).toBe(1);
    });

    it("does not evict rows that carry no facts payload, even when maxBytes is tiny", () => {
      const facts = new CodeFactsRepository(db, V1);
      // upsertMany (the F2 per-file path) never populates facts_blob/facts_json.
      facts.upsertMany("repo-1", [row()]);

      const result = facts.gc({ ttlMs: 999_999_999, maxRows: 1000, maxBytes: 1 });
      expect(result.deletedOverBytes).toBe(0);
      expect(facts.countAll()).toBe(1);
    });

    it("defaults maxBytes to FACTS_MAX_BYTES when the caller omits it", () => {
      const facts = new CodeFactsRepository(db, V1);
      facts.upsertFacts("repo-1", [factsInput()]);

      // A generous real-world budget: nothing gets evicted.
      const result = facts.gc({ ttlMs: 999_999_999, maxRows: 1000 });
      expect(result.deletedOverBytes).toBe(0);
      expect(facts.readFacts("repo-1", ["src/a.ts"], 2).size).toBe(1);
    });
  });
});
