/**
 * `scattered-instantiation` — instanciación directa dispersa de un mismo tipo
 * concreto (CONTRATO-F5.md Contrato 4; brief original: la señal que ancla
 * Factory Method y Dependency Injection).
 *
 * RELACIÓN (sin jerga de AST): el MISMO tipo concreto (una clase) se
 * construye con `new`/equivalente desde muchos archivos distintos del repo.
 * Cada sitio de construcción ata a ese consumidor con la implementación
 * EXACTA de esa clase — su constructor, sus parámetros, su forma de
 * inicializarse — así que si el tipo alguna vez necesita variar (una
 * implementación distinta, un paso de configuración nuevo, un cambio de
 * firma del constructor), cada uno de esos sitios dispersos tiene que
 * cambiar por separado. Concentrar la construcción en UN lugar (una fábrica,
 * un contenedor de inyección) es precisamente lo que evita ese acoplamiento
 * repetido.
 *
 * ARISTA REQUERIDA: `instantiates` (`graph/types.ts#EdgeKind`,
 * `graph/edges/instanciacion.ts`). Sólo se cuentan aristas con provenance
 * `declared`/`resolved` — se EXCLUYEN a propósito las `inferred`: una arista
 * de instanciación es evidencia POSITIVA del hallazgo (igual que una arista
 * de referencia en `dependency-cycle.ts`), y lo conservador ante una
 * heurística sin piso de precisión medido es no afirmar, no acusar.
 *
 * *** CORREGIDO — el párrafo anterior de este archivo declaraba dos huecos
 * de infraestructura que ya se cerraron, verificado de nuevo (Ola H4) antes
 * de juzgar nada más: *** (1) `graph/build.ts` SÍ importa y usa
 * `EDGE_EXTRACTORS`, y `code-analyzer.ts` (comentario propio "P5-ARISTAS")
 * pasa `f.edges` desde la Ola 5 — `repo.graph.edges` en producción SÍ puede
 * traer aristas `kind === "instantiates"`, medido directamente con una
 * sonda (`onGraph` callback) sobre `click`: 32 aristas `instantiates`
 * reales, todas `resolved`. (2) `detect/types.ts` SÍ tiene hoy el campo
 * `needsEdges`/el status `sin-aristas` (`InterFileDetector.needsEdges`,
 * `CoverageStatus`), y este mismo archivo lo declara más abajo
 * (`needsEdges: ["instantiates"]`) — el contrato que este párrafo decía
 * ausente ya aterrizó y ya se usa.
 *
 * LA BRECHA REAL, MEDIDA CON LA INFRAESTRUCTURA YA ARREGLADA: agrupando las
 * 32 aristas `instantiates` de `click` por tipo destino, el máximo real de
 * archivos-de-origen-distintos por grupo es 1 (29 grupos, todos tamaño 1) —
 * no hay NINGÚN grupo con 2+ archivos, así que el umbral (`MIN_SITES_SPEC`
 * más abajo) no es lo que impide emitir. En Java la ambigüedad de nombres de
 * clase empuja la resolución hacia `inferred`/`ambiguous` (excluidos a
 * propósito, ver "ARISTA REQUERIDA" arriba), documentado ya por este mismo
 * detector desde la Ola 11a. La instanciación dispersa del mismo tipo
 * concreto es, con evidencia no heurística, genuinamente rara en los 8
 * repos del corpus — no un cableado ausente ni un umbral mal puesto.
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: el criterio es un conteo de aristas del
 * grafo por archivo de origen distinto — cero vocabulario de dominio, cero
 * nombre de clase o carpeta comparado a mano.
 *
 * UMBRAL: el brief original que originó esta tarea proponía ">5 sitios"
 * presentándolo como un umbral publicado. Verificado a propósito para este
 * detector: NO lo es (ninguna búsqueda encontró esa cifra en SonarSource,
 * RuboCop, ni ningún paper de smells) — se usa acá como PISO DECLARADO propio
 * (`pisoDeclarado`, no `citado`), sin atribuírselo a nadie. RECALIBRADO en la
 * Ola 11a de 6 a 3 — ver el comentario de `MIN_SITES_SPEC` más abajo para la
 * causa y la medición.
 *
 * SIMPLIFICACIONES DECLARADAS:
 *  - Se cuentan ARCHIVOS distintos de origen, no ocurrencias crudas: "10
 *    veces en el mismo archivo" no es dispersión, "en 3 archivos distintos"
 *    sí. El total de ocurrencias viaja como `evidence`, sin umbral propio.
 *  - Sólo cuentan como destino nodos `family === "class-like"`: instanciar
 *    algo que no es un tipo declarado en el repo (una librería externa, un
 *    tipo primitivo envuelto) no puede ser destino de esta arista de todos
 *    modos, porque la cascada de resolución sólo ata a símbolos DEL repo.
 *  - Un hallazgo por TIPO CONCRETO (agrega todos sus sitios), no uno por
 *    sitio — mismo criterio que `dependency-cycle.ts` (un hallazgo por
 *    ciclo completo) y `duplication.ts` (uno por fingerprint).
 *
 * CON QUÉ SE CONFUNDE — verificado a mano contra el corpus externo (ver el
 * resultado de esta tarea para el detalle): la MISMA firma estructural
 * ("un tipo concreto, construido con `new`, desde muchos archivos distintos")
 * la produce, de forma perfectamente legítima, DOS patrones bien aplicados
 * que este detector no puede distinguir sólo mirando el grafo:
 *   1. UNA CLASE DE EXCEPCIÓN. Lanzar `throw new MiError(...)` desde
 *      cualquier punto del código que detecta la condición de error es el
 *      uso IDIOMÁTICO de una excepción — concentrar su construcción en una
 *      fábrica no aporta nada. Confirmado a mano en el corpus (ver el
 *      resultado de la tarea): `JsonSerializationException`/`JsonException`
 *      de Newtonsoft.Json se construyen desde 16-19 archivos distintos de la
 *      propia librería, siempre en la forma `throw new X(...)`.
 *   2. UN OBJETO DE VALOR / FIXTURE DE PRUEBA / OBJETO DE CONFIGURACIÓN.
 *      Un tipo simple sin comportamiento que varía intencionalmente (un DTO
 *      de prueba, un objeto de opciones) está PENSADO para construirse en
 *      cada sitio que lo necesita con una combinación distinta de valores; no
 *      hay "la implementación" que una fábrica deba centralizar. Confirmado a
 *      mano: `Product` (fixture de prueba, `TestObjects/Product.cs`) y
 *      `JsonSerializerSettings`/`DefaultContractResolver` (objetos de
 *      configuración/estrategia) se construyen desde 11 a 93 archivos de
 *      prueba de Newtonsoft.Json, cada uno con una combinación de propiedades
 *      distinta para ejercitar un escenario de serialización diferente.
 * Este detector NO intenta filtrar ninguno de los dos (filtrar por "termina
 * en Exception" o "vive en una carpeta de tests" sería exactamente la lista
 * de vocabulario por nombre que la regla 4 prohíbe, aplicada a nombres de
 * clase o de carpeta en vez de nodo de gramática — mismo argumento que
 * `orphan-file.ts` ya documenta para "no filtrar por convención de nombre de
 * archivo"): emite la señal estructural completa como HIPÓTESIS, nunca como
 * afirmación, y el `detail` de cada hallazgo lo dice explícitamente.
 *
 * TERCER CASO, medido esta tarea: STRUCTS DE VALOR DE GO. Con `implements`/
 * `type_spec` recién landeados en el grafo (Ola K), este ancla empezó a
 * disparar sobre structs de valor de Go (`PageGroup`, `TemplateDescriptor`,
 * `configKey`, `simpleCommand`, `context` — verificado a mano en hugo, ver
 * `TABLA-ARISTAS.md` §6) que se construyen en muchos archivos por la MISMA
 * razón idiomática que el caso 2: son datos, no identidad. Mismo argumento
 * que arriba — este detector sigue sin filtrar por vocabulario (ni "termina
 * en X" ni "es un struct de Go") — el filtro correcto vive en el CONSUMIDOR
 * que interpreta la señal como Singleton: `hypotheses/singleton.ts` agrega
 * un `required` que exige al menos UN miembro (de cualquier family)
 * localizable en el grafo para T antes de siquiera candidatear el patrón —
 * cierra los 7 falsos positivos de hugo sin que este archivo tenga que
 * adivinar qué es "un valor" mirando sólo el ancla.
 *
 * CUARTO CASO, y REDEFINICIÓN del criterio (nivel 1, agosto 2026) —
 * PARTICIPACIÓN EN JERARQUÍA: juzgando a mano una muestra fresca (nest,
 * TypeScript; eslint, JavaScript — ver el resultado de esta tarea), los 16
 * hallazgos judged salieron los 16 falsos, y EN LA MITAD de ellos el tipo
 * construido en muchos archivos tenía, él mismo, una arista `extends`
 * saliente: `RuntimeException extends Error`, `HttpException extends
 * IntrinsicException`, `InvalidExceptionFilterException extends
 * RuntimeException`, `UnauthorizedException extends HttpException`,
 * `WsException extends Error`, `InternalServerErrorException extends
 * HttpException` (excepciones — mismo idioma que el CASO 1, pero ahora
 * verificado por ESTRUCTURA, no por nombre), y `GuardsContextCreator
 * extends ContextCreator`/`ExpressAdapter extends AbstractHttpAdapter`
 * (variantes de una jerarquía Strategy/Adapter: Express/Fastify son DOS
 * adaptadores concretos bajo el mismo tipo abstracto, cada uno construido
 * una vez por su propio bootstrap — la variedad es DISEÑADA, no accidental).
 * La razón estructural es la MISMA en los dos grupos y es GoF, no una lista
 * de nombres: un tipo que participa en una jerarquía declarada (`extends`/
 * `implements`/`satisfies` SALIENTE — el tipo construido ES-UN/CUMPLE otra
 * cosa) fue diseñado para tener VARIANTES intercambiables bajo un contrato
 * común (Strategy/excepción tipada) — eso es exactamente lo OPUESTO de "un
 * único tipo concreto que debería colapsar a una instancia compartida":
 * si hiciera falta una sola forma, no habría hecho falta la jerarquía. Este
 * mismo argumento —"2+ formas bajo un contrato es diseño, no smell"— es el
 * que `speculative-abstraction.ts` YA aplica en la dirección inversa (2+
 * implementadores de una interfaz descarta la interfaz como candidata,
 * nunca sólo baja su severidad): acá se aplica sobre el CONSTRUCTOR, no
 * sobre el contrato, pero es la misma pregunta. `groupInstantiationsByTarget`
 * excluye como CANDIDATO (nunca cuenta un sitio) todo tipo destino que sea
 * ORIGEN de una arista `extends`/`implements`/`satisfies` con provenance
 * `declared`/`resolved` (nunca `inferred`/`ambiguous` — se exige evidencia
 * positiva de la jerarquía, mismo criterio que el resto de este archivo).
 * NO alcanza a todos los falsos positivos de la muestra: `ESLint`/
 * `WarningService` (API pública documentada / contextos de ejecución
 * separados) y los servicios internos del contenedor de DI de nest sin
 * jerarquía propia (`Injector`, `ApplicationConfig`, `InterceptorsConsumer`…
 * — construidos una vez por "sabor" de bootstrap, sin `extends`) NO
 * participan de ninguna jerarquía declarada, así que esta señal no los
 * toca — quedan como brecha RESIDUAL, declarada, no escondida (ver
 * "LO QUE QUEDA SIN RESOLVER" más abajo). Tampoco resuelve `configKey` de Go
 * (struct de valor SIN jerarquía, usado como clave de mapa) del CASO 3: ese
 * sigue sin una señal estructural disponible en este grafo.
 *
 * BRECHA MEDIDA DESPUÉS DE IMPLEMENTAR EL ARREGLO — re-muestreando nest con
 * el código ya cambiado (no supuesto): `HttpException`/`UnauthorizedException`/
 * `InternalServerErrorException`/`InvalidExceptionFilterException`/
 * `GuardsContextCreator`/`ExpressAdapter` SÍ dejaron de emitirse
 * (`stillPresent: false`, verificado en `tests/golden/precision/nest.
 * verdicts.csv`), pero `RuntimeException extends Error` y `WsException
 * extends Error` SIGUEN emitiéndose — verificado abriendo el grafo real: NO
 * hay ninguna arista `extends` saliente de esas dos clases en absoluto (sólo
 * `satisfies` hacia otras excepciones hermanas). La causa: `Error` es un
 * global del lenguaje sin nodo `symbol` propio en el grafo (no está
 * declarado en ningún archivo de ESTE repo), y `herencia.ts` sólo emite la
 * arista cuando AMBOS extremos resuelven a un nodo real — extender un tipo
 * externo/incorporado (`Error`, `Exception` de Java/C#/Python) es, con esta
 * infraestructura, indistinguible de no extender nada. Es el caso MÁS
 * idiomático de excepción (una sola herencia directa del tipo base del
 * lenguaje) y es precisamente el que este arreglo NO cubre — sólo cubre
 * cadenas donde el supertipo inmediato TAMBIÉN está declarado en el repo
 * (`HttpException extends IntrinsicException`, ambas de nest). Arreglar esto
 * de raíz exigiría que `graph/edges/herencia.ts` emitiera la arista aunque
 * el destino no resuelva a un nodo (un nodo "externo" sintético, o similar)
 * — cambio de `graph/edges/`, fuera del archivo que este frente tiene
 * asignado; se declara acá, no se esconde.
 *
 * LO QUE QUEDA SIN RESOLVER, PROBADO Y DESCARTADO (no por falta de intento):
 * el patrón Builder fluido de Java (`new MapMaker().weakKeys().build()`,
 * guava) necesitaría el TIPO DE RETORNO de cada método —dato que el grafo no
 * lleva (`CodeGraphNode` no tiene `returnType`)—; una utilidad-por-test-case
 * (`EqualsTester`, guava-testlib) o un objeto de configuración sin jerarquía
 * (`JsonSerializerSettings`, C#) necesitarían saber si los ARGUMENTOS de
 * cada sitio de construcción varían entre sí —dato que `instantiates` no
 * captura (sólo cuenta la arista, no compara literales)—; los servicios
 * internos de DI "uno por sabor de contexto" necesitarían saber si los
 * ARCHIVOS QUE CONSTRUYEN son, ellos mismos, puntos de ensamblado
 * alternativos —requeriría una noción de "familia de bootstraps" que este
 * grafo tampoco expone—. Los tres son límites reales de lo que un grafo
 * `nodes`+`edges` sin tipos de retorno, sin argumentos y sin flujo de datos
 * puede responder, no pereza: quedan nombrados para quien toque este archivo
 * después, en vez de escondidos detrás de "no hay más falsos positivos".
 *
 * QUINTO CASO — ARCHIVO AGREGADOR / COMPOSITION-ROOT (Ola de nivel 1, agosto
 * 2026, frente A3a): re-muestreando nest con el arreglo de jerarquía ya
 * aplicado (CUARTO CASO, arriba), 7 de los 13 hallazgos que sobreviven son
 * exactamente el caso textual que motivó esta tarea — "InterceptorsConsumer,
 * HandlerMetadataStorage, ApplicationConfig, PipesConsumer... instanciado por
 * SABOR de contexto de aplicación": `GuardsConsumer`, `GuardsContextCreator`,
 * `InterceptorsConsumer`, `InterceptorsContextCreator`, `PipesConsumer`,
 * `PipesContextCreator`, `ApplicationConfig`. Medido con
 * `scripts/a3a-measure-instantiation-fanout.mts` (script de esta tarea, no
 * productivo) sobre el grafo real: para los 7, **todos y cada uno** de sus
 * archivos de origen construyen, ADEMÁS del tipo en cuestión, entre 6 y 14
 * OTROS tipos concretos distintos en el mismo archivo — `nest-application.ts`,
 * `nest-application-context.ts`, `nest-factory.ts`, `nest-microservice.ts`,
 * `testing-module.builder.ts`: los puntos de ensamblado de CADA "sabor" de
 * bootstrap (HTTP, microservicio, test), que por diseño conocen y construyen
 * DECENAS de piezas concretas juntas. No es dispersión de negocio: es UN
 * ensamblador con fan-out de instanciación alto, contado varias veces porque
 * hay varios "sabores" de ensamblador — mismo concepto, aplicado a
 * construcción en vez de dependencia general, que
 * `coupling-without-abstraction.ts#maxFanoutConsidered` ya usa para excluir
 * el archivo agregador/contenedor de inyección de dependencias como ORIGEN de
 * un par (ver su docstring, "CON QUÉ SE CONFUNDE").
 *
 * EL NÚMERO, MEDIDO (no adivinado): distribución completa del fan-out de
 * instanciación por archivo de origen (cuántos tipos `class-like` DISTINTOS
 * construye cada archivo vía `instantiates` confiable), sobre nest (157
 * archivos que instancian algo, TypeScript) y hugo (271 archivos, Go) —
 * `scripts/a3a-measure-instantiation-fanout.mts`, esta tarea:
 *
 *   | percentil | nest | hugo |
 *   |-----------|-----:|-----:|
 *   | p50       |    1 |    2 |
 *   | p75       |    2 |    3 |
 *   | p90       |    5 |    5 |
 *   | p95       |    9 |    7 |
 *   | p99       |   14 |   17 |
 *
 * Los dos repos coinciden en p90=5 y difieren poco en p95 (7-9) — la misma
 * forma en dos lenguajes y dos tamaños de repo distintos (2158 y 2572
 * archivos). El piso (`MAX_INSTANTIATION_FANOUT_CONSIDERED`, más abajo) queda
 * en 6: apenas por ENCIMA de p90 (no recorta la mayoría "normal" del cuerpo de
 * la distribución) y por DEBAJO de p95 (cae dentro del ~5-10% superior, la
 * misma franja donde viven los ensambladores verificados a mano en ambos
 * repos). Efecto sobre los 7 casos textuales de nest: los 4 archivos de
 * origen de `ApplicationConfig` tienen fan-out [14,9,8,6] — LOS CUATRO caen
 * en o sobre el piso, `ApplicationConfig` deja de emitirse por completo. Los
 * 4 orígenes de cada uno de los 6 tipos `*Consumer`/`*ContextCreator`
 * (guards/interceptors/pipes) tienen fan-out [14,13,13,12] — los CUATRO caen
 * sobre el piso, los 6 tipos dejan de emitirse. `Injector`/
 * `ExecutionContextHost`/`ContextUtils`/`MetadataScanner`/`InstanceWrapper`/
 * `HandlerMetadataStorage` bajan de sitios pero, con al menos un origen NO
 * agregador cada uno, siguen sobre el piso de `minSites` — reducción parcial,
 * no eliminación: HONESTO, no todos los residuos de la Ola A3-IDENTIDAD
 * quedan resueltos por este único arreglo (ver "LO QUE QUEDA SIN RESOLVER").
 * Sobre hugo: de los 7 tipos con dispersión, `TemplateDescriptor` (fan-out de
 * sus 3 orígenes [14,2,1]) y las dos consultas `pageMapQueryPages*` (fan-out
 * [18,6,6] cada una, LOS TRES orígenes caen sobre el piso) dejan de
 * emitirse — `TemplateDescriptor` es, textual, uno de los structs de valor de
 * Go nombrados en A3-IDENTIDAD.md (CASO 3, sin resolver hasta ahora):
 * este arreglo lo resuelve por una vía distinta a la que el CASO 3 necesitaba
 * (no por ser struct de valor, sino porque su único origen de alto-fan-out
 * ERA, medido, un archivo agregador).
 *
 * QUÉ NO RESUELVE (declarado, no escondido): `RpcException`/`RuntimeException`/
 * `WsException`/`BadRequestException` (excepciones sin supertipo EN EL REPO,
 * ver CUARTO CASO/"BRECHA MEDIDA") y `configKey`/`PageGroup`/`simpleCommand`/
 * `context` (structs de valor de Go SIN un origen agregador — CASO 3) siguen
 * sin resolverse: sus orígenes de construcción son sitios de negocio
 * ordinarios (fan-out bajo), no ensambladores, así que este criterio
 * estructuralmente no los toca. Necesitan lo que ya declaraba el CUARTO CASO
 * (cambio a `graph/edges/herencia.ts`, fuera de este archivo) o una señal que
 * este grafo no expone (ver "LO QUE QUEDA SIN RESOLVER" más abajo).
 *
 * OJO CON JAVA — MEDIDO, no supuesto (ver el resultado de la tarea, corrida
 * completa sobre los 8 repos): Java reutiliza nombres simples de clase con
 * mucha frecuencia (`Builder` anidado en decenas de clases distintas de
 * guava es el caso extremo), así que resolver "¿a cuál declaración de `Foo`
 * apunta este `new Foo()`?" cae en ambigüedad (>1 declarante candidato) con
 * mucha más frecuencia que en otros lenguajes del corpus — y esa ambigüedad,
 * en la cascada real (`graph/resolve.ts`), sólo la desempata `path-proximity`
 * (heurística, provenance `inferred`, la etapa que este detector EXCLUYE por
 * diseño — ver arriba). Consecuencia esperada, no un defecto de este
 * archivo: en Java este detector tiende a SUB-contar (candidatos que
 * quedarían `droppedAmbiguous` o resueltos sólo vía `inferred`), nunca a
 * sobre-contar. Una simulación de esta tarea (resolución mínima propia,
 * nombre exacto + declarante único en el repo, fuera de este archivo — no es
 * la cascada real) sobre guava midió 11.145 de 21.223 aristas de
 * instanciación candidatas descartadas por ambigüedad de nombre, 0 grupos
 * sobre el umbral.
 *
 * SEXTO CASO — TIPO BASE CON VARIANTES CON NOMBRE (Ola P, frente P6,
 * REDEFINICIÓN del criterio: "identidad compartida" vs. "valor efímero o
 * error", agosto 2026) — el CUARTO CASO ya excluye un tipo T cuando T MISMO
 * es ORIGEN de una arista de jerarquía (T extiende/implementa algo: T es una
 * variante). Este caso es el DUAL, del lado del DESTINO: T también queda
 * excluido cuando T es la BASE de una jerarquía con AL MENOS UNA variante
 * CON NOMBRE (algún otro tipo, en el repo, declara `extends`/`implements`/
 * `satisfies T`) — mismo argumento GoF que el CUARTO CASO ("2+ formas bajo
 * un contrato es diseño, no smell"), aplicado a que T mismo es el contrato
 * (Strategy/Template Method: T está diseñado para sustituirse por una
 * implementación alternativa, así que instanciar "T" en varios sitios no es
 * "una sola implementación dispersa" — cada sitio puede, legítimamente,
 * necesitar una variante distinta). MEDIDO, no adivinado, sobre el corpus
 * externo (juicio en vivo de esta tarea — ver `tests/golden/precision/
 * guava.verdicts.csv`/`nest.verdicts.csv`): `Ticker` (guava,
 * `android/guava/src/com/google/common/base/Ticker.java`) es la clase
 * ABSTRACTA de la que `FakeTicker extends Ticker`
 * (`guava-testlib/.../FakeTicker.java`) y `SerializableTicker extends Ticker`
 * (`LocalCacheTest.java`) son variantes CON NOMBRE — el juicio ya
 * documentaba "pensada para subclasearse" sin que este archivo tuviera cómo
 * usar esa evidencia; ahora sí, sin mirar el nombre de ninguna de las dos
 * subclases (el criterio es "¿hay una arista `extends`/`implements`/
 * `satisfies` ENTRANTE?", no "¿el nombre empieza con Fake/Serializable?").
 * En nest: `Injector` tiene `TestingInjector extends Injector`
 * (`packages/testing/testing-injector.ts`) y `RpcException` tiene
 * `KafkaRetriableException extends RpcException`
 * (`packages/microservices/exceptions/kafka-retriable-exception.ts`) — el
 * mismo mecanismo cierra, de paso, un caso de "servicio core del
 * contenedor" (Injector) y un caso de "excepción" (RpcException) sin
 * necesitar el fact que el QUINTO CASO/BRECHA MEDIDA ya declaraba ausente
 * (una arista de herencia hacia un supertipo EXTERNO como `Error`, que
 * `graph/edges/herencia.ts` no emite — ver esa sección: sigue sin resolverse
 * para tipos SIN ninguna subclase con nombre en el repo, p. ej.
 * `WsException`/`ContextUtils`/`MetadataScanner`/`ExecutionContextHost`/
 * `InstanceWrapper`/`HandlerMetadataStorage` de nest, verificado con
 * `scripts/p6-probe-scattered.mts` esta tarea: ninguno tiene una subclase
 * CON NOMBRE en el repo, así que este caso no los alcanza — quedan en "LO
 * QUE QUEDA SIN RESOLVER").
 *
 * SÉPTIMO CASO — VALOR PURO SIN COMPORTAMIENTO PROPIO (Ola P, frente P6,
 * misma redefinición) — "identidad compartida" presupone que hay una
 * IMPLEMENTACIÓN (comportamiento) que vale la pena centralizar; un tipo sin
 * un solo miembro `function-like` PROPIO (arista `contains` saliente) es, en
 * la práctica, un contenedor de campos puro — no hay "la implementación" de
 * nada que una fábrica pudiera coordinar, sólo datos que cada sitio produce
 * legítimamente distintos (mismo argumento que el CASO 3/structs de valor de
 * Go ya documentaba, pero ahí sólo se resolvía en el CONSUMIDOR —
 * `hypotheses/singleton.ts#required` — nunca en este ancla). MEDIDO: `configKey`
 * (hugo, `commands/commandeer.go`) — verificado por el juicio ya cargado en
 * `tests/golden/precision/hugo.verdicts.csv` ("NO declara ni un solo método
 * propio — se usa puramente como CLAVE de mapa comparable") y confirmado de
 * nuevo con `scripts/p6-probe-scattered.mts` (`ownMethodCount: 0`). NO
 * generaliza a todos los structs de valor: `PageGroup` (CASO 3) SÍ declara
 * método propio (`ProbablyEq`/`Slice`) y sigue sin resolverse por esta vía
 * — el juicio ya cargado lo distingue explícitamente ("Tiene métodos... no
 * un contrato de identidad"), una lectura SEMÁNTICA de qué HACEN esos
 * métodos que este grafo no puede reproducir; declarado, no escondido.
 *
 * OCTAVO CASO — LA CADENA DE IDENTIDAD (Ola R, frente R6, DECISION-TIPOS-
 * Y-FLUJO.md §1 "Relación 2", `construye → guarda → lee`; el eslabón
 * `stores` lo aterrizó R3 en `graph/edges/cadena-identidad.ts` — ver
 * `ola-r/informes/R3.md` §4, que nombra a este archivo explícitamente como
 * consumidor) — el criterio que a este detector le faltaba desde su primera
 * versión: "entidad con identidad compartida" contra "valor efímero o
 * error". Ahora hay una señal ESTRUCTURAL, no adivinada: T sólo es candidato
 * si, en ALGÚN punto del repo, existe un binding de módulo o de clase que
 * GUARDA una instancia de T recién construida (arista `stores`, `binding →
 * T`, evidencia positiva — nunca `ambiguous`, regla 1 de la ola, ver
 * `edgeIsAmbiguous`) y ese binding se LEE desde un archivo DISTINTO al
 * suyo (arista `references`/`calls` entrante desde OTRO archivo — no basta
 * que el único lector sea el propio archivo que lo declaró, ver más abajo).
 * Sin esa combinación, T no tiene, en ningún lugar de ESTE repo, evidencia
 * de que algo ya lo trate como identidad compartida — es, con esta
 * evidencia, más consistente con un VALOR EFÍMERO (excepción, DTO, fixture)
 * que con un tipo que DEBERÍA colapsar a una instancia única. Regla 2 de la
 * ola ("no sé explícito"): la AUSENCIA de `stores` no es "T no tiene
 * identidad" en abstracto — es "este grafo no encontró, en ESTE repo, un
 * punto donde T se guarde a nivel de módulo/clase". Con la población medida
 * de `stores` (R3: 600 aristas en 13 repos, concentradas en java/python/go
 * — ver su informe), esa ausencia es la norma, no la excepción, y es
 * justamente por eso que la señal, cuando SÍ aparece, pesa.
 *
 * "LEÍDO DESDE OTRO ARCHIVO", no sólo "leído": un binding cuyo único lector
 * es el mismo archivo que lo declara no tiene lectores EXTERNOS que
 * dependan de su identidad — es autorreferencia de un script aislado, no
 * el "se LEE... desde VARIOS PUNTOS" que motiva este caso (medido: un
 * binding de un script de benchmark en jekyll,
 * `benchmark/find-filter-vs-where-first-filters.rb`, con exactamente UN
 * lector — él mismo). Un solo lector, y además el mismo archivo que lo
 * declaró, es la lectura más débil posible: no alcanza.
 *
 * MEDIDO, no adivinado, pipeline de producción, 13 repos de SHA congelado
 * (`ola-r/informes/R6.md` §3 para el detalle completo): de los 36
 * candidatos que sobrevivían a los otros siete filtros de este archivo
 * ANTES de esta ola, sólo 2 tienen la cadena completa —
 * `FeatureNotAvailableError` (hugo) y `RuboCop::Config` (rubocop) — una
 * reducción del 94 % del RUIDO de este kind, con CERO verdaderos en riesgo:
 * los hallazgos juzgados de este kind en las planillas
 * (`tests/golden/precision/*.verdicts.csv`) son TODOS `falso` (29 de 29
 * juzgados a la fecha de esta medición) — no hay ningún juicio vivo que
 * este cambio pueda matar.
 *
 * HONESTO SOBRE EL RESIDUO, no se esconde: verifiqué los 2 sobrevivientes a
 * mano contra el código fuente y los DOS siguen siendo, con alta confianza,
 * falsos — mismo tipo de falso que este archivo ya documenta, por una razón
 * MEDIDA y NOMBRADA en cada caso, no un "listo, se acabó":
 *   - `FeatureNotAvailableError` (hugo, `common/herrors/errors.go`) SÍ tiene
 *     un `stores` leído desde 2 archivos de producción
 *     (`resources/resource.go`, `resources/transform.go`):
 *     `var ErrFeatureNotAvailable = &FeatureNotAvailableError{...}`, un
 *     valor CENTINELA para comparar con `errors.Is`. Pero los 4 sitios de
 *     construcción dispersa que este hallazgo señala NO leen ese centinela:
 *     cada uno construye `&FeatureNotAvailableError{Cause: err}` con su
 *     PROPIO `Cause` para devolverlo como error en su propio punto de
 *     fallo — el idioma de excepción del CASO 1 de este módulo, con un
 *     centinela de comparación al lado que esta señal no distingue de
 *     identidad compartida. Límite real de la señal, no un bug de este
 *     archivo: la cadena contesta "¿T tiene identidad EN ALGÚN PUNTO del
 *     repo?", no "¿los SITIOS DISPERSOS que señala ESTE hallazgo son los
 *     que compiten con esa identidad?" — esa segunda pregunta exigiría
 *     atar cada sitio disperso contra el binding, dato que este grafo no
 *     lleva.
 *   - `RuboCop::Config` (rubocop) es un ARTEFACTO de resolución, no una
 *     lectura real: su único `stores` sale de una variable local `config`
 *     dentro de bloques `do...end` anidados de un `RSpec.shared_context`
 *     en un archivo de soporte de test
 *     (`lib/rubocop/rspec/shared_contexts.rb`) — `graph/symbols.ts` no
 *     empuja un frame de scope para un bloque Ruby (sólo para
 *     `def`/`class`), así que esa variable local queda mal clasificada
 *     como binding de módulo. Sus ~87 "lectores" en archivos de producción
 *     no son lecturas de ESE binding: son homónimos — casi toda clase
 *     `Cop` de rubocop expone su PROPIO accessor `config`, y la cascada de
 *     `graph/resolve.ts` los está atando al mismo id por coincidencia de
 *     nombre. Misma familia de bug que T2 (Ola Q) ya documentó para
 *     `Strings` en guava ("bug de resolución ajeno", no de este archivo) —
 *     ver `ola-q/informes/T2.md` §2 y el PIDO A OTRO FRENTE del informe de
 *     esta ola.
 *
 * QUÉ NO INTENTÉ, Y POR QUÉ (la vía alternativa que el triaje de esta ola
 * también midió, "los argumentos de cada sitio difieren" — Ola Q, T2.md,
 * `GUIA-PROXIMA-OLA.md` fila 9: 16 de 36, 44 % del residuo, con esa forma):
 * pide un HECHO NUEVO en `EdgeFacts`/`CodeGraphEdge` de
 * `graph/edges/instanciacion.ts` (una huella textual de los literales de
 * argumento por sitio, comparada entre sitios del mismo grupo) — archivo
 * fuera de mi alcance esta ola (`graph/` no es mío, ver CONTEXTO.md/§8 "PIDO
 * A OTRO FRENTE"). Sin ese hecho, este detector no tiene cómo comparar
 * argumentos entre sitios: un detector `inter-file` como éste sólo recibe,
 * de `RepoUnit`/`RunContext`, el grafo (nodos+aristas) y resúmenes de
 * archivo (`FileSummary`: ruta/líneas/lenguaje — sin AST ni texto fuente).
 * Declarado, no escondido — ver el informe de esta ola.
 *
 * NOVENO CASO — RE-MEDIDO, NO IMPLEMENTADO (Ola Z, frente Z3, agosto 2026):
 * la cita de arriba (16 de 36, Ola Q) está STALE — el OCTAVO CASO (Ola R,
 * escrito DESPUÉS de Q en el archivo pero que ya estaba aterrizado cuando Z3
 * midió) ya colapsó la población VIVA de 36 a **2** por un mecanismo
 * ORTOGONAL (la cadena de identidad, nada que ver con argumentos): hoy, en
 * los 13 repos del corpus, sólo sobreviven `hugo/FeatureNotAvailableError`
 * (4 sitios) y `rubocop/Config` (9 sitios) — verificado esta tarea con
 * `dump-hallazgos.mts` fresco sobre los 13, no supuesto. LOS DOS YA ESTÁN
 * JUZGADOS `falso` por DOS jueces independientes anteriores
 * (`tests/golden/precision/hugo.hypotheses.csv`/`rubocop.hypotheses.csv`,
 * `causeTag: "ancla-equivocada"`) por razones que NO son argumentos
 * (hugo: error-centinela comparado por tipo; rubocop: `Config.new` público,
 * multi-instancia documentada a propósito).
 *
 * Z3 verificó a mano, leyendo la fuente real (no el docstring de nadie), que
 * el hecho "los argumentos difieren" TAMBIÉN es cierto en los dos: hugo pasa
 * un `Cause: err` LOCAL distinto en cada uno de sus 4 sitios
 * (`babel.go:178`, `babel.go:196`, `postcss.go:207`, `tailwindcss.go:114`);
 * rubocop pasa `(hash, path)` distintos en cada uno de sus 9
 * (`Config.new(hash, path)`, `Config.new`, `Config.new(merge(...), file)`,
 * …). Implementar el hecho HOY, sobre ESTA población, sacaría los 2 únicos
 * hallazgos vivos del kind y no convertiría ni uno: **0/2 → 0/0, cero
 * ganancia medida**, exactamente el patrón de las cinco olas anteriores que
 * el CONTEXTO de esta ola cita ("restar falsos no mueve la aguja"). CONFIRMA
 * lo que Z3 tenía que mirar de frente: `Singleton`, cuya ÚNICA ancla es este
 * kind, tiene HOY `n=2`, Wilson [0 %, 66 %], los dos falsos — necesita otra
 * ancla, no un filtro más sobre ésta.
 *
 * GENERICIDAD VERIFICADA, Y ES DONDE LA IDEA SÍ TIENE DIENTES: sobre
 * `corpus-app/` (jenkins, gitea — Java y Go REALES, población MUCHO más
 * grande que la que quedó en el corpus), la MISMA forma aparece con volumen:
 * `gitea` tiene 5 hallazgos vivos HOY (`ListOptions` 39 sitios, `Set` 25,
 * `Commit` 4, `Sha256Hash`/`Sha1Hash` 3 cada uno) y los 5, leídos a mano,
 * son la MISMA familia "objeto valor/config" que Q nombró
 * (`db.ListOptions{Page: ctx.FormInt("page"), PageSize: setting.UI.…}` — un
 * literal DISTINTO en cada uno de los 6+ sitios verificados). `jenkins`
 * tiene 4 (`Permission` 3 sitios, `PermissionGroup` 3, `CopyOnWriteList` 3,
 * `MultiStageTimeSeries` 3) y `Permission`/`MultiStageTimeSeries`,
 * verificados a mano, son la familia "descriptor de auto-registro" (`new
 * Permission(GROUP, "GenericRead", null, HUDSON_ADMINISTER)` — nombre y
 * descripción DISTINTOS en cada una de las ~9 constantes). `redmine` (Ruby)
 * da 0. **El mecanismo generaliza** — no es un artefacto de este corpus.
 * Pero en NINGUNO de los ~13 sitios/hallazgos leídos a mano esta tarea (2
 * del corpus + 8 de `corpus-app/`) apareció la forma CANÓNICA (mismos
 * argumentos en todos los sitios, la que, según el propio módulo,
 * indicaría una instancia que debería compartirse) — así que, aun con
 * dientes reales en aplicaciones vivas, el hecho seguiría siendo PURO
 * FILTRO NEGATIVO: bajaría volumen en `corpus-app/` sin que yo haya
 * encontrado, en ningún lado, evidencia de que sumaría un solo verdadero.
 *
 * DECISIÓN: NO IMPLEMENTADO. Dos razones independientes, cualquiera de las
 * dos alcanza: (1) el hecho vive en `EdgeFacts`/`CodeGraphEdge` de
 * `graph/edges/instanciacion.ts` (+ `graph/edges/types.ts` + `graph/types.ts`
 * + `graph/build.ts` para que el campo llegue de `EdgeFacts` a
 * `CodeGraphEdge` — cuatro archivos, ninguno mío esta ola); (2) medido sobre
 * los 13 repos asignados, la ganancia es CERO, así que cruzar el alcance no
 * se paga sola. Ver el informe de esta ola (`ola-z/informes/Z3.md`) para el
 * detalle completo, incluida la evidencia de `corpus-app/`.
 *
 * PIDO A OTRO FRENTE (no verificado a fondo, sólo observado — declarado para
 * que alguien lo confirme o lo descarte): el `satisfies` que este archivo
 * lee en `HIERARCHY_EDGE_KINDS` para el CUARTO CASO nunca puede excluir nada
 * en producción. `graph/edges/satisfies-derive.ts` (el único productor de
 * `kind: "satisfies"`) emite SIEMPRE `provenance: "ambiguous"` o
 * `"inferred"` (línea `const provenance = have.size === required.size ?
 * "ambiguous" : "inferred"`), nunca `"declared"`/`"resolved"` — y
 * `collectHierarchyParticipants`/`collectHierarchySupertypes` de ESTE
 * archivo exigen evidencia positiva y descartan exactamente esos dos
 * valores. El test "un tipo que SATISFACE una interfaz… no cuenta como
 * candidato" (`scattered-instantiation.test.ts`, describe "participación en
 * jerarquía") pasa en verde construyendo la arista a mano con
 * `provenance: "resolved"` — un valor que la producción NUNCA genera para
 * `satisfies`, así que el test prueba que el FILTRO es correcto pero no que
 * el CAMINO se ejecute alguna vez con datos reales. Consistente con lo que
 * vi en `corpus-app/gitea`: `Sha1Hash`/`Sha256Hash`/`ListOptions` declaran
 * `var _ ObjectID = (*Sha1Hash)(nil)` (aserción estática de interfaz, el
 * idiom de Go), que debería, en teoría, dar señal de jerarquía — y siguen
 * disparando. No confirmé la causa exacta (no abrí `satisfies-derive.ts` a
 * fondo ni tracé si esa aserción produce alguna arista en absoluto) ni
 * corregí nada — es de `graph/edges/`, no mío esta ola, y arreglarlo sería,
 * otra vez, sólo bajar volumen (mismo argumento que el hecho de arriba: no
 * hay evidencia de que sume un verdadero).
 */
