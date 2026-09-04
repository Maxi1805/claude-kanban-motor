/**
 * `cadena-identidad` (arista `stores`) — Ola R, frente R3.
 *
 * Tres bloques, y ninguno es decorativo:
 *
 *  1. **LA SONDA**, contra las 9 gramáticas reales. Fija la tabla medida
 *     (declarador · profundidad · nodo de construcción · campo del tipo) que
 *     el docstring del módulo publica: si una gramática cambia de forma, este
 *     bloque lo dice con nombre y apellido en vez de dejar que el extractor
 *     emita cero en silencio. Y comprueba el invariante que impide colgar
 *     aristas: el declarador que la sonda recupera tiene que ser uno de los
 *     que `graph/symbols.ts` MINTA como nodo.
 *  2. **LA EXTRACCIÓN**, por lenguaje, con su control negativo al lado. Los
 *     negativos son la mitad del valor: un binding local, una fábrica, una
 *     construcción dentro de una lambda y una construcción a más profundidad
 *     que la que la gramática permite NO son "guarda".
 *  3. **LA REGLA MULTIVALUADA** (`markAmbiguousStores`), incluido el caso que
 *     el encargo nombra explícitamente: *un binding asignado en dos lugares
 *     tiene DOS orígenes, y eso viaja como ambiguo, no colapsado.*
 */
import { describe, expect, it } from "vitest";

import { fileUnitFrom, nodeSetsFor, parseRoot } from "../../detect/testing.js";
import { AMBIGUOUS_MAX_TARGETS } from "../stages.js";
import type { CodeGraphEdge } from "../types.js";
import { extractor, markAmbiguousStores, warmUp } from "./cadena-identidad.js";
import type { CarrierPath } from "./sentinel.js";
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

/**
 * Sondas para `deriveNodeSets`. **Más anchas que las de `instanciacion.test.ts`
 * a propósito, y el motivo es una medición, no una preferencia:** con la sonda
 * mínima de ese archivo (`class Probe { m() { … } }`) el conjunto
 * `functionNodes` de la familia JS/TS sale con `method_definition` y SIN
 * `function_declaration`, así que una función suelta no cuenta como scope y el
 * control negativo "un binding LOCAL no dispara" pasaba en verde por el motivo
 * equivocado. Las sondas de producción (`code-analyzer.ts#TS_FAMILY_PROBE` y
 * compañía) sí ejercitan las dos formas; éstas las siguen en lo que este
 * extractor necesita: una función de nivel superior Y un método.
 */
const PROBE: Readonly<Record<string, string>> = {
  typescript: "function probeFn(a) { const x = 1; }\nconst probeArrow = (x) => x;\nclass Probe { m() { const y = 1; } }",
  tsx: "function probeFn(a) { const x = 1; }\nconst probeArrow = (x) => x;\nclass Probe { m() { const y = 1; } }",
  vue: "function probeFn(a) { const x = 1; }\nconst probeArrow = (x) => x;\nclass Probe { m() { const y = 1; } }",
  javascript: "function probeFn(a) { const x = 1; }\nconst probeArrow = (x) => x;\nclass Probe { m() { const y = 1; } }",
  java: "class Probe { void m() { int x = 1; } }",
  csharp: "class Probe { void M() { int x = 1; } }",
  go: "package main\nfunc m() {\n\tx := 1\n\t_ = x\n}\n",
  ruby: "def probeFn(x)\n  x\nend\n\nclass Probe\n  def m(x)\n    x\n  end\nend\n",
  python: "def probe_fn(a):\n    pass\n\n\nclass Probe:\n    def m(self):\n        pass\n",
};

const carriersByLanguage = new Map<string, readonly CarrierPath[]>();

async function carriersFor(language: string): Promise<readonly CarrierPath[]> {
  const cached = carriersByLanguage.get(language);
  if (cached) return cached;
  const root = await parseRoot(WASM[language]!, extractor.sentinel[language]!);
  const { carriers } = warmUp(language, root);
  carriersByLanguage.set(language, carriers);
  return carriers;
}

