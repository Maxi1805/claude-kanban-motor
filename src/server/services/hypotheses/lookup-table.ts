/**
 * Lookup Table (Replace Conditional with Lookup Table) — Ola AS, frente AS2.
 *
 * ── POR QUÉ EXISTE, Y DE DÓNDE SALIÓ ───────────────────────────────────────
 * NO está en el catálogo de refactoring.guru. Salió de una medición propia:
 * AN1 midió que **39 de 51 candidatos de `Strategy` con fuerza y escala
 * mueren en el `required` `ramas-invocan-comportamiento-distinto`**
 * (`strategy.ts#distinctBehaviorCheck`) con la evidencia literal *"N/M ramas
 * retornan un valor fijo (sin invocar nada) — forma de tabla de
 * clasificación (datos de un conjunto cerrado), no de algoritmos
 * intercambiables"*. Strategy tiene razón en callarse: una familia de clases
 * para devolver veinte cadenas es peor que el problema. Pero el problema
 * EXISTE y no tenía remedio nombrado. Éste es el remedio: una tabla.
 *
 * ── LA PRECONDICIÓN ES UN HECHO DEL CÓDIGO, NO UNA INTENCIÓN DE DISEÑO ─────
 * Es el criterio de diseño que la Ola AS impone (`Extract Method` 73,6 % vs.
 * 17,9 % de los patrones): *"si la precondición no se puede verificar
 * abriendo el archivo, la familia va a repetir el 18 % de los patrones"*.
 * Las seis condiciones de abajo se verifican MIRANDO:
 *   (1) hay >= 5 ramas;
 *   (2) todas prueban el MISMO sujeto;
 *   (3) todas lo comparan contra un LITERAL;
 *   (4) todas producen un valor SIN invocar nada ni construir nada;
 *   (5) todas salen por el MISMO lugar (todas `return`, o todas asignan a la
 *       misma variable);
 *   (6) no existe ya, en el archivo, una tabla literal con esas claves.
 * Ninguna es una opinión sobre el futuro. Se abre el archivo y se cuenta.
 *
 * ── EL HALLAZGO DE FORMA QUE ESTA HIPÓTESIS NECESITÓ (y que no existía) ────
 * Los dos testigos que el encargo nombra —Ghost
 * `apps/admin/src/members/detail/member-event.ts:164-270 getAction` (20
 * cadenas literales) y `:104-162 getIcon` (16 iconos)— **NO son un
 * `conditional-chain`**. Verificado corriendo `analyzeRepo` sobre ese archivo
 * aislado: los hallazgos reales son `complexity`, `long-function` y
 * `many-returns`. La razón es estructural: son `if` SUELTOS, hermanos, uno
 * detrás de otro, no una escalera `if/elsif`. `FunctionMetrics.chain` cuenta
 * peldaños siguiendo el campo `alternative` (`code-analyzer.ts`), así que
 * para una secuencia de hermanos mide 1 y el detector (piso 5) nunca dispara.
 *
 * Por eso este archivo reconoce TRES formas de tabla, no dos:
 *   A. `switch`/`case`/`when`/`match` — un contenedor, sus arms.
 *   B. escalera `if/elsif/else` — encadenada por `alternative`.
 *   C. **`if` HERMANOS sobre el mismo sujeto** — la forma que ningún
 *      detector ni ninguna hipótesis del árbol veía hasta hoy.
 *
 * ── EL ANCLA DUEÑA: por qué hay un `required` de desempate ─────────────────
 * Una misma función puede disparar `complexity` Y `many-returns` Y
 * `long-function` a la vez (getAction dispara los tres). Sin desempate, la
 * MISMA tabla saldría propuesta tres veces y el producto sería ruido. La
 * regla es determinista, por hallazgo, sin estado compartido y sin
 * vecindario (que en `build()` llega vacío — ver `hypotheses/run.ts`):
 *   · forma A con >= 5 arms  ⇒ dueño `conditional-chain` (su piso ES 5, así
 *     que necesariamente disparó);
 *   · forma A con < 5 arms   ⇒ dueño `repeated-switch`;
 *   · forma B                ⇒ dueño `conditional-chain`;
 *   · forma C, salida `return` ⇒ dueño `many-returns` (piso 3: una tabla de
 *     >= 5 ramas que retorna necesariamente lo dispara);
 *   · forma C, salida `assign` ⇒ dueño `complexity`.
 * El `required` `ancla-duena` exige `problem.kind === dueño`. Consecuencia
 * DECLARADA: una forma C de salida `assign` en una función de complejidad
 * cognitiva < 15 no se emite — el ancla dueña no disparó. Es una pérdida de
 * cobertura conocida, no un descuido, y es preferible a triplicar propuestas.
 *
 * ── LA TRAMPA #3 DE LA OLA (el remedio puede YA estar puesto) ──────────────
 * `sinTablaPrevia` es un `required`, no un discriminador: si en el MISMO
 * archivo ya vive un literal clave→valor cuyas claves incluyen >= 2 de las
 * claves de esta cadena, la hipótesis devuelve `null` (silencio), no una
 * propuesta con menos confianza. La solución ya existe en otro lado del
 * archivo y proponerla otra vez es exactamente el error que la Ola AP midió
 * en 7 de 21 casos en disputa.
 *
 * ── LA TRAMPA #2 (no borrarle la propuesta a Extract Method) ───────────────
 * `appliedState` de esta hipótesis devuelve SIEMPRE `"ausente"` — nunca
 * `ya-aplicado` ni `aplicado-eludido`. `engine.ts#arbitrateRivalHypotheses`
 * sólo retira una oportunidad cuando OTRO patrón sobre el mismo `Finding`
 * está en un estado CONFIRMADO y sus `places` solapan; una hipótesis que no
 * puede estar confirmada nunca puede retirar nada. Las 287 verdaderas
 * expuestas de `Extract Method`/`Value Object` son inalcanzables desde acá
 * por construcción, no por cuidado. `lookup-table.test.ts` lo congela.
 *
 * ── LENGUAJES ─────────────────────────────────────────────────────────────
 * `needs: []` — un condicional existe en los seis lenguajes y no hace falta
 * ninguna capacidad para leerlo. NINGUNA constante de este archivo nombra un
 * lenguaje: los tipos de nodo se reconocen por PALABRA DE GRAMÁTICA genérica
 * (`CALL_WORD`, `LITERAL_WORD`, `RETURN_WORD`, `ASSIGN_WORD`), el mismo
 * mecanismo que `code-grammar.ts` documenta, y las formas se ubican por
 * `DerivedNodeSets` vía `ctx.setsFor(...)`, nunca por una lista por lenguaje.
 * Es la trampa que `state.ts#SELF_PREFIX` pagó dejando a Go mudo.
 */