import { citado, pisoDeclarado, presupuesto } from "../thresholds.js";
import type { Threshold } from "../thresholds.js";
import { edgeIsAmbiguous } from "../../graph/types.js";
import type { CodeGraph, CodeGraphEdge, CodeGraphNode } from "../../graph/types.js";
import type { InterFileDetector, RawFinding, RepoUnit, RoleLocation, RunContext } from "../types.js";

type ThresholdKey = "minSites" | "maxInstantiationFanoutConsidered";

/**
 * Ola 11a (paquete P1-umbral-singleton-y-censo) — RECALIBRADO de 6 a 3.
 * CAUSA DEL CAMBIO: con piso 6, `build()` de `hypotheses/singleton.ts` (única
 * hipótesis anclada acá que además necesita ESTE ancla para dejar el
 * silencio total, ver su docstring) casi nunca corría — el registro de
 * pendientes documenta que ese piso no se alcanza ni en guava. Medido con
 * `scripts/measure-scattered-instantiation-histogram.mts` sobre
 * `tests/fixtures/patterns/` (todo lo que hay en disco esta ola: no existe
 * `corpus/guava`, `CK_CORPUS_DIR` no está seteado, no se clonó ni corrió
 * nada externo) — el máximo real de archivos distintos instanciando el MISMO
 * tipo con una arista `instantiates` confiable, en TODA esa carpeta, es 1.
 * Esa muestra es demasiado chica y sintética (un ejemplo por lenguaje, sin
 * los múltiples call sites reales de un repo) para derivar empíricamente
 * DÓNDE empieza "dispersión real" — no hay corpus para eso esta ola, así que
 * el número que sigue NO nace de esa medición (sería "para que dispare": la
 * medición ya mostró que ni piso 3 ni piso 2 alcanzan para que el ancla
 * dispare sobre esta fixture, así que bajar hasta 3 no cambia nada localmente
 * comprobable — ver `scattered-instantiation.test.ts`/`singleton.test.ts`).
 * El número nace de un criterio YA EN USO en un detector hermano de este
 * mismo archivo para la MISMA pregunta ("¿cuántos clientes/sitios distintos
 * hacen falta para que algo compartido deje de ser coincidencia?"):
 * `coupling-without-abstraction.ts#MIN_CLIENTS_SPEC` también fija el piso en
 * 3, con el razonamiento "dos es indistinguible de coincidencia, tres ya no
 * se explica por azar" — el mismo razonamiento aplica acá: dos archivos
 * construyendo el mismo tipo es tan fácil de explicar por casualidad (un
 * caller de producción + un test) como por acoplamiento sistemático; tres
 * archivos independientes ya no. 6 no tenía ninguna base propia (el propio
 * docstring del módulo ya declaraba que no es una cifra citada en ninguna
 * fuente) — 3 tampoco lo es, pero es CONSISTENTE con el piso que este mismo
 * proyecto ya eligió para la pregunta gemela, en vez de un número sin relación
 * con nada. Efecto medido sobre el censo: CERO — ni con piso 6 ni con piso 3
 * el ancla produce un solo `Finding` sobre `tests/fixtures/patterns/`
 * (máximo real 1 archivo por tipo), así que este cambio no mueve
 * `tests/golden/fixtures-multi.census.json` por sí mismo.
 */
