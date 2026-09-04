/**
 * `speculative-abstraction` — ABSTRACCIÓN ESPECULATIVA (PLAN.md §4.1 catálogo).
 * Fowler & Beck, *Refactoring: Improving the Design of Existing Code*, smell
 * "Speculative Generality" (refactoring.guru/smells/speculative-generality):
 * jerarquías/interfaces creadas "por si acaso" hicieran falta más adelante,
 * cuyo síntoma estructural es una clase base o interfaz con un único
 * subtipo/implementador real.
 *
 * RELACIÓN (sin jerga de AST): un nodo `symbol` `class-like` que es DESTINO
 * de al menos una arista `extends` (herencia declarada), `implements`
 * (interfaz declarada) o `satisfies` (interfaz cumplida estructuralmente,
 * sin que el programa lo declare — Go, TS), contando, combinadas las tres,
 * exactamente UN origen distinto. *** Es el más barato del catálogo ***: no
 * hay nada que recorrer aparte del grafo ya construido — se agrupan las
 * aristas de estos tres tipos por destino y se cuentan los orígenes
 * DISTINTOS que le apuntan; destino con exactamente 1 origen ⇒ candidato.
 *
 * NINGUNA MÉTRICA DE `graph/metrics/registry.ts` CALCULA ESTO (requisito 1
 * de la tarea, verificado ANTES de escribir código, no supuesto):
 * `scc`/`connected-components`/`pagerank`/`instability`/`clustering`/
 * `louvain` agregan fan-in/fan-out o particionan en comunidades — ninguna
 * cuenta "cuántos implementadores DISTINTOS tiene ESTE nodo puntual vía
 * herencia/interfaz". Este detector no reimplementa ninguna de esas seis:
 * hace su propio barrido O(E) sobre `graph.edges`, mismo patrón exacto que
 * los tres hermanos (`dependency-cycle`/`orphan-file`/`unused-symbol`),
 * ninguno de los cuales duplica una métrica del panel tampoco — ese módulo
 * está pensado para un dashboard interactivo con proyección cacheada y
 * presupuesto de tiempo, una superficie que `detect/types.ts` no expone.
 *
 * *** CORREGIDO — el párrafo anterior de este archivo decía lo contrario y
 * ya no es cierto, verificado de nuevo antes de tocar una sola línea de
 * lógica: *** `graph/build.ts` SÍ importa y usa `EDGE_EXTRACTORS`
 * (`graph/edges/registry.ts`, `EXTRACTOR_KIND_BY_ID`), y `code-analyzer.ts`
 * (bloque `graphFiles`, comentario propio "P5-ARISTAS") pasa `f.edges` desde
 * la Ola 5 — el cableado que este párrafo daba por ausente se hizo en una
 * ola anterior a la que escribe esto. `graph.edges` en producción SÍ
 * contiene `extends`/`implements`/`satisfies` hoy. Consecuencia MEDIDA, no
 * teórica: el censo congelado (`tests/golden/*.census.json`) cuenta 207
 * hallazgos de `speculative-abstraction` en los 8 repos del corpus (guava
 * 145, newtonsoft-json 48, click 6, preact 6, jekyll 2) — NO es el apagón
 * total que este archivo afirmaba.
 *
 * LA CEGUERA DE CLASES ANÓNIMAS — MEDIDA (Ola N, `guava/TypeVisitor.java`,
 * juzgado FALSO) Y CERRADA ACÁ (Ola O), SIN TOCAR `graph/edges/`: una clase
 * anónima (`new TypeVisitor() {...}`) que SÍ implementa el tipo no genera un
 * nodo `symbol` con nombre propio (`graph/symbols.ts#record` sólo registra
 * declaraciones con `nameNode`, verificado leyendo ese archivo — un
 * `object_creation_expression` con `class_body` nunca lo tiene), así que el
 * grafo de herencia NUNCA va a poder contarla como un segundo implementador
 * CON NOMBRE — ESO sigue siendo un punto ciego real de extracción
 * (`graph/symbols.ts`/`graph/edges/herencia.ts`/`interfaz-declarada.ts`),
 * fuera de este archivo, y no se toca acá (frente ajeno, ver el informe de
 * esta ola bajo "PIDO A OTRO FRENTE").
 *
 * PERO no hace falta un nodo con nombre para saber que el implementador
 * "único" es mentira: `new TypeVisitor() {...}` es, sintácticamente, una
 * INSTANCIACIÓN de `TypeVisitor` (`object_creation_expression.type`), y esa
 * forma YA la captura `graph/edges/instanciacion.ts` — el mismo extractor
 * de la arista `instantiates` que usa `scattered-instantiation.ts`, sin
 * ningún cambio — sea o no que el sitio tenga un `class_body` colgando
 * (`instanciacion.ts` no mira ese campo en absoluto). Verificado por grep
 * directo sobre el corpus real (no supuesto): guava tiene 4 sitios reales
 * `new TypeVisitor() {...}` fuera de comentarios/javadoc
 * (`TypeResolver.java:133`, `Types.java:175`, `TypeToken.java:872,1109`), y
 * `scattered-instantiation.ts` YA usa esta MISMA arista sobre el MISMO tipo
 * de caso (`Ticker` de guava, abstracto, 3 subclases anónimas
 * `new Ticker() {...}`, ver su propio veredicto juzgado en
 * `tests/golden/precision/guava.verdicts.csv`) — la evidencia de que
 * `instantiates` SÍ dispara sobre construcción de un tipo abstracto/interfaz
 * con cuerpo anónimo ya está confirmada en el corpus, no es una suposición
 * de este archivo. Este detector reusa esa MISMA arista, ya en el grafo, sin
 * agregar ningún `EdgeKind` nuevo ni tocar ningún extractor: ver
 * `directlyInstantiatedTargets`/"CON QUÉ SE CONFUNDE" (3) más abajo. Sube
 * VERDADEROS (recall del conteo de implementadores), no sólo baja falsos: un
 * candidato que sobrevive esta compuerta es más confiablemente especulativo,
 * no sólo "no cayó en esta trampa puntual".
 *
 * PROVENANCE: `extends`/`implements` son SIEMPRE `provenance: "declared"`
 * (extracción sintáctica directa desde `herencia.ts`/`interfaz-declarada.ts`
 * — confirmado leyendo esos archivos: no pasan por la cascada de
 * `resolve.ts`, así que la brecha de `path-proximity` en Java, que domina
 * ESA cascada para las aristas `references`, NO les aplica — es un
 * mecanismo completamente distinto). `satisfies` (`graph/edges/
 * satisfies-derive.ts`) NUNCA es una declaración del programador: es
 * `"inferred"` cuando la contención de firmas es estricta y `"ambiguous"`
 * cuando los dos conjuntos son IGUALES (la derivación emite las dos
 * direcciones y no midió ninguna — Ola Q, ver el docstring de ese archivo).
 * Requisito 7 de la tarea ("ojo con Java: considerá exigir provenance
 * declared/resolved para confianza alta") no aplica LITERAL porque
 * `path-proximity` no toca estas tres aristas — pero el espíritu sí aplica, y
 * desde la Ola Q se aplica ENTERO y no como una rebaja de severidad: una
 * arista estructural refuta la unicidad pero no la establece (ver "UNA ARISTA
 * ESTRUCTURAL NO SOSTIENE UNA AFIRMACIÓN NOMINAL", más abajo).
 *
 * *** CON QUÉ SE CONFUNDE — declarado en el docstring, no opcional. ***
 * Fowler & Beck, mismo capítulo: una interfaz/clase base con UN solo
 * implementador NO es un smell cuando:
 *   1. EXISTE PARA TESTEAR CON DOBLES: la interfaz separa un colaborador
 *      real de su doble de test (mock/fake/stub) — el "único implementador"
 *      de HOY es a propósito, para que un SEGUNDO implementador (el doble,
 *      en el árbol de test) pueda existir sin acoplar el test al tipo
 *      concreto. Señal heurística GENÉRICA (una regex de vocabulario
 *      compartido aplicada IDÉNTICAMENTE a todo lenguaje, mismo estilo que
 *      `LOOP_WORD` de `code-grammar.ts` — nunca una lista por lenguaje):
 *      el path del ÚNICO implementador matchea `TEST_DOUBLE_PATH` — severidad
 *      reducida, NUNCA descartado (podría ser justo lo contrario: una
 *      interfaz de producción que sólo el test dobla, que sigue siendo
 *      especulativa en el código de producción).
 *   2. ES UNA FRONTERA DE MÓDULO PÚBLICA: la interfaz se usa como TIPO
 *      (parámetro, campo, retorno) desde archivos DISTINTOS del único
 *      implementador — evidencia ESTRUCTURAL real, no textual: se cuenta
 *      cuántos archivos, aparte del implementador, tienen una arista
 *      `references` apuntando al nodo candidato. Si ese conjunto no está
 *      vacío, el contrato se consume desde más de un lugar aunque sólo lo
 *      satisfaga una clase — severidad reducida, mismo criterio que (1):
 *      evidencia visible en el `detail`, nunca un descarte silencioso.
 *   3. EL PROPIO CANDIDATO SE INSTANCIA DIRECTAMENTE EN ALGÚN LUGAR DEL
 *      REPO (`directlyInstantiatedTargets`, Ola O) — a diferencia de (1)/(2),
 *      ACÁ SÍ SE DESCARTA por completo, no se rebaja severidad: es evidencia
 *      estructural de mayor peso, no una heurística de confianza. Dos casos
 *      MEDIDOS, con causa raíz distinta pero la MISMA firma en el grafo (una
 *      arista `instantiates` confiable — `declared`/`resolved`, nunca
 *      `inferred`/`ambiguous` — apuntando al nodo candidato):
 *        (a) IMPLEMENTADOR ANÓNIMO OCULTO: si el candidato es una interfaz/
 *            clase abstracta (Java/C#), NO se puede escribir `new I(...)`
 *            sin cuerpo — la ÚNICA forma válida es una clase anónima que la
 *            implementa ahí mismo (`new TypeVisitor() { ... }`). Una
 *            `instantiates` sobre el candidato es, con esta certeza
 *            sintáctica, la prueba de un implementador REAL que el grafo de
 *            herencia no puede nombrar (ver la ceguera de clases anónimas,
 *            arriba en este docstring) — el "único implementador" ya es
 *            falso, hay al menos dos. Medido: `guava/TypeVisitor.java`
 *            (`TypeMappingIntrospector` con nombre + 4 sitios
 *            `new TypeVisitor() {...}` anónimos).
 *        (b) LA ABSTRACCIÓN YA ES ÚTIL POR SÍ SOLA: si el candidato es una
 *            clase base concreta (no abstracta) que TAMBIÉN se instancia
 *            directamente en algún archivo, el "contrato" no está esperando
 *            especulativamente a un segundo implementador — ya cumple una
 *            función propia, y la única subclase es una ESPECIALIZACIÓN
 *            real, no generalidad hipotética (Fowler exige que la
 *            generalidad sea HIPOTÉTICA para calificar como smell). Medido,
 *            par simétrico: `click/types.py` — `IntParamType`/`FloatParamType`
 *            se instancian ellas mismas al nivel de módulo (`INT =
 *            IntParamType()`, `FLOAT = FloatParamType()`) y CADA UNA tiene
 *            además una única subclase real y en uso (`IntRange`/
 *            `FloatRange`, que agregan validación de min/max) — no son
 *            jerarquías especulativas, son clases con un default concreto Y
 *            una especialización.
 *      Un origen distinto entre el `instantiates` y el implementador con
 *      nombre NO hace falta: en (a) da igual si la clase anónima vive en el
 *      MISMO archivo que el implementador con nombre — sigue siendo una
 *      entidad DISTINTA que implementa el contrato. Riesgo declarado, no
 *      escondido: en TypeScript (a diferencia de Java/C#) `class B
 *      implements A` puede apuntar a una clase CONCRETA usada como tipo, y
 *      `new A()` ahí sería una instanciación normal, no una implementación
 *      anónima — este archivo no distingue ese caso (no lee `language`, ver
 *      abajo) y puede descartar de más una jerarquía TS genuinamente
 *      especulativa cuando la interfaz "declarada" es en realidad una clase
 *      concreta instanciada aparte; es una pérdida de RECALL acotada a ese
 *      caso puntual, nunca un falso positivo nuevo (el efecto es no
 *      descartar menos casos, no inventar ninguno).
 *
 * POR QUÉ ACEPTA `provenance: "inferred"` EN EL `instantiates` DE (3) — MEDIDO, no una
 * relajación porque sí, y DISTINTA de la exigencia de `provenance !== "inferred"` que este
 * MISMO archivo aplica en (ninguna otra parte, sólo acá): la primera versión de este arreglo
 * exigía `declared`/`resolved`, igual que `scattered-instantiation.ts#isConfidentInstantiationEdge`
 * — y NO se movió ni un hallazgo en guava. Medido armando el grafo real de guava
 * (`scratchpad/n9/dump-graph.mts`, esta ola): `TypeVisitor` (el caso testigo del encargo) NO
 * tiene ni una sola arista `instantiates` `declared`/`resolved` apuntándole — las 8 (4 sitios
 * reales × 2 copias del árbol, `guava/` y `android/guava/`) resuelven vía `path-proximity`
 * (`graph/resolve.ts`, última etapa de la cascada) porque "TypeVisitor" tiene DOS declaraciones
 * candidatas (una por copia del árbol) y sólo la proximidad de ruta desempata cuál — la MISMA
 * ambigüedad que `scattered-instantiation.ts` ya documenta y MIDE para Java en general
 * ("Java reutiliza nombres simples de clase con mucha frecuencia... esa ambigüedad... sólo la
 * desempata `path-proximity`"). Exigir `declared`/`resolved` acá dejaba el arreglo entero
 * sordo exactamente en el repo/lenguaje que motivó el encargo. La diferencia con `satisfies`
 * (que este archivo YA acepta como `inferred` en otro lado, con severidad reducida): acá no se
 * está afirmando un hecho nuevo de bajo peso — se está usando la arista para CANCELAR una
 * evidencia (0 implementadores nombrados ⇒ especulativo) que la cascada de `path-proximity`
 * resuelve con la MISMA certeza sintáctica que cualquier otra `instantiates` (hubo un `new
 * X(...)` real; lo único incierto es CUÁL de las copias duplicadas del tipo es el destino, y
 * las dos son el MISMO tipo lógico) — no hay manera de que una `instantiates` inferida por
 * `path-proximity` sea una fabricación (a diferencia de una referencia por nombre suelto que
 * podría apuntar a cualquier cosa): el nodo texto (`new TypeVisitor() {...}`) existe, tiene que
 * apuntar a ALGUNA declaración de ese nombre, y toda declaración candidata en juego es una
 * copia real del mismo tipo. `ambiguous` (cuando ni `path-proximity` desempata) sigue
 * excluida, sin cambios (`confidentEdges`, arriba). Efecto medido en el informe de esta ola
 * (`ola-o/informes/N7.md`): la primera versión (`declared`/`resolved` solamente) bajó guava de
 * 79 a 66 candidatos de `speculative-abstraction` SIN tocar `TypeVisitor` (el caso testigo del
 * encargo seguía listado); con `inferred` aceptado acá, `TypeVisitor` también cae. En los
 * repos SIN duplicación de árbol (nest, newtonsoft-json, click) el resultado de esta relajación
 * es el mismo con o sin ella — ninguna de sus `instantiates` sobre sus propios candidatos
 * medidos llegó por `path-proximity` — así que el cambio es específico de la ambigüedad de
 * nombre por árbol duplicado, no un ensanche general del criterio.
 *
 * SIMPLIFICACIONES DECLARADAS:
 *   - Sólo nodos `kind: "symbol"` con `family: "class-like"` cuentan como
 *     candidato (destino): un método o función no puede ser "implementado".
 *   - Cuenta ORÍGENES DISTINTOS, no aristas: dos aristas del MISMO origen
 *     hacia el mismo destino (p.ej. `implements` + `satisfies` redundantes
 *     sobre el mismo par) no duplican el conteo de implementadores.
 *   - Hermano homónimo (`@n`, mismo criterio que `unused-symbol.ts`): nunca
 *     cuenta como origen ni como destino — ni la sintaxis ni la cascada
 *     pueden distinguirlo de su gemelo canónico.
 *
 * LÍMITES DECLARADOS POR LENGUAJE: ninguno explícito más allá de la brecha
 * de producción de arriba — el detector no lee `language` en ningún punto
 * de su lógica de conteo, sólo `CodeGraphNode`/`CodeGraphEdge` (agnóstico de
 * lenguaje por construcción, mismo argumento que ya usa `dependency-cycle.ts`).
 *
 * SATISFIES REDUNDANTE CON LA FAMILIA YA DECLARADA — bug real, encontrado y
 * arreglado juzgando a mano (no supuesto): muestreando `satisfies` como ÚNICA
 * relación de un candidato (lo que la Ola O llamaba `onlyStructural`; desde la
 * Ola Q ese caso ya no emite nada — ver más abajo) contra el
 * corpus, CUATRO de cuatro casos abiertos resultaron espurios, los cuatro
 * por la MISMA causa raíz — la coincidencia estructural (duck typing, cero
 * declaración del programador) entre dos tipos que YA están conectados por
 * una relación DECLARADA (`extends`/`implements`/`mixes-in`), donde la
 * coincidencia de forma es un subproducto casi tautológico de esa relación,
 * no evidencia independiente de un segundo "implementador":
 *   1. `click/exceptions.py`: candidato `"NoArgsIsHelpError" implementador
 *      "ClickException"` — pero `ClickException` es el ANCESTRO de
 *      `NoArgsIsHelpError` (`NoArgsIsHelpError(UsageError)`,
 *      `UsageError(ClickException)`). Un ancestro "satisface" trivialmente
 *      la forma de su propio descendiente cuando éste no agrega miembros
 *      propios — no es un segundo implementador, es el mismo linaje visto
 *      dos veces.
 *   2. `click/types.py`: `"FloatRange" implementador "_NumberRangeBase"` —
 *      `FloatRange` YA declara `class FloatRange(_NumberRangeBase[...],
 *      FloatParamType)`: el PAR está unido por un `extends` sintáctico
 *      explícito; el `satisfies` entre el mismo par no aporta nada nuevo.
 *   3. `sqlalchemy/orm/unitofwork.py`: `"_SaveUpdateState" implementador
 *      "_DeleteState"` — ambos son HERMANOS bajo `_PostSortRec` (mismo
 *      `__init__`/`execute_aggregate`/`__repr__` porque ambos implementan el
 *      MISMO contrato del ancestro común), no uno "implementando" al otro.
 *   4. `hugo/hugofs/fileinfo.go` vs `hugo/modules/module.go`: dos interfaces
 *      Go SIN RELACIÓN, ambas llamadas `Module`, con forma parcialmente
 *      solapada por COINCIDENCIA de vocabulario del dominio (ambas hablan de
 *      módulos) — caso RESIDUAL que el arreglo de abajo NO cubre (no hay
 *      ninguna arista `extends`/`implements`/`mixes-in` que las conecte,
 *      declarada o no) y que sigue sin solución dentro de este archivo: dos
 *      tipos sin ninguna relación nominal que casualmente comparten forma no
 *      tiene un `required` estructural disponible sin caer en vocabulario de
 *      dominio (prohibido, regla 4) — declarado, no escondido.
 *   Los casos 1-3 comparten una firma verificable: origen y destino YA están
 *   conectados —directa o transitivamente, en cualquier dirección, incluso
 *   vía un ancestro/hermano compartido— por al menos una arista
 *   `extends`/`implements`/`mixes-in` (declarada, nunca `satisfies`). Cuando
 *   eso pasa, la arista `satisfies` adicional entre ese MISMO par se excluye
 *   como evidencia de implementador (`familyConnected`, más abajo): sigue
 *   siendo cierto que hay una relación de tipos ahí, pero ya la cuenta la
 *   arista declarada — sumar la `satisfies` duplicaría (mal) la misma
 *   relación o, como en el caso 1/3, produciría una dirección/par sin
 *   sentido semántico (un ancestro no "implementa" a su descendiente; un
 *   hermano no "implementa" a su hermano). Cubre los casos 1-3 de la lista de
 *   arriba; el caso 4 (tipos sin relación nominal alguna) queda fuera a
 *   propósito — ver el párrafo anterior.
 *
 * *** UNA ARISTA ESTRUCTURAL NO SOSTIENE UNA AFIRMACIÓN NOMINAL — Ola Q (F1),
 * y es el cambio de definición de esta ola. *** El caso 4 de la lista de
 * arriba quedó declarado como "residual, sin solución dentro de este
 * archivo". No era residual: era la regla entera. Medido, no supuesto:
 *
 *   1. *** El grafo NO PUEDE representar un contrato en las gramáticas de
 *      tipado nominal. *** Una firma de método sin cuerpo no produce un nodo
 *      `function-like`, así que una interfaz declarada tiene CERO miembros en
 *      el grafo y nunca llega al mínimo de firmas que `satisfies-derive.ts`
 *      exige para ser objetivo. Verificado sobre el grafo de producción de
 *      nest: `packages/common/interfaces/exceptions/exception-filter.interface.ts
 *      #ExceptionFilter` y `.../middleware/nest-middleware.interface.ts
 *      #NestMiddleware` tienen, los dos, CERO miembros. Consecuencia: las
 *      1.150 aristas `satisfies` de ese repo emparejan, las 1.150, dos
 *      IMPLEMENTACIONES — jamás una implementación con su contrato. Y guava
 *      (43 mil símbolos) no tiene NI UNA arista `satisfies` en todo el repo.
 *   2. *** La derivación es INCOMPLETA justo en la dirección que fabrica el
 *      "único". *** Ver el límite declarado en `satisfies-derive.ts`: un tipo
 *      cuyo conjunto de firmas el grafo no ve entero no aparece como
 *      candidato, así que el objetivo PIERDE implementadores, nunca gana; y
 *      `SATISFIES_WORK_BUDGET` corta a cobertura PARCIAL por diseño en repos
 *      grandes. Verificado sobre hugo: `watcher/filenotify/filenotify.go
 *      #FileWatcher` tiene DOS implementadores en el código (`filePoller` y
 *      `fsNotifyWatcher`) y la derivación ve UNO. Un conteo de
 *      "exactamente 1" leído sobre una relación documentada como incompleta y
 *      truncada por presupuesto no es sólido en ese sentido.
 *   3. *** Y donde el grafo SÍ ve contratos (las gramáticas que cuelgan los
 *      miembros de un tipo desde afuera de su cuerpo), la subpoblación medida
 *      tampoco tiene verdaderos cerca de la superficie. *** Juzgué a mano 10
 *      de los 36 hallazgos de hugo que se sostienen sólo en `satisfies` y
 *      cuyo objetivo se lee como contrato: 1 verdadero
 *      (`publisher/publisher.go#Publisher`, cuyo propio comentario dice "the
 *      default and currently only publisher") y 9 falsos — Wilson 95 %
 *      [1,8 %, 40,4 %]. Con n=10 el punto no se afirma; lo que sí se afirma
 *      es que la subpoblación no despega del cero del kind.
 *
 * REGLA, y es asimétrica a propósito (es la epistemología normal de una
 * evidencia débil): una arista `satisfies` puede REFUTAR la unicidad — dos
 * tipos con la forma del contrato ya son dos, y eso alcanza para no emitir
 * nada — pero NUNCA puede ESTABLECER por sí sola la afirmación nominal
 * "`X` tiene un único implementador `Y`". Se sigue contando en
 * `implementersByTarget` (por eso refuta); lo que se descarta es el hallazgo
 * cuyo ÚNICO origen llega exclusivamente por `satisfies`. Antes esto era una
 * rebaja de severidad de 10 puntos (`onlyStructural`) sobre un kind que mide
 * 0 %: nombrar la duda en el `detail` no arregla una afirmación que la
 * evidencia no sostiene.
 *
 * QUE LA ASIMETRÍA SEA ASIMÉTRICA IMPORTA, y está medido: sacar aristas del
 * conteo (en vez de sólo prohibirles establecer) CREA hallazgos nuevos —un
 * objetivo con dos implementadores baja a uno— y los que aparecen son de la
 * misma familia fabricada (medido: nest gana `MqttBroadcastController` /
 * `NatsBroadcastController` / `RedisBroadcastController` "implementados" por
 * `RMQBroadcastController`). Con la regla asimétrica ese efecto no existe.
 *
 * *** UN CONTRATO NO ES UNA IMPLEMENTACIÓN DE OTRO CONTRATO — Ola S (S1), y
 * es el cambio de esta ola. *** El residuo #1 después del arreglo de la Ola Q
 * es que el "único implementador" ES OTRA INTERFAZ: `interface B extends A`
 * entre DOS interfaces entraba al conteo como si `B` implementara a `A`.
 * `B` no implementa nada — es un contrato MÁS ESTRECHO sobre el mismo
 * contrato, y quien lo implementa de verdad son los tipos que implementan a
 * `B` (cero o muchos, esta pregunta no los mira). El título
 * `"A" tiene un único implementador: "B"` es, literalmente, falso ahí.
 *
 * MEDIDO EN ESTA OLA, sobre el grafo de producción de tres repos (probe
 * propio `scripts/s1-probe-nodetype.mts`; un volcado SE VENCE — esto aísla un
 * DELTA, no publica un absoluto), clasificando cada candidato por la FORMA
 * GRAMATICAL de su origen y su destino:
 *
 *   | repo   | candidatos | origen = interfaz |
 *   |--------|-----------:|------------------:|
 *   | hugo   |         27 |    27 (100 %, Go) |
 *   | vueuse |         40 |    40 (100 %, TS) |
 *   | nest   |         26 |      7 (27 %, TS) |
 *
 * POR QUÉ NO SE PODÍA VER HASTA AHORA: `SymbolFamily` colapsa clase, struct,
 * record e interfaz en `"class-like"` — lo dice el propio
 * `graph/edges/satisfies-derive.ts` ("El grafo NO tiene esa distinción"). El
 * hecho lo traía la gramática VERBATIM desde siempre en
 * `SymbolFacts.nodeType` y se quedaba del lado de la extracción; esta ola lo
 * copia al nodo (`CodeGraphNode.nodeType`/`shapeNodeType`), que es exactamente
 * la misma operación que la Ola P hizo con `memberOfClassLike`/`exported`.
 * `shapeNodeType` es el mismo hecho un nivel más abajo para la única gramática
 * que no lo escribe en el nodo declarante (Go: `type_spec` →
 * `interface_type`/`struct_type`) — ver el docstring de ese campo.
 *
 * Y LA REGLA ES ASIMÉTRICA, por el MISMO motivo medido que la de `satisfies`
 * de acá arriba: la arista se sigue CONTANDO en `implementersByTarget` (un
 * sub-contrato refuta la unicidad igual que cualquier otro origen); lo único
 * que se prohíbe es que ESTABLEZCA la afirmación nominal. Sacarla del conteo
 * habría CREADO hallazgos nuevos — un objetivo con una interfaz hija y una
 * clase hija bajaría a "un único implementador" — que es la trampa que la Ola
 * Q ya midió y evitó.
 *
 * LO QUE ESTA REGLA NO ES: una lista de nombres de dominio. `INTERFACE_SHAPE`
 * es vocabulario de GRAMÁTICA (mismo estatuto que `GO_TYPE_SPEC_WORD`/
 * `RECORD_NODE_WORD` de `code-grammar.ts`), aplicado idéntico a todo lenguaje
 * sobre un string que escribió la gramática, nunca sobre el nombre del
 * símbolo. Y NO distingue clase abstracta: `abstract_class_declaration` (TS)
 * y una clase base Java abstracta SIGUEN contando como implementador, porque
 * una clase base abstracta con una única subclase concreta es exactamente el
 * caso de Fowler que este detector existe para encontrar — medido en nest: 2
 * candidatos `abstract_class_declaration <- class_declaration`, intactos.
 *
 * LÍMITE DECLARADO: una gramática que no distinga contrato de implementación
 * en ningún nodo deja este criterio en silencio (no hay `no` posible, sólo
 * "no sé") — Ruby, Python y JavaScript no tienen la construcción, así que
 * ahí la regla nunca dispara y el detector se comporta igual que antes.
 *
 * `needsAnyEdge` SIGUE declarando `satisfies` a propósito: es una compuerta OR
 * de aplicabilidad, `satisfies` sigue participando del análisis (refuta), y la
 * lista está CONGELADA en `detect/language-coverage.test.ts`
 * (`NEEDS_ANY_EDGE_DECLARADOS`), que no es un archivo de este frente — ver
 * "PIDO A OTRO FRENTE" en el informe de F1.
 *
 * ÁRBOL ESPEJO (paquete ESPEJO-DUPLICACION) — VERIFICADO contra fuente en
 * guava (revisión adversarial previa, "GRAFO#3"): con las 6 aristas
 * tipadas cableadas del lado productor, `"KeySet" tiene único implementador
 * "SortedKeySet"` y `"Negated" tiene único implementador "NegatedFastMatcher"`
 * son hallazgos CORRECTOS (no falsos: la relación existe de verdad) pero
 * aparecen DOS VECES cada uno — una por copia de `Maps.java`/
 * `CharMatcher.java` en `guava/` y otra en `android/guava/`. Reproducido:
 * sobre un recorte real de guava, exactamente 2+2 (ver el resultado de la
 * tarea). A diferencia de `duplication.ts`/`distributed-duplication.ts`
 * (que colapsan `CloneCandidate`s ANTES de agrupar), acá no hay fingerprints
 * que agrupar — el colapso ocurre DESPUÉS de construir los `RawFinding[]`:
 * dos hallazgos cuyo (target, origin) cae, módulo `canonicalFile`
 * (`../mirror-tree.js`), en el MISMO par (archivo, símbolo) se colapsan a
 * uno solo — se reporta una vez, no dos, nunca se descarta el hallazgo.
 * `clones` es un parámetro OPCIONAL (default `[]`, no-op): ningún test
 * existente de este archivo pasa `RepoUnit.clones`, así que agregarlo no les
 * rompe nada; `detector.run` sí pasa `repo.clones` en producción.
 */
