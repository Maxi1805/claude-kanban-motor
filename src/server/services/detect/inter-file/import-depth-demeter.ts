/**
 * `import-depth-demeter` — DEMETER POR PROFUNDIDAD DE IMPORT (PLAN.md §4.1
 * catálogo; CONTRATO-F5.md Contrato 4, detector `inter-file` sobre el grafo).
 *
 * RELACIÓN (sin jerga de AST): un archivo A trae, mediante una arista
 * `imports` (`graph/edges/imports.ts` — import/require/using, SIEMPRE de
 * nivel de archivo, `fromPath: []`), un archivo B que vive varios niveles de
 * carpeta MÁS ADENTRO de otro módulo que el punto donde las rutas de A y B
 * divergen — la "superficie" de ese módulo vista desde A. Para cada arista
 * `imports` que cruza de A a B (mismo cálculo puramente geométrico que ya
 * usa el detector hermano `layer-skip.ts`, independientemente justificado
 * acá para ESTA arista — ver "CON QUÉ SE CONFUNDE" para por qué los dos
 * detectores comparten esta fórmula sin ser el mismo problema):
 *
 *   nivelesSalteados = profundidad(carpeta de B) - profundidad(ancestro
 *                       común de las carpetas de A y B) - 1
 *
 * 0 o negativo: B está en la superficie de divergencia (o más arriba) — es
 * la forma normal de importar otro módulo. 1+: el IMPORT declarado nombra un
 * archivo que sigue existiendo varios niveles más allá de esa superficie: A
 * conoce la organización INTERNA de B, no sólo lo que B expone.
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: geometría de rutas (segmentos de
 * carpeta comparados por posición) más UN filtro de FORMA de arista
 * (`kind === "imports"`) — cero vocabulario de nodo de ninguna gramática y
 * CERO nombre de archivo por convención: nunca se busca `index.*`/
 * `__init__.py`/`mod.rs` como marcador de "superficie de módulo" (sería la
 * lista de vocabulario por lenguaje que la regla 4 prohíbe, aplicada a
 * nombres de archivo — mismo argumento, independientemente llegado, que ya
 * declara `layer-skip.ts`). Las rutas de carpeta usadas acá son las mismas
 * que codifican las aristas `contains` (`graph/build.ts#folderChain`).
 *
 * NINGUNA MÉTRICA DE `graph/metrics/registry.ts` MIDE ESTO (requisito 1,
 * verificado antes de escribir código): pagerank/scc/instability/
 * clustering/louvain/componentes-conexas agregan fan-in/fan-out o
 * particionan en comunidades; ninguna mide "cuántos niveles de carpeta
 * separan a un importador de lo que importa". Este detector no reimplementa
 * ninguna de las 6: hace su propio barrido O(E) sobre `graph.edges`, mismo
 * patrón que los detectores hermanos (`dependency-cycle`/`orphan-file`/
 * `unused-symbol`/`layer-skip`), ninguno de los cuales duplica una métrica
 * del panel tampoco.
 *
 * *** BRECHA DE PRODUCCIÓN, MEDIDA, NO TEÓRICA — LO MÁS IMPORTANTE DE ESTE
 * ARCHIVO, mismo hallazgo que ya reportan independientemente
 * `speculative-abstraction.ts`/`coupling-without-abstraction.ts`/
 * `layer-skip.ts` para sus propias aristas. *** Confirmado por lectura
 * directa de `graph/build.ts#buildGraph`/`buildNodesAndContainsForFile`
 * antes de escribir una sola línea de este archivo: `assembleGraph` arma
 * `graph.edges` mezclando ÚNICAMENTE `containsEdges` + las `references`
 * resueltas por la cascada de 9 etapas (`resolve.ts`) a partir de
 * `symbols`/`references` — el `EdgeFacts[]` que produce
 * `graph/edges/imports.ts#importsExtractor` (y sus 5 hermanos de
 * `graph/edges/registry.ts#EDGE_EXTRACTORS`) NUNCA se mezcla adentro:
 * confirmado por grep, cero resultados de `imports\.js` fuera de
 * `graph/edges/*` y sus propios tests. Consecuencia MEDIDA (ver el
 * resultado de la tarea para la corrida completa sobre los 8 repos del
 * corpus, un proceso por repo): `repo.graph.edges.filter(e => e.kind ===
 * "imports")` es SIEMPRE longitud 0 en producción, en los 8 repos, en los 9
 * lenguajes — no es un fenómeno de Ruby ni de ningún lenguaje puntual, es un
 * apagón total y estructural de esta arista completa, aguas arriba de este
 * archivo (`graph/build.ts`/`graph/edges/registry.ts` no son míos, regla 6:
 * reportado, no tocado). Verificado por separado, con una extracción DIRECTA
 * del extractor (sin pasar por el grafo, mismo mecanismo que usa la propia
 * medición de CONTRATO-F5.md "en jekyll hay 6 aristas de import"): la señal
 * SÍ existe en el código fuente de 6 de los 8 repos (cientos a miles de
 * imports reales por repo — ver el resultado de la tarea), así que "0 en
 * producción" es la brecha de cableado, NUNCA "no hay imports profundos que
 * reportar". Este detector se escribe contra el CONTRATO (`EdgeKind`
 * declara `"imports"` desde F3) para que, el día que alguien cablee
 * `EDGE_EXTRACTORS` dentro de `assembleGraph`, empiece a emitir sin que
 * nadie tenga que tocarlo.
 *
 * PROVENANCE — MÁS SIMPLE QUE LOS DETECTORES HERMANOS, POR DISEÑO DEL
 * EXTRACTOR: `graph/edges/imports.ts#makeFact` fija `provenance: "declared"`
 * SIEMPRE (extracción sintáctica directa, nunca pasa por la cascada de 9
 * etapas de `resolve.ts`) — confirmado leyendo ese archivo, no medido contra
 * el corpus. La brecha de Java (`path-proximity` heurística dominando el
 * 81% de las aristas `references` ACEPTADAS en guava) sólo afecta a esa
 * cascada; una arista `imports`, si algún día se cablea, nace SIEMPRE con la
 * confianza más alta declarada por el sistema. Por eso este detector, a
 * diferencia de `dependency-cycle`/`layer-skip`/`coupling-without-
 * abstraction`, NO necesita excluir ni degradar por `provenance: "inferred"`
 * ni por lenguaje: no hay ninguna arista `imports` `inferred` que pueda
 * existir con el extractor de hoy.
 *
 * SIMPLIFICACIONES DECLARADAS:
 *  - **Profundidad medida sobre el nodo RESUELTO, no sobre el texto crudo
 *    del import.** `graph/edges/imports.ts#EdgeFacts.toName` lleva el
 *    especificador crudo completo (`"../../pkg/internal/deep/thing"`), pero
 *    `CodeGraphEdge` (`graph/types.ts`, congelado, no es mío) sólo tiene
 *    `{from, to, kind, provenance, weight, resolvedBy?}` — ningún campo de
 *    texto crudo sobrevive la resolución. Consecuencia: este detector SÓLO
 *    puede ver imports que resuelven a un archivo/símbolo DENTRO del mismo
 *    repo; un import profundo hacia un PAQUETE EXTERNO (`import x from
 *    "left-pad/lib/internal/y"`, muy común en JS/TS/Python/Go) nunca produce
 *    un nodo en este grafo y es, por lo tanto, invisible acá — brecha real y
 *    probablemente grande en repos con muchas dependencias externas,
 *    declarada, no escondida.
 *  - Un hallazgo por PAR (archivo que importa, archivo profundo importado),
 *    no por arista individual: `nivelesSalteados` depende sólo de las dos
 *    rutas, así que es idéntico para cualquier import repetido entre el
 *    mismo par — mismo criterio que `layer-skip.ts`.
 *  - **"Mismo árbol hacia abajo" (facade/barril) pesa MENOS**, igual que
 *    `layer-skip.ts`: si la carpeta de A ES el ancestro común (A vive
 *    exactamente en el punto de divergencia, importando hacia su propio
 *    subárbol), es la firma de un archivo fachada de SU PROPIO módulo
 *    reexportando sus internos — ver "CON QUÉ SE CONFUNDE".
 *  - **Techo de severidad, no sólo descuentos puntuales — requisito de la
 *    tarea, no opcional.** Ningún lenguaje de los que tienen la capacidad
 *    `imports` aporta acá una capacidad de "superficie pública de MÓDULO"
 *    (la capacidad `visibilidad` de `detect/capabilities.ts` existe, pero
 *    audita modificadores de MIEMBRO de clase — `public`/`private` en un
 *    campo — nunca si un ARCHIVO/módulo entero es su "API pública" o un
 *    detalle interno). Sin esa capacidad, en NINGÚN lenguaje (no sólo Python
 *    sin `__all__`, que es el ejemplo del enunciado) este detector puede
 *    distinguir un submódulo deliberadamente público (`numpy.linalg`,
 *    `os.path`, `requests.exceptions.Timeout`, un subpaquete público de Go)
 *    de uno genuinamente interno — por eso la severidad NUNCA alcanza el
 *    techo de la escala (`MAX_SEVERITY`, tope duro, no un ajuste fino): es
 *    hipótesis con confianza estructuralmente acotada, nunca un veredicto.
 *
 * CON QUÉ SE CONFUNDE (patrón legítimo, misma firma estructural — la razón
 * por la que esto es hipótesis con confianza, no un veredicto):
 *  - **SUBMÓDULO DELIBERADAMENTE PÚBLICO.** Muchos lenguajes/ecosistemas
 *    organizan su API pública como un namespace con puntos/carpetas
 *    (`package.exceptions.SpecificError` en Python, un subpaquete público en
 *    Java/Go) — "profundo" ahí significa "estructura pública", no "detalle
 *    interno". Ver el techo de severidad arriba: es la razón estructural de
 *    por qué existe.
 *  - **ARCHIVO FACHADA/BARRIL** de nivel superior de un módulo que a
 *    propósito importa varios niveles hacia adentro de su PROPIO árbol para
 *    reexportar y aplanar su API pública — produce exactamente esta firma.
 *    "Mismo árbol hacia abajo" (arriba) reduce la severidad para este caso,
 *    no lo descarta: distinguirlo con certeza pediría un nombre de archivo
 *    por convención, que la regla 4 prohíbe.
 *  - **TEST DE CAJA BLANCA** que importa directo una implementación interna
 *    profunda para probarla: normal, no arquitectura. Sin una convención de
 *    nombre de carpeta de test agnóstica de lenguaje, este detector no lo
 *    distingue de una dependencia de producción real.
 *  - **REPO MULTI-MÓDULO (Maven/Gradle) CON RAÍCES DE CÓDIGO PARALELAS PARA
 *    EL MISMO NAMESPACE — VERIFICADO A MANO, ES EL CONFUNDIDOR DOMINANTE EN
 *    JAVA, no una posibilidad teórica.** Verificado a mano contra guava (ver
 *    el resultado de la tarea para las 5 verificaciones completas): guava
 *    publica `guava/`, `guava-gwt/`, `guava-testlib/`, `guava-tests/`,
 *    `android/` y `futures/failureaccess/` como directorios de nivel
 *    superior SEPARADOS, cada uno con su propio `src/`, para el MISMO árbol
 *    lógico de paquetes Java (`com.google.common.*`). El ancestro común de
 *    carpetas entre dos de esos directorios es la RAÍZ del repo
 *    (`commonLen = 0`), así que CUALQUIER import que cruce dos de esos
 *    módulos infla `nivelesSalteados` por la profundidad ENTERA del paquete
 *    destino — con independencia total de si lo importado es la clase más
 *    pública del proyecto (`com.google.common.base.Ticker`, importada desde
 *    miles de lugares) o un detalle interno real. De 5 hallazgos verificados
 *    a mano leyendo el código fuente real de guava, 4 fueron exactamente
 *    este artefacto (import a una clase ampliamente pública o a la propia
 *    API publicada de `guava-testlib` — `CollectionFeature`, `Ticker`,
 *    `AbstractFuture` — o un test que importa la clase que prueba, sólo
 *    "profundo" porque vive en OTRO módulo Maven) y sólo 1 fue una lectura
 *    estructural certera (`AbstractFuture` importando
 *    `...util.concurrent.internal.InternalFutureFailureAccess` de
 *    `futures/failureaccess/`, un paquete literalmente llamado `internal` en
 *    un artefacto hermano — aunque ahí también es un acoplamiento
 *    DELIBERADO entre dos artefactos del MISMO proyecto, no un extraño
 *    tocando internos ajenos). Este confundidor es MÁS FRECUENTE que
 *    cualquier otro de esta lista en un repo Java real con build
 *    multi-módulo — mucho más que el patrón fachada/barril de arriba — y no
 *    hay forma de distinguirlo sin saber qué directorios son "el mismo
 *    módulo lógico bajo un build system", información que este grafo no
 *    tiene y que sería, otra vez, una convención por sistema de build.
 *  - **CON `layer-skip.ts`, específicamente**: comparten la MISMA fórmula
 *    geométrica (es la única forma convención-libre de ubicar una
 *    "superficie de módulo" que este código conoce), pero `layer-skip` mira
 *    CUALQUIER arista de dependencia (`kind !== "contains"` — hoy en la
 *    práctica sólo `references`, resuelta por una cascada que puede
 *    equivocarse), mientras que éste mira EXCLUSIVAMENTE una arista `imports`
 *    DECLARADA por el programador en un statement de import — una señal de
 *    intención explícita, no una resolución de símbolo heurística. El día
 *    que ambas aristas se cableen en producción, un mismo par de archivos
 *    puede legítimamente aparecer en los dos detectores: no es doble conteo
 *    del mismo dato, son dos preguntas distintas (¿alguna dependencia de
 *    código salta capas? vs. ¿el import DECLARADO de A nombra el interior de
 *    B?) sobre la misma geometría de rutas.
 *
 * BUG ARREGLADO ACÁ — `needs: ["imports"]` ERA UN GATE FALSO PARA RUBY,
 * CONTRADICHO POR EL PROPIO EXTRACTOR. Hasta este fix, este detector
 * declaraba `needs: ["imports"]` (capacidad, derivada por
 * `capabilities.ts` de los TIPOS DE NODO de la gramática) ADEMÁS de
 * `needsEdges: ["imports"]` (presencia REAL de aristas en el grafo de esta
 * corrida). `run.ts#runInterFile` chequea `needs` PRIMERO: si falla, el
 * detector ni siquiera mira `needsEdges` y reporta `no-aplicable`
 * ("el lenguaje no puede producir esto, nunca va a cambiar"). Para Ruby,
 * `capabilities.ts` deriva `imports: NO_EXISTE` porque `require`/
 * `require_relative` parsean como una llamada a método (`call`), no como un
 * nodo de import dedicado (confirmado en `capability-matrix.test.ts`) — y
 * ESO seguía siendo cierto. Lo que dejó de ser cierto es la premisa de que
 * por eso Ruby "no puede producir la arista `imports`": `graph/edges/
 * imports.ts#importsExtractor` (A7, Ola 11b) YA NO depende de esa capacidad
 * — reconoce `require`/`require_relative` por su propia forma de LLAMADA
 * (identificador desnudo del vocabulario `import`/`require`/`using` +
 * primer argumento string literal, el mismo mecanismo que ya cubría
 * `require` de CommonJS) y los emite como aristas `imports` genuinas
 * (medido ahí: `tests/fixtures/edge-emision/ruby`, 0 → 2). El propio
 * docstring de ese extractor ya lo dice: "el gate correcto para este
 * extractor es... su propia declaración de aplicabilidad, no una capacidad
 * derivada de una forma sintáctica que este extractor deliberadamente ya no
 * exige" — pero `needs: ["imports"]`, un nivel más arriba, reintroducía
 * exactamente esa capacidad rechazada, y como corre PRIMERO, silenciaba el
 * detector entero para cualquier repo Ruby-only sin mirar nunca el grafo.
 *
 * MEDIDO, no sólo argumentado: sobre `corpus/rubocop` (Ruby puro), llamar
 * `buildImportDepthDemeterFindings` directo contra el grafo real de esa
 * corrida (bypaseando el gate de `run.ts`, mismo mecanismo que ya usaba el
 * test que este fix reescribe) da **22 pares candidatos reales** — el grafo
 * SÍ trae aristas `imports` de Ruby hoy. Con `needs: ["imports"]` puesto,
 * ninguno de esos 22 llegaba nunca a `run()`: el repo entero reportaba
 * `no-aplicable`, indistinguible en el panel de "esta señal es imposible
 * acá" — que ya no es cierto.
 *
 * EL ARREGLO: `needs: []`. `needsEdges: ["imports"]` (sin tocar) ya es el
 * chequeo CORRECTO y suficiente — mide presencia real de la arista en ESTA
 * corrida, la misma señal que el extractor usa para decidir si corre. Un
 * repo Ruby-only cuyo grafo genuinamente no tenga ninguna arista `imports`
 * (cero `require`/`require_relative`, o ninguno resuelve a un archivo del
 * repo) sigue reportando `sin-aristas` — transitorio, correcto, y ya no
 * disfrazado de `no-aplicable` permanente.
 *
 * RAÍZ 3 (Ola N, frente A2b) — "EL PAQUETE NO ES UNA CAPA": FAN-IN ANCHO
 * ACOTA LA SEVERIDAD. Mismo mecanismo, misma constante y mismo docstring
 * extendido que `layer-skip.ts` ("RAÍZ 3" ahí) — no se repite acá la
 * evidencia completa. Resumen para ESTE detector, específico de aristas
 * `imports`: `guava.verdicts.csv` juzga falsos, por el mismo confundidor de
 * MÓDULO PARALELO MAVEN, imports desde `android/guava-testlib/**` hacia
 * anotaciones/tipos centrales de `com.google.common.*`
 * (`ClassSanityTester`/`CollectionIsEmptyTester`/`BiMapTestSuiteBuilder`/
 * `SetAddTester`/`AbstractTester`, nota "integrador ola M: en Java la
 * profundidad de carpeta ES el paquete, no una capa") Y, por separado,
 * imports hacia `futures/failureaccess/` desde `guava/`/`android/guava/`
 * (4 filas: `AbstractFutureState`, `Futures`, `AbstractFuture` ×2 — una vez
 * por cada módulo Maven hermano que lo importa, `android/guava/` y
 * `guava/`, nota "idioma-framework: futures/failureaccess es un
 * micro-artefacto Maven deliberadamente separado"). Ambos casos son la MISMA
 * firma: el archivo
 * importado (`InternalFutureFailureAccess`, las anotaciones de testlib) se
 * alcanza desde varias raíces de carpeta de nivel superior del mismo
 * proyecto — `computeTopAncestorFanIn` (`detect/primitivas/
 * a2b-module-boundary.ts`) lo mide sobre aristas `imports` únicamente (ver
 * "ÚNICA arista considerada" más abajo), y `WIDE_FANIN_SEVERITY_CEILING`
 * acota la severidad sin excluir el par (mismo criterio "acotar, no
 * esconder" del resto de esta ola).
 *
 * MEDIDO contra el grafo real de guava (`scratchpad/
 * a2b-measure-module-boundary.mts`, este frente, ver el resultado de la
 * tarea): de 727 pares crudos, **9 quedan con fan-in ancho** (severidad
 * acotada a <= 30) — los 9 apuntan al mismo destino,
 * `futures/failureaccess/.../InternalFutureFailureAccess.java` (fan-in
 * medido = 3 raíces de nivel superior distintas), exactamente el
 * confundidor "futures/failureaccess" citado arriba. El confundidor de
 * `guava-testlib` (imports hacia `ClassSanityTester`/`AbstractTester`/etc.)
 * NO queda cubierto por este mecanismo — mismo límite medido y misma causa
 * probable (hueco del resolvedor, no del criterio de esta regla) que ya
 * documenta `layer-skip.ts` en su sección "RAÍZ 3"; no se repite acá.
 * También el confundidor de Go (`internal/`, restricción del compilador) se
 * investigó y se dejó SIN arreglar a propósito, con su razón completa en
 * `layer-skip.ts` — no aplica distinto acá porque comparten la misma
 * primitiva.
 *
 * ════════════════════════════════════════════════════════════════════════
 * OLA O, FRENTE N3 — LA RAÍZ: PROFUNDIDAD DE RUTA ≠ PROFUNDIDAD DE CAPA
 * ════════════════════════════════════════════════════════════════════════
 *
 * La evidencia completa, medida, está en `layer-skip.ts` (bloque "LA RAÍZ")
 * y en `detect/primitivas/n3-capas-reales.ts`. Lo que aplica ACÁ:
 *
 * (1) `minRealLayers` (`MIN_REAL_LAYERS = 1`): un nivel de carpeta sólo es
 *     una CAPA si contiene directamente algún archivo analizado. Un import
 *     que atraviesa `src/com/google/common` no atraviesa cuatro capas:
 *     atraviesa cuatro carpetas VACÍAS, que son los segmentos del paquete
 *     `com.google.common.*` — exactamente lo que dicen, con esas palabras,
 *     los 9 veredictos java de este kind ("en Java la profundidad de carpeta
 *     ES el paquete, no una capa"; 9 de 9 FALSOS). Medido sobre el grafo
 *     real: 712 de 727 pares de guava cruzan CERO carpetas pobladas. El
 *     mismo mecanismo desactiva el primer nivel de Python (`lib/` en
 *     sqlalchemy = 0 archivos). Java NO queda en cero: los 15 pares que
 *     cruzan `futures/failureaccess/src` (que contiene `module-info.java`)
 *     siguen emitiendo.
 *
 * (2) LA UNIDAD DEL HALLAZGO ES (ARCHIVO QUE IMPORTA, MÓDULO IMPORTADO), no
 *     (archivo, archivo). Un archivo que importa 22 archivos internos del
 *     mismo módulo tomó UNA decisión, no 22 — el mismo argumento que este
 *     archivo ya usaba un nivel más abajo para colapsar los imports
 *     repetidos entre el mismo par. Medido: `lib/rubocop.rb` importa 22
 *     archivos internos de `lib/rubocop`, y como el censo suma `memberCount`
 *     a cada archivo distinto que toca el grupo (`census.ts#censusOf`), esos
 *     22 hallazgos pesan 22 × 23 = **506 de volumen**, el 41 % del kind
 *     entero, para UN solo archivo de UN solo repo. La cuenta de archivos
 *     internos importados pasa a la EVIDENCIA (y sube la severidad: importar
 *     20 internos es peor que importar 1), no al conteo de hallazgos.
 *
 * DIFERENCIA CON `layer-skip`, AHORA REAL: medido en esta ola, los dos
 * detectores producían el MISMO conjunto de pares byte por byte en los 7
 * repos con volumen, porque el 100 % de la evidencia de `layer-skip` viene
 * de aristas `imports` (todas sus otras aristas profundas son
 * `inferred`/`ambiguous`/`global-uniqueness`). Ahora se distinguen por
 * GRANULARIDAD: `layer-skip` responde módulo-a-módulo, éste archivo-a-módulo
 * ("¿qué ARCHIVO declara un import que nombra el interior de qué módulo?"),
 * que es la pregunta de Demeter y la que se puede accionar editando UN
 * archivo. Ver `layer-skip.ts` para los números completos.
 */
