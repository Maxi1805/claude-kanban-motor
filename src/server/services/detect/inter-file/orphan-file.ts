/**
 * `orphan-file` — archivo sin ninguna arista (PLAN.md K3: uno de los "3
 * hallazgos inter-archivo baratos" que no dependen de la resolución fina de
 * símbolos: ciclos, archivo huérfano, símbolo sin uso).
 *
 * RELACIÓN (sin jerga de AST): un archivo cuyo nodo, y cuyos símbolos, no
 * participan de NINGUNA arista de código (`references`/`extends`/
 * `implements`/`mixes-in`/`instantiates`/`imports`/`satisfies` — todas menos
 * `contains`, que es la jerarquía de carpetas y no una relación de código,
 * mismo criterio "todas menos `contains`" que ya documenta la métrica
 * hermana `graph/metrics/componentes.ts#connected-components`) que cruce
 * hacia OTRO archivo del repo. Nadie lo referencia y él no referencia a
 * nadie fuera de sí mismo. Es el hallazgo más barato del catálogo: sale
 * directo de `RepoUnit.graph`, sin volver a mirar ningún AST
 * (`needsGraph: true`, `needs: []` — no depende de ninguna capacidad de
 * lenguaje, opera sobre la forma del grafo, no sobre la gramática).
 *
 * Implementación INDEPENDIENTE de `graph/metrics/componentes.ts` (mismo
 * motivo que ya documenta el detector hermano `dependency-cycle.ts`: ese
 * módulo está pensado para un panel interactivo con proyección cacheada por
 * `topologyHash` y presupuesto de tiempo, una superficie que
 * `detect/types.ts` no expone). El propio docstring de `componentes.ts` ya
 * anticipa este hallazgo ("nodo cuyo único miembro de componente es él
 * mismo") — la definición coincide a propósito, el código no se comparte.
 *
 * REFERENCIAS INTRA-ARCHIVO NO CUENTAN COMO CONEXIÓN: si un símbolo de este
 * archivo referencia a OTRO símbolo del MISMO archivo, eso no lo saca de la
 * candidatura — si contara, un archivo con una sola función que se llama a
 * sí misma (o dos funciones que se llaman entre ellas) dejaría de ser
 * "huérfano" sin que ni un solo archivo del resto del repo lo use jamás.
 * Mismo criterio, declarado independientemente, que usa `projectGraph`
 * (`graph/metrics/projection.ts`) al descartar la auto-arista que resulta de
 * colapsar los dos extremos al mismo archivo.
 *
 * CON QUÉ SE CONFUNDE (patrón legítimo, no un smell) — verificado a mano
 * contra el corpus externo (ver el resultado de la tarea para el detalle
 * completo de la verificación):
 *   - PUNTOS DE ENTRADA Y SCRIPTS STANDALONE: un ejemplo ejecutable
 *     (`examples/colors/colors.py` en `click`) sólo importa un paquete
 *     externo y nadie del repo lo importa a él — cero aristas, cero smell.
 *   - ARCHIVOS DE CONFIGURACIÓN CARGADOS POR CONVENCIÓN DE NOMBRE: la
 *     herramienta que los usa (Sphinx, Playwright, un bundler) los descubre
 *     por su nombre de archivo fijo, nunca por una referencia de código
 *     (`docs/conf.py` en `click`, `playwright.config.js` en `lodash`).
 *   - CÓDIGO GENERADO, MIGRACIONES, Y TODO LO QUE UN FRAMEWORK CARGA POR
 *     CONVENCIÓN DE RUTA/NOMBRE en vez de por referencia explícita — Rails
 *     con Zeitwerk es el caso extremo: ninguna clase se `require`ía nunca,
 *     el autoloader la encuentra por su nombre de archivo.
 *   - BRECHA DE RESOLUCIÓN DEL GRAFO (no de este detector): un módulo que
 *     exporta un valor ANÓNIMO (`module.exports = {}`, sin un nombre
 *     declarado) puede ser importado por otro archivo (`require(...)`) sin
 *     que la cascada tenga ningún símbolo NOMBRADO al que atar esa
 *     referencia — verificado a mano: `lodash/fp/placeholder.js` SÍ se
 *     `require`a desde `_baseConvert.js` y aun así aparece con cero aristas.
 *     Un barril que reexporta con comodín (`export * from './x'`, visto en
 *     `vueuse/packages/math/index.ts`) tiene el mismo problema: no hay un
 *     nombre de símbolo puntual que resolver.
 *
 * ESTE PÁRRAFO ESTABA EQUIVOCADO Y SE CORRIGIÓ (frente A2a, ola N). Decía:
 * "NINGUNA de estas formas deja rastro estructural distinguible de código
 * realmente muerto usando sólo `RepoUnit` (…). No hay forma honesta de
 * resolverlo sin una lista de nombres de archivo/framework (…) así que este
 * detector NO la intenta". Las dos mitades resultaron falsas, y medirlas fue
 * todo lo que hizo falta:
 *
 *   1. **Las dos primeras formas de la lista de arriba (barril de re-export y
 *      módulo cargado con una llamada de import anidada) SÍ dejaban rastro
 *      estructural — el rastro simplemente no se estaba extrayendo.** Medido
 *      por sonda directa sobre las gramáticas reales: `export * from "./x"`
 *      daba CERO aristas `imports` en las cuatro gramáticas ECMA (el nodo
 *      `export_statement` expone el mismo campo `source` que un import, pero
 *      el filtro de entrada del extractor sólo miraba tipos de nodo con el
 *      segmento `import`/`require`/`using`), y un `require` dentro de una
 *      lambda tampoco, porque el extractor sólo miraba hijos directos de la
 *      raíz. Arreglado en `graph/edges/imports.ts` — ver sus dos bloques
 *      "ARREGLADO (frente A2a)". Medido en nest con `analyzeRepo` y
 *      `maxFindings: "unlimited"`: **107 → 61 hallazgos, cero hallazgos
 *      nuevos**, y los 46 que desaparecieron son exactamente los barriles y
 *      lo que colgaba de ellos.
 *   2. **Para la carga por convención sí hay un criterio estructural que no
 *      nombra ninguna herramienta**, y no está en el nombre del archivo sino
 *      en lo que el archivo DECLARA: un archivo que no declara nada nombrable
 *      no tiene nada que pueda estar muerto. Ver
 *      `filesDeclaringNameableSymbols` abajo, con la medición archivo por
 *      archivo. En nest: **61 → 22**.
 *
 * Lo que SIGUE siendo cierto del párrafo viejo: la carga por convención de
 * ruta/nombre es invisible para un grafo de código, y el criterio nuevo la
 * cubre sólo cuando el archivo cargado así además no declara nada (que es el
 * caso de la documentación de paquete, de la tarea descubierta por extensión
 * y del archivo de configuración de nivel superior — medido — pero no el de
 * una clase que un autocargador encuentra por su nombre de archivo). Por eso
 * la severidad sigue siendo CONSTANTE (no derivada de una magnitud) y el
 * `detail` de cada hallazgo sigue diciendo explícitamente qué dos formas de
 * uso hay que descartar a mano antes de borrar nada.
 *
 * OJO CON JAVA / guava — MEDIDO, no supuesto: la etapa `path-proximity`
 * (heurística, `provenance: "inferred"`) acepta el 81% de las aristas
 * `references` aceptadas en guava (Ola 3, brecha ya declarada) — RE-MEDIDO
 * por el frente "lenguaje cableado a mano" (agosto 2026) con el grafo de
 * Ola K (`imports` de Java 15→5.632 en el medio): bajó a **51,7%** (28.417
 * `inferred` de 54.932 aristas `references` aceptadas,
 * `scratchpad/lang-hardcode-frente/measure-refs-provenance.mts corpus/guava
 * java`) — mejoró, pero sigue siendo una MAYORÍA, y sigue siendo específico
 * de Java: el mismo script sobre `corpus/click` (Python) da apenas 1,0% (9
 * de 865). La brecha estructural entre Java y un lenguaje que resuelve
 * mayormente por regla sigue vigente, sólo que menos extrema que en Ola 3.
 * El dataset etiquetado a mano que valida la cascada es sólo Ruby. Este
 * detector cuenta CUALQUIER `provenance` como "conectado" — la lectura MÁS
 * GENEROSA posible, mismo criterio que ya elige el detector hermano
 * `unused-symbol.ts` para el mismo riesgo, y a propósito DISTINTO del que
 * elige `dependency-cycle.ts` (que excluye `inferred` por completo): acá el
 * riesgo corre al revés que en un ciclo. Un ciclo usa una arista `inferred`
 * como EVIDENCIA POSITIVA del hallazgo (excluirla es lo conservador); acá
 * una arista `inferred` sólo puede sacar a un archivo de la lista de
 * huérfanos, nunca meterlo — así que contarla es la lectura conservadora
 * para ESTE detector, no lo contrario. La prueba está en el propio corpus
 * (Ola 3, cifra de conectividad NO re-verificada por este frente — a
 * diferencia del % de `inferred` de arriba, que sí se re-midió y bajó):
 * repetir el cálculo EXCLUYENDO `inferred` subía los huérfanos de guava de
 * 91 a 344 (17% de sus 1.977 archivos) mientras que en los otros 7 repos el
 * cambio era marginal (+1 a +5) — la dependencia de `path-proximity` es un
 * fenómeno específico de guava/Java, no del detector (aunque, dado que el %
 * de `inferred` bajó de 81 a 51,7 desde Ola 3, es esperable que esta cifra
 * de conectividad también haya bajado con ella — no re-derivada acá, no
 * hace falta para la decisión de este módulo, ver el párrafo siguiente). El
 * riesgo real, entonces, no es que este detector reporte de más en Java: es
 * que pueda reportar de MENOS con confianza indebida, si `path-proximity`
 * conecta espuriamente un archivo que en realidad está muerto (falso
 * negativo, no falso positivo) — o que calle un huérfano real porque la
 * cascada falló en encontrar una conexión que sí existía (falso
 * positivo por sub-cobertura de la resolución, no de esta lógica).
 *
 * OJO CON JAVA / guava, LA COMPENSACIÓN SE RETIRÓ — frente "lenguaje
 * cableado a mano" (agosto 2026), MEDIDO: este detector tenía
 * `severity = language === "java" ? 20 : 35`, una reducción CONSTANTE que
 * el párrafo anterior ya contradice en su propia lógica — el riesgo que
 * describe corre hacia MENOS hallazgos de Java (falsos negativos por
 * sobre-conexión), no hacia MÁS (falsos positivos); bajar la severidad de
 * los hallazgos de Java que la cascada SÍ logra emitir no corrige ese
 * riesgo. Medido en guava, con el grafo de Ola K, `analyzeRepo` por defecto
 * (cap real de 200 grupos que aplica `code-analyzer.ts` sobre la salida
 * final — `crossAnalyze`/`grouping.ts`, ordenado por `score`, no
 * `"unlimited"`): con la reducción (severidad 20), de 91 archivos huérfanos
 * de Java sólo **6** sobreviven al corte; SIN ella (severidad 35 constante,
 * este cambio, misma corrida), **también 6** — el número no se mueve. La
 * reducción de severidad no lograba ni siquiera el efecto de visibilidad
 * que se le atribuía: en guava el corte de 200 grupos lo dominan hallazgos
 * de otros detectores muy por encima de 35, así que 15 puntos de severidad
 * no cambian qué sobrevive. Es una compensación que no hacía nada medible
 * en ninguna dirección — ni ayudaba al riesgo real (recall) ni cambiaba el
 * volumen final — y que, además, la evidencia de precisión juzgada a mano
 * (`tests/golden/precision/*.verdicts.csv`) tampoco sostiene: de los 16
 * hallazgos de `orphan-file` juzgados en TODO el corpus (7 lenguajes —
 * csharp, go, javascript, ruby, typescript, python, java, 2-3 casos cada
 * uno), los 16 son falsos, y la causa es la MISMA en los siete:
 * "idioma-framework" — un archivo cargado por convención de nombre/ruta que
 * ningún grafo de código puede ver (`package-info.java` en Java, `doc.go`
 * en Go, `docs/conf.py` en Python, `playwright.config.js`/
 * `eslint.config.mjs` en JS, `tasks/*.rake` en Ruby), más un resto de
 * "no-es-el-fenómeno" por brechas de resolución de herencia en C#/TS. Java
 * no tiene una tasa de falsos positivos más alta que el resto: tiene la
 * MISMA, por la MISMA razón universal, que ningún ajuste de severidad por
 * lenguaje puede arreglar (es una brecha estructural del detector —
 * "convención de carga" es invisible en `RepoUnit.graph` para cualquier
 * lenguaje — no algo peor en Java). Por eso la severidad quedó constante
 * (35) para todo archivo, sin excepción, y `detail` dejó de llevar una
 * frase condicionada por `language`.
 *
 * ARCHIVO ESPEJO — JUICIO DE PRECISIÓN NUEVO (frente P9, Ola P), el mismo
 * mecanismo que `feature-envy-inter.ts#isMirrorFile` (ver su docstring para
 * la derivación completa de los dos pisos): dos archivos DISTINTOS que
 * declaran, cada uno, casi el mismo conjunto de nombres calificados
 * (`symbolPath.join(".")`) son variantes/copias del MISMO tipo, no dos
 * archivos independientes. Caso real, verificado leyendo el código antes de
 * escribir esto: `hugo`'s `common/hugo/vars_regular.go`
 * (`//go:build !extended`) y `vars_extended.go` (`//go:build extended`)
 * declaran, cada uno, la MISMA `var IsExtended` — el analizador (que no
 * entiende build tags de Go) parsea las dos variantes como si coexistieran
 * siempre, así que cualquier uso real de `IsExtended` resuelve a UNA sola de
 * las dos declaraciones y deja a la otra sin un solo consumidor — no porque
 * esté muerta, sino porque tiene un gemelo de nombre idéntico que se está
 * llevando la conexión. Juzgado falso a mano dos olas seguidas
 * (`tests/golden/precision/hugo.verdicts.csv`, nota "no-es-el-fenómeno...
 * misma limitación de build tags de Go"). El mismo mecanismo, más grande,
 * es la causa de un BUG ANÁLOGO en el detector hermano
 * `feature-envy-inter.ts` (el par `AbstractFutureState.java` de `guava`,
 * duplicado en `android/guava/` y `guava/`) — los dos detectores comparten
 * la solución porque comparten la causa: una colisión de nombre entre dos
 * archivos que nunca deberían verse el uno al otro, no un defecto propio de
 * ninguno de los dos criterios.
 */
