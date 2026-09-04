/**
 * `herencia` — HERENCIA / clase base (CONTRATO-F4.md §2, arista asignada
 * "herencia").
 *
 * RELACIÓN: una unidad tipo-clase declara, en su propia sintaxis, que
 * extiende/hereda de OTRA unidad — Ruby `class X < Y`, Python
 * `class X(Y, Z)` (herencia múltiple real, no C#'s lista mixta), JS/TS
 * `class X extends Y`, Java `class X extends Y`, C# `class X : Y` (ver
 * AMBIGÜEDAD DECLARADA abajo). Go no tiene este constructo (`type_spec` no
 * expone campo `body`, así que `file.sets.classNodes` sale vacío para Go —
 * `code-grammar.ts` línea ~119 — límite YA documentado ahí, no algo que este
 * archivo introduce).
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: el campo/posición que lleva la
 * superclase NUNCA se escribe a mano (prohibido listar
 * `"extends"|"superclass"|"base_list"` como string mágico en la lógica de
 * extracción sobre código real). Se DESCUBRE una vez por lenguaje corriendo
 * `discoverCarrier` (`graph/edges/sentinel.ts`, mecanismo compartido) sobre
 * `SENTINEL[language]` (`class SentinelChild extends SentinelBase` y su
 * equivalente por lenguaje); el resultado (`CarrierPath`: qué campo — o, si
 * no hay campo, qué `nodeType` posicional — separa al declarante del nombre
 * de la superclase) es lo único que `extract()` usa después sobre archivos
 * reales. Mismo mecanismo, mismo spike de referencia
 * (`impl/spikes/discover-carrier/`, 9/9 lenguajes) que ya usan `mixin.ts`/
 * `interfaz-declarada.ts`.
 *
 * *** EL HUECO DE GENÉRICOS — CERRADO EN LA OLA P (frente P3), Y POR QUÉ NO
 * ERA SÓLO UNA PÉRDIDA DE RECALL ***
 *
 * Hasta esta ola el candidato se pelaba con `qualifiedNameOf` (los campos
 * `scope`/`name` de Ruby) y se exigía que la hoja resultante fuera un nodo
 * SIN HIJOS. Eso descartaba, medido por sonda directa sobre las gramáticas
 * reales (`scratchpad/p3/probe1.mts`):
 *   - java `class A extends B<T>` → el hijo del contenedor `superclass` es un
 *     `generic_type` («B<T>») con dos hijos ⇒ CERO candidatos, cero aristas;
 *   - csharp `class A : B<T>, IFoo<T>, IBar` → los dos primeros elementos del
 *     `base_list` son `generic_name` («B<T>», «IFoo<T>») ⇒ el único candidato
 *     que sobrevivía era `IBar`;
 *   - python `class FloatRange(_NumberRangeBase[float, float], FloatParamType)`
 *     → el primer elemento es un `subscript` ⇒ sólo salía `FloatParamType`;
 *   - python `class AliasedGroup(click.Group)` → el elemento es un `attribute`
 *     (campos `object`/`attribute`, no `scope`/`name`) ⇒ CERO aristas.
 *
 * El caso de C# es el que muestra que esto NO era sólo recall: la regla de
 * ambigüedad de abajo decide por la ARIDAD REAL de la lista, y con los
 * genéricos invisibles la aridad medida era 1 en vez de 3 — así que esta
 * arista reclamaba `IBar` (la posición 2, interfaz con CERTEZA estructural)
 * como CLASE BASE, y `interfaz-declarada.ts` no reclamaba nada. Una arista
 * FALSA y dos ausentes, las tres por el mismo hueco. Con los genéricos
 * pelados, `A : B<T>, IFoo<T>, IBar` da aridad 3: esta arista no reclama nada
 * (posición 0 genuinamente ambigua) y `interfaz-declarada.ts` reclama las
 * posiciones 1..2, que es exactamente lo que la gramática garantiza.
 *
 * SIMPLIFICACIONES DECLARADAS (medidas contra el corpus, ver el resultado
 * final de la tarea para el número exacto):
 *   - Calificación y argumentos de tipo se pelan del TEXTO del candidato
 *     (`peelTypeReference`, abajo), no de una segunda convención de campos
 *     por gramática: `<...>`/`[...]` al final son los delimitadores de
 *     argumentos de tipo de las 9 gramáticas soportadas y `::`/`.` los dos
 *     separadores de calificación que `graph/resolve.ts#splitQualifierText`
 *     ya trata indistintamente. Ruby `Sentinel::Base` da el MISMO resultado
 *     que daba `qualifiedNameOf` (`name: "Base"`, `qualifier: ["Sentinel"]`),
 *     y la forma equivalente en JS/TS (`extends mod.SentinelBase`,
 *     `member_expression`) — declarada como límite hasta la Ola O — ahora SÍ
 *     se reconoce, con el mismo par (nombre, calificador) que produciría
 *     cualquier otro lenguaje. TypeScript nunca sufrió el hueco de genéricos
 *     porque su gramática pone los argumentos de tipo en un campo SEPARADO
 *     (`extends_clause.type_arguments`), dejando `value` desnudo.
 *   - Lo que NO reduce a un identificador limpio sigue sin aportar candidato,
 *     y sin necesitar una regla por nombre: python `metaclass=ABCMeta`
 *     (`keyword_argument`, texto con `=`), ruby `Struct.new(:a)` (texto con
 *     paréntesis) y js `extends mixin(Base)` quedan afuera por la MISMA
 *     guarda de forma (`IDENTIFIER_RE`) que ya existía.
 *
 * *** LA FORMA DE INTERFAZ (`interface X extends Y`) — TAMBIÉN CERRADA EN LA
 * OLA P (frente P3). *** El `ownerType` que la sonda descubría era el de la
 * declaración de CLASE (`class_declaration`), así que una interfaz que declara
 * su propio supertipo no producía NINGUNA arista, en ningún lenguaje:
 * `interface_declaration` es un `nodeType` distinto, con su propio contenedor
 * (java `extends_interfaces -> type_list`, typescript `extends_type_clause`,
 * csharp `base_list`) — verificado por sonda directa sobre las tres gramáticas
 * (`scratchpad/p3/probe5.mts`). Encontrado MIDIENDO, no leyendo: al cerrar el
 * hueco de genéricos, `speculative-abstraction` empezó a acusar a
 * `guava/Maps.java#MapDifference` de tener "un único implementador"
 * (`MapDifferenceImpl`) cuando `SortedMapDifference.java:31` declara
 * `public interface SortedMapDifference<K,V> extends MapDifference<K,V>` — un
 * SEGUNDO implementador que el grafo no podía ver. El arreglo usa el MISMO
 * mecanismo que la forma de expresión de JS/TS (una sonda adicional sobre el
 * mismo centinela, `SENTINEL_IFACE_CHILD_NAME`), así que un lenguaje que no
 * declare esa forma en su `SENTINEL` (ruby, python, javascript) obtiene `null`
 * sin ninguna rama por nombre de lenguaje. La relación se emite como
 * `extends` —no `implements`— porque eso es literalmente lo que la sintaxis
 * dice y porque `concrete-over-abstraction.ts` interpreta `implements` como
 * "B es una implementación concreta de I", que una interfaz no es.
 *
 * AMBIGÜEDAD DECLARADA — C#, Y LA SEÑAL ESTRUCTURAL QUE LA ACOTA (esta ola,
 * frente "el extractor no ve"): `class X : Base, IFoo` usa la MISMA lista
 * (`base_list`) para la clase base y las interfaces, sin campo que las
 * distinga — confirmado corriendo `discoverCarrier` dos veces sobre el
 * propio centinela C# (una vez pidiendo la clase base, otra pidiendo una
 * interfaz declarada junto a ella): ambos caminos comparten `ownerType` +
 * campo + `nodeType`, sólo difieren en el índice final (`sameShapeExceptFinalIndex`,
 * mismo mecanismo que `interfaz-declarada.ts` usa para el mismo lenguaje en
 * la dirección opuesta). `warmUp` sigue detectando y reportando esta
 * ambigüedad (`status: "ambiguous"`) — es un HECHO real del lenguaje, no
 * dejó de serlo — pero YA NO vacía los `carriers`: la ambigüedad es sobre
 * QUÉ RELACIÓN representa cada POSICIÓN de la lista compartida, y esa
 * pregunta tiene una respuesta estructural distinta según cuántas posiciones
 * haya, no una respuesta uniforme "nunca emitir".
 *
 * La construcción de C# (no una convención, el `base_list` mismo, ORDEN Y
 * ARIDAD que la gramática exige): como máximo UNA clase base es válida, y si
 * está presente DEBE ser el primer elemento de la lista — cualquier elemento
 * en una posición POSTERIOR a la primera es, sin excepción, una interfaz.
 * Eso dos hechos ya bastan para partir los 153 casos medidos
 * (newtonsoft-json) en dos grupos con certeza estructural DISTINTA:
 *
 *   - **Lista de UN solo elemento** (127 de 153, medido): no hay "posición
 *     posterior a la primera" — la única pregunta real es si ESE elemento es
 *     la clase base o una interfaz-huérfana-de-base (`class
 *     DiagnosticsTraceWriter : ITraceWriter`, sin clase base). Esta arista
 *     (`extends`) reclama el candidato único como clase base — MISMA
 *     limitación que documenta `interfaz-declarada.ts` para el caso
 *     simétrico: sin resolver el símbolo de destino contra el resto del
 *     repo (que esta arista, por diseño, no hace — corre por archivo, ver
 *     el docstring de `graph/edges/types.ts#EdgeFacts`), no hay forma
 *     estructural de distinguir el 79%-ish de casos reales que SÍ son clase
 *     base del resto. Verificado a mano sobre newtonsoft-json (ver el
 *     resultado final de esta tarea para el conteo y la lista de casos): el
 *     residual documentado es preferible a silenciar el ~90% de casos
 *     correctos por el ~10-20% que no lo es — la MISMA lógica que ya acepta
 *     `mixin.ts`'s "REFINAMIENTO MEDIDO" (heurística con error medido y
 *     documentado, no cero absoluto) en vez del "ausente o perfecto" que
 *     regía acá antes.
 *   - **Lista de DOS o más elementos** (26 de 153, medido): la posición 0
 *     SIGUE siendo genuinamente ambigua (contraejemplo real, verificado en
 *     el corpus: `DictionaryWrapper<TKey,TValue> : IDictionary<TKey,
 *     TValue>, IWrappedDictionary` — la posición 0 es una INTERFAZ, no una
 *     clase) — esta arista NO reclama nada en ese caso. Las posiciones 1..N
 *     sí son 100% ciertas (interfaz, nunca clase base, por la regla de
 *     aridad de arriba) — ver `interfaz-declarada.ts`, que las reclama.
 *
 * Por eso `extract()` ya no depende de `status === "ambiguous"` para decidir
 * si emite: usa la ARIDAD REAL del contenedor de CADA declaración real (no
 * la forma del centinela) para decidir qué posición le toca a esta arista.
 * "Una arista falsa es peor que una ausente" se preserva EXACTO donde la
 * estructura lo permite (posición 0 de una lista de 2+, y las posiciones
 * 1..N siguen siendo de `interfaz-declarada.ts`, nunca de acá) y se
 * relaja, documentado y medido, sólo donde la estructura ya redujo la
 * pregunta a "clase base sola vs. interfaz sola" (lista de 1).
 *
 * MEDIDO de punta a punta contra newtonsoft-json (`dump-graph-census.mts`,
 * grafo YA resuelto, no sólo `EdgeFacts` crudos): **93 `extends`** (antes 0)
 * llegan al grafo final. La extracción cruda produce ~128 (un `EdgeFacts`
 * por lista de 1 candidato); la diferencia (~35) son objetivos EXTERNOS al
 * repo (`System.Exception`, `System.Attribute`, `System.EventArgs`, etc. —
 * verificado a mano) que la cascada de resolución (`graph/resolve.ts`,
 * fuera de mi alcance) correctamente NO materializa — el mismo principio ya
 * establecido para `imports` ("un paquete externo no tiene archivo que
 * resolver y no se intenta adivinar uno"), no una falla de este extractor.
 *
 * LÍMITES POR LENGUAJE (medidos, no supuestos):
 *   - **Go**: `absent-in-language` — `classNodes` vacío (ver arriba).
 *   - **C#**: base_list compartido con interfaces — ver arriba. Ya NO es
 *     "nunca emite": emite el candidato único de una lista de 1 (residual de
 *     error medido y documentado) y nada de la posición 0 de una lista de
 *     2+ (esa sigue siendo genuinamente indistinguible).
 *   - **Ruby/JavaScript/TypeScript/TSX/Vue/Java/Python**: `SENTINEL` declara
 *     las 7, y las 7 EMITEN sobre el corpus (ver resultado final).
 *
 * `FROMPATH` DEBE INCLUIR TODO CONTENEDOR ANIDADO, NO SÓLO `path.ownerType`
 * (esta ola, encontrado midiendo el fix de C# de arriba contra el corpus
 * real): C# `namespace_declaration` (y `struct/enum/record_declaration`)
 * TAMBIÉN son miembros de `file.sets.classNodes` (misma prueba estructural
 * genérica que admite a `class_declaration`) — y como casi TODO código C#
 * real envuelve sus clases en `namespace Foo {...}`, `extract()` empujaba a
 * `classStack` SÓLO el nodo `class_declaration`, dando `fromPath: ["X"]` en
 * vez de `["Foo","X"]`. `graph/symbols.ts` arma el `container` de cada
 * símbolo con el MISMO criterio genérico, así que el destino real vive bajo
 * `["Foo"]` — la cascada de resolución (`graph/build.ts`, `scope:
 * ef.fromPath`) nunca encontraba coincidencia. VERIFICADO contra el corpus
 * real (newtonsoft-json): las 128 `EdgeFacts` de `extends` se producían
 * (`analyzeFile` en aislamiento las mostraba) pero CERO llegaban al grafo
 * final (`dump-graph-census.mts`) hasta este arreglo — repro mínimo (dos
 * archivos sintéticos, con/sin `namespace`) aisló la variable exacta.
 * `mixin.ts#collect` ya lo hacía bien (empuja cualquier `classNodes`, nunca
 * atado a un tipo fijo); ver el mismo arreglo, con el mismo detalle, en
 * `interfaz-declarada.ts`.
 *
 * Y UN SEGUNDO DEFECTO RELACIONADO, TAMBIÉN ENCONTRADO MIDIENDO CONTRA EL
 * CORPUS REAL: un namespace COMPUESTO (`namespace Newtonsoft.Json {...}`,
 * la forma que envuelve casi TODO el repo real) es un solo nodo `name` cuyo
 * `.text` trae los puntos adentro — empujarlo COMO UN SOLO SEGMENTO
 * ("Newtonsoft.Json") tampoco calzaba contra `graph/symbols.ts`, que (Ola
 * 9, A1, ya medida y arreglada ahí — ver `symbols.ts#splitQualifiedSegments`)
 * parte el mismo nombre en un frame POR SEGMENTO, porque `namespace A.B` es
 * estructuralmente idéntico a `namespace A { namespace B {...} } }`. Este
 * archivo lleva una copia LOCAL de la misma función (mismo motivo que
 * `references.ts` lleva la suya: los archivos de esa ola no se importan
 * entre sí) — ver `splitQualifiedSegments` abajo.
 *
 * FORMA DE EXPRESIÓN DE CLASE (JS/TS/TSX/Vue) — `module.exports = class X
 * extends Y {}`: la gramática da a esta forma un `node.type` PROPIO
 * (`"class"`, distinto de `"class_declaration"`) pero con el MISMO cuerpo
 * interno (`class_heritage` en la misma posición, mismo camino que descubre
 * `discoverCarrier`) — confirmado por sonda directa comparando los dos
 * caminos sobre un centinela que declara AMBAS formas (ver `SENTINEL` y
 * `SENTINEL_EXPR_CHILD_NAME` abajo). `file.sets.classNodes` (derivado del
 * `probeSource` compartido de `code-analyzer.ts`, fuera de mi alcance) NUNCA
 * ejercita esta forma, así que nunca la contiene — mismo principio que ya
 * repite este proyecto ("si la sonda no ejercita una construcción, esa
 * construcción no existe") aplicado ahora al probe COMPARTIDO en vez del
 * propio. En vez de esperar ese arreglo (una capa más abajo, de otro dueño),
 * este extractor reconoce la forma DIRECTAMENTE por su propio `node.type`
 * descubierto (`"class"`, vocabulario de gramática, misma categoría
 * permitida que `RECORD_NODE_WORD`/`CONSTRUCTOR_NODE_WORD` de
 * `code-grammar.ts`), sin pasar por `classNodes` — ver `looksClassExpressionLike`
 * más abajo. Medido sobre el corpus real (eslint): 9 casos reales de esta
 * forma, los 9 en `lib/languages/js/source-code/token-store/*.js`.
 * VERIFICADO de punta a punta (repro mínimo con `analyzeRepo`, dos archivos,
 * uno con `class Base {}`, otro con `module.exports = class X extends Base
 * {}`): la arista `extends` SÍ llega al grafo final y SÍ se resuelve contra
 * `Base` — `graph/edges/types.ts#EdgeFacts.fromPath` sólo necesita un STRING
 * (`symbolNodeId` lo convierte en un id sin exigir que exista un nodo
 * `symbol` con ese id), así que el hueco de `graph/symbols.ts` (que, por el
 * MISMO límite de `classNodes`, tampoco arma un nodo `symbol` propio para
 * "X" — sus miembros quedan adjuntos al scope de archivo en vez de a "X")
 * NO le impide a esta arista contar. Es un defecto MENOR y real, ajeno a mis
 * tres archivos, no bloqueante para este frente — declarado, no escondido.
 * MEDIDO de punta a punta contra eslint (`dump-graph-census.mts`, grafo YA
 * resuelto): `extends` pasó de 6 (cifra vieja, medida antes del "BUG
 * CERRADO P3" de más arriba) a **15** — 7 de forma declaración con
 * objetivo LOCAL (`LoopContextBase` ×5, `TokenStore`, `ConfigArray`; las
 * otras 10 de forma declaración apuntan a `Error`/`Map`, globales de JS
 * nunca declarados en el repo, correctamente sin resolver — mismo
 * principio que arriba) y las 9 de forma de expresión (familia `Cursor`,
 * TODAS con objetivo local en `token-store/`) menos una que no resolvió —
 * residual chico, no perseguido más a fondo por tiempo.
 *
 * *** BUG CERRADO (P3, esta ola) — histórico, no borrado por trazabilidad:
 * *** `needs: ["herencia"]` referencia la capacidad
 * `detect/capabilities.ts#deriveCapabilities`. Reportado ≥2 veces en olas
 * previas y confirmado acá por tercera vez, empíricamente, ANTES de tocar
 * nada: sobre el `probeSource` de producción (`code-analyzer.ts`), la
 * capacidad salía `false` para javascript/typescript/tsx/vue —
 * `class_heritage` es un hijo POSICIONAL de `class_declaration`, sin campo
 * con nombre, así que `hasAnyField(INHERITANCE_FIELDS)` nunca lo veía. Ruby
 * NO tenía este bug (corrección al diagnóstico previo, que estaba mal): su
 * `superclass` SÍ es un campo con nombre en tree-sitter-ruby, y `RUBY_PROBE`
 * ya ejercitaba `class Shape < Base` — medido `herencia: true` para ruby
 * antes de este arreglo. `detect/capabilities.ts` ahora complementa el
 * chequeo por campo con un escaneo de hijos posicionales por tipo de nodo
 * (`HERITAGE_WORD`, vocabulario genérico) — las 9 filas de
 * `capability-matrix.test.ts` (`code-analyzer.ts`/`code-grammar.ts`, no este
 * archivo) deben actualizarse para reflejar `herencia: true` en la familia
 * JS/TS (antes `derivacion-incompleta` con waiver).
 */
