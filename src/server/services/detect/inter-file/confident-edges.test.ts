import { describe, expect, it } from "vitest";

import { confidentEdges } from "./confident-edges.js";
import { fileNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type Provenance } from "../../graph/types.js";

function fileNode(file: string): CodeGraphNode {
  return { id: fileNodeId(file), kind: "file", file, symbolPath: [] };
}

function edge(from: string, to: string, provenance: Provenance): CodeGraphEdge {
  return { from: fileNodeId(from), to: fileNodeId(to), kind: "references", provenance, weight: 1 };
}

function graphOf(files: readonly string[], edges: readonly CodeGraphEdge[]): CodeGraph {
  return {
    nodes: files.map(fileNode),
    edges,
    resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
  };
}

describe("confidentEdges", () => {
  it("excluye sólo provenance ambiguous, conserva declared/resolved/inferred", () => {
    const graph = graphOf(
      ["a.ts", "b.ts"],
      [edge("a.ts", "b.ts", "declared"), edge("a.ts", "b.ts", "resolved"), edge("a.ts", "b.ts", "inferred"), edge("a.ts", "b.ts", "ambiguous")],
    );
    const result = confidentEdges(graph);
    expect(result).toHaveLength(3);
    expect(result.every((e) => e.provenance !== "ambiguous")).toBe(true);
  });

  it("grafo sin aristas ambiguas: devuelve el mismo conjunto (por valor)", () => {
    const graph = graphOf(["a.ts", "b.ts"], [edge("a.ts", "b.ts", "declared")]);
    expect(confidentEdges(graph)).toEqual(graph.edges);
  });

  it("grafo sin aristas: array vacío, no lanza", () => {
    const graph = graphOf(["a.ts"], []);
    expect(confidentEdges(graph)).toEqual([]);
  });

  /* ── OLA V — la memoización por identidad del arreglo de aristas ──────────
   * No mide tiempo (no es un test de rendimiento): fija las DOS propiedades de
   * las que depende que memoizar sea CORRECTO, para que una ola futura que
   * cambie la clave lo rompa acá y no en el corpus.
   */
  it("memoiza: dos llamadas con el MISMO arreglo de aristas devuelven la MISMA referencia", () => {
    const edges = [edge("a.ts", "b.ts", "declared"), edge("a.ts", "b.ts", "ambiguous")];
    const graph = graphOf(["a.ts", "b.ts"], edges);
    const primera = confidentEdges(graph);
    expect(confidentEdges(graph)).toBe(primera);
    // Otro `CodeGraph` que comparte el MISMO arreglo de aristas es, para esta
    // función pura, la misma pregunta: la clave es `graph.edges`, no `graph`.
    expect(confidentEdges({ ...graph, nodes: [...graph.nodes] })).toBe(primera);
  });

  it("no memoiza de más: un arreglo de aristas DISTINTO se recalcula", () => {
    const g1 = graphOf(["a.ts", "b.ts"], [edge("a.ts", "b.ts", "declared"), edge("a.ts", "b.ts", "ambiguous")]);
    const g2 = graphOf(["a.ts", "b.ts"], [edge("a.ts", "b.ts", "ambiguous"), edge("a.ts", "b.ts", "ambiguous")]);
    expect(confidentEdges(g1)).toHaveLength(1);
    expect(confidentEdges(g2)).toHaveLength(0);
  });
});
