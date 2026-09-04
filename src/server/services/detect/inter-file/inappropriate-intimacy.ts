/**
 * `inappropriate-intimacy` — dos archivos que se conocen mutuamente los
 * detalles internos, con INTENSIDAD, no sólo con dependencia (PLAN.md §4.1
 * catálogo; detector `inter-file` sobre `RepoUnit.graph`, mismo patrón que
 * `dependency-cycle`/`orphan-file`/`unused-symbol`).
 *
 * RELACIÓN (sin jerga de AST): un PAR de archivos A/B donde, en las DOS
 * direcciones, el código de uno referencia VARIOS símbolos DISTINTOS
 * (funciones, métodos, campos) declarados en el otro — no un único punto de
 * contacto compartido, sino una red de referencias cruzadas: A conoce varias
 * piezas internas de B y B conoce varias piezas internas de A. La magnitud
 * que se umbraliza es `mutualBreadth = min(símbolos distintos de B que A
 * referencia, símbolos distintos de A que B referencia)` — el MÍNIMO de las
 * dos direcciones, porque "intimidad mutua" exige que AMBOS lados tengan
 * detalle, no que un lado sea intenso y el otro apenas roce al primero.
 *
 * DIFERENCIA CON `dependency-cycle` (mismo grafo, pregunta distinta): un
 * ciclo de 2 archivos en `dependency-cycle` sólo exige ALCANZABILIDAD en las
 * dos direcciones — UNA arista `references` en cada sentido (aunque sea un
 * único símbolo tocado una sola vez) ya cierra el ciclo. Ese detector mide
 * FORMA (¿existe el camino de vuelta?). Éste mide INTENSIDAD (¿cuántos
 * detalles distintos conoce cada lado del otro?): un par con exactamente un
 * símbolo referenciado en cada dirección es, para `dependency-cycle`, un
 * ciclo tamaño 2 completo; para ESTE detector, con `mutualBreadth = 1`, está
 * por debajo del piso y NO dispara (ver el test que lo verifica
 * explícitamente). Todo hallazgo de este detector es, por construcción,
 * también un ciclo de tamaño 2 para el detector hermano — la relación es de
 * SUBCONJUNTO (un caso especial, más exigente, del mismo fenómeno
 * estructural), nunca de duplicado: los dos pueden coexistir en la salida
 * sin que ninguno sea redundante, porque responden preguntas distintas
 * ("¿hay un ciclo?" vs. "¿ese ciclo es, además, INTENSO en las dos
 * direcciones?").
 *
 * ─────────────────────────────────────────────────────────────────────────
 * OLA P (P8) — LA DEFINICIÓN ESTABA MAL HECHA, Y ASÍ SE MIDIÓ
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Este kind estaba en 0 % de precisión con DOS muestras independientes
 * (n=15 y n=10, ninguna con un solo `verdadero`). Leídas las 15 notas de la
 * planilla de veredictos una por una, **14 de las 15 dicen la MISMA cosa con
 * palabras distintas**: los dos archivos del par son UN SOLO MÓDULO.
 *
 *   · 6 de hugo y 2 de cobra: "son del MISMO paquete de Go — Go no exige
 *     import entre archivos del mismo paquete y no hay límite de módulo que
 *     cruzar; el smell (Fowler) es sobre cruzar límites de clase/módulo, que
 *     acá no existe".
 *   · 4 de sqlalchemy: `sql/_typing.py` con `sql/elements.py`,
 *     `sql/ddl.py` con `sql/schema.py`, `sql/base.py` con `sql/elements.py`
 *     — "par fundacional del mismo lenguaje de expresiones", "módulo
 *     compañero cuya única razón de existir es sostener al otro".
 *   · 2 de click (`core.py` con `exceptions.py` y con `decorators.py`), 1 de
 *     vueuse (la composable y su envoltorio de componente, MISMA carpeta de
 *     feature), 1 de preact (augmentation de tipos).
 *
 * Y el propio docstring de este archivo ya lo decía, en "CON QUÉ SE
 * CONFUNDE": "dos archivos que son, en los hechos, DOS MITADES DE UN MISMO
 * CONCEPTO … van a mostrar EXACTAMENTE esta firma … porque la intimidad es,
 * ahí, correcta". Estaba escrito, se ofrecía `Inline Class` como salida
 * alternativa, y aun así el hallazgo se emitía. **Emitir un hallazgo cuya
 * propia explicación dice "esto puede estar perfectamente bien" es lo que la
 * planilla registró como 15 falsos.** No es un umbral bajo: es la pregunta
 * mal hecha.
 *
 * LOS DOS CAMBIOS:
 *
 *  A. **La intimidad tiene que CRUZAR un límite de módulo.** El límite de
 *     módulo que existe en las nueve gramáticas sin inventar una convención
 *     de proyecto es la CARPETA INMEDIATA: es el paquete en Go, el paquete en
 *     Python, y la unidad de agrupamiento por defecto en el resto. Es el
 *     mismo hecho estructural que `dependency-cycle.ts` ya usa
 *     (`crossesFolderBoundary`) — no se inventa vocabulario nuevo. Dos
 *     archivos de la misma carpeta que se conocen por dentro son cohesión
 *     interna de un módulo: invisible desde afuera y sin frontera de
 *     encapsulamiento que violar.
 *  B. **`calls` cuenta igual que `references`.** `calls` es la partición
 *     callee de la MISMA cascada de resolución (`graph/edge-kinds.ts`:
 *     "partición callee/no-callee de los MISMOS candidatos de `references`").
 *     Desde que ese kind se separó, este detector — que filtraba
 *     `edge.kind === "references"` — dejó de ver TODA llamada a un método
 *     como evidencia de conocer un detalle interno del otro archivo, que es
 *     justamente la evidencia central del smell. Es un arreglo de RECALL, no
 *     de ruido.
 *
 * RESULTADO MEDIDO (13 repos): 31 → 3 hallazgos; los 9 falsos juzgados que
 * seguían vivos, todos muertos; ningún verdadero juzgado muerto (no había
 * ninguno). **Y hay que decirlo sin adornos: go y typescript caen a CERO.**
 * No es una rotura por lenguaje — el criterio es el mismo en los nueve y no
 * lee `language` — sino la consecuencia medida de que el 100 % de lo que este
 * detector encontraba en Go (10 de 10, 8 de ellos juzgados y falsos) fueran
 * pares del mismo paquete. Los 3 supervivientes son de sqlalchemy y cruzan de
 * `engine/` a `sql/`; NINGUNO está juzgado, así que la precisión de este kind
 * **sigue sin poder afirmarse por encima de 0 %**: lo que se puede afirmar es
 * que los 15 falsos conocidos ya no se emiten. Queda pedido re-juzgar.
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: la señal es un conteo de aristas
 * `references`/`calls` del grafo agrupadas por par de archivos, más la
 * comparación de dos prefijos de ruta — cero vocabulario de dominio, cero
 * nombre de archivo, cero convención de nombre.
 *
 * SIMPLIFICACIONES DECLARADAS:
 *  - Sólo aristas `kind: "references"` y `kind: "calls"` — las dos mitades de
 *    la MISMA cascada (ver el cambio B de arriba). `extends`/`implements`/
 *    `mixes-in`/`instantiates`/`imports`/`satisfies` describen relaciones
 *    distintas (herencia, construcción, módulo) y siguen fuera: heredar de
 *    una clase no es "conocerle los detalles internos", es usar su contrato.
 *  - `mutualBreadth` cuenta SÍMBOLOS DESTINO distintos, no ocurrencias: dos
 *    llamadas a la MISMA función cuentan una vez (breadth 1), porque lo que
 *    mide "conoce muchos detalles" es CUÁNTAS piezas internas distintas toca,
 *    no cuántas veces vuelve a tocar la misma. Las ocurrencias totales
 *    (`weight` sumado) viajan como `evidence`, sin umbral, como dato
 *    complementario de frecuencia.
 *  - NO DISTINGUE MIEMBRO PÚBLICO DE PRIVADO: `visibilidad` (`Capability`)
 *    es hoy inutilizable como `needs` (CONTRATO-F5.md §3.2, bug 7: falsa en
 *    los 9 lenguajes por una limitación de derivación, incluso con
 *    `private`/`public` escritos en la sonda). El nombre clásico del smell
 *    (Fowler, "Refactoring: Improving the Design of Existing Code", cap. 3,
 *    "Inappropriate Intimacy") habla de acceso a las partes PRIVADAS de la
 *    otra clase; sin `visibilidad` disponible, este detector usa la BREADTH
 *    de símbolos distintos referenciados como la mejor proxy estructural
 *    disponible hoy, y lo declara: dos archivos con acoplamiento intenso pero
 *    enteramente a través de una API pública amplia producen la MISMA firma
 *    que dos archivos que se manosean los internals — el `detail` no afirma
 *    "acceden a privados", afirma "conocen varios detalles distintos del
 *    otro", que es lo que el grafo puede sostener.
 *  - UMBRAL (`citado`, R3 — auditoría de umbrales inventados): Fowler nombra
 *    y describe el smell mas no publica un número de "cuántos símbolos
 *    distintos es demasiado" para ESTE par de métricas (breadth mutua entre
 *    dos archivos) — ninguna herramienta de las citadas en los detectores
 *    hermanos (SonarSource, RuboCop, Arcan) lo fija tampoco. El CORTE en sí
 *    (2 tolera coincidencia/acoplamiento puntual sano, 3 ya no) sí es
 *    citable: es la Regla de Tres (Roberts, popularizada por Fowler,
 *    "Refactoring", 1999), el mismo razonamiento que ya usan
 *    `coupling-without-abstraction.ts#MIN_CLIENTS_SPEC` y
 *    `scattered-instantiation.ts#MIN_SITES_SPEC` para la pregunta gemela
 *    ("varios, no dos") sobre otra métrica de par. No se atribuye a Fowler
 *    el NÚMERO 3 para "breadth mutua" específicamente — se atribuye el
 *    principio general que motiva elegir 3 en vez de 2 o 4.
 *
 * CON QUÉ SE CONFUNDE — Y NO ES UN FALSO POSITIVO, ES UNA SEGUNDA LECTURA
 * VÁLIDA: dos archivos que son, en los hechos, DOS MITADES DE UN MISMO
 * CONCEPTO partido en dos por una convención de proyecto (declaración e
 * implementación, un modelo y su serializador exclusivo, un componente y su
 * único helper privado) van a mostrar EXACTAMENTE esta firma — intimidad
 * mutua intensa — porque la intimidad es, ahí, correcta: son una sola unidad
 * de diseño con una frontera de archivo arbitraria. La respuesta en ese caso
 * NO es reducir el acoplamiento (`Move Method`/romper la asociación
 * bidireccional): es reconocer que la frontera de archivo es el problema y
 * fusionarlos (`Inline Class`). Este detector NO puede distinguir las dos
 * lecturas por sí solo (no mira nombres de archivo ni convención de
 * proyecto — regla 4), así que ofrece las DOS salidas en `advice`:
 * `primary` para el caso "acoplamiento a reducir", `alternatives` para el
 * caso "esto ya debería ser un solo archivo" — la persona que lee el
 * hallazgo decide cuál aplica, con el número (`mutualBreadth` de cada
 * dirección) puesto sobre la mesa para decidir.
 *
 * PROVENANCE Y OJO CON JAVA/guava (MEDIDO por el detector hermano, mismo
 * corpus): sólo cuentan aristas `provenance` `declared`/`resolved` — se
 * EXCLUYEN a propósito las `inferred` (la etapa heurística `path-proximity`
 * de la cascada de resolución), mismo criterio que `dependency-cycle.ts`
 * porque la intensidad de intimidad es EVIDENCIA POSITIVA del hallazgo
 * (CONTRATO-F5.md §4.4: "si la arista es evidencia positiva, excluir
 * `inferred` es lo conservador"). `path-proximity` domina el 81% de las
 * aristas `references` aceptadas en guava y su precisión no está validada
 * contra el dataset etiquetado (que es sólo Ruby): por construcción,
 * NINGÚN hallazgo de este detector puede depender de una arista `inferred`
 * — si en guava aparecen pares, es porque el 19% restante de aristas
 * `declared`/`resolved` ya alcanza el piso por sí solo. El riesgo en Java,
 * entonces, corre al revés que en otros lenguajes: no es sobre-reportar, es
 * SUB-reportar pares reales cuya intensidad sólo se ve completa contando las
 * `inferred` que acá se descartan — limitación declarada, no escondida, y el
 * `detail` de un hallazgo sobre `.java` lo dice explícitamente.
 *
 * SEGUNDA BRECHA DE JAVA, VERIFICADA A MANO CONTRA EL CORPUS (distinta de la
 * de `path-proximity` de arriba, y más sorprendente: NO depende de `inferred`)
 * — ver el resultado de esta tarea para la corrida completa: los pares que
 * este detector encuentra en guava son, sin excepción MEDIDA (P5: 28/28 al
 * cerrar esta tarea, hand-verificados 5/5 comparando el contenido de ambos
 * archivos — diffs de 0 a 23 líneas sobre 400-600+, es decir, el MISMO
 * archivo casi al carácter), un archivo con `android/guava/src/...` en la
 * ruta emparejado con su copia casi idéntica bajo `guava/src/...` (mismo
 * paquete, misma clase — guava mantiene dos árboles fuente para el build de
 * Android y el build de JRE) — o, en un caso, dos archivos `Striped64.java`
 * en PAQUETES distintos (`cache/` y `hash/`) dentro del MISMO árbol. Repro
 * mínimo, corrido sobre `FinalizableReferenceQueue.java` de los dos árboles:
 * las aristas que cierran el par tienen `provenance: "resolved"` (no
 * `"inferred"`) y `resolvedBy: "global-uniqueness"` — esa etapa liga una
 * referencia a la clase anidada `SystemLoader`/`DecoupledLoader`/etc. de UN
 * archivo con la declaración del OTRO archivo (no con su propia declaración
 * local, que también existe), porque ambos árboles declaran una clase
 * anidada con el MISMO nombre calificado y la etapa no distingue
 * "declaración en el mismo archivo" de "declaración en un archivo no
 * relacionado que sólo comparte nombre". Es una limitación de
 * `graph/resolve.ts` (archivo compartido, reportada, no tocada — regla 6),
 * no de este detector, pero éste la hereda completa: TODOS los pares de
 * guava dependen de ella, así que el resultado de guava para este detector
 * específicamente NO debe leerse como intimidad real hasta que esa etapa
 * deje de cruzar árboles de fuente independientes.
 *
 * TECHO DE SEVERIDAD POR PROVENANCE (P5, CRITERIO UNIFICADO — mismo en
 * `layer-skip.ts`/`dependency-cycle.ts`/`coupling-without-abstraction.ts`/
 * `fanout-without-cohesion.ts`; reemplaza a este detector NO teniendo ningún
 * amortiguador de SEVERIDAD antes de esta tarea, sólo una nota informativa en
 * `detail`): se mide, para el par (`first`,`second`) de cada hallazgo, qué
 * fracción de TODAS sus aristas `references` — cualquier `provenance`, ambos
 * sentidos — es `inferred`. Si supera 0.5 (`MAJORITY_INFERRED_RATIO`), la
 * severidad se ACOTA a `LOW_CONFIDENCE_SEVERITY_CEILING = 35`. MEDICIÓN, no
 * nombre de lenguaje: sigue sin leer `language` para la severidad (ver
 * "LÍMITES DECLARADOS POR LENGUAJE" abajo).
 *
 * LÍMITE MEDIDO DE ESTE TECHO SOBRE LA SEGUNDA BRECHA DE ARRIBA, NO OCULTO —
 * verificado corriendo este detector sobre el grafo real de guava (P5, antes
 * de tocar código): de sus 28 hallazgos (28/28 mismo-basename, hand-
 * verificados como falsos positivos del árbol espejo, ver arriba), este
 * techo por `inferred` acota **0 de 28**: las aristas `references` que
 * cierran estos pares son `resolved`/`global-uniqueness`, no `inferred` —
 * exactamente la categoría de provenance que la SEGUNDA BRECHA de arriba ya
 * documenta, distinta de la que este techo cubre. Esta unificación entrega
 * el criterio pedido (una regla, medida, no un nombre de lenguaje) y SÍ
 * ayuda en detectores/repos donde `inferred` domina (ver
 * `fanout-without-cohesion.ts`), pero NO resuelve por sí sola la severidad
 * inflada de los 28 pares espejo de guava — la raíz sigue siendo
 * `graph/resolve.ts` (fuera de alcance, regla 6). Reportado, no escondido:
 * ver el resultado de esta tarea para el hand-verification completo (5 en
 * guava, 5 en el resto del corpus no-Java) y el conteo de falsos positivos.
 *
 * LÍMITES DECLARADOS POR LENGUAJE: ninguno explícito más allá de las dos
 * brechas de arriba — el detector no lee `language` salvo para la nota de
 * `path-proximity`, así que es agnóstico de lenguaje por construcción (mismo
 * criterio que `dependency-cycle.ts`).
 */
