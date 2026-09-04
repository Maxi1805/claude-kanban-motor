import { describe, expect, it } from "vitest";

import type { CodeGraph, CodeGraphEdge, CodeGraphNode, EdgeKind, GraphIndex, Provenance } from "../../graph/types.js";
import type { AstNode, FunctionMetrics, FunctionUnit } from "../types.js";
import { signatureImposedByContract } from "./b1b-contrato-grafo.js";
import { buildGraphIndex } from "./u1-grafo-en-contexto.js";

/* ── fabricantes mínimos ──────────────────────────────────────────────── */

function paramsNode(count: number): AstNode {
  const children: AstNode[] = Array.from({ length: count }, () => leafNode());
  return {
    type: "formal_parameters",
    isNamed: true,
    childCount: count,
    child: (i: number) => children[i] ?? null,
    childForFieldName: () => null,
    startPosition: { row: 0, column: 0 },
    endPosition: { row: 0, column: 0 },
    text: "",
  } as unknown as AstNode;
}

function leafNode(): AstNode {
  return {
    type: "identifier",
    isNamed: true,
    childCount: 0,
    child: () => null,
    childForFieldName: () => null,
    startPosition: { row: 0, column: 0 },
    endPosition: { row: 0, column: 0 },
    text: "x",
  } as unknown as AstNode;
}

/** `parameters: null` ⇒ ninguna aridad declarada resoluble (`declaredArity` da `null`). */
function fnNode(paramCount: number | null): AstNode {
  const params = paramCount === null ? null : paramsNode(paramCount);
  return {
    type: "method_definition",
    isNamed: true,
    childCount: 0,
    child: () => null,
    childForFieldName: (name: string) => (name === "parameters" ? params : null),
    startPosition: { row: 0, column: 0 },
    endPosition: { row: 0, column: 0 },
    text: "",
  } as unknown as AstNode;
}

const BASE_METRICS: FunctionMetrics = {
  branches: 0,
  chain: 0,
  cognitive: 0,
  maxNesting: 0,
  parameters: 0,
  chainHasNullCheck: false,
  chainInstantiates: false,
  className: null,
  isConstructor: false,
  isFactoryLike: false,
};

function fn(opts: { name: string | null; className: string | null; paramCount: number | null; file?: string }): FunctionUnit {
  return {
    file: opts.file ?? "a.cs",
    language: "csharp",
    name: opts.name,
    startLine: 1,
    endLine: 1,
    symbolPath: [opts.className, opts.name].filter((p): p is string => p !== null),
    node: fnNode(opts.paramCount),
    sets: {} as unknown as FunctionUnit["sets"],
    metrics: { ...BASE_METRICS, className: opts.className, parameters: opts.paramCount ?? 0 },
  };
}

function symNode(id: string, file: string, symbolPath: readonly string[], extra: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return { id, kind: "symbol", file, symbolPath, ...extra } as CodeGraphNode;
}

function containsEdge(from: string, to: string): CodeGraphEdge {
  return { from, to, kind: "contains", provenance: "declared", weight: 1 };
}

function typedEdge(from: string, to: string, kind: EdgeKind, provenance: Provenance = "resolved"): CodeGraphEdge {
  return { from, to, kind, provenance, weight: 1 };
}

function graphOf(nodes: CodeGraphNode[], edges: CodeGraphEdge[]): CodeGraph {
  return { nodes, edges, resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] } };
}

function member(id: string, name: string, arity: number | null): CodeGraphNode {
  return symNode(id, "a.cs", ["IWriter", name], { family: "function-like", arity });
}

/* ── mecanismo (A): implements/extends/satisfies + memberSignatures ─────── */

