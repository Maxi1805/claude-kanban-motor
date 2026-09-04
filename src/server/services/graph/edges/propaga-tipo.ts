/**
 * `declares-type`, **VÍA 2: LA PROPAGACIÓN DESDE EL ORIGEN**.
 * Ola R, frente R2. La otra mitad de `declara-tipo.ts` (vía 1, el TIPO
 * ESCRITO) — misma relación, mismo `EdgeKind`, mismo id de nodo, misma
 * función de consulta (`declaredTypeOf`). Lo único que cambia es de dónde
 * sale el hecho y, por lo tanto, su `provenance`.
 *
 * ── QUÉ CONTESTA, Y POR QUÉ HACE FALTA UNA SEGUNDA VÍA ────────────────────
 *
 * La vía 1 lee el campo `type` de la gramática. Eso deja DOS lenguajes del
 * corpus en CERO absoluto por una propiedad del lenguaje, no del extractor:
 * ni Ruby ni JavaScript tienen dónde escribir un tipo en una declaración
 * (`EDGE_KIND_SPECS["declares-type"].absentIn`, fixtures en
 * `declara-tipo.test.ts`), y deja a Python casi vacío (11,4 % de sus sitios
 * anotados llegan a una clase del repo, medido por R1 sobre `click`).
 *
 * Para esos tres, la ÚNICA vía es la que este módulo aterriza: **de dónde
 * vino el valor**, leído del propio sitio donde se lo asigna.
 *
 *   `x = Foo()`          ⇒ `x` es un `Foo` para todos sus usos de esa función
 *   `self.conn = Conn()` ⇒ `conn` es un `Conn` en TODOS los métodos de la clase
 *   `@cache = {}`        ⇒ `cache` es un COMPUESTO — información, no un hueco
 *   `@n = 5`             ⇒ `n` es un PRIMITIVO — lo que `flag-accumulator` pregunta
 *
 * ── LO QUE **NO** HACE, Y ESTÁ MEDIDO ─────────────────────────────────────
 *
 *   - **No sigue el parámetro hasta sus sitios de llamada.** Medido en
 *     DECISION-TIPOS-Y-FLUJO.md §2: aporta **+3 %**, porque el 88-93 % de los
 *     parámetros no tiene ningún llamador que revele nada (seguir hacia atrás
 *     casi siempre llega a OTRO parámetro). Consecuencia directa: **este
 *     módulo no emite NUNCA para un sitio `parameter`** — sus dos únicas
 *     formas de sitio son `field` y `local`. Un valor por defecto
 *     (`def f(cache=Cache())`) tampoco cuenta: el llamador puede pasar otra
 *     cosa, y decir que el parámetro "es" su default sería exactamente la
 *     afirmación interprocedural que la medición descarta.
 *   - **No persigue alias.** `y = x` no tipa `y` aunque `x` esté tipado: eso
 *     es un segundo salto y su costo no se midió. `null`/`nil`/`None`/
 *     `undefined` tampoco tipan nada — no son un tipo, son la ausencia de
 *     uno (y tratarlos como primitivo habría roto el patrón de inicialización
 *     perezosa `@x = nil` … `@x ||= Foo.new`, que así SÍ queda tipado).
 *   - **No es sensible al orden.** "Para todos sus usos de abajo" se
 *     simplifica a "para toda la función": una asignación en cualquier punto
 *     tipa el sitio entero. Si hay DOS asignaciones con orígenes distintos,
 *     no se elige — ver la regla 1 abajo.
 *
 * ── LAS TRES REGLAS DE LA RELACIÓN, Y DÓNDE VIVE CADA UNA ─────────────────
 *
 * **1. MULTIVALUADA.** Un sitio asignado en dos ramas con orígenes distintos
 * NO se colapsa a un candidato — eso sería reconstruir `deriveSatisfiesEdges`
 * a mayor escala. Dos casos, y los dos están resueltos con el vocabulario que
 * ya existe, sin inventar uno nuevo:
 *
 *   - **dos orígenes NOMINALES distintos** (`x = A()` / `x = B()`): se emiten
 *     LOS DOS hechos, con el mismo `fromPath`, y `declara-tipo.ts#collapseByFrom`
 *     los junta en UNA arista `provenance: "ambiguous"` + `alternatives`.
 *     `edgeIsAmbiguous` la deja fuera de toda consulta por defecto: quien la
 *     quiera, la pide.
 *   - **orígenes que no coinciden ni en la FORMA** (`x = Foo()` en una rama,
 *     `x = 5` en la otra): NO hay vocabulario para "una clase o un entero", y
 *     fabricar uno sería inventar. El sitio queda SIN hecho — el `no sé` de
 *     la regla 2. Se cuenta y se declara (ver el informe R2), no se esconde.
 *
 * **2. `no sé` EXPLÍCITO.** Este módulo produce hecho sólo donde RECONOCE el
 * origen. Un sitio cuya inicialización es una llamada a una fábrica, un valor
 * de librería externa o una expresión compuesta no produce nada, y
 * `declaredTypeOf` contesta `"no-fact"` — que es "nadie miró", distinto de
 * `"unresolved"` ("miré, hay un nombre, no es del repo") y distinto de
 * `"primitive"`/`"composite"` ("miré, y es un dato plano").
 *
 * **3. PROHIBIDO INFERIR POR CONJUNTO DE MIEMBROS.** Acá no se mira NI UN
 * miembro de nada. El origen sale de `instanciacion.ts#constructedTypeAt` —
 * la MISMA función que define qué es una construcción para la arista
 * `instantiates`, derivada por sonda centinela por gramática — o de un tipo
 * de nodo de literal. Ningún punto de este archivo puede contestar "estos
 * miembros coinciden ⇒ es este tipo".
 *
 * ── POR QUÉ REUSA `constructedTypeAt` EN VEZ DE RECONOCER CONSTRUCCIONES ───
 *
 * Porque si no, habría DOS censos de "qué es construir" que no cuadran, que
 * es el mismo argumento con que `instanciacion.ts` la exportó para `stores`
 * (ver su docstring: *"si no, un consumidor que cuenta '¿se construyó
 * exactamente una vez?' con `instantiates` y pregunta '¿y dónde quedó?' con
 * `stores` recibe dos censos que no cuadran"*). El precio es heredar sus dos
 * guardias por lenguaje, con su costo de recall declarado:
 *
 *   - **Ruby**: sólo `Constante.new` (el mensaje de construcción del propio
 *     lenguaje). `klass.new` con receptor dinámico queda afuera.
 *   - **Python**: sólo `Foo(...)` cuyo `Foo` es una clase declarada EN ESTE
 *     MISMO ARCHIVO. Una clase importada de otro archivo no se reconoce —
 *     ésta es, medida, la mayor pérdida de cobertura de este frente.
 *
 * Y el slot de sonda es el MISMO (`instanciacion.slots[0]`, leído del propio
 * extractor y no re-escrito acá), así que `warmup.ts` ya lo tiene calentado:
 * este módulo no necesita una línea nueva en `warmUpLanguage`.
 *
 * ── QUÉ SE COMPARTE CON LA VÍA 1, Y POR QUÉ NO ES UNA RELACIÓN APARTE ──────
 *
 * `CONTRATO-DECLARA-TIPO.md` §5, punto por punto:
 *   1. **Mismo id de nodo** — `portadorCarrierId(file, containerPath, name, 0)`,
 *      idéntico al de `declaraTipoNodeId` y al del portador que
 *      `invocacion-indirecta.ts` crea para un `self.conn.foo()`. Los tres
 *      convergen en el MISMO nodo: ése es el camino de dos tramos
 *      `símbolo --invokes-indirect--> carrier --declares-type--> clase`.
 *   2. **Mismo `EdgeKind`** (`"declares-type"`) y misma resolución
 *      (`resolveDeclaresTypeEdges`), así que el colapso multivaluado y el
 *      filtro "el destino tiene que ser `class-like`" son los mismos.
 *   3. **`provenance: "inferred"` en la arista** — la gramática no lo
 *      escribió. **PERO ESA ETIQUETA NO ALCANZA PARA DISTINGUIR LAS DOS VÍAS,
 *      y está medido:** la cascada de `resolve.ts` también emite `"inferred"`
 *      por su cuenta cuando resuelve un nombre por una etapa débil — sobre
 *      `eslint`, con ESTE extractor APAGADO, 15 de 96 aristas `declares-type`
 *      ya salían `inferred` siendo todas de la vía 1. **El discriminador
 *      exacto vive en el NODO** (`CodeGraphNode.declaredTypeProvenance`,
 *      consulta `declara-tipo.ts#declaredTypeSourceOf`), que además es el
 *      único que sirve para los dos casos SIN arista
 *      (`primitive`/`composite`).
 *   4. **EL TIPO ESCRITO GANA.** Si un sitio ya tiene hecho de la vía 1, este
 *      módulo NO emite para él — lo aplica `declara-tipo.ts#dropShadowedByWritten`,
 *      por id de nodo y por archivo, no por orden de los extractores.
 */
