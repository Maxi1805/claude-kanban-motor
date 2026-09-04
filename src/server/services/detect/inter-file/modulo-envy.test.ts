import { describe, expect, it } from "vitest";

import { buildModuleEnvyFindings, moduleEnvyCandidates, unitByFile, detector } from "./modulo-envy.js";
import { testContext } from "../testing.js";
import type { RepoUnit, RepoFunctionUnit } from "../types.js";
import { fileNodeId, symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode } from "../../graph/types.js";

/**
 * `inter-file`, `needsGraph: true`: el grafo se arma a mano (nodos + aristas
 * planas), sin tree-sitter — mismo criterio que `unstable-dependency.test.ts`
 * y `orphan-file.test.ts`. Este detector NO lee la extensión de ningún
 * archivo ni el `language` de ningún `FileSummary`: opera sobre la FORMA del
 * grafo (familia de símbolo + arista `contains` implícita en `node.file`), así
 * que es agnóstico de lenguaje POR CONSTRUCCIÓN — hay un test explícito para
 * eso más abajo, porque "agnóstico" dicho sin verificar es la trampa que dejó
 * a Go mudo cuatro olas en `state.ts`.
 */

function fileNode(file: string): CodeGraphNode {
  return { id: fileNodeId(file), kind: "file", file, symbolPath: [] };
}

function classNode(file: string, name: string): CodeGraphNode {
  return { id: symbolNodeId(file, [name]), kind: "symbol", file, symbolPath: [name], family: "class-like", startLine: 1, endLine: 50 };
}

/** Clase ANIDADA: `symbolPath` de largo > 1. Es la forma normal de ruby
 *  (`module RuboCop; class CachedData`), C# (`namespace`) y python. */
function nestedClassNode(file: string, path: readonly string[]): CodeGraphNode {
  return { id: symbolNodeId(file, path), kind: "symbol", file, symbolPath: path, family: "class-like", startLine: 1, endLine: 50 };
}

function namespaceNode(file: string, path: readonly string[]): CodeGraphNode {
  return { id: symbolNodeId(file, path), kind: "symbol", file, symbolPath: path, family: "namespace-like", startLine: 1, endLine: 60 };
}

function methodNode(file: string, path: readonly string[], startLine = 5): CodeGraphNode {
  return { id: symbolNodeId(file, path), kind: "symbol", file, symbolPath: path, family: "function-like", startLine, endLine: startLine + 8 };
}

function dataNode(file: string, path: readonly string[]): CodeGraphNode {
  return { id: symbolNodeId(file, path), kind: "symbol", file, symbolPath: path, family: "other", startLine: 2, endLine: 2 };
}

function edge(from: string, to: string, over: Partial<CodeGraphEdge> = {}): CodeGraphEdge {
  return { from, to, kind: over.kind ?? "references", provenance: over.provenance ?? "resolved", weight: over.weight ?? 1, ...over } as CodeGraphEdge;
}

function graphOf(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): CodeGraph {
  return { nodes, edges, resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] } };
}

function fn(file: string, symbolPath: readonly string[], isConstructor = false): RepoFunctionUnit {
  return {
    file,
    language: "typescript",
    name: symbolPath[symbolPath.length - 1] ?? null,
    startLine: 5,
    endLine: 13,
    symbolPath,
    sets: {} as never,
    metrics: {
      branches: 0, chain: 0, cognitive: 0, maxNesting: 0, parameters: 1,
      chainHasNullCheck: false, chainInstantiates: false, className: null,
      isConstructor, isFactoryLike: false,
    },
  };
}

function repoWith(graph: CodeGraph, functions: readonly RepoFunctionUnit[] = []): RepoUnit {
  const files = [...new Set(graph.nodes.map((n) => n.file))].map((path) => ({ path, lines: 60, language: "typescript" }));
  return { repoName: "test", files, functions, clones: [], graph };
}

