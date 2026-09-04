/**
 * `invokes-indirect` — FORMA 3(a) de CONTRATO-F9.md §3.3: "un sitio de
 * llamada cuyo callee es miembro de `self`/`this`" Y esa cascada de 9 etapas
 * nunca lo resuelve como un método declarado — exactamente el caso que
 * `strategy.ts`/las hipótesis existentes no podían ver porque
 * `HypothesisContext` no exponía otros hallazgos NI el grafo alrededor
 * (CONTRATO-F9.md, "el límite que esta ola rompe").
 *
 * ALCANCE, DECLARADO CORTO A PROPÓSITO — de los tres casos que
 * CONTRATO-F9.md §3.3 punto 3 agrupa bajo "callee que no es un nombre",
 * SÓLO éste (a) se implementa:
 *   (a) miembro de `self`/`this` — ACÁ.
 *   (b) expresión de índice/subíndice (`handlers[key]()`) — FUERA. Medido
 *       antes de intentar: `references.ts#computeIsCallee`/`classifyRole`
 *       sólo visita hojas `IDENTIFIER_LEAF_TYPES`; el identificador base de
 *       un subíndice (`handlers` en `handlers[key]()`) llena el campo
 *       `object` de la expresión de índice, que NO está en
 *       `CALLEE_NAME_FIELDS` ni en `MEMBER_FIELDS`, así que ni siquiera
 *       aparece como candidato con `isCallee`. Cosecharlo exige un extractor
 *       AST nuevo (no una derivación post-grafo como ésta) — fuera de esta
 *       entrega, declarado, no escondido.
 *   (c) nombre desnudo rechazado por `local-shadow` por ser PARÁMETRO —
 *       FUERA. `ReferenceFacts.shadowedLocally` no distingue "es un
 *       parámetro" de "es cualquier otra variable local" — afirmarlo sin esa
 *       distinción sería inventar precisión que la Forma 3(c) exige
 *       explícitamente y este módulo no tiene.
 *
 * MECANISMO — post-grafo, sin AST, mismo mecanismo que `satisfies-derive.ts`
 * y `carries-derive.ts`: NO se re-implementa la cascada de `resolve.ts`
 * (F5, ola distinta) ni se depende de que exista todavía "cosecha de
 * rechazos" persistida — en cambio, se usa lo que el propio grafo YA
 * garantiza: `memberSignatures` sobre las aristas `contains` de la clase
 * envolvente dice, con certeza, si existe un método DECLARADO con ese
 * nombre. Si existe, la cascada normal ya lo habría resuelto como `calls` —
 * este módulo NUNCA duplica esa arista, sólo cubre el caso que la cascada
 * deja sin arista. Esto obtiene el mismo resultado observable que "cosechar
 * los rechazos de la cascada" (CONTRATO-F9.md §3.3) sin tocar `resolve.ts`,
 * archivo compartido de otra ola.
 *
 * El portador es un campo de la clase envolvente (`self.foo` ⇒ el campo
 * `foo` de ESA clase) — mismo id que `portador.ts#portadorCarrierId`
 * produciría para un campo nombrado `foo` en esa clase, a propósito: un
 * `self.foo = () => {...}` (Forma 2, `portador.ts`) y un `self.foo()` en
 * OTRO método (Forma 3a, acá) tienen que converger en el MISMO nodo
 * `carrier:` para que el fan-in de Observer (CONTRATO-F9.md §3.5) los vea
 * juntos. Si `portador.ts` no creó ese nodo (el campo se pobló de otra
 * forma: un parámetro del constructor, un valor de retorno, forma 1 con
 * nombre) este módulo lo crea él mismo — nunca deja una arista colgando.
 *
 * HERENCIA — HALLAZGO MEDIDO Y CORREGIDO, no hipotético: la primera versión
 * de este módulo, corrida sobre click real, marcó `self.fail(...)` (en
 * `URL.convert`, `URL(click.ParamType)`) e `self.list_commands(ctx)` (en
 * `AliasedGroup.get_command`, `AliasedGroup(click.Group)`) como
 * `invokes-indirect` — LOS DOS FALSOS: `fail`/`list_commands` están
 * declarados en la clase BASE, no en la derivada, y `memberSignatures` sólo
 * ve miembros DIRECTOS (misma limitación que `satisfies-derive.ts` declara
 * para el mismo motivo). Un método heredado invocado por `self`/`this` es el
 * caso MÁS COMÚN de callee-miembro en código orientado a objetos — dejarlo
 * sin resolver habría hecho que la mayoría de las aristas de esta forma
 * fueran ruido, no señal. `inheritanceEdges` (`extends`/`implements`/
 * `mixes-in`, ya resueltas por la cascada ANTES de este punto en
 * `build.ts`) deja subir la cadena de superclases — acotado a
 * `MAX_INHERITANCE_DEPTH` saltos con un `visited` para no colgarse en un
 * ciclo (un grafo con una aresta `extends` mal resuelta podría formar uno).
 *
 * ── GENERALIZACIÓN DEL RECEPTOR — por qué `SELF_KEYWORDS` era el síntoma,
 *    no la regla, y qué la reemplaza ─────────────────────────────────────
 *
 * La construcción real de Forma 3(a) es "un sitio de llamada cuyo receptor
 * es EL MISMO valor que el método envolvente recibió como destinatario de su
 * propio despacho" — no "el receptor se llama `self` o `this`". Esas dos
 * palabras son la forma que esa construcción toma en las gramáticas que le
 * dan al despacho un binding IMPLÍCITO, sin declaración propia en el AST
 * (Python por convención universal — `self` nunca es palabra reservada del
 * lenguaje, es el nombre que PEP8 impone al primer parámetro de un método de
 * instancia —, Ruby/JS/TS/Java vía un nodo de gramática dedicado, C# vía
 * `this_expression`; confirmado por sonda directa sobre las 6 gramáticas con
 * casos de prueba). Go rompe esa premisa por completo: su despacho NO es
 * implícito, es un PARÁMETRO EXPLÍCITO con nombre arbitrario — el campo
 * `receiver` de `method_declaration` (`func (s *Server) Handle()`,
 * `func (l *Logger) Log()`), confirmado por sonda y ya documentado, para
 * OTRO propósito, en `graph/symbols.ts` ("a method_declaration's receiver
 * type sits in a receiver FIELD"). `SELF_KEYWORDS.has(qualifier)` nunca
 * puede alcanzar ese caso, sin importar cuánta invocación indirecta real
 * tenga el repo — no porque Go no tenga la construcción, sino porque el
 * mecanismo buscaba una palabra fija y Go no la usa.
 *
 * LA GENERALIZACIÓN, medida y acotada a evidencia estructural — nunca a
 * `ctx.languageOf(...)` —: el receptor válido de un método no es SIEMPRE una
 * de dos palabras fijas; es, según lo que la gramática de ESE método
 * declara, (1) el nombre que el propio método le dio a su receptor EXPLÍCITO
 * — cuando el nodo function-like expone un campo `receiver` DISTINTO de
 * `parameters` (mismo estándar de traducción de vocabulario de gramática que
 * `RECEIVER_FIELDS`/`MEMBER_FIELDS`/`LOOP_VAR_FIELDS` de este mismo archivo
 * ya usan para "el receptor de un acceso a miembro" — acá es "el receptor de
 * UN MÉTODO", un campo distinto, mismo principio) —, sin ningún vocabulario
 * de nombre: el texto declarado se compara literal contra el qualifier del
 * sitio de llamada, sea `s`, `r`, `recv`, `l`, lo que sea — o (2), cuando la
 * gramática no separa un campo propio para eso (el caso ya cubierto arriba),
 * la palabra fija que ESA gramática reserva para el binding implícito. (1) es
 * enteramente NUEVO en esta ola y de vocabulario CERO: no hay ninguna lista
 * de nombres de receptor Go adivinados por convención (`s`/`recv`/…) en
 * ningún lado de este archivo — si mañana otro lenguaje soportado expone un
 * campo `receiver` propio en sus métodos, esto lo cubre solo, sin tocar una
 * línea, exactamente el criterio que esta ola pide.
 *
 * POR QUÉ (1) NO PUEDE REUTILIZAR EL `classPath` DE FORMA 3(a) — causa
 * estructural, no una decisión de conveniencia: la variante existente deriva
 * la clase envolvente de `ref.scope` (recortando el último segmento) y
 * valida un nodo símbolo con `family === "class-like"`. Para Go, NINGUNA de
 * las dos cosas existe — medido, no asumido: `graph/code-grammar.ts` (líneas
 * ~113-125) documenta que `type_spec`/`type_declaration` de Go no expone
 * campo `body`, así que `classNodes` deriva VACÍO para Go siempre;
 * `graph/symbols.ts` documenta, para el mismo motivo, que un método Go NUNCA
 * queda anidado bajo su struct en el AST (`container: []`, sonda propia con
 * cadena de ancestros VACÍA, el único de 6 lenguajes donde eso pasa) — y este
 * módulo lo reconfirmó por sonda directa (`extractSymbols`/`extractReferences`
 * sobre `func (s *Server) Handle() { s.log() }`: el símbolo `Handle` sale con
 * `container: []`, family `"function-like"`; la referencia a `log` sale con
 * `scope: ["Handle"]`, SIN `"Server"` en ningún lado). Con `ref.scope` plano
 * así, `classPath = ref.scope.slice(0, -1)` da SIEMPRE `[]` para cualquier
 * llamada Go — la compuerta `if (classPath.length === 0) continue` de Forma
 * 3(a) cortaría TODO caso Go pase lo que pase con el qualifier, aunque el
 * receptor se identificara perfecto. Por eso (1) deriva su `classPath`
 * DIRECTO del propio campo `receiver` del AST (el tipo declarado del
 * receptor, no la ruta léxica) — mismo motivo, mismo patrón, que ya obligó a
 * Forma 4 a ser AST-nativa en vez de post-grafo puro ("Forma 4 NO puede ser
 * AST-free", más abajo). Por la MISMA causa, `memberNamesOf` (que camina
 * `contains`, inexistente entre un struct Go y sus métodos) tampoco sirve
 * para "¿ya está declarado?" acá — (1) arma su propio conjunto, agregando el
 * nombre de CADA método cuyo receptor declara ese mismo tipo, visto en la
 * MISMA pasada de extracción — misma intención que `memberNamesOf`
 * (no duplicar lo que ya es un método real), fuente de verdad distinta
 * porque la compartida no le alcanza a Go.
 *
 * BRECHA DECLARADA, medida, no escondida: el "conjunto de miembros
 * declarados" de (1) NO sube por embedding de campo (`type Server struct {
 * *Logger }`) — esa promoción es, en esencia, la MISMA causa raíz de arriba
 * (`classNodes` vacío bloquea también a `herencia.ts` para Go, RAICES.md
 * PENDIENTES ítem 1, frente de otro agente esta ola) y este módulo no la
 * reimplementa. Consecuencia medida y acotada: un método PROMOVIDO por
 * embedding e invocado por su receptor (`s.Log()` donde `Log` vive en
 * `*Logger`, embebido en `Server`) sale como `invokes-indirect` en vez de
 * quedar excluido como el caso "HERENCIA" de arriba ya excluye para
 * self/this — mismo tipo de falso positivo, causa compartida con un frente
 * que no es éste, no remendada con vocabulario de nombres.
 *
 * COLISIÓN DE `functionScope` — HALLAZGO MEDIDO Y CORREGIDO sobre hugo real,
 * no hipotético: `container: []` (arriba) implica que DOS métodos Go
 * DISTINTOS con el MISMO nombre pero receptores de TIPOS distintos
 * (`resources/resource.go`: `func (fd *ResourceSourceDescriptor) init(r
 * *Spec)` y `func (r *resourceHash) init(...)`) comparten la MISMA clave de
 * scope aplanada `["init"]`. La primera versión de este módulo, corrida
 * sobre hugo real, le atribuía a `r.MediaTypes()` — donde, DENTRO de
 * `ResourceSourceDescriptor.init`, `r` es un PARÁMETRO ordinario de tipo
 * `*Spec`, nunca un receptor — el receptor de la OTRA función homónima, sólo
 * porque ambas casualmente usan la letra `r` para algo: 27 aristas falsas de
 * 321 (hugo bajó a 294 tras el fix). El mapa `receiverByScopeKey`
 * (`deriveInvokesIndirectEdges`, abajo) marca una clave AMBIGUA (`null`) en
 * cuanto ve una segunda declaración con receptor/tipo distinto en la misma
 * clave, en vez de quedarse con la última vista — mismo principio que
 * `resolve.ts#narrowedOrReject` ("ambiguo ⇒ rechazar, nunca adivinar"),
 * aplicado acá sin importar ese archivo.
 */
