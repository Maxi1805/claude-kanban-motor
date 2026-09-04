/**
 * `connected-components` — CONTRATO-F4.md §3.1.
 *
 * Dos niveles de prueba, a propósito:
 *  1. El algoritmo puro (`computeConnectedComponents`) sobre `ProjectedGraph`
 *     armados a mano — no depende de `projectGraph`, así que exigen sólo la
 *     forma que el contrato congela (§3.1), no la implementación de un
 *     archivo ajeno.
 *  2. Un extremo a extremo con el `projectGraph`/`CodeGraph` REALES
 *     (`./projection.js`/`../build.js`), para probar la integración tal como
 *     un consumidor de producción la vería: `contains` NO conecta,
 *     `references` sí, y el sentido de la arista no importa (no dirigida).
 */
import { describe, expect, it } from "vitest";

import type { CodeGraph, CodeGraphEdge, CodeGraphNode } from "../types.js";
import { fileNodeId, folderNodeId, symbolNodeId } from "../types.js";
import { connectedComponentsMetric, computeConnectedComponents } from "./componentes.js";
import { projectGraph } from "./projection.js";
import type { MetricBudget, ProjectedGraph } from "./types.js";

function neverExpiredBudget(maxMs = 30): MetricBudget {
  return { maxMs, expired: () => false };
}
function alreadyExpiredBudget(maxMs = 30): MetricBudget {
  return { maxMs, expired: () => true };
}
/** Pasa el chequeo de entrada (1ª llamada) y se agota recién en el chequeo periódico de adentro del loop. */
function expiresAfterFirstCheck(maxMs = 30): MetricBudget {
  let calls = 0;
  return {
    maxMs,
    expired: () => {
      calls++;
      return calls > 1;
    },
  };
}

function projected(nodeIds: string[], edges: [number, number, number][]): ProjectedGraph {
  const out: number[][] = nodeIds.map(() => []);
  const weight: number[][] = nodeIds.map(() => []);
  for (const [from, to, w] of edges) {
    out[from]!.push(to);
    weight[from]!.push(w);
  }
  const indexOf = new Map(nodeIds.map((id, i) => [id, i]));
  return { projection: "file", nodeIds, indexOf, out, weight, topologyHash: "test" };
}

describe("connectedComponentsMetric — metadata (CONTRATO-F4.md §3.1)", () => {
  it("declara id, proyección file, costo lineal y excluye 'contains' de sus aristas", () => {
    expect(connectedComponentsMetric.id).toBe("connected-components");
    expect(connectedComponentsMetric.projection).toBe("file");
    expect(connectedComponentsMetric.cost).toBe("lineal");
    expect(connectedComponentsMetric.edgeKinds).not.toContain("contains");
    expect(connectedComponentsMetric.edgeKinds).toContain("references");
  });
});

describe("computeConnectedComponents — algoritmo puro", () => {
  it("grafo vacío ⇒ computed con un Map vacío, no undefined", () => {
    const g = projected([], []);
    const r = computeConnectedComponents(g, { budget: neverExpiredBudget() });
    expect(r.status).toBe("computed");
    expect(r.values).toBeDefined();
    expect(r.values!.size).toBe(0);
  });

  it("un archivo sin ninguna arista es su propia componente (singleton)", () => {
    const g = projected(["a", "b", "c"], [[0, 1, 1]]); // a->b; c aislado
    const r = computeConnectedComponents(g, { budget: neverExpiredBudget() });
    expect(r.status).toBe("computed");
    const values = r.values!;
    expect(values.get("a")).toBe(values.get("b"));
    expect(values.get("c")).not.toBe(values.get("a"));
    // Representante = el nodeId lexicográficamente MENOR de la componente.
    expect(values.get("a")).toBe("a");
    expect(values.get("c")).toBe("c");
  });

  it("NO dirigida: una arista A→B basta para unir sin importar el sentido, y es transitiva", () => {
    // a -> b, c -> b: A, B, C deben terminar en la MISMA componente aunque
    // no exista ninguna arista directa entre A y C.
    const g = projected(["a", "b", "c", "d"], [
      [0, 1, 1], // a -> b
      [2, 1, 1], // c -> b
    ]);
    const r = computeConnectedComponents(g, { budget: neverExpiredBudget() });
    const values = r.values!;
    expect(values.get("a")).toBe(values.get("b"));
    expect(values.get("b")).toBe(values.get("c"));
    expect(values.get("d")).not.toBe(values.get("a")); // d aislado
  });

  it("la distribución (reason) reporta nodos, nº de componentes, mayor componente y aislados", () => {
    const g = projected(["a", "b", "c"], [[0, 1, 1]]);
    const r = computeConnectedComponents(g, { budget: neverExpiredBudget() });
    expect(r.reason).toMatch(/3 nodos, 2 componentes/);
    expect(r.reason).toMatch(/mayor=2 nodos/);
    expect(r.reason).toMatch(/1 archivos sin ninguna arista/);
  });

  it("presupuesto YA agotado al entrar ⇒ 'presupuesto-agotado' sin procesar nada, con values undefined", () => {
    const g = projected(["a", "b", "c", "d", "e"], [
      [0, 1, 1],
      [1, 2, 1],
      [2, 3, 1],
      [3, 4, 1],
    ]);
    const r = computeConnectedComponents(g, { budget: alreadyExpiredBudget() });
    expect(r.status).toBe("presupuesto-agotado");
    expect(r.values).toBeUndefined();
    expect(r.reason).toMatch(/presupuesto/);
  });

  it("presupuesto agotado A MITAD del loop (chequeo periódico, no por nodo) ⇒ bail parcial, values undefined", () => {
    // Cadena de 5000 nodos (4999 aristas): supera CLOCK_CHECK_INTERVAL (4096)
    // de sobra, así que el chequeo PERIÓDICO de adentro del loop —no el de
    // entrada— es el que dispara. `values` sigue siendo undefined pese a que
    // el Union-Find ya tiene trabajo hecho: NUNCA un mapa parcial.
    const n = 5000;
    const ids = Array.from({ length: n }, (_, i) => String(i).padStart(5, "0"));
    const edges: [number, number, number][] = Array.from({ length: n - 1 }, (_, i) => [i, i + 1, 1]);
    const g = projected(ids, edges);
    const r = computeConnectedComponents(g, { budget: expiresAfterFirstCheck() });
    expect(r.status).toBe("presupuesto-agotado");
    expect(r.values).toBeUndefined();
    expect(r.reason).toMatch(/\d+\/4999 aristas/);
  });

  it("proyección distinta de 'file' ⇒ no-aplicable, nunca un mapa calculado igual", () => {
    const g: ProjectedGraph = { ...projected(["a", "b"], [[0, 1, 1]]), projection: "module" };
    const r = computeConnectedComponents(g, { budget: neverExpiredBudget() });
    expect(r.status).toBe("no-aplicable");
    expect(r.values).toBeUndefined();
  });
});

