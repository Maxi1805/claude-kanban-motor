/**
 * `exposed-container-traversal` — Ola AE, frente AE9. EL ANCLA-FUERZA DE ITERATOR.
 *
 * ────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE, CON EL NÚMERO QUE LO MOTIVA
 * ────────────────────────────────────────────────────────────────────────
 *
 * Iterator tenía dos anclas —`duplication` y `distributed-duplication`— y las
 * dos son el MISMO síntoma: *dos bloques de texto se parecen*. Medido por AE9
 * sobre un volcado propio del día en las dos poblaciones (13 bibliotecas +
 * 8 aplicaciones de `corpus-app/`):
 *
 *   **14 hipótesis de Iterator en 21 repos — 10 en biblioteca, 4 en
 *   aplicación — las 14 `ausente`, y 0 de 10 juzgadas verdaderas en toda la
 *   historia del proyecto.**
 *
 * O sea: el patrón no sufre la patología de Facade/Decorator (no puede decir
 * `ausente`); sufre la contraria — **sólo puede decir `ausente`, casi nunca
 * habla, y cuando habla se equivoca**. La causa es la misma de siempre: *que
 * dos bloques se parezcan no es la situación que Iterator resuelve*. El ancla
 * vieja encuentra duplicación; la duplicación de un recorrido puede ser un
 * Extract Method y casi siempre lo es.
 *
 * ────────────────────────────────────────────────────────────────────────
 * LA FUERZA QUE ITERATOR RESUELVE, ESCRITA COMO LA RESUELVE EL PATRÓN
 * ────────────────────────────────────────────────────────────────────────
 *
 * GoF, *Design Patterns*, Iterator/Intent: *"provide a way to access the
 * elements of an aggregate object sequentially **without exposing its
 * underlying representation**"*.
 *
 * > **El recorrido de una estructura vive en los CLIENTES y está escrito
 * > contra la REPRESENTACIÓN CRUDA de otro tipo: el cliente toma el contenedor
 * > de un tercero (`x.items`) y lo recorre POR POSICIÓN, con un cursor propio.
 * > El dueño no ofrece ninguna forma de recorrerlo, así que cada cliente tiene
 * > que saber cómo está representado — y cambiar la representación obliga a
 * > tocarlos a todos.**
 *
 * Es una propiedad de DÓNDE VIVE EL RECORRIDO y de CUÁNTOS lo conocen, no del
 * parecido entre dos bloques. Dos copias idénticas de un `for` sobre un array
 * local no dicen nada de ninguna representación ajena; un solo `for` con
 * cursor sobre `otro.contenedor[i]`, escrito en tres archivos que no son el
 * del dueño, sí.
 *
 * ────────────────────────────────────────────────────────────────────────
 * LAS CINCO CONDICIONES, Y LA INTENCIÓN QUE VERIFICA CADA UNA
 * ────────────────────────────────────────────────────────────────────────
 *
 * (1) **EL RECORRIDO ES POSICIONAL** — hay un subíndice `E[i]` donde `i` es un
 *     cursor propio (incrementado con `++`, `+= 1` o `i = i + 1` dentro del
 *     mismo miembro function-like).
 *     INTENCIÓN: *"el cliente sabe que la representación es POSICIONAL"*. Un
 *     `for e in coleccion` recorre por protocolo y no expone nada: si mañana
 *     el contenedor pasa a ser un mapa o un flujo perezoso, sigue compilando.
 *     Un cursor entero indexando sí expone la representación, y es lo único
 *     que Iterator existe para tapar. Es EXACTAMENTE el mismo hecho que el
 *     `required` de `hypotheses/iterator.ts#hasManualCursorIndexing` ya usa
 *     desde la Ola 10, leído acá del ÁRBOL en vez del texto normalizado de un
 *     clon — o sea, sin depender de que además haya duplicación.
 *
 * (2) **EL CONTENEDOR ES DE OTRO** — el objeto del subíndice es un acceso a
 *     miembro `X.y` cuyo receptor `X` no es `this`/`self` ni el receptor de
 *     método de Go.
 *     INTENCIÓN: *"la representación que se recorre NO es propia"*. Iterator
 *     oculta la representación interna DE UN TIPO frente a sus CLIENTES; si el
 *     contenedor es propio (`this.items[i]`) el recorrido ya está adentro y no
 *     hay ninguna exposición que tapar. Y como el objeto tiene que ser un
 *     ACCESO A MIEMBRO, un array recibido por parámetro (`min(float... a)`,
 *     `a[i]`) nunca entra: es el falso que la Ola V midió en
 *     `guava/.../Floats.java:209` y que obligó a inventar `not-applicable` en
 *     `hypotheses/iterator.ts` — acá no puede nacer.
 *
 * (3) **EL DUEÑO ES UN TIPO Y VIVE EN OTRO ARCHIVO** — el grafo resuelve `X.y`
 *     (arista `references` con role `receiver-member` saliendo de un símbolo de
 *     ESTE archivo) a un nodo miembro contenido por un nodo `class-like`/
 *     `namespace-like` declarado en un archivo DISTINTO.
 *     INTENCIÓN: *"hay un TIPO cuya representación se está filtrando, y la
 *     frontera que se cruza es real"*. Sin dueño no hay representación interna
 *     de nadie —es un dato suelto— y la respuesta correcta no es Iterator. Y si
 *     el dueño estuviera en el mismo archivo, la mitigación más barata es un
 *     método privado ahí mismo: proponer un tipo iterador sería más caro que el
 *     problema (mismo argumento, y el mismo umbral de forma, que la condición
 *     (3) de `inter-file/repeated-collaborator-set.ts`).
 *
 * (4) **ESCALA: LA REPRESENTACIÓN CRUDA YA ES UN CONTRATO DE HECHO** — ese
 *     miembro tiene `references(role receiver-member)` desde >= `archivosCliente`
 *     archivos DISTINTOS, ninguno el del dueño.
 *     UMBRAL `archivosCliente = 3`, y la razón va ESCRITA ANTES DE MEDIR: con UN
 *     cliente externo la mitigación barata es mover el recorrido adentro del
 *     dueño (Move Method) y no hace falta abstracción nueva; con DOS, extraer
 *     una función compartida sigue siendo más barato que introducir un tipo
 *     iterador —es literalmente el argumento con el que AD4 fijó `lugares = 3`
 *     y el que AC2 midió que le FALTABA a su ancla de State—; a partir de TRES
 *     la representación cruda ya es un contrato público de hecho y cambiarla es
 *     una cirugía de escopeta. Ése es exactamente el costo que Iterator compra,
 *     y por debajo de tres el patrón NO PAGA.
 *
 * (5) **RESOLUCIÓN VERIFICADA: EL DUEÑO NO OFRECE YA UN RECORRIDO** — en sus
 *     DOS formas, que el grafo ve distinto y por eso se chequean por separado:
 *     (5a) **el protocolo no está formalizado**: no existe una interfaz `I` con
 *          >= 2 implementadores tal que el dueño la `implements|satisfies` y
 *          declare un miembro de aridad 0 que `I` también declara.
 *          INTENCIÓN: *"si el tipo ya publica un protocolo de iteración, el
 *          Iterator YA ESTÁ"* — lo que falta entonces es que este cliente lo
 *          use, que es OTRA refactorización. Es el mismo hecho que
 *          `hypotheses/iterator.ts#findTraversalMember` ya sabe leer y que este
 *          detector consulta por su cuenta (no puede importarlo: `detect/*` no
 *          importa de `hypotheses/*`, capas invertidas).
 *     (5b) **la puerta de recorrido no existe ya**: no existe un miembro
 *          function-like del dueño, de aridad 0, DISTINTO del contenedor, que
 *          referencie al MISMO contenedor (`references` con role
 *          `receiver-member`) y que además sea invocado desde >= 2 archivos
 *          cliente distintos.
 *          INTENCIÓN: *"lo que falta es la PUERTA, no su uso"*. Si el dueño ya
 *          publica un miembro sin argumentos que toca ese mismo contenedor y
 *          dos o más clientes ya lo llaman, el recorrido ya está encapsulado en
 *          algún grado: la mitigación correcta es "usá el que ya hay". Es la
 *          MISMA condición (5b) que AD4 midió que descarta el 91 % de sus
 *          candidatos, traducida al vocabulario de este patrón.
 *
 * ────────────────────────────────────────────────────────────────────────
 * QUÉ NO CHEQUEA, DECLARADO Y NO ESCONDIDO
 * ────────────────────────────────────────────────────────────────────────
 *
 * 1. **NO prueba que los OTROS clientes recorran.** La condición (4) cuenta
 *    archivos que REFERENCIAN el contenedor, no que lo recorran: probar el
 *    recorrido exige el árbol, y un detector `intra-file` ve UN archivo por
 *    vez (los árboles de los demás ya se liberaron — `detect/types.ts`,
 *    `RepoFunctionUnit` "sin `node`"). Lo que sí queda probado con árbol es el
 *    recorrido de ESTE cliente. La consecuencia práctica es que cuando N
 *    clientes recorren de verdad, el detector emite N hallazgos del mismo
 *    contenedor —uno por archivo— y la repetición se lee ahí.
 * 2. **NO mira el ORDEN ni el tipo del contenedor.** No hay tipos: que `X.y`
 *    sea una secuencia se infiere de que alguien la indexa con un cursor, que
 *    es la única evidencia disponible sin sistema de tipos. Un mapa indexado
 *    por una variable entera que además se incrementa entraría; es raro y
 *    queda declarado.
 * 3. **NO garantiza el DUEÑO cuando la arista es ambigua, y lo dice.** Las
 *    aristas `provenance: "ambiguous"` SÍ entran —ver la nota larga en
 *    `buildGraphFacts`, con el número que obligó: **el 74,9 % de las
 *    `references(receiver-member)` de los 13 repos son ambiguas, y en 6 de 13
 *    lo son en >= 99 %; con el filtro de `confidentEdges` puesto este detector
 *    emitía CERO en los 21 repos**— pero lo ambiguo VIAJA COMO AMBIGUO: cada
 *    hallazgo publica si su dueño salió de una arista ambigua y cuántos otros
 *    destinos posibles llevaba, y la hipótesis lo pone en su `toConfirm`.
 *
 * ────────────────────────────────────────────────────────────────────────
 * GENERICIDAD
 * ────────────────────────────────────────────────────────────────────────
 *
 * Cero léxico de dominio: ninguna lista de nombres de campo, de clase, de
 * método ni de protocolo (`next`/`hasNext`/`each`/`__iter__` están PROHIBIDOS
 * por CONTRATO-F10.md §3 y no aparecen). Las listas de texto son **vocabulario
 * de GRAMÁTICA**, aplicado idénticamente a los 9 lenguajes: `SELF_WORDS`
 * (`this`/`self`, la misma de `temporary-field.ts`/`optional-behavior-flags.ts`),
 * `SUBSCRIPT_NODE_TYPE` (los seis deletreos del nodo de subíndice) y
 * `CURSOR_INCREMENT` (sintaxis de operador: `++`, `+= 1`, `i = i + 1`), esta
 * última copiada VERBATIM de `hypotheses/iterator.ts` para que el ancla nueva
 * y el `required` viejo del patrón reconozcan exactamente la misma forma.
 *
 * DUPLICACIÓN DECLARADA: `namedChildren`, `objectOf`, `memberNameOf` y
 * `goReceiverOf` son la misma copia adaptada que `temporary-field.ts` ya
 * declara frente a `lazy-init-repetida.ts`, `optional-behavior-flags.ts` y
 * `manual-notification.ts` — `detect/*` no puede importar de `hypotheses/*` y
 * no existe un módulo de primitivas compartido entre detectores. Se copia y se
 * dice, igual que esos archivos.
 *
 * PATRÓN AL QUE ALIMENTA: **Iterator** (`hypotheses/iterator.ts`), que suma
 * este kind a su array `anchors` SIN sacar ninguno de los dos viejos.
 */