import type { DerivedNodeSets } from "../../code-grammar.js";
import type { AstNode } from "../../detect/types.js";
import type { ReferenceFacts } from "../references.js";
import { declaredReceiverTypeName, fileLevelTypeNames } from "../symbols.js";
import { memberSignatures, symbolNodeId, type CodeGraphEdge, type CodeGraphNode, type GraphIndex } from "../types.js";
import { portadorCarrierId } from "./portador.js";

const SELF_KEYWORDS = new Set(["self", "this"]);
const INHERITANCE_KINDS = new Set(["extends", "implements", "mixes-in"]);
/** Tope de saltos al subir la cadena de superclases — ver la nota "HERENCIA" del docstring del módulo. */
const MAX_INHERITANCE_DEPTH = 12;
/**
 * Campo de gramática que declara el receptor EXPLÍCITO de un método, DISTINTO
 * de `parameters` — ver "GENERALIZACIÓN DEL RECEPTOR" en el docstring del
 * módulo. Sólo Go lo expone hoy (`method_declaration.receiver`); un nombre de
 * campo, no un nombre de lenguaje, así que cualquier gramática futura que
 * separe su receptor de la misma forma queda cubierta sin tocar esta línea.
 */
const RECEIVER_DECL_FIELD = "receiver";
/** Separador de junta para claves de scope — mismo estándar que `references.ts` usa `\0` para su propia clave de dedup (nunca aparece en un identificador real de ninguna de las 9 gramáticas soportadas). */
const SCOPE_KEY_SEP = "\0";

