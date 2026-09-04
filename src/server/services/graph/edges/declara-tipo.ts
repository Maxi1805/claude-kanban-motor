/**
 * `declares-type` — DE UNA DECLARACIÓN AL NODO DEL TIPO QUE SOSTIENE.
 * Ola R, frente R1. Vía 1 de 2: **EL TIPO ESCRITO**, donde la gramática lo
 * escribe. Es EXTRACCIÓN SINTÁCTICA, nunca inferencia.
 *
 * Hasta hoy el grafo modelaba sólo la ESTRUCTURA del programa: quién contiene
 * a quién y quién llama a quién, todo entre declaraciones con nombre. Lo que
 * no sabía era DE DÓNDE VIENE UN VALOR — en `x.foo()` no sabía qué es `x`,
 * porque una variable local o un parámetro no son nodos del grafo. Este
 * módulo pone el primer eslabón: el sitio de declaración pasa a ser un nodo
 * (`carrier`, el mismo `GraphNodeKind` que `portador.ts`/
 * `invocacion-indirecta.ts` ya usan para "un sitio que porta un valor") y una
 * arista `declares-type` lo conecta con el nodo de la clase que sostiene.
 *
 * ── EL ÚNICO CRITERIO DE EXTRACCIÓN: EL CAMPO `type` DE LA GRAMÁTICA ──────
 *
 * Verificado por sonda directa (`web-tree-sitter` + `tree-sitter-wasms`,
 * `scratchpad-r1/probe-tipos.mjs` de este frente — nunca leído de una tabla):
 * las CINCO gramáticas que escriben el tipo lo exponen en el MISMO campo,
 * `type`, sobre el nodo de la declaración:
 *
 *   | lenguaje | campo   | nodos observados                                            |
 *   |----------|---------|-------------------------------------------------------------|
 *   | java     | `type`  | `field_declaration`, `formal_parameter`, `local_variable_declaration`, `enhanced_for_statement`, `catch_formal_parameter` |
 *   | csharp   | `type`  | `variable_declaration`, `parameter`, `property_declaration`  |
 *   | typescript | `type` | `public_field_definition`, `property_signature`, `required_parameter`, `optional_parameter`, `variable_declarator` |
 *   | go       | `type`  | `field_declaration`, `parameter_declaration`, `var_spec`     |
 *   | python   | `type`  | `assignment` (PEP 526), `typed_parameter`, `typed_default_parameter` |
 *
 * O sea: NINGUNA regla por lenguaje decide QUÉ es una declaración tipada —
 * decide la gramática, con un nombre de campo que las cinco comparten. Lo
 * único por lenguaje son las dos listas de vocabulario de LENGUAJE del final
 * (`PRIMITIVE_TYPE_NODE`, `PRIMITIVE_TYPE_WORDS`), y las dos son palabras
 * reservadas — misma categoría que `SELF_KEYWORDS` en `portador.ts` y
 * `CONSTRUCTOR_NAMES` en `code-grammar.ts`, nunca léxico de dominio.
 *
 * ── LOS TRES CASOS DEL DESTINO, Y NINGUNO ES UN HUECO ─────────────────────
 *
 *   1. **una clase del repo** ⇒ `typeForm: "nominal"` + ARISTA `declares-type`
 *      al nodo de esa clase. El caso útil.
 *   2. **un primitivo o un literal** ⇒ `typeForm: "primitive"`, NODO SIN
 *      ARISTA: un entero no es una declaración del repo, así que no hay nodo
 *      al que apuntar. **Es INFORMACIÓN, no una falla**: `flag-accumulator`
 *      pregunta literalmente "¿el acumulador es un primitivo?".
 *   3. **una librería externa** ⇒ `typeForm: "nominal"` y NINGUNA arista: se
 *      escribió un nombre, ninguna declaración del repo lo lleva. Es el
 *      **`no sé` EXPLÍCITO**: distinto de "nadie miró" (ese sitio ni siquiera
 *      tiene nodo) y distinto de "miré y no hay tipo escrito".
 *
 * Y un cuarto que el contrato original no nombra pero la gramática sí produce:
 * `typeForm: "composite"` — un tipo CONSTRUIDO sin base nominal a la que
 * apuntar (`Foo[]`, `[]Foo`, `map[string]Foo`, `chan Foo`, `{x: 1}`,
 * `A & B`). Decirle "no sé" sería mentir: sí se sabe, y se sabe que NO es una
 * clase del repo. Ver `DeclaredTypeAnswer`.
 *
 * ── LAS TRES REGLAS DE LA RELACIÓN, Y DÓNDE VIVE CADA UNA ─────────────────
 *
 *   1. **MULTIVALUADA.** Dos orígenes distintos ⇒ "uno de estos dos", no un
 *      tipo. NO se inventa vocabulario: `provenance: "ambiguous"` +
 *      `alternatives`, lo que `CodeGraphEdge` ya tiene. Dos caminos llegan
 *      ahí y los dos terminan en `collapseByFrom` de este archivo: la unión
 *      ESCRITA (`Foo | Bar` de TypeScript — sintaxis, no inferencia) y los
 *      HOMÓNIMOS que la cascada de `resolve.ts` no pudo desempatar (ese
 *      camino ya emitía `ambiguous` solo).
 *   2. **`no sé` EXPLÍCITO.** Ver el caso 3 de arriba y `DeclaredTypeAnswer`:
 *      `"no-fact"` (nadie miró / no hay tipo escrito) NUNCA se confunde con
 *      `"unresolved"` (miré, hay un nombre escrito, no es del repo).
 *   3. **PROHIBIDO INFERIR POR CONJUNTO DE MIEMBROS.** Este módulo no mira
 *      NUNCA los miembros de nada: mira un campo `type` de la gramática y
 *      resuelve ese NOMBRE con la cascada que ya existe. No hay un solo punto
 *      donde "estos miembros coinciden" pueda entrar — que es la forma exacta
 *      de `deriveSatisfiesEdges`, el bug que fabricó 1.360 aristas falsas.
 *
 * ── POR QUÉ UN `EdgeKind` NUEVO Y NO UN CAMPO DEL NODO ────────────────────
 *
 * Porque el destino es MULTIVALUADO y el vocabulario de multivaluado vive en
 * `CodeGraphEdge`, no en `CodeGraphNode`: `provenance: "ambiguous"` +
 * `alternatives` (regla 1, textual: "el grafo ya tiene el vocabulario... no
 * inventes uno nuevo"). Un campo `declaredTypeNodeId?: string` en el nodo
 * habría obligado a inventar un segundo vocabulario de ambigüedad —
 * exactamente lo prohibido. Costo medido del `EdgeKind` nuevo: 4 archivos
 * fuera de `graph/edges/` (ver el informe R1), tres de ellos forzados por el
 * compilador (`Record<EdgeKind, ...>` exhaustivo) y ninguno con lógica.
 *
 * ── POR QUÉ UN `EdgeExtractor` REGISTRADO Y NO UN CAMPO NUEVO DE `GraphFileFacts` ──
 *
 * La extracción necesita el AST VIVO, que `graph/build.ts` no tiene. Los dos
 * precedentes de la Ola 9 (`portador.ts`, `invocacion-indirecta.ts`) pidieron
 * un campo nuevo en `GraphFileFacts` y una llamada nueva en
 * `code-analyzer.ts` — y quedaron INERTES una ola entera porque esa llamada
 * no llegó ("`carrierFacts` ahora SÍ existe... siempre inerte por
 * `f.carrierFacts` ausente"). `EDGE_EXTRACTORS` + `warmup.ts#extractEdgeFacts`
 * ya corren sobre cada archivo en producción, así que registrarse ahí hace
 * que esto emita desde el primer día sin tocar un archivo ajeno. El precio es
 * que los hechos viajan como `EdgeFacts` (serializable, sin resolver) y que
 * los que NO son nominales viajan con `toName: ""` — ver `DECL_NO_TARGET`.
 */
