import { describe, expect, it } from "vitest";

import { fileUnitFrom, nodeSetsFor, parseRoot } from "../detect/testing.js";
import { pisoDeclarado, resolveThreshold } from "../detect/thresholds.js";
import type { AstNode, FileUnit, Finding, RepoUnit } from "../detect/types.js";
import { EMPTY_NEIGHBORHOOD } from "../graph/neighborhood.js";
import type { CodeGraph, CodeGraphEdge, CodeGraphNode } from "../graph/types.js";
import { hypothesis as observer } from "./observer.js";
import type { HypothesisContext } from "./types.js";

/* ────────────────────────────────────────────────────────────────────────
 * Arnés — mismo idioma que `strategy.test.ts`: `Finding` sintético (el
 * detector `manual-notification` no corre acá; ver su propio test) +
 * `HypothesisContext` con `ctx.file` REAL cuando el caso lo necesita.
 * ──────────────────────────────────────────────────────────────────────── */

function measurement(value: number) {
  return {
    label: "miembros distintos que notifican a mano",
    value,
    threshold: resolveThreshold(pisoDeclarado(2, { rationale: "test" }), { language: "javascript", sampleSize: () => 0, corpusP95: () => null }),
  };
}

function manualNotificationFinding(className: string, methodName: string, file: string, overrides: Partial<Finding> = {}): Finding {
  return {
    id: `f-${className}-${methodName}`,
    detectorId: "manual-notification",
    kind: "manual-notification",
    scope: "intra-file",
    language: "javascript",
    title: `\`${className}\` notifica a sus colaboradores a mano en 2 miembros distintos`,
    detail: "detalle",
    trigger: [measurement(2)],
    locations: [
      { file, startLine: 1, endLine: 5, symbol: methodName, anchor: { file, symbolPath: [className, methodName] }, role: "notificador 1 de 2" },
      { file, startLine: 7, endLine: 11, symbol: `${methodName}2`, anchor: { file, symbolPath: [className, `${methodName}2`] }, role: "notificador 2 de 2" },
    ],
    severity: 60,
    advice: { primary: { name: "Replace hard-wired notifications with Observer", kind: "refactorizacion", why: "w", source: "https://x.test" } },
    ...overrides,
  };
}

function contextFor(file: FileUnit | null, graph: CodeGraph | null = null): HypothesisContext {
  const repo: RepoUnit = { repoName: "fixture", files: [], functions: [], clones: [], graph };
  return {
    file,
    fileAt: (path) => (file && file.path === path ? file : null),
    repo,
    capabilities: new Set(),
    setsFor: () => (file ? file.sets : EMPTY_NODE_SETS),
    neighborhood: EMPTY_NEIGHBORHOOD,
    branches: () => null,
  };
}

