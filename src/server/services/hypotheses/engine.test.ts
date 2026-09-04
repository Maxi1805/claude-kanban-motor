import { describe, expect, it } from "vitest";

import { arbitrateRivalHypotheses, build, toPatternHypothesis, type Check, type HypothesisSpec } from "./engine.js";
import type { PatternHypothesis, PatternState } from "./types.js";

/**
 * Problema/grafo sintéticos — NADA de AST acá a propósito: lo que se prueba
 * es el MOTOR (`build()`, la escalera, los 4 estados), no una extracción
 * estructural real (eso lo prueba cada `<patron>.test.ts` de S1, sobre su
 * propio `Problem`). `P`/`G` del motor son genéricos por diseño — un booleano
 * y un número alcanzan para ejercitar toda la lógica de `build()`.
 */
interface FakeProblem {
  distinctThings: number;
}
type FakeGraph = { ok: boolean } | undefined;

function check(id: string, holds: boolean, evidence = `${id}=${holds}`): Check<FakeProblem, FakeGraph> {
  return { id, describe: `check ${id}`, run: () => ({ holds, evidence }) };
}

function specWith(overrides: Partial<HypothesisSpec<FakeProblem, FakeGraph>> = {}): HypothesisSpec<FakeProblem, FakeGraph> {
  return {
    pattern: "Fake Pattern",
    ceiling: "alta",
    needs: [],
    required: [check("required-1", true)],
    discriminators: [],
    appliedState: () => ({ state: "ausente", checks: [] }),
    toConfirm: ["confirmar a mano"],
    source: "https://example.test/fake-pattern",
    ...overrides,
  };
}

