import { describe, expect, it } from "vitest";

import { detector } from "./unreachable-code.js";
import { runIntraFunction, testContext } from "../testing.js";
import { LANGUAGE_DECLS } from "../../code-analyzer.js";

const TS_PROBE = LANGUAGE_DECLS.find((d) => d.id === "typescript")!.probeSource;

/*
 * Cada sonda ejercita sólo lo mínimo que `deriveNodeSets` necesita para que
 * `fileUnitFrom` (el arnés) reconozca "esto es una función" en la fuente
 * real: un `if` con un `return` dentro alcanza. El detector mismo NO
 * consulta `fn.sets` -- clasifica sentencias de salto directamente por el
 * tipo de nodo crudo (`JUMP_WORD`), así que la sonda no necesita ejercitar
 * `for`/`try`/`switch` para que esas formas "existan": esta es la única
 * excepción real a la regla general de sondas de `detect/testing.ts`,
 * documentada acá porque el motivo (el detector no pasa por `sets`) es
 * distinto del resto de los detectores de este registro.
 */
const JS_PROBE = `
function f(x) {
  if (x) {
    return 1;
  }
}
`;

const PYTHON_PROBE = `
def f(x):
    if x:
        return 1
`;

const RUBY_PROBE = `
def f(x)
  if x
    return 1
  end
end
`;

const JAVA_PROBE = `
public class Shape {
  public int f(int x) {
    if (x > 0) {
      return 1;
    }
    return 0;
  }
}
`;

const GO_PROBE = `
package main

func f(x int) int {
	if x > 0 {
		return 1
	}
	return 0
}
`;

const CSHARP_PROBE = `
public class Shape {
  public int F(int x) {
    if (x > 0) {
      return 1;
    }
    return 0;
  }
}
`;

