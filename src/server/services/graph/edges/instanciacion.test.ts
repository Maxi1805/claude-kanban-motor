import { describe, expect, it } from "vitest";

import { fileUnitFrom, nodeSetsFor, parseRoot } from "../../detect/testing.js";
import { extractor } from "./instanciacion.js";
import { edgeProfile, registerSentinelProbe } from "./sentinel.js";
import type { EdgeContext } from "./types.js";

const WASM: Readonly<Record<string, string>> = {
  typescript: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-tsx.wasm",
  vue: "tree-sitter-typescript.wasm",
  javascript: "tree-sitter-javascript.wasm",
  java: "tree-sitter-java.wasm",
  csharp: "tree-sitter-c_sharp.wasm",
  go: "tree-sitter-go.wasm",
  ruby: "tree-sitter-ruby.wasm",
  python: "tree-sitter-python.wasm",
};

/** Sondas para `deriveNodeSets`: clase con método y un cuerpo mínimo — ver
 *  §5 de la plantilla de detectores ("si la sonda no ejercita una
 *  construcción, esa construcción no existe para vos"). */
const PROBE: Readonly<Record<string, string>> = {
  typescript: "class Probe { m() { const x = 1; } }",
  tsx: "class Probe { m() { const x = 1; } }",
  vue: "class Probe { m() { const x = 1; } }",
  javascript: "class Probe { m() { const x = 1; } }",
  java: "class Probe { void m() { int x = 1; } }",
  csharp: "class Probe { void M() { int x = 1; } }",
  go: "package main\nfunc m() {\n\tx := 1\n\t_ = x\n}\n",
  // `def m` SIN paréntesis NI cuerpo no expone `parameters` NI `body` en
  // tree-sitter-ruby (un método vacío no arma `body_statement` en absoluto,
  // confirmado por sonda directa, `scratchpad/f4-instantiates/probe2.mjs`,
  // esta tarea) — `isFunctionLike` (`code-grammar.ts`) exige AMBOS campos a
  // la vez, así que `method` nunca se derivaría function-like y
  // `file.functions` saldría vacío. Un parámetro Y una sentencia adentro
  // alcanzan para que la sonda vea la forma completa, igual que el
  // `RUBY_PROBE` real de `code-analyzer.ts` (`initialize(name, opts = {}); @name = name`).
  ruby: "class Probe\n  def m(x)\n    x\n  end\nend\n",
  python: "class Probe:\n    def m(self):\n        pass\n",
};

let warmed = false;
/** Parsea la sonda centinela de CADA lenguaje declarado y la registra en el
 *  registro compartido de `sentinel.ts` — una vez por proceso de test, igual
 *  disciplina que "una sonda por (lenguaje, proceso)" del contrato. */
async function warmUpAll(): Promise<void> {
  if (warmed) return;
  for (const [lang, src] of Object.entries(extractor.sentinel)) {
    const root = await parseRoot(WASM[lang]!, src);
    registerSentinelProbe(lang, extractor.id, root);
  }
  warmed = true;
}

async function ctxFor(language: string): Promise<EdgeContext> {
  await warmUpAll();
  const { carriers } = edgeProfile(language, extractor);
  return {
    language,
    capabilities: new Set(),
    carriers: (slot) => (extractor.slots.includes(slot) ? carriers : []),
    suppressedRolePaths: [],
  };
}

async function fileFor(language: string, source: string) {
  const wasm = WASM[language]!;
  const sets = await nodeSetsFor(wasm, PROBE[language]!);
  const root = await parseRoot(wasm, source);
  return fileUnitFrom(root, sets, language);
}

