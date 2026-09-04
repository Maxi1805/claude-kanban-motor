/**
 * `homonymous-delegation` — Ola 11a, P2 (registro de pendientes "Problema 2":
 * los 12 rojos de `hypotheses/hypothesis-state-gate.test.ts`, Decorator×6).
 *
 * EL HUECO QUE CIERRA — verificado corriendo `analyzeRepo` real sobre
 * `tests/fixtures/patterns/decorator/` (`scripts/measure-p2-wrapping-diagnosis.mts`):
 * la fixture canónica (Decorator BIEN aplicado — `ColorDecorator` reenvía
 * `area()`/`describe()` a `this.shape.area()`/`this.shape.describe()`) NO
 * produce NINGÚN `Finding` — 0 en las 6 variantes de lenguaje. Los 6 anclas
 * de `hypotheses/decorator.ts` (`flag-accumulator`, `boolean-flag-param`,
 * `boolean-complexity`, `long-parameter-list`, `large-class`,
 * `refused-bequest`) son todos OLORES intra-function/intra-file — una clase
 * chica y limpia que YA compone con un colaborador no dispara ninguno
 * (`large-class` exige ~47 miembros — `derivado(floor:47,...)` —,
 * `refused-bequest` exige un override que ANULA comportamiento heredado, y
 * `ColorDecorator` no anula nada, delega). Sin `Finding` ancla,
 * `run.ts:159` (`anchors.includes(finding.kind)`) corta antes de que
 * `hypotheses/decorator.ts#build()` corra siquiera — y ese archivo YA sabe
 * calcular la forma COMPLETA/PARCIAL/AUSENTE (`classDelegationLevel`/
 * `goDelegationLevel`/`fileWideDelegationLevel`, ver su propio docstring,
 * sección "ANCLAS ESTRUCTURALES NUEVAS": *"una clase limpia (como
 * ColorDecorator, sin ningún olor) todavía no dispara nada — nadie la marca
 * como candidata todavía porque ningún detector encuentra un problema en
 * ella"* — declarado ahí, sin cerrar, hasta esta tarea).
 *
 * LA SALIDA — declarada, no de contrabando (instrucción 3 del encargo): no
 * hay olor que inventar (el código está BIEN, no mal) — el detector que
 * faltaba es uno que reconozca la FORMA de la envoltura misma, no un
 * problema. Mismo reparto de trabajo que `lazy-init-repetida.ts` (Proxy) y
 * `manual-notification.ts` (Observer), Ola 10: el detector confirma la
 * FORMA cruda (¿existe reenvío homónimo?), `hypotheses/decorator.ts` decide
 * el `PatternState` exacto (nivel/aridad/grafo, sin cambios en esa lógica).
 *
 * RELACIÓN, ESTRUCTURAL — mismo criterio que `hypotheses/decorator.ts`
 * declara para su propio excluder de `ya-aplicado`/`parcial` (regla 4: por
 * AST, no por vocabulario de nombres de campo): un miembro `m` de una unidad
 * (clase, struct Go por receptor, o función de orden superior sin clase)
 * reenvía a `<colaborador>.m(...)` — el MISMO nombre `m` en ambos lados,
 * verificado por texto normalizado del cuerpo (misma técnica exacta que
 * `hypotheses/decorator.ts#ownFieldSameNameCall`/`#paramSameNameCall`,
 * DUPLICADA acá a propósito — `detect/*` no puede importar de `hypotheses/*`,
 * capas invertidas, mismo argumento que ya documentan
 * `lazy-init-repetida.ts`/`manual-notification.ts` para su propia
 * duplicación desde `hypotheses/proxy.ts`).
 *
 * TRES RUTAS — las mismas tres formas que `hypotheses/decorator.ts` ya
 * reconoce, y que la fixture canónica ejercita en sus 6 lenguajes:
 *   1. CLASE (TS/JS/Python/Ruby): un método reenvía a `this.<campo>.<mismo
 *      nombre>()` / `self.<campo>.<mismo nombre>()` / `@<campo>.<mismo
 *      nombre>`.
 *   2. GO (receptor, sin nodo de clase): un método con receptor de tipo `T`
 *      reenvía a `<receptor>.<campo>.<mismo nombre>()`.
 *   3. FUNCIONAL (Vue Composition API, sin clase ni receptor): una función
 *      de orden superior retorna un objeto literal cuyas claves reenvían
 *      homónimamente a un parámetro capturado (`shape.area()` dentro de la
 *      clave `area:`).
 *
 * PRESENCIA, NO MAGNITUD (mismo caso ya declarado por `refused-bequest.ts`/
 * `empty-catch.ts`): un solo reenvío homónimo ya es candidato a mirar — la
 * MAGNITUD (1 reenvío ⇒ `parcial`, ≥2 ⇒ `ya-aplicado`) la decide
 * `hypotheses/decorator.ts` con su propio análisis (re-derivado de cero
 * sobre el árbol vivo real en producción, nunca leído de este detector), no
 * este umbral.
 *
 * CONTROL NEGATIVO, verificado contra la fixture: un colaborador con nombre
 * de método DISTINTO (`this.logger.info()` dentro de `generate()`) NO
 * dispara — mismo criterio de "mismo nombre en ambos lados" que
 * `hypotheses/decorator.ts` exige, no una heurística más floja.
 *
 * ARREGLO (Ola N, frente A5b) — EL CANDIDATO ES SÓLO UNA CLAVE DE UN DICT
 * COMPUESTO MÁS GRANDE, no el valor terminal reenviado: falso medido con
 * causa escrita en la planilla de veredictos, `to_info_dict → self.type
 * .to_info_dict()` — el método arma un dict con VARIAS claves (`{"type":
 * self.type.to_info_dict(), "id": self.id, ...}`); el candidato es una
 * FUENTE entre varias, no el resultado de la función. Ver
 * "ANCLA-EQUIVOCADA #5" (`hasKeyValueShape`, más abajo) para el mecanismo:
 * misma introspección por FORMA de par clave/valor que
 * `self-referential-member.ts#pairValueSelfReference` ya prueba, umbral en
 * DOS O MÁS pares hermanos (un dict de una sola clave que envuelve el
 * candidato entero sigue contando como reenvío — sin evidencia medida de lo
 * contrario). El tercer falso de la planilla (`@cache` es un Hash PLANO
 * (`{}` literal), no un objeto de dominio envuelto) queda SIN cerrar: exige
 * rastrear la asignación del campo hasta su inicializador en el
 * constructor (¿`@cache = {}` o `@cache = Cache.new`?), una forma
 * estructural distinta de las cinco anclas de arriba y sin un segundo caso
 * medido en el corpus para verificar el mecanismo — declarado, no
 * escondido (ver el informe de la tarea).
 */
