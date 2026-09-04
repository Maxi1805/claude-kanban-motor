import { describe, expect, it } from "vitest";

import { detector } from "./primitive-obsession.js";
import { runIntraFile, testContext } from "../testing.js";

/* ────────────────────────────────────────────────────────────────────────
 * Sondas — cada una ejercita: una clase auxiliar (`Widget`/`Shape`), UNA
 * función con parámetros mezclando tipo primitivo y tipo propio, y una
 * SEGUNDA función independiente (para confirmar que el agrupamiento no cruza
 * funciones). Las fuentes de los tests se generan con las funciones de abajo,
 * así que la sonda tiene que cubrir toda forma que esas fuentes usan: tipos
 * primitivos repetidos, un tipo propio, y funciones sin parámetros primitivos.
 * ──────────────────────────────────────────────────────────────────────── */

const TS_PROBE = `
class Widget {}

function example(a: number, b: string, w: Widget): number {
  return a;
}

function other(x: number): number {
  return x;
}
`;

const JAVA_PROBE = `
class Widget {}

class Probe {
  int example(int a, String b, Widget w) {
    return a;
  }

  int other(int x) {
    return x;
  }
}
`;

const CSHARP_PROBE = `
class Widget {}

class Probe {
  int Example(int a, string b, Widget w) {
    return a;
  }

  int Other(int x) {
    return x;
  }
}
`;

const GO_PROBE = `
package main

type Shape struct {
	Name string
}

func Example(a int, b int, c Shape) int {
	return a
}
`;

const JS_PROBE = `
function example(a, b, w) {
  return a;
}
`;

const RUBY_PROBE = `
def example(a, b, w)
  a
end
`;

const PYTHON_PROBE = `
def example(a, b, w):
    return a
`;

/** `count` parámetros `p0: type, p1: type, …` — todos con anotación explícita. */
function tsFunction(name: string, count: number, type: string): string {
  const params = Array.from({ length: count }, (_, i) => `p${i}: ${type}`).join(", ");
  return `function ${name}(${params}) {\n  return 0;\n}\n`;
}

function javaMethod(name: string, count: number, type: string): string {
  const params = Array.from({ length: count }, (_, i) => `${type} p${i}`).join(", ");
  return `class Probe {\n  int ${name}(${params}) {\n    return 0;\n  }\n}\n`;
}

function csharpMethod(name: string, count: number, type: string): string {
  const params = Array.from({ length: count }, (_, i) => `${type} p${i}`).join(", ");
  return `class Probe {\n  int ${name}(${params}) {\n    return 0;\n  }\n}\n`;
}

/** Repite el tipo EXPLÍCITAMENTE en cada parámetro (`a int, b int, …`), no la forma agrupada `a, b int` — que en Go colapsa en un solo nodo `parameter_declaration`, ver el reporte final. */
function goFunction(name: string, count: number, type: string): string {
  const params = Array.from({ length: count }, (_, i) => `p${i} ${type}`).join(", ");
  return `package main\n\nfunc ${name}(${params}) int {\n\treturn 0\n}\n`;
}

function jsFunction(name: string, count: number): string {
  const params = Array.from({ length: count }, (_, i) => `p${i}`).join(", ");
  return `function ${name}(${params}) {\n  return p0;\n}\n`;
}

function rubyMethod(name: string, count: number): string {
  const params = Array.from({ length: count }, (_, i) => `p${i}`).join(", ");
  return `def ${name}(${params})\n  p0\nend\n`;
}

function pythonFunction(name: string, count: number): string {
  const params = Array.from({ length: count }, (_, i) => `p${i}`).join(", ");
  return `def ${name}(${params}):\n    return p0\n`;
}

