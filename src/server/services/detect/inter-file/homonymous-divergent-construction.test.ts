import { describe, expect, it } from "vitest";

import { symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type EdgeKind, type Provenance } from "../../graph/types.js";
import { DETECTORS } from "../registry.js";
import { testContext } from "../testing.js";
import type { FileSummary, RepoUnit } from "../types.js";
import { detector, ROLE_ANCESTOR, ROLE_REDECLARES } from "./homonymous-divergent-construction.js";

/**
 * `inter-file`, `needsGraph: true`: este detector no lee ni una gramática —
 * corre enteramente sobre `CodeGraph`, así que (igual que
 * `repeated-collaborator-set.test.ts`, `middle-man.test.ts` y
 * `unused-symbol.test.ts` documentan para su propio caso) "≥3 lenguajes que
 * emiten" no aplica: el grafo se construye A MANO, sin tree-sitter. La FORMA
 * que busca —hermanos de una familia que redeclaran el mismo miembro y
 * construyen cada uno lo suyo— existe en las nueve gramáticas soportadas sin
 * cambiar de aspecto. Por eso `needs: []` y por eso no hay un test "no
 * aplicable sin <capability>" (regla G3: sólo aplica a detectores con `needs`
 * no vacío).
 */

function node(file: string, symbolPath: readonly string[], family: CodeGraphNode["family"], overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return { id: symbolNodeId(file, symbolPath), kind: "symbol", file, symbolPath, family, startLine: 10, endLine: 40, ...overrides };
}

function edge(
  fromFile: string,
  fromPath: readonly string[],
  toFile: string,
  toPath: readonly string[],
  kind: EdgeKind,
  provenance: Provenance = "resolved",
): CodeGraphEdge {
  return { from: symbolNodeId(fromFile, fromPath), to: symbolNodeId(toFile, toPath), kind, provenance, weight: 1 };
}

function repoOf(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): RepoUnit {
  const files: FileSummary[] = [...new Set(nodes.map((n) => n.file))].map((path) => ({ path, lines: 80, language: "typescript" }));
  const graph: CodeGraph = { nodes: [...nodes], edges: [...edges], resolution: {} as never };
  return { repoName: "fixture", files, functions: [], clones: [], graph };
}

function run(repo: RepoUnit) {
  return detector.run(repo, testContext(detector, "typescript", []) as never);
}

/* ── El escenario canónico ────────────────────────────────────────────────
 * `base.ts#Creator` con dos subtipos en archivos distintos. Los dos declaran
 * `render`, los dos ejecutan los mismos tres pasos compartidos, y cada uno
 * construye un producto DISTINTO. Es la forma completa.
 * ─────────────────────────────────────────────────────────────────────── */

const BASE: readonly CodeGraphNode[] = [node("base.ts", ["Creator"], "class-like")];

const STEPS: readonly CodeGraphNode[] = [
  node("util.ts", ["prepare"], "function-like"),
  node("util.ts", ["validate"], "function-like"),
  node("util.ts", ["publish"], "function-like"),
];

interface SiblingSpec {
  readonly file: string;
  readonly type: string;
  readonly member: string;
  readonly products: readonly string[];
  readonly steps: readonly string[];
  /** Por defecto `extends`; sirve para probar la alternativa de `needsAnyEdge`. */
  readonly familyKind?: EdgeKind;
}

function sibling(spec: SiblingSpec): { nodes: CodeGraphNode[]; edges: CodeGraphEdge[] } {
  const nodes: CodeGraphNode[] = [
    node(spec.file, [spec.type], "class-like"),
    node(spec.file, [spec.type, spec.member], "function-like"),
  ];
  const edges: CodeGraphEdge[] = [
    edge(spec.file, [spec.type], "base.ts", ["Creator"], spec.familyKind ?? "extends"),
    edge(spec.file, [spec.type], spec.file, [spec.type, spec.member], "contains"),
    ...spec.products.map((p) => edge(spec.file, [spec.type, spec.member], "products.ts", [p], "instantiates")),
    ...spec.steps.map((s) => edge(spec.file, [spec.type, spec.member], "util.ts", [s], "calls")),
  ];
  for (const p of spec.products) nodes.push(node("products.ts", [p], "class-like"));
  return { nodes, edges };
}

const THREE_STEPS = ["prepare", "validate", "publish"] as const;