describe("instanciacion", () => {
  it("typescript: `new Widget(...)` es una arista", async () => {
    const file = await fileFor("typescript", "function f() { const x = new Widget(1, 2); }");
    const ctx = await ctxFor("typescript");
    const edges = extractor.extract(file, ctx);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      kind: "instantiates",
      toName: "Widget",
      toQualifier: [],
      provenance: "declared",
    });
  });

  it("typescript: constructor en minúscula (`new bound(...)`) también dispara -- la brecha que la regex vieja tenía", async () => {
    const file = await fileFor(
      "typescript",
      "function f() { const bound = getCtor(); const x = new bound(1); }",
    );
    const ctx = await ctxFor("typescript");
    const edges = extractor.extract(file, ctx);
    expect(edges.map((e) => e.toName)).toContain("bound");
  });

  it("typescript control negativo: una llamada común (sin `new`) no dispara", async () => {
    const file = await fileFor("typescript", "function f() { const x = Widget(1, 2); }");
    const ctx = await ctxFor("typescript");
    expect(extractor.extract(file, ctx)).toHaveLength(0);
  });

  it("rol/ubicación: `fromPath` es la función contenedora y `via` describe la forma de donde salió", async () => {
    const file = await fileFor(
      "typescript",
      "class Factory {\n  build() {\n    return new Widget(1);\n  }\n}\n",
    );
    const ctx = await ctxFor("typescript");
    const [edge] = extractor.extract(file, ctx);
    expect(edge.fromPath).toEqual(["Factory", "build"]);
    expect(edge.startLine).toBe(3);
    expect(edge.via).toContain("new_expression");
  });

  it("java: `new Widget(...)` es una arista, con `fromPath` correcto", async () => {
    const file = await fileFor("java", "class C { void m() { Object x = new Widget(1); } }");
    const ctx = await ctxFor("java");
    const [edge] = extractor.extract(file, ctx);
    expect(edge.toName).toBe("Widget");
    expect(edge.fromPath).toEqual(["C", "m"]);
    expect(edge.via).toContain("object_creation_expression");
  });

  it("csharp: `new Widget(...)` es una arista", async () => {
    const file = await fileFor("csharp", "class C { void M() { var x = new Widget(1, 2); } }");
    const ctx = await ctxFor("csharp");
    expect(extractor.extract(file, ctx).map((e) => e.toName)).toEqual(["Widget"]);
  });

  it("go: `Widget{...}` (composite literal de tipo nombrado) es una arista", async () => {
    const file = await fileFor(
      "go",
      'package main\nfunc f() {\n\tx := Widget{Name: "a"}\n\t_ = x\n}\n',
    );
    const ctx = await ctxFor("go");
    expect(extractor.extract(file, ctx).map((e) => e.toName)).toEqual(["Widget"]);
  });

  it("go control negativo: slice literal (`[]int{...}`) no dispara -- no es un tipo nombrado", async () => {
    const file = await fileFor("go", "package main\nfunc f() {\n\tx := []int{1, 2}\n\t_ = x\n}\n");
    const ctx = await ctxFor("go");
    expect(extractor.extract(file, ctx)).toHaveLength(0);
  });

  it("go control negativo: map literal (`map[string]int{...}`) no dispara -- tipo compuesto", async () => {
    const file = await fileFor(
      "go",
      'package main\nfunc f() {\n\tx := map[string]int{"a": 1}\n\t_ = x\n}\n',
    );
    const ctx = await ctxFor("go");
    expect(extractor.extract(file, ctx)).toHaveLength(0);
  });

  it("ruby: `Gadget.new(...)` es una arista, con `fromPath` correcto", async () => {
    const file = await fileFor(
      "ruby",
      "class Widget\n  def f\n    x = Gadget.new(1, 2)\n  end\nend\n",
    );
    const ctx = await ctxFor("ruby");
    const [edge] = extractor.extract(file, ctx);
    expect(edge.kind).toBe("instantiates");
    expect(edge.toName).toBe("Gadget");
    expect(edge.toQualifier).toEqual([]);
    expect(edge.fromPath).toEqual(["Widget", "f"]);
    expect(edge.via).toContain("receiver");
  });

  it("ruby: receptor calificado (`Sub::Gadget.new(...)`) dispara, partido en toName + toQualifier (Ola P: antes viajaba crudo y no resolvía contra ningún símbolo)", async () => {
    const file = await fileFor(
      "ruby",
      "class Widget\n  def f\n    x = Sub::Gadget.new(1, 2)\n  end\nend\n",
    );
    const ctx = await ctxFor("ruby");
    const [edge] = extractor.extract(file, ctx);
    expect(edge.toName).toBe("Gadget");
    expect(edge.toQualifier).toEqual(["Sub"]);
  });

  it("java: `new Widget<T>(...)` (genérico) dispara con el nombre PELADO — antes viajaba «Widget<String>» y `graph/build.ts` lo descartaba por nombre inexistente", async () => {
    const file = await fileFor("java", "class C { void m() { Object x = new Widget<String>(1); } }");
    const ctx = await ctxFor("java");
    const [edge] = extractor.extract(file, ctx);
    expect(edge.toName).toBe("Widget");
    expect(edge.toQualifier).toEqual([]);
  });

  it("csharp: `new Widget<T>(...)` (genérico) dispara con el nombre pelado", async () => {
    const file = await fileFor("csharp", "class C { void M() { var x = new Widget<int>(1); } }");
    const ctx = await ctxFor("csharp");
    expect(extractor.extract(file, ctx).map((e) => e.toName)).toEqual(["Widget"]);
  });

  it("java: `new outer.Widget()` (calificado) se parte en toName + toQualifier", async () => {
    const file = await fileFor("java", "class C { void m() { Object x = new outer.Widget(1); } }");
    const ctx = await ctxFor("java");
    const [edge] = extractor.extract(file, ctx);
    expect(edge.toName).toBe("Widget");
    expect(edge.toQualifier).toEqual(["outer"]);
  });

  it("java: `fromPath` de un `new` DENTRO de una clase anónima es el scope léxico completo — el MISMO que reporta `graph/references.ts` para el mismo identificador", async () => {
    // Ver el punto 2 de "DOS DEFECTOS MEDIDOS" en instanciacion.ts: con
    // `file.functions` esto daba ["C","go"] (la clase anónima aplanada) y la
    // arista salía con un `from` que no corresponde a ningún nodo del grafo,
    // así que `concrete-over-abstraction` no podía cancelar su evidencia.
    const file = await fileFor(
      "java",
      "class C {\n  Object m() {\n    return new Visitor() {\n      void go() {\n        Object z = new Helper();\n      }\n    };\n  }\n}\n",
    );
    const ctx = await ctxFor("java");
    const edges = extractor.extract(file, ctx);
    expect(edges.map((e) => [e.toName, e.fromPath])).toEqual([
      ["Visitor", ["C", "m"]],
      ["Helper", ["C", "m", "go"]],
    ]);
  });

  it("java: `new` en un inicializador de CAMPO tiene `fromPath` a nivel de clase, no vacío", async () => {
    const file = await fileFor("java", "class C {\n  Helper h = new Helper();\n}\n");
    const ctx = await ctxFor("java");
    const [edge] = extractor.extract(file, ctx);
    expect(edge.fromPath).toEqual(["C"]);
  });

  it("ruby control negativo: `Gadget.create(...)` (vocabulario de ActiveRecord) no dispara -- el mensaje no es \"new\"", async () => {
    const file = await fileFor(
      "ruby",
      "class Widget\n  def f\n    x = Gadget.create(1, 2)\n  end\nend\n",
    );
    const ctx = await ctxFor("ruby");
    expect(extractor.extract(file, ctx)).toHaveLength(0);
  });

  it("ruby control negativo: `Gadget.build(...)`/`Gadget.find(...)` tampoco disparan", async () => {
    const file = await fileFor(
      "ruby",
      "class Widget\n  def f\n    x = Gadget.build(1)\n    y = Gadget.find(1)\n  end\nend\n",
    );
    const ctx = await ctxFor("ruby");
    expect(extractor.extract(file, ctx)).toHaveLength(0);
  });

  it("ruby control negativo: receptor dinámico (`klass.new(...)`) no dispara -- brecha declarada, sólo receptor constante", async () => {
    const file = await fileFor(
      "ruby",
      "class Widget\n  def f\n    klass = get_klass\n    x = klass.new(1, 2)\n  end\nend\n",
    );
    const ctx = await ctxFor("ruby");
    expect(extractor.extract(file, ctx)).toHaveLength(0);
  });

  it("ruby control negativo: `self.new(...)` no dispara -- `self` no es del tipo `constant`", async () => {
    const file = await fileFor(
      "ruby",
      "class Widget\n  def self.build\n    x = self.new(1, 2)\n  end\nend\n",
    );
    const ctx = await ctxFor("ruby");
    expect(extractor.extract(file, ctx)).toHaveLength(0);
  });

  it("python: `SentinelType(...)` es una arista cuando `SentinelType` es una clase declarada en el mismo archivo", async () => {
    const file = await fileFor(
      "python",
      "class Gadget:\n    pass\n\n\nclass Widget:\n    def f(self):\n        x = Gadget(1, 2)\n        y = some_function(1, 2)\n",
    );
    const ctx = await ctxFor("python");
    const edges = extractor.extract(file, ctx);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      kind: "instantiates",
      toName: "Gadget",
      toQualifier: [],
      provenance: "declared",
      fromPath: ["Widget", "f"],
    });
  });

  it("python control negativo: llamada a una función común (`some_function(...)`) no dispara -- mismo nodo `call` que una instanciación", async () => {
    const file = await fileFor(
      "python",
      "class Widget:\n    def f(self):\n        y = some_function(1, 2)\n",
    );
    const ctx = await ctxFor("python");
    expect(extractor.extract(file, ctx)).toHaveLength(0);
  });

  it("python control negativo: clase NO declarada en este archivo (p.ej. importada) no dispara -- brecha declarada, alcance por archivo", async () => {
    const file = await fileFor(
      "python",
      "class Widget:\n    def f(self):\n        x = ImportedElsewhere(1, 2)\n",
    );
    const ctx = await ctxFor("python");
    expect(extractor.extract(file, ctx)).toHaveLength(0);
  });

  it("python control negativo: acceso calificado (`a.b.Gadget(...)`) no dispara -- sólo identificador desnudo", async () => {
    const file = await fileFor(
      "python",
      "class Gadget:\n    pass\n\n\nclass Widget:\n    def f(self):\n        x = a.b.Gadget(1, 2)\n",
    );
    const ctx = await ctxFor("python");
    expect(extractor.extract(file, ctx)).toHaveLength(0);
  });

  it("invariante del registro: optional=true, kind='instantiates', needs=[], slots declarados, ruby/python con sonda", () => {
    expect(extractor.optional).toBe(true);
    expect(extractor.kind).toBe("instantiates");
    expect(extractor.needs).toEqual([]);
    expect(extractor.slots.length).toBeGreaterThan(0);
    expect(extractor.sentinel.typescript).toBeTruthy();
    expect(extractor.sentinel.ruby).toBeTruthy();
    expect(extractor.sentinel.python).toBeTruthy();
  });
});
