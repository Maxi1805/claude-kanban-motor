/**
 * `Move Member` — Ola AS, frente AS3. **Absorbe `Move Method` y `Move Field`**
 * (refactoring.guru/es/move-method · /es/move-field). Primera hipótesis de la
 * capa de REFACTORIZACIONES construida después del giro de la Ola AR: no es un
 * patrón de diseño, es una técnica cuyo precondición es un HECHO DEL CÓDIGO.
 *
 * ── LA PRUEBA QUE TODA FAMILIA DE ESTA OLA TIENE QUE PASAR ─────────────────
 * "¿la precondición se verifica ABRIENDO EL ARCHIVO?" — el criterio con el
 * que `Extract Method` rinde 73,6 % y los 17 patrones rinden 17,9 %. La de
 * esta familia:
 *
 *   > **ESTE MÉTODO LE ESCRIBE (ASIGNA) DOS O MÁS MIEMBROS DISTINTOS A UN
 *   > MISMO OBJETO QUE NO ES ÉL.**
 *
 * No es "acá convendría mover el método". Es una asignación, con nombre y
 * línea: `x.a = …; x.b = …`. Se abre el archivo y se ve, o no está.
 *
 * ── POR QUÉ LA ESCRITURA Y NO LA LECTURA — MEDIDO, NO ELEGIDO ──────────────
 * El ancla `feature-envy-intra` mide **1/19 = 5,3 %** vigente (3/82 = 3,7 %
 * histórico) sobre las planillas `tests/golden/precision/*.verdicts.csv` con
 * el filtro de vigencia de `detect/precision/gate-logic.ts`; `feature-envy-inter`
 * mide **0/15** y `inappropriate-intimacy` **0/3** vigente (0/18 histórico).
 * Son, LITERALMENTE, el fondo del catálogo de 48 kinds medidos. Leí los 19
 * veredictos vigentes de `feature-envy-intra` uno por uno antes de escribir
 * una línea de este archivo, y los 18 falsos se reparten en CUATRO familias,
 * todas de LECTURA:
 *
 *   1. **MAPEADOR / ENSAMBLADOR / SERIALIZADOR** (7 de 18) — el método lee
 *      campos de un DTO ajeno y arma OTRA cosa con ellos: `RoutesMapper.
 *      getRouteInfoFromObject`, `GraphInspector.insertClassNode`,
 *      `JsonSchemaModelBuilder.BuildNodeModel`,
 *      `DefaultContractResolver.CreatePropertyFromConstructorParameter`.
 *      Leer datos ajenos ES el trabajo declarado de un traductor.
 *   2. **HOOK POLIMÓRFICO** (6 de 18) — `@Override compute*TestSuite(parentBuilder)`
 *      de `guava-testlib`: el parámetro es el material del hook por diseño y
 *      el método despacha por subclase, así que NO SE PUEDE mover sin romper
 *      el despacho.
 *   3. **PRESENTACIÓN SOBRE UNA CLASE DE DATOS** — `IndexerHtml.GetFolderNameRow`
 *      arma una fila HTML a partir de `FolderInfo`; moverla adentro metería
 *      presentación en una clase de datos.
 *   4. **FÁBRICA DE CONFIGURACIÓN DEL FRAMEWORK** — `createAsyncProviders`
 *      leyendo `options.useExisting/useFactory/useClass`: `options` es una
 *      interfaz de configuración, no una clase con comportamiento.
 *
 * **Las cuatro son LECTURA. El único verdadero de los 19 es una ESCRITURA**:
 * `rubocop/lib/rubocop/lsp/server.rb:58#configure`, que hace
 * `@runtime.safe_autocorrect = …; @runtime.lint_mode = …; @runtime.layout_mode = …`
 * — el veredicto humano dice, textual: *"Es feature envy real… Server hace el
 * trabajo de parseo de configuración de Runtime en su lugar"*.
 *
 * O sea: el `required` de este archivo no es una idea, es **el separador que
 * el corpus juzgado ya tenía adentro**. Un `required` de escritura mata las
 * cuatro familias de falsos de un saque (ninguna asigna nada al proveedor) y
 * conserva el único verdadero. Eso es lo que se mide en esta ola.
 *
 * ── LA CONSECUENCIA QUE HAY QUE DECIR EN VOZ ALTA ──────────────────────────
 * Una hipótesis de nivel 2 sobre un ancla de 5 % SÓLO puede superar a su
 * ancla si su `required` SELECCIONA un subconjunto mejor que el promedio del
 * ancla — nunca por promedio. Este archivo apuesta exactamente a eso y lo
 * declara ANTES de medir: si la precisión medida abriendo archivos no supera
 * el piso de 50 % de `detect/precision/gate-logic.ts#PRECISION_FLOOR`, la
 * familia queda CONSTRUIDA, MEDIDA Y DESCONECTADA. Es el precedente de
 * `Facade` (688 propuestas, 0/63) y `Builder` (395, 0/58): publicar el número
 * y no aterrizar.
 *
 * ── NADA DE HARDCODEOS DE LENGUAJE (la trampa ya pagada) ───────────────────
 * Precedente: `SELF_PREFIX = /^(?:self\.|this\.|@)/` en `state.ts` dejó a Go
 * MUDO durante varias olas. Acá la auto-referencia se reconoce por **TIPO DE
 * NODO de la gramática** (`this`/`self`/`super`, `instance_variable`/
 * `class_variable`) más las dos vías por-lenguaje que la gramática no expone
 * (los nombres `self`/`cls` de Python, que son convención PEP-8 y no
 * gramática, y el RECEPTOR de método de Go, que es un identificador
 * arbitrario y se lee de la declaración, nunca de una lista). Es la MISMA
 * mecánica, verbatim, de `detect/intra-file/feature-envy-intra.ts`
 * (`SELF_NODE_TYPE`/`SELF_DATA_NODE_TYPE`/`PYTHON_SELF_NAMES`), duplicada a
 * propósito porque ese archivo no la exporta y esta ola no es dueña de
 * `detect/**` — mismo criterio y misma justificación escrita que
 * `value-object.ts#PRIMITIVE_TYPE_WORD` y `composite.ts#esConstructor`.
 * SI SE TOCA UNA, SE TOCA LA OTRA.
 *
 * ── ESTE ARCHIVO EXPORTA EL VOCABULARIO DE AST DE LA FAMILIA AS3 ───────────
 * `extract-class.ts` y `encapsulate.ts` importan de acá los helpers
 * genéricos (`accessOf`, `esAutoReferencia`, `walk`, `parameterNames`…). Es
 * deliberado: la alternativa era un CUARTO archivo compartido en
 * `hypotheses/`, que ni `registries.test.ts` reconoce como infraestructura ni
 * el reparto de esta ola le asigna dueño. Tres archivos, un dueño, cero
 * archivos compartidos nuevos.
 */
