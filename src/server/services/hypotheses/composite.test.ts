import { describe, expect, it } from "vitest";

import type { Capability } from "../detect/capabilities.js";
import { pisoDeclarado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import type { CloneCandidate, FileUnit, Finding, RepoUnit, RoleLocation } from "../detect/types.js";
import { fileUnitFrom, nodeSetsFor, parseRoot } from "../detect/testing.js";
import { EDGE_ROLE_RECEIVER_MEMBER, type CodeGraph, type CodeGraphEdge, type CodeGraphNode } from "../graph/types.js";
import { buildNeighborhoodIndex, EMPTY_NEIGHBORHOOD, neighborhoodFor } from "../graph/neighborhood.js";
import { SELF_REFERENTIAL_MEMBER_KIND } from "../detect/intra-file/self-referential-member.js";
import { composite } from "./composite.js";
import type { HypothesisContext } from "./types.js";

function fakeThreshold(): Threshold {
  return resolveThreshold(pisoDeclarado(2, { rationale: "test" }), {
    language: "ruby",
    sampleSize: () => 0,
    corpusP95: () => null,
  });
}

function loc(file: string, startLine: number, endLine: number, role: string): RoleLocation {
  return { file, startLine, endLine, role };
}

function clone(
  file: string,
  startLine: number,
  endLine: number,
  normalized: string,
  functionName: string | null,
): CloneCandidate {
  return {
    fingerprint: "fp1",
    file,
    startLine,
    endLine,
    nodes: 10,
    type: "if_statement",
    functionName,
    className: null,
    superclassName: null,
    normalized,
  };
}

const SHAPE_TEXT = (fn: string, word = "children") => `if (${word}.length === 0) { return leaf(); } else { ${word}.forEach(c => ${fn}(c)); }`;
const NON_SHAPE_TEXT = "if (x > 0) { return a; } else { return b; }";

function fakeFinding(locations: readonly [RoleLocation, ...RoleLocation[]], overrides: Partial<Finding> = {}): Finding {
  return {
    id: "f-composite-1",
    detectorId: "distributed-duplication",
    kind: "distributed-duplication",
    scope: "inter-file",
    language: null,
    title: "t",
    detail: "d",
    trigger: [{ label: "componentes", value: 2, threshold: fakeThreshold() }],
    locations,
    severity: 50,
    advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
    ...overrides,
  };
}

function fakeRepo(clones: readonly CloneCandidate[]): RepoUnit {
  return { repoName: "r", files: [], functions: [], clones, graph: null };
}

function fakeGraph(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): CodeGraph {
  return { nodes, edges, resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] } };
}

