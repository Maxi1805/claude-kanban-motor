import { describe, expect, it } from "vitest";

import type { Capability } from "../detect/capabilities.js";
import { deriveNodeSets, type DerivedNodeSets } from "../code-grammar.js";
import { fileUnitFrom, parseRoot } from "../detect/testing.js";
import { pisoDeclarado, resolveThreshold } from "../detect/thresholds.js";
import type { AstNode, FileUnit, Finding, RepoUnit } from "../detect/types.js";
import { EMPTY_NEIGHBORHOOD, buildNeighborhoodIndex, neighborhoodFor, type Neighborhood } from "../graph/neighborhood.js";
import { carrierNodeId, symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode } from "../graph/types.js";
import { attachHypotheses, refreshHypotheses } from "./run.js";
import { hypothesis as strategyHypothesis } from "./strategy.js";
import type { HypothesisContext } from "./types.js";

/* ────────────────────────────────────────────────────────────────────────
 * Arnés — fixtures de `Finding` (sin AST) + un `HypothesisContext` mínimo,
 * más un helper para construir uno CON árbol vivo cuando el test lo necesita
 * (los dos excluders — State y tabla de despacho — sólo se ejercitan de
 * verdad con `ctx.file` presente, ver docstring de `strategy.ts`).
 * ──────────────────────────────────────────────────────────────────────── */

function measurement(label: string, value: number) {
  return {
    label,
    value,
    threshold: resolveThreshold(pisoDeclarado(2, { rationale: "test" }), {
      language: "javascript",
      sampleSize: () => 0,
      corpusP95: () => null,
    }),
  };
}

function conditionalChainFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "f-chain-1",
    detectorId: "conditional-chain",
    kind: "conditional-chain",
    scope: "intra-function",
    language: "javascript",
    variant: "ladder",
    title: "Cadena de 5 condiciones en describe",
    detail: "detalle",
    // Ola 10 — 5, no 3: alineado con el piso REAL del ancla
    // (`conditional-chain.ts#chainLength`, `pisoDeclarado(5,…)`), el mismo
    // que `STRATEGY_MIN_BRANCHES` ahora exige. Ver `threshold-alignment.test.ts`.
    trigger: [measurement("ramas encadenadas", 5)],
    locations: [{ file: "fixture.javascript", startLine: 1, endLine: 10, symbol: "describe", role: "cadena larga de condicionales" }],
    severity: 60,
    advice: { primary: { name: "Extract Method", kind: "refactorizacion", why: "w", source: "https://x.test" } },
    ...overrides,
  };
}

function repeatedSwitchFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "f-repeat-1",
    detectorId: "repeated-switch",
    kind: "repeated-switch",
    scope: "intra-file",
    language: "javascript",
    title: '"shape.kind" se decide con switch en 2 lugares distintos de este archivo',
    detail: "detalle",
    trigger: [measurement("apariciones", 2)],
    locations: [
      { file: "fixture.javascript", startLine: 1, endLine: 5, symbol: "priceFor", role: "primer switch sobre este discriminante" },
      { file: "fixture.javascript", startLine: 7, endLine: 11, symbol: "iconFor", role: "repetición #1" },
    ],
    severity: 60,
    advice: { primary: { name: "Replace Conditional with Polymorphism", kind: "refactorizacion", why: "w", source: "https://x.test" } },
    ...overrides,
  };
}

const EMPTY_SETS: DerivedNodeSets = {
  functionNodes: new Set(),
  branchNodes: new Set(),
  chainNodes: new Set(),
  cloneNodes: new Set(),
  classNodes: new Set(),
  nestingNodes: new Set(),
  constructorNodes: new Set(),
  exceptionNodes: new Set(),
  switchContainerNodes: new Set(),
};

function contextWithout(file: FileUnit | null = null): HypothesisContext {
  const repo: RepoUnit = { repoName: "fixture", files: [], functions: [], clones: [], graph: null };
  return {
    file,
    fileAt: () => null,
    repo,
    capabilities: new Set(),
    setsFor: () => (file ? sharedSets : EMPTY_SETS),
    neighborhood: EMPTY_NEIGHBORHOOD,
    branches: () => null,
  };
}

/**
 * P2 — un `Neighborhood` que responde `findingsOfKind` desde un mapa fijo
 * (el resto de la superficie, igual que `EMPTY_NEIGHBORHOOD`: vacío/`null`).
 * No pasa por `buildNeighborhoodIndex`/`neighborhoodFor` a propósito — ESTOS
 * tests ejercitan el CONSUMO de `strategy.ts` (¿usa bien lo que el vecindario
 * le da?), no la construcción del índice (eso es `neighborhood.test.ts`, de
 * P3, fuera de este archivo).
 */
function neighborhoodWith(byKind: Record<string, readonly Finding[]>): Neighborhood {
  return {
    findingsAtSymbol: () => [],
    findingsInFile: () => [],
    findingsOfKind: (kind) => byKind[kind] ?? [],
    countOfKind: (kind) => (byKind[kind] ?? []).length,
    truncated: () => false,
    ego: () => null,
    metric: () => undefined,
  };
}

/** Como `contextWithout(file)`, pero con un `neighborhood` poblado a mano y `fileAt` capaz de resolver los archivos de `files` (por `path`) — lo que P2 necesita para ejercitar `crossRepetitionDiscriminator` con datos reales del vecindario. */
function contextWithNeighborhood(file: FileUnit, neighborhood: Neighborhood, files: readonly FileUnit[] = [file]): HypothesisContext {
  const repo: RepoUnit = { repoName: "fixture", files: [], functions: [], clones: [], graph: null };
  const byPath = new Map(files.map((f) => [f.path, f] as const));
  return {
    file,
    fileAt: (path) => byPath.get(path) ?? null,
    repo,
    capabilities: new Set(),
    setsFor: () => sharedSets,
    neighborhood,
    branches: () => null,
  };
}

// Poblado por `withRealFile` antes de usarse en un test — evita repetir el
// probe de gramática en cada caso.
let sharedSets: DerivedNodeSets = EMPTY_SETS;

const JS_PROBE = `
class Shape {
  describe(kind) {
    if (kind === "circle") {
      return 1;
    } else if (kind === "square") {
      return 2;
    } else {
      return 0;
    }
  }
}
function topLevel(kind) {
  if (kind === "circle") {
    return 1;
  } else {
    return 0;
  }
}
function withSwitch(kind) {
  switch (kind) {
    case "circle":
      return 1;
    default:
      return 0;
  }
}
const handlers = { a: (x) => x, b: (y) => y };
`;

async function jsFileFrom(source: string, filePath = "fixture.javascript"): Promise<FileUnit> {
  const probeRoot = await parseRoot("tree-sitter-javascript.wasm", JS_PROBE);
  sharedSets = deriveNodeSets(probeRoot);
  const root = await parseRoot("tree-sitter-javascript.wasm", source);
  return fileUnitFrom(root, sharedSets, "javascript", { file: filePath });
}

