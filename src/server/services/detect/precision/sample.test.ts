import { describe, expect, it } from "vitest";

import { actionablePatterns, buildLiveContentKeyIndex, selectSample, toPrecisionRow } from "./sample.js";
import { contentKeyForFinding } from "../../code-finding-ids.js";
import type { CodeFinding, CodeFindingHypothesis, CodeFindingHypothesisState } from "../../../../shared/types.js";

/** Fixture mínima — sólo los campos que `actionablePatterns`/`toPrecisionRow` leen (`pattern`, `state`); el resto es irrelevante para estos tests. */
function hyp(pattern: string, state: CodeFindingHypothesisState): CodeFindingHypothesis {
  return { pattern, state } as unknown as CodeFindingHypothesis;
}

function finding(id: string, kind: string, overrides: Partial<CodeFinding> = {}): CodeFinding {
  return {
    id,
    kind,
    title: `título ${id}`,
    detail: `detalle ${id}`,
    metric: { label: "m", value: 1 },
    severity: 50,
    locations: [{ file: "a.ts", startLine: 10, endLine: 12, symbol: "f" }],
    ...overrides,
  };
}

describe("selectSample", () => {
  it("es determinista: misma semilla, mismo resultado", () => {
    const findings = Array.from({ length: 30 }, (_, i) => finding(`k:${i.toString().padStart(2, "0")}`, "k"));
    const a = selectSample(findings, { slug: "s", n: 5, seedBase: 42 });
    const b = selectSample(findings, { slug: "s", n: 5, seedBase: 42 });
    expect([...a.get("k")!.map((f) => f.id)]).toEqual([...b.get("k")!.map((f) => f.id)]);
  });

  it("semillas distintas producen selecciones distintas (con probabilidad práctica de 1)", () => {
    const findings = Array.from({ length: 30 }, (_, i) => finding(`k:${i.toString().padStart(2, "0")}`, "k"));
    const a = selectSample(findings, { slug: "s", n: 5, seedBase: 1 });
    const b = selectSample(findings, { slug: "s", n: 5, seedBase: 2 });
    expect(a.get("k")!.map((f) => f.id)).not.toEqual(b.get("k")!.map((f) => f.id));
  });

  it("nunca elige más de n, ni más que el pool", () => {
    const findings = [finding("k:1", "k"), finding("k:2", "k")];
    const sel = selectSample(findings, { slug: "s", n: 5, seedBase: 1 });
    expect(sel.get("k")).toHaveLength(2);
  });

  it("agrupa por kind por separado — el sorteo de un kind no interfiere con otro", () => {
    const findings = [
      ...Array.from({ length: 5 }, (_, i) => finding(`a:${i}`, "a")),
      ...Array.from({ length: 5 }, (_, i) => finding(`b:${i}`, "b")),
    ];
    const sel = selectSample(findings, { slug: "s", n: 3, seedBase: 1 });
    expect(sel.get("a")).toHaveLength(3);
    expect(sel.get("b")).toHaveLength(3);
    expect(sel.get("a")!.every((f) => f.kind === "a")).toBe(true);
  });

  it("un hallazgo sin id (analyzeRepo crudo, sin pasar por code-inspector.ts) se backfillea, nunca se pierde", () => {
    const findings = [finding("k:1", "k"), { ...finding("k:2", "k"), id: undefined }];
    const sel = selectSample(findings, { slug: "s", n: 5, seedBase: 1 });
    expect(sel.get("k")).toHaveLength(2);
    expect(sel.get("k")!.every((f) => typeof f.id === "string" && f.id.length > 0)).toBe(true);
  });

  it("agrandar n extiende el mismo prefijo determinista (upsert-friendly)", () => {
    const findings = Array.from({ length: 20 }, (_, i) => finding(`k:${i.toString().padStart(2, "0")}`, "k"));
    const small = selectSample(findings, { slug: "s", n: 4, seedBase: 7 })
      .get("k")!
      .map((f) => f.id);
    const big = selectSample(findings, { slug: "s", n: 8, seedBase: 7 })
      .get("k")!
      .map((f) => f.id);
    expect(big.slice(0, 4)).toEqual(small);
  });
});