describe("engine#build", () => {
  it("required no cumplido ⇒ null (ni siquiera candidata)", () => {
    const spec = specWith({ required: [check("r1", true), check("r2", false, "r2 no se cumple")] });
    expect(build(spec, new Set(), { distinctThings: 3 }, undefined)).toBeNull();
  });

  it("capacidad faltante ⇒ missingCapabilities no vacío, confidence null, NUNCA evalúa required/discriminators", () => {
    let ran = false;
    const spec = specWith({
      needs: ["unidad-tipo-clase"],
      required: [{ id: "r1", describe: "d", run: () => { ran = true; return { holds: true, evidence: "e" }; } }],
    });
    const outcome = build(spec, new Set(), { distinctThings: 3 }, undefined);
    expect(outcome).not.toBeNull();
    expect(outcome!.confidence).toBeNull();
    expect(outcome!.missingCapabilities).toEqual(["unidad-tipo-clase"]);
    expect(ran).toBe(false);
  });

  it("escalera: 0 discriminadores confirmados ⇒ baja, 1 ⇒ media, ≥2 ⇒ alta (estado ausente)", () => {
    const zero = specWith({ discriminators: [check("d1", false), check("d2", false)] });
    expect(build(zero, new Set(), { distinctThings: 1 }, undefined)?.confidence).toBe("baja");

    const one = specWith({ discriminators: [check("d1", true), check("d2", false)] });
    expect(build(one, new Set(), { distinctThings: 1 }, undefined)?.confidence).toBe("media");

    const two = specWith({ discriminators: [check("d1", true), check("d2", true)] });
    expect(build(two, new Set(), { distinctThings: 1 }, undefined)?.confidence).toBe("alta");
  });

  it("ceiling es un TECHO: una escalera perfecta no lo supera", () => {
    const spec = specWith({ ceiling: "media", discriminators: [check("d1", true), check("d2", true)] });
    expect(build(spec, new Set(), { distinctThings: 1 }, undefined)?.confidence).toBe("media");
  });

  it("estado ya-aplicado ⇒ confidence SIEMPRE null, sin importar la escalera", () => {
    const spec = specWith({
      appliedState: () => ({ state: "ya-aplicado", checks: [{ label: "l", passed: true, why: "w", role: "applied" }] }),
      discriminators: [check("d1", true), check("d2", true)],
    });
    const outcome = build(spec, new Set(), { distinctThings: 1 }, undefined);
    expect(outcome?.state).toBe("ya-aplicado");
    expect(outcome?.confidence).toBeNull();
  });

  it("estado aplicado-eludido ⇒ confidence también null (alerta de fuga, no oportunidad)", () => {
    const spec = specWith({
      appliedState: () => ({ state: "aplicado-eludido", checks: [{ label: "fuga", passed: true, why: "w", role: "applied" }] }),
    });
    const outcome = build(spec, new Set(), { distinctThings: 1 }, undefined);
    expect(outcome?.state).toBe("aplicado-eludido");
    expect(outcome?.confidence).toBeNull();
  });

  it("estado parcial SÍ compite (a diferencia de ya-aplicado/aplicado-eludido)", () => {
    const spec = specWith({ appliedState: () => ({ state: "parcial", checks: [] }) });
    const outcome = build(spec, new Set(), { distinctThings: 1 }, undefined);
    expect(outcome?.state).toBe("parcial");
    expect(outcome?.confidence).not.toBeNull();
  });

  it("evidencia SIEMPRE presente, también cuando el check falla", () => {
    const spec = specWith({ required: [check("r1", false, "razón exacta de por qué no")] });
    // required falló ⇒ build() devuelve null; se ejercita `why` vía discriminators/applied en su lugar.
    const spec2 = specWith({ discriminators: [check("d1", false, "razón exacta de por qué no")] });
    const outcome = build(spec2, new Set(), { distinctThings: 1 }, undefined);
    expect(outcome!.discriminators[0]!.why).toBe("razón exacta de por qué no");
    expect(build(spec, new Set(), { distinctThings: 1 }, undefined)).toBeNull();
  });

  describe("OLA A3 — needsEdges/edgeKindsPresent (equivalente de InterFileDetector.needsEdges)", () => {
    it("needsEdges declarado pero edgeKindsPresent AUSENTE ⇒ el chequeo no aplica, comportamiento idéntico a antes", () => {
      const spec = specWith({ needsEdges: ["extends", "implements"] });
      const outcome = build(spec, new Set(), { distinctThings: 1 }, undefined);
      expect(outcome).not.toBeNull();
      expect(outcome!.missingEdgeKinds).toEqual([]);
      expect(outcome!.state).toBe("ausente"); // llegó hasta appliedState normalmente, no se cortó antes
    });

    it("needsEdges declarado y edgeKindsPresent NO tiene uno de los kinds ⇒ missingEdgeKinds no vacío, confidence null, nunca evalúa required", () => {
      let ran = false;
      const spec = specWith({
        needsEdges: ["extends", "implements"],
        required: [{ id: "r1", describe: "d", run: () => { ran = true; return { holds: true, evidence: "e" }; } }],
      });
      const outcome = build(spec, new Set(), { distinctThings: 1 }, undefined, new Set(["implements"]));
      expect(outcome).not.toBeNull();
      expect(outcome!.confidence).toBeNull();
      expect(outcome!.missingEdgeKinds).toEqual(["extends"]);
      expect(outcome!.missingCapabilities).toEqual([]);
      expect(ran).toBe(false);
    });

    it("needsEdges declarado y edgeKindsPresent tiene TODOS los kinds ⇒ corre normalmente, missingEdgeKinds vacío", () => {
      const spec = specWith({ needsEdges: ["extends", "implements"] });
      const outcome = build(spec, new Set(), { distinctThings: 1 }, undefined, new Set(["extends", "implements", "references"]));
      expect(outcome!.missingEdgeKinds).toEqual([]);
    });

    it("needsEdges AUSENTE (default) con edgeKindsPresent presente ⇒ no hay nada que chequear, corre normalmente", () => {
      const spec = specWith(); // sin needsEdges
      const outcome = build(spec, new Set(), { distinctThings: 1 }, undefined, new Set());
      expect(outcome!.missingEdgeKinds).toEqual([]);
    });

    it("missingCapabilities gana si TAMBIÉN falta una capacidad — el chequeo de aristas ni se llega a mirar", () => {
      const spec = specWith({ needs: ["unidad-tipo-clase"], needsEdges: ["extends"] });
      const outcome = build(spec, new Set(), { distinctThings: 1 }, undefined, new Set());
      expect(outcome!.missingCapabilities).toEqual(["unidad-tipo-clase"]);
      expect(outcome!.missingEdgeKinds).toEqual([]); // no llegó a evaluarse, sigue vacío
    });

    it("toPatternHypothesis: missingEdgeKinds no vacío viaja al PatternHypothesis final; vacío ⇒ undefined (no [] disfrazado)", () => {
      const specBlocked = specWith({ needsEdges: ["extends"] });
      const blocked = build(specBlocked, new Set(), { distinctThings: 1 }, undefined, new Set())!;
      const hBlocked = toPatternHypothesis(specBlocked, blocked, { anchorFindingId: "f1", places: [], cost: "bajo" });
      expect(hBlocked.missingEdgeKinds).toEqual(["extends"]);

      const specOk = specWith();
      const ok = build(specOk, new Set(), { distinctThings: 1 }, undefined)!;
      const hOk = toPatternHypothesis(specOk, ok, { anchorFindingId: "f2", places: [], cost: "bajo" });
      expect(hOk.missingEdgeKinds).toBeUndefined();
    });
  });

  it("checks trae required (role='required') + applied (role='applied') juntos; discriminators aparte", () => {
    const spec = specWith({
      required: [check("r1", true)],
      appliedState: () => ({ state: "ausente", checks: [{ label: "excluder", passed: false, why: "no aplica", role: "applied" }] }),
      discriminators: [check("d1", true)],
    });
    const outcome = build(spec, new Set(), { distinctThings: 1 }, undefined)!;
    expect(outcome.checks.map((c) => c.role)).toEqual(["required", "applied"]);
    expect(outcome.discriminators.map((c) => c.role)).toEqual(["discriminator"]);
  });
});