import type { DerivedNodeSets } from "../code-grammar.js";
import { walkTree } from "../detect/tree-walk.js";
import type { AstNode, FileUnit, Finding, FunctionUnit, RoleLocation } from "../detect/types.js";
import type { CodeGraph } from "../graph/types.js";
import { build as runEngine, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisDraft } from "./types.js";

/** Alineado con el piso REAL del ancla `conditional-chain` (`chainLength`,
 *  `derivado({floor: 5, …})`): una tabla de menos de cinco entradas no paga
 *  la indirección. Mismo número, misma razón, que `STRATEGY_MIN_BRANCHES`. */
const MIN_RUNGS = 5;
/** Un peldaño más de la escalera de confianza: el doble del piso. */
const BIG_TABLE = 8;
/** Cuántas claves en común alcanzan para decir "esa tabla YA es ésta". Dos
 *  claves iguales por azar entre un literal cualquiera y una cadena de
 *  condiciones no es un accidente plausible; una sola sí. */
const APPLIED_KEY_OVERLAP = 2;
/** Los pisos REALES de las anclas, para decidir si una función anidada puede
 *  reclamar una cadena — ver `reclamanCadena`. */
const COMPLEXITY_FLOOR = 15;
const CHAIN_FLOOR = 5;
const LONG_FUNCTION_FLOOR = 45;

/* ── VOCABULARIO DE GRAMÁTICA, GENÉRICO — nunca de un lenguaje ───────────── */
/** Igual que `strategy.ts#CALL_WORD`, duplicado a propósito (mismo precedente
 *  de duplicación declarada que ese módulo ya usa con `code-grammar.ts`). */
const CALL_WORD = /(^|_)(call|invocation)(_|$)/;
/** Construcción de un objeto: la otra forma de "esta rama HACE algo", además de invocar. */
const NEW_WORD = /(^|_)(new|object_creation|instantiation|creation)(_|$)/;
/** Un valor escrito a mano. `literal` cubre Java/Go (`decimal_integer_literal`,
 *  `interpreted_string_literal`); los demás nombran el tipo directo. */
const LITERAL_WORD = /(^|_)(string|number|integer|float|decimal|char|symbol|true|false|null|nil|none|boolean|literal)(_|$)/;
/** Salida por retorno. */
const RETURN_WORD = /(^|_)return(_|$)/;
/** Salida por asignación. NO incluye la DECLARACIÓN de un local
 *  (`lexical_declaration`/`variable_declaration`): una variable auxiliar
 *  dentro de una rama no es la salida de la rama. */
