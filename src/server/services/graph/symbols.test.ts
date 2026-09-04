/**
 * `graph/symbols.ts` — real-grammar tests, same infra `code-grammar.test.ts`
 * already uses (`web-tree-sitter` + `tree-sitter-wasms`), over the fixtures
 * in `__fixtures__/`. Each fixture's `sets` is derived from a small LOCAL
 * probe string tailored to what that fixture needs to exercise (never
 * production's own `code-analyzer.ts` probe constants, which this task's
 * report documents as NOT exercising a namespace/module block for the
 * typescript/javascript/csharp families — this test proves `extractSymbols`
 * itself is correct given a `sets` that DOES see one, isolating that gap to
 * `code-analyzer.ts`'s probes rather than to this module's logic).
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { deriveNodeSets, type DerivedNodeSets, type ProbeNode } from "../code-grammar.js";
import type { AstNode } from "../detect/types.js";
import { extractSymbols, type SymbolFacts } from "./symbols.js";

const require = createRequire(import.meta.url);

/* eslint-disable @typescript-eslint/no-explicit-any */
let runtime: Promise<{ Parser: any; Language: any }> | null = null;
function loadRuntime() {
  runtime ??= (async () => {
    const mod = require("web-tree-sitter") as any;
    const Parser = mod.Parser ?? mod.default ?? mod;
    await Parser.init();
    const Language = Parser.Language ?? mod.Language;
    return { Parser, Language };
  })();
  return runtime;
}

function wasmPath(file: string): string {
  return path.join(path.dirname(require.resolve("tree-sitter-wasms/package.json")), "out", file);
}

const parsers = new Map<string, any>();
async function parserFor(wasmFile: string): Promise<any> {
  const cached = parsers.get(wasmFile);
  if (cached) return cached;
  const { Parser, Language } = await loadRuntime();
  const language = await Language.load(wasmPath(wasmFile));
  const parser = new Parser();
  parser.setLanguage(language);
  parsers.set(wasmFile, parser);
  return parser;
}

async function parseRoot(wasmFile: string, source: string): Promise<AstNode> {
  const parser = await parserFor(wasmFile);
  return parser.parse(source).rootNode as AstNode;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const FIXTURES_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "__fixtures__");
function fixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8");
}

/** Small, LOCAL probe strings — never production's `code-analyzer.ts` constants (see module docstring). */
const PROBES = {
  ruby: `
class Shape
  def initialize(x)
    @x = x
  end

  def self.build(x)
    new(x)
  end
end
module Ns
  class Inner
  end

  def self.build
    new
  end
end
`,
  typescript: `
class Shape {
  area(): number { return 0; }
}
namespace Outer {
  export namespace Inner {
    export class Widget {
      render(): void {}
    }
  }
}
function standalone(a: number): number { return a; }
`,
  javascript: `
class Shape {
  area() { return 0; }
}
function standalone(a, b) { return a + b; }
const helper = (x) => x + 1;
`,
  python: `
class Shape:
    def area(self):
        return 0

class Outer:
    class Inner:
        def method(self):
            return 0

def standalone(a, b):
    return a + b
`,
  go: `
package main
type Shape struct {
	Name string
}
func (s *Shape) Area() int {
	return 0
}
func NewShape(name string) *Shape {
	return &Shape{Name: name}
}
`,
  java: `
public class Shape {
  public int area() { return 0; }
}
`,
  csharp: `
public class Shape {
  public int Area() { return 0; }
}
namespace Outer.Sub {
  public class Widget {
    public class Nested {
      void Method() {}
    }
  }
}
`,
} as const;

async function setsFor(wasmFile: string, probeSource: string): Promise<DerivedNodeSets> {
  const root = await parseRoot(wasmFile, probeSource);
  return deriveNodeSets(root as unknown as ProbeNode);
}

function byName(symbols: readonly SymbolFacts[], name: string): SymbolFacts {
  const found = symbols.filter((s) => s.name === name);
  if (found.length !== 1) {
    throw new Error(`expected exactly one symbol named "${name}", found ${found.length}: ${JSON.stringify(symbols, null, 2)}`);
  }
  return found[0]!;
}

describe("extractSymbols — contract shape", () => {
  it("round-trips through JSON with no loss (CONTRATO-F3.md §1.1)", async () => {
    const sets = await setsFor("tree-sitter-ruby.wasm", PROBES.ruby);
    const root = await parseRoot("tree-sitter-ruby.wasm", fixture("symbols.rb"));
    const symbols = extractSymbols(root, sets);
    expect(symbols.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(symbols))).toEqual(symbols);
  });
});

