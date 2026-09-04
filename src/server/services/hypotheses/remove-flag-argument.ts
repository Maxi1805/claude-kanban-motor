/**
 * Remove Flag Argument (Fowler, *Refactoring* 2ed — "Remove Flag Argument",
 * antes "Replace Parameter with Explicit Methods") — Ola AT, frente AT2.
 *
 * ── EL ANCLA, Y POR QUÉ ES LA MEJOR QUE QUEDABA VIRGEN ─────────────────────
 * `detect/intra-function/boolean-flag-param.ts` produce **1.006 hallazgos**
 * sobre los 21 repos y su precisión de NIVEL 1 está medida en **80 %**
 * (n=20, Wilson [58 %, 92 %] — tabla de anclas de `GUIA-PROXIMA-OLA.md`), la
 * cuarta más alta del catálogo entre las anclas de volumen alto. Hasta hoy
 * **ningún patrón colgaba de ella**: `Decorator` la usaba y AL1 la retiró con
 * 0/12 verdaderas. El propio mapa de la Ola AG la nombra: *"la siguiente de
 * la lista con mejor relación tamaño/techo es REMOVE FLAG ARGUMENT: ~16
 * problemas, ancla de 80 % de precisión de nivel 1, y hoy ningún patrón del
 * catálogo lo resuelve"*.
 *
 * ── LA PRECONDICIÓN ES UN HECHO, NO UNA INTENCIÓN ──────────────────────────
 * La regla de la ola: *si la precondición no se verifica abriendo el archivo,
 * la familia repite el 18 % de los patrones*. Las cuatro de acá se verifican
 * contando, y ninguna opina sobre el futuro:
 *
 *   (1) **UN SOLO FLAG.** La firma tiene exactamente UN parámetro booleano
 *       que gatea una rama. Con dos, "dos métodos con nombre" son cuatro, y
 *       Fowler mismo desaconseja la explosión combinatoria.
 *   (2) **EL FLAG SE USA SÓLO COMO CONDICIÓN.** El identificador no aparece
 *       en ningún otro lugar del cuerpo: no se pasa como argumento a otra
 *       llamada, no se devuelve, no se reasigna, no se guarda en un campo.
 *       Si se RELEVA a un callee, partir esta función no elimina el flag: lo
 *       muda un nivel más adentro, que es el caso "cuando NO conviene" del
 *       catálogo.
 *   (3) **EL FLAG PARTE EL CUERPO EN DOS CAMINOS.** Su `if` es una sentencia
 *       DIRECTA del cuerpo (no está enterrado en un lazo ni dentro de otro
 *       `if`: ahí partir la función obliga a duplicar el envoltorio) y lo que
 *       gatea es trabajo de verdad — `MIN_GATED_LINES` líneas y
 *       `GATED_SHARE` del cuerpo. Ésta es la que separa el flag REAL del
 *       `if (verbose) log(...)`, que es un detalle opcional legítimo y no
 *       pide dos métodos.
 *   (4) **LOS LLAMADORES PASAN LITERALES.** Es la compuerta que el encargo
 *       nombra como la que salva a esta familia de emitir basura, y acá es
 *       DOBLE, porque el analizador no puede ver un llamador de otro archivo:
 *         (4a) el grafo no muestra NINGÚN llamador fuera de este archivo, y
 *         (4b) hay al menos un sitio de llamada visible en este archivo y
 *              TODOS pasan el literal `true`/`false` en la posición del flag.
 *       Si un solo sitio visible pasa una variable, esta hipótesis calla.
 *
 * ── LA ESCALA, DECLARADA DE ANTEMANO ───────────────────────────────────────
 * *"Una familia que emite 5.000 propuestas al 40 % es peor producto que una
 * que emite 200 al 70 %"*. El ancla tiene 1.006 hallazgos y esta hipótesis
 * NO pretende cubrirlos: (4a) sola recorta a las funciones cuyo único
 * consumidor está en su propio archivo — el subconjunto donde la
 * transformación es MECÁNICA y COMPLETA, porque los dos métodos nuevos y
 * todos sus llamadores caben en la misma pantalla. La fracción esperada es
 * de un dígito porcentual sobre el ancla, y es a propósito.
 *
 * ── EL LÍMITE HONESTO DE (4a) ──────────────────────────────────────────────
 * "El grafo no muestra llamadores externos" NO es "no hay llamadores
 * externos": la cascada de `references` resuelve peor en unos lenguajes que
 * en otros (`shotgun-surgery.ts` documenta que en Java el 51,7 % de las
 * aristas aceptadas son `inferred`, y este chequeo cuenta TODAS las
 * provenances a propósito — para NEGAR la existencia de un llamador, lo
 * conservador es el criterio más ANCHO posible, al revés que cuando se
 * afirma acoplamiento). Va escrito en `toConfirm`, que es donde el producto
 * pone lo que el lector tiene que verificar antes de tocar el código.
 *
 * ── EL REMEDIO PUEDE YA ESTAR APLICADO (trampa #3 de la ola) ───────────────
 * `appliedState` no mira "el alcance del ancla": mira DÓNDE VIVE LA SOLUCIÓN.
 * La forma aplicada de esta refactorización son dos funciones envoltorio, una
 * por literal, cuyo cuerpo entero es una llamada a la función del flag
 * (`bookPremiumConcert(c) { return book(c, true) }`). Se las busca en el
 * archivo: si aparecen DOS o más, el estado es `ya-aplicado` y la propuesta
 * no se publica como oportunidad.
 *
 * ── TRAMPA #2 (no borrarle la propuesta a nadie) ───────────────────────────
 * Verificado leyendo `anchors` de las 24 hipótesis registradas:
 * **`boolean-flag-param` no es ancla de NINGUNA otra**. `engine.ts#
 * arbitrateRivalHypotheses` sólo puede retirar una hipótesis frente a OTRA
 * del MISMO `Finding`, y en un `Finding` de este kind no hay ninguna otra —
 * así que ni el `ya-aplicado` de arriba puede quitarle nada a `Extract
 * Method` ni a `Value Object`. `remove-flag-argument.test.ts` lo congela.
 *
 * ── LENGUAJES ─────────────────────────────────────────────────────────────
 * `needs: []` y CERO nombres de lenguaje. Los parámetros se leen con los
 * mismos campos genéricos que ya usa el detector-ancla (`PARAM_NAME_FIELDS`/
 * `PARAM_VALUE_FIELDS`), el `if` se reconoce por FORMA
 * (`condition` + `consequence`/`alternative`, nunca por el nombre del tipo de
 * nodo) y la llamada por el vocabulario partido por "_" del tipo de nodo,
 * la misma técnica de `argument-mutation.ts`/`boolean-flag-param.ts`. El
 * precedente que esto evita está nombrado en el encargo: `SELF_PREFIX` de
 * `state.ts` dejó a Go mudo durante varias olas.
 */