import type { DerivedNodeSets } from "../../code-grammar.js";
import type { AstNode, FileUnit } from "../../detect/types.js";
import { AMBIGUOUS_MAX_TARGETS } from "../stages.js";
import { declaredReceiverTypeName, fileLevelTypeNames } from "../symbols.js";
import { constructedTypeAt, declaredClassNamesFor, extractor as instanciacionExtractor } from "./instanciacion.js";
import { portadorCarrierId } from "./portador.js";
import type { DeclSiteForm, EdgeContext, EdgeExtractor, EdgeFacts, WrittenTypeForm } from "./types.js";

/** El `EdgeFacts.extractorId` de este módulo. Inmutable — `graph/build.ts` lo cruza contra `EDGE_EXTRACTORS` y `declara-tipo.ts` lo acepta como productor de la misma relación. */
export const PROPAGA_TIPO_ID = "propaga-tipo";

/**
 * El slot de sonda de `instanciacion.ts`, LEÍDO DE SU PROPIO EXTRACTOR en vez
 * de re-escribir la cadena: si ese módulo lo renombra, esto lo sigue solo, y
 * `warmup.ts#warmUpLanguage` ya lo dejó calentado para todos los lenguajes
 * con sonda de instanciación. Sin él, `constructedTypeAt` no sabe qué tipo de
 * nodo mirar y este extractor sólo puede contestar por literales.
 */
