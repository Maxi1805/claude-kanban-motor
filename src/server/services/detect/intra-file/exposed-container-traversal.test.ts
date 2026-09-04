import { describe, expect, it } from "vitest";

import {
  detector,
  exposedContainerFunnelOf,
  halfDoorMembersOf,
  traversalSitesOf,
  MIN_CLIENT_FILES,
  EXPOSED_CONTAINER_TRAVERSAL_KIND,
} from "./exposed-container-traversal.js";
import { DETECTORS } from "../registry.js";
import { DETECTOR_IMPACT } from "../impact.js";
import { fileUnitFrom, nodeSetsFor, parseRoot, testContext } from "../testing.js";
import { withGraph } from "../primitivas/u1-grafo-en-contexto.js";
import { EDGE_ROLE_RECEIVER_MEMBER, type CodeGraph, type CodeGraphEdge, type CodeGraphNode } from "../../graph/types.js";
import type { FileUnit, RawFinding } from "../types.js";

/**
 * Sonda: clase + método CON parámetros + lazo + subíndice — `deriveNodeSets`
 * sólo clasifica los tipos de nodo que la sonda CONTIENE, así que una sonda
 * sin lazo ni clase deja al detector mudo por culpa de la sonda y no del
 * detector (misma trampa que documenta `optional-behavior-flags.test.ts`).
 */
const JS_PROBE = `
function probe(value) {
  for (let i = 0; i < value.length; i++) { console.log(value.items[i]); }
  if (value) { return 1; } else { return 2; }
}
class Probe {
  constructor(seed) { this.seed = seed; }
  run(value) {
    for (let i = 0; i < value.length; i++) { console.log(value.items[i]); }
    if (value) { return 1; } else { return 2; }
  }
}
`;
const PY_PROBE = `
def probe(value):
    i = 0
    while i < 3:
        print(value.items[i])
        i += 1
    if value:
        return 1
    else:
        return 2


class Probe:
    def __init__(self, seed):
        self.seed = seed

    def run(self, value):
        i = 0
        while i < 3:
            print(value.items[i])
            i += 1
        if value:
            return 1
        else:
            return 2
`;
const RB_PROBE = `
def probe(value)
  i = 0
  while i < 3
    puts value.items[i]
    i += 1
  end
  if value
    1
  else
    2
  end
end

class Probe
  def initialize(seed)
    @seed = seed
  end

  def run(value)
    i = 0
    while i < 3
      puts value.items[i]
      i += 1
    end
    if value
      1
    else
      2
    end
  end
end
`;
const GO_PROBE = `
package p

func probe(value Holder) int {
	for i := 0; i < 3; i++ {
		_ = value.items[i]
	}
	if value.n > 0 {
		return 1
	}
	return 2
}

type Probe struct{}

func (p *Probe) Run(value Holder) int {
	for i := 0; i < 3; i++ {
		_ = value.items[i]
	}
	if value.n > 0 {
		return 1
	}
	return 2
}
`;

const CLIENT_FILE = "client.js";
const OWNER_FILE = "owner.js";
const OWNER_ID = `sym:${OWNER_FILE}#Holder`;
const CONTAINER_ID = `sym:${OWNER_FILE}#Holder.items`;
const CLIENT_SYMBOL_ID = `sym:${CLIENT_FILE}#walk`;

function node(over: Partial<CodeGraphNode> & { id: string; file: string; symbolPath: string[] }): CodeGraphNode {
  return { kind: "symbol", family: "other", ...over } as CodeGraphNode;
}

function edge(from: string, to: string, over: Partial<CodeGraphEdge> = {}): CodeGraphEdge {
  return { from, to, kind: "references", provenance: "resolved", weight: 1, ...over } as CodeGraphEdge;
}

