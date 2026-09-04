import { describe, expect, it } from "vitest";

import { symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type Provenance } from "../../graph/types.js";
import { runDetectorSet } from "../run.js";
import { testContext } from "../testing.js";
import type { FileSummary, RepoFunctionUnit, RepoUnit } from "../types.js";
import { buildMiddleManFindings, detector } from "./middle-man.js";

/**
 * `inter-file`, `needsGraph: true`: este detector no lee ni una gramática —
 * corre enteramente sobre `CodeGraph` (nodos/aristas ya resueltos) más
 * `RepoUnit.functions[].metrics` (ya calculadas por `code-analyzer.ts`), así
 * que, igual que `unused-symbol.test.ts` documenta para su propio caso, "≥3
 * lenguajes que emiten" no aplica: el grafo y las métricas se construyen A
 * MANO, sin tree-sitter; `language` sólo importa para el caso Java (nota de
 * bajo recall del docstring), cubierto explícitamente más abajo.
 */

function symNode(file: string, symbolPath: readonly string[], overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return {
    id: symbolNodeId(file, symbolPath),
    kind: "symbol",
    file,
    symbolPath,
    family: "function-like",
    startLine: 1,
    endLine: 3,
    ...overrides,
  };
}

function refEdge(
  fromFile: string,
  fromPath: readonly string[],
  toFile: string,
  toPath: readonly string[],
  provenance: Provenance = "resolved",
): CodeGraphEdge {
  return {
    from: symbolNodeId(fromFile, fromPath),
    to: symbolNodeId(toFile, toPath),
    kind: "references",
    provenance,
    weight: 1,
  };
}

interface FuncOpts {
  branches?: number;
  startLine?: number;
  endLine?: number;
  language?: string;
  className?: string | null;
}

function funcUnit(file: string, symbolPath: readonly string[], opts: FuncOpts = {}): RepoFunctionUnit {
  const className = opts.className !== undefined ? opts.className : symbolPath.length > 1 ? symbolPath[0]! : null;
  return {
    file,
    language: opts.language ?? "typescript",
    name: symbolPath[symbolPath.length - 1] ?? null,
    startLine: opts.startLine ?? 1,
    endLine: opts.endLine ?? 3,
    symbolPath,
    sets: {} as never,
    metrics: {
      branches: opts.branches ?? 0,
      chain: 0,
      cognitive: 0,
      maxNesting: 0,
      parameters: 0,
      chainHasNullCheck: false,
      chainInstantiates: false,
      className,
      isConstructor: false,
      isFactoryLike: false,
    },
  };
}

const EMPTY_STATS = { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] };

function graphOf(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): CodeGraph {
  return { nodes, edges, resolution: EMPTY_STATS };
}

function repoWith(
  graph: CodeGraph | null,
  functions: readonly RepoFunctionUnit[] = [],
  files: readonly FileSummary[] = [],
): RepoUnit {
  return { repoName: "test", files, functions, clones: [], graph };
}

/** Un caso "sano" mínimo: A (caller.ts) llama a M (mid.ts), M reenvía a C (real.ts). */
function basicMiddleMan(): { nodes: CodeGraphNode[]; edges: CodeGraphEdge[]; functions: RepoFunctionUnit[] } {
  const nodes: CodeGraphNode[] = [
    symNode("caller.ts", ["A"], { family: "other" }),
    symNode("mid.ts", ["M"]),
    symNode("real.ts", ["C"]),
  ];
  const edges: CodeGraphEdge[] = [
    refEdge("caller.ts", ["A"], "mid.ts", ["M"]),
    refEdge("mid.ts", ["M"], "real.ts", ["C"]),
  ];
  const functions: RepoFunctionUnit[] = [funcUnit("mid.ts", ["M"], { branches: 0 })];
  return { nodes, edges, functions };
}

const FILES: FileSummary[] = [
  { path: "caller.ts", lines: 5, language: "typescript" },
  { path: "mid.ts", lines: 5, language: "typescript" },
  { path: "real.ts", lines: 5, language: "typescript" },
];

