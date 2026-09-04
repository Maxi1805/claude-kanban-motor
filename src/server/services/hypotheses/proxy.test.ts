/**
 * Tests de `hypotheses/proxy.ts`. Mismas convenciones que
 * `hypotheses/iterator.test.ts` (fakes de `Finding`/`CloneCandidate`/
 * `RepoUnit`/`HypothesisContext`) — la señal PRIMARIA de esta hipótesis
 * también es texto (`CloneCandidate.normalized`), por la misma razón
 * (`duplication`/`scattered-instantiation` son inter-file, `ctx.fileAt`
 * siempre `null` en el cableado actual). El excluder de "ya aplicado" SÍ
 * necesita un árbol vivo — para esos pocos tests se construye un `AstNode`
 * a mano (sin tree-sitter: la interfaz es angosta y esto es determinístico).
 *
 * APAGADO (ver el docstring de cabecera de `proxy.ts`): Proxy midió 0/28
 * verdaderas contra código real (Ola D) y esta ola confirmó 0 grupos con
 * guarda real repetida en 606 archivos/427 grupos de las dos poblaciones —
 * `hypothesis.build`/`hypothesis.refresh` (el objeto REALMENTE registrado en
 * `hypotheses/registry.ts`, lo único que el pipeline llama) devuelven `null`
 * incondicionalmente ahora. La mayoría de los tests de abajo NO desapareció:
 * se movieron de `hypothesis.build(...)`/`hypothesis.refresh!(...)` a
 * `evaluateProxyHypothesis(...)`/`refreshProxyHypothesis(...)` — la MISMA
 * función, ahora exportada aparte porque el pipeline ya no la llama — para
 * seguir probando la clasificación estructural completa (útil para una
 * reactivación futura, condición exacta en `proxy.ts`). El único test que SÍ
 * habla de `hypothesis.build`/`hypothesis.refresh` a secas está al final
 * ("APAGADO") y es la compuerta real: si alguna vez vuelve a emitir algo,
 * ESE test se pone rojo.
 */
import { describe, expect, it } from "vitest";

import { evaluateAccessControlHypothesis, evaluateProxyHypothesis, extractGuardField, hypothesis, refreshProxyHypothesis, scanFileForProxyFields } from "./proxy.js";
import { detector as accessControlDetector } from "../detect/intra-file/repeated-access-control.js";
import { fileUnitFrom, nodeSetsFor, parseRoot, testContext } from "../detect/testing.js";
import type { HypothesisContext, PatternHypothesis, PatternHypothesisDraft } from "./types.js";
import { pisoDeclarado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import type { AstNode, CloneCandidate, FileUnit, Finding, RawFinding, RoleLocation } from "../detect/types.js";
import type { DerivedNodeSets } from "../code-grammar.js";
import { EMPTY_NEIGHBORHOOD } from "../graph/neighborhood.js";

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
    language: null,
    title: "t",
    detail: "d",
    trigger: [{ label: "copias", value: 2, threshold: fakeThreshold() }],
    locations: [loc("a.ts", 1, 5), loc("a.ts", 10, 15)],
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
    nodes: 8,
    type: "if_statement",
    functionName: "buildSummary",
    className: "ReportBuilder",
    superclassName: null,
    normalized: "",
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

function fakeCtx(overrides: Partial<HypothesisContext> = {}): HypothesisContext {
  return {
    file: null,
    fileAt: () => null,
    repo: { repoName: "r", files: [], functions: [], clones: [], graph: null },
    capabilities: new Set(["unidad-tipo-clase"]),
    setsFor: () => EMPTY_SETS,
    neighborhood: EMPTY_NEIGHBORHOOD,
    branches: () => null,
    ...overrides,
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * `extractGuardField` — la señal de texto, aislada de `Finding`/`ctx`.
 * ──────────────────────────────────────────────────────────────────────── */

describe("extractGuardField", () => {
  it("TypeScript/JavaScript: `if (!this.x) { this.x = new X(); }`", () => {
    expect(extractGuardField("if (!this.engine) { this.engine = new HeavyEngine(); }")).toBe("engine");
  });

  it("Ruby: `@x ||= X.new`", () => {
    expect(extractGuardField("@engine ||= HeavyEngine.new")).toBe("engine");
  });

  it("Python: `if not self.x: self.x = X()`", () => {
    expect(extractGuardField("if not self.engine: self.engine = HeavyEngine()")).toBe("engine");
  });

  it("Go: `if recv.x == nil { recv.x = &X{} }` — CUALQUIER nombre de receptor, sin listarlo", () => {
    expect(extractGuardField("if b.engine == nil { b.engine = &HeavyEngine{} }")).toBe("engine");
  });

  it("sin marcador de construcción ⇒ null (no es inicialización perezosa)", () => {
    expect(extractGuardField("if (!this.engine) { this.engine = other.engine; }")).toBeNull();
  });

  it("sin marcador de negación/nulidad ⇒ null (no es una guarda)", () => {
    expect(extractGuardField("this.engine = new HeavyEngine();")).toBeNull();
  });

  it("dos campos distintos en el mismo fragmento ⇒ ambiguo, null (más seguro no emitir que adivinar)", () => {
    expect(extractGuardField("if (!this.engine) { this.other = new HeavyEngine(); }")).toBeNull();
  });

  it("un solo token de acceso (no se repite) ⇒ null", () => {
    expect(extractGuardField("this.engine.start();")).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * `evaluateProxyHypothesis` (la lógica de clasificación, antes
 * `hypothesis.build`) — metadata y el `required` sobre `ctx.repo.clones`.
 * ──────────────────────────────────────────────────────────────────────── */

const GUARD_TS = "if (!this.engine) { this.engine = new HeavyEngine(); }";
const GUARD_TS_2 = "if (! this.engine) { this.engine = new HeavyEngine(); }"; // texto NO idéntico (espacio extra)

describe("hypotheses/proxy — metadata", () => {
  it("declara su ancla, patrón e id", () => {
    expect(hypothesis.id).toBe("proxy");
    expect(hypothesis.pattern).toBe("Proxy (inicialización perezosa)");
    // SUMA el ancla nueva de la Ola AE (frente AE13) y CONSERVA las tres viejas
    // — las viejas siguen apagadas, con su medición intacta (0/28 verdaderas).
    expect(hypothesis.anchors).toEqual(["duplication", "scattered-instantiation", "lazy-init-repetida", "repeated-access-control"]);
  });
});

describe("hypotheses/proxy — required (umbral del catálogo: <2 sitios calificados ⇒ nada)", () => {
  it("0 clones ⇒ null", () => {
    const finding = fakeFinding();
    expect(evaluateProxyHypothesis(finding, null, fakeCtx())).toBeNull();
  });

  it("1 solo sitio con forma de guarda (memoización normal, catálogo) ⇒ null", () => {
    const finding = fakeFinding({ locations: [loc("a.ts", 1, 5)] });
    const repo = { repoName: "r", files: [], functions: [], clones: [fakeClone({ normalized: GUARD_TS })], graph: null };
    expect(evaluateProxyHypothesis(finding, null, fakeCtx({ repo }))).toBeNull();
  });

  it("2 clones, pero SIN forma de guarda (duplicación de otra cosa) ⇒ null", () => {
    const finding = fakeFinding();
    const repo = {
      repoName: "r",
      files: [],
      functions: [],
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: "return this.engine.summary();" }),
        fakeClone({ file: "a.ts", startLine: 10, endLine: 15, normalized: "return this.engine.summary();" }),
      ],
      graph: null,
    };
    expect(evaluateProxyHypothesis(finding, null, fakeCtx({ repo }))).toBeNull();
  });

  it("2 clones con forma de guarda pero en CLASES DISTINTAS ⇒ null (no es 'la misma clase')", () => {
    const finding = fakeFinding();
    const repo = {
      repoName: "r",
      files: [],
      functions: [],
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, className: "ReportBuilder", normalized: GUARD_TS }),
        fakeClone({ file: "a.ts", startLine: 10, endLine: 15, className: "OtherClass", normalized: GUARD_TS }),
      ],
      graph: null,
    };
    expect(evaluateProxyHypothesis(finding, null, fakeCtx({ repo }))).toBeNull();
  });

  it("2 clones guarda, sin clase (className null — variante funcional/brecha declarada) ⇒ null", () => {
    const finding = fakeFinding();
    const repo = {
      repoName: "r",
      files: [],
      functions: [],
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, className: null, normalized: GUARD_TS }),
        fakeClone({ file: "a.ts", startLine: 10, endLine: 15, className: null, normalized: GUARD_TS }),
      ],
      graph: null,
    };
    expect(evaluateProxyHypothesis(finding, null, fakeCtx({ repo }))).toBeNull();
  });

  it("clones fuera de las ubicaciones del hallazgo ⇒ no cuentan ⇒ null", () => {
    const finding = fakeFinding({ locations: [loc("a.ts", 100, 105), loc("a.ts", 200, 205)] });
    const repo = {
      repoName: "r",
      files: [],
      functions: [],
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: GUARD_TS }),
        fakeClone({ file: "a.ts", startLine: 10, endLine: 15, normalized: GUARD_TS }),
      ],
      graph: null,
    };
    expect(evaluateProxyHypothesis(finding, null, fakeCtx({ repo }))).toBeNull();
  });
});

