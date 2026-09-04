/**
 * Extracts REFERENCE CANDIDATES from an already-parsed file: for every
 * identifier-shaped leaf that COULD denote something declared elsewhere, this
 * module records its syntactic role, its receiver/qualifier evidence, and its
 * lexical context — everything the resolution cascade needs to decide, later
 * and separately, whether the candidate really denotes a declaration.
 *
 * *** THIS MODULE RESOLVES NOTHING. *** It never looks at what is declared
 * anywhere; it only describes the SITE OF USE. Resolution — matching a
 * candidate against `SymbolFacts` and running the nine-stage cascade — is
 * `graph/resolve.ts` (another agent's file). That split is what lets the
 * cascade be measured stage by stage (CONTRATO-F3.md §3.3): a module that
 * both extracted AND resolved could not be probed mid-cascade.
 *
 * Reuses the SAME contract `code-analyzer.ts`'s own `walkFile` and
 * `code-grammar.ts`'s `deriveNodeSets` already use: an already-parsed node
 * (the same minimal shape as `detect/types.ts`'s `AstNode`) plus the
 * `DerivedNodeSets` computed ONCE per language/process. No re-parsing, no
 * per-language `if (spec.id === ...)`, no new grammar dependency.
 *
 * `AstNode`/`ProbeNode` (this codebase's own abstraction, shared by every
 * detector) deliberately has NO `.parent` — see `detect/types.ts`'s
 * `ProbeNode`/`AstNode`, which only exposes `child`/`childForFieldName`. So,
 * exactly like `code-analyzer.ts`'s `walkFile`, this walk is TOP-DOWN and
 * carries `parent`/`grandparent` as it descends rather than reading them off
 * the node — never `.parent`.
 *
 * ── The role classifier, field by field (verified against real parses of
 *    all 9 supported grammars — see the corpus run in this file's own test
 *    and CONTRATO-F3.md's task description for the method) ──────────────
 *
 * 1. `key` — this leaf fills the `key` field of its parent (a hash/dict/
 *    object-literal entry: Ruby/JS/TS/Python's `pair`, Go's `keyed_element`).
 *    Fully structural: any parent resolving a `key` field qualifies, no
 *    per-language node-type name needed.
 * 2. `parameter`, bare form — parent's type is one of a tiny, DOCUMENTED
 *    "parameter list" vocabulary (`PARAM_LIST_TYPES`, below): Ruby/Python/JS
 *    bare parameters are direct POSITIONAL children of that list, with no
 *    field name of their own at all (confirmed empirically: `method_parameters
 *    -> identifier` has no field). This is the same standing as
 *    `code-grammar.ts`'s own `LOOP_WORD`/`EXCEPTION_WORD` — (B) name-based
 *    fallback used only where (A) field-shape genuinely cannot apply.
 * 3. `decl-name` — this leaf fills the `name` field of a parent that is
 *    ITSELF function-like or class-like per `DerivedNodeSets` (the SAME
 *    membership test `code-analyzer.ts` uses for `spec.functionNodes`/
 *    `spec.classNodes`): it is the function/class's own declared name, not a
 *    use of anything.
 * 4. `parameter`, wrapped form — this leaf fills `name`/`pattern`/`left` of
 *    its parent, and the GRANDPARENT's type is in `PARAM_LIST_TYPES`: Java's
 *    `formal_parameter.name`, Go's `parameter_declaration.name`, C#'s
 *    `parameter.name`, Ruby's `optional_parameter.name`, Python's
 *    `default_parameter.name`, TypeScript's `required_parameter.pattern`, and
 *    JS's `assignment_pattern.left` (`function f(x, y = D)`) are each one
 *    node ABOVE the bare-child case in (2), so the walk needs the parent's
 *    parent — verified for every one of these seven shapes by direct parse.
 *    A default VALUE (`= D`) or a type annotation sitting in the SAME wrapper
 *    node fills a different field (`value`/`type`), so it is correctly left
 *    alone and keeps flowing through as an ordinary reference.
 * 5. `decl-name`, plain binding — this leaf fills `name`/`left` of a parent
 *    whose type is in `BINDING_DECLARATOR_TYPES` (JS/TS `variable_declarator`,
 *    Ruby/Python `assignment`, Go's `var_spec`/`const_spec`/`type_spec`): a
 *    plain top-level or local binding, ported from the spike's
 *    `DECLARATOR_TYPES` (`spikes/cascada-refs/collect.mjs`).
 * 6. `decl-name`, lista de destinos de un binding — este leaf es hijo
 *    posicional de un `expression_list` que llena el campo `left` de SU
 *    padre, sea cual sea el tipo de ese padre. La forma original de esta
 *    regla (portada del spike) exigía además `grandparent.type ===
 *    "short_var_declaration"`, o sea el `:=` de Go y nada más. N9 (Ola O)
 *    la generalizó a la FORMA, sin el nombre de nodo: medido sobre hugo, el
 *    `i` de `for i, v := range xs` llega con `left` → `expression_list` bajo
 *    un `range_clause`, NO bajo un `short_var_declaration`, así que caía al
 *    rol `bare`, nunca sembraba `addLocal`, y cada uso posterior de `i` en
 *    el cuerpo del bucle resolvía al único símbolo global homónimo del repo
 *    (`internal/warpc/js/greet.bundle.js#i`, un bundle minificado): 363
 *    aristas falsas para `i`, 196 para `r`, 163 para `p`, 141 para `k`, 120
 *    para `c`. `expression_list` llenando `left` es SIEMPRE la lista de
 *    destinos de un binding/asignación — un `binary_expression.left` nunca
 *    es una lista, así que la generalización no puede tragarse un operando.
 * 7. `qualified` — this leaf fills the `name` field of a parent that ALSO
 *    resolves a `scope` field (Ruby's `scope_resolution`, e.g. `Jekyll::
 *    External`) or a `module` field (TypeScript's `nested_type_identifier`,
 *    e.g. `A.B` in a type position): a namespace/type PATH, not a call and
 *    not a value-bearing receiver.
 * 8. `receiver-member` — this leaf fills one of `method`/`field`/`property`/
 *    `attribute`/`name` (`MEMBER_FIELDS`) of a parent that ALSO resolves one
 *    of `receiver`/`object`/`operand`/`expression` (`RECEIVER_FIELDS`):
 *    `X.metodo`/`X.field`, call or not, in every one of the 9 grammars —
 *    Ruby's `call.method`, Java's `field_access.field` / `method_invocation.
 *    name`, Go's `selector_expression.field`, Python's `attribute.attribute`,
 *    TypeScript/JS's `member_expression.property`, C#'s
 *    `member_access_expression.name`. `name` is only admitted here TOGETHER
 *    with a receiver field being present, so it can never collide with (3)'s
 *    `name`-of-a-declaration check (a function/class declaration node never
 *    also resolves a receiver field).
 * 9. `bare` — everything else, including the RECEIVER identifier itself
 *    (`PathManager` in `PathManager.join`): it fills `receiver`/`object`/…,
 *    never a MEMBER_FIELDS slot, so it is correctly a plain candidate in its
 *    own right.
 *
 * ── `qualifierIsBareConstant` — the one distinction this task calls out as
 *    the most important, verified per-language rather than assumed ─────────
 *
 * Only ONE of the 9 supported grammars gives a receiver/qualifier a DIFFERENT
 * NODE TYPE when it is a bare capitalized name: Ruby's own lexer tokenizes
 * any bare word starting with an uppercase letter as `constant`, never
 * `identifier`, in EVERY position — call receiver included — confirmed by
 * direct parse (`PathManager.join(a, b)` parses `PathManager` as `constant`,
 * `array.join` parses `array` as plain `identifier`). That is Ruby's own
 * grammar encoding a lexical fact, not this module inventing a casing
 * convention — matches the precedent `code-grammar.ts`'s own docstring sets
 * for using a grammar's real node-type vocabulary (never a heuristic).
 *
 * The other 8 grammars were checked the same way and do NOT offer this for
 * free at a receiver/call position: TypeScript, Java, Go and C# each DO have
 * a distinct `type_identifier` node type, but only inside TYPE annotations
 * and generics — in ordinary expression position (`Foo.bar()`), every one of
 * them parses `Foo` as a plain `identifier`, structurally indistinguishable
 * from a local variable, because none of those grammars can tell a class name
 * from a variable without semantic/type information the parser does not
 * have. Python and JavaScript have no such split at all, anywhere.
 *
 * So `qualifierIsBareConstant` is `receiver.type === "constant"` — true only
 * where Ruby's own grammar already drew the line, `false` everywhere else, on
 * all 8 other languages, DECLARED here as a real, structural gap rather than
 * patched with a capitalization regex.
 *
 * ── `isCallee` — CONTRATO-F8G.md §3.1, verified by direct parse of all 9
 *    grammars (`f1-calls/probe-fields.mjs`, this task's own probe, outside
 *    `src/`) rather than assumed from the contract's prose ──────────────────
 *
 * Two field-shapes cover every grammar, because a call node's own name field
 * is spelled differently across them AND some grammars conflate
 * receiver+name+arguments into ONE node while others nest a separate
 * member-access node inside the call:
 *
 *   CASE A — this leaf directly fills `CALLEE_NAME_FIELDS` (`function`/
 *   `method`/`name`) of a parent that ALSO resolves an arguments field.
 *   Covers the RECEIVER-LESS call in the 7 grammars with a dedicated
 *   invocation node (`call_expression`/`call`/`invocation_expression`, field
 *   `function`: JS, TS, Python, Go, C#) AND, separately, the WITH-RECEIVER
 *   call in the two grammars that never nest a member-access node inside the
 *   call at all — Ruby's `call` (fields `receiver?`, `method`, `arguments?`)
 *   and Java's `method_invocation` (fields `object?`, `name`, `arguments`) —
 *   confirmed by direct parse: `obj.method(x)` in both is ONE node with the
 *   receiver and the callee name as SIBLING fields, not `receiver-node.member
 *   -> call-node`.
 *
 *   CASE B — this leaf fills a genuine member-access field (`MEMBER_FIELDS`
 *   + a `RECEIVER_FIELDS` sibling present — the SAME test `receiver-member`
 *   already uses) of a node M, and M ITSELF fills `CALLEE_NAME_FIELDS` of an
 *   outer node that resolves arguments. Covers `obj.method(x)` in the other
 *   5 grammars, which DO nest a separate member-access node inside the call
 *   (`call_expression.function -> member_expression`/`attribute`/
 *   `selector_expression`, `invocation_expression.function ->
 *   member_access_expression`): JS, TS, Python, Go, C#. Only ONE hop of
 *   nesting is ever needed even for a longer chain (`a.b.c(x)`) — confirmed
 *   by direct parse — because only the OUTERMOST accessor is the thing
 *   actually invoked; an inner accessor in the same chain fills the
 *   `object`/`operand`/`expression` field of the next node out, never its
 *   `function`/`method`/`name` field, so it is correctly never flagged.
 *
 * An empty argument list (`foo()`) still counts: the grammar still resolves
 * an (empty) `arguments`/`argument_list` NODE, distinct from resolving no
 * such field at all — `hasArgumentsField` only tests presence of the field.
 *
 * ── `inTypeSlot` — AA6 (Ola AA). LA RANURA DE TIPO DE LA GRAMÁTICA,
 *    verificada por PARSE DIRECTO de las gramáticas del corpus
 *    (`scratchpad-aa6/aa6-sonda-ranura-tipo.mts`, fixtures propias con
 *    parámetro tipado + tipo de retorno + variable local tipada), nunca leída
 *    de una tabla ────────────────────────────────────────────────────────────
 *
 * ESTE MÓDULO SIGUE SIN DECIDIR NADA: `inTypeSlot` es una TRADUCCIÓN — "la
 * gramática escribió este nombre en la ranura donde va un TIPO" — y qué hacer
 * con ese hecho lo decide `graph/resolve.ts`, igual que con `isCallee` y
 * `qualifierIsBareConstant`.
 *
 * La sonda devuelve un vocabulario de TRES campos, y los mismos tres cubren
 * todas las gramáticas que tienen tipos escritos:
 *
 *   `type`        python (`typed_parameter`, `typed_default_parameter`,
 *                 `assignment`), go (`parameter_declaration`, `var_spec`,
 *                 `field_declaration`, `type_spec`), typescript
 *                 (`required_parameter`, `optional_parameter`,
 *                 `variable_declarator`, `property_signature`), java
 *                 (`formal_parameter`, `method_declaration`,
 *                 `field_declaration`, `local_variable_declaration`), csharp
 *                 (`parameter`, `variable_declaration`, `method_declaration`)
 *   `return_type` python (`function_definition`), typescript
 *                 (`function_declaration`, y toda la familia de firmas)
 *   `result`      go (`function_declaration`, `method_declaration`)
 *
 * ES TRANSITIVO A PROPÓSITO, no "el hijo directo del campo": las cinco
 * gramáticas envuelven el tipo en uno o más nodos intermedios antes de llegar
 * al identificador —`type_annotation` (TS), `type`/`generic_type`/
 * `type_parameter` (Python), `pointer_type`/`map_type`/`slice_type` (Go),
 * `generic_type`/`type_arguments`/`scoped_type_identifier` (Java),
 * `qualified_name`/`generic_name`/`type_argument_list` (C#)— y todos ellos
 * están, los cinco, en la sonda. El recorrido ya es TOP-DOWN, así que el
 * hecho viaja como una bandera que se prende al cruzar el campo y no se apaga:
 * cero trabajo extra por hoja, tres `childForFieldName` por NODO (y ninguno
 * una vez prendida).
 *
 * BRECHA DECLARADA, medida: **ruby y javascript quedan en `false` siempre**, y
 * es correcto — ninguna de las dos gramáticas tiene dónde escribir un tipo
 * (la sonda no resuelve ni un `type`/`return_type`/`result` en `a.rb`/`a.js`).
 * Es la misma clase de brecha estructural que `qualifierIsBareConstant`
 * declara para las ocho gramáticas que no lexan la constante desnuda: se
 * declara, no se parcha con una convención de nombres.
 *
 * LÍMITE DECLARADO, no escondido: TypeScript puede escribir en una ranura de
 * tipo una CONSULTA de tipo sobre un valor (`const x: typeof foo = foo`,
 * `typeof` → `type_query`). Ese `foo` sale con `inTypeSlot: true` aunque
 * denote una función. Es el único caso conocido en que la ranura de tipo
 * nombra legítimamente algo que no es un tipo, y viaja declarado acá en vez de
 * con una excepción por nombre de nodo.
 *
 * BRECHA DECLARADA, medida y no parchada por convención (mismo estándar que
 * `qualifierIsBareConstant`'s propia brecha): Ruby without parentheses AND
 * without positional arguments (`obj.value`, or a block-only call like
 * `arr.each { |x| x }`) resolves NEITHER `arguments` NOR `argument_list` on
 * its `call` node — confirmed by direct parse, the `block` field alone is
 * not treated as call evidence, only `arguments`/`argument_list` per
 * CONTRATO-F8G.md §3.1's own field list — so it is structurally
 * indistinguishable from a plain attribute read and stays `isCallee: false`.
 * Measured per-language in this task's corpus pass, not silently patched
 * with a name-based heuristic.
 */