import { discoverCarrier, edgeProfile, registerSentinelProbe } from "./sentinel.js";
import type { CarrierPath, CarrierStep, SlotStatus } from "./sentinel.js";
import type { EdgeContext, EdgeExtractor, EdgeFacts } from "./types.js";
import type { AstNode, FileUnit } from "../../detect/types.js";

const SLOT_SUPERCLASS_CARRIER = "herencia:carrier";

/** `class SentinelChild extends SentinelBase` y su equivalente por lenguaje
 *  — mismos nombres centinela en todos para que el par `expect` sea único.
 *  C# agrega una interfaz (`SentinelIfaceA`) SOLO para la prueba de
 *  ambigüedad de `warmUp` (ver docstring del módulo); no participa de
 *  `expect`. Python agrega un segundo mixin (`SentinelMixin`) para poder
 *  confirmar, con el propio centinela, que la herencia múltiple real de
 *  Python emite dos aristas y no una (ver `herencia.test.ts`). La familia
 *  JS/TS agrega además una FORMA DE EXPRESIÓN (`const SentinelExprHolder =
 *  class SentinelExprChild extends SentinelBase {}`, nombre distinto —
 *  `SENTINEL_EXPR_CHILD_NAME` — para que `warmUp` pueda descubrir SU PROPIO
 *  camino sin pisar el de `expect`; ver docstring del módulo, "FORMA DE
 *  EXPRESIÓN DE CLASE"). Go queda deliberadamente FUERA: no tiene esta
 *  construcción (ver docstring). */