const EMPTY_NODE_SETS = {
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

const JS_PROBE = "class Probe { method(x) { return x; } }\nfunction probeFn(x) { for (const y of x) { y.z(); } return x; }\n";
const PYTHON_PROBE = "class Probe:\n    def method(self, x):\n        for y in x:\n            y.z()\n        return x\n";
const RUBY_PROBE = "class Probe\n  def method(x)\n    x.each { |y| y.z }\n  end\nend\n";
const GO_PROBE = "package p\ntype T struct{ x []int }\nfunc (t *T) Method(x int) int {\n\tfor _, y := range t.x {\n\t\t_ = y\n\t}\n\treturn x\n}\n";

async function realFile(wasm: string, probe: string, language: string, source: string, path = `fixture.${language}`): Promise<FileUnit> {
  const sets = await nodeSetsFor(wasm, probe);
  const root = await parseRoot(wasm, source);
  return fileUnitFrom(root, sets, language, { file: path });
}

describe("observer — declaración", () => {
  /**
   * OLA AE (AE11): el array SUMA `hard-wired-notification` y CONSERVA
   * `manual-notification`. El ancla vieja se deja EXACTAMENTE donde estaba
   * aunque esté medido que emite **CERO hallazgos en las dos poblaciones**
   * (13 bibliotecas + 8 aplicaciones, 21 repos) y que por lo tanto Observer
   * tenía **CERO hipótesis** antes de esta ola: la ola es ADITIVA, el número se
   * publica y el ancla no se toca.
   */
  it("id, pattern, anchors — el array SUMA el ancla-fuerza y CONSERVA la vieja", () => {
    expect(observer.id).toBe("observer");
    expect(observer.pattern).toBe("Observer");
    expect(observer.anchors).toEqual(["manual-notification", "hard-wired-notification"]);
  });

  it("required: menos de 2 notificadores ⇒ no hay hipótesis (null)", () => {
    const finding = manualNotificationFinding("Subject", "notify", "fixture.javascript", { trigger: [measurement(1)] });
    const h = observer.build(finding, null, contextFor(null));
    expect(h).toBeNull();
  });
});

describe("observer — COMPLETA ⇒ ya-aplicado (nunca sugerencia, requisito 1)", () => {
  it("TypeScript: `attach` reenvía su parámetro a `this.observers`, `notifyAll` recorre-e-invoca ⇒ ya-aplicado", async () => {
    const source = `
class Subject {
  observers = [];
  attach(observer) {
    this.observers.push(observer);
  }
  notifyAll(event) {
    for (const observer of this.observers) {
      observer.update(event);
    }
  }
}
`;
    const file = await realFile("tree-sitter-typescript.wasm", JS_PROBE, "typescript", source);
    const finding = manualNotificationFinding("Subject", "attach", file.path);
    const h = observer.build(finding, null, contextFor(file));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ya-aplicado");
    expect(h!.confidence).toBeNull();
    expect(h!.checks.some((c) => c.label === "par-suscriptor-notificador-completo")).toBe(true);
  });

  it("Python: misma forma (`for observer in self.observers`)", async () => {
    const source = `
class Subject:
    def __init__(self):
        self.observers = []
    def attach(self, observer):
        self.observers.append(observer)
    def notify_all(self, event):
        for observer in self.observers:
            observer.update(event)
`;
    const file = await realFile("tree-sitter-python.wasm", PYTHON_PROBE, "python", source);
    const finding = manualNotificationFinding("Subject", "attach", file.path);
    const h = observer.build(finding, null, contextFor(file));
    expect(h!.state).toBe("ya-aplicado");
  });

  it("Ruby: `@observers.each { |observer| observer.update(event) }` (llamada-con-bloque, sin nodo de bucle dedicado)", async () => {
    const source = `
class Subject
  def initialize
    @observers = []
  end
  def attach(observer)
    @observers << observer
  end
  def notify_all(event)
    @observers.each { |observer| observer.update(event) }
  end
end
`;
    const file = await realFile("tree-sitter-ruby.wasm", RUBY_PROBE, "ruby", source);
    const finding = manualNotificationFinding("Subject", "attach", file.path);
    const h = observer.build(finding, null, contextFor(file));
    expect(h!.state).toBe("ya-aplicado");
  });

  it("Go: `append(s.observers, o)` (builtin, no método) + `for _, o := range s.observers`", async () => {
    const source = `
package events

type Subject struct {
	observers []Observer
}

func (s *Subject) Attach(o Observer) {
	s.observers = append(s.observers, o)
}

func (s *Subject) NotifyAll(event string) {
	for _, observer := range s.observers {
		observer.Update(event)
	}
}
`;
    const file = await realFile("tree-sitter-go.wasm", GO_PROBE, "go", source);
    const finding = manualNotificationFinding("Subject", "Attach", file.path);
    const h = observer.build(finding, null, contextFor(file));
    expect(h!.state).toBe("ya-aplicado");
  });
});

describe("observer — PARCIAL", () => {
  it("AST: sólo el suscriptor existe (push sin recorrido-e-invocación en ningún lado) ⇒ parcial", async () => {
    const source = `
class Subject {
  observers = [];
  attach(observer) {
    this.observers.push(observer);
  }
  size() {
    return this.observers.length;
  }
}
`;
    const file = await realFile("tree-sitter-typescript.wasm", JS_PROBE, "typescript", source);
    const finding = manualNotificationFinding("Subject", "attach", file.path);
    const h = observer.build(finding, null, contextFor(file));
    expect(h!.state).toBe("parcial");
    expect(h!.checks.some((c) => c.label === "mitad-de-la-pareja-existente")).toBe(true);
  });

  it("AST: sólo el notificador existe (recorre-e-invoca, pero ningún miembro reenvía un parámetro al campo) ⇒ parcial", async () => {
    const source = `
class Subject {
  observers = SOME_GLOBAL_LIST;
  notifyAll(event) {
    for (const observer of this.observers) {
      observer.update(event);
    }
  }
}
`;
    const file = await realFile("tree-sitter-typescript.wasm", JS_PROBE, "typescript", source);
    const finding = manualNotificationFinding("Subject", "notifyAll", file.path);
    const h = observer.build(finding, null, contextFor(file));
    expect(h!.state).toBe("parcial");
  });

  it("GRAFO: portador con carries fan-in >=2 + invokes-indirect (CONTRATO-F9.md §3.5) ⇒ parcial, aun sin ctx.file", () => {
    const file = "fixture.javascript";
    const carrierId = "carrier:fixture.javascript#Subject.observers@0";
    const nodes: CodeGraphNode[] = [
      { id: carrierId, kind: "carrier", file, symbolPath: ["Subject", "observers"], carrierForm: "collection-element" },
      { id: "sym:fixture.javascript#<anon@0>", kind: "symbol", file, symbolPath: ["Subject", "<anon@0>"], family: "function-like" },
      { id: "sym:fixture.javascript#<anon@1>", kind: "symbol", file, symbolPath: ["Subject", "<anon@1>"], family: "function-like" },
      { id: "sym:fixture.javascript#Subject.notifyAll", kind: "symbol", file, symbolPath: ["Subject", "notifyAll"], family: "function-like" },
    ];
    const edges: CodeGraphEdge[] = [
      { from: carrierId, to: "sym:fixture.javascript#<anon@0>", kind: "carries", provenance: "declared", weight: 1 },
      { from: carrierId, to: "sym:fixture.javascript#<anon@1>", kind: "carries", provenance: "declared", weight: 1 },
      { from: "sym:fixture.javascript#Subject.notifyAll", to: carrierId, kind: "invokes-indirect", provenance: "inferred", weight: 1 },
    ];
    const graph: CodeGraph = { nodes, edges, resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: {} } as never };
    const finding = manualNotificationFinding("Subject", "notifyAll", file);
    const h = observer.build(finding, graph, contextFor(null, graph));
    expect(h!.state).toBe("parcial");
    expect(h!.checks.some((c) => c.label === "portador-ad-hoc-existente")).toBe(true);
  });
});

