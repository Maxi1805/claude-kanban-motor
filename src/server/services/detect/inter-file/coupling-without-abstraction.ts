/**
 * `coupling-without-abstraction` — acoplamiento sin abstracción común
 * (CONTRATO-F5.md Contrato 4, uno de los 16 detectores inter-archivo de
 * esta ola).
 *
 * RELACIÓN (qué mide, sin jerga de AST): un PAR de archivos concretos {A, B}
 * tal que ≥ `minClients` archivos DISTINTOS del repo dependen de A **y** de
 * B a la vez, sin que exista entre A y B (ni entre A/B y un tercer archivo
 * común) ninguna arista de tipo herencia/interfaz/mixin que los una. Es la
 * firma estructural de "varios lugares del código conocen simultáneamente
 * dos piezas concretas que deberían poder tratarse como una sola cosa" — el
 * candidato clásico a `Extract Interface`/inversión de dependencia: si se
 * introdujera una abstracción común para A y B, cada uno de esos clientes
 * dependería de UNA cosa en vez de DOS, y A/B podrían intercambiarse sin
 * tocar a sus clientes.
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: el criterio entero es de FORMA del
 * grafo — cuántos archivos distintos son origen de una arista de dependencia
 * hacia AMBOS extremos de un par, y si ese par ya está unido por una arista
 * de tipo nominal (`extends`/`implements`/`mixes-in`/`satisfies`, directa o
 * vía un tercer archivo en común). Cero vocabulario de dominio, cero nombre
 * de variable/clase/carpeta.
 *
 * SIMPLIFICACIONES DECLARADAS:
 *  - **M se fija en 2** (el mínimo que ya satisface "M unidades, M ≥ 2").
 *    Generalizar a conjuntos de M ≥ 3 requeriría minería de itemsets
 *    cerrados sobre el grafo de dependencias (frequent closed itemsets),
 *    fuera de alcance de esta tarea. Un trío real {A, B, C} co-dependido por
 *    el mismo grupo de clientes SÍ aparece en el resultado — como hasta 3
 *    hallazgos de PAR con el mismo conjunto (o un subconjunto solapado) de
 *    clientes ({A,B}, {A,C}, {B,C}) — pero no se colapsa automáticamente en
 *    un solo hallazgo de trío; queda como trabajo futuro, no oculto.
 *  - **Aristas de dependencia consideradas**: todo kind salvo `contains`
 *    (jerárquica, no de dependencia) — mismo criterio que
 *    `dependency-cycle.ts`/`orphan-file.ts`. **Provenance**: se EXCLUYE
 *    `inferred` (la etapa heurística `path-proximity`, Ola 3) porque acá una
 *    arista es **evidencia POSITIVA** del hallazgo (afirma "este archivo
 *    depende de aquél") — mismo criterio que `dependency-cycle.ts` documenta
 *    para la misma situación (CONTRATO-F5.md §4.4: "si la arista `inferred`
 *    es evidencia positiva, excluirla; lo conservador es no afirmar").
 *  - **"Ya tiene abstracción común"** se decide con las aristas nominales
 *    `extends`/`implements`/`mixes-in`/`satisfies` a GRANO ARCHIVO: A y B
 *    quedan unidos si hay una arista directa entre ambos de esos kinds, O si
 *    ambos tienen una arista de esos kinds hacia un mismo TERCER archivo
 *    (un supertipo/interfaz compartido). No mira si esa abstracción común es
 *    la que de verdad usan los `minClients` clientes — sólo que EXISTE. Un
 *    repo donde A y B implementan la misma interfaz pero los clientes
 *    siguen importando A y B directamente (bypass de la abstracción) no lo
 *    reporta este detector: ese es un problema distinto ("los clientes no
 *    usan la abstracción que ya existe"), no "falta la abstracción".
 *  - **Guardia de rendimiento, `maxFanoutConsidered`**: un archivo origen
 *    con más dependencias declaradas que este umbral NO aporta pares a la
 *    cuenta (evita la explosión combinatoria de enumerar C(n,2) pares por
 *    archivo en un archivo con fan-out de cientos, y ver "CON QUÉ SE
 *    CONFUNDE" más abajo para la razón de fondo, no sólo de rendimiento).
 *  - **Infraestructura ubicua excluida por `maxUbiquitousFanInRatio`**: un
 *    archivo con el que ya depende una fracción grande del repo (logging,
 *    configuración, un tipo de error compartido) se excluye como miembro del
 *    par — ver "CON QUÉ SE CONFUNDE".
 *
 * CON QUÉ SE CONFUNDE (patrón bien aplicado que produce la MISMA firma
 * estructural — léase antes de subir la severidad o bajar los umbrales):
 *  - **DEPENDENCIAS DE INFRAESTRUCTURA UBICUA** (logging, configuración, un
 *    tipo de excepción compartido): decenas de archivos dependen a la vez
 *    de `Logger` y `Config` sin que haga falta ninguna abstracción — son
 *    cross-cutting, estables, y ya cumplen el rol de abstracción compartida
 *    ellos mismos. `maxUbiquitousFanInRatio` es exactamente el intento de
 *    filtrar este caso por FORMA (qué fracción del repo depende del
 *    archivo), sin mirar el nombre.
 *  - **ARCHIVO AGREGADOR / PUNTO DE ENTRADA / CONTENEDOR DE INYECCIÓN DE
 *    DEPENDENCIAS**: un único archivo (`main.go`, un contenedor de DI, un
 *    barril `index.ts`) que a propósito conoce e instancia docenas de
 *    módulos concretos NO es "varios clientes acoplados a un par sin
 *    abstracción": es UN cliente con fan-out alto, por diseño (tiene que
 *    conocer las piezas concretas para poder ensamblarlas). `maxFanoutConsidered`
 *    excluye a ESE archivo como ORIGEN de pares — no confundir con el caso
 *    de arriba, que excluye archivos como DESTINO.
 *  - **PAR FACHADA+COMPAÑERO, USADO A PROPÓSITO COMO UNIDAD**: una clase y
 *    su tipo de excepción dedicado, o una clase y su builder específico, que
 *    varios clientes usan siempre juntos por diseño (no son intercambiables,
 *    nunca se esperaría sustituir uno sin el otro). Este detector NO puede
 *    distinguir esta cohesión intencional de un acoplamiento accidental —
 *    ambas producen la misma firma (N clientes, mismo par, sin arista
 *    nominal entre ellos) — así que la severidad se mantiene MODERADA
 *    (nunca satura en 100) y el `detail` de cada hallazgo lo dice
 *    explícitamente: es una hipótesis a revisar, no una afirmación.
 *
 * LÍMITES POR LENGUAJE / OJO CON JAVA: excluir `inferred` es la defensa
 * principal (ver arriba), pero en guava la etapa heurística `path-proximity`
 * aporta el 81% de las aristas `references` ACEPTADAS (Ola 3) — así que
 * excluirla por completo dejará muy pocas aristas de dependencia
 * `declared`/`resolved` sobre las que construir pares en archivos `.java`,
 * y el hallazgo esperable ahí es "pocos o cero pares", no "sin acoplamiento
 * real".
 *
 * TECHO DE SEVERIDAD POR PROVENANCE (P5, CRITERIO UNIFICADO — mismo en
 * `layer-skip.ts`/`dependency-cycle.ts`/`inappropriate-intimacy.ts`/
 * `fanout-without-cohesion.ts`): ANTES de esta tarea, `severityOf` reducía la
 * severidad 20 puntos con `return involvesJava ? Math.max(15, capped - 20) :
 * capped` — una penalización HARDCODEADA por nombre de lenguaje, no por
 * evidencia. Se reemplaza por la MISMA regla que el resto del catálogo: se
 * mide, para cada candidato {a, b, clientes}, qué fracción de TODAS las
 * aristas (cualquier `provenance`, mismo filtro de `kind`) entre esos
 * clientes y {a, b} es `inferred`; si supera 0.5 (`MAJORITY_INFERRED_RATIO`),
 * la severidad se ACOTA a `LOW_CONFIDENCE_SEVERITY_CEILING = 35`. Es la
 * MISMA intención (dudar más de Java, donde `path-proximity` domina) pero
 * expresada como una MEDICIÓN: un repo Java bien resuelto (mayoría
 * `declared`/`resolved`) ya no se penaliza porque sea `.java`, y un repo de
 * cualquier otro lenguaje cuya resolución dependa igual de `path-proximity`
 * sí se acota — `involvesJava`/`languageByFile` se elimina de `severityOf`
 * (queda sólo para el texto informativo de `detail`, ver abajo).
 *
 * CONCENTRACIÓN DEL CLIENTELA EN {A, B} — señal nueva, encontrada juzgando a
 * mano (Ola de nivel 1, agosto 2026), NO reemplaza a `maxUbiquitousFanInRatio`:
 * la complementa. El piso de ubicuidad de arriba mide "¿A o B es tan popular
 * que casi todo el repo lo usa?" — pero en un repo GRANDE (cientos de
 * archivos) un módulo puede ser genuinamente central para SU subsistema
 * (fan-in real de 15-50 archivos) sin acercarse nunca al 10% del repo
 * ENTERO, y el piso de ubicuidad —que mide la fracción sobre el TOTAL del
 * repo— nunca lo alcanza a excluir. Medido sobre hugo (528 archivos, ver el
 * resultado de esta tarea): las 40 parejas que emite el detector hoy tienen,
 * las 40, un fan-in individual de A y B entre 11 y 52 — MUY por debajo del
 * 10% de 528 (≈53) — y ambos extremos resultan ser módulos centrales
 * verificados a mano (`identity/identity.go`, `resources/page/page.go`,
 * `resources/resource/resourcetypes.go`, `modules/module.go`…), no piezas
 * concretas obscuras. La pregunta que SÍ separa el acoplamiento accidental
 * de la centralidad legítima no es "¿qué fracción del repo depende de A?"
 * sino **"de TODO el fan-in de A, ¿qué fracción es justamente ESTA
 * clientela?"** — si la mayoría de los archivos que dependen de A son
 * ajenos a este grupo de `clients` (A es popular por SU CUENTA, en muchos
 * otros contextos), A no es "una pieza concreta que este grupo hardcodeó
 * sin abstracción": es un módulo independientemente relevante que este
 * grupo, entre muchos otros, también usa. Si en cambio la MAYORÍA de los
 * dependientes de A resultan ser justo estos mismos `clients`, la señal
 * cambia de sentido: son casi los únicos que dependen de A, y de B, sin que
 * nada los una — el acoplamiento SÍ es específico de ese grupo.
 * Requiere que el MÍNIMO de las dos concentraciones (clientes/fan-in-de-A,
 * clientes/fan-in-de-B) supere el piso — exigir sólo UNA de las dos dejaría
 * pasar el caso asimétrico (A es específico de este grupo, B es un módulo
 * masivamente popular por su cuenta), que sigue siendo la misma "B es
 * infraestructura, no una pieza concreta" que el resto del docstring ya
 * excluye por otra vía.
 *
 * EL NÚMERO, MEDIDO — no una mayoría (0.5) elegida por analogía con
 * `MAJORITY_INFERRED_RATIO`: se probó primero y la distribución real de
 * hugo la descarta. Calculando la concentración de las 40 parejas de hugo
 * (script propio sobre el grafo real), la distribución tiene un ESCALÓN
 * marcado, no una pendiente pareja:
 *
 *   | piso  | parejas que sobreviven (de 40) |
 *   |-------|---------------------------------|
 *   | 0.20  | 30 (75%)                        |
 *   | 0.25  | 14 (35%)                        |
 *   | 0.30  | 8 (20%)                         |
 *   | 0.35  | 4 (10%)                         |
 *   | 0.50  | 3 (8%)                          |
 *
 * Entre 0.30 y 0.35 el volumen cae de 8 a 4 — un piso de 0.5 deja sólo 3
 * parejas vivas en TODO hugo (92,5% de recorte en un solo repo), exactamente
 * la forma del apagón que la ola anterior identificó como trampa (bajar
 * volumen a cero no es lo mismo que arreglar el criterio, aunque la
 * precisión medida no se mueva). 0.30 se para ANTES de ese escalón: sigue
 * siendo una exigencia real (menos de un tercio de concentración ya no
 * alcanza) sin recortar el volumen al hueso de un fenómeno que, medido,
 * resultó ser un continuo, no dos categorías separadas por una mayoría
 * limpia.
 *
 * "¿HACEN LO MISMO?" — LA RAÍZ (Ola de nivel 1, agosto 2026, frente A3a): hasta
 * acá todo el criterio de arriba (clientela mínima, ubicuidad, concentración)
 * sigue respondiendo una única pregunta — "¿co-ocurren, y no es ruido/
 * infraestructura/casualidad?" — nunca "¿son intercambiables?". Y co-ocurrir
 * NO es acoplarse: dos módulos hermanos e independientes del mismo subsistema,
 * co-usados por el mismo orquestador porque cada uno resuelve una
 * responsabilidad ORTOGONAL (dos algoritmos de grafo distintos, un tope de
 * costo y una proyección, dos enums de configuración independientes — los
 * cuatro casos textuales que motivaron esta tarea, ver A3-IDENTIDAD.md),
 * produce EXACTAMENTE la misma firma de co-ocurrencia-concentrada-no-ubicua
 * que un par genuinamente intercambiable. Medido antes de este cambio: 0 %
 * de precisión en n=12 (12 veredictos juzgados a mano, CERO verdaderos), y
 * el propio catálogo de notas de veredicto (§4 de CONTEXTO.md, familia
 * IDENTIDAD) no tiene un solo caso textual donde el remedio ("Extract
 * Interface") tuviera sentido — todos son "co-ocurrir no es lo mismo que
 * acoplarse".
 *
 * La pregunta correcta, textual del brief: "¿hacen lo mismo? Dos cosas piden
 * una abstracción común cuando son intercambiables: mismas operaciones,
 * mismos consumidores llamándolas de la misma manera." Se probaron DOS
 * operacionalizaciones de "mismas operaciones", MEDIDAS las dos sobre grafos
 * reales (nest, TypeScript, 2158 archivos; hugo, Go, 2572 archivos; guava,
 * Java, 3342 archivos — `scripts/a3a-measure-operation-overlap.mts`, script
 * de medición de esta tarea, no productivo):
 *
 *   1. OPERACIÓN INVOCADA POR LOS MISMOS CLIENTES: de las aristas
 *      `references`/`calls` que salen de los `clients` compartidos hacia
 *      símbolos DENTRO de A y de B, ¿hay algún nombre de miembro en común?
 *      DESCARTADA, medida: CERO candidatos con overlap en los TRES repos
 *      (0/202 en nest —con dato de invocación disponible en 160 de esos 202—,
 *      0/48 en hugo con dato disponible en los 48, 0/77 en guava). La razón,
 *      una vez medida: casi todo par {A, B} candidato son dos archivos con
 *      UN símbolo principal cada uno (una clase, una función, un decorador),
 *      y lo que los clientes invocan de cada uno es, por construcción, el
 *      nombre PROPIO y distinto de cada uno (`@Controller()` vs `@Param()`,
 *      `detectCycles` vs `computePagerank`) — comparar nombres INVOCADOS
 *      nunca iba a coincidir salvo que ambos archivos expusieran, ellos
 *      mismos, miembros con el mismo nombre, que es exactamente la pregunta
 *      2 de abajo.
 *   2. MIEMBRO DECLARADO EN COMÚN, en los símbolos `class-like` de primer
 *      nivel de A y de B (vía `contains`, estructural, sin depender de que
 *      ninguna referencia cruzada haya resuelto): ¿el conjunto de métodos que
 *      A declara y el que B declara tienen algún nombre en común? Requiere,
 *      ADEMÁS, que AMBOS extremos tengan al menos un símbolo `class-like` de
 *      primer nivel — si ninguno de los dos es una clase/interfaz/struct,
 *      "Extract Interface" (el remedio que este detector propone) no aplica
 *      MECÁNICAMENTE, sea cual sea la respuesta a "hacen lo mismo": un enum,
 *      un módulo de funciones sueltas o un decorador no se refactorizan
 *      extrayendo una interfaz. MEDIDA: nest 202→48 candidatos con ambos
 *      extremos `class-like` (recorta los pares decorador+decorador,
 *      enum+enum, módulo-de-funciones+módulo-de-funciones — exactamente los
 *      CUATRO casos textuales del brief), y de esos 49, sólo 4 comparten al
 *      menos un método declarado (`instance-wrapper.ts`↔`module.ts`:
 *      `id`/`instance`/`generateUuid`; `guards-consumer.ts`↔
 *      `interceptors-consumer.ts`: `createContext`; `http-adapter.ts`↔
 *      `nest-application-context.ts`: `init`/`get`; `http-adapter.ts`↔
 *      `nest-microservice.ts`: `init`/`listen`). hugo: 48→5 ambos
 *      `class-like`, de esos 1 comparte miembro (`roles.go`↔`versions.go`:
 *      `Name`). guava: 77→77 (Java es casi enteramente clases, el filtro
 *      `class-like` no recorta ahí), de esos 27 comparten miembro — MENOS
 *      selectivo en Java: guava tiene clases-utilidad estáticas (`Iterators`/
 *      `Maps`/`Sets`) con vocabulario de método parecido (`filter`,
 *      `difference`) sin que "Extract Interface" tenga sentido para una
 *      clase de sólo-métodos-estáticos — LÍMITE DECLARADO, no resuelto: este
 *      grafo no expone si un miembro es estático (`MemberSignature` no tiene
 *      ese campo), así que este archivo no puede excluir ese caso sin
 *      inventar una heurística no medida. Se documenta, no se esconde.
 *
 * `"constructor"` se EXCLUYE del conjunto de nombres comparados en la
 * operacionalización 2: TODA clase con constructor explícito lo declara con
 * ese mismo nombre estructural (campo de gramática, no vocabulario), así que
 * coincide en el 100 % de los pares con constructor propio en ambos lados —
 * cero poder de discriminación, exactamente el mismo defecto que R3 (auditoría
 * de umbrales inventados) ya nombra para un número sin evidencia detrás.
 * Medido antes de excluirlo: de los 4 candidatos de nest, los 4 tenían
 * `constructor` como (único o uno de varios) nombre compartido; después de
 * excluirlo, instance-wrapper/module y los dos pares de http-adapter siguen
 * vivos con OTRO nombre compartido — sólo cambia qué motivo cita el hallazgo.
 *
 * ── OLA O, FRENTE N5: LA OPERACIONALIZACIÓN 2 ESTABA ROTA POR LENGUAJE ──────
 *
 * Lo que sigue reemplaza a `declaredOperationNames` (la versión anterior de la
 * operacionalización 2). El criterio de arriba era el correcto; su IMPLEMENTACIÓN
 * respondía "no hacen lo mismo" en cuatro lenguajes sin haber podido mirar, porque leía
 * la superficie de un archivo como "los `class-like` HIJOS DIRECTOS del nodo archivo, y
 * los miembros `function-like` de esos". Medido sobre 12 repos, esa lectura devuelve el
 * conjunto VACÍO —y por lo tanto un "no" automático— en:
 *
 *   | lenguaje | por qué la superficie salía vacía | medición |
 *   |---|---|---|
 *   | csharp | la clase cuelga de un `namespace_declaration`, no del archivo | newtonsoft-json: 228 hijos `namespace-like` de primer nivel vs 15 `class-like`; 334 de 349 clases a profundidad 1-2 |
 *   | ruby | la clase cuelga de un `module` | jekyll: 92 `namespace-like` vs 10 `class-like` de primer nivel |
 *   | go | el método se declara al nivel del archivo con un receptor, no dentro del tipo | cobra: 270 `function-like` hijos del archivo vs 1 hijo de un `class-like` |
 *   | javascript / vue / typescript / python de módulo | el archivo expone funciones sueltas, sin clase | preact: 181 `function-like` hijos del archivo; vueuse: 93 en `.vue` |
 *
 * Consecuencia medida, con el embudo instrumentado (candidatos que llegan al último
 * filtro -> candidatos que lo pasan): newtonsoft-json 19 -> **0**, rubocop 16 -> **0**,
 * eslint 10 -> **0**, jekyll 5 -> **0**, vueuse 26 -> **0**, hugo 50 -> 6, y en cambio
 * sqlalchemy 130 -> 107. Ésa es exactamente la forma de "el detector murió en csharp,
 * javascript, ruby y vue y sobrevivió al 99 % en python" que el integrador de la Ola N
 * encontró cruzando el censo por `(kind, lenguaje)`.
 *
 * LA SUPERFICIE DE OPERACIONES (`collectOperationUnits`) — la lectura que sí vale igual
 * en los ocho: recorrer `contains` desde el archivo BAJANDO por los contenedores
 * (`namespace-like` y `class-like`) y devolver una unidad por cada `class-like` con sus
 * miembros `function-like` directos, más —si el archivo declara funciones fuera de toda
 * clase— una unidad "archivo como módulo" con esos nombres. Nada de esto nombra un
 * lenguaje: `namespace-like`/`class-like`/`function-like` son las familias que
 * `graph/symbols.ts` ya deriva de la gramática. La comparación es UNIDAD contra UNIDAD,
 * no archivo contra archivo (dos clases que declaran `render` cada una es evidencia;
 * un archivo con una clase `render` y otra `parse` contra otro con las mismas dos al
 * revés, no).
 *
 * *** UNA IMPLEMENTACIÓN ES UN TIPO — P4 (Ola P) *** La unidad "archivo como módulo" se
 * SIGUE construyendo (cuenta para el denominador de la frecuencia documental: las
 * funciones libres de un archivo son parte del vocabulario del repo) pero YA NO cuenta
 * como una de las dos piezas intercambiables, ni como "la abstracción que ya existe".
 *
 * No es un umbral: es la definición. El remedio que este hallazgo propone —y que su
 * propio texto le dice al usuario— es `Extract Interface`: "una interfaz que ambas
 * implementen". Un archivo de funciones libres no implementa una interfaz y no se puede
 * sustituir por otro detrás de una: no hay instancia sobre la cual despachar. Que dos
 * archivos de funciones sueltas compartan el nombre de una operación es una coincidencia
 * de vocabulario, no evidencia de que sean dos implementaciones del mismo protocolo.
 *
 * EL CASO QUE LO OBLIGÓ, juzgado a mano por el integrador de la Ola O: en la gramática
 * con receptores, "el archivo como módulo" fue la aproximación con la que N5 pudo LEER
 * el lenguaje por primera vez (5 -> 258 de censo), y el integrador encontró que esa misma
 * aproximación produjo la familia falsa que explica el +5.060 %: `resources/kinds/
 * kinds.go` de hugo es un paquete de constantes y de predicados libres
 * (`IsBranch`, `GetKindMain`), no un protocolo, y se emparejaba con cualquier tipo que
 * declarara un método homónimo. Lo que cierra el caso NO es este filtro solo: es que
 * `graph/symbols.ts` (P4, misma ola) pasó a poner el TIPO RECEPTOR en `container`, así
 * que los métodos de un tipo ya no caen todos en el montón del archivo y existen, por
 * primera vez, unidades DE TIPO en esa gramática (medido, hugo: 282 unidades de tipo
 * contra 468 de módulo). Las dos mitades juntas distinguen "dos tipos que hacen lo mismo"
 * de "dos paquetes de funciones que comparten un nombre"; ninguna de las dos sola puede.
 *
 * COSTO MEDIDO EN RECALL, sobre 12 repos y con el detector real: java 17 -> 17,
 * typescript 4 -> 4, csharp/ruby/javascript/vue 0 -> 0, python 11 -> 7, go 33 -> 1.
 * Ningún lenguaje que emitía dejó de emitir. Los 4 de python que se van son pares de
 * MÓDULO contra MÓDULO (`testing/config.py` con `testing/util.py` por `pop`), la misma
 * forma que el caso de Go.
 *
 * VOCABULARIO UNIVERSAL, MEDIDO EN VEZ DE LISTADO: la versión anterior excluía UNA lista
 * hardcodeada, `{"constructor"}`, que es el nombre estructural del constructor en JS/TS y
 * en ningún otro lenguaje — así que la única defensa contra "coinciden en un nombre que
 * coincide en todos lados" protegía a dos lenguajes de ocho. Ahora se MIDE: un nombre
 * declarado por más de `maxOperationUbiquity` de las unidades del repo no cuenta como
 * operación compartida. Tabla de frecuencias en `MAX_OPERATION_UBIQUITY_SPEC`: el mismo
 * corte deja fuera `__init__` (51,5 % en click), `initialize` (52,7 % en jekyll),
 * `constructor` (48,7 % en nest), `toString`/`hashCode`/`equals` en guava, `String` en
 * hugo y `create` (64,3 % en eslint), sin nombrar ninguno.
 *
 * LA ARISTA NOMINAL ES EVIDENCIA NEGATIVA, y por eso NO se filtra por `provenance`: el
 * resto de este archivo excluye `inferred`/`ambiguous` porque ahí una arista AFIRMA el
 * hallazgo ("este archivo depende de aquél"). La arista de tipo hace lo contrario:
 * decide que el par NO se reporte. Aplicar el mismo filtro a las dos es lo que hace que
 * "lo conservador" cambie de signo sin que nadie lo note — para no AFIRMAR "nada las une"
 * hay que mirar TODA la evidencia de que algo las une. Y el ancestro común se busca
 * ahora TRANSITIVAMENTE (`hasCommonNominalAncestor`): A extiende X, B extiende Y, X e Y
 * implementan Z — la abstracción común existe, dos saltos más arriba.
 *
 * LA ABSTRACCIÓN QUE YA EXISTE Y EL GRAFO NO RESUELVE — el caso testigo de la Ola N, y
 * la razón por la que arreglar la `provenance` no alcanza. El hallazgo
 * `coupling-without-abstraction:Hhu6ereaF85uGiq2` afirmaba que nada une
 * `HashBiMap.java` con `ImmutableBiMap.java` cuando las dos declaran `implements
 * BiMap<K,V>`. Medido sobre el grafo real de guava: los 19 archivos `*BiMap*.java` del
 * repo emiten CERO aristas `extends`/`implements` — de ninguna `provenance` — y el repo
 * entero tiene 117 aristas nominales cross-file `resolved` + 206 `inferred` para 3.342
 * archivos. La causa está en la resolución por nombre (el árbol está triplicado:
 * `android/guava/`, `guava/`, `guava-gwt/`) y no se arregla desde acá. Lo que SÍ se puede
 * leer sin resolver nada es la INTERFAZ: `declaresExistingAbstraction` busca una unidad
 * de un TERCER archivo cuyo protocolo entero (>= `minAbstractionProtocol` operaciones)
 * esté declarado por las dos piezas del par — que es la forma exacta de una interfaz ya
 * extraída. Si existe, "Extract Interface" no es el remedio y el hallazgo no se emite.
 * Medido sobre 12 repos: suprime 14 candidatos que los otros dos chequeos no alcanzan.
 *
 * QUÉ NO SE TOCÓ Y POR QUÉ: la RELACIÓN sigue siendo la co-dependencia (>= `minClients`
 * archivos que dependen de A y de B a la vez). Se probó, midiéndolo, invertir el ancla
 * —partir de "hacen lo mismo" y corroborar con la clientela, que es lo que
 * `RAICES.md` §2 pide para todo el catálogo— y el resultado sobre guava lo descarta para
 * esta ola: 271 hallazgos cuyos seis primeros son el MISMO archivo dos veces
 * (`android/guava-testlib/.../AbstractMapTester.java` contra
 * `guava-testlib/.../AbstractMapTester.java`, superficies idénticas), porque sin la
 * co-dependencia el ancla no distingue "dos implementaciones intercambiables" de "el
 * mismo archivo vendorizado dos veces". Eso necesita una exclusión de árboles duplicados
 * que es trabajo de `duplication`/`ingest-exclusion`, no de este archivo. Queda medido y
 * escrito, no anotado para después: el experimento está en
 * `scripts/probes/n5-ancla.mts`.
 *
 * ── OLA R, FRENTE R4: TODO-Y-PARTE (`carries`/`instantiates`) ──────────────
 *
 * El triaje de ola-q (`ola-q/informes/INTEGRADOR.md` §2.2, reproducido por
 * este frente antes de tocar el código) nombró un hecho de composición que
 * este detector podía leer directo del grafo y no leía: si A y B están
 * unidos por una arista `carries` o `instantiates` — A construye B, o B
 * queda referenciado como valor desde un símbolo de A — son un PAR
 * DELIBERADO, no dos piezas intercambiables que un cliente hardcodeó por
 * falta de abstracción. Es la misma figura que "PAR FACHADA+COMPAÑERO,
 * USADO A PROPÓSITO COMO UNIDAD" ya nombra en "CON QUÉ SE CONFUNDE" — hasta
 * ahora el detector no tenía forma de DISTINGUIR esa cohesión intencional de
 * un acoplamiento accidental (ambas producen la misma firma de
 * co-ocurrencia); `carries`/`instantiates` es la evidencia ESTRUCTURAL que
 * cierra esa distinción para el subconjunto de casos donde el grafo la
 * registró, sin adivinar nada por nombre.
 *
 * `WHOLE_PART_EDGE_KINDS` se agrega al MISMO conjunto que ya puebla
 * `nominalPairs`/`nominalTargetsOf` (ver `projectDependencies`), así que
 * `hasCommonNominalAncestor` los excluye por el mismo mecanismo — directo, o
 * transitivo vía un tercer archivo — que ya usa para las aristas de tipo:
 * ningún `EdgeKind` nuevo, ninguna función nueva del tamaño que el triaje
 * anticipó. Misma razón para leer CUALQUIER `provenance` (antes del filtro
 * de confianza, ver el bucle de `projectDependencies`): "LA ARISTA NOMINAL
 * ES EVIDENCIA NEGATIVA" de arriba se aplica igual acá — para no afirmar
 * "esto es un acoplamiento sin abstracción" hay que mirar TODA la evidencia
 * de que en realidad es una composición deliberada, incluida la de baja
 * confianza.
 *
 * MEDIDO por este frente sobre el corpus real, antes y después del cambio
 * (13 repos, `dump-hallazgos.mts` con `maxFindings: "unlimited"`): ver el
 * informe de esta tarea para la tabla completa. El propio triaje ya había
 * verificado a mano que la familia TODO-Y-PARTE explica una porción de los
 * únicos candidatos con 2+ operaciones compartidas (`Invokable.java`↔
 * `Parameter.java` en guava: `Parameter` DESCRIBE un parámetro de un
 * `Invokable`; `container.ts`↔`module.ts` en nest) — casos que hoy sólo se
 * suprimían porque un juez humano los había marcado falso a mano, no porque
 * el detector supiera distinguirlos.
 *
 * QUÉ NO CAMBIA: la segunda mitad de la sugerencia del triaje ("exigir ≥2
 * operaciones compartidas SALVO que una arista `carries`/`instantiates` lo
 * confirme") NO se implementa acá — es un cambio al UMBRAL `minSharedOperations`,
 * no al hecho TODO-Y-PARTE, y esta tarea sólo trae el hecho nuevo. Queda
 * para quien mida esa segunda mitad por separado. (OLA Z, FRENTE Z1: medida y
 * aterrizada; ver la sección de abajo, incluida la razón por la que la mitad
 * "SALVO" NO se puede implementar tal como está escrita.)
 *
 * ── OLA Z, FRENTE Z1: UN NOMBRE COMPARTIDO ES UNA COINCIDENCIA DE IDIOMA ───
 *
 * LA MITAD "SALVO" DEL TRIAJE NO SE PUEDE IMPLEMENTAR TAL COMO ESTÁ ESCRITA, y
 * la razón es el propio arreglo de la Ola R, no una objeción de gusto: el
 * triaje pedía "exigir ≥2 operaciones compartidas SALVO que una arista
 * `carries`/`instantiates` lo confirme", pero desde la Ola R esas dos aristas
 * SUPRIMEN el par (`hasCommonNominalAncestor`, arriba), y ese chequeo corre
 * ANTES que el de operaciones en el bucle de candidatos. Un par unido por
 * `carries`/`instantiates` no llega vivo al piso de operaciones: la excepción
 * es VACÍA por construcción. Verificado por lectura del bucle y por medición
 * (cero candidatos con esa arista llegan al chequeo). Se implementa entonces
 * la mitad que sí tiene contenido —el piso de DOS— con la excepción
 * REFORMULADA sobre la única evidencia que sigue disponible en ese punto: la
 * FORMA del protocolo compartido.
 *
 * EL PISO DE DOS, Y QUÉ INTENCIÓN VERIFICA. `minSharedOperations` pasa de
 * `presencia()` (¿existe al menos UNA operación en común?) a un piso de DOS.
 * La intención que verifica: *un solo nombre en común es una coincidencia de
 * VOCABULARIO —el idioma del lenguaje o del ecosistema—, no evidencia de que
 * dos piezas sean intercambiables; dos nombres en común ya son un PROTOCOLO.*
 * Es el mismo razonamiento que `MIN_CLIENTS_SPEC` ya cita para la pregunta
 * gemela ("dos toleran coincidencia, la tercera ya no", Regla de Tres), un
 * peldaño más abajo porque acá la unidad de conteo es el nombre, no el sitio.
 *
 * MEDIDO por este frente sobre los 13 repos, con el detector real y una sola
 * corrida de `analyzeRepo` por repo (A/B sobre el MISMO grafo, para que la
 * edición simultánea de otros frentes no pueda contaminar el delta): de los 11
 * hallazgos vivos, **9 comparten EXACTAMENTE UN nombre de operación**, y ese
 * nombre es, caso por caso, el idioma del lenguaje o un nombre genérico:
 * `IsZero` en 4 de ellos —26 declaraciones en 24 archivos de hugo, imitando
 * `time.Time.IsZero()` de la stdlib de Go, reproducido con `grep` sobre la
 * fuente—, `Data` en 2 —14 declaraciones, el nombre de un miembro de la
 * interfaz de página/recurso del repo—, y `escape` /
 * `tryInternalFastPathGetFailure` en los 3 de guava, donde el segundo miembro
 * del par es la FÁBRICA o la UTILIDAD ESTÁTICA del primero. Es la misma
 * familia que la Ola Q midió como "25 de 36 comparten exactamente un nombre de
 * operación, y el nombre es protocolo de lenguaje", con la población de hoy y
 * contada por este frente.
 *
 * POR QUÉ `maxOperationUbiquity` NO ALCANZA A ESOS NOMBRES, medido: mide
 * FRECUENCIA DOCUMENTAL sobre las unidades del REPO ENTERO, y esa fracción se
 * DILUYE con el tamaño del repo — `IsZero` en 26 unidades de las 762 de hugo
 * da 3,4 %, por debajo del corte de 5 %. Es el bug que
 * `ola-t/informes/INTEGRADOR.md` §7 nombra con archivo y línea ("el
 * denominador de ubicuidad es el repo entero"). El piso de DOS no arregla ese
 * denominador —queda declarado, no escondido— pero corta la familia entera por
 * otra vía, que además NO depende de calibrar ninguna fracción contra este
 * corpus.
 *
 * LA EXCEPCIÓN, REFORMULADA Y CON SU INTENCIÓN: un solo nombre compartido
 * SIGUE valiendo cuando ese nombre es CASI TODO lo que cada una de las dos
 * unidades declara (`minSharedProtocolShare`). La intención: *dos tipos de UNA
 * sola operación que declaran la MISMA operación no comparten un idioma —
 * comparten su protocolo entero; son dos implementaciones del mismo contrato
 * funcional, y "Extract Interface" es exactamente su remedio.* Es lo contrario
 * del caso medido arriba, donde el nombre compartido es 1 de las 15 o 20
 * operaciones que cada extremo declara: ahí el nombre es un accidente del
 * vocabulario, acá es el tipo entero. Se mide como la MENOR de las dos
 * fracciones (compartidas/declaradas por A, compartidas/declaradas por B) —
 * exigirlo en AMBOS extremos, por la misma razón que
 * `MIN_CLIENT_SHARE_OF_FANIN_SPEC` ya lo exige en los dos: con una sola de las
 * dos, un tipo de una operación emparejado con un tipo de veinte pasaría, y
 * ése es justamente el caso que este piso vino a cortar.
 *
 * ALCANCE MEDIDO DE LA EXCEPCIÓN, sin adornar: en los 13 repos del corpus NO
 * rescata ni un hallazgo (los 11 vivos tienen `protocolShare` entre 0,018 y
 * 0,5, y el corte es ESTRICTO). En las 3 aplicaciones de `corpus-app/` rescata
 * EXACTAMENTE UNO, y vale la pena escribir cuál porque es la forma que la
 * excepción existe para no perder: dos tipos que declaran una sola operación y
 * declaran la MISMA (`PrepareGitCmd`, dos contextos de repositorio temporal en
 * la aplicación go), con `protocolShare` = 1,0 en los dos extremos. Ese caso
 * está juzgado FALSO por este frente — pero su causa no es el criterio de
 * operaciones sino que uno de los dos tipos EMBEBE al otro y el grafo no
 * registra ese embebido como arista nominal, o sea el mismo hueco de
 * resolución que ya deja pasar `A extends B extends C` cuando la cadena cruza
 * un límite de módulo de build. Suprimirlo desde acá sería tapar un hueco
 * ajeno con un umbral propio.
 *
 * EL BORDE, DECLARADO PORQUE ES FRÁGIL: la fracción se calcula sobre TODOS los
 * miembros `function-like` de la unidad, incluido el CONSTRUCTOR. En las
 * gramáticas donde el constructor se llama como el tipo, eso le suma uno al
 * denominador, y un tipo de una sola operación real cae en 0,5 exacto — o sea
 * afuera, porque "mayoría" es ESTRICTAMENTE más de la mitad (mismo criterio
 * que `MAJORITY_INFERRED_RATIO`). Medido en la aplicación java: dos
 * implementaciones de una interfaz de una sola operación quedan en 0,5 y no
 * pasan. En ese caso concreto quedar afuera fue lo CORRECTO (la interfaz que
 * las une existe, sólo que es externa al repo y el grafo no la ve), pero el
 * mecanismo acertó por el denominador, no por su fuerza: si alguien saca el
 * constructor del denominador, la excepción va a rescatar MÁS, y hay que
 * medirlo antes.
 *
 * CONSECUENCIA: se implementa la operacionalización 2 (`minSharedOperations`,
 * `bestSharedOperations` más abajo) — no la 1. `needsEdges` NO cambia: la
 * comparación usa `contains` (nunca declarado en `needsEdges`, ver
 * `detect/types.ts`), no `references`/`calls` adicionales. Efecto sobre el
 * TOTAL de hallazgos, medido corriendo el detector completo (no la
 * aproximación del script de medición) sobre nest antes/después: ver el
 * informe de esta tarea para el número exacto — la aproximación del script
 * (que no aplica `maxFindings`/orden de candidatos idéntico) ya muestra el
 * recorte de 50 (tope de `maxFindings`, con más candidatos brutos detrás) a
 * un puñado de un solo dígito.
 *
 * QUÉ NO ES ESCONDER EL DETECTOR: el recorte a 4/1/27 sobrevivientes en tres
 * repos reales NO es "bajar el volumen a cero" — sigue habiendo hallazgos, y
 * el criterio que los separa del resto (comparten vocabulario de operaciones
 * DECLARADO, no inventado por nombre de clase/carpeta) es estructural y
 * verificable. Que la mayoría de los candidatos de co-ocurrencia NO tengan
 * vocabulario en común es, medido, la MISMA conclusión que ya daba el 0 % de
 * precisión de antes de este cambio: casi ningún par co-ocurrente de este
 * catálogo es genuinamente intercambiable. Subir el volumen de verdaderos
 * (parte del encargo de esta ola, no sólo bajar falsos) queda limitado por lo
 * que el corpus medido realmente contiene — no por una decisión de esconder.
 *
 * DESVIACIÓN DE CONTRATO-F5.md §4 (Contrato 4), MEDIDA, no supuesta: el
 * contrato describe `InterFileDetector.needsEdges`/`.needsMetrics`/
 * `.minProvenance`, `RunContext.trustedEdge`/`.provenanceMix`, y
 * `RepoUnit.metrics` (con `metricValues` sobre `GRAPH_METRICS`) como YA
 * disponibles para los 16 detectores de esta ola. Verificado por grep antes
 * de escribir este archivo: NINGUNO de esos símbolos existe todavía en
 * `detect/types.ts` ni en `detect/run.ts` (la infraestructura de "P3",
 * CONTRATO-F5.md §5.2, no había aterrizado en el snapshot con el que se
 * trabajó esta tarea). Por eso este archivo NO importa nada de
 * `graph/metrics/*` (ni siquiera tipos) y calcula su propia proyección de
 * dependencias a grano archivo directamente sobre `repo.graph.nodes`/
 * `.edges` — el mismo criterio, y la misma excepción documentada, que
 * `dependency-cycle.ts`/`orphan-file.ts`/`unused-symbol.ts` ya usan ("no
 * tenían acceso a la superficie compartida, así que resuelven localmente").
 * Consecuencia práctica de la ausencia de `needsEdges`: cuando el grafo no
 * tiene ninguna arista de dependencia utilizable, este detector no tiene
 * forma de reportar `no-aplicable` (ese status lo decide el RUNNER, que
 * todavía no sabe de `needsEdges`) — devuelve `[]`, indistinguible hoy de
 * "corrió y no encontró nada". Cuando CONTRATO-F4.md §4.3 aterrice, este
 * archivo debería ganar `needsEdges: ["references", "extends", "implements",
 * "mixes-in", "instantiates", "imports", "satisfies"]` — un cambio de una
 * línea, no un rediseño.
 */
