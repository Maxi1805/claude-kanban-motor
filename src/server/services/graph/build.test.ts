/**
 * `graph/build.ts` — end-to-end over REAL Ruby grammar (small, self-contained
 * sources, no corpus needed): proves `buildGraph` wires `extractSymbols` +
 * `extractReferences` + `resolveReferences` into a coherent `CodeGraph` with
 * correct node ids, `contains` structure, and at least one real
 * `bare-constant-receiver` "references" edge (`PathManager.join`) plus one
 * correctly-UNresolved `each`-style hub case (class-member rule).
 */
import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { deriveNodeSets, type DerivedNodeSets, type ProbeNode } from "../code-grammar.js";
import type { AstNode } from "../detect/types.js";
import type { EdgeFacts } from "./edges/types.js";
import type { ReferenceFacts } from "./references.js";
import { extractReferences } from "./references.js";
import type { SymbolFacts } from "./symbols.js";
import { extractSymbols } from "./symbols.js";
import { buildCandidates, buildGraph, buildResolutionContext, type GraphFileFacts } from "./build.js";

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
let rubyParser: Promise<any> | null = null;
function parser(): Promise<any> {
  rubyParser ??= (async () => {
    const { Parser, Language } = await loadRuntime();
    const wasm = path.join(path.dirname(require.resolve("tree-sitter-wasms/package.json")), "out", "tree-sitter-ruby.wasm");
    const language = await Language.load(wasm);
    const p = new Parser();
    p.setLanguage(language);
    return p;
  })();
  return rubyParser;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const RUBY_PROBE = `
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
end
`;

async function facts(filesSource: Record<string, string>): Promise<GraphFileFacts[]> {
  const p = await parser();
  const probeRoot = p.parse(RUBY_PROBE).rootNode as unknown as ProbeNode;
  const sets: DerivedNodeSets = deriveNodeSets(probeRoot);
  const out: GraphFileFacts[] = [];
  for (const [file, src] of Object.entries(filesSource)) {
    const root = p.parse(src).rootNode as unknown as AstNode;
    out.push({
      path: file,
      language: "ruby",
      symbols: extractSymbols(root, sets),
      references: extractReferences(root, sets),
    });
  }
  return out;
}

describe("buildGraph — contains", () => {
  it("arma carpetas, archivos y símbolos anidados con ids sym:<file>#<path>", async () => {
    const files = await facts({
      "lib/path_manager.rb": `
class PathManager
  def self.join(a, b)
    "#{a}/#{b}"
  end
end
`,
    });
    const graph = buildGraph(files);
    const ids = graph.nodes.map((n) => n.id);
    expect(ids).toContain("folder:lib");
    expect(ids).toContain("file:lib/path_manager.rb");
    expect(ids).toContain("sym:lib/path_manager.rb#PathManager");
    expect(ids).toContain("sym:lib/path_manager.rb#PathManager.join");

    const contains = graph.edges.filter((e) => e.kind === "contains");
    expect(contains).toContainEqual(
      expect.objectContaining({ from: "file:lib/path_manager.rb", to: "sym:lib/path_manager.rb#PathManager" }),
    );
    expect(contains).toContainEqual(
      expect.objectContaining({ from: "sym:lib/path_manager.rb#PathManager", to: "sym:lib/path_manager.rb#PathManager.join" }),
    );
    for (const e of contains) {
      expect(e.provenance).toBe("declared");
      expect(e.weight).toBe(1);
    }
  });
});

describe("buildGraph — references, cascada real", () => {
  it("resuelve PathManager.join vía bare-constant-receiver, cross-file", async () => {
    const files = await facts({
      "lib/path_manager.rb": `
class PathManager
  def self.join(a, b)
    "#{a}/#{b}"
  end
end
`,
      "lib/site.rb": `
class Site
  def render
    PathManager.join("a", "b")
  end
end
`,
    });
    const graph = buildGraph(files);
    // CONTRATO-F8G.md §3.1 (F1, `graph/references.ts`): `PathManager.join(...)`
    // fills the callee position (Ruby's `call` node conflates receiver+method
    // +arguments in one node — CASE A of `isCallee`'s docstring), so this
    // edge is now partitioned into `calls`, not `references` — the exact
    // ripple this file's own docstring anticipated ("hasta que F1 empiece a
    // producir `isCallee`"). Same `bare-constant-receiver` resolution either
    // way; only the `kind` changes.
    const calls = graph.edges.filter((e) => e.kind === "calls");
    expect(calls).toContainEqual(
      expect.objectContaining({
        from: "sym:lib/site.rb#Site.render",
        to: "sym:lib/path_manager.rb#PathManager.join",
        provenance: "resolved",
        resolvedBy: "bare-constant-receiver",
      }),
    );
    expect(graph.edges.filter((e) => e.kind === "references").some((e) => e.to === "sym:lib/path_manager.rb#PathManager.join")).toBe(false);
    expect(graph.resolution.resolved).toBeGreaterThanOrEqual(1);
    expect(graph.resolution.candidates).toBeGreaterThanOrEqual(graph.resolution.resolved);
  });

  it("NO resuelve una llamada bare a un método miembro de otra clase (el hub falso de 'each')", async () => {
    const files = await facts({
      "lib/collection.rb": `
class Collection
  def each
    yield 1
  end
end
`,
      "lib/unrelated.rb": `
class Unrelated
  def process
    each
  end
end
`,
    });
    const graph = buildGraph(files);
    const refs = graph.edges.filter((e) => e.kind === "references");
    expect(refs.find((e) => e.to === "sym:lib/collection.rb#Collection.each")).toBeUndefined();

    const stat = graph.resolution.byStage.find((s) => s.stage === "class-member")!;
    expect(stat.rejected).toBeGreaterThanOrEqual(1);
  });

  it("la suma de candidatos y buckets respeta la invariante de medibilidad", async () => {
    const files = await facts({
      "lib/path_manager.rb": `
class PathManager
  def self.join(a, b)
    "#{a}/#{b}"
  end
end
`,
      "lib/site.rb": `
class Site
  def render
    PathManager.join("a", "b")
    array.join(",")
  end
end
`,
    });
    const graph = buildGraph(files);
    const { resolution } = graph;
    const rejectedTotal = resolution.byStage.reduce((n, s) => n + s.rejected, 0);
    // Todo candidato: resolved, o rechazado en alguna etapa (sumado en rejectedTotal), o
    // droppedAmbiguous, o unresolved — sin solapes.
    expect(resolution.resolved + rejectedTotal + resolution.droppedAmbiguous + resolution.unresolved).toBe(
      resolution.candidates,
    );
  });
});

describe("buildCandidates — gemelo de árbol paralelo (decl-name vs. reapertura de clase por lenguaje)", () => {
  /** Símbolo de clase mínimo, sin depender de parsear nada — sólo los campos que `buildCandidates` mira. */
  function classSymbol(name: string): SymbolFacts {
    return {
      name,
      container: [],
      nodeType: "class_declaration",
      family: "class-like",
      memberOfClassLike: false,
      namespaceContainerOnly: false,
      startLine: 1,
      endLine: 10,
      nameLine: 1,
      nameColumn: 1,
    };
  }
  /** El `decl-name` que `extractReferences` emite en el sitio EXACTO de la declaración de una clase top-level: `scope` vacío, `name` = el de la clase. */
  function declNameRef(name: string): ReferenceFacts {
    return {
      name,
      role: "decl-name",
      scope: [],
      qualifier: null,
      qualifierIsBareConstant: false,
      shadowedLocally: false,
      line: 1,
      column: 1,
      occurrences: 1,
    };
  }

  it("Java: dos archivos que declaran la MISMA clase (árbol paralelo, ej. guava android/) NO generan candidato entre sus decl-name — Java no reabre clases", () => {
    const files: GraphFileFacts[] = [
      { path: "guava/src/Foo.java", language: "java", symbols: [classSymbol("Foo")], references: [declNameRef("Foo")] },
      { path: "android/guava/src/Foo.java", language: "java", symbols: [classSymbol("Foo")], references: [declNameRef("Foo")] },
    ];
    const candidates = buildCandidates(files);
    // Ninguno de los dos decl-name de "Foo" produce un candidato: su única
    // declaración "hermana" es el gemelo de árbol paralelo, y Java no
    // reabre clases — sin esto, `global-uniqueness` (etapa 8) aceptaría
    // trivialmente ese gemelo como si la declaración "usara" algo (ver el
    // docstring de `buildCandidatesForFile`).
    expect(candidates.filter((c) => c.from.ref.role === "decl-name")).toHaveLength(0);
  });

  it("Ruby: dos archivos que reabren la MISMA clase SÍ generan candidato — Ruby permite `class Foo` repetido", () => {
    const files: GraphFileFacts[] = [
      { path: "lib/foo.rb", language: "ruby", symbols: [classSymbol("Foo")], references: [declNameRef("Foo")] },
      { path: "lib/foo_ext.rb", language: "ruby", symbols: [classSymbol("Foo")], references: [declNameRef("Foo")] },
    ];
    const candidates = buildCandidates(files);
    const declCandidates = candidates.filter((c) => c.from.ref.role === "decl-name");
    expect(declCandidates).toHaveLength(2);
    for (const c of declCandidates) {
      expect(c.targets).toHaveLength(1); // el OTRO archivo, no el propio
      expect(c.targets[0]!.file).not.toBe(c.from.file);
    }
  });

  it("un USO real (no decl-name) del mismo nombre sigue siendo candidato en Java aunque coincida con el symbolPath de un gemelo", () => {
    const bareUse: ReferenceFacts = { ...declNameRef("Foo"), role: "bare" };
    const files: GraphFileFacts[] = [
      { path: "guava/src/Foo.java", language: "java", symbols: [classSymbol("Foo")], references: [] },
      { path: "android/guava/src/Foo.java", language: "java", symbols: [classSymbol("Foo")], references: [] },
      { path: "guava/src/Caller.java", language: "java", symbols: [], references: [bareUse] },
    ];
    const candidates = buildCandidates(files);
    const bareCandidate = candidates.find((c) => c.from.file === "guava/src/Caller.java");
    expect(bareCandidate).toBeDefined();
    expect(bareCandidate!.targets.length).toBeGreaterThanOrEqual(1); // sigue siendo candidato: SÍ podría ser un uso genuino
  });

  it("GENERALIZADO — una auto-referencia de rol `bare` (no `decl-name`) al propio nombre de clase, EMITIDA DESDE UNO de los archivos gemelo, tampoco genera candidato — repro real: `public enum CaseFormat` en android/guava resuelve a sí mismo con role bare, no decl-name", () => {
    // Mismo repro que el bug medido en guava (android/.../CaseFormat.java
    // línea 34, columna 12: el token de nombre del propio `enum` en su
    // encabezado llega con role "bare", no "decl-name" — `references.ts` no
    // lo clasifica como auto-declaración). Antes de este fix, el mismo-archivo
    // se excluía (auto-referencia), pero el gemelo cross-file NO (la guarda
    // vieja sólo miraba `role === "decl-name"`), así que `global-uniqueness`
    // aceptaba trivialmente el gemelo como si la propia clase "usara" su
    // gemelo — 508/1412 aristas `global-uniqueness` cruzaban árbol en el
    // corpus real de guava antes de este cambio (451 de ellas, este patrón
    // exacto).
    const selfHeaderBareRef: ReferenceFacts = { ...declNameRef("CaseFormat"), role: "bare" };
    const files: GraphFileFacts[] = [
      { path: "guava/src/CaseFormat.java", language: "java", symbols: [classSymbol("CaseFormat")], references: [selfHeaderBareRef] },
      {
        path: "android/guava/src/CaseFormat.java",
        language: "java",
        symbols: [classSymbol("CaseFormat")],
        references: [selfHeaderBareRef],
      },
    ];
    const candidates = buildCandidates(files);
    // Ningún candidato: cada archivo excluye su propio match (auto-referencia,
    // sin cambios) Y el gemelo cross-file (la guarda generalizada, el fix),
    // aunque el `role` sea "bare" — antes de este cambio, el gemelo cross-file
    // SÍ habría sobrevivido como único target, y `global-uniqueness` lo habría
    // aceptado con `provenance: "resolved"`.
    expect(candidates.filter((c) => c.from.ref.name === "CaseFormat")).toHaveLength(0);
  });
});

describe("buildCandidates — GRAFO#1: gemelo de árbol paralelo, MIEMBRO HEREDADO (jerarquía intermedia divergente)", () => {
  /**
   * Repro real, verificado byte a byte contra el corpus de guava (no sólo
   * hipotético): `android/.../ImmutableList.java`'s `Builder.build()`
   * referencia `size` (bare, heredado — `Builder extends
   * ImmutableCollection.ArrayBasedBuilder`, que declara `size` en OTRO
   * archivo del MISMO árbol). El árbol `jre` tiene una jerarquía intermedia
   * DIFERENTE (`Builder extends ImmutableCollection.Builder`) pero declara
   * `size` DIRECTO dentro de su propio `Builder` — antes de GRAFO#1, ese
   * campo del árbol equivocado sobrevivía como único candidato después de
   * `qualified-name` (que trata "ImmutableList.Builder" como el mismo
   * namespace léxico en ambos archivos, sin noción de herencia real) y
   * `global-uniqueness` lo aceptaba con `provenance: "resolved"`.
   */
  function classSym(name: string, container: readonly string[] = []): SymbolFacts {
    return {
      name,
      container,
      nodeType: "class_declaration",
      family: "class-like",
      memberOfClassLike: false,
      namespaceContainerOnly: false,
      startLine: 1,
      endLine: 10,
      nameLine: 1,
      nameColumn: 1,
    };
  }
  function methodSym(name: string, container: readonly string[]): SymbolFacts {
    return { ...classSym(name, container), family: "function-like", memberOfClassLike: true };
  }
  function fieldSym(name: string, container: readonly string[]): SymbolFacts {
    return { ...classSym(name, container), family: "other", memberOfClassLike: true };
  }
  function bareRef(name: string, scope: readonly string[]): ReferenceFacts {
    return {
      name,
      role: "bare",
      scope,
      qualifier: null,
      qualifierIsBareConstant: false,
      shadowedLocally: false,
      line: 1,
      column: 1,
      occurrences: 1,
    };
  }

  it("android hereda `size` de ArrayBasedBuilder (otro archivo, mismo árbol) — el gemelo jre (que declara `size` directo en su propio Builder) NO es candidato, pero el heredado real sigue siéndolo", () => {
    const files: GraphFileFacts[] = [
      {
        path: "android/guava/ImmutableList.java",
        language: "java",
        symbols: [classSym("ImmutableList"), classSym("Builder", ["ImmutableList"]), methodSym("build", ["ImmutableList", "Builder"])],
        references: [bareRef("size", ["ImmutableList", "Builder", "build"])],
      },
      {
        // El padre REAL de android's Builder, en OTRO archivo del MISMO árbol — declara `size`.
        path: "android/guava/ImmutableCollection.java",
        language: "java",
        symbols: [
          classSym("ImmutableCollection"),
          classSym("ArrayBasedBuilder", ["ImmutableCollection"]),
          fieldSym("size", ["ImmutableCollection", "ArrayBasedBuilder"]),
        ],
        references: [],
      },
      {
        // El árbol "jre": misma superficie `ImmutableList.Builder`, jerarquía intermedia DIFERENTE, `size` declarado DIRECTO acá.
        path: "guava/ImmutableList.java",
        language: "java",
        symbols: [
          classSym("ImmutableList"),
          classSym("Builder", ["ImmutableList"]),
          methodSym("build", ["ImmutableList", "Builder"]),
          fieldSym("size", ["ImmutableList", "Builder"]),
        ],
        references: [],
      },
    ];

    const candidates = buildCandidates(files);
    const sizeCandidate = candidates.find((c) => c.from.file === "android/guava/ImmutableList.java" && c.from.ref.name === "size");
    expect(sizeCandidate).toBeDefined();
    const targetFiles = sizeCandidate!.targets.map((t) => t.file);
    expect(targetFiles).not.toContain("guava/ImmutableList.java"); // el gemelo de árbol paralelo — EXCLUIDO aunque `size` sea heredado, no propio
    expect(targetFiles).toContain("android/guava/ImmutableCollection.java"); // el ancestro real, mismo árbol — sigue siendo candidato
  });

  it("sin gemelo (jre no existe en la corrida), el heredado real sigue siendo el único candidato", () => {
    const files: GraphFileFacts[] = [
      {
        path: "android/guava/ImmutableList.java",
        language: "java",
        symbols: [classSym("ImmutableList"), classSym("Builder", ["ImmutableList"]), methodSym("build", ["ImmutableList", "Builder"])],
        references: [bareRef("size", ["ImmutableList", "Builder", "build"])],
      },
      {
        path: "android/guava/ImmutableCollection.java",
        language: "java",
        symbols: [
          classSym("ImmutableCollection"),
          classSym("ArrayBasedBuilder", ["ImmutableCollection"]),
          fieldSym("size", ["ImmutableCollection", "ArrayBasedBuilder"]),
        ],
        references: [],
      },
    ];
    const candidates = buildCandidates(files);
    const sizeCandidate = candidates.find((c) => c.from.file === "android/guava/ImmutableList.java" && c.from.ref.name === "size");
    expect(sizeCandidate).toBeDefined();
    expect(sizeCandidate!.targets.map((t) => t.file)).toEqual(["android/guava/ImmutableCollection.java"]);
  });
});

/**
 * P4 — EDGE_EXTRACTORS, del lado consumidor (`GraphFileFacts.edges`). No hay
 * caller de producción todavía (ver el docstring de `GraphFileFacts.edges`
 * en `build.ts`): estos tests fabrican `EdgeFacts` a mano, EXACTAMENTE con la
 * forma que cualquiera de los 6 extractores produce, para probar la
 * traducción → `CodeGraphEdge` de punta a punta sin depender de parsear
 * nada (mismo estilo que el describe de "gemelo de árbol paralelo" de arriba).
 */
describe("buildGraph — P4: EDGE_EXTRACTORS (EdgeFacts → CodeGraphEdge tipado)", () => {
  function classSymbol(name: string): SymbolFacts {
    return {
      name,
      container: [],
      nodeType: "class_declaration",
      family: "class-like",
      memberOfClassLike: false,
      namespaceContainerOnly: false,
      startLine: 1,
      endLine: 10,
      nameLine: 1,
      nameColumn: 1,
    };
  }
  function extendsFact(toName: string, toQualifier: readonly string[] = []): EdgeFacts {
    return {
      extractorId: "herencia",
      kind: "extends",
      fromPath: ["Child"],
      toName,
      toQualifier,
      provenance: "declared",
      startLine: 1,
      endLine: 1,
      via: "class_declaration -> superclass",
    };
  }

  it("resuelve `extends` cross-file reusando la cascada real de resolve.ts (global-uniqueness)", () => {
    const files: GraphFileFacts[] = [
      { path: "lib/base.rb", language: "ruby", symbols: [classSymbol("Base")], references: [] },
      {
        path: "lib/child.rb",
        language: "ruby",
        symbols: [classSymbol("Child")],
        references: [],
        edges: [extendsFact("Base")],
      },
    ];
    const graph = buildGraph(files);
    const extendsEdges = graph.edges.filter((e) => e.kind === "extends");
    expect(extendsEdges).toContainEqual(
      expect.objectContaining({
        from: "sym:lib/child.rb#Child",
        to: "sym:lib/base.rb#Base",
        provenance: "resolved",
        resolvedBy: "global-uniqueness",
      }),
    );
  });

  it("un `toQualifier` filtra por contenedor antes de entrar a la cascada", () => {
    const files: GraphFileFacts[] = [
      { path: "lib/a.rb", language: "ruby", symbols: [{ ...classSymbol("Base"), container: ["NsA"] }], references: [] },
      { path: "lib/b.rb", language: "ruby", symbols: [{ ...classSymbol("Base"), container: ["NsB"] }], references: [] },
      {
        path: "lib/child.rb",
        language: "ruby",
        symbols: [classSymbol("Child")],
        references: [],
        edges: [extendsFact("Base", ["NsB"])],
      },
    ];
    const graph = buildGraph(files);
    const extendsEdges = graph.edges.filter((e) => e.kind === "extends");
    expect(extendsEdges).toHaveLength(1);
    expect(extendsEdges[0]!.to).toBe("sym:lib/b.rb#NsB.Base");
  });

  it("un EdgeFacts cuyo `kind` no coincide con lo que el registro declara para su `extractorId` se descarta (no se traduce a ciegas)", () => {
    const files: GraphFileFacts[] = [
      { path: "lib/base.rb", language: "ruby", symbols: [classSymbol("Base")], references: [] },
      {
        path: "lib/child.rb",
        language: "ruby",
        symbols: [classSymbol("Child")],
        references: [],
        edges: [{ ...extendsFact("Base"), kind: "implements" }], // "herencia" declara "extends", no "implements"
      },
    ];
    const graph = buildGraph(files);
    expect(graph.edges.filter((e) => e.kind === "extends" || e.kind === "implements")).toHaveLength(0);
  });

  it("un `toName` que no declara nadie no produce arista (no se adivina)", () => {
    const files: GraphFileFacts[] = [
      {
        path: "lib/child.rb",
        language: "ruby",
        symbols: [classSymbol("Child")],
        references: [],
        edges: [extendsFact("Nowhere")],
      },
    ];
    const graph = buildGraph(files);
    expect(graph.edges.filter((e) => e.kind === "extends")).toHaveLength(0);
  });

  it("`imports` resuelve un especificador relativo contra el archivo real y descarta uno externo (paquete, no archivo del repo)", () => {
    const importFact = (toName: string): EdgeFacts => ({
      extractorId: "imports",
      kind: "imports",
      fromPath: [],
      toName,
      toQualifier: [],
      provenance: "declared",
      startLine: 1,
      endLine: 1,
      via: "import_statement -> source",
    });
    const files: GraphFileFacts[] = [
      { path: "lib/utils.rb", language: "ruby", symbols: [], references: [] },
      {
        path: "lib/site.rb",
        language: "ruby",
        symbols: [],
        references: [],
        edges: [importFact("./utils"), importFact("lodash")],
      },
    ];
    const graph = buildGraph(files);
    const importEdges = graph.edges.filter((e) => e.kind === "imports");
    expect(importEdges).toEqual([
      expect.objectContaining({ from: "file:lib/site.rb", to: "file:lib/utils.rb", provenance: "resolved" }),
    ]);
  });

  it("sin `edges` en NINGÚN archivo, el comportamiento es exactamente el de antes (0 aristas tipadas nuevas)", () => {
    const files: GraphFileFacts[] = [
      { path: "lib/base.rb", language: "ruby", symbols: [classSymbol("Base")], references: [] },
      { path: "lib/child.rb", language: "ruby", symbols: [classSymbol("Child")], references: [] },
    ];
    const graph = buildGraph(files);
    const typedKinds = new Set(["extends", "implements", "instantiates", "mixes-in", "satisfies", "imports"]);
    expect(graph.edges.filter((e) => typedKinds.has(e.kind))).toHaveLength(0);
  });

  it("mergeEdges (dos `imports` duplicados desde el mismo archivo al mismo destino) colapsa con weight 2 y SIN agregar `roles` (CONTRATO-F8G.md §1.3, la guarda de `mergedRoles`)", () => {
    const importFact = (): EdgeFacts => ({
      extractorId: "imports",
      kind: "imports",
      fromPath: [],
      toName: "./utils",
      toQualifier: [],
      provenance: "declared",
      startLine: 1,
      endLine: 1,
      via: "import_statement -> source",
    });
    const files: GraphFileFacts[] = [
      { path: "lib/utils.rb", language: "ruby", symbols: [], references: [] },
      { path: "lib/site.rb", language: "ruby", symbols: [], references: [], edges: [importFact(), importFact()] },
    ];
    const graph = buildGraph(files);
    const importEdges = graph.edges.filter((e) => e.kind === "imports");
    expect(importEdges).toHaveLength(1);
    expect(importEdges[0]!.weight).toBe(2);
    expect(importEdges[0]).not.toHaveProperty("roles");
  });
});

/**
 * CONTRATO-F8G.md §2/§3.1 — las formas nuevas que Cimientos deja puestas:
 * `arity`/`visibility` copiados verbatim al nodo, y la partición callee/
 * no-callee de `calls`. Símbolos/referencias fabricados a mano (mismo
 * estilo que el describe "gemelo de árbol paralelo" de arriba) — no hace
 * falta parsear nada para probar la FORMA, sólo `buildCandidatesForFile`/
 * `resolveReferences`.
 */
describe("buildGraph — CONTRATO-F8G.md: arity/visibility en el nodo, partición callee/no-callee", () => {
  function funcSymbol(name: string, overrides: Partial<SymbolFacts> = {}): SymbolFacts {
    return {
      name,
      container: [],
      nodeType: "method",
      family: "function-like",
      memberOfClassLike: false,
      namespaceContainerOnly: false,
      startLine: 1,
      endLine: 2,
      nameLine: 1,
      nameColumn: 1,
      ...overrides,
    };
  }
  function refTo(name: string, overrides: Partial<ReferenceFacts> = {}): ReferenceFacts {
    return {
      name,
      role: "bare",
      scope: [],
      qualifier: null,
      qualifierIsBareConstant: false,
      shadowedLocally: false,
      line: 1,
      column: 1,
      occurrences: 1,
      ...overrides,
    };
  }

  it("arity y visibility del SymbolFacts pasan al CodeGraphNode verbatim; ausentes, el nodo queda igual que antes de esta ola", () => {
    const files: GraphFileFacts[] = [
      { path: "lib/a.rb", language: "ruby", symbols: [funcSymbol("f", { arity: 2, visibility: "private" })], references: [] },
      { path: "lib/b.rb", language: "ruby", symbols: [funcSymbol("g")], references: [] },
    ];
    const graph = buildGraph(files);
    const fNode = graph.nodes.find((n) => n.id === "sym:lib/a.rb#f")!;
    expect(fNode.arity).toBe(2);
    expect(fNode.visibility).toBe("private");
    const gNode = graph.nodes.find((n) => n.id === "sym:lib/b.rb#g")!;
    expect(gNode.arity).toBeUndefined();
    expect(gNode.visibility).toBeUndefined();
  });

  it("día 0 (sin `isCallee`): cero aristas `calls`, la referencia resuelve como `references` exactamente igual que antes de esta ola", () => {
    const files: GraphFileFacts[] = [
      { path: "lib/callee.rb", language: "ruby", symbols: [funcSymbol("f")], references: [] },
      { path: "lib/caller.rb", language: "ruby", symbols: [], references: [refTo("f")] },
    ];
    const graph = buildGraph(files);
    expect(graph.edges.filter((e) => e.kind === "calls")).toHaveLength(0);
    expect(graph.edges).toContainEqual(
      expect.objectContaining({ from: "file:lib/caller.rb", to: "sym:lib/callee.rb#f", kind: "references" }),
    );
  });

  it("con `isCallee: true`: la MISMA referencia sale como `calls`, nunca duplicada como `references` (partición disjunta)", () => {
    const files: GraphFileFacts[] = [
      { path: "lib/callee.rb", language: "ruby", symbols: [funcSymbol("f")], references: [] },
      { path: "lib/caller.rb", language: "ruby", symbols: [], references: [refTo("f", { isCallee: true })] },
    ];
    const graph = buildGraph(files);
    const toF = graph.edges.filter((e) => e.to === "sym:lib/callee.rb#f" && e.kind !== "contains");
    expect(toF).toEqual([expect.objectContaining({ from: "file:lib/caller.rb", to: "sym:lib/callee.rb#f", kind: "calls" })]);
  });
});

/**
 * OLA P (P2) — los cuatro pedidos acumulados de dos olas que este frente
 * cierra. Símbolos/referencias/`EdgeFacts` fabricados a mano, mismo estilo
 * que los describes de arriba: lo que se prueba es la FORMA que `build.ts`
 * produce, no la extracción (que ya tiene sus propios tests).
 */
describe("buildGraph — Ola P: los hechos del símbolo que no viajaban al nodo", () => {
  function sym(name: string, overrides: Partial<SymbolFacts> = {}): SymbolFacts {
    return {
      name,
      container: [],
      nodeType: "method",
      family: "function-like",
      memberOfClassLike: false,
      namespaceContainerOnly: false,
      startLine: 1,
      endLine: 2,
      nameLine: 1,
      nameColumn: 1,
      ...overrides,
    };
  }

  it("memberOfClassLike y exported del SymbolFacts pasan al CodeGraphNode verbatim, incluido el `false`", () => {
    const files: GraphFileFacts[] = [
      {
        path: "lib/a.rb",
        language: "ruby",
        symbols: [sym("metodo", { memberOfClassLike: true, exported: false }), sym("libre", { exported: true })],
        references: [],
      },
    ];
    const graph = buildGraph(files);
    const metodo = graph.nodes.find((n) => n.id === "sym:lib/a.rb#metodo")!;
    expect(metodo.memberOfClassLike).toBe(true);
    expect(metodo.exported).toBe(false);
    const libre = graph.nodes.find((n) => n.id === "sym:lib/a.rb#libre")!;
    expect(libre.memberOfClassLike).toBe(false);
    expect(libre.exported).toBe(true);
  });

  it("la BRECHA DE GO que motivó el pedido: un método con receptor tiene symbolPath de UN segmento y sólo `memberOfClassLike` lo distingue de una función de paquete", () => {
    const files: GraphFileFacts[] = [
      {
        path: "cmd/root.go",
        language: "go",
        // `func (c *Command) getOut()` — la gramática de Go pone el receptor en
        // un campo, no en un ancestro: `container` vacío, un solo segmento.
        symbols: [sym("getOut", { memberOfClassLike: true }), sym("initCompleteCmd", { memberOfClassLike: false })],
        references: [],
      },
    ];
    const graph = buildGraph(files);
    const conReceptor = graph.nodes.find((n) => n.id === "sym:cmd/root.go#getOut")!;
    const libre = graph.nodes.find((n) => n.id === "sym:cmd/root.go#initCompleteCmd")!;
    expect(conReceptor.symbolPath).toHaveLength(1);
    expect(libre.symbolPath).toHaveLength(1);
    // La profundidad NO los distingue; el hecho SÍ.
    expect(conReceptor.memberOfClassLike).toBe(true);
    expect(libre.memberOfClassLike).toBe(false);
  });

  it("`exported` ausente en el SymbolFacts queda ausente en el nodo — ausente ≠ false", () => {
    const files: GraphFileFacts[] = [{ path: "lib/a.rb", language: "ruby", symbols: [sym("f")], references: [] }];
    const graph = buildGraph(files);
    expect(graph.nodes.find((n) => n.id === "sym:lib/a.rb#f")!.exported).toBeUndefined();
  });

  // Ola S (S1) — tercera repetición de la MISMA operación: un hecho que la
  // gramática ya traía en `SymbolFacts` y que no llegaba al nodo.
  it("nodeType y shapeNodeType del SymbolFacts pasan al CodeGraphNode verbatim", () => {
    const files: GraphFileFacts[] = [
      {
        path: "hugofs/fileinfo.go",
        language: "go",
        symbols: [
          // Go declara struct e interfaz con el MISMO `type_spec`: sólo la
          // forma del hijo del campo `type` los distingue.
          sym("Module", { nodeType: "type_spec", shapeNodeType: "interface_type", family: "class-like" }),
          sym("fileInfo", { nodeType: "type_spec", shapeNodeType: "struct_type", family: "class-like" }),
        ],
        references: [],
      },
      {
        path: "src/a.ts",
        language: "typescript",
        // TypeScript SÍ la escribe en el nodo declarante: no hay `shapeNodeType`.
        symbols: [sym("Contrato", { nodeType: "interface_declaration", family: "class-like" })],
        references: [],
      },
    ];
    const graph = buildGraph(files);
    const iface = graph.nodes.find((n) => n.id === "sym:hugofs/fileinfo.go#Module")!;
    expect(iface.nodeType).toBe("type_spec");
    expect(iface.shapeNodeType).toBe("interface_type");
    const struct = graph.nodes.find((n) => n.id === "sym:hugofs/fileinfo.go#fileInfo")!;
    expect(struct.nodeType).toBe("type_spec");
    expect(struct.shapeNodeType).toBe("struct_type");
    const ts = graph.nodes.find((n) => n.id === "sym:src/a.ts#Contrato")!;
    expect(ts.nodeType).toBe("interface_declaration");
    // AUSENTE = "la forma ya está en `nodeType`", nunca "no se sabe".
    expect(ts.shapeNodeType).toBeUndefined();
  });
});

describe("buildCandidates — Ola P: auto-referencia mismo archivo/mismo símbolo (A4a, abierto desde la Ola N)", () => {
  /** `class Sentinel` en la línea 7, columna 6 — el repro de click/_utils.py. */
  function sentinelDecl(): SymbolFacts {
    return {
      name: "Sentinel",
      container: [],
      nodeType: "class_definition",
      family: "class-like",
      memberOfClassLike: false,
      namespaceContainerOnly: false,
      startLine: 7,
      endLine: 20,
      nameLine: 7,
      nameColumn: 6,
    };
  }
  function refAt(line: number, column: number, overrides: Partial<ReferenceFacts> = {}): ReferenceFacts {
    return {
      name: "Sentinel",
      role: "bare",
      scope: [],
      qualifier: null,
      qualifierIsBareConstant: false,
      shadowedLocally: false,
      line,
      column,
      occurrences: 1,
      ...overrides,
    };
  }

  it("el USO en el mismo archivo y el mismo scope SÍ es candidato — antes se descartaba y el símbolo quedaba con fan-in 0", () => {
    const files: GraphFileFacts[] = [
      {
        path: "src/click/_utils.py",
        language: "python",
        symbols: [sentinelDecl()],
        // El token de nombre de la declaración (7:6) y un uso real (22:26).
        references: [refAt(7, 6, { role: "decl-name" }), refAt(22, 26)],
      },
    ];
    const candidates = buildCandidates(files);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.from.ref.line).toBe(22);
    expect(candidates[0]!.targets).toEqual([{ file: "src/click/_utils.py", symbolPath: ["Sentinel"] }]);

    const graph = buildGraph(files);
    const haciaSentinel = graph.edges.filter((e) => e.to === "sym:src/click/_utils.py#Sentinel" && e.kind !== "contains");
    expect(haciaSentinel).toHaveLength(1);
    expect(haciaSentinel[0]!.from).toBe("file:src/click/_utils.py");
  });

  it("el TOKEN DE NOMBRE de la declaración sigue sin ser candidato — una declaración no se usa a sí misma", () => {
    const files: GraphFileFacts[] = [
      {
        path: "src/click/_utils.py",
        language: "python",
        symbols: [sentinelDecl()],
        references: [refAt(7, 6, { role: "decl-name" })],
      },
    ];
    expect(buildCandidates(files)).toHaveLength(0);
  });

  it("la exclusión es POR POSICIÓN, no por `role`: el encabezado que llega con role `bare` (repro `public enum CaseFormat`) tampoco es candidato", () => {
    const files: GraphFileFacts[] = [
      {
        path: "src/click/_utils.py",
        language: "python",
        symbols: [sentinelDecl()],
        references: [refAt(7, 6)], // MISMA posición que la declaración, role bare
      },
    ];
    expect(buildCandidates(files)).toHaveLength(0);
  });
});