// R3 (auditoría de umbrales inventados): el corte "dos toleran coincidencia,
// tres ya no" ES la Regla de Tres (Roberts, popularizada por Fowler,
// "Refactoring", 1999) — no un número sin relación con nada. Mismo piso y
// misma cita que `coupling-without-abstraction.ts#MIN_CLIENTS_SPEC` para la
// pregunta gemela ("varios clientes, no dos"). Antes `pisoDeclarado(3, …)`,
// mismo valor — ver el rationale histórico (por qué 3 y no el 6 original)
// preservado abajo.
const MIN_SITES_SPEC = citado(3, {
  work: "Fowler, Refactoring: Improving the Design of Existing Code (1999)",
  rule:
    "Regla de Tres (Roberts): dos ocurrencias toleran coincidencia, la tercera ya no. Histórico de este sitio: " +
    "dos archivos construyendo directamente el mismo tipo concreto es tan fácil de explicar por coincidencia " +
    "(un caller de producción + un test, por ejemplo) como por acoplamiento sistemático; tres archivos " +
    "independientes que construyen el mismo tipo ya no se explica por azar. El piso anterior (6, el brief " +
    "original de esta tarea proponía \">5 sitios\" presentándolo como umbral publicado; verificado que no lo " +
    "es) dejaba el ancla casi sin disparar en la práctica (no se alcanza ni en guava, per el registro de " +
    "pendientes) sin que ese número tuviera una base propia distinta de \"un poco más que unos pocos\".",
});

