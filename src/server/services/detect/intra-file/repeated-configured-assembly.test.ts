/**
 * `repeated-configured-assembly` — el ancla-FUERZA de Prototype
 * (Ola AE, frente AE12).
 *
 * CÓMO ESTÁ ORGANIZADO, y por qué: cada condición del detector existe para
 * cortar un falso concreto, así que cada una tiene acá su test de FORMA
 * COMPLETA (la condición se cumple ⇒ dispara) y su test de EXCLUSIÓN (no se
 * cumple ⇒ SILENCIO). Un detector cuyas exclusiones no están probadas no tiene
 * exclusiones: tiene comentarios.
 *
 * Y los tests que valen más que todos son los TRES DE LA TRAMPA — las tres
 * formas de la condición (3), RESOLUCIÓN VERIFICADA: cuando el prototipo YA
 * ESTÁ (el tipo declara un miembro que lo construye; alguno de los sitios vive
 * dentro del propio tipo; dos o más puntos ya pasan por una puerta de armado
 * compartida) este detector tiene que quedarse CALLADO. Descubrir patrones ya
 * aplicados es exactamente lo contrario del objetivo.
 */
import { describe, expect, it } from "vitest";

import { detector } from "./repeated-configured-assembly.js";
import { DETECTOR_IMPACT } from "../impact.js";
import { DETECTORS } from "../registry.js";
import { fileUnitFrom, nodeSetsFor, parseRoot, testContext } from "../testing.js";
import type { RawFinding, RunContext } from "../types.js";
import type { CodeGraph, CodeGraphEdge, CodeGraphNode, GraphIndex } from "../../graph/types.js";

const TS_PROBE = `
class Probe {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  run(value: number): number { return value; }
}
function probe(x: number): number { return x; }
`;

const GO_PROBE = `
package p

type Probe struct{ seed int }

func (p *Probe) Run(value int) int { return value }
`;

function symbolNode(id: string, file: string, symbolPath: string[], family: CodeGraphNode["family"]): CodeGraphNode {
  return { id, kind: "symbol", file, symbolPath, family };
}

function edge(from: string, to: string, kind: CodeGraphEdge["kind"]): CodeGraphEdge {
  return { from, to, kind, provenance: "declared", weight: 1 };
}

function graphOf(nodes: CodeGraphNode[], edges: CodeGraphEdge[]): CodeGraph {
  return { nodes, edges, resolution: {} as never };
}

/** El grafo mínimo que hace falta para que "Options" sea un TIPO de este repo. */
const OPTIONS_TYPE_ONLY = graphOf([symbolNode("sym:otro.ts#Options", "otro.ts", ["Options"], "class-like")], []);

interface Corrida {
  source: string;
  graph: CodeGraph | null;
  wasm?: string;
  probe?: string;
  language?: string;
  path?: string;
}

async function corre({ source, graph, wasm = "tree-sitter-typescript.wasm", probe = TS_PROBE, language = "typescript", path = "a.ts" }: Corrida): Promise<readonly RawFinding[]> {
  const sets = await nodeSetsFor(wasm, probe);
  const root = await parseRoot(wasm, source);
  const file = fileUnitFrom(root, sets, language, { file: path });
  const byId = new Map((graph?.nodes ?? []).map((n) => [n.id, n] as const));
  const from = new Map<string, CodeGraphEdge[]>();
  for (const e of graph?.edges ?? []) {
    const list = from.get(e.from);
    if (list) list.push(e);
    else from.set(e.from, [e]);
  }
  const index: GraphIndex = { nodeById: (id) => byId.get(id) ?? null, edgesFrom: (id) => from.get(id) ?? [] };
  const ctx: RunContext<never> = {
    ...(testContext(detector, language) as unknown as RunContext<never>),
    graph,
    graphIndex: () => (graph ? index : null),
  };
  return detector.run(file, ctx as never);
}

/**
 * LA FORMA COMPLETA, posicional (TypeScript): tres puntos distintos arman
 * `Options` con las MISMAS cuatro ranuras; tres llevan el valor idéntico y una
 * varía.
 */