const SLOT_INSTANTIATION_SITE = instanciacionExtractor.slots[0] ?? "";

/* ════════════════════════════════════════════════════════════════════════
 * VOCABULARIO — todo lo de acá abajo son TIPOS DE NODO DE GRAMÁTICA o
 * PALABRAS RESERVADAS DEL LENGUAJE. Ni una entrada nombra un framework, una
 * librería o un ecosistema (regla de genericidad de la ola).
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * QUÉ CUENTA COMO UN SITIO DE BINDING. Reflejo de
 * `graph/symbols.ts#BINDING_DECLARATOR_TYPES` (`variable_declarator`,
 * `assignment`, `var_spec`, `const_spec`) ampliado con las formas que la
 * sonda de este frente observó y que aquélla no necesita
 * (`scratchpad-r2/probe-origen.mjs`, las 7 gramáticas del corpus con
 * asignación): `assignment_expression` (java/csharp/ts/js),
 * `assignment_statement` y `short_var_declaration` (go),
 * `operator_assignment` (ruby, el `||=` de la inicialización perezosa),
 * `augmented_assignment` (python) y `public_field_definition` (ts/js).
 *
 * **La lista es EXPLÍCITA a propósito y no "cualquier nodo con `left` y
 * `right`"**: medido en la sonda, el `binary` de Ruby y el
 * `binary_expression` de Java exponen EXACTAMENTE ese par de campos, así que
 * la regla laxa habría leído `a + b` como "`a` es del tipo de `b`" — una
 * arista falsa por cada suma del repo.
 */
const BINDING_NODE = /(^|_)assignment$|(^|_)assignment_(expression|statement)$|(^|_)declarator$|^(var_spec|const_spec|short_var_declaration)$|(^|_)field_definition$/;

/** Los campos con que la gramática nombra el LADO IZQUIERDO de un binding. Mismo par que `portador.ts#classifyCarrierForm` y `graph/symbols.ts#bindingNameNode` ya leen. */
const LHS_FIELDS = ["name", "left"] as const;
/** Los campos con que la gramática nombra el LADO DERECHO. Mismo par que `portador.ts` usa para detectar "el literal llena el valor de un declarador". */
const RHS_FIELDS = ["value", "right"] as const;

