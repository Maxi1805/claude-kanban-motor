/**
 * P2 — `buildGraphIncremental`: entrada parcial + no bloqueante.
 *
 * Dos cosas se prueban acá, y son independientes (la tarea las pide así):
 *
 *   A. EQUIVALENCIA: para cualquier secuencia de ediciones (agregar archivo,
 *      cambiar uno sin tocar sus declaraciones, cambiar uno agregando una
 *      declaración que otro archivo referencia, borrar un archivo), el
 *      `CodeGraph` que produce `buildGraphIncremental` — alimentado con el
 *      `GraphBuildCache` de la corrida anterior — es IDÉNTICO (mismo
 *      conjunto de nodos, mismo conjunto de aristas, mismas
 *      `resolution.byStage`) al que produce `buildGraph` recalculando todo
 *      desde cero sobre el mismo `files` final. "Idéntico" se compara como
 *      CONJUNTO (ordenado antes de comparar), nunca por orden de array: un
 *      grafo es un conjunto de nodos/aristas, no una secuencia, y
 *      `assembleGraph` no promete reproducir el orden exacto de
 *      `buildGraph` en TODOS los casos (sólo cuando nada se reusa) — ver el
 *      docstring de `buildGraphIncremental` en `build.ts`.
 *   B. REUSO REAL: cuando un archivo no cambia y ningún nombre que
 *      referencia cambió de conjunto de declaraciones, su entrada en
 *      `GraphBuildCache.resolutionByFile`/`.nodesByFile` de la corrida
 *      siguiente es la MISMA REFERENCIA DE OBJETO que la de la corrida
 *      anterior — no sólo un valor igual, la prueba de que NO se volvió a
 *      calcular. Comparar sólo el `CodeGraph` de salida no probaría esto:
 *      un resultado idéntico podría haberse obtenido recalculando todo de
 *      cero, que es exactamente el bug que esta tarea existe para arreglar.
 */
import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { deriveNodeSets, type DerivedNodeSets, type ProbeNode } from "../code-grammar.js";
import type { AstNode } from "../detect/types.js";
import type { EdgeFacts } from "./edges/types.js";
import { extractReferences } from "./references.js";
import { extractSymbols } from "./symbols.js";
import { buildGraph, buildGraphIncremental, type GraphFileFacts } from "./build.js";
import type { CodeGraph, CodeGraphEdge, CodeGraphNode } from "./types.js";

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

/** Normaliza un `CodeGraph` a algo comparable como CONJUNTO (orden de array irrelevante). */
function normalize(graph: CodeGraph): {
  nodes: CodeGraphNode[];
  edges: CodeGraphEdge[];
  resolution: CodeGraph["resolution"];
} {
  const nodeKey = (n: CodeGraphNode) => n.id;
  const edgeKey = (e: CodeGraphEdge) => `${e.from}|${e.to}|${e.kind}|${e.provenance}|${e.weight}|${e.resolvedBy ?? ""}`;
  return {
    nodes: [...graph.nodes].sort((a, b) => nodeKey(a).localeCompare(nodeKey(b))),
    edges: [...graph.edges].sort((a, b) => edgeKey(a).localeCompare(edgeKey(b))),
    resolution: {
      ...graph.resolution,
      byStage: [...graph.resolution.byStage].sort((a, b) => a.order - b.order),
    },
  };
}

function expectSameGraph(incremental: CodeGraph, full: CodeGraph): void {
  expect(normalize(incremental)).toEqual(normalize(full));
}

const BASE_FILES = {
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
};