import { pisoDeclarado, presupuesto } from "../thresholds.js";
import type { Threshold } from "../thresholds.js";
import type { CodeGraph, CodeGraphNode } from "../../graph/types.js";
import type { FileSummary, InterFileDetector, RawFinding, RepoUnit, RunContext } from "../types.js";
import { confidentEdges } from "./confident-edges.js";
import { computeTopAncestorFanIn, isWideFanIn, topAncestorFanInCount } from "../primitivas/a2b-module-boundary.js";
import { countRealLayersCrossed, MIN_REAL_LAYERS, populatedFolders } from "../primitivas/n3-capas-reales.js";

type ThresholdKey = "minSkippedLevels" | "minRealLayers";

const MIN_SKIPPED_LEVELS_SPEC = pisoDeclarado(2, {
  rationale:
    "un import que resuelve exactamente en el primer nivel de divergencia de carpeta (la 'superficie' del " +
    "otro módulo vista desde quien importa) es la forma normal de cruzar un límite de módulo, y seguir UN " +
    "nivel más adentro todavía es común (importar directo un helper del primer subdirectorio); recién a partir " +
    "de DOS niveles más allá de ese punto el import declarado atraviesa una capa intermedia completa de " +
    "organización interna ajena — la forma mínima del problema que este detector busca, mismo umbral y misma " +
    "razón que ya declara independientemente `layer-skip.ts` para la geometría hermana.",
});

