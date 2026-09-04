import { describe, expect, it } from "vitest";

import { detector } from "./conditional-chain.js";
import { runIntraFunction, testContext } from "../testing.js";

/**
 * P9: este detector no camina `fn.node` — lee `fn.metrics.{chain,
 * chainInstantiates,isFactoryLike,chainHasNullCheck}`, calculados por
 * `code-analyzer.ts` (ver el docstring del módulo); las sondas sólo
 * necesitan que `deriveNodeSets` reconozca "esto es una función".
 */
const JS_PROBE = `
function pick(kind) {
  return kind;
}
`;

const RUBY_PROBE = `
def pick(kind)
  kind
end
`;

const PYTHON_PROBE = `
def pick(kind):
    return kind
`;

describe("conditional-chain", () => {
  it("javascript: cadena de tipo (chainInstantiates, no factoría) es un hallazgo con Factory Method sugerido", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source: JS_PROBE,
      language: "javascript",
      metrics: { chain: 6, chainInstantiates: true, isFactoryLike: false },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.variant).toBe("instantiates");
    expect(findings[0]!.locations[0]!.role).toBe("selector de tipo a instanciar");
    expect(findings[0]!.advice.pattern?.name).toBe("Factory Method");
  });

  it("javascript: cadena genérica (no instancia tipos) es un hallazgo SIN patrón sugerido", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source: JS_PROBE,
      language: "javascript",
      metrics: { chain: 6, chainInstantiates: false, isFactoryLike: false },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.variant).toBe("ladder");
    expect(findings[0]!.locations[0]!.role).toBe("cadena larga de condicionales");
    expect(findings[0]!.advice.pattern).toBeUndefined();
  });

  it("javascript: una cadena que instancia tipos DENTRO de una función ya-fábrica no dispara nada — ya es la fábrica, moverla sería churn", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source: JS_PROBE,
      language: "javascript",
      metrics: { chain: 6, chainInstantiates: true, isFactoryLike: true },
    });
    expect(findings).toHaveLength(0);
  });

  it("javascript control negativo: una cadena corta, por debajo del umbral, no dispara nada", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source: JS_PROBE,
      language: "javascript",
      metrics: { chain: 2, chainInstantiates: false, isFactoryLike: false },
    });
    expect(findings).toHaveLength(0);
  });

  it("ruby: también dispara — segundo lenguaje real (junto a javascript)", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      source: RUBY_PROBE,
      language: "ruby",
      metrics: { chain: 7, chainInstantiates: false, isFactoryLike: false },
    });
    expect(findings).toHaveLength(1);
  });

  it("python: también dispara — tercer lenguaje real, cierra el criterio de salida (≥3 lenguajes que EMITEN)", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-python.wasm",
      probe: PYTHON_PROBE,
      source: PYTHON_PROBE,
      language: "python",
      metrics: { chain: 5, chainInstantiates: false, isFactoryLike: false },
    });
    expect(findings).toHaveLength(1);
  });

  it("el borde del umbral se pide a testContext, nunca se hardcodea: justo debajo no dispara, justo en el umbral sí", async () => {
    const threshold = testContext(detector, "javascript").threshold("chainLength").value;

    const below = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source: JS_PROBE,
      language: "javascript",
      metrics: { chain: threshold - 1, chainInstantiates: false, isFactoryLike: false },
    });
    expect(below).toHaveLength(0);

    const atThreshold = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source: JS_PROBE,
      language: "javascript",
      metrics: { chain: threshold, chainInstantiates: false, isFactoryLike: false },
    });
    expect(atThreshold).toHaveLength(1);
  });
});