import { pisoDeclarado, presencia, presupuesto } from "../thresholds.js";
import type { Threshold } from "../thresholds.js";
import type { CodeGraph } from "../../graph/types.js";
import { repoNameIndex, type RepoNameIndex } from "./repo-name-index.js";
import type {
  FileSummary,
  InterFileDetector,
  RawFinding,
  RepoUnit,
  RunContext,
} from "../types.js";
type ThresholdKey = "presence" | "mirrorRatioMin" | "mirrorRatioMax";

/**
 * Presencia, no magnitud: un archivo tiene cero aristas de código o no las
 * tiene, no hay "cuántas es demasiado poco" que umbralizar — mismo patrón
 * que `empty-catch.ts`/`unused-symbol.ts`.
 */
const PRESENCE_SPEC = presencia({
  rationale:
    "un archivo sin ninguna arista hacia/desde el resto del repo ya es el hallazgo completo: no hay una magnitud que umbralizar, es presencia/ausencia.",
});

/** CONTRATO-F4.md §1.8: tope de VOLUMEN propio, no de detección. Medido en
 *  el corpus (ver el resultado de la tarea): el máximo es 91 (guava); un
 *  repo real más grande puede superarlo con facilidad. */
const MAX_FINDINGS_SPEC = presupuesto(150, {
  rationale:
    "un panel legible no lista de forma útil más de un par de cientos de archivos huérfanos a la vez; es tope de volumen, no de detección.",
});