describe("buildGraphIncremental — equivalencia con buildGraph (A)", () => {
  it("build en frío (previous=null): idéntico a buildGraph", async () => {
    const files = await facts(BASE_FILES);
    const full = buildGraph(files);
    const { graph } = await buildGraphIncremental(files, null, null);
    expectSameGraph(graph, full);
  });

  it("tras cambiar UN archivo sin tocar sus propias declaraciones: idéntico a buildGraph sobre el árbol nuevo", async () => {
    const filesV1 = await facts(BASE_FILES);
    const { cache: cacheV1 } = await buildGraphIncremental(filesV1, null, null);

    const filesV2 = await facts({
      ...BASE_FILES,
      "lib/site.rb": `
class Site
  def render
    x = 1 + 1
    PathManager.join("a", "b")
  end
end
`,
    });
    const full = buildGraph(filesV2);
    const { graph } = await buildGraphIncremental(filesV2, cacheV1, new Set(["lib/site.rb"]));
    expectSameGraph(graph, full);
  });

  it("agregar un archivo que reabre un nombre ya declarado (ambigüedad nueva): idéntico a buildGraph, y el archivo QUE REFERENCIA el nombre se recalcula", async () => {
    const filesV1 = await facts(BASE_FILES);
    const { cache: cacheV1 } = await buildGraphIncremental(filesV1, null, null);

    const filesV2 = await facts({
      ...BASE_FILES,
      "lib/path_manager2.rb": `
class PathManager
  def self.join(a, b, c)
    "#{a}/#{b}/#{c}"
  end
end
`,
    });
    const full = buildGraph(filesV2);
    const { graph, cache: cacheV2 } = await buildGraphIncremental(filesV2, cacheV1, new Set(["lib/path_manager2.rb"]));
    expectSameGraph(graph, full);

    // La ambigüedad nueva tiene que reflejarse: PathManager.join ya no resuelve solo.
    const refs = graph.edges.filter((e) => e.kind === "references");
    expect(refs.find((e) => e.to === "sym:lib/path_manager.rb#PathManager.join")).toBeUndefined();

    // site.rb (quien referencia "join") tuvo que recalcularse — no es la misma referencia que en cacheV1.
    expect(cacheV2.resolutionByFile.get("lib/site.rb")).not.toBe(cacheV1.resolutionByFile.get("lib/site.rb"));
  });

  it("borrar el único archivo que declara un nombre: la referencia pasa a unresolved, idéntico a buildGraph", async () => {
    const filesV1 = await facts(BASE_FILES);
    const { cache: cacheV1 } = await buildGraphIncremental(filesV1, null, null);

    const { "lib/path_manager.rb": _removed, ...rest } = BASE_FILES;
    const filesV2 = await facts(rest);
    const full = buildGraph(filesV2);
    const { graph } = await buildGraphIncremental(filesV2, cacheV1, new Set());
    expectSameGraph(graph, full);

    const refs = graph.edges.filter((e) => e.kind === "references");
    expect(refs.find((e) => e.to.includes("PathManager"))).toBeUndefined();
  });

  it("varias ediciones encadenadas (3 corridas incrementales seguidas) siguen coincidiendo con buildGraph en cada paso", async () => {
    let files = await facts(BASE_FILES);
    let full = buildGraph(files);
    let { graph, cache } = await buildGraphIncremental(files, null, null);
    expectSameGraph(graph, full);

    files = await facts({
      ...BASE_FILES,
      "lib/unrelated.rb": `
class Unrelated
  def process
    each
    1 + 1
  end
end
`,
    });
    full = buildGraph(files);
    ({ graph, cache } = await buildGraphIncremental(files, cache, new Set(["lib/unrelated.rb"])));
    expectSameGraph(graph, full);

    files = await facts({
      ...BASE_FILES,
      "lib/unrelated.rb": `
class Unrelated
  def process
    each
    1 + 1
  end
end
`,
      "lib/extra.rb": `
class Extra
  def self.helper
    PathManager.join("x", "y")
  end
end
`,
    });
    full = buildGraph(files);
    ({ graph, cache } = await buildGraphIncremental(files, cache, new Set(["lib/extra.rb"])));
    expectSameGraph(graph, full);
  });
});