/** El grafo canónico: `Holder.items` en otro archivo, alcanzado desde `n` archivos cliente. */
function graphWith(options: {
  clients?: number;
  ownerFamily?: CodeGraphNode["family"];
  containerFile?: string;
  extraNodes?: CodeGraphNode[];
  extraEdges?: CodeGraphEdge[];
  ambiguous?: boolean;
  clientFile?: string;
} = {}): CodeGraph {
  const clients = options.clients ?? MIN_CLIENT_FILES;
  const containerFile = options.containerFile ?? OWNER_FILE;
  const clientFile = options.clientFile ?? CLIENT_FILE;
  const nodes: CodeGraphNode[] = [
    node({ id: OWNER_ID, file: containerFile, symbolPath: ["Holder"], family: options.ownerFamily ?? "class-like" }),
    node({ id: CONTAINER_ID, file: containerFile, symbolPath: ["Holder", "items"], family: "other" }),
    node({ id: CLIENT_SYMBOL_ID, file: clientFile, symbolPath: ["walk"], family: "function-like", arity: 1 }),
    ...(options.extraNodes ?? []),
  ];
  const edges: CodeGraphEdge[] = [
    edge(OWNER_ID, CONTAINER_ID, { kind: "contains", provenance: "declared" }),
    edge(CLIENT_SYMBOL_ID, CONTAINER_ID, {
      roles: EDGE_ROLE_RECEIVER_MEMBER,
      provenance: options.ambiguous ? "ambiguous" : "resolved",
      ...(options.ambiguous ? { alternatives: ["sym:otro.js#Otro.items"] } : {}),
    }),
    ...(options.extraEdges ?? []),
  ];
  // Los demás archivos cliente: sólo referencian el contenedor, no lo recorren
  // (es exactamente lo que la condición (4) cuenta y lo que el detector declara
  // que NO prueba: que los demás también recorran).
  for (let i = 1; i < clients; i++) {
    const id = `sym:cliente${i}.js#usa`;
    nodes.push(node({ id, file: `cliente${i}.js`, symbolPath: ["usa"], family: "function-like", arity: 0 }));
    edges.push(edge(id, CONTAINER_ID, { roles: EDGE_ROLE_RECEIVER_MEMBER, provenance: "ambiguous" }));
  }
  return { nodes, edges, resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] } } as CodeGraph;
}

async function unitFor(source: string, opts: { probe?: string; wasm?: string; language?: string; file?: string } = {}): Promise<FileUnit> {
  const wasm = opts.wasm ?? "tree-sitter-javascript.wasm";
  const probe = opts.probe ?? JS_PROBE;
  const language = opts.language ?? "javascript";
  const sets = await nodeSetsFor(wasm, probe);
  const root = await parseRoot(wasm, source);
  return fileUnitFrom(root, sets, language, { file: opts.file ?? CLIENT_FILE });
}

async function runOn(source: string, graph: CodeGraph | null, opts: Parameters<typeof unitFor>[1] = {}): Promise<readonly RawFinding[]> {
  const file = await unitFor(source, opts);
  const ctx = withGraph(testContext(detector, opts.language ?? "javascript"), graph);
  return detector.run(file, ctx);
}

/** El cliente recorre POR POSICIÓN el contenedor de otro tipo. */
const CANONICAL = `
function walk(holder) {
  let i = 0;
  while (i < 10) {
    process(holder.items[i]);
    i++;
  }
}
`;

describe("exposed-container-traversal — la forma completa", () => {
  it("emite cuando un cliente recorre por posición el contenedor de un tipo declarado en otro archivo, alcanzado por >= 3 archivos", async () => {
    const findings = await runOn(CANONICAL, graphWith());
    expect(findings).toHaveLength(1);
    expect(findings[0]!.title).toContain("items");
    expect(findings[0]!.title).toContain("Holder");
    expect(findings[0]!.trigger[0]!.value).toBe(MIN_CLIENT_FILES);
    expect(findings[0]!.locations[0]!.role).toContain("recorrido posicional");
  });

  it("publica el dueño y los archivos cliente como evidencia", async () => {
    const findings = await runOn(CANONICAL, graphWith({ clients: 5 }));
    const evidence = findings[0]!.evidence ?? [];
    const labels = evidence.map((e) => e.label);
    expect(labels).toContain("archivos cliente distintos");
    expect(labels).toContain("dueño del contenedor");
    expect(evidence.find((e) => e.label === "archivos cliente distintos")!.value).toBe(5);
  });
});

describe("exposed-container-traversal — (1) el recorrido tiene que ser POSICIONAL", () => {
  it("calla con un índice CONSTANTE: leer `holder.items[0]` no es recorrer", async () => {
    const src = `
function walk(holder) {
  let i = 0;
  i++;
  return holder.items[0];
}
`;
    expect(await runOn(src, graphWith())).toHaveLength(0);
  });

  it("calla con una lectura por CLAVE: `holder.items[\"k\"]` no expone ninguna posición", async () => {
    const src = `
function walk(holder) {
  let i = 0;
  i++;
  return holder.items["k"];
}
`;
    expect(await runOn(src, graphWith())).toHaveLength(0);
  });

  it("calla cuando NO hay cursor: un índice que nunca se incrementa no es un recorrido", async () => {
    const src = `
function walk(holder, k) {
  return holder.items[k];
}
`;
    expect(await runOn(src, graphWith())).toHaveLength(0);
  });
});

