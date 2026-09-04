/**
 * Extracts DECLARED, NAMED units from an already-parsed file — CONTRATO-F3.md
 * §1.3's `SymbolFacts`. This is the OTHER half of `graph/references.ts`
 * (another agent's file, read but not edited here): that module describes
 * SITES OF USE, this one describes SITES OF DECLARATION. Neither resolves
 * anything — matching a reference candidate against a symbol is
 * `graph/resolve.ts`'s job (a third agent's file), not this one's.
 *
 * *** DELIBERATELY ALIGNED WITH `graph/references.ts`, NOT RE-DERIVED. ***
 * The starting hypothesis handed down for this task was "the node has a
 * `name` field" (verified against real dumps of all 9 grammars — see
 * `revision2/probe/1-name-field-nodes.mjs` and `revision2/probe/decls/`,
 * both read before writing this). That hypothesis alone is TOO WIDE: a
 * receiver-qualified member access (C#'s `member_access_expression.name`,
 * Java's `field_access.field` is a different field but several grammars use
 * `name` for both a declaration AND a qualified-access target) and a scoped
 * type path (Ruby's `scope_resolution`, TS's `nested_type_identifier`) BOTH
 * expose a `name` field on their own node without being a declaration at
 * all — confirmed by direct probe, not assumed. `graph/references.ts`
 * already solved exactly this discrimination problem for the USE side
 * (its 9-step role classifier); this module reuses the SAME node-type
 * classification for function-like/class-like (`DerivedNodeSets`, the
 * identical `sets.functionNodes`/`sets.classNodes` membership test
 * `code-analyzer.ts` and `references.ts` both already use) and the SAME
 * small, documented, cross-grammar vocabulary for plain bindings
 * (`BINDING_DECLARATOR_TYPES`, mirrored — not imported, since
 * `references.ts` keeps it module-private and this wave's file split
 * forbids editing that file — from its own `BINDING_DECLARATOR_TYPES`).
 * Divergence risk is real and is called out explicitly, not hidden: if a
 * future edit changes either file's copy of that vocabulary without the
 * other, a declaration in `symbols.ts` and the reference site that should
 * resolve to it (`references.ts`'s role 5, "decl-name, plain binding") drift
 * apart silently. Both copies carry this same paragraph so a `git grep` on
 * either name finds the other.
 *
 * Container/qualified-name derivation is the SAME ancestor-nesting mechanism
 * `revision2/probe/decls/q3-qualified-name.mjs` measured and confirmed
 * across ruby/typescript/python/java/csharp (`Admin.DealPolicy`,
 * `Outer.Inner.Widget`, `Outer.Inner`, `Outer.Inner`, `Outer.Sub.Widget.
 * Nested`) — a stack of enclosing NAMED function-like/class-like nodes,
 * pushed exactly where `references.ts` pushes its own `scopeStack` (same
 * `sets.functionNodes`/`classNodes` membership, same "only push if the
 * container itself has a name" rule), so `SymbolFacts.container` for a
 * declaration and `ReferenceFacts.scope` for a reference site inside that
 * SAME container are always the identical array — required for the
 * lexical-visibility resolution stage (CONTRATO-F3.md §3.3's
 * `qualified-name` stage) to compare them directly, with no translation.
 *
 * ── DECLARED GAPS (measured, not guessed — see this task's final report for
 *    the corpus counts) ──────────────────────────────────────────────────
 *
 * 1. **A method-to-type association carried by a `receiver` FIELD is
 *    invisible to ancestor nesting — CERRADA EN SUS DOS MITADES
 *    (`memberOfClassLike`: N9, Ola O · `container`: P4, Ola P).**
 *    `q3-qualified-name.mjs`'s own Go probe proved the shape: a
 *    `method_declaration`'s receiver type sits in a `receiver` FIELD, not in
 *    an ancestor `type_declaration` — Go does not nest a method inside its
 *    receiver's declaration at the AST level at all (confirmed: the probe's
 *    Go case produced an EMPTY ancestor-container chain, the only language
 *    of the six it tried where that happened).
 *    MITAD 1, ALCANZABILIDAD (N9): `memberOfClassLike` ya no depende sólo del
 *    anidamiento. La EXISTENCIA del campo (nunca su contenido) es forma de
 *    campo pura y basta para responder la única pregunta que ese hecho
 *    contesta — "¿se llega a este símbolo por nombre desnudo?" — cuya
 *    respuesta con receptor escrito es NO. Ver `DECLARED_RECEIVER_FIELDS`
 *    más abajo para la evidencia medida (1.724 aristas falsas en hugo hacia
 *    un único método de Go llamado `error`).
 *    MITAD 2, AGRUPAMIENTO (P4): `container` ya NO queda vacío. El argumento
 *    que lo bloqueaba —"leer el nombre exigiría desenvolver
 *    `pointer_type`/`type_identifier` por nombre de nodo"— valía para una
 *    lista escrita a mano, no para la lectura estructural de
 *    `declaredReceiverTypeName` (campo `type` + primer hijo nombrado en
 *    profundidad), que no nombra un solo tipo de nodo ni un solo lenguaje.
 *    La simetría `container` ↔ `ReferenceFacts.scope` se preserva donde
 *    importa: el receptor NO se empuja al `scopeStack`, así que sólo el
 *    método mismo cambia de contenedor y ninguna declaración anidada bajo él
 *    hereda un segmento que el lado de las referencias no vería. BRECHA QUE
 *    QUEDA, declarada: si el tipo receptor está declarado en OTRO archivo del
 *    paquete, el método sigue plano (ver el post-proceso de `extractSymbols`
 *    para por qué la alternativa fabricaría una arista `contains` colgada de
 *    un nodo inexistente).
 * 2. **TypeScript/JS namespace blocks (`internal_module`, `namespace Foo {
 *    }`) AND C#'s `namespace_declaration` are invisible to
 *    `DerivedNodeSets.classNodes` for the typescript/tsx/javascript/vue and
 *    csharp language families, in production.** Not because field-shape
 *    introspection cannot see them (`q3-qualified-name.mjs`'s `QUALIFIED_TS`/
 *    `QUALIFIED_CSHARP` cases both parse their namespace node with a `name`
 *    AND a `body` field, structurally class-like — confirmed by direct
 *    parse) — because `code-analyzer.ts`'s own `TS_FAMILY_PROBE`/
 *    `JS_FAMILY_PROBE`/`CSHARP_PROBE` (the representative source
 *    `deriveNodeSets` is run against ONCE per language, cached for the
 *    process) never contains a `namespace`/`module` block for either family
 *    (confirmed by direct inspection of `code-analyzer.ts`'s probe
 *    constants), so `internal_module`/`namespace_declaration` never enter
 *    `classNodes` in production. This module deliberately reuses `sets`
 *    rather than re-deriving live per file (see the alignment note above)
 *    precisely so it agrees with `references.ts` and the rest of the
 *    pipeline — which means it inherits this exact limitation rather than
 *    silently disagreeing with its sibling module. Reported, not patched:
 *    patching it here alone would make this module see a namespace as a
 *    container while `references.ts` still does not, which is a worse bug
 *    than the shared gap. This module's own test derives its OWN `sets`
 *    from probe sources that DO include a namespace block, to demonstrate
 *    that `extractSymbols` itself handles the construct correctly — the gap
 *    is entirely in what `code-analyzer.ts`'s two probe constants exercise,
 *    fixable in one place by whoever owns that file adding one `namespace`
 *    block to each, not in this module.
 * 3. **A "plain binding" whose grammar node type is not in
 *    `BINDING_DECLARATOR_TYPES`** (confirmed concretely: C#'s
 *    `property_declaration`, e.g. `public string PublicProp { get; set; }`,
 *    carries its own `name` field directly, with no `variable_declarator`
 *    wrapper the way a C# field does) **is invisible to the `other` family.**
 *    This is the same list `references.ts` uses for its role-5 check, so
 *    the gap is genuinely SHARED (a `PublicProp` reference site is not
 *    tagged `decl-name` there either) rather than this module alone falling
 *    short of what the reference side already promises.
 */
import { CONSTRUCTOR_NAMES, type DerivedNodeSets } from "../code-grammar.js";
import type { AstNode } from "../detect/types.js";
import type { Visibility } from "./types.js";

/**
 * Mirrors CONTRATO-F3.md §1.3's `SymbolFamily` verbatim.
 *
 * "namespace-like" is NOT a separate grammar-level category the way
 * `code-grammar.ts` derives `classNodes`/`functionNodes` (no supported
 * grammar's node TYPE reliably distinguishes "class" from "pure namespace" —
 * Ruby uses `module` for both roles, TS's `internal_module` covers what this
 * project calls both a namespace and, historically, an ambient module). It
 * is instead a RUNTIME refinement of `class-like`: a class-like node whose
 * body's direct named children are ALL themselves declarations (see
 * `isDeclOnlyBody` below) reads as an organizational container, not a real
 * class with its own instance methods/state, and reclassifies here. The
 * same field, `namespaceContainerOnly`, is stored separately (redundant with
 * this on purpose — CONTRATO-F3.md §1.3 lists it as its own field so
 * `graph/resolve.ts`'s `namespace-container` stage never has to recompute
 * "family === namespace-like" itself).
 */
export type SymbolFamily = "class-like" | "function-like" | "namespace-like" | "other";