const SENTINEL: Readonly<Record<string, string>> = {
  ruby: `
class SentinelBase
end

class SentinelChild < SentinelBase
end
`,
  python: `
class SentinelBase:
    pass


class SentinelMixin:
    pass


class SentinelChild(SentinelBase, SentinelMixin):
    pass
`,
  javascript: `
class SentinelBase {}

class SentinelChild extends SentinelBase {}

const SentinelExprHolder = class SentinelExprChild extends SentinelBase {};
`,
  typescript: `
class SentinelBase {}

class SentinelChild extends SentinelBase {}

const SentinelExprHolder = class SentinelExprChild extends SentinelBase {};

interface SentinelIfaceChild extends SentinelBase {}
`,
  tsx: `
class SentinelBase {}

class SentinelChild extends SentinelBase {}

const SentinelExprHolder = class SentinelExprChild extends SentinelBase {};

interface SentinelIfaceChild extends SentinelBase {}
`,
  vue: `
class SentinelBase {}

class SentinelChild extends SentinelBase {}

const SentinelExprHolder = class SentinelExprChild extends SentinelBase {};

interface SentinelIfaceChild extends SentinelBase {}
`,
  java: `
class SentinelBase {}

class SentinelChild extends SentinelBase {}

interface SentinelIfaceChild extends SentinelBase {}
`,
  csharp: `
class SentinelBase {}
interface SentinelIfaceA {}

class SentinelChild : SentinelBase, SentinelIfaceA {}

interface SentinelIfaceChild : SentinelBase {}
`,
};