import { citado, presupuesto } from "../thresholds.js";
import type { Threshold } from "../thresholds.js";
import type { CodeGraph, CodeGraphEdge, CodeGraphNode } from "../../graph/types.js";
import type { InterFileDetector, RawFinding, RepoUnit, RunContext } from "../types.js";

type ThresholdKey = "minMutualBreadth";

/**
 * R3: `citado`, no `pisoDeclarado` — ver "UMBRAL" en el docstring del
 * módulo. Un solo símbolo compartido en cada dirección (breadth 1) es
 * acoplamiento ordinario: una función que llama a otra y es llamada de
 * vuelta es un patrón común y sano (getter/callback). Recién con >= 3
 * símbolos DISTINTOS conocidos en CADA dirección hay evidencia de que ambos
 * lados entienden varias piezas de la estructura interna del otro, no un
 * único punto de contacto — la Regla de Tres aplicada a esta métrica de
 * par. Antes `pisoDeclarado(3, …)`, mismo valor.
 */
const MIN_MUTUAL_BREADTH_SPEC = citado(3, {
  work: "Fowler, Refactoring: Improving the Design of Existing Code (1999)",
  rule:
    "Regla de Tres (Roberts): dos ocurrencias toleran coincidencia, la tercera ya no. Aplicada acá a la breadth " +
    "mutua entre dos archivos: breadth 1-2 en cada dirección es indistinguible de un acoplamiento puntual sano " +
    "(una función que llama a otra y es llamada de vuelta, p.ej. un callback); recién con >= 3 símbolos DISTINTOS " +
    "conocidos en CADA dirección hay evidencia de que ambos archivos entienden varias piezas de la estructura " +
    "interna del otro, no un único punto de contacto. Ninguna herramienta citada en los detectores hermanos " +
    "(SonarSource, RuboCop, Arcan) fija un número para ESTA métrica de par específicamente — se atribuye el " +
    "principio general (Regla de Tres), no un número tomado de Fowler para este par exacto.",
});