/** Mirrors CONTRATO-F3.md §1.3's `SymbolFacts` verbatim — see this file's docstring for why it is declared here rather than imported from `facts/types.ts` (owned by a different agent this wave, does not exist yet). */
export interface SymbolFacts {
  /** Name as declared, UNqualified. */
  readonly name: string;
  /** Enclosing NAMED units, outer to inner. Empty = file level. Same format/values as `references.ts`'s `ReferenceFacts.scope`. */
  readonly container: readonly string[];
  /** Grammar node type, verbatim — never an invented label. */
  readonly nodeType: string;
  /**
   * NUEVO, Ola S (S1). EL MISMO HECHO QUE `nodeType`, UN NIVEL MÁS ABAJO,
   * cuando la gramática no lo escribe en el nodo declarante: el `nodeType`
   * —también verbatim, también sin etiqueta inventada— del hijo del campo
   * `type` de la declaración.
   *
   * POR QUÉ, MEDIDO POR SONDA DIRECTA sobre las 6 gramáticas del corpus
   * (`scripts/s1-probe-forma-tipo.mts`, esta ola — nunca leído de una tabla):
   * un nodo class-like de java/csharp/typescript/python/ruby escribe la FORMA
   * del tipo en su propio `nodeType` (`class_declaration` vs.
   * `interface_declaration`) y expone `body`, nunca `type`. Go es el único
   * que NO: `type Foo interface {...}` y `type Foo struct {...}` son los DOS
   * el MISMO `type_spec` (sin `body`), y la forma vive en su campo `type`
   * (`interface_type` / `struct_type`). Sin este campo, todo consumidor que
   * pregunte "¿esto es un contrato o una implementación?" es CIEGO en Go —
   * medido esta ola: los 27 candidatos de `speculative-abstraction` de
   * `corpus/hugo` son, los 27, `type_spec` de los dos lados.
   *
   * La regla es de FORMA, no de lenguaje: "la declaración expone un campo
   * `type`" — la MISMA prueba estructural que `code-grammar.ts#isGoTypeSpecLike`
   * ya usa (`hasField(node, "name") && hasField(node, "type")`). Ninguna
   * gramática más la satisface hoy en un nodo class-like; si una futura la
   * satisficiera, el campo diría lo que ESA gramática escribió, sin ninguna
   * rama por nombre de lenguaje.
   *
   * `undefined` = la declaración no expone campo `type` (el caso normal: la
   * forma ya está en `nodeType`) o el símbolo no es tipo-clase. NUNCA "no
   * tiene forma". Sólo se computa para `class-like`/`namespace-like`: "¿de
   * qué forma es este TIPO?" no es una pregunta que tenga sentido para una
   * función o un binding suelto, y computarlo ahí sólo agregaría ruido
   * (`var_spec`/`const_spec` de Go también exponen `type`).
   */
  readonly shapeNodeType?: string;
  readonly family: SymbolFamily;
  /**
   * The N1-a rule: this symbol is never resolved by a bare, unqualified
   * name. `true` when there IS an immediate enclosing container and its
   * family is `"class-like"` OR `"namespace-like"` — a Ruby `def self.build`
   * inside `module Helper` needs `Helper.build` from outside exactly like a
   * real class's method needs a receiver (measured: the spike's own
   * `memberOk` check excluded EVERY method regardless of class vs. module —
   * `spikes/cascada-refs/collect.mjs`). `false` when the immediate container
   * is `"function-like"` (a nested closure, resolved by ordinary lexical
   * scoping, not method dispatch) or absent (top level).
   */
  readonly memberOfClassLike: boolean;
  /** This symbol's own body holds only nested declarations — it is an organizational container, not a referenceable "thing" in its own right. Always `false` outside `family === "class-like" | "namespace-like"`. */
  readonly namespaceContainerOnly: boolean;
  readonly startLine: number;
  readonly endLine: number;
  readonly nameLine: number;
  readonly nameColumn: number;
  /**
   * CONTRATO-F8G.md §2. Count of declared parameters — only computed for
   * `family === "function-like"` (`undefined` for `class-like`/
   * `namespace-like`/`other`: arity is a function concept, not "F2 hasn't
   * run"). `null` = the grammar exposed no parameter-list field for THIS
   * node (Ruby's paren-less `def next` — see `computeArity`'s docstring);
   * `0` = the field was present and empty. See `computeArity` below for the
   * derivation (same field pair `references.ts#extractReferences` already
   * reads to seed `collectParamNames` — no new vocabulary).
   */
  readonly arity?: number | null;
  /**
   * CONTRATO-F8G.md §2. Only computed where `record`'s own declaration
   * `node` (function-like/class-like/namespace-like — see `computeVisibility`'s
   * docstring for why `other`, plain bindings, is a declared gap) has a
   * DIRECT child whose grammar node TYPE is in `MODIFIER_NODE_TYPES` and
   * whose text carries one of the four canonical words. ABSENT ≠ public —
   * absent means "this language/node exposes no visibility slot", never
   * inferred from name or capitalization.
   */
  readonly visibility?: Visibility;
  /**
   * B1 (eslabón 2, ORDEN-DE-ATAQUE.md #2) — la señal que `graph/resolve.ts`'s
   * nueva etapa `module-reachability` necesita para decidir si un candidato
   * SIN arista `imports` directa que lo cubra es de todos modos alcanzable
   * desde otro archivo. OPCIONAL a propósito (mismo motivo que `arity`/
   * `visibility`: un campo requerido habría obligado a tocar cada literal de
   * `SymbolFacts` construido a mano en `build.test.ts`, dueño distinto esta
   * ola — `resolve.ts` trata AUSENTE como `true`, ver su propio docstring),
   * pero `extractSymbols` (el único productor real) SIEMPRE lo puebla, nunca
   * lo deja `undefined`.
   *
   * Estructural, nunca por nombre/capitalización — misma disciplina que
   * `computeVisibility`'s "ausente ≠ privado". Verificado por parse directo
   * (`web-tree-sitter` + `tree-sitter-wasms`, las 9 gramáticas, sonda ad-hoc
   * antes de escribir esto — nunca leído de una tabla): DOS fuentes de
   * evidencia NEGATIVA; todo lo demás (Ruby, Python, Go: ninguna gramática
   * expone un nodo "export" ni una regla de visibilidad de archivo — Ruby's
   * `private_constant`/`private`/`public` son LLAMADAS A MÉTODO, no
   * modificadores, la misma exclusión que ya hace `computeVisibility`) queda
   * en el default permisivo `true` — DECLARADO, no adivinado:
   *
   *   1. TypeScript/JavaScript/TSX (y Vue vía su `<script>` embebido, que
   *      `code-analyzer.ts#extractVueScript` re-parsea con la MISMA
   *      gramática — confirmado por prueba, no una regla nueva para Vue):
   *      un top-level (`container.length === 0`) function-like/class-like/
   *      `other` NO envuelto por un `export_statement` (campo `declaration`
   *      — confirmado por parse directo: `export class Foo{}`, `export
   *      default class Foo{}`, `export const x=1` los tres exponen ese
   *      campo apuntando a la declaración real) es genuinamente
   *      module-privado en ESM — `false` ahí, PERO sólo cuando el ARCHIVO
   *      usa la sintaxis de export en algún otro lugar (`extractSymbols`'s
   *      `sawExportWrapper`): un archivo que jamás escribe `export` no
   *      prueba que su gramática distinga exportado/no-exportado (podría
   *      no ser TS/JS en absoluto, o ser un `.ts` de sólo efectos), así
   *      que ahí el default permisivo gana. BRECHA DECLARADA: `export {
   *      Nombre }` (lista de re-export de un identificador YA declarado
   *      SIN `export` en su propio sitio) exige correlacionar el
   *      identificador contra su declaración en una segunda pasada — no
   *      intentado, reportado.
   *   2. Java/C#: reusa `computeVisibility` (cero vocabulario nuevo):
   *      `visibility === "private"` ⇒ `false`. Ausencia de modificador
   *      (package-private de Java, internal-por-default de C# sin
   *      modificador) queda `true` — más permisivo que la semántica real
   *      (un paquete no es todo el repo), elegido a propósito: un falso
   *      `true` de más acá sólo devuelve un candidato a `path-proximity`,
   *      el comportamiento de ANTES de esta etapa; un falso `false`
   *      descartaría un candidato genuino.
   */
  readonly exported?: boolean;
  /**
   * NUEVO, Ola U (C2) — HUECO DE GRAFO #2 del `PLAN-INTENCIONES.md`: **el
   * TIPO DE RETORNO ESCRITO** de un miembro. Sólo `family ===
   * "function-like"`.
   *
   * QUÉ PREGUNTA CONTESTA, y por qué no alcanzaba con `(nombre, aridad)`:
   * "¿estos dos miembros homónimos DEVUELVEN lo mismo?". `MemberSignature`
   * comparaba por nombre y aridad nada más, así que dos miembros con firmas
   * INCOMPATIBLES daban coincidencia perfecta. El caso medido está en el
   * plan con archivo y línea: `newtonsoft-json/Src/Newtonsoft.Json/Bson/
   * BsonToken.cs:52-54` (`BsonObject.GetEnumerator` → `IEnumerator<
   * BsonProperty>`) y `:75-77` (`BsonArray.GetEnumerator` →
   * `IEnumerator<BsonToken>`) — mismo nombre, misma aridad 0, cuerpos
   * textualmente idénticos, y tipos de retorno que NO se pueden unificar.
   *
   * VERBATIM, salvo espacios. Es el texto que la gramática escribió, sin
   * resolver, sin normalizar nombres y sin desenvolver genéricos: un
   * `IEnumerator<BsonProperty>` viaja entero, porque la pregunta es de
   * IGUALDAD ESCRITA entre dos miembros del MISMO repo, no de identidad de
   * tipo (dos nombres distintos pueden ser el mismo tipo vía `using`/alias —
   * eso es resolución, y esta ola no la hace). Lo único que se normaliza son
   * las corridas de espacio en blanco (una gramática puede partir un
   * genérico en varias líneas y las dos escrituras del MISMO tipo tienen que
   * comparar iguales) y el envoltorio de anotación de UN SOLO hijo (ver
   * `computeReturnType`).
   *
   * `undefined` = **NO SE SABE**, jamás "no devuelve nada": o la gramática
   * no expone ranura de tipo de retorno (Ruby, JavaScript — ninguna la
   * tiene), o el autor no la escribió (`def bare(self):` de Python,
   * `noRet() {}` de TypeScript), o el símbolo no es function-like. Quien lo
   * lea tiene que tratar ausente como un `no sé`: DOS ausentes NO son un
   * acuerdo, y un ausente contra un presente NO es un desacuerdo.
   *
   * Verificado por parse directo de las 6 gramáticas del corpus
   * (`scripts/probes/u-c2-formas.mts`, esta ola — nunca leído de una tabla):
   * python/typescript escriben `return_type`, go escribe `result`,
   * java/csharp escriben `type`, ruby no escribe nada.
   */
  readonly returnType?: string;
}

