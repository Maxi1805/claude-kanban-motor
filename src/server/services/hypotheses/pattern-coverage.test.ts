import { describe, expect, it } from "vitest";

import { computePatternCoverage, type DetectorCoverageLite, type PatternAnchors } from "./pattern-coverage.js";

describe("computePatternCoverage", () => {
  it("con al menos una hipótesis construida, siempre 'evaluado', sin mirar cobertura", () => {
    const patterns: PatternAnchors[] = [{ pattern: "Proxy", anchors: ["lazy-init-repetida"] }];
    const totals = new Map([["Proxy", 3]]);
    // Cobertura contradictoria a propósito (sin-aristas): igual gana "evaluado", porque YA hubo hipótesis.
    const coverage: DetectorCoverageLite[] = [{ detectorId: "lazy-init-repetida", kind: "lazy-init-repetida", status: "sin-aristas" }];
    const result = computePatternCoverage(patterns, totals, coverage);
    expect(result).toEqual([{ pattern: "Proxy", status: "evaluado", totalHypotheses: 3 }]);
  });

  it("0 hipótesis y el detector-ancla en 'sin-aristas' ⇒ 'sin-insumo', con blockedBy", () => {
    const patterns: PatternAnchors[] = [{ pattern: "Jerarquías paralelas (hipótesis)", anchors: ["parallel-hierarchies"] }];
    const totals = new Map<string, number>();
    const coverage: DetectorCoverageLite[] = [
      { detectorId: "parallel-hierarchies", kind: "parallel-hierarchies", status: "sin-aristas" },
    ];
    const result = computePatternCoverage(patterns, totals, coverage);
    expect(result).toEqual([
      {
        pattern: "Jerarquías paralelas (hipótesis)",
        status: "sin-insumo",
        totalHypotheses: 0,
        blockedBy: [{ detectorId: "parallel-hierarchies", kind: "parallel-hierarchies", status: "sin-aristas" }],
      },
    ]);
  });

  it("0 hipótesis pero el detector-ancla 'corrio' ⇒ 'evaluado' (se miró y no había candidatos)", () => {
    const patterns: PatternAnchors[] = [{ pattern: "Composite", anchors: ["inheritance-family"] }];
    const totals = new Map<string, number>();
    const coverage: DetectorCoverageLite[] = [
      { detectorId: "inheritance-family", kind: "inheritance-family", status: "corrio" },
    ];
    const result = computePatternCoverage(patterns, totals, coverage);
    expect(result).toEqual([{ pattern: "Composite", status: "evaluado", totalHypotheses: 0 }]);
  });

  it("0 hipótesis, un ancla con VARIAS filas (multi-lenguaje) — una sola 'corrio' entre varias 'no-aplicable' ya alcanza para 'evaluado'", () => {
    const patterns: PatternAnchors[] = [{ pattern: "Iterator", anchors: ["some-intra-detector"] }];
    const totals = new Map<string, number>();
    const coverage: DetectorCoverageLite[] = [
      { detectorId: "some-intra-detector", kind: "some-intra-detector", status: "no-aplicable" },
      { detectorId: "some-intra-detector", kind: "some-intra-detector", status: "sin-aristas" },
      { detectorId: "some-intra-detector", kind: "some-intra-detector", status: "corrio" },
    ];
    const result = computePatternCoverage(patterns, totals, coverage);
    expect(result[0]!.status).toBe("evaluado");
  });

  it("0 hipótesis, TODAS las filas del ancla sin correr de verdad (multi-lenguaje) ⇒ 'sin-insumo' con las 3 filas de evidencia", () => {
    const patterns: PatternAnchors[] = [{ pattern: "Iterator", anchors: ["some-intra-detector"] }];
    const totals = new Map<string, number>();
    const coverage: DetectorCoverageLite[] = [
      { detectorId: "some-intra-detector", kind: "some-intra-detector", status: "no-aplicable" },
      { detectorId: "some-intra-detector", kind: "some-intra-detector", status: "sin-aristas" },
    ];
    const result = computePatternCoverage(patterns, totals, coverage);
    expect(result[0]).toEqual({
      pattern: "Iterator",
      status: "sin-insumo",
      totalHypotheses: 0,
      blockedBy: coverage,
    });
  });

  it("0 hipótesis y NINGUNA fila de cobertura para el kind del ancla ⇒ 'evaluado' (nada concreto que culpar)", () => {
    const patterns: PatternAnchors[] = [{ pattern: "Observer", anchors: ["kind-inexistente-esta-corrida"] }];
    const totals = new Map<string, number>();
    const result = computePatternCoverage(patterns, totals, []);
    expect(result).toEqual([{ pattern: "Observer", status: "evaluado", totalHypotheses: 0 }]);
  });

  it("un patrón con DOS anclas: alcanza con que UNA haya corrido de verdad para 'evaluado'", () => {
    const patterns: PatternAnchors[] = [{ pattern: "Null Object", anchors: ["distributed-duplication", "speculative-abstraction"] }];
    const totals = new Map<string, number>();
    const coverage: DetectorCoverageLite[] = [
      { detectorId: "distributed-duplication", kind: "distributed-duplication", status: "corrio" },
      { detectorId: "speculative-abstraction", kind: "speculative-abstraction", status: "sin-aristas" },
    ];
    const result = computePatternCoverage(patterns, totals, coverage);
    expect(result[0]!.status).toBe("evaluado");
  });

  it("preserva el orden de entrada y procesa cada patrón independientemente", () => {
    const patterns: PatternAnchors[] = [
      { pattern: "A", anchors: ["x"] },
      { pattern: "B", anchors: ["y"] },
    ];
    const totals = new Map([["A", 1]]);
    const coverage: DetectorCoverageLite[] = [{ detectorId: "y-det", kind: "y", status: "sin-grafo" }];
    const result = computePatternCoverage(patterns, totals, coverage);
    expect(result.map((r) => r.pattern)).toEqual(["A", "B"]);
    expect(result[0]!.status).toBe("evaluado");
    expect(result[1]!.status).toBe("sin-insumo");
  });
});