/** Ver "ARCHIVO ESPEJO" en el docstring del módulo — mismos dos pisos, misma derivación, que `feature-envy-inter.ts#MIRROR_RATIO_MIN_SPEC`. */
const MIRROR_RATIO_MIN_SPEC = pisoDeclarado(0.5, {
  rationale:
    "intersección / el más chico de los dos conjuntos de nombres calificados declarados — mismo piso y misma " +
    "calibración que `feature-envy-inter.ts#MIRROR_RATIO_MIN_SPEC` (medido en guava 0,96 y hugo 1,0).",
});
const MIRROR_RATIO_MAX_SPEC = pisoDeclarado(0.3, {
  rationale:
    "intersección / el más grande de los dos conjuntos — mismo piso que `feature-envy-inter.ts#MIRROR_RATIO_MAX_SPEC`, " +
    "para que dos archivos grandes y no relacionados que comparten un puñado de nombres comunes no pasen el piso de arriba.",
});

/**
 * Todo id de nodo del grafo -> el archivo al que pertenece (`file`/`symbol`
 * comparten el campo `.file`; `folder` nunca es extremo de una arista que no
 * sea `contains`, así que no hace falta excluirlo a mano).
 */
function fileOfNode(graph: CodeGraph): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const n of graph.nodes) map.set(n.id, n.file);
  return map;
}

