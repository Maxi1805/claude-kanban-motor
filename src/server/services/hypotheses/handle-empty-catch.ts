/**
 * `Handle Empty Catch` — OLA AS, frente AS5. La ÚNICA familia de la ola cuyo
 * remedio arregla un ERROR REAL y no deuda de diseño: un manejador de
 * excepción vacío se traga una falla y el programa sigue como si nada.
 *
 * ── POR QUÉ ESTA FAMILIA PUEDE MEDIRSE Y UN PATRÓN DE DISEÑO NO ────────────
 * La regla que la Ola AR dejó escrita (AR4 §5): una familia rinde cuando su
 * PRECONDICIÓN ES UN HECHO DEL CÓDIGO, verificable abriendo el archivo, y no
 * una opinión sobre el futuro. Acá la precondición es
 * "este manejador no tiene NINGUNA sentencia adentro" — se confirma mirando
 * el árbol, y dos lectores no pueden discrepar sobre eso. Es la misma clase
 * de precondición que sostiene `Extract Method` (73,6 %) y la contraria a la
 * de `Strategy` ("acá convendría una familia de clases", 27,6 %).
 *
 * ── QUÉ AGREGA SOBRE SU ANCLA, QUE YA ES BUENA ─────────────────────────────
 * `detect/intra-function/empty-catch.ts` ya excluye tres cosas y las tiene
 * medidas: el manejador con un comentario adentro (en toda gramática donde el
 * comentario es hijo nombrado del cuerpo), el `rescue` de Ruby cuyo único
 * contenido es un comentario, y el arnés de test descubierto por nombre
 * (`primitivas/n10-no-es-producto.ts`). Su propio docstring deja escrito lo
 * que NO pudo excluir, con los casos contados: el "idioma de detección de
 * capacidad" (`lodash.js:1523`, `preact/src/diff/props.js:126`,
 * `hugo/livereload.js:3501`, 3 de 14 falsos juzgados), donde el bloque
 * protegido TERMINA cortando el flujo y el manejador vacío es la rama de
 * fallback. Ese excluder no se pudo escribir en el detector por una razón
 * concreta y citada ahí: exige mirar el HERMANO/PADRE del nodo `try`, y
 * `ProbeNode` no expone `.parent()`.
 *
 * **Una hipótesis SÍ puede mirarlo**, y ahí está el aporte de este archivo:
 * `ctx.file` trae el árbol VIVO del archivo entero (no sólo el subárbol de la
 * función), así que el contenedor del manejador se ubica por RANGO —el nodo
 * nombrado más chico que lo contiene estrictamente— sin necesidad de
 * `.parent()`. Con el contenedor a la vista se pueden contestar tres
 * preguntas que el detector no podía:
 *
 *   1. ¿Hay de verdad un BLOQUE PROTEGIDO, y este manejador NO lo contiene?
 *      (`required`) — separa un `catch`/`rescue`/`except` real de las OTRAS
 *      construcciones que la gramática mete en `exceptionNodes` por compartir
 *      la palabra del `EXCEPTION_WORD` de `code-grammar.ts`
 *      (`/(^|_)(rescue|except|catch|with|using)(_|$)/`): en C# `using_statement`
 *      y en Python `with_statement` entran a ese conjunto y su cuerpo vacío
 *      NO es una excepción tragada — es un bloque de recurso sin cuerpo.
 *   2. ¿El bloque protegido TERMINA cortando el flujo? (`required`) — el
 *      idioma de detección de capacidad que el detector dejó documentado
 *      como no-excluible.
 *   3. ¿Otro manejador SOBRE EL MISMO bloque protegido sí actúa?
 *      (`appliedState` ⇒ `ya-aplicado`) — la falla YA se reporta, este
 *      `catch` es una rama angosta ignorada a propósito. Es la lección de la
 *      Ola AP citada en el encargo de esta ola: "en SIETE de 21 casos la
 *      solución YA EXISTÍA en el código y el analizador no la vio";
 *      `appliedState` tiene que mirar dónde vive la solución, no sólo el
 *      alcance del ancla.
 *
 * ── DÓNDE ANDA Y DÓNDE NO — límites HEREDADOS del ancla, no propios ────────
 * El ancla no puede ver un `except` de Python (su `except_clause` no resuelve
 * NINGÚN campo de cuerpo — límite declarado en `empty-catch.ts`) y Go no
 * tiene ninguna construcción que caiga en `EXCEPTION_WORD`. Esta familia
 * hereda los dos silencios sin poder arreglarlos: son del detector, no de
 * acá. Queda viva donde el ancla ve: JS/TS/Vue, Java, C# y Ruby.
 *
 * ── NADA HARDCODEADO POR LENGUAJE ──────────────────────────────────────────
 * Cero listas de tipos de nodo por lenguaje. Los conjuntos salen de
 * `ctx.setsFor(language)` (`exceptionNodes`, `functionNodes`) y la única
 * superficie de vocabulario es `JUMP_WORD`, una regex GENÉRICA sobre el TIPO
 * de nodo aplicada IDÉNTICAMENTE a las nueve gramáticas — copia literal del
 * criterio que `detect/intra-function/unreachable-code.ts` ya usa y
 * justifica, y del estilo de `LOOP_WORD`/`EXCEPTION_WORD`/`SWITCH_WORD` de
 * `code-grammar.ts`. El precedente que esto evita está en el encargo de la
 * ola: `SELF_PREFIX = /^(?:self\.|this\.|@)/` en `state.ts` dejó a Go mudo
 * durante varias olas.
 */