import type { AstNode, Finding, FileUnit, FunctionUnit, RoleLocation } from "../detect/types.js";
import type { ProbeNode } from "../code-grammar.js";
import type { CodeGraph } from "../graph/types.js";
import { build as runEngine, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext } from "./types.js";

/* ══════════════════════════════════════════════════════════════════════════
 * VOCABULARIO DE GRAMÁTICA — genérico para los 6 lenguajes, por FORMA de
 * campo y por TIPO de nodo, jamás por `language`. Confirmado por sonda
 * directa en `detect/intra-file/feature-envy-intra.ts`, de donde se copia.
 * ══════════════════════════════════════════════════════════════════════════ */

/** Campo genérico de la BASE de un acceso a miembro. */
export const ACCESS_BASE_FIELDS = ["object", "receiver", "operand", "expression"] as const;
/** Campo genérico del MIEMBRO accedido. */
export const MEMBER_NAME_FIELDS = ["property", "attribute", "method", "field", "name"] as const;
/**
 * Campos por los que se baja de una INDEXACIÓN a lo que se indexa —
 * CONFIRMADO POR SONDA DIRECTA sobre las 6 gramáticas (`scratchpad-as3/sonda.mts`),
 * y las 6 lo nombran distinto: `object` (TS/JS `subscript_expression`), `value`
 * (Python `subscript`), `array` (Java `array_access`), `operand` (Go
 * `index_expression`), `expression` (C# `element_access_expression`). Ruby
 * (`element_reference`) NO expone ningún campo: se baja por el primer hijo
 * nombrado. Sin esta sonda, la mitad de los lenguajes quedaba muda en las
 * escrituras indexadas — el mismo error de clase que dejó a Go mudo con
 * `SELF_PREFIX`.
 */
export const INDEX_BASE_FIELDS = ["object", "value", "array", "operand", "expression"] as const;
/** Tipos de nodo de indexación — las 6 gramáticas, por sonda directa. */
export const INDEX_NODE_WORD = /(^|_)(subscript|element_reference|element_access|array_access|index)(_|$)/;
/** Contenedor de parámetros de un nodo función-like. */
export const PARAMETER_CONTAINER_FIELDS = ["parameters", "parameter_list"] as const;
/** Lista de argumentos de una llamada — lo que distingue una ORDEN de un acceso a dato. */
export const ARGUMENT_LIST_FIELDS = ["arguments", "argument_list"] as const;
/** Destino de una llamada sin receptor. */
export const CALL_TARGET_FIELDS = ["function", "method", "name"] as const;
/** Keyword dedicado de auto-referencia (`this`/`self`/`super`, con o sin sufijo `_expression`). */
export const SELF_NODE_TYPE = /^(this|self|super)(_expression)?$/;
/** Dato de la propia instancia SIN receptor: `@x`/`@@x` de Ruby, tipos de nodo dedicados. */
export const SELF_DATA_NODE_TYPE = /^(instance|class)_variable$/;
/** Nodo que ASIGNA — las 6 gramáticas nombran su nodo de asignación con esta palabra. */
export const ASSIGNMENT_NODE_WORD = /(^|_)assignment(_|$)/;
/** Tipos de nodo que NOMBRAN algo. `type_identifier` queda afuera: nombra un TIPO. */
export const IDENTIFIER_NODE_TYPE = /(^|_)identifier$/;
export const TYPE_IDENTIFIER_NODE_TYPE = /^type_identifier$/;
/** Convención PEP-8, no gramática: Python no dedica un tipo de nodo a `self`/`cls`. */
export const PYTHON_SELF_NAMES: ReadonlySet<string> = new Set(["self", "cls"]);
/** El contenedor del receptor de método de Go (`func (s *Server) Foo()`), por FORMA de campo. */
export const GO_RECEIVER_FIELDS = ["receiver"] as const;

export function fieldOf(node: ProbeNode, fields: readonly string[]): ProbeNode | null {
  for (const field of fields) {
    const child = node.childForFieldName(field);
    if (child) return child;
  }
  return null;
}

export function textOf(node: ProbeNode): string {
  return (node as AstNode).text;
}

export function isIdentifierLike(node: ProbeNode): boolean {
  return node.isNamed && IDENTIFIER_NODE_TYPE.test(node.type) && !TYPE_IDENTIFIER_NODE_TYPE.test(node.type);
}

export function walk(node: ProbeNode, visit: (n: ProbeNode) => void): void {
  visit(node);
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) walk(child, visit);
  }
}

export interface MemberAccess {
  base: ProbeNode;
  member: ProbeNode;
}

