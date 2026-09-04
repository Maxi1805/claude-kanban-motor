/**
 * `propaga-tipo.ts` — `declares-type`, VÍA 2 (la PROPAGACIÓN DESDE EL ORIGEN).
 * Ola R, frente R2.
 *
 * Contra GRAMÁTICAS REALES (`web-tree-sitter` + `tree-sitter-wasms`) y contra
 * la SONDA CENTINELA real de `instanciacion.ts`, por el mismo motivo que
 * `declara-tipo.test.ts`/`portador.test.ts`: este módulo entero es una
 * función de NOMBRES DE CAMPO y TIPOS DE NODO de cada gramática. Un árbol
 * fabricado a mano probaría lo que quien lo escribió imaginó.
 *
 * Los dos lenguajes que la VÍA 1 declara en cero (`ruby`, `javascript`) son
 * acá casos de PRIMERA CLASE: son la razón de existir de esta vía.
 */
import { describe, expect, it } from "vitest";

import { fileUnitFrom, nodeSetsFor, parseRoot } from "../../detect/testing.js";
import type { SymbolFacts } from "../symbols.js";
import { buildGraph, buildResolutionContext, type GraphFileFacts } from "../build.js";
import { carrierNodeId, symbolNodeId, type CodeGraph } from "../types.js";
import {
  declaraTipoNodeId,
  declaredTypeOf,
  declaredTypeOfDeclaration,
  declaredTypeSourceOf,
  extractTypeDeclFacts,
  materializeTypeDeclNodes,
  resolveDeclaresTypeEdges,
} from "./declara-tipo.js";
import { extractor as instanciacionExtractor } from "./instanciacion.js";
import { PROPAGA_TIPO_ID, extractor, instantiationSiteFrom, propagaTipoNodeId } from "./propaga-tipo.js";
import { edgeProfile, registerSentinelProbe } from "./sentinel.js";
import type { EdgeContext, EdgeFacts } from "./types.js";

const WASM: Readonly<Record<string, string>> = {
  typescript: "tree-sitter-typescript.wasm",
  javascript: "tree-sitter-javascript.wasm",
  java: "tree-sitter-java.wasm",
  csharp: "tree-sitter-c_sharp.wasm",
  go: "tree-sitter-go.wasm",
  ruby: "tree-sitter-ruby.wasm",
  python: "tree-sitter-python.wasm",
};

/** Sondas de `deriveNodeSets` — copia deliberada de `instanciacion.test.ts` (mismo motivo documentado allá para el `def m(x)` de Ruby). */
const PROBE: Readonly<Record<string, string>> = {
  typescript: "class Probe { m() { const x = 1; } }",
  javascript: "class Probe { m() { const x = 1; } }",
  java: "class Probe { void m() { int x = 1; } }",
  csharp: "class Probe { void M() { int x = 1; } }",
  go: "package main\nfunc m() {\n\tx := 1\n\t_ = x\n}\n",
  ruby: "class Probe\n  def m(x)\n    x\n  end\nend\n",
  python: "class Probe:\n    def m(self):\n        pass\n",
};

let warmed = false;
/**
 * Calienta la sonda de `instanciacion` — **la de ese extractor, no una
 * propia**: este módulo declara SU MISMO slot a propósito, para que las dos
 * aristas hablen del mismo sitio de construcción. Si esto se desincroniza, el
 * test de abajo ("comparte el slot") se pone en rojo.
 */
async function warmUpAll(): Promise<void> {
  if (warmed) return;
  for (const [lang, src] of Object.entries(instanciacionExtractor.sentinel)) {
    const root = await parseRoot(WASM[lang] ?? "tree-sitter-typescript.wasm", src);
    registerSentinelProbe(lang, instanciacionExtractor.id, root);
  }
  warmed = true;
}