import { walkTree } from "../detect/tree-walk.js";
import type { AstNode, FileUnit, Finding, FunctionUnit, RoleLocation } from "../detect/types.js";
import type { CodeGraph } from "../graph/types.js";
import { build as runEngine, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisDraft } from "./types.js";

/* ── vocabulario genérico, idéntico para los ocho lenguajes ─────────────── */

const BOOL_TYPE_NAME = /\bbool(ean)?\b/i;
const BOOLEAN_LITERAL_TEXT = /^(true|false)$/i;
const PARAM_NAME_FIELDS = ["name", "pattern", "left"];
const PARAM_VALUE_FIELDS = ["value", "right"];
/** Campos donde una gramática expone QUÉ se invoca. Probados en orden. */
const CALLEE_FIELDS = ["function", "method", "name", "constructor"];
/** Colectivos de argumentos: nunca un escalar. Misma lista que `boolean-flag-param.ts#REST_PARAM_TYPES`. */
const REST_PARAM_TYPES: ReadonlySet<string> = new Set([
  "list_splat_pattern",
  "dictionary_splat_pattern",
  "splat_parameter",
  "hash_splat_parameter",
  "block_parameter",
  "rest_pattern",
  "variadic_parameter_declaration",
  "spread_parameter",
]);
const COMMENT_WORD = /(^|_)comment(_|$)/;
/** "Esto es una invocación": token del tipo de nodo, partido por "_". */
const CALL_TOKENS = new Set(["call", "invocation"]);
/** "Esto envuelve la lista de argumentos". */
const ARGUMENT_TOKENS = new Set(["arguments", "argument"]);
/** Un argumento CON NOMBRE (`f(x, flag=True)`, `f(x, flag: true)`). */
const NAMED_ARGUMENT_TOKENS = new Set(["keyword", "pair", "named"]);
/** Vocabulario de "se apoya sobre algo": mismo Set que `boolean-flag-param.ts#STRUCTURED_USE_TOKENS`. */
const STRUCTURED_USE_TOKENS = new Set(["member", "subscript", "attribute", "field", "selector", "element", "array", "index", "call", "invocation"]);

/* ── los números, y de dónde salen ──────────────────────────────────────── */

/**
 * Lo que el flag gatea tiene que ser TRABAJO. Cuatro líneas es el piso: con
 * tres o menos la rama es un detalle (`if (verbose) log(x)`), y partir la
 * función en dos deja dos funciones casi idénticas — el caso "cuando NO
 * conviene" que el catálogo pone primero.
 */
const MIN_GATED_LINES = 4;
/**
 * Y tiene que DOMINAR el cuerpo: si el `if` del flag es el 10 % de la
 * función, lo que hay son dos comportamientos que comparten el 90 %, y ahí
 * separar duplica en vez de aclarar. La mitad es la afirmación fuerte
 * ("cada camino es la función"); 0,4 deja pasar el caso con preámbulo común
 * corto, que sigue siendo mecánico porque el preámbulo se extrae una vez.
 */
const GATED_SHARE = 0.4;
/** Dos envoltorios (uno por literal) son la refactorización YA hecha. */
const APPLIED_WRAPPERS = 2;
/** Tres o más sitios de llamada visibles con literal: el beneficio deja de ser teórico. */
const MANY_CALL_SITES = 3;
/** Ramas a los dos lados: el `if` tiene `else` y las dos hacen trabajo. */
const MIN_BRANCH_LINES = 2;

const SOURCE = "https://refactoring.com/catalog/removeFlagArgument.html";

