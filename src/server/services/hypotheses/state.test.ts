import { describe, expect, it } from "vitest";

import { deriveCapabilities } from "../detect/capabilities.js";
import { detector as repeatedSwitchDetector } from "../detect/intra-file/repeated-switch.js";
import { detector as enumeratedFieldDispatchDetector } from "../detect/intra-file/enumerated-field-dispatch.js";
import { detector as temporaryFieldDetector } from "../detect/intra-file/temporary-field.js";
import { detector as typeSwitchDetector } from "../detect/intra-function/type-switch.js";
import { fileUnitFrom, nodeSetsFor, parseRoot, testContext } from "../detect/testing.js";
import { pisoDeclarado, resolveThreshold } from "../detect/thresholds.js";
import type { Finding, FileUnit, RawFinding, RepoUnit } from "../detect/types.js";
import { EMPTY_NEIGHBORHOOD } from "../graph/neighborhood.js";
import { symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode } from "../graph/types.js";
import { hypothesis, startStateTrace, takeStateTrace } from "./state.js";
import type { HypothesisContext } from "./types.js";

/* ────────────────────────────────────────────────────────────────────────
 * Arnés — corre el detector ancla REAL (`repeated-switch`) sobre una fixture
 * real, para no inventar un `Finding` sintético en los tests que ejercitan la
 * forma completa (positivos, appliedState). Los negativos de `required`
 * (que no dependen de árbol) sí usan un `Finding` construido a mano, más
 * simple y suficiente para ejercitar sólo el texto del título.
 * ──────────────────────────────────────────────────────────────────────── */

function toFinding(raw: RawFinding, language: string): Finding {
  return { ...raw, id: "f-test", detectorId: "repeated-switch", kind: "repeated-switch", scope: "intra-file", language };
}

const FAKE_REPO: RepoUnit = { repoName: "r", files: [], functions: [], clones: [], graph: null };

function fakeThreshold() {
  return resolveThreshold(pisoDeclarado(1, { rationale: "test" }), { language: "x", sampleSize: () => 0, corpusP95: () => null });
}

function fakeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "f1",
    detectorId: "repeated-switch",
    kind: "repeated-switch",
    scope: "intra-file",
    language: "typescript",
    title: '"this.status" se decide con switch en 2 lugares distintos de este archivo',
    detail: "d",
    trigger: [{ label: "apariciones", value: 2, threshold: fakeThreshold() }],
    locations: [
      { file: "a.ts", startLine: 1, endLine: 5, symbol: "price", role: "primer switch sobre este discriminante" },
      { file: "a.ts", startLine: 10, endLine: 15, symbol: "icon", role: "repetición #1" },
    ],
    severity: 60,
    advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
    ...overrides,
  };
}

async function runRepeatedSwitch(wasm: string, probe: string, source: string, language: string) {
  const sets = await nodeSetsFor(wasm, probe);
  const probeRoot = await parseRoot(wasm, probe);
  const capabilities = deriveCapabilities(probeRoot, sets);
  const root = await parseRoot(wasm, source);
  const file = fileUnitFrom(root, sets, language);
  const raw = repeatedSwitchDetector.run(file, testContext(repeatedSwitchDetector, language));
  return { file, capabilities, findings: raw.map((r) => toFinding(r, language)) };
}