/** Tope duro de severidad — ver "SIMPLIFICACIONES DECLARADAS" en el docstring del módulo: ningún lenguaje
 *  aporta una capacidad de "superficie pública de módulo", así que este detector nunca afirma certeza total. */
const MAX_SEVERITY = 70;

/** Ver "RAÍZ 3 — EL PAQUETE NO ES UNA CAPA" en el docstring del módulo — mismo mecanismo y mismo número que `layer-skip.ts#WIDE_FANIN_SEVERITY_CEILING`. */
const WIDE_FANIN_SEVERITY_CEILING = 30;

/** OLA O, N3, punto (1) — ver `detect/primitivas/n3-capas-reales.ts`. Misma constante y mismo rationale que `layer-skip.ts#MIN_REAL_LAYERS_SPEC`, declarada por separado porque cada detector declara sus propios umbrales. */
const MIN_REAL_LAYERS_SPEC = pisoDeclarado(MIN_REAL_LAYERS, {
  rationale:
    "una carpeta que no contiene directamente ningún archivo analizado no tiene superficie ni punto de " +
    "entrada: un import que la atraviesa no está entrando por debajo de una capa, está recorriendo un " +
    "namespace (el caso medido del paquete Java: `src/com/google/common` son cuatro carpetas con CERO " +
    "archivos). El piso es 1 porque es el mínimo que hace VERDADERA la afirmación del hallazgo — que existía " +
    "al menos un punto de entrada real que el import podría haber nombrado y no nombró.",
});