const TS_FORMA_COMPLETA = `
function forA(): Options {
  return new Options(3, 1000, false, "alfa");
}
function forB(): Options {
  return new Options(3, 1000, false, "beta");
}
function forC(): Options {
  return new Options(3, 1000, false, "gamma");
}
`;

describe("repeated-configured-assembly — la forma completa", () => {
  it("TypeScript, ranuras posicionales: 3 puntos rearman el mismo objeto, 3 ranuras coinciden y 1 varía ⇒ 1 hallazgo con los 3 puntos anclados", async () => {
    const findings = await corre({ source: TS_FORMA_COMPLETA, graph: OPTIONS_TYPE_ONLY });
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.title).toContain('"Options"');
    expect(f.locations).toHaveLength(3);
    expect(f.trigger[0]!.value).toBe(3); // puntos
    expect(f.trigger[1]!.value).toBe(3); // ranuras coincidentes
    expect(f.trigger[2]!.value).toBe(1); // ranuras que varían
  });

  it("Go, ranuras CON NOMBRE (literal compuesto): la misma forma se reconoce por nombre de campo, no por posición", async () => {
    const source = `
package p

func forA() Options {
	return Options{Retries: 3, Timeout: 1000, Verbose: false, Tag: "alfa"}
}

func forB() Options {
	return Options{Retries: 3, Timeout: 1000, Verbose: false, Tag: "beta"}
}

func forC() Options {
	return Options{Retries: 3, Timeout: 1000, Verbose: false, Tag: "gamma"}
}
`;
    const findings = await corre({
      source,
      graph: graphOf([symbolNode("sym:otro.go#Options", "otro.go", ["Options"], "class-like")], []),
      wasm: "tree-sitter-go.wasm",
      probe: GO_PROBE,
      language: "go",
      path: "a.go",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.detail).toContain("Retries=3");
    expect(findings[0]!.detail).toContain("Tag");
  });
});

const CSHARP_PROBE = `
class Probe {
  private int seed;
  Probe(int seed) { this.seed = seed; }
  int Run(int value) { return value; }
}
`;

describe("repeated-configured-assembly — el armado repartido en DOS contenedores (C#)", () => {
  it("`new Options(a) { X = 1, Y = 2 }`: argumentos E inicializador de objeto son EL MISMO armado, y se leen los dos", async () => {
    const source = `
class Uses {
  Options ForA() {
    return new Options(3) { Timeout = 1000, Verbose = false, Tag = "alfa" };
  }
  Options ForB() {
    return new Options(3) { Timeout = 1000, Verbose = false, Tag = "beta" };
  }
  Options ForC() {
    return new Options(3) { Timeout = 1000, Verbose = false, Tag = "gamma" };
  }
}
`;
    const findings = await corre({
      source,
      graph: graphOf([symbolNode("sym:otro.cs#Options", "otro.cs", ["Options"], "class-like")], []),
      wasm: "tree-sitter-c_sharp.wasm",
      probe: CSHARP_PROBE,
      language: "csharp",
      path: "a.cs",
    });
    expect(findings).toHaveLength(1);
    // 4 ranuras: la posicional del constructor MÁS las tres del inicializador.
    expect(findings[0]!.evidence?.find((e) => e.label.includes("ranuras configuradas"))?.value).toBe(4);
    expect(findings[0]!.trigger[1]!.value).toBe(3); // coincidentes: #0=3, Timeout, Verbose
    expect(findings[0]!.trigger[2]!.value).toBe(1); // varía: Tag
  });
});

