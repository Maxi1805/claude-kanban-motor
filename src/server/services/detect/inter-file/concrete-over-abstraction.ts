/**
 * `concrete-over-abstraction` — DEPENDENCIA CONCRETA HABIENDO UNA ABSTRACCIÓN
 * DISPONIBLE (CONTRATO-F5.md Contrato 4, catálogo de la ola: 16 detectores
 * `inter-file` sobre el grafo tipado).
 *
 * RELACIÓN (sin jerga de AST): un archivo A referencia la clase concreta B
 * (o un miembro de B) cuando B YA declara, en su propia sintaxis, que
 * implementa una interfaz I (arista `implements`) — y el uso que A hace de B,
 * hasta donde el grafo puede verlo, está enteramente cubierto por los
 * miembros que I expone. Si A necesitara sólo lo que I ofrece, podría haber
 * dependido de I en vez de B: acopla su compilación/testeo a una
 * implementación concreta sin necesidad estructural de hacerlo (Dependency
 * Inversion Principle — Martin, "Clean Architecture", cap. 11).
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: la señal entera es forma de grafo —
 * aristas `implements`/`satisfies` (B -> I) y `references` (A -> B o un
 * miembro de B) — cero vocabulario de dominio, cero nombres de nodo. La
 * pertenencia de un símbolo a otro (¿es este nodo un MIEMBRO de B?) se
 * decide con aristas `contains` (la misma jerarquía carpeta->archivo->
 * símbolo->símbolo que ya usan `orphan-file.ts`/`unused-symbol.ts`), nunca
 * comparando texto.
 *
 * ARISTAS QUE NECESITA — declaradas acá porque `InterFileDetector` (F5,
 * Contrato 4 §4.3: `needsEdges`/`needsMetrics`/`minProvenance`,
 * `RunContext.trustedEdge`/`.provenanceMix`) TODAVÍA NO ATERRIZÓ: verificado
 * por grep, `detect/types.ts` no declara ninguno de esos campos y
 * `RepoUnit` no lleva `.metrics` (mismo hallazgo que ya documenta
 * `detect/grouping.ts#defaultEvidenceQuality` sobre `provenanceMix`). Sin
 * ese mecanismo, este detector declara sus aristas EN PROSA y las exige A
 * MANO dentro de `run()`, igual que `dependency-cycle.ts`/`orphan-file.ts`
 * ya hacían antes de que existiera un campo dedicado:
 *   - `implements` (interfaz-declarada) y, con la misma vara,`satisfies`
 *     (interfaz-estructural) — la relación B -> I.
 *   - `contains` — para enumerar los miembros de B y de I.
 *   - `references` — el uso A -> B (o A -> miembro de B).
 * Sin grafo: `run()` devuelve `[]` de forma defensiva (`run.ts` ya reporta
 * `sin-grafo` antes de invocar esto — mismo contrato que los 3 detectores
 * existentes). Con grafo pero sin NINGUNA arista `implements`/`satisfies`:
 * esta build también devuelve `[]` — que es, hoy, indistinguible en el tipo
 * de "no aplicable" (no hay un `CoverageStatus` "sin-aristas" todavía). Es
 * una limitación del TIPO, no de este detector, y se documenta en vez de
 * fingir que "0 hallazgos" significa "sin problemas" — ver el hallazgo
 * medido más abajo, que es exactamente ese caso.
 *
 * *** CORREGIDO — este párrafo afirmaba que `graph/build.ts` nunca cablea
 * `EDGE_EXTRACTORS`; verificado de nuevo (Ola H4), ya no es cierto: ***
 * `graph/build.ts` importa y usa `EDGE_EXTRACTORS`, y `code-analyzer.ts`
 * (comentario propio "P5-ARISTAS") pasa `f.edges` desde la Ola 5. Hoy, en
 * producción, `repo.graph.edges` SÍ puede traer `implements`/`satisfies` —
 * el censo congelado (`tests/golden/*.census.json`) lo confirma para
 * detectores hermanos que usan la misma arista (`parallel-hierarchies`,
 * `speculative-abstraction`: 82 y 207 hallazgos respectivamente en el
 * corpus, ninguno en cero).
 *
 * *** ACTUALIZADO (Ola O) — el párrafo de arriba ("SIGUE en 0 hallazgos")
 * quedó viejo: ya no es cierto y este párrafo lo reemplaza con lo medido. ***
 * En algún momento entre la Ola H4 y la Ola N este detector empezó a emitir
 * de verdad: el ranking de ruido de la Ola N (`RAICES.md`) mide 280
 * hallazgos en el corpus completo (13 repos, no los 8 de entonces). El "0"
 * de arriba describía un estado que ya no existe en el árbol — se deja el
 * párrafo original tachado por historia, no porque siga siendo cierto.
 *
 * EL BUG REAL DE ESOS 280, MEDIDO (Ola N, `INTEGRADOR.md` §4.2 punto 4: 5 de
 * 5 veredictos juzgados a mano, los 5 falsos) Y CERRADO ACÁ (Ola O) — ACUSA
 * AL SITIO DE CONSTRUCCIÓN. Los 5 casos juzgados son, textual:
 * `new BiMapValueSetGenerator(...)`, `new MapGenerator(...)`,
 * `new InverseBiMapGenerator(...)`, `CacheBuilder → SimpleStatsCounter` — en
 * los cinco, la ÚNICA arista `references` que sostenía el hallazgo era el
 * identificador de B dentro de un `new B(...)`. Eso NO es un cliente que
 * "podría haber dependido de la interfaz en su lugar": es el ÚNICO lugar del
 * programa que NO PUEDE hacerlo — alguien tiene que nombrar la clase
 * concreta para construirla; pedirle a ese sitio que dependa de la
 * abstracción no tiene sentido estructural (`new I(...)` no compila/no
 * corre para una interfaz sin cuerpo). Es un error de DEFINICIÓN del
 * enunciado ("A depende de B pudiendo depender de I"), no de umbral: ver
 * `collectInstantiationSites`/"SITIO DE CONSTRUCCIÓN" más abajo, que excluye
 * exactamente esta evidencia sin tocar ningún extractor ni agregar ningún
 * `EdgeKind` — la arista `instantiates` (`graph/edges/instanciacion.ts`) ya
 * está en el grafo, cableada para `scattered-instantiation.ts`.
 *
 * SIMPLIFICACIONES DECLARADAS:
 *   - Sólo `implements`/`satisfies` cuentan como "abstracción disponible".
 *     `extends` (herencia de clase concreta) queda AFUERA a propósito: una
 *     superclase concreta no es "una interfaz que B implementa" en el
 *     sentido del enunciado, y tratarla igual confundiría este detector con
 *     `refused-bequest`/`large-class` (un problema distinto: acoplamiento a
 *     una superclase, no a una implementación reemplazable por contrato).
 *   - `mixes-in` (Ruby `include`/`extend`) también queda AFUERA: un módulo
 *     mezclado es composición, no un contrato de sustituibilidad — Ruby es
 *     duck-typed, así que "depender del módulo en vez de una interfaz" no
 *     tiene el mismo sentido que en Java/C#/TS. Candidato a un detector
 *     aparte, no una variante de éste.
 *   - Cobertura de uso por NOMBRE de miembro únicamente (no aridad, no
 *     tipos): mismo límite que `interfaz-estructural.ts#satisfiesAll`
 *     declara para su propia comparación de conjuntos.
 *   - Una interfaz SIN miembros (`interface Marker {}`, `Serializable` de
 *     Java) nunca puede "cubrir" un uso real por construcción (el conjunto
 *     de miembros de A observados, si no está vacío, nunca es subconjunto
 *     de un conjunto vacío) — así que las interfaces marcador se descartan
 *     solas, sin una regla aparte ni una lista de nombres.
 *   - No compone varias interfaces para cubrir un uso partido entre dos
 *     (`I1` cubre un método, `I2` otro): exige que UNA sola interfaz cubra
 *     TODO lo observado. Subcuenta casos reales, declarado, no escondido.
 *   - Referencia INTRA-archivo (A y B en el mismo archivo) EXCLUIDA: el
 *     acoplamiento que le importa a este detector `inter-file` es a través
 *     de archivos — mismo criterio que `orphan-file.ts` aplica a "conexión
 *     con el resto del repo".
 *
 * CON QUÉ SE CONFUNDE — EL PATRÓN LEGÍTIMO, Y CÓMO SE VERIFICA ANTES DE
 * EMITIR: A puede depender de la clase concreta B, aunque B implemente I,
 * PORQUE A de verdad necesita algo que I no expone (un método concreto
 * adicional, un campo público, una API más ancha a propósito — Adapter
 * concreto, o simplemente B tiene más superficie que I y A usa esa
 * superficie extra legítimamente). Este detector reconstruye, por archivo A,
 * el conjunto de miembros de B que A efectivamente referencia (vía aristas
 * `references` cuyo destino es un miembro de B) y SÓLO emite si ESE conjunto
 * es subconjunto de los miembros de I — si A usa aunque sea un solo miembro
 * fuera de I, el (A, B) se descarta por completo, no se "emite con menos
 * severidad": la confusión no es una gradación, es un descarte. Cuando A
 * sólo tiene una referencia a NIVEL DE CLASE hacia B (sin que el grafo haya
 * resuelto qué miembro específico usa — frecuente: el grafo no hace
 * inferencia de tipos, así que `variable.metodo()` rara vez resuelve a un
 * miembro puntual, ver el mismo hueco que documenta `unused-symbol.ts`), no
 * hay nada que verificar y tampoco nada que descartar — se emite con
 * severidad reducida y el `detail` lo dice explícitamente: es una hipótesis
 * más débil, no una violación confirmada.
 *
 * SITIO DE CONSTRUCCIÓN (Ola O) — LA OTRA FORMA DE CONFUNDIRSE, DISTINTA DE
 * LA DE ARRIBA, Y POR QUÉ ES UN DESCARTE COMPLETO, NO UNA REBAJA: la
 * confusión de arriba ("A usa más superficie de B que la que I expone") es
 * sobre QUÉ hace A con B. Ésta es sobre SI A puede elegir depender de I EN
 * ABSOLUTO — y en el sitio donde A escribe `new B(...)`, la respuesta es NO
 * por construcción: `new I(...)` no tiene sentido para una interfaz (Java/
 * C#/TS no la dejan instanciar sin cuerpo). El identificador `B` dentro de
 * `new B(...)` es, sintácticamente, una referencia "bare" ordinaria (mismo
 * mecanismo que cualquier otro uso de un tipo) — `graph/references.ts` la
 * captura igual que a cualquier identificador, así que produce una arista
 * `references` de clase (A -> B) EXACTAMENTE en la misma posición donde
 * `graph/edges/instanciacion.ts` produce, por separado, la arista
 * `instantiates` (A -> B) que ya usa `scattered-instantiation.ts`. Ambas
 * nacen del MISMO identificador, resuelven por la MISMA cascada
 * (`graph/build.ts`, "DOS mecanismos de resolución", punto A: las 5 aristas
 * tipadas de símbolo reusan literalmente `resolveReferences`/`ALL_STAGES`),
 * así que su `(from, to)` coincide exactamente. `collectInstantiationSites`
 * arma el conjunto de esos pares una sola vez por corrida, y
 * `collectConsumers` descarta la evidencia a NIVEL DE CLASE (nunca la de
 * MIEMBRO: `b.foo()` después de construir sigue siendo evidencia real, ver
 * abajo) cuando el par coincide — DESCARTE COMPLETO, no severidad reducida,
 * a diferencia de la confusión de arriba: no es una hipótesis más débil, es
 * evidencia que NO debería haber contado nunca, la misma vara que ya usa
 * "CON QUÉ SE CONFUNDE" para un uso fuera de la interfaz. LÍMITE DECLARADO:
 * si el MISMO origen construye B (`new B()`) Y ADEMÁS tiene otra referencia
 * de clase a B en el mismo sitio léxico (p.ej. `instanceof B` en la misma
 * función), `graph/references.ts` deduplica por `(nombre, rol, scope,
 * calificador, isCallee)` — no por posición — así que ambas ocurrencias
 * colapsan en UNA arista con peso 2 y el descarte se lleva puesta la
 * evidencia legítima también; caso raro (construir Y comprobar tipo del
 * mismo B en la misma función), no medido en el corpus, documentado no
 * escondido.
 *
 * POR QUÉ ACEPTA `provenance: "inferred"` EN `collectInstantiationSites` — MEDIDO, y
 * DELIBERADAMENTE DISTINTO de "OJO CON JAVA" (el párrafo siguiente), que exige NO-`inferred`
 * en las aristas de EVIDENCIA POSITIVA de este detector (`references`/`implements`/
 * `satisfies`). Acá la arista `instantiates` no aporta una afirmación nueva: CANCELA una
 * `references` que ya pasó su propia exigencia de confianza. Medido armando el grafo real de
 * guava (`scratchpad/n9/dump-graph.mts`, esta ola): los 5 casos de "SITIO DE CONSTRUCCIÓN"
 * citados arriba (`BiMapValueSetGenerator`/`MapGenerator`/`InverseBiMapGenerator`/
 * `SimpleStatsCounter`) están en `BiMapTestSuiteBuilder.java`/`CacheBuilder.java`/
 * `LocalCache.java`, los tres duplicados entre `guava/` y `android/guava/` — el mismo
 * fenómeno de nombre-con-dos-declaraciones-candidatas que documenta
 * `scattered-instantiation.ts` para Java en general: la `instantiates` de CADA sitio de
 * construcción resuelve por `path-proximity` (`inferred`), nunca `declared`/`resolved`, porque
 * el nombre simple del generador/contador tiene una declaración candidata en cada copia del
 * árbol. Exigir no-`inferred` acá (la primera versión de este arreglo lo hacía) dejaba el
 * conjunto vacío para las 8 aristas duplicadas de guava, y el volumen medido de
 * `concrete-over-abstraction` no se movía nada (280 antes de esta ola en el corpus completo;
 * las 10 filas de guava seguían disparando). El mismo argumento que
 * `speculative-abstraction.ts` ya usa para su propia excepción idéntica (ver "POR QUÉ ACEPTA
 * INFERRED" en su docstring) aplica acá palabra por palabra: el texto `new B(...)` existe con
 * certeza sintáctica; lo único incierto es CUÁL copia duplicada de B resuelve, y ambas copias
 * son el MISMO sitio de construcción para el propósito de este descarte.
 *
 * OJO CON JAVA — path-proximity, `provenance: "inferred"`: siguiendo la
 * misma regla que ya fija `dependency-cycle.ts` (una arista `inferred` que
 * es evidencia POSITIVA del hallazgo se EXCLUYE, no se degrada — lo
 * conservador es no afirmar), este detector exige `provenance !== "inferred"`
 * en la arista `references` (A -> B). En Java, donde `path-proximity`
 * resuelve el 81% de las `references` aceptadas en guava (medido en Ola 3/4,
 * dataset etiquetado sólo Ruby), la mayoría de los candidatos A->B quedan
 * excluidos por esta misma regla, así que este detector dispara MENOS en Java
 * que en un lenguaje resuelto mayormente por reglas estructurales — es la
 * lectura conservadora, no un defecto.
 *
 * *** LA EXCEPCIÓN, MEDIDA (Ola P, frente P3): LA ARISTA `implements` NO ES
 * DEL MISMO TIPO DE EVIDENCIA QUE UNA `references`. *** Hasta esta ola la
 * misma exigencia se aplicaba también a la arista de ABSTRACCIÓN (B -> I), y
 * eso dejaba al detector CIEGO justo donde más candidatos hay. La razón es
 * estructural, no de umbral:
 *   - Una `references` `inferred` puede ser una relación FABRICADA: el
 *     identificador suelto podía apuntar a cualquier cosa y `path-proximity`
 *     eligió una. Ahí "inferido" significa "puede que esta relación no
 *     exista". Se sigue excluyendo.
 *   - Una `implements` es NOMINAL: el programa DICE, con certeza sintáctica,
 *     `class B implements I`. `graph/edges/interfaz-declarada.ts` la emite
 *     `provenance: "declared"` y la cascada la re-etiqueta `inferred`
 *     únicamente cuando el NOMBRE `I` tiene más de una declaración candidata
 *     y hubo que desempatar cuál archivo — el caso normal de un árbol
 *     duplicado (`guava/` vs `android/guava/`, dos copias del MISMO tipo
 *     lógico). Ahí "inferido" significa "no sabemos cuál copia", nunca "puede
 *     que no implemente nada". Verificado con un repo Java mínimo de dos
 *     paquetes homónimos (`scratchpad/p3/mini-graph.mts`): con DOS
 *     declaraciones de `Contract`, las dos aristas `implements` salen
 *     correctas y `inferred`; con UNA, salen `resolved`. Es EXACTAMENTE el
 *     mismo argumento que este archivo ya acepta para `instantiates` en
 *     "POR QUÉ ACEPTA INFERRED" y que `speculative-abstraction.ts` acepta
 *     para el suyo.
 *   - `satisfies` (interfaz-estructural) sigue exigiendo no-`inferred` y por
 *     lo tanto sigue EXCLUIDA por completo: ahí `inferred` no habla del
 *     archivo destino sino de la RELACIÓN misma (coincidencia de firmas, sin
 *     que el programador declare nada). La distinción no es por `EdgeKind`
 *     por gusto: es por qué significa `inferred` en cada una.
 *
 * *** "B ES CONCRETA" DEJA DE SER UNA SUPOSICIÓN Y PASA A EXIGIR EVIDENCIA
 * (Ola P, frente P3) — el otro cambio de DEFINICIÓN. *** El enunciado dice
 * "A depende de la CLASE CONCRETA B pudiendo depender de la interfaz I", y
 * hasta esta ola nada comprobaba la palabra "concreta": alcanzaba con que B
 * fuera el ORIGEN de una arista `implements`. En Java/C#/TS eso casi siempre
 * implica una clase; en Go NO, y Go era el 90 % del kind. El `implements`
 * que `graph/edges/interfaz-declarada.ts` produce para Go es el EMBEDDING de
 * una interfaz dentro de otra (`type A interface { B }`), así que la "clase
 * concreta B" del título es, sin excepción, OTRA INTERFAZ.
 *
 * MEDIDO Y JUZGADO A MANO sobre el corpus (censo de la Ola O: **253 de los
 * 282 hallazgos del kind son de hugo**, o sea Go):
 *   - `tpl/tplimpl/templatestore.go` "depende de la clase concreta
 *     `CurrentTemplateInfoOps`": abriendo `tpl/template.go:161` eso es
 *     `type CurrentTemplateInfoOps interface { CurrentTemplateInfoCommonOps;
 *     Base() ... }` — una interfaz que embebe a la otra Y agrega `Base()`.
 *     Seguir el consejo (usar la interfaz "disponible") perdería `Base()`.
 *   - `hugolib/pagecollections.go` "depende de la clase concreta
 *     `contentNode`": `hugolib/content_map_page_contentnode.go:65` es
 *     `type contentNode interface { Path() string; contentNodeForEach }`, y
 *     el uso es como TIPO DE RETORNO de cuatro funciones.
 *   Dos de dos, falsos, por la MISMA causa estructural.
 *
 * LA PRUEBA, ESTRUCTURAL Y SIN UNA SOLA REGLA POR LENGUAJE: **B tiene que ser
 * destino de al menos una arista `instantiates` en algún lugar del repo**
 * (`concreteTypes`, más abajo). Construir es lo único que una clase concreta
 * puede hacer y una interfaz/clase abstracta no: en Go un `composite_literal`
 * de un tipo interfaz no existe, en Java/C# `new I(...)` sin cuerpo no
 * compila. Si nadie construye B en ninguna parte, o B no es concreta (y la
 * premisa del enunciado es falsa) o es código muerto (y el problema es otro,
 * `orphan-file`/`unused-symbol`). No es un umbral y no es una lista de
 * lenguajes: es la palabra "concreta" del propio enunciado, pedida como
 * evidencia. Se apoya, además, en la MISMA arista que esta ola acaba de
 * completar (`graph/edges/instanciacion.ts`: genéricos y scope léxico), que
 * es la razón por la que hoy se puede exigir y antes no.
 *
 * ════════════════════════════════════════════════════════════════════════
 * OLA R (frente R5) — LA FORMA DÉBIL DEJA DE EMITIRSE, Y EL TIPO DEL
 * RECEPTOR RESUELVE EL MIEMBRO. Es el cambio más grande que tuvo este
 * detector, y las dos mitades van juntas: una sola habría sido un recorte.
 * ════════════════════════════════════════════════════════════════════════
 *
 * EL PÁRRAFO DE ABAJO ESTABA VIGENTE HASTA ESTA OLA y decía, textual: *"NO se
 * exige que el uso llegue a nivel de MIEMBRO: cuando el grafo sólo resolvió
 * una referencia a nivel de clase el hallazgo sigue emitiéndose con severidad
 * reducida y el `detail` lo dice — es una hipótesis más débil, no una
 * afirmación sin sostén, y exigir miembro resuelto habría dejado el kind
 * prácticamente en cero."* Las dos afirmaciones se midieron y las dos
 * resultaron falsas:
 *
 * **(1) "Es una hipótesis más débil, no una afirmación sin sostén."** El
 * enunciado de este detector es *"el uso que A hace de B está ENTERAMENTE
 * CUBIERTO por los miembros que I expone"*. En la forma débil ese uso no se
 * observó: `usedMembers` está vacío, `uncovered` está vacío por vacuidad, y
 * la condición se cumple sin haberse evaluado ni una vez. Es exactamente la
 * degeneración que `feature-envy-intra` documenta como *"NO MEDIR NO ES
 * MEDIR CERO"*: la mitad citada de la regla no se evalúa y lo que queda es
 * "A nombra a B". MEDIDO sobre el corpus congelado (13 repos): **72 de 72
 * hallazgos (100 %) eran la forma débil**, `severity` 25, y su precisión
 * medida es **0 % con n=5, Wilson [0, 43]**. Los cinco juzgados y todos los
 * que leí a mano son la misma familia: una clase RICA que implementa una
 * interfaz FUNCIONAL diminuta — `Range`/`Predicate`, `CharMatcher`/
 * `Predicate`, `Converter`/`Function`, `HashBiMap`/`BiMap`. El consejo
 * ("dependé de `Predicate` en vez de `Range`") es absurdo en su propio
 * enunciado, y el chequeo que lo habría matado es justamente el que la forma
 * débil no corre.
 *
 * **(2) "Exigir miembro resuelto dejaría el kind en cero."** Era cierto con
 * el filtro de procedencia de entonces, y la causa está MEDIDA
 * (`scratchpad/r5/probe-coa.mts`, grafo real de guava): hacia los miembros de
 * `Range` entran **76 aristas `calls` y 128 `references` desde otros
 * archivos, y las 204 son `provenance: "ambiguous"`** — un nombre de miembro
 * como `contains` o `apply` tiene decenas de homónimos en un repo de 44.914
 * símbolos, así que la cascada nunca desempata. `isConcreteEdge` las excluye
 * a todas. **La evidencia de miembro existía; estaba tirada por ambigua.**
 *
 * LO QUE LA DESAMBIGUA, Y ES LA RELACIÓN NUEVA DE ESTA OLA: si el archivo A
 * declara un sitio (campo, parámetro, variable) cuyo **tipo ESCRITO** es B
 * (arista `declares-type`, `graph/edges/declara-tipo.ts`), entonces entre los
 * candidatos que la cascada ya ofreció para ese miembro, **el de B es el que
 * el tipo del receptor sostiene**. Eso es "resolución de referencia a nivel
 * de MIEMBRO vía el tipo del receptor", y es la dirección PERMITIDA:
 *
 *   - del **tipo escrito** (dato sintáctico, lo escribió el programador)
 *     **al miembro** — lo que se hace acá;
 *   - del **conjunto de miembros al tipo** — PROHIBIDO, es la forma exacta de
 *     `deriveSatisfiesEdges`, que fabricó 1.360 aristas falsas. Este módulo
 *     no mira ni un conjunto de miembros para decidir un tipo: el tipo viene
 *     escrito y sólo se usa para ELEGIR entre candidatos que la cascada ya
 *     produjo. Nunca inventa un candidato que no estuviera en `to`/
 *     `alternatives`.
 *
 * Y LA TERCERA PIEZA, que no necesitaba nada nuevo: `collectConsumers` leía
 * SÓLO aristas `references` y **`calls` es donde vive `b.foo()`**. Las dos
 * nacen de la misma `ReferenceFacts` y las parte `build.ts#relabelKind` por
 * `isCallee` (una arista es una o la otra, nunca las dos, así que no hay
 * doble conteo). Un detector que busca "qué miembros de B usa A" y no lee
 * `calls` está ciego a la invocación, que es la forma más común de usar un
 * miembro.
 *
 * ÁRBOL ESPEJO — el mismo colapso que `speculative-abstraction.ts` ya aplica:
 * guava mantiene `guava/src/...` y `android/guava/src/...`, dos copias casi
 * byte-idénticas del mismo código, y este detector contaba cada hallazgo
 * lógico DOS veces (medido: 24 de 60 en el triaje de la Ola Q). `mirror-tree.ts`
 * ya existía y ya se usa para esto en otros tres detectores; acá se colapsa
 * por `(archivo A, archivo B, símbolo B, archivo I, símbolo I)` módulo
 * `canonicalFile`.
 */