/** Tope de VOLUMEN propio, no de detección — mismo patrón que los 3 detectores hermanos. */
const MAX_FINDINGS_SPEC = presupuesto(40, {
  rationale:
    "un panel legible no lista de forma útil más de unas pocas decenas de pares con intimidad intensa a la vez; " +
    "es tope de volumen, no umbral de detección.",
});

/** Mayoría de aristas `inferred` entre el par (mismo corte 0.5 que el resto
 *  del catálogo F5 usa para esta decisión) — ver "TECHO DE SEVERIDAD POR
 *  PROVENANCE" en el docstring del módulo. No es un `Threshold` de
 *  detección: no decide SI se emite, sólo cuánto se acota la severidad de lo
 *  que ya se decidió emitir. */
const MAJORITY_INFERRED_RATIO = 0.5;
const LOW_CONFIDENCE_SEVERITY_CEILING = 35;

function fileName(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

function immediateFolderOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

/** `references` y `calls` (las dos mitades de la misma cascada — cambio B del docstring del
 *  módulo), y sólo provenance `declared`/`resolved` — ver "PROVENANCE Y OJO CON JAVA".
 *  Excluye también `ambiguous` (CONTRATO-F9.md §4.5: fuera de toda consulta por defecto). */
function isConfidentIntimacyEdge(edge: CodeGraphEdge): boolean {
  return (
    (edge.kind === "references" || edge.kind === "calls") &&
    edge.provenance !== "inferred" &&
    edge.provenance !== "ambiguous"
  );
}

/** Par no ordenado — para medir confianza sin importar el sentido de la arista ruidosa. */
function unorderedPairKey(a: string, b: string): string {
  return a < b ? `${a} ${b}` : `${b} ${a}`;
}

interface PairProvenanceCount {
  total: number;
  inferred: number;
}

/**
 * Segunda pasada O(E), independiente de `isConfidentIntimacyEdge`: mide,
 * para cada par NO ORDENADO de archivos, qué fracción de TODAS sus aristas
 * `references` (cualquier `provenance`) es `inferred` — ver "TECHO DE
 * SEVERIDAD POR PROVENANCE" en el docstring del módulo.
 */
function computeInferredRatioByPair(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): Map<string, PairProvenanceCount> {
  const nodeById = new Map(nodes.map((n) => [n.id, n] as const));
  const counts = new Map<string, PairProvenanceCount>();
  for (const edge of edges) {
    if (edge.kind !== "references" && edge.kind !== "calls") continue;
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to || from.file === to.file) continue;
    const key = unorderedPairKey(from.file, to.file);
    let c = counts.get(key);
    if (!c) {
      c = { total: 0, inferred: 0 };
      counts.set(key, c);
    }
    c.total++;
    if (edge.provenance === "inferred") c.inferred++;
  }
  return counts;
}