import { walkTree } from "../detect/tree-walk.js";
import { build as runEngine, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { AstNode, Finding, FileUnit } from "../detect/types.js";
import type { CodeGraph } from "../graph/types.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisDraft } from "./types.js";

const ANCHOR_KIND = "empty-catch";
const SOURCE = "https://refactoring.guru/es/smells/dead-code";

/**
 * Salto de control — regex GENÉRICA sobre el TIPO de nodo, nunca su texto,
 * aplicada IDÉNTICAMENTE a las nueve gramáticas. Es la MISMA que
 * `unreachable-code.ts` usa y documenta (`return_statement`, `throw_statement`,
 * `raise_statement`, `break_statement`, `continue_statement`, `return`…); se
 * repite acá en vez de importarse porque ese módulo la tiene privada y esta
 * ola no toca `detect/**`.
 */
const JUMP_WORD = /(^|_)(return|throw|raise|break|continue|goto)(_|$)/;

/** Toda forma de asignación de las nueve gramáticas — misma regex genérica que
 *  usa el ancla de `Separate Query from Modifier`. */
const ASSIGNMENT_NODE_WORD = /(^|_)assignment(_|$)/;


/** Un nodo con su rango en líneas 1-based — lo único que hace falta para ubicar contenedores sin `.parent()`. */
interface Ranged {
  node: AstNode;
  start: number;
  end: number;
}

interface EmptyCatchShape {
  /** `false` ⇒ ningún check puede confirmarse: sin árbol no se afirma nada. */
  readonly treeAvailable: boolean;
  /** El manejador del hallazgo, ubicado en el árbol por rango exacto. */
  readonly handlerFound: boolean;
  /** Tipo de nodo del manejador — se publica en la evidencia para poder auditar qué gramática produjo cada caso. */
  readonly handlerType: string;
  /** Sigue vacío mirado desde acá (re-verificación del ancla con el árbol vivo). */
  readonly handlerEmpty: boolean;
  /** Sentencias reales protegidas por el bloque al que este manejador responde. `-1` = no se ubicó el bloque. */
  readonly protectedStatements: number;
  /** La última sentencia del bloque protegido corta el flujo (`return`/`throw`/`break`/…). */
  readonly protectedEndsInJump: boolean;
  /**
   * Hay un salto de control EN CUALQUIER PARTE del bloque protegido, no sólo
   * al final. OLA AS, medido: el idioma dominante de los falsos de esta
   * familia es *"probá el camino feliz; si falla, caé al valor por defecto"*,
   * y en JS/TS el camino feliz sale con un `return` metido DENTRO de un `if`,
   * así que la última sentencia protegida es el `if` y no el salto. Con el
   * salto adentro, lo que viene después del manejador ES la rama de fallo:
   * la falla no se traga, se absorbe. Casos medidos:
   * `excalidraw/packages/element/src/elementLink.ts:101` (`return id` dentro
   * del `if`, `return null` después) y
   * `excalidraw/packages/excalidraw/clipboard.ts:552` (idéntico).
   */
  readonly protectedContainsJump: boolean;
  /** El manejador liga la excepción a un nombre (y aun así la descarta). */
  readonly bindsName: boolean;
  /** Hay OTRO manejador sobre el MISMO bloque protegido que sí hace algo. */
  readonly siblingOverSameBlockActs: boolean;
  /** Hay otro manejador NO vacío en la misma función, sobre otro bloque. */
  readonly otherHandlerInFunctionActs: boolean;
  /**
   * Después del manejador se LEE un nombre que el bloque protegido escribe:
   * el fallo SÍ se observa. OLA AS — este chequeo nació mirando sólo la
   * CONDICIÓN de una rama posterior (`if (unmasked)`), y así se le escapaban
   * los dos casos en que el nombre se lee sin preguntar por él, que son
   * mayoría: `lodash/perf/perf.js:47` (`result` se asigna dentro del `try` y
   * se devuelve al final) y
   * `excalidraw/packages/common/src/utils.ts:1173` (`featureFlags` se asigna
   * dentro y se lee en el `return` de abajo). En los dos, la escritura que no
   * ocurrió deja el valor ANTERIOR, que es exactamente el manejo de la falla.
   * Ahora cuenta CUALQUIER lectura posterior dentro de la función.
   */
  readonly failureObservedAfter: boolean;
  /** El nombre por el que se pregunta, para la evidencia. */
  readonly observedName: string;
}

const UNKNOWN_SHAPE: EmptyCatchShape = {
  treeAvailable: false,
  handlerFound: false,
  handlerType: "",
  handlerEmpty: false,
  protectedStatements: -1,
  protectedEndsInJump: false,
  protectedContainsJump: false,
  bindsName: false,
  siblingOverSameBlockActs: false,
  otherHandlerInFunctionActs: false,
  failureObservedAfter: false,
  observedName: "",
};

interface EmptyCatchProblem {
  readonly finding: Finding;
  readonly shape: EmptyCatchShape;
}

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i) as AstNode | null;
    if (child && child.isNamed) out.push(child);
  }
  return out;
}

