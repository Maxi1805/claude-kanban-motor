import { describe, expect, it } from "vitest";

import { buildDistributedDuplicationFindings, detector } from "./distributed-duplication.js";
import { testContext } from "../testing.js";
import type { CloneCandidate, RepoUnit } from "../types.js";
import { fileNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type Provenance } from "../../graph/types.js";

/**
 * `inter-file`, sin árboles: igual que `dependency-cycle.test.ts`/
 * `duplication.test.ts`, este test construye `RepoUnit.graph`/`.clones` a
 * mano — el detector sólo lee esas dos formas planas. "≥3 lenguajes que
 * emiten" no aplica (mismo motivo que los detectores hermanos: `ctx.language`
 * es el centinela `"*"` en producción, el detector no clasifica por
 * lenguaje); la única distinción por lenguaje que hace este detector es la
 * reducción de severidad para `.java`, cubierta abajo.
 */
function fileNode(file: string): CodeGraphNode {
  return { id: fileNodeId(file), kind: "file", file, symbolPath: [] };
}

function edge(from: string, to: string, provenance: Provenance = "declared", kind: CodeGraphEdge["kind"] = "references"): CodeGraphEdge {
  return { from: fileNodeId(from), to: fileNodeId(to), kind, provenance, weight: 1 };
}

function graphOf(files: readonly string[], edges: readonly CodeGraphEdge[]): CodeGraph {
  return {
    nodes: files.map(fileNode),
    edges,
    resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
  };
}

function clone(overrides: Partial<CloneCandidate> & Pick<CloneCandidate, "fingerprint" | "file" | "startLine" | "endLine">): CloneCandidate {
  return {
    nodes: 40,
    type: "method_declaration",
    functionName: null,
    className: null,
    superclassName: null,
    normalized: "same shape",
    ...overrides,
  };
}

function repoWith(
  files: readonly string[],
  edges: readonly CodeGraphEdge[],
  clones: readonly CloneCandidate[],
  languages: Readonly<Record<string, string>> = {},
): RepoUnit {
  return {
    repoName: "test",
    files: files.map((path) => ({ path, lines: 60, language: languages[path] ?? "typescript" })),
    functions: [],
    clones,
    graph: graphOf(files, edges),
  };
}

