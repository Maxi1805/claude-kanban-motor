import { describe, expect, it } from "vitest";

import { fileNodeId, type CodeGraphEdge, type CodeGraphNode } from "../../graph/types.js";
import { computeTopAncestorFanIn, isWideFanIn, topAncestorFanInCount, WIDE_FANIN_MIN_TOP_ANCESTORS } from "./a2b-module-boundary.js";

function fileNode(file: string): CodeGraphNode {
  return { id: fileNodeId(file), kind: "file", file, symbolPath: [] };
}

function edge(from: string, to: string): CodeGraphEdge {
  return { from, to, kind: "references", provenance: "declared", weight: 1 };
}

const alwaysConfident = () => true;

describe("computeTopAncestorFanIn / topAncestorFanInCount", () => {
  it("cuenta primeros-segmentos de carpeta DISTINTOS, no aristas ni archivos crudos", () => {
    // Tres llamadores bajo el MISMO primer segmento ("guava") no deberían sumar más de 1.
    const nodes = [fileNode("guava/src/a.java"), fileNode("guava/src/b.java"), fileNode("guava/src/c.java"), fileNode("guava/target.java")];
    const nodeById = new Map(nodes.map((n) => [n.id, n] as const));
    const edges = [
      edge(fileNodeId("guava/src/a.java"), fileNodeId("guava/target.java")),
      edge(fileNodeId("guava/src/b.java"), fileNodeId("guava/target.java")),
      edge(fileNodeId("guava/src/c.java"), fileNodeId("guava/target.java")),
    ];
    const fanIn = computeTopAncestorFanIn(edges, nodeById, alwaysConfident);
    expect(topAncestorFanInCount(fanIn, "guava/target.java")).toBe(1);
  });

  it("módulo paralelo Maven, medido: la misma clase alcanzada desde 4 raíces de nivel superior distintas cuenta 4", () => {
    const target = "guava/src/com/google/common/base/Ticker.java";
    const callers = [
      "guava/src/com/google/common/cache/Cache.java",
      "android/guava/src/com/google/common/cache/Cache.java",
      "guava-testlib/src/com/google/common/testing/FakeTicker.java",
      "guava-gwt/src-super/com/google/common/base/super/Ticker.java",
    ];
    const nodes = [fileNode(target), ...callers.map(fileNode)];
    const nodeById = new Map(nodes.map((n) => [n.id, n] as const));
    const edges = callers.map((c) => edge(fileNodeId(c), fileNodeId(target)));
    const fanIn = computeTopAncestorFanIn(edges, nodeById, alwaysConfident);
    expect(topAncestorFanInCount(fanIn, target)).toBe(4);
    expect(isWideFanIn(topAncestorFanInCount(fanIn, target))).toBe(true);
  });

  it("contraejemplo medido — eslint: 3 llamadores reales, pero los TRES bajo el mismo primer segmento ('lib'): fan-in ancho es 1, no se activa", () => {
    // Geometría real de tests/golden/precision/eslint.verdicts.csv: linter.js, api.js y
    // rule-tester.js reeempiezan los tres directo en lib/languages/js/source-code — un
    // hallazgo VERDADERO que este mecanismo no debe apagar.
    const target = "lib/languages/js/source-code.js";
    const callers = ["lib/linter/linter.js", "lib/api.js", "lib/rule-tester/rule-tester.js"];
    const nodes = [fileNode(target), ...callers.map(fileNode)];
    const nodeById = new Map(nodes.map((n) => [n.id, n] as const));
    const edges = callers.map((c) => edge(fileNodeId(c), fileNodeId(target)));
    const fanIn = computeTopAncestorFanIn(edges, nodeById, alwaysConfident);
    expect(topAncestorFanInCount(fanIn, target)).toBe(1);
    expect(isWideFanIn(topAncestorFanInCount(fanIn, target))).toBe(false);
  });

  it("respeta `isConfidentEdge`: una arista descartada por el criterio del llamador no suma al fan-in", () => {
    const target = "pkg/a.go";
    const nodes = [fileNode(target), fileNode("root1/x.go"), fileNode("root2/y.go")];
    const nodeById = new Map(nodes.map((n) => [n.id, n] as const));
    const trusted = edge(fileNodeId("root1/x.go"), fileNodeId(target));
    const untrusted = { ...edge(fileNodeId("root2/y.go"), fileNodeId(target)), provenance: "inferred" as const };
    const isConfidentEdge = (e: CodeGraphEdge) => e.provenance !== "inferred";
    const fanIn = computeTopAncestorFanIn([trusted, untrusted], nodeById, isConfidentEdge);
    expect(topAncestorFanInCount(fanIn, target)).toBe(1);
  });

  it("intra-archivo (mismo archivo origen y destino) nunca cuenta como fan-in externo", () => {
    const target = "pkg/a.go";
    const nodes = [fileNode(target)];
    const nodeById = new Map(nodes.map((n) => [n.id, n] as const));
    const selfEdge = edge(fileNodeId(target), fileNodeId(target));
    const fanIn = computeTopAncestorFanIn([selfEdge], nodeById, alwaysConfident);
    expect(topAncestorFanInCount(fanIn, target)).toBe(0);
  });

  it("archivo sin ningún llamador de confianza: fan-in 0, no ancho", () => {
    const fanIn = computeTopAncestorFanIn([], new Map(), alwaysConfident);
    expect(topAncestorFanInCount(fanIn, "nunca-referenciado.go")).toBe(0);
    expect(isWideFanIn(0)).toBe(false);
  });

  it("borde del piso: WIDE_FANIN_MIN_TOP_ANCESTORS - 1 no es ancho, el piso exacto sí", () => {
    expect(isWideFanIn(WIDE_FANIN_MIN_TOP_ANCESTORS - 1)).toBe(false);
    expect(isWideFanIn(WIDE_FANIN_MIN_TOP_ANCESTORS)).toBe(true);
  });
});
