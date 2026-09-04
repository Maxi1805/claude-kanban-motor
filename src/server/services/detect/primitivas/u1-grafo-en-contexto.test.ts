import { describe, expect, it } from "vitest";

import type { CodeGraph, CodeGraphEdge, CodeGraphNode } from "../../graph/types.js";
import { pisoDeclarado, resolveThreshold } from "../thresholds.js";
import type { RunContext } from "../types.js";
import { buildGraphIndex, withGraph } from "./u1-grafo-en-contexto.js";

function node(id: string): CodeGraphNode {
  return { id, kind: "symbol", label: id, file: "a.ts", symbolPath: [id], family: "function-like" } as unknown as CodeGraphNode;
}

function edge(from: string, to: string, kind: CodeGraphEdge["kind"]): CodeGraphEdge {
  return { from, to, kind, weight: 1, provenance: "resolved" } as unknown as CodeGraphEdge;
}

function graphOf(nodes: CodeGraphNode[], edges: CodeGraphEdge[]): CodeGraph {
  return { nodes, edges, resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] } };
}

function baseCtx(): RunContext<"min"> {
  return {
    language: "typescript",
    capabilities: new Set(),
    threshold: () =>
      resolveThreshold(pisoDeclarado(1, { rationale: "test" }), {
        language: "typescript",
        sampleSize: () => 0,
        corpusP95: () => null,
      }),
  };
}

describe("buildGraphIndex", () => {
  it("responde nodo por id, y `null` para uno que no existe", () => {
    const index = buildGraphIndex(graphOf([node("a"), node("b")], []));
    expect(index.nodeById("a")?.id).toBe("a");
    expect(index.nodeById("z")).toBeNull();
  });

  it("responde aristas salientes y entrantes del mismo grafo", () => {
    const index = buildGraphIndex(graphOf([node("a"), node("b"), node("c")], [edge("a", "b", "references"), edge("c", "b", "references")]));
    expect(index.edgesFrom("a").map((e) => e.to)).toEqual(["b"]);
    expect(index.edgesFrom("b")).toEqual([]);
    expect(index.edgesTo?.("b").map((e) => e.from)).toEqual(["a", "c"]);
    expect(index.edgesTo?.("a")).toEqual([]);
  });

  it("no aloca un arreglo nuevo por consulta vacía (misma instancia)", () => {
    const index = buildGraphIndex(graphOf([node("a")], []));
    expect(index.edgesFrom("a")).toBe(index.edgesFrom("zzz"));
  });

  it("ante ids de nodo duplicados gana el PRIMERO — el mismo criterio que `buildNeighborhoodIndex`", () => {
    const primero = node("a");
    const segundo = { ...node("a"), label: "otro" } as CodeGraphNode;
    const index = buildGraphIndex(graphOf([primero, segundo], []));
    expect(index.nodeById("a")).toBe(primero);
  });

  it("un grafo vacío responde sin lanzar", () => {
    const index = buildGraphIndex(graphOf([], []));
    expect(index.nodeById("a")).toBeNull();
    expect(index.edgesFrom("a")).toEqual([]);
  });
});

describe("withGraph", () => {
  it("agrega grafo e índice a un `RunContext` sin tocar lo demás", () => {
    const graph = graphOf([node("a")], []);
    const ctx = withGraph(baseCtx(), graph);
    expect(ctx.language).toBe("typescript");
    expect(ctx.threshold("min").value).toBe(1);
    expect(ctx.graph).toBe(graph);
    expect(ctx.graphIndex?.()?.nodeById("a")?.id).toBe("a");
  });

  it("construye el índice UNA sola vez, perezosamente", () => {
    const ctx = withGraph(baseCtx(), graphOf([node("a")], []));
    expect(ctx.graphIndex?.()).toBe(ctx.graphIndex?.());
  });

  it("con `null` deja el contexto como lo da la pasada 1: sin grafo y sin índice", () => {
    const ctx = withGraph(baseCtx(), null);
    expect(ctx.graph).toBeNull();
    expect(ctx.graphIndex?.()).toBeNull();
  });
});
