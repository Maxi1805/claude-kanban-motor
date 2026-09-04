import { describe, expect, it } from "vitest";

import { detector } from "./many-returns.js";
import { runIntraFunction, testContext } from "../testing.js";

/**
 * Las sondas tienen que ejercitar TODA construcción que las fixtures usan
 * (ver PLANTILLA-DETECTOR.md §5): clase + método, función suelta, `if`,
 * `return`, y — para JS — también una función flecha, porque el test de
 * "closures anidados" necesita que `arrow_function` exista en
 * `DerivedNodeSets.functionNodes` para poder probar que sus `return` NO se
 * le atribuyen a la función que la contiene.
 */
const JS_PROBE = `
class Shape {
  area(x) {
    if (x) return 1;
    return 2;
  }
}

function free(x) {
  if (x) return 1;
  return 2;
}

const cb = (x) => {
  if (x) return 1;
  return 2;
};
`;

/** La sonda Ruby incluye un `do_block` (`.each do |item| … end`) para poder
 *  probar la nota del docstring: sin `functionExclusions`, ese bloque es
 *  función-like como cualquier otra; con el override que usa
 *  `code-analyzer.ts` para ruby, deja de serlo. */
const RUBY_PROBE = `
class Shape
  def area(x)
    return 1 if x
    return 2
  end
end

def free(x)
  return 1 if x
  return 2
end

def blocky(items)
  items.each do |item|
    return item if item
  end
  0
end
`;

const PYTHON_PROBE = `
class Shape:
    def area(self, x):
        if x:
            return 1
        return 2

def free(x):
    if x:
        return 1
    return 2
`;

const JAVA_PROBE = `
class Shape {
  int area(int x) {
    if (x > 0) {
      return 1;
    }
    return 2;
  }
}
`;

/** Go distingue, con dos tipos de nodo DISTINTOS, un método con receiver
 *  (`method_declaration`) de una función suelta (`function_declaration`) — la
 *  sonda necesita AMBOS: las fixtures de magnitud usan una función suelta
 *  (`func f(x int) int { … }`, sin receiver). */
const GO_PROBE = `
package main

type Shape struct {
	Name string
}

func (s *Shape) Area(x int) int {
	if x > 0 {
		return 1
	}
	return 2
}

func Free(x int) int {
	if x > 0 {
		return 1
	}
	return 2
}
`;

const CSHARP_PROBE = `
class Shape {
  int Area(int x) {
    if (x > 0) {
      return 1;
    }
    return 2;
  }
}
`;

/**
 * `n` puntos de retorno totales, como una ÚNICA escalera `if`/`elsif`/`else`
 * (nunca `n - 1` guardas SEPARADAS seguidas de un `return` final): a
 * propósito, para que estos tests de magnitud/umbral ejerciten SÓLO el
 * conteo y el borde del umbral, sin mezclarse con el mecanismo de exclusión
 * de guardas tempranas (que tiene sus propios tests dedicados, más abajo).
 * Una escalera `if`/`elsif`/`else` tiene rama `alternative` en el `if`
 * exterior — nunca matchea la forma de guarda clásica del detector (ver su
 * docstring), así que sus `n` retornos cuentan siempre los `n`, sin excepción.
 */
function manyReturnsJs(n: number): string {
  const arms = Array.from({ length: n - 1 }, (_, i) => `${i === 0 ? "if" : "} else if"} (x === ${i}) {\n    return ${i};`);
  arms.push(`} else {\n    return ${n - 1};\n  }`);
  return `function f(x) {\n  ${arms.join("\n  ")}\n}\n`;
}

function manyReturnsRuby(n: number): string {
  const arms = Array.from({ length: n - 1 }, (_, i) => `${i === 0 ? "if" : "elsif"} x == ${i}\n    return ${i}`);
  arms.push(`else\n    return ${n - 1}`);
  return `def f(x)\n  ${arms.join("\n  ")}\n  end\nend\n`;
}