/** `x.y` genérico: un nodo que expone A LA VEZ una base y un miembro. */
export function accessOf(node: ProbeNode): MemberAccess | null {
  if (!node.isNamed) return null;
  const base = fieldOf(node, ACCESS_BASE_FIELDS);
  if (!base) return null;
  const member = fieldOf(node, MEMBER_NAME_FIELDS);
  if (!member) return null;
  return { base, member };
}

/** `@cache` -> `cache`: el sigilo de Ruby es texto de la gramática, no un lenguaje hardcodeado. */
export function bareName(text: string): string {
  return text.replace(/^@+/u, "");
}

/**
 * ── QUÉ ES ESTE NODO RESPECTO DE UNO MISMO — tres respuestas, no dos ───────
 *
 * **EL DEFECTO QUE ESTA FUNCIÓN TENÍA, Y QUE LA OLA AW ARREGLA EN LA RAÍZ.**
 * Hasta la Ola AU devolvía `true` para **cualquier** nodo `instance_variable`,
 * o sea que en Ruby `@colaborador` contaba como "uno mismo" y, con él,
 * `@colaborador.campo` contaba `campo` como miembro de ESTA clase. Consecuencia
 * medida (informe AU3 §1.1, y `claude-kanban-docs/PENDIENTE-MODELO-DE-CAMPOS.md`):
 * **la superficie entera de cada colaborador entraba como campos de la clase.**
 * Testigo: `chatwoot/app/services/data_imports/importer.rb`, una propuesta de 6
 * métodos sobre 90 cuyos tres campos eran `@data_import.items`,
 * `@data_import.mappings` y `@source.truncated_parts_error_code` — miembros de
 * OTROS objetos, los tres.
 *
 * **LA CAUSA NO ERA UN UMBRAL: ERA UNA PREGUNTA MAL HECHA.** "¿este nodo es la
 * auto-referencia?" tiene TRES respuestas en un lenguaje con sigilo, no dos:
 *
 *   · `"self"`         — el nodo ES uno mismo. Tres mecanismos, en este orden:
 *                        (A) tipo de nodo dedicado (`this`/`self`/`super`),
 *                        (B) los nombres `self`/`cls` bajo Python, que la
 *                            gramática NO distingue,
 *                        (C) el nombre del RECEPTOR declarado, para Go, que lo
 *                            escribe el autor (`receiverNames`, por función).
 *   · `"campo-propio"` — el nodo es un CAMPO de uno mismo (`@x` de Ruby). Su
 *                        raíz es propia, pero **el objeto no es uno mismo**:
 *                        lo que le cuelgue es del colaborador que guarda.
 *   · `null`           — ni una cosa ni la otra.
 *
 * `esAutoReferencia` conserva su nombre y su firma y ahora responde lo que su
 * nombre pregunta: **sólo `"self"`**. Todo callsite que necesite el otro hecho
 * lo pide explícitamente con `autoReferenciaDe` o con `SELF_DATA_NODE_TYPE`,
 * que es lo que ya hacían —por separado y a mano— los de este archivo.
 */
export type AutoRef = "self" | "campo-propio" | null;

export function autoReferenciaDe(
  node: ProbeNode,
  language: string,
  receiverNames: ReadonlySet<string>,
): AutoRef {
  if (SELF_NODE_TYPE.test(node.type)) return "self";
  // `@x` / `@@x`: la raíz es propia, pero el OBJETO es el que `@x` guarda.
  if (SELF_DATA_NODE_TYPE.test(node.type)) return "campo-propio";
  if (!isIdentifierLike(node)) return null;
  const t = textOf(node);
  if (receiverNames.has(t)) return "self";
  return language === "python" && PYTHON_SELF_NAMES.has(t) ? "self" : null;
}

export function esAutoReferencia(node: ProbeNode, language: string, receiverNames: ReadonlySet<string>): boolean {
  return autoReferenciaDe(node, language, receiverNames) === "self";
}

/**
 * El receptor que declara un nodo función-like, cuando la gramática le da un
 * contenedor propio: Go (`func (s *Server) …`). Devuelve el conjunto vacío en
 * las otras cinco gramáticas, donde ese campo no existe — es un no-op, no una
 * rama por lenguaje.
 */
export function receiverNamesOf(fnNode: ProbeNode): ReadonlySet<string> {
  const recv = fieldOf(fnNode, GO_RECEIVER_FIELDS);
  if (!recv) return new Set<string>();
  const names = new Set<string>();
  walk(recv, (n) => {
    if (isIdentifierLike(n)) names.add(textOf(n));
  });
  // El contenedor trae también el TIPO (`*Server`); el receptor es el PRIMER
  // identificador, el resto es el tipo. Tomar los dos sobre-incluiría el
  // nombre del tipo como auto-referencia, y un tipo nunca aparece como base
  // de un acceso a dato en el cuerpo, así que el sesgo es inofensivo — pero
  // se acota igual al primero, que es lo que la gramática garantiza.
  const first = [...names][0];
  return first === undefined ? new Set<string>() : new Set([first]);
}

/**
 * El destino REAL de una asignación. **Go envuelve su `left` en un
 * `expression_list`** (sonda directa: `o.a = 1` da
 * `assignment_statement{left: expression_list{selector_expression}}`), así que
 * leer `left` a secas deja a Go MUDO — la trampa ya pagada, otra vez, en otro
 * campo. Las otras cinco gramáticas devuelven el destino directo.
 */
export function assignmentTargets(node: ProbeNode): ProbeNode[] {
  const left = fieldOf(node, ["left"]);
  if (!left) return [];
  if (/(^|_)expression_list$/.test(left.type)) {
    const out: ProbeNode[] = [];
    for (let i = 0; i < left.childCount; i++) {
      const c = left.child(i);
      if (c && c.isNamed) out.push(c);
    }
    return out;
  }
  return [left];
}

