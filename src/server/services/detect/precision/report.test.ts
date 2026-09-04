import { describe, expect, it } from "vitest";

import {
  buildPrecisionReport,
  buildPrecisionReportByLanguage,
  formatPrecisionReport,
  formatPrecisionReportByLanguage,
  MIN_JUDGED_FOR_SIGNAL,
} from "./report.js";
import type { PrecisionRow } from "./types.js";

function row(overrides: Partial<PrecisionRow>): PrecisionRow {
  return {
    id: "k:1",
    slug: "s",
    kind: "k",
    language: "",
    pattern: "",
    file: "a.ts",
    startLine: 1,
    endLine: 2,
    symbol: "f",
    title: "t",
    detail: "d",
    metricLabel: "m",
    metricValue: "1",
    evidence: "e",
    verdict: "",
    patternFit: "",
    note: "",
    stillPresent: true,
    lossReason: "",
    ...overrides,
  };
}

describe("buildPrecisionReport", () => {
  it("precision null cuando nada está juzgado (pendiente no es 0)", () => {
    const [r] = buildPrecisionReport([row({})]);
    expect(r.precision).toBeNull();
    expect(r.pending).toBe(1);
  });

  it("dudoso se excluye del cálculo de precisión", () => {
    const rows = [row({ id: "1", verdict: "verdadero" }), row({ id: "2", verdict: "dudoso" })];
    const [r] = buildPrecisionReport(rows);
    expect(r.judged).toBe(1);
    expect(r.dudoso).toBe(1);
    expect(r.precision).toBe(1);
  });

  it("precisión = verdaderos / juzgados", () => {
    const rows = [
      row({ id: "1", verdict: "verdadero" }),
      row({ id: "2", verdict: "verdadero" }),
      row({ id: "3", verdict: "falso" }),
    ];
    const [r] = buildPrecisionReport(rows);
    expect(r.truePositive).toBe(2);
    expect(r.falsePositive).toBe(1);
    expect(r.precision).toBeCloseTo(2 / 3);
    expect(r.wilson).not.toBeNull();
  });

  it("patternPrecision sólo cuenta patternFit juzgado, separado de la precisión del ancla", () => {
    const rows = [
      row({ id: "1", verdict: "verdadero", pattern: "Decorator", patternFit: "verdadero" }),
      row({ id: "2", verdict: "verdadero", pattern: "Decorator", patternFit: "falso" }),
      row({ id: "3", verdict: "falso", pattern: "Decorator" }), // ancla falsa: patternFit no se juzga
    ];
    const [r] = buildPrecisionReport(rows);
    expect(r.withPattern).toBe(3);
    expect(r.patternJudged).toBe(2);
    expect(r.patternPrecision).toBeCloseTo(0.5);
  });

  it("agrupa por kind de forma independiente", () => {
    const rows = [row({ id: "1", kind: "a", verdict: "verdadero" }), row({ id: "2", kind: "b", verdict: "falso" })];
    const reports = buildPrecisionReport(rows);
    expect(reports.map((r) => r.kind)).toEqual(["a", "b"]);
    expect(reports.find((r) => r.kind === "a")!.precision).toBe(1);
    expect(reports.find((r) => r.kind === "b")!.precision).toBe(0);
  });

  it("sufficientBasis es false con judged>0 pero por debajo de MIN_JUDGED_FOR_SIGNAL — distinto de judged===0", () => {
    const fewJudged = Array.from({ length: MIN_JUDGED_FOR_SIGNAL - 1 }, (_, i) => row({ id: `${i}`, verdict: "verdadero" }));
    const [r] = buildPrecisionReport(fewJudged);
    expect(r.judged).toBeGreaterThan(0);
    expect(r.sufficientBasis).toBe(false);
    expect(r.precision).not.toBeNull(); // hay un número — sólo no alcanza para confiar en el intervalo
  });

  it("sufficientBasis es true al llegar a MIN_JUDGED_FOR_SIGNAL", () => {
    const enoughJudged = Array.from({ length: MIN_JUDGED_FOR_SIGNAL }, (_, i) => row({ id: `${i}`, verdict: "verdadero" }));
    const [r] = buildPrecisionReport(enoughJudged);
    expect(r.sufficientBasis).toBe(true);
  });
});

describe("buildPrecisionReportByLanguage", () => {
  it("agrupa por (kind, language) — un kind con dos lenguajes produce dos celdas independientes", () => {
    const rows = [
      row({ id: "1", kind: "k", language: "java", verdict: "verdadero" }),
      row({ id: "2", kind: "k", language: "ruby", verdict: "falso" }),
      row({ id: "3", kind: "k", language: "ruby", verdict: "falso" }),
    ];
    const reports = buildPrecisionReportByLanguage(rows);
    expect(reports).toHaveLength(2);
    const java = reports.find((r) => r.language === "java")!;
    const ruby = reports.find((r) => r.language === "ruby")!;
    expect(java.precision).toBe(1);
    expect(ruby.precision).toBe(0);
    // Caso testigo del encargo: un kind perfecto en un lenguaje y catastrófico
    // en otro — el promedio por kind a secas lo esconde, esto no.
  });

  it("language==='' (fila heredada de antes de este campo) es su PROPIA celda, nunca se funde con un lenguaje real", () => {
    const rows = [
      row({ id: "1", kind: "k", language: "java", verdict: "verdadero" }),
      row({ id: "2", kind: "k", language: "", verdict: "falso" }),
    ];
    const reports = buildPrecisionReportByLanguage(rows);
    expect(reports).toHaveLength(2);
    expect(reports.find((r) => r.language === "")!.precision).toBe(0);
    expect(reports.find((r) => r.language === "java")!.precision).toBe(1);
  });

  it("mismo kind, mismo lenguaje, dos slugs distintos: se agregan juntos (la pregunta es por lenguaje, no por población)", () => {
    const rows = [
      row({ id: "1", kind: "k", language: "java", slug: "guava", verdict: "verdadero" }),
      row({ id: "2", kind: "k", language: "java", slug: "otro-repo-java", verdict: "verdadero" }),
    ];
    const reports = buildPrecisionReportByLanguage(rows);
    expect(reports).toHaveLength(1);
    expect(reports[0].judged).toBe(2);
  });
});

describe("formatPrecisionReport / formatPrecisionReportByLanguage — flag de base insuficiente", () => {
  it("marca BASE INSUFICIENTE cuando 0 < judged < MIN_JUDGED_FOR_SIGNAL, nunca cuando judged===0", () => {
    const fewJudged = [row({ id: "1", verdict: "verdadero" })];
    const text = formatPrecisionReport(buildPrecisionReport(fewJudged));
    expect(text).toContain("BASE INSUFICIENTE");

    const noneJudged = [row({ id: "1" })];
    const textNone = formatPrecisionReport(buildPrecisionReport(noneJudged));
    expect(textNone).not.toContain("BASE INSUFICIENTE");
  });

  it("formatPrecisionReportByLanguage responde 'kind en lenguaje X, cuántos juzgados y qué precisión' directamente", () => {
    const rows = [
      row({ id: "1", kind: "demeter-chain", language: "java", verdict: "verdadero" }),
      row({ id: "2", kind: "demeter-chain", language: "java", verdict: "verdadero" }),
    ];
    const text = formatPrecisionReportByLanguage(buildPrecisionReportByLanguage(rows));
    expect(text).toContain("demeter-chain");
    expect(text).toContain("java");
    expect(text).toContain("BASE INSUFICIENTE");
  });
});