describe("repeated-configured-assembly — (2) ESCALA, una exclusión por piso", () => {
  it("DOS puntos y no tres ⇒ CERO: con dos, la mitigación barata es extraer una función de construcción compartida", async () => {
    const source = `
function forA(): Options {
  return new Options(3, 1000, false, "alfa");
}
function forB(): Options {
  return new Options(3, 1000, false, "beta");
}
`;
    expect(await corre({ source, graph: OPTIONS_TYPE_ONLY })).toHaveLength(0);
  });

  it("sólo DOS ranuras coinciden ⇒ CERO: lo compartido es un valor, no un estado", async () => {
    const source = `
function forA(): Options {
  return new Options(3, 1000, false, "alfa");
}
function forB(): Options {
  return new Options(3, 1000, true, "beta");
}
function forC(): Options {
  return new Options(3, 1000, true, "gamma");
}
`;
    // coinciden #0 y #1; varían #2 y #3 ⇒ 2 coincidentes < 3
    expect(await corre({ source, graph: OPTIONS_TYPE_ONLY })).toHaveLength(0);
  });

  it("NADA varía ⇒ CERO: son duplicados exactos, y su mitigación es Extract Constant/Method, no Prototype", async () => {
    const source = `
function forA(): Options {
  return new Options(3, 1000, false, "alfa");
}
function forB(): Options {
  return new Options(3, 1000, false, "alfa");
}
function forC(): Options {
  return new Options(3, 1000, false, "alfa");
}
`;
    expect(await corre({ source, graph: OPTIONS_TYPE_ONLY })).toHaveLength(0);
  });

  it("varía la MAYORÍA ⇒ CERO: no hay un mismo estado inicial que copiar, hay un constructor con argumentos", async () => {
    const source = `
function forA(): Options {
  return new Options(1, 2, 3, false, true, "alfa");
}
function forB(): Options {
  return new Options(9, 8, 7, false, true, "beta");
}
function forC(): Options {
  return new Options(5, 4, 6, false, true, "gamma");
}
`;
    // coinciden #3 y #4 (2), varían #0,#1,#2,#5 (4) ⇒ ni siquiera llega al piso de coincidentes
    expect(await corre({ source, graph: OPTIONS_TYPE_ONLY })).toHaveLength(0);
  });

  it("UNA TABLA DE DATOS con tres filas es UN punto, no tres ⇒ CERO", async () => {
    const source = `
function tabla(): Options[] {
  return [
    new Options(3, 1000, false, "alfa"),
    new Options(3, 1000, false, "beta"),
    new Options(3, 1000, false, "gamma"),
  ];
}
`;
    expect(await corre({ source, graph: OPTIONS_TYPE_ONLY })).toHaveLength(0);
  });
});

