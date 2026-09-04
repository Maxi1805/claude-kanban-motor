/**
 * Guard Clauses (Replace Nested Conditional with Guard Clauses) — Ola AS,
 * frente AS2.
 *
 * ── LA FORMA, Y POR QUÉ ES UNA FORMA Y NO UN GUSTO ─────────────────────────
 * El encargo de esta ola avisa exactamente del riesgo: *"«invertir esta
 * guarda» es de las cosas donde dos revisores discrepan más"*. Es cierto para
 * la versión suelta de esta técnica ("se leería mejor al revés"), y por eso
 * este archivo NO la implementa. Implementa una forma DURA, la punta de
 * flecha:
 *
 *     function f(...) {                 function f(...) {
 *       if (a) {                          if (!a) return;
 *         if (b) {              ⇒         if (!b) return;
 *           if (c) {                      if (!c) return;
 *             <el trabajo real>           <el trabajo real>
 *           }                           }
 *         }
 *       }
 *     }
 *
 * Las cinco condiciones se verifican ABRIENDO EL ARCHIVO y contando —ninguna
 * es una opinión sobre el futuro ni sobre la legibilidad—:
 *   (1) hay una ESPINA de >= 3 condicionales, cada uno metido dentro del
 *       anterior;
 *   (2) NINGUNO tiene `else` — con `else` la inversión no es una reescritura
 *       mecánica y ahí sí empieza el gusto personal;
 *   (3) cada condicional de la espina es la ÚLTIMA sentencia de su nivel:
 *       después de él no se ejecuta NADA. Ésta es la condición que vuelve la
 *       transformación EQUIVALENTE — `if (!c) return;` sólo se puede escribir
 *       si no había nada después que dependiera de seguir;
 *   (4) el trabajo real está AL FONDO: el cuerpo más interno tiene >= 3
 *       líneas y es al menos la mitad del cuerpo de la función;
 *   (5) la función NO usa ya guardas: si arriba ya hay >= 2 cortes tempranos,
 *       el autor ya escribe así y lo que queda anidado es la lógica de
 *       verdad, no una punta de flecha.
 *
 * (5) es la TRAMPA #3 de la ola —*"el remedio puede YA estar aplicado, y hay
 * que mirar dónde vive la solución, no sólo el alcance del ancla"*— y es un
 * `required`: cuando se cumple, esta hipótesis devuelve `null` (silencio), no
 * una propuesta con menos confianza.
 *
 * ── LO QUE ESTA FAMILIA NO ABSORBIÓ, Y POR QUÉ ─────────────────────────────
 * El encargo pedía absorber también *Remove Control Flag*, con el ancla
 * `flag-accumulator`. **No se hizo, y no es un olvido: el ancla no es esa
 * forma.** `detect/intra-function/flag-accumulator.ts` detecta un ACUMULADOR
 * reasignado bajo >= 3 guardas independientes (Kerievsky, "Move Embellishment
 * to Decorator") y su propio docstring excluye textualmente la forma que
 * *Remove Control Flag* necesita: *"Guardas con corte de flujo (`if (x)
 * return;`) NO son este smell: acá sólo cuenta una guarda cuyo cuerpo
 * REASIGNA el mismo target"*. Un flag booleano que gobierna la salida de un
 * bucle no tiene ancla en el catálogo de hoy; construirla sería un detector
 * nuevo en `detect/`, fuera del alcance de este frente.
 *
 * ── LA TRAMPA #2 (no borrarle la propuesta a Extract Method) ───────────────
 * `Extract Method` ancla en `long-function` y `complexity` — las MISMAS dos
 * anclas de acá. `appliedState` de esta hipótesis devuelve SIEMPRE
 * `"ausente"`: `engine.ts#arbitrateRivalHypotheses` sólo retira una
 * oportunidad frente a un estado CONFIRMADO (`ya-aplicado`/
 * `aplicado-eludido`) de otro patrón, así que una hipótesis que no puede
 * estar confirmada no puede retirar nada. `guard-clauses.test.ts` lo congela.
 *
 * ── LENGUAJES ─────────────────────────────────────────────────────────────
 * `needs: []`. Ninguna constante nombra un lenguaje: los condicionales se
 * ubican por `DerivedNodeSets` (`ctx.setsFor`), el corte de flujo por palabra
 * de gramática genérica (`FLOW_BREAK_WORD`), igual que `code-grammar.ts`.
 */