const TO_CONFIRM: readonly string[] = [
  "Que ningún llamador FUERA de este repositorio pase el flag: si esta función es API publicada, los dos métodos nuevos son una adición, no un reemplazo.",
  "Que el grafo no se haya perdido un llamador de otro archivo: la resolución de referencias es heurística en algunos lenguajes, y este chequeo NIEGA la existencia de llamadores externos, así que un falso negativo del grafo se traduce en una propuesta incompleta.",
  "Que los dos caminos no compartan más de lo que se ve: si comparten un preámbulo largo, primero se extrae ese preámbulo y recién después se parte.",
];

/* ── lectura del árbol ──────────────────────────────────────────────────── */

function firstResolvedField(node: AstNode, fields: readonly string[]): AstNode | null {
  for (const field of fields) {
    const child = node.childForFieldName(field);
    if (child) return child as AstNode;
  }
  return null;
}

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed && !COMMENT_WORD.test(c.type)) out.push(c);
  }
  return out;
}

function hasToken(node: AstNode, tokens: ReadonlySet<string>): boolean {
  return node.type.split("_").some((t) => tokens.has(t));
}

/** `true` cuando `node` es un `if` estructural — misma prueba de FORMA que el detector-ancla. */
function isIfLike(node: AstNode): boolean {
  return node.childForFieldName("condition") !== null && (node.childForFieldName("consequence") !== null || node.childForFieldName("alternative") !== null);
}

interface Param {
  readonly name: string;
  readonly index: number;
  readonly declaredBoolean: boolean | null;
  readonly hasBooleanDefault: boolean;
  readonly hasNonBooleanDefault: boolean;
}

function paramFrom(node: AstNode, index: number): Param | null {
  if (REST_PARAM_TYPES.has(node.type)) return null;
  if (node.type === "identifier") {
    return { name: node.text, index, declaredBoolean: null, hasBooleanDefault: false, hasNonBooleanDefault: false };
  }
  let nameNode = firstResolvedField(node, PARAM_NAME_FIELDS);
  if (nameNode && REST_PARAM_TYPES.has(nameNode.type)) return null;
  if (!nameNode) {
    for (const child of namedChildren(node)) {
      if (child.type === "identifier") {
        nameNode = child;
        break;
      }
    }
  }
  if (!nameNode) return null;
  const typeNode = node.childForFieldName("type") as AstNode | null;
  const valueNode = firstResolvedField(node, PARAM_VALUE_FIELDS);
  const hasBooleanDefault = valueNode ? BOOLEAN_LITERAL_TEXT.test(valueNode.text.trim()) : false;
  return {
    name: nameNode.text,
    index,
    declaredBoolean: typeNode ? BOOL_TYPE_NAME.test(typeNode.text) : null,
    hasBooleanDefault,
    hasNonBooleanDefault: !!valueNode && !hasBooleanDefault,
  };
}

function paramsOf(fn: FunctionUnit): Param[] {
  const list = fn.node.childForFieldName("parameters") as AstNode | null;
  if (!list) return [];
  const out: Param[] = [];
  let index = 0;
  for (const child of namedChildren(list)) {
    const p = paramFrom(child, index);
    if (p) out.push(p);
    index++;
  }
  return out;
}

/** El `if` DIRECTO del cuerpo cuya condición completa es `name` (solo, negado o comparado contra un literal). */
interface Gate {
  readonly node: AstNode;
  readonly startLine: number;
  readonly endLine: number;
  readonly hasElse: boolean;
  readonly consequenceLines: number;
  readonly alternativeLines: number;
}

function conditionIsExactly(node: AstNode, name: string): boolean {
  const condition = node.childForFieldName("condition") as AstNode | null;
  if (!condition) return false;
  const text = condition.text.replace(/[()]/g, "").trim();
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`^(!|not\\s+)?${escaped}$`).test(text)) return true;
  return (
    new RegExp(`^${escaped}\\s*(===|==|!==|!=)\\s*(true|false)$`, "i").test(text) ||
    new RegExp(`^(true|false)\\s*(===|==|!==|!=)\\s*${escaped}$`, "i").test(text)
  );
}

/**
 * `true` si `inner` está DENTRO de `outer`, comparado por (fila, columna).
 * `AstNode` no expone `startIndex`/`endIndex` (`ProbeNode` de
 * `code-grammar.ts` sólo garantiza `type`/`isNamed`/`childCount`/`child`/
 * `childForFieldName`, más las dos posiciones y el texto que agrega
 * `AstNode`), así que la contención se decide con las posiciones, que sí
 * están en el contrato.
 */
function within(inner: AstNode, outer: AstNode): boolean {
  const a = inner.startPosition;
  const b = inner.endPosition;
  const c = outer.startPosition;
  const d = outer.endPosition;
  const afterStart = a.row > c.row || (a.row === c.row && a.column >= c.column);
  const beforeEnd = b.row < d.row || (b.row === d.row && b.column <= d.column);
  return afterStart && beforeEnd;
}

function linesOf(node: AstNode | null): number {
  if (!node) return 0;
  return node.endPosition.row - node.startPosition.row + 1;
}

/**
 * Las sentencias DIRECTAS del cuerpo de la función — un nivel de desenvuelto
 * (`body` puede ser el bloque o envolverlo), misma técnica que
 * `guard-clauses.ts#statementsOf`.
 */