import { citado, pisoDeclarado, presupuesto } from "../thresholds.js";
import type { Threshold } from "../thresholds.js";
import { fileNodeId } from "../../graph/types.js";
import type { CodeGraph, CodeGraphEdge, CodeGraphNode } from "../../graph/types.js";
import type { InterFileDetector, RawFinding, RepoUnit, RoleLocation, RunContext } from "../types.js";

type ThresholdKey =
  | "minClients"
  | "maxUbiquitousFanInRatio"
  | "maxFanoutConsidered"
  | "minClientShareOfFanIn"
  | "minSharedOperations"
  | "minSharedProtocolShare"
  | "maxOperationUbiquity"
  | "minAbstractionProtocol";

/**
 * "Varios clientes", no dos: dos archivos que dependen del mismo par es tan
 * fácil de explicar por coincidencia como por acoplamiento sistemático. Tres
 * clientes independientes compartiendo exactamente el mismo par ya es un
 * patrón que vale la pena mirar. R3 (auditoría de umbrales inventados): no
 * hay literatura que fije un N para "acoplamiento común" específicamente,
 * pero el corte en sí — dos toleran coincidencia, tres ya no — es la Regla
 * de Tres (Roberts, popularizada por Fowler, "Refactoring", 1999), el mismo
 * razonamiento que `scattered-instantiation.ts#MIN_SITES_SPEC` ya cita para
 * la pregunta gemela ("varios sitios, no dos"). Antes `pisoDeclarado(3, …)`,
 * mismo valor.
 */