function scenario(specs: readonly SiblingSpec[], extraNodes: readonly CodeGraphNode[] = [], extraEdges: readonly CodeGraphEdge[] = []): RepoUnit {
  const built = specs.map(sibling);
  return repoOf(
    [...BASE, ...STEPS, ...built.flatMap((b) => b.nodes), ...extraNodes],
    [...built.flatMap((b) => b.edges), ...extraEdges],
  );
}

const CANONICAL: readonly SiblingSpec[] = [
  { file: "a.ts", type: "AlphaCreator", member: "render", products: ["AlphaWidget"], steps: [...THREE_STEPS] },
  { file: "b.ts", type: "BetaCreator", member: "render", products: ["BetaWidget"], steps: [...THREE_STEPS] },
];

describe("homonymous-divergent-construction — la forma completa", () => {
  it("dos hermanos que redeclaran el mismo miembro construyendo productos distintos ⇒ UN hallazgo", () => {
    const findings = run(scenario(CANONICAL));
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.variant).toBe("render");
    expect(f.title).toContain("2 hermanos");
    // (hermanos, productos distintos, pasos comunes)
    expect(f.trigger.map((t) => t.value)).toEqual([2, 2, 3]);
  });

  it("marca cada ubicación con su rol: las declaraciones que redeclaran y el ancestro", () => {
    const f = run(scenario(CANONICAL))[0]!;
    const redeclaran = f.locations.filter((l) => l.role.startsWith(ROLE_REDECLARES)).map((l) => l.file);
    const ancestro = f.locations.filter((l) => l.role.startsWith(ROLE_ANCESTOR)).map((l) => l.file);
    expect(redeclaran.sort()).toEqual(["a.ts", "b.ts"]);
    expect(ancestro).toEqual(["base.ts"]);
  });

  it("el consejo mecánico nombra los productos y cuántos hermanos repiten el procedimiento", () => {
    const f = run(scenario(CANONICAL))[0]!;
    expect(f.advice.primary.name).toBe("Extract Method");
    expect(f.advice.primary.why).toContain("AlphaWidget");
    expect(f.advice.primary.why).toContain("2 hermanos");
  });

  it("publica cuántos pasos comunes apoyan en una arista NO ambigua — lo ambiguo viaja como ambiguo", () => {
    const ambiguo = scenario([
      { file: "a.ts", type: "AlphaCreator", member: "render", products: ["AlphaWidget"], steps: [] },
      { file: "b.ts", type: "BetaCreator", member: "render", products: ["BetaWidget"], steps: [] },
    ]);
    // Los mismos tres pasos, pero TODAS las aristas `calls` ambiguas.
    const conAmbiguas = repoOf(ambiguo.graph!.nodes, [
      ...ambiguo.graph!.edges,
      ...THREE_STEPS.flatMap((s) => [
        edge("a.ts", ["AlphaCreator", "render"], "util.ts", [s], "calls", "ambiguous"),
        edge("b.ts", ["BetaCreator", "render"], "util.ts", [s], "calls", "ambiguous"),
      ]),
    ]);
    const f = run(conAmbiguas)[0]!;
    expect(f).toBeDefined();
    const confident = f.evidence!.find((e) => e.label.includes("NO ambigua"))!;
    expect(confident.value).toBe(0);
  });

  it("una familia unida por `satisfies` (Go, sin herencia de implementación) también cuenta", () => {
    const findings = run(
      scenario([
        { ...CANONICAL[0]!, familyKind: "satisfies" },
        { ...CANONICAL[1]!, familyKind: "satisfies" },
      ]),
    );
    expect(findings).toHaveLength(1);
  });
});