import { canonicalFile, detectMirrorTrees } from "../mirror-tree.js";
import { presencia, presupuesto } from "../thresholds.js";
import type { Threshold } from "../thresholds.js";
import type { CodeGraph, CodeGraphEdge, CodeGraphNode } from "../../graph/types.js";
import type { CloneCandidate, InterFileDetector, RawFinding, RepoUnit, RunContext } from "../types.js";
import { confidentEdges } from "./confident-edges.js";

type ThresholdKey = "presence";

/** Las tres aristas "X es-un Y" — ver docstring del módulo. */
const IMPLEMENTER_EDGE_KINDS: ReadonlySet<CodeGraphEdge["kind"]> = new Set(["extends", "implements", "satisfies"]);

/** Aristas DECLARADAS (nunca `satisfies`) que arman la FAMILIA nominal de un tipo —
 *  ver "SATISFIES REDUNDANTE CON LA FAMILIA YA DECLARADA" en el docstring del módulo. */
const FAMILY_EDGE_KINDS: ReadonlySet<CodeGraphEdge["kind"]> = new Set(["extends", "implements", "mixes-in"]);

/**
 * Vocabulario GENÉRICO compartido (no lista por lenguaje), mismo estilo que
 * `LOOP_WORD`/`EXCEPTION_WORD` de `code-grammar.ts`: un segmento de ruta que
 * dice "esto vive en el árbol de test/dobles". Ver "CON QUÉ SE CONFUNDE" (1).
 */