function manyReturnsPython(n: number): string {
  const arms = Array.from({ length: n - 1 }, (_, i) => `${i === 0 ? "if" : "elif"} x == ${i}:\n        return ${i}`);
  arms.push(`else:\n        return ${n - 1}`);
  return `def f(x):\n    ${arms.join("\n    ")}\n`;
}

function manyReturnsJava(n: number): string {
  const arms = Array.from({ length: n - 1 }, (_, i) => `${i === 0 ? "if" : "} else if"} (x == ${i}) {\n      return ${i};`);
  arms.push(`} else {\n      return ${n - 1};\n    }`);
  return `class Shape {\n  int f(int x) {\n    ${arms.join("\n    ")}\n  }\n}\n`;
}

function manyReturnsGo(n: number): string {
  const arms = Array.from({ length: n - 1 }, (_, i) => `${i === 0 ? "if" : "} else if"} x == ${i} {\n\t\treturn ${i}`);
  arms.push(`} else {\n\t\treturn ${n - 1}\n\t}`);
  return `package main\n\nfunc f(x int) int {\n\t${arms.join("\n\t")}\n}\n`;
}

function manyReturnsCsharp(n: number): string {
  const arms = Array.from({ length: n - 1 }, (_, i) => `${i === 0 ? "if" : "} else if"} (x == ${i}) {\n      return ${i};`);
  arms.push(`} else {\n      return ${n - 1};\n    }`);
  return `class Shape {\n  int F(int x) {\n    ${arms.join("\n    ")}\n  }\n}\n`;
}

