import { describe, expect, it } from "vitest";

import { buildParallelHierarchiesFindings, detector } from "./parallel-hierarchies.js";
import { testContext } from "../testing.js";
import type { RepoUnit } from "../types.js";
import { symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type Provenance } from "../../graph/types.js";

/**
 * `inter-file`, `needsGraph: true`, señal puramente de FORMA del grafo (igual
 * que `dependency-cycle`/`orphan-file`/`unused-symbol`): no hace falta
 * tree-sitter, el grafo se construye a mano, mismo patrón que
 * `dependency-cycle.test.ts`. No aplica "≥3 lenguajes que emiten": el
 * detector no clasifica por lenguaje.
 */
function classNode(file: string, name: string, startLine = 1): CodeGraphNode {
  return { id: symbolNodeId(file, [name]), kind: "symbol", file, symbolPath: [name], family: "class-like", startLine, endLine: startLine + 4 };
}

function edge(from: string, to: string, kind: CodeGraphEdge["kind"] = "extends", provenance: Provenance = "declared"): CodeGraphEdge {
  return { from, to, kind, provenance, weight: 1 };
}

function graphOf(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): CodeGraph {
  return { nodes, edges, resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] } };
}

function repoWith(graph: CodeGraph | null, files: readonly string[] = []): RepoUnit {
  return {
    repoName: "test",
    files: files.map((path) => ({ path, lines: 20, language: "typescript" })),
    functions: [],
    clones: [],
    graph,
  };
}

/** Base + N subtipos directos, todos hoja: la forma "root con N hijos" que el detector compara. */
function starHierarchy(prefix: string, childCount: number): { nodes: CodeGraphNode[]; edges: CodeGraphEdge[] } {
  const baseFile = `${prefix}/Base.ts`;
  const base = classNode(baseFile, `${prefix}Base`);
  const nodes = [base];
  const edges: CodeGraphEdge[] = [];
  for (let i = 0; i < childCount; i++) {
    const childFile = `${prefix}/Child${i}.ts`;
    const child = classNode(childFile, `${prefix}Child${i}`);
    nodes.push(child);
    edges.push(edge(child.id, base.id, "extends"));
  }
  return { nodes, edges };
}

