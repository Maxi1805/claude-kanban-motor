import { describe, expect, it } from "vitest";

import { hypothesis } from "./command.js";
import type { HypothesisContext } from "./types.js";
import { pisoDeclarado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import type { CloneCandidate, FileUnit, Finding, RepoUnit, RoleLocation } from "../detect/types.js";
import { buildNeighborhoodIndex, EMPTY_NEIGHBORHOOD, neighborhoodFor } from "../graph/neighborhood.js";
import { carrierNodeId, symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode } from "../graph/types.js";

function fakeThreshold(): Threshold {
  return resolveThreshold(pisoDeclarado(2, { rationale: "test" }), {
    language: "typescript",
    sampleSize: () => 0,
    corpusP95: () => null,
  });
}

function loc(file: string, startLine: number, endLine: number, role = "copia"): RoleLocation {
  return { file, startLine, endLine, role };
}

function fakeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "f1",
    detectorId: "duplication",
    kind: "duplication",
    scope: "inter-file",
    language: "typescript",
    title: "t",
    detail: "d",
    trigger: [{ label: "copias", value: 2, threshold: fakeThreshold() }],
    locations: [loc("a.ts", 1, 5), loc("b.ts", 1, 5)],
    severity: 50,
    advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
    ...overrides,
  };
}

function fakeClone(overrides: Partial<CloneCandidate> = {}): CloneCandidate {
  return {
    fingerprint: "fp1",
    file: "a.ts",
    startLine: 1,
    endLine: 5,
    nodes: 20,
    type: "method_definition",
    functionName: null,
    className: null,
    superclassName: null,
    normalized: "",
    ...overrides,
  };
}

function fakeRepo(overrides: Partial<RepoUnit> = {}): RepoUnit {
  return { repoName: "r", files: [], functions: [], clones: [], graph: null, ...overrides };
}