/** Cuántos archivos internos del módulo importado se listan como `locations` de ejemplo — ver el punto (2) de "LA RAÍZ" en el docstring del módulo. */
const MAX_TARGET_EXAMPLES = 3;

/** CONTRATO-F4.md §1.8: tope de VOLUMEN propio, no de detección. */
const MAX_FINDINGS_SPEC = presupuesto(150, {
  rationale:
    "un panel legible no lista de forma útil más de un par de cientos de pares importador/importado-profundo " +
    "a la vez; es tope de volumen, no de detección.",
});

function nodeIndex(graph: CodeGraph): ReadonlyMap<string, CodeGraphNode> {
  const map = new Map<string, CodeGraphNode>();
  for (const n of graph.nodes) map.set(n.id, n);
  return map;
}

/** Segmentos de carpeta de una ruta de archivo, sin el nombre de archivo ("a/b/c.rb" -> ["a","b"]). */
function folderSegmentsOf(filePath: string): readonly string[] {
  const segments = filePath.split("/");
  segments.pop();
  return segments;
}

function commonPrefixLength(a: readonly string[], b: readonly string[]): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function symbolLabel(node: CodeGraphNode): string | null {
  if (node.kind !== "symbol" || node.symbolPath.length === 0) return null;
  return node.symbolPath[node.symbolPath.length - 1] ?? null;
}