/**
 * See this file's docstring's alignment note: MUST stay identical to
 * `graph/references.ts`'s own `BINDING_DECLARATOR_TYPES`. Plain top-level/
 * local bindings a field-shape test cannot discriminate from any other use
 * of a `name`/`left` field — ported from the spike's `DECLARATOR_TYPES`
 * (`spikes/cascada-refs/collect.mjs`), re-verified by direct parse.
 */
const BINDING_DECLARATOR_TYPES = new Set(["variable_declarator", "assignment", "var_spec", "const_spec", "type_spec"]);

/**
 * `SymbolFacts.exported`'s única fuente de evidencia POSITIVA — el nodo que
 * ENVUELVE una declaración exportada en la familia TypeScript/JavaScript
 * (typescript/tsx/javascript, y vue vía su `<script>` embebido, que se
 * re-parsea con esta MISMA gramática). Confirmado por parse directo, no
 * adivinado: `export class Foo{}`, `export function bar(){}`, `export const
 * x=1`, `export default class Baz{}` y `export default function qux(){}`
 * comparten el MISMO tipo de nodo, `export_statement`, con un campo
 * `declaration` apuntando a la declaración real (`export default` sólo
 * agrega un token anónimo `default` de más entre medio, el campo sigue
 * resolviendo igual). Único caso donde `declaration` sale `null`:
 * `export { Nombre };` (una lista de re-export de identificadores YA
 * declarados en otro lado sin su propio `export`) — brecha declarada, ver
 * el docstring de `SymbolFacts.exported`.
 *
 * Ningún otro de los 9 lenguajes soportados produce este tipo de nodo (Java
 * comparte el NOMBRE `class_declaration` con TypeScript para una clase, pero
 * nunca produce `export_statement` — cada llamada a `extractSymbols` recorre
 * el árbol de UNA sola gramática a la vez, así que la coincidencia de
 * nombre entre dos gramáticas distintas nunca se cruza acá), así que
 * buscar este tipo de nodo NUNCA dispara por casualidad fuera de la
 * familia TS/JS — no hace falta que `extractSymbols` conozca el `language`
 * del archivo para decidir cuándo aplica.
 */
const EXPORT_WRAPPER_NODE_TYPES = new Set(["export_statement"]);

/**
 * `a === b` NO identifica el mismo nodo AST acá — confirmado por prueba
 * directa (`web-tree-sitter`): dos llamadas SEPARADAS que devuelven "el
 * mismo" nodo subyacente (`node.child(i)` vs. `node.childForFieldName(...)`
 * apuntando a esa misma posición) construyen dos objetos JS DISTINTOS cada
 * vez — mismo `.type`/`.startPosition`, distinta identidad de objeto. `Ast
 * Node`/`ProbeNode` (`detect/types.ts`) no exponen el `id` interno de
 * web-tree-sitter que sí resolvería esto por identidad real, así que la
 * posición de inicio (fila+columna) hace de proxy estructural: dos HIJOS
 * DISTINTOS del mismo nodo padre nunca empiezan en la misma posición, así
 * que alcanza para decidir "¿es este el mismo hijo que `childForFieldName`
 * ya encontró?" sin comparar objetos.
 */
function isSameNode(a: AstNode, b: AstNode): boolean {
  return a.startPosition.row === b.startPosition.row && a.startPosition.column === b.startPosition.column && a.type === b.type;
}

/**
 * CONTRATO-F8G.md §2.2 — aridad. Same field pair `references.ts#extractReferences`
 * already reads (`childForFieldName("parameters") ?? childForFieldName("parameter_list")`)
 * to seed `collectParamNames`: no new vocabulary, just a second read of a
 * field this codebase already knows. Verified by direct parse across all 9
 * grammars (this task's own probe, `f2probe/arity.mjs`): Java/C#/TypeScript/
 * JavaScript/Go/Python all expose `parameters` on their function-like node;
 * Ruby's `method` does too, but ONLY when the source wrote parentheses —
 * `def area\n ... end` (no parens, no args, the common zero-arg Ruby method
 * shape) exposes NO parameter-list field at all, while `def area()\n...end`
 * does (empty, arity 0). That is exactly the `null` vs `0` distinction
 * `SymbolFacts.arity`'s docstring calls out, not a bug in this function.
 *
 * Counts NAMED children only, excluding `comment` — a parenthesized empty
 * list still has unnamed `(`/`)` tokens as children (confirmed: Ruby's
 * `method_parameters` for `def area()` has `childCount === 2`, zero named
 * children), which must not be counted as parameters.
 */
function computeArity(node: AstNode): number | null {
  const params = (node.childForFieldName("parameters") ?? node.childForFieldName("parameter_list")) as AstNode | null;
  if (!params) return null;
  let count = 0;
  for (let i = 0; i < params.childCount; i++) {
    const child = params.child(i) as AstNode | null;
    if (child && child.isNamed && child.type !== "comment") count++;
  }
  return count;
}

/**
 * Ola U (C2), HUECO #2 — los campos con que cada gramática escribe el TIPO DE
 * RETORNO de un miembro. Introspección de forma de campo (mecanismo A), el
 * mismo que `computeArity` ya usa para la lista de parámetros: se pregunta por
 * CAMPOS de gramática, nunca por lenguaje.
 *
 * Verificado por parse directo, no leído de una tabla
 * (`scripts/probes/u-c2-formas.mts`): `return_type` en python
 * (`function_definition`, `-> int`) y en la familia typescript
 * (`method_definition`/`function_declaration`, `: T`); `result` en go
 * (`function_declaration`/`method_declaration`/`method_spec`, incluida la
 * tupla `(int, error)`); `type` en java y csharp (`method_declaration`).
 * Ruby no expone ninguno — su `method` sólo resuelve `name`/`parameters`/
 * `body` — y JavaScript tampoco, así que ahí el hecho queda AUSENTE, que es
 * "no se sabe" y nunca "no devuelve".
 *
 * EL ORDEN IMPORTA y es el que evita el único choque posible: `type` va
 * ÚLTIMO porque es el campo más reusado de todas las gramáticas (Go escribe
 * `type` en `var_spec`/`const_spec`/`parameter_declaration`, y este archivo ya
 * lo lee para `shapeNodeType`). Se consulta sólo sobre nodos
 * `family === "function-like"`, donde `type` no puede significar otra cosa que
 * el retorno: un constructor de java/csharp (`constructor_declaration`) NO
 * resuelve `type` en absoluto — confirmado por la misma sonda —, así que el
 * nombre de la clase nunca se cuela como si fuera un tipo de retorno.
 */
const RETURN_TYPE_FIELDS = ["return_type", "result", "type"] as const;

/**
 * Ola U (C2), HUECO #2 — ver el docstring de `SymbolFacts.returnType`.
 *
 * DOS normalizaciones, las dos estructurales y las dos declaradas:
 *
 *  1. **Envoltorio de anotación de UN SOLO hijo.** La familia typescript no
 *     escribe el tipo pelado: escribe un nodo de anotación cuyo TEXTO incluye
 *     el separador que la gramática puso delante (`": Map<string, Foo>"`).
 *     La regla no nombra ese nodo: "si el nodo tiene EXACTAMENTE UN hijo
 *     nombrado y su propio texto DIFIERE del texto de ese hijo, entonces la
 *     gramática escribió un envoltorio y el tipo es el hijo". Un `type` de
 *     python (`"int"`, un hijo, mismo texto) no se toca; un `generic_type` de
 *     java (`"java.util.Iterator<String>"`, DOS hijos nombrados) tampoco; una
 *     tupla de go (`"(int, error)"`, dos hijos) tampoco. Acotada a dos
 *     vueltas: un envoltorio de anotación no anida.
 *  2. **Corridas de espacio en blanco → un espacio.** Es lo mínimo para que
 *     dos escrituras del MISMO tipo comparen iguales cuando la gramática
 *     partió el genérico en varias líneas. Ningún otro carácter se toca.
 *
 * EXPORTADA a propósito, igual que `declaredReceiverTypeName`: una hipótesis
 * que ya tiene el AST vivo (`template-method.ts#methodsOfClassAst`, que arma
 * sus miembros del árbol y no de `memberSignatures`) necesita LA MISMA
 * respuesta que el grafo, no una segunda lectura del campo `type` escrita a
 * mano. Si se escribieran dos, un día contestarían distinto.
 */
export function computeReturnType(node: AstNode): string | undefined {
  let typeNode: AstNode | null = null;
  for (const field of RETURN_TYPE_FIELDS) {
    const found = node.childForFieldName(field) as AstNode | null;
    if (found) {
      typeNode = found;
      break;
    }
  }
  if (!typeNode) return undefined;

  for (let depth = 0; depth < 2; depth++) {
    let only: AstNode | null = null;
    let named = 0;
    for (let i = 0; i < typeNode.childCount; i++) {
      const child = typeNode.child(i) as AstNode | null;
      if (!child || !child.isNamed) continue;
      named++;
      only = child;
    }
    if (named !== 1 || !only || only.text === typeNode.text) break;
    typeNode = only;
  }

  const text = typeNode.text.replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : undefined;
}

/**
 * CONTRATO-F8G.md §2.2 — visibilidad, por TIPO de nodo modificador, nunca por
 * nombre/capitalización. Verified by direct parse (`f2probe/modifiers.mjs`/
 * `modifiers2.mjs`) across the 3 of 9 grammars that have a dedicated
 * modifier-node slot at all:
 *
 * - Java: ONE `modifiers` node, direct child of the declaration, wrapping
 *   ALL keywords as its own (unnamed) children — `public static final`
 *   parses as `modifiers` with three children `public`/`static`/`final`.
 *   Absent entirely for package-private (`void pkg() {}` has no `modifiers`
 *   child at all — confirmed, not merely empty).
 * - C#: one SEPARATE `modifier` node PER keyword, each a direct sibling
 *   child of the declaration (`protected internal void Bar()` → TWO
 *   `modifier` nodes, "protected" then "internal", confirmed by direct
 *   parse) — not one combined node the way Java does it.
 * - TypeScript/TSX/Vue: `accessibility_modifier`, one per declaration, only
 *   emitted when the source writes `public`/`private`/`protected` at all
 *   (`static bar(): void {}` alone has none).
 *
 * *** DEVIATION FROM CONTRATO-F8G.md §2.2, REPORTED: *** the contract names
 * the vocabulary as `modifiers`/`modifier`/`access_modifier`/
 * `visibility_modifier`. Direct parse shows TypeScript's real node type is
 * `accessibility_modifier`, not `access_modifier` — the contract's own name
 * does not exist in any of the 9 grammars. `MODIFIER_NODE_TYPES` below keeps
 * BOTH the contract's literal four words AND the confirmed real one, so a
 * future grammar upgrade that happened to introduce `access_modifier` or
 * `visibility_modifier` would still be picked up for free; today only
 * `modifiers`/`modifier`/`accessibility_modifier` ever match.
 *
 * Ruby, Python, Go, JavaScript, JS-family arrow/plain functions: NO grammar
 * node for visibility at all (Ruby's `private`/`public` are method CALLS,
 * not modifiers — deliberately excluded, matching `SymbolFacts.visibility`'s
 * own docstring). `undefined` there, always — a real, measured, declared gap,
 * not a bug.
 */