/** Baja UN nivel desde una indexación hasta lo indexado. `null` si no es una indexación. */
export function indexBaseOf(node: ProbeNode): ProbeNode | null {
  if (!INDEX_NODE_WORD.test(node.type)) return null;
  const byField = fieldOf(node, INDEX_BASE_FIELDS);
  if (byField) return byField;
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c && c.isNamed) return c;
  }
  return null;
}

/**
 * ¿El receptor de una ESCRITURA A MIEMBRO es UNO MISMO? Sólo el keyword
 * dedicado (`this`/`self`/`super`) y el receptor declarado de Go.
 *
 * **UNA VARIABLE DE INSTANCIA QUE RECIBE LA ESCRITURA NO ES UNO MISMO.**
 * `@runtime.lint_mode = …`: la raíz es propia —es un campo— pero el objeto al
 * que se le escribe es el COLABORADOR que ese campo guarda. Es exactamente la
 * forma del ÚNICO verdadero de los 19 veredictos vigentes de
 * `feature-envy-intra` (`rubocop/lib/rubocop/lsp/server.rb#configure`), y un
 * chequeo de "raíz propia" a secas —que es lo que `esAutoReferencia` responde,
 * y con razón, para las LECTURAS— se lo comería entero.
 */
export function esUnoMismo(node: ProbeNode, language: string, receiverNames: ReadonlySet<string>): boolean {
  if (SELF_NODE_TYPE.test(node.type)) return true;
  if (!isIdentifierLike(node)) return false;
  const t = textOf(node);
  if (receiverNames.has(t)) return true;
  return language === "python" && PYTHON_SELF_NAMES.has(t);
}

/** Un nodo que declara un nombre ligado (`variable_declarator` en JS/TS/Java/C#). */
export const DECLARATOR_NODE_WORD = /(^|_)declarator$/;
/** Campo genérico de la variable que liga un loop. */
export const LOOP_BINDING_FIELDS = ["left", "name", "pattern"] as const;
export const LOOP_NODE_WORD = /(^|_)(while|until|for|do)(_|$)/;

/**
 * Nombres que la propia función LIGA: sus parámetros no, sino todo lo que
 * NACE adentro — declaradores, variables de loop, y (en Go/Python/Ruby, donde
 * asignar es declarar) los nombres desnudos que la función asigna.
 *
 * POR QUÉ HACE FALTA, MEDIDO SOBRE EL CORPUS: sin esto, un método que CREA un
 * objeto y le llena los campos (`const o = {...}; o.a = 1; o.b = 2;`) se lee
 * como "le escribe el estado a otro". Es el falso que salió en la primera
 * pasada — `nest/packages/common/services/console-logger.service.ts#getInspectOptions`,
 * que arma su propio `inspectOptions` local — y es EXACTAMENTE la exclusión que
 * `detect/intra-file/feature-envy-intra.ts` ya declara para las lecturas
 * ("RAÍZ = variable local… → NI propio NI foráneo"), traída acá para las
 * escrituras. Llenar un objeto que uno mismo acaba de crear no es hacer el
 * trabajo de otro: es construirlo.
 */
export function localNames(fnNode: ProbeNode): ReadonlySet<string> {
  const locales = new Set<string>();
  walk(fnNode, (n) => {
    if (!n.isNamed) return;
    if (DECLARATOR_NODE_WORD.test(n.type)) {
      const byField = fieldOf(n, ["name"]);
      if (byField && isIdentifierLike(byField)) {
        locales.add(textOf(byField));
      } else {
        for (let i = 0; i < n.childCount; i++) {
          const c = n.child(i);
          if (c && isIdentifierLike(c)) {
            locales.add(textOf(c));
            break;
          }
        }
      }
      return;
    }
    if (LOOP_NODE_WORD.test(n.type)) {
      const bound = fieldOf(n, LOOP_BINDING_FIELDS);
      if (bound && isIdentifierLike(bound)) locales.add(textOf(bound));
      return;
    }
    // Asignar a un nombre DESNUDO declara una local en Ruby/Python/Go
    // (`:=`), y en Java/C# ese caso ya lo cubre el declarador de arriba.
    if (ASSIGNMENT_NODE_WORD.test(n.type) || /(^|_)short_var_declaration$/.test(n.type)) {
      for (const left of assignmentTargets(n)) {
        if (isIdentifierLike(left)) locales.add(textOf(left));
      }
    }
  });
  return locales;
}

export function parameterNames(node: ProbeNode): ReadonlySet<string> {
  const params = fieldOf(node, PARAMETER_CONTAINER_FIELDS);
  const names = new Set<string>();
  if (!params) return names;
  if (isIdentifierLike(params)) {
    names.add(textOf(params));
    return names;
  }
  for (let i = 0; i < params.childCount; i++) {
    const child = params.child(i);
    if (!child || !child.isNamed) continue;
    if (isIdentifierLike(child)) {
      names.add(textOf(child));
      continue;
    }
    const byName = fieldOf(child, ["name", "pattern"]);
    if (byName && isIdentifierLike(byName)) names.add(textOf(byName));
  }
  return names;
}

/* ══════════════════════════════════════════════════════════════════════════
 * LA MEDICIÓN
 * ══════════════════════════════════════════════════════════════════════════ */

const ANCHOR_ENVY_INTRA = "feature-envy-intra";
const ANCHOR_ENVY_INTER = "feature-envy-inter";
const ANCHOR_INTIMACY = "inappropriate-intimacy";

/**
 * Miembros DISTINTOS que hay que verle escritos a un mismo objeto ajeno para
 * que "este método hace el trabajo de otro" sea un hecho y no una impresión.
 *
 * POR QUÉ DOS Y NO UNO, escrito antes de medir: con UNO, `otro.campo = v` es
 * el `setter` de toda la vida — un solo asignador cruzado es la forma más
 * común y más inocente del código real (inyección, inicialización, un flag), y
 * mover un método por eso sería el mismo error de tamaño que `Template Method
 * · large-class` (0 de 27). Con DOS, el método ya está DECIDIENDO sobre el
 * estado ajeno: es la forma exacta del único verdadero medido del ancla
 * (`rubocop .../server.rb#configure`, TRES miembros). El sesgo es al falso
 * negativo, el declarado por todo este directorio.
 */
