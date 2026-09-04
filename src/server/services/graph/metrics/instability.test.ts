/**
 * Test de `instability` — ver el docstring de `instability.ts`. Cubre
 * también la proyección `module` de `projectGraph` (`projection.ts`, la
 * infraestructura compartida mínima que otra tarea de esta ola tuvo que
 * bootstrapear — ver la nota de proceso en `types.ts`): nadie más la
 * ejercita todavía, porque `pagerank`/`clustering`/`connected-components`
 * operan sobre `file`, y `instability` es la primera métrica de la tabla
 * de CONTRATO-F4.md §3.1 que usa `module`.
 */
import { describe, expect, it } from "vitest";

import {
  fileNodeId,
  folderNodeId,
  symbolNodeId,
  type CodeGraph,
  type CodeGraphEdge,
  type CodeGraphNode,
  type EdgeKind,
} from "../types.js";
import type { ResolutionStats } from "../stages.js";
import { projectGraph } from "./projection.js";
import { instability } from "./instability.js";
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
  return { from, to, kind, provenance: "declared", weight };
}
function graphOf(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): CodeGraph {
  return { nodes, edges, resolution: EMPTY_RESOLUTION };
}

/** Cadena de carpetas real, como la construiría `graph/build.ts#folderChain`. */
function folderChainNodes(dir: string): CodeGraphNode[] {
  const segments = dir.split("/");
  const nodes: CodeGraphNode[] = [];
  let cur = "";
  for (const seg of segments) {
    cur = cur ? `${cur}/${seg}` : seg;
    nodes.push(folderNode(cur));
  }
  return nodes;
}

const NEVER_EXPIRES: MetricBudget = { maxMs: Infinity, expired: () => false };
const ALREADY_EXPIRED: MetricBudget = { maxMs: 0, expired: () => true };

const MODULE_KINDS = instability.edgeKinds;

describe("instability — forma", () => {
  it("declara su forma — GraphMetric<number> congelado por CONTRATO-F4.md §3.1", () => {
    expect(instability.id).toBe("instability");
    expect(instability.projection).toBe("module");
    expect(instability.cost).toBe("lineal");
    expect(instability.edgeKinds).toEqual(["imports", "extends", "implements"]);
    expect(instability.edgeKinds).not.toContain("contains");
    expect(instability.edgeKinds).not.toContain("references");
  });

  it("no-aplicable si la proyección no es 'module'", () => {
    const wrongProjection: ProjectedGraph = {
      projection: "file",
      nodeIds: [],
      indexOf: new Map(),
      out: [],
      weight: [],
      topologyHash: "x",
    };
    const r = instability.compute(wrongProjection, { budget: NEVER_EXPIRES });
    expect(r.status).toBe("no-aplicable");
    expect(r.values).toBeUndefined();
  });

  it("grafo vacío: computed con mapa vacío", () => {
    const p = projectGraph(graphOf([], []), "module", MODULE_KINDS);
    const r = instability.compute(p, { budget: NEVER_EXPIRES });
    expect(r.status).toBe("computed");
    expect(r.values?.size).toBe(0);
  });

  it("presupuesto ya agotado antes de empezar: presupuesto-agotado, values UNDEFINED, nunca un mapa parcial", () => {
    const a = fileNode("src/a/x.rb");
    const b = fileNode("src/b/y.rb");
    const g = graphOf(
      [...folderChainNodes("src/a"), ...folderChainNodes("src/b"), a, b],
      [edge(a.id, b.id, "imports")],
    );
    const p = projectGraph(g, "module", MODULE_KINDS);
    const r = instability.compute(p, { budget: ALREADY_EXPIRED });
    expect(r.status).toBe("presupuesto-agotado");
    expect(r.values).toBeUndefined();
    expect(r.reason).toBeDefined();
  });
});