import { presencia } from "../thresholds.js";
import { walkTree } from "../tree-walk.js";
import type { AstNode, FileUnit, FunctionUnit, IntraFileDetector, RawFinding, RunContext } from "../types.js";

type ThresholdKey = "forwards";

/** Mismo vocabulario que `hypotheses/decorator.ts#SELF_WORDS`. */
const SELF_WORDS = ["this", "self"];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed) out.push(c);
  }
  return out;
}

function findDescendant(node: AstNode, pred: (n: AstNode) => boolean, maxDepth = 8): AstNode | null {
  if (pred(node)) return node;
  if (maxDepth <= 0) return null;
  for (const c of namedChildren(node)) {
    const hit = findDescendant(c, pred, maxDepth - 1);
    if (hit) return hit;
  }
  return null;
}

/** Todos los descendientes (incluido `node`) que cumplen `pred`, acotados en
 *  profundidad — misma forma que `hypotheses/decorator.ts` ya trae. */
function findAllDescendants(node: AstNode, pred: (n: AstNode) => boolean, maxDepth: number, out: AstNode[]): void {
  if (pred(node)) out.push(node);
  if (maxDepth <= 0) return;
  for (const c of namedChildren(node)) findAllDescendants(c, pred, maxDepth - 1, out);
}

/**
 * *** ANCLA-EQUIVOCADA — lectura de propiedad confundida con llamada (ola de
 * precisión posterior a la Ola D, frente Decorator; MISMO arreglo que
 * `hypotheses/decorator.ts#CALL_NODE_TYPE`, ver su docstring para el
 * razonamiento completo verificado por sonda). Resumen: en TS/JS/Python una
 * lectura de propiedad (`source.id`) y una llamada (`shape.area()`) son
 * nodos de tipo DISTINTO (`member_expression`/`attribute` vs
 * `call_expression`/`call`), pero comparten la MISMA forma textual salvo
 * paréntesis — matchear por texto crudo (la versión anterior) confundía
 * mappers puros (`toGraph`, `censusOf`, …) con reenvío real. En Ruby,
 * `@shape.area` SIN paréntesis SÍ produce un nodo `call` (no existe un nodo
 * de "propiedad" distinto en su gramática) — por eso la regla es "¿el nodo
 * ES una llamada?" (verificado por AST, `CALL_NODE_TYPE`), no "¿tiene
 * paréntesis?".
 */
/**
 * *** OLA W (W4) — POR QUÉ ESTE REGEX GANA `invocation`: ERA LA MITAD DE LA
 * CEGUERA EN JAVA Y C#, EL 91 % DEL VOLUMEN DEL CORPUS ***
 * `/call/i` nombra el nodo de invocación de JS/TS (`call_expression`), Python
 * (`call`), Ruby (`call`) y Go (`call_expression`) — y de NINGUNA de las dos
 * gramáticas que dominan el corpus: Java escribe `method_invocation` y C#
 * `invocation_expression`. Ninguno de los dos contiene "call", así que
 * `findAllDescendants(…, CALL_NODE_TYPE)` devolvía SIEMPRE la lista vacía y
 * este detector entero era código muerto en esos dos lenguajes.
 *
 * MEDIDO EN ESTE ÁRBOL antes de tocar nada, no leído de un informe:
 * `scripts/dump-hallazgos.mts` sobre `corpus/guava` (1.971 archivos) y
 * `corpus/newtonsoft-json` daba **0 y 0** hallazgos de `homonymous-delegation`,
 * y `corpus/guava` **0** hipótesis de Decorator de cualquier estado — con la
 * familia `Forwarding*` de `com.google.common.collect` (la implementación de
 * Decorator más citada de la industria, 14+ clases) adentro del repo.
 *
 * El archivo hermano `hypotheses/decorator.ts#CALL_NODE_TYPE` ya había hecho
 * exactamente este cambio en la Ola U (N4) y dejó escrito el razonamiento con
 * la sonda contra `tree-sitter-java.wasm`; el ANCLA quedó sin dueño desde
 * entonces, así que la hipótesis arreglada no se ejercitaba nunca (sin
 * `Finding` ancla, `run.ts` corta antes de `build()`).
 *
 * "invocation" es vocabulario de GRAMÁTICA (cómo tree-sitter nombra el nodo),
 * del mismo estatus que "call": sigue siendo UNA pregunta ("¿este nodo ES una
 * invocación?") resuelta por substring del TIPO, no una regla por lenguaje ni
 * léxico de dominio.
 */
const CALL_NODE_TYPE = /call|invocation/i;