function topLevelStatements(fn: FunctionUnit): AstNode[] {
  const body = (fn.node.childForFieldName("body") ?? fn.node.childForFieldName("consequence")) as AstNode | null;
  if (!body) return [];
  let cursor: AstNode = body;
  for (let i = 0; i < 2; i++) {
    const kids = namedChildren(cursor);
    if (kids.length === 1 && kids[0] && kids[0].childCount > 1 && !isIfLike(kids[0])) {
      cursor = kids[0];
      continue;
    }
    break;
  }
  return namedChildren(cursor);
}

function gateOf(fn: FunctionUnit, name: string): Gate | null {
  for (const stmt of topLevelStatements(fn)) {
    if (!isIfLike(stmt) || !conditionIsExactly(stmt, name)) continue;
    const alternative = stmt.childForFieldName("alternative") as AstNode | null;
    return {
      node: stmt,
      startLine: stmt.startPosition.row + 1,
      endLine: stmt.endPosition.row + 1,
      hasElse: alternative !== null,
      consequenceLines: linesOf(stmt.childForFieldName("consequence") as AstNode | null),
      alternativeLines: linesOf(alternative),
    };
  }
  return null;
}

/**
 * `true` si el identificador `name` aparece en el cuerpo en ALGÚN lugar que
 * no sea una condición de `if` — que es lo que rompe (2). Se cuenta cada
 * `identifier` con ese texto y se descuenta el que está dentro de la
 * condición de un `if` que lo usa como condición completa.
 */
function usedOutsideConditions(fn: FunctionUnit, name: string): number {
  const conditions: AstNode[] = [];
  walkTree(fn.node, (raw) => {
    if (!raw.isNamed) return;
    const node = raw as AstNode;
    if (!isIfLike(node) || !conditionIsExactly(node, name)) return;
    const condition = node.childForFieldName("condition") as AstNode | null;
    if (condition) conditions.push(condition);
  });
  const params = fn.node.childForFieldName("parameters") as AstNode | null;
  let outside = 0;
  walkTree(fn.node, (raw) => {
    if (!raw.isNamed) return;
    const node = raw as AstNode;
    if (node.type !== "identifier" || node.text !== name) return;
    // El propio nodo-nombre del parámetro en la firma no es un USO.
    if (params && within(node, params)) return;
    if (conditions.some((c) => within(node, c))) return;
    outside++;
  });
  return outside;
}

/* ── los sitios de llamada visibles ─────────────────────────────────────── */

type ArgKind = "literal-true" | "literal-false" | "otro" | "ausente";

interface CallSite {
  readonly line: number;
  readonly arg: ArgKind;
  /** El cuerpo de la función que contiene esta llamada es SÓLO esta llamada. */
  readonly isWrapper: boolean;
}

function calleeName(node: AstNode): string | null {
  const callee = firstResolvedField(node, CALLEE_FIELDS);
  if (!callee) return null;
  const text = callee.text.trim();
  const parts = text.split(/[.:>-]+/);
  const last = parts[parts.length - 1];
  return last && /^[A-Za-z_$][\w$]*$/.test(last) ? last : null;
}

function argumentsNode(node: AstNode): AstNode | null {
  const direct = node.childForFieldName("arguments") as AstNode | null;
  if (direct) return direct;
  for (const child of namedChildren(node)) {
    if (hasToken(child, ARGUMENT_TOKENS)) return child;
  }
  return null;
}

function classifyArg(node: AstNode | null): ArgKind {
  if (!node) return "ausente";
  const text = node.text.trim();
  if (/^true$/i.test(text)) return "literal-true";
  if (/^false$/i.test(text)) return "literal-false";
  return "otro";
}

/** El argumento en la posición `index`, o el que viene con el NOMBRE `flagName`. */
function argAt(args: AstNode, index: number, flagName: string): AstNode | null {
  const items = namedChildren(args);
  for (const item of items) {
    if (!hasToken(item, NAMED_ARGUMENT_TOKENS)) continue;
    const key = firstResolvedField(item, ["name", "key", "left"]);
    if (key && key.text.trim().replace(/:$/, "") === flagName) {
      return firstResolvedField(item, PARAM_VALUE_FIELDS) ?? null;
    }
  }
  return items[index] ?? null;
}

/**
 * El cuerpo de `fn` es UNA sola sentencia y esa sentencia contiene la llamada
 * — la forma de un envoltorio (`shortOf(n) { return render(n, true); }`).
 *
 * NO usa `topLevelStatements`: ese helper desenvuelve hasta DOS niveles para
 * poder encontrar el `if` de primer nivel en gramáticas que meten un
 * contenedor de más, y sobre un cuerpo de una sola sentencia ese desenvuelto
 * se pasa de largo hasta la propia llamada, cuyos hijos nombrados son dos
 * (el callee y la lista de argumentos) — con lo que un envoltorio real daba
 * `false` en cinco de los seis lenguajes. Medido: el test de "el remedio ya
 * está aplicado" fallaba en TypeScript/Python/Ruby/Java/C# y pasaba sólo en
 * Go, que es donde la gramática mete UN contenedor y el desenvuelto queda
 * corto por casualidad. Acá se miran los hijos DIRECTOS del cuerpo, que es la
 * pregunta real.
 */
