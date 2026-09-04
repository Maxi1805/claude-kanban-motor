import { describe, expect, it } from "vitest";

import { symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type Provenance } from "../../graph/types.js";
import { detector, buildShotgunSurgeryFindings } from "./shotgun-surgery.js";
import { testContext } from "../testing.js";
import type { FileSummary, RepoUnit } from "../types.js";

/**
 * `inter-file`, `needsGraph: true`: igual que `unused-symbol.test.ts` y
 * `dependency-cycle.test.ts`, este detector opera enteramente sobre
 * `CodeGraph` — el grafo se arma A MANO, sin tree-sitter. "≥3 lenguajes que
 * emiten" no aplica: la señal es la forma del grafo de referencias, no la
 * gramática de un lenguaje (ver el docstring del módulo).
 */

function symNode(file: string, symbolPath: readonly string[], overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return {
    id: symbolNodeId(file, symbolPath),
    kind: "symbol",
    file,
    symbolPath,
    family: "function-like",
    startLine: 1,
    endLine: 5,
    ...overrides,
  };
}

function refEdge(
  fromFile: string,
  fromScope: readonly string[],
  toFile: string,
  toSymbolPath: readonly string[],
  provenance: Provenance = "resolved",
): CodeGraphEdge {
  return {
    from: symbolNodeId(fromFile, fromScope),
    to: symbolNodeId(toFile, toSymbolPath),
    kind: "references",
    provenance,
    weight: 1,
  };
}

const EMPTY_STATS = { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] };

function graphOf(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): CodeGraph {
  return { nodes, edges, resolution: EMPTY_STATS };
}

function repoWith(graph: CodeGraph | null, files: readonly FileSummary[] = []): RepoUnit {
  return { repoName: "test", files, functions: [], clones: [], graph };
}

/** Un llamador `function-like` distinto por cada (archivo, nombre) pedido, todos apuntando al mismo target. */
function manyCallers(targetFile: string, targetName: string, callerFiles: readonly string[]): { nodes: CodeGraphNode[]; edges: CodeGraphEdge[] } {
  const nodes: CodeGraphNode[] = [];
  const edges: CodeGraphEdge[] = [];
  callerFiles.forEach((file, i) => {
    const callerName = `caller${i}`;
    nodes.push(symNode(file, [callerName]));
    edges.push(refEdge(file, [callerName], targetFile, [targetName]));
  });
  return { nodes, edges };
}