describe("parallel-hierarchies", () => {
  it("dos familias disjuntas, misma forma (1 raíz + 2 hijos cada una), sin ancestro común: 1 hallazgo", () => {
    const shapes = testContext(detector, "*");
    const a = starHierarchy("Shape", 2);
    const b = starHierarchy("Renderer", 2);
    const graph = graphOf([...a.nodes, ...b.nodes], [...a.edges, ...b.edges]);
    const findings = buildParallelHierarchiesFindings(
      repoWith(graph),
      graph,
      shapes.threshold("minHierarchySize"),
      shapes.threshold("minGroupSize"),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(2); // 2 jerarquías en el grupo
    expect(findings[0]!.evidence![0]!.value).toBe(3); // 3 miembros por jerarquía (1 raíz + 2 hijos)
    expect(findings[0]!.locations).toHaveLength(2);
    expect(findings[0]!.locations[0]!.role).toContain("familia 1 de 2");
    expect(findings[0]!.detail).not.toContain("compatible con una implementación a propósito del patrón Bridge");
  });

  it("aristas `extends` con provenance 'ambiguous' no forman jerarquía: CONTRATO-F9.md §4.5, fuera de toda consulta por defecto", () => {
    const shapes = testContext(detector, "*");
    const a = starHierarchy("Shape", 2);
    const b = starHierarchy("Renderer", 2);
    const ambiguousA = { nodes: a.nodes, edges: a.edges.map((e) => ({ ...e, provenance: "ambiguous" as Provenance })) };
    const graph = graphOf([...ambiguousA.nodes, ...b.nodes], [...ambiguousA.edges, ...b.edges]);
    const findings = buildParallelHierarchiesFindings(
      repoWith(graph),
      graph,
      shapes.threshold("minHierarchySize"),
      shapes.threshold("minGroupSize"),
    );
    // La familia "Shape" queda sin aristas `extends` confiables: sus 3 nodos nunca forman una
    // componente conexa de `isIsaEdge`, así que no hay jerarquía que emparejar con "Renderer".
    expect(findings).toHaveLength(0);
  });

  it("control negativo: dos familias con forma DISTINTA (2 hijos vs 3 hijos) no matchean", () => {
    const ctx = testContext(detector, "*");
    const a = starHierarchy("Shape", 2);
    const b = starHierarchy("Renderer", 3);
    const graph = graphOf([...a.nodes, ...b.nodes], [...a.edges, ...b.edges]);
    const findings = buildParallelHierarchiesFindings(repoWith(graph), graph, ctx.threshold("minHierarchySize"), ctx.threshold("minGroupSize"));
    expect(findings).toHaveLength(0);
  });

  it("control negativo: si comparten un ancestro (una arista las conecta) es UNA sola componente, no dos", () => {
    const ctx = testContext(detector, "*");
    const a = starHierarchy("Shape", 2);
    const b = starHierarchy("Renderer", 2);
    // Renderer extiende de Shape: ahora comparten ancestro, es una sola familia grande, no dos familias paralelas.
    const bridgeEdge = edge(b.nodes[0]!.id, a.nodes[0]!.id, "extends");
    const graph = graphOf([...a.nodes, ...b.nodes], [...a.edges, ...b.edges, bridgeEdge]);
    const findings = buildParallelHierarchiesFindings(repoWith(graph), graph, ctx.threshold("minHierarchySize"), ctx.threshold("minGroupSize"));
    expect(findings).toHaveLength(0);
  });

  it("umbral minHierarchySize: una familia de tamaño 2 (root + 1 hijo) queda excluida aunque haya dos idénticas", () => {
    const ctx = testContext(detector, "*");
    const threshold = ctx.threshold("minHierarchySize");
    expect(threshold.value).toBe(3);
    const a = starHierarchy("Shape", 1); // tamaño 2: por debajo del umbral
    const b = starHierarchy("Renderer", 1);
    const graph = graphOf([...a.nodes, ...b.nodes], [...a.edges, ...b.edges]);
    const findings = buildParallelHierarchiesFindings(repoWith(graph), graph, threshold, ctx.threshold("minGroupSize"));
    expect(findings).toHaveLength(0);
  });

  it("umbral minGroupSize: una sola familia (sin pareja) nunca es 'jerarquías paralelas' en plural", () => {
    const ctx = testContext(detector, "*");
    const a = starHierarchy("Shape", 2);
    const graph = graphOf(a.nodes, a.edges);
    const findings = buildParallelHierarchiesFindings(repoWith(graph), graph, ctx.threshold("minHierarchySize"), ctx.threshold("minGroupSize"));
    expect(findings).toHaveLength(0);
  });

  it("con una referencia cruzada entre archivos de las dos familias: detail menciona Bridge y baja la severidad", () => {
    const ctx = testContext(detector, "*");
    const a = starHierarchy("Shape", 2);
    const b = starHierarchy("Renderer", 2);
    const crossRef = edge(a.nodes[0]!.id, b.nodes[0]!.id, "references");
    const graphWithout = graphOf([...a.nodes, ...b.nodes], [...a.edges, ...b.edges]);
    const graphWith = graphOf([...a.nodes, ...b.nodes], [...a.edges, ...b.edges, crossRef]);
    const without = buildParallelHierarchiesFindings(repoWith(graphWithout), graphWithout, ctx.threshold("minHierarchySize"), ctx.threshold("minGroupSize"));
    const withBridge = buildParallelHierarchiesFindings(repoWith(graphWith), graphWith, ctx.threshold("minHierarchySize"), ctx.threshold("minGroupSize"));
    expect(withBridge[0]!.detail).toContain("Bridge");
    expect(withBridge[0]!.severity).toBeLessThan(without[0]!.severity);
  });

  it("aristas 'implements' cuentan igual que 'extends' para armar una familia", () => {
    const ctx = testContext(detector, "*");
    const shapeBase = classNode("iface/IShape.ts", "IShape");
    const shapeA = classNode("iface/Circle.ts", "Circle");
    const shapeB = classNode("iface/Square.ts", "Square");
    const rendBase = classNode("iface/IRenderer.ts", "IRenderer");
    const rendA = classNode("iface/CircleRenderer.ts", "CircleRenderer");
    const rendB = classNode("iface/SquareRenderer.ts", "SquareRenderer");
    const graph = graphOf(
      [shapeBase, shapeA, shapeB, rendBase, rendA, rendB],
      [
        edge(shapeA.id, shapeBase.id, "implements"),
        edge(shapeB.id, shapeBase.id, "implements"),
        edge(rendA.id, rendBase.id, "implements"),
        edge(rendB.id, rendBase.id, "implements"),
      ],
    );
    const findings = buildParallelHierarchiesFindings(repoWith(graph), graph, ctx.threshold("minHierarchySize"), ctx.threshold("minGroupSize"));
    expect(findings).toHaveLength(1);
  });

  it("aristas 'contains'/'imports' se ignoran: no arman una familia por sí solas", () => {
    const ctx = testContext(detector, "*");
    const a = classNode("x/A.ts", "A");
    const b = classNode("x/B.ts", "B");
    const graph = graphOf([a, b], [edge(a.id, b.id, "contains"), edge(a.id, b.id, "imports")]);
    const findings = buildParallelHierarchiesFindings(repoWith(graph), graph, ctx.threshold("minHierarchySize"), ctx.threshold("minGroupSize"));
    expect(findings).toHaveLength(0);
  });

  it("sin grafo (RepoUnit.graph === null): detector.run devuelve vacío, nunca lanza — el runner reporta 'sin-grafo'", () => {
    const ctx = testContext(detector, "*");
    const repo = repoWith(null);
    expect(detector.run(repo, ctx)).toHaveLength(0);
  });

  it("los umbrales se piden a testContext: no hay número suelto en el test", () => {
    const ctx = testContext(detector, "*");
    expect(ctx.threshold("minHierarchySize").value).toBe(3);
    // R3: minGroupSize es `presencia()` desde esta ola (binario por
    // definición de "jerarquías PARALELAS" — plural), no `pisoDeclarado`.
    expect(ctx.threshold("minGroupSize").kind).toBe("presencia");
    expect(ctx.threshold("minGroupSize").value).toBe(1);
  });

  it("el detector declara needsGraph:true y needs:[] (señal de forma del grafo, no de gramática)", () => {
    expect(detector.needsGraph).toBe(true);
    expect(detector.needs).toEqual([]);
    expect(detector.scope).toBe("inter-file");
  });

  it("RAÍZ MEDIDA: dos componentes con la MISMA forma Y los MISMOS símbolos son un árbol de fuente espejado, no dos familias -- se colapsan y el hallazgo desaparece (guava: android/guava-testlib/.../DerivedGenerator.java vs guava-testlib/.../DerivedGenerator.java, mismo símbolo, mismos 10 implementadores)", () => {
    const ctx = testContext(detector, "*");
    const mirrorA = starHierarchy("Mirror", 2);
    // Mismos símbolos (`MirrorBase`/`MirrorChild0`/`MirrorChild1`) en un directorio
    // DISTINTO -- exactamente la forma de un backport/vendorizado que copia el árbol
    // de fuente entero, no una segunda jerarquía diseñada aparte. IDs propios (no una
    // copia superficial de los nodos de `mirrorA`): un nodo del grafo real nunca
    // comparte `id` entre dos archivos distintos.
    const mirrorBBase = classNode("android/Mirror/Base.ts", "MirrorBase");
    const mirrorBChild0 = classNode("android/Mirror/Child0.ts", "MirrorChild0");
    const mirrorBChild1 = classNode("android/Mirror/Child1.ts", "MirrorChild1");
    const mirrorBNodes = [mirrorBBase, mirrorBChild0, mirrorBChild1];
    const mirrorBEdges = [edge(mirrorBChild0.id, mirrorBBase.id, "extends"), edge(mirrorBChild1.id, mirrorBBase.id, "extends")];
    const graph = graphOf([...mirrorA.nodes, ...mirrorBNodes], [...mirrorA.edges, ...mirrorBEdges]);
    const findings = buildParallelHierarchiesFindings(repoWith(graph), graph, ctx.threshold("minHierarchySize"), ctx.threshold("minGroupSize"));
    // Una sola familia real (`minGroupSize` exige plural) -- el hallazgo desaparece.
    expect(findings).toHaveLength(0);
  });

  it("RAÍZ MEDIDA: misma forma pero símbolos DISTINTOS sigue siendo 2 familias reales -- el dedupe no se come un verdadero positivo", () => {
    const ctx = testContext(detector, "*");
    const a = starHierarchy("Shape", 2);
    const b = starHierarchy("Renderer", 2);
    const graph = graphOf([...a.nodes, ...b.nodes], [...a.edges, ...b.edges]);
    const findings = buildParallelHierarchiesFindings(repoWith(graph), graph, ctx.threshold("minHierarchySize"), ctx.threshold("minGroupSize"));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(2);
  });

  it("RAÍZ MEDIDA: si el nombre PELADO de dos ejemplos colisiona (dos archivos DISTINTOS con el mismo basename), el detail muestra la ruta completa, nunca el mismo texto para dos archivos distintos", () => {
    const ctx = testContext(detector, "*");
    const a = starHierarchy("Shape", 2);
    // Mismo NOMBRE de archivo raíz (`Base.ts`) que `a`, pero en otro directorio y con
    // símbolos distintos (`RendererBase` != `ShapeBase`): NO es un espejo (el dedupe de
    // arriba no lo toca), pero el basename SÍ colisiona -- caso que exampleNames debe
    // desambiguar mostrando la ruta completa.
    const b = starHierarchy("Renderer", 2);
    const bCollidingBasename = {
      nodes: b.nodes.map((n) => (n.file.endsWith("Base.ts") ? { ...n, file: "other-dir/Base.ts" } : n)),
      edges: b.edges,
    };
    const graph = graphOf([...a.nodes, ...bCollidingBasename.nodes], [...a.edges, ...bCollidingBasename.edges]);
    const findings = buildParallelHierarchiesFindings(repoWith(graph), graph, ctx.threshold("minHierarchySize"), ctx.threshold("minGroupSize"));
    expect(findings).toHaveLength(1);
    // Nunca "Base.ts, Base.ts" -- ambos ejemplos deben llevar su ruta completa distinta.
    expect(findings[0]!.detail).not.toContain("Base.ts, Base.ts");
    expect(findings[0]!.detail).toContain("Shape/Base.ts");
    expect(findings[0]!.detail).toContain("other-dir/Base.ts");
  });

  it("SEGUNDA CAUSA MEDIDA (dedupeSameFileComponents): dos clases anidadas DISTINTAS (sin símbolos en común) del MISMO archivo, misma forma que una tercera familia real ⇒ colapsan y no hay 2 familias reales que emparejar (medido: guava AbstractMapBasedMultimap.java#KeySet/#WrappedCollection)", () => {
    const ctx = testContext(detector, "*");
    // Dos "familias" nacidas del MISMO archivo — símbolos distintos (no es
    // el caso de árbol espejado que ya cubre dedupeMirroredComponents), así
    // que sin el dedupe por archivo formarían un grupo de 2 con `b` y
    // dispararían. Con el dedupe, colapsan a una sola: no queda pareja.
    const nestedA: CodeGraphNode[] = [
      classNode("Big.ts", "NestedKeySet"),
      classNode("Big.ts", "NestedKeySetChild0"),
    ];
    const nestedAEdges = [edge(nestedA[1]!.id, nestedA[0]!.id, "extends")];
    const nestedB: CodeGraphNode[] = [
      classNode("Big.ts", "NestedWrapped"),
      classNode("Big.ts", "NestedWrappedChild0"),
    ];
    const nestedBEdges = [edge(nestedB[1]!.id, nestedB[0]!.id, "extends")];
    const c = starHierarchy("Third", 1);
    const graph = graphOf([...nestedA, ...nestedB, ...c.nodes], [...nestedAEdges, ...nestedBEdges, ...c.edges]);
    const findings = buildParallelHierarchiesFindings(repoWith(graph), graph, ctx.threshold("minHierarchySize"), ctx.threshold("minGroupSize"));
    expect(findings).toHaveLength(0);
  });

  it("SEGUNDA CAUSA MEDIDA (más de 2 familias con la misma firma): tres o más componentes con la MISMA forma no disparan — 'parejas', no grupos de N (medido sobre guava: la firma más chica empareja 23 clases de dominios ajenos)", () => {
    const ctx = testContext(detector, "*");
    const a = starHierarchy("A", 2);
    const b = starHierarchy("B", 2);
    const c = starHierarchy("C", 2);
    const graph = graphOf([...a.nodes, ...b.nodes, ...c.nodes], [...a.edges, ...b.edges, ...c.edges]);
    const findings = buildParallelHierarchiesFindings(repoWith(graph), graph, ctx.threshold("minHierarchySize"), ctx.threshold("minGroupSize"));
    expect(findings).toHaveLength(0);
  });

  it("control negativo: EXACTAMENTE 2 familias, archivos distintos, sin símbolos en común — sigue disparando (el caso que el detector SÍ debe cubrir)", () => {
    const ctx = testContext(detector, "*");
    const a = starHierarchy("Shape", 2);
    const b = starHierarchy("Renderer", 2);
    const graph = graphOf([...a.nodes, ...b.nodes], [...a.edges, ...b.edges]);
    const findings = buildParallelHierarchiesFindings(repoWith(graph), graph, ctx.threshold("minHierarchySize"), ctx.threshold("minGroupSize"));
    expect(findings).toHaveLength(1);
  });

  it("detector.run adapta un RepoUnit real, delegando en la misma función pura", () => {
    const ctx = testContext(detector, "*");
    const a = starHierarchy("Shape", 2);
    const b = starHierarchy("Renderer", 2);
    const graph = graphOf([...a.nodes, ...b.nodes], [...a.edges, ...b.edges]);
    const findings = detector.run(repoWith(graph), ctx);
    expect(findings).toHaveLength(1);
  });
});
