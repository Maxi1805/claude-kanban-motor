/**
 * `wrapping-chain.ts` — Ola 10, CONTRATO-F10.md §0.4, "la terna de
 * envoltura". Grafos sintéticos mínimos, uno por escenario — el mismo estilo
 * que `graph/neighborhood.test.ts` ya usa para fijar el comportamiento de un
 * consumidor de `CodeGraph` sin depender de `analyzeRepo`/un repo real.
 */
import { describe, expect, it } from "vitest";

import { EDGE_ROLE_RECEIVER_MEMBER, symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode } from "../graph/types.js";
import { findWrappingChains } from "./wrapping-chain.js";

const EMPTY_RESOLUTION = { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] };

function sym(file: string, symbolPath: readonly string[], overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return {
    id: symbolNodeId(file, symbolPath),
    kind: "symbol",
    file,
    symbolPath,
    family: "class-like",
    ...overrides,
  };
}

function method(file: string, classPath: string, name: string, arity: number, overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return sym(file, [classPath, name], { family: "function-like", arity, ...overrides });
}

function edge(from: string, to: string, kind: CodeGraphEdge["kind"], overrides: Partial<CodeGraphEdge> = {}): CodeGraphEdge {
  return { from, to, kind, provenance: "resolved", weight: 1, ...overrides };
}

/** `contains` desde el owner hacia cada uno de sus miembros — lo que `memberSignatures`/`findWrappingChains` recorren para descubrir la firma. */
function containsAll(ownerId: string, memberIds: readonly string[]): CodeGraphEdge[] {
  return memberIds.map((m) => edge(ownerId, m, "contains"));
}