/**
 * EL CASO BASE, y es la forma que el detector existe para nombrar: `report`
 * vive en `src/a/report.ts` (que declara la clase `Report`), lee UN miembro
 * propio y CUATRO miembros distintos declarados en `src/b/invoice.ts` (que
 * declara la clase `Invoice`). ATFD = 4 > 2, LAA = 1/5 = 0,2 < 1/3.
 */
function baseGraph(): CodeGraph {
  const A = "src/a/report.ts";
  const B = "src/b/invoice.ts";
  const nodes: CodeGraphNode[] = [
    fileNode(A), classNode(A, "Report"), methodNode(A, ["Report", "render"]), dataNode(A, ["Report", "title"]),
    fileNode(B), classNode(B, "Invoice"),
    methodNode(B, ["Invoice", "total"]), methodNode(B, ["Invoice", "tax"]),
    dataNode(B, ["Invoice", "lines"]), dataNode(B, ["Invoice", "currency"]),
  ];
  const from = symbolNodeId(A, ["Report", "render"]);
  const edges: CodeGraphEdge[] = [
    edge(from, symbolNodeId(A, ["Report", "title"])),
    edge(from, symbolNodeId(B, ["Invoice", "total"]), { kind: "calls" }),
    edge(from, symbolNodeId(B, ["Invoice", "tax"]), { kind: "calls" }),
    edge(from, symbolNodeId(B, ["Invoice", "lines"])),
    edge(from, symbolNodeId(B, ["Invoice", "currency"])),
  ];
  return graphOf(nodes, edges);
}

// OLA AW, guardián: `testContext` exige `language` (2º parámetro) — no
// existía como obligatorio en la copia congelada de AW4. `"*"` es el mismo
// comodín que usan los demás detectores `inter-file` sobre grafo sintético
// (ver `fanout-without-cohesion.test.ts`): el umbral es language-agnostic acá.
const ctx = () => testContext<"minForeignMembers" | "maxLocality">(detector, "*");

function findingsOf(repo: RepoUnit): readonly ReturnType<typeof buildModuleEnvyFindings>[number][] {
  const c = ctx();
  return buildModuleEnvyFindings(repo, repo.graph!, c.threshold("minForeignMembers"), c.threshold("maxLocality"));
}

describe("modulo-envy — el constructor (punto F-bis)", () => {
  /**
   * REGRESIÓN: `code-analyzer.ts:2388` arma el `RepoUnit` de la pasada
   * `inter-file` con `functions: []` hardcodeado, así que en PRODUCCIÓN
   * `f.metrics.isConstructor` no filtra nada. Este test pasa `functions: []`
   * a propósito — la forma real — y exige que igual se descarte.
   */
  function ctorGraph(name: string): CodeGraph {
    const A = "src/a/report.ts";
    const B = "src/b/invoice.ts";
    const from = symbolNodeId(A, ["Report", name]);
    const nodes: CodeGraphNode[] = [
      fileNode(A), classNode(A, "Report"), methodNode(A, ["Report", name]), dataNode(A, ["Report", "title"]),
      fileNode(B), classNode(B, "Invoice"),
      methodNode(B, ["Invoice", "total"]), methodNode(B, ["Invoice", "tax"]),
      dataNode(B, ["Invoice", "lines"]), dataNode(B, ["Invoice", "currency"]),
    ];
    const edges: CodeGraphEdge[] = [
      edge(from, symbolNodeId(A, ["Report", "title"])),
      edge(from, symbolNodeId(B, ["Invoice", "total"]), { kind: "calls" }),
      edge(from, symbolNodeId(B, ["Invoice", "tax"]), { kind: "calls" }),
      edge(from, symbolNodeId(B, ["Invoice", "lines"])),
      edge(from, symbolNodeId(B, ["Invoice", "currency"])),
    ];
    return graphOf(nodes, edges);
  }

  it("se descarta el constructor aunque `repo.functions` llegue VACÍO — el caso de producción", () => {
    for (const name of ["initialize", "constructor", "__init__", "new", "Report"]) {
      const g = ctorGraph(name);
      expect(findingsOf(repoWith(g, [])), `no debería emitir para "${name}"`).toEqual([]);
    }
  });

  it("un método normal con la MISMA forma sí se emite — la compuerta no traga todo", () => {
    const g = ctorGraph("render");
    expect(findingsOf(repoWith(g, [])).length).toBe(1);
  });
});