import type { DerivedNodeSets, ProbeNode } from "../code-grammar.js";
import type { AstNode } from "../detect/types.js";

/**
 * `AstNode`'s inherited `child()`/`childForFieldName()` (from `ProbeNode`)
 * return `ProbeNode`, not `AstNode` — a real tree's child IS `AstNode`-shaped
 * at runtime (same parser, same node kind) even though the declared return
 * type is the narrower `ProbeNode`. Same established idiom already used
 * throughout `detect/*` (see e.g. `detect/intra-file/repeated-switch.ts`):
 * walk on `ProbeNode`, cast to `AstNode` ONLY at the point `.text`/position
 * is actually read.
 */
function text(node: ProbeNode): string {
  return (node as AstNode).text;
}
function startPos(node: ProbeNode): { row: number; column: number } {
  return (node as AstNode).startPosition;
}

/**
 * Mirrors CONTRATO-F3.md §1.3's `ReferenceRole`/`ReferenceFacts` verbatim.
 * Declared locally (not imported from `facts/types.ts`) because that file is
 * owned by a different agent in this wave and does not exist yet; this
 * module is written to be a drop-in producer for that exact shape once it
 * does — field for field, so `facts/types.ts` can import these types
 * directly or restate them without any translation step.
 */
export type ReferenceRole = "bare" | "receiver-member" | "qualified" | "decl-name" | "parameter" | "key";