function lineOf(node: AstNode): { start: number; end: number } {
  return { start: node.startPosition.row + 1, end: node.endPosition.row + 1 };
}

/** Contenido REAL de un manejador: hijos nombrados de su cuerpo, o —cuando el
 *  cuerpo no resuelve, la forma de Ruby— hijos nombrados propios que no sean
 *  los campos declarativos (tipo de excepción, variable ligada). Mismo
 *  criterio, por FORMA, que `empty-catch.ts#isEmptyHandler`. */
function handlerContentCount(handler: AstNode): number {
  const body = handler.childForFieldName("body") as AstNode | null;
  if (body) return namedChildren(body).length;
  let declarative = 0;
  for (const field of ["exceptions", "variable"]) {
    if (handler.childForFieldName(field) !== null) declarative++;
  }
  return Math.max(0, namedChildren(handler).length - declarative);
}

function bindsExceptionName(handler: AstNode): boolean {
  if (handler.childForFieldName("variable") !== null) return true;
  const body = handler.childForFieldName("body") as AstNode | null;
  // Fuera del cuerpo, cualquier hijo nombrado que no sea el cuerpo mismo es
  // la declaración de la captura (`catch (e)`, `catch (IOException e)`,
  // `rescue X => e`): si no hay ninguno, el manejador atrapa sin conservar nada.
  return namedChildren(handler).some((c) => !body || !sameNode(c, body));
}

/** El manejador del hallazgo: nodo de `exceptionNodes` cuyo rango coincide con
 *  el que reportó el detector. Nunca adivina: si ninguno coincide exacto, se
 *  acepta el MÁS CHICO que empiece en la misma línea, y si tampoco hay,
 *  `null`. */
function locateHandler(file: FileUnit, finding: Finding, exceptionNodes: ReadonlySet<string>): AstNode | null {
  const { startLine, endLine } = finding.locations[0];
  let exact: AstNode | null = null;
  let sameStart: AstNode | null = null;
  walkTree(file.root, (raw) => {
    const node = raw as AstNode;
    if (!node.isNamed || !exceptionNodes.has(node.type)) return;
    const { start, end } = lineOf(node);
    if (start === startLine && end === endLine) {
      if (!exact) exact = node;
      return;
    }
    if (start !== startLine) return;
    if (!sameStart || end < lineOf(sameStart).end) sameStart = node;
  });
  return exact ?? sameStart;
}

/* ── UBICACIÓN DEL CONTENEDOR, SIN `.parent()` ─────────────────────────────
 *
 * `ProbeNode` no expone padre ni hermanos (`code-grammar.ts:153-159`) —
 * exactamente el límite que `empty-catch.ts` cita para explicar por qué NO
 * pudo escribir el excluder del idioma de detección de capacidad desde el
 * detector. `ancestorsOf` desciende SÓLO por los hijos cuyo rango contiene al
 * objetivo: devuelve la cadena de ancestros exacta en O(profundidad), sin
 * recorrer el árbol entero, así que no es un recorrido alternativo al de
 * `tree-walk.ts` (que se sigue usando acá para todo lo que sí es "recorrer
 * entero"). La contención se decide por (fila, columna), NUNCA sólo por
 * línea: un `try { f() } catch (e) {}` de una sola línea rompería cualquier
 * comparación por línea. */

