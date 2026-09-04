/**
 * `type-switch` — despacho por el TIPO de un objeto en vez de por polimorfismo
 * (Ola X, frente B7).
 *
 * EL OLOR: dos o más ramas de una misma decisión preguntan *de qué tipo es*
 * el MISMO objeto y hacen algo distinto en cada una. Es el disparador
 * canónico de "Replace Conditional with Polymorphism" (Fowler) — y por lo
 * tanto de **Strategy** cuando lo que cambia es el algoritmo, y de **Factory
 * Method** cuando lo que cambia es qué se construye. Cada tipo nuevo obliga a
 * volver a esta función; el compilador no ayuda a encontrarla.
 *
 * ────────────────────────────────────────────────────────────────────────
 * POR QUÉ ES UN KIND NUEVO Y NO UNA VARIANTE DE LOS QUE YA ESTÁN
 * ────────────────────────────────────────────────────────────────────────
 *
 * `conditional-chain` mide LARGO (≥5 peldaños, sea cual sea el
 * discriminante) y `repeated-switch` mide REPETICIÓN (el mismo sujeto
 * decidido por switch en ≥2 lugares del archivo). Ninguno de los dos
 * pregunta **qué** decide la escalera, y por eso ninguno separa la escalera
 * que un patrón puede reemplazar de la que no:
 *
 *   - una escalera de 6 comparaciones contra números o cadenas de un
 *     protocolo NO se arregla con polimorfismo (no hay tipos que subclasear),
 *     y hoy dispara `conditional-chain` igual;
 *   - un `if (x instanceof A) … else if (x instanceof B) …` de DOS ramas es
 *     el caso de libro de Strategy y hoy **no dispara nada**: 2 < 5.
 *
 * Este detector cubre exactamente ese segundo hueco, y lo hace con el
 * criterio que hace al olor: *el discriminante es el TIPO*.
 *
 * ────────────────────────────────────────────────────────────────────────
 * LA FORMA QUE SE BUSCA — dos variantes
 * ────────────────────────────────────────────────────────────────────────
 *
 *   - `variant: "escalera"` — una escalera `if`/`else if`/`elsif` en la que
 *     ≥2 peldaños prueban el tipo **del MISMO sujeto** (mismo texto de
 *     sujeto, normalizado). Exigir el mismo sujeto es lo que separa el
 *     despacho por tipo de una validación defensiva encadenada (`if (a ==
 *     null) … else if (b instanceof X) …`, sujetos distintos: no hay un
 *     objeto al que darle un método).
 *   - `variant: "switch"` — un `switch`/`case`/`match` con ≥2 brazos cuyo
 *     patrón es un TIPO (el `switch x.(type)` de Go, el `case Circle c:` de
 *     C#, el `case Circle c ->` de Java 21, el `when Circle` de Ruby). Ahí
 *     el sujeto es único por construcción: el discriminante del switch.
 *
 * QUÉ **NO** ES:
 *   - Una sola prueba de tipo (`if (x instanceof A) return …`) NO dispara:
 *     eso es una guarda, no un despacho. El umbral es "más de uno", que es
 *     la definición misma de "despacho", no un piso elegido a mano.
 *   - `x is null` (C#) y el brazo `case nil:` de Go NO cuentan como prueba de
 *     tipo: preguntan por AUSENCIA, y la respuesta a eso es Null Object, no
 *     Strategy.
 *   - Peldaños con sujetos DISTINTOS no cuentan como despacho (ver arriba).
 *   - Este detector NO mira si las ramas hacen cosas distintas ni si los
 *     tipos comparten un ancestro: eso es trabajo de la hipótesis
 *     (`hypotheses/strategy.ts`), no del smell. Declarado, no escondido.
 *
 * ────────────────────────────────────────────────────────────────────────
 * SONDA DE GRAMÁTICA — cómo escribe cada gramática una PRUEBA DE TIPO
 * ────────────────────────────────────────────────────────────────────────
 *
 * Confirmado por sonda DIRECTA contra los `.wasm` reales
 * (`scripts/x-b7-sonda-gramatica.mts`, corrida el 13 de agosto de 2026;
 * salida completa citada en `ola-x/informes/B7.md`). Es el mismo mecanismo
 * (B) —nombre de nodo— que `code-grammar.ts` documenta para `TERNARY_NAME` y
 * `CONSTRUCTOR_NODE_WORD`: ninguna de las gramáticas expone un campo
 * uniforme para "soy una prueba de tipo".
 *
 * | gramática | escritura | nodo / campo que lo delata | sujeto |
 * |---|---|---|---|
 * | java | `x instanceof Circle` | tipo de nodo `instanceof_expression` | 1er hijo nombrado |
 * | java | `x.getClass() == T.class` | `class_literal` + `method_invocation` cuyo nombre es `getClass` | receptor |
 * | javascript/typescript | `x instanceof Circle` | `binary_expression` con campo `operator` = `instanceof` | campo `left` |
 * | javascript/typescript | `typeof x === "s"` | `unary_expression` con campo `operator` = `typeof` | campo `argument` |
 * | javascript | `Array.isArray(x)` | `call_expression` cuyo nombre de callee es `isArray` | 1er argumento |
 * | csharp | `x is Circle` / `x is Circle c` | tipo de nodo `is_pattern_expression` | 1er hijo nombrado |
 * | csharp | `case Circle c:` | `case_pattern_switch_label` → `declaration_pattern` | discriminante del switch |
 * | csharp | `x.GetType() == typeof(T)` | `type_of_expression` + `invocation_expression` `GetType` | receptor |
 * | go | `switch v := x.(type)` | tipo de nodo `type_switch_statement`, brazos `type_case` | operando |
 * | go | `x.(*Circle)` | tipo de nodo `type_assertion_expression` | 1er hijo nombrado |
 * | python | `isinstance(x, C)` | `call` cuyo nombre de callee es `isinstance` | 1er argumento |
 * | python | `type(x) is C` | `comparison_operator` con un `call` a `type` | 1er argumento de ese `call` |
 * | ruby | `x.is_a?(C)` / `kind_of?` / `instance_of?` | `call` con campo `method` | campo `receiver` |
 * | ruby | `case x when Circle` | `when` → `pattern` → `constant` | discriminante del `case` |
 *
 * ────────────────────────────────────────────────────────────────────────
 * GENERICIDAD
 * ────────────────────────────────────────────────────────────────────────
 *
 * Cero léxico de dominio: no hay ninguna lista de nombres de clase, de campo
 * ni de método de negocio. Las dos listas de texto son **vocabulario de
 * lenguaje** aplicado IDÉNTICAMENTE a los 9 lenguajes:
 * `TYPE_TEST_OPERATOR` (los operadores que las gramáticas exponen como
 * TEXTO en su campo `operator`, porque no les dan tipo de nodo propio) y
 * `TYPE_TEST_PREDICATE` (los predicados de prueba de tipo del propio
 * lenguaje). Es la misma clase de vocabulario que `code-grammar.ts` ya
 * declara permitida (`LOOP_WORD`, `SWITCH_WORD`, `CONSTRUCTOR_NAMES`) y que
 * `capabilities.ts` usa (`IMPORT_WORD`, `INTERFACE_WORD`).
 *
 * LÍMITE DECLARADO — Ruby `case x when CONSTANTE`: en Ruby un `when` con una
 * constante puede ser una CLASE (`when Circle`, que usa `Class#===`, o sea
 * una prueba de tipo real) o un VALOR constante (`when MAX_SIZE`). La
 * gramática no los distingue: los dos son `constant`. Se acepta sólo la
 * forma que TIENE minúsculas después de la primera letra (`Circle`, no
 * `MAX_SIZE`) — una prueba de FORMA sobre el identificador, del mismo tipo
 * que `hypotheses/strategy.ts` ya usa (`/^[A-Z]/`), nunca una lista de
 * nombres. Es una convención de estilo, no una garantía; queda declarado
 * como el punto más débil del detector y se mide aparte por lenguaje.
 *
 * PATRÓN AL QUE ALIMENTA: **Strategy** (`hypotheses/strategy.ts`) y, cuando
 * las ramas construyen, **Factory Method**. Ver `ola-x/informes/B7.md`.
 */
