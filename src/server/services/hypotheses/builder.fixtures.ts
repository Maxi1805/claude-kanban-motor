/**
 * Fixtures compartidos por `builder.test.ts` — hipótesis Builder (F6, S1).
 * Propiedad exclusiva de esta migración (CONTRATO-F6.md §1.8): ningún otro
 * archivo de `hypotheses/*` los importa.
 */
import type { DerivedNodeSets } from "../code-grammar.js";
import type { Capability } from "../detect/capabilities.js";
import { pisoDeclarado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import type { AstNode, Finding, FileUnit, FunctionMetrics, FunctionUnit, RepoFunctionUnit, RepoUnit } from "../detect/types.js";
import { EMPTY_NEIGHBORHOOD } from "../graph/neighborhood.js";
import { symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode } from "../graph/types.js";
import type { HypothesisContext } from "./types.js";

/**
 * Ola 10/11 — grafos sintéticos para el excluder ESTRUCTURAL nuevo
 * (`evaluateGraphShape`, `builder.ts`). Mismo estilo que
 * `hypotheses/wrapping-chain.test.ts#sym`/`method`/`edge`/`containsAll`:
 * un `CodeGraph` mínimo por escenario, sin pasar por `analyzeRepo`.
 */
export const EMPTY_RESOLUTION = { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] };

export function graphSym(file: string, symbolPath: readonly string[], overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return { id: symbolNodeId(file, symbolPath), kind: "symbol", file, symbolPath, family: "class-like", ...overrides };
}

export function graphMethod(file: string, classPath: string, name: string, arity: number | null, overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return graphSym(file, [classPath, name], { family: "function-like", arity, ...overrides });
}

export function graphEdge(from: string, to: string, kind: CodeGraphEdge["kind"], overrides: Partial<CodeGraphEdge> = {}): CodeGraphEdge {
  return { from, to, kind, provenance: "resolved", weight: 1, ...overrides };
}

/** `contains` desde `ownerId` hacia cada uno de sus miembros. */
export function graphContainsAll(ownerId: string, memberIds: readonly string[]): CodeGraphEdge[] {
  return memberIds.map((m) => graphEdge(ownerId, m, "contains"));
}

export function makeGraph(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): CodeGraph {
  return { nodes, edges, resolution: EMPTY_RESOLUTION };
}

export function fakeThreshold(value = 6): Threshold {
  return resolveThreshold(pisoDeclarado(value, { rationale: "fixture de test" }), {
    language: "javascript",
    sampleSize: () => 0,
    corpusP95: () => null,
  });
}

