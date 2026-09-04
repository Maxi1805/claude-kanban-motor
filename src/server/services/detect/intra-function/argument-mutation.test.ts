import { describe, expect, it } from "vitest";

import { detector } from "./argument-mutation.js";
import { fileUnitFrom, nodeSetsFor, parseRoot, runIntraFunction, testContext } from "../testing.js";
import { withGraph } from "../primitivas/u1-grafo-en-contexto.js";
import type { CodeGraph, CodeGraphEdge, CodeGraphNode } from "../../graph/types.js";
import type { RawFinding } from "../types.js";

/** La sonda ejercita clase+método y función suelta — alcanza para que `functionNodes`/`classNodes` se deriven bien; las formas de asignación/acceso/llamada que el detector reconoce se leen directo del árbol real, no de la sonda (ver el docstring del módulo). */
const JS_PROBE = `
class Shape {
  area(x) {
    return x;
  }
}

function free(x) {
  return x;
}
`;

const PY_PROBE = `
class Shape:
    def area(self, x):
        return x

def free(x):
    return x
`;

const JAVA_PROBE = `
public class Shape {
  public int area(int x) {
    return x;
  }
}
`;

const GO_PROBE = `
package main

func free(x int) int {
	return x
}
`;

const RUBY_PROBE = `
class Shape
  def area(x)
    x
  end
end

def free(x)
  x
end
`;

const CSHARP_PROBE = `
class Shape {
  int Area(int x) {
    return x;
  }
}
`;