const MIN_MIEMBROS_ESCRITOS = 2;

interface DestinoEscrito {
  /** Texto de la raíz que recibe las escrituras (`@runtime`, `options`, `target`). */
  readonly receptor: string;
  /** Miembros DISTINTOS que este método le asigna. */
  readonly miembros: readonly string[];
  /** Órdenes (llamada CON argumentos) que este método le da al mismo receptor. */
  readonly ordenes: number;
}

interface MetodoMedido {
  readonly fn: FunctionUnit;
  /** Todos los receptores ajenos a los que este método le escribe, de mayor a menor. */
  readonly destinos: readonly DestinoEscrito[];
  /** Miembros propios DISTINTOS que el método lee o escribe. */
  readonly propios: number;
  /** ¿El cuerpo construye algo y lo devuelve? — la firma del MAPEADOR/ENSAMBLADOR. */
  readonly construyeResultado: boolean;
}

interface MoveMemberProblem {
  readonly kind: string;
  readonly file: string;
  /** `true` sólo si hubo árbol vivo para mirar. Sin esto ningún `required` puede sostener. */
  readonly conArbol: boolean;
  /** Métodos del alcance del hallazgo que escriben estado ajeno, de mayor a menor. */
  readonly candidatos: readonly MetodoMedido[];
  /** Hermanos del mismo archivo que YA delegan en el mismo receptor sin escribirle miembros. */
  readonly hermanosQueDelegan: readonly { readonly metodo: string; readonly receptor: string }[];
  readonly locations: readonly RoleLocation[];
}

/** ¿La función está contenida en OTRA función del mismo archivo? Un lambda no es un miembro que se pueda mudar. */
function anidadaEnOtraFuncion(functions: readonly FunctionUnit[], index: number): boolean {
  const own = functions[index]!;
  for (let i = 0; i < functions.length; i++) {
    if (i === index) continue;
    const o = functions[i]!;
    if (o.startLine === own.startLine && o.endLine === own.endLine) continue;
    if (o.startLine <= own.startLine && o.endLine >= own.endLine) return true;
  }
  return false;
}

/**
 * Mide UN método: a quién le escribe, cuánto se toca a sí mismo, y si su
 * trabajo es construir un resultado nuevo.
 *
 * Las escrituras se leen del nodo de ASIGNACIÓN: el campo `left` de un nodo
 * cuyo tipo lleva la palabra `assignment` (las 6 gramáticas). Si ese `left`
 * es un acceso a miembro `X.m`, la escritura es a `m` sobre `X`; si `X` es la
 * auto-referencia, la escritura es PROPIA. Un `X.m[i] = v` baja por la
 * indexación hasta `X.m` y se atribuye igual — es el mismo estado ajeno.
 */
function medirMetodo(fn: FunctionUnit, language: string): MetodoMedido {
  const receptores = receiverNamesOf(fn.node);
  const params = parameterNames(fn.node);
  // Un objeto que NACE en este método no es "otro": ver `localNames`.
  const locales = new Set([...localNames(fn.node)].filter((n) => !params.has(n)));
  const porReceptor = new Map<string, Set<string>>();
  const ordenes = new Map<string, number>();
  const propios = new Set<string>();
  let construyeResultado = false;

  const raizDe = (node: ProbeNode): { raiz: ProbeNode; miembro: string | null } => {
    let n = node;
    let miembro: string | null = null;
    for (let guard = 0; guard < 64; guard++) {
      const acc = accessOf(n);
      if (acc) {
        if (miembro === null && isIdentifierLike(acc.member)) miembro = textOf(acc.member);
        n = acc.base;
        continue;
      }
      const down = indexBaseOf(n);
      if (down) {
        n = down;
        continue;
      }
      break;
    }
    return { raiz: n, miembro };
  };

  walk(fn.node, (n) => {
    if (!n.isNamed) return;

    // ── ESCRITURAS ────────────────────────────────────────────────────────
    if (ASSIGNMENT_NODE_WORD.test(n.type)) {
      for (const left of assignmentTargets(n)) {
        // El destino puede ser `X.m` o `X.m[i]` — en el segundo caso se baja
        // un nivel por la indexación antes de leer el miembro escrito.
        const bajado = indexBaseOf(left);
        const acc = accessOf(left) ?? (bajado ? accessOf(bajado) : null);
        if (acc && isIdentifierLike(acc.member)) {
          const nombre = textOf(acc.member);
          // `esUnoMismo`, NO `esAutoReferencia`: ver su docstring — una
          // variable de instancia que RECIBE la escritura es el colaborador,
          // no uno mismo.
          if (esUnoMismo(acc.base, language, receptores)) {
            propios.add(nombre);
          } else {
            const { raiz } = raizDe(acc.base);
            const clave = SELF_DATA_NODE_TYPE.test(raiz.type)
              ? bareName(textOf(raiz))
              : isIdentifierLike(raiz) && !esUnoMismo(raiz, language, receptores)
                ? textOf(raiz)
                : null;
            if (clave !== null) {
              let set = porReceptor.get(clave);
              if (!set) porReceptor.set(clave, (set = new Set<string>()));
              set.add(nombre);
            }
          }
        } else if (esAutoReferencia(left, language, receptores) || SELF_DATA_NODE_TYPE.test(left.type)) {
          propios.add(bareName(textOf(left)));
        }
      }
    }

    // ── ÓRDENES Y LECTURAS PROPIAS ────────────────────────────────────────
    const acc = accessOf(n);
    if (acc && isIdentifierLike(acc.member) && esAutoReferencia(acc.base, language, receptores)) {
      propios.add(textOf(acc.member));
    }
    if (SELF_DATA_NODE_TYPE.test(n.type)) propios.add(bareName(textOf(n)));

    // Una LLAMADA con argumentos sobre `X.m(...)` es una ORDEN al receptor `X`
    // — lo contrario de escribirle los campos. Es la señal de delegación.
    if (fieldOf(n, ARGUMENT_LIST_FIELDS)) {
      const target = fieldOf(n, CALL_TARGET_FIELDS);
      if (target) {
        const tacc = accessOf(target);
        if (tacc) {
          const { raiz } = raizDe(tacc.base);
          const clave = SELF_DATA_NODE_TYPE.test(raiz.type)
            ? bareName(textOf(raiz))
            : isIdentifierLike(raiz) && !esUnoMismo(raiz, language, receptores)
              ? textOf(raiz)
              : null;
          if (clave !== null) ordenes.set(clave, (ordenes.get(clave) ?? 0) + 1);
        }
      }
      // ¿construye algo? un nodo de creación de objeto dentro del cuerpo.
      if (/(^|_)(new|object_creation|instance_creation)(_|$)/.test(n.type)) construyeResultado = true;
    }
    if (/(^|_)(object_creation_expression|new_expression|instance_creation_expression)$/.test(n.type)) construyeResultado = true;
  });

  const destinos: DestinoEscrito[] = [...porReceptor.entries()]
    .filter(([receptor]) => !locales.has(receptor))
    .map(([receptor, miembros]) => ({ receptor, miembros: [...miembros], ordenes: ordenes.get(receptor) ?? 0 }))
    .sort((a, b) => b.miembros.length - a.miembros.length);

  return { fn, destinos, propios: propios.size, construyeResultado };
}