describe("strategyHypothesis — sin árbol vivo (ctx.file === null): ningún required que necesita AST se confirma por default ⇒ null (ola 'required no permisivo' — CASO TESTIGO real: XmlNodeConverter.cs, newtonsoft-json, recibía esta Strategy exactamente por este camino, con la evidencia 'se asume, SIN CONFIRMAR')", () => {
  it("conditional-chain sin árbol vivo ⇒ null: ANTES de esta ola 'no-es-campo-propio'/'ramas-invocan-comportamiento-distinto'/'un-solo-discriminante' aprobaban por default (holds: true, 'se asume sin confirmar') y esto daba 'ausente' con confianza; AHORA ninguno se puede confirmar sin AST, y el required entero falla", () => {
    const finding = conditionalChainFinding();
    const h = strategyHypothesis.build(finding, null, contextWithout());
    expect(h).toBeNull();
  });

  it("variant='instantiates' (todas las ramas construyen tipos) ⇒ null, es Factory Method — no depende de árbol, sin cambios por esta ola", () => {
    const h = strategyHypothesis.build(
      conditionalChainFinding({ variant: "instantiates", trigger: [measurement("tipos construidos", 3)] }),
      null,
      contextWithout(),
    );
    expect(h).toBeNull();
  });

  it("menos de 5 ramas ⇒ null (required 'suficiente-senal' no se cumple — Ola 10: alineado con el piso del ancla) — no depende de árbol, sin cambios por esta ola", () => {
    const h = strategyHypothesis.build(conditionalChainFinding({ trigger: [measurement("ramas encadenadas", 4)] }), null, contextWithout());
    expect(h).toBeNull();
  });

  it("repeated-switch con discriminante campo propio en el título ('\"this.state\"') ⇒ null, es State — el excluder de título funciona SIN árbol vivo, sin cambios por esta ola", () => {
    const h = strategyHypothesis.build(
      repeatedSwitchFinding({ title: '"this.state" se decide con switch en 2 lugares distintos de este archivo' }),
      null,
      contextWithout(),
    );
    expect(h).toBeNull();
  });

  it("repeated-switch con discriminante parámetro en el título, PERO sin árbol vivo ⇒ AHORA null también: 'ramas-invocan-comportamiento-distinto' no distingue por ancla, necesita el árbol igual para la secundaria que para la primaria (ANTES: candidata permisiva sin ninguna evidencia de comportamiento distinto)", () => {
    const h = strategyHypothesis.build(repeatedSwitchFinding(), null, contextWithout());
    expect(h).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * Ola "required no permisivo" — las aserciones de ceiling/discriminadores
 * que antes corrían sobre `contextWithout()` (sin árbol) ahora necesitan un
 * árbol real: los required de AST (`ramas-invocan-comportamiento-distinto`/
 * `un-solo-discriminante`/`no-es-campo-propio`) ya no aprueban sin evidencia,
 * así que `build()` sólo devuelve una hipótesis con árbol vivo real —
 * mismo criterio, movidas acá con una fuente real detrás.
 * ──────────────────────────────────────────────────────────────────────── */
describe("strategyHypothesis — CON árbol vivo real: ceiling/discriminadores (antes probados sin árbol, ola 'required no permisivo' los movió acá)", () => {
  const DISPATCH_SOURCE = `
function dispatchShape(kind) {
  if (kind === "circle") {
    return handleCircle(kind);
  } else if (kind === "square") {
    return handleSquare(kind);
  } else if (kind === "triangle") {
    return handleTriangle(kind);
  } else if (kind === "rectangle") {
    return handleRectangle(kind);
  } else if (kind === "hexagon") {
    return handleHexagon(kind);
  } else {
    return 0;
  }
}
`;

  function dispatchFindingFor(file: FileUnit, overrides: Partial<Finding> = {}): Finding {
    return conditionalChainFinding({
      locations: [{ file: file.path, startLine: 2, endLine: 15, symbol: "dispatchShape", role: "cadena larga de condicionales" }],
      ...overrides,
    });
  }

  it("candidata sobre conditional-chain con árbol vivo real: 'ausente', con confianza (ceiling 'media')", async () => {
    const file = await jsFileFrom(DISPATCH_SOURCE);
    const finding = dispatchFindingFor(file);
    const h = strategyHypothesis.build(finding, null, contextWithout(file));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    expect(h!.ceiling).toBe("media");
    expect(h!.confidence).not.toBeNull();
    expect(h!.anchorFindingId).toBe(finding.id);
    expect(h!.places).toEqual(finding.locations);
  });

  it("conditional-chain con el mínimo real (5 ramas, sin ancla secundaria): 'cuatro-o-mas' se confirma GRATIS (Ola 10: STRATEGY_STRONG_SIGNAL=4 <= el piso del ancla=5), 'repeticion-cruzada' no (EMPTY_NEIGHBORHOOD) ⇒ 1 confirmado ⇒ 'media'", async () => {
    const file = await jsFileFrom(DISPATCH_SOURCE);
    const h = strategyHypothesis.build(dispatchFindingFor(file), null, contextWithout(file))!;
    expect(h.confidence).toBe("media");
  });

  it("no declara aplicado-eludido sin needs de grafo salvo por evidencia real (corolario estructural: nunca produce ya-aplicado)", async () => {
    const file = await jsFileFrom(DISPATCH_SOURCE);
    const h = strategyHypothesis.build(dispatchFindingFor(file), null, contextWithout(file))!;
    expect(["ausente", "aplicado-eludido"]).toContain(h.state);
  });

  const REPEAT_SOURCE = `
function priceFor(kind) {
  switch (kind) {
    case "circle": return computeCirclePrice(kind);
    case "square": return computeSquarePrice(kind);
    default: return 0;
  }
}
function iconFor(kind) {
  switch (kind) {
    case "circle": return computeCircleIcon(kind);
    case "square": return computeSquareIcon(kind);
    default: return "?";
  }
}
`;

  function repeatFindingFor(file: FileUnit, overrides: Partial<Finding> = {}): Finding {
    return repeatedSwitchFinding({
      locations: [
        { file: file.path, startLine: 2, endLine: 6, symbol: "priceFor", role: "primer switch sobre este discriminante" },
        { file: file.path, startLine: 8, endLine: 13, symbol: "iconFor", role: "repetición #1" },
      ],
      ...overrides,
    });
  }

  it("repeated-switch con discriminante parámetro en el título Y árbol vivo real ⇒ candidata; el discriminador de repetición cruzada SIEMPRE se confirma para repeated-switch", async () => {
    const file = await jsFileFrom(REPEAT_SOURCE);
    const h = strategyHypothesis.build(repeatFindingFor(file), null, contextWithout(file))!;
    expect(h).not.toBeNull();
    const disc = h.discriminators.find((d) => d.label.includes("repetición cruzada") || d.why.includes("repetición cruzada"));
    expect(disc?.passed).toBe(true);
  });

  it("ceiling 'media' es un TECHO: con ambos discriminadores confirmados (repeated-switch, >=4 apariciones) la confianza no pasa de 'media'", async () => {
    const file = await jsFileFrom(REPEAT_SOURCE);
    const h = strategyHypothesis.build(repeatFindingFor(file, { trigger: [measurement("apariciones", 5)] }), null, contextWithout(file))!;
    expect(h.confidence).toBe("media");
  });

  it("repeated-switch con el mínimo (2 apariciones): un solo discriminador confirmado ⇒ 'media'", async () => {
    const file = await jsFileFrom(REPEAT_SOURCE);
    const h = strategyHypothesis.build(repeatFindingFor(file), null, contextWithout(file))!;
    expect(h.confidence).toBe("media");
  });
});

describe("strategyHypothesis — CON árbol vivo (ejercita los dos excluders reales)", () => {
  it("discriminante 'this.state' (campo propio) ⇒ null, es State, no Strategy", async () => {
    const source = `
class Machine {
  step(x) {
    if (this.state === "idle") {
      return 1;
    } else if (this.state === "running") {
      return 2;
    } else {
      return 0;
    }
  }
}
`;
    const file = await jsFileFrom(source);
    const finding = conditionalChainFinding({
      locations: [{ file: file.path, startLine: 3, endLine: 8, symbol: "step", role: "cadena larga de condicionales" }],
    });
    const h = strategyHypothesis.build(finding, null, contextWithout(file));
    expect(h).toBeNull();
  });

  it("discriminante 'kind' (parámetro, no campo propio) ⇒ candidata, y sin tabla de despacho relevante ⇒ 'ausente'", async () => {
    const source = `
function describe(kind) {
  if (kind === "circle") {
    return handleCircle(kind);
  } else if (kind === "square") {
    return handleSquare(kind);
  } else {
    return 0;
  }
}
`;
    const file = await jsFileFrom(source);
    const finding = conditionalChainFinding({
      locations: [{ file: file.path, startLine: 2, endLine: 8, symbol: "describe", role: "cadena larga de condicionales" }],
    });
    const h = strategyHypothesis.build(finding, null, contextWithout(file))!;
    expect(h).not.toBeNull();
    expect(h.state).toBe("ausente");
    const stateCheck = h.checks.find((c) => c.why.includes("prefijo de auto-referencia"));
    expect(stateCheck?.passed).toBe(true);
  });

  it("existe una tabla de despacho (objeto con >=2 valores función-como) en el archivo ⇒ 'aplicado-eludido', confidence null", async () => {
    const source = `
const handlers = {
  circle: (r) => Math.PI * r * r,
  square: (s) => s * s,
};

function describe(kind) {
  if (kind === "circle") {
    return handleCircle(kind);
  } else if (kind === "square") {
    return handleSquare(kind);
  } else {
    return 0;
  }
}
`;
    const file = await jsFileFrom(source);
    const finding = conditionalChainFinding({
      locations: [{ file: file.path, startLine: 7, endLine: 13, symbol: "describe", role: "cadena larga de condicionales" }],
    });
    const h = strategyHypothesis.build(finding, null, contextWithout(file))!;
    expect(h.state).toBe("aplicado-eludido");
    expect(h.confidence).toBeNull();
    const applied = h.checks.find((c) => c.label === "tabla-de-despacho-existente");
    expect(applied?.passed).toBe(true);
  });

  it("un objeto con UN solo valor función-como no cuenta como tabla de despacho (umbral >=2 entradas)", async () => {
    const source = `
const config = { onClick: () => {} };

function describe(kind) {
  if (kind === "circle") {
    return handleCircle(kind);
  } else if (kind === "square") {
    return handleSquare(kind);
  } else {
    return 0;
  }
}
`;
    const file = await jsFileFrom(source);
    const finding = conditionalChainFinding({
      locations: [{ file: file.path, startLine: 4, endLine: 10, symbol: "describe", role: "cadena larga de condicionales" }],
    });
    const h = strategyHypothesis.build(finding, null, contextWithout(file))!;
    expect(h.state).toBe("ausente");
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * PASO 3 (P2) — el pedido explícito era: NO endurecer el camino permisivo a
 * ciegas, sino VERIFICAR que, con el paso 2 hecho (`code-analyzer.ts` ahora
 * llama `attachHypotheses` dentro de `analyzeFile`, con `files: [fileUnit]`,
 * ANTES de `tree.delete()`), ese camino queda inalcanzable para un `Finding`
 * real. Los dos anclas de esta hipótesis (`conditional-chain`,
 * `repeated-switch`) son AMBAS `intra-function`/`intra-file`
 * (`detect/registry.ts`) — el `Finding` siempre nace en el MISMO archivo que
 * `analyzeFile` tiene vivo en ese momento, así que `ctx.file` SIEMPRE lo
 * cubre. Este bloque corre por el cableado REAL (`attachHypotheses`, no
 * `strategyHypothesis.build` directo) con `files: [file]` — igual que
 * `code-analyzer.ts` — y confirma que ningún check cae en el texto de
 * fallback ("árbol no disponible"/"SIN CONFIRMAR") que sólo aparece cuando
 * `ctx.file` es `null`. Si algún día una migración le agrega a esta
 * hipótesis un ancla `inter-file` (`crossAnalyze` nunca pasa `files`), este
 * test dejaría de cubrir ESE caso nuevo — no es una garantía para toda ancla
 * futura, sólo para las dos de hoy.
 * ──────────────────────────────────────────────────────────────────────── */
describe("strategyHypothesis — PASO 3 (P2): con el cableado real (attachHypotheses + FileUnit vivo), el camino permisivo queda inalcanzable", () => {
  function realWiringCtxFileNeverNull(file: FileUnit, finding: Finding): void {
    attachHypotheses({
      findings: [finding],
      repo: { repoName: "", files: [], functions: [], clones: [], graph: null },
      languages: new Map([["javascript", { capabilities: new Set<Capability>(), sets: sharedSets }]]),
      files: [file],
      registry: [strategyHypothesis],
    });
    expect(finding.hypotheses).toBeDefined();
    expect(finding.hypotheses!.length).toBeGreaterThan(0);
    for (const h of finding.hypotheses!) {
      for (const c of [...h.checks, ...h.discriminators]) {
        expect(c.why).not.toContain("árbol no disponible");
        expect(c.why).not.toContain("SIN CONFIRMAR");
      }
    }
  }

  it("conditional-chain (ancla primaria, intra-function): ctx.file queda poblado, el excluder de State corre de verdad", async () => {
    const source = `
function describe(kind) {
  if (kind === "circle") {
    return handleCircle(kind);
  } else if (kind === "square") {
    return handleSquare(kind);
  } else {
    return 0;
  }
}
`;
    const file = await jsFileFrom(source);
    const finding = conditionalChainFinding({
      locations: [{ file: file.path, startLine: 2, endLine: 8, symbol: "describe", role: "cadena larga de condicionales" }],
    });
    realWiringCtxFileNeverNull(file, finding);
  });

  it("repeated-switch (ancla secundaria, intra-file): ctx.file queda poblado igual", async () => {
    // Ola "required no permisivo" — `ramas-invocan-comportamiento-distinto"
    // (que no distingue por ancla) ahora exige >= 2 ramas con invocación
    // identificable para poder JUZGAR convergencia; con un solo `case` real
    // (más `default`, excluido) esto fallaría por falta de evidencia, no
    // por confirmar convergencia — así que la fuente necesita >= 2 `case`
    // reales con callees DISTINTOS, igual que el ancla primaria de arriba.
    const source = `
function priceFor(kind) {
  switch (kind) {
    case "circle": return computeCirclePrice(kind);
    case "square": return computeSquarePrice(kind);
    default: return 0;
  }
}
function iconFor(kind) {
  switch (kind) {
    case "circle": return computeCircleIcon(kind);
    case "square": return computeSquareIcon(kind);
    default: return "?";
  }
}
`;
    const file = await jsFileFrom(source);
    const finding = repeatedSwitchFinding({
      locations: [
        { file: file.path, startLine: 2, endLine: 6, symbol: "priceFor", role: "primer switch sobre este discriminante" },
        { file: file.path, startLine: 8, endLine: 13, symbol: "iconFor", role: "repetición #1" },
      ],
    });
    realWiringCtxFileNeverNull(file, finding);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * P2 — `crossRepetitionDiscriminator` para `conditional-chain` YA consulta
 * `ctx.neighborhood.findingsOfKind`. Estos tests construyen un `Neighborhood`
 * a mano (`neighborhoodWith`) para ejercitar el CONSUMO real, sin pasar por
 * `buildNeighborhoodIndex` (eso es de `neighborhood.test.ts`, P3).
 * ──────────────────────────────────────────────────────────────────────── */
describe("strategyHypothesis — P2: 'repeticion-cruzada' para conditional-chain vía ctx.neighborhood", () => {
  const CHAIN_SOURCE = `
function describe(kind) {
  if (kind === "circle") {
    return handleCircle(kind);
  } else if (kind === "square") {
    return handleSquare(kind);
  } else {
    return 0;
  }
}
`;

  function chainFindingFor(file: FileUnit): Finding {
    return conditionalChainFinding({
      locations: [{ file: file.path, startLine: 2, endLine: 8, symbol: "describe", role: "cadena larga de condicionales" }],
    });
  }

  it("EMPTY_NEIGHBORHOOD (build() per-archivo, el único cableado que ve build() — Ola 10: el vecindario real llega vía refresh(), no acá): no se confirma, y la evidencia ya NO cita la razón vieja ('HypothesisContext no los expone')", async () => {
    const file = await jsFileFrom(CHAIN_SOURCE);
    const finding = chainFindingFor(file);
    const h = strategyHypothesis.build(finding, null, contextWithout(file))!;
    const crossDisc = h.discriminators.find((d) => d.why.toLowerCase().includes("discriminante"));
    expect(crossDisc?.passed).toBe(false);
    expect(crossDisc?.why).not.toContain("HypothesisContext no los expone");
    expect(crossDisc?.why).toContain("no aparece en ningún 'repeated-switch' ni otra 'conditional-chain'");
  });

  it("vecindario con un 'repeated-switch' del MISMO discriminante ('kind') en otro archivo: SÍ se confirma", async () => {
    const file = await jsFileFrom(CHAIN_SOURCE);
    const finding = chainFindingFor(file);
    const sibling = repeatedSwitchFinding({
      id: "f-repeat-sibling",
      title: '"kind" se decide con switch en 2 lugares distintos de este archivo',
      locations: [
        { file: "other.javascript", startLine: 1, endLine: 5, symbol: "priceFor", role: "primer switch sobre este discriminante" },
        { file: "other.javascript", startLine: 7, endLine: 11, symbol: "iconFor", role: "repetición #1" },
      ],
    });
    const ctx = contextWithNeighborhood(file, neighborhoodWith({ "repeated-switch": [sibling] }));
    const h = strategyHypothesis.build(finding, null, ctx)!;
    const crossDisc = h.discriminators.find((d) => d.why.toLowerCase().includes("discriminante"));
    expect(crossDisc?.passed).toBe(true);
    expect(crossDisc?.why).toContain("vecindario confirma repetición cruzada");
  });

  it("vecindario con OTRA 'conditional-chain' del MISMO discriminante EN EL MISMO archivo: SÍ se confirma (ctx.fileAt resuelve el mismo archivo)", async () => {
    const source = `
function describe(kind) {
  if (kind === "circle") {
    return handleCircle(kind);
  } else if (kind === "square") {
    return handleSquare(kind);
  } else {
    return 0;
  }
}
function otherDescribe(kind) {
  if (kind === "triangle") {
    return handleTriangle(kind);
  } else if (kind === "square") {
    return handleSquare2(kind);
  } else {
    return 0;
  }
}
`;
    const file = await jsFileFrom(source);
    const finding = conditionalChainFinding({
      locations: [{ file: file.path, startLine: 2, endLine: 8, symbol: "describe", role: "cadena larga de condicionales" }],
    });
    const other = conditionalChainFinding({
      id: "f-chain-sibling",
      locations: [{ file: file.path, startLine: 11, endLine: 17, symbol: "otherDescribe", role: "cadena larga de condicionales" }],
    });
    const ctx = contextWithNeighborhood(file, neighborhoodWith({ "conditional-chain": [other] }));
    const h = strategyHypothesis.build(finding, null, ctx)!;
    const crossDisc = h.discriminators.find((d) => d.why.toLowerCase().includes("discriminante"));
    expect(crossDisc?.passed).toBe(true);
    expect(crossDisc?.why).toContain("otra cadena en");
  });

  it("vecindario con un 'repeated-switch' de discriminante DISTINTO: no se confirma", async () => {
    const file = await jsFileFrom(CHAIN_SOURCE);
    const finding = chainFindingFor(file);
    const unrelated = repeatedSwitchFinding({
      id: "f-repeat-unrelated",
      title: '"shape.kind" se decide con switch en 2 lugares distintos de este archivo',
    });
    const ctx = contextWithNeighborhood(file, neighborhoodWith({ "repeated-switch": [unrelated] }));
    const h = strategyHypothesis.build(finding, null, ctx)!;
    const crossDisc = h.discriminators.find((d) => d.why.toLowerCase().includes("discriminante"));
    expect(crossDisc?.passed).toBe(false);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * Ola 10 — `refreshState`/`refresh()`: `build()` (árbol vivo) cachea el
 * discriminante propio; `refresh()` (sin árbol, con vecindario real) lo
 * reusa. El caso íntegro, de punta a punta, con `buildNeighborhoodIndex`
 * REAL (no un `Neighborhood` armado a mano como el describe de arriba) —
 * exactamente el camino que `code-analyzer.ts#crossAnalyze` ejercita en
 * producción vía `refreshHypotheses`.
 * ──────────────────────────────────────────────────────────────────────── */
describe("strategyHypothesis — Ola 10: refreshState (build) + refresh (sin árbol, vecindario real)", () => {
  const CHAIN_SOURCE = `
function describe(kind) {
  if (kind === "circle") {
    return handleCircle(kind);
  } else if (kind === "square") {
    return handleSquare(kind);
  } else {
    return 0;
  }
}
`;

  it("build() con árbol vivo cachea el discriminante propio en refreshState.ownDiscriminant ('conditional-chain')", async () => {
    const file = await jsFileFrom(CHAIN_SOURCE);
    const finding = conditionalChainFinding({
      locations: [{ file: file.path, startLine: 2, endLine: 8, symbol: "describe", role: "cadena larga de condicionales" }],
    });
    const h = strategyHypothesis.build(finding, null, contextWithout(file))!;
    expect(h.refreshState).toEqual({ ownDiscriminant: 'kind === "circle"' });
  });

  // Ola "required no permisivo": `ownDiscriminant` sólo puede cachearse
  // (o ausentarse) en una `build()` que YA devolvió una hipótesis no-nula —
  // y eso ahora exige árbol vivo real (ver el describe de arriba). El caso
  // "ownDiscriminant: null" sigue existiendo (es la ruta de `repeated-switch`,
  // línea 1287 de `strategy.ts`: null SIEMPRE para ese `kind`, tenga o no
  // árbol), pero necesita un árbol real detrás para que `build()` no
  // devuelva `null` por otro motivo primero.
  const REPEAT_SOURCE = `
function priceFor(kind) {
  switch (kind) {
    case "circle": return computeCirclePrice(kind);
    case "square": return computeSquarePrice(kind);
    default: return 0;
  }
}
function iconFor(kind) {
  switch (kind) {
    case "circle": return computeCircleIcon(kind);
    case "square": return computeSquareIcon(kind);
    default: return "?";
  }
}
`;

  function repeatFindingFor(file: FileUnit): Finding {
    return repeatedSwitchFinding({
      locations: [
        { file: file.path, startLine: 2, endLine: 6, symbol: "priceFor", role: "primer switch sobre este discriminante" },
        { file: file.path, startLine: 8, endLine: 13, symbol: "iconFor", role: "repetición #1" },
      ],
    });
  }

  it("build() sobre repeated-switch (con árbol vivo real) cachea ownDiscriminant: null SIEMPRE — es la ruta de `kind !== 'conditional-chain'`, no depende de si hay árbol", async () => {
    const file = await jsFileFrom(REPEAT_SOURCE);
    const h = strategyHypothesis.build(repeatFindingFor(file), null, contextWithout(file))!;
    expect(h).not.toBeNull();
    expect(h.refreshState).toEqual({ ownDiscriminant: null });
  });

  it("refresh() con ownDiscriminant: null (nada cacheado) ⇒ null, la hipótesis existente no se toca", async () => {
    const file = await jsFileFrom(REPEAT_SOURCE);
    const finding = repeatFindingFor(file);
    const existing = strategyHypothesis.build(finding, null, contextWithout(file))!;
    const next = strategyHypothesis.refresh!(existing, finding, null, contextWithout(file));
    expect(next).toBeNull();
  });

  it("refresh() con state 'aplicado-eludido' (no compite por confianza) ⇒ null aunque haya ownDiscriminant cacheado", async () => {
    const source = `
const handlers = {
  circle: (r) => r,
  square: (s) => s,
};
function describe(kind) {
  if (kind === "circle") {
    return handleCircle(kind);
  } else if (kind === "square") {
    return handleSquare(kind);
  } else {
    return 0;
  }
}
`;
    const file = await jsFileFrom(source);
    const finding = conditionalChainFinding({
      locations: [{ file: file.path, startLine: 6, endLine: 14, symbol: "describe", role: "cadena larga de condicionales" }],
    });
    const existing = strategyHypothesis.build(finding, null, contextWithout(file))!;
    expect(existing.state).toBe("aplicado-eludido");
    expect((existing.refreshState as { ownDiscriminant: string | null }).ownDiscriminant).not.toBeNull();
    const next = strategyHypothesis.refresh!(existing, finding, null, contextWithout());
    expect(next).toBeNull();
  });

  it("EXTREMO A EXTREMO: build() (árbol vivo, EMPTY_NEIGHBORHOOD) ⇒ 'repeticion-cruzada' no confirma ⇒ 'media'; refreshHypotheses() con un NeighborhoodIndex REAL (repeated-switch hermano, mismo discriminante) ⇒ SÍ confirma, sin volver a tocar el árbol", async () => {
    const file = await jsFileFrom(CHAIN_SOURCE);
    const chainFinding = conditionalChainFinding({
      locations: [{ file: file.path, startLine: 2, endLine: 8, symbol: "describe", role: "cadena larga de condicionales" }],
    });
    // Paso 1 — EXACTAMENTE la llamada (1) de `hypotheses/run.ts`: árbol vivo, EMPTY_NEIGHBORHOOD.
    const built = strategyHypothesis.build(chainFinding, null, contextWithout(file))!;
    // OLA BA — mismo estampado que `run.ts#conCapa`: la capa sale del builder, nunca del draft.
    chainFinding.hypotheses = [{ ...built, layer: strategyHypothesis.layer }];
    const beforeDisc = built.discriminators.find((d) => d.why.toLowerCase().includes("discriminante"));
    expect(beforeDisc?.passed).toBe(false);
    expect(built.confidence).toBe("media");

    // Paso 2 — un `Finding` hermano real, mismo discriminante ('kind'), en otro archivo.
    const sibling = repeatedSwitchFinding({
      id: "f-repeat-sibling",
      title: '"kind" se decide con switch en 2 lugares distintos de este archivo',
      locations: [
        { file: "other.javascript", startLine: 1, endLine: 5, symbol: "priceFor", role: "primer switch sobre este discriminante" },
        { file: "other.javascript", startLine: 7, endLine: 11, symbol: "iconFor", role: "repetición #1" },
      ],
    });
    // Paso 3 — EXACTAMENTE lo que `crossAnalyze` hace: `buildNeighborhoodIndex` UNA vez sobre TODOS los findings, después `refreshHypotheses` (nunca `build()` de nuevo) — sin árbol (`ctx.file` no entra acá).
    const index = buildNeighborhoodIndex(null, [chainFinding, sibling], null);
    refreshHypotheses({
      findings: [chainFinding],
      repo: { repoName: "fixture", files: [], functions: [], clones: [], graph: null },
      languages: new Map([["javascript", { capabilities: new Set(), sets: sharedSets }]]),
      neighborhoodIndex: index,
    });

    const afterDisc = chainFinding.hypotheses![0]!.discriminators.find((d) => d.why.toLowerCase().includes("discriminante"));
    expect(afterDisc?.passed).toBe(true);
    expect(afterDisc?.why).toContain("vecindario confirma repetición cruzada");
    // `state`/`checks` (los que decidió `build()` con árbol vivo) viajan INTACTOS — `refresh()` nunca los toca.
    expect(chainFinding.hypotheses![0]!.state).toBe(built.state);
    expect(chainFinding.hypotheses![0]!.checks).toEqual(built.checks);
    // Verificación cruzada, sin pasar por `strategy.ts`: el vecindario real ve al hermano.
    expect(neighborhoodFor(index, chainFinding).countOfKind("repeated-switch")).toBe(1);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * Ola 10 — CONTRATO-F10.md: las tres formas vía GRAFO. Refuta el corolario
 * viejo ("por su forma nunca puede producir ya-aplicado ni parcial") con
 * grafos sintéticos mínimos, mismo estilo que `wrapping-chain.test.ts`.
 * `graph` se pasa DIRECTO como 2º parámetro de `build()` — nunca vía
 * `ctx.repo.graph` (que `strategy.ts` no lee) — igual que el harness real
 * (`engine.ts#build` recibe `graph` aparte de `ctx`).
 *
 * BLOQUEO DE PRODUCCIÓN (declarado en el docstring de `strategy.ts`): estos
 * escenarios nunca ocurren en el cableado de HOY (las dos anclas son
 * intra-function/intra-file, `build()` siempre recibe `graph: null` ahí) —
 * prueban la LÓGICA, lista para cuando una ola futura re-cablee
 * `code-analyzer.ts`, o para el harness de medición
 * (`scripts/measure-strategy-structural.mts`) que la ejercita contra el
 * grafo real de los 8 repos.
 * ──────────────────────────────────────────────────────────────────────── */
describe("strategyHypothesis — Ola 10: estructura vía grafo (COMPLETA ⇒ ya-aplicado, PARCIAL, exclusión de State)", () => {
  const EMPTY_RESOLUTION = { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] };

  function sym(file: string, symbolPath: readonly string[], overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
    return { id: symbolNodeId(file, symbolPath), kind: "symbol", file, symbolPath, family: "class-like", ...overrides };
  }
  function method(file: string, ownerPath: string, name: string, arity: number, overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
    return sym(file, [ownerPath, name], { family: "function-like", arity, ...overrides });
  }
  function edge(from: string, to: string, kind: CodeGraphEdge["kind"], overrides: Partial<CodeGraphEdge> = {}): CodeGraphEdge {
    return { from, to, kind, provenance: "resolved", weight: 1, ...overrides };
  }
  function containsAll(ownerId: string, memberIds: readonly string[]): CodeGraphEdge[] {
    return memberIds.map((m) => edge(ownerId, m, "contains"));
  }

  const FILE = "strategy-graph.ts";

  /**
   * Ola "required no permisivo" — `distinctBehaviorCheck`/
   * `sameDiscriminantSubjectCheck`/`notStateCheck` ya no aprueban sin árbol,
   * así que este describe (que ejercita la evidencia vía GRAFO,
   * `structuralStrategyEvidence`) también necesita un árbol REAL detrás —
   * antes bastaba `contextWithout()` (sin archivo) porque esos tres
   * `required` aprobaban por default. Dos funciones reales en el MISMO
   * archivo, cada una con una escalera real de 2 ramas (mismo discriminante
   * "kind", callees DISTINTOS, sin prefijo de auto-referencia): `format`
   * (líneas 1-9) es "la Strategy" que vive dentro de los implementadores del
   * grafo; `describe` (líneas 21-29) es una segunda cadena real que NO es
   * miembro de ningún implementador — la usa el test de "localidad".
   */
  const GRAPH_CHAIN_SOURCE = `function format(kind) {
  if (kind === "circle") {
    return handleCircleA(kind);
  } else if (kind === "square") {
    return handleSquareA(kind);
  } else {
    return 0;
  }
}

// padding para separar "format" (líneas 1-9) de "describe" (líneas 21-29):
// las pruebas de grafo necesitan dos funciones reales en rangos de línea
// bien separados, una dentro y otra fuera de los implementadores conocidos.
//
//
//
//
//
//
//
function describe(kind) {
  if (kind === "triangle") {
    return handleTriangleB(kind);
  } else if (kind === "hexagon") {
    return handleHexagonB(kind);
  } else {
    return 0;
  }
}
`;

  async function graphChainFile(): Promise<FileUnit> {
    return jsFileFrom(GRAPH_CHAIN_SOURCE, FILE);
  }

  /** Interfaz `Formatter` + 2 implementadores (`JsonFormatter`/`XmlFormatter`) compartiendo `format/1` — sin consumidor todavía (cada test agrega el suyo). */
  function baseNodes() {
    const iface = sym(FILE, ["Formatter"], { family: "namespace-like" });
    const ifaceMember = method(FILE, "Formatter", "format", 1);
    const jsonImpl = sym(FILE, ["JsonFormatter"]);
    const jsonMember = method(FILE, "JsonFormatter", "format", 1);
    const xmlImpl = sym(FILE, ["XmlFormatter"]);
    const xmlMember = method(FILE, "XmlFormatter", "format", 1);
    return { iface, ifaceMember, jsonImpl, jsonMember, xmlImpl, xmlMember };
  }

  /** La cadena vive DENTRO de `JsonFormatter.format` (líneas 1-9 de `GRAPH_CHAIN_SOURCE`) — localidad exigida por `structuralStrategyEvidence`. */
  function chainInsideJsonFormat(): Finding {
    return conditionalChainFinding({ locations: [{ file: FILE, startLine: 1, endLine: 8, symbol: "format", role: "cadena larga de condicionales" }] });
  }

  it("COMPLETA vía calls directo a sym:I.m ⇒ ya-aplicado, confidence null", async () => {
    const { iface, ifaceMember, jsonImpl, jsonMember, xmlImpl, xmlMember } = baseNodes();
    const printer = sym(FILE, ["Printer"]);
    const printMember = method(FILE, "Printer", "print", 0);
    const graph: CodeGraph = {
      nodes: [iface, ifaceMember, jsonImpl, jsonMember, xmlImpl, xmlMember, printer, printMember],
      edges: [
        edge(jsonImpl.id, iface.id, "implements"),
        edge(xmlImpl.id, iface.id, "implements"),
        ...containsAll(iface.id, [ifaceMember.id]),
        ...containsAll(jsonImpl.id, [jsonMember.id]),
        ...containsAll(xmlImpl.id, [xmlMember.id]),
        ...containsAll(printer.id, [printMember.id]),
        edge(printMember.id, ifaceMember.id, "calls"),
      ],
      resolution: EMPTY_RESOLUTION,
    };
    const file = await graphChainFile();
    const h = strategyHypothesis.build(chainInsideJsonFormat(), graph, contextWithout(file))!;
    expect(h).not.toBeNull();
    expect(h.state).toBe("ya-aplicado");
    expect(h.confidence).toBeNull();
    const applied = h.checks.find((c) => c.label === "estructura-strategy-completa");
    expect(applied?.passed).toBe(true);
    expect(applied?.why).toContain("Strategy COMPLETA");
  });

  it("COMPLETA vía portador (carries fan-in>=2 + invokes-indirect) ⇒ ya-aplicado, sin ningún calls directo a la interfaz", async () => {
    const { iface, ifaceMember, jsonImpl, jsonMember, xmlImpl, xmlMember } = baseNodes();
    const printer = sym(FILE, ["Printer"]);
    const printMember = method(FILE, "Printer", "print", 0);
    const carrier: CodeGraphNode = { id: carrierNodeId(FILE, ["Printer", "format"], 0), kind: "carrier", file: FILE, symbolPath: ["Printer", "format"], carrierForm: "local" };
    const graph: CodeGraph = {
      nodes: [iface, ifaceMember, jsonImpl, jsonMember, xmlImpl, xmlMember, printer, printMember, carrier],
      edges: [
        edge(jsonImpl.id, iface.id, "implements"),
        edge(xmlImpl.id, iface.id, "implements"),
        ...containsAll(iface.id, [ifaceMember.id]),
        ...containsAll(jsonImpl.id, [jsonMember.id]),
        ...containsAll(xmlImpl.id, [xmlMember.id]),
        ...containsAll(printer.id, [printMember.id]),
        edge(carrier.id, jsonMember.id, "carries"),
        edge(carrier.id, xmlMember.id, "carries"),
        edge(printMember.id, carrier.id, "invokes-indirect"),
      ],
      resolution: EMPTY_RESOLUTION,
    };
    const file = await graphChainFile();
    const h = strategyHypothesis.build(chainInsideJsonFormat(), graph, contextWithout(file))!;
    expect(h.state).toBe("ya-aplicado");
    expect(h.confidence).toBeNull();
    expect(h.checks.find((c) => c.label === "estructura-strategy-completa")?.why).toContain("tabla de despacho, por grafo");
  });

  it("exclusión de State: los implementadores se instancian entre sí ⇒ el grupo se descarta, NO ya-aplicado (queda 'ausente')", async () => {
    const { iface, ifaceMember, jsonImpl, jsonMember, xmlImpl, xmlMember } = baseNodes();
    const printer = sym(FILE, ["Printer"]);
    const printMember = method(FILE, "Printer", "print", 0);
    const graph: CodeGraph = {
      nodes: [iface, ifaceMember, jsonImpl, jsonMember, xmlImpl, xmlMember, printer, printMember],
      edges: [
        edge(jsonImpl.id, iface.id, "implements"),
        edge(xmlImpl.id, iface.id, "implements"),
        ...containsAll(iface.id, [ifaceMember.id]),
        ...containsAll(jsonImpl.id, [jsonMember.id]),
        ...containsAll(xmlImpl.id, [xmlMember.id]),
        ...containsAll(printer.id, [printMember.id]),
        edge(printMember.id, ifaceMember.id, "calls"),
        edge(jsonImpl.id, xmlImpl.id, "instantiates"), // State, no Strategy — mismo grupo, se descarta entero.
      ],
      resolution: EMPTY_RESOLUTION,
    };
    const file = await graphChainFile();
    const h = strategyHypothesis.build(chainInsideJsonFormat(), graph, contextWithout(file))!;
    expect(h.state).toBe("ausente");
  });

  it("sin consumidor (interfaz + implementadores, pero nadie llama ni despacha) ⇒ no alcanza para COMPLETA, sigue 'ausente'", async () => {
    const { iface, ifaceMember, jsonImpl, jsonMember, xmlImpl, xmlMember } = baseNodes();
    const graph: CodeGraph = {
      nodes: [iface, ifaceMember, jsonImpl, jsonMember, xmlImpl, xmlMember],
      edges: [
        edge(jsonImpl.id, iface.id, "implements"),
        edge(xmlImpl.id, iface.id, "implements"),
        ...containsAll(iface.id, [ifaceMember.id]),
        ...containsAll(jsonImpl.id, [jsonMember.id]),
        ...containsAll(xmlImpl.id, [xmlMember.id]),
      ],
      resolution: EMPTY_RESOLUTION,
    };
    const file = await graphChainFile();
    const h = strategyHypothesis.build(chainInsideJsonFormat(), graph, contextWithout(file))!;
    expect(h.state).toBe("ausente");
  });

  it("localidad: la Strategy completa existe en el archivo pero la cadena NO vive en ninguno de sus implementadores ⇒ no es 'esta' Strategy, sigue 'ausente'", async () => {
    const { iface, ifaceMember, jsonImpl, jsonMember, xmlImpl, xmlMember } = baseNodes();
    const printer = sym(FILE, ["Printer"]);
    const printMember = method(FILE, "Printer", "print", 0);
    const graph: CodeGraph = {
      nodes: [iface, ifaceMember, jsonImpl, jsonMember, xmlImpl, xmlMember, printer, printMember],
      edges: [
        edge(jsonImpl.id, iface.id, "implements"),
        edge(xmlImpl.id, iface.id, "implements"),
        ...containsAll(iface.id, [ifaceMember.id]),
        ...containsAll(jsonImpl.id, [jsonMember.id]),
        ...containsAll(xmlImpl.id, [xmlMember.id]),
        ...containsAll(printer.id, [printMember.id]),
        edge(printMember.id, ifaceMember.id, "calls"),
      ],
      resolution: EMPTY_RESOLUTION,
    };
    // La cadena vive en `describe` (líneas 21-29 de GRAPH_CHAIN_SOURCE), que no es miembro de ningún implementador.
    const finding = conditionalChainFinding({ locations: [{ file: FILE, startLine: 21, endLine: 28, symbol: "describe", role: "cadena larga de condicionales" }] });
    const file = await graphChainFile();
    const h = strategyHypothesis.build(finding, graph, contextWithout(file))!;
    expect(h.state).toBe("ausente");
  });

  it("PARCIAL: portador real (carries fan-in>=2 + invokes-indirect) cuyos invocables NO comparten firma — despacho ad hoc, sin necesitar ninguna interfaz", async () => {
    const site = sym(FILE, ["describe"], { family: "function-like", arity: 1 });
    const helperA = method(FILE, "utils", "formatCircle", 1);
    const helperB = method(FILE, "utils", "formatSquareWithLabel", 2); // aridad distinta ⇒ heterogéneo.
    const carrier: CodeGraphNode = { id: carrierNodeId(FILE, ["describe", "handlers"], 0), kind: "carrier", file: FILE, symbolPath: ["describe", "handlers"], carrierForm: "local" };
    const graph: CodeGraph = {
      nodes: [site, helperA, helperB, carrier],
      edges: [edge(carrier.id, helperA.id, "carries"), edge(carrier.id, helperB.id, "carries"), edge(site.id, carrier.id, "invokes-indirect")],
      resolution: EMPTY_RESOLUTION,
    };
    const file = await graphChainFile();
    const h = strategyHypothesis.build(
      conditionalChainFinding({ locations: [{ file: FILE, startLine: 21, endLine: 28, symbol: "describe", role: "cadena larga de condicionales" }] }),
      graph,
      contextWithout(file),
    )!;
    expect(h.state).toBe("parcial");
    expect(h.confidence).not.toBeNull();
    expect(h.checks.find((c) => c.label === "tabla-de-despacho-existente")?.why).toContain("ad hoc");
  });

  it("carrier con fan-in 1 (una sola invocable) NO cuenta como tabla — sigue 'ausente'", async () => {
    const site = sym(FILE, ["describe"], { family: "function-like", arity: 1 });
    const helperA = method(FILE, "utils", "formatCircle", 1);
    const carrier: CodeGraphNode = { id: carrierNodeId(FILE, ["describe", "handlers"], 0), kind: "carrier", file: FILE, symbolPath: ["describe", "handlers"], carrierForm: "local" };
    const graph: CodeGraph = {
      nodes: [site, helperA, carrier],
      edges: [edge(carrier.id, helperA.id, "carries"), edge(site.id, carrier.id, "invokes-indirect")],
      resolution: EMPTY_RESOLUTION,
    };
    const file = await graphChainFile();
    const h = strategyHypothesis.build(
      conditionalChainFinding({ locations: [{ file: FILE, startLine: 21, endLine: 28, symbol: "describe", role: "cadena larga de condicionales" }] }),
      graph,
      contextWithout(file),
    )!;
    expect(h.state).toBe("ausente");
  });

  it("grafo null (la producción de hoy) ⇒ comportamiento IDÉNTICO a antes de esta ola — sin regresión", async () => {
    const file = await graphChainFile();
    const h = strategyHypothesis.build(chainInsideJsonFormat(), null, contextWithout(file))!;
    expect(h.state).toBe("ausente");
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * Ola D — `distinctBehaviorCheck`/`sameDiscriminantSubjectCheck`: la
 * distinción real ("tabla de clasificación" vs. "algoritmos intercambiables")
 * que el encargo pidió. Cada caso reproduce la FORMA de un falso real de la
 * muestra juzgada (rails.hypotheses.csv, pattern=Strategy) sin copiar su
 * texto — la forma es lo que se está probando, no la fila puntual.
 * ──────────────────────────────────────────────────────────────────────── */
describe("strategyHypothesis — Ola D: distinctBehaviorCheck / sameDiscriminantSubjectCheck", () => {
  it("tabla de clasificación (todas las ramas retornan un literal, ninguna invoca nada) ⇒ null — forma real de map_job_title_to_function/detect_source", async () => {
    const source = `
function classify(label) {
  if (label === "a") {
    return "Alpha";
  } else if (label === "b") {
    return "Beta";
  } else if (label === "c") {
    return "Gamma";
  } else if (label === "d") {
    return "Delta";
  } else if (label === "e") {
    return "Epsilon";
  } else {
    return "Unknown";
  }
}
`;
    const file = await jsFileFrom(source);
    const finding = conditionalChainFinding({
      locations: [{ file: file.path, startLine: 2, endLine: 16, symbol: "classify", role: "cadena larga de condicionales" }],
    });
    const h = strategyHypothesis.build(finding, null, contextWithout(file));
    expect(h).toBeNull();
  });

  it("todas las ramas convergen en la MISMA operación con argumentos distintos ⇒ null — forma real de resolve_parent/show_review_form_response", async () => {
    const source = `
function resolve(kind) {
  if (kind === "a") {
    return registry.find("a");
  } else if (kind === "b") {
    return registry.find("b");
  } else if (kind === "c") {
    return registry.find("c");
  } else if (kind === "d") {
    return registry.find("d");
  } else if (kind === "e") {
    return registry.find("e");
  } else {
    return null;
  }
}
`;
    const file = await jsFileFrom(source);
    const finding = conditionalChainFinding({
      locations: [{ file: file.path, startLine: 2, endLine: 16, symbol: "resolve", role: "cadena larga de condicionales" }],
    });
    const h = strategyHypothesis.build(finding, null, contextWithout(file));
    expect(h).toBeNull();
  });

  it("cada rama invoca una operación DISTINTA (ninguna converge) ⇒ sobrevive, candidata real — forma real de MigrateMateTool#call", async () => {
    const source = `
function dispatch(action) {
  if (action === "a") {
    return handleAlpha(query);
  } else if (action === "b") {
    return handleBeta(query);
  } else if (action === "c") {
    return handleGamma(query);
  } else if (action === "d") {
    return handleDelta(query);
  } else if (action === "e") {
    return handleEpsilon(query);
  } else {
    return { error: "invalid" };
  }
}
`;
    const file = await jsFileFrom(source);
    const finding = conditionalChainFinding({
      locations: [{ file: file.path, startLine: 2, endLine: 16, symbol: "dispatch", role: "cadena larga de condicionales" }],
    });
    const h = strategyHypothesis.build(finding, null, contextWithout(file))!;
    expect(h).not.toBeNull();
    expect(h.state).toBe("ausente");
    const check = h.checks.find((c) => c.label.includes("invoca una operación sustantiva"));
    expect(check?.passed).toBe(true);
    expect(check?.why).toContain("cada rama invoca una operación distinta");
  });

  it("cada rama testea una variable DISTINTA (despacho por presencia de argumento, aunque las operaciones invocadas SÍ sean distintas) ⇒ null — el diagnóstico de aridad que el encargo nombra aparte de resolve_parent", async () => {
    const source = `
function resolveParent(params) {
  if (params.questionId) {
    return findQuestion(params.questionId);
  } else if (params.formId) {
    return findForm(params.formId);
  } else if (params.typeId) {
    return findType(params.typeId);
  } else if (params.hookableType) {
    return resolvePolymorphicParent(params.hookableType);
  } else if (params.optional) {
    return findDefault(params.optional);
  } else {
    return null;
  }
}
`;
    const file = await jsFileFrom(source);
    const finding = conditionalChainFinding({
      locations: [{ file: file.path, startLine: 2, endLine: 16, symbol: "resolveParent", role: "cadena larga de condicionales" }],
    });
    const h = strategyHypothesis.build(finding, null, contextWithout(file));
    expect(h).toBeNull();
  });

  it("repeated-switch con UNA sola rama con acción ⇒ null (ola 'required no permisivo': antes, 'sin evidencia suficiente para juzgar convergencia' se mantenía como candidata permisiva; no alcanzar a juzgar convergencia no es lo mismo que confirmar divergencia)", async () => {
    const source = `
function priceFor(kind) {
  switch (kind) {
    case "circle":
      return computeCirclePrice(kind);
    default:
      return 0;
  }
}
`;
    const file = await jsFileFrom(source);
    const finding = repeatedSwitchFinding({
      locations: [
        { file: file.path, startLine: 2, endLine: 8, symbol: "priceFor", role: "primer switch sobre este discriminante" },
        { file: file.path, startLine: 2, endLine: 8, symbol: "priceFor", role: "repetición #1" },
      ],
    });
    const h = strategyHypothesis.build(finding, null, contextWithout(file));
    expect(h).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * Ola U — frente N5. Cuatro cambios, cada uno con la INTENCIÓN que verifica
 * escrita en el nombre del test. Los cuatro se encontraron midiendo el grafo
 * REAL de `corpus/sqlalchemy` con `scripts/n5-probe-strategy-registry.mts`,
 * no razonando sobre el código.
 * ──────────────────────────────────────────────────────────────────────── */
describe("strategyHypothesis — Ola U (N5): el protocolo de la familia se DECLARA, no se infiere; la familia puede cruzar archivos; una firma que el grafo no conoce no es una firma distinta", () => {
  const EMPTY_RESOLUTION = { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] };
  const FILE = "strategy-graph.ts";
  const OTHER = "otro-archivo.ts";

  function sym(file: string, symbolPath: readonly string[], overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
    return { id: symbolNodeId(file, symbolPath), kind: "symbol", file, symbolPath, family: "class-like", ...overrides };
  }
  function method(file: string, ownerPath: string, name: string, arity: number, overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
    return sym(file, [ownerPath, name], { family: "function-like", arity, ...overrides });
  }
  function edge(from: string, to: string, kind: CodeGraphEdge["kind"], overrides: Partial<CodeGraphEdge> = {}): CodeGraphEdge {
    return { from, to, kind, provenance: "resolved", weight: 1, ...overrides };
  }
  function containsAll(ownerId: string, memberIds: readonly string[]): CodeGraphEdge[] {
    return memberIds.map((m) => edge(ownerId, m, "contains"));
  }

  /** Mismo fixture de árbol que el describe de Ola 10: `format` (líneas 1-9) es el miembro donde vive la cadena. */
  const CHAIN_SOURCE = `function format(kind) {
  if (kind === "circle") {
    return handleCircleA(kind);
  } else if (kind === "square") {
    return handleSquareA(kind);
  } else {
    return 0;
  }
}
`;
  const chainInsideFormat = (): Finding =>
    conditionalChainFinding({ locations: [{ file: FILE, startLine: 1, endLine: 8, symbol: "format", role: "cadena larga de condicionales" }] });

  it("INTENCIÓN 'comparten un protocolo DECLARADO': una familia unida por `extends` a una base abstracta ⇒ ya-aplicado — la forma real de sqlalchemy (`_LazyLoader`/`_JoinedLoader` extends `LoaderStrategy`), invisible hasta esta ola porque el conjunto de aristas era {implements, satisfies} y en ese repo hay 1.927 `extends` y CERO `implements`", async () => {
    const base = sym(FILE, ["LoaderStrategy"]);
    const baseMember = method(FILE, "LoaderStrategy", "format", 1);
    const a = sym(FILE, ["JsonFormatter"]);
    const aMember = method(FILE, "JsonFormatter", "format", 1);
    const b = sym(FILE, ["XmlFormatter"]);
    const bMember = method(FILE, "XmlFormatter", "format", 1);
    const printer = sym(FILE, ["Printer"]);
    const printMember = method(FILE, "Printer", "print", 0);
    const graph: CodeGraph = {
      nodes: [base, baseMember, a, aMember, b, bMember, printer, printMember],
      edges: [
        edge(a.id, base.id, "extends"),
        edge(b.id, base.id, "extends"),
        ...containsAll(base.id, [baseMember.id]),
        ...containsAll(a.id, [aMember.id]),
        ...containsAll(b.id, [bMember.id]),
        ...containsAll(printer.id, [printMember.id]),
        edge(printMember.id, baseMember.id, "calls"),
      ],
      resolution: EMPTY_RESOLUTION,
    };
    const file = await jsFileFrom(CHAIN_SOURCE, FILE);
    const h = strategyHypothesis.build(chainInsideFormat(), graph, contextWithout(file))!;
    expect(h.state).toBe("ya-aplicado");
  });

  it("INTENCIÓN 'el protocolo lo declaró el autor': una familia que SÓLO existe por `satisfies` (inferida por coincidencia de miembros — `graph/edges/satisfies-derive.ts`, la forma que fabricó 1.360 aristas falsas) NO forma familia ⇒ sigue 'ausente'. Medido: en sqlalchemy esto agrupaba a `_NoLoader` con NUEVE hermanos suyos como si fueran sus implementadores", async () => {
    const pseudoBase = sym(FILE, ["NoLoader"]);
    const pseudoBaseMember = method(FILE, "NoLoader", "format", 1);
    const a = sym(FILE, ["JsonFormatter"]);
    const aMember = method(FILE, "JsonFormatter", "format", 1);
    const b = sym(FILE, ["XmlFormatter"]);
    const bMember = method(FILE, "XmlFormatter", "format", 1);
    const printer = sym(FILE, ["Printer"]);
    const printMember = method(FILE, "Printer", "print", 0);
    const graph: CodeGraph = {
      nodes: [pseudoBase, pseudoBaseMember, a, aMember, b, bMember, printer, printMember],
      edges: [
        edge(a.id, pseudoBase.id, "satisfies", { provenance: "inferred" }),
        edge(b.id, pseudoBase.id, "satisfies", { provenance: "inferred" }),
        ...containsAll(pseudoBase.id, [pseudoBaseMember.id]),
        ...containsAll(a.id, [aMember.id]),
        ...containsAll(b.id, [bMember.id]),
        ...containsAll(printer.id, [printMember.id]),
        edge(printMember.id, pseudoBaseMember.id, "calls"),
      ],
      resolution: EMPTY_RESOLUTION,
    };
    const file = await jsFileFrom(CHAIN_SOURCE, FILE);
    const h = strategyHypothesis.build(chainInsideFormat(), graph, contextWithout(file))!;
    expect(h.state).toBe("ausente");
  });

  it("INTENCIÓN 'la familia está anclada en este archivo', no 'la familia entera cabe en un archivo': base y un hermano en OTRO archivo, el hermano que aloja la cadena acá ⇒ ya-aplicado. Medido: 151 de las 242 familias con miembro común de sqlalchemy (62 %) tienen al menos un hermano fuera del archivo", async () => {
    const base = sym(OTHER, ["LoaderStrategy"]);
    const baseMember = method(OTHER, "LoaderStrategy", "format", 1);
    const here = sym(FILE, ["JsonFormatter"]);
    const hereMember = method(FILE, "JsonFormatter", "format", 1);
    const there = sym(OTHER, ["XmlFormatter"]);
    const thereMember = method(OTHER, "XmlFormatter", "format", 1);
    const printer = sym(OTHER, ["Printer"]);
    const printMember = method(OTHER, "Printer", "print", 0);
    const graph: CodeGraph = {
      nodes: [base, baseMember, here, hereMember, there, thereMember, printer, printMember],
      edges: [
        edge(here.id, base.id, "extends"),
        edge(there.id, base.id, "extends"),
        ...containsAll(base.id, [baseMember.id]),
        ...containsAll(here.id, [hereMember.id]),
        ...containsAll(there.id, [thereMember.id]),
        ...containsAll(printer.id, [printMember.id]),
        edge(printMember.id, baseMember.id, "calls"),
      ],
      resolution: EMPTY_RESOLUTION,
    };
    const file = await jsFileFrom(CHAIN_SOURCE, FILE);
    const h = strategyHypothesis.build(chainInsideFormat(), graph, contextWithout(file))!;
    expect(h.state).toBe("ya-aplicado");
  });

  it("INTENCIÓN 'esta cadena vive DENTRO de la familia': con familias que cruzan archivos, un homónimo del miembro en OTRO archivo no alcanza para la localidad ⇒ sigue 'ausente'", async () => {
    // La familia ESTÁ anclada acá — por el archivo del PROTOCOLO —, pero los
    // dos hermanos y sus `format` viven en OTHER. Sin el chequeo de archivo
    // del miembro, el `symbol: "format"` del hallazgo emparejaría con un
    // homónimo de otro archivo y esto pasaría a `ya-aplicado` por accidente.
    const base = sym(FILE, ["LoaderStrategy"]);
    const baseMember = method(FILE, "LoaderStrategy", "format", 1);
    const a = sym(OTHER, ["JsonFormatter"]);
    const aMember = method(OTHER, "JsonFormatter", "format", 1);
    const b = sym(OTHER, ["XmlFormatter"]);
    const bMember = method(OTHER, "XmlFormatter", "format", 1);
    const printer = sym(OTHER, ["Printer"]);
    const printMember = method(OTHER, "Printer", "print", 0);
    const graph: CodeGraph = {
      nodes: [base, baseMember, a, aMember, b, bMember, printer, printMember],
      edges: [
        edge(a.id, base.id, "extends"),
        edge(b.id, base.id, "extends"),
        ...containsAll(base.id, [baseMember.id]),
        ...containsAll(a.id, [aMember.id]),
        ...containsAll(b.id, [bMember.id]),
        ...containsAll(printer.id, [printMember.id]),
        edge(printMember.id, baseMember.id, "calls"),
      ],
      resolution: EMPTY_RESOLUTION,
    };
    const file = await jsFileFrom(CHAIN_SOURCE, FILE);
    // El hallazgo dice `symbol: "format"`, y hay miembros `format` en la familia — pero ninguno declarado en FILE.
    const h = strategyHypothesis.build(chainInsideFormat(), graph, contextWithout(file))!;
    expect(h.state).toBe("ausente");
  });

  it("INTENCIÓN 'la tabla despacha entre invocables NO sustituibles': dos literales anónimos (sin nombre ni aridad en el grafo) NO son evidencia de firmas distintas ⇒ ya no dispara PARCIAL. Medido: 662 de los 662 portadores con >=2 destinos de sqlalchemy se declaraban 'heterogéneos' por este artefacto", async () => {
    const site = sym(FILE, ["format"], { family: "function-like", arity: 1 });
    // Forma real de `graph/edges/portador.ts`: nodo sintético `<anon@n>`, sin `arity`.
    const anonA = sym(FILE, ["format", "<anon@0>"], { family: "function-like" });
    const anonB = sym(FILE, ["format", "<anon@2>"], { family: "function-like" });
    const carrier: CodeGraphNode = { id: carrierNodeId(FILE, ["format", "handlers"], 0), kind: "carrier", file: FILE, symbolPath: ["format", "handlers"], carrierForm: "local" };
    const graph: CodeGraph = {
      nodes: [site, anonA, anonB, carrier],
      edges: [edge(carrier.id, anonA.id, "carries"), edge(carrier.id, anonB.id, "carries"), edge(site.id, carrier.id, "invokes-indirect")],
      resolution: EMPTY_RESOLUTION,
    };
    const file = await jsFileFrom(CHAIN_SOURCE, FILE);
    const h = strategyHypothesis.build(chainInsideFormat(), graph, contextWithout(file))!;
    expect(h.state).toBe("ausente");
  });

  it("INTENCIÓN 'juzgamos las ramas de LA cadena que el hallazgo reporta': con dos switches en la misma función, se evalúa el que `repeated-switch` ubica por línea, no el más grande", async () => {
    // `chico` (línea 2) es una TABLA DE CLASIFICACIÓN — todas las ramas
    // retornan un literal. `grande` (línea 10) invoca operaciones distintas.
    // El hallazgo reporta el CHICO: el required de intención tiene que fallar.
    const source = `function priceFor(kind) {
  switch (kind) {
    case "a": return 1;
    case "b": return 2;
    case "c": return 3;
    default: return 0;
  }
}
function iconFor(kind) {
  switch (kind) {
    case "a": return drawCircle(kind);
    case "b": return drawSquare(kind);
    case "c": return drawTriangle(kind);
    case "d": return drawHexagon(kind);
    default: return null;
  }
}
`;
    const file = await jsFileFrom(source, FILE);
    // Las dos funciones son hermanas: `findEnclosingFunction` ubica `priceFor`
    // (líneas 1-8) y dentro de ella sólo está el switch chico — el caso que
    // esta prueba fija es el de la ELECCIÓN por línea, que la función de abajo
    // ejercita de verdad cuando los dos switches viven en la MISMA función.
    const anidados = `function render(kind) {
  switch (kind) {
    case "a": return 1;
    case "b": return 2;
    default: return 0;
  }
  switch (kind) {
    case "a": return drawCircle(kind);
    case "b": return drawSquare(kind);
    case "c": return drawTriangle(kind);
    default: return null;
  }
}
`;
    const fileAnidados = await jsFileFrom(anidados, FILE);
    void file;
    const reportaElChico = repeatedSwitchFinding({
      locations: [
        { file: FILE, startLine: 2, endLine: 6, symbol: "render", role: "primer switch sobre este discriminante" },
        { file: FILE, startLine: 7, endLine: 12, symbol: "render", role: "repetición #1" },
      ],
    });
    expect(strategyHypothesis.build(reportaElChico, null, contextWithout(fileAnidados))).toBeNull();

    const reportaElGrande = repeatedSwitchFinding({
      locations: [
        { file: FILE, startLine: 7, endLine: 12, symbol: "render", role: "primer switch sobre este discriminante" },
        { file: FILE, startLine: 2, endLine: 6, symbol: "render", role: "repetición #1" },
      ],
    });
    expect(strategyHypothesis.build(reportaElGrande, null, contextWithout(fileAnidados))?.state).toBe("ausente");
  });
});

describe("strategyHypothesis — Ola U (N5): la acción de un arm es TODO lo que el arm hace (C#/Java/Go no exponen campo de acción)", () => {
  const CS_PROBE = `class P {
  void f(int t) {
    if (t == 1) { a(); } else if (t == 2) { b(); } else { c(); }
    switch (t) { case 1: a(); break; default: break; }
  }
}`;

  /** Sets + FileUnit de C# — la gramática cuyo `switch_section` no tiene campo `consequence`/`body`. */
  async function csFileFrom(source: string, filePath = "fixture.csharp"): Promise<{ file: FileUnit; sets: DerivedNodeSets }> {
    const probeRoot = await parseRoot("tree-sitter-c_sharp.wasm", CS_PROBE);
    const sets = deriveNodeSets(probeRoot);
    const root = await parseRoot("tree-sitter-c_sharp.wasm", source);
    return { file: fileUnitFrom(root, sets, "csharp", { file: filePath }), sets };
  }

  function csContext(file: FileUnit, sets: DerivedNodeSets): HypothesisContext {
    const repo: RepoUnit = { repoName: "fixture", files: [], functions: [], clones: [], graph: null };
    return { file, fileAt: () => null, repo, capabilities: new Set(), setsFor: () => sets, neighborhood: EMPTY_NEIGHBORHOOD, branches: () => null };
  }

  /** El switch reportado arranca en la línea 3 en los dos fuentes de abajo. */
  function csRepeatedSwitch(): Finding {
    return repeatedSwitchFinding({
      language: "csharp",
      title: '"kind" se decide con switch en 2 lugares distintos de este archivo',
      locations: [
        { file: "fixture.csharp", startLine: 3, endLine: 12, symbol: "Render", role: "primer switch sobre este discriminante" },
        { file: "fixture.csharp", startLine: 20, endLine: 24, symbol: "Render", role: "repetición #1" },
      ],
    });
  }

  it("C#: arms que invocan operaciones DISTINTAS ⇒ candidata (antes: null, porque `switch_section` no expone campo de acción y la lista de ramas salía vacía)", async () => {
    const source = `class Renderer {
  void Render(string kind) {
    switch (kind) {
      case "circle":
        DrawCircle(kind);
        break;
      case "square":
        FillSquare(kind);
        break;
      case "hex":
        StrokeHexagon(kind);
        break;
      default:
        break;
    }
  }
}
`;
    const { file, sets } = await csFileFrom(source);
    const h = strategyHypothesis.build(csRepeatedSwitch(), null, csContext(file, sets));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
  });

  it("C#: arms que convergen en la MISMA operación con argumentos distintos ⇒ null — la exclusión de intención que en C# NUNCA se podía aplicar", async () => {
    const source = `class Renderer {
  void Render(string kind) {
    switch (kind) {
      case "circle":
        Append(MakeCircle(kind));
        break;
      case "square":
        Append(MakeSquare(kind));
        break;
      case "hex":
        Append(MakeHexagon(kind));
        break;
      default:
        break;
    }
  }
}
`;
    const { file, sets } = await csFileFrom(source);
    expect(strategyHypothesis.build(csRepeatedSwitch(), null, csContext(file, sets))).toBeNull();
  });

  it("C#: arms que sólo retornan un literal ⇒ null — tabla de clasificación, la otra mitad de la exclusión de intención", async () => {
    const source = `class Renderer {
  int Render(string kind) {
    switch (kind) {
      case "circle":
        return 1;
      case "square":
        return 2;
      case "hex":
        return 3;
      default:
        return 0;
    }
  }
}
`;
    const { file, sets } = await csFileFrom(source);
    expect(strategyHypothesis.build(csRepeatedSwitch(), null, csContext(file, sets))).toBeNull();
  });
});

describe("strategyHypothesis — Ola U (N5): la frontera con State también con `this` IMPLÍCITO (C#/Java/C++)", () => {
  const CS_PROBE = `class P {
  int f;
  void g(int t) {
    if (t == 1) { a(); } else if (t == 2) { b(); } else { c(); }
    switch (t) { case 1: a(); break; default: break; }
  }
}`;
  async function csFile(source: string): Promise<{ file: FileUnit; sets: DerivedNodeSets }> {
    const probeRoot = await parseRoot("tree-sitter-c_sharp.wasm", CS_PROBE);
    const sets = deriveNodeSets(probeRoot);
    const root = await parseRoot("tree-sitter-c_sharp.wasm", source);
    return { file: fileUnitFrom(root, sets, "csharp", { file: "fixture.csharp" }), sets };
  }
  function csCtx(file: FileUnit, sets: DerivedNodeSets): HypothesisContext {
    const repo: RepoUnit = { repoName: "fixture", files: [], functions: [], clones: [], graph: null };
    return { file, fileAt: () => null, repo, capabilities: new Set(), setsFor: () => sets, neighborhood: EMPTY_NEIGHBORHOOD, branches: () => null };
  }
  function finding(subject: string): Finding {
    return repeatedSwitchFinding({
      language: "csharp",
      title: `"${subject}" se decide con switch en 2 lugares distintos de este archivo`,
      locations: [
        { file: "fixture.csharp", startLine: 5, endLine: 15, symbol: "Step", role: "primer switch sobre este discriminante" },
        { file: "fixture.csharp", startLine: 20, endLine: 24, symbol: "Step", role: "repetición #1" },
      ],
    });
  }

  /** Mismo cuerpo en los dos: lo único que cambia es de DÓNDE viene el discriminante. */
  const cuerpo = (decl: string, disc: string) => `class Reader {
${decl}
  void Step() {
    switch (${disc}) {
      case 1:
        DrawCircle();
        break;
      case 2:
        FillSquare();
        break;
      case 3:
        StrokeHexagon();
        break;
      default:
        break;
    }
  }
}
`;

  it("discriminante declarado como CAMPO del tipo (sin `this.`) ⇒ null: es State, no Strategy — la forma real de JsonTextReader.cs:421 (`switch (_currentState)`) y BsonReader.cs:192", async () => {
    const { file, sets } = await csFile(cuerpo("  private int currentState;", "currentState"));
    expect(strategyHypothesis.build(finding("currentstate"), null, csCtx(file, sets))).toBeNull();
  });

  it("mismo cuerpo, discriminante que NO es miembro del tipo (llega de afuera) ⇒ candidata — el control que prueba que la exclusión discrimina y no apaga todo", async () => {
    const { file, sets } = await csFile(cuerpo("  private int otroCampo;", "kind"));
    const h = strategyHypothesis.build(finding("kind"), null, csCtx(file, sets));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
  });
});

describe("strategyHypothesis — Ola U (N5): una etiqueta de CAÍDA no es una rama", () => {
  it("JS: `case a: case b: <cuerpo>` cuenta UNA rama, no dos — sin esto, `lodash.js:6280 initCloneByTag` (nueve pares de etiquetas agrupadas) se leía como mayoría de ramas sin invocar nada y quedaba excluido como tabla de clasificación", async () => {
    const source = `function initCloneByTag(object, tag) {
  switch (tag) {
    case boolTag:
    case dateTag:
      return cloneDate(object);
    case mapTag:
    case setTag:
      return cloneMap(object);
    case regexpTag:
    case symbolTag:
      return cloneRegExp(object);
    default:
      return null;
  }
}
`;
    const file = await jsFileFrom(source, "fixture.javascript");
    const h = strategyHypothesis.build(
      conditionalChainFinding({ locations: [{ file: "fixture.javascript", startLine: 1, endLine: 15, symbol: "initCloneByTag", role: "cadena larga de condicionales" }] }),
      null,
      contextWithout(file),
    );
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * TERCERA ANCLA — `type-switch` (Ola X, frente B7)
 *
 * El detector `detect/intra-function/type-switch.ts` emite el DESPACHO POR
 * TIPO. Lo que estos tests fijan es el hueco que esa ancla cubre y que las
 * otras dos NO pueden cubrir: DOS ramas alcanzan. Un `conditional-chain` de
 * dos peldaños ni siquiera se emite (su piso es 5) y un `repeated-switch`
 * exige el mismo sujeto en dos lugares del archivo.
 * ──────────────────────────────────────────────────────────────────────── */
describe("strategyHypothesis — ancla `type-switch` (Ola X)", () => {
  const TYPE_SOURCE = `
function render(node) {
  if (node instanceof TextNode) {
    return renderText(node);
  } else if (node instanceof GroupNode) {
    return renderGroup(node);
  }
  return null;
}
`;

  function typeSwitchFinding(file: FileUnit, overrides: Partial<Finding> = {}): Finding {
    return {
      id: "f-typeswitch-1",
      detectorId: "type-switch",
      kind: "type-switch",
      scope: "intra-function",
      language: "javascript",
      variant: "escalera",
      title: "render decide por el TIPO de `node` en 2 ramas",
      detail: "Tipos decididos: TextNode, GroupNode.",
      trigger: [measurement("ramas que deciden por tipo", 2)],
      locations: [{ file: file.path, startLine: 3, endLine: 8, symbol: "render", role: "escalera que prueba el tipo de `node` en 2 peldaños" }],
      severity: 61,
      advice: { primary: { name: "Replace Conditional with Polymorphism", kind: "refactorizacion", why: "w", source: "https://x.test" } },
      ...overrides,
    };
  }

  it("está declarada como ancla, junto a las dos viejas y a las dos de NIVEL 2 (Ola AN, AN1)", () => {
    expect([...strategyHypothesis.anchors]).toEqual(["conditional-chain", "repeated-switch", "type-switch", "complexity", "long-function"]);
  });

  it("DOS ramas alcanzan: el piso de 5 peldaños de `conditional-chain` no aplica a esta ancla", async () => {
    const file = await jsFileFrom(TYPE_SOURCE);
    const h = strategyHypothesis.build(typeSwitchFinding(file), null, contextWithout(file));
    expect(h).not.toBeNull();
    const senal = h!.checks.find((c) => c.why.includes("deciden por el tipo"));
    expect(senal?.passed).toBe(true);
  });

  it("`un-solo-discriminante` se cumple por CONSTRUCCIÓN para esta ancla (el detector ya exige el mismo sujeto en todos los peldaños)", async () => {
    const file = await jsFileFrom(TYPE_SOURCE);
    const h = strategyHypothesis.build(typeSwitchFinding(file), null, contextWithout(file))!;
    const disc = h.checks.find((c) => c.why.includes("por construcción"));
    expect(disc?.passed).toBe(true);
  });

  it("si el sujeto es un campo propio (`this.state`), sigue siendo State y no Strategy — la frontera vale igual para esta ancla", async () => {
    const file = await jsFileFrom(TYPE_SOURCE);
    const h = strategyHypothesis.build(
      typeSwitchFinding(file, { title: "render decide por el TIPO de `this.state` en 2 ramas" }),
      null,
      contextWithout(file),
    );
    expect(h).toBeNull();
  });

  it("una sola rama no llega al piso propio del ancla (2)", async () => {
    const file = await jsFileFrom(TYPE_SOURCE);
    const h = strategyHypothesis.build(
      typeSwitchFinding(file, { trigger: [measurement("ramas que deciden por tipo", 1)] }),
      null,
      contextWithout(file),
    );
    expect(h).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * Ola Z (Z7) — `externalDiscriminantTypeCheck`: LA COMPUERTA QUE FALTA.
 *
 * Cada `it` verifica una intención puntual del docstring de la sección
 * homónima en `strategy.ts`. Los casos "no declarado"/"externo" reproducen
 * la FORMA real medida por la Ola Y (`guava/DoubleMath.roundIntermediate`:
 * `switch (mode)` sobre `RoundingMode`, un enum del JDK que el repo no
 * declara, con etiquetas SIN calificar — el nombre del tipo sólo vive en la
 * firma del parámetro) sin copiar el repo real.
 * ──────────────────────────────────────────────────────────────────────── */
describe("strategyHypothesis — Ola Z (Z7): compuerta 'tipo discriminante no externo'", () => {
  const EMPTY_RESOLUTION = { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] };

  function classLikeNode(file: string, name: string): CodeGraphNode {
    return { id: symbolNodeId(file, [name]), kind: "symbol", file, symbolPath: [name], family: "class-like" };
  }

  async function tsFileFrom(source: string, filePath = "fixture.typescript"): Promise<FileUnit> {
    const probeRoot = await parseRoot("tree-sitter-typescript.wasm", JS_PROBE);
    sharedSets = deriveNodeSets(probeRoot);
    const root = await parseRoot("tree-sitter-typescript.wasm", source);
    return fileUnitFrom(root, sharedSets, "typescript", { file: filePath });
  }

  // Forma real medida (Ola Y): el tipo del parámetro discrimina, pero las
  // ETIQUETAS de las ramas nunca lo nombran (Java/C# EXIGEN etiquetas de
  // enum sin calificar; acá se reproduce la misma forma en TS con literales
  // numéricos por simplicidad de parseo, la ausencia de nombre de tipo en el
  // texto de las ramas es lo que importa). Dos ramas que SÍ invocan
  // operaciones distintas — pasa `distinctBehaviorCheck`/
  // `sameDiscriminantSubjectCheck` igual que el resto de la suite.
  const UNQUALIFIED_ROUNDING_SOURCE = `
function roundIntermediate(x: number, mode: RoundingMode): number {
  if (mode === 1) {
    return handleFloor(x);
  } else if (mode === 2) {
    return handleCeil(x);
  } else {
    return x;
  }
}
`;

  function unqualifiedRoundingFinding(file: FileUnit, overrides: Partial<Finding> = {}): Finding {
    return conditionalChainFinding({
      language: "typescript",
      title: "Cadena de condiciones en roundIntermediate",
      locations: [{ file: file.path, startLine: 2, endLine: 8, symbol: "roundIntermediate", role: "cadena larga de condicionales" }],
      ...overrides,
    });
  }

  function checkFor(h: NonNullable<ReturnType<typeof strategyHypothesis.build>>) {
    const c = h.checks.find((c) => c.label.includes("no es, con evidencia, un tipo EXTERNO"));
    if (!c) throw new Error("check 'tipo-discriminante-no-externo' ausente de h.checks");
    return c;
  }

  it("parámetro tipado con un enum/clase que NINGÚN nodo del repo declara (RoundingMode del JDK) ⇒ excluye, build() devuelve null", async () => {
    const file = await tsFileFrom(UNQUALIFIED_ROUNDING_SOURCE);
    const graph: CodeGraph = { nodes: [classLikeNode(file.path, "SomethingElse")], edges: [], resolution: EMPTY_RESOLUTION };
    const h = strategyHypothesis.build(unqualifiedRoundingFinding(file), graph, contextWithout(file));
    expect(h).toBeNull();
  });

  it("el MISMO caso, pero el repo SÍ declara una clase llamada `RoundingMode` ⇒ no excluye", async () => {
    const file = await tsFileFrom(UNQUALIFIED_ROUNDING_SOURCE);
    const graph: CodeGraph = { nodes: [classLikeNode(file.path, "RoundingMode")], edges: [], resolution: EMPTY_RESOLUTION };
    const h = strategyHypothesis.build(unqualifiedRoundingFinding(file), graph, contextWithout(file))!;
    expect(h).not.toBeNull();
    expect(checkFor(h).passed).toBe(true);
    expect(checkFor(h).why).toContain("resuelve a una declaración de este repo");
  });

  it("dos clases DISTINTAS del repo comparten el nombre `RoundingMode` (ambiguo) ⇒ no excluye — lo ambiguo no colapsa a un candidato", async () => {
    const file = await tsFileFrom(UNQUALIFIED_ROUNDING_SOURCE);
    const graph: CodeGraph = {
      nodes: [classLikeNode("otro-archivo.ts", "RoundingMode"), classLikeNode(file.path, "RoundingMode")],
      edges: [],
      resolution: EMPTY_RESOLUTION,
    };
    const h = strategyHypothesis.build(unqualifiedRoundingFinding(file), graph, contextWithout(file))!;
    expect(h).not.toBeNull();
    expect(checkFor(h).passed).toBe(true);
    expect(checkFor(h).why).toContain("ambiguo");
  });

  it("sin grafo (graph === null) ⇒ no se puede confirmar externalidad, no excluye", async () => {
    const file = await tsFileFrom(UNQUALIFIED_ROUNDING_SOURCE);
    const h = strategyHypothesis.build(unqualifiedRoundingFinding(file), null, contextWithout(file))!;
    expect(h).not.toBeNull();
    expect(checkFor(h).passed).toBe(true);
    expect(checkFor(h).why).toContain("grafo no disponible");
  });

  it("discriminante sin forma de tipo (comparación contra literales de texto, forma State/Strategy ya cubierta por el resto de la suite) ⇒ sin candidatos, no excluye aunque haya grafo real", async () => {
    // Reusa la forma EXACTA de "COMPLETA vía calls directo..." (arriba, Ola
    // 10): discriminante "kind" comparado contra strings ("circle"/
    // "square"), ningún parámetro con tipo escrito (JS no tiene anotación).
    const source = `function format(kind) {
  if (kind === "circle") {
    return handleCircleA(kind);
  } else if (kind === "square") {
    return handleSquareA(kind);
  } else {
    return 0;
  }
}
`;
    const file = await jsFileFrom(source);
    const graph: CodeGraph = { nodes: [classLikeNode(file.path, "RoundingMode")], edges: [], resolution: EMPTY_RESOLUTION };
    const finding = conditionalChainFinding({ locations: [{ file: file.path, startLine: 1, endLine: 8, symbol: "format", role: "cadena larga de condicionales" }] });
    const h = strategyHypothesis.build(finding, graph, contextWithout(file))!;
    expect(h).not.toBeNull();
    expect(checkFor(h).passed).toBe(true);
    expect(checkFor(h).why).toContain("no se extrajo ningún nombre con forma de tipo");
  });

  it("ancla `type-switch`: reusa 'Tipos decididos' del detail — ninguno declarado en el repo ⇒ excluye", async () => {
    const source = `
function render(node) {
  if (node instanceof Assembly) {
    return renderAssembly(node);
  } else if (node instanceof MemberInfo) {
    return renderMember(node);
  }
  return null;
}
`;
    const file = await jsFileFrom(source);
    const finding: Finding = {
      id: "f-typeswitch-reflection",
      detectorId: "type-switch",
      kind: "type-switch",
      scope: "intra-function",
      language: "javascript",
      variant: "escalera",
      title: "render decide por el TIPO de `node` en 2 ramas",
      detail: "Tipos decididos: Assembly, MemberInfo.",
      trigger: [measurement("ramas que deciden por tipo", 2)],
      locations: [{ file: file.path, startLine: 2, endLine: 8, symbol: "render", role: "escalera que prueba el tipo de `node` en 2 peldaños" }],
      severity: 61,
      advice: { primary: { name: "Replace Conditional with Polymorphism", kind: "refactorizacion", why: "w", source: "https://x.test" } },
    };
    const graph: CodeGraph = { nodes: [classLikeNode(file.path, "SomethingElse")], edges: [], resolution: EMPTY_RESOLUTION };
    const h = strategyHypothesis.build(finding, graph, contextWithout(file));
    expect(h).toBeNull();
  });

  // BUG REAL, medido contra `corpus-app/gitea/modules/markup/markdown/
  // goldmark.go:63` (`switch v := n.(type) { case *ast.Paragraph: … }`,
  // paquete EXTERNO `goldmark/ast`): un tipo CALIFICADO (`ast.Paragraph`)
  // tiene un punto ADENTRO — el regex original de `typeSwitchDetailCandidates`
  // cortaba en el PRIMER punto ("Tipos decididos: [^.]+\."), así que el
  // candidato quedaba truncado en "*ast" (minúscula, se descarta) y CERO
  // candidatos sobrevivían: el tipo EXTERNO calificado, que es la forma que
  // esta compuerta más necesita atrapar, quedaba invisible.
  it("ancla `type-switch`: un tipo CALIFICADO en 'Tipos decididos' (Go, `*ast.Paragraph` — la forma real de gitea/goldmark.go:63) también se reconoce y excluye", async () => {
    const source = `
function render(node) {
  if (node instanceof Assembly) {
    return renderAssembly(node);
  } else if (node instanceof MemberInfo) {
    return renderMember(node);
  }
  return null;
}
`;
    const file = await jsFileFrom(source);
    const finding: Finding = {
      id: "f-typeswitch-qualified",
      detectorId: "type-switch",
      kind: "type-switch",
      scope: "intra-function",
      language: "go",
      variant: "switch",
      title: "(anónima) decide por el TIPO de `n` en 2 ramas",
      detail: "2 ramas de una misma decisión... Tipos decididos: *ast.Paragraph, *ast.List.",
      trigger: [measurement("ramas que deciden por tipo", 2)],
      locations: [{ file: file.path, startLine: 2, endLine: 8, symbol: "render", role: "switch que prueba el tipo de `n` en 2 ramas" }],
      severity: 61,
      advice: { primary: { name: "Replace Conditional with Polymorphism", kind: "refactorizacion", why: "w", source: "https://x.test" } },
    };
    const graph: CodeGraph = { nodes: [classLikeNode(file.path, "SomethingElse")], edges: [], resolution: EMPTY_RESOLUTION };
    const h = strategyHypothesis.build(finding, graph, contextWithout(file));
    expect(h).toBeNull();
  });

  /* ──────────────────────────────────────────────────────────────────────
   * OLA AL, FRENTE AL4 — la compuerta que, para un subconjunto identificable
   * de su entrada, no podía excluir NUNCA por construcción. Ver el bloque de
   * `citedTypeName`/`allCitedNamesAreLanguageWords` en `strategy.ts`.
   * ────────────────────────────────────────────────────────────────────── */

  // (ii) del defecto: las cinco gramáticas tipadas escriben la prueba de tipo
  // de un `case` como PATRÓN DE DECLARACIÓN, y el detector cita el par entero
  // ("Type t"). Antes: `simpleNominalTypeName("Type t")` → null (no es un
  // camino nominal) ⇒ CERO candidatos ⇒ la compuerta no podía excluir.
  // Caso real medido: `newtonsoft-json/…/ReflectionUtils.cs:838` (el
  // "System.Reflection" que la Ola Y nombró) y `ShareX/…/ShareXResources.cs:294`.
  it("AL4 · ancla `type-switch`, variante `switch`: el detector cita el PATRÓN DE DECLARACIÓN (`Type t`) y ninguno resuelve en el repo ⇒ excluye", async () => {
    const source = `
function render(node) {
  if (node instanceof Assembly) {
    return renderAssembly(node);
  } else if (node instanceof MemberInfo) {
    return renderMember(node);
  }
  return null;
}
`;
    const file = await jsFileFrom(source);
    const finding: Finding = {
      id: "f-al4-declaration-pattern",
      detectorId: "type-switch",
      kind: "type-switch",
      scope: "intra-function",
      language: "csharp",
      variant: "switch",
      title: "GetAttributes decide por el TIPO de `provider` en 5 ramas",
      detail: "Tipos decididos: Type t, Assembly a, MemberInfo memberInfo, Module module, ParameterInfo parameterInfo.",
      trigger: [measurement("ramas que deciden por tipo", 5)],
      locations: [{ file: file.path, startLine: 2, endLine: 8, symbol: "render", role: "switch que prueba el tipo de `provider` en 5 ramas" }],
      severity: 61,
      advice: { primary: { name: "Replace Conditional with Polymorphism", kind: "refactorizacion", why: "w", source: "https://x.test" } },
    };
    const graph: CodeGraph = { nodes: [classLikeNode(file.path, "SomethingElse")], edges: [], resolution: EMPTY_RESOLUTION };
    expect(strategyHypothesis.build(finding, graph, contextWithout(file))).toBeNull();
  });

  // El MISMO patrón de declaración, pero UNO de los tipos SÍ está declarado en
  // el repo ⇒ no excluye. Es el caso de las tres propuestas VERDADERAS de
  // `ShareX` (`RectangleAnnotation rectangle`, `OutlinedTextControl textBox`…):
  // sin esta rama el cambio las mataría.
  it("AL4 · el MISMO patrón de declaración, pero UNO de los tipos SÍ es del repo ⇒ NO excluye (las verdaderas de ShareX)", async () => {
    const source = `
function render(node) {
  if (node instanceof Assembly) {
    return renderAssembly(node);
  } else if (node instanceof MemberInfo) {
    return renderMember(node);
  }
  return null;
}
`;
    const file = await jsFileFrom(source);
    const finding: Finding = {
      id: "f-al4-declaration-pattern-propio",
      detectorId: "type-switch",
      kind: "type-switch",
      scope: "intra-function",
      language: "csharp",
      variant: "switch",
      title: "CreateVisual decide por el TIPO de `annotation` en 3 ramas",
      detail: "Tipos decididos: RectangleAnnotation rectangle, Shape shape, StepControl stepControl.",
      trigger: [measurement("ramas que deciden por tipo", 3)],
      locations: [{ file: file.path, startLine: 2, endLine: 8, symbol: "render", role: "switch que prueba el tipo de `annotation` en 3 ramas" }],
      severity: 61,
      advice: { primary: { name: "Replace Conditional with Polymorphism", kind: "refactorizacion", why: "w", source: "https://x.test" } },
    };
    const graph: CodeGraph = { nodes: [classLikeNode(file.path, "RectangleAnnotation")], edges: [], resolution: EMPTY_RESOLUTION };
    const h = strategyHypothesis.build(finding, graph, contextWithout(file))!;
    expect(h).not.toBeNull();
    expect(checkFor(h).passed).toBe(true);
  });

  // (i) del defecto: en Go la inicial MAYÚSCULA dice "exportado", no "tipo".
  // `type shortcode struct` es un tipo del propio paquete. Caso real medido:
  // `hugo/hugolib/shortcode.go:446`, una propuesta VERDADERA conocida —
  // antes el nombre se descartaba por minúscula y la compuerta quedaba muda;
  // ahora se lee, resuelve, y la compuerta sigue sin excluir. La verdadera
  // sobrevive por EVIDENCIA, no por ceguera.
  it("AL4 · Go: un tipo NO EXPORTADO del propio paquete (`*shortcode`, minúscula) resuelve y NO excluye — el caso verdadero de hugo/shortcode.go:446", async () => {
    const source = `
function render(node) {
  if (node instanceof Assembly) {
    return renderAssembly(node);
  } else if (node instanceof MemberInfo) {
    return renderMember(node);
  }
  return null;
}
`;
    const file = await jsFileFrom(source);
    const finding: Finding = {
      id: "f-al4-go-unexported",
      detectorId: "type-switch",
      kind: "type-switch",
      scope: "intra-function",
      language: "go",
      variant: "switch",
      title: "doRenderShortcode decide por el TIPO de `innerData` en 2 ramas",
      detail: "Tipos decididos: string, *shortcode.",
      trigger: [measurement("ramas que deciden por tipo", 2)],
      locations: [{ file: file.path, startLine: 2, endLine: 8, symbol: "render", role: "switch que prueba el tipo de `innerData` en 2 ramas" }],
      severity: 61,
      advice: { primary: { name: "Replace Conditional with Polymorphism", kind: "refactorizacion", why: "w", source: "https://x.test" } },
    };
    const graph: CodeGraph = { nodes: [classLikeNode(file.path, "shortcode")], edges: [], resolution: EMPTY_RESOLUTION };
    const h = strategyHypothesis.build(finding, graph, contextWithout(file))!;
    expect(h).not.toBeNull();
    expect(checkFor(h).passed).toBe(true);
  });

  // La figura "formas básicas de la gramática": TODOS los nombres citados son
  // palabras primitivas del lenguaje. Caso real medido:
  // `hugo/resources/images/meta/meta.go:447` (`case int: case int8: …`).
  it("AL4 · TODOS los tipos decididos son palabras primitivas del lenguaje (`int, int8, int16…`) ⇒ excluye: no hay declaración a la que mudarle comportamiento", async () => {
    const source = `
function render(node) {
  if (node instanceof Assembly) {
    return renderAssembly(node);
  } else if (node instanceof MemberInfo) {
    return renderMember(node);
  }
  return null;
}
`;
    const file = await jsFileFrom(source);
    const finding: Finding = {
      id: "f-al4-solo-primitivos",
      detectorId: "type-switch",
      kind: "type-switch",
      scope: "intra-function",
      language: "go",
      variant: "switch",
      title: "intFromString decide por el TIPO de `target` en 5 ramas",
      detail: "Tipos decididos: int, int8, int16, int32, int64.",
      trigger: [measurement("ramas que deciden por tipo", 5)],
      locations: [{ file: file.path, startLine: 2, endLine: 8, symbol: "render", role: "switch que prueba el tipo de `target` en 5 ramas" }],
      severity: 61,
      advice: { primary: { name: "Replace Conditional with Polymorphism", kind: "refactorizacion", why: "w", source: "https://x.test" } },
    };
    const graph: CodeGraph = { nodes: [classLikeNode(file.path, "SomethingElse")], edges: [], resolution: EMPTY_RESOLUTION };
    expect(strategyHypothesis.build(finding, graph, contextWithout(file))).toBeNull();
  });

  // El LÍMITE declarado, y por qué NO se ensancha la variante ESCALERA: ahí el
  // ancla ya bajó el nombre a minúsculas (`type-switch.ts#normalizeSubject`),
  // así que la única resolución posible sería insensible a mayúsculas — o sea
  // AMBIGUA. Medido: con ella la compuerta apagaría 30 falsas conocidas MÁS,
  // pero también la propuesta VERDADERA `hugo/markup/goldmark/
  // render_hooks.go:274`. Se publica el número y no se aterriza.
  it("AL4 · variante ESCALERA: los nombres llegan aplastados a minúsculas y NADA se ensancha — la compuerta sigue muda (el límite declarado)", async () => {
    const source = `
function render(node) {
  if (node instanceof Assembly) {
    return renderAssembly(node);
  } else if (node instanceof MemberInfo) {
    return renderMember(node);
  }
  return null;
}
`;
    const file = await jsFileFrom(source);
    const finding: Finding = {
      id: "f-al4-escalera-minusculas",
      detectorId: "type-switch",
      kind: "type-switch",
      scope: "intra-function",
      language: "go",
      variant: "escalera",
      title: "renderTexts decide por el TIPO de `n` en 2 ramas",
      detail: "Tipos decididos: *ast.string, *ast.text.",
      trigger: [measurement("ramas que deciden por tipo", 2)],
      locations: [{ file: file.path, startLine: 2, endLine: 8, symbol: "render", role: "escalera que prueba el tipo de `n` en 2 peldaños" }],
      severity: 61,
      advice: { primary: { name: "Replace Conditional with Polymorphism", kind: "refactorizacion", why: "w", source: "https://x.test" } },
    };
    const graph: CodeGraph = { nodes: [classLikeNode(file.path, "SomethingElse")], edges: [], resolution: EMPTY_RESOLUTION };
    const h = strategyHypothesis.build(finding, graph, contextWithout(file))!;
    expect(h).not.toBeNull();
    expect(checkFor(h).passed).toBe(true);
  });

  it("ancla `type-switch`: UNO de los tipos citados en 'Tipos decididos' SÍ es del repo ⇒ no excluye", async () => {
    const source = `
function render(node) {
  if (node instanceof Assembly) {
    return renderAssembly(node);
  } else if (node instanceof MemberInfo) {
    return renderMember(node);
  }
  return null;
}
`;
    const file = await jsFileFrom(source);
    const finding: Finding = {
      id: "f-typeswitch-reflection-2",
      detectorId: "type-switch",
      kind: "type-switch",
      scope: "intra-function",
      language: "javascript",
      variant: "escalera",
      title: "render decide por el TIPO de `node` en 2 ramas",
      detail: "Tipos decididos: Assembly, MemberInfo.",
      trigger: [measurement("ramas que deciden por tipo", 2)],
      locations: [{ file: file.path, startLine: 2, endLine: 8, symbol: "render", role: "escalera que prueba el tipo de `node` en 2 peldaños" }],
      severity: 61,
      advice: { primary: { name: "Replace Conditional with Polymorphism", kind: "refactorizacion", why: "w", source: "https://x.test" } },
    };
    const graph: CodeGraph = { nodes: [classLikeNode(file.path, "Assembly")], edges: [], resolution: EMPTY_RESOLUTION };
    const h = strategyHypothesis.build(finding, graph, contextWithout(file))!;
    expect(h).not.toBeNull();
    expect(checkFor(h).passed).toBe(true);
  });

  // Forma real medida contra el corpus (Ola Z, Z7): `newtonsoft-json/Src/
  // Newtonsoft.Json/Utilities/ReflectionUtils.cs:836` — `switch (provider) {
  // case Type t: … case Assembly a: … }`, ya juzgado FALSO por otro frente
  // ("switch(provider) por tipo de la reflexion de .NET... tipos EXTERNOS a
  // los que no se les puede agregar comportamiento", tests/golden/precision/
  // newtonsoft-json.hypotheses.csv). C# escribe la etiqueta de un switch por
  // TIPO como `case_pattern_switch_label` → `declaration_pattern` ("Type t",
  // sin campo propio de arm) — sonda directa contra `tree-sitter-c_sharp.wasm`
  // confirmó que `declaration_pattern` SÍ resuelve `childForFieldName("type")`
  // al identifier "Type" solo (`typeFieldWithinLabel`, `strategy.ts`).
  it("ancla `repeated-switch`, C#: `case Type t:`/`case Assembly a:` (la forma real de ReflectionUtils.cs:836) sobre tipos que el repo no declara ⇒ excluye", async () => {
    const CS_SWITCH_PROBE = `class X {
  object GetAttributes(object provider) {
    switch (provider) {
      case Type t:
        return ReadType(t);
      case Assembly a:
        return ReadAssembly(a);
      default:
        return null;
    }
  }
}`;
    const probeRoot = await parseRoot("tree-sitter-c_sharp.wasm", CS_SWITCH_PROBE);
    sharedSets = deriveNodeSets(probeRoot);
    const root = await parseRoot("tree-sitter-c_sharp.wasm", CS_SWITCH_PROBE);
    const file = fileUnitFrom(root, sharedSets, "csharp", { file: "fixture.csharp" });

    const finding = repeatedSwitchFinding({
      language: "csharp",
      title: '"provider" se decide con switch en 2 lugares distintos de este archivo',
      locations: [{ file: file.path, startLine: 3, endLine: 10, symbol: "GetAttributes", role: "primer switch sobre este discriminante" }],
    });
    const graph: CodeGraph = { nodes: [classLikeNode(file.path, "SomethingElseEntirely")], edges: [], resolution: EMPTY_RESOLUTION };
    const h = strategyHypothesis.build(finding, graph, contextWithout(file));
    expect(h).toBeNull();
  });

  it("el MISMO caso C#, pero el repo declara `Type` ⇒ no excluye (aunque `Assembly` siga sin resolver)", async () => {
    const CS_SWITCH_PROBE = `class X {
  object GetAttributes(object provider) {
    switch (provider) {
      case Type t:
        return ReadType(t);
      case Assembly a:
        return ReadAssembly(a);
      default:
        return null;
    }
  }
}`;
    const probeRoot = await parseRoot("tree-sitter-c_sharp.wasm", CS_SWITCH_PROBE);
    sharedSets = deriveNodeSets(probeRoot);
    const root = await parseRoot("tree-sitter-c_sharp.wasm", CS_SWITCH_PROBE);
    const file = fileUnitFrom(root, sharedSets, "csharp", { file: "fixture.csharp" });

    const finding = repeatedSwitchFinding({
      language: "csharp",
      title: '"provider" se decide con switch en 2 lugares distintos de este archivo',
      locations: [{ file: file.path, startLine: 3, endLine: 10, symbol: "GetAttributes", role: "primer switch sobre este discriminante" }],
    });
    const graph: CodeGraph = { nodes: [classLikeNode(file.path, "Type")], edges: [], resolution: EMPTY_RESOLUTION };
    const h = strategyHypothesis.build(finding, graph, contextWithout(file))!;
    expect(h).not.toBeNull();
    expect(checkFor(h).passed).toBe(true);
  });

  // BUG REAL, medido contra `corpus/hugo/hugolib/doctree/nodeshifttree.go:505`
  // (`switch r.LockType { case LockTypeRead: … case LockTypeWrite: … }`,
  // `LockType` declarado EN ESTE MISMO repo en `support.go:136`) y CERRADO en
  // esta misma ola: la primera versión de `switchArmLabelTexts` aceptaba
  // CUALQUIER etiqueta con "mayúscula inicial + alguna minúscula" como
  // candidato a tipo — pensada para Ruby, pero Go nombra sus CONSTANTES de
  // enum con la MISMA convención CamelCase que un nombre de clase. Con eso,
  // "LockTypeRead"/"LockTypeWrite" (constantes, no tipos) se trataban como
  // candidatos, no resolvían en el índice `class-like` (no son clases) y
  // EXCLUÍAN un caso cuyo tipo discriminante real (`LockType`) SÍ está
  // declarado — 1 de los 4 casos que la compuerta excluía en `hugo` antes de
  // este arreglo. El sujeto es un ACCESO A CAMPO (`r.LockType`, no un
  // parámetro a secas), así que la vía 3 tampoco aporta nada acá — el
  // resultado correcto es CERO candidatos, nunca excluir.
  it("ancla `repeated-switch`, Go: constantes CamelCase en las etiquetas (`case LockTypeRead:`) NO se confunden con nombres de tipo — no excluye, aunque el grafo no declare nada", async () => {
    const GO_PROBE = `package doctree

type LockType int

const (
	LockTypeNone LockType = iota
	LockTypeRead
	LockTypeWrite
)

type Walker struct {
	LockType LockType
}

func (r *Walker) lock() {
	switch r.LockType {
	case LockTypeRead:
		acquireRead()
	case LockTypeWrite:
		acquireWrite()
	default:
	}
}
`;
    const probeRoot = await parseRoot("tree-sitter-go.wasm", GO_PROBE);
    sharedSets = deriveNodeSets(probeRoot);
    const root = await parseRoot("tree-sitter-go.wasm", GO_PROBE);
    const file = fileUnitFrom(root, sharedSets, "go", { file: "fixture.go" });

    const finding = repeatedSwitchFinding({
      language: "go",
      title: '"r.LockType" se decide con switch en 2 lugares distintos de este archivo',
      locations: [{ file: file.path, startLine: 15, endLine: 21, symbol: "lock", role: "primer switch sobre este discriminante" }],
    });
    // Grafo vacío a propósito: si "LockTypeRead"/"LockTypeWrite" colaran como
    // candidatos, esto excluiría (cero nodos class-like con esos nombres).
    const graph: CodeGraph = { nodes: [], edges: [], resolution: EMPTY_RESOLUTION };
    const h = strategyHypothesis.build(finding, graph, contextWithout(file))!;
    expect(h).not.toBeNull();
    expect(checkFor(h).passed).toBe(true);
    expect(checkFor(h).why).toContain("no se extrajo ningún nombre con forma de tipo");
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * OLA AN, FRENTE AN1 — EL ANCLA DE NIVEL 2 (`complexity` / `long-function`).
 * Un test por INTENCIÓN, y el primero es el que la ola exige: que el chequeo
 * NO sea inerte, o sea que el camino DEPENDA del vecindario y no lo apruebe
 * por vacío.
 * ──────────────────────────────────────────────────────────────────────── */
describe("strategyHypothesis — ancla de NIVEL 2 (Ola AN, AN1): la decisión repetida que las tres anclas de despacho no pueden ver", () => {
  /** Dos escaleras SEPARADAS sobre `kind`, cinco valores distintos, cada rama invoca una operación distinta. */
  const DOS_ESCALERAS = `
function handle(kind, ctx) {
  if (kind === "a") {
    return alpha(ctx);
  } else if (kind === "b") {
    return beta(ctx);
  } else if (kind === "c") {
    return gamma(ctx);
  }
  record(ctx);
  if (kind === "d") {
    return delta(ctx);
  } else if (kind === "e") {
    return epsilon(ctx);
  }
  return null;
}
`;
  /** La MISMA forma, pero cada rama devuelve un literal: tabla de clasificación, no algoritmos. */
  const DOS_ESCALERAS_LITERALES = `
function label(kind) {
  if (kind === "a") {
    return "A";
  } else if (kind === "b") {
    return "B";
  } else if (kind === "c") {
    return "C";
  }
  if (kind === "d") {
    return "D";
  } else if (kind === "e") {
    return "E";
  }
  return "?";
}
`;
  /** Una GUARDA repetida: el mismo valor comparado seis veces. No hay alfabeto. */
  const GUARDA_REPETIDA = `
function guard(x, ctx) {
  if (x !== null) {
    alpha(ctx);
  }
  if (x !== null) {
    beta(ctx);
  }
  if (x !== null) {
    gamma(ctx);
  }
  if (x !== null) {
    delta(ctx);
  }
  if (x !== null) {
    epsilon(ctx);
  }
  return ctx;
}
`;
  /** UNA sola escalera de cinco peldaños: ésa la ve `conditional-chain`, no esta ancla. */
  const UNA_ESCALERA = `
function single(kind, ctx) {
  if (kind === "a") {
    return alpha(ctx);
  } else if (kind === "b") {
    return beta(ctx);
  } else if (kind === "c") {
    return gamma(ctx);
  } else if (kind === "d") {
    return delta(ctx);
  } else if (kind === "e") {
    return epsilon(ctx);
  }
  return null;
}
`;

  /** La escalera que el ancla VIEJA (`conditional-chain`) mide: cinco peldaños seguidos en `describe`, líneas 1-10 como declara `conditionalChainFinding()`. */
  const ESCALERA_DEL_ANCLA_VIEJA = `function describe(kind, ctx) {
  if (kind === "a") {
    return alpha(ctx);
  } else if (kind === "b") {
    return beta(ctx);
  } else if (kind === "c") {
    return gamma(ctx);
  } else if (kind === "d") {
    return delta(ctx);
  } else if (kind === "e") {
    return epsilon(ctx);
  }
  return null;
}
`;

  /** Un `Neighborhood` que responde `findingsInFile` — lo que este camino consulta (los tests viejos sólo poblaban `findingsOfKind`). */
  function neighborhoodInFile(findings: readonly Finding[]): Neighborhood {
    return {
      findingsAtSymbol: () => [],
      findingsInFile: () => findings,
      findingsOfKind: () => [],
      countOfKind: () => 0,
      truncated: () => false,
      ego: () => null,
      metric: () => undefined,
    };
  }

  function nivel2Finding(kind: string, symbol: string, overrides: Partial<Finding> = {}): Finding {
    return {
      id: `f-${kind}-1`,
      detectorId: kind,
      kind,
      scope: "intra-function",
      language: "javascript",
      variant: undefined,
      title: `${symbol}: complejidad cognitiva 16`,
      detail: "detalle",
      trigger: [measurement("complejidad cognitiva", 16)],
      locations: [{ file: "fixture.javascript", startLine: 2, endLine: 17, symbol, role: "función con complejidad cognitiva alta" }],
      severity: 60,
      advice: { primary: { name: "Extract Method", kind: "refactorizacion", why: "w", source: "https://x.test" } },
      ...overrides,
    };
  }

  /** Un vecino cualquiera que NO es de despacho: sólo sirve para que el vecindario responda algo. */
  function vecinoNeutro(): Finding {
    return nivel2Finding("long-parameter-list", "otraCosa", { id: "f-vecino-1", locations: [{ file: "fixture.javascript", startLine: 40, endLine: 41, symbol: "otraCosa", role: "r" }] });
  }

  it("INERCIA — vecindario VACÍO (la pasada 1 de `hypotheses/run.ts`, donde `ctx.neighborhood` es EMPTY_NEIGHBORHOOD SIEMPRE) ⇒ null: la ausencia de otras anclas no está demostrada", async () => {
    const file = await jsFileFrom(DOS_ESCALERAS);
    const h = strategyHypothesis.build(nivel2Finding("complexity", "handle"), null, contextWithout(file));
    expect(h).toBeNull();
  });

  it("EMITE cuando la misma expresión se decide en DOS escaleras separadas contra CINCO valores distintos, y `places` es la FUNCIÓN, no el hallazgo entero", async () => {
    const file = await jsFileFrom(DOS_ESCALERAS);
    const ctx = contextWithNeighborhood(file, neighborhoodInFile([vecinoNeutro()]));
    const h = strategyHypothesis.build(nivel2Finding("complexity", "handle"), null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    // `PatternHypothesisCheck.label` es `Check.describe` (ver `engine.ts#toCheck`), no el `id`.
    const fuerza = h!.checks.find((c) => c.label.includes("escaleras SEPARADAS"));
    expect(fuerza?.passed).toBe(true);
    expect(fuerza?.why).toContain("kind");
    expect(fuerza?.why).toContain("2 escaleras separadas");
    expect(h!.places[0]?.symbol).toBe("handle");
  });

  it("NO PUEDE emitir un estado CONFIRMADO — la garantía de que este camino jamás descarta la propuesta de Extract Method del mismo hallazgo vía arbitraje", async () => {
    const file = await jsFileFrom(DOS_ESCALERAS);
    const ctx = contextWithNeighborhood(file, neighborhoodInFile([vecinoNeutro()]));
    const h = strategyHypothesis.build(nivel2Finding("complexity", "handle"), null, ctx);
    expect(h).not.toBeNull();
    expect(["ya-aplicado", "aplicado-eludido"]).not.toContain(h!.state);
  });

  it("POBLACIÓN NUEVA — si un `conditional-chain` cubre el MISMO símbolo, se calla: esa propuesta ya llega por el ancla vieja", async () => {
    const file = await jsFileFrom(DOS_ESCALERAS);
    const vecino = conditionalChainFinding({ id: "f-cc-vecino", locations: [{ file: "fixture.javascript", startLine: 2, endLine: 17, symbol: "handle", role: "cadena" }] });
    const ctx = contextWithNeighborhood(file, neighborhoodInFile([vecino]));
    expect(strategyHypothesis.build(nivel2Finding("complexity", "handle"), null, ctx)).toBeNull();
  });

  it("DEDUPLICACIÓN entre los dos kinds de nivel 2 — con `complexity` sobre el mismo símbolo, el ancla `long-function` se calla (una propuesta por código, no dos)", async () => {
    const file = await jsFileFrom(DOS_ESCALERAS);
    const hermano = nivel2Finding("complexity", "handle", { id: "f-complexity-hermano" });
    const ctx = contextWithNeighborhood(file, neighborhoodInFile([hermano]));
    expect(strategyHypothesis.build(nivel2Finding("long-function", "handle", { id: "f-lf-1" }), null, ctx)).toBeNull();
  });

  it("FUERZA — una GUARDA repetida contra el MISMO valor no es un despacho: cinco escaleras, un solo valor ⇒ null (el caso que devolvía 447 falsos en gitea)", async () => {
    const file = await jsFileFrom(GUARDA_REPETIDA);
    const ctx = contextWithNeighborhood(file, neighborhoodInFile([vecinoNeutro()]));
    expect(strategyHypothesis.build(nivel2Finding("complexity", "guard"), null, ctx)).toBeNull();
  });

  it("ESCALA — UNA sola escalera de cinco peldaños ⇒ null: ésa la ve `conditional-chain`, y este camino existe sólo para la que NO ve", async () => {
    const file = await jsFileFrom(UNA_ESCALERA);
    const ctx = contextWithNeighborhood(file, neighborhoodInFile([vecinoNeutro()]));
    expect(strategyHypothesis.build(nivel2Finding("complexity", "single"), null, ctx)).toBeNull();
  });

  it("COMPORTAMIENTO — la misma forma con ramas que devuelven literales es una tabla de clasificación ⇒ null (MISMO criterio que `ramas-invocan-comportamiento-distinto` del ancla vieja)", async () => {
    const file = await jsFileFrom(DOS_ESCALERAS_LITERALES);
    const ctx = contextWithNeighborhood(file, neighborhoodInFile([vecinoNeutro()]));
    expect(strategyHypothesis.build(nivel2Finding("complexity", "label"), null, ctx)).toBeNull();
  });

  it("las TRES anclas viejas siguen entrando por el camino viejo — el ancla de nivel 2 no cambia una sola hipótesis existente", async () => {
    const file = await jsFileFrom(ESCALERA_DEL_ANCLA_VIEJA);
    const h = strategyHypothesis.build(conditionalChainFinding(), null, contextWithout(file));
    expect(h).not.toBeNull();
    expect(h!.checks.some((c) => c.label.includes("el vecindario del hallazgo se puede consultar"))).toBe(false);
    expect(h!.checks.some((c) => c.label.includes("todas las ramas de la escalera comparan la MISMA expresión"))).toBe(true);
  });
});