describe("argument-mutation", () => {
  describe("javascript", () => {
    it("reasignación real: `count = nextId()` es un hallazgo de variante reassignment (el valor nuevo no tiene relación con el recibido)", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        language: "javascript",
        source: `
function bump(count) {
  count = nextId();
  return count;
}
`,
      });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.variant).toBe("reassignment");
      expect(findings[0]!.locations[0]!.role).toBe('reasignación de "count"');
      // El umbral se pide, nunca se hardcodea (PLANTILLA §3).
      const threshold = testContext(detector, "javascript").threshold("presence").value;
      expect(findings[0]!.trigger[0]!.value).toBeGreaterThanOrEqual(threshold);
    });

    it("JUICIO DE PRECISIÓN #3 — auto-referencia: `count = count + 1` YA NO dispara (el lado derecho LEE el valor viejo para construir el nuevo, nunca lo pierde — medido 0/9 verdaderos en el corpus sobre esta forma exacta)", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        language: "javascript",
        source: `
function bump(count) {
  count = count + 1;
  return count;
}
`,
      });
      expect(findings).toHaveLength(0);
    });

    it("JUICIO DE PRECISIÓN #3 — incremento: `counter++` YA NO dispara (un operador de actualización SIEMPRE lee el valor anterior, mismo motivo que un operador compuesto)", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        language: "javascript",
        source: `
function increment(counter) {
  counter++;
  return counter;
}
`,
      });
      expect(findings).toHaveLength(0);
    });

    it("JUICIO DE PRECISIÓN #3 — operador compuesto: `count += 1` YA NO dispara (LEE el valor anterior, nunca lo ignora — la preocupación literal de S1226)", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        language: "javascript",
        source: `
function bump(count) {
  count += 1;
  return count;
}
`,
      });
      expect(findings).toHaveLength(0);
    });

    it("JUICIO DE PRECISIÓN #3 — guarda: `if (count === undefined) count = 0;` YA NO dispara (valor por defecto si está ausente, la condición ya prueba la MISMA variable)", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        language: "javascript",
        source: `
function withDefault(count) {
  if (count === undefined) {
    count = 0;
  }
  return count;
}
`,
      });
      expect(findings).toHaveLength(0);
    });

    it("mutación por miembro: `sink.value = 1` es un hallazgo de variante mutation", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        language: "javascript",
        source: `
function fill(sink) {
  sink.value = 1;
  return sink;
}
`,
      });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.variant).toBe("mutation");
      expect(findings[0]!.locations[0]!.role).toBe('mutación de "sink"');
    });

    it("JUICIO DE PRECISIÓN #5 — escribir EN UN ÍNDICE del parámetro (`list[0] = \"x\"`) NO es mutation: el llamador entregó un contenedor, que no tiene otra cosa que su contenido", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        language: "javascript",
        source: `
function setFirst(list) {
  list[0] = "x";
  return list;
}
`,
      });
      expect(findings).toHaveLength(0);
    });

    it("JUICIO DE PRECISIÓN #5 — `cmds[i].campo = x` tampoco: el índice se apoya DIRECTAMENTE sobre el parámetro", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        language: "javascript",
        source: `
function adopt(cmds, parent) {
  cmds[0].parent = parent;
  return cmds;
}
`,
      });
      expect(findings).toHaveLength(0);
    });

    it("JUICIO DE PRECISIÓN #5, control negativo — `cfg.items[0] = x` SÍ dispara: el llamador entregó `cfg`, no `cfg.items`, y bajar por un campo hasta un contenedor interno es justamente el efecto invisible que el detector busca", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        language: "javascript",
        source: `
function poke(cfg) {
  cfg.items[0] = "x";
  return cfg;
}
`,
      });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.variant).toBe("mutation");
      expect(findings[0]!.locations[0]!.symbol).toBe("cfg");
    });

    it("JUICIO DE PRECISIÓN #5, control negativo — la escritura por CAMPO sobre el parámetro sigue siendo mutation", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        language: "javascript",
        source: `
function tag(cmd, other) {
  cmd.disableAutoGenTag = other;
  return cmd;
}
`,
      });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.variant).toBe("mutation");
    });

    it("control negativo: una función que sólo lee sus parámetros no dispara nada", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        language: "javascript",
        source: `
function pure(a, b) {
  const sum = a + b;
  return sum;
}
`,
      });
      expect(findings).toHaveLength(0);
    });

    it("control negativo: `getter().value = 1` no se atribuye al parámetro `getter` (cruza una llamada)", async () => {
      // Prueba directa del guardia `isCallShaped`: lo que se muta es el
      // RESULTADO de invocar `getter()`, no `getter` en sí — atribuirlo sería
      // un falso positivo real, no una simplificación aceptable.
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        language: "javascript",
        source: `
function callGetter(getter) {
  getter().value = 1;
  return getter;
}
`,
      });
      expect(findings).toHaveLength(0);
    });
  });

  describe("python", () => {
    it("reasignación real: `count = next_id()` es reassignment", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-python.wasm",
        probe: PY_PROBE,
        language: "python",
        source: `
def bump(count):
    count = next_id()
    return count
`,
      });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.variant).toBe("reassignment");
    });

    it("JUICIO DE PRECISIÓN #3 — auto-referencia: `count = count + 1` YA NO dispara", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-python.wasm",
        probe: PY_PROBE,
        language: "python",
        source: `
def bump(count):
    count = count + 1
    return count
`,
      });
      expect(findings).toHaveLength(0);
    });

    it("JUICIO DE PRECISIÓN #3 — guarda: `if x is None: x = default()` YA NO dispara (la forma más común del corpus real: 19 de 36 falsos positivos de `reassignment` medidos)", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-python.wasm",
        probe: PY_PROBE,
        language: "python",
        source: `
def with_default(path):
    if path is None:
        path = default_path()
    return path
`,
      });
      expect(findings).toHaveLength(0);
    });

    it("mutación de un parámetro que NO es el receptor sí dispara: `cfg.enabled = True`", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-python.wasm",
        probe: PY_PROBE,
        language: "python",
        source: `
class Box:
    def configure(self, cfg):
        cfg.enabled = True
`,
      });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.variant).toBe("mutation");
      expect(findings[0]!.locations[0]!.role).toBe('mutación de "cfg"');
    });

    it("límite documentado — receptor de método (`self`, posición cero): `self.value = value` NO dispara mutation", async () => {
      // Ver el docstring del módulo: Python es el único de los seis lenguajes
      // soportados donde el receptor de un método es un parámetro DECLARADO
      // en la posición cero; mutar sus atributos es el diseño OO normal.
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-python.wasm",
        probe: PY_PROBE,
        language: "python",
        source: `
class Box:
    def fill(self, value):
        self.value = value
`,
      });
      expect(findings).toHaveLength(0);
    });

    it("control negativo: una función que sólo lee sus parámetros no dispara nada", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-python.wasm",
        probe: PY_PROBE,
        language: "python",
        source: `
def pure(a, b):
    total = a + b
    return total
`,
      });
      expect(findings).toHaveLength(0);
    });
  });

  describe("java", () => {
    it("reasignación real: `count = nextId()` es reassignment", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-java.wasm",
        probe: JAVA_PROBE,
        language: "java",
        source: `
public class Ops {
  public int bump(int count) {
    count = nextId();
    return count;
  }
}
`,
      });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.variant).toBe("reassignment");
    });

    it("JUICIO DE PRECISIÓN #3 — auto-referencia: `count = count + 1` YA NO dispara", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-java.wasm",
        probe: JAVA_PROBE,
        language: "java",
        source: `
public class Ops {
  public int bump(int count) {
    count = count + 1;
    return count;
  }
}
`,
      });
      expect(findings).toHaveLength(0);
    });

    it("mutación: `sink.value = 1` es mutation", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-java.wasm",
        probe: JAVA_PROBE,
        language: "java",
        source: `
public class Ops {
  public void fill(Box sink) {
    sink.value = 1;
  }
}
`,
      });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.variant).toBe("mutation");
      expect(findings[0]!.locations[0]!.role).toBe('mutación de "sink"');
    });

    it("contraste con Python: mutar el PRIMER parámetro de un método Java sí dispara — la supresión del receptor está acotada a `language === \"python\"`", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-java.wasm",
        probe: JAVA_PROBE,
        language: "java",
        source: `
public class Ops {
  public void configure(Options opts) {
    opts.enabled = true;
  }
}
`,
      });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.variant).toBe("mutation");
    });

    it("control negativo: una función que sólo lee sus parámetros no dispara nada", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-java.wasm",
        probe: JAVA_PROBE,
        language: "java",
        source: `
public class Ops {
  public int pure(int a, int b) {
    int sum = a + b;
    return sum;
  }
}
`,
      });
      expect(findings).toHaveLength(0);
    });
  });

  describe("csharp", () => {
    it("reasignación real: `count = NextId()` sigue disparando (control: el arreglo de out/ref no apaga el caso real)", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-c_sharp.wasm",
        probe: CSHARP_PROBE,
        language: "csharp",
        source: `
class Ops {
  int Bump(int count) {
    count = NextId();
    return count;
  }
}
`,
      });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.variant).toBe("reassignment");
    });

    it("JUICIO DE PRECISIÓN #3 — auto-referencia: `count = count + 1` YA NO dispara", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-c_sharp.wasm",
        probe: CSHARP_PROBE,
        language: "csharp",
        source: `
class Ops {
  int Bump(int count) {
    count = count + 1;
    return count;
  }
}
`,
      });
      expect(findings).toHaveLength(0);
    });

    it("JUICIO DE PRECISIÓN #3 — guarda sobre `mutation`: `header.Title = ...` guardado por `if (header.Title == \"\")` YA NO dispara (memoización real, caso medido en cobra/doc/man_docs.go:120)", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-c_sharp.wasm",
        probe: CSHARP_PROBE,
        language: "csharp",
        source: `
class Ops {
  void FillHeader(Header header) {
    if (header.Title == "") {
      header.Title = "default";
    }
  }
}
`,
      });
      expect(findings).toHaveLength(0);
    });

    it('JUICIO DE PRECISIÓN — asignar un parámetro `out` NO dispara: es la única forma de devolver el valor, no una mutación descuidada (caso real: `EnumUtils.cs#TryToString` en `newtonsoft-json`)', async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-c_sharp.wasm",
        probe: CSHARP_PROBE,
        language: "csharp",
        source: `
class Ops {
  bool TryGetName(int id, out string name) {
    name = "x";
    return true;
  }
}
`,
      });
      expect(findings).toHaveLength(0);
    });

    it("JUICIO DE PRECISIÓN — asignar un parámetro `ref` tampoco dispara: modificar la variable del llamador es el propósito declarado de `ref`", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-c_sharp.wasm",
        probe: CSHARP_PROBE,
        language: "csharp",
        source: `
class Ops {
  void Increment(ref int count) {
    count = count + 1;
  }
}
`,
      });
      expect(findings).toHaveLength(0);
    });

    it("control: un parámetro `in` (sólo lectura) no tiene nada que ver con esto, pero un parámetro NORMAL en la misma firma sigue disparando", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-c_sharp.wasm",
        probe: CSHARP_PROBE,
        language: "csharp",
        source: `
class Ops {
  bool TryScale(in int factor, int amount, out int result) {
    // Auto-referencia deliberadamente EVITADA acá (ver JUICIO DE PRECISIÓN
    // #3): "amount = amount * factor" ya no dispararía por leer su propio
    // valor — este test aísla in/out del resto del criterio, no la
    // auto-referencia (que tiene su propio test arriba).
    amount = ComputeAmount(factor);
    result = amount;
    return true;
  }
}
`,
      });
      // `amount` (parámetro normal) SÍ dispara; `factor` (in) y `result` (out) no participan.
      expect(findings).toHaveLength(1);
      expect(findings[0]!.locations[0]!.symbol).toBe("amount");
    });
  });

  describe("go", () => {
    it("reasignación real: `count = nextID()` es reassignment", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-go.wasm",
        probe: GO_PROBE,
        language: "go",
        source: `
package main

func bump(count int) int {
	count = nextID()
	return count
}
`,
      });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.variant).toBe("reassignment");
    });

    it("JUICIO DE PRECISIÓN #3 — auto-referencia: `count = count + 1` YA NO dispara", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-go.wasm",
        probe: GO_PROBE,
        language: "go",
        source: `
package main

func bump(count int) int {
	count = count + 1
	return count
}
`,
      });
      expect(findings).toHaveLength(0);
    });

    it("JUICIO DE PRECISIÓN #3 — guarda: `if header == nil { header = &GenManHeader{} }` YA NO dispara (caso real medido en cobra/doc/man_docs.go:107)", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-go.wasm",
        probe: GO_PROBE,
        language: "go",
        source: `
package main

func genMan(header *GenManHeader) *GenManHeader {
	if header == nil {
		header = &GenManHeader{}
	}
	return header
}
`,
      });
      expect(findings).toHaveLength(0);
    });

    it("JUICIO DE PRECISIÓN #3 — auto-referencia: `args = args[1:]` YA NO dispara (consumir un slice como cola dentro de un `for` de estilo Go, que no expone `condition` como campo — cubierto por auto-referencia, no por guarda; caso real medido en cobra/command.go:686)", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-go.wasm",
        probe: GO_PROBE,
        language: "go",
        source: `
package main

func stripFlags(args []string) []string {
	for len(args) > 0 {
		args = args[1:]
	}
	return args
}
`,
      });
      expect(findings).toHaveLength(0);
    });

    it("mutación: `cfg.Enabled = true` sobre un parámetro PUNTERO es mutation con severidad PLENA — `*Config` parsea `pointer_type`, confirmado por referencia (JUICIO DE PRECISIÓN #2)", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-go.wasm",
        probe: GO_PROBE,
        language: "go",
        source: `
package main

type Config struct {
	Enabled bool
}

func Fill(cfg *Config) {
	cfg.Enabled = true
}
`,
      });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.variant).toBe("mutation");
      // Misma severidad base que cualquier otro lenguaje (50 + 1*10 = 60): un
      // puntero SÍ es referencia confirmada, ya no hay motivo para hedgear.
      expect(findings[0]!.severity).toBe(60);
    });

    it("JUICIO DE PRECISIÓN #2 — mutación sobre un parámetro Go de tipo VALOR (`cfg Config`, sin `*`) NO dispara: el cambio nunca sale de la función, Go lo copia", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-go.wasm",
        probe: GO_PROBE,
        language: "go",
        source: `
package main

type Config struct {
	Enabled bool
}

func Fill(cfg Config) {
	cfg.Enabled = true
}
`,
      });
      expect(findings).toHaveLength(0);
    });

    it("JUICIO DE PRECISIÓN #5 — escribir por índice en un SLICE recibido (`items[0] = 1`) NO dispara, aunque el slice SÍ sea una referencia en Go: la pregunta que decide es qué se le hace al parámetro, no si el cambio es visible", async () => {
      // El slice sigue siendo referencia (`isGoConfirmedValueTypeParam` lo
      // deja pasar; el test de arriba, `cfg Config` por valor, prueba que esa
      // distinción sigue viva) — lo que retira el hallazgo es #5: rellenar un
      // contenedor que el llamador construyó y entregó es su propósito.
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-go.wasm",
        probe: GO_PROBE,
        language: "go",
        source: `
package main

func FillFirst(items []int) {
	items[0] = 1
}
`,
      });
      expect(findings).toHaveLength(0);
    });

    it("JUICIO DE PRECISIÓN #2 — mutación sobre un ARRAY de tamaño fijo (`items [3]int`) NO dispara: a diferencia de un slice, Go copia un array por valor", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-go.wasm",
        probe: GO_PROBE,
        language: "go",
        source: `
package main

func FillFirst(items [3]int) {
	items[0] = 1
}
`,
      });
      expect(findings).toHaveLength(0);
    });

    it("control negativo: una función que sólo lee su parámetro no dispara nada", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-go.wasm",
        probe: GO_PROBE,
        language: "go",
        source: `
package main

func pure(a int, b int) int {
	sum := a + b
	return sum
}
`,
      });
      expect(findings).toHaveLength(0);
    });
  });

  describe("ruby", () => {
    it("reasignación real: `count = next_id` es reassignment", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-ruby.wasm",
        probe: RUBY_PROBE,
        language: "ruby",
        source: `
def bump(count)
  count = next_id
  count
end
`,
      });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.variant).toBe("reassignment");
    });

    it("JUICIO DE PRECISIÓN #3 — auto-referencia: `count = count + 1` YA NO dispara", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-ruby.wasm",
        probe: RUBY_PROBE,
        language: "ruby",
        source: `
def bump(count)
  count = count + 1
  count
end
`,
      });
      expect(findings).toHaveLength(0);
    });

    it("JUICIO DE PRECISIÓN #6 — Ruby: `sink.value = 1` (mutación POR ATRIBUTO) SÍ se detecta desde la Ola O: en posición de DESTINO un nodo con forma de llamada no puede ser una invocación", async () => {
      // Era el "límite declarado por lenguaje" del módulo. El razonamiento
      // (no confundir el resultado de invocar con mutar el receptor) sigue
      // valiendo en cualquier otra posición; en el `left` de una asignación
      // no hay tal ambigüedad. Ver JUICIO DE PRECISIÓN #6 en el docstring.
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-ruby.wasm",
        probe: RUBY_PROBE,
        language: "ruby",
        source: `
def fill(sink)
  sink.value = 1
end
`,
      });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.variant).toBe("mutation");
      expect(findings[0]!.locations[0]!.role).toBe('mutación de "sink"');
    });

    it("JUICIO DE PRECISIÓN #6 — Ruby: la cadena anidada `obj.a.b = 2` atribuye al parámetro `obj` (el `receiver` de un `call` puede ser otro `call`)", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-ruby.wasm",
        probe: RUBY_PROBE,
        language: "ruby",
        source: `
def fill(obj)
  obj.a.b = 2
end
`,
      });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.locations[0]!.symbol).toBe("obj");
    });

    it("JUICIO DE PRECISIÓN #6, control negativo — un nodo con forma de llamada que SÍ trae lista de argumentos sigue abortando la atribución", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-ruby.wasm",
        probe: RUBY_PROBE,
        language: "ruby",
        source: `
def fill(sink)
  sink.fetch(:k).value = 1
end
`,
      });
      expect(findings).toHaveLength(0);
    });

    it("JUICIO DE PRECISIÓN #5 — Ruby: `opts[:x] = 1` (escritura por índice en el hash recibido) ya NO dispara", async () => {
      // Es la familia dominante del kind en Ruby: 10 de los 11 hallazgos de
      // `mutation` de `corpus/jekyll` medidos al abrir la ola son un hash o
      // array que el llamador entrega justamente para que se lo llene.
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-ruby.wasm",
        probe: RUBY_PROBE,
        language: "ruby",
        source: `
def configure(opts)
  opts[:x] = 1
end
`,
      });
      expect(findings).toHaveLength(0);
    });

    it("JUICIO DE PRECISIÓN #6 + #3 — Ruby: una escritura por atributo GUARDADA por su propia cadena (`sink.value = 1 if sink.value.nil?`) se excluye, igual que en los otros seis lenguajes", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-ruby.wasm",
        probe: RUBY_PROBE,
        language: "ruby",
        source: `
def fill(sink)
  if sink.value.nil?
    sink.value = 1
  end
end
`,
      });
      expect(findings).toHaveLength(0);
    });

    it("control negativo: una función que sólo lee su parámetro no dispara nada", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-ruby.wasm",
        probe: RUBY_PROBE,
        language: "ruby",
        source: `
def pure(a, b)
  a + b
end
`,
      });
      expect(findings).toHaveLength(0);
    });
  });

  describe("JUICIO DE PRECISIÓN #4 (OLA N, FRENTE B1b) — contrato externo vía grafo", () => {
    const CSHARP_WASM = "tree-sitter-c_sharp.wasm";

    function symNode(id: string, file: string, symbolPath: readonly string[], extra: Partial<CodeGraphNode> = {}): CodeGraphNode {
      return { id, kind: "symbol", file, symbolPath, ...extra } as CodeGraphNode;
    }
    function containsEdge(from: string, to: string): CodeGraphEdge {
      return { from, to, kind: "contains", provenance: "declared", weight: 1 };
    }
    function implementsEdge(from: string, to: string): CodeGraphEdge {
      return { from, to, kind: "implements", provenance: "resolved", weight: 1 };
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

    // Interfaz FICTICIA, DEL REPO (a diferencia de `ICollection<T>.CopyTo`
    // del BCL, que es exactamente el caso que este mecanismo NO puede
    // resolver — ver JUICIO DE PRECISIÓN #4 en el docstring del módulo):
    // hace falta un contrato in-repo para que el caso POSITIVO exista, ya
    // que ninguno de los cinco falsos textuales del encargo lo es (medido,
    // documentado en el módulo).
    const SOURCE = `
class Buffer : ISink {
  public void Write(Slot slot, int index) {
    slot.Value = index;
  }
}
`;

    it("mutar un parámetro cuya firma completa (nombre+aridad) coincide con un miembro de una interfaz DEL REPO que el contenedor implementa no dispara `mutation`", async () => {
      const graph = graphOf(
        [symNode("sym:fixture.csharp#Buffer", "fixture.csharp", ["Buffer"]), symNode("sym:fixture.csharp#ISink", "fixture.csharp", ["ISink"]), symNode("sym:fixture.csharp#ISink.Write", "fixture.csharp", ["ISink", "Write"], { family: "function-like", arity: 2 })],
        [implementsEdge("sym:fixture.csharp#Buffer", "sym:fixture.csharp#ISink"), containsEdge("sym:fixture.csharp#ISink", "sym:fixture.csharp#ISink.Write")],
      );
      const findings = await runWithGraph(SOURCE, graph);
      expect(findings).toHaveLength(0);
    });

    it("degrada SIN grafo: el mismo método sigue reportando la mutación, exactamente como antes de esta ola", async () => {
      const findings = await runWithGraph(SOURCE, null);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.variant).toBe("mutation");
    });

    it("con grafo PERO sin ninguna arista de contrato que empareje, sigue reportando: el mecanismo no sobre-suprime", async () => {
      const source = `
class Plain {
  public void Write(Slot slot, int index) {
    slot.Value = index;
  }
}
`;
      const graph = graphOf([symNode("sym:fixture.csharp#Plain", "fixture.csharp", ["Plain"])], []);
      const findings = await runWithGraph(source, graph);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.variant).toBe("mutation");
    });

    it("`reassignment` NUNCA se suprime por contrato — reasignar el parámetro no escapa a quien llama, con o sin contrato", async () => {
      const source = `
class Buffer : ISink {
  public int Rebind(int value) {
    value = 1;
    return value;
  }
}
`;
      const graph = graphOf(
        [symNode("sym:fixture.csharp#Buffer", "fixture.csharp", ["Buffer"]), symNode("sym:fixture.csharp#ISink", "fixture.csharp", ["ISink"]), symNode("sym:fixture.csharp#ISink.Rebind", "fixture.csharp", ["ISink", "Rebind"], { family: "function-like", arity: 1 })],
        [implementsEdge("sym:fixture.csharp#Buffer", "sym:fixture.csharp#ISink"), containsEdge("sym:fixture.csharp#ISink", "sym:fixture.csharp#ISink.Rebind")],
      );
      const findings = await runWithGraph(source, graph);
      // "value = 1" sin guarda ni auto-referencia: SIGUE siendo una
      // reasignación reportable (JUICIO #3), el contrato no la toca.
      expect(findings).toHaveLength(1);
      expect(findings[0]!.variant).toBe("reassignment");
    });
  });
});