/** Palabra reservada del LENGUAJE — copia deliberada de `portador.ts#SELF_KEYWORDS` (archivo de otro dueño, no se importa un símbolo privado). */
const SELF_KEYWORDS: ReadonlySet<string> = new Set(["self", "this"]);
const RECEIVER_FIELDS = ["receiver", "object", "operand", "expression"];
const MEMBER_FIELDS = ["method", "field", "property", "attribute", "name"];

/** Ruby escribe `@foo` como una hoja de tipo `instance_variable`, sin split receptor/miembro. Vocabulario de GRAMÁTICA, exactamente el mismo `RUBY_IVAR_TYPE` que `invocacion-indirecta.ts` y cinco detectores ya llevan — y con la MISMA regla de nombre (sin el `@`), para converger en el mismo portador. */
const RUBY_IVAR_TYPE = "instance_variable";

/**
 * LITERALES DE COLECCIÓN — un valor construido SIN base nominal a la que
 * apuntar. Es el `"composite"` de `WrittenTypeForm`, el mismo que la vía 1 le
 * da a `Foo[]`/`map[string]Foo`/`{x: 1}`, y por eso `@cache = {}` sale
 * `composite` y no `primitive`: las dos vías tienen que contestar con el
 * MISMO vocabulario o `declaredTypeOf` mentiría según de dónde vino el hecho.
 * Tipos de nodo observados por sonda en las 7 gramáticas.
 */
const COLLECTION_LITERAL_NODE = /^(object|array|list|dictionary|set|tuple|hash|composite_literal|array_initializer|initializer_expression|collection_expression)$/;

/**
 * LITERALES ESCALARES — el `"primitive"` de `WrittenTypeForm`. Dos formas:
 * el sufijo `_literal` que java, csharp y go le ponen a TODOS los suyos
 * (`decimal_integer_literal`, `string_literal`, `real_literal`,
 * `int_literal`, `interpreted_string_literal`, …) y los nombres cortos de las
 * gramáticas que no usan sufijo (js/ts, python, ruby). Verificado por sonda,
 * no leído de una tabla.
 *
 * `composite_literal` de Go NO cae acá aunque termine en `_literal`: la
 * prueba de colección corre ANTES (ver `classifyOrigin`).
 */
const SCALAR_LITERAL_NODE = /(^|_)literal$|^(number|integer|float|complex|string|symbol|character|regex|template_string|concatenated_string|true|false|boolean)$/;

/**
 * LA AUSENCIA DE UN VALOR **NO ES UN TIPO**, y no se emite hecho por ella.
 * `null`/`nil`/`None`/`undefined` pueden asignarse a cualquier cosa: llamarlos
 * "primitivo" habría contestado que se sabe algo donde no se sabe nada, Y
 * habría roto la inicialización perezosa (`@x = nil` en el constructor,
 * `@x ||= Foo.new` en el accessor) convirtiéndola en un desacuerdo de forma
 * que descarta el sitio entero. Palabras reservadas del LENGUAJE, más el
 * `null_literal` que java/csharp le dan nodo propio.
 */
const NULL_ORIGIN_NODE = /^(null|nil|none|undefined|null_literal|nil_literal)$/;

/**
 * Envoltorios de UN SOLO VALOR que hay que atravesar para llegar al origen:
 * el `expression_list` con que Go envuelve los dos lados de una asignación,
 * el `equals_value_clause` de C#, un paréntesis. **No se enumeran por nombre**
 * — la prueba es de FORMA (exactamente un hijo nombrado) y corre DESPUÉS de
 * las de construcción y literal, así que un `[unSoloElemento]` o un
 * `f(unSoloArgumento)` ya se clasificaron (o se rechazaron) antes de llegar
 * acá. Ése es justo el caso que `portador.ts` declara como inseguro para SU
 * uso, donde el desenvolver corre PRIMERO.
 */
const MAX_UNWRAP_DEPTH = 3;

/* ════════════════════════════════════════════════════════════════════════
 * EXTRACCIÓN — pura, síncrona, sobre el AST vivo.
 * ════════════════════════════════════════════════════════════════════════ */