describe("modulo-envy — qué cuenta como miembro (punto T)", () => {
  /**
   * REGRESIÓN DE LA OLA AW, salida de abrir los once primeros hallazgos
   * reales: contar el NOMBRE DE LA CLASE como un miembro más inflaba el ATFD
   * en 1 por tipo mencionado. En click `wrap_text` era la única razón por la
   * que el hallazgo existía (ATFD 3 con la clase, 2 sin ella).
   */
  it("el NOMBRE de la clase destino NO cuenta como miembro ajeno", () => {
    const A = "src/a/fmt.ts";
    const B = "src/b/wrap.ts";
    const from = symbolNodeId(A, ["Fmt", "wrapText"]);
    const nodes: CodeGraphNode[] = [
      fileNode(A), classNode(A, "Fmt"), methodNode(A, ["Fmt", "wrapText"]), dataNode(A, ["Fmt", "width"]),
      fileNode(B), classNode(B, "Wrapper"),
      methodNode(B, ["Wrapper", "fill"]), methodNode(B, ["Wrapper", "indent"]),
    ];
    const conClase: CodeGraphEdge[] = [
      edge(from, symbolNodeId(A, ["Fmt", "width"])),
      edge(from, symbolNodeId(B, ["Wrapper"]), { kind: "instantiates" }),
      edge(from, symbolNodeId(B, ["Wrapper", "fill"]), { kind: "calls" }),
      edge(from, symbolNodeId(B, ["Wrapper", "indent"]), { kind: "calls" }),
    ];
    const c = moduleEnvyCandidates(repoWith(graphOf(nodes, conClase)), graphOf(nodes, conClase))
      .find((x) => x.symbolId === from);
    // tres aristas ajenas, pero UNA es el nombre del tipo: ATFD = 2, no 3.
    expect(c?.foreignMembers).toBe(2);
    expect(c?.members).toEqual(["fill", "indent"]);
    // y con ATFD 2 el umbral FEW = 2 (estricto) NO se cruza: no se emite.
    expect(findingsOf(repoWith(graphOf(nodes, conClase)))).toEqual([]);
  });

  it("un namespace/módulo usado como qualifier tampoco cuenta — el caso `Utils::Platforms` de jekyll", () => {
    const A = "lib/jekyll/commands/serve.rb";
    const B = "lib/jekyll/utils/platforms.rb";
    const from = symbolNodeId(A, ["Serve", "launchBrowser"]);
    const nodes: CodeGraphNode[] = [
      fileNode(A), classNode(A, "Serve"), methodNode(A, ["Serve", "launchBrowser"]), dataNode(A, ["Serve", "opts"]),
      fileNode(B), namespaceNode(B, ["Platforms"]),
      methodNode(B, ["Platforms", "linux"]), methodNode(B, ["Platforms", "osx"]),
    ];
    const edges: CodeGraphEdge[] = [
      edge(from, symbolNodeId(A, ["Serve", "opts"])),
      edge(from, symbolNodeId(B, ["Platforms"])),
      edge(from, symbolNodeId(B, ["Platforms", "linux"]), { kind: "calls" }),
      edge(from, symbolNodeId(B, ["Platforms", "osx"]), { kind: "calls" }),
    ];
    const c = moduleEnvyCandidates(repoWith(graphOf(nodes, edges)), graphOf(nodes, edges))
      .find((x) => x.symbolId === from);
    expect(c?.foreignMembers).toBe(2);
    expect(c?.members).toEqual(["linux", "osx"]);
  });
});