function fakeCtx(
  repo: RepoUnit,
  capabilities: HypothesisContext["capabilities"] = new Set(),
  neighborhood: HypothesisContext["neighborhood"] = EMPTY_NEIGHBORHOOD,
): HypothesisContext {
  return {
    file: null,
    fileAt: () => null,
    repo,
    capabilities,
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
    neighborhood,
    branches: () => null,
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * Fixtures de grafo — mismo estilo que `wrapping-chain.test.ts`: grafos
 * sintéticos mínimos, uno por escenario.
 * ──────────────────────────────────────────────────────────────────────── */
const EMPTY_RESOLUTION = { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] };

function sym(file: string, symbolPath: readonly string[], overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return { id: symbolNodeId(file, symbolPath), kind: "symbol", file, symbolPath, family: "class-like", ...overrides };
}

function method(file: string, ownerPath: string, name: string, arity: number, overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return sym(file, [ownerPath, name], { family: "function-like", arity, ...overrides });
}

/** Nodo símbolo de un manejador de nivel superior (el que ve `nodeForClone` por archivo+nombre+línea). */
function handlerNode(file: string, name: string, startLine: number, arity: number | null, overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return sym(file, [name], { family: "function-like", arity, startLine, ...overrides });
}

function carrier(file: string, symbolPath: readonly string[], overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return { id: carrierNodeId(file, symbolPath, 0), kind: "carrier", file, symbolPath, carrierForm: "collection-element", ...overrides };
}

function edge(from: string, to: string, kind: CodeGraphEdge["kind"], overrides: Partial<CodeGraphEdge> = {}): CodeGraphEdge {
  return { from, to, kind, provenance: "resolved", weight: 1, ...overrides };
}

function containsAll(ownerId: string, memberIds: readonly string[]): CodeGraphEdge[] {
  return memberIds.map((m) => edge(ownerId, m, "contains"));
}

function graphOf(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): CodeGraph {
  return { nodes, edges, resolution: EMPTY_RESOLUTION };
}

describe("hypotheses/command", () => {
  /**
   * OLA AE (frente AE6): el array SUMÓ el ancla-fuerza y conservó las dos
   * viejas — 48 hipótesis en las dos poblaciones con `ausente` = 0, y de las
   * dos viejas `distributed-duplication` producía CERO.
   *
   * OLA AL (AL1) — SALE `duplication`, con la población COMPLETA juzgada y no
   * una muestra. Sobre el volcado del 21-08, con el 100 % de las
   * recomendaciones vivas juzgadas en las DOS poblaciones (AL1 juzgó las 8 que
   * faltaban abriendo el archivo real): 13 recomendaciones en biblioteca y 15
   * en aplicación, las 28 juzgadas, **0 verdaderas**, y **0 huérfanos de nivel
   * 1** en las dos poblaciones. Confirma lo que el docstring del módulo tenía
   * escrito desde la Ola V: *"el ancla acierta, la hipótesis no"*.
   *
   * `distributed-duplication` y `invariant-scaffold-varying-call` SIGUEN, y
   * este test es el contrato que impide que un frente futuro las saque sin
   * darse cuenta. El `build` queda intacto: `distributed-duplication` recorre
   * el MISMO camino.
   */
  it("declara sus DOS anclas — `distributed-duplication` (vieja, intacta) y el ancla-fuerza de la Ola AE — SIN `duplication`, retirada por AL1 con 0/28 verdaderas", () => {
    expect(hypothesis.id).toBe("command");
    expect(hypothesis.pattern).toBe("Command");
    expect(hypothesis.anchors).toEqual(["distributed-duplication", "invariant-scaffold-varying-call"]);
    expect(hypothesis.anchors).not.toContain("duplication");
  });

  it("required no cumplido (ningún lugar duplicado está ligado a un trigger) ⇒ null", () => {
    const finding = fakeFinding({ locations: [loc("a.ts", 1, 5), loc("b.ts", 1, 5)] });
    const repo = fakeRepo({
      clones: [fakeClone({ file: "a.ts", functionName: "computeTotal" }), fakeClone({ file: "b.ts", functionName: "loadConfig" })],
    });
    expect(hypothesis.build(finding, null, fakeCtx(repo))).toBeNull();
  });

  it("sólo 1 de 2 lugares ligado a trigger (por debajo del mínimo de 2) ⇒ null", () => {
    const finding = fakeFinding({ locations: [loc("a.ts", 1, 5), loc("b.ts", 1, 5)] });
    const repo = fakeRepo({
      clones: [fakeClone({ file: "a.ts", functionName: "onSave" }), fakeClone({ file: "b.ts", functionName: "loadConfig" })],
    });
    expect(hypothesis.build(finding, null, fakeCtx(repo))).toBeNull();
  });

  it("2 manejadores ligados a trigger pero NO todos los lugares del grupo, mismo archivo, sin grafo ⇒ ausente, confidence 'baja' (0 discriminadores)", () => {
    const finding = fakeFinding({
      locations: [loc("a.ts", 1, 5), loc("a.ts", 10, 15), loc("a.ts", 20, 25)],
    });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, functionName: "onSave" }),
        fakeClone({ file: "a.ts", startLine: 10, endLine: 15, functionName: "onClose" }),
        fakeClone({ file: "a.ts", startLine: 20, endLine: 25, functionName: "helperUnrelated" }),
      ],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo))!;
    expect(h).not.toBeNull();
    expect(h.state).toBe("ausente");
    expect(h.confidence).toBe("baja");
    expect(h.ceiling).toBe("alta");
  });

  it("TODOS los lugares ligados a trigger, mismo archivo, sin grafo ⇒ 1 discriminador confirmado, confidence 'media'", () => {
    const finding = fakeFinding({ locations: [loc("a.ts", 1, 5), loc("a.ts", 10, 15)] });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, functionName: "onSave" }),
        fakeClone({ file: "a.ts", startLine: 10, endLine: 15, functionName: "onClose" }),
      ],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo))!;
    expect(h.state).toBe("ausente");
    expect(h.confidence).toBe("media");
  });

  it("TODOS los lugares ligados a trigger EN ARCHIVOS DISTINTOS (botón Copiar + Ctrl+C), sin grafo ⇒ 2 discriminadores, confidence 'alta'", () => {
    const finding = fakeFinding({ locations: [loc("copy-button.ts", 1, 5), loc("keyboard-shortcuts.ts", 40, 44)] });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "copy-button.ts", startLine: 1, endLine: 5, functionName: "onClick" }),
        fakeClone({ file: "keyboard-shortcuts.ts", startLine: 40, endLine: 44, functionName: "handleCopyShortcut" }),
      ],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo))!;
    expect(h.state).toBe("ausente");
    expect(h.confidence).toBe("alta");
    expect(h.places).toHaveLength(2);
    expect(h.places.some((p) => p.file === "copy-button.ts")).toBe(true);
  });

  /* ── "LIGADO A UN DISPARADOR", POR ESTRUCTURA — Ola 11b (D2) ──────────
   * Los tres casos que separan el criterio nuevo del vocabulario viejo
   * (`/click|keypress/`, retirado de esta hipótesis). Sin ellos el mecanismo
   * estructural quedaría construido y nunca ejercitado — el modo de falla que
   * este proyecto ya repitió ocho veces.
   * ──────────────────────────────────────────────────────────────────── */

  it("con grafo: manejadores con nombres que NINGÚN vocabulario de trigger matchea, ENTREGADOS COMO VALOR a un portador REAL (que además recibe invokes-indirect) y nunca llamados por nombre ⇒ required se cumple", () => {
    const a = handlerNode("a.ts", "saveDocument", 1, 1);
    const b = handlerNode("b.ts", "printInvoice", 1, 1);
    const bus = carrier("bus.ts", ["queue"]);
    const dispatcher = handlerNode("main.ts", "dispatch", 1, 0);
    const graph = graphOf(
      [a, b, bus, dispatcher],
      [edge(bus.id, a.id, "carries"), edge(bus.id, b.id, "carries"), edge(dispatcher.id, bus.id, "invokes-indirect")],
    );
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", functionName: "saveDocument" }),
        fakeClone({ file: "b.ts", functionName: "printInvoice" }),
      ],
      graph,
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo))!;
    expect(h).not.toBeNull();
    const required = h.checks.find((c) => c.role === "required" && c.label.startsWith("Al menos 2"))!;
    expect(required.passed).toBe(true);
    expect(required.why).toContain("vía grafo");
  });

  it("Ola V — REGRESIÓN (eslint/keyword-spacing.js:533): ENTREGADOS COMO VALOR al MISMO portador pero SIN invokes-indirect (tabla de despacho de un framework invisible al grafo) ⇒ required NO se cumple, null", () => {
    const a = handlerNode("a.ts", "checkSpacingForForOfStatement", 1, 1);
    const b = handlerNode("b.ts", "checkSpacingForModuleDeclaration", 1, 1);
    const dispatchTable = carrier("rule.ts", ["create-return"]);
    // Mismo portador, mismo fan-in≥2 que el test anterior — la ÚNICA
    // diferencia es que nadie lo invoca indirectamente de forma visible en
    // el grafo (el motor de recorrido de ESLint lo hace, pero eso es
    // invisible al grafo): sin esa evidencia, esto es indistinguible de la
    // tabla de despacho `return { ForOfStatement: ..., ... }` de una regla
    // de ESLint real.
    const graph = graphOf([a, b, dispatchTable], [edge(dispatchTable.id, a.id, "carries"), edge(dispatchTable.id, b.id, "carries")]);
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", functionName: "checkSpacingForForOfStatement" }),
        fakeClone({ file: "b.ts", functionName: "checkSpacingForModuleDeclaration" }),
      ],
      graph,
    });
    expect(hypothesis.build(finding, null, fakeCtx(repo))).toBeNull();
  });

  it("Ola V — REGRESIÓN (eslint/arrow-spacing.js:129): las '2 ubicaciones duplicadas' resuelven al MISMO nodo de función (una sola función citada dos veces) ⇒ NO cuentan como 2 manejadores DISTINTOS, required no se cumple", () => {
    const spaces = handlerNode("arrow-spacing.js", "spaces", 129, 1);
    const bus = carrier("rule.ts", ["dispatch"]);
    const dispatcher = handlerNode("main.ts", "run", 1, 0);
    const graph = graphOf(
      [spaces, bus, dispatcher],
      [edge(bus.id, spaces.id, "carries"), edge(dispatcher.id, bus.id, "invokes-indirect")],
    );
    const finding = fakeFinding({ locations: [loc("arrow-spacing.js", 129, 140), loc("arrow-spacing.js", 156, 167)] });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "arrow-spacing.js", startLine: 129, endLine: 140, functionName: "spaces" }),
        fakeClone({ file: "arrow-spacing.js", startLine: 156, endLine: 167, functionName: "spaces" }),
      ],
      graph,
    });
    expect(hypothesis.build(finding, null, fakeCtx(repo))).toBeNull();
  });

  it("con grafo: nombres que el vocabulario VIEJO aceptaba (`onClick`/`handleKeydown`) pero SIN entrega a ningún portador ⇒ manda el grafo, required NO se cumple", () => {
    const a = handlerNode("a.ts", "onClick", 1, 1);
    const b = handlerNode("b.ts", "handleKeydown", 1, 1);
    const graph = graphOf([a, b], []);
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [fakeClone({ file: "a.ts", functionName: "onClick" }), fakeClone({ file: "b.ts", functionName: "handleKeydown" })],
      graph,
    });
    expect(hypothesis.build(finding, null, fakeCtx(repo))).toBeNull();
  });

  it("con grafo: entregado a un portador PERO además llamado por su nombre ⇒ no es un manejador ligado a un disparador", () => {
    const a = handlerNode("a.ts", "saveDocument", 1, 1);
    const b = handlerNode("b.ts", "printInvoice", 1, 1);
    const bus = carrier("bus.ts", ["queue"]);
    const caller = handlerNode("c.ts", "main", 1, 0);
    const graph = graphOf(
      [a, b, bus, caller],
      [edge(bus.id, a.id, "carries"), edge(bus.id, b.id, "carries"), edge(caller.id, a.id, "calls"), edge(caller.id, b.id, "calls")],
    );
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", functionName: "saveDocument" }),
        fakeClone({ file: "b.ts", functionName: "printInvoice" }),
      ],
      graph,
    });
    expect(hypothesis.build(finding, null, fakeCtx(repo))).toBeNull();
  });

  it("forma en lenguajes sin clases: functionName suelto (sin clase contenedora), sin grafo ⇒ respaldo declarado por nombre de manejador", () => {
    const finding = fakeFinding({ language: "ruby", locations: [loc("a.rb", 1, 5), loc("b.rb", 1, 5)] });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.rb", functionName: "handle_click", className: null }),
        fakeClone({ file: "b.rb", functionName: "on_keypress", className: null }),
      ],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo, new Set()))!;
    expect(h).not.toBeNull();
    expect(h.missingCapabilities).toEqual([]);
  });

  it("needs: [] ⇒ nunca no-aplicable, incluso con capacidades vacías", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [fakeClone({ file: "a.ts", functionName: "onSave" }), fakeClone({ file: "b.ts", functionName: "onClose" })],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo, new Set()))!;
    expect(h.missingCapabilities).toEqual([]);
  });

  it("anchorFindingId cuelga del Finding recibido", () => {
    const finding = fakeFinding({ id: "some-finding-id" });
    const repo = fakeRepo({
      clones: [fakeClone({ file: "a.ts", functionName: "onSave" }), fakeClone({ file: "b.ts", functionName: "onClose" })],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo))!;
    expect(h.anchorFindingId).toBe("some-finding-id");
  });

  it("checks traen why SIEMPRE, también en el excluder que falla", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [fakeClone({ file: "a.ts", functionName: "onSave" }), fakeClone({ file: "b.ts", functionName: "onClose" })],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo))!;
    for (const c of [...h.checks, ...h.discriminators]) {
      expect(c.why.length).toBeGreaterThan(0);
    }
  });

  /* ── EXCLUDER ESTRUCTURAL — reemplaza el vocabulario execute/undo ────── */

  it("excluder ESTRUCTURAL, sin grafo (brecha declarada): ⇒ ausente, nunca 'misma firma' sin confirmarla", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [fakeClone({ file: "a.ts", functionName: "onSave" }), fakeClone({ file: "b.ts", functionName: "onClose" })],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo))!;
    expect(h.state).toBe("ausente");
    const sigCheck = h.checks.find((c) => c.label.startsWith("Firma común"));
    expect(sigCheck?.why).toMatch(/sin grafo|no hay con qué derivar/i);
  });

  it("PARCIAL medido por FIRMA: 2 manejadores con la MISMA aridad, sin interfaz común ni portador que los agrupe", () => {
    const finding = fakeFinding({ locations: [loc("a.ts", 1, 5), loc("b.ts", 1, 5)] });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, functionName: "onSave" }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 5, functionName: "onClose" }),
      ],
    });
    const onSave = handlerNode("a.ts", "onSave", 1, 2);
    const onClose = handlerNode("b.ts", "onClose", 1, 2);
    const graph = graphOf([onSave, onClose], []);
    const h = hypothesis.build(finding, graph, fakeCtx(repo))!;
    expect(h.state).toBe("parcial");
    expect(h.confidence).not.toBeNull();
    const sigCheck = h.checks.find((c) => c.label.startsWith("Firma común"));
    expect(sigCheck?.passed).toBe(true);
    expect(sigCheck?.why).toMatch(/aridad 2/);
  });

  it("AUSENTE con grafo: manejadores de ARIDAD DISTINTA ⇒ no comparten firma", () => {
    const finding = fakeFinding({ locations: [loc("a.ts", 1, 5), loc("b.ts", 1, 5)] });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, functionName: "onSave" }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 5, functionName: "onClose" }),
      ],
    });
    const onSave = handlerNode("a.ts", "onSave", 1, 1);
    const onClose = handlerNode("b.ts", "onClose", 1, 3);
    const graph = graphOf([onSave, onClose], []);
    const h = hypothesis.build(finding, graph, fakeCtx(repo))!;
    expect(h.state).toBe("ausente");
    const sigCheck = h.checks.find((c) => c.label.startsWith("Firma común"));
    expect(sigCheck?.passed).toBe(false);
    expect(sigCheck?.why).toMatch(/aridad distinta/);
  });

  it("AUSENTE con grafo presente pero el nodo del manejador NO se pudo ubicar (declarado, no adivinado)", () => {
    const finding = fakeFinding({ locations: [loc("a.ts", 1, 5), loc("b.ts", 1, 5)] });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, functionName: "onSave" }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 5, functionName: "onClose" }),
      ],
    });
    // Grafo real, pero sin NINGÚN nodo que matchee (archivo, nombre) de los manejadores.
    const unrelated = handlerNode("z.ts", "unrelated", 1, 0);
    const graph = graphOf([unrelated], []);
    const h = hypothesis.build(finding, graph, fakeCtx(repo))!;
    expect(h.state).toBe("ausente");
    const sigCheck = h.checks.find((c) => c.label.startsWith("Firma común"));
    expect(sigCheck?.why).toMatch(/no se pudo ubicar/);
  });

  it("Ola V — un portador agrupa a los ≥2 manejadores (fan-in≥2) pero SIN invokes-indirect ⇒ required NO se cumple, null (antes: 'ausente' — el bug medido en producción)", () => {
    const finding = fakeFinding({ locations: [loc("a.ts", 1, 5), loc("b.ts", 1, 5)] });
    const onSave = handlerNode("a.ts", "onSave", 1, 0);
    const onClose = handlerNode("b.ts", "onClose", 1, 0);
    const table = carrier("dispatch.ts", ["table"]);
    const graph = graphOf([onSave, onClose, table], [edge(table.id, onSave.id, "carries"), edge(table.id, onClose.id, "carries")]);
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, functionName: "onSave" }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 5, functionName: "onClose" }),
      ],
      graph, // repo.graph === graph, como en producción (hypotheses/run.ts#L199).
    });
    expect(hypothesis.build(finding, graph, fakeCtx(repo))).toBeNull();
  });

  it("Ola V — MISMO caso de arriba pero CON invokes-indirect al portador ⇒ required se cumple, misma aridad ⇒ parcial", () => {
    const finding = fakeFinding({ locations: [loc("a.ts", 1, 5), loc("b.ts", 1, 5)] });
    const onSave = handlerNode("a.ts", "onSave", 1, 0);
    const onClose = handlerNode("b.ts", "onClose", 1, 0);
    const table = carrier("dispatch.ts", ["table"]);
    const dispatcher = handlerNode("main.ts", "run", 1, 0);
    const graph = graphOf(
      [onSave, onClose, table, dispatcher],
      [edge(table.id, onSave.id, "carries"), edge(table.id, onClose.id, "carries"), edge(dispatcher.id, table.id, "invokes-indirect")],
    );
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, functionName: "onSave" }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 5, functionName: "onClose" }),
      ],
      graph,
    });
    const h = hypothesis.build(finding, graph, fakeCtx(repo))!;
    expect(h).not.toBeNull();
    expect(h.state).toBe("parcial");
    const sigCheck = h.checks.find((c) => c.label.startsWith("Firma común"));
    expect(sigCheck?.passed).toBe(true);
    expect(sigCheck?.why).toMatch(/aridad 0/);
  });

  /* ── COMPLETA — interfaz + miembro común + invocador ─────────────────── */

  it("YA-APLICADO vía calls directo a sym:I.<miembro> — miembro NUNCA llamado 'execute'/'undo', elegido por estructura", () => {
    const iface = sym("cmds.ts", ["Command"], { family: "namespace-like" });
    const x = sym("cmds.ts", ["SaveCommand"]);
    const y = sym("cmds.ts", ["DeleteCommand"]);
    const iGo = method("cmds.ts", "Command", "go", 0);
    const xGo = method("cmds.ts", "SaveCommand", "go", 0);
    const yGo = method("cmds.ts", "DeleteCommand", "go", 0);
    const runner = sym("runner.ts", ["Runner", "run"], { family: "function-like", arity: 1 });

    const onSave = handlerNode("handlers.ts", "onSave", 1, 0);
    const onClose = handlerNode("handlers.ts", "onClose", 10, 0);

    const graph = graphOf(
      [iface, x, y, iGo, xGo, yGo, runner, onSave, onClose],
      [
        edge(x.id, iface.id, "implements"),
        edge(y.id, iface.id, "implements"),
        ...containsAll(iface.id, [iGo.id]),
        ...containsAll(x.id, [xGo.id]),
        ...containsAll(y.id, [yGo.id]),
        edge(runner.id, iGo.id, "calls"),
        edge(onSave.id, xGo.id, "calls"),
        edge(onClose.id, yGo.id, "calls"),
      ],
    );

    const finding = fakeFinding({ locations: [loc("handlers.ts", 1, 5), loc("handlers.ts", 10, 15)] });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "handlers.ts", startLine: 1, endLine: 5, functionName: "onSave" }),
        fakeClone({ file: "handlers.ts", startLine: 10, endLine: 15, functionName: "onClose" }),
      ],
    });

    const h = hypothesis.build(finding, graph, fakeCtx(repo))!;
    expect(h.state).toBe("ya-aplicado");
    expect(h.confidence).toBeNull();
    const existsCheck = h.checks.find((c) => c.label.startsWith("Existe una interfaz"));
    expect(existsCheck?.passed).toBe(true);
    expect(existsCheck?.why).toContain("go");
    expect(existsCheck?.why).not.toMatch(/execute|undo/i);
  });

  it("APLICADO-ELUDIDO: la abstracción existe (interfaz+invocador) pero ESTE hallazgo la puentea", () => {
    const iface = sym("cmds.ts", ["Command"], { family: "namespace-like" });
    const x = sym("cmds.ts", ["SaveCommand"]);
    const y = sym("cmds.ts", ["DeleteCommand"]);
    const iGo = method("cmds.ts", "Command", "go", 0);
    const xGo = method("cmds.ts", "SaveCommand", "go", 0);
    const yGo = method("cmds.ts", "DeleteCommand", "go", 0);
    const runner = sym("runner.ts", ["Runner", "run"], { family: "function-like", arity: 1 });

    // Los manejadores de ESTE hallazgo NO llaman a ningún miembro de la abstracción.
    const onSave = handlerNode("handlers.ts", "onSave", 1, 0);
    const onClose = handlerNode("handlers.ts", "onClose", 10, 0);
    const somethingElse = sym("handlers.ts", ["unrelated"], { family: "function-like", arity: 0 });

    const graph = graphOf(
      [iface, x, y, iGo, xGo, yGo, runner, onSave, onClose, somethingElse],
      [
        edge(x.id, iface.id, "implements"),
        edge(y.id, iface.id, "implements"),
        ...containsAll(iface.id, [iGo.id]),
        ...containsAll(x.id, [xGo.id]),
        ...containsAll(y.id, [yGo.id]),
        edge(runner.id, iGo.id, "calls"),
        edge(onSave.id, somethingElse.id, "calls"),
        edge(onClose.id, somethingElse.id, "calls"),
      ],
    );

    const finding = fakeFinding({ locations: [loc("handlers.ts", 1, 5), loc("handlers.ts", 10, 15)] });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "handlers.ts", startLine: 1, endLine: 5, functionName: "onSave" }),
        fakeClone({ file: "handlers.ts", startLine: 10, endLine: 15, functionName: "onClose" }),
      ],
    });

    const h = hypothesis.build(finding, graph, fakeCtx(repo))!;
    expect(h.state).toBe("aplicado-eludido");
    expect(h.confidence).toBeNull();
    const bypassCheck = h.checks.find((c) => c.label.startsWith("Los manejadores duplicados"));
    expect(bypassCheck?.passed).toBe(false);
  });

  it("YA-APLICADO vía PORTADOR (carries fan-in≥2 + invokes-indirect≥1) — 'la lista/cola de comandos', sin calls directo a la interfaz", () => {
    const iface = sym("cmds.ts", ["Command"], { family: "namespace-like" });
    const x = sym("cmds.ts", ["SaveCommand"]);
    const y = sym("cmds.ts", ["DeleteCommand"]);
    const xGo = method("cmds.ts", "SaveCommand", "go", 0);
    const yGo = method("cmds.ts", "DeleteCommand", "go", 0);
    const queue = carrier("queue.ts", ["commandQueue"]);

    const onSave = handlerNode("handlers.ts", "onSave", 1, 0);
    const onClose = handlerNode("handlers.ts", "onClose", 10, 0);

    const graph = graphOf(
      [iface, x, y, xGo, yGo, queue, onSave, onClose],
      [
        edge(x.id, iface.id, "implements"),
        edge(y.id, iface.id, "implements"),
        ...containsAll(x.id, [xGo.id]),
        ...containsAll(y.id, [yGo.id]),
        edge(queue.id, xGo.id, "carries"),
        edge(queue.id, yGo.id, "carries"),
        edge(onSave.id, queue.id, "invokes-indirect"),
        edge(onClose.id, queue.id, "invokes-indirect"),
      ],
    );

    const finding = fakeFinding({ locations: [loc("handlers.ts", 1, 5), loc("handlers.ts", 10, 15)] });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "handlers.ts", startLine: 1, endLine: 5, functionName: "onSave" }),
        fakeClone({ file: "handlers.ts", startLine: 10, endLine: 15, functionName: "onClose" }),
      ],
    });

    const h = hypothesis.build(finding, graph, fakeCtx(repo))!;
    expect(h.state).toBe("ya-aplicado");
    const existsCheck = h.checks.find((c) => c.label.startsWith("Existe una interfaz"));
    expect(existsCheck?.why).toMatch(/portador|cola/i);
  });

  it("interfaz+miembro común SIN invocador confirmado ⇒ NO es 'completa' (declarado, no adivinado) — cae a evaluar handlers no relacionados por su propia firma", () => {
    const iface = sym("cmds.ts", ["Command"], { family: "namespace-like" });
    const x = sym("cmds.ts", ["SaveCommand"]);
    const y = sym("cmds.ts", ["DeleteCommand"]);
    const xGo = method("cmds.ts", "SaveCommand", "go", 0);
    const yGo = method("cmds.ts", "DeleteCommand", "go", 0);
    // Sin ninguna arista `calls`/`carries`+`invokes-indirect` hacia xGo/yGo: interfaz+miembro común, CERO invocador.
    const onSave = handlerNode("handlers.ts", "onSave", 1, 0);
    const onClose = handlerNode("handlers.ts", "onClose", 10, 0);

    const graph = graphOf(
      [iface, x, y, xGo, yGo, onSave, onClose],
      [edge(x.id, iface.id, "implements"), edge(y.id, iface.id, "implements"), ...containsAll(x.id, [xGo.id]), ...containsAll(y.id, [yGo.id])],
    );

    const finding = fakeFinding({ locations: [loc("handlers.ts", 1, 5), loc("handlers.ts", 10, 15)] });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "handlers.ts", startLine: 1, endLine: 5, functionName: "onSave" }),
        fakeClone({ file: "handlers.ts", startLine: 10, endLine: 15, functionName: "onClose" }),
      ],
    });

    const h = hypothesis.build(finding, graph, fakeCtx(repo))!;
    // La interfaz existe pero sin invocador probado ⇒ no cuenta como abstracción completa.
    const existsCheck = h.checks.find((c) => c.label.startsWith("Existe una interfaz"));
    expect(existsCheck?.passed).toBe(false);
    expect(existsCheck?.why).toMatch(/sin adivinar/);
    // Los handlers de este hallazgo (onSave/onClose) comparten aridad 0, sin interfaz/portador que LOS agrupe a ELLOS ⇒ parcial.
    expect(h.state).toBe("parcial");
  });

  it("de MENOR aridad entre los comunes, nunca por nombre: 'execute'(1) y 'reset'(0) comunes ⇒ elige 'reset'", () => {
    const iface = sym("cmds.ts", ["Command"], { family: "namespace-like" });
    const x = sym("cmds.ts", ["SaveCommand"]);
    const y = sym("cmds.ts", ["DeleteCommand"]);
    const xExec = method("cmds.ts", "SaveCommand", "execute", 1);
    const yExec = method("cmds.ts", "DeleteCommand", "execute", 1);
    const xReset = method("cmds.ts", "SaveCommand", "reset", 0);
    const yReset = method("cmds.ts", "DeleteCommand", "reset", 0);
    const runner = sym("runner.ts", ["Runner", "run"], { family: "function-like", arity: 1 });
    const iReset = method("cmds.ts", "Command", "reset", 0);

    const onSave = handlerNode("handlers.ts", "onSave", 1, 0);
    const onClose = handlerNode("handlers.ts", "onClose", 10, 0);

    const graph = graphOf(
      [iface, x, y, xExec, yExec, xReset, yReset, iReset, runner, onSave, onClose],
      [
        edge(x.id, iface.id, "implements"),
        edge(y.id, iface.id, "implements"),
        ...containsAll(iface.id, [iReset.id]),
        ...containsAll(x.id, [xExec.id, xReset.id]),
        ...containsAll(y.id, [yExec.id, yReset.id]),
        edge(runner.id, iReset.id, "calls"),
        edge(onSave.id, xReset.id, "calls"),
        edge(onClose.id, yReset.id, "calls"),
      ],
    );

    const finding = fakeFinding({ locations: [loc("handlers.ts", 1, 5), loc("handlers.ts", 10, 15)] });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "handlers.ts", startLine: 1, endLine: 5, functionName: "onSave" }),
        fakeClone({ file: "handlers.ts", startLine: 10, endLine: 15, functionName: "onClose" }),
      ],
    });

    const h = hypothesis.build(finding, graph, fakeCtx(repo))!;
    expect(h.state).toBe("ya-aplicado");
    const existsCheck = h.checks.find((c) => c.label.startsWith("Existe una interfaz"));
    expect(existsCheck?.why).toContain('"reset"');
  });

  it("riesgo A9 declarado: implementador resuelto vía `satisfies` (no `implements`) lo dice en el why", () => {
    const iface = sym("cmds.ts", ["Command"], { family: "namespace-like" });
    const x = sym("cmds.ts", ["SaveCommand"]);
    const y = sym("cmds.ts", ["DeleteCommand"]);
    const iGo = method("cmds.ts", "Command", "go", 0);
    const xGo = method("cmds.ts", "SaveCommand", "go", 0);
    const yGo = method("cmds.ts", "DeleteCommand", "go", 0);
    const runner = sym("runner.ts", ["Runner", "run"], { family: "function-like", arity: 1 });
    const onSave = handlerNode("handlers.ts", "onSave", 1, 0);
    const onClose = handlerNode("handlers.ts", "onClose", 10, 0);

    const graph = graphOf(
      [iface, x, y, iGo, xGo, yGo, runner, onSave, onClose],
      [
        edge(x.id, iface.id, "satisfies"),
        edge(y.id, iface.id, "implements"),
        ...containsAll(iface.id, [iGo.id]),
        ...containsAll(x.id, [xGo.id]),
        ...containsAll(y.id, [yGo.id]),
        edge(runner.id, iGo.id, "calls"),
        edge(onSave.id, xGo.id, "calls"),
        edge(onClose.id, yGo.id, "calls"),
      ],
    );

    const finding = fakeFinding({ locations: [loc("handlers.ts", 1, 5), loc("handlers.ts", 10, 15)] });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "handlers.ts", startLine: 1, endLine: 5, functionName: "onSave" }),
        fakeClone({ file: "handlers.ts", startLine: 10, endLine: 15, functionName: "onClose" }),
      ],
    });

    const h = hypothesis.build(finding, graph, fakeCtx(repo))!;
    const existsCheck = h.checks.find((c) => c.label.startsWith("Existe una interfaz"));
    expect(existsCheck?.why).toMatch(/satisfies.*riesgo A9|riesgo A9/i);
  });

  it("aristas `ambiguous` se ignoran (confidentEdges): un `implements` ambiguo no cuenta como interfaz", () => {
    const iface = sym("cmds.ts", ["Command"], { family: "namespace-like" });
    const x = sym("cmds.ts", ["SaveCommand"]);
    const y = sym("cmds.ts", ["DeleteCommand"]);
    const xGo = method("cmds.ts", "SaveCommand", "go", 0);
    const yGo = method("cmds.ts", "DeleteCommand", "go", 0);
    const onSave = handlerNode("handlers.ts", "onSave", 1, 0);
    const onClose = handlerNode("handlers.ts", "onClose", 10, 0);

    const graph = graphOf(
      [iface, x, y, xGo, yGo, onSave, onClose],
      [
        edge(x.id, iface.id, "implements", { provenance: "ambiguous", alternatives: ["sym:other#Other"] }),
        edge(y.id, iface.id, "implements", { provenance: "ambiguous", alternatives: ["sym:other#Other"] }),
        ...containsAll(x.id, [xGo.id]),
        ...containsAll(y.id, [yGo.id]),
      ],
    );

    const finding = fakeFinding({ locations: [loc("handlers.ts", 1, 5), loc("handlers.ts", 10, 15)] });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "handlers.ts", startLine: 1, endLine: 5, functionName: "onSave" }),
        fakeClone({ file: "handlers.ts", startLine: 10, endLine: 15, functionName: "onClose" }),
      ],
    });

    const h = hypothesis.build(finding, graph, fakeCtx(repo))!;
    const existsCheck = h.checks.find((c) => c.label.startsWith("Existe una interfaz"));
    expect(existsCheck?.passed).toBe(false);
    // onSave/onClose comparten aridad 0, sin interfaz confidente que cuente ⇒ parcial.
    expect(h.state).toBe("parcial");
  });

  /* ────────────────────────────────────────────────────────────────────────
   * Ola W2 — RECUPERA COBERTURA: `required` reconoce la terna interfaz+miembro
   * común ANCLADA a los manejadores de ESTE hallazgo, SIN exigir invocador
   * (el heurístico de la Ola V, que exigía carries+invokes-indirect, silenció
   * el patrón entero: 34→0 hipótesis en los 13 repos, `ola-v/informes/
   * INTEGRADOR.md` §2). El escenario de abajo es exactamente el que la Ola V
   * dejó sin cobertura: DOS implementaciones concretas de una interfaz REAL
   * (implements/satisfies), redeclarando el mismo miembro por (nombre,
   * aridad) — CERO `carries`, CERO `calls`, CERO `invokes-indirect` en el
   * grafo. El heurístico viejo daba `null` acá (medido: exactamente el test
   * "required no cumplido" de arriba). El nuevo reconoce el protocolo
   * compartido REAL y decide `parcial` (protocolo existe, invocador no
   * confirmado) — nunca inferido por conjunto de miembros: son aristas
   * `implements` reales, no una coincidencia de nombres.
   * ──────────────────────────────────────────────────────────────────────── */

  it("Ola W2 — required se cumple vía interfaz+miembro común REAL entre los DUEÑOS de los manejadores duplicados, SIN ningún invocador (ni calls, ni carries/invokes-indirect) ⇒ parcial", () => {
    const iface = sym("cmds.ts", ["Command"], { family: "namespace-like" });
    const x = sym("cmds.ts", ["SaveCommand"]);
    const y = sym("cmds.ts", ["DeleteCommand"]);
    // Los MANEJADORES DUPLICADOS de este hallazgo SON los miembros concretos
    // xGo/yGo — cada uno declarado (`contains`) por su propio implementador
    // de la interfaz. Ningún `execute`/`undo`/`run` en el nombre: "go".
    const xGo = method("cmds.ts", "SaveCommand", "go", 0, { startLine: 5 });
    const yGo = method("cmds.ts", "DeleteCommand", "go", 0, { startLine: 15 });

    const graph = graphOf(
      [iface, x, y, xGo, yGo],
      [edge(x.id, iface.id, "implements"), edge(y.id, iface.id, "implements"), ...containsAll(x.id, [xGo.id]), ...containsAll(y.id, [yGo.id])],
    );

    const finding = fakeFinding({ locations: [loc("cmds.ts", 5, 8), loc("cmds.ts", 15, 18)] });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "cmds.ts", startLine: 5, endLine: 8, functionName: "go" }),
        fakeClone({ file: "cmds.ts", startLine: 15, endLine: 18, functionName: "go" }),
      ],
      graph, // repo.graph === graph, como en producción (hypotheses/run.ts#L199).
    });

    const h = hypothesis.build(finding, graph, fakeCtx(repo))!;
    expect(h).not.toBeNull();

    const required = h.checks.find((c) => c.role === "required")!;
    expect(required.passed).toBe(true);
    expect(required.why).toContain('Interfaz "sym:cmds.ts#Command"');
    expect(required.why).not.toMatch(/execute|undo|run\(\)/i);

    // Sin invocador confirmado (ni calls ni portador+invokes-indirect):
    // `findCommandAbstraction` global no encuentra "completa" ⇒ el protocolo
    // SÍ existe pero decide PARCIAL, no ya-aplicado/aplicado-eludido.
    expect(h.state).toBe("parcial");
    const protocolCheck = h.checks.find((c) => c.label.startsWith("Protocolo compartido REAL"));
    expect(protocolCheck?.passed).toBe(true);
    expect(protocolCheck?.why).toContain("go");

    // Ninguno de los dos manejadores está "ligado a un disparador" (sin
    // `carries`) — `places` tiene que caer al respaldo de `problem.locations`,
    // nunca quedar vacío.
    expect(h.places).toHaveLength(2);
    expect(h.places.map((p) => p.startLine).sort((a, b) => a - b)).toEqual([5, 15]);
  });

  it("Ola W2 — control: sin `implements`/`satisfies` alguno Y sin owner (`contains`) para los manejadores ⇒ el camino de interfaz no aporta nada, sigue cayendo al heurístico viejo (null, como antes)", () => {
    const finding = fakeFinding({ locations: [loc("a.ts", 1, 5), loc("b.ts", 1, 5)] });
    const a = handlerNode("a.ts", "computeTotal", 1, 1);
    const b = handlerNode("b.ts", "loadConfig", 1, 1);
    const graph = graphOf([a, b], []); // ningún `contains`/`implements` — ningún owner que resolver.
    const repo = fakeRepo({
      clones: [fakeClone({ file: "a.ts", functionName: "computeTotal" }), fakeClone({ file: "b.ts", functionName: "loadConfig" })],
      graph,
    });
    expect(hypothesis.build(finding, graph, fakeCtx(repo))).toBeNull();
  });

  /* ────────────────────────────────────────────────────────────────────────
   * Ola 11a — P4: `ctx.neighborhood` real (`countOfKind`/`findingsInFile`),
   * consumido por los dos discriminadores nuevos ("repetido-en-el-repo" /
   * "invocador-concentra-despacho"). Mismo escenario que el test "TODOS los
   * lugares... mismo archivo, sin grafo" de arriba (confidence 'media' con
   * EMPTY_NEIGHBORHOOD), pero con un `Neighborhood` REAL — sin esto no hay
   * forma de demostrar que el vecindario de verdad mueve la escalera.
   * ──────────────────────────────────────────────────────────────────────── */

  it("countOfKind(problem.kind): otro hallazgo del MISMO kind en el repo ⇒ discriminador 'repetido-en-el-repo' confirmado (con EMPTY_NEIGHBORHOOD, el mismo caso lo deja SIN confirmar)", () => {
    const finding = fakeFinding({ id: "f-this", locations: [loc("a.ts", 1, 5), loc("a.ts", 10, 15)] });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, functionName: "onSave" }),
        fakeClone({ file: "a.ts", startLine: 10, endLine: 15, functionName: "onClose" }),
      ],
    });

    // Control: SIN vecindario, el discriminador no puede confirmarse.
    const resultEmpty = hypothesis.build(finding, null, fakeCtx(repo))!;
    expect(resultEmpty.discriminators.find((d) => d.label.includes("countOfKind(problem.kind)"))?.passed).toBe(false);

    // Un SEGUNDO hallazgo del MISMO kind ("duplication"), en otro archivo —
    // lo que vuelve esto un hábito repetido del repo.
    const otherFinding = fakeFinding({ id: "f-other", locations: [loc("c.ts", 1, 5), loc("d.ts", 1, 5)] });
    const index = buildNeighborhoodIndex(null, [finding, otherFinding], null);
    const neighborhood = neighborhoodFor(index, finding);
    expect(neighborhood.countOfKind("duplication")).toBe(1); // excluye a `finding` mismo — sólo cuenta `otherFinding`.

    const result = hypothesis.build(finding, null, fakeCtx(repo, new Set(), neighborhood))!;
    const habitCheck = result.discriminators.find((d) => d.label.includes("countOfKind(problem.kind)"));
    expect(habitCheck?.passed).toBe(true);
    expect(habitCheck?.why).toContain("HÁBITO");
  });

  it("findingsInFile del archivo de un manejador: otro hallazgo del vecindario en ESE archivo ⇒ discriminador 'invocador-concentra-despacho' confirmado", () => {
    const finding = fakeFinding({ id: "f-this", locations: [loc("a.ts", 1, 5), loc("a.ts", 10, 15)] });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, functionName: "onSave" }),
        fakeClone({ file: "a.ts", startLine: 10, endLine: 15, functionName: "onClose" }),
      ],
    });

    // Control: SIN vecindario, el discriminador no puede confirmarse.
    const resultEmpty = hypothesis.build(finding, null, fakeCtx(repo))!;
    expect(resultEmpty.discriminators.find((d) => d.label.includes("findingsInFile"))?.passed).toBe(false);

    // Un `repeated-switch` real en "a.ts" (el mismo archivo que los manejadores) — el sitio ya concentra despacho.
    const dispatchFinding = fakeFinding({
      id: "f-dispatch",
      detectorId: "repeated-switch",
      kind: "repeated-switch",
      locations: [loc("a.ts", 30, 40)],
    });
    const index = buildNeighborhoodIndex(null, [finding, dispatchFinding], null);
    const neighborhood = neighborhoodFor(index, finding);
    expect(neighborhood.findingsInFile("a.ts").some((f) => f.id === "f-dispatch")).toBe(true);

    const result = hypothesis.build(finding, null, fakeCtx(repo, new Set(), neighborhood))!;
    const dispatchCheck = result.discriminators.find((d) => d.label.includes("findingsInFile"));
    expect(dispatchCheck?.passed).toBe(true);
    expect(dispatchCheck?.why).toContain("repeated-switch");
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * OLA AE, FRENTE AE6 — el camino de entrada del ancla-fuerza
 * `invariant-scaffold-varying-call`. Todo lo de arriba (el camino viejo) queda
 * intacto: estos tests son ADICIONALES.
 * ════════════════════════════════════════════════════════════════════════ */