describe("observer — AUSENTE", () => {
  it("sin árbol ni grafo ⇒ ausente, conservador", () => {
    const finding = manualNotificationFinding("Subject", "notify", "fixture.javascript");
    const h = observer.build(finding, null, contextFor(null));
    expect(h!.state).toBe("ausente");
    expect(h!.confidence).not.toBeNull();
  });

  it("con árbol vivo pero sin ninguna maquinaria genérica cerca ⇒ ausente", async () => {
    const source = `
class Subject {
  onCreate(event) {
    this.emailObserver.onChange(event);
    this.smsObserver.onChange(event);
  }
  onDelete(event) {
    this.emailObserver.onChange(event);
    this.smsObserver.onChange(event);
  }
}
`;
    const file = await realFile("tree-sitter-typescript.wasm", JS_PROBE, "typescript", source);
    const finding = manualNotificationFinding("Subject", "onCreate", file.path);
    const h = observer.build(finding, null, contextFor(file));
    expect(h!.state).toBe("ausente");
  });
});

describe("observer — discriminador", () => {
  it("3 o más notificadores confirma el discriminador 'fuerte'", () => {
    const finding = manualNotificationFinding("Subject", "notify", "fixture.javascript", { trigger: [measurement(3)] });
    const h = observer.build(finding, null, contextFor(null));
    const d = h!.discriminators.find((c) => c.label.includes("más fuerte"));
    expect(d?.passed).toBe(true);
  });
});