import { pisoDeclarado } from "../thresholds.js";
import {
  edgeHasRole,
  memberSignatures,
  type CodeGraph,
  type CodeGraphEdge,
  type CodeGraphNode,
  type GraphIndex,
} from "../../graph/types.js";
import type { AstNode, FileUnit, FunctionUnit, IntraFileDetector, RawFinding, RoleLocation, RunContext } from "../types.js";

type ThresholdKey = "archivosCliente";

export const EXPOSED_CONTAINER_TRAVERSAL_KIND = "exposed-container-traversal";

/** Condición (4) — ver el docstring del módulo para la razón, escrita antes de medir. */
export const MIN_CLIENT_FILES = 3;

/** Condición (5b): "dos o más clientes ya lo llaman" — presencia de uso real, no un piso calibrable. */
const GATE_MIN_CLIENTS_OF_EXISTING_DOOR = 2;

/** Condición (5a): el dueño MÁS otro implementador real — mismo criterio que `hypotheses/iterator.ts#findTraversalMember`. */
const MIN_IMPLEMENTERS = 2;

/** Mismo vocabulario que `temporary-field.ts#SELF_WORDS` / `optional-behavior-flags.ts`. */
const SELF_WORDS = new Set(["this", "self"]);
/** Mismo criterio que `graph/references.ts#RECEIVER_FIELDS` y `manual-notification.ts#OBJECT_FIELDS`. Es el slot del RECEPTOR de un acceso a miembro (`X` en `X.y`). */
const OBJECT_FIELDS = ["object", "operand", "receiver"];
/** El slot de la COSA INDEXADA de un subíndice (`E` en `E[i]`) — `array` es el nombre que le da Java, los demás reusan los del receptor. */
const SUBSCRIPT_TARGET_FIELDS = ["array", "object", "operand", "receiver"];
const COMMENT_NODE_TYPE = /comment/i;
/** Los seis deletreos del nodo de SUBÍNDICE en las 9 gramáticas (JS/TS, Python, Go, Java, C#, Ruby). */
const SUBSCRIPT_NODE_TYPE = /^(subscript(_expression)?|index_expression|array_access|element_access_expression|element_reference)$/;
/** Los deletreos del nodo HOJA que nombra un miembro (`y` en `X.y`) — sin esto, el índice de un subíndice anidado (`a[i][j]`) se lee como si fuera un nombre de miembro. */
const MEMBER_NAME_NODE_TYPE = /^([a-z_]*identifier|property_identifier|field_identifier|constant|name)$/;
/** Un nombre de miembro tiene forma de identificador: nunca una llamada, un literal ni una expresión. */
const IDENTIFIER_TEXT = /^[A-Za-z_]\w*$/;
/** Copiado VERBATIM de `hypotheses/iterator.ts#CURSOR_INCREMENT` — sintaxis de operador, sin nombres. */
const CURSOR_INCREMENT = /\b([A-Za-z_]\w*)\s*(?:\+\+|\+=\s*1\b)|\b([A-Za-z_]\w*)\s*=\s*\2\s*\+\s*1\b/g;

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed && !COMMENT_NODE_TYPE.test(c.type)) out.push(c);
  }
  return out;
}