/**
 * *** ANCLA-EQUIVOCADA #2 — el candidato ENCADENA MÁS ALLÁ, verificado sobre
 * el corpus de 8 lenguajes (jekyll, Ruby), esta tarea. `(?![\w.])` (arriba)
 * protege el TEXTO PROPIO de un nodo-llamada, pero un nodo-llamada Ruby anida
 * llamadas SIN paréntesis como nodos `call` propios: en `@obj.collection.label`
 * el nodo interno `@obj.collection` es un `call` completo con su propio texto
 * ("@obj.collection", sin nada detrás DENTRO de ESE nodo) — el ancla `(?![\w.])`
 * se cumple trivialmente ahí aunque, en la expresión completa, ".label" venga
 * después. Confirmado leyendo `lib/jekyll/drops/document_drop.rb:20-22` y su
 * hermano casi idéntico `url_drop.rb:13-15` (`def collection; @obj.collection.label;
 * end` — lo que el método REALMENTE devuelve es el label, un String, no el
 * resultado de reenviar `collection`) y `site_drop.rb:27-29` (`@obj.posts.docs.sort
 * {…}`, un Array ordenado, no el resultado de `posts`). Una forma más del
 * MISMO error, no encadenamiento sino EMBEBIDO EN UN STRING: `layout.rb:51-53`
 * (`"#<#{self.class} @path=#{@path.inspect}>"` — el candidato vive DENTRO de
 * una interpolación de string, el valor devuelto es la cadena armada, no
 * `@path.inspect`). Las tres formas comparten el mismo diagnóstico: el
 * candidato no es el valor TERMINAL que el miembro reenvía, alimenta otra
 * operación. `isFedIntoFurtherOperation` (abajo) lo verifica recorriendo el
 * `bodyNode` ENTERO en busca de un nodo contenedor real — nunca por nombre de
 * nodo salvo por SUBSTRING de gramática (`CALL_NODE_TYPE`/`INTERPOLATION_NODE_TYPE`,
 * mismo criterio que ya usa `CALL_NODE_TYPE`), nunca por identidad de objeto
 * (dos llamadas a `childForFieldName` pueden devolver wrappers distintos del
 * mismo nodo lógico — mismo problema que documenta
 * `demeter-chain.ts#positionKey` — por eso se compara POSICIÓN, no `===`).
 *
 * CONTROL NEGATIVO, verificado a mano contra `thread_event.rb:24-28`
 * (`@lock.synchronize do @cond.wait(@lock) unless @flag end`) y
 * `markdown.rb:83-88` (`@cache.getset(content) do @parser.convert(content) end`):
 * el candidato vive dentro de un BLOQUE Ruby (`do…end`) pasado como bloque a
 * OTRA llamada (`synchronize`/`getset`), no como receptor encadenado — el
 * único campo que `isFedIntoFurtherOperation` revisa (`BASE_FIELDS`) no
 * contiene el bloque, así que los dos casos siguen clasificando VERDADERO
 * tras el arreglo, sin regresión.
 *
 * *** INTENTADO Y DESCARTADO — excluir TAMBIÉN el candidato-como-ARGUMENTO de
 * otra llamada (`Constructor.new(candidato)`) ***. Verificado inicialmente
 * sobre `unified_payload_drop.rb:19-21` (`@theme_drop ||= ThemeDrop.new(@obj.theme)
 * if @obj.theme` — el valor devuelto es un `ThemeDrop`, no `@obj.theme`), pero
 * un contraejemplo real sobre OTRO lenguaje del corpus (Python, click) tumbó
 * la exclusión: `testing.py#EchoingStdin.read` — `return
 * self._echo(self._input.read(n))` — el candidato (`self._input.read(n)`) es
 * TAMBIÉN argumento de otra llamada (`self._echo(...)`), pero `_echo` es un
 * PASS-THROUGH (`testing.py:45-49`, devuelve `rv` sin modificar): el reenvío
 * SÍ es real, sólo pasa por un efecto secundario propio antes de volver —
 * misma forma que `render()`/`measure_time do…end` de Ruby (control negativo
 * de arriba, que sí valida). Distinguir "argumento de un constructor que crea
 * otro tipo" de "argumento de un helper propio que hace pass-through" exigiría
 * inspeccionar el CUERPO de la llamada envolvente — información que un
 * detector `intra-file` no tiene si ese cuerpo vive en otro archivo. Se
 * descarta la exclusión por argumento: cuesta un falso negativo confirmado
 * (`EchoingStdin.read`) por cada falso positivo que arregla
 * (`UnifiedPayloadDrop#theme`), sin ganancia neta medida.
 */
const INTERPOLATION_NODE_TYPE = /interpolation|template/i;
/** Mismos campos genéricos de "base de acceso" que `demeter-chain.ts#BASE_FIELDS`, más `function` (el candidato como CALLEE de otra llamada). */
const BASE_FIELDS = ["object", "operand", "receiver", "expression", "function"];

/**
 * *** ANCLA-EQUIVOCADA #5 — el candidato es SÓLO UNA clave de un valor
 * compuesto MÁS GRANDE, no el valor terminal que el miembro reenvía.
 * Verificado con causa escrita en la planilla de veredictos (Ola N, frente
 * A5b): `to_info_dict` → `self.type.to_info_dict()` es sólo una de VARIAS
 * claves de un dict que la propia función arma y retorna (`{"type":
 * self.type.to_info_dict(), "id": self.id, ...}`) — el método no reenvía su
 * propio comportamiento, CONSTRUYE algo nuevo a partir de varias fuentes.
 *
 * Misma introspección por FORMA de campo (`childForFieldName("key")` /
 * `("value")`, NUNCA por nombre de nodo tipo `pair`) que
 * `self-referential-member.ts#pairValueSelfReference` ya usa — generaliza
 * sin bifurcar por gramática: `pair` (objeto JS/TS, dict Python, hash Ruby)
 * y, en Ruby, los argumentos con nombre de una llamada (`class_name:
 * 'Folder'`) comparten la MISMA forma estructural.
 *
 * El umbral es DOS O MÁS pares hermanos, no uno: un único par que ENVUELVE
 * la llamada entera (`return {"result": self.shape.area()}`) no tiene
 * evidencia medida de ser una construcción distinta — podría ser el mismo
 * reenvío con un envoltorio de una sola clave — así que sólo se excluye
 * cuando hay al menos OTRA clave hermana compitiendo por la misma
 * construcción (la señal real de "esto arma algo con varias fuentes", no
 * "esto envuelve un solo reenvío"). Ver el docstring del módulo, sección
 * "ANCLA-EQUIVOCADA #5", y `homonymous-delegation.test.ts` para el control
 * negativo (dict de una sola clave, SIGUE detectado) junto al caso real
 * (dict de dos o más claves, ya NO detectado).
 */
function hasKeyValueShape(n: AstNode): boolean {
  return (n.childForFieldName("key") as AstNode | null) != null && (n.childForFieldName("value") as AstNode | null) != null;
}

function containsSpan(container: AstNode, target: AstNode): boolean {
  const startsBefore =
    container.startPosition.row < target.startPosition.row ||
    (container.startPosition.row === target.startPosition.row && container.startPosition.column <= target.startPosition.column);
  const endsAfter =
    container.endPosition.row > target.endPosition.row ||
    (container.endPosition.row === target.endPosition.row && container.endPosition.column >= target.endPosition.column);
  return startsBefore && endsAfter;
}

function sameSpan(a: AstNode, b: AstNode): boolean {
  return (
    a.startPosition.row === b.startPosition.row &&
    a.startPosition.column === b.startPosition.column &&
    a.endPosition.row === b.endPosition.row &&
    a.endPosition.column === b.endPosition.column
  );
}

/** `true` si `candidate` alimenta OTRA operación en vez de ser el valor
 *  terminal que `scope` reenvía — ver el docstring de arriba para los 3 casos
 *  reales que esto excluye y los 2 de control que NO excluye (y por qué NO
 *  incluye "candidato como argumento de otra llamada", intentado y
 *  descartado, mismo docstring). */