describe("observer — Ola 11: refresh() (registro de pendientes §B1, CERO consumo → 2 mecanismos nuevos)", () => {
  it("portador-ad-hoc-confirmado-por-grafo: build() con graph=null lo deja en falso (Observer era el ÚNICO archivo sin ningún consumo, ver el docstring del módulo); refresh() con el grafo real (`carries`+`invokes-indirect`, CONTRATO-F9.md §3.5) lo confirma SIN tocar `state`", () => {
    const file = "fixture.javascript";
    const carrierId = "carrier:fixture.javascript#Subject.observers@0";
    const nodes: CodeGraphNode[] = [
      { id: carrierId, kind: "carrier", file, symbolPath: ["Subject", "observers"], carrierForm: "collection-element" },
      { id: "sym:fixture.javascript#<anon@0>", kind: "symbol", file, symbolPath: ["Subject", "<anon@0>"], family: "function-like" },
      { id: "sym:fixture.javascript#<anon@1>", kind: "symbol", file, symbolPath: ["Subject", "<anon@1>"], family: "function-like" },
      { id: "sym:fixture.javascript#Subject.notifyAll", kind: "symbol", file, symbolPath: ["Subject", "notifyAll"], family: "function-like" },
    ];
    const edges: CodeGraphEdge[] = [
      { from: carrierId, to: "sym:fixture.javascript#<anon@0>", kind: "carries", provenance: "declared", weight: 1 },
      { from: carrierId, to: "sym:fixture.javascript#<anon@1>", kind: "carries", provenance: "declared", weight: 1 },
      { from: "sym:fixture.javascript#Subject.notifyAll", to: carrierId, kind: "invokes-indirect", provenance: "inferred", weight: 1 },
    ];
    const graph: CodeGraph = { nodes, edges, resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: {} } as never };
    const finding = manualNotificationFinding("Subject", "notifyAll", file);

    // build() en producción SIEMPRE ve graph=null para este ancla intra-file (docstring del módulo).
    const built = observer.build(finding, null, contextFor(null))!;
    expect(built.state).toBe("ausente");
    const before = built.discriminators.find((d) => d.label.includes("confirma un portador ad hoc"));
    expect(before).toBeDefined();
    expect(before!.passed).toBe(false);

    // refresh() (Ola 10, crossAnalyze) SÍ recibe el grafo real.
    const refreshed = observer.refresh!(built, finding, graph, contextFor(null, graph))!;
    expect(refreshed).not.toBeNull();
    expect(refreshed.state).toBe("ausente"); // NUNCA se promueve a 'parcial' vía refresh() — prohibido por contrato.
    const after = refreshed.discriminators.find((d) => d.label.includes("confirma un portador ad hoc"));
    expect(after!.passed).toBe(true);
    expect(after!.why).toMatch(/registro de pendientes §B1/);
  });

  it("vecindario-muestra-patron-repetido: build() con EMPTY_NEIGHBORHOOD lo deja en falso; refresh() con ctx.neighborhood.countOfKind('manual-notification') > 0 lo confirma", () => {
    const finding = manualNotificationFinding("Subject", "notify", "fixture.javascript");
    const built = observer.build(finding, null, contextFor(null))!;
    expect(built.state).toBe("ausente");
    const before = built.discriminators.find((d) => d.label.includes("aparece en OTROS archivos"));
    expect(before!.passed).toBe(false);

    const refreshCtx: HypothesisContext = { ...contextFor(null), neighborhood: { ...EMPTY_NEIGHBORHOOD, countOfKind: () => 4 } };
    const refreshed = observer.refresh!(built, finding, null, refreshCtx)!;
    expect(refreshed).not.toBeNull();
    expect(refreshed.state).toBe("ausente");
    const after = refreshed.discriminators.find((d) => d.label.includes("aparece en OTROS archivos"));
    expect(after!.passed).toBe(true);
    expect(after!.why).toMatch(/4 hallazgo\(s\) más/);
  });

  it("hipótesis 'ya-aplicado' no compite por confianza: refresh() no la toca (devuelve null)", async () => {
    const source = `
class Subject {
  observers = [];
  attach(observer) {
    this.observers.push(observer);
  }
  notifyAll(evt) {
    for (const o of this.observers) o.update(evt);
  }
}
`;
    const file = await realFile("tree-sitter-typescript.wasm", JS_PROBE, "typescript", source);
    const finding = manualNotificationFinding("Subject", "notifyAll", file.path);
    const built = observer.build(finding, null, contextFor(file))!;
    expect(built.state).toBe("ya-aplicado");
    expect(observer.refresh!(built, finding, null, contextFor(null))).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * OLA AE (AE11) — EL CAMINO DE ENTRADA DEL ANCLA-FUERZA `hard-wired-notification`.
 *
 * Camino PROPIO: los tests de arriba (el camino de `manual-notification`) NO se
 * tocaron y siguen verdes — ésa es la mitad de la prueba de que la ola es
 * aditiva; la otra mitad es que Observer tenía CERO hipótesis antes, así que no
 * había ninguna propuesta verdadera que perder.
 * ══════════════════════════════════════════════════════════════════════════ */

function hardWiredFinding(className: string, file: string, places = 2, targets = 3, distinctMethodNames = 3): Finding {
  const th = resolveThreshold(pisoDeclarado(3, { rationale: "test" }), { language: "javascript", sampleSize: () => 0, corpusP95: () => null });
  return {
    id: `hw-${className}`,
    detectorId: "hard-wired-notification",
    kind: "hard-wired-notification",
    scope: "intra-file",
    language: "javascript",
    title: `\`${className}\` avisa a los mismos ${targets} interesados a mano, desde ${places} puntos de cambio`,
    detail: "detalle",
    trigger: [
      { label: "puntos de cambio que repiten el mismo listado", value: places, threshold: th },
      { label: "interesados nombrados uno por uno", value: targets, threshold: th },
    ],
    evidence: [{ label: "nombres de método distintos entre los avisos", value: distinctMethodNames }],
    locations: [
      { file, startLine: 1, endLine: 5, symbol: "close", anchor: { file, symbolPath: [className, "close"] }, role: "punto de cambio 1 de 2" },
      { file, startLine: 7, endLine: 11, symbol: "reopen", anchor: { file, symbolPath: [className, "reopen"] }, role: "punto de cambio 2 de 2" },
    ],
    severity: 60,
    advice: { primary: { name: "Introduce Observer for hard-wired notifications", kind: "refactorizacion", why: "w", source: "https://x.test" } },
  };
}

describe("observer — el ancla-fuerza `hard-wired-notification` (Ola AE, AE11)", () => {
  it("sin ninguna maquinaria genérica en el dueño ⇒ `ausente` — EL ESTADO QUE ESTE PATRÓN NUNCA PUDO PRODUCIR", async () => {
    const source = `
class Order {
  close(e) { this.status = 1; this.mailer.send(e); this.audit.record(e); this.metrics.increment(e); }
  reopen(e) { this.status = 2; this.mailer.send(e); this.audit.record(e); this.metrics.increment(e); }
}
`;
    const file = await realFile("tree-sitter-typescript.wasm", JS_PROBE, "typescript", source);
    const h = observer.build(hardWiredFinding("Order", file.path), null, contextFor(file));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
  });

  it("media maquinaria INEQUÍVOCA (ya hay un recorrido genérico, sin la mitad que suscribe) ⇒ `parcial`", async () => {
    const source = `
class Order {
  broadcast(e) { for (const h of this.hooks) h.run(e); }
  close(e) { this.status = 1; this.mailer.send(e); this.audit.record(e); this.metrics.increment(e); }
  reopen(e) { this.status = 2; this.mailer.send(e); this.audit.record(e); this.metrics.increment(e); }
}
`;
    const file = await realFile("tree-sitter-typescript.wasm", JS_PROBE, "typescript", source);
    const h = observer.build(hardWiredFinding("Order", file.path), null, contextFor(file));
    expect(h!.state).toBe("parcial");
  });

  it("la pareja COMPLETA ⇒ el `required` de resolución NO pasa y no hay hipótesis (el detector, además, ya se calló antes)", async () => {
    const source = `
class Order {
  subscribe(observer) { this.observers.push(observer); }
  notifyAll(e) { for (const o of this.observers) o.update(e); }
  close(e) { this.status = 1; this.mailer.send(e); this.audit.record(e); this.metrics.increment(e); }
  reopen(e) { this.status = 2; this.mailer.send(e); this.audit.record(e); this.metrics.increment(e); }
}
`;
    const file = await realFile("tree-sitter-typescript.wasm", JS_PROBE, "typescript", source);
    expect(observer.build(hardWiredFinding("Order", file.path), null, contextFor(file))).toBeNull();
  });

  it("un solo punto de cambio ⇒ el `required` de repetición no pasa ⇒ null", async () => {
    const source = "class Order { close(e) { this.status = 1; this.a.x(e); this.b.y(e); this.c.z(e); } }\n";
    const file = await realFile("tree-sitter-typescript.wasm", JS_PROBE, "typescript", source);
    expect(observer.build(hardWiredFinding("Order", file.path, 1), null, contextFor(file))).toBeNull();
  });

  it("dos destinatarios (par fijo) ⇒ el `required` de escala no pasa ⇒ null", async () => {
    const source = "class Order { close(e) { this.status = 1; this.a.x(e); this.b.y(e); } reopen(e) { this.status = 2; this.a.x(e); this.b.y(e); } }\n";
    const file = await realFile("tree-sitter-typescript.wasm", JS_PROBE, "typescript", source);
    expect(observer.build(hardWiredFinding("Order", file.path, 2, 2), null, contextFor(file))).toBeNull();
  });

  it("SIN árbol vivo el `required` de resolución NO aprueba por no poder mirar ⇒ null", () => {
    expect(observer.build(hardWiredFinding("Order", "fixture.javascript"), null, contextFor(null))).toBeNull();
  });

  it("el camino VIEJO sigue intacto: un hallazgo de `manual-notification` se construye como siempre", async () => {
    const source = `
class Subject {
  observers = [];
  attach(observer) { this.observers.push(observer); }
  notifyAll(evt) { for (const o of this.observers) o.update(evt); }
}
`;
    const file = await realFile("tree-sitter-typescript.wasm", JS_PROBE, "typescript", source);
    const built = observer.build(manualNotificationFinding("Subject", "notifyAll", file.path), null, contextFor(file));
    expect(built!.state).toBe("ya-aplicado");
  });
});