export interface ReferenceFacts {
  readonly name: string;
  readonly role: ReferenceRole;
  /** Lexical scope of the use site, outer to inner. Same format as `SymbolFacts.container`. */
  readonly scope: readonly string[];
  /** Receiver/qualifier text for `qualified` and `receiver-member`; `null` otherwise. */
  readonly qualifier: string | null;
  /** See this file's docstring: `true` only when the qualifier is Ruby's `constant` node type. */
  readonly qualifierIsBareConstant: boolean;
  /** A parameter or local binding with this name is visible at the use site. */
  readonly shadowedLocally: boolean;
  readonly line: number;
  readonly column: number;
  /** Occurrences collapsed into this row (dedup by name+role+scope+qualifier). >= 1. */
  readonly occurrences: number;
  /**
   * CONTRATO-F8G.md §3.1, produced by F1 (this file) — see this file's
   * top-of-file docstring, section "`isCallee`", for the two field-shapes
   * (with/without an intermediate member-access node) and the declared Ruby
   * gap. `true` when this leaf (or the member-access it is the member of)
   * fills the `function`/`method`/`name` field of a parent that ALSO
   * resolves `arguments`/`argument_list`. Part of the dedup key alongside
   * `(name, role, scope, qualifier)` — CONTRATO-F8G.md §3.1: the SAME name
   * used once as a callee and once as a plain value in the same scope must
   * stay two rows, not collapse and arbitrarily pick one flag.
   */
  readonly isCallee?: boolean;
  /**
   * Ola P (P2) — LA ARIDAD POR SITIO DE LLAMADA, pedida por N6 (Ola O) y
   * abierta desde entonces: `SymbolFacts.arity` dice cuántos parámetros
   * DECLARÓ quien definió el símbolo, y hasta ahora nada decía cuántos
   * argumentos PASA cada sitio de uso. Los conteos DISTINTOS observados entre
   * las ocurrencias colapsadas en esta fila, ascendentes, sin repetir — un
   * conjunto y no un número porque el dedup del final de `extractReferences`
   * colapsa todas las ocurrencias de `(name, role, scope, qualifier,
   * isCallee)` en una sola fila, y esas ocurrencias pueden pasar 1, 2 o 3
   * argumentos al mismo callee (opcionales, sobrecarga, `*args`); quedarse
   * con una sería elegir al azar. Se fusionan por UNIÓN en el dedup, en vez
   * de "gana el primero", por la misma razón.
   *
   * Se cuenta EXACTAMENTE la misma cosa que `isCallee` mira: los hijos
   * NOMBRADOS del nodo `arguments`/`argument_list` que la gramática resuelve
   * en el sitio de invocación (`argumentsFieldNode` abajo), descontando
   * comentarios (`comment` es un nodo NOMBRADO en tree-sitter y una llamada
   * con un comentario adentro del paréntesis tiene un argumento, no dos).
   * AUSENTE ⇒ este sitio no es una invocación con lista de argumentos
   * resoluble — la MISMA brecha declarada de `isCallee` (Ruby `arr.each { |x|
   * x }` no resuelve `arguments`). `[0]` ⇒ sí es una invocación y pasa cero
   * argumentos: `foo()` resuelve una lista VACÍA pero real, y las dos cosas
   * no son lo mismo.
   */
  readonly argCounts?: readonly number[];
  /**
   * AA6 (Ola AA) — ver la sección `inTypeSlot` del docstring de este archivo
   * para los TRES campos de gramática que lo definen (`type`/`return_type`/
   * `result`), la sonda que los verificó y las dos brechas declaradas.
   *
   * `true` cuando este identificador está escrito, directa o transitivamente,
   * dentro de la RANURA DE TIPO de una declaración. Parte de la clave de
   * dedup junto a `(name, role, scope, qualifier, isCallee)`, por la MISMA
   * razón que `isCallee`: el mismo nombre escrito una vez como tipo y otra
   * como valor en el mismo scope son dos hechos distintos, y colapsarlos
   * obligaría a elegir una bandera al azar.
   *
   * AUSENTE = quien armó estos hechos no lo calculó (un literal a mano en un
   * test, o una fila cacheada de antes de este campo — de ahí el bump de
   * `FACTS_SCHEMA_VERSION`), NUNCA "no está en una ranura de tipo".
   */
  readonly inTypeSlot?: boolean;
}