describe("signatureImposedByContract — mecanismo (A), contenedor con contrato", () => {
  it("implements hacia un miembro de igual nombre+aridad ⇒ true", () => {
    const graph = graphOf(
      [symNode("sym:a.cs#Inner", "a.cs", ["Inner"]), symNode("sym:a.cs#IWriter", "a.cs", ["IWriter"]), member("sym:a.cs#IWriter.Write", "Write", 2)],
      [typedEdge("sym:a.cs#Inner", "sym:a.cs#IWriter", "implements"), containsEdge("sym:a.cs#IWriter", "sym:a.cs#IWriter.Write")],
    );
    const index = buildGraphIndex(graph);
    const f = fn({ name: "Write", className: "Inner", paramCount: 2 });
    expect(signatureImposedByContract(f, graph, index)).toBe(true);
  });

  it("extends (no sólo implements) hacia un miembro que coincide ⇒ true — C# con un único candidato tras `:` se clasifica extends", () => {
    const graph = graphOf(
      [symNode("sym:a.cs#Inner", "a.cs", ["Inner"]), symNode("sym:a.cs#IWriter", "a.cs", ["IWriter"]), member("sym:a.cs#IWriter.Write", "Write", 2)],
      [typedEdge("sym:a.cs#Inner", "sym:a.cs#IWriter", "extends"), containsEdge("sym:a.cs#IWriter", "sym:a.cs#IWriter.Write")],
    );
    const index = buildGraphIndex(graph);
    const f = fn({ name: "Write", className: "Inner", paramCount: 2 });
    expect(signatureImposedByContract(f, graph, index)).toBe(true);
  });

  it("satisfies (satisfacción estructural) hacia un miembro que coincide ⇒ true", () => {
    const graph = graphOf(
      [symNode("sym:a.cs#Inner", "a.cs", ["Inner"]), symNode("sym:a.cs#IWriter", "a.cs", ["IWriter"]), member("sym:a.cs#IWriter.Write", "Write", 2)],
      [typedEdge("sym:a.cs#Inner", "sym:a.cs#IWriter", "satisfies"), containsEdge("sym:a.cs#IWriter", "sym:a.cs#IWriter.Write")],
    );
    const index = buildGraphIndex(graph);
    const f = fn({ name: "Write", className: "Inner", paramCount: 2 });
    expect(signatureImposedByContract(f, graph, index)).toBe(true);
  });

  it("aridad DISTINTA en los dos lados, ambas resueltas ⇒ false — no es el mismo miembro", () => {
    const graph = graphOf(
      [symNode("sym:a.cs#Inner", "a.cs", ["Inner"]), symNode("sym:a.cs#IWriter", "a.cs", ["IWriter"]), member("sym:a.cs#IWriter.Write", "Write", 2)],
      [typedEdge("sym:a.cs#Inner", "sym:a.cs#IWriter", "implements"), containsEdge("sym:a.cs#IWriter", "sym:a.cs#IWriter.Write")],
    );
    const index = buildGraphIndex(graph);
    const f = fn({ name: "Write", className: "Inner", paramCount: 3 }); // 3, no 2
    expect(signatureImposedByContract(f, graph, index)).toBe(false);
  });

  it("aridad del MIEMBRO sin resolver (`arity: null`) ⇒ empareja sólo por nombre, true", () => {
    const graph = graphOf(
      [symNode("sym:a.cs#Inner", "a.cs", ["Inner"]), symNode("sym:a.cs#IWriter", "a.cs", ["IWriter"]), member("sym:a.cs#IWriter.Write", "Write", null)],
      [typedEdge("sym:a.cs#Inner", "sym:a.cs#IWriter", "implements"), containsEdge("sym:a.cs#IWriter", "sym:a.cs#IWriter.Write")],
    );
    const index = buildGraphIndex(graph);
    const f = fn({ name: "Write", className: "Inner", paramCount: 2 });
    expect(signatureImposedByContract(f, graph, index)).toBe(true);
  });

  it("aridad PROPIA sin resolver (`declaredArity` da null: sin campo `parameters`) ⇒ empareja sólo por nombre, true", () => {
    const graph = graphOf(
      [symNode("sym:a.cs#Inner", "a.cs", ["Inner"]), symNode("sym:a.cs#IWriter", "a.cs", ["IWriter"]), member("sym:a.cs#IWriter.Write", "Write", 2)],
      [typedEdge("sym:a.cs#Inner", "sym:a.cs#IWriter", "implements"), containsEdge("sym:a.cs#IWriter", "sym:a.cs#IWriter.Write")],
    );
    const index = buildGraphIndex(graph);
    const f = fn({ name: "Write", className: "Inner", paramCount: null });
    expect(signatureImposedByContract(f, graph, index)).toBe(true);
  });

  it("nombre DISTINTO ⇒ false", () => {
    const graph = graphOf(
      [symNode("sym:a.cs#Inner", "a.cs", ["Inner"]), symNode("sym:a.cs#IWriter", "a.cs", ["IWriter"]), member("sym:a.cs#IWriter.Write", "Write", 2)],
      [typedEdge("sym:a.cs#Inner", "sym:a.cs#IWriter", "implements"), containsEdge("sym:a.cs#IWriter", "sym:a.cs#IWriter.Write")],
    );
    const index = buildGraphIndex(graph);
    const f = fn({ name: "OtroMetodo", className: "Inner", paramCount: 2 });
    expect(signatureImposedByContract(f, graph, index)).toBe(false);
  });

  it("arista de contrato AMBIGUA (`provenance: 'ambiguous'`) ⇒ se ignora, false", () => {
    const graph = graphOf(
      [symNode("sym:a.cs#Inner", "a.cs", ["Inner"]), symNode("sym:a.cs#IWriter", "a.cs", ["IWriter"]), member("sym:a.cs#IWriter.Write", "Write", 2)],
      [typedEdge("sym:a.cs#Inner", "sym:a.cs#IWriter", "implements", "ambiguous"), containsEdge("sym:a.cs#IWriter", "sym:a.cs#IWriter.Write")],
    );
    const index = buildGraphIndex(graph);
    const f = fn({ name: "Write", className: "Inner", paramCount: 2 });
    expect(signatureImposedByContract(f, graph, index)).toBe(false);
  });

  it("sin ninguna arista de contrato ⇒ false", () => {
    const graph = graphOf([symNode("sym:a.cs#Inner", "a.cs", ["Inner"])], []);
    const index = buildGraphIndex(graph);
    const f = fn({ name: "Write", className: "Inner", paramCount: 2 });
    expect(signatureImposedByContract(f, graph, index)).toBe(false);
  });

  it("REGRESIÓN — `FunctionUnit.symbolPath` no lleva el camino completo (namespace/clase anidada dos niveles), la resolución por SUFIJO igual encuentra el contenedor real y su contrato", () => {
    // Mimetiza EXACTAMENTE lo medido contra `analyzeRepo` real (evidencia
    // exploratoria, ver la nota de proceso al final del docstring de
    // `b1b-contrato-grafo.ts`): `facts/units.ts` arma
    // `FunctionUnit.symbolPath`/`className` con SÓLO el
    // contenedor inmediato ("Inner"), pero el nodo real del grafo vive en
    // "Demo.Outer.Inner" (namespace + clase anidada). Sin resolución por
    // sufijo, `containerId` construido a mano (`symbolNodeId` directo) NUNCA
    // encontraría este nodo.
    const graph = graphOf(
      [
        symNode("sym:a.cs#Demo.Outer.Inner", "a.cs", ["Demo", "Outer", "Inner"]),
        symNode("sym:a.cs#Demo.IWriter", "a.cs", ["Demo", "IWriter"]),
        member("sym:a.cs#Demo.IWriter.Write", "Write", 2),
      ],
      [typedEdge("sym:a.cs#Demo.Outer.Inner", "sym:a.cs#Demo.IWriter", "extends"), containsEdge("sym:a.cs#Demo.IWriter", "sym:a.cs#Demo.IWriter.Write")],
    );
    const index = buildGraphIndex(graph);
    const f = fn({ name: "Write", className: "Inner", paramCount: 2 }); // symbolPath de fn: ["Inner", "Write"] — SIN "Demo"/"Outer"
    expect(signatureImposedByContract(f, graph, index)).toBe(true);
  });

  it("sufijo AMBIGUO (dos símbolos del mismo archivo terminan con el mismo camino) ⇒ no resuelve, false — nunca adivina", () => {
    const graph = graphOf(
      [
        symNode("sym:a.cs#Ns1.Inner", "a.cs", ["Ns1", "Inner"]),
        symNode("sym:a.cs#Ns2.Inner", "a.cs", ["Ns2", "Inner"]),
        symNode("sym:a.cs#IWriter", "a.cs", ["IWriter"]),
        member("sym:a.cs#IWriter.Write", "Write", 2),
      ],
      [typedEdge("sym:a.cs#Ns1.Inner", "sym:a.cs#IWriter", "implements"), containsEdge("sym:a.cs#IWriter", "sym:a.cs#IWriter.Write")],
    );
    const index = buildGraphIndex(graph);
    const f = fn({ name: "Write", className: "Inner", paramCount: 2 });
    expect(signatureImposedByContract(f, graph, index)).toBe(false);
  });

  it("contenedor no existe en el grafo (sufijo sin ningún candidato) ⇒ false, no lanza", () => {
    const graph = graphOf([], []);
    const index = buildGraphIndex(graph);
    const f = fn({ name: "Write", className: "Inner", paramCount: 2 });
    expect(signatureImposedByContract(f, graph, index)).toBe(false);
  });
});

