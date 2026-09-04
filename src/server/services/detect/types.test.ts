import { describe, expect, it } from "vitest";

import { pisoDeclarado, resolveThreshold } from "./thresholds.js";
import type { RawFinding } from "./types.js";

describe("RawFinding: tuplas no vacías, exigidas por el compilador", () => {
  it("trigger no puede ser un arreglo vacío", () => {
    const threshold = resolveThreshold(pisoDeclarado(1, { rationale: "test" }), {
      language: "ruby",
      sampleSize: () => 0,
      corpusP95: () => null,
    });
    const valid: RawFinding = {
      title: "t",
      detail: "d",
      trigger: [{ label: "x", value: 2, threshold }],
      locations: [{ file: "a.rb", startLine: 1, endLine: 2, role: "sitio" }],
      severity: 50,
      advice: { primary: { name: "n", kind: "refactorizacion", why: "w", source: "s" } },
    };
    expect(valid.trigger).toHaveLength(1);

    // @ts-expect-error `trigger` es `readonly [Measurement, ...Measurement[]]`: un arreglo vacío no tipa.
    const invalidTrigger: RawFinding = { ...valid, trigger: [] };
    void invalidTrigger;

    // @ts-expect-error `locations` es igualmente una tupla no vacía.
    const invalidLocations: RawFinding = { ...valid, locations: [] };
    void invalidLocations;
  });
});