const TEST_DOUBLE_PATH = /(^|[/_-])(tests?|specs?|mocks?|fakes?|stubs?|doubles?)([/_.-]|$)/i;

/**
 * Vocabulario de GRAMÁTICA (no de dominio, no una lista por lenguaje): el
 * tipo de nodo con el que una gramática declara un CONTRATO en vez de una
 * implementación. Se aplica al string que escribió la gramática
 * (`CodeGraphNode.shapeNodeType ?? nodeType`), jamás al nombre del símbolo —
 * ver "UN CONTRATO NO ES UNA IMPLEMENTACIÓN DE OTRO CONTRATO" en el docstring
 * del módulo. Valores REALES observados en el grafo de producción del corpus
 * (medidos, no listados de memoria): `interface_declaration`
 * (typescript/java/csharp) e `interface_type` (go, vía `shapeNodeType`).
 * `abstract_class_declaration` NO matchea a propósito — una clase base
 * abstracta con una sola subclase es el caso que este detector busca.
 */
const INTERFACE_SHAPE = /(^|_)interface(_|$)/;

/**
 * La FORMA declarada de un tipo, tal cual la escribió la gramática:
 * `shapeNodeType` cuando la gramática la puso en un hijo del nodo declarante
 * (Go), el `nodeType` del propio nodo en todas las demás. Ver
 * `CodeGraphNode.shapeNodeType` (`graph/types.ts`), "CÓMO SE LEE".
 */