/* ── mecanismo (B): `carries` entrante ───────────────────────────────────── */

describe("signatureImposedByContract — mecanismo (B), `carries` entrante (delegado/callback)", () => {
  it("función SUELTA (sin clase) referenciada como valor en otro lado (`carries`) ⇒ true", () => {
    const graph = graphOf(
      [symNode("sym:a.cs#customDefaultsMerge", "a.cs", ["customDefaultsMerge"]), symNode("sym:a.cs#baseMerge", "a.cs", ["baseMerge"])],
      [typedEdge("sym:a.cs#baseMerge", "sym:a.cs#customDefaultsMerge", "carries", "inferred")],
    );
    const index = buildGraphIndex(graph);
    const f = fn({ name: "customDefaultsMerge", className: null, paramCount: 5 });
    expect(signatureImposedByContract(f, graph, index)).toBe(true);
  });

  it("`carries` AMBIGUA ⇒ se ignora, false", () => {
    const graph = graphOf(
      [symNode("sym:a.cs#customDefaultsMerge", "a.cs", ["customDefaultsMerge"])],
      [typedEdge("sym:a.cs#baseMerge", "sym:a.cs#customDefaultsMerge", "carries", "ambiguous")],
    );
    const index = buildGraphIndex(graph);
    const f = fn({ name: "customDefaultsMerge", className: null, paramCount: 5 });
    expect(signatureImposedByContract(f, graph, index)).toBe(false);
  });

  it("`GraphIndex` sin `edgesTo` (opcional per contrato) ⇒ degrada a false en vez de lanzar", () => {
    const graph = graphOf([symNode("sym:a.cs#customDefaultsMerge", "a.cs", ["customDefaultsMerge"])], []);
    const index: GraphIndex = { nodeById: () => null, edgesFrom: () => [] }; // sin edgesTo
    const f = fn({ name: "customDefaultsMerge", className: null, paramCount: 5 });
    expect(signatureImposedByContract(f, graph, index)).toBe(false);
  });

  it("función suelta sin ninguna señal ⇒ false", () => {
    const graph = graphOf([symNode("sym:a.cs#solita", "a.cs", ["solita"])], []);
    const index = buildGraphIndex(graph);
    const f = fn({ name: "solita", className: null, paramCount: 1 });
    expect(signatureImposedByContract(f, graph, index)).toBe(false);
  });
});