/** Severidad: crece con `skippedLevels`, descuenta el patrón fachada/barril ("mismo árbol hacia abajo"),
 *  y nunca supera `MAX_SEVERITY` — ver "SIMPLIFICACIONES DECLARADAS" en el docstring del módulo. Si el
 *  archivo importado tiene fan-in ancho (ver "RAÍZ 3 — EL PAQUETE NO ES UNA CAPA"), se ACOTA además a
 *  `WIDE_FANIN_SEVERITY_CEILING` — mismo tratamiento que `layer-skip.ts#severityOf`. */
function severityOf(skippedLevels: number, sameTreeTopDown: boolean, wideFanIn: boolean): number {
  const base = 30 + skippedLevels * 10;
  const adjusted = sameTreeTopDown ? base - 20 : base;
  const capped = Math.max(15, Math.min(MAX_SEVERITY, adjusted));
  return wideFanIn ? Math.min(capped, WIDE_FANIN_SEVERITY_CEILING) : capped;
}

/** Un par (archivo que importa, archivo importado). Sigue siendo la unidad de MEDICIÓN de la geometría, ya no la de HALLAZGO — ver el punto (2) de "LA RAÍZ" en el docstring del módulo. */
interface PairAccumulator {
  fromFile: string;
  toFile: string;
  skippedLevels: number;
  realLayers: number;
  sameTreeTopDown: boolean;
  commonAncestorDepth: number;
  targetDepth: number;
  moduleBoundary: string;
  edgeCount: number;
  targetSymbols: Set<string>;
}

