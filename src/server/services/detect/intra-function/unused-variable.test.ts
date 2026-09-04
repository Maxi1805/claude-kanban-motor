import { describe, expect, it } from "vitest";

import { detector } from "./unused-variable.js";
import { fileUnitFrom, nodeSetsFor, parseRoot, runIntraFunction, testContext } from "../testing.js";
import { withGraph } from "../primitivas/u1-grafo-en-contexto.js";
import { LANGUAGE_DECLS } from "../../code-analyzer.js";
import type { CodeGraph, CodeGraphEdge, CodeGraphNode } from "../../graph/types.js";
import type { FunctionUnit, RawFinding } from "../types.js";

/** Sonda REAL de producción — TS y Vue comparten grammar+sonda (`code-analyzer.ts`), así que probarla una vez cubre ambas rutas de parseo. */
const TS_PROBE = LANGUAGE_DECLS.find((d) => d.id === "typescript")!.probeSource;

/*
 * Cada sonda ejercita: una función NOMBRADA con dos parámetros (uno usado,
 * uno potencialmente sin uso), una declaración de variable local real
 * (donde la gramática la tiene), una función ANÓNIMA/lambda inline (para el
 * gate de "callback" del docstring) y un nombre con descarte intencional
 * (`_`) — regla del arnés (`testing.ts`): si la sonda no ejercita una
 * construcción, esa construcción no existe para el detector.
 */

const JS_PROBE = `
function probe(used, unused) {
  let local = compute();
  const other = 1;
  console.log(used, local, other);
  return { local, other };
}
const cb = (_ignored) => { doStuff(); };
`;

const PYTHON_PROBE = `
def probe(used, unused):
    local = compute()
    print(used, local)

def g(_ignored):
    do_stuff()

class Shape:
    def method(self, used):
        return used

    @classmethod
    def create(cls, used):
        return used
`;

const RUBY_PROBE = `
def probe(used, unused)
  local = compute
  puts(used, local)
end

class Shape
  def method(used)
    used
  end
end
`;

const JAVA_PROBE = `
class Shape {
  void probe(int used, int unused) {
    int local = compute();
    System.out.println(used + local);
  }
}
`;

const GO_PROBE = `
package main

func probe(used int, unused int) int {
	local := compute()
	return used + local
}

func (s *Shape) Method(used int, unused int) (result int, err error) {
	return used, nil
}
`;

const CSHARP_PROBE = `
class Shape {
  void Probe(int used, int unused) {
    int local = Compute();
    Console.WriteLine(used + local);
  }
}
`;