function inferredRatioOfPair(counts: ReadonlyMap<string, PairProvenanceCount>, a: string, b: string): number {
  const c = counts.get(unorderedPairKey(a, b));
  if (!c || c.total === 0) return 0;
  return c.inferred / c.total;
}

interface DirectedLink {
  /** Ids de símbolo DISTINTOS del archivo destino que el archivo origen referencia — la "breadth". */
  readonly distinctTargets: Set<string>;
  /** Ocurrencias colapsadas (suma de `weight`) — frecuencia, viaja sólo como evidencia, sin umbral. */
  weight: number;
}

/**
 * `fromFile -> toFile -> DirectedLink`, construido con una única pasada por
 * `graph.edges` (O(E), barato incluso en guava). Sólo cuenta aristas cuyo
 * destino sea un nodo `symbol` real (nunca `file`/`folder`): referenciar un
 * SÍMBOLO es "conocer un detalle interno"; un nodo `file`/`folder` no es un
 * detalle, es el propio contenedor.
 */
function buildDirectedFileLinks(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): Map<string, Map<string, DirectedLink>> {
  const nodeById = new Map(nodes.map((n) => [n.id, n] as const));
  const links = new Map<string, Map<string, DirectedLink>>();

  for (const edge of edges) {
    if (!isConfidentIntimacyEdge(edge)) continue;
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to || to.kind !== "symbol") continue;
    if (from.file === to.file) continue; // intra-archivo: no es conocimiento cruzado entre archivos

    let byTarget = links.get(from.file);
    if (!byTarget) {
      byTarget = new Map();
      links.set(from.file, byTarget);
    }
    let link = byTarget.get(to.file);
    if (!link) {
      link = { distinctTargets: new Set(), weight: 0 };
      byTarget.set(to.file, link);
    }
    link.distinctTargets.add(edge.to);
    link.weight += edge.weight;
  }

  return links;
}