import { canonicalFile, detectMirrorTrees, NO_MIRRORS, type MirrorTrees } from "../mirror-tree.js";
import { presencia, presupuesto } from "../thresholds.js";
import type { Threshold } from "../thresholds.js";
import type { CodeGraph, CodeGraphEdge, CodeGraphNode } from "../../graph/types.js";
import type { InterFileDetector, RawFinding, RepoUnit, RoleLocation, RunContext } from "../types.js";

type ThresholdKey = "presence";

/**
 * Presencia, no magnitud: "existe al menos un consumidor concreto con una
 * abstracción disponible que cubre su uso" es binario por instancia — mismo
 * patrón que `orphan-file.ts`/`unused-symbol.ts`.
 */
const PRESENCE_SPEC = presencia({
  rationale:
    "es presencia/ausencia por (archivo consumidor, clase concreta, interfaz): o el uso observado está enteramente " +
    "cubierto por la interfaz o no lo está, no hay una magnitud intermedia que umbralizar.",
});

/** CONTRATO-F4.md §1.8: tope de VOLUMEN propio, no de detección. */
const MAX_FINDINGS_SPEC = presupuesto(150, {
  rationale:
    "un panel legible no lista de forma útil más de un par de cientos de dependencias concretas evitables a la vez; " +
    "es tope de volumen, no de detección.",
});