describe("modulo-envy — la unidad de atribución", () => {
  it("un archivo que declara una clase en el nivel superior ES su propia unidad", () => {
    const u = unitByFile(baseGraph());
    expect(u.get("src/a/report.ts")).toBe("file:src/a/report.ts");
    expect(u.get("src/b/invoice.ts")).toBe("file:src/b/invoice.ts");
  });

  it("un archivo SIN class-like en el nivel superior colapsa a su CARPETA — el caso Go, decidido por forma y no por extensión", () => {
    const P = "pkg/store/read.go";
    const Q = "pkg/store/write.go";
    const g = graphOf(
      [fileNode(P), methodNode(P, ["Load"]), fileNode(Q), methodNode(Q, ["Save"])],
      [],
    );
    const u = unitByFile(g);
    expect(u.get(P)).toBe("folder:pkg/store");
    expect(u.get(Q)).toBe("folder:pkg/store");
    expect(u.get(P)).toBe(u.get(Q));
  });

  /**
   * REGRESIÓN DE LA OLA AW — el defecto que el censo de 11 repos encontró y
   * que estos tests NO agarraban: la primera versión exigía
   * `symbolPath.length === 1`. En ruby la clase vive dentro de `module`, en
   * C# dentro de `namespace` y en python puede estar anidada; medido,
   * ruby declara 1.126 `class-like` y sólo **13** en el nivel superior, C#
   * 336 y **14**. Con el gate viejo esos archivos colapsaban a su carpeta y
   * el detector quedaba mudo en cuatro de los seis lenguajes.
   */
  it("una clase envuelta en un módulo/namespace (ruby, C#) SIGUE haciendo del archivo su propia unidad", () => {
    const F = "lib/rubocop/cached_data.rb";
    const g = graphOf(
      [
        fileNode(F),
        namespaceNode(F, ["RuboCop"]),
        nestedClassNode(F, ["RuboCop", "CachedData"]),
        methodNode(F, ["RuboCop", "CachedData", "serialize_offense"]),
      ],
      [],
    );
    expect(unitByFile(g).get(F)).toBe(`file:${F}`);
  });

  it("una clase declarada DENTRO de una función es un local y NO hace unidad del archivo", () => {
    const F = "src/util/make.ts";
    const g = graphOf(
      [
        fileNode(F),
        methodNode(F, ["makeThing"]),
        nestedClassNode(F, ["makeThing", "Local"]),
      ],
      [],
    );
    expect(unitByFile(g).get(F)).toBe("folder:src/util");
  });

  it("dos archivos del MISMO paquete suman al MISMO proveedor (lo que la atribución por archivo no ve)", () => {
    const A = "cmd/app/main.go";
    const P = "pkg/store/read.go";
    const Q = "pkg/store/write.go";
    const from = symbolNodeId(A, ["run"]);
    const g = graphOf(
      [
        fileNode(A), methodNode(A, ["run"]), dataNode(A, ["cfg"]),
        fileNode(P), methodNode(P, ["Load"]), methodNode(P, ["Open"]),
        fileNode(Q), methodNode(Q, ["Save"]), methodNode(Q, ["Flush"]),
      ],
      [
        edge(from, symbolNodeId(A, ["cfg"])),
        edge(from, symbolNodeId(P, ["Load"]), { kind: "calls" }),
        edge(from, symbolNodeId(P, ["Open"]), { kind: "calls" }),
        edge(from, symbolNodeId(Q, ["Save"]), { kind: "calls" }),
        edge(from, symbolNodeId(Q, ["Flush"]), { kind: "calls" }),
      ],
    );
    const cands = moduleEnvyCandidates(repoWith(g), g);
    expect(cands).toHaveLength(1);
    expect(cands[0]!.dominantUnit).toBe("folder:pkg/store");
    expect(cands[0]!.foreignMembers).toBe(4); // 2 de read.go + 2 de write.go, en UNA sola unidad
    expect(cands[0]!.ownMembers).toBe(1);
  });
});