function isFedIntoFurtherOperation(candidate: AstNode, scope: AstNode): boolean {
  let found = false;
  const visit = (n: AstNode): void => {
    if (found) return;
    if (INTERPOLATION_NODE_TYPE.test(n.type) && containsSpan(n, candidate) && !sameSpan(n, candidate)) {
      found = true;
      return;
    }
    if (CALL_NODE_TYPE.test(n.type)) {
      for (const field of BASE_FIELDS) {
        const child = n.childForFieldName(field) as AstNode | null;
        if (child && containsSpan(child, candidate)) {
          found = true;
          return;
        }
      }
    }
    // ANCLA-EQUIVOCADA #5 (ver docstring arriba de `hasKeyValueShape`): el
    // candidato es el VALOR de un par clave/valor que tiene ≥2 hermanos del
    // mismo tipo — evidencia de que el nodo que los contiene arma un valor
    // compuesto con varias fuentes, no que reenvía UNA sola.
    const pairSiblings = namedChildren(n).filter(hasKeyValueShape);
    if (pairSiblings.length >= 2) {
      for (const pair of pairSiblings) {
        const value = pair.childForFieldName("value") as AstNode | null;
        if (value && containsSpan(value, candidate)) {
          found = true;
          return;
        }
      }
    }
    for (const c of namedChildren(n)) visit(c);
  };
  visit(scope);
  return found;
}

/**
 * *** ANCLA-EQUIVOCADA #3 — reflexión confundida con colaborador, verificado
 * sobre `lib/jekyll/converter.rb:43-45` (`def highlighter_prefix;
 * self.class.highlighter_prefix; end`). `self.class`/`this.constructor` no
 * son un colaborador propio: son el objeto reflexionando sobre SÍ MISMO
 * (metaclase), lo mismo que `SELF_WORDS` ya excluye para el receptor —
 * léxico de GRAMÁTICA de un lenguaje (todo objeto Ruby responde a `.class`,
 * todo objeto JS/TS a `.constructor`), no léxico de dominio.
 */
/**
 * *** OLA W (W4) — `super` ENTRA A ESTE MISMO CONJUNTO, y sin él la forma
 * ACCESSOR de abajo habría sido un generador de falsos masivo ***
 * MEDIDO antes de correr nada: `grep -rc "super()\." --include=*.py` sobre
 * `corpus/click` + `corpus/sqlalchemy` da **566** apariciones, la enorme
 * mayoría `super().__init__(...)` DENTRO de `__init__` — o sea reenvío
 * homónimo perfecto por texto. Pero `super()` no es un colaborador: es la
 * MISMA instancia mirando su cadena de herencia, exactamente el mismo caso que
 * `self.class`/`this.constructor` que este conjunto ya excluía (ANCLA-EQUIVOCADA
 * #3). Decorator compone, no hereda: reenviar a la superclase no es envolver
 * otra instancia.
 *
 * Es léxico de GRAMÁTICA (toda gramática con herencia escribe `super`), no de
 * dominio. `hypotheses/decorator.ts` no lo necesita porque su
 * `classInjectsField` ya exige que el colaborador sea un campo inyectado o un
 * accessor declarado sin cuerpo, y `super` no es ninguno de los dos — este
 * detector, que sólo mira la forma cruda, sí.
 */
/**
 * *** OLA W (W4) — `getClass`/`GetType`: LA MISMA REFLEXIÓN, ESCRITA COMO
 * MÉTODO, que es la forma que Java y C# usan ***
 * Medido sobre el primer volcado con la forma ACCESSOR encendida:
 * `corpus/newtonsoft-json Src/Newtonsoft.Json/Serialization/NamingStrategy.cs:
 * 109` salió como *"`NamingStrategy` reenvía homónimamente `GetHashCode` a su
 * colaborador propio `GetType`"* — y `GetType()` no es un colaborador: es
 * `self.class`/`this.constructor` escrito como llamada, que es lo único que la
 * forma ACCESSOR cambia. Java escribe `getClass()`, C# `GetType()`, Ruby
 * `.class`, JS `.constructor`: las cuatro son el MISMO miembro del protocolo de
 * objetos del lenguaje, y ANCLA-EQUIVOCADA #3 ya excluía las dos que se
 * escriben sin paréntesis. Mismo estatus de vocabulario que
 * `hypotheses/decorator.ts#CATCH_ALL_FORWARDER_NAMES` (`__getattr__`,
 * `method_missing`): protocolo de objetos, no léxico de dominio.
 */
const REFLECTIVE_FIELD_NAMES: ReadonlySet<string> = new Set(["class", "constructor", "super", "getClass", "GetType"]);

/**
 * *** ANCLA-EQUIVOCADA #4 — sufijo `!`/`?` de Ruby confundido con el mismo
 * método, verificado sobre `lib/jekyll/inclusion.rb:14-21`
 * (`def render(context); …; @template.render!(context); …; end`). El
 * segundo anclaje ya excluía "seguido de letra/dígito/guion-bajo/punto"
 * (`(?![\w.])`) pero Ruby permite CERRAR un identificador de método con `!`
 * o `?` (`render!`, `valid?`) — caracteres que no son `\w` ni `.`, así que el
 * ancla los dejaba pasar: "render" matcheaba como PREFIJO de "render!", dos
 * métodos DISTINTOS por convención Ruby (la versión con `!` señala una
 * variante peligrosa/mutante). Arreglo: sumar `!`/`?` al mismo negative
 * lookahead (`(?![\w.!?])`, las tres apariciones de este archivo) — mismo
 * criterio genérico de "no seguido de más identificador", ahora completo
 * para la gramática de Ruby.
 */