/** Ver "QUINTO CASO — ARCHIVO AGREGADOR / COMPOSITION-ROOT" en el docstring del módulo
 *  para la tabla de percentiles medida (nest + hugo) que sostiene este número. */
const MAX_INSTANTIATION_FANOUT_CONSIDERED_SPEC = pisoDeclarado(6, {
  rationale:
    "un archivo que construye, él mismo, más de 6 tipos concretos DISTINTOS actúa como ensamblador/composition-" +
    "root (un bootstrap por 'sabor' de contexto de aplicación: HTTP, microservicio, test) que por diseño conoce " +
    "y construye muchas piezas concretas juntas — sus sitios de construcción no aportan evidencia de dispersión " +
    "de NEGOCIO para ninguno de esos tipos. Medido sobre nest (157 archivos, TypeScript) y hugo (271 archivos, " +
    "Go): p90 de fan-out de instanciación por archivo es 5 en AMBOS repos, p95 es 9 y 7 respectivamente — 6 cae " +
    "apenas por encima de p90 (no recorta el cuerpo normal de la distribución) y por debajo de p95 en los dos.",
});

/** CONTRATO-F4.md §1.8: tope de VOLUMEN propio, no de detección. */
const MAX_FINDINGS_SPEC = presupuesto(50, {
  rationale:
    "un panel legible no muestra de forma útil más de unas pocas decenas de tipos con instanciación dispersa a " +
    "la vez; es un tope de volumen, no un umbral de detección.",
});