describe("exposed-container-traversal — (2) el contenedor tiene que ser DE OTRO", () => {
  it("calla sobre el contenedor PROPIO: `this.items[i]` es el recorrido adentro del dueño, no una exposición", async () => {
    const src = `
class Holder {
  walk() {
    let i = 0;
    while (i < 10) { process(this.items[i]); i++; }
  }
}
`;
    expect(await runOn(src, graphWith())).toHaveLength(0);
  });

  it("calla sobre un arreglo recibido por PARÁMETRO: no hay ningún tipo cuya representación ocultar (el falso que la Ola V midió en guava/Floats.java)", async () => {
    const src = `
function min(array) {
  let i = 0;
  let m = array[0];
  while (i < array.length) { m = Math.min(m, array[i]); i++; }
  return m;
}
`;
    expect(await runOn(src, graphWith())).toHaveLength(0);
  });

  it("en Go, el receptor del método cuenta como propio", async () => {
    const src = `
package p

type Holder struct{}

func (h *Holder) Walk() {
	for i := 0; i < 10; i++ {
		_ = h.items[i]
	}
}
`;
    const findings = await runOn(src, graphWith({ containerFile: "owner.go" }), {
      wasm: "tree-sitter-go.wasm",
      probe: GO_PROBE,
      language: "go",
      file: "client.go",
    });
    expect(findings).toHaveLength(0);
  });
});

describe("exposed-container-traversal — el subíndice ANIDADO no inventa un miembro", () => {
  /**
   * REGRESIÓN MEDIDA: la primera versión leía el índice de un subíndice
   * anidado (`a[i][j]`) como si fuera un nombre de miembro — 71 de 71
   * candidatos sintácticos del corpus salían así.
   */
  it("`a[i][j]` no produce ningún sitio de recorrido", async () => {
    const src = `
function walk(a) {
  let i = 0, j = 0;
  while (i < 10) { process(a[i][j]); i++; j++; }
}
`;
    const file = await unitFor(src);
    for (const fn of file.functions) expect(traversalSitesOf(fn)).toHaveLength(0);
  });
});

describe("exposed-container-traversal — (3) el dueño tiene que ser un tipo de OTRO archivo", () => {
  it("calla si el dueño vive en el MISMO archivo: ahí la mitigación barata es un método privado", async () => {
    expect(await runOn(CANONICAL, graphWith({ containerFile: CLIENT_FILE }))).toHaveLength(0);
  });

  it("calla si el contenedor no cuelga de un nodo class-like/namespace-like", async () => {
    expect(await runOn(CANONICAL, graphWith({ ownerFamily: "function-like" }))).toHaveLength(0);
  });

  it("calla sin grafo: `needsGraph` es RUTEO, y sin grafo este detector no adivina un dueño", async () => {
    expect(await runOn(CANONICAL, null)).toHaveLength(0);
  });
});

describe("exposed-container-traversal — (4) ESCALA", () => {
  it(`calla con menos de ${MIN_CLIENT_FILES} archivos cliente: con dos, extraer una función compartida es más barato que un iterador`, async () => {
    expect(await runOn(CANONICAL, graphWith({ clients: MIN_CLIENT_FILES - 1 }))).toHaveLength(0);
  });

  it(`emite justo en ${MIN_CLIENT_FILES}`, async () => {
    expect(await runOn(CANONICAL, graphWith({ clients: MIN_CLIENT_FILES }))).toHaveLength(1);
  });
});