/** La unidad de HALLAZGO: (archivo que importa, módulo importado) — ver el punto (2) de "LA RAÍZ". */
interface FileModuleAccumulator {
  fromFile: string;
  moduleBoundary: string;
  pairs: PairAccumulator[];
  targetFiles: Set<string>;
}

function pairKey(fromFile: string, toFile: string): string {
  return `${fromFile} ${toFile}`;
}

function fileModuleKey(fromFile: string, moduleBoundary: string): string {
  return `${fromFile} -> ${moduleBoundary}`;
}

/** El par que REPRESENTA al (archivo, módulo): el más profundo en capas REALES, con desempate determinista. */
function representativeOf(pairs: readonly PairAccumulator[]): PairAccumulator {
  return [...pairs].sort(
    (a, b) =>
      b.realLayers - a.realLayers ||
      b.skippedLevels - a.skippedLevels ||
      pairKey(a.fromFile, a.toFile).localeCompare(pairKey(b.fromFile, b.toFile)),
  )[0]!;
}

/**
 * Único lugar que arma los `RawFinding[]` — separado de `detector.run` para
 * poder testearlo sin pasar por `RunContext`, mismo patrón que
 * `buildOrphanFileFindings`/`buildLayerSkipFindings`.
 */
export function buildImportDepthDemeterFindings(
  files: readonly FileSummary[],
  graph: CodeGraph,
  minSkippedLevels: Threshold,
  minRealLayers: Threshold,
): RawFinding[] {
  const nodeById = nodeIndex(graph);
  const linesByFile = new Map(files.map((f) => [f.path, f.lines] as const));
  // OLA O, N3, punto (1): qué carpetas son CAPAS (contienen archivos) y cuáles sólo namespace.
  const populated = populatedFolders(files);
  const pairs = new Map<string, PairAccumulator>();

  for (const edge of confidentEdges(graph)) {
    if (edge.kind !== "imports") continue; // ver docstring: ÚNICA arista considerada, a diferencia de layer-skip
    const fromNode = nodeById.get(edge.from);
    const toNode = nodeById.get(edge.to);
    if (!fromNode || !toNode) continue;
    const fromFile = fromNode.file;
    const toFile = toNode.file;
    if (fromFile === toFile) continue; // import a sí mismo: no hay límite de módulo que saltear

    const fromFolder = folderSegmentsOf(fromFile);
    const toFolder = folderSegmentsOf(toFile);
    const commonLen = commonPrefixLength(fromFolder, toFolder);
    const skippedLevels = toFolder.length - commonLen - 1;
    if (skippedLevels < minSkippedLevels.value) continue;
    // OLA O, N3, punto (1): de esos niveles de RUTA, cuántos son capas REALES.
    const realLayers = countRealLayersCrossed(populated, toFolder, commonLen);
    if (realLayers < minRealLayers.value) continue;

    const sameTreeTopDown = fromFolder.length === commonLen;
    const key = pairKey(fromFile, toFile);
    let acc = pairs.get(key);
    if (!acc) {
      const moduleBoundary = toFolder.slice(0, commonLen + 1).join("/") || "(raíz)";
      acc = {
        fromFile,
        toFile,
        skippedLevels,
        realLayers,
        sameTreeTopDown,
        commonAncestorDepth: commonLen,
        targetDepth: toFolder.length,
        moduleBoundary,
        edgeCount: 0,
        targetSymbols: new Set(),
      };
      pairs.set(key, acc);
    }
    acc.edgeCount += edge.weight;
    const label = symbolLabel(toNode);
    if (label) acc.targetSymbols.add(label);
  }

  // OLA O, N3, punto (2): la unidad del hallazgo es (archivo que importa, módulo importado).
  const fileModules = new Map<string, FileModuleAccumulator>();
  for (const p of pairs.values()) {
    const key = fileModuleKey(p.fromFile, p.moduleBoundary);
    let fm = fileModules.get(key);
    if (!fm) {
      fm = { fromFile: p.fromFile, moduleBoundary: p.moduleBoundary, pairs: [], targetFiles: new Set() };
      fileModules.set(key, fm);
    }
    fm.pairs.push(p);
    fm.targetFiles.add(p.toFile);
  }

  const sortedKeys = [...fileModules.keys()].sort((a, b) => {
    const ra = representativeOf(fileModules.get(a)!.pairs);
    const rb = representativeOf(fileModules.get(b)!.pairs);
    return rb.skippedLevels - ra.skippedLevels || a.localeCompare(b);
  });

  // RAÍZ 3 — "el paquete no es una capa" (ver el docstring del módulo). Misma pasada O(E) que
  // `layer-skip.ts`: mide qué tan ampliamente se importa cada archivo DESTINO en TODO el grafo,
  // no sólo desde el par bajo análisis. Sólo aristas `imports` cuentan como evidencia de fan-in
  // acá — mismo criterio "ÚNICA arista considerada" que ya aplica el resto de esta función.
  const fanInByFile = computeTopAncestorFanIn(confidentEdges(graph), nodeById, (e) => e.kind === "imports");

  const findings: RawFinding[] = [];
  for (const key of sortedKeys) {
    const fm = fileModules.get(key)!;
    const p = representativeOf(fm.pairs);
    const targetList = [...p.targetSymbols].sort();
    const symbolsText =
      targetList.length === 0
        ? "el archivo"
        : targetList.length === 1
          ? `"${targetList[0]}"`
          : `${targetList.length} símbolos (p.ej. "${targetList[0]}")`;
    const fanInCount = topAncestorFanInCount(fanInByFile, p.toFile);
    const wideFanIn = isWideFanIn(fanInCount);
    const targetExamples = [p.toFile, ...[...fm.targetFiles].sort().filter((f) => f !== p.toFile)].slice(0, MAX_TARGET_EXAMPLES);
    const edgeTotal = fm.pairs.reduce((sum, x) => sum + x.edgeCount, 0);
    const importadoText =
      fm.targetFiles.size === 1
        ? `${symbolsText} desde ${p.realLayers} capa(s) dentro de "${p.moduleBoundary}"`
        : `${fm.targetFiles.size} archivos internos de "${p.moduleBoundary}" (hasta ${p.realLayers} capa(s) adentro, p.ej. ${symbolsText})`;

    findings.push({
      title: `"${p.fromFile}" importa ${importadoText}`,
      detail:
        `"${p.fromFile}" declara ${fm.targetFiles.size === 1 ? "un import que nombra" : `${fm.targetFiles.size} imports que nombran`} ` +
        `directamente el interior de "${p.moduleBoundary}", atravesando ${p.realLayers} carpeta(s) que SÍ ` +
        `contienen archivos del módulo (de ${p.skippedLevels} nivel(es) de ruta: el resto son segmentos de ` +
        "namespace, sin archivos propios, que no son capas) — no importa la entrada del módulo, importa su " +
        "estructura interna. Cada reorganización interna de ese módulo (mover, renombrar o dividir sus " +
        "subcarpetas pobladas) puede romper a este importador, que no debería conocer esa estructura en " +
        'absoluto. Ningún lenguaje soportado distingue acá un submódulo deliberadamente público de uno interno: si "' +
        p.moduleBoundary +
        '" expone este camino a propósito como parte de su API (namespace público, no convención de archivo), ' +
        "esto es ruido, no un problema." +
        (p.sameTreeTopDown
          ? " Este par vive en el mismo árbol (el importador está justo en el punto de divergencia, mirando " +
            "hacia su propio subárbol): compatible con un archivo fachada/barril que reexporta a propósito sus " +
            "propios internos para aplanar su API pública — verificá esa intención antes de tratarlo como un " +
            "problema."
          : " Los dos archivos no comparten ninguna relación de contención directa (viven en ramas distintas): " +
            "menos compatible con una fachada del propio módulo profundo y más con un acoplamiento directo a " +
            "un detalle de implementación ajeno.") +
        (wideFanIn
          ? ` Confianza reducida: "${p.toFile}" también se importa desde otras ${fanInCount - 1} raíz(ces) de ` +
            "carpeta de nivel superior distintas de ésta, en cualquier otro punto del repositorio — importado " +
            "tan ampliamente se comporta como superficie pública de facto de su propio módulo, sin importar " +
            "cuántos niveles de carpeta lo separan del punto de divergencia de ESTE importador puntual."
          : ""),
      trigger: [
        { label: "niveles de carpeta salteados por el import", value: p.skippedLevels, threshold: minSkippedLevels },
        { label: "capas reales salteadas (carpetas con archivos propios)", value: p.realLayers, threshold: minRealLayers },
      ],
      evidence: [
        { label: "aristas 'imports' colapsadas hacia este módulo", value: edgeTotal },
        { label: "archivos internos del módulo importados directamente", value: fm.targetFiles.size },
        { label: "profundidad de carpeta del archivo importado", value: p.targetDepth },
        { label: "profundidad del ancestro común de carpetas", value: p.commonAncestorDepth },
        { label: "raíces de carpeta de nivel superior distintas que también importan este archivo", value: fanInCount },
      ],
      locations: [
        {
          file: p.fromFile,
          startLine: 1,
          endLine: Math.max(1, linesByFile.get(p.fromFile) ?? 1),
          role: "archivo que importa por debajo de la superficie del módulo importado",
        },
        ...targetExamples.map((file) => ({
          file,
          startLine: 1,
          endLine: Math.max(1, linesByFile.get(file) ?? 1),
          ...(file === p.toFile && targetList[0] !== undefined ? { symbol: targetList[0] } : {}),
          role: "archivo interno de otro módulo, importado directamente",
        })),
      ],
      severity: severityOf(p.skippedLevels, p.sameTreeTopDown, wideFanIn),
      advice: {
        primary: {
          name: "Import from the module's public entry point",
          kind: "refactorizacion",
          why:
            "Enrutar el import a través de la superficie declarada del módulo (en vez de directo a su interior) " +
            "permite reorganizar los internos de ese módulo sin tener que auditar a todo el que lo importa desde " +
            "afuera.",
          source: "https://refactoring.guru/es/smells/inappropriate-intimacy",
        },
      },
    });
  }

  return findings;
}