/**
 * `true` (y el nombre del campo/colaborador) si el cuerpo reenvía a
 * `selfName.<campo>.<memberName>(` (this/self, receptor Go) o
 * `@campo.<memberName>` (Ruby, sin receptor explícito) — MISMO criterio
 * exacto que `hypotheses/decorator.ts#ownFieldSameNameCall` (duplicada, ver
 * docstring del módulo): sólo nodos que SON una llamada (`CALL_NODE_TYPE`)
 * entran en la comparación, nunca el texto crudo del cuerpo entero. El
 * segundo anclaje (`(?![\w.])`, "ni un carácter de palabra ni un punto")
 * exige que `memberName` sea el identificador COMPLETO y el ÚLTIMO segmento
 * antes de invocar — ni un prefijo de un identificador más largo (`node`
 * dentro de `nodeById`) ni un campo intermedio de una cadena más larga
 * (`index.nodeById.get(id)` no debe matchear ni "node" ni "nodeById" como si
 * fueran el método invocado) — SIN excluir ninguna sintaxis de invocación
 * real (paréntesis, fin de texto, o un BLOQUE Ruby `{ … }`/`do … end`:
 * `@numbers.each { |n| yield n }` — caso real medido contra el censo
 * congelado de fixtures — tampoco es un carácter de palabra ni un punto lo
 * que sigue a "each". Ver el docstring homónimo en `hypotheses/decorator.ts`
 * para las tres iteraciones que llevaron a esta forma final). SEGUIDO de los
 * dos filtros de esta tarea (ver los dos docstrings arriba): un candidato que
 * matchea el texto pero está embebido en otra operación, o cuyo campo es
 * reflexivo, se DESCARTA y se sigue probando el resto de `calls` — nunca se
 * devuelve el primer match a ciegas.
 */
/**
 * *** OLA W (W4) — EL COLABORADOR TAMBIÉN PUEDE VENIR DE UN ACCESSOR, y sin
 * esto arreglar `CALL_NODE_TYPE` no alcanza ***
 * `PLAN-INTENCIONES.md` §6 define el colaborador como *"un campo O ACCESSOR"*
 * y `hypotheses/decorator.ts#ownCollaboratorSameNameCall` ya reconoce las dos
 * formas desde la Ola U. Este detector sólo conocía `<propio>.<campo>.<msg>` y
 * `@<campo>.<msg>` — y el idioma real de Java/C# (`corpus/guava .../collect/
 * ForwardingList.java:68` declara `protected abstract List<E> delegate();` y
 * después escribe `delegate().add(index, element)`) no lleva receptor
 * explícito NI campo: el colaborador es el RETORNO de un miembro propio de
 * aridad 0. Con `invocation` en `CALL_NODE_TYPE` pero sin esta forma, la
 * familia `Forwarding*` entera seguiría invisible.
 *
 * MISMA INTENCIÓN, no una excepción: *"el colaborador es PROPIO"*. Quién
 * decide qué instancia se envuelve no es la unidad, sino quien la construye o
 * la especializa. Que el accessor esté DECLARADO en la misma unidad lo
 * verifica `hypotheses/decorator.ts#classInjectsField` (su segunda rama,
 * `declaresBodylessAccessor`) sobre el árbol vivo — acá, como en las otras dos
 * formas, sólo se reconoce la FORMA cruda: este detector confirma que existe
 * reenvío homónimo, la hipótesis decide el estado (mismo reparto que declara
 * el docstring del módulo).
 */
const ACCESSOR_SUFFIX = "\\(\\s*\\)";

/**
 * *** OLA X (B2) — EL IDIOMA SIN `this.` QUE C# ESCRIBE POR CONVENCIÓN, LA
 * OTRA MITAD DE LA CEGUERA EN EL 91 % DEL VOLUMEN DEL CORPUS ***
 *
 * MEDIDO ANTES DE TOCAR NADA, sobre `corpus/newtonsoft-json` completo:
 * `grep -rc "this\.\w\+\.\w\+(" --include=*.cs .` da **10** apariciones en
 * TODO el repo; `grep -rEc "^\s*(this\.)?_[A-Za-z]+\.[A-Za-z]+\(" --include=*.cs .`
 * da **366**. Las cuatro formas que `ownFieldSameNameCall` ya reconocía
 * (`this.campo.m(`, `this.accessor().m(`, `@campo.m` de Ruby,
 * `accessor().m(` sin receptor) exigen SIEMPRE un receptor o un accessor con
 * paréntesis — ninguna cubre "campo propio leído SIN receptor y SIN
 * paréntesis", que es exactamente cómo C# escribe el idioma
 * `_innerReader.Read()` (campo privado `_innerReader`, convención
 * `_camelCase`, sin `this.` — la Guía de Codificación de .NET lo permite y
 * la propia base de newtonsoft-json lo usa: **cero** `this.campo.método(` en
 * el repo entero). Caso real verificado abriendo el archivo:
 * `Src/Newtonsoft.Json/Serialization/TraceJsonReader.cs:34-62` —
 * `TraceJsonReader : JsonReader` con `_innerReader` inyectado por
 * constructor, y `public override bool Read() { bool value =
 * _innerReader.Read(); WriteCurrentToken(); return value; }`: reenvío
 * homónimo real (Decorator que además agrega comportamiento) que el ancla
 * de antes de esta tarea dejaba invisible por completo.
 *
 * POR QUÉ NO ALCANZA CON QUITAR EL RECEPTOR SIN MÁS. Un identificador suelto
 * seguido de `.método(` puede ser CUALQUIER COSA — variable local, parámetro,
 * clase estática (`Console.WriteLine(`), un helper importado — no sólo un
 * campo propio. Las otras tres formas de este archivo evitan ese problema
 * exigiendo SIEMPRE `this`/`self`/`@`/paréntesis-de-accessor como ancla
 * léxica; sin receptor no hay ancla léxica que perder, así que hace falta
 * una ESTRUCTURAL: el identificador tiene que ser, de verdad, un campo
 * DECLARADO en el cuerpo de la propia clase — verificado por AST, nunca por
 * el nombre (`_`-prefijo es CONVENCIÓN, no se lee en ningún lado de este
 * archivo: sólo filtra el CANDIDATO fuera de la clase antes de construir el
 * conjunto de campos declarados, ver `ownDeclaredFieldNames`).
 *
 * MISMO CRITERIO NEGATIVO que `self-referential-member.ts#findSelfReferentialMembers`
 * ya usa para encontrar campos sin reconocer un solo nombre de nodo por
 * gramática: un miembro directo del cuerpo de la clase que NO es
 * function-like (`sets.functionNodes`) NI class-like (`sets.classNodes`,
 * clase anidada) es, por eliminación, una declaración de campo/propiedad —
 * funciona igual en Java (`field_declaration` con "name" directo), C#
 * (desenvolviendo `variable_declaration` → `variable_declarator`, mismo
 * desenvolvimiento que `self-referential-member.ts#csharpFieldShape`, sólo
 * el nombre) y cualquier gramática con la misma forma, sin bifurcar por tipo
 * de nodo.
 *
 * ACOTADO A C# A PROPÓSITO, no generalizado a los otros 6 lenguajes del
 * corpus — medido, no supuesto: Python/Ruby/JS/TS exigen SIEMPRE un receptor
 * (`self.`/`@`/`this.`) para leer un campo propio — sin él, un identificador
 * suelto es por definición una variable local o un parámetro, JAMÁS un campo
 * de instancia, así que esta forma sería, en esos lenguajes, una fuente de
 * falsos y no un idioma real. Go ya tiene su propio camino con receptor
 * (Ruta 2). **Java queda deliberadamente AFUERA de este primer corte**: el
 * mismo grep sobre `corpus/guava` da **126** apariciones de
 * `this.campo.método(` — evidencia medida de que Java, a diferencia de C#,
 * SÍ suele escribir el receptor — así que el mismo riesgo (identificador
 * suelto sin receptor) no tiene la misma contrapartida de cobertura medida;
 * abrirlo sin medir su propio costo/beneficio en guava sería estimar, no
 * medir. Queda anotado como candidato a un frente futuro, no implementado acá.
 */