import type { DerivedNodeSets } from "../code-grammar.js";
import { walkTree } from "../detect/tree-walk.js";
import type { AstNode, FileUnit, Finding, FunctionUnit, RoleLocation } from "../detect/types.js";
import type { CodeGraph } from "../graph/types.js";
import { build as runEngine, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisDraft } from "./types.js";

/**
 * DOS NIVELES — y el número está MEDIDO, no elegido.
 *
 * Arrancó en 3 ("dos es un `if` dentro de un `if`, que nadie llama punta de
 * flecha") y la sonda de alcance lo bajó: con >= 3 la familia es **vacía en el
 * corpus**. Contado sobre funciones REALES, con un `Finding` sintético por
 * función para separar "la forma es rara" de "la detección está rota"
 * (`scratchpad-as2/alcance.mts`):
 *
 *   · `corpus/cobra` (Go, 36 archivos, 595 funciones): espinas de profundidad
 *     0 → 383, **1 → 210, 2 → 2, 3+ → 0**.
 *   · `corpus/guava` (Java, 150 archivos, 1.800 funciones): 0 → 1.679,
 *     **1 → 102, 2 → 18, 3 → 1** (y ese único de 3 muere en `trabajo-al-fondo`).
 *
 * O sea: la punta de flecha de tres niveles CON el trabajo al fondo y sin
 * `else` **prácticamente no existe** en código abierto maduro. Con el piso en
 * 2 la forma sigue siendo dura y la transformación sigue siendo mecánica
 * (`if (!a) return X; if (!b) return X; <trabajo>`), y el TAMAÑO no lo pone
 * este número: lo ponen las anclas (`complexity` >= 15 cognitiva,
 * `long-function` >= 45 líneas) más `trabajo-al-fondo`, que exige que la
 * espina sea >= 50 % de la función. Tres niveles pasa a ser un DISCRIMINADOR.
 */
const MIN_DEPTH = 2;
/** Tres o más sube un peldaño de confianza — ver el conteo de arriba: es raro. */
const DEEP_DEPTH = 3;
/** El trabajo del fondo tiene que ser trabajo: menos de tres líneas no es "el caso principal". */
const MIN_INNER_LINES = 3;
/**
 * Y tiene que dominar: la mitad de lo que la punta de flecha ENVUELVE, y la
 * punta de flecha tiene que ser la mitad de la función.
 *
 * POR QUÉ CONTRA LA ESPINA Y NO CONTRA EL CUERPO ENTERO (medido, no elegido):
 * la primera versión comparaba `innerLines / bodyLines` y quedaba MUDA en los
 * cuatro fixtures con llaves —TypeScript, Go, Java, C#— porque las llaves de
 * cierre de los tres niveles y el `return` de cola son líneas del cuerpo que
 * NINGUNA punta de flecha puede evitar: 6 líneas de trabajo sobre 13 de
 * cuerpo da 46 %, abajo del piso, en el caso canónico. Contra la espina el
 * mismo caso da 6/10 = 60 %, que es la afirmación que de verdad importa:
 * *"casi todo lo que este anidamiento envuelve es el trabajo del fondo"*.
 * Python y Ruby pasaban con la métrica vieja sólo porque no escriben llaves.
 */
const INNER_SHARE = 0.5;
/** Y la punta de flecha tiene que ser la mitad de la función, o es un rincón de una función grande. */
const SPINE_SHARE = 0.5;
/** Dos cortes tempranos ya son un estilo, no una casualidad. */
const EXISTING_GUARDS = 2;

/** Corte de flujo: lo que una guarda hace. Palabra de gramática genérica. */
const FLOW_BREAK_WORD = /(^|_)(return|throw|raise|panic|continue|break)(_|$)/;
/** Un bucle también expone `condition`: nunca es un peldaño de la espina. */
const LOOP_WORD = /(^|_)(while|until|for|do|loop|range)(_|$)/;
/** Comentarios: nombrados en las gramáticas, pero no son sentencias. */
const COMMENT_WORD = /(^|_)comment(_|$)/;
/** Envoltorios de bloque sin semántica propia. */
const BLOCK_WORD = /(^|_)(block|body|statement_list|suite|compound_statement)(_|$)/;