export const detector: InterFileDetector<ThresholdKey, "import-depth-demeter"> = {
  id: "import-depth-demeter",
  kind: "import-depth-demeter",
  scope: "inter-file",
  needsGraph: true,
  title: "Demeter por profundidad de import",
  // BUG ARREGLADO — ver "LÍMITES POR LENGUAJE / OJO CON RUBY" en el
  // docstring del módulo: `needs: ["imports"]` era un gate por CAPACIDAD
  // (grammar-node) que Ruby nunca satisface, pero el extractor real
  // (`graph/edges/imports.ts`, A7/Ola 11b) reconoce `require`/
  // `require_relative` por FORMA de llamada y SÍ produce aristas `imports`
  // para Ruby (medido: 22 pares candidatos reales en rubocop). Con este
  // `needs` puesto, esos 22 nunca llegaban a `run()` — el repo entero
  // reportaba `no-aplicable` sin mirar el grafo. `needsEdges: ["imports"]`
  // (abajo, sin tocar) ya es el chequeo correcto y suficiente: presencia
  // REAL de la arista en esta corrida, la misma señal que decide si el
  // extractor corre.
  needs: [],
  /**
   * OLA 11b, frente B1 — LAS CELDAS MUDAS. `needsEdges` existe en
   * `InterFileDetector` desde DIAGNÓSTICO-5B §5 y `run.ts#runInterFile` lo
   * implementa (reporta `sin-aristas` con la lista de kinds faltantes y NO
   * llama a `run()`), pero hasta esta ola NINGÚN detector lo declaraba —
   * mecanismo construido, cero consumidores.
   *
   * Acá es exacto, no una aproximación: la única lectura de aristas de este
   * archivo es `if (edge.kind !== "imports") continue` (ver el comentario
   * "ÚNICA arista considerada"), así que sin una sola arista `imports` este
   * `run()` no puede producir nada — y lo que reportaba era `corrio, 0
   * hallazgos`, indistinguible de "no hay imports profundos que reportar".
   * Es literalmente el caso que el docstring de este módulo describe arriba
   * como "apagón total y estructural de esta arista completa".
   *
   * Medido (Ola 11b, `tests/fixtures/patterns`, sin corpus en disco): el
   * censo del grafo de esa fixture no trae NINGUNA arista `imports`, así que
   * las 6 celdas `(import-depth-demeter, lenguaje)` pasan de `corrio`+0
   * —celda muda sin razón— a `sin-aristas` con `missingEdgeKinds:
   * ["imports"]`: una razón declarada Y verificable por máquina, no un texto
   * libre.
   */
  needsEdges: ["imports"],
  thresholds: {
    minSkippedLevels: MIN_SKIPPED_LEVELS_SPEC,
    minRealLayers: MIN_REAL_LAYERS_SPEC,
  },
  maxFindings: MAX_FINDINGS_SPEC,
  run(repo: RepoUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const graph = repo.graph;
    // Defensivo: `run.ts#runInterFile` ya filtra `needsGraph && graph === null`
    // ANTES de llamar a `run()` (reporta `sin-grafo`) — este `return []` nunca
    // debería ejecutarse en producción, pero `CodeGraph | null` sigue siendo
    // el tipo declarado.
    if (!graph) return [];
    return buildImportDepthDemeterFindings(repo.files, graph, ctx.threshold("minSkippedLevels"), ctx.threshold("minRealLayers"));
  },
};