const MODIFIER_NODE_TYPES = new Set(["modifiers", "modifier", "accessibility_modifier", "access_modifier", "visibility_modifier"]);

const VISIBILITY_WORDS: ReadonlySet<string> = new Set<Visibility>(["public", "private", "protected", "internal"]);

/**
 * A modifier node's own children are the individual keyword tokens (Java's
 * combined `modifiers`: `public`/`static`/`final` as three children; C#'s/
 * TypeScript's single-keyword node: one child). Falls back to the node's OWN
 * text only for the degenerate case of a modifier node with no children at
 * all (not observed in any of the 9 grammars, kept defensive rather than
 * assumed impossible). First child whose verbatim text is one of the four
 * canonical words wins — `public static final` matches `public` first, in
 * source order, never a later keyword.
 */
function firstVisibilityWord(modifierNode: AstNode): Visibility | undefined {
  if (modifierNode.childCount === 0) {
    return VISIBILITY_WORDS.has(modifierNode.text) ? (modifierNode.text as Visibility) : undefined;
  }
  for (let i = 0; i < modifierNode.childCount; i++) {
    const child = modifierNode.child(i) as AstNode | null;
    if (child && VISIBILITY_WORDS.has(child.text)) return child.text as Visibility;
  }
  return undefined;
}

/**
 * CONTRATO-F8G.md §2.2. Scans `node`'s DIRECT children (the declaration
 * itself — a `class_declaration`/`method_declaration`/etc., NEVER a wrapped
 * field/child) for the first one whose TYPE is in `MODIFIER_NODE_TYPES`,
 * keeps scanning SIBLINGS (not just the first match) until one actually
 * carries a canonical word — C#'s `static void Foo()` produces a `modifier`
 * node for `static` alone, which must be skipped in favor of a LATER
 * `modifier` sibling if one carries `public`/`private`/etc., rather than
 * stopping at the first modifier-typed node found.
 *
 * Only called from `record`'s function-like/class-like/namespace-like path
 * (see `walk` below) — where `node` IS the actual grammar declaration with
 * these as direct children. The `other`/plain-binding path (a Java field's
 * `variable_declarator`, e.g.) does NOT get a visibility read here: its
 * modifier sibling lives on the WRAPPING `field_declaration`, one level up
 * from the node this module records, and `AstNode` deliberately carries no
 * `.parent` (see this file's docstring's alignment note) — reading the
 * enclosing declaration would mean threading `parent` through `walk` for
 * this alone. Declared gap, not attempted: `MemberSignature`'s only
 * consumer filters to `family === "function-like"` anyway (`graph/types.ts`),
 * so a field's own visibility is not on the critical path this wave needs.
 */
/**
 * Ola S (S1) — ver `SymbolFacts.shapeNodeType` para el porqué y la medición.
 * Prueba de FORMA, nunca de lenguaje: si la declaración expone un campo
 * `type`, la gramática escribió ahí la forma del tipo (Go: `type_spec` →
 * `interface_type`/`struct_type`); si no lo expone, la forma ya está en el
 * `nodeType` del propio nodo y acá no hay nada que agregar. Sólo hijos
 * NOMBRADOS: un token suelto no es una forma.
 */
function shapeNodeTypeOf(node: AstNode): string | undefined {
  const typeField = node.childForFieldName("type") as AstNode | null;
  if (!typeField || !typeField.isNamed) return undefined;
  return typeField.type;
}

function computeVisibility(node: AstNode): Visibility | undefined {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i) as AstNode | null;
    if (!child || !child.isNamed || !MODIFIER_NODE_TYPES.has(child.type)) continue;
    const found = firstVisibilityWord(child);
    if (found) return found;
  }
  return undefined;
}

/**
 * A class-like node's `body` field target, walked ONE level deep: are its
 * direct named statements ALL themselves NESTED CLASS-LIKE DECLARATIONS
 * (per `sets.classNodes` — the SAME membership test the main walk uses, not
 * a bare "has a `name` field" test, and NOT `sets.functionNodes` either —
 * see the second rejected attempt below)? `comment` nodes are ignored; an
 * EMPTY body (`n === 0`) is not decl-only — an empty class is still a
 * class, not a namespace, there being nothing to organize.
 *
 * TWO REJECTED ATTEMPTS, kept here because the fixtures that caught them
 * (`__fixtures__/symbols.ts`'s `Widget`, `__fixtures__/symbols.py`'s
 * `Shape`) are now regression tests for both:
 *
 * 1. A bare "does this body statement have a `name` field" test (matching
 *    the single-language Ruby prototype in `spikes/cascada-refs/collect.mjs`,
 *    which never needed to tell the difference) is WRONG the moment a
 *    grammar has typed field/property declarations — TypeScript's
 *    `public_field_definition` (`count: number = 0`), same as Java's
 *    `variable_declarator` and C#'s `property_declaration`, ALSO exposes a
 *    `name` field, so a class with real instance state but no OTHER
 *    non-declaration statement in its body would misread as a pure
 *    namespace.
 * 2. Counting `sets.functionNodes` members (methods) as "nested
 *    declarations" too — not just `sets.classNodes` — is ALSO wrong, the
 *    opposite way: it would make an ORDINARY class whose body holds nothing
 *    but methods (no field, no `include`, no class-level constant — the
 *    common case in Python/Ruby, where instance state lives inside
 *    `__init__`/`initialize`, invisible at the class-body level) read as a
 *    namespace too, which would incorrectly flag the class's OWN name as
 *    not a valid resolution target (`namespaceContainerOnly`) — a real
 *    class instantiated by name everywhere is exactly what that field must
 *    stay `false` for. A namespace nests OTHER namespaces/classes; a class
 *    contains methods and state. Confirmed against the one real, measured
 *    win this rule is FOR (CONTRATO-F3.md's spike: Jekyll's `errors.rb`,
 *    fan-in 13, a module wrapping several exception CLASSES, not methods)
 *    — `sets.classNodes`-only is the narrower, measured-consistent test.
 *
 * One layer of "wraps a declaration" unwrapping (`isNestedClassLike`,
 * below) is applied to each body statement before giving up on it:
 * TypeScript wraps an exported member (`export class Widget {}`) in an
 * `export_statement` that is itself not itself class-like, only a
 * `declaration` field pointing at the real thing — without the unwrap,
 * EVERY exported member of a TypeScript namespace would make that
 * namespace read as NOT decl-only, which is backwards (an exported nested
 * class is still a declaration). Confirmed by direct parse of
 * `QUALIFIED_TS` (`revision2/probe/decls/probes-src.mjs`): `internal_
 * module`'s `body` is a `statement_block` whose one child is
 * `export_statement`, not a bare `class_declaration`.
 */
function isDeclOnlyBody(node: AstNode, sets: DerivedNodeSets): boolean {
  const body = node.childForFieldName("body") as AstNode | null;
  if (!body) return false;
  let n = 0;
  for (let i = 0; i < body.childCount; i++) {
    const child = body.child(i) as AstNode | null;
    if (!child || !child.isNamed || child.type === "comment") continue;
    n++;
    if (!isNestedClassLike(child, sets)) return false;
  }
  return n > 0;
}

/** One bounded level of "this node wraps a declaration via its own `declaration` field" unwrapping — see `isDeclOnlyBody`'s doc. */
function isNestedClassLike(node: AstNode, sets: DerivedNodeSets, depth = 0): boolean {
  if (sets.classNodes.has(node.type)) return true;
  if (depth >= 2) return false;
  const wrapped = node.childForFieldName("declaration") as AstNode | null;
  return wrapped ? isNestedClassLike(wrapped, sets, depth + 1) : false;
}

/**
 * ONE stack, ONE concept: the nearest REAL lexical scope, pushed for every
 * function-like/class-like node the walk descends into — named or not. This
 * replaces an earlier design that only tracked NAMED containers, which had
 * two independent blind spots sharing one root cause (see this file's
 * "DECLARED GAPS"-adjacent report for measurements): an anonymous function
 * (`options.diffed = function (vnode) { const props = ...; }`, real code from
 * `preact/compat/src/render.js:275`) or an anonymous class (`const Foo =
 * class { bar() {} }`) opens a scope exactly like a named one — a binding
 * declared directly inside it is still local, and a member declared directly
 * inside it is still a class/namespace member — but has no `name` field to
 * push onto a NAMED-only stack, so `isLocal`/`memberOfClassLike` looked past
 * it to whatever REAL container happened to be further out (often none,
 * i.e. file-level) and mis-registered the binding as a global declaration.
 * `name: null` marks exactly this "real scope, no qualified-name segment"
 * case; `container`/`memberOfClassLike` are two different READS of the SAME
 * frame list, not two separate mechanisms to keep in sync.
 */
interface ScopeFrame {
  readonly name: string | null;
  readonly family: SymbolFamily;
}