/** Sólo para la prueba de ambigüedad de C# — no es parte de la firma
 *  congelada `expect: {from, to}` (ver docstring de módulo, AMBIGÜEDAD
 *  DECLARADA). */
const CSHARP_INTERFACE_PROBE_NAME = "SentinelIfaceA";

/** Sólo para descubrir el camino de la FORMA DE EXPRESIÓN (JS/TS/TSX/Vue) —
 *  ver docstring del módulo. No participa de `expect`, mismo motivo que
 *  `CSHARP_INTERFACE_PROBE_NAME` arriba: es una sonda ADICIONAL sobre el
 *  MISMO centinela, no una segunda firma. */
const SENTINEL_EXPR_CHILD_NAME = "SentinelExprChild";

/** Sólo para descubrir el camino de la FORMA DE DECLARACIÓN DE INTERFAZ
 *  (`interface X extends Y` en java/typescript/tsx/vue, `interface X : Y` en
 *  csharp) — ver "LA FORMA DE INTERFAZ" en el docstring del módulo. Como
 *  `SENTINEL_EXPR_CHILD_NAME`, es una sonda ADICIONAL sobre el MISMO
 *  centinela, no una segunda firma congelada: `discoverCarrier` devuelve
 *  `null` sola para todo lenguaje cuyo `SENTINEL` no la declare (ruby,
 *  python, javascript). */
