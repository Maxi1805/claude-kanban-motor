import { describe, expect, it } from "vitest";

import { detector } from "./long-function.js";
import { runIntraFunction, testContext } from "../testing.js";

/**
 * P9: este detector sólo usa `fn.startLine`/`fn.endLine` — ya calculados por
 * `code-analyzer.ts` a partir de posiciones reales del nodo — así que la
 * magnitud de la fixture es la cantidad real de líneas fuente, no un
 * `metrics` inventado (a diferencia de `complexity.ts`/
 * `conditional-chain.ts`/`long-parameter-list.ts`).
 *
 * JUICIO DE PRECISIÓN: el bloque "un literal de string/template/heredoc
 * multilínea no cuenta como código" prueba el arreglo del falso positivo
 * encontrado contra el corpus externo — ver el docstring de
 * `long-function.ts` para los dos casos reales (`make_pass_decorator`/
 * `isolated_filesystem` en `click`, docstring de Python; `writePreamble` en
 * `cobra`, string crudo de Go).
 */
const JS_PROBE = `
function f(x) {
  return x;
}
`;

const RUBY_PROBE = `
def f(x)
  x
end
`;

const PYTHON_PROBE = `
def f(x):
    return x
`;

const GO_PROBE = `
package main

func f(x int) int {
	return x
}
`;

/** `n` líneas de cuerpo trivial, para no escribir la fixture a mano. */
function longJsFunction(bodyLines: number): string {
  const body = Array.from({ length: bodyLines }, (_, i) => `  const v${i} = ${i};`).join("\n");
  return `function slow(x) {\n${body}\n  return x;\n}\n`;
}

function longRubyFunction(bodyLines: number): string {
  const body = Array.from({ length: bodyLines }, (_, i) => `  v${i} = ${i}`).join("\n");
  return `def slow(x)\n${body}\n  x\nend\n`;
}

function longPythonFunction(bodyLines: number): string {
  const body = Array.from({ length: bodyLines }, (_, i) => `    v${i} = ${i}`).join("\n");
  return `def slow(x):\n${body}\n    return x\n`;
}

/**
 * Python con un docstring de `docstringLines` líneas de CONTENIDO (más las
 * dos líneas de `"""` de apertura/cierre, cada una en su propia línea) y
 * `bodyLines` líneas de código real después. El docstring, como STATEMENT,
 * cuenta para `endLine - startLine` igual que cualquier otro — por eso
 * existe `multilineStringInteriorLines` (ver el docstring de
 * `long-function.ts`). Sólo las `docstringLines` filas INTERIORES se
 * excluyen — las dos filas de `"""` (apertura/cierre) siguen contando,
 * porque en el caso general (no éste) esas filas pueden compartir código
 * real (ver el docstring del módulo).
 */
function longPythonFunctionWithDocstring(docstringLines: number, bodyLines: number): string {
  const doc = Array.from({ length: docstringLines }, (_, i) => `    doc line ${i}`).join("\n");
  const body = Array.from({ length: bodyLines }, (_, i) => `    v${i} = ${i}`).join("\n");
  return `def slow(x):\n    """\n${doc}\n    """\n${body}\n    return x\n`;
}

/**
 * Go con un string CRUDO (backticks) de `templateLines` líneas de
 * CONTENIDO seguido de `bodyLines` líneas de código real — el caso
 * verificado a mano contra `cobra` (`writePreamble`, ver el docstring de
 * `long-function.ts`).
 */
function longGoFunctionWithRawString(templateLines: number, bodyLines: number): string {
  const template = Array.from({ length: templateLines }, (_, i) => `  template line ${i}`).join("\n");
  const body = Array.from({ length: bodyLines }, (_, i) => `  v${i} := ${i}`).join("\n");
  return "func slow(x int) int {\n  s := `\n" + template + "\n  `\n" + body + "\n  return x\n}\n";
}