type Problem = Finding;
type Graph = CodeGraph | null;

interface Spine {
  /** Los condicionales, de afuera hacia adentro. */
  readonly nodes: readonly AstNode[];
  /** El cuerpo más interno — el trabajo real. */
  readonly inner: AstNode;
  readonly innerLines: number;
  /** Líneas del condicional MÁS EXTERNO de la espina — lo que la punta de flecha envuelve. */
  readonly spineLines: number;
  readonly bodyLines: number;
  /** Guardas con corte de flujo que la función YA tiene. */
  readonly existingGuards: number;
  /** Ramas de la espina cuya condición compone con Y/O. */
  readonly compound: number;
  readonly fnName: string | null;
  readonly file: string;
  readonly startLine: number;
  readonly endLine: number;
}

/* ── lectura del árbol ───────────────────────────────────────────────────── */

function findEnclosingFunction(file: FileUnit, problem: Problem): FunctionUnit | null {
  const loc = problem.locations[0];
  let best: FunctionUnit | null = null;
  for (const fn of file.functions) {
    if (fn.startLine <= loc.startLine && loc.endLine <= fn.endLine) {
      if (!best || fn.endLine - fn.startLine < best.endLine - best.startLine) best = fn;
    }
  }
  return best;
}

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed) out.push(c);
  }
  return out;
}

/** Sentencias de un bloque, sin comentarios y sin el envoltorio. */
function statementsOf(node: AstNode): AstNode[] {
  let cursor = node;
  // Un `consequence`/`body` puede ser el bloque mismo o envolverlo.
  for (let i = 0; i < 2; i++) {
    const kids = namedChildren(cursor).filter((c) => !COMMENT_WORD.test(c.type));
    if (kids.length === 1 && BLOCK_WORD.test(kids[0]!.type)) cursor = kids[0]!;
    else break;
  }
  return namedChildren(cursor).filter((c) => !COMMENT_WORD.test(c.type));
}

function isIfLike(node: AstNode, sets: DerivedNodeSets): boolean {
  return (
    node.isNamed &&
    sets.chainNodes.has(node.type) &&
    !sets.switchContainerNodes.has(node.type) &&
    !LOOP_WORD.test(node.type) &&
    node.childForFieldName("condition") !== null
  );
}

function consequenceOf(node: AstNode): AstNode | null {
  for (const f of ["consequence", "body"]) {
    const c = node.childForFieldName(f) as AstNode | null;
    if (c) return c;
  }
  return null;
}

function lines(node: AstNode): number {
  return node.endPosition.row - node.startPosition.row + 1;
}

/** ¿La sentencia es una guarda —un condicional cuyo cuerpo entero corta el flujo—? */
function isGuard(node: AstNode, sets: DerivedNodeSets): boolean {
  if (!isIfLike(node, sets)) return false;
  if (node.childForFieldName("alternative")) return false;
  const cons = consequenceOf(node);
  if (!cons) return false;
  // `if (!a) return 0;` SIN llaves: el `consequence` ES la sentencia, no un
  // bloque que la contenga, y `statementsOf` devolvería sus HIJOS (el `0`),
  // no la sentencia. Encontrado por el test de la trampa #3, que emitía
  // cuando tenía que callarse.
  const stmts = esCorteTerminal(cons) ? [cons] : statementsOf(cons);
  return stmts.length >= 1 && stmts.length <= 2 && stmts.every((s) => esCorteTerminal(s));
}

/** Un corte de flujo TERMINAL suelto (`return 0;`, `throw ...`) — la "cola" que una guarda invertida se lleva como valor de retorno. */
function esCorteTerminal(node: AstNode): boolean {
  return FLOW_BREAK_WORD.test(node.type) || hasDirectFlowBreak(node);
}

function hasDirectFlowBreak(node: AstNode): boolean {
  if (FLOW_BREAK_WORD.test(node.type)) return true;
  const kids = namedChildren(node);
  return kids.length === 1 && FLOW_BREAK_WORD.test(kids[0]!.type);
}