const SENTINEL_IFACE_CHILD_NAME = "SentinelIfaceChild";

/** Compara dos caminos ignorando el índice/nombre final: mismo `ownerType`,
 *  mismos campos y `nodeType` en cada paso salvo el último. Si dos caminos
 *  conceptualmente distintos ("cuál es la clase base" vs. "cuál es una
 *  interfaz") comparten esta forma, el lenguaje no distingue las dos
 *  relaciones estructuralmente — mismo mecanismo que
 *  `interfaz-declarada.ts#sameShapeExceptFinalIndex`, aplicado en la
 *  dirección opuesta. */
function sameShapeExceptFinalIndex(a: CarrierPath, b: CarrierPath): boolean {
  if (a.ownerType !== b.ownerType || a.steps.length !== b.steps.length) return false;
  for (let i = 0; i < a.steps.length; i++) {
    const sa = a.steps[i]!;
    const sb = b.steps[i]!;
    if (sa.nodeType !== sb.nodeType) return false;
    if (i < a.steps.length - 1 && sa.field !== sb.field) return false;
  }
  return true;
}

/** Perfil por lenguaje, llenado por `warmUp` — el mismo puente async→sync
 *  que `interfaz-declarada.ts` documenta: `web-tree-sitter` no tiene una API
 *  de parseo síncrona, así que alguien (el test, o eventualmente el arranque
 *  real de `analyzeFile`) tiene que parsear `SENTINEL[language]` UNA vez por
 *  proceso y registrar el resultado antes de que `extract()` (que debe
 *  seguir siendo síncrono sobre el AST vivo) pueda usarlo. `exprCarrier`:
 *  el camino de la FORMA DE EXPRESIÓN (ver docstring del módulo) — `null`
 *  para cualquier lenguaje cuyo `SENTINEL` no declare
 *  `SENTINEL_EXPR_CHILD_NAME` (todos salvo JS/TS/TSX/Vue). */
interface LanguageProfile {
  readonly status: SlotStatus;
  readonly carriers: readonly CarrierPath[];
  readonly exprCarrier: CarrierPath | null;
  /** Camino de la forma `interface X extends/: Y` — `null` para los lenguajes
   *  cuyo `SENTINEL` no la declara. Ver "LA FORMA DE INTERFAZ". */
  readonly ifaceCarrier: CarrierPath | null;
}
const languageProfile = new Map<string, LanguageProfile>();

/**
 * Registra la sonda YA PARSEADA de `SENTINEL[language]` (vía
 * `registerSentinelProbe`, `sentinel.ts`) y resuelve el perfil de ese
 * lenguaje para este extractor, incluyendo la verificación de ambigüedad de
 * C# y el descubrimiento de la forma de expresión JS/TS (ver docstring del
 * módulo). Expuesto para que el test — o, eventualmente, el arranque
 * real — lo llame una vez por lenguaje antes de construir el
 * `EdgeContext` que `extract()` recibe.
 *
 * C# YA NO vacía `carriers` cuando detecta la ambigüedad: `status:
 * "ambiguous"` sigue reportándose (es un hecho real sobre el lenguaje), pero
 * `extract()` ahora decide POR DECLARACIÓN REAL, no por lenguaje entero —
 * ver "AMBIGÜEDAD DECLARADA — C#, Y LA SEÑAL ESTRUCTURAL QUE LA ACOTA" en el
 * docstring del módulo.
 */