/**
 * A tiny, DOCUMENTED, cross-grammar vocabulary of "this node's DIRECT named
 * children, positionally, are parameters" — ported from
 * `spikes/cascada-refs/collect.mjs` and re-verified by direct parse of all 9
 * grammars for this task. Field-shape (A) alone cannot see this: a bare Ruby/
 * Python/JS parameter has no field of its own at all.
 */
const PARAM_LIST_TYPES = new Set([
  "formal_parameters",
  "parameter_list",
  "method_parameters",
  "parameters",
  "block_parameters",
]);

/**
 * Plain top-level/local bindings (`x = 1`, `const x = 1`, Go's `var`/`const`/
 * `type` specs) — ported from the spike's `DECLARATOR_TYPES`, re-verified.
 */
const BINDING_DECLARATOR_TYPES = new Set(["variable_declarator", "assignment", "var_spec", "const_spec", "type_spec"]);

/**
 * AA6 (Ola AA) — los TRES campos con los que una gramática escribe una RANURA
 * DE TIPO. Verificados por parse directo (ver la sección `inTypeSlot` del
 * docstring de este archivo para la sonda, los nodos concretos de cada
 * gramática y las dos brechas declaradas). Vocabulario de GRAMÁTICA —
 * nombres de CAMPO, la misma categoría y el mismo estándar que
 * `MEMBER_FIELDS`/`RECEIVER_FIELDS`/`CALLEE_NAME_FIELDS`/
 * `QUALIFIER_PATH_FIELDS` de este mismo archivo.
 */
const TYPE_SLOT_FIELDS = ["type", "return_type", "result"] as const;

/**
 * Leaf node types that can carry a referenceable name, across all 9
 * grammars — ported from `probe/refs/walk.ts`, plus `hash_key_symbol`
 * (Ruby's `key: value` hash-literal shorthand parses the key as its OWN
 * dedicated node type, distinct from `identifier`/`constant`, confirmed by
 * direct parse — the same kind of grammar-specific leaf type this set
 * already existed to enumerate).
 */
const IDENTIFIER_LEAF_TYPES = new Set([
  "identifier",
  "constant",
  "type_identifier",
  "field_identifier",
  "property_identifier",
  "shorthand_property_identifier",
  "shorthand_property_identifier_pattern",
  "hash_key_symbol",
]);

/**
 * Structural rule, not a per-language list — mirrors `graph/symbols.ts`'s own
 * `isBlankName` (same paragraph applies: both copies exist because this
 * wave's file split forbids importing one from the other, see this file's
 * alignment note above). A name made of nothing but underscores can never
 * denote anything: Go's `_` (discard target) is the measured case (`cobra`:
 * one package-level `var _ SliceValue = ...` made globally unique, then
 * every OTHER `_` in the repo — every blank assignment target, `for _, v :=
 * range x`, `_, err := f()` — got tagged `decl-name`/`bare` by this
 * classifier and resolved to it, 186 candidates/weight 269 from 26+
 * unrelated files, all at `global-uniqueness`, the highest-confidence
 * bucket). Applied at the SAME single leaf-entry point every identifier
 * passes through, so it excludes `_` from every role — `decl-name` (both
 * `var _ Iface = ...` and `_, err := f()`), `bare`, `receiver-member` member
 * name, `qualified` — not just the two declaration rules the bug was filed
 * against.
 */
function isBlankName(name: string): boolean {
  return /^_+$/.test(name);
}

/**
 * Ola 9, A1 — copia idéntica de `symbols.ts`'s función del mismo nombre (ver
 * su docstring para la medición completa: `qualified-name` rechazaba 86,5%
 * de newtonsoft-json porque un namespace COMPUESTO —`namespace
 * Newtonsoft.Json.FuzzTests { ... }`, un solo nodo `qualified_name` cuyo
 * `.text` trae los puntos adentro— se empujaba como UN elemento de `scope`
 * en vez de uno por segmento, y la comparación de `container`/`scope` de
 * `resolve.ts#isVisibleFrom` es por ELEMENTO DE ARRAY. Duplicada, no
 * importada, por la misma razón que el resto de este archivo ya duplica de
 * `symbols.ts` (`BINDING_DECLARATOR_TYPES`, `isBlankName`): el split de
 * archivos de esta ola prohíbe importar entre los dos módulos hermanos.
 */
function splitQualifiedSegments(text: string): readonly string[] {
  const parts = text.split(/::|\./).filter((s) => s.length > 0);
  return parts.length > 0 ? parts : [text];
}