function isDeclaredContract(node: CodeGraphNode): boolean {
  const shape = node.shapeNodeType ?? node.nodeType;
  return shape !== undefined && INTERFACE_SHAPE.test(shape);
}

/** Presencia, no magnitud: exactamente 1 implementador es TODO el hallazgo —
 *  mismo patrón que `orphan-file.ts`/`unused-symbol.ts`. */
const PRESENCE_SPEC = presencia({
  rationale:
    "el smell de Fowler & Beck ('Speculative Generality') se define por la PRESENCIA de un único implementador, " +
    "no por una magnitud: 0 implementadores es otro problema (código muerto/huérfano, ya cubierto por " +
    "`orphan-file`/`unused-symbol`) y 2+ implementadores ya no es especulativo — no hay un 'cuánto' que umbralizar.",
});

/**
 * CONTRATO-F4.md §1.8: tope de VOLUMEN propio, no de detección.
 *
 * OLA X (B3) — MEDIDO Y DEJADO EN 100. Este kind SÍ está saturado hoy, y sólo en guava (el
 * único de los 13 repos donde ocurre — medido con `b3-saturation.mts` sobre el `DetectorCoverage`
 * y cruzado con el dump independiente de otro frente, `scratchpad/b2/guava-actual.json`): con
 * el tope en 100, `n=100`, `status: "presupuesto-agotado"`. Corrí el experimento aislado que
 * pide la ola (apagado/prendido, un solo cambio, un solo repo): subí el tope a 1000 y repetí
 * la MISMA corrida de guava (`scripts/dump-hallazgos.mts`, 630,6 s, cache MISS por el cambio de
 * huella del analizador). Resultado, `n` real:
 *
 *   · con tope 100: 100 hallazgos, 17 con hipótesis, 17 `ya-aplicado`, **0 recomendaciones**.
 *   · con tope 1000 (=población real, 120 < 1000): 120 hallazgos, 21 con hipótesis,
 *     21 `ya-aplicado`, **0 recomendaciones**.
 *
 * Delta: +20 hallazgos, +4 hipótesis, **+0 `ausente`/`parcial`, +0 verdaderos** — los 4
 * candidatos nuevos mueren en el mismo lugar que los 17 anteriores. Coincide al dígito con
 * `A2.md` (Ola X, sonda de embudo independiente, corpus completo, "pre-topes"): sobre los
 * 13 repos con población YA sin ningún tope de `detect/` — 234 candidatos, más del doble de lo
 * que este tope deja pasar en guava sola — el 74 % muere en `build()` antes de llegar a una
 * sola compuerta, y el resto sale 100 % `ya-aplicado`. Prototype no tiene 0 recomendaciones por
 * falta de volumen; las tiene por diseño de `hypotheses/prototype.ts` (el ancla no resuelve
 * nodo en el grafo — ver `PLAN-INTENCIONES.md §13`), archivo que no es mío. **Devuelto a 100**:
 * subir este tope no suma cobertura, sólo ruido al panel — exactamente el caso que
 * `RAICES.md` PENDIENTE 0-TER pedía medir, y ya está medido con el número.
 */