function before(aRow: number, aCol: number, bRow: number, bCol: number): boolean {
  return aRow < bRow || (aRow === bRow && aCol <= bCol);
}

/**
 * IDENTIDAD POR POSICIÓN, no por referencia — `AstNode.child(i)` puede
 * devolver un objeto NUEVO en cada llamada (`web-tree-sitter` no garantiza
 * identidad estable), así que `===` entre dos vistas del mismo nodo del árbol
 * es `false`. El mismo helper, por el mismo motivo, vive en
 * `composite.ts#sameNode` desde la Ola AC.
 */
function sameNode(a: AstNode, b: AstNode): boolean {
  return (
    a.type === b.type &&
    a.startPosition.row === b.startPosition.row &&
    a.startPosition.column === b.startPosition.column &&
    a.endPosition.row === b.endPosition.row &&
    a.endPosition.column === b.endPosition.column
  );
}

function contains(outer: AstNode, inner: AstNode): boolean {
  return (
    before(outer.startPosition.row, outer.startPosition.column, inner.startPosition.row, inner.startPosition.column) &&
    before(inner.endPosition.row, inner.endPosition.column, outer.endPosition.row, outer.endPosition.column)
  );
}

function ancestorsOf(root: AstNode, target: AstNode): AstNode[] {
  const chain: AstNode[] = [];
  let current: AstNode = root;
  for (;;) {
    if (sameNode(current, target)) return chain;
    let next: AstNode | null = null;
    for (let i = 0; i < current.childCount; i++) {
      const child = current.child(i) as AstNode | null;
      if (!child) continue;
      if (sameNode(child, target) || contains(child, target)) {
        next = child;
        break;
      }
    }
    if (!next) return chain;
    chain.push(current);
    current = next;
  }
}

/** El ancestro NOMBRADO más cercano del manejador — el reemplazo exacto de
 *  `.parent()` que la gramática no ofrece. */
function nearestNamedContainer(file: FileUnit, target: AstNode): AstNode | null {
  const chain = ancestorsOf(file.root, target);
  for (let i = chain.length - 1; i >= 0; i--) {
    const candidate = chain[i]!;
    if (candidate.isNamed) return candidate;
  }
  return null;
}

/**
 * El BLOQUE PROTEGIDO al que responde este manejador, y sus hermanos.
 *
 * Dos formas confirmadas por sonda directa contra las gramáticas reales
 * (`scratchpad-as5/probe-catch.mts`, volcado en el informe AS5):
 *   - El contenedor resuelve un campo `body` que NO es el manejador ni lo
 *     contiene: es el `try_statement` de JS/TS (`[body, handler]`), Java y C#
 *     (`[body]`, con el `catch_clause` de hermano). El bloque protegido son
 *     los hijos nombrados de ese `body`.
 *   - El contenedor no resuelve `body`, o su `body` contiene al manejador: es
 *     la forma de Ruby, donde el `rescue` es HERMANO de las sentencias
 *     protegidas dentro de un `begin`/`body_statement`. El bloque protegido
 *     son los hijos nombrados del contenedor que TERMINAN antes de que el
 *     manejador empiece.
 *
 * Devuelve `null` cuando no hay nada protegido que ubicar — que es
 * exactamente el caso de `using_statement` (C#) / `with_statement` (Python):
 * ahí el nodo de `exceptionNodes` es el DUEÑO del bloque, no su manejador.
 */
function locateProtectedBlock(
  file: FileUnit,
  handler: AstNode,
): { statements: readonly AstNode[]; siblings: readonly AstNode[] } | null {
  const container = nearestNamedContainer(file, handler);
  if (!container) return null;
  const containerChildren = namedChildren(container);

  const body = container.childForFieldName("body") as AstNode | null;
  if (body && !sameNode(body, handler)) {
    const containsHandler = contains(body, handler);
    if (!containsHandler) {
      return {
        statements: namedChildren(body),
        siblings: containerChildren.filter((c) => !sameNode(c, handler) && !sameNode(c, body)),
      };
    }
  }

  const preceding = containerChildren.filter(
    (c) =>
      !sameNode(c, handler) &&
      before(c.endPosition.row, c.endPosition.column, handler.startPosition.row, handler.startPosition.column),
  );
  if (preceding.length === 0) return null;
  return {
    statements: preceding,
    siblings: containerChildren.filter((c) => !sameNode(c, handler) && !preceding.some((p) => sameNode(p, c))),
  };
}

