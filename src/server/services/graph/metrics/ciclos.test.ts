/**
 * Test de `scc` (id `scc`, "ciclos de dependencia") — ver el docstring de
 * `ciclos.ts`. Mismo patrón de fixtures que `pagerank.test.ts`: `CodeGraph`
 * sintético de sólo datos, sin tree-sitter — no hace falta parsear nada
 * para probar Tarjan sobre `ProjectedGraph`.
 */
import { describe, expect, it } from "vitest";

import type { ResolutionStats } from "../stages.js";
import { fileNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type EdgeKind } from "../types.js";
import { scc, type DependencyCycle } from "./ciclos.js";
import { projectGraph } from "./projection.js";
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
function edge(from: string, to: string, kind: EdgeKind = "references", weight = 1): CodeGraphEdge {
  return { from, to, kind, provenance: "resolved", weight };
}
function graphOf(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): CodeGraph {
  return { nodes, edges, resolution: EMPTY_RESOLUTION };
}
function project(g: CodeGraph): ProjectedGraph {
  return projectGraph(g, "file", scc.edgeKinds);
}

const NEVER_EXPIRES: MetricBudget = { maxMs: Infinity, expired: () => false };
const ALWAYS_EXPIRED: MetricBudget = { maxMs: 0, expired: () => true };

