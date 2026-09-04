/**
 * OLA O, FRENTE N6 — "la firma de esta función NO la eligió quien la escribió".
 *
 * POR QUÉ EXISTE. Tres detectores `intra-function` distintos necesitan la
 * MISMA pregunta, y hasta esta ola cada uno la respondía a medias por su
 * cuenta:
 *
 *   - `unused-variable`: un parámetro que el cuerpo no lee no sobra si la
 *     firma la impone otro (ya tenía `hasFixedSignatureMarker`, privado, y el
 *     mecanismo por grafo de `b1b-contrato-grafo.ts`). Es el único consumidor
 *     REAL de los dos mecanismos de acá.
 *   - `argument-mutation` (vía `b1b-contrato-grafo.ts`, ya cableado).
 *   - `boolean-flag-param` fue el tercer candidato y quedó AFUERA, medido:
 *     ver (M) en el docstring de ese módulo. Suprimir un `override` con un
 *     parámetro booleano retiraba un verdadero positivo ya juzgado de guava
 *     (`AbstractUndirectedNetworkConnections.addInEdge(…, boolean
 *     isSelfLoop)`) sin mover el hallazgo a ningún otro lado, porque una
 *     declaración base sin cuerpo no puede disparar ese detector.
 *     `signatureMarkedAsImposed` se exporta igual: la mudanza desde
 *     `unused-variable.ts` ya está hecha y es donde vive la lectura.
 *
 * DOS MECANISMOS, los dos por FORMA:
 *
 *   (1) `signatureMarkedAsImposed(node)` — AST puro, sin grafo: la marca
 *       está en el propio nodo función. Tres formas, confirmadas por sonda
 *       directa en la ola anterior y trasplantadas verbatim desde
 *       `unused-variable.ts` (que ahora delega acá, para que las dos lecturas
 *       no se separen con el tiempo):
 *         a. un hijo POSICIONAL de tipo `modifier` cuyo texto es `override` o
 *            `virtual` (C#: cada modificador es su propio nodo);
 *         b. un hijo `explicit_interface_specifier` (C#: implementación
 *            explícita de interfaz — el nombre calificado ES la firma);
 *         c. un hijo `modifiers` (Java: contenedor único) con una
 *            `marker_annotation`/`annotation` cuyo campo `name` resuelve
 *            `Override` — el nombre que el propio JDK fija.
 *       Vocabulario UNIVERSAL de la OOP (`override`/`virtual` significan lo
 *       mismo en cualquier lenguaje con herencia), nunca `if (lang === …)`.
 *
 *   (2) `signatureSharedAcrossContainers(...)` — SÓLO con grafo: la misma
 *       firma (nombre + aridad declarada) aparece declarada en N
 *       CONTENEDORES DISTINTOS del repo. Ver su propio docstring.
 *
 * NO es un tercer mecanismo ni reemplaza a `b1b-contrato-grafo.ts`
 * (`implements`/`extends`/`satisfies`/`carries`): lo COMPLEMENTA en el caso
 * que ese archivo declara fuera de su alcance — el contrato que vive en una
 * dependencia EXTERNA, donde no hay ningún símbolo del repo al que apuntar
 * una arista.
 */
import { CONSTRUCTOR_NAMES } from "../../code-grammar.js";
import type { AstNode, FunctionUnit } from "../types.js";
import type { CodeGraph } from "../../graph/types.js";

/** Texto EXACTO de los dos modificadores de herencia que fijan una firma — vocabulario universal de OOP, no un nombre inventado por este repo. */
const INHERITED_SIGNATURE_MODIFIERS = new Set(["override", "virtual"]);

/**
 * Mecanismo (1) — ver el docstring del módulo. Deliberadamente NO recorre
 * más profundo que los hijos DIRECTOS de `node`: la marca tiene que estar en
 * la FORMA del nodo función mismo, nunca inferida.
 */