describe("unused-variable", () => {
  describe("javascript", () => {
    it("parámetro sin uso en función nombrada es un hallazgo", async () => {
      const source = `
function process(used, stale) {
  return used + 1;
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        source,
        language: "javascript",
      });
      const params = findings.filter((f) => f.variant === "parametro");
      expect(params).toHaveLength(1);
      expect(params[0]!.locations[0]!.symbol).toBe("stale");
      expect(params[0]!.locations[0]!.role).toBe("parámetro sin uso");
    });

    it("variable local declarada y nunca usada es un hallazgo", async () => {
      const source = `
function process(used) {
  let dead = compute();
  return used;
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        source,
        language: "javascript",
      });
      const locals = findings.filter((f) => f.variant === "variable-local");
      expect(locals).toHaveLength(1);
      expect(locals[0]!.locations[0]!.symbol).toBe("dead");
      expect(locals[0]!.locations[0]!.role).toBe("variable local sin uso");
    });

    it("control negativo: todo parámetro y toda variable local usados no disparan nada", async () => {
      const source = `
function process(used, alsoUsed) {
  let local = compute();
  return used + alsoUsed + local;
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        source,
        language: "javascript",
      });
      expect(findings).toHaveLength(0);
    });

    it("convención de descarte intencional (`_ignored`): no dispara aunque nunca se use", async () => {
      const source = `
function process(_ignored, used) {
  return used;
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        source,
        language: "javascript",
      });
      expect(findings).toHaveLength(0);
    });

    it("falso positivo conocido evitado: parámetro sin uso de una función ANÓNIMA pasada como callback no dispara", async () => {
      // `fn.name === null` es la señal usada para aproximar "función pasada
      // como argumento/callback con firma fija" — ver el docstring del
      // módulo. `index` acá simula el segundo argumento posicional de
      // `Array.prototype.map` que casi nunca se usa.
      const source = `
const handler = (item, index) => {
  return item;
};
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        source,
        language: "javascript",
      });
      const params = findings.filter((f) => f.variant === "parametro");
      expect(params).toHaveLength(0);
    });

    it("una variable capturada y usada sólo dentro de un closure anidado no dispara (no es una lectura por closure)", async () => {
      const source = `
function outer(used) {
  let captured = compute();
  return function () {
    return captured;
  };
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        source,
        language: "javascript",
      });
      const locals = findings.filter((f) => f.variant === "variable-local" && f.locations[0]!.symbol === "captured");
      expect(locals).toHaveLength(0);
    });

    it("falso positivo conocido evitado: variables devueltas con la forma abreviada de un objeto (`return { a, b }`) NO se reportan sin uso", async () => {
      // Encontrado corriendo el detector contra el corpus externo: sin este
      // manejo, `shorthand_property_identifier` (el tipo de nodo propio de
      // `{ a }`, azúcar de `{ a: a }`) es invisible para un conteo que sólo
      // mira `identifier` — ver `USAGE_REFERENCE_TYPES` en el docstring.
      const source = `
function useCounter() {
  const inc = () => 1;
  const dec = () => -1;
  return { inc, dec };
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        source,
        language: "javascript",
      });
      const locals = findings.filter((f) => f.variant === "variable-local");
      expect(locals).toHaveLength(0);
    });

    it("una declaración dentro de un closure anidado no se reporta dos veces (una por scope)", async () => {
      const source = `
function outer() {
  return function inner() {
    let dead = 1;
    return 2;
  };
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        source,
        language: "javascript",
      });
      const locals = findings.filter((f) => f.variant === "variable-local" && f.locations[0]!.symbol === "dead");
      expect(locals).toHaveLength(1);
    });
  });

  describe("typescript (comparte grammar y sonda con vue vía code-analyzer.ts)", () => {
    it("caso canónico: parámetro sin uso y variable local sin uso son dos hallazgos", async () => {
      const source = `
function process(used: number, stale: number): number {
  let dead: number = compute();
  return used;
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-typescript.wasm",
        probe: TS_PROBE,
        source,
        language: "typescript",
      });
      const params = findings.filter((f) => f.variant === "parametro");
      const locals = findings.filter((f) => f.variant === "variable-local");
      expect(params).toHaveLength(1);
      expect(params[0]!.locations[0]!.symbol).toBe("stale");
      expect(locals).toHaveLength(1);
      expect(locals[0]!.locations[0]!.symbol).toBe("dead");
    });

    it("control negativo: todo parámetro y toda variable local usados no disparan nada", async () => {
      const source = `
function process(used: number, alsoUsed: number): number {
  let local: number = compute();
  return used + alsoUsed + local;
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-typescript.wasm",
        probe: TS_PROBE,
        source,
        language: "typescript",
      });
      expect(findings).toHaveLength(0);
    });
  });

  describe("python", () => {
    it("parámetro sin uso es un hallazgo — variables locales NO se detectan (límite declarado)", async () => {
      const source = `
def process(used, stale):
    local = compute()
    return used + local
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-python.wasm",
        probe: PYTHON_PROBE,
        source,
        language: "python",
      });
      const params = findings.filter((f) => f.variant === "parametro");
      const locals = findings.filter((f) => f.variant === "variable-local");
      expect(params).toHaveLength(1);
      expect(params[0]!.locations[0]!.symbol).toBe("stale");
      // Límite declarado del docstring: Python resuelve una asignación con
      // `left`/`right`, nunca con un campo `name` — no hay forma estructural
      // de distinguir esta primera asignación de una reasignación.
      expect(locals).toHaveLength(0);
    });

    it("control negativo: todo parámetro usado no dispara nada", async () => {
      const source = `
def process(used):
    return used
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-python.wasm",
        probe: PYTHON_PROBE,
        source,
        language: "python",
      });
      expect(findings).toHaveLength(0);
    });

    it("convención de descarte intencional (`_ignored`): no dispara", async () => {
      const source = `
def process(_ignored, used):
    return used
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-python.wasm",
        probe: PYTHON_PROBE,
        source,
        language: "python",
      });
      expect(findings).toHaveLength(0);
    });

    it("OLA N, FRENTE B1a — ARREGLO NUEVO: el receptor `self` (posición cero de un método) nunca se reporta sin uso, aunque el cuerpo no lo mencione por nombre", async () => {
      // Reproduce el patrón dominante medido en sqlalchemy (34/55 hallazgos
      // vivos de la muestra son exactamente 'self'/'cls', 11/11 de los ya
      // juzgados a mano son falsos) — ver "OLA N, FRENTE B1a" (E) en el
      // docstring del módulo.
      const source = `
class Shape:
    def area(self):
        return 1
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-python.wasm",
        probe: PYTHON_PROBE,
        source,
        language: "python",
      });
      expect(findings).toHaveLength(0);
    });

    it("OLA N, FRENTE B1a — ARREGLO NUEVO: el receptor `cls` de un `@classmethod` tampoco se reporta sin uso", async () => {
      const source = `
class Shape:
    @classmethod
    def create(cls):
        return Shape()
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-python.wasm",
        probe: PYTHON_PROBE,
        source,
        language: "python",
      });
      expect(findings).toHaveLength(0);
    });

    it("control negativo del arreglo E: dentro de un método, un parámetro sin uso que NO se llama `self`/`cls` sigue reportando con normalidad", async () => {
      // `self.value` a propósito (no `1` a secas): con un cuerpo de una sola
      // sentencia que no usa NINGÚN parámetro, `isHookLikeBody` (arreglo
      // preexistente D/E) suprimiría el hallazgo por otro motivo — esto aísla
      // el chequeo del receptor del de cuerpo trivial.
      const source = `
class Shape:
    def area(self, stale):
        return self.value
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-python.wasm",
        probe: PYTHON_PROBE,
        source,
        language: "python",
      });
      const params = findings.filter((f) => f.variant === "parametro");
      expect(params).toHaveLength(1);
      expect(params[0]!.locations[0]!.symbol).toBe("stale");
    });

    it("control negativo del arreglo E: una función SUELTA (no un método) con un parámetro literalmente llamado `self` sigue reportando — la exención exige `isMethod`", async () => {
      const source = `
def process(self, used):
    return used
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-python.wasm",
        probe: PYTHON_PROBE,
        source,
        language: "python",
      });
      const params = findings.filter((f) => f.variant === "parametro");
      expect(params).toHaveLength(1);
      expect(params[0]!.locations[0]!.symbol).toBe("self");
    });
  });

  describe("ruby", () => {
    it("parámetro sin uso es un hallazgo — variables locales NO se detectan (mismo límite que Python)", async () => {
      const source = `
def process(used, stale)
  local = compute
  used + local
end
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-ruby.wasm",
        probe: RUBY_PROBE,
        source,
        language: "ruby",
      });
      const params = findings.filter((f) => f.variant === "parametro");
      const locals = findings.filter((f) => f.variant === "variable-local");
      expect(params).toHaveLength(1);
      expect(params[0]!.locations[0]!.symbol).toBe("stale");
      expect(locals).toHaveLength(0);
    });

    it("control negativo: todo parámetro usado no dispara nada", async () => {
      const source = `
def process(used)
  used
end
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-ruby.wasm",
        probe: RUBY_PROBE,
        source,
        language: "ruby",
      });
      expect(findings).toHaveLength(0);
    });

    it("límite declarado: un método completamente vacío (`def stub(x); end`) tampoco reporta su parámetro — mismo guard que un abstract de Java/C#", async () => {
      // Ruby's `method` resuelve `body` sólo cuando NO está vacío (misma
      // asimetría que `empty-catch.ts` documenta para `rescue`) — ver el
      // docstring del módulo.
      const source = `
def stub(unused)
end
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-ruby.wasm",
        probe: RUBY_PROBE,
        source,
        language: "ruby",
      });
      expect(findings).toHaveLength(0);
    });

    it("OLA N, FRENTE B1a — ARREGLO NUEVO: `super` DESNUDO (zsuper) reenvía todos los argumentos implícitamente — ningún parámetro se reporta sin uso", async () => {
      // Ver "OLA N, FRENTE B1a" (F) en el docstring del módulo.
      const source = `
def report_summary(a, b)
  super
end
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-ruby.wasm",
        probe: RUBY_PROBE,
        source,
        language: "ruby",
      });
      expect(findings).toHaveLength(0);
    });

    it("control negativo del arreglo F: `super(a)` (CON paréntesis, reenvío EXPLÍCITO de un subconjunto) sigue reportando el parámetro que se dejó afuera", async () => {
      const source = `
def report_summary(a, b)
  super(a)
end
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-ruby.wasm",
        probe: RUBY_PROBE,
        source,
        language: "ruby",
      });
      const params = findings.filter((f) => f.variant === "parametro");
      expect(params).toHaveLength(1);
      expect(params[0]!.locations[0]!.symbol).toBe("b");
    });

    it("control negativo del arreglo F: `super()` (paréntesis VACÍOS, reenvío EXPLÍCITO de nada) sigue reportando ambos parámetros", async () => {
      // DOS sentencias reales a propósito: con una sola (`super()` a secas)
      // el guard PREEXISTENTE de cuerpo trivial (`isHookLikeBody`, arreglo
      // D/E) ya suprimiría el hallazgo por otro motivo — esto aísla el
      // chequeo de `super`/paréntesis del de cuerpo trivial.
      const source = `
def report_summary(a, b)
  log("computing")
  super()
end
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-ruby.wasm",
        probe: RUBY_PROBE,
        source,
        language: "ruby",
      });
      const params = findings.filter((f) => f.variant === "parametro");
      expect(params.map((f) => f.locations[0]!.symbol).sort()).toEqual(["a", "b"]);
    });

    it("OLA N, FRENTE B1a — el `super` desnudo DENTRO DE UN BLOQUE (`items.each { super }`) sigue exentando al método que lo envuelve — Ruby no abre un scope de método nuevo en un bloque", async () => {
      const source = `
def report_summary(a, b)
  items.each { super }
end
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-ruby.wasm",
        probe: RUBY_PROBE,
        source,
        language: "ruby",
      });
      expect(findings).toHaveLength(0);
    });

    it("OLA N, FRENTE B1a — un `super` desnudo dentro de un método ANIDADO no exenta al método EXTERNO: son dos scopes distintos", async () => {
      // DOS sentencias reales en `outer` a propósito: aísla el chequeo de
      // poda de método anidado del guard PREEXISTENTE de cuerpo trivial
      // (`isHookLikeBody`, arreglo D/E) — con una sola sentencia (sólo el
      // `def inner` anidado), ESE guard ya suprimiría el hallazgo por otro
      // motivo, sin ejercitar la poda que este test dice probar.
      const source = `
def outer(a, b)
  log("entering")
  def inner(x)
    super
  end
end
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-ruby.wasm",
        probe: RUBY_PROBE,
        source,
        language: "ruby",
      });
      const outerParams = findings.filter((f) => f.variant === "parametro" && ["a", "b"].includes(f.locations[0]!.symbol ?? ""));
      expect(outerParams).toHaveLength(2);
    });
  });

  describe("java", () => {
    it("parámetro sin uso y variable local sin uso son dos hallazgos distintos", async () => {
      const source = `
class Shape {
  void process(int used, int stale) {
    int dead = compute();
    System.out.println(used);
  }
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-java.wasm",
        probe: JAVA_PROBE,
        source,
        language: "java",
      });
      const params = findings.filter((f) => f.variant === "parametro");
      const locals = findings.filter((f) => f.variant === "variable-local");
      expect(params).toHaveLength(1);
      expect(params[0]!.locations[0]!.symbol).toBe("stale");
      expect(locals).toHaveLength(1);
      expect(locals[0]!.locations[0]!.symbol).toBe("dead");
    });

    it("control negativo: todo usado no dispara nada", async () => {
      const source = `
class Shape {
  void process(int used) {
    int local = compute();
    System.out.println(used + local);
  }
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-java.wasm",
        probe: JAVA_PROBE,
        source,
        language: "java",
      });
      expect(findings).toHaveLength(0);
    });

    it("falso positivo conocido evitado: un método abstract (sin cuerpo) no reporta sus parámetros como sin uso", async () => {
      // Encontrado corriendo el detector contra el corpus externo (Guava:
      // `protected abstract B doForward(A a);`) — ver el docstring del
      // módulo. `sets.functionNodes` clasifica `method_declaration` por
      // TIPO (la sonda tiene un método CON cuerpo), así que la versión
      // `abstract`, sin cuerpo, también llega a `run()`; sin el guard de
      // "sin body, sin hallazgos" cada parámetro de cada método abstracto
      // se leería como sin uso.
      const source = `
abstract class Shape {
  protected abstract int compute(int unused);
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-java.wasm",
        probe: JAVA_PROBE,
        source,
        language: "java",
      });
      expect(findings).toHaveLength(0);
    });

    it("BUG ARREGLADO (medido contra newtonsoft-json/guava): un método anotado `@Override` no reporta sus parámetros sin uso", async () => {
      // La mayoría de los falsos positivos vivos medidos en una muestra
      // fresca de newtonsoft-json (C#) eran overrides de método
      // abstract/virtual — el mismo problema aplica a Java vía `@Override`
      // (nombre de la anotación EXIGIDO por el propio JDK, no una
      // convención de este repo). `@Override` vive dentro de un contenedor
      // `modifiers` compartido por TODOS los modificadores del método (a
      // diferencia de C#, que expone cada uno como su propio nodo).
      const source = `
class Circle extends Shape {
  @Override
  void process(int unused) {
  }
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-java.wasm",
        probe: JAVA_PROBE,
        source,
        language: "java",
      });
      expect(findings).toHaveLength(0);
    });

    it("control negativo del fix anterior: un método SIN `@Override`, con cuerpo NO trivial y un nombre normal, sigue reportando su parámetro sin uso", async () => {
      // DOS sentencias reales y nombre NORMAL a propósito: aísla el chequeo
      // de `@Override` de los otros arreglos nuevos de esta tarea (cuerpo
      // vacío/trivial, convención de nombre "unused") — ver los tests
      // dedicados a cada uno más abajo.
      const source = `
class Shape {
  void process(int stale) {
    System.out.println("start");
    System.out.println("done");
  }
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-java.wasm",
        probe: JAVA_PROBE,
        source,
        language: "java",
      });
      const params = findings.filter((f) => f.variant === "parametro");
      expect(params).toHaveLength(1);
      expect(params[0]!.locations[0]!.symbol).toBe("stale");
    });

    it("BUG ARREGLADO (medido contra guava): un parámetro con PREFIJO `unused` no reporta — convención de Error Prone, no invento de este repo", async () => {
      // https://errorprone.info/bugpattern/UnusedVariable: "False positives
      // on fields and parameters can be suppressed by prefixing the
      // variable name with `unused`". Guava (código de Google, escrito con
      // Error Prone en mente) lo usa constantemente — 9 de 26 hallazgos
      // vivos muestreados en el corpus eran exactamente esta forma
      // (`HostSpecifier.isValid`, `Callables.renaming`, …).
      const source = `
class Shape {
  static boolean isValid(String specifier) {
    Shape unused = parse(specifier);
    return true;
  }
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-java.wasm",
        probe: JAVA_PROBE,
        source,
        language: "java",
      });
      expect(findings).toHaveLength(0);
    });

    it("BUG ARREGLADO: el prefijo `unused` también suprime un PARÁMETRO, no sólo una variable local", async () => {
      const source = `
class Shape {
  void process(int unusedFlag, int used) {
    System.out.println(used);
  }
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-java.wasm",
        probe: JAVA_PROBE,
        source,
        language: "java",
      });
      expect(findings).toHaveLength(0);
    });

    it("control negativo del arreglo de nombre: un nombre que CONTIENE \"unused\" pero no empieza así sigue reportando (es PREFIJO, no substring)", async () => {
      // DOS sentencias reales a propósito, para aislar el chequeo de
      // PREFIJO del arreglo de cuerpo vacío/trivial (D/E).
      const source = `
class Shape {
  void process(int isUnusedFlag) {
    System.out.println("start");
    System.out.println("x");
  }
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-java.wasm",
        probe: JAVA_PROBE,
        source,
        language: "java",
      });
      const params = findings.filter((f) => f.variant === "parametro");
      expect(params).toHaveLength(1);
      expect(params[0]!.locations[0]!.symbol).toBe("isUnusedFlag");
    });

    it("BUG ARREGLADO (medido contra guava): `@SuppressWarnings(\"unused\")` en un PARÁMETRO no reporta", async () => {
      // Reproduce `CompactHashMap.java:617`/`CompactHashSet.java:535`: el
      // propio autor ya declaró, con sintaxis del lenguaje, que sabe que
      // esto no se usa.
      const source = `
class Shape {
  int adjustAfterRemove(int before, @SuppressWarnings("unused") int removed) {
    return before - 1;
  }
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-java.wasm",
        probe: JAVA_PROBE,
        source,
        language: "java",
      });
      expect(findings).toHaveLength(0);
    });

    it("BUG ARREGLADO (medido contra guava): `@SuppressWarnings(\"unused\")` en una VARIABLE LOCAL no reporta", async () => {
      // Reproduce `ExecutionListBenchmark.java:344`. La anotación vive en el
      // CONTENEDOR (`local_variable_declaration`), un nivel arriba del
      // `variable_declarator` que de verdad se reporta — ver el docstring de
      // `hasSuppressWarningsUnused`.
      const source = `
class Shape {
  void submit() {
    @SuppressWarnings("unused")
    Future<?> possiblyIgnored = executorService.submit(task);
  }
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-java.wasm",
        probe: JAVA_PROBE,
        source,
        language: "java",
      });
      expect(findings).toHaveLength(0);
    });

    it("BUG ARREGLADO (medido contra guava): un callback de serialización del JDK (`readObject`) no reporta su parámetro", async () => {
      // Reproduce `BloomFilter.java:592`/`ImmutableRangeSet.java:887` y
      // otros cuatro hallazgos vivos idénticos: `readObject`/`writeObject`
      // tienen firma FIJADA por la especificación de serialización de Java,
      // invocados por reflexión, nunca desde un sitio de llamada textual.
      const source = `
class Shape {
  private void readObject(java.io.ObjectInputStream stream) throws java.io.InvalidObjectException {
    throw new java.io.InvalidObjectException("Use SerializedForm");
  }
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-java.wasm",
        probe: JAVA_PROBE,
        source,
        language: "java",
      });
      expect(findings).toHaveLength(0);
    });

    it("control negativo del arreglo de serialización: un método con OTRO nombre y la misma forma sigue reportando su parámetro", async () => {
      // DOS sentencias reales a propósito: aísla el chequeo de NOMBRE
      // (`JAVA_SERIALIZATION_CALLBACK_NAMES`) del arreglo de cuerpo
      // vacío/trivial (D/E) — con una sola sentencia que ignora `stream`,
      // ESE otro arreglo también suprimiría el hallazgo y el test dejaría
      // de aislar lo que dice probar.
      const source = `
class Shape {
  private void readData(java.io.ObjectInputStream stream) throws java.io.InvalidObjectException {
    log("rejected");
    throw new java.io.InvalidObjectException("Use SerializedForm");
  }
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-java.wasm",
        probe: JAVA_PROBE,
        source,
        language: "java",
      });
      const params = findings.filter((f) => f.variant === "parametro");
      expect(params).toHaveLength(1);
      expect(params[0]!.locations[0]!.symbol).toBe("stream");
    });

    it("BUG ARREGLADO (medido contra guava): un método CONCRETO con cuerpo vacío (`{}`) no reporta su parámetro — hook de un Adapter/Template Method", async () => {
      // Reproduce `Service.Listener#failed`/`ServiceManager.Listener#failure`
      // (javadoc textual: "All methods are no-ops by default, implementors
      // should override the ones they care about") y
      // `CompactHashMap.java:326#accessEntry` ("// no-op by default"). A
      // diferencia de Ruby, Java SÍ resuelve un nodo `body` real para `{}` —
      // por eso el guard de "sin cuerpo" (que cubre abstract/interfaz) no
      // alcanzaba acá y hacía falta `isBodyEmpty`.
      const source = `
class Listener {
  public void failed(State from, Throwable failure) {}
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-java.wasm",
        probe: JAVA_PROBE,
        source,
        language: "java",
      });
      expect(findings).toHaveLength(0);
    });

    it("control negativo del arreglo de cuerpo vacío: un cuerpo con sólo un comentario sigue siendo \"vacío\" (un comentario no es una sentencia)", async () => {
      const source = `
class Shape {
  void accessEntry(int index) {
    // no-op by default
  }
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-java.wasm",
        probe: JAVA_PROBE,
        source,
        language: "java",
      });
      expect(findings).toHaveLength(0);
    });

    it("BUG ARREGLADO (medido contra guava): un cuerpo de UNA sola sentencia trivial que ignora TODOS sus parámetros no reporta — generalización del cuerpo vacío", async () => {
      // Reproduce `Cut.java:66#canonical(DiscreteDomain<C> domain) { return
      // this; }` ("// note: overridden by {BELOW,ABOVE}_ALL", comentario
      // propio de guava) — hook de Template Method con un cuerpo de una
      // sola sentencia, no cero. Ver `isHookLikeBody`.
      const source = `
class Shape {
  Shape canonical(int domain) {
    return this;
  }
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-java.wasm",
        probe: JAVA_PROBE,
        source,
        language: "java",
      });
      expect(findings).toHaveLength(0);
    });

    it("control negativo del arreglo de cuerpo trivial: si SÓLO ALGUNOS parámetros están sin uso (no todos), la sentencia trivial NO suprime — puede ser un bug real, no un hook", async () => {
      // `key` se usa, `value` no — a diferencia de un hook, que ignora la
      // firma ENTERA, acá la función SÍ hace algo con parte de su firma y
      // "se olvidó" de `value`: `isHookLikeBody` exige que TODOS los
      // parámetros estén sin uso, no sólo el candidato actual — ver el
      // docstring de la función.
      const source = `
class Shape {
  Object configure(String key, String value) {
    return lookup(key);
  }
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-java.wasm",
        probe: JAVA_PROBE,
        source,
        language: "java",
      });
      const params = findings.filter((f) => f.variant === "parametro");
      expect(params).toHaveLength(1);
      expect(params[0]!.locations[0]!.symbol).toBe("value");
    });

    it("control negativo del arreglo de cuerpo trivial: DOS sentencias que ignoran todos los parámetros siguen reportando (el arreglo es sólo para ≤1 sentencia)", async () => {
      const source = `
class Shape {
  Shape canonical(int domain) {
    log("computing canonical form");
    return this;
  }
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-java.wasm",
        probe: JAVA_PROBE,
        source,
        language: "java",
      });
      const params = findings.filter((f) => f.variant === "parametro");
      expect(params).toHaveLength(1);
      expect(params[0]!.locations[0]!.symbol).toBe("domain");
    });
  });

  describe("go", () => {
    it("parámetro sin uso es un hallazgo — legal en Go (a diferencia de una variable local sin usar, que el compilador rechaza)", async () => {
      const source = `
package main

func process(used int, stale int) int {
	local := compute()
	return used + local
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-go.wasm",
        probe: GO_PROBE,
        source,
        language: "go",
      });
      const params = findings.filter((f) => f.variant === "parametro");
      expect(params).toHaveLength(1);
      expect(params[0]!.locations[0]!.symbol).toBe("stale");
    });

    it("control negativo: todo parámetro usado no dispara nada", async () => {
      const source = `
package main

func process(used int) int {
	local := compute()
	return used + local
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-go.wasm",
        probe: GO_PROBE,
        source,
        language: "go",
      });
      expect(findings).toHaveLength(0);
    });

    it("BUG ARREGLADO (hugo): un retorno NOMBRADO usado sólo para documentar la firma no se reporta como variable local sin uso", async () => {
      // Reproduce el hallazgo vivo de hugo (`Min`, `tpl/math/math.go`): el
      // cuerpo hace `return calc(...)` bypaseando `minimum`/`err` por
      // completo — idiomático en Go, no código muerto. Antes del fix, el
      // contenedor `result` (mismo tipo de nodo `parameter_list` que
      // `parameters`, campo distinto) no estaba podado y sus
      // `parameter_declaration` se leían como declaraciones locales.
      const source = `
package main

func (ns *Namespace) Min(inputs int) (minimum float64, err error) {
	return ns.applyOp(inputs)
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-go.wasm",
        probe: GO_PROBE,
        source,
        language: "go",
      });
      expect(findings).toHaveLength(0);
    });

    it("BUG ARREGLADO: el receptor de un método nunca se reporta como variable local sin uso", async () => {
      // El receptor (`(ns *Namespace)`) es, por tipo de nodo, el MISMO
      // `parameter_list` que el contenedor `parameters` — antes del fix no
      // había forma de podarlo salvo por identidad de objeto, que
      // `web-tree-sitter` no garantiza (ver el docstring de
      // `PARAMETER_CONTAINER_TYPES`).
      const source = `
package main

func (ns *Namespace) DoThing(x int) int {
	return x
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-go.wasm",
        probe: GO_PROBE,
        source,
        language: "go",
      });
      expect(findings).toHaveLength(0);
    });

    it("BUG ARREGLADO (hugo): un parámetro anidado en la anotación de TIPO de una variable distinta no se reporta como variable local sin uso", async () => {
      // Reproduce `expandShortcodeTokens` de hugo: `token` es el nombre de
      // un parámetro DENTRO de la firma de tipo de una variable ajena
      // (`var tokenHandler func(ctx context.Context, token string) error`),
      // nunca una declaración del scope de `probe`. Ese `parameter_list`
      // anidado no es descendiente del contenedor `parameters` de `probe`
      // (que está vacío) — sólo podarlo por TIPO, en cualquier profundidad,
      // lo cubre.
      const source = `
package main

func probe() {
	var tokenHandler func(ctx int, token string) error
	tokenHandler = defaultHandler
	use(tokenHandler)
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-go.wasm",
        probe: GO_PROBE,
        source,
        language: "go",
      });
      expect(findings).toHaveLength(0);
    });

    it("BUG ARREGLADO (cobra): un parámetro variádico de un método CON receptor se reporta UNA sola vez, como parámetro — no duplicado como variable local", async () => {
      // Reproduce `MarkZshCompPositionalArgumentFile` de cobra: antes del
      // fix, `patterns` aparecía DOS veces — una vez (bien) como
      // "parametro sin uso" vía mecanismo 1, y otra vez (mal) como
      // "variable local declarada" vía mecanismo 2, porque el contenedor
      // `parameters` de un método CON receptor no quedaba podado por
      // identidad de objeto (ver el docstring de `PARAMETER_CONTAINER_TYPES`).
      // DOS sentencias reales a propósito (el `_ = c` es relleno): el cuerpo
      // REAL de cobra es `{ return nil }`, una sola sentencia que ignora los
      // dos parámetros — desde `isHookLikeBody` (arreglo E) ESO también
      // suprimiría el hallazgo (es, de hecho, el mismo patrón: la propia
      // cobra la documenta como deshabilitada — "It has therefore been
      // disabled", `zsh_completions.go:47`), pero sería un mecanismo
      // DISTINTO del que este test dice probar (dedup de contenedor de
      // parámetros con receptor); se agrega una sentencia de relleno para
      // aislar lo uno de lo otro.
      const source = `
package main

func (c *Command) MarkZshCompPositionalArgumentFile(argPosition int, patterns ...string) error {
	_ = c
	return nil
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-go.wasm",
        probe: GO_PROBE,
        source,
        language: "go",
      });
      expect(findings).toHaveLength(2);
      expect(findings.every((f) => f.variant === "parametro")).toBe(true);
      expect(findings.map((f) => f.locations[0]!.symbol).sort()).toEqual(["argPosition", "patterns"]);
    });

    it("BUG ARREGLADO (hugo): el type parameter de una función genérica (`New[T any]`) no se reporta como variable local sin uso", async () => {
      // Reproduce `hugolib/doctree/nodeshifttree.go#New` de hugo: `T` es un
      // TYPE PARAMETER (`[T any]`), no una variable del cuerpo. Sonda
      // directa confirma que Go expone `type_parameters` como un
      // `type_parameter_list` con hijos `parameter_declaration` — el MISMO
      // tipo de nodo que un parámetro normal, reutilizando la regla de
      // gramática — así que sin `type_parameter_list` en
      // `PARAMETER_CONTAINER_TYPES`, `T` quedaba sin podar.
      const source = `
package main

func New[T any](cfg Config) int {
	if cfg.Shifter == nil {
		panic("required")
	}
	return 1
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-go.wasm",
        probe: GO_PROBE,
        source,
        language: "go",
      });
      expect(findings).toHaveLength(0);
    });

    it("BUG ARREGLADO (generalización cross-lenguaje del arreglo D): una implementación de interfaz con cuerpo vacío no reporta su parámetro", async () => {
      // Mismo mecanismo que el test Java de cuerpo vacío, en OTRO lenguaje —
      // confirma que `isBodyEmpty` es estructural (por FORMA de `body`), no
      // un chequeo `if (lang === "java")`. Legítimo en Go: un stub que
      // satisface una interfaz sin necesitar su parámetro.
      const source = `
package main

func (n *NullLogger) Log(level int, message string) {}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-go.wasm",
        probe: GO_PROBE,
        source,
        language: "go",
      });
      expect(findings).toHaveLength(0);
    });
  });

  describe("csharp", () => {
    it("parámetro sin uso y variable local sin uso son dos hallazgos", async () => {
      const source = `
class Shape {
  void Process(int used, int stale) {
    int dead = Compute();
    Console.WriteLine(used);
  }
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-c_sharp.wasm",
        probe: CSHARP_PROBE,
        source,
        language: "csharp",
      });
      const params = findings.filter((f) => f.variant === "parametro");
      const locals = findings.filter((f) => f.variant === "variable-local");
      expect(params).toHaveLength(1);
      expect(locals).toHaveLength(1);
    });

    it("falso positivo conocido evitado: un método abstract/de interfaz (sin cuerpo) no reporta sus parámetros como sin uso", async () => {
      const source = `
abstract class Shape {
  protected abstract int Compute(int unused);
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-c_sharp.wasm",
        probe: CSHARP_PROBE,
        source,
        language: "csharp",
      });
      expect(findings).toHaveLength(0);
    });

    it("BUG ARREGLADO (newtonsoft-json): una variable local de tipo NO primitivo, genuinamente sin uso, reporta el NOMBRE de la variable — no el nombre del tipo", async () => {
      // Reproduce, con un fixture mínimo aislado, el bug confirmado contra
      // newtonsoft-json (`IDictionaryEnumerator`/`QueryExpression`/
      // `Fallback`, los tres con la misma forma). El tipo de C# se parsea
      // como `identifier` bare para cualquier tipo no primitivo (a
      // diferencia de Java, que usa `type_identifier`); antes del fix, el
      // contenedor `variable_declaration` (tipo + declarador) caía al mismo
      // fallback "primer hijo nombrado" que el `variable_declarator` real,
      // y su primer hijo nombrado ES el tipo.
      const source = `
class Shape {
  void SerializeDictionary() {
    IDictionaryEnumerator e = values.GetEnumerator();
  }
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-c_sharp.wasm",
        probe: CSHARP_PROBE,
        source,
        language: "csharp",
      });
      const locals = findings.filter((f) => f.variant === "variable-local");
      expect(locals).toHaveLength(1);
      expect(locals[0]!.locations[0]!.symbol).toBe("e");
    });

    it("control negativo del fix anterior: si la variable de tipo NO primitivo SÍ se usa, no dispara nada — ni con su nombre real ni con el del tipo", async () => {
      const source = `
class Shape {
  void SerializeDictionary() {
    IDictionaryEnumerator e = values.GetEnumerator();
    while (e.MoveNext()) {
      Use(e);
    }
  }
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-c_sharp.wasm",
        probe: CSHARP_PROBE,
        source,
        language: "csharp",
      });
      expect(findings).toHaveLength(0);
    });

    it("BUG ARREGLADO: una sentencia con dos declaradores (`string a, b;`) reporta sólo el que está sin uso, por su propio nombre", async () => {
      const source = `
class Shape {
  void M() {
    string a, b;
    a = "x";
    Use(a);
  }
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-c_sharp.wasm",
        probe: CSHARP_PROBE,
        source,
        language: "csharp",
      });
      const locals = findings.filter((f) => f.variant === "variable-local");
      expect(locals).toHaveLength(1);
      expect(locals[0]!.locations[0]!.symbol).toBe("b");
    });

    it("BUG ARREGLADO (newtonsoft-json): un `catch` SIN variable ligada no reporta el TIPO de la excepción como variable sin uso", async () => {
      // Reproduce, con un fixture mínimo aislado, el bug confirmado contra
      // newtonsoft-json (`Utilities/LinqBridge.cs`, `ElementAt`: `catch
      // (InvalidOperationException) // if thrown by First`). El
      // `catch_declaration` de C# TAMBIÉN termina en `_declaration`
      // (matchea `DECLARATOR_LIKE`) y, sin variable ligada, no expone ningún
      // campo `name` — sólo `type`. Mismo mecanismo que el bug de
      // `IDictionaryEnumerator`, pero sin ningún declarador anidado al que
      // diferir: acá directamente NO HAY nombre que resolver.
      const source = `
class Shape {
  void M() {
    try {
      Do();
    } catch (InvalidOperationException) {
      Handle();
    }
  }
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-c_sharp.wasm",
        probe: CSHARP_PROBE,
        source,
        language: "csharp",
      });
      expect(findings).toHaveLength(0);
    });

    it("control negativo del fix anterior: un `catch` CON variable ligada y sin usar sigue reportando, con su propio nombre", async () => {
      const source = `
class Shape {
  void M() {
    try {
      Do();
    } catch (InvalidOperationException ex) {
      Handle();
    }
  }
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-c_sharp.wasm",
        probe: CSHARP_PROBE,
        source,
        language: "csharp",
      });
      const locals = findings.filter((f) => f.variant === "variable-local");
      expect(locals).toHaveLength(1);
      expect(locals[0]!.locations[0]!.symbol).toBe("ex");
    });

    it("control negativo del fix anterior: un `catch` CON variable ligada y usada no dispara nada", async () => {
      const source = `
class Shape {
  void M() {
    try {
      Do();
    } catch (InvalidOperationException ex) {
      Handle(ex);
    }
  }
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-c_sharp.wasm",
        probe: CSHARP_PROBE,
        source,
        language: "csharp",
      });
      expect(findings).toHaveLength(0);
    });

    it("BUG ARREGLADO (medido contra newtonsoft-json): un override de un método abstract/virtual no reporta sus parámetros sin uso", async () => {
      // Reproduce la forma real de newtonsoft-json (`JsonConverter.
      // ReadJson`, `PathFilter.ExecuteFilter`, …): medida una muestra fresca
      // de 41 hallazgos vivos juzgados a mano, la aplastante mayoría de los
      // 39 falsos positivos eran EXACTAMENTE este caso — un `override`/
      // `virtual` autodeclarado en la propia firma, visible sin salir de
      // `fn.node` (a diferencia del caso de callback ya documentado, que sí
      // necesita el sitio de llamada).
      const source = `
class VersionConverter : JsonConverter {
  public override object? ReadJson(JsonReader reader, Type objectType, object? existingValue, JsonSerializer serializer) {
    return null;
  }
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-c_sharp.wasm",
        probe: CSHARP_PROBE,
        source,
        language: "csharp",
      });
      expect(findings).toHaveLength(0);
    });

    it("BUG ARREGLADO: una implementación EXPLÍCITA de interfaz (`Interfaz.Metodo(...)`) no reporta sus parámetros sin uso", async () => {
      // Reproduce `object? ICustomTypeDescriptor.GetEditor(Type
      // editorBaseType)` de newtonsoft-json — el nombre calificado con la
      // interfaz (`explicit_interface_specifier`) ES la firma exigida.
      const source = `
class JObject {
  object? ICustomTypeDescriptor.GetEditor(Type editorBaseType) {
    return null;
  }
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-c_sharp.wasm",
        probe: CSHARP_PROBE,
        source,
        language: "csharp",
      });
      expect(findings).toHaveLength(0);
    });

    it("control negativo del fix anterior: un método normal, con cuerpo NO trivial, sin `override`/`virtual`/interfaz explícita ni nombre `unused`, sigue reportando su parámetro sin uso", async () => {
      // DOS sentencias reales y nombre NORMAL a propósito: aísla el chequeo
      // de `override`/`virtual` de los otros arreglos nuevos de esta tarea
      // (cuerpo vacío/trivial, convención de nombre "unused") — mismo motivo
      // que el test equivalente de Java.
      const source = `
class Shape {
  void Plain(int stale) {
    Console.WriteLine("start");
    Console.WriteLine("done");
  }
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-c_sharp.wasm",
        probe: CSHARP_PROBE,
        source,
        language: "csharp",
      });
      const params = findings.filter((f) => f.variant === "parametro");
      expect(params).toHaveLength(1);
      expect(params[0]!.locations[0]!.symbol).toBe("stale");
    });

    it("BUG ARREGLADO (generalización cross-lenguaje del arreglo D): un método concreto con cuerpo vacío no reporta su parámetro", async () => {
      const source = `
class Shape {
  public void OnClick(object sender, EventArgs args) {}
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-c_sharp.wasm",
        probe: CSHARP_PROBE,
        source,
        language: "csharp",
      });
      expect(findings).toHaveLength(0);
    });
  });

  it("borde del umbral: el umbral declarado (SonarSource S1172/S1481) es presencia, no magnitud — con valor 1 cualquier ocurrencia dispara", async () => {
    const ctx = testContext(detector, "javascript");
    expect(ctx.threshold("unusedParameter").value).toBe(1);
    expect(ctx.threshold("unusedLocal").value).toBe(1);
  });

  describe("OLA N, FRENTE B1b — la firma la impone un contrato externo, visible sólo por el grafo", () => {
    const CSHARP_WASM = "tree-sitter-c_sharp.wasm";

    function symNode(id: string, file: string, symbolPath: readonly string[], extra: Partial<CodeGraphNode> = {}): CodeGraphNode {
      return { id, kind: "symbol", file, symbolPath, ...extra } as CodeGraphNode;
    }
    function containsEdge(from: string, to: string): CodeGraphEdge {
      return { from, to, kind: "contains", provenance: "declared", weight: 1 };
    }
    function extendsEdge(from: string, to: string): CodeGraphEdge {
      return { from, to, kind: "extends", provenance: "resolved", weight: 1 };
    }
    function carriesEdge(from: string, to: string): CodeGraphEdge {
      return { from, to, kind: "carries", provenance: "inferred", weight: 1 };
    }
    function graphOf(nodes: CodeGraphNode[], edges: CodeGraphEdge[]): CodeGraph {
      return { nodes, edges, resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] } };
    }

    async function runWithGraph(source: string, graph: CodeGraph | null): Promise<readonly RawFinding[]> {
      const sets = await nodeSetsFor(CSHARP_WASM, CSHARP_PROBE);
      const root = await parseRoot(CSHARP_WASM, source);
      const file = fileUnitFrom(root, sets, "csharp");
      const ctx = withGraph(testContext(detector, "csharp"), graph);
      const findings: RawFinding[] = [];
      for (const fn of file.functions) findings.push(...(detector.run(fn, ctx) as readonly RawFinding[]));
      return findings;
    }

    // DOS sentencias reales, una de ellas usando "value" — a propósito, para
    // no chocar con el guard PREEXISTENTE `isHookLikeBody` (cuerpo de una
    // sola sentencia que ignora TODOS sus parámetros ya se suprime por otro
    // motivo, sin relación con el mecanismo de esta tarea) — misma trampa
    // que B1a documentó en su informe para este mismo archivo.
    const IMPLICIT_IMPLEMENTATION_SOURCE = `
class Inner : IWriter {
  public void Write(string value, int index) {
    System.Console.WriteLine(value);
    System.Console.WriteLine("done");
  }
}
`;

    it("CASO REAL (equivalente de IXmlDocument/newtonsoft-json): implementación IMPLÍCITA de interfaz (sin `override`/`explicit_interface_specifier`) no reporta su parámetro sin uso cuando el grafo confirma el contrato", async () => {
      const graph = graphOf(
        [symNode("sym:fixture.csharp#Inner", "fixture.csharp", ["Inner"]), symNode("sym:fixture.csharp#IWriter", "fixture.csharp", ["IWriter"]), symNode("sym:fixture.csharp#IWriter.Write", "fixture.csharp", ["IWriter", "Write"], { family: "function-like", arity: 2 })],
        [extendsEdge("sym:fixture.csharp#Inner", "sym:fixture.csharp#IWriter"), containsEdge("sym:fixture.csharp#IWriter", "sym:fixture.csharp#IWriter.Write")],
      );
      const findings = await runWithGraph(IMPLICIT_IMPLEMENTATION_SOURCE, graph);
      expect(findings).toHaveLength(0);
    });

    it("degrada SIN grafo (`ctx.graph === null`, exactamente la pasada 1): el mismo método reporta su parámetro sin uso como antes de esta ola", async () => {
      const findings = await runWithGraph(IMPLICIT_IMPLEMENTATION_SOURCE, null);
      const params = findings.filter((f) => f.variant === "parametro");
      expect(params).toHaveLength(1);
      expect(params[0]!.locations[0]!.symbol).toBe("index");
    });

    it("con grafo PERO sin ninguna arista de contrato (clase sin `implements`/`extends`/`satisfies` que empareje) sigue reportando: el mecanismo no sobre-suprime", async () => {
      const source = `
class Plain {
  public void Write(string value, int index) {
    System.Console.WriteLine(value);
    System.Console.WriteLine("done");
  }
}
`;
      const graph = graphOf([symNode("sym:fixture.csharp#Plain", "fixture.csharp", ["Plain"])], []);
      const findings = await runWithGraph(source, graph);
      const params = findings.filter((f) => f.variant === "parametro");
      expect(params).toHaveLength(1);
    });

    it("CASO REAL (equivalente de `customDefaultsMerge`/lodash, verificado que ESTE es el caso que `carries` sí resuelve — ver el docstring del módulo, mecanismo (B)): una función SUELTA (no miembro de clase) registrada como delegado en otro lado no reporta su parámetro sin uso", async () => {
      const JS_WASM = "tree-sitter-javascript.wasm";
      const source = `
function customDefaultsMerge(objValue, srcValue, unusedKey) {
  return objValue === undefined ? srcValue : objValue;
}
function baseMerge(a, b, customizer) {
  return customizer(a, b);
}
`;
      const graph = graphOf(
        [symNode("sym:fixture.javascript#customDefaultsMerge", "fixture.javascript", ["customDefaultsMerge"]), symNode("sym:fixture.javascript#baseMerge", "fixture.javascript", ["baseMerge"])],
        [carriesEdge("sym:fixture.javascript#baseMerge", "sym:fixture.javascript#customDefaultsMerge")],
      );
      const sets = await nodeSetsFor(JS_WASM, JS_PROBE);
      const root = await parseRoot(JS_WASM, source);
      const file = fileUnitFrom(root, sets, "javascript");
      const ctx = withGraph(testContext(detector, "javascript"), graph);
      const findings: RawFinding[] = [];
      for (const fn of file.functions) findings.push(...(detector.run(fn, ctx) as readonly RawFinding[]));
      const params = findings.filter((f) => f.variant === "parametro" && f.locations[0]!.symbol === "unusedKey");
      expect(params).toHaveLength(0);
    });
  });
});

/*
 * OLA O, FRENTE N6 — (H) la huella de un contrato EXTERNO en el grafo, y
 * (I) el parámetro que la sintaxis declara como miembro del objeto.
 */
describe("unused-variable — OLA O, FRENTE N6", () => {
  const GO_WASM = "tree-sitter-go.wasm";
  const TS_WASM = "tree-sitter-typescript.wasm";

  function symNode(id: string, file: string, symbolPath: readonly string[], extra: Partial<CodeGraphNode> = {}): CodeGraphNode {
    return { id, kind: "symbol", file, symbolPath, ...extra } as CodeGraphNode;
  }
  function graphOf(nodes: CodeGraphNode[]): CodeGraph {
    return { nodes, edges: [], resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] } };
  }

  // Dos sentencias reales, una usando `dst`, para no chocar con
  // `isHookLikeBody` — misma trampa que B1a/B1b documentaron acá.
  const GO_SOURCE = `
package main

func (f *overlayFilter) Draw(dst int, src int, options int) {
	println(dst)
	println("done")
}
`;

  async function runGo(graph: CodeGraph | null): Promise<readonly RawFinding[]> {
    const sets = await nodeSetsFor(GO_WASM, GO_PROBE);
    const root = await parseRoot(GO_WASM, GO_SOURCE);
    const file = fileUnitFrom(root, sets, "go");
    const ctx = withGraph(testContext(detector, "go"), graph);
    const findings: RawFinding[] = [];
    for (const fn of file.functions) findings.push(...(detector.run(fn, ctx) as readonly RawFinding[]));
    return findings;
  }

  describe("(H) la misma firma declarada en varios contenedores es un contrato de hecho", () => {
    it("con OTRO contenedor del repo declarando `Draw/3`, los parámetros sin uso ya no se reportan (caso real: hugo `gift.Filter`, una interfaz de una dependencia externa que el grafo no puede ver)", async () => {
      const graph = graphOf([
        symNode("sym:otro.go#textFilter.Draw", "otro.go", ["textFilter", "Draw"], { family: "function-like", arity: 3 }),
        symNode("sym:fixture.go#overlayFilter.Draw", "fixture.go", ["overlayFilter", "Draw"], { family: "function-like", arity: 3 }),
      ]);
      expect(await runGo(graph)).toHaveLength(0);
    });

    it("control negativo (H): con la firma declarada en UN SOLO contenedor no hay contrato — sigue reportando", async () => {
      const graph = graphOf([symNode("sym:fixture.go#overlayFilter.Draw", "fixture.go", ["overlayFilter", "Draw"], { family: "function-like", arity: 3 })]);
      const findings = await runGo(graph);
      expect(findings).toHaveLength(2); // `src` y `options`
    });

    it("control negativo (H): la ARIDAD tiene que coincidir — `Draw/2` en otro contenedor no explica una firma de 3", async () => {
      const graph = graphOf([
        symNode("sym:otro.go#textFilter.Draw", "otro.go", ["textFilter", "Draw"], { family: "function-like", arity: 2 }),
        symNode("sym:fixture.go#overlayFilter.Draw", "fixture.go", ["overlayFilter", "Draw"], { family: "function-like", arity: 3 }),
      ]);
      expect(await runGo(graph)).toHaveLength(2);
    });

    it("degrada SIN grafo (H): el mismo método sigue reportando, exactamente como antes de esta ola", async () => {
      expect(await runGo(null)).toHaveLength(2);
    });

    it("(H) NUNCA se aplica a un constructor: dos clases con un constructor de la misma aridad no comparten ningún contrato", async () => {
      const CSHARP_WASM2 = "tree-sitter-c_sharp.wasm";
      // La sonda de arriba no ejercita un `constructor_declaration`, así que
      // `deriveNodeSets` no lo deriva como nodo función-like — sonda propia,
      // límite del arnés de test, no del detector (las de producción sí lo
      // ejercitan).
      const CSHARP_CTOR_PROBE = `${CSHARP_PROBE}
class Ctor {
  Ctor(int a, int b) {
    Console.WriteLine(a);
    Console.WriteLine(b);
  }
}
`;
      const source = `
class Escaper {
  Escaper(string safe, string unsafeReplacement) {
    System.Console.WriteLine(safe);
    System.Console.WriteLine("done");
  }
}
`;
      const graph = graphOf([
        symNode("sym:otro.cs#Otro.Otro", "otro.cs", ["Otro", "Otro"], { family: "function-like", arity: 2 }),
        symNode("sym:fixture.csharp#Escaper.Escaper", "fixture.csharp", ["Escaper", "Escaper"], { family: "function-like", arity: 2 }),
      ]);
      const sets = await nodeSetsFor(CSHARP_WASM2, CSHARP_CTOR_PROBE);
      const root = await parseRoot(CSHARP_WASM2, source);
      const file = fileUnitFrom(root, sets, "csharp");
      const ctx = withGraph(testContext(detector, "csharp"), graph);
      const findings: RawFinding[] = [];
      for (const fn of file.functions) findings.push(...(detector.run(fn, ctx) as readonly RawFinding[]));
      expect(findings).toHaveLength(1);
      expect(findings[0]!.locations[0]!.symbol).toBe("unsafeReplacement");
    });
  });

  describe("(I) parameter property: la sintaxis declara un miembro, no sólo un parámetro", () => {
    async function runTs(source: string): Promise<readonly RawFinding[]> {
      const sets = await nodeSetsFor(TS_WASM, TS_PROBE);
      const root = await parseRoot(TS_WASM, source);
      const file = fileUnitFrom(root, sets, "typescript");
      const ctx = testContext(detector, "typescript");
      const findings: RawFinding[] = [];
      for (const fn of file.functions) findings.push(...(detector.run(fn, ctx) as readonly RawFinding[]));
      return findings;
    }

    it("`private readonly` sobre un parámetro de constructor no se reporta: el lenguaje lo guarda como campo aunque el cuerpo no lo mencione", async () => {
      const findings = await runTs(`
class Module {
  constructor(private readonly container: NestContainer) {
    this.id = 1;
    this.name = "m";
  }
}
`);
      expect(findings).toHaveLength(0);
    });

    it("`readonly` solo (sin modificador de acceso) también declara un miembro", async () => {
      const findings = await runTs(`
class Module {
  constructor(readonly container: NestContainer) {
    this.id = 1;
    this.name = "m";
  }
}
`);
      expect(findings).toHaveLength(0);
    });

    it("control negativo (I): un parámetro de constructor SIN ninguna de las dos marcas se sigue reportando", async () => {
      const findings = await runTs(`
class Module {
  constructor(container: NestContainer) {
    this.id = 1;
    this.name = "m";
  }
}
`);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.locations[0]!.symbol).toBe("container");
    });
  });
});
