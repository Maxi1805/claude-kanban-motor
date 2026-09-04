import { describe, expect, it } from "vitest";

import { detector } from "./data-clump.js";
import { runIntraFile, testContext } from "../testing.js";

/* ────────────────────────────────────────────────────────────────────────
 * Sondas — sólo necesitan ejercitar la FORMA de función que las fixtures
 * usan (`deriveNodeSets` clasifica tipos de NODO función-como; la forma
 * interna de los parámetros la recorre este detector directo sobre el árbol
 * real, no la sonda). Ver `testing.ts`.
 * ──────────────────────────────────────────────────────────────────────── */
const JS_PROBE = `
function sample(a, b, c) {
  return a + b + c;
}
`;

/**
 * Sonda de MÉTODO DE CLASE (`method_definition`) — distinta de `JS_PROBE`
 * (una `function_declaration` suelta): `deriveNodeSets` clasifica tipos de
 * NODO función-como a partir de lo que la sonda ejercita, así que un fixture
 * con métodos de clase (`this.foo(...)` invocando a un sibling, la forma real
 * de NestJS) parseado con la sonda de función suelta deriva CERO funciones —
 * confirmado al escribir el arreglo 3 (ver docstring del módulo, "UN
 * DESPACHADOR Y SUS VARIANTES"): los dos primeros tests de despachador en
 * TypeScript de abajo, con `JS_PROBE`, pasaban por la razón EQUIVOCADA
 * (`file.functions` vacío → 0 hallazgos siempre, sin importar la lógica del
 * detector). Mismo tipo de bug que ya documenta `testing.ts` sobre "sonda
 * versus forma real" — nunca asumas que la sonda alcanza sin verificar
 * `file.functions.length` primero.
 */
const JS_CLASS_PROBE = `
class Sample {
  method(a, b, c) {
    return a;
  }
}
`;

const PYTHON_PROBE = `
def sample(a, b, c):
    return a
`;

const RUBY_PROBE = `
def sample(a, b, c)
  a
end
`;

const JAVA_PROBE = `
class Sample {
  void method(int a, int b, int c) {}
}
`;

const GO_PROBE = `
package main

func sample(a int, b int, c int) int {
	return a
}
`;

const CSHARP_PROBE = `
class Sample {
  int Method(int a, int b, int c) {
    return a;
  }
}
`;