import { presencia } from "../thresholds.js";
import type { AstNode, FunctionUnit, IntraFunctionDetector, RawFinding, RoleLocation, RunContext } from "../types.js";

type ThresholdKey = "ramasQueDecidenPorTipo";

const COMMENT_NODE_TYPE = /comment/i;

/** Tipos de nodo que SON, por sí solos, una prueba de tipo (mecanismo B). */
const TYPE_TEST_NODE_TYPE = /^(instanceof_expression|is_pattern_expression|type_assertion_expression)$/;
/** Operadores que las gramáticas exponen como TEXTO del campo `operator`. */
const TYPE_TEST_OPERATOR = /^(instanceof|typeof)$/;
/** Predicados de prueba de tipo del propio lenguaje, por nombre de callee. */
const TYPE_TEST_PREDICATE = /^(isinstance|is_a\?|kind_of\?|instance_of\?|isArray|getClass|GetType)$/;
/** Los que reciben el sujeto como RECEPTOR (`x.is_a?`), no como argumento. */
const RECEIVER_STYLE_PREDICATE = /^(is_a\?|kind_of\?|instance_of\?|getClass|GetType)$/;
/** El callee del `type(x) is C` de Python — sólo cuenta dentro de una comparación. */
const PYTHON_TYPE_CALLEE = "type";
/** El literal nulo: `x is null` / `case nil:` preguntan por AUSENCIA, no por tipo. */
const NULL_WORD = /^(null|nil|none|undefined)$/i;

