/**
 * `graph/finding-nodes.ts` — CONTRATO-F9.md §2. El cuerpo real: un nodo
 * `finding` por `Finding` (deduplicado por id), una arista `affects` por
 * ancla distinta, con fallback a `fileNodeId` cuando el símbolo del ancla no
 * tiene nodo propio en el grafo.
 */
import { describe, expect, it } from "vitest";

import { pisoDeclarado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import type { Finding } from "../detect/types.js";
import { attachFindingNodes, findingNodeId } from "./finding-nodes.js";
import { fileNodeId, symbolNodeId, type CodeGraph, type CodeGraphNode } from "./types.js";

function fakeThreshold(): Threshold {
  return resolveThreshold(pisoDeclarado(20, { rationale: "test" }), { language: "ruby", sampleSize: () => 0, corpusP95: () => null });
}

function fakeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: `f-${Math.random().toString(36).slice(2)}`,
    detectorId: "long-function",
    kind: "long-function",
    scope: "intra-function",
    language: "ruby",
    title: "t",
    detail: "d",
    trigger: [{ label: "x", value: 1, threshold: fakeThreshold() }],
    locations: [{ file: "a.rb", startLine: 1, endLine: 2, role: "sujeto", symbol: "A" }],
    severity: 50,
    advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
    ...overrides,
  };
}

function emptyGraph(nodes: readonly CodeGraphNode[] = []): CodeGraph {
  return { nodes, edges: [], resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] } };
}

describe("attachFindingNodes — sin hallazgos", () => {
  it("devuelve el MISMO grafo (identidad), sin copiar", () => {
    const graph = emptyGraph();
    expect(attachFindingNodes(graph, [])).toBe(graph);
  });
});

describe("attachFindingNodes — nodo finding", () => {
  it("crea un nodo kind:finding con findingKind/severity/detectorId verbatim y file de la primera location", () => {
    const finding = fakeFinding({
      id: "f1",
      kind: "duplication",
      detectorId: "duplication",
      severity: 77,
      locations: [{ file: "a.rb", startLine: 10, endLine: 20, role: "sujeto", symbol: "A" }],
    });
    const out = attachFindingNodes(emptyGraph(), [finding]);
    const node = out.nodes.find((n) => n.id === findingNodeId("f1"));
    expect(node).toMatchObject({
      id: "finding:f1",
      kind: "finding",
      file: "a.rb",
      symbolPath: [],
      startLine: 10,
      endLine: 20,
      findingKind: "duplication",
      severity: 77,
      detectorId: "duplication",
    });
  });

  it("un mismo Finding.id repetido en la lista de entrada produce UN solo nodo (deduplicado)", () => {
    const finding = fakeFinding({ id: "dup" });
    const out = attachFindingNodes(emptyGraph(), [finding, finding]);
    expect(out.nodes.filter((n) => n.kind === "finding")).toHaveLength(1);
  });

  it("no muta el grafo de entrada — nodes/edges originales siguen ahí, en el mismo orden, al principio", () => {
    const original = emptyGraph([{ id: fileNodeId("a.rb"), kind: "file", file: "a.rb", symbolPath: [] }]);
    const finding = fakeFinding({ id: "f1" });
    const out = attachFindingNodes(original, [finding]);
    expect(out).not.toBe(original);
    expect(original.nodes).toHaveLength(1); // el original no ganó el nodo finding.
    expect(out.nodes.slice(0, 1)).toEqual(original.nodes);
  });
});