/** La función (del `FileUnit` ya parseado) que contiene al manejador — para
 *  buscar hermanos fuera del mismo `try`. */
function enclosingFunctionNode(file: FileUnit, handler: AstNode): AstNode | null {
  const h = lineOf(handler);
  let best: AstNode | null = null;
  let bestSpan = Number.POSITIVE_INFINITY;
  for (const fn of file.functions) {
    if (fn.startLine > h.start || fn.endLine < h.end) continue;
    const span = fn.endLine - fn.startLine;
    if (span < bestSpan) {
      best = fn.node;
      bestSpan = span;
    }
  }
  return best;
}

/**
 * LOS NOMBRES QUE EL BLOQUE PROTEGIDO ESCRIBE — destino de una asignación o
 * nombre de una declaración. Se recogen para poder contestar la pregunta que
 * de verdad separa una falla tragada de una falla ABSORBIDA: ¿alguien mira
 * después si esa escritura ocurrió?
 */
function namesWrittenIn(statements: readonly AstNode[]): Set<string> {
  const names = new Set<string>();
  for (const statement of statements) {
    walkTree(statement, (raw) => {
      const node = raw as AstNode;
      if (!node.isNamed) return;
      if (ASSIGNMENT_NODE_WORD.test(node.type)) {
        const target = (node.childForFieldName("left") ?? node.childForFieldName("target")) as AstNode | null;
        if (target) names.add(target.text.replace(/\s+/g, ""));
        return;
      }
      const nameNode = node.childForFieldName("name") as AstNode | null;
      if (nameNode) names.add(nameNode.text.replace(/\s+/g, ""));
    });
  }
  return names;
}

function analyzeShape(finding: Finding, ctx: HypothesisContext): EmptyCatchShape {
  const file = ctx.file;
  if (!file) return UNKNOWN_SHAPE;
  const sets = ctx.setsFor(file.language);
  const handler = locateHandler(file, finding, sets.exceptionNodes);
  if (!handler) return { ...UNKNOWN_SHAPE, treeAvailable: true };

  const protectedBlock = locateProtectedBlock(file, handler);
  const statements = protectedBlock?.statements ?? [];
  const last = statements.length > 0 ? statements[statements.length - 1]! : null;

  // EL SALTO EN CUALQUIER PARTE DEL BLOQUE PROTEGIDO — ver el docstring de
  // `protectedContainsJump`. Se recorre el bloque entero, no sólo su última
  // sentencia, porque el `return` del camino feliz vive dentro de un `if`.
  let protectedContainsJump = false;
  for (const statement of statements) {
    walkTree(statement, (raw) => {
      const node = raw as AstNode;
      if (node.isNamed && JUMP_WORD.test(node.type)) protectedContainsJump = true;
    });
  }

  const siblingHandlers = (protectedBlock?.siblings ?? []).filter((s) => sets.exceptionNodes.has(s.type));
  const siblingOverSameBlockActs = siblingHandlers.some((s) => handlerContentCount(s) > 0);

  let otherHandlerInFunctionActs = false;
  let failureObservedAfter = false;
  let observedName = "";
  const written = namesWrittenIn(statements);
  const fnNode = enclosingFunctionNode(file, handler);
  if (fnNode) {
    walkTree(fnNode, (raw) => {
      const node = raw as AstNode;
      if (!node.isNamed) return;
      if (!sameNode(node, handler) && sets.exceptionNodes.has(node.type) && handlerContentCount(node) > 0) {
        otherHandlerInFunctionActs = true;
      }
      // EL FALLO ABSORBIDO, NO TRAGADO — el idioma que `empty-catch.ts` dejó
      // documentado como no-excluible desde un detector, en su forma de
      // BANDERA (la de salto ya la ataja `elFlujoSigueDespuesDelFallo`). Si
      // DESPUÉS del manejador una rama pregunta por un nombre que el bloque
      // protegido escribe, la falla NO desaparece: el `if` de abajo es su
      // manejo. Los dos casos que este chequeo ataja están medidos en esta
      // ola: `lodash/lodash.js:6086` (`var unmasked = true;` dentro del
      // `try`, `if (unmasked)` justo después) y
      // `hugo/livereload/livereload.js:3377` (`rules = …cssRules;` dentro,
      // `if (!rules) return;` justo después).
      // CUALQUIER LECTURA POSTERIOR, no sólo la condición de una rama — ver el
      // docstring de `failureObservedAfter`. Y la lectura se reconoce POR HOJA
      // del árbol, NO por tipo de nodo: buscar `identifier` deja muda a toda
      // gramática que le da tipo propio a un token, y así se escapaba
      // `redmine/app/controllers/activities_controller.rb:29`,
      // donde lo que el `begin` escribe es `@date_to` (nodo
      // `instance_variable` de Ruby) y la línea de abajo, `@date_to ||=
      // User.current.today + 1`, ES el manejo de la falla.
      if (node.childCount !== 0) return;
      if (!before(handler.endPosition.row, handler.endPosition.column, node.startPosition.row, node.startPosition.column)) return;
      const name = node.text.replace(/\s+/g, "");
      if (name.length > 0 && written.has(name)) {
        failureObservedAfter = true;
        observedName = name;
      }
    });
  }

  return {
    treeAvailable: true,
    handlerFound: true,
    handlerType: handler.type,
    handlerEmpty: handlerContentCount(handler) === 0,
    protectedStatements: protectedBlock ? statements.length : -1,
    protectedEndsInJump: last ? JUMP_WORD.test(last.type) : false,
    protectedContainsJump,
    bindsName: bindsExceptionName(handler),
    siblingOverSameBlockActs,
    otherHandlerInFunctionActs,
    failureObservedAfter,
    observedName,
  };
}

