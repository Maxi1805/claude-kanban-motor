/**
 * Test de `louvain` — ver el docstring de `comunidades.ts`. Fixtures a nivel
 * `module`: cada "módulo" es una carpeta con un archivo adentro, igual forma
 * que `graph/build.ts` produce sobre un repo real (`folder:` conteniendo
 * `file:`), para que `projectGraph(g, "module", …)` (`projection.ts`)
 * agrupe por carpeta tal como lo haría en producción.
 */
import { describe, expect, it } from "vitest";

import { fileNodeId, folderNodeId, symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type EdgeKind } from "../types.js";
import type { ResolutionStats } from "../stages.js";
import { projectGraph } from "./projection.js";
import { louvain } from "./comunidades.js";
import type { MetricBudget, ProjectedGraph } from "./types.js";

const EMPTY_RESOLUTION: ResolutionStats = {
  candidates: 0,
  resolved: 0,
  droppedAmbiguous: 0,
  unresolved: 0,
  byStage: [],
};

function folderNode(folder: string): CodeGraphNode {
  return { id: folderNodeId(folder), kind: "folder", file: folder, symbolPath: [] };
}
function fileNode(file: string): CodeGraphNode {
  return { id: fileNodeId(file), kind: "file", file, symbolPath: [] };
}
function symNode(file: string, symbolPath: readonly string[]): CodeGraphNode {
  return { id: symbolNodeId(file, symbolPath), kind: "symbol", file, symbolPath };
}
function edge(from: string, to: string, kind: EdgeKind, weight = 1): CodeGraphEdge {
  return { from, to, kind, provenance: "resolved", weight };
}
function graphOf(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): CodeGraph {
  return { nodes, edges, resolution: EMPTY_RESOLUTION };
}

const NEVER_EXPIRES: MetricBudget = { maxMs: Infinity, expired: () => false };
const ALWAYS_EXPIRED: MetricBudget = { maxMs: 0, expired: () => true };

describe("louvain — forma declarada", () => {
  it("congelada por CONTRATO-F4.md §3.1", () => {
    expect(louvain.id).toBe("louvain");
    expect(louvain.projection).toBe("module");
    expect(louvain.cost).toBe("iterativo");
    expect(louvain.edgeKinds).not.toContain("contains");
    expect(louvain.edgeKinds).toContain("references");
    expect(louvain.edgeKinds.length).toBeGreaterThan(0);
  });

  it("no-aplicable si la proyección no es 'module'", () => {
    const empty: ProjectedGraph = {
      projection: "file",
      nodeIds: [],
      indexOf: new Map(),
      out: [],
      weight: [],
      topologyHash: "x",
    };
    const r = louvain.compute(empty, { budget: NEVER_EXPIRES });
    expect(r.status).toBe("no-aplicable");
    expect(r.values).toBeUndefined();
  });

  it("grafo vacío: computed con mapa vacío", () => {
    const p = projectGraph(graphOf([], []), "module", ["references"]);
    const r = louvain.compute(p, { budget: NEVER_EXPIRES });
    expect(r.status).toBe("computed");
    expect(r.values?.size).toBe(0);
  });

  it("un solo módulo aislado: una comunidad de un solo miembro", () => {
    const g = graphOf([folderNode("solo"), fileNode("solo/a.rb")], []);
    const p = projectGraph(g, "module", ["references"]);
    const r = louvain.compute(p, { budget: NEVER_EXPIRES });
    expect(r.status).toBe("computed");
    expect(r.values?.size).toBe(1);
    expect(r.values?.get(folderNodeId("solo"))).toBe(0);
  });
});

/**
 * Fixture de dos "clústeres" de 3 módulos cada uno: dentro de cada clúster,
 * los 3 módulos se referencian entre sí densamente (peso 5 por par); entre
 * clústeres hay UNA sola arista débil (peso 1). Es la prueba mínima estándar
 * de un algoritmo de comunidades: la modularidad tiene que preferir separar
 * los dos clústeres antes que fusionarlos por ese único puente débil.
 */