/** Hermano homónimo (`@2`, `@3`, …): nunca destino confiable de una arista — mismo criterio que `unused-symbol.ts`. */
function isDuplicateSibling(id: string): boolean {
  return /@\d+$/.test(id);
}

function symbolName(node: CodeGraphNode): string {
  return node.symbolPath[node.symbolPath.length - 1] ?? "?";
}

/** Excluye `inferred` (evidencia heurística) y `ambiguous` (CONTRATO-F9.md §4.5: fuera de toda
 *  consulta por defecto). */
function isConcreteEdge(edge: CodeGraphEdge): boolean {
  return edge.provenance !== "inferred" && edge.provenance !== "ambiguous";
}

/**
 * Evidencia utilizable de "B declara una abstracción I" — ver "LA EXCEPCIÓN,
 * MEDIDA" en el docstring del módulo. `ambiguous` fuera siempre
 * (CONTRATO-F9.md §4.5). `inferred` fuera SÓLO para `satisfies`, donde
 * significa "la relación misma es una inferencia"; en `implements` (nominal,
 * escrita por el programador) significa apenas "cuál de las declaraciones
 * homónimas del nombre es el destino", que no pone en duda que la relación
 * exista.
 */
function isUsableAbstractionEdge(edge: CodeGraphEdge): boolean {
  if (edge.provenance === "ambiguous") return false;
  return edge.kind === "implements" ? true : isConcreteEdge(edge);
}