describe("repeated-configured-assembly — LA TRAMPA: (3) RESOLUCIÓN VERIFICADA", () => {
  it("R1 — el tipo YA declara un miembro que lo construye (protocolo de copia puesto) ⇒ SILENCIO", async () => {
    const graph = graphOf(
      [
        symbolNode("sym:otro.ts#Options", "otro.ts", ["Options"], "class-like"),
        symbolNode("sym:otro.ts#Options.withTag", "otro.ts", ["Options", "withTag"], "function-like"),
      ],
      [edge("sym:otro.ts#Options", "sym:otro.ts#Options.withTag", "contains"), edge("sym:otro.ts#Options.withTag", "sym:otro.ts#Options", "instantiates")],
    );
    expect(await corre({ source: TS_FORMA_COMPLETA, graph })).toHaveLength(0);
    // y la MISMA fuente, con el mismo tipo pero SIN el miembro que lo construye, sí dispara
    expect(await corre({ source: TS_FORMA_COMPLETA, graph: OPTIONS_TYPE_ONLY })).toHaveLength(1);
  });

  it("R2 — DOS de los puntos ya llegan a una puerta de armado compartida ⇒ SILENCIO (la puerta ya está: usala)", async () => {
    const graph = graphOf(
      [
        symbolNode("sym:otro.ts#Options", "otro.ts", ["Options"], "class-like"),
        symbolNode("sym:otro.ts#makeOptions", "otro.ts", ["makeOptions"], "function-like"),
        symbolNode("sym:a.ts#forA", "a.ts", ["forA"], "function-like"),
        symbolNode("sym:a.ts#forB", "a.ts", ["forB"], "function-like"),
      ],
      [
        edge("sym:otro.ts#makeOptions", "sym:otro.ts#Options", "instantiates"),
        edge("sym:a.ts#forA", "sym:otro.ts#makeOptions", "calls"),
        edge("sym:a.ts#forB", "sym:otro.ts#makeOptions", "calls"),
      ],
    );
    expect(await corre({ source: TS_FORMA_COMPLETA, graph })).toHaveLength(0);
  });

  it("R2 — con UN SOLO punto llegando a esa puerta hay MEDIA puerta y el hallazgo SÍ sale, publicando el número", async () => {
    const graph = graphOf(
      [
        symbolNode("sym:otro.ts#Options", "otro.ts", ["Options"], "class-like"),
        symbolNode("sym:otro.ts#makeOptions", "otro.ts", ["makeOptions"], "function-like"),
        symbolNode("sym:a.ts#forA", "a.ts", ["forA"], "function-like"),
      ],
      [edge("sym:otro.ts#makeOptions", "sym:otro.ts#Options", "instantiates"), edge("sym:a.ts#forA", "sym:otro.ts#makeOptions", "calls")],
    );
    const findings = await corre({ source: TS_FORMA_COMPLETA, graph });
    expect(findings).toHaveLength(1);
    const reach = findings[0]!.evidence?.find((e) => e.label.includes("puerta de armado compartida"));
    expect(reach?.value).toBe(1);
  });

  it("R3 — uno de los sitios vive DENTRO del propio tipo (eso ES la auto-construcción) ⇒ SILENCIO", async () => {
    const source = `
class Options {
  static base(): Options {
    return new Options(3, 1000, false, "alfa");
  }
}
function forB(): Options {
  return new Options(3, 1000, false, "beta");
}
function forC(): Options {
  return new Options(3, 1000, false, "gamma");
}
`;
    expect(await corre({ source, graph: graphOf([symbolNode("sym:a.ts#Options", "a.ts", ["Options"], "class-like")], []) })).toHaveLength(0);
  });
});

describe("repeated-configured-assembly — la compuerta de CONSTRUCCIÓN y la de grafo", () => {
  it("el nombre llamado NO es un tipo de este repo (es una función cualquiera) ⇒ CERO — esto no es un detector de llamadas repetidas", async () => {
    const source = `
function forA(): number {
  return compute(3, 1000, false, "alfa");
}
function forB(): number {
  return compute(3, 1000, false, "beta");
}
function forC(): number {
  return compute(3, 1000, false, "gamma");
}
`;
    expect(await corre({ source, graph: graphOf([symbolNode("sym:otro.ts#compute", "otro.ts", ["compute"], "function-like")], []) })).toHaveLength(0);
  });

  it("SIN grafo ⇒ CERO, a propósito: la condición (3) no se puede verificar y 'no pude mirar, apruebo' es el modo documentado de fallar", async () => {
    expect(await corre({ source: TS_FORMA_COMPLETA, graph: null })).toHaveLength(0);
  });
});

describe("repeated-configured-assembly — contrato de registro", () => {
  it("está registrado, es intra-file, pide el grafo por RUTEO y tiene su tier de impacto", () => {
    expect(DETECTORS.some((d) => d.id === "repeated-configured-assembly")).toBe(true);
    expect(detector.scope).toBe("intra-file");
    expect(detector.kind).toBe("repeated-configured-assembly");
    expect((detector as { needsGraph?: boolean }).needsGraph).toBe(true);
    expect(DETECTOR_IMPACT["repeated-configured-assembly"]).toBe("mantenibilidad");
  });

  it("los cuatro umbrales están declarados con su razón, y los tres pisos son los que dice el informe", () => {
    const keys = Object.keys(detector.thresholds).sort();
    expect(keys).toEqual(["lugaresQueRearman", "ranurasCoincidentes", "ranurasQueVarian", "sitiosPorArchivo"]);
    const ctx = testContext(detector, "typescript");
    expect(ctx.threshold("lugaresQueRearman").value).toBe(3);
    expect(ctx.threshold("ranurasCoincidentes").value).toBe(3);
    expect(ctx.threshold("ranurasQueVarian").value).toBe(1);
  });
});