function scaffoldLoc(file: string, startLine: number, symbol: string, role: string): RoleLocation {
  return { file, startLine, endLine: startLine + 4, symbol, role };
}

/** Un `Finding` como el que emite el detector del ancla-fuerza: 3 lugares, 3 operaciones, 3 colaboradores. */
function scaffoldFinding(overrides: Partial<Finding> = {}): Finding {
  return fakeFinding({
    id: "sc1",
    detectorId: "invariant-scaffold-varying-call",
    kind: "invariant-scaffold-varying-call",
    language: null,
    locations: [
      scaffoldLoc("web/uno.ts", 10, "manejaUno", "repite el tratamiento: invoca los 3 colaboradores comunes y, como única diferencia, guardarUno"),
      scaffoldLoc("web/dos.ts", 10, "manejaDos", "repite el tratamiento: invoca los 3 colaboradores comunes y, como única diferencia, guardarDos"),
      scaffoldLoc("web/tres.ts", 10, "manejaTres", "repite el tratamiento: invoca los 3 colaboradores comunes y, como única diferencia, guardarTres"),
      scaffoldLoc("srv/uno.ts", 20, "guardarUno", "operación soldada: aridad 1, invocada directamente desde un solo lugar del grupo"),
      scaffoldLoc("srv/dos.ts", 20, "guardarDos", "operación soldada: aridad 1, invocada directamente desde un solo lugar del grupo"),
      scaffoldLoc("srv/tres.ts", 20, "guardarTres", "operación soldada: aridad 1, invocada directamente desde un solo lugar del grupo"),
      scaffoldLoc("infra/log.ts", 30, "registrar", "colaborador del tratamiento: los 3 lugares lo invocan por su cuenta"),
      scaffoldLoc("infra/tx.ts", 30, "abrir", "colaborador del tratamiento: los 3 lugares lo invocan por su cuenta"),
      scaffoldLoc("infra/tx.ts", 40, "cerrar", "colaborador del tratamiento: los 3 lugares lo invocan por su cuenta"),
    ],
    evidence: [{ label: "los dueños de los lugares comparten ancestro", value: 0, note: "NO" }],
    ...overrides,
  });
}