describe("buildGraphIncremental — reuso real, no sólo salida igual (B)", () => {
  it("un archivo no tocado, cuyas declaraciones ningún cambio afectó, reusa resolutionByFile/nodesByFile por REFERENCIA", async () => {
    const filesV1 = await facts(BASE_FILES);
    const { cache: cacheV1 } = await buildGraphIncremental(filesV1, null, null);

    const filesV2 = await facts({
      ...BASE_FILES,
      "lib/site.rb": `
class Site
  def render
    x = 1 + 1
    PathManager.join("a", "b")
  end
end
`,
    });
    const { cache: cacheV2 } = await buildGraphIncremental(filesV2, cacheV1, new Set(["lib/site.rb"]));

    // path_manager.rb, collection.rb y unrelated.rb no cambiaron y ningún
    // nombre que referencian cambió de conjunto de declaraciones: MISMA referencia.
    expect(cacheV2.resolutionByFile.get("lib/path_manager.rb")).toBe(cacheV1.resolutionByFile.get("lib/path_manager.rb"));
    expect(cacheV2.resolutionByFile.get("lib/collection.rb")).toBe(cacheV1.resolutionByFile.get("lib/collection.rb"));
    expect(cacheV2.resolutionByFile.get("lib/unrelated.rb")).toBe(cacheV1.resolutionByFile.get("lib/unrelated.rb"));
    expect(cacheV2.nodesByFile.get("lib/path_manager.rb")).toBe(cacheV1.nodesByFile.get("lib/path_manager.rb"));

    // site.rb sí cambió: nueva referencia (obviamente, es el archivo editado).
    expect(cacheV2.resolutionByFile.get("lib/site.rb")).not.toBe(cacheV1.resolutionByFile.get("lib/site.rb"));
  });

  it("un archivo cuyo nombre referenciado SÍ cambió de conjunto de declaraciones en otro archivo se recalcula (no reusa)", async () => {
    const filesV1 = await facts(BASE_FILES);
    const { cache: cacheV1 } = await buildGraphIncremental(filesV1, null, null);

    const filesV2 = await facts({
      ...BASE_FILES,
      "lib/path_manager2.rb": `
class PathManager
  def self.join(a, b, c)
    "#{a}/#{b}/#{c}"
  end
end
`,
    });
    const { cache: cacheV2 } = await buildGraphIncremental(filesV2, cacheV1, new Set(["lib/path_manager2.rb"]));

    // site.rb no cambió su propio contenido, pero SÍ referencia "join", cuyo
    // conjunto de declaraciones cambió (1 -> 2) — tiene que recalcularse.
    expect(cacheV2.resolutionByFile.get("lib/site.rb")).not.toBe(cacheV1.resolutionByFile.get("lib/site.rb"));
    // collection.rb/unrelated.rb no declaran ni referencian "join"/"PathManager": reusados.
    expect(cacheV2.resolutionByFile.get("lib/collection.rb")).toBe(cacheV1.resolutionByFile.get("lib/collection.rb"));
    expect(cacheV2.resolutionByFile.get("lib/unrelated.rb")).toBe(cacheV1.resolutionByFile.get("lib/unrelated.rb"));
  });

  it("con changed vacío y el mismo árbol exacto, TODO se reusa por referencia", async () => {
    const files = await facts(BASE_FILES);
    const { cache: cacheV1 } = await buildGraphIncremental(files, null, null);
    const { cache: cacheV2 } = await buildGraphIncremental(files, cacheV1, new Set());

    for (const path of Object.keys(BASE_FILES)) {
      expect(cacheV2.resolutionByFile.get(path)).toBe(cacheV1.resolutionByFile.get(path));
      expect(cacheV2.nodesByFile.get(path)).toBe(cacheV1.nodesByFile.get(path));
    }
  });
});

/**
 * P4 — `GraphFileFacts.edges` (EDGE_EXTRACTORS del lado consumidor) tiene
 * que respetar la MISMA garantía de equivalencia que `references` ya prueba
 * arriba: `buildGraphIncremental` con `edges` presentes en algún archivo
 * produce el MISMO `CodeGraph` que `buildGraph` sobre el mismo `files`, frío
 * o después de ediciones encadenadas, y reusa `resolutionByFile` por
 * REFERENCIA cuando ninguna declaración que una arista tipada referencia
 * cambió — mismo criterio que ya prueba (B) para `references`.
 */
function extendsFact(toName: string): EdgeFacts {
  return {
    extractorId: "herencia",
    kind: "extends",
    fromPath: ["Extra"],
    toName,
    toQualifier: [],
    provenance: "declared",
    startLine: 1,
    endLine: 1,
    via: "class -> superclass",
  };
}

describe("buildGraphIncremental — P4: equivalencia con buildGraph cuando `edges` está presente", () => {
  it("build en frío con una arista `extends` cross-file: idéntico a buildGraph", async () => {
    const files = await facts(BASE_FILES);
    const withEdges: GraphFileFacts[] = files.map((f) =>
      f.path === "lib/collection.rb" ? { ...f, edges: [extendsFact("PathManager")] } : f,
    );
    const full = buildGraph(withEdges);
    const { graph } = await buildGraphIncremental(withEdges, null, null);
    expectSameGraph(graph, full);
    expect(full.edges.filter((e) => e.kind === "extends")).toHaveLength(1);
  });

  it("tras una edición encadenada que NO toca la declaración referenciada por la arista tipada: idéntico a buildGraph y la contribución del archivo se reusa por referencia", async () => {
    const filesV1 = (await facts(BASE_FILES)).map((f) =>
      f.path === "lib/collection.rb" ? { ...f, edges: [extendsFact("PathManager")] } : f,
    );
    const { cache: cacheV1 } = await buildGraphIncremental(filesV1, null, null);

    const filesV2 = filesV1.map((f) =>
      f.path === "lib/unrelated.rb"
        ? {
            ...f,
            references: [...f.references], // sin cambios reales — sólo para simular "recorrido", el `changed` de abajo es lo que manda
          }
        : f,
    );
    const full = buildGraph(filesV2);
    const { graph, cache: cacheV2 } = await buildGraphIncremental(filesV2, cacheV1, new Set(["lib/unrelated.rb"]));
    expectSameGraph(graph, full);
    expect(graph.edges.filter((e) => e.kind === "extends")).toHaveLength(1);
    // collection.rb (declarante de la arista tipada) no cambió y "PathManager"
    // no cambió de conjunto de declaraciones en otro lado: se reusa.
    expect(cacheV2.resolutionByFile.get("lib/collection.rb")).toBe(cacheV1.resolutionByFile.get("lib/collection.rb"));
  });

  it("agregar una declaración que AMBIGÜIZA el destino de la arista tipada: la arista `extends` pasa a `provenance: \"ambiguous\"` (CONTRATO-F9.md §4 — ya no se descarta en silencio) y la contribución del archivo declarante se recalcula", async () => {
    const filesV1 = (await facts(BASE_FILES)).map((f) =>
      f.path === "lib/collection.rb" ? { ...f, edges: [extendsFact("PathManager")] } : f,
    );
    const { cache: cacheV1 } = await buildGraphIncremental(filesV1, null, null);

    const filesV2: GraphFileFacts[] = [
      ...filesV1,
      {
        path: "lib/path_manager2.rb",
        language: "ruby",
        symbols: (await facts({ "lib/path_manager2.rb": "class PathManager\nend\n" }))[0]!.symbols,
        references: [],
      },
    ];
    const full = buildGraph(filesV2);
    const { graph, cache: cacheV2 } = await buildGraphIncremental(filesV2, cacheV1, new Set(["lib/path_manager2.rb"]));
    expectSameGraph(graph, full);
    // Antes de CONTRATO-F9.md §4 (Contrato 4), un candidato ambiguo se
    // descartaba en silencio (0 aristas `extends`). Ahora se conserva como
    // UNA arista `provenance: "ambiguous"` con los 2 `PathManager` posibles
    // en `to`/`alternatives` — "sabemos que hay relación, no cuál".
    const extendsEdges = graph.edges.filter((e) => e.kind === "extends");
    expect(extendsEdges).toHaveLength(1);
    expect(extendsEdges[0]!.provenance).toBe("ambiguous");
    expect(extendsEdges[0]!.alternatives).toHaveLength(1);
    expect(cacheV2.resolutionByFile.get("lib/collection.rb")).not.toBe(cacheV1.resolutionByFile.get("lib/collection.rb"));
  });
});