describe("buildGraph — Ola P: aridad POR SITIO DE LLAMADA en la arista (pedido de N6)", () => {
  function funcSymbol(name: string, arity: number): SymbolFacts {
    return {
      name,
      container: [],
      nodeType: "method",
      family: "function-like",
      memberOfClassLike: false,
      namespaceContainerOnly: false,
      startLine: 1,
      endLine: 2,
      nameLine: 1,
      nameColumn: 1,
      arity,
    };
  }
  function callRef(name: string, argCounts: readonly number[] | undefined, line: number): ReferenceFacts {
    return {
      name,
      role: "bare",
      scope: [],
      qualifier: null,
      qualifierIsBareConstant: false,
      shadowedLocally: false,
      line,
      column: 3,
      occurrences: 1,
      isCallee: argCounts !== undefined,
      ...(argCounts ? { argCounts } : {}),
    };
  }

  it("los conteos DISTINTOS de argumentos de todos los sitios colapsados viajan en la arista, ordenados y sin repetir", () => {
    const files: GraphFileFacts[] = [
      { path: "lib/callee.rb", language: "ruby", symbols: [funcSymbol("f", 3)], references: [] },
      {
        path: "lib/caller.rb",
        language: "ruby",
        symbols: [],
        references: [callRef("f", [2], 10), callRef("f", [0], 11), callRef("f", [2], 12)],
      },
    ];
    const graph = buildGraph(files);
    const haciaF = graph.edges.filter((e) => e.to === "sym:lib/callee.rb#f" && e.kind === "calls");
    expect(haciaF).toHaveLength(1);
    expect(haciaF[0]!.callArities).toEqual([0, 2]);
    // La aridad DECLARADA sigue viviendo en el nodo, sin mezclarse.
    expect(graph.nodes.find((n) => n.id === "sym:lib/callee.rb#f")!.arity).toBe(3);
  });

  it("una referencia que NO es sitio de llamada no le pone `callArities` a la arista — ausente ≠ cero argumentos", () => {
    const files: GraphFileFacts[] = [
      { path: "lib/callee.rb", language: "ruby", symbols: [funcSymbol("f", 1)], references: [] },
      { path: "lib/caller.rb", language: "ruby", symbols: [], references: [callRef("f", undefined, 10)] },
    ];
    const graph = buildGraph(files);
    const haciaF = graph.edges.filter((e) => e.to === "sym:lib/callee.rb#f" && e.kind === "references");
    expect(haciaF).toHaveLength(1);
    expect(haciaF[0]).not.toHaveProperty("callArities");
  });

  it("una llamada SIN argumentos aporta el 0 — `foo()` resuelve una lista vacía pero real", () => {
    const files: GraphFileFacts[] = [
      { path: "lib/callee.rb", language: "ruby", symbols: [funcSymbol("f", 0)], references: [] },
      { path: "lib/caller.rb", language: "ruby", symbols: [], references: [callRef("f", [0], 10)] },
    ];
    const graph = buildGraph(files);
    expect(graph.edges.find((e) => e.to === "sym:lib/callee.rb#f" && e.kind === "calls")!.callArities).toEqual([0]);
  });
});