const MIN_CLIENTS_SPEC = citado(3, {
  work: "Fowler, Refactoring: Improving the Design of Existing Code (1999)",
  rule: "Regla de Tres (Roberts): dos ocurrencias toleran coincidencia, la tercera ya no",
});

/**
 * Ver "CON QUÉ SE CONFUNDE": infraestructura ubicua.
 *
 * JUICIO DE PRECISIÓN (frente de nivel 1, agosto 2026) — 0.25 NO filtraba
 * ningún caso real, medido: instrumenté el detector (ratioA/ratioB por
 * candidato) y corrí sobre CUATRO poblaciones reales. El fan-in relativo de
 * un archivo genuinamente ubicuo (verificado a mano en cada caso) nunca se
 * acercó a 0.25:
 *
 *   | archivo (repo)                          | fan-in real | ratio  |
 *   |------------------------------------------|------------:|-------:|
 *   | `exceptions.py` (click, 30 archivos)      | 7           | 0.233  |
 *   | `globals.py`/`termui.py` (click)          | 6           | 0.20   |
 *   | `livereload.js` (jekyll, 107 archivos)     | 14          | 0.131  |
 *   | `errors.rb` (jekyll)                      | 13          | 0.121  |
 *   | `types.ts`/`code-grammar.ts` (src/, 187)   | 32          | 0.171  |
 *   | `references.ts` (src/)                    | 23          | 0.123  |
 *
 * Las SEIS son módulos centrales verificados a mano (excepciones base,
 * contexto global, tipos compartidos, gramática compartida) — ninguna
 * llegó ni cerca de 0.25, y la de MAYOR ratio (0.233, `exceptions.py`)
 * quedó a 7 puntos porcentuales de distancia del piso viejo. La causa:
 * 0.25 fue elegido a mano sin medir contra ningún repo real (mismo defecto
 * que R3 ya nombra para dos tercios del catálogo). Un piso relativo tiene
 * sentido (adapta al tamaño del repo, a diferencia de un piso absoluto,
 * que no puede servir igual a un repo de 30 archivos que a uno de 941) pero
 * el NÚMERO estaba mal calibrado. Bajado a 0.10: por encima de las seis
 * filas de la tabla (0.121-0.233), y con margen debajo de la más baja
 * (0.121) para no rozarla. Efecto medido sobre las mismas 4 poblaciones:
 * de 44 hallazgos muestreados con el piso viejo, TODOS los casos anclados
 * en uno de estos seis archivos (o su misma clase de módulo central)
 * dejan de emitir; sobre `src/` el conteo total de `coupling-without-
 * abstraction` bajó de 31 a un número medido en la ronda de verificación
 * del frente (ver el reporte de la ola). No se subió más allá de 0.10
 * porque el mismo experimento encontró candidatos genuinamente más
 * angostos (p.ej. `graph/metrics/budget.ts`+`projection.ts` en `src/`,
 * ratio ≤0.05 cada uno) que SÍ podrían ser el patrón real que este
 * detector busca — bajar más arriesgaba apagar esos también sin haberlos
 * verificado uno por uno.
 */