describe("extractSymbols — ruby", () => {
  it("qualifies a nested class under its module, and its methods under the class", async () => {
    const sets = await setsFor("tree-sitter-ruby.wasm", PROBES.ruby);
    const root = await parseRoot("tree-sitter-ruby.wasm", fixture("symbols.rb"));
    const symbols = extractSymbols(root, sets);

    const admin = byName(symbols, "Admin");
    expect(admin.family).toBe("namespace-like");
    expect(admin.container).toEqual([]);

    const dealPolicy = byName(symbols, "DealPolicy");
    expect(dealPolicy.family).toBe("class-like");
    expect(dealPolicy.container).toEqual(["Admin"]);
    expect(dealPolicy.namespaceContainerOnly).toBe(false);

    const initialize = byName(symbols, "initialize");
    expect(initialize.family).toBe("function-like");
    expect(initialize.container).toEqual(["Admin", "DealPolicy"]);
    expect(initialize.memberOfClassLike).toBe(true);
  });

  it("classifies a module wrapping only classes as namespace-like (the errors.rb shape from the spike)", async () => {
    const sets = await setsFor("tree-sitter-ruby.wasm", PROBES.ruby);
    const root = await parseRoot("tree-sitter-ruby.wasm", fixture("symbols.rb"));
    const symbols = extractSymbols(root, sets);

    const errors = byName(symbols, "Errors");
    expect(errors.family).toBe("namespace-like");
    expect(errors.namespaceContainerOnly).toBe(true);

    const fatal = byName(symbols, "FatalError");
    expect(fatal.container).toEqual(["Errors"]);
  });

  it("a module wrapping only a method is class-like, not namespace-like — but its method is still memberOfClassLike", async () => {
    const sets = await setsFor("tree-sitter-ruby.wasm", PROBES.ruby);
    const root = await parseRoot("tree-sitter-ruby.wasm", fixture("symbols.rb"));
    const symbols = extractSymbols(root, sets);

    const helper = byName(symbols, "Helper");
    expect(helper.family).toBe("class-like");
    expect(helper.namespaceContainerOnly).toBe(false);

    const build = byName(symbols, "build");
    expect(build.container).toEqual(["Helper"]);
    expect(build.memberOfClassLike).toBe(true);
  });

  // P4 (Ola P) — CONTROL NEGATIVO CROSS-GRAMÁTICA del agrupamiento por
  // receptor: la otra gramática que expone un receptor sobre una DECLARACIÓN
  // lo llena con el objeto receptor directo (`self`, una constante), que no
  // resuelve ningún campo `type`. No hay tipo escrito, así que
  // `declaredReceiverTypeName` devuelve `null` y el símbolo no cambia.
  it("un método de singleton a nivel de archivo NO gana contenedor: su receptor es un objeto, no un tipo escrito", async () => {
    const sets = await setsFor("tree-sitter-ruby.wasm", PROBES.ruby);
    const root = await parseRoot(
      "tree-sitter-ruby.wasm",
      `OBJ = Object.new
def OBJ.thing
  1
end
def self.otro
  2
end
`,
    );
    const symbols = extractSymbols(root, sets);
    expect(byName(symbols, "thing").container).toEqual([]);
    expect(byName(symbols, "otro").container).toEqual([]);
    // La mitad de N9 sigue vigente: receptor escrito ⇒ no alcanzable desnudo.
    expect(byName(symbols, "thing").memberOfClassLike).toBe(true);
  });

  it("excludes a local variable inside a method body", async () => {
    const sets = await setsFor("tree-sitter-ruby.wasm", PROBES.ruby);
    const root = await parseRoot("tree-sitter-ruby.wasm", fixture("symbols.rb"));
    const symbols = extractSymbols(root, sets);
    expect(symbols.some((s) => s.name === "total")).toBe(false);
  });

  it("records a class-level constant and a top-level constant/function as \"other\"/top-level, not members", async () => {
    const sets = await setsFor("tree-sitter-ruby.wasm", PROBES.ruby);
    const root = await parseRoot("tree-sitter-ruby.wasm", fixture("symbols.rb"));
    const symbols = extractSymbols(root, sets);

    const status = byName(symbols, "STATUS");
    expect(status.family).toBe("other");
    expect(status.container).toEqual(["Admin", "DealPolicy"]);
    expect(status.memberOfClassLike).toBe(true);

    const topLevel = byName(symbols, "TOP_LEVEL");
    expect(topLevel.family).toBe("other");
    expect(topLevel.container).toEqual([]);

    const standalone = byName(symbols, "standalone");
    expect(standalone.family).toBe("function-like");
    expect(standalone.container).toEqual([]);
    expect(standalone.memberOfClassLike).toBe(false);
  });
});