/** B -> conjunto de interfaces I que declara implementar/satisfacer, con evidencia utilizable. */
function collectAbstractionEdges(graph: CodeGraph): ReadonlyMap<string, ReadonlySet<string>> {
  const out = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (edge.kind !== "implements" && edge.kind !== "satisfies") continue;
    if (!isUsableAbstractionEdge(edge)) continue; // ver "LA EXCEPCIÓN, MEDIDA": satisfies sigue exigiendo no-inferred, y hoy siempre lo es.
    // Auto-bucle de resolución (`graph/build.ts#buildTypedEdgeCandidatesForFile`
    // no filtra la auto-referencia, a diferencia de `buildCandidatesForFile`):
    // una clase no se implementa a sí misma. Redundante con el `iId === bId`
    // de más abajo, pero acá evita además que un auto-bucle sea la ÚNICA
    // "abstracción disponible" de B y lo haga entrar al barrido de consumidores.
    if (edge.from === edge.to) continue;
    let set = out.get(edge.from);
    if (!set) {
      set = new Set();
      out.set(edge.from, set);
    }
    set.add(edge.to);
  }
  return out;
}

/** id de nodo -> ids de sus hijos DIRECTOS, vía `contains` (folder->file->símbolo->símbolo anidado). */
function collectChildren(graph: CodeGraph): ReadonlyMap<string, readonly string[]> {
  const out = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.kind !== "contains") continue;
    let arr = out.get(edge.from);
    if (!arr) {
      arr = [];
      out.set(edge.from, arr);
    }
    arr.push(edge.to);
  }
  return out;
}