const MAX_UBIQUITOUS_FAN_IN_RATIO_SPEC = pisoDeclarado(0.1, {
  rationale:
    "un archivo del que depende más de un 10% de los archivos del repo se comporta como infraestructura " +
    "transversal (logging, configuración, un tipo de excepción compartido, tipos/gramática compartidos) más que " +
    "como una pieza concreta específica de un par acoplado; excluirlo como miembro del par evita que este " +
    "detector reclame una abstracción para algo que ya cumple ese rol por ubicuidad. Piso bajado de 0.25 a 0.10 " +
    "tras medir seis módulos centrales reales (click/jekyll/src/, ver JUICIO DE PRECISIÓN arriba) cuyo fan-in " +
    "real (0.121-0.233) el piso viejo nunca alcanzaba a excluir.",
});

/** Ver "CON QUÉ SE CONFUNDE": archivo agregador / punto de entrada / contenedor de DI. */
const MAX_FANOUT_CONSIDERED_SPEC = pisoDeclarado(60, {
  rationale:
    "un archivo con más de 60 dependencias propias declaradas se comporta como un agregador o punto de " +
    "ensamblado (contenedor de inyección de dependencias, punto de entrada) que necesita conocer muchas piezas " +
    "concretas por diseño, no como un cliente más del par; además, enumerar todos los pares de un archivo con " +
    "fan-out de cientos es una explosión combinatoria que no aporta señal nueva sobre el mismo par ya contado " +
    "por sus otros clientes.",
});

/** Ver "CONCENTRACIÓN DEL CLIENTELA EN {A, B}" y "EL NÚMERO, MEDIDO" en el docstring del
 *  módulo — 0.30, no la mayoría (0.5) que se probó primero: la distribución real de hugo
 *  tiene un escalón entre 0.30 (8 parejas sobreviven) y 0.35 (4), y 0.5 deja sólo 3 de 40 —
 *  un recorte del 92% en un solo repo que la ola anterior nombró como la forma exacta del
 *  apagón a evitar. 0.30 se para ANTES de ese escalón. */
const MIN_CLIENT_SHARE_OF_FANIN_SPEC = pisoDeclarado(0.3, {
  rationale:
    "si menos de un tercio de los archivos que dependen de A (o de B) son parte de ESTE grupo de clientes, A (o " +
    "B) es popular por su cuenta —un módulo independientemente relevante para otras partes del repo, no una " +
    "pieza concreta que este grupo hardcodeó sin abstracción—; exigirlo en AMBOS extremos es lo que separa un " +
    "acoplamiento específico de este grupo (identity.go/hashing.go en hugo, medido: concentración 0.18-0.27, " +
    "por debajo del piso en las 40 parejas muestreadas) de dos módulos centrales de un subsistema grande que, " +
    "por tamaño de repo, nunca cruzan el piso de ubicuidad sobre el TOTAL. El piso queda en 0.30 y no en 0.5 " +
    "porque la distribución MEDIDA de las 40 parejas de hugo tiene un escalón marcado ahí (0.30→8 sobreviven, " +
    "0.35→4): subir a 0.5 recorta el volumen al 8% de un solo repo sin que la precisión medida lo respalde " +
    "(ningún veredicto verdadero encontrado a ningún nivel de concentración) — ver el docstring del módulo.",
});