/**
 * Severidad: crece con `mutualBreadth` (la magnitud del `trigger`). Ya no
 * hay término por carpeta: desde la Ola P un par de la MISMA carpeta no es un
 * hallazgo de severidad baja sino **ningún hallazgo** (cambio A del docstring
 * del módulo), así que restarle 12 puntos sería un residuo de la definición
 * vieja. Si la mayoría de las aristas del par son `inferred`, se ACOTA (no
 * sólo se resta) a un techo bajo — ver "TECHO DE SEVERIDAD POR PROVENANCE"
 * en el docstring del módulo (criterio unificado P5, con su límite medido
 * documentado ahí).
 */
function severityOf(mutualBreadth: number, inferredRatio: number): number {
  const base = 43 + mutualBreadth * 6;
  const capped = Math.max(20, Math.min(100, base));
  return inferredRatio > MAJORITY_INFERRED_RATIO ? Math.min(capped, LOW_CONFIDENCE_SEVERITY_CEILING) : capped;
}

/**
 * Único lugar que arma los `RawFinding[]` — separado de `detector.run` para
 * poder testear la lógica sin pasar por `RunContext`, mismo patrón que
 * `findDependencyCycles`/`buildOrphanFileFindings` en los detectores hermanos.
 */
export function findInappropriateIntimacy(repo: RepoUnit, minMutualBreadth: Threshold): readonly RawFinding[] {
  const graph = repo.graph;
  if (!graph) return [];

  const links = buildDirectedFileLinks(graph.nodes, graph.edges);
  const languageByFile = new Map(repo.files.map((f) => [f.path, f.language]));
  const linesByFile = new Map(repo.files.map((f) => [f.path, f.lines]));
  const provenanceByPair = computeInferredRatioByPair(graph.nodes, graph.edges);
  const findings: RawFinding[] = [];
  const seen = new Set<string>();

  for (const [fileA, targetsFromA] of links) {
    for (const fileB of targetsFromA.keys()) {
      const [first, second] = fileA < fileB ? [fileA, fileB] : [fileB, fileA];
      const pairKey = `${first} ${second}`;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      // EL LÍMITE DE MÓDULO — cambio A del docstring del módulo. Va ANTES de
      // cualquier otro cálculo a propósito: dos archivos de la misma carpeta
      // son el mismo módulo, y "conocerse por dentro" dentro de un módulo es
      // cohesión, no intimidad inapropiada. 14 de los 15 falsos juzgados a
      // mano de este kind son exactamente eso.
      if (immediateFolderOf(first) === immediateFolderOf(second)) continue;

      const linkAtoB = links.get(first)?.get(second);
      const linkBtoA = links.get(second)?.get(first);
      if (!linkAtoB || !linkBtoA) continue; // sólo un sentido: no es intimidad MUTUA

      const breadthAtoB = linkAtoB.distinctTargets.size;
      const breadthBtoA = linkBtoA.distinctTargets.size;
      const mutualBreadth = Math.min(breadthAtoB, breadthBtoA);
      if (mutualBreadth < minMutualBreadth.value) continue;

      const involvesJava = languageByFile.get(first) === "java" || languageByFile.get(second) === "java";
      const inferredRatio = inferredRatioOfPair(provenanceByPair, first, second);
      const lowConfidence = inferredRatio > MAJORITY_INFERRED_RATIO;

      findings.push({
        title: `"${fileName(first)}" y "${fileName(second)}" se conocen los detalles internos mutuamente`,
        detail:
          `Cada archivo referencia varios símbolos DISTINTOS declarados en el otro, en las dos direcciones ` +
          `("${fileName(first)}" toca ${breadthAtoB} de "${fileName(second)}"; "${fileName(second)}" toca ${breadthBtoA} ` +
          `de "${fileName(first)}"): no es un único punto de contacto compartido, es una red de referencias cruzadas ` +
          "donde ambos lados dependen del detalle interno del otro — cambiar una pieza interna de cualquiera de los " +
          "dos obliga a revisar el otro. " +
          "Los dos archivos viven en CARPETAS DISTINTAS, o sea que la intimidad cruza un límite de módulo: por eso " +
          "se reporta. Un par con esta misma firma dentro de UNA sola carpeta no se reporta — ahí las dos mitades " +
          "son el mismo módulo y conocerse por dentro es cohesión, no un problema (verificado a mano: 14 de los 15 " +
          "falsos positivos históricos de este detector eran exactamente ese caso). " +
          (involvesJava
            ? " Nota de confianza: sólo cuentan aristas `declared`/`resolved` — en Java la etapa heurística de " +
              "resolución (`path-proximity`) domina las aristas aceptadas y no está validada contra un dataset " +
              "etiquetado, así que este par puede estar SUB-reportado (intimidad real cuya evidencia completa sólo " +
              "aparecería contando también las aristas `inferred`, descartadas acá a propósito por ser la lectura " +
              "conservadora)."
            : "") +
          (lowConfidence
            ? ` Severidad acotada: ${Math.round(inferredRatio * 100)}% de las aristas 'references' entre estos dos ` +
              "archivos (cualquier sentido) son 'inferred' (heurística path-proximity, no validada fuera de Ruby) — " +
              "mayoría heurística, así que la severidad se acota en consecuencia."
            : ""),
        trigger: [
          {
            label: "símbolos distintos conocidos en ambas direcciones (mínimo de las dos)",
            value: mutualBreadth,
            threshold: minMutualBreadth,
          },
        ],
        evidence: [
          { label: `símbolos distintos que "${fileName(first)}" referencia de "${fileName(second)}"`, value: breadthAtoB },
          { label: `símbolos distintos que "${fileName(second)}" referencia de "${fileName(first)}"`, value: breadthBtoA },
          { label: "ocurrencias totales (ambas direcciones)", value: linkAtoB.weight + linkBtoA.weight },
          { label: "% de las aristas 'references' del par con provenance 'inferred'", value: Math.round(inferredRatio * 100) },
        ],
        locations: [
          {
            file: first,
            startLine: 1,
            endLine: Math.max(1, linesByFile.get(first) ?? 1),
            role: `conoce ${breadthAtoB} detalles internos de "${fileName(second)}"`,
          },
          {
            file: second,
            startLine: 1,
            endLine: Math.max(1, linesByFile.get(second) ?? 1),
            role: `conoce ${breadthBtoA} detalles internos de "${fileName(first)}"`,
          },
        ],
        severity: severityOf(mutualBreadth, inferredRatio),
        advice: {
          primary: {
            name: "Move Method",
            kind: "refactorizacion",
            why:
              "Mover al lado que más las usa las operaciones que hoy cruzan la frontera con más frecuencia reduce " +
              "el número de detalles internos que cada archivo necesita conocer del otro, sin decidir todavía si " +
              "conviene fusionarlos.",
            source: "https://refactoring.guru/es/move-method",
          },
          alternatives: [
            {
              name: "Inline Class",
              kind: "refactorizacion",
              why:
                "Si al revisar el caso resulta que estos dos archivos son en los hechos dos mitades de un mismo " +
                "concepto (ver 'CON QUÉ SE CONFUNDE' en el detector) — una separación arbitraria más que un diseño " +
                "de dos responsabilidades distintas — fusionarlos es más honesto que seguir tratando de reducir un " +
                "acoplamiento que en realidad es correcto.",
              source: "https://refactoring.guru/es/inline-class",
            },
          ],
        },
      });
    }
  }

  return findings;
}