/** Evidencia POSITIVA del hallazgo ⇒ se excluye `inferred` (ver docstring del módulo) y también
 *  `ambiguous` (CONTRATO-F9.md §4.5: fuera de toda consulta por defecto). */
function isConfidentInstantiationEdge(edge: CodeGraphEdge): boolean {
  return edge.kind === "instantiates" && edge.provenance !== "inferred" && edge.provenance !== "ambiguous";
}

/** Las tres aristas "es-un"/"cumple contrato" — ver "PARTICIPACIÓN EN JERARQUÍA" en el docstring del módulo. */
const HIERARCHY_EDGE_KINDS: ReadonlySet<CodeGraphEdge["kind"]> = new Set(["extends", "implements", "satisfies"]);

/**
 * Nodos que son ORIGEN de una arista "es-un"/"cumple contrato" con evidencia
 * positiva (`declared`/`resolved`, nunca `inferred`/`ambiguous` — mismo
 * requisito que el resto de este archivo aplica a `instantiates`) — ver
 * "PARTICIPACIÓN EN JERARQUÍA" en el docstring del módulo.
 */
function collectHierarchyParticipants(graph: CodeGraph): ReadonlySet<string> {
  const participants = new Set<string>();
  for (const edge of graph.edges) {
    if (!HIERARCHY_EDGE_KINDS.has(edge.kind)) continue;
    if (edge.provenance === "inferred" || edge.provenance === "ambiguous") continue;
    participants.add(edge.from);
  }
  return participants;
}