function twoClusterGraph(): CodeGraph {
  const clusterA = ["a1", "a2", "a3"];
  const clusterB = ["b1", "b2", "b3"];
  const nodes: CodeGraphNode[] = [];
  for (const folder of [...clusterA, ...clusterB]) {
    nodes.push(folderNode(folder), symNode(`${folder}/f.rb`, ["M"]));
  }
  const edges: CodeGraphEdge[] = [];
  const denseWithin = (cluster: readonly string[]) => {
    for (let i = 0; i < cluster.length; i++) {
      for (let j = i + 1; j < cluster.length; j++) {
        const from = symbolNodeId(`${cluster[i]}/f.rb`, ["M"]);
        const to = symbolNodeId(`${cluster[j]}/f.rb`, ["M"]);
        edges.push(edge(from, to, "references", 5));
        edges.push(edge(to, from, "references", 5));
      }
    }
  };
  denseWithin(clusterA);
  denseWithin(clusterB);
  // el único puente entre clústeres, deliberadamente débil
  edges.push(edge(symbolNodeId("a1/f.rb", ["M"]), symbolNodeId("b1/f.rb", ["M"]), "references", 1));
  return graphOf(nodes, edges);
}

describe("louvain — separa dos clústeres densos unidos por un puente débil", () => {
  it("los 3 módulos de cada clúster caen en la MISMA comunidad, y las dos comunidades son distintas", () => {
    const p = projectGraph(twoClusterGraph(), "module", ["references"]);
    const r = louvain.compute(p, { budget: NEVER_EXPIRES });
    expect(r.status).toBe("computed");
    const values = r.values!;
    const commA = ["a1", "a2", "a3"].map((f) => values.get(folderNodeId(f)));
    const commB = ["b1", "b2", "b3"].map((f) => values.get(folderNodeId(f)));
    expect(new Set(commA).size).toBe(1);
    expect(new Set(commB).size).toBe(1);
    expect(commA[0]).not.toBe(commB[0]);
  });

  it("determinista: dos corridas sobre el mismo grafo dan exactamente la misma asignación", () => {
    const p = projectGraph(twoClusterGraph(), "module", ["references"]);
    const r1 = louvain.compute(p, { budget: NEVER_EXPIRES });
    const r2 = louvain.compute(p, { budget: NEVER_EXPIRES });
    expect([...r1.values!.entries()].sort()).toEqual([...r2.values!.entries()].sort());
  });

  it("la comunidad más grande (tie-break de tamaño) recibe el id 0", () => {
    // Le agrego un cuarto módulo al clúster A, sólo conectado a a1: A queda
    // con 4 miembros contra 3 de B, así que la comunidad de A tiene que ser
    // la id 0 (orden por tamaño descendente — ver la cola de `compute`).
    const g = twoClusterGraph();
    const nodes = [...g.nodes, folderNode("a4"), symNode("a4/f.rb", ["M"])];
    const edges = [
      ...g.edges,
      edge(symbolNodeId("a1/f.rb", ["M"]), symbolNodeId("a4/f.rb", ["M"]), "references", 5),
      edge(symbolNodeId("a4/f.rb", ["M"]), symbolNodeId("a1/f.rb", ["M"]), "references", 5),
    ];
    const p = projectGraph(graphOf(nodes, edges), "module", ["references"]);
    const r = louvain.compute(p, { budget: NEVER_EXPIRES });
    const values = r.values!;
    expect(values.get(folderNodeId("a1"))).toBe(0);
    expect(values.get(folderNodeId("a4"))).toBe(0);
  });
});

describe("louvain — presupuesto", () => {
  it("presupuesto agotado desde el inicio: 'presupuesto-agotado' y values UNDEFINED, nunca un mapa parcial", () => {
    const p = projectGraph(twoClusterGraph(), "module", ["references"]);
    const r = louvain.compute(p, { budget: ALWAYS_EXPIRED });
    expect(r.status).toBe("presupuesto-agotado");
    expect(r.values).toBeUndefined();
    expect(r.reason).toBeDefined();
  });
});
