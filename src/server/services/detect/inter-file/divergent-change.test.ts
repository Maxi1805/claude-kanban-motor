import { describe, expect, it } from "vitest";

import { buildDivergentChangeFindings, detector } from "./divergent-change.js";
import { testContext } from "../testing.js";
import type { Threshold } from "../thresholds.js";
import type { RepoUnit } from "../types.js";
import { fileNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type Provenance } from "../../graph/types.js";

/**
 * `inter-file`, `needsGraph: true`, `needs: []`: sólo lee `RepoUnit.graph`
 * (nodos+aristas planas) — igual que `dependency-cycle.test.ts`/
 * `orphan-file.test.ts`, este test construye el grafo a mano y NO parsea con
 * tree-sitter. "≥3 lenguajes que emiten" no aplica: el detector opera sobre
 * la FORMA del grafo entre archivos (fan-in/fan-out/coeficiente de
 * agrupamiento), sin mirar en qué lenguaje está cada archivo — `ctx.language`
 * es el centinela `"*"` en producción, mismo criterio que los dos detectores
 * hermanos ya documentan.
 */
function fileNode(file: string): CodeGraphNode {
  return { id: fileNodeId(file), kind: "file", file, symbolPath: [] };
}

function edge(from: string, to: string, provenance: Provenance = "declared", kind: CodeGraphEdge["kind"] = "references"): CodeGraphEdge {
  return { from: fileNodeId(from), to: fileNodeId(to), kind, provenance, weight: 1 };
}

/**
 * OLA P (P8). Una arista cuyo ORIGEN es un símbolo concreto del archivo, no
 * el nodo de archivo: es lo que el detector cuenta para saber en cuántas
 * piezas distintas del archivo está repartido su acoplamiento hacia afuera
 * (`minDistinctOrigins`). Un archivo real tiene varias; una raíz de
 * composición que declara todo en el cuerpo del módulo tiene una sola, y ésa
 * es la que emite desde el nodo `file:` — ver `edge()`.
 */
function edgeFromSymbol(
  fromFile: string,
  symbol: string,
  to: string,
  provenance: Provenance = "declared",
  kind: CodeGraphEdge["kind"] = "references",
): CodeGraphEdge {
  return { from: `sym:${fromFile}#${symbol}`, to: fileNodeId(to), kind, provenance, weight: 1 };
}

function symbolNode(file: string, symbol: string): CodeGraphNode {
  return { id: `sym:${file}#${symbol}`, kind: "symbol", file, symbolPath: [symbol], family: "function-like" };
}

function graphOf(files: readonly string[], edges: readonly CodeGraphEdge[]): CodeGraph {
  // Todo id `sym:` que alguna arista use tiene que existir como nodo: el
  // detector resuelve `edge.from` contra `graph.nodes` para saber de qué
  // archivo sale.
  const symbolIds = new Set(edges.flatMap((e) => [e.from, e.to]).filter((id) => id.startsWith("sym:")));
  const symbolNodes = [...symbolIds].map((id) => {
    const [file, symbol] = id.slice("sym:".length).split("#");
    return symbolNode(file!, symbol!);
  });
  return {
    nodes: [...files.map(fileNode), ...symbolNodes],
    edges,
    resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
  };
}

function repoWith(files: readonly string[], edges: readonly CodeGraphEdge[], lines = 10): RepoUnit {
  return {
    repoName: "test",
    files: files.map((path) => ({ path, lines, language: "typescript" })),
    functions: [],
    clones: [],
    graph: graphOf(files, edges),
  };
}

/**
 * Construye un hub que depende de `fanOut` archivos DISTINTOS y sin
 * relación entre sí (ninguna arista entre `dep0..dep_{fanOut-1}`, así que el
 * coeficiente de agrupamiento del hub es 0), más `fanIn` archivos que
 * dependen DE VUELTA del hub. `provenance` se aplica a las aristas de
 * fan-out (las que arman los "grupos que no se conocen entre sí"); las de
 * fan-in siempre son `declared`, para aislar en cada test qué provenance se
 * está poniendo a prueba.
 */
function divergentHubGraph(
  fanOut: number,
  fanIn: number,
  provenance: Provenance = "declared",
): { files: string[]; edges: CodeGraphEdge[] } {
  const files = ["hub.ts"];
  const edges: CodeGraphEdge[] = [];
  for (let i = 0; i < fanOut; i++) {
    const dep = `dep${i}.ts`;
    files.push(dep);
    // Cada dependencia sale de una PIEZA distinta del hub: es lo que
    // distingue un archivo con varias razones de cambio de una raíz de
    // composición (Ola P, `minDistinctOrigins`).
    edges.push(edgeFromSymbol("hub.ts", `parte${i}`, dep, provenance));
  }
  for (let i = 0; i < fanIn; i++) {
    const caller = `caller${i}.ts`;
    files.push(caller);
    edges.push(edge(caller, "hub.ts"));
  }
  return { files, edges };
}

