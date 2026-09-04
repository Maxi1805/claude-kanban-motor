/**
 * Test de `clustering` (`agrupamiento.ts`) — ver su docstring para la
 * definición (Watts & Strogatz 1998) y por qué separa Mediator de Facade.
 *
 * Construye `CodeGraph`s mínimos a mano (nodos `file:`/`sym:` reales, mismo
 * formato que `graph/types.ts`) y los pasa por el `projectGraph` REAL de
 * `projection.ts` — no un stub propio — para que el test cubra también la
 * integración con la proyección compartida, no sólo `localCoefficient` en
 * aislamiento.
 */
import { describe, expect, it } from "vitest";

import { EDGE_KIND_SPECS } from "../edge-kinds.js";
import { fileNodeId, symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type EdgeKind } from "../types.js";
import { createBudget } from "./budget.js";
import { projectGraph } from "./projection.js";
import { clustering } from "./agrupamiento.js";
import type { MetricBudget } from "./types.js";

function fileNode(path: string): CodeGraphNode {
  return { id: fileNodeId(path), kind: "file", file: path, symbolPath: [] };
}

function ref(from: string, to: string, weight = 1): CodeGraphEdge {
  return { from: fileNodeId(from), to: fileNodeId(to), kind: "references", provenance: "resolved", weight };
}

function graphOf(paths: readonly string[], edges: readonly CodeGraphEdge[]): CodeGraph {
  return {
    nodes: paths.map(fileNode),
    edges,
    resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] } as any,
  };
}

const NEVER_EXPIRED: MetricBudget = { maxMs: 1000, expired: () => false };
const ALWAYS_EXPIRED: MetricBudget = { maxMs: 0, expired: () => true };

function valuesOf(paths: readonly string[], edges: readonly CodeGraphEdge[], budget: MetricBudget = NEVER_EXPIRED) {
  const g = graphOf(paths, edges);
  const projected = projectGraph(g, "file", clustering.edgeKinds);
  const result = clustering.compute(projected, { budget });
  return { result, projected };
}

describe("clustering — contrato de la métrica", () => {
  it("declara su forma: id, proyección file, todas las aristas menos contains, costo cuadrático", () => {
    expect(clustering.id).toBe("clustering");
    expect(clustering.projection).toBe("file");
    expect(clustering.edgeKinds).not.toContain("contains");
    // OLA Q — acá había una SEGUNDA copia a mano de la lista de siete, y por
    // eso el bug quedó congelado EN VERDE: la lista de la métrica y la del
    // test envejecieron juntas, y a ninguna de las dos le llegó `calls`. La
    // aserción de hoy no enumera nada — exige que sea EXACTAMENTE el catálogo
    // de `EdgeKind` menos las dos que se restan por definición (ver
    // `EDGE_KINDS_EXCEPT_CONTAINS` en `projection.ts`, con la razón de cada
    // resta). Un `EdgeKind` nuevo entra solo de los dos lados.
    expect([...clustering.edgeKinds].sort()).toEqual(
      (Object.keys(EDGE_KIND_SPECS) as EdgeKind[]).filter((k) => k !== "contains" && k !== "affects").sort(),
    );
    expect(clustering.edgeKinds, "la cascada de llamadas es la otra mitad de la señal de uso").toContain("calls");
    expect(clustering.cost).toBe("cuadratico");
  });
});