/**
 * Ver "OLA Z, FRENTE Z1: UN NOMBRE COMPARTIDO ES UNA COINCIDENCIA DE IDIOMA" en el
 * docstring del módulo. Antes era `presencia()` (¿comparten AL MENOS UNA operación
 * declarada, sí o no?); la población viva entera medida sobre los 13 repos comparte
 * EXACTAMENTE UNA, y ese único nombre es el idioma del lenguaje o del ecosistema
 * (`IsZero` en 26 archivos de hugo, `Data`, `getSubjectGenerator` en 56 de
 * guava-testlib), no evidencia de que las dos piezas sean intercambiables. La pregunta
 * dejó de ser binaria en cuanto se midió que la respuesta "sí" la da siempre una
 * coincidencia de vocabulario: DOS nombres en común ya son un protocolo.
 *
 * `"constructor"` y el resto del vocabulario universal ya salen antes, por frecuencia
 * documental medida (`MAX_OPERATION_UBIQUITY_SPEC`) y no por lista.
 */
const MIN_SHARED_OPERATIONS_SPEC = citado(2, {
  work: "Fowler, Refactoring: Improving the Design of Existing Code (1999)",
  rule: "Regla de Tres (Roberts): una ocurrencia es coincidencia — acá, un solo nombre de operación en común es el idioma del lenguaje, dos ya son un protocolo",
});

/**
 * LA EXCEPCIÓN al piso de dos — ver "LA EXCEPCIÓN, REFORMULADA Y CON SU INTENCIÓN" en el
 * docstring del módulo. Fracción MÍNIMA (entre A y B) del protocolo declarado de cada
 * unidad que tiene que estar compartida para que UN SOLO nombre siga contando: si las dos
 * unidades declaran esa única operación y casi nada más, no comparten un idioma —
 * comparten su contrato entero. Mismo corte de "mayoría" (0,5) que el resto de este
 * archivo (`MAJORITY_INFERRED_RATIO`, `MAJORITY_OF_PROTOCOL`) y que el catálogo usan para
 * la misma palabra, y misma exigencia EN AMBOS EXTREMOS que
 * `MIN_CLIENT_SHARE_OF_FANIN_SPEC`.
 */
const MIN_SHARED_PROTOCOL_SHARE_SPEC = pisoDeclarado(0.5, {
  rationale:
    "un solo nombre de operación en común vuelve a ser evidencia cuando ESE nombre es la mayoría de lo que cada " +
    "una de las dos unidades declara: dos tipos de una sola operación que declaran la MISMA operación son dos " +
    "implementaciones del mismo contrato funcional, y 'Extract Interface' es literalmente su remedio; un nombre " +
    "compartido entre dos tipos de quince operaciones cada uno es vocabulario, no protocolo. Se exige la MENOR de " +
    "las dos fracciones (compartidas/declaradas por A, compartidas/declaradas por B) por la misma razón que la " +
    "concentración de clientela se exige en ambos extremos: con una sola, un tipo de una operación emparejado con " +
    "uno de veinte pasaría, que es justo el caso que el piso de dos vino a cortar.",
});

/**
 * Ver "VOCABULARIO UNIVERSAL, MEDIDO EN VEZ DE LISTADO" en el docstring del módulo.
 *
 * Reemplaza a la lista hardcodeada `UNIVERSAL_MEMBER_NAMES = {"constructor"}` que este
 * archivo tenía antes, y que era la razón por la que "¿comparten operaciones?" NO
 * significaba lo mismo en los ocho lenguajes: `constructor` es el nombre estructural del
 * constructor en JS/TS y en NINGÚN otro lenguaje, así que la única exclusión del catálogo
 * sólo protegía a dos. Frecuencia documental medida sobre 12 repos (unidades de operación
 * de este mismo archivo, ver la tabla), nombre más frecuente de cada repo:
 *
 *   | repo (unidades)        | 1.º              | 2.º              | 3.º            |
 *   |------------------------|------------------|------------------|----------------|
 *   | click (103, py)        | `__init__` 51,5 %| `__repr__` 18,4 %| `convert` 13,6 %|
 *   | sqlalchemy (1481, py)  | `__init__` 41,4 %| `__call__` 6,2 % | `__repr__` 5,5 %|
 *   | jekyll (110, rb)       | `initialize` 52,7 %| `render` 10,0 % | `inspect` 10,0 %|
 *   | rubocop (973, rb)      | `on_send` 25,2 % | `autocorrect` 13,4 %| `message` 13,3 %|
 *   | nest (737, ts)         | `constructor` 48,7 %| `create` 9,6 %| `bootstrap` 6,8 %|
 *   | eslint (457, js)       | `create` 64,3 %  | `constructor` 15,1 %| `moveNext` 2,0 %|
 *   | preact (92, js)        | `render` 27,2 %  | `componentDidMount` 6,5 %| `constructor` 5,4 %|
 *   | guava (3945, java)     | `toString` 14,4 %| `get` 10,3 %     | `hashCode` 10,0 %|
 *   | newtonsoft (257, c#)   | `WriteJson` 6,6 %| `ReadJson` 6,6 % | `CanConvert` 5,8 %|
 *   | hugo (762, go)         | `init` 10,6 %    | `New` 9,3 %      | `String` 6,8 % |
 *   | vueuse (368, vue/ts)   | `mounted` 3,5 %  | `getDefaultScheduler` 2,4 %| `setup` 1,1 %|
 *
 * El corte en 0,05 deja fuera, SIN nombrar ninguno, a los constructores de los cinco
 * lenguajes que le dan un nombre fijo (`__init__`, `initialize`, `constructor`), al
 * contrato universal de objeto de Java (`toString`/`hashCode`/`equals`), al de Go
 * (`String`), a la convención de módulo de eslint (`create`) y a la de cop de rubocop
 * (`on_send`); y deja pasar todo lo que en esos mismos repos es vocabulario de un
 * subsistema (`bind_processor` 3,7 %, `intercept` 3,8 %, `pause` 0,8 %). En Java y C# el
 * constructor se llama como la clase, así que nunca coincide entre dos clases distintas y
 * no necesita exclusión — otra razón por la que una LISTA no puede ser el mecanismo.
 *
 * GUARDA DE REPO CHICO, medida: el piso es una FRACCIÓN, así que en un repo de 19
 * unidades (cobra) un nombre declarado por UNA sola unidad ya vale 5,3 % y quedaría
 * excluido — el detector se apagaría entero por tamaño de repo. Por eso un nombre
 * declarado por dos unidades o menos NUNCA cuenta como universal: dos unidades que
 * comparten un nombre son, por construcción, el par que se está evaluando.
 */
const MAX_OPERATION_UBIQUITY_SPEC = pisoDeclarado(0.05, {
  rationale:
    "un nombre de operación declarado por más del 5% de las unidades del repo es vocabulario universal de ese " +
    "repo o de su lenguaje (constructor con nombre fijo, contrato de objeto, convención de módulo del framework), " +
    "no evidencia de que dos piezas concretas hagan lo mismo: coincide en demasiados pares como para discriminar " +
    "ninguno. Medido sobre 12 repos y los 8 lenguajes (ver la tabla del comentario): el corte separa los nombres " +
    "universales de cada lenguaje del vocabulario propio de un subsistema. Un nombre declarado por 2 unidades o " +
    "menos nunca es universal — son el par que se evalúa.",
});

/**
 * Ver "LA ABSTRACCIÓN QUE YA EXISTE Y EL GRAFO NO RESUELVE" en el docstring del módulo.
 * Cuántas operaciones tiene que declarar una unidad de un TERCER archivo para que valga
 * como "la abstracción común ya existe". Con una sola operación, cualquier archivo que
 * declare una función homónima calificaría y el detector se apagaría por accidente; con
 * dos ya hay un protocolo, que es lo que "Extract Interface" produciría.
 */
const MIN_ABSTRACTION_PROTOCOL_SPEC = pisoDeclarado(2, {
  rationale:
    "una unidad de un tercer archivo cuenta como abstracción común YA EXISTENTE sólo si declara al menos dos " +
    "operaciones y TODAS ellas están declaradas por las dos piezas del par: eso es exactamente la forma de una " +
    "interfaz ya extraída (sus miembros son un subconjunto de los de cada implementación). Con una sola " +
    "operación no hay protocolo — cualquier archivo con una función homónima apagaría el hallazgo.",
});

const MAX_FINDINGS_SPEC = presupuesto(50, {
  rationale:
    "un panel legible no muestra de forma útil más de unas pocas decenas de pares acoplados a la vez; es un " +
    "tope de volumen propio, no un umbral de detección.",
});

/** Mayoría de aristas `inferred` (mismo corte 0.5 que el resto del catálogo
 *  F5 usa para esta decisión) — ver "TECHO DE SEVERIDAD POR PROVENANCE" en el
 *  docstring del módulo. No es un `Threshold` de detección: no decide SI se
 *  emite, sólo cuánto se acota la severidad de lo que ya se decidió emitir. */
const MAJORITY_INFERRED_RATIO = 0.5;
const LOW_CONFIDENCE_SEVERITY_CEILING = 35;

/**
 * QUÉ SEPARA "LA ABSTRACCIÓN YA EXISTE" DE "HAY UNA TERCERA IMPLEMENTACIÓN" — ver
 * `declaresExistingAbstraction`. La MAYORÍA (mismo corte 0.5 que `MAJORITY_INFERRED_RATIO`
 * y que el resto del catálogo usa para "mayoría") de las operaciones que declara la unidad
 * candidata a abstracción tiene que ser parte del protocolo compartido por el par: una
 * interfaz es casi toda protocolo compartido, mientras que una TERCERA implementación que
 * comparte dos nombres y declara treinta propios no es la abstracción de nadie.
 *
 * La distinción importa y no es cosmética: si un tercer archivo implementa el MISMO
 * protocolo sin abstraerlo, el problema que este detector busca es MÁS grande, no menor —
 * suprimir ahí sería apagar justo el caso más fuerte.
 */
const MAJORITY_OF_PROTOCOL = 0.5;

/** Kinds "nominales" — establecen una relación de TIPO, y por eso cuentan como abstracción ya presente entre A y B. */
const ABSTRACTING_EDGE_KINDS: ReadonlySet<CodeGraphEdge["kind"]> = new Set(["extends", "implements", "mixes-in", "satisfies"]);

/**
 * Kinds TODO-Y-PARTE — ver "OLA R, FRENTE R4: TODO-Y-PARTE" en el docstring del módulo.
 * `carries` (un símbolo de A tiene a un invocable de B como valor: campo, variable,
 * parámetro por defecto) e `instantiates` (A construye B, o B construye A) son evidencia de
 * que A y B forman un PAR DELIBERADO, no dos piezas intercambiables sin abstracción común.
 * Se consulta junto con `ABSTRACTING_EDGE_KINDS` en `projectDependencies` — misma bolsa
 * (`nominalPairs`/`nominalTargetsOf`), mismo mecanismo transitivo de
 * `hasCommonNominalAncestor`, ningún `EdgeKind` nuevo.
 */
const WHOLE_PART_EDGE_KINDS: ReadonlySet<CodeGraphEdge["kind"]> = new Set(["carries", "instantiates"]);

/**
 * Un símbolo SIN nombre propio. `graph/edges/portador.ts` le da a cada literal
 * función/arrow anónimo un id sintético `<anon@n>` (ver su docstring): no es un nombre
 * declarado que otro archivo pueda declarar también, así que nunca es una "operación
 * compartida". Se reconoce por la FORMA del id sintético (los delimitadores que el propio
 * grafo usa para marcar "esto no es un identificador del lenguaje"), no por su texto.
 */
function isAnonymousName(name: string): boolean {
  return name.includes("<") || name.includes(">");
}