const ASSIGN_WORD = /(^|_)assignment(_|$)/;
/** Un bucle dentro de una rama: la rama computa, no consulta una tabla. */
const LOOP_WORD = /(^|_)(while|until|for|do)(_|$)/;
/** Campos con los que las gramáticas nombran el lado derecho de una asignación. */
const RIGHT_FIELDS = ["right", "value"] as const;
/** Campos de acción de una rama — mismos dos, mismo orden, que `strategy.ts#ACTION_FIELDS`. */
const ACTION_FIELDS = ["consequence", "body"] as const;
/** Familia switch/case, igual que `code-grammar.ts#SWITCH_WORD`. */
const SWITCH_WORD = /(^|_)(switch|case|when|match|select)(_|$)/;
const SWITCH_ARM_EXCLUDE = /(pattern|else|default)/;
const SWITCH_WRAPPER_EXCLUDE = /(^|_)(body|block|label)$/;
const DEFAULT_LABEL = /(^|_)(default|else)(_|$)/;
const ARM_LABEL_FIELDS = ["value", "pattern"] as const;
/** Operadores de comparación genéricos — mismo criterio que `strategy.ts#COMPARISON_OPERATOR`. */
const COMPARISON_OPERATOR = /^([^=!<>]*?)\s*(===|!==|==|!=|>=|<=)\s*(.*)$/s;
/** Un literal escrito en el TEXTO de una condición o de una etiqueta de arm. */
const LITERAL_TEXT = /^(['"`].*['"`]|-?\d+(\.\d+)?|[A-Z][A-Z0-9_]*|[A-Za-z_$][A-Za-z0-9_$]*\.[A-Z][A-Z0-9_]*)$/s;

type Problem = Finding;
type Graph = CodeGraph | null;

interface Rung {
  readonly node: AstNode;
  readonly action: AstNode;
  /** Texto de la condición/etiqueta. `null` sólo si la gramática no la expone. */
  readonly conditionText: string | null;
}

type TableShape = "switch" | "ladder" | "siblings";
type Sink = "return" | "assign" | "mixed" | "none";

interface TableForm {
  readonly shape: TableShape;
  readonly rungs: readonly Rung[];
  /** Sujeto normalizado que TODAS las ramas prueban. `""` si no hay uno solo. */
  readonly subject: string;
  /** Clave literal de cada rama, en orden. `""` cuando esa rama no compara contra un literal. */
  readonly keys: readonly string[];
  readonly sink: Sink;
  /** Nombre de la variable asignada cuando `sink === "assign"`. */
  readonly sinkTarget: string | null;
  /** Ramas cuyo valor es constante (sin invocar ni construir, con al menos un literal). */
  readonly constantRungs: number;
  readonly startLine: number;
  readonly endLine: number;
  readonly fnName: string | null;
  readonly file: string;
}

/* ══════════════════════════════════════════════════════════════════════════
 * LECTURA DEL ÁRBOL — las tres formas
 * ══════════════════════════════════════════════════════════════════════════ */

/** La función cuyo rango contiene la primera location del problema — la más angosta si hay anidamiento. Mismo criterio que `strategy.ts#findEnclosingFunction`. */
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

function branchAction(node: AstNode): AstNode | null {
  for (const f of ACTION_FIELDS) {
    const child = node.childForFieldName(f) as AstNode | null;
    if (child) return child;
  }
  return null;
}

/** Desenvuelve el contenedor `else_clause` para llegar al `if` anidado — mismo
 *  hallazgo (y misma sonda) que `strategy.ts#unwrapAlternative`. */
function unwrapAlternative(node: AstNode): AstNode {
  if (node.childForFieldName("condition")) return node;
  for (const c of namedChildren(node)) if (c.childForFieldName("condition")) return c;
  return node;
}

function conditionTextOf(node: AstNode): string | null {
  const cond = node.childForFieldName("condition") as AstNode | null;
  return cond ? cond.text.replace(/^\(|\)$/g, "").trim() : null;
}

/**
 * FORMA B — peldaños de una escalera `if/elsif`, sin el `else` terminal.
 *
 * DOS RECORRIDOS, Y EL SEGUNDO NO ES DECORATIVO. El primero es el clásico
 * (`alternative` → `unwrapAlternative` → siguiente peldaño), que es como
 * JS/TS/Java/C#/Go/Ruby encadenan. **En Python NO alcanza, y el defecto es
 * medible**: `if_statement` de tree-sitter-python expone `alternative` como
 * campo REPETIDO —un `elif_clause` por peldaño, todos hermanos bajo el mismo
 * `if_statement`, no anidados uno dentro de otro— y `childForFieldName`
 * devuelve SÓLO EL PRIMERO. Con el recorrido clásico solo, una escalera
 * Python de 5 `elif` mide **2 peldaños**. Verificado con árbol real en
 * `lookup-table.test.ts` (el caso python fallaba con esa sola vuelta).
 *
 * El segundo recorrido barre los hijos DIRECTOS del nodo raíz y agrega los
 * que tienen condición propia — que es exactamente la forma de un
 * `elif_clause`. En los otros lenguajes no agrega nada (el `else_clause` no
 * tiene condición; el `elsif` de Ruby sí, pero ya lo trajo el primer
 * recorrido y el deduplicado por posición lo descarta).
 *
 * ── DEFECTO ENCONTRADO EN UN ARCHIVO CONGELADO, NO TOCADO ─────────────────
 * `strategy.ts#ifLadderBranchActions` tiene EXACTAMENTE el mismo recorrido de
 * una sola vuelta, así que **cuenta 2 peldaños en toda escalera `if/elif`
 * de Python**. Los 19 patrones están congelados esta ola: queda anotado en el
 * informe AS2 y no se toca.
 */
function ladderRungs(root: AstNode): Rung[] {
  const out: Rung[] = [];
  const seen = new Set<string>();
  const add = (node: AstNode): void => {
    const key = `${node.startPosition.row}:${node.startPosition.column}`;
    if (seen.has(key)) return;
    const action = branchAction(node);
    if (!action) return;
    seen.add(key);
    out.push({ node, action, conditionText: conditionTextOf(node) });
  };
  let current: AstNode | null = root;
  while (current && current.childForFieldName("condition")) {
    add(current);
    const alt = current.childForFieldName("alternative") as AstNode | null;
    current = alt ? unwrapAlternative(alt) : null;
  }
  for (const child of namedChildren(root)) if (child.childForFieldName("condition")) add(child);
  out.sort((a, b) => a.node.startPosition.row - b.node.startPosition.row);
  return out;
}

/** `true` si el arm tiene algo propio además de sus etiquetas — mismo criterio (y misma regresión medida, `lodash initCloneByTag`) que `strategy.ts#armHasOwnContent`. */
function armHasOwnContent(arm: AstNode): boolean {
  const labels: AstNode[] = [];
  for (const f of ARM_LABEL_FIELDS) {
    const l = arm.childForFieldName(f) as AstNode | null;
    if (l) labels.push(l);
  }
  const isLabel = (n: AstNode): boolean =>
    SWITCH_WORD.test(n.type) ||
    labels.some((l) => l.startPosition.row === n.startPosition.row && l.startPosition.column === n.startPosition.column);
  return namedChildren(arm).some((c) => !isLabel(c));
}

function armLabelText(arm: AstNode): string | null {
  for (const f of ARM_LABEL_FIELDS) {
    const l = arm.childForFieldName(f) as AstNode | null;
    if (l) return l.text.trim();
  }
  const first = namedChildren(arm)[0];
  return first && !SWITCH_WORD.test(first.type) ? first.text.trim() : null;
}

/** FORMA A — arms reales de un switch ya localizado, sin `default`/`else`. Mismo recorrido que `strategy.ts#switchArmActions`, más la etiqueta (que ese módulo descarta y esta hipótesis necesita como CLAVE). */
function switchRungs(container: AstNode): Rung[] {
  const out: Rung[] = [];
  const visit = (node: AstNode): void => {
    for (const child of namedChildren(node)) {
      const isWrapper = SWITCH_WORD.test(child.type) && SWITCH_WRAPPER_EXCLUDE.test(child.type);
      const isArm = SWITCH_WORD.test(child.type) && !SWITCH_ARM_EXCLUDE.test(child.type) && !isWrapper;
      if (!isArm) {
        visit(child);
        continue;
      }
      if (namedChildren(child).some((l) => DEFAULT_LABEL.test(l.type))) continue;
      // LA ACCIÓN DE UN ARM ES EL ARM ENTERO, NUNCA `childForFieldName("body")`.
      // DEFECTO REAL, encontrado juzgando `Ghost apps/ember-admin/app/helpers/
      // ui-btn.js:11 btnStyles`: en tree-sitter-javascript el campo `body` de
      // `switch_case` es REPETIDO (una entrada por sentencia del arm) y
      // `childForFieldName` devuelve SÓLO LA PRIMERA. Un arm que hace
      // `button = '...'; span = '...'; break;` se leía como si sólo asignara
      // `button`, y todos los checks de forma —"¿invoca?", "¿asigna a qué?"—
      // juzgaban un TERCIO del arm. La etiqueta entra en el subárbol y no
      // molesta: no es ni un `return` ni una asignación.
      if (armHasOwnContent(child)) out.push({ node: child, action: child, conditionText: armLabelText(child) });
    }
  };
  visit(container);
  return out;
}

/**
 * FORMA C — `if` HERMANOS. El grupo más grande de `if` que son hijos DIRECTOS
 * del mismo bloque, consecutivos o no, cuyas condiciones comparten sujeto.
 *
 * Es la forma que ningún detector del árbol ve (ver el docstring del módulo).
 * Se agrupa por SUJETO y no por adyacencia a propósito: en `getIcon` de Ghost
 * los `if` están separados por comentarios y por un `let` inicial, y exigir
 * adyacencia sintáctica los partiría en grupos de uno.
 */
function siblingGroups(fnNode: AstNode, sets: DerivedNodeSets, bloqueadas: ReadonlySet<string>): Rung[][] {
  const groups: Rung[][] = [];
  const visit = (node: AstNode): void => {
    const bySubject = new Map<string, Rung[]>();
    for (const child of namedChildren(node)) {
      if (!sets.chainNodes.has(child.type)) continue;
      const cond = conditionTextOf(child);
      if (!cond) continue;
      const action = branchAction(child);
      if (!action) continue;
      const subject = subjectOf(cond);
      if (!subject) continue;
      const list = bySubject.get(subject) ?? [];
      list.push({ node: child, action, conditionText: cond });
      bySubject.set(subject, list);
    }
    for (const list of bySubject.values()) if (list.length >= 2) groups.push(list);
    // OLA AS, AS2 — no se desciende a funciones anidadas: los `if` hermanos de
    // un closure son del closure. Ver `walkOwnScope`.
    for (const child of namedChildren(node)) if (!bloqueadas.has(claveDeNodo(child))) visit(child);
  };
  visit(fnNode);
  return groups;
}

/** El SUJETO de una condición: lo que queda a la izquierda del primer operador de comparación. `""` si no hay comparación (una condición booleana suelta no tiene sujeto de tabla). */
function subjectOf(conditionText: string): string {
  const m = COMPARISON_OPERATOR.exec(conditionText.trim());
  if (!m) return "";
  return m[1]!.trim().toLowerCase();
}

/** La CLAVE de una rama: el literal contra el que se compara el sujeto. `""` si no compara contra un literal. */
function keyOf(conditionText: string | null): string {
  if (!conditionText) return "";
  const m = COMPARISON_OPERATOR.exec(conditionText.trim());
  const raw = (m ? m[3]! : conditionText).trim();
  // Un `&&`/`||` después del literal pertenece a otra prueba: la clave es lo primero.
  const head = raw.split(/\s*(?:&&|\|\||\band\b|\bor\b)\s*/)[0]!.trim().replace(/[)]+$/, "");
  return LITERAL_TEXT.test(head) ? head : "";
}

/* ══════════════════════════════════════════════════════════════════════════
 * ¿LA RAMA PRODUCE UN VALOR FIJO?
 * ══════════════════════════════════════════════════════════════════════════ */

function subtreeHas(node: AstNode, re: RegExp): boolean {
  let found = false;
  walkTree(node, (n) => {
    if (!found && n.isNamed && re.test(n.type)) found = true;
  });
  return found;
}

function collect(node: AstNode, re: RegExp): AstNode[] {
  const out: AstNode[] = [];
  walkTree(node, (n) => {
    if (n.isNamed && re.test((n as AstNode).type)) out.push(n as AstNode);
  });
  return out;
}

/**
 * OLA AS, AS2 (segunda vuelta) — ¿QUIÉN ES EL DUEÑO DE UNA CADENA ANIDADA?
 *
 * La primera versión de esta regla cortaba en TODA función anidada, y medida
 * contra `med1` se pasó de rosca: en `eslint` bajó de 23 propuestas a 11, y
 * DOS de las que se llevó puestas eran verdaderas juzgadas
 * (`capitalized-comments.js:266` y `arrow-body-style.js:375`). La razón es la
 * forma de eslint: `create(context) { … return { Handler(node) { … } } }`. El
 * hallazgo de `complexity` lo tiene `create`; el handler de adentro es CHICO y
 * **no dispara ningún ancla**, así que si `create` no puede mirar adentro, esa
 * cadena no la propone NADIE y se pierde.
 *
 * La regla correcta no es "nunca entrar", es **"no entrar donde el de adentro
 * puede reclamarla"**, y se decide con las MISMAS métricas con las que deciden
 * los detectores, sin vecindario y sin estado compartido:
 *
 *   una función anidada RECLAMA la cadena  ⟺  su `metrics.cognitive` llega al
 *   piso de `complexity` (15) o su `metrics.chain` llega al de
 *   `conditional-chain` (5) — o, para `Guard Clauses`, que además ancla en
 *   `long-function`, si tiene 45 líneas o más.
 *
 * Si reclama, el de afuera no baja (y el de adentro la propone: una sola vez).
 * Si no reclama, el de afuera baja y la propone (una sola vez también, porque
 * el de adentro no va a tener hallazgo).
 *
 * LÍMITE DECLARADO: `duplication` es un ancla inter-file (huellas de clones) y
 * NO se puede calcular desde la función, así que una función anidada chica que
 * igual reciba un hallazgo de `duplication` puede volver a proponer la misma
 * cadena que el de afuera ya propuso. Es el resto que esta regla no cubre; se
 * eligió así porque el error contrario —perder la cadena entera— se midió y es
 * peor.
 */
/**
 * OJO CON LA IDENTIDAD DE LOS NODOS: `web-tree-sitter` devuelve un envoltorio
 * JS NUEVO en cada `child(i)`, así que un `Set<AstNode>` con los nodos que
 * guardó `fileUnitFrom` NUNCA da `has()` verdadero durante un recorrido
 * posterior. Se identifica por POSICIÓN + tipo, que sí es estable. (Costó dos
 * tests en rojo descubrirlo; queda escrito para que no lo pague nadie más.)
 */
function claveDeNodo(n: AstNode): string {
  return `${n.startPosition.row}:${n.startPosition.column}:${n.type}`;
}

function reclamanCadena(fn: FunctionUnit, file: FileUnit, incluirLargas: boolean): Set<string> {
  const out = new Set<string>();
  for (const otra of file.functions) {
    if (otra === fn || otra.node === fn.node) continue;
    if (!(fn.startLine <= otra.startLine && otra.endLine <= fn.endLine)) continue;
    const largaSuficiente = incluirLargas && otra.endLine - otra.startLine + 1 >= LONG_FUNCTION_FLOOR;
    if (otra.metrics.cognitive >= COMPLEXITY_FLOOR || otra.metrics.chain >= CHAIN_FLOOR || largaSuficiente) out.add(claveDeNodo(otra.node));
  }
  return out;
}

/** Recorre el subárbol de `fn` sin entrar en las funciones que RECLAMAN. */
function walkOwnScope(root: AstNode, bloqueadas: ReadonlySet<string>, visit: (n: AstNode) => void): void {
  const step = (n: AstNode, isRoot: boolean): void => {
    if (!isRoot && bloqueadas.has(claveDeNodo(n))) return;
    visit(n);
    for (let i = 0; i < n.childCount; i++) {
      const c = n.child(i) as AstNode | null;
      if (c) step(c, false);
    }
  };
  step(root, true);
}

/**
 * OLA AS, AS2 — ¿la ACCIÓN ENTERA de la rama es una entrada de tabla?
 *
 * ESTE CHECK ES EL QUE FALTABA, y lo encontró JUZGAR, no leer. `isFixedValue`
 * mira el valor RETORNADO o ASIGNADO; no mira lo que la rama hace ANTES de
 * producirlo. El testigo que el encargo cita, `Ghost
 * apps/admin/src/members/detail/member-event.ts:164 getAction`, salió emitido
 * con la evidencia «20/20 ramas producen un valor fijo (sin invocación...)» y
 * abriendo el archivo la rama `automated_email_sent_event` hace
 * `const subject = trimString(auto.subject);` antes de retornar, y la de
 * `gift_purchase_event` llama a `formatEventAmount(...)`. La invocación estaba
 * en una DECLARACIÓN, que no es ni el `return` ni la asignación, así que el
 * check no la veía. Es la MISMA clase de defecto que el `if x := f(); cond` de
 * Go (§7.1 del informe): el trabajo vive en un campo que el check no mira.
 *
 * La forma dura, verificable abriendo el archivo: **en toda la acción de la
 * rama no hay ninguna invocación, ninguna construcción, ningún bucle, ninguna
 * función anidada y ningún condicional de SENTENCIA.** Un ternario entre dos
 * literales sigue pasando (`ternaryLike` no está en `chainNodes`): es una
 * entrada de tabla con dos casos, no un sub-despacho con cuerpo.
 *
 * COSTO DECLARADO Y MEDIDO: con esto, los DOS testigos del encargo dejan de
 * emitirse — pero no porque la detección falle, sino porque el árbol de Ghost
 * de hoy YA NO ES el que el encargo describe: `getIcon` tiene un `if` anidado
 * adentro de la rama `subscription_event` que PISA el icono ya asignado, y
 * `getAction` tiene ocho ramas que computan. Una tabla pura no los reemplaza.
 */
function actionIsTableEntry(action: AstNode, sets: DerivedNodeSets): boolean {
  if (subtreeHas(action, CALL_WORD)) return false;
  if (subtreeHas(action, NEW_WORD)) return false;
  if (subtreeHas(action, LOOP_WORD)) return false;
  let impuro = false;
  walkTree(action, (raw) => {
    const n = raw as AstNode;
    if (impuro || !n.isNamed || n === action) return;
    // `chainNodes` = ifLike ∪ switchContainers ∪ switchArms. Un condicional de
    // SENTENCIA adentro de la rama es un sub-despacho: la tabla no lo expresa.
    if (sets.chainNodes.has(n.type)) impuro = true;
    // Una función declarada adentro de la rama tampoco es un valor fijo.
    if (sets.functionNodes.has(n.type)) impuro = true;
  });
  return !impuro;
}

/** El lado derecho de una asignación. */
function assignedValue(node: AstNode): AstNode | null {
  for (const f of RIGHT_FIELDS) {
    const c = node.childForFieldName(f) as AstNode | null;
    if (c) return c;
  }
  const kids = namedChildren(node);
  return kids.length >= 2 ? kids[kids.length - 1]! : null;
}

/** El nombre asignado. */
function assignedTarget(node: AstNode): string | null {
  const left = node.childForFieldName("left") as AstNode | null;
  if (left) return left.text.trim();
  const kids = namedChildren(node);
  return kids.length >= 2 ? kids[0]!.text.trim() : null;
}

/** El valor retornado. */
function returnedValue(node: AstNode): AstNode | null {
  const kids = namedChildren(node);
  return kids.length > 0 ? kids[kids.length - 1]! : null;
}

/**
 * ¿El valor que esta rama produce es FIJO? Tres condiciones, todas
 * estructurales: no invoca nada, no construye nada, no itera, y contiene al
 * menos un literal escrito a mano. Un ternario entre dos literales pasa (es
 * una entrada de tabla con dos casos); `foo(x)` no; `other.name` tampoco
 * (no hay literal: es un dato ajeno, no una constante de la tabla).
 */
function isFixedValue(value: AstNode): boolean {
  if (subtreeHas(value, CALL_WORD)) return false;
  if (subtreeHas(value, NEW_WORD)) return false;
  if (subtreeHas(value, LOOP_WORD)) return false;
  return subtreeHas(value, LITERAL_WORD) || LITERAL_TEXT.test(value.text.trim());
}

interface RungOutcome {
  readonly sink: Sink;
  readonly target: string | null;
  readonly fixed: boolean;
}

function outcomeOf(rung: Rung, sets: DerivedNodeSets): RungOutcome {
  // OLA AS, AS2 — la compuerta NUEVA. Se conjuga con `isFixedValue` en vez de
  // cortar antes, para que el embudo siga muriendo en
  // `ramas-devuelven-valor-fijo` (que es donde está la razón) y no en
  // `salida-uniforme`.
  const entrada = actionIsTableEntry(rung.action, sets);
  const returns = collect(rung.action, RETURN_WORD);
  const assigns = collect(rung.action, ASSIGN_WORD);
  if (returns.length > 0 && assigns.length === 0) {
    const values = returns.map(returnedValue).filter((v): v is AstNode => v !== null);
    return { sink: "return", target: null, fixed: entrada && values.length > 0 && values.every(isFixedValue) };
  }
  if (assigns.length > 0 && returns.length === 0) {
    // El CONJUNTO de destinos, no "el destino": una rama que hace
    // `button = ...; span = ...` sigue siendo una entrada de tabla —el valor
    // es un par— siempre que TODAS las ramas escriban el MISMO conjunto. Que
    // sea el mismo conjunto lo compara `formOf`; acá sólo se declara cuál es.
    const targets = [...new Set(assigns.map(assignedTarget).filter((t): t is string => t !== null))].sort();
    const values = assigns.map(assignedValue).filter((v): v is AstNode => v !== null);
    return {
      sink: "assign",
      target: targets.length > 0 ? targets.join(", ") : null,
      fixed: entrada && values.length === assigns.length && values.every(isFixedValue),
    };
  }
  if (returns.length > 0 && assigns.length > 0) return { sink: "mixed", target: null, fixed: false };
  return { sink: "none", target: null, fixed: false };
}

/* ══════════════════════════════════════════════════════════════════════════
 * ¿YA EXISTE LA TABLA? — la trampa #3 de la ola
 * ══════════════════════════════════════════════════════════════════════════ */

/** Las CLAVES de todo literal clave→valor del archivo. Genérico: cualquier
 *  nodo con >= 2 hijos nombrados que expongan un campo `key` (JS/TS/Ruby/
 *  Python: `pair`; Go: `keyed_element` con `key`). Un lenguaje sin literales
 *  de diccionario (Java, C#) simplemente devuelve el conjunto vacío — límite
 *  DECLARADO, no un silencio disfrazado: ver `toConfirm`. */
function literalTableKeys(root: AstNode): Set<string> {
  const keys = new Set<string>();
  walkTree(root, (raw) => {
    const node = raw as AstNode;
    if (!node.isNamed) return;
    const entries: string[] = [];
    for (const child of namedChildren(node)) {
      const k = child.childForFieldName("key") as AstNode | null;
      if (k) entries.push(k.text.trim());
    }
    if (entries.length >= 2) for (const e of entries) keys.add(normalizeKey(e));
  });
  return keys;
}

/** Dos claves son la misma si su TEXTO desnudo coincide — sin comillas, sin mayúsculas. */
function normalizeKey(raw: string): string {
  return raw.trim().replace(/^['"`]|['"`]$/g, "").toLowerCase();
}

/* ══════════════════════════════════════════════════════════════════════════
 * LA FORMA COMPLETA
 * ══════════════════════════════════════════════════════════════════════════ */

function formOf(problem: Problem, ctx: HypothesisContext): TableForm | null {
  if (!ctx.file) return null;
  const fn = findEnclosingFunction(ctx.file, problem);
  if (!fn) return null;
  const sets = ctx.setsFor(ctx.file.language);

  const candidates: { shape: TableShape; rungs: Rung[] }[] = [];
  // OLA AS, AS2 — `walkOwnScope`, no `walkTree`: una cadena que vive adentro
  // de un closure le pertenece al closure, no a la función de afuera. Ver el
  // docstring de `walkOwnScope` y las 13 propuestas duplicadas que lo obligaron.
  const bloqueadas = reclamanCadena(fn, ctx.file, false);
  walkOwnScope(fn.node, bloqueadas, (raw) => {
    const node = raw as AstNode;
    if (!node.isNamed) return;
    if (sets.switchContainerNodes.has(node.type)) candidates.push({ shape: "switch", rungs: switchRungs(node) });
    else if (sets.chainNodes.has(node.type) && node.childForFieldName("condition") && node.childForFieldName("alternative"))
      candidates.push({ shape: "ladder", rungs: ladderRungs(node) });
  });
  for (const g of siblingGroups(fn.node, sets, bloqueadas)) candidates.push({ shape: "siblings", rungs: g });

  let best: { shape: TableShape; rungs: Rung[] } | null = null;
  for (const c of candidates) if (!best || c.rungs.length > best.rungs.length) best = c;
  if (!best || best.rungs.length === 0) return null;

  const rungs = best.rungs;
  const subjects = new Set(rungs.map((r) => (best!.shape === "switch" ? "" : subjectOf(r.conditionText ?? ""))));
  // En un `switch` el sujeto es único por construcción (el discriminante del
  // contenedor), así que no se deriva de cada arm.
  const subject =
    best.shape === "switch"
      ? switchSubject(fn.node, sets, rungs)
      : subjects.size === 1
        ? [...subjects][0]!
        : "";

  const outcomes = rungs.map((r) => outcomeOf(r, sets));
  const sinks = new Set(outcomes.map((o) => o.sink));
  const targets = new Set(outcomes.map((o) => o.target).filter((t): t is string => t !== null));
  const sink: Sink = sinks.size === 1 ? [...sinks][0]! : "mixed";

  return {
    shape: best.shape,
    rungs,
    subject,
    keys: rungs.map((r) => keyOf(r.conditionText)),
    sink,
    sinkTarget: sink === "assign" && targets.size === 1 ? [...targets][0]! : null,
    constantRungs: outcomes.filter((o) => o.fixed).length,
    startLine: Math.min(...rungs.map((r) => r.node.startPosition.row + 1)),
    endLine: Math.max(...rungs.map((r) => r.node.endPosition.row + 1)),
    fnName: fn.name,
    file: ctx.file.path,
  };
}

/** El discriminante de un `switch`: el campo del contenedor, no de cada arm. */
function switchSubject(fnNode: AstNode, sets: DerivedNodeSets, rungs: readonly Rung[]): string {
  const first = rungs[0];
  if (!first) return "";
  let subject = "";
  walkTree(fnNode, (raw) => {
    const node = raw as AstNode;
    if (subject || !node.isNamed || !sets.switchContainerNodes.has(node.type)) return;
    if (node.startPosition.row > first.node.startPosition.row || node.endPosition.row < first.node.endPosition.row) return;
    for (const field of ["value", "subject", "condition"]) {
      const c = node.childForFieldName(field) as AstNode | null;
      if (c) {
        subject = c.text.replace(/[()]/g, "").trim().toLowerCase();
        return;
      }
    }
  });
  return subject;
}

/** El ancla que es DUEÑA de esta forma — ver el docstring del módulo. */
function ownerAnchor(form: TableForm): string {
  if (form.shape === "switch") return form.rungs.length >= MIN_RUNGS ? "conditional-chain" : "repeated-switch";
  if (form.shape === "ladder") return "conditional-chain";
  return form.sink === "return" ? "many-returns" : "complexity";
}

/* ══════════════════════════════════════════════════════════════════════════
 * LOS CHECKS
 * ══════════════════════════════════════════════════════════════════════════ */

const SOURCE = "https://refactoring.guru/es/smells/switch-statements";
const TO_CONFIRM: readonly string[] = [
  "¿el conjunto de claves es CERRADO (no llega ninguna clave nueva en runtime)? Si no lo es, la tabla necesita un valor por defecto explícito.",
  "¿existe ya una tabla equivalente en OTRO archivo (una constante compartida, un enum con datos)? Este análisis sólo mira el archivo del hallazgo — en Java y C#, donde no hay literales de diccionario, no mira nada.",
  "¿alguna rama depende de algo más que del discriminante? Esa rama no entra en la tabla y queda como caso especial.",
];

type Ctx = { readonly form: TableForm | null; readonly ownerOk: boolean; readonly tableKeys: Set<string> };

const escalaDeLaTabla: Check<Ctx, Graph> = {
  id: "escala-de-la-tabla",
  describe: `la cadena tiene al menos ${MIN_RUNGS} ramas (menos que eso no paga la indirección de una tabla)`,
  run: (c) =>
    !c.form
      ? { holds: false, evidence: "no se pudo ubicar ninguna cadena de condiciones en la función (sin árbol vivo o sin forma reconocible): no demostrado." }
      : {
          holds: c.form.rungs.length >= MIN_RUNGS,
          evidence: `${c.form.rungs.length} ramas (forma ${c.form.shape}), piso ${MIN_RUNGS}.`,
        },
};

const unSoloDiscriminante: Check<Ctx, Graph> = {
  id: "un-solo-discriminante",
  describe: "todas las ramas prueban el MISMO sujeto (sin un discriminante único no hay clave de tabla)",
  run: (c) =>
    !c.form
      ? { holds: false, evidence: "sin forma reconocible: no demostrado." }
      : c.form.subject.length === 0
        ? { holds: false, evidence: "las ramas no comparten un sujeto único (o ninguna es una comparación): no hay clave posible." }
        : { holds: true, evidence: `todas las ramas comparan "${c.form.subject}".` },
};

const clavesLiterales: Check<Ctx, Graph> = {
  id: "claves-literales",
  describe: `al menos ${MIN_RUNGS} ramas comparan el discriminante contra un LITERAL o una constante (una comparación por rango o por tipo no es una clave)`,
  run: (c) => {
    if (!c.form) return { holds: false, evidence: "sin forma reconocible: no demostrado." };
    const n = c.form.keys.filter((k) => k.length > 0).length;
    return { holds: n >= MIN_RUNGS, evidence: `${n}/${c.form.rungs.length} ramas comparan contra un literal, piso ${MIN_RUNGS}.` };
  },
};

const salidaUniforme: Check<Ctx, Graph> = {
  id: "salida-uniforme",
  describe: "todas las ramas salen por el MISMO lugar: todas retornan, o todas asignan a la misma variable",
  run: (c) => {
    if (!c.form) return { holds: false, evidence: "sin forma reconocible: no demostrado." };
    if (c.form.sink === "return") return { holds: true, evidence: `las ${c.form.rungs.length} ramas retornan.` };
    if (c.form.sink === "assign" && c.form.sinkTarget)
      return { holds: true, evidence: `las ${c.form.rungs.length} ramas asignan a "${c.form.sinkTarget}".` };
    return {
      holds: false,
      evidence: `las ramas no comparten salida (${c.form.sink}${c.form.sink === "assign" ? ", a variables distintas" : ""}): no es una tabla, es lógica.`,
    };
  },
};

const ramasDevuelvenValorFijo: Check<Ctx, Graph> = {
  id: "ramas-devuelven-valor-fijo",
  describe: "TODAS las ramas producen un valor fijo — ninguna invoca, construye ni itera (si alguna lo hace, es comportamiento, no un dato de tabla)",
  run: (c) => {
    if (!c.form) return { holds: false, evidence: "sin forma reconocible: no demostrado." };
    const total = c.form.rungs.length;
    return {
      holds: c.form.constantRungs === total && total > 0,
      evidence: `${c.form.constantRungs}/${total} ramas producen un valor fijo (sin invocación, sin construcción, sin bucle, con al menos un literal).`,
    };
  },
};

const sinTablaPrevia: Check<Ctx, Graph> = {
  id: "sin-tabla-previa",
  describe: "el archivo NO tiene ya un literal clave→valor con estas mismas claves (si lo tiene, el remedio ya está puesto en otro lado y proponerlo de nuevo es ruido)",
  run: (c) => {
    if (!c.form) return { holds: false, evidence: "sin forma reconocible: no demostrado." };
    const mine = c.form.keys.filter((k) => k.length > 0).map(normalizeKey);
    const shared = mine.filter((k) => c.tableKeys.has(k));
    return shared.length >= APPLIED_KEY_OVERLAP
      ? {
          holds: false,
          evidence: `el archivo ya declara un literal clave→valor que contiene ${shared.length} de estas claves (${shared.slice(0, 3).join(", ")}): la tabla ya existe y esta cadena la puentea.`,
        }
      : { holds: true, evidence: `ningún literal clave→valor del archivo comparte ${APPLIED_KEY_OVERLAP} o más claves con esta cadena (${shared.length} en común).` };
  },
};

function anclaDuena(problem: Problem): Check<Ctx, Graph> {
  return {
    id: "ancla-duena",
    describe: "este hallazgo es el ancla DUEÑA de esta forma (una función dispara varias anclas a la vez; sin desempate, la misma tabla se propondría varias veces)",
    run: (c) => {
      if (!c.form) return { holds: false, evidence: "sin forma reconocible: no demostrado." };
      const owner = ownerAnchor(c.form);
      return {
        holds: problem.kind === owner,
        evidence: `forma ${c.form.shape}/${c.form.sink} ⇒ dueño "${owner}"; este hallazgo es "${problem.kind}".`,
      };
    },
  };
}

const clavesTodasDistintas: Check<Ctx, Graph> = {
  id: "claves-todas-distintas",
  describe: "no hay dos ramas con la misma clave (un conjunto de claves propio, sin solapamiento)",
  run: (c) => {
    if (!c.form) return { holds: false, evidence: "sin forma." };
    const ks = c.form.keys.filter((k) => k.length > 0).map(normalizeKey);
    const distinct = new Set(ks).size;
    return { holds: distinct === ks.length && ks.length > 0, evidence: `${distinct} claves distintas sobre ${ks.length} claves leídas.` };
  },
};

const tablaGrande: Check<Ctx, Graph> = {
  id: "tabla-grande",
  describe: `la tabla tiene al menos ${BIG_TABLE} entradas (cuanto más grande, más caro es el condicional y más obvio el remedio)`,
  run: (c) => (!c.form ? { holds: false, evidence: "sin forma." } : { holds: c.form.rungs.length >= BIG_TABLE, evidence: `${c.form.rungs.length} ramas (>= ${BIG_TABLE} sube un peldaño).` }),
};

const condicionesSimples: Check<Ctx, Graph> = {
  id: "condiciones-simples",
  describe: "ninguna rama compone su condición con Y/O (una comparación sola por rama es una clave limpia; una compuesta necesita una entrada especial)",
  run: (c) => {
    if (!c.form) return { holds: false, evidence: "sin forma." };
    const compuestas = c.form.rungs.filter((r) => /&&|\|\||\band\b|\bor\b/.test(r.conditionText ?? "")).length;
    return { holds: compuestas === 0, evidence: `${compuestas}/${c.form.rungs.length} ramas con condición compuesta.` };
  },
};

/**
 * SIEMPRE `"ausente"` — a propósito, y es lo que vuelve a esta hipótesis
 * incapaz de retirarle la propuesta a nadie en
 * `engine.ts#arbitrateRivalHypotheses` (ver la trampa #2 en el docstring del
 * módulo). El caso "el remedio ya está puesto" NO se representa acá con
 * `ya-aplicado`: se representa con SILENCIO, vía el `required`
 * `sin-tabla-previa`.
 */
function appliedState(c: Ctx): AppliedStateResult {
  return {
    state: "ausente",
    checks: [
      {
        label: "la tabla no existe en este archivo",
        passed: true,
        why: c.form
          ? `ningún literal clave→valor del archivo cubre estas ${c.form.keys.filter((k) => k.length > 0).length} claves (lo verifica el required "sin-tabla-previa", que devuelve silencio si lo cubriera).`
          : "sin forma reconocible.",
      },
    ],
  };
}

function buildSpec(problem: Problem): HypothesisSpec<Ctx, Graph> {
  return {
    pattern: "Lookup Table",
    ceiling: "alta",
    needs: [],
    // ORDEN DELIBERADO: `ancla-duena` (el desempate entre anclas de la misma
    // función) va ÚLTIMO. El motor exige que TODOS pasen, así que el orden no
    // cambia ni un veredicto — pero `diesAt` de la traza es el PRIMERO que
    // falla, y con el desempate adelante el embudo publicaba "441 de 505
    // mueren en ancla-duena" y tapaba dónde muere de verdad la forma.
    required: [escalaDeLaTabla, unSoloDiscriminante, clavesLiterales, salidaUniforme, ramasDevuelvenValorFijo, sinTablaPrevia, anclaDuena(problem)],
    discriminators: [clavesTodasDistintas, tablaGrande, condicionesSimples],
    appliedState: (c) => appliedState(c),
    toConfirm: TO_CONFIRM,
    source: SOURCE,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * LA TRAZA — mismo mecanismo, misma forma y mismo default que
 * `engine.ts#startArbitrationTrace`: `null` en producción ⇒ costo cero.
 * ══════════════════════════════════════════════════════════════════════════ */

export interface LookupTableTraceEntry {
  readonly findingId: string;
  readonly kind: string;
  readonly file: string;
  readonly line: number;
  readonly symbol: string;
  readonly withFile: boolean;
  readonly shape: string;
  readonly rungs: number;
  readonly subject: string;
  readonly sink: string;
  readonly constantRungs: number;
  readonly owner: string;
  readonly checks: readonly { readonly id: string; readonly holds: boolean }[];
  readonly diesAt: string | null;
  readonly emitted: boolean;
}

let trace: LookupTableTraceEntry[] | null = null;
export function startLookupTableTrace(): void {
  trace = [];
}
export function takeLookupTableTrace(): readonly LookupTableTraceEntry[] {
  const t = trace ?? [];
  trace = null;
  return t;
}

function record(spec: HypothesisSpec<Ctx, Graph>, c: Ctx, problem: Problem, graph: Graph, ctx: HypothesisContext, emitted: boolean): void {
  const checks = spec.required.map((k) => ({ id: k.id, holds: k.run(c, graph).holds }));
  trace?.push({
    findingId: problem.id,
    kind: problem.kind,
    file: problem.locations[0]?.file ?? "",
    line: problem.locations[0]?.startLine ?? 0,
    symbol: problem.locations[0]?.symbol ?? "",
    withFile: ctx.file !== null,
    shape: c.form?.shape ?? "-",
    rungs: c.form?.rungs.length ?? 0,
    subject: c.form?.subject ?? "",
    sink: c.form?.sink ?? "-",
    constantRungs: c.form?.constantRungs ?? 0,
    owner: c.form ? ownerAnchor(c.form) : "-",
    checks,
    diesAt: checks.find((k) => !k.holds)?.id ?? null,
    emitted,
  });
}

function placesOf(form: TableForm): readonly RoleLocation[] {
  return [
    {
      file: form.file,
      startLine: form.startLine,
      endLine: form.endLine,
      symbol: form.fnName ?? undefined,
      role: `cadena de ${form.rungs.length} ramas sobre "${form.subject}" que sólo elige un valor`,
    },
  ];
}

export const hypothesis: HypothesisBuilder = {
  id: "lookup-table",
  pattern: "Lookup Table",
  layer: "refactorizacion",
  anchors: ["complexity", "conditional-chain", "many-returns", "repeated-switch"],
  build(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
    const form = formOf(problem, ctx);
    const c: Ctx = {
      form,
      ownerOk: form !== null && ownerAnchor(form) === problem.kind,
      tableKeys: ctx.file ? literalTableKeys(ctx.file.root) : new Set<string>(),
    };
    const spec = buildSpec(problem);
    const outcome = runEngine(spec, ctx.capabilities, c, graph);
    if (trace) record(spec, c, problem, graph, ctx, outcome !== null);
    if (!outcome || !form) return null;
    return toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places: placesOf(form),
      cost:
        "Una constante: un mapa/diccionario/objeto de clave a valor, al lado de la función, y la función pasa a ser una " +
        "consulta con un valor por defecto. No agrega tipos ni jerarquías; agregar un caso nuevo es una línea de datos " +
        "en vez de una rama de código.",
    });
  },
};
