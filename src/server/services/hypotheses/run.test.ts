import { describe, expect, it } from "vitest";

import type { Capability } from "../detect/capabilities.js";
import { fileUnitFrom, nodeSetsFor, parseRoot } from "../detect/testing.js";
import { pisoDeclarado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import type { FileUnit, Finding, RepoUnit } from "../detect/types.js";
import { buildNeighborhoodIndex } from "../graph/neighborhood.js";
import { attachHypotheses, findingsNeedingGraphPass, rebuildHypothesesWithGraph, refreshHypotheses, type HypothesesRunInput } from "./run.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis } from "./types.js";

/**
 * Ola "required no permisivo" — `strategy.ts` ya no aprueba
 * `ramas-invocan-comportamiento-distinto`/`un-solo-discriminante`/
 * `no-es-campo-propio` sin árbol vivo (ver ese docstring). El único test de
 * este archivo que cuelga la Strategy REAL (no un `fakeBuilder`) necesita,
 * desde esta ola, un árbol real detrás — antes bastaba con el `Finding`
 * solo porque esos `required` aprobaban por default sin evidencia.
 */
const RUBY_CHAIN_PROBE = `
def describe(kind)
  if kind == "circle"
    return handle_circle(kind)
  elsif kind == "square"
    return handle_square(kind)
  else
    return 0
  end
end
`;

async function rubyChainFile(): Promise<{ file: FileUnit; sets: Awaited<ReturnType<typeof nodeSetsFor>> }> {
  const sets = await nodeSetsFor("tree-sitter-ruby.wasm", RUBY_CHAIN_PROBE);
  const root = await parseRoot("tree-sitter-ruby.wasm", RUBY_CHAIN_PROBE);
  return { file: fileUnitFrom(root, sets, "ruby", { file: "a.rb" }), sets };
}

function fakeThreshold(): Threshold {
  return resolveThreshold(pisoDeclarado(1, { rationale: "test" }), {
    language: "ruby",
    sampleSize: () => 0,
    corpusP95: () => null,
  });
}

function fakeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "f1",
    detectorId: "fake-detector",
    kind: "conditional-chain",
    scope: "intra-function",
    language: "ruby",
    title: "t",
    detail: "d",
    // Ola 10 — 5, no 3: alineado con el piso real de `conditional-chain`
    // (`pisoDeclarado(5,…)`), el mismo que `strategy.ts#STRATEGY_MIN_BRANCHES`
    // ahora exige (ver `threshold-alignment.test.ts`) — con 3 este fixture ya
    // no colgaría ninguna hipótesis Strategy contra el registro real.
    trigger: [{ label: "m", value: 5, threshold: fakeThreshold() }],
    locations: [{ file: "a.rb", startLine: 1, endLine: 5, role: "problema" }],
    severity: 50,
    advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
    ...overrides,
  };
}

function fakeRepo(overrides: Partial<RepoUnit> = {}): RepoUnit {
  return { repoName: "r", files: [], functions: [], clones: [], graph: null, ...overrides };
}

function fakeHypothesis(overrides: Partial<PatternHypothesis> = {}): PatternHypothesis {
  return {
    pattern: "Fake Pattern",
    layer: "patron",
    state: "ausente",
    confidence: "alta",
    ceiling: "alta",
    provisional: true,
    checks: [],
    discriminators: [],
    places: [],
    toConfirm: [],
    cost: "bajo",
    source: "https://example.test",
    missingCapabilities: [],
    anchorFindingId: "f1",
    ...overrides,
  };
}

function fakeBuilder(overrides: Partial<HypothesisBuilder> & { build?: HypothesisBuilder["build"] } = {}): HypothesisBuilder {
  return {
    id: "fake-hyp",
    pattern: "Fake Pattern",
    layer: "patron",
    anchors: ["conditional-chain"],
    build: (problem) => fakeHypothesis({ anchorFindingId: problem.id }),
    ...overrides,
  };
}