describe("instability — el ejemplo canónico de Martin", () => {
  it("un módulo dependido por todos y que no depende de nadie es maximamente ESTABLE (I=0)", () => {
    // hub: src/hub — dos módulos-hoja lo importan; hub no importa a nadie.
    const hubFile = fileNode("src/hub/h.rb");
    const aFile = fileNode("src/a/x.rb");
    const bFile = fileNode("src/b/y.rb");
    const g = graphOf(
      [...folderChainNodes("src/hub"), ...folderChainNodes("src/a"), ...folderChainNodes("src/b"), hubFile, aFile, bFile],
      [edge(aFile.id, hubFile.id, "imports"), edge(bFile.id, hubFile.id, "imports")],
    );
    const p = projectGraph(g, "module", MODULE_KINDS);
    const r = instability.compute(p, { budget: NEVER_EXPIRES });
    expect(r.status).toBe("computed");
    const values = r.values!;
    expect(values.get(folderNodeId("src/hub"))).toBe(0); // Ca=2, Ce=0 -> 0/2
    expect(values.get(folderNodeId("src/a"))).toBe(1); // Ca=0, Ce=1 -> 1/1
    expect(values.get(folderNodeId("src/b"))).toBe(1);
  });

  it("dependencia mutua entre dos módulos: I=0,5 para ambos", () => {
    const aFile = fileNode("src/a/x.rb");
    const bFile = fileNode("src/b/y.rb");
    const g = graphOf(
      [...folderChainNodes("src/a"), ...folderChainNodes("src/b"), aFile, bFile],
      [edge(aFile.id, bFile.id, "imports"), edge(bFile.id, aFile.id, "extends")],
    );
    const p = projectGraph(g, "module", MODULE_KINDS);
    const r = instability.compute(p, { budget: NEVER_EXPIRES });
    expect(r.values!.get(folderNodeId("src/a"))).toBeCloseTo(0.5, 9);
    expect(r.values!.get(folderNodeId("src/b"))).toBeCloseTo(0.5, 9);
  });

  it("módulo sin NINGUNA arista de imports/extends/implements no aparece en el mapa (I no definida, no es 0)", () => {
    const lonely = fileNode("src/lonely/z.rb");
    const aFile = fileNode("src/a/x.rb");
    const bFile = fileNode("src/b/y.rb");
    const g = graphOf(
      [...folderChainNodes("src/lonely"), ...folderChainNodes("src/a"), ...folderChainNodes("src/b"), lonely, aFile, bFile],
      [edge(aFile.id, bFile.id, "imports")],
    );
    const p = projectGraph(g, "module", MODULE_KINDS);
    const r = instability.compute(p, { budget: NEVER_EXPIRES });
    expect(r.values!.has(folderNodeId("src/lonely"))).toBe(false);
    expect(r.values!.has(folderNodeId("src/a"))).toBe(true);
    expect(r.values!.has(folderNodeId("src/b"))).toBe(true);
  });

  it("no cuenta `references` cruda: un módulo sólo acoplado por `references` queda sin señal", () => {
    const aFile = fileNode("src/a/x.rb");
    const bFile = fileNode("src/b/y.rb");
    const g = graphOf(
      [...folderChainNodes("src/a"), ...folderChainNodes("src/b"), aFile, bFile],
      [edge(aFile.id, bFile.id, "references")],
    );
    // Proyecto con el filtro REAL de la métrica (imports/extends/implements):
    // la arista `references` no pasa el filtro, así que no debería aparecer.
    const p = projectGraph(g, "module", MODULE_KINDS);
    const r = instability.compute(p, { budget: NEVER_EXPIRES });
    expect(r.values!.size).toBe(0);
  });

  it("aristas paralelas entre el mismo par de módulos cuentan como UN solo vecino (grado, no peso)", () => {
    const a1 = symNode("src/a/x.rb", ["X"]);
    const a2 = symNode("src/a/y.rb", ["Y"]);
    const bFile = fileNode("src/b/z.rb");
    const g = graphOf(
      [...folderChainNodes("src/a"), ...folderChainNodes("src/b"), a1, a2, bFile],
      // Dos símbolos DISTINTOS del módulo A apuntan al módulo B, con dos
      // kinds distintos de los tres que cuentan: sigue siendo UN vecino.
      [edge(a1.id, bFile.id, "extends"), edge(a2.id, bFile.id, "implements")],
    );
    const p = projectGraph(g, "module", MODULE_KINDS);
    const r = instability.compute(p, { budget: NEVER_EXPIRES });
    // A: Ce=1 (un solo módulo vecino, B), Ca=0 -> I=1
    expect(r.values!.get(folderNodeId("src/a"))).toBe(1);
    // B: Ce=0, Ca=1 (un solo módulo vecino, A) -> I=0
    expect(r.values!.get(folderNodeId("src/b"))).toBe(0);
  });

  it("dos archivos de la MISMA carpeta que se referencian entre sí no se autocuentan (auto-arista tras proyectar)", () => {
    const x = fileNode("src/a/x.rb");
    const y = fileNode("src/a/y.rb");
    const outsider = fileNode("src/b/z.rb");
    const g = graphOf(
      [...folderChainNodes("src/a"), ...folderChainNodes("src/b"), x, y, outsider],
      [
        edge(x.id, y.id, "imports"), // mismo módulo (src/a) -> se descarta al proyectar
        edge(x.id, outsider.id, "extends"),
      ],
    );
    const p = projectGraph(g, "module", MODULE_KINDS);
    const r = instability.compute(p, { budget: NEVER_EXPIRES });
    // Si la auto-arista NO se hubiera descartado, Ce de src/a sería inflado
    // por una dependencia consigo mismo; el único vecino real es src/b.
    expect(r.values!.get(folderNodeId("src/a"))).toBe(1); // Ce=1 (sólo src/b), Ca=0
    expect(r.values!.get(folderNodeId("src/b"))).toBe(0); // Ce=0, Ca=1
  });
});