async function ctxFor(language: string): Promise<EdgeContext> {
  const carriers = await carriersFor(language);
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

async function extract(language: string, source: string) {
  const file = await fileFor(language, source);
  const ctx = await ctxFor(language);
  return extractor.extract(file, ctx);
}

/* ═══ 1. LA SONDA ═════════════════════════════════════════════════════════ */

/** Mismo vocabulario que `graph/symbols.ts` usa para decidir qué declarador se
 *  convierte en NODO — repetido acá a propósito: es el invariante que impide
 *  emitir una arista desde un id que no existe. */
const DECLARADORES_CON_NODO = new Set(["variable_declarator", "assignment", "var_spec", "const_spec", "type_spec"]);

/** La tabla MEDIDA que el docstring del módulo publica. Fijarla acá es lo que
 *  la vuelve una medición reproducible y no una nota de prosa. */
const FORMA_ESPERADA: Readonly<Record<string, { decl: string; depth: number; ctor: string; typeField: string }>> = {
  typescript: { decl: "variable_declarator", depth: 1, ctor: "new_expression", typeField: "constructor" },
  tsx: { decl: "variable_declarator", depth: 1, ctor: "new_expression", typeField: "constructor" },
  vue: { decl: "variable_declarator", depth: 1, ctor: "new_expression", typeField: "constructor" },
  javascript: { decl: "variable_declarator", depth: 1, ctor: "new_expression", typeField: "constructor" },
  java: { decl: "variable_declarator", depth: 1, ctor: "object_creation_expression", typeField: "type" },
  csharp: { decl: "variable_declarator", depth: 2, ctor: "object_creation_expression", typeField: "type" },
  go: { decl: "var_spec", depth: 2, ctor: "composite_literal", typeField: "type" },
  ruby: { decl: "assignment", depth: 1, ctor: "call", typeField: "receiver" },
  python: { decl: "assignment", depth: 1, ctor: "call", typeField: "function" },
};

describe("cadena-identidad · la sonda", () => {
  it("declara sonda para los 9 lenguajes soportados", () => {
    expect(Object.keys(extractor.sentinel).sort()).toEqual(Object.keys(WASM).sort());
  });

  for (const [language, esperada] of Object.entries(FORMA_ESPERADA)) {
    it(`${language}: recupera declarador, profundidad, nodo de construcción y campo del tipo`, async () => {
      const [carrier] = await carriersFor(language);
      expect(carrier, `la sonda de ${language} no recuperó ningún camino`).toBeDefined();
      expect(carrier!.ownerType).toBe(esperada.decl);
      expect(carrier!.steps.length - 1).toBe(esperada.depth);
      expect(carrier!.steps[carrier!.steps.length - 2]!.nodeType).toBe(esperada.ctor);
      expect(carrier!.steps[carrier!.steps.length - 1]!.field).toBe(esperada.typeField);
    });
  }

  it("INVARIANTE: todo declarador recuperado es uno de los que `graph/symbols.ts` minta como nodo — si no, la arista quedaría colgada", async () => {
    for (const language of Object.keys(FORMA_ESPERADA)) {
      const [carrier] = await carriersFor(language);
      expect(DECLARADORES_CON_NODO.has(carrier!.ownerType), `${language}: ${carrier!.ownerType}`).toBe(true);
    }
  });
});

/* ═══ 2. LA EXTRACCIÓN ════════════════════════════════════════════════════ */

describe("cadena-identidad · extracción por lenguaje", () => {
  it("typescript: un binding de módulo inicializado con una construcción", async () => {
    const facts = await extract("typescript", "const registry = new Registry(1);\n");
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      kind: "stores",
      fromPath: ["registry"],
      toName: "Registry",
      toQualifier: [],
      provenance: "declared",
    });
  });

  it("javascript: misma forma, misma arista", async () => {
    const facts = await extract("javascript", "const registry = new Registry();\n");
    expect(facts.map((f) => [f.fromPath.join("."), f.toName])).toEqual([["registry", "Registry"]]);
  });

  it("java: el campo `INSTANCE` de una clase — la forma canónica de Singleton, hoy invisible", async () => {
    const facts = await extract(
      "java",
      "class Holder {\n  static final Holder INSTANCE = new Holder();\n  private Holder() {}\n}\n",
    );
    expect(facts.map((f) => [f.fromPath.join("."), f.toName])).toEqual([["Holder.INSTANCE", "Holder"]]);
  });

  it("go: un `var` de paquete inicializado con un literal de struct", async () => {
    const facts = await extract("go", 'package main\n\nvar registry = Registry{Name: "a"}\n');
    expect(facts.map((f) => [f.fromPath.join("."), f.toName])).toEqual([["registry", "Registry"]]);
  });

  it("python: una asignación de nivel de clase cuyo callee es una clase declarada en este archivo", async () => {
    const facts = await extract("python", "class Holder:\n    pass\n\n\nclass Reg:\n    INSTANCE = Holder()\n");
    expect(facts.map((f) => [f.fromPath.join("."), f.toName])).toEqual([["Reg.INSTANCE", "Holder"]]);
  });

  it("ruby: una asignación de nivel de clase con el mensaje `new`", async () => {
    const facts = await extract("ruby", "class Holder\n  INSTANCE = Holder.new\nend\n");
    expect(facts.map((f) => [f.fromPath.join("."), f.toName])).toEqual([["Holder.INSTANCE", "Holder"]]);
  });

  it("ruby: receptor calificado (`Sub::Gadget.new`) — nombre y calificador se separan, igual que en `instantiates`", async () => {
    const facts = await extract("ruby", "class Holder\n  INSTANCE = Sub::Gadget.new\nend\n");
    expect(facts[0]).toMatchObject({ toName: "Gadget", toQualifier: ["Sub"] });
  });

  it("java: los argumentos de tipo se pelan (`new ArrayList<Foo>()` ⇒ `ArrayList`) — misma vara que `instantiates`", async () => {
    const facts = await extract("java", "class F {\n  static Object cache = new ArrayList<Foo>();\n}\n");
    expect(facts.map((f) => f.toName)).toEqual(["ArrayList"]);
  });

  /**
   * *** CERO DECLARADO, NO ESCONDIDO. *** No es que C# no tenga la
   * construcción: es que `graph/symbols.ts` no minta el nodo del binding
   * (su `variable_declarator` lleva el identificador en posición 0, sin
   * campo, y la regla de nombre es `name ?? left`). Sin nodo `from`, emitir
   * sería colgar la arista. Medido en el corpus: newtonsoft-json tiene 0
   * nodos `symbol` con `family: "other"` en todo el repo.
   */
  it("csharp: CERO, y por la razón declarada — el nodo del binding no existe en el grafo", async () => {
    const facts = await extract("csharp", "class F { static object cache = new Registry(); }");
    expect(facts).toHaveLength(0);
  });
});