/** Nombres de los miembros DIRECTOS (símbolos hijos) de un nodo tipo-clase. */
function memberNamesOf(
  nodeId: string,
  children: ReadonlyMap<string, readonly string[]>,
  nodeById: ReadonlyMap<string, CodeGraphNode>,
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const childId of children.get(nodeId) ?? []) {
    const child = nodeById.get(childId);
    if (child && child.kind === "symbol") names.add(symbolName(child));
  }
  return names;
}

interface Consumer {
  readonly fromNode: CodeGraphNode;
  /** `undefined` cuando la arista apunta a B misma (referencia a nivel de clase, no a un miembro puntual). */
  readonly memberName: string | undefined;
  readonly weight: number;
}

/** Clave de par (origen, destino) — mismo separador que el resto del proyecto usa para pares de id. */
function pairKey(from: string, to: string): string {
  return `${from}\0${to}`;
}

/**
 * Ver "SITIO DE CONSTRUCCIÓN" en el docstring del módulo. Pares (origen, `bId`) que tienen una
 * arista `instantiates` confiable (`declared`/`resolved`, nunca `inferred`/`ambiguous` — mismo
 * criterio que `isConcreteEdge`) entre ellos: ese origen es, en ese punto, quien ELIGE la clase
 * concreta B — el único lugar del programa que no puede depender de la abstracción en su lugar.
 */
function collectInstantiationSites(graph: CodeGraph): ReadonlySet<string> {
  const out = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.kind !== "instantiates") continue;
    // NO usa `isConcreteEdge` (que excluye `inferred` además de `ambiguous`) — ver "POR QUÉ
    // ACEPTA INFERRED" en el docstring del módulo: sólo `ambiguous` se excluye acá.
    if (edge.provenance === "ambiguous") continue;
    out.add(pairKey(edge.from, edge.to));
  }
  return out;
}

/**
 * Los tipos que ALGUIEN construye en algún lugar del repo — la evidencia de que B es CONCRETA,
 * ver `"B ES CONCRETA" DEJA DE SER UNA SUPOSICIÓN` en el docstring del módulo. Mismo criterio de
 * `provenance` que `collectInstantiationSites` (sólo `ambiguous` afuera) y por el mismo motivo:
 * el texto que construye existe con certeza sintáctica, lo único incierto es cuál declaración
 * homónima es el destino.
 */
function collectConcreteTypes(graph: CodeGraph): ReadonlySet<string> {
  const out = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.kind !== "instantiates") continue;
    if (edge.provenance === "ambiguous") continue;
    out.add(edge.to);
  }
  return out;
}

/**
 * Un sitio de declaración cuyo tipo es `bId`, con el ALCANCE en el que ese
 * nombre está visible: el archivo y el camino del contenedor que lo declara.
 */
interface DeclaredTypeScope {
  readonly file: string;
  /** `symbolPath` del sitio sin su último segmento: el contenedor donde el nombre está en alcance. */
  readonly container: readonly string[];
}