function isWrapperBody(fn: FunctionUnit, call: AstNode, targetArity: number): boolean {
  const body = (fn.node.childForFieldName("body") ?? fn.node.childForFieldName("consequence")) as AstNode | null;
  if (!body) return false;
  // UN DOCSTRING NO ES UNA SENTENCIA DE COMPORTAMIENTO. Sin esto, el envoltorio
  // canónico de Python (una cadena de documentación y después la llamada) cuenta
  // DOS sentencias y no se reconoce. Caso REAL que lo destapó:
  // `sqlalchemy/examples/performance/single_inserts.py:139 _test_dbapi_raw`, donde
  // `test_dbapi_raw_w_connect`/`test_dbapi_raw_w_pool` SON los dos métodos
  // explícitos —la refactorización YA estaba hecha— y esta hipótesis la publicaba
  // igual como oportunidad. Es exactamente la trampa #3 del encargo, encontrada
  // abriendo el archivo, no razonada.
  const stmts = namedChildren(body).filter((n) => !isBareStringStatement(n));
  if (stmts.length !== 1) return false;
  const only = stmts[0];
  if (!only || !within(call, only)) return false;
  // Y TIENE QUE SER UN ENVOLTORIO, no cualquier función de una sola línea que
  // encima llame a ésta. El envoltorio de Fowler recibe los MISMOS parámetros
  // menos el flag, así que su aridad es la de la función objetivo menos uno.
  // Caso REAL que lo destapó:
  // `newtonsoft-json/Src/Newtonsoft.Json/Serialization/JsonSerializerInternalReader.cs:2679
  // HandleError`, donde DOS de sus ocho sitios de llamada viven en métodos de una
  // sola sentencia que no tienen nada que ver con envolver `HandleError` — y esta
  // hipótesis daba la refactorización por hecha y se tragaba un verdadero positivo
  // de libro (el flag gatea 12 de 17 líneas y los ocho llamadores pasan literales).
  return paramsOf(fn).length === targetArity - 1;
}

/**
 * Una sentencia cuyo texto entero es un literal de cadena — un docstring. La
 * prueba es genérica: primer y último carácter son la MISMA comilla y lo que
 * sigue a la primera no abre un identificador. Los otros cinco lenguajes ponen
 * su documentación en COMENTARIOS, que `namedChildren` ya descarta.
 */
function isBareStringStatement(node: AstNode): boolean {
  const text = node.text.trim();
  if (text.length < 2) return false;
  const first = text[0];
  const last = text[text.length - 1];
  if (first !== last) return false;
  if (first !== '"' && first !== "'" && first !== "`") return false;
  return !/^[A-Za-z_$]/.test(text.slice(1));
}

function enclosingFunction(file: FileUnit, line: number): FunctionUnit | null {
  let best: FunctionUnit | null = null;
  for (const fn of file.functions) {
    if (fn.startLine <= line && line <= fn.endLine) {
      if (!best || fn.endLine - fn.startLine < best.endLine - best.startLine) best = fn;
    }
  }
  return best;
}

function callSitesOf(file: FileUnit, fnName: string, flagIndex: number, flagName: string, ownStart: number, ownEnd: number, targetArity: number): CallSite[] {
  const sites: CallSite[] = [];
  walkTree(file.root, (raw) => {
    if (!raw.isNamed) return;
    const node = raw as AstNode;
    if (!hasToken(node, CALL_TOKENS)) return;
    if (calleeName(node) !== fnName) return;
    const line = node.startPosition.row + 1;
    // La recursión dentro de la propia función no es un llamador.
    if (line >= ownStart && line <= ownEnd) return;
    const args = argumentsNode(node);
    const arg = args ? classifyArg(argAt(args, flagIndex, flagName)) : "ausente";
    const owner = enclosingFunction(file, line);
    sites.push({ line, arg, isWrapper: owner ? isWrapperBody(owner, node, targetArity) : false });
  });
  return sites;
}

/* ── el grafo: ¿hay llamadores fuera de este archivo? ───────────────────── */

/**
 * Cuenta ARCHIVOS distintos, fuera del propio, con una arista de código hacia
 * el símbolo de esta función. Se aceptan TODAS las provenances a propósito:
 * acá se NIEGA la existencia de un llamador externo, y para negar lo
 * conservador es el criterio más ancho (al revés que `shotgun-surgery.ts`,
 * que AFIRMA acoplamiento y por eso excluye `inferred`).
 *
 * `null` = no hay grafo en esta pasada (`analyzeFile`, pasada 1). El check lo
 * trata como "no demostrado" y no pasa: la pasada de grafo
 * (`run.ts#rebuildHypothesesWithGraph`) vuelve a preguntar con el grafo real.
 */
function externalCallerFiles(graph: CodeGraph | null, file: string, startLine: number, endLine: number): number | null {
  if (!graph) return null;
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (node.kind !== "symbol" || node.file !== file) continue;
    const s = node.startLine ?? 0;
    if (s >= startLine && s <= endLine) ids.add(node.id);
  }
  if (ids.size === 0) return null;
  const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const files = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.kind === "contains") continue;
    if (!ids.has(edge.to) || ids.has(edge.from)) continue;
    const from = byId.get(edge.from);
    if (from && from.file && from.file !== file) files.add(from.file);
  }
  return files.size;
}

/* ── el contexto de los checks ──────────────────────────────────────────── */