describe("actionablePatterns", () => {
  it("sólo cuenta ausente/parcial, nunca ya-aplicado/aplicado-eludido", () => {
    const f = finding("k:1", "k", { hypotheses: [hyp("Decorator", "ausente"), hyp("Proxy", "ya-aplicado")] });
    expect(actionablePatterns(f)).toEqual(["Decorator"]);
  });
});

describe("toPrecisionRow", () => {
  it("junta pattern con ; y usa la primera location", () => {
    const f = finding("k:1", "k", { hypotheses: [hyp("Decorator", "ausente"), hyp("Strategy", "parcial")] });
    const row = toPrecisionRow(f, "slug1", "const x = 1;", "typescript");
    expect(row.pattern).toBe("Decorator;Strategy");
    expect(row.file).toBe("a.ts");
    expect(row.startLine).toBe(10);
    expect(row.verdict).toBe("");
    expect(row.stillPresent).toBe(true);
    expect(row.language).toBe("typescript");
  });
});

describe("selectSample — estratificación por (kind, lenguaje)", () => {
  it("sin languageOf: una sola celda por kind, comportamiento idéntico al de antes", () => {
    const findings = Array.from({ length: 10 }, (_, i) => finding(`k:${i}`, "k"));
    const sel = selectSample(findings, { slug: "s", n: 3, seedBase: 1 });
    expect([...sel.keys()]).toEqual(["k"]);
    expect(sel.get("k")).toHaveLength(3);
  });

  it("con languageOf: cada lenguaje del mismo kind es su propia celda, hasta n cada una", () => {
    const findings = [
      ...Array.from({ length: 5 }, (_, i) => finding(`k:js:${i}`, "k", { locations: [{ file: `a${i}.js`, startLine: 1, endLine: 1 }] })),
      ...Array.from({ length: 5 }, (_, i) => finding(`k:ts:${i}`, "k", { locations: [{ file: `a${i}.ts`, startLine: 1, endLine: 1 }] })),
    ];
    const languageOf = (f: CodeFinding) => (f.locations[0]!.file.endsWith(".ts") ? "typescript" : "javascript");
    const sel = selectSample(findings, { slug: "s", n: 3, seedBase: 1, languageOf });
    const all = [...sel.values()].flat();
    // No asumir el formato exacto de la clave del Map (detalle interno) — sólo
    // que cada lenguaje sacó su PROPIA celda de hasta n, independiente del otro.
    const jsSelected = all.filter((f) => languageOf(f) === "javascript");
    const tsSelected = all.filter((f) => languageOf(f) === "typescript");
    expect(jsSelected).toHaveLength(3);
    expect(tsSelected).toHaveLength(3);
  });

  it("un lenguaje escaso no se ahoga en el sorteo del lenguaje dominante — nunca queda en 0 mientras tenga hallazgos", () => {
    const findings = [
      ...Array.from({ length: 20 }, (_, i) => finding(`k:js:${i}`, "k", { locations: [{ file: `a${i}.js`, startLine: 1, endLine: 1 }] })),
      finding("k:ts:0", "k", { locations: [{ file: "a0.ts", startLine: 1, endLine: 1 }] }),
    ];
    const languageOf = (f: CodeFinding) => (f.locations[0]!.file.endsWith(".ts") ? "typescript" : "javascript");
    const sel = selectSample(findings, { slug: "s", n: 15, seedBase: 1, languageOf });
    const tsSelected = [...sel.values()].flat().filter((f) => languageOf(f) === "typescript");
    expect(tsSelected).toHaveLength(1);
  });
});

describe("buildLiveContentKeyIndex", () => {
  it("mapea id -> clave de contenido para todo el pool, no sólo lo muestreado", () => {
    const f = finding("k:1", "k", { title: "t1" });
    const index = buildLiveContentKeyIndex([f]);
    expect(index.get("k:1")).toBe(contentKeyForFinding(f));
  });

  it("backfillea id a hallazgos sin id, igual que selectSample", () => {
    const f = { ...finding("k:1", "k"), id: undefined };
    const index = buildLiveContentKeyIndex([f]);
    expect(index.size).toBe(1);
  });
});
