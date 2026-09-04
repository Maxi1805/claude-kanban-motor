import { createRequire } from "node:module";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { deriveNodeSets, type DerivedNodeSets } from "../code-grammar.js";
import type { Capability } from "../detect/capabilities.js";
import { pisoDeclarado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import type { AstNode, CloneCandidate, Finding, FileUnit, RepoUnit, RoleLocation } from "../detect/types.js";
import type { CodeGraph, CodeGraphEdge, CodeGraphNode } from "../graph/types.js";
import { EMPTY_NEIGHBORHOOD, buildNeighborhoodIndex, neighborhoodFor } from "../graph/neighborhood.js";
import { hypothesis } from "./template-method.js";
import { refreshHypotheses } from "./run.js";
import type { HypothesisContext } from "./types.js";

const require = createRequire(import.meta.url);

/* ── Pool mínimo de tree-sitter (mismo espíritu que decorator.test.ts) para
 * probar las anclas ESTRUCTURALES (large-class/refused-bequest), que corren
 * sobre ctx.file VIVO, sin grafo. ── */
interface TSNode {
  type: string;
  isNamed: boolean;
  childCount: number;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  child(i: number): TSNode | null;
  childForFieldName(name: string): TSNode | null;
  text: string;
}
interface TSParser {
  setLanguage(language: unknown): void;
  parse(source: string): { rootNode: TSNode };
}

let tsParser: TSParser | null = null;
async function getTsParser(): Promise<TSParser> {
  if (tsParser) return tsParser;
  const wtsMod = require("web-tree-sitter");
  const Parser = wtsMod.Parser ?? wtsMod.default ?? wtsMod;
  await Parser.init();
  const Language = Parser.Language ?? wtsMod.Language;
  const wasmPath = path.join(path.dirname(require.resolve("tree-sitter-wasms/package.json")), "out", "tree-sitter-typescript.wasm");
  const language = await Language.load(wasmPath);
  const parser = new Parser();
  parser.setLanguage(language);
  tsParser = parser;
  return parser;
}

let tsSets: DerivedNodeSets | null = null;
beforeAll(async () => {
  const parser = await getTsParser();
  const probe = parser.parse("class Probe { method(x: number) { return x; } }\n").rootNode;
  tsSets = deriveNodeSets(probe as unknown as import("../code-grammar.js").ProbeNode);
}, 30_000);

/** Ubica, por nombre de clase, el span de esa clase en el árbol — misma
 *  técnica que `decorator.test.ts#findClassSpan`. */
function findClassSpanTM(root: TSNode, sets: DerivedNodeSets, className: string): { startLine: number; endLine: number } {
  let found: { startLine: number; endLine: number } | null = null;
  const visit = (node: TSNode): void => {
    if (found) return;
    if (sets.classNodes.has(node.type) && node.childForFieldName("name")?.text === className) {
      found = { startLine: node.startPosition.row + 1, endLine: node.endPosition.row + 1 };
      return;
    }
    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i);
      if (c) visit(c);
    }
  };
  visit(root);
  if (!found) throw new Error(`fixture inválida: no se encontró la clase "${className}"`);
  return found;
}

/** Construye un `HypothesisContext` con `ctx.file` VIVO (sin grafo) y un
 *  `Finding` estructural (large-class/refused-bequest) anclado en `className`
 *  — el escenario real de producción para estas dos anclas nuevas. */
async function structuralContextFor(source: string, className: string, kind: string, clones: readonly CloneCandidate[] = []): Promise<{ ctx: HypothesisContext; finding: Finding }> {
  const parser = await getTsParser();
  const root = parser.parse(source).rootNode;
  const sets = tsSets!;
  const span = findClassSpanTM(root, sets, className);
  const file: FileUnit = {
    path: "fixture.ts",
    language: "typescript",
    lines: root.text.split("\n").length,
    root: root as unknown as AstNode,
    sets,
    functions: [],
  };
  const finding: Finding = {
    id: `f-${className}`,
    detectorId: kind,
    kind: kind as Finding["kind"],
    scope: "intra-file",
    language: "typescript",
    title: "t",
    detail: "d",
    trigger: [{ label: "m", value: 1, threshold: fakeThreshold() }],
    locations: [{ file: file.path, startLine: span.startLine, endLine: span.endLine, symbol: className, role: "problema" }],
    severity: 45,
    advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
  };
  const ctx: HypothesisContext = {
    file,
    fileAt: () => null,
    repo: { repoName: "r", files: [], functions: [], clones, graph: null },
    capabilities: new Set<Capability>(["herencia", "unidad-tipo-clase"]),
    setsFor: () => sets,
    neighborhood: EMPTY_NEIGHBORHOOD,
    branches: () => null,
  };
  return { ctx, finding };
}

function fakeThreshold(): Threshold {
  return resolveThreshold(pisoDeclarado(2, { rationale: "test" }), {
    language: "typescript",
    sampleSize: () => 0,
    corpusP95: () => null,
  });
}

function loc(file: string, startLine: number, endLine: number, symbol?: string, role = "copia"): RoleLocation {
  return { file, startLine, endLine, role, ...(symbol !== undefined ? { symbol } : {}) };
}

function fakeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "f1",
    detectorId: "distributed-duplication",
    kind: "distributed-duplication",
    scope: "inter-file",
    language: null,
    title: "t",
    detail: "d",
    trigger: [{ label: "copias", value: 2, threshold: fakeThreshold() }],
    locations: [loc("a.ts", 1, 10), loc("b.ts", 1, 10)],
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
    endLine: 10,
    nodes: 20,
    type: "method_definition",
    functionName: "mine",
    className: null,
    superclassName: null,
    normalized: "read(); parse(); analyze(); write();",
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

function classNode(name: string, symbolPath: readonly string[] = [name], file = "base.ts", startLine = 1): CodeGraphNode {
  return { id: `sym:${file}#${symbolPath.join(".")}`, kind: "symbol", file, symbolPath, family: "class-like", startLine, endLine: startLine + 20 };
}

function methodNode(symbolPath: readonly string[], file: string, startLine = 2, arity: number | null = null): CodeGraphNode {
  return { id: `sym:${file}#${symbolPath.join(".")}`, kind: "symbol", file, symbolPath, family: "function-like", startLine, endLine: startLine + 3, arity };
}

/** `graph/types.ts#CodeGraphEdge` mínima — mismo estilo que `wrapping-chain.test.ts`. */
function edge(from: string, to: string, kind: CodeGraphEdge["kind"], overrides: Partial<CodeGraphEdge> = {}): CodeGraphEdge {
  return { from, to, kind, provenance: "resolved", weight: 1, ...overrides };
}

/** `contains` desde el owner hacia cada uno de sus miembros — lo que `memberSignatures` recorre. */
function containsAll(ownerId: string, memberIds: readonly string[]): CodeGraphEdge[] {
  return memberIds.map((m) => edge(ownerId, m, "contains"));
}

function makeGraph(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[] = []): CodeGraph {
  return { nodes, edges, resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] } };
}

const SIM_A = "read(); parse(); analyze(); write();";
const SIM_B = "read(); parseCsv(); analyze(); write();"; // alta similitud (comparte read/analyze/write)
const DIFFERENT = "validate(); save(); log();";
// Similitud EXACTAMENTE en el piso (Jaccard 2/5 = 0.4): pasa el `required`
// pero NO el discriminador `high-average-similarity` (>= 0.6).
const LOW_SIM_A = "alpha(); beta(); gamma();";
const LOW_SIM_B = "alpha(); beta(); delta(); epsilon();";