describe("modulo-envy — la regla de Lanza & Marinescu sobre la unidad de módulo", () => {
  it("emite el caso base: ATFD 4 sobre el dominante, LAA 0,20", () => {
    const g = baseGraph();
    const fs = findingsOf(repoWith(g, [fn("src/a/report.ts", ["Report", "render"])]));
    expect(fs).toHaveLength(1);
    expect(fs[0]!.trigger[0]!.value).toBe(4);
    expect(fs[0]!.trigger[1]!.value).toBe(0.2);
    expect(fs[0]!.title).toContain("render");
    expect(fs[0]!.title).toContain("src/b/invoice.ts");
    expect(fs[0]!.locations[1]!.file).toBe("src/b/invoice.ts");
  });

  it("(I) MIEMBROS DISTINTOS, NO EVENTOS: cuatro aristas al MISMO miembro dan ATFD 1 y no emiten", () => {
    const A = "src/a/report.ts";
    const B = "src/b/invoice.ts";
    const from = symbolNodeId(A, ["Report", "render"]);
    const g = graphOf(
      [fileNode(A), classNode(A, "Report"), methodNode(A, ["Report", "render"]), dataNode(A, ["Report", "title"]),
       fileNode(B), classNode(B, "Invoice"), methodNode(B, ["Invoice", "total"])],
      [edge(from, symbolNodeId(A, ["Report", "title"])),
       edge(from, symbolNodeId(B, ["Invoice", "total"]), { weight: 4 }),
       edge(from, symbolNodeId(B, ["Invoice", "total"]), { kind: "calls", weight: 3 })],
    );
    expect(moduleEnvyCandidates(repoWith(g), g)[0]!.foreignMembers).toBe(1);
    expect(findingsOf(repoWith(g))).toHaveLength(0);
  });

  it("(C)+(G) EL UMBRAL VA SOBRE EL DOMINANTE: 2+1+1 repartido entre tres módulos no emite", () => {
    const A = "src/a/report.ts";
    const from = symbolNodeId(A, ["Report", "render"]);
    const mk = (f: string, c: string, ms: string[]): CodeGraphNode[] => [
      fileNode(f), classNode(f, c), ...ms.map((m) => methodNode(f, [c, m])),
    ];
    const g = graphOf(
      [fileNode(A), classNode(A, "Report"), methodNode(A, ["Report", "render"]), dataNode(A, ["Report", "title"]),
       ...mk("src/b/b.ts", "B", ["x", "y"]), ...mk("src/c/c.ts", "C", ["z"]), ...mk("src/d/d.ts", "D", ["w"])],
      [edge(from, symbolNodeId(A, ["Report", "title"])),
       edge(from, symbolNodeId("src/b/b.ts", ["B", "x"])), edge(from, symbolNodeId("src/b/b.ts", ["B", "y"])),
       edge(from, symbolNodeId("src/c/c.ts", ["C", "z"])), edge(from, symbolNodeId("src/d/d.ts", ["D", "w"]))],
    );
    const c = moduleEnvyCandidates(repoWith(g), g)[0]!;
    expect(c.foreignMembers).toBe(2); // el dominante, no la suma de 4
    expect(c.providers).toBe(3);
    expect(findingsOf(repoWith(g))).toHaveLength(0);
  });

  it("(N) NO MEDIR NO ES MEDIR CERO: sin ningún acceso propio no se emite aunque ATFD sea alto", () => {
    const g = baseGraph();
    const sinPropio = graphOf(g.nodes, g.edges.filter((e) => !e.to.includes("Report.title")));
    expect(moduleEnvyCandidates(repoWith(sinPropio), sinPropio)).toHaveLength(0);
    expect(findingsOf(repoWith(sinPropio))).toHaveLength(0);
  });

  it("(F) UN CONSTRUCTOR NO TIENE A DÓNDE MUDARSE: se descarta por FunctionMetrics.isConstructor", () => {
    const g = baseGraph();
    const conCtor = repoWith(g, [fn("src/a/report.ts", ["Report", "render"], true)]);
    expect(moduleEnvyCandidates(conCtor, g)).toHaveLength(0);
    // sin la marca, el MISMO grafo sí emite — el descarte es por el hecho, no por el grafo
    expect(moduleEnvyCandidates(repoWith(g), g)).toHaveLength(1);
  });

  it("(D) LAS FUNCIONES ANIDADAS NO SON MÉTODOS: un lambda dentro de otra función no se evalúa", () => {
    const A = "src/a/report.ts";
    const B = "src/b/invoice.ts";
    const outer = methodNode(A, ["render"]);
    const inner = methodNode(A, ["render", "cb"]);
    const g = graphOf(
      [fileNode(A), classNode(A, "Report"), outer, inner, dataNode(A, ["title"]),
       fileNode(B), classNode(B, "Invoice"),
       methodNode(B, ["Invoice", "a"]), methodNode(B, ["Invoice", "b"]), methodNode(B, ["Invoice", "c"])],
      [edge(inner.id, symbolNodeId(A, ["title"])),
       edge(inner.id, symbolNodeId(B, ["Invoice", "a"])), edge(inner.id, symbolNodeId(B, ["Invoice", "b"])),
       edge(inner.id, symbolNodeId(B, ["Invoice", "c"]))],
    );
    expect(moduleEnvyCandidates(repoWith(g), g).map((c) => c.name)).not.toContain("cb");
  });

  it("(K) SIN NOMBRE NO HAY MÉTODO QUE MUDAR: un function-like con symbolPath vacío no se emite", () => {
    const A = "src/a/report.ts";
    const B = "src/b/invoice.ts";
    const anon: CodeGraphNode = { id: `sym:${A}#`, kind: "symbol", file: A, symbolPath: [], family: "function-like", startLine: 3, endLine: 9 };
    const g = graphOf(
      [fileNode(A), classNode(A, "Report"), anon, dataNode(A, ["title"]),
       fileNode(B), classNode(B, "Invoice"), methodNode(B, ["Invoice", "a"]), methodNode(B, ["Invoice", "b"]), methodNode(B, ["Invoice", "c"])],
      [edge(anon.id, symbolNodeId(A, ["title"])), edge(anon.id, symbolNodeId(B, ["Invoice", "a"])),
       edge(anon.id, symbolNodeId(B, ["Invoice", "b"])), edge(anon.id, symbolNodeId(B, ["Invoice", "c"]))],
    );
    expect(moduleEnvyCandidates(repoWith(g), g)).toHaveLength(0);
  });
});