/** Mismo hub, pero los `fanOut` vecinos forman un CLIQUE entre sí (todos se
 *  referencian con todos): coeficiente de agrupamiento del hub cercano a 1,
 *  la firma de un Facade bien aplicado (subsistema cohesivo) — ver "CON QUÉ
 *  SE CONFUNDE" en el docstring del detector. */
function facadeHubGraph(fanOut: number, fanIn: number): { files: string[]; edges: CodeGraphEdge[] } {
  const { files, edges } = divergentHubGraph(fanOut, fanIn);
  for (let i = 0; i < fanOut; i++) {
    for (let j = i + 1; j < fanOut; j++) {
      edges.push(edge(`dep${i}.ts`, `dep${j}.ts`));
    }
  }
  return { files, edges };
}

function thresholds(): {
  minFanOut: Threshold;
  minFanIn: Threshold;
  maxClustering: Threshold;
  minDistinctOrigins: Threshold;
} {
  const ctx = testContext(detector, "*");
  return {
    minFanOut: ctx.threshold("minFanOut"),
    minFanIn: ctx.threshold("minFanIn"),
    maxClustering: ctx.threshold("maxClustering"),
    minDistinctOrigins: ctx.threshold("minDistinctOrigins"),
  };
}

describe("divergent-change", () => {
  it("hub con fan-out/fan-in suficientes y vecinos desconectados entre sí: es un hallazgo", () => {
    const th = thresholds();
    const fanOut = th.minFanOut.value;
    const fanIn = th.minFanIn.value;
    const { files, edges } = divergentHubGraph(fanOut, fanIn);
    const repo = repoWith(files, edges);
    const findings = buildDivergentChangeFindings(repo, th);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.title).toContain("hub.ts");
    expect(findings[0]!.trigger[0]!.value).toBe(fanOut);
    // Ola P: cada dependencia sale de una pieza distinta del archivo.
    expect(findings[0]!.trigger[1]!.value).toBe(fanOut);
    expect(findings[0]!.trigger[2]!.value).toBe(0); // coeficiente 0: ningún dep se conoce con otro
    expect(findings[0]!.evidence![0]!.value).toBe(fanIn);
    expect(findings[0]!.locations[0]!.file).toBe("hub.ts");
    expect(findings[0]!.locations[0]!.role).toBe("archivo con vecinos que no se conocen entre sí");
  });

  it("control negativo — Facade: mismos fan-out/fan-in, pero los vecinos SÍ se conocen entre sí (clique): no dispara", () => {
    const th = thresholds();
    const fanOut = th.minFanOut.value;
    const fanIn = th.minFanIn.value;
    const { files, edges } = facadeHubGraph(fanOut, fanIn);
    const repo = repoWith(files, edges);
    const findings = buildDivergentChangeFindings(repo, th);
    expect(findings).toHaveLength(0);
  });

  it("control negativo — fan-out justo debajo del umbral: no dispara", () => {
    const th = thresholds();
    const fanOut = th.minFanOut.value - 1;
    const fanIn = th.minFanIn.value;
    const { files, edges } = divergentHubGraph(fanOut, fanIn);
    const repo = repoWith(files, edges);
    const findings = buildDivergentChangeFindings(repo, th);
    expect(findings).toHaveLength(0);
  });

  it("umbral: fan-out justo EN el umbral SÍ dispara (borde inclusivo)", () => {
    const th = thresholds();
    const fanOut = th.minFanOut.value;
    const fanIn = th.minFanIn.value;
    const { files, edges } = divergentHubGraph(fanOut, fanIn);
    const repo = repoWith(files, edges);
    const findings = buildDivergentChangeFindings(repo, th);
    expect(findings).toHaveLength(1);
  });

  /**
   * OLA P (P8) — el falso positivo que este detector declaraba como
   * inevitable ("sin lista de nombres de archivo, no puede distinguir ese
   * caso"). `jekyll/lib/jekyll.rb` (fan-in 43, `autoload` de todo el
   * namespace en el cuerpo del módulo) pasaba el piso de `minFanIn` y era un
   * falso positivo verificado a mano. La marca estructural existe y no
   * necesita nombres: el cableado sale de UN solo lugar.
   */
  it("control negativo — raíz de composición: MISMO fan-out/fan-in y MISMO coeficiente, pero todo el cableado sale de un solo lugar del archivo", () => {
    const th = thresholds();
    const fanOut = th.minFanOut.value + 4;
    const fanIn = th.minFanIn.value + 4;
    const files = ["raiz.ts"];
    const edges: CodeGraphEdge[] = [];
    // Todas las salientes desde el NODO DE ARCHIVO: el cuerpo del módulo.
    for (let i = 0; i < fanOut; i++) {
      files.push(`dep${i}.ts`);
      edges.push(edge("raiz.ts", `dep${i}.ts`));
    }
    for (let i = 0; i < fanIn; i++) {
      files.push(`caller${i}.ts`);
      edges.push(edge(`caller${i}.ts`, "raiz.ts"));
    }
    expect(buildDivergentChangeFindings(repoWith(files, edges), th)).toHaveLength(0);

    // Exactamente el mismo grafo, pero repartido en `minDistinctOrigins`
    // piezas del archivo: sí es un hallazgo.
    const repartido = edges.map((e, i) =>
      e.from === fileNodeId("raiz.ts")
        ? edgeFromSymbol("raiz.ts", `parte${i % th.minDistinctOrigins.value}`, e.to.slice("file:".length))
        : e,
    );
    expect(buildDivergentChangeFindings(repoWith(files, repartido), th)).toHaveLength(1);
  });

  it("control negativo — punto de entrada / raíz de composición: fan-in por debajo del piso, aunque el fan-out y el coeficiente califiquen", () => {
    const th = thresholds();
    const fanOut = th.minFanOut.value + 4;
    const fanIn = th.minFanIn.value - 1; // 1 si el piso es 2: nada casi lo usa de vuelta
    const { files, edges } = divergentHubGraph(fanOut, Math.max(0, fanIn));
    const repo = repoWith(files, edges);
    const findings = buildDivergentChangeFindings(repo, th);
    expect(findings).toHaveLength(0);
  });

  it("provenance: una arista `inferred` es evidencia POSITIVA y se excluye — el mismo hub con fan-out sólo por aristas inferred no dispara", () => {
    const th = thresholds();
    const fanOut = th.minFanOut.value + 2;
    const fanIn = th.minFanIn.value;
    const { files, edges } = divergentHubGraph(fanOut, fanIn, "inferred");
    const repo = repoWith(files, edges);
    const findings = buildDivergentChangeFindings(repo, th);
    expect(findings).toHaveLength(0);
  });

  it("provenance: las mismas aristas como `resolved` (no `inferred`) SÍ cuentan y disparan", () => {
    const th = thresholds();
    const fanOut = th.minFanOut.value + 2;
    const fanIn = th.minFanIn.value;
    const { files, edges } = divergentHubGraph(fanOut, fanIn, "resolved");
    const repo = repoWith(files, edges);
    const findings = buildDivergentChangeFindings(repo, th);
    expect(findings).toHaveLength(1);
  });

  it("sin grafo: `repo.graph === null` no dispara nada (el runner reporta sin-grafo, no cero hallazgos falsos)", () => {
    const th = thresholds();
    const repo: RepoUnit = { repoName: "r", files: [], functions: [], clones: [], graph: null };
    const findings = buildDivergentChangeFindings(repo, th);
    expect(findings).toHaveLength(0);
  });

  it("severidad: monótona en el fan-out para el mismo coeficiente (más vecinos desconectados, más severo)", () => {
    const th = thresholds();
    const fanIn = th.minFanIn.value;
    const small = divergentHubGraph(th.minFanOut.value, fanIn);
    const big = divergentHubGraph(th.minFanOut.value + 10, fanIn);
    const smallFindings = buildDivergentChangeFindings(repoWith(small.files, small.edges), th);
    const bigFindings = buildDivergentChangeFindings(repoWith(big.files, big.edges), th);
    expect(smallFindings).toHaveLength(1);
    expect(bigFindings).toHaveLength(1);
    expect(bigFindings[0]!.severity).toBeGreaterThanOrEqual(smallFindings[0]!.severity);
  });

  it("el detector real (`detector.run`) delega en `buildDivergentChangeFindings` con los umbrales resueltos", () => {
    const th = thresholds();
    const { files, edges } = divergentHubGraph(th.minFanOut.value, th.minFanIn.value);
    const repo = repoWith(files, edges);
    const ctx = testContext(detector, "*");
    const findings = detector.run(repo, ctx);
    expect(findings).toHaveLength(1);
  });
});