/** El grafo mínimo que hace que los `required` del camino nuevo se puedan confirmar. */
function scaffoldGraph(extraNodes: readonly CodeGraphNode[] = [], extraEdges: readonly CodeGraphEdge[] = []): CodeGraph {
  const sites = ["uno", "dos", "tres"].map((n) => handlerNode(`web/${n}.ts`, `maneja${n[0]!.toUpperCase()}${n.slice(1)}`, 10, 1));
  const ops = ["uno", "dos", "tres"].map((n) => handlerNode(`srv/${n}.ts`, `guardar${n[0]!.toUpperCase()}${n.slice(1)}`, 20, 1));
  const treat = [handlerNode("infra/log.ts", "registrar", 30, 1), handlerNode("infra/tx.ts", "abrir", 30, 1), handlerNode("infra/tx.ts", "cerrar", 40, 1)];
  const edges = sites.flatMap((s, i) => [edge(s.id, ops[i]!.id, "calls"), ...treat.map((t) => edge(s.id, t.id, "calls"))]);
  return graphOf([...sites, ...ops, ...treat, ...extraNodes], [...edges, ...extraEdges]);
}

describe("hypotheses/command — el camino del ancla-fuerza (Ola AE, AE6)", () => {
  it("la forma completa ⇒ `ausente`, el estado que las dos anclas viejas NO pudieron producir NI UNA VEZ en 48 hipótesis", () => {
    const result = hypothesis.build(scaffoldFinding(), scaffoldGraph(), fakeCtx(fakeRepo()))!;
    expect(result).not.toBeNull();
    expect(result.state).toBe("ausente");
    expect(result.pattern).toBe("Command");
  });

  it("apunta a los LUGARES y a las OPERACIONES, no a clones (este ancla no nace de un clon)", () => {
    const result = hypothesis.build(scaffoldFinding(), scaffoldGraph(), fakeCtx(fakeRepo()))!;
    expect(result.places).toHaveLength(6);
    expect(result.places.filter((p) => p.role.startsWith("lugar que repite"))).toHaveLength(3);
    expect(result.places.filter((p) => p.role.startsWith("operación soldada"))).toHaveLength(3);
  });

  it("required `operacion-soldada`: sin grafo NO aprueba — nunca 'no pude mirar, apruebo'", () => {
    const result = hypothesis.build(scaffoldFinding(), null, fakeCtx(fakeRepo()));
    expect(result).toBeNull();
  });

  it("required `tratamiento-con-tamano`: con DOS colaboradores no hay hipótesis", () => {
    const finding = scaffoldFinding({
      locations: scaffoldFinding().locations.filter((l) => l.symbol !== "cerrar") as unknown as Finding["locations"],
    });
    expect(hypothesis.build(finding, scaffoldGraph(), fakeCtx(fakeRepo()))).toBeNull();
  });

  it("required `la-repeticion-cruza-el-archivo`: los tres lugares en un archivo ⇒ null", () => {
    const base = scaffoldFinding();
    const locations = base.locations.map((l) => (l.role?.startsWith("repite el tratamiento") ? { ...l, file: "web/todo.ts" } : l));
    const graph = scaffoldGraph();
    const nodes = graph.nodes.map((n) => (n.file.startsWith("web/") ? { ...n, file: "web/todo.ts" } : n));
    // los ids no cambian (siguen apuntando al archivo original), así que el
    // required de "operación soldada" sigue confirmándose; lo que falla es el
    // de archivos, que se lee del `Finding`.
    expect(hypothesis.build(scaffoldFinding({ locations: locations as unknown as Finding["locations"] }), graphOf(nodes, graph.edges), fakeCtx(fakeRepo()))).toBeNull();
  });

  it("`parcial`: una de las operaciones YA se pasa como valor en otro lado (`carries`) — media puerta", () => {
    const portador = carrier("infra/cola.ts", ["pendientes"]);
    const graph = scaffoldGraph([portador], [edge(portador.id, symbolNodeId("srv/uno.ts", ["guardarUno"]), "carries")]);
    const result = hypothesis.build(scaffoldFinding(), graph, fakeCtx(fakeRepo()))!;
    expect(result.state).toBe("parcial");
    expect(result.checks.some((c) => c.label.includes("se pasa como valor") && c.passed)).toBe(true);
  });

  it("el discriminador de hermandad VIAJA y no apaga: con ancestro común sigue habiendo hipótesis", () => {
    const finding = scaffoldFinding({ evidence: [{ label: "los dueños de los lugares comparten ancestro", value: 1, note: "SÍ — Pull Up" }] });
    const result = hypothesis.build(finding, scaffoldGraph(), fakeCtx(fakeRepo()))!;
    expect(result).not.toBeNull();
    expect(result.state).toBe("ausente");
    expect(result.discriminators.find((d) => d.label.includes("ancestro"))?.passed).toBe(false);
  });

  it("sin ancestro común, el discriminador SUMA", () => {
    const result = hypothesis.build(scaffoldFinding(), scaffoldGraph(), fakeCtx(fakeRepo()))!;
    expect(result.discriminators.find((d) => d.label.includes("ancestro"))?.passed).toBe(true);
  });

  /* ── OLA AM · FRENTE AM3 — K3, `algun-lugar-puede-alojar-la-operacion` ───── */

  /** Un `FileUnit` mínimo con las funciones que el chequeo necesita mirar
   *  (`file`/`startLine`/`endLine`): el resto de la unidad no se toca. */
  function unidadCon(path: string, fns: readonly { startLine: number; endLine: number }[]): FileUnit {
    return { path, functions: fns.map((f) => ({ file: path, startLine: f.startLine, endLine: f.endLine })) } as unknown as FileUnit;
  }
  function ctxConArboles(mapa: Record<string, FileUnit>): HypothesisContext {
    return { ...fakeCtx(fakeRepo()), fileAt: (p: string) => mapa[p] ?? null };
  }

  it("AM3 — los TRES lugares son funciones ANIDADAS dentro de otra función (cierres) ⇒ null: la operación no se puede reificar sin extraerlas antes", () => {
    const arboles: Record<string, FileUnit> = {};
    for (const n of ["uno", "dos", "tres"]) {
      // el sitio empieza en 10 y termina en 14; una función de 1 a 100 lo contiene.
      arboles[`web/${n}.ts`] = unidadCon(`web/${n}.ts`, [{ startLine: 1, endLine: 100 }, { startLine: 10, endLine: 14 }]);
    }
    expect(hypothesis.build(scaffoldFinding(), scaffoldGraph(), ctxConArboles(arboles))).toBeNull();
  });

  it("AM3 — GUARDIÁN: con UN solo lugar que NO es un cierre, la hipótesis SIGUE (el descarte no se sobre-extiende)", () => {
    const arboles: Record<string, FileUnit> = {
      "web/uno.ts": unidadCon("web/uno.ts", [{ startLine: 10, endLine: 14 }]), // de nivel superior
      "web/dos.ts": unidadCon("web/dos.ts", [{ startLine: 1, endLine: 100 }, { startLine: 10, endLine: 14 }]),
      "web/tres.ts": unidadCon("web/tres.ts", [{ startLine: 1, endLine: 100 }, { startLine: 10, endLine: 14 }]),
    };
    const r = hypothesis.build(scaffoldFinding(), scaffoldGraph(), ctxConArboles(arboles));
    expect(r).not.toBeNull();
    expect(r!.state).toBe("ausente");
  });

  it("AM3 — POLARIDAD: sin árbol vivo el chequeo SOSTIENE (devuelve el comportamiento exacto de antes del frente, nunca quita por no poder mirar)", () => {
    const r = hypothesis.build(scaffoldFinding(), scaffoldGraph(), fakeCtx(fakeRepo()));
    expect(r).not.toBeNull();
  });

  it("el camino VIEJO sigue intacto: un hallazgo de `duplication` no entra por el camino nuevo", () => {
    const finding = fakeFinding({ locations: [loc("a.ts", 1, 5), loc("b.ts", 1, 5)] });
    const repo = fakeRepo({ clones: [fakeClone({ file: "a.ts", functionName: "computeTotal" }), fakeClone({ file: "b.ts", functionName: "loadConfig" })] });
    // mismo escenario que el primer test del archivo: required viejo no cumplido ⇒ null
    expect(hypothesis.build(finding, null, fakeCtx(repo))).toBeNull();
  });
});