function fieldOf(node: AstNode, fields: readonly string[]): AstNode | null {
  for (const f of fields) {
    const c = node.childForFieldName(f) as AstNode | null;
    if (c) return c;
  }
  return null;
}

function objectOf(node: AstNode): AstNode | null {
  return fieldOf(node, OBJECT_FIELDS);
}

/**
 * El nombre del miembro en `X.y`: el último hijo nombrado que no es el
 * receptor Y que ADEMÁS tiene forma de hoja-identificador. La segunda mitad no
 * es cosmética y está MEDIDA: sin ella, un subíndice ANIDADO (`a[i][j]`, que
 * también tiene un slot de "cosa indexada") se leía como si `j` fuera un
 * nombre de miembro — 71 de 71 candidatos sintácticos del corpus salían así,
 * y ninguno resolvía a nada.
 */
function memberNameOf(node: AstNode): string | null {
  const obj = objectOf(node);
  if (!obj) return null;
  for (let i = node.childCount - 1; i >= 0; i--) {
    const c = node.child(i) as AstNode | null;
    if (!c?.isNamed || c === obj) continue;
    if (!MEMBER_NAME_NODE_TYPE.test(c.type) || !IDENTIFIER_TEXT.test(c.text)) return null;
    return c.text;
  }
  return null;
}

/** Único vehículo de Go para "el receptor propio": `func (p *Foo) bar()` ⇒ `p` es `this`. */
function goReceiverName(fnNode: AstNode): string | null {
  const receiver = fnNode.childForFieldName("receiver") as AstNode | null;
  if (!receiver) return null;
  const decl = namedChildren(receiver)[0] ?? receiver;
  return (decl.childForFieldName("name") as AstNode | null)?.text ?? null;
}

/** Los identificadores que se INCREMENTAN dentro de `text` — mismo criterio que `hypotheses/iterator.ts`. */
function cursorNamesIn(text: string): ReadonlySet<string> {
  CURSOR_INCREMENT.lastIndex = 0;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = CURSOR_INCREMENT.exec(text))) {
    const name = m[1] ?? m[2];
    if (name) out.add(name);
  }
  return out;
}

function walk(node: AstNode, visit: (n: AstNode) => void): void {
  visit(node);
  for (const c of namedChildren(node)) walk(c, visit);
}

/* ────────────────────────────────────────────────────────────────────────
 * (1)+(2) — el sitio de recorrido, leído del árbol
 * ──────────────────────────────────────────────────────────────────────── */

export interface TraversalSite {
  /** El nombre del miembro contenedor: la `y` de `X.y[i]`. */
  readonly member: string;
  /** El texto del receptor: la `X` de `X.y[i]` — sólo para el mensaje, nunca para decidir. */
  readonly receiver: string;
  readonly cursor: string;
  readonly startLine: number;
  readonly endLine: number;
  /** El miembro function-like que contiene el sitio (`null` si el sitio está a nivel de archivo). */
  readonly enclosing: string | null;
  /**
   * OLA AU (AU4) — (U) EL CURSOR ESTÁ ACOTADO POR EL PROPIO CONTENEDOR.
   *
   * EL NÚMERO QUE LO MOTIVA: este kind mide **0 verdaderos de 7 juzgados, y
   * ninguno en toda la historia del proyecto**. De los 7 falsos, **DOS son la
   * misma forma y no tienen nada que ver con el dueño**: eslint
   * `multiline-comment-style.js:408` y `linebreak-style.js:121`, los dos
   * `sourceCode.lines[i - 1]` dentro de la CONSTRUCCIÓN DE LA UBICACIÓN DE UN
   * REPORT. El veredicto lo dice con todas las letras: *"El código necesita
   * acceso aleatorio por NÚMERO DE LÍNEA para construir la ubicación del
   * report, NO un recorrido"*, y del segundo: *"es UN acceso … acceso
   * aleatorio por número de línea, no recorrido"*.
   *
   * POR QUÉ LA CONDICIÓN (1) NO LOS VE: pide que el subíndice mencione *un*
   * nombre que en ALGÚN lado de la misma función se incremente con `++`/`+= 1`
   * (`cursorNamesIn` corre sobre el TEXTO ENTERO de la función). Una función
   * que en su línea 20 tiene un `for (let i = 0; …; i++)` sobre OTRA cosa y en
   * su línea 60 lee `sourceCode.lines[i - 1]` cumple la condición sin que
   * exista ningún recorrido de `lines`.
   *
   * EL HECHO QUE SÍ SEPARA, y es el que Iterator necesita: **un RECORRIDO
   * recorre el contenedor de punta a punta, así que el propio contenedor
   * aparece en el ENCABEZADO del loop que mueve el cursor** — `i <
   * x.lines.length`, `idx < tokens.size`, `for i := 0; i < len(s.items); i++`,
   * `while j < len(self.rows)`. Un ACCESO ALEATORIO no: el loop (si lo hay)
   * está acotado por otra cosa, o no hay loop en absoluto.
   *
   * ES LA MISMA PREGUNTA QUE EL PATRÓN HACE, no un umbral: Iterator tapa la
   * representación de un agregado que se RECORRE; si el cliente pide el
   * elemento k-ésimo, un iterador secuencial no lo cubre —y el propio
   * `caveat` del consejo que este detector emite ya lo dice: *"Si lo que hacen
   * es acceso aleatorio por posición, el recorrido secuencial no los cubre y
   * la respuesta correcta es otra API, no un iterador"*. El detector estaba
   * emitiendo hallazgos que su propio consejo declaraba fuera de alcance.
   *
   * SIN VOCABULARIO DE LENGUAJE: no se busca `length`/`size`/`len`/`Count`
   * —serían cuatro palabras de cuatro lenguajes— sino el NOMBRE DEL MIEMBRO
   * CONTENEDOR dentro del encabezado, que es el mismo hecho en los seis y ya
   * lo tiene el sitio. El tipo de nodo de loop sale del mismo
   * `LOOP_NODE_WORD` que `feature-envy-intra.ts` ya usa.
   *
   * ADITIVO EN ESTA OLA: viaja como EVIDENCIA (`(U) …`), no como compuerta,
   * hasta que el delta esté medido y publicado — ver el informe AU4.
   */
  readonly boundedByContainer: boolean;
}

