import { describe, expect, it } from "vitest";

import { buildFanoutWithoutCohesionFindings, detector } from "./fanout-without-cohesion.js";
import { testContext } from "../testing.js";
import type { RepoUnit } from "../types.js";
import { fileNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type Provenance } from "../../graph/types.js";

/**
 * `inter-file`, `needsGraph: true`: sólo lee `RepoUnit.graph` (nodos+aristas
 * planas) más `RepoUnit.files` — mismo idioma de test que
 * `dependency-cycle.test.ts`/`orphan-file.test.ts`, construyendo el grafo a
 * mano. "≥3 lenguajes que emiten" no aplica: el detector no clasifica por
 * lenguaje salvo para bajar severidad cuando la mayoría de las aristas de un
 * archivo son `inferred` (ver el docstring del módulo), `ctx.language` es el
 * centinela `"*"` en producción.
 */
function fileNode(file: string): CodeGraphNode {
  return { id: fileNodeId(file), kind: "file", file, symbolPath: [] };
}

function edge(from: string, to: string, provenance: Provenance = "declared"): CodeGraphEdge {
  return { from: fileNodeId(from), to: fileNodeId(to), kind: "references", provenance, weight: 1 };
}

function graphOf(files: readonly string[], edges: readonly CodeGraphEdge[]): CodeGraph {
  return {
    nodes: files.map(fileNode),
    edges,
    resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
  };
}

function repoWith(files: readonly string[], edges: readonly CodeGraphEdge[], lines = 10): RepoUnit {
  return {
    repoName: "test",
    files: files.map((path) => ({ path, lines, language: "typescript" })),
    functions: [],
    clones: [],
    graph: graphOf(files, edges),
  };
}

function neighborNames(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `neighbor/N${i}.ts`);
}

/**
 * Hub -> N vecinos distintos (fan-out = N), más `extraEdges` entre los
 * PROPIOS vecinos (para variar el coeficiente de agrupamiento del hub sin
 * tocar su fan-out). `extraEdges` es una lista de pares [i, j] con
 * i, j < N: un mesh completo se genera con `allPairs(N)` más abajo.
 */
function hubGraph(hubFanOut: number, extraEdgesAmongNeighbors: readonly (readonly [number, number])[]): { files: string[]; edges: CodeGraphEdge[] } {
  const neighbors = neighborNames(hubFanOut);
  const files = ["hub.ts", ...neighbors];
  const edges: CodeGraphEdge[] = neighbors.map((n) => edge("hub.ts", n));
  for (const [i, j] of extraEdgesAmongNeighbors) edges.push(edge(neighbors[i]!, neighbors[j]!));
  return { files, edges };
}

/** Todos los pares {i,j} con i<j entre 0..n-1 — mesh completo (coeficiente máximo). */
function allPairs(n: number): (readonly [number, number])[] {
  const pairs: (readonly [number, number])[] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([i, j]);
  return pairs;
}

