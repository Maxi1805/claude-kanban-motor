/**
 * `Handle Empty Catch` — OLA AS, frente AS5.
 *
 * Árboles REALES (`detect/testing.ts`: el mismo `web-tree-sitter` y las mismas
 * gramáticas `.wasm` que producción), nunca simulados: todo lo que esta
 * hipótesis decide se decide sobre la FORMA del árbol (dónde está el bloque
 * protegido, si termina en un salto, si hay un manejador hermano con
 * contenido), y con un árbol de mentira no se probaría nada. Mismo criterio
 * que `extract-method.test.ts` declara para su propio arnés.
 */
import { describe, expect, it } from "vitest";

import type { Capability } from "../detect/capabilities.js";
import { pisoDeclarado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import { fileUnitFrom, nodeSetsFor, parseRoot } from "../detect/testing.js";
import type { Finding, FileUnit } from "../detect/types.js";
import { EMPTY_NEIGHBORHOOD } from "../graph/neighborhood.js";
import { hypothesis as handleEmptyCatch } from "./handle-empty-catch.js";
import type { HypothesisContext } from "./types.js";

const JS_WASM = "tree-sitter-javascript.wasm";
const JAVA_WASM = "tree-sitter-java.wasm";
const RUBY_WASM = "tree-sitter-ruby.wasm";
const CSHARP_WASM = "tree-sitter-c_sharp.wasm";

/** Sondas con try/catch REAL: sin una construcción de excepción ejercitada,
 *  `deriveNodeSets` deja `exceptionNodes` vacío y el test no probaría nada. */
const JS_PROBE = `
function f(x) {
  if (x > 0) { for (const y of []) { f(y); } } else { f(x); }
  try { f(x); } catch (e) { f(x); }
}
`;
const JAVA_PROBE = `
class P {
  void m(int x) {
    if (x > 0) { for (int i = 0; i < x; i++) { m(i); } } else { m(x); }
    try { m(x); } catch (Exception e) { m(x); }
  }
}
`;
const RUBY_PROBE = `
class P
  def m(x)
    if x > 0
      [].each { |y| m(y) }
    else
      m(x)
    end
    begin
      m(x)
    rescue StandardError => e
      m(x)
    end
  end
end
`;
const CSHARP_PROBE = `
class P {
  void M(int x) {
    if (x > 0) { for (int i = 0; i < x; i++) { M(i); } } else { M(x); }
    try { M(x); } catch (System.Exception e) { M(x); }
  }
}
`;

async function unitFrom(wasm: string, probe: string, source: string, language: string, file: string): Promise<FileUnit> {
  const [sets, root] = await Promise.all([nodeSetsFor(wasm, probe), parseRoot(wasm, source)]);
  return fileUnitFrom(root, sets, language, { file });
}

function fakeThreshold(): Threshold {
  return resolveThreshold(pisoDeclarado(1, { rationale: "test" }), {
    language: "javascript",
    sampleSize: () => 0,
    corpusP95: () => null,
  });
}

/** El `Finding` con la MISMA forma que `detect/intra-function/empty-catch.ts` escribe. */
function emptyCatchFinding(file: string, startLine: number, endLine: number, symbol: string, language: string): Finding {
  return {
    id: "f-empty-catch-1",
    detectorId: "empty-catch",
    kind: "empty-catch",
    scope: "intra-function",
    language,
    title: `Excepción capturada y descartada en "${symbol}"`,
    detail: "d",
    trigger: [{ label: "manejadores vacíos", value: 1, threshold: fakeThreshold() }],
    locations: [{ file, startLine, endLine, symbol, role: "manejador de excepción vacío" }],
    severity: 55,
    advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
  };
}

function ctxFor(file: FileUnit | null, caps: Capability[] = ["excepciones"]): HypothesisContext {
  return {
    file,
    fileAt: (p: string) => (file && file.path === p ? file : null),
    repo: { repoName: "r", files: [], functions: [], clones: [], graph: null },
    capabilities: new Set<Capability>(caps),
    setsFor: () =>
      file?.sets ?? {
        functionNodes: new Set(),
        branchNodes: new Set(),
        chainNodes: new Set(),
        cloneNodes: new Set(),
        classNodes: new Set(),
        nestingNodes: new Set(),
        constructorNodes: new Set(),
        exceptionNodes: new Set(),
        switchContainerNodes: new Set(),
      },
    neighborhood: EMPTY_NEIGHBORHOOD,
    branches: () => null,
  };
}

function checkById(h: { checks: readonly { label: string; passed: boolean }[] }, fragment: string): boolean | undefined {
  return h.checks.find((c) => c.label.includes(fragment))?.passed;
}

describe("hypotheses/handle-empty-catch — la propuesta sale sólo con las tres condiciones", () => {
  it("JS: catch vacío sobre dos operaciones y el flujo sigue ⇒ propuesta `ausente`", async () => {
    const source = [
      "function readConfig(path) {",
      "  try {",
      "    const raw = load(path);",
      "    apply(raw);",
      "  } catch (e) {}",
      "  return true;",
      "}",
    ].join("\n");
    const file = await unitFrom(JS_WASM, JS_PROBE, source, "javascript", "a.js");
    const h = handleEmptyCatch.build(emptyCatchFinding("a.js", 5, 5, "readConfig", "javascript"), null, ctxFor(file));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    expect(h!.pattern).toBe("Handle Empty Catch");
    expect(checkById(h!, "no tiene ninguna sentencia adentro")).toBe(true);
    expect(checkById(h!, "bloque de código protegido")).toBe(true);
    expect(checkById(h!, "no corta el flujo en ninguna parte")).toBe(true);
  });

  it("REGRESIÓN OLA AS (medida en `excalidraw/packages/element/src/elementLink.ts:101` y `clipboard.ts:552`): el camino feliz sale con un `return` DENTRO de un `if`, así que lo de abajo es la rama de fallo ⇒ silencio", async () => {
    const source = [
      "function parseElementLinkFromURL(url) {",
      "  try {",
      "    const params = parse(url);",
      "    if (params.has(KEY)) {",
      "      return params.get(KEY);",
      "    }",
      "  } catch (e) {}",
      "  return null;",
      "}",
    ].join("\n");
    const file = await unitFrom(JS_WASM, JS_PROBE, source, "javascript", "a.js");
    const h = handleEmptyCatch.build(emptyCatchFinding("a.js", 7, 7, "parseElementLinkFromURL", "javascript"), null, ctxFor(file));
    expect(h, "el `return null` de abajo ES la rama de fallo: la falla se absorbe, no se traga").toBeNull();
  });

  it("REGRESIÓN OLA AS (medida en `lodash/perf/perf.js:47` y `excalidraw/packages/common/src/utils.ts:1173`): el nombre que el `try` escribe se LEE después sin preguntar por él ⇒ silencio", async () => {
    const source = [
      "function resolvePath(start) {",
      "  var result = start;",
      "  try {",
      "    result = realpath(result);",
      "  } catch (e) {}",
      "  return result;",
      "}",
    ].join("\n");
    const file = await unitFrom(JS_WASM, JS_PROBE, source, "javascript", "a.js");
    const h = handleEmptyCatch.build(emptyCatchFinding("a.js", 5, 5, "resolvePath", "javascript"), null, ctxFor(file));
    expect(h, "si `realpath` falla, `result` conserva el valor anterior: ESE es el manejo de la falla").toBeNull();
  });

  it("JS: el idioma de detección de capacidad (el bloque protegido TERMINA en `return`) ⇒ silencio", async () => {
    const source = [
      "function capability(x) {",
      "  try {",
      "    return probe(x);",
      "  } catch (e) {}",
      "  return null;",
      "}",
    ].join("\n");
    const file = await unitFrom(JS_WASM, JS_PROBE, source, "javascript", "a.js");
    expect(handleEmptyCatch.build(emptyCatchFinding("a.js", 4, 4, "capability", "javascript"), null, ctxFor(file))).toBeNull();
  });

  it("REGRESIÓN (medida en `lodash.js:6086` y `hugo/livereload.js:3377`): si una rama posterior pregunta por lo que el `try` escribe, la falla NO se traga ⇒ silencio", async () => {
    const source = [
      "function getRawTag(value) {",
      "  try {",
      "    value.tag = undefined;",
      "    var unmasked = true;",
      "  } catch (e) {}",
      "  var result = toStringOf(value);",
      "  if (unmasked) {",
      "    restore(value);",
      "  }",
      "  return result;",
      "}",
    ].join("\n");
    const file = await unitFrom(JS_WASM, JS_PROBE, source, "javascript", "a.js");
    const h = handleEmptyCatch.build(emptyCatchFinding("a.js", 5, 5, "getRawTag", "javascript"), null, ctxFor(file));
    expect(h, "el `if (unmasked)` de abajo ES el manejo de la falla: no hay excepción tragada").toBeNull();
  });

  it("Java: un manejador hermano SOBRE EL MISMO bloque protegido que sí actúa ⇒ `ya-aplicado`, no una propuesta", async () => {
    const source = [
      "class Sample {",
      "  void run() {",
      "    try {",
      "      first();",
      "      second();",
      "    } catch (IOException e) {",
      "    } catch (RuntimeException e) {",
      "      log(e);",
      "    }",
      "  }",
      "}",
    ].join("\n");
    const file = await unitFrom(JAVA_WASM, JAVA_PROBE, source, "java", "S.java");
    const h = handleEmptyCatch.build(emptyCatchFinding("S.java", 6, 7, "run", "java"), null, ctxFor(file));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ya-aplicado");
    expect(h!.confidence).toBeNull();
  });

  it("Ruby: el `rescue` es HERMANO de lo protegido (no hay campo `body` que seguir) y aun así se ubica el bloque", async () => {
    const source = [
      "def load_all",
      "  begin",
      "    parse(read)",
      "    validate",
      "  rescue StandardError => e",
      "  end",
      "  true",
      "end",
    ].join("\n");
    const file = await unitFrom(RUBY_WASM, RUBY_PROBE, source, "ruby", "a.rb");
    const h = handleEmptyCatch.build(emptyCatchFinding("a.rb", 5, 5, "load_all", "ruby"), null, ctxFor(file));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    expect(checkById(h!, "bloque de código protegido")).toBe(true);
  });

  it("C#: un `using` con cuerpo vacío entra en `exceptionNodes` por la gramática y NO es una excepción tragada ⇒ silencio", async () => {
    const source = [
      "class Sample {",
      "  void Run() {",
      "    using (var s = Open()) { }",
      "  }",
      "}",
    ].join("\n");
    const file = await unitFrom(CSHARP_WASM, CSHARP_PROBE, source, "csharp", "S.cs");
    const h = handleEmptyCatch.build(emptyCatchFinding("S.cs", 3, 3, "Run", "csharp"), null, ctxFor(file));
    expect(h, "un bloque de recurso no tiene bloque protegido AFUERA suyo: la familia se calla").toBeNull();
  });

  it("sin árbol vivo ⇒ silencio: un `required` que aprueba por no poder mirar no es un `required`", async () => {
    const h = handleEmptyCatch.build(emptyCatchFinding("a.js", 5, 5, "readConfig", "javascript"), null, ctxFor(null));
    expect(h).toBeNull();
  });

  it("sin la capacidad `excepciones` ⇒ NO aplicable, nunca 'cero hallazgos'", async () => {
    const source = ["function f(x) {", "  try {", "    a(x);", "    b(x);", "  } catch (e) {}", "  return 1;", "}"].join("\n");
    const file = await unitFrom(JS_WASM, JS_PROBE, source, "javascript", "a.js");
    const h = handleEmptyCatch.build(emptyCatchFinding("a.js", 5, 5, "f", "javascript"), null, ctxFor(file, []));
    expect(h).not.toBeNull();
    expect(h!.missingCapabilities).toEqual(["excepciones"]);
    expect(h!.confidence).toBeNull();
  });
});

describe("hypotheses/handle-empty-catch — los discriminadores mueven la confianza y nada más", () => {
  it("una sola operación protegida y la excepción ligada ⇒ confianza más baja que con dos y sin ligar", async () => {
    const unaOperacion = ["function f(x) {", "  try {", "    a(x);", "  } catch (e) {}", "  return 1;", "}"].join("\n");
    const dosOperaciones = ["function g(x) {", "  try {", "    a(x);", "    b(x);", "  } catch {}", "  return 1;", "}"].join("\n");
    const f1 = await unitFrom(JS_WASM, JS_PROBE, unaOperacion, "javascript", "a.js");
    const f2 = await unitFrom(JS_WASM, JS_PROBE, dosOperaciones, "javascript", "b.js");
    const h1 = handleEmptyCatch.build(emptyCatchFinding("a.js", 4, 4, "f", "javascript"), null, ctxFor(f1));
    const h2 = handleEmptyCatch.build(emptyCatchFinding("b.js", 5, 5, "g", "javascript"), null, ctxFor(f2));
    expect(h1).not.toBeNull();
    expect(h2).not.toBeNull();
    const orden = ["baja", "media", "alta"];
    expect(orden.indexOf(h1!.confidence!)).toBeLessThan(orden.indexOf(h2!.confidence!));
  });

  it("el techo declarado es `alta` y la confianza nunca lo supera", async () => {
    const source = ["function g(x) {", "  try {", "    a(x);", "    b(x);", "  } catch {}", "  return 1;", "}"].join("\n");
    const file = await unitFrom(JS_WASM, JS_PROBE, source, "javascript", "b.js");
    const h = handleEmptyCatch.build(emptyCatchFinding("b.js", 5, 5, "g", "javascript"), null, ctxFor(file));
    expect(h!.ceiling).toBe("alta");
    expect(["baja", "media", "alta"]).toContain(h!.confidence!);
  });
});

describe("hypotheses/handle-empty-catch — contrato del registro", () => {
  it("ancla en `empty-catch` y en nada más: no puede robarle una propuesta a ningún patrón de diseño", () => {
    expect(handleEmptyCatch.anchors).toEqual(["empty-catch"]);
  });

  it("cada `place` es el lugar del hallazgo, sin inventar ubicaciones", async () => {
    const source = ["function f(x) {", "  try {", "    a(x);", "    b(x);", "  } catch (e) {}", "  return 1;", "}"].join("\n");
    const file = await unitFrom(JS_WASM, JS_PROBE, source, "javascript", "a.js");
    const h = handleEmptyCatch.build(emptyCatchFinding("a.js", 5, 5, "f", "javascript"), null, ctxFor(file));
    expect(h!.places.map((p) => `${p.file}:${p.startLine}`)).toEqual(["a.js:5"]);
  });
});