const MAX_FINDINGS_SPEC = presupuesto(100, {
  rationale:
    "un panel legible no lista de forma útil más de un centenar de interfaces/clases base con un solo " +
    "implementador a la vez; es un tope de volumen, no un umbral de detección. (Ola X/B3: medido con el " +
    "tope levantado — ver docstring arriba — y devuelto a 100 porque subirlo no agrega ni una " +
    "recomendación, sólo población que muere en `hypotheses/prototype.ts`.)",
});

function isDuplicateSibling(id: string): boolean {
  return /@\d+$/.test(id);
}

function symbolName(node: CodeGraphNode): string {
  return node.symbolPath[node.symbolPath.length - 1] ?? "?";
}

function isCandidateTarget(node: CodeGraphNode | undefined): node is CodeGraphNode {
  return !!node && node.kind === "symbol" && node.family === "class-like" && !isDuplicateSibling(node.id);
}

/**
 * Union-find mínimo (unión por rango, compresión de camino) sobre las
 * aristas DECLARADAS de familia (`FAMILY_EDGE_KINDS`) — no dirigido: para
 * esta pregunta ("¿origen y destino ya están conectados por herencia,
 * directa o transitivamente, en cualquier dirección?") la dirección de
 * `extends`/`implements`/`mixes-in` no importa, sólo la conectividad. Ver
 * "SATISFIES REDUNDANTE CON LA FAMILIA YA DECLARADA" en el docstring del
 * módulo.
 */