/**
 * ── FORMA 4, CONTRATO-F9.md §3.3 punto 4 — "recorrido de colección con
 *    invocación del elemento": Ola 11, registro de pendientes §C1. ──────────
 *
 * `deriveInvokesIndirectEdges` (Forma 3a, arriba) es AST-free: corre sobre
 * `ReferenceFacts` ya extraídas, sin volver a mirar el árbol. La Forma 4 NO
 * puede serlo — "nodo de iteración" es una noción de GRAMÁTICA (qué campos
 * resuelve un `for_in_statement`/`enhanced_for_statement`/`do_block`, cuál es
 * su `body`) que `ReferenceFacts` no lleva (ni `scope` ni `role` distinguen
 * "esta declaración vino del encabezado de un bucle" de cualquier otro
 * binding). `extractIterationCallFacts` de abajo es, por eso, el mismo tipo
 * de extractor AST que `portador.ts#extractCarrierFacts` — puro, sobre el
 * árbol YA parseado, en el mismo momento que `extractSymbols`/
 * `extractReferences`/`extractCarrierFacts` — y `deriveInvokesIndirectEdges`
 * sigue post-grafo: sólo CORRELACIONA los `IterationLoopFact` resultantes
 * contra las `ReferenceFacts` ya existentes (por línea+scope), sin volver a
 * tocar el árbol.
 *
 * ESTRUCTURAL, NO VOCABULARIO — mismo criterio que `portador.ts`: el nodo de
 * iteración se reconoce por NOMBRE DE TIPO DE GRAMÁTICA + forma de campos
 * (`LOOP_WORD` — la MISMA vocal `while|until|for|do` que `code-grammar.ts`
 * ya usa para derivar `loopLike`, duplicada acá porque ese módulo no expone
 * la categoría suelta — más `hasField(body)`), nunca por el nombre que el
 * programador le dio a la variable o a la colección. `LOOP_VAR_FIELDS`/
 * `LOOP_COLLECTION_FIELDS` son nombres de CAMPO de la gramática
 * (`left`/`right`/`name`/`value`), mismo estándar que `RECEIVER_FIELDS`/
 * `MEMBER_FIELDS` de `portador.ts`.
 *
 * TRES FORMAS DE NODO DE ITERACIÓN, verificadas por sonda directa
 * (`tree-sitter-{javascript,python,ruby,go,java,c_sharp}.wasm` — ver el
 * historial de este archivo para el script de sonda) sobre las 6 gramaticas
 * con casos de prueba de patrones:
 *   (a) DIRECTA — JS/TS `for_in_statement`, Python `for_statement`, Java
 *       `enhanced_for_statement`, C# `for_each_statement`: el propio nodo
 *       resuelve la variable (`left`/`name`) Y la colección (`right`/
 *       `value`) como campos DIRECTOS.
 *   (b) ANIDADA UN NIVEL — Go: `for_statement` envuelve un `range_clause` sin
 *       nombre de campo propio (confirmado por sonda: `fieldNameForChild`
 *       devuelve `null` para ese hijo) que SÍ resuelve `left`/`right`. Se
 *       prueba el nodo, y si no resuelve nada, cada hijo DIRECTO — sin
 *       nombrar "range_clause" en ningún lado, así que un C-style `for` (cuyo
 *       `for_clause` resuelve `initializer`/`condition`/`update`, no
 *       `left`/`right`) queda correctamente afuera sin necesitar excluirlo
 *       por nombre.
 *   (c) LLAMADA CON BLOQUE — Ruby: no hay nodo de bucle dedicado para
 *       `.each do |o| … end`; el "nodo de iteración" que SÍ matchea
 *       `LOOP_WORD`+`body` es el propio `do_block` (`do` matchea, y
 *       `do_block` resuelve un `body` directo — confirmado por sonda). Su
 *       variable es el primer hijo nombrado de su campo `parameters`
 *       (`block_parameters`, posicional, mismo criterio que
 *       `references.ts#PARAM_LIST_TYPES`); su colección es el campo receptor
 *       (`RECEIVER_FIELDS`) del nodo PADRE (el `call` de `.each`) — la única
 *       de las tres formas que necesita mirar hacia afuera del nodo de
 *       bucle, así que el walk lleva `parent` mientras desciende, nunca
 *       `.parent` (mismo principio que todo el resto de este módulo/
 *       `portador.ts`/`references.ts`).
 *
 * LA VARIABLE, cuando el campo resuelto es compuesto (Go: `left` resuelve un
 * `expression_list`, `_, o := range …`): se toma el ÚLTIMO hijo nombrado —
 * convención de la propia gramática de Go para `range` (índice, valor, en
 * ESE orden), no un nombre de variable. Si el campo resuelve una hoja sin
 * hijos, es la variable directamente.
 *
 * LA COLECCIÓN: si el nodo resuelto es `self.foo`/`this.foo` (mismo
 * `memberOfSelf` que `portador.ts`, duplicado acá) ⇒ portador `field` de la
 * clase envolvente — MISMO id que produciría un `self.foo = [...]` de
 * `portador.ts` o un `self.foo()` de la Forma 3a de este archivo, a
 * propósito (fan-in de Observer). Ruby `@foo` (`instance_variable`, hoja sin
 * split receptor/miembro — `references.ts` ni siquiera lo lista en
 * `IDENTIFIER_LEAF_TYPES`, brecha ya declarada ahí) se trata iguial: por TIPO
 * de nodo (`"instance_variable"`, vocabulario de GRAMÁTICA — mismo estándar
 * que `qualifierIsBareConstant`'s `receiver.type === "constant"` en
 * `references.ts` — nunca un nombre), no por receptor+miembro, así que
 * converge en el MISMO portador `field` con nombre sin el `@`. Si es una hoja
 * bare (variable local/parámetro) ⇒ portador `local`, en el scope de la
 * función envolvente. Cualquier otra forma (una llamada — `self.getItems()`,
 * un acceso anidado `a.b.c`) ⇒ `null`, brecha declarada: exige análisis que
 * este extractor, sin resolución, no tiene.
 *
 * BRECHA DECLARADA, medida y no escondida: Go no tiene `self`/`this` (mismo
 * hueco que la Forma 3a ya declara para SU propio qualifier) — una colección
 * `w.observers` en Go es un MEMBER access sobre un receptor arbitrario
 * (`w`), nunca matchea `memberOfSelf`, y como no es tampoco una hoja bare cae
 * al `null` genérico. El recorrido de colección más común en Go idiomático
 * (recorrer un campo del receptor) queda así sin Forma 4 — declarado, no
 * remendado con un vocabulario de nombres de receptor.
 *
 * LA CORRELACIÓN — post-grafo, sin AST — usa el rango de línea del `body`
 * del nodo de iteración (`bodyStartLine`/`bodyEndLine`) MÁS el `scope` de
 * `ReferenceFacts` (igual que `containerPath`, ninguno de los dos cambia
 * dentro del cuerpo de un bucle: ni `for_in_statement`/`for_statement`/
 * `do_block` empujan su propio segmento de scope en `extractReferences` —
 * sólo los nodos function-like/class-like lo hacen) para aceptar sólo
 * `role === "receiver-member"` con `qualifier === loopVarName` e
 * `isCallee === true` DENTRO de ese rango — el mismo criterio de forma que
 * la Forma 3a ya usa para `self`/`this`, generalizado al nombre de la
 * variable de bucle en vez de a la palabra reservada.
 */