/**
 * Conjunto de archivos que participan de AL MENOS una arista de código (todo
 * kind salvo `contains`, **CUALQUIER `provenance`, incluida `ambiguous`** —
 * ver "OJO CON JAVA" en el docstring del módulo para `inferred`. Una sola
 * pasada por `graph.edges`, O(E): barato incluso en guava (~58k aristas).
 *
 * `ambiguous` SÍ CUENTA — OLA R, FRENTE R4, cambio de esta tarea. Hasta acá
 * este archivo llamaba a `confidentEdges` (que excluye `ambiguous`,
 * CONTRATO-F9.md §4.5: "fuera de toda consulta por defecto"), la regla
 * correcta para un detector que usa una arista como evidencia POSITIVA de un
 * hallazgo. Este detector hace lo contrario: su hallazgo es una afirmación de
 * AUSENCIA ("nadie referencia a este archivo"), y para esa afirmación una
 * arista `ambiguous` — "sabemos que hay relación, no sabemos con cuál de
 * estos destinos" — sigue siendo evidencia de que ALGO real del repo
 * referencia ALGO de este archivo; el propio párrafo de arriba ya aplica el
 * mismo razonamiento para incluir `inferred` a propósito ("la lectura MÁS
 * GENEROSA posible"). Tratar `ambiguous` como si no existiera es exactamente
 * el mismo error, sólo que con una categoría de incertidumbre distinta.
 *
 * MEDIDO (ola-q, integrador, §7.1, reproducido por este frente antes de
 * escribir el código): 43 de 64 hallazgos del corpus (67 %) son "arista
 * ambigua escondida" — verificado con `hugo/bufferpool`: 37 aristas `calls`
 * ambiguas desde 15 archivos, con llamador real confirmado por `grep` en la
 * fuente. Y una segunda evidencia independiente: +24 archivos de
 * `tests/fixtures/patterns` pasaron a "huérfanos" en la ola pasada por este
 * mismo mecanismo (el cambio de procedencia de F1 movió 1.360 aristas
 * `satisfies` a `ambiguous`, y este detector las trataba como si no
 * existieran).
 *
 * MONÓTONO: este cambio sólo puede SACAR archivos de la lista de huérfanos
 * (nunca puede convertir un archivo YA conectado en huérfano), así que no
 * puede introducir un falso positivo nuevo — sólo puede corregir uno
 * existente. 0 verdaderos juzgados en `orphan-file` en todo el corpus
 * (`tests/golden/precision/*.verdicts.csv`, 371 filas, 0 "verdadero") ⇒
 * riesgo de recall CERO, medido antes de tocar el código.
 */
function computeCrossFileConnectedFiles(graph: CodeGraph): ReadonlySet<string> {
  const fileOf = fileOfNode(graph);
  const connected = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.kind === "contains") continue;
    const fromFile = fileOf.get(edge.from);
    const toFile = fileOf.get(edge.to);
    if (fromFile === undefined || toFile === undefined) continue;
    if (fromFile === toFile) continue; // intra-archivo: no conecta con el resto del repo, ver docstring
    connected.add(fromFile);
    connected.add(toFile);
  }
  return connected;
}

/**
 * ¿Este nombre de símbolo se puede ESCRIBIR en otro archivo para referirse a
 * él? Prueba de FORMA sobre el texto del nombre, no una lista de lenguajes:
 * un nombre con espacios, llaves, corchetes o comas no es algo que ninguna
 * gramática permita nombrar en una referencia — es lo que
 * `graph/symbols.ts` deja cuando el "declarante" es un patrón de
 * DESESTRUCTURACIÓN (`const { devices } = require(...)` produce un símbolo
 * literalmente llamado `"{ devices }"`, verificado por sonda directa contra
 * `corpus/lodash/playwright.config.js`). Un método de Ruby que termina en
 * `?`/`!`, o un tipo genérico `Lista<T>`, SÍ son nombrables y no se filtran:
 * la prueba mira sólo los caracteres que ninguna referencia puede llevar.
 */
const NOT_NAMEABLE = /[\s{}[\],]/;

/** Cuántos nombres declarados se citan en el `detail` — evidencia, no inventario. */
const NAMES_IN_DETAIL = 3;