export const detector: InterFileDetector<ThresholdKey, "inappropriate-intimacy"> = {
  id: "inappropriate-intimacy",
  kind: "inappropriate-intimacy",
  scope: "inter-file",
  needsGraph: true,
  title: "Intimidad inapropiada",
  needs: [],
  /**
   * OLA 11b, frente B1 — LAS CELDAS MUDAS. `needsEdges` existía en
   * `InterFileDetector` (DIAGNÓSTICO-5B §5) con `run.ts#runInterFile` ya
   * implementándolo, y ningún detector lo declaraba. Acá aplica sin margen
   * de duda: la única lectura de aristas de este archivo es
   * `if (edge.kind !== "references") continue`, así que un grafo sin ni una
   * arista `references` deja este `run()` sin nada que mirar, y lo que
   * reportaba era `corrio, 0 hallazgos` — indistinguible de "no hay
   * intimidad inapropiada".
   *
   * EFECTO MEDIDO SOBRE FIXTURES: NINGUNO. `tests/fixtures/patterns` tiene
   * 214 aristas `references`, así que la compuerta no dispara ahí y las
   * celdas de este detector siguen exactamente como estaban. Se declara
   * igual porque la ausencia total de `references` es un modo de falla real
   * del grafo (lo fue para `imports` durante cuatro olas) y esta línea es lo
   * que hace que se vea en vez de leerse como "corrió y no encontró nada".
   */
  /**
   * OLA P (P8) — pasa de `needsEdges` (conjunción) a `needsAnyEdge`
   * (alternativa), por el criterio literal de `types.ts#needsAnyEdge`: el
   * filtro real de este detector es
   * `edge.kind === "references" || edge.kind === "calls"`, o sea dos formas
   * ALTERNATIVAS de testimoniar la MISMA relación ("este archivo usa un
   * símbolo declarado en aquél" — son las dos mitades, callee y no-callee, de
   * la misma cascada). Con la conjunción, un repo que produjera sólo `calls`
   * quedaría apagado entero con `sin-aristas`, que es exactamente la
   * regresión que la Ola 11b midió en otros tres detectores.
   */
  needsAnyEdge: ["references", "calls"],
  thresholds: {
    minMutualBreadth: MIN_MUTUAL_BREADTH_SPEC,
  },
  maxFindings: MAX_FINDINGS_SPEC,
  run(repo: RepoUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    // Defensivo: `run.ts#runInterFile` ya filtra `needsGraph && graph === null`
    // ANTES de llamar a `run()` (reporta `sin-grafo`) — mismo patrón que los 3
    // detectores hermanos.
    if (!repo.graph) return [];
    return findInappropriateIntimacy(repo, ctx.threshold("minMutualBreadth"));
  },
};