/**
 * SITIOS QUE DECLARAN UN VALOR DE TIPO `bId` — la relación `declares-type` de
 * la Ola R, indexada por la clase destino. Es el ANCLA que desambigua un
 * miembro: ver "EL TIPO DEL RECEPTOR RESUELVE EL MIEMBRO" en el docstring del
 * módulo.
 *
 * `ambiguous` afuera: una arista `declares-type` ambigua dice "el sitio
 * sostiene una de estas N clases", y usar eso para desempatar un miembro
 * ambiguo sería resolver una incertidumbre con otra. `inferred` SÍ entra, por
 * el mismo argumento que este archivo ya escribió para `implements` en "LA
 * EXCEPCIÓN, MEDIDA": el nombre del tipo está ESCRITO con certeza sintáctica
 * y `inferred` sólo dice CUÁL de las declaraciones homónimas es el destino —
 * el caso normal del árbol duplicado de guava.
 */
function collectDeclaredTypeScopes(
  graph: CodeGraph,
  nodeById: ReadonlyMap<string, CodeGraphNode>,
): ReadonlyMap<string, readonly DeclaredTypeScope[]> {
  const out = new Map<string, DeclaredTypeScope[]>();
  for (const edge of graph.edges) {
    if (edge.kind !== "declares-type") continue;
    if (edge.provenance === "ambiguous") continue;
    const site = nodeById.get(edge.from);
    if (!site) continue;
    let scopes = out.get(edge.to);
    if (!scopes) out.set(edge.to, (scopes = []));
    scopes.push({ file: site.file, container: site.symbolPath.slice(0, -1) });
  }
  return out;
}

function isPrefix(prefix: readonly string[], path: readonly string[]): boolean {
  if (prefix.length > path.length) return false;
  for (let i = 0; i < prefix.length; i++) if (prefix[i] !== path[i]) return false;
  return true;
}

/**
 * *** EL ANCLA ES DE ALCANCE, NO DE ARCHIVO — y la diferencia está MEDIDA. ***
 * La primera versión de este arreglo pedía sólo que el archivo consumidor
 * declarara EN ALGUNA PARTE un valor de tipo B. Con eso, guava emitía 5
 * hallazgos y los 5 eran el MISMO falso: `Ints.java`/`Longs.java`/
 * `Doubles.java`/`Shorts.java`/`Floats.java` "dependen de `Converter`
 * pudiendo depender de `Function`", con **un solo miembro observado:
 * `equals`**. Ninguno de esos archivos invoca `equals` sobre un `Converter`
 * — lo que pasaba es que cada uno declara, adentro de su clase anidada
 * `IntConverter`/`LongConverter`/…, un campo `INSTANCE` de tipo `Converter`,
 * y ese campo, a nivel de ARCHIVO, alcanzaba para atribuirle a `Converter`
 * cualquier referencia ambigua a un `equals` de cualquier otra parte del
 * archivo.
 *
 * La condición correcta es la que el propio nombre "tipo del RECEPTOR" pide:
 * el sitio de tipo B tiene que estar **EN ALCANCE en el punto de la
 * referencia** — su contenedor tiene que ser un PREFIJO del camino del
 * símbolo que hace la referencia (un campo de la clase visto desde sus
 * métodos, un parámetro o una variable local vistos dentro de su función).
 * Un campo de una clase ANIDADA no está en alcance desde el contenedor.
 *
 * LÍMITE DECLARADO, y es el que impide cerrar esto del todo: la arista no
 * lleva el CALIFICADOR de la referencia (`b` en `b.foo()`), así que ni con el
 * alcance correcto se sabe que ESE `foo` se despacha sobre ESE `b`; se sabe
 * que hay un valor de tipo B visible ahí. La pieza que falta es
 * `ReferenceFacts.qualifier` sobre `CodeGraphEdge` — ver el PIDO A OTRO
 * FRENTE del informe R5.
 */
function scopeCoversReference(scopes: readonly DeclaredTypeScope[], fromNode: CodeGraphNode): boolean {
  for (const scope of scopes) {
    if (scope.file !== fromNode.file) continue;
    if (isPrefix(scope.container, fromNode.symbolPath)) return true;
  }
  return false;
}

/**
 * Toda arista de USO (`references` o `calls`) desde OTRO archivo hacia `bId` o
 * un miembro directo de `bId`, EXCLUYENDO el sitio de construcción de B mismo
 * — ver "SITIO DE CONSTRUCCIÓN" en el docstring del módulo y
 * `collectInstantiationSites`.
 *
 * DOS `EdgeKind`, NO UNO (Ola R): `references` y `calls` nacen de la misma
 * `ReferenceFacts` y las parte `build.ts#relabelKind` por `isCallee`. Una
 * arista es una O la otra, nunca las dos, así que leer las dos no duplica
 * nada — y leer sólo `references`, como hasta esta ola, dejaba fuera
 * `b.foo()`, que es la forma más común de usar un miembro.
 *
 * `ambiguous` A NIVEL DE MIEMBRO, desambiguada por el tipo del receptor (Ola
 * R): si `declaredTypeFiles` dice que el archivo consumidor declara un sitio
 * cuyo tipo ESCRITO es B, entonces entre los candidatos que la cascada ya
 * ofreció (`to` + `alternatives`) el de B es el que ese tipo sostiene. Nunca
 * se inventa un candidato: si ningún miembro de B está entre ellos, la arista
 * no aporta nada.
 */
function collectConsumers(
  graph: CodeGraph,
  bId: string,
  bFile: string,
  memberIdToName: ReadonlyMap<string, string>,
  nodeById: ReadonlyMap<string, CodeGraphNode>,
  instantiationSites: ReadonlySet<string>,
  declaredTypeScopes: readonly DeclaredTypeScope[],
): readonly Consumer[] {
  const out: Consumer[] = [];
  for (const edge of graph.edges) {
    if (edge.kind !== "references" && edge.kind !== "calls") continue;
    const fromNode = nodeById.get(edge.from);
    if (!fromNode) continue;
    if (fromNode.file === bFile) continue; // intra-archivo: fuera de alcance, ver docstring.

    if (edge.provenance === "ambiguous") {
      // Sólo un valor de tipo B EN ALCANCE en el punto de la referencia puede
      // desempatar, y sólo a nivel de MIEMBRO — ver `scopeCoversReference`.
      if (!scopeCoversReference(declaredTypeScopes, fromNode)) continue;
      let memberName: string | undefined;
      for (const candidate of [edge.to, ...(edge.alternatives ?? [])]) {
        const name = memberIdToName.get(candidate);
        if (name !== undefined) {
          memberName = name;
          break;
        }
      }
      if (memberName === undefined) continue;
      out.push({ fromNode, memberName, weight: edge.weight });
      continue;
    }

    if (!isConcreteEdge(edge)) continue; // ver "OJO CON JAVA".
    const targetIsB = edge.to === bId;
    const targetMemberName = memberIdToName.get(edge.to);
    if (!targetIsB && targetMemberName === undefined) continue;
    // El identificador de B en `new B(...)` es, sintácticamente, una referencia "bare" más — la
    // MISMA posición que ya captura `graph/edges/instanciacion.ts` como `instantiates`. Si ESTE
    // origen ya construye B ahí, esta referencia a nivel de clase ES el sitio de construcción, no
    // evidencia de un cliente que podría haber dependido de la interfaz — alguien tiene que
    // elegir la clase concreta para construirla. Ver "SITIO DE CONSTRUCCIÓN" en el docstring.
    if (targetIsB && instantiationSites.has(pairKey(edge.from, bId))) continue;
    out.push({ fromNode, memberName: targetIsB ? undefined : targetMemberName, weight: edge.weight });
  }
  return out;
}