describe("homonymous-divergent-construction — LA TRAMPA: no dispara donde el punto de creación YA existe", () => {
  it("si los hermanos DELEGAN en un miembro de creación dedicado de la familia ⇒ silencio", () => {
    // Cada hermano declara además `makeWidget`, que sólo construye (0 pasos),
    // y `render` lo llama: el punto de creación redefinible ya está puesto.
    const specs = CANONICAL.map((s) => ({ ...s, products: [] as readonly string[] }));
    const base = scenario(specs);
    const extraNodes: CodeGraphNode[] = [
      node("a.ts", ["AlphaCreator", "makeWidget"], "function-like"),
      node("b.ts", ["BetaCreator", "makeWidget"], "function-like"),
    ];
    const extraEdges: CodeGraphEdge[] = [
      edge("a.ts", ["AlphaCreator"], "a.ts", ["AlphaCreator", "makeWidget"], "contains"),
      edge("b.ts", ["BetaCreator"], "b.ts", ["BetaCreator", "makeWidget"], "contains"),
      edge("a.ts", ["AlphaCreator", "makeWidget"], "products.ts", ["AlphaWidget"], "instantiates"),
      edge("b.ts", ["BetaCreator", "makeWidget"], "products.ts", ["BetaWidget"], "instantiates"),
      // `render` construye algo propio ADEMÁS (si no, la condición (3) lo corta
      // por otro motivo y el test no probaría la trampa) y delega en el gancho.
      edge("a.ts", ["AlphaCreator", "render"], "products.ts", ["AlphaWidget"], "instantiates"),
      edge("b.ts", ["BetaCreator", "render"], "products.ts", ["BetaWidget"], "instantiates"),
      edge("a.ts", ["AlphaCreator", "render"], "a.ts", ["AlphaCreator", "makeWidget"], "calls"),
      edge("b.ts", ["BetaCreator", "render"], "b.ts", ["BetaCreator", "makeWidget"], "calls"),
    ];
    const repo = repoOf([...base.graph!.nodes, ...extraNodes], [...base.graph!.edges, ...extraEdges]);
    expect(run(repo)).toHaveLength(0);
  });

  it("sin esa delegación, el MISMO escenario sí emite — la trampa es la delegación, no el miembro extra", () => {
    const specs = CANONICAL.map((s) => ({ ...s, products: [] as readonly string[] }));
    const base = scenario(specs);
    const extraNodes: CodeGraphNode[] = [
      node("a.ts", ["AlphaCreator", "makeWidget"], "function-like"),
      node("b.ts", ["BetaCreator", "makeWidget"], "function-like"),
    ];
    const extraEdges: CodeGraphEdge[] = [
      edge("a.ts", ["AlphaCreator"], "a.ts", ["AlphaCreator", "makeWidget"], "contains"),
      edge("b.ts", ["BetaCreator"], "b.ts", ["BetaCreator", "makeWidget"], "contains"),
      edge("a.ts", ["AlphaCreator", "makeWidget"], "products.ts", ["AlphaWidget"], "instantiates"),
      edge("b.ts", ["BetaCreator", "makeWidget"], "products.ts", ["BetaWidget"], "instantiates"),
      edge("a.ts", ["AlphaCreator", "render"], "products.ts", ["AlphaWidget"], "instantiates"),
      edge("b.ts", ["BetaCreator", "render"], "products.ts", ["BetaWidget"], "instantiates"),
    ];
    const repo = repoOf([...base.graph!.nodes, ...extraNodes], [...base.graph!.edges, ...extraEdges]);
    const findings = run(repo);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.variant).toBe("render");
  });
});