describe("middle-man", () => {
  it("A llama a M, M reenvía a C sin lógica propia: es un hallazgo con las dos ubicaciones y sus roles", () => {
    const { nodes, edges, functions } = basicMiddleMan();
    const minFanIn = testContext(detector, "*").threshold("minFanIn");
    const noLogicBranches = testContext(detector, "*").threshold("noLogicBranches");
    const dedicatedRatio = testContext(detector, "*").threshold("dedicatedContainerRatio");
    const repo = repoWith(graphOf(nodes, edges), functions, FILES);

    const findings = buildMiddleManFindings(repo, minFanIn, noLogicBranches, dedicatedRatio);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("M");
    expect(findings[0]!.locations[0]!.role).toBe("método que sólo reenvía, sin agregar nada");
    expect(findings[0]!.locations[1]!.symbol).toBe("C");
    expect(findings[0]!.locations[1]!.role).toBe("destino real del reenvío");
    expect(findings[0]!.title).toContain("M");
    expect(findings[0]!.title).toContain("C");
    expect(findings[0]!.trigger[0]!.value).toBe(0); // ramas
    expect(findings[0]!.trigger[1]!.value).toBe(1); // 1 llamador
  });

  it("control negativo: si M tiene lógica propia (branches > 0) no dispara", () => {
    const { nodes, edges, functions } = basicMiddleMan();
    functions[0] = funcUnit("mid.ts", ["M"], { branches: 1 });
    const ctx = testContext(detector, "*");
    const findings = buildMiddleManFindings(
      repoWith(graphOf(nodes, edges), functions, FILES),
      ctx.threshold("minFanIn"),
      ctx.threshold("noLogicBranches"),
      ctx.threshold("dedicatedContainerRatio"),
    );
    expect(findings).toHaveLength(0);
  });

  it("control negativo: si M llama a DOS destinos distintos no es un intermediario puro", () => {
    const { nodes, edges, functions } = basicMiddleMan();
    nodes.push(symNode("other.ts", ["D"]));
    edges.push(refEdge("mid.ts", ["M"], "other.ts", ["D"]));
    const ctx = testContext(detector, "*");
    const findings = buildMiddleManFindings(
      repoWith(graphOf(nodes, edges), functions, FILES),
      ctx.threshold("minFanIn"),
      ctx.threshold("noLogicBranches"),
      ctx.threshold("dedicatedContainerRatio"),
    );
    expect(findings).toHaveLength(0);
  });

  it("control negativo: si el reenvío es DENTRO del mismo archivo no cruza frontera y no dispara", () => {
    const nodes: CodeGraphNode[] = [
      symNode("caller.ts", ["A"], { family: "other" }),
      symNode("mid.ts", ["M"]),
      symNode("mid.ts", ["C"]), // mismo archivo que M
    ];
    const edges: CodeGraphEdge[] = [
      refEdge("caller.ts", ["A"], "mid.ts", ["M"]),
      refEdge("mid.ts", ["M"], "mid.ts", ["C"]),
    ];
    const functions: RepoFunctionUnit[] = [funcUnit("mid.ts", ["M"], { branches: 0 })];
    const ctx = testContext(detector, "*");
    const findings = buildMiddleManFindings(
      repoWith(graphOf(nodes, edges), functions, FILES),
      ctx.threshold("minFanIn"),
      ctx.threshold("noLogicBranches"),
      ctx.threshold("dedicatedContainerRatio"),
    );
    expect(findings).toHaveLength(0);
  });

  it("control negativo: sin ningún llamador (fan-in 0) no hay indirección que remover", () => {
    const { nodes, edges, functions } = basicMiddleMan();
    const edgesWithoutCaller = edges.filter((e) => e.from !== symbolNodeId("caller.ts", ["A"]));
    const ctx = testContext(detector, "*");
    const findings = buildMiddleManFindings(
      repoWith(graphOf(nodes, edgesWithoutCaller), functions, FILES),
      ctx.threshold("minFanIn"),
      ctx.threshold("noLogicBranches"),
      ctx.threshold("dedicatedContainerRatio"),
    );
    expect(findings).toHaveLength(0);
  });

  it("provenance 'inferred' NO cuenta ni para el fan-in ni para el fan-out (evidencia positiva, se excluye)", () => {
    const nodes: CodeGraphNode[] = [
      symNode("caller.ts", ["A"], { family: "other" }),
      symNode("mid.ts", ["M"]),
      symNode("real.ts", ["C"]),
    ];
    const edges: CodeGraphEdge[] = [
      refEdge("caller.ts", ["A"], "mid.ts", ["M"], "inferred"),
      refEdge("mid.ts", ["M"], "real.ts", ["C"], "resolved"),
    ];
    const functions: RepoFunctionUnit[] = [funcUnit("mid.ts", ["M"], { branches: 0 })];
    const ctx = testContext(detector, "*");
    const findings = buildMiddleManFindings(
      repoWith(graphOf(nodes, edges), functions, FILES),
      ctx.threshold("minFanIn"),
      ctx.threshold("noLogicBranches"),
      ctx.threshold("dedicatedContainerRatio"),
    );
    // El único llamador vino por una arista `inferred`: sin fan-in confiable, no hay hallazgo.
    expect(findings).toHaveLength(0);
  });

  it("sin FunctionMetrics para M (no está en RepoUnit.functions), no se puede afirmar 'sin lógica propia': no dispara", () => {
    const { nodes, edges } = basicMiddleMan();
    const ctx = testContext(detector, "*");
    const findings = buildMiddleManFindings(
      repoWith(graphOf(nodes, edges), [], FILES),
      ctx.threshold("minFanIn"),
      ctx.threshold("noLogicBranches"),
      ctx.threshold("dedicatedContainerRatio"),
    );
    expect(findings).toHaveLength(0);
  });

  it("más llamadores (A) enrutados a través de M ⇒ mayor severidad (monótona en fan-in)", () => {
    const nodesFew: CodeGraphNode[] = [symNode("caller.ts", ["A"], { family: "other" }), symNode("mid.ts", ["M"]), symNode("real.ts", ["C"])];
    const edgesFew: CodeGraphEdge[] = [refEdge("caller.ts", ["A"], "mid.ts", ["M"]), refEdge("mid.ts", ["M"], "real.ts", ["C"])];
    const functionsFew: RepoFunctionUnit[] = [funcUnit("mid.ts", ["M"], { branches: 0 })];

    const nodesMany: CodeGraphNode[] = [
      symNode("callerA.ts", ["A"], { family: "other" }),
      symNode("callerB.ts", ["B"], { family: "other" }),
      symNode("callerD.ts", ["D"], { family: "other" }),
      symNode("mid.ts", ["M"]),
      symNode("real.ts", ["C"]),
    ];
    const edgesMany: CodeGraphEdge[] = [
      refEdge("callerA.ts", ["A"], "mid.ts", ["M"]),
      refEdge("callerB.ts", ["B"], "mid.ts", ["M"]),
      refEdge("callerD.ts", ["D"], "mid.ts", ["M"]),
      refEdge("mid.ts", ["M"], "real.ts", ["C"]),
    ];
    const functionsMany: RepoFunctionUnit[] = [funcUnit("mid.ts", ["M"], { branches: 0 })];

    const ctx = testContext(detector, "*");
    const few = buildMiddleManFindings(
      repoWith(graphOf(nodesFew, edgesFew), functionsFew, FILES),
      ctx.threshold("minFanIn"),
      ctx.threshold("noLogicBranches"),
      ctx.threshold("dedicatedContainerRatio"),
    );
    const many = buildMiddleManFindings(
      repoWith(graphOf(nodesMany, edgesMany), functionsMany, FILES),
      ctx.threshold("minFanIn"),
      ctx.threshold("noLogicBranches"),
      ctx.threshold("dedicatedContainerRatio"),
    );
    expect(few).toHaveLength(1);
    expect(many).toHaveLength(1);
    expect(many[0]!.severity).toBeGreaterThan(few[0]!.severity);
  });

  /** Construye un contenedor "Wrapper" en adapter.ts con `total` métodos: los primeros `delegateCount`
   *  reenvían puro (cada uno a un archivo distinto, con su propio llamador externo); el resto tiene
   *  lógica real (branches > 0) y ningún nodo de grafo — sólo cuentan para el denominador. */
  function containerRepo(total: number, delegateCount: number): RepoUnit {
    const nodes: CodeGraphNode[] = [];
    const edges: CodeGraphEdge[] = [];
    const functions: RepoFunctionUnit[] = [];
    for (let i = 0; i < total; i++) {
      const symbolPath = ["Wrapper", `m${i}`];
      if (i < delegateCount) {
        nodes.push(symNode("adapter.ts", symbolPath));
        nodes.push(symNode(`caller${i}.ts`, [`caller${i}`], { family: "other" }));
        nodes.push(symNode(`real${i}.ts`, ["C"]));
        edges.push(refEdge(`caller${i}.ts`, [`caller${i}`], "adapter.ts", symbolPath));
        edges.push(refEdge("adapter.ts", symbolPath, `real${i}.ts`, ["C"]));
        functions.push(funcUnit("adapter.ts", symbolPath, { branches: 0 }));
      } else {
        functions.push(funcUnit("adapter.ts", symbolPath, { branches: 2 }));
      }
    }
    return repoWith(graphOf(nodes, edges), functions, FILES);
  }

  it("contenedor DEDICADO (mayoría de métodos reenvían): severidad reducida y el detail lo llama Adapter/Proxy", () => {
    const ctx = testContext(detector, "*");
    const ratio = ctx.threshold("dedicatedContainerRatio").value;
    const total = 4;
    const delegateCount = Math.round(total * ratio); // exactamente en el umbral
    const repo = containerRepo(total, delegateCount);
    const findings = buildMiddleManFindings(
      repo,
      ctx.threshold("minFanIn"),
      ctx.threshold("noLogicBranches"),
      ctx.threshold("dedicatedContainerRatio"),
    );
    expect(findings.length).toBe(delegateCount);
    expect(findings[0]!.detail).toContain("Adapter");
  });

  it("borde del umbral de contenedor dedicado: un método menos ya no se lee como dedicado", () => {
    const ctx = testContext(detector, "*");
    const ratio = ctx.threshold("dedicatedContainerRatio").value;
    const total = 4;
    const atThreshold = Math.round(total * ratio);
    const belowThreshold = atThreshold - 1;

    const atRepo = containerRepo(total, atThreshold);
    const belowRepo = containerRepo(total, belowThreshold);

    const atFindings = buildMiddleManFindings(
      atRepo,
      ctx.threshold("minFanIn"),
      ctx.threshold("noLogicBranches"),
      ctx.threshold("dedicatedContainerRatio"),
    );
    const belowFindings = buildMiddleManFindings(
      belowRepo,
      ctx.threshold("minFanIn"),
      ctx.threshold("noLogicBranches"),
      ctx.threshold("dedicatedContainerRatio"),
    );

    expect(atFindings.every((f) => f.detail.includes("Adapter"))).toBe(true);
    expect(belowFindings.length).toBe(belowThreshold);
    expect(belowFindings.every((f) => f.detail.includes("aislada"))).toBe(true);
    // Mismo fan-in por candidato en ambos casos: la única diferencia es el contenedor ⇒ severidad menor cuando es "dedicado".
    expect(atFindings[0]!.severity).toBeLessThan(belowFindings[0]!.severity);
  });

  it("en Java el detail advierte explícitamente sobre el bajo recall de path-proximity", () => {
    const { nodes, edges, functions } = basicMiddleMan();
    functions[0] = funcUnit("mid.ts", ["M"], { branches: 0, language: "java" });
    const ctx = testContext(detector, "*");
    const findings = buildMiddleManFindings(
      repoWith(graphOf(nodes, edges), functions, FILES),
      ctx.threshold("minFanIn"),
      ctx.threshold("noLogicBranches"),
      ctx.threshold("dedicatedContainerRatio"),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.detail).toContain("path-proximity");
  });

  it("el umbral de presencia (minFanIn) se pide a testContext: no hay número suelto en el test", () => {
    const threshold = testContext(detector, "*").threshold("minFanIn");
    expect(threshold.value).toBe(1);
    expect(threshold.kind).toBe("piso-declarado");
  });

  it("el detector declara needsGraph:true y needs:[] (no depende de ninguna capacidad de lenguaje)", () => {
    expect(detector.needsGraph).toBe(true);
    expect(detector.needs).toEqual([]);
    expect(detector.scope).toBe("inter-file");
  });

  it("detector.run adapta un RepoUnit real, delegando en la misma función pura", () => {
    const { nodes, edges, functions } = basicMiddleMan();
    const repo = repoWith(graphOf(nodes, edges), functions, FILES);
    const findings = detector.run(repo, testContext(detector, "*"));
    expect(findings).toHaveLength(1);
  });

  it("sin grafo: el runner reporta 'sin-grafo', nunca 'cero hallazgos'", async () => {
    const repo = repoWith(null, [], FILES);
    const { coverage, findings } = await runDetectorSet([detector], {
      repo,
      languages: new Map([["typescript", { capabilities: new Set(), sets: {} as never }]]),
      benchmarks: null,
      only: ["middle-man"],
    });
    expect(findings).toHaveLength(0);
    const own = coverage.find((c) => c.detectorId === "middle-man")!;
    expect(own.status).toBe("sin-grafo");
  });

  it("presupuesto propio: el volumen de hallazgos se puede topear vía maxFindings", () => {
    expect(detector.maxFindings).toBeDefined();
  });
});