describe("hypotheses/proxy — oportunidad (ausente) y escalera de confianza", () => {
  it("2 sitios calificados, misma clase, mismo campo ⇒ ausente, confidence no nula", () => {
    const finding = fakeFinding();
    const repo = {
      repoName: "r",
      files: [],
      functions: [],
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: GUARD_TS }),
        fakeClone({ file: "a.ts", startLine: 10, endLine: 15, normalized: GUARD_TS }),
      ],
      graph: null,
    };
    const h = evaluateProxyHypothesis(finding, null, fakeCtx({ repo }));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    expect(h!.confidence).not.toBeNull();
    expect(h!.ceiling).toBe("alta");
    expect(h!.anchorFindingId).toBe("f1");
    expect(h!.places).toHaveLength(2);
  });

  it("exactamente 2 sitios con texto DISTINTO ⇒ ningún discriminador confirmado ⇒ confidence 'baja'", () => {
    const finding = fakeFinding();
    const repo = {
      repoName: "r",
      files: [],
      functions: [],
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: GUARD_TS }),
        fakeClone({ file: "a.ts", startLine: 10, endLine: 15, normalized: GUARD_TS_2 }),
      ],
      graph: null,
    };
    const h = evaluateProxyHypothesis(finding, null, fakeCtx({ repo }))!;
    expect(h.confidence).toBe("baja");
  });

  it("2 sitios, texto idéntico ⇒ 1 discriminador confirmado ⇒ confidence 'media'", () => {
    const finding = fakeFinding();
    const repo = {
      repoName: "r",
      files: [],
      functions: [],
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: GUARD_TS }),
        fakeClone({ file: "a.ts", startLine: 10, endLine: 15, normalized: GUARD_TS }),
      ],
      graph: null,
    };
    const h = evaluateProxyHypothesis(finding, null, fakeCtx({ repo }))!;
    expect(h.confidence).toBe("media");
  });

  it("3 sitios calificados, texto idéntico ⇒ 2 discriminadores confirmados ⇒ confidence 'alta' (ceiling)", () => {
    const finding = fakeFinding({ locations: [loc("a.ts", 1, 5), loc("a.ts", 10, 15), loc("a.ts", 20, 25)] });
    const repo = {
      repoName: "r",
      files: [],
      functions: [],
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: GUARD_TS }),
        fakeClone({ file: "a.ts", startLine: 10, endLine: 15, normalized: GUARD_TS }),
        fakeClone({ file: "a.ts", startLine: 20, endLine: 25, normalized: GUARD_TS }),
      ],
      graph: null,
    };
    const h = evaluateProxyHypothesis(finding, null, fakeCtx({ repo }))!;
    expect(h.discriminators.filter((d) => d.passed)).toHaveLength(2); // tres-o-más + texto-idéntico (AST no disponible)
    expect(h.confidence).toBe("alta");
  });

  it("sin 'needs' declarado (RETIRADO esta ola): con capacidades vacías sigue siendo aplicable — Go nunca declara 'unidad-tipo-clase' pero esta hipótesis SÍ lo cubre vía el receptor de método", () => {
    const finding = fakeFinding();
    const repo = {
      repoName: "r",
      files: [],
      functions: [],
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: GUARD_TS }),
        fakeClone({ file: "a.ts", startLine: 10, endLine: 15, normalized: GUARD_TS }),
      ],
      graph: null,
    };
    const h = evaluateProxyHypothesis(finding, null, fakeCtx({ repo, capabilities: new Set() }))!;
    expect(h.missingCapabilities).toEqual([]);
    expect(h.confidence).not.toBeNull();
  });

  it("ancla secundaria `scattered-instantiation`: sitios de instanciación SIN guarda ⇒ null (declarado: la ancla es más débil y en la práctica queda muda)", () => {
    const finding = fakeFinding({
      kind: "scattered-instantiation",
      detectorId: "scattered-instantiation",
      locations: [loc("a.ts", 1, 1), loc("b.ts", 5, 5), loc("c.ts", 9, 9)],
    });
    // Sin clones que solapen estas ubicaciones (las instanciaciones dispersas
    // no son, por sí solas, fragmentos clonados) — comportamiento REAL medido
    // en el corpus, ver el resultado final de la tarea.
    expect(evaluateProxyHypothesis(finding, null, fakeCtx())).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * El excluder de "ya aplicado" — necesita un árbol vivo (`ctx.fileAt`).
 * Construido a mano: la interfaz `AstNode` es angosta (type/isNamed/
 * childCount/child/childForFieldName/text/startPosition/endPosition), así
 * que no hace falta tree-sitter para ejercitarla de forma determinística.
 * ──────────────────────────────────────────────────────────────────────── */

interface Spec {
  type: string;
  text?: string;
  isNamed?: boolean;
  fields?: Record<string, Spec>;
  extraChildren?: Spec[];
}

let rowCounter = 0;
function build(spec: Spec): AstNode {
  const row = rowCounter++;
  const fieldNodes: Record<string, AstNode> = {};
  for (const [k, v] of Object.entries(spec.fields ?? {})) fieldNodes[k] = build(v);
  const extra = (spec.extraChildren ?? []).map((c) => build(c));
  const allChildren = [...Object.values(fieldNodes), ...extra];
  const node: AstNode = {
    type: spec.type,
    isNamed: spec.isNamed ?? true,
    childCount: allChildren.length,
    startPosition: { row, column: 0 },
    endPosition: { row, column: 1 },
    text: spec.text ?? spec.type,
    child: (i: number) => allChildren[i] ?? null,
    childForFieldName: (name: string) => fieldNodes[name] ?? null,
  };
  return node;
}

/** `this.<field>` (o `self.<field>`) como nodo de acceso a miembro: el
 *  campo "object" apunta a un identificador con texto `receiver`, y un
 *  hijo EXTRA (no-campo) lleva el nombre del miembro — así es como
 *  `memberNameOf`/`fieldKeyOf` lo leen en producción. */
function selfAccess(receiver: string, field: string): Spec {
  return {
    type: "member_expression",
    text: `${receiver}.${field}`,
    fields: { object: { type: "identifier", text: receiver } },
    extraChildren: [{ type: "property_identifier", text: field }],
  };
}

function newExpr(typeName: string): Spec {
  return { type: "new_expression", text: `new ${typeName}()` };
}

/** `if (!this.<field>) { this.<field> = new <ctorName>(); }` */
function guardStatement(field: string, ctorName: string): Spec {
  return {
    type: "if_statement",
    fields: {
      condition: { type: "unary_expression", text: "!", extraChildren: [selfAccess("this", field)] },
      consequence: {
        type: "statement_block",
        extraChildren: [
          {
            type: "assignment_expression",
            fields: { left: selfAccess("this", field), right: newExpr(ctorName) },
          },
        ],
      },
    },
  };
}

/** `return this.<field>;` */
function returnSelfField(field: string): Spec {
  return { type: "return_statement", extraChildren: [selfAccess("this", field)] };
}

/** `return this.<field>.<call>();` — NO debe calificar como accessor dedicado. */
function returnChainedCall(field: string): Spec {
  return {
    type: "return_statement",
    extraChildren: [{ type: "call_expression", fields: { function: selfAccess("this", field) } }],
  };
}

function method(name: string, ...stmts: Spec[]): Spec {
  return {
    type: "method_definition",
    fields: {
      name: { type: "property_identifier", text: name },
      body: { type: "statement_block", extraChildren: stmts },
    },
  };
}

function classNode(name: string, ...members: Spec[]): Spec {
  return {
    type: "class_declaration",
    fields: { name: { type: "identifier", text: name } },
    extraChildren: [{ type: "class_body", extraChildren: members }],
  };
}

const AST_SETS: DerivedNodeSets = {
  ...EMPTY_SETS,
  classNodes: new Set(["class_declaration"]),
  functionNodes: new Set(["method_definition"]),
};

function ctxWithFile(root: AstNode, path = "a.ts"): HypothesisContext {
  return fakeCtx({
    fileAt: (p) => (p === path ? { path, language: "typescript", lines: 20, root, sets: AST_SETS, functions: [] } : null),
    setsFor: () => AST_SETS,
  });
}

describe("scanFileForProxyFields — el excluder de ya aplicado, sobre AST", () => {
  it("un método CON accessor dedicado (guarda + devolver el campo, nada más) se identifica como tal", () => {
    rowCounter = 0;
    const root = build(classNode("ReportBuilder", method("engine", guardStatement("engine", "HeavyEngine"), returnSelfField("engine"))));
    const scanned = scanFileForProxyFields({ path: "a.ts", root }, AST_SETS);
    const field = scanned.get("ReportBuilder@0::engine");
    expect(field?.accessorMethod?.methodName).toBe("engine");
  });

  it("un método con la guarda + una llamada ENCADENADA sobre el campo NO califica como accessor dedicado", () => {
    rowCounter = 0;
    const root = build(classNode("ReportBuilder", method("buildSummary", guardStatement("engine", "HeavyEngine"), returnChainedCall("engine"))));
    const scanned = scanFileForProxyFields({ path: "a.ts", root }, AST_SETS);
    const field = scanned.get("ReportBuilder@0::engine");
    expect(field?.accessorMethod).toBeNull();
    expect(field?.guardSites).toHaveLength(1); // sigue contando como sitio de guarda cruda
  });

  it("build(): accessor dedicado existe Y otro sitio sigue repitiendo la guarda ⇒ aplicado-eludido", () => {
    rowCounter = 0;
    const root = build(
      classNode(
        "ReportBuilder",
        method("buildSummary", guardStatement("engine", "HeavyEngine"), returnChainedCall("engine")),
        method("engine", guardStatement("engine", "HeavyEngine"), returnSelfField("engine")),
      ),
    );
    const finding = fakeFinding({ locations: [loc("a.ts", 1, 5), loc("a.ts", 10, 15)] });
    const repo = {
      repoName: "r",
      files: [],
      functions: [],
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, className: "ReportBuilder", normalized: GUARD_TS }),
        fakeClone({ file: "a.ts", startLine: 10, endLine: 15, className: "ReportBuilder", normalized: GUARD_TS }),
      ],
      graph: null,
    };
    const h = evaluateProxyHypothesis(finding, null, { ...ctxWithFile(root), repo })!;
    expect(h.state).toBe("aplicado-eludido");
    expect(h.confidence).toBeNull(); // no compite en el ranking — CONTRATO-F6.md §1.5
    expect(h.places.some((p) => p.role === "accessor perezoso ya existente")).toBe(true);
    expect(h.places.some((p) => /puentea/.test(p.role))).toBe(true);
  });

  it("build(): accessor dedicado existe y NINGÚN sitio lo puentea ⇒ ya-aplicado (declarado inalcanzable en la práctica, pero implementado)", () => {
    rowCounter = 0;
    const root = build(classNode("ReportBuilder", method("engine", guardStatement("engine", "HeavyEngine"), returnSelfField("engine"))));
    const finding = fakeFinding({ locations: [loc("a.ts", 1, 5), loc("a.ts", 10, 15)] });
    // El `required` se satisface vía clones (texto) — independiente del AST
    // que sólo alimenta el excluder; ver el docstring del módulo.
    const repo = {
      repoName: "r",
      files: [],
      functions: [],
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, className: "ReportBuilder", normalized: GUARD_TS }),
        fakeClone({ file: "a.ts", startLine: 10, endLine: 15, className: "ReportBuilder", normalized: GUARD_TS }),
      ],
      graph: null,
    };
    const h = evaluateProxyHypothesis(finding, null, { ...ctxWithFile(root), repo })!;
    expect(h.state).toBe("ya-aplicado");
    expect(h.confidence).toBeNull();
  });

  it("sin árbol vivo (ctx.fileAt siempre null, el caso real hoy) ⇒ ausente, nunca ya-aplicado/aplicado-eludido por default", () => {
    const finding = fakeFinding();
    const repo = {
      repoName: "r",
      files: [],
      functions: [],
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: GUARD_TS }),
        fakeClone({ file: "a.ts", startLine: 10, endLine: 15, normalized: GUARD_TS }),
      ],
      graph: null,
    };
    const h = evaluateProxyHypothesis(finding, null, fakeCtx({ repo }))!;
    expect(h.state).toBe("ausente");
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * FORMA GENERAL (Ola 10, CONTRATO-F10.md) — ancla propia `lazy-init-repetida`
 * (`detect/intra-file/lazy-init-repetida.ts`), reachable con `ctx.fileAt`
 * REAL (a diferencia de `duplication`/`scattered-instantiation`, siempre
 * `null` — ver la cabecera del módulo). Fixture inspirada en la canónica de
 * Proxy (`ShapeProxy`/`PureWrapper`): colaborador construido UNA vez, sin
 * guarda, reenviado por ≥2 miembros.
 * ──────────────────────────────────────────────────────────────────────── */