function familyOk(node: CodeGraphNode | undefined): node is CodeGraphNode {
  return !!node && node.kind === "symbol" && node.family === "class-like" && !isDuplicateSibling(node.id);
}

const NO_SCOPES: readonly DeclaredTypeScope[] = [];

export function buildConcreteOverAbstractionFindings(graph: CodeGraph, presence: Threshold, mirrors: MirrorTrees = NO_MIRRORS): RawFinding[] {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const abstractionEdges = collectAbstractionEdges(graph);
  const children = collectChildren(graph);
  const instantiationSites = collectInstantiationSites(graph);
  const concreteTypes = collectConcreteTypes(graph);
  const declaredTypeScopesByTarget = collectDeclaredTypeScopes(graph, nodeById);
  const findings: RawFinding[] = [];
  /** Ver "ÁRBOL ESPEJO" en el docstring: `guava/` y `android/guava/` son la MISMA dependencia lógica contada dos veces. */
  const seenMirrorKeys = new Set<string>();

  for (const [bId, interfaceIds] of abstractionEdges) {
    const bNode = nodeById.get(bId);
    if (!familyOk(bNode)) continue;
    // "B ES CONCRETA" — ver el docstring del módulo. Nadie construye B en ningún lado ⇒ o no es
    // una clase concreta (el caso Go: `implements` viene del EMBEDDING de una interfaz dentro de
    // otra, y el título diría "clase concreta" de una interfaz) o es código muerto, que es otro
    // problema y tiene su propio detector.
    if (!concreteTypes.has(bId)) continue;

    const memberIdToName = new Map<string, string>();
    for (const childId of children.get(bId) ?? []) {
      const child = nodeById.get(childId);
      if (child && child.kind === "symbol") memberIdToName.set(child.id, symbolName(child));
    }

    const consumers = collectConsumers(
      graph,
      bId,
      bNode.file,
      memberIdToName,
      nodeById,
      instantiationSites,
      declaredTypeScopesByTarget.get(bId) ?? NO_SCOPES,
    );
    if (consumers.length === 0) continue;

    for (const iId of interfaceIds) {
      if (iId === bId) continue;
      const iNode = nodeById.get(iId);
      if (!familyOk(iNode)) continue;

      const membersI = memberNamesOf(iId, children, nodeById);
      if (membersI.size === 0) continue; // interfaz marcador: nunca puede cubrir un uso real, ver docstring.

      // Agrupa consumidores por ARCHIVO (A) — un finding por (A, B, I), no uno por arista cruda.
      const byFile = new Map<string, Consumer[]>();
      for (const c of consumers) {
        let arr = byFile.get(c.fromNode.file);
        if (!arr) {
          arr = [];
          byFile.set(c.fromNode.file, arr);
        }
        arr.push(c);
      }

      for (const [aFile, group] of byFile) {
        const usedMembers = new Set<string>();
        let hasClassLevelOnly = false;
        for (const c of group) {
          if (c.memberName === undefined) hasClassLevelOnly = true;
          else usedMembers.add(c.memberName);
        }
        // EL CHEQUEO DE CONFUSIÓN (ver docstring): si A usa aunque sea un
        // miembro de B que I no expone, esto NO es "dependencia concreta
        // evitable" — es un uso legítimo de superficie que la interfaz no
        // cubre. Se descarta por completo, no se emite con menos severidad.
        // OLA R (R5) — SIN MIEMBRO OBSERVADO NO HAY NADA QUE AFIRMAR. Ver "LA
        // FORMA DÉBIL DEJA DE EMITIRSE" en el docstring del módulo: con
        // `usedMembers` vacío, `uncovered` está vacío POR VACUIDAD y el
        // enunciado ("el uso de A está enteramente cubierto por I") se cumple
        // sin haberse evaluado ni una vez. Es la misma degeneración que
        // `feature-envy-intra` documenta como "NO MEDIR NO ES MEDIR CERO".
        if (usedMembers.size === 0) continue;
        const uncovered = [...usedMembers].filter((m) => !membersI.has(m));
        if (uncovered.length > 0) continue;

        // Ver "ÁRBOL ESPEJO" en el docstring: el par gemelo de guava produce
        // el MISMO hallazgo lógico dos veces, una por copia del árbol.
        // La clave lleva el ARCHIVO canónico de A y sólo los NOMBRES de B y de
        // I, y eso NO es un descuido: medido sobre guava, `Converter.java` sí
        // forma par gemelo (69 pares detectados sólo bajo `common/base/`) pero
        // `Function.java` NO — es una interfaz de un método, y las dos copias
        // no comparten los 3 fingerprints mínimos que `detectMirrorTrees`
        // exige. Con el archivo de I en la clave, el par
        // (`guava/Ints.java`, `Converter`, `Function`) y su gemelo de
        // `android/guava/` daban claves distintas y el colapso no ocurría —
        // exactamente el sobre-conteo que este bloque existe para evitar. Con
        // el archivo de A y el nombre de B ya fijados, dos hallazgos que sólo
        // difieren en qué copia del árbol declara la interfaz HOMÓNIMA son el
        // mismo hallazgo lógico.
        const mirrorKey = [canonicalFile(mirrors, aFile), symbolName(bNode), symbolName(iNode)].join("::");
        if (seenMirrorKeys.has(mirrorKey)) continue;
        seenMirrorKeys.add(mirrorKey);

        const representative = group[0]!.fromNode;
        const locations: RoleLocation[] = [
          {
            file: aFile,
            startLine: representative.startLine ?? 1,
            endLine: representative.endLine ?? representative.startLine ?? 1,
            symbol: symbolName(representative),
            role: "cliente que depende de la clase concreta",
          },
          {
            file: bNode.file,
            startLine: bNode.startLine ?? 1,
            endLine: bNode.endLine ?? bNode.startLine ?? 1,
            symbol: symbolName(bNode),
            role: "clase concreta usada en vez de la interfaz",
          },
          {
            file: iNode.file,
            startLine: iNode.startLine ?? 1,
            endLine: iNode.endLine ?? iNode.startLine ?? 1,
            symbol: symbolName(iNode),
            role: "interfaz disponible que cubriría el uso",
          },
        ];

        let severity = 45 + Math.min(20, usedMembers.size * 4);
        // Si ADEMÁS del uso verificado hay referencias a nivel de clase sin miembro resuelto, el
        // uso real puede exceder lo observado: el hallazgo sigue en pie pero baja de severidad.
        if (hasClassLevelOnly) severity = Math.max(15, severity - 10);
        severity = Math.min(100, severity);

        const detailParts = [
          `"${aFile}" depende de la clase concreta "${symbolName(bNode)}" (${bNode.file}), que ya implementa la ` +
            `interfaz "${symbolName(iNode)}" (${iNode.file}); depender de la interfaz en vez de la clase reduce el ` +
            "acoplamiento a una implementación concreta y facilita sustituirla (Dependency Inversion Principle).",
        ];
        detailParts.push(
          `Verificado: los ${usedMembers.size} miembro(s) de "${symbolName(bNode)}" que "${aFile}" referencia ` +
            `(${[...usedMembers].join(", ")}) están TODOS en la interfaz — si usara un solo miembro fuera de ` +
            "ella, este hallazgo no se habría emitido (ver el docstring del módulo, 'con qué se confunde').",
        );
        if (hasClassLevelOnly) {
          detailParts.push(
            "Además hay referencias A NIVEL DE CLASE cuyo miembro el grafo no resolvió: el uso real podría " +
              "exceder lo verificado, y por eso este hallazgo sale con severidad reducida.",
          );
        }
        detailParts.push(
          `Que "${symbolName(bNode)}" sea CONCRETA está verificado en el grafo, no supuesto: alguien la construye en ` +
            "algún lugar del repo (arista `instantiates`). La arista `references` (A -> B) exige además evidencia no " +
            "heurística (`provenance` distinto de `inferred`), así que en Java —donde `path-proximity` domina esa " +
            "resolución— este hallazgo dispara con menos frecuencia por diseño, no porque el problema sea menos común ahí.",
        );

        findings.push({
          title: `"${aFile}" depende de la clase concreta "${symbolName(bNode)}" pudiendo depender de "${symbolName(iNode)}"`,
          detail: detailParts.join(" "),
          trigger: [
            {
              label: "consumidores concretos con abstracción disponible",
              value: 1,
              threshold: presence,
            },
          ],
          evidence: [
            { label: "miembros de la interfaz usados", value: usedMembers.size },
            { label: "miembros totales de la interfaz", value: membersI.size },
          ],
          locations: [locations[0]!, locations[1]!, locations[2]!],
          severity,
          advice: {
            primary: {
              name: "Depend on Abstraction / Dependency Inversion",
              kind: "refactorizacion",
              why:
                "Cambiar el tipo del consumidor de la clase concreta a la interfaz que ya implementa no cambia " +
                "comportamiento (el uso verificado está enteramente cubierto) y reduce el acoplamiento a la " +
                "implementación concreta, facilitando sustituirla en tests o en el futuro.",
              source: "https://refactoring.guru/es/design-patterns/dependency-injection",
            },
          },
        });
      }
    }
  }

  return findings;
}