export function warmUp(language: string, sentinelRoot: AstNode): { readonly status: SlotStatus; readonly carriers: readonly CarrierPath[] } {
  registerSentinelProbe(language, extractor.id, sentinelRoot);
  const profile = edgeProfile(language, extractor);
  let status = profile.status;
  const carriers = profile.carriers;
  // Sin gate de lenguaje (nunca `if (language === "csharp")` acá — ese atajo
  // se removió por prohibido, ver "AMBIGÜEDAD DECLARADA" arriba): la sonda
  // corre IGUAL para los 7 lenguajes, y `discoverCarrier` vuelve `null` sola
  // para cualquiera cuyo `SENTINEL[language]` no declare
  // `CSHARP_INTERFACE_PROBE_NAME` (hoy, sólo el de C#) — confirmado
  // empíricamente: con el gate removido, los 27 tests de este archivo (todos
  // los lenguajes) siguen pasando idénticos, C# incluido.
  if (carriers[0]) {
    const ifacePath = discoverCarrier(sentinelRoot, extractor.expect.from, CSHARP_INTERFACE_PROBE_NAME);
    if (ifacePath && sameShapeExceptFinalIndex(carriers[0], ifacePath)) {
      status = "ambiguous";
      // Los `carriers` NO se vacían acá — ver el docstring del módulo y de
      // esta función: `extract()` los sigue necesitando para localizar el
      // contenedor de CADA declaración real y decidir, por su aridad
      // efectiva, si esta arista reclama algo.
    }
  }
  const exprCarrier = discoverCarrier(sentinelRoot, SENTINEL_EXPR_CHILD_NAME, extractor.expect.to);
  const ifaceCarrier = discoverCarrier(sentinelRoot, SENTINEL_IFACE_CHILD_NAME, extractor.expect.to);
  languageProfile.set(language, { status, carriers, exprCarrier, ifaceCarrier });
  return { status, carriers };
}

/** Sólo para inspección en test/reporte — no participa de `extract()`. */
export function profileFor(language: string): { readonly status: SlotStatus; readonly carriers: readonly CarrierPath[] } | undefined {
  return languageProfile.get(language);
}

/** Copia LOCAL de `graph/symbols.ts#splitQualifiedSegments` (misma función,
 *  mismo separador — `references.ts` lleva otra copia idéntica por el mismo
 *  motivo: los archivos de esa ola no se importan entre sí). Un namespace
 *  COMPUESTO (C# `namespace Newtonsoft.Json {...}`) es UN SOLO nodo cuyo
 *  `.text` trae los puntos adentro; partirlo en un frame por segmento es lo
 *  que `graph/symbols.ts` ya hace para el MISMO nodo — si acá se empujara
 *  el texto entero como un frame glued, `fromPath` no calzaría contra
 *  `container` y la cascada de resolución (que compara elemento a
 *  elemento) nunca encontraría el símbolo. No-op para un identificador
 *  simple (el caso común, 6 de 7 lenguajes de este extractor). */
function splitQualifiedSegments(text: string): readonly string[] {
  const parts = text.split(/::|\./).filter((s) => s.length > 0);
  return parts.length > 0 ? parts : [text];
}

function firstChildOfType(node: AstNode, type: string): AstNode | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i) as AstNode | null;
    if (child && child.type === type) return child;
  }
  return null;
}

function hasField(node: AstNode, field: string): boolean {
  return node.childForFieldName(field) !== null;
}

function isFunctionLikeNode(node: AstNode): boolean {
  return hasField(node, "body") && (hasField(node, "parameters") || hasField(node, "parameter_list"));
}

/** Verificación estructural GENÉRICA (mismo par de campos que
 *  `code-grammar.ts#isClassLike` — body+name, no función — repetida acá
 *  LOCALMENTE, no importada: `code-grammar.ts` es de otro dueño y este
 *  archivo no lo toca) para la FORMA DE EXPRESIÓN de clase — ver "FORMA DE
 *  EXPRESIÓN DE CLASE" en el docstring del módulo. `file.sets.classNodes`
 *  (derivado del `probeSource` COMPARTIDO de `code-analyzer.ts`) nunca
 *  ejercita esta forma, así que nunca la reconoce; esta prueba, anclada
 *  ADEMÁS al `node.type` que la PROPIA sonda de este extractor descubrió
 *  (`exprPath.ownerType`, nunca una string libre), es la garantía extra de
 *  que sólo se trata como "clase" un nodo que de verdad tiene cuerpo y
 *  nombre — no cualquier cosa que comparta el mismo `node.type`. */
function looksClassExpressionLike(node: AstNode): boolean {
  return hasField(node, "body") && hasField(node, "name") && !isFunctionLikeNode(node);
}

/** Aplica el prefijo del camino descubierto (todos los pasos salvo el
 *  último) desde el nodo declarante hasta el CONTENEDOR de la superclase,
 *  buscando por `nodeType` en los pasos posicionales (nunca por índice
 *  absoluto: el índice de un hijo sin campo puede desplazarse entre
 *  instancias reales — p.ej. una clase JS sin `extends` no tiene
 *  `class_heritage` en absoluto, así que el hijo que ocuparía esa posición
 *  cambia — mismo razonamiento que `interfaz-declarada.ts#locateContainer`). */
function locateContainer(from: AstNode, prefix: readonly CarrierStep[]): AstNode | null {
  let current: AstNode | null = from;
  for (const step of prefix) {
    if (!current) return null;
    current = step.field !== null ? (current.childForFieldName(step.field) as AstNode | null) : firstChildOfType(current, step.nodeType);
  }
  return current;
}

/** Guarda genérica de forma: el resultado final tiene que parecer un
 *  identificador de programa de verdad, aplicada IDÉNTICAMENTE a los 7
 *  lenguajes (mismo estilo que `TERNARY_NAME`/`LOOP_WORD` en
 *  `code-grammar.ts`) — protege contra el caso límite de un contenedor
 *  vacío/desplazado que termine apuntando a un token anónimo, y es la ÚNICA
 *  razón por la que `metaclass=X`/`Struct.new(:a)`/`mixin(Base)` no aportan
 *  candidato (nunca una regla por nombre). */
const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Un grupo de ARGUMENTOS DE TIPO al final del texto: `<...>` (java, csharp,
 *  la familia JS/TS) o `[...]` (python). Puntuación de gramática, nunca
 *  vocabulario de dominio — el mismo par de delimitadores que pela
 *  `interfaz-declarada.ts` para la misma pregunta en la dirección opuesta. */