describe("cadena-identidad · controles negativos", () => {
  it("un binding LOCAL no dispara: no es nodo del grafo", async () => {
    expect(await extract("typescript", "function f() { const x = new Registry(); }\n")).toHaveLength(0);
  });

  it("un binding de módulo inicializado por una FÁBRICA no dispara: no hay construcción escrita", async () => {
    expect(await extract("typescript", "const registry = makeRegistry();\n")).toHaveLength(0);
  });

  it("una construcción dentro de una lambda no dispara: se construye cuando la lambda corre, no al inicializar", async () => {
    expect(await extract("typescript", "const factory = () => new Registry();\n")).toHaveLength(0);
  });

  it("un argumento de constructor no dispara por su cuenta: lo guarda el constructor, no el binding", async () => {
    const facts = await extract("typescript", "const a = new Outer(new Inner());\n");
    expect(facts.map((f) => f.toName)).toEqual(["Outer"]);
  });

  it("PROFUNDIDAD DERIVADA: `X = [Foo()]` en python NO dispara — el binding guarda una lista, no un `Foo`", async () => {
    const facts = await extract("python", "class Foo:\n    pass\n\n\nREG = [Foo()]\n");
    expect(facts).toHaveLength(0);
  });

  it("go: un literal de slice/map no es una construcción de tipo del repo", async () => {
    expect(await extract("go", "package main\n\nvar registry = []int{1, 2}\n")).toHaveLength(0);
    expect(await extract("go", "package main\n\nvar registry = map[string]int{}\n")).toHaveLength(0);
  });

  it("ruby: `Foo.create` no es construcción — su mensaje no es `new` (y `create` NUNCA se nombra en la lógica)", async () => {
    expect(await extract("ruby", "class Holder\n  INSTANCE = Holder.create\nend\n")).toHaveLength(0);
  });

  it("python: un callee que no es una clase declarada en este archivo no dispara", async () => {
    expect(await extract("python", "REG = helper()\n")).toHaveLength(0);
  });

  it("sin sonda para el lenguaje ⇒ cero hechos, nunca una excepción", async () => {
    const file = await fileFor("typescript", "const registry = new Registry();\n");
    const ctx: EdgeContext = { language: "typescript", capabilities: new Set(), carriers: () => [], suppressedRolePaths: [] };
    expect(extractor.extract(file, ctx)).toHaveLength(0);
  });
});