function fileName(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

/** Par no ordenado, clave estable — mismo criterio que `dependency-cycle.ts#pairKey`. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a} ${b}` : `${b} ${a}`;
}

interface PairProvenanceCount {
  total: number;
  inferred: number;
}

/**
 * La superficie de operaciones de UNA unidad declarante — ver "LA SUPERFICIE DE
 * OPERACIONES" en el docstring del módulo. Una unidad es un símbolo `class-like`
 * (a cualquier profundidad bajo contenedores `namespace-like`/`class-like`) con los
 * nombres de sus miembros `function-like` directos, o el ARCHIVO COMO MÓDULO con los
 * nombres de las funciones que declara fuera de toda clase.
 */
interface OperationUnit {
  readonly file: string;
  readonly names: ReadonlySet<string>;
  /**
   * P4 (Ola P) — `true` sólo para la unidad "archivo como módulo" (las funciones que el
   * archivo declara FUERA de toda unidad tipo-clase). Ver `UNA IMPLEMENTACIÓN ES UN TIPO`
   * en el docstring del módulo: cuenta para el denominador de la frecuencia documental,
   * pero no es una implementación intercambiable.
   */
  readonly isModule: boolean;
}

interface DependencyProjection {
  /** archivo origen -> conjunto de archivos de los que depende (cualquier kind salvo `contains`, provenance declared/resolved). */
  readonly dependsOn: ReadonlyMap<string, ReadonlySet<string>>;
  /** archivo destino -> conjunto de archivos ORIGEN que dependen de él (mismo filtro). */
  readonly dependedBy: ReadonlyMap<string, ReadonlySet<string>>;
  /** par no ordenado (`ABSTRACTING_EDGE_KINDS` O `WHOLE_PART_EDGE_KINDS` — nominal-de-tipo O
   *  todo-y-parte, ver "OLA R, FRENTE R4" en el docstring del módulo) -> `true` si existe una
   *  arista directa entre ambos. CUALQUIER `provenance`, a diferencia de `dependsOn` — ver
   *  "LA ARISTA NOMINAL ES EVIDENCIA NEGATIVA" en el docstring del módulo: el nombre del campo
   *  quedó como estaba (`nominal…`) para no repartir el rename por todo el archivo, pero desde
   *  esta ola también captura `carries`/`instantiates`. */
  readonly nominalPairs: ReadonlySet<string>;
  /** archivo -> conjunto de archivos hacia los que tiene una arista `ABSTRACTING_EDGE_KINDS` O
   *  `WHOLE_PART_EDGE_KINDS` (supertipo/interfaz declarados, O construye/porta), cualquier
   *  `provenance`. */
  readonly nominalTargetsOf: ReadonlyMap<string, ReadonlySet<string>>;
  /** memo del cierre transitivo de `nominalTargetsOf` — se llena bajo demanda en `nominalAncestorsOf`. */
  readonly nominalAncestorCache: Map<string, ReadonlySet<string>>;
  /** archivo -> sus unidades de operación (ver `OperationUnit`). Precalculado para TODO el repo: lo necesita la frecuencia documental. */
  readonly unitsByFile: ReadonlyMap<string, readonly OperationUnit[]>;
  /** nombre de operación -> unidades del repo que lo declaran (índice invertido; acota la búsqueda de "la abstracción ya existe"). */
  readonly unitsByOperation: ReadonlyMap<string, readonly OperationUnit[]>;
  /** total de unidades del repo — el denominador de la frecuencia documental. */
  readonly unitCount: number;
  /** par no ordenado -> {total, inferred} de TODAS sus aristas de dependencia
   *  (cualquier provenance, incluida `inferred`) — ver "TECHO DE SEVERIDAD
   *  POR PROVENANCE" en el docstring del módulo. Deliberadamente separado de
   *  `dependsOn`/`dependedBy` (que sólo cuentan declared/resolved): éste mide
   *  qué tan ruidoso es el vecindario de un par, incluyendo la evidencia que
   *  el filtro de confianza excluyó. */
  readonly edgeProvenanceByPair: ReadonlyMap<string, PairProvenanceCount>;
  /** `id` de nodo -> `id`s de los hijos directos vía `contains` — la MISMA arista
   *  jerárquica que el resto de este archivo ignora para `dependsOn` (ver el bucle
   *  principal de abajo), reservada acá para "¿HACEN LO MISMO?": recorrer archivo ->
   *  símbolos de primer nivel -> miembros, sin resolución cross-archivo. */
  readonly containsByFrom: ReadonlyMap<string, readonly string[]>;
  readonly nodeById: ReadonlyMap<string, CodeGraphNode>;
}

/**
 * Única pasada por `graph.edges`, O(E). No recomputa ningún algoritmo de
 * `graph/metrics/*` (esa superficie no existe todavía — ver el docstring del
 * módulo): sólo agrupa aristas crudas por archivo, mismo nivel de trabajo que
 * `orphan-file.ts#computeCrossFileConnectedFiles`.
 */
function projectDependencies(graph: CodeGraph, files: readonly { readonly path: string }[]): DependencyProjection {
  const nodeById = new Map<string, CodeGraphNode>(graph.nodes.map((n) => [n.id, n]));
  const dependsOn = new Map<string, Set<string>>();
  const dependedBy = new Map<string, Set<string>>();
  const nominalPairs = new Set<string>();
  const nominalTargetsOf = new Map<string, Set<string>>();
  const edgeProvenanceByPair = new Map<string, PairProvenanceCount>();
  const containsByFrom = new Map<string, string[]>();

  const addTo = (map: Map<string, Set<string>>, key: string, value: string): void => {
    let set = map.get(key);
    if (!set) {
      set = new Set();
      map.set(key, set);
    }
    set.add(value);
  };

  for (const edge of graph.edges) {
    if (edge.kind === "contains") {
      let children = containsByFrom.get(edge.from);
      if (!children) {
        children = [];
        containsByFrom.set(edge.from, children);
      }
      children.push(edge.to);
      continue;
    }
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to || from.file === to.file) continue; // intra-archivo: no es dependencia entre archivos

    // Medido para TODAS las provenance, ANTES del filtro de confianza de
    // abajo — ver "TECHO DE SEVERIDAD POR PROVENANCE" en el docstring.
    const provKey = pairKey(from.file, to.file);
    let pc = edgeProvenanceByPair.get(provKey);
    if (!pc) {
      pc = { total: 0, inferred: 0 };
      edgeProvenanceByPair.set(provKey, pc);
    }
    pc.total++;
    if (edge.provenance === "inferred") pc.inferred++;

    // `inferred` es evidencia POSITIVA del hallazgo (ver docstring), se excluye. `ambiguous` se
    // excluye por CONTRATO-F9.md §4.5 (fuera de toda consulta por defecto) — no se suma al conteo
    // `inferred` de arriba (es una categoría de provenance distinta), sólo se excluye de `dependsOn`.
    // LA ARISTA NOMINAL ES EVIDENCIA NEGATIVA (ver el docstring del módulo): decide que
    // el par NO se reporte. La regla del catálogo — "si la arista `inferred` es evidencia
    // POSITIVA, excluirla; lo conservador es no afirmar" — se aplica acá al revés, y por
    // eso este bloque va ANTES del filtro de confianza: para no AFIRMAR "nada las une",
    // hay que mirar toda la evidencia de que algo las une, incluida la de baja confianza.
    // OLA R, FRENTE R4: `WHOLE_PART_EDGE_KINDS` (`carries`/`instantiates`) se suma acá, misma
    // bolsa y mismo razonamiento — ver "TODO-Y-PARTE" en el docstring del módulo.
    if (ABSTRACTING_EDGE_KINDS.has(edge.kind) || WHOLE_PART_EDGE_KINDS.has(edge.kind)) {
      nominalPairs.add(pairKey(from.file, to.file));
      addTo(nominalTargetsOf, from.file, to.file);
    }

    // `inferred` es evidencia POSITIVA del hallazgo (ver docstring), se excluye. `ambiguous` se
    // excluye por CONTRATO-F9.md §4.5 (fuera de toda consulta por defecto) — no se suma al conteo
    // `inferred` de arriba (es una categoría de provenance distinta), sólo se excluye de `dependsOn`.
    if (edge.provenance === "inferred" || edge.provenance === "ambiguous") continue;

    addTo(dependsOn, from.file, to.file);
    addTo(dependedBy, to.file, from.file);
  }

  // Superficie de operaciones de TODO el repo, en una pasada: la frecuencia documental
  // (`maxOperationUbiquity`) necesita el denominador completo, así que no se puede
  // calcular por candidato. Costo medido: guava 1.971 archivos -> 3.945 unidades.
  const unitsByFile = new Map<string, readonly OperationUnit[]>();
  const unitsByOperation = new Map<string, OperationUnit[]>();
  let unitCount = 0;
  for (const file of files) {
    const units = collectOperationUnits(file.path, containsByFrom, nodeById);
    unitsByFile.set(file.path, units);
    unitCount += units.length;
    for (const unit of units) {
      for (const name of unit.names) {
        let list = unitsByOperation.get(name);
        if (!list) {
          list = [];
          unitsByOperation.set(name, list);
        }
        list.push(unit);
      }
    }
  }

  return {
    dependsOn,
    dependedBy,
    nominalPairs,
    nominalTargetsOf,
    nominalAncestorCache: new Map(),
    unitsByFile,
    unitsByOperation,
    unitCount,
    edgeProvenanceByPair,
    containsByFrom,
    nodeById,
  };
}

/**
 * LA SUPERFICIE DE OPERACIONES de un archivo — ver el docstring del módulo. Recorre
 * `contains` desde el nodo archivo y devuelve una unidad por cada símbolo `class-like`
 * (con los nombres de sus miembros `function-like` DIRECTOS) más, si el archivo declara
 * funciones fuera de toda clase, una unidad "archivo como módulo" con esos nombres.
 *
 * Los tres rasgos que lo hacen valer igual en los ocho lenguajes, cada uno con el defecto
 * medido que corrige (ver "ROTO POR LENGUAJE" en el docstring):
 *
 *  - **Baja por contenedores `namespace-like`**: en C# y en Ruby la clase casi nunca es
 *    hija DIRECTA del archivo (medido: newtonsoft-json, 228 hijos `namespace-like` de
 *    primer nivel contra 15 `class-like`, y 334 de las 349 clases del repo cuelgan a
 *    profundidad 1 o 2; jekyll, 92 contra 10). Mirar sólo el primer nivel dejaba la
 *    superficie VACÍA en el 100 % de los candidatos de esos dos lenguajes.
 *  - **También baja por `class-like`**: una clase anidada es una unidad propia, no parte
 *    de la de afuera (C# `DefaultContractResolver.EnumerableDictionaryWrapper`).
 *  - **El archivo como módulo**: en Go el método se declara al nivel del archivo con un
 *    receptor, no adentro del tipo (medido: cobra, 270 `function-like` hijos del archivo
 *    contra 1 hijo de un `class-like`), y en JS/Vue/Python/TS un archivo puede exportar
 *    funciones sueltas sin ninguna clase. Sin esta unidad, Go y todo módulo de funciones
 *    tenían superficie vacía por construcción, y "¿hacen lo mismo?" no se evaluaba nunca:
 *    quedaba respondido que NO por falta de datos, que es distinto de responder que no.
 *    NO se desciende a las funciones anidadas dentro de otra función (un closure no es
 *    una operación que el archivo exponga).
 */
function collectOperationUnits(
  file: string,
  containsByFrom: ReadonlyMap<string, readonly string[]>,
  nodeById: ReadonlyMap<string, CodeGraphNode>,
): readonly OperationUnit[] {
  const units: OperationUnit[] = [];
  const moduleNames = new Set<string>();

  const visit = (nodeId: string, insideClass: boolean): void => {
    for (const childId of containsByFrom.get(nodeId) ?? []) {
      const child = nodeById.get(childId);
      if (!child || child.kind !== "symbol") continue;
      const childName = child.symbolPath[child.symbolPath.length - 1];
      if (child.family === "class-like") {
        const names = new Set<string>();
        for (const memberId of containsByFrom.get(child.id) ?? []) {
          const member = nodeById.get(memberId);
          if (!member || member.kind !== "symbol" || member.family !== "function-like") continue;
          const name = member.symbolPath[member.symbolPath.length - 1];
          if (name !== undefined && !isAnonymousName(name)) names.add(name);
        }
        if (names.size > 0) units.push({ file, names, isModule: false });
        visit(child.id, true);
      } else if (child.family === "namespace-like") {
        visit(child.id, insideClass);
      } else if (child.family === "function-like" && !insideClass) {
        if (childName !== undefined && !isAnonymousName(childName)) moduleNames.add(childName);
      }
    }
  };

  visit(fileNodeId(file), false);
  if (moduleNames.size > 0) units.push({ file, names: moduleNames, isModule: true });
  return units;
}