class FamilyUnionFind {
  private readonly parent = new Map<string, string>();

  private find(id: string): string {
    const p = this.parent.get(id);
    if (p === undefined) {
      this.parent.set(id, id);
      return id;
    }
    if (p === id) return id;
    const root = this.find(p);
    this.parent.set(id, root);
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }

  /** `false` cuando ninguno de los dos apareció nunca en una arista de familia — no son "la misma familia", son ajenos el uno al otro. */
  connected(a: string, b: string): boolean {
    if (!this.parent.has(a) || !this.parent.has(b)) return false;
    return this.find(a) === this.find(b);
  }
}

function buildFamilyUnionFind(graph: CodeGraph): FamilyUnionFind {
  const uf = new FamilyUnionFind();
  for (const edge of confidentEdges(graph)) {
    if (!FAMILY_EDGE_KINDS.has(edge.kind)) continue;
    if (isDuplicateSibling(edge.from) || isDuplicateSibling(edge.to)) continue;
    if (edge.from === edge.to) continue; // auto-bucle de resolución — ver `analyzeGraph`
    uf.union(edge.from, edge.to);
  }
  return uf;
}

/**
 * Agrupa las tres aristas "es-un" por destino, junto con el conjunto de
 * archivos (aparte del/de los implementadores) que referencian el nodo
 * candidato — evidencia estructural para "CON QUÉ SE CONFUNDE" (2) — y el
 * conjunto de candidatos que son ELLOS MISMOS destino de una `instantiates`
 * confiable — evidencia para "CON QUÉ SE CONFUNDE" (3), ver el docstring del
 * módulo. Una sola pasada por `graph.edges`, O(E).
 */