describe("modulo-envy — el rescate de la ambigüedad, la ganancia propia de la vía de módulo", () => {
  it("una arista ambigua cuyos candidatos caen TODOS en la misma unidad se USA, y se cuenta", () => {
    const A = "src/a/report.ts";
    const B = "src/b/invoice.ts";
    const from = symbolNodeId(A, ["Report", "render"]);
    const g = graphOf(
      [fileNode(A), classNode(A, "Report"), methodNode(A, ["Report", "render"]), dataNode(A, ["Report", "title"]),
       fileNode(B), classNode(B, "Invoice"),
       methodNode(B, ["Invoice", "total"]), methodNode(B, ["Invoice", "tax"]), methodNode(B, ["Invoice", "net"])],
      [edge(from, symbolNodeId(A, ["Report", "title"])),
       edge(from, symbolNodeId(B, ["Invoice", "total"]), {
         provenance: "ambiguous", alternatives: [symbolNodeId(B, ["Invoice", "tax"])],
       }),
       edge(from, symbolNodeId(B, ["Invoice", "tax"])),
       edge(from, symbolNodeId(B, ["Invoice", "net"]))],
    );
    const c = moduleEnvyCandidates(repoWith(g), g)[0]!;
    expect(c.rescuedAmbiguous).toBe(1);
    expect(c.droppedAmbiguous).toBe(0);
    expect(c.foreignMembers).toBe(3);
  });

  it("una arista ambigua cuyos candidatos se reparten entre unidades DISTINTAS se descarta, y se cuenta", () => {
    const A = "src/a/report.ts";
    const B = "src/b/invoice.ts";
    const C = "src/c/order.ts";
    const from = symbolNodeId(A, ["Report", "render"]);
    const g = graphOf(
      [fileNode(A), classNode(A, "Report"), methodNode(A, ["Report", "render"]), dataNode(A, ["Report", "title"]),
       fileNode(B), classNode(B, "Invoice"), methodNode(B, ["Invoice", "total"]),
       fileNode(C), classNode(C, "Order"), methodNode(C, ["Order", "total"])],
      [edge(from, symbolNodeId(A, ["Report", "title"])),
       edge(from, symbolNodeId(B, ["Invoice", "total"]), {
         provenance: "ambiguous", alternatives: [symbolNodeId(C, ["Order", "total"])],
       })],
    );
    const cands = moduleEnvyCandidates(repoWith(g), g);
    expect(cands).toHaveLength(0); // sin ningún alcance ajeno utilizable
    // y el descarte quedó contado, no escondido: se ve en el candidato cuando SÍ hay otro alcance
    const g2 = graphOf(g.nodes, [...g.edges, edge(from, symbolNodeId(B, ["Invoice", "total"]))]);
    expect(moduleEnvyCandidates(repoWith(g2), g2)[0]!.droppedAmbiguous).toBe(1);
  });
});