/** `this.<field> = new <ctorName>();` SIN guarda — construcción incondicional (forma general, eager). */
function plainConstructAssign(field: string, ctorName: string): Spec {
  return { type: "assignment_expression", fields: { left: selfAccess("this", field), right: newExpr(ctorName) } };
}

/** `this.<field>.<methodName>` — acceso de DOS saltos (el que evidencia un reenvío real, no sólo tocar el campo). */
function nestedSelfAccess(receiver: string, field: string, methodName: string): Spec {
  return {
    type: "member_expression",
    text: `${receiver}.${field}.${methodName}`,
    fields: { object: selfAccess(receiver, field) },
    extraChildren: [{ type: "property_identifier", text: methodName }],
  };
}

function callExpr(fn: Spec): Spec {
  return { type: "call_expression", fields: { function: fn }, extraChildren: [{ type: "arguments", text: "()" }] };
}

/** `return this.<field>.<methodName>();` */
function returnForward(field: string, methodName: string): Spec {
  return { type: "return_statement", extraChildren: [callExpr(nestedSelfAccess("this", field, methodName))] };
}

/** `this.<field>.<methodName>();` como sentencia suelta (para un cuerpo de 2+ statements). */
function forwardStatement(field: string, methodName: string): Spec {
  return callExpr(nestedSelfAccess("this", field, methodName));
}

/** Cualquier statement adicional, sólo para inflar `namedChildren(body).length` — el discriminador de "hace algo más que reenviar" es de FORMA (cuántos statements), no de contenido. */
function extraStatement(): Spec {
  return { type: "expression_statement", text: "log()" };
}

function fakeLazyFinding(overrides: Partial<Finding> = {}): Finding {
  return fakeFinding({
    id: "f-lazy",
    detectorId: "lazy-init-repetida",
    kind: "lazy-init-repetida",
    scope: "intra-file",
    language: "typescript",
    // Rango amplio, 2 ubicaciones (satisface el `required` genérico de >=2):
    // sólo se testea la CLASIFICACIÓN estructural, el matching por línea
    // (`overlaps`) ya está cubierto por el path de clones.
    locations: [loc("a.ts", 0, 9999), loc("a.ts", 0, 9999)],
    ...overrides,
  });
}