/** El sitio de construcción que la sonda descubrió para ESTE lenguaje. `null` = el lenguaje no tiene sonda de instanciación ⇒ este módulo sólo puede contestar por literales. */
export interface InstantiationSite {
  readonly ownerType: string;
  readonly targetField: string;
}

/**
 * Lee el `CarrierPath` del slot de instanciación EXACTAMENTE como lo lee
 * `instanciacion.ts#extract` (últimos dos pasos del camino: el penúltimo da
 * el tipo de nodo dueño, el último el campo que lleva el nombre del tipo).
 * Copiado en forma, no en efecto: si divergiera, las dos aristas hablarían de
 * sitios distintos.
 */
export function instantiationSiteFrom(ctx: EdgeContext): InstantiationSite | null {
  const [carrier] = ctx.carriers(SLOT_INSTANTIATION_SITE);
  if (!carrier || carrier.steps.length === 0) return null;
  const last = carrier.steps[carrier.steps.length - 1]!;
  if (last.field === null) return null;
  const ownerType = carrier.steps.length >= 2 ? carrier.steps[carrier.steps.length - 2]!.nodeType : carrier.ownerType;
  return { ownerType, targetField: last.field };
}

type Origin =
  | { readonly form: "nominal"; readonly name: string; readonly qualifier: readonly string[] }
  | { readonly form: "primitive" }
  | { readonly form: "composite" };

const PRIMITIVE_ORIGIN: Origin = { form: "primitive" };
const COMPOSITE_ORIGIN: Origin = { form: "composite" };

interface FieldNamedNode extends AstNode {
  fieldNameForChild(index: number): string | null;
}

/** Mismo idioma que `portador.ts`/`declara-tipo.ts`: `fieldNameForChild` no está en `AstNode`, se pide en la hoja. */
function fieldNameForChild(node: AstNode, index: number): string | null {
  const f = node as FieldNamedNode;
  return typeof f.fieldNameForChild === "function" ? f.fieldNameForChild(index) : null;
}

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c && c.isNamed) out.push(c);
  }
  return out;
}

function firstField(node: AstNode, fields: readonly string[]): AstNode | null {
  for (const f of fields) {
    const c = node.childForFieldName(f) as AstNode | null;
    if (c) return c;
  }
  return null;
}

/** `self.foo`/`this.foo` ⇒ `"foo"`. Duplicado deliberado de `portador.ts#memberOfSelf`, igual que `invocacion-indirecta.ts` y `declara-tipo.ts` ya lo duplican. */
function memberOfSelf(node: AstNode): string | null {
  const receiver = firstField(node, RECEIVER_FIELDS);
  if (!receiver || !SELF_KEYWORDS.has(receiver.text)) return null;
  const member = firstField(node, MEMBER_FIELDS);
  return member ? member.text : null;
}

/** Copia FIEL de `symbols.ts#splitQualifiedSegments` — ver la misma nota en `declara-tipo.ts`: si se toca una, se tocan las dos, o el sitio no cuelga de ningún nodo. */
function splitQualifiedSegments(text: string): readonly string[] {
  const parts = text.split(/::|\./).filter((s) => s.length > 0);
  return parts.length > 0 ? parts : [text];
}

/** El nombre declarado del lado izquierdo, y si pertenece a la clase envolvente. `null` = forma no modelada (tupla, índice, acceso encadenado `a.b.c`). */
function declaredNameOf(lhs: AstNode, depth = 0): { readonly name: string; readonly ownerIsEnclosingClass: boolean } | null {
  if (lhs.type === RUBY_IVAR_TYPE) {
    const bare = lhs.text.replace(/^@+/, "");
    return bare.length > 0 ? { name: bare, ownerIsEnclosingClass: true } : null;
  }
  const member = memberOfSelf(lhs);
  if (member !== null) return { name: member, ownerIsEnclosingClass: true };
  if (lhs.childCount === 0 && lhs.isNamed) return { name: lhs.text, ownerIsEnclosingClass: false };
  // Envoltorio de un solo valor (el `expression_list` de Go, un paréntesis).
  if (depth < MAX_UNWRAP_DEPTH) {
    const named = namedChildren(lhs);
    if (named.length === 1) return declaredNameOf(named[0]!, depth + 1);
  }
  return null;
}