export function signatureMarkedAsImposed(node: AstNode): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i) as AstNode | null;
    if (!child || !child.isNamed) continue;
    if (child.type === "modifier" && INHERITED_SIGNATURE_MODIFIERS.has(child.text)) return true;
    if (child.type === "explicit_interface_specifier") return true;
    if (child.type === "modifiers") {
      for (let j = 0; j < child.childCount; j++) {
        const annotation = child.child(j) as AstNode | null;
        if (!annotation || (annotation.type !== "marker_annotation" && annotation.type !== "annotation")) continue;
        const name = annotation.childForFieldName("name") as AstNode | null;
        if (name && name.text === "Override") return true;
      }
    }
  }
  return false;
}

/**
 * Cantidad de parámetros DECLARADOS de `node` — mismo criterio (mismo campo
 * `parameters`/`parameter_list`, mismos hijos nombrados que no son
 * comentario) que `graph/symbols.ts#computeArity`, que es de donde sale la
 * `arity` de un `CodeGraphNode`. Comparar contra ese campo exige medir con la
 * misma vara; `b1b-contrato-grafo.ts` replica la misma función por la misma
 * razón, y por el mismo motivo ninguna de las dos reutiliza los
 * `collectParameters`/`collectParameterNames` de los detectores (filtran
 * distinto entre sí: uno resuelve nombres, el otro excluye `out`/`ref` de C#).
 */