const LOOP_WORD = /(^|_)(while|until|for|do)(_|$)/;
const LOOP_VAR_FIELDS = ["left", "name"];
const LOOP_COLLECTION_FIELDS = ["right", "value"];
const RECEIVER_FIELDS = ["receiver", "object", "operand", "expression"];
const MEMBER_FIELDS = ["method", "field", "property", "attribute", "name"];
const RUBY_IVAR_TYPE = "instance_variable";

/**
 * `IterationLoopFact.collection === null` ⇒ colección no modelada (brecha
 * declarada arriba) — el hecho existe (hubo un nodo de iteración con
 * variable identificada) pero no se puede anclar a un portador.
 */
export interface IterationLoopFact {
  /** Scope de la función/método que ENCIERRA el bucle — mismo formato que `ReferenceFacts.scope`; usado como el "desde" de la arista. */
  readonly containerPath: readonly string[];
  /** Camino a la clase envolvente más cercana, `null` si no hay ninguna (función suelta). Sólo se usa cuando `collection.ownerIsEnclosingClass`. */
  readonly classPath: readonly string[] | null;
  readonly loopVarName: string;
  readonly bodyStartLine: number;
  readonly bodyEndLine: number;
  readonly collection: { readonly ownerIsEnclosingClass: boolean; readonly name: string } | null;
}

function hasField(node: AstNode, field: string): boolean {
  return node.childForFieldName(field) !== null;
}

function firstField(node: AstNode, fields: readonly string[]): AstNode | null {
  for (const f of fields) {
    const c = node.childForFieldName(f) as AstNode | null;
    if (c) return c;
  }
  return null;
}

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed) out.push(c);
  }
  return out;
}

/** `self.foo`/`this.foo` — ver el docstring del módulo, "LA COLECCIÓN". Duplicado de `portador.ts#memberOfSelf` (archivo compartido, no se importa un símbolo privado de otro dueño). */
function memberOfSelf(node: AstNode): string | null {
  const receiver = firstField(node, RECEIVER_FIELDS);
  if (!receiver || !SELF_KEYWORDS.has(receiver.text)) return null;
  const member = firstField(node, MEMBER_FIELDS);
  return member ? member.text : null;
}

/** La variable ligada por el nodo de iteración — hoja directa, o el ÚLTIMO hijo nombrado si el campo resuelve un compuesto (Go `expression_list`, ver el docstring del módulo). */
function loopVarNameOf(varNode: AstNode): string | null {
  if (varNode.childCount === 0) return varNode.text;
  const kids = namedChildren(varNode);
  return kids.length > 0 ? kids[kids.length - 1]!.text : null;
}

/** La colección — ver el docstring del módulo, "LA COLECCIÓN". */
function collectionOf(node: AstNode): IterationLoopFact["collection"] {
  if (node.type === RUBY_IVAR_TYPE) return { ownerIsEnclosingClass: true, name: node.text.replace(/^@/, "") };
  const selfMember = memberOfSelf(node);
  if (selfMember !== null) return { ownerIsEnclosingClass: true, name: selfMember };
  if (node.childCount === 0 && node.isNamed) return { ownerIsEnclosingClass: false, name: node.text };
  return null; // llamada / acceso anidado — brecha declarada, no escondida.
}

/** Var+colección de las formas (a)/(b) del docstring: el propio nodo, o (Go) uno de sus hijos DIRECTOS, resuelve AMBOS campos. */
function directLoopShape(node: AstNode): { readonly varNode: AstNode; readonly collectionNode: AstNode } | null {
  const tryHolder = (holder: AstNode): { readonly varNode: AstNode; readonly collectionNode: AstNode } | null => {
    const varNode = firstField(holder, LOOP_VAR_FIELDS);
    const collectionNode = firstField(holder, LOOP_COLLECTION_FIELDS);
    return varNode && collectionNode ? { varNode, collectionNode } : null;
  };
  const direct = tryHolder(node);
  if (direct) return direct;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i) as AstNode | null;
    if (!child) continue;
    const nested = tryHolder(child);
    if (nested) return nested;
  }
  return null;
}