/* ── casos borde ──────────────────────────────────────────────────────── */

describe("signatureImposedByContract — casos borde", () => {
  it("función ANÓNIMA (`fn.name === null`) ⇒ false siempre, sin mirar el grafo", () => {
    const graph = graphOf(
      [symNode("sym:a.cs#Inner", "a.cs", ["Inner"]), symNode("sym:a.cs#IWriter", "a.cs", ["IWriter"]), member("sym:a.cs#IWriter.Write", "Write", 2)],
      [typedEdge("sym:a.cs#Inner", "sym:a.cs#IWriter", "implements"), containsEdge("sym:a.cs#IWriter", "sym:a.cs#IWriter.Write")],
    );
    const index = buildGraphIndex(graph);
    const f = fn({ name: null, className: "Inner", paramCount: 2 });
    expect(signatureImposedByContract(f, graph, index)).toBe(false);
  });

  it("una arista `contains`/`references`/`calls` (no de contrato) hacia algo con el mismo nombre NO cuenta", () => {
    const graph = graphOf(
      [symNode("sym:a.cs#Inner", "a.cs", ["Inner"]), symNode("sym:a.cs#Otro", "a.cs", ["Otro"]), member("sym:a.cs#Otro.Write", "Write", 2)],
      [typedEdge("sym:a.cs#Inner", "sym:a.cs#Otro", "references"), containsEdge("sym:a.cs#Otro", "sym:a.cs#Otro.Write")],
    );
    const index = buildGraphIndex(graph);
    const f = fn({ name: "Write", className: "Inner", paramCount: 2 });
    expect(signatureImposedByContract(f, graph, index)).toBe(false);
  });
});