/* ═══════════════════════════════════════════════════════════════════════════
 * P4 (Ola P) — EL RECEPTOR DECLARADO, COPIA ESPEJO DE `symbols.ts`.
 *
 * ESTE BLOQUE EXISTE PARA NO ROMPER UNA PROMESA QUE LOS DOS MÓDULOS HACEN.
 * `symbols.ts`'s docstring: "`SymbolFacts.container` para una declaración y
 * `ReferenceFacts.scope` para un sitio de referencia DENTRO de ese mismo
 * contenedor son siempre el MISMO array". `resolve.ts` construye el `from` de
 * cada arista como `symbolNodeId(file, ref.scope)` y el `to` como
 * `symbolNodeId(file, symbolPath)`: los dos lados de esa promesa son
 * literalmente el mismo identificador de nodo.
 *
 * En la Ola P, `symbols.ts` empezó a poner el TIPO RECEPTOR escrito en la
 * declaración dentro de `container` (agrupamiento por tipo: el método cuelga
 * de su tipo y no del archivo). Sin este espejo, una referencia escrita
 * DENTRO del cuerpo de un método con receptor sale con `scope: ["Metodo"]`
 * mientras la declaración pasó a `symbolPath: ["Tipo", "Metodo"]`, y la
 * arista nace de un nodo que NO EXISTE. MEDIDO, sin este bloque: cobra queda
 * con 423 aristas colgadas de 1.455 (29 %), todas con el `from` roto —
 * invisibles para cualquier consumidor que indexe por id de nodo (el primero,
 * `coupling-without-abstraction#projectDependencies`, hace
 * `nodeById.get(edge.from)` y sigue de largo si no está).
 *
 * Es la misma duplicación deliberada que este archivo ya lleva con
 * `BINDING_DECLARATOR_TYPES`, `isBlankName` y `splitQualifiedSegments`: no se
 * importa de `symbols.ts` porque el split de archivos del proyecto lo
 * prohíbe, y las dos copias llevan el mismo párrafo para que un `git grep` de
 * cualquiera de los dos nombres encuentre la otra. SI SE TOCA UNA, SE TOCA LA
 * OTRA.
 * ═══════════════════════════════════════════════════════════════════════ */

/** Espejo de `symbols.ts#DECLARED_RECEIVER_FIELDS` — los campos con los que una DECLARACIÓN escribe su receptor. NO es `RECEIVER_FIELDS` (ése es para receptores en posición de EXPRESIÓN y trae dos campos más). */
const DECLARED_RECEIVER_FIELDS = ["receiver", "object"] as const;

/** Espejo de `symbols.ts#declaredReceiverTypeName` — ver su docstring para el mecanismo (campo `type` + primer hijo nombrado en profundidad) y para por qué devuelve `null` donde el receptor es un objeto y no un tipo escrito. */
function declaredReceiverTypeName(node: ProbeNode): string | null {
  for (const field of DECLARED_RECEIVER_FIELDS) {
    const receiver = node.childForFieldName(field);
    if (!receiver) continue;
    const typed = firstNodeWithTypeField(receiver);
    if (!typed) continue;
    const name = leadingNamedLeafText(typed);
    if (name !== null && !isBlankName(name)) return name;
  }
  return null;
}

/** Espejo de `symbols.ts#firstNodeWithTypeField`. */
function firstNodeWithTypeField(node: ProbeNode, depth = 0): ProbeNode | null {
  const own = node.childForFieldName("type");
  if (own != null) return own;
  if (depth >= 3) return null;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child || !child.isNamed) continue;
    const found = firstNodeWithTypeField(child, depth + 1);
    if (found) return found;
  }
  return null;
}

/** Espejo de `symbols.ts#leadingNamedLeafText`. */
function leadingNamedLeafText(node: ProbeNode, depth = 0): string | null {
  if (depth >= 6) return null;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child || !child.isNamed) continue;
    return leadingNamedLeafText(child, depth + 1);
  }
  const t = text(node);
  return t.length > 0 && !/\s/.test(t) ? t : null;
}

/**
 * Los nombres tipo-clase que ESTE archivo declara a nivel de archivo — la
 * misma guarda que `symbols.ts` aplica en su post-proceso: el agrupamiento
 * por receptor sólo vale cuando el tipo receptor está declarado acá mismo (si
 * vive en otro archivo del paquete, `symbols.ts` deja el método plano y este
 * archivo tiene que dejar el scope plano igual, o la promesa se rompe en la
 * otra dirección). "A nivel de archivo" = sin ningún contenedor
 * function-like/class-like por encima, exactamente el `container.length === 0`
 * del otro lado.
 */
function fileLevelTypeNames(root: ProbeNode, sets: DerivedNodeSets): ReadonlySet<string> {
  const out = new Set<string>();
  const visit = (node: ProbeNode): void => {
    if (!node.isNamed) return;
    if (sets.functionNodes.has(node.type) || sets.classNodes.has(node.type)) {
      if (sets.classNodes.has(node.type)) {
        const nameField = node.childForFieldName("name");
        if (nameField) out.add(text(nameField));
      }
      return; // lo de adentro ya no es "nivel de archivo"
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) visit(child);
    }
  };
  visit(root);
  return out;
}

const RECEIVER_FIELDS = ["receiver", "object", "operand", "expression"];
const MEMBER_FIELDS = ["method", "field", "property", "attribute", "name"];
const QUALIFIER_PATH_FIELDS = ["scope", "module"];

/**
 * CONTRATO-F8G.md §3.1 — see this file's top docstring, section `isCallee`,
 * for the per-grammar verification. The field a CALL/INVOCATION node uses
 * for its own callee name, across all 9 grammars: `function` (JS, TS,
 * Python, Go, C#'s dedicated invocation nodes), `method` (Ruby's `call`,
 * which also carries the receiver as a sibling field when present), `name`
 * (Java's `method_invocation`, same conflation as Ruby).
 */
const CALLEE_NAME_FIELDS = ["function", "method", "name"];