export const detector: InterFileDetector<ThresholdKey, "concrete-over-abstraction"> = {
  id: "concrete-over-abstraction",
  kind: "concrete-over-abstraction",
  scope: "inter-file",
  needsGraph: true,
  title: "Dependencia concreta habiendo una abstracción disponible",
  needs: [],
  // CORREGIDO EN LA OLA 11b (frente B0) — el trío ["implements", "satisfies",
  // "references"] vivía entero bajo `needsEdges` (conjunción) desde la
  // Ola A3, y eso era demasiado estricto: son DOS roles distintos, no uno.
  // `references` es el uso A -> B (`collectConsumers`) y es genuinamente
  // MANDATORIO — sin ninguna arista `references` en el grafo,
  // `collectConsumers` siempre vuelve vacío y el detector no puede encontrar
  // nada, así que se queda en `needsEdges`. `implements`/`satisfies` en
  // cambio son la evidencia de la ABSTRACCIÓN DISPONIBLE, B -> I
  // (`collectAbstractionEdges`), y ahí SÍ alcanza con cualquiera de las dos:
  // `collectAbstractionEdges` las combina por unión (`edge.kind !==
  // "implements" && edge.kind !== "satisfies"` descarta, cualquier otra
  // cuenta) — las dos juegan el MISMO ROL ("B declara/satisface una
  // interfaz"), así que un repo con sólo una de las dos (p.ej. sólo
  // `implements`, el caso típico hoy: `satisfies` siempre sale
  // `provenance: "inferred"` y este detector la excluye por Java, ver "OJO
  // CON JAVA") sigue teniendo candidatos reales. Van en `needsAnyEdge`. Con
  // el AND anterior, un repo con `implements` > 0 pero `satisfies` == 0 (el
  // caso normal) igual apagaba el detector entero — regresión silenciosa
  // idéntica a la de `speculative-abstraction`/`unstable-dependency`/
  // `parallel-hierarchies`, medida y corregida en el mismo frente. `contains`
  // (enumerar miembros) se sigue excluyendo a propósito: es la arista de
  // fondo, ver `types.ts#InterFileDetector.needsEdges`. Ver
  // `types.ts#InterFileDetector.needsAnyEdge`, "CÓMO NO VOLVER A
  // CONFUNDIRLO", para el criterio completo.
  needsEdges: ["references"],
  needsAnyEdge: ["implements", "satisfies"],
  thresholds: {
    presence: PRESENCE_SPEC,
  },
  maxFindings: MAX_FINDINGS_SPEC,

  run(repo: RepoUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const graph = repo.graph;
    // Defensivo: `run.ts#runInterFile` ya filtra `needsGraph && graph ===
    // null` ANTES de llamar a `run()` — este `return []` nunca debería
    // ejecutarse en producción, pero `CodeGraph | null` sigue siendo el tipo
    // declarado.
    if (!graph) return [];
    // Ver "ÁRBOL ESPEJO" en el docstring del módulo. `repo.clones` es la ÚNICA
    // entrada de `detectMirrorTrees` (no lee disco ni pide nada nuevo) — mismo
    // uso, y el mismo módulo, que `speculative-abstraction.ts` ya hace.
    return buildConcreteOverAbstractionFindings(graph, ctx.threshold("presence"), detectMirrorTrees(repo.clones));
  },
};