describe("extractSymbols — typescript (namespace given a sets that sees it)", () => {
  it("qualifies Widget under Outer.Inner, three levels deep", async () => {
    const sets = await setsFor("tree-sitter-typescript.wasm", PROBES.typescript);
    expect(sets.classNodes.has("internal_module")).toBe(true); // sanity: this test's OWN probe exercises it, unlike production's
    const root = await parseRoot("tree-sitter-typescript.wasm", fixture("symbols.ts.fixture"));
    const symbols = extractSymbols(root, sets);

    const outer = byName(symbols, "Outer");
    expect(outer.family).toBe("namespace-like");
    const inner = byName(symbols, "Inner");
    expect(inner.family).toBe("namespace-like");
    expect(inner.container).toEqual(["Outer"]);
    const widget = byName(symbols, "Widget");
    expect(widget.container).toEqual(["Outer", "Inner"]);
    expect(widget.family).toBe("class-like"); // has a real field, not decl-only
    const render = byName(symbols, "render");
    expect(render.container).toEqual(["Outer", "Inner", "Widget"]);
    expect(render.memberOfClassLike).toBe(true);
  });

  it("a class with a typed field is class-like, not namespace-like (the bug this module's first draft had)", async () => {
    const sets = await setsFor("tree-sitter-typescript.wasm", PROBES.typescript);
    const root = await parseRoot("tree-sitter-typescript.wasm", fixture("symbols.ts.fixture"));
    const symbols = extractSymbols(root, sets);
    const shape = byName(symbols, "Shape");
    expect(shape.family).toBe("class-like");
    expect(shape.namespaceContainerOnly).toBe(false);
  });

  it("excludes a local const inside a method", async () => {
    const sets = await setsFor("tree-sitter-typescript.wasm", PROBES.typescript);
    const root = await parseRoot("tree-sitter-typescript.wasm", fixture("symbols.ts.fixture"));
    const symbols = extractSymbols(root, sets);
    expect(symbols.some((s) => s.name === "local")).toBe(false);
  });
});

describe("extractSymbols — javascript", () => {
  it("records a top-level const and arrow function, excludes nothing they don't own", async () => {
    const sets = await setsFor("tree-sitter-javascript.wasm", PROBES.javascript);
    const root = await parseRoot("tree-sitter-javascript.wasm", fixture("symbols.js"));
    const symbols = extractSymbols(root, sets);

    const topLevel = byName(symbols, "TOP_LEVEL");
    expect(topLevel.family).toBe("other");
    const helper = byName(symbols, "helper");
    expect(helper.family).toBe("other"); // arrow function's OWN declarator, not the arrow_function node
    const standalone = byName(symbols, "standalone");
    expect(standalone.family).toBe("function-like");
    expect(symbols.some((s) => s.name === "local")).toBe(false);
  });
});

describe("extractSymbols — python", () => {
  it("a class with only a method is class-like (rejected-attempt regression: it must NOT read as a namespace)", async () => {
    const sets = await setsFor("tree-sitter-python.wasm", PROBES.python);
    const root = await parseRoot("tree-sitter-python.wasm", fixture("symbols.py"));
    const symbols = extractSymbols(root, sets);
    const shape = byName(symbols, "Shape");
    expect(shape.family).toBe("class-like");
    expect(shape.namespaceContainerOnly).toBe(false);
  });

  it("Outer wrapping only class Inner IS namespace-like, and Inner (only a method) is class-like", async () => {
    const sets = await setsFor("tree-sitter-python.wasm", PROBES.python);
    const root = await parseRoot("tree-sitter-python.wasm", fixture("symbols.py"));
    const symbols = extractSymbols(root, sets);
    const outer = byName(symbols, "Outer");
    expect(outer.family).toBe("namespace-like");
    const inner = byName(symbols, "Inner");
    expect(inner.family).toBe("class-like");
    const method = byName(symbols, "method");
    expect(method.container).toEqual(["Outer", "Inner"]);
    expect(method.memberOfClassLike).toBe(true);
  });

  it("excludes a local variable inside a method", async () => {
    const sets = await setsFor("tree-sitter-python.wasm", PROBES.python);
    const root = await parseRoot("tree-sitter-python.wasm", fixture("symbols.py"));
    const symbols = extractSymbols(root, sets);
    expect(symbols.some((s) => s.name === "local")).toBe(false);
  });
});