describe("integración con projectGraph/CodeGraph reales", () => {
  function node(partial: Partial<CodeGraphNode> & Pick<CodeGraphNode, "id" | "kind" | "file">): CodeGraphNode {
    return { symbolPath: [], ...partial };
  }
  function edge(from: string, to: string, kind: CodeGraphEdge["kind"], weight = 1): CodeGraphEdge {
    return { from, to, kind, provenance: kind === "contains" ? "declared" : "resolved", weight };
  }
  const EMPTY_STATS = { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] };

  it("dos archivos unidos SOLO por 'contains' (misma carpeta) no quedan en la misma componente", () => {
    // a.rb y b.rb viven bajo la misma carpeta ("src") pero no se referencian
    // entre sí — connected-components excluye "contains" a propósito
    // (CONTRATO-F4.md §3.1: "aristas todas menos contains").
    const graph: CodeGraph = {
      nodes: [
        node({ id: folderNodeId("src"), kind: "folder", file: "src" }),
        node({ id: fileNodeId("src/a.rb"), kind: "file", file: "src/a.rb" }),
        node({ id: fileNodeId("src/b.rb"), kind: "file", file: "src/b.rb" }),
      ],
      edges: [edge(folderNodeId("src"), fileNodeId("src/a.rb"), "contains"), edge(folderNodeId("src"), fileNodeId("src/b.rb"), "contains")],
      resolution: EMPTY_STATS,
    };
    const projectedGraph = projectGraph(graph, "file", connectedComponentsMetric.edgeKinds);
    const r = computeConnectedComponents(projectedGraph, { budget: neverExpiredBudget() });
    const values = r.values!;
    expect(values.get(fileNodeId("src/a.rb"))).not.toBe(values.get(fileNodeId("src/b.rb")));
  });

  it("una arista 'references' entre símbolos de dos archivos DISTINTOS los une a nivel archivo", () => {
    const symA = symbolNodeId("src/a.rb", ["Foo"]);
    const symB = symbolNodeId("src/b.rb", ["Bar"]);
    const graph: CodeGraph = {
      nodes: [
        node({ id: fileNodeId("src/a.rb"), kind: "file", file: "src/a.rb" }),
        node({ id: fileNodeId("src/b.rb"), kind: "file", file: "src/b.rb" }),
        node({ id: symA, kind: "symbol", file: "src/a.rb", symbolPath: ["Foo"] }),
        node({ id: symB, kind: "symbol", file: "src/b.rb", symbolPath: ["Bar"] }),
      ],
      edges: [
        edge(fileNodeId("src/a.rb"), symA, "contains"),
        edge(fileNodeId("src/b.rb"), symB, "contains"),
        edge(symA, symB, "references"),
      ],
      resolution: EMPTY_STATS,
    };
    const projectedGraph = projectGraph(graph, "file", connectedComponentsMetric.edgeKinds);
    const r = computeConnectedComponents(projectedGraph, { budget: neverExpiredBudget() });
    const values = r.values!;
    expect(values.get(fileNodeId("src/a.rb"))).toBe(values.get(fileNodeId("src/b.rb")));
  });
});