describe("modulo-envy — las compuertas contra la familia que ya costó falsos", () => {
  it("la unidad destino tiene que DECLARAR COMPORTAMIENTO: un módulo de puro dato no recibe un método", () => {
    const A = "src/a/report.ts";
    const B = "src/b/invoice-dto.ts";
    const from = symbolNodeId(A, ["Report", "render"]);
    const g = graphOf(
      [fileNode(A), classNode(A, "Report"), methodNode(A, ["Report", "render"]), dataNode(A, ["Report", "title"]),
       fileNode(B), classNode(B, "InvoiceDto"),
       dataNode(B, ["InvoiceDto", "a"]), dataNode(B, ["InvoiceDto", "b"]), dataNode(B, ["InvoiceDto", "c"]), dataNode(B, ["InvoiceDto", "d"])],
      [edge(from, symbolNodeId(A, ["Report", "title"])),
       edge(from, symbolNodeId(B, ["InvoiceDto", "a"])), edge(from, symbolNodeId(B, ["InvoiceDto", "b"])),
       edge(from, symbolNodeId(B, ["InvoiceDto", "c"])), edge(from, symbolNodeId(B, ["InvoiceDto", "d"]))],
    );
    expect(moduleEnvyCandidates(repoWith(g), g)).toHaveLength(0);
  });

  it("no se propone mudar un método a su PROPIA superclase (arista nominal entre las dos unidades)", () => {
    const A = "src/a/report.ts";
    const B = "src/b/base.ts";
    const from = symbolNodeId(A, ["Report", "render"]);
    const g = graphOf(
      [fileNode(A), classNode(A, "Report"), methodNode(A, ["Report", "render"]), dataNode(A, ["Report", "title"]),
       fileNode(B), classNode(B, "Base"),
       methodNode(B, ["Base", "a"]), methodNode(B, ["Base", "b"]), methodNode(B, ["Base", "c"])],
      [edge(symbolNodeId(A, ["Report"]), symbolNodeId(B, ["Base"]), { kind: "extends", provenance: "declared" }),
       edge(from, symbolNodeId(A, ["Report", "title"])),
       edge(from, symbolNodeId(B, ["Base", "a"])), edge(from, symbolNodeId(B, ["Base", "b"])),
       edge(from, symbolNodeId(B, ["Base", "c"]))],
    );
    expect(moduleEnvyCandidates(repoWith(g), g)).toHaveLength(0);
  });
});