/** Forma (c) del docstring: `.each do |o| … end` — variable en el propio `parameters`, colección en el `RECEIVER_FIELDS` del PADRE. */
function blockCallLoopShape(node: AstNode, parent: AstNode | null): { readonly varNode: AstNode; readonly collectionNode: AstNode } | null {
  if (!parent) return null;
  const params = node.childForFieldName("parameters") as AstNode | null;
  if (!params) return null;
  const varNode = namedChildren(params)[0];
  if (!varNode) return null;
  const collectionNode = firstField(parent, RECEIVER_FIELDS);
  return collectionNode ? { varNode, collectionNode } : null;
}

interface ScopeFrame {
  readonly name: string | null;
  readonly isClassLike: boolean;
}

/**
 * Deriva los `IterationLoopFact` de UN archivo — pura, sobre un árbol YA
 * parseado, mismo momento que `extractSymbols`/`extractReferences`/
 * `extractCarrierFacts` (ver el docstring del módulo).
 */
export function extractIterationCallFacts(root: AstNode, sets: DerivedNodeSets): readonly IterationLoopFact[] {
  const out: IterationLoopFact[] = [];
  const scopeStack: ScopeFrame[] = [];

  const containerPathOf = (): readonly string[] => scopeStack.filter((f) => f.name !== null).map((f) => f.name as string);
  const nearestClassPath = (): readonly string[] | null => {
    for (let i = scopeStack.length - 1; i >= 0; i--) {
      if (scopeStack[i]!.isClassLike) return scopeStack.slice(0, i + 1).filter((f) => f.name !== null).map((f) => f.name as string);
    }
    return null;
  };

  const visit = (node: AstNode, parent: AstNode | null): void => {
    if (!node.isNamed) return;

    const functionLike = sets.functionNodes.has(node.type);
    const classLike = !functionLike && sets.classNodes.has(node.type);

    if (LOOP_WORD.test(node.type) && hasField(node, "body")) {
      const shape = directLoopShape(node) ?? blockCallLoopShape(node, parent);
      if (shape) {
        const loopVarName = loopVarNameOf(shape.varNode);
        const bodyNode = node.childForFieldName("body") as AstNode;
        if (loopVarName) {
          out.push({
            containerPath: containerPathOf(),
            classPath: nearestClassPath(),
            loopVarName,
            bodyStartLine: bodyNode.startPosition.row + 1,
            bodyEndLine: bodyNode.endPosition.row + 1,
            collection: collectionOf(shape.collectionNode),
          });
        }
      }
    }

    const nameNode = (functionLike || classLike ? (node.childForFieldName("name") as AstNode | null) : null);
    if (functionLike || classLike) scopeStack.push({ name: nameNode ? nameNode.text : null, isClassLike: classLike });

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i) as AstNode | null;
      if (child) visit(child, node);
    }

    if (functionLike || classLike) scopeStack.pop();
  };

  visit(root, null);
  return out;
}

/**
 * ── GENERALIZACIÓN DEL RECEPTOR (Go) — ver la sección homónima del
 *    docstring del módulo para la justificación completa y por qué esto NO
 *    reutiliza el `classPath`/`memberNamesOf` de Forma 3(a). ──────────────
 *
 * Un método cuyo nodo function-like expone un campo `receiver` PROPIO
 * (distinto de `parameters` — mismo campo que `graph/symbols.ts` ya lee para
 * OTRO propósito, "receiver type sits in a receiver FIELD") declara, con
 * eso, el NOMBRE y el TIPO de su destinatario de despacho de forma
 * completamente explícita — nada que adivinar, nada que convenir por
 * lenguaje. `ReceiverFact` es ese hecho, extraído en la MISMA pasada AST que
 * `extractIterationCallFacts`/`extractCarrierFacts`/`extractSymbols`: puro,
 * sin resolución cruzada, sin AST re-parseado.
 */
export interface ReceiverFact {
  /** Scope de la función/método QUE DECLARA el receptor — mismo formato que `ReferenceFacts.scope`; una llamada dentro de su propio cuerpo comparte este mismo camino, por construcción (misma pila de scope que `extractReferences` empuja). */
  readonly functionScope: readonly string[];
  /** Nombre declarado del receptor, TAL CUAL lo escribió el programador (`s`, `r`, `recv`, `l`, …) — nunca una convención de nombre adivinada; cero vocabulario. */
  readonly receiverName: string;
  /** Nombre del tipo receptor, leído del propio campo `type` del parámetro receptor — despojado de modificadores envolventes (Go `pointer_type` sobre `type_identifier`) por POSICIÓN estructural (la hoja más a la derecha del subárbol), nunca por el nombre de un tipo de nodo de un lenguaje particular. */
  readonly receiverTypeName: string;
}

/**
 * La hoja MÁS A LA DERECHA del subárbol — descarta modificadores envolventes
 * de un solo hijo nombrado (Go `pointer_type` sobre `type_identifier`) por
 * FORMA, nunca por el nombre del tipo de nodo. Mismo principio posicional
 * que `loopVarNameOf` ya usa arriba para el compuesto `expression_list` de
 * Go (último hijo nombrado = la convención de la propia gramática, no un
 * nombre de variable).
 */
function rightmostLeafText(node: AstNode): string | null {
  let current = node;
  for (;;) {
    const kids = namedChildren(current);
    if (kids.length === 0) return current.text || null;
    current = kids[kids.length - 1]!;
  }
}

/**
 * Deriva los `ReceiverFact` de UN archivo — pura, sobre un árbol YA
 * parseado, mismo momento que `extractIterationCallFacts`. Visita TODO nodo
 * function-like; el campo `receiver` es estructuralmente OPCIONAL (la
 * inmensa mayoría de funciones, en cualquier lenguaje soportado hoy salvo
 * los métodos Go, no lo expone) — este extractor simplemente no aporta nada
 * para ésas, nunca un error ni una rama por lenguaje.
 */