describe("unreachable-code", () => {
  /* ── JavaScript ─────────────────────────────────────────────────────── */

  it("javascript: return seguido de más código en el mismo bloque es un hallazgo", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: `
function risky() {
  return 1;
  doStuff();
}
`,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.role).toBe("código inalcanzable");
    expect(findings[0]!.locations[0]!.symbol).toBe("risky");
  });

  it("javascript control negativo: return como última sentencia del bloque no dispara nada", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: `
function risky() {
  if (true) {
    doStuff();
  }
  return 1;
}
`,
    });
    expect(findings).toHaveLength(0);
  });

  it("javascript: break seguido de código dentro de un loop es un hallazgo", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: `
function risky() {
  for (;;) {
    break;
    doStuff();
  }
}
`,
    });
    expect(findings).toHaveLength(1);
  });

  it("javascript: continue seguido de código dentro de un loop es un hallazgo", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: `
function risky() {
  for (;;) {
    continue;
    doStuff();
  }
}
`,
    });
    expect(findings).toHaveLength(1);
  });

  it("javascript: throw seguido de código es un hallazgo", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: `
function risky() {
  throw new Error("x");
  doStuff();
}
`,
    });
    expect(findings).toHaveLength(1);
  });

  it("javascript: if/else de una sola sentencia sin llaves, con return en ambas ramas, NO dispara -- son ramas alternativas, no una secuencia (encontrado investigando un hallazgo del corpus externo en newtonsoft-json)", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: `
function risky(a, b) {
  if (a > b) return 1;
  else return -1;
}
`,
    });
    expect(findings).toHaveLength(0);
  });

  it("javascript: guard clause de una línea sin llaves NO dispara -- doStuff() es hermano del if, no del return, y sí se ejecuta cuando x es falso", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: `
function risky(x) {
  if (x) return 1;
  doStuff();
}
`,
    });
    expect(findings).toHaveLength(0);
  });

  it("javascript: switch con cada case terminado en su propio return NO dispara -- cada case es un bloque separado", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: `
function risky(x) {
  switch (x) {
    case 1:
      return "uno";
    case 2:
      return "dos";
    default:
      return "otro";
  }
}
`,
    });
    expect(findings).toHaveLength(0);
  });

  it("javascript: finally que corre después de un throw en el try NO dispara -- son bloques distintos", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: `
function risky() {
  try {
    throw new Error("x");
  } finally {
    cleanup();
  }
}
`,
    });
    expect(findings).toHaveLength(0);
  });

  it("javascript: return seguido SÓLO de un comentario NO dispara -- no hay código real inalcanzable que reportar", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: `
function risky() {
  return 1;
  // nota explicando por qué se retorna acá
}
`,
    });
    expect(findings).toHaveLength(0);
  });

  it("javascript: 2 sentencias inalcanzables se cuentan en el trigger y el título las menciona", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: `
function risky() {
  return 1;
  doStuff();
  moreStuff();
}
`,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(2);
    expect(findings[0]!.title).toContain("2 sentencias inalcanzables");
  });

  /* ── Umbral: presencia (1 aparición), pedido a testContext, no escrito a mano ── */

  it("el umbral de presencia resuelve a 1 (SonarSource S1763) y una sola sentencia inalcanzable ya alcanza para disparar", async () => {
    const threshold = testContext(detector, "javascript").threshold("presence").value;
    expect(threshold).toBe(1);

    const exactlyAtThreshold = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: `
function risky() {
  return 1;
  doStuff();
}
`,
    });
    expect(exactlyAtThreshold[0]!.trigger[0]!.value).toBeGreaterThanOrEqual(threshold);
    expect(exactlyAtThreshold).toHaveLength(1);

    const belowThreshold = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: `
function risky() {
  return 1;
}
`,
    });
    expect(belowThreshold).toHaveLength(0);
  });

  /* ── Python ─────────────────────────────────────────────────────────── */

  it("python: return seguido de más código es un hallazgo", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-python.wasm",
      probe: PYTHON_PROBE,
      language: "python",
      source: `
def risky():
    return 1
    do_stuff()
`,
    });
    expect(findings).toHaveLength(1);
  });

  it("python control negativo: return como última sentencia no dispara nada", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-python.wasm",
      probe: PYTHON_PROBE,
      language: "python",
      source: `
def risky():
    if True:
        do_stuff()
    return 1
`,
    });
    expect(findings).toHaveLength(0);
  });

  it("python: raise seguido de código es un hallazgo -- a diferencia de Ruby, `raise_statement` es un tipo de nodo dedicado", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-python.wasm",
      probe: PYTHON_PROBE,
      language: "python",
      source: `
def risky():
    raise Exception("x")
    do_stuff()
`,
    });
    expect(findings).toHaveLength(1);
  });

  /* ── Ruby ───────────────────────────────────────────────────────────── */

  it("ruby: return seguido de más código es un hallazgo", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      language: "ruby",
      source: `
def risky
  return 1
  do_stuff
end
`,
    });
    expect(findings).toHaveLength(1);
  });

  it("ruby control negativo: return como última sentencia no dispara nada", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      language: "ruby",
      source: `
def risky
  if true
    do_stuff
  end
  return 1
end
`,
    });
    expect(findings).toHaveLength(0);
  });

  it("ruby: next (su 'continue') seguido de código dentro de un loop es un hallazgo", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      language: "ruby",
      source: `
def risky
  while true
    next
    do_stuff
  end
end
`,
    });
    expect(findings).toHaveLength(1);
  });

  it("ruby: modificador de sentencia (`next if cond`) NO dispara -- la condición es OTRO campo del mismo nodo compuesto, no código posterior (encontrado corriendo el corpus externo contra jekyll)", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      language: "ruby",
      source: `
def risky(files)
  files.each do |f|
    next if f.nil?
    do_stuff(f)
  end
end
`,
    });
    expect(findings).toHaveLength(0);
  });

  it("ruby: modificador de sentencia con break/return/until/unless -- ninguno dispara", async () => {
    const source = `
def risky(x)
  while true
    break if x
    return unless x
    do_stuff until x
  end
end
`;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      language: "ruby",
      source,
    });
    expect(findings).toHaveLength(0);
  });

  it("ruby: un `next if cond` seguido de una sentencia REAL en el mismo bloque (no el campo condición) sigue disparando", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      language: "ruby",
      source: `
def risky(files)
  files.each do |f|
    next if f.nil?
    x = 1
    do_stuff(x)
    another_call(x)
  end
  return 1
  do_stuff
end
`,
    });
    // El `next if f.nil?` no dispara (modificador); el `return 1` al final sí,
    // porque `do_stuff` es una sentencia real que le sigue en el mismo bloque.
    expect(findings).toHaveLength(1);
    expect(findings[0]!.title).toContain("return");
  });

  it("ruby: límite declarado -- raise es una llamada de método común (nodo `call`), no un tipo de nodo dedicado, así que código después de un raise NO se detecta", async () => {
    // Ver el docstring de unreachable-code.ts: confirmado por sonda directa
    // que Ruby no distingue `raise` de cualquier otra llamada a método en su
    // gramática -- este test documenta la ausencia con un caso que SÍ tiene
    // código real después, para no confundirla con un simple "no hay nada
    // que detectar".
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      language: "ruby",
      source: `
def risky
  raise "x"
  do_stuff
end
`,
    });
    expect(findings).toHaveLength(0);
  });

  /* ── Java ───────────────────────────────────────────────────────────── */

  it("java: if/else de una sola sentencia sin llaves, con return en ambas ramas, NO dispara -- misma trampa estructural que en C#/JS", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-java.wasm",
      probe: JAVA_PROBE,
      language: "java",
      source: `
public class Shape {
  public int risky(int a, int b) {
    if (a > b) return 1;
    else return -1;
  }
}
`,
    });
    expect(findings).toHaveLength(0);
  });

  it("java: return seguido de más código dentro de un método es un hallazgo", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-java.wasm",
      probe: JAVA_PROBE,
      language: "java",
      source: `
public class Shape {
  public int risky() {
    return 1;
    int y = doStuff();
  }
}
`,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("risky");
  });

  it("java: throw seguido de código es un hallazgo", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-java.wasm",
      probe: JAVA_PROBE,
      language: "java",
      source: `
public class Shape {
  public void risky() {
    throw new RuntimeException("x");
    doStuff();
  }
}
`,
    });
    expect(findings).toHaveLength(1);
  });

  it("java control negativo: return como última sentencia del método no dispara nada", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-java.wasm",
      probe: JAVA_PROBE,
      language: "java",
      source: `
public class Shape {
  public int risky() {
    if (true) {
      doStuff();
    }
    return 1;
  }
}
`,
    });
    expect(findings).toHaveLength(0);
  });

  /* ── Go ─────────────────────────────────────────────────────────────── */

  it("go: return seguido de más código es un hallazgo", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-go.wasm",
      probe: GO_PROBE,
      language: "go",
      source: `
package main

func risky() int {
	return 1
	doStuff()
}
`,
    });
    expect(findings).toHaveLength(1);
  });

  it("go: break seguido de código dentro de un loop es un hallazgo", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-go.wasm",
      probe: GO_PROBE,
      language: "go",
      source: `
package main

func risky() {
	for {
		break
		doStuff()
	}
}
`,
    });
    expect(findings).toHaveLength(1);
  });

  it("go control negativo: return como última sentencia no dispara nada", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-go.wasm",
      probe: GO_PROBE,
      language: "go",
      source: `
package main

func risky() int {
	if true {
		doStuff()
	}
	return 1
}
`,
    });
    expect(findings).toHaveLength(0);
  });

  it("go: límite declarado -- panic(...) es una llamada de función común, no un tipo de nodo dedicado, así que código después de un panic NO se detecta", async () => {
    // Mismo motivo que el gap de Ruby: confirmado por sonda directa que Go
    // no tiene un nodo de gramática propio para "panic", a diferencia de
    // JS/Java/C# con `throw_statement`.
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-go.wasm",
      probe: GO_PROBE,
      language: "go",
      source: `
package main

func risky() {
	panic("x")
	doStuff()
}
`,
    });
    expect(findings).toHaveLength(0);
  });

  /* ── C# ─────────────────────────────────────────────────────────────── */

  it("csharp: if/else de una sola sentencia sin llaves, con return en ambas ramas, NO dispara -- el hallazgo real del corpus externo que motivó este fix (newtonsoft-json, Issue3080.cs: `if (a > b) return 1; else return -1;`)", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-c_sharp.wasm",
      probe: CSHARP_PROBE,
      language: "csharp",
      source: `
public class Shape {
  public int Risky(int a, int b) {
    if (a > b) return 1;
    else return -1;
  }
}
`,
    });
    expect(findings).toHaveLength(0);
  });

  it("csharp: throw seguido de más código es un hallazgo", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-c_sharp.wasm",
      probe: CSHARP_PROBE,
      language: "csharp",
      source: `
public class Shape {
  public void Risky() {
    throw new System.Exception("x");
    DoStuff();
  }
}
`,
    });
    expect(findings).toHaveLength(1);
  });

  it("csharp: return dentro de una rama #if seguido de la rama #else NO dispara -- son ramas de compilación mutuamente excluyentes, no código secuencial (encontrado corriendo el corpus externo contra newtonsoft-json)", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-c_sharp.wasm",
      probe: CSHARP_PROBE,
      language: "csharp",
      source: `
public class Shape {
  public static bool Risky() {
#if X
    return true;
#else
    if (Y) {
      return true;
    }
    return false;
#endif
  }
}
`,
    });
    expect(findings).toHaveLength(0);
  });

  it("csharp: return seguido de código real DENTRO de la MISMA rama #if (antes de cualquier #elif/#else/#endif) sigue disparando", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-c_sharp.wasm",
      probe: CSHARP_PROBE,
      language: "csharp",
      source: `
public class Shape {
  public static bool Risky() {
#if X
    return true;
    DoStuff();
#endif
    return false;
  }
}
`,
    });
    expect(findings).toHaveLength(1);
  });

  it("csharp: return seguido SÓLO de un #pragma de cierre NO dispara -- una directiva de diagnóstico no es código ejecutable (encontrado corriendo el corpus externo contra newtonsoft-json)", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-c_sharp.wasm",
      probe: CSHARP_PROBE,
      language: "csharp",
      source: `
public class Shape {
  public static int Risky() {
#pragma warning disable CS8653
    return 1;
#pragma warning restore CS8653
  }
}
`,
    });
    expect(findings).toHaveLength(0);
  });

  it("csharp: return seguido de código real envuelto en #region/#endregion SIGUE disparando -- #region no gatea ningún build, es puramente organizativo", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-c_sharp.wasm",
      probe: CSHARP_PROBE,
      language: "csharp",
      source: `
public class Shape {
  public static int Risky() {
    return 1;
#region cleanup
    DoStuff();
#endregion
  }
}
`,
    });
    expect(findings).toHaveLength(1);
  });

  it("csharp control negativo: throw como última sentencia del método no dispara nada", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-c_sharp.wasm",
      probe: CSHARP_PROBE,
      language: "csharp",
      source: `
public class Shape {
  public void Risky(bool ok) {
    if (ok) {
      DoStuff();
      return;
    }
    throw new System.Exception("x");
  }
}
`,
    });
    expect(findings).toHaveLength(0);
  });

  it("csharp: ARREGLADO -- una función local declarada después de un return YA NO cuenta como inalcanzable, porque C# la hace disponible en todo el método (hoisting) -- dos falsos positivos confirmados a mano en newtonsoft-json, JObject.Async.cs#WriteToAsync y JsonWriter.Async.cs#InternalWriteEndAsync", async () => {
    // Ver "LÍMITES DECLARADOS POR LENGUAJE" en el docstring de
    // unreachable-code.ts: este test documentaba el falso positivo antes del
    // arreglo (`NON_EXECUTABLE_TYPE` ahora excluye `local_function_statement`).
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-c_sharp.wasm",
      probe: CSHARP_PROBE,
      language: "csharp",
      source: `
public class Shape {
  public System.Threading.Tasks.Task Risky() {
    return Helper();

    System.Threading.Tasks.Task Helper() {
      return null;
    }
  }
}
`,
    });
    expect(findings).toHaveLength(0);
  });

  it("csharp: control negativo -- una función local declarada después de un return, PERO con código real ADEMÁS de ella, sigue disparando por ese código real", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-c_sharp.wasm",
      probe: CSHARP_PROBE,
      language: "csharp",
      source: `
public class Shape {
  public System.Threading.Tasks.Task Risky() {
    return Helper();

    DoStuff();

    System.Threading.Tasks.Task Helper() {
      return null;
    }
  }
}
`,
    });
    expect(findings).toHaveLength(1);
  });

  it("javascript: ARREGLADO -- una function declaration nombrada después de un return YA NO cuenta como inalcanzable, porque JS la eleva (hoisting) a todo el scope contenedor", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: `
function risky() {
  return helper();

  function helper() {
    return null;
  }
}
`,
    });
    expect(findings).toHaveLength(0);
  });

  it("typescript: ARREGLADO -- una declaración de tipo (interface) después de un return YA NO cuenta como inalcanzable: TS la borra por completo al compilar, ni siquiera hace falta hoisting (encontrado en nest, fastify-middie.ts#middie: `return { use, run }; function use(){} function run(){} interface HolderInstance {...} function Holder(){}`)", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-typescript.wasm",
      probe: TS_PROBE,
      language: "typescript",
      source: `
function middie() {
  return { use, run };

  function use() {}
  function run() {}

  interface HolderInstance {
    req: unknown;
  }

  function Holder() {}
}
`,
    });
    expect(findings).toHaveLength(0);
  });

  it("typescript: ARREGLADO -- un type alias después de un return YA NO cuenta como inalcanzable, misma razón que interface (borrado por completo al compilar)", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-typescript.wasm",
      probe: TS_PROBE,
      language: "typescript",
      source: `
function outer() {
  return 1;

  type Foo = number;
}
`,
    });
    expect(findings).toHaveLength(0);
  });

  it("typescript control negativo -- una interface Y código real después de un return: sigue disparando SÓLO por el código real, y el rango reportado no incluye la interface ni las funciones izadas", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-typescript.wasm",
      probe: TS_PROBE,
      language: "typescript",
      source: `
function outer() {
  return 1;

  function helper() {}

  interface Foo {
    x: number;
  }

  doStuff();
}
`,
    });
    expect(findings).toHaveLength(1);
    // ARREGLO de rango (ver docstring "RANGO REPORTADO"): el hallazgo empieza en
    // \`doStuff()\`, la única violación real -- NO en \`function helper() {}\`, que
    // \`NON_EXECUTABLE_TYPE\` ya excluye de la cuenta pero que antes del arreglo
    // igual quedaba adentro del rango reportado por ser el primer elemento de \`after\`.
    expect(findings[0]!.locations[0]!.startLine).toBe(findings[0]!.locations[0]!.endLine);
  });

  it("python control negativo -- un \`def\` anidado después de un return SIGUE contando como inalcanzable: Python no eleva declaraciones, el \`def\` se ejecuta en su punto textual", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-python.wasm",
      probe: PYTHON_PROBE,
      language: "python",
      source: `
def risky():
    return helper()

    def helper():
        return None
`,
    });
    expect(findings).toHaveLength(1);
  });

  /* ── Ola AW · AW6: el artefacto de ASI, que ANTES era un límite declarado ── */

  it("javascript: `return` seguido de un comentario de bloque antes de su propia expresión YA NO dispara nada -- era el falso positivo medido en preact (debug.js:53, hooks.js:77) y lo retira la regla de salto-sin-argumento + comentario en el medio", async () => {
    // Este test AFIRMABA `toHaveLength(1)` y documentaba el falso positivo como
    // un límite del parser: `tree-sitter-javascript` parte
    // `return /** @type {object} */ (obj);` en `return;` + una expresión suelta,
    // y el detector reportaba la expresión DEVUELTA como inalcanzable. La Ola AW
    // (AW6) lo arregló, así que la aserción pasa a ser 0 -- que es una
    // afirmación MÁS fuerte, no más floja: este código no tiene nada
    // inalcanzable y ahora el detector no dice que sí.
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: `
function risky(obj) {
  return /** @type {object} */ (obj);
}
`,
    });
    expect(findings).toHaveLength(0);
  });

  it("javascript: la misma forma con el comentario en la línea de arriba y la expresión en la SIGUIENTE tampoco dispara -- es el caso de preact/compat/src/hooks.js:77, que la regla de \"misma línea\" dejaba pasar", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: `
function risky(ref) {
  return /** @type {T} */ (
    function () {
      return ref.current;
    }
  );
}
`,
    });
    expect(findings).toHaveLength(0);
  });

  it("javascript: CONTROL NEGATIVO del arreglo de ASI -- un salto CON argumento seguido de código real SIGUE contando, aunque haya un comentario en el medio", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: `
function risky(x) {
  throw new Error("boom");
  // un comentario cualquiera
  console.log(x);
}
`,
    });
    expect(findings).toHaveLength(1);
  });

  /* ── Ola AW · AW6: las cláusulas de manejo de excepciones ── */

  it("ruby: el cuerpo de un `rescue` que sigue a un `return` NO es inalcanzable -- corre cuando el cuerpo levanta (redmine, application_controller.rb#parse_qvalues y destroy_project_job.rb#delete_project)", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      language: "ruby",
      source: `
def delete_project
  return !!@project.destroy
rescue
  false
end
`,
    });
    expect(findings).toHaveLength(0);
  });

  it("ruby: el cuerpo de un `ensure` que sigue a un `return` NO es inalcanzable -- corre SIEMPRE, incluso después del return (redmine, webhook.rb#call)", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      language: "ruby",
      source: `
def call(http, request)
  begin
    return http.request(request)
  ensure
    http&.finish
  end
end
`,
    });
    expect(findings).toHaveLength(0);
  });

  it("ruby: CONTROL NEGATIVO de las cláusulas de excepción -- una sentencia NORMAL después de un `return` en el mismo bloque SIGUE contando", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      language: "ruby",
      source: `
def risky(x)
  return x
  puts x
end
`,
    });
    expect(findings).toHaveLength(1);
  });
});