describe("modulo-envy — agnóstico de lenguaje por construcción", () => {
  /**
   * La MISMA forma de grafo con extensiones de los seis lenguajes medidos.
   * Si alguien mete un `if (language === …)` o una expresión regular sobre la
   * extensión, este test se pone rojo — es la trampa 1 de la ola
   * (`SELF_PREFIX` de `state.ts` dejó Go mudo cuatro olas y ningún test lo
   * agarró).
   */
  it.each([
    ["ruby", "app/a/report.rb", "app/b/invoice.rb"],
    ["python", "pkg/a/report.py", "pkg/b/invoice.py"],
    ["javascript", "lib/a/report.js", "lib/b/invoice.js"],
    ["typescript", "src/a/report.ts", "src/b/invoice.ts"],
    ["java", "src/a/Report.java", "src/b/Invoice.java"],
    ["csharp", "Src/a/Report.cs", "Src/b/Invoice.cs"],
    ["go-con-clase", "internal/a/report.go", "internal/b/invoice.go"],
  ])("emite igual en %s", (_lang, A, B) => {
    const from = symbolNodeId(A, ["Report", "render"]);
    const g = graphOf(
      [fileNode(A), classNode(A, "Report"), methodNode(A, ["Report", "render"]), dataNode(A, ["Report", "title"]),
       fileNode(B), classNode(B, "Invoice"),
       methodNode(B, ["Invoice", "total"]), methodNode(B, ["Invoice", "tax"]),
       methodNode(B, ["Invoice", "net"]), methodNode(B, ["Invoice", "gross"])],
      [edge(from, symbolNodeId(A, ["Report", "title"])),
       edge(from, symbolNodeId(B, ["Invoice", "total"])), edge(from, symbolNodeId(B, ["Invoice", "tax"])),
       edge(from, symbolNodeId(B, ["Invoice", "net"])), edge(from, symbolNodeId(B, ["Invoice", "gross"]))],
    );
    const fs = findingsOf(repoWith(g));
    expect(fs).toHaveLength(1);
    expect(fs[0]!.trigger[0]!.value).toBe(4);
  });
});

describe("modulo-envy — contrato del detector", () => {
  it("declara los kinds de arista como ALTERNATIVA, no como conjunción", () => {
    expect(detector.needsAnyEdge).toEqual(["references", "calls", "instantiates"]);
    expect(detector.needsEdges).toBeUndefined();
  });

  it("los dos umbrales son CITADOS de Lanza & Marinescu, no pisos inventados", () => {
    const c = ctx();
    expect(c.threshold("minForeignMembers").value).toBe(2);
    expect(c.threshold("maxLocality").value).toBeCloseTo(1 / 3, 6);
  });

  it("agrupa por el MÓDULO envidiado (dos métodos que envidian lo mismo son un problema)", () => {
    expect(detector.groupKey!({ variant: "file:src/b/invoice.ts" } as never)).toBe("file:src/b/invoice.ts");
  });

  it("sin grafo no inventa nada", () => {
    expect(detector.run({ repoName: "x", files: [], functions: [], clones: [], graph: null }, ctx())).toEqual([]);
  });

  it("todo hallazgo trae los dos números con su umbral y al menos un lugar", () => {
    const g = baseGraph();
    for (const f of findingsOf(repoWith(g))) {
      expect(f.trigger.length).toBe(2);
      for (const t of f.trigger) expect(t.threshold).toBeDefined();
      expect(f.locations.length).toBeGreaterThanOrEqual(1);
      expect(f.advice.primary.name).toBe("Move Method");
      expect(f.detail).toContain("MAPEADOR");
    }
  });
});