/** El cuerpo de la función. */
function bodyOf(fn: FunctionUnit): AstNode | null {
  const declared = fn.node.childForFieldName("body") as AstNode | null;
  if (declared) return declared;
  const kids = namedChildren(fn.node);
  return kids.length > 0 ? kids[kids.length - 1]! : null;
}

/**
 * LA ESPINA. Desde el cuerpo de la función, mientras la ÚLTIMA sentencia del
 * nivel sea un condicional SIN `else`, se baja un peldaño. Que sea la ÚLTIMA
 * es lo que vuelve equivalente el `return` temprano: si después hubiera algo,
 * invertir la guarda cambiaría el comportamiento.
 */
function spineOf(fn: FunctionUnit, sets: DerivedNodeSets, file: string): Spine | null {
  const body = bodyOf(fn);
  if (!body) return null;
  const topStatements = statementsOf(body);
  if (topStatements.length === 0) return null;

  const existingGuards = topStatements.filter((s) => isGuard(s, sets)).length;

  /*
   * EL PELDAÑO, Y LA COLA QUE SÍ SE PERMITE. El condicional de cada nivel
   * tiene que ser el último... o el anteúltimo seguido de UN corte de flujo
   * terminal. Y ese segundo caso no es una concesión: es la forma NORMAL de
   * la punta de flecha —
   *
   *     if (a) { if (b) { if (c) { <trabajo> } } }
   *     return 0;                                   ← la cola
   *
   * — porque el valor que devuelve la guarda invertida (`if (!a) return 0`)
   * es EXACTAMENTE el de esa cola. Sin esto, la primera versión de este
   * archivo exigía que no hubiera NADA después y quedaba muda en TypeScript,
   * Go, Java y C# (los cuatro fixtures con `return 0` al final del cuerpo);
   * Python y Ruby pasaban sólo porque su `return` implícito no escribe una
   * sentencia. Encontrado por `guard-clauses.test.ts`, no por lectura.
   *
   * Lo que sigue prohibido es una cola con TRABAJO (`b.close()`): ahí
   * invertir la guarda saltearía esa línea y el cambio no sería equivalente.
   */
  const nodes: AstNode[] = [];
  let level = topStatements;
  let inner: AstNode | null = null;
  for (;;) {
    let idx = level.length - 1;
    if (idx >= 0 && !isIfLike(level[idx]!, sets) && level.length >= 2 && esCorteTerminal(level[idx]!)) idx -= 1;
    const step = idx >= 0 ? level[idx]! : undefined;
    if (!step || !isIfLike(step, sets)) break;
    if (step.childForFieldName("alternative")) break;
    const cons = consequenceOf(step);
    if (!cons) break;
    nodes.push(step);
    inner = cons;
    level = statementsOf(cons);
    if (level.length === 0) break;
  }
  if (!inner || nodes.length === 0) return null;

  const compound = nodes.filter((n) => {
    const c = n.childForFieldName("condition") as AstNode | null;
    return c !== null && /&&|\|\||\band\b|\bor\b/.test(c.text);
  }).length;

  return {
    nodes,
    inner,
    innerLines: lines(inner),
    spineLines: lines(nodes[0]!),
    bodyLines: lines(body),
    existingGuards,
    compound,
    fnName: fn.name,
    file,
    startLine: nodes[0]!.startPosition.row + 1,
    endLine: nodes[0]!.endPosition.row + 1,
  };
}

/* ── los checks ─────────────────────────────────────────────────────────── */

const SOURCE = "https://refactoring.guru/es/replace-nested-conditional-with-guard-clauses";
const TO_CONFIRM: readonly string[] = [
  "¿alguna condición de la espina tiene efectos (asigna, incrementa, consume un iterador)? Si los tiene, invertirla cambia el comportamiento.",
  "¿el lenguaje permite salir temprano en ESTE punto (no hay un `defer`/`ensure` que dependa de llegar al final)? El análisis mira la forma, no el contrato de la función.",
  "¿el caso del fondo es de verdad el caso principal, o las tres condiciones son igual de importantes? Si lo son, la punta de flecha puede ser la forma correcta.",
];