function analyzeGraph(graph: CodeGraph): {
  readonly implementersByTarget: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<CodeGraphEdge["kind"]>>>;
  readonly referencingFilesByTarget: ReadonlyMap<string, ReadonlySet<string>>;
  readonly directlyInstantiatedTargets: ReadonlySet<string>;
} {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const implementersByTarget = new Map<string, Map<string, Set<CodeGraphEdge["kind"]>>>();
  const referencingFilesByTarget = new Map<string, Set<string>>();
  const directlyInstantiatedTargets = new Set<string>();
  const familyUnionFind = buildFamilyUnionFind(graph);

  // `confidentEdges` excluye `ambiguous` (CONTRATO-F9.md §4.5: fuera de toda consulta por defecto)
  // — a diferencia de `inferred` (que este detector SÍ cuenta a propósito: `satisfies` es siempre
  // `inferred`, ver "SATISFACCIÓN ESTRUCTURAL" en el docstring del módulo), `ambiguous` no es "un
  // implementador de baja confianza", es "no sabemos si esto implementa nada en particular".
  for (const edge of confidentEdges(graph)) {
    if (IMPLEMENTER_EDGE_KINDS.has(edge.kind)) {
      if (isDuplicateSibling(edge.from) || isDuplicateSibling(edge.to)) continue;
      // AUTO-BUCLE: un tipo no es su propio implementador. Ningún extractor
      // emite esto — lo fabrica la RESOLUCIÓN, cuando el supertipo escrito
      // lleva un calificador ajeno al repo y el nombre simple coincide con el
      // del propio declarante (`click/_textwrap.py`:
      // `class TextWrapper(textwrap.TextWrapper)`, medido en la Ola P: la
      // única declaración de ese nombre en el repo es la propia clase, así
      // que `graph/build.ts#buildTypedEdgeCandidatesForFile` —que, a
      // diferencia de `buildCandidatesForFile`, no filtra la auto-referencia—
      // resuelve el candidato contra sí mismo). Sin esta guarda el hallazgo
      // sale literalmente como `"TextWrapper" tiene un único implementador:
      // "TextWrapper"`. La raíz vive en `graph/build.ts` (pedido abierto
      // desde la Ola N, "auto-referencia mismo archivo/símbolo"); acá se
      // descarta la evidencia, que es cierto sea cual sea el arreglo de allá.
      if (edge.from === edge.to) continue;
      // `satisfies` redundante con una relación de familia YA declarada entre este MISMO par —
      // ver "SATISFIES REDUNDANTE CON LA FAMILIA YA DECLARADA" en el docstring del módulo: no
      // aporta evidencia independiente de un segundo implementador, es un subproducto de la
      // relación declarada (ancestro/hermano) que ya existe entre `edge.from` y `edge.to`.
      if (edge.kind === "satisfies" && familyUnionFind.connected(edge.from, edge.to)) continue;
      const target = nodeById.get(edge.to);
      const origin = nodeById.get(edge.from);
      if (!isCandidateTarget(target) || !origin) continue;
      let byOrigin = implementersByTarget.get(edge.to);
      if (!byOrigin) {
        byOrigin = new Map();
        implementersByTarget.set(edge.to, byOrigin);
      }
      let kinds = byOrigin.get(edge.from);
      if (!kinds) {
        kinds = new Set();
        byOrigin.set(edge.from, kinds);
      }
      kinds.add(edge.kind);
    } else if (edge.kind === "references") {
      const target = nodeById.get(edge.to);
      const origin = nodeById.get(edge.from);
      if (!isCandidateTarget(target) || !origin) continue;
      let files = referencingFilesByTarget.get(edge.to);
      if (!files) {
        files = new Set();
        referencingFilesByTarget.set(edge.to, files);
      }
      files.add(origin.file);
    } else if (edge.kind === "instantiates") {
      // Evidencia POSITIVA de un implementador oculto/de una abstracción ya útil por sí sola —
      // ver "CON QUÉ SE CONFUNDE" (3) y "POR QUÉ ACEPTA INFERRED" en el docstring del módulo:
      // `ambiguous` ya la sacó `confidentEdges` (CONTRATO-F9.md §4.5), pero `inferred` SÍ
      // cuenta acá — a propósito, DISTINTO del criterio de
      // `scattered-instantiation.ts#isConfidentInstantiationEdge` — porque `path-proximity`
      // resolviendo entre copias duplicadas del MISMO tipo (guava/ vs android/guava/) sigue
      // siendo evidencia válida de que ALGUNA copia se construye. `@n` no aplica: `instantiates`
      // nunca apunta a un hermano homónimo con sufijo (misma cascada que las tres de arriba),
      // pero se descarta igual por si acaso el origen sí lo fuera — consistencia con el resto
      // de este barrido.
      if (isDuplicateSibling(edge.from) || isDuplicateSibling(edge.to)) continue;
      if (isCandidateTarget(nodeById.get(edge.to))) directlyInstantiatedTargets.add(edge.to);
    }
  }

  return { implementersByTarget, referencingFilesByTarget, directlyInstantiatedTargets };
}

/** Único lugar que arma los `RawFinding[]` — separado de `detector.run` para
 *  poder testearlo sin pasar por `RunContext`, mismo patrón que
 *  `buildOrphanFileFindings`/`findDependencyCycles` en los detectores hermanos. */