describe("distributed-duplication", () => {
  it("dos copias en archivos SIN ninguna arista entre sí (ni directa ni indirecta): hallazgo", () => {
    const minCopies = testContext(detector, "*").threshold("minCopies");
    const minComponents = testContext(detector, "*").threshold("minComponents");
    const minDensity = testContext(detector, "*").threshold("minDensity");
    const minCodeLines = testContext(detector, "*").threshold("minCodeLines");
    // Un tercer archivo con arista propia asegura que el grafo tiene aristas
    // reales (no dispara el guard "sin ninguna arista de código en absoluto")
    // sin conectar a.ts/b.ts entre sí.
    const graph = graphOf(
      ["a.ts", "b.ts", "c.ts", "d.ts"],
      [edge("c.ts", "d.ts")],
    );
    const clones = [
      clone({ fingerprint: "f1", file: "a.ts", startLine: 1, endLine: 10 }),
      clone({ fingerprint: "f1", file: "b.ts", startLine: 20, endLine: 29 }),
    ];
    const repo: RepoUnit = {
      repoName: "test",
      files: ["a.ts", "b.ts", "c.ts", "d.ts"].map((path) => ({ path, lines: 60, language: "typescript" })),
      functions: [],
      clones,
      graph,
    };
    const findings = buildDistributedDuplicationFindings(repo, graph, minCopies, minComponents, minDensity, minCodeLines);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(2);
    expect(findings[0]!.evidence![0]!.value).toBe(2); // copias
    expect(findings[0]!.locations).toHaveLength(2);
    expect(findings[0]!.locations[0]!.role).toBe("primera copia");
    expect(findings[0]!.locations[1]!.role).toBe("copia #2");
    expect(findings[0]!.detail).toContain("plantilla");
  });

  it("control negativo: dos copias en archivos que YA se referencian directamente no disparan (extract barato, no reinvención)", () => {
    const minCopies = testContext(detector, "*").threshold("minCopies");
    const minComponents = testContext(detector, "*").threshold("minComponents");
    const minDensity = testContext(detector, "*").threshold("minDensity");
    const minCodeLines = testContext(detector, "*").threshold("minCodeLines");
    const graph = graphOf(["a.ts", "b.ts"], [edge("a.ts", "b.ts")]);
    const clones = [
      clone({ fingerprint: "f1", file: "a.ts", startLine: 1, endLine: 10 }),
      clone({ fingerprint: "f1", file: "b.ts", startLine: 20, endLine: 29 }),
    ];
    const repo: RepoUnit = {
      repoName: "test",
      files: [
        { path: "a.ts", lines: 60, language: "typescript" },
        { path: "b.ts", lines: 60, language: "typescript" },
      ],
      functions: [],
      clones,
      graph,
    };
    const findings = buildDistributedDuplicationFindings(repo, graph, minCopies, minComponents, minDensity, minCodeLines);
    expect(findings).toHaveLength(0);
  });

  it("control negativo: conexión INDIRECTA (a→c→b) también cuenta como 'se conocen' — no dispara", () => {
    const minCopies = testContext(detector, "*").threshold("minCopies");
    const minComponents = testContext(detector, "*").threshold("minComponents");
    const minDensity = testContext(detector, "*").threshold("minDensity");
    const minCodeLines = testContext(detector, "*").threshold("minCodeLines");
    const graph = graphOf(["a.ts", "b.ts", "c.ts"], [edge("a.ts", "c.ts"), edge("c.ts", "b.ts")]);
    const clones = [
      clone({ fingerprint: "f1", file: "a.ts", startLine: 1, endLine: 10 }),
      clone({ fingerprint: "f1", file: "b.ts", startLine: 20, endLine: 29 }),
    ];
    const repo: RepoUnit = {
      repoName: "test",
      files: ["a.ts", "b.ts", "c.ts"].map((path) => ({ path, lines: 60, language: "typescript" })),
      functions: [],
      clones,
      graph,
    };
    const findings = buildDistributedDuplicationFindings(repo, graph, minCopies, minComponents, minDensity, minCodeLines);
    expect(findings).toHaveLength(0);
  });

  it("control negativo: una sola ocurrencia de un fingerprint no es duplicación", () => {
    const minCopies = testContext(detector, "*").threshold("minCopies");
    const minComponents = testContext(detector, "*").threshold("minComponents");
    const minDensity = testContext(detector, "*").threshold("minDensity");
    const minCodeLines = testContext(detector, "*").threshold("minCodeLines");
    const graph = graphOf(["a.ts", "b.ts"], [edge("a.ts", "b.ts")]);
    const clones = [clone({ fingerprint: "solo", file: "a.ts", startLine: 1, endLine: 10 })];
    const repo: RepoUnit = {
      repoName: "test",
      files: [
        { path: "a.ts", lines: 60, language: "typescript" },
        { path: "b.ts", lines: 60, language: "typescript" },
      ],
      functions: [],
      clones,
      graph,
    };
    const findings = buildDistributedDuplicationFindings(repo, graph, minCopies, minComponents, minDensity, minCodeLines);
    expect(findings).toHaveLength(0);
  });

  it("control negativo: ambas copias en el MISMO archivo no es 'distribuida' (trabajo de duplication.ts)", () => {
    const minCopies = testContext(detector, "*").threshold("minCopies");
    const minComponents = testContext(detector, "*").threshold("minComponents");
    const minDensity = testContext(detector, "*").threshold("minDensity");
    const minCodeLines = testContext(detector, "*").threshold("minCodeLines");
    const graph = graphOf(["a.ts"], []);
    const clones = [
      clone({ fingerprint: "f1", file: "a.ts", startLine: 1, endLine: 10 }),
      clone({ fingerprint: "f1", file: "a.ts", startLine: 20, endLine: 29 }),
    ];
    const repo: RepoUnit = {
      repoName: "test",
      files: [{ path: "a.ts", lines: 60, language: "typescript" }],
      functions: [],
      clones,
      graph,
    };
    const findings = buildDistributedDuplicationFindings(repo, graph, minCopies, minComponents, minDensity, minCodeLines);
    expect(findings).toHaveLength(0);
  });

  it("un clon anidado dentro de un grupo ya reportado (más grande) no genera un segundo hallazgo", () => {
    const minCopies = testContext(detector, "*").threshold("minCopies");
    const minComponents = testContext(detector, "*").threshold("minComponents");
    const minDensity = testContext(detector, "*").threshold("minDensity");
    const minCodeLines = testContext(detector, "*").threshold("minCodeLines");
    const graph = graphOf(["a.ts", "b.ts", "c.ts", "d.ts"], [edge("c.ts", "d.ts")]);
    const outer = [
      clone({ fingerprint: "outer", file: "a.ts", startLine: 1, endLine: 50, nodes: 200 }),
      clone({ fingerprint: "outer", file: "b.ts", startLine: 1, endLine: 50, nodes: 200 }),
    ];
    const inner = [
      clone({ fingerprint: "inner", file: "a.ts", startLine: 5, endLine: 15, nodes: 40 }),
      clone({ fingerprint: "inner", file: "b.ts", startLine: 5, endLine: 15, nodes: 40 }),
    ];
    const clones = [...outer, ...inner];
    const repo: RepoUnit = {
      repoName: "test",
      files: ["a.ts", "b.ts", "c.ts", "d.ts"].map((path) => ({ path, lines: 60, language: "typescript" })),
      functions: [],
      clones,
      graph,
    };
    const findings = buildDistributedDuplicationFindings(repo, graph, minCopies, minComponents, minDensity, minCodeLines);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.evidence![0]!.value).toBe(2);
  });

  it("provenance 'inferred' SÍ cuenta para conectar (asimetría: acá conservador es INCLUIRLA, al revés que dependency-cycle)", () => {
    const minCopies = testContext(detector, "*").threshold("minCopies");
    const minComponents = testContext(detector, "*").threshold("minComponents");
    const minDensity = testContext(detector, "*").threshold("minDensity");
    const minCodeLines = testContext(detector, "*").threshold("minCodeLines");
    const graph = graphOf(["a.ts", "b.ts"], [edge("a.ts", "b.ts", "inferred")]);
    const clones = [
      clone({ fingerprint: "f1", file: "a.ts", startLine: 1, endLine: 10 }),
      clone({ fingerprint: "f1", file: "b.ts", startLine: 20, endLine: 29 }),
    ];
    const repo: RepoUnit = {
      repoName: "test",
      files: [
        { path: "a.ts", lines: 60, language: "typescript" },
        { path: "b.ts", lines: 60, language: "typescript" },
      ],
      functions: [],
      clones,
      graph,
    };
    const findings = buildDistributedDuplicationFindings(repo, graph, minCopies, minComponents, minDensity, minCodeLines);
    expect(findings).toHaveLength(0); // fusionadas por la arista inferred: no son "distribuidas"
  });

  it("severidad reducida cuando el grupo involucra un archivo .java (riesgo de sub-cobertura de path-proximity)", () => {
    const minCopies = testContext(detector, "*").threshold("minCopies");
    const minComponents = testContext(detector, "*").threshold("minComponents");
    const minDensity = testContext(detector, "*").threshold("minDensity");
    const minCodeLines = testContext(detector, "*").threshold("minCodeLines");
    const graph = graphOf(["a.ts", "b.ts", "Foo.java", "Bar.java", "c.ts", "d.ts"], [edge("c.ts", "d.ts")]);
    const tsClones = [
      clone({ fingerprint: "ts", file: "a.ts", startLine: 1, endLine: 10 }),
      clone({ fingerprint: "ts", file: "b.ts", startLine: 20, endLine: 29 }),
    ];
    const javaClones = [
      clone({ fingerprint: "java", file: "Foo.java", startLine: 1, endLine: 10 }),
      clone({ fingerprint: "java", file: "Bar.java", startLine: 20, endLine: 29 }),
    ];
    const repoTs = repoWith(["a.ts", "b.ts", "Foo.java", "Bar.java", "c.ts", "d.ts"], [edge("c.ts", "d.ts")], tsClones, {
      "Foo.java": "java",
      "Bar.java": "java",
    });
    const repoJava = repoWith(["a.ts", "b.ts", "Foo.java", "Bar.java", "c.ts", "d.ts"], [edge("c.ts", "d.ts")], javaClones, {
      "Foo.java": "java",
      "Bar.java": "java",
    });
    const tsFindings = buildDistributedDuplicationFindings(repoTs, graph, minCopies, minComponents, minDensity, minCodeLines);
    const javaFindings = buildDistributedDuplicationFindings(repoJava, graph, minCopies, minComponents, minDensity, minCodeLines);
    expect(tsFindings).toHaveLength(1);
    expect(javaFindings).toHaveLength(1);
    expect(javaFindings[0]!.severity).toBeLessThan(tsFindings[0]!.severity);
    expect(javaFindings[0]!.detail).toContain("path-proximity");
  });

  it("control negativo: grafo sin NINGUNA arista de código real (todo `contains`) no emite nada — 'sin aristas' a mano", () => {
    const minCopies = testContext(detector, "*").threshold("minCopies");
    const minComponents = testContext(detector, "*").threshold("minComponents");
    const minDensity = testContext(detector, "*").threshold("minDensity");
    const minCodeLines = testContext(detector, "*").threshold("minCodeLines");
    const graph: CodeGraph = {
      nodes: [fileNode("a.ts"), fileNode("b.ts")],
      edges: [{ from: fileNodeId("folder:."), to: fileNodeId("a.ts"), kind: "contains", provenance: "declared", weight: 1 }],
      resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
    };
    const clones = [
      clone({ fingerprint: "f1", file: "a.ts", startLine: 1, endLine: 10 }),
      clone({ fingerprint: "f1", file: "b.ts", startLine: 20, endLine: 29 }),
    ];
    const repo: RepoUnit = {
      repoName: "test",
      files: [
        { path: "a.ts", lines: 60, language: "typescript" },
        { path: "b.ts", lines: 60, language: "typescript" },
      ],
      functions: [],
      clones,
      graph,
    };
    const findings = buildDistributedDuplicationFindings(repo, graph, minCopies, minComponents, minDensity, minCodeLines);
    expect(findings).toHaveLength(0);
  });

  it("el borde del umbral (presencia, R3): 2 componentes dispara, 1 componente (conectados) no", () => {
    const minCopies = testContext(detector, "*").threshold("minCopies");
    const minComponents = testContext(detector, "*").threshold("minComponents");
    const minDensity = testContext(detector, "*").threshold("minDensity");
    const minCodeLines = testContext(detector, "*").threshold("minCodeLines");
    expect(minComponents.kind).toBe("presencia");
    expect(minComponents.value).toBe(1);

    const connectedGraph = graphOf(["a.ts", "b.ts"], [edge("a.ts", "b.ts")]);
    const disconnectedGraph = graphOf(["a.ts", "b.ts", "c.ts", "d.ts"], [edge("c.ts", "d.ts")]);
    const clones = [
      clone({ fingerprint: "f1", file: "a.ts", startLine: 1, endLine: 10 }),
      clone({ fingerprint: "f1", file: "b.ts", startLine: 20, endLine: 29 }),
    ];
    const files2 = [
      { path: "a.ts", lines: 60, language: "typescript" },
      { path: "b.ts", lines: 60, language: "typescript" },
    ];
    const files4 = ["a.ts", "b.ts", "c.ts", "d.ts"].map((path) => ({ path, lines: 60, language: "typescript" }));

    const connectedFindings = buildDistributedDuplicationFindings(
      { repoName: "test", files: files2, functions: [], clones, graph: connectedGraph },
      connectedGraph,
      minCopies,
      minComponents,
      minDensity,
      minCodeLines,
    );
    const disconnectedFindings = buildDistributedDuplicationFindings(
      { repoName: "test", files: files4, functions: [], clones, graph: disconnectedGraph },
      disconnectedGraph,
      minCopies,
      minComponents,
      minDensity,
      minCodeLines,
    );
    expect(connectedFindings).toHaveLength(0);
    expect(disconnectedFindings).toHaveLength(1);
  });

  it("detector.run adapta un RepoUnit real, delegando en la misma función pura", () => {
    const graph = graphOf(["a.ts", "b.ts", "c.ts", "d.ts"], [edge("c.ts", "d.ts")]);
    const clones = [
      clone({ fingerprint: "f1", file: "a.ts", startLine: 1, endLine: 10 }),
      clone({ fingerprint: "f1", file: "b.ts", startLine: 20, endLine: 29 }),
    ];
    const repo: RepoUnit = {
      repoName: "test",
      files: ["a.ts", "b.ts", "c.ts", "d.ts"].map((path) => ({ path, lines: 60, language: "typescript" })),
      functions: [],
      clones,
      graph,
    };
    const ctx = testContext(detector, "*");
    const findings = detector.run(repo, ctx);
    expect(findings).toHaveLength(1);
  });

  it("detector.run sobre grafo null devuelve [] (defensivo; el runner real filtra antes con coverage 'sin-grafo')", () => {
    const repo: RepoUnit = { repoName: "test", files: [], functions: [], clones: [], graph: null };
    const ctx = testContext(detector, "*");
    expect(detector.run(repo, ctx)).toHaveLength(0);
  });

  describe("árbol espejo (paquete ESPEJO-DUPLICACION)", () => {
    /** 5 fingerprints compartidos entre `a`/`b`: establece el par como gemelo para `detectMirrorTrees`. */
    function twinMirrorClones(a: string, b: string): CloneCandidate[] {
      return [0, 1, 2, 3, 4].flatMap((i) => [
        clone({ fingerprint: `shape${i}`, file: a, startLine: i * 10 + 1, endLine: i * 10 + 8, nodes: 30 }),
        clone({ fingerprint: `shape${i}`, file: b, startLine: i * 10 + 1, endLine: i * 10 + 8, nodes: 30 }),
      ]);
    }

    it("un par gemelo SIN arista entre sí no dispara 'duplicación distribuida': cada fingerprint colapsa a 1 copia real, por debajo del piso de 2", () => {
      const a = "guava/src/com/google/common/collect/Foo.java";
      const b = "android/guava/src/com/google/common/collect/Foo.java";
      const minCopies = testContext(detector, "*").threshold("minCopies");
      const minComponents = testContext(detector, "*").threshold("minComponents");
      const minDensity = testContext(detector, "*").threshold("minDensity");
    const minCodeLines = testContext(detector, "*").threshold("minCodeLines");
      // c.ts/d.ts sólo para que el grafo tenga AL MENOS una arista de código
      // real (si no, dispara el guard "sin ninguna arista" y no prueba nada).
      const graph = graphOf([a, b, "c.ts", "d.ts"], [edge("c.ts", "d.ts")]);
      const repo: RepoUnit = {
        repoName: "test",
        files: [a, b, "c.ts", "d.ts"].map((path) => ({ path, lines: 60, language: "java" })),
        functions: [],
        clones: twinMirrorClones(a, b),
        graph,
      };
      const findings = buildDistributedDuplicationFindings(repo, graph, minCopies, minComponents, minDensity, minCodeLines);
      expect(findings).toHaveLength(0);
    });

    it("duplicación GENUINA entre un archivo del par gemelo y un TERCERO desconectado sigue reportándose, con 2 componentes (no 3)", () => {
      const a = "guava/src/com/google/common/collect/Foo.java";
      const b = "android/guava/src/com/google/common/collect/Foo.java";
      const other = "guava/src/com/google/common/collect/Unrelated.java";
      // `nodes: 40` (no 25) para no cruzar, sin querer, el piso de
      // densidad de A4b (3.0 nodos/línea) que este test no busca ejercitar.
      const genuine = [
        clone({ fingerprint: "genuine", file: a, startLine: 200, endLine: 210, nodes: 40 }),
        clone({ fingerprint: "genuine", file: b, startLine: 200, endLine: 210, nodes: 40 }),
        clone({ fingerprint: "genuine", file: other, startLine: 1, endLine: 10, nodes: 40 }),
      ];
      const minCopies = testContext(detector, "*").threshold("minCopies");
      const minComponents = testContext(detector, "*").threshold("minComponents");
      const minDensity = testContext(detector, "*").threshold("minDensity");
    const minCodeLines = testContext(detector, "*").threshold("minCodeLines");
      // Ninguna arista conecta a/b/other entre sí — sólo hay una arista
      // ajena (c.ts→d.ts) para no disparar el guard "sin ninguna arista".
      const graph = graphOf([a, b, other, "c.ts", "d.ts"], [edge("c.ts", "d.ts")]);
      const repo: RepoUnit = {
        repoName: "test",
        files: [a, b, other, "c.ts", "d.ts"].map((path) => ({ path, lines: 60, language: "java" })),
        functions: [],
        clones: [...twinMirrorClones(a, b), ...genuine],
        graph,
      };
      const findings = buildDistributedDuplicationFindings(repo, graph, minCopies, minComponents, minDensity, minCodeLines);
      const genuineFinding = findings.find((f) => f.locations.some((l) => l.file === other));
      expect(genuineFinding).toBeDefined();
      // El par gemelo colapsa a 1 componente + `other` = 2 componentes, no 3.
      expect(genuineFinding!.evidence![1]!.value).toBe(2); // "archivos distintos"
      expect(genuineFinding!.trigger[0]!.value).toBe(2); // "componentes...que comparten este fragmento"
    });
  });

  describe("Ola N, frente A4b — formas que no son duplicación de conocimiento", () => {
    it("densidad baja (comentario, no código: ListenableFuture.java medido) no genera hallazgo aunque los archivos estén desconectados", () => {
      const minCopies = testContext(detector, "*").threshold("minCopies");
      const minComponents = testContext(detector, "*").threshold("minComponents");
      const minDensity = testContext(detector, "*").threshold("minDensity");
    const minCodeLines = testContext(detector, "*").threshold("minCodeLines");
      const graph = graphOf(["a.java", "b.java", "c.ts", "d.ts"], [edge("c.ts", "d.ts")]);
      const clones = [
        clone({ fingerprint: "f1", file: "a.java", startLine: 120, endLine: 158, nodes: 57 }), // 1.46 nodos/línea
        clone({ fingerprint: "f1", file: "b.java", startLine: 120, endLine: 158, nodes: 57 }),
      ];
      const repo: RepoUnit = {
        repoName: "test",
        files: ["a.java", "b.java", "c.ts", "d.ts"].map((path) => ({ path, lines: 60, language: "java" })),
        functions: [],
        clones,
        graph,
      };
      const findings = buildDistributedDuplicationFindings(repo, graph, minCopies, minComponents, minDensity, minCodeLines);
      expect(findings).toHaveLength(0);
    });

    it("familia de contrato (clases hermanas que implementan el MISMO símbolo del grafo, en archivos desconectados) no genera hallazgo", () => {
      const minCopies = testContext(detector, "*").threshold("minCopies");
      const minComponents = testContext(detector, "*").threshold("minComponents");
      const minDensity = testContext(detector, "*").threshold("minDensity");
    const minCodeLines = testContext(detector, "*").threshold("minCodeLines");
      const graph: CodeGraph = {
        nodes: [
          ...["a.java", "b.java", "c.ts", "d.ts"].map(fileNode),
          { id: "sym:a.java#ForwardingLock", kind: "symbol", file: "a.java", symbolPath: ["ForwardingLock"], family: "class-like" },
          { id: "sym:b.java#ForwardingCondition", kind: "symbol", file: "b.java", symbolPath: ["ForwardingCondition"], family: "class-like" },
        ],
        edges: [
          edge("c.ts", "d.ts"),
          { from: "sym:a.java#ForwardingLock", to: "sym:jdk#Lock", kind: "implements", provenance: "declared", weight: 1 },
          { from: "sym:b.java#ForwardingCondition", to: "sym:jdk#Lock", kind: "implements", provenance: "declared", weight: 1 },
        ],
        resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
      };
      const clones = [
        clone({ fingerprint: "f1", file: "a.java", startLine: 1, endLine: 35, nodes: 194, className: "ForwardingLock" }),
        clone({ fingerprint: "f1", file: "b.java", startLine: 1, endLine: 35, nodes: 194, className: "ForwardingCondition" }),
      ];
      const repo: RepoUnit = {
        repoName: "test",
        files: ["a.java", "b.java", "c.ts", "d.ts"].map((path) => ({ path, lines: 60, language: "java" })),
        functions: [],
        clones,
        graph,
      };
      const findings = buildDistributedDuplicationFindings(repo, graph, minCopies, minComponents, minDensity, minCodeLines);
      expect(findings).toHaveLength(0);
    });

    it("par simétrico (Min/Max en archivos desconectados: única diferencia es el propio nombre dentro del cuerpo) no genera hallazgo", () => {
      const minCopies = testContext(detector, "*").threshold("minCopies");
      const minComponents = testContext(detector, "*").threshold("minComponents");
      const minDensity = testContext(detector, "*").threshold("minDensity");
    const minCodeLines = testContext(detector, "*").threshold("minCodeLines");
      const graph = graphOf(["a.cs", "b.cs", "c.ts", "d.ts"], [edge("c.ts", "d.ts")]);
      const body = (name: string) => `int ${name}(int a, int b) { return Math.${name}(a, b); }`;
      const clones = [
        clone({ fingerprint: "f1", file: "a.cs", startLine: 1, endLine: 10, functionName: "Min", normalized: body("Min") }),
        clone({ fingerprint: "f1", file: "b.cs", startLine: 1, endLine: 10, functionName: "Max", normalized: body("Max") }),
      ];
      const repo: RepoUnit = {
        repoName: "test",
        files: ["a.cs", "b.cs", "c.ts", "d.ts"].map((path) => ({ path, lines: 60, language: "csharp" })),
        functions: [],
        clones,
        graph,
      };
      const findings = buildDistributedDuplicationFindings(repo, graph, minCopies, minComponents, minDensity, minCodeLines);
      expect(findings).toHaveLength(0);
    });
  });
});