/**
 * Los archivos que declaran AL MENOS UN símbolo nombrable desde otro archivo.
 *
 * RAÍZ 2 DEL FRENTE A2 (ola N) — "se entra por convención, no por
 * referencia". De los 31 hallazgos de `orphan-file` juzgados a mano en el
 * corpus, TODOS falsos, la familia más grande después de las brechas de
 * resolución es la del archivo que ningún grafo de código puede ver porque
 * el ecosistema lo carga por su RUTA o su NOMBRE: documentación de paquete
 * (`doc.go`, `package-info.java`), una tarea que un corredor de tareas
 * descubre por su extensión, un archivo de configuración que una herramienta
 * abre por su nombre fijo, una plantilla que se pide por una cadena armada
 * en tiempo de ejecución.
 *
 * La tentación es una lista de nombres de archivo — y es exactamente la
 * lista de vocabulario de dominio que la regla de genericidad prohíbe, y que
 * el docstring de este módulo ya declaraba imposible de evitar. **Sí hay un
 * criterio estructural honesto, y no es el nombre: es qué DECLARA el
 * archivo.** Un archivo que no declara ni una sola cosa nombrable no tiene
 * nada que pueda estar muerto. No hay función, clase, constante ni tipo que
 * borrar; no hay ningún consumidor posible al que le pudiera faltar. La
 * señal "nadie lo referencia" es VACÍA ahí: nadie podría referenciarlo
 * aunque quisiera, porque no hay a qué apuntar. El hallazgo sólo tiene
 * sentido cuando existe una declaración que alguien podría estar usando y
 * no usa.
 *
 * MEDIDO (`scratchpad/a2a/probe-symbols.mts`, `graph/symbols.ts` real sobre
 * los archivos reales del corpus, ANTES de escribir esto): `doc.go` y
 * `docs.go` de hugo → 0 símbolos; `package-info.java` de guava → 0;
 * `tasks/codespell.rake` de rubocop → 0; `messages/whitespace-found.js` de
 * eslint → 0; `playwright.config.js` de lodash → 1 símbolo NO nombrable
 * (`"{ devices }"`); los 38 archivos de configuración de nest → 0; y, del
 * otro lado, los archivos que sí son candidatos legítimos siguen teniendo
 * declaraciones (`test.dto.ts` → `TestDto`, `logging.plugin.ts` → 3).
 * O sea: el criterio parte la población exactamente por donde hay que
 * partirla, sin nombrar una sola herramienta.
 *
 * ESTO NO ESCONDE EL DETECTOR: no baja un umbral ni mueve nada a un nivel de
 * confianza que no se muestra. Saca de la población una clase de archivo
 * sobre la que este detector no tiene nada que decir, y deja intacta —
 * completa, con la misma severidad — la clase sobre la que sí lo tiene.
 * Medido en nest (`analyzeRepo`, `maxFindings: "unlimited"`): 107 → 61 con
 * el arreglo del grafo de este mismo frente, y 61 → 22 con este criterio;
 * los 22 que quedan son clases declaradas y jamás importadas — el fenómeno.
 */
function filesDeclaringNameableSymbols(
  graph: CodeGraph,
): ReadonlyMap<string, readonly string[]> {
  const declaring = new Map<string, string[]>();
  for (const n of graph.nodes) {
    if (n.kind !== "symbol") continue;
    // CUALQUIER profundidad de `symbolPath`, no sólo la raíz del archivo — y
    // no es un descuido: en los lenguajes que envuelven sus declaraciones en
    // un bloque de espacio de nombres, la clase de nivel superior del archivo
    // ya llega acá con `symbolPath.length === 2` (contenedor + clase). Exigir
    // profundidad 1 apagaría este detector entero para esos lenguajes — el
    // outlier por lenguaje que este proyecto no acepta.
    const name = n.symbolPath[n.symbolPath.length - 1];
    if (name === undefined || name === "" || NOT_NAMEABLE.test(name)) continue;
    const list = declaring.get(n.file);
    if (list) list.push(name);
    else declaring.set(n.file, [name]);
  }
  return declaring;
}

/**
 * Ver "ARCHIVO ESPEJO" en el docstring del módulo. Por archivo, el conjunto
 * de nombres CALIFICADOS (`symbolPath.join(".")`, mismo criterio que
 * `symbolNodeId` en `graph/types.ts` y que
 * `feature-envy-inter.ts#qualifiedNamesByFile`) de sus símbolos propios —
 * TODOS, no sólo los nombrables (`NOT_NAMEABLE` filtra caracteres que
 * ninguna referencia puede escribir, pero un patrón de desestructuración
 * puede seguir siendo parte del mismo par espejo).
 *
 * BUG ENCONTRADO Y ARREGLADO POR EL GUARDIÁN (grupo detectores, Ola P):
 * `family === "namespace-like"` (`graph/symbols.ts`: "agrupación léxica, no
 * jerarquía duplicable", el mismo criterio que `graph/build.ts:439` ya usa
 * para NO tratarla como jerarquía) queda EXCLUIDO. Medido en
 * `newtonsoft-json`: cada archivo `.cs` declara un nodo `namespace-like` con
 * el MISMO `symbolPath` que todo archivo hermano del mismo namespace
 * (`Newtonsoft.Json.Linq` lo repiten decenas de archivos). Sin este
 * filtro, dos archivos de una sola clase chica CUALQUIERA que compartan
 * carpeta/namespace comparten ese nombre "gratis" y la proporción
 * (1 nombre compartido / 2-3 nombres propios) cruza el piso — colapsó
 * `orphan-file` en csharp 55→22 (−60 %) y el 100 % de los 33 casos
 * verificados a mano eran esto, no gemelos reales (`BsonType.cs`/
 * `BsonBinaryType.cs`: dos enums DISTINTOS del mismo namespace, no un par
 * espejo). Los gemelos genuinos (`android/guava-tests/…` vs
 * `guava-tests/…`, `IgnoreJRERequirement.java` repetido por paquete)
 * comparten el nombre de la CLASE, no sólo el namespace — no dependen de
 * este campo y siguen intactos tras el fix (medido, ver informe).
 */