/**
 * N9 (Ola O) — LA BRECHA 1 DE ESTE ARCHIVO, CERRADA POR FORMA DE CAMPO.
 *
 * El docstring de este módulo declara como brecha estructural que "la
 * asociación método↔struct de Go es INVISIBLE al anidamiento por
 * ancestros": un `method_declaration` NO vive dentro de la declaración de su
 * tipo, su receptor vive en un CAMPO `receiver`. La brecha se declaró como
 * "limitación real, no bug" con un argumento concreto: leer ese campo
 * exigiría "desenvolver `pointer_type`/`type_identifier` POR NOMBRE", que es
 * el caso-especial-por-lenguaje que el proyecto prohíbe.
 *
 * ESE ARGUMENTO SÓLO VALE PARA EL NOMBRE DEL RECEPTOR, y `memberOfClassLike`
 * no necesita el nombre: necesita la EXISTENCIA del receptor. "¿Este nodo de
 * declaración resuelve un campo `receiver`/`object`?" es introspección de
 * forma de campo pura (mecanismo A), con el MISMO vocabulario genérico que
 * `references.ts` ya usa para receptores en posición de expresión
 * (`RECEIVER_FIELDS`), sin desenvolver nada y sin nombrar ningún lenguaje.
 * `container` NO se toca (sigue vacío, y con él `symbolPath`/`nodeId` y la
 * simetría con `ReferenceFacts.scope` que este módulo promete): lo único que
 * cambia es la respuesta a "¿se puede llegar a este símbolo por nombre
 * DESNUDO?", que para un método con receptor explícito es NO en cualquier
 * gramática que tenga ese campo.
 *
 * COSTO MEDIDO DE NO HABERLO HECHO (hugo, Ola O): `func (t *Tree) error(err
 * error)` en `tpl/internal/go_templates/texttemplate/parse/parse.go` quedaba
 * con `container: []` y `memberOfClassLike: false`, o sea alcanzable por
 * nombre desnudo desde todo el repo — y como `error` es además el nombre del
 * tipo predeclarado que aparece en la firma de casi toda función de Go, se
 * comía 1.724 aristas `references` desde 329 archivos hacia ese único
 * método: el hub falso más grande de todo el corpus, más grande incluso que
 * el `constructor` de nest. `class-member` (`resolve.ts`, N1-a) ya tenía la
 * regla correcta; le faltaba el hecho.
 *
 * Se incluye `object` junto a `receiver` porque es el MISMO concepto en la
 * otra gramática que lo expone sobre una declaración (un método de
 * singleton, `def self.x` / `def OBJETO.x`, cuyo objeto receptor llena
 * `object`): también exige receptor escrito, también deja de ser alcanzable
 * por nombre desnudo. Ninguna de las dos palabras es un nombre de lenguaje
 * ni de librería — son campos de gramática, el vocabulario que la regla de
 * genericidad permite explícitamente.
 */
const DECLARED_RECEIVER_FIELDS = ["receiver", "object"] as const;

/** `true` cuando la DECLARACIÓN misma escribe un receptor — ver `DECLARED_RECEIVER_FIELDS`. */
function declaresExplicitReceiver(node: AstNode): boolean {
  for (const field of DECLARED_RECEIVER_FIELDS) {
    if ((node.childForFieldName(field) as AstNode | null) != null) return true;
  }
  return false;
}

/**
 * P4 (Ola P) — LA OTRA MITAD DE LA BRECHA 1: EL AGRUPAMIENTO POR TIPO.
 *
 * N9 cerró la mitad de ALCANZABILIDAD (`memberOfClassLike`) leyendo sólo la
 * EXISTENCIA del campo receptor. La mitad que quedó abierta —y que tres
 * frentes de dos olas pidieron por escrito (`ola-o/informes/N5.md`, "PIDO A
 * OTRO FRENTE")— es el AGRUPAMIENTO: un método con receptor sigue con
 * `container: []`, así que `symbolPath` es `["Name"]` y su arista `contains`
 * cuelga del ARCHIVO, no del tipo. Consecuencia medida aguas abajo: todo
 * consumidor que lea "la superficie de un tipo" recorriendo `contains` ve, en
 * la gramática que declara sus métodos con receptor, UN SOLO montón por
 * archivo — dos tipos distintos declarados en el mismo archivo comparten
 * superficie, y un archivo de funciones libres es indistinguible de un tipo
 * con protocolo.
 *
 * EL ARGUMENTO QUE BLOQUEABA ESTO, Y POR QUÉ NO APLICA. El docstring del
 * módulo dice que leer el nombre del receptor "exigiría desenvolver
 * `pointer_type`/`type_identifier` POR NOMBRE, el caso-especial-por-lenguaje
 * que el proyecto prohíbe". Eso vale para una lista de tipos de nodo escrita
 * a mano; NO vale para la lectura estructural que hace esta función, que no
 * nombra ni un solo tipo de nodo:
 *
 *   1. Del subárbol del campo receptor, el PRIMER nodo (pre-orden) que
 *      resuelve un campo `type`. Es el mismo mecanismo A (introspección de
 *      forma de campo) que `computeArity`/`computeVisibility` ya usan, y el
 *      mismo campo `type` que la gramática usa para "el tipo escrito acá".
 *   2. De ahí, el primer NOMBRE en profundidad: bajar por el primer hijo
 *      NOMBRADO hasta la hoja. Un puntero/una referencia/un tipo genérico son
 *      envoltorios cuyo primer hijo nombrado es el tipo envuelto — no hay que
 *      saber cómo se llama el envoltorio para atravesarlo, y por eso esto
 *      funciona igual con `*T`, con `T` pelado y con `T[U]` (verificado por
 *      parse directo, `scripts/probes/p4-recv.mts`: `*Command` → `Command`,
 *      `Command` → `Command`, `*List[T]` → `List`).
 *
 * QUÉ DEVUELVE `null`, a propósito y medido: la otra gramática que expone un
 * receptor sobre una DECLARACIÓN (método de singleton, `def self.x` /
 * `def OBJETO.x`) llena el campo con el objeto receptor DIRECTO —un nodo
 * `self`, o una constante— que no resuelve ningún campo `type`. Ahí no hay
 * tipo escrito que leer y esta función no inventa ninguno: devuelve `null` y
 * el símbolo queda exactamente como estaba. O sea, el ensanche llega
 * únicamente donde la gramática ESCRIBE un tipo de receptor, que es
 * justamente el caso que el agrupamiento necesita.
 */
export function declaredReceiverTypeName(node: AstNode): string | null {
  for (const field of DECLARED_RECEIVER_FIELDS) {
    const receiver = node.childForFieldName(field) as AstNode | null;
    if (!receiver) continue;
    const typed = firstNodeWithTypeField(receiver);
    if (!typed) continue;
    const name = leadingNamedLeafText(typed);
    if (name !== null && !isBlankName(name)) return name;
  }
  return null;
}

/** El primer nodo en pre-orden (incluido `node`) que resuelve un campo `type`. Profundidad acotada: el subárbol de un receptor escrito es una lista de parámetros, nunca un cuerpo. */
function firstNodeWithTypeField(node: AstNode, depth = 0): AstNode | null {
  if ((node.childForFieldName("type") as AstNode | null) != null) return node.childForFieldName("type") as AstNode;
  if (depth >= 3) return null;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i) as AstNode | null;
    if (!child || !child.isNamed) continue;
    const found = firstNodeWithTypeField(child, depth + 1);
    if (found) return found;
  }
  return null;
}

/** Baja por el primer hijo NOMBRADO hasta la hoja y devuelve su texto — atraviesa cualquier envoltorio de tipo (puntero, genérico) sin nombrarlo. */
function leadingNamedLeafText(node: AstNode, depth = 0): string | null {
  if (depth >= 6) return null;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i) as AstNode | null;
    if (!child || !child.isNamed) continue;
    return leadingNamedLeafText(child, depth + 1);
  }
  const text = node.text;
  return text.length > 0 && !/\s/.test(text) ? text : null;
}

/* ════════════════════════════════════════════════════════════════════════
 * Ola U (C2) — HUECO DE GRAFO #1 del `PLAN-INTENCIONES.md`:
 * EL CAMPO ASIGNADO EN EL CONSTRUCTOR NO TENÍA NODO PROPIO.
 *
 * QUÉ FALTABA, y a quién le dolía. `this.x = param` dentro de
 * `constructor`/`initialize`/`__init__` es LA forma de declarar un campo en 6
 * de los 9 lenguajes soportados: ruby, python y javascript no tienen NINGUNA
 * otra (su gramática no tiene dónde escribir un campo a nivel de cuerpo de
 * clase), y typescript/java/csharp la usan igual aunque sí la tengan. Hasta
 * esta ola ese sitio no producía símbolo: el nodo es una asignación cuyo
 * ámbito inmediato es el constructor —una FUNCIÓN—, así que la rama de
 * `BINDING_DECLARATOR_TYPES` de `walk` lo descartaba por local
 * (correctamente, para una variable local de verdad) y el tipo se quedaba sin
 * un solo hijo `contains` por sus campos.
 *
 * EL COSTO, citado del plan (§11, Iterator): «un campo de colección
 * inicializado en el CONSTRUCTOR no produce nodo `contains` propio en el grafo
 * — así que "ningún cliente externo referencia el campo" se lee como
 * encapsulación verificada cuando en realidad es "no hay nada que verificar"».
 * El mismo hueco lo nombran Null Object y Singleton (§5 y §1): los tres
 * preguntan por los MIEMBROS de un tipo recorriendo `contains`, y los tres
 * veían la mitad de la superficie. UN solo arreglo acá destraba los tres.
 *
 * ADITIVO, y ésa es la restricción dura: ningún nodo ni arista de antes cambia
 * de significado. Lo único que aparece son símbolos `family: "other"` nuevos,
 * exactamente la misma familia y el mismo trato que ya tiene un campo escrito
 * a nivel de cuerpo de clase (el `variable_declarator` de java) — no una
 * familia nueva, no un `EdgeKind` nuevo.
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * Palabra reservada del LENGUAJE, no vocabulario de dominio — copia deliberada
 * de `portador.ts#SELF_KEYWORDS`, que `declara-tipo.ts`, `propaga-tipo.ts` e
 * `invocacion-indirecta.ts` ya duplican con este mismo comentario (el split de
 * archivos prohíbe importar un símbolo privado de otro dueño). LOS CUATRO
 * TIENEN QUE CONTESTAR LO MISMO: si acá se declara un campo `self.conn` con un
 * nombre y `declara-tipo.ts` le arma el portador con otro, el nodo `carrier` y
 * el nodo `symbol` del MISMO campo dejan de converger.
 */