const BARE_FIELD_LANGUAGES: ReadonlySet<string> = new Set(["csharp"]);

/** Nombre del campo, mismo desenvolvimiento que
 *  `self-referential-member.ts#csharpFieldShape` — sólo la mitad "nombre",
 *  la única que este ancla necesita (la magnitud/tipo la sigue decidiendo
 *  `hypotheses/decorator.ts`, nunca este detector). */
function csharpDeclaredFieldName(member: AstNode): string | null {
  for (const child of namedChildren(member)) {
    if (child.type !== "variable_declaration") continue;
    const declarator = namedChildren(child).find((c) => c.type === "variable_declarator") ?? null;
    return declarator ? ((namedChildren(declarator)[0] as AstNode | undefined)?.text ?? null) : null;
  }
  return null;
}

/** Nombres de los campos declarados DIRECTAMENTE en el cuerpo de la clase —
 *  ver el docstring de `BARE_FIELD_LANGUAGES` arriba para el criterio
 *  (negativo: no function-like, no class-like ⇒ campo) y por qué hace falta
 *  ser estructural acá, no léxico. */
function ownDeclaredFieldNames(bodyNode: AstNode, sets: FileUnit["sets"]): ReadonlySet<string> {
  const names = new Set<string>();
  for (const member of namedChildren(bodyNode)) {
    if (sets.functionNodes.has(member.type) || sets.classNodes.has(member.type)) continue;
    const name =
      (member.childForFieldName("name") as AstNode | null)?.text ??
      ((member.childForFieldName("declarator") as AstNode | null)?.childForFieldName("name") as AstNode | null)?.text ??
      csharpDeclaredFieldName(member);
    if (name) names.add(name);
  }
  return names;
}

function ownFieldSameNameCall(
  bodyNode: AstNode,
  memberName: string,
  selfNames: readonly string[],
  ownFields: ReadonlySet<string> | null = null,
): string | null {
  const escapedMethod = escapeRegExp(memberName);
  const calls: AstNode[] = [];
  findAllDescendants(bodyNode, (n) => CALL_NODE_TYPE.test(n.type), 16, calls);
  const patterns: RegExp[] = [];
  if (selfNames.length > 0) {
    const names = selfNames.map(escapeRegExp).join("|");
    patterns.push(new RegExp(`^(?:${names})\\.(\\w+)\\.${escapedMethod}(?![\\w.!?])`));
    // Accessor CON receptor explícito (`this.delegate().m(...)`).
    patterns.push(new RegExp(`^(?:${names})\\.(\\w+)${ACCESSOR_SUFFIX}\\.${escapedMethod}(?![\\w.!?])`));
  }
  patterns.push(new RegExp(`^@(\\w+)\\.${escapedMethod}(?![\\w.!?])`));
  // Accessor SIN receptor explícito (`delegate().m(...)`, el idioma de Java/C#).
  patterns.push(new RegExp(`^(\\w+)${ACCESSOR_SUFFIX}\\.${escapedMethod}(?![\\w.!?])`));
  for (const re of patterns) {
    for (const call of calls) {
      const m = re.exec(call.text);
      if (!m || REFLECTIVE_FIELD_NAMES.has(m[1]!) || isFedIntoFurtherOperation(call, bodyNode)) continue;
      return m[1]!;
    }
  }
  // Campo propio SIN receptor y SIN paréntesis (`_inner.Read(...)`, el
  // idioma de C# — ver el docstring de `BARE_FIELD_LANGUAGES` arriba). Sólo
  // se intenta cuando `ownFields` trae el conjunto de campos DECLARADOS de
  // la clase (verificado por AST, nunca por convención de nombre): sin esa
  // ancla estructural, un identificador suelto no tiene forma de
  // distinguirse de una variable local.
  if (ownFields && ownFields.size > 0) {
    const bare = new RegExp(`^(\\w+)\\.${escapedMethod}(?![\\w.!?])`);
    for (const call of calls) {
      const m = bare.exec(call.text);
      if (!m || !ownFields.has(m[1]!) || REFLECTIVE_FIELD_NAMES.has(m[1]!) || isFedIntoFurtherOperation(call, bodyNode)) continue;
      return m[1]!;
    }
  }
  return null;
}

/** Variante de un solo nivel para la forma FUNCIONAL — MISMO criterio que
 *  `hypotheses/decorator.ts#paramSameNameCall`, con los mismos dos filtros
 *  agregados esta tarea (ver arriba): sólo nodos-llamada entran en la
 *  comparación, esté o no el valor envuelto en un lambda, y un candidato
 *  embebido en otra operación se descarta sin devolverlo. */
function paramSameNameCall(valueNode: AstNode, methodName: string, paramNames: readonly string[]): string | null {
  if (paramNames.length === 0) return null;
  const names = paramNames.map(escapeRegExp).join("|");
  const escapedMethod = escapeRegExp(methodName);
  const re = new RegExp(`^(${names})\\.${escapedMethod}(?![\\w.!?])`);
  const calls: AstNode[] = [];
  findAllDescendants(valueNode, (n) => CALL_NODE_TYPE.test(n.type), 10, calls);
  for (const call of calls) {
    const m = re.exec(call.text);
    if (!m || isFedIntoFurtherOperation(call, valueNode)) continue;
    return m[1]!;
  }
  return null;
}