describe("extractSymbols — go (declared gap: no ancestor nesting for methods)", () => {
  // ROOT-CAUSE FIX (frente "Go: extends/implements/mixes-in/satisfies, una
  // sola causa"): `type_spec` used to be captured as `family: "other"` (a
  // plain binding, `BINDING_DECLARATOR_TYPES`) because `classNodes` derived
  // EMPTY for Go — this test used to lock that in as "the honest, documented
  // gap". `code-grammar.ts#GO_TYPE_SPEC_WORD` now admits `type_spec` to
  // `classNodes` (see that module's docstring), so a Go struct is `family:
  // "class-like"` like every other supported language's type declaration —
  // `walk`'s `classLike` branch is checked BEFORE the `BINDING_DECLARATOR_
  // TYPES` branch, so `type_spec` never reaches the "other" path anymore.
  it('a struct is captured as "class-like" (classNodes now admits `type_spec` — see code-grammar.ts#GO_TYPE_SPEC_WORD)', async () => {
    const sets = await setsFor("tree-sitter-go.wasm", PROBES.go);
    const root = await parseRoot("tree-sitter-go.wasm", fixture("symbols.go"));
    const symbols = extractSymbols(root, sets);
    const shape = byName(symbols, "Shape");
    expect(shape.family).toBe("class-like");
    expect(shape.container).toEqual([]);
    // Not a namespace either: `isDeclOnlyBody` requires a `body` field,
    // which `type_spec` never has — `namespaceContainerOnly` stays false.
    expect(shape.namespaceContainerOnly).toBe(false);
  });

  // N9 (Ola O) cerró la mitad de ALCANZABILIDAD; P4 (Ola P) cierra la de
  // AGRUPAMIENTO: el tipo receptor ESCRITO en la declaración pasa a
  // `container`, así que el método cuelga de su tipo y no del archivo. Ver
  // `declaredReceiverTypeName` en `symbols.ts`. Este test reemplaza al que
  // afirmaba `container: []` — no afloja nada: pide MÁS (el nombre exacto del
  // tipo) donde el anterior sólo pedía "vacío".
  it("el tipo receptor SÍ va a container (agrupamiento por tipo) y el método sigue marcado como miembro", async () => {
    const sets = await setsFor("tree-sitter-go.wasm", PROBES.go);
    const root = await parseRoot("tree-sitter-go.wasm", fixture("symbols.go"));
    const symbols = extractSymbols(root, sets);
    const area = byName(symbols, "Area");
    expect(area.family).toBe("function-like");
    expect(area.container).toEqual(["Shape"]);
    expect(area.memberOfClassLike).toBe(true);
    // La función de paquete SIN receptor no gana contenedor por vivir en el
    // mismo archivo que el tipo.
    expect(byName(symbols, "NewShape").container).toEqual([]);
  });

  it("dos tipos en el MISMO archivo dejan de compartir superficie: receptor por puntero, por valor y genérico, cada método bajo el suyo", async () => {
    const sets = await setsFor("tree-sitter-go.wasm", PROBES.go);
    const root = await parseRoot(
      "tree-sitter-go.wasm",
      `package p
type Reader struct{ n int }
type Writer struct{ n int }
type Box[T any] struct{ v T }
func (r *Reader) Do() int { return 0 }
func (w Writer) Do() int { return 1 }
func (b *Box[T]) Get() T { return b.v }
`,
    );
    const symbols = extractSymbols(root, sets);
    const dos = symbols.filter((s) => s.name === "Do");
    expect(dos).toHaveLength(2);
    // Puntero (`*Reader`) y valor (`Writer`) se leen igual: el envoltorio se
    // atraviesa por FORMA, no por nombre de nodo.
    expect(dos.map((s) => s.container).sort()).toEqual([["Reader"], ["Writer"]]);
    // Receptor genérico: el contenedor es el tipo, no su parámetro de tipo.
    expect(byName(symbols, "Get").container).toEqual(["Box"]);
  });

  it("BRECHA DECLARADA: si el tipo receptor NO está declarado en este archivo, el método queda plano (no se fabrica un padre inexistente)", async () => {
    const sets = await setsFor("tree-sitter-go.wasm", PROBES.go);
    const root = await parseRoot(
      "tree-sitter-go.wasm",
      `package p
func (c *Command) Execute() int { return 0 }
`,
    );
    const symbols = extractSymbols(root, sets);
    const exec = byName(symbols, "Execute");
    expect(exec.container).toEqual([]);
    // La otra mitad de la brecha sigue cerrada aunque ésta no aplique.
    expect(exec.memberOfClassLike).toBe(true);
  });

  it("una función de paquete SIN receptor sigue siendo alcanzable por nombre desnudo (el cambio no ensancha a toda función)", async () => {
    const sets = await setsFor("tree-sitter-go.wasm", PROBES.go);
    const root = await parseRoot("tree-sitter-go.wasm", fixture("symbols.go"));
    const symbols = extractSymbols(root, sets);
    const plain = symbols.find((s) => s.family === "function-like" && s.nodeType === "function_declaration");
    expect(plain).toBeDefined();
    expect(plain!.memberOfClassLike).toBe(false);
  });

  it("package-level var/const are recorded as top-level \"other\" symbols", async () => {
    const sets = await setsFor("tree-sitter-go.wasm", PROBES.go);
    const root = await parseRoot("tree-sitter-go.wasm", fixture("symbols.go"));
    const symbols = extractSymbols(root, sets);
    expect(byName(symbols, "ExportedVar").family).toBe("other");
    expect(byName(symbols, "ExportedConst").family).toBe("other");
  });

  // Ola S (S1) — `shapeNodeType`. Go es la ÚNICA de las gramáticas del corpus
  // que no escribe la forma del tipo en el nodo declarante: struct e interfaz
  // son los DOS `type_spec`, y sin este campo nadie puede distinguir un
  // contrato de una implementación en Go.
  it("shapeNodeType distingue interfaz de struct en Go, donde el nodeType NO puede (los dos son `type_spec`)", async () => {
    const sets = await setsFor("tree-sitter-go.wasm", PROBES.go);
    const root = await parseRoot(
      "tree-sitter-go.wasm",
      `package p
type Reader interface {
	Read() int
}
type File struct{ n int }
`,
    );
    const symbols = extractSymbols(root, sets);
    const reader = byName(symbols, "Reader");
    const file = byName(symbols, "File");
    // El nodeType NO los distingue…
    expect(reader.nodeType).toBe("type_spec");
    expect(file.nodeType).toBe("type_spec");
    // …y la forma declarada SÍ, verbatim de la gramática.
    expect(reader.shapeNodeType).toBe("interface_type");
    expect(file.shapeNodeType).toBe("struct_type");
  });

  it("un símbolo que NO es tipo-clase no computa shapeNodeType, aunque su gramática exponga campo `type` (var de Go)", async () => {
    const sets = await setsFor("tree-sitter-go.wasm", PROBES.go);
    const root = await parseRoot(
      "tree-sitter-go.wasm",
      `package p
var Total int = 0
`,
    );
    const symbols = extractSymbols(root, sets);
    const total = byName(symbols, "Total");
    expect(total.family).toBe("other");
    expect(total.shapeNodeType).toBeUndefined();
  });
});