describe("many-returns", () => {
  it("javascript: por encima del umbral (SonarSource S1142, piso 3) es un hallazgo, con el rol correcto", async () => {
    const threshold = testContext(detector, "javascript").threshold("maxReturns").value;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: manyReturnsJs(threshold + 1),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(threshold + 1);
    expect(findings[0]!.locations[0]!.role).toBe("función con exceso de puntos de retorno");
  });

  it("javascript control negativo: exactamente en el umbral (no por encima) no dispara — S1142 dispara al EXCEDER el máximo, no al alcanzarlo", async () => {
    const threshold = testContext(detector, "javascript").threshold("maxReturns").value;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: manyReturnsJs(threshold),
    });
    expect(findings).toHaveLength(0);
  });

  it("javascript: un closure anidado (arrow function) con sus propios returns NO infla el conteo de la función exterior, y recibe su propio hallazgo por separado", async () => {
    const threshold = testContext(detector, "javascript").threshold("maxReturns").value;
    const source = `
function outer(x) {
  if (x) return 1;
  const mapped = items.map((item) => {
    if (item.a) {
      return 1;
    } else if (item.b) {
      return 2;
    } else if (item.c) {
      return 3;
    } else {
      return 4;
    }
  });
  return mapped;
}
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source,
    });
    // `outer` tiene sólo 1 return propio contable (`if (x) return 1;` es una
    // guarda temprana y se excluye; `return mapped;` es el único que cuenta,
    // por debajo del umbral): el único hallazgo es el del closure interno,
    // cuya escalera `if`/`else if`/`else` no matchea forma de guarda (tiene
    // `alternative`) y cuenta sus 4 returns completos.
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(threshold + 1);
  });

  it("javascript: guard clauses tempranas (buena práctica) YA NO disparan — REDEFINICIÓN de esta ola: el prefijo de guardas de una sola línea al principio de la función se excluye del conteo (ver docstring)", async () => {
    const source = `
function f(a, b, c, d) {
  if (!a) return null;
  if (!b) return null;
  if (!c) return null;
  return d;
}
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source,
    });
    // Las 3 guardas (`if (!x) return null;`, sin `else`, cuerpo de un solo
    // `return`) quedan excluidas por ser el PREFIJO inicial del cuerpo; sólo
    // queda `return d;` — 1 return contable, por debajo del umbral (3): sin
    // hallazgo. Antes de esta ola, disparaba (4 > 3) — medido como falso
    // positivo real en 5/5 casos de la muestra juzgada con esta forma
    // exacta (ver docstring del módulo).
    expect(findings).toHaveLength(0);
  });

  it("javascript: una guarda temprana SEGUIDA de lógica sustantiva (un lazo que también retorna) NO se excluye — sólo el prefijo antes de que empiece la lógica real cuenta como preámbulo", async () => {
    const threshold = testContext(detector, "javascript").threshold("maxReturns").value;
    const source = `
function waitForDeath(pid) {
  if (pid == null) return;
  while (isAlive(pid)) {
    if (!isAlive(pid)) return;
    delay(100);
  }
  if (!isAlive(pid)) return;
  signal(pid);
  if (!isAlive(pid)) return;
  delay(50);
  if (!isAlive(pid)) return;
}
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source,
    });
    // `if (pid == null) return;` es la ÚNICA guarda excluida (prefijo de
    // longitud 1): el `while` que sigue de inmediato SÍ contiene un `return`
    // propio, así que cierra el prefijo ahí. De los 5 `return` totales, 1 se
    // excluye (la guarda inicial) y 4 cuentan — el de dentro del lazo y los 3
    // que siguen después, aunque tengan la MISMA forma de guarda de una
    // línea: ya no son preámbulo, son puntos de salida dispersos en medio de
    // lógica real (mismo caso que `cleanup-service.ts#waitForPidDeath`, ver
    // docstring). 4 > 3 (umbral): hallazgo, con el conteo REDUCIDO (4, no 5)
    // reflejado en el trigger.
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(threshold + 1);
  });

  it("python: una guarda temprana SEGUIDA de lógica sustantiva (un `while`) NO se excluye — mismo mecanismo que javascript, segundo lenguaje", async () => {
    const threshold = testContext(detector, "python").threshold("maxReturns").value;
    const source = `
def wait_for_death(pid):
    if pid is None:
        return
    while is_alive(pid):
        if not is_alive(pid):
            return
        delay(100)
    if not is_alive(pid):
        return
    signal(pid)
    if not is_alive(pid):
        return
    delay(50)
    if not is_alive(pid):
        return
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-python.wasm",
      probe: PYTHON_PROBE,
      language: "python",
      source,
    });
    // Misma forma y mismo resultado que el test de javascript de arriba: 1
    // guarda excluida (la inicial), 4 cuentan (el `while` con su propio
    // `return` cierra el prefijo de inmediato).
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(threshold + 1);
  });

  it("ruby: por encima del umbral es un hallazgo — segundo lenguaje real (junto a javascript)", async () => {
    const threshold = testContext(detector, "ruby").threshold("maxReturns").value;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      language: "ruby",
      source: manyReturnsRuby(threshold + 1),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(threshold + 1);
  });

  it("ruby control negativo: exactamente en el umbral no dispara", async () => {
    const threshold = testContext(detector, "ruby").threshold("maxReturns").value;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      language: "ruby",
      source: manyReturnsRuby(threshold),
    });
    expect(findings).toHaveLength(0);
  });

  it("ruby: un return dentro de un `do_block` (`.each do |x| … end`) cuenta para el método que lo contiene — mismo `functionExclusions` que usa code-analyzer.ts para ruby (ver docstring)", async () => {
    const threshold = testContext(detector, "ruby").threshold("maxReturns").value;
    const guards = Array.from({ length: threshold + 1 }, (_, i) => `    return item if item == ${i}`).join("\n");
    const source = `
def blocky(items)
  items.each do |item|
${guards}
  end
  0
end
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      language: "ruby",
      source,
      functionExclusions: ["do_block", "block"],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("blocky");
    expect(findings[0]!.trigger[0]!.value).toBe(threshold + 1);
  });

  it("ruby control: SIN ese `functionExclusions`, el mismo return se le atribuye al `do_block` (su propia función-like), no al método — el conteo depende del extractor, no de una regla propia de este detector", async () => {
    const threshold = testContext(detector, "ruby").threshold("maxReturns").value;
    // Escalera `if`/`elsif`/`else` (no guardas `modifier` separadas): este
    // test verifica la ATRIBUCIÓN del return al `do_block`, no el mecanismo
    // de exclusión de guardas tempranas (que tiene sus propios tests
    // dedicados) — con guardas separadas, las 4 quedarían excluidas como
    // preámbulo y el `do_block` no dispararía nada, confundiendo los dos
    // mecanismos.
    const arms = Array.from({ length: threshold }, (_, i) => `${i === 0 ? "if" : "elsif"} item == ${i}\n      return item`);
    arms.push("else\n      return item");
    const source = `
def blocky(items)
  items.each do |item|
    ${arms.join("\n    ")}
    end
  end
  0
end
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      language: "ruby",
      source,
    });
    // `blocky` mismo queda con 0 returns propios (los suyos son todos del
    // `do_block`, ahora su propia función); el único hallazgo es el del
    // `do_block`, sin nombre (no tiene campo `name`).
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBeUndefined();
    expect(findings[0]!.trigger[0]!.value).toBe(threshold + 1);
  });

  it("python: por encima del umbral es un hallazgo — tercer lenguaje real (junto a javascript/ruby), cierra el criterio de salida (≥3 lenguajes)", async () => {
    const threshold = testContext(detector, "python").threshold("maxReturns").value;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-python.wasm",
      probe: PYTHON_PROBE,
      language: "python",
      source: manyReturnsPython(threshold + 1),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(threshold + 1);
  });

  it("python control negativo: exactamente en el umbral no dispara", async () => {
    const threshold = testContext(detector, "python").threshold("maxReturns").value;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-python.wasm",
      probe: PYTHON_PROBE,
      language: "python",
      source: manyReturnsPython(threshold),
    });
    expect(findings).toHaveLength(0);
  });

  it("java: por encima del umbral es un hallazgo", async () => {
    const threshold = testContext(detector, "java").threshold("maxReturns").value;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-java.wasm",
      probe: JAVA_PROBE,
      language: "java",
      source: manyReturnsJava(threshold + 1),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(threshold + 1);
  });

  it("java control negativo: exactamente en el umbral no dispara", async () => {
    const threshold = testContext(detector, "java").threshold("maxReturns").value;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-java.wasm",
      probe: JAVA_PROBE,
      language: "java",
      source: manyReturnsJava(threshold),
    });
    expect(findings).toHaveLength(0);
  });

  it("go: por encima del umbral es un hallazgo", async () => {
    const threshold = testContext(detector, "go").threshold("maxReturns").value;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-go.wasm",
      probe: GO_PROBE,
      language: "go",
      source: manyReturnsGo(threshold + 1),
      extraClone: ["type_declaration"],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(threshold + 1);
  });

  it("go control negativo: exactamente en el umbral no dispara", async () => {
    const threshold = testContext(detector, "go").threshold("maxReturns").value;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-go.wasm",
      probe: GO_PROBE,
      language: "go",
      source: manyReturnsGo(threshold),
      extraClone: ["type_declaration"],
    });
    expect(findings).toHaveLength(0);
  });

  it("csharp: por encima del umbral es un hallazgo", async () => {
    const threshold = testContext(detector, "csharp").threshold("maxReturns").value;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-c_sharp.wasm",
      probe: CSHARP_PROBE,
      language: "csharp",
      source: manyReturnsCsharp(threshold + 1),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(threshold + 1);
  });

  it("csharp control negativo: exactamente en el umbral no dispara", async () => {
    const threshold = testContext(detector, "csharp").threshold("maxReturns").value;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-c_sharp.wasm",
      probe: CSHARP_PROBE,
      language: "csharp",
      source: manyReturnsCsharp(threshold),
    });
    expect(findings).toHaveLength(0);
  });
});