interface Ctx {
  readonly ok: boolean;
  readonly file: string;
  readonly language: string;
  readonly fnName: string;
  readonly flagName: string;
  readonly flagIndex: number;
  readonly flagCount: number;
  readonly startLine: number;
  readonly endLine: number;
  readonly bodyLines: number;
  readonly gate: Gate | null;
  readonly usedOutside: number;
  readonly sites: readonly CallSite[];
  readonly literalSites: number;
  readonly otherSites: number;
  readonly wrappers: number;
  /** `null` = sin grafo en esta pasada. */
  readonly externalFiles: number | null;
}

const VACIO: Ctx = {
  ok: false,
  file: "",
  language: "",
  fnName: "",
  flagName: "",
  flagIndex: -1,
  flagCount: 0,
  startLine: 0,
  endLine: 0,
  bodyLines: 0,
  gate: null,
  usedOutside: 0,
  sites: [],
  literalSites: 0,
  otherSites: 0,
  wrappers: 0,
  externalFiles: null,
};

/** El nombre del parámetro, tomado del título del propio detector-ancla y VERIFICADO contra la firma. */
function flagNameFromTitle(title: string): string | null {
  const m = /^"([^"]+)"/.exec(title);
  return m ? (m[1] ?? null) : null;
}

/** ¿Este parámetro califica como "flag booleano que gatea una rama"? Mismo criterio que el detector-ancla. */
function isFlagParam(fn: FunctionUnit, p: Param): boolean {
  if (!gateOf(fn, p.name) && !bodyHasConditionOn(fn, p.name)) return false;
  if (p.declaredBoolean === true || p.hasBooleanDefault) return true;
  return p.declaredBoolean === null && !p.hasNonBooleanDefault;
}

function bodyHasConditionOn(fn: FunctionUnit, name: string): boolean {
  let found = false;
  walkTree(fn.node, (raw) => {
    if (found || !raw.isNamed) return;
    const node = raw as AstNode;
    if (isIfLike(node) && conditionIsExactly(node, name)) found = true;
  });
  return found;
}

function buildCtx(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): Ctx {
  const file = ctx.file;
  const loc = problem.locations[0];
  if (!file || !loc) return VACIO;
  const fn = enclosingFunction(file, loc.startLine);
  if (!fn || fn.name === null) return VACIO;
  const flagName = flagNameFromTitle(problem.title);
  if (!flagName) return VACIO;
  const params = paramsOf(fn);
  const flag = params.find((p) => p.name === flagName);
  if (!flag) return VACIO;
  const flagCount = params.filter((p) => isFlagParam(fn, p)).length;
  const gate = gateOf(fn, flagName);
  const sites = callSitesOf(file, fn.name, flag.index, flagName, fn.startLine, fn.endLine, params.length);
  const literalSites = sites.filter((s) => s.arg === "literal-true" || s.arg === "literal-false").length;
  const otherSites = sites.filter((s) => s.arg !== "literal-true" && s.arg !== "literal-false").length;
  const wrappers = sites.filter((s) => s.isWrapper && (s.arg === "literal-true" || s.arg === "literal-false")).length;
  return {
    ok: true,
    file: file.path,
    language: file.language,
    fnName: fn.name,
    flagName,
    flagIndex: flag.index,
    flagCount,
    startLine: fn.startLine,
    endLine: fn.endLine,
    bodyLines: fn.endLine - fn.startLine + 1,
    gate,
    usedOutside: usedOutsideConditions(fn, flagName),
    sites,
    literalSites,
    otherSites,
    wrappers,
    externalFiles: externalCallerFiles(graph, file.path, fn.startLine, fn.endLine),
  };
}

/* ── los checks ─────────────────────────────────────────────────────────── */

const unSoloFlag: Check<Ctx, CodeGraph | null> = {
  id: "un-solo-flag",
  describe: "la firma tiene UN solo parámetro booleano que gatea una rama (con dos, 'dos métodos con nombre' son cuatro)",
  run: (c) =>
    !c.ok
      ? { holds: false, evidence: "no se pudo ubicar la función ni su parámetro: no demostrado." }
      : { holds: c.flagCount === 1, evidence: `${c.flagCount} parámetro(s) booleano(s) que gatean una rama en "${c.fnName}".` },
};

const soloComoCondicion: Check<Ctx, CodeGraph | null> = {
  id: "solo-como-condicion",
  describe: "el flag se usa SÓLO como condición: no se pasa a otra llamada, no se devuelve, no se reasigna (si se releva, partir esta función no elimina el flag, lo muda adentro)",
  run: (c) =>
    !c.ok
      ? { holds: false, evidence: "sin función: no demostrado." }
      : { holds: c.usedOutside === 0, evidence: `"${c.flagName}" aparece ${c.usedOutside} vez/veces fuera de una condición de \`if\`.` },
};