describe("attachFindingNodes — arista affects", () => {
  it("apunta al nodo symbol cuando el ancla SÍ tiene uno en el grafo", () => {
    const symId = symbolNodeId("a.rb", ["A", "process"]);
    const graph = emptyGraph([
      { id: fileNodeId("a.rb"), kind: "file", file: "a.rb", symbolPath: [] },
      { id: symId, kind: "symbol", file: "a.rb", symbolPath: ["A", "process"] },
    ]);
    const finding = fakeFinding({ id: "f1", locations: [{ file: "a.rb", startLine: 1, endLine: 2, role: "sujeto", symbol: "A.process" }] });
    const out = attachFindingNodes(graph, [finding]);
    const affects = out.edges.filter((e) => e.kind === "affects");
    expect(affects).toHaveLength(1);
    expect(affects[0]).toMatchObject({ from: findingNodeId("f1"), to: symId, provenance: "declared", weight: 1 });
  });

  it("cae a fileNodeId cuando el símbolo del ancla NO tiene nodo propio", () => {
    const graph = emptyGraph([{ id: fileNodeId("a.rb"), kind: "file", file: "a.rb", symbolPath: [] }]);
    const finding = fakeFinding({ id: "f1", locations: [{ file: "a.rb", startLine: 1, endLine: 2, role: "sujeto", symbol: "NoExiste" }] });
    const out = attachFindingNodes(graph, [finding]);
    const affects = out.edges.filter((e) => e.kind === "affects");
    expect(affects).toHaveLength(1);
    expect(affects[0]).toMatchObject({ from: findingNodeId("f1"), to: fileNodeId("a.rb") });
  });

  it("una location SIN symbol (ancla a nivel archivo) también cae a fileNodeId", () => {
    const graph = emptyGraph([{ id: fileNodeId("a.rb"), kind: "file", file: "a.rb", symbolPath: [] }]);
    const finding = fakeFinding({ id: "f1", locations: [{ file: "a.rb", startLine: 1, endLine: 2, role: "sujeto" }] });
    const out = attachFindingNodes(graph, [finding]);
    expect(out.edges.filter((e) => e.kind === "affects")).toEqual([{ from: findingNodeId("f1"), to: fileNodeId("a.rb"), kind: "affects", provenance: "declared", weight: 1 }]);
  });

  it("dos locations que derivan la MISMA ancla serializada colapsan en UNA sola arista", () => {
    const graph = emptyGraph([{ id: fileNodeId("a.rb"), kind: "file", file: "a.rb", symbolPath: [] }]);
    const finding = fakeFinding({
      id: "f1",
      locations: [
        { file: "a.rb", startLine: 1, endLine: 2, role: "acumulador", symbol: "A" },
        { file: "a.rb", startLine: 9, endLine: 9, role: "copia #2", symbol: "A" },
      ],
    });
    const out = attachFindingNodes(graph, [finding]);
    expect(out.edges.filter((e) => e.kind === "affects")).toHaveLength(1);
  });

  it("dos locations con ancla DISTINTA producen dos aristas affects", () => {
    const graph = emptyGraph([{ id: fileNodeId("a.rb"), kind: "file", file: "a.rb", symbolPath: [] }]);
    const finding = fakeFinding({
      id: "f1",
      locations: [
        { file: "a.rb", startLine: 1, endLine: 2, role: "r1", symbol: "A" },
        { file: "a.rb", startLine: 9, endLine: 9, role: "r2", symbol: "B" },
      ],
    });
    const out = attachFindingNodes(graph, [finding]);
    expect(out.edges.filter((e) => e.kind === "affects")).toHaveLength(2);
  });

  it("un ancla que usa un `ordinal` explícito respeta el mismo criterio de dedup que serializeAnchor", () => {
    const graph = emptyGraph([{ id: fileNodeId("a.rb"), kind: "file", file: "a.rb", symbolPath: [] }]);
    const finding = fakeFinding({
      id: "f1",
      locations: [
        { file: "a.rb", startLine: 1, endLine: 2, role: "r1", anchor: { file: "a.rb", symbolPath: ["A"], ordinal: 2 } },
        { file: "a.rb", startLine: 9, endLine: 9, role: "r2", anchor: { file: "a.rb", symbolPath: ["A"], ordinal: 2 } },
        { file: "a.rb", startLine: 20, endLine: 20, role: "r3", anchor: { file: "a.rb", symbolPath: ["A"], ordinal: 3 } },
      ],
    });
    const out = attachFindingNodes(graph, [finding]);
    expect(out.edges.filter((e) => e.kind === "affects")).toHaveLength(2); // ordinal 2 (deduplicado x2) + ordinal 3.
  });
});
