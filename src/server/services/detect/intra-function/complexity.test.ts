import { describe, expect, it } from "vitest";

import { detector } from "./complexity.js";
import { runIntraFunction, testContext } from "../testing.js";

/**
 * P9: este detector no camina `fn.node` — lee `fn.metrics.{cognitive,
 * branches,maxNesting}`, calculados por `code-analyzer.ts` (ver el docstring
 * del módulo) — así que las sondas sólo necesitan que `deriveNodeSets`
 * reconozca "esto es una función"; la magnitud la pone `metrics` en cada
 * `runIntraFunction`, no la fuente.
 */
const JS_PROBE = `
function slow(x) {
  return x;
}
`;

const RUBY_PROBE = `
def slow(x)
  x
end
`;

const PYTHON_PROBE = `
def slow(x):
    return x
`;

describe("complexity", () => {
  it("javascript: complejidad cognitiva por encima del umbral (S3776, piso 15) es un hallazgo", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source: JS_PROBE,
      language: "javascript",
      metrics: { cognitive: 20, branches: 6, maxNesting: 4 },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(20);
    expect(findings[0]!.locations[0]!.role).toBe("función con complejidad cognitiva alta");
    expect(findings[0]!.locations[0]!.symbol).toBe("slow");
  });

  it("javascript control negativo: complejidad baja no dispara nada", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source: JS_PROBE,
      language: "javascript",
      metrics: { cognitive: 2, branches: 1, maxNesting: 1 },
    });
    expect(findings).toHaveLength(0);
  });

  it("ruby: también dispara — segundo lenguaje real (junto a javascript)", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      source: RUBY_PROBE,
      language: "ruby",
      metrics: { cognitive: 18, branches: 5, maxNesting: 2 },
    });
    expect(findings).toHaveLength(1);
  });

  it("python: también dispara — tercer lenguaje real, cierra el criterio de salida (≥3 lenguajes que EMITEN)", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-python.wasm",
      probe: PYTHON_PROBE,
      source: PYTHON_PROBE,
      language: "python",
      metrics: { cognitive: 16, branches: 4, maxNesting: 1 },
    });
    expect(findings).toHaveLength(1);
  });

  it("el borde del umbral se pide a testContext, nunca se hardcodea: justo debajo no dispara, justo en el umbral sí", async () => {
    const threshold = testContext(detector, "javascript").threshold("cognitive").value;

    const below = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source: JS_PROBE,
      language: "javascript",
      metrics: { cognitive: threshold - 1 },
    });
    expect(below).toHaveLength(0);

    const atThreshold = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source: JS_PROBE,
      language: "javascript",
      metrics: { cognitive: threshold },
    });
    expect(atThreshold).toHaveLength(1);
  });
});