/** Para Go: campo `receiver` ⇒ (nombre del parámetro receptor, nombre del
 *  tipo receptor) — misma vía que `hypotheses/decorator.ts#goReceiverOf`. */
function goReceiverOf(fnNode: AstNode): { paramName: string; typeName: string } | null {
  const receiver = fnNode.childForFieldName("receiver") as AstNode | null;
  if (!receiver) return null;
  const decl = namedChildren(receiver)[0] ?? receiver;
  const paramName = (decl.childForFieldName("name") as AstNode | null)?.text ?? null;
  const typeNode = findDescendant(decl, (n) => n.type === "type_identifier", 3);
  if (!paramName || !typeNode) return null;
  return { paramName, typeName: typeNode.text };
}

function paramNameOf(node: AstNode): string | null {
  if (node.type === "identifier") return node.text;
  const named =
    (node.childForFieldName("name") as AstNode | null) ??
    (node.childForFieldName("pattern") as AstNode | null) ??
    (node.childForFieldName("left") as AstNode | null);
  if (named) return named.text;
  for (const c of namedChildren(node)) if (c.type === "identifier") return c.text;
  return null;
}

/** Nombres de parámetro de una función — misma vía que
 *  `hypotheses/decorator.ts#functionParamNames`, sin el receptor Go (la ruta
 *  funcional de este detector sólo corre cuando `goReceiverOf` ya dio `null`). */
function functionParamNames(fnNode: AstNode): string[] {
  const names: string[] = [];
  const paramList = fnNode.childForFieldName("parameters") as AstNode | null;
  if (paramList) {
    for (const child of namedChildren(paramList)) {
      const name = paramNameOf(child);
      if (name) names.push(name);
    }
  }
  return names;
}

/**
 * Ruta FUNCIONAL: busca, dentro de `scopeNode` (cuerpo de la función
 * candidata), un par clave/valor de objeto literal (`area: () =>
 * shape.area()`) cuya CLAVE coincide con el nombre del método invocado
 * sobre uno de los parámetros capturados — mismo criterio exacto que
 * `hypotheses/decorator.ts#functionalSameNameForwards`.
 */
function functionalSameNameForward(scopeNode: AstNode, paramNames: readonly string[]): string | null {
  let found: string | null = null;
  const visit = (node: AstNode): void => {
    if (found) return;
    const keyNode = node.childForFieldName("key") as AstNode | null;
    const valueNode = node.childForFieldName("value") as AstNode | null;
    if (keyNode && valueNode) {
      const keyName = /^[A-Za-z_$][\w$]*$/.test(keyNode.text) ? keyNode.text : null;
      if (keyName) {
        const field = paramSameNameCall(valueNode, keyName, paramNames);
        if (field) {
          found = field;
          return;
        }
      }
    }
    for (const c of namedChildren(node)) visit(c);
  };
  visit(scopeNode);
  return found;
}

function bodyOf(fnNode: AstNode): AstNode {
  return (fnNode.childForFieldName("body") as AstNode | null) ?? fnNode;
}

/**
 * *** OLA W (W4) — EL PROTOCOLO UNIVERSAL NO ES UN PROTOCOLO COMPARTIDO ***
 *
 * MEDIDO sobre el primer volcado real de `corpus/guava` con Java ya visible
 * (299 filas nuevas donde antes había 0): **73 son `equals`, 9 `hashCode`, 7
 * `toString`** — el 30 % del total. Abiertos a mano, dos de dos son igualdad
 * estructural, no reenvío:
 *   - `guava/src/com/google/common/base/Converter.java:532` —
 *     `this.forwardFunction.equals(that.forwardFunction) &&
 *      this.backwardFunction.equals(that.backwardFunction)`: el objeto compara
 *     SUS campos contra los del OTRO, no le pasa su comportamiento a nadie.
 *   - `guava/src/com/google/common/graph/EndpointPair.java:212` — idéntico,
 *     `nodeU().equals(other.nodeU())` dentro de una conjunción.
 *
 * LA RAZÓN, y es la MISMA que `hypotheses/decorator.ts#levelFromSignal` ya da
 * en su cláusula 0 (*"un solo nombre de miembro compartido con el colaborador
 * es coincidencia"*), sólo que acá es más fuerte todavía: `equals`, `hashCode`
 * y `toString` los tiene **TODO objeto por construcción del lenguaje**. Que el
 * que reenvía y el reenviado compartan `equals` no es evidencia de que
 * compartan un protocolo — es evidencia de que los dos son objetos. Un
 * `ImmutableMap.hashCode() ⇒ entrySet().hashCode()` es un reenvío real y aun
 * así no dice nada sobre si `ImmutableMap` es sustituible por su `entrySet`,
 * que es la única pregunta que este ancla existe para alimentar.
 *
 * Es vocabulario del PROTOCOLO DE OBJETOS de cada gramática —el mismo estatus
 * que `REFLECTIVE_FIELD_NAMES` (arriba) y que
 * `hypotheses/decorator.ts#CATCH_ALL_FORWARDER_NAMES`—, no léxico de dominio:
 * ningún nombre de acá describe qué HACE el código, sólo cómo cada lenguaje
 * escribe "igualdad", "hash" y "representación".
 *
 * VERIFICADO QUE NO CUESTA NINGÚN VERDADERO: de los 20 hallazgos de este kind
 * juzgados `verdadero` en las planillas, **cero** tienen como símbolo uno de
 * estos nombres (medido cruzando `tests/golden/precision/*.verdicts.csv`).
 * `Error`/`String` de Go quedan AFUERA a propósito: no son universales (son
 * `error`/`fmt.Stringer`, dos interfaces que un tipo elige implementar), y sin
 * un caso medido no se excluyen.
 */
const UNIVERSAL_PROTOCOL_MEMBERS: ReadonlySet<string> = new Set([
  // Java / C# / JS
  "equals", "Equals", "hashCode", "GetHashCode", "toString", "ToString", "compareTo", "CompareTo", "valueOf",
  // Python
  "__eq__", "__ne__", "__hash__", "__str__", "__repr__",
  // Ruby
  "==", "eql?", "hash", "to_s", "inspect",
]);