function qualifiedNamesByFile(
  graph: CodeGraph,
): ReadonlyMap<string, ReadonlySet<string>> {
  const byFile = new Map<string, Set<string>>();
  for (const n of graph.nodes) {
    if (n.kind !== "symbol" || n.symbolPath.length === 0) continue;
    if (n.family === "namespace-like") continue;
    const name = n.symbolPath.join(".");
    let names = byFile.get(n.file);
    if (!names) {
      names = new Set();
      byFile.set(n.file, names);
    }
    names.add(name);
  }
  return byFile;
}

/**
 * ¿Existe OTRO archivo del repo cuyo conjunto de nombres calificados hace
 * "espejo" con el de `file` (ver "ARCHIVO ESPEJO" en el docstring del
 * módulo)? Indexado por nombre para no comparar `file` contra TODOS los
 * demás archivos del repo: sólo contra los que comparten al menos un nombre
 * — en un repo de miles de archivos, la inmensa mayoría no comparte ni uno.
 *
 * BUG ENCONTRADO Y ARREGLADO POR EL GUARDIÁN (grupo detectores, Ola P):
 * `other` queda restringido al MISMO `language` que `file`. Sin esto,
 * `tests/fixtures/patterns/` (la fixture incondicional de
 * `census-golden.test.ts`, corre siempre, sin corpus) rompía la compuerta
 * DETERMINÍSTICAMENTE: cada patrón trae la MISMA fixture reescrita a mano en
 * 4-6 lenguajes a propósito (`null_object/python.py` y `null_object/ruby.rb`
 * declaran, los dos, `ConsoleLogger`/`NullLogger`/`ReportOptions` con los
 * mismos métodos — es la fixture haciendo lo que se le pidió: mostrar el
 * MISMO caso en varios lenguajes). Ninguno de los dos importa al otro ni se
 * parece estructuralmente más allá de coincidir en el nombre que alguien
 * eligió a propósito para el ejemplo — el fenómeno real de "archivo espejo"
 * (comprobado en guava: `android/guava-tests/…` vs `guava-tests/…`,
 * `IgnoreJRERequirement.java` repetido por paquete, GWT super-source) es
 * SIEMPRE una copia dentro del MISMO lenguaje/build; un par entre lenguajes
 * distintos nunca es la duplicación estructural que esta relación describe.
 * Medido: con el filtro por lenguaje, los 32 casos reales de C#
 * (`orphan-file.ts` §4.3 del informe del guardián) y los de guava siguen
 * intactos (son pares mismo-lenguaje); las ~50 fixtures cross-lenguaje de
 * `tests/fixtures/patterns/` dejan de "espejarse" entre sí.
 */
function hasMirrorFile(
  file: string,
  ownNames: ReadonlySet<string>,
  namesByFile: ReadonlyMap<string, ReadonlySet<string>>,
  nameIndex: ReadonlyMap<string, ReadonlySet<string>>,
  languageByFile: ReadonlyMap<string, string>,
  ratioMin: number,
  ratioMax: number,
): boolean {
  const ownLanguage = languageByFile.get(file);
  const candidates = new Set<string>();
  for (const name of ownNames)
    for (const other of nameIndex.get(name) ?? [])
      if (other !== file) candidates.add(other);
  for (const other of candidates) {
    if (ownLanguage !== undefined && languageByFile.get(other) !== ownLanguage) continue;
    const otherNames = namesByFile.get(other);
    if (!otherNames || otherNames.size === 0) continue;
    const [small, big] =
      ownNames.size <= otherNames.size
        ? [ownNames, otherNames]
        : [otherNames, ownNames];
    let intersection = 0;
    for (const name of small) if (big.has(name)) intersection++;
    if (intersection === 0) continue;
    if (
      intersection / small.size >= ratioMin &&
      intersection / big.size >= ratioMax
    )
      return true;
  }
  return false;
}

/**
 * Único lugar que arma los `RawFinding[]` — separado de `detector.run` para
 * poder testearlo sin pasar por `RunContext`, mismo patrón que
 * `buildDuplicationFindings`/`findDependencyCycles` en los detectores
 * hermanos.
 */