export function emptySets(): DerivedNodeSets {
  return {
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
}

export function fakeAstNode(text: string): AstNode {
  return {
    type: "method",
    isNamed: true,
    childCount: 0,
    child: () => null,
    childForFieldName: () => null,
    startPosition: { row: 0, column: 0 },
    endPosition: { row: 0, column: 0 },
    text,
  };
}

/**
 * Ola 12 — árbol REAL (no el nodo degenerado de `fakeAstNode`, que no tiene
 * hijos/campos) para ejercitar `hypotheses/builder.ts#ensamblaConLogica`
 * (`if`/`case`, instanciación de sub-objetos, bloque/DSL) sin tree-sitter.
 * Mismo idiom que `proxy.test.ts`'s `Spec`/`build()` local — acá exportado
 * porque `builder.test.ts` lo necesita en varios `describe` distintos.
 */
export interface NodeSpec {
  type: string;
  text?: string;
  isNamed?: boolean;
  fields?: Record<string, NodeSpec>;
  extraChildren?: NodeSpec[];
}

let structuredRow = 0;
export function buildNode(spec: NodeSpec): AstNode {
  const row = structuredRow++;
  const fieldNodes: Record<string, AstNode> = {};
  for (const [k, v] of Object.entries(spec.fields ?? {})) fieldNodes[k] = buildNode(v);
  const extra = (spec.extraChildren ?? []).map((c) => buildNode(c));
  const allChildren = [...Object.values(fieldNodes), ...extra];
  return {
    type: spec.type,
    isNamed: spec.isNamed ?? true,
    childCount: allChildren.length,
    startPosition: { row, column: 0 },
    endPosition: { row, column: 1 },
    text: spec.text ?? spec.type,
    child: (i: number) => allChildren[i] ?? null,
    childForFieldName: (name: string) => fieldNodes[name] ?? null,
  };
}

/** `this.<field> = <rightText>` (identificador plano del lado derecho — el
 *  caso "sólo asigna" cuando `rightText` es uno de los parámetros propios). */
export function selfAssignSpec(field: string, rightText: string): NodeSpec {
  return {
    type: "assignment_expression",
    text: `this.${field} = ${rightText}`,
    fields: {
      left: {
        type: "member_expression",
        text: `this.${field}`,
        fields: { object: { type: "this", text: "this" } },
        extraChildren: [{ type: "property_identifier", text: field }],
      },
      right: { type: "identifier", text: rightText },
    },
  };
}

/** `if (cond) { <consequence> } else { <alternative> }` — un `chainNodes`
 *  real (`if_statement`), la señal (a) de `ensamblaConLogica`. */
export function ifStatementSpec(consequence: NodeSpec, alternative?: NodeSpec): NodeSpec {
  return {
    type: "if_statement",
    fields: {
      condition: { type: "identifier", text: "flag" },
      consequence: { type: "statement_block", extraChildren: [consequence] },
      ...(alternative ? { alternative: { type: "statement_block", extraChildren: [alternative] } } : {}),
    },
  };
}

/** `new <typeName>(...)` — instanciación de sub-objeto, señal (b). */
export function newExprSpec(typeName: string): NodeSpec {
  return { type: "new_expression", text: `new ${typeName}()` };
}

/** `<name>(...)` — llamada plana, usada para representar reenvío/forwarding
 *  (ninguna de las tres señales de `ensamblaConLogica` la reconoce). */
export function plainCallSpec(name: string): NodeSpec {
  return { type: "call_expression", text: `${name}()`, fields: { function: { type: "identifier", text: name } } };
}

/** Un cuerpo de función que SÓLO asigna campos desde sus propios parámetros
 *  (`this.<p> = <p>` por cada uno) — el caso "sólo asigna" que
 *  `ensamblaConLogica` debe rechazar. Mismo `functionDeclSpec` de abajo. */
export function assignOnlyBodySpec(paramNames: readonly string[]): NodeSpec {
  return { type: "statement_block", extraChildren: paramNames.map((p) => selfAssignSpec(p, p)) };
}

/** OLA AM (AM3) — cuerpo cuya ÚNICA cadena SÓLO INVOCA: `if (flag) { notify() }`.
 *  Ninguna rama asigna ni instancia — la forma de "reenvío/despacho" que
 *  `builder.ts#chainOnlyInvokes` descarta como evidencia de ensamblaje. */
export function invokeOnlyChainBodySpec(calleeName = "notify"): NodeSpec {
  return { type: "statement_block", extraChildren: [ifStatementSpec({ type: "expression_statement", extraChildren: [plainCallSpec(calleeName)] })] };
}

/** OLA AM (AM3) — GUARDIÁN: la MISMA cadena, pero con una asignación en la rama.
 *  Tiene que SEGUIR contando como ensamblaje (el descarte no se sobre-extiende a
 *  cualquier `if` que además contenga una llamada). */
export function invokeAndAssignChainBodySpec(): NodeSpec {
  return {
    type: "statement_block",
    extraChildren: [
      ifStatementSpec({ type: "statement_block", extraChildren: [{ type: "expression_statement", extraChildren: [plainCallSpec("notify")] }, selfAssignSpec("x", "a")] }),
    ],
  };
}

/** Cuerpo con lógica condicional propia (señal a). */
export function conditionalBodySpec(field = "x"): NodeSpec {
  return { type: "statement_block", extraChildren: [ifStatementSpec(selfAssignSpec(field, "a"), selfAssignSpec(field, "b"))] };
}

/** Cuerpo que arma ≥2 sub-objetos distintos (señal b). */
export function subObjectAssemblyBodySpec(): NodeSpec {
  return {
    type: "statement_block",
    extraChildren: [
      { type: "expression_statement", extraChildren: [newExprSpec("Contact")] },
      { type: "expression_statement", extraChildren: [newExprSpec("Appointment")] },
    ],
  };
}

/** `return <value>` — usado por las specs de selección-entre-ramas de abajo
 *  (OLA 14) para poder pelarlo con `unwrapSoleValue`. */
export function returnSpec(value: NodeSpec): NodeSpec {
  return { type: "return_statement", extraChildren: [value] };
}

/**
 * OLA 14 — `if (cond) return new <typeA>() else return new <typeB>()`: el
 * caso medido de `ClassPath.ResourceInfo#of` (RAICES.md, docstring del
 * módulo sección OLA 14). Cada rama, tras pelar el `return`, es UNA sola
 * instanciación — selección entre ramas, no ensamblaje: `ensamblaConLogica`
 * NO debe confirmar acá, por NINGUNA de sus dos señales (chainNodes NI
 * ≥2 sub-objetos).
 */
export function branchSelectionBodySpec(typeA = "ClassInfo", typeB = "ResourceInfo"): NodeSpec {
  return {
    type: "statement_block",
    extraChildren: [ifStatementSpec(returnSpec(newExprSpec(typeA)), returnSpec(newExprSpec(typeB)))],
  };
}

/** `<consequence> ? <alternative>` sin envoltorio — el ternario tal como lo
 *  parsean Java/C#/TS/Ruby: `condition`+`consequence`+`alternative` directo,
 *  sin bloque. */
export function ternarySpec(consequence: NodeSpec, alternative: NodeSpec, conditionText = "next == null"): NodeSpec {
  return {
    type: "ternary_expression",
    fields: {
      condition: { type: "binary_expression", text: conditionText },
      consequence,
      alternative,
    },
  };
}

/**
 * OLA 14 — `return <cond> ? new <typeA>() : new <typeB>()`: el caso medido
 * de `MapMakerInternalMap#newEntry` (RAICES.md, docstring del módulo sección
 * OLA 14). El propio ternario cumple `isPureConstructionChain` directo (sus
 * dos ramas SON, ya, cada una una instanciación pura) — selección entre
 * ramas, no ensamblaje.
 */
export function ternaryConstructionBodySpec(typeA = "StrongKeyStrongValueEntry", typeB = "LinkedStrongKeyStrongValueEntry"): NodeSpec {
  return {
    type: "statement_block",
    extraChildren: [returnSpec(ternarySpec(newExprSpec(typeA), newExprSpec(typeB)))],
  };
}

/**
 * OLA 14 — GUARDIÁN: un `if` de selección entre ramas (como
 * `branchSelectionBodySpec`) más OTRA instanciación INCONDICIONAL en el
 * mismo cuerpo — el caso que SÍ debe seguir contando como ensamblaje
 * (≥2 sub-objetos que SÍ pueden coexistir en una misma ejecución: el elegido
 * por el `if` + el incondicional). Verifica que el descarte de la selección
 * entre ramas no se sobre-extienda a "cualquier cuerpo con un `if` adentro".
 */
export function branchSelectionPlusExtraBodySpec(typeA = "ClassInfo", typeB = "ResourceInfo", extraType = "Metadata"): NodeSpec {
  return {
    type: "statement_block",
    extraChildren: [
      ifStatementSpec(returnSpec(newExprSpec(typeA)), returnSpec(newExprSpec(typeB))),
      { type: "expression_statement", extraChildren: [newExprSpec(extraType)] },
    ],
  };
}

/** `raise <typeName>(...)` (Python/Ruby-style; `throw` en JS/Java/C#) — una
 *  SALIDA de control, nunca "el valor construido de esta rama", aunque lo
 *  que lanza sea, él mismo, una instanciación. */
export function raiseSpec(typeName: string): NodeSpec {
  return { type: "raise_statement", text: `raise ${typeName}()`, extraChildren: [newExprSpec(typeName)] };
}

/**
 * OLA 14 — GUARDIÁN: `if (cond) return new A() else raise Error()` —
 * validar-o-construir, NO selección entre DOS alternativas construidas (sólo
 * UNA rama construye algo de verdad; la otra es una salida de control). Debe
 * seguir contando como ensamblaje genuino (`isNonValueJump` evita que
 * `raise Error()` pele hasta una instanciación y "complete" una cadena
 * puramente selectiva junto con la rama que sí construye).
 */
export function raiseVsConstructBodySpec(typeA = "ClassInfo", errorType = "ValueError"): NodeSpec {
  return {
    type: "statement_block",
    extraChildren: [ifStatementSpec(returnSpec(newExprSpec(typeA)), raiseSpec(errorType))],
  };
}

/** `new <outer>(new <inner>())` — UNA sola envoltura (idiom Adapter/Wrapper),
 *  no ≥2 sub-objetos independientes. Guardián post-Ola 12: verificado contra
 *  `corpus/newtonsoft-json#XmlNodeConverter.CreateXmlDocumentType` (`return
 *  new XDocumentTypeWrapper(new XDocumentType(...));`), que ANTES del ajuste
 *  de `countInOwnScope` (ver `builder.ts`) contaba como 2 instanciaciones —
 *  el mismo falso positivo "factory-wrapper trivial" que la señal (b) dice
 *  evitar. */
export function nestedWrapBodySpec(outer = "Wrapper", inner = "Inner"): NodeSpec {
  return {
    type: "statement_block",
    extraChildren: [
      {
        type: "expression_statement",
        extraChildren: [
          {
            type: "new_expression",
            text: `new ${outer}(new ${inner}())`,
            extraChildren: [{ type: "arguments", extraChildren: [newExprSpec(inner)] }],
          },
        ],
      },
    ],
  };
}

/** Cuerpo con una única llamada de reenvío (forwarding) — ninguna señal:
 *  debe seguir dando "sólo asigna/reenvía" bajo `ensamblaConLogica`. */
export function forwardingBodySpec(calleeName = "delegate"): NodeSpec {
  return { type: "statement_block", extraChildren: [{ type: "expression_statement", extraChildren: [plainCallSpec(calleeName)] }] };
}

/** `sets.chainNodes`/`functionNodes` que corresponden a los tipos que las
 *  specs de arriba usan — necesarios para que `ensamblaConLogica` (que lee
 *  `fn.sets.chainNodes`/`fn.sets.functionNodes`) reconozca `if_statement`
 *  como rama y no baje a un `function_declaration` anidado. */
export function assemblySets(): DerivedNodeSets {
  return {
    ...emptySets(),
    functionNodes: new Set(["function_declaration"]),
    branchNodes: new Set(["if_statement"]),
    chainNodes: new Set(["if_statement"]),
    nestingNodes: new Set(["if_statement"]),
  };
}

function functionDeclSpec(name: string, paramNames: readonly string[], bodySpec: NodeSpec): NodeSpec {
  return {
    type: "function_declaration",
    fields: {
      name: { type: "identifier", text: name },
      parameters: { type: "formal_parameters", extraChildren: paramNames.map((p) => ({ type: "identifier", text: p })) },
      body: bodySpec,
    },
  };
}

/** Nodo de función REAL por defecto para `fakeFunctionUnit`: muestra
 *  ensamblaje genuino (condicional propio) para que los tests que NO son
 *  específicamente sobre `ensamblaConLogica` sigan construyendo una
 *  candidata sin tener que armar su propio árbol. */
export function fakeAssemblyNode(name = "build"): AstNode {
  return buildNode(functionDeclSpec(name, ["a", "b", "c", "d", "e", "f", "g", "h"], conditionalBodySpec()));
}

function fakeMetrics(overrides: Partial<FunctionMetrics> = {}): FunctionMetrics {
  return {
    branches: 0,
    chain: 0,
    cognitive: 0,
    maxNesting: 0,
    parameters: 8,
    chainHasNullCheck: false,
    chainInstantiates: false,
    className: "Widget",
    isConstructor: false,
    isFactoryLike: false,
    ...overrides,
  };
}

export function fakeLongParameterListFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "f-lpl",
    detectorId: "long-parameter-list",
    kind: "long-parameter-list",
    scope: "intra-function",
    language: "javascript",
    title: "build recibe 8 parámetros",
    detail: "d",
    trigger: [{ label: "parámetros", value: 8, threshold: fakeThreshold(6) }],
    locations: [{ file: "a.js", startLine: 1, endLine: 10, symbol: "build", role: "función con exceso de parámetros" }],
    severity: 65,
    advice: { primary: { name: "Introduce Parameter Object", kind: "refactorizacion", why: "w", source: "s" } },
    ...overrides,
  };
}