function fakeCtx(overrides: Partial<HypothesisContext> = {}): HypothesisContext {
  return {
    file: null,
    fileAt: () => null,
    repo: fakeRepo([]),
    capabilities: new Set<Capability>(),
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
    ...overrides,
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * Helpers de grafo sintético para LA TERNA (CONTRATO-F10.md §0.4):
 * I (interfaz) con un miembro `render()/0`; L (hoja) implementa I sin
 * recursar; C (compuesto) implementa I y SU `render` llama, con rol
 * `receiver-member`, al `render` de I — exactamente la forma que
 * `hypotheses/wrapping-chain.ts` ya usa para sus propios tests sintéticos.
 * ──────────────────────────────────────────────────────────────────────── */

function classNode(id: string, file: string, name: string): CodeGraphNode {
  return { id, kind: "symbol", file, symbolPath: [name], family: "class-like" };
}

function methodNode(id: string, file: string, owner: string, name: string, arity: number): CodeGraphNode {
  return { id, kind: "symbol", file, symbolPath: [owner, name], family: "function-like", arity };
}

function containsEdge(from: string, to: string): CodeGraphEdge {
  return { from, to, kind: "contains", provenance: "declared", weight: 1 };
}

function protocolEdge(from: string, to: string, kind: "implements" | "satisfies" = "implements"): CodeGraphEdge {
  return { from, to, kind, provenance: kind === "implements" ? "declared" : "inferred", weight: 1 };
}

function recursionEdge(from: string, to: string): CodeGraphEdge {
  return { from, to, kind: "calls", provenance: "resolved", weight: 1, roles: EDGE_ROLE_RECEIVER_MEMBER };
}

/** I=Tree(.render/0), L=Leaf implementa I sin recursar, C=Node implementa I y SU render recursa hacia I.render (COMPLETA). */
function completeGraph(opts: { protocolKind?: "implements" | "satisfies"; withRecursion?: boolean; onlyRecursors?: boolean } = {}): CodeGraph {
  const { protocolKind = "implements", withRecursion = true, onlyRecursors = false } = opts;
  const nodes: CodeGraphNode[] = [
    classNode("sym:shared.ts#Tree", "shared.ts", "Tree"),
    methodNode("sym:shared.ts#Tree.render", "shared.ts", "Tree", "render", 0),
    classNode("sym:a.ts#Leaf", "a.ts", "Leaf"),
    methodNode("sym:a.ts#Leaf.render", "a.ts", "Leaf", "render", 0),
    classNode("sym:b.ts#Node", "b.ts", "Node"),
    methodNode("sym:b.ts#Node.render", "b.ts", "Node", "render", 0),
  ];
  const edges: CodeGraphEdge[] = [
    containsEdge("sym:shared.ts#Tree", "sym:shared.ts#Tree.render"),
    containsEdge("sym:a.ts#Leaf", "sym:a.ts#Leaf.render"),
    containsEdge("sym:b.ts#Node", "sym:b.ts#Node.render"),
    protocolEdge("sym:a.ts#Leaf", "sym:shared.ts#Tree", protocolKind),
    protocolEdge("sym:b.ts#Node", "sym:shared.ts#Tree", protocolKind),
  ];
  if (withRecursion) edges.push(recursionEdge("sym:b.ts#Node.render", "sym:shared.ts#Tree.render"));
  if (onlyRecursors) edges.push(recursionEdge("sym:a.ts#Leaf.render", "sym:shared.ts#Tree.render"));
  return fakeGraph(nodes, edges);
}

/** Sin protocolo: `Node.render` recursa (rol receiver-member) sobre OTRO miembro homónimo del MISMO owner (`Node` — ver docstring `recursesOverOwnType`). */
function adHocGraph(): CodeGraph {
  const nodes: CodeGraphNode[] = [classNode("sym:b.ts#Node", "b.ts", "Node"), methodNode("sym:b.ts#Node.render", "b.ts", "Node", "render", 0)];
  const edges: CodeGraphEdge[] = [
    containsEdge("sym:b.ts#Node", "sym:b.ts#Node.render"),
    recursionEdge("sym:b.ts#Node.render", "sym:b.ts#Node.render"),
  ];
  return fakeGraph(nodes, edges);
}

describe("hypotheses/composite", () => {
  it("id/pattern/anchors: cuelga de `distributed-duplication` Y `recursive-collection-descent` — `self-referential-member` ESTÁ DE BAJA (OLA AY, frente AY5)", () => {
    expect(composite.id).toBe("composite");
    expect(composite.pattern).toBe("Composite");
    expect(composite.anchors).toEqual(["distributed-duplication", "recursive-collection-descent"]);
    // El ancla vieja que SIGUE: la Ola AE fue aditiva y eso no se revierte.
    expect(composite.anchors).toContain("distributed-duplication");
  });

  it("required NO cumplido (ningún sitio muestra la forma, sin grafo) ⇒ null, ni siquiera candidata", () => {
    const locations: [RoleLocation, ...RoleLocation[]] = [loc("a.ts", 1, 5, "primera copia"), loc("b.ts", 1, 5, "copia #2")];
    const clones = [clone("a.ts", 1, 5, NON_SHAPE_TEXT, "walk"), clone("b.ts", 1, 5, NON_SHAPE_TEXT, "walk")];
    const finding = fakeFinding(locations);
    const ctx = fakeCtx({ repo: fakeRepo(clones) });
    expect(composite.build(finding, null, ctx)).toBeNull();
  });

  it("required NO cumplido (sólo 1 de 2 sitios muestra la forma, sin grafo) ⇒ null", () => {
    const locations: [RoleLocation, ...RoleLocation[]] = [loc("a.ts", 1, 5, "primera copia"), loc("b.ts", 1, 5, "copia #2")];
    const clones = [clone("a.ts", 1, 5, SHAPE_TEXT("walk"), "walk"), clone("b.ts", 1, 5, NON_SHAPE_TEXT, "walk")];
    const finding = fakeFinding(locations);
    const ctx = fakeCtx({ repo: fakeRepo(clones) });
    expect(composite.build(finding, null, ctx)).toBeNull();
  });

  it("required SÍ cumplido SÓLO por señal estructural (texto no confirma en ningún sitio) — la segunda vía del required", () => {
    const locations: [RoleLocation, ...RoleLocation[]] = [loc("a.ts", 1, 5, "primera copia"), loc("b.ts", 1, 5, "copia #2")];
    const clones = [clone("a.ts", 1, 5, NON_SHAPE_TEXT, "walk"), clone("b.ts", 1, 5, NON_SHAPE_TEXT, "walk")];
    const finding = fakeFinding(locations);
    const graph = completeGraph();
    const ctx = fakeCtx({ repo: fakeRepo(clones) });
    const h = composite.build(finding, graph, ctx);
    expect(h).not.toBeNull();
    const requiredCheck = h!.checks.find((c) => c.role === "required");
    expect(requiredCheck?.passed).toBe(true);
  });

  it("OLA V — el ancla `self-referential-member` SOLA ya no alcanza: sin árbol vivo con el que clasificar la forma, no es candidata", () => {
    const locations: [RoleLocation, ...RoleLocation[]] = [
      { file: "folder.rb", startLine: 10, endLine: 10, role: 'miembro "parent" (literal) cuyo tipo es el propio tipo "Folder"', symbol: "Folder" },
      { file: "folder.rb", startLine: 11, endLine: 17, role: 'miembro "children" (literal) cuyo tipo es el propio tipo "Folder"', symbol: "Folder" },
    ];
    // `ctx.file` es `null` (el default del arnés): la relación parte/todo no se
    // puede clasificar. Un `required` que aprueba por no haber podido mirar no
    // es un `required` — la hipótesis no se emite. Antes de la Ola V, la sola
    // existencia del ancla la emitía: ésas eran las 81 hipótesis de 0 %.
    const finding = fakeFinding(locations, { detectorId: "self-referential-member", kind: "self-referential-member" });
    const ctx = fakeCtx({ repo: fakeRepo([]) });
    expect(composite.build(finding, null, ctx)).toBeNull();
  });

  it("2 sitios confirman la forma, sin grafo ⇒ estado ausente, confidence no nula, techo 'media'", () => {
    const locations: [RoleLocation, ...RoleLocation[]] = [loc("a.ts", 1, 5, "primera copia"), loc("b.ts", 1, 5, "copia #2")];
    const clones = [clone("a.ts", 1, 5, SHAPE_TEXT("walk"), "walk"), clone("b.ts", 1, 5, SHAPE_TEXT("visit"), "visit")];
    const finding = fakeFinding(locations);
    const ctx = fakeCtx({ repo: fakeRepo(clones) });
    const h = composite.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    expect(h!.ceiling).toBe("media");
    expect(h!.confidence).not.toBeNull();
    expect(h!.anchorFindingId).toBe("f-composite-1");
    expect(h!.missingCapabilities).toEqual([]);
  });

  it("discriminadores: vocabulario de hijos DISTINTO entre sitios confirmados ⇒ no sube por 'vocabulario consistente'", () => {
    const locations: [RoleLocation, ...RoleLocation[]] = [loc("a.ts", 1, 5, "primera copia"), loc("b.ts", 1, 5, "copia #2")];
    const clones = [
      clone("a.ts", 1, 5, SHAPE_TEXT("walk", "children"), "walk"),
      clone("b.ts", 1, 5, SHAPE_TEXT("visit", "items"), "visit"),
    ];
    const finding = fakeFinding(locations);
    const ctx = fakeCtx({ repo: fakeRepo(clones) });
    const h = composite.build(finding, null, ctx)!;
    const vocabCheck = h.discriminators.find((c) => c.label.includes("vocabulario"));
    expect(vocabCheck?.passed).toBe(false);
    expect(vocabCheck?.why.length).toBeGreaterThan(0);
  });

  it("discriminadores: TODOS los sitios confirman Y mismo vocabulario, sin grafo ⇒ los dos discriminadores de texto pasan, refuerzo-colección no evaluado", () => {
    const locations: [RoleLocation, ...RoleLocation[]] = [loc("a.ts", 1, 5, "primera copia"), loc("b.ts", 1, 5, "copia #2")];
    const clones = [clone("a.ts", 1, 5, SHAPE_TEXT("walk"), "walk"), clone("b.ts", 1, 5, SHAPE_TEXT("visit"), "visit")];
    const finding = fakeFinding(locations);
    const ctx = fakeCtx({ repo: fakeRepo(clones) });
    const h = composite.build(finding, null, ctx)!;
    const allSites = h.discriminators.find((c) => c.label.includes("TODOS"));
    const vocab = h.discriminators.find((c) => c.label.includes("vocabulario"));
    const reinforcement = h.discriminators.find((c) => c.label.toLowerCase().includes("refuerzo"));
    expect(allSites?.passed).toBe(true);
    expect(vocab?.passed).toBe(true);
    expect(reinforcement?.passed).toBe(false); // sin grafo: "no evaluado", nunca decisivo.
    // ceiling "media" es un TECHO: aunque la escalera llegue a "alta", el resultado no la supera.
    expect(h.confidence).toBe("media");
  });

  it("excluder: protocolo compartido SIN ninguna arista calls (recursors=0) ⇒ parcial, DECLARADO dormido, confidence no nula", () => {
    const locations: [RoleLocation, ...RoleLocation[]] = [loc("a.ts", 1, 5, "primera copia"), loc("b.ts", 1, 5, "copia #2")];
    const clones = [clone("a.ts", 1, 5, SHAPE_TEXT("walk"), "walk"), clone("b.ts", 1, 5, SHAPE_TEXT("visit"), "visit")];
    const finding = fakeFinding(locations);
    const graph = completeGraph({ withRecursion: false });
    const ctx = fakeCtx({ repo: fakeRepo(clones) });
    const h = composite.build(finding, graph, ctx)!;
    expect(h.state).toBe("parcial");
    expect(h.confidence).not.toBeNull();
    const appliedCheck = h.checks.find((c) => c.role === "applied");
    expect(appliedCheck?.why).toContain("receiver-member");
  });

  it("excluder: protocolo compartido, TODOS recursan (leaves=0) ⇒ parcial (sin caso base observable)", () => {
    const locations: [RoleLocation, ...RoleLocation[]] = [loc("a.ts", 1, 5, "primera copia"), loc("b.ts", 1, 5, "copia #2")];
    const clones = [clone("a.ts", 1, 5, SHAPE_TEXT("walk"), "walk"), clone("b.ts", 1, 5, SHAPE_TEXT("visit"), "visit")];
    const finding = fakeFinding(locations);
    const graph = completeGraph({ onlyRecursors: true });
    const ctx = fakeCtx({ repo: fakeRepo(clones) });
    const h = composite.build(finding, graph, ctx)!;
    expect(h.state).toBe("parcial");
    const appliedCheck = h.checks.find((c) => c.role === "applied");
    expect(appliedCheck?.why).toContain("ninguno es una hoja");
  });

  it("excluder: COMPLETA (>=1 recursor confirmado + >=1 hoja) SIN duplicación textual confirmada ⇒ ya-aplicado, confidence null", () => {
    const locations: [RoleLocation, ...RoleLocation[]] = [loc("a.ts", 1, 5, "primera copia"), loc("b.ts", 1, 5, "copia #2")];
    const clones = [clone("a.ts", 1, 5, NON_SHAPE_TEXT, "walk"), clone("b.ts", 1, 5, NON_SHAPE_TEXT, "walk")];
    const finding = fakeFinding(locations);
    const graph = completeGraph();
    const ctx = fakeCtx({ repo: fakeRepo(clones) });
    const h = composite.build(finding, graph, ctx)!;
    expect(h.state).toBe("ya-aplicado");
    expect(h.confidence).toBeNull();
    const appliedCheck = h.checks.find((c) => c.role === "applied");
    expect(appliedCheck?.passed).toBe(true);
    expect(appliedCheck?.why).toContain("ya está aplicado limpiamente");
  });

  it("excluder: COMPLETA (>=1 recursor + >=1 hoja) CON duplicación textual confirmada EN EL MISMO hallazgo ⇒ aplicado-eludido, confidence null", () => {
    const locations: [RoleLocation, ...RoleLocation[]] = [loc("a.ts", 1, 5, "primera copia"), loc("b.ts", 1, 5, "copia #2")];
    const clones = [clone("a.ts", 1, 5, SHAPE_TEXT("walk"), "walk"), clone("b.ts", 1, 5, SHAPE_TEXT("visit"), "visit")];
    const finding = fakeFinding(locations);
    const graph = completeGraph();
    const ctx = fakeCtx({ repo: fakeRepo(clones) });
    const h = composite.build(finding, graph, ctx)!;
    expect(h.state).toBe("aplicado-eludido");
    expect(h.confidence).toBeNull();
    const appliedCheck = h.checks.find((c) => c.role === "applied");
    expect(appliedCheck?.passed).toBe(true);
    expect(appliedCheck?.why).toContain("PUENTEANDO");
  });

  it("excluder: COMPLETA vía `satisfies` (no `implements`) ⇒ declara el riesgo A9 en el `why`", () => {
    const locations: [RoleLocation, ...RoleLocation[]] = [loc("a.ts", 1, 5, "primera copia"), loc("b.ts", 1, 5, "copia #2")];
    const clones = [clone("a.ts", 1, 5, NON_SHAPE_TEXT, "walk"), clone("b.ts", 1, 5, NON_SHAPE_TEXT, "walk")];
    const finding = fakeFinding(locations);
    const graph = completeGraph({ protocolKind: "satisfies" });
    const ctx = fakeCtx({ repo: fakeRepo(clones) });
    const h = composite.build(finding, graph, ctx)!;
    expect(h.state).toBe("ya-aplicado");
    const appliedCheck = h.checks.find((c) => c.role === "applied");
    expect(appliedCheck?.why).toContain("satisfies");
    expect(appliedCheck?.why).toContain("A9");
  });

  it("excluder: recursión AD HOC sobre el propio tipo (sin protocolo/interfaz) ⇒ parcial, declara la ambigüedad símbolo-vs-instancia", () => {
    const locations: [RoleLocation, ...RoleLocation[]] = [loc("b.ts", 1, 5, "primera copia"), loc("b2.ts", 1, 5, "copia #2")];
    const clones = [clone("b.ts", 1, 5, SHAPE_TEXT("walk"), "walk"), clone("b2.ts", 1, 5, SHAPE_TEXT("visit"), "visit")];
    const finding = fakeFinding(locations);
    const graph = adHocGraph();
    const ctx = fakeCtx({ repo: fakeRepo(clones) });
    const h = composite.build(finding, graph, ctx)!;
    expect(h.state).toBe("parcial");
    const appliedCheck = h.checks.find((c) => c.role === "applied");
    expect(appliedCheck?.passed).toBe(true);
    expect(appliedCheck?.why).toContain("SIN una interfaz común");
  });

  it("excluder: protocolo del grafo NO relacionado con los archivos de este hallazgo ⇒ no cuenta, sigue ausente", () => {
    const locations: [RoleLocation, ...RoleLocation[]] = [loc("x.ts", 1, 5, "primera copia"), loc("y.ts", 1, 5, "copia #2")];
    const clones = [clone("x.ts", 1, 5, SHAPE_TEXT("walk"), "walk"), clone("y.ts", 1, 5, SHAPE_TEXT("visit"), "visit")];
    const finding = fakeFinding(locations);
    const graph = completeGraph(); // implementadores viven en a.ts/b.ts/shared.ts — irrelevantes a x.ts/y.ts.
    const ctx = fakeCtx({ repo: fakeRepo(clones) });
    const h = composite.build(finding, graph, ctx)!;
    expect(h.state).toBe("ausente");
  });

  it("sin grafo: el excluder se declara no-evaluado (why lo dice) y el estado por default es ausente, nunca aplicado-eludido/ya-aplicado", () => {
    const locations: [RoleLocation, ...RoleLocation[]] = [loc("a.ts", 1, 5, "primera copia"), loc("b.ts", 1, 5, "copia #2")];
    const clones = [clone("a.ts", 1, 5, SHAPE_TEXT("walk"), "walk"), clone("b.ts", 1, 5, SHAPE_TEXT("visit"), "visit")];
    const finding = fakeFinding(locations);
    const ctx = fakeCtx({ repo: fakeRepo(clones) });
    const h = composite.build(finding, null, ctx)!;
    expect(h.state).not.toBe("aplicado-eludido");
    expect(h.state).not.toBe("ya-aplicado");
    const appliedCheck = h.checks.find((c) => c.role === "applied");
    expect(appliedCheck?.why).toContain("Sin grafo");
  });

  it("discriminador refuerzo-colección: recursor confirmado CON invokes-indirect hacia un portador collection-element ⇒ pasa", () => {
    const locations: [RoleLocation, ...RoleLocation[]] = [loc("a.ts", 1, 5, "primera copia"), loc("b.ts", 1, 5, "copia #2")];
    const clones = [clone("a.ts", 1, 5, NON_SHAPE_TEXT, "walk"), clone("b.ts", 1, 5, NON_SHAPE_TEXT, "walk")];
    const finding = fakeFinding(locations);
    const graph = completeGraph();
    const carrierNode: CodeGraphNode = {
      id: "carrier:b.ts#Node.render@1",
      kind: "carrier",
      file: "b.ts",
      symbolPath: ["Node", "render"],
      carrierForm: "collection-element",
    };
    const withCarrier = fakeGraph(
      [...graph.nodes, carrierNode],
      [...graph.edges, { from: "sym:b.ts#Node.render", to: carrierNode.id, kind: "invokes-indirect", provenance: "declared", weight: 1 }],
    );
    const ctx = fakeCtx({ repo: fakeRepo(clones) });
    const h = composite.build(finding, withCarrier, ctx)!;
    const reinforcement = h.discriminators.find((c) => c.label.toLowerCase().includes("refuerzo"));
    expect(reinforcement?.passed).toBe(true);
    expect(reinforcement?.why).toContain("collection-element");
  });

  it("discriminador refuerzo-colección: SIN invokes-indirect hacia collection-element ⇒ no pasa, declara por qué (Forma 4 ausente)", () => {
    const locations: [RoleLocation, ...RoleLocation[]] = [loc("a.ts", 1, 5, "primera copia"), loc("b.ts", 1, 5, "copia #2")];
    const clones = [clone("a.ts", 1, 5, NON_SHAPE_TEXT, "walk"), clone("b.ts", 1, 5, NON_SHAPE_TEXT, "walk")];
    const finding = fakeFinding(locations);
    const graph = completeGraph();
    const ctx = fakeCtx({ repo: fakeRepo(clones) });
    const h = composite.build(finding, graph, ctx)!;
    const reinforcement = h.discriminators.find((c) => c.label.toLowerCase().includes("refuerzo"));
    expect(reinforcement?.passed).toBe(false);
    expect(reinforcement?.why).toContain("Forma 4");
  });

  it("evidencia SIEMPRE presente en required/discriminadores, también cuando fallan", () => {
    const locations: [RoleLocation, ...RoleLocation[]] = [loc("a.ts", 1, 5, "primera copia"), loc("b.ts", 1, 5, "copia #2")];
    const clones = [clone("a.ts", 1, 5, NON_SHAPE_TEXT, "walk"), clone("b.ts", 1, 5, NON_SHAPE_TEXT, "walk")];
    const finding = fakeFinding(locations);
    const ctx = fakeCtx({ repo: fakeRepo(clones) });
    const clones2 = [clone("a.ts", 1, 5, SHAPE_TEXT("walk"), "walk"), clone("b.ts", 1, 5, SHAPE_TEXT("visit"), "visit")];
    const h = composite.build(fakeFinding(locations), null, fakeCtx({ repo: fakeRepo(clones2) }))!;
    for (const c of [...h.checks, ...h.discriminators]) {
      expect(c.why.length).toBeGreaterThan(0);
    }
    expect(composite.build(finding, null, ctx)).toBeNull();
  });

  it("`places` reusa las locations del Finding tal cual (subordinada al problema ancla)", () => {
    const locations: [RoleLocation, ...RoleLocation[]] = [loc("a.ts", 1, 5, "primera copia"), loc("b.ts", 1, 5, "copia #2")];
    const clones = [clone("a.ts", 1, 5, SHAPE_TEXT("walk"), "walk"), clone("b.ts", 1, 5, SHAPE_TEXT("visit"), "visit")];
    const finding = fakeFinding(locations);
    const ctx = fakeCtx({ repo: fakeRepo(clones) });
    const h = composite.build(finding, null, ctx)!;
    expect(h.places).toBe(locations);
  });

  it("no matchea una duplicación de otro `kind` (no está en `anchors`) — chequeo directo de la lista de anclas", () => {
    expect(composite.anchors.includes("duplication")).toBe(false);
    expect(composite.anchors.includes("conditional-chain")).toBe(false);
  });

  /**
   * OLA AY, frente AY5 — LA BAJA DEL ANCLA `self-referential-member`, CON SU NÚMERO.
   *
   * Este test es el que impide que la baja se deshaga por descuido en una ola futura, y
   * lleva el número adentro para que quien la quiera revertir tenga que discutir con él.
   *
   * EL NÚMERO: la celda `Composite · self-referential-member` tenía POBLACIÓN VIVA 13 y las
   * 13 JUZGADAS — **V = 0, F = 13, precisión 0 % [0 %, 23 %]**. No es una muestra: es la
   * población entera del corpus de 21 repos. La juzgaron CINCO frentes en CUATRO olas
   * (ola-v/V7, ola-v/INTEGRADOR, ola-w/INTEGRADOR, ola-ad/AD5, ola-ag/AG2), sobre java y
   * csharp y cuatro repos (jenkins, guava, ShareX, newtonsoft-json).
   *
   * COSTO SOBRE VERDADERAS JUZGADAS: **CERO, por definición** — V = 0 con la población
   * completa juzgada, que es la única condición que la Ola AY no negocia.
   *
   * NO SE BORRÓ NADA. El detector `detect/intra-file/self-referential-member.ts` sigue
   * registrado y emitiendo su hallazgo de NIVEL 1 (delta de nivel 1: cero por construcción),
   * y la rama `self-ref` de `composite.ts` —`analizarFormaDelAncla`, `isSelfReferentialAnchor`,
   * `buildSpec`— sigue en pie con todos sus tests, que este archivo sigue corriendo.
   */
  it("OLA AY (AY5): `self-referential-member` NO es ancla de Composite — V=0 sobre las 13 de su población entera", () => {
    expect(composite.anchors.includes("self-referential-member")).toBe(false);
    // El detector NO se dio de baja: sigue registrado y sigue emitiendo nivel 1. Lo que se
    // cortó es el cable de nivel 2, y sólo ése.
    expect(SELF_REFERENTIAL_MEMBER_KIND).toBe("self-referential-member");
  });

  /* ──────────────────────────────────────────────────────────────────────
   * Ola 11a — consumo REAL de `ctx.neighborhood` (registro de pendientes:
   * "1 de 17 hipótesis lee ctx.neighborhood"). `distributed-duplication` es
   * inter-file, así que `attachHypotheses` (hypotheses/run.ts, llamada (2))
   * YA pasa `ctx.neighborhood` real en `build()` — sin necesitar `refresh()`.
   * Construyen el `Neighborhood` con `buildNeighborhoodIndex`/`neighborhoodFor`
   * REALES (no un fake a mano) — mismo estilo END TO END que
   * `strategy.test.ts` usa para su propio `refreshHypotheses`.
   * ────────────────────────────────────────────────────────────────────── */
  describe("Ola 11a — ctx.neighborhood.ego(2): árbol ya formado vs. símbolos sueltos", () => {
    it("los símbolos de los sitios duplicados cuelgan del MISMO árbol (Leaf alcanzable a <=2 saltos de Node) ⇒ discriminador confirma", () => {
      const locations: [RoleLocation, ...RoleLocation[]] = [
        { file: "b.ts", startLine: 1, endLine: 5, role: "primera copia", symbol: "Node" },
        { file: "a.ts", startLine: 1, endLine: 5, role: "copia #2", symbol: "Leaf" },
      ];
      const clones = [clone("a.ts", 1, 5, NON_SHAPE_TEXT, "walk"), clone("b.ts", 1, 5, NON_SHAPE_TEXT, "walk")];
      const finding = fakeFinding(locations);
      const graph = completeGraph();
      const index = buildNeighborhoodIndex(graph, [finding], null);
      const ctx = fakeCtx({ repo: fakeRepo(clones), neighborhood: neighborhoodFor(index, finding) });
      const h = composite.build(finding, graph, ctx)!;
      const treeCheck = h.discriminators.find((c) => c.label.includes("ego"));
      expect(treeCheck?.passed).toBe(true);
      expect(treeCheck?.why).toContain("ego");
    });

    it("locations sin `symbol` (el caso común de hoy) ⇒ no evaluado, declarado, nunca decisivo", () => {
      const locations: [RoleLocation, ...RoleLocation[]] = [loc("a.ts", 1, 5, "primera copia"), loc("b.ts", 1, 5, "copia #2")];
      const clones = [clone("a.ts", 1, 5, NON_SHAPE_TEXT, "walk"), clone("b.ts", 1, 5, NON_SHAPE_TEXT, "walk")];
      const finding = fakeFinding(locations);
      const graph = completeGraph();
      const index = buildNeighborhoodIndex(graph, [finding], null);
      const ctx = fakeCtx({ repo: fakeRepo(clones), neighborhood: neighborhoodFor(index, finding) });
      const h = composite.build(finding, graph, ctx)!;
      const treeCheck = h.discriminators.find((c) => c.label.includes("ego"));
      expect(treeCheck?.passed).toBe(false);
      expect(treeCheck?.why).toContain("símbolo propio");
    });
  });

  describe("Ola 11a — ctx.neighborhood.countOfKind: jerarquía aislada vs. repo entero que duplica", () => {
    it("pocas otras `distributed-duplication` visibles ⇒ jerarquía aislada, discriminador confirma", () => {
      const locations: [RoleLocation, ...RoleLocation[]] = [loc("a.ts", 1, 5, "primera copia"), loc("b.ts", 1, 5, "copia #2")];
      const clones = [clone("a.ts", 1, 5, NON_SHAPE_TEXT, "walk"), clone("b.ts", 1, 5, NON_SHAPE_TEXT, "walk")];
      const finding = fakeFinding(locations);
      const graph = completeGraph();
      const index = buildNeighborhoodIndex(graph, [finding], null); // ninguna OTRA distributed-duplication en el repo.
      const ctx = fakeCtx({ repo: fakeRepo(clones), neighborhood: neighborhoodFor(index, finding) });
      const h = composite.build(finding, graph, ctx)!;
      const isolatedCheck = h.discriminators.find((c) => c.label.toLowerCase().includes("ruido de un repo"));
      expect(isolatedCheck?.passed).toBe(true);
      expect(isolatedCheck?.why).toContain("0 otra");
    });

    it("muchas otras `distributed-duplication` visibles ⇒ ruido difuso del repo, discriminador NO confirma", () => {
      const locations: [RoleLocation, ...RoleLocation[]] = [loc("a.ts", 1, 5, "primera copia"), loc("b.ts", 1, 5, "copia #2")];
      const clones = [clone("a.ts", 1, 5, NON_SHAPE_TEXT, "walk"), clone("b.ts", 1, 5, NON_SHAPE_TEXT, "walk")];
      const finding = fakeFinding(locations);
      const others: Finding[] = Array.from({ length: 4 }, (_, i) =>
        fakeFinding([loc(`x${i}.ts`, 1, 5, "primera copia"), loc(`y${i}.ts`, 1, 5, "copia #2")], { id: `f-other-${i}` }),
      );
      const graph = completeGraph();
      const index = buildNeighborhoodIndex(graph, [finding, ...others], null);
      const ctx = fakeCtx({ repo: fakeRepo(clones), neighborhood: neighborhoodFor(index, finding) });
      const h = composite.build(finding, graph, ctx)!;
      const isolatedCheck = h.discriminators.find((c) => c.label.toLowerCase().includes("ruido de un repo"));
      expect(isolatedCheck?.passed).toBe(false);
      expect(isolatedCheck?.why).toContain("4 otras");
    });
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * OLA V (frente V2) — LA INTENCIÓN SOBRE EL ANCLA AUTORREFERENCIAL.
 *
 * Árboles REALES (`detect/testing.ts`, el mismo `web-tree-sitter` y las mismas
 * gramáticas `.wasm` que producción): la clasificación que estos tests
 * ejercitan es de forma sintáctica, y con un árbol simulado no se probaría
 * nada. Cada caso negativo es una forma MEDIDA en el corpus, con su archivo y
 * su línea reales en el comentario — ninguno inventado para que el test pase.
 * ──────────────────────────────────────────────────────────────────────── */

const TS_WASM = "tree-sitter-typescript.wasm";
const JAVA_WASM = "tree-sitter-java.wasm";
const TS_SETS_PROBE = `
class P { m(x: number): void { if (x > 0) { for (const y of []) { m(y); } } } }
interface I { m(): void }
`;
const CSHARP_WASM = "tree-sitter-c_sharp.wasm";
const CSHARP_SETS_PROBE = `
class P { void M(int x) { if (x > 0) { foreach (var y in new int[0]) { M(y); } } } }
interface I { void M(); }
`;
const JAVA_SETS_PROBE = `
class P { void m(int x) { if (x > 0) { for (int i = 0; i < x; i++) { m(i); } } } }
`;

async function unitFrom(wasm: string, probe: string, source: string, language: string, file: string): Promise<FileUnit> {
  const [sets, root] = await Promise.all([nodeSetsFor(wasm, probe), parseRoot(wasm, source)]);
  return fileUnitFrom(root, sets, language, { file });
}

/** El `Finding` que emite `self-referential-member`: una `location` por miembro, `symbol` = la clase. */
function selfRefFinding(file: string, clase: string, lineas: readonly number[]): Finding {
  const locations = lineas.map((l) => ({ file, startLine: l, endLine: l, symbol: clase, role: `miembro autorreferencial de "${clase}"` }));
  return fakeFinding(locations as [RoleLocation, ...RoleLocation[]], {
    id: "f-selfref-1",
    detectorId: "self-referential-member",
    kind: "self-referential-member",
    scope: "intra-file",
    trigger: [{ label: "miembros autorreferenciales", value: lineas.length, threshold: fakeThreshold() }],
  });
}

/** Línea (1-based) de la primera aparición de `needle` en `source`. */
function lineaDe(source: string, needle: string): number {
  const idx = source.split("\n").findIndex((l) => l.includes(needle));
  if (idx < 0) throw new Error(`no está en la fuente: ${needle}`);
  return idx + 1;
}

describe("hypotheses/composite — OLA V: intención sobre el ancla autorreferencial", () => {
  it("COLECCIÓN de hijos + un miembro que la recorre ⇒ candidata, `ausente`, y los dos required lo dicen", async () => {
    const src = `class Folder {
  children: Folder[] = [];
  render(): string {
    let out = "";
    for (const c of this.children) { out += c.render(); }
    return out;
  }
}`;
    const file = await unitFrom(TS_WASM, TS_SETS_PROBE, src, "typescript", "folder.ts");
    const finding = selfRefFinding("folder.ts", "Folder", [lineaDe(src, "children: Folder[]")]);
    const h = composite.build(finding, null, fakeCtx({ file, repo: fakeRepo([]) }));
    expect(h).not.toBeNull();
    const required = h!.checks.filter((c) => c.role === "required");
    expect(required.every((c) => c.passed)).toBe(true);
    expect(required[0]!.why).toContain("children");
    expect(h!.state).toBe("ausente");
    expect(h!.confidence).not.toBeNull();
    const recorrido = h!.discriminators.find((c) => c.label.includes("estructura de control"));
    expect(recorrido?.passed).toBe(true);
  });

  it("PUNTERO AL PADRE (enlace escalar) ⇒ no es candidata — nest `packages/core/injector/instance-wrapper.ts:95` (`rootInquirer: InstanceWrapper | undefined`)", async () => {
    const src = `class InstanceWrapper {
  private rootInquirer: InstanceWrapper | undefined;
  getRoot(): InstanceWrapper | undefined { return this.rootInquirer; }
}`;
    const file = await unitFrom(TS_WASM, TS_SETS_PROBE, src, "typescript", "wrapper.ts");
    const finding = selfRefFinding("wrapper.ts", "InstanceWrapper", [lineaDe(src, "rootInquirer")]);
    expect(composite.build(finding, null, fakeCtx({ file, repo: fakeRepo([]) }))).toBeNull();
  });

  it("VISTA CACHEADA (el propio tipo instanciado con sus propios parámetros) ⇒ no es candidata — guava `Maps.java:3566` / `Sets.java:2031` / `TreeMultiset.java:127`", async () => {
    const src = `class UnmodifiableNavigableMap<K, V> {
  private UnmodifiableNavigableMap<K, V> descendingMap;
  public UnmodifiableNavigableMap<K, V> descendingMap() { return descendingMap; }
}`;
    const file = await unitFrom(JAVA_WASM, JAVA_SETS_PROBE, src, "java", "Maps.java");
    const finding = selfRefFinding("Maps.java", "UnmodifiableNavigableMap", [lineaDe(src, "private UnmodifiableNavigableMap")]);
    expect(composite.build(finding, null, fakeCtx({ file, repo: fakeRepo([]) }))).toBeNull();
  });

  it("LISTA ENLAZADA INTRUSIVA (`next`) ⇒ no es candidata — guava `AbstractFuture.java:138` (pila de Treiber)", async () => {
    const src = `class Listener {
  Listener next;
  void run() { Listener n = next; while (n != null) { n = n.next; } }
}`;
    const file = await unitFrom(JAVA_WASM, JAVA_SETS_PROBE, src, "java", "AbstractFuture.java");
    const finding = selfRefFinding("AbstractFuture.java", "Listener", [lineaDe(src, "Listener next;")]);
    expect(composite.build(finding, null, fakeCtx({ file, repo: fakeRepo([]) }))).toBeNull();
  });

  it("INTERFAZ FLUIDA (miembro cuyo TIPO es una función que devuelve self) ⇒ no es candidata — vueuse `packages/core/useFetch/index.ts:75`", async () => {
    const src = `class UseFetchReturn<T> {
  get: () => UseFetchReturn<T>;
  run() { return this.get(); }
}`;
    const file = await unitFrom(TS_WASM, TS_SETS_PROBE, src, "typescript", "useFetch.ts");
    const finding = selfRefFinding("useFetch.ts", "UseFetchReturn", [lineaDe(src, "get: () =>")]);
    expect(composite.build(finding, null, fakeCtx({ file, repo: fakeRepo([]) }))).toBeNull();
  });

  it("COLECCIÓN real pero NADIE la opera (DTO / archivo de tipos) ⇒ no es candidata — newtonsoft `JsonSchema.cs:154`, eslint `lib/types/index.d.ts:152`", async () => {
    const src = `class Scope {
  childScopes: Scope[] = [];
  upper: Scope | null = null;
  isStrict(): boolean { return true; }
}`;
    const file = await unitFrom(TS_WASM, TS_SETS_PROBE, src, "typescript", "index.d.ts");
    const finding = selfRefFinding("index.d.ts", "Scope", [lineaDe(src, "childScopes"), lineaDe(src, "upper:")]);
    const h = composite.build(finding, null, fakeCtx({ file, repo: fakeRepo([]) }));
    expect(h).toBeNull();
  });

  it("colección OPERADA pero sin recorrido dentro de una estructura de control ⇒ candidata, y el discriminador NO sube la escalera", async () => {
    const src = `class Folder {
  children: Folder[] = [];
  add(c: Folder): void { this.children.push(c); }
}`;
    const file = await unitFrom(TS_WASM, TS_SETS_PROBE, src, "typescript", "folder.ts");
    const finding = selfRefFinding("folder.ts", "Folder", [lineaDe(src, "children: Folder[]")]);
    const h = composite.build(finding, null, fakeCtx({ file, repo: fakeRepo([]) }));
    expect(h).not.toBeNull();
    const recorrido = h!.discriminators.find((c) => c.label.includes("estructura de control"));
    expect(recorrido?.passed).toBe(false);
    expect(recorrido?.why).toContain("Folder");
  });

  it("`Map<K, Folder>` cuenta como colección (el propio tipo como ARGUMENTO de un genérico de otro tipo)", async () => {
    const src = `class Folder {
  byName: Map<string, Folder> = new Map();
  walk(): void { for (const [, c] of this.byName) { c.walk(); } }
}`;
    const file = await unitFrom(TS_WASM, TS_SETS_PROBE, src, "typescript", "folder.ts");
    const finding = selfRefFinding("folder.ts", "Folder", [lineaDe(src, "byName")]);
    const h = composite.build(finding, null, fakeCtx({ file, repo: fakeRepo([]) }));
    expect(h).not.toBeNull();
    expect(h!.checks.find((c) => c.role === "required")!.why).toContain("byName");
  });

  it("un protocolo de un VECINO de archivo NO cuenta como Composite de este tipo (el falso `parcial` que el grafo trajo en la Ola V)", async () => {
    const src = `class Folder {
  children: Folder[] = [];
  render(): void { for (const c of this.children) { c.render(); } }
}`;
    const file = await unitFrom(TS_WASM, TS_SETS_PROBE, src, "typescript", "folder.ts");
    const finding = selfRefFinding("folder.ts", "Folder", [lineaDe(src, "children: Folder[]")]);
    // El grafo trae una interfaz `Tree` con 2 implementadores (`Leaf`, `Node`)
    // que viven en OTROS archivos, y además un `Vecino` en el MISMO archivo que
    // la implementa: antes de la Ola V eso bastaba para afirmar "protocolo
    // compartido relevante" y devolver `parcial`. `Folder` no implementa nada.
    const graph = fakeGraph(
      [
        ...completeGraph().nodes,
        { id: "sym:folder.ts#Vecino", kind: "symbol", file: "folder.ts", symbolPath: ["Vecino"], family: "class-like" },
        { id: "sym:folder.ts#Folder", kind: "symbol", file: "folder.ts", symbolPath: ["Folder"], family: "class-like" },
      ],
      [...completeGraph().edges, protocolEdge("sym:folder.ts#Vecino", "sym:shared.ts#Tree")],
    );
    const h = composite.build(finding, graph, fakeCtx({ file, repo: fakeRepo([]) }));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    const applied = h!.checks.find((c) => c.role === "applied");
    expect(applied?.why).toContain("Folder");
  });

  it("el tipo anclado SÍ implementa la interfaz, con recursor confirmado y una hoja ⇒ `ya-aplicado` (no es una recomendación)", async () => {
    const src = `class Node {
  children: Node[] = [];
  render(): void { for (const c of this.children) { c.render(); } }
}`;
    const file = await unitFrom(TS_WASM, TS_SETS_PROBE, src, "typescript", "b.ts");
    const finding = selfRefFinding("b.ts", "Node", [lineaDe(src, "children: Node[]")]);
    const h = composite.build(finding, completeGraph(), fakeCtx({ file, repo: fakeRepo([]) }));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ya-aplicado");
    expect(h!.confidence).toBeNull();
  });
  it("C# `IList<Self>` (UN solo argumento de tipo) cuenta como colección — la forma de `JsonSchema.cs:154`", async () => {
    const src = `class JsonSchema {
  public IList<JsonSchema> Items { get; set; }
  public void Walk() { foreach (var i in Items) { i.Walk(); } }
}`;
    const file = await unitFrom(CSHARP_WASM, CSHARP_SETS_PROBE, src, "csharp", "JsonSchema.cs");
    const finding = selfRefFinding("JsonSchema.cs", "JsonSchema", [lineaDe(src, "IList<JsonSchema> Items")]);
    const h = composite.build(finding, null, fakeCtx({ file, repo: fakeRepo([]) }));
    expect(h).not.toBeNull();
    expect(h!.checks.find((c) => c.role === "required")!.why).toContain("Items");
  });

  it("la colección leída SÓLO por constructores no es una operación sobre el árbol ⇒ no es candidata — newtonsoft `Schema/JsonSchemaNode.cs:45`", async () => {
    const src = `class JsonSchemaNode {
  public List<JsonSchemaNode> Items { get; }
  public JsonSchemaNode(JsonSchemaNode source) { Items = new List<JsonSchemaNode>(source.Items); }
}`;
    const file = await unitFrom(CSHARP_WASM, CSHARP_SETS_PROBE, src, "csharp", "JsonSchemaNode.cs");
    const finding = selfRefFinding("JsonSchemaNode.cs", "JsonSchemaNode", [lineaDe(src, "List<JsonSchemaNode> Items")]);
    expect(composite.build(finding, null, fakeCtx({ file, repo: fakeRepo([]) }))).toBeNull();
  });
  it("genérico parametrizado por los PROPIOS parámetros de la clase (celda de tipo propio) no es una colección — guava `MapMakerInternalMap.java:484`", async () => {
    const src = `class StrongKeyWeakValueEntry<K, V> {
  private volatile WeakValueReference<K, V, StrongKeyWeakValueEntry<K, V>> valueReference;
  public V getValue() { return valueReference.get(); }
}`;
    const file = await unitFrom(JAVA_WASM, JAVA_SETS_PROBE, src, "java", "MapMakerInternalMap.java");
    const finding = selfRefFinding("MapMakerInternalMap.java", "StrongKeyWeakValueEntry", [lineaDe(src, "valueReference")]);
    expect(composite.build(finding, null, fakeCtx({ file, repo: fakeRepo([]) }))).toBeNull();
  });

  it("...pero `Map<String, Self<K, V>>` (los parámetros viajan DENTRO del argumento) sigue siendo una colección", async () => {
    const src = `class Folder<K, V> {
  private Map<String, Folder<K, V>> children;
  void render() { for (Folder<K, V> c : children.values()) { c.render(); } }
}`;
    const file = await unitFrom(JAVA_WASM, JAVA_SETS_PROBE, src, "java", "Folder.java");
    const finding = selfRefFinding("Folder.java", "Folder", [lineaDe(src, "Map<String, Folder<K, V>> children")]);
    const h = composite.build(finding, null, fakeCtx({ file, repo: fakeRepo([]) }));
    expect(h).not.toBeNull();
    expect(h!.checks.find((c) => c.role === "required")!.why).toContain("children");
  });

  /* ──────────────────────────────────────────────────────────────────────
   * OLA W (W3) — hermanos del mismo archivo que implementan una INTERFAZ
   * autorreferencial sin cuerpos propios. Forma real, verificada a mano:
   * `newtonsoft-json/.../Converters/XmlNodeConverter.cs:212` (`class
   * XmlNodeWrapper : IXmlNode`) construye y recorre `ChildNodes` en el
   * MISMO archivo que declara `:392 internal interface IXmlNode`.
   * ────────────────────────────────────────────────────────────────────── */
  it("interfaz autorreferencial SIN cuerpo propio + un hermano del archivo que la implementa y recorre la colección EN UN MÉTODO ⇒ candidata (fallback de `hermanosQueImplementan`)", async () => {
    // Forma real, simplificada para aislar el mecanismo: la operación vive en
    // un MÉTODO del implementador (`sets.functionNodes`, lo que el fallback
    // recorre) — ver el docstring del módulo para la reserva declarada sobre
    // la forma exacta de `XmlNodeConverter.cs` (la operación real vive DENTRO
    // del getter de una propiedad, un nodo que `sets.functionNodes` no
    // cubre hoy — mismo límite que ya tiene el camino de la propia clase).
    const src = `interface IXmlNode {
  List<IXmlNode> ChildNodes { get; }
  IXmlNode AppendChild(IXmlNode newChild);
}
class XmlNodeWrapper : IXmlNode {
  private List<IXmlNode> ChildNodes;
  public IXmlNode AppendChild(IXmlNode newChild) {
    foreach (IXmlNode c in ChildNodes) { c.AppendChild(newChild); }
    return newChild;
  }
}`;
    const file = await unitFrom(CSHARP_WASM, CSHARP_SETS_PROBE, src, "csharp", "XmlNodeConverter.cs");
    const finding = selfRefFinding("XmlNodeConverter.cs", "IXmlNode", [lineaDe(src, "List<IXmlNode> ChildNodes { get; }")]);
    const h = composite.build(finding, null, fakeCtx({ file, repo: fakeRepo([]) }));
    expect(h).not.toBeNull();
    const required = h!.checks.find((c) => c.label.includes("Algún miembro function-like"));
    expect(required?.passed).toBe(true);
    expect(required?.why).toContain("XmlNodeWrapper");
  });

  it("interfaz autorreferencial SIN cuerpo propio y SIN ningún hermano que la implemente en el archivo ⇒ sigue sin candidata (el fallback no inventa un implementador)", async () => {
    const src = `interface ILonelyNode {
  List<ILonelyNode> ChildNodes { get; }
}`;
    const file = await unitFrom(CSHARP_WASM, CSHARP_SETS_PROBE, src, "csharp", "Lonely.cs");
    const finding = selfRefFinding("Lonely.cs", "ILonelyNode", [lineaDe(src, "List<ILonelyNode> ChildNodes { get; }")]);
    expect(composite.build(finding, null, fakeCtx({ file, repo: fakeRepo([]) }))).toBeNull();
  });

  it("el fallback NO reabre el embudo de la Ola V: un hermano que sólo COPIA la colección en su constructor sigue sin contar como operación", async () => {
    const src = `interface IReadOnlyNode {
  List<IReadOnlyNode> Items { get; }
}
class ReadOnlyNodeCopy : IReadOnlyNode {
  public List<IReadOnlyNode> Items { get; }
  public ReadOnlyNodeCopy(ReadOnlyNodeCopy source) { Items = new List<IReadOnlyNode>(source.Items); }
}`;
    const file = await unitFrom(CSHARP_WASM, CSHARP_SETS_PROBE, src, "csharp", "ReadOnly.cs");
    const finding = selfRefFinding("ReadOnly.cs", "IReadOnlyNode", [lineaDe(src, "List<IReadOnlyNode> Items { get; }")]);
    expect(composite.build(finding, null, fakeCtx({ file, repo: fakeRepo([]) }))).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * OLA AE (AE7) — EL CAMINO DEL ANCLA-FUERZA `recursive-collection-descent`.
 * Seis tests NUEVOS. Ninguno toca los caminos viejos.
 * ════════════════════════════════════════════════════════════════════════ */

function descensoLoc(file: string, line: number, owner: string, member: string, forma: string): RoleLocation {
  return {
    file,
    startLine: line,
    endLine: line + 6,
    symbol: member,
    anchor: { file, symbolPath: [owner, member] },
    role: `decide hoja-vs-compuesto a mano (${forma}) y desciende sobre \`kids\` (bucle), línea ${line + 2}`,
  };
}

function descensoFinding(
  operaciones: readonly string[],
  forma = "rama sin descenso",
  file = "a.ts",
  owner = "Item",
): Finding {
  const locs = operaciones.map((m, i) => descensoLoc(file, 10 + i * 10, owner, m, forma));
  return fakeFinding(locs as [RoleLocation, ...RoleLocation[]], {
    id: "f-descenso-1",
    detectorId: "recursive-collection-descent",
    kind: "recursive-collection-descent",
    scope: "intra-file",
    trigger: [{ label: "operaciones que deciden hoja-vs-compuesto sobre la misma colección", value: operaciones.length, threshold: fakeThreshold() }],
  });
}

/** El dueño existe como tipo en el grafo y NO declara ningún supertipo. */
function grafoSinSupertipo(): CodeGraph {
  return fakeGraph([classNode("sym:a.ts#Item", "a.ts", "Item")], []);
}

/** El dueño declara un supertipo, pero ese supertipo tiene UN solo subtipo y
 *  no trae la operación: media puerta. */
function grafoConSupertipoSinOperacion(): CodeGraph {
  return fakeGraph(
    [classNode("sym:a.ts#Item", "a.ts", "Item"), classNode("sym:b.ts#Base", "b.ts", "Base")],
    [protocolEdge("sym:a.ts#Item", "sym:b.ts#Base", "implements")],
  );
}

/** La PUERTA COMPLETA: un supertipo con DOS subtipos que YA declara `render`. */
function grafoConPuertaCompleta(): CodeGraph {
  return fakeGraph(
    [
      classNode("sym:a.ts#Item", "a.ts", "Item"),
      classNode("sym:c.ts#Leaf", "c.ts", "Leaf"),
      classNode("sym:b.ts#Node", "b.ts", "Node"),
      methodNode("sym:b.ts#Node.render", "b.ts", "Node", "render", 1),
    ],
    [
      protocolEdge("sym:a.ts#Item", "sym:b.ts#Node", "implements"),
      protocolEdge("sym:c.ts#Leaf", "sym:b.ts#Node", "implements"),
      containsEdge("sym:b.ts#Node", "sym:b.ts#Node.render"),
    ],
  );
}

describe("hypotheses/composite — OLA AE, ancla-fuerza `recursive-collection-descent`", () => {
  it("dos operaciones que deciden a mano y ningún supertipo ⇒ hipótesis `ausente`", () => {
    const h = composite.build(descensoFinding(["render", "total"]), grafoSinSupertipo(), fakeCtx())!;
    expect(h).not.toBeNull();
    expect(h.pattern).toBe("Composite");
    expect(h.state).toBe("ausente");
    expect(h.checks.some((c) => c.role === "required" && c.label.includes("dos operaciones DISTINTAS"))).toBe(true);
  });

  it("el dueño ya declara un supertipo (sin la operación) ⇒ `parcial`, media puerta", () => {
    const h = composite.build(descensoFinding(["render", "total"]), grafoConSupertipoSinOperacion(), fakeCtx())!;
    expect(h.state).toBe("parcial");
  });

  it("LA TRAMPA: el supertipo con >=2 subtipos YA declara la operación ⇒ `required` no se cumple, null", () => {
    const h = composite.build(descensoFinding(["render", "total"]), grafoConPuertaCompleta(), fakeCtx());
    expect(h).toBeNull();
  });

  it("UNA sola operación (por debajo del piso del detector) ⇒ null, ni siquiera candidata", () => {
    const h = composite.build(descensoFinding(["render"]), grafoSinSupertipo(), fakeCtx());
    expect(h).toBeNull();
  });

  it("SIN grafo el `required` de resolución NO aprueba por no poder mirar ⇒ null", () => {
    const h = composite.build(descensoFinding(["render", "total"]), null, fakeCtx());
    expect(h).toBeNull();
  });

  it("el discriminador de rama explícita distingue la rama de la salida temprana", () => {
    const conRama = composite.build(descensoFinding(["render", "total"], "rama sin descenso"), grafoSinSupertipo(), fakeCtx())!;
    const soloGuarda = composite.build(descensoFinding(["render", "total"], "salida temprana"), grafoSinSupertipo(), fakeCtx())!;
    const paso = (h: typeof conRama): boolean => h.discriminators.some((c) => c.label.includes("rama explícita") && c.passed);
    expect(paso(conRama)).toBe(true);
    expect(paso(soloGuarda)).toBe(false);
  });

  it("EL CAMINO VIEJO INTACTO: un `self-referential-member` sigue entrando por su propia rama", () => {
    const locations: [RoleLocation, ...RoleLocation[]] = [loc("a.ts", 1, 5, "primera copia"), loc("b.ts", 1, 5, "segunda copia")];
    const finding = fakeFinding(locations);
    const h = composite.build(finding, null, fakeCtx({ repo: fakeRepo([]) }));
    // Mismo resultado que antes de esta ola: sin forma ni grafo, no es candidata.
    expect(h).toBeNull();
  });
});