describe("findWrappingChains", () => {
  it("grafo null ⇒ [] (nunca lanza)", () => {
    expect(findWrappingChains(null)).toEqual([]);
  });

  it("MATCH: dos implementadores de la MISMA interfaz, mismo miembro (nombre+aridad), calls(receiver-member) de uno a otro, sin extends entre ambos", () => {
    const file = "shapes.ts";
    const iface = sym(file, ["Component"], { family: "namespace-like" });
    const decorator = sym(file, ["Decorator"]);
    const concrete = sym(file, ["ConcreteComponent"]);
    const decoratorOp = method(file, "Decorator", "operation", 0);
    const concreteOp = method(file, "ConcreteComponent", "operation", 0);

    const graph: CodeGraph = {
      nodes: [iface, decorator, concrete, decoratorOp, concreteOp],
      edges: [
        edge(decorator.id, iface.id, "implements"),
        edge(concrete.id, iface.id, "implements"),
        ...containsAll(decorator.id, [decoratorOp.id]),
        ...containsAll(concrete.id, [concreteOp.id]),
        edge(decoratorOp.id, concreteOp.id, "calls", { roles: EDGE_ROLE_RECEIVER_MEMBER }),
      ],
      resolution: EMPTY_RESOLUTION,
    };

    const matches = findWrappingChains(graph);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({
      interfaceId: iface.id,
      wrapperId: decorator.id,
      wrappedId: concrete.id,
      memberName: "operation",
      memberArity: 0,
      wrapperMemberId: decoratorOp.id,
      wrappedMemberId: concreteOp.id,
      viaSatisfies: false,
    });
  });

  it("EXCLUYE super.operation(): misma forma exacta, pero X extends Y ⇒ ningún match para (X,Y)", () => {
    const file = "shapes.ts";
    const iface = sym(file, ["Component"], { family: "namespace-like" });
    const sub = sym(file, ["SubClass"]);
    const base = sym(file, ["BaseClass"]);
    const subOp = method(file, "SubClass", "operation", 0);
    const baseOp = method(file, "BaseClass", "operation", 0);

    const graph: CodeGraph = {
      nodes: [iface, sub, base, subOp, baseOp],
      edges: [
        edge(sub.id, iface.id, "implements"),
        edge(base.id, iface.id, "implements"),
        edge(sub.id, base.id, "extends"),
        ...containsAll(sub.id, [subOp.id]),
        ...containsAll(base.id, [baseOp.id]),
        edge(subOp.id, baseOp.id, "calls", { roles: EDGE_ROLE_RECEIVER_MEMBER }), // super.operation()
      ],
      resolution: EMPTY_RESOLUTION,
    };

    expect(findWrappingChains(graph)).toEqual([]);
  });

  it("sin interfaz común ⇒ sin match, aunque el resto de la forma sea idéntica", () => {
    const file = "shapes.ts";
    const a = sym(file, ["A"]);
    const b = sym(file, ["B"]);
    const aOp = method(file, "A", "operation", 0);
    const bOp = method(file, "B", "operation", 0);

    const graph: CodeGraph = {
      nodes: [a, b, aOp, bOp],
      edges: [...containsAll(a.id, [aOp.id]), ...containsAll(b.id, [bOp.id]), edge(aOp.id, bOp.id, "calls", { roles: EDGE_ROLE_RECEIVER_MEMBER })],
      resolution: EMPTY_RESOLUTION,
    };

    expect(findWrappingChains(graph)).toEqual([]);
  });

  it("aridad distinta en el miembro homónimo ⇒ sin match (memberSignatures no los empareja)", () => {
    const file = "shapes.ts";
    const iface = sym(file, ["Component"], { family: "namespace-like" });
    const x = sym(file, ["X"]);
    const y = sym(file, ["Y"]);
    const xOp = method(file, "X", "operation", 0);
    const yOp = method(file, "Y", "operation", 1); // misma nombre, distinta aridad

    const graph: CodeGraph = {
      nodes: [iface, x, y, xOp, yOp],
      edges: [
        edge(x.id, iface.id, "implements"),
        edge(y.id, iface.id, "implements"),
        ...containsAll(x.id, [xOp.id]),
        ...containsAll(y.id, [yOp.id]),
        edge(xOp.id, yOp.id, "calls", { roles: EDGE_ROLE_RECEIVER_MEMBER }),
      ],
      resolution: EMPTY_RESOLUTION,
    };

    expect(findWrappingChains(graph)).toEqual([]);
  });

  it("sin arista calls(receiver-member) entre los miembros ⇒ sin match, aunque compartan interfaz y aridad", () => {
    const file = "shapes.ts";
    const iface = sym(file, ["Component"], { family: "namespace-like" });
    const x = sym(file, ["X"]);
    const y = sym(file, ["Y"]);
    const xOp = method(file, "X", "operation", 0);
    const yOp = method(file, "Y", "operation", 0);

    const graph: CodeGraph = {
      nodes: [iface, x, y, xOp, yOp],
      edges: [edge(x.id, iface.id, "implements"), edge(y.id, iface.id, "implements"), ...containsAll(x.id, [xOp.id]), ...containsAll(y.id, [yOp.id])],
      resolution: EMPTY_RESOLUTION,
    };

    expect(findWrappingChains(graph)).toEqual([]);
  });

  it("calls SIN role receiver-member (p.ej. bare) ⇒ sin match: el role es parte de la evidencia, no un detalle", () => {
    const file = "shapes.ts";
    const iface = sym(file, ["Component"], { family: "namespace-like" });
    const x = sym(file, ["X"]);
    const y = sym(file, ["Y"]);
    const xOp = method(file, "X", "operation", 0);
    const yOp = method(file, "Y", "operation", 0);

    const graph: CodeGraph = {
      nodes: [iface, x, y, xOp, yOp],
      edges: [
        edge(x.id, iface.id, "implements"),
        edge(y.id, iface.id, "implements"),
        ...containsAll(x.id, [xOp.id]),
        ...containsAll(y.id, [yOp.id]),
        edge(xOp.id, yOp.id, "calls"), // sin `roles`
      ],
      resolution: EMPTY_RESOLUTION,
    };

    expect(findWrappingChains(graph)).toEqual([]);
  });

  it("calls con provenance 'ambiguous' ⇒ sin match: confidentEdges lo excluye antes de construir el índice", () => {
    const file = "shapes.ts";
    const iface = sym(file, ["Component"], { family: "namespace-like" });
    const x = sym(file, ["X"]);
    const y = sym(file, ["Y"]);
    const xOp = method(file, "X", "operation", 0);
    const yOp = method(file, "Y", "operation", 0);

    const graph: CodeGraph = {
      nodes: [iface, x, y, xOp, yOp],
      edges: [
        edge(x.id, iface.id, "implements"),
        edge(y.id, iface.id, "implements"),
        ...containsAll(x.id, [xOp.id]),
        ...containsAll(y.id, [yOp.id]),
        edge(xOp.id, yOp.id, "calls", { roles: EDGE_ROLE_RECEIVER_MEMBER, provenance: "ambiguous", alternatives: ["sym:other#Z.operation"] }),
      ],
      resolution: EMPTY_RESOLUTION,
    };

    expect(findWrappingChains(graph)).toEqual([]);
  });

  it("viaSatisfies: true cuando CUALQUIERA de los dos lados resolvió la interfaz por 'satisfies' en vez de 'implements' — riesgo A9 declarado en el resultado, no escondido", () => {
    const file = "shapes.cs";
    const iface = sym(file, ["IComponent"], { family: "namespace-like" });
    const x = sym(file, ["X"]);
    const y = sym(file, ["Y"]);
    const xOp = method(file, "X", "Operation", 0);
    const yOp = method(file, "Y", "Operation", 0);

    const graph: CodeGraph = {
      nodes: [iface, x, y, xOp, yOp],
      edges: [
        edge(x.id, iface.id, "satisfies"), // estructural, no declarado
        edge(y.id, iface.id, "implements"),
        ...containsAll(x.id, [xOp.id]),
        ...containsAll(y.id, [yOp.id]),
        edge(xOp.id, yOp.id, "calls", { roles: EDGE_ROLE_RECEIVER_MEMBER }),
      ],
      resolution: EMPTY_RESOLUTION,
    };

    const matches = findWrappingChains(graph);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.viaSatisfies).toBe(true);
  });

  it("una interfaz con UN solo implementador no puede formar cadena — sin par, sin match", () => {
    const file = "shapes.ts";
    const iface = sym(file, ["Component"], { family: "namespace-like" });
    const x = sym(file, ["X"]);
    const xOp = method(file, "X", "operation", 0);

    const graph: CodeGraph = {
      nodes: [iface, x, xOp],
      edges: [edge(x.id, iface.id, "implements"), ...containsAll(x.id, [xOp.id])],
      resolution: EMPTY_RESOLUTION,
    };

    expect(findWrappingChains(graph)).toEqual([]);
  });
});
