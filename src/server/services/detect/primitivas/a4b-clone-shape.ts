/**
 * Formas de clon que NO son duplicación de CONOCIMIENTO — Ola N, frente A4b
 * (`detect/inter-file/{duplication,distributed-duplication}.ts`). Tres
 * filtros, cada uno anclado en veredictos FALSOS medidos a mano en
 * `tests/golden/precision/*.verdicts.csv` (columna `note`), compartidos por
 * los dos detectores porque los dos agrupan el MISMO `repo.clones`
 * (fingerprinting estructural de `code-analyzer.ts`) y las tres formas
 * aparecen en los dos.
 *
 * Prefijo `a4b-` por la regla de archivos nuevos de la ola (CONTEXTO.md
 * §5.1): trece frentes editan el mismo árbol a la vez y dos no pueden crear
 * el mismo archivo.
 *
 * LOS TRES FILTROS, CADA UNO CON SU MEDICIÓN:
 *
 * 1. DENSIDAD ESTRUCTURAL BAJA (`isLowDensityClone`) — un comentario largo
 *    infla LÍNEAS sin inflar NODOS: `code-analyzer.ts#walkFile` hashea
 *    "por FORMA — el tipo de nodo más el hash de cada hijo" (su propio
 *    docstring) para TODO hijo del árbol, comentarios incluidos — sólo
 *    excluye identificadores y literales, nunca tipos de nodo de
 *    comentario — así que un nodo `comment`/`block_comment` de 1 línea o de
 *    30 aporta EXACTAMENTE 1 nodo al conteo, sea cual sea su largo real.
 *    Medido con `analyzeFile` directo sobre el corpus real (no estimado):
 *    `ListenableFuture.java` (guava, líneas 120-158 — una interfaz con un
 *    Javadoc de ~30 líneas + un único método) mide 57 nodos / 39 líneas =
 *    1.46 nodos/línea (falso medido, tanto en `duplication` como en
 *    `distributed-duplication`, ver los dos `.verdicts.csv` de guava).
 *    Contra eso, LOS 19 VERDADEROS de span chico (≤14 líneas) medidos en
 *    ESTE frente en 8 lenguajes (C#, JS, Go, Python, Ruby, Java) miden
 *    todos ≥4.67 nodos/línea — el peor caso,
 *    `jekyll#raise_markup_parse_error`, 28 nodos / 6 líneas. El piso
 *    (`MIN_DENSITY_SPEC` = 3.0) cae a mitad del hueco medido (1.46 → 4.67),
 *    con margen para los dos lados, no pegado a ninguno de los dos
 *    extremos.
 *
 * 2. FAMILIA DE CONTRATO (`hasSharedContractTarget`) — clases HERMANAS
 *    (distintas entre sí) que implementan/extienden/satisfacen el MISMO
 *    símbolo compartido tienen, por construcción del LENGUAJE, que repetir
 *    la forma que ese contrato exige: la duplicación no nace de copiar y
 *    pegar, nace de que el compilador exige la misma firma en cada
 *    implementación. Medido: `guava-testlib/.../ListGenerators.java` — las
 *    clases `BuilderAddListGenerator`/`BuilderAddAllListGenerator`/
 *    `BuilderReversedListGenerator`/… comparten TEXTUALMENTE
 *    "extends TestStringListGenerator" (`CloneCandidate.superclassName`,
 *    verificado corriendo `analyzeFile` sobre el archivo real del corpus).
 *    Este filtro usa el GRAFO (`implements`/`extends`/`satisfies`) y NO
 *    `CloneCandidate.superclassName` — ese campo sólo lee el campo
 *    `superclass` de la gramática (la cláusula `extends`); el campo
 *    `interfaces` (`implements`) NUNCA lo lee `code-analyzer.ts#walkFile`
 *    (verificado leyendo el walker: sólo hay una asignación a `superclass`,
 *    nunca a `interfaces`). El grafo sí ve las dos formas (`herencia.ts` /
 *    `interfaz-declarada.ts`) — por eso `ForwardingLock`/
 *    `ForwardingCondition` (guava, "implements Lock"/"implements
 *    Condition", falsos medidos) sólo quedan cubiertos cuando el grafo está
 *    disponible, nunca con el campo sintáctico solo (ver el informe del
 *    frente, sección "PIDO A OTRO FRENTE", para el hueco de
 *    `superclassName` en `code-analyzer.ts`). Exige que TODAS las clases
 *    DISTINTAS del grupo compartan al menos un blanco COMÚN — no "cada una
 *    implementa algo", que es casi cualquier clase de código orientado a
 *    objetos y hubiera podido tapar un verdadero medido
 *    (`CompactLinkedHashMap#setSucceeds`, span 13, verdadero: vive en una
 *    clase que sí extiende algo, pero sin una HERMANA en el mismo grupo de
 *    clones que comparta ese mismo padre).
 *
 * 3. PAR SIMÉTRICO (`isSymmetricNamePair`) — dos copias cuya ÚNICA
 *    diferencia textual es el propio nombre de la función, mencionado
 *    DENTRO de su propio cuerpo (`Math.Min`/`Math.Max` dentro de
 *    `Min`/`Max`; `nullsFirst`/`nullsLast` dentro de sí mismas). El
 *    fingerprint ya ignora identificadores — por eso matchean como "misma
 *    forma" pese a invocar miembros distintos — así que si sacar el propio
 *    nombre de cada copia (como palabra completa) deja el mismo texto
 *    normalizado, la ÚNICA diferencia real entre las dos copias es ESE
 *    nombre. Medido: `MathUtils.Min`/`Max(int?,int?)` (newtonsoft-json,
 *    falso — verificado con `analyzeFile`: los dos cuerpos, tras sacar
 *    "Min"/"Max", quedan carácter por carácter idénticos) y
 *    `Comparators.emptiesFirst`/`emptiesLast` (guava, falso, misma forma
 *    por nota de la planilla). Texto duplicado de verdad, pero NO
 *    duplicación de conocimiento — es la forma que tiene un par de
 *    utilidades simétricas idiomáticas, no una copia accidental.
 *
 * LÍMITES DECLARADOS (ver el informe del frente para el detalle completo):
 *  - (1) y (2) están medidos contra el corpus real; (2) sólo cubre
 *    `implements`/`extends`/`satisfies` cuando el grafo está disponible
 *    (`repo.graph !== null` en `duplication.ts`, que NO exige grafo —
 *    `distributed-duplication.ts` siempre lo tiene). Sin grafo,
 *    `computeContractTargets(null)` es el mapa vacío: el filtro
 *    simplemente nunca encuentra blanco compartido y no dispara — nunca
 *    oculta de más por falta de grafo.
 *  - (2) indexa clases por `(archivo, nombre de clase)`, no por el camino
 *    de símbolo completo (`CloneCandidate.className` sólo trae el nombre
 *    de la clase más interna, sin calificar por sus clases contenedoras —
 *    la misma limitación que ya tiene el resto de `duplication.ts` con
 *    este campo). Dos clases ANIDADAS con el mismo nombre bajo clases
 *    contenedoras DISTINTAS del mismo archivo podrían mezclar sus blancos
 *    — no medido como caso real en el corpus, documentado como límite
 *    conocido, no como bug escondido.
 *  - (3) sólo cubre grupos de EXACTAMENTE 2 copias — no hay evidencia
 *    medida de esta forma en grupos de 3+, y generalizar sin medir sería
 *    estimar, no medir (regla de la ola).
 */