describe("long-function", () => {
  it("javascript: una función con más líneas que el umbral es un hallazgo", async () => {
    const threshold = testContext(detector, "javascript").threshold("lines").value;
    const source = longJsFunction(threshold + 10);
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source,
      language: "javascript",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.role).toBe("función larga");
    expect(findings[0]!.locations[0]!.symbol).toBe("slow");
  });

  it("javascript control negativo: una función corta no dispara nada", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source: JS_PROBE,
      language: "javascript",
    });
    expect(findings).toHaveLength(0);
  });

  it("ruby: también dispara — segundo lenguaje real (junto a javascript)", async () => {
    const threshold = testContext(detector, "ruby").threshold("lines").value;
    const source = longRubyFunction(threshold + 10);
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      source,
      language: "ruby",
    });
    expect(findings).toHaveLength(1);
  });

  it("python: también dispara — tercer lenguaje real, cierra el criterio de salida (≥3 lenguajes que EMITEN)", async () => {
    const threshold = testContext(detector, "python").threshold("lines").value;
    const source = longPythonFunction(threshold + 10);
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-python.wasm",
      probe: PYTHON_PROBE,
      source,
      language: "python",
    });
    expect(findings).toHaveLength(1);
  });

  it("el borde del umbral se pide a testContext, nunca se hardcodea: justo debajo no dispara, justo en el umbral sí", async () => {
    const threshold = testContext(detector, "javascript").threshold("lines").value;
    // `longJsFunction(n)` produce una función de `n + 3` líneas totales
    // (firma + `n` líneas de cuerpo + `return` + `}`) — ver su docstring.

    const below = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source: longJsFunction(threshold - 4), // total: threshold - 1 líneas
      language: "javascript",
    });
    expect(below).toHaveLength(0);

    const atThreshold = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source: longJsFunction(threshold - 3), // total: threshold líneas
      language: "javascript",
    });
    expect(atThreshold).toHaveLength(1);
  });

  describe("un literal de string/template/heredoc multilínea no cuenta como código (falso positivo encontrado contra el corpus externo)", () => {
    it("python: un docstring que por sí solo cruza el umbral, con código real corto, NO dispara", async () => {
      const threshold = testContext(detector, "python").threshold("lines").value;
      // docstring solo ya excede el umbral; el cuerpo real son sólo 3 líneas.
      const source = longPythonFunctionWithDocstring(threshold + 10, 3);
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-python.wasm",
        probe: PYTHON_PROBE,
        source,
        language: "python",
      });
      expect(findings).toHaveLength(0);
    });

    it("python: código real que por sí solo cruza el umbral SÍ dispara, aunque también tenga un docstring largo", async () => {
      const threshold = testContext(detector, "python").threshold("lines").value;
      const docstringLines = 2; // pequeño, irrelevante para el umbral
      const bodyLines = threshold + 8;
      const source = longPythonFunctionWithDocstring(docstringLines, bodyLines);
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-python.wasm",
        probe: PYTHON_PROBE,
        source,
        language: "python",
      });
      expect(findings).toHaveLength(1);
      // Sólo las filas INTERIORES del docstring se excluyen (`docstringLines`) — las dos filas de `"""` siguen contando.
      const rawLines = docstringLines + bodyLines + 4; // firma + apertura""" + docstringLines + cierre""" + cuerpo + return
      const effectiveLines = rawLines - docstringLines;
      expect(findings[0]!.trigger[0]!.value).toBe(effectiveLines);
      expect(findings[0]!.evidence).toEqual([
        { label: "líneas totales del cuerpo (con el texto del literal)", value: rawLines },
        { label: "líneas de literal de string/template/heredoc excluidas", value: docstringLines },
      ]);
    });

    it("go: un string crudo (backticks) que por sí solo cruza el umbral, con código real corto, NO dispara — el caso real de `writePreamble` en `cobra`", async () => {
      const threshold = testContext(detector, "go").threshold("lines").value;
      const source = longGoFunctionWithRawString(threshold + 10, 2);
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-go.wasm",
        probe: GO_PROBE,
        source,
        language: "go",
      });
      expect(findings).toHaveLength(0);
    });

    it("go: código real que por sí solo cruza el umbral SÍ dispara, aunque también tenga un string crudo largo", async () => {
      const threshold = testContext(detector, "go").threshold("lines").value;
      const templateLines = 3; // pequeño, irrelevante para el umbral
      const bodyLines = threshold + 5;
      const source = longGoFunctionWithRawString(templateLines, bodyLines);
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-go.wasm",
        probe: GO_PROBE,
        source,
        language: "go",
      });
      expect(findings).toHaveLength(1);
    });

    it("ruby/javascript: un comentario de documentación antes de la firma nunca infla el conteo (está fuera del span del nodo función, no hace falta excepción)", async () => {
      // Control negativo: confirma que el arreglo es sobre STRINGS/TEMPLATES multilínea, nunca sobre comentarios.
      const threshold = testContext(detector, "ruby").threshold("lines").value;
      const source = `# Documentación\n# de varias líneas\n# antes del método.\n${longRubyFunction(threshold - 4)}`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-ruby.wasm",
        probe: RUBY_PROBE,
        source,
        language: "ruby",
      });
      expect(findings).toHaveLength(0); // el comentario no cuenta porque nunca formó parte del span del nodo, ni con el arreglo ni sin él
    });
  });
});