describe("exposed-container-traversal — (5) RESOLUCIÓN VERIFICADA: los dos silencios", () => {
  it("(5a) calla cuando el dueño YA formaliza un protocolo: interfaz con >= 2 implementadores y miembro común de aridad 0", async () => {
    const IFACE = "sym:iterable.js#Iterable";
    const graph = graphWith({
      extraNodes: [
        node({ id: IFACE, file: "iterable.js", symbolPath: ["Iterable"], family: "class-like" }),
        node({ id: `${IFACE}.each`, file: "iterable.js", symbolPath: ["Iterable", "each"], family: "function-like", arity: 0 }),
        node({ id: `${OWNER_ID}.each`, file: OWNER_FILE, symbolPath: ["Holder", "each"], family: "function-like", arity: 0 }),
        node({ id: "sym:otro.js#Otro", file: "otro.js", symbolPath: ["Otro"], family: "class-like" }),
      ],
      extraEdges: [
        edge(IFACE, `${IFACE}.each`, { kind: "contains", provenance: "declared" }),
        edge(OWNER_ID, `${OWNER_ID}.each`, { kind: "contains", provenance: "declared" }),
        edge(OWNER_ID, IFACE, { kind: "implements", provenance: "declared" }),
        edge("sym:otro.js#Otro", IFACE, { kind: "implements", provenance: "declared" }),
      ],
    });
    expect(await runOn(CANONICAL, graph)).toHaveLength(0);
  });

  it("(5b) calla cuando el dueño ya publica un miembro de aridad 0 que toca el contenedor y >= 2 clientes lo llaman", async () => {
    const DOOR = `${OWNER_ID}.each`;
    const graph = graphWith({
      extraNodes: [node({ id: DOOR, file: OWNER_FILE, symbolPath: ["Holder", "each"], family: "function-like", arity: 0 })],
      extraEdges: [
        edge(OWNER_ID, DOOR, { kind: "contains", provenance: "declared" }),
        edge(DOOR, CONTAINER_ID, { roles: EDGE_ROLE_RECEIVER_MEMBER }),
        edge("sym:cliente1.js#usa", DOOR, { kind: "calls" }),
        edge(CLIENT_SYMBOL_ID, DOOR, { kind: "calls" }),
      ],
    });
    expect(await runOn(CANONICAL, graph)).toHaveLength(0);
  });

  it("(5b) NO calla si esa puerta existe pero NADIE la llama: media puerta escrita sigue siendo una recomendación", async () => {
    const DOOR = `${OWNER_ID}.each`;
    const graph = graphWith({
      extraNodes: [node({ id: DOOR, file: OWNER_FILE, symbolPath: ["Holder", "each"], family: "function-like", arity: 0 })],
      extraEdges: [
        edge(OWNER_ID, DOOR, { kind: "contains", provenance: "declared" }),
        edge(DOOR, CONTAINER_ID, { roles: EDGE_ROLE_RECEIVER_MEMBER }),
      ],
    });
    expect(await runOn(CANONICAL, graph)).toHaveLength(1);
    expect(halfDoorMembersOf(graph, OWNER_ID, CONTAINER_ID)).toEqual(["each"]);
  });

  it("sin puerta escrita, `halfDoorMembersOf` devuelve vacío", () => {
    expect(halfDoorMembersOf(graphWith(), OWNER_ID, CONTAINER_ID)).toEqual([]);
  });
});

describe("exposed-container-traversal — la ambigüedad viaja como ambigüedad", () => {
  it("usa la arista ambigua (sin ella el ancla emite CERO en el corpus) y lo DICE en la evidencia", async () => {
    const findings = await runOn(CANONICAL, graphWith({ ambiguous: true }));
    expect(findings).toHaveLength(1);
    const owner = (findings[0]!.evidence ?? []).find((e) => e.label === "dueño del contenedor")!;
    expect(owner.note).toContain("AMBIGUA");
    expect(owner.note).toContain("alternativo");
  });

  it("cuando la resolución NO es ambigua, también lo dice", async () => {
    const findings = await runOn(CANONICAL, graphWith());
    const owner = (findings[0]!.evidence ?? []).find((e) => e.label === "dueño del contenedor")!;
    expect(owner.note).toContain("no ambigua");
  });
});

describe("exposed-container-traversal — los 9 lenguajes, no sólo JS", () => {
  it("python", async () => {
    const src = `
def walk(holder):
    i = 0
    while i < 10:
        process(holder.items[i])
        i += 1
`;
    const findings = await runOn(src, graphWith({ containerFile: "owner.py", clientFile: "client.py" }), {
      wasm: "tree-sitter-python.wasm",
      probe: PY_PROBE,
      language: "python",
      file: "client.py",
    });
    expect(findings).toHaveLength(1);
  });

  it("ruby", async () => {
    const src = `
def walk(holder)
  i = 0
  while i < 10
    process(holder.items[i])
    i += 1
  end
end
`;
    const findings = await runOn(src, graphWith({ containerFile: "owner.rb", clientFile: "client.rb" }), {
      wasm: "tree-sitter-ruby.wasm",
      probe: RB_PROBE,
      language: "ruby",
      file: "client.rb",
    });
    expect(findings).toHaveLength(1);
  });

  it("go", async () => {
    const src = `
package p

func Walk(holder Holder) {
	for i := 0; i < 10; i++ {
		process(holder.items[i])
	}
}
`;
    const findings = await runOn(src, graphWith({ containerFile: "owner.go", clientFile: "client.go" }), {
      wasm: "tree-sitter-go.wasm",
      probe: GO_PROBE,
      language: "go",
      file: "client.go",
    });
    expect(findings).toHaveLength(1);
  });
});