export function extractReceiverFacts(root: AstNode, sets: DerivedNodeSets): readonly ReceiverFact[] {
  const out: ReceiverFact[] = [];
  const scopeStack: ScopeFrame[] = [];
  // P4 (Ola P) — EL AGRUPAMIENTO POR TIPO, del lado de este extractor. Ver el
  // comentario en el push de abajo: `functionScope` tiene que quedar IGUAL a
  // `ReferenceFacts.scope`, y desde esta ola ese array lleva el tipo receptor.
  const tiposDeArchivo = fileLevelTypeNames(root, sets);

  const containerPathOf = (): readonly string[] => scopeStack.filter((f) => f.name !== null).map((f) => f.name as string);

  const visit = (node: AstNode): void => {
    if (!node.isNamed) return;

    const functionLike = sets.functionNodes.has(node.type);
    const classLike = !functionLike && sets.classNodes.has(node.type);
    const nameNode = functionLike || classLike ? (node.childForFieldName("name") as AstNode | null) : null;
    // P4 (Ola P) — el tipo receptor es un contenedor más, exactamente como en
    // `graph/symbols.ts`/`graph/references.ts` (de donde se importan las dos
    // funciones, sin duplicarlas). `functionScope` se compara contra
    // `ref.scope` (ver `receiverByScopeKey` más abajo): si un lado lleva el
    // tipo y el otro no, la clave no cruza NUNCA y este extractor se apaga en
    // la única gramática para la que existe — medido sobre hugo: 303 aristas
    // `invokes-indirect` bajaban a 24 sin este push.
    let pushedReceiver = false;
    if (functionLike && scopeStack.length === 0) {
      const receiverType = declaredReceiverTypeName(node);
      if (receiverType !== null && tiposDeArchivo.has(receiverType)) {
        scopeStack.push({ name: receiverType, isClassLike: true });
        pushedReceiver = true;
      }
    }
    if (functionLike || classLike) scopeStack.push({ name: nameNode ? nameNode.text : null, isClassLike: classLike });

    if (functionLike) {
      const receiverField = node.childForFieldName(RECEIVER_DECL_FIELD) as AstNode | null;
      const param = receiverField ? namedChildren(receiverField)[0] : undefined;
      const nameField = param ? (param.childForFieldName("name") as AstNode | null) : null;
      const typeField = param ? (param.childForFieldName("type") as AstNode | null) : null;
      const receiverName = nameField?.text;
      const receiverTypeName = typeField ? rightmostLeafText(typeField) : null;
      if (receiverName && receiverTypeName) {
        out.push({ functionScope: containerPathOf(), receiverName, receiverTypeName });
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i) as AstNode | null;
      if (child) visit(child);
    }

    if (functionLike || classLike) scopeStack.pop();
    if (pushedReceiver) scopeStack.pop();
  };

  visit(root);
  return out;
}

/**
 * Superficie MÍNIMA que este módulo necesita de `GraphFileFacts` — no se
 * importa ese tipo de `build.ts` (crearía un ciclo: `build.ts` importa
 * ESTE módulo). Cualquier `GraphFileFacts` real ya cumple esta forma.
 */
export interface FileReferences {
  readonly path: string;
  readonly references: readonly ReferenceFacts[];
  /**
   * OPCIONAL, Forma 4 — ver el docstring del módulo. Ausente en cualquier
   * `FileReferences`/`GraphFileFacts` de antes de esta ola (`GraphFileFacts`
   * no declara este campo; sigue siendo un `FileReferences` válido, mismo
   * principio aditivo que `graph/types.ts` ya usa para sus propios campos
   * nuevos) — `deriveInvokesIndirectEdges` trata la ausencia como "sin
   * hechos de iteración para este archivo", nunca como un error. Quien arme
   * este campo (`code-analyzer.ts`, otro dueño — registro de pendientes,
   * Problema 1) corre `extractIterationCallFacts` en el mismo momento que ya
   * corre `extractCarrierFacts`; hasta que eso pase, la Forma 4 quedó
   * implementada y probada acá pero inerte en producción — declarado, no
   * escondido, mismo patrón que el resto del "cableado" pendiente.
   */
  readonly loops?: readonly IterationLoopFact[];
  /**
   * OPCIONAL, GENERALIZACIÓN DEL RECEPTOR (Go) — ver la sección homónima del
   * docstring del módulo. A DIFERENCIA de `loops` arriba, ESTE campo SÍ está
   * cableado en producción: `code-analyzer.ts` corre `extractReceiverFacts`
   * en el mismo momento que ya corre `extractCarrierFacts`/`extractSymbols`/
   * `extractReferences`, y `graph/build.ts`'s `GraphFileFacts` lo declara.
   * Ausente ⇒ sin hechos de receptor explícito para este archivo (cualquier
   * lenguaje sin campo `receiver` en su gramática), nunca un error.
   */
  readonly receivers?: readonly ReceiverFact[];
}

function buildContainsIndex(nodes: readonly CodeGraphNode[], containsEdges: readonly CodeGraphEdge[]): GraphIndex {
  const byFrom = new Map<string, CodeGraphEdge[]>();
  for (const e of containsEdges) {
    const list = byFrom.get(e.from);
    if (list) list.push(e);
    else byFrom.set(e.from, [e]);
  }
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  return { nodeById: (id) => byId.get(id) ?? null, edgesFrom: (id) => byFrom.get(id) ?? [] };
}

/**
 * `files` trae `ReferenceFacts` CRUDAS (`GraphFileFacts.references`, ya
 * extraídas antes de esta llamada — mismo dato que alimenta la cascada,
 * nunca re-parseado acá). `nodes`/`containsEdges` son el grafo YA armado
 * hasta ese punto (símbolos + `contains`, alcanza para `memberSignatures`).
 * `inheritanceEdges` (`extends`/`implements`/`mixes-in`, YA resueltas por la
 * cascada — ver la nota "HERENCIA" del docstring del módulo) deja subir la
 * cadena de superclases al comprobar si un método está declarado. Depende
 * sólo de datos ya disponibles tanto en `buildGraph` como en `assembleGraph`
 * (la mitad incremental) — mismo hook en los dos lugares.
 *
 * Dos mecanismos de detección del receptor corren en el MISMO recorrido de
 * `f.references`, ver "GENERALIZACIÓN DEL RECEPTOR" en el docstring del
 * módulo: despacho implícito (self/this, `classPath` vía `ref.scope` +
 * `memberNamesOf` vía `contains`) y receptor EXPLÍCITO (`f.receivers`,
 * `classPath`/"¿declarado?" 100% AST-nativos, sin pasar por `ref.scope` ni
 * `contains` — Go, hoy el único caso, pero cualquier gramática futura con
 * campo `receiver` propio cae acá sola).
 */