import type { DerivedNodeSets } from "../../code-grammar.js";
import type { AstNode, FileUnit } from "../../detect/types.js";
import { ALL_STAGES, resolveReferences } from "../resolve.js";
import { AMBIGUOUS_MAX_TARGETS, type ReferenceSite, type ResolutionCandidate, type ResolutionContext, type ResolveOptions, type ResolutionStats, type SymbolRef } from "../stages.js";
import type { ReferenceFacts } from "../references.js";
import { declaredReceiverTypeName, fileLevelTypeNames } from "../symbols.js";
import { carrierNodeId, symbolNodeId, type CodeGraphEdge, type CodeGraphNode, type GraphIndex } from "../types.js";
import { portadorCarrierId } from "./portador.js";
import { PROPAGA_TIPO_ID } from "./propaga-tipo.js";
import type { DeclSiteForm, EdgeContext, EdgeExtractor, EdgeFacts, WrittenTypeForm } from "./types.js";

/** El `EdgeFacts.extractorId` de este módulo. Inmutable — `graph/build.ts` lo cruza contra `EDGE_EXTRACTORS`. */
export const DECLARA_TIPO_ID = "declara-tipo";

/**
 * `EdgeFacts.toName` de un hecho que NO apunta a ningún nombre: un primitivo
 * o un tipo compuesto. El hecho SÍ viaja (materializa su nodo `carrier` con
 * `declaredTypeForm`, que es la mitad que `flag-accumulator` necesita), pero
 * nunca entra a la cascada de resolución. `graph/build.ts` filtra por
 * `kind === "declares-type"` antes de armar candidatos, así que este centinela
 * jamás llega a `declarationsByName("")`.
 */
export const DECL_NO_TARGET = "";

/* ════════════════════════════════════════════════════════════════════════
 * VOCABULARIO — todo lo de acá abajo es GRAMÁTICA o PALABRA RESERVADA DEL
 * LENGUAJE. Ni una sola entrada nombra un framework, una librería o un
 * ecosistema (regla de genericidad de la ola).
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * Envoltorios TRANSPARENTES: el valor declarado ES del tipo de adentro, así
 * que se desenvuelven antes de clasificar. Confirmado por sonda: TypeScript
 * envuelve TODA anotación en `type_annotation` (`: Repo`) y Python en `type`;
 * `*Foo` de Go y `Foo?` de C# son el MISMO valor que un `Foo` a los efectos
 * de a qué clase pertenece. `readonly Foo[]` de TS desenvuelve a `array_type`,
 * que NO es transparente — y ahí para.
 */
const TRANSPARENT_TYPE_NODE = /^(type_annotation|type|pointer_type|nullable_type|readonly_type|parenthesized_type)$/;

/**
 * Tipos de nodo que la gramática DEDICA a un primitivo o a un literal —
 * `integral_type`/`floating_point_type`/`boolean_type` (java),
 * `predefined_type` (csharp, typescript), `literal_type` (typescript),
 * `void_type`/`void_keyword`. Confirmado por sonda en las cinco gramáticas.
 */
const PRIMITIVE_TYPE_NODE = /^(integral|floating_point|boolean|void|predefined|literal|primitive)_(type|keyword)$/;

/**
 * "Acá NO hay tipo escrito": el nodo/palabra con que un lenguaje pide que el
 * tipo lo ponga el compilador. `implicit_type` es el nodo de C#; Java escribe
 * `var` como un `type_identifier` cualquiera (confirmado por sonda: `var j =
 * 1;` produce `type:type_identifier "var"`), así que hace falta también la
 * palabra. Un sitio así NO produce ningún hecho — el tipo escrito no existe,
 * y ésa es la vía del frente R2 (propagación desde el origen), no ésta.
 */
const INFERRED_TYPE_NODE = /^implicit_type$/;
const INFERRED_TYPE_WORDS: ReadonlySet<string> = new Set(["var"]);

/**
 * Nombres de tipo PREDECLARADOS por el lenguaje, para los dos lenguajes cuya
 * gramática NO les da un tipo de nodo propio: Go escribe `int`/`string` como
 * `type_identifier` a secas, y Python como un `identifier` dentro de su nodo
 * `type` (confirmado por sonda en las dos). Son palabras del LENGUAJE —
 * misma categoría que `SELF_KEYWORDS` (`portador.ts`) y `CONSTRUCTOR_NAMES`
 * (`code-grammar.ts`), no léxico de dominio.
 *
 * Deliberadamente NO están `error`/`any` de Go ni `object` de Python: no son
 * escalares, y llamarlos "primitivo" habría contestado que SÍ se sabe algo
 * donde lo honesto es `unresolved` (`no sé`). Una clase del repo llamada
 * exactamente `int`/`string` quedaría mal clasificada — no se observó ninguna
 * y el costo de equivocarse es un `primitive` de más, nunca una arista falsa.
 */
