/**
 * LA CAPA — OLA BA, FRENTE BA1. La compuerta de `HypothesisBuilder.layer`.
 *
 * QUÉ PROBLEMA CIERRA. El catálogo son 29 hipótesis registradas que en verdad
 * son DOS cosas con varas distintas: 12 patrones de diseño (GoF) y 17 familias
 * de refactorización (Fowler). Hasta esta ola NINGÚN campo lo decía, así que la
 * única forma de separarlas era por el NOMBRE — exactamente lo que dejó ciego a
 * `scratchpad-ax7/censo-patrones.py`, que buscaba `"Proxy"` mientras el volcado
 * escribía `"Proxy (inicialización perezosa)"`: 137 propuestas invisibles para
 * el instrumento que existía para que ninguna se perdiera, y sin un solo aviso.
 *
 * POR QUÉ ESTE ARCHIVO NO ES DECORATIVO (la pregunta que la Ola AX dejó abierta
 * cuando un test declaraba probar siete `required` y probaba seis). Cada `it` de
 * acá tiene una LÍNEA BASE que lo tumba, y está escrita adentro del propio test:
 *
 *   · `capaDeclarada` — el predicado que audita el registro — se ejercita
 *     TAMBIÉN contra un builder al que se le sacó la capa (`sinCapa`, abajo).
 *     Si el predicado fuera un `expect(true).toBe(true)` disfrazado, ese caso
 *     pasaría y el test se pondría rojo.
 *   · El estampado se prueba con DOS builders falsos de capas DISTINTAS sobre
 *     el mismo `Finding`: un estampado que devolviera una constante, o que
 *     copiara la capa del primer builder, no distingue los dos casos.
 *   · El viaje al cliente se prueba sobre el resultado de `analyzeRepo` — el
 *     `CodeAnalysis` público, el mismo objeto que la API serializa — no sobre
 *     el `PatternHypothesis` interno. Ése es el eslabón donde `missingEdgeKinds`
 *     murió sin que nadie lo notara (ver `types.ts#missingEdgeKinds`): escrito
 *     en el tipo del servidor, ausente del tipo que viaja.
 */
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { analyzeRepo } from "../code-analyzer.js";
import type { Capability } from "../detect/capabilities.js";
import { pisoDeclarado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import type { Finding, RepoUnit } from "../detect/types.js";
import { HYPOTHESES } from "./registry.js";
import { attachHypotheses, type HypothesesRunInput } from "./run.js";
import type { HypothesisBuilder, HypothesisLayer, PatternHypothesisDraft } from "./types.js";

const CAPAS: readonly HypothesisLayer[] = ["patron", "refactorizacion"];

/**
 * EL PREDICADO que audita el registro, aislado para poder ejercitarlo contra
 * una línea base que lo tumbe. Mira el valor en RUNTIME (no el tipo): un
 * builder al que el compilador ya no vigila —uno construido dinámicamente, o
 * uno que llegue de un registro inyectado en un test— tiene que caer igual.
 */
function capaDeclarada(b: Pick<HypothesisBuilder, "layer">): boolean {
  return CAPAS.includes(b.layer);
}

/** La línea base: el MISMO builder, sin la capa. Debe hacer fallar el predicado. */
function sinCapa(b: HypothesisBuilder): Pick<HypothesisBuilder, "layer"> {
  const { layer: _descartado, ...resto } = b;
  return resto as unknown as Pick<HypothesisBuilder, "layer">;
}

describe("hypotheses — la capa (patrón vs. refactorización)", () => {
  it("TODA hipótesis registrada declara una capa válida", () => {
    const sinDeclarar = HYPOTHESES.filter((h) => !capaDeclarada(h)).map((h) => h.id);
    expect(sinDeclarar, `hipótesis registradas sin capa válida: ${sinDeclarar.join(", ")}`).toEqual([]);
  });

  it("LÍNEA BASE — el mismo predicado RECHAZA un builder al que se le sacó la capa", () => {
    const primero = HYPOTHESES[0]!;
    expect(capaDeclarada(primero)).toBe(true);
    expect(
      capaDeclarada(sinCapa(primero)),
      "si esto da true, `capaDeclarada` no está mirando nada y el test de arriba no prueba nada",
    ).toBe(false);
  });

  it("las DOS capas son no vacías, y entre las dos suman el registro entero", () => {
    const patrones = HYPOTHESES.filter((h) => h.layer === "patron");
    const refactorizaciones = HYPOTHESES.filter((h) => h.layer === "refactorizacion");
    expect(patrones.length, "ninguna hipótesis declara ser un patrón de diseño").toBeGreaterThan(0);
    expect(refactorizaciones.length, "ninguna hipótesis declara ser una refactorización").toBeGreaterThan(0);
    // Partición, no sólo cobertura: ninguna hipótesis en las dos capas ni en
    // ninguna. Deliberadamente SIN congelar los conteos (12/17 hoy): un número
    // escrito acá sería otra lista a mano que se desincroniza — la que este
    // campo existe para eliminar.
    expect(patrones.length + refactorizaciones.length).toBe(HYPOTHESES.length);
  });

  it("ESTAMPADO — `attachHypotheses` copia la capa DEL BUILDER, y dos builders de capas distintas sobre el mismo hallazgo no se contagian", () => {
    const findings = [fakeFinding()];
    attachHypotheses(
      baseInput({
        findings,
        registry: [
          fakeBuilder({ id: "falso-patron", pattern: "A Patrón", layer: "patron" }),
          fakeBuilder({ id: "falso-refactor", pattern: "B Refactor", layer: "refactorizacion" }),
        ],
      }),
    );
    const porPatron = new Map((findings[0]!.hypotheses ?? []).map((h) => [h.pattern, h.layer] as const));
    expect(porPatron.get("A Patrón")).toBe("patron");
    expect(porPatron.get("B Refactor")).toBe("refactorizacion");
  });

  it("ESTAMPADO — ninguna hipótesis puede imponer su propia capa: el draft que devuelve `build` no la trae", () => {
    const findings = [fakeFinding()];
    // El builder MIENTE en el draft (una capa que no es la suya). Como
    // `run.ts#conCapa` estampa desde `builder.layer`, la mentira no sobrevive.
    const mentiroso = fakeBuilder({
      id: "mentiroso",
      pattern: "Mentiroso",
      layer: "refactorizacion",
      build: (problem: Finding) => ({ ...fakeDraft(problem.id ?? "f1"), layer: "patron" }) as unknown as PatternHypothesisDraft,
    });
    attachHypotheses(baseInput({ findings, registry: [mentiroso] }));
    expect(findings[0]!.hypotheses?.[0]?.layer).toBe("refactorizacion");
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * EL VIAJE AL CLIENTE — sobre el `CodeAnalysis` público de `analyzeRepo`,
 * que es lo que la API serializa, no sobre el tipo del servidor.
 * ──────────────────────────────────────────────────────────────────────── */
describe("hypotheses — la capa llega al cliente", () => {
  let root: string | null = null;
  afterEach(async () => {
    if (root) await fsp.rm(root, { recursive: true, force: true });
    root = null;
  });

  const CHAIN_SOURCE = `
function classify(kind) {
  if (kind === "a") {
    return handleA(kind);
  } else if (kind === "b") {
    return handleB(kind);
  } else if (kind === "c") {
    return handleC(kind);
  } else if (kind === "d") {
    return handleD(kind);
  } else if (kind === "e") {
    return handleE(kind);
  } else {
    return 0;
  }
}
`;

  it("toda hipótesis publicada por `analyzeRepo` trae `layer`, y coincide con la del builder registrado", async () => {
    root = await fsp.mkdtemp(path.join(fs.realpathSync(os.tmpdir()), "capa-"));
    await fsp.mkdir(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "classify.js"), CHAIN_SOURCE, "utf8");

    const result = await analyzeRepo({ dir: root, repoName: "fixture" });
    const publicadas = result.findings.flatMap((f) => f.hypotheses ?? []);
    expect(publicadas.length, "el fixture tiene que publicar al menos una hipótesis").toBeGreaterThan(0);

    const capaDelRegistro = new Map(HYPOTHESES.map((h) => [h.pattern, h.layer] as const));
    for (const h of publicadas) {
      expect(CAPAS, `la hipótesis "${h.pattern}" llegó al cliente sin capa válida (${String(h.layer)})`).toContain(h.layer);
      const esperada = capaDelRegistro.get(h.pattern);
      if (esperada) expect(h.layer, `"${h.pattern}" publicó una capa distinta de la de su builder`).toBe(esperada);
    }

    // El eslabón que mató a `missingEdgeKinds`: que sobreviva `JSON` es lo que
    // separa "está en el tipo" de "llega al panel".
    const serializada = JSON.parse(JSON.stringify(publicadas[0])) as { layer?: unknown };
    expect(serializada.layer, "la capa se pierde al serializar la respuesta").toBe(publicadas[0]!.layer);
  });
});

/* ── fixtures mínimos (misma forma que `run.test.ts`, sin árbol vivo: ningún
 *    test de acá evalúa un `required` real — todos usan builders falsos) ── */

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
    trigger: [{ label: "m", value: 5, threshold: fakeThreshold() }],
    locations: [{ file: "a.rb", startLine: 1, endLine: 5, role: "problema" }],
    severity: 50,
    advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
    ...overrides,
  };
}

function fakeRepo(): RepoUnit {
  return { repoName: "r", files: [], functions: [], clones: [], graph: null };
}

function fakeDraft(anchorFindingId: string, pattern = "Fake"): PatternHypothesisDraft {
  return {
    pattern,
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
    anchorFindingId,
  };
}

function fakeBuilder(over: Pick<HypothesisBuilder, "id" | "pattern" | "layer"> & Partial<HypothesisBuilder>): HypothesisBuilder {
  return {
    anchors: ["conditional-chain"],
    build: (problem: Finding) => fakeDraft(problem.id ?? "f1", over.pattern),
    ...over,
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