/* ── LOS CHECKS ─────────────────────────────────────────────────────────── */

/**
 * `required` #1. Re-verifica con el árbol vivo lo que el ancla afirmó: el
 * manejador existe donde dice y no tiene NINGUNA sentencia adentro. Sin árbol
 * NO aprueba — un `required` que pasa por no haber podido mirar es decoración
 * (`no-permissive-required.test.ts`, caso testigo `strategy.ts#distinctBehaviorCheck`).
 */
const manejadorVacio: Check<EmptyCatchProblem, CodeGraph | null> = {
  id: "manejador-vacio-en-el-arbol",
  describe: "El manejador de excepción no tiene ninguna sentencia adentro, verificado sobre el árbol del archivo",
  run(problem) {
    const s = problem.shape;
    if (!s.treeAvailable) return { holds: false, evidence: "el árbol del archivo no está vivo en esta corrida: nada que verificar." };
    if (!s.handlerFound) {
      return { holds: false, evidence: `ningún nodo de manejo de excepción del árbol coincide con las líneas ${problem.finding.locations[0].startLine}-${problem.finding.locations[0].endLine} del hallazgo.` };
    }
    if (!s.handlerEmpty) return { holds: false, evidence: `el nodo "${s.handlerType}" tiene contenido mirado desde el árbol vivo.` };
    return { holds: true, evidence: `el nodo "${s.handlerType}" no tiene ningún hijo con contenido: la excepción se descarta sin registro, sin relanzamiento y sin acción.` };
  },
};

/**
 * `required` #2 — LA COMPUERTA DE FORMA. Un `catch`/`rescue`/`except`
 * responde a un bloque protegido que está AFUERA suyo. Un `using` de C# o un
 * `with` de Python —que la regex `EXCEPTION_WORD` de `code-grammar.ts` mete
 * en el mismo conjunto por compartir la palabra— es el DUEÑO de su bloque:
 * su cuerpo vacío no es una falla tragada. Sin bloque protegido ubicable no
 * hay excepción que se esté tragando, y esta familia se calla.
 */
const hayBloqueProtegido: Check<EmptyCatchProblem, CodeGraph | null> = {
  id: "hay-bloque-protegido-afuera-del-manejador",
  describe: "Existe un bloque de código protegido que este manejador NO contiene: es un manejador, no un bloque de recurso",
  run(problem) {
    const s = problem.shape;
    if (s.protectedStatements < 0) {
      return { holds: false, evidence: `no hay ningún bloque de sentencias fuera de "${s.handlerType}" al que este nodo responda: es el dueño de su propio cuerpo (bloque de recurso), no el manejador de una falla ajena.` };
    }
    if (s.protectedStatements === 0) {
      return { holds: false, evidence: "el bloque protegido no tiene ninguna sentencia: no hay operación que pueda fallar." };
    }
    return { holds: true, evidence: `${s.protectedStatements} sentencia(s) protegidas fuera del manejador: si alguna falla, el fallo desaparece acá.` };
  },
};