describe("shotgun-surgery", () => {
  it("javascript-como-grafo: símbolo llamado desde 6 sitios en 4 archivos distintos dispara", () => {
    const ctx = testContext(detector, "*");
    const minCallers = ctx.threshold("minCallers").value; // 6
    const minFiles = ctx.threshold("minFiles").value; // 4

    // 4 archivos, con 2 de ellos aportando 2 llamadores cada uno para llegar a minCallers manteniendo minFiles.
    const callerFiles = ["a.js", "a.js", "b.js", "c.js", "d.js", "d.js"].slice(0, minCallers);
    // Asegura exactamente minFiles archivos distintos entre los minCallers llamadores.
    const distinctFiles = Array.from({ length: minFiles }, (_, i) => `caller${i}.js`);
    while (callerFiles.length < minCallers) callerFiles.push(distinctFiles[callerFiles.length % minFiles]!);

    const target = symNode("target.js", ["hot"]);
    const { nodes, edges } = manyCallers("target.js", "hot", callerFiles);
    const graph = graphOf([target, ...nodes], edges);

    const findings = buildShotgunSurgeryFindings(
      [{ path: "target.js", lines: 10, language: "javascript" }],
      graph,
      ctx.threshold("minCallers"),
      ctx.threshold("minFiles"),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(minCallers);
    expect(findings[0]!.trigger[1]!.value).toBeGreaterThanOrEqual(minFiles);
    expect(findings[0]!.locations[0]!.role).toBe("símbolo cuyo cambio dispersa el impacto sobre otros archivos");
    expect(findings[0]!.locations[0]!.symbol).toBe("hot");
    expect(findings[0]!.title).toContain("hot");
  });

  it("control negativo: mismos 6 llamadores pero TODOS en el mismo archivo (CC=0 fuera del propio) no dispara", () => {
    const ctx = testContext(detector, "*");
    const minCallers = ctx.threshold("minCallers").value;
    const target = symNode("target.js", ["hot"]);
    const callers: CodeGraphNode[] = [];
    const edges: CodeGraphEdge[] = [];
    for (let i = 0; i < minCallers; i++) {
      callers.push(symNode("target.js", [`caller${i}`]));
      edges.push(refEdge("target.js", [`caller${i}`], "target.js", ["hot"]));
    }
    const graph = graphOf([target, ...callers], edges);
    const findings = buildShotgunSurgeryFindings(
      [{ path: "target.js", lines: 10, language: "javascript" }],
      graph,
      ctx.threshold("minCallers"),
      ctx.threshold("minFiles"),
    );
    expect(findings).toHaveLength(0);
  });

  it("control negativo: CM por debajo del umbral (muchos archivos, pocos llamadores) no dispara", () => {
    const ctx = testContext(detector, "*");
    const minFiles = ctx.threshold("minFiles").value;
    const target = symNode("target.js", ["hot"]);
    const callerFiles = Array.from({ length: minFiles + 2 }, (_, i) => `f${i}.js`);
    const { nodes, edges } = manyCallers("target.js", "hot", callerFiles.slice(0, 2)); // sólo 2 llamadores
    const graph = graphOf([target, ...nodes], edges);
    const findings = buildShotgunSurgeryFindings(
      [{ path: "target.js", lines: 10, language: "javascript" }],
      graph,
      ctx.threshold("minCallers"),
      ctx.threshold("minFiles"),
    );
    expect(findings).toHaveLength(0);
  });

  it("borde del umbral: justo en minCallers/minFiles dispara, uno menos de cualquiera de los dos no", () => {
    const ctx = testContext(detector, "*");
    const minCallers = ctx.threshold("minCallers");
    const minFiles = ctx.threshold("minFiles");

    const buildGraph = (callerCount: number, fileCount: number): CodeGraph => {
      const target = symNode("target.js", ["hot"]);
      const nodes: CodeGraphNode[] = [target];
      const edges: CodeGraphEdge[] = [];
      for (let i = 0; i < callerCount; i++) {
        const file = `f${i % fileCount}.js`;
        nodes.push(symNode(file, [`caller${i}`]));
        edges.push(refEdge(file, [`caller${i}`], "target.js", ["hot"]));
      }
      return graphOf(nodes, edges);
    };

    const atThreshold = buildShotgunSurgeryFindings(
      [{ path: "target.js", lines: 10, language: "javascript" }],
      buildGraph(minCallers.value, minFiles.value),
      minCallers,
      minFiles,
    );
    expect(atThreshold).toHaveLength(1);

    const belowCallers = buildShotgunSurgeryFindings(
      [{ path: "target.js", lines: 10, language: "javascript" }],
      buildGraph(minCallers.value - 1, minFiles.value),
      minCallers,
      minFiles,
    );
    expect(belowCallers).toHaveLength(0);

    const belowFiles = buildShotgunSurgeryFindings(
      [{ path: "target.js", lines: 10, language: "javascript" }],
      buildGraph(minCallers.value, minFiles.value - 1),
      minCallers,
      minFiles,
    );
    expect(belowFiles).toHaveLength(0);
  });

  it("aristas `inferred` se excluyen del conteo (evidencia positiva de acoplamiento — CONTRATO-F5.md §4.4)", () => {
    const ctx = testContext(detector, "*");
    const minCallers = ctx.threshold("minCallers").value;
    const minFiles = ctx.threshold("minFiles").value;
    const target = symNode("target.js", ["hot"]);
    const nodes: CodeGraphNode[] = [target];
    const edges: CodeGraphEdge[] = [];
    // Suficientes llamadores/archivos, pero TODOS `inferred`: no deberían contar.
    for (let i = 0; i < minCallers + 2; i++) {
      const file = `f${i % (minFiles + 2)}.js`;
      nodes.push(symNode(file, [`caller${i}`]));
      edges.push(refEdge(file, [`caller${i}`], "target.js", ["hot"], "inferred"));
    }
    const graph = graphOf(nodes, edges);
    const findings = buildShotgunSurgeryFindings(
      [{ path: "target.js", lines: 10, language: "java" }],
      graph,
      ctx.threshold("minCallers"),
      ctx.threshold("minFiles"),
    );
    expect(findings).toHaveLength(0);
  });

  it("aristas `ambiguous` se excluyen del conteo (CONTRATO-F9.md §4.5, fuera de toda consulta por defecto)", () => {
    const ctx = testContext(detector, "*");
    const minCallers = ctx.threshold("minCallers").value;
    const minFiles = ctx.threshold("minFiles").value;
    const target = symNode("target.js", ["hot"]);
    const nodes: CodeGraphNode[] = [target];
    const edges: CodeGraphEdge[] = [];
    // Suficientes llamadores/archivos, pero TODOS `ambiguous`: no deberían contar.
    for (let i = 0; i < minCallers + 2; i++) {
      const file = `f${i % (minFiles + 2)}.js`;
      nodes.push(symNode(file, [`caller${i}`]));
      edges.push(refEdge(file, [`caller${i}`], "target.js", ["hot"], "ambiguous"));
    }
    const graph = graphOf(nodes, edges);
    const findings = buildShotgunSurgeryFindings(
      [{ path: "target.js", lines: 10, language: "java" }],
      graph,
      ctx.threshold("minCallers"),
      ctx.threshold("minFiles"),
    );
    expect(findings).toHaveLength(0);
  });

  it("símbolo `class-like` con el mismo patrón de fan-in disperso no dispara (fuera de alcance declarado)", () => {
    const ctx = testContext(detector, "*");
    const minCallers = ctx.threshold("minCallers").value;
    const minFiles = ctx.threshold("minFiles").value;
    const target = symNode("target.js", ["Hot"], { family: "class-like" });
    const nodes: CodeGraphNode[] = [target];
    const edges: CodeGraphEdge[] = [];
    for (let i = 0; i < minCallers + 2; i++) {
      const file = `f${i % (minFiles + 2)}.js`;
      nodes.push(symNode(file, [`caller${i}`]));
      edges.push(refEdge(file, [`caller${i}`], "target.js", ["Hot"]));
    }
    const graph = graphOf(nodes, edges);
    const findings = buildShotgunSurgeryFindings(
      [{ path: "target.js", lines: 10, language: "javascript" }],
      graph,
      ctx.threshold("minCallers"),
      ctx.threshold("minFiles"),
    );
    expect(findings).toHaveLength(0);
  });

  it("grafo ausente: `graph: null` — el runner ya reporta `sin-grafo` antes de llamar a run(); el `return []` defensivo de run() no debería ejecutarse en producción, pero se verifica igual", () => {
    const repo = repoWith(null, [{ path: "a.js", lines: 10, language: "javascript" }]);
    const findings = detector.run(repo, testContext(detector, "*"));
    expect(findings).toHaveLength(0);
  });
});