/** Nodo de escalera: cualquier nodo con campo `condition` (if/elsif/unless de las 9 gramáticas). */
const ALTERNATIVE_FIELDS = ["alternative", "else"];
/** Envoltorios que las gramáticas ponen entre el `if` y su `else if`. */
const ELSE_WRAPPER = /(^|_)(else|elif|elsif)(_|$)/;
/** Nodos de brazo de switch — misma lista medida que `repeated-switch.ts`, más el `type_case` de Go. */
const SWITCH_ARM_NODE_TYPE = /^(switch_case|switch_block_statement_group|switch_section|expression_case|type_case|when|case_clause)$/;
/** Contenedor de switch por TIPO propio de Go, que ninguna otra gramática tiene. */
const TYPE_SWITCH_CONTAINER = /(^|_)type_switch(_|$)/;
/** Nodos que NOMBRAN un tipo — vocabulario de gramática, no de dominio. */
const TYPE_NODE_TYPE = /(^|_)(type_identifier|pointer_type|qualified_type|generic_type|type_pattern|declaration_pattern|scoped_type_identifier)$/;

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed && !COMMENT_NODE_TYPE.test(c.type)) out.push(c);
  }
  return out;
}

function fieldText(node: AstNode, field: string): string | null {
  const c = node.childForFieldName(field) as AstNode | null;
  return c ? c.text : null;
}

function findAllDescendants(node: AstNode, pred: (n: AstNode) => boolean, maxDepth: number, out: AstNode[]): void {
  if (pred(node)) out.push(node);
  if (maxDepth <= 0) return;
  for (const c of namedChildren(node)) findAllDescendants(c, pred, maxDepth - 1, out);
}