/**
 * SEXTO CASO (ver docstring del módulo): nodos que son DESTINO — no origen —
 * de una arista "es-un"/"cumple contrato" con evidencia positiva. Un tipo
 * `to` de esta arista es la BASE de al menos una variante CON NOMBRE: fue
 * diseñado como punto de extensión (Strategy/Template Method), el dual
 * exacto de `collectHierarchyParticipants` (que mira el ORIGEN).
 */
function collectHierarchySupertypes(graph: CodeGraph): ReadonlySet<string> {
  const supertypes = new Set<string>();
  for (const edge of graph.edges) {
    if (!HIERARCHY_EDGE_KINDS.has(edge.kind)) continue;
    if (edge.provenance === "inferred" || edge.provenance === "ambiguous") continue;
    supertypes.add(edge.to);
  }
  return supertypes;
}

/**
 * SÉPTIMO CASO (ver docstring del módulo): nodos `class-like` con al menos
 * UN miembro `function-like` propio (arista `contains` saliente) — "tiene
 * una implementación propia que coordinar", el opuesto de "es sólo un
 * contenedor de datos". Mismo criterio de conteo que `memberSignatures`
 * (`graph/types.ts`), reimplementado acá porque ese helper exige un
 * `GraphIndex` completo (`edgesFrom`) y este archivo ya recorre
 * `graph.edges` planas en O(E) para todo lo demás.
 */