/**
 * CONTRATO-F8G.md §3.1 — a tiny, DOCUMENTED exclusion of node types that
 * share the EXACT `name`+`arguments` field shape of a real invocation but
 * are never one, verified by direct parse (`f1-calls/probe-fields.mjs`,
 * outside `src/`): Java's `annotation` node (`@Target({...})`, `@Retention
 * (...)`) resolves fields `name`+`arguments` — structurally IDENTICAL to
 * `method_invocation` — but an annotation site never invokes a function.
 * Same standing as `PARAM_LIST_TYPES`/`BINDING_DECLARATOR_TYPES` above: (B)
 * a documented node-type vocabulary, used only where (A) field-shape alone
 * cannot disambiguate. Two related shapes were checked and do NOT need this:
 * C#'s `attribute` (`[Obsolete("x")]`) exposes its argument list as a
 * POSITIONAL child, no `arguments`/`argument_list` FIELD at all, so
 * `hasArgumentsField` already returns `false` for it; TS/JS's decorator
 * (`@Component({...})`) wraps a REAL `call_expression`, and a decorator
 * genuinely does invoke a decorator-factory function, so flagging it is
 * correct, not a false positive.
 */
const NON_CALL_NAME_ARGS_TYPES = new Set(["annotation"]);

/**
 * `true` iff `node` resolves an arguments field — the one signal, across all
 * 9 grammars, that separates an invocation from a plain member access
 * (`obj.field`, which never resolves either field name). Presence-only: an
 * EMPTY argument list (`foo()`) still resolves a real (empty) node here.
 */
function argumentsFieldNode(node: ProbeNode): ProbeNode | null {
  return node.childForFieldName("arguments") ?? node.childForFieldName("argument_list");
}

function hasArgumentsField(node: ProbeNode): boolean {
  return argumentsFieldNode(node) != null;
}

/**
 * Ola P (P2) — cuántos argumentos lleva ESA lista. Hijos NOMBRADOS del nodo
 * de argumentos: las comas y los paréntesis son anónimos en tree-sitter, así
 * que no cuentan solos; `comment` SÍ es nombrado y por eso se descuenta —
 * único nombre de tipo de nodo que esta función necesita, vocabulario de
 * gramática (igual standing que `PARAM_LIST_TYPES`/`NON_CALL_NAME_ARGS_TYPES`
 * de arriba), nunca de dominio. Ver `ReferenceFacts.argCounts`.
 */
function countArguments(argsNode: ProbeNode): number {
  let n = 0;
  for (let i = 0; i < argsNode.childCount; i++) {
    const child = argsNode.child(i);
    if (child && child.isNamed && child.type !== "comment") n++;
  }
  return n;
}

/**
 * CONTRATO-F8G.md §3.1 — see this file's top docstring, section `isCallee`,
 * for CASE A / CASE B and the declared Ruby gap. Returns the invocation's
 * ARGUMENTS node (never `null` when `isCallee` is `true`, and `null` exactly
 * when it is `false`), so `isCallee` and `argCounts` (Ola P) read the same
 * shape once instead of walking the two cases twice and risking drift.
 */
function calleeArgumentsNode(node: ProbeNode, parent: ProbeNode | null, grandparent: ProbeNode | null): ProbeNode | null {
  if (!parent) return null;
  // CASE A: bare call in 7 grammars, or WITH-RECEIVER call in Ruby/Java (no intermediate member-access node in either).
  if (fillsField(parent, CALLEE_NAME_FIELDS, node) && !NON_CALL_NAME_ARGS_TYPES.has(parent.type) && hasArgumentsField(parent)) {
    return argumentsFieldNode(parent);
  }
  // CASE B: `obj.method(x)` in the 5 grammars that DO nest a separate member-access node inside the call.
  if (
    grandparent &&
    fillsField(parent, MEMBER_FIELDS, node) &&
    firstFieldNode(parent, RECEIVER_FIELDS) != null &&
    fillsField(grandparent, CALLEE_NAME_FIELDS, parent) &&
    !NON_CALL_NAME_ARGS_TYPES.has(grandparent.type) &&
    hasArgumentsField(grandparent)
  ) {
    return argumentsFieldNode(grandparent);
  }
  return null;
}

/** CONTRATO-F8G.md §3.1 — see this file's top docstring, section `isCallee`, for CASE A / CASE B and the declared Ruby gap. */
function computeIsCallee(node: ProbeNode, parent: ProbeNode | null, grandparent: ProbeNode | null): boolean {
  return calleeArgumentsNode(node, parent, grandparent) != null;
}

function sameNode(a: ProbeNode | null, b: ProbeNode): boolean {
  if (!a || a.type !== b.type) return false;
  const pa = startPos(a);
  const pb = startPos(b);
  return pa.row === pb.row && pa.column === pb.column;
}

function fillsField(parent: ProbeNode, fields: readonly string[], node: ProbeNode): boolean {
  return fields.some((f) => sameNode(parent.childForFieldName(f), node));
}

function firstFieldNode(parent: ProbeNode, fields: readonly string[]): ProbeNode | null {
  for (const f of fields) {
    const c = parent.childForFieldName(f);
    if (c) return c;
  }
  return null;
}

interface RoleResult {
  role: ReferenceRole;
  qualifier: string | null;
  qualifierIsBareConstant: boolean;
}

/** The classifier documented at the top of this file, steps 1-9 in order. */
function classifyRole(
  node: ProbeNode,
  parent: ProbeNode | null,
  grandparent: ProbeNode | null,
  sets: DerivedNodeSets,
): RoleResult {
  const none: Omit<RoleResult, "role"> = { qualifier: null, qualifierIsBareConstant: false };
  if (!parent) return { role: "bare", ...none };

  // 1. object/hash/dict key
  if (fillsField(parent, ["key"], node)) return { role: "key", ...none };

  // 2. bare parameter — direct positional child of a parameter list
  if (PARAM_LIST_TYPES.has(parent.type)) return { role: "parameter", ...none };

  // 3. a function/class's own declared name
  if (fillsField(parent, ["name"], node) && (sets.functionNodes.has(parent.type) || sets.classNodes.has(parent.type))) {
    return { role: "decl-name", ...none };
  }

  // 4. wrapped parameter — one node above the bare case, name/pattern/left field
  if (fillsField(parent, ["name", "pattern", "left"], node) && grandparent && PARAM_LIST_TYPES.has(grandparent.type)) {
    return { role: "parameter", ...none };
  }

  // 5. plain top-level/local binding
  if (fillsField(parent, ["name", "left"], node) && BINDING_DECLARATOR_TYPES.has(parent.type)) {
    return { role: "decl-name", ...none };
  }

  // 6. lista de destinos de un binding — los identificadores del lado
  // izquierdo viven en un `expression_list` sin campo propio; el
  // `expression_list` sí llena `left`. Ver el paso 6 del docstring de este
  // archivo para por qué ya no se exige `short_var_declaration` por nombre.
  if (parent.type === "expression_list" && grandparent && sameNode(grandparent.childForFieldName("left"), parent)) {
    return { role: "decl-name", ...none };
  }

  // 7. qualified namespace/type path (Ruby `scope_resolution`, TS `nested_type_identifier`)
  if (fillsField(parent, ["name"], node)) {
    const qualifierNode = firstFieldNode(parent, QUALIFIER_PATH_FIELDS);
    if (qualifierNode) {
      return { role: "qualified", qualifier: text(qualifierNode), qualifierIsBareConstant: qualifierNode.type === "constant" };
    }
  }

  // 8. member of an explicit receiver — call or plain access, any of the 9 grammars
  if (fillsField(parent, MEMBER_FIELDS, node)) {
    const receiverNode = firstFieldNode(parent, RECEIVER_FIELDS);
    if (receiverNode) {
      return {
        role: "receiver-member",
        qualifier: text(receiverNode),
        qualifierIsBareConstant: receiverNode.type === "constant",
      };
    }
  }

  // 9. plain candidate — includes the receiver identifier itself
  return { role: "bare", ...none };
}