/**
 * `required` #3 — EL IDIOMA DE DETECCIÓN DE CAPACIDAD, el excluder que
 * `empty-catch.ts` dejó escrito como no-implementable desde un detector.
 * Cuando el bloque protegido TERMINA cortando el flujo, el manejador vacío no
 * traga nada: es la rama alternativa de una prueba ("probá esto; si no anda,
 * seguí por acá"). Los tres casos que el detector nombra —`lodash.js:1523`,
 * `preact/src/diff/props.js:126`, `hugo/livereload.js:3501`— son de esa forma.
 */
const elFlujoSigueDespuesDelFallo: Check<EmptyCatchProblem, CodeGraph | null> = {
  id: "el-flujo-continua-despues-del-fallo",
  describe: "El bloque protegido no corta el flujo en ninguna parte: si falla, el programa sigue como si hubiera funcionado",
  run(problem) {
    const s = problem.shape;
    if (s.protectedEndsInJump) {
      return { holds: false, evidence: "la última sentencia protegida corta el flujo: el manejador vacío es la rama alternativa de una prueba, no una falla tragada." };
    }
    if (s.protectedContainsJump) {
      return { holds: false, evidence: "el camino feliz sale del bloque protegido con un salto de control: lo que viene después del manejador ES la rama de fallo, así que la falla se absorbe, no se traga." };
    }
    return { holds: true, evidence: "el bloque protegido no termina en un salto de control: tras la falla el programa continúa con datos que nunca se produjeron." };
  },
};

/* ── DISCRIMINADORES ────────────────────────────────────────────────────── */

/**
 * `required` #4 — EL FALLO ABSORBIDO EN SU FORMA DE BANDERA. Ver el bloque
 * comentado dentro de `analyzeShape` para los dos casos medidos que ataja.
 */
const elFalloNoSeObservaDespues: Check<EmptyCatchProblem, CodeGraph | null> = {
  id: "el-fallo-no-se-observa-despues",
  describe: "Después del manejador nadie lee lo que el bloque protegido debía dejar escrito",
  run(problem) {
    const s = problem.shape;
    return s.failureObservedAfter
      ? { holds: false, evidence: `algo posterior lee "${s.observedName}", que es lo que el bloque protegido escribe: la escritura que no ocurrió deja el valor anterior, y ESO es el manejo de la falla.` }
      : { holds: true, evidence: "nada posterior de la función lee lo que el bloque protegido debía dejar escrito: el fallo no deja rastro en ninguna parte." };
  },
};

const variasOperacionesProtegidas: Check<EmptyCatchProblem, CodeGraph | null> = {
  id: "varias-operaciones-protegidas",
  describe: "El bloque protegido tiene más de una operación: ni siquiera se sabe cuál falló",
  run(problem) {
    const n = problem.shape.protectedStatements;
    return n >= 2
      ? { holds: true, evidence: `${n} sentencias bajo el mismo manejador: el silencio cubre a todas por igual.` }
      : { holds: false, evidence: `${Math.max(n, 0)} sentencia(s) protegidas: el alcance del silencio es acotado.` };
  },
};

const atrapaSinConservar: Check<EmptyCatchProblem, CodeGraph | null> = {
  id: "atrapa-sin-conservar-la-excepcion",
  describe: "El manejador ni siquiera liga la excepción a un nombre: no queda nada que registrar",
  run(problem) {
    return problem.shape.bindsName
      ? { holds: false, evidence: "el manejador liga la excepción a un nombre y aun así no la usa; registrarla es una línea." }
      : { holds: true, evidence: "el manejador no conserva la excepción: el dato del fallo se pierde en el propio acto de capturarlo." };
  },
};

const laFuncionYaSabeManejar: Check<EmptyCatchProblem, CodeGraph | null> = {
  id: "la-funcion-ya-maneja-en-otro-lado",
  describe: "Otro manejador de la misma función sí actúa sobre su excepción: éste queda como olvido, no como política",
  run(problem) {
    return problem.shape.otherHandlerInFunctionActs
      ? { holds: true, evidence: "la misma función tiene otro manejador que sí hace algo con su excepción: el silencio de éste no es el criterio del autor." }
      : { holds: false, evidence: "ningún otro manejador de la función actúa sobre su excepción: puede ser una política deliberada del archivo." };
  },
};

/**
 * `appliedState` — DÓNDE VIVE LA SOLUCIÓN, no dónde está el ancla (la lección
 * que el encargo de la ola cita: en 7 de 21 casos en disputa de la Ola AP la
 * solución YA EXISTÍA en otro lado y el analizador no la vio). Para esta
 * familia la solución vive en un HERMANO: si otro manejador sobre el MISMO
 * bloque protegido sí registra/relanza, la falla ya se reporta y este `catch`
 * es una rama angosta ignorada a propósito.
 */