const SELF_KEYWORDS: ReadonlySet<string> = new Set(["self", "this"]);
/** Los campos con que cada gramática nombra el RECEPTOR de un acceso a miembro. Copia deliberada de `propaga-tipo.ts`/`declara-tipo.ts`/`invocacion-indirecta.ts` — ver `SELF_KEYWORDS`. */
const RECEIVER_FIELDS = ["receiver", "object", "operand", "expression"];
/** Los campos con que cada gramática nombra el MIEMBRO de un acceso a miembro. Copia deliberada, ver `SELF_KEYWORDS`. */
const MEMBER_FIELDS = ["method", "field", "property", "attribute", "name"];
/** Ruby escribe `@foo` como UNA hoja de tipo `instance_variable`, sin split receptor/miembro. Vocabulario de GRAMÁTICA, el mismo `RUBY_IVAR_TYPE` que `propaga-tipo.ts`/`invocacion-indirecta.ts` y cinco detectores ya llevan — y con la MISMA regla de nombre (sin el `@`), para converger en el mismo portador. */
const RUBY_IVAR_TYPE = "instance_variable";

/**
 * Los tipos de nodo con que las 6 gramáticas del corpus escriben una
 * ASIGNACIÓN — copia deliberada del `BINDING_NODE` de `propaga-tipo.ts`
 * recortado a su mitad de asignación (acá no interesan los declaradores: ésos
 * ya los cubre `BINDING_DECLARATOR_TYPES`, y un declarador dentro de un
 * constructor es una variable local de verdad). Verificado por parse directo
 * (`scripts/probes/u-c2-formas.mts`): `assignment` en python y ruby,
 * `assignment_expression` en la familia typescript, java y csharp,
 * `assignment_statement` en go.
 */
const ASSIGNMENT_NODE = /(^|_)assignment$|(^|_)assignment_(expression|statement)$/;

/** Los campos con que la gramática nombra el LADO IZQUIERDO de una asignación. Mismo par que `propaga-tipo.ts#LHS_FIELDS`. */
const ASSIGNMENT_LHS_FIELDS = ["left", "name"];

function firstField(node: AstNode, fields: readonly string[]): AstNode | null {
  for (const f of fields) {
    const c = node.childForFieldName(f) as AstNode | null;
    if (c) return c;
  }
  return null;
}

/**
 * ¿Este lado izquierdo denota un MIEMBRO DEL PROPIO OBJETO? `self.foo`/
 * `this.foo`/`@foo` ⇒ `"foo"`; cualquier otra cosa ⇒ `null`.
 *
 * Es la MISMA función que `propaga-tipo.ts#classifyLhs` y
 * `declara-tipo.ts#memberOfSelf` ya escriben, con la misma regla de nombre
 * (ruby sin el `@`) para que los tres nombren el mismo campo igual. Nunca
 * acepta un acceso ANIDADO (`this.a.b = c`): ahí el receptor es `this.a`, no
 * una palabra reservada, y lo que se estaría declarando es un campo de OTRO
 * objeto — no de éste.
 */
function selfMemberName(lhs: AstNode): string | null {
  if (lhs.type === RUBY_IVAR_TYPE) {
    const bare = lhs.text.replace(/^@+/, "");
    return bare.length > 0 ? bare : null;
  }
  const receiver = firstField(lhs, RECEIVER_FIELDS);
  if (!receiver || !SELF_KEYWORDS.has(receiver.text)) return null;
  const member = firstField(lhs, MEMBER_FIELDS);
  return member ? member.text : null;
}

/**
 * ¿Esta declaración function-like ES el constructor de su tipo?
 *
 * LOS DOS MECANISMOS QUE `code-grammar.ts` YA TIENE, sin inventar un tercero
 * ni una lista nueva: (B) la gramática le dedica su propia regla —
 * `DerivedNodeSets.constructorNodes`, que hoy sólo java y csharp llenan
 * (`constructor_declaration`) — o, donde no la hay, (nombre) la ortografía
 * MANDADA por el lenguaje: `CONSTRUCTOR_NAMES` de `code-grammar.ts`
 * (`initialize`/`constructor`/`__init__`), el mismo conjunto que
 * `code-analyzer.ts`, `builder.ts`, `null-object.ts`, `template-method.ts` y
 * `n6-firma-impuesta.ts` ya comparten. No se agrega una sola palabra.
 */
function isConstructorDeclaration(node: AstNode, nameNode: AstNode | null, sets: DerivedNodeSets): boolean {
  if (sets.constructorNodes.has(node.type)) return true;
  return nameNode !== null && CONSTRUCTOR_NAMES.has(nameNode.text);
}

/**
 * ¿Este nodo tiene FORMA de función, mire o no `DerivedNodeSets` para su tipo?
 *
 * Es la misma prueba de forma de campo que `code-grammar.ts#isFunctionLike`
 * (`body` + una lista de parámetros), aplicada por NODO en vez de por tipo de
 * nodo. Existe por una razón concreta y verificada con un test: `sets` se
 * deriva de UNA sonda representativa por lenguaje, así que un tipo de nodo que
 * la sonda no ejercitó (una función anónima, un lambda) NO está en
 * `functionNodes` — y sin esta guarda, un `this.x = ...` escrito dentro de una
 * closure ANIDADA en el constructor se leería como un campo del tipo de
 * afuera. Sólo se usa para APAGAR la marca de constructor (nunca para
 * encenderla ni para registrar un símbolo), así que en el peor caso deja de
 * declarar un campo — nunca declara uno de más.
 */
function hasFunctionShape(node: AstNode): boolean {
  if ((node.childForFieldName("body") as AstNode | null) === null) return false;
  return (
    (node.childForFieldName("parameters") as AstNode | null) !== null ||
    (node.childForFieldName("parameter_list") as AstNode | null) !== null
  );
}

/** Un campo descubierto dentro de un constructor, pendiente de que termine el recorrido para saber si el tipo ya lo declaraba por otra vía — ver el post-proceso de `extractSymbols`. */
interface ConstructorFieldCandidate {
  readonly node: AstNode;
  readonly nameNode: AstNode;
  readonly name: string;
  /** El `container` del TIPO dueño, capturado al ENTRAR al constructor — nunca el del constructor. */
  readonly container: readonly string[];
}

/**
 * Structural rule, not a per-language list: a name made up of nothing but
 * underscore characters can never denote anything — Go's `_` (discard
 * assignment target, `var _ Iface = (*T)(nil)`/`_, err := f()`) is the
 * concrete case this task measured (`cobra`: a single `var _ SliceValue =
 * ...` at package level, globally unique, turned into 186 false `references`
 * edges/weight 269 from 26+ unrelated files — every one of them a candidate
 * that should never have existed), but the same shape (`_`, `__`, ...) is a
 * "this binds nothing on purpose" convention in Ruby/Python too. One guard,
 * applied at the single point (`record`, below) that turns a name into a
 * `SymbolFacts` entry, covers every construct that reaches it — function/
 * class declarations included, not just the plain-binding path Bug 2 was
 * filed against — rather than special-casing `var_spec`/Go alone.
 */
function isBlankName(name: string): boolean {
  return /^_+$/.test(name);
}

/**
 * Ola 9, A1 — MEDIDO: `qualified-name` (`graph/resolve.ts`) rechazaba 86,5%
 * de los candidatos de newtonsoft-json (C#). Causa: `namespace_declaration`
 * (class-like desde que `code-analyzer.ts`'s `CSHARP_PROBE` empezó a incluir
 * un bloque `namespace` — ver `sets.classNodes.has("namespace_declaration")`
 * en `symbols.test.ts`) tiene un campo `name` que, para un namespace
 * COMPUESTO (`namespace Newtonsoft.Json.FuzzTests { ... }`, la forma que
 * envuelve prácticamente todo el repo), es UN SOLO nodo `qualified_name`
 * cuyo `.text` es la cadena entera con los puntos adentro — antes de este
 * fix, ESE texto crudo se empujaba como UN elemento de `container`. La
 * cascada (`resolve.ts#isVisibleFrom`) compara `container`/`scope` por
 * ELEMENTO DE ARRAY, así que "Newtonsoft.Json.FuzzTests" (una cadena) nunca
 * comparaba como prefijo/sufijo de "Newtonsoft.Json" (otra cadena) aunque en
 * C# real un namespace punteado es exactamente equivalente a namespaces
 * anidados (`namespace A.B` ≡ `namespace A { namespace B { ... } } }`) — una
 * referencia sin calificar dentro de `Newtonsoft.Json.FuzzTests` a un tipo
 * de `Newtonsoft.Json` es válida y visible, y la cascada la rechazaba de
 * todos modos.
 *
 * El separador es el MISMO que `resolve.ts#splitQualifierText` ya usa para
 * el TEXTO de un calificador escrito en un sitio de uso — acá se aplica al
 * mismo tipo de texto, sólo que del lado de la DECLARACIÓN. Un identificador
 * simple (el caso común, los 9 lenguajes) nunca lleva `.`/`::` en su propio
 * token — este split es un no-op ahí, no un caso especial por lenguaje.
 * `references.ts` lleva una copia idéntica de esta misma función, por la
 * misma razón de siempre (ver el docstring de alineación de este archivo):
 * el split de archivos de esta ola prohíbe importar entre los dos módulos.
 */
function splitQualifiedSegments(text: string): readonly string[] {
  const parts = text.split(/::|\./).filter((s) => s.length > 0);
  return parts.length > 0 ? parts : [text];
}

/**
 * Los nombres tipo-clase que ESTE archivo declara a NIVEL DE ARCHIVO — la
 * guarda del agrupamiento por receptor (ver `declaredReceiverTypeName`).
 *
 * POR QUÉ HAY UNA GUARDA. El consumidor real del `container` de un método es
 * la arista `contains` (`build.ts`: `parentId = container.length === 0 ?
 * fileId : symbolNodeId(file, container)`), y ese id se arma SIEMPRE contra el
 * MISMO archivo. Si el tipo receptor está declarado en otro archivo del mismo
 * paquete —forma perfectamente legal en la gramática que tiene receptores—
 * escribir el contenedor igual fabricaría una arista `contains` colgando de un
 * nodo que no existe: el agrupamiento no se lograría y el grafo quedaría PEOR
 * que antes. Así que el contenedor se escribe sólo cuando este archivo declara
 * el tipo, que es exactamente el nodo padre bajo el que el método va a colgar.
 * BRECHA DECLARADA, no disimulada: método cuyo tipo vive en otro archivo del
 * paquete = sigue plano.
 *
 * `references.ts` lleva una copia idéntica de esta función, por la misma razón
 * de siempre (ver el docstring de alineación de este archivo): las dos tienen
 * que responder LO MISMO o la promesa `container` ↔ `ReferenceFacts.scope` se
 * rompe. SI SE TOCA UNA, SE TOCA LA OTRA.
 */