/**
 * Los sitios de recorrido POSICIONAL sobre un contenedor AJENO de `fn`
 * (condiciones (1) y (2)). Exportada para que el test la ejercite sin
 * construir un `RunContext`, y para que una hipótesis pueda re-verificar la
 * forma contra su propio árbol vivo si algún día lo necesita.
 */
/** Mismo vocabulario de forma que `feature-envy-intra.ts#LOOP_NODE_WORD`: los
 *  nodos de repetición de las seis gramáticas, por PALABRA del tipo de nodo. */
const LOOP_NODE_WORD = /(^|_)(while|until|for|do)(_|$)/;
const LOOP_BODY_FIELDS = ["body", "consequence", "block"] as const;

interface LoopHeader {
  readonly startRow: number;
  readonly endRow: number;
  readonly header: string;
}

/**
 * Los ENCABEZADOS de todo loop de la función: el texto del nodo de loop hasta
 * donde empieza su cuerpo. Sin campo `body` (algunas gramáticas no lo
 * nombran), el encabezado es la PRIMERA LÍNEA del loop — que es donde vive la
 * condición en las seis gramáticas soportadas cuando el cuerpo es un bloque.
 */
function loopHeadersOf(node: AstNode): readonly LoopHeader[] {
  const out: LoopHeader[] = [];
  walk(node, (n) => {
    if (!LOOP_NODE_WORD.test(n.type)) return;
    const body = fieldOf(n, LOOP_BODY_FIELDS);
    const lines = n.text.split("\n");
    const headerRows = body ? Math.max(0, body.startPosition.row - n.startPosition.row) : 0;
    out.push({
      startRow: n.startPosition.row,
      endRow: n.endPosition.row,
      header: lines.slice(0, headerRows + 1).join("\n"),
    });
  });
  return out;
}

/** (U) — ¿algún loop que ENCIERRA este sitio menciona, en su encabezado, el
 *  propio contenedor Y el cursor? Ver el docstring de `TraversalSite`. */