export function buildOrphanFileFindings(
  files: readonly FileSummary[],
  graph: CodeGraph,
  presence: Threshold,
  mirrorRatioMin: Threshold,
  mirrorRatioMax: Threshold,
  /**
   * OLA AW · AW6 — EL ÍNDICE DE TEXTO DEL REPO. Ausente ⇒ las dos puertas
   * nuevas no se aplican y este detector se comporta EXACTAMENTE como antes
   * (es el caso de todo test que llama a esta función con cinco argumentos).
   * Ver `repo-name-index.ts` y las dos puertas más abajo.
   */
  textIndex?: RepoNameIndex,
): RawFinding[] {
  const connected = computeCrossFileConnectedFiles(graph);
  const declaring = filesDeclaringNameableSymbols(graph);
  const qualifiedNames = qualifiedNamesByFile(graph);
  const nameIndex = new Map<string, Set<string>>();
  for (const [ownerFile, names] of qualifiedNames) {
    for (const name of names) {
      let owners = nameIndex.get(name);
      if (!owners) {
        owners = new Set();
        nameIndex.set(name, owners);
      }
      owners.add(ownerFile);
    }
  }
  // Ver "BUG ENCONTRADO Y ARREGLADO POR EL GUARDIÁN" en el docstring de
  // `hasMirrorFile`: el "espejo" sólo cuenta dentro del MISMO lenguaje.
  const languageByFile = new Map(files.map((f) => [f.path, f.language]));
  const findings: RawFinding[] = [];

  for (const file of files) {
    if (connected.has(file.path)) continue;
    // RAÍZ 2 (ola N): sin una declaración nombrable no hay nada que pueda
    // estar muerto — ver `filesDeclaringNameableSymbols`.
    if (!declaring.has(file.path)) continue;
    // ARCHIVO ESPEJO: ver docstring del módulo — un gemelo de nombre
    // idéntico en otro archivo explica por qué éste no tiene consumidores
    // sin que sea código muerto.
    if (
      hasMirrorFile(
        file.path,
        qualifiedNames.get(file.path) ?? new Set(),
        qualifiedNames,
        nameIndex,
        languageByFile,
        mirrorRatioMin.value,
        mirrorRatioMax.value,
      )
    )
      continue;

    // Severidad CONSTANTE para todo lenguaje — ver "OJO CON JAVA / guava,
    // RETIRADA" en el docstring del módulo: la reducción por `language ===
    // "java"` que tenía este detector se retiró (frente "lenguaje cableado a
    // mano", agosto 2026), medida y no sólo argumentada.
    const severity = 35;

    // Las declaraciones que nadie usa son LA evidencia del hallazgo, no un
    // adorno: sin ellas el texto sólo puede decir "está desconectado", y el
    // lector no tiene con qué verificarlo. Con ellas puede buscar el nombre y
    // comprobar en un minuto que nadie lo escribe en ningún otro archivo.
    // ═════════════════════════════════════════════════════════════════════
    // OLA AW · AW6 — LAS DOS PUERTAS DE TEXTO, y por qué el propio `detail`
    // de este hallazgo las pedía a gritos desde que se escribió.
    //
    // El texto que este detector imprime dice, literal: «descartá las dos
    // formas de uso que ningún grafo de código puede ver: que algo lo cargue
    // por su RUTA o su NOMBRE». Eso era cierto de un GRAFO; no lo es del
    // ANALIZADOR, que puede leer los bytes. De los 53 falsos juzgados a mano,
    // la mayoría son exactamente esas dos formas y están ESCRITAS en el repo:
    //
    //   · POR RUTA — eslint carga sus reglas con un mapa perezoso
    //     (`"no-sync": () => require("./no-sync")`), jekyll con
    //     `Dir[...].each { require }` disparado desde `.rubocop.yml`,
    //     sqlalchemy invoca `python tools/warn_tox.py` desde `tox.ini`, hugo
    //     carga una fixture con `filepath.Glob("./testdata/resource.*")`,
    //     preact publica `compat/scheduler.js` en el `exports` de su
    //     `package.json`. En los cinco, el nombre del archivo está escrito.
    //   · POR NOMBRE — newtonsoft-json declara `class JsonTextWriter :
    //     JsonWriter` (herencia que la cascada de C# no resuelve),
    //     `ObjectConstructor<T>`/`MethodCall<T,TResult>` se usan como TIPO en
    //     más de diez archivos, nest re-exporta con `export * from
    //     './param.utils'`, chatwoot encola el job desde su `spec/`. En todos,
    //     el símbolo está escrito en otro archivo.
    //
    // Las dos puertas sólo APAGAN: nunca encienden un hallazgo que las cinco
    // reglas de arriba no hubieran producido igual.
    // ═════════════════════════════════════════════════════════════════════
    const declared = declaring.get(file.path) ?? [];
    if (textIndex && textIndex.filesRead > 0) {
      // PUERTA A — POR RUTA: el nombre del archivo (sin extensión) aparece
      // escrito, como segmento de ruta o como cadena suelta, en OTRO archivo.
      const base = file.path.slice(file.path.lastIndexOf("/") + 1);
      const dot = base.indexOf(".");
      const key = dot > 0 ? base.slice(0, dot) : base;
      if (key.length >= 2 && textIndex.pathMentioned(key, file.path)) continue;
      // PUERTA B — POR NOMBRE: alguna de las declaraciones de este archivo
      // aparece escrita en algún byte FUERA de él. `endLine` es el largo del
      // archivo: el tramo excluido es el archivo ENTERO, así que lo que se
      // pregunta es literalmente "¿este nombre está escrito en otro lado?".
      const propio = [{ file: file.path, startLine: 1, endLine: Math.max(1, file.lines) }];
      if (declared.some((n) => textIndex.usedOutside(n, propio))) continue;
    }
    const shown = declared
      .slice(0, NAMES_IN_DETAIL)
      .map((n) => `"${n}"`)
      .join(", ");
    const declaredList =
      declared.length > NAMES_IN_DETAIL
        ? `${shown} y ${declared.length - NAMES_IN_DETAIL} más`
        : shown;

    findings.push({
      title: `"${file.path}" declara ${declaredList} y nada en el repositorio lo usa`,
      detail:
        `Este archivo declara ${declaredList} y no tiene ninguna arista de código hacia ni desde el resto del ` +
        "repositorio: ningún otro archivo lo referencia, y él no referencia a ninguno. Verificalo buscando esos " +
        "nombres en el repo. Antes de borrarlo, descartá las dos formas de uso que ningún grafo de código puede " +
        "ver: que algo lo cargue por su RUTA o su NOMBRE en vez de por una referencia (un punto de entrada, un " +
        "descubrimiento por convención, una plantilla pedida con una cadena armada en ejecución), o que se use " +
        "desde fuera de este repositorio (una biblioteca publicada). Si no es ninguna de las dos, es código muerto.",
      trigger: [
        { label: "archivos sin ninguna arista", value: 1, threshold: presence },
      ],
      evidence: [
        { label: "líneas", value: file.lines },
        {
          label: "declaraciones sin ningún uso en el repo",
          value: declared.length,
        },
      ],
      locations: [
        {
          file: file.path,
          startLine: 1,
          endLine: Math.max(1, file.lines),
          role: "archivo sin conexión con el resto del repositorio",
        },
      ],
      severity,
      advice: {
        primary: {
          name: "Confirmar y eliminar (o integrar) el archivo",
          kind: "refactorizacion",
          why:
            "Un archivo sin ninguna conexión con el resto del repo es candidato a código muerto; si de verdad " +
            "hace falta conservarlo (punto de entrada, script, configuración, autoload), documentar " +
            "explícitamente por qué es más barato que dejarlo sin marcar.",
          source: "https://refactoring.guru/es/smells/dead-code",
        },
      },
    });
  }

  // PUERTA C — CONVENCIÓN DE CARPETA, el mismo hecho que la PUERTA 8 de
  // `unused-symbol` (ver el bloque largo allá, con la medición de `redmine`):
  // TRES o más archivos huérfanos en el MISMO directorio no son tres archivos
  // muertos, son un directorio que alguien carga recorriéndolo. Medido:
  // `redmine` pasa de 150 huérfanos (`db/migrate/` entero, `app/helpers/`
  // entero) a CERO, y ningún otro repo del corpus pierde una sola propuesta
  // — `nest` conserva sus tres entidades vacías (cada una sola en su
  // directorio) y `preact` su `types/weak-key.d.ts`.
  if (textIndex && textIndex.filesRead > 0) {
    const porDirectorio = new Map<string, number>();
    for (const f of findings) {
      const p = f.locations[0].file;
      const i = p.lastIndexOf("/");
      const d = i < 0 ? "" : p.slice(0, i);
      porDirectorio.set(d, (porDirectorio.get(d) ?? 0) + 1);
    }
    return findings.filter((f) => {
      const p = f.locations[0].file;
      const i = p.lastIndexOf("/");
      return (porDirectorio.get(i < 0 ? "" : p.slice(0, i)) ?? 0) < 3;
    });
  }

  return findings;
}