describe("fanout-without-cohesion", () => {
  it("mediator roto: fan-out alto y vecinos que NO se conocen entre sí (coeficiente 0) es un hallazgo", () => {
    const minFanOut = testContext(detector, "*").threshold("minFanOut");
    const maxClustering = testContext(detector, "*").threshold("maxClustering");
    const { files, edges } = hubGraph(minFanOut.value, []); // sin aristas entre vecinos ⇒ coeficiente 0
    const repo = repoWith(files, edges);
    const findings = buildFanoutWithoutCohesionFindings(repo, repo.graph!, minFanOut, maxClustering);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.file).toBe("hub.ts");
    expect(findings[0]!.trigger[0]!.value).toBe(minFanOut.value);
    expect(findings[0]!.trigger[1]!.value).toBe(0);
    expect(findings[0]!.locations[0]!.role).toContain("fan-out alto");
  });

  it("control negativo — facade bien aplicado: mismo fan-out, pero los vecinos forman un mesh completo (coeficiente alto), no dispara", () => {
    const minFanOut = testContext(detector, "*").threshold("minFanOut");
    const maxClustering = testContext(detector, "*").threshold("maxClustering");
    const { files, edges } = hubGraph(minFanOut.value, allPairs(minFanOut.value));
    const repo = repoWith(files, edges);
    const findings = buildFanoutWithoutCohesionFindings(repo, repo.graph!, minFanOut, maxClustering);
    expect(findings).toHaveLength(0);
  });

  it("control negativo: fan-out por debajo del umbral no dispara aunque el coeficiente sea 0", () => {
    const minFanOut = testContext(detector, "*").threshold("minFanOut");
    const maxClustering = testContext(detector, "*").threshold("maxClustering");
    const { files, edges } = hubGraph(minFanOut.value - 1, []);
    const repo = repoWith(files, edges);
    const findings = buildFanoutWithoutCohesionFindings(repo, repo.graph!, minFanOut, maxClustering);
    expect(findings).toHaveLength(0);
  });

  it("el borde del umbral de fan-out (citado, SonarSource S1200) se pide a testContext: justo en el valor dispara, uno menos no", () => {
    const minFanOut = testContext(detector, "*").threshold("minFanOut");
    const maxClustering = testContext(detector, "*").threshold("maxClustering");
    expect(minFanOut.label).toContain("SonarSource");

    const atThreshold = hubGraph(minFanOut.value, []);
    const belowThreshold = hubGraph(minFanOut.value - 1, []);
    const repoAt = repoWith(atThreshold.files, atThreshold.edges);
    const repoBelow = repoWith(belowThreshold.files, belowThreshold.edges);
    expect(buildFanoutWithoutCohesionFindings(repoAt, repoAt.graph!, minFanOut, maxClustering)).toHaveLength(1);
    expect(buildFanoutWithoutCohesionFindings(repoBelow, repoBelow.graph!, minFanOut, maxClustering)).toHaveLength(0);
  });

  it("el umbral de coeficiente (piso declarado, 0.2) se pide a testContext, nunca escrito a mano", () => {
    const maxClustering = testContext(detector, "*").threshold("maxClustering");
    expect(maxClustering.value).toBeCloseTo(0.2, 5);
  });

  it("severidad crece con el EXCESO de fan-out sobre el umbral, a igual coeficiente (0)", () => {
    const minFanOut = testContext(detector, "*").threshold("minFanOut");
    const maxClustering = testContext(detector, "*").threshold("maxClustering");
    const small = hubGraph(minFanOut.value, []);
    const big = hubGraph(minFanOut.value + 30, []);
    const repoSmall = repoWith(small.files, small.edges);
    const repoBig = repoWith(big.files, big.edges);
    const findingsSmall = buildFanoutWithoutCohesionFindings(repoSmall, repoSmall.graph!, minFanOut, maxClustering);
    const findingsBig = buildFanoutWithoutCohesionFindings(repoBig, repoBig.graph!, minFanOut, maxClustering);
    expect(findingsBig[0]!.severity).toBeGreaterThan(findingsSmall[0]!.severity);
  });

  it("mayoría de aristas 'inferred' (path-proximity, caso Java): severidad acotada a un techo bajo, y el detail lo dice", () => {
    const minFanOut = testContext(detector, "*").threshold("minFanOut");
    const maxClustering = testContext(detector, "*").threshold("maxClustering");
    const neighbors = neighborNames(minFanOut.value);
    const files = ["hub.java", ...neighbors];
    // Todas las aristas del hub 'inferred': mayoría heurística.
    const edges = neighbors.map((n) => edge("hub.java", n, "inferred"));
    const repo: RepoUnit = {
      repoName: "test",
      files: files.map((path) => ({ path, lines: 10, language: "java" })),
      functions: [],
      clones: [],
      graph: graphOf(files, edges),
    };
    const declaredRepo = repoWith(files, neighbors.map((n) => edge("hub.java", n, "declared")));
    const findingsInferred = buildFanoutWithoutCohesionFindings(repo, repo.graph!, minFanOut, maxClustering);
    const findingsDeclared = buildFanoutWithoutCohesionFindings(declaredRepo, declaredRepo.graph!, minFanOut, maxClustering);
    expect(findingsInferred).toHaveLength(1);
    expect(findingsInferred[0]!.severity).toBeLessThanOrEqual(35);
    expect(findingsInferred[0]!.severity).toBeLessThan(findingsDeclared[0]!.severity);
    expect(findingsInferred[0]!.detail).toContain("path-proximity");
  });

  it("sin grafo (RepoUnit.graph === null): detector.run devuelve vacío, nunca lanza — el runner reporta 'sin-grafo'", () => {
    const repo: RepoUnit = { repoName: "r", files: [], functions: [], clones: [], graph: null };
    const ctx = testContext(detector, "*");
    expect(detector.run(repo, ctx)).toHaveLength(0);
  });

  it("grafo vacío (sin nodos): no dispara ni explota", () => {
    const minFanOut = testContext(detector, "*").threshold("minFanOut");
    const maxClustering = testContext(detector, "*").threshold("maxClustering");
    const repo: RepoUnit = { repoName: "r", files: [], functions: [], clones: [], graph: graphOf([], []) };
    expect(buildFanoutWithoutCohesionFindings(repo, repo.graph!, minFanOut, maxClustering)).toHaveLength(0);
  });

  it("el detector declara needsGraph:true y needs:[] (forma del grafo, no gramática de lenguaje)", () => {
    expect(detector.needsGraph).toBe(true);
    expect(detector.needs).toEqual([]);
    expect(detector.scope).toBe("inter-file");
  });

  it("detector.run adapta un RepoUnit real, delegando en la misma función pura", () => {
    const minFanOut = testContext(detector, "*").threshold("minFanOut");
    const { files, edges } = hubGraph(minFanOut.value, []);
    const repo = repoWith(files, edges);
    const ctx = testContext(detector, "*");
    const findings = detector.run(repo, ctx);
    expect(findings).toHaveLength(1);
  });
});