export const detector: IntraFileDetector<ThresholdKey, "homonymous-delegation"> = {
  id: "homonymous-delegation",
  kind: "homonymous-delegation",
  scope: "intra-file",
  title: "Reenvío homónimo a un colaborador propio",
  needs: [],
  thresholds: {
    forwards: presencia({
      rationale:
        "un único reenvío homónimo (mismo nombre en quien reenvía y en el reenviado) ya es forma de envoltura que vale la pena que hypotheses/decorator.ts clasifique — la magnitud (1 = parcial, >=2 = ya-aplicado) la decide esa hipótesis con su propio análisis, no este umbral.",
    }),
  },
  run(file: FileUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const threshold = ctx.threshold("forwards");
    const findings: RawFinding[] = [];
    const reportedOwners = new Set<string>();

    // Ruta 1: CLASE — agrupar `file.functions` por `metrics.className` (mismo
    // campo que `large-class.ts`/`refused-bequest.ts` ya usan, sin re-derivarlo).
    const byClass = new Map<string, FunctionUnit[]>();
    for (const fn of file.functions) {
      if (fn.metrics.className === null) continue;
      const list = byClass.get(fn.metrics.className) ?? [];
      list.push(fn);
      byClass.set(fn.metrics.className, list);
    }

    // Campos DECLARADOS por clase — sólo se calcula en los lenguajes donde el
    // idioma sin receptor es real y medido (ver docstring de
    // `BARE_FIELD_LANGUAGES`); en el resto, `classFieldsByName` queda vacío y
    // `ownFieldSameNameCall` nunca intenta el patrón BARE.
    const classFieldsByName = new Map<string, ReadonlySet<string>>();
    if (BARE_FIELD_LANGUAGES.has(file.language)) {
      walkTree(file.root, (node) => {
        if (!node.isNamed || !file.sets.classNodes.has(node.type)) return;
        const classNode = node as AstNode;
        const nameNode = classNode.childForFieldName("name") as AstNode | null;
        const bodyNode = classNode.childForFieldName("body") as AstNode | null;
        if (!nameNode || !bodyNode) return;
        classFieldsByName.set(nameNode.text, ownDeclaredFieldNames(bodyNode, file.sets));
      });
    }

    for (const [className, members] of byClass) {
      const ownFields = classFieldsByName.get(className) ?? null;
      for (const member of members) {
        if (!member.name || UNIVERSAL_PROTOCOL_MEMBERS.has(member.name)) continue;
        const field = ownFieldSameNameCall(bodyOf(member.node), member.name, SELF_WORDS, ownFields);
        if (!field) continue;
        const ownerKey = `class:${className}`;
        if (reportedOwners.has(ownerKey)) break;
        reportedOwners.add(ownerKey);
        findings.push(
          rawFinding(file.path, member, className, field, threshold, `"${className}" reenvía homónimamente "${member.name}" a su colaborador propio "${field}"`),
        );
        break;
      }
    }

    // Ruta 2: GO (receptor, sin nodo de clase — `metrics.className` siempre
    // `null` acá) y Ruta 3: FUNCIONAL (sin clase, sin receptor) — una sola
    // pasada sobre las funciones que la Ruta 1 no absorbió.
    for (const fn of file.functions) {
      if (fn.metrics.className !== null || !fn.name || UNIVERSAL_PROTOCOL_MEMBERS.has(fn.name)) continue;

      const goRecv = goReceiverOf(fn.node);
      if (goRecv) {
        const field = ownFieldSameNameCall(bodyOf(fn.node), fn.name, [goRecv.paramName]);
        if (!field) continue;
        const ownerKey = `go:${goRecv.typeName}`;
        if (reportedOwners.has(ownerKey)) continue;
        reportedOwners.add(ownerKey);
        findings.push(
          rawFinding(file.path, fn, goRecv.typeName, field, threshold, `"${goRecv.typeName}" reenvía homónimamente "${fn.name}" a su colaborador propio "${field}"`),
        );
        continue;
      }

      // Funcional: la propia función (de orden superior, con parámetros
      // capturados) es la unidad dueña — sin excluir su propio cuerpo, a
      // diferencia de `hypotheses/decorator.ts#fileWideDelegationLevel`
      // (que EXCLUYE la función ancla porque busca evidencia en OTRA parte
      // del archivo para el excluder de flag-accumulator). Acá el ancla ES
      // la envoltura: se mira el cuerpo de la función misma.
      const paramNames = functionParamNames(fn.node);
      if (paramNames.length === 0) continue;
      const field = functionalSameNameForward(bodyOf(fn.node), paramNames);
      if (!field) continue;
      const ownerKey = `fn:${fn.name}`;
      if (reportedOwners.has(ownerKey)) continue;
      reportedOwners.add(ownerKey);
      findings.push(
        rawFinding(file.path, fn, fn.name, field, threshold, `"${fn.name}" retorna un objeto cuyas claves reenvían homónimamente a su parámetro capturado "${field}"`),
      );
    }

    return findings;
  },
};

function rawFinding(
  filePath: string,
  fn: FunctionUnit,
  ownerName: string,
  field: string,
  threshold: ReturnType<RunContext<ThresholdKey>["threshold"]>,
  title: string,
): RawFinding {
  return {
    title,
    detail:
      `"${ownerName}" ya reenvía al menos un miembro con el MISMO nombre a un colaborador propio ("${field}") — la forma estructural de una envoltura ` +
      "(Decorator/Proxy/Composite y patrones vecinos, ver CONTRATO-F10.md §0.4, \"la terna de envoltura\"). Esto no es un problema: es la evidencia " +
      "cruda que permite clasificar si la envoltura ya está bien formada, es ad hoc, o todavía no existe — esa clasificación exacta la hace la " +
      "hipótesis correspondiente, no este detector.",
    trigger: [{ label: "reenvíos homónimos detectados", value: 1, threshold }],
    locations: [
      {
        file: filePath,
        startLine: fn.startLine,
        endLine: fn.endLine,
        symbol: fn.name ?? undefined,
        role: `reenvía "${fn.name}" a "${field}.${fn.name}"`,
      },
    ],
    severity: 15,
    advice: {
      primary: {
        name: "Confirm delegation is Decorator-shaped",
        kind: "patron_de_diseno",
        why:
          "Un reenvío homónimo a un colaborador propio es, estructuralmente, la mitad de un Decorator/Proxy/Composite ya aplicado o ad hoc — " +
          "confirmar con la interfaz compartida si vale la pena formalizarlo.",
        source: "https://refactoring.guru/design-patterns/decorator",
      },
    },
  };
}
