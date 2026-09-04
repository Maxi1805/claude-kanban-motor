import { describe, expect, it } from "vitest";

import { detector, findInappropriateIntimacy } from "./inappropriate-intimacy.js";
import { testContext } from "../testing.js";
import type { RepoUnit } from "../types.js";
import { fileNodeId, symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type Provenance } from "../../graph/types.js";

/**
 * `inter-file`, `needsGraph: true`: no hace falta tree-sitter en absoluto —
 * el detector sólo lee `RepoUnit.graph` (nodos+aristas planas), así que este
 * test construye el grafo a mano, igual que `dependency-cycle.test.ts`/
 * `orphan-file.test.ts`. Por la misma razón, "≥3 lenguajes que emiten" no
 * aplica: el detector no clasifica por lenguaje salvo para la nota de
 * confianza en Java (ver el docstring del módulo); `ctx.language` es el
 * centinela `"*"` en producción.
 */
function fileNode(file: string): CodeGraphNode {
  return { id: fileNodeId(file), kind: "file", file, symbolPath: [] };
}

function symbolNode(file: string, name: string): CodeGraphNode {
  return { id: symbolNodeId(file, [name]), kind: "symbol", file, symbolPath: [name], family: "function-like" };
}

function refEdge(
  fromFile: string,
  fromName: string,
  toFile: string,
  toName: string,
  overrides: Partial<Pick<CodeGraphEdge, "kind" | "provenance" | "weight">> = {},
): CodeGraphEdge {
  return {
    from: symbolNodeId(fromFile, [fromName]),
    to: symbolNodeId(toFile, [toName]),
    kind: overrides.kind ?? "references",
    provenance: overrides.provenance ?? "declared",
    weight: overrides.weight ?? 1,
  };
}

function graphOf(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): CodeGraph {
  return {
    nodes,
    edges,
    resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
  };
}

function fileSummary(path: string, language = "typescript", lines = 20) {
  return { path, lines, language };
}

function repoWith(files: readonly ReturnType<typeof fileSummary>[], graph: CodeGraph | null): RepoUnit {
  return { repoName: "test", files, functions: [], clones: [], graph };
}

/** 3 símbolos por archivo, para armar breadth mutua >= 3 sin repetir código en cada test. */
function threeSymbolsEachWay(fileA: string, fileB: string, provenance: Provenance = "declared"): { nodes: CodeGraphNode[]; edges: CodeGraphEdge[] } {
  const names = ["m1", "m2", "m3"];
  const nodes: CodeGraphNode[] = [];
  const edges: CodeGraphEdge[] = [];
  for (const n of names) {
    nodes.push(symbolNode(fileA, `a_${n}`), symbolNode(fileB, `b_${n}`));
    edges.push(refEdge(fileA, `a_${n}`, fileB, `b_${n}`, { provenance }));
    edges.push(refEdge(fileB, `b_${n}`, fileA, `a_${n}`, { provenance }));
  }
  return { nodes, edges };
}