function baseInput(overrides: Partial<HypothesesRunInput> = {}): HypothesesRunInput {
  return {
    findings: [fakeFinding()],
    repo: fakeRepo(),
    languages: new Map([["ruby", { capabilities: new Set<Capability>(["unidad-tipo-clase"]), sets: emptySets() }]]),
    ...overrides,
  };
}

function emptySets() {
  return {
    functionNodes: new Set<string>(),
    branchNodes: new Set<string>(),
    chainNodes: new Set<string>(),
    cloneNodes: new Set<string>(),
    classNodes: new Set<string>(),
    nestingNodes: new Set<string>(),
    constructorNodes: new Set<string>(),
    exceptionNodes: new Set<string>(),
    switchContainerNodes: new Set<string>(),
  };
}

describe("attachHypotheses", () => {
  it("registro vacío (inyectado explícitamente) ⇒ no-op: ningún finding se toca", () => {
    const findings = [fakeFinding()];
    attachHypotheses(baseInput({ findings, registry: [] }));
    expect(findings[0]!.hypotheses).toBeUndefined();
  });

  it("registro REAL (default de producción hoy, 17 hipótesis migradas) ⇒ 'conditional-chain' en ruby, CON árbol vivo real, cuelga la hipótesis Strategy", async () => {
    const { file, sets } = await rubyChainFile();
    const findings = [
      fakeFinding({ kind: "conditional-chain", locations: [{ file: "a.rb", startLine: 2, endLine: 9, role: "problema" }] }),
    ];
    attachHypotheses(
      baseInput({
        findings,
        files: [file],
        // `emptySets()` (el default de `baseInput`) no tiene ningún tipo de
        // nodo real — sin esto, `findChainNode`/`branchActionsOf` no
        // reconocen NADA en el árbol vivo, así que hace falta el DerivedNodeSets
        // real derivado de la misma sonda que parseó `file`.
        languages: new Map([["ruby", { capabilities: new Set<Capability>(["unidad-tipo-clase"]), sets }]]),
      }),
    );
    expect(findings[0]!.hypotheses).toBeDefined();
    expect(findings[0]!.hypotheses!.length).toBeGreaterThan(0);
    expect(findings[0]!.hypotheses!.map((h) => h.pattern)).toContain("Strategy");
  });

  it("cuelga la hipótesis de un Finding cuyo kind está en `anchors`", () => {
    const findings = [fakeFinding({ kind: "conditional-chain" })];
    attachHypotheses(baseInput({ findings, registry: [fakeBuilder()] }));
    expect(findings[0]!.hypotheses).toHaveLength(1);
    expect(findings[0]!.hypotheses![0]!.pattern).toBe("Fake Pattern");
    expect(findings[0]!.hypotheses![0]!.anchorFindingId).toBe(findings[0]!.id);
  });

  it("NO cuelga nada si el kind del Finding no está entre las anclas de ninguna hipótesis registrada", () => {
    const findings = [fakeFinding({ kind: "large-class" })];
    attachHypotheses(baseInput({ findings, registry: [fakeBuilder({ anchors: ["conditional-chain"] })] }));
    expect(findings[0]!.hypotheses).toBeUndefined();
  });

  it("un builder que devuelve null no aporta hipótesis, pero otro que sí matchea sigue viéndose", () => {
    const findings = [fakeFinding({ kind: "conditional-chain" })];
    attachHypotheses(
      baseInput({
        findings,
        registry: [
          fakeBuilder({ id: "b1", build: () => null }),
          fakeBuilder({ id: "b2", pattern: "Otro Patrón", build: (p) => fakeHypothesis({ pattern: "Otro Patrón", anchorFindingId: p.id }) }),
        ],
      }),
    );
    expect(findings[0]!.hypotheses).toHaveLength(1);
    expect(findings[0]!.hypotheses![0]!.pattern).toBe("Otro Patrón");
  });

  it("si TODOS los builders matcheados devuelven null, el Finding queda sin `hypotheses` (nunca un array vacío)", () => {
    const findings = [fakeFinding({ kind: "conditional-chain" })];
    attachHypotheses(baseInput({ findings, registry: [fakeBuilder({ build: () => null })] }));
    expect(findings[0]!.hypotheses).toBeUndefined();
  });

  /**
   * Bug 2 de "tres bugs de mecanismo" (`RAICES.md`) — `attachHypotheses` es
   * la ÚNICA capa que ve TODAS las hipótesis de un mismo `Finding` juntas
   * (`built`, antes de la asignación); acá es donde `arbitrateRivalHypotheses`
   * (`engine.ts`) tiene que aplicarse, no dentro de un builder individual.
   */
  it("dos builders sobre el MISMO Finding, uno 'ausente' y otro 'aplicado-eludido' ⇒ arbitrateRivalHypotheses descarta la oportunidad (sólo sobrevive la confirmación)", () => {
    const findings = [fakeFinding({ kind: "conditional-chain" })];
    attachHypotheses(
      baseInput({
        findings,
        registry: [
          fakeBuilder({ id: "state-like", pattern: "State", build: (p) => fakeHypothesis({ pattern: "State", state: "ausente", anchorFindingId: p.id }) }),
          fakeBuilder({
            id: "strategy-like",
            pattern: "Strategy",
            build: (p) => fakeHypothesis({ pattern: "Strategy", state: "aplicado-eludido", confidence: null, anchorFindingId: p.id }),
          }),
        ],
      }),
    );
    expect(findings[0]!.hypotheses).toHaveLength(1);
    expect(findings[0]!.hypotheses![0]!.pattern).toBe("Strategy");
    expect(findings[0]!.hypotheses![0]!.state).toBe("aplicado-eludido");
  });

  it("ctx.capabilities: para un Finding con `language`, usa las capacidades de ESE lenguaje", () => {
    let seen: ReadonlySet<Capability> | null = null;
    const findings = [fakeFinding({ language: "ruby" })];
    attachHypotheses(
      baseInput({
        findings,
        languages: new Map([
          ["ruby", { capabilities: new Set<Capability>(["unidad-tipo-clase"]), sets: emptySets() }],
          ["java", { capabilities: new Set<Capability>(["genericos"]), sets: emptySets() }],
        ]),
        registry: [
          fakeBuilder({
            build: (problem, _graph, ctx: HypothesisContext) => {
              seen = ctx.capabilities;
              return fakeHypothesis({ anchorFindingId: problem.id });
            },
          }),
        ],
      }),
    );
    expect([...seen!]).toEqual(["unidad-tipo-clase"]);
  });

  it("ctx.capabilities: para un Finding inter-file (`language: null`), usa la UNIÓN de todos los lenguajes", () => {
    let seen: ReadonlySet<Capability> | null = null;
    const findings = [fakeFinding({ language: null, kind: "fanout-without-cohesion" })];
    attachHypotheses(
      baseInput({
        findings,
        languages: new Map([
          ["ruby", { capabilities: new Set<Capability>(["unidad-tipo-clase"]), sets: emptySets() }],
          ["java", { capabilities: new Set<Capability>(["genericos"]), sets: emptySets() }],
        ]),
        registry: [
          fakeBuilder({
            anchors: ["fanout-without-cohesion"],
            build: (problem, _graph, ctx: HypothesisContext) => {
              seen = ctx.capabilities;
              return fakeHypothesis({ anchorFindingId: problem.id });
            },
          }),
        ],
      }),
    );
    expect([...seen!].sort()).toEqual(["genericos", "unidad-tipo-clase"]);
  });

  it("LÍMITE DECLARADO: ctx.file/ctx.fileAt son SIEMPRE null en el cableado de crossAnalyze (ningún árbol vivo esta corrida)", () => {
    let ctxSeen: HypothesisContext | null = null;
    const findings = [fakeFinding()];
    attachHypotheses(
      baseInput({
        findings,
        registry: [
          fakeBuilder({
            build: (problem, _graph, ctx) => {
              ctxSeen = ctx;
              return fakeHypothesis({ anchorFindingId: problem.id });
            },
          }),
        ],
      }),
    );
    expect(ctxSeen!.file).toBeNull();
    expect(ctxSeen!.fileAt("a.rb")).toBeNull();
  });

  it("ctx.setsFor(lenguaje desconocido) devuelve conjuntos vacíos, nunca lanza", () => {
    let ctxSeen: HypothesisContext | null = null;
    const findings = [fakeFinding()];
    attachHypotheses(
      baseInput({
        findings,
        registry: [
          fakeBuilder({
            build: (problem, _graph, ctx) => {
              ctxSeen = ctx;
              return fakeHypothesis({ anchorFindingId: problem.id });
            },
          }),
        ],
      }),
    );
    expect(() => ctxSeen!.setsFor("cobol")).not.toThrow();
    expect(ctxSeen!.setsFor("cobol").classNodes.size).toBe(0);
  });

  it("ctx.repo es el RepoUnit pasado tal cual", () => {
    const repo = fakeRepo({ repoName: "mi-repo" });
    let seenRepo: RepoUnit | null = null;
    const findings = [fakeFinding()];
    attachHypotheses(
      baseInput({
        findings,
        repo,
        registry: [
          fakeBuilder({
            build: (problem, _graph, ctx) => {
              seenRepo = ctx.repo;
              return fakeHypothesis({ anchorFindingId: problem.id });
            },
          }),
        ],
      }),
    );
    expect(seenRepo).toBe(repo);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * `refreshHypotheses` — Ola 10, registro de pendientes §B1. A diferencia de
 * `attachHypotheses`, esta pasada NUNCA llama `builder.build`, sólo el
 * `builder.refresh` opcional — el arnés de abajo lo confirma directo (un
 * `fakeBuilder` cuyo `build` explota si se llama).
 * ──────────────────────────────────────────────────────────────────────── */
describe("refreshHypotheses", () => {
  function explodingBuild(): never {
    throw new Error("refreshHypotheses NUNCA debe llamar a builder.build");
  }

  it("Finding sin `hypotheses` previa (nunca pasó por build()) ⇒ no-op, ni siquiera intenta refrescar", () => {
    const findings = [fakeFinding({ kind: "conditional-chain" })]; // .hypotheses === undefined
    const index = buildNeighborhoodIndex(null, findings, null);
    refreshHypotheses({
      findings,
      repo: fakeRepo(),
      languages: new Map([["ruby", { capabilities: new Set<Capability>(), sets: emptySets() }]]),
      neighborhoodIndex: index,
      registry: [fakeBuilder({ build: explodingBuild, refresh: explodingBuild })],
    });
    expect(findings[0]!.hypotheses).toBeUndefined();
  });

  it("builder SIN `refresh` ⇒ la hipótesis ya adjuntada queda exactamente igual (comportamiento idéntico a antes de que `refresh` existiera)", () => {
    const findings = [fakeFinding({ kind: "conditional-chain" })];
    const existing = fakeHypothesis({ anchorFindingId: findings[0]!.id });
    findings[0]!.hypotheses = [existing];
    const index = buildNeighborhoodIndex(null, findings, null);
    refreshHypotheses({
      findings,
      repo: fakeRepo(),
      languages: new Map([["ruby", { capabilities: new Set<Capability>(), sets: emptySets() }]]),
      neighborhoodIndex: index,
      registry: [fakeBuilder({ build: explodingBuild })], // sin `refresh`
    });
    expect(findings[0]!.hypotheses).toEqual([existing]);
  });

  it("builder con `refresh` que devuelve `null` ⇒ la hipótesis queda intacta (nunca se pisa con nada)", () => {
    const findings = [fakeFinding({ kind: "conditional-chain" })];
    const existing = fakeHypothesis({ anchorFindingId: findings[0]!.id, confidence: "baja" });
    findings[0]!.hypotheses = [existing];
    const index = buildNeighborhoodIndex(null, findings, null);
    refreshHypotheses({
      findings,
      repo: fakeRepo(),
      languages: new Map([["ruby", { capabilities: new Set<Capability>(), sets: emptySets() }]]),
      neighborhoodIndex: index,
      registry: [fakeBuilder({ build: explodingBuild, refresh: () => null })],
    });
    expect(findings[0]!.hypotheses).toEqual([existing]);
  });

  it("builder con `refresh` que devuelve una hipótesis nueva ⇒ la reemplaza; una hipótesis de OTRO patrón en el mismo Finding, sin `refresh`, no se toca", () => {
    const findings = [fakeFinding({ kind: "conditional-chain" })];
    const toRefresh = fakeHypothesis({ pattern: "Fake Pattern", anchorFindingId: findings[0]!.id, confidence: "baja" });
    const untouched = fakeHypothesis({ pattern: "Otro Patrón", anchorFindingId: findings[0]!.id, confidence: "alta" });
    findings[0]!.hypotheses = [toRefresh, untouched];
    const refreshed = fakeHypothesis({ pattern: "Fake Pattern", anchorFindingId: findings[0]!.id, confidence: "media" });
    const index = buildNeighborhoodIndex(null, findings, null);
    refreshHypotheses({
      findings,
      repo: fakeRepo(),
      languages: new Map([["ruby", { capabilities: new Set<Capability>(), sets: emptySets() }]]),
      neighborhoodIndex: index,
      registry: [
        fakeBuilder({ pattern: "Fake Pattern", build: explodingBuild, refresh: () => refreshed }),
        fakeBuilder({ id: "otro", pattern: "Otro Patrón", build: explodingBuild }), // sin `refresh`
      ],
    });
    expect(findings[0]!.hypotheses).toEqual([refreshed, untouched]);
  });

  it("ctx.neighborhood es el índice REAL (neighborhoodFor), no EMPTY_NEIGHBORHOOD — a diferencia de la construcción per-archivo", () => {
    const sibling = fakeFinding({ id: "f-sibling", kind: "repeated-switch" });
    const findings = [fakeFinding({ kind: "conditional-chain" }), sibling];
    findings[0]!.hypotheses = [fakeHypothesis({ anchorFindingId: findings[0]!.id })];
    const index = buildNeighborhoodIndex(null, findings, null);
    let seenCount = -1;
    refreshHypotheses({
      findings,
      repo: fakeRepo(),
      languages: new Map([["ruby", { capabilities: new Set<Capability>(), sets: emptySets() }]]),
      neighborhoodIndex: index,
      registry: [
        fakeBuilder({
          build: explodingBuild,
          refresh: (_existing, problem, _graph, ctx) => {
            seenCount = ctx.neighborhood.countOfKind("repeated-switch");
            return fakeHypothesis({ anchorFindingId: problem.id });
          },
        }),
      ],
    });
    expect(seenCount).toBe(1); // ve al `sibling`, no a sí mismo — mismo contrato que `Neighborhood.countOfKind`.
  });

  it("ctx.file es SIEMPRE null en esta pasada — nunca hay árbol vivo (a diferencia de la llamada (1) de `analyzeFile`)", () => {
    const findings = [fakeFinding({ kind: "conditional-chain" })];
    findings[0]!.hypotheses = [fakeHypothesis({ anchorFindingId: findings[0]!.id })];
    const index = buildNeighborhoodIndex(null, findings, null);
    let ctxSeen: HypothesisContext | null = null;
    refreshHypotheses({
      findings,
      repo: fakeRepo(),
      languages: new Map([["ruby", { capabilities: new Set<Capability>(), sets: emptySets() }]]),
      neighborhoodIndex: index,
      registry: [
        fakeBuilder({
          build: explodingBuild,
          refresh: (_existing, problem, _graph, ctx) => {
            ctxSeen = ctx;
            return fakeHypothesis({ anchorFindingId: problem.id });
          },
        }),
      ],
    });
    expect(ctxSeen!.file).toBeNull();
    expect(ctxSeen!.fileAt("a.rb")).toBeNull();
  });

  it("OLA V — con `files` poblado, `refresh` recibe `ctx.file` VIVO (antes era `null` por construcción): es la etapa que resuelve las promesas diferidas", async () => {
    const { file } = await rubyChainFile();
    const findings = [fakeFinding({ kind: "conditional-chain", locations: [{ file: "a.rb", startLine: 2, endLine: 9, role: "problema" }] })];
    findings[0]!.hypotheses = [fakeHypothesis({ anchorFindingId: findings[0]!.id })];
    let ctxSeen: HypothesisContext | null = null;
    refreshHypotheses({
      findings,
      repo: fakeRepo(),
      languages: new Map([["ruby", { capabilities: new Set<Capability>(), sets: emptySets() }]]),
      files: [file],
      neighborhoodIndex: buildNeighborhoodIndex(null, findings, null),
      registry: [
        fakeBuilder({
          build: explodingBuild,
          refresh: (existing, _p, _g, ctx) => {
            ctxSeen = ctx;
            return { ...existing, confidence: "media" };
          },
        }),
      ],
    });
    expect(ctxSeen!.file).toBe(file);
    expect(findings[0]!.hypotheses![0]!.confidence).toBe("media");
  });

  it("registro vacío ⇒ no-op", () => {
    const findings = [fakeFinding({ kind: "conditional-chain" })];
    const existing = fakeHypothesis({ anchorFindingId: findings[0]!.id });
    findings[0]!.hypotheses = [existing];
    const index = buildNeighborhoodIndex(null, findings, null);
    refreshHypotheses({
      findings,
      repo: fakeRepo(),
      languages: new Map([["ruby", { capabilities: new Set<Capability>(), sets: emptySets() }]]),
      neighborhoodIndex: index,
      registry: [],
    });
    expect(findings[0]!.hypotheses).toEqual([existing]);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * OLA V, FRENTE V1 — `findingsNeedingGraphPass` + `rebuildHypothesesWithGraph`.
 *
 * LA INTENCIÓN QUE ESTOS TESTS FIJAN, y no otra: una hipótesis anclada en un
 * hallazgo `intra-*` tiene que poder mirar el GRAFO DEL REPO, y sólo cuando
 * el contexto es ESTRICTAMENTE MEJOR que el de la primera pasada. Los dos
 * casos que importan son los dos bordes: con árbol vivo re-evalúa (y puede
 * RETIRAR lo que el grafo desmiente); sin árbol vivo no toca nada, porque
 * ahí la segunda pasada sería PEOR.
 * ──────────────────────────────────────────────────────────────────────── */
describe("rebuildHypothesesWithGraph (pasada de grafo, Ola V)", () => {
  const langs = () => new Map([["ruby", { capabilities: new Set<Capability>(["unidad-tipo-clase"]), sets: emptySets() }]]);

  it("agrupa por archivo SÓLO los hallazgos cuyo kind es ancla de algún builder registrado", () => {
    const conAncla = fakeFinding({ id: "f1", kind: "conditional-chain" });
    const sinAncla = fakeFinding({ id: "f2", kind: "unused-variable" });
    const otroArchivo = fakeFinding({ id: "f3", kind: "conditional-chain", locations: [{ file: "b.rb", startLine: 1, endLine: 2, role: "problema" }] });
    const porArchivo = findingsNeedingGraphPass([conAncla, sinAncla, otroArchivo], [fakeBuilder()]);
    expect([...porArchivo.keys()].sort()).toEqual(["a.rb", "b.rb"]);
    expect(porArchivo.get("a.rb")!.map((f) => f.id)).toEqual(["f1"]);
  });

  it("CON árbol vivo: vuelve a llamar `build` y le pasa el GRAFO REAL — lo que la pasada 1 nunca puede hacer", async () => {
    const { file } = await rubyChainFile();
    const findings = [fakeFinding({ kind: "conditional-chain", locations: [{ file: "a.rb", startLine: 2, endLine: 9, role: "problema" }] })];
    findings[0]!.hypotheses = [fakeHypothesis({ anchorFindingId: "f1", state: "ausente" })];
    const graph = { nodes: [], edges: [], resolution: null } as unknown as NonNullable<RepoUnit["graph"]>;
    let graphSeen: unknown = "no-llamado";
    let fileSeen: FileUnit | null = null;
    const rebuilt = rebuildHypothesesWithGraph({
      findings,
      repo: fakeRepo({ graph }),
      languages: langs(),
      files: [file],
      neighborhoodIndex: buildNeighborhoodIndex(null, findings, null),
      registry: [
        fakeBuilder({
          build: (p, g, ctx) => {
            graphSeen = g;
            fileSeen = ctx.file;
            return fakeHypothesis({ anchorFindingId: p.id, state: "parcial" });
          },
        }),
      ],
    });
    expect(graphSeen).toBe(graph);
    expect(fileSeen).toBe(file);
    expect(rebuilt).toHaveLength(1);
    expect(findings[0]!.hypotheses!.map((h) => h.state)).toEqual(["parcial"]);
  });

  it("CON árbol vivo y `build` que ya no sostiene su `required` ⇒ RETIRA la hipótesis (lo que `refresh` no puede hacer)", async () => {
    const { file } = await rubyChainFile();
    const findings = [fakeFinding({ kind: "conditional-chain", locations: [{ file: "a.rb", startLine: 2, endLine: 9, role: "problema" }] })];
    findings[0]!.hypotheses = [fakeHypothesis({ anchorFindingId: "f1" })];
    rebuildHypothesesWithGraph({
      findings,
      repo: fakeRepo(),
      languages: langs(),
      files: [file],
      neighborhoodIndex: buildNeighborhoodIndex(null, findings, null),
      registry: [fakeBuilder({ build: () => null })],
    });
    expect(findings[0]!.hypotheses).toBeUndefined();
  });

  it("SIN árbol vivo del archivo primario ⇒ NO toca nada y no lo declara re-evaluado (la segunda pasada sería PEOR)", () => {
    const findings = [fakeFinding({ kind: "conditional-chain" })];
    const existing = fakeHypothesis({ anchorFindingId: "f1" });
    findings[0]!.hypotheses = [existing];
    const rebuilt = rebuildHypothesesWithGraph({
      findings,
      repo: fakeRepo(),
      languages: langs(),
      files: [], // ningún árbol vivo
      neighborhoodIndex: buildNeighborhoodIndex(null, findings, null),
      registry: [
        fakeBuilder({
          build: () => {
            throw new Error("sin árbol vivo NO se debe volver a construir");
          },
        }),
      ],
    });
    expect(rebuilt).toHaveLength(0);
    expect(findings[0]!.hypotheses).toEqual([existing]);
  });

  it("un hallazgo sin ancla registrada no se re-evalúa aunque su archivo esté vivo", async () => {
    const { file } = await rubyChainFile();
    const findings = [fakeFinding({ kind: "unused-variable" })];
    const rebuilt = rebuildHypothesesWithGraph({
      findings,
      repo: fakeRepo(),
      languages: langs(),
      files: [file],
      neighborhoodIndex: buildNeighborhoodIndex(null, findings, null),
      registry: [fakeBuilder({ anchors: ["conditional-chain"] })],
    });
    expect(rebuilt).toHaveLength(0);
    expect(findings[0]!.hypotheses).toBeUndefined();
  });
});