/**
 * `arbitrateRivalHypotheses` — bug 2 de "tres bugs de mecanismo" (`RAICES.md`).
 * Caso testigo REAL: `app/models/hookable.rb:255` cuelga `State: ausente` Y
 * `Strategy: aplicado-eludido` sobre el MISMO `Finding` — la regla descarta
 * la oportunidad cuando otro patrón ya confirmó estructuralmente su forma.
 */
function fakeHypothesis(pattern: string, state: PatternState, places: PatternHypothesis["places"] = []): PatternHypothesis {
  return {
    pattern,
    layer: "patron",
    state,
    confidence: state === "ausente" || state === "parcial" ? "media" : null,
    ceiling: "media",
    provisional: true,
    checks: [],
    discriminators: [],
    places,
    toConfirm: [],
    cost: "",
    source: "https://example.test",
    missingCapabilities: [],
    anchorFindingId: "f1",
  };
}

/** Un lugar con rango, para ejercitar la compuerta de rivalidad de la Ola X. */
function place(file: string, startLine: number, endLine: number): PatternHypothesis["places"][number] {
  return { file, startLine, endLine, role: "sujeto" };
}

describe("engine#arbitrateRivalHypotheses", () => {
  it("0 ó 1 hipótesis ⇒ no-op (la inmensa mayoría de los casos)", () => {
    expect(arbitrateRivalHypotheses([])).toEqual([]);
    const one = [fakeHypothesis("State", "ausente")];
    expect(arbitrateRivalHypotheses(one)).toEqual(one);
  });

  it("CASO TESTIGO (hookable.rb:255): State ausente + Strategy aplicado-eludido sobre el mismo ancla ⇒ sólo sobrevive Strategy", () => {
    const state = fakeHypothesis("State", "ausente");
    const strategy = fakeHypothesis("Strategy", "aplicado-eludido");
    const result = arbitrateRivalHypotheses([state, strategy]);
    expect(result).toEqual([strategy]);
  });

  it("orden inverso (Strategy antes que State en el registro) ⇒ mismo resultado, el arbitraje no depende del orden", () => {
    const state = fakeHypothesis("State", "ausente");
    const strategy = fakeHypothesis("Strategy", "aplicado-eludido");
    const result = arbitrateRivalHypotheses([strategy, state]);
    expect(result).toEqual([strategy]);
  });

  it("ya-aplicado también gana (no sólo aplicado-eludido) — ambos son CONFIRMACIÓN, ninguno oportunidad", () => {
    const decorator = fakeHypothesis("Decorator", "parcial");
    const proxy = fakeHypothesis("Proxy (inicialización perezosa)", "ya-aplicado");
    expect(arbitrateRivalHypotheses([decorator, proxy])).toEqual([proxy]);
  });

  it("dos OPORTUNIDADES de patrones distintos, sin ninguna confirmación rival ⇒ ninguna se descarta (declarado: sin señal para preferir)", () => {
    const a = fakeHypothesis("State", "ausente");
    const b = fakeHypothesis("Strategy", "ausente");
    expect(arbitrateRivalHypotheses([a, b])).toEqual([a, b]);
  });

  it("dos CONFIRMACIONES de patrones distintos, sin ninguna oportunidad ⇒ ninguna se descarta (nada que arbitrar)", () => {
    const a = fakeHypothesis("Decorator", "ya-aplicado");
    const b = fakeHypothesis("Strategy", "aplicado-eludido");
    expect(arbitrateRivalHypotheses([a, b])).toEqual([a, b]);
  });

  it("tres hipótesis: dos oportunidades + una confirmación ⇒ las dos oportunidades caen, sólo sobrevive la confirmación", () => {
    const a = fakeHypothesis("State", "ausente");
    const b = fakeHypothesis("Chain of Responsibility", "ausente");
    const c = fakeHypothesis("Strategy", "aplicado-eludido");
    expect(arbitrateRivalHypotheses([a, b, c])).toEqual([c]);
  });

  /**
   * OLA X, FRENTE B1 — LA COMPUERTA DE RIVALIDAD. La intención que verifica:
   * *"¿las dos hipótesis hablan del MISMO pedazo de código, o sólo comparten
   * el hallazgo que las disparó?"* Compartir `anchorFindingId` no implica lo
   * primero — un `large-class`/`god-component` tiene por ancla una clase o un
   * archivo entero, y dos patrones pueden colgar de él hablando de miembros
   * distintos. Una confirmación sobre OTRO lugar no contradice nada.
   */
  it("RIVALIDAD: la confirmación silencia la oportunidad cuando los `places` se SOLAPAN (el caso testigo, ahora con lugares reales)", () => {
    const state = fakeHypothesis("State", "ausente", [place("a.rb", 250, 300)]);
    const strategy = fakeHypothesis("Strategy", "aplicado-eludido", [place("a.rb", 255, 260)]);
    expect(arbitrateRivalHypotheses([state, strategy])).toEqual([strategy]);
  });

  it("RIVALIDAD: la confirmación NO silencia una oportunidad sobre un rango DISJUNTO del mismo archivo", () => {
    const templateMethod = fakeHypothesis("Template Method", "parcial", [place("a.java", 10, 40)]);
    const decorator = fakeHypothesis("Decorator", "ya-aplicado", [place("a.java", 200, 240)]);
    expect(arbitrateRivalHypotheses([templateMethod, decorator])).toEqual([templateMethod, decorator]);
  });

  it("RIVALIDAD: tampoco silencia cuando la confirmación vive en OTRO archivo", () => {
    const templateMethod = fakeHypothesis("Template Method", "parcial", [place("a.java", 10, 40)]);
    const facade = fakeHypothesis("Facade", "aplicado-eludido", [place("b.java", 10, 40)]);
    expect(arbitrateRivalHypotheses([templateMethod, facade])).toEqual([templateMethod, facade]);
  });

  it("RIVALIDAD: alcanza con que UN par de lugares se solape (una hipótesis puede nombrar varios)", () => {
    const opp = fakeHypothesis("Template Method", "parcial", [place("a.java", 10, 40), place("a.java", 300, 320)]);
    const conf = fakeHypothesis("Decorator", "ya-aplicado", [place("a.java", 310, 315)]);
    expect(arbitrateRivalHypotheses([opp, conf])).toEqual([conf]);
  });

  it("RIVALIDAD: sin `places` de alguno de los dos lados se asume rivalidad — el comportamiento viejo, que es el conservador", () => {
    const opp = fakeHypothesis("State", "ausente");
    const conf = fakeHypothesis("Strategy", "aplicado-eludido", [place("a.rb", 255, 260)]);
    expect(arbitrateRivalHypotheses([opp, conf])).toEqual([conf]);
  });
});

describe("engine#toPatternHypothesis", () => {
  it("envuelve un EngineOutcome con lo que sólo la hipótesis concreta sabe (anchorFindingId/places/cost)", () => {
    const spec = specWith();
    const outcome = build(spec, new Set(), { distinctThings: 1 }, undefined)!;
    const h = toPatternHypothesis(spec, outcome, {
      anchorFindingId: "finding-123",
      places: [{ file: "a.rb", startLine: 1, endLine: 2, role: "ejemplo" }],
      cost: "bajo",
    });
    expect(h.pattern).toBe("Fake Pattern");
    expect(h.anchorFindingId).toBe("finding-123");
    expect(h.provisional).toBe(true);
    expect(h.ceiling).toBe("alta");
    expect(h.missingCapabilities).toEqual([]);
  });
});
