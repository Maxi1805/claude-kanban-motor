/**
 * `CodeGraphRepository` unit tests — F3. Exercises real better-sqlite3
 * (in-memory): content-hash keying (a revert hits the old row again),
 * `analyzer_version` isolation, and GC (TTL + stale-version + LRU cap).
 * Same shape as `code-facts-repository.test.ts`'s coverage of its own
 * whole-repo snapshot row.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { initDb, type DB } from "./index.js";
import {
  CodeGraphRepository,
  graphSizeBudget,
  MAX_BYTES_PER_EDGE,
  MAX_BYTES_PER_NODE,
} from "./code-graph-repository.js";

const V1 = "1";
const V2 = "2";

describe("CodeGraphRepository", () => {
  let db: DB;

  beforeEach(() => {
    db = initDb(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("read misses on an empty table", () => {
    const graphs = new CodeGraphRepository(db, V1);
    expect(graphs.read("repo-1", "sig-abc")).toBeNull();
  });

  it("round-trips a graph by (repo, whole-tree signature)", () => {
    const graphs = new CodeGraphRepository(db, V1);
    graphs.put("repo-1", "sig-abc", '{"nodes":[],"edges":[]}', 0, 0);

    expect(graphs.read("repo-1", "sig-abc")).toBe('{"nodes":[],"edges":[]}');
    expect(graphs.read("repo-1", "sig-does-not-exist")).toBeNull();
    expect(graphs.read("repo-2", "sig-abc")).toBeNull(); // different repo, no cross-talk
  });

  it("content hash is part of the identity: a reverted commit lands on its OWN row instead of overwriting", () => {
    const graphs = new CodeGraphRepository(db, V1);
    graphs.put("repo-1", "sig-v1", "{}", 1, 1);
    graphs.put("repo-1", "sig-v2", "{}", 2, 2);
    graphs.put("repo-1", "sig-v1", "{}", 1, 1); // reverted back to v1's content

    expect(graphs.countAll()).toBe(2);
  });

  it("upserting the SAME (repo, signature, version) again updates in place, not a new row", () => {
    const graphs = new CodeGraphRepository(db, V1);
    graphs.put("repo-1", "sig-abc", '{"edges":[]}', 0, 0);
    graphs.put("repo-1", "sig-abc", '{"edges":[1,2,3]}', 1, 3);

    expect(graphs.countAll()).toBe(1);
    expect(graphs.read("repo-1", "sig-abc")).toBe('{"edges":[1,2,3]}');
  });

  it("a row written under a DIFFERENT analyzer_version never matches a read of the current one", () => {
    const graphsV1 = new CodeGraphRepository(db, V1);
    graphsV1.put("repo-1", "sig-abc", "{}", 0, 0);

    const graphsV2 = new CodeGraphRepository(db, V2);
    expect(graphsV2.read("repo-1", "sig-abc")).toBeNull();
    // Still physically there — a read filter, not a delete.
    expect(graphsV1.countAll()).toBe(1);
  });

  it("gc reclaims rows from another analyzer_version", () => {
    const graphsV1 = new CodeGraphRepository(db, V1);
    graphsV1.put("repo-1", "sig-old", "{}", 0, 0);

    const graphsV2 = new CodeGraphRepository(db, V2);
    graphsV2.put("repo-1", "sig-new", "{}", 0, 0);
    expect(graphsV2.countAll()).toBe(2);

    const result = graphsV2.gc({ ttlMs: 999_999_999, maxRows: 1000 });
    expect(result.deletedStaleVersion).toBe(1);
    expect(graphsV2.countAll()).toBe(1);
    expect(graphsV2.read("repo-1", "sig-new")).toBe("{}");
  });

  it("gc reclaims rows unused past the TTL", () => {
    const graphs = new CodeGraphRepository(db, V1);
    graphs.put("repo-1", "sig-abc", "{}", 0, 0);

    const farFuture = Date.now() + 100_000;
    const result = graphs.gc({ ttlMs: 1, maxRows: 1000, now: farFuture });
    expect(result.deletedExpired).toBe(1);
    expect(graphs.countAll()).toBe(0);
  });

  it("gc enforces the row cap by true LRU (oldest last_used_at first), not insertion order", async () => {
    const tick = () => new Promise((r) => setTimeout(r, 5));

    const graphs = new CodeGraphRepository(db, V1);
    graphs.put("repo-1", "sig-a", "{}", 0, 0);
    await tick();
    graphs.put("repo-1", "sig-b", "{}", 0, 0);
    await tick();
    graphs.put("repo-1", "sig-c", "{}", 0, 0);
    await tick();

    // Touch "a" so it is the MOST recently used, even though inserted first.
    graphs.touch("repo-1", "sig-a");

    const result = graphs.gc({ ttlMs: 999_999_999, maxRows: 2 });
    expect(result.deletedOverCap).toBe(1);
    expect(graphs.countAll()).toBe(2);
    expect(graphs.read("repo-1", "sig-a")).not.toBeNull(); // survives: touched
    expect(graphs.read("repo-1", "sig-b")).toBeNull(); // evicted: oldest untouched
  });

  it("touch on a missing row is a silent no-op", () => {
    const graphs = new CodeGraphRepository(db, V1);
    expect(() => graphs.touch("repo-1", "sig-does-not-exist")).not.toThrow();
    expect(graphs.countAll()).toBe(0);
  });

  // P1 — COSTO#4: `graph_json` no tenía techo automatizado antes de esta
  // tarea (PREEXISTENTE, no regresión de esta ola — ver el docstring de
  // `graphSizeBudget`). Estos casos pinnean la línea base REAL medida
  // (P1, 2026-07-30, corrida real de `analyzeRepo`+`onGraph` sobre
  // `corpus/guava`) contra el techo declarado, y prueban que el guardia
  // dispara cuando el peso no está justificado por el conteo.
  describe("graphSizeBudget (presupuesto de tamaño, COSTO#4)", () => {
    it("la línea base medida de guava (repo más grande/denso del corpus) queda dentro del techo con el margen declarado", () => {
      // guava: 46496 nodos, 118718 aristas, JSON.stringify(graph).length medido = 47259946 bytes.
      const GUAVA_BYTES = 47_259_946;
      const report = graphSizeBudget("x".repeat(GUAVA_BYTES), 46496, 118718);

      expect(report.bytes).toBe(GUAVA_BYTES);
      expect(report.bytesPerNode).toBeCloseTo(1016.43, 1);
      expect(report.bytesPerEdge).toBeCloseTo(398.09, 1);
      expect(report.bytesPerNode).toBeLessThanOrEqual(MAX_BYTES_PER_NODE);
      expect(report.bytesPerEdge).toBeLessThanOrEqual(MAX_BYTES_PER_EDGE);
      expect(report.withinBudget).toBe(true);
    });

    it("dispara cuando el mismo peso se declara con muchas menos aristas/nodos de los que lo explican", () => {
      const report = graphSizeBudget("x".repeat(47_259_946), 46496, 1000);

      expect(report.bytesPerEdge).toBeGreaterThan(MAX_BYTES_PER_EDGE);
      expect(report.withinBudget).toBe(false);
    });

    it("bytesPerNode/bytesPerEdge son 0 (no NaN/Infinity) cuando el conteo declarado es 0", () => {
      const report = graphSizeBudget("{}", 0, 0);
      expect(report.bytesPerNode).toBe(0);
      expect(report.bytesPerEdge).toBe(0);
    });

    it("put/read round-trips byte-for-byte, así el chequeo de presupuesto sobre una fila leída coincide con lo escrito", () => {
      const graphs = new CodeGraphRepository(db, V1);
      const big = "x".repeat(100_000);
      graphs.put("repo-1", "sig-budget", big, 500, 1000);

      const back = graphs.read("repo-1", "sig-budget");
      expect(back).toBe(big);

      const report = graphSizeBudget(back!, 500, 1000);
      expect(report.bytes).toBe(100_000);
      expect(report.withinBudget).toBe(true);
    });
  });
});