function declaredArity(node: AstNode): number | null {
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
 * CUÁNTOS CONTENEDORES DISTINTOS hacen falta para hablar de un contrato de
 * hecho. DOS ya alcanza — es el número que la propia forma exige: un
 * contrato necesita al menos dos partes (el que lo declara y el que lo
 * cumple; o dos implementaciones hermanas del mismo protocolo). Con UNO no
 * hay contrato, hay una función. No es un umbral de magnitud calibrado
 * contra una muestra: es la cardinalidad mínima de la relación que se busca,
 * igual que `presencia(1)` en el resto de los detectores.
 */
const CONTAINERS_FOR_DE_FACTO_CONTRACT = 2;

/**
 * Clave de un contenedor: el NOMBRE del contenedor inmediato si lo hay, y el
 * ARCHIVO si no.
 *
 * POR QUÉ EL NOMBRE Y NO EL ARCHIVO CUANDO HAY CONTENEDOR — corrección
 * MEDIDA: un repo que envía dos builds del MISMO código (`corpus/guava`
 * mantiene `guava/src/…/LocalCache.java` y `android/guava/src/…/LocalCache.java`,
 * y cuatro copias de `DerivedCollectionGenerators.java`) tiene la misma clase
 * en dos archivos distintos. Con el archivo en la clave, esas dos copias
 * contaban como dos contenedores y "se cumplían un contrato" a sí mismas: 7 de
 * los 9 hallazgos vivos del kind en guava desaparecían por esa vía
 * (`LocalCache.enqueueNotification`, `DerivedCollectionGenerators.createSubMap`,
 * el super-source `Platform.get`). Dos copias de una clase no son dos partes
 * de un contrato. Con el nombre del contenedor, `LocalCache` cuenta una vez y
 * los 7 vuelven.
 *
 * Y POR QUÉ EL ARCHIVO CUANDO NO HAY CONTENEDOR — MEDIDO sobre el grafo real
 * de `corpus/hugo`
 * (`graph/symbols.ts`), un MÉTODO de Go con receptor
 * (`func (f *overlayFilter) Draw(...)`) produce el nodo
 * `sym:resources/images/overlay.go#Draw` — `symbolPath` de UN solo segmento,
 * sin el tipo receptor. Las OCHO implementaciones de `gift.Filter` de
 * `resources/images/` (auto_orient, dither, mask, opacity, overlay, padding,
 * process, text) sólo se distinguen entre sí por el archivo. Exigir
 * `symbolPath.length >= 2` para indexar habría dejado el mecanismo inerte en
 * Go — justo el lenguaje del que sale la evidencia.
 *
 * QUIÉN PREGUNTA sí está restringido, y ésa es la corrección MEDIDA que hace
 * falta: sólo un MIEMBRO (ver `signatureSharedAcrossContainers`). Con las
 * funciones SUELTAS preguntando, el mecanismo trataba como "contrato
 * compartido" a un simple RE-EXPORT o WRAPPER — en `corpus/click`,
 * `termui.getchar(echo)` reenvía a `_termui_impl.getchar(echo)` y
 * `termui.open_url(url, wait, locate)` a `_termui_impl.open_url(...)`; en
 * `corpus/preact`, una decena de demos declaran cada una su propio
 * `update(partial)`. Medido: sin esa restricción se retiraban CUATRO de los
 * cinco verdaderos positivos ya juzgados a mano de `boolean-flag-param` en
 * click (`echo`/`err`, `getchar`/`echo`, `open_url`/`locate`,
 * `make_pass_decorator`/`ensure`). Un contrato lo cumplen TIPOS, no archivos.
 */
function containerKey(file: string, symbolPath: readonly string[]): string {
  const owner = symbolPath[symbolPath.length - 2];
  return owner === undefined ? `archivo:${file}` : `tipo:${owner}`;
}

function sharedSignatureKey(name: string, arity: number): string {
  return `${name}/${arity}`;
}

/**
 * Un CONSTRUCTOR nunca participa de este mecanismo — ni al indexar ni al
 * consultar. Que dos clases sin relación entre sí declaren un constructor de
 * la misma aridad es una coincidencia aritmética, no un contrato: el nombre
 * de un constructor no lo elige quien escribe la clase (`constructor`/
 * `__init__`/`initialize` son nombres RESERVADOS del lenguaje —
 * `code-grammar.ts#CONSTRUCTOR_NAMES`, que este módulo reutiliza en vez de
 * inventar la lista— y en Java/C#/PHP es, por regla del lenguaje, el nombre
 * de la clase que lo contiene). Sin esta exclusión, el mecanismo suprimía
 * TODO parámetro de constructor de cualquier repo con dos clases: medido
 * sobre `corpus/nest`, 33 de los 74 hallazgos que se retiraban eran
 * `constructor`, y en `corpus/guava` habría tapado el ÚNICO verdadero
 * positivo documentado del kind (`ArrayBasedUnicodeEscaper.java:99
 * unsafeReplacement`, un parámetro de CONSTRUCTOR). Es exactamente el
 * fenómeno que el integrador de la Ola N documentó en `shotgun-surgery`
 * ("`constructor` con 387 llamadores"), sólo que del lado de las
 * declaraciones.
 */
function isConstructorSymbol(name: string, symbolPath: readonly string[]): boolean {
  if (CONSTRUCTOR_NAMES.has(name)) return true;
  return symbolPath.length >= 2 && symbolPath[symbolPath.length - 2] === name;
}

/**
 * `name/arity` → cantidad de CONTENEDORES DISTINTOS del repo que declaran un
 * `function-like` con esa firma. `WeakMap` clavado en el propio `CodeGraph`:
 * se construye UNA vez por corrida (mismo espíritu que `graphIndex()` en
 * `detect/run.ts` y que el índice por sufijo de `b1b-contrato-grafo.ts`) y se
 * libera solo. Sin esto sería O(funciones × nodos del grafo) — del orden de
 * 10^9 en guava.
 */
const sharedSignatureCache = new WeakMap<CodeGraph, ReadonlyMap<string, number>>();

function buildSharedSignatureIndex(graph: CodeGraph): ReadonlyMap<string, number> {
  const containers = new Map<string, Set<string>>();
  for (const node of graph.nodes) {
    if (node.kind !== "symbol" || node.family !== "function-like") continue;
    const name = node.symbolPath[node.symbolPath.length - 1];
    // `arity` es `undefined` cuando el grafo de esa corrida no la extrajo y
    // `null` cuando la gramática no expuso lista de parámetros (ver
    // `CodeGraphNode.arity`): en los dos casos no se puede comparar firma con
    // firma, así que el símbolo no participa — nunca se adivina.
    if (name === undefined || node.arity === undefined || node.arity === null) continue;
    if (isConstructorSymbol(name, node.symbolPath)) continue;
    // Aridad cero: no hay ningún parámetro que una firma compartida pueda
    // explicar, así que la entrada nunca se consultaría. No se indexa, y eso
    // saca de encima los nombres más colisionables del catálogo
    // (`run`/`close`/`toString`).
    if (node.arity === 0) continue;
    const key = sharedSignatureKey(name, node.arity);
    const bucket = containers.get(key) ?? new Set<string>();
    bucket.add(containerKey(node.file, node.symbolPath));
    containers.set(key, bucket);
  }
  const counts = new Map<string, number>();
  for (const [key, set] of containers) counts.set(key, set.size);
  return counts;
}

function sharedSignatureIndexFor(graph: CodeGraph): ReadonlyMap<string, number> {
  const cached = sharedSignatureCache.get(graph);
  if (cached) return cached;
  const built = buildSharedSignatureIndex(graph);
  sharedSignatureCache.set(graph, built);
  return built;
}

/**
 * Mecanismo (2): ¿la firma de `fn` (nombre + aridad declarada) está
 * declarada en al menos `CONTAINERS_FOR_DE_FACTO_CONTRACT` contenedores
 * DISTINTOS del repo?
 *
 * QUÉ FENÓMENO ES. `b1b-contrato-grafo.ts` responde "¿alguien del repo
 * declara esta firma y mi contenedor lo implementa/extiende?" — y por eso
 * queda ciego cuando el contrato vive AFUERA (una interfaz del BCL/JDK, de
 * la stdlib o de una dependencia): `graph/build.ts` descarta el nombre
 * externo sin aportar señal, así que no hay ninguna arista que seguir. Pero
 * la HUELLA de ese contrato externo sí queda dentro del repo, y es
 * observable: aparecen VARIAS declaraciones independientes de la misma firma
 * exacta. Dos tipos del repo que declaran `Draw(dst, src, options)` sin
 * ninguna relación de herencia entre sí no coincidieron por casualidad —
 * cumplen el mismo contrato de afuera.
 *
 * POR QUÉ NO ES "COLAPSAR MÉTODOS POR NOMBRE" (el bug que el integrador de
 * la Ola N documentó en `shotgun-surgery`, con `constructor` acumulando 387
 * llamadores): acá NO se resuelve ninguna referencia ni se unifica ningún
 * símbolo. Se cuentan DECLARACIONES —nodos del grafo, uno por símbolo
 * declarado, sin cascada de resolución de por medio— y se exige que vivan en
 * contenedores distintos. Que dos clases declaren la misma firma es un hecho
 * del árbol, no una inferencia del resolvedor.
 *
 * DEGRADA SOLO: sin grafo no hay índice, y el llamador ya pasa `null`.
 */
/**
 * `true` cuando `fn` es un MIEMBRO de algo, no una función suelta. Dos vías,
 * porque los ocho lenguajes soportados declaran la pertenencia de dos formas
 * distintas y sólo una llega a `FunctionMetrics`:
 *
 *   - `fn.metrics.className !== null` — la función está DENTRO de un nodo
 *     clase-like (JS/TS/Vue/Python/Ruby/Java/C#);
 *   - el nodo función expone un campo `receiver` propio — Go declara el
 *     receptor de un método FUERA de cualquier nodo clase-like
 *     (`func (f *overlayFilter) Draw(...)` es hijo directo del archivo), así
 *     que `className` es `null` ahí aunque sea un método de pleno derecho.
 *     Es el mismo campo `receiver` que `unused-variable.ts` ya conoce por
 *     `PARAMETER_CONTAINER_TYPES`.
 */
function isMemberFunction(fn: FunctionUnit): boolean {
  return fn.metrics.className !== null || fn.node.childForFieldName("receiver") !== null;
}

export function signatureSharedAcrossContainers(fn: FunctionUnit, graph: CodeGraph): boolean {
  const name = fn.name;
  if (name === null) return false;
  if (!isMemberFunction(fn)) return false; // función suelta: ver `containerKey`, "QUIÉN PREGUNTA sí está restringido"
  if (CONSTRUCTOR_NAMES.has(name) || fn.metrics.className === name) return false; // ver `isConstructorSymbol`
  const arity = declaredArity(fn.node);
  if (arity === null || arity === 0) return false;
  const count = sharedSignatureIndexFor(graph).get(sharedSignatureKey(name, arity)) ?? 0;
  return count >= CONTAINERS_FOR_DE_FACTO_CONTRACT;
}