const TYPE_ARGUMENT_SUFFIX = /(?:<[\s\S]*>|\[[\s\S]*\])\s*$/;

/**
 * Pela argumentos de tipo y calificación del TEXTO de una referencia a un
 * tipo — ver "EL HUECO DE GENÉRICOS" en el docstring del módulo. `null`
 * cuando lo que queda no es un identificador de programa (una expresión, un
 * argumento de palabra clave, un literal): eso NO aporta candidato, que es
 * exactamente lo que hacía antes la combinación `qualifiedNameOf` +
 * `leaf.childCount !== 0`, sólo que ahora sin ceguera a los genéricos.
 * Los dos separadores (`::` y `.`) son los mismos que `graph/resolve.ts
 * #splitQualifierText` ya trata indistintamente del lado consumidor, así que
 * el `toQualifier` que sale de acá hace roundtrip limpio por la cascada.
 */
function peelTypeReference(raw: string): { name: string; qualifier: readonly string[] } | null {
  const stripped = raw.replace(TYPE_ARGUMENT_SUFFIX, "").trim();
  const parts = stripped.split(/::|\./).map((p) => p.trim());
  if (parts.length === 0) return null;
  if (!parts.every((p) => IDENTIFIER_RE.test(p))) return null;
  return { name: parts[parts.length - 1]!, qualifier: parts.slice(0, -1) };
}

/**
 * Todos los candidatos NOMBRADOS y RESOLUBLES dentro del contenedor: para
 * Ruby/Java/JS/TS/TSX/Vue hay exactamente uno (herencia simple); para Python
 * puede haber varios (herencia múltiple real — `class X(A, B)`), y esto los
 * emite a TODOS sin necesitar una rama aparte. La ARIDAD que devuelve esta
 * función es además la que decide la ambigüedad de C# (ver el docstring del
 * módulo): un candidato que no se cuenta acá no sólo se pierde, corre la
 * numeración de los demás.
 */
function resolvableCandidates(container: AstNode): { name: string; qualifier: readonly string[] }[] {
  const out: { name: string; qualifier: readonly string[] }[] = [];
  for (let i = 0; i < container.childCount; i++) {
    const child = container.child(i) as AstNode | null;
    if (!child || !child.isNamed) continue;
    const peeled = peelTypeReference(child.text);
    if (!peeled) continue;
    out.push(peeled);
  }
  return out;
}

