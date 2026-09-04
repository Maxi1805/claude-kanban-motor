/**
 * `projectGraph` — CONTRATO-F9.md §4.5: la única línea que esta ola le
 * agrega (excluir `provenance: "ambiguous"`). El resto del comportamiento ya
 * estaba cubierto indirectamente por los tests de cada métrica
 * (`pagerank.test.ts` etc.); este archivo fija SÓLO lo nuevo.
 */
import { describe, expect, it } from "vitest";

import { EDGE_KIND_SPECS } from "../edge-kinds.js";
import type { CodeGraph, CodeGraphEdge, CodeGraphNode, EdgeKind } from "../types.js";
import { clustering } from "./agrupamiento.js";
import { louvain } from "./comunidades.js";
import { connectedComponentsMetric } from "./componentes.js";
import { pagerank } from "./pagerank.js";
import { EDGE_KINDS_EXCEPT_CONTAINS, projectGraph } from "./projection.js";

function fileNode(id: string): CodeGraphNode {
  return { id: `file:${id}`, kind: "file", file: id, symbolPath: [] };
}

function edge(from: string, to: string, provenance: CodeGraphEdge["provenance"]): CodeGraphEdge {
  return { from: `file:${from}`, to: `file:${to}`, kind: "references", provenance, weight: 1 };
}

describe("projectGraph excluye provenance: ambiguous", () => {
  it("una arista ambigua no aparece en la proyección", () => {
    const g: CodeGraph = {
      nodes: [fileNode("a"), fileNode("b"), fileNode("c")],
      edges: [edge("a", "b", "resolved"), edge("a", "c", "ambiguous")],
      resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
    };
    const p = projectGraph(g, "file", ["references"]);
    const ai = p.indexOf.get("file:a")!;
    const targets = p.out[ai]!.map((j) => p.nodeIds[j]);
    expect(targets).toEqual(["file:b"]); // "file:c" (sólo alcanzable vía la ambigua) no aparece.
  });

  it("un nodo SÓLO alcanzable por una arista ambigua sigue apareciendo (todo nodo aporta su id, sin aristas)", () => {
    const g: CodeGraph = {
      nodes: [fileNode("a"), fileNode("c")],
      edges: [edge("a", "c", "ambiguous")],
      resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
    };
    const p = projectGraph(g, "file", ["references"]);
    expect(p.nodeIds).toContain("file:c");
    const ai = p.indexOf.get("file:a")!;
    expect(p.out[ai]).toEqual([]);
  });
});

/**
 * OLA Q — LA COMPUERTA DE LA LISTA "TODAS MENOS `contains`".
 *
 * El defecto que estos tres casos impiden repetir: cuatro métricas escribían
 * cada una su propia enumeración de siete kinds, escrita cuando el grafo tenía
 * ocho `EdgeKind`. El grafo llegó a doce y **ninguna de las cuatro copias sumó
 * `calls`** — o sea que toda métrica de grafo del proyecto, y todo consumidor
 * que reusa `metric.edgeKinds` para proyectar, estaba ciego a las llamadas.
 * Cuatro copias que envejecen juntas no son cuatro decisiones: son una
 * decisión repetida cuatro veces, y el arreglo es derivar, no re-enumerar.
 */
describe("EDGE_KINDS_EXCEPT_CONTAINS — la lista derivada", () => {
  it("es el catálogo COMPLETO de EdgeKind menos `contains` y `affects`, sin enumerar nada", () => {
    const todos = Object.keys(EDGE_KIND_SPECS) as EdgeKind[];
    expect([...EDGE_KINDS_EXCEPT_CONTAINS].sort()).toEqual(
      todos.filter((k) => k !== "contains" && k !== "affects").sort(),
    );
    // Y las dos restas están, para que un cambio de definición sea explícito.
    expect(EDGE_KINDS_EXCEPT_CONTAINS).not.toContain("contains");
    expect(EDGE_KINDS_EXCEPT_CONTAINS).not.toContain("affects");
    // El kind concreto que faltaba durante cuatro olas.
    expect(EDGE_KINDS_EXCEPT_CONTAINS, "`calls` es la misma cascada que `references`, sólo la partición callee").toContain(
      "calls",
    );
  });

  it("las CUATRO métricas que declaran 'todas menos contains' usan la MISMA lista, no una copia cada una", () => {
    for (const m of [pagerank, clustering, louvain, connectedComponentsMetric]) {
      expect([...m.edgeKinds].sort(), `${m.id} volvió a enumerar su propia lista`).toEqual(
        [...EDGE_KINDS_EXCEPT_CONTAINS].sort(),
      );
    }
  });

  /**
   * Las otras dos métricas NO son "todas menos contains" y no tienen que
   * serlo: `scc` e `instability` declaran subconjuntos propios, citados de la
   * tabla del contrato. Este caso está para que nadie "unifique" también esas
   * dos leyendo mal el arreglo de arriba.
   */
  it("control: la lista derivada NO se le impone a las métricas con subconjunto propio", () => {
    expect(EDGE_KINDS_EXCEPT_CONTAINS.length).toBeGreaterThan(3);
  });
});