describe("buildGraphIncremental — no bloquea de un solo tirón (cede el event loop)", () => {
  it("llama setImmediate (el mismo punto de cesión que code-analyzer.ts#yieldToEventLoop) al menos una vez durante una corrida en frío", async () => {
    // No se confía en el reloj de pared (`INCREMENTAL_YIELD_BUDGET_MS` podría
    // no dispararse nunca en una corrida chica y rápida en CI) — se espía
    // `setImmediate` directamente: `createSlicer`/`yieldToEventLoop` en
    // `build.ts` SIEMPRE ceden así, nunca con `setTimeout`/`Promise.resolve`
    // solo, así que verlo invocado es la prueba directa de que al menos un
    // tramo síncrono terminó y le devolvió el control al event loop en vez
    // de encadenar todo el trabajo de un solo tirón.
    const many: Record<string, string> = {};
    for (let i = 0; i < 200; i++) {
      many[`lib/gen_${i}.rb`] = `
class Gen${i}
  def self.build(x)
    PathManager.join(x, "${i}")
    each
  end
end
`;
    }
    const files = await facts({ ...BASE_FILES, ...many });

    const realSetImmediate = global.setImmediate;
    const spy = vi.spyOn(global, "setImmediate").mockImplementation(((...args: Parameters<typeof setImmediate>) =>
      realSetImmediate(...args)) as typeof setImmediate);

    const { graph } = await buildGraphIncremental(files, null, null);

    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("una corrida incremental cuyo cambio SÍ propaga a muchos archivos (nombre compartido por todos) también cede", async () => {
    // Distinto del caso feliz de arriba: acá el nombre que cambia
    // ("PathManager"/"join") lo referencian TODOS los archivos generados, así
    // que `dirtyForResolution` termina siendo casi tan grande como en frío —
    // el escenario real de "un archivo hub cambió" que sí puede tardar, y
    // que por eso tiene que trocear igual que la corrida en frío.
    const many: Record<string, string> = {};
    for (let i = 0; i < 200; i++) {
      many[`lib/gen_${i}.rb`] = `
class Gen${i}
  def self.build(x)
    PathManager.join(x, "${i}")
  end
end
`;
    }
    const filesV1 = await facts({ ...BASE_FILES, ...many });
    const { cache } = await buildGraphIncremental(filesV1, null, null);

    const filesV2 = await facts({
      ...BASE_FILES,
      ...many,
      "lib/path_manager2.rb": `
class PathManager
  def self.join(a, b, c)
    "#{a}/#{b}/#{c}"
  end
end
`,
    });

    const realSetImmediate = global.setImmediate;
    const spy = vi.spyOn(global, "setImmediate").mockImplementation(((...args: Parameters<typeof setImmediate>) =>
      realSetImmediate(...args)) as typeof setImmediate);

    const { graph } = await buildGraphIncremental(filesV2, cache, new Set(["lib/path_manager2.rb"]));

    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