function cursorBoundedByContainer(loops: readonly LoopHeader[], row: number, member: string, cursor: string): boolean {
  const memberRe = new RegExp(`\\b${member.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  const cursorRe = new RegExp(`\\b${cursor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  for (const loop of loops) {
    if (row < loop.startRow || row > loop.endRow) continue;
    if (memberRe.test(loop.header) && cursorRe.test(loop.header)) return true;
  }
  return false;
}

export function traversalSitesOf(fn: FunctionUnit): readonly TraversalSite[] {
  const node = fn.node;
  const cursors = cursorNamesIn(node.text);
  if (cursors.size === 0) return [];
  const selfNames = new Set(SELF_WORDS);
  const goReceiver = goReceiverName(node);
  if (goReceiver) selfNames.add(goReceiver);

  const loops = loopHeadersOf(node);
  const out: TraversalSite[] = [];
  walk(node, (n) => {
    if (!SUBSCRIPT_NODE_TYPE.test(n.type)) return;
    const object = fieldOf(n, SUBSCRIPT_TARGET_FIELDS) ?? namedChildren(n)[0] ?? null;
    if (!object) return;
    // Un subíndice ANIDADO (`a[i][j]`) no es un acceso a miembro: si la cosa
    // indexada es otro subíndice, acá no hay ningún `X.y` que resolver.
    if (SUBSCRIPT_NODE_TYPE.test(object.type)) return;
    // El índice: cualquier hijo nombrado que no sea el objeto. Si NINGUNO menciona
    // un cursor propio, no es un recorrido posicional — es una lectura por clave.
    const indexParts = namedChildren(n).filter((c) => c !== object);
    let cursor: string | null = null;
    for (const part of indexParts) {
      for (const name of cursors) {
        if (new RegExp(`\\b${name}\\b`).test(part.text)) {
          cursor = name;
          break;
        }
      }
      if (cursor) break;
    }
    if (!cursor) return;
    // (2) El objeto tiene que ser un ACCESO A MIEMBRO con receptor ajeno.
    const receiver = objectOf(object);
    if (!receiver) return;
    const member = memberNameOf(object);
    if (!member) return;
    const receiverText = receiver.text;
    if (selfNames.has(receiverText)) return;
    // Un receptor que ES una cadena con `this`/`self` a la izquierda sigue siendo propio.
    const rootText = receiverText.split(/[.[(]/)[0] ?? receiverText;
    if (selfNames.has(rootText)) return;
    out.push({
      member,
      receiver: receiverText,
      cursor,
      startLine: n.startPosition.row + 1,
      endLine: n.endPosition.row + 1,
      enclosing: fn.name,
      boundedByContainer: cursorBoundedByContainer(loops, n.startPosition.row, member, cursor),
    });
  });
  return out;
}

/* ────────────────────────────────────────────────────────────────────────
 * Los hechos del grafo — un índice liviano cacheado POR GRAFO (no por
 * archivo), mismo idiom que `hypotheses/iterator.ts#FACTS_CACHE` y
 * `hypotheses/facade.ts#VIEW_CACHE`. *Intención del caché:* estos índices son
 * una propiedad DEL GRAFO; este detector corre una vez por ARCHIVO y sin caché
 * pagaría O(nodos+aristas) del repo entero por cada uno.
 * ──────────────────────────────────────────────────────────────────────── */

interface GraphFacts {
  readonly nodeById: ReadonlyMap<string, CodeGraphNode>;
  readonly symbolIdsByFile: ReadonlyMap<string, readonly string[]>;
  readonly edgesFrom: ReadonlyMap<string, readonly CodeGraphEdge[]>;
  readonly edgesTo: ReadonlyMap<string, readonly CodeGraphEdge[]>;
  /** `contains` inverso: id de miembro ⇒ id de su dueño directo. */
  readonly ownerOf: ReadonlyMap<string, string>;
  /**
   * Archivo ⇒ archivos con los que tiene al menos una arista NO AMBIGUA entre
   * símbolos. Es la prueba de que los dos archivos DE VERDAD se hablan, y es
   * lo que separa "el resolutor eligió a este dueño entre varios candidatos
   * posibles" de "el resolutor eligió a un homónimo cualquiera del repo".
   */
  readonly confidentlyLinkedFiles: ReadonlyMap<string, ReadonlySet<string>>;
}

const FACTS_CACHE = new WeakMap<CodeGraph, GraphFacts>();

function buildGraphFacts(graph: CodeGraph): GraphFacts {
  const cached = FACTS_CACHE.get(graph);
  if (cached) return cached;
  const nodeById = new Map<string, CodeGraphNode>();
  const symbolIdsByFile = new Map<string, string[]>();
  for (const n of graph.nodes) {
    if (!nodeById.has(n.id)) nodeById.set(n.id, n);
    if (n.kind !== "symbol") continue;
    const list = symbolIdsByFile.get(n.file);
    if (list) list.push(n.id);
    else symbolIdsByFile.set(n.file, [n.id]);
  }
  const edgesFrom = new Map<string, CodeGraphEdge[]>();
  const edgesTo = new Map<string, CodeGraphEdge[]>();
  const ownerOf = new Map<string, string>();
  // LAS ARISTAS AMBIGUAS ENTRAN, Y ES UNA DECISIÓN MEDIDA, NO UN DESCUIDO.
  // `confidentEdges` (CONTRATO-F9.md §4.5) descarta `provenance: "ambiguous"`,
  // y este ancla vive sobre ellas: medido por AE9 sobre los volcados de grafo
  // de los 13 repos, **el 74,9 % de las aristas `references` con role
  // `receiver-member` son ambiguas**, y en 6 de 13 repos lo son en >= 99 %
  // (rubocop 99,1 %, hugo 99,9 %, newtonsoft-json 99,8 %, vueuse 99,7 %,
  // cobra y lodash 100 %) — con el filtro puesto, este detector emitía CERO en
  // los 21 repos. La razón es estructural y no un defecto del resolutor: `x.y`
  // sólo se resuelve sabiendo el TIPO de `x`, que es justo lo que no hay.
  // El criterio es el mismo que la Ola V escribió para
  // `hypotheses/facade.ts#outgoingCallCount` y AD4 repitió en su §7.1: **la
  // existencia de la referencia es un hecho del CÓDIGO; sólo su DESTINO es lo
  // que el resolutor no supo fijar.** Lo ambiguo VIAJA COMO AMBIGUO: cada
  // hallazgo publica si su dueño se resolvió por una arista ambigua, y la
  // hipótesis lo pone en su `toConfirm`.
  for (const e of graph.edges) {
    const fl = edgesFrom.get(e.from);
    if (fl) fl.push(e);
    else edgesFrom.set(e.from, [e]);
    const tl = edgesTo.get(e.to);
    if (tl) tl.push(e);
    else edgesTo.set(e.to, [e]);
    if (e.kind === "contains" && !ownerOf.has(e.to)) ownerOf.set(e.to, e.from);
  }
  const confidentlyLinkedFiles = new Map<string, Set<string>>();
  for (const e of graph.edges) {
    if (e.provenance === "ambiguous" || e.kind === "contains") continue;
    const from = nodeById.get(e.from);
    const to = nodeById.get(e.to);
    if (!from || !to || from.file === to.file) continue;
    const set = confidentlyLinkedFiles.get(from.file);
    if (set) set.add(to.file);
    else confidentlyLinkedFiles.set(from.file, new Set([to.file]));
  }
  const facts: GraphFacts = { nodeById, symbolIdsByFile, edgesFrom, edgesTo, ownerOf, confidentlyLinkedFiles };
  FACTS_CACHE.set(graph, facts);
  return facts;
}

function asGraphIndex(facts: GraphFacts): GraphIndex {
  return {
    nodeById: (id) => facts.nodeById.get(id) ?? null,
    edgesFrom: (id) => facts.edgesFrom.get(id) ?? [],
    edgesTo: (id) => facts.edgesTo.get(id) ?? [],
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * (3) — a qué miembro de qué tipo resuelve `X.y` visto desde ESTE archivo
 * ──────────────────────────────────────────────────────────────────────── */

interface ContainerTarget {
  readonly containerId: string;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly ownerFile: string;
  readonly clientFiles: ReadonlySet<string>;
  /** El dueño se resolvió por una arista `provenance: "ambiguous"` — el resolutor no supo fijar el destino. Viaja hasta el hallazgo. */
  readonly ambiguousOwner: boolean;
  /** Cuántos otros destinos posibles llevaba esa arista (`CodeGraphEdge.alternatives`). 0 si no era ambigua. */
  readonly ownerAlternatives: number;
  /** Este archivo tiene además alguna arista NO AMBIGUA hacia el archivo del dueño. Se PUBLICA, no se exige — ver la nota en `resolveContainer`. */
  readonly confidentlyLinked: boolean;
}

function lastSegment(node: CodeGraphNode): string {
  return node.symbolPath[node.symbolPath.length - 1] ?? "";
}

/**
 * El nodo miembro al que ESTE archivo llega por `X.y`: sale de una arista
 * `references` con role `receiver-member` desde algún símbolo del archivo, y
 * su último segmento de `symbolPath` es `member`. Es la resolución que el
 * grafo YA hizo — este detector no re-resuelve nada ni adivina el tipo de `X`.
 */
function resolveContainer(facts: GraphFacts, filePath: string, member: string): ContainerTarget | null {
  const linked = facts.confidentlyLinkedFiles.get(filePath) ?? new Set<string>();
  let ambiguousFallback: ContainerTarget | null = null;
  for (const fromId of facts.symbolIdsByFile.get(filePath) ?? []) {
    for (const e of facts.edgesFrom.get(fromId) ?? []) {
      if (e.kind !== "references" || !edgeHasRole(e, "receiver-member")) continue;
      const target = facts.nodeById.get(e.to);
      if (!target || target.kind !== "symbol" || lastSegment(target) !== member) continue;
      const ownerId = facts.ownerOf.get(target.id);
      if (!ownerId) continue;
      const owner = facts.nodeById.get(ownerId);
      if (!owner || (owner.family !== "class-like" && owner.family !== "namespace-like")) continue;
      // (3) la frontera tiene que ser real: el dueño vive en OTRO archivo.
      if (owner.file === filePath) continue;
      const ambiguous = e.provenance === "ambiguous";
      // EL ENLACE CONFIDENTE SE PUBLICA, NO SE EXIGE — y la razón está MEDIDA.
      // Con la resolución ambigua admitida, `processed_source.tokens` de
      // rubocop cae en `FormatStringToken` (una clase de otro cop, sin
      // relación) porque el dueño verdadero, `ProcessedSource`, vive en OTRA
      // gema y no está en el corpus: el resolutor eligió al único homónimo que
      // encontró. La compuerta obvia contra eso —exigir además una arista NO
      // AMBIGUA de este archivo al del dueño— se probó y SE DESCARTÓ porque
      // **mata los verdaderos junto con los falsos**: medido sobre los 13
      // repos, con esa compuerta el detector emitía CERO, incluidos los dos
      // casos buenos de eslint (`sourceCode.lines` en `lib/rules/*.js`), donde
      // la relación es por INYECCIÓN —la regla recibe el `SourceCode` como
      // argumento— y por eso no hay ninguna arista estática entre los dos
      // archivos. Esta ola es ADITIVA: una compuerta cuyo efecto neto es menos
      // propuestas verdaderas NO VA. El hecho viaja como EVIDENCIA
      // (`enlaceConfidente`) para que quien lea el hallazgo sepa cuánto vale la
      // resolución del dueño.
      const found: ContainerTarget = {
        containerId: target.id,
        ownerId,
        ownerName: lastSegment(owner) || owner.file,
        ownerFile: owner.file,
        clientFiles: clientFilesOf(facts, target.id, owner.file),
        ambiguousOwner: ambiguous,
        ownerAlternatives: e.alternatives?.length ?? 0,
        confidentlyLinked: linked.has(owner.file),
      };
      if (!ambiguous) return found;
      ambiguousFallback ??= found;
    }
  }
  return ambiguousFallback;
}

/** (4) Archivos DISTINTOS que referencian `containerId` con role `receiver-member`, sin contar el del dueño. */
function clientFilesOf(facts: GraphFacts, containerId: string, ownerFile: string): ReadonlySet<string> {
  const files = new Set<string>();
  for (const e of facts.edgesTo.get(containerId) ?? []) {
    if (e.kind !== "references" || !edgeHasRole(e, "receiver-member")) continue;
    const from = facts.nodeById.get(e.from);
    if (!from || from.file === ownerFile) continue;
    files.add(from.file);
  }
  return files;
}

/* ────────────────────────────────────────────────────────────────────────
 * (5) — RESOLUCIÓN VERIFICADA, en sus dos formas
 * ──────────────────────────────────────────────────────────────────────── */

/** (5a) ¿El dueño formaliza ya un protocolo? Mismo hecho que `hypotheses/iterator.ts#findTraversalMember`. */
function ownerFormalizesProtocol(facts: GraphFacts, ownerId: string): string | null {
  const gi = asGraphIndex(facts);
  const ownZeroArity = new Set(
    memberSignatures(gi, ownerId)
      .filter((m) => m.arity === 0)
      .map((m) => m.name),
  );
  if (ownZeroArity.size === 0) return null;
  for (const e of facts.edgesFrom.get(ownerId) ?? []) {
    if (e.kind !== "implements" && e.kind !== "satisfies") continue;
    const implementers = new Set<string>();
    for (const back of facts.edgesTo.get(e.to) ?? []) {
      if (back.kind === "implements" || back.kind === "satisfies") implementers.add(back.from);
    }
    if (implementers.size < MIN_IMPLEMENTERS) continue;
    for (const m of memberSignatures(gi, e.to)) {
      if (m.arity === 0 && ownZeroArity.has(m.name)) {
        const iface = facts.nodeById.get(e.to);
        return `${iface ? lastSegment(iface) : e.to} (${implementers.size} implementadores), miembro común de aridad 0 "${m.name}"`;
      }
    }
  }
  return null;
}

/** (5b) ¿Ya hay una puerta de recorrido publicada y usada? Devuelve el nombre del miembro-puerta, o `null`. */
function existingTraversalDoor(facts: GraphFacts, ownerId: string, containerId: string, ownerFile: string): string | null {
  for (const e of facts.edgesFrom.get(ownerId) ?? []) {
    if (e.kind !== "contains") continue;
    const member = facts.nodeById.get(e.to);
    if (!member || member.kind !== "symbol" || member.family !== "function-like") continue;
    if (member.id === containerId) continue;
    if (member.arity !== 0) continue;
    const touchesContainer = (facts.edgesFrom.get(member.id) ?? []).some(
      (x) => x.kind === "references" && x.to === containerId && edgeHasRole(x, "receiver-member"),
    );
    if (!touchesContainer) continue;
    const callers = new Set<string>();
    for (const back of facts.edgesTo.get(member.id) ?? []) {
      if (back.kind !== "calls" && back.kind !== "references") continue;
      const from = facts.nodeById.get(back.from);
      if (!from || from.file === ownerFile) continue;
      callers.add(from.file);
    }
    if (callers.size >= GATE_MIN_CLIENTS_OF_EXISTING_DOOR) return lastSegment(member);
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────
 * El detector
 * ──────────────────────────────────────────────────────────────────────── */

/** Un candidato que pasó TODAS las condiciones — la unidad que se publica. */
export interface ExposedContainerCandidate {
  readonly member: string;
  /** Id de nodo del contenedor y de su dueño — los necesita `hypotheses/iterator.ts` para su escalera de estado. */
  readonly containerId: string;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly ownerFile: string;
  readonly clientFiles: readonly string[];
  readonly sites: readonly TraversalSite[];
  /** El dueño salió de una arista ambigua: el resolutor no supo fijar el destino. Viaja al hallazgo y de ahí al `toConfirm` de la hipótesis. */
  readonly ambiguousOwner: boolean;
  readonly ownerAlternatives: number;
  /** Hay alguna arista NO AMBIGUA entre este archivo y el del dueño. Evidencia publicada, nunca compuerta. */
  readonly confidentlyLinked: boolean;
}

/**
 * EN QUÉ ESCALÓN SE CAYÓ CADA CANDIDATO. Existe para que el EMBUDO sea
 * auditable —cuántos candidatos descarta cada condición, que es lo que la
 * receta de la Ola AC obliga a publicar— sin que nadie tenga que reimplementar
 * las condiciones afuera y arriesgar que diverjan. `"pasa"` es el único que
 * produce hallazgo.
 */
export type FunnelStage = "sin-dueno" | "pocos-clientes" | "protocolo-formalizado" | "puerta-existente" | "pasa";

export interface FunnelEntry {
  readonly member: string;
  readonly stage: FunnelStage;
  readonly sites: readonly TraversalSite[];
  readonly candidate: ExposedContainerCandidate | null;
  /** Cuántos archivos cliente vio el grafo (0 si nunca se resolvió el dueño). */
  readonly clientFiles: number;
}

/**
 * El embudo completo para UN archivo: un renglón por miembro contenedor con
 * al menos un sitio de recorrido posicional ajeno (condiciones (1)+(2) ya
 * cumplidas), y el escalón exacto donde se cayó.
 */
export function exposedContainerFunnelOf(file: FileUnit, graph: CodeGraph | null, minClientFiles: number): readonly FunnelEntry[] {
  // `needsGraph` de un detector `intra-*` es RUTEO, no compuerta
  // (`detect/types.ts#IntraGraphOptIn`): sin grafo este detector no puede
  // decidir de quién es el contenedor, así que se calla — nunca adivina.
  if (!graph) return [];
  const byMember = new Map<string, TraversalSite[]>();
  for (const fn of file.functions) {
    for (const site of traversalSitesOf(fn)) {
      const list = byMember.get(site.member);
      if (list) list.push(site);
      else byMember.set(site.member, [site]);
    }
  }
  if (byMember.size === 0) return [];

  const facts = buildGraphFacts(graph);
  const out: FunnelEntry[] = [];
  for (const [member, sites] of byMember) {
    const target = resolveContainer(facts, file.path, member); // (3)
    if (!target) {
      out.push({ member, stage: "sin-dueno", sites, candidate: null, clientFiles: 0 });
      continue;
    }
    const clientFiles = target.clientFiles.size;
    if (clientFiles < minClientFiles) {
      out.push({ member, stage: "pocos-clientes", sites, candidate: null, clientFiles }); // (4)
      continue;
    }
    if (ownerFormalizesProtocol(facts, target.ownerId) !== null) {
      out.push({ member, stage: "protocolo-formalizado", sites, candidate: null, clientFiles }); // (5a)
      continue;
    }
    if (existingTraversalDoor(facts, target.ownerId, target.containerId, target.ownerFile) !== null) {
      out.push({ member, stage: "puerta-existente", sites, candidate: null, clientFiles }); // (5b)
      continue;
    }
    out.push({
      member,
      stage: "pasa",
      sites,
      clientFiles,
      candidate: {
        member,
        containerId: target.containerId,
        ownerId: target.ownerId,
        ownerName: target.ownerName,
        ownerFile: target.ownerFile,
        clientFiles: [...target.clientFiles].sort(),
        sites,
        ambiguousOwner: target.ambiguousOwner,
        ownerAlternatives: target.ownerAlternatives,
        confidentlyLinked: target.confidentlyLinked,
      },
    });
  }
  return out;
}

export function exposedContainerCandidatesOf(
  file: FileUnit,
  graph: CodeGraph | null,
  minClientFiles: number,
): readonly ExposedContainerCandidate[] {
  const out: ExposedContainerCandidate[] = [];
  for (const e of exposedContainerFunnelOf(file, graph, minClientFiles)) if (e.candidate) out.push(e.candidate);
  return out;
}

/**
 * LOS MIEMBROS DEL DUEÑO QUE YA TOCAN EL CONTENEDOR — "media puerta".
 *
 * Existe para la ESCALERA DE ESTADO de `hypotheses/iterator.ts` por el camino
 * de esta ancla, no para el detector: si el dueño ya tiene algún miembro
 * propio que lee el contenedor, hay media puerta escrita (alguien adentro ya
 * sabe recorrerlo) y el estado honesto es `parcial`; si no hay ninguno, la
 * representación sólo la conocen los clientes y el estado es `ausente`.
 * NUNCA puede valer `ya-aplicado`: la condición (5b) del detector ya silenció
 * el caso en que esa puerta existe Y los clientes la usan.
 */
export function halfDoorMembersOf(graph: CodeGraph, ownerId: string, containerId: string): readonly string[] {
  const facts = buildGraphFacts(graph);
  const out: string[] = [];
  for (const e of facts.edgesFrom.get(ownerId) ?? []) {
    if (e.kind !== "contains") continue;
    const member = facts.nodeById.get(e.to);
    if (!member || member.kind !== "symbol" || member.family !== "function-like" || member.id === containerId) continue;
    const touches = (facts.edgesFrom.get(member.id) ?? []).some(
      (x) => x.kind === "references" && x.to === containerId && edgeHasRole(x, "receiver-member"),
    );
    if (touches) out.push(lastSegment(member));
  }
  return out;
}

/**
 * LA TRAZA DE LA OLA AU (AU4) — los hechos de cada candidato que SÍ se emite,
 * para poder medir la compuerta (U) sobre la población viva sin una segunda
 * corrida. `trigger`/`evidence` NO sobreviven al `Finding` final (se verificó
 * volcando los 21 repos: llegan vacíos), así que la evidencia publicada no
 * alcanza para medir y hace falta este canal. Apagada por defecto; sólo el
 * script de medición la enciende — mismo idiom que
 * `hypotheses/collapse-hierarchy.ts#startCollapseHierarchyTrace`.
 */
export interface ExposedContainerFacts {
  file: string;
  member: string;
  owner: string;
  ownerFile: string;
  clientFiles: number;
  sites: number;
  /** (U) sitios cuyo cursor está acotado por el propio contenedor. */
  bounded: number;
  ambiguousOwner: boolean;
  confidentlyLinked: boolean;
  lines: readonly number[];
}

let auTrace: ExposedContainerFacts[] | null = null;

export function startExposedContainerTrace(): void {
  auTrace = [];
}

export function takeExposedContainerTrace(): readonly ExposedContainerFacts[] {
  const out = auTrace ?? [];
  auTrace = null;
  return out;
}

export const detector: IntraFileDetector<ThresholdKey, "exposed-container-traversal"> = {
  id: "exposed-container-traversal",
  kind: EXPOSED_CONTAINER_TRAVERSAL_KIND,
  scope: "intra-file",
  title: "Recorrido posicional del contenedor de otro tipo",
  // SIN `needs`: la forma —un subíndice sobre un acceso a miembro— existe en
  // los 9 lenguajes y no depende de ninguna `Capability` declarada. Misma
  // razón que `optional-behavior-flags.ts` escribe para la suya.
  needs: [],
  // RUTEO, no compuerta: se corre en la pasada donde el grafo existe porque
  // las condiciones (3), (4) y (5) son preguntas al grafo. Sin grafo devuelve
  // `[]` (ver `exposedContainerCandidatesOf`), nunca un hallazgo adivinado.
  needsGraph: true,
  thresholds: {
    archivosCliente: pisoDeclarado(MIN_CLIENT_FILES, {
      rationale:
        "GoF, Design Patterns, Iterator/Intent: el patrón existe para recorrer un agregado SIN exponer su representación. El costo que compra es no tener que tocar a todos los clientes cuando la representación cambia, así que sólo paga cuando hay varios. Con UN cliente externo la mitigación barata es mover el recorrido adentro del dueño (Move Method); con DOS, extraer una función compartida sigue siendo más barato que introducir un tipo iterador —el mismo argumento con el que la Ola AD fijó `lugares = 3` para el ancla de Facade, y el que la Ola AC midió que le FALTABA al ancla de State (7 máquinas reales, 6 demasiado chicas)—; a partir de TRES archivos cliente la representación cruda ya es un contrato público de hecho y cambiarla es una cirugía de escopeta.",
    }),
  },
  run(file: FileUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const minClientFiles = ctx.threshold("archivosCliente");
    const findings: RawFinding[] = [];
    for (const c of exposedContainerCandidatesOf(file, ctx.graph ?? null, minClientFiles.value)) {
      const first = c.sites[0]!;
      if (auTrace) {
        auTrace.push({
          file: file.path,
          member: c.member,
          owner: c.ownerName,
          ownerFile: c.ownerFile,
          clientFiles: c.clientFiles.length,
          sites: c.sites.length,
          bounded: c.sites.filter((s) => s.boundedByContainer).length,
          ambiguousOwner: c.ambiguousOwner,
          confidentlyLinked: c.confidentlyLinked,
          lines: c.sites.map((s) => s.startLine),
        });
      }
      const head: RoleLocation = {
        file: file.path,
        startLine: first.startLine,
        endLine: first.endLine,
        symbol: first.enclosing ?? undefined,
        anchor: { file: file.path, symbolPath: first.enclosing ? [first.enclosing] : [] },
        role: `recorrido posicional de "${first.receiver}.${c.member}" con el cursor "${first.cursor}"`,
      };
      const rest: RoleLocation[] = c.sites.slice(1).map((s, i) => ({
        file: file.path,
        startLine: s.startLine,
        endLine: s.endLine,
        symbol: s.enclosing ?? undefined,
        anchor: { file: file.path, symbolPath: s.enclosing ? [s.enclosing] : [], ordinal: i },
        role: `otro recorrido posicional del mismo contenedor (cursor "${s.cursor}")`,
      }));
      findings.push({
        title: `Este archivo recorre a mano el contenedor "${c.member}" de "${c.ownerName}"`,
        detail:
          `El contenedor \`${c.member}\` es un miembro de \`${c.ownerName}\` (declarado en "${c.ownerFile}"), y acá se recorre POR POSICIÓN: ` +
          `un cursor propio (\`${first.cursor}\`) indexando \`${first.receiver}.${c.member}[...]\` en ${c.sites.length} sitio(s). ` +
          `El grafo ve ${c.clientFiles.length} archivos distintos —ninguno el del dueño— que alcanzan ese mismo miembro, ` +
          `así que la forma en que \`${c.ownerName}\` guarda sus elementos es hoy un contrato público de hecho: ` +
          "cambiar la representación (de arreglo a mapa, a flujo perezoso, a paginado) obliga a tocarlos a todos. " +
          `Y \`${c.ownerName}\` no publica ningún punto de entrada de recorrido propio que los clientes ya usen: el recorrido no está encapsulado en ninguna parte.`,
        trigger: [
          { label: "archivos cliente que alcanzan el contenedor", value: c.clientFiles.length, threshold: minClientFiles },
        ],
        evidence: [
          { label: "sitios de recorrido posicional en este archivo", value: c.sites.length, note: c.sites.map((s) => `${s.enclosing ?? "(nivel de archivo)"}:${s.startLine}`).join(", ") },
          { label: "archivos cliente distintos", value: c.clientFiles.length, note: c.clientFiles.slice(0, 5).join(", ") + (c.clientFiles.length > 5 ? ", ..." : "") },
          {
            label: "(U) sitios cuyo cursor está ACOTADO POR EL PROPIO CONTENEDOR",
            value: c.sites.filter((s) => s.boundedByContainer).length,
            note:
              "OLA AU: cuántos de los sitios están dentro de un loop cuyo encabezado menciona el contenedor y el " +
              "cursor (`i < x.items.length`) — o sea, cuántos son un RECORRIDO y no un acceso aleatorio por " +
              "posición. 0 ⇒ ningún sitio recorre nada: el propio `caveat` del consejo declara ese caso fuera de " +
              "alcance de Iterator.",
          },
          {
            label: "dueño del contenedor",
            value: 1,
            note:
              `${c.ownerName} — ${c.ownerFile}` +
              (c.ambiguousOwner
                ? ` · RESOLUCIÓN AMBIGUA: el grafo llegó a este dueño por una arista \`provenance: "ambiguous"\`${c.ownerAlternatives > 0 ? ` con ${c.ownerAlternatives} destino(s) alternativo(s)` : ""} — confirmar a mano de quién es el contenedor`
                : " · resolución no ambigua") +
              (c.confidentlyLinked
                ? " · este archivo tiene además una arista NO ambigua hacia el archivo del dueño"
                : " · SIN ninguna arista no ambigua entre este archivo y el del dueño: la relación puede ser por inyección… o el dueño puede ser un homónimo"),
          },
        ],
        locations: [head, ...rest],
        severity: Math.min(100, 30 + c.clientFiles.length * 6 + c.sites.length * 4),
        advice: {
          primary: {
            name: "Encapsulate Collection",
            kind: "refactorizacion",
            why: "Mientras el contenedor se alcance crudo desde afuera, cualquier cambio de representación es una cirugía de escopeta; encapsularlo deja al dueño con la libertad de cambiar cómo guarda sus elementos.",
            source: "https://refactoring.guru/es/encapsulate-collection",
          },
          pattern: {
            name: "Iterator",
            kind: "patron_de_diseno",
            why: "Iterator existe para recorrer un agregado secuencialmente SIN exponer su representación: el dueño publica el recorrido y los clientes dejan de conocer índices, largos y posiciones.",
            source: "https://refactoring.guru/es/design-patterns/iterator",
            caveat:
              "Sólo paga si los clientes de verdad RECORREN. Si lo que hacen es acceso aleatorio por posición (buscar el elemento k-ésimo), el recorrido secuencial no los cubre y la respuesta correcta es otra API, no un iterador. Y si el contenedor es una estructura ANIDADA (árbol, lista de listas) el problema es Composite antes que Iterator.",
            cost: "Un tipo iterador (o el protocolo nativo del lenguaje) por forma de recorrido, más el cambio en cada cliente: más indirección que un `for` con índice, y se paga cuando la representación cambia o cuando aparece una segunda forma de recorrer.",
          },
        },
      });
    }
    return findings;
  },
};