function ctxFor(file: ReturnType<typeof fileUnitFrom> | null, capabilities: ReadonlySet<string>): HypothesisContext {
  return {
    file,
    fileAt: () => null,
    repo: FAKE_REPO,
    capabilities: capabilities as HypothesisContext["capabilities"],
    setsFor: () => ({
      functionNodes: new Set(),
      branchNodes: new Set(),
      chainNodes: new Set(),
      cloneNodes: new Set(),
      classNodes: new Set(),
      nestingNodes: new Set(),
      constructorNodes: new Set(),
      exceptionNodes: new Set(),
      switchContainerNodes: new Set(),
    }),
    neighborhood: EMPTY_NEIGHBORHOOD,
    branches: () => null,
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * Sondas
 * ──────────────────────────────────────────────────────────────────────── */

const TS_PROBE = `
class Probe {
  status: string;
  handler: Probe;
  describe(kind: string): string {
    switch (kind) {
      case "circle":
        return "circle";
      default:
        return "unknown";
    }
  }
}
`;

const RUBY_PROBE = `
class Probe
  def describe(kind)
    case kind
    when :circle
      "circle"
    else
      "unknown"
    end
  end
end
`;

describe("state — required (texto puro, SIN árbol — funciona incluso con ctx.file null)", () => {
  it("discriminante sin forma de campo propio (parámetro suelto) ⇒ null (candidato a Strategy, no State)", () => {
    const finding = fakeFinding({ title: '"kind" se decide con switch en 2 lugares distintos de este archivo' });
    const ctx = ctxFor(null, new Set());
    expect(hypothesis.build(finding, null, ctx)).toBeNull();
  });

  it("un solo método distinto (símbolo repetido) ⇒ null — no hay 'conditionals in every method'", () => {
    const finding = fakeFinding({
      locations: [
        { file: "a.ts", startLine: 1, endLine: 5, symbol: "price", role: "primer switch sobre este discriminante" },
        { file: "a.ts", startLine: 20, endLine: 25, symbol: "price", role: "repetición #1" },
      ],
    });
    const ctx = ctxFor(null, new Set());
    expect(hypothesis.build(finding, null, ctx)).toBeNull();
  });

  it("self./this./@ confirmado + ≥2 métodos, SIN árbol vivo (ctx.file null, como en crossAnalyze hoy) ⇒ SÍ produce hipótesis, estado ausente, confianza baja", () => {
    const finding = fakeFinding();
    const ctx = ctxFor(null, new Set());
    const h = hypothesis.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    expect(h!.confidence).toBe("baja");
    expect(h!.missingCapabilities).toEqual([]);
    expect(h!.anchorFindingId).toBe("f1");
  });
});

describe("state — sobre árbol real (TypeScript)", () => {
  it("campo propio tipado PRIMITIVO, sin reasignación, ramas<3 en ambas ⇒ ausente, confianza baja, excluder confirma primitivo", async () => {
    const source = `
class Order {
  status: string;
  price(): number {
    switch (this.status) {
      case "pending": return 1;
      default: return 0;
    }
  }
  icon(): string {
    switch (this.status) {
      case "pending": return "p";
      default: return "?";
    }
  }
}
`;
    const { file, capabilities, findings } = await runRepeatedSwitch("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript");
    expect(findings).toHaveLength(1);
    const ctx = ctxFor(file, capabilities);
    const h = hypothesis.build(findings[0]!, null, ctx)!;
    expect(h.state).toBe("ausente");
    expect(h.confidence).toBe("baja");
    const applied = h.checks.find((c) => c.role === "applied")!;
    expect(applied.passed).toBe(false);
    expect(applied.why).toMatch(/tipo primitivo/);
  });

  it("con reasignación en otro método Y ≥3 ramas ⇒ ambos discriminadores confirmados, confianza tope 'media' (el ceiling la limita, no llega a 'alta')", async () => {
    const source = `
class Order {
  status: string;
  advance(): void {
    this.status = "shipped";
  }
  price(): number {
    switch (this.status) {
      case "pending": return 1;
      case "shipped": return 2;
      case "cancelled": return 3;
      default: return 0;
    }
  }
  icon(): string {
    switch (this.status) {
      case "pending": return "p";
      case "shipped": return "s";
      case "cancelled": return "c";
      default: return "?";
    }
  }
}
`;
    const { file, capabilities, findings } = await runRepeatedSwitch("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript");
    expect(findings).toHaveLength(1);
    const ctx = ctxFor(file, capabilities);
    const h = hypothesis.build(findings[0]!, null, ctx)!;
    expect(h.confidence).toBe("media");
    const transition = h.discriminators.find((d) => d.label.includes("REASIGNA"))!;
    expect(transition.passed).toBe(true);
    const branches = h.discriminators.find((d) => d.label.includes("ramas"))!;
    expect(branches.passed).toBe(true);
  });

  /**
   * Ola U (N3) — bug verificado: "el campo tiene un tipo con nombre propio"
   * NO es lo mismo que "la abstracción polimórfica de State ya existe". Un
   * `enum` es, estructuralmente, un tipo con nombre (mismo criterio que
   * `code-grammar.ts#isClassLike`: body+name, sin parámetros) pero es
   * EXACTAMENTE el dato plano que el patrón reemplaza. Caso real:
   * `newtonsoft-json/Src/Newtonsoft.Json/JsonReader.cs:46,118` — `enum State`
   * + `internal State _currentState;`, testeado por switch en 10 sitios de
   * `JsonTextReader.cs`. Las tres pruebas de abajo cubren, en orden: (a) el
   * caso REAL de producción hoy para esta ancla intra-file (sin grafo — ver
   * el docstring del módulo, "LÍMITE DE CABLEADO"), donde antes del arreglo
   * "tipo no primitivo" ALCANZABA para declarar aplicado-eludido; (b) que la
   * distinción SÍ funciona cuando hay grafo y el tipo es una abstracción
   * real (≥2 subtipos); (c) el bug puntual — con grafo, pero el tipo resuelve
   * a un enum (cero subtipos) — reproduciendo la forma exacta de
   * `JsonReader._currentState` de manera aislada, ya que el caso real del
   * corpus queda además bloqueado por `selfPrefixCheck` (`_currentState` sin
   * `this.`, ver el informe de esta tarea).
   */
  it("campo propio tipado con un tipo con NOMBRE PROPIO, SIN grafo (el caso real de producción para esta ancla intra-file) ⇒ nunca se afirma aplicado-eludido sin evidencia de abstracción real — ausente", async () => {
    const source = `
class Order {
  handler: Probe;
  price(): number {
    switch (this.handler) {
      case "pending": return 1;
      default: return 0;
    }
  }
  icon(): string {
    switch (this.handler) {
      case "pending": return "p";
      default: return "?";
    }
  }
}
`;
    const { file, capabilities, findings } = await runRepeatedSwitch("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript");
    expect(findings).toHaveLength(1);
    const ctx = ctxFor(file, capabilities);
    const h = hypothesis.build(findings[0]!, null, ctx)!;
    expect(h.state).toBe("ausente");
    expect(h.confidence).toBe("baja");
    const applied = h.checks.find((c) => c.role === "applied" && c.label === "estado-ya-modelado-con-tipo")!;
    expect(applied.passed).toBe(false);
    expect(applied.why).toMatch(/sin grafo/);
  });

  it("mismo campo, CON grafo real que resuelve \"Probe\" a una clase con ≥2 subtipos reales (extends/implements) ⇒ SÍ es abstracción real: aplicado-eludido, confidence null", async () => {
    const source = `
class Order {
  handler: Probe;
  price(): number {
    switch (this.handler) {
      case "pending": return 1;
      default: return 0;
    }
  }
  icon(): string {
    switch (this.handler) {
      case "pending": return "p";
      default: return "?";
    }
  }
}
`;
    const { file, capabilities, findings } = await runRepeatedSwitch("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript");
    expect(findings).toHaveLength(1);
    const FILE = findings[0]!.locations[0]!.file;
    const probeId = symbolNodeId(FILE, ["Probe"]);
    const subAId = symbolNodeId(FILE, ["SubA"]);
    const subBId = symbolNodeId(FILE, ["SubB"]);
    const graph: CodeGraph = {
      nodes: [
        { id: probeId, kind: "symbol", file: FILE, symbolPath: ["Probe"], family: "class-like" },
        { id: subAId, kind: "symbol", file: FILE, symbolPath: ["SubA"], family: "class-like" },
        { id: subBId, kind: "symbol", file: FILE, symbolPath: ["SubB"], family: "class-like" },
      ],
      edges: [
        { from: subAId, to: probeId, kind: "implements", provenance: "declared", weight: 1 },
        { from: subBId, to: probeId, kind: "implements", provenance: "declared", weight: 1 },
      ],
      resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
    };
    const ctx = ctxFor(file, capabilities);
    const h = hypothesis.build(findings[0]!, graph, ctx)!;
    expect(h.state).toBe("aplicado-eludido");
    expect(h.confidence).toBeNull();
    const applied = h.checks.find((c) => c.role === "applied" && c.label === "estado-ya-modelado-con-tipo")!;
    expect(applied.passed).toBe(true);
    expect(applied.why).toMatch(/subtipos reales/);
  });

  it("BUG DE ESTA OLA (verificado, newtonsoft-json JsonReader._currentState): un campo tipado con un ENUM (dato plano, cero subtipos) NO debe leerse como abstracción ya aplicada — sigue ausente aunque el grafo SÍ resuelva el nombre a un nodo class-like", async () => {
    const source = `
enum State { Pending, Done }
class Order {
  handler: State;
  price(): number {
    switch (this.handler) {
      case "pending": return 1;
      default: return 0;
    }
  }
  icon(): string {
    switch (this.handler) {
      case "pending": return "p";
      default: return "?";
    }
  }
}
`;
    const { file, capabilities, findings } = await runRepeatedSwitch("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript");
    expect(findings).toHaveLength(1);
    const FILE = findings[0]!.locations[0]!.file;
    // `enum State {...}` es, ESTRUCTURALMENTE, class-like para este grafo
    // (mismo criterio que `code-grammar.ts#isClassLike`: body+name, sin
    // parámetros) — pero NADA lo extiende/implementa: cero subtipos.
    const stateId = symbolNodeId(FILE, ["State"]);
    const graph: CodeGraph = {
      nodes: [{ id: stateId, kind: "symbol", file: FILE, symbolPath: ["State"], family: "class-like" }],
      edges: [],
      resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
    };
    const ctx = ctxFor(file, capabilities);
    const h = hypothesis.build(findings[0]!, graph, ctx)!;
    expect(h.state).toBe("ausente");
    const applied = h.checks.find((c) => c.role === "applied" && c.label === "estado-ya-modelado-con-tipo")!;
    expect(applied.passed).toBe(false);
    expect(applied.why).toMatch(/enum/);
  });
});

describe("state — Ruby (@campo, sin tipos-explicitos)", () => {
  it("`@status` repetido en 2 métodos ⇒ hipótesis SÍ se dispara (self-prefix por texto, sin necesitar clases con tipos); excluder queda ausente por falta de capacidad, no por falta de evidencia positiva", async () => {
    const source = `
class Order
  def price
    case @status
    when :pending
      1
    else
      0
    end
  end

  def icon
    case @status
    when :pending
      "p"
    else
      "?"
    end
  end
end
`;
    const { file, capabilities, findings } = await runRepeatedSwitch("tree-sitter-ruby.wasm", RUBY_PROBE, source, "ruby");
    expect(findings).toHaveLength(1);
    expect(capabilities.has("tipos-explicitos")).toBe(false);
    const ctx = ctxFor(file, capabilities);
    const h = hypothesis.build(findings[0]!, null, ctx)!;
    expect(h).not.toBeNull();
    expect(h.state).toBe("ausente");
    const applied = h.checks.find((c) => c.role === "applied")!;
    expect(applied.why).toMatch(/tipos explícitos/);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * Receptor propio IMPLÍCITO en Ruby (sin `@`/`self.`), vía grafo de
 * referencias — caso real medido: `"hookable_type"` en
 * `app/models/hookable.rb` (Visability/Backend), 3 ubicaciones, donde
 * `selfPrefixCheck` por texto puro rechazaba las 5 `repeated-switch` reales
 * del repo. Fixtures acá son una reducción fiel de esa forma, no inventada.
 * ──────────────────────────────────────────────────────────────────────── */
describe("state — Ruby, receptor propio IMPLÍCITO (sin @/self., vía grafo de referencias)", () => {
  it("discriminante sin prefijo, leído bare y SIN sombra local en 2 métodos, Y REASIGNADO en el archivo ⇒ el grafo de referencias lo confirma como campo propio Y hay evidencia de transición: hipótesis SÍ se dispara", async () => {
    const source = `
class Hookable
  def type_specific_json
    case hookable_type
    when "Forms::Question"
      1
    else
      0
    end
  end

  def target_label
    case hookable_type
    when "Forms::Form"
      1
    else
      0
    end
  end

  def promote!
    hookable_type = "Forms::Promoted"
  end
end
`;
    const { file, capabilities, findings } = await runRepeatedSwitch("tree-sitter-ruby.wasm", RUBY_PROBE, source, "ruby");
    expect(findings).toHaveLength(1);
    const ctx = ctxFor(file, capabilities);
    const h = hypothesis.build(findings[0]!, null, ctx);
    expect(h).not.toBeNull();
    const required = h!.checks.find((c) => c.role === "required" && c.label.includes("propia unidad"))!;
    expect(required.passed).toBe(true);
    expect(required.why).toMatch(/despacho implícito a self/);
    const transitionGate = h!.checks.find((c) => c.role === "required" && c.label.includes("despacho implícito de Ruby"))!;
    expect(transitionGate.passed).toBe(true);
  });

  it("OLA V (V4) — MISMA forma exacta, SIN ninguna reasignación de \"hookable_type\" en el archivo (el caso real medido: un accesor de asociación polimórfica de Rails, nunca reasignado en este archivo) ⇒ ahora null: indistinguible de un accesor de configuración fijo (Strategy), no un campo que transiciona (State)", async () => {
    const source = `
class Hookable
  def type_specific_json
    case hookable_type
    when "Forms::Question"
      1
    else
      0
    end
  end

  def target_label
    case hookable_type
    when "Forms::Form"
      1
    else
      0
    end
  end
end
`;
    const { file, capabilities, findings } = await runRepeatedSwitch("tree-sitter-ruby.wasm", RUBY_PROBE, source, "ruby");
    expect(findings).toHaveLength(1);
    const ctx = ctxFor(file, capabilities);
    const h = hypothesis.build(findings[0]!, null, ctx);
    expect(h).toBeNull();
  });

  it("discriminante sin prefijo, pero SOMBREADO por un parámetro homónimo en TODOS los métodos (mismo patrón que \"obj\" en migrate_chain_tokens.rake) ⇒ sigue null — el arreglo no infla falsos positivos", async () => {
    const source = `
class Converter
  def config_has_chain_tokens?(obj)
    case obj
    when String
      1
    else
      0
    end
  end

  def migrate_config_tokens(obj)
    case obj
    when String
      1
    else
      0
    end
  end
end
`;
    const { file, capabilities, findings } = await runRepeatedSwitch("tree-sitter-ruby.wasm", RUBY_PROBE, source, "ruby");
    expect(findings).toHaveLength(1);
    const ctx = ctxFor(file, capabilities);
    expect(hypothesis.build(findings[0]!, null, ctx)).toBeNull();
  });

  it("3 ubicaciones, UNA sombreada por un parámetro keyword homónimo (forma EXACTA de index_metadata en hookable.rb), DOS bare sin sombra, Y REASIGNADO en el archivo ⇒ SÍ se dispara: basta con que UNA ubicación confirme campo propio, y hay evidencia de transición", async () => {
    const source = `
class Hookable
  def initialize(hookable_type: "Forms::QuestionType")
    case hookable_type
    when "Forms::Form"
      @x = 1
    else
      @x = 0
    end
  end

  def type_specific_json
    case hookable_type
    when "Forms::Question"
      1
    else
      0
    end
  end

  def target_label
    case hookable_type
    when "Forms::Form"
      1
    else
      0
    end
  end

  def promote!
    hookable_type = "Forms::Promoted"
  end
end
`;
    const { file, capabilities, findings } = await runRepeatedSwitch("tree-sitter-ruby.wasm", RUBY_PROBE, source, "ruby");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(3);
    const ctx = ctxFor(file, capabilities);
    const h = hypothesis.build(findings[0]!, null, ctx);
    expect(h).not.toBeNull();
    const required = h!.checks.find((c) => c.role === "required" && c.label.includes("propia unidad"))!;
    expect(required.passed).toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * Excluder ESTRUCTURAL (Ola 10) — grafos SINTÉTICOS, mismo estilo que
 * `wrapping-chain.test.ts`/`builder.test.ts` (un `CodeGraph` mínimo por
 * escenario, sin pasar por `analyzeRepo`). `ctx.file` queda `null` en TODOS
 * estos tests (los `required` de arriba no lo necesitan, ver `notStateCheck`
 * de `state.ts`/`selfPrefixCheck`) — lo único que varía acá es el SEGUNDO
 * argumento de `build()`, el grafo.
 * ──────────────────────────────────────────────────────────────────────── */
describe("state — excluder ESTRUCTURAL nuevo (grafo, Ola 10)", () => {
  const FILE = "a.ts";
  const EMPTY_RESOLUTION = { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] };

  function gSym(symbolPath: readonly string[], overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
    return { id: symbolNodeId(FILE, symbolPath), kind: "symbol", file: FILE, symbolPath, family: "class-like", ...overrides };
  }
  function gMethod(classPath: string, name: string, arity: number): CodeGraphNode {
    return gSym([classPath, name], { family: "function-like", arity });
  }
  function gEdge(from: string, to: string, kind: CodeGraphEdge["kind"]): CodeGraphEdge {
    return { from, to, kind, provenance: "resolved", weight: 1 };
  }
  function gContains(ownerId: string, memberIds: readonly string[]): CodeGraphEdge[] {
    return memberIds.map((m) => gEdge(ownerId, m, "contains"));
  }

  /** Mismo Finding ancla en los tres escenarios: sólo cambia el grafo. */
  function machineFinding(): Finding {
    return fakeFinding({
      title: '"this.state" se decide con switch en 2 lugares distintos de este archivo',
      locations: [
        { file: FILE, startLine: 1, endLine: 5, symbol: "advance", role: "primer switch sobre este discriminante" },
        { file: FILE, startLine: 10, endLine: 15, symbol: "forceState", role: "repetición #1" },
      ],
    });
  }

  it("máquina COMPLETA (interfaz nominal común + transición estado→estado) ⇒ aplicado-eludido, NUNCA ya-aplicado — mismo corolario que el excluder viejo, ahora con evidencia de grafo", () => {
    const iface = gSym(["LightState"], { family: "namespace-like" });
    const traffic = gSym(["TrafficLight"]);
    const advance = gMethod("TrafficLight", "advance", 0);
    const forceState = gMethod("TrafficLight", "forceState", 1);
    const red = gSym(["RedState"]);
    const redNext = gMethod("RedState", "next", 0);
    const green = gSym(["GreenState"]);
    const greenNext = gMethod("GreenState", "next", 0);

    const graph: CodeGraph = {
      nodes: [iface, traffic, advance, forceState, red, redNext, green, greenNext],
      edges: [
        ...gContains(traffic.id, [advance.id, forceState.id]),
        ...gContains(red.id, [redNext.id]),
        ...gContains(green.id, [greenNext.id]),
        gEdge(red.id, iface.id, "implements"),
        gEdge(green.id, iface.id, "implements"),
        gEdge(advance.id, red.id, "instantiates"), // el contexto construye el estado inicial
        gEdge(redNext.id, green.id, "instantiates"), // la transición pasa DENTRO de los estados — ver docstring
      ],
      resolution: EMPTY_RESOLUTION,
    };

    const ctx = ctxFor(null, new Set());
    const h = hypothesis.build(machineFinding(), graph, ctx)!;
    expect(h).not.toBeNull();
    expect(h.state).toBe("aplicado-eludido");
    expect(h.confidence).toBeNull();
    const applied = h.checks.find((c) => c.role === "applied")!;
    expect(applied.why).toMatch(/YA EXISTE/);
    expect(applied.why).toMatch(/LightState/);
  });

  it("familia SIN interfaz nominal (duck typing: mismo miembro, sin implements/satisfies) ⇒ parcial, SÍ sugiere — la forma PARCIAL exacta del encargo", () => {
    const traffic = gSym(["TrafficLight"]);
    const advance = gMethod("TrafficLight", "advance", 0);
    const forceState = gMethod("TrafficLight", "forceState", 1);
    const red = gSym(["RedState"]);
    const redNext = gMethod("RedState", "next", 0);
    const green = gSym(["GreenState"]);
    const greenNext = gMethod("GreenState", "next", 0);

    const graph: CodeGraph = {
      nodes: [traffic, advance, forceState, red, redNext, green, greenNext],
      edges: [
        ...gContains(traffic.id, [advance.id, forceState.id]),
        ...gContains(red.id, [redNext.id]),
        ...gContains(green.id, [greenNext.id]),
        // sin implements/satisfies: RedState/GreenState comparten "next" sólo por convención (duck typing).
        gEdge(advance.id, red.id, "instantiates"),
        gEdge(redNext.id, green.id, "instantiates"),
      ],
      resolution: EMPTY_RESOLUTION,
    };

    const ctx = ctxFor(null, new Set());
    const h = hypothesis.build(machineFinding(), graph, ctx)!;
    expect(h).not.toBeNull();
    expect(h.state).toBe("parcial");
    expect(h.confidence).not.toBeNull();
    const applied = h.checks.find((c) => c.role === "applied")!;
    expect(applied.why).toMatch(/sin protocolo compartido/);
  });

  it("grafo real pero SIN ninguna máquina alrededor del contexto ⇒ cae al excluder viejo (tipo del campo), con la señal estructural agregada como evidencia auditable", () => {
    const traffic = gSym(["TrafficLight"]);
    const advance = gMethod("TrafficLight", "advance", 0);
    const forceState = gMethod("TrafficLight", "forceState", 1);

    const graph: CodeGraph = {
      nodes: [traffic, advance, forceState],
      edges: [...gContains(traffic.id, [advance.id, forceState.id])],
      resolution: EMPTY_RESOLUTION,
    };

    const ctx = ctxFor(null, new Set());
    const h = hypothesis.build(machineFinding(), graph, ctx)!;
    expect(h).not.toBeNull();
    expect(h.state).toBe("ausente"); // legacy: sin ctx.file tampoco pudo confirmar el tipo — ver PASO 1 de este archivo
    const structural = h.checks.find((c) => c.role === "applied" && c.why.includes("máquina de estados ya construida"));
    expect(structural).toBeDefined();
  });

  it("grafo === null (el caso real de producción hoy: ancla intra-file, repo.graph siempre null en analyzeFile) ⇒ mismo comportamiento que antes de esta ola", () => {
    const h = hypothesis.build(machineFinding(), null, ctxFor(null, new Set()))!;
    expect(h.state).toBe("ausente");
    const applied = h.checks.find((c) => c.role === "applied")!;
    expect(applied.why).toMatch(/árbol no disponible/); // primer check applied (legacy) — el estructural queda agregado detrás
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * Ola W2 — SEGUNDA ANCLA (`conditional-chain`) + el bug de 3 olas cerrado
 * (`declaredMemberSelf`, `this` implícito de C#/Java/Go). A diferencia de
 * `runRepeatedSwitch` (corre el detector REAL), acá el `Finding` se arma a
 * mano — `conditional-chain.ts` no deriva su métrica caminando el árbol
 * (lee `fn.metrics.chain`, calculado aparte por `code-analyzer.ts`, ver el
 * docstring de ese detector), así que el harness de fixtures no lo puede
 * ejercitar sin inventar métricas — mismo patrón que
 * `conditional-chain.test.ts` ya usa (`runIntraFunction` con `metrics`
 * inyectadas). Lo que SÍ hace falta real acá es el ÁRBOL VIVO (`ctx.file`) y
 * los `sets` REALES (`ctx.setsFor`), que es lo que `buildConditionalChainProblem`
 * consume — se arman con el mismo `nodeSetsFor`/`parseRoot` que el resto del
 * archivo, nunca simulados.
 * ──────────────────────────────────────────────────────────────────────── */
describe("state — SEGUNDA ANCLA conditional-chain (Ola W2)", () => {
  async function parseFile(wasm: string, probe: string, source: string, language: string) {
    const sets = await nodeSetsFor(wasm, probe);
    const probeRoot = await parseRoot(wasm, probe);
    const capabilities = deriveCapabilities(probeRoot, sets);
    const root = await parseRoot(wasm, source);
    const file = fileUnitFrom(root, sets, language);
    return { file, sets, capabilities };
  }

  function ctxWithRealSets(file: FileUnit, sets: ReturnType<typeof fileUnitFrom>["sets"], capabilities: ReadonlySet<string>): HypothesisContext {
    return {
      file,
      fileAt: () => null,
      repo: FAKE_REPO,
      capabilities: capabilities as HypothesisContext["capabilities"],
      setsFor: () => sets,
      neighborhood: EMPTY_NEIGHBORHOOD,
      branches: () => null,
    };
  }

  /** El `Finding` que `conditional-chain.ts#buildConditionalChainFinding` produciría — mismos campos, mismo `role`, armado a mano porque el detector real necesita `fn.metrics` inyectadas (ver docstring de arriba). */
  function conditionalChainFinding(file: FileUnit, fnName: string, chainCount: number, variant: "ladder" | "instantiates" = "ladder"): Finding {
    const fn = file.functions.find((f) => f.name === fnName);
    if (!fn) throw new Error(`función "${fnName}" no encontrada en la fixture`);
    return {
      id: "f-cc",
      detectorId: "conditional-chain",
      kind: "conditional-chain",
      scope: "intra-function",
      language: file.language,
      variant,
      title: variant === "instantiates" ? `${fnName} elige qué clase instanciar entre ${chainCount} ramas` : `Cadena de ${chainCount} condiciones en ${fnName}`,
      detail: "d",
      trigger: [{ label: variant === "instantiates" ? "tipos construidos" : "ramas encadenadas", value: chainCount, threshold: fakeThreshold() }],
      locations: [{ file: fn.file, startLine: fn.startLine, endLine: fn.endLine, symbol: fn.name ?? undefined, role: variant === "instantiates" ? "selector de tipo a instanciar" : "cadena larga de condicionales" }],
      severity: 60,
      advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
    };
  }

  const TS_PROBE_CC = `
class Probe {
  status: string;
  describe(kind: string): string {
    if (kind === "circle") {
      return "circle";
    } else {
      return "unknown";
    }
  }
}
`;

  it("TypeScript: MISMO discriminante (this.status) decidido por if/else en 2 métodos de la MISMA clase ⇒ el ancla conditional-chain SÍ produce hipótesis — repeated-switch no lo alcanzaba (0 hipótesis en 13 repos, Ola V)", async () => {
    const source = `
class Order {
  status: string;
  price(): number {
    if (this.status === "pending") { return 1; } else { return 0; }
  }
  icon(): string {
    if (this.status === "shipped") { return 2; } else { return 0; }
  }
}
`;
    const { file, sets, capabilities } = await parseFile("tree-sitter-typescript.wasm", TS_PROBE_CC, source, "typescript");
    const finding = conditionalChainFinding(file, "price", 5);
    const ctx = ctxWithRealSets(file, sets, capabilities);
    const h = hypothesis.build(finding, null, ctx);
    expect(h).not.toBeNull();

    const selfCheck = h!.checks.find((c) => c.role === "required" && c.label.includes("propia unidad"))!;
    expect(selfCheck.passed).toBe(true);
    expect(selfCheck.why).toContain('"status"');

    const methodCheck = h!.checks.find((c) => c.role === "required" && c.label.includes("2+ métodos"))!;
    expect(methodCheck.passed).toBe(true);
    expect(methodCheck.why).toContain("2 método(s)");

    // Ancla nueva, sin tipo abstracto detrás de "status" (string primitivo): ausente, no aplicado-eludido.
    expect(h!.state).toBe("ausente");
  });

  it("TypeScript: MISMO discriminante pero SÓLO en UN método (sin repetición cruzada real) ⇒ null — conditional-chain no agrupa ocurrencias como repeated-switch, así que sin evidencia de un SEGUNDO miembro el patrón no dispara", async () => {
    const source = `
class Order {
  status: string;
  price(): number {
    if (this.status === "pending") { return 1; } else { return 0; }
  }
  unrelated(): number {
    return 42;
  }
}
`;
    const { file, sets, capabilities } = await parseFile("tree-sitter-typescript.wasm", TS_PROBE_CC, source, "typescript");
    const finding = conditionalChainFinding(file, "price", 5);
    const ctx = ctxWithRealSets(file, sets, capabilities);
    expect(hypothesis.build(finding, null, ctx)).toBeNull();
  });

  it("variant='instantiates' (selección de tipo a instanciar, el territorio de Factory Method) ⇒ null, aunque el discriminante SÍ sea un campo propio repetido — notTypeSelectionCheck excluye", async () => {
    const source = `
class Order {
  status: string;
  build(): Handler {
    if (this.status === "pending") { return new PendingHandler(); } else { return new DoneHandler(); }
  }
  rebuild(): Handler {
    if (this.status === "shipped") { return new PendingHandler(); } else { return new DoneHandler(); }
  }
}
`;
    const { file, sets, capabilities } = await parseFile("tree-sitter-typescript.wasm", TS_PROBE_CC, source, "typescript");
    const finding = conditionalChainFinding(file, "build", 5, "instantiates");
    const ctx = ctxWithRealSets(file, sets, capabilities);
    expect(hypothesis.build(finding, null, ctx)).toBeNull();
  });

  /* ── EL BUG DE 3 OLAS: `declaredMemberSelf`, `this` implícito de C#/Java/Go ──
   * Caso citado sin dueño desde la Ola U en PLAN-INTENCIONES.md, re-confirmado
   * en la Ola V: `newtonsoft-json/.../JsonReader.cs:118`, `internal State
   * _currentState;`, testeado por switch/if SIN `this.` — nunca pasaba
   * `selfPrefixCheck`. Reducción fiel de esa forma, en C# real (parseado, no
   * simulado).
   * ──────────────────────────────────────────────────────────────────────── */
  const CSHARP_PROBE_CC = `
class Probe {
  string status;
  string Describe(string kind) {
    if (kind == "circle") {
      return "circle";
    } else {
      return "unknown";
    }
  }
}
`;

  it("C# — EL BUG DE 3 OLAS: identificador DESNUDO (_currentState, sin this.) declarado como campo del tipo, decidido por if en 2 métodos, Y reasignado en el archivo ⇒ selfPrefixCheck lo reconoce como campo propio (this implícito) — el caso canónico del patrón YA NO se pierde", async () => {
    const source = `
class JsonReader {
  internal State _currentState;
  int Price() {
    if (_currentState == State.Pending) { return 1; } else { return 0; }
  }
  string Icon() {
    if (_currentState == State.Pending) { return "p"; } else { return "?"; }
  }
  void Advance() {
    _currentState = State.Done;
  }
}
`;
    const { file, sets, capabilities } = await parseFile("tree-sitter-c_sharp.wasm", CSHARP_PROBE_CC, source, "csharp");
    const finding = conditionalChainFinding(file, "Price", 5);
    const ctx = ctxWithRealSets(file, sets, capabilities);
    const h = hypothesis.build(finding, null, ctx);
    expect(h).not.toBeNull();

    const selfCheck = h!.checks.find((c) => c.role === "required" && c.label.includes("propia unidad"))!;
    expect(selfCheck.passed).toBe(true);
    expect(selfCheck.why).toMatch(/DECLARADO como miembro/);

    const transitionGate = h!.checks.find((c) => c.role === "required" && c.label.includes("this-implícito"))!;
    expect(transitionGate.passed).toBe(true);
  });

  it("C# — MISMA forma exacta pero SIN ninguna reasignación de `_currentState` en el archivo ⇒ null: indistinguible de un accessor de sólo lectura (mismo riesgo, mismo remedio que Ruby)", async () => {
    const source = `
class JsonReader {
  internal State _currentState;
  int Price() {
    if (_currentState == State.Pending) { return 1; } else { return 0; }
  }
  string Icon() {
    if (_currentState == State.Pending) { return "p"; } else { return "?"; }
  }
}
`;
    const { file, sets, capabilities } = await parseFile("tree-sitter-c_sharp.wasm", CSHARP_PROBE_CC, source, "csharp");
    const finding = conditionalChainFinding(file, "Price", 5);
    const ctx = ctxWithRealSets(file, sets, capabilities);
    expect(hypothesis.build(finding, null, ctx)).toBeNull();
  });

  // Probe con un switch REAL (no un if): `deriveNodeSets` clasifica
  // `switchContainerNodes` a partir de lo que la SONDA ejercita — sin un
  // `switch` de verdad en la sonda, el detector `repeated-switch` no ve
  // ninguno en la fuente (medido armando esta prueba: `CSHARP_PROBE_CC`, que
  // sólo tiene un `if`, deja `findings` vacío). Mismo `CSHARP_PROBE` que
  // `repeated-switch.test.ts` ya usa.
  const CSHARP_PROBE_SWITCH = `
class Shape {
  string Describe(string kind) {
    switch (kind) {
      case "circle":
        return "circle";
      default:
        return "unknown";
    }
  }
}
`;

  it("C# — BUG MEDIDO CORRIGIENDO ESTA OLA (newtonsoft-json/.../JValue.cs:611 GetValueType): un PARÁMETRO homónimo de una propiedad real de la clase NO cuenta como campo propio — un parámetro SIEMPRE sombrea, sea el método estático o no", async () => {
    const source = `
class Box {
  object status;
  public object Value
  {
    get => status;
    set { status = value; }
  }
  static string Classify(object current, object value) {
    if (value == null) {
      return "a";
    } else if (value is int) {
      return "b";
    } else if (value is string) {
      return "c";
    } else if (value is double) {
      return "d";
    } else if (value is bool) {
      return "e";
    } else {
      return "f";
    }
  }
  static string ClassifyOther(object current, object value) {
    if (value == null) {
      return "a";
    } else {
      return "z";
    }
  }
}
`;
    const { file, sets, capabilities } = await parseFile("tree-sitter-c_sharp.wasm", CSHARP_PROBE_CC, source, "csharp");
    const finding = conditionalChainFinding(file, "Classify", 5);
    const ctx = ctxWithRealSets(file, sets, capabilities);
    // `value` HOMONIMIZA la propiedad `Value`, pero es el PROPIO parámetro de
    // `Classify` (método estático, sin `this`) — nunca alcanza el miembro:
    // el patrón no debe confirmarse por esta vía.
    expect(hypothesis.build(finding, null, ctx)).toBeNull();
  });

  it("C# — sobre el ancla ORIGINAL repeated-switch: el MISMO bug, cerrado ahí también (switch, no if) — verifica que el arreglo no quedó sólo del lado de conditional-chain", async () => {
    const source = `
class JsonReader {
  internal State _currentState;
  int Price() {
    switch (_currentState) {
      case Pending: return 1;
      default: return 0;
    }
  }
  string Icon() {
    switch (_currentState) {
      case Pending: return "p";
      default: return "?";
    }
  }
  void Advance() {
    _currentState = State.Done;
  }
}
`;
    const { file, capabilities, findings } = await runRepeatedSwitch("tree-sitter-c_sharp.wasm", CSHARP_PROBE_SWITCH, source, "csharp");
    expect(findings).toHaveLength(1);
    const ctx = ctxFor(file, capabilities);
    const h = hypothesis.build(findings[0]!, null, ctx);
    expect(h).not.toBeNull();
    const selfCheck = h!.checks.find((c) => c.role === "required" && c.label.includes("propia unidad"))!;
    expect(selfCheck.passed).toBe(true);
    expect(selfCheck.why).toMatch(/DECLARADO como miembro/);
  });

  /* ── OLA X (B6) — TERCERA forma: `capturedViaOwnGetter`, el PIDO de 3 olas ──
   * Caso citado en `PLAN-INTENCIONES.md`/`COBERTURA-NIVEL-2.md §5` desde W1,
   * sin dueño hasta acá: `guava/.../AbstractService.java:264`/`:463`,
   * `State previous = state(); switch (previous) { ... }` — el discriminante
   * es una VARIABLE LOCAL capturada de un getter propio, no un campo. Reducción
   * fiel de esa forma, en Java real (parseado, no simulado).
   * ──────────────────────────────────────────────────────────────────────── */
  const JAVA_PROBE_SWITCH = `
class Shape {
  String describe(String kind) {
    switch (kind) {
      case "circle":
        return "circle";
      default:
        return "unknown";
    }
  }
}
`;

  it("Java — EL PIDO DE 3 OLAS CERRADO: discriminante = variable LOCAL capturada de un getter propio ([this.]state(), \"state\" declarado como miembro), decidida por switch en 2 métodos ⇒ selfPrefixCheck la reconoce como campo/estado propio, sin exigir transición extra (ver docstring)", async () => {
    const source = `
class AbstractService {
  private State snapshot;

  State state() {
    return snapshot;
  }

  void stopAsync() {
    State previous = state();
    switch (previous) {
      case NEW:
        snapshot = State.STOPPING;
        break;
      case STARTING:
        snapshot = State.STOPPING;
        break;
      case RUNNING:
        snapshot = State.STOPPING;
        break;
      default:
        snapshot = State.FAILED;
        break;
    }
  }

  void triggerShutdown() {
    State previous = state();
    switch (previous) {
      case NEW:
        return;
      case STARTING:
        return;
      default:
        return;
    }
  }
}
`;
    const { file, sets, capabilities } = await parseFile("tree-sitter-java.wasm", JAVA_PROBE_SWITCH, source, "java");
    const finding = conditionalChainFinding(file, "stopAsync", 5);
    const ctx = ctxWithRealSets(file, sets, capabilities);
    const h = hypothesis.build(finding, null, ctx);
    expect(h).not.toBeNull();

    const selfCheck = h!.checks.find((c) => c.role === "required" && c.label.includes("propia unidad"))!;
    expect(selfCheck.passed).toBe(true);
    expect(selfCheck.why).toMatch(/es una variable LOCAL.*captura del estado propio/);

    const transitionGate = h!.checks.find((c) => c.role === "required" && c.label.includes("this-implícito"))!;
    expect(transitionGate.passed).toBe(true); // no aplica: capturedViaOwnGetter no entra en onlyWeakEvidence (declarado en el docstring).

    const methodCheck = h!.checks.find((c) => c.role === "required" && c.label.includes("2+ métodos"))!;
    expect(methodCheck.passed).toBe(true); // "previous" también decide el switch de triggerShutdown.

    expect(h!.state).toBe("ausente");
  });

  it("Java — la MISMA forma, pero \"state\" NO es un miembro real del tipo (una función de OTRO lado con el mismo nombre) ⇒ null: sin miembro real detrás del getter, no hay evidencia de captura propia", async () => {
    const source = `
class Unrelated {
  void run() {
    State previous = computeState();
    switch (previous) {
      case NEW:
        System.out.println("a");
        break;
      case STARTING:
        System.out.println("b");
        break;
      default:
        System.out.println("c");
        break;
    }
  }

  void again() {
    State previous = computeState();
    switch (previous) {
      case NEW:
        System.out.println("x");
        break;
      default:
        System.out.println("y");
        break;
    }
  }
}
`;
    const { file, sets, capabilities } = await parseFile("tree-sitter-java.wasm", JAVA_PROBE_SWITCH, source, "java");
    const finding = conditionalChainFinding(file, "run", 5);
    const ctx = ctxWithRealSets(file, sets, capabilities);
    // "computeState" no está declarado como miembro de "Unrelated" en ningún
    // lado (ni siquiera fuera de la clase, porque `declaresMemberNamed` sólo
    // mira DENTRO del tipo contenedor) — `localFromOwnGetter` no confirma.
    expect(hypothesis.build(finding, null, ctx)).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * Ola Y (Y2) — TERCERA ANCLA `temporary-field`. A diferencia de
 * `conditional-chain` (necesita `fn.metrics` inyectadas), `temporary-field`
 * es un detector `intra-file` COMPLETO: el arnés corre el detector REAL
 * (mismo criterio que `runRepeatedSwitch`, arriba) para los casos
 * POSITIVOS — sólo el negativo defensivo de "título no parsea" usa un
 * `Finding` sintético, porque `required` (texto puro) no depende de árbol.
 * ──────────────────────────────────────────────────────────────────────── */
describe("state — TERCERA ANCLA temporary-field (Ola Y, Y2)", () => {
  function toTemporaryFieldFinding(raw: RawFinding, language: string): Finding {
    return { ...raw, id: "f-tf", detectorId: "temporary-field", kind: "temporary-field", scope: "intra-file", language };
  }

  async function runTemporaryField(wasm: string, probe: string, source: string, language: string) {
    const sets = await nodeSetsFor(wasm, probe);
    const probeRoot = await parseRoot(wasm, probe);
    const capabilities = deriveCapabilities(probeRoot, sets);
    const root = await parseRoot(wasm, source);
    const file = fileUnitFrom(root, sets, language);
    const raw = temporaryFieldDetector.run(file, testContext(temporaryFieldDetector, language));
    return { file, capabilities, findings: raw.map((r) => toTemporaryFieldFinding(r, language)) };
  }

  const TS_PROBE_TF = `
class Probe {
  private seed: number = 0;
  constructor(seed: number) { this.seed = seed; }
  run(value: number): number { return value; }
}
`;

  const JAVA_PROBE_TF = `
class Probe {
  private int seed;
  Probe(int seed) { this.seed = seed; }
  int run(int value) { return value; }
}
`;

  it("TypeScript: EL CASO TESTIGO DEL CIERRE DE LA OLA X (guava/MultiInputStream.java:56, reducido) — campo que se LLENA en un método, se VACÍA en otro, y un tercer método lo LEE ⇒ hipótesis, ausente, self-field ya verificado por el propio detector-ancla (nunca re-derivado por texto/prefijo)", async () => {
    const source = `
class MultiInputStream {
  private in: any;
  advance(): void {
    this.in = new Source();
  }
  read(): number {
    if (this.in === null) { return -1; }
    return 1;
  }
  close(): void {
    this.in = null;
  }
  label(): string { return "multi"; }
  describe(): string { return "stream"; }
}
`;
    const { file, capabilities, findings } = await runTemporaryField("tree-sitter-typescript.wasm", TS_PROBE_TF, source, "typescript");
    expect(findings).toHaveLength(1);
    const ctx = ctxFor(file, capabilities);
    const h = hypothesis.build(findings[0]!, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    expect(h!.confidence).toBe("media");

    const selfCheck = h!.checks.find((c) => c.role === "required" && c.label.includes("propia unidad"))!;
    expect(selfCheck.passed).toBe(true);
    expect(selfCheck.why).toMatch(/verificado por AST por el detector-ancla \(temporary-field\)/);

    const methodCheck = h!.checks.find((c) => c.role === "required" && c.label.includes("2+ métodos"))!;
    expect(methodCheck.passed).toBe(true);
    expect(methodCheck.why).toContain("3 método(s)"); // advance + close (escritores) + read (lector)

    const branchesDisc = h!.discriminators.find((c) => c.label.includes("temporary-field"))!;
    expect(branchesDisc.passed).toBe(true);
    expect(branchesDisc.why).toContain("3 miembros distintos");
  });

  it("Java: MISMO idiom EXACTO que el caso testigo — identificador DESNUDO, sin \"this.\" (el idiom de Java/C# que tuvo ciego a selfPrefixCheck tres olas del lado de repeated-switch/conditional-chain) ⇒ el ancla nueva resuelve el campo propio igual, porque no re-deriva nada: el detector-ancla ya lo verificó", async () => {
    const source = `
class Session {
  private Object handle;
  void open() {
    handle = new Object();
  }
  int use() {
    if (handle == null) { return -1; }
    return 1;
  }
  void close() {
    handle = null;
  }
  String label() { return "s"; }
  String describe() { return "d"; }
}
`;
    const { file, capabilities, findings } = await runTemporaryField("tree-sitter-java.wasm", JAVA_PROBE_TF, source, "java");
    expect(findings).toHaveLength(1);
    const ctx = ctxFor(file, capabilities);
    const h = hypothesis.build(findings[0]!, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
  });

  it("SÓLO un ciclo llenar/vaciar en el MISMO método, sin lectores ni otro escritor ⇒ null (methodCountCheck: 1 método < 2) — coincide con el caveat del propio detector: sin comportamiento repartido, no hay 'conditionals in every method', es una variable de trabajo local a un método", async () => {
    const source = `
class Cache {
  private data: any;
  refresh(): void {
    this.data = null;
    this.data = computeData();
  }
}
`;
    const { file, capabilities, findings } = await runTemporaryField("tree-sitter-typescript.wasm", TS_PROBE_TF, source, "typescript");
    expect(findings).toHaveLength(1);
    const ctx = ctxFor(file, capabilities);
    expect(hypothesis.build(findings[0]!, null, ctx)).toBeNull();
  });

  it("2 escritores en métodos distintos, CERO lectores ⇒ SÍ produce hipótesis (methodCountCheck: 2 alcanza) pero branchesCheck (el análogo de '3+ ramas' para esta ancla) NO se confirma — discrimina un toggle interno de una máquina de estados con comportamiento repartido", async () => {
    const source = `
class Toggle {
  private flag: any;
  turnOn(): void {
    this.flag = 1;
  }
  turnOff(): void {
    this.flag = null;
  }
  label(): string { return "t"; }
  describe(): string { return "d"; }
}
`;
    const { file, capabilities, findings } = await runTemporaryField("tree-sitter-typescript.wasm", TS_PROBE_TF, source, "typescript");
    expect(findings).toHaveLength(1);
    const ctx = ctxFor(file, capabilities);
    const h = hypothesis.build(findings[0]!, null, ctx);
    expect(h).not.toBeNull();

    const methodCheck = h!.checks.find((c) => c.role === "required" && c.label.includes("2+ métodos"))!;
    expect(methodCheck.passed).toBe(true);
    expect(methodCheck.why).toContain("2 método(s)");

    const branchesDisc = h!.discriminators.find((c) => c.label.includes("temporary-field"))!;
    expect(branchesDisc.passed).toBe(false);
    expect(branchesDisc.why).toContain("toggle interno");
  });

  /* ──────────────────────────────────────────────────────────────────────
   * Ola AK (AK4) — el REQUERIDO `ciclo-en-2-o-mas-miembros`. Un test por
   * intención, y el que decide usa la TRAZA para nombrar QUÉ `required` mata
   * la hipótesis: sin eso, "sale null" no distingue este check del
   * `methodCountCheck` que ya existía.
   * ────────────────────────────────────────────────────────────────────── */

  it("AK4 — el ciclo llenar/vaciar ENTERO cabe en UN miembro, pero HAY un lector (así que methodCountCheck pasa con 2) ⇒ null, y muere EXACTAMENTE en `ciclo-en-2-o-mas-miembros`: el campo es una variable de trabajo de UNA operación, no un estado que otros miembros vean transicionar", async () => {
    const source = `
class Cache {
  private data: any;
  refresh(): void {
    this.data = null;
    this.data = computeData();
  }
  size(): number {
    return this.data === null ? 0 : 1;
  }
}
`;
    const { file, capabilities, findings } = await runTemporaryField("tree-sitter-typescript.wasm", TS_PROBE_TF, source, "typescript");
    expect(findings).toHaveLength(1);
    const ctx = ctxFor(file, capabilities);
    startStateTrace();
    expect(hypothesis.build(findings[0]!, null, ctx)).toBeNull();
    const traza = takeStateTrace();
    expect(traza).toHaveLength(1);
    // methodCountCheck SÍ pasa (1 escritor + 1 lector = 2): sin el check nuevo
    // esta hipótesis se emitía.
    expect(traza[0]!.distinctMethods).toBe(2);
    expect(traza[0]!.checks.find((c) => c.id === "repetido-en-2-o-mas-metodos")!.holds).toBe(true);
    expect(traza[0]!.diesAt).toBe("ciclo-en-2-o-mas-miembros");
    expect(traza[0]!.checks.find((c) => c.id === "ciclo-en-2-o-mas-miembros")!.why).toContain("VARIABLE DE TRABAJO");
  });

  it("AK4 — el llenado y el vaciado están en miembros DISTINTOS ⇒ el check nuevo SE SOSTIENE y su evidencia nombra cuántos miembros reparten el ciclo (el caso testigo de la Ola X sigue emitiendo igual que antes)", async () => {
    const source = `
class MultiInputStream {
  private in: any;
  advance(): void {
    this.in = new Source();
  }
  read(): number {
    if (this.in === null) { return -1; }
    return 1;
  }
  close(): void {
    this.in = null;
  }
  label(): string { return "multi"; }
  describe(): string { return "stream"; }
}
`;
    const { file, capabilities, findings } = await runTemporaryField("tree-sitter-typescript.wasm", TS_PROBE_TF, source, "typescript");
    const ctx = ctxFor(file, capabilities);
    const h = hypothesis.build(findings[0]!, null, ctx);
    expect(h).not.toBeNull();
    const cycle = h!.checks.find((c) => c.role === "required" && c.label.includes("ciclo llenar/vaciar"))!;
    expect(cycle.passed).toBe(true);
    expect(cycle.why).toContain("2 miembro(s) distinto(s)");
  });

  it("AK4 — sobre OTRA ancla (repeated-switch) el check nuevo se sostiene SIEMPRE y lo dice: no hay ciclo que contar ahí, así que no puede quitarle población a las otras tres anclas", async () => {
    const source = `
class Order {
  private status: string = "new";
  price(): number {
    switch (this.status) { case "a": return 1; case "b": return 2; default: return 0; }
  }
  icon(): string {
    switch (this.status) { case "a": return "x"; case "b": return "y"; default: return "z"; }
  }
  advance(): void { this.status = "b"; }
}
`;
    const { file, capabilities, findings } = await runRepeatedSwitch("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript");
    expect(findings.length).toBeGreaterThan(0);
    const ctx = ctxFor(file, capabilities);
    const h = hypothesis.build(findings[0]!, null, ctx);
    expect(h).not.toBeNull();
    const cycle = h!.checks.find((c) => c.role === "required" && c.label.includes("ciclo llenar/vaciar"))!;
    expect(cycle.passed).toBe(true);
    expect(cycle.why).toContain("el ancla no es temporary-field");
  });

  // Sonda propia: la de arriba (`TS_PROBE_TF`) NO tiene una función flecha, así
  // que `deriveNodeSets` no mete `arrow_function` en `functionNodes` y el ancla
  // no vería NINGÚN miembro en la fixture de abajo. La sonda REAL del analizador
  // (`TS_FAMILY_PROBE` en `code-analyzer.ts`) sí la tiene — de ahí que el caso
  // de excalidraw exista en producción. Mismo cuidado que AI5/AJ5 dejaron escrito
  // para sus propias sondas.
  const TS_PROBE_TF_ARROW = `
class Probe {
  private seed: number = 0;
  constructor(seed: number) { this.seed = seed; }
  run(value: number): number { return value; }
  handler = (value: number): number => { return value; };
}
`;

  it("AK4 — DOS miembros escritos como PROPIEDAD DE CLASE con función flecha (los dos sin `name`, los dos `\"(anónima)\"` para el ancla) ⇒ la lectura POR POSICIÓN los separa y la hipótesis SIGUE saliendo: el check no puede volverse imposible para ese idiom entero (caso real: excalidraw App.tsx, 5 miembros y un solo nombre)", async () => {
    const source = `
class App {
  private hitLink: any;
  onMove = (e: any): void => {
    this.hitLink = findLink(e);
  };
  onLeave = (e: any): void => {
    this.hitLink = null;
  };
  render(): number {
    return this.hitLink === null ? 0 : 1;
  }
  label(): string { return "app"; }
  describe(): string { return "canvas"; }
}
`;
    const { file, capabilities, findings } = await runTemporaryField("tree-sitter-typescript.wasm", TS_PROBE_TF_ARROW, source, "typescript");
    expect(findings).toHaveLength(1);
    // el ancla ve UN solo nombre para los DOS miembros: ésa es la trampa.
    expect(new Set(findings[0]!.locations.map((l) => l.symbol)).size).toBe(1);
    const ctx = ctxFor(file, capabilities);
    const h = hypothesis.build(findings[0]!, null, ctx);
    expect(h).not.toBeNull();
    const cycle = h!.checks.find((c) => c.role === "required" && c.label.includes("ciclo llenar/vaciar"))!;
    expect(cycle.passed).toBe(true);
    expect(cycle.why).toContain("2 miembro(s) distinto(s)");
  });

  it("AK4 — SIN árbol vivo (`ctx.file === null`) queda UNA sola lectura y la regla de refutación exige LAS DOS: el check se sostiene y lo dice, aunque el conteo por nombre dé 1", () => {
    const finding: Finding = {
      id: "f-tf-sin-arbol",
      detectorId: "temporary-field",
      kind: "temporary-field",
      scope: "intra-file",
      language: "typescript",
      title: "`Caja.slot` sólo tiene valor durante parte de la vida del objeto",
      detail: "d",
      trigger: [{ label: "ciclos llenar/vaciar fuera del constructor", value: 1, threshold: fakeThreshold() }],
      evidence: [{ label: "miembros que sólo lo leen", value: 1 }],
      locations: [
        { file: "a.ts", startLine: 3, endLine: 3, symbol: "refresh", role: "vacía `slot`" },
        { file: "a.ts", startLine: 4, endLine: 4, symbol: "refresh", role: "llena `slot`" },
      ],
      severity: 50,
      advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
    };
    const ctx = ctxFor(null, new Set());
    const h = hypothesis.build(finding, null, ctx);
    expect(h).not.toBeNull();
    const cycle = h!.checks.find((c) => c.role === "required" && c.label.includes("ciclo llenar/vaciar"))!;
    expect(cycle.passed).toBe(true);
    expect(cycle.why).toContain("una sola lectura disponible");
  });

  /* ──────────────────────────────────────────────────────────────────────
   * Ola AL (AL2) — el REQUERIDO `unidad-con-miembros-afuera`. Un test por
   * INTENCIÓN, y el que decide usa la TRAZA: "sale null" no distingue este
   * check de los cinco que ya estaban.
   * ────────────────────────────────────────────────────────────────────── */

  it("AL2 — el campo lo tocan TODOS los miembros de la unidad (no queda ninguno afuera) ⇒ null, y muere EXACTAMENTE en `unidad-con-miembros-afuera`: la jerarquía de estados se llevaría la unidad entera y dejaría una cáscara", async () => {
    const source = `
class Holder {
  private slot: any;
  open(): void {
    this.slot = build();
  }
  close(): void {
    this.slot = null;
  }
  peek(): number {
    return this.slot === null ? 0 : 1;
  }
}
`;
    const { file, capabilities, findings } = await runTemporaryField("tree-sitter-typescript.wasm", TS_PROBE_TF, source, "typescript");
    expect(findings).toHaveLength(1);
    const ctx = ctxFor(file, capabilities);
    startStateTrace();
    expect(hypothesis.build(findings[0]!, null, ctx)).toBeNull();
    const traza = takeStateTrace();
    expect(traza).toHaveLength(1);
    // los CINCO `required` viejos pasan: sin el check nuevo esta hipótesis se emitía.
    expect(traza[0]!.checks.find((c) => c.id === "ciclo-en-2-o-mas-miembros")!.holds).toBe(true);
    expect(traza[0]!.diesAt).toBe("unidad-con-miembros-afuera");
    expect(traza[0]!.checks.find((c) => c.id === "unidad-con-miembros-afuera")!.why).toContain("cáscara");
  });

  it("AL2 — a la unidad le quedan 2+ miembros que NO tocan el campo ⇒ el check SE SOSTIENE y su evidencia dice cuántos: ahí mudar la condición a una jerarquía SÍ descarga trabajo", async () => {
    const source = `
class Session {
  private token: any;
  login(): void {
    this.token = mint();
  }
  logout(): void {
    this.token = null;
  }
  read(): number {
    return this.token === null ? 0 : 1;
  }
  render(): string { return "x"; }
  describe(): string { return "y"; }
}
`;
    const { file, capabilities, findings } = await runTemporaryField("tree-sitter-typescript.wasm", TS_PROBE_TF, source, "typescript");
    expect(findings).toHaveLength(1);
    const ctx = ctxFor(file, capabilities);
    const h = hypothesis.build(findings[0]!, null, ctx);
    expect(h).not.toBeNull();
    const slack = h!.checks.find((c) => c.role === "required" && c.label.includes("tocan el campo"))!;
    expect(slack.passed).toBe(true);
    expect(slack.why).toContain("2 miembro(s) que no tocan el campo");
  });

  it("AL2 — sobre OTRA ancla (repeated-switch) el check nuevo se sostiene SIEMPRE y lo dice: no puede quitarle población a las otras tres anclas", async () => {
    const source = `
class Order {
  private status: string = "new";
  price(): number {
    switch (this.status) { case "a": return 1; case "b": return 2; default: return 0; }
  }
  icon(): string {
    switch (this.status) { case "a": return "x"; case "b": return "y"; default: return "z"; }
  }
  advance(): void { this.status = "b"; }
}
`;
    const { file, capabilities, findings } = await runRepeatedSwitch("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript");
    expect(findings.length).toBeGreaterThan(0);
    const ctx = ctxFor(file, capabilities);
    const h = hypothesis.build(findings[0]!, null, ctx);
    expect(h).not.toBeNull();
    const slack = h!.checks.find((c) => c.role === "required" && c.label.includes("tocan el campo"))!;
    expect(slack.passed).toBe(true);
    expect(slack.why).toContain("el ancla no es temporary-field");
  });

  it("AL2 — GO: el `type_spec` es class-like pero NO contiene ni un método (los métodos son `func` con receptor, en otra declaración). La unidad se cuenta por RECEPTOR, así que una unidad grande NO se refuta — sin eso, este check sería una compuerta que la gramática entera de Go no puede pasar", async () => {
    const GO_PROBE_TF = `
package p

type Probe struct {
	seed int
}

func (p *Probe) Run(v int) int {
	return v
}
`;
    const source = `
package p

type Command struct {
	iflags *FlagSet
}

func (c *Command) InheritedFlags() *FlagSet {
	if c.iflags == nil {
		c.iflags = NewFlagSet()
	}
	return c.iflags
}

func (c *Command) ResetFlags() {
	c.iflags = nil
}

func (c *Command) Name() string { return "n" }
func (c *Command) Use() string { return "u" }
func (c *Command) Short() string { return "s" }
func (c *Command) Long() string { return "l" }
`;
    const sets = await nodeSetsFor("tree-sitter-go.wasm", GO_PROBE_TF);
    // La sonda de gramática confirma el defecto que este test protege: el
    // único nodo class-like de Go es `type_spec`, y un `type_spec` no
    // contiene métodos.
    expect([...sets.classNodes]).toEqual(["type_spec"]);
    const probeRoot = await parseRoot("tree-sitter-go.wasm", GO_PROBE_TF);
    const capabilities = deriveCapabilities(probeRoot, sets);
    const root = await parseRoot("tree-sitter-go.wasm", source);
    const file = fileUnitFrom(root, sets, "go");
    const raw = temporaryFieldDetector.run(file, testContext(temporaryFieldDetector, "go"));
    expect(raw.length).toBeGreaterThan(0);
    const finding = toTemporaryFieldFinding(raw[0]!, "go");
    const ctx = ctxFor(file, capabilities);
    const h = hypothesis.build(finding, null, ctx);
    expect(h).not.toBeNull();
    const slack = h!.checks.find((c) => c.role === "required" && c.label.includes("tocan el campo"))!;
    expect(slack.passed).toBe(true);
    expect(slack.why).toContain("miembro(s) que no tocan el campo");
  });

  it("AL2 — SIN árbol vivo (`ctx.file === null`) no hay unidad que contar: el check REFUTA sólo con un conteo, así que se sostiene y lo dice", () => {
    const finding: Finding = {
      id: "f-tf-al2-sin-arbol",
      detectorId: "temporary-field",
      kind: "temporary-field",
      scope: "intra-file",
      language: "typescript",
      title: "`Caja.slot` sólo tiene valor durante parte de la vida del objeto",
      detail: "d",
      trigger: [{ label: "ciclos llenar/vaciar fuera del constructor", value: 1, threshold: fakeThreshold() }],
      evidence: [{ label: "miembros que sólo lo leen", value: 1 }],
      locations: [
        { file: "a.ts", startLine: 3, endLine: 3, symbol: "abrir", role: "vacía `slot`" },
        { file: "a.ts", startLine: 9, endLine: 9, symbol: "cerrar", role: "llena `slot`" },
      ],
      severity: 50,
      advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
    };
    const ctx = ctxFor(null, new Set());
    const h = hypothesis.build(finding, null, ctx);
    expect(h).not.toBeNull();
    const slack = h!.checks.find((c) => c.role === "required" && c.label.includes("tocan el campo"))!;
    expect(slack.passed).toBe(true);
    expect(slack.why).toContain("un conteo POSITIVO de la unidad");
  });

  it("título que no matchea la forma esperada (defensivo: si el detector cambiara de formato) ⇒ null, nunca un fieldName inventado por coincidencia", () => {
    const finding: Finding = {
      id: "f-tf-bad",
      detectorId: "temporary-field",
      kind: "temporary-field",
      scope: "intra-file",
      language: "typescript",
      title: "un título que no sigue el formato de temporary-field",
      detail: "d",
      trigger: [{ label: "ciclos", value: 1, threshold: fakeThreshold() }],
      locations: [{ file: "a.ts", startLine: 1, endLine: 1, symbol: "m", role: "r" }],
      severity: 50,
      advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
    };
    const ctx = ctxFor(null, new Set());
    expect(hypothesis.build(finding, null, ctx)).toBeNull();
  });

  it("contrato de cableado (Ola AZ — AZ3): `anchors` YA NO incluye temporary-field, y el resto queda EXACTO", () => {
    // HISTORIA, porque esta ancla entró, salió, volvió y ahora sale de nuevo:
    //   · Ola Y (Y2)  — entra. Caso testigo: guava/MultiInputStream.java:56.
    //   · Ola AC (AC2) — sale por R1 (7/48 = 14,6 %) y VUELVE en la misma ola:
    //     el umbral que la condenó no estaba validado contra lo que se pierde,
    //     y el proyecto mejoraba de forma sólo aditiva.
    //   · Ola AY (AY2) — la mide de nuevo (19/187 = 10,2 %) y busca un corte de
    //     costo cero por CINCO estratificaciones. No existe. Publica y no aterriza.
    //   · Ola AZ (AZ3) — SALE, y ahora sí con el precio publicado, porque el
    //     usuario levantó la regla de costo cero para `State` en esta ola.
    //     20 verdaderas de 211 juicios = 9,5 % [6 %, 14 %]; 26 sujetos FRESCOS
    //     dan 1/24 = 4,2 %. Precio: 20 verdaderas, nombradas en AZ3.md §4.2.
    //     Efecto: State 12,7 % → 29,3 %. Ver el comentario de `anchors`.
    expect(hypothesis.anchors).not.toContain("temporary-field");
    // Igualdad EXACTA, no `toContain`: las otras tres quedan, en el mismo orden.
    expect(hypothesis.anchors).toEqual(["repeated-switch", "conditional-chain", "type-switch"]);
  });

  it("OLA AZ (AZ3): el ancla retirada sigue ANCLADA por otra hipótesis — el delta de NIVEL 1 es CERO y ningún kind queda huérfano", async () => {
    // `run.ts` arma el conjunto de kinds anclados recorriendo `HYPOTHESES`. Si
    // `temporary-field` quedara sin ningún consumidor, el detector dejaría de
    // correr y se perderían hallazgos de nivel 1. NO queda huérfano: su dueño
    // natural, `extract-class-from-temporary-fields.ts`, lo ancla y mide 63,2 %
    // — seis veces lo que medía `State` sobre el mismo cable.
    const { HYPOTHESES } = await import("./registry.js");
    const otros = HYPOTHESES.filter((h) => h.id !== "state" && h.anchors.includes("temporary-field"));
    expect(otros.map((h) => h.id)).toContain("extract-class-from-temporary-fields");
    expect(otros.length).toBeGreaterThan(0);
  });

  // NOTA (AZ3): NO agrego un test de "build() sigue construyendo para
  // temporary-field". Sería redundante y peor: los tests de la TERCERA ANCLA
  // que ya viven en este archivo llaman a `hypothesis.build` DIRECTAMENTE con
  // un `Finding` de `temporary-field`, así que siguen verdes y son la prueba
  // real de que la rama propia no se atrofió. El recorte es de RUTEO —`run.ts`
  // filtra por `b.anchors.includes(finding.kind)`— y esos tests no pasan por
  // ese filtro.
});

/* ────────────────────────────────────────────────────────────────────────
 * CUARTA ANCLA — `type-switch` (Ola AI, frente AI4).
 *
 * Corre el detector-ancla REAL (`detect/intra-function/type-switch.ts`) sobre
 * fixtures reales — nunca un `Finding` sintético — porque lo que esta rama
 * consume es EXACTAMENTE lo que ese detector escribe: el sujeto entre
 * backticks del título y el conteo de ramas del `trigger`. Un `Finding` a mano
 * podría escribir un título que el detector real nunca produce y el test
 * mediría sobre una gramática inventada.
 *
 * Un test por INTENCIÓN, y el primero de todos es el defecto que esta rama
 * arregla.
 * ──────────────────────────────────────────────────────────────────────── */
describe("state — CUARTA ANCLA type-switch (Ola AI, AI4)", () => {
  const TS_PROBE_TS = `
class Probe {
  status: string;
  node: Probe;
  describe(kind: string): string {
    switch (kind) {
      case "circle": return "circle";
      default: return "unknown";
    }
  }
  guard(x: unknown): boolean {
    if (x instanceof Probe) { return true; } else if (x instanceof String) { return false; } else { return false; }
  }
}
`;

  const RUBY_PROBE_TS = `
class Probe
  def describe(kind)
    case kind
    when Symbol then 1
    else 0
    end
  end
end
`;

  async function parseFile(wasm: string, probe: string, source: string, language: string) {
    const sets = await nodeSetsFor(wasm, probe);
    const probeRoot = await parseRoot(wasm, probe);
    const capabilities = deriveCapabilities(probeRoot, sets);
    const root = await parseRoot(wasm, source);
    const file = fileUnitFrom(root, sets, language);
    return { file, sets, capabilities };
  }

  /** Los `Finding` que el detector-ancla REAL produce sobre la fixture, uno por sitio. */
  function typeSwitchFindings(file: FileUnit): Finding[] {
    const ctx = testContext(typeSwitchDetector, file.language);
    const out: Finding[] = [];
    let i = 0;
    for (const fn of file.functions) {
      for (const raw of typeSwitchDetector.run(fn, ctx)) {
        out.push({ ...raw, id: `ts-${i++}`, detectorId: "type-switch", kind: "type-switch", scope: "intra-function", language: file.language });
      }
    }
    return out;
  }

  /** Vecindario REAL en lo único que esta rama consulta: `findingsOfKind`, sin el propio hallazgo, como lo define `graph/neighborhood.ts`. */
  function ctxWithPeers(file: FileUnit, sets: FileUnit["sets"], capabilities: ReadonlySet<string>, self: Finding, peers: readonly Finding[]): HypothesisContext {
    return {
      file,
      fileAt: () => null,
      repo: FAKE_REPO,
      capabilities: capabilities as HypothesisContext["capabilities"],
      setsFor: () => sets,
      neighborhood: {
        ...EMPTY_NEIGHBORHOOD,
        findingsOfKind: (kind: string) => (kind === "type-switch" ? peers.filter((f) => f.id !== self.id) : []),
        countOfKind: (kind: string) => (kind === "type-switch" ? peers.filter((f) => f.id !== self.id).length : 0),
      },
      branches: () => null,
    };
  }

  it("EL DEFECTO QUE ESTA RAMA ARREGLA (D1): el título de type-switch NUNCA matchea el regex de la rama por defecto de buildProblem — sin rama propia, fieldName sale null y el primer required corta el 100 %", async () => {
    const source = `
class Order {
  node: Order;
  price(): number {
    if (this.node instanceof Order) { return 1; } else if (this.node instanceof String) { return 2; } else { return 0; }
  }
}
`;
    const { file } = await parseFile("tree-sitter-typescript.wasm", TS_PROBE_TS, source, "typescript");
    const findings = typeSwitchFindings(file);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      // La rama por defecto de `buildProblem` usa /^"([^"]+)"/ sobre el título.
      expect(/^"([^"]+)"/.exec(f.title)).toBeNull();
      // Y (D2): el detector emite UN Finding POR SITIO, con UNA sola location,
      // así que contar `locations[].symbol` da SIEMPRE 1 — por debajo de
      // STATE_MIN_METHODS. Los dos required eran imposibles por construcción.
      expect(f.locations.length).toBe(1);
    }
  });

  it("TypeScript: el MISMO campo propio (this.node) decidido por TIPO en 2 métodos ⇒ hipótesis State — el caso que hoy no recibe propuesta de nadie", async () => {
    const source = `
class Order {
  node: Order;
  reset(): void { this.node = new Order(); }
  price(): number {
    if (this.node instanceof Order) { return 1; } else if (this.node instanceof String) { return 2; } else { return 0; }
  }
  icon(): number {
    if (this.node instanceof Order) { return 3; } else if (this.node instanceof String) { return 4; } else { return 0; }
  }
}
`;
    const { file, sets, capabilities } = await parseFile("tree-sitter-typescript.wasm", TS_PROBE_TS, source, "typescript");
    const findings = typeSwitchFindings(file);
    expect(findings.length).toBe(2);
    const ctx = ctxWithPeers(file, sets, capabilities, findings[0]!, findings);
    const h = hypothesis.build(findings[0]!, null, ctx);
    expect(h).not.toBeNull();

    const selfCheck = h!.checks.find((c) => c.role === "required" && c.label.includes("propia unidad"))!;
    expect(selfCheck.passed).toBe(true);
    expect(selfCheck.why).toContain('"node"');

    const methodCheck = h!.checks.find((c) => c.role === "required" && c.label.includes("2+ métodos"))!;
    expect(methodCheck.passed).toBe(true);
    // La cuenta NO puede venir de `locations` (una sola): viene del vecindario.
    expect(findings[0]!.locations.length).toBe(1);
    expect(methodCheck.why).toContain("2 método(s)");
    expect(h!.state).toBe("ausente");
  });

  it("TypeScript: el mismo campo propio decidido por TIPO en UN SOLO método ⇒ null — sin repetición no hay nada que quitar y una clase por estado no se paga (ESCALA)", async () => {
    const source = `
class Order {
  node: Order;
  reset(): void { this.node = new Order(); }
  price(): number {
    if (this.node instanceof Order) { return 1; } else if (this.node instanceof String) { return 2; } else { return 0; }
  }
}
`;
    const { file, sets, capabilities } = await parseFile("tree-sitter-typescript.wasm", TS_PROBE_TS, source, "typescript");
    const findings = typeSwitchFindings(file);
    expect(findings.length).toBe(1);
    const ctx = ctxWithPeers(file, sets, capabilities, findings[0]!, findings);
    expect(hypothesis.build(findings[0]!, null, ctx)).toBeNull();
  });

  it("TypeScript: el discriminante es un PARÁMETRO ⇒ null — es el territorio de Strategy, y este camino es su complemento exacto, nunca su rival", async () => {
    const source = `
class Order {
  price(x: unknown): number {
    if (x instanceof Order) { return 1; } else if (x instanceof String) { return 2; } else { return 0; }
  }
  icon(x: unknown): number {
    if (x instanceof Order) { return 3; } else if (x instanceof String) { return 4; } else { return 0; }
  }
}
`;
    const { file, sets, capabilities } = await parseFile("tree-sitter-typescript.wasm", TS_PROBE_TS, source, "typescript");
    const findings = typeSwitchFindings(file);
    expect(findings.length).toBe(2);
    const ctx = ctxWithPeers(file, sets, capabilities, findings[0]!, findings);
    expect(hypothesis.build(findings[0]!, null, ctx)).toBeNull();
  });

  it("Java: identificador DESNUDO que es un campo real y SE REASIGNA ⇒ hipótesis (this implícito) — y el mismo campo SIN reasignación ⇒ null (implicitSelfNeedsTransitionEvidence)", async () => {
    const JAVA_PROBE_TS = `
class P {
  Object node;
  int probe(int x) {
    switch (x) {
      case 1: return 1;
      default: return 0;
    }
  }
  boolean guard(Object o) {
    if (o instanceof P) { return true; } else if (o instanceof String) { return false; } else { return false; }
  }
}
`;
    const conReasignacion = `
class Order {
  Object node;
  void reset() { node = new Order(); }
  int price() {
    if (node instanceof Order) { return 1; } else if (node instanceof String) { return 2; } else { return 0; }
  }
  int icon() {
    if (node instanceof Order) { return 3; } else if (node instanceof String) { return 4; } else { return 0; }
  }
}
`;
    const sinReasignacion = `
class Order {
  Object node;
  int price() {
    if (node instanceof Order) { return 1; } else if (node instanceof String) { return 2; } else { return 0; }
  }
  int icon() {
    if (node instanceof Order) { return 3; } else if (node instanceof String) { return 4; } else { return 0; }
  }
}
`;
    {
      const { file, sets, capabilities } = await parseFile("tree-sitter-java.wasm", JAVA_PROBE_TS, conReasignacion, "java");
      const findings = typeSwitchFindings(file);
      expect(findings.length).toBe(2);
      const ctx = ctxWithPeers(file, sets, capabilities, findings[0]!, findings);
      expect(hypothesis.build(findings[0]!, null, ctx)).not.toBeNull();
    }
    {
      const { file, sets, capabilities } = await parseFile("tree-sitter-java.wasm", JAVA_PROBE_TS, sinReasignacion, "java");
      const findings = typeSwitchFindings(file);
      expect(findings.length).toBe(2);
      const ctx = ctxWithPeers(file, sets, capabilities, findings[0]!, findings);
      expect(hypothesis.build(findings[0]!, null, ctx)).toBeNull();
    }
  });

  it("Java: identificador desnudo SOMBREADO por un parámetro del propio método ⇒ null — la guarda que el módulo ya tenía (isShadowedByOwnParameter), aplicada antes de preguntar", async () => {
    const JAVA_PROBE_TS = `
class P {
  Object node;
  int probe(int x) {
    switch (x) {
      case 1: return 1;
      default: return 0;
    }
  }
  boolean guard(Object o) {
    if (o instanceof P) { return true; } else if (o instanceof String) { return false; } else { return false; }
  }
}
`;
    // `node` ES un campo de la clase, pero en los dos métodos está SOMBREADO
    // por el parámetro homónimo: no es el estado del objeto, es el argumento.
    // Es exactamente la forma que AH1 midió en guava (Iterables.getLast).
    const source = `
class Order {
  Object node;
  void reset() { node = new Order(); }
  int price(Object node) {
    if (node instanceof Order) { return 1; } else if (node instanceof String) { return 2; } else { return 0; }
  }
  int icon(Object node) {
    if (node instanceof Order) { return 3; } else if (node instanceof String) { return 4; } else { return 0; }
  }
}
`;
    const { file, sets, capabilities } = await parseFile("tree-sitter-java.wasm", JAVA_PROBE_TS, source, "java");
    const findings = typeSwitchFindings(file);
    expect(findings.length).toBe(2);
    const ctx = ctxWithPeers(file, sets, capabilities, findings[0]!, findings);
    expect(hypothesis.build(findings[0]!, null, ctx)).toBeNull();
  });

  it("Ruby: la misma regla cruza de lenguaje — @estado decidido por TIPO (case/when Clase) en 2 métodos ⇒ hipótesis", async () => {
    const source = `
class Order
  def reset
    @node = Order.new
  end
  def price
    case @node
    when Order then 1
    when String then 2
    else 0
    end
  end
  def icon
    case @node
    when Order then 3
    when String then 4
    else 0
    end
  end
end
`;
    const { file, sets, capabilities } = await parseFile("tree-sitter-ruby.wasm", RUBY_PROBE_TS, source, "ruby");
    const findings = typeSwitchFindings(file);
    expect(findings.length).toBe(2);
    const ctx = ctxWithPeers(file, sets, capabilities, findings[0]!, findings);
    const h = hypothesis.build(findings[0]!, null, ctx);
    expect(h).not.toBeNull();
    const selfCheck = h!.checks.find((c) => c.role === "required" && c.label.includes("propia unidad"))!;
    expect(selfCheck.passed).toBe(true);
  });

  it("el discriminador de ramas describe la escala CON EL DATO DEL DETECTOR, no con la frase de repeated-switch — 2 ramas no lo confirman, 3 sí", async () => {
    const dos = `
class Order {
  node: Order;
  reset(): void { this.node = new Order(); }
  price(): number {
    if (this.node instanceof Order) { return 1; } else if (this.node instanceof String) { return 2; } else { return 0; }
  }
  icon(): number {
    if (this.node instanceof Order) { return 3; } else if (this.node instanceof String) { return 4; } else { return 0; }
  }
}
`;
    const { file, sets, capabilities } = await parseFile("tree-sitter-typescript.wasm", TS_PROBE_TS, dos, "typescript");
    const findings = typeSwitchFindings(file);
    const ctx = ctxWithPeers(file, sets, capabilities, findings[0]!, findings);
    const h = hypothesis.build(findings[0]!, null, ctx)!;
    const branches = h.discriminators.find((c) => c.label.includes("ramas"))!;
    expect(branches.passed).toBe(false);
    expect(branches.why).toContain("contadas por el propio detector-ancla");
  });

  it("sin árbol vivo (ctx.file null) la rama no afirma nada ⇒ null — nunca 'se asume que pasa'", async () => {
    const source = `
class Order {
  node: Order;
  reset(): void { this.node = new Order(); }
  price(): number {
    if (this.node instanceof Order) { return 1; } else if (this.node instanceof String) { return 2; } else { return 0; }
  }
  icon(): number {
    if (this.node instanceof Order) { return 3; } else if (this.node instanceof String) { return 4; } else { return 0; }
  }
}
`;
    const { file } = await parseFile("tree-sitter-typescript.wasm", TS_PROBE_TS, source, "typescript");
    const findings = typeSwitchFindings(file);
    expect(hypothesis.build(findings[0]!, null, ctxFor(null, new Set(["tipos-explicitos"])))).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * Ola AC (AC2) — CUARTA ANCLA `enumerated-field-dispatch`, la primera que
 * nombra la FUERZA que State resuelve en vez de un síntoma correlacionado.
 * Mismo arnés que la tercera: el detector REAL corre sobre una fixture real,
 * así que lo que se prueba es la cadena entera ancla → hipótesis, nunca un
 * `Finding` inventado a mano (salvo el negativo defensivo de título).
 * ──────────────────────────────────────────────────────────────────────── */
describe("state — CUARTA ANCLA enumerated-field-dispatch (Ola AC, AC2)", () => {
  function toDispatchFinding(raw: RawFinding, language: string): Finding {
    return {
      ...raw,
      id: "f-efd",
      detectorId: "enumerated-field-dispatch",
      kind: "enumerated-field-dispatch",
      scope: "intra-file",
      language,
    };
  }

  async function runDispatch(wasm: string, probe: string, source: string, language: string) {
    const sets = await nodeSetsFor(wasm, probe);
    const probeRoot = await parseRoot(wasm, probe);
    const capabilities = deriveCapabilities(probeRoot, sets);
    const root = await parseRoot(wasm, source);
    const file = fileUnitFrom(root, sets, language);
    const raw = enumeratedFieldDispatchDetector.run(file, testContext(enumeratedFieldDispatchDetector, language));
    return { file, capabilities, findings: raw.map((r) => toDispatchFinding(r, language)) };
  }

  const TS_PROBE_EFD = `
class Probe {
  private seed: number = 0;
  constructor(seed: number) { this.seed = seed; }
  run(value: number): number { switch (value) { case 1: return 1; default: return 0; } }
}
`;

  it("TypeScript: campo con alfabeto de 3 valores, reasignado fuera del constructor, decidido en 3 miembros ⇒ hipótesis AUSENTE (la resolución no está) con campo propio verificado por AST y el alfabeto como discriminador", async () => {
    const source = `
class Connection {
  private phase: string = "idle";
  open(): void { if (this.phase === "idle") { this.phase = "open"; } }
  send(payload: string): string | null { if (this.phase === "open") { return payload; } return null; }
  fail(): void { if (this.phase === "open") { this.phase = "broken"; } }
  reset(): void { if (this.phase === "broken") { this.phase = "idle"; } }
}
`;
    const { file, capabilities, findings } = await runDispatch("tree-sitter-typescript.wasm", TS_PROBE_EFD, source, "typescript");
    expect(findings).toHaveLength(1);
    const ctx = ctxFor(file, capabilities);
    const h = hypothesis.build(findings[0]!, null, ctx);
    expect(h).not.toBeNull();
    // El ancla detecta la FUERZA; que la RESOLUCIÓN esté ausente lo decide
    // `appliedState`, sin cambios — ver el docstring del módulo, "CUARTA ANCLA".
    expect(h!.state).toBe("ausente");

    const selfCheck = h!.checks.find((c) => c.role === "required" && c.label.includes("propia unidad"))!;
    expect(selfCheck.passed).toBe(true);
    expect(selfCheck.why).toMatch(/verificado por AST por el detector-ancla \(enumerated-field-dispatch\)/);

    const branchesDisc = h!.discriminators.find((c) => c.why.includes("valores constantes distintos"))!;
    expect(branchesDisc.passed).toBe(true);
    expect(branchesDisc.why).toContain("3 valores constantes distintos");
  });

  it("TypeScript: alfabeto de 2 valores ⇒ la hipótesis sigue saliendo, pero el DISCRIMINADOR del alfabeto NO se confirma (una alternancia binaria no es una máquina de estados)", async () => {
    const source = `
class Latch {
  private phase: string = "up";
  raise(): void { if (this.phase === "down") { this.phase = "up"; } }
  drop(): void { if (this.phase === "up") { this.phase = "down"; } }
}
`;
    const { file, capabilities, findings } = await runDispatch("tree-sitter-typescript.wasm", TS_PROBE_EFD, source, "typescript");
    expect(findings).toHaveLength(1);
    const ctx = ctxFor(file, capabilities);
    const h = hypothesis.build(findings[0]!, null, ctx);
    expect(h).not.toBeNull();
    const branchesDisc = h!.discriminators.find((c) => c.why.includes("valores constantes distintos"))!;
    expect(branchesDisc.passed).toBe(false);
    expect(branchesDisc.why).toContain("alternancia binaria");
  });

  it("título que no matchea la forma esperada (defensivo) ⇒ null, nunca un fieldName inventado por coincidencia", () => {
    const finding: Finding = {
      id: "f-efd-bad",
      detectorId: "enumerated-field-dispatch",
      kind: "enumerated-field-dispatch",
      scope: "intra-file",
      language: "typescript",
      title: "un título que no sigue el formato de enumerated-field-dispatch",
      detail: "d",
      trigger: [{ label: "miembros", value: 2, threshold: fakeThreshold() }],
      locations: [{ file: "a.ts", startLine: 1, endLine: 1, symbol: "m", role: "r" }],
      severity: 50,
      advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
    };
    const ctx = ctxFor(null, new Set());
    expect(hypothesis.build(finding, null, ctx)).toBeNull();
  });

  it("contrato de cableado (R1 APLICADA EN LA MISMA OLA): `anchors` NO incluye enumerated-field-dispatch, y el detector está DESREGISTRADO", () => {
    // El ancla-fuerza se midió sobre las dos poblaciones completas: 28
    // hipótesis, 20 recomendaciones, LAS 28 juzgadas a mano — 1 verdadera.
    // Precisión 1/20 = 5,0 % [0,9 %, 23,6 %], con n >= 12: R1 dispara igual
    // que sobre el ancla vieja. El detector y esta rama quedan escritos y sin
    // cablear para que la próxima ola pueda re-medir; ver el docstring de
    // `detect/intra-file/enumerated-field-dispatch.ts`.
    expect(hypothesis.anchors).not.toContain("enumerated-field-dispatch");
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * OLA AJ, FRENTE AJ5 — QUINTA FORMA DE "CAMPO PROPIO": `R.campo` con `R` = el
 * RECEPTOR DECLARADO de la función encerrante.
 *
 * Medido antes de escribir estos tests: **184 candidatos de Go en las tres
 * anclas de switch/cadena (cobra + hugo), 0 supervivientes** — las cuatro
 * formas viejas son insatisfacibles para Go POR CONSTRUCCIÓN (ver el docstring
 * del módulo, sección "OLA AJ"). Un test por INTENCIÓN.
 * ──────────────────────────────────────────────────────────────────────── */
describe("state — QUINTA forma: el receptor declarado (Ola AJ, AJ5)", () => {
  /** Sonda de Go CON un `switch` real: sin él `switchContainerNodes` sale VACÍO
   *  y `findSwitchAt` no encontraría nada — mismo cuidado que AI5 dejó escrito
   *  para su propia sonda. */
  const GO_PROBE_SWITCH = `
package main

type Probe struct {
	kind string
}

func (p *Probe) Describe(x string) string {
	switch x {
	case "a":
		return "a"
	case "b":
		return "b"
	default:
		return "z"
	}
}
`;

  async function goFile(source: string) {
    const sets = await nodeSetsFor("tree-sitter-go.wasm", GO_PROBE_SWITCH);
    const probeRoot = await parseRoot("tree-sitter-go.wasm", GO_PROBE_SWITCH);
    const capabilities = deriveCapabilities(probeRoot, sets);
    const root = await parseRoot("tree-sitter-go.wasm", source);
    const file = fileUnitFrom(root, sets, "go");
    const raw = repeatedSwitchDetector.run(file, testContext(repeatedSwitchDetector, "go"));
    return { file, sets, capabilities, findings: raw.map((r) => toFinding(r, "go")) };
  }

  function ctxWithSets(file: FileUnit, sets: FileUnit["sets"], capabilities: ReadonlySet<string>): HypothesisContext {
    return {
      file,
      fileAt: () => null,
      repo: FAKE_REPO,
      capabilities: capabilities as HypothesisContext["capabilities"],
      setsFor: () => sets,
      neighborhood: EMPTY_NEIGHBORHOOD,
      branches: () => null,
    };
  }

  /** INTENCIÓN: el discriminante `p.kind` es un campo del PROPIO objeto porque
   *  `p` es el receptor declarado — la MISMA relación que `this.kind`, escrita
   *  como la escribe una gramática que nombra su receptor. */
  it("Go: `p.kind` decidido por switch en 2 métodos, con `p` = RECEPTOR ⇒ hipótesis, y la evidencia nombra al receptor", async () => {
    const source = `
package main

type Doc struct {
	kind string
}

func (p *Doc) Title() string {
	switch p.kind {
	case "page":
		return "page"
	case "post":
		return "post"
	default:
		return "?"
	}
}

func (p *Doc) Icon() string {
	switch p.kind {
	case "page":
		return "P"
	case "post":
		return "O"
	default:
		return "?"
	}
}

func (p *Doc) Reset() {
	p.kind = "page"
}
`;
    const { file, sets, capabilities, findings } = await goFile(source);
    const finding = findings.find((f) => f.title.includes("p.kind"));
    expect(finding).toBeDefined();
    const h = hypothesis.build(finding!, null, ctxWithSets(file, sets, capabilities));
    expect(h).not.toBeNull();
    const selfCheck = h!.checks.find((c) => c.role === "required" && c.label.includes("propia unidad"))!;
    expect(selfCheck.passed).toBe(true);
    expect(selfCheck.why).toContain("RECEPTOR DECLARADO");
  });

  /** INTENCIÓN: la forma nueva NO puede confirmar un PARÁMETRO cualquiera que
   *  tenga un campo — es exactamente la ambigüedad que el docstring del módulo
   *  declaraba como la razón para dejar Go afuera, y sigue cerrada. */
  it("Go: `cfg.kind` con `cfg` = PARÁMETRO (no el receptor) ⇒ null", async () => {
    const source = `
package main

type Cfg struct {
	kind string
}

type Doc struct {
	name string
}

func (p *Doc) Title(cfg *Cfg) string {
	switch cfg.kind {
	case "page":
		return "page"
	case "post":
		return "post"
	default:
		return "?"
	}
}

func (p *Doc) Icon(cfg *Cfg) string {
	switch cfg.kind {
	case "page":
		return "P"
	case "post":
		return "O"
	default:
		return "?"
	}
}
`;
    const { file, sets, capabilities, findings } = await goFile(source);
    const finding = findings.find((f) => f.title.includes("cfg.kind"));
    expect(finding).toBeDefined();
    expect(hypothesis.build(finding!, null, ctxWithSets(file, sets, capabilities))).toBeNull();
  });

  /** INTENCIÓN: la guarda de sombreado por parámetro se aplica ANTES de
   *  confirmar, igual que en las otras formas (el bug medido `JValue.cs:611`
   *  vale igual acá: un parámetro homónimo del receptor lo tapa). */
  it("Go: un PARÁMETRO homónimo del receptor lo sombrea ⇒ null", async () => {
    const source = `
package main

type Doc struct {
	kind string
}

type Other struct {
	kind string
}

func (d *Doc) Title(p *Other) string {
	switch p.kind {
	case "page":
		return "page"
	default:
		return "?"
	}
}

func (d *Doc) Icon(p *Other) string {
	switch p.kind {
	case "page":
		return "P"
	default:
		return "?"
	}
}
`;
    const { file, sets, capabilities, findings } = await goFile(source);
    const finding = findings.find((f) => f.title.includes("p.kind"));
    expect(finding).toBeDefined();
    expect(hypothesis.build(finding!, null, ctxWithSets(file, sets, capabilities))).toBeNull();
  });

  /** INTENCIÓN: alcance DECLARADO — un campo DE un campo (`a.b.c`) no es el
   *  estado del propio objeto y esta forma no lo alcanza. */
  it("Go: `p.inner.kind` (dos niveles) ⇒ null — alcance declarado de la forma", async () => {
    const source = `
package main

type Inner struct {
	kind string
}

type Doc struct {
	inner *Inner
}

func (p *Doc) Title() string {
	switch p.inner.kind {
	case "page":
		return "page"
	default:
		return "?"
	}
}

func (p *Doc) Icon() string {
	switch p.inner.kind {
	case "page":
		return "P"
	default:
		return "?"
	}
}
`;
    const { file, sets, capabilities, findings } = await goFile(source);
    const finding = findings.find((f) => f.title.includes("inner"));
    expect(finding).toBeDefined();
    expect(hypothesis.build(finding!, null, ctxWithSets(file, sets, capabilities))).toBeNull();
  });

  /** INTENCIÓN: la forma nueva es una DISYUNCIÓN que se evalúa DESPUÉS de las
   *  cuatro viejas — no puede cambiar la evidencia de una hipótesis que ya
   *  existía. */
  it("TypeScript: `this.status` sigue confirmando por la forma VIEJA (self./this./@), no por la nueva", async () => {
    const source = `
class Order {
  status: string;
  price(): number {
    switch (this.status) {
      case "pending": return 1;
      case "shipped": return 2;
      default: return 0;
    }
  }
  icon(): string {
    switch (this.status) {
      case "pending": return 1;
      case "shipped": return 2;
      default: return 0;
    }
  }
}
`;
    const { file, capabilities, findings } = await runRepeatedSwitch("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript");
    const finding = findings[0]!;
    const h = hypothesis.build(finding, null, ctxFor(file, capabilities));
    expect(h).not.toBeNull();
    const selfCheck = h!.checks.find((c) => c.role === "required" && c.label.includes("propia unidad"))!;
    expect(selfCheck.passed).toBe(true);
    expect(selfCheck.why).toContain("forma de campo propio (self./this./@)");
    expect(selfCheck.why).not.toContain("RECEPTOR DECLARADO");
  });

  /** INTENCIÓN: una gramática SIN receptor no cambia de comportamiento — la
   *  capa por lenguaje traduce (contesta `null`), no decide. */
  it("TypeScript: `order.status` (objeto que no es receptor de nada) ⇒ null, igual que antes", async () => {
    const source = `
class Cart {
  order: any;
  price(): number {
    switch (order.status) {
      case "pending": return 1;
      case "shipped": return 2;
      default: return 0;
    }
  }
  icon(): number {
    switch (order.status) {
      case "pending": return 1;
      case "shipped": return 2;
      default: return 0;
    }
  }
}
`;
    const { file, capabilities, findings } = await runRepeatedSwitch("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript");
    expect(findings.length).toBeGreaterThan(0);
    expect(hypothesis.build(findings[0]!, null, ctxFor(file, capabilities))).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * OLA AK, FRENTE AK1 — LA SEXTA FORMA: EL DISCRIMINANTE **ES** EL RECEPTOR.
 *
 * Medido antes de escribir estos tests, sobre mi propio volcado de los tres
 * repos de Go del corpus: de los **382** candidatos de Go en las tres anclas de
 * switch/cadena (LIB 181 · APP 201), **258 tienen un discriminante DESNUDO**, y
 * **14 de esos 258 son el propio receptor** (LIB 4 en hugo · APP 10 en gitea).
 * Los 14 morían en `selfPrefixCheck` POR CONSTRUCCIÓN: cuando la gramática
 * declara el método sobre un VALOR, el discriminante no es un campo *del*
 * objeto —ES el objeto—, y las cinco formas anteriores describen todas "un
 * campo DE algo". Un test por INTENCIÓN, incluidas las tres figuras que la
 * forma NO reconoce (que son, medidas, la mayoría de la población).
 * ──────────────────────────────────────────────────────────────────────── */
describe("state — SEXTA forma: el discriminante ES el receptor (Ola AK, AK1)", () => {
  const GO_PROBE_SWITCH_AK1 = `
package main

type Probe struct {
	kind string
}

func (p *Probe) Describe(x string) string {
	switch x {
	case "a":
		return "a"
	case "b":
		return "b"
	default:
		return "z"
	}
}
`;

  async function goFileAk1(source: string) {
    const sets = await nodeSetsFor("tree-sitter-go.wasm", GO_PROBE_SWITCH_AK1);
    const probeRoot = await parseRoot("tree-sitter-go.wasm", GO_PROBE_SWITCH_AK1);
    const capabilities = deriveCapabilities(probeRoot, sets);
    const root = await parseRoot("tree-sitter-go.wasm", source);
    const file = fileUnitFrom(root, sets, "go");
    const raw = repeatedSwitchDetector.run(file, testContext(repeatedSwitchDetector, "go"));
    return { file, sets, capabilities, findings: raw.map((r) => toFinding(r, "go")) };
  }

  function ctxAk1(file: FileUnit, sets: FileUnit["sets"], capabilities: ReadonlySet<string>): HypothesisContext {
    return {
      file,
      fileAt: () => null,
      repo: FAKE_REPO,
      capabilities: capabilities as HypothesisContext["capabilities"],
      setsFor: () => sets,
      neighborhood: EMPTY_NEIGHBORHOOD,
      branches: () => null,
    };
  }

  /** INTENCIÓN: cuando el método se declara sobre un VALOR, ese valor es el
   *  estado propio ENTERO — la respuesta más fuerte posible a "¿el
   *  discriminante es del propio objeto?", no una más laxa. Es la figura real
   *  medida (`hugo Format`, `gitea CommentType`/`packages.Type`/`HookEventType`). */
  it("Go: `switch k` con `k` = RECEPTOR declarado, decidido en 2 métodos ⇒ hipótesis, y la evidencia dice que ES el receptor", async () => {
    const source = `
package main

type Kind int

const (
	First Kind = iota
	Second
	Third
)

func (k Kind) Name() string {
	switch k {
	case First:
		return "first"
	case Second:
		return "second"
	default:
		return "?"
	}
}

func (k Kind) Icon() string {
	switch k {
	case First:
		return "1"
	case Second:
		return "2"
	default:
		return "?"
	}
}
`;
    const { file, sets, capabilities, findings } = await goFileAk1(source);
    const finding = findings.find((f) => f.title.includes('"k"'));
    expect(finding).toBeDefined();
    const h = hypothesis.build(finding!, null, ctxAk1(file, sets, capabilities));
    expect(h).not.toBeNull();
    const selfCheck = h!.checks.find((c) => c.role === "required" && c.label.includes("propia unidad"))!;
    expect(selfCheck.passed).toBe(true);
    expect(selfCheck.why).toContain("ES el RECEPTOR DECLARADO");
  });

  /** INTENCIÓN: la forma NO puede confirmar un PARÁMETRO. Es la figura
   *  MAYORITARIA de la población medida (140 de los 258 discriminantes
   *  desnudos de Go son parámetros de su función). */
  it("Go: `switch mode` con `mode` = PARÁMETRO de un método con receptor ⇒ null", async () => {
    const source = `
package main

type Doc struct {
	kind string
}

func (d *Doc) Title(mode string) string {
	switch mode {
	case "page":
		return "page"
	case "post":
		return "post"
	default:
		return "?"
	}
}

func (d *Doc) Icon(mode string) string {
	switch mode {
	case "page":
		return "P"
	case "post":
		return "O"
	default:
		return "?"
	}
}
`;
    const { file, sets, capabilities, findings } = await goFileAk1(source);
    const finding = findings.find((f) => f.title.includes('"mode"'));
    expect(finding).toBeDefined();
    expect(hypothesis.build(finding!, null, ctxAk1(file, sets, capabilities))).toBeNull();
  });

  /** INTENCIÓN: tampoco confirma una función SIN receptor. Son las 32 muertes
   *  que verifiqué a mano en los tres repos de Go (`cobra.go:118 func Gt(a, b
   *  any)` es el caso testigo: no tiene receptor y la forma no dispara). */
  it("Go: `switch v` dentro de un `func` de nivel superior SIN receptor ⇒ null", async () => {
    const source = `
package main

func Describe(v string) string {
	switch v {
	case "a":
		return "a"
	case "b":
		return "b"
	default:
		return "?"
	}
}

func Icon(v string) string {
	switch v {
	case "a":
		return "1"
	case "b":
		return "2"
	default:
		return "?"
	}
}
`;
    const { file, sets, capabilities, findings } = await goFileAk1(source);
    const finding = findings.find((f) => f.title.includes('"v"'));
    expect(finding).toBeDefined();
    expect(hypothesis.build(finding!, null, ctxAk1(file, sets, capabilities))).toBeNull();
  });

  /** INTENCIÓN: `isShadowedByOwnParameter` va ANTES de confirmar, igual que en
   *  las otras cinco formas — un parámetro homónimo del receptor lo tapa. */
  it("Go: un PARÁMETRO homónimo del receptor sombrea ⇒ null", async () => {
    const source = `
package main

type Kind int

func (k Kind) Name(k2 string, k string) string {
	switch k {
	case 1:
		return "first"
	case 2:
		return "second"
	default:
		return "?"
	}
}

func (k Kind) Icon(k2 string, k string) string {
	switch k {
	case 1:
		return "1"
	case 2:
		return "2"
	default:
		return "?"
	}
}
`;
    const { file, sets, capabilities, findings } = await goFileAk1(source);
    const finding = findings.find((f) => f.title.includes('"k"'));
    expect(finding).toBeDefined();
    expect(hypothesis.build(finding!, null, ctxAk1(file, sets, capabilities))).toBeNull();
  });

  /** INTENCIÓN: una gramática que NO nombra su receptor no cambia de
   *  comportamiento — `receiverNameOf` contesta `null` y el camino queda
   *  exactamente como estaba. La capa por lenguaje traduce, no decide. */
  it("TypeScript: un identificador DESNUDO que no es miembro declarado sigue dando null, igual que antes", async () => {
    const source = `
class Cart {
  price(): number {
    switch (mode) {
      case "pending": return 1;
      case "shipped": return 2;
      default: return 0;
    }
  }
  icon(): number {
    switch (mode) {
      case "pending": return 1;
      case "shipped": return 2;
      default: return 0;
    }
  }
}
`;
    const { file, capabilities, findings } = await runRepeatedSwitch("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript");
    expect(findings.length).toBeGreaterThan(0);
    expect(hypothesis.build(findings[0]!, null, ctxFor(file, capabilities))).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * OLA AN, FRENTE AN2 — LA TRAZA DEL CANAL DE NIVEL 2.
 *
 * QUÉ INTENCIÓN VERIFICAN ESTOS DOS TESTS, y por qué son de TRAZA y no de
 * comportamiento: la pregunta de mecanismo de la Ola AN es *"¿el hecho de
 * NIVEL 2 (`long-function`/`complexity`/`primitive-obsession`) está
 * DISPONIBLE en el punto donde la hipótesis de State se evalúa?"*. La
 * respuesta se mide con `n2OfKind`/`n2InFile`/`n2AtSymbol`, tres campos de la
 * traza. Estos tests fijan que esos campos LEEN EL VECINDARIO DE VERDAD: con
 * `EMPTY_NEIGHBORHOOD` (la pasada 1, `analyzeFile`) salen en cero, y con un
 * vecindario que trae hallazgos de nivel 2 (la pasada con grafo,
 * `rebuildHypothesesWithGraph`) salen con el número real. Sin ellos, un
 * chequeo que leyera el vecindario acá podría ser INERTE sin que nadie lo
 * notara — que es exactamente la trampa que la Ola AN nombró.
 *
 * NINGUNO DE LOS DOS TOCA UN `required`, UN UMBRAL NI `appliedState`: el
 * veredicto de la hipótesis es el mismo con la traza prendida y apagada.
 * ──────────────────────────────────────────────────────────────────────── */
describe("AN2 — el vecindario del NIVEL 2, medido en la traza", () => {
  const TS_PROBE_AN2 = `
class Probe {
  status: string;
  handler: Probe;
  describe(kind: string): string {
    switch (kind) {
      case "a": return "a";
      case "b": return "b";
      default: return "z";
    }
  }
}
`;
  const FUENTE = `
class Cart {
  status: string;
  price(): number {
    switch (this.status) {
      case "pending": return 1;
      case "shipped": return 2;
      default: return 0;
    }
  }
  icon(): number {
    switch (this.status) {
      case "pending": return 1;
      case "shipped": return 2;
      default: return 0;
    }
  }
}
`;

  async function armar() {
    const sets = await nodeSetsFor("tree-sitter-typescript.wasm", TS_PROBE_AN2);
    const probeRoot = await parseRoot("tree-sitter-typescript.wasm", TS_PROBE_AN2);
    const capabilities = deriveCapabilities(probeRoot, sets);
    const root = await parseRoot("tree-sitter-typescript.wasm", FUENTE);
    const file = fileUnitFrom(root, sets, "typescript");
    const raw = repeatedSwitchDetector.run(file, testContext(repeatedSwitchDetector, "typescript"));
    const findings = raw.map((r) => toFinding(r, "typescript"));
    return { file, sets, capabilities, findings };
  }

  /** Un `Finding` de NIVEL 2 en el MISMO archivo — la forma exacta que `findingsInFile` devuelve. */
  function nivel2(kind: string, file: string, id: string): Finding {
    return {
      id,
      detectorId: kind,
      kind,
      scope: "intra-function",
      language: "typescript",
      title: `hallazgo de nivel 2 (${kind})`,
      severity: 1,
      locations: [{ file, startLine: 1, endLine: 40, symbol: "price" }],
      trigger: [],
      evidence: [],
    } as unknown as Finding;
  }

  it("PASADA 1 (`EMPTY_NEIGHBORHOOD`): los tres kinds de nivel 2 salen en CERO — es la fila que prueba que el chequeo sería inerte ahí", async () => {
    const { file, capabilities, findings } = await armar();
    expect(findings.length).toBeGreaterThan(0);
    startStateTrace();
    hypothesis.build(findings[0]!, null, ctxFor(file, capabilities));
    const traza = takeStateTrace();
    expect(traza).toHaveLength(1);
    for (const k of ["long-function", "complexity", "primitive-obsession"]) {
      expect(traza[0]!.n2OfKind[k]).toBe(0);
      expect(traza[0]!.n2InFile[k]).toBe(0);
      expect(traza[0]!.n2AtSymbol[k]).toBe(0);
    }
  });

  it("PASADA CON GRAFO (vecindario real): `n2OfKind` y `n2InFile` traen el número REAL — el canal llega vivo y un chequeo que lo lea NO sería inerte", async () => {
    const { file, sets, capabilities, findings } = await armar();
    const self = findings[0]!;
    const peers = [nivel2("long-function", file.path, "lf-1"), nivel2("complexity", file.path, "cx-1")];
    const ctx: HypothesisContext = {
      file,
      fileAt: () => null,
      repo: FAKE_REPO,
      capabilities: capabilities as HypothesisContext["capabilities"],
      setsFor: () => sets,
      neighborhood: {
        ...EMPTY_NEIGHBORHOOD,
        findingsInFile: (f: string) => (f === file.path ? peers : []),
        countOfKind: (k: string) => peers.filter((p) => p.kind === k).length,
      },
      branches: () => null,
    };
    startStateTrace();
    hypothesis.build(self, null, ctx);
    const traza = takeStateTrace();
    expect(traza).toHaveLength(1);
    expect(traza[0]!.n2OfKind["long-function"]).toBe(1);
    expect(traza[0]!.n2OfKind["complexity"]).toBe(1);
    expect(traza[0]!.n2InFile["long-function"]).toBe(1);
    expect(traza[0]!.n2InFile["complexity"]).toBe(1);
    expect(traza[0]!.n2OfKind["primitive-obsession"]).toBe(0);
    // `findingsAtSymbol` NO une el ancla de State con la de nivel 2: el ancla de un
    // `temporary-field`/`repeated-switch` y la de un `long-function` son símbolos
    // distintos por construcción. Medido sobre el corpus y fijado acá.
    expect(traza[0]!.n2AtSymbol["long-function"]).toBe(0);
  });

  it("la traza NO cambia el veredicto: prendida y apagada, `build` devuelve lo mismo", async () => {
    const { file, capabilities, findings } = await armar();
    const ctx = ctxFor(file, capabilities);
    const sinTraza = hypothesis.build(findings[0]!, null, ctx);
    startStateTrace();
    const conTraza = hypothesis.build(findings[0]!, null, ctx);
    takeStateTrace();
    expect(JSON.stringify(conTraza)).toBe(JSON.stringify(sinTraza));
  });
});