/**
 * `true` si `name` es vocabulario UNIVERSAL de este repo — ver
 * `MAX_OPERATION_UBIQUITY_SPEC`. Un nombre así coincide en demasiados pares como para
 * discriminar ninguno, así que no cuenta como evidencia de que A y B hagan lo mismo.
 */
function isUbiquitousOperation(proj: DependencyProjection, name: string, maxOperationUbiquity: Threshold): boolean {
  const declaringUnits = proj.unitsByOperation.get(name)?.length ?? 0;
  if (declaringUnits <= 2) return false; // guarda de repo chico — ver el spec
  return declaringUnits / Math.max(1, proj.unitCount) > maxOperationUbiquity.value;
}

/** Cierre transitivo de `nominalTargetsOf` a grano ARCHIVO, memoizado; tolera ciclos. */
function nominalAncestorsOf(proj: DependencyProjection, file: string, visiting: ReadonlySet<string> = new Set()): ReadonlySet<string> {
  const cached = proj.nominalAncestorCache.get(file);
  if (cached) return cached;
  if (visiting.has(file)) return new Set(); // ciclo de herencia: el camino ya está siendo recorrido más arriba
  const guard = new Set(visiting);
  guard.add(file);
  const out = new Set<string>();
  for (const target of proj.nominalTargetsOf.get(file) ?? []) {
    out.add(target);
    for (const grand of nominalAncestorsOf(proj, target, guard)) out.add(grand);
  }
  proj.nominalAncestorCache.set(file, out);
  return out;
}

/**
 * "¿HACEN LO MISMO?" — la operacionalización 2, ahora sobre la superficie de operaciones
 * genérica. Devuelve el par de unidades (una de A, una de B) con MÁS operaciones
 * discriminativas en común, y esas operaciones. `null` si ninguna pareja de unidades
 * comparte una sola.
 *
 * Se compara UNIDAD contra UNIDAD, no archivo contra archivo: dos clases que declaran
 * `render` cada una son evidencia de que hacen lo mismo; un archivo que declara una clase
 * con `render` y otra clase con `parse` no "hace lo mismo" que otro archivo que reparte
 * esos dos nombres al revés. `sharedRaw` (la intersección SIN filtrar por ubicuidad) sale
 * junto porque es lo que necesita `declaresExistingAbstraction`: la interfaz que ya
 * existe puede estar hecha de nombres universales.
 *
 * OLA Z, FRENTE Z1 — `protocolShare`: la MENOR de las dos fracciones
 * `compartidas / declaradas por la unidad`, o sea cuánto del protocolo de CADA extremo
 * está compartido. Es lo que separa "dos tipos de una sola operación, la misma" (fracción
 * 1 en los dos: mismo contrato entero) de "un nombre de los quince que cada uno declara"
 * (fracción ~0,07: coincidencia de vocabulario) — ver la sección de la Ola Z en el
 * docstring del módulo. El desempate entre unidades usa PRIMERO la cantidad de operaciones
 * compartidas y sólo después la fracción, para que el resultado no dependa del orden de
 * `contains`.
 */
function bestSharedOperations(
  proj: DependencyProjection,
  a: string,
  b: string,
  maxOperationUbiquity: Threshold,
): { readonly shared: readonly string[]; readonly sharedRaw: ReadonlySet<string>; readonly protocolShare: number } | null {
  let best: { shared: readonly string[]; sharedRaw: ReadonlySet<string>; protocolShare: number } | null = null;
  for (const unitA of proj.unitsByFile.get(a) ?? []) {
    if (unitA.isModule) continue; // UNA IMPLEMENTACIÓN ES UN TIPO — ver el docstring del módulo
    for (const unitB of proj.unitsByFile.get(b) ?? []) {
      if (unitB.isModule) continue;
      const sharedRaw = new Set<string>();
      for (const name of unitA.names) if (unitB.names.has(name)) sharedRaw.add(name);
      if (sharedRaw.size === 0) continue;
      const shared = [...sharedRaw].filter((n) => !isUbiquitousOperation(proj, n, maxOperationUbiquity)).sort();
      if (shared.length === 0) continue;
      const protocolShare = Math.min(shared.length / unitA.names.size, shared.length / unitB.names.size);
      if (!best || shared.length > best.shared.length || (shared.length === best.shared.length && protocolShare > best.protocolShare)) {
        best = { shared, sharedRaw, protocolShare };
      }
    }
  }
  return best;
}

/** Ratio `inferred` de TODAS las aristas entre los clientes de un candidato y
 *  sus dos unidades concretas {a, b} — ver "TECHO DE SEVERIDAD POR
 *  PROVENANCE" en el docstring del módulo. */
function inferredRatioForCandidate(proj: DependencyProjection, clients: readonly string[], a: string, b: string): number {
  let total = 0;
  let inferred = 0;
  for (const client of clients) {
    for (const target of [a, b]) {
      const pc = proj.edgeProvenanceByPair.get(pairKey(client, target));
      if (pc) {
        total += pc.total;
        inferred += pc.inferred;
      }
    }
  }
  return total === 0 ? 0 : inferred / total;
}

/**
 * `true` si A y B ya están unidos por una relación nominal (`extends`/`implements`/
 * `mixes-in`/`satisfies`) O TODO-Y-PARTE (`carries`/`instantiates`, OLA R FRENTE R4 — ver
 * "TODO-Y-PARTE" en el docstring del módulo): directa, o por un ancestro en común a
 * CUALQUIER profundidad (A extiende X, B extiende Y, y X e Y implementan la misma interfaz
 * Z: la abstracción común existe, sólo que dos saltos más arriba; mismo razonamiento para
 * `carries`/`instantiates` — A construye X, B construye X: comparten el mismo componente
 * construido). El nombre de la función quedó igual para no repartir el rename por el
 * archivo; el conjunto que consulta (`proj.nominalPairs`/`nominalAncestorsOf`) ya incluye
 * los dos grupos de kinds desde `projectDependencies`. Cualquier `provenance` — ver "LA
 * ARISTA NOMINAL ES EVIDENCIA NEGATIVA".
 */
function hasCommonNominalAncestor(a: string, b: string, proj: DependencyProjection): boolean {
  if (proj.nominalPairs.has(pairKey(a, b))) return true;
  const ancestorsOfA = nominalAncestorsOf(proj, a);
  if (ancestorsOfA.size === 0) return false;
  if (ancestorsOfA.has(b)) return true;
  const ancestorsOfB = nominalAncestorsOf(proj, b);
  if (ancestorsOfB.has(a)) return true;
  for (const t of ancestorsOfA) {
    if (ancestorsOfB.has(t)) return true; // supertipo/interfaz compartido, directo o transitivo
  }
  return false;
}

/**
 * LA ABSTRACCIÓN QUE YA EXISTE Y EL GRAFO NO RESUELVE — ver el docstring del módulo.
 *
 * `true` si algún TERCER archivo del repo declara, EN UNA SOLA unidad, al menos
 * `minAbstractionProtocol` de las operaciones que A y B comparten: el protocolo común ya
 * está nombrado en el repo, así que "Extract Interface" no es el remedio. Es la respuesta
 * estructural al caso
 * testigo medido (guava `HashBiMap` / `ImmutableBiMap`, las dos `implements BiMap`): en
 * ese repo NINGUNO de los 19 archivos `*BiMap*.java` emite una sola arista `implements`
 * ni `extends` — de ninguna `provenance` — porque el árbol está triplicado
 * (`android/guava/`, `guava/`, `guava-gwt/`) y la resolución por nombre no desempata. La
 * arista no está y no la puede poner este archivo; la INTERFAZ sí está, declarada, y su
 * superficie de operaciones se puede leer sin resolver nada.
 *
 * POR QUÉ "AL MENOS N EN COMÚN" Y NO "EL PROTOCOLO ENTERO CONTENIDO", medido sobre ese
 * mismo caso: `BiMap` declara `{put, forcePut, putAll, values, inverse}`, pero la unidad
 * principal de `ImmutableBiMap` NO declara `put` ni `putAll` (viven en su `Builder`
 * anidado, que es otra unidad) y la de `HashBiMap` no declara `putAll`. Exigir que el
 * protocolo entero de la interfaz esté declarado por las dos implementaciones falla
 * contra código real —la herencia y la delegación reparten los miembros— y dejaba el
 * caso testigo emitiéndose igual. Con "al menos dos de las operaciones compartidas",
 * `BiMap` aporta `{forcePut, values, inverse}` y el par queda suprimido.
 *
 * La búsqueda se ancla en el índice invertido por las operaciones COMPARTIDAS
 * discriminativas (una abstracción que no comparta ninguna de ellas no es la abstracción
 * de este par), así que recorre decenas de unidades, no las miles del repo.
 */
function declaresExistingAbstraction(
  proj: DependencyProjection,
  a: string,
  b: string,
  shared: readonly string[],
  sharedRaw: ReadonlySet<string>,
  minAbstractionProtocol: Threshold,
): boolean {
  const seen = new Set<OperationUnit>();
  for (const anchor of shared) {
    for (const unit of proj.unitsByOperation.get(anchor) ?? []) {
      if (unit.file === a || unit.file === b) continue;
      if (unit.isModule) continue; // una abstracción es un TIPO — ver `UNA IMPLEMENTACIÓN ES UN TIPO`
      if (seen.has(unit)) continue;
      seen.add(unit);
      let inCommon = 0;
      for (const name of unit.names) if (sharedRaw.has(name)) inCommon++;
      if (inCommon < minAbstractionProtocol.value) continue;
      if (inCommon / unit.names.size <= MAJORITY_OF_PROTOCOL) continue; // es otra implementación, no la abstracción
      return true;
    }
  }
  return false;
}

/**
 * Monótona en la cantidad de clientes; moderada (nunca satura en 100 — ver
 * "CON QUÉ SE CONFUNDE": par fachada+compañero). Si la mayoría de las
 * aristas entre los clientes y {a, b} son `inferred`, se ACOTA (no sólo se
 * resta) a un techo bajo — ver "TECHO DE SEVERIDAD POR PROVENANCE" en el
 * docstring del módulo (criterio unificado P5, reemplaza a la penalización
 * por nombre de lenguaje que tenía antes esta función).
 */
function severityOf(clientCount: number, inferredRatio: number): number {
  const base = 25 + Math.min(45, clientCount * 5);
  const capped = Math.min(80, base);
  return inferredRatio > MAJORITY_INFERRED_RATIO ? Math.min(capped, LOW_CONFIDENCE_SEVERITY_CEILING) : capped;
}

