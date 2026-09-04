import { describe, expect, it } from "vitest";

import { hypothesis } from "./iterator.js";
import type { HypothesisContext } from "./types.js";
import { pisoDeclarado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import type { CloneCandidate, Finding, RepoUnit, RoleLocation } from "../detect/types.js";
import { buildNeighborhoodIndex, EMPTY_NEIGHBORHOOD, neighborhoodFor } from "../graph/neighborhood.js";
import { EDGE_ROLE_RECEIVER_MEMBER, symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode } from "../graph/types.js";
import { fileUnitFrom, nodeSetsFor, parseRoot } from "../detect/testing.js";

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
    functionName: "next",
    className: null,
    superclassName: null,
    normalized: "",
    ...overrides,
  };
}

function fakeRepo(overrides: Partial<RepoUnit> = {}): RepoUnit {
  return { repoName: "r", files: [], functions: [], clones: [], graph: null, ...overrides };
}

function fakeCtx(repo: RepoUnit, capabilities: HypothesisContext["capabilities"] = new Set()): HypothesisContext {
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
    neighborhood: EMPTY_NEIGHBORHOOD,
    branches: () => null,
  };
}

// Cursor propio ("i") indexando "items" — misma forma que la fixture
// ITERATOR_OPPORTUNITY de pattern-structural.test.ts (Playlist#currentTrack),
// como texto normalizado en vez de AST. Incremento en sentencia APARTE.
const MANUAL_CURSOR_BODY = "const track = this.items[this.i]; this.i += 1; return track;";
const NO_CURSOR_BODY = "return this.items.length;";
// El idiom REAL de las fixtures canónicas (TS/JS/Go/Vue,
// tests/fixtures/patterns/iterator/*): el incremento vive DENTRO de los
// corchetes (`numbers[i++]`), no en una sentencia aparte.
const INLINE_CURSOR_BODY = "return this.numbers[this.i++];";

const EMPTY_RESOLUTION = { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] };

function sym(file: string, symbolPath: readonly string[], overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return { id: symbolNodeId(file, symbolPath), kind: "symbol", file, symbolPath, family: "class-like", ...overrides };
}
function method(file: string, classPath: string, name: string, arity: number, overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return sym(file, [classPath, name], { family: "function-like", arity, ...overrides });
}
function field(file: string, classPath: string, name: string, overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return sym(file, [classPath, name], { family: "other", ...overrides });
}
function edge(from: string, to: string, kind: CodeGraphEdge["kind"], overrides: Partial<CodeGraphEdge> = {}): CodeGraphEdge {
  return { from, to, kind, provenance: "resolved", weight: 1, ...overrides };
}
function containsAll(ownerId: string, memberIds: readonly string[]): CodeGraphEdge[] {
  return memberIds.map((m) => edge(ownerId, m, "contains"));
}

/**
 * Grafo sintético mínimo con DOS implementadores reales de una interfaz
 * `next()` (aridad 0) — `NumberIterator` (a.ts) y `StringIterator` (b.ts),
 * el mismo par que las dos copias del `Finding` (`distributed-duplication`).
 * Estilo idéntico al de `wrapping-chain.test.ts`: nodos sintéticos, sin
 * `analyzeRepo`.
 */
function twoImplementerGraph(opts: {
  fieldNode?: CodeGraphNode;
  extraEdges?: readonly CodeGraphEdge[];
  extraNodes?: readonly CodeGraphNode[];
} = {}): CodeGraph {
  const iface = sym("a.ts", ["IteratorProtocol"], { family: "namespace-like" });
  const ifaceMember = method("a.ts", "IteratorProtocol", "next", 0);

  const classT = sym("a.ts", ["NumberIterator"]);
  const methodT = method("a.ts", "NumberIterator", "next", 0);

  const classY = sym("b.ts", ["StringIterator"]);
  const methodY = method("b.ts", "StringIterator", "next", 0);

  const nodes: CodeGraphNode[] = [iface, ifaceMember, classT, methodT, classY, methodY];
  const edges: CodeGraphEdge[] = [
    ...containsAll(iface.id, [ifaceMember.id]),
    edge(classT.id, iface.id, "implements"),
    edge(classY.id, iface.id, "implements"),
    ...containsAll(classT.id, [methodT.id]),
    ...containsAll(classY.id, [methodY.id]),
  ];

  if (opts.fieldNode) {
    nodes.push(opts.fieldNode);
    edges.push(edge(classT.id, opts.fieldNode.id, "contains"));
  }
  if (opts.extraNodes) nodes.push(...opts.extraNodes);
  if (opts.extraEdges) edges.push(...opts.extraEdges);

  return { nodes, edges, resolution: EMPTY_RESOLUTION };
}

function twoCopyFinding(): Finding {
  return fakeFinding({
    kind: "distributed-duplication",
    locations: [loc("a.ts", 1, 3), loc("b.ts", 1, 3)],
  });
}

function twoCopyClones(body: string): CloneCandidate[] {
  return [
    fakeClone({ file: "a.ts", startLine: 1, endLine: 3, normalized: body, className: "NumberIterator" }),
    fakeClone({ file: "b.ts", startLine: 1, endLine: 3, normalized: body, className: "StringIterator" }),
  ];
}