/** Texto normalizado de un sujeto: sin paréntesis ni espacio sobrante, comparación insensible a mayúsculas. */
function normalizeSubject(text: string): string {
  return text.replace(/[()]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** El nombre del callee de una llamada, cualquiera sea la gramática: campo
 *  `method` (Ruby), campo `function` (Python/JS/Go) desenvuelto hasta su
 *  último hijo nombrado cuando es un acceso con receptor, o el nombre de la
 *  invocación de Java/C#. */
function calleeName(node: AstNode): string | null {
  const method = node.childForFieldName("method") as AstNode | null;
  if (method) return method.text;
  const fn = (node.childForFieldName("function") as AstNode | null) ?? (node.childForFieldName("name") as AstNode | null);
  if (!fn) return null;
  if (/identifier$/.test(fn.type)) return fn.text;
  const kids = namedChildren(fn);
  const last = kids[kids.length - 1];
  return last ? last.text : fn.text;
}

/** El receptor de una llamada con receptor: campo `receiver` (Ruby/Go) o el
 *  objeto del acceso que hace de callee (JS/Java/C#). */
function calleeReceiver(node: AstNode): AstNode | null {
  const receiver = node.childForFieldName("receiver") as AstNode | null;
  if (receiver) return receiver;
  const fn = (node.childForFieldName("function") as AstNode | null) ?? (node.childForFieldName("name") as AstNode | null);
  if (!fn || /identifier$/.test(fn.type)) return null;
  const obj = (fn.childForFieldName("object") as AstNode | null) ?? namedChildren(fn)[0] ?? null;
  return obj;
}

function firstArgument(node: AstNode): AstNode | null {
  const args = (node.childForFieldName("arguments") as AstNode | null) ?? namedChildren(node).find((c) => /argument/i.test(c.type)) ?? null;
  if (!args) return null;
  return namedChildren(args)[0] ?? null;
}

/** Una prueba de tipo ya resuelta: SOBRE QUÉ pregunta y POR QUÉ TIPO. */
interface TypeTest {
  subject: string;
  /** El tipo por el que pregunta. Nunca se muestra: sólo sirve para exigir que
   *  las ramas pregunten por tipos DISTINTOS (ver `computeTypeSwitchSites`). */
  typeName: string;
}

/** El otro lado de una comparación — el que NO contiene a `inner`. */
function otherSideOf(node: AstNode, inner: AstNode): AstNode | null {
  const left = node.childForFieldName("left") as AstNode | null;
  const right = node.childForFieldName("right") as AstNode | null;
  if (left && right) return left === inner ? right : left;
  const kids = namedChildren(node).filter((k) => k !== inner);
  return kids[kids.length - 1] ?? null;
}

/** El argumento en la posición `i` de una llamada, si lo hay. */
function argumentAt(node: AstNode, i: number): AstNode | null {
  const args = (node.childForFieldName("arguments") as AstNode | null) ?? namedChildren(node).find((c) => /argument/i.test(c.type)) ?? null;
  if (!args) return null;
  return namedChildren(args)[i] ?? null;
}

/** La prueba de tipo que `node` ES, o `null` si no es una. */
function typeTestOf(node: AstNode): TypeTest | null {
  // (0) `typeof x === "string"` (JS/TS): la comparación COMPLETA es la prueba —
  //     el operando `typeof x` solo no dice contra QUÉ se compara.
  const cmp = fieldText(node, "operator");
  if (cmp && /^(===|!==|==|!=)$/.test(cmp.trim())) {
    for (const kid of namedChildren(node)) {
      if (fieldText(kid, "operator")?.trim() === "typeof") {
        const arg = (kid.childForFieldName("argument") as AstNode | null) ?? namedChildren(kid)[0] ?? null;
        const other = otherSideOf(node, kid);
        if (arg && other) return { subject: arg.text, typeName: other.text };
      }
    }
  }
  // (1) tipos de nodo dedicados
  if (TYPE_TEST_NODE_TYPE.test(node.type)) {
    const kids = namedChildren(node);
    const subject = kids[0];
    if (!subject) return null;
    const rest = kids.slice(1).map((k) => k.text.trim()).join(" ");
    // `x is null` (C#) pregunta por ausencia, no por tipo.
    if (!rest || NULL_WORD.test(rest)) return null;
    return { subject: subject.text, typeName: rest };
  }
  // (2) operador expuesto como texto (`instanceof` de JS/TS)
  const operator = fieldText(node, "operator");
  if (operator && TYPE_TEST_OPERATOR.test(operator.trim())) {
    const left = (node.childForFieldName("left") as AstNode | null) ?? (node.childForFieldName("argument") as AstNode | null) ?? namedChildren(node)[0] ?? null;
    const right = (node.childForFieldName("right") as AstNode | null) ?? null;
    if (!left) return null;
    return { subject: left.text, typeName: right ? right.text : operator.trim() };
  }
  // (3) predicado de prueba de tipo del lenguaje
  const callee = calleeName(node);
  if (callee && TYPE_TEST_PREDICATE.test(callee)) {
    if (RECEIVER_STYLE_PREDICATE.test(callee)) {
      const recv = calleeReceiver(node);
      if (!recv) return null;
      // `x.is_a?(T)` lleva el tipo en el argumento; `x.getClass()` no lleva
      // ninguno (el tipo está en la comparación de afuera) y se identifica por
      // el nombre del predicado.
      const arg = argumentAt(node, 0);
      return { subject: recv.text, typeName: arg ? arg.text : callee };
    }
    const arg = argumentAt(node, 0);
    if (!arg) return null;
    // `isinstance(x, T)` lleva el tipo en el SEGUNDO argumento; `Array.isArray(x)` no lleva.
    const typeArg = argumentAt(node, 1);
    return { subject: arg.text, typeName: typeArg ? typeArg.text : callee };
  }
  // (4) `type(x) is C` de Python: sólo dentro de una comparación
  if (/^comparison_operator$/.test(node.type)) {
    for (const kid of namedChildren(node)) {
      if (calleeName(kid) === PYTHON_TYPE_CALLEE) {
        const arg = argumentAt(kid, 0);
        const other = otherSideOf(node, kid);
        if (arg && other) return { subject: arg.text, typeName: other.text };
      }
    }
  }
  return null;
}

/** Todas las pruebas de tipo dentro de una CONDICIÓN (a cualquier profundidad razonable). */
function typeTestsIn(condition: AstNode): TypeTest[] {
  const hits: AstNode[] = [];
  findAllDescendants(condition, (n) => typeTestOf(n) !== null, 8, hits);
  const out: TypeTest[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    const test = typeTestOf(hit);
    if (!test) continue;
    const key = `${normalizeSubject(test.subject)}::${normalizeSubject(test.typeName)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ subject: normalizeSubject(test.subject), typeName: normalizeSubject(test.typeName) });
  }
  return out;
}

/** Un peldaño de escalera ya resuelto. */
interface Rung {
  node: AstNode;
  tests: TypeTest[];
}

/**
 * La llave de un nodo para deduplicar: su EXTENSIÓN en el archivo.
 *
 * BUG MEDIDO Y CERRADO (Ola X, integrador, encontrado por el guardián de
 * nivel 1): `consumed` era un `Set<AstNode>` y **los nodos de tree-sitter no
 * tienen identidad de referencia estable** — `n.childForFieldName("x") ===
 * n.childForFieldName("x")` da `false`, porque cada acceso construye un
 * envoltorio nuevo. El nodo que `ladderFrom` marcaba (alcanzado por
 * `childForFieldName("alternative")`) nunca era el MISMO objeto que el que el
 * recorrido externo volvía a visitar (alcanzado por `namedChildren`), así que
 * `consumed.has(node)` daba siempre `false` y la MISMA escalera se reportaba
 * una vez por peldaño: una escalera de N peldaños producía N−1 hallazgos
 * (medido: `guava/.../TypeVisitor.java#visit` → 4 hallazgos de un solo
 * despacho; `MoreObjects#isEmpty` → 7). La extensión (fila/columna de inicio
 * y de fin) SÍ es estable entre dos accesos al mismo nodo, y es la misma
 * disciplina que el resto del árbol usa para hablar de un lugar.
 */
function nodeKey(node: AstNode): string {
  return `${node.startPosition.row}:${node.startPosition.column}-${node.endPosition.row}:${node.endPosition.column}`;
}

/**
 * La escalera completa que arranca en `node`: su propia condición más las de
 * todos sus `else if`. Devuelve `[]` si `node` no tiene campo `condition`.
 * Los nodos consumidos se marcan en `consumed` para que la MISMA escalera no
 * se reporte otra vez desde su segundo peldaño.
 */
function ladderFrom(node: AstNode, consumed: Set<string>): Rung[] {
  const rungs: Rung[] = [];
  let current: AstNode | null = node;
  let guard = 0;
  while (current && guard++ < 64) {
    const condition = current.childForFieldName("condition") as AstNode | null;
    if (!condition) break;
    consumed.add(nodeKey(current));
    // Go escribe `if v, ok := x.(*T); ok { … }`: la prueba de tipo está en el
    // INICIALIZADOR, no en la condición (confirmado por sonda —
    // `short_var_declaration` con un `type_assertion_expression`). El campo
    // `initializer` es genérico: las gramáticas que no lo tienen devuelven
    // `null` y no cambia nada.
    const initializer = (current.childForFieldName("initializer") as AstNode | null) ?? (current.childForFieldName("init") as AstNode | null);
    const tests = [...typeTestsIn(condition), ...(initializer ? typeTestsIn(initializer) : [])];
    rungs.push({ node: current, tests });
    let next: AstNode | null = null;
    for (const f of ALTERNATIVE_FIELDS) {
      const alt = current.childForFieldName(f) as AstNode | null;
      if (alt) {
        next = alt;
        break;
      }
    }
    if (!next) {
      // Ruby escribe el `elsif` como un hijo POSICIONAL del `if`, sin campo
      // `alternative` (confirmado por sonda: `if` → `elsif`).
      next = namedChildren(current).find((c) => ELSE_WRAPPER.test(c.type)) ?? null;
    }
    if (!next) break;
    // Un `else_clause` de JS/TS envuelve al `if` siguiente; se desciende un salto.
    if (ELSE_WRAPPER.test(next.type) && next.childForFieldName("condition") === null) {
      next = namedChildren(next).find((c) => c.childForFieldName("condition") !== null) ?? null;
    }
    current = next;
  }
  return rungs;
}

/**
 * Los nodos que forman la ETIQUETA de un brazo, nunca su cuerpo.
 *
 * BUG MEDIDO Y CERRADO (Ola X, B7, encontrado juzgando a mano
 * `cobra/bash_completions.go:461`): la primera versión buscaba un nodo de
 * tipo a profundidad 3 desde el brazo entero, y eso ALCANZA EL CUERPO — un
 * `case CONSTANTE_STRING:` cuyo cuerpo declara `var ext string` traía el
 * `type_identifier` de esa declaración y el brazo pasaba por "brazo tipado".
 * Sobre los 13 repos eso inflaba el kind entero (hugo: 100 hallazgos). La
 * etiqueta se acota acá y el cuerpo no se mira nunca.
 */
function armLabelNodes(arm: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (const field of ["value", "pattern", "subject"]) {
    const c = arm.childForFieldName(field) as AstNode | null;
    if (c) out.push(c);
  }
  for (const child of namedChildren(arm)) {
    // Java (`switch_label`), C# (`case_switch_label`/`case_pattern_switch_label`),
    // Python (`case_pattern`): la etiqueta es un envoltorio propio.
    if (/(^|_)(label|pattern)$/.test(child.type)) out.push(child);
    // Go (`type_case`): los tipos son hijos DIRECTOS del brazo, sin envoltorio.
    else if (TYPE_NODE_TYPE.test(child.type)) out.push(child);
  }
  return out;
}

/** ¿Este brazo de switch prueba un TIPO? Devuelve el texto del tipo, o `null`. */
function armTypeName(arm: AstNode): string | null {
  // El brazo de reserva (`default`, `else`, `case _`) nunca nombra un tipo.
  const head = arm.text.trim();
  if (/^(default|else)\b/.test(head)) return null;
  const labels = armLabelNodes(arm);
  if (labels.length === 0) return null;
  for (const label of labels) {
    const typeNodes: AstNode[] = [];
    findAllDescendants(label, (n) => TYPE_NODE_TYPE.test(n.type), 2, typeNodes);
    const typed = typeNodes[0];
    if (typed && !NULL_WORD.test(typed.text.trim())) return typed.text.trim();
  }
  // Ruby: `when Circle` — `pattern` → `constant`. Ver "LÍMITE DECLARADO".
  for (const label of labels) {
    const constants: AstNode[] = [];
    findAllDescendants(label, (n) => n.type === "constant", 2, constants);
    const constant = constants[0];
    if (constant && /^[A-Z]/.test(constant.text) && /[a-z]/.test(constant.text)) return constant.text.trim();
  }
  return null;
}

/** El discriminante de un switch — mismos campos genéricos que `repeated-switch.ts`. */
const SUBJECT_FIELDS = ["value", "subject", "condition"];
function switchSubjectText(node: AstNode): string | null {
  for (const field of SUBJECT_FIELDS) {
    const subject = node.childForFieldName(field) as AstNode | null;
    if (subject) {
      const text = subject.text.replace(/[()]/g, "").trim();
      if (text) return text;
    }
  }
  // El `switch v := x.(type)` de Go no expone campo: su operando es el hijo
  // nombrado que NO es un brazo ni la lista de asignación.
  const kid = namedChildren(node).find((c) => !SWITCH_ARM_NODE_TYPE.test(c.type) && c.type !== "expression_list");
  return kid ? kid.text.trim() : null;
}

interface Site {
  variant: "escalera" | "switch";
  node: AstNode;
  subject: string;
  arms: number;
  typeNames: string[];
}

export function computeTypeSwitchSites(fn: FunctionUnit): Site[] {
  const sites: Site[] = [];
  const consumed = new Set<string>();

  // NO se desciende a una función ANIDADA: `run.ts` corre este detector una
  // vez por `FunctionUnit`, y una función anidada ES su propio `FunctionUnit`
  // — sin este corte, el MISMO despacho se reporta dos veces, una desde la
  // función externa y otra desde el cierre interno (medido en
  // `hugo/hugofs/fs.go:177`: `IsOsFs` y su closure anónima reportando el
  // mismo `switch`).
  const all: AstNode[] = [];
  const collect = (node: AstNode, depth: number): void => {
    all.push(node);
    if (depth <= 0) return;
    for (const c of namedChildren(node)) {
      if (fn.sets.functionNodes.has(c.type)) continue;
      collect(c, depth - 1);
    }
  };
  collect(fn.node, 40);

  // (A) switches cuyos brazos nombran TIPOS.
  for (const node of all) {
    const isSwitch = fn.sets.switchContainerNodes.has(node.type) || TYPE_SWITCH_CONTAINER.test(node.type);
    if (!isSwitch) continue;
    const arms: AstNode[] = [];
    findAllDescendants(node, (n) => n !== node && SWITCH_ARM_NODE_TYPE.test(n.type), 3, arms);
    const typeNames: string[] = [];
    for (const arm of arms) {
      const name = armTypeName(arm);
      if (name) typeNames.push(name);
    }
    // Mismo criterio que la escalera: ≥2 brazos que preguntan por tipos
    // DISTINTOS. Un solo brazo tipado es una guarda, no un despacho.
    const distinctTypes = [...new Set(typeNames)];
    if (distinctTypes.length < 2) continue;
    const subject = switchSubjectText(node);
    if (!subject) continue;
    sites.push({ variant: "switch", node, subject, arms: typeNames.length, typeNames: distinctTypes });
  }

  // (B) escaleras if/else-if con ≥2 peldaños que prueban el MISMO sujeto.
  for (const node of all) {
    if (consumed.has(nodeKey(node))) continue;
    if (node.childForFieldName("condition") === null) continue;
    const rungs = ladderFrom(node, consumed);
    if (rungs.length < 2) continue;
    // Por sujeto: cuántos PELDAÑOS lo prueban y por qué TIPOS DISTINTOS.
    // Exigir tipos distintos es lo que separa un despacho real de la misma
    // prueba repetida con otra condición al lado — medido en
    // `sqlalchemy/lib/sqlalchemy/orm/context.py:1274`, donde los dos peldaños
    // preguntan `isinstance(key, tuple)` y lo que cambia es `key[0]`: no hay
    // ningún tipo al que mudarle el comportamiento.
    const bySubject = new Map<string, { rungs: number; types: Set<string> }>();
    for (const rung of rungs) {
      const seenHere = new Set<string>();
      for (const test of rung.tests) {
        const entry = bySubject.get(test.subject) ?? { rungs: 0, types: new Set<string>() };
        if (!seenHere.has(test.subject)) {
          entry.rungs += 1;
          seenHere.add(test.subject);
        }
        entry.types.add(test.typeName);
        bySubject.set(test.subject, entry);
      }
    }
    let best: { subject: string; rungs: number; types: Set<string> } | null = null;
    for (const [subject, entry] of bySubject) {
      if (entry.types.size < 2) continue;
      if (!best || entry.rungs > best.rungs) best = { subject, ...entry };
    }
    if (!best || best.rungs < 2) continue;
    sites.push({ variant: "escalera", node, subject: best.subject, arms: best.rungs, typeNames: [...best.types] });
  }

  return sites;
}

export const detector: IntraFunctionDetector<ThresholdKey, "type-switch"> = {
  id: "type-switch",
  kind: "type-switch",
  scope: "intra-function",
  title: "Despacho por tipo",
  needs: [],
  thresholds: {
    // R3 (auditoría de umbrales inventados): binario por definición del
    // hallazgo, no un piso a mano. UNA prueba de tipo es una guarda
    // (`if (x instanceof A) return`); a partir de la SEGUNDA sobre el mismo
    // sujeto ya hay un despacho, que es el fenómeno entero. No hay magnitud
    // intermedia entre "una" y "más de una" que calibrar. Mismo criterio y
    // misma forma que `repeated-switch.ts#minRepeats`.
    ramasQueDecidenPorTipo: presencia({
      rationale:
        "Una sola prueba de tipo es una guarda defensiva y no tiene remedio de patrón. A partir de la segunda rama que decide por el tipo del MISMO objeto ya hay un despacho manual: la forma que Replace Conditional with Polymorphism reemplaza, y el disparador de Strategy/Factory Method.",
    }),
  },
  run(fn: FunctionUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const threshold = ctx.threshold("ramasQueDecidenPorTipo");
    const findings: RawFinding[] = [];
    const name = fn.name ?? "(anónima)";

    // `threshold.value` es 1 (`presencia`): `> 1` es exactamente `>= 2`.
    const sites = computeTypeSwitchSites(fn)
      .filter((s) => s.arms > threshold.value)
      .sort((a, b) => a.node.startPosition.row - b.node.startPosition.row);

    // ANCLA EXPLÍCITA CON ORDINAL. Sin esto, `ids.ts#deriveAnchor` cae a
    // `symbolPath: [loc.symbol]` y DOS despachos por tipo dentro de la MISMA
    // función colapsan en el MISMO `Finding.id` (un hallazgo pisa al otro en
    // cualquier colección indexada por id — el mismo defecto que
    // `lazy-init-repetida.ts` documenta para dos clases hermanas). Medido:
    // sobre los 13 repos, sin ordinal 44 de 331 ids se repetían. El
    // `symbolPath` completo de la unidad (`fn.symbolPath`, que incluye la
    // clase) reemplaza además al `[symbol]` derivado, así que dos métodos
    // homónimos de clases distintas del mismo archivo tampoco colapsan.
    const symbolPath = fn.symbolPath.length > 0 ? [...fn.symbolPath] : name ? [name] : [];

    for (const [index, site] of sites.entries()) {
      const location: RoleLocation = {
        file: fn.file,
        startLine: site.node.startPosition.row + 1,
        endLine: site.node.endPosition.row + 1,
        symbol: name,
        anchor: { file: fn.file, symbolPath, ...(sites.length > 1 ? { ordinal: index } : {}) },
        role:
          site.variant === "switch"
            ? `switch sobre el tipo de \`${site.subject}\` (${site.arms} brazos con tipo)`
            : `escalera que prueba el tipo de \`${site.subject}\` en ${site.arms} peldaños`,
      };
      const typeEvidence = site.typeNames.length > 0 ? ` Tipos decididos: ${site.typeNames.slice(0, 8).join(", ")}.` : "";

      findings.push({
        variant: site.variant,
        title: `${name} decide por el TIPO de \`${site.subject}\` en ${site.arms} ramas`,
        detail:
          `${site.arms} ramas de una misma decisión preguntan de qué tipo es \`${site.subject}\` y actúan distinto en cada una. ` +
          "El comportamiento que debería vivir en cada tipo está acá afuera: cada tipo nuevo obliga a volver a esta función, " +
          `y nada avisa si alguien se olvida.${typeEvidence}`,
        trigger: [{ label: "ramas que deciden por tipo", value: site.arms, threshold }],
        evidence: [{ label: "tipos nombrados en las ramas", value: site.typeNames.length }],
        locations: [location],
        severity: Math.min(100, 45 + site.arms * 8),
        advice: {
          primary: {
            name: "Replace Conditional with Polymorphism",
            kind: "refactorizacion",
            why: "Mover el cuerpo de cada rama al tipo que la rama pregunta deja la decisión en manos del despacho del lenguaje: agregar un tipo deja de obligar a volver acá.",
            source: "https://refactoring.guru/es/smells/switch-statements",
          },
          pattern: {
            name: "Strategy",
            kind: "patron_de_diseno",
            why: "Cuando lo que cambia entre ramas es el ALGORITMO y no el dato, cada rama es una estrategia y el sujeto es su selector.",
            source: "https://refactoring.guru/es/design-patterns/strategy",
            caveat:
              "Requiere que los tipos probados compartan (o puedan compartir) un protocolo común, que este análisis sintáctico no verifica. Si lo que cambia es QUÉ SE CONSTRUYE en cada rama, el patrón es Factory Method, no Strategy.",
            cost: "Suma un tipo por rama: con dos ramas estables y sin perspectiva de crecer, la escalera es más barata.",
          },
        },
      });
    }

    return findings;
  },
};