function medir(problem: Finding, ctx: HypothesisContext): MoveMemberProblem {
  const loc = problem.locations[0]!;
  const file = ctx.file ?? ctx.fileAt(loc.file);
  if (!file) {
    return { kind: problem.kind, file: loc.file, conArbol: false, candidatos: [], hermanosQueDelegan: [], locations: problem.locations };
  }

  // Alcance: para `feature-envy-intra` el hallazgo YA nombra un método
  // (`locations[0]` es su span). Para los dos anclas inter-file el hallazgo
  // es el ARCHIVO entero, así que se miran todos sus métodos. En los dos
  // casos el alcance es el del hallazgo, nunca más ancho.
  const enAlcance = (fn: FunctionUnit): boolean =>
    fn.startLine >= loc.startLine && fn.endLine <= loc.endLine;

  const medidos: MetodoMedido[] = [];
  for (const [i, fn] of file.functions.entries()) {
    if (!enAlcance(fn)) continue;
    if (anidadaEnOtraFuncion(file.functions, i)) continue;
    if (fn.metrics.isConstructor) continue; // un constructor que inicializa lo que recibe no está mal ubicado
    medidos.push(medirMetodo(fn, file.language));
  }

  const candidatos = medidos
    .filter((m) => (m.destinos[0]?.miembros.length ?? 0) >= MIN_MIEMBROS_ESCRITOS)
    .sort((a, b) => (b.destinos[0]?.miembros.length ?? 0) - (a.destinos[0]?.miembros.length ?? 0));

  // ── LA SOLUCIÓN PUEDE YA EXISTIR EN LOS HERMANOS ───────────────────────
  // Trampa ya pagada de la Ola AP: de 21 casos en disputa, en SIETE la
  // solución YA EXISTÍA en el código — "en otro tipo, en otro paquete, EN LOS
  // HERMANOS, en otro método". Acá se pregunta primero: ¿algún OTRO método
  // del mismo archivo ya le da la ORDEN a ese mismo receptor en vez de
  // escribirle los campos? Si sí, la API de delegación ya está escrita y el
  // trabajo no es inventarla: es usarla.
  const receptoresBuscados = new Set(candidatos.map((c) => c.destinos[0]!.receptor));
  const hermanos: { metodo: string; receptor: string }[] = [];
  // Las órdenes por receptor se recogen sobre TODOS los métodos medidos, no
  // sólo sobre los que escriben: un hermano que sólo delega no aparece en
  // `destinos` (no escribe nada), así que se vuelve a mirar acá.
  for (const m of medidos) {
    if (candidatos.includes(m)) continue;
    const language = file.language;
    const receptores = receiverNamesOf(m.fn.node);
    const vistos = new Set<string>();
    walk(m.fn.node, (n) => {
      if (!n.isNamed || !fieldOf(n, ARGUMENT_LIST_FIELDS)) return;
      const target = fieldOf(n, CALL_TARGET_FIELDS);
      if (!target) return;
      const tacc = accessOf(target);
      if (!tacc) return;
      let raiz: ProbeNode = tacc.base;
      for (let g = 0; g < 32; g++) {
        const a = accessOf(raiz);
        if (!a) break;
        raiz = a.base;
      }
      const clave = SELF_DATA_NODE_TYPE.test(raiz.type)
        ? bareName(textOf(raiz))
        : isIdentifierLike(raiz) && !esUnoMismo(raiz, language, receptores)
          ? textOf(raiz)
          : null;
      if (clave !== null && receptoresBuscados.has(clave) && !vistos.has(clave)) {
        vistos.add(clave);
        hermanos.push({ metodo: m.fn.name ?? "(anónima)", receptor: clave });
      }
    });
  }

  return { kind: problem.kind, file: loc.file, conArbol: true, candidatos, hermanosQueDelegan: hermanos, locations: problem.locations };
}

/* ══════════════════════════════════════════════════════════════════════════
 * LOS CHECKS
 * ══════════════════════════════════════════════════════════════════════════ */