export function fakeDataClumpFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "f-dc",
    detectorId: "data-clump",
    kind: "data-clump",
    scope: "intra-file",
    language: "javascript",
    title: "El grupo (a, b, c) se repite en 3 firmas",
    detail: "d",
    trigger: [
      { label: "firmas con el mismo grupo", value: 3, threshold: fakeThreshold(3) },
      { label: "tamaño del grupo", value: 3, threshold: fakeThreshold(3) },
    ],
    locations: [
      { file: "a.js", startLine: 1, endLine: 5, symbol: "build", role: "primera firma con este grupo" },
      { file: "a.js", startLine: 10, endLine: 14, symbol: "buildOther", role: "repetición #1" },
      { file: "a.js", startLine: 20, endLine: 24, symbol: "buildThird", role: "repetición #2" },
    ],
    severity: 60,
    advice: { primary: { name: "Introduce Parameter Object", kind: "refactorizacion", why: "w", source: "s" } },
    ...overrides,
  };
}

export function fakeRepoFunction(overrides: Partial<RepoFunctionUnit> = {}, metricsOverrides: Partial<FunctionMetrics> = {}): RepoFunctionUnit {
  return {
    file: "a.js",
    language: "javascript",
    name: "build",
    startLine: 1,
    endLine: 10,
    symbolPath: ["Widget", "build"],
    sets: emptySets(),
    metrics: fakeMetrics(metricsOverrides),
    ...overrides,
  };
}