import { pisoDeclarado } from "../thresholds.js";
import type { ThresholdSpec } from "../thresholds.js";
import type { CodeGraph } from "../../graph/types.js";
import type { CloneCandidate } from "../types.js";

/**
 * R3 (auditoría de umbrales inventados): piso DECLARADO, no citado — no hay
 * ninguna herramienta externa que fije "3 nodos por línea"; es un corte
 * elegido a mano sobre datos medidos (ver el punto 1 del docstring de
 * cabecera para el hueco 1.46 → 4.67 y por qué 3.0 cae a mitad de camino).
 */
export const MIN_DENSITY_SPEC: ThresholdSpec = pisoDeclarado(3, {
  rationale:
    "nodos por línea del candidato más grande del grupo. Un fragmento cuyo tamaño en LÍNEAS viene de un " +
    "comentario largo, no de código (el fingerprint hashea cualquier nodo por TIPO, comentarios incluidos, pero " +
    "un nodo de comentario aporta 1 solo nodo sea cual sea su largo), mide una densidad estructural muy por " +
    "debajo de un duplicado real. Medido sobre el corpus real (analyzeFile directo, no estimado): " +
    "ListenableFuture.java (guava) — interfaz con un Javadoc de ~30 líneas + 1 método — mide 1.46 nodos/línea " +
    "(falso medido); los 19 verdaderos de span chico (≤14 líneas) medidos en 8 lenguajes miden todos ≥4.67. El " +
    "corte (3.0) cae a mitad del hueco medido, con margen a los dos lados.",
});