type Ctx = {
  readonly spine: Spine | null;
  /** El `kind` del hallazgo que disparó — lo compara `ancla-duena`. */
  readonly kind: string;
  /** El ancla DUEÑA de esta punta de flecha, o `null` si no hay función. */
  readonly owner: string | null;
  readonly cognitive: number;
};

const puntaDeFlecha: Check<Ctx, Graph> = {
  id: "punta-de-flecha",
  describe: `hay una espina de al menos ${MIN_DEPTH} condicionales anidados, ninguno con \`else\``,
  run: (c) =>
    !c.spine
      ? { holds: false, evidence: "no se pudo ubicar ninguna espina de condicionales anidados (sin árbol vivo, sin función, o el último statement no es un condicional sin `else`): no demostrado." }
      : { holds: c.spine.nodes.length >= MIN_DEPTH, evidence: `espina de ${c.spine.nodes.length} condicionales anidados sin \`else\`, piso ${MIN_DEPTH}.` },
};

const nadaDespues: Check<Ctx, Graph> = {
  id: "nada-despues-de-la-guarda",
  describe: "cada condicional de la espina es la ÚLTIMA sentencia de su nivel (es lo que vuelve EQUIVALENTE el corte temprano)",
  run: (c) =>
    // `spineOf` sólo baja por la ÚLTIMA sentencia de cada nivel: si construyó
    // una espina, esta condición se cumple por construcción. El check existe
    // igual porque es la condición que decide la CORRECCIÓN de la
    // transformación y tiene que estar escrita en la evidencia que ve el
    // usuario, no sólo en el código.
    !c.spine
      ? { holds: false, evidence: "sin espina: no demostrado." }
      : { holds: true, evidence: `los ${c.spine.nodes.length} condicionales son la última sentencia de su nivel (o la anteúltima, seguida de un corte de flujo suelto que es el valor que devolvería la guarda): invertirlos y cortar temprano no cambia qué se ejecuta.` },
};

const trabajoAlFondo: Check<Ctx, Graph> = {
  id: "trabajo-al-fondo",
  describe: `el cuerpo más interno tiene al menos ${MIN_INNER_LINES} líneas, es al menos la mitad de lo que la punta de flecha envuelve, y la punta de flecha es al menos la mitad de la función (el caso principal está al fondo)`,
  run: (c) => {
    if (!c.spine) return { holds: false, evidence: "sin espina: no demostrado." };
    const dentro = c.spine.spineLines > 0 ? c.spine.innerLines / c.spine.spineLines : 0;
    const deLaFuncion = c.spine.bodyLines > 0 ? c.spine.spineLines / c.spine.bodyLines : 0;
    return {
      holds: c.spine.innerLines >= MIN_INNER_LINES && dentro >= INNER_SHARE && deLaFuncion >= SPINE_SHARE,
      evidence: `el trabajo del fondo son ${c.spine.innerLines} líneas de las ${c.spine.spineLines} que envuelve la punta de flecha (${Math.round(dentro * 100)} %), y la punta de flecha son ${c.spine.spineLines} de las ${c.spine.bodyLines} de la función (${Math.round(deLaFuncion * 100)} %); pisos ${MIN_INNER_LINES} líneas, ${Math.round(INNER_SHARE * 100)} % y ${Math.round(SPINE_SHARE * 100)} %.`,
    };
  },
};

const sinGuardasYaPuestas: Check<Ctx, Graph> = {
  id: "sin-guardas-ya-puestas",
  describe: `la función NO tiene ya ${EXISTING_GUARDS} o más cortes tempranos arriba (si los tiene, el autor ya escribe con guardas y lo que queda anidado es la lógica, no una punta de flecha)`,
  run: (c) =>
    !c.spine
      ? { holds: false, evidence: "sin espina: no demostrado." }
      : {
          holds: c.spine.existingGuards < EXISTING_GUARDS,
          evidence: `${c.spine.existingGuards} guardas con corte temprano ya presentes en el nivel superior de la función, tope ${EXISTING_GUARDS - 1}.`,
        },
};