/**
 * MEDIDO, NO ELEGIDO — y la variante relajada se PROBÓ y se descartó con el
 * archivo abierto. La primera versión de este check exigía sólo el >= 40 % del
 * cuerpo. La variante obvia era aceptar además el `if/else` con las dos ramas
 * haciendo trabajo, sin importar qué fracción del cuerpo ocupe ("con `else`,
 * el flag elige entre dos comportamientos"). Sobre los repos medidos esa
 * relajación pasaba de 5 propuestas a 8, y **las TRES que agregaba son
 * FALSAS**, las tres por el mismo motivo, que es el "cuando NO conviene" del
 * catálogo — *los dos caminos comparten casi todo el cuerpo*:
 *
 *   · `rubocop lib/rubocop/mcp/server.rb:160 build_tool(safety_required:)`: el
 *     `if/else` calcula DOS variables locales; las otras 30 líneas (el
 *     `::MCP::Tool.define(...)` entero) son compartidas.
 *   · `sqlalchemy lib/sqlalchemy/orm/session.py:3668 _delete_impl(head)`:
 *     `head` gatea TRES `if` separados con ~30 líneas de tronco común.
 *   · `sqlalchemy lib/sqlalchemy/sql/annotation.py:155 _deannotate(clone)`: es
 *     un método de PROTOCOLO, sobrescrito en diez lugares del mismo archivo.
 *
 * La fracción del cuerpo es, entonces, la afirmación que de verdad importa:
 * *"cada camino ES la función"*. El `else` con dos ramas queda donde
 * corresponde, como DISCRIMINADOR (`dos-ramas-reales`), no como puerta.
 */
const parteElCuerpo: Check<Ctx, CodeGraph | null> = {
  id: "parte-el-cuerpo",
  describe: `el \`if\` del flag es una sentencia DIRECTA del cuerpo y lo que gatea es la función (>= ${MIN_GATED_LINES} líneas y >= ${Math.round(GATED_SHARE * 100)} % del cuerpo)`,
  run: (c) => {
    if (!c.ok) return { holds: false, evidence: "sin función: no demostrado." };
    if (!c.gate) return { holds: false, evidence: `"${c.flagName}" no gatea ningún \`if\` de primer nivel del cuerpo (está anidado, o gatea una expresión).` };
    const gated = c.gate.endLine - c.gate.startLine + 1;
    const share = c.bodyLines > 0 ? gated / c.bodyLines : 0;
    return {
      holds: gated >= MIN_GATED_LINES && share >= GATED_SHARE,
      evidence: `el \`if\` de "${c.flagName}" cubre ${gated} de ${c.bodyLines} líneas del cuerpo (${Math.round(share * 100)} %), \`else\` ${c.gate.hasElse ? "sí" : "no"}; pisos ${MIN_GATED_LINES} líneas y ${Math.round(GATED_SHARE * 100)} %.`,
    };
  },
};

const sinLlamadoresInvisibles: Check<Ctx, CodeGraph | null> = {
  id: "sin-llamadores-invisibles",
  describe: "el grafo no muestra ningún llamador en otro archivo: todos los sitios que hay que reescribir caben en esta pantalla",
  run: (c) => {
    if (!c.ok) return { holds: false, evidence: "sin función: no demostrado." };
    if (c.externalFiles === null) return { holds: false, evidence: "no hay grafo en esta pasada (o el símbolo no está en él): no demostrado." };
    return { holds: c.externalFiles === 0, evidence: `${c.externalFiles} archivo(s) distinto(s) del propio con una arista hacia este símbolo.` };
  },
};

const llamadoresConLiteral: Check<Ctx, CodeGraph | null> = {
  id: "llamadores-con-literal",
  describe: "hay al menos un sitio de llamada en este archivo y TODOS pasan el literal `true`/`false` en la posición del flag (si alguno pasa una variable, la refactorización NO aplica)",
  run: (c) => {
    if (!c.ok) return { holds: false, evidence: "sin función: no demostrado." };
    return {
      holds: c.literalSites >= 1 && c.otherSites === 0,
      evidence: `${c.sites.length} sitio(s) de llamada visible(s) en el archivo: ${c.literalSites} con literal, ${c.otherSites} con una variable o sin argumento en esa posición.`,
    };
  },
};

/* ── discriminadores ────────────────────────────────────────────────────── */

const dosRamasReales: Check<Ctx, CodeGraph | null> = {
  id: "dos-ramas-reales",
  describe: `el \`if\` tiene \`else\` y las dos ramas hacen trabajo (>= ${MIN_BRANCH_LINES} líneas cada una): son dos comportamientos, no uno opcional`,
  run: (c) => {
    if (!c.gate) return { holds: false, evidence: "sin `if` de primer nivel." };
    return {
      holds: c.gate.hasElse && c.gate.consequenceLines >= MIN_BRANCH_LINES && c.gate.alternativeLines >= MIN_BRANCH_LINES,
      evidence: `consecuencia ${c.gate.consequenceLines} líneas, alternativa ${c.gate.alternativeLines} líneas, \`else\` ${c.gate.hasElse ? "sí" : "no"}.`,
    };
  },
};

const ambosLiterales: Check<Ctx, CodeGraph | null> = {
  id: "ambos-literales",
  describe: "los llamadores usan los DOS literales: el flag realmente se ejerce en las dos direcciones, no es una constante disfrazada de parámetro",
  run: (c) => {
    const t = c.sites.some((s) => s.arg === "literal-true");
    const f = c.sites.some((s) => s.arg === "literal-false");
    return { holds: t && f, evidence: `\`true\` en ${c.sites.filter((s) => s.arg === "literal-true").length} sitio(s), \`false\` en ${c.sites.filter((s) => s.arg === "literal-false").length}.` };
  },
};

const variosSitios: Check<Ctx, CodeGraph | null> = {
  id: "varios-sitios",
  describe: `>= ${MANY_CALL_SITES} sitios de llamada: cada uno es un lugar donde hoy hay que decodificar qué significa el booleano`,
  run: (c) => ({ holds: c.literalSites >= MANY_CALL_SITES, evidence: `${c.literalSites} sitio(s) con literal.` }),
};