describe("cadena-identidad · el registro", () => {
  it("id/kind/optional/slots como los declara el contrato de `EdgeExtractor`", () => {
    expect(extractor.id).toBe("cadena-identidad");
    expect(extractor.kind).toBe("stores");
    expect(extractor.needs).toEqual([]);
    expect(extractor.optional).toBe(true);
    expect(extractor.slots).toHaveLength(1);
  });

  it("todo hecho emitido declara su propio `extractorId` y `kind` — `isTrustworthyEdgeFact` de `build.ts` lo exige", async () => {
    const facts = await extract("typescript", "const registry = new Registry();\n");
    for (const f of facts) {
      expect(f.extractorId).toBe(extractor.id);
      expect(f.kind).toBe("stores");
    }
  });

  it("`via` describe la forma de la que salió: declarador → nodo de construcción . campo", async () => {
    const [fact] = await extract("typescript", "const registry = new Registry();\n");
    expect(fact!.via).toBe("variable_declarator->new_expression.constructor");
  });
});

/* ═══ 3. LA REGLA MULTIVALUADA ════════════════════════════════════════════ */

function storeEdge(from: string, to: string, weight = 1): CodeGraphEdge {
  return { from, to, kind: "stores", provenance: "resolved", weight };
}

describe("cadena-identidad · multivaluada (markAmbiguousStores)", () => {
  it("EL CASO DEL ENCARGO: un binding con DOS orígenes distintos viaja como ambiguo, no colapsado a un tipo", async () => {
    // Extracción real: las dos ramas del ternario están a profundidad 1 en TS.
    const facts = await extract("typescript", "const conn = flag ? new Tcp() : new Udp();\n");
    expect(facts.map((f) => f.toName).sort()).toEqual(["Tcp", "Udp"]);
    expect(new Set(facts.map((f) => f.fromPath.join(".")))).toEqual(new Set(["conn"]));

    // Y así viaja al grafo, una vez resueltos los dos destinos.
    const marcadas = markAmbiguousStores([storeEdge("sym:a.ts#conn", "sym:b.ts#Udp"), storeEdge("sym:a.ts#conn", "sym:b.ts#Tcp")]);
    expect(marcadas).toHaveLength(1);
    expect(marcadas[0]).toMatchObject({
      from: "sym:a.ts#conn",
      to: "sym:b.ts#Tcp", // primer destino en orden lexicográfico, determinista
      provenance: "ambiguous",
      alternatives: ["sym:b.ts#Udp"],
      weight: 2,
    });
  });

  it("un binding con UN solo destino queda intacto — y la lista se devuelve tal cual, sin copiarla", () => {
    const edges = [storeEdge("sym:a.ts#x", "sym:b.ts#T"), storeEdge("sym:a.ts#y", "sym:b.ts#U")];
    expect(markAmbiguousStores(edges)).toBe(edges);
  });

  it("no toca ningún otro `kind`", () => {
    const otras: CodeGraphEdge[] = [
      { from: "a", to: "b", kind: "instantiates", provenance: "declared", weight: 1 },
      { from: "a", to: "c", kind: "references", provenance: "resolved", weight: 3 },
    ];
    const edges = [...otras, storeEdge("sym:a.ts#x", "sym:b.ts#T"), storeEdge("sym:a.ts#x", "sym:b.ts#U")];
    const out = markAmbiguousStores(edges);
    expect(out.filter((e) => e.kind !== "stores")).toEqual(otras);
  });

  it("más destinos que `AMBIGUOUS_MAX_TARGETS` no es información: no se emite ninguna arista para ese binding", () => {
    const edges = Array.from({ length: AMBIGUOUS_MAX_TARGETS + 1 }, (_, i) => storeEdge("sym:a.ts#x", `sym:b.ts#T${i}`));
    expect(markAmbiguousStores([...edges, storeEdge("sym:a.ts#y", "sym:b.ts#U")]).map((e) => e.from)).toEqual(["sym:a.ts#y"]);
  });

  it("`alternatives` nunca incluye al propio `to`, y va en orden lexicográfico", () => {
    const out = markAmbiguousStores([
      storeEdge("sym:a.ts#x", "sym:b.ts#C"),
      storeEdge("sym:a.ts#x", "sym:b.ts#A"),
      storeEdge("sym:a.ts#x", "sym:b.ts#B"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.to).toBe("sym:b.ts#A");
    expect(out[0]!.alternatives).toEqual(["sym:b.ts#B", "sym:b.ts#C"]);
  });

  it("dos bindings DISTINTOS con el mismo tipo no se confunden entre sí", () => {
    const edges = [storeEdge("sym:a.ts#x", "sym:b.ts#T"), storeEdge("sym:a.ts#y", "sym:b.ts#T")];
    expect(markAmbiguousStores(edges)).toBe(edges);
  });
});
