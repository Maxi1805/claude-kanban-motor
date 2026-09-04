/**
 * Test de `computeReachIndex` — CONTRATO-F5.md §1.5. Mismos helpers de
 * fixture que `graph/metrics/pagerank.test.ts`.
 */
import { describe, expect, it } from "vitest";

import { fileNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type EdgeKind } from "../graph/types.js";
import type { ResolutionStats } from "../graph/stages.js";
import { computeReachIndex } from "./reach.js";

const EMPTY_RESOLUTION: ResolutionStats = {
  candidates: 0,
  resolved: 0,
  droppedAmbiguous: 0,
  unresolved: 0,
  byStage: [],
};

function fileNode(file: string): CodeGraphNode {
  return { id: fileNodeId(file), kind: "file", file, symbolPath: [] };
}
function edge(from: string, to: string, kind: EdgeKind, weight = 1): CodeGraphEdge {
  return { from, to, kind, provenance: "resolved", weight };
}
function graphOf(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): CodeGraph {
  return { nodes, edges, resolution: EMPTY_RESOLUTION };
}

describe("computeReachIndex", () => {
  it("returns the neutral 0.5 for every file when there is no graph", () => {
    const idx = computeReachIndex(null);
    expect(idx.reachFor("anything.ts")).toBe(0.5);
    expect(idx.reachFor("")).toBe(0.5);
  });

  it("returns 0.5 for a file absent from the graph's projection", () => {
    const g = graphOf([fileNode("a.ts")], []);
    const idx = computeReachIndex(g);
    expect(idx.reachFor("not-in-graph.ts")).toBe(0.5);
  });

  it("a hub referenced by many files ranks higher than a leaf nobody references", () => {
    const hub = fileNode("hub.ts");
    const leaf = fileNode("leaf.ts");
    const clients = ["c1.ts", "c2.ts", "c3.ts"].map(fileNode);
    const g = graphOf(
      [hub, leaf, ...clients],
      clients.map((c) => edge(c.id, hub.id, "references")),
    );
    const idx = computeReachIndex(g);
    expect(idx.reachFor("hub.ts")).toBeGreaterThan(idx.reachFor("leaf.ts"));
  });

  it("a file inside a dependency cycle (SCC >= 2) ranks at least as high as one outside any cycle", () => {
    const a = fileNode("a.ts");
    const b = fileNode("b.ts");
    const outside = fileNode("outside.ts");
    const g = graphOf(
      [a, b, outside],
      [edge(a.id, b.id, "imports"), edge(b.id, a.id, "imports")],
    );
    const idx = computeReachIndex(g);
    expect(idx.reachFor("a.ts")).toBeGreaterThanOrEqual(idx.reachFor("outside.ts"));
  });

  it("with a single file in the projection, reach is the neutral 0.5 (n===1 rank)", () => {
    const g = graphOf([fileNode("only.ts")], []);
    const idx = computeReachIndex(g);
    // pagerank/fanIn ranks both collapse to 0.5 for n=1, sccBoost=0 (no cycle possible alone):
    // 0.5*0.5 + 0.3*0.5 + 0.2*0 = 0.4
    expect(idx.reachFor("only.ts")).toBeCloseTo(0.4, 10);
  });

  it("never returns exactly 0 — 0 would assert nobody depends on the file", () => {
    const g = graphOf([fileNode("a.ts"), fileNode("b.ts")], []);
    const idx = computeReachIndex(g);
    expect(idx.reachFor("a.ts")).toBeGreaterThan(0);
    expect(idx.reachFor("b.ts")).toBeGreaterThan(0);
  });
});