describe("scc", () => {
  it("declara su forma — GraphMetric<DependencyCycle> congelado por CONTRATO-F4.md §3.1, fila 'scc'", () => {
    expect(scc.id).toBe("scc");
    expect(scc.projection).toBe("file");
    expect(scc.cost).toBe("lineal");
    expect(scc.edgeKinds).toEqual(["imports", "extends", "references"]);
    expect(scc.edgeKinds).not.toContain("contains");
  });

  it("no-aplicable si la proyección no es 'file'", () => {
    const notFile: ProjectedGraph = {
      projection: "module",
      nodeIds: [],
      indexOf: new Map(),
      out: [],
      weight: [],
      topologyHash: "x",
    };
    const r = scc.compute(notFile, { budget: NEVER_EXPIRES });
    expect(r.status).toBe("no-aplicable");
    expect(r.values).toBeUndefined();
  });

  it("grafo vacío: computed con mapa vacío", () => {
    const r = scc.compute(project(graphOf([], [])), { budget: NEVER_EXPIRES });
    expect(r.status).toBe("computed");
    expect(r.values?.size).toBe(0);
  });

  it("sin aristas de ida y vuelta no hay ciclo (cadena a -> b -> c)", () => {
    const [a, b, c] = ["a.rb", "b.rb", "c.rb"].map(fileNode) as [CodeGraphNode, CodeGraphNode, CodeGraphNode];
    const g = graphOf([a, b, c], [edge(a.id, b.id), edge(b.id, c.id)]);
    const r = scc.compute(project(g), { budget: NEVER_EXPIRES });
    expect(r.status).toBe("computed");
    expect(r.values?.size).toBe(0);
  });

  it("un self-loop (a -> a) NO cuenta como ciclo: SCC de tamaño 1, Arcan exige >= 2", () => {
    const a = fileNode("a.rb");
    const g = graphOf([a], [edge(a.id, a.id)]);
    const r = scc.compute(project(g), { budget: NEVER_EXPIRES });
    expect(r.status).toBe("computed");
    expect(r.values?.size).toBe(0);
  });

  it("ciclo de 2 archivos en la MISMA carpeta: crossesFolderBoundary=false, size=2", () => {
    const a = fileNode("pkg/a.rb");
    const b = fileNode("pkg/b.rb");
    const g = graphOf([a, b], [edge(a.id, b.id), edge(b.id, a.id)]);
    const r = scc.compute(project(g), { budget: NEVER_EXPIRES });
    expect(r.status).toBe("computed");
    const va = r.values!.get(fileNodeId("pkg/a.rb"))!;
    const vb = r.values!.get(fileNodeId("pkg/b.rb"))!;
    expect(va).toEqual(vb); // mismo objeto de ciclo pegado a ambos miembros
    expect(va.size).toBe(2);
    expect(va.members).toEqual([fileNodeId("pkg/a.rb"), fileNodeId("pkg/b.rb")].sort());
    expect(va.crossesFolderBoundary).toBe(false);
    expect(va.cycleId).toBe(va.members[0]);
  });

  it("ciclo que cruza carpetas: crossesFolderBoundary=true — la señal que distingue arquitectura rota de callbacks locales", () => {
    const a = fileNode("moduleA/a.rb");
    const b = fileNode("moduleB/b.rb");
    const g = graphOf([a, b], [edge(a.id, b.id), edge(b.id, a.id)]);
    const r = scc.compute(project(g), { budget: NEVER_EXPIRES });
    const va = r.values!.get(fileNodeId("moduleA/a.rb"))!;
    expect(va.crossesFolderBoundary).toBe(true);
  });

  it("ciclo de 3 archivos: size=3, todos comparten el mismo objeto de ciclo", () => {
    const [a, b, c] = ["a.rb", "b.rb", "c.rb"].map(fileNode) as [CodeGraphNode, CodeGraphNode, CodeGraphNode];
    const g = graphOf([a, b, c], [edge(a.id, b.id), edge(b.id, c.id), edge(c.id, a.id)]);
    const r = scc.compute(project(g), { budget: NEVER_EXPIRES });
    const values = r.values!;
    const va = values.get(fileNodeId("a.rb"))!;
    expect(va.size).toBe(3);
    expect(new Set(va.members)).toEqual(new Set(["a.rb", "b.rb", "c.rb"].map(fileNodeId)));
    for (const f of ["a.rb", "b.rb", "c.rb"]) expect(values.get(fileNodeId(f))).toEqual(va);
  });

  it("dos ciclos independientes en el mismo grafo se reportan por separado, sin mezclarse", () => {
    const [a, b] = ["a.rb", "b.rb"].map(fileNode) as [CodeGraphNode, CodeGraphNode];
    const [c, d] = ["c.rb", "d.rb"].map(fileNode) as [CodeGraphNode, CodeGraphNode];
    const bridge = fileNode("bridge.rb"); // conecta los dos ciclos sin fusionarlos (arista de un solo sentido)
    const g = graphOf(
      [a, b, c, d, bridge],
      [edge(a.id, b.id), edge(b.id, a.id), edge(c.id, d.id), edge(d.id, c.id), edge(a.id, bridge.id), edge(bridge.id, c.id)],
    );
    const r = scc.compute(project(g), { budget: NEVER_EXPIRES });
    const values = r.values!;
    expect(values.size).toBe(4); // a,b,c,d — bridge no participa de ningún ciclo
    expect(values.has(fileNodeId("bridge.rb"))).toBe(false);
    const cycleAB = values.get(fileNodeId("a.rb"))!;
    const cycleCD = values.get(fileNodeId("c.rb"))!;
    expect(cycleAB.cycleId).not.toBe(cycleCD.cycleId);
    expect(cycleAB.size).toBe(2);
    expect(cycleCD.size).toBe(2);
  });

  it("diamante (a->b, a->c, b->d, c->d) sin retro-arista: no hay ningún ciclo", () => {
    const [a, b, c, d] = ["a.rb", "b.rb", "c.rb", "d.rb"].map(fileNode) as [
      CodeGraphNode,
      CodeGraphNode,
      CodeGraphNode,
      CodeGraphNode,
    ];
    const g = graphOf([a, b, c, d], [edge(a.id, b.id), edge(a.id, c.id), edge(b.id, d.id), edge(c.id, d.id)]);
    const r = scc.compute(project(g), { budget: NEVER_EXPIRES });
    expect(r.status).toBe("computed");
    expect(r.values?.size).toBe(0);
  });

  it("presupuesto agotado sobre un ciclo grande: 'presupuesto-agotado' y values UNDEFINED, nunca un mapa parcial", () => {
    // El chequeo de presupuesto ocurre cada N visitas de nodo (nunca por
    // nodo individual, CONTRATO-F4.md §3.2): hace falta un ciclo real de
    // varios miles de archivos para que el contador interno cruce el
    // umbral de la tajada dentro de esta sola corrida de Tarjan.
    const SIZE = 5000;
    const nodes = Array.from({ length: SIZE }, (_, i) => fileNode(`f${i}.rb`));
    const edges = nodes.map((n, i) => edge(n.id, nodes[(i + 1) % SIZE]!.id));
    const g = graphOf(nodes, edges);
    const r = scc.compute(project(g), { budget: ALWAYS_EXPIRED });
    expect(r.status).toBe("presupuesto-agotado");
    expect(r.values).toBeUndefined();
    expect(r.reason).toBeDefined();
  });

  it("el mismo ciclo grande SÍ se computa completo con presupuesto amplio (control positivo del test anterior)", () => {
    const SIZE = 5000;
    const nodes = Array.from({ length: SIZE }, (_, i) => fileNode(`f${i}.rb`));
    const edges = nodes.map((n, i) => edge(n.id, nodes[(i + 1) % SIZE]!.id));
    const g = graphOf(nodes, edges);
    const r = scc.compute(project(g), { budget: NEVER_EXPIRES });
    expect(r.status).toBe("computed");
    expect(r.values?.size).toBe(SIZE);
    const one = r.values!.get(fileNodeId("f0.rb"))! as DependencyCycle;
    expect(one.size).toBe(SIZE);
  });
});