/**
 * DE DÓNDE VIENE EL VALOR. El orden importa y está elegido:
 *   1. **construcción** — `constructedTypeAt`, la definición compartida con
 *      `instantiates`. Va primero porque el `composite_literal` de Go es a la
 *      vez el nodo de construcción de un struct Y el de un literal de
 *      slice/map, y sólo esa función sabe distinguirlos.
 *   2. **literal de colección** ⇒ `composite`.
 *   3. **literal escalar** ⇒ `primitive`.
 *   4. **la ausencia de valor** (`null`/`nil`/…) ⇒ NINGÚN hecho.
 *   5. sólo entonces, desenvolver un envoltorio de un solo valor.
 * Cualquier otra cosa ⇒ `null`: el `no sé` de la regla 2.
 */
function classifyOrigin(
  node: AstNode,
  language: string,
  site: InstantiationSite | null,
  declaredClasses: ReadonlySet<string> | null,
  depth = 0,
): Origin | null {
  if (!node.isNamed) return null;
  if (site) {
    const built = constructedTypeAt(node, language, site.ownerType, site.targetField, declaredClasses);
    if (built) return { form: "nominal", name: built.name, qualifier: built.qualifier };
    // Quien llama a `constructedTypeAt` NO debe descender dentro de un nodo
    // del tipo dueño que devolvió `null` (su propio docstring lo pide): eso
    // sería reinterpretar como construcción algo que esa función ya juzgó que
    // no lo es. Se sigue con las pruebas de literal, que son sobre ESTE nodo.
  }
  if (COLLECTION_LITERAL_NODE.test(node.type)) return COMPOSITE_ORIGIN;
  if (NULL_ORIGIN_NODE.test(node.type)) return null;
  if (SCALAR_LITERAL_NODE.test(node.type)) return PRIMITIVE_ORIGIN;
  if (site && node.type === site.ownerType) return null; // ver el comentario de arriba.
  if (depth >= MAX_UNWRAP_DEPTH) return null;
  const named = namedChildren(node);
  if (named.length !== 1) return null;
  return classifyOrigin(named[0]!, language, site, declaredClasses, depth + 1);
}

interface Frame {
  readonly name: string | null;
  readonly isFunctionLike: boolean;
  readonly isClassLike: boolean;
}

/** Un hecho crudo, antes de la reconciliación por sitio. */
interface RawFact {
  readonly siteKey: string;
  readonly fromPath: readonly string[];
  readonly siteForm: DeclSiteForm;
  readonly origin: Origin;
  readonly viaNodeType: string;
  readonly startLine: number;
  readonly endLine: number;
}

/**
 * Deriva los sitios de declaración TIPADOS POR SU ORIGEN de UN archivo. Pura
 * y síncrona sobre un árbol ya parseado — mismo momento y misma disciplina
 * que `extractSymbols`/`extractTypeDeclFacts`.
 *
 * La pila de scope es la MISMA que la de `declara-tipo.ts#extractTypeDeclFacts`
 * (que a su vez la alinea con `SymbolFacts.container`): reusa las dos piezas
 * de `symbols.ts` — el tipo receptor escrito como contenedor y el split de un
 * nombre compuesto — porque si el `fromPath` no coincide, el sitio no cuelga
 * de ningún nodo del grafo y la arista queda colgada.
 */
