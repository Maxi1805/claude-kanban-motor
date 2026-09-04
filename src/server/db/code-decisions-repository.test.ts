/**
 * `CodeDecisionsRepository` unit tests — F2. The key property under test:
 * matching is by (repo, findingId) ONLY — never by `analyzer_version` — so a
 * discard outlives a detector-logic change. See the file's own docstring for
 * why that is deliberate, unlike `CodeFactsRepository`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { initDb, type DB } from "./index.js";
import { CodeDecisionsRepository } from "./code-decisions-repository.js";

describe("CodeDecisionsRepository", () => {
  let db: DB;

  beforeEach(() => {
    db = initDb(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("discard then get round-trips the reason", () => {
    const decisions = new CodeDecisionsRepository(db, "1");
    decisions.discard("repo-1", "long-function:abc123", "ya lo revisamos");

    const d = decisions.get("repo-1", "long-function:abc123");
    expect(d?.reason).toBe("ya lo revisamos");
    expect(d?.decidedAt).toBeTruthy();
  });

  it("get returns null for a finding never discarded", () => {
    const decisions = new CodeDecisionsRepository(db, "1");
    expect(decisions.get("repo-1", "nope")).toBeNull();
  });

  it("discarding again OVERWRITES the reason, does not duplicate the row", () => {
    const decisions = new CodeDecisionsRepository(db, "1");
    decisions.discard("repo-1", "f1", "primer motivo");
    decisions.discard("repo-1", "f1", "motivo actualizado");

    expect(decisions.listForRepo("repo-1").size).toBe(1);
    expect(decisions.get("repo-1", "f1")?.reason).toBe("motivo actualizado");
  });

  it("restore removes the decision; a second restore is a harmless no-op", () => {
    const decisions = new CodeDecisionsRepository(db, "1");
    decisions.discard("repo-1", "f1", "motivo");
    decisions.restore("repo-1", "f1");
    expect(decisions.get("repo-1", "f1")).toBeNull();
    expect(() => decisions.restore("repo-1", "f1")).not.toThrow();
  });

  it("isolates by repo_key: the same finding id in another repo is a separate decision", () => {
    const decisions = new CodeDecisionsRepository(db, "1");
    decisions.discard("repo-1", "f1", "motivo repo 1");
    expect(decisions.get("repo-2", "f1")).toBeNull();
  });

  it("listForRepo returns every current discard for a repo, keyed by finding id", () => {
    const decisions = new CodeDecisionsRepository(db, "1");
    decisions.discard("repo-1", "f1", "m1");
    decisions.discard("repo-1", "f2", "m2");
    decisions.discard("repo-2", "f3", "m3"); // different repo — excluded

    const list = decisions.listForRepo("repo-1");
    expect(list.size).toBe(2);
    expect(list.get("f1")?.reason).toBe("m1");
    expect(list.get("f2")?.reason).toBe("m2");
  });

  it("deliberately NOT scoped by analyzer_version: a discard written under one version still matches under another", () => {
    const decisionsV1 = new CodeDecisionsRepository(db, "1");
    decisionsV1.discard("repo-1", "f1", "motivo");

    const decisionsV2 = new CodeDecisionsRepository(db, "2");
    expect(decisionsV2.get("repo-1", "f1")?.reason).toBe("motivo");
    expect(decisionsV2.listForRepo("repo-1").size).toBe(1);
  });
});
