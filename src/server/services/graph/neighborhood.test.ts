/**
 * `graph/neighborhood.ts` — CONTRATO-F9.md §1. Fija el comportamiento que
 * los 8-9 frentes que dependen de esto van a asumir: exclusión del propio
 * `problem`, truncado con su bandera, `ego` acotado y determinista, y el
 * vecindario vacío como default seguro.
 */
import { describe, expect, it } from "vitest";

import { pisoDeclarado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import type { Finding } from "../detect/types.js";
import { fileNodeId, symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode } from "./types.js";
import {
  buildNeighborhoodIndex,
  EGO_MAX_DEGREE,
  EGO_MAX_NODES,
  EMPTY_NEIGHBORHOOD,
  neighborhoodFor,
  NEIGHBORHOOD_MAX_PEERS,
} from "./neighborhood.js";

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

function edge(from: string, to: string, weight = 1): CodeGraphEdge {
  return { from, to, kind: "references", provenance: "resolved", weight };
}

describe("EMPTY_NEIGHBORHOOD", () => {
  it("responde vacío/null/undefined a todo, sin excepción", () => {
    expect(EMPTY_NEIGHBORHOOD.findingsAtSymbol({ file: "a.rb", symbolPath: [] })).toEqual([]);
    expect(EMPTY_NEIGHBORHOOD.findingsInFile("a.rb")).toEqual([]);
    expect(EMPTY_NEIGHBORHOOD.findingsOfKind("k")).toEqual([]);
    expect(EMPTY_NEIGHBORHOOD.countOfKind("k")).toBe(0);
    expect(EMPTY_NEIGHBORHOOD.truncated("atSymbol")).toBe(false);
    expect(EMPTY_NEIGHBORHOOD.ego({ file: "a.rb", symbolPath: [] }, 1)).toBeNull();
    expect(EMPTY_NEIGHBORHOOD.metric({ file: "a.rb", symbolPath: [] }, "pagerank")).toBeUndefined();
  });
});

describe("buildNeighborhoodIndex sin grafo (graph: null)", () => {
  it("sigue construyendo los índices de hallazgos — no depende del grafo", () => {
    const a = fakeFinding({ id: "a", kind: "k1", locations: [{ file: "x.rb", startLine: 1, endLine: 2, role: "r", symbol: "X" }] });
    const b = fakeFinding({ id: "b", kind: "k1", locations: [{ file: "x.rb", startLine: 1, endLine: 2, role: "r", symbol: "X" }] });
    const index = buildNeighborhoodIndex(null, [a, b], null);
    const n = neighborhoodFor(index, a);
    expect(n.findingsOfKind("k1").map((f) => f.id)).toEqual(["b"]);
    expect(n.ego({ file: "x.rb", symbolPath: ["X"] }, 1)).toBeNull();
  });
});

describe("findingsAtSymbol/findingsInFile/findingsOfKind", () => {
  const a = fakeFinding({ id: "a", kind: "shared-kind", locations: [{ file: "x.rb", startLine: 1, endLine: 2, role: "r", symbol: "X" }] });
  const b = fakeFinding({ id: "b", kind: "shared-kind", locations: [{ file: "x.rb", startLine: 5, endLine: 6, role: "r", symbol: "Y" }] });
  const c = fakeFinding({ id: "c", kind: "other-kind", locations: [{ file: "z.rb", startLine: 1, endLine: 2, role: "r", symbol: "X" }] });
  const index = buildNeighborhoodIndex(null, [a, b, c], null);

  it("findingsAtSymbol: exact ancla, nunca incluye al problem", () => {
    const n = neighborhoodFor(index, a);
    expect(n.findingsAtSymbol({ file: "x.rb", symbolPath: ["X"] })).toEqual([]);
    // `c` está en z.rb#X, no x.rb#X — anclas distintas, no matchea.
  });

  it("findingsInFile: comparte archivo, excluye al problem", () => {
    const n = neighborhoodFor(index, a);
    expect(n.findingsInFile("x.rb").map((f) => f.id)).toEqual(["b"]);
  });

  it("findingsOfKind: comparte kind en cualquier archivo, excluye al problem", () => {
    const n = neighborhoodFor(index, a);
    expect(n.findingsOfKind("shared-kind").map((f) => f.id)).toEqual(["b"]);
    expect(n.findingsOfKind("other-kind").map((f) => f.id)).toEqual(["c"]);
  });

  it("countOfKind: cardinal real, excluye al problem, sin truncar", () => {
    const n = neighborhoodFor(index, a);
    expect(n.countOfKind("shared-kind")).toBe(1);
  });
});

describe("truncado — NEIGHBORHOOD_MAX_PEERS", () => {
  it("corta a NEIGHBORHOOD_MAX_PEERS y marca truncated('ofKind')", () => {
    const problem = fakeFinding({ id: "problem", kind: "k" });
    const rest = Array.from({ length: NEIGHBORHOOD_MAX_PEERS + 10 }, (_, i) => fakeFinding({ id: `r${i}`, kind: "k", severity: i }));
    const index = buildNeighborhoodIndex(null, [problem, ...rest], null);
    const n = neighborhoodFor(index, problem);
    expect(n.truncated("ofKind")).toBe(false); // todavía no se consultó nada
    const got = n.findingsOfKind("k");
    expect(got.length).toBe(NEIGHBORHOOD_MAX_PEERS);
    expect(n.truncated("ofKind")).toBe(true);
    // Orden: severity desc — el primero debe ser el de mayor severidad.
    expect(got[0]!.severity).toBe(NEIGHBORHOOD_MAX_PEERS + 9);
  });
});

describe("ego", () => {
  it("null si el ancla no tiene nodo en el grafo", () => {
    const graph: CodeGraph = { nodes: [], edges: [], resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] } };
    const index = buildNeighborhoodIndex(graph, [], null);
    const n = neighborhoodFor(index, fakeFinding());
    expect(n.ego({ file: "nope.rb", symbolPath: [] }, 1)).toBeNull();
  });

  it("hop 1: vecinos directos, grado real reportado", () => {
    const center = fileNodeId("center.rb");
    const a = fileNodeId("a.rb");
    const b = fileNodeId("b.rb");
    const graph: CodeGraph = {
      nodes: [
        { id: center, kind: "file", file: "center.rb", symbolPath: [] },
        { id: a, kind: "file", file: "a.rb", symbolPath: [] },
        { id: b, kind: "file", file: "b.rb", symbolPath: [] },
      ],
      edges: [edge(center, a), edge(b, center)],
      resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
    };
    const index = buildNeighborhoodIndex(graph, [], null);
    const n = neighborhoodFor(index, fakeFinding());
    const ego = n.ego({ file: "center.rb", symbolPath: [] }, 1);
    expect(ego).not.toBeNull();
    expect(ego!.degreeOut).toBe(1);
    expect(ego!.degreeIn).toBe(1);
    expect(ego!.nodes.map((x) => x.node.id).sort()).toEqual([a, b].sort());
    expect(ego!.nodes.every((x) => x.hops === 1)).toBe(true);
    expect(ego!.truncated).toBe(false);
    expect(ego!.edges.length).toBe(2);
  });

  it("hop 2: alcanza vecinos de vecinos, hops mínimo real", () => {
    const center = fileNodeId("center.rb");
    const mid = fileNodeId("mid.rb");
    const far = fileNodeId("far.rb");
    const graph: CodeGraph = {
      nodes: [center, mid, far].map((id, i) => ({ id, kind: "file" as const, file: `${i}.rb`, symbolPath: [] })),
      edges: [edge(center, mid), edge(mid, far)],
      resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
    };
    const index = buildNeighborhoodIndex(graph, [], null);
    const n = neighborhoodFor(index, fakeFinding());
    const ego1 = n.ego({ file: "center.rb", symbolPath: [] }, 1);
    expect(ego1!.nodes.map((x) => x.node.id)).toEqual([mid]);
    const ego2 = n.ego({ file: "center.rb", symbolPath: [] }, 2);
    const byId = new Map(ego2!.nodes.map((x) => [x.node.id, x.hops]));
    expect(byId.get(mid)).toBe(1);
    expect(byId.get(far)).toBe(2);
  });

  it("excluye aristas `ambiguous` de degreeIn/degreeOut (crudo en Ego.edges sí las incluye)", () => {
    const center = fileNodeId("center.rb");
    const a = fileNodeId("a.rb");
    const b = fileNodeId("b.rb");
    const graph: CodeGraph = {
      nodes: [center, a, b].map((id, i) => ({ id, kind: "file" as const, file: `${i}.rb`, symbolPath: [] })),
      edges: [edge(center, a), { ...edge(center, b), provenance: "ambiguous", alternatives: ["x"] }],
      resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
    };
    const index = buildNeighborhoodIndex(graph, [], null);
    const n = neighborhoodFor(index, fakeFinding());
    const ego = n.ego({ file: "center.rb", symbolPath: [] }, 1);
    expect(ego!.degreeOut).toBe(1); // sólo la no-ambigua
    expect(ego!.edges.length).toBe(2); // el crudo sí trae las dos
  });

  it("corte de `ego(...,1)` respeta EGO_MAX_DEGREE, determinista por weight desc", () => {
    const center = fileNodeId("center.rb");
    const targets = Array.from({ length: EGO_MAX_DEGREE + 20 }, (_, i) => fileNodeId(`t${i}.rb`));
    const graph: CodeGraph = {
      nodes: [{ id: center, kind: "file", file: "center.rb", symbolPath: [] }, ...targets.map((id, i) => ({ id, kind: "file" as const, file: `t${i}.rb`, symbolPath: [] }))],
      edges: targets.map((t, i) => edge(center, t, i + 1)), // pesos crecientes: el último (mayor peso) tiene que sobrevivir el corte.
      resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
    };
    const index = buildNeighborhoodIndex(graph, [], null);
    const n = neighborhoodFor(index, fakeFinding());
    const ego = n.ego({ file: "center.rb", symbolPath: [] }, 1);
    expect(ego!.nodes.length).toBe(EGO_MAX_DEGREE);
    expect(ego!.truncated).toBe(true);
    expect(ego!.degreeOut).toBe(targets.length); // real, sin cortar
    expect(ego!.nodes.some((x) => x.node.id === targets[targets.length - 1])).toBe(true); // el de mayor peso sobrevive
    expect(ego!.nodes.some((x) => x.node.id === targets[0])).toBe(false); // el de menor peso, no
  });

  it("cota dura de ego(...,2): nunca más de EGO_MAX_NODES nodos", () => {
    // Hub sintético: `center` conectado a EGO_MAX_DEGREE vecinos, cada uno con su propio abanico de EGO_MAX_DEGREE — más que EGO_MAX_NODES en total.
    const center = fileNodeId("center.rb");
    const mids = Array.from({ length: EGO_MAX_DEGREE }, (_, i) => fileNodeId(`mid${i}.rb`));
    const nodes: CodeGraphNode[] = [{ id: center, kind: "file", file: "center.rb", symbolPath: [] }];
    const edges: CodeGraphEdge[] = [];
    for (const [mi, mid] of mids.entries()) {
      nodes.push({ id: mid, kind: "file", file: `mid${mi}.rb`, symbolPath: [] });
      edges.push(edge(center, mid, 1000 - mi));
      for (let j = 0; j < EGO_MAX_DEGREE; j++) {
        const leaf = fileNodeId(`leaf-${mi}-${j}.rb`);
        nodes.push({ id: leaf, kind: "file", file: `leaf-${mi}-${j}.rb`, symbolPath: [] });
        edges.push(edge(mid, leaf, EGO_MAX_DEGREE - j));
      }
    }
    const graph: CodeGraph = { nodes, edges, resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] } };
    const index = buildNeighborhoodIndex(graph, [], null);
    const n = neighborhoodFor(index, fakeFinding());
    const ego = n.ego({ file: "center.rb", symbolPath: [] }, 2);
    expect(ego!.nodes.length).toBeLessThanOrEqual(EGO_MAX_NODES);
    expect(ego!.truncated).toBe(true);
  });

  it("memoiza: dos llamadas al mismo (ancla, hops) devuelven el mismo objeto", () => {
    const center = fileNodeId("center.rb");
    const graph: CodeGraph = {
      nodes: [{ id: center, kind: "file", file: "center.rb", symbolPath: [] }],
      edges: [],
      resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
    };
    const index = buildNeighborhoodIndex(graph, [], null);
    const n1 = neighborhoodFor(index, fakeFinding());
    const n2 = neighborhoodFor(index, fakeFinding());
    const e1 = n1.ego({ file: "center.rb", symbolPath: [] }, 1);
    const e2 = n2.ego({ file: "center.rb", symbolPath: [] }, 1);
    expect(e1).toBe(e2); // mismo índice ⇒ mismo LRU compartido, incluso entre `Finding` distintos.
  });
});

describe("metric", () => {
  it("undefined cuando no hay métricas esta corrida", () => {
    const index = buildNeighborhoodIndex(null, [], null);
    const n = neighborhoodFor(index, fakeFinding());
    expect(n.metric({ file: "a.rb", symbolPath: ["X"] }, "pagerank")).toBeUndefined();
  });

  it("lee el valor ya calculado, nunca dispara un cómputo", () => {
    const nodeId = symbolNodeId("a.rb", ["X"]);
    const metrics = new Map([["pagerank", new Map([[nodeId, 0.42]])]]);
    const index = buildNeighborhoodIndex(null, [], metrics);
    const n = neighborhoodFor(index, fakeFinding());
    expect(n.metric({ file: "a.rb", symbolPath: ["X"] }, "pagerank")).toBe(0.42);
    expect(n.metric({ file: "a.rb", symbolPath: ["X"] }, "other-metric")).toBeUndefined();
  });
});