const espinaProfunda: Check<Ctx, Graph> = {
  id: "espina-profunda",
  describe: `la espina tiene al menos ${DEEP_DEPTH} niveles (medido: en guava son 1 de 1.800 funciones, en cobra 0 de 595)`,
  run: (c) => (!c.spine ? { holds: false, evidence: "sin espina." } : { holds: c.spine.nodes.length >= DEEP_DEPTH, evidence: `${c.spine.nodes.length} niveles (>= ${DEEP_DEPTH} sube un peldaño).` }),
};

const condicionesInvertiblesSolas: Check<Ctx, Graph> = {
  id: "condiciones-invertibles-solas",
  describe: "ninguna condición de la espina compone con Y/O (invertirla es poner una negación, no aplicar De Morgan)",
  run: (c) => (!c.spine ? { holds: false, evidence: "sin espina." } : { holds: c.spine.compound === 0, evidence: `${c.spine.compound}/${c.spine.nodes.length} condiciones compuestas.` }),
};

const cuerpoGrande: Check<Ctx, Graph> = {
  id: "cuerpo-grande",
  describe: "el trabajo del fondo tiene al menos 10 líneas (cuanto más grande, más cuesta el sangrado)",
  run: (c) => (!c.spine ? { holds: false, evidence: "sin espina." } : { holds: c.spine.innerLines >= 10, evidence: `${c.spine.innerLines} líneas al fondo.` }),
};

/* ══════════════════════════════════════════════════════════════════════════
 * EL ANCLA DUEÑA — OLA AS, AS2, y el número que lo obligó
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La primera medición publicó `Ghost
 * ghost/core/core/server/services/milestones/milestones-service.js:206-256
 * #runARRQueries` DOS VECES, con TEXTO IDÉNTICO: una vez colgada del hallazgo
 * de `complexity` y otra del de `long-function`. Una función larga Y compleja
 * dispara las dos anclas de esta hipótesis, y sin desempate la misma punta de
 * flecha sale propuesta una vez por ancla. Es el mismo problema de producto
 * que `lookup-table.ts` y `consolidate-conditional.ts` ya resolvían y que a
 * esta familia le faltaba: 2 de sus 8 propuestas eran este duplicado.
 *
 * La regla NO pregunta "¿qué otras anclas dispararon?" (el vecindario llega
 * vacío en `build()` — ver `hypotheses/run.ts`): lee la MÉTRICA de la función
 * encerrante, que es la misma con la que decide el detector, y aplica una
 * prioridad fija. `complexity` va primero porque su umbral es el que mide la
 * FORMA que esta hipótesis afirma (el anidamiento cuenta doble en la
 * complejidad cognitiva); `long-function` es el dueño sólo cuando la función
 * es larga SIN ser compleja.
 */
function ownerAnchor(fn: FunctionUnit): string {
  return fn.metrics.cognitive >= COMPLEXITY_FLOOR ? "complexity" : "long-function";
}

/** El piso REAL de `detect/intra-function/complexity.ts`: `citado(15, SonarSource S3776)`. */
const COMPLEXITY_FLOOR = 15;

const anclaDuena: Check<Ctx, Graph> = {
  id: "ancla-duena",
  describe: "este hallazgo es el ancla DUEÑA de esta punta de flecha (una función larga Y compleja dispara las dos anclas; sin esto la misma propuesta sale dos veces)",
  run: (c) =>
    c.owner === null
      ? { holds: false, evidence: "no se pudo ubicar la función encerrante: no demostrado." }
      : {
          holds: c.owner === c.kind,
          evidence: `dueño "${c.owner}" (complejidad cognitiva ${c.cognitive}, piso ${COMPLEXITY_FLOOR}); este hallazgo es "${c.kind}".`,
        },
};

/** SIEMPRE `"ausente"` — ver la trampa #2 en el docstring del módulo. */
function appliedState(c: Ctx): AppliedStateResult {
  return {
    state: "ausente",
    checks: [
      {
        label: "la función no usa ya guardas",
        passed: true,
        why: c.spine
          ? `${c.spine.existingGuards} cortes tempranos en el nivel superior (el required "sin-guardas-ya-puestas" devuelve silencio a partir de ${EXISTING_GUARDS}).`
          : "sin espina.",
      },
    ],
  };
}