export function extractPropagatedTypeFacts(
  root: AstNode,
  sets: DerivedNodeSets,
  language: string,
  site: InstantiationSite | null,
  declaredClasses: ReadonlySet<string> | null,
): readonly EdgeFacts[] {
  const raw: RawFact[] = [];
  const scopeStack: Frame[] = [];
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

  const emitFor = (node: AstNode): void => {
    if (!BINDING_NODE.test(node.type)) return;

    let lhs = firstField(node, LHS_FIELDS);
    let rhs = firstField(node, RHS_FIELDS);
    if (!lhs || !rhs) {
      // C#: su `variable_declarator` no nombra NINGÚN campo (sonda: hijos
      // `identifier` + `equals_value_clause`, los dos sin nombre de campo).
      // Sólo para declaradores, y sólo con exactamente dos hijos nombrados —
      // no una regla general de "el primero es el nombre y el último el
      // valor", que habría leído cualquier nodo de dos hijos como binding.
      if (!/(^|_)declarator$/.test(node.type)) return;
      const named = namedChildren(node);
      if (named.length !== 2) return;
      lhs = named[0]!;
      rhs = named[1]!;
    }

    const decl = declaredNameOf(lhs);
    if (decl === null) return;
    const origin = classifyOrigin(rhs, language, site, declaredClasses);
    if (origin === null) return;

    const containerPath = decl.ownerIsEnclosingClass ? nearestClassPath() : containerPathOf();
    if (containerPath === null) return;
    const top = immediate();
    // NUNCA `parameter`: este módulo no emite para parámetros (ver el
    // docstring — seguir al llamador aporta +3 % medido y no se hace).
    const siteForm: DeclSiteForm = decl.ownerIsEnclosingClass || (top !== undefined && top.isClassLike) ? "field" : "local";
    const fromPath = [...containerPath, decl.name];
    raw.push({
      siteKey: fromPath.join("\u0000"),
      fromPath,
      siteForm,
      origin,
      viaNodeType: node.type,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    });
  };

  const visit = (node: AstNode): void => {
    if (!node.isNamed) return;

    const functionLike = sets.functionNodes.has(node.type);
    const classLike = !functionLike && sets.classNodes.has(node.type);
    if (!functionLike && !classLike) emitFor(node);

    let pushedCount = 0;
    if (functionLike || classLike) {
      // Mismo orden y misma guarda que `extractSymbols`/`extractTypeDeclFacts`.
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
      if (child) visit(child);
    }
    for (let i = 0; i < pushedCount; i++) scopeStack.pop();
  };

  visit(root);
  return reconcileBySite(raw);
}

/** Clave de identidad de un origen, para contar cuántos DISTINTOS tiene un sitio. */
function originKey(o: Origin): string {
  return o.form === "nominal" ? `nominal:${o.qualifier.join(".")}::${o.name}` : o.form;
}

/**
 * LA REGLA 1, aplicada por SITIO — el corazón de este módulo.
 *
 *   - un solo origen distinto ⇒ un hecho;
 *   - varios orígenes NOMINALES distintos ⇒ un hecho por cada uno, todos con
 *     el mismo `fromPath`, para que `collapseByFrom` los junte en UNA arista
 *     `ambiguous` + `alternatives` (y con el mismo tope
 *     `AMBIGUOUS_MAX_TARGETS`: más de 8 nombres no es información, es su
 *     ausencia);
 *   - orígenes que NO coinciden en la FORMA (una clase en una rama, un entero
 *     en la otra) ⇒ NINGÚN hecho. No hay vocabulario para "una clase o un
 *     entero" y fabricar uno sería inventar; el sitio queda en `"no-fact"`,
 *     que es el `no sé` explícito de la regla 2.
 *
 * `unanimousForm` sale de la forma, no del nombre: dos construcciones
 * distintas SÍ son "uno de estos dos"; una construcción y un literal, no.
 */
function reconcileBySite(raw: readonly RawFact[]): readonly EdgeFacts[] {
  const bySite = new Map<string, RawFact[]>();
  for (const f of raw) {
    const list = bySite.get(f.siteKey);
    if (list) list.push(f);
    else bySite.set(f.siteKey, [f]);
  }

  const out: EdgeFacts[] = [];
  for (const [, list] of bySite) {
    const forms = new Set(list.map((f) => f.origin.form));
    if (forms.size > 1) continue; // desacuerdo de FORMA ⇒ el sitio no produce hecho.
    const first = list[0]!;
    const base = {
      extractorId: PROPAGA_TIPO_ID,
      kind: "declares-type",
      fromPath: first.fromPath,
      // "La gramática no lo escribió" — CONTRATO-DECLARA-TIPO.md §5.3.
      provenance: "inferred",
      startLine: first.startLine,
      endLine: first.endLine,
    } as const;

    if (first.origin.form !== "nominal") {
      out.push({
        ...base,
        toName: "",
        toQualifier: [],
        via: `origin:${first.viaNodeType}`,
        decl: { siteForm: first.siteForm, typeForm: first.origin.form as WrittenTypeForm, union: false },
      });
      continue;
    }

    const seen = new Map<string, Origin & { form: "nominal" }>();
    for (const f of list) {
      if (f.origin.form !== "nominal") continue;
      const key = originKey(f.origin);
      if (!seen.has(key)) seen.set(key, f.origin);
    }
    if (seen.size === 0 || seen.size > AMBIGUOUS_MAX_TARGETS) continue;
    const union = seen.size > 1;
    for (const o of seen.values()) {
      out.push({
        ...base,
        toName: o.name,
        toQualifier: o.qualifier,
        via: `origin:${first.viaNodeType}`,
        decl: { siteForm: first.siteForm, typeForm: "nominal", union },
      });
    }
  }
  return out;
}