function appliedState(problem: EmptyCatchProblem): AppliedStateResult {
  const s = problem.shape;
  if (s.siblingOverSameBlockActs) {
    return {
      state: "ya-aplicado",
      checks: [
        {
          label: "El mismo bloque protegido ya tiene un manejador que actúa",
          passed: true,
          why: "otro manejador sobre las mismas sentencias protegidas registra o relanza la excepción: la falla no queda muda, esta cláusula es una rama angosta ignorada a propósito.",
        },
      ],
    };
  }
  return {
    state: "ausente",
    checks: [
      {
        label: "Ningún manejador sobre el mismo bloque protegido actúa sobre la excepción",
        passed: false,
        why: "se buscó, sobre las mismas sentencias protegidas, otro manejador con contenido; no hay ninguno, así que no existe ninguna vía por la que este fallo se reporte.",
      },
    ],
  };
}

const TO_CONFIRM: readonly string[] = [
  "Si el fallo es esperable y no debe interrumpir: registrarlo (log) con el contexto suficiente para diagnosticarlo después.",
  "Si el fallo no es esperable: relanzarlo, o envolverlo en una excepción propia con más contexto.",
  "Si de verdad se ignora a propósito: dejar escrito adentro del manejador POR QUÉ — es lo único que distingue la decisión del olvido.",
];

function buildSpec(problem: EmptyCatchProblem): HypothesisSpec<EmptyCatchProblem, CodeGraph | null> {
  return {
    pattern: "Handle Empty Catch",
    ceiling: "alta",
    needs: ["excepciones"],
    required: [manejadorVacio, hayBloqueProtegido, elFlujoSigueDespuesDelFallo, elFalloNoSeObservaDespues],
    discriminators: [variasOperacionesProtegidas, atrapaSinConservar, laFuncionYaSabeManejar],
    appliedState: () => appliedState(problem),
    toConfirm: TO_CONFIRM,
    source: SOURCE,
  };
}

/* ── LA TRAZA DEL EMBUDO. Prendida sólo desde un script de medición (ver
 *    `startHandleEmptyCatchTrace`); en producción queda en `null` y no cuesta
 *    nada: `record` sale por su primera línea. Existe porque publicar
 *    "emitió N" sin poder decir POR QUÉ se callaron los otros no es una
 *    medición, y esta ola la usó para las 86 candidatas de los 16 repos. */
export interface HandleEmptyCatchTraceEntry {
  file: string;
  startLine: number;
  symbol?: string;
  emitted: boolean;
  state: string | null;
  required: Record<string, boolean>;
  shape: EmptyCatchShape;
}

let trace: HandleEmptyCatchTraceEntry[] | null = null;
export function startHandleEmptyCatchTrace(): void {
  trace = [];
}
export function takeHandleEmptyCatchTrace(): readonly HandleEmptyCatchTraceEntry[] {
  const out = trace ?? [];
  trace = null;
  return out;
}

export const hypothesis: HypothesisBuilder = {
  id: "handle-empty-catch",
  pattern: "Handle Empty Catch",
  layer: "refactorizacion",
  anchors: [ANCHOR_KIND],
  build(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
    const shaped: EmptyCatchProblem = { finding: problem, shape: analyzeShape(problem, ctx) };
    const spec = buildSpec(shaped);
    const outcome = runEngine(spec, ctx.capabilities, shaped, graph);
    if (!outcome) {
      if (trace) {
        const l = problem.locations[0];
        trace.push({ file: l.file, startLine: l.startLine, symbol: l.symbol, emitted: false, state: null, required: {}, shape: shaped.shape });
      }
      return null;
    }
    const built = toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places: problem.locations,
      cost:
        "Una línea dentro del manejador: registrar la excepción, relanzarla, o dejar escrito por qué se ignora. " +
        "No cambia la estructura del código ni la firma de nada; el riesgo es que aparezca en los registros un fallo que hoy nadie ve.",
    });
    if (trace) {
      const l = problem.locations[0];
      const required: Record<string, boolean> = {};
      for (const c of built.checks) if (c.role !== "applied") required[c.label] = c.passed;
      trace.push({ file: l.file, startLine: l.startLine, symbol: l.symbol, emitted: true, state: built.state, required, shape: shaped.shape });
    }
    return built;
  },
};