describe("extractSymbols — java", () => {
  it("qualifies a nested class and its member field/method, excludes the local inside the nested method", async () => {
    const sets = await setsFor("tree-sitter-java.wasm", PROBES.java);
    const root = await parseRoot("tree-sitter-java.wasm", fixture("symbols.java"));
    const symbols = extractSymbols(root, sets);

    const outer = byName(symbols, "Outer");
    expect(outer.family).toBe("class-like"); // has a field, not decl-only
    const name = byName(symbols, "name");
    expect(name.family).toBe("other");
    expect(name.container).toEqual(["Outer"]);
    const inner = byName(symbols, "Inner");
    expect(inner.container).toEqual(["Outer"]);
    const method = byName(symbols, "method");
    expect(method.container).toEqual(["Outer", "Inner"]);
    expect(method.memberOfClassLike).toBe(true);
    expect(symbols.some((s) => s.name === "local")).toBe(false);
  });
});

/**
 * Bug 1 regression (see this task's report): a plain binding directly inside
 * an ANONYMOUS function-like/class-like node used to leak to file level,
 * because the old design only tracked NAMED containers for the
 * `isLocal`/`memberOfClassLike` check. Dedicated probe (not `PROBES.javascript`,
 * shared by other tests above) that actually EXERCISES an anonymous function
 * expression (`.map(function (item) {...})`, the same shape as the real
 * `preact/compat/src/render.js:275` bug) and an anonymous class expression
 * (`class Anon { ... }` as a bare expression, not a `class_declaration`) so
 * `deriveNodeSets` puts both node types in `functionNodes`/`classNodes` —
 * without this, the test would pass VACUOUSLY (the anonymous node would
 * never even be recognized as a scope at all).
 */
const ANON_JS_PROBE = `
class Shape extends Base {
  method() { return 0; }
}
const helper = (x) => x + 1;
const items = [1, 2, 3].map(function (item) { return item; });
const Anon = class Named { m() { return 0; } };
function standalone(a, b) { return a + b; }
`;

describe("extractSymbols — Bug 1 regression: anonymous scopes are still real scopes", () => {
  it("a local declared directly inside an anonymous function expression does NOT leak to file level", async () => {
    const sets = await setsFor("tree-sitter-javascript.wasm", ANON_JS_PROBE);
    expect(sets.functionNodes.has("function_expression")).toBe(true); // sanity: this probe exercises it
    const root = await parseRoot(
      "tree-sitter-javascript.wasm",
      "const oldDiffed = options.diffed;\noptions.diffed = function (vnode) {\n  const props = vnode.props;\n  return props;\n};\n",
    );
    const symbols = extractSymbols(root, sets);
    expect(symbols.some((s) => s.name === "props")).toBe(false);
    // The outer top-level binding is unaffected — still recorded, still file-level.
    const oldDiffed = byName(symbols, "oldDiffed");
    expect(oldDiffed.container).toEqual([]);
  });

  it("a method declared directly inside an anonymous class expression IS memberOfClassLike (symmetric fix)", async () => {
    const sets = await setsFor("tree-sitter-javascript.wasm", ANON_JS_PROBE);
    expect(sets.classNodes.has("class")).toBe(true); // sanity: this probe exercises an anonymous class expression
    const root = await parseRoot("tree-sitter-javascript.wasm", "const Foo = class {\n  bar() {\n    return 1;\n  }\n};\n");
    const symbols = extractSymbols(root, sets);
    const bar = byName(symbols, "bar");
    expect(bar.memberOfClassLike).toBe(true);
  });
});

describe("extractSymbols — Bug 2 regression: a name of nothing but underscores is never declared", () => {
  it("Go's package-level `var _ Iface = ...` is not recorded as a declaration", async () => {
    const sets = await setsFor("tree-sitter-go.wasm", PROBES.go);
    const root = await parseRoot(
      "tree-sitter-go.wasm",
      "package main\n\nvar _ Iface = (*T)(nil)\n\nfunc f() {\n\tx, _ := g()\n\t_ = x\n}\n",
    );
    const symbols = extractSymbols(root, sets);
    expect(symbols.some((s) => s.name === "_")).toBe(false);
  });
});