/* ════════════════════════════════════════════════════════════════════════
 * EL EXTRACTOR REGISTRADO
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * Fuente centinela por lenguaje. **Los siete lenguajes del corpus con
 * asignación**, incluidos los DOS que la vía 1 declara en `absentIn` por una
 * propiedad del lenguaje (ruby, javascript): la propagación es justamente la
 * vía que sí los cubre. Rust y Elixir NO están — no se probaron y no se
 * afirma nada sobre ellos.
 */
const SENTINEL: Readonly<Record<string, string>> = {
  java: "class F { void m() { var s = new SentinelType(); } }",
  csharp: "class F { void M() { var s = new SentinelType(); } }",
  typescript: "class F { m() { const s = new SentinelType(); } }",
  tsx: "class F { m() { const s = new SentinelType(); } }",
  vue: "class F { m() { const s = new SentinelType(); } }",
  javascript: "class F { m() { const s = new SentinelType(); } }",
  go: "package p\nfunc m() {\n\ts := SentinelType{}\n}\n",
  python: "class SentinelType:\n    pass\n\nclass F:\n    def m(self):\n        s = SentinelType()\n",
  ruby: "class F\n  def m\n    s = SentinelType.new\n  end\nend\n",
};

export const extractor: EdgeExtractor<"declares-type"> = {
  // LITERAL a propósito, y no `PROPAGA_TIPO_ID`: `registries.test.ts#ID_RE`
  // busca la CADENA `id: "..."` EN DISCO (nunca importa el módulo), así que
  // un extractor que declara su id por constante queda "sin id reconocible" y
  // rompe el espejo disco↔registro. El test de este módulo verifica que las
  // dos formas coincidan.
  id: "propaga-tipo",
  kind: "declares-type",
  title: "Tipo propagado desde el origen de una declaración",
  // Ninguna `Capability` de `detect/capabilities.ts` describe "este lenguaje
  // asigna valores a bindings" (es universal); el gate real es que la sonda
  // de instanciación exista para el lenguaje, y eso se mide solo (cero hechos
  // nominales) — mismo criterio que `instanciacion.ts` documenta para el suyo.
  needs: [],
  // EL MISMO SLOT que `instanciacion`, a propósito: las dos preguntas se
  // contestan sobre el MISMO sitio sintáctico. `warmup.ts` ya lo calienta al
  // procesar ese extractor, así que este no agrega una línea allá.
  slots: [SLOT_INSTANTIATION_SITE],
  sentinel: SENTINEL,
  expect: { from: "F.m.s", to: "SentinelType" },
  optional: true,

  extract(file: FileUnit, ctx: EdgeContext): readonly EdgeFacts[] {
    return extractPropagatedTypeFacts(
      file.root,
      file.sets,
      file.language,
      instantiationSiteFrom(ctx),
      declaredClassNamesFor(file),
    );
  },
};

/**
 * EL ID DEL SITIO — idéntico, por construcción, a
 * `declara-tipo.ts#declaraTipoNodeId` y a `portador.ts#portadorCarrierId` con
 * ordinal 0. No es casualidad: un campo `self.conn` al que
 * `invocacion-indirecta.ts` ya le creó un portador, el mismo campo con tipo
 * escrito y el mismo campo tipado por su origen son EL MISMO NODO. El test de
 * este módulo lo verifica contra los dos constructores reales en vez de
 * confiar en la forma del string.
 */
export function propagaTipoNodeId(file: string, containerPath: readonly string[], declName: string): string {
  return portadorCarrierId(file, containerPath, declName, 0);
}