function buildSpec(): HypothesisSpec<Ctx, Graph> {
  return {
    pattern: "Guard Clauses",
    ceiling: "alta",
    needs: [],
    // `ancla-duena` va ÚLTIMO a propósito: el motor exige que TODOS pasen, así
    // que el orden no cambia el resultado, pero sí cambia DÓNDE muere el
    // embudo — y muerto en un desempate no dice nada sobre la forma.
    required: [puntaDeFlecha, nadaDespues, trabajoAlFondo, sinGuardasYaPuestas, anclaDuena],
    discriminators: [espinaProfunda, condicionesInvertiblesSolas, cuerpoGrande],
    appliedState: (c) => appliedState(c),
    toConfirm: TO_CONFIRM,
    source: SOURCE,
  };
}

/* ── la traza ───────────────────────────────────────────────────────────── */

export interface GuardClausesTraceEntry {
  readonly findingId: string;
  readonly kind: string;
  readonly file: string;
  readonly line: number;
  readonly symbol: string;
  readonly withFile: boolean;
  readonly depth: number;
  readonly innerLines: number;
  /** Líneas del condicional MÁS EXTERNO de la espina — lo que la punta de flecha envuelve. */
  readonly spineLines: number;
  readonly bodyLines: number;
  readonly existingGuards: number;
  readonly checks: readonly { readonly id: string; readonly holds: boolean }[];
  readonly diesAt: string | null;
  readonly emitted: boolean;
}

let trace: GuardClausesTraceEntry[] | null = null;
export function startGuardClausesTrace(): void {
  trace = [];
}
export function takeGuardClausesTrace(): readonly GuardClausesTraceEntry[] {
  const t = trace ?? [];
  trace = null;
  return t;
}

function placesOf(spine: Spine): readonly RoleLocation[] {
  return [
    {
      file: spine.file,
      startLine: spine.startLine,
      endLine: spine.endLine,
      symbol: spine.fnName ?? undefined,
      role: `punta de flecha de ${spine.nodes.length} niveles; el trabajo real (${spine.innerLines} líneas) está al fondo`,
    },
  ];
}

export const hypothesis: HypothesisBuilder = {
  id: "guard-clauses",
  pattern: "Guard Clauses",
  layer: "refactorizacion",
  anchors: ["complexity", "long-function"],
  build(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
    const fn = ctx.file ? findEnclosingFunction(ctx.file, problem) : null;
    const spine = fn && ctx.file ? spineOf(fn, ctx.setsFor(ctx.file.language), ctx.file.path) : null;
    const c: Ctx = {
      spine,
      kind: problem.kind,
      owner: fn ? ownerAnchor(fn) : null,
      cognitive: fn?.metrics.cognitive ?? 0,
    };
    const spec = buildSpec();
    const outcome = runEngine(spec, ctx.capabilities, c, graph);
    if (trace) {
      const checks = spec.required.map((k) => ({ id: k.id, holds: k.run(c, graph).holds }));
      trace.push({
        findingId: problem.id,
        kind: problem.kind,
        file: problem.locations[0]?.file ?? "",
        line: problem.locations[0]?.startLine ?? 0,
        symbol: problem.locations[0]?.symbol ?? "",
        withFile: ctx.file !== null,
        depth: spine?.nodes.length ?? 0,
        innerLines: spine?.innerLines ?? 0,
        spineLines: spine?.spineLines ?? 0,
        bodyLines: spine?.bodyLines ?? 0,
        existingGuards: spine?.existingGuards ?? 0,
        checks,
        diesAt: checks.find((k) => !k.holds)?.id ?? null,
        emitted: outcome !== null,
      });
    }
    if (!outcome || !spine) return null;
    return toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places: placesOf(spine),
      cost:
        "Una reescritura mecánica dentro de la misma función: cada condición de la espina pasa a ser un corte temprano " +
        `(\`if (!cond) return\`) y el cuerpo del fondo sube ${spine.nodes.length} niveles de sangrado. No cambia ninguna firma ` +
        "ni mueve nada de lugar; el riesgo está en las condiciones con efectos, que hay que leer una por una.",
    });
  },
};