function roundRatio(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Único lugar que arma los `RawFinding[]` — separado de `detector.run` para
 * poder testear la lógica sin pasar por `RunContext`, mismo patrón que los 3
 * detectores hermanos (`findDependencyCycles`, `buildOrphanFileFindings`).
 */
export function buildCouplingWithoutAbstractionFindings(
  repo: RepoUnit,
  minClients: Threshold,
  maxUbiquitousFanInRatio: Threshold,
  maxFanoutConsidered: Threshold,
  minClientShareOfFanIn: Threshold,
  minSharedOperations: Threshold,
  minSharedProtocolShare: Threshold,
  maxOperationUbiquity: Threshold,
  minAbstractionProtocol: Threshold,
): readonly RawFinding[] {
  const graph = repo.graph;
  if (!graph) return [];
  const totalFiles = repo.files.length;
  if (totalFiles === 0) return [];

  const proj = projectDependencies(graph, repo.files);
  const linesByFile = new Map(repo.files.map((f) => [f.path, f.lines]));

  // par no ordenado -> conjunto de archivos ORIGEN que dependen de AMBOS extremos.
  const clientsOfPair = new Map<string, Set<string>>();

  for (const [source, targets] of proj.dependsOn) {
    if (targets.size < 2) continue;
    if (targets.size > maxFanoutConsidered.value) continue; // ver "CON QUÉ SE CONFUNDE": archivo agregador
    const sorted = [...targets].sort();
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const key = pairKey(sorted[i]!, sorted[j]!);
        let clients = clientsOfPair.get(key);
        if (!clients) {
          clients = new Set();
          clientsOfPair.set(key, clients);
        }
        clients.add(source);
      }
    }
  }

  const candidates: {
    key: string;
    a: string;
    b: string;
    clients: readonly string[];
    sharedOperations: readonly string[];
    protocolShare: number;
    /** OLA Z: el par entró por la EXCEPCIÓN (un solo nombre, pero es casi todo el protocolo de los dos). */
    byWholeProtocol: boolean;
  }[] = [];
  for (const [key, clients] of clientsOfPair) {
    if (clients.size < minClients.value) continue;
    const [a, b] = key.split(" ") as [string, string];
    if (hasCommonNominalAncestor(a, b, proj)) continue; // ya existe la abstracción: no es este patrón

    const ratioA = (proj.dependedBy.get(a)?.size ?? 0) / totalFiles;
    const ratioB = (proj.dependedBy.get(b)?.size ?? 0) / totalFiles;
    if (ratioA >= maxUbiquitousFanInRatio.value || ratioB >= maxUbiquitousFanInRatio.value) continue; // infra ubicua

    // Ver "CONCENTRACIÓN DEL CLIENTELA EN {A, B}" en el docstring del módulo: si menos de la
    // mitad de TODOS los que dependen de A (o de B) son parte de este mismo grupo de
    // `clients`, A (o B) es popular por su cuenta — un módulo central de su propio subsistema
    // en un repo grande, no una pieza concreta que este grupo hardcodeó sin abstracción.
    const fanInA = proj.dependedBy.get(a)?.size ?? 0;
    const fanInB = proj.dependedBy.get(b)?.size ?? 0;
    const shareA = fanInA === 0 ? 0 : clients.size / fanInA;
    const shareB = fanInB === 0 ? 0 : clients.size / fanInB;
    if (Math.min(shareA, shareB) < minClientShareOfFanIn.value) continue;

    // Ver "¿HACEN LO MISMO?" en el docstring del módulo: co-ocurrir, no ser ubicuo y estar
    // concentrado en este grupo siguen sin decir si A y B son INTERCAMBIABLES. Si ninguna
    // unidad declarante de A y ninguna de B comparten un nombre de operación que no sea
    // vocabulario universal del repo, no hay evidencia estructural de que compartan
    // operaciones — HIPÓTESIS descartada, no sólo confianza reducida.
    const best = bestSharedOperations(proj, a, b, maxOperationUbiquity);
    if (!best) continue;

    // OLA Z, FRENTE Z1 (ver "UN NOMBRE COMPARTIDO ES UNA COINCIDENCIA DE IDIOMA" en el
    // docstring del módulo): UN solo nombre en común es el idioma del lenguaje o del
    // ecosistema, no evidencia de que las dos piezas sean intercambiables — medido, la
    // población viva entera del corpus comparte exactamente uno. Dos ya son un protocolo.
    // SALVO que ese único nombre sea la MAYORÍA de lo que declara CADA una de las dos
    // unidades: ahí no comparten un idioma, comparten su contrato entero (dos tipos de una
    // sola operación, la misma) y "Extract Interface" es literalmente su remedio.
    const byWholeProtocol = best.shared.length < minSharedOperations.value && best.protocolShare > minSharedProtocolShare.value;
    if (best.shared.length < minSharedOperations.value && !byWholeProtocol) continue;

    // Y si el repo YA declara la abstracción de ese protocolo compartido en un tercer
    // archivo, "Extract Interface" no es el remedio: la interfaz existe (ver
    // `declaresExistingAbstraction`, y el caso testigo HashBiMap/ImmutableBiMap).
    if (declaresExistingAbstraction(proj, a, b, best.shared, best.sharedRaw, minAbstractionProtocol)) continue;

    candidates.push({
      key,
      a,
      b,
      clients: [...clients].sort(),
      sharedOperations: best.shared,
      protocolShare: best.protocolShare,
      byWholeProtocol,
    });
  }

  // Determinístico: más clientes primero, después orden alfabético del par.
  candidates.sort((x, y) => y.clients.length - x.clients.length || (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));

  const findings: RawFinding[] = [];
  for (const { a, b, clients, sharedOperations, protocolShare, byWholeProtocol } of candidates) {
    const inferredRatio = inferredRatioForCandidate(proj, clients, a, b);
    const lowConfidence = inferredRatio > MAJORITY_INFERRED_RATIO;
    const ratioA = roundRatio((proj.dependedBy.get(a)?.size ?? 0) / totalFiles);
    const ratioB = roundRatio((proj.dependedBy.get(b)?.size ?? 0) / totalFiles);
    const exampleClients = clients.slice(0, 5);

    const targetLocations: RoleLocation[] = [
      {
        file: a,
        startLine: 1,
        endLine: Math.max(1, linesByFile.get(a) ?? 1),
        role: "primera unidad concreta del par acoplado",
      },
      {
        file: b,
        startLine: 1,
        endLine: Math.max(1, linesByFile.get(b) ?? 1),
        role: "segunda unidad concreta del par acoplado",
      },
    ];
    const clientLocations: RoleLocation[] = exampleClients.map((file) => ({
      file,
      startLine: 1,
      endLine: Math.max(1, linesByFile.get(file) ?? 1),
      role: "cliente que depende de ambas unidades sin que nada las una",
    }));

    findings.push({
      title: `${clients.length} archivos dependen a la vez de "${fileName(a)}" y "${fileName(b)}" sin ninguna abstracción común`,
      detail:
        `El grafo del repo no registra ninguna relación de tipo (herencia, interfaz o mixin) entre ` +
        `"${fileName(a)}" y "${fileName(b)}" —ni directa, ni por un supertipo en común a ninguna profundidad—, ` +
        "y tampoco hay en el repo ninguna otra unidad cuyo protocolo entero declaren las dos: " +
        "Cada cliente nuevo que necesite lo mismo va a tener que conocer las DOS, y cambiar cualquiera de las " +
        "dos por separado obliga a revisar a todos sus clientes uno por uno. Introducir una abstracción " +
        "compartida (una interfaz que ambas implementen, o un objeto que las combine) dejaría a cada cliente " +
        "dependiendo de UNA cosa en vez de dos. Esto es una HIPÓTESIS a revisar, no una afirmación: si estas " +
        "dos piezas forman a propósito un par indivisible (una fachada y su implementación dedicada, una clase " +
        "y su tipo de excepción específico) que nunca se usaría por separado, no hace falta ninguna abstracción " +
        "nueva — y esa figura produce exactamente la misma señal que un acoplamiento accidental. " +
        `Evidencia de intercambiabilidad: una unidad de cada una declara ${sharedOperations.length === 1 ? "una operación" : "operaciones"} ` +
        `con el mismo nombre (${sharedOperations.map((n) => `"${n}"`).join(", ")}) — misma operación, dos ` +
        "implementaciones concretas distintas, exactamente lo que 'Extract Interface' resuelve. Ninguno de esos " +
        "nombres es vocabulario universal de este repo (constructor, contrato de objeto, convención del " +
        "framework): esos se descartan midiendo en cuántas unidades del repo aparece cada nombre." +
        (byWholeProtocol
          ? " Ese nombre es UNO solo, y aun así cuenta porque es la mayoría de lo que declara cada una de las dos " +
            `unidades (${Math.round(protocolShare * 100)}% del protocolo de la más grande de las dos): no comparten ` +
            "un idioma del lenguaje, comparten su contrato entero — dos implementaciones del mismo protocolo " +
            "funcional. Un nombre compartido entre dos tipos que declaran quince operaciones cada uno NO cuenta: " +
            "eso es vocabulario, y este detector lo descarta."
          : "") +
        (lowConfidence
          ? ` Confianza reducida: ${Math.round(inferredRatio * 100)}% de las aristas entre estos clientes y las ` +
            "dos unidades concretas provienen de la etapa heurística de resolución (path-proximity, provenance " +
            "'inferred'), no validada contra un dataset etiquetado fuera de Ruby, así que este veredicto parte " +
            "con menos confianza que uno resuelto mayormente por reglas estructurales."
          : ""),
      trigger: [
        { label: "archivos cliente que dependen de ambas unidades", value: clients.length, threshold: minClients },
        { label: "operaciones declaradas en común, sin las universales del repo", value: sharedOperations.length, threshold: minSharedOperations },
        {
          label: "fracción del protocolo declarado que está compartida, en el extremo con MÁS operaciones",
          value: roundRatio(protocolShare),
          threshold: minSharedProtocolShare,
        },
      ],
      evidence: [
        { label: `proporción del repo que depende de "${fileName(a)}"`, value: ratioA },
        { label: `proporción del repo que depende de "${fileName(b)}"`, value: ratioB },
        { label: "% de las aristas cliente→{a,b} con provenance 'inferred'", value: Math.round(inferredRatio * 100) },
      ],
      locations: [targetLocations[0]!, targetLocations[1]!, ...clientLocations],
      severity: severityOf(clients.length, inferredRatio),
      advice: {
        primary: {
          name: "Extract Interface",
          kind: "refactorizacion",
          why:
            "Extraer una interfaz común para las dos unidades concretas deja que cada cliente dependa de la " +
            "abstracción en vez de las dos piezas concretas por separado — el primer paso mecánico antes de " +
            "decidir si de verdad conviene unificarlas o sustituir una por otra.",
          source: "https://refactoring.guru/es/extract-interface",
        },
      },
    });
    if (findings.length >= 500) break; // guardia dura de memoria; `maxFindings` (presupuesto) recorta después en el runner
  }

  return findings;
}

export const detector: InterFileDetector<ThresholdKey, "coupling-without-abstraction"> = {
  id: "coupling-without-abstraction",
  kind: "coupling-without-abstraction",
  scope: "inter-file",
  needsGraph: true,
  title: "Acoplamiento sin abstracción común",
  needs: [],
  // OLA A3 — CORRECCIÓN: el docstring del módulo ("DESVIACIÓN DE
  // CONTRATO-F5.md") afirma que `needsEdges` no existe todavía y sugiere
  // declarar los 7 kinds de `ABSTRACTING_EDGE_KINDS` completos; esa
  // afirmación está VENCIDA (el campo existe, `run.ts#runInterFile` ya lo
  // implementa) y esa sugerencia es demasiado estricta: `projectDependencies`
  // usa "cualquier kind salvo contains" como unión genérica para
  // `dependsOn`/`dependedBy` (la señal PRIMARIA), así que sólo `references`
  // — el kind que de verdad sostiene esa unión en la práctica — se declara
  // (ver `types.ts#needsEdges`, "unión genérica"). `extends`/`implements`/
  // `mixes-in`/`satisfies` sólo AJUSTAN el resultado (excluyen un par que YA
  // tiene abstracción común); su ausencia nunca impide encontrar un candidato,
  // así que no se declaran.
  needsEdges: ["references"],
  thresholds: {
    minClients: MIN_CLIENTS_SPEC,
    maxUbiquitousFanInRatio: MAX_UBIQUITOUS_FAN_IN_RATIO_SPEC,
    maxFanoutConsidered: MAX_FANOUT_CONSIDERED_SPEC,
    minClientShareOfFanIn: MIN_CLIENT_SHARE_OF_FANIN_SPEC,
    minSharedOperations: MIN_SHARED_OPERATIONS_SPEC,
    minSharedProtocolShare: MIN_SHARED_PROTOCOL_SHARE_SPEC,
    maxOperationUbiquity: MAX_OPERATION_UBIQUITY_SPEC,
    minAbstractionProtocol: MIN_ABSTRACTION_PROTOCOL_SPEC,
  },
  maxFindings: MAX_FINDINGS_SPEC,
  run(repo: RepoUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    return buildCouplingWithoutAbstractionFindings(
      repo,
      ctx.threshold("minClients"),
      ctx.threshold("maxUbiquitousFanInRatio"),
      ctx.threshold("maxFanoutConsidered"),
      ctx.threshold("minClientShareOfFanIn"),
      ctx.threshold("minSharedOperations"),
      ctx.threshold("minSharedProtocolShare"),
      ctx.threshold("maxOperationUbiquity"),
      ctx.threshold("minAbstractionProtocol"),
    );
  },
};