describe("clustering — coeficiente por nodo", () => {
  it("grado 0 (nodo aislado) ⇒ 0, no `undefined` ni `NaN`", () => {
    const { result } = valuesOf(["a.ts", "b.ts"], []);
    expect(result.status).toBe("computed");
    expect(result.values!.get(fileNodeId("a.ts"))).toBe(0);
  });

  it("grado 1 (un solo vecino) ⇒ 0: no hay ningún par posible", () => {
    const { result } = valuesOf(["a.ts", "b.ts"], [ref("a.ts", "b.ts")]);
    expect(result.values!.get(fileNodeId("a.ts"))).toBe(0);
    expect(result.values!.get(fileNodeId("b.ts"))).toBe(0);
  });

  it("triángulo (los tres se conocen) ⇒ coeficiente 1 para los tres", () => {
    const { result } = valuesOf(
      ["a.ts", "b.ts", "c.ts"],
      [ref("a.ts", "b.ts"), ref("b.ts", "c.ts"), ref("c.ts", "a.ts")],
    );
    for (const p of ["a.ts", "b.ts", "c.ts"]) {
      expect(result.values!.get(fileNodeId(p))).toBe(1);
    }
  });

  it("estrella tipo Mediator (el hub conoce a 3, ninguno de esos 3 se conoce entre sí) ⇒ C(hub) = 0", () => {
    const { result } = valuesOf(
      ["hub.ts", "a.ts", "b.ts", "c.ts"],
      [ref("hub.ts", "a.ts"), ref("hub.ts", "b.ts"), ref("hub.ts", "c.ts")],
    );
    expect(result.values!.get(fileNodeId("hub.ts"))).toBe(0);
  });

  it("mismo grado que la estrella, pero tipo Facade (los 3 vecinos del hub además colaboran entre sí) ⇒ C(hub) = 1", () => {
    const { result } = valuesOf(
      ["hub.ts", "a.ts", "b.ts", "c.ts"],
      [
        ref("hub.ts", "a.ts"),
        ref("hub.ts", "b.ts"),
        ref("hub.ts", "c.ts"),
        ref("a.ts", "b.ts"),
        ref("b.ts", "c.ts"),
        ref("c.ts", "a.ts"),
      ],
    );
    expect(result.values!.get(fileNodeId("hub.ts"))).toBe(1);
  });

  it("vecinos parcialmente conectados (2 de 3 pares posibles) ⇒ coeficiente fraccionario 2/3", () => {
    const { result } = valuesOf(
      ["hub.ts", "a.ts", "b.ts", "c.ts"],
      [
        ref("hub.ts", "a.ts"),
        ref("hub.ts", "b.ts"),
        ref("hub.ts", "c.ts"),
        ref("a.ts", "b.ts"),
        ref("b.ts", "c.ts"),
        // falta a.ts-c.ts: 2 de los 3 pares posibles están conectados
      ],
    );
    expect(result.values!.get(fileNodeId("hub.ts"))).toBeCloseTo(2 / 3, 12);
  });

  it("la dirección de la arista no importa: A→B sin B→A igual cuenta como 'se conocen'", () => {
    // hub->a, hub->b, y SOLO a->b (no b->a): "conocerse" es no dirigido.
    const { result } = valuesOf(
      ["hub.ts", "a.ts", "b.ts"],
      [ref("hub.ts", "a.ts"), ref("hub.ts", "b.ts"), ref("a.ts", "b.ts")],
    );
    expect(result.values!.get(fileNodeId("hub.ts"))).toBe(1);
  });

  it("múltiples aristas del mismo par (peso acumulado) no cambian el coeficiente: es presencia, no peso", () => {
    const withWeight = valuesOf(
      ["hub.ts", "a.ts", "b.ts"],
      [ref("hub.ts", "a.ts", 7), ref("hub.ts", "b.ts", 3), ref("a.ts", "b.ts", 1)],
    ).result.values!.get(fileNodeId("hub.ts"));
    const withoutWeight = valuesOf(
      ["hub.ts", "a.ts", "b.ts"],
      [ref("hub.ts", "a.ts", 1), ref("hub.ts", "b.ts", 1), ref("a.ts", "b.ts", 1)],
    ).result.values!.get(fileNodeId("hub.ts"));
    expect(withWeight).toBe(withoutWeight);
    expect(withWeight).toBe(1);
  });

  it("símbolos del mismo archivo referenciándose entre sí no producen auto-arista ni inflan el coeficiente de otros", () => {
    const g: CodeGraph = {
      nodes: [
        fileNode("a.ts"),
        { id: symbolNodeId("a.ts", ["Foo"]), kind: "symbol", file: "a.ts", symbolPath: ["Foo"] },
        { id: symbolNodeId("a.ts", ["Bar"]), kind: "symbol", file: "a.ts", symbolPath: ["Bar"] },
        fileNode("b.ts"),
      ],
      edges: [
        { from: symbolNodeId("a.ts", ["Foo"]), to: symbolNodeId("a.ts", ["Bar"]), kind: "references", provenance: "resolved", weight: 1 },
        ref("a.ts", "b.ts"),
      ],
      resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] } as any,
    };
    const projected = projectGraph(g, "file", clustering.edgeKinds);
    // Foo->Bar colapsa a a.ts->a.ts: se descarta (auto-arista). Sólo queda a.ts-b.ts.
    const result = clustering.compute(projected, { budget: NEVER_EXPIRED });
    expect(result.values!.get(fileNodeId("a.ts"))).toBe(0);
    expect(result.values!.get(fileNodeId("b.ts"))).toBe(0);
  });

  it("las aristas `contains` no participan (edgeKinds las excluye) aunque estén en el CodeGraph de origen", () => {
    const g: CodeGraph = {
      nodes: [fileNode("a.ts"), fileNode("b.ts")],
      edges: [{ from: fileNodeId("a.ts"), to: fileNodeId("b.ts"), kind: "contains", provenance: "declared", weight: 1 }],
      resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] } as any,
    };
    const projected = projectGraph(g, "file", clustering.edgeKinds);
    expect(projected.out.every((row) => row.length === 0)).toBe(true);
  });
});

describe("clustering — presupuesto de CPU", () => {
  it("presupuesto agotado antes de empezar ⇒ status presupuesto-agotado, values undefined (nunca un mapa parcial)", () => {
    const { result } = valuesOf(
      ["hub.ts", "a.ts", "b.ts", "c.ts"],
      [ref("hub.ts", "a.ts"), ref("hub.ts", "b.ts"), ref("hub.ts", "c.ts")],
      ALWAYS_EXPIRED,
    );
    expect(result.status).toBe("presupuesto-agotado");
    expect(result.values).toBeUndefined();
    expect(result.reason).toBeTruthy();
  });

  it("con presupuesto real (createBudget de budget.ts) un grafo chico siempre computa", () => {
    const { result } = valuesOf(["a.ts", "b.ts", "c.ts"], [ref("a.ts", "b.ts"), ref("b.ts", "c.ts")], createBudget());
    expect(result.status).toBe("computed");
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});

describe("clustering — determinismo", () => {
  it("dos corridas sobre el mismo grafo dan el mismo mapa", () => {
    const paths = ["hub.ts", "a.ts", "b.ts", "c.ts"];
    const edges = [
      ref("hub.ts", "a.ts"),
      ref("hub.ts", "b.ts"),
      ref("hub.ts", "c.ts"),
      ref("a.ts", "b.ts"),
    ];
    const r1 = valuesOf(paths, edges).result;
    const r2 = valuesOf(paths, edges).result;
    expect([...r1.values!.entries()].sort()).toEqual([...r2.values!.entries()].sort());
  });
});