const PRIMITIVE_TYPE_WORDS: ReadonlySet<string> = new Set([
  // go — "Predeclared identifiers / Types" de la especificación
  "bool", "byte", "complex64", "complex128", "float32", "float64", "int", "int8", "int16", "int32", "int64",
  "rune", "string", "uint", "uint8", "uint16", "uint32", "uint64", "uintptr",
  // python — escalares incorporados (PEP 484/526)
  "int", "float", "complex", "bool", "str", "bytes", "bytearray", "None", "NoneType",
]);

/**
 * Los campos por los que un nodo de declaración nombra AL DECLARADO (no al
 * tipo). Mismo vocabulario que `portador.ts` ya usa para el lado izquierdo de
 * una asignación (`name`/`left`) más los dos que la sonda encontró en las
 * gramáticas tipadas: `declarator` (java: `field_declaration` →
 * `variable_declarator`) y `pattern` (typescript: `required_parameter`).
 */
const DECL_NAME_FIELDS = ["name", "declarator", "left", "pattern"] as const;

/**
 * Los campos cuyo SUBÁRBOL es una lista de parámetros. Mismo par que
 * `symbols.ts#computeArity` y `references.ts#collectParamNames` ya leen
 * (`parameters`/`parameter_list`) más `receiver`, que es la lista de UN
 * parámetro con que Go escribe el receptor de un método (`func (s *Svc)`) —
 * el sitio que tipa `s` con la clase dueña, medido como la única fuente de
 * "el receptor tiene tipo escrito" en Go.
 */
const PARAM_LIST_FIELDS: ReadonlySet<string> = new Set(["parameters", "parameter_list", "receiver"]);

/** Palabra reservada del LENGUAJE, no vocabulario de dominio — copia deliberada de `portador.ts#SELF_KEYWORDS` (archivo de otro dueño, no se importa un símbolo privado). */
const SELF_KEYWORDS: ReadonlySet<string> = new Set(["self", "this"]);
const RECEIVER_FIELDS = ["receiver", "object", "operand", "expression"];
const MEMBER_FIELDS = ["method", "field", "property", "attribute", "name"];

/** Un encadenamiento de identificadores con punto o `::` — `Foo`, `pkg.Foo`, `a::b::C`. La forma que `resolve.ts#splitQualifierText` ya sabe partir. */
const DOTTED_IDENTIFIER = /^[A-Za-z_$][\w$]*([.:]{1,2}[A-Za-z_$][\w$]*)*$/;

/* ════════════════════════════════════════════════════════════════════════
 * EXTRACCIÓN — pura, síncrona, sobre el AST vivo.
 * ════════════════════════════════════════════════════════════════════════ */

/** Un nombre de tipo ESCRITO, ya partido en calificador + nombre. Sin resolver. */
interface WrittenTypeName {
  readonly name: string;
  readonly qualifier: readonly string[];
}

interface WrittenType {
  readonly form: WrittenTypeForm;
  /** Vacío salvo `form === "nominal"`. Más de uno = unión ESCRITA (regla 1). */
  readonly names: readonly WrittenTypeName[];
}

const COMPOSITE: WrittenType = { form: "composite", names: [] };
const PRIMITIVE: WrittenType = { form: "primitive", names: [] };

function firstNamedChild(node: AstNode): AstNode | null {
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c && c.isNamed) return c;
  }
  return null;
}

function firstField(node: AstNode, fields: readonly string[]): AstNode | null {
  for (const f of fields) {
    const c = node.childForFieldName(f) as AstNode | null;
    if (c) return c;
  }
  return null;
}

/** `self.foo`/`this.foo` ⇒ `"foo"`; `null` si no tiene esa forma. Duplicado deliberado de `portador.ts#memberOfSelf`, igual que `invocacion-indirecta.ts` ya lo duplica. */
function memberOfSelf(node: AstNode): string | null {
  const receiver = firstField(node, RECEIVER_FIELDS);
  if (!receiver || !SELF_KEYWORDS.has(receiver.text)) return null;
  const member = firstField(node, MEMBER_FIELDS);
  return member ? member.text : null;
}

/** Parte `a.b.C` / `a::b::C` en `{qualifier: ["a","b"], name: "C"}`. */
function splitDotted(text: string): WrittenTypeName | null {
  const trimmed = text.trim();
  if (!DOTTED_IDENTIFIER.test(trimmed)) return null;
  const segments = trimmed.split(/[.:]{1,2}/).filter((s) => s.length > 0);
  const name = segments[segments.length - 1];
  if (name === undefined) return null;
  return { name, qualifier: segments.slice(0, -1) };
}

/**
 * Clasifica el nodo de tipo ESCRITO. `null` ⇒ no hay tipo escrito acá (`var`
 * y compañía) y el sitio no produce ningún hecho.
 *
 * El orden importa y está elegido: primero se desenvuelve, después se
 * descarta lo que no es un tipo, después lo que la gramática marca como
 * primitivo, después las dos formas COMPUESTAS que sí tienen una base nominal
 * (unión y genérico) y recién al final la prueba de texto — que es la que
 * cubre `type_identifier`/`identifier`/`scoped_type_identifier`/
 * `qualified_type`/`attribute`/`nested_type_identifier` de una sola vez, sin
 * enumerar seis nombres de nodo por gramática.
 */