describe("primitive-obsession", () => {
  it("typescript: N parámetros `number` en una firma (N = umbral resuelto) es un hallazgo", async () => {
    const n = testContext(detector, "typescript").threshold("sameTypeCount").value;
    const source = tsFunction("build", n, "number");
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-typescript.wasm", probe: TS_PROBE, source, language: "typescript" });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(n);
    expect(findings[0]!.locations[0]!.symbol).toBe("build");
    expect(findings[0]!.locations[0]!.role).toContain("number");
  });

  it("typescript control negativo: un parámetro number y uno string junto a un tipo propio (Widget) no dispara — mezcla de tipos y tipo propio no cuentan", async () => {
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-typescript.wasm",
      probe: TS_PROBE,
      source: TS_PROBE,
      language: "typescript",
    });
    expect(findings).toHaveLength(0);
  });

  it("typescript: borde del umbral — justo debajo no dispara, justo en el umbral sí", async () => {
    const n = testContext(detector, "typescript").threshold("sameTypeCount").value;
    const below = tsFunction("build", n - 1, "number");
    const atThreshold = tsFunction("build", n, "number");
    const belowFindings = await runIntraFile(detector, { wasm: "tree-sitter-typescript.wasm", probe: TS_PROBE, source: below, language: "typescript" });
    const atFindings = await runIntraFile(detector, { wasm: "tree-sitter-typescript.wasm", probe: TS_PROBE, source: atThreshold, language: "typescript" });
    expect(belowFindings).toHaveLength(0);
    expect(atFindings).toHaveLength(1);
  });

  it("typescript: dos tipos primitivos distintos, cada uno bajo el umbral, no se combinan entre sí (agrupamiento independiente por tipo)", async () => {
    const n = testContext(detector, "typescript").threshold("sameTypeCount").value;
    const half = Math.max(1, n - 1);
    const params = [
      ...Array.from({ length: half }, (_, i) => `n${i}: number`),
      ...Array.from({ length: half }, (_, i) => `s${i}: string`),
    ].join(", ");
    const source = `function build(${params}) {\n  return 0;\n}\n`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-typescript.wasm", probe: TS_PROBE, source, language: "typescript" });
    expect(findings).toHaveLength(0);
  });

  it("java: parámetros `int` repetidos por encima del umbral es un hallazgo — segundo lenguaje real que emite (junto a typescript)", async () => {
    const n = testContext(detector, "java").threshold("sameTypeCount").value;
    const source = javaMethod("build", n, "int");
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, source, language: "java" });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(n);
  });

  it("java control negativo: un int, un String y un Widget en la misma firma no dispara", async () => {
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, source: JAVA_PROBE, language: "java" });
    expect(findings).toHaveLength(0);
  });

  it("java: límite declarado — `String` repetido no es detectable (es una clase de java.lang, no una palabra clave: su nodo es `type_identifier`, igual que un tipo propio)", async () => {
    const n = testContext(detector, "java").threshold("sameTypeCount").value;
    const source = javaMethod("build", n, "String");
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, source, language: "java" });
    expect(findings).toHaveLength(0);
  });

  it(
    "ARREGLO (Ola O, medido real — guava Doubles.constrainToRange(double value, double min, double max)): " +
      "una clase NOMBRADA por el propio primitivo repetido no dispara — " +
      "el primitivo ES el dominio declarado de esa clase, no un dato ajeno sin envolver",
    async () => {
      const source = `
class Doubles {
  double constrainToRange(double a, double b, double c) {
    return a;
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, source, language: "java" });
      expect(findings).toHaveLength(0);
    },
  );

  it(
    "ARREGLO (Ola O, medido real — guava Shorts.rotate(short[] array, int distance, int fromIndex, int toIndex)): " +
      "dispara por \"int\" (distance/fromIndex/toIndex), NO por \"short\" -- el nombre de la clase (`Shorts`) tiene " +
      "que compararse contra TODOS los primitivos que este detector reconoce, no sólo contra el que dispara ESTE " +
      "hallazgo puntual, porque una utilidad de bajo nivel sobre un primitivo usa naturalmente otros primitivos " +
      "(índices, conteos) en sus propios métodos",
    async () => {
      const source = `
class Shorts {
  void rotate(short array, int distance, int fromIndex, int toIndex) {
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, source, language: "java" });
      expect(findings).toHaveLength(0);
    },
  );

  it(
    "ARREGLO (Ola O, medido real — guava LongMath.powMod): el método vive en `MillerRabinTester`, un enum PRIVADO " +
      "anidado dentro de LongMath.java -- el nombre de clase INMEDIATO (\"Helper\" acá, para no depender del " +
      "anidamiento) no menciona el primitivo, pero el NOMBRE DE ARCHIVO sí (`LongMath.java`), y eso alcanza",
    async () => {
      const source = `
class Helper {
  long powMod(long a, long p, long m) {
    return a;
  }
}
`;
      const findings = await runIntraFile(detector, {
        wasm: "tree-sitter-java.wasm",
        probe: JAVA_PROBE,
        source,
        language: "java",
        file: "LongMath.java",
      });
      expect(findings).toHaveLength(0);
    },
  );

  it("control negativo: la MISMA clase \"Helper\" con el nombre de archivo por defecto (que no menciona ningún primitivo) SÍ dispara -- el arreglo depende de verdad del nombre de archivo, no de una casualidad", async () => {
    const source = `
class Helper {
  long powMod(long a, long p, long m) {
    return a;
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, source, language: "java" });
    expect(findings).toHaveLength(1);
  });

  it(
    "control positivo (Ola O, medido real — guava RelationshipTester.assertUnrelated): una clase que NO está " +
      "nombrada por el primitivo sigue disparando -- el arreglo no apaga el caso real (4 int intercambiables " +
      "donde invertir dos cambia el significado en silencio)",
    async () => {
      const source = `
class RelationshipTester {
  void assertUnrelated(int groupNumber, int itemNumber, int unrelatedGroupNumber, int unrelatedItemNumber) {
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, source, language: "java" });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.trigger[0]!.value).toBe(4);
    },
  );

  it("control negativo (frontera de palabra): una clase cuyo nombre EMPIEZA con las mismas letras que el primitivo pero NO es un compuesto real (`IntersectionUtils` para `int`) sigue disparando -- no es 'Int' + mayúscula ni 'Int' + 's'", async () => {
    const n = testContext(detector, "java").threshold("sameTypeCount").value;
    const params = Array.from({ length: n }, (_, i) => `int p${i}`).join(", ");
    const source = `class IntersectionUtils {\n  void build(${params}) {\n  }\n}\n`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, source, language: "java" });
    expect(findings).toHaveLength(1);
  });

  it("csharp: parámetros `string` repetidos por encima del umbral es un hallazgo — tercer lenguaje real que emite (junto a typescript/java), cierra el criterio de salida (≥3 lenguajes) — y contrasta con Java: en C# `string` sí tiene nodo de tipo primitivo propio", async () => {
    const n = testContext(detector, "csharp").threshold("sameTypeCount").value;
    const source = csharpMethod("Build", n, "string");
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-c_sharp.wasm", probe: CSHARP_PROBE, source, language: "csharp" });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(n);
  });

  it("csharp control negativo: un int, un string y un Widget en la misma firma no dispara", async () => {
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-c_sharp.wasm", probe: CSHARP_PROBE, source: CSHARP_PROBE, language: "csharp" });
    expect(findings).toHaveLength(0);
  });

  it("go: límite declarado — parámetros `int` repetidos no son detectables (Go no tiene nodo de tipo primitivo propio: `int`, `string` y un `struct` propio resuelven, los tres, como el mismo `type_identifier`)", async () => {
    const n = testContext(detector, "go").threshold("sameTypeCount").value;
    const source = goFunction("Build", n, "int");
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-go.wasm",
      probe: GO_PROBE,
      source,
      language: "go",
      extraClone: ["type_declaration"],
      capabilities: ["tipos-explicitos"],
    });
    expect(findings).toHaveLength(0);
  });

  it("no aplicable sin tipos-explicitos: javascript no tiene anotaciones de tipo — una función con parámetros nombrados como si fueran primitivos repetidos ('firstName, lastName, email, phone') sigue dando 0 hallazgos aunque se fuerce la corrida, porque no hay NINGÚN nodo de tipo que clasificar", async () => {
    const source = jsFunction("createUser", 4);
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, source, language: "javascript" });
    expect(findings).toHaveLength(0);
  });

  it("no aplicable sin tipos-explicitos: ruby no tiene anotaciones de tipo — mismo caso forzado, 0 hallazgos", async () => {
    const source = rubyMethod("create_user", 4);
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, source, language: "ruby" });
    expect(findings).toHaveLength(0);
  });

  it("no aplicable sin tipos-explicitos: python sin anotaciones de tipo — mismo caso forzado, 0 hallazgos", async () => {
    const source = pythonFunction("create_user", 4);
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-python.wasm", probe: PYTHON_PROBE, source, language: "python" });
    expect(findings).toHaveLength(0);
  });

  describe("JUICIO DE PRECISIÓN: un primitivo envuelto en un contenedor (arreglo/genérico/mapa) no cuenta (falso positivo encontrado y arreglado en `src/`)", () => {
    it("typescript: parámetros `number[]` repetidos NO disparan — la colección ya resolvió el olor, no es 'primitivo suelto'", async () => {
      const n = testContext(detector, "typescript").threshold("sameTypeCount").value;
      const source = tsFunction("build", n, "number[]");
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-typescript.wasm", probe: TS_PROBE, source, language: "typescript" });
      expect(findings).toHaveLength(0);
    });

    it("typescript: parámetros `Array<number>` repetidos tampoco disparan — mismo contenedor, otra sintaxis", async () => {
      const n = testContext(detector, "typescript").threshold("sameTypeCount").value;
      const source = tsFunction("build", n, "Array<number>");
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-typescript.wasm", probe: TS_PROBE, source, language: "typescript" });
      expect(findings).toHaveLength(0);
    });

    it('typescript: el caso real encontrado en `src/` — un `string` suelto, un `Array<string>` y un `ReadonlyMap<string, X>` NO se agrupan como "3 string": sólo hay 1 primitivo suelto de verdad', async () => {
      const source = `
class Widget {}

function example(a: string, items: Array<string>, m: ReadonlyMap<string, Widget>): string {
  return a;
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-typescript.wasm", probe: TS_PROBE, source, language: "typescript" });
      expect(findings).toHaveLength(0);
    });

    it("java: parámetros `int[]` repetidos no disparan (mismo criterio que TypeScript)", async () => {
      const n = testContext(detector, "java").threshold("sameTypeCount").value;
      const source = javaMethod("build", n, "int[]");
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, source, language: "java" });
      expect(findings).toHaveLength(0);
    });

    it("csharp: parámetros `string[]` repetidos no disparan (mismo criterio)", async () => {
      const n = testContext(detector, "csharp").threshold("sameTypeCount").value;
      const source = csharpMethod("Build", n, "string[]");
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-c_sharp.wasm", probe: CSHARP_PROBE, source, language: "csharp" });
      expect(findings).toHaveLength(0);
    });

    it("typescript control: primitivos SUELTOS (sin contenedor) siguen disparando igual que antes — el arreglo no apaga el caso real", async () => {
      const n = testContext(detector, "typescript").threshold("sameTypeCount").value;
      const source = tsFunction("build", n, "number");
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-typescript.wasm", probe: TS_PROBE, source, language: "typescript" });
      expect(findings).toHaveLength(1);
    });
  });
});