/** Nodos por línea de un candidato — la densidad estructural del punto 1 de arriba. */
export function cloneDensity(clone: Pick<CloneCandidate, "nodes" | "startLine" | "endLine">): number {
  const lines = clone.endLine - clone.startLine + 1;
  return lines > 0 ? clone.nodes / lines : clone.nodes;
}

/** `true` cuando la densidad de `clone` cae debajo del piso declarado. */
export function isLowDensityClone(
  clone: Pick<CloneCandidate, "nodes" | "startLine" | "endLine">,
  minDensity: { readonly value: number },
): boolean {
  return cloneDensity(clone) < minDensity.value;
}

/** Los tres `EdgeKind` que valen como "esta clase cumple un contrato de afuera" — ver el punto 2 del docstring de cabecera. */
const CONTRACT_EDGE_KINDS = new Set(["implements", "extends", "satisfies"]);

/** Clave de índice: mismo archivo + mismo nombre de clase (ver el límite declarado sobre nombres anidados). */
function classKey(file: string, className: string): string {
  return `${file} ${className}`;
}

/**
 * Para cada símbolo `class-like` del grafo, el conjunto de blancos
 * (`CodeGraphEdge.to`) que alcanza por una arista `implements`/`extends`/
 * `satisfies` — ver el punto 2 del docstring de cabecera. `graph === null`
 * da el mapa vacío a propósito: sin grafo este filtro nunca encuentra un
 * blanco compartido y `hasSharedContractTarget` siempre devuelve `false` —
 * nunca oculta de más por falta de grafo.
 */
export function computeContractTargets(graph: CodeGraph | null): ReadonlyMap<string, ReadonlySet<string>> {
  const targets = new Map<string, Set<string>>();
  if (!graph) return targets;

  const keyById = new Map<string, string>();
  for (const node of graph.nodes) {
    if (node.kind !== "symbol" || node.family !== "class-like" || node.symbolPath.length === 0) continue;
    keyById.set(node.id, classKey(node.file, node.symbolPath[node.symbolPath.length - 1]!));
  }
  for (const edge of graph.edges) {
    if (!CONTRACT_EDGE_KINDS.has(edge.kind)) continue;
    const key = keyById.get(edge.from);
    if (!key) continue;
    let set = targets.get(key);
    if (!set) {
      set = new Set();
      targets.set(key, set);
    }
    set.add(edge.to);
  }
  return targets;
}

/**
 * `true` cuando el grupo tiene AL MENOS DOS clases DISTINTAS (hermanas, no
 * la misma clase repetida — la auto-duplicación dentro de una sola clase
 * no es este patrón) y TODAS comparten al menos un blanco de
 * `implements`/`extends`/`satisfies` — ver el punto 2 del docstring de
 * cabecera para el porqué de exigir un blanco COMPARTIDO en vez de "cada
 * una implementa algo".
 */