function classifyWrittenType(node: AstNode, depth = 0): WrittenType | null {
  if (depth > 8) return COMPOSITE; // una anotación anidada 8 niveles no aporta un destino; cortar antes que recurrir sin fin.

  if (TRANSPARENT_TYPE_NODE.test(node.type)) {
    const inner = firstNamedChild(node);
    if (!inner) return null;
    return classifyWrittenType(inner, depth + 1);
  }
  if (INFERRED_TYPE_NODE.test(node.type) || INFERRED_TYPE_WORDS.has(node.text.trim())) return null;
  if (PRIMITIVE_TYPE_NODE.test(node.type)) return PRIMITIVE;

  // Unión ESCRITA — el caso multivaluado de la regla 1 que la SINTAXIS
  // declara sola, sin inferir nada. Los miembros primitivos/literales
  // (`Foo | null`, `Foo | undefined`) NO cuentan como alternativa: el sitio
  // sigue teniendo un solo tipo del repo posible, y tratarlo como ambiguo
  // habría escondido el caso más común de TypeScript detrás de la exclusión
  // por defecto de `edgeIsAmbiguous`.
  if (/^union_type$/.test(node.type)) {
    const names: WrittenTypeName[] = [];
    let sawPrimitive = false;
    for (let i = 0; i < node.childCount; i++) {
      const c = node.child(i) as AstNode | null;
      if (!c || !c.isNamed) continue;
      const member = classifyWrittenType(c, depth + 1);
      if (!member) continue;
      if (member.form === "primitive") sawPrimitive = true;
      names.push(...member.names);
    }
    if (names.length > 0) return { form: "nominal", names: dedupeNames(names) };
    return sawPrimitive ? PRIMITIVE : COMPOSITE;
  }

  // Genérico: la base ES el tipo declarado. `List<Foo>` declara un `List`, no
  // un `Foo` — decir `Foo` sería inferir el elemento desde el contenedor.
  // BRECHA DECLARADA: el tipo del ELEMENTO no se modela; Composite lo va a
  // necesitar (ver CONTRATO-DECLARA-TIPO.md §6).
  if (/^generic_(type|name)$/.test(node.type)) {
    const base = firstNamedChild(node);
    if (!base) return COMPOSITE;
    const inner = classifyWrittenType(base, depth + 1);
    return inner && inner.form === "nominal" ? inner : COMPOSITE;
  }

  // Referencia adelantada de PEP 484 (`x: "Foo"`): el nodo es un `string` de
  // la gramática y su contenido es un nombre de tipo. Sólo se acepta si el
  // contenido ENTERO es un encadenamiento de identificadores — nunca se
  // parsea una expresión de tipo dentro de una cadena.
  if (/^string$/.test(node.type)) {
    const unquoted = node.text.trim().replace(/^['"]|['"]$/g, "");
    const split = splitDotted(unquoted);
    return split ? nominalOrPrimitive(split) : COMPOSITE;
  }

  const split = splitDotted(node.text);
  if (split) return nominalOrPrimitive(split);
  return COMPOSITE;
}

function nominalOrPrimitive(n: WrittenTypeName): WrittenType {
  if (n.qualifier.length === 0 && PRIMITIVE_TYPE_WORDS.has(n.name)) return PRIMITIVE;
  return { form: "nominal", names: [n] };
}

function dedupeNames(names: readonly WrittenTypeName[]): readonly WrittenTypeName[] {
  const seen = new Set<string>();
  const out: WrittenTypeName[] = [];
  for (const n of names) {
    const key = `${n.qualifier.join(".")}::${n.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

/**
 * El NOMBRE DECLARADO de un nodo de declaración, y si ese nombre es un
 * miembro de la clase envolvente (`self.conn: Conn = ...`). Devuelve una
 * entrada por declarador: `int a, b;` de Java declara DOS sitios con el mismo
 * tipo, y perder el segundo sería perder un campo real.
 */
function declaredNames(node: AstNode, typeNode: AstNode): readonly { readonly name: string; readonly ownerIsEnclosingClass: boolean }[] {
  const out: { name: string; ownerIsEnclosingClass: boolean }[] = [];

  // 1. Declaradores explícitos (java: campo `declarator`; csharp: hijos
  //    `*_declarator` sin nombre de campo). Uno por variable declarada.
  const declarators: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (!c || !c.isNamed) continue;
    if (fieldNameForChild(node, i) === "declarator" || /_declarator$/.test(c.type)) declarators.push(c);
  }
  for (const d of declarators) {
    const bare = bareNameOf(d);
    if (bare !== null) out.push({ name: bare, ownerIsEnclosingClass: false });
  }
  if (out.length > 0) return out;

  // 2. Campo de nombre directo (`name`/`left`/`pattern`).
  const named = firstField(node, DECL_NAME_FIELDS);
  if (named) {
    const member = memberOfSelf(named);
    if (member !== null) return [{ name: member, ownerIsEnclosingClass: true }];
    const bare = bareNameOf(named);
    if (bare !== null) return [{ name: bare, ownerIsEnclosingClass: false }];
    return [];
  }

  // 3. Sin campo de nombre: el primer identificador desnudo que NO sea el
  //    nodo de tipo. Es la forma de `typed_parameter` de Python (`x: int`
  //    expone SÓLO `type`; el nombre es un hijo sin campo) — confirmado por
  //    sonda, no supuesto.
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (!c || !c.isNamed) continue;
    if (isSameNode(c, typeNode)) continue;
    const bare = bareNameOf(c);
    if (bare !== null) return [{ name: bare, ownerIsEnclosingClass: false }];
  }
  return [];
}

/** El identificador desnudo de un nodo: él mismo si ya lo es, su campo `name`, o el primer hijo nombrado que sí lo sea (`*args` ⇒ `list_splat_pattern` ⇒ `args`). */
function bareNameOf(node: AstNode): string | null {
  if (node.childCount === 0 && node.isNamed) return node.text;
  const nameField = node.childForFieldName("name") as AstNode | null;
  if (nameField && nameField.childCount === 0 && nameField.isNamed) return nameField.text;
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c && c.isNamed && c.childCount === 0) return c.text;
  }
  return null;
}

interface FieldNamedNode extends AstNode {
  fieldNameForChild(index: number): string | null;
}

/** Mismo idioma que `portador.ts`/`sentinel.ts`: `fieldNameForChild` no está en `AstNode`, se pide en la hoja. */
function fieldNameForChild(node: AstNode, index: number): string | null {
  const f = node as FieldNamedNode;
  return typeof f.fieldNameForChild === "function" ? f.fieldNameForChild(index) : null;
}

/** Ver `symbols.ts#isSameNode`: dos llamadas distintas devuelven objetos JS distintos para el mismo nodo, así que la posición hace de identidad. */
function isSameNode(a: AstNode, b: AstNode): boolean {
  return a.startPosition.row === b.startPosition.row && a.startPosition.column === b.startPosition.column && a.type === b.type;
}

/**
 * Copia FIEL de `symbols.ts#splitQualifiedSegments` (privada allá; el split
 * de archivos de esta ola prohíbe importar un símbolo no exportado). SI SE
 * TOCA UNA, SE TOCA LA OTRA — el `container` de `SymbolFacts` y el
 * `fromPath` de acá tienen que dar el mismo camino o el sitio no cuelga de
 * ningún nodo.
 */
function splitQualifiedSegments(text: string): readonly string[] {
  const parts = text.split(/::|\./).filter((s) => s.length > 0);
  return parts.length > 0 ? parts : [text];
}

interface Frame {
  readonly name: string | null;
  readonly isFunctionLike: boolean;
  readonly isClassLike: boolean;
}

/**
 * Deriva los sitios de declaración con tipo escrito de UN archivo. Pura y
 * síncrona sobre un árbol ya parseado — mismo momento y misma disciplina que
 * `extractSymbols`/`extractReferences`/`extractCarrierFacts`.
 *
 * `EdgeFacts.fromPath` es `[...contenedores, nombreDeclarado]`: el camino
 * COMPLETO hasta el sitio, no hasta su contenedor. Es lo que le da identidad
 * propia a cada parámetro/campo/variable y lo que `declaraTipoNodeId` traduce
 * a un nodo `carrier`.
 */
export function extractTypeDeclFacts(root: AstNode, sets: DerivedNodeSets): readonly EdgeFacts[] {
  const out: EdgeFacts[] = [];
  const scopeStack: Frame[] = [];
  // LA PILA DE SCOPE TIENE QUE DAR EXACTAMENTE `SymbolFacts.container`, o el
  // `fromPath` de un hecho nombraría un sitio que no cuelga de ningún nodo
  // del grafo. Por eso se reusan las DOS piezas de `symbols.ts` que hacen esa
  // alineación, en vez de copiarlas: el tipo receptor escrito como contenedor
  // (`func (s *Svc) Run` ⇒ `Svc.Run`, medido: sin esto los 4 sitios tipados
  // de un método de Go quedaban colgando de `Run` a secas) y el split de un
  // nombre COMPUESTO (`namespace A.B` de C# ⇒ dos segmentos, no uno).
  const fileTypes = fileLevelTypeNames(root, sets);

  const containerPathOf = (): readonly string[] => scopeStack.filter((f) => f.name !== null).map((f) => f.name as string);
  const nearestClassPath = (): readonly string[] | null => {
    for (let i = scopeStack.length - 1; i >= 0; i--) {
      if (scopeStack[i]!.isClassLike) {
        return scopeStack.slice(0, i + 1).filter((f) => f.name !== null).map((f) => f.name as string);
      }
    }
    return null;
  };
  const immediate = (): Frame | undefined => scopeStack[scopeStack.length - 1];

  const visit = (node: AstNode, inParamList: boolean): void => {
    if (!node.isNamed) return;

    const functionLike = sets.functionNodes.has(node.type);
    const classLike = !functionLike && sets.classNodes.has(node.type);

    // Un nodo function-like con campo `type` es un TIPO DE RETORNO y un
    // class-like con campo `type` es una DECLARACIÓN DE TIPO (`type_spec` de
    // Go). Ninguno de los dos es "una declaración que sostiene un valor" —
    // brecha declarada, ver CONTRATO-DECLARA-TIPO.md §6.
    if (!functionLike && !classLike) emitFor(node, inParamList);

    let pushedCount = 0;
    if (functionLike || classLike) {
      // Mismo orden y misma guarda que `extractSymbols`: el tipo receptor se
      // empuja ANTES del nombre del método, y sólo si ESTE archivo declara
      // ese tipo (si no, el `contains` colgaría de un nodo que no existe).
      if (functionLike && scopeStack.length === 0) {
        const receiverType = declaredReceiverTypeName(node);
        if (receiverType !== null && fileTypes.has(receiverType)) {
          scopeStack.push({ name: receiverType, isFunctionLike: false, isClassLike: true });
          pushedCount++;
        }
      }
      const nameNode = node.childForFieldName("name") as AstNode | null;
      const segments: readonly (string | null)[] = nameNode ? splitQualifiedSegments(nameNode.text) : [null];
      for (const seg of segments) scopeStack.push({ name: seg, isFunctionLike: functionLike, isClassLike: classLike });
      pushedCount += segments.length;
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i) as AstNode | null;
      if (!child) continue;
      const field = fieldNameForChild(node, i);
      visit(child, inParamList || (field !== null && PARAM_LIST_FIELDS.has(field)));
    }
    for (let i = 0; i < pushedCount; i++) scopeStack.pop();
  };

  const emitFor = (node: AstNode, inParamList: boolean): void => {
    const typeNode = node.childForFieldName("type") as AstNode | null;
    if (!typeNode) return;
    const written = classifyWrittenType(typeNode);
    if (!written) return;

    for (const decl of declaredNames(node, typeNode)) {
      const containerPath = decl.ownerIsEnclosingClass ? nearestClassPath() : containerPathOf();
      if (containerPath === null) continue;
      const top = immediate();
      const siteForm: DeclSiteForm = inParamList
        ? "parameter"
        : decl.ownerIsEnclosingClass || (top !== undefined && top.isClassLike)
          ? "field"
          : "local";
      const fromPath = [...containerPath, decl.name];
      const base = {
        extractorId: DECLARA_TIPO_ID,
        kind: "declares-type",
        fromPath,
        provenance: "declared",
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
      } as const;

      if (written.form !== "nominal") {
        out.push({ ...base, toName: DECL_NO_TARGET, toQualifier: [], via: `type:${typeNode.type}`, decl: { siteForm, typeForm: written.form, union: false } });
        continue;
      }
      const union = written.names.length > 1;
      for (const n of written.names) {
        out.push({ ...base, toName: n.name, toQualifier: n.qualifier, via: `type:${typeNode.type}`, decl: { siteForm, typeForm: "nominal", union } });
      }
    }
  };

  visit(root, false);
  return out;
}

/* ════════════════════════════════════════════════════════════════════════
 * EL EXTRACTOR REGISTRADO — corre dentro de `analyzeFile` vía
 * `warmup.ts#extractEdgeFacts`, sobre el MISMO `FileUnit` que ya se armó.
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * Fuente centinela por lenguaje — la usa la compuerta de cobertura
 * (`edge-coverage.ts`) para saber que esta arista TIENE construcción en ese
 * lenguaje. Los cuatro lenguajes que NO están (ruby, javascript, y los dos
 * que comparten gramática con typescript ya cubiertos por él) es porque su
 * gramática no tiene dónde escribir un tipo — ver `EDGE_KIND_SPECS` en
 * `graph/edge-kinds.ts`, entrada `declares-type`.
 */
const SENTINEL: Readonly<Record<string, string>> = {
  java: "class F { SentinelType s; }",
  csharp: "class F { SentinelType s; }",
  typescript: "class F { s: SentinelType; }",
  tsx: "class F { s: SentinelType; }",
  vue: "class F { s: SentinelType; }",
  go: "package p\ntype F struct { s SentinelType }",
  python: "class F:\n    s: SentinelType\n",
};

export const extractor: EdgeExtractor<"declares-type"> = {
  // ARREGLO DE LA OLA R (R2): LITERAL a propósito, y no `DECLARA_TIPO_ID`.
  // `registries.test.ts#ID_RE` busca la CADENA `id: "..."` EN DISCO (nunca
  // importa el módulo), así que un extractor que declara su id por constante
  // queda "sin id reconocible" y rompe el espejo disco↔registro — este
  // archivo lo tenía roto desde que se creó. El test verifica que las dos
  // formas coincidan.
  id: "declara-tipo",
  kind: "declares-type",
  title: "Tipo escrito de una declaración",
  // Ninguna `Capability` de `detect/capabilities.ts` describe "este lenguaje
  // escribe el tipo de sus declaraciones"; el gate real es la ausencia del
  // campo `type` en la gramática, que se mide sola (cero hechos), igual
  // criterio que `instanciacion.ts` documenta para el suyo.
  needs: [],
  // No usa `ctx.carriers()`: el campo `type` es el MISMO en las cinco
  // gramáticas (ver el docstring del módulo), así que no hay nada que una
  // sonda centinela tenga que descubrir. Mismo caso que `imports`/`mixes-in`,
  // que tampoco leen `carriers` (ver `warmup.ts`).
  slots: [],
  sentinel: SENTINEL,
  expect: { from: "F.s", to: "SentinelType" },
  optional: true,

  extract(file: FileUnit, _ctx: EdgeContext): readonly EdgeFacts[] {
    return extractTypeDeclFacts(file.root, file.sets);
  },
};

/* ════════════════════════════════════════════════════════════════════════
 * MATERIALIZACIÓN — nodos (por archivo, sin resolver) y aristas (repo
 * completo, con la cascada que ya existe).
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * EL ID DEL SITIO DE DECLARACIÓN — la única función de identidad de esta
 * relación, y la que R2/R5/R7 tienen que usar.
 *
 * Es EXACTAMENTE `portador.ts#portadorCarrierId` con ordinal 0, a propósito y
 * no por casualidad: un campo `self.conn` al que `invocacion-indirecta.ts` ya
 * le creó un portador (porque alguien escribió `self.conn.foo()`) y el mismo
 * campo declarado con tipo escrito CONVERGEN EN EL MISMO NODO. Ése es el
 * camino de dos tramos que hace útil toda la ola: `invokes-indirect` lleva del
 * método al portador, `declares-type` lleva del portador a la clase.
 */
export function declaraTipoNodeId(file: string, containerPath: readonly string[], declName: string): string {
  return portadorCarrierId(file, containerPath, declName, 0);
}

/**
 * LOS DOS PRODUCTORES DE ESTA RELACIÓN — Ola R. Una sola relación, dos vías,
 * las dos sintácticas (DECISION-TIPOS-Y-FLUJO.md §1):
 *
 *   - `declara-tipo` (R1, este archivo): **el tipo ESCRITO**, donde la
 *     gramática lo escribe. `provenance: "declared"`/`"resolved"`.
 *   - `propaga-tipo` (R2, `propaga-tipo.ts`): **la propagación desde el
 *     ORIGEN** — `x = Foo()`, `self.conn = Conn()`, `@cache = {}`.
 *     `provenance: "inferred"`. Es la ÚNICA vía en Ruby y JavaScript, cuyas
 *     gramáticas no tienen dónde escribir un tipo.
 *
 * Comparten id de nodo, `EdgeKind`, resolución y función de consulta a
 * propósito: si fueran dos relaciones, un consumidor tendría que preguntar
 * dos veces y juntar las respuestas a mano — y el colapso multivaluado
 * (`collapseByFrom`) no podría ver las dos mitades del mismo sitio.
 */
const DECLARES_TYPE_EXTRACTOR_IDS: ReadonlySet<string> = new Set([DECLARA_TIPO_ID, PROPAGA_TIPO_ID]);

/** Sólo los `EdgeFacts` de esta relación, de una lista mezclada de todos los extractores. */
function ownFacts(facts: readonly EdgeFacts[]): readonly EdgeFacts[] {
  return facts.filter((ef) => ef.kind === "declares-type" && DECLARES_TYPE_EXTRACTOR_IDS.has(ef.extractorId) && ef.decl !== undefined);
}

/**
 * **EL TIPO ESCRITO GANA** — CONTRATO-DECLARA-TIPO.md §5.4.
 *
 * Si un sitio tiene tipo escrito, la gramática ya habló de él y el compilador
 * garantiza que nada más puede llegar ahí; un hecho propagado para el MISMO
 * sitio sólo puede empeorar la respuesta (si difiere, `collapseByFrom` los
 * juntaría en una arista `ambiguous` y perdería una respuesta certera).
 *
 * Se aplica por **id de sitio dentro del archivo**, no por orden de los
 * extractores en `WIRED_EXTRACTORS` (cuyo orden el propio `warmup.ts` declara
 * "sin significado"): los dos hechos nacen del MISMO archivo, así que la
 * comparación es local y determinista, y entra igual en el caché per-archivo
 * de `buildGraphIncremental`.
 */
function dropShadowedByWritten(facts: readonly EdgeFacts[]): readonly EdgeFacts[] {
  const own = ownFacts(facts);
  const written = new Set<string>();
  for (const ef of own) {
    if (ef.extractorId === DECLARA_TIPO_ID) written.add(ef.fromPath.join(" "));
  }
  if (written.size === 0) return own;
  return own.filter((ef) => ef.extractorId === DECLARA_TIPO_ID || !written.has(ef.fromPath.join(" ")));
}

/**
 * Los nodos `carrier` de UN archivo. Puro, sin AST y sin resolución cruzada —
 * misma forma que `portador.ts#materializeCarrierFacts`, así que entra en la
 * MISMA función per-archivo que `buildGraphIncremental` ya cachea, sin
 * ampliar su regla de invalidación (`declaredTypeForm` depende sólo de lo que
 * ESTE archivo escribió; que el nombre resuelva o no es una pregunta de repo
 * completo y vive en la ARISTA, no en el nodo).
 */
export function materializeTypeDeclNodes(file: string, facts: readonly EdgeFacts[]): readonly CodeGraphNode[] {
  const nodes: CodeGraphNode[] = [];
  const seen = new Set<string>();
  for (const ef of dropShadowedByWritten(facts)) {
    const declName = ef.fromPath[ef.fromPath.length - 1];
    if (declName === undefined) continue;
    const id = declaraTipoNodeId(file, ef.fromPath.slice(0, -1), declName);
    if (seen.has(id)) continue;
    seen.add(id);
    nodes.push({
      id,
      kind: "carrier",
      file,
      symbolPath: ef.fromPath,
      carrierForm: ef.decl!.siteForm,
      declaredTypeForm: ef.decl!.typeForm,
      // Ola R (R2) — DE QUÉ VÍA salió la forma de este sitio. Hace falta en
      // el NODO, y no alcanza con la `provenance` de la arista, porque los
      // dos casos SIN arista (`primitive`/`composite`) también hay que poder
      // distinguirlos: un `int` escrito lo garantiza el compilador, un `= 5`
      // propagado es lo que ese sitio recibió en las asignaciones que se
      // vieron. Ver `declaredTypeSourceOf`.
      declaredTypeProvenance: ef.extractorId === DECLARA_TIPO_ID ? "declared" : "inferred",
      startLine: ef.startLine,
      endLine: ef.endLine,
    });
  }
  return nodes;
}

/**
 * De `sym:archivo#a.b.c` a `carrier:archivo#a.b.c@0`. La cascada de
 * `resolve.ts` graba SIEMPRE `from: symbolNodeId(file, ref.scope)` (línea
 * fija, no parametrizable sin tocar ese archivo — el mismo motivo por el que
 * `build.ts` re-etiqueta el `kind` después), y acá `ref.scope` es el
 * `fromPath` COMPLETO del sitio, así que el sufijo después del prefijo es
 * literalmente el mismo que `carrierNodeId` produce con ordinal 0. El test de
 * este módulo lo verifica contra los dos constructores reales en vez de
 * confiar en la forma del string.
 */
function symbolIdToCarrierId(symId: string): string {
  return `carrier:${symId.slice("sym:".length)}@0`;
}

/**
 * Colapsa las aristas de un MISMO sitio a UNA sola — regla 1, multivaluada.
 *
 * Llegan hasta acá dos formas de "más de un destino": la unión ESCRITA (una
 * arista por miembro, todas con el mismo `from`) y el `ambiguous` que la
 * cascada ya emitió sola por homónimos (una arista con `alternatives`). Las
 * dos terminan igual: un solo destino ⇒ la arista tal cual; dos o más ⇒ UNA
 * arista `provenance: "ambiguous"` con el primer destino lexicográfico en
 * `to` y el resto en `alternatives`; más de `AMBIGUOUS_MAX_TARGETS` ⇒ ninguna
 * arista, porque "un candidato con 40 declaraciones homónimas no es
 * información, es la ausencia de información" (CONTRATO-F9.md §4.2, la misma
 * regla y la misma constante que `resolve.ts`).
 */
function collapseByFrom(edges: readonly CodeGraphEdge[]): readonly CodeGraphEdge[] {
  const byFrom = new Map<string, CodeGraphEdge[]>();
  for (const e of edges) {
    const list = byFrom.get(e.from);
    if (list) list.push(e);
    else byFrom.set(e.from, [e]);
  }
  const out: CodeGraphEdge[] = [];
  for (const [, list] of byFrom) {
    const targets = new Set<string>();
    for (const e of list) {
      targets.add(e.to);
      for (const alt of e.alternatives ?? []) targets.add(alt);
    }
    const sorted = [...targets].sort();
    const first = list[0]!;
    if (sorted.length === 1) {
      const { alternatives: _drop, ...rest } = first;
      out.push({ ...rest, to: sorted[0]! });
      continue;
    }
    if (sorted.length > AMBIGUOUS_MAX_TARGETS) continue;
    out.push({ ...first, to: sorted[0]!, provenance: "ambiguous", alternatives: sorted.slice(1) });
  }
  return out;
}

/** Lo que `graph/build.ts` necesita de un archivo para armar candidatos: la ruta y sus `EdgeFacts`. */
export interface TypeDeclFileFacts {
  readonly path: string;
  readonly edges?: readonly EdgeFacts[];
}

/**
 * Las aristas `declares-type` del repo COMPLETO. Reusa, literalmente, la
 * misma `resolveReferences`/`ALL_STAGES` que resuelve `references` y las 5
 * aristas tipadas — "nadie escribe un segundo resolutor" (CONTRATO-F4.md
 * §2.5). El candidato sintético es el mismo truco que
 * `build.ts#buildTypedEdgeCandidatesForFile` ya usa, con UNA diferencia
 * deliberada: `ref.scope` es el `fromPath` COMPLETO (hasta el nombre
 * declarado, no hasta su contenedor), para que dos declaraciones del mismo
 * método no colapsen en un solo `from`. Un scope MÁS PROFUNDO no relaja
 * ninguna etapa de la cascada: todas comparan por prefijo/sufijo del
 * contenedor, así que un segmento de más sólo puede hacer visible lo que ya
 * lo era desde el contenedor.
 *
 * Filtro de destino: sólo declaraciones `class-like`/`namespace-like`. Un
 * tipo escrito nombra un TIPO — si el único homónimo del repo es una función
 * o una variable, la respuesta honesta es "no hay clase con ese nombre acá"
 * (`unresolved`), no una arista a lo primero que comparta el nombre.
 */
export function resolveDeclaresTypeEdges(
  files: readonly TypeDeclFileFacts[],
  ctx: ResolutionContext,
  options?: ResolveOptions,
): { readonly edges: readonly CodeGraphEdge[]; readonly stats: ResolutionStats | null } {
  const candidates: ResolutionCandidate[] = [];
  /** Sitios cuyo hecho vino de la PROPAGACIÓN (R2) y no del tipo escrito — su arista lleva `provenance: "inferred"`. */
  const inferredFrom = new Set<string>();
  for (const f of files) {
    let idx = 0;
    for (const ef of dropShadowedByWritten(f.edges ?? [])) {
      if (ef.toName === DECL_NO_TARGET) continue; // primitivo/compuesto: nodo sí, arista no.
      idx++;
      const fromNodeId = symbolNodeId(f.path, ef.fromPath);
      const targets = ctx
        .declarationsByName(ef.toName)
        .filter((t: SymbolRef) => symbolNodeId(t.file, t.symbolPath) !== fromNodeId && isTypeDeclaration(ctx, t));
      if (targets.length === 0) continue; // sin declaración de tipo con ese nombre: `no sé`, y el nodo ya lo dice.
      const hasQualifier = ef.toQualifier.length > 0;
      const ref: ReferenceFacts = {
        name: ef.toName,
        role: hasQualifier ? "qualified" : "bare",
        scope: ef.fromPath,
        qualifier: hasQualifier ? ef.toQualifier.join(".") : null,
        qualifierIsBareConstant: false,
        shadowedLocally: false,
        line: ef.startLine,
        column: 0,
        occurrences: 1,
      };
      const site: ReferenceSite = { file: f.path, ref };
      if (ef.extractorId !== DECLARA_TIPO_ID) inferredFrom.add(symbolIdToCarrierId(fromNodeId));
      candidates.push({ id: `${f.path}::declares-type:${idx}:${ef.startLine}`, from: site, targets });
    }
  }
  if (candidates.length === 0) return { edges: [], stats: null };

  const { edges, stats } = resolveReferences(ALL_STAGES, candidates, ctx, options);
  // Ola R (R2) — `provenance: "inferred"` para la VÍA 2. La cascada etiqueta
  // por CÓMO resolvió el nombre (`declared`/`resolved`/`ambiguous`), que es
  // otra pregunta: acá interesa si la gramática ESCRIBIÓ el tipo o si salió
  // del origen del valor. `"ambiguous"` no se pisa nunca — es la respuesta
  // multivaluada de la regla 1 y gana sobre todo lo demás.
  const relabeled = edges.map((e) => {
    const from = symbolIdToCarrierId(e.from);
    const inferred = inferredFrom.has(from) && e.provenance !== "ambiguous";
    return { ...e, kind: "declares-type" as const, from, ...(inferred ? { provenance: "inferred" as const } : {}) };
  });
  return { edges: collapseByFrom(relabeled), stats };
}

function isTypeDeclaration(ctx: ResolutionContext, ref: SymbolRef): boolean {
  const facts = ctx.symbol(ref);
  if (!facts) return false;
  return facts.family === "class-like" || facts.family === "namespace-like";
}

/* ════════════════════════════════════════════════════════════════════════
 * CONSULTA — la superficie que R2/R5/R7 usan. Ver CONTRATO-DECLARA-TIPO.md.
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * LA RESPUESTA, con los cinco casos separados. `"no-fact"` es el `no sé` de
 * "nadie miró"; `"unresolved"` es el `no sé` de "miré, hay un nombre escrito,
 * no es del repo". Confundirlos es exactamente lo que las reglas de la ola
 * prohíben, y por eso son dos casos y no uno.
 */
export type DeclaredTypeAnswer =
  | { readonly outcome: "no-fact" }
  | { readonly outcome: "primitive" }
  | { readonly outcome: "composite" }
  | { readonly outcome: "unresolved" }
  | { readonly outcome: "class"; readonly nodeId: string }
  | { readonly outcome: "ambiguous"; readonly nodeIds: readonly string[] };

const NO_FACT: DeclaredTypeAnswer = { outcome: "no-fact" };

/** `declaredTypeOf` sobre el sitio `(archivo, contenedores, nombre)` — la entrada práctica cuando ya se sabe qué declaración se está mirando. */
export function declaredTypeOfDeclaration(index: GraphIndex, file: string, containerPath: readonly string[], declName: string): DeclaredTypeAnswer {
  return declaredTypeOf(index, declaraTipoNodeId(file, containerPath, declName));
}

/**
 * Qué tipo sostiene el sitio de declaración `nodeId`. Puro, O(aristas que
 * salen de `nodeId`), sin memoria entre llamadas. Sobre un grafo de antes de
 * esta ola devuelve `"no-fact"` para todo, nunca lanza.
 */
export function declaredTypeOf(index: GraphIndex, nodeId: string): DeclaredTypeAnswer {
  const node = index.nodeById(nodeId);
  if (!node || node.kind !== "carrier" || node.declaredTypeForm === undefined) return NO_FACT;
  if (node.declaredTypeForm === "primitive") return { outcome: "primitive" };
  if (node.declaredTypeForm === "composite") return { outcome: "composite" };

  const own = index.edgesFrom(nodeId).filter((e) => e.kind === "declares-type");
  const first = own[0];
  if (!first) return { outcome: "unresolved" };
  if (first.provenance === "ambiguous") return { outcome: "ambiguous", nodeIds: [first.to, ...(first.alternatives ?? [])] };
  return { outcome: "class", nodeId: first.to };
}

/**
 * DE QUÉ VÍA salió el hecho de este sitio — Ola R (R2). Los seis outcomes de
 * `declaredTypeOf` contestan QUÉ es; esto contesta CUÁNTO vale la palabra:
 *
 *   - `"declared"` — **el tipo ESCRITO** (vía 1). El compilador garantiza que
 *     nada más puede llegar a ese sitio: una lectura y vale para siempre.
 *   - `"inferred"` — **propagado desde el origen** (vía 2). Se vio de dónde
 *     vino el valor en las asignaciones de ESTE archivo. No es una garantía
 *     del lenguaje: es lo que se observó, y por ningún camino se demostró que
 *     no llegue otra cosa.
 *   - `null` — no hay hecho de esta relación para ese nodo.
 *
 * Hace falta en el NODO por DOS motivos, los dos medidos:
 *
 *   1. Los dos casos que NO tienen arista (`primitive`, `composite`) también
 *      hay que poder distinguirlos: un `int` escrito no es lo mismo que un
 *      `= 5` visto.
 *   2. **`edge.provenance === "inferred"` NO significa "vía 2".** La cascada
 *      de `resolve.ts` ya emite `"inferred"` por su cuenta cuando resuelve un
 *      nombre por una etapa débil: medido sobre `eslint` con el extractor de
 *      la vía 2 APAGADO, 15 de 96 aristas `declares-type` salían `inferred`
 *      siendo todas de la vía 1. Filtrar por la arista habría dado un censo
 *      equivocado.
 */
export function declaredTypeSourceOf(index: GraphIndex, nodeId: string): "declared" | "inferred" | null {
  const node = index.nodeById(nodeId);
  if (!node || node.kind !== "carrier" || node.declaredTypeForm === undefined) return null;
  return node.declaredTypeProvenance === "inferred" ? "inferred" : node.declaredTypeProvenance === "declared" ? "declared" : null;
}

/** Verificación de identidad usada por el test: el id que produce la cascada y el que produce `declaraTipoNodeId` son el mismo. */
export function carrierIdFromSymbolId(symId: string): string {
  return symbolIdToCarrierId(symId);
}

/** Re-exportado para que un test pueda comprobar la equivalencia sin duplicar el formato. */
export const rawCarrierNodeId = carrierNodeId;