export const extractor: EdgeExtractor<"extends"> = {
  id: "herencia",
  kind: "extends",
  title: "Herencia / clase base",
  needs: ["herencia"],
  slots: [SLOT_SUPERCLASS_CARRIER],
  sentinel: SENTINEL,
  expect: { from: "SentinelChild", to: "SentinelBase" },
  // Go: legítimamente ausente (no tiene clases — ver docstring). C#: ver
  // AMBIGÜEDAD DECLARADA arriba (misma bandera que usa `interfaz-declarada.ts`
  // para su propia ambigüedad en la dirección opuesta).
  optional: true,

  extract(file: FileUnit, ctx: EdgeContext): readonly EdgeFacts[] {
    const carriers = ctx.carriers(SLOT_SUPERCLASS_CARRIER);
    const path = carriers[0];
    if (!path || path.steps.length === 0) return [];
    const prefix = path.steps.slice(0, -1);

    const profile = languageProfile.get(file.language);
    const exprPath = profile?.exprCarrier ?? null;
    const exprPrefix = exprPath && exprPath.steps.length > 0 ? exprPath.steps.slice(0, -1) : null;
    // Forma de DECLARACIÓN DE INTERFAZ — ver "LA FORMA DE INTERFAZ" en el
    // docstring del módulo. Sólo cuenta si su `ownerType` es DISTINTO del de
    // la forma de clase: si una gramática usara el mismo nodo para las dos, ya
    // estaría cubierta por `path` y una segunda pasada duplicaría la arista.
    const ifacePath = profile?.ifaceCarrier ?? null;
    const ifacePrefix = ifacePath && ifacePath.steps.length > 0 && ifacePath.ownerType !== path.ownerType ? ifacePath.steps.slice(0, -1) : null;
    // C# comparte `base_list` con `interfaz-declarada.ts` — ver "AMBIGÜEDAD
    // DECLARADA — C#" en el docstring del módulo. Derivado por `warmUp`
    // (nunca un `if (file.language === "csharp")` acá): si mañana OTRO
    // lenguaje compartiera la misma lista con su propia arista `implements`,
    // esta bandera lo capturaría igual, sin un atajo nuevo por nombre.
    const sharesListWithInterfaces = profile?.status === "ambiguous";

    const facts: EdgeFacts[] = [];
    const classStack: string[] = [];

    const visit = (node: AstNode): void => {
      let pushedCount = 0;
      if (node.isNamed) {
        // CONTENEDOR DE SCOPE, cualquier miembro de `classNodes` — namespace
        // (C# `namespace_declaration`), interfaz/struct/enum/record además de
        // clase — NO sólo `path.ownerType`. Ver "FROMPATH DEBE INCLUIR TODO
        // CONTENEDOR ANIDADO" en el docstring del módulo: `graph/symbols.ts`
        // arma `container` con el MISMO criterio (cualquier `classNodes`,
        // genérico) para poder resolver `fromPath` contra el símbolo real —
        // si acá sólo empujáramos `path.ownerType`, un C# `namespace Foo {
        // class X : Y {} }` produciría `fromPath: ["X"]` en vez de
        // `["Foo","X"]`, y la cascada de resolución (que sí espera el
        // camino completo) nunca encontraría el nodo — mismo criterio que
        // YA usa `mixin.ts#collect` (`classNodes.has(node.type)` a secas,
        // nunca atado a un `ownerType` fijo).
        const isContainer = file.sets.classNodes.has(node.type);
        // Forma de expresión JS/TS (`module.exports = class X extends Y {}`)
        // — ver "FORMA DE EXPRESIÓN DE CLASE" en el docstring del módulo.
        // Reconocida por el `node.type` que la PROPIA sonda descubrió
        // (`exprPath.ownerType`), NUNCA vía `classNodes` (el probe
        // compartido no la ejercita) — con la verificación estructural
        // extra de `looksClassExpressionLike` para no confiar sólo en la
        // igualdad de string.
        const isExpressionForm =
          !isContainer && exprPath !== null && exprPrefix !== null && node.type === exprPath.ownerType && looksClassExpressionLike(node);
        if (isContainer || isExpressionForm) {
          const nameNode = node.childForFieldName("name") as AstNode | null;
          const name = nameNode?.text ?? null;
          if (name !== null && nameNode) {
            // Un namespace COMPUESTO (C# `namespace Newtonsoft.Json {...}`,
            // la forma que envuelve casi todo el repo real) tiene un `name`
            // que es UN SOLO nodo cuyo `.text` trae los puntos adentro —
            // `graph/symbols.ts#splitQualifiedSegments` (Ola 9, A1, ya
            // medida y arreglada ahí: "namespace COMPUESTO... 86,5% de los
            // candidatos rechazados") empuja UN frame POR SEGMENTO porque
            // `namespace A.B` es estructuralmente idéntico a `namespace A {
            // namespace B {...} }`, y `resolve.ts#isVisibleFrom` compara
            // `container`/`scope` elemento a elemento. Copia LOCAL (mismo
            // motivo que `references.ts` lleva la suya: el split de
            // archivos de esa ola prohíbe importar entre módulos) del
            // mismo separador — no-op para un identificador simple (el
            // caso común, 6 de 7 lenguajes de este extractor).
            const segments = splitQualifiedSegments(name);
            for (const seg of segments) classStack.push(seg);
            pushedCount = segments.length;

            // Sólo el nodo que ESTE extractor sabe leer (el `ownerType` que
            // su propia sonda descubrió, o la forma de expresión) aporta una
            // superclase — un namespace/interfaz/struct/enum/record que sólo
            // pasó el filtro `isContainer` de arriba (pero no es el
            // `ownerType` real) sólo contribuye SCOPE, nunca superclase
            // (p.ej. C# `namespace_declaration` no tiene `base_list`).
            const isDeclarationForm = isContainer && node.type === path.ownerType;
            const isInterfaceForm = isContainer && !isDeclarationForm && ifacePath !== null && ifacePrefix !== null && node.type === ifacePath.ownerType;
            const activePrefix = isDeclarationForm ? prefix : isInterfaceForm ? ifacePrefix : isExpressionForm ? exprPrefix : null;
            if (activePrefix) {
              const ownerLabel = isDeclarationForm ? path.ownerType : isInterfaceForm ? ifacePath!.ownerType : exprPath!.ownerType;
              const container = locateContainer(node, activePrefix);
              if (container) {
                const candidates = resolvableCandidates(container);
                // AMBIGÜEDAD DECLARADA — C# (ver docstring del módulo): una
                // lista compartida de UN candidato — esta arista lo reclama
                // como clase base (residual de error medido y documentado,
                // ver resultado final). Una lista de 2+ candidatos: la
                // posición 0 sigue siendo genuinamente indistinguible de una
                // interfaz (contraejemplo real en el corpus) — no se reclama
                // nada acá; `interfaz-declarada.ts` reclama las posiciones
                // 1..N, esas sí ciertas por la aridad de C#.
                // `sharesListWithInterfaces` describe una lista que MEZCLA clase
                // base con interfaces (el `base_list` de una CLASE en C#). Una
                // declaración de INTERFAZ no puede tener clase base en ninguna
                // de las gramáticas de este extractor, así que su lista no
                // mezcla nada: todos sus elementos son supertipos y se
                // reclaman todos, sin la restricción de aridad — misma
                // ARIDAD/ORDEN que argumenta la ambigüedad de C# arriba,
                // aplicada a la otra forma de declaración.
                const chosen = sharesListWithInterfaces && !isInterfaceForm ? (candidates.length === 1 ? candidates : []) : candidates;
                for (const { name: toName, qualifier } of chosen) {
                  facts.push({
                    extractorId: extractor.id,
                    kind: "extends",
                    fromPath: [...classStack],
                    toName,
                    toQualifier: qualifier,
                    provenance: "declared",
                    // El campo genérico `name` (el MISMO que ya usa `classStack`
                    // dos líneas arriba, no un campo nuevo) ancla la fila real de
                    // la declaración: el identificador de la clase está SIEMPRE
                    // en la misma línea física que la palabra clave de clase, en
                    // los lenguajes/formas donde este extractor emite — mientras
                    // que `node.startPosition` (el nodo `ownerType` ENTERO) incluye,
                    // en Java, cualquier anotación (`@GwtCompatible`) que preceda
                    // la declaración, porque esas anotaciones son hijas
                    // POSICIONALES del mismo nodo `class_declaration` sin que el
                    // extractor tenga por qué reconocerlas por nombre — repro
                    // real: guava `ImmutableList.java` (`@GwtCompatible` +
                    // `@SuppressWarnings` antes de `public abstract class`, ver
                    // `herencia.test.ts`).
                    startLine: nameNode.startPosition.row + 1,
                    endLine: node.endPosition.row + 1,
                    via: `${ownerLabel} -> ${activePrefix.map((s) => s.field ?? `#${s.nodeType}`).join(" -> ")}`,
                  });
                }
              }
            }
          }
        }
      }
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i) as AstNode | null;
        if (child) visit(child);
      }
      for (let i = 0; i < pushedCount; i++) classStack.pop();
    };
    visit(file.root);
    return facts;
  },
};