export function deriveInvokesIndirectEdges(
  nodes: readonly CodeGraphNode[],
  containsEdges: readonly CodeGraphEdge[],
  files: readonly FileReferences[],
  inheritanceEdges: readonly CodeGraphEdge[] = [],
): { readonly nodes: readonly CodeGraphNode[]; readonly edges: readonly CodeGraphEdge[] } {
  const index = buildContainsIndex(nodes, containsEdges);
  const nodeById = new Map(nodes.map((n) => [n.id, n] as const));

  const superOf = new Map<string, string[]>();
  for (const e of inheritanceEdges) {
    if (!INHERITANCE_KINDS.has(e.kind)) continue;
    const list = superOf.get(e.from);
    if (list) list.push(e.to);
    else superOf.set(e.from, [e.to]);
  }

  const memberNamesCache = new Map<string, ReadonlySet<string>>();
  /** Miembros DIRECTOS más los de toda la cadena `extends`/`implements`/`mixes-in` — ver la nota "HERENCIA" del docstring del módulo. */
  const memberNamesOf = (classId: string): ReadonlySet<string> => {
    const cached = memberNamesCache.get(classId);
    if (cached) return cached;
    const names = new Set<string>();
    const visited = new Set<string>();
    const queue: { readonly id: string; readonly depth: number }[] = [{ id: classId, depth: 0 }];
    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (visited.has(id) || depth > MAX_INHERITANCE_DEPTH) continue;
      visited.add(id);
      for (const m of memberSignatures(index, id)) names.add(m.name);
      for (const superId of superOf.get(id) ?? []) queue.push({ id: superId, depth: depth + 1 });
    }
    memberNamesCache.set(classId, names);
    return names;
  };

  const extraNodes: CodeGraphNode[] = [];
  const seenCarrierIds = new Set<string>();
  const mergedEdges = new Map<string, CodeGraphEdge>();

  /**
   * GENERALIZACIÓN DEL RECEPTOR (Go) — "¿ya está declarado?" para el
   * receptor EXPLÍCITO, ver la sección homónima del docstring del módulo.
   * Equivalente de `memberNamesOf` para el caso en que NO hay `classId`
   * (Go: `classNodes` vacío, sin `contains` struct→método) — se arma UNA
   * vez, de TODOS los archivos, agregando el nombre de cada método cuyo
   * receptor declara ese mismo tipo. Global (no por archivo) a propósito:
   * los métodos de un mismo struct Go suelen repartirse entre varios
   * archivos del mismo paquete; el `carrier` sigue siendo por-archivo (ver
   * abajo, mismo alcance que Forma 3a/4 ya usan) — sólo el conjunto "¿está
   * declarado?" mira el repo entero, más preciso que mirar sólo este archivo.
   */
  /**
   * BRECHA DECLARADA (severidad baja, nunca verificada contra el corpus por
   * falta de un caso real): la clave es el nombre de tipo TAL CUAL
   * (`receiverTypeName`), sin calificar por paquete/carpeta — un repo con
   * DOS structs de igual nombre en paquetes Go distintos (legal: Go
   * desambigua por import path, esto acá no tiene esa noción) fundiría sus
   * conjuntos de miembros. Consecuencia, si ocurriera: un FALSO NEGATIVO
   * (una llamada real a un miembro no declarado se salta por creer que SÍ
   * lo está, porque el struct de igual nombre del OTRO paquete sí lo tiene)
   * — nunca un falso positivo, el sentido más seguro de equivocarse acá,
   * mismo principio que "ambiguo ⇒ no emitir" que ya rige el resto de este
   * módulo. No remendado con un calificador de paquete: este módulo no
   * recibe esa información hoy (ni `ReceiverFact` ni `ReferenceFacts` la
   * llevan), y adivinarla por convención de carpeta sería exactamente el
   * atajo por nombre que esta ola prohíbe.
   */
  const declaredMembersByType = new Map<string, Set<string>>();
  for (const f of files) {
    for (const rf of f.receivers ?? []) {
      const methodName = rf.functionScope[rf.functionScope.length - 1];
      if (methodName === undefined) continue;
      const set = declaredMembersByType.get(rf.receiverTypeName);
      if (set) set.add(methodName);
      else declaredMembersByType.set(rf.receiverTypeName, new Set([methodName]));
    }
  }

  for (const f of files) {
    const file = f.path;
    /**
     * Índice por-archivo, clave = `functionScope` unido — mismo formato que
     * `ref.scope`, así que una llamada dentro del cuerpo de ESE método
     * comparte la clave exacta.
     *
     * P4 (Ola P) — LA COLISIÓN DE ABAJO YA NO PUEDE PASAR POR ESA CAUSA, y la
     * defensa se conserva igual. `graph/symbols.ts` pasó a poner el TIPO
     * RECEPTOR en `container`, y `extractReceiverFacts` (arriba) hace el mismo
     * push, así que la clave de dos métodos homónimos con receptores de tipos
     * distintos pasó a ser `["ResourceSourceDescriptor","init"]` y
     * `["resourceHash","init"]`: distintas por construcción. El marcado `null`
     * se deja porque sigue cubriendo el caso en que el tipo receptor NO está
     * declarado en el archivo (brecha declarada de `symbols.ts`), y porque una
     * defensa que ya casi no se activa no cuesta nada — lo que no se puede es
     * borrarla y confiar.
     *
     * COLISIÓN MEDIDA, no hipotética (hugo real, `resources/resource.go`), DE
     * ANTES DE ESE CAMBIO:
     * `container: []` para TODO método Go (ver "GENERALIZACIÓN DEL
     * RECEPTOR"/symbols.ts en el docstring del módulo) significa que
     * `functionScope` es sólo el nombre del método, SIN el tipo receptor —
     * dos métodos DISTINTOS con el mismo nombre pero receptores de TIPOS
     * distintos (`(fd *ResourceSourceDescriptor) init(r *Spec)` y
     * `(r *resourceHash) init(...)`, ambos llamados `init` en el mismo
     * archivo) comparten la MISMA clave `["init"]`. Sobrescribir con el
     * último visto le atribuía a `r.MediaTypes()` — `r` ahí es un PARÁMETRO
     * ordinario de tipo `*Spec`, no ningún receptor — el receptor de la
     * OTRA función homónima, sólo porque ambas casualmente llaman "r" a
     * alguna de sus variables: falso positivo confirmado por lectura
     * directa del archivo. Value `null` ⇒ AMBIGUO: la clave se marca
     * inutilizable en cuanto aparece una SEGUNDA declaración con
     * receptor/tipo distinto, en vez de quedarse con cualquiera de las dos
     * — mismo principio que `narrowedOrReject` de `resolve.ts` ("ambiguo
     * ⇒ rechazar, nunca adivinar"), aplicado acá sin importar `resolve.ts`.
     */
    const receiverByScopeKey = new Map<string, ReceiverFact | null>();
    for (const rf of f.receivers ?? []) {
      const key = rf.functionScope.join(SCOPE_KEY_SEP);
      const existing = receiverByScopeKey.get(key);
      if (existing === undefined) receiverByScopeKey.set(key, rf);
      else if (existing !== null && (existing.receiverName !== rf.receiverName || existing.receiverTypeName !== rf.receiverTypeName)) {
        receiverByScopeKey.set(key, null);
      }
    }

    for (const ref of f.references) {
      if (!ref.isCallee) continue;
      if (ref.role !== "receiver-member") continue;
      if (ref.qualifier === null) continue;
      if (ref.scope.length === 0) continue;

      if (SELF_KEYWORDS.has(ref.qualifier)) {
        // Forma 3(a) original — despacho implícito (self/this), sin campo `receiver` propio. Ver el docstring del módulo.
        const immediateId = symbolNodeId(file, ref.scope);
        const immediateNode = nodeById.get(immediateId);
        const classPath = immediateNode?.family === "function-like" ? ref.scope.slice(0, -1) : ref.scope;
        if (classPath.length === 0) continue;
        const classId = symbolNodeId(file, classPath);
        const classNode = nodeById.get(classId);
        if (!classNode || classNode.kind !== "symbol" || classNode.family !== "class-like") continue;

        if (memberNamesOf(classId).has(ref.name)) continue; // método declarado real ⇒ la cascada normal ya lo resuelve como `calls`, no duplicar.

        const carrierId = portadorCarrierId(file, classPath, ref.name, 0);
        if (!seenCarrierIds.has(carrierId) && !nodeById.has(carrierId)) {
          seenCarrierIds.add(carrierId);
          extraNodes.push({ id: carrierId, kind: "carrier", file, symbolPath: [...classPath, ref.name], carrierForm: "field" });
        }

        const key = `${immediateId}|${carrierId}`;
        const existing = mergedEdges.get(key);
        if (existing) mergedEdges.set(key, { ...existing, weight: existing.weight + 1 });
        else mergedEdges.set(key, { from: immediateId, to: carrierId, kind: "invokes-indirect", provenance: "inferred", weight: 1 });
        continue;
      }

      // GENERALIZACIÓN DEL RECEPTOR (Go) — receptor EXPLÍCITO declarado por
      // la propia función envolvente (`ReceiverFact`, ver el docstring del
      // módulo). `classPath`/"¿está declarado?" se derivan del AST, no de
      // `ref.scope`/`contains` (que para Go no llegan hasta el struct).
      const receiverFact = receiverByScopeKey.get(ref.scope.join(SCOPE_KEY_SEP));
      if (!receiverFact || receiverFact.receiverName !== ref.qualifier) continue;
      if (declaredMembersByType.get(receiverFact.receiverTypeName)?.has(ref.name)) continue; // método declarado real del mismo tipo receptor ⇒ no duplicar (misma intención que `memberNamesOf`, fuente AST-nativa — ver "BRECHA DECLARADA" del docstring para el límite de embedding).

      const immediateId = symbolNodeId(file, ref.scope);
      const classPath = [receiverFact.receiverTypeName];
      const carrierId = portadorCarrierId(file, classPath, ref.name, 0);
      if (!seenCarrierIds.has(carrierId) && !nodeById.has(carrierId)) {
        seenCarrierIds.add(carrierId);
        extraNodes.push({ id: carrierId, kind: "carrier", file, symbolPath: [...classPath, ref.name], carrierForm: "field" });
      }

      const key = `${immediateId}|${carrierId}`;
      const existing = mergedEdges.get(key);
      if (existing) mergedEdges.set(key, { ...existing, weight: existing.weight + 1 });
      else mergedEdges.set(key, { from: immediateId, to: carrierId, kind: "invokes-indirect", provenance: "inferred", weight: 1 });
    }
  }

  // FORMA 4 — ver el docstring del módulo. `loops` es opcional (ausente en
  // producción hoy, ver el docstring de `FileReferences.loops`): un archivo
  // sin ese campo simplemente no aporta hechos de iteración, no es un error.
  for (const f of files) {
    const loops = f.loops ?? [];
    if (loops.length === 0) continue;
    const file = f.path;

    for (const loop of loops) {
      if (loop.containerPath.length === 0 || loop.collection === null) continue;
      const immediateId = symbolNodeId(file, loop.containerPath);

      const carrierPath = loop.collection.ownerIsEnclosingClass ? loop.classPath : loop.containerPath;
      if (carrierPath === null || carrierPath.length === 0) continue; // self/this-qualificada sin clase envolvente ⇒ brecha declarada, no anclable.
      const carrierId = portadorCarrierId(file, carrierPath, loop.collection.name, 0);

      const matches = f.references.filter(
        (ref) =>
          ref.isCallee &&
          ref.role === "receiver-member" &&
          ref.qualifier === loop.loopVarName &&
          ref.line >= loop.bodyStartLine &&
          ref.line <= loop.bodyEndLine &&
          ref.scope.length === loop.containerPath.length &&
          ref.scope.every((s, i) => s === loop.containerPath[i]),
      );
      if (matches.length === 0) continue;

      if (!seenCarrierIds.has(carrierId) && !nodeById.has(carrierId)) {
        seenCarrierIds.add(carrierId);
        extraNodes.push({
          id: carrierId,
          kind: "carrier",
          file,
          symbolPath: [...carrierPath, loop.collection.name],
          carrierForm: loop.collection.ownerIsEnclosingClass ? "field" : "local",
        });
      }

      const key = `${immediateId}|${carrierId}`;
      const existing = mergedEdges.get(key);
      if (existing) mergedEdges.set(key, { ...existing, weight: existing.weight + matches.length });
      else mergedEdges.set(key, { from: immediateId, to: carrierId, kind: "invokes-indirect", provenance: "inferred", weight: matches.length });
    }
  }

  return { nodes: extraNodes, edges: [...mergedEdges.values()] };
}