describe("inappropriate-intimacy", () => {
  it("dos archivos que referencian 3 símbolos distintos cada uno del otro: es un hallazgo (mutualBreadth=3)", () => {
    const threshold = testContext(detector, "*").threshold("minMutualBreadth");
    const { nodes, edges } = threeSymbolsEachWay("a/A.ts", "z/B.ts");
    const repo = repoWith([fileSummary("a/A.ts"), fileSummary("z/B.ts")], graphOf(nodes, edges));
    const findings = findInappropriateIntimacy(repo, threshold);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(3);
    expect(findings[0]!.title).toContain("A.ts");
    expect(findings[0]!.title).toContain("B.ts");
    expect(findings[0]!.locations[0]!.role).toContain("detalles internos");
    expect(findings[0]!.evidence!.some((e) => e.value === 3)).toBe(true);
  });

  it("control negativo: dependencia en un solo sentido (por más símbolos que toque) no es intimidad mutua", () => {
    const threshold = testContext(detector, "*").threshold("minMutualBreadth");
    const nodes = [symbolNode("a/A.ts", "a1"), symbolNode("a/A.ts", "a2"), symbolNode("a/A.ts", "a3"), symbolNode("z/B.ts", "b1")];
    const edges = [
      refEdge("a/A.ts", "a1", "z/B.ts", "b1"),
      refEdge("a/A.ts", "a2", "z/B.ts", "b1"),
      refEdge("a/A.ts", "a3", "z/B.ts", "b1"),
    ];
    const repo = repoWith([fileSummary("a/A.ts"), fileSummary("z/B.ts")], graphOf(nodes, edges));
    expect(findInappropriateIntimacy(repo, threshold)).toHaveLength(0);
  });

  it("control negativo: mutua pero por DEBAJO del piso (breadth 2 en cada dirección) no dispara — diferencia con dependency-cycle", () => {
    const threshold = testContext(detector, "*").threshold("minMutualBreadth");
    const nodes = [symbolNode("a/A.ts", "a1"), symbolNode("a/A.ts", "a2"), symbolNode("z/B.ts", "b1"), symbolNode("z/B.ts", "b2")];
    const edges = [
      refEdge("a/A.ts", "a1", "z/B.ts", "b1"),
      refEdge("a/A.ts", "a2", "z/B.ts", "b2"),
      refEdge("z/B.ts", "b1", "a/A.ts", "a1"),
      refEdge("z/B.ts", "b2", "a/A.ts", "a2"),
    ];
    const repo = repoWith([fileSummary("a/A.ts"), fileSummary("z/B.ts")], graphOf(nodes, edges));
    expect(findInappropriateIntimacy(repo, threshold)).toHaveLength(0);
  });

  it("el borde del umbral: un ciclo de tamaño 2 con un SOLO símbolo por dirección (mutualBreadth=1) no dispara — eso es sólo `dependency-cycle`", () => {
    const threshold = testContext(detector, "*").threshold("minMutualBreadth");
    const nodes = [symbolNode("a/A.ts", "a1"), symbolNode("z/B.ts", "b1")];
    const edges = [refEdge("a/A.ts", "a1", "z/B.ts", "b1"), refEdge("z/B.ts", "b1", "a/A.ts", "a1")];
    const repo = repoWith([fileSummary("a/A.ts"), fileSummary("z/B.ts")], graphOf(nodes, edges));
    expect(findInappropriateIntimacy(repo, threshold)).toHaveLength(0);
  });

  it("dos llamadas repetidas al MISMO símbolo cuentan como breadth 1, no 2: la magnitud es distinta, no ocurrencias", () => {
    const threshold = testContext(detector, "*").threshold("minMutualBreadth");
    const nodes = [symbolNode("a/A.ts", "a1"), symbolNode("z/B.ts", "b1")];
    const edges = [
      refEdge("a/A.ts", "a1", "z/B.ts", "b1", { weight: 5 }),
      refEdge("z/B.ts", "b1", "a/A.ts", "a1", { weight: 5 }),
    ];
    const repo = repoWith([fileSummary("a/A.ts"), fileSummary("z/B.ts")], graphOf(nodes, edges));
    // breadth 1 en cada sentido pese a peso 5: sigue por debajo del piso de 3.
    expect(findInappropriateIntimacy(repo, threshold)).toHaveLength(0);
  });

  it("provenance 'inferred' NO cuenta hacia la breadth: es evidencia positiva y se excluye a propósito (misma regla que dependency-cycle)", () => {
    const threshold = testContext(detector, "*").threshold("minMutualBreadth");
    const { nodes, edges } = threeSymbolsEachWay("a/A.java", "z/B.java", "inferred");
    const repo = repoWith([fileSummary("a/A.java", "java"), fileSummary("z/B.java", "java")], graphOf(nodes, edges));
    expect(findInappropriateIntimacy(repo, threshold)).toHaveLength(0);
  });

  it("provenance 'ambiguous' NO cuenta hacia la breadth (CONTRATO-F9.md §4.5, fuera de toda consulta por defecto)", () => {
    const threshold = testContext(detector, "*").threshold("minMutualBreadth");
    const { nodes, edges } = threeSymbolsEachWay("a/A.java", "z/B.java", "ambiguous");
    const repo = repoWith([fileSummary("a/A.java", "java"), fileSummary("z/B.java", "java")], graphOf(nodes, edges));
    expect(findInappropriateIntimacy(repo, threshold)).toHaveLength(0);
  });

  it("una arista 'contains' nunca cuenta hacia la breadth", () => {
    const threshold = testContext(detector, "*").threshold("minMutualBreadth");
    const { nodes, edges } = threeSymbolsEachWay("a/A.ts", "z/B.ts");
    const containsEdges = edges.map((e) => ({ ...e, kind: "contains" as const }));
    const repo = repoWith([fileSummary("a/A.ts"), fileSummary("z/B.ts")], graphOf(nodes, containsEdges));
    expect(findInappropriateIntimacy(repo, threshold)).toHaveLength(0);
  });

  it("referencias INTRA-archivo (mismo archivo) no cuentan como conocimiento cruzado entre archivos", () => {
    const threshold = testContext(detector, "*").threshold("minMutualBreadth");
    const nodes = [symbolNode("solo.ts", "a"), symbolNode("solo.ts", "b"), symbolNode("solo.ts", "c")];
    const edges = [
      refEdge("solo.ts", "a", "solo.ts", "b"),
      refEdge("solo.ts", "b", "solo.ts", "c"),
      refEdge("solo.ts", "c", "solo.ts", "a"),
    ];
    const repo = repoWith([fileSummary("solo.ts")], graphOf(nodes, edges));
    expect(findInappropriateIntimacy(repo, threshold)).toHaveLength(0);
  });

  /**
   * OLA P (P8), cambio A. Antes de esta ola un par de la MISMA carpeta era un
   * hallazgo de severidad reducida; 14 de los 15 falsos juzgados a mano de
   * este kind son exactamente ese caso (paquete de Go, módulo compañero de
   * Python, composable+wrapper de una carpeta de feature). Ahora no es un
   * hallazgo de baja severidad: no es un hallazgo.
   */
  it("un par en la MISMA carpeta NO es un hallazgo (es el mismo módulo), el mismo par en carpetas distintas SÍ", () => {
    const threshold = testContext(detector, "*").threshold("minMutualBreadth");
    const same = threeSymbolsEachWay("obs/A.ts", "obs/B.ts");
    const cross = threeSymbolsEachWay("a/A.ts", "b/B.ts");
    const sameFolderFindings = findInappropriateIntimacy(
      repoWith([fileSummary("obs/A.ts"), fileSummary("obs/B.ts")], graphOf(same.nodes, same.edges)),
      threshold,
    );
    const crossFolderFindings = findInappropriateIntimacy(
      repoWith([fileSummary("a/A.ts"), fileSummary("b/B.ts")], graphOf(cross.nodes, cross.edges)),
      threshold,
    );
    expect(sameFolderFindings).toHaveLength(0);
    expect(crossFolderFindings).toHaveLength(1);
    expect(crossFolderFindings[0]!.detail).toContain("CARPETAS DISTINTAS");
  });

  /**
   * OLA P (P8), cambio B: `calls` es la partición callee de la MISMA cascada
   * que produce `references` (`graph/edge-kinds.ts`). Filtrar por
   * `kind === "references"` dejaba fuera TODA llamada a un método, que es la
   * evidencia central de "conoce los detalles internos del otro".
   */
  it("aristas `calls` cuentan hacia la breadth igual que `references` (misma cascada, partición callee)", () => {
    const threshold = testContext(detector, "*").threshold("minMutualBreadth");
    const { nodes, edges } = threeSymbolsEachWay("a/A.ts", "b/B.ts");
    const asCalls = edges.map((e) => ({ ...e, kind: "calls" as const }));
    const repo = repoWith([fileSummary("a/A.ts"), fileSummary("b/B.ts")], graphOf(nodes, asCalls));
    const findings = findInappropriateIntimacy(repo, threshold);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(3);
  });

  it("severidad acotada (P5, criterio unificado) cuando la MAYORÍA de las aristas 'references' del par son 'inferred'", () => {
    const threshold = testContext(detector, "*").threshold("minMutualBreadth");
    const { nodes, edges } = threeSymbolsEachWay("a/A.ts", "z/B.ts");
    // Ruido: aristas 'inferred' extra entre el mismo par (no cuentan hacia mutualBreadth, que sigue siendo 3),
    // pero SÍ hacen que la mayoría de TODAS las aristas 'references' entre a/A.ts y z/B.ts sean 'inferred'.
    const noiseNodes = [symbolNode("a/A.ts", "n1"), symbolNode("z/B.ts", "n2")];
    const noiseEdges = Array.from({ length: 10 }, () => refEdge("a/A.ts", "n1", "z/B.ts", "n2", { provenance: "inferred" }));
    const repo = repoWith([fileSummary("a/A.ts"), fileSummary("z/B.ts")], graphOf([...nodes, ...noiseNodes], [...edges, ...noiseEdges]));
    const confidentRepo = repoWith([fileSummary("a/A.ts"), fileSummary("z/B.ts")], graphOf(nodes, edges));
    const findings = findInappropriateIntimacy(repo, threshold);
    const confidentFindings = findInappropriateIntimacy(confidentRepo, threshold);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(3); // mutualBreadth sin cambios: el ruido es 'inferred', no cuenta
    expect(findings[0]!.severity).toBeLessThanOrEqual(35);
    expect(findings[0]!.severity).toBeLessThan(confidentFindings[0]!.severity);
    expect(findings[0]!.detail).toContain("Severidad acotada");
  });

  it("java: el detail advierte explícitamente sobre la brecha de path-proximity (sub-reporte, no sobre-reporte)", () => {
    const threshold = testContext(detector, "*").threshold("minMutualBreadth");
    const { nodes, edges } = threeSymbolsEachWay("a/A.java", "z/B.java");
    const repo = repoWith([fileSummary("a/A.java", "java"), fileSummary("z/B.java", "java")], graphOf(nodes, edges));
    const findings = findInappropriateIntimacy(repo, threshold);
    expect(findings[0]!.detail).toContain("path-proximity");
    expect(findings[0]!.detail).toContain("SUB-reportado");
  });

  it("advice ofrece las DOS lecturas: primary (reducir acoplamiento) y alternatives (fusionar, Inline Class)", () => {
    const threshold = testContext(detector, "*").threshold("minMutualBreadth");
    const { nodes, edges } = threeSymbolsEachWay("a/A.ts", "z/B.ts");
    const repo = repoWith([fileSummary("a/A.ts"), fileSummary("z/B.ts")], graphOf(nodes, edges));
    const findings = findInappropriateIntimacy(repo, threshold);
    expect(findings[0]!.advice.primary.name).toBe("Move Method");
    expect(findings[0]!.advice.alternatives?.[0]?.name).toBe("Inline Class");
  });

  it("sin grafo (RepoUnit.graph === null): la función devuelve vacío, nunca lanza — el runner es quien reporta 'sin-grafo'", () => {
    const threshold = testContext(detector, "*").threshold("minMutualBreadth");
    const repo: RepoUnit = { repoName: "r", files: [], functions: [], clones: [], graph: null };
    expect(findInappropriateIntimacy(repo, threshold)).toHaveLength(0);
  });

  it("el borde del umbral (citado: Regla de Tres, Roberts/Fowler) se pide a testContext", () => {
    const threshold = testContext(detector, "*").threshold("minMutualBreadth");
    expect(threshold.value).toBe(3);
    expect(threshold.kind).toBe("citado");
    expect(threshold.label).toContain("Fowler");
  });

  it("el detector declara needsGraph:true y needs:[] (no depende de ninguna capacidad de lenguaje)", () => {
    expect(detector.needsGraph).toBe(true);
    expect(detector.needs).toEqual([]);
    expect(detector.scope).toBe("inter-file");
  });

  it("detector.run adapta un RepoUnit real, delegando en la misma función pura", () => {
    const { nodes, edges } = threeSymbolsEachWay("a/A.ts", "z/B.ts");
    const repo = repoWith([fileSummary("a/A.ts"), fileSummary("z/B.ts")], graphOf(nodes, edges));
    const ctx = testContext(detector, "*");
    const findings = detector.run(repo, ctx);
    expect(findings).toHaveLength(1);
  });

  it("un par sin ninguna arista entre los dos archivos no produce hallazgos", () => {
    const threshold = testContext(detector, "*").threshold("minMutualBreadth");
    const repo = repoWith(
      [fileSummary("a/A.ts"), fileSummary("z/B.ts")],
      graphOf([fileNode("a/A.ts"), fileNode("z/B.ts")], []),
    );
    expect(findInappropriateIntimacy(repo, threshold)).toHaveLength(0);
  });
});
