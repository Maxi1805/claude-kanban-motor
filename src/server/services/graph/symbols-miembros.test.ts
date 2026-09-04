/**
 * Ola U (C2) — LOS DOS HUECOS DE GRAFO QUE ESTE FRENTE CIERRA.
 *
 *   #1. El CAMPO ASIGNADO EN EL CONSTRUCTOR no producía nodo hijo del tipo
 *       (`this.x = param` dentro de `constructor`/`initialize`/`__init__`).
 *   #2. El TIPO DE RETORNO de un miembro estaba ausente de `MemberSignature`,
 *       que comparaba por `(nombre, aridad)` y nada más.
 *
 * Mismo andamiaje que `symbols.test.ts` (parseo real con `web-tree-sitter`,
 * `DerivedNodeSets` derivado de una sonda LOCAL, nunca de las constantes de
 * producción de `code-analyzer.ts`) — archivo aparte para no pisar a nadie:
 * ocho frentes editan el mismo árbol esta ola.
 *
 * Las sondas locales de acá SÍ incluyen un constructor en java y csharp, a
 * propósito: `DerivedNodeSets.constructorNodes` sólo se llena si la sonda
 * ejercita un `constructor_declaration`. Verificado que las sondas de
 * PRODUCCIÓN también lo hacen (`code-analyzer.ts#JAVA_PROBE` línea 33 y
 * `#CSHARP_PROBE` línea 54, las dos con `this.name = name`), así que el
 * mecanismo (B) está vivo en producción y no sólo en este test.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { deriveNodeSets, type DerivedNodeSets, type ProbeNode } from "../code-grammar.js";
import type { AstNode } from "../detect/types.js";
import { extractSymbols, type SymbolFacts } from "./symbols.js";
import { memberSignatures, returnTypesConflict, type CodeGraphEdge, type CodeGraphNode, type GraphIndex } from "./types.js";

const require = createRequire(import.meta.url);

/** Memoizado como en `symbols.test.ts`: `Parser.init()` se llama UNA vez por proceso — la segunda ya no existe como función. */
let runtime: Promise<{ Parser: any; Language: any }> | null = null;
function loadRuntime(): Promise<{ Parser: any; Language: any }> {
  runtime ??= (async () => {
    const mod = require("web-tree-sitter") as any;
    const Parser = mod.Parser ?? mod.default ?? mod;
    await Parser.init();
    return { Parser, Language: Parser.Language ?? mod.Language };
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

/** Sondas LOCALES — nunca las constantes de producción, misma disciplina que `symbols.test.ts`. */
const PROBES = {
  python: `
class Shape:
    def __init__(self, x):
        self.x = x
    def area(self) -> int:
        return 0
def standalone(a, b):
    return a + b
`,
  ruby: `
class Shape
  def initialize(x)
    @x = x
  end
  def area
    0
  end
end
module Ns
  class Inner
  end
end
`,
  typescript: `
class Shape {
  private declared: number = 0;
  constructor(x: number) {
    this.x = x;
  }
  area(): number { return 0; }
}
namespace Outer {
  export class Widget {}
}
function standalone(a: number): number { return a; }
`,
  javascript: `
class Shape {
  constructor(x) {
    this.x = x;
  }
  area() { return 0; }
}
function standalone(a, b) { return a + b; }
const helper = (x) => x + 1;
`,
  java: `
public interface Describable { String describe(); }
public class Shape implements Describable {
  private String name;
  public Shape(String name) { this.name = name; }
  public int area() { return 0; }
  public String describe() { return name; }
}
`,
  csharp: `
public class Shape {
  private string name;
  public Shape(string name) { this.name = name; }
  public int Area() { return 0; }
}
namespace Outer.Sub { public class Widget {} }
`,
  go: `
package main
type Shape struct { Name string }
func (s *Shape) Area() int { return 0 }
func NewShape(name string) *Shape { return &Shape{Name: name} }
`,
} as const;

const setsCache = new Map<string, DerivedNodeSets>();
async function setsFor(wasmFile: string, probeSource: string): Promise<DerivedNodeSets> {
  const cached = setsCache.get(wasmFile);
  if (cached) return cached;
  const root = await parseRoot(wasmFile, probeSource);
  const sets = deriveNodeSets(root as unknown as ProbeNode);
  setsCache.set(wasmFile, sets);
  return sets;
}

async function symbolsOf(wasmFile: string, probeSource: string, source: string): Promise<readonly SymbolFacts[]> {
  const sets = await setsFor(wasmFile, probeSource);
  return extractSymbols(await parseRoot(wasmFile, source), sets);
}

function named(symbols: readonly SymbolFacts[], name: string): readonly SymbolFacts[] {
  return symbols.filter((s) => s.name === name);
}

function only(symbols: readonly SymbolFacts[], name: string): SymbolFacts {
  const found = named(symbols, name);
  if (found.length !== 1) {
    throw new Error(`esperaba exactamente un símbolo "${name}", hay ${found.length}: ${JSON.stringify(symbols, null, 2)}`);
  }
  return found[0]!;
}

/* ════════════════════════════════════════════════════════════════════════
 * HUECO #1 — el campo asignado en el constructor
 * ════════════════════════════════════════════════════════════════════════ */

describe("hueco #1 — un campo asignado en el constructor es un miembro del TIPO", () => {
  it("python: `self.items = items` en `__init__` declara `Bag.items`; el local de al lado no declara nada", async () => {
    const symbols = await symbolsOf(
      "tree-sitter-python.wasm",
      PROBES.python,
      `
class Bag:
    def __init__(self, items):
        self.items = items
        self._n = 0
        local = 1
`,
    );
    const items = only(symbols, "items");
    expect(items.family).toBe("other");
    expect(items.container).toEqual(["Bag"]);
    // La marca que impide el hub falso: a un campo se llega por su dueño.
    expect(items.memberOfClassLike).toBe(true);
    expect(items.nodeType).toBe("assignment");
    expect(only(symbols, "_n").container).toEqual(["Bag"]);
    expect(named(symbols, "local")).toHaveLength(0);
  });

  it("ruby: `@items = items` en `initialize` declara `Bag.items` SIN el `@` — converge con el nombre que `propaga-tipo.ts` le da al mismo campo", async () => {
    const symbols = await symbolsOf(
      "tree-sitter-ruby.wasm",
      PROBES.ruby,
      `
class Bag
  def initialize(items)
    @items = items
    local = 1
  end
end
`,
    );
    const items = only(symbols, "items");
    expect(items.container).toEqual(["Bag"]);
    expect(items.family).toBe("other");
    expect(named(symbols, "@items")).toHaveLength(0);
    expect(named(symbols, "local")).toHaveLength(0);
  });

  it("typescript: `this.items = items` en `constructor` declara `Bag.items`", async () => {
    const symbols = await symbolsOf(
      "tree-sitter-typescript.wasm",
      PROBES.typescript,
      `
export class Bag {
  constructor(items: string[]) {
    this.items = items;
    const local = 1;
  }
}
`,
    );
    const items = only(symbols, "items");
    expect(items.container).toEqual(["Bag"]);
    expect(items.family).toBe("other");
    // Exportar la clase NO exporta sus campos — mismo trato que cualquier otro
    // miembro (ver `childExported = false` en `walk`).
    expect(items.exported).toBe(false);
    expect(named(symbols, "local")).toHaveLength(0);
  });

  it("javascript: misma forma sin anotaciones de tipo", async () => {
    const symbols = await symbolsOf(
      "tree-sitter-javascript.wasm",
      PROBES.javascript,
      `
class Bag {
  constructor(items) {
    this.items = items;
  }
}
`,
    );
    expect(only(symbols, "items").container).toEqual(["Bag"]);
  });

  it("java: `constructor_declaration` (mecanismo B, sin nombre mandado) declara el campo que NO estaba escrito en el cuerpo de la clase", async () => {
    const symbols = await symbolsOf(
      "tree-sitter-java.wasm",
      PROBES.java,
      `
class Bag {
  Bag(int[] items) { this.items = items; }
}
`,
    );
    expect(only(symbols, "items").container).toEqual(["Bag"]);
  });

  it("java: un campo YA declarado en el cuerpo de la clase NO se duplica — un solo símbolo, nunca un hermano homónimo `@2`", async () => {
    const symbols = await symbolsOf(
      "tree-sitter-java.wasm",
      PROBES.java,
      `
class Bag {
  private int n;
  Bag(int n) { this.n = n; }
}
`,
    );
    const n = only(symbols, "n");
    // El que gana es el declarador real del cuerpo de la clase, no la asignación.
    expect(n.nodeType).toBe("variable_declarator");
    expect(n.container).toEqual(["Bag"]);
  });

  it("java: dos constructores sobrecargados que asignan el MISMO campo lo declaran UNA sola vez", async () => {
    const symbols = await symbolsOf(
      "tree-sitter-java.wasm",
      PROBES.java,
      `
class Bag {
  Bag(int[] items) { this.items = items; }
  Bag() { this.items = new int[0]; }
}
`,
    );
    expect(named(symbols, "items")).toHaveLength(1);
  });

  it("csharp: `this.items = items` en `constructor_declaration` declara `Bag.items`", async () => {
    const symbols = await symbolsOf(
      "tree-sitter-c_sharp.wasm",
      PROBES.csharp,
      `
class Bag {
  public Bag(int[] items) { this.items = items; }
}
`,
    );
    expect(only(symbols, "items").container).toEqual(["Bag"]);
  });

  it("NO declara nada: una asignación a `this` FUERA del constructor", async () => {
    const symbols = await symbolsOf(
      "tree-sitter-typescript.wasm",
      PROBES.typescript,
      `
class Bag {
  reset(): void {
    this.tarde = 1;
  }
}
`,
    );
    expect(named(symbols, "tarde")).toHaveLength(0);
  });

  it("NO declara nada: un acceso ANIDADO (`this.a.b = c`) — el dueño de `b` es otro objeto, no este tipo", async () => {
    const symbols = await symbolsOf(
      "tree-sitter-typescript.wasm",
      PROBES.typescript,
      `
class Bag {
  constructor(v: number) {
    this.a.b = v;
  }
}
`,
    );
    expect(named(symbols, "b")).toHaveLength(0);
  });

  it("NO declara nada: una asignación a `this` dentro de una función anidada DENTRO del constructor", async () => {
    const symbols = await symbolsOf(
      "tree-sitter-typescript.wasm",
      PROBES.typescript,
      `
class Bag {
  constructor(items: number[]) {
    this.items = items;
    items.forEach(function (i) {
      this.dentro = i;
    });
  }
}
`,
    );
    expect(named(symbols, "items")).toHaveLength(1);
    expect(named(symbols, "dentro")).toHaveLength(0);
  });

  it("NO declara nada: un constructor a nivel de ARCHIVO, sin tipo dueño — el campo colgaría del archivo", async () => {
    const symbols = await symbolsOf(
      "tree-sitter-python.wasm",
      PROBES.python,
      `
def __init__(self, items):
    self.suelto = items
`,
    );
    expect(named(symbols, "suelto")).toHaveLength(0);
  });

  it("go no tiene constructores y no cambia: la asignación a un receptor local no declara ningún campo", async () => {
    const symbols = await symbolsOf(
      "tree-sitter-go.wasm",
      PROBES.go,
      `
package p
type Bag struct { n int }
func NewBag(n int) *Bag { b := &Bag{}; b.n = n; return b }
`,
    );
    expect(named(symbols, "n")).toHaveLength(0);
  });

  it("el JSON del hecho sigue redondeando sin pérdida (CONTRATO-F3.md §1.1)", async () => {
    const symbols = await symbolsOf(
      "tree-sitter-python.wasm",
      PROBES.python,
      `
class Bag:
    def __init__(self, items):
        self.items = items
`,
    );
    expect(JSON.parse(JSON.stringify(symbols))).toEqual(symbols);
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * HUECO #2 — el tipo de retorno
 * ════════════════════════════════════════════════════════════════════════ */

describe("hueco #2 — el tipo de retorno ESCRITO viaja en `SymbolFacts`", () => {
  it("csharp: el caso del plan — dos `GetEnumerator()` de aridad 0 con tipos de retorno incompatibles", async () => {
    // `newtonsoft-json/Src/Newtonsoft.Json/Bson/BsonToken.cs:40,52-54` y `:63,75-77`.
    const symbols = await symbolsOf(
      "tree-sitter-c_sharp.wasm",
      PROBES.csharp,
      `
class BsonObject : BsonToken {
  public IEnumerator<BsonProperty> GetEnumerator() { return _children.GetEnumerator(); }
}
class BsonArray : BsonToken {
  public IEnumerator<BsonToken> GetEnumerator() { return _children.GetEnumerator(); }
}
`,
    );
    const enumerators = named(symbols, "GetEnumerator");
    expect(enumerators).toHaveLength(2);
    expect(enumerators.map((s) => s.returnType).sort()).toEqual(["IEnumerator<BsonProperty>", "IEnumerator<BsonToken>"]);
    // La MISMA aridad y el MISMO nombre — que es todo lo que la firma miraba antes.
    expect(enumerators.every((s) => s.arity === 0)).toBe(true);
  });

  it("java: campo `type`, incluido un genérico calificado; el constructor NO tiene tipo de retorno", async () => {
    const symbols = await symbolsOf(
      "tree-sitter-java.wasm",
      PROBES.java,
      `
class Bag {
  Bag(int n) { this.n = n; }
  public java.util.Iterator<String> iterator() { return null; }
  int size() { return 0; }
}
`,
    );
    expect(only(symbols, "iterator").returnType).toBe("java.util.Iterator<String>");
    expect(only(symbols, "size").returnType).toBe("int");
    // El nombre de la clase NUNCA se cuela como tipo de retorno del
    // constructor — que en java se llama IGUAL que su clase, de ahí el filtro
    // por `nodeType` en vez de por nombre.
    const ctor = named(symbols, "Bag").find((s) => s.nodeType === "constructor_declaration");
    expect(ctor).toBeDefined();
    expect(ctor?.returnType).toBeUndefined();
    expect(named(symbols, "Bag").find((s) => s.family === "class-like")?.returnType).toBeUndefined();
  });

  it("typescript: el envoltorio de anotación de un solo hijo se desenvuelve (`\": Map<string, Foo>\"` → `\"Map<string, Foo>\"`); sin anotación queda AUSENTE", async () => {
    const symbols = await symbolsOf(
      "tree-sitter-typescript.wasm",
      PROBES.typescript,
      `
class Bag {
  size(): Map<string, Foo> { return null as any; }
  sinAnotar() {}
}
`,
    );
    expect(only(symbols, "size").returnType).toBe("Map<string, Foo>");
    expect(only(symbols, "sinAnotar").returnType).toBeUndefined();
  });

  it("python: campo `return_type`; sin anotación queda AUSENTE", async () => {
    const symbols = await symbolsOf(
      "tree-sitter-python.wasm",
      PROBES.python,
      `
class Bag:
    def size(self) -> int:
        return 0
    def bare(self):
        return 0
`,
    );
    expect(only(symbols, "size").returnType).toBe("int");
    expect(only(symbols, "bare").returnType).toBeUndefined();
  });

  it("go: campo `result`, incluida la tupla entera", async () => {
    const symbols = await symbolsOf(
      "tree-sitter-go.wasm",
      PROBES.go,
      `
package p
type Bag struct{}
func (b *Bag) Size() (int, error) { return 0, nil }
func (b *Bag) One() int { return 0 }
func (b *Bag) None() {}
`,
    );
    expect(only(symbols, "Size").returnType).toBe("(int, error)");
    expect(only(symbols, "One").returnType).toBe("int");
    expect(only(symbols, "None").returnType).toBeUndefined();
  });

  it("ruby no tiene ranura de tipo de retorno: AUSENTE en todos, y ausente es `no sé`", async () => {
    const symbols = await symbolsOf(
      "tree-sitter-ruby.wasm",
      PROBES.ruby,
      `
class Bag
  def size
    0
  end
end
`,
    );
    expect(only(symbols, "size").returnType).toBeUndefined();
  });

  it("un tipo genérico partido en varias líneas compara igual que el mismo tipo en una", async () => {
    const symbols = await symbolsOf(
      "tree-sitter-java.wasm",
      PROBES.java,
      `
class Bag {
  java.util.Map<String,
                Integer> uno() { return null; }
  java.util.Map<String, Integer> dos() { return null; }
}
`,
    );
    expect(only(symbols, "uno").returnType).toBe(only(symbols, "dos").returnType);
  });

  it("un campo (family `other`) nunca lleva tipo de retorno: la pregunta no le aplica", async () => {
    const symbols = await symbolsOf(
      "tree-sitter-java.wasm",
      PROBES.java,
      `
class Bag {
  private int n;
}
`,
    );
    expect(only(symbols, "n").returnType).toBeUndefined();
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * HUECO #2 — la proyección a `MemberSignature` y la regla de lectura
 * ════════════════════════════════════════════════════════════════════════ */

function indexOf(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): GraphIndex {
  return {
    nodeById: (id) => nodes.find((n) => n.id === id) ?? null,
    edgesFrom: (id) => edges.filter((e) => e.from === id),
  };
}

describe("hueco #2 — `memberSignatures` proyecta el tipo de retorno, y ausente es `no sé`", () => {
  const owner: CodeGraphNode = { id: "sym:a.cs#BsonObject", kind: "symbol", file: "a.cs", symbolPath: ["BsonObject"], family: "class-like" };
  const conRetorno: CodeGraphNode = {
    id: "sym:a.cs#BsonObject.GetEnumerator",
    kind: "symbol",
    file: "a.cs",
    symbolPath: ["BsonObject", "GetEnumerator"],
    family: "function-like",
    arity: 0,
    returnType: "IEnumerator<BsonProperty>",
  };
  const sinRetorno: CodeGraphNode = {
    id: "sym:a.cs#BsonObject.Otro",
    kind: "symbol",
    file: "a.cs",
    symbolPath: ["BsonObject", "Otro"],
    family: "function-like",
    arity: 0,
  };
  const edges: readonly CodeGraphEdge[] = [
    { from: owner.id, to: conRetorno.id, kind: "contains", provenance: "declared", weight: 1 },
    { from: owner.id, to: sinRetorno.id, kind: "contains", provenance: "declared", weight: 1 },
  ];

  it("copia el tipo de retorno verbatim, y lo deja ausente donde el nodo no lo trae", () => {
    const sigs = memberSignatures(indexOf([owner, conRetorno, sinRetorno], edges), owner.id);
    expect(sigs).toEqual([
      { name: "GetEnumerator", arity: 0, returnType: "IEnumerator<BsonProperty>", visibility: undefined },
      { name: "Otro", arity: 0, returnType: undefined, visibility: undefined },
    ]);
  });

  it("`returnTypesConflict`: dos tipos escritos DISTINTOS se contradicen", () => {
    expect(
      returnTypesConflict(
        { name: "GetEnumerator", arity: 0, returnType: "IEnumerator<BsonProperty>" },
        { name: "GetEnumerator", arity: 0, returnType: "IEnumerator<BsonToken>" },
      ),
    ).toBe(true);
  });

  it("`returnTypesConflict`: el MISMO tipo escrito no se contradice", () => {
    expect(
      returnTypesConflict({ name: "m", arity: 0, returnType: "int" }, { name: "m", arity: 0, returnType: "int" }),
    ).toBe(false);
  });

  it("`returnTypesConflict`: AUSENTE es `no sé`, nunca un desacuerdo — ni contra un presente ni contra otro ausente", () => {
    expect(returnTypesConflict({ name: "m", arity: 0 }, { name: "m", arity: 0, returnType: "int" })).toBe(false);
    expect(returnTypesConflict({ name: "m", arity: 0, returnType: "int" }, { name: "m", arity: 0 })).toBe(false);
    expect(returnTypesConflict({ name: "m", arity: 0 }, { name: "m", arity: 0 })).toBe(false);
  });

  it("un grafo de ANTES de esta ola (nodos sin `returnType`) sigue proyectando, con el `no sé` correcto", () => {
    const viejo: CodeGraphNode = {
      id: "sym:a.rb#Bag.size",
      kind: "symbol",
      file: "a.rb",
      symbolPath: ["Bag", "size"],
      family: "function-like",
    };
    const dueño: CodeGraphNode = { id: "sym:a.rb#Bag", kind: "symbol", file: "a.rb", symbolPath: ["Bag"], family: "class-like" };
    const sigs = memberSignatures(
      indexOf([dueño, viejo], [{ from: dueño.id, to: viejo.id, kind: "contains", provenance: "declared", weight: 1 }]),
      dueño.id,
    );
    expect(sigs).toEqual([{ name: "size", arity: null, returnType: undefined, visibility: undefined }]);
  });
});