export function fakeRepo(functions: readonly RepoFunctionUnit[] = [], overrides: Partial<RepoUnit> = {}): RepoUnit {
  return { repoName: "r", files: [], functions, clones: [], graph: null, ...overrides };
}

export function fakeFunctionUnit(overrides: Partial<FunctionUnit> = {}, metricsOverrides: Partial<FunctionMetrics> = {}): FunctionUnit {
  return {
    file: "a.js",
    language: "javascript",
    name: "build",
    startLine: 1,
    endLine: 10,
    symbolPath: ["Widget", "build"],
    // Ola 12: por defecto un árbol REAL con ensamblaje genuino (condicional
    // propio) — así los tests que NO son específicamente sobre
    // `ensamblaConLogica` (la escalera, el excluder de grafo, refresh()…)
    // siguen construyendo una candidata sin tener que armar su propio árbol.
    // Los tests que SÍ ejercitan el discriminador nuevo pasan su propio
    // `node`/`sets` (ver `assignOnlyBodySpec`/`forwardingBodySpec`/etc.).
    node: fakeAssemblyNode(),
    sets: assemblySets(),
    metrics: fakeMetrics(metricsOverrides),
    ...overrides,
  };
}

export function fakeFileUnit(functions: readonly FunctionUnit[] = [], overrides: Partial<FileUnit> = {}): FileUnit {
  return { path: "a.js", language: "javascript", lines: 100, root: fakeAstNode(""), sets: emptySets(), functions, ...overrides };
}

export function fakeContext(overrides: Partial<HypothesisContext> = {}): HypothesisContext {
  return {
    file: null,
    fileAt: () => null,
    repo: fakeRepo(),
    capabilities: new Set<Capability>(),
    setsFor: () => emptySets(),
    // Igual default que el cableado real (`hypotheses/run.ts`) para un
    // problem sin vecindario/ramas construidos — el 99% de estos fixtures
    // no ejercitan CONTRATO-F9.md §1.1/§1.3, así que el default seguro.
    neighborhood: EMPTY_NEIGHBORHOOD,
    branches: () => null,
    ...overrides,
  };
}