function collectTypesWithOwnBehavior(graph: CodeGraph, nodeById: ReadonlyMap<string, CodeGraphNode>): ReadonlySet<string> {
  const withBehavior = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.kind !== "contains") continue;
    const member = nodeById.get(edge.to);
    if (!member || member.kind !== "symbol" || member.family !== "function-like") continue;
    withBehavior.add(edge.from);
  }
  return withBehavior;
}

/**
 * OCTAVO CASO (ver "LA CADENA DE IDENTIDAD" en el docstring del módulo): T
 * es candidato sólo si, en ALGÚN punto del repo, hay un binding de
 * módulo/clase que GUARDA una instancia de T (arista `stores`, evidencia
 * positiva — `edgeIsAmbiguous` la deja afuera, regla 1 de la ola) Y ese
 * binding se LEE desde un archivo DISTINTO al que lo declara (arista
 * `references`/`calls` entrante desde OTRO archivo — un único lector que
 * además es el propio archivo declarante no cuenta, ver el docstring).
 * `family !== "class-like"` en el destino se descarta (R3, informe §3: 3 de
 * 600 `stores` resuelven a un alias, no a una clase — mismo criterio que
 * este archivo ya aplica al filtrar destinos de `instantiates`).
 */
function collectTypesWithSharedIdentity(graph: CodeGraph, nodeById: ReadonlyMap<string, CodeGraphNode>): ReadonlySet<string> {
  const readerFilesByTarget = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (edge.kind !== "references" && edge.kind !== "calls") continue;
    const readerNode = nodeById.get(edge.from);
    if (!readerNode) continue;
    let files = readerFilesByTarget.get(edge.to);
    if (!files) readerFilesByTarget.set(edge.to, (files = new Set()));
    files.add(readerNode.file);
  }

  const withIdentity = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.kind !== "stores") continue;
    if (edgeIsAmbiguous(edge)) continue;
    const toNode = nodeById.get(edge.to);
    const bindingNode = nodeById.get(edge.from);
    if (!toNode || !bindingNode || toNode.family !== "class-like") continue;
    const readerFiles = readerFilesByTarget.get(edge.from);
    if (!readerFiles) continue;
    const readFromElsewhere = [...readerFiles].some((f) => f !== bindingNode.file);
    if (!readFromElsewhere) continue;
    withIdentity.add(edge.to);
  }
  return withIdentity;
}

function fileName(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

function typeName(node: CodeGraphNode): string {
  return node.symbolPath[node.symbolPath.length - 1] ?? fileName(node.file);
}

interface SiteInfo {
  representative: CodeGraphNode;
  occurrences: number;
}

interface TargetGroup {
  readonly toNode: CodeGraphNode;
  readonly sitesByFile: Map<string, SiteInfo>;
}

/**
 * Ver "QUINTO CASO — ARCHIVO AGREGADOR / COMPOSITION-ROOT" en el docstring
 * del módulo. Fan-out CRUDO de instanciación por archivo de origen: cuántos
 * tipos `class-like` DISTINTOS (cualquiera, sin el filtro de jerarquía —
 * la pregunta es "¿cuántas piezas distintas ensambla este archivo en
 * total?", no "¿cuántas de las que sobrevivieron los otros filtros?")
 * construye cada archivo vía una arista `instantiates` confiable. Pasada
 * propia, separada de `groupInstantiationsByTarget`: necesita ver TODOS los
 * destinos de un origen antes de decidir si ese origen es un agregador, y
 * `groupInstantiationsByTarget` procesa un destino a la vez.
 */
function computeInstantiationFanoutByFile(graph: CodeGraph, nodeById: ReadonlyMap<string, CodeGraphNode>): ReadonlyMap<string, number> {
  const targetsByOrigin = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (!isConfidentInstantiationEdge(edge)) continue;
    const toNode = nodeById.get(edge.to);
    const fromNode = nodeById.get(edge.from);
    if (!toNode || !fromNode || toNode.family !== "class-like") continue;
    let targets = targetsByOrigin.get(fromNode.file);
    if (!targets) {
      targets = new Set();
      targetsByOrigin.set(fromNode.file, targets);
    }
    targets.add(edge.to);
  }
  const fanoutByFile = new Map<string, number>();
  for (const [file, targets] of targetsByOrigin) fanoutByFile.set(file, targets.size);
  return fanoutByFile;
}

/**
 * Agrupa todas las aristas `instantiates` confiables por TIPO DESTINO
 * (`edge.to`), acumulando cuántos archivos DISTINTOS de origen (`edge.from`)
 * lo construyen. O(E) sobre `graph.edges`, dos pasadas (la de
 * `computeInstantiationFanoutByFile` de arriba + ésta).
 */