describe("hypotheses/template-method", () => {
  /**
   * OLA AC (AC3) — ESTE TEST AFIRMA HOY LO CONTRARIO DE LO QUE AFIRMABA, Y
   * ESTÁ INVERTIDO A PROPÓSITO, CON EL NÚMERO DE R1 AL LADO: `large-class`
   * (0/23 = 0,0 % [0,0 %, 14,3 %], 61+20 recomendaciones) e
   * `inheritance-family` (1/14 = 7,1 % [1,3 %, 31,5 %], 27+7) dejaron de
   * emitir por R1, medidas por AC3 con el instrumento oficial sobre su propio
   * censo. Volver a encender cualquiera de las dos rompe este test y obliga a
   * leer por qué se apagó.
   */
  it("declara sus anclas — las cuatro previas MÁS homonymous-divergent-sequence (la de FUERZA, Ola AC); large-class e inheritance-family VUELVEN (R1 revertida)", () => {
    // AC3 retiró `large-class` (0/23 = 0,0 %) e `inheritance-family`
    // (1/14 = 7,1 %) por R1. SE REVIRTIÓ en la misma ola: el proyecto mejora
    // de forma ADITIVA, y la poda de falsos se decide después con un criterio
    // de costo/beneficio acordado — no con un umbral inventado que, en 20 %,
    // queda por encima del promedio del catálogo (15,0 %) y barre casi todo.
    // Los números medidos siguen publicados en ola-ac/informes/AC3.md y son el
    // insumo de esa poda futura, no su justificación ahora.
    expect(hypothesis.id).toBe("template-method");
    expect(hypothesis.pattern).toBe("Template Method");
    expect(hypothesis.anchors).toEqual([
      "distributed-duplication", "parallel-hierarchies", "refused-bequest",
      "homonymous-divergent-sequence", "large-class", "inheritance-family",
    ]);
  });

  it("required no cumplido (sin CloneCandidate que matchee) ⇒ null", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({ clones: [] });
    expect(hypothesis.build(finding, null, fakeCtx(repo))).toBeNull();
  });

  it("required no cumplido (función anónima: functionName null, higiene heredada) ⇒ null", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 10, functionName: null, className: "A" }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 10, functionName: null, className: "B" }),
      ],
    });
    expect(hypothesis.build(finding, null, fakeCtx(repo))).toBeNull();
  });

  it("required no cumplido (secuencia de llamadas < MIN_SEQUENCE_LEN=3) ⇒ null", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 10, className: "A", normalized: "read(); write();" }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 10, className: "B", normalized: "read(); write();" }),
      ],
    });
    expect(hypothesis.build(finding, null, fakeCtx(repo))).toBeNull();
  });

  it("required no cumplido (mismo nombre de método, pero MISMA unidad — sobrecarga, no 2 unidades distintas) ⇒ null", () => {
    const finding = fakeFinding({ locations: [loc("a.ts", 1, 10), loc("a.ts", 20, 30)] });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 10, className: "A", normalized: SIM_A }),
        fakeClone({ file: "a.ts", startLine: 20, endLine: 30, className: "A", normalized: SIM_A }),
      ],
    });
    expect(hypothesis.build(finding, null, fakeCtx(repo))).toBeNull();
  });

  it("required no cumplido (secuencias de llamada disímiles, Jaccard < 0.4) ⇒ null", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 10, className: "A", normalized: SIM_A }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 10, className: "B", normalized: DIFFERENT }),
      ],
    });
    expect(hypothesis.build(finding, null, fakeCtx(repo))).toBeNull();
  });

  it("required cumplido (2 unidades distintas, mismo nombre, secuencia similar) ⇒ estado ausente, oportunidad", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 10, className: "A", normalized: SIM_A }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 10, className: "B", normalized: SIM_B }),
      ],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo))!;
    expect(h).not.toBeNull();
    expect(h.state).toBe("ausente");
    expect(h.confidence).not.toBeNull();
    expect(h.anchorFindingId).toBe("f1");
    expect(h.places).toHaveLength(2);
  });

  /* ── ARIDAD COMPATIBLE (registro de pendientes, "Template Method empareja
   * por nombre y no mira la aridad") — caso testigo verificado a mano:
   * `corpus/newtonsoft-json/.../Bson/BsonToken.cs`, `BsonObject.Add(string,
   * BsonToken)` (aridad 2) vs `BsonArray.Add(BsonToken)` (aridad 1). Acá,
   * con grafo (la única vía por la que `distributed-duplication` conoce la
   * aridad de un `CloneCandidate` — ver `arityRangeFromClone`). ── */
  it("required NO cumplido (mismo nombre, aridad INCOMPATIBLE vía grafo: arity 2 vs arity 1, sin parámetro opcional que explique la diferencia) ⇒ null — caso testigo BsonToken.cs", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 10, className: "A", functionName: "add", normalized: SIM_A }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 10, className: "B", functionName: "add", normalized: SIM_B }),
      ],
    });
    const a = classNode("A", ["A"], "a.ts");
    const addA = methodNode(["A", "add"], "a.ts", 2, 2); // Add(string, BsonToken) — aridad 2
    const b = classNode("B", ["B"], "b.ts");
    const addB = methodNode(["B", "add"], "b.ts", 2, 1); // Add(BsonToken) — aridad 1
    const graph = makeGraph([a, addA, b, addB], [...containsAll(a.id, [addA.id]), ...containsAll(b.id, [addB.id])]);
    expect(hypothesis.build(finding, graph, fakeCtx(repo))).toBeNull();
  });

  it("required SÍ cumplido (mismo nombre, MISMA aridad vía grafo) ⇒ estado ausente — la aridad compatible no rompe el caso legítimo", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 10, className: "A", functionName: "add", normalized: SIM_A }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 10, className: "B", functionName: "add", normalized: SIM_B }),
      ],
    });
    const a = classNode("A", ["A"], "a.ts");
    const addA = methodNode(["A", "add"], "a.ts", 2, 1);
    const b = classNode("B", ["B"], "b.ts");
    const addB = methodNode(["B", "add"], "b.ts", 2, 1);
    const graph = makeGraph([a, addA, b, addB], [...containsAll(a.id, [addA.id]), ...containsAll(b.id, [addB.id])]);
    const h = hypothesis.build(finding, graph, fakeCtx(repo));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
  });

  it("discriminador regla-de-tres: 3 unidades distintas suben la escalera respecto de 2", () => {
    // 2 unidades con similitud EXACTAMENTE en el piso (0.4: pasa el required,
    // no el discriminador de alta similitud) ⇒ sólo `anchor-is-distributed-
    // duplication` confirma ⇒ "media".
    const finding2 = fakeFinding({ locations: [loc("a.ts", 1, 10), loc("b.ts", 1, 10)] });
    const repo2 = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 10, className: "A", normalized: LOW_SIM_A }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 10, className: "B", normalized: LOW_SIM_B }),
      ],
    });
    const h2 = hypothesis.build(finding2, null, fakeCtx(repo2))!;
    expect(h2.confidence).toBe("media");

    // 3 unidades, texto idéntico ⇒ regla-de-tres + alta similitud + ancla ⇒ "alta".
    const finding3 = fakeFinding({ locations: [loc("a.ts", 1, 10), loc("b.ts", 1, 10), loc("c.ts", 1, 10)] });
    const repo3 = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 10, className: "A", normalized: SIM_A }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 10, className: "B", normalized: SIM_A }),
        fakeClone({ file: "c.ts", startLine: 1, endLine: 10, className: "C", normalized: SIM_A }),
      ],
    });
    const h3 = hypothesis.build(finding3, null, fakeCtx(repo3))!;

    const ladder = { baja: 0, media: 1, alta: 2 } as const;
    expect(ladder[h3.confidence!]).toBeGreaterThan(ladder[h2.confidence!]);
  });

  it("discriminador ancla: distributed-duplication confirma un peldaño que parallel-hierarchies no confirma", () => {
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 10, className: "A", normalized: SIM_A }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 10, className: "B", normalized: SIM_A }),
        fakeClone({ file: "c.ts", startLine: 1, endLine: 10, className: "C", normalized: SIM_A }),
      ],
    });
    const finding = fakeFinding({ locations: [loc("a.ts", 1, 10), loc("b.ts", 1, 10), loc("c.ts", 1, 10)] });
    const h = hypothesis.build(finding, null, fakeCtx(repo))!;
    const discriminatorIds = h.discriminators.filter((d) => d.passed).map((d) => d.label);
    expect(discriminatorIds.length).toBeGreaterThan(0);
  });

  it("excluder: sin ancestro común confirmado vía `extends` ⇒ ausente, con evidencia explícita", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 10, className: "A", normalized: SIM_A }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 10, className: "B", normalized: SIM_B }),
      ],
    });
    const a = classNode("A", ["A"], "a.ts");
    const b = classNode("B", ["B"], "b.ts");
    const graph = makeGraph([a, b]); // sin ninguna arista `extends`
    const h = hypothesis.build(finding, graph, fakeCtx(repo))!;
    expect(h.state).toBe("ausente");
    const applied = h.checks.find((c) => c.role === "applied")!;
    expect(applied.passed).toBe(false);
    expect(applied.why).toMatch(/no tienen un ancestro común confirmado/);
  });

  it("excluder: sin grafo en la corrida, lenguaje CON herencia ⇒ parcial (nunca aplicado-eludido/ya-aplicado sin grafo)", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 10, className: "A", normalized: SIM_A }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 10, className: "B", normalized: SIM_B }),
      ],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo, new Set<Capability>(["herencia"])))!;
    expect(h.state).toBe("parcial");
    expect(h.confidence).not.toBeNull(); // parcial SÍ compite
  });

  /* ══════════════════════════════════════════════════════════════════════
   * OLA AF, FRENTE AF5 — EL CAMINO QUE FALTABA: `ausente`.
   *
   * Medido antes de tocar nada sobre las DOS poblaciones (21 repos, volcado
   * propio del día): las cuatro celdas de Template Method
   * (`homonymous-divergent-sequence`, `large-class`, `inheritance-family`,
   * `refused-bequest`) tenían `ausente` = 0 sobre 284 hipótesis vivas —
   * **imposible por construcción**, no por falta de población. Estos cuatro
   * tests fijan la salida nueva Y sus dos controles negativos, que son los
   * que impiden afirmar la ausencia sin el hecho que la sostiene.
   *
   * EL TEST QUE ESTABA ACÁ ("…pero NO declara el método ⇒ parcial") afirmaba
   * exactamente la compuerta que este frente vino a abrir: mismo fixture,
   * mismo `finding`, y ahora exige `ausente` MÁS los cuatro checks — no se
   * aflojó ninguna aserción, se agregaron dos.
   * ══════════════════════════════════════════════════════════════════════ */

  it("OLA AF (AF5): ancestro confirmado y LEGIBLE, el esqueleto NO vive arriba y el ancestro no hospeda ninguna plantilla ⇒ ausente (antes: parcial, y `ausente` era inalcanzable)", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 10, className: "A", normalized: SIM_A }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 10, className: "B", normalized: SIM_B }),
      ],
    });
    const base = classNode("DataMiner", ["DataMiner"], "base.ts");
    const otroMetodo = methodNode(["DataMiner", "otroMetodo"], "base.ts");
    const a = classNode("A", ["A"], "a.ts");
    const b = classNode("B", ["B"], "b.ts");
    const graph = makeGraph(
      [base, otroMetodo, a, b],
      [edge(a.id, base.id, "extends"), edge(b.id, base.id, "extends"), ...containsAll(base.id, [otroMetodo.id])],
    );
    const h = hypothesis.build(finding, graph, fakeCtx(repo))!;
    expect(h.state).toBe("ausente");
    // Los dos checks VIEJOS de esta rama siguen intactos, con su mismo `passed`.
    expect(h.checks.find((c) => c.label === "subtipos-comparten-un-ancestro-comun")!.passed).toBe(true);
    expect(h.checks.find((c) => c.label === "el-esqueleto-vive-en-el-ancestro")!.passed).toBe(false);
    // Los dos NUEVOS, que son los que deciden.
    expect(h.checks.find((c) => c.label === "las-declaraciones-del-ancestro-son-legibles")!.passed).toBe(true);
    expect(h.checks.find((c) => c.label === "el-ancestro-ya-hospeda-una-plantilla-para-otro-miembro")!.passed).toBe(false);
    // `ausente` es RECOMENDACIÓN: sigue compitiendo por confianza, igual que `parcial`.
    expect(h.confidence).not.toBeNull();
  });

  it("OLA AF (AF5), control negativo 1 — LEGIBILIDAD: el ancestro no expone NI UN miembro ⇒ sigue `parcial`, nunca `ausente` (no se afirma una ausencia que no se pudo mirar)", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 10, className: "A", normalized: SIM_A }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 10, className: "B", normalized: SIM_B }),
      ],
    });
    const base = classNode("DataMiner", ["DataMiner"], "base.ts"); // sin ningún `contains`
    const a = classNode("A", ["A"], "a.ts");
    const b = classNode("B", ["B"], "b.ts");
    const graph = makeGraph([base, a, b], [edge(a.id, base.id, "extends"), edge(b.id, base.id, "extends")]);
    const h = hypothesis.build(finding, graph, fakeCtx(repo))!;
    expect(h.state).toBe("parcial");
    expect(h.checks.find((c) => c.label === "las-declaraciones-del-ancestro-son-legibles")!.passed).toBe(false);
  });

  it("OLA AF (AF5), control negativo 2 — PLANTILLA YA ARRIBA: el ancestro declara un gancho que TODOS los hermanos redeclaran e invocado desde otro miembro suyo ⇒ sigue `parcial` (la familia ya tiene plantilla; este miembro quedó afuera)", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 10, className: "A", normalized: SIM_A }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 10, className: "B", normalized: SIM_B }),
      ],
    });
    const base = classNode("DataMiner", ["DataMiner"], "base.ts");
    const orquesta = methodNode(["DataMiner", "orquesta"], "base.ts", 2);
    const paso = methodNode(["DataMiner", "paso"], "base.ts", 6);
    const a = classNode("A", ["A"], "a.ts");
    const aPaso = methodNode(["A", "paso"], "a.ts");
    const b = classNode("B", ["B"], "b.ts");
    const bPaso = methodNode(["B", "paso"], "b.ts");
    const graph = makeGraph(
      [base, orquesta, paso, a, aPaso, b, bPaso],
      [
        edge(a.id, base.id, "extends"),
        edge(b.id, base.id, "extends"),
        ...containsAll(base.id, [orquesta.id, paso.id]),
        ...containsAll(a.id, [aPaso.id]),
        ...containsAll(b.id, [bPaso.id]),
        edge(orquesta.id, paso.id, "calls"),
      ],
    );
    const h = hypothesis.build(finding, graph, fakeCtx(repo))!;
    expect(h.state).toBe("parcial");
    expect(h.checks.find((c) => c.label === "el-esqueleto-vive-en-el-ancestro")!.passed).toBe(false);
    expect(h.checks.find((c) => c.label === "el-ancestro-ya-hospeda-una-plantilla-para-otro-miembro")!.passed).toBe(true);
  });

  it("OLA AF (AF5), ADITIVIDAD: la rama nueva SÓLO puede contestar `ausente` o `parcial` — las dos son RECOMENDACIÓN, ninguna entrada cae en ya-aplicado/aplicado-eludido por este cambio", () => {
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 10, className: "A", normalized: SIM_A }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 10, className: "B", normalized: SIM_B }),
      ],
    });
    const base = classNode("DataMiner", ["DataMiner"], "base.ts");
    const otroMetodo = methodNode(["DataMiner", "otroMetodo"], "base.ts");
    const a = classNode("A", ["A"], "a.ts");
    const b = classNode("B", ["B"], "b.ts");
    const conMiembro = makeGraph(
      [base, otroMetodo, a, b],
      [edge(a.id, base.id, "extends"), edge(b.id, base.id, "extends"), ...containsAll(base.id, [otroMetodo.id])],
    );
    const sinMiembro = makeGraph([base, a, b], [edge(a.id, base.id, "extends"), edge(b.id, base.id, "extends")]);
    for (const g of [conMiembro, sinMiembro]) {
      const h = hypothesis.build(fakeFinding(), g, fakeCtx(repo))!;
      expect(["ausente", "parcial"]).toContain(h.state);
      expect(h.confidence).not.toBeNull(); // recomendación: compite en el ranking
    }
  });

  it("excluder COMPLETA (CONTRATO-F10.md §2): ancestro declara el esqueleto, nadie lo redeclara, gancho redeclarado por TODOS e invocado (`calls`) desde el esqueleto ⇒ ya-aplicado, sin confianza, gancho confirmado", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 10, className: "A", normalized: SIM_A }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 10, className: "B", normalized: SIM_B }),
      ],
    });
    const base = classNode("DataMiner", ["DataMiner"], "base.ts");
    const mine = methodNode(["DataMiner", "mine"], "base.ts", 2);
    const step = methodNode(["DataMiner", "step"], "base.ts", 6);
    const a = classNode("A", ["A"], "a.ts");
    const aStep = methodNode(["A", "step"], "a.ts");
    const b = classNode("B", ["B"], "b.ts");
    const bStep = methodNode(["B", "step"], "b.ts");
    const graph = makeGraph(
      [base, mine, step, a, aStep, b, bStep],
      [
        edge(a.id, base.id, "extends"),
        edge(b.id, base.id, "extends"),
        ...containsAll(base.id, [mine.id, step.id]),
        ...containsAll(a.id, [aStep.id]),
        ...containsAll(b.id, [bStep.id]),
        edge(mine.id, step.id, "calls"),
      ],
    );
    const h = hypothesis.build(finding, graph, fakeCtx(repo))!;
    expect(h.state).toBe("ya-aplicado");
    expect(h.confidence).toBeNull();
    const hookCheck = h.checks.find((c) => c.label.includes("gancho"))!;
    expect(hookCheck.passed).toBe(true);
    expect(hookCheck.why).toMatch(/invoca/);
  });

  /* OLA U (INTENCIÓN 3) — este test y el siguiente cambiaron de expectativa
   * a propósito, con medición: verificaban el "REQUISITO 3" de CONTRATO-F10.md
   * ("ancestro + esqueleto sin redeclarar ⇒ `ya-aplicado` aunque el gancho no
   * se confirme"). Medido sobre 7 repos del corpus ANTES de la Ola U: 160 de
   * 162 `ya-aplicado` tenían el check de gancho en `passed: false` — o sea que
   * esa regla afirmaba "el patrón ya está aplicado" sobre CUALQUIER método
   * heredado. Template Method no es "hay un método común en la base": es "la
   * base fija el ORDEN y el subtipo pone el PASO". Sin gancho invocado no hay
   * plantilla, y el estado honesto es `parcial` (la familia y el método común
   * ya están; falta el paso variable) — nunca `ya-aplicado`. Las aserciones
   * sobre el check de gancho NO se aflojaron: siguen exigiendo `passed:false`
   * y el motivo exacto. */
  it("OLA U: ancestro declara el esqueleto y nadie lo redeclara, pero SIN ningún gancho candidato ⇒ NO es una plantilla ⇒ parcial (antes: ya-aplicado), con el gancho declarado como no confirmado", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 10, className: "A", normalized: SIM_A }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 10, className: "B", normalized: SIM_B }),
      ],
    });
    const base = classNode("DataMiner", ["DataMiner"], "base.ts");
    const mine = methodNode(["DataMiner", "mine"], "base.ts");
    const a = classNode("A", ["A"], "a.ts");
    const b = classNode("B", ["B"], "b.ts");
    // A y B no redeclaran nada en común: sin candidato a gancho.
    const graph = makeGraph([base, mine, a, b], [edge(a.id, base.id, "extends"), edge(b.id, base.id, "extends"), ...containsAll(base.id, [mine.id])]);
    const h = hypothesis.build(finding, graph, fakeCtx(repo))!;
    expect(h.state).toBe("parcial");
    const hookCheck = h.checks.find((c) => c.label.includes("gancho"))!;
    expect(hookCheck.passed).toBe(false);
    expect(hookCheck.why).toMatch(/no declara ningún otro miembro/);
    expect(hookCheck.why).toMatch(/no es un esqueleto|método heredado/);
  });

  it("OLA U: gancho existe y todos lo redeclaran, pero SIN arista `calls` desde el esqueleto ⇒ el orden no está fijado en la base ⇒ parcial (antes: ya-aplicado), gancho no confirmado", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 10, className: "A", normalized: SIM_A }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 10, className: "B", normalized: SIM_B }),
      ],
    });
    const base = classNode("DataMiner", ["DataMiner"], "base.ts");
    const mine = methodNode(["DataMiner", "mine"], "base.ts", 2);
    const step = methodNode(["DataMiner", "step"], "base.ts", 6);
    const a = classNode("A", ["A"], "a.ts");
    const aStep = methodNode(["A", "step"], "a.ts");
    const b = classNode("B", ["B"], "b.ts");
    const bStep = methodNode(["B", "step"], "b.ts");
    const graph = makeGraph(
      [base, mine, step, a, aStep, b, bStep],
      [
        edge(a.id, base.id, "extends"),
        edge(b.id, base.id, "extends"),
        ...containsAll(base.id, [mine.id, step.id]),
        ...containsAll(a.id, [aStep.id]),
        ...containsAll(b.id, [bStep.id]),
        // SIN edge(mine.id, step.id, "calls") — el gancho existe, pero no está confirmado que el esqueleto lo invoque.
      ],
    );
    const h = hypothesis.build(finding, graph, fakeCtx(repo))!;
    expect(h.state).toBe("parcial");
    const hookCheck = h.checks.find((c) => c.label.includes("gancho"))!;
    expect(hookCheck.passed).toBe(false);
    expect(hookCheck.why).toMatch(/no invoca a ninguno/);
  });

  /* ──────────────────────────────────────────────────────────────────────
   * OLA AD, FRENTE AD2 — LA TERCERA CONDICIÓN: "RESOLUCIÓN VERIFICADA".
   *
   * Los cuatro tests de abajo son las cuatro esquinas del check nuevo
   * (`el-miembro-ya-es-el-paso-variable-de-un-orden-fijado-en-el-ancestro`):
   * el caso que SÍ es una plantilla ya puesta, y los tres controles negativos
   * —uno por cada hecho que el check exige—, que son los que garantizan que
   * el cambio es ADITIVO: sin los tres, todo lo que hoy contesta `parcial`
   * podría pasarse a `ya-aplicado` sin que ningún test lo notara.
   * ────────────────────────────────────────────────────────────────────── */
  it("OLA AD2 (resolución verificada): el ancestro declara el método Y OTRO miembro suyo lo invoca Y los subtipos lo redeclaran ⇒ el método es el GANCHO de una plantilla que ya existe ⇒ ya-aplicado (antes: parcial)", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 10, className: "A", normalized: SIM_A }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 10, className: "B", normalized: SIM_B }),
      ],
    });
    const base = classNode("DataMiner", ["DataMiner"], "base.ts");
    // `mine` es el GANCHO: lo declara la base y lo redeclaran los dos hermanos.
    const mine = methodNode(["DataMiner", "mine"], "base.ts", 2);
    // `run` es la PLANTILLA: se queda fija arriba (nadie la redeclara) e invoca a `mine`.
    const run = methodNode(["DataMiner", "run"], "base.ts", 6);
    const a = classNode("A", ["A"], "a.ts");
    const aMine = methodNode(["A", "mine"], "a.ts");
    const b = classNode("B", ["B"], "b.ts");
    const bMine = methodNode(["B", "mine"], "b.ts");
    const graph = makeGraph(
      [base, mine, run, a, aMine, b, bMine],
      [
        edge(a.id, base.id, "extends"),
        edge(b.id, base.id, "extends"),
        ...containsAll(base.id, [mine.id, run.id]),
        ...containsAll(a.id, [aMine.id]),
        ...containsAll(b.id, [bMine.id]),
        edge(run.id, mine.id, "calls"),
      ],
    );
    const h = hypothesis.build(finding, graph, fakeCtx(repo))!;
    expect(h.state).toBe("ya-aplicado");
    expect(h.confidence).toBeNull(); // una confirmación no compite por confianza
    const check = h.checks.find((c) => c.label === "el-miembro-ya-es-el-paso-variable-de-un-orden-fijado-en-el-ancestro")!;
    expect(check.passed).toBe(true);
    expect(check.why).toMatch(/"run"/);
    expect(check.why).toMatch(/YA ESTÁ HECHO/);
    // Y NO por la vía vieja: el check de gancho sigue en false (`mine` no llama a nada).
    expect(h.checks.find((c) => c.label.startsWith("gancho-"))!.passed).toBe(false);
  });

  it("OLA AD2, control negativo 1 (el que protege las verdaderas): el ancestro declara el método pero NINGÚN miembro suyo lo invoca ⇒ sigue siendo parcial — caso testigo `ImmutableSet.SetBuilderImpl.build` y `VirtualFile.isDescendant`, las dos VERDADERAS de la Ola AC que estaban en esta rama", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 10, className: "A", normalized: SIM_A }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 10, className: "B", normalized: SIM_B }),
      ],
    });
    const base = classNode("DataMiner", ["DataMiner"], "base.ts");
    const mine = methodNode(["DataMiner", "mine"], "base.ts", 2);
    const run = methodNode(["DataMiner", "run"], "base.ts", 6);
    const a = classNode("A", ["A"], "a.ts");
    const aMine = methodNode(["A", "mine"], "a.ts");
    const b = classNode("B", ["B"], "b.ts");
    const bMine = methodNode(["B", "mine"], "b.ts");
    const graph = makeGraph(
      [base, mine, run, a, aMine, b, bMine],
      [
        edge(a.id, base.id, "extends"),
        edge(b.id, base.id, "extends"),
        ...containsAll(base.id, [mine.id, run.id]),
        ...containsAll(a.id, [aMine.id]),
        ...containsAll(b.id, [bMine.id]),
        // SIN edge(run.id, mine.id, "calls") — el ancestro declara `mine`, pero no fija ningún orden que lo delegue.
      ],
    );
    const h = hypothesis.build(finding, graph, fakeCtx(repo))!;
    expect(h.state).toBe("parcial");
    const check = h.checks.find((c) => c.label === "el-miembro-ya-es-el-paso-variable-de-un-orden-fijado-en-el-ancestro")!;
    expect(check.passed).toBe(false);
    expect(check.why).toMatch(/Ningún otro miembro/);
  });

  it("OLA AD2, control negativo 2: el único miembro del ancestro que invoca al método TIENE EL MISMO NOMBRE (sobrecarga/delegación hacia arriba, el lazo `create --calls--> create` medido en guava-testlib) ⇒ no cuenta ⇒ sigue siendo parcial", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 10, className: "A", normalized: SIM_A }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 10, className: "B", normalized: SIM_B }),
      ],
    });
    const base = classNode("DataMiner", ["DataMiner"], "base.ts");
    const mine = methodNode(["DataMiner", "mine"], "base.ts", 2);
    const a = classNode("A", ["A"], "a.ts");
    const aMine = methodNode(["A", "mine"], "a.ts");
    const b = classNode("B", ["B"], "b.ts");
    const bMine = methodNode(["B", "mine"], "b.ts");
    const graph = makeGraph(
      [base, mine, a, aMine, b, bMine],
      [
        edge(a.id, base.id, "extends"),
        edge(b.id, base.id, "extends"),
        ...containsAll(base.id, [mine.id]),
        ...containsAll(a.id, [aMine.id]),
        ...containsAll(b.id, [bMine.id]),
        edge(mine.id, mine.id, "calls"), // el lazo: el grafo resolvió la sobrecarga a la PRIMERA declaración
      ],
    );
    const h = hypothesis.build(finding, graph, fakeCtx(repo))!;
    expect(h.state).toBe("parcial");
    expect(h.checks.find((c) => c.label === "el-miembro-ya-es-el-paso-variable-de-un-orden-fijado-en-el-ancestro")!.passed).toBe(false);
  });

  it("OLA AD2, control negativo 3: el miembro que invoca al método TAMBIÉN lo redeclara cada subtipo ⇒ arriba no quedó fijo ningún orden ⇒ sigue siendo parcial", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 10, className: "A", normalized: SIM_A }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 10, className: "B", normalized: SIM_B }),
      ],
    });
    const base = classNode("DataMiner", ["DataMiner"], "base.ts");
    const mine = methodNode(["DataMiner", "mine"], "base.ts", 2);
    const run = methodNode(["DataMiner", "run"], "base.ts", 6);
    const a = classNode("A", ["A"], "a.ts");
    const aMine = methodNode(["A", "mine"], "a.ts");
    const aRun = methodNode(["A", "run"], "a.ts", 6);
    const b = classNode("B", ["B"], "b.ts");
    const bMine = methodNode(["B", "mine"], "b.ts");
    const bRun = methodNode(["B", "run"], "b.ts", 6);
    const graph = makeGraph(
      [base, mine, run, a, aMine, aRun, b, bMine, bRun],
      [
        edge(a.id, base.id, "extends"),
        edge(b.id, base.id, "extends"),
        ...containsAll(base.id, [mine.id, run.id]),
        ...containsAll(a.id, [aMine.id, aRun.id]),
        ...containsAll(b.id, [bMine.id, bRun.id]),
        edge(run.id, mine.id, "calls"),
      ],
    );
    const h = hypothesis.build(finding, graph, fakeCtx(repo))!;
    expect(h.state).toBe("parcial");
    expect(h.checks.find((c) => c.label === "el-miembro-ya-es-el-paso-variable-de-un-orden-fijado-en-el-ancestro")!.passed).toBe(false);
  });

  /* OLA U: la fixture gana el GANCHO (`step`, redeclarado por A y B, invocado
   * por `mine` vía `calls`) que la forma COMPLETA exige desde esta ola. El
   * sujeto del test no cambia — B reimplementa el esqueleto en vez de
   * heredarlo, y eso sigue siendo `aplicado-eludido` — pero ahora el estado
   * requiere que la plantilla EXISTA para poder decir que se la saltean:
   * "eludir" un patrón que no está no significa nada. */
  it("excluder: plantilla COMPLETA (gancho redeclarado por todos e invocado) + UN subtipo REDECLARA el esqueleto ⇒ aplicado-eludido (fuga), sin confianza", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 10, className: "A", normalized: SIM_A }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 10, className: "B", normalized: SIM_B }),
      ],
    });
    const base = classNode("DataMiner", ["DataMiner"], "base.ts");
    const mine = methodNode(["DataMiner", "mine"], "base.ts", 2);
    const step = methodNode(["DataMiner", "step"], "base.ts", 6);
    const a = classNode("A", ["A"], "a.ts");
    const aStep = methodNode(["A", "step"], "a.ts");
    const b = classNode("B", ["B"], "b.ts");
    const bStep = methodNode(["B", "step"], "b.ts");
    const bMine = methodNode(["B", "mine"], "b.ts"); // B reimplementa "mine" en vez de heredarlo
    const graph = makeGraph(
      [base, mine, step, a, aStep, b, bStep, bMine],
      [
        edge(a.id, base.id, "extends"),
        edge(b.id, base.id, "extends"),
        ...containsAll(base.id, [mine.id, step.id]),
        ...containsAll(a.id, [aStep.id]),
        ...containsAll(b.id, [bStep.id, bMine.id]),
        edge(mine.id, step.id, "calls"),
      ],
    );
    const h = hypothesis.build(finding, graph, fakeCtx(repo))!;
    expect(h.state).toBe("aplicado-eludido");
    expect(h.confidence).toBeNull();
    const bypassCheck = h.checks.find((c) => c.label.includes("ningun-subtipo-redeclara"))!;
    expect(bypassCheck.passed).toBe(false);
    const hookCheck = h.checks.find((c) => c.label.includes("gancho"))!;
    expect(hookCheck.passed).toBe(true);
  });

  /* ────────────────────────────────────────────────────────────────────────
   * R5 (RAICES.md) — "la familia se arma sólo por herencia; el mixin existe
   * y nadie lo mira". `commonAncestorIds`/`classLikeNodesRelatedTo` (antes
   * `commonAncestorId`/`classLikeNodesExtending`, singular) ahora consultan
   * `FAMILY_EDGE_KINDS = {"extends", "mixes-in"}`, no sólo `extends`. Caso
   * testigo verificado a mano: `app/models/deal.rb:67` (Ola C) salía
   * `parcial`/`confidence: alta` con la evidencia falsa "el ancestro
   * (`ApplicationRecord`, vía `extends`) no declara el esqueleto — subirlo
   * es la mitigación exacta", cuando el esqueleto YA vivía en `ProtoModule`
   * (vía `include`, `mixes-in`) — ver los dos tests de abajo.
   * ──────────────────────────────────────────────────────────────────────── */
  it("excluder R5: ancestro común confirmado SÓLO vía `mixes-in` (sin ningún `extends` en el grafo) ⇒ ya-aplicado igual — el mixin también arma familia", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 10, className: "A", normalized: SIM_A }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 10, className: "B", normalized: SIM_B }),
      ],
    });
    // OLA U: la fixture gana el GANCHO (`step`, redeclarado por A y B, invocado
    // por `mine`) — la forma COMPLETA que `ya-aplicado` exige desde esta ola.
    // El sujeto del test no cambia: la familia sigue armándose SÓLO por
    // `mixes-in`, que es lo que R5 vino a probar.
    const base = classNode("ProtoMixin", ["ProtoMixin"], "base.ts");
    const mine = methodNode(["ProtoMixin", "mine"], "base.ts", 2);
    const step = methodNode(["ProtoMixin", "step"], "base.ts", 6);
    const a = classNode("A", ["A"], "a.ts");
    const aStep = methodNode(["A", "step"], "a.ts");
    const b = classNode("B", ["B"], "b.ts");
    const bStep = methodNode(["B", "step"], "b.ts");
    // SIN ninguna arista "extends" en todo el grafo — la única relación es "mixes-in".
    const graph = makeGraph(
      [base, mine, step, a, aStep, b, bStep],
      [
        edge(a.id, base.id, "mixes-in"),
        edge(b.id, base.id, "mixes-in"),
        ...containsAll(base.id, [mine.id, step.id]),
        ...containsAll(a.id, [aStep.id]),
        ...containsAll(b.id, [bStep.id]),
        edge(mine.id, step.id, "calls"),
      ],
    );
    const h = hypothesis.build(finding, graph, fakeCtx(repo))!;
    expect(h.state).toBe("ya-aplicado");
    expect(h.confidence).toBeNull();
    const ancestorCheck = h.checks.find((c) => c.label === "subtipos-comparten-un-ancestro-comun")!;
    expect(ancestorCheck.passed).toBe(true);
    expect(ancestorCheck.why).toContain("ProtoMixin");
    expect(ancestorCheck.why).toMatch(/mixes-in/);
    const skeletonCheck = h.checks.find((c) => c.label.includes("el-esqueleto-vive-en-el-ancestro"))!;
    expect(skeletonCheck.passed).toBe(true);
  });

  it("excluder R5 (caso testigo deal.rb:67, verificado a mano en RAICES.md): DOS ancestros comunes a la vez — uno genérico vía `extends` que NO declara el método, y un mixin vía `mixes-in` que SÍ lo declara — `pickDeclaringAncestor` elige el que declara, nunca el primero por orden alfabético", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 10, className: "A", normalized: SIM_A }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 10, className: "B", normalized: SIM_B }),
      ],
    });
    // "generic.ts#ApplicationRecordLike" ordena ANTES que "mixin.ts#ProtoMixin"
    // en orden lexicográfico — a propósito: si `pickDeclaringAncestor` no
    // existiera y el código volviera a "el primero por orden alfabético"
    // (el bug real de deal.rb: `ApplicationRecord` ganaba por venir primero,
    // nunca por declarar nada), este test lo atraparía.
    const generic = classNode("ApplicationRecordLike", ["ApplicationRecordLike"], "generic.ts");
    const mixinBase = classNode("ProtoMixin", ["ProtoMixin"], "mixin.ts");
    const mine = methodNode(["ProtoMixin", "mine"], "mixin.ts", 2);
    // OLA U: `step` es el GANCHO (redeclarado por A y B, invocado por `mine`)
    // — la forma COMPLETA que `ya-aplicado` exige desde esta ola. El sujeto
    // del test sigue siendo `pickDeclaringAncestor`.
    const step = methodNode(["ProtoMixin", "step"], "mixin.ts", 6);
    const a = classNode("A", ["A"], "a.ts");
    const aStep = methodNode(["A", "step"], "a.ts");
    const b = classNode("B", ["B"], "b.ts");
    const bStep = methodNode(["B", "step"], "b.ts");
    const graph = makeGraph(
      [generic, mixinBase, mine, step, a, aStep, b, bStep],
      [
        edge(a.id, generic.id, "extends"),
        edge(b.id, generic.id, "extends"),
        edge(a.id, mixinBase.id, "mixes-in"),
        edge(b.id, mixinBase.id, "mixes-in"),
        ...containsAll(mixinBase.id, [mine.id, step.id]),
        ...containsAll(a.id, [aStep.id]),
        ...containsAll(b.id, [bStep.id]),
        edge(mine.id, step.id, "calls"),
        // "ApplicationRecordLike" no declara ningún miembro — el ancla real del bug.
      ],
    );
    const h = hypothesis.build(finding, graph, fakeCtx(repo))!;
    expect(h.state).toBe("ya-aplicado"); // NO "parcial" — el bug real reportaba "parcial"/"alta" con "ApplicationRecord no declara nada".
    expect(h.confidence).toBeNull();
    const ancestorCheck = h.checks.find((c) => c.label === "subtipos-comparten-un-ancestro-comun")!;
    expect(ancestorCheck.why).toContain("ProtoMixin");
    expect(ancestorCheck.why).not.toContain("ApplicationRecordLike");
    const skeletonCheck = h.checks.find((c) => c.label.includes("el-esqueleto-vive-en-el-ancestro"))!;
    expect(skeletonCheck.passed).toBe(true);
    expect(skeletonCheck.why).toContain("ProtoMixin");
  });

  it("ancla parallel-hierarchies: el excluder es estructuralmente inaplicable (siempre ausente) — por construcción del detector, no hay ancestro común", () => {
    const finding = fakeFinding({
      kind: "parallel-hierarchies",
      detectorId: "parallel-hierarchies",
      locations: [loc("a.ts", 1, 30, "FamilyA"), loc("b.ts", 1, 30, "FamilyB")],
    });
    const familyA = classNode("FamilyA", ["FamilyA"], "a.ts", 1);
    const processA = methodNode(["FamilyA", "process"], "a.ts");
    const familyB = classNode("FamilyB", ["FamilyB"], "b.ts", 1);
    const processB = methodNode(["FamilyB", "process"], "b.ts");
    const graph = makeGraph([familyA, processA, familyB, processB], [...containsAll(familyA.id, [processA.id]), ...containsAll(familyB.id, [processB.id])]);
    const repo = fakeRepo({ graph });
    const h = hypothesis.build(finding, graph, fakeCtx(repo))!;
    expect(h).not.toBeNull();
    expect(h.state).toBe("ausente");
    const applied = h.checks.find((c) => c.role === "applied")!;
    expect(applied.why).toMatch(/parallel-hierarchies/);
  });

  it("ancla parallel-hierarchies sin grafo ⇒ required no cumplido (sin datos) ⇒ null", () => {
    const finding = fakeFinding({ kind: "parallel-hierarchies", detectorId: "parallel-hierarchies", locations: [loc("a.ts", 1, 30, "FamilyA"), loc("b.ts", 1, 30, "FamilyB")] });
    const repo = fakeRepo({ graph: null });
    expect(hypothesis.build(finding, null, fakeCtx(repo))).toBeNull();
  });

  it("lenguajes sin clases: className null ⇒ unitName sintético por archivo, sigue contando como unidad distinta", () => {
    const finding = fakeFinding({ locations: [loc("a.go", 1, 10), loc("b.go", 1, 10)] });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.go", startLine: 1, endLine: 10, functionName: "Mine", className: null, superclassName: null, normalized: SIM_A }),
        fakeClone({ file: "b.go", startLine: 1, endLine: 10, functionName: "Mine", className: null, superclassName: null, normalized: SIM_B }),
      ],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo))!;
    expect(h).not.toBeNull();
    expect(h.state).toBe("ausente");
  });

  it("costo: sin capacidad 'herencia' recomienda función de orden superior, no una jerarquía de clases", () => {
    const finding = fakeFinding({ locations: [loc("a.go", 1, 10), loc("b.go", 1, 10)] });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.go", startLine: 1, endLine: 10, functionName: "Mine", className: null, normalized: SIM_A }),
        fakeClone({ file: "b.go", startLine: 1, endLine: 10, functionName: "Mine", className: null, normalized: SIM_B }),
      ],
    });
    const h = hypothesis.build(finding, null, fakeCtx(repo, new Set<Capability>()))!;
    expect(h.cost).toMatch(/orden superior/);

    const hWithClasses = hypothesis.build(finding, null, fakeCtx(repo, new Set<Capability>(["herencia"])))!;
    expect(hWithClasses.cost).toMatch(/superclase/);
  });

  /* ── Anclas ESTRUCTURALES (large-class/refused-bequest) — Problema 2 del
   * registro de pendientes: familia de hermanos derivada de AST, MISMO
   * ARCHIVO, sin grafo (ctx.file vivo, repo.graph null — el escenario real
   * de producción para estas dos anclas). ── */

  const TS_TEMPLATE_COMPLETE = `
class Report {
  run(): string {
    return "header:" + this.body();
  }
  body(): string {
    return "base";
  }
}
class CsvReport extends Report {
  body(): string {
    return "csv";
  }
}
class JsonReport extends Report {
  body(): string {
    return "json";
  }
}
`;

  const TS_TEMPLATE_PARTIAL = `
class CsvReport2 extends Report2 {
  run(): string {
    return "csv:" + this.body();
  }
  body(): string {
    return "csv";
  }
}
class JsonReport2 extends Report2 {
  run(): string {
    return "json:" + this.body();
  }
  body(): string {
    return "json";
  }
}
class Report2 {}
`;

  const TS_TEMPLATE_ELUDIDO = `
class Report3 {
  run(): string {
    return "header:" + this.body();
  }
  body(): string {
    return "base";
  }
}
class CsvReport3 extends Report3 {
  run(): string {
    return "csv-especial";
  }
  body(): string {
    return "csv";
  }
}
class JsonReport3 extends Report3 {
  body(): string {
    return "json";
  }
}
`;

  const TS_NO_FAMILY = `
class Standalone {
  run(): string {
    return "solo";
  }
  helperOne(): void {}
  helperTwo(): void {}
}
`;

  it("ancla ESTRUCTURAL (large-class) sobre el ANCESTRO de una familia de 2 hermanos que YA comparten el esqueleto en la base ⇒ ya-aplicado, sin confianza — sin ninguna duplicación textual ni grafo", async () => {
    const { ctx, finding } = await structuralContextFor(TS_TEMPLATE_COMPLETE, "Report", "large-class");
    const h = hypothesis.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ya-aplicado");
    expect(h!.confidence).toBeNull();
  });

  it("ancla ESTRUCTURAL (refused-bequest) sobre UNA de las subclases de la MISMA familia: mismo resultado — el camino de entrada no depende de si el ancla cae en la base o en un hermano", async () => {
    const { ctx, finding } = await structuralContextFor(TS_TEMPLATE_COMPLETE, "CsvReport", "refused-bequest");
    const h = hypothesis.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ya-aplicado");
    expect(h!.confidence).toBeNull();
  });

  it("ancla ESTRUCTURAL: ancestro confirmado por AST, pero el esqueleto NO vive en la base (cada hermano repite `run`) ⇒ parcial, sigue compitiendo con confianza", async () => {
    const { ctx, finding } = await structuralContextFor(TS_TEMPLATE_PARTIAL, "CsvReport2", "large-class");
    const h = hypothesis.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("parcial");
    expect(h!.confidence).not.toBeNull();
  });

  it("ancla ESTRUCTURAL: esqueleto vive en la base, pero UN hermano lo REDECLARA con la misma firma ⇒ aplicado-eludido, sin confianza (fuga)", async () => {
    const { ctx, finding } = await structuralContextFor(TS_TEMPLATE_ELUDIDO, "Report3", "large-class");
    const h = hypothesis.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("aplicado-eludido");
    expect(h!.confidence).toBeNull();
  });

  it("ancla ESTRUCTURAL sin ninguna familia en el archivo (clase sin hermanos que compartan un ancestro EN ESTE ARCHIVO) ⇒ ni siquiera candidata (null)", async () => {
    const { ctx, finding } = await structuralContextFor(TS_NO_FAMILY, "Standalone", "large-class");
    expect(hypothesis.build(finding, null, ctx)).toBeNull();
  });

  /* ══════════════════════════════════════════════════════════════════════
   * OLA AI, FRENTE AI5b — EL ANCLA ES LA **RAÍZ** DE SU FAMILIA.
   *
   * La compuerta vieja (`if (!superclassName) return null;`) pedía que la
   * clase del ancla DECLARARA una superclase para siquiera diferir la
   * confirmación al grafo. Una RAÍZ no declara ninguna —ésa es la definición
   * de raíz—, así que ese `required` de entrada era INSATISFACIBLE para todo
   * el subconjunto "raíces de familia". Ver el docstring de
   * `buildFromGraphRootFamily`. Un test por INTENCIÓN.
   *
   * Las fixtures del bloque comparten `Standalone`/`TS_NO_FAMILY`: para este
   * camino lo único que el ÁRBOL tiene que decir es "esta clase existe y no
   * declara superclase, y no hay familia en este archivo" — todo lo demás lo
   * decide el GRAFO, que es el punto.
   *
   * OLA AM · FRENTE AM1 — POR QUÉ ESTE BLOQUE YA NO ANCLA EN `large-class`.
   * El ancla de estos tests pasó de `large-class` a `inheritance-family` y el
   * mecanismo bajo prueba NO cambió: `buildFromGraphRootFamily` se alcanza
   * igual desde las TRES anclas estructurales y las fixtures son las mismas
   * byte a byte. Lo que cambió es que `large-class` dejó de ser un portador
   * NEUTRO: desde esta ola lleva dos condiciones propias
   * (`la-unidad-del-ancla-es-una-de-las-copias` y
   * `grupo-sin-cuerpo-exige-tres-unidades`) y una RAÍZ es, por definición, el
   * ANCESTRO — así que sobre `large-class` este camino se calla A PROPÓSITO.
   * Esa decisión tiene tests propios en el bloque "OLA AM · FRENTE AM1", con
   * el número que la sostiene. Acá se sigue protegiendo el MECANISMO.
   * ══════════════════════════════════════════════════════════════════════ */

  /** El nodo `class-like` del ancla, en el mismo `file` que usa
   *  `structuralContextFor` — la terna que `classNodeByName` cruza. */
  function anchorClassNode(name: string): CodeGraphNode {
    return classNode(name, [name], "fixture.ts");
  }

  /** Una familia de raíz: `n` subtipos, cada uno en su propio archivo, todos
   *  con arista `extends` hacia el ancla; los `conEsqueleto` primeros
   *  declaran `run`, el resto declara un nombre propio distinto (para que
   *  `bestGroup` tenga un ganador con exactamente `conEsqueleto` unidades). */
  function familiaDeRaiz(anchor: CodeGraphNode, n: number, conEsqueleto: number): { nodes: CodeGraphNode[]; edges: CodeGraphEdge[] } {
    const nodes: CodeGraphNode[] = [];
    const edges: CodeGraphEdge[] = [];
    for (let i = 0; i < n; i++) {
      const sub = classNode(`Sub${i}`, [`Sub${i}`], `sub${i}.ts`);
      const nombre = i < conEsqueleto ? "run" : `propio${i}`;
      const m = methodNode([`Sub${i}`, nombre], `sub${i}.ts`);
      nodes.push(sub, m);
      edges.push(edge(sub.id, anchor.id, "extends"), ...containsAll(sub.id, [m.id]));
    }
    return { nodes, edges };
  }

  it("RAÍZ (Ola AI): la clase no declara superclase y sus DOS subtipos —en otros archivos— repiten un método que la raíz NO declara ⇒ ausente (antes: null por construcción)", async () => {
    const { ctx, finding } = await structuralContextFor(TS_NO_FAMILY, "Standalone", "inheritance-family");
    const anchor = anchorClassNode("Standalone");
    const propio = methodNode(["Standalone", "helperOne"], "fixture.ts");
    const fam = familiaDeRaiz(anchor, 2, 2);
    const graph = makeGraph([anchor, propio, ...fam.nodes], [...containsAll(anchor.id, [propio.id]), ...fam.edges]);

    const h = hypothesis.build(finding, graph, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    // Las ubicaciones son las de los SUBTIPOS resueltos por el grafo, no la
    // del ancla: la recomendación tiene evidencia real, no una promesa.
    expect(h!.places.map((p) => p.file).sort()).toEqual(["sub0.ts", "sub1.ts"]);
  });

  it("RAÍZ: EXACTAMENTE la misma entrada SIN grafo (pasada 1, `repo.graph === null`) sigue devolviendo null — el camino nuevo es inerte donde no hay grafo", async () => {
    const { ctx, finding } = await structuralContextFor(TS_NO_FAMILY, "Standalone", "inheritance-family");
    expect(hypothesis.build(finding, null, ctx)).toBeNull();
  });

  it("RAÍZ: con grafo pero SIN ninguna arista de familia hacia el ancla ⇒ null — no se inventa una familia donde el grafo no la confirma", async () => {
    const { ctx, finding } = await structuralContextFor(TS_NO_FAMILY, "Standalone", "inheritance-family");
    const anchor = anchorClassNode("Standalone");
    const suelta = classNode("Otra", ["Otra"], "otra.ts");
    expect(hypothesis.build(finding, makeGraph([anchor, suelta]), ctx)).toBeNull();
  });

  it("RAÍZ · ESCALA (>= MIN_DISTINCT_UNITS): UN solo subtipo no es una familia ⇒ null", async () => {
    const { ctx, finding } = await structuralContextFor(TS_NO_FAMILY, "Standalone", "inheritance-family");
    const anchor = anchorClassNode("Standalone");
    const propio = methodNode(["Standalone", "helperOne"], "fixture.ts");
    const fam = familiaDeRaiz(anchor, 1, 1);
    expect(hypothesis.build(finding, makeGraph([anchor, propio, ...fam.nodes], [...containsAll(anchor.id, [propio.id]), ...fam.edges]), ctx)).toBeNull();
  });

  it("RAÍZ · ESCALA (mayoría): el nombre ganador está en 2 de 5 subtipos ⇒ null — subir al ancestro un método que la MINORÍA comparte es incorrecto para los otros tres", async () => {
    const { ctx, finding } = await structuralContextFor(TS_NO_FAMILY, "Standalone", "inheritance-family");
    const anchor = anchorClassNode("Standalone");
    const propio = methodNode(["Standalone", "helperOne"], "fixture.ts");
    const fam = familiaDeRaiz(anchor, 5, 2);
    expect(hypothesis.build(finding, makeGraph([anchor, propio, ...fam.nodes], [...containsAll(anchor.id, [propio.id]), ...fam.edges]), ctx)).toBeNull();
  });

  it("RAÍZ · ESCALA (mayoría): el MISMO nombre en 3 de 5 subtipos SÍ pasa — el umbral es una mayoría, no una unanimidad", async () => {
    const { ctx, finding } = await structuralContextFor(TS_NO_FAMILY, "Standalone", "inheritance-family");
    const anchor = anchorClassNode("Standalone");
    const propio = methodNode(["Standalone", "helperOne"], "fixture.ts");
    const fam = familiaDeRaiz(anchor, 5, 3);
    const h = hypothesis.build(finding, makeGraph([anchor, propio, ...fam.nodes], [...containsAll(anchor.id, [propio.id]), ...fam.edges]), ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
  });

  it("RAÍZ · RESOLUCIÓN VERIFICADA: si la raíz YA declara el esqueleto y lo invoca, y ningún subtipo lo redeclara ⇒ el camino nuevo SE CALLA (null), nunca inventa un `ausente` donde el patrón ya está — y así no puede desplazar la oportunidad de ningún patrón rival vía `arbitrateRivalHypotheses`", async () => {
    const { ctx, finding } = await structuralContextFor(TS_NO_FAMILY, "Standalone", "inheritance-family");
    const anchor = anchorClassNode("Standalone");
    const esqueleto = methodNode(["Standalone", "run"], "fixture.ts");
    const gancho = methodNode(["Standalone", "body"], "fixture.ts", 6);
    const nodes: CodeGraphNode[] = [anchor, esqueleto, gancho];
    const edges: CodeGraphEdge[] = [...containsAll(anchor.id, [esqueleto.id, gancho.id])];
    for (let i = 0; i < 2; i++) {
      const sub = classNode(`Sub${i}`, [`Sub${i}`], `sub${i}.ts`);
      const suBody = methodNode([`Sub${i}`, "body"], `sub${i}.ts`);
      nodes.push(sub, suBody);
      edges.push(edge(sub.id, anchor.id, "extends"), ...containsAll(sub.id, [suBody.id]));
    }
    edges.push(edge(esqueleto.id, gancho.id, "calls"));

    expect(hypothesis.build(finding, makeGraph(nodes, edges), ctx)).toBeNull();
  });

  /* LA CONDICIÓN QUE MEDÍ, CONSTRUÍ Y RETIRÉ — ver el comentario largo en
   * `buildFromGraphRootFamily`. Silenciaba las recomendaciones cuyo nombre
   * ganador declara un ANCESTRO del ancla (no el inmediato). Medida sobre
   * `guava`: de 7 recomendaciones nuevas dejaba 3, y de las 4 que silenciaba
   * DOS eran las únicas juzgadas verdaderas. Subía la precisión y bajaba el
   * numerador: exactamente el intercambio que la regla 2 de la Ola AI prohíbe.
   * Se retiró; el número quedó publicado en el informe AI5b §5.4b. */

  it("RAÍZ · MONOTONÍA: el camino nuevo NUNCA publica un estado CONFIRMADO — es lo que garantiza que no pueda hacer desaparecer la oportunidad de ningún otro patrón", async () => {
    const { ctx, finding } = await structuralContextFor(TS_NO_FAMILY, "Standalone", "inheritance-family");
    const anchor = anchorClassNode("Standalone");
    const propio = methodNode(["Standalone", "helperOne"], "fixture.ts");
    for (const n of [2, 3, 5]) {
      const fam = familiaDeRaiz(anchor, n, n);
      const h = hypothesis.build(finding, makeGraph([anchor, propio, ...fam.nodes], [...containsAll(anchor.id, [propio.id]), ...fam.edges]), ctx);
      if (h) expect(["ausente", "parcial"]).toContain(h.state);
    }
  });

  /* ──────────────────────────────────────────────────────────────────────
   * OLA AK, FRENTE AK6 — **UNA PROMESA NO ES UNA PROPUESTA.**
   *
   * `deferredStructuralHypothesis` publica `parcial` + `confidence: null` +
   * UN check con `passed: false`: bypasea el motor a propósito, así que no
   * confirmó ninguno de los dos `required` del patrón. Es una PROMESA de ir a
   * buscar la familia en el grafo. Cuando el grafo la CUMPLE, no cambia nada;
   * cuando el grafo la DESMIENTE, hasta esta ola se publicaba igual.
   *
   * El cambio alcanza SÓLO al ancla `large-class` — la única de las tres
   * estructurales cuyo hecho de entrada ("la clase tiene muchos miembros") no
   * dice nada sobre familias; en `inheritance-family`/`refused-bequest` el
   * ancla misma ya confirmó la familia, y las dos tienen propuestas juzgadas
   * VERDADERAS que esta ola no puede perder.
   * ────────────────────────────────────────────────────────────────────── */

  const TS_HIJO_DE_OTRO_ARCHIVO = "class Hijo extends DeOtroArchivo {\n  run(): void {}\n}\n";

  /** Familia en la dirección SUBTIPO (la que `resolveDeferredViaGraph` recorre):
   *  una base en OTRO archivo, el ancla colgando de ella y `n-1` hermanos más;
   *  `conEsqueleto` de los `n` declaran el MISMO nombre `run`. */
  function familiaDeSubtipo(anchor: CodeGraphNode, n: number, conEsqueleto: number): { nodes: CodeGraphNode[]; edges: CodeGraphEdge[] } {
    const base = classNode("DeOtroArchivo", ["DeOtroArchivo"], "base.ts");
    const anchorRun = methodNode(["Hijo", "run"], "fixture.ts");
    const nodes: CodeGraphNode[] = [base, anchorRun];
    const edges: CodeGraphEdge[] = [edge(anchor.id, base.id, "extends"), ...containsAll(anchor.id, [anchorRun.id])];
    for (let i = 1; i < n; i++) {
      const herm = classNode(`Herm${i}`, [`Herm${i}`], `herm${i}.ts`);
      const nombre = i < conEsqueleto ? "run" : `propio${i}`;
      const m = methodNode([`Herm${i}`, nombre], `herm${i}.ts`);
      nodes.push(herm, m);
      edges.push(edge(herm.id, base.id, "extends"), ...containsAll(herm.id, [m.id]));
    }
    return { nodes, edges };
  }

  it("PROMESA · SIN GRAFO (pasada 1, `analyzeFile`): el placeholder DIFERIDO se emite EXACTAMENTE como antes — el cambio es inerte donde no hay grafo con qué cumplirla", async () => {
    const { ctx, finding } = await structuralContextFor(TS_HIJO_DE_OTRO_ARCHIVO, "Hijo", "large-class");
    const h = hypothesis.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("parcial");
    expect(h!.provisional).toBe(true);
    expect(h!.checks.map((c) => c.label)).toEqual(["familia-declarada-fuera-de-este-archivo-pendiente-de-grafo"]);
  });

  it("PROMESA DESMENTIDA · `large-class` con grafo y SIN familia ⇒ null — ESTE TEST AFIRMA HOY LO CONTRARIO DE LO QUE AFIRMABA (Ola AK, AK6): antes se publicaba la promesa vacía como recomendación `parcial`", async () => {
    const { ctx, finding } = await structuralContextFor(TS_HIJO_DE_OTRO_ARCHIVO, "Hijo", "large-class");
    const anchor = anchorClassNode("Hijo");
    expect(hypothesis.build(finding, makeGraph([anchor]), ctx)).toBeNull();
  });

  it("NO TOCA LAS OTRAS DOS ANCLAS ESTRUCTURALES — `inheritance-family` con el MISMO grafo sin familia sigue publicando el placeholder diferido, byte a byte", async () => {
    const { ctx, finding } = await structuralContextFor(TS_HIJO_DE_OTRO_ARCHIVO, "Hijo", "inheritance-family");
    const anchor = anchorClassNode("Hijo");
    const h = hypothesis.build(finding, makeGraph([anchor]), ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("parcial");
    expect(h!.checks.map((c) => c.label)).toEqual(["familia-declarada-fuera-de-este-archivo-pendiente-de-grafo"]);
  });

  it("PROMESA CUMPLIDA: con una familia real en el grafo, la hipótesis sale con checks REALES — es la MISMA que `refresh()` producía, un momento antes", async () => {
    const { ctx, finding } = await structuralContextFor(TS_HIJO_DE_OTRO_ARCHIVO, "Hijo", "large-class");
    const anchor = anchorClassNode("Hijo");
    const fam = familiaDeSubtipo(anchor, 3, 3);
    const h = hypothesis.build(finding, makeGraph([anchor, ...fam.nodes], fam.edges), ctx);
    expect(h).not.toBeNull();
    // `parcial`, no `ausente`: lo decide `appliedState`/`stateFromFacts` sobre
    // los MISMOS `structuralFacts` de siempre — este camino no toca la escalera
    // de estado, sólo deja de publicar la promesa cuando el grafo la desmiente.
    expect(h!.state).toBe("parcial");
    expect(h!.checks.some((c) => c.passed)).toBe(true);
    expect(h!.checks.length).toBeGreaterThan(1);
    expect(h!.checks.map((c) => c.label)).not.toContain("familia-declarada-fuera-de-este-archivo-pendiente-de-grafo");
  });

  it("SUBTIPO · ESCALA (mayoría): el nombre ganador en 2 de 5 hermanos ⇒ null — la MISMA condición, con el MISMO número, que `buildFromGraphRootFamily` ya aplicaba en la dirección RAÍZ desde la Ola AI", async () => {
    const { ctx, finding } = await structuralContextFor(TS_HIJO_DE_OTRO_ARCHIVO, "Hijo", "large-class");
    const anchor = anchorClassNode("Hijo");
    const fam = familiaDeSubtipo(anchor, 5, 2);
    expect(hypothesis.build(finding, makeGraph([anchor, ...fam.nodes], fam.edges), ctx)).toBeNull();
  });

  /* ── OLA AI, FRENTE AI5b — LA SEGUNDA MITAD DEL MISMO DEFECTO: la familia
   * existe en el archivo pero está RECORTADA por él. `findAstFamily` sólo ve
   * los hermanos de ESTE archivo (su docstring lo declara), así que cuando esa
   * familia recortada no alcanza para pasar los dos `required`, el resultado
   * era `null` — aunque el grafo conociera el resto de la familia. ── */

  /** Familia REAL en el archivo (base + 2 subtipos) cuyos hermanos NO comparten
   *  ningún nombre de método: `bestGroup` no encuentra grupo, el `required`
   *  `same-name-distinct-units-similar-sequence` falla y el motor devuelve
   *  `null`. Es el punto exacto donde hasta hoy se perdía la pregunta. */
  const TS_FAMILIA_RECORTADA = `
class BaseRecortada {
  comun(): void {}
}
class SoloAlfa extends BaseRecortada {
  alfa(): void {}
}
class SoloBeta extends BaseRecortada {
  beta(): void {}
}
`;

  it("FAMILIA RECORTADA POR EL ARCHIVO (Ola AI): los hermanos del archivo no comparten ningún método ⇒ el motor devuelve null; el grafo, que ve DOS subtipos más que sí comparten uno, la rescata ⇒ ausente", async () => {
    const { ctx, finding } = await structuralContextFor(TS_FAMILIA_RECORTADA, "BaseRecortada", "inheritance-family");
    const anchor = anchorClassNode("BaseRecortada");
    const propio = methodNode(["BaseRecortada", "comun"], "fixture.ts");
    const fam = familiaDeRaiz(anchor, 2, 2);
    const h = hypothesis.build(finding, makeGraph([anchor, propio, ...fam.nodes], [...containsAll(anchor.id, [propio.id]), ...fam.edges]), ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    expect(h!.places.map((p) => p.file).sort()).toEqual(["sub0.ts", "sub1.ts"]);
  });

  it("FAMILIA RECORTADA: la MISMA entrada sin grafo sigue devolviendo null — el rescate es inerte en la pasada 1", async () => {
    const { ctx, finding } = await structuralContextFor(TS_FAMILIA_RECORTADA, "BaseRecortada", "inheritance-family");
    expect(hypothesis.build(finding, null, ctx)).toBeNull();
  });

  it("FAMILIA RECORTADA: con grafo pero sin subtipos que compartan nada ⇒ sigue null — el rescate no inventa una familia", async () => {
    const { ctx, finding } = await structuralContextFor(TS_FAMILIA_RECORTADA, "BaseRecortada", "inheritance-family");
    const anchor = anchorClassNode("BaseRecortada");
    const propio = methodNode(["BaseRecortada", "comun"], "fixture.ts");
    const fam = familiaDeRaiz(anchor, 2, 0); // dos subtipos, cada uno con un nombre propio distinto
    expect(hypothesis.build(finding, makeGraph([anchor, propio, ...fam.nodes], [...containsAll(anchor.id, [propio.id]), ...fam.edges]), ctx)).toBeNull();
  });

  it("FAMILIA RECORTADA: cuando el camino AST SÍ emite, el grafo NO se consulta — la respuesta y sus ubicaciones siguen siendo las del archivo", async () => {
    const { ctx, finding } = await structuralContextFor(TS_TEMPLATE_PARTIAL, "CsvReport2", "large-class");
    const anchor = anchorClassNode("CsvReport2");
    const fam = familiaDeRaiz(anchor, 4, 4); // un grafo que, si se consultara, daría otra respuesta y otros archivos
    const h = hypothesis.build(finding, makeGraph([anchor, ...fam.nodes], fam.edges), ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("parcial");
    expect([...new Set(h!.places.map((p) => p.file))]).toEqual(["fixture.ts"]);
  });

  /* ══════════════════════════════════════════════════════════════════════
   * OLA AM · FRENTE AM1 — LAS DOS CONDICIONES DEL ANCLA `large-class`.
   *
   * EL NÚMERO QUE LAS SOSTIENE (volcado propio de los 21 repos, 25-08-2026):
   * `Template Method · large-class` medía **0/27 en bibliotecas** contra un
   * techo de nivel 1 de **24/24 = 100 %** — el ancla acierta siempre y la
   * celda nunca. Las 28 recomendaciones de biblioteca y las 11 de aplicación
   * salían TODAS del camino de GRAFO, donde el grupo se arma con
   * `memberSignatures` (nombre + aridad, `calledNamesSequence: []`), así que
   * `highAverageSimilarity` contestaba "Sin datos de secuencia de llamadas"
   * en 39 de 39.
   *
   * Un test por INTENCIÓN, y los dos últimos son los que prueban que las
   * condiciones NO se derraman: fuera de `large-class`, y fuera de la rama de
   * mitigación (`ya-aplicado`), se declaran cumplidas y no restringen nada.
   * ══════════════════════════════════════════════════════════════════════ */

  it("AM1 · `large-class` sobre la RAÍZ de una familia de 3 subtipos que repiten `run` ⇒ null — la unidad señalada es el ANCESTRO, y subirle el esqueleto le AGREGA un miembro a la clase que el ancla llama grande", async () => {
    const { ctx, finding } = await structuralContextFor(TS_NO_FAMILY, "Standalone", "large-class");
    const anchor = anchorClassNode("Standalone");
    const propio = methodNode(["Standalone", "helperOne"], "fixture.ts");
    const fam = familiaDeRaiz(anchor, 3, 3);
    expect(hypothesis.build(finding, makeGraph([anchor, propio, ...fam.nodes], [...containsAll(anchor.id, [propio.id]), ...fam.edges]), ctx)).toBeNull();
  });

  it("AM1 · LA MISMA ENTRADA con ancla `inheritance-family` SÍ emite — la condición está acotada a `large-class`, que es la única que habla del TAMAÑO de una unidad", async () => {
    const { ctx, finding } = await structuralContextFor(TS_NO_FAMILY, "Standalone", "inheritance-family");
    const anchor = anchorClassNode("Standalone");
    const propio = methodNode(["Standalone", "helperOne"], "fixture.ts");
    const fam = familiaDeRaiz(anchor, 3, 3);
    const h = hypothesis.build(finding, makeGraph([anchor, propio, ...fam.nodes], [...containsAll(anchor.id, [propio.id]), ...fam.edges]), ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
  });

  it("AM1 · `large-class` sobre un SUBTIPO que ES una de las tres copias ⇒ sigue emitiendo — la mitigación le quita un miembro justamente a la unidad señalada", async () => {
    const { ctx, finding } = await structuralContextFor(TS_HIJO_DE_OTRO_ARCHIVO, "Hijo", "large-class");
    const anchor = anchorClassNode("Hijo");
    const fam = familiaDeSubtipo(anchor, 3, 3);
    const h = hypothesis.build(finding, makeGraph([anchor, ...fam.nodes], fam.edges), ctx);
    expect(h).not.toBeNull();
    expect(h!.checks.find((c) => c.label.includes("una de las copias de las que el esqueleto se retira"))?.passed).toBe(true);
  });

  it("AM1 · ESCALA: `large-class` sobre un SUBTIPO que ES una copia, pero el grupo tiene sólo DOS unidades y NINGUNA trae cuerpo ⇒ null — dos declaraciones homónimas sin una sola llamada describen igual de bien una coincidencia de nombre", async () => {
    const { ctx, finding } = await structuralContextFor(TS_HIJO_DE_OTRO_ARCHIVO, "Hijo", "large-class");
    const anchor = anchorClassNode("Hijo");
    const fam = familiaDeSubtipo(anchor, 2, 2);
    expect(hypothesis.build(finding, makeGraph([anchor, ...fam.nodes], fam.edges), ctx)).toBeNull();
  });

  it("AM1 · ESCALA: la MISMA entrada de dos unidades sin cuerpo con ancla `inheritance-family` SÍ emite — el umbral de tres es de `large-class`, y `MIN_DISTINCT_UNITS` no se movió", async () => {
    const { ctx, finding } = await structuralContextFor(TS_HIJO_DE_OTRO_ARCHIVO, "Hijo", "inheritance-family");
    const anchor = anchorClassNode("Hijo");
    const fam = familiaDeSubtipo(anchor, 2, 2);
    // `inheritance-family` con superclase declarada sale por el placeholder
    // DIFERIDO de AK6 (que bypasea el motor); lo que este test afirma es que
    // NO se calla, a diferencia del `large-class` de dos líneas más arriba.
    const h = hypothesis.build(finding, makeGraph([anchor, ...fam.nodes], fam.edges), ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("parcial");
    // Y el `refresh()` que resuelve la promesa con el MISMO grafo tampoco la
    // corta: ahí sí corren los `required`, y los dos nuevos se cumplen.
    const resuelta = hypothesis.refresh!(h!, finding, makeGraph([anchor, ...fam.nodes], fam.edges), ctx);
    expect(resuelta).not.toBeNull();
    expect(resuelta!.checks.find((c) => c.label.includes("NINGUNA copia del grupo ganador trae la secuencia"))?.passed).toBe(true);
  });

  it("AM1 · NO SE DERRAMA AL CAMINO AST: `large-class` sobre el ANCESTRO de una familia same-file cuyos hermanos repiten `run` (con cuerpos) ⇒ sigue emitiendo `parcial` — hay datos de cuerpo, así que la condición de escala no aplica; la de identidad la corta sólo si el ancla no es una copia", async () => {
    const { ctx, finding } = await structuralContextFor(TS_TEMPLATE_PARTIAL, "CsvReport2", "large-class");
    const h = hypothesis.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("parcial");
    expect(h!.checks.find((c) => c.label.includes("NINGUNA copia del grupo ganador trae la secuencia"))?.passed).toBe(true);
  });

  it("AM1 · NO TOCA `ya-aplicado`: con el esqueleto YA en el ancestro, las dos condiciones se declaran cumplidas — no hay nada que subir, así que ninguna unidad gana ni pierde miembros", async () => {
    const { ctx, finding } = await structuralContextFor(TS_TEMPLATE_COMPLETE, "Report", "large-class");
    const h = hypothesis.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ya-aplicado");
    expect(h!.checks.find((c) => c.label.includes("una de las copias de las que el esqueleto se retira"))?.passed).toBe(true);
    expect(h!.checks.find((c) => c.label.includes("NINGUNA copia del grupo ganador trae la secuencia"))?.passed).toBe(true);
  });

  /* ══════════════════════════════════════════════════════════════════════
   * OLA U — LAS TRES INTENCIONES. Los dos primeros bloques son los dos bugs
   * que PLAN-INTENCIONES.md §2 declara "verificados vivos", re-verificados en
   * disco esta ola sobre `corpus/newtonsoft-json`.
   * ══════════════════════════════════════════════════════════════════════ */

  /* INTENCIÓN 1 — un constructor no es un esqueleto. Réplica del caso del
   * plan (bug 1): dos clases SIN relación entre sí cuyos CONSTRUCTORES —
   * `XObjectWrapper(XObject? xmlObject) { _xmlObject = xmlObject; }`
   * (`Converters/XmlNodeConverter.cs:767`) y
   * `JsonSerializerInternalBase(JsonSerializer serializer)`
   * (`Serialization/JsonSerializerInternalBase.cs:57`) — quedan agrupados por
   * `distributed-duplication` porque sus CUERPOS son textualmente parecidos
   * (`_campo = parámetro;`). En C#/Java el constructor se llama como su clase,
   * así que el matching por nombre los tomaba por "el mismo método". */
  it("OLA U INTENCIÓN 1 (PLAN §2 bug 1): las copias agrupadas son CONSTRUCTORES (nombre == nombre de su clase) ⇒ ni siquiera candidata (null)", () => {
    const finding = fakeFinding({ locations: [loc("x.cs", 1, 10), loc("y.cs", 1, 10)] });
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "x.cs", startLine: 1, endLine: 10, functionName: "XObjectWrapper", className: "XObjectWrapper", normalized: SIM_A }),
        fakeClone({ file: "y.cs", startLine: 1, endLine: 10, functionName: "JsonSerializerInternalBase", className: "JsonSerializerInternalBase", normalized: SIM_B }),
      ],
    });
    expect(hypothesis.build(finding, null, fakeCtx(repo, new Set<Capability>(["herencia"])))).toBeNull();
  });

  it("OLA U INTENCIÓN 1: el ÚNICO miembro del ancestro que nadie redeclara es su constructor (nombre == nombre de la clase) ⇒ no es un esqueleto, no hay ya-aplicado", () => {
    const finding = fakeFinding();
    const repo = fakeRepo({
      clones: [
        fakeClone({ file: "a.ts", startLine: 1, endLine: 10, className: "A", normalized: SIM_A }),
        fakeClone({ file: "b.ts", startLine: 1, endLine: 10, className: "B", normalized: SIM_B }),
      ],
    });
    const base = classNode("DataMiner", ["DataMiner"], "base.ts");
    const ctor = methodNode(["DataMiner", "DataMiner"], "base.ts", 2, 1); // el constructor de C#/Java
    const a = classNode("A", ["A"], "a.ts");
    const b = classNode("B", ["B"], "b.ts");
    const graph = makeGraph([base, ctor, a, b], [edge(a.id, base.id, "extends"), edge(b.id, base.id, "extends"), ...containsAll(base.id, [ctor.id])]);
    const h = hypothesis.build(finding, graph, fakeCtx(repo))!;
    expect(h.state).not.toBe("ya-aplicado");
    const skeletonCheck = h.checks.find((c) => c.label === "el-esqueleto-vive-en-el-ancestro")!;
    expect(skeletonCheck.passed).toBe(false); // "mine" (del clon) no vive en el ancestro; el constructor no cuenta
  });

  /* INTENCIÓN 2 — dos firmas con tipo de retorno ESCRITO distinto no son el
   * mismo paso. Réplica exacta del caso del plan (bug 2), verificado en disco:
   * `corpus/newtonsoft-json/Src/Newtonsoft.Json/Bson/BsonToken.cs`,
   * `BsonObject.GetEnumerator(): IEnumerator<BsonProperty>` (:52-54) y
   * `BsonArray.GetEnumerator(): IEnumerator<BsonToken>` (:75-77) — misma
   * aridad (0), cuerpos idénticos (`return _children.GetEnumerator();`,
   * Jaccard 1.0) y el reporte proponía subir `GetEnumerator` a `BsonToken`:
   * un cambio que no compila. */
  const TS_RETURN_TYPE_CONFLICT = `
class BsonToken6 {
}
class BsonObject6 extends BsonToken6 {
  getEnumerator(): Iterator<BsonProperty6> {
    return this.children.getEnumerator();
  }
}
class BsonArray6 extends BsonToken6 {
  getEnumerator(): Iterator<BsonToken6> {
    return this.children.getEnumerator();
  }
}
`;

  it("OLA U INTENCIÓN 2 (PLAN §2 bug 2): mismo nombre y misma aridad pero tipos de retorno ESCRITOS incompatibles ⇒ ni siquiera candidata (null) — subirlo al ancestro rompería el contrato de tipos", async () => {
    const { ctx, finding } = await structuralContextFor(TS_RETURN_TYPE_CONFLICT, "BsonToken6", "inheritance-family");
    expect(hypothesis.build(finding, null, ctx)).toBeNull();
  });

  /* Control negativo de la INTENCIÓN 2: MISMA forma, mismo tipo de retorno en
   * las dos ⇒ SIGUE agrupando. La señal es "desacuerdo ESCRITO", nunca
   * "aridad + nombre no alcanzan". */
  const TS_RETURN_TYPE_AGREE = `
class BsonToken7 {
}
class BsonObject7 extends BsonToken7 {
  getEnumerator(): Iterator<BsonToken7> {
    return this.children.getEnumerator();
  }
}
class BsonArray7 extends BsonToken7 {
  getEnumerator(): Iterator<BsonToken7> {
    return this.children.getEnumerator();
  }
}
`;

  it("OLA U INTENCIÓN 2, control negativo: mismo nombre, misma aridad y MISMO tipo de retorno ⇒ sigue agrupando (parcial)", async () => {
    const { ctx, finding } = await structuralContextFor(TS_RETURN_TYPE_AGREE, "BsonToken7", "inheritance-family");
    const h = hypothesis.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("parcial");
  });

  /* INTENCIÓN 3 — el gancho confirmado POR AST. Antes de esta ola el camino
   * AST devolvía `hooks: []`/`skeletonCallsHook: false` SIEMPRE, así que la
   * terna del patrón era inconfirmable por ese camino (el 96 % del volumen
   * medido). `TS_TEMPLATE_COMPLETE` la tiene entera: `Report.run()` invoca a
   * `this.body()`, y `body()` está redeclarado por los DOS hermanos. */
  it("OLA U INTENCIÓN 3: el gancho se confirma por AST (llamada `this.body()` desde el esqueleto, `body` redeclarado por todos) ⇒ ya-aplicado CON el check de gancho en true", async () => {
    const { ctx, finding } = await structuralContextFor(TS_TEMPLATE_COMPLETE, "Report", "inheritance-family");
    const h = hypothesis.build(finding, null, ctx)!;
    expect(h.state).toBe("ya-aplicado");
    const hookCheck = h.checks.find((c) => c.label.includes("gancho"))!;
    expect(hookCheck.passed).toBe(true);
    expect(hookCheck.why).toContain("body");
  });

  /* INTENCIÓN 3, el caso que producía las 155: una familia real donde la base
   * declara un método que nadie redeclara, pero NO hay ningún paso variable
   * que ese método delegue. Antes: `ya-aplicado` ("el patrón ya está"). Ahora:
   * ninguna hipótesis — ni plantilla ni algoritmo duplicado que recomendar. */
  const TS_HERENCIA_SIN_PLANTILLA = `
class Base8 {
  describe(): string {
    return label(this);
  }
}
class UnitA8 extends Base8 {
  onlyMine(): void { emitA(); }
}
class UnitB8 extends Base8 {
  onlyOther(): void { emitB(); }
}
`;

  it("OLA U INTENCIÓN 3: la base declara un método heredado por todos pero SIN ningún paso variable delegado ⇒ no es una plantilla y no hay algoritmo duplicado ⇒ silencio (null), nunca ya-aplicado", async () => {
    const { ctx, finding } = await structuralContextFor(TS_HERENCIA_SIN_PLANTILLA, "Base8", "inheritance-family");
    expect(hypothesis.build(finding, null, ctx)).toBeNull();
  });

  it("ancla ESTRUCTURAL con ctx.file null (límite documentado) ⇒ build devuelve null", async () => {
    const { ctx, finding } = await structuralContextFor(TS_TEMPLATE_COMPLETE, "Report", "large-class");
    const ctxSinArbol: HypothesisContext = { ...ctx, file: null };
    expect(hypothesis.build(finding, null, ctxSinArbol)).toBeNull();
  });

  /**
   * Ola 11a (P2) — ancla `inheritance-family` (`detect/intra-file/
   * inheritance-family.ts`): cierra el hueco declarado en el docstring del
   * módulo ("una clase LIMPIA con ≥2 hermanas que ya comparten el esqueleto
   * en la base... nunca llegaba a ningún estado — 0 hipótesis, igual que
   * Decorator sobre ColorDecorator") para el caso donde NI `large-class` NI
   * `refused-bequest` disparan (la familia es chica, como `DataMiner`/
   * `CsvDataMiner`/`LogDataMiner` sobre la fixture canónica). Va por la
   * MISMA vía (`buildFromStructuralAnchor`) que las otras dos anclas
   * estructurales — mismo resultado esperado sobre la MISMA fixture.
   */
  it("ancla `inheritance-family` sobre el ANCESTRO de una familia de 2 hermanos que YA comparten el esqueleto en la base ⇒ ya-aplicado, sin confianza — mismo resultado que large-class/refused-bequest sobre la misma familia", async () => {
    const { ctx, finding } = await structuralContextFor(TS_TEMPLATE_COMPLETE, "Report", "inheritance-family");
    const h = hypothesis.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ya-aplicado");
    expect(h!.confidence).toBeNull();
  });

  it("ancla `inheritance-family` sin ninguna familia en el archivo ⇒ ni siquiera candidata (null)", async () => {
    const { ctx, finding } = await structuralContextFor(TS_NO_FAMILY, "Standalone", "inheritance-family");
    expect(hypothesis.build(finding, null, ctx)).toBeNull();
  });

  /* ── ARIDAD COMPATIBLE, camino AST same-file (registro de pendientes,
   * "Template Method empareja por nombre y no mira la aridad") — réplica
   * DIRECTA del caso testigo verificado a mano:
   * `corpus/newtonsoft-json/.../Bson/BsonToken.cs`. La base (`BsonToken2`)
   * no declara NINGÚN método — igual que `BsonToken` real, cuyos únicos
   * miembros son propiedades, no métodos — así que el candidato SÓLO puede
   * salir de `entriesFromAstFamily`/`bestGroup` (el camino que tenía el
   * bug). Los dos hermanos declaran "add" con aridad DISTINTA e
   * INCOMPATIBLE (2 vs 1, sin ningún parámetro opcional que explique la
   * diferencia) — exactamente `Add(string, BsonToken)` vs `Add(BsonToken)`. ── */
  const TS_BSONTOKEN_REPLICA = `
class BsonToken2 {
}
class BsonObject2 extends BsonToken2 {
  add(name: string, token: BsonToken2): void {}
}
class BsonArray2 extends BsonToken2 {
  add(token: BsonToken2): void {}
}
`;

  it("caso testigo BsonToken.cs (camino AST same-file): aridad incompatible en 'add' (2 vs 1) ⇒ ni siquiera candidata (null) — antes del arreglo, recomendaba subir 'add' al ancestro", async () => {
    const { ctx, finding } = await structuralContextFor(TS_BSONTOKEN_REPLICA, "BsonToken2", "inheritance-family");
    expect(hypothesis.build(finding, null, ctx)).toBeNull();
  });

  /* Regresión: la MISMA forma (base sin métodos, 2 hermanos con un método de
   * igual nombre) pero con una diferencia de aridad que SÍ es legítima —
   * explicada por un parámetro con valor por defecto en una de las dos
   * declaraciones (`ctx: string | null = null`) — tiene que SEGUIR
   * agrupando: la señal estructural no es "aridad exacta siempre", es
   * "rango de aridad compatible". */
  /* Ola U: los dos cuerpos INVOCAN algo (`normalize`/`decorate`). Antes daba
   * igual porque el camino AST no leía llamadas; desde la Ola U un miembro
   * que no invoca a nadie no orquesta nada y no compite como esqueleto
   * (`entriesFromAstFamily`). El sujeto del test —el rango de aridad— no
   * cambia: sigue siendo `[1,1]` contra `[1,2]`. */
  const TS_OPTIONAL_PARAM_VARIANT = `
class Base4 {
}
class UnitA4 extends Base4 {
  process(item: string): string {
    return normalize(item);
  }
}
class UnitB4 extends Base4 {
  process(item: string, ctx: string | null = null): string {
    return normalize(item + ctx);
  }
}
`;

  it("aridad COMPATIBLE por parámetro opcional (rango [1,1] vs [1,2], se solapan en 1) ⇒ SIGUE agrupando — parcial, con las 2 unidades", async () => {
    const { ctx, finding } = await structuralContextFor(TS_OPTIONAL_PARAM_VARIANT, "Base4", "inheritance-family");
    const h = hypothesis.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("parcial");
    expect(h!.places).toHaveLength(2);
  });

  /* Regresión, parámetro REST/variádico: `[1,1]` vs `[1, Infinity]` — el
   * hermano con `...rest` acepta CUALQUIER cantidad >= 1, así que sigue
   * siendo compatible con el que sólo declara el parámetro obligatorio. */
  const TS_REST_PARAM_VARIANT = `
class Base5 {
}
class UnitA5 extends Base5 {
  handle(item: string): void { emit(item); }
}
class UnitB5 extends Base5 {
  handle(item: string, ...rest: string[]): void { emit(item); }
}
`;

  it("aridad COMPATIBLE por parámetro rest/variádico (rango [1,1] vs [1,Infinity]) ⇒ SIGUE agrupando", async () => {
    const { ctx, finding } = await structuralContextFor(TS_REST_PARAM_VARIANT, "Base5", "inheritance-family");
    const h = hypothesis.build(finding, null, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe("parcial");
    expect(h!.places).toHaveLength(2);
  });

  /* ──────────────────────────────────────────────────────────────────
   * Ola 11a (P2) — CONSUMO real de `ctx.neighborhood`: 0 de 17 hipótesis
   * lo leían antes de esta ola salvo `strategy.ts` (1/17) —
   * `template-method.ts` es uno de los 16 restantes que esta tarea
   * conecta. `refresh()` (llamado por `hypotheses/run.ts#refreshHypotheses`
   * desde `crossAnalyze`) recalcula `familia-similar-en-otro-archivo`
   * para las 3 anclas ESTRUCTURALES — nunca `state`. Mismo espíritu que
   * `strategy.test.ts`/`decorator.test.ts`.
   * ────────────────────────────────────────────────────────────────── */
  describe("Ola 11a: refresh() consume ctx.neighborhood real", () => {
  it("refresh() con EMPTY_NEIGHBORHOOD (nada que ver): el discriminador 'familia-similar-en-otro-archivo' no confirma", async () => {
    const { ctx, finding } = await structuralContextFor(TS_TEMPLATE_PARTIAL, "CsvReport2", "large-class");
    const built = hypothesis.build(finding, null, ctx)!;
    expect(built.state).toBe("parcial");
    const refreshed = hypothesis.refresh!(built, finding, null, ctx)!;
    const disc = refreshed.discriminators.find((d) => d.label.includes("candidato a Template Method"))!;
    expect(disc.passed).toBe(false);
    expect(disc.why).toContain("ningún otro archivo");
  });

  it("refresh() con OTRO archivo del vecindario anclando 'inheritance-family': el discriminador SÍ confirma, sin volver a tocar el árbol", async () => {
    const { ctx, finding } = await structuralContextFor(TS_TEMPLATE_PARTIAL, "CsvReport2", "large-class");
    const built = hypothesis.build(finding, null, ctx)!;
    expect(built.state).toBe("parcial");
    // OLA BA — mismo estampado que `run.ts#conCapa`: la capa sale del builder, nunca del draft.
    finding.hypotheses = [{ ...built, layer: hypothesis.layer }];

    const sibling: Finding = {
      id: "f-sibling",
      detectorId: "inheritance-family",
      kind: "inheritance-family",
      scope: "intra-file",
      language: "typescript",
      title: "t",
      detail: "d",
      trigger: [{ label: "m", value: 1, threshold: fakeThreshold() }],
      locations: [{ file: "other.ts", startLine: 1, endLine: 3, symbol: "Base", role: "problema" }],
      severity: 15,
      advice: { primary: { name: "x", kind: "patron_de_diseno", why: "y", source: "z" } },
    };

    const index = buildNeighborhoodIndex(null, [finding, sibling], null);
    refreshHypotheses({
      findings: [finding],
      repo: { repoName: "fixture", files: [], functions: [], clones: [], graph: null },
      languages: new Map([["typescript", { capabilities: new Set<Capability>(["herencia", "unidad-tipo-clase"]), sets: tsSets! }]]),
      neighborhoodIndex: index,
    });

    const refreshed = finding.hypotheses![0]!;
    const disc = refreshed.discriminators.find((d) => d.label.includes("candidato a Template Method"))!;
    expect(disc.passed).toBe(true);
    expect(disc.why).toContain("other.ts");
    // `state`/`checks` (decididos por `build()` con árbol vivo) viajan INTACTOS — `refresh()` nunca los toca.
    expect(refreshed.state).toBe(built.state);
    expect(refreshed.checks).toEqual(built.checks);
    // Verificación cruzada, sin pasar por template-method.ts: el vecindario real ve al hermano.
    expect(neighborhoodFor(index, finding).countOfKind("inheritance-family")).toBe(1);
  });

  it("refresh() con state 'ya-aplicado' (no compite por confianza) ⇒ null, sin reconstruir nada", async () => {
    const { ctx, finding } = await structuralContextFor(TS_TEMPLATE_COMPLETE, "Report", "large-class");
    const built = hypothesis.build(finding, null, ctx)!;
    expect(built.state).toBe("ya-aplicado");
    expect(hypothesis.refresh!(built, finding, null, ctx)).toBeNull();
  });

  it("refresh() sobre un ancla NO estructural (distributed-duplication) ⇒ null — esa ancla ya vio el vecindario real dentro de build(), nunca pasa por perFileFindings/refreshHypotheses en producción", () => {
    const finding = conditionalChainLikeDistributedDuplicationFinding();
    const ctx: HypothesisContext = {
      file: null,
      fileAt: () => null,
      repo: { repoName: "r", files: [], functions: [], clones: [], graph: null },
      capabilities: new Set<Capability>(),
      setsFor: () => tsSets!,
      neighborhood: EMPTY_NEIGHBORHOOD,
      branches: () => null,
    };
    const existing = hypothesis.build(finding, null, ctx);
    // Sin CloneCandidate real (repo.clones vacío), build() ya da null por el
    // required — igual sirve para confirmar que `refresh()` no revive nada
    // por su cuenta cuando el kind no es uno de los 3 anclas estructurales.
    expect(existing).toBeNull();
  });

  /* ══════════════════════════════════════════════════════════════════════
   * OLA AO · FRENTE AO4 — **EL CUERPO DE UN HERMANO QUE VIVE EN OTRO ARCHIVO**
   *
   * Un test por INTENCIÓN. Todos usan el ancla `large-class` en la dirección
   * SUBTIPO (`resolveDeferredViaGraph`), que es de donde AM1 midió que salen
   * las 39 recomendaciones cuyo discriminador de similitud contestaba "Sin
   * datos de secuencia de llamadas" en 39 de 39.
   * ══════════════════════════════════════════════════════════════════════ */

  /** Un clon con el cuerpo de `Unidad.metodo` en `archivo`, con span que solapa
   *  el del nodo de miembro que `familiaDeSubtipo`/`familiaDeRaiz` fabrican
   *  (`methodNode` arranca en la línea 2 y termina en la 5). */
  function cloneDe(file: string, className: string | null, functionName: string, normalized: string, nodes = 40): CloneCandidate {
    return fakeClone({ file, className, functionName, normalized, nodes, startLine: 2, endLine: 5 });
  }

  it("INTENCIÓN: *el cuerpo de una copia que vive en OTRO archivo se recupera de `repo.clones`* — con DOS hermanos y cuerpos parecidos la hipótesis SALE; sin los clones, el MISMO grafo da `null`", async () => {
    const anchor = anchorClassNode("Hijo");
    const fam = familiaDeSubtipo(anchor, 2, 2);
    const graph = makeGraph([anchor, ...fam.nodes], fam.edges);
    const clones = [cloneDe("fixture.ts", "Hijo", "run", SIM_A), cloneDe("herm1.ts", "Herm1", "run", SIM_B)];

    // SIN clones: es el comportamiento de ANTES, byte a byte —
    // `grupo-sin-cuerpo-exige-tres-unidades` mata al grupo de 2 unidades.
    const sinCuerpo = await structuralContextFor(TS_HIJO_DE_OTRO_ARCHIVO, "Hijo", "large-class");
    expect(hypothesis.build(sinCuerpo.finding, graph, sinCuerpo.ctx)).toBeNull();

    // CON clones: el mismo grupo de 2 unidades ahora tiene datos de cuerpo, y
    // el propio check declara que con datos de cuerpo alcanzan 2 unidades.
    const conCuerpo = await structuralContextFor(TS_HIJO_DE_OTRO_ARCHIVO, "Hijo", "large-class", clones);
    const h = hypothesis.build(conCuerpo.finding, graph, conCuerpo.ctx);
    expect(h).not.toBeNull();
    expect(h!.checks.find((c) => c.label.includes("NINGUNA copia del grupo ganador trae la secuencia"))!.passed).toBe(true);
  });

  it("INTENCIÓN: *la similitud de los cuerpos se puede MEDIR* — el discriminador `high-average-similarity`, que por este camino contestaba «Sin datos de secuencia de llamadas» SIEMPRE (39 de 39, AM1), se confirma con cuerpos de alta similitud", async () => {
    const anchor = anchorClassNode("Hijo");
    const fam = familiaDeSubtipo(anchor, 3, 3);
    const graph = makeGraph([anchor, ...fam.nodes], fam.edges);
    const clones = [
      cloneDe("fixture.ts", "Hijo", "run", SIM_A),
      cloneDe("herm1.ts", "Herm1", "run", SIM_B),
      cloneDe("herm2.ts", "Herm2", "run", SIM_A),
    ];
    const { ctx, finding } = await structuralContextFor(TS_HIJO_DE_OTRO_ARCHIVO, "Hijo", "large-class", clones);
    const h = hypothesis.build(finding, graph, ctx);
    expect(h).not.toBeNull();
    const disc = h!.discriminators.find((d) => d.label.startsWith("Similitud promedio de secuencia"))!;
    expect(disc.passed).toBe(true);
    expect(disc.why).not.toContain("Sin datos");
  });

  it("INTENCIÓN: *un cuerpo BAJO en similitud no se convierte en un `null`* — la ola es ADITIVA: el dato nuevo puede hacer PASAR una compuerta, nunca fallarla (3 hermanos con cuerpos distintos siguen emitiendo, con el discriminador en falso)", async () => {
    const anchor = anchorClassNode("Hijo");
    const fam = familiaDeSubtipo(anchor, 3, 3);
    const graph = makeGraph([anchor, ...fam.nodes], fam.edges);
    const clones = [
      cloneDe("fixture.ts", "Hijo", "run", SIM_A),
      cloneDe("herm1.ts", "Herm1", "run", DIFFERENT),
      cloneDe("herm2.ts", "Herm2", "run", DIFFERENT),
    ];
    const sinCuerpo = await structuralContextFor(TS_HIJO_DE_OTRO_ARCHIVO, "Hijo", "large-class");
    const antes = hypothesis.build(sinCuerpo.finding, graph, sinCuerpo.ctx);
    expect(antes).not.toBeNull();

    const { ctx, finding } = await structuralContextFor(TS_HIJO_DE_OTRO_ARCHIVO, "Hijo", "large-class", clones);
    const h = hypothesis.build(finding, graph, ctx);
    expect(h).not.toBeNull();
    expect(h!.state).toBe(antes!.state);
    expect(h!.discriminators.find((d) => d.label.startsWith("Similitud promedio de secuencia"))!.passed).toBe(false);
  });

  it("INTENCIÓN: *el clon tiene que ser de ESTA unidad* — un clon homónimo de OTRA clase en el mismo archivo no aporta cuerpo", async () => {
    const anchor = anchorClassNode("Hijo");
    const fam = familiaDeSubtipo(anchor, 2, 2);
    const graph = makeGraph([anchor, ...fam.nodes], fam.edges);
    const clones = [cloneDe("fixture.ts", "OtraClase", "run", SIM_A), cloneDe("herm1.ts", "OtraMas", "run", SIM_B)];
    const { ctx, finding } = await structuralContextFor(TS_HIJO_DE_OTRO_ARCHIVO, "Hijo", "large-class", clones);
    expect(hypothesis.build(finding, graph, ctx)).toBeNull();
  });

  it("INTENCIÓN: *el clon tiene que SOLAPAR el span del miembro* — un clon del mismo nombre en otra región del archivo no aporta cuerpo", async () => {
    const anchor = anchorClassNode("Hijo");
    const fam = familiaDeSubtipo(anchor, 2, 2);
    const graph = makeGraph([anchor, ...fam.nodes], fam.edges);
    const lejos = (file: string, className: string) => fakeClone({ file, className, functionName: "run", normalized: SIM_A, nodes: 40, startLine: 900, endLine: 940 });
    const { ctx, finding } = await structuralContextFor(TS_HIJO_DE_OTRO_ARCHIVO, "Hijo", "large-class", [lejos("fixture.ts", "Hijo"), lejos("herm1.ts", "Herm1")]);
    expect(hypothesis.build(finding, graph, ctx)).toBeNull();
  });

  it("INTENCIÓN: *`className` ausente es «no sé», no «otra clase»* — un clon sin nombre de clase escrito por la gramática igual aporta su cuerpo", async () => {
    const anchor = anchorClassNode("Hijo");
    const fam = familiaDeSubtipo(anchor, 2, 2);
    const graph = makeGraph([anchor, ...fam.nodes], fam.edges);
    const clones = [cloneDe("fixture.ts", null, "run", SIM_A), cloneDe("herm1.ts", null, "run", SIM_B)];
    const { ctx, finding } = await structuralContextFor(TS_HIJO_DE_OTRO_ARCHIVO, "Hijo", "large-class", clones);
    expect(hypothesis.build(finding, graph, ctx)).not.toBeNull();
  });
  });
});

function conditionalChainLikeDistributedDuplicationFinding(): Finding {
  return {
    id: "f-dd",
    detectorId: "distributed-duplication",
    kind: "distributed-duplication",
    scope: "inter-file",
    language: null,
    title: "t",
    detail: "d",
    trigger: [{ label: "m", value: 2, threshold: fakeThreshold() }],
    locations: [
      { file: "a.ts", startLine: 1, endLine: 5, symbol: "run", role: "copia 1" },
      { file: "b.ts", startLine: 1, endLine: 5, symbol: "run", role: "copia 2" },
    ],
    severity: 45,
    advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
  };
}