describe("extractSymbols — csharp (namespace given a sets that sees it)", () => {
  it("qualifies Nested under the namespace and Widget, given a sets derived from a probe that has one", async () => {
    const sets = await setsFor("tree-sitter-c_sharp.wasm", PROBES.csharp);
    expect(sets.classNodes.has("namespace_declaration")).toBe(true); // sanity, same note as the typescript test
    const root = await parseRoot("tree-sitter-c_sharp.wasm", fixture("symbols.cs"));
    const symbols = extractSymbols(root, sets);

    // Ola 9, A1: un namespace compuesto ("Outer.Sub") se registra ÉL MISMO
    // con su texto crudo (name = "Outer.Sub", sin split — nadie lo referencia
    // por nombre desnudo en la práctica), pero CADA HIJO ve el namespace
    // partido en un frame por segmento — ver `splitQualifiedSegments` en
    // `symbols.ts`. Antes de este fix, `widget.container` era `["Outer.Sub"]`
    // (un solo elemento glued) y `resolve.ts#isVisibleFrom` nunca podía
    // reconocer que "Outer.Sub.Widget" anida bajo "Outer" ni bajo "Outer.Sub"
    // por comparación de PREFIJO DE ARRAY — la causa medida de que
    // `qualified-name` rechazara 86,5% de newtonsoft-json.
    const ns = byName(symbols, "Outer.Sub");
    expect(ns.family).toBe("namespace-like");
    const widget = byName(symbols, "Widget");
    expect(widget.container).toEqual(["Outer", "Sub"]);
    const nested = byName(symbols, "Nested");
    expect(nested.container).toEqual(["Outer", "Sub", "Widget"]);
    const method = byName(symbols, "Method");
    expect(method.container).toEqual(["Outer", "Sub", "Widget", "Nested"]);
    expect(method.memberOfClassLike).toBe(true);
    expect(symbols.some((s) => s.name === "local")).toBe(false);
  });
});

/**
 * CONTRATO-F8G.md §2.2 — dedicated probes/sources for arity + visibility,
 * distinct from `PROBES.java`/`PROBES.csharp`/`PROBES.typescript` above
 * (those only ever write `public`, not enough to exercise "no modifier at
 * all", "a non-canonical modifier alone" or "two modifiers, first wins").
 */
const MEMBER_SIGNATURE_JAVA_SRC = `
public class Shape {
  public int area() { return 0; }
  private int sum(int a, int b) { return a + b; }
  protected void hidden() {}
  void pkg() {}
}
`;

const MEMBER_SIGNATURE_CSHARP_SRC = `
public class Shape {
  public int Area() { return 0; }
  private int Sum(int a, int b) { return a + b; }
  protected internal void Hidden() {}
  static void Pkg() {}
}
`;

const MEMBER_SIGNATURE_TS_SRC = `
class Shape {
  public area(): number { return 0; }
  private sum(a: number, b: number): number { return a + b; }
  protected hidden(): void {}
  plain(): void {}
}
`;

describe("extractSymbols — CONTRATO-F8G.md §2.2: arity", () => {
  it("java: counts declared parameters via the parameters field, 0 for an empty list", async () => {
    const sets = await setsFor("tree-sitter-java.wasm", MEMBER_SIGNATURE_JAVA_SRC);
    const root = await parseRoot("tree-sitter-java.wasm", MEMBER_SIGNATURE_JAVA_SRC);
    const symbols = extractSymbols(root, sets);
    expect(byName(symbols, "area").arity).toBe(0);
    expect(byName(symbols, "sum").arity).toBe(2);
  });

  it("ruby: null when the grammar exposes no parameter-list field at all (paren-less zero-arg method), 0 when parens are written empty", async () => {
    const sets = await setsFor("tree-sitter-ruby.wasm", PROBES.ruby);
    const source = `
class Shape
  def area()
    0
  end
  def next
    1
  end
end
`;
    const root = await parseRoot("tree-sitter-ruby.wasm", source);
    const symbols = extractSymbols(root, sets);
    expect(byName(symbols, "area").arity).toBe(0); // written `def area()` — field present, empty
    expect(byName(symbols, "next").arity).toBeNull(); // written `def next` — no field at all, not "unknown zero"
  });

  it("go/python: arity computed the same way as the other languages, no modifier vocabulary needed for it", async () => {
    const goSets = await setsFor("tree-sitter-go.wasm", PROBES.go);
    const goRoot = await parseRoot("tree-sitter-go.wasm", fixture("symbols.go"));
    expect(byName(extractSymbols(goRoot, goSets), "Area").arity).toBe(0);

    const pySets = await setsFor("tree-sitter-python.wasm", PROBES.python);
    const pyRoot = await parseRoot("tree-sitter-python.wasm", fixture("symbols.py"));
    // `self` counts: arity is a raw declared-parameter count, not a semantic "user-facing" count.
    expect(byName(extractSymbols(pyRoot, pySets), "method").arity).toBe(1);
  });

  it("a plain binding (\"other\" family) never gets arity — only family === \"function-like\" does", async () => {
    const sets = await setsFor("tree-sitter-ruby.wasm", PROBES.ruby);
    const root = await parseRoot("tree-sitter-ruby.wasm", fixture("symbols.rb"));
    const symbols = extractSymbols(root, sets);
    expect(byName(symbols, "STATUS").arity).toBeUndefined();
  });
});