describe("hypotheses/command — el peldaño VACUO que este frente midió y sacó (Ola AE, AE6)", () => {
  /**
   * La primera versión de la escalera devolvía `aplicado-eludido` cuando había
   * una abstracción Command completa EN CUALQUIER PARTE del repo. Medido sobre
   * los 21 repos, ese peldaño resultó ser una propiedad del REPO y nunca del
   * hallazgo (guava 12/12, newtonsoft 2/2, rubocop 1/1, sqlalchemy 1/1,
   * jenkins 1/1 — 100 % donde la búsqueda global encuentra algo, 0 % donde no).
   * El hecho ahora VIAJA como discriminador y el estado sigue siendo una
   * recomendación: el cambio sólo puede AGREGAR.
   */
  function repoWithGlobalAbstraction(): { nodes: CodeGraphNode[]; edges: CodeGraphEdge[] } {
    const iface = sym("proto.ts", ["Ejecutable"]);
    const ifaceMember = method("proto.ts", "Ejecutable", "correr", 0);
    const a = sym("a.ts", ["Uno"]);
    const b = sym("b.ts", ["Dos"]);
    const am = method("a.ts", "Uno", "correr", 0);
    const bm = method("b.ts", "Dos", "correr", 0);
    const cliente = handlerNode("cli.ts", "usa", 1, 0);
    return {
      nodes: [iface, ifaceMember, a, b, am, bm, cliente],
      edges: [
        ...containsAll(iface.id, [ifaceMember.id]),
        ...containsAll(a.id, [am.id]),
        ...containsAll(b.id, [bm.id]),
        edge(a.id, iface.id, "implements"),
        edge(b.id, iface.id, "implements"),
        edge(cliente.id, ifaceMember.id, "calls"), // el invocador confirmado
      ],
    };
  }

  it("con una abstracción Command completa en OTRA parte del repo, el estado sigue siendo una RECOMENDACIÓN", () => {
    const extra = repoWithGlobalAbstraction();
    const graph = scaffoldGraph(extra.nodes, extra.edges);
    const result = hypothesis.build(scaffoldFinding(), graph, fakeCtx(fakeRepo()))!;
    expect(result.state).toBe("ausente");
    expect(["ausente", "parcial"]).toContain(result.state);
  });

  it("…y el hecho NO se pierde: viaja como discriminador `el repo ya reifica operaciones`", () => {
    const extra = repoWithGlobalAbstraction();
    const graph = scaffoldGraph(extra.nodes, extra.edges);
    const result = hypothesis.build(scaffoldFinding(), graph, fakeCtx(fakeRepo()))!;
    const disc = result.discriminators.find((d) => d.label.includes("reificar una operación es idiomático"));
    expect(disc?.passed).toBe(true);
  });

  it("sin abstracción completa en el repo, el mismo discriminador NO suma", () => {
    const result = hypothesis.build(scaffoldFinding(), scaffoldGraph(), fakeCtx(fakeRepo()))!;
    const disc = result.discriminators.find((d) => d.label.includes("reificar una operación es idiomático"));
    expect(disc?.passed).toBe(false);
  });
});