describe("hypotheses/iterator", () => {
  /**
   * OLA AE (AE9): el array SUMÓ `exposed-container-traversal` y conservó las
   * dos viejas, midiendo entonces 0 de 10 juzgadas verdaderas.
   *
   * OLA AL (AL1) — SALE `duplication`, y el número que lo justifica ya no es
   * una muestra: es la población COMPLETA. Sobre el volcado del 21-08, con el
   * 100 % de las recomendaciones vivas juzgadas en las DOS poblaciones (AL1
   * juzgó las 17 que faltaban abriendo el archivo real), la celda mide 16
   * recomendaciones en biblioteca y 14 en aplicación, las 30 juzgadas,
   * **0 verdaderas**, y **0 huérfanos de nivel 1** en las dos poblaciones.
   *
   * `distributed-duplication` y `exposed-container-traversal` SIGUEN, y este
   * test es el contrato que impide que un frente futuro las saque sin darse
   * cuenta. El `build` de duplicación queda intacto: lo usa
   * `distributed-duplication`, que comparte todo el camino.
   */
  it("declara sus DOS anclas — `distributed-duplication` (vieja, intacta) y el ancla-fuerza de la Ola AE — SIN `duplication`, retirada por AL1 con 0/30 verdaderas", () => {
    expect(hypothesis.id).toBe("iterator");
    expect(hypothesis.pattern).toBe("Iterator");
    expect(hypothesis.anchors).toEqual(["distributed-duplication", "exposed-container-traversal"]);
    expect(hypothesis.anchors).not.toContain("duplication");
  });

  it("required no cumplido (ninguna copia tiene forma de cursor propio) ⇒ null", () => {
    const finding = fakeFinding({ locations: [loc("a.ts", 1, 5), loc("b.ts", 1, 5)] });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: NO_CURSOR_BODY }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 5, normalized: NO_CURSOR_BODY }),
      ],
    });
    expect(hypothesis.build(finding, null, fakeCtx(repo))).toBeNull();
  });

  it("required no cumplido (ninguna copia resuelve a un CloneCandidate — brecha: locations sin match exacto) ⇒ null", () => {
    const finding = fakeFinding({ locations: [loc("a.ts", 1, 5), loc("b.ts", 1, 5)] });
    const repo = fakeRepo({ clones: [] });
    expect(hypothesis.build(finding, null, fakeCtx(repo))).toBeNull();
  });

  it("UNA copia con cursor propio alcanza para pasar `required` (el ancla ya garantiza ≥2 copias) ⇒ ausente, confidence no nula", () => {
    const finding = fakeFinding({ locations: [loc("a.ts", 1, 5), loc("b.ts", 1, 5)] });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: MANUAL_CURSOR_BODY }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 5, normalized: NO_CURSOR_BODY }),
      ],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo))!;
    expect(h).not.toBeNull();
    expect(h.state).toBe("ausente");
    expect(h.confidence).not.toBeNull();
    expect(h.ceiling).toBe("media");
  });

  it("cursor con incremento DENTRO de los corchetes (numbers[i++], el idiom real de las fixtures canónicas TS/JS/Go/Vue) ⇒ required lo reconoce igual", () => {
    const finding = fakeFinding({ locations: [loc("a.ts", 1, 5), loc("b.ts", 1, 5)] });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: INLINE_CURSOR_BODY }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 5, normalized: NO_CURSOR_BODY }),
      ],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo))!;
    expect(h).not.toBeNull();
    expect(h.state).toBe("ausente"); // sin grafo: sin evidencia estructural, mismo default seguro que antes.
  });

  it("2 copias, mismo archivo (kind duplication), texto idéntico ⇒ 1 discriminador (identical-text), confidence 'media'", () => {
    const finding = fakeFinding({ kind: "duplication", locations: [loc("a.ts", 1, 5), loc("a.ts", 10, 15)] });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: MANUAL_CURSOR_BODY }),
        fakeClone({ file: "a.ts", startLine: 10, endLine: 15, normalized: MANUAL_CURSOR_BODY }),
      ],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo))!;
    expect(h.state).toBe("ausente");
    expect(h.confidence).toBe("media");
  });

  it("3 copias EN ARCHIVOS DISTINTOS (distributed-duplication), texto idéntico ⇒ 3 discriminadores, pero ceiling 'media' TOPA la escalera", () => {
    const finding = fakeFinding({
      kind: "distributed-duplication",
      locations: [loc("a.ts", 1, 5), loc("b.ts", 1, 5), loc("c.ts", 1, 5)],
    });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: MANUAL_CURSOR_BODY }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 5, normalized: MANUAL_CURSOR_BODY }),
        fakeClone({ file: "c.ts", startLine: 1, endLine: 5, normalized: MANUAL_CURSOR_BODY }),
      ],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo))!;
    expect(h.state).toBe("ausente");
    expect(h.discriminators.filter((d) => d.passed)).toHaveLength(3); // rule-of-three + cross-file + identical-text
    expect(h.confidence).toBe("media"); // el TECHO gana, no la escalera perfecta
  });

  it("kind 'duplication' (mismo archivo) ⇒ discriminador cross-file NO confirmado, con evidencia explicando el porqué", () => {
    const finding = fakeFinding({ kind: "duplication", locations: [loc("a.ts", 1, 5), loc("a.ts", 10, 15)] });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: MANUAL_CURSOR_BODY }),
        fakeClone({ file: "a.ts", startLine: 10, endLine: 15, normalized: "distinto" }),
      ],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo))!;
    const crossFileCheck = h.discriminators.find((d) => /DISTRIBUIDA/i.test(d.label));
    expect(crossFileCheck?.passed).toBe(false);
    expect(crossFileCheck?.why.length).toBeGreaterThan(0);
  });

  it("needs: [] ⇒ nunca no-aplicable, incluso con capacidades vacías", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: MANUAL_CURSOR_BODY }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 5, normalized: MANUAL_CURSOR_BODY }),
      ],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo, new Set()))!;
    expect(h.missingCapabilities).toEqual([]);
  });

  it("excluder SIN evidencia: sin grafo (ctx.repo.graph null) ⇒ ausente", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      graph: null,
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: MANUAL_CURSOR_BODY, className: "Playlist" }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 5, normalized: MANUAL_CURSOR_BODY, className: "Playlist" }),
      ],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo))!;
    expect(h.state).toBe("ausente");
  });

  it("excluder SIN evidencia: className null (estilo funcional/receptor sin clase — Vue/Go por receptor) ⇒ ausente, aunque haya grafo", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      graph: twoImplementerGraph(),
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: MANUAL_CURSOR_BODY, className: null }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 5, normalized: MANUAL_CURSOR_BODY, className: null }),
      ],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo))!;
    expect(h.state).toBe("ausente");
  });

  it("excluder SIN evidencia: className presente pero sin nodo de clase en el grafo (archivo/nombre no coincide) ⇒ ausente", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      graph: twoImplementerGraph(),
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: MANUAL_CURSOR_BODY, className: "NoExiste" }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 5, normalized: MANUAL_CURSOR_BODY, className: "NoExiste" }),
      ],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo))!;
    expect(h.state).toBe("ausente");
  });

  /* ── Ola V — NUEVO: descalificación estructural cuando el recorrido vive
   * en un miembro que RECIBE la colección como parámetro (aridad > 0) ────── */

  it("Ola V — REGRESIÓN (guava/Floats.java:209): el miembro que contiene el cursor manual es un miembro PROPIO pero con aridad > 0 (recibe la colección como parámetro) ⇒ not-applicable en ambas copias, required no se cumple, null", () => {
    // `Floats.min(float... array)`: `array` es un parámetro del método
    // ESTÁTICO `min`, no un campo de `Floats` — el idiom real que producía
    // 'ausente' antes de este chequeo (Ola U, verdict 'falso').
    const classT = sym("a.ts", ["Floats"]);
    const minMethod = method("a.ts", "Floats", "min", 1); // 1 parámetro (float... array), NO aridad 0.
    const graph: CodeGraph = {
      nodes: [classT, minMethod],
      edges: [...containsAll(classT.id, [minMethod.id])],
      resolution: EMPTY_RESOLUTION,
    };
    const finding = fakeFinding({ kind: "duplication", locations: [loc("a.ts", 1, 5), loc("a.ts", 10, 15)] });
    const repo = fakeRepo({
      graph,
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: INLINE_CURSOR_BODY, className: "Floats", functionName: "min" }),
        fakeClone({ file: "a.ts", startLine: 10, endLine: 15, normalized: INLINE_CURSOR_BODY, className: "Floats", functionName: "min" }),
      ],
    });
    expect(hypothesis.build(finding, null, fakeCtx(repo))).toBeNull();
  });

  it("Ola V — descalificación es CONSERVADORA: si el miembro NO está registrado en el grafo en absoluto (dato ausente, no aridad>0 confirmada), sigue cayendo en 'none' ⇒ ausente, NO null", () => {
    const classT = sym("a.ts", ["Mystery"]);
    // El grafo NO tiene NINGÚN miembro llamado "next" en `Mystery` — dato ausente, no evidencia de aridad>0.
    const graph: CodeGraph = { nodes: [classT], edges: [], resolution: EMPTY_RESOLUTION };
    const finding = fakeFinding({ kind: "duplication", locations: [loc("a.ts", 1, 5), loc("a.ts", 10, 15)] });
    const repo = fakeRepo({
      graph,
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: INLINE_CURSOR_BODY, className: "Mystery" }),
        fakeClone({ file: "a.ts", startLine: 10, endLine: 15, normalized: INLINE_CURSOR_BODY, className: "Mystery" }),
      ],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo))!;
    expect(h).not.toBeNull();
    expect(h.state).toBe("ausente");
  });

  it("Ola V — MEZCLA: una copia descalificada (aridad > 0) y otra sin evidencia ('none') ⇒ el required pasa (no TODAS descalificadas) y el resultado sigue siendo 'ausente' vía la copia 'none'", () => {
    const classFloats = sym("a.ts", ["Floats"]);
    const minMethod = method("a.ts", "Floats", "min", 1);
    const classOther = sym("b.ts", ["Other"]); // sin miembro "helper" registrado — dato ausente ⇒ "none".
    const graph: CodeGraph = {
      nodes: [classFloats, minMethod, classOther],
      edges: [...containsAll(classFloats.id, [minMethod.id])],
      resolution: EMPTY_RESOLUTION,
    };
    const finding = fakeFinding({ kind: "distributed-duplication", locations: [loc("a.ts", 1, 5), loc("b.ts", 1, 5)] });
    const repo = fakeRepo({
      graph,
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: INLINE_CURSOR_BODY, className: "Floats", functionName: "min" }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 5, normalized: INLINE_CURSOR_BODY, className: "Other", functionName: "helper" }),
      ],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo))!;
    expect(h).not.toBeNull();
    expect(h.state).toBe("ausente");
  });

  it("excluder SIN evidencia: la clase implementa una interfaz, pero con UN SOLO implementador (T solo no alcanza) ⇒ ausente", () => {
    const iface = sym("a.ts", ["Lonely"], { family: "namespace-like" });
    const ifaceMember = method("a.ts", "Lonely", "next", 0);
    const classT = sym("a.ts", ["OnlyOne"]);
    const methodT = method("a.ts", "OnlyOne", "next", 0);
    const graph: CodeGraph = {
      nodes: [iface, ifaceMember, classT, methodT],
      edges: [...containsAll(iface.id, [ifaceMember.id]), edge(classT.id, iface.id, "implements"), ...containsAll(classT.id, [methodT.id])],
      resolution: EMPTY_RESOLUTION,
    };
    const finding = fakeFinding({ kind: "duplication", locations: [loc("a.ts", 1, 5), loc("a.ts", 10, 15)] });
    const repo = fakeRepo({
      graph,
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: INLINE_CURSOR_BODY, className: "OnlyOne" }),
        fakeClone({ file: "a.ts", startLine: 10, endLine: 15, normalized: INLINE_CURSOR_BODY, className: "OnlyOne" }),
      ],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo))!;
    expect(h.state).toBe("ausente");
    expect(h.checks.find((c) => c.role === "applied")?.why).toMatch(/sin protocolo de iteración formalizado/);
  });

  // ── Regresión — caso real medido en newtonsoft-json (TABLA-ARISTAS.md §6):
  // "protocolo confirmado: JsonTextReader.HasLineInfo pertenece a una
  // interfaz con 4 implementadores" era FALSO — HasLineInfo() es
  // IJsonLineInfo (información de línea), sin ninguna relación con el
  // recorrido manual duplicado que disparó el ancla. La clase implementa esa
  // interfaz POR OTRO MOTIVO, en un miembro DISTINTO del que contiene el
  // cursor manual (`clone.functionName`).
  it("LA CONEXIÓN QUE FALTABA (bug real, newtonsoft-json): la clase implementa una interfaz de ≥2 implementadores en un miembro SIN RELACIÓN con el recorrido manual detectado ⇒ sigue 'ausente', NO 'ya-aplicado' con justificación falsa", () => {
    // IJsonLineInfo-shaped: interfaz con un único miembro de aridad 0 sin
    // ninguna relación con iteración, con 2 implementadores reales.
    const iface = sym("a.ts", ["IJsonLineInfo"], { family: "namespace-like" });
    const ifaceMember = method("a.ts", "IJsonLineInfo", "HasLineInfo", 0);
    const classT = sym("a.ts", ["JsonTextReader"]);
    // El miembro que la interfaz exige — SIN relación con el recorrido manual.
    const hasLineInfoMethod = method("a.ts", "JsonTextReader", "HasLineInfo", 0);
    // El miembro que de verdad contiene el cursor manual duplicado
    // (`clone.functionName` más abajo) — NO pertenece a ninguna interfaz.
    const readDataMethod = method("a.ts", "JsonTextReader", "ReadData", 0);
    const otherImplementer = sym("b.ts", ["JsonTextWriter"]);
    const otherImplementerMethod = method("b.ts", "JsonTextWriter", "HasLineInfo", 0);

    const graph: CodeGraph = {
      nodes: [iface, ifaceMember, classT, hasLineInfoMethod, readDataMethod, otherImplementer, otherImplementerMethod],
      edges: [
        ...containsAll(iface.id, [ifaceMember.id]),
        edge(classT.id, iface.id, "implements"),
        edge(otherImplementer.id, iface.id, "implements"),
        ...containsAll(classT.id, [hasLineInfoMethod.id, readDataMethod.id]),
        ...containsAll(otherImplementer.id, [otherImplementerMethod.id]),
      ],
      resolution: EMPTY_RESOLUTION,
    };
    const finding = fakeFinding({ kind: "duplication", locations: [loc("a.ts", 1, 5), loc("a.ts", 10, 15)] });
    const repo = fakeRepo({
      graph,
      clones: [
        // El clon (recorrido manual duplicado) vive en `ReadData`, NUNCA en `HasLineInfo`.
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: INLINE_CURSOR_BODY, className: "JsonTextReader", functionName: "ReadData" }),
        fakeClone({ file: "a.ts", startLine: 10, endLine: 15, normalized: INLINE_CURSOR_BODY, className: "JsonTextReader", functionName: "ReadData" }),
      ],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo))!;
    expect(h.state).toBe("ausente"); // NUNCA 'ya-aplicado': HasLineInfo no tiene relación con el recorrido detectado.
    const applied = h.checks.find((c) => c.role === "applied")!;
    expect(applied.why).not.toMatch(/protocolo confirmado/);
    expect(applied.why).toMatch(/ReadData/); // declara CUÁL miembro buscó, no adivina otro.
  });

  it("LA CONEXIÓN QUE FALTABA, forma positiva: el MISMO miembro que contiene el recorrido manual (ReadData) SÍ pertenece a la interfaz calificada ⇒ ya-aplicado, justificación real", () => {
    const iface = sym("a.ts", ["IReader"], { family: "namespace-like" });
    const ifaceMember = method("a.ts", "IReader", "ReadData", 0);
    const classT = sym("a.ts", ["JsonTextReader"]);
    const readDataMethod = method("a.ts", "JsonTextReader", "ReadData", 0);
    const otherImplementer = sym("b.ts", ["OtherReader"]);
    const otherImplementerMethod = method("b.ts", "OtherReader", "ReadData", 0);
    const graph: CodeGraph = {
      nodes: [iface, ifaceMember, classT, readDataMethod, otherImplementer, otherImplementerMethod],
      edges: [
        ...containsAll(iface.id, [ifaceMember.id]),
        edge(classT.id, iface.id, "implements"),
        edge(otherImplementer.id, iface.id, "implements"),
        ...containsAll(classT.id, [readDataMethod.id]),
        ...containsAll(otherImplementer.id, [otherImplementerMethod.id]),
      ],
      resolution: EMPTY_RESOLUTION,
    };
    const finding = fakeFinding({ kind: "duplication", locations: [loc("a.ts", 1, 5), loc("a.ts", 10, 15)] });
    const repo = fakeRepo({
      graph,
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: INLINE_CURSOR_BODY, className: "JsonTextReader", functionName: "ReadData" }),
        fakeClone({ file: "a.ts", startLine: 10, endLine: 15, normalized: INLINE_CURSOR_BODY, className: "JsonTextReader", functionName: "ReadData" }),
      ],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo))!;
    expect(h.state).toBe("ya-aplicado");
    const applied = h.checks.find((c) => c.role === "applied")!;
    expect(applied.why).toMatch(/protocolo confirmado/);
    expect(applied.why).toMatch(/ReadData/);
  });

  it("clone.functionName ausente (null) ⇒ sin conexión verificable, 'ausente' con evidencia declarando por qué (no adivina)", () => {
    const h = hypothesis.build(
      twoCopyFinding(),
      null,
      fakeCtx(fakeRepo({ graph: twoImplementerGraph(), clones: twoCopyClones(INLINE_CURSOR_BODY).map((c) => ({ ...c, functionName: null })) })),
    )!;
    expect(h.state).toBe("ausente");
    const applied = h.checks.find((c) => c.role === "applied")!;
    expect(applied.why).toMatch(/functionName ausente/);
  });

  it("COMPLETA ⇒ ya-aplicado: 2 implementadores reales de una interfaz con miembro común de aridad 0, sin nodo de campo (brecha declarada) — confidence null", () => {
    const h = hypothesis.build(twoCopyFinding(), null, fakeCtx(fakeRepo({ graph: twoImplementerGraph(), clones: twoCopyClones(INLINE_CURSOR_BODY) })))!;
    expect(h.state).toBe("ya-aplicado");
    expect(h.confidence).toBeNull();
    const applied = h.checks.find((c) => c.role === "applied")!;
    expect(applied.passed).toBe(true);
    expect(applied.why).toMatch(/protocolo confirmado/);
    expect(applied.why).toMatch(/campo sin nodo propio|no tiene nodo propio/);
  });

  it("COMPLETA ⇒ ya-aplicado, VERIFICADA de verdad: campo con nodo propio y CERO references(receiver-member) externas ⇒ 'recorrido encapsulado' en el why", () => {
    const numbersField = field("a.ts", "NumberIterator", "numbers");
    const graph = twoImplementerGraph({ fieldNode: numbersField });
    const h = hypothesis.build(twoCopyFinding(), null, fakeCtx(fakeRepo({ graph, clones: twoCopyClones(INLINE_CURSOR_BODY) })))!;
    expect(h.state).toBe("ya-aplicado");
    const applied = h.checks.find((c) => c.role === "applied")!;
    expect(applied.why).toMatch(/recorrido encapsulado/);
  });

  it("el auto-acceso del propio miembro (this.numbers dentro de next()) NO cuenta como cliente externo ⇒ sigue ya-aplicado", () => {
    const numbersField = field("a.ts", "NumberIterator", "numbers");
    const methodTId = symbolNodeId("a.ts", ["NumberIterator", "next"]);
    const graph = twoImplementerGraph({
      fieldNode: numbersField,
      extraEdges: [edge(methodTId, numbersField.id, "references", { roles: EDGE_ROLE_RECEIVER_MEMBER })],
    });
    const h = hypothesis.build(twoCopyFinding(), null, fakeCtx(fakeRepo({ graph, clones: twoCopyClones(INLINE_CURSOR_BODY) })))!;
    expect(h.state).toBe("ya-aplicado");
  });

  it("PARCIAL ⇒ parcial: protocolo formalizado, pero un cliente EXTERNO referencia la colección con role receiver-member", () => {
    const numbersField = field("a.ts", "NumberIterator", "numbers");
    const externalClient = method("z.ts", "Meddler", "peek", 0);
    const graph = twoImplementerGraph({
      fieldNode: numbersField,
      extraNodes: [externalClient],
      extraEdges: [edge(externalClient.id, numbersField.id, "references", { roles: EDGE_ROLE_RECEIVER_MEMBER })],
    });
    const h = hypothesis.build(twoCopyFinding(), null, fakeCtx(fakeRepo({ graph, clones: twoCopyClones(INLINE_CURSOR_BODY) })))!;
    expect(h.state).toBe("parcial");
    expect(h.confidence).not.toBeNull();
    const applied = h.checks.find((c) => c.role === "applied")!;
    expect(applied.why).toMatch(/fuga de encapsulación/);
    expect(applied.why).toMatch(/z\.ts/);
  });

  it("PARCIAL: sin role receiver-member (p.ej. 'bare') ⇒ NO cuenta como fuga, sigue ya-aplicado", () => {
    const numbersField = field("a.ts", "NumberIterator", "numbers");
    const externalClient = method("z.ts", "Meddler", "peek", 0);
    const graph = twoImplementerGraph({
      fieldNode: numbersField,
      extraNodes: [externalClient],
      extraEdges: [edge(externalClient.id, numbersField.id, "references")], // sin `roles`
    });
    const h = hypothesis.build(twoCopyFinding(), null, fakeCtx(fakeRepo({ graph, clones: twoCopyClones(INLINE_CURSOR_BODY) })))!;
    expect(h.state).toBe("ya-aplicado");
  });

  it("PARCIAL: arista 'ambiguous' hacia el campo ⇒ NO cuenta (confidentEdges la excluye antes de construir el índice)", () => {
    const numbersField = field("a.ts", "NumberIterator", "numbers");
    const externalClient = method("z.ts", "Meddler", "peek", 0);
    const graph = twoImplementerGraph({
      fieldNode: numbersField,
      extraNodes: [externalClient],
      extraEdges: [edge(externalClient.id, numbersField.id, "references", { roles: EDGE_ROLE_RECEIVER_MEMBER, provenance: "ambiguous", alternatives: ["sym:other#Z.x"] })],
    });
    const h = hypothesis.build(twoCopyFinding(), null, fakeCtx(fakeRepo({ graph, clones: twoCopyClones(INLINE_CURSOR_BODY) })))!;
    expect(h.state).toBe("ya-aplicado");
  });

  it("viaSatisfies: el why declara el riesgo A9 cuando el protocolo se resolvió por 'satisfies' en vez de 'implements'", () => {
    const iface = sym("a.ts", ["IteratorProtocol"], { family: "namespace-like" });
    const ifaceMember = method("a.ts", "IteratorProtocol", "next", 0);
    const classT = sym("a.ts", ["NumberIterator"]);
    const methodT = method("a.ts", "NumberIterator", "next", 0);
    const classY = sym("b.ts", ["StringIterator"]);
    const methodY = method("b.ts", "StringIterator", "next", 0);
    const graph: CodeGraph = {
      nodes: [iface, ifaceMember, classT, methodT, classY, methodY],
      edges: [
        ...containsAll(iface.id, [ifaceMember.id]),
        edge(classT.id, iface.id, "satisfies"), // estructural, no declarado
        edge(classY.id, iface.id, "implements"),
        ...containsAll(classT.id, [methodT.id]),
        ...containsAll(classY.id, [methodY.id]),
      ],
      resolution: EMPTY_RESOLUTION,
    };
    const h = hypothesis.build(twoCopyFinding(), null, fakeCtx(fakeRepo({ graph, clones: twoCopyClones(INLINE_CURSOR_BODY) })))!;
    expect(h.state).toBe("ya-aplicado");
    const applied = h.checks.find((c) => c.role === "applied")!;
    expect(applied.why).toMatch(/satisfies/);
    expect(applied.why).toMatch(/A9/);
  });

  it("mezcla: UNA copia con protocolo confirmado+encapsulado y OTRA con protocolo confirmado+fuga ⇒ overall 'parcial' (la fuga de una alcanza)", () => {
    const numbersField = field("a.ts", "NumberIterator", "numbers");
    const externalClient = method("z.ts", "Meddler", "peek", 0);
    // El campo de StringIterator (b.ts) NO tiene nodo — sólo el de a.ts, que además tiene una fuga.
    const graph = twoImplementerGraph({
      fieldNode: numbersField,
      extraNodes: [externalClient],
      extraEdges: [edge(externalClient.id, numbersField.id, "references", { roles: EDGE_ROLE_RECEIVER_MEMBER })],
    });
    const h = hypothesis.build(twoCopyFinding(), null, fakeCtx(fakeRepo({ graph, clones: twoCopyClones(INLINE_CURSOR_BODY) })))!;
    expect(h.state).toBe("parcial");
  });

  it("anchorFindingId cuelga del Finding recibido", () => {
    const finding = fakeFinding({ id: "some-finding-id" });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: MANUAL_CURSOR_BODY }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 5, normalized: MANUAL_CURSOR_BODY }),
      ],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo))!;
    expect(h.anchorFindingId).toBe("some-finding-id");
  });

  it("places lista las copias CONFIRMADAS (con rol), no simplemente todas las locations del Finding", () => {
    const finding = fakeFinding({
      locations: [loc("a.ts", 1, 5), loc("b.ts", 1, 5), loc("c.ts", 1, 5)],
    });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: MANUAL_CURSOR_BODY }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 5, normalized: NO_CURSOR_BODY }),
        fakeClone({ file: "c.ts", startLine: 1, endLine: 5, normalized: MANUAL_CURSOR_BODY }),
      ],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo))!;
    expect(h.places).toHaveLength(2);
    expect(h.places.map((p) => p.file)).toEqual(["a.ts", "c.ts"]);
  });

  it("checks y discriminators traen `why` SIEMPRE, también cuando `passed` es false", () => {
    const finding = fakeFinding({ kind: "duplication", locations: [loc("a.ts", 1, 5), loc("a.ts", 10, 15)] });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: MANUAL_CURSOR_BODY }),
        fakeClone({ file: "a.ts", startLine: 10, endLine: 15, normalized: "otro texto distinto" }),
      ],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo))!;
    for (const c of [...h.checks, ...h.discriminators]) {
      expect(c.why.length).toBeGreaterThan(0);
    }
  });

  it("`aplicado-eludido` NUNCA se produce (brecha declarada: necesitaría la Forma 4 de invocacion-indirecta.ts, fuera de alcance)", () => {
    // Ni siquiera con TODOS los ingredientes de 'ya aplicado' (protocolo
    // formalizado + campo encapsulado) esta hipótesis emite
    // aplicado-eludido — no está en su `appliedState`.
    const numbersField = field("a.ts", "NumberIterator", "numbers");
    const graph = twoImplementerGraph({ fieldNode: numbersField });
    const h = hypothesis.build(twoCopyFinding(), null, fakeCtx(fakeRepo({ graph, clones: twoCopyClones(INLINE_CURSOR_BODY) })))!;
    expect(h.state).not.toBe("aplicado-eludido");
  });

  // ── Verificación contra las fixtures canónicas (tests/fixtures/patterns/
  // iterator/*, = scratchpad/smells/fixtures-multi/iterator/*): el `required`
  // de esta hipótesis cuelga de duplication/distributed-duplication, y
  // NINGUNA de las 6 fixtures canónicas (una implementación única del
  // protocolo, sin duplicar) genera ese Finding en el pipeline real —
  // confirmado corriendo `analyzeRepo` sobre `tests/fixtures/patterns`
  // (ancla sin cambios, "ancla propia: no" de la tarea). Estos tests
  // reproducen la FORMA real de cada cuerpo canónico (texto verbatim de la
  // fixture) más el hecho de grafo que probaría que existe un SEGUNDO
  // implementador legítimo del mismo protocolo — el escenario donde
  // `ya-aplicado` es la clasificación correcta y no un silencio.
  describe("formas reales de las fixtures canónicas (verbatim, ver docstring)", () => {
    it("TypeScript — 'return this.numbers[this.i++];' (NumberIterator.next) ⇒ ya-aplicado", () => {
      const body = "return this.numbers[this.i++];";
      const h = hypothesis.build(twoCopyFinding(), null, fakeCtx(fakeRepo({ graph: twoImplementerGraph(), clones: twoCopyClones(body) })))!;
      expect(h.state).toBe("ya-aplicado");
    });

    it("Go — 'v := it.numbers[it.i]; it.i++; return v' (NumberIterator.Next) ⇒ ya-aplicado", () => {
      const body = "v := it.numbers[it.i]; it.i++; return v";
      const h = hypothesis.build(twoCopyFinding(), null, fakeCtx(fakeRepo({ graph: twoImplementerGraph(), clones: twoCopyClones(body) })))!;
      expect(h.state).toBe("ya-aplicado");
    });

    it("Python — 'value = self._numbers[self._i]\\nself._i += 1\\nreturn value' (__next__) ⇒ ya-aplicado", () => {
      const body = "value = self._numbers[self._i]\nself._i += 1\nreturn value";
      const h = hypothesis.build(twoCopyFinding(), null, fakeCtx(fakeRepo({ graph: twoImplementerGraph(), clones: twoCopyClones(body) })))!;
      expect(h.state).toBe("ya-aplicado");
    });

    it("Vue/closure (bare, sin `this.`) — 'return numbers[i++];' ⇒ required la reconoce, pero SIN clase (className null) el excluder no tiene evidencia ⇒ ausente, brecha declarada", () => {
      // El idiom real de vue.vue es `function useNumberIterator(numbers) { let i = 0; function next() { return numbers[i++]; } ... }`
      // — una función que devuelve un objeto, no una clase. Sin nodo
      // class-like/namespace-like que ancle implements/satisfies, el
      // excluder estructural no tiene forma de confirmar el protocolo —
      // declarado en el docstring del módulo, no un silencio escondido.
      const body = "return numbers[i++];";
      const finding = twoCopyFinding();
      const repo = fakeRepo({
        graph: twoImplementerGraph(),
        clones: [
          fakeClone({ file: "a.ts", startLine: 1, endLine: 3, normalized: body, className: null }),
          fakeClone({ file: "b.ts", startLine: 1, endLine: 3, normalized: body, className: null }),
        ],
      });
      const h = hypothesis.build(finding, null, fakeCtx(repo))!;
      expect(h).not.toBeNull();
      expect(h.state).toBe("ausente");
    });

    it("Ruby — '@numbers.each { |n| yield n }' (NumberCollection#each): sin cursor propio en absoluto ⇒ required no se cumple, null (correcto: el idiom `each` de Ruby YA está encapsulado, no hay olor que reportar)", () => {
      const body = "@numbers.each { |n| yield n }";
      const finding = twoCopyFinding();
      const repo = fakeRepo({
        clones: [
          fakeClone({ file: "a.rb", startLine: 1, endLine: 3, normalized: body, className: "NumberCollection" }),
          fakeClone({ file: "b.rb", startLine: 1, endLine: 3, normalized: body, className: "NumberCollection" }),
        ],
      });
      expect(hypothesis.build(finding, null, fakeCtx(repo))).toBeNull();
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * Ola 11a — consumo REAL de `ctx.neighborhood` (registro de pendientes:
   * "1 de 17 hipótesis lee ctx.neighborhood"). `duplication`/`distributed-
   * duplication` es inter-file, así que `attachHypotheses` (hypotheses/run.ts,
   * llamada (2)) YA pasa `ctx.neighborhood` real en `build()` — sin `refresh()`.
   * `buildNeighborhoodIndex`/`neighborhoodFor` REALES, mismo estilo END TO
   * END que `strategy.test.ts`.
   * ──────────────────────────────────────────────────────────────────────── */
  describe("Ola 11a — ctx.neighborhood.findingsInFile: coexiste con otros hallazgos del mismo archivo", () => {
    it("otro hallazgo en el mismo archivo que la primera copia confirmada ⇒ discriminador confirma", () => {
      const finding = twoCopyFinding();
      const repo = fakeRepo({ clones: twoCopyClones(MANUAL_CURSOR_BODY) });
      const sibling = fakeFinding({ id: "f-sibling", kind: "unused-symbol", locations: [loc("a.ts", 20, 22)] });
      const index = buildNeighborhoodIndex(null, [finding, sibling], null);
      const ctx = fakeCtx(repo);
      const h = hypothesis.build(finding, null, { ...ctx, neighborhood: neighborhoodFor(index, finding) })!;
      const check = h.discriminators.find((c) => c.label.includes("findingsInFile"));
      expect(check?.passed).toBe(true);
      expect(check?.why).toContain("unused-symbol");
    });

    it("sin ningún otro hallazgo en el archivo ⇒ discriminador NO confirma, declarado", () => {
      const finding = twoCopyFinding();
      const repo = fakeRepo({ clones: twoCopyClones(MANUAL_CURSOR_BODY) });
      const index = buildNeighborhoodIndex(null, [finding], null);
      const ctx = fakeCtx(repo);
      const h = hypothesis.build(finding, null, { ...ctx, neighborhood: neighborhoodFor(index, finding) })!;
      const check = h.discriminators.find((c) => c.label.includes("findingsInFile"));
      expect(check?.passed).toBe(false);
      expect(check?.why).toContain("aislado");
    });
  });

  describe("Ola 11a — ctx.neighborhood.findingsOfKind: el mismo recorrido repetido en OTRO hallazgo", () => {
    it("otro Finding del mismo kind, en otro par de archivos, con el MISMO recorrido manual ⇒ repetición cruzada ENTRE hallazgos confirmada", () => {
      const finding = twoCopyFinding();
      const otherFinding = fakeFinding({
        id: "f-other",
        kind: "distributed-duplication",
        locations: [loc("c.ts", 1, 3), loc("d.ts", 1, 3)],
      });
      const repo = fakeRepo({
        clones: [
          ...twoCopyClones(MANUAL_CURSOR_BODY),
          fakeClone({ file: "c.ts", startLine: 1, endLine: 3, normalized: MANUAL_CURSOR_BODY, className: "OtherIterator" }),
          fakeClone({ file: "d.ts", startLine: 1, endLine: 3, normalized: MANUAL_CURSOR_BODY, className: "OtherIterator2" }),
        ],
      });
      const index = buildNeighborhoodIndex(null, [finding, otherFinding], null);
      const ctx = fakeCtx(repo);
      const h = hypothesis.build(finding, null, { ...ctx, neighborhood: neighborhoodFor(index, finding) })!;
      const check = h.discriminators.find((c) => c.label.includes("findingsOfKind"));
      expect(check?.passed).toBe(true);
      expect(check?.why).toContain("f-other");
    });

    it("sin ningún otro Finding con la misma forma de recorrido ⇒ NO confirma, declarado", () => {
      const finding = twoCopyFinding();
      const otherFinding = fakeFinding({
        id: "f-other-no-cursor",
        kind: "distributed-duplication",
        locations: [loc("c.ts", 1, 3), loc("d.ts", 1, 3)],
      });
      const repo = fakeRepo({
        clones: [
          ...twoCopyClones(MANUAL_CURSOR_BODY),
          fakeClone({ file: "c.ts", startLine: 1, endLine: 3, normalized: NO_CURSOR_BODY, className: "OtherThing" }),
          fakeClone({ file: "d.ts", startLine: 1, endLine: 3, normalized: NO_CURSOR_BODY, className: "OtherThing2" }),
        ],
      });
      const index = buildNeighborhoodIndex(null, [finding, otherFinding], null);
      const ctx = fakeCtx(repo);
      const h = hypothesis.build(finding, null, { ...ctx, neighborhood: neighborhoodFor(index, finding) })!;
      const check = h.discriminators.find((c) => c.label.includes("findingsOfKind"));
      expect(check?.passed).toBe(false);
    });
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * EL CAMINO DE ENTRADA DEL ANCLA-FUERZA — Ola AE, frente AE9
 *
 * Seis tests del camino NUEVO (`exposed-container-traversal`), más el que
 * prueba que el camino VIEJO no se enteró de nada.
 * ════════════════════════════════════════════════════════════════════════ */
describe("hypotheses/iterator — el ancla-fuerza `exposed-container-traversal` (Ola AE, AE9)", () => {
  const CLIENT = "client.js";
  const OWNER = "owner.js";
  const OWNER_ID = `sym:${OWNER}#Holder`;
  const CONTAINER_ID = `sym:${OWNER}#Holder.items`;
  const CLIENT_ID = `sym:${CLIENT}#walk`;
  const SOURCE = `
function walk(holder) {
  let i = 0;
  while (i < 10) {
    process(holder.items[i]);
    i++;
  }
}
`;
  const PROBE = `
function probe(value) {
  for (let i = 0; i < value.length; i++) { console.log(value.items[i]); }
  if (value) { return 1; } else { return 2; }
}
class Probe {
  constructor(seed) { this.seed = seed; }
  run(value) {
    for (let i = 0; i < value.length; i++) { console.log(value.items[i]); }
    if (value) { return 1; } else { return 2; }
  }
}
`;

  function gnode(over: Partial<CodeGraphNode> & { id: string; file: string; symbolPath: string[] }): CodeGraphNode {
    return { kind: "symbol", family: "other", ...over } as CodeGraphNode;
  }
  function gedge(from: string, to: string, over: Partial<CodeGraphEdge> = {}): CodeGraphEdge {
    return { from, to, kind: "references", provenance: "resolved", weight: 1, ...over } as CodeGraphEdge;
  }

  function exposedGraph(opts: { clients?: number; halfDoor?: boolean } = {}): CodeGraph {
    const clients = opts.clients ?? 3;
    const nodes: CodeGraphNode[] = [
      gnode({ id: OWNER_ID, file: OWNER, symbolPath: ["Holder"], family: "class-like" }),
      gnode({ id: CONTAINER_ID, file: OWNER, symbolPath: ["Holder", "items"], family: "other" }),
      gnode({ id: CLIENT_ID, file: CLIENT, symbolPath: ["walk"], family: "function-like", arity: 1 }),
    ];
    const edges: CodeGraphEdge[] = [
      gedge(OWNER_ID, CONTAINER_ID, { kind: "contains", provenance: "declared" }),
      gedge(CLIENT_ID, CONTAINER_ID, { roles: EDGE_ROLE_RECEIVER_MEMBER }),
    ];
    for (let i = 1; i < clients; i++) {
      const id = `sym:cliente${i}.js#usa`;
      nodes.push(gnode({ id, file: `cliente${i}.js`, symbolPath: ["usa"], family: "function-like", arity: 0 }));
      edges.push(gedge(id, CONTAINER_ID, { roles: EDGE_ROLE_RECEIVER_MEMBER, provenance: "ambiguous" }));
    }
    if (opts.halfDoor) {
      const door = `${OWNER_ID}.each`;
      nodes.push(gnode({ id: door, file: OWNER, symbolPath: ["Holder", "each"], family: "function-like", arity: 0 }));
      edges.push(gedge(OWNER_ID, door, { kind: "contains", provenance: "declared" }));
      edges.push(gedge(door, CONTAINER_ID, { roles: EDGE_ROLE_RECEIVER_MEMBER }));
    }
    return { nodes, edges, resolution: EMPTY_RESOLUTION } as CodeGraph;
  }

  async function ctxFor(graph: CodeGraph | null): Promise<HypothesisContext> {
    const sets = await nodeSetsFor("tree-sitter-javascript.wasm", PROBE);
    const root = await parseRoot("tree-sitter-javascript.wasm", SOURCE);
    const file = fileUnitFrom(root, sets, "javascript", { file: CLIENT });
    return { ...fakeCtx(fakeRepo({ graph })), file };
  }

  function exposedFinding(): Finding {
    return fakeFinding({
      id: "f-exposed",
      detectorId: "exposed-container-traversal",
      kind: "exposed-container-traversal",
      scope: "intra-file",
      language: "javascript",
      locations: [loc(CLIENT, 5, 5, "recorrido posicional")],
    });
  }

  it("la forma completa ⇒ `ausente`, con los tres `required` sostenidos", async () => {
    const h = hypothesis.build(exposedFinding(), null, await ctxFor(exposedGraph()))!;
    expect(h).not.toBeNull();
    expect(h.pattern).toBe("Iterator");
    expect(h.state).toBe("ausente");
    const labels = h.checks.map((c) => c.label).join(" | ");
    expect(labels).toContain("Re-verificado contra el árbol vivo");
    expect(labels).toContain("miembro de un tipo declarado en OTRO archivo");
    expect(labels).toContain("contrato de hecho");
    expect(h.checks.filter((c) => c.role !== "applied").every((c) => c.passed)).toBe(true);
  });

  it("media puerta escrita en el dueño (miembro propio que lee el contenedor, sin clientes) ⇒ `parcial`, NO `ausente`", async () => {
    const h = hypothesis.build(exposedFinding(), null, await ctxFor(exposedGraph({ halfDoor: true })))!;
    expect(h.state).toBe("parcial");
    expect(h.checks.find((c) => c.label === "puerta-de-recorrido-del-dueño")?.why).toContain("each");
    expect(h.state).not.toBe("ya-aplicado");
  });

  it("los dos estados que este camino produce son RECOMENDACIÓN: `ya-aplicado` y `aplicado-eludido` son inalcanzables POR CONSTRUCCIÓN", async () => {
    const sinPuerta = hypothesis.build(exposedFinding(), null, await ctxFor(exposedGraph()))!;
    const conPuerta = hypothesis.build(exposedFinding(), null, await ctxFor(exposedGraph({ halfDoor: true })))!;
    expect([sinPuerta.state, conPuerta.state].sort()).toEqual(["ausente", "parcial"]);
  });

  it("sin árbol vivo el `required` NO aprueba: nunca 'no pude mirar, apruebo' ⇒ null", () => {
    const ctx = { ...fakeCtx(fakeRepo({ graph: exposedGraph() })), file: null };
    expect(hypothesis.build(exposedFinding(), null, ctx)).toBeNull();
  });

  it("sin grafo ⇒ null (el dueño no se puede identificar y no se adivina)", async () => {
    expect(hypothesis.build(exposedFinding(), null, await ctxFor(null))).toBeNull();
  });

  it("por debajo del piso de escala (2 archivos cliente) ⇒ null", async () => {
    expect(hypothesis.build(exposedFinding(), null, await ctxFor(exposedGraph({ clients: 2 })))).toBeNull();
  });

  it("EL CAMINO VIEJO NO SE ENTERÓ: un Finding de duplicación sigue dando exactamente lo de siempre", () => {
    const h = hypothesis.build(twoCopyFinding(), null, fakeCtx(fakeRepo({ clones: twoCopyClones(MANUAL_CURSOR_BODY) })))!;
    expect(h.state).toBe("ausente");
    expect(h.checks.map((c) => c.label).join(" | ")).not.toContain("Re-verificado contra el árbol vivo");
  });
});