const escrituraDeEstadoAjeno: Check<MoveMemberProblem, CodeGraph | null> = {
  id: "escritura-de-estado-ajeno",
  describe: "Un método del alcance le ASIGNA dos o más miembros distintos a un mismo objeto que no es él",
  run(p) {
    if (!p.conArbol) {
      return { holds: false, evidence: "No hubo árbol vivo de este archivo en esta corrida: la asignación cruzada es un hecho del texto y sin texto no se afirma." };
    }
    const mejor = p.candidatos[0];
    if (!mejor) {
      return {
        holds: false,
        evidence:
          "Ningún método del alcance asigna dos o más miembros distintos de un mismo objeto ajeno. Leer datos de otra unidad " +
          "no alcanza: leer es el trabajo declarado de un mapeador, de un serializador y de un hook polimórfico, que son las " +
          "cuatro familias de falsos que este ancla produce.",
      };
    }
    const d = mejor.destinos[0]!;
    return {
      holds: true,
      evidence:
        `"${mejor.fn.name ?? "(anónima)"}" (líneas ${mejor.fn.startLine}-${mejor.fn.endLine}) asigna ${d.miembros.length} ` +
        `miembros distintos de "${d.receptor}": ${d.miembros.join(", ")}. Escribir el estado de otro objeto es hacer su trabajo ` +
        "en su lugar, y se ve abriendo el archivo.",
    };
  },
};

const destinoUnico: Check<MoveMemberProblem, CodeGraph | null> = {
  id: "destino-unico",
  describe: "Las escrituras de ese método se concentran en UN solo objeto destino",
  run(p) {
    const mejor = p.candidatos[0];
    if (!mejor) return { holds: false, evidence: "No hay método candidato del que mirar el destino." };
    const conUmbral = mejor.destinos.filter((d) => d.miembros.length >= MIN_MIEMBROS_ESCRITOS);
    if (conUmbral.length !== 1) {
      return {
        holds: false,
        evidence:
          `El método escribe miembros de ${conUmbral.length} objetos distintos (${conUmbral.map((d) => `"${d.receptor}"`).join(", ")}): ` +
          "sin un único destino no hay a dónde mudar el miembro, y la propuesta no podría nombrar el lugar.",
      };
    }
    return { holds: true, evidence: `Un único destino: "${conUmbral[0]!.receptor}".` };
  },
};

const masEscrituraAjenaQueEstadoPropio: Check<MoveMemberProblem, CodeGraph | null> = {
  id: "mas-escritura-ajena-que-estado-propio",
  describe: "El método toca más estado del destino que estado propio",
  run(p) {
    const mejor = p.candidatos[0];
    if (!mejor) return { holds: false, evidence: "Sin candidato." };
    const ajenos = mejor.destinos[0]!.miembros.length;
    if (ajenos <= mejor.propios) {
      return { holds: false, evidence: `Escribe ${ajenos} miembros ajenos y toca ${mejor.propios} propios: el método sigue teniendo trabajo propio.` };
    }
    return { holds: true, evidence: `Escribe ${ajenos} miembros ajenos contra ${mejor.propios} propios.` };
  },
};

const noEnsamblaUnResultado: Check<MoveMemberProblem, CodeGraph | null> = {
  id: "no-ensambla-un-resultado",
  describe: "El método no construye un objeto nuevo (no es un mapeador/ensamblador)",
  run(p) {
    const mejor = p.candidatos[0];
    if (!mejor) return { holds: false, evidence: "Sin candidato." };
    if (mejor.construyeResultado) {
      return {
        holds: false,
        evidence:
          "El cuerpo instancia un objeto: es la forma del MAPEADOR/ENSAMBLADOR, la familia de falsos más grande de este ancla " +
          "(7 de los 18 falsos vigentes juzgados). Traducir de un tipo a otro es su trabajo declarado, no lógica mal ubicada.",
      };
    }
    return { holds: true, evidence: "El cuerpo no instancia nada: no está traduciendo de un tipo a otro." };
  },
};

const escrituraAmplia: Check<MoveMemberProblem, CodeGraph | null> = {
  id: "escritura-amplia",
  describe: "Le escribe tres o más miembros distintos al destino",
  run(p) {
    const n = p.candidatos[0]?.destinos[0]?.miembros.length ?? 0;
    return n >= 3
      ? { holds: true, evidence: `${n} miembros distintos escritos.` }
      : { holds: false, evidence: `${n} miembros distintos escritos: dos es el piso, tres o más es lo que hace del método una operación del destino.` };
  },
};

/* ══════════════════════════════════════════════════════════════════════════
 * `appliedState` — LA PRIMERA PREGUNTA, NO LA ÚLTIMA
 * ══════════════════════════════════════════════════════════════════════════ */

const YA_LABEL = "La operación ya existe del lado del destino";
const PARCIAL_LABEL = "El método ya delega en parte y escribe en parte";