/**
 * Every bound name introduced by a parameter list — bare children (2) and
 * wrapped ones (4), same tests as `classifyRole`, applied to the params
 * subtree alone. Used to seed local-shadow tracking for the function body.
 */
function collectParamNames(params: ProbeNode, out: Set<string>): void {
  const scan = (node: ProbeNode, parent: ProbeNode | null, grandparent: ProbeNode | null): void => {
    if (!node.isNamed) return;
    if (IDENTIFIER_LEAF_TYPES.has(node.type)) {
      if (parent && PARAM_LIST_TYPES.has(parent.type)) {
        out.add(text(node));
        return;
      }
      if (parent && fillsField(parent, ["name", "pattern", "left"], node) && grandparent && PARAM_LIST_TYPES.has(grandparent.type)) {
        out.add(text(node));
      }
      return;
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) scan(child, node, parent);
    }
  };
  scan(params, null, null);
}

/**
 * One walk per file: every reference candidate, with role + receiver
 * evidence + lexical context. Pure and synchronous, over an ALREADY-PARSED
 * node — the caller (this task's contract: `facts/extract.ts`, another
 * agent's file) owns parsing and `tree.delete()`, exactly like
 * `code-analyzer.ts`'s `walkFile`/`code-grammar.ts`'s `deriveNodeSets`. No
 * resolution happens here — see this file's docstring.
 */