function groupInstantiationsByTarget(
  graph: CodeGraph,
  hierarchyParticipants: ReadonlySet<string>,
  maxInstantiationFanout: Threshold,
): Map<string, TargetGroup> {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const fanoutByFile = computeInstantiationFanoutByFile(graph, nodeById);
  const hierarchySupertypes = collectHierarchySupertypes(graph); // SEXTO CASO
  const typesWithOwnBehavior = collectTypesWithOwnBehavior(graph, nodeById); // SÉPTIMO CASO
  const typesWithSharedIdentity = collectTypesWithSharedIdentity(graph, nodeById); // OCTAVO CASO
  const groups = new Map<string, TargetGroup>();

  for (const edge of graph.edges) {
    if (!isConfidentInstantiationEdge(edge)) continue;
    const toNode = nodeById.get(edge.to);
    const fromNode = nodeById.get(edge.from);
    if (!toNode || !fromNode) continue;
    if (toNode.family !== "class-like") continue; // sólo construcción de un tipo, ver "SIMPLIFICACIONES DECLARADAS"
    // Ver "PARTICIPACIÓN EN JERARQUÍA" en el docstring del módulo: un tipo que
    // ES-UN/CUMPLE otra cosa fue diseñado para tener variantes intercambiables
    // bajo un contrato común — lo opuesto de "debería colapsar a una instancia
    // compartida". Nunca cuenta como candidato, no sólo baja de severidad.
    if (hierarchyParticipants.has(edge.to)) continue;
    // SEXTO CASO (ver docstring del módulo): T es la BASE de al menos una
    // variante CON NOMBRE — mismo argumento GoF que arriba, del lado del
    // destino. Ej.: Ticker (guava) ↔ FakeTicker/SerializableTicker.
    if (hierarchySupertypes.has(edge.to)) continue;
    // SÉPTIMO CASO (ver docstring del módulo): T no tiene NINGÚN miembro
    // propio — no hay "una implementación" que una fábrica pudiera
    // centralizar, sólo datos. Ej.: configKey (hugo).
    if (!typesWithOwnBehavior.has(edge.to)) continue;
    // OCTAVO CASO — LA CADENA DE IDENTIDAD (ver docstring del módulo): sin
    // evidencia de que ALGÚN binding de módulo/clase guarde una instancia de
    // T y se lea desde otro archivo, T no tiene, en este repo, una identidad
    // establecida que la dispersión pudiera estar duplicando mal.
    if (!typesWithSharedIdentity.has(edge.to)) continue;
    // Ver "QUINTO CASO" en el docstring del módulo: si el ORIGEN de este sitio
    // construye, él mismo, más tipos distintos que el piso, es un
    // ensamblador/composition-root — su construcción de `toNode` no aporta
    // evidencia de dispersión de negocio, así que este sitio no cuenta.
    if ((fanoutByFile.get(fromNode.file) ?? 0) > maxInstantiationFanout.value) continue;

    let group = groups.get(edge.to);
    if (!group) {
      group = { toNode, sitesByFile: new Map() };
      groups.set(edge.to, group);
    }
    const existing = group.sitesByFile.get(fromNode.file);
    if (existing) {
      existing.occurrences += edge.weight;
      // El representante es el sitio de menor línea de inicio, para que la
      // location apunte siempre al primer sitio en orden de lectura del archivo.
      if ((fromNode.startLine ?? Infinity) < (existing.representative.startLine ?? Infinity)) {
        existing.representative = fromNode;
      }
    } else {
      group.sitesByFile.set(fromNode.file, { representative: fromNode, occurrences: edge.weight });
    }
  }

  return groups;
}

/**
 * Único lugar que arma los `RawFinding[]` — separado de `detector.run` para
 * poder testearlo sin pasar por `RunContext`, mismo patrón que
 * `findDependencyCycles`/`buildOrphanFileFindings` en los detectores hermanos.
 */
export function buildScatteredInstantiationFindings(graph: CodeGraph, minSites: Threshold, maxInstantiationFanout: Threshold): RawFinding[] {
  const hierarchyParticipants = collectHierarchyParticipants(graph);
  const groups = groupInstantiationsByTarget(graph, hierarchyParticipants, maxInstantiationFanout);
  const findings: RawFinding[] = [];

  for (const group of groups.values()) {
    const distinctFiles = group.sitesByFile.size;
    if (distinctFiles < minSites.value) continue;

    const name = typeName(group.toNode);
    const totalOccurrences = [...group.sitesByFile.values()].reduce((acc, s) => acc + s.occurrences, 0);
    const orderedFiles = [...group.sitesByFile.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    const targetLocation: RoleLocation = {
      file: group.toNode.file,
      startLine: group.toNode.startLine ?? 1,
      endLine: group.toNode.endLine ?? group.toNode.startLine ?? 1,
      symbol: name,
      role: `tipo construido directamente desde ${distinctFiles} archivos distintos`,
    };
    const siteLocations: RoleLocation[] = orderedFiles.map(([file, site]) => ({
      file,
      startLine: site.representative.startLine ?? 1,
      endLine: site.representative.endLine ?? site.representative.startLine ?? 1,
      role: "sitio de instanciación directa",
    }));

    findings.push({
      title: `"${name}" se construye directamente ("new") desde ${distinctFiles} archivos distintos`,
      detail:
        `Cada uno de esos ${distinctFiles} archivos depende de la implementación EXACTA de "${name}" — su ` +
        "constructor, sus parámetros, su forma de inicializarse — así que un cambio en cómo se construye " +
        "(una implementación alternativa, un paso de configuración nuevo, una firma distinta) obliga a tocar " +
        "cada sitio por separado. Concentrar la construcción en una fábrica o en un punto de inyección de " +
        "dependencias evita ese acoplamiento repetido. HIPÓTESIS, no afirmación: esta misma firma estructural " +
        "la produce también una clase de EXCEPCIÓN (lanzada con \"throw new\" desde cualquier punto que " +
        "detecta el error, sin que una fábrica aporte nada) o un objeto de VALOR/CONFIGURACIÓN/fixture de " +
        "prueba (pensado para construirse con una combinación distinta de datos en cada sitio) — ninguna de " +
        "las dos es un problema; revisar el caso antes de introducir una fábrica.",
      trigger: [{ label: "archivos distintos que construyen este tipo", value: distinctFiles, threshold: minSites }],
      evidence: [{ label: "sitios de instanciación totales (incluye repeticiones dentro de un mismo archivo)", value: totalOccurrences }],
      locations: [targetLocation, ...siteLocations],
      severity: Math.min(100, 30 + distinctFiles * 5),
      advice: {
        primary: {
          name: "Replace Constructor with Factory Method",
          kind: "refactorizacion",
          why:
            "Sustituir la construcción directa dispersa por una fábrica (o un punto único de inyección) da un " +
            "solo lugar para cambiar cómo se crea el tipo, en vez de uno por cada sitio de uso.",
          source: "https://refactoring.guru/es/replace-constructor-with-factory-method",
        },
      },
    });
  }

  return findings;
}

export const detector: InterFileDetector<ThresholdKey, "scattered-instantiation"> = {
  id: "scattered-instantiation",
  kind: "scattered-instantiation",
  scope: "inter-file",
  needsGraph: true,
  title: "Instanciación directa dispersa",
  needs: [],
  /**
   * OLA 11b, frente B1 — LAS CELDAS MUDAS. La única lectura de aristas de
   * este archivo es `edge.kind === "instantiates"`, así que sin esa arista el
   * detector no puede producir nada. Importa más que en los de `references`:
   * `graph/edges/instanciacion.ts` se declara `optional: true` y NO tiene
   * sonda para Ruby ni Python (verificado leyendo su `SENTINEL`), o sea que
   * hay lenguajes donde la arista no aterriza por diseño — exactamente el
   * caso que `sin-aristas` existe para nombrar en vez de dejarlo como cero.
   *
   * EFECTO MEDIDO SOBRE FIXTURES: NINGUNO — `tests/fixtures/patterns` tiene
   * 35 aristas `instantiates` (emitidas desde go/javascript/typescript/vue),
   * y la compuerta de `run.ts` es REPO-WIDE: alcanza con que un lenguaje del
   * repo las emita para que el detector corra. Ver la advertencia del informe
   * sobre esa granularidad.
   */
  needsEdges: ["instantiates"],
  thresholds: {
    minSites: MIN_SITES_SPEC,
    maxInstantiationFanoutConsidered: MAX_INSTANTIATION_FANOUT_CONSIDERED_SPEC,
  },
  maxFindings: MAX_FINDINGS_SPEC,
  run(repo: RepoUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const graph = repo.graph;
    // Defensivo: `run.ts#runInterFile` ya filtra `needsGraph && graph === null`
    // ANTES de llamar a `run()` (reporta `sin-grafo`, nunca invoca esto con
    // grafo nulo) — este `return []` nunca debería ejecutarse en producción,
    // pero `CodeGraph | null` sigue siendo el tipo declarado.
    if (!graph) return [];
    return buildScatteredInstantiationFindings(graph, ctx.threshold("minSites"), ctx.threshold("maxInstantiationFanoutConsidered"));
  },
};