describe("hypotheses/proxy — forma GENERAL, ancla `lazy-init-repetida` (ctx.fileAt real)", () => {
  it("colaborador construido una vez (constructor, sin guarda) + 2 reenvíos, uno con control agregado ⇒ ya-aplicado (COMPLETA general)", () => {
    rowCounter = 0;
    const root = build(
      classNode(
        "ShapeProxy",
        method("constructor", plainConstructAssign("real", "RealShape")),
        method("area", returnForward("real", "area")),
        method("paint", extraStatement(), forwardStatement("real", "paint")),
      ),
    );
    const finding = fakeLazyFinding();
    const h = evaluateProxyHypothesis(finding, null, ctxWithFile(root))!;
    expect(h.state).toBe("ya-aplicado");
    expect(h.confidence).toBeNull(); // no compite en el ranking — REQUISITO 1
    expect(h.places.some((p) => /control agregado/.test(p.role))).toBe(true);
  });

  it("2 reenvíos, AMBOS puros (sin control agregado) ⇒ EXCLUIDO a propósito (build devuelve null) — el 'PureWrapper' de la fixture canónica", () => {
    rowCounter = 0;
    const root = build(
      classNode(
        "PureWrapper",
        method("constructor", plainConstructAssign("real", "RealShape")),
        method("area", returnForward("real", "area")),
        method("paint", forwardStatement("real", "paint")), // 1 solo statement: reenvío puro
      ),
    );
    const finding = fakeLazyFinding();
    expect(evaluateProxyHypothesis(finding, null, ctxWithFile(root))).toBeNull();
  });

  it("un único reenvío homónimo (sin interfaz común confirmada) ⇒ parcial", () => {
    rowCounter = 0;
    const root = build(classNode("Wrapper", method("constructor", plainConstructAssign("real", "RealShape")), method("area", returnForward("real", "area"))));
    const finding = fakeLazyFinding();
    const h = evaluateProxyHypothesis(finding, null, ctxWithFile(root))!;
    expect(h.state).toBe("parcial");
    expect(h.confidence).not.toBeNull();
  });

  it("2 miembros usan el campo pero NUNCA se construye en la clase ⇒ sin evidencia (build null)", () => {
    rowCounter = 0;
    const root = build(classNode("Reader", method("area", returnForward("real", "area")), method("paint", forwardStatement("real", "paint"))));
    const finding = fakeLazyFinding();
    expect(evaluateProxyHypothesis(finding, null, ctxWithFile(root))).toBeNull();
  });

  it("misma forma (guardas repetidas) alcanzada vía `lazy-init-repetida` en vez de clones ⇒ ausente (la brecha de 'sin árbol vivo' se cierra para este ancla)", () => {
    rowCounter = 0;
    const root = build(
      classNode(
        "ReportBuilder",
        method("buildSummary", guardStatement("engine", "HeavyEngine"), returnChainedCall("engine")),
        method("buildDetail", guardStatement("engine", "HeavyEngine"), returnChainedCall("engine")),
      ),
    );
    const finding = fakeLazyFinding();
    const h = evaluateProxyHypothesis(finding, null, ctxWithFile(root))!;
    // Ningún método de esta clase es un accessor DEDICADO (ambos hacen algo
    // más que la guarda: encadenan una llamada sobre el campo en vez de
    // devolverlo tal cual — `returnChainedCall`, la misma forma que
    // `isDedicatedAccessorBody` ya rechaza arriba) ⇒ ausente, con árbol vivo
    // confirmando por AST — a diferencia de `duplication`, alcanzable en
    // producción para este ancla.
    expect(h.state).toBe("ausente");
    expect(h.discriminators.find((d) => d.label.includes("árbol vivo"))?.passed).toBe(true);
  });

  it("ese mismo caso, con un accessor dedicado agregado ⇒ aplicado-eludido, alcanzable en producción para este ancla (a diferencia de `duplication`)", () => {
    rowCounter = 0;
    const root = build(
      classNode(
        "ReportBuilder",
        method("engine", guardStatement("engine", "HeavyEngine"), returnSelfField("engine")),
        method("buildSummary", guardStatement("engine", "HeavyEngine"), returnChainedCall("engine")),
      ),
    );
    const finding = fakeLazyFinding();
    const h = evaluateProxyHypothesis(finding, null, ctxWithFile(root))!;
    expect(h.state).toBe("aplicado-eludido");
    expect(h.confidence).toBeNull(); // REQUISITO 1: no compite en el ranking
    expect(h.places.some((p) => p.role === "accessor perezoso ya existente")).toBe(true);
    expect(h.places.some((p) => /puentea/.test(p.role))).toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * REFUERZO DE GRAFO (forma general) — `findWrappingChains` + fan-out. Grafo
 * sintético mínimo: dos clases que implementan la misma interfaz, con
 * `calls(receiver-member)` de la misma (nombre,aridad) — igual que
 * `wrapping-chain.test.ts`, aquí sólo para confirmar que ESTA hipótesis
 * consume el resultado y declara la cardinalidad, no para re-probar
 * `findWrappingChains` en sí (eso ya lo hace su propio test).
 * ──────────────────────────────────────────────────────────────────────── */
import type { CodeGraph, CodeGraphEdge, CodeGraphNode } from "../graph/types.js";

function node(id: string, extra: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return { id, kind: "symbol", file: "a.ts", symbolPath: id.split("#")[1]?.split(".") ?? [], ...extra };
}

/** Nodo miembro `function-like` con `arity: 0` — `memberSignatures` (que
 *  `findWrappingChains` usa para exigir mismo (name,arity)) filtra a
 *  `family === "function-like"`; sin esto, el miembro es invisible para la
 *  terna y `findWrappingChains` da `[]` en silencio (encontrado escribiendo
 *  este test). */
function memberNode(id: string): CodeGraphNode {
  return node(id, { family: "function-like", arity: 0 });
}

function edge(from: string, to: string, kind: CodeGraphEdge["kind"], roles?: number): CodeGraphEdge {
  return { from, to, kind, provenance: "resolved", weight: 1, roles };
}

function fakeGraphWithWrappingChain(opts: { extraWrapper?: boolean } = {}): CodeGraph {
  const nodes: CodeGraphNode[] = [
    node("sym:a.ts#IShape", { family: "class-like" }),
    node("sym:a.ts#ShapeProxy", { family: "class-like" }),
    memberNode("sym:a.ts#ShapeProxy.area"),
    node("sym:a.ts#RealShape", { family: "class-like" }),
    memberNode("sym:a.ts#RealShape.area"),
  ];
  const edges: CodeGraphEdge[] = [
    edge("sym:a.ts#ShapeProxy", "sym:a.ts#IShape", "implements"),
    edge("sym:a.ts#RealShape", "sym:a.ts#IShape", "implements"),
    edge("sym:a.ts#ShapeProxy", "sym:a.ts#ShapeProxy.area", "contains"),
    edge("sym:a.ts#RealShape", "sym:a.ts#RealShape.area", "contains"),
    edge("sym:a.ts#ShapeProxy.area", "sym:a.ts#RealShape.area", "calls", 2 /* EDGE_ROLE_RECEIVER_MEMBER */),
    // fan-out > 1 del miembro reenviante: además de reenviar, llama a otra cosa (p.ej. un logger).
    edge("sym:a.ts#ShapeProxy.area", "sym:a.ts#Logger.info", "calls"),
  ];
  if (opts.extraWrapper) {
    nodes.push(node("sym:a.ts#ShapeDecoratorB", { family: "class-like" }), memberNode("sym:a.ts#ShapeDecoratorB.area"));
    edges.push(
      edge("sym:a.ts#ShapeDecoratorB", "sym:a.ts#IShape", "implements"),
      edge("sym:a.ts#ShapeDecoratorB", "sym:a.ts#ShapeDecoratorB.area", "contains"),
      edge("sym:a.ts#ShapeDecoratorB.area", "sym:a.ts#RealShape.area", "calls", 2),
    );
  }
  return { nodes, edges, resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: {} } as CodeGraph["resolution"] };
}

describe("hypotheses/proxy — refuerzo de grafo (forma general, confirmado-por-grafo-terna)", () => {
  it("terna de envoltura confirmada + fan-out > 1 + cardinalidad 1 ⇒ discriminador confirmado, con la cardinalidad declarada", () => {
    rowCounter = 0;
    const root = build(
      classNode("ShapeProxy", method("constructor", plainConstructAssign("real", "RealShape")), method("area", returnForward("real", "area")), method("paint", extraStatement(), forwardStatement("real", "paint"))),
    );
    const finding = fakeLazyFinding();
    const graph = fakeGraphWithWrappingChain();
    const h = evaluateProxyHypothesis(finding, graph, ctxWithFile(root))!;
    const d = h.discriminators.find((c) => c.label.includes("terna de envoltura del grafo"))!;
    expect(d.passed).toBe(true);
    expect(d.why).toMatch(/[Cc]ardinalidad 1/);
  });

  it("con un segundo wrapper del MISMO colaborador ⇒ cardinalidad > 1, declarado sin bajar el estado", () => {
    rowCounter = 0;
    const root = build(
      classNode("ShapeProxy", method("constructor", plainConstructAssign("real", "RealShape")), method("area", returnForward("real", "area")), method("paint", extraStatement(), forwardStatement("real", "paint"))),
    );
    const finding = fakeLazyFinding();
    const graph = fakeGraphWithWrappingChain({ extraWrapper: true });
    const h = evaluateProxyHypothesis(finding, graph, ctxWithFile(root))!;
    const d = h.discriminators.find((c) => c.label.includes("terna de envoltura del grafo"))!;
    expect(d.passed).toBe(true);
    expect(d.why).toMatch(/[Cc]ardinalidad > ?1/);
    expect(h.state).toBe("ya-aplicado"); // no baja el estado
  });

  it("sin grafo (null) ⇒ discriminador no confirmado, `why` distingue 'no se pudo buscar' de 'no se encontró'", () => {
    rowCounter = 0;
    const root = build(classNode("ShapeProxy", method("constructor", plainConstructAssign("real", "RealShape")), method("area", returnForward("real", "area")), method("paint", extraStatement(), forwardStatement("real", "paint"))));
    const finding = fakeLazyFinding();
    const h = evaluateProxyHypothesis(finding, null, ctxWithFile(root))!;
    const d = h.discriminators.find((c) => c.label.includes("terna de envoltura del grafo"))!;
    expect(d.passed).toBe(false);
    expect(d.why).toMatch(/no se pudo buscar/);
  });
});

/**
 * Ola 11 — el vecindario y `refresh()` para `lazy-init-repetida` (registro
 * de pendientes §B1): a diferencia de `duplication`/`scattered-instantiation`
 * (inter-file, `build()` YA recibe grafo/vecindario reales — ver el
 * docstring de `vecindarioConfirmaPatronRepetido` en `proxy.ts`),
 * `lazy-init-repetida` es intra-file: `build()` ve `graph === null` y
 * `ctx.neighborhood === EMPTY_NEIGHBORHOOD` SIEMPRE. Estos tests demuestran
 * que `refresh()` cierra esa brecha sin tocar `state`.
 */
function fakeWrapperGraphWithChain(): CodeGraph {
  const nodes: CodeGraphNode[] = [
    node("sym:a.ts#IShape", { family: "class-like" }),
    node("sym:a.ts#Wrapper", { family: "class-like" }),
    memberNode("sym:a.ts#Wrapper.area"),
    node("sym:a.ts#RealShape", { family: "class-like" }),
    memberNode("sym:a.ts#RealShape.area"),
  ];
  const edges: CodeGraphEdge[] = [
    edge("sym:a.ts#Wrapper", "sym:a.ts#IShape", "implements"),
    edge("sym:a.ts#RealShape", "sym:a.ts#IShape", "implements"),
    edge("sym:a.ts#Wrapper", "sym:a.ts#Wrapper.area", "contains"),
    edge("sym:a.ts#RealShape", "sym:a.ts#RealShape.area", "contains"),
    edge("sym:a.ts#Wrapper.area", "sym:a.ts#RealShape.area", "calls", 2),
    edge("sym:a.ts#Wrapper.area", "sym:a.ts#Logger.info", "calls"), // fan-out > 1.
  ];
  return { nodes, edges, resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: {} } as CodeGraph["resolution"] };
}

describe("hypotheses/proxy — Ola 11: refresh() para `lazy-init-repetida` (registro de pendientes §B1)", () => {
  it("confirmado-por-grafo-terna: build() con graph=null (límite de cableado real de este ancla) lo deja en falso; refresh() con el MISMO grafo real (terna de envoltura) lo confirma SIN tocar `state`", () => {
    rowCounter = 0;
    const root = build(classNode("Wrapper", method("constructor", plainConstructAssign("real", "RealShape")), method("area", returnForward("real", "area"))));
    const finding = fakeLazyFinding();

    // build() en producción SIEMPRE ve graph=null para este ancla (docstring del módulo).
    const built = evaluateProxyHypothesis(finding, null, ctxWithFile(root))!;
    expect(built.state).toBe("parcial");
    const before = built.discriminators.find((c) => c.label.includes("terna de envoltura del grafo"))!;
    expect(before.passed).toBe(false);

    // refresh() (Ola 10, crossAnalyze) SÍ recibe el grafo real.
    const graph = fakeWrapperGraphWithChain();
    const refreshed = refreshProxyHypothesis(built, finding, graph, ctxWithFile(root))!;
    expect(refreshed).not.toBeNull();
    expect(refreshed.state).toBe("parcial"); // NUNCA se promueve a 'ya-aplicado' vía refresh() — prohibido por contrato.
    const after = refreshed.discriminators.find((c) => c.label.includes("terna de envoltura del grafo"))!;
    expect(after.passed).toBe(true);
    expect(after.why).toMatch(/[Cc]ardinalidad/);
  });

  it("vecindario-confirma-patron-repetido: build() con EMPTY_NEIGHBORHOOD lo deja en falso; refresh() con ctx.neighborhood.countOfKind('lazy-init-repetida') > 0 lo confirma", () => {
    rowCounter = 0;
    const root = build(classNode("Wrapper", method("constructor", plainConstructAssign("real", "RealShape")), method("area", returnForward("real", "area"))));
    const finding = fakeLazyFinding();
    const built = evaluateProxyHypothesis(finding, null, ctxWithFile(root))!;
    expect(built.state).toBe("parcial");
    const before = built.discriminators.find((c) => c.label.includes("aparece en OTRO lugar del repo"));
    expect(before?.passed).toBe(false);

    const refreshCtx: HypothesisContext = { ...ctxWithFile(root), neighborhood: { ...EMPTY_NEIGHBORHOOD, countOfKind: () => 3 } };
    const refreshed = refreshProxyHypothesis(built, finding, null, refreshCtx)!;
    expect(refreshed).not.toBeNull();
    expect(refreshed.state).toBe("parcial");
    const after = refreshed.discriminators.find((c) => c.label.includes("aparece en OTRO lugar del repo"));
    expect(after?.passed).toBe(true);
    expect(after?.why).toMatch(/3 hallazgo\(s\) más/);
  });

  it("hipótesis 'ya-aplicado' no compite por confianza: refresh() no la toca (devuelve null)", () => {
    rowCounter = 0;
    const root = build(
      classNode(
        "ShapeProxy",
        method("constructor", plainConstructAssign("real", "RealShape")),
        method("area", returnForward("real", "area")),
        method("paint", extraStatement(), forwardStatement("real", "paint")),
      ),
    );
    const finding = fakeLazyFinding();
    const built = evaluateProxyHypothesis(finding, null, ctxWithFile(root))!;
    expect(built.state).toBe("ya-aplicado");
    expect(refreshProxyHypothesis(built, finding, null, ctxWithFile(root))).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * APAGADO — la compuerta real. Todo lo de arriba prueba
 * `evaluateProxyHypothesis`/`refreshProxyHypothesis` (la lógica de
 * clasificación, preservada para una eventual reactivación). Lo que el
 * pipeline REALMENTE llama es `hypothesis.build`/`hypothesis.refresh` (el
 * objeto exportado, el que vive en `hypotheses/registry.ts`), y ESOS
 * devuelven `null` siempre — Proxy midió 0/28 verdaderas contra código real
 * (Ola D) y esta ola confirmó 0 grupos con guarda real repetida en 606
 * archivos/427 grupos (Rails + `src/`, ver el docstring de cabecera de
 * `proxy.ts` para el comando y los números exactos). Los tres casos de abajo
 * son, a propósito, señales FUERTES bajo la lógica vieja (confianza "alta"
 * con 3 clones idénticos, y el "ya-aplicado" de la fixture canónica
 * `ShapeProxy`) — si esto se pone en rojo, es que `hypothesis.build`/
 * `hypothesis.refresh` volvieron a emitir sin que se actualizara la
 * condición de reactivación documentada en `proxy.ts`; no aflojar este test,
 * arreglar la condición de reactivación primero.
 * ──────────────────────────────────────────────────────────────────────── */
describe("hypotheses/proxy — APAGADO: hypothesis.build/hypothesis.refresh (el objeto registrado) nunca emiten", () => {
  it("build(): 3 clones con guarda idéntica en la misma clase (confianza 'alta' bajo evaluateProxyHypothesis) ⇒ null de todos modos", () => {
    rowCounter = 0;
    const finding = fakeFinding({ locations: [loc("a.ts", 1, 5), loc("a.ts", 10, 15), loc("a.ts", 20, 25)] });
    const repo = {
      repoName: "r",
      files: [],
      functions: [],
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: GUARD_TS }),
        fakeClone({ file: "a.ts", startLine: 10, endLine: 15, normalized: GUARD_TS }),
        fakeClone({ file: "a.ts", startLine: 20, endLine: 25, normalized: GUARD_TS }),
      ],
      graph: null,
    };
    const ctx = fakeCtx({ repo });
    // Control: la lógica de clasificación SIGUE viva y SIGUE dando confianza "alta".
    expect(evaluateProxyHypothesis(finding, null, ctx)!.confidence).toBe("alta");
    // El objeto registrado (lo que el pipeline llama) no emite nada.
    expect(hypothesis.build(finding, null, ctx)).toBeNull();
  });

  it("build(): fixture canónica ShapeProxy (forma general, 'ya-aplicado' bajo evaluateProxyHypothesis) ⇒ null de todos modos", () => {
    rowCounter = 0;
    const root = build(
      classNode(
        "ShapeProxy",
        method("constructor", plainConstructAssign("real", "RealShape")),
        method("area", returnForward("real", "area")),
        method("paint", extraStatement(), forwardStatement("real", "paint")),
      ),
    );
    const finding = fakeLazyFinding();
    const ctx = ctxWithFile(root);
    // Control: la lógica de clasificación SIGUE reconociendo la fixture canónica.
    expect(evaluateProxyHypothesis(finding, null, ctx)!.state).toBe("ya-aplicado");
    // El objeto registrado no emite nada.
    expect(hypothesis.build(finding, null, ctx)).toBeNull();
  });

  it("refresh(): una hipótesis 'parcial' ya construida (que SÍ se actualizaría bajo refreshProxyHypothesis) ⇒ null de todos modos", () => {
    rowCounter = 0;
    const root = build(classNode("Wrapper", method("constructor", plainConstructAssign("real", "RealShape")), method("area", returnForward("real", "area"))));
    const finding = fakeLazyFinding();
    const existing = evaluateProxyHypothesis(finding, null, ctxWithFile(root))!;
    expect(existing.state).toBe("parcial");
    const graph = fakeWrapperGraphWithChain();
    // Control: `refreshProxyHypothesis` SÍ confirma el discriminador de grafo con este `existing`.
    const refreshedInternal = refreshProxyHypothesis(existing, finding, graph, ctxWithFile(root))!;
    expect(refreshedInternal.discriminators.find((d) => d.label.includes("terna de envoltura del grafo"))?.passed).toBe(true);
    // El objeto registrado no emite nada.
    expect(hypothesis.refresh!(existing, finding, graph, ctxWithFile(root))).toBeNull();
  });
});


/* ════════════════════════════════════════════════════════════════════════
 * OLA AE (AE13) — EL CAMINO NUEVO: el ancla-FUERZA `repeated-access-control`.
 * Estos tests parsean código REAL (no un `AstNode` a mano) porque el camino
 * nuevo re-escanea el archivo con el árbol vivo: lo que se prueba es
 * exactamente lo que corre en producción.
 * ════════════════════════════════════════════════════════════════════════ */

const AE13_PROBE =
  "class Probe { constructor() { this.x = 1; } method(a) { if (a) { return a; } else { this.x = 2; } for (let i = 0; i < 1; i++) { this.x = i; } return a; } }\n";

const AE13_FUENTE_AUSENTE = `
class Injector {
  printA() {
    if (this.level == null) return;
    this.logger.log("a");
  }
  printB() {
    if (this.level == null) return;
    this.logger.log("b");
  }
  printC() {
    if (this.level == null) return;
    this.logger.log("c");
  }
}
`;

const AE13_FUENTE_PARCIAL = `
class Injector {
  printA() {
    if (!this.isDebugMode()) return;
    this.logger.log("a");
  }
  printB() {
    if (!this.isDebugMode()) return;
    this.logger.log("b");
  }
  printC() {
    if (!this.isDebugMode()) return;
    this.logger.log("c");
  }
  isDebugMode() { return true; }
}
`;

async function ae13Contexto(source: string): Promise<{ ctx: HypothesisContext; finding: Finding }> {
  const sets = await nodeSetsFor("tree-sitter-typescript.wasm", AE13_PROBE);
  const root = await parseRoot("tree-sitter-typescript.wasm", source);
  const unit = fileUnitFrom(root, sets, "typescript", { file: "a.ts" });
  const findings = runIntraFileSync(unit, sets);
  const raw = findings[0];
  const finding = fakeFinding({
    id: "rac1",
    detectorId: "repeated-access-control",
    kind: "repeated-access-control",
    scope: "intra-file",
    language: "typescript",
    locations: raw ? (raw.locations as Finding["locations"]) : [loc("a.ts", 1, 2)],
  });
  const ctx = fakeCtx({ file: unit, fileAt: (p) => (p === "a.ts" ? unit : null), setsFor: () => sets });
  return { ctx, finding };
}

function runIntraFileSync(unit: FileUnit, sets: DerivedNodeSets): readonly RawFinding[] {
  return accessControlDetector.run(unit, testContext(accessControlDetector, "typescript", []));
}

describe("hypotheses/proxy — el ancla nueva `repeated-access-control` (Ola AE, AE13)", () => {
  it("`ausente`: el control es estado crudo, ni la decisión ni la interposición viven detrás de una puerta", async () => {
    const { ctx, finding } = await ae13Contexto(AE13_FUENTE_AUSENTE);
    const hyp = hypothesis.build(finding, null, ctx)!;
    expect(hyp).not.toBeNull();
    expect(hyp.state).toBe("ausente");
    expect(hyp.places).toHaveLength(3);
    expect(hyp.pattern).toBe("Proxy (inicialización perezosa)");
  });

  it("`parcial`: la CONDICIÓN ya delega en un miembro propio — media puerta construida", async () => {
    const { ctx, finding } = await ae13Contexto(AE13_FUENTE_PARCIAL);
    const hyp = hypothesis.build(finding, null, ctx)!;
    expect(hyp.state).toBe("parcial");
  });

  it("SIN ÁRBOL VIVO no aprueba: el `required` da `holds: false` en vez de 'no pude mirar, apruebo'", async () => {
    const { finding } = await ae13Contexto(AE13_FUENTE_AUSENTE);
    expect(hypothesis.build(finding, null, fakeCtx())).toBeNull();
  });

  it("EL CAMINO VIEJO SIGUE APAGADO: un `Finding` de `duplication` con 3 guardas idénticas ⇒ null", () => {
    rowCounter = 0;
    const finding = fakeFinding({ locations: [loc("a.ts", 1, 5), loc("a.ts", 10, 15), loc("a.ts", 20, 25)] });
    const repo = {
      repoName: "r",
      files: [],
      functions: [],
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 5, normalized: GUARD_TS }),
        fakeClone({ file: "a.ts", startLine: 10, endLine: 15, normalized: GUARD_TS }),
        fakeClone({ file: "a.ts", startLine: 20, endLine: 25, normalized: GUARD_TS }),
      ],
      graph: null,
    };
    expect(hypothesis.build(finding, null, fakeCtx({ repo }))).toBeNull();
  });

  it("`refresh()` re-corre SÓLO los discriminadores y nunca cambia el estado", async () => {
    const { ctx, finding } = await ae13Contexto(AE13_FUENTE_AUSENTE);
    const existing = hypothesis.build(finding, null, ctx)!;
    const refreshed = hypothesis.refresh!(existing, finding, null, ctx)!;
    expect(refreshed.state).toBe(existing.state);
    expect(refreshed.checks).toEqual(existing.checks);
  });

  it("`evaluateAccessControlHypothesis` publica el objeto y el control en su evidencia", async () => {
    const { ctx, finding } = await ae13Contexto(AE13_FUENTE_AUSENTE);
    const hyp = evaluateAccessControlHypothesis(finding, null, ctx)!;
    const req = hyp.checks.find((c) => c.label.includes("Re-escaneado sobre el árbol VIVO"));
    expect(req?.passed).toBe(true);
    expect(req?.why).toContain("logger");
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * OLA AH (AH2) — LOS DOS DISCRIMINADORES NUEVOS.
 *
 * Cada test nombra la INTENCIÓN que protege, no sólo el número que compara.
 * Los cinco lenguajes están acá a propósito: la primera versión del hecho
 * "el objeto recibe una llamada" sólo miraba el callee, y eso lo dejaba MUDO
 * en Java y en Ruby (`guava`, `jenkins`, `chatwoot`, `redmine`, `jekyll`,
 * `rubocop`) — se encontró escribiendo estos tests.
 * ════════════════════════════════════════════════════════════════════════ */

const AH2_PROBE_JAVA =
  "class Probe { private int x; Probe() { this.x = 1; } int method(int a) { if (a > 0) { return a; } else { this.x = 2; } for (int i = 0; i < 1; i++) { this.x = i; } while (a > 0) { break; } return a; } }\n";
const AH2_PROBE_RUBY =
  "class Probe\n  def initialize\n    @x = 1\n  end\n  def method(a)\n    return nil unless a\n    if a\n      @x = a\n    else\n      @x = 2\n    end\n    while a\n      break\n    end\n    a\n  end\nend\n";

/** El objeto sólo se LEE: ningún cliente le invoca nada. No hay interfaz que
 *  un proxy pueda repetir.
 *
 *  OLA AK (AK5) — UN CAMBIO DE UNA GUARDA, Y POR QUÉ. La versión de la Ola AH
 *  escribía `if (k == null)`, con `k` PARÁMETRO de cada miembro. Desde el
 *  `required` `el-control-interroga-a-la-unidad` esa forma ya no produce
 *  hipótesis (un predicado calculado sólo con lo que el propio miembro liga no
 *  es un control de acceso al objeto), así que la fixture habría dejado de
 *  ejercer lo que los tests de AH2 quieren ejercer: el hecho "el objeto sólo se
 *  LEE". La guarda pasa a leer un CAMPO de la unidad (`this.mode`) y **la
 *  propiedad que la fixture existe para probar no cambia**: `this.size.value`
 *  se lee y nadie invoca nada sobre `size`. Ninguna aserción se aflojó — y la
 *  forma vieja queda abajo, con un test propio que fija su resultado nuevo. */
const AH2_SOLO_LECTURA = `
class Reader {
  a(k) {
    if (this.mode == null) return 0;
    return this.size.value;
  }
  b(k) {
    if (this.mode == null) return 1;
    return this.size.value;
  }
  c(k) {
    if (this.mode == null) return 2;
    return this.size.value;
  }
}
`;

/** LA FORMA VIEJA de `AH2_SOLO_LECTURA`: la guarda interroga el PARÁMETRO del
 *  propio miembro. Se conserva a propósito para fijar el comportamiento nuevo. */
const AK5_GUARDA_DE_PARAMETRO = `
class Reader {
  a(k) {
    if (k == null) return 0;
    return this.size.value;
  }
  b(k) {
    if (k == null) return 1;
    return this.size.value;
  }
  c(k) {
    if (k == null) return 2;
    return this.size.value;
  }
}
`;

/** El control tiene rama ALTERNATIVA no vacía: no interpone, ELIGE. */
const AH2_BIFURCA = `
class Chooser {
  a() {
    if (this.mode == null) { this.logger.log("a"); } else { this.logger.warn("a"); }
  }
  b() {
    if (this.mode == null) { this.logger.log("b"); } else { this.logger.warn("b"); }
  }
  c() {
    if (this.mode == null) { this.logger.log("c"); } else { this.logger.warn("c"); }
  }
}
`;

/** Java escribe el receptor en `method_invocation.object`, no en el callee. */
const AH2_JAVA = `
class SlaveComputer {
  private Channel channel;
  int getA() {
    if (channel == null) { return -1; }
    return channel.call(1);
  }
  int getB() {
    if (channel == null) { return -1; }
    return channel.call(2);
  }
  int getC() {
    if (channel == null) { return -1; }
    return channel.call(3);
  }
}
`;

/** Ruby escribe el receptor en `call.receiver`, no en el callee. */
const AH2_RUBY = `class Repo
  def a
    return nil if @conn.nil?
    @conn.exec("a")
  end
  def b
    return nil if @conn.nil?
    @conn.exec("b")
  end
  def c
    return nil if @conn.nil?
    @conn.exec("c")
  end
end
`;

async function ah2Contexto(wasm: string, probe: string, language: string, source: string, file = "a.ts"): Promise<{ ctx: HypothesisContext; finding: Finding }> {
  const sets = await nodeSetsFor(wasm, probe);
  const root = await parseRoot(wasm, source);
  const unit = fileUnitFrom(root, sets, language, { file });
  const raw = accessControlDetector.run(unit, testContext(accessControlDetector, language, []))[0];
  const finding = fakeFinding({
    id: "rac-ah2",
    detectorId: "repeated-access-control",
    kind: "repeated-access-control",
    scope: "intra-file",
    language,
    locations: raw ? (raw.locations as Finding["locations"]) : [loc(file, 1, 2)],
  });
  const ctx = fakeCtx({ file: unit, fileAt: (p) => (p === file ? unit : null), setsFor: () => sets });
  return { ctx, finding };
}

/** Los discriminadores viajan con `label` (el `describe` del `Check`), no con
 *  `id` — ver `engine.ts#toCheck`. Se buscan por un trozo distintivo. */
function disc(h: PatternHypothesisDraft, trozo: string) {
  return h.discriminators.find((d) => d.label.includes(trozo));
}
const D_PROTOCOLO = "RECIBE UNA LLAMADA";
const D_INTERPONE = "rama ALTERNATIVA no vacía";

describe("hypotheses/proxy — OLA AH (AH2): los dos discriminadores nuevos", () => {
  it("PROTOCOLO, se confirma: los tres clientes INVOCAN sobre el objeto (`this.logger.log`) ⇒ hay interfaz que repetir", async () => {
    const { ctx, finding } = await ae13Contexto(AE13_FUENTE_AUSENTE);
    const hyp = hypothesis.build(finding, null, ctx)!;
    const d = disc(hyp, D_PROTOCOLO)!;
    expect(d.passed).toBe(true);
    expect(d.why).toContain("logger");
  });

  it("PROTOCOLO, NO se confirma: el objeto sólo se LEE (`this.size.value`) — sin interfaz, lo que paga es el punto de acceso único, no un Proxy", async () => {
    const { ctx, finding } = await ah2Contexto("tree-sitter-typescript.wasm", AE13_PROBE, "typescript", AH2_SOLO_LECTURA);
    const hyp = hypothesis.build(finding, null, ctx)!;
    expect(disc(hyp, D_PROTOCOLO)!.passed).toBe(false);
  });

  it("INTERPOSICIÓN, NO se confirma: el control tiene rama `else` no vacía ⇒ está ELIGIENDO entre dos comportamientos, no interponiendo", async () => {
    const { ctx, finding } = await ah2Contexto("tree-sitter-typescript.wasm", AE13_PROBE, "typescript", AH2_BIFURCA);
    const hyp = hypothesis.build(finding, null, ctx)!;
    expect(disc(hyp, D_INTERPONE)!.passed).toBe(false);
  });

  it("INTERPOSICIÓN, se confirma: una guarda de salida sin `else` INTERPONE", async () => {
    const { ctx, finding } = await ae13Contexto(AE13_FUENTE_AUSENTE);
    const hyp = hypothesis.build(finding, null, ctx)!;
    expect(disc(hyp, D_INTERPONE)!.passed).toBe(true);
  });

  it("JAVA: el receptor vive en `method_invocation.object` — sin esa rama el hecho queda MUDO en guava y jenkins", async () => {
    const { ctx, finding } = await ah2Contexto("tree-sitter-java.wasm", AH2_PROBE_JAVA, "java", AH2_JAVA, "A.java");
    const hyp = hypothesis.build(finding, null, ctx)!;
    expect(disc(hyp, D_PROTOCOLO)!.passed).toBe(true);
  });

  it("RUBY: el receptor vive en `call.receiver` — sin esa rama el hecho queda MUDO en chatwoot, redmine, jekyll y rubocop", async () => {
    const { ctx, finding } = await ah2Contexto("tree-sitter-ruby.wasm", AH2_PROBE_RUBY, "ruby", AH2_RUBY, "a.rb");
    const hyp = hypothesis.build(finding, null, ctx)!;
    expect(disc(hyp, D_PROTOCOLO)!.passed).toBe(true);
  });

  it("EL CONTRATO ADITIVO DE LA OLA AH: con los DOS discriminadores nuevos en falso la hipótesis SIGUE EXISTIENDO, con el MISMO estado y los MISMOS `checks` — un discriminador nunca suprime", async () => {
    const { ctx, finding } = await ah2Contexto("tree-sitter-typescript.wasm", AE13_PROBE, "typescript", AH2_SOLO_LECTURA);
    const hyp = hypothesis.build(finding, null, ctx);
    expect(hyp).not.toBeNull();
    expect(hyp!.state).toBe("ausente");
    expect(hyp!.confidence).not.toBeNull();
    expect(hyp!.places).toHaveLength(3);
    // los dos nuevos fallan, y los `checks` (los `required` + el estado) son los de siempre
    expect(disc(hyp!, D_PROTOCOLO)!.passed).toBe(false);
    expect(hyp!.checks.filter((c) => c.role === "required").every((c) => c.passed)).toBe(true);
  });

  it("LOS DOS DISCRIMINADORES SÓLO PUEDEN SUBIR LA CONFIANZA: confirmarlos nunca deja una hipótesis por debajo de la que los falla", async () => {
    const conProtocolo = await ae13Contexto(AE13_FUENTE_AUSENTE);
    const sinProtocolo = await ah2Contexto("tree-sitter-typescript.wasm", AE13_PROBE, "typescript", AH2_SOLO_LECTURA);
    const a = hypothesis.build(conProtocolo.finding, null, conProtocolo.ctx)!;
    const b = hypothesis.build(sinProtocolo.finding, null, sinProtocolo.ctx)!;
    const escala = ["baja", "media", "alta"];
    expect(escala.indexOf(a.confidence!)).toBeGreaterThanOrEqual(escala.indexOf(b.confidence!));
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * OLA AK (AK5) — EL `required` NUEVO: `el-control-interroga-a-la-unidad`.
 *
 * LA INTENCIÓN QUE CADA TEST PROTEGE, escrita antes de medir
 * (`scratchpad-ak5/CRITERIO.md`): un proxy se interpone entre el cliente y el
 * objeto, y la puerta que escribe UNA vez el control **sólo tiene a mano el
 * objeto y el estado de la unidad** — nunca los parámetros ni los locales de
 * cada cliente. Así que un predicado calculado ENTERAMENTE con nombres que el
 * propio miembro LIGA no es un control DE ACCESO: es una precondición del
 * cálculo de ese miembro, y ninguna puerta del objeto puede absorberla.
 *
 * MEDIDO SOBRE LOS 170 JUICIOS DE NIVEL 2 QUE EXISTEN DE ESTA CELDA (banco
 * congelado en `scratchpad-ak5/banco-hechos2.json`): silencia **23 falsas
 * conocidas** (14 en bibliotecas — guava 9, hugo 5 — y 9 en aplicaciones —
 * ShareX 5, gitea 4) y **CERO** de las 26 juzgadas `verdadero`. Ninguna de las
 * 26 tiene un solo sitio cuyo control se calcule sólo con lo que el miembro
 * liga. Ése es el criterio de aceptación de la ola, y es el motivo por el que
 * este chequeo es un `required` y no un discriminador (un discriminador entra
 * en `ladderStep` y NO puede suprimir nada).
 *
 * Los cinco lenguajes están acá a propósito: la forma que más silencia es el
 * idioma de errores de Go (`if err != nil` sobre un local), la validación de
 * argumento de Java/C# y la guarda sobre un local de C#/JS.
 * ════════════════════════════════════════════════════════════════════════ */

const AK5_REQ = "el predicado del control NOMBRA algo que la unidad tiene";
function reqAk5(h: PatternHypothesisDraft) {
  return h.checks.find((c) => c.label.includes(AK5_REQ));
}

const AK5_PROBE_GO = `
package main

type Probe struct {
	x int
}

func (p *Probe) Method(a int) int {
	if a > 0 {
		return a
	} else {
		p.x = 2
	}
	for i := 0; i < 1; i++ {
		p.x = i
	}
	return a
}
`;

/** GO — el idioma de errores sobre un LOCAL: `err` lo liga el propio miembro.
 *  Es la forma que la sonda encontró en hugo (`tpl/urls`, `tpl/lang`,
 *  `modules/client.go`) y en gitea (`backend.go`, `lock.go`). */
const AK5_GO_ERR_LOCAL = `
package main

type Client struct {
	logger *Logger
}

func (c *Client) A(s string) error {
	v, err := parse(s)
	if err != nil {
		c.logger.Log("a")
		return err
	}
	return use(v)
}

func (c *Client) B(s string) error {
	v, err := parse(s)
	if err != nil {
		c.logger.Log("b")
		return err
	}
	return use(v)
}

func (c *Client) C(s string) error {
	v, err := parse(s)
	if err != nil {
		c.logger.Log("c")
		return err
	}
	return use(v)
}
`;

/** GO — EL MISMO TEXTO DE CONDICIÓN, pero el condicional trae un INICIALIZADOR
 *  que invoca un miembro de la unidad (`c.init()`): ahí el control SÍ le
 *  pregunta a la unidad. Es, línea por línea, la forma de las DOS propuestas
 *  juzgadas `verdadero` de `hugo cache/filecache/filecache.go`. */
const AK5_GO_ERR_CON_MIEMBRO = `
package main

type Cache struct {
	entryLocker *Locker
}

func (c *Cache) init() error {
	return nil
}

func (c *Cache) A(id string) error {
	if err := c.init(); err != nil {
		return err
	}
	c.entryLocker.Lock(id)
	return nil
}

func (c *Cache) B(id string) error {
	if err := c.init(); err != nil {
		return err
	}
	c.entryLocker.Lock(id)
	return nil
}

func (c *Cache) C(id string) error {
	if err := c.init(); err != nil {
		return err
	}
	c.entryLocker.Lock(id)
	return nil
}
`;

/** JAVA — validación del ARGUMENTO: `n` es parámetro de cada miembro. Es la
 *  forma de `guava ConcurrentHashMultiset` (`if (occurrences == 0)`). */
const AK5_JAVA_PARAMETRO = `
class Counter {
  private Map countMap;
  int add(int n) {
    if (n == 0) { return 0; }
    return countMap.get(n);
  }
  int remove(int n) {
    if (n == 0) { return 1; }
    return countMap.get(n);
  }
  int set(int n) {
    if (n == 0) { return 2; }
    return countMap.get(n);
  }
}
`;

describe("hypotheses/proxy — OLA AK (AK5): el `required` `el-control-interroga-a-la-unidad`", () => {
  it("SIGUE EMITIENDO cuando el control lee un CAMPO de la unidad (`this.level == null`) — el caso base de AE13 no se mueve", async () => {
    const { ctx, finding } = await ae13Contexto(AE13_FUENTE_AUSENTE);
    const hyp = hypothesis.build(finding, null, ctx)!;
    expect(hyp).not.toBeNull();
    expect(hyp.state).toBe("ausente");
    expect(reqAk5(hyp)!.passed).toBe(true);
    expect(reqAk5(hyp)!.why).toContain("printA");
  });

  it("SIGUE EMITIENDO cuando el control INVOCA un miembro propio (`!this.isDebugMode()`)", async () => {
    const { ctx, finding } = await ae13Contexto(AE13_FUENTE_PARCIAL);
    const hyp = hypothesis.build(finding, null, ctx)!;
    expect(reqAk5(hyp)!.passed).toBe(true);
  });

  it("NO EMITE cuando la guarda interroga el PARÁMETRO del propio miembro (`k == null`) — y el ancla SÍ produce el grupo, así que la diferencia es este `required` y no el detector", async () => {
    const sets = await nodeSetsFor("tree-sitter-typescript.wasm", AE13_PROBE);
    const root = await parseRoot("tree-sitter-typescript.wasm", AK5_GUARDA_DE_PARAMETRO);
    const unit = fileUnitFrom(root, sets, "typescript", { file: "a.ts" });
    const raws = accessControlDetector.run(unit, testContext(accessControlDetector, "typescript", []));
    expect(raws).toHaveLength(1); // el ANCLA sigue emitiendo: nada de nivel 1 se movió
    const { ctx, finding } = await ah2Contexto("tree-sitter-typescript.wasm", AE13_PROBE, "typescript", AK5_GUARDA_DE_PARAMETRO);
    expect(hypothesis.build(finding, null, ctx)).toBeNull();
  });

  it("GO: `if err != nil` sobre un LOCAL ⇒ NO emite (el idioma de errores de Go, la clase más grande que este `required` silencia)", async () => {
    const { ctx, finding } = await ah2Contexto("tree-sitter-go.wasm", AK5_PROBE_GO, "go", AK5_GO_ERR_LOCAL, "a.go");
    expect(hypothesis.build(finding, null, ctx)).toBeNull();
  });

  it("GO: el MISMO `err != nil` pero con INICIALIZADOR que llama a un miembro propio (`if err := c.init(); err != nil`) ⇒ SIGUE EMITIENDO — es la forma de las dos verdaderas de hugo", async () => {
    const { ctx, finding } = await ah2Contexto("tree-sitter-go.wasm", AK5_PROBE_GO, "go", AK5_GO_ERR_CON_MIEMBRO, "a.go");
    const hyp = hypothesis.build(finding, null, ctx);
    expect(hyp).not.toBeNull();
    expect(reqAk5(hyp!)!.passed).toBe(true);
  });

  it("JAVA: validación del ARGUMENTO (`n == 0`) ⇒ NO emite; el MISMO archivo con la guarda sobre el campo (`channel == null`) SÍ emite", async () => {
    const conParametro = await ah2Contexto("tree-sitter-java.wasm", AH2_PROBE_JAVA, "java", AK5_JAVA_PARAMETRO, "A.java");
    expect(hypothesis.build(conParametro.finding, null, conParametro.ctx)).toBeNull();
    const conCampo = await ah2Contexto("tree-sitter-java.wasm", AH2_PROBE_JAVA, "java", AH2_JAVA, "A.java");
    expect(hypothesis.build(conCampo.finding, null, conCampo.ctx)).not.toBeNull();
  });

  it("RUBY: el sigilo `@conn` NO lo liga el miembro ⇒ sigue emitiendo", async () => {
    const { ctx, finding } = await ah2Contexto("tree-sitter-ruby.wasm", AH2_PROBE_RUBY, "ruby", AH2_RUBY, "a.rb");
    const hyp = hypothesis.build(finding, null, ctx);
    expect(hyp).not.toBeNull();
    expect(reqAk5(hyp!)!.passed).toBe(true);
  });

  it("SIN ÁRBOL VIVO el `required` no aprueba ni rechaza por su cuenta: la hipótesis ya era `null` por los otros tres", async () => {
    const { finding } = await ae13Contexto(AE13_FUENTE_AUSENTE);
    expect(hypothesis.build(finding, null, fakeCtx())).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
 * OLA AL, FRENTE AL3 — el `required` `los-clientes-que-repiten-son-clientes-de-verdad`
 * y la corrección de la ASIGNACIÓN DESNUDA en `acNombresLigados`.
 * ═══════════════════════════════════════════════════════════════════════ */

const AL3_REQ = "Descontando los sitios donde el control no está INTERPUESTO";
function reqAl3(h: PatternHypothesisDraft): PatternHypothesisDraft["checks"][number] | undefined {
  return h.checks.find((c) => c.label.includes(AL3_REQ));
}

/** JAVA — la ASIGNACIÓN DESNUDA a un campo declarado NO liga un nombre. Es la
 *  forma de `guava TreeMultiset.AvlNode` (`left = initLeft.add(...)` con
 *  `private AvlNode<E> left;` declarado arriba): sin la corrección, el miembro
 *  que escribe el campo se leería como si calculara su control con puros
 *  locales, y se descontaría un cliente que SÍ lo es. */
const AL3_JAVA_ASIGNA_CAMPO = `
class Node {
  private Node left;
  int count(int e) {
    if (left == null) { return 0; }
    return left.count(e);
  }
  int height(int e) {
    if (left == null) { return 1; }
    return left.height(e);
  }
  Node add(int e) {
    if (left == null) { return this; }
    left = left.add(e);
    return this;
  }
}
`;

/** JAVA — el control es un TERNARIO usado como ARGUMENTO de una llamada AL
 *  PROPIO OBJETO: el objeto no está en ninguna rama del condicional. Es, línea
 *  por línea, la forma de `jenkins Jenkins.java:3750`
 *  (`LOGGER.log(Main.isUnitTest ? Level.FINE : Level.INFO, "…")`). */
const AL3_JAVA_TERNARIO_ARGUMENTO = `
class Site {
  private Logger LOGGER;
  private boolean quiet;
  void a() {
    LOGGER.log(quiet ? 1 : 2, "a");
  }
  void b() {
    LOGGER.log(quiet ? 1 : 2, "b");
  }
  void c() {
    LOGGER.log(quiet ? 1 : 2, "c");
  }
}
`;

/** JAVA — el MISMO ternario, pero con el objeto DENTRO de una rama: ahí el
 *  control sí gobierna el acceso y el sitio cuenta. */
const AL3_JAVA_TERNARIO_CON_OBJETO = `
class Site {
  private Logger LOGGER;
  private boolean quiet;
  int a() {
    return quiet ? 0 : LOGGER.size();
  }
  int b() {
    return quiet ? 1 : LOGGER.size();
  }
  int c() {
    return quiet ? 2 : LOGGER.size();
  }
}
`;

/** GO — GRUPO MIXTO: el MISMO texto `err != nil` es, en dos miembros, el
 *  idioma de errores sobre un LOCAL y, en otros dos, un control cuyo
 *  inicializador interroga a la unidad. Es la forma de `gitea temp_repo.go` y
 *  `hugo modules/collect.go`. Con 2 clientes de verdad no llega al umbral. */
const AL3_GO_MIXTO = `
package main

type Repo struct {
	gitRepo *Git
}

func (t *Repo) init() error {
	return nil
}

func (t *Repo) A(s string) error {
	if err := t.init(); err != nil {
		return err
	}
	t.gitRepo.Use(s)
	return nil
}

func (t *Repo) B(s string) error {
	if err := t.init(); err != nil {
		return err
	}
	t.gitRepo.Use(s)
	return nil
}

func (t *Repo) C(s string) error {
	v, err := parse(s)
	if err != nil {
		return err
	}
	t.gitRepo.Use(v)
	return nil
}

func (t *Repo) D(s string) error {
	v, err := parse(s)
	if err != nil {
		return err
	}
	t.gitRepo.Use(v)
	return nil
}
`;

describe("hypotheses/proxy — OLA AL (AL3): los clientes que repiten tienen que ser clientes de verdad", () => {
  it("SIGUE EMITIENDO cuando el control lee un CAMPO de la unidad — el caso base de AE13 no se mueve y el `required` nuevo aprueba", async () => {
    const { ctx, finding } = await ae13Contexto(AE13_FUENTE_AUSENTE);
    const hyp = hypothesis.build(finding, null, ctx)!;
    expect(hyp).not.toBeNull();
    expect(reqAl3(hyp)!.passed).toBe(true);
  });

  it("JAVA: la ASIGNACIÓN DESNUDA a un campo declarado NO liga — el miembro que escribe `left` sigue contando como cliente y la hipótesis SE EMITE", async () => {
    const sets = await nodeSetsFor("tree-sitter-java.wasm", AH2_PROBE_JAVA);
    const root = await parseRoot("tree-sitter-java.wasm", AL3_JAVA_ASIGNA_CAMPO);
    const unit = fileUnitFrom(root, sets, "java", { file: "A.java" });
    expect(accessControlDetector.run(unit, testContext(accessControlDetector, "java", []))).toHaveLength(1);
    const { ctx, finding } = await ah2Contexto("tree-sitter-java.wasm", AH2_PROBE_JAVA, "java", AL3_JAVA_ASIGNA_CAMPO, "A.java");
    const hyp = hypothesis.build(finding, null, ctx);
    expect(hyp).not.toBeNull();
    expect(reqAl3(hyp!)!.passed).toBe(true);
    expect(reqAl3(hyp!)!.why).toContain("3");
  });

  it("JAVA: el control es un TERNARIO usado como ARGUMENTO de una llamada al objeto ⇒ ningún sitio interpone nada y NO EMITE — y el ANCLA sí produce el grupo", async () => {
    const sets = await nodeSetsFor("tree-sitter-java.wasm", AH2_PROBE_JAVA);
    const root = await parseRoot("tree-sitter-java.wasm", AL3_JAVA_TERNARIO_ARGUMENTO);
    const unit = fileUnitFrom(root, sets, "java", { file: "A.java" });
    expect(accessControlDetector.run(unit, testContext(accessControlDetector, "java", []))).toHaveLength(1);
    const { ctx, finding } = await ah2Contexto("tree-sitter-java.wasm", AH2_PROBE_JAVA, "java", AL3_JAVA_TERNARIO_ARGUMENTO, "A.java");
    expect(hypothesis.build(finding, null, ctx)).toBeNull();
  });

  it("JAVA: el MISMO ternario pero con el objeto DENTRO de una rama ⇒ SIGUE EMITIENDO — la diferencia es la rama, no el tipo de nodo", async () => {
    const { ctx, finding } = await ah2Contexto("tree-sitter-java.wasm", AH2_PROBE_JAVA, "java", AL3_JAVA_TERNARIO_CON_OBJETO, "A.java");
    const hyp = hypothesis.build(finding, null, ctx);
    expect(hyp).not.toBeNull();
    expect(reqAl3(hyp!)!.passed).toBe(true);
  });

  it("GO: grupo MIXTO — dos sitios con el idioma de errores sobre un LOCAL y dos que interrogan a la unidad ⇒ quedan 2 clientes de verdad y NO EMITE", async () => {
    const { ctx, finding } = await ah2Contexto("tree-sitter-go.wasm", AK5_PROBE_GO, "go", AL3_GO_MIXTO, "a.go");
    expect(hypothesis.build(finding, null, ctx)).toBeNull();
  });

  it("GO: el grupo HOMOGÉNEO de hugo (los tres con `if err := c.init(); err != nil`) SIGUE EMITIENDO — el `required` nuevo no lo toca", async () => {
    const { ctx, finding } = await ah2Contexto("tree-sitter-go.wasm", AK5_PROBE_GO, "go", AK5_GO_ERR_CON_MIEMBRO, "a.go");
    const hyp = hypothesis.build(finding, null, ctx);
    expect(hyp).not.toBeNull();
    expect(reqAl3(hyp!)!.passed).toBe(true);
  });

  it("RUBY: el sigilo `@conn` no lo liga el miembro y el control es una sentencia ⇒ los tres siguen siendo clientes de verdad", async () => {
    const { ctx, finding } = await ah2Contexto("tree-sitter-ruby.wasm", AH2_PROBE_RUBY, "ruby", AH2_RUBY, "a.rb");
    const hyp = hypothesis.build(finding, null, ctx);
    expect(hyp).not.toBeNull();
    expect(reqAl3(hyp!)!.passed).toBe(true);
  });
});