describe("data-clump", () => {
  it("javascript: el mismo grupo de 3 parámetros repetido en 3 firmas es un hallazgo", async () => {
    const source = `
function crear(nombre, email, telefono) {
  return { nombre, email, telefono };
}

function actualizar(nombre, email, telefono) {
  return { nombre, email, telefono };
}

function validar(nombre, email, telefono) {
  return nombre && email && telefono;
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.title).toContain("nombre");
    expect(finding.title).toContain("email");
    expect(finding.title).toContain("telefono");
    expect(finding.locations).toHaveLength(3);
    expect(finding.trigger[0]!.value).toBe(3); // repeticiones
    expect(finding.trigger[1]!.value).toBe(3); // tamaño del grupo
  });

  it("javascript control negativo: firmas con conjuntos de parámetros distintos entre sí no disparan nada", async () => {
    const source = `
function crear(nombre, email, telefono) {
  return nombre;
}

function calcular(precio, cantidad, descuento) {
  return precio;
}

function log(nivel, mensaje, timestamp) {
  return mensaje;
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
    expect(findings).toHaveLength(0);
  });

  it("javascript: el orden de los parámetros no importa — el mismo conjunto declarado en otro orden sigue siendo el mismo grupo", async () => {
    const source = `
function crear(nombre, email, telefono) {
  return nombre;
}

function actualizar(email, nombre, telefono) {
  return email;
}

function validar(telefono, email, nombre) {
  return telefono;
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(3);
  });

  it("javascript: verifica el rol de la primera ubicación y de una repetición", async () => {
    const source = `
function crear(nombre, email, telefono) { return nombre; }
function actualizar(nombre, email, telefono) { return nombre; }
function validar(nombre, email, telefono) { return nombre; }
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
    expect(findings).toHaveLength(1);
    const [first, second] = findings[0]!.locations;
    expect(first!.role).toBe("primera firma con este grupo");
    expect(first!.symbol).toBe("crear");
    expect(second!.role).toBe("repetición #1");
    expect(second!.symbol).toBe("actualizar");
  });

  it("javascript: un parámetro desestructurado no se puede nombrar con confianza — la firma completa queda fuera de la agrupación (límite declarado)", async () => {
    // Las tres firmas son, en apariencia, textualmente idénticas — pero
    // `{a, b, c}` es UN parámetro (una desestructuración de objeto), no tres,
    // y su nombre no resuelve por ninguna de las tres vías de `paramName`
    // (no es `identifier`, no tiene campo name/pattern/left, y tiene DOS
    // hijos nombrados — no uno). Eso invalida la firma entera para esta
    // agrupación: 0 hallazgos, no un hallazgo fabricado a medias.
    const source = `
function crear(usuario, {a, b, c}) { return usuario; }
function actualizar(usuario, {a, b, c}) { return usuario; }
function validar(usuario, {a, b, c}) { return usuario; }
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
    expect(findings).toHaveLength(0);
  });

  it("javascript: un grupo por debajo del tamaño mínimo no dispara aunque se repita muchas veces", async () => {
    const source = Array.from({ length: 10 }, (_, i) => `function f${i}(a, b) { return a + b; }`).join("\n");
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
    expect(findings).toHaveLength(0);
  });

  it("javascript: borde del umbral de repeticiones — justo en minRepeats dispara, uno menos no, sin que el test elija el número", async () => {
    const minRepeats = testContext(detector, "javascript").threshold("minRepeats").value;
    const makeSource = (n: number) =>
      Array.from({ length: n }, (_, i) => `function f${i}(nombre, email, telefono) { return nombre; }`).join("\n");

    const over = await runIntraFile(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: makeSource(minRepeats),
    });
    expect(over).toHaveLength(1);
    expect(over[0]!.locations).toHaveLength(minRepeats);

    const under = await runIntraFile(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: makeSource(minRepeats - 1),
    });
    expect(under).toHaveLength(0);
  });

  it("python: el mismo grupo de 3 parámetros repetido en 3 firmas es un hallazgo", async () => {
    const source = `
def crear(nombre, email, telefono):
    return nombre

def actualizar(nombre, email, telefono):
    return nombre

def validar(nombre, email, telefono):
    return nombre
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-python.wasm", probe: PYTHON_PROBE, language: "python", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(3);
  });

  it("python control negativo: firmas con parámetros distintos no disparan nada", async () => {
    const source = `
def crear(nombre, email, telefono):
    return nombre

def calcular(precio, cantidad, descuento):
    return precio

def log(nivel, mensaje, timestamp):
    return mensaje
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-python.wasm", probe: PYTHON_PROBE, language: "python", source });
    expect(findings).toHaveLength(0);
  });

  it("ruby: el mismo grupo de 3 parámetros repetido en 3 firmas es un hallazgo", async () => {
    const source = `
def crear(nombre, email, telefono)
  nombre
end

def actualizar(nombre, email, telefono)
  nombre
end

def validar(nombre, email, telefono)
  nombre
end
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(3);
  });

  it("ruby control negativo: firmas con parámetros distintos no disparan nada", async () => {
    const source = `
def crear(nombre, email, telefono)
  nombre
end

def calcular(precio, cantidad, descuento)
  precio
end

def log(nivel, mensaje, timestamp)
  mensaje
end
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source });
    expect(findings).toHaveLength(0);
  });

  it("java: el mismo grupo de 3 parámetros repetido en 3 métodos de la misma clase es un hallazgo", async () => {
    const source = `
class Cliente {
  void crear(String nombre, String email, String telefono) {}
  void actualizar(String nombre, String email, String telefono) {}
  boolean validar(String nombre, String email, String telefono) { return true; }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, language: "java", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(3);
  });

  it("java control negativo: métodos con parámetros distintos no disparan nada", async () => {
    const source = `
class Cliente {
  void crear(String nombre, String email, String telefono) {}
  void calcular(int precio, int cantidad, int descuento) {}
  void log(String nivel, String mensaje, long timestamp) {}
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, language: "java", source });
    expect(findings).toHaveLength(0);
  });

  it("go: el mismo grupo de 3 parámetros repetido en 3 funciones es un hallazgo", async () => {
    const source = `
package main

func crear(nombre string, email string, telefono string) bool {
	return true
}

func actualizar(nombre string, email string, telefono string) bool {
	return true
}

func validar(nombre string, email string, telefono string) bool {
	return true
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-go.wasm", probe: GO_PROBE, language: "go", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(3);
  });

  it("go control negativo: funciones con parámetros distintos no disparan nada", async () => {
    const source = `
package main

func crear(nombre string, email string, telefono string) bool {
	return true
}

func calcular(precio int, cantidad int, descuento int) int {
	return precio
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-go.wasm", probe: GO_PROBE, language: "go", source });
    expect(findings).toHaveLength(0);
  });

  /* ──────────────────────────────────────────────────────────────────────
   * Arreglo 1 (ver docstring): `self` NUNCA es un dato del grupo.
   * ────────────────────────────────────────────────────────────────────── */
  it("python: `self` no cuenta como dato del grupo — 3 métodos con (self, nombre, email, telefono) siguen disparando por los 3 datos reales, no por 4", async () => {
    const source = `
class Cliente:
    def crear(self, nombre, email, telefono):
        return nombre

    def actualizar(self, nombre, email, telefono):
        return nombre

    def validar(self, nombre, email, telefono):
        return nombre
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-python.wasm", probe: PYTHON_PROBE, language: "python", source });
    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.title).not.toContain("self");
    expect(finding.title).toContain("nombre");
    expect(finding.trigger[1]!.value).toBe(3); // tamaño del grupo: 3 datos reales, `self` no cuenta.
  });

  it("python: `self` + sólo 2 datos reales NO dispara — sin excluir `self`, (self, param, ctx) cruzaría minGroupSize (3) por un miembro que no es un dato", async () => {
    // Caso real medido: click (Python) `ParamType.get_metavar`/`get_missing_message`
    // — grupo reportado antes de este arreglo como `(self, param, ctx)`,
    // tamaño 3; en realidad `(param, ctx)`, tamaño 2, por debajo del piso de
    // Fowler.
    const source = `
class ParamType:
    def get_metavar(self, param, ctx):
        return None

    def get_missing_message(self, param, ctx):
        return None
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-python.wasm", probe: PYTHON_PROBE, language: "python", source });
    expect(findings).toHaveLength(0);
  });

  /* ──────────────────────────────────────────────────────────────────────
   * Arreglo 2 (ver docstring): un grupo necesita ≥minRepeats OPERACIONES
   * DISTINTAS, no sólo ≥minRepeats ocurrencias.
   * ────────────────────────────────────────────────────────────────────── */
  it("java: el mismo nombre de método sobrecargado por tipo (mismo nombre, mismos nombres de parámetro, tipos distintos) NO dispara — es la MISMA operación, no 3 firmas independientes", async () => {
    // Caso real medido: Guava `Preconditions.checkArgument(expression,
    // errorMessageTemplate, p1)` — el mismo idioma de sobrecarga por aridad,
    // el mismo NOMBRE `p1` por convención en cada overload.
    const source = `
class Preconditions {
  static void checkArgument(boolean expression, String errorMessageTemplate, Object p1) {}
  static void checkArgument(boolean expression, String errorMessageTemplate, int p1) {}
  static void checkArgument(boolean expression, String errorMessageTemplate, long p1) {}
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, language: "java", source });
    expect(findings).toHaveLength(0);
  });

  it("java: el mismo nombre de método repetido en clases hermanas (override de protocolo) NO dispara", async () => {
    // Caso real medido: Newtonsoft.Json `WriteJson(writer, value, serializer)`
    // — un override por cada convertidor concreto, todos bajo el mismo nombre.
    const source = `
class IntConverter {
  void WriteJson(Writer writer, Object value, Serializer serializer) {}
}

class StringConverter {
  void WriteJson(Writer writer, Object value, Serializer serializer) {}
}

class DateConverter {
  void WriteJson(Writer writer, Object value, Serializer serializer) {}
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, language: "java", source });
    expect(findings).toHaveLength(0);
  });

  it("python: DOS operaciones distintas, cada una sobrecargada por separado, cuyas ocurrencias se suman al mismo grupo NO disparan — ninguna llega sola al piso de repeticiones", async () => {
    // Caso real medido (encontrado al MEDIR contra el corpus, ver docstring
    // 'ENCONTRADO AL MEDIR'): click `command`/`group` en `decorators.py` —
    // dos decoradores casi gemelos, cada uno con varias variantes
    // `@t.overload` que comparten el grupo (name, cls, attrs). 6 ocurrencias
    // totales pero sólo 2 nombres de operación DISTINTOS (3 "command" + 3
    // "group"): una regla que sólo pregunta "¿son TODAS el mismo nombre?"
    // no ve esto (hay dos nombres, no uno) — hace falta contar DISTINTOS.
    const source = `
def command(name, cls, attrs):
    pass

def command(name, cls, attrs):
    pass

def command(name, cls, attrs):
    pass

def group(name, cls, attrs):
    pass

def group(name, cls, attrs):
    pass

def group(name, cls, attrs):
    pass
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-python.wasm", probe: PYTHON_PROBE, language: "python", source });
    expect(findings).toHaveLength(0);
  });

  it("java control: mismos 3 parámetros pero con nombres de método DISTINTOS sigue disparando — el arreglo 2 no descarta grupos con ≥minRepeats nombres distintos, sólo cuando hay menos", async () => {
    // Caso real medido: Guava `StandardTable` — `put`/`containsMapping`/
    // `removeMapping`, 3 nombres DISTINTOS que comparten (rowKey, columnKey,
    // value) — data clump orgánico, no una sobrecarga ni un override.
    const source = `
class StandardTable {
  void put(String rowKey, String columnKey, String value) {}
  boolean containsMapping(String rowKey, String columnKey, String value) { return true; }
  boolean removeMapping(String rowKey, String columnKey, String value) { return true; }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, language: "java", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(3);
  });

  /* ────────────────────────────────────────────────────────────────────
   * Arreglo 3 — "UN DESPACHADOR Y SUS VARIANTES" (ver docstring del
   * módulo). Casos reales: RuboCop `IndentationWidth#message` despacha a
   * `message_for_tabs`/`message_for_spaces`; NestJS `Module#addCustomProvider`
   * despacha a `addCustomClass`/`addCustomValue`/`addCustomFactory`/
   * `addCustomUseExisting`, las 4 con la MISMA firma. Sonda por gramática:
   * ninguno de los 7 lenguajes soportados es especial acá — un `if`/`else`
   * (o `elsif`) que reenvía el grupo de parámetros a un sibling del grupo es
   * la MISMA forma en las 6 gramáticas probadas abajo.
   * ──────────────────────────────────────────────────────────────────── */

  it("ruby: despachador condicional (caso real RuboCop message → message_for_tabs/message_for_spaces) NO dispara", async () => {
    const source = `
def message(width, indentation, name)
  if using_tabs
    message_for_tabs(width, indentation, name)
  else
    message_for_spaces(width, indentation, name)
  end
end

def message_for_tabs(width, indentation, name)
  format(width, indentation, name)
end

def message_for_spaces(width, indentation, name)
  format(width, indentation, name)
end
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source });
    expect(findings).toHaveLength(0);
  });

  it("typescript: despachador condicional con 4 variantes (caso real NestJS addCustomProvider → addCustomClass/Value/Factory/UseExisting) NO dispara", async () => {
    const source = `
class Module {
  addCustomProvider(provider, collection, sub) {
    if (this.isCustomClass(provider)) {
      this.addCustomClass(provider, collection, sub);
    } else if (this.isCustomValue(provider)) {
      this.addCustomValue(provider, collection, sub);
    } else if (this.isCustomFactory(provider)) {
      this.addCustomFactory(provider, collection, sub);
    } else {
      this.addCustomUseExisting(provider, collection, sub);
    }
  }

  addCustomClass(provider, collection, sub) {
    collection.set(provider, sub);
  }

  addCustomValue(provider, collection, sub) {
    collection.set(provider, sub);
  }

  addCustomFactory(provider, collection, sub) {
    collection.set(provider, sub);
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-typescript.wasm", probe: JS_CLASS_PROBE, language: "typescript", source });
    expect(findings).toHaveLength(0);
  });

  it("java: despachador condicional (misma forma, otra gramática) NO dispara", async () => {
    const source = `
class Formatter {
  String message(String width, String indentation, String name) {
    if (usingTabs) {
      return messageForTabs(width, indentation, name);
    } else {
      return messageForSpaces(width, indentation, name);
    }
  }

  String messageForTabs(String width, String indentation, String name) { return name; }

  String messageForSpaces(String width, String indentation, String name) { return name; }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, language: "java", source });
    expect(findings).toHaveLength(0);
  });

  it("python: despachador condicional (misma forma, otra gramática) NO dispara", async () => {
    const source = `
def message(width, indentation, name):
    if using_tabs:
        return message_for_tabs(width, indentation, name)
    else:
        return message_for_spaces(width, indentation, name)

def message_for_tabs(width, indentation, name):
    return name

def message_for_spaces(width, indentation, name):
    return name
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-python.wasm", probe: PYTHON_PROBE, language: "python", source });
    expect(findings).toHaveLength(0);
  });

  it("go: despachador condicional (misma forma, otra gramática) NO dispara", async () => {
    const source = `
package main

func message(width int, indentation int, name string) string {
	if usingTabs {
		return messageForTabs(width, indentation, name)
	}
	return messageForSpaces(width, indentation, name)
}

func messageForTabs(width int, indentation int, name string) string {
	return name
}

func messageForSpaces(width int, indentation int, name string) string {
	return name
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-go.wasm", probe: GO_PROBE, language: "go", source });
    expect(findings).toHaveLength(0);
  });

  it("csharp: despachador condicional (misma forma, otra gramática) NO dispara", async () => {
    const source = `
class Formatter {
  string Message(string width, string indentation, string name) {
    if (usingTabs) {
      return MessageForTabs(width, indentation, name);
    } else {
      return MessageForSpaces(width, indentation, name);
    }
  }

  string MessageForTabs(string width, string indentation, string name) { return name; }

  string MessageForSpaces(string width, string indentation, string name) { return name; }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-c_sharp.wasm", probe: CSHARP_PROBE, language: "csharp", source });
    expect(findings).toHaveLength(0);
  });

  it("java control: reenvío a UN SOLO sibling (caso real Guava StandardTable.removeMapping llamando containsMapping) sigue disparando — el arreglo 3 exige ≥2 siblings distintos, no 1", async () => {
    // Con el piso en 1 este arreglo excluiría el ÚNICO grupo `verdadero`
    // confirmado del catálogo (ver docstring del módulo): `removeMapping`
    // llama a `containsMapping` como un paso normal de SU PROPIA lógica
    // (comprobar antes de borrar), nunca a `put` — nunca hay 2 siblings
    // distintos invocados desde una sola ocurrencia.
    const source = `
class StandardTable {
  void put(String rowKey, String columnKey, String value) {}

  boolean containsMapping(String rowKey, String columnKey, String value) { return true; }

  boolean removeMapping(String rowKey, String columnKey, String value) {
    if (containsMapping(rowKey, columnKey, value)) {
      return true;
    }
    return false;
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, language: "java", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(3);
  });

  it("typescript control: 2 siblings invocados pero SIN reenviar ningún parámetro del grupo sigue disparando — el arreglo 3 exige que la llamada reenvíe el dato, no sólo que nombre a un sibling", async () => {
    const source = `
class Module {
  addCustomProvider(provider, collection, sub) {
    if (this.isCustomClass(provider)) {
      this.addCustomClass(1, 2, 3);
    } else {
      this.addCustomValue(4, 5, 6);
    }
  }

  addCustomClass(provider, collection, sub) {
    collection.set(provider, sub);
  }

  addCustomValue(provider, collection, sub) {
    collection.set(provider, sub);
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-typescript.wasm", probe: JS_CLASS_PROBE, language: "typescript", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(3);
  });
});
