/**
 * `declara-tipo.ts` — la arista `declares-type`, Ola R (R1).
 *
 * Contra GRAMÁTICAS REALES (`web-tree-sitter` + `tree-sitter-wasms`), mismo
 * motivo que `portador.test.ts`/`references.test.ts`: este módulo entero es
 * una función de un NOMBRE DE CAMPO de la gramática (`type`) y de los TIPOS
 * DE NODO que cada gramática le pone adentro. Un árbol fabricado a mano
 * probaría lo que quien lo escribió imaginó, que es exactamente el modo de
 * falla que este proyecto ya pagó tres veces.
 *
 * Los dos ceros de lenguaje (ruby, javascript) NO son un hueco: son la
 * FIXTURE que `EDGE_KIND_SPECS.absentIn` de `graph/edge-kinds.ts` cita para
 * declarar por qué esa celda de la matriz de cobertura está muda.
 */
import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { deriveNodeSets, type ProbeNode } from "../../code-grammar.js";
import type { AstNode } from "../../detect/types.js";
import type { SymbolFacts } from "../symbols.js";
import { carrierNodeId, symbolNodeId, type CodeGraph } from "../types.js";
import { buildGraph, buildResolutionContext, type GraphFileFacts } from "../build.js";
import type { EdgeFacts } from "./types.js";
import {
  carrierIdFromSymbolId,
  declaraTipoNodeId,
  declaredTypeOf,
  declaredTypeOfDeclaration,
  extractTypeDeclFacts,
  materializeTypeDeclNodes,
  resolveDeclaresTypeEdges,
} from "./declara-tipo.js";

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

/**
 * Misma disciplina que `portador.test.ts`: `deriveNodeSets` corre UNA vez por
 * lenguaje sobre una fuente REPRESENTATIVA (clase + función + método), nunca
 * sobre el snippet de cada caso — igual que la producción real.
 */