export const detector: InterFileDetector<ThresholdKey, "orphan-file"> = {
  id: "orphan-file",
  kind: "orphan-file",
  scope: "inter-file",
  needsGraph: true,
  title: "Archivo huérfano",
  needs: [],
  // OLA A, INTEGRACIÓN — este detector NO declara `needsEdges`, y la
  // omisión es deliberada, no un olvido.
  //
  // La Ola A (frente A3) le había puesto `needsEdges: ["references"]` con el
  // criterio de "unión genérica" (`computeCrossFileConnectedFiles` acepta
  // todo kind salvo `contains`). El criterio es correcto para los detectores
  // que buscan una relación PRESENTE, y es exactamente al revés acá: la
  // señal de este detector es la AUSENCIA de aristas. Un repo cuyo grafo no
  // tiene una sola arista cross-file no es un repo donde "no se puede
  // opinar sobre archivos huérfanos": es el repo donde TODOS los archivos lo
  // son, o sea el caso de señal máxima. Silenciarlo ahí como `sin-aristas`
  // no reporta una brecha, esconde el hallazgo — y es la misma confusión
  // ("cero" vs. "no aplicable") que `needsEdges` existe para deshacer, sólo
  // que con el signo invertido.
  //
  // Medido, no razonado: con la declaración puesta, `api/code.test.ts` ("P3:
  // paginación por offset/limit") pasaba de 2 grupos a 1 sobre su fixture de
  // un solo archivo — el `orphan-file` real del fixture desaparecía. Sobre
  // los dos corpus reales la declaración no cambiaba nada (`references` está
  // presente en ambos: 4.680 y 2.546), así que la regla no compraba nada y
  // costaba el caso límite en el que este detector es más útil.
  //
  // Regla general que se deduce de esto, para quien agregue `needsEdges` a
  // un detector nuevo: un detector cuya señal es la ausencia de una relación
  // (éste, y por el mismo argumento cualquier futuro "sin consumidores")
  // no puede usar la presencia de esa misma relación como precondición.
  thresholds: {
    presence: PRESENCE_SPEC,
    mirrorRatioMin: MIRROR_RATIO_MIN_SPEC,
    mirrorRatioMax: MIRROR_RATIO_MAX_SPEC,
  },
  maxFindings: MAX_FINDINGS_SPEC,
  run(repo: RepoUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const graph = repo.graph;
    // Defensivo: `run.ts#runInterFile` ya filtra `needsGraph && graph ===
    // null` ANTES de llamar a `run()` (reporta `sin-grafo`, nunca invoca esto
    // con grafo nulo) — este `return []` nunca debería ejecutarse en
    // producción, pero `CodeGraph | null` sigue siendo el tipo declarado.
    if (!graph) return [];
    return buildOrphanFileFindings(
      repo.files,
      graph,
      ctx.threshold("presence"),
      ctx.threshold("mirrorRatioMin"),
      ctx.threshold("mirrorRatioMax"),
      repoNameIndex(repo),
    );
  },
};
