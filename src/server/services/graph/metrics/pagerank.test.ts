/**
 * Test de `pagerank` — ver el docstring de `pagerank.ts`. También cubre
 * `projectGraph` (`projection.ts`), que es la infraestructura compartida
 * mínima que esta tarea tuvo que crear (ver la nota de proceso en
 * `types.ts`) para poder alimentar la métrica con un `ProjectedGraph` real.
 */
import { describe, expect, it } from "vitest";

import { fileNodeId, folderNodeId, symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type EdgeKind } from "../types.js";
import type { ResolutionStats } from "../stages.js";
import { projectGraph } from "./projection.js";
import { pagerank } from "./pagerank.js";
import type { MetricBudget, ProjectedGraph } from "./types.js";

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

describe("projectGraph", () => {
  it("colapsa símbolos a su archivo en proyección 'file' y descarta auto-aristas", () => {
    const a = symNode("a.rb", ["A", "m1"]);
    const a2 = symNode("a.rb", ["A", "m2"]);
    const b = symNode("b.rb", ["B", "n"]);
    const g = graphOf(
      [a, a2, b],
      [
        edge(a.id, a2.id, "references"), // mismo archivo -> auto-arista tras proyectar, se descarta
        edge(a.id, b.id, "references"),
      ],
    );
    const p = projectGraph(g, "file", ["references"]);
    expect(p.nodeIds).toEqual([fileNodeId("a.rb"), fileNodeId("b.rb")].sort());
    const ia = p.indexOf.get(fileNodeId("a.rb"))!;
    const ib = p.indexOf.get(fileNodeId("b.rb"))!;
    expect(p.out[ia]).toEqual([ib]);
    expect(p.out[ib]).toEqual([]);
  });

  it("conserva nodos aislados (sin aristas) en el índice denso", () => {
    const g = graphOf([fileNode("solo.rb")], []);
    const p = projectGraph(g, "file", ["references"]);
    expect(p.nodeIds).toEqual([fileNodeId("solo.rb")]);
    expect(p.out[0]).toEqual([]);
  });

  it("agrega el peso de aristas paralelas colapsadas al mismo par proyectado", () => {
    const a1 = symNode("a.rb", ["m1"]);
    const a2 = symNode("a.rb", ["m2"]);
    const b = symNode("b.rb", ["n"]);
    const g = graphOf(
      [a1, a2, b],
      [edge(a1.id, b.id, "references", 2), edge(a2.id, b.id, "references", 3)],
    );
    const p = projectGraph(g, "file", ["references"]);
    const ia = p.indexOf.get(fileNodeId("a.rb"))!;
    const ib = p.indexOf.get(fileNodeId("b.rb"))!;
    expect(p.out[ia]).toEqual([ib]);
    expect(p.weight[ia]).toEqual([5]);
  });

  it("filtra por `kinds`: una arista `contains` no pasa si se pide sólo `references`", () => {
    const folder = { id: folderNodeId("src"), kind: "folder" as const, file: "src", symbolPath: [] };
    const file = fileNode("src/a.rb");
    const g = graphOf([folder, file], [edge(folder.id, file.id, "contains")]);
    const p = projectGraph(g, "file", ["references"]);
    // El único nodo `file:` es `src/a.rb`; la arista `contains` no se proyectó.
    expect(p.out.every((row) => row.length === 0)).toBe(true);
  });

  it("topologyHash es determinístico y cambia si cambia el peso de una arista", () => {
    const a = fileNode("a.rb");
    const b = fileNode("b.rb");
    const g1 = graphOf([a, b], [edge(a.id, b.id, "references", 1)]);
    const g2 = graphOf([a, b], [edge(a.id, b.id, "references", 1)]);
    const g3 = graphOf([a, b], [edge(a.id, b.id, "references", 2)]);
    expect(projectGraph(g1, "file", ["references"]).topologyHash).toBe(projectGraph(g2, "file", ["references"]).topologyHash);
    expect(projectGraph(g1, "file", ["references"]).topologyHash).not.toBe(projectGraph(g3, "file", ["references"]).topologyHash);
  });
});