describe("homonymous-divergent-construction — una exclusión por condición", () => {
  it("(1) sin ancestro común no hay familia ⇒ silencio", () => {
    const built = CANONICAL.map(sibling);
    const sinFamilia = built.map((b) => ({ ...b, edges: b.edges.filter((e) => e.kind !== "extends") }));
    expect(
      run(repoOf([...BASE, ...STEPS, ...sinFamilia.flatMap((b) => b.nodes)], sinFamilia.flatMap((b) => b.edges))),
    ).toHaveLength(0);
  });

  it("(2) un solo hermano que declara el miembro ⇒ silencio", () => {
    expect(
      run(
        scenario([
          CANONICAL[0]!,
          { file: "b.ts", type: "BetaCreator", member: "otroNombre", products: ["BetaWidget"], steps: [...THREE_STEPS] },
        ]),
      ),
    ).toHaveLength(0);
  });

  it("(2) el homónimo es un CONSTRUCTOR ⇒ silencio: un constructor no se puede redefinir como gancho", () => {
    expect(
      run(
        scenario([
          { ...CANONICAL[0]!, member: "constructor" },
          { ...CANONICAL[1]!, member: "constructor" },
        ]),
      ),
    ).toHaveLength(0);
  });

  it("(3) todos construyen EXACTAMENTE lo mismo ⇒ silencio: la creación no varía, la mitigación es Pull Up Method", () => {
    expect(
      run(
        scenario([
          { ...CANONICAL[0]!, products: ["AlphaWidget", "BetaWidget"] },
          { ...CANONICAL[1]!, products: ["AlphaWidget", "BetaWidget"] },
        ]),
      ),
    ).toHaveLength(0);
  });

  it("(3) ninguno construye nada ⇒ silencio: lo que varía no es la creación", () => {
    expect(
      run(
        scenario([
          { ...CANONICAL[0]!, products: [] },
          { ...CANONICAL[1]!, products: [] },
        ]),
      ),
    ).toHaveLength(0);
  });

  it("(4) ESCALA — copias sin procedimiento propio (sólo construyen) ⇒ silencio: ese miembro YA ES un punto de creación", () => {
    expect(
      run(
        scenario([
          { ...CANONICAL[0]!, steps: ["prepare", "validate"] },
          { ...CANONICAL[1]!, steps: ["prepare", "validate"] },
        ]),
      ),
    ).toHaveLength(0);
  });

  it("(4) ESCALA — procedimientos de tamaño suficiente pero SIN pasos comunes ⇒ silencio: comparten un nombre, no un algoritmo", () => {
    const nodes = [
      ...STEPS,
      node("util.ts", ["otroA"], "function-like"),
      node("util.ts", ["otroB"], "function-like"),
      node("util.ts", ["otroC"], "function-like"),
    ];
    const repo = scenario(
      [
        { ...CANONICAL[0]!, steps: ["prepare", "validate", "publish"] },
        { ...CANONICAL[1]!, steps: ["otroA", "otroB", "otroC"] },
      ],
      nodes,
    );
    expect(run(repo)).toHaveLength(0);
  });

  it("(4) ESCALA — un solo paso común, con procedimientos grandes ⇒ silencio (piso de 2)", () => {
    const nodes = [node("util.ts", ["otroA"], "function-like"), node("util.ts", ["otroB"], "function-like")];
    const repo = scenario(
      [
        { ...CANONICAL[0]!, steps: ["prepare", "validate", "publish"] },
        { ...CANONICAL[1]!, steps: ["prepare", "otroA", "otroB"] },
      ],
      nodes,
    );
    expect(run(repo)).toHaveLength(0);
  });
});

describe("homonymous-divergent-construction — deduplicación por sitios de declaración", () => {
  it("el MISMO par de declaraciones bajo DOS ancestros ⇒ UN hallazgo, con los dos ancestros nombrados", () => {
    const extraNodes = [node("base2.ts", ["Rendereable"], "class-like")];
    const extraEdges = [
      edge("a.ts", ["AlphaCreator"], "base2.ts", ["Rendereable"], "implements"),
      edge("b.ts", ["BetaCreator"], "base2.ts", ["Rendereable"], "implements"),
    ];
    const findings = run(scenario(CANONICAL, extraNodes, extraEdges));
    expect(findings).toHaveLength(1);
    const ancestros = findings[0]!.locations.filter((l) => l.role.startsWith(ROLE_ANCESTOR)).map((l) => l.file);
    expect(ancestros.sort()).toEqual(["base.ts", "base2.ts"]);
  });
});

describe("homonymous-divergent-construction — contrato de registro", () => {
  it("está registrado, es inter-file y declara sus aristas", () => {
    const registered = DETECTORS.find((d) => d.id === "homonymous-divergent-construction");
    expect(registered).toBe(detector);
    expect(detector.scope).toBe("inter-file");
    expect(detector.needsGraph).toBe(true);
    expect(detector.needsEdges).toEqual(["instantiates", "calls"]);
    expect(detector.needsAnyEdge).toEqual(["extends", "implements", "mixes-in", "satisfies"]);
    expect(detector.needs).toEqual([]);
  });

  it("sin grafo devuelve [] sin explotar (defensivo: el runner ya filtra antes)", () => {
    expect(detector.run({ repoName: "x", files: [], functions: [], clones: [], graph: null }, testContext(detector, "typescript", []) as never)).toEqual([]);
  });

  it("cada umbral declara su procedencia", () => {
    for (const key of ["hermanos", "productos", "pasosPorCopia", "pasosComunes"] as const) {
      expect(detector.thresholds[key]).toBeDefined();
    }
  });
});