/* ── el remedio puede YA estar aplicado ─────────────────────────────────── */

function appliedState(c: Ctx): AppliedStateResult {
  const applied = c.wrappers >= APPLIED_WRAPPERS;
  return {
    state: applied ? "ya-aplicado" : "ausente",
    checks: [
      {
        label: `no existen ya los dos métodos explícitos (funciones cuyo cuerpo entero es una llamada a "${c.fnName}" con un literal)`,
        passed: !applied,
        why: applied
          ? `${c.wrappers} envoltorio(s) de una sola sentencia ya llaman a "${c.fnName}" con un literal: los métodos explícitos existen, la refactorización está hecha.`
          : `${c.wrappers} envoltorio(s) de una sola sentencia (hacen falta ${APPLIED_WRAPPERS} para dar por aplicada la refactorización).`,
      },
    ],
  };
}

function buildSpec(): HypothesisSpec<Ctx, CodeGraph | null> {
  return {
    pattern: "Remove Flag Argument",
    ceiling: "alta",
    needs: [],
    required: [unSoloFlag, soloComoCondicion, parteElCuerpo, sinLlamadoresInvisibles, llamadoresConLiteral],
    discriminators: [dosRamasReales, ambosLiterales, variosSitios],
    appliedState: (c) => appliedState(c),
    toConfirm: TO_CONFIRM,
    source: SOURCE,
  };
}

/* ── la traza (sólo medición; `null` en producción) ─────────────────────── */

export interface RemoveFlagArgumentTraceEntry {
  readonly findingId: string;
  readonly file: string;
  readonly language: string;
  readonly line: number;
  readonly fnName: string;
  readonly flagName: string;
  readonly flagCount: number;
  readonly withFile: boolean;
  readonly withGraph: boolean;
  readonly gateLines: number;
  readonly bodyLines: number;
  /** Los tres hechos que permiten recalcular VARIANTES de `parte-el-cuerpo` sin volver a correr. */
  readonly hasElse: boolean;
  readonly consLines: number;
  readonly altLines: number;
  readonly usedOutside: number;
  readonly sites: number;
  readonly literalSites: number;
  readonly otherSites: number;
  readonly wrappers: number;
  readonly externalFiles: number | null;
  readonly checks: readonly { readonly id: string; readonly holds: boolean }[];
  readonly diesAt: string | null;
  readonly emitted: boolean;
}

let trace: RemoveFlagArgumentTraceEntry[] | null = null;
export function startRemoveFlagArgumentTrace(): void {
  trace = [];
}
export function takeRemoveFlagArgumentTrace(): readonly RemoveFlagArgumentTraceEntry[] {
  const t = trace ?? [];
  trace = null;
  return t;
}

function placesOf(c: Ctx): readonly RoleLocation[] {
  const places: RoleLocation[] = [
    {
      file: c.file,
      startLine: c.startLine,
      endLine: c.endLine,
      symbol: c.fnName,
      role: `firma con el flag "${c.flagName}": se parte en dos funciones con nombre, una por camino`,
    },
  ];
  for (const s of c.sites) {
    places.push({
      file: c.file,
      startLine: s.line,
      endLine: s.line,
      symbol: c.fnName,
      role: `sitio de llamada con \`${s.arg === "literal-true" ? "true" : "false"}\`: pasa a llamar a la función con nombre`,
    });
  }
  return places;
}

export const hypothesis: HypothesisBuilder = {
  id: "remove-flag-argument",
  pattern: "Remove Flag Argument",
  layer: "refactorizacion",
  anchors: ["boolean-flag-param"],
  build(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
    const c = buildCtx(problem, graph, ctx);
    const spec = buildSpec();
    const outcome = runEngine(spec, ctx.capabilities, c, graph);
    if (trace) {
      const checks = spec.required.map((k) => ({ id: k.id, holds: k.run(c, graph).holds }));
      trace.push({
        findingId: problem.id,
        file: problem.locations[0]?.file ?? "",
        language: c.language,
        line: problem.locations[0]?.startLine ?? 0,
        fnName: c.fnName,
        flagName: c.flagName,
        flagCount: c.flagCount,
        withFile: ctx.file !== null,
        withGraph: graph !== null,
        gateLines: c.gate ? c.gate.endLine - c.gate.startLine + 1 : 0,
        bodyLines: c.bodyLines,
        hasElse: c.gate?.hasElse ?? false,
        consLines: c.gate?.consequenceLines ?? 0,
        altLines: c.gate?.alternativeLines ?? 0,
        usedOutside: c.usedOutside,
        sites: c.sites.length,
        literalSites: c.literalSites,
        otherSites: c.otherSites,
        wrappers: c.wrappers,
        externalFiles: c.externalFiles,
        checks,
        diesAt: checks.find((k) => !k.holds)?.id ?? null,
        emitted: outcome !== null,
      });
    }
    if (!outcome || !c.ok) return null;
    return toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places: placesOf(c),
      cost:
        `Dos funciones nuevas con nombre (un camino cada una) y ${c.sites.length} sitio(s) de llamada reescrito(s), ` +
        "todos en este archivo. La firma vieja desaparece o queda como privada; no se mueve nada de lugar y no cambia " +
        "ninguna otra unidad del repositorio.",
    });
  },
};