describe("pagerank", () => {
  it("declara su forma — GraphMetric<PageRankValue> congelado por CONTRATO-F4.md §3.1", () => {
    expect(pagerank.id).toBe("pagerank");
    expect(pagerank.projection).toBe("file");
    expect(pagerank.cost).toBe("iterativo");
    expect(pagerank.edgeKinds).not.toContain("contains");
    expect(pagerank.edgeKinds.length).toBeGreaterThan(0);
  });

  it("no-aplicable si la proyección no es 'file'", () => {
    const empty: ProjectedGraph = {
      projection: "module",
      nodeIds: [],
      indexOf: new Map(),
      out: [],
      weight: [],
      topologyHash: "x",
    };
    const r = pagerank.compute(empty, { budget: NEVER_EXPIRES });
    expect(r.status).toBe("no-aplicable");
    expect(r.values).toBeUndefined();
  });

  it("grafo vacío: computed con mapa vacío", () => {
    const p = projectGraph(graphOf([], []), "file", ["references"]);
    const r = pagerank.compute(p, { budget: NEVER_EXPIRES });
    expect(r.status).toBe("computed");
    expect(r.values?.size).toBe(0);
  });

  it("ciclo simétrico de 2 nodos converge exactamente a 1/n cada uno", () => {
    const a = fileNode("a.rb");
    const b = fileNode("b.rb");
    const g = graphOf([a, b], [edge(a.id, b.id, "references"), edge(b.id, a.id, "references")]);
    const p = projectGraph(g, "file", ["references"]);
    const r = pagerank.compute(p, { budget: NEVER_EXPIRES });
    expect(r.status).toBe("computed");
    const va = r.values!.get(fileNodeId("a.rb"))!;
    const vb = r.values!.get(fileNodeId("b.rb"))!;
    expect(va.pagerank).toBeCloseTo(0.5, 9);
    expect(vb.pagerank).toBeCloseTo(0.5, 9);
    expect(va.fanIn).toBe(1);
    expect(va.fanOut).toBe(1);
  });

  it("un hub referenciado por varios nodos tiene el pagerank y el fan-in más altos", () => {
    const hub = fileNode("hub.rb");
    const leaves = ["a.rb", "b.rb", "c.rb"].map(fileNode);
    const g = graphOf(
      [hub, ...leaves],
      leaves.map((leaf) => edge(leaf.id, hub.id, "references")),
    );
    const p = projectGraph(g, "file", ["references"]);
    const r = pagerank.compute(p, { budget: NEVER_EXPIRES });
    expect(r.status).toBe("computed");
    const values = r.values!;
    const hubValue = values.get(fileNodeId("hub.rb"))!;
    expect(hubValue.fanIn).toBe(3);
    expect(hubValue.fanOut).toBe(0); // dangling: no referencia a nadie
    for (const leaf of leaves) {
      const v = values.get(fileNodeId(leaf.file))!;
      expect(hubValue.pagerank).toBeGreaterThan(v.pagerank);
      expect(v.fanIn).toBe(0);
      expect(v.fanOut).toBe(1);
    }
    // simetría entre las hojas: mismo pagerank entre sí
    const leafRanks = leaves.map((leaf) => values.get(fileNodeId(leaf.file))!.pagerank);
    expect(leafRanks[0]).toBeCloseTo(leafRanks[1]!, 9);
    expect(leafRanks[1]).toBeCloseTo(leafRanks[2]!, 9);
  });

  it("nodo dangling (fan-out cero): su masa se redistribuye, la suma total de pagerank sigue ~1", () => {
    const hub = fileNode("hub.rb");
    const leaves = ["a.rb", "b.rb"].map(fileNode);
    const g = graphOf(
      [hub, ...leaves],
      leaves.map((leaf) => edge(leaf.id, hub.id, "references")),
    );
    const p = projectGraph(g, "file", ["references"]);
    const r = pagerank.compute(p, { budget: NEVER_EXPIRES });
    let total = 0;
    for (const v of r.values!.values()) total += v.pagerank;
    expect(total).toBeCloseTo(1, 6);
  });

  it("respeta el peso de la arista: un vecino con arista más pesada recibe proporcionalmente más rango", () => {
    const source = fileNode("src.rb");
    const heavy = fileNode("heavy.rb");
    const light = fileNode("light.rb");
    const g = graphOf(
      [source, heavy, light],
      [edge(source.id, heavy.id, "references", 9), edge(source.id, light.id, "references", 1)],
    );
    const p = projectGraph(g, "file", ["references"]);
    const r = pagerank.compute(p, { budget: NEVER_EXPIRES });
    const vHeavy = r.values!.get(fileNodeId("heavy.rb"))!;
    const vLight = r.values!.get(fileNodeId("light.rb"))!;
    expect(vHeavy.pagerank).toBeGreaterThan(vLight.pagerank);
  });

  it("presupuesto agotado: status 'presupuesto-agotado' y values UNDEFINED, nunca un mapa parcial", () => {
    // Grafo asimétrico que NO converge en la primera iteración (a diferencia
    // del ciclo de 2 nodos de arriba), para que el chequeo de presupuesto
    // (que corre DESPUÉS de la primera iteración) tenga oportunidad real de
    // cortar antes de la convergencia.
    const hub = fileNode("hub.rb");
    const leaves = ["a.rb", "b.rb", "c.rb", "d.rb"].map(fileNode);
    const g = graphOf(
      [hub, ...leaves],
      leaves.map((leaf) => edge(leaf.id, hub.id, "references")),
    );
    const p = projectGraph(g, "file", ["references"]);
    const r = pagerank.compute(p, { budget: ALWAYS_EXPIRED });
    expect(r.status).toBe("presupuesto-agotado");
    expect(r.values).toBeUndefined();
    expect(r.reason).toBeDefined();
  });
});