export function fileLevelTypeNames(root: AstNode, sets: DerivedNodeSets): ReadonlySet<string> {
  const out = new Set<string>();
  const visit = (node: AstNode): void => {
    if (!node.isNamed) return;
    if (sets.functionNodes.has(node.type) || sets.classNodes.has(node.type)) {
      if (sets.classNodes.has(node.type)) {
        const nameNode = node.childForFieldName("name") as AstNode | null;
        if (nameNode) out.add(nameNode.text);
      }
      return; // lo de adentro ya no es "nivel de archivo"
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i) as AstNode | null;
      if (child) visit(child);
    }
  };
  visit(root);
  return out;
}

/**
 * One walk per file: every declared, named unit — function-like, class-like
 * (split into `class-like`/`namespace-like`, see `isDeclOnlyBody`), and the
 * `other` plain bindings `BINDING_DECLARATOR_TYPES` recognizes — with its
 * qualified container path and the `memberOfClassLike`/
 * `namespaceContainerOnly` predicates CONTRATO-F3.md §1.3 requires be
 * computed once here rather than re-evaluated per candidate in the
 * resolution cascade.
 *
 * A plain LOCAL binding (an `other`-shaped node whose nearest REAL enclosing
 * scope — named or not, see `ScopeFrame` — is itself `function-like`, i.e. a
 * local variable inside a function/method/closure body) is deliberately NOT
 * recorded: it is never a cross-file-referenceable declaration, and
 * recording it anyway would inflate the symbol table with noise (the
 * measured failure mode this guards: an anonymous-function-scoped local
 * leaking to file level and becoming a false global hub). Module/class-level
 * constants and fields (nearest real scope absent, or `class-like`/
 * `namespace-like`) ARE recorded — `Foo::BAR`-style constants and Go's
 * package-level `var`/`const`/`type` are exactly what CONTRATO-F3.md's
 * worked examples target. A name that is nothing but underscores
 * (`isBlankName`) is never recorded either way — it cannot be referenced,
 * declaring it would only manufacture a false globally-unique target.
 *
 * NUEVO, Ola U (C2) — HUECO DE GRAFO #1: además de lo anterior, un CAMPO
 * ASIGNADO EN EL CONSTRUCTOR (`this.x = param`/`self.x = param`/`@x = param`
 * dentro de `constructor`/`initialize`/`__init__`/`constructor_declaration`)
 * también se registra, con `family: "other"`, `memberOfClassLike: true` y el
 * `container` del TIPO dueño — nunca el del constructor. Ver el bloque de
 * `SELF_KEYWORDS` para el porqué y el post-proceso 1 al final de esta función
 * para la deduplicación contra los campos que el tipo ya declara por otra vía.
 * Es la ÚNICA forma de declarar un campo que ruby, python y javascript tienen.
 *
 * Pure and synchronous over an ALREADY-PARSED node, same contract as
 * `references.ts`'s `extractReferences` and `code-analyzer.ts`'s
 * `walkFile`: the caller owns parsing and `tree.delete()`. `sets` is the
 * `DerivedNodeSets` computed once per language/process (`code-grammar.ts`'s
 * `deriveNodeSets`, cached by `resolveLanguage` today).
 */