describe("exposed-container-traversal — el embudo es auditable", () => {
  it("`exposedContainerFunnelOf` nombra el escalón exacto donde se cae cada candidato", async () => {
    const file = await unitFor(CANONICAL);
    expect(exposedContainerFunnelOf(file, graphWith(), MIN_CLIENT_FILES).map((e) => e.stage)).toEqual(["pasa"]);
    expect(exposedContainerFunnelOf(file, graphWith({ clients: 1 }), MIN_CLIENT_FILES).map((e) => e.stage)).toEqual(["pocos-clientes"]);
    expect(exposedContainerFunnelOf(file, graphWith({ containerFile: CLIENT_FILE }), MIN_CLIENT_FILES).map((e) => e.stage)).toEqual(["sin-dueno"]);
  });
});

describe("exposed-container-traversal — contrato de registro", () => {
  it("está registrado, es intra-file y pide el grafo", () => {
    const registered = DETECTORS.find((d) => d.id === "exposed-container-traversal");
    expect(registered).toBeDefined();
    expect(registered).toBe(detector);
    expect(detector.scope).toBe("intra-file");
    expect(detector.kind).toBe(EXPOSED_CONTAINER_TRAVERSAL_KIND);
    expect(detector.needsGraph).toBe(true);
  });

  it("tiene tier de impacto declarado", () => {
    expect(DETECTOR_IMPACT["exposed-container-traversal"]).toBe("arquitectura");
  });

  it("su único umbral está declarado con su razón", () => {
    const spec = detector.thresholds.archivosCliente;
    expect(spec.kind).toBe("piso-declarado");
    expect(spec.kind === "piso-declarado" && spec.value).toBe(MIN_CLIENT_FILES);
  });
});

describe("exposed-container-traversal — (U) el cursor acotado por el propio contenedor (Ola AU, AU4)", () => {
  /**
   * EL NÚMERO QUE MOTIVA EL HECHO: 0 verdaderos de 7 juzgados, y de esos 7
   * falsos DOS son `sourceCode.lines[i - 1]` de eslint dentro de la
   * construcción de la ubicación de un report — *"acceso aleatorio por número
   * de línea, NO un recorrido"*, dice el veredicto. Ver el docstring de
   * `TraversalSite#boundedByContainer`.
   *
   * EL HECHO NO ES COMPUERTA en esta ola: viaja como evidencia. Estos tests
   * verifican que el hecho DISTINGUE, que es lo único que hace falta para que
   * la medición valga.
   */
  it("marca `boundedByContainer` cuando el encabezado del loop menciona el contenedor y el cursor", async () => {
    const file = await unitFor(`
function walk(holder) {
  for (let i = 0; i < holder.items.length; i++) {
    process(holder.items[i]);
  }
}
`);
    const sites = file.functions.flatMap((fn) => [...traversalSitesOf(fn)]);
    expect(sites).toHaveLength(1);
    expect(sites[0]!.member).toBe("items");
    expect(sites[0]!.boundedByContainer).toBe(true);
  });

  it("NO lo marca cuando el cursor viene de un loop sobre otra cosa: es acceso aleatorio, no recorrido", async () => {
    const file = await unitFor(`
function report(holder, problems) {
  let i = 0;
  for (const problem of problems) {
    i = problem.line;
    emit(holder.lines[i - 1]);
  }
  i++;
}
`);
    const sites = file.functions.flatMap((fn) => [...traversalSitesOf(fn)]);
    expect(sites).toHaveLength(1);
    expect(sites[0]!.member).toBe("lines");
    expect(sites[0]!.boundedByContainer).toBe(false);
  });

  it("NO lo marca sin ningún loop: dos lecturas por índice seguidas no recorren nada", async () => {
    const file = await unitFor(`
function firstSpecial(holder) {
  let n = 0;
  n += 1;
  const a = holder.tokens[n];
  n += 1;
  return holder.tokens[n] || a;
}
`);
    const sites = file.functions.flatMap((fn) => [...traversalSitesOf(fn)]);
    expect(sites.length).toBeGreaterThan(0);
    for (const s of sites) expect(s.boundedByContainer).toBe(false);
  });

  it("el hecho NO es compuerta: el caso canónico, con el cursor SIN acotar, sigue emitiendo igual", async () => {
    expect(await runOn(CANONICAL, graphWith())).toHaveLength(1);
  });
});