describe("extractSymbols — CONTRATO-F8G.md §2.2: visibility", () => {
  it("java: reads the combined `modifiers` node's first canonical word; absent entirely means undefined, not \"public\"", async () => {
    const sets = await setsFor("tree-sitter-java.wasm", MEMBER_SIGNATURE_JAVA_SRC);
    const root = await parseRoot("tree-sitter-java.wasm", MEMBER_SIGNATURE_JAVA_SRC);
    const symbols = extractSymbols(root, sets);
    expect(byName(symbols, "area").visibility).toBe("public");
    expect(byName(symbols, "sum").visibility).toBe("private");
    expect(byName(symbols, "hidden").visibility).toBe("protected");
    expect(byName(symbols, "pkg").visibility).toBeUndefined(); // package-private: no `modifiers` node at all
    expect(byName(symbols, "Shape").visibility).toBe("public"); // class-like gets it too, not just function-like
  });

  it("csharp: `protected internal` (two separate `modifier` siblings) picks the FIRST canonical word; a lone `static` modifier (no canonical word) stays undefined", async () => {
    const sets = await setsFor("tree-sitter-c_sharp.wasm", MEMBER_SIGNATURE_CSHARP_SRC);
    const root = await parseRoot("tree-sitter-c_sharp.wasm", MEMBER_SIGNATURE_CSHARP_SRC);
    const symbols = extractSymbols(root, sets);
    expect(byName(symbols, "Sum").visibility).toBe("private");
    expect(byName(symbols, "Hidden").visibility).toBe("protected");
    expect(byName(symbols, "Pkg").visibility).toBeUndefined();
  });

  it("typescript: accessibility_modifier maps 1:1 to the canonical word; absent when the source omits it", async () => {
    const sets = await setsFor("tree-sitter-typescript.wasm", MEMBER_SIGNATURE_TS_SRC);
    const root = await parseRoot("tree-sitter-typescript.wasm", MEMBER_SIGNATURE_TS_SRC);
    const symbols = extractSymbols(root, sets);
    expect(byName(symbols, "sum").visibility).toBe("private");
    expect(byName(symbols, "hidden").visibility).toBe("protected");
    expect(byName(symbols, "plain").visibility).toBeUndefined();
  });

  it("ruby/go/python: no grammar modifier-node vocabulary exists in any of the three — always undefined, never a name/capitalization guess", async () => {
    const rubySets = await setsFor("tree-sitter-ruby.wasm", PROBES.ruby);
    const rubyRoot = await parseRoot("tree-sitter-ruby.wasm", fixture("symbols.rb"));
    expect(byName(extractSymbols(rubyRoot, rubySets), "initialize").visibility).toBeUndefined();

    const goSets = await setsFor("tree-sitter-go.wasm", PROBES.go);
    const goRoot = await parseRoot("tree-sitter-go.wasm", fixture("symbols.go"));
    expect(byName(extractSymbols(goRoot, goSets), "Area").visibility).toBeUndefined();

    const pySets = await setsFor("tree-sitter-python.wasm", PROBES.python);
    const pyRoot = await parseRoot("tree-sitter-python.wasm", fixture("symbols.py"));
    expect(byName(extractSymbols(pyRoot, pySets), "method").visibility).toBeUndefined();
  });

  it("a plain binding (\"other\" family) never gets visibility — the modifier sibling lives on a wrapping node this module doesn't walk to (declared gap)", async () => {
    const sets = await setsFor("tree-sitter-ruby.wasm", PROBES.ruby);
    const root = await parseRoot("tree-sitter-ruby.wasm", fixture("symbols.rb"));
    const symbols = extractSymbols(root, sets);
    expect(byName(symbols, "STATUS").visibility).toBeUndefined();
  });
});

/** B1 (eslabón 2, ORDEN-DE-ATAQUE.md #2) — `export_statement` mezclado con top-level SIN envolver, para probar las dos ramas (envuelto/no-envuelto) del mismo archivo. */
const EXPORT_TS_SRC = `
export class Foo {}
class Priv {}
export function bar() {}
function privFn() {}
export const X = 1;
let y = 2;
export default class Baz {}
`;