export function buildSpeculativeAbstractionFindings(
  graph: CodeGraph,
  presence: Threshold,
  clones: readonly CloneCandidate[] = [],
): RawFinding[] {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const { implementersByTarget, referencingFilesByTarget, directlyInstantiatedTargets } = analyzeGraph(graph);
  // Árbol espejo: dos hallazgos cuyo (destino, origen) cae, módulo
  // `canonicalFile`, en el mismo par (archivo, símbolo) son la copia repetida
  // de la MISMA relación real — se colapsan acá, DESPUÉS de construir el
  // `RawFinding`, ver el docstring del módulo.
  const mirrorTrees = detectMirrorTrees(clones);
  const seenMirrorKeys = new Set<string>();
  const findings: RawFinding[] = [];

  const sortedTargets = [...implementersByTarget.keys()].sort();
  for (const targetId of sortedTargets) {
    const byOrigin = implementersByTarget.get(targetId)!;
    if (byOrigin.size !== 1) continue; // 0 ⇒ imposible acá (nunca se crea la entrada); 2+ ⇒ ya no es especulativo
    // "CON QUÉ SE CONFUNDE" (3), ver el docstring del módulo: el propio candidato es destino de
    // una `instantiates` confiable — o hay un implementador anónimo que el grafo no puede nombrar
    // (guava/TypeVisitor), o la abstracción ya es útil por sí sola y la única subclase es una
    // especialización real, no generalidad hipotética (click/IntParamType-IntRange). Descarte
    // completo, no rebaja de severidad: es evidencia estructural, no una heurística de confianza.
    if (directlyInstantiatedTargets.has(targetId)) continue;

    const target = nodeById.get(targetId);
    if (!target) continue; // defensivo: no debería pasar, `isCandidateTarget` ya lo filtró al construir el mapa

    const [[originId, kinds]] = byOrigin;
    // UNA ARISTA ESTRUCTURAL NO SOSTIENE UNA AFIRMACIÓN NOMINAL (Ola Q) — ver
    // el docstring del módulo: `satisfies` es coincidencia de conjuntos de
    // firma, derivada por `graph/edges/satisfies-derive.ts` de forma
    // declaradamente INCOMPLETA y truncada por presupuesto. Refuta la unicidad
    // (ya se contó en `implementersByTarget`, más arriba), nunca la establece.
    if (kinds.size === 1 && kinds.has("satisfies")) continue;
    const origin = nodeById.get(originId);
    if (!origin) continue;
    // UN CONTRATO NO ES UNA IMPLEMENTACIÓN DE OTRO CONTRATO (Ola S) — ver el
    // docstring del módulo: `interface B extends A` dice que `B` ESTRECHA el
    // contrato de `A`, no que lo implemente; los implementadores reales de `A`
    // son los de `B`, que esta pregunta no mira. Misma asimetría que
    // `satisfies` de acá arriba: la arista ya se contó (refuta la unicidad),
    // lo que se prohíbe es que la ESTABLEZCA.
    if (isDeclaredContract(origin)) continue;

    const targetName = symbolName(target);
    const originName = symbolName(origin);

    // Árbol espejo: si (destino, origen) ya se reportó desde el par gemelo
    // de estos archivos (mismo símbolo, mismo rol), es la MISMA relación
    // real vista dos veces — colapsar a una, no descartarla.
    const mirrorKey = `${canonicalFile(mirrorTrees, target.file)}#${targetName}::${canonicalFile(mirrorTrees, origin.file)}#${originName}`;
    if (seenMirrorKeys.has(mirrorKey)) continue;
    seenMirrorKeys.add(mirrorKey);

    const viaExtends = kinds.has("extends");
    const kindLabel = viaExtends ? "clase base" : "interfaz";

    const isTestDouble = TEST_DOUBLE_PATH.test(origin.file);
    const otherConsumerFiles = [...(referencingFilesByTarget.get(targetId) ?? [])].filter((f) => f !== origin.file);
    const looksLikePublicBoundary = otherConsumerFiles.length > 0;

    let severity = 45;
    if (isTestDouble) severity -= 20;
    if (looksLikePublicBoundary) severity -= 15;
    severity = Math.max(10, Math.min(100, severity));

    const detailParts = [
      `"${targetName}" es ${kindLabel} de un único tipo, "${originName}" (${origin.file}): cada consulta al ` +
        "contrato tiene, en los hechos, una sola forma posible detrás — la indirección de la abstracción no " +
        "compra flexibilidad todavía, sólo un salto extra al leer el código.",
    ];
    if (isTestDouble) {
      detailParts.push(
        `Confianza reducida: "${originName}" vive en una ruta con forma de test/doble (${origin.file}) — es el ` +
          "patrón esperado cuando la abstracción existe para poder sustituir un colaborador real por un mock/fake " +
          "en producción; verificar si el implementador de PRODUCCIÓN también es único antes de actuar.",
      );
    }
    if (looksLikePublicBoundary) {
      detailParts.push(
        `Confianza reducida: ${otherConsumerFiles.length} archivo(s) además de "${origin.file}" referencian ` +
          `"${targetName}" directamente (probable uso como frontera de módulo pública/tipo de parámetro), aunque ` +
          "sólo una clase lo implemente hoy.",
      );
    }

    findings.push({
      title: `"${targetName}" tiene un único implementador: "${originName}"`,
      detail: detailParts.join(" "),
      trigger: [{ label: "implementadores distintos", value: byOrigin.size, threshold: presence }],
      evidence: [{ label: "archivos que referencian el contrato aparte del implementador", value: otherConsumerFiles.length }],
      locations: [
        {
          file: target.file,
          startLine: target.startLine ?? 1,
          endLine: target.endLine ?? target.startLine ?? 1,
          symbol: targetName,
          role: `${kindLabel} con un solo implementador`,
          anchor: { file: target.file, symbolPath: target.symbolPath },
        },
        {
          file: origin.file,
          startLine: origin.startLine ?? 1,
          endLine: origin.endLine ?? origin.startLine ?? 1,
          symbol: originName,
          role: "único implementador",
          anchor: { file: origin.file, symbolPath: origin.symbolPath },
        },
      ],
      severity,
      advice: {
        primary: {
          name: "Collapse Hierarchy",
          kind: "refactorizacion",
          why:
            "Si de verdad no hay (ni se espera pronto) un segundo implementador, fusionar la abstracción con su " +
            "único implementador elimina la indirección sin perder nada; si el segundo implementador SÍ está " +
            "planeado a corto plazo, documentarlo es más barato que dejar la duda sin marcar.",
          source: "https://refactoring.guru/es/smells/speculative-generality",
        },
      },
    });
  }

  return findings;
}

export const detector: InterFileDetector<ThresholdKey, "speculative-abstraction"> = {
  id: "speculative-abstraction",
  kind: "speculative-abstraction",
  scope: "inter-file",
  needsGraph: true,
  title: "Abstracción especulativa",
  // Precondición NECESARIA (no suficiente) para que exista CUALQUIER arista
  // extends/implements/satisfies: el lenguaje tiene que distinguir una unidad
  // tipo-clase de una función en absoluto — ver "no aplicable sin
  // unidad-tipo-clase" en el test. `needs` es AND-sólo (`run.ts#unionCapabilities`),
  // así que no se puede expresar acá "herencia O interfaz"; se declara la
  // única capacidad que es un prerrequisito real de las tres aristas.
  needs: ["unidad-tipo-clase"],
  // CORREGIDO EN LA OLA 11b (frente B0) — esto vivía mal declarado como
  // `needsEdges` (conjunción) desde la Ola A3, y le costaba al detector 4
  // hallazgos reales en Rails + 1 en `src/` cada vez que al repo le faltaba
  // UN SOLO kind de la lista (Ruby no tiene `implements`/`satisfies`;
  // TypeScript en este repo casi no tiene `extends` real — las 8 ocurrencias
  // heredan de `Error`, un global sin nodo). `analyzeGraph`
  // (`IMPLEMENTER_EDGE_KINDS.has(edge.kind)`, más arriba) cuenta un origen
  // "es-un" con que CUALQUIERA de `extends`/`implements`/`satisfies` lo
  // testimonie — las tres juegan el MISMO ROL, así que un solo kind presente
  // ya alcanza para tener candidatos reales: es alternativa, no conjunción.
  // `references` sólo alimenta el ajuste de confianza "frontera de módulo
  // pública" (2), nunca gatilla el hallazgo — sigue sin declararse.
  // `instantiates` (Ola O, "CON QUÉ SE CONFUNDE" (3)) sólo EXCLUYE un
  // candidato ya armado por las tres de arriba, nunca lo crea — mismo motivo
  // que `references`, declarado en `DELIBERATELY_EXCLUDED` de
  // `needs-edges-audit.test.ts`, no acá. Ver
  // `types.ts#InterFileDetector.needsAnyEdge`, "CÓMO NO VOLVER A
  // CONFUNDIRLO".
  needsAnyEdge: ["extends", "implements", "satisfies"],
  thresholds: {
    presence: PRESENCE_SPEC,
  },
  maxFindings: MAX_FINDINGS_SPEC,
  run(repo: RepoUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const graph = repo.graph;
    // Defensivo: `run.ts#runInterFile` ya filtra `needsGraph && graph ===
    // null` ANTES de llamar a `run()` (reporta `sin-grafo`, nunca invoca esto
    // con grafo nulo) — este `return []` nunca debería ejecutarse en
    // producción, pero `CodeGraph | null` sigue siendo el tipo declarado.
    if (!graph) return [];
    return buildSpeculativeAbstractionFindings(graph, ctx.threshold("presence"), repo.clones);
  },
};