describe("buildResolutionContext — Ola P: los especificadores de import NO resueltos (pedido de N9)", () => {
  function importFact(toName: string): EdgeFacts {
    return {
      extractorId: "imports",
      kind: "imports",
      fromPath: [],
      toName,
      toQualifier: [],
      provenance: "declared",
      startLine: 1,
      endLine: 1,
      via: "import_statement -> source",
    };
  }

  it("clasifica resueltos y no resueltos por archivo, y el no resuelto ya no se tira", () => {
    const files: GraphFileFacts[] = [
      { path: "lib/utils.rb", language: "ruby", symbols: [], references: [] },
      {
        path: "lib/site.rb",
        language: "ruby",
        symbols: [],
        references: [],
        edges: [importFact("./utils"), importFact("typing")],
      },
    ];
    const ctx = buildResolutionContext(files);
    expect(ctx.importSpecifiers("lib/site.rb")).toEqual({ resolved: ["./utils"], unresolved: ["typing"] });
    expect(ctx.importsUnresolvedSpecifier("lib/site.rb")).toBe(true);
    expect(ctx.importsUnresolvedSpecifier("lib/utils.rb")).toBe(false);
    expect(ctx.importSpecifiers("lib/utils.rb")).toEqual({ resolved: [], unresolved: [] });
  });

  it("EL DISCRIMINADOR de N9: un especificador que resuelve desde OTRO archivo no es externo aunque acá no resuelva", () => {
    const files: GraphFileFacts[] = [
      { path: "src/common/index.ts", language: "typescript", symbols: [], references: [] },
      // Resuelve por sufijo desde un archivo, y no resuelve desde el otro.
      { path: "src/app/a.ts", language: "typescript", symbols: [], references: [], edges: [importFact("src/common/index")] },
      { path: "src/app/b.ts", language: "typescript", symbols: [], references: [], edges: [importFact("typing")] },
    ];
    const ctx = buildResolutionContext(files);
    expect(ctx.specifierResolvesSomewhere("src/common/index")).toBe(true);
    expect(ctx.specifierResolvesSomewhere("typing")).toBe(false);
  });
});