describe("extractSymbols — B1 (eslabón 2): exported", () => {
  it("typescript: top-level envuelto por export_statement (class/function/const/default) -> true; sin envolver -> false, en el MISMO archivo", async () => {
    const sets = await setsFor("tree-sitter-typescript.wasm", EXPORT_TS_SRC);
    const root = await parseRoot("tree-sitter-typescript.wasm", EXPORT_TS_SRC);
    const symbols = extractSymbols(root, sets);
    expect(byName(symbols, "Foo").exported).toBe(true);
    expect(byName(symbols, "bar").exported).toBe(true);
    expect(byName(symbols, "X").exported).toBe(true); // "other" family (variable_declarator), a través del envoltorio lexical_declaration
    expect(byName(symbols, "Baz").exported).toBe(true); // export default
    expect(byName(symbols, "Priv").exported).toBe(false);
    expect(byName(symbols, "privFn").exported).toBe(false);
    expect(byName(symbols, "y").exported).toBe(false);
  });

  it("typescript: un archivo que JAMÁS usa `export` no prueba nada — default permisivo `true` para todo", async () => {
    const src = `
class Shape {
  area(): number { return 0; }
}
const TOP_LEVEL = 1;
function standalone(x: number): number { return x; }
`;
    const sets = await setsFor("tree-sitter-typescript.wasm", src);
    const root = await parseRoot("tree-sitter-typescript.wasm", src);
    const symbols = extractSymbols(root, sets);
    expect(byName(symbols, "Shape").exported).toBe(true);
    expect(byName(symbols, "standalone").exported).toBe(true);
    expect(byName(symbols, "TOP_LEVEL").exported).toBe(true);
  });

  it("typescript: `__fixtures__/symbols.ts.fixture` real — Widget SÍ está envuelto (export namespace/export class anidados), Shape/standalone/TOP_LEVEL NO lo están nunca, en el MISMO archivo", async () => {
    const sets = await setsFor("tree-sitter-typescript.wasm", fixture("symbols.ts.fixture"));
    const root = await parseRoot("tree-sitter-typescript.wasm", fixture("symbols.ts.fixture"));
    const symbols = extractSymbols(root, sets);
    expect(byName(symbols, "Widget").exported).toBe(true); // export class Widget, dentro de export namespace Inner
    expect(byName(symbols, "Shape").exported).toBe(false); // el archivo SÍ demuestra `export` (en Widget) — acá no hay default permisivo
    expect(byName(symbols, "standalone").exported).toBe(false);
    expect(byName(symbols, "TOP_LEVEL").exported).toBe(false);
  });

  it("java: reusa `visibility` (cero vocabulario nuevo) — private -> false; public/package-private (ausente) -> true (default permisivo)", async () => {
    const sets = await setsFor("tree-sitter-java.wasm", MEMBER_SIGNATURE_JAVA_SRC);
    const root = await parseRoot("tree-sitter-java.wasm", MEMBER_SIGNATURE_JAVA_SRC);
    const symbols = extractSymbols(root, sets);
    expect(byName(symbols, "Shape").exported).toBe(true);
    expect(byName(symbols, "area").exported).toBe(true);
    expect(byName(symbols, "sum").exported).toBe(false); // private
    expect(byName(symbols, "pkg").exported).toBe(true); // package-private (sin modificador) — default permisivo
  });

  it("csharp: mismo mecanismo que java — private -> false, todo lo demás -> true", async () => {
    const sets = await setsFor("tree-sitter-c_sharp.wasm", MEMBER_SIGNATURE_CSHARP_SRC);
    const root = await parseRoot("tree-sitter-c_sharp.wasm", MEMBER_SIGNATURE_CSHARP_SRC);
    const symbols = extractSymbols(root, sets);
    expect(byName(symbols, "Sum").exported).toBe(false); // private
    expect(byName(symbols, "Area").exported).toBe(true);
    expect(byName(symbols, "Hidden").exported).toBe(true); // protected internal — no es "private"
  });

  it("ruby/python/go: ninguna gramática expone un nodo de export ni de visibilidad de archivo — siempre `true`, nunca por nombre/capitalización", async () => {
    const rubySets = await setsFor("tree-sitter-ruby.wasm", PROBES.ruby);
    const rubyRoot = await parseRoot("tree-sitter-ruby.wasm", fixture("symbols.rb"));
    expect(byName(extractSymbols(rubyRoot, rubySets), "initialize").exported).toBe(true);

    const goSets = await setsFor("tree-sitter-go.wasm", PROBES.go);
    const goRoot = await parseRoot("tree-sitter-go.wasm", fixture("symbols.go"));
    // Go's real convention (mayúscula = exportado) es POR NOMBRE — deliberadamente NO usada acá,
    // misma disciplina que `computeVisibility`'s "nunca por nombre/capitalización".
    expect(byName(extractSymbols(goRoot, goSets), "Area").exported).toBe(true);

    const pySets = await setsFor("tree-sitter-python.wasm", PROBES.python);
    const pyRoot = await parseRoot("tree-sitter-python.wasm", fixture("symbols.py"));
    expect(byName(extractSymbols(pyRoot, pySets), "method").exported).toBe(true);
  });
});