export function hasSharedContractTarget(
  group: readonly CloneCandidate[],
  contractTargets: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  const classNames = new Set<string>();
  const keys = new Set<string>();
  for (const clone of group) {
    if (!clone.className) return false;
    classNames.add(clone.className);
    keys.add(classKey(clone.file, clone.className));
  }
  if (classNames.size < 2) return false;

  const perClassTargets: ReadonlySet<string>[] = [];
  for (const key of keys) {
    const targetsOfClass = contractTargets.get(key);
    if (!targetsOfClass || targetsOfClass.size === 0) return false;
    perClassTargets.push(targetsOfClass);
  }

  const [firstTargets, ...restTargets] = perClassTargets;
  if (!firstTargets) return false;
  let sharedCount = 0;
  for (const target of firstTargets) {
    if (restTargets.every((targets) => targets.has(target))) sharedCount++;
  }
  return sharedCount > 0;
}

/** Escapa un texto para usarlo literal dentro de un `RegExp`. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Forma de identificador simple — vocabulario de GRAMÁTICA (un nombre de
 * función válido en cualquiera de los lenguajes soportados), no léxico de
 * dominio. Evita armar un `RegExp` a partir de un `functionName` con
 * caracteres que un identificador nunca tiene (paréntesis, `::`, `<>` de
 * genéricos capturados por error, etc.).
 */
const SIMPLE_IDENTIFIER = /^[\p{L}_$][\p{L}\p{N}_$]*$/u;

/**
 * `true` cuando el grupo tiene EXACTAMENTE 2 copias, sus `functionName`
 * difieren, y sacar el propio nombre de cada una de su `normalized` —
 * SÓLO en posición de INVOCACIÓN (`nombre(`, con o sin espacio antes del
 * paréntesis, nunca como referencia suelta) — deja el mismo texto. Ver el
 * punto 3 del docstring de cabecera.
 *
 * POR QUÉ SÓLO POSICIÓN DE INVOCACIÓN — MEDIDO, no supuesto: la primera
 * versión de este filtro sacaba el nombre como palabra completa en
 * CUALQUIER posición, sin mirar si era una llamada. Contra el corpus real
 * (jekyll) eso producía un FALSO NEGATIVO grave: `Converter.
 * highlighter_prefix`/`highlighter_suffix` (`lib/jekyll/converter.rb`,
 * verdadero MEDIDO en la planilla — "getter/setter con default…
 * repetido con distinto nombre de variable, duplicación real") — el
 * nombre del método aparece TAMBIÉN como nombre del PARÁMETRO (`def self.
 * highlighter_prefix(highlighter_prefix = nil)`) y como variable de
 * instancia (`@highlighter_prefix`, dos veces), ninguna de las dos en
 * posición de llamada. La versión sin restricción tachaba las tres, y el
 * texto quedaba "igualado" cuando en realidad seguía habiendo una
 * diferencia real (el nombre del PARÁMETRO — `highlighter_prefix` vs.
 * `highlighter_suffix` — nunca se saca). Restringir a "seguido de `(`"
 * excluye esas dos apariciones (ninguna llama a nada) y sólo saca la
 * mención de la declaración del método (que sintácticamente también luce
 * como `nombre(`) y la de una invocación real como `Math.Min(…)` — la
 * forma medida en `MathUtils.Min`/`Max` (newtonsoft-json, falso medido):
 * ahí el nombre SÓLO aparece en la declaración y en la llamada a
 * `Math.Min`/`Math.Max`, nunca como parámetro ni como variable de
 * instancia. Con esta restricción, `highlighter_prefix`/
 * `highlighter_suffix` YA NO iguala (regresión cubierta con el texto real
 * del archivo en el test) y `Min`/`Max` sigue igualando.
 */
export function isSymmetricNamePair(group: readonly CloneCandidate[]): boolean {
  if (group.length !== 2) return false;
  const [a, b] = group as readonly [CloneCandidate, CloneCandidate];
  if (!a.functionName || !b.functionName || a.functionName === b.functionName) return false;
  if (!SIMPLE_IDENTIFIER.test(a.functionName) || !SIMPLE_IDENTIFIER.test(b.functionName)) return false;

  const placeholder = " ";
  const strip = (clone: CloneCandidate) =>
    clone.normalized.replace(new RegExp(`\\b${escapeRegExp(clone.functionName!)}\\b(?=\\s*\\()`, "gu"), placeholder);
  return strip(a) === strip(b);
}
