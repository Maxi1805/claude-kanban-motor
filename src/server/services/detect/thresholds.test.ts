import { describe, expect, it } from "vitest";

import { citado, derivado, pisoDeclarado, presencia, presupuesto, resolveThreshold } from "./thresholds.js";
import type { Threshold, ThresholdSpec } from "./thresholds.js";

const noCorpus = { language: "ruby", sampleSize: () => 0, corpusP95: () => null };

describe("umbral con procedencia: no compila sin fuente", () => {
  it("un objeto literal no es un ThresholdSpec ni un Threshold — sólo lo son las cinco factorías / resolveThreshold", () => {
    // @ts-expect-error un literal externo a thresholds.ts no tiene la marca de ThresholdSpec.
    const fakeSpec: ThresholdSpec = { kind: "citado", value: 10 };
    // @ts-expect-error un literal externo a thresholds.ts tampoco es un Threshold resuelto.
    const fakeThreshold: Threshold = {
      value: 10,
      kind: "citado",
      label: "x",
      detail: { kind: "citado", work: "x" },
    };
    void fakeSpec;
    void fakeThreshold;
    expect(citado(10, { work: "x" }).kind).toBe("citado");
  });

  it("las cinco factorías exigen su fuente por firma (esto no es más que documentación: si compiló, la firma ya lo exige)", () => {
    expect(citado(15, { work: "SonarSource", rule: "S3776" }).kind).toBe("citado");
    expect(pisoDeclarado(5, { rationale: "arbitrario pero declarado" }).kind).toBe("piso-declarado");
    expect(presupuesto(200, { rationale: "una lista de UI, no un dump" }).kind).toBe("presupuesto");
    expect(derivado({ floor: 6, stat: "p95", of: "parameters", floorSource: { rationale: "piso" } }).kind).toBe(
      "derivado",
    );
    expect(presencia({ rationale: "presencia/ausencia, no magnitud" }).kind).toBe("presencia");
  });

  it("presencia: no toma `value` — siempre resuelve a 1 (R3: no hay número que elegir, sólo un booleano)", () => {
    const spec = presencia({ rationale: "x" });
    expect(spec.kind === "presencia" && spec.value).toBe(1);
  });
});

describe("resolveThreshold", () => {
  it("citado: valor y label vienen de la factoría", () => {
    const t = resolveThreshold(citado(15, { work: "SonarSource", rule: "S3776" }), noCorpus);
    expect(t.value).toBe(15);
    expect(t.kind).toBe("citado");
    expect(t.label).toBe("SonarSource (S3776)");
    expect(t.detail).toEqual({ kind: "citado", work: "SonarSource", rule: "S3776", url: undefined });
  });

  it("piso-declarado: el valor es el declarado, sin más", () => {
    const t = resolveThreshold(pisoDeclarado(6, { rationale: "entre RuboCop 5 y SonarQube 7" }), noCorpus);
    expect(t.value).toBe(6);
    expect(t.detail).toEqual({ kind: "piso-declarado", rationale: "entre RuboCop 5 y SonarQube 7" });
  });

  it("presupuesto: mismo comportamiento que piso-declarado, kind distinto", () => {
    const t = resolveThreshold(presupuesto(200, { rationale: "una UI, no un dump" }), noCorpus);
    expect(t.value).toBe(200);
    expect(t.kind).toBe("presupuesto");
  });

  it("derivado SIN benchmarks.json (F4 no existe todavía): el resuelto es el floor, scope 'repo-analizado', n real", () => {
    const spec = derivado({ floor: 45, stat: "p95", of: "long-function-lines", floorSource: { rationale: "piso" } });
    const t = resolveThreshold(spec, { language: "ruby", sampleSize: () => 353, corpusP95: () => null });
    expect(t.value).toBe(45);
    expect(t.detail).toEqual({
      kind: "derivado",
      stat: "p95",
      of: "long-function-lines",
      scope: "repo-analizado",
      language: "ruby",
      n: 353,
      floor: 45,
    });
  });

  it("derivado CON benchmarks.json y el p95 del corpus por encima del floor: gana el corpus, scope 'corpus'", () => {
    const spec = derivado({ floor: 45, stat: "p95", of: "long-function-lines", floorSource: { rationale: "piso" } });
    const t = resolveThreshold(spec, { language: "ruby", sampleSize: () => 353, corpusP95: () => 60 });
    expect(t.value).toBe(60);
    expect(t.detail.kind).toBe("derivado");
    expect((t.detail as { scope: string }).scope).toBe("corpus");
  });

  it("derivado: 'scope' nunca puede valer otra cosa que 'repo-analizado' | 'corpus' — no es un valor del tipo (regla 4: inexpresable)", () => {
    const spec = derivado({ floor: 1, stat: "p95", of: "x", floorSource: { rationale: "x" } });
    const t = resolveThreshold(spec, noCorpus);
    if (t.detail.kind === "derivado") {
      expect(["repo-analizado", "corpus"]).toContain(t.detail.scope);
    }
  });

  it("presencia (R3): resuelve a 1 siempre, kind propio — no se confunde con piso-declarado(1, …)", () => {
    const t = resolveThreshold(presencia({ rationale: "presencia/ausencia, no magnitud" }), noCorpus);
    expect(t.value).toBe(1);
    expect(t.kind).toBe("presencia");
    expect(t.label).toBe("presencia: presencia/ausencia, no magnitud");
    expect(t.detail).toEqual({ kind: "presencia", rationale: "presencia/ausencia, no magnitud" });
  });
});