async function ctxFor(language: string): Promise<EdgeContext> {
  await warmUpAll();
  const { carriers } = edgeProfile(language, instanciacionExtractor);
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

async function factsFor(language: string, source: string): Promise<readonly EdgeFacts[]> {
  const file = await fileFor(language, source);
  return extractor.extract(file, await ctxFor(language));
}

/** Vista compacta de un hecho, para que las expectativas se lean como la fuente que las produjo. */
function shape(f: EdgeFacts): string {
  const target = f.toName === "" ? "-" : [...f.toQualifier, f.toName].join(".");
  return `${f.fromPath.join(".")} ${f.decl!.siteForm} ${f.decl!.typeForm} ${target}`;
}
function shapes(facts: readonly EdgeFacts[]): readonly string[] {
  return [...facts.map(shape)].sort();
}

/* ════════════════════════════════════════════════════════════════════════
 * LAS TRES FORMAS DEL ALCANCE, POR LENGUAJE
 * ════════════════════════════════════════════════════════════════════════ */

describe("propaga-tipo — ruby (la vía 1 mide CERO acá: sin campo `type` en la gramática)", () => {
  const SRC = `
class Svc
  def initialize
    @conn = Conn.new
    @cache = {}
    @n = 5
  end
  def run
    local = Repo.new
    k = 5
    s = "a"
  end
end
`;

  it("`@ivar = Constante.new` en el constructor tipa el campo en la CLASE, no en el método", async () => {
    const facts = await factsFor("ruby", SRC);
    expect(shapes(facts)).toContain("Svc.conn field nominal Conn");
  });

  it("`@cache = {}` es COMPUESTO y `@n = 5` es PRIMITIVO — información, no un hueco", async () => {
    const facts = await factsFor("ruby", SRC);
    expect(shapes(facts)).toContain("Svc.cache field composite -");
    expect(shapes(facts)).toContain("Svc.n field primitive -");
  });

  it("una local dentro de un método cuelga del método, no de la clase", async () => {
    const facts = await factsFor("ruby", SRC);
    expect(shapes(facts)).toContain("Svc.run.local local nominal Repo");
    expect(shapes(facts)).toContain("Svc.run.k local primitive -");
    expect(shapes(facts)).toContain("Svc.run.s local primitive -");
  });

  it("el nombre del campo va SIN el `@` — converge con el portador de `invocacion-indirecta.ts`", async () => {
    const facts = await factsFor("ruby", SRC);
    expect(facts.some((f) => f.fromPath.includes("@conn"))).toBe(false);
  });

  it("control negativo: `Foo.build` / `klass.new` NO son construcción (guardia heredada de `instanciacion.ts`)", async () => {
    const facts = await factsFor("ruby", "class S\n  def m\n    a = Foo.build\n    b = klass.new\n  end\nend\n");
    expect(shapes(facts)).toEqual([]);
  });
});

describe("propaga-tipo — javascript (la vía 1 mide CERO acá: el lenguaje no tiene anotaciones)", () => {
  it("`this.x = new Foo()` en el constructor tipa el campo de la clase; `const y = new Foo()` tipa la local", async () => {
    const facts = await factsFor(
      "javascript",
      "class Svc {\n  constructor() { this.conn = new Conn(); this.cache = {}; this.n = 5; }\n  run() { const local = new Repo(); }\n}\n",
    );
    expect(shapes(facts)).toEqual([
      "Svc.conn field nominal Conn",
      "Svc.cache field composite -",
      "Svc.n field primitive -",
      "Svc.run.local local nominal Repo",
    ].sort());
  });

  it("control negativo: una llamada común (sin `new`) no tipa nada", async () => {
    const facts = await factsFor("javascript", "function f() { const x = makeWidget(1); }");
    expect(shapes(facts)).toEqual([]);
  });
});

describe("propaga-tipo — python", () => {
  const SRC = `
class Conn:
    pass

class Svc:
    def __init__(self):
        self.conn = Conn()
        self.cache = {}
        self.n = 5

    def run(self):
        local = Conn()
        k = 5
        arr = []
`;

  it("`self.x = Clase()` en el constructor tipa el campo en TODA la clase", async () => {
    const facts = await factsFor("python", SRC);
    expect(shapes(facts)).toContain("Svc.conn field nominal Conn");
    expect(shapes(facts)).toContain("Svc.cache field composite -");
    expect(shapes(facts)).toContain("Svc.n field primitive -");
  });

  it("una local con origen construido cuelga del método", async () => {
    const facts = await factsFor("python", SRC);
    expect(shapes(facts)).toContain("Svc.run.local local nominal Conn");
    expect(shapes(facts)).toContain("Svc.run.arr local composite -");
  });

  it("BRECHA DECLARADA, heredada de `instanciacion.ts`: una clase que NO está en este archivo no se reconoce como construcción", async () => {
    const facts = await factsFor("python", "class S:\n    def m(self):\n        x = Externa()\n");
    expect(shapes(facts)).toEqual([]);
  });

  it("una tupla (`a, b = X(), Y()`) no se desarma: forma no modelada, sin hecho inventado", async () => {
    const facts = await factsFor("python", "class A:\n    pass\n\nclass S:\n    def m(self):\n        a, b = A(), A()\n");
    expect(shapes(facts)).toEqual([]);
  });
});

describe("propaga-tipo — los cuatro lenguajes con tipo escrito: la vía 2 cubre lo que `var`/`:=` deja sin escribir", () => {
  it("csharp: `var x = new Repo()` — el `variable_declarator` de C# NO nombra ningún campo y aun así se lee", async () => {
    const facts = await factsFor("csharp", "class Svc { void Run() { var local = new Repo(); var k = 5; } }");
    expect(shapes(facts)).toContain("Svc.Run.local local nominal Repo");
  });

  it("java: `var q = new Queue()` (donde la vía 1 no emite, porque `var` no es un tipo escrito)", async () => {
    const facts = await factsFor("java", "class Svc { void run() { var q = new Queue(); } }");
    expect(shapes(facts)).toContain("Svc.run.q local nominal Queue");
  });

  it("go: `x := Order{}` atraviesa el `expression_list` de los dos lados", async () => {
    const facts = await factsFor("go", "package main\ntype Order struct{}\nfunc Run() {\n\tx := Order{}\n\tk := 5\n}\n");
    expect(shapes(facts)).toContain("Run.x local nominal Order");
    expect(shapes(facts)).toContain("Run.k local primitive -");
  });

  it("go control negativo: un literal de slice NO es una construcción nominal — es COMPUESTO", async () => {
    const facts = await factsFor("go", "package main\nfunc Run() {\n\tx := []int{1, 2}\n}\n");
    expect(shapes(facts)).toEqual(["Run.x local composite -"]);
  });

  it("typescript: el campo de clase con inicializador (`repo = new Repo()`) es `field`, no `local`", async () => {
    const facts = await factsFor("typescript", "class Svc {\n  repo = new Repo();\n}\n");
    expect(shapes(facts)).toEqual(["Svc.repo field nominal Repo"]);
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * LAS TRES REGLAS DE LA OLA
 * ════════════════════════════════════════════════════════════════════════ */

describe("REGLA 1 — MULTIVALUADA: dos orígenes distintos NO se colapsan a un candidato", () => {
  it("dos construcciones distintas en el mismo sitio ⇒ DOS hechos con el mismo `fromPath` (que `collapseByFrom` junta en UNA arista ambigua)", async () => {
    const facts = await factsFor(
      "javascript",
      "class S {\n  m(c) { let x = new A(); if (c) { x = new B(); } return x; }\n}\n",
    );
    const own = facts.filter((f) => f.fromPath.join(".") === "S.m.x");
    expect(own.map((f) => f.toName).sort()).toEqual(["A", "B"]);
    expect(own.every((f) => f.decl!.union)).toBe(true);
  });

  it("orígenes que NO coinciden en la FORMA (una clase y un entero) ⇒ NINGÚN hecho: no hay vocabulario para \"una clase o un entero\"", async () => {
    const facts = await factsFor(
      "javascript",
      "class S {\n  m(c) { let x = new A(); if (c) { x = 5; } return x; }\n}\n",
    );
    expect(facts.filter((f) => f.fromPath.join(".") === "S.m.x")).toEqual([]);
  });

  it("dos asignaciones del MISMO origen ⇒ un solo hecho, no dos", async () => {
    const facts = await factsFor(
      "javascript",
      "class S {\n  m(c) { let x = new A(); if (c) { x = new A(); } return x; }\n}\n",
    );
    expect(facts.filter((f) => f.fromPath.join(".") === "S.m.x")).toHaveLength(1);
  });
});

describe("REGLA 2 — `no sé` explícito", () => {
  it("`x = nil`/`null`/`None` NO tipa nada: la ausencia de un valor no es un tipo", async () => {
    expect(shapes(await factsFor("ruby", "class S\n  def m\n    x = nil\n  end\nend\n"))).toEqual([]);
    expect(shapes(await factsFor("javascript", "class S { m() { let x = null; } }"))).toEqual([]);
    expect(shapes(await factsFor("python", "class S:\n    def m(self):\n        x = None\n"))).toEqual([]);
  });

  it("y por eso la inicialización perezosa (`@x = nil` … `@x ||= Foo.new`) SÍ queda tipada, en vez de descartarse por desacuerdo de forma", async () => {
    const facts = await factsFor(
      "ruby",
      "class S\n  def initialize\n    @conn = nil\n  end\n  def conn\n    @conn ||= Conn.new\n  end\nend\n",
    );
    expect(shapes(facts)).toEqual(["S.conn field nominal Conn"]);
  });

  it("un origen que no se reconoce (una fábrica, una expresión compuesta) no produce hecho — nunca un hecho inventado", async () => {
    expect(shapes(await factsFor("javascript", "class S { m() { const x = factory.build(); const y = a + b; } }"))).toEqual([]);
  });

  it("un alias (`y = x`) NO se persigue: es un segundo salto y su costo no se midió", async () => {
    const facts = await factsFor("javascript", "class S { m() { const x = new A(); const y = x; } }");
    expect(shapes(facts)).toEqual(["S.m.x local nominal A"]);
  });
});

describe("REGLA 3 — prohibido inferir por conjunto de miembros", () => {
  it("un objeto con los mismos miembros que una clase del repo NO se tipa con ella: sale COMPUESTO", async () => {
    const facts = await factsFor("javascript", "class Repo { save() {} }\nclass S { m() { const x = { save() {} }; } }\n");
    expect(shapes(facts)).toEqual(["S.m.x local composite -"]);
  });
});

describe("SIN PARÁMETROS — seguir al llamador aporta +3 % medido y no se hace", () => {
  it("un valor por defecto NO tipa el parámetro (el llamador puede pasar otra cosa)", async () => {
    const facts = await factsFor("python", "class Cache:\n    pass\n\ndef run(c=Cache()):\n    pass\n");
    expect(facts.some((f) => f.decl!.siteForm === "parameter")).toBe(false);
    expect(shapes(facts)).toEqual([]);
  });

  it("ningún hecho de este extractor lleva jamás `siteForm: \"parameter\"`", async () => {
    for (const [lang, src] of Object.entries({
      ruby: "class S\n  def m(a = Conn.new)\n    a\n  end\nend\n",
      javascript: "class S { m(a = new Conn()) { return a; } }",
      java: "class S { void m(Conn a) { var b = new Conn(); } }",
    })) {
      const facts = await factsFor(lang, src);
      expect(facts.some((f) => f.decl!.siteForm === "parameter"), lang).toBe(false);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * LA CONVERGENCIA CON LA VÍA 1 — CONTRATO-DECLARA-TIPO.md §5
 * ════════════════════════════════════════════════════════════════════════ */

describe("una sola relación, dos vías", () => {
  it("el id del sitio es EXACTAMENTE el de la vía 1 y el del portador — verificado contra los tres constructores reales", () => {
    const file = "src/Svc.rb";
    const cont = ["Svc"];
    expect(propagaTipoNodeId(file, cont, "conn")).toBe(declaraTipoNodeId(file, cont, "conn"));
    expect(propagaTipoNodeId(file, cont, "conn")).toBe(carrierNodeId(file, [...cont, "conn"], 0));
  });

  it("comparte el SLOT de sonda de `instanciacion` — si ese extractor lo renombra, esto lo sigue solo", () => {
    expect(extractor.slots).toEqual([instanciacionExtractor.slots[0]]);
  });

  it("el `id` LITERAL del disco y la constante exportada son el mismo (`registries.test.ts` lee el disco, no el módulo)", () => {
    expect(extractor.id).toBe(PROPAGA_TIPO_ID);
  });

  it("el `kind` es el mismo y el `extractorId` es propio", async () => {
    const facts = await factsFor("ruby", "class S\n  def m\n    x = Conn.new\n  end\nend\n");
    expect(facts.every((f) => f.kind === "declares-type")).toBe(true);
    expect(facts.every((f) => f.extractorId === PROPAGA_TIPO_ID)).toBe(true);
    expect(facts.every((f) => f.provenance === "inferred")).toBe(true);
  });

  it("`instantiationSiteFrom` recupera el sitio de construcción de cada gramática con sonda", async () => {
    expect(instantiationSiteFrom(await ctxFor("ruby"))).toEqual({ ownerType: "call", targetField: "receiver" });
    expect(instantiationSiteFrom(await ctxFor("python"))).toEqual({ ownerType: "call", targetField: "function" });
    expect(instantiationSiteFrom(await ctxFor("javascript"))).toEqual({ ownerType: "new_expression", targetField: "constructor" });
    expect(instantiationSiteFrom(await ctxFor("go"))).toEqual({ ownerType: "composite_literal", targetField: "type" });
  });

  it("sin sonda para el lenguaje, la vía 2 sigue contestando por LITERALES y nunca por construcción", async () => {
    const file = await fileFor("ruby", "class S\n  def m\n    x = Conn.new\n    y = 5\n  end\nend\n");
    const sinSonda: EdgeContext = { language: "ruby", capabilities: new Set(), carriers: () => [], suppressedRolePaths: [] };
    expect(shapes(extractor.extract(file, sinSonda))).toEqual(["S.m.y local primitive -"]);
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * DE PUNTA A PUNTA, SOBRE `buildGraph` — el tipo escrito GANA
 * ════════════════════════════════════════════════════════════════════════ */

function symFacts(name: string, family: SymbolFacts["family"], container: readonly string[] = []): SymbolFacts {
  return {
    name,
    container,
    family,
    startLine: 1,
    endLine: 2,
    exported: true,
  } as unknown as SymbolFacts;
}

function graphOf(files: readonly GraphFileFacts[]): CodeGraph {
  return buildGraph(files);
}

describe("de punta a punta sobre `buildGraph`", () => {
  it("un sitio propagado produce nodo `carrier` + arista `declares-type` con `provenance: \"inferred\"`", async () => {
    const svc = "src/svc.rb";
    const conn = "src/conn.rb";
    const files: GraphFileFacts[] = [
      {
        path: svc,
        symbols: [symFacts("Svc", "class-like"), symFacts("initialize", "function-like", ["Svc"])],
        references: [],
        edges: await factsFor("ruby", "class Svc\n  def initialize\n    @conn = Conn.new\n  end\nend\n"),
      } as unknown as GraphFileFacts,
      { path: conn, symbols: [symFacts("Conn", "class-like")], references: [], edges: [] } as unknown as GraphFileFacts,
    ];
    const graph = graphOf(files);
    const index = {
      nodeById: (id: string) => graph.nodes.find((n) => n.id === id) ?? null,
      edgesFrom: (id: string) => graph.edges.filter((e) => e.from === id),
    };
    const answer = declaredTypeOfDeclaration(index, svc, ["Svc"], "conn");
    expect(answer).toEqual({ outcome: "class", nodeId: symbolNodeId(conn, ["Conn"]) });
    expect(declaredTypeSourceOf(index, declaraTipoNodeId(svc, ["Svc"], "conn"))).toBe("inferred");
    const edge = graph.edges.find((e) => e.kind === "declares-type");
    expect(edge?.provenance).toBe("inferred");
  });

  it("EL TIPO ESCRITO GANA: si la vía 1 ya habló de ese sitio, la vía 2 no emite para él", async () => {
    const path = "src/Svc.java";
    const src = "class Svc {\n  private Repo repo = new Other();\n}\n";
    const root = await parseRoot(WASM.java!, src);
    const sets = await nodeSetsFor(WASM.java!, PROBE.java!);
    const written = extractTypeDeclFacts(root, sets);
    const propagated = await factsFor("java", src);

    // Las dos vías SÍ hablan del mismo sitio con destinos distintos...
    expect(written.map((f) => `${f.fromPath.join(".")}=${f.toName}`)).toContain("Svc.repo=Repo");
    expect(propagated.map((f) => `${f.fromPath.join(".")}=${f.toName}`)).toContain("Svc.repo=Other");

    // ...y sólo la escrita sobrevive a la materialización.
    const nodes = materializeTypeDeclNodes(path, [...written, ...propagated]);
    const site = nodes.find((n) => n.id === declaraTipoNodeId(path, ["Svc"], "repo"));
    expect(site?.declaredTypeProvenance).toBe("declared");

    const ctx = buildResolutionContext([
      { path, symbols: [symFacts("Svc", "class-like"), symFacts("repo", "other", ["Svc"])], references: [] } as unknown as GraphFileFacts,
      { path: "src/Repo.java", symbols: [symFacts("Repo", "class-like")], references: [] } as unknown as GraphFileFacts,
      { path: "src/Other.java", symbols: [symFacts("Other", "class-like")], references: [] } as unknown as GraphFileFacts,
    ]);
    const { edges } = resolveDeclaresTypeEdges([{ path, edges: [...written, ...propagated] }], ctx);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.to).toBe(symbolNodeId("src/Repo.java", ["Repo"]));
    expect(edges[0]!.provenance).not.toBe("inferred");
  });

  it("un sitio propagado cuyo nombre NO es una clase del repo queda en `unresolved` — el `no sé` explícito, no un hueco", async () => {
    const path = "src/svc.rb";
    const files: GraphFileFacts[] = [
      {
        path,
        symbols: [symFacts("Svc", "class-like"), symFacts("initialize", "function-like", ["Svc"])],
        references: [],
        edges: await factsFor("ruby", "class Svc\n  def initialize\n    @conn = Externa.new\n  end\nend\n"),
      } as unknown as GraphFileFacts,
    ];
    const graph = graphOf(files);
    const index = {
      nodeById: (id: string) => graph.nodes.find((n) => n.id === id) ?? null,
      edgesFrom: (id: string) => graph.edges.filter((e) => e.from === id),
    };
    expect(declaredTypeOfDeclaration(index, path, ["Svc"], "conn")).toEqual({ outcome: "unresolved" });
  });

  it("un campo con origen PRIMITIVO contesta `primitive` y NO cuelga ninguna arista", async () => {
    const path = "src/svc.rb";
    const files: GraphFileFacts[] = [
      {
        path,
        symbols: [symFacts("Svc", "class-like"), symFacts("initialize", "function-like", ["Svc"])],
        references: [],
        edges: await factsFor("ruby", "class Svc\n  def initialize\n    @n = 0\n  end\nend\n"),
      } as unknown as GraphFileFacts,
    ];
    const graph = graphOf(files);
    const index = {
      nodeById: (id: string) => graph.nodes.find((n) => n.id === id) ?? null,
      edgesFrom: (id: string) => graph.edges.filter((e) => e.from === id),
    };
    const id = declaraTipoNodeId(path, ["Svc"], "n");
    expect(declaredTypeOf(index, id)).toEqual({ outcome: "primitive" });
    expect(declaredTypeSourceOf(index, id)).toBe("inferred");
    expect(graph.edges.filter((e) => e.kind === "declares-type")).toEqual([]);
  });

  it("ninguna arista `declares-type` queda colgada: los dos extremos son nodos del grafo", async () => {
    const svc = "src/svc.rb";
    const conn = "src/conn.rb";
    const graph = graphOf([
      {
        path: svc,
        symbols: [symFacts("Svc", "class-like"), symFacts("initialize", "function-like", ["Svc"])],
        references: [],
        edges: await factsFor("ruby", "class Svc\n  def initialize\n    @conn = Conn.new\n  end\nend\n"),
      } as unknown as GraphFileFacts,
      { path: conn, symbols: [symFacts("Conn", "class-like")], references: [], edges: [] } as unknown as GraphFileFacts,
    ]);
    const ids = new Set(graph.nodes.map((n) => n.id));
    for (const e of graph.edges.filter((x) => x.kind === "declares-type")) {
      expect(ids.has(e.from), `from colgado: ${e.from}`).toBe(true);
      expect(ids.has(e.to), `to colgado: ${e.to}`).toBe(true);
    }
  });
});