export function extractSymbols(root: AstNode, sets: DerivedNodeSets): readonly SymbolFacts[] {
  const out: SymbolFacts[] = [];
  // Marca de archivo entero — "¿apareció ALGÚN `export_statement` en
  // cualquier lugar de este árbol?" Ver el post-proceso al final de esta
  // función para por qué el valor final de `SymbolFacts.exported` (que cada
  // `record()` deja como PROVISIONAL) no puede fijarse hasta terminar el
  // recorrido completo.
  let sawExportWrapper = false;
  const scopeStack: ScopeFrame[] = [];
  // Ola U (C2), HUECO #1 — ver el bloque de `SELF_KEYWORDS`. Los campos
  // encontrados dentro de un constructor NO se emiten en el acto: se juntan
  // acá y se resuelven al final, cuando ya se sabe qué miembros declara el
  // tipo por las otras vías (un `variable_declarator` de java a nivel de
  // cuerpo de clase declara el MISMO campo que el `this.x = ...` del
  // constructor, y emitir los dos fabricaría un hermano homónimo `@2` —
  // un nodo duplicado, que es peor que el hueco que se está tapando).
  const constructorFields: ConstructorFieldCandidate[] = [];
  // `null` = el recorrido NO está dentro del cuerpo de un constructor. Cuando
  // NO es `null`, lleva el `container` del TIPO dueño (no el del constructor),
  // que es el que un campo tiene que tener para colgar del nodo del tipo.
  let constructorOwner: readonly string[] | null = null;
  // P4 (Ola P) — EL AGRUPAMIENTO POR TIPO. Una pasada previa barata (ver
  // `fileLevelTypeNames`) con los nombres tipo-clase que ESTE archivo declara
  // a nivel de archivo: es la guarda del receptor, y tiene que conocerse
  // ANTES del recorrido porque el receptor se empuja al `scopeStack` como
  // cualquier otro contenedor. `references.ts` calcula el MISMO conjunto con
  // la misma función espejada, y de ahí sale la simetría.
  const tiposDeArchivo = fileLevelTypeNames(root, sets);

  const record = (
    node: AstNode,
    nameNode: AstNode,
    family: SymbolFamily,
    namespaceContainerOnly: boolean,
    wrappedByExport: boolean,
  ): void => {
    if (isBlankName(nameNode.text)) return;
    const immediate = scopeStack[scopeStack.length - 1];
    const container = scopeStack.filter((f): f is ScopeFrame & { name: string } => f.name !== null).map((f) => f.name);
    const visibility = family === "other" ? undefined : computeVisibility(node);
    out.push({
      name: nameNode.text,
      container,
      nodeType: node.type,
      // Ola S (S1) — ver el docstring de `SymbolFacts.shapeNodeType`: el mismo
      // hecho verbatim un nivel más abajo, para la gramática (Go) que no lo
      // escribe en el nodo declarante.
      shapeNodeType: family === "class-like" || family === "namespace-like" ? shapeNodeTypeOf(node) : undefined,
      family,
      // N9 (Ola O): el receptor ESCRITO en la propia declaración vale tanto
      // como el anidamiento léxico — ver `declaresExplicitReceiver`.
      memberOfClassLike:
        declaresExplicitReceiver(node) ||
        (immediate ? immediate.family === "class-like" || immediate.family === "namespace-like" : false),
      namespaceContainerOnly,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      nameLine: nameNode.startPosition.row + 1,
      nameColumn: nameNode.startPosition.column,
      // CONTRATO-F8G.md §2.2 — see `computeArity`/`computeVisibility` above.
      // `node` here is the real grammar declaration ONLY for the
      // function-like/class-like/namespace-like callers (`walk`'s first
      // branch, below); the `other`/plain-binding caller passes its own
      // declarator node, for which neither is attempted — declared gap, see
      // `computeVisibility`'s docstring.
      arity: family === "function-like" ? computeArity(node) : undefined,
      // Ola U (C2), HUECO #2 — ver `computeReturnType` y el docstring de
      // `SymbolFacts.returnType`. Mismo trato y mismo sitio que `arity`: sólo
      // function-like, porque "¿qué devuelve?" no es una pregunta que tenga
      // sentido para un tipo ni para un binding suelto.
      returnType: family === "function-like" ? computeReturnType(node) : undefined,
      visibility,
      // Provisional — `visibility === "private"` es evidencia negativa firme
      // (Java/C#) sin importar `sawExportWrapper`; el resto se corrige abajo
      // una vez que se sabe si el ARCHIVO usó `export` en algún lado.
      exported: wrappedByExport && visibility !== "private",
    });
  };

  const walk = (node: AstNode, exported: boolean): void => {
    if (!node.isNamed) return;

    const functionLike = sets.functionNodes.has(node.type);
    const classLike = !functionLike && sets.classNodes.has(node.type);
    let pushedCount = 0;
    // Ola U (C2), HUECO #1 — se guarda y se restaura al salir, igual que
    // `scopeStack` se desapila: "estar dentro de un constructor" es una
    // propiedad del SUBÁRBOL, no del recorrido entero.
    const outerConstructorOwner = constructorOwner;
    // Propagado sin cambios a través de envoltorios NO declarativos (p.ej.
    // TS/JS `lexical_declaration`, entre `export_statement` y el
    // `variable_declarator` real) — "consumido" (reseteado a `false`) en
    // cuanto se alcanza una declaración de verdad, así el `export` de un
    // top-level nunca se filtra hacia sus miembros anidados (una clase
    // exportada no vuelve "exportados" a sus propios métodos).
    let childExported = exported;

    if (functionLike || classLike) {
      const nameNode = node.childForFieldName("name") as AstNode | null;
      const namespaceOnly = classLike && isDeclOnlyBody(node, sets);
      const family: SymbolFamily = functionLike ? "function-like" : namespaceOnly ? "namespace-like" : "class-like";
      // P4 (Ola P) — EL TIPO RECEPTOR ES UN CONTENEDOR MÁS. Se empuja ANTES de
      // `record` (para que sea el `container` del propio método) y queda en la
      // pila mientras se recorre el cuerpo, así TODO lo que se declare adentro
      // hereda el mismo prefijo. Empujarlo sólo para el método y no para su
      // cuerpo es lo que rompe la simetría con `ReferenceFacts.scope`: MEDIDO
      // sobre hugo, un `type Alias T` declarado DENTRO de un método (la forma
      // de `MarshalJSON`) quedaba con `symbolPath: ["MarshalJSON", "Alias"]`
      // colgando de un nodo que ya no existía — 10 aristas `contains` y 12
      // `references` colgadas, todas de esa única forma.
      if (functionLike && scopeStack.length === 0) {
        const receiverType = declaredReceiverTypeName(node);
        if (receiverType !== null && tiposDeArchivo.has(receiverType)) {
          scopeStack.push({ name: receiverType, family: "class-like" });
          pushedCount++;
        }
      }
      if (nameNode) record(node, nameNode, family, namespaceOnly, exported);
      // Ola U (C2), HUECO #1 — ¿este subárbol es el cuerpo de un constructor?
      // Se decide ACÁ, después del posible empuje del receptor (para leer el
      // mismo `scopeStack` que `record` acaba de leer) y ANTES de empujar los
      // segmentos del propio miembro (el dueño del campo es el TIPO, no el
      // constructor). Cualquier OTRA declaración function-like/class-like
      // apaga la marca para su subárbol: un campo declarado en una closure o
      // en una clase anidada dentro del constructor no es un campo del tipo de
      // afuera, y una asignación a `this` ahí adentro puede referirse a otro
      // objeto entero.
      constructorOwner = null;
      if (functionLike && isConstructorDeclaration(node, nameNode, sets)) {
        const owner = scopeStack[scopeStack.length - 1];
        const ownerIsType = owner !== undefined && (owner.family === "class-like" || owner.family === "namespace-like");
        const ownerPath = scopeStack.filter((f): f is ScopeFrame & { name: string } => f.name !== null).map((f) => f.name);
        // `ownerPath.length > 0` no es redundante con `ownerIsType`: un marco
        // ANÓNIMO (`const Foo = class { constructor() {} }`) es class-like y no
        // aporta segmento, así que el campo colgaría del ARCHIVO — la misma
        // arista `contains` colgada de un padre equivocado que P4 midió en hugo.
        if (ownerIsType && ownerPath.length > 0) constructorOwner = ownerPath;
      }
      childExported = false;
      // Pushed for EVERY function-like/class-like node, named or not — see
      // `ScopeFrame`'s docstring. Only a NAMED frame contributes a segment
      // to `container`; an anonymous one still counts as the nearest real
      // scope for `isLocal`/`memberOfClassLike` below. A COMPOUND name (a C#
      // dotted `namespace A.B.C`, a Ruby `class Foo::Bar`) pushes ONE frame
      // PER SEGMENT — see `splitQualifiedSegments`'s docstring for why a
      // single glued frame breaks `resolve.ts`'s namespace-visibility check.
      const segments: readonly (string | null)[] = nameNode ? splitQualifiedSegments(nameNode.text) : [null];
      for (const seg of segments) scopeStack.push({ name: seg, family });
      pushedCount += segments.length; // `+=`: el receptor de arriba ya puede haber empujado uno
    } else if (BINDING_DECLARATOR_TYPES.has(node.type)) {
      const immediate = scopeStack[scopeStack.length - 1];
      const isLocal = immediate?.family === "function-like";
      if (!isLocal) {
        const nameNode = (node.childForFieldName("name") ?? node.childForFieldName("left")) as AstNode | null;
        if (nameNode) record(node, nameNode, "other", false, exported);
      }
      childExported = false;
    }

    // Ola U (C2), HUECO #1 — LA ASIGNACIÓN A UN MIEMBRO PROPIO DENTRO DEL
    // CONSTRUCTOR. Bloque INDEPENDIENTE, no una rama más de la cadena de
    // arriba, y a propósito: el `assignment` de python y ruby YA está en
    // `BINDING_DECLARATOR_TYPES`, así que la rama anterior lo mira primero y
    // lo descarta por local (su ámbito inmediato es el constructor, que es
    // function-like) — que es la decisión CORRECTA para una variable local de
    // verdad y la que no hay que tocar. Lo que este bloque agrega es el otro
    // caso: el lado izquierdo no es un nombre desnudo sino un miembro del
    // propio objeto, y entonces no se está declarando un local sino un CAMPO
    // DEL TIPO.
    // …y la guarda del caso que `sets` no puede cubrir: un nodo con forma de
    // función cuyo TIPO la sonda del lenguaje nunca ejercitó (función anónima,
    // lambda) igual abre su propio ámbito — ver `hasFunctionShape`.
    if (constructorOwner !== null && !functionLike && !classLike && hasFunctionShape(node)) constructorOwner = null;

    if (constructorOwner !== null && ASSIGNMENT_NODE.test(node.type)) {
      const lhs = firstField(node, ASSIGNMENT_LHS_FIELDS);
      const name = lhs ? selfMemberName(lhs) : null;
      if (lhs && name !== null && !isBlankName(name)) {
        constructorFields.push({ node, nameNode: lhs, name, container: constructorOwner });
      }
    }

    if (EXPORT_WRAPPER_NODE_TYPES.has(node.type)) sawExportWrapper = true;
    // El campo `declaration` de un envoltorio de export (ver
    // `EXPORT_WRAPPER_NODE_TYPES`'s docstring) — `null` cuando el envoltorio
    // no tiene una declaración propia (`export { Nombre };`, brecha
    // declarada) o cuando `node` no es un envoltorio en absoluto, en cuyo
    // caso NINGÚN hijo recibe `exported=true` por esta vía (aunque el padre
    // sí lo haya propagado — de ahí `childExported` como fallback, no `false`
    // a fuerza).
    const exportDeclChild = EXPORT_WRAPPER_NODE_TYPES.has(node.type)
      ? (node.childForFieldName("declaration") as AstNode | null)
      : null;

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i) as AstNode | null;
      if (child) walk(child, exportDeclChild !== null ? isSameNode(child, exportDeclChild) : childExported);
    }
    for (let i = 0; i < pushedCount; i++) scopeStack.pop();
    constructorOwner = outerConstructorOwner;
  };

  walk(root, false);

  // POST-PROCESO 1, Ola U (C2), HUECO #1 — LOS CAMPOS DEL CONSTRUCTOR, RECIÉN
  // AHORA. No se pueden emitir durante el recorrido porque la pregunta que
  // decide si van o no es de ARCHIVO ENTERO: "¿el tipo ya declara este miembro
  // por alguna otra vía?". Java escribe el campo DOS veces (el
  // `variable_declarator` del cuerpo de la clase Y el `this.n = n` del
  // constructor) y las dos pueden aparecer en cualquier orden; emitir las dos
  // fabricaría un hermano homónimo `@2`, o sea un nodo DUPLICADO del mismo
  // campo — peor que el hueco que se está tapando, y encima invisible para
  // `unused-symbol`, que descarta los `@n` por diseño.
  //
  // La clave es `(container, name)`, exactamente la misma con la que
  // `build.ts` arma el id del nodo (`symbolNodeId(file, [...container, name])`)
  // — si dos entradas comparten clave, comparten id, y ésa es la definición
  // de duplicado que importa. También deduplica entre sí: dos constructores
  // sobrecargados que asignan el mismo campo, o `@x = nil` seguido de
  // `@x = algo`, declaran UN campo, no dos.
  const declaredKeys = new Set(out.map((s) => `${s.container.join(".")} ${s.name}`));
  for (const f of constructorFields) {
    const key = `${f.container.join(".")} ${f.name}`;
    if (declaredKeys.has(key)) continue;
    declaredKeys.add(key);
    out.push({
      name: f.name,
      container: f.container,
      // VERBATIM, igual que todo `nodeType` de este archivo: el tipo de nodo de
      // la asignación tal cual lo escribió la gramática (`assignment`,
      // `assignment_expression`), nunca una etiqueta inventada. Quien lo lea
      // sabe por él que este símbolo vino de un sitio de ASIGNACIÓN y no de una
      // declaración con ranura propia.
      nodeType: f.node.type,
      // La MISMA familia que ya tiene un campo escrito a nivel de cuerpo de
      // clase (el `variable_declarator` de java) — no una familia nueva. Eso
      // es lo que hace el cambio ADITIVO: ningún consumidor tiene que aprender
      // nada para ver estos campos, y los que filtran por `function-like`
      // (`memberSignatures`, `unused-symbol`) siguen sin verlos, como antes.
      family: "other",
      // TRUE, Y ES LA PARTE QUE NO SE PUEDE OMITIR. `record` lo derivaría del
      // marco inmediato —que acá es el CONSTRUCTOR, function-like— y daría
      // `false`, o sea "se llega a este símbolo por su nombre desnudo desde
      // todo el repo". Un campo llamado `name`/`value`/`items` con esa marca es
      // exactamente la forma del hub falso más grande que este proyecto midió
      // (`declaredReceiverTypeName`: 1.724 aristas hacia un único método `error`
      // de Go). A un campo se llega por su dueño, siempre.
      memberOfClassLike: true,
      namespaceContainerOnly: false,
      startLine: f.node.startPosition.row + 1,
      endLine: f.node.endPosition.row + 1,
      nameLine: f.nameNode.startPosition.row + 1,
      nameColumn: f.nameNode.startPosition.column,
      // Provisional, igual que en `record`: el post-proceso 2 lo corrige si el
      // archivo nunca usó la sintaxis de export. `false` acá deja al campo con
      // el MISMO valor que cualquier otro miembro de una clase exportada (ver
      // `childExported = false` en `walk`), que es lo que corresponde: exportar
      // la clase no exporta sus campos.
      exported: false,
    });
  }

  // POST-PROCESO 2 — `SymbolFacts.exported`'s docstring: el default sólo puede
  // fijarse DESPUÉS de recorrer el archivo entero. Si `export_statement`
  // (u otro tipo en `EXPORT_WRAPPER_NODE_TYPES`) NUNCA apareció, este archivo
  // no probó que su gramática siquiera distinga "exportado" de
  // "no-exportado" (podría ser una gramática sin ese concepto — Ruby/Python/
  // Go/Java/C# — o un `.ts`/`.js` real de sólo efectos, sin un solo
  // `export`), así que el default permisivo (`true`) gana para TODO lo que
  // no quedó `false` por `visibility === "private"` (Java/C#, ver arriba —
  // esa evidencia negativa es independiente de si el archivo usa `export` en
  // absoluto, así que se preserva sin tocar).
  if (!sawExportWrapper) {
    for (let i = 0; i < out.length; i++) {
      if (out[i]!.visibility !== "private") out[i] = { ...out[i]!, exported: true };
    }
  }

  return out;
}