export function extractReferences(root: AstNode, sets: DerivedNodeSets): readonly ReferenceFacts[] {
  const raw: ReferenceFacts[] = [];
  const scopeStack: string[] = [];
  const localsStack: Set<string>[] = [];
  // P4 (Ola P) — una pasada barata previa; ver `fileLevelTypeNames`. En las
  // ocho gramáticas sin receptor declarado este conjunto se calcula y no se
  // consulta nunca (ninguna declaración resuelve un campo `receiver`/`object`).
  const tiposDeArchivo = fileLevelTypeNames(root, sets);

  const isShadowed = (name: string): boolean => localsStack.some((s) => s.has(name));
  const addLocal = (name: string): void => {
    if (localsStack.length > 0) localsStack[localsStack.length - 1]!.add(name);
  };

  const walk = (node: ProbeNode, parent: ProbeNode | null, grandparent: ProbeNode | null, inTypeSlot: boolean): void => {
    if (!node.isNamed) return;

    if (IDENTIFIER_LEAF_TYPES.has(node.type)) {
      const name = text(node);
      // `_` (or any run of bare underscores) never denotes anything — see
      // `isBlankName`'s docstring. Bail BEFORE role classification so it is
      // excluded from every role uniformly, not just the declaration ones.
      if (isBlankName(name)) return;
      const { role, qualifier, qualifierIsBareConstant } = classifyRole(node, parent, grandparent, sets);
      const shadowedLocally = isShadowed(name);
      // Ola P (P2) — una sola lectura de la forma de invocación para las dos
      // cosas: `isCallee` (¿es un sitio de llamada?) y `argCounts` (¿con
      // cuántos argumentos?). Ver `calleeArgumentsNode`.
      const argsNode = calleeArgumentsNode(node, parent, grandparent);
      const isCallee = argsNode != null;
      const pos = startPos(node);
      raw.push({
        name,
        role,
        scope: [...scopeStack],
        qualifier,
        qualifierIsBareConstant,
        shadowedLocally,
        line: pos.row + 1,
        column: pos.column,
        occurrences: 1,
        isCallee,
        inTypeSlot,
        ...(argsNode ? { argCounts: [countArguments(argsNode)] } : {}),
      });
      // A parameter binding or a local declaration shadows the rest of its
      // enclosing function scope, starting from the NEXT occurrence — this
      // one's own `shadowedLocally` was already computed above, before it.
      //
      // Ola 9, A2 — MEDIDO: `local-shadow` rechazaba 65,6% de los candidatos
      // de lodash (mismo lenguaje, mismo cascada: preact 8,7%). `role ===
      // "decl-name"` cubre DOS formas distintas (`classifyRole` pasos 3 y
      // 5/6) que este bloque trataba idénticamente: (a) el nombre PROPIO de
      // una función/clase (`function baseEach(...) {}` — su propio
      // `identifier` en la posición `name`) y (b) un binding plano
      // (`variable_declarator`/`assignment`/Go `:=`). `symbols.ts` sólo
      // omite (b) de la tabla de símbolos cuando es local a una función — a
      // (a) SIEMPRE la registra, sin importar el anidamiento (ver su
      // `walk`: el branch `functionLike || classLike` llama `record`
      // incondicionalmente). lodash envuelve TODO el archivo en una única
      // IIFE con cientos de `function foo(...) {}` anidadas unas junto a
      // otras — antes de este fix, la propia declaración de cada una
      // (`role: "decl-name"`, forma (a)) se agregaba a `addLocal` del frame
      // de la IIFE, así que CUALQUIER llamada posterior desde una función
      // hermana (`arrayAggregator` llamando a `iteratee`, `wrap` llamando a
      // `cloneByPath`, ambas declaradas junto a la llamante dentro de
      // `runInContext`/`baseConvert`) se marcaba `shadowedLocally: true` y
      // se rechazaba — aunque el destino correcto YA estuviera en la tabla
      // de símbolos, a un salto de distancia. preact, sin ese envoltorio
      // IIFE gigante (ES modules, funciones top-level), casi no dispara
      // este caso. La forma (a) NUNCA debe sombrear: es la señal MISMA que
      // `qualified-name`/`global-uniqueness` necesitan para resolver la
      // llamada, no una variable local sin símbolo. Mismo test estructural
      // que `classifyRole` paso 3 (no un vocabulario nuevo).
      const isOwnFunctionOrClassName =
        role === "decl-name" && parent != null && fillsField(parent, ["name"], node) && (sets.functionNodes.has(parent.type) || sets.classNodes.has(parent.type));
      if ((role === "parameter" || role === "decl-name") && !isOwnFunctionOrClassName) addLocal(name);
      return; // identifier-like leaves are terminal in every supported grammar
    }

    const isContainer = sets.functionNodes.has(node.type) || sets.classNodes.has(node.type);
    const nameField = isContainer ? node.childForFieldName("name") : null;

    // AA6 (Ola AA) — la RANURA DE TIPO se resuelve UNA VEZ POR NODO, no una
    // vez por hijo: tres `childForFieldName` acá contra tres por arista
    // padre-hijo si se preguntara adentro del bucle. Y una vez prendida la
    // bandera no se vuelve a preguntar nada (`inTypeSlot` corta el cálculo),
    // porque el hecho es transitivo: todo lo que cuelga de la ranura de tipo
    // sigue estando en la ranura de tipo.
    const typeSlotChildren: ProbeNode[] = [];
    if (!inTypeSlot) {
      for (const f of TYPE_SLOT_FIELDS) {
        const c = node.childForFieldName(f);
        if (c) typeSlotChildren.push(c);
      }
    }
    const childInTypeSlot = (child: ProbeNode): boolean =>
      inTypeSlot || typeSlotChildren.some((t) => sameNode(t, child));

    // The container's OWN name is a `decl-name` reference too (see the walk's
    // leaf branch above), but it denotes the container from the OUTSIDE — it
    // is not inside its own scope. So it is visited BEFORE the scope push,
    // with the enclosing (outer) `scopeStack`/`localsStack` still in effect —
    // same reasoning `code-analyzer.ts`'s `walkFile` already applies when it
    // skips re-visiting the name node as a plain child.
    if (nameField) walk(nameField, node, parent, childInTypeSlot(nameField));

    let pushedScopeCount = 0;
    let pushedLocals = false;
    if (sets.functionNodes.has(node.type)) {
      // P4 (Ola P) — EL RECEPTOR DECLARADO, espejo de `symbols.ts` (ver el
      // bloque de `declaredReceiverTypeName` arriba). Se empuja ANTES que los
      // segmentos del nombre propio, y sólo desde el nivel de archivo, para
      // que `scope` quede idéntico al `container` + `name` de la declaración.
      if (scopeStack.length === 0) {
        const receiverType = declaredReceiverTypeName(node);
        if (receiverType !== null && tiposDeArchivo.has(receiverType)) {
          scopeStack.push(receiverType);
          pushedScopeCount++;
        }
      }
      if (nameField) {
        // COMPUESTO (namespace punteado) ⇒ un `scopeStack.push` por
        // segmento — ver `splitQualifiedSegments`'s docstring, mismo motivo
        // que el lado de la declaración en `symbols.ts`. Un identificador
        // simple produce un array de un solo elemento, sin cambio de
        // comportamiento.
        const segments = splitQualifiedSegments(text(nameField));
        for (const seg of segments) scopeStack.push(seg);
        pushedScopeCount += segments.length; // `+=`: el receptor de arriba ya puede haber empujado uno
      }
      const params = node.childForFieldName("parameters") ?? node.childForFieldName("parameter_list");
      const paramNames = new Set<string>();
      if (params) collectParamNames(params, paramNames);
      localsStack.push(paramNames);
      pushedLocals = true;
    } else if (sets.classNodes.has(node.type)) {
      if (nameField) {
        const segments = splitQualifiedSegments(text(nameField));
        for (const seg of segments) scopeStack.push(seg);
        pushedScopeCount = segments.length;
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && !(nameField && sameNode(child, nameField))) walk(child, node, parent, childInTypeSlot(child));
    }

    if (pushedLocals) localsStack.pop();
    for (let i = 0; i < pushedScopeCount; i++) scopeStack.pop();
  };

  walk(root, null, null, false);

  // Dedup by (name, role, scope, qualifier, isCallee): keep the FIRST
  // occurrence's position and flags, sum the count. Mandated by
  // CONTRATO-F3.md §1.3, `isCallee` added to the key per
  // CONTRATO-F8G.md §3.1: the SAME name used once as a callee and once
  // as a plain value in the same scope must stay two rows, not collapse
  // and arbitrarily pick one flag.
  //
  // Ola P (P2): `argCounts` es la ÚNICA excepción a "gana el primero" — se
  // fusiona por UNIÓN (ver su docstring en `ReferenceFacts`). Dos sitios de
  // llamada al mismo nombre en el mismo scope con distinta cantidad de
  // argumentos son dos hechos, no uno; quedarse con el primero convertiría
  // "los llamadores pasan 1 o 3" en "los llamadores pasan 1".
  const byKey = new Map<string, ReferenceFacts & { occurrences: number; argCounts?: number[] }>();
  for (const r of raw) {
    // AA6 (Ola AA): `inTypeSlot` entra a la clave por la MISMA razón que
    // `isCallee` — el mismo nombre escrito una vez como TIPO y otra como
    // VALOR en el mismo scope son dos hechos, y colapsarlos obligaría a
    // quedarse con una bandera al azar.
    const key = `${r.name}\0${r.role}\0${r.scope.join("\x01")}\0${r.qualifier ?? ""}\0${r.isCallee ? 1 : 0}\0${r.inTypeSlot ? 1 : 0}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.occurrences++;
      if (r.argCounts) {
        if (!existing.argCounts) existing.argCounts = [...r.argCounts];
        else for (const n of r.argCounts) if (!existing.argCounts.includes(n)) existing.argCounts.push(n);
      }
    } else {
      const { argCounts, ...rest } = r;
      byKey.set(key, { ...rest, ...(argCounts ? { argCounts: [...argCounts] } : {}) });
    }
  }
  for (const r of byKey.values()) r.argCounts?.sort((a, b) => a - b);
  return [...byKey.values()];
}