/* ── Ola Q, frente F2 — cuarto criterio de "no es producto" ───────────────── */

describe("Ola Q, frente F2 — subárbol autocontenido", () => {
  /**
   * La forma MEDIDA del falso dominante de este kind: dos muestras hermanas,
   * autocontenidas por diseño, que comparten un fragmento. Su señal central
   * ("no comparten ninguna arista") es exactamente lo que produce un árbol de
   * muestras, así que sin este criterio el detector no puede no equivocarse.
   * 10 archivos de núcleo cableados entre sí para pasar la compuerta de
   * cobertura de aristas de `n10-no-es-producto.ts`.
   */
  const nucleoA = Array.from({ length: 5 }, (_, i) => `packages/core/m${String(i)}.ts`);
  const nucleoB = Array.from({ length: 5 }, (_, i) => `packages/otro/n${String(i)}.ts`);
  const nucleo = [...nucleoA, ...nucleoB];
  // DOS grupos de producto sin ninguna arista entre sí: el detector necesita
  // dos componentes para poder emitir, y así el control positivo de abajo
  // prueba el criterio de este frente y no la definición del kind.
  const cableado = [
    ...nucleoA.slice(1).map((f) => edge(f, nucleoA[0]!)),
    ...nucleoB.slice(1).map((f) => edge(f, nucleoB[0]!)),
  ];
  const muestras = ["sample/uno/src/user.model.ts", "sample/dos/src/user.model.ts"];
  const copias = [
    clone({ fingerprint: "f1", file: muestras[0]!, startLine: 1, endLine: 10 }),
    clone({ fingerprint: "f1", file: muestras[1]!, startLine: 1, endLine: 10 }),
  ];

  function correr(edgesExtra: readonly CodeGraphEdge[]) {
    const ctx = testContext(detector, "*");
    const repo = repoWith([...nucleo, ...muestras], [...cableado, ...edgesExtra], copias);
    return buildDistributedDuplicationFindings(
      repo,
      repo.graph!,
      ctx.threshold("minCopies"),
      ctx.threshold("minComponents"),
      ctx.threshold("minDensity"),
      ctx.threshold("minCodeLines"),
    );
  }

  it("dos muestras hermanas sin NI UNA arista con el repo no generan 'duplicación distribuida'", () => {
    expect(correr([])).toHaveLength(0);
  });

  it("las mismas dos, si ADEMÁS usan al núcleo, vuelven a reportarse: hacen falta las dos direcciones", () => {
    expect(correr([edge(muestras[0]!, nucleoA[0]!), edge(muestras[1]!, nucleoB[0]!)])).toHaveLength(1);
  });
});