function appliedState(p: MoveMemberProblem): AppliedStateResult {
  const mejor = p.candidatos[0];
  if (!mejor) {
    return { state: "ausente", checks: [{ label: YA_LABEL, passed: false, why: "Sin candidato que evaluar.", role: "applied" }] };
  }
  const receptor = mejor.destinos[0]!.receptor;

  const hermano = p.hermanosQueDelegan.find((h) => h.receptor === receptor);
  if (hermano) {
    return {
      state: "ya-aplicado",
      checks: [
        {
          label: YA_LABEL,
          passed: true,
          why:
            `"${hermano.metodo}", en este mismo archivo, le da una ORDEN a "${receptor}" en vez de escribirle los campos: la API ` +
            "que recibiría este movimiento YA EXISTE del lado del destino y este método la esquiva. El trabajo no es crearla, es usarla.",
          role: "applied",
        },
      ],
    };
  }

  if (mejor.destinos[0]!.ordenes > 0) {
    return {
      state: "parcial",
      checks: [
        {
          label: PARCIAL_LABEL,
          passed: true,
          why:
            `El propio método le da ${mejor.destinos[0]!.ordenes} orden(es) a "${receptor}" y además le escribe ` +
            `${mejor.destinos[0]!.miembros.length} miembros: la delegación empezó y quedó a medias.`,
          role: "applied",
        },
      ],
    };
  }

  return {
    state: "ausente",
    checks: [
      {
        label: YA_LABEL,
        passed: false,
        why:
          `Ni este método ni ningún hermano del archivo le da una orden a "${receptor}": no hay una operación del destino que ` +
          "reciba este movimiento, hay que escribirla.",
        role: "applied",
      },
    ],
  };
}

const SOURCE =
  'Fowler, Refactoring, "Move Method" / "Move Field" (2.ª ed., cap. 8) — ' +
  "refactoring.guru/es/move-method y /es/move-field: un miembro que trabaja sobre los datos de otra clase más que sobre los " +
  "propios pertenece a esa clase.";

const TO_CONFIRM: readonly string[] = [
  "Confirmar que el objeto destino es un tipo de ESTE repo y no una interfaz de configuración, un DTO del framework o un tipo " +
    "de una biblioteca: a un tipo ajeno no se le puede mudar nada, y `refactoring.guru` lo pone como el primer 'cuándo NO conviene'.",
  "Si el método es un HOOK polimórfico (redefine uno de la superclase y el despacho lo decide la subclase), moverlo rompe el " +
    "despacho: el parámetro es el material del hook por diseño.",
  "Si el destino es una clase de DATOS a propósito (un registro, un value object, una fila), moverle comportamiento le mete " +
    "responsabilidades que se le quitaron adrede — el caso de presentación sobre una clase de datos.",
  "Si las escrituras son la INICIALIZACIÓN del objeto (armarlo recién creado), el remedio barato es un constructor o un " +
    "método de fábrica en el destino, no mudar este método entero.",
  "Si el destino ya expone una operación equivalente, esto no es un `Move Method`: es reemplazar tres asignaciones por una llamada.",
];

function buildSpec(): HypothesisSpec<MoveMemberProblem, CodeGraph | null> {
  return {
    pattern: "Move Member",
    ceiling: "media",
    needs: ["unidad-tipo-clase"],
    required: [escrituraDeEstadoAjeno, destinoUnico],
    discriminators: [masEscrituraAjenaQueEstadoPropio, noEnsamblaUnResultado, escrituraAmplia],
    appliedState: (p) => appliedState(p),
    toConfirm: TO_CONFIRM,
    source: SOURCE,
  };
}

function lugares(p: MoveMemberProblem): readonly RoleLocation[] {
  const mejor = p.candidatos[0];
  if (!mejor) return p.locations;
  const d = mejor.destinos[0]!;
  return [
    {
      file: p.file,
      startLine: mejor.fn.startLine,
      endLine: mejor.fn.endLine,
      symbol: mejor.fn.name ?? undefined,
      role: `miembro que escribe ${d.miembros.length} campos de "${d.receptor}" (${d.miembros.join(", ")})`,
    },
  ];
}

/* ══════════════════════════════════════════════════════════════════════════
 * LA TRAZA DEL EMBUDO — mismo mecanismo y mismo default (`null` = costo cero)
 * que `engine.ts#startArbitrationTrace` y `value-object.ts#startValueObjectTrace`.
 * ══════════════════════════════════════════════════════════════════════════ */

export interface MoveMemberTraceEntry {
  readonly findingId: string;
  readonly kind: string;
  readonly file: string;
  readonly line: number;
  readonly conArbol: boolean;
  readonly candidatos: number;
  readonly miembrosEscritos: number;
  readonly checks: readonly { readonly id: string; readonly holds: boolean }[];
  readonly diesAt: string | null;
  readonly appliedState: string;
  readonly emitted: boolean;
}

let trace: MoveMemberTraceEntry[] | null = null;

export function startMoveMemberTrace(): void {
  trace = [];
}

export function takeMoveMemberTrace(): readonly MoveMemberTraceEntry[] {
  const t = trace ?? [];
  trace = null;
  return t;
}

export const hypothesis: HypothesisBuilder = {
  id: "move-member",
  pattern: "Move Member",
  layer: "refactorizacion",
  anchors: [ANCHOR_ENVY_INTRA, ANCHOR_ENVY_INTER, ANCHOR_INTIMACY],
  build(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext) {
    const p = medir(problem, ctx);
    const spec = buildSpec();
    const outcome = runEngine(spec, ctx.capabilities, p, graph);
    if (trace) {
      const checks = spec.required.map((c) => ({ id: c.id, holds: c.run(p, graph).holds }));
      trace.push({
        findingId: problem.id ?? "",
        kind: problem.kind,
        file: p.file,
        line: problem.locations[0]?.startLine ?? 0,
        conArbol: p.conArbol,
        candidatos: p.candidatos.length,
        miembrosEscritos: p.candidatos[0]?.destinos[0]?.miembros.length ?? 0,
        checks,
        diesAt: checks.find((c) => !c.holds)?.id ?? null,
        appliedState: spec.appliedState(p, graph).state,
        emitted: outcome !== null,
      });
    }
    if (!outcome) return null;
    return toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places: lugares(p),
      cost:
        "Mover el miembro (o sólo la parte que escribe el estado ajeno) a la clase que tiene esos campos, y dejar en su lugar " +
        "una llamada. Se paga una vez; a cambio, la clase destino vuelve a ser la única que decide sobre su propio estado y el " +
        "ida y vuelta entre las dos desaparece.",
    });
  },
};