const SETS_PROBE: Readonly<Record<string, string>> = {
  "tree-sitter-java.wasm": "class C { int m(int a) { return a; } }\ninterface I { void n(); }",
  "tree-sitter-c_sharp.wasm": "class C { int M(int a) { return a; } }\ninterface I { void N(); }",
  "tree-sitter-typescript.wasm": "class C { m(a: number): number { return a; } }\nfunction f(a: number): number { return a; }\nconst g = (a: number) => a;",
  "tree-sitter-go.wasm": "package main\nfunc named(a int) int { return a }\ntype T struct { x int }\nfunc (t *T) M(a int) int { return a }",
  "tree-sitter-python.wasm": "def named(a):\n    return a\nclass C:\n    def m(self, a):\n        return a\nhelper = lambda x: x + 1",
  "tree-sitter-ruby.wasm": "class C\n  def m(a)\n    a\n  end\nend\nmodule M\nend",
  "tree-sitter-javascript.wasm": "function named(a) { return a; }\nclass C { m(a) { return a; } }\nconst f = (a) => a;",
};
const setsCache = new Map<string, ReturnType<typeof deriveNodeSets>>();
async function setsFor(wasmFile: string) {
  const cached = setsCache.get(wasmFile);
  if (cached) return cached;
  const parser = await parserFor(wasmFile);
  const root = parser.parse(SETS_PROBE[wasmFile] ?? "").rootNode as ProbeNode;
  const sets = deriveNodeSets(root);
  setsCache.set(wasmFile, sets);
  return sets;
}
async function factsFor(wasmFile: string, source: string): Promise<readonly EdgeFacts[]> {
  const parser = await parserFor(wasmFile);
  const root = parser.parse(source).rootNode as AstNode;
  return extractTypeDeclFacts(root, await setsFor(wasmFile));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Una vista compacta de un hecho, para que las expectativas se lean como la fuente que las produjo. */
function shape(f: EdgeFacts): string {
  const site = f.fromPath.join(".");
  const target = f.toName === "" ? "-" : [...f.toQualifier, f.toName].join(".");
  return `${site} ${f.decl!.siteForm} ${f.decl!.typeForm} ${target}`;
}
function shapes(facts: readonly EdgeFacts[]): readonly string[] {
  return facts.map(shape);
}

describe("extractTypeDeclFacts — java", () => {
  const WASM = "tree-sitter-java.wasm";
  const SRC = `
class Svc {
  private Repo repo;
  private int count;
  private List<Item> items;
  private Item[] arr;
  Svc(Repo repo) { this.repo = repo; }
  void run(Order order, String name) {
    Order local = order;
    var inferred = new Order();
    for (Item it : items) { }
  }
}
`;

  it("campo, parámetro y variable local, cada uno con su forma de sitio", async () => {
    const got = shapes(await factsFor(WASM, SRC));
    expect(got).toContain("Svc.repo field nominal Repo");
    expect(got).toContain("Svc.run.order parameter nominal Order");
    expect(got).toContain("Svc.run.local local nominal Order");
    // El parámetro del constructor: la gramática no le da nombre propio al
    // constructor, así que el contenedor es la clase.
    expect(got.some((s) => s.endsWith("parameter nominal Repo") && s !== "Svc.run.order parameter nominal Order")).toBe(true);
  });

  it("un primitivo se guarda como HECHO, no como arista ni como hueco", async () => {
    expect(shapes(await factsFor(WASM, SRC))).toContain("Svc.count field primitive -");
  });

  it("un genérico declara su BASE, nunca el elemento — declarar `Item` sería inferir el elemento desde el contenedor", async () => {
    const got = shapes(await factsFor(WASM, SRC));
    expect(got).toContain("Svc.items field nominal List");
    expect(got).not.toContain("Svc.items field nominal Item");
  });

  it("un array no tiene base nominal: `composite`, que NO es `no sé`", async () => {
    expect(shapes(await factsFor(WASM, SRC))).toContain("Svc.arr field composite -");
  });

  it("`var` no es un tipo escrito: cero hechos para ese sitio (es la vía de R2, no ésta)", async () => {
    const got = shapes(await factsFor(WASM, SRC));
    expect(got.some((s) => s.startsWith("Svc.run.inferred "))).toBe(false);
  });

  it("el tipo de retorno de un método NO es una declaración que sostiene un valor — brecha declarada", async () => {
    const got = shapes(await factsFor(WASM, SRC));
    expect(got.some((s) => s.startsWith("Svc.run "))).toBe(false);
  });

  it("el declarado de un `for` mejorado es una variable local con tipo escrito", async () => {
    expect(shapes(await factsFor(WASM, SRC))).toContain("Svc.run.it local nominal Item");
  });
});

describe("extractTypeDeclFacts — csharp", () => {
  const WASM = "tree-sitter-c_sharp.wasm";
  const SRC = `
class Svc {
  private Repo repo;
  private int count;
  public Order Current { get; set; }
  public Svc(Repo repo) { }
  void Run(Order order, string name) {
    Order local = order;
    var inferred = new Order();
    Repo? maybe = null;
  }
}
`;
  it("campo, propiedad, parámetro y local", async () => {
    const got = shapes(await factsFor(WASM, SRC));
    expect(got).toContain("Svc.repo field nominal Repo");
    expect(got).toContain("Svc.count field primitive -");
    expect(got).toContain("Svc.Current field nominal Order");
    expect(got).toContain("Svc.Run.order parameter nominal Order");
    expect(got).toContain("Svc.Run.name parameter primitive -");
    expect(got).toContain("Svc.Run.local local nominal Order");
  });
  it("`Foo?` desenvuelve a `Foo` — un nulable es el mismo valor a los efectos de qué clase es", async () => {
    expect(shapes(await factsFor(WASM, SRC))).toContain("Svc.Run.maybe local nominal Repo");
  });
  it("`var` no produce hecho", async () => {
    expect(shapes(await factsFor(WASM, SRC)).some((s) => s.startsWith("Svc.Run.inferred "))).toBe(false);
  });
});

describe("extractTypeDeclFacts — typescript", () => {
  const WASM = "tree-sitter-typescript.wasm";
  const SRC = `
class Svc {
  private repo: Repo;
  count: number = 0;
  either: Repo | Order;
  maybe: Repo | null;
  bag: { a: number };
  run(order: Order, name: string): void {
    const local: Order = order;
    const untyped = order;
  }
}
`;
  it("campo, parámetro y local, con el envoltorio `type_annotation` desenvuelto", async () => {
    const got = shapes(await factsFor(WASM, SRC));
    expect(got).toContain("Svc.repo field nominal Repo");
    expect(got).toContain("Svc.count field primitive -");
    expect(got).toContain("Svc.run.order parameter nominal Order");
    expect(got).toContain("Svc.run.local local nominal Order");
  });

  it("UNIÓN ESCRITA: dos hechos del MISMO sitio, `union: true` — la multivaluación la declara la SINTAXIS, no una inferencia", async () => {
    const facts = (await factsFor(WASM, SRC)).filter((f) => f.fromPath.join(".") === "Svc.either");
    expect(facts.map((f) => f.toName).sort()).toEqual(["Order", "Repo"]);
    expect(facts.every((f) => f.decl!.union)).toBe(true);
  });

  it("`Repo | null`: el miembro literal no cuenta como alternativa — sigue habiendo UN solo tipo del repo posible", async () => {
    const facts = (await factsFor(WASM, SRC)).filter((f) => f.fromPath.join(".") === "Svc.maybe");
    expect(facts).toHaveLength(1);
    expect(facts[0]!.toName).toBe("Repo");
    expect(facts[0]!.decl!.union).toBe(false);
  });

  it("un tipo objeto no tiene base nominal: `composite`", async () => {
    expect(shapes(await factsFor(WASM, SRC))).toContain("Svc.bag field composite -");
  });

  it("sin anotación no hay hecho — ausencia de tipo NO es tipo ausente", async () => {
    expect(shapes(await factsFor(WASM, SRC)).some((s) => s.startsWith("Svc.run.untyped "))).toBe(false);
  });
});

describe("extractTypeDeclFacts — go", () => {
  const WASM = "tree-sitter-go.wasm";
  const SRC = `
package main
type Svc struct {
  repo Repo
  count int
  items []Item
}
func (s *Svc) Run(o Order, name string) {
  var local Order
  x := Order{}
}
`;
  it("campo de struct, parámetro y variable con tipo escrito", async () => {
    const got = shapes(await factsFor(WASM, SRC));
    expect(got).toContain("Svc.repo field nominal Repo");
    expect(got).toContain("Svc.Run.o parameter nominal Order");
    expect(got).toContain("Svc.Run.local local nominal Order");
  });

  it("EL RECEPTOR de un método es un parámetro con tipo escrito — el sitio que tipa `s` con su propia clase", async () => {
    const got = shapes(await factsFor(WASM, SRC));
    expect(got).toContain("Svc.Run.s parameter nominal Svc");
  });

  it("`int`/`string` son palabras PREDECLARADAS del lenguaje: la gramática de Go no les da nodo propio", async () => {
    const got = shapes(await factsFor(WASM, SRC));
    expect(got).toContain("Svc.count field primitive -");
    expect(got).toContain("Svc.Run.name parameter primitive -");
  });

  it("un slice no tiene base nominal: `composite`", async () => {
    expect(shapes(await factsFor(WASM, SRC))).toContain("Svc.items field composite -");
  });

  it("`:=` no escribe tipo: cero hechos para ese sitio", async () => {
    expect(shapes(await factsFor(WASM, SRC)).some((s) => s.startsWith("Svc.Run.x "))).toBe(false);
  });
});

describe("extractTypeDeclFacts — python (PEP 484/526, anotación OPCIONAL)", () => {
  const WASM = "tree-sitter-python.wasm";
  const SRC = `
class Svc:
    repo: Repo
    count: int = 0
    def __init__(self, repo: Repo, name: str):
        self.conn: Conn = None
    def run(self, order: Order, n: int = 1):
        local: Order = order
        later: "Order" = order
        untyped = order
`;
  it("campo de clase, parámetro anotado y local anotado", async () => {
    const got = shapes(await factsFor(WASM, SRC));
    expect(got).toContain("Svc.repo field nominal Repo");
    expect(got).toContain("Svc.count field primitive -");
    expect(got).toContain("Svc.run.order parameter nominal Order");
    expect(got).toContain("Svc.run.n parameter primitive -");
    expect(got).toContain("Svc.run.local local nominal Order");
  });

  it("`self.conn: Conn` es un campo de la clase ENVOLVENTE, no una local del constructor", async () => {
    expect(shapes(await factsFor(WASM, SRC))).toContain("Svc.conn field nominal Conn");
  });

  it("referencia adelantada de PEP 484 (`x: \"Order\"`) — la gramática la da como `string`", async () => {
    expect(shapes(await factsFor(WASM, SRC))).toContain("Svc.run.later local nominal Order");
  });

  it("sin anotación no hay hecho — es la propiedad del lenguaje que la ola declara, no un bug del extractor", async () => {
    expect(shapes(await factsFor(WASM, SRC)).some((s) => s.startsWith("Svc.run.untyped "))).toBe(false);
  });
});

describe("los dos ceros de LENGUAJE — fixture de `EDGE_KIND_SPECS.absentIn`", () => {
  it("ruby: ninguna declaración expone campo `type` — 0 hechos", async () => {
    const facts = await factsFor(
      "tree-sitter-ruby.wasm",
      "class Svc\n  def initialize(repo)\n    @repo = repo\n  end\n  def run(order)\n    local = order\n  end\nend\n",
    );
    expect(facts).toEqual([]);
  });

  it("javascript: sin anotaciones de tipo en la gramática — 0 hechos", async () => {
    const facts = await factsFor(
      "tree-sitter-javascript.wasm",
      "class Svc {\n  constructor(repo) { this.repo = repo; }\n  run(order) { const local = order; }\n}\n",
    );
    expect(facts).toEqual([]);
  });
});

describe("materializeTypeDeclNodes — identidad del sitio de declaración", () => {
  it("el id del nodo es EXACTAMENTE `carrierNodeId(archivo, [...contenedores, nombre], 0)` — la convergencia con `portador.ts` no es casual", async () => {
    const facts = await factsFor("tree-sitter-java.wasm", "class Svc { private Repo repo; }");
    const nodes = materializeTypeDeclNodes("a/Svc.java", facts);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.id).toBe(carrierNodeId("a/Svc.java", ["Svc", "repo"], 0));
    expect(nodes[0]!.id).toBe(declaraTipoNodeId("a/Svc.java", ["Svc"], "repo"));
    expect(nodes[0]!.kind).toBe("carrier");
    expect(nodes[0]!.carrierForm).toBe("field");
    expect(nodes[0]!.declaredTypeForm).toBe("nominal");
  });

  it("una unión materializa UN solo nodo, no uno por miembro", async () => {
    const facts = await factsFor("tree-sitter-typescript.wasm", "class Svc { either: Repo | Order; }");
    expect(materializeTypeDeclNodes("a/svc.ts", facts)).toHaveLength(1);
  });

  it("el `from` que graba la cascada y el id del nodo son el MISMO string", () => {
    const symId = symbolNodeId("a/Svc.java", ["Svc", "repo"]);
    expect(carrierIdFromSymbolId(symId)).toBe(declaraTipoNodeId("a/Svc.java", ["Svc"], "repo"));
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * DE PUNTA A PUNTA sobre `buildGraph` — la única prueba de que el hecho
 * llega al grafo y de que `declaredTypeOf` contesta los CINCO casos.
 * ════════════════════════════════════════════════════════════════════════ */

function sym(name: string, container: readonly string[], family: SymbolFacts["family"], nodeType: string): SymbolFacts {
  return {
    name,
    container,
    nodeType,
    family,
    memberOfClassLike: container.length > 0,
    namespaceContainerOnly: false,
    startLine: 1,
    endLine: 2,
    nameLine: 1,
    nameColumn: 0,
  };
}

function indexOf(graph: CodeGraph) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const from = new Map<string, typeof graph.edges[number][]>();
  for (const e of graph.edges) {
    const list = from.get(e.from);
    if (list) list.push(e);
    else from.set(e.from, [e]);
  }
  return { nodeById: (id: string) => byId.get(id) ?? null, edgesFrom: (id: string) => from.get(id) ?? [] };
}

describe("declares-type de punta a punta — `buildGraph` + `declaredTypeOf`", () => {
  async function graphFor(): Promise<CodeGraph> {
    const svcFacts = await factsFor(
      "tree-sitter-java.wasm",
      `class Svc {
  private Repo repo;
  private int count;
  private Nowhere missing;
  private Twin twin;
}`,
    );
    const files: GraphFileFacts[] = [
      {
        path: "a/Svc.java",
        language: "java",
        symbols: [sym("Svc", [], "class-like", "class_declaration")],
        references: [],
        edges: svcFacts,
      },
      { path: "a/Repo.java", language: "java", symbols: [sym("Repo", [], "class-like", "class_declaration")], references: [], edges: [] },
      { path: "b/Twin.java", language: "java", symbols: [sym("Twin", [], "class-like", "class_declaration")], references: [], edges: [] },
      { path: "c/Twin.java", language: "java", symbols: [sym("Twin", [], "class-like", "class_declaration")], references: [], edges: [] },
    ];
    return buildGraph(files);
  }

  it("una CLASE DEL REPO: arista al nodo de esa clase", async () => {
    const g = await graphFor();
    const idx = indexOf(g);
    expect(declaredTypeOfDeclaration(idx, "a/Svc.java", ["Svc"], "repo")).toEqual({
      outcome: "class",
      nodeId: symbolNodeId("a/Repo.java", ["Repo"]),
    });
  });

  it("un PRIMITIVO: el hecho se guarda, la arista NO existe — es información, no una falla", async () => {
    const g = await graphFor();
    const idx = indexOf(g);
    expect(declaredTypeOfDeclaration(idx, "a/Svc.java", ["Svc"], "count")).toEqual({ outcome: "primitive" });
    const nodeId = declaraTipoNodeId("a/Svc.java", ["Svc"], "count");
    expect(g.edges.filter((e) => e.kind === "declares-type" && e.from === nodeId)).toEqual([]);
  });

  it("una LIBRERÍA EXTERNA: `unresolved` — miré, hay un nombre escrito, no hay declaración del repo que lo lleve", async () => {
    const g = await graphFor();
    expect(declaredTypeOfDeclaration(indexOf(g), "a/Svc.java", ["Svc"], "missing")).toEqual({ outcome: "unresolved" });
  });

  it("NADIE MIRÓ: `no-fact`, y NUNCA se confunde con `unresolved`", async () => {
    const g = await graphFor();
    expect(declaredTypeOf(indexOf(g), declaraTipoNodeId("a/Svc.java", ["Svc"], "no-existe"))).toEqual({ outcome: "no-fact" });
    expect(declaredTypeOf(indexOf(g), symbolNodeId("a/Svc.java", ["Svc"]))).toEqual({ outcome: "no-fact" });
  });

  it("DOS DECLARACIONES HOMÓNIMAS: `ambiguous` con la lista de destinos, no un tipo elegido a dedo", async () => {
    const g = await graphFor();
    const answer = declaredTypeOfDeclaration(indexOf(g), "a/Svc.java", ["Svc"], "twin");
    expect(answer.outcome).toBe("ambiguous");
    if (answer.outcome !== "ambiguous") return;
    expect([...answer.nodeIds].sort()).toEqual([symbolNodeId("b/Twin.java", ["Twin"]), symbolNodeId("c/Twin.java", ["Twin"])].sort());
    const edge = g.edges.find((e) => e.kind === "declares-type" && e.from === declaraTipoNodeId("a/Svc.java", ["Svc"], "twin"));
    expect(edge!.provenance).toBe("ambiguous");
    expect(edge!.alternatives).toHaveLength(1);
  });

  it("TODA arista `declares-type` nombra dos extremos que están entre los nodos", async () => {
    const g = await graphFor();
    const ids = new Set(g.nodes.map((n) => n.id));
    const colgadas = g.edges.filter((e) => e.kind === "declares-type" && (!ids.has(e.from) || !ids.has(e.to)));
    expect(colgadas).toEqual([]);
  });

  it("un tipo escrito NUNCA apunta a algo que no sea una declaración de tipo", async () => {
    const files: GraphFileFacts[] = [
      {
        path: "a/Svc.java",
        language: "java",
        symbols: [sym("Svc", [], "class-like", "class_declaration")],
        references: [],
        edges: await factsFor("tree-sitter-java.wasm", "class Svc { private Helper h; }"),
      },
      // `Helper` existe en el repo, pero como FUNCIÓN: la respuesta honesta es
      // "no hay clase con ese nombre acá", no una arista a lo primero que
      // comparta el nombre.
      { path: "a/util.java", language: "java", symbols: [sym("Helper", [], "function-like", "method_declaration")], references: [], edges: [] },
    ];
    const g = buildGraph(files);
    expect(declaredTypeOfDeclaration(indexOf(g), "a/Svc.java", ["Svc"], "h")).toEqual({ outcome: "unresolved" });
  });

  it("un repo SIN un solo tipo escrito produce cero aristas y cero nodos nuevos — el camino inerte no cuesta nada", () => {
    const files: GraphFileFacts[] = [
      { path: "a/x.rb", language: "ruby", symbols: [sym("Svc", [], "class-like", "class")], references: [] },
    ];
    const g = buildGraph(files);
    expect(g.edges.filter((e) => e.kind === "declares-type")).toEqual([]);
    expect(g.nodes.filter((n) => n.declaredTypeForm !== undefined)).toEqual([]);
  });
});

describe("resolveDeclaresTypeEdges — colapso multivaluado por SITIO", () => {
  it("una UNIÓN escrita colapsa a UNA arista `ambiguous`, no a dos aristas `declared`", async () => {
    const facts = await factsFor("tree-sitter-typescript.wasm", "class Svc { either: Repo | Order; }");
    const files: GraphFileFacts[] = [
      { path: "a/svc.ts", language: "typescript", symbols: [sym("Svc", [], "class-like", "class_declaration")], references: [], edges: facts },
      { path: "a/repo.ts", language: "typescript", symbols: [sym("Repo", [], "class-like", "class_declaration")], references: [], edges: [] },
      { path: "a/order.ts", language: "typescript", symbols: [sym("Order", [], "class-like", "class_declaration")], references: [], edges: [] },
    ];
    const ctx = buildResolutionContext(files);
    const { edges } = resolveDeclaresTypeEdges(files, ctx);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.provenance).toBe("ambiguous");
    expect([edges[0]!.to, ...(edges[0]!.alternatives ?? [])].sort()).toEqual(
      [symbolNodeId("a/order.ts", ["Order"]), symbolNodeId("a/repo.ts", ["Repo"])].sort(),
    );
  });

  it("una unión donde SÓLO UN miembro es del repo queda como una relación con un destino, no ambigua", async () => {
    const facts = await factsFor("tree-sitter-typescript.wasm", "class Svc { either: Repo | Ajeno; }");
    const files: GraphFileFacts[] = [
      { path: "a/svc.ts", language: "typescript", symbols: [sym("Svc", [], "class-like", "class_declaration")], references: [], edges: facts },
      { path: "a/repo.ts", language: "typescript", symbols: [sym("Repo", [], "class-like", "class_declaration")], references: [], edges: [] },
    ];
    const { edges } = resolveDeclaresTypeEdges(files, buildResolutionContext(files));
    expect(edges).toHaveLength(1);
    expect(edges[0]!.provenance).not.toBe("ambiguous");
    expect(edges[0]!.alternatives).toBeUndefined();
    expect(edges[0]!.to).toBe(symbolNodeId("a/repo.ts", ["Repo"]));
  });
});
