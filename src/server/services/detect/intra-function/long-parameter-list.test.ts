import { describe, expect, it } from "vitest";

import { detector } from "./long-parameter-list.js";
import { runIntraFunction, testContext } from "../testing.js";

/**
 * P9: este detector no camina `fn.node` — lee `fn.metrics.{parameters,
 * isConstructor}`, calculados por `code-analyzer.ts` (ver el docstring del
 * módulo); las sondas sólo necesitan que `deriveNodeSets` reconozca "esto es
 * una función".
 */
const JS_PROBE = `
function build(a, b) {
  return a + b;
}
`;

const RUBY_PROBE = `
def build(a, b)
  a + b
end
`;

const PYTHON_PROBE = `
def build(a, b):
    return a + b
`;

describe("long-parameter-list", () => {
  it("javascript: función con más parámetros que el umbral (entre RuboCop 5 y SonarQube 7) es un hallazgo", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source: JS_PROBE,
      language: "javascript",
      metrics: { parameters: 8, isConstructor: false },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(8);
    expect(findings[0]!.locations[0]!.role).toBe("función con exceso de parámetros");
    expect(findings[0]!.advice.pattern).toBeUndefined();
  });

  it("javascript: sobre un CONSTRUCTOR agrega la hipótesis de patrón Builder", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source: JS_PROBE,
      language: "javascript",
      metrics: { parameters: 9, isConstructor: true },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.advice.pattern?.name).toBe("Builder");
  });

  it("javascript control negativo: pocos parámetros no dispara nada", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source: JS_PROBE,
      language: "javascript",
      metrics: { parameters: 2, isConstructor: false },
    });
    expect(findings).toHaveLength(0);
  });

  it("ruby: también dispara — segundo lenguaje real (junto a javascript)", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      source: RUBY_PROBE,
      language: "ruby",
      metrics: { parameters: 7, isConstructor: false },
    });
    expect(findings).toHaveLength(1);
  });

  it("python: también dispara — tercer lenguaje real, cierra el criterio de salida (≥3 lenguajes que EMITEN)", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-python.wasm",
      probe: PYTHON_PROBE,
      source: PYTHON_PROBE,
      language: "python",
      metrics: { parameters: 6, isConstructor: false },
    });
    expect(findings).toHaveLength(1);
  });

  it("el borde del umbral se pide a testContext, nunca se hardcodea: justo debajo no dispara, justo en el umbral sí", async () => {
    const threshold = testContext(detector, "javascript").threshold("parameters").value;

    const below = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source: JS_PROBE,
      language: "javascript",
      metrics: { parameters: threshold - 1, isConstructor: false },
    });
    expect(below).toHaveLength(0);

    const atThreshold = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source: JS_PROBE,
      language: "javascript",
      metrics: { parameters: threshold, isConstructor: false },
    });
    expect(atThreshold).toHaveLength(1);
  });
});
