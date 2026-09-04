/**
 * `feature-envy-intra` — Envidia de las características / Feature Envy
 * (PLAN.md §4.1 "Feature envy | archivo | ATFD+LAA").
 *
 * RELACIÓN: un método cuyo cuerpo lee o invoca MÁS miembros de OTRA unidad
 * que de la propia — la estrategia de detección de Lanza & Marinescu para
 * Feature Envy: ATFD (Access To Foreign Data) > FEW (= 2) Y LAA (Locality of
 * Attribute Access) < ONE_THIRD (= 1/3).
 *
 * PROXY ESTRUCTURAL, SIN RESOLUCIÓN DE TIPOS — degradación DECLARADA, no
 * escondida: el propio hallazgo la reporta en `evidence`.
 *
 * ────────────────────────────────────────────────────────────────────────
 * LA PREGUNTA QUE ESTE DETECTOR HACE (reescrita en la ola N)
 * ────────────────────────────────────────────────────────────────────────
 *
 * Hasta la ola N la pregunta era **"¿la base de este acceso es `this`?"**, y
 * todo lo que no era `this` contaba como "otra unidad". Medido a mano sobre 7
 * lenguajes (32 veredictos, planillas `tests/golden/precision/*.verdicts.csv`)
 * eso daba **3 % de precisión y 4.091 hallazgos**: el mayor ruido del
 * catálogo. Los 38 falsos juzgados se reparten en exactamente cinco formas, y
 * ninguna de las cinco es "otra unidad":
 *
 *   1. una VARIABLE LOCAL de la propia función (`info`, `meta`, `parser`,
 *      `record`, `md`, `entry_filter`, `fileDescriptor`, `opts`…) — 12 falsos;
 *   2. un MÓDULO/GLOBAL/TIPO IMPORTADO usado como si fuera un objeto
 *      (`fs.readdir`, `path.join`, `os.environ`, `Math.max`, `Object.assign`,
 *      `File.directory?`, `subprocess.run`) — 10 falsos;
 *   3. una CONSTANTE DE ENUM en un `switch` (`JsonToken.String`,
 *      `RpcParamtype.QUERY`, `HttpStatus.GONE`) — 5 falsos, misma forma
 *      estructural que (2): un nombre libre usado como base;
 *   4. el PARÁMETRO DE UN LAMBDA anidado o de un callback (`tr` de un
 *      `.map`, `req` de un manejador de eventos, `user` de un `.map` en JSX)
 *      — 5 falsos, todos sobre funciones ANÓNIMAS ANIDADAS, no sobre métodos;
 *   5. el PARÁMETRO de la propia función usado como material de trabajo
 *      (`escape(s)`, `read(target)`, `convert(value)`, `too_long?(node)`) —
 *      9 falsos, que en TODOS los casos venían acompañados del mismo defecto
 *      de medición: los accesos PROPIOS no se contaban (ver (6) abajo);
 *   6. y atravesando a todos: el ACCESO PROPIO SIN RECEPTOR EXPLÍCITO
 *      (`seq.charAt(pos)`, `array[start + i]`, `_reader.Read()`, `site.data`,
 *      `@cache`) — en Java, C#, Ruby y cualquier lenguaje que no exija
 *      `this.`/`self.`, el denominador de LAA quedaba en cero SIEMPRE, así
 *      que la condición `LAA < 1/3` no filtraba nada y la regla degeneraba a
 *      "ATFD > 2". 366 de los 554 hallazgos muestreados son de esos tres
 *      lenguajes.
 *
 * La pregunta nueva es **"¿de qué OTRA UNIDAD NOMBRABLE lee este método más
 * que de la suya, y cuál es?"**, y se contesta clasificando la RAÍZ de cada
 * cadena de acceso (no cada salto por separado) contra las ataduras que la
 * propia función y su clase declaran:
 *
 *   - RAÍZ PROPIA (`this`/`self`/`super`, una variable de instancia `@x`, o un
 *     nombre que la clase de este archivo declara como miembro) → acceso
 *     PROPIO. Incluye la cadena entera: en `this.options.foo` la base del
 *     segundo salto es `this.options`, que ES propia (antes ese salto quedaba
 *     "ambiguo" y se descartaba, y el primero contaba como único propio).
 *   - RAÍZ = PARÁMETRO DE ESTA FUNCIÓN → acceso FORÁNEO, y el parámetro es el
 *     PROVEEDOR: la unidad a la que el método podría mudarse. Es el único
 *     destino real de un `Move Method` que un detector intra-archivo puede
 *     nombrar sin resolver tipos.
 *   - RAÍZ = variable local, variable de loop o parámetro de un lambda
 *     anidado → NI propio NI foráneo (formas (1) y (4)).
 *   - RAÍZ = nombre LIBRE (no lo declara ni la función ni la clase: un
 *     import, un módulo, un global, un tipo, un enum) → NI propio NI foráneo
 *     (formas (2) y (3)).
 *   - RAÍZ que no es un identificador (un literal, un `new`, el resultado de
 *     una llamada libre) → AMBIGUO, se cuenta y se reporta.
 *
 * POR QUÉ EL NOMBRE LIBRE NO ES FORÁNEO, dicho fuerte porque es la decisión
 * más grande de esta reescritura: un módulo de biblioteca estándar, un global
 * del lenguaje y un enum importado son estructuralmente indistinguibles de un
 * tipo de dominio importado — distinguirlos exige la cascada de resolución de
 * `graph/resolve.ts`, que un detector intra-archivo no tiene. La ronda
 * anterior eligió contarlos a todos como foráneos y documentó el falso
 * positivo; la evidencia medida dice que esa elección costaba 15 falsos de 38
 * y no compraba NI UN verdadero (el único verdadero juzgado del corpus,
 * `jekyll/post_url.rb#post_slug`, es un PARÁMETRO). Se elige el sesgo
 * contrario, que es además el sesgo que el resto del archivo ya declara:
 * antes el falso negativo que el falso positivo. Lo que se pierde queda
 * contado y visible en `evidence` ("saltos hacia un nombre libre"), nunca
 * escondido.
 *
 * QUÉ ES UN "ACCESO A MIEMBRO" (sin cambios respecto de la ronda anterior):
 * cualquier nodo que expone, GENÉRICAMENTE, un campo de BASE
 * (`object`/`receiver`/`operand`/`expression` — confirmado por sonda directa
 * contra las 6 gramáticas soportadas, misma técnica que `SUBJECT_FIELDS` de
 * `repeated-switch.ts`) junto a un campo de MIEMBRO
 * (`property`/`attribute`/`method`/`field`/`name`). Eso captura tanto
 * `other.total` como `other.bar()` sin tratar la llamada como caso aparte.
 *
 * QUÉ SE AGREGÓ (el usuario pidió agregar comportamientos, no sólo filtrar):
 *
 *   A. **Cadenas atribuidas a su raíz, con la PROFUNDIDAD respetada.** En
 *      `p.a.b.c` los dos últimos saltos quedaban antes como "ambiguos" y se
 *      descartaban del todo; ahora se reconocen como acceso foráneo (bajan
 *      LAA, que es la métrica de localidad) sin inflar el ATFD del proveedor.
 *      Ver PROFUNDIDAD abajo.
 *   B. **Acceso propio sin receptor explícito.** Un nombre desnudo que la
 *      clase de ESTE archivo declara como miembro (campo, propiedad, método,
 *      variable de instancia, o símbolo declarado en el cuerpo de la clase —
 *      la forma de `attr_reader :site`) cuenta como acceso propio, igual que
 *      `this.x`. Es lo que vuelve real el denominador de LAA en Java, C# y
 *      Ruby. LÍMITE DECLARADO: sólo alcanza a lo que se declara en ESTE
 *      archivo — un campo heredado de una superclase de otro archivo, o un
 *      método que aporta un `module`/mixin externo, sigue sin contarse (queda
 *      como nombre libre: ni propio ni foráneo, nunca foráneo).
 *   C. **El proveedor dominante es el que se mide.** Antes ATFD era la SUMA
 *      de miembros distintos de TODOS los proveedores y `dominance` sólo
 *      pedía que uno concentrara la mitad: con ATFD=4 repartido 2+1+1 el
 *      hallazgo disparaba y el consejo "mové el método" no tenía a dónde
 *      mudarse. Ahora el umbral ATFD se aplica al proveedor DOMINANTE, y el
 *      hallazgo nombra siempre UNA unidad concreta.
 *   D. **Las funciones anidadas no son métodos.** Un lambda/callback anidado
 *      dentro de otra función no es una unidad que se pueda mudar de clase:
 *      sus parámetros los ata el protocolo de quien lo invoca, no un contrato
 *      de la clase. Feature Envy es una métrica POR MÉTODO (Lanza &
 *      Marinescu miden por método de la clase), así que una función contenida
 *      en otra función del mismo archivo no se evalúa como unidad propia —
 *      sus accesos SÍ se siguen contando dentro del método que la contiene.
 *   E. **La llamada SIN receptor cuenta como acceso propio.** `foo(x)` se
 *      despacha sobre la unidad que la encierra (o sobre su jerarquía), nunca
 *      sobre otro objeto — no es la lectura del dato de nadie más. Como este
 *      detector ya cuenta `self.foo(x)` como acceso propio, contar distinto
 *      la MISMA llamada escrita sin receptor sería una incoherencia, y era la
 *      que dejaba el denominador de LAA vacío en todo método heredado. Se
 *      cuenta aunque el nombre no se resuelva en este archivo: es lo que pasa
 *      con cualquier método que aporta una superclase o un mixin externo.
 *      PRECIO DECLARADO: en un lenguaje sin receptor implícito (Python, JS/
 *      TS/Vue) una llamada a una función libre importada también suma acceso
 *      propio — infla LAA y produce falsos NEGATIVOS, nunca positivos.
 *
 * ────────────────────────────────────────────────────────────────────────
 * LO QUE CAMBIÓ EN LA OLA O — el kind quedó en 583 hallazgos con 0 % de
 * precisión medida (muestra estratificada de semilla fija, n=20, del
 * integrador de la ola N; el 33 % que el frente A1 reportó con su propia
 * muestra de n=9 NO se reprodujo). Los 20 falsos están juzgados uno por uno
 * en `tests/golden/precision/*.verdicts.csv` con nota `ola N, integrador:`.
 * ────────────────────────────────────────────────────────────────────────
 *
 *   F. **UN CONSTRUCTOR NO TIENE A DÓNDE MUDARSE.** El consejo de este
 *      detector es `Move Method`, y su destino es OTRA clase; un constructor
 *      es el protocolo de creación DE su clase y no se puede relocalizar.
 *      Peor: la forma que disparaba era el constructor que consume un Builder
 *      o un value object (`StandardNetwork(NetworkBuilder)`,
 *      `ManualSerializationProxy(LocalCache)`, `SingletonImmutableTable(Cell)`
 *      — 4 de los 20 falsos juzgados), o sea que el detector acusaba al patrón
 *      Builder de ser el smell que el patrón Builder resuelve. Se descarta por
 *      `metrics.isConstructor`, que `code-analyzer.ts` ya resuelve por nodo de
 *      gramática dedicado (Java/C# `constructor_declaration`) o por
 *      `CONSTRUCTOR_NAMES` (`initialize`/`constructor`/`__init__`), sin
 *      decisión por lenguaje en este archivo.
 *
 *   G. **LAA SE MIDE CONTRA EL PROVEEDOR DOMINANTE, NO CONTRA LA SUMA DE
 *      TODOS.** Es la incoherencia que dejó la ola N: el punto (C) hizo que
 *      ATFD y el TÍTULO hablaran de UNA unidad concreta, pero el denominador
 *      de LAA seguía sumando los eventos de TODOS los proveedores. Las dos
 *      mitades de la regla medían cosas distintas, y el hallazgo afirmaba algo
 *      que sus propios números desmentían. El caso que lo prueba, juzgado
 *      falso por eso: `guava/LinkedListMultimap#removeNode(node)` decía "usa
 *      más datos de node que de LinkedListMultimap" mientras su `detail`
 *      reportaba 5 miembros del proveedor contra 10 accesos propios. Ahora
 *      LAA = propios / (propios + eventos DEL DOMINANTE), que es exactamente
 *      la frase que el título afirma. Es estrictamente más exigente (el
 *      denominador nuevo es un sumando del viejo), así que sólo puede quitar
 *      hallazgos, nunca agregarlos. Los eventos de todos los proveedores
 *      siguen contados y visibles en `evidence`.
 *
 *   H. **UN PARÁMETRO PUEDE SER DATO PROPIO** — ver `ownParametersOf`. Dos
 *      formas medidas: el parámetro del MISMO TIPO que la clase
 *      (`StatsAccumulator.addAll(StatsAccumulator)`: el "proveedor foráneo" ES
 *      la propia clase, y mudar el método lo deja donde ya estaba) y el
 *      parámetro que lleva el NOMBRE de un miembro que la clase declara
 *      (`render(props, state)` con `this.state = …` en el constructor: el
 *      estado propio de la unidad, que un protocolo externo le vuelve a
 *      entregar por la lista de parámetros). Es el mismo problema conceptual
 *      que el receptor `self`/`cls` que ya trata `isSelfReference`: dato
 *      propio que no llega por un nodo dedicado.
 *
 *   I. **LAA VUELVE A SER UNA RAZÓN ENTRE ATRIBUTOS DISTINTOS**, que es la
 *      definición de Lanza & Marinescu, en vez de "eventos propios contra
 *      eventos foráneos". La ola N declaró el conteo por evento como
 *      simplificación, pero no era neutra: contaba EVENTOS de un lado y
 *      ATRIBUTOS del otro (ATFD siempre contó miembros distintos), así que la
 *      razón medía dos cosas distintas. Las dos consecuencias, las dos con
 *      caso medido: un constructor de copia que ESCRIBE el mismo campo propio
 *      diez veces se leía como diez datos propios (falso NEGATIVO), y un
 *      método que invoca cinco veces el mismo miembro ajeno se leía como cinco
 *      datos foráneos (falso POSITIVO — `writer.push(1)` + `writer.push(2)` es
 *      UN atributo invocado dos veces). Ahora LAA = miembros propios distintos
 *      / (propios distintos + miembros distintos alcanzados por el proveedor
 *      dominante). El denominador incluye dato, orden y eslabón de cadena
 *      porque LAA mide LOCALIDAD DE ACCESO, no ATFD: lo que decide si el
 *      método "vive lejos" es a cuántos nombres distintos tiene que ir, no si
 *      lo que trae es un dato o una orden.
 *
 *   J. **LO QUE SE PROBÓ Y SE DESCARTÓ MIDIENDO** — queda escrito porque el
 *      resultado negativo es información, y porque la hipótesis es la que
 *      cualquiera va a volver a tener. HIPÓTESIS: un nombre SIN CALIFICAR que
 *      nada de este archivo liga (ni parámetro, ni local, ni miembro
 *      declarado) es un envío implícito a `self` — exactamente el argumento
 *      del punto (E), que ya cuenta `foo(x)` como propio, extendido al mismo
 *      nombre escrito SIN paréntesis. Motivación: es el mecanismo que explica
 *      el 75 % del volumen del kind (una clase que hereda TODO su estado de
 *      una superclase de otro archivo lee `own = 0` por construcción, y el
 *      límite declarado del punto (B) la deja así).
 *      MEDIDO, y por eso está descartado: con el cambio, el volumen del
 *      corpus baja de 541 a 449 — pero NO baja parejo. Ruby conserva el 95 %
 *      (404 de 427), Java el 46 %, y **C# se queda con 4 de 53, TypeScript
 *      con 1 de 13 y JavaScript con 0 de 2**. La razón es semántica y no
 *      tiene arreglo genérico desde el AST: en Ruby y en Java un nombre
 *      desnudo no ligado ES un envío al receptor implícito, mientras que en
 *      JS/TS/C#/Python el MISMO nombre desnudo es casi siempre un import, un
 *      global del lenguaje o un tipo. Contarlo como propio infla LAA y apaga
 *      el detector en tres lenguajes para arreglar la mitad de uno.
 *      SI ALGUIEN LO RETOMA: hace falta distinguir "nombre resuelto por la
 *      jerarquía de la unidad" de "nombre resuelto por el módulo", y eso pide
 *      el resolvedor de `graph/resolve.ts`, no el AST de un archivo.
 *   K. **SIN NOMBRE NO HAY MÉTODO QUE MUDAR.** Una función-like sin campo
 *      `name` que no está anidada en otra función (en JS/TS, la flecha
 *      asignada a un campo de clase) se evaluaba como método y emitía el
 *      título `"función anónima" usa más datos de "res" que de
 *      "StreamableFile"` — caso real `nest/streamable-file.ts:20`, que salió
 *      sorteado en la muestra estratificada de esta ola. Ese hallazgo no
 *      nombra nada que se pueda mover, y sus parámetros los ata el protocolo
 *      de quien la invoca, que es exactamente el argumento del punto (D).
 *      LÍMITE, y está pedido a otro frente: `code-analyzer.ts` no recupera el
 *      nombre de la flecha desde el campo que la declara, así que una flecha
 *      de clase CON nombre también queda afuera. El arreglo correcto es que
 *      `FunctionUnit.name` lo traiga; acá sólo se deja de emitir un hallazgo
 *      que no se puede accionar.
 *
 * ────────────────────────────────────────────────────────────────────────
 * LO QUE CAMBIÓ EN LA OLA P — la DEFINICIÓN, no el umbral. El kind llevaba
 * 540 hallazgos y 0 % de precisión medida por tres personas distintas en tres
 * olas (ola M con n=32, ola N con n=20 estratificado, ola O con n=20
 * estratificado). Con ese historial, el sospechoso no es el criterio: es la
 * pregunta.
 * ────────────────────────────────────────────────────────────────────────
 *
 *   L. **LA UNIDAD AJENA TAMBIÉN PUEDE SER UN COLABORADOR QUE LA CLASE
 *      SOSTIENE — y hasta la ola O este detector NO PODÍA EMITIR LA FORMA
 *      CANÓNICA DEL SMELL.** MEDIDO: de los 574 hallazgos que el kind emitía
 *      al empezar esta ola, **551 tenían como proveedor un PARÁMETRO y 23 un
 *      colaborador** — y esos 23 aparecieron recién con este punto: antes eran
 *      CERO. El ejemplo canónico de Fowler (`getPhoneNumber()` leyendo
 *      `phone.areaCode`/`.prefix`/`.number`, donde `phone` es un CAMPO) era
 *      estructuralmente invisible acá, porque el "DESVÍO DECLARADO" del final
 *      de este docstring mandaba contar `this.otro.dato` como propio.
 *      LA JUSTIFICACIÓN DE ESE DESVÍO DEJÓ DE SER CIERTA EN LA OLA O. Decía:
 *      "cada salto foráneo `this.otro.dato` viene acompañado, obligatoriamente,
 *      del salto propio `this.otro`, así que LAA >= 1/2 siempre en una cadena
 *      de profundidad 2". Eso era verdad contando EVENTOS, que es como la ola
 *      N contaba LAA. El punto (I) de la ola O pasó LAA a contar ATRIBUTOS
 *      DISTINTOS, y con atributos distintos la aritmética se da vuelta:
 *      `this.otro.a` + `this.otro.b` + `this.otro.c` da UN atributo propio
 *      (`otro`) contra TRES de `otro`, o sea LAA = 1/4. El desvío sobrevivió a
 *      la ola O sólo porque nadie volvió a hacer la cuenta.
 *      LA REGLA NUEVA, en una frase: **el proveedor es la unidad NOMBRADA por
 *      la que pasa el acceso** — un parámetro de este método o un miembro de
 *      esta clase (`this.x`, `@x`, o el nombre desnudo que la clase declara).
 *      El dato PROPIO que se lee es el colaborador mismo (`otro`); lo que se
 *      alcanza a través de él pertenece a la clase de `otro`. Es exactamente
 *      la misma regla de PROFUNDIDAD que ya regía del lado del parámetro,
 *      aplicada también del lado propio, y es la definición de ATFD de Lanza &
 *      Marinescu sin el desvío.
 *
 *   M. **"¿EL DESTINO DEL `Move Method` EXISTE EN ESTE REPO?" — SE MIDIÓ COMO
 *      FILTRO, NO SEPARA, Y QUEDA COMO EVIDENCIA.** Es lo que la ola O dejó
 *      pedido como el arreglo de fondo del kind ("el TIPO del parámetro
 *      resuelto contra el grafo, para saber si el destino del `Move Method`
 *      existe en este repo"), y por eso este detector declara `needsGraph`.
 *      IMPLEMENTACIÓN: `declaredMembersByUnit` arma, de los nodos `symbol` del
 *      grafo, qué nombres declara JUNTOS cada unidad del repo, y
 *      `bestDestinationMatch` cuenta cuántos de los miembros que el método le
 *      lee al proveedor comparte la unidad que más comparte. Para un tipo
 *      ajeno (un nodo AST de una gema, `java.io.File`, `Pathname`) ese número
 *      es 0 o 1; para un tipo del repo es alto.
 *      EL RESULTADO NEGATIVO, MEDIDO, y por eso está escrito acá: como FILTRO
 *      con piso 2 deja pasar el **12,5 %** del volumen (72 de 574 sobre
 *      rubocop+jekyll+nest+eslint+preact) y **los que pasan son la MISMA
 *      familia** — leí los 5 primeros de rubocop uno por uno (`handle_switch`,
 *      `reader_self_assignment?`, `assignment_without_argument_usage`,
 *      `align_column`, `_cant_be_nil?`) y los 5 son falsos por el mismo motivo
 *      que los que el filtro sacó. Con piso = ATFD (la unidad tiene que
 *      declararlos TODOS) sobreviven 3 de 72, o sea que apaga el detector.
 *      La razón por la que no separa: en un repo de 13.554 símbolos, que
 *      alguna unidad comparta DOS nombres con un tipo ajeno es coincidencia
 *      garantizada, no identificación. **Por eso el número se emite como
 *      EVIDENCIA y no filtra nada**: le dice al que juzga si el consejo es
 *      accionable, sin comprar precisión con recall a cambio de nada. Sin
 *      grafo el detector emite exactamente lo mismo, sin esa evidencia.
 *
 *   N. **NO MEDIR NO ES MEDIR CERO** — `if (ownNames.size === 0) continue`.
 *      Con CERO atributos propios distintos, el numerador de LAA no vale 0:
 *      no se pudo medir. `LAA < 1/3` se cumple entonces por construcción, la
 *      mitad citada de la regla nunca se evalúa, y lo que queda es "ATFD >
 *      FEW" — que es literalmente la regla de la ola M, medida al 3 % de
 *      precisión. N8 diagnosticó esta degeneración en la ola O ("la mitad de
 *      la regla citada no se está evaluando en la mitad del corpus") e intentó
 *      arreglarla por el otro lado (contar más cosas como propias, punto J);
 *      eso apagó tres lenguajes y se revirtió. El arreglo por ESTE lado no
 *      tiene ese problema porque no cambia qué cuenta como propio: cambia qué
 *      se puede AFIRMAR. Un hallazgo cuya mitad de la regla no se midió no se
 *      emite, igual que `isStaticLike` ya se negaba a comparar contra un
 *      estado de instancia que no existe.
 *      MEDIDO: 540 -> 354 en el corpus (-34,4 %), sin dejar ningún lenguaje en
 *      cero (ruby 409->233, java 52->46, csharp 37->23, python 29->33,
 *      typescript 12->18, javascript 1->1; python y typescript SUBEN por el
 *      punto L). De los 19 falsos juzgados que seguían vivos, 10 son
 *      exactamente esta forma.
 *
 *   O. **EL DESTINO DEL `Move Method` DEJA DE SER UN NOMBRE DE VARIABLE Y
 *      PASA A SER UNA UNIDAD VERIFICADA** (Ola R, frente R5). Es lo que el
 *      punto (M) midió que el grafo de entonces NO podía dar y lo que la
 *      relación `declares-type` de esta ola sí da. El detector emite sólo
 *      cuando el tipo del proveedor dominante es una CLASE DE ESTE REPO, y
 *      entonces la NOMBRA en el título, en el `detail` y en la evidencia.
 *      Ver el docstring de `providerUnit`: la tabla completa por repo y
 *      lenguaje, la línea exacta entre "miré y no hay" y "no pude mirar", y
 *      por qué sin grafo el detector emite igual que antes de esta ola.
 *
 * LO QUE LA OLA P *NO* ARREGLÓ, dicho con el número: la precisión sigue en
 * 0 % (muestra estratificada por (repo, lenguaje), semilla fija 1805, n=22
 * sobre la población nueva de 354: 20 falsos, 2 dudosos, 0 verdaderos). El
 * ruido bajó un tercio y la forma canónica del smell pasó a ser detectable,
 * pero la familia dominante — un método que transforma su parámetro, donde el
 * parámetro es de un tipo que este proyecto no define (un nodo AST de una
 * gema, un `JsonReader`, una conexión de driver) — sigue siendo
 * ESTRUCTURALMENTE IDÉNTICA a la envidia real, y el punto (M) demuestra
 * midiendo que el grafo, tal como está hoy, tampoco las separa. Lo que
 * separaría es el TIPO del proveedor resuelto de verdad, que para Ruby (el
 * 66 % del volumen) no existe en ninguna parte del árbol.
 *
 * ────────────────────────────────────────────────────────────────────────
 * LO QUE AGREGA LA OLA Z (frente Z2) — el SEGUNDO hecho que la Ola Q §2.2
 * nombró para este kind, y el BARATO. La sub-población donde el proveedor
 * es un PARÁMETRO (93,5 % del kind) pide resolución de TIPO declarado real
 * contra el grafo — CARO, y esta ola lo SONDEA sin pagarlo (frente Z4, no
 * este archivo). Para el resto — el proveedor es un COLABORADOR (un campo
 * que ESTA clase declara, alcanzado por `this.x`/`self.x`/`@x` o por su
 * nombre desnudo, punto L) — el hecho es ESTRUCTURA PURA y no pide grafo.
 * ────────────────────────────────────────────────────────────────────────
 *
 *   P. **UN CAMPO QUE UN SOLO MÉTODO EXPLOTA LE PERTENECE A ESE MÉTODO Y HAY
 *      ENVIDIA; UN CAMPO QUE VARIOS HERMANOS EXPLOTAN POR SU CUENTA ES ESTADO
 *      COMPARTIDO DE LA CLASE Y NO LA HAY.** Si el campo `options` sólo lo
 *      explota `run()` (lee varios de sus datos), `options` es dato de
 *      `run`: mudar `run` a la clase de `options` es exactamente lo que pide
 *      `Move Method`. Si además `validate()` y `cancel()` de la MISMA clase
 *      TAMBIÉN leen VARIOS datos de `options` cada uno por su cuenta, el
 *      campo no es posesión de ninguno de los tres — es la pieza de estado
 *      que la clase entera coordina, y "mudar" uno de los tres no cambia
 *      nada: los otros dos se quedan leyéndolo desde donde están.
 *
 *      "EXPLOTAR" NO ES "MENCIONAR" — Y ESTA DISTINCIÓN ES EL DEFECTO QUE ESTE
 *      PUNTO TENÍA EN SU PRIMERA VERSIÓN, MEDIDO Y CORREGIDO ANTES DE
 *      PUBLICAR, no supuesto ni descartado por higiene. La primera versión
 *      contaba un hermano como "comparte el campo" apenas su nombre apareciera
 *      en `ownNames` — UNA sola mención bastaba, aunque fuera una única
 *      llamada de paso sin leer ningún dato suyo. Contra el corpus real eso
 *      apagaba el ÚNICO HALLAZGO VERDADERO VIVO DEL KIND
 *      (`tests/golden/precision/rubocop.verdicts.csv`,
 *      `rubocop/lib/rubocop/lsp/server.rb#configure`, `verdadero`,
 *      `stillPresent: true`): `Server` es una fachada de `Runtime`, y
 *      `format`/`offenses`/`reset_project_index` cada uno REENVÍA una única
 *      llamada a `@runtime` — un miembro distinto cada uno, delegación limpia
 *      de fachada — mientras que `configure` escribe TRES atributos DE
 *      `@runtime` directamente (`safe_autocorrect=`, `lint_mode=`,
 *      `layout_mode=`) en vez de delegar, que es la envidia real que el
 *      humano juzgó ("Server hace el trabajo de parseo de configuración de
 *      Runtime en su lugar"). La versión por mención no distinguía "un
 *      hermano reenvía una llamada" de "un hermano también arma su propia
 *      lógica con VARIOS datos de este campo", así que contaba a los tres
 *      delegadores limpios como prueba de "estado compartido" y apagaba al
 *      único método que de verdad lo explotaba.
 *
 *      LA REGLA CORREGIDA reusa el propio umbral ATFD del detector
 *      (`atfdThreshold`, el mismo `citado(2, Lanza & Marinescu)` de la línea
 *      146): un hermano sólo cuenta como "comparte este campo" si SU PROPIA
 *      relación con el proveedor —medida con la MISMA `ProviderTally` por
 *      proveedor que ya arma `tallyAccess`, el campo `distinctHops` (dato +
 *      orden + eslabón, el mismo conjunto que ya es el denominador de LAA en
 *      el punto I)— alcanza el mismo umbral que el propio detector exige
 *      para hablar de envidia. Es la MISMA pregunta que el detector ya le
 *      hace al método candidato, aplicada también a sus hermanos: ni un
 *      umbral nuevo inventado para esta ola, ni resolución de tipos, ni
 *      ninguna arista de grafo — sigue siendo el mismo AST que `tallyAccess`
 *      ya recorre, y funciona en los nueve lenguajes del analizador porque no
 *      lee nada que dependa de uno.
 *
 *      SE APLICA SÓLO CUANDO EL PROVEEDOR ES UN COLABORADOR
 *      (`!bindings.parameters.has(dominant.name)`): la mitad cara del kind
 *      —el proveedor es un parámetro— queda exactamente igual que antes de
 *      esta ola, sin este chequeo ni ningún otro nuevo. Se cuenta también el
 *      método SIN NOMBRE del punto (K), que el segundo bucle descarta como
 *      candidato de HALLAZGO PROPIO pero que sigue siendo un hermano que
 *      puede compartir el campo. Las funciones ANIDADAS (punto D) no cuentan
 *      como hermanas propias: sus accesos ya están plegados dentro de la
 *      tally del método que las contiene, contarlas aparte las duplicaría.
 *
 *      LOS CONSTRUCTORES QUEDAN AFUERA DE `methods[]` DESDE LA PRIMERA
 *      PASADA, no sólo como candidatos (punto F): un constructor que
 *      INICIALIZA el campo (`this.x = x`, el patrón de inyección más común)
 *      es indistinguible de una lectura para `tallyAccess` — contarlo
 *      apagaba el mismo caso canónico de Fowler que el punto (L) existe para
 *      poder emitir (`phone` se asigna UNA vez en el constructor y se lee en
 *      `getPhoneNumber()`), y lo apagaba en la inmensa mayoría del código
 *      real, donde casi todo campo se inicializa en algún constructor.
 *
 *      SESGO DECLARADO, el mismo de siempre en este archivo: si no hay
 *      `ClassScope` para esta función (caso límite que no debería ocurrir
 *      con `className` no nulo, pero el código no lo asume), el chequeo NO
 *      FILTRA — el hallazgo se emite igual que antes de esta ola. Nunca al
 *      revés: la ausencia de dato nunca convierte un candidato en excluido.
 *
 *      LO QUE ESTO NO CUBRE, dicho con el número medido (§ ola-z/informes,
 *      Z2): la sub-población "colaborador" es chica y el umbral corregido es
 *      exigente a propósito — sesgo hacia el falso negativo, el de siempre en
 *      este archivo. Ver el informe del frente para el tamaño exacto sobre
 *      los 13 repos y la precisión MEDIDA por ancla, no estimada.
 *
 *
 * DATO vs ORDEN — la otra mitad de "a quién le cuenta qué". ATFD es Access
 * To Foreign DATA: Lanza & Marinescu cuentan los ATRIBUTOS de otra clase,
 * accedidos directamente o a través del ACCESOR que los reexpone — y un
 * accesor, por definición, no lleva argumentos. Una invocación CON argumentos
 * (`writer.WriteValue(v)`, `input.sub(re, "")`, `node.method?(:[])`) no es un
 * dato que se le saque al colaborador: es una orden que se le da. Cuenta como
 * acceso foráneo (baja LAA, y se reporta en `evidence`) pero no como miembro
 * del proveedor. Medido: es lo que separa un método utilitario que TRANSFORMA
 * su argumento (`strip_index(input)` -> `input.nil?`, `input.empty?`,
 * `input.sub(…)`: dos lecturas y una orden, ATFD=2) de uno que LEE los datos
 * de otra unidad para decidir con ellos (`urls_only_differ_by_case(site)` ->
 * `site.pages`, `site.docs_to_write`, `site.dest`: ATFD=3, y el método
 * pertenece a `Site`). Sin esta distinción, en `jekyll` disparaban 10 métodos
 * y con ella 3.
 *
 * PROFUNDIDAD — qué le cuenta a QUIÉN, y por qué esto decide más que
 * cualquier umbral. El ATFD de un proveedor cuenta SÓLO los miembros que se
 * leen directamente de él (`p.x`). Un salto más profundo (`p.x.y`) es dato
 * foráneo — baja LAA, se cuenta y se reporta — pero NO es dato de `p`: `y`
 * pertenece a la clase de `p.x`, y mudar el método a la clase de `p` no lo
 * acercaría ni un poco. Medido: sin esta distinción, un adaptador de una sola
 * línea (`return a.getHash().hashBytes(input).asBytes();`, caso real de
 * `guava/MessageDigestAlgorithmBenchmark.java`) leía ATFD=3 con LAA=0 y
 * disparaba, cuando lo que tiene es UNA visita a `a` y una cadena de Demeter
 * — que es exactamente lo que `demeter-chain` reporta, con su propio nombre.
 *
 * EL PRECIO, MEDIDO Y DECLARADO: el único hallazgo juzgado VERDADERO del
 * corpus (`jekyll/tags/post_url.rb#post_slug`) deja de dispararse. Disparaba
 * por la razón equivocada: su ATFD de 3 salía de contar `path.nil?` — donde
 * `path` es una variable LOCAL — como tercer "miembro foráneo". Con la
 * pregunta corregida lee ATFD=2 sobre `other` (`basename` y `data`), uno por
 * debajo de FEW=2. Es un falso negativo real y se dice acá en vez de
 * esconderlo: la alternativa (atribuirle al proveedor toda la cadena) lo
 * recuperaba a cambio de revivir la familia entera de adaptadores de una
 * línea, que en el corpus es dos órdenes de magnitud más grande.
 *
 * FALSOS POSITIVOS QUE QUEDAN (qué forma legítima se sigue confundiendo):
 *   - Un DTO/Value Object o un Builder fluido cuyo propósito ES envolver y
 *     reexponer datos de otro objeto luce estructuralmente idéntico a la
 *     envidia real — Lanza & Marinescu documentan esta misma confusión para
 *     la estrategia canónica, no es un defecto de esta implementación.
 *   - Un método Visitor/Strategy/Comparator que, por diseño, opera casi
 *     enteramente sobre el objeto que recibe como parámetro (caso real
 *     medido: `newtonsoft-json/JValue.cs#TryBinaryOperation`, un binder que
 *     opera sobre la instancia que recibe): el patrón bien aplicado dispara
 *     la misma señal estructural que un método que debería haberse movido.
 *     Es el precio de conservar el parámetro como proveedor foráneo, que es
 *     el único caso donde este detector encontró un verdadero.
 *   - Un método cuyo estado propio vive ENTERO en una superclase o mixin de
 *     OTRO archivo (ver el límite de (B)): su LAA se lee más baja que la
 *     real. Sesgo hacia el falso positivo en ese caso puntual, medido y
 *     acotado (en el corpus, los dos casos de `rubocop` que lo tocaban ya no
 *     disparan porque su ATFD por proveedor cae bajo el umbral).
 *
 * EXCEPCIONES POR LENGUAJE (las únicas dos que este detector se permite, las
 * dos por ortografía MANDADA por el lenguaje, no por gramática — mismo patrón
 * que `isEmptyHandler` en `empty-catch.ts` y que `CONSTRUCTOR_NAMES` en
 * `code-grammar.ts`): Python no dedica un tipo de nodo a `self`/`cls` (son
 * `identifier` comunes, propios por convención PEP-8), y por lo mismo un
 * método Python sin `self`/`cls` en su firma es el equivalente estructural de
 * un `@staticmethod`. Ver `PYTHON_SELF_NAMES`.
 *
 * LENGUAJE QUE QUEDA AFUERA: **Go**. No por este detector sino por el gate
 * `needs: ["unidad-tipo-clase"]` — `metrics.className` es SIEMPRE `null` en
 * Go (sus `struct` no exponen el campo `body` que `isClassLike` exige), así
 * que ningún método Go llega hasta acá. Está cubierto por un test explícito.
 *
 * SIMPLIFICACIÓN RETIRADA EN LA OLA O (LAA): hasta la ola N, LAA se calculaba
 * por EVENTO de un lado (cada salto contaba, se repitiera o no el mismo
 * miembro) mientras ATFD contaba miembros DISTINTOS del otro. Estaba declarada
 * como simplificación, pero sesgaba la razón entera — ver el punto (I). Hoy
 * los dos lados cuentan ATRIBUTOS DISTINTOS, que es la definición original.
 * Los EVENTOS siguen contados y visibles en `evidence`: son lo que dice cuánto
 * se repite el ida y vuelta, aunque no sean lo que decide.
 *
 * DESVÍO RETIRADO EN LA OLA P (era: "para Lanza & Marinescu `this.otro.dato`
 * es dato FORÁNEO; acá cuenta como propio"). Sus dos razones caducaron por
 * separado y las dos están medidas — ver el punto (L). (a) "los veredictos a
 * mano lo leen así ('this.options y this.jobs sí son propios')": el veredicto
 * citado es de un método ORQUESTADOR (`task-lifecycle.ts#createTask`, ATFD=30
 * repartido entre cuatro colaboradores), que el chequeo de `dominance` ya
 * descarta por su cuenta desde la ola N — no hacía falta el desvío para eso, y
 * el test de ese caso sigue verde con el desvío retirado. (b) "LAA >= 1/2
 * siempre en una cadena de profundidad 2": era cierto contando EVENTOS, y el
 * punto (I) de la ola O pasó LAA a contar ATRIBUTOS DISTINTOS — con atributos,
 * `this.otro.a/b/c` da 1 propio contra 3 de `otro`, LAA = 1/4. HOY el dato
 * propio de la cadena es el COLABORADOR (`otro`) y lo que se alcanza a través
 * suyo es dato de la clase de `otro`, que es lo que Lanza & Marinescu dicen y
 * lo único que hace posible emitir el caso canónico de Fowler.
 */
import type { ProbeNode } from "../../code-grammar.js";
import { type CodeGraph, type GraphIndex, memberSignatures } from "../../graph/types.js";
import { declaredTypeAtSite } from "../primitivas/r5-tipo-del-sitio.js";
import { citado, pisoDeclarado } from "../thresholds.js";
import { walkTree } from "../tree-walk.js";
import type { AstNode, FileUnit, FunctionUnit, IntraFileDetector, RawFinding, RunContext } from "../types.js";

type ThresholdKey = "atfd" | "laa" | "dominance";

/**
 * Umbral PROPIO (no de Lanza & Marinescu) — MISMO valor y MISMO concepto que
 * `feature-envy-inter.ts#DOMINANCE_SPEC`: qué proporción del total de
 * miembros foráneos distintos tiene que concentrarse en un único proveedor
 * para hablar de "envidia hacia ESA otra unidad" en vez de "método que
 * reparte accesos entre varias" (el caso normal de un coordinador).
 */
const DOMINANCE_SPEC = pisoDeclarado(0.5, {
  rationale:
    "mayoría simple (>=50%) de los miembros foráneos distintos concentrados en UN solo proveedor — sin esto, un " +
    "método que reparte accesos entre varias unidades colaboradoras (normal, no un smell) calificaría igual que " +
    "uno genuinamente envidioso de una única otra unidad. Mismo umbral y mismo concepto que " +
    "`feature-envy-inter.ts#DOMINANCE_SPEC`, generalizado de archivo a función.",
});

/** Campo GENÉRICO de "base" de un acceso a miembro — probado por sonda directa
 *  contra las 6 gramáticas soportadas (nunca vocabulario, nombres de campo). */
const ACCESS_BASE_FIELDS = ["object", "receiver", "operand", "expression"] as const;
/** Campo GENÉRICO del "miembro" accedido — ídem, probado por sonda directa. */
const MEMBER_NAME_FIELDS = ["property", "attribute", "method", "field", "name"] as const;
/**
 * Campos por los que se BAJA para llegar a la raíz de una cadena, además de
 * los de base — confirmado por sonda directa: `array` es el campo del
 * `array_access` de Java (`arr[pos]`), la única indexación de las 6
 * gramáticas que no reusa `object`/`expression` para su base.
 */
const INDEX_BASE_FIELDS = ["array"] as const;
/** Qué invoca una llamada SIN receptor — confirmado por sonda directa:
 *  `function` (JS/TS/Vue `call_expression`, C# `invocation_expression`),
 *  `method` (Ruby `call` sin `receiver`), `name` (Java `method_invocation`
 *  sin `object`). Sólo se baja por acá cuando el nodo TAMBIÉN expone una
 *  lista de argumentos, para no confundir el `name` de una declaración con el
 *  destino de una llamada. */
const CALL_TARGET_FIELDS = ["function", "method", "name"] as const;
const ARGUMENT_LIST_FIELDS = ["arguments", "argument_list"] as const;

/** Keyword dedicado de auto-referencia: `this` (JS/TS/Vue/Java), `self`
 *  (Ruby), `this_expression` (C#), y `super` en todas — confirmado por sonda
 *  directa. Python no tiene entrada acá: ver `PYTHON_SELF_NAMES`. */
const SELF_NODE_TYPE = /^(this|self|super)(_expression)?$/;
/** Dato de la propia instancia SIN receptor: la variable de instancia
 *  (`@cache`) y la de clase (`@@x`) de Ruby, tipos de nodo dedicados —
 *  confirmado por sonda directa. Vocabulario de gramática (mecanismo B), no
 *  una decisión por `language`: ninguna otra de las 6 gramáticas produce
 *  estos tipos, así que el chequeo es un no-op donde no aplica. */
const SELF_DATA_NODE_TYPE = /^(instance|class)_variable$/;
/** Literal de símbolo (`:site`) — el `attr_reader :site` de Ruby es la forma
 *  en que esa gramática DECLARA un miembro sin nodo de declaración. Mismo
 *  criterio: vocabulario de gramática, no-op donde el tipo no existe. */
const SYMBOL_NODE_TYPE = /(^|_)symbol$/;
/** Un nodo que declara un nombre ligado (`variable_declarator` en JS/TS/Java/
 *  C#) — confirmado por sonda directa. Java lo resuelve por campo `name`; C#
 *  lo deja como hijo posicional, de ahí las dos vías en `declaredName`. */
const DECLARATOR_NODE_WORD = /(^|_)declarator$/;
/** Tipos de nodo que NOMBRAN algo: `identifier` y sus variantes por gramática
 *  (`property_identifier`/`field_identifier`). `type_identifier` queda afuera
 *  a propósito: nombra un TIPO, no un miembro ni una atadura. */
const IDENTIFIER_NODE_TYPE = /(^|_)identifier$/;
const TYPE_IDENTIFIER_NODE_TYPE = /^type_identifier$/;
/** Python no dedica un tipo de nodo a `self`/`cls`: son `identifier` comunes,
 *  "propios" por convención PEP-8 (mandada por el estilo del lenguaje, no por
 *  su gramática) — misma naturaleza que `CONSTRUCTOR_NAMES` en
 *  `code-grammar.ts`. Se aplica sólo bajo `language === "python"`. */
const PYTHON_SELF_NAMES: ReadonlySet<string> = new Set(["self", "cls"]);

const EMPTY_NAMES: ReadonlySet<string> = new Set<string>();

function fieldOf(node: ProbeNode, fields: readonly string[]): ProbeNode | null {
  for (const field of fields) {
    const child = node.childForFieldName(field);
    if (child) return child;
  }
  return null;
}

function textOf(node: ProbeNode): string {
  return (node as AstNode).text;
}

function isIdentifierLike(node: ProbeNode): boolean {
  return node.isNamed && IDENTIFIER_NODE_TYPE.test(node.type) && !TYPE_IDENTIFIER_NODE_TYPE.test(node.type);
}

/** Quita el sigilo con el que una gramática marca una forma de nombre
 *  (`@cache` -> `cache`, `:site` -> `site`): todo lo que no sea letra o `_`
 *  al principio del texto. Genérico: en las gramáticas sin sigilo es un
 *  no-op. */
function bareName(text: string): string {
  return text.replace(/^[^\p{L}_]+/u, "");
}

/* ────────────────────────────────────────────────────────────────────────
 * Accesos a miembro y raíz de la cadena
 * ──────────────────────────────────────────────────────────────────────── */

interface MemberAccess {
  base: ProbeNode;
  member: ProbeNode;
}

function accessOf(node: ProbeNode): MemberAccess | null {
  if (!node.isNamed) return null;
  const base = fieldOf(node, ACCESS_BASE_FIELDS);
  if (!base) return null;
  const member = fieldOf(node, MEMBER_NAME_FIELDS);
  if (!member) return null;
  return { base, member };
}

/**
 * La cadena de acceso, descompuesta: su RAÍZ y los ESLABONES NOMBRADOS que
 * hay entre la raíz y la base recibida.
 *
 * Se baja por la base (`a.b.c` -> `a`), por la indexación (`arr[i].x` -> `arr`)
 * y por el destino de una llamada sin receptor (`helper(x).y` -> `helper`),
 * hasta llegar a un nodo que no expone ninguno de esos campos. Ver el punto
 * (A) del docstring del módulo: sin esto, todo salto encadenado quedaba
 * "ambiguo" y se descartaba.
 *
 * `links` son los nombres de los eslabones, DE LA RAÍZ HACIA AFUERA: para la
 * base `this.pedido.cliente` da `["pedido", "cliente"]`. Es lo que el punto
 * (L) necesita para saber POR QUÉ UNIDAD NOMBRADA pasa el acceso: en
 * `this.pedido.total`, la unidad es `pedido` y `total` es un miembro SUYO.
 *
 * `throughOpaque` marca que la bajada atravesó algo que NO es un eslabón
 * nombrado (una indexación, el resultado de una llamada, un miembro que no es
 * un identificador). Un acceso así no se le atribuye a la unidad como miembro
 * directo: lo que hay del otro lado es de una clase que este archivo no
 * nombra.
 */
interface AccessChain {
  root: ProbeNode;
  links: readonly string[];
  throughOpaque: boolean;
}

function chainOf(base: ProbeNode): AccessChain {
  const links: string[] = [];
  let node = base;
  let throughOpaque = false;
  for (let guard = 0; guard < 64; guard++) {
    const access = accessOf(node);
    if (access) {
      if (isIdentifierLike(access.member)) links.push(textOf(access.member));
      else throughOpaque = true;
      node = access.base;
      continue;
    }
    const down = fieldOf(node, ACCESS_BASE_FIELDS) ?? fieldOf(node, INDEX_BASE_FIELDS);
    if (down) {
      throughOpaque = true;
      node = down;
      continue;
    }
    if (fieldOf(node, ARGUMENT_LIST_FIELDS)) {
      const target = fieldOf(node, CALL_TARGET_FIELDS);
      if (target) {
        throughOpaque = true;
        node = target;
        continue;
      }
    }
    break;
  }
  links.reverse();
  return { root: node, links, throughOpaque };
}

/* ────────────────────────────────────────────────────────────────────────
 * Qué declara la CLASE que contiene al método — el punto (B) del docstring
 * ──────────────────────────────────────────────────────────────────────── */

interface Span {
  startRow: number;
  startColumn: number;
  endRow: number;
  endColumn: number;
}

function spanOf(node: ProbeNode): Span {
  const n = node as AstNode;
  return {
    startRow: n.startPosition.row,
    startColumn: n.startPosition.column,
    endRow: n.endPosition.row,
    endColumn: n.endPosition.column,
  };
}

function contains(outer: Span, inner: Span): boolean {
  const startsBefore = outer.startRow < inner.startRow || (outer.startRow === inner.startRow && outer.startColumn <= inner.startColumn);
  const endsAfter = outer.endRow > inner.endRow || (outer.endRow === inner.endRow && outer.endColumn >= inner.endColumn);
  return startsBefore && endsAfter;
}

function sameSpan(a: Span, b: Span): boolean {
  return a.startRow === b.startRow && a.startColumn === b.startColumn && a.endRow === b.endRow && a.endColumn === b.endColumn;
}

function spanKey(node: ProbeNode): string {
  const s = spanOf(node);
  return `${s.startRow}:${s.startColumn}:${s.endRow}:${s.endColumn}`;
}

/** El nombre que declara un `variable_declarator`: campo `name` (Java, JS/TS)
 *  o primer hijo identificador (C#, que lo deja posicional) — las dos vías
 *  confirmadas por sonda directa. */
function declaredName(node: ProbeNode): string | null {
  const byField = fieldOf(node, ["name"]);
  if (byField && isIdentifierLike(byField)) return textOf(byField);
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && isIdentifierLike(child)) return textOf(child);
  }
  return null;
}

/**
 * Todo nombre que la unidad tipo-clase `classNode` declara como MIEMBRO en
 * ESTE archivo: campos y propiedades (por su declarador o por su campo
 * `name`), métodos (el `name` de cada nodo función-like), variables de
 * instancia (en cualquier parte, porque Ruby las declara asignándolas DENTRO
 * de un método) y símbolos del cuerpo de la clase (la forma de
 * `attr_reader :site`).
 *
 * Sobreincluye a propósito (un nombre de más sólo puede convertir un acceso
 * en PROPIO, nunca en foráneo): el sesgo de este archivo es siempre hacia el
 * falso negativo. Una clase anidada corta el recorrido — sus miembros son
 * suyos, no de la clase de afuera.
 */
function classMemberNames(
  classNode: ProbeNode,
  classNodes: ReadonlySet<string>,
  functionNodes: ReadonlySet<string>,
  language: string,
): { members: ReadonlySet<string>; declaredFields: ReadonlySet<string> } {
  const members = new Set<string>();
  /** El subconjunto que la gramática declara EXPLÍCITAMENTE (un declarador o
   *  una declaración de campo con nombre en el cuerpo de la clase). Ver
   *  `FunctionBindings.assigned`: es lo que distingue `_a = x` como escritura
   *  de campo (Java/C#, donde una local exige declarador) de `a = x` como
   *  local nueva (Ruby/Python, donde asignar ES declarar). */
  const declaredFields = new Set<string>();

  const visit = (node: ProbeNode, insideFunction: boolean): void => {
    if (node.isNamed && node !== classNode) {
      if (classNodes.has(node.type)) return; // clase anidada: sus miembros no son los de ésta
      if (SELF_DATA_NODE_TYPE.test(node.type)) members.add(bareName(textOf(node)));
      if (functionNodes.has(node.type)) {
        const name = fieldOf(node, ["name"]);
        if (name && isIdentifierLike(name)) members.add(textOf(name));
        insideFunction = true;
      } else {
        const access = accessOf(node);
        if (access && isSelfReference(access.base, language) && isIdentifierLike(access.member)) {
          // Cualquier `this.x`/`self.x` del cuerpo de la clase declara `x`
          // como miembro: en JS/TS/Vue y Python un campo se declara
          // asignándolo (`this.x = …` en el constructor), y leerlo también
          // prueba que existe.
          members.add(textOf(access.member));
        } else if (!insideFunction) {
          if (SYMBOL_NODE_TYPE.test(node.type)) members.add(bareName(textOf(node)));
          else if (DECLARATOR_NODE_WORD.test(node.type)) {
            const declared = declaredName(node);
            if (declared) {
              members.add(declared);
              declaredFields.add(declared);
            }
          } else if (!access) {
            const name = fieldOf(node, ["name"]);
            if (name && isIdentifierLike(name)) {
              members.add(textOf(name));
              declaredFields.add(textOf(name));
            }
          }
        }
      }
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) visit(child, insideFunction);
    }
  };

  visit(classNode, false);
  return { members, declaredFields };
}

interface ClassScope {
  span: Span;
  members: ReadonlySet<string>;
  declaredFields: ReadonlySet<string>;
}

/** Índice de las unidades tipo-clase del archivo, de la más externa a la más
 *  interna, con lo que cada una declara. Se arma UNA vez por archivo. */
function classScopesOf(file: FileUnit): readonly ClassScope[] {
  const scopes: ClassScope[] = [];
  walkTree(file.root, (node) => {
    if (!node.isNamed || !file.sets.classNodes.has(node.type)) return;
    const { members, declaredFields } = classMemberNames(node, file.sets.classNodes, file.sets.functionNodes, file.language);
    scopes.push({ span: spanOf(node), members, declaredFields });
  });
  return scopes;
}

/** La clase MÁS INTERNA que contiene a esta función. */
function scopeEnclosing(scopes: readonly ClassScope[], fnSpan: Span): ClassScope | null {
  let best: ClassScope | null = null;
  for (const scope of scopes) {
    if (!contains(scope.span, fnSpan)) continue;
    if (!best || contains(best.span, scope.span)) best = scope;
  }
  return best;
}

/* ────────────────────────────────────────────────────────────────────────
 * Qué liga la propia FUNCIÓN — parámetros, locales, ataduras de bloque
 * ──────────────────────────────────────────────────────────────────────── */

/** Campo GENÉRICO del contenedor de parámetros de un nodo función-like —
 *  mismos dos nombres que ya usa `isFunctionLike` en `code-grammar.ts`. */
const PARAMETER_CONTAINER_FIELDS = ["parameters", "parameter_list"] as const;
/** Mismo vocabulario que `code-grammar.ts#LOOP_WORD` — confirmado por sonda
 *  directa. Replicado acá (no importado) porque `DerivedNodeSets` no expone
 *  el subconjunto "sólo loops" por separado. */
const LOOP_NODE_WORD = /(^|_)(while|until|for|do)(_|$)/;
/** Campo GENÉRICO de la variable que liga un loop — confirmado por sonda
 *  directa: `left` (JS/TS `for_in_statement`, Python `for_statement`, C#
 *  `for_each_statement`), `name` (Java `enhanced_for_statement`), `pattern`
 *  (Ruby `for`/`in` nativo). */
const LOOP_BINDING_FIELDS = ["left", "name", "pattern"] as const;
/**
 * Nodo que ASIGNA — `assignment_expression` (JS/TS/Vue/Java/C#),
 * `assignment`/`augmented_assignment` (Python), `assignment`/
 * `operator_assignment` (Ruby): las 6 gramáticas nombran su nodo de
 * asignación con esta palabra, confirmado por sonda directa.
 *
 * BUG ENCONTRADO MIDIENDO (`jekyll/post_url.rb#deprecated_equality`): mirar
 * el campo `left` de CUALQUIER nodo no alcanza — el nodo `binary` de una
 * comparación (`post_date.year == other.date.year`) también expone `left` y
 * `right`, así que sin este filtro por tipo de nodo los dos lados de toda
 * comparación se leían como "variables locales asignadas" y dejaban de
 * contar como acceso propio. Se veía como una LAA artificialmente baja
 * exactamente en los métodos de comparación, que son el falso positivo
 * clásico de esta métrica.
 */
const ASSIGNMENT_NODE_WORD = /(^|_)assignment(_|$)/;

function isNestedFunctionLike(node: ProbeNode): boolean {
  return fieldOf(node, ["body"]) !== null && fieldOf(node, PARAMETER_CONTAINER_FIELDS) !== null;
}

/**
 * Nombres ligados por el contenedor de parámetros de un nodo función-like.
 * Misma técnica que `unused-variable.ts#paramName`/`collectParameters`:
 * primero el propio hijo si YA es un identificador desnudo (Ruby
 * `method_parameters`, Python `parameters`, JS `formal_parameters` con
 * parámetro simple), si no el campo `name`/`pattern` del hijo (Java
 * `formal_parameter`, C# `parameter`, TS `required_parameter`). CASO APARTE,
 * confirmado por sonda: el `lambda_expression` de Java SIN paréntesis
 * (`page -> …`) resuelve su propio campo `parameters` DIRECTO a un
 * `identifier`, no a un contenedor.
 */
function parameterNames(node: ProbeNode): string[] {
  const params = fieldOf(node, PARAMETER_CONTAINER_FIELDS);
  if (!params) return [];
  if (isIdentifierLike(params)) return [textOf(params)]; // Java lambda sin paréntesis
  const names: string[] = [];
  for (let i = 0; i < params.childCount; i++) {
    const child = params.child(i);
    if (!child || !child.isNamed) continue;
    if (isIdentifierLike(child)) {
      names.push(textOf(child));
      continue;
    }
    const byName = fieldOf(child, ["name", "pattern"]);
    if (byName && isIdentifierLike(byName)) names.push(textOf(byName));
  }
  return names;
}

interface FunctionBindings {
  /** Parámetros de ESTA función: los únicos proveedores foráneos posibles. */
  parameters: ReadonlySet<string>;
  /**
   * Parámetro -> cabeza de su TIPO declarado, donde la gramática lo declara
   * (Java `formal_parameter{type}`, C# `parameter{type}`, TS
   * `required_parameter{type: type_annotation}`, Python `typed_parameter{type}`
   * — los cuatro confirmados por sonda directa; Ruby y JS no declaran tipo y
   * el mapa queda vacío, que es un no-op). Lo consume la regla "el proveedor
   * es del MISMO tipo que la clase" — ver `ownParametersOf`.
   */
  parameterTypes: ReadonlyMap<string, string>;
  /** Ataduras que SOMBREAN a un parámetro homónimo: variable de loop,
   *  parámetro de un lambda anidado, nombre declarado por un declarador. */
  shadowing: ReadonlySet<string>;
  /**
   * Nombres asignados en el cuerpo (lado izquierdo) SIN declararlos. Es la
   * evidencia más DÉBIL de las tres y por eso pierde contra las otras dos y
   * contra los miembros de la clase: `x = …` puede ser una local de Python/
   * Ruby, pero también la escritura de un campo propio en C#/Java
   * (`_formatting = original._formatting`). BUG ENCONTRADO MIDIENDO
   * (`newtonsoft-json/JsonSerializerSettings.cs`, constructor de copia, y el
   * caso ya juzgado falso `JsonSerializer.cs:557` — "el constructor ESCRIBE
   * 13 campos propios desde constantes estáticas; el detector no cuenta la
   * escritura de campo propio como acceso propio"): con esta atadura ganando,
   * un constructor de copia leía own=0 y disparaba con ATFD=20.
   */
  assigned: ReadonlySet<string>;
}

/**
 * LÍMITE DECLARADO, el mismo que ya acepta `unused-variable.ts`: las
 * ataduras se juntan POR NOMBRE en toda la función, no por scope léxico real.
 * Un parámetro genuinamente foráneo que comparte nombre con una variable de
 * bloque en otro punto de la misma función queda excluido también — sesgo
 * deliberado hacia el falso negativo, nunca hacia el falso positivo.
 */
function collectBindings(root: ProbeNode): FunctionBindings {
  const shadowing = new Set<string>();
  const assigned = new Set<string>();

  walkTree(root, (n) => {
    if (!n.isNamed) return;
    if (LOOP_NODE_WORD.test(n.type)) {
      const bound = fieldOf(n, LOOP_BINDING_FIELDS);
      if (bound && isIdentifierLike(bound)) shadowing.add(textOf(bound));
    }
    if (n !== root && isNestedFunctionLike(n)) {
      for (const name of parameterNames(n)) shadowing.add(name);
    }
    if (DECLARATOR_NODE_WORD.test(n.type)) {
      const declared = declaredName(n);
      if (declared) shadowing.add(declared);
    }
    if (ASSIGNMENT_NODE_WORD.test(n.type)) {
      const left = fieldOf(n, ["left"]);
      if (left) {
        if (isIdentifierLike(left)) assigned.add(textOf(left));
        else if (!fieldOf(left, ACCESS_BASE_FIELDS) && !fieldOf(left, INDEX_BASE_FIELDS)) {
          // Destino compuesto que SÍ liga nombres (`a, b = …`). Un destino que
          // es un acceso o una indexación (`payload["x"] = …`, `o.campo = …`)
          // NO liga nada: su base se está LEYENDO, no asignando — BUG
          // ENCONTRADO MIDIENDO (`jekyll/renderer.rb#render_layout`, donde
          // `payload["content"] = output` marcaba `payload`, que es un
          // método propio, como variable local y borraba su acceso propio).
          for (let i = 0; i < left.childCount; i++) {
            const child = left.child(i);
            if (child && isIdentifierLike(child)) assigned.add(textOf(child));
          }
        }
      }
    }
  });

  return { parameters: new Set(parameterNames(root)), parameterTypes: parameterTypes(root), shadowing, assigned };
}

/**
 * La CABEZA del nombre de un tipo escrito: sin el sigilo con el que la
 * gramática lo envuelve (`": Acc"` del `type_annotation` de TS, `"\"Acc\""`
 * del `type` de Python), sin sus argumentos genéricos ni su marca de arreglo
 * (`NetworkBuilder<? super N>` -> `NetworkBuilder`, `int[]` -> `int`) y sin su
 * calificación (`com.foo.Acc` -> `Acc`). Todo por FORMA del texto: ninguna de
 * las tres transformaciones nombra un lenguaje.
 */
function typeHead(text: string): string | null {
  const withoutArguments = text.split(/[<[({]/u)[0] ?? "";
  const lastSegment = withoutArguments.split(".").pop() ?? "";
  const head = bareName(lastSegment.trim()).match(/^[\p{L}_][\p{L}\p{N}_]*/u);
  return head ? head[0] : null;
}

/**
 * Parámetro -> cabeza de su tipo declarado. Recorre el MISMO contenedor de
 * parámetros que `parameterNames` y con la misma técnica para el nombre; el
 * tipo sale del campo genérico `type`. Python es el único de las cuatro
 * gramáticas con tipo que NO expone `name` en su `typed_parameter` (el
 * identificador queda posicional, confirmado por sonda), de ahí el respaldo
 * por primer hijo identificador.
 */
function parameterTypes(node: ProbeNode): ReadonlyMap<string, string> {
  const types = new Map<string, string>();
  const params = fieldOf(node, PARAMETER_CONTAINER_FIELDS);
  if (!params || isIdentifierLike(params)) return types;
  for (let i = 0; i < params.childCount; i++) {
    const child = params.child(i);
    if (!child || !child.isNamed || isIdentifierLike(child)) continue;
    const type = fieldOf(child, ["type"]);
    if (!type) continue;
    const byName = fieldOf(child, ["name", "pattern"]);
    let name: string | null = byName && isIdentifierLike(byName) ? textOf(byName) : null;
    if (name === null) {
      for (let j = 0; j < child.childCount; j++) {
        const inner = child.child(j);
        if (inner && isIdentifierLike(inner)) {
          name = textOf(inner);
          break;
        }
      }
    }
    const head = typeHead(textOf(type));
    if (name !== null && head !== null) types.set(name, head);
  }
  return types;
}

/**
 * Los parámetros que NO son otra unidad, aunque estructuralmente luzcan como
 * una. Dos formas, las dos medidas sobre los veredictos de la ola N
 * (`tests/golden/precision/*.verdicts.csv`, notas que empiezan con
 * `ola N, integrador:`):
 *
 *   1. **El parámetro es del MISMO tipo que la clase que contiene al método.**
 *      `StatsAccumulator.addAll(StatsAccumulator values)` — el "proveedor
 *      foráneo" ES la propia clase. Mudar el método a `values` lo deja donde
 *      ya estaba: fusionar dos instancias del mismo tipo no es envidia por
 *      definición, es el trabajo del tipo. Dos de los 20 falsos juzgados (la
 *      copia `guava` y la copia `android` del mismo método).
 *   2. **El parámetro lleva el nombre de un miembro que la clase declara.**
 *      `render(props, state)` de un componente, con `this.state = …` en el
 *      constructor: `state` es el estado PROPIO de la unidad, que un
 *      protocolo externo le vuelve a entregar por parámetro. Es el mismo
 *      problema conceptual que el receptor `self`/`cls` que ya trata
 *      `isSelfReference` — el dato propio llega por la lista de parámetros y
 *      no por un nodo dedicado. Un falso juzgado.
 *
 * En los dos casos los accesos cuentan como PROPIOS (suben LAA), no como
 * "ni propio ni foráneo": es dato de esta unidad, leído por otro nombre.
 */
function ownParametersOf(bindings: FunctionBindings, className: string, members: ReadonlySet<string>): ReadonlySet<string> {
  const own = new Set<string>();
  for (const name of bindings.parameters) {
    if (members.has(name)) own.add(name);
    else if (bindings.parameterTypes.get(name) === typeHead(className)) own.add(name);
  }
  return own;
}

/* ────────────────────────────────────────────────────────────────────────
 * JUICIO DE PRECISIÓN — método estático (o equivalente) sin estado propio
 * ──────────────────────────────────────────────────────────────────────── */

/** Ruby: un método de CLASE (`def self.build(x)`) es un tipo de nodo DISTINTO
 *  de un método de instancia (`singleton_method`, no `method`) — confirmado
 *  por sonda directa y ya documentado en `lazy-init-repetida.test.ts`.
 *  Vocabulario de gramática (mecanismo B), no una decisión por `language`. */
const RUBY_SINGLETON_METHOD_NODE_TYPE = /^singleton_method$/;

/** JS/TS/Vue: hijo anónimo directo `static`. Java: hijo `modifiers` cuyo
 *  TEXTO incluye la palabra `static`. C#: hijo `modifier` (uno por palabra)
 *  cuyo texto ES `static`. Misma técnica, mismos tres formatos, que
 *  `self-referential-member.ts#hasStaticModifier`. */
const MODIFIER_WRAPPER_NODE_TYPES = new Set(["modifiers", "modifier"]);

function hasStaticModifier(node: ProbeNode): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (child.type === "static") return true; // TypeScript: hijo anónimo directo, sin envoltorio.
    if (MODIFIER_WRAPPER_NODE_TYPES.has(child.type) && textOf(child).split(/\s+/).includes("static")) return true;
  }
  return false;
}

/** Python: `@staticmethod` decora el `function_definition` desde un nodo
 *  PADRE (`decorated_definition`), nunca un hijo suyo. Señal equivalente,
 *  confirmada por sonda, y más robusta (cubre cualquier razón por la que
 *  falte, no sólo el decorador): ¿la propia lista de parámetros incluye
 *  `self`/`cls` por NOMBRE? Si no, no hay auto-referencia posible con la que
 *  comparar. */
function pythonLacksSelfParameter(node: ProbeNode): boolean {
  const params = fieldOf(node, PARAMETER_CONTAINER_FIELDS);
  if (!params) return true; // sin parámetros en absoluto: no puede haber self/cls
  for (let i = 0; i < params.childCount; i++) {
    const child = params.child(i);
    if (child && isIdentifierLike(child) && PYTHON_SELF_NAMES.has(textOf(child))) return false;
  }
  return true;
}

/**
 * ¿Esta función es estructuralmente incapaz de tener acceso "propio" —
 * static/de clase, sin instancia disponible? Se consulta SÓLO cuando
 * `ownInstanceHops === 0`, así que un método estático que sí toca
 * `this.miembroEstático` conserva su propia señal.
 *
 * REGRESIÓN ENCONTRADA MIDIENDO (`guava/UnsignedLongs.java#parseUnsignedLong`,
 * `newtonsoft-json/MethodBinder.cs#ChooseMorePreciseType`): la ronda anterior
 * consultaba esto cuando `own === 0`, y con los puntos (B) y (E) de la ola N
 * `own` pasó a incluir cosas que un método estático SÍ tiene — una llamada a
 * un hermano estático, una función libre importada — así que el chequeo dejó
 * de activarse justo donde más hacía falta (las clases utilitarias). El
 * contador correcto es el de accesos por AUTO-REFERENCIA EXPLÍCITA, que es
 * exactamente lo que un método estático no puede tener.
 */
function isStaticLike(node: ProbeNode, language: string): boolean {
  if (RUBY_SINGLETON_METHOD_NODE_TYPE.test(node.type)) return true;
  if (hasStaticModifier(node)) return true;
  if (language === "python") return pythonLacksSelfParameter(node);
  return false;
}

/* ────────────────────────────────────────────────────────────────────────
 * El conteo
 * ──────────────────────────────────────────────────────────────────────── */

interface ProviderTally {
  /** Miembros leídos DIRECTAMENTE del proveedor (`p.x`) -> eventos. Es el
   *  ATFD de ese proveedor: lo único que se le puede mudar. */
  directMembers: Map<string, number>;
  /** Órdenes que se le dan (`p.hacer(x)`): no son lectura de dato. */
  commandHops: number;
  /**
   * Los NOMBRES DISTINTOS alcanzados a través de este proveedor, sean dato,
   * orden o eslabón de cadena. Es el denominador de LAA por el lado foráneo —
   * ver el punto (I) del docstring: Lanza & Marinescu cuentan ATRIBUTOS
   * DISTINTOS a los dos lados de la razón, no eventos.
   */
  distinctHops: Set<string>;
  /** Saltos leídos a través de él (`p.x.y`) — datos foráneos igual (bajan
   *  LAA), pero de la clase de `p.x`, NO de la de `p`. Ver `PROFUNDIDAD` en
   *  el docstring del módulo. */
  chainedHops: number;
}

interface AccessTally {
  /** Eventos de acceso a datos PROPIOS: cadenas con raíz propia más nombres
   *  desnudos que la clase declara como miembro. */
  own: number;
  /**
   * Los NOMBRES DISTINTOS de esos accesos propios — el numerador de LAA. Ver
   * el punto (I) del docstring: la razón de Lanza & Marinescu es entre
   * ATRIBUTOS DISTINTOS, no entre eventos, y contar eventos de un lado y
   * atributos del otro (lo que quedó de la ola N) hace que un método que
   * escribe el MISMO campo propio diez veces se lea como diez datos propios.
   */
  ownNames: Set<string>;
  /** El subconjunto de `own` que pasa por una AUTO-REFERENCIA EXPLÍCITA
   *  (`this`/`self`/`super`/`@ivar`), o sea por la INSTANCIA. Es lo único que
   *  un método estático no puede tener, así que es lo que decide el chequeo
   *  de "estático sin estado propio" — ver `isStaticLike` y el docstring. */
  ownInstanceHops: number;
  /** proveedor (nombre del parámetro) -> lo que se le lee. */
  foreign: Map<string, ProviderTally>;
  /** saltos cuya raíz no es un identificador (literal, `new`, resultado de
   *  una llamada libre): la degradación real de ATFD sin resolución de tipos. */
  ambiguousHops: number;
  /** saltos hacia una atadura LOCAL (variable local, de loop, o parámetro de
   *  un lambda anidado). */
  localBoundHops: number;
  /** saltos hacia un nombre LIBRE (import, módulo, global, tipo, enum). */
  freeNameHops: number;
}

function isSelfReference(node: ProbeNode, language: string): boolean {
  if (SELF_NODE_TYPE.test(node.type) || SELF_DATA_NODE_TYPE.test(node.type)) return true;
  if (language === "python" && isIdentifierLike(node)) return PYTHON_SELF_NAMES.has(textOf(node));
  return false;
}

/**
 * Clave de un miembro foráneo: el NOMBRE del miembro, por proveedor. Cuenta
 * MIEMBROS distintos, no proveedores ni eventos: invocar tres getters
 * distintos del mismo parámetro ya es ATFD = 3, la lectura correcta de la
 * métrica ("número de ATRIBUTOS foráneos accedidos").
 *
 * BUG ENCONTRADO MIDIENDO (`rubocop/check_single_line_suitability.rb
 * #to_single_line`): la primera versión de esta reescritura usaba
 * `"<texto de la base>.<miembro>"`, y en una cadena fluida
 * (`source.gsub(…).gsub(…).gsub(…)`) cada eslabón tiene un texto de base
 * distinto, así que el MISMO miembro `gsub` contaba cinco veces como cinco
 * atributos distintos — ATFD=5 sobre un único método encadenado. Con el
 * nombre pelado, esa cadena aporta ATFD=1, que es lo correcto: es un
 * atributo, invocado cinco veces. El precio, declarado: `p.a.x` y `p.b.x`
 * aportan 3 miembros distintos y no 4 (la `x` se cuenta una vez) — sesgo
 * hacia el falso negativo, el de siempre en este archivo.
 */
function memberKey(member: ProbeNode): string {
  return textOf(member);
}

function hasNamedChild(node: ProbeNode): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child?.isNamed) return true;
  }
  return false;
}

/**
 * Spans de todo acceso a miembro que está siendo INVOCADO CON ARGUMENTOS —
 * ver DATO vs ORDEN en el docstring del módulo. Dos formas, las dos
 * confirmadas por sonda directa:
 *   - la llamada ENVUELVE al acceso y el acceso es su destino
 *     (`call_expression{function: member_expression}` en JS/TS/Vue,
 *     `invocation_expression{function: member_access_expression}` en C#,
 *     `call{function: attribute}` en Python) — de ahí este índice por span;
 *   - la llamada ES el acceso (Ruby `call{receiver, method, arguments}`,
 *     Java `method_invocation{object, name, arguments}`) — ese caso lo
 *     resuelve `isCommandAccess` mirando el propio nodo.
 */
function collectInvokedWithArguments(root: ProbeNode): ReadonlySet<string> {
  const spans = new Set<string>();
  walkTree(root, (n) => {
    if (!n.isNamed) return;
    const args = fieldOf(n, ARGUMENT_LIST_FIELDS);
    if (!args || !hasNamedChild(args)) return;
    const target = fieldOf(n, CALL_TARGET_FIELDS);
    if (target) spans.add(spanKey(target));
  });
  return spans;
}

/** ¿Este acceso a miembro es una ORDEN (invocación con argumentos) en vez de
 *  una lectura de DATO? Ver DATO vs ORDEN en el docstring del módulo. */
function isCommandAccess(access: ProbeNode, invokedWithArguments: ReadonlySet<string>): boolean {
  const args = fieldOf(access, ARGUMENT_LIST_FIELDS);
  if (args && hasNamedChild(args)) return true;
  return invokedWithArguments.has(spanKey(access));
}

/**
 * Recorre el cuerpo de UNA función y clasifica cada acceso — ver el docstring
 * del módulo.
 *
 * NUNCA evalúa el nodo RAÍZ (la propia declaración de la función) como un
 * salto de acceso: el `singleton_method` de Ruby (`def self.x`) expone, en su
 * propio nodo de DECLARACIÓN, un campo `object` (el receptor `self`) Y un
 * campo `name` — la MISMA forma genérica que un acceso a miembro real. Sin
 * este chequeo, TODO `def self.x` leía `own=1` por su propia firma. Ninguna
 * otra gramática soportada expone esa combinación en el nodo de declaración
 * de una función (confirmado por sonda), así que es un no-op fuera de Ruby.
 */
function tallyAccess(
  node: ProbeNode,
  language: string,
  bindings: FunctionBindings,
  members: ReadonlySet<string>,
  declaredFields: ReadonlySet<string>,
  ownParameters: ReadonlySet<string>,
): AccessTally {
  const tally: AccessTally = {
    own: 0,
    ownNames: new Set<string>(),
    ownInstanceHops: 0,
    foreign: new Map(),
    ambiguousHops: 0,
    localBoundHops: 0,
    freeNameHops: 0,
  };
  /** Nodos ya consumidos como base o miembro de un acceso: no se vuelven a
   *  contar como referencia desnuda. El recorrido es pre-order, así que el
   *  nodo de acceso siempre se visita ANTES que su base y su miembro. */
  const consumed = new Set<string>();
  const invokedWithArguments = collectInvokedWithArguments(node);
  const ownName = fieldOf(node, ["name"]);
  if (ownName) consumed.add(spanKey(ownName));

  walkTree(node, (n) => {
    if (!n.isNamed) return;

    if (n !== node) {
      const access = accessOf(n);
      if (access) {
        consumed.add(spanKey(access.base));
        consumed.add(spanKey(access.member));
        const chain = chainOf(access.base);
        const root = chain.root;
        const reached = isIdentifierLike(access.member) ? memberKey(access.member) : null;

        /**
         * Registra el salto contra la unidad nombrada `unit`. `hops` = cuántos
         * eslabones nombrados hay entre la unidad y el miembro alcanzado:
         * 1 = miembro DIRECTO suyo, que es lo único que cuenta para ATFD
         * (ver PROFUNDIDAD en el docstring del módulo).
         */
        const toProvider = (unit: string, hops: number): void => {
          let provider = tally.foreign.get(unit);
          if (!provider) {
            provider = { directMembers: new Map(), distinctHops: new Set<string>(), chainedHops: 0, commandHops: 0 };
            tally.foreign.set(unit, provider);
          }
          if (reached !== null) provider.distinctHops.add(reached);
          if (hops !== 1 || chain.throughOpaque) provider.chainedHops++;
          else if (isCommandAccess(n, invokedWithArguments)) provider.commandHops++;
          else {
            const key = memberKey(access.member);
            provider.directMembers.set(key, (provider.directMembers.get(key) ?? 0) + 1);
          }
        };

        if (isSelfReference(root, language)) {
          // PUNTO (L) — la unidad ajena también puede ser un COLABORADOR que
          // la propia clase sostiene. `this.pedido.total` lee un dato de la
          // clase de `pedido`, no de ésta: el dato propio que se lee es
          // `pedido`, y `total` pertenece a la unidad `pedido`.
          const fieldRoot = SELF_DATA_NODE_TYPE.test(root.type) ? bareName(textOf(root)) : null;
          const unit = fieldRoot ?? (chain.links.length > 0 ? (chain.links[0] ?? null) : null);
          if (unit === null) {
            // `this.x` pelado: dato PROPIO, sin colaborador de por medio.
            tally.own++;
            if (reached !== null) tally.ownNames.add(reached);
            tally.ownInstanceHops++;
          } else {
            if (fieldRoot !== null) {
              // `@colaborador.x`: la lectura del propio campo NO tiene un nodo
              // de acceso aparte (el `@x` queda consumido como base de éste),
              // así que su acceso propio se cuenta acá. Con `this.` lo cuenta
              // el acceso interno (`this.x`), que se visita por separado.
              tally.own++;
              tally.ownInstanceHops++;
            }
            tally.ownNames.add(unit);
            toProvider(unit, fieldRoot !== null ? chain.links.length + 1 : chain.links.length);
          }
        } else if (!isIdentifierLike(root)) {
          tally.ambiguousHops++;
        } else {
          const name = textOf(root);
          if (bindings.shadowing.has(name)) tally.localBoundHops++;
          else if (ownParameters.has(name)) {
            // ver `ownParametersOf`
            tally.own++;
            if (reached !== null) tally.ownNames.add(reached);
          } else if (bindings.parameters.has(name)) {
            toProvider(name, chain.links.length + 1);
          } else if (bindings.assigned.has(name) && !declaredFields.has(name)) tally.localBoundHops++;
          else if (members.has(name)) {
            // El nombre PROPIO que se está leyendo es la raíz (`site` en
            // `site.pages`), no el miembro alcanzado a través de ella: ese
            // pertenece a la clase de `site`, que es exactamente la unidad
            // ajena del punto (L). Mismo tratamiento que `this.site.pages`,
            // que es la misma lectura escrita con receptor explícito.
            tally.own++;
            tally.ownNames.add(name);
            toProvider(name, chain.links.length + 1);
          } else tally.freeNameHops++;
        }
        return;
      }
    }

    // LLAMADA SIN RECEPTOR — el punto (E) del docstring: `foo(x)` se despacha
    // sobre la unidad que la encierra, nunca sobre otro objeto. Se cuenta
    // como acceso propio aunque el nombre no se resuelva en este archivo (es
    // lo que pasa con todo método heredado o aportado por un mixin externo).
    if (fieldOf(n, ARGUMENT_LIST_FIELDS)) {
      const target = fieldOf(n, CALL_TARGET_FIELDS);
      if (target && isIdentifierLike(target)) {
        const called = textOf(target);
        if (!bindings.shadowing.has(called) && !bindings.parameters.has(called) && !bindings.assigned.has(called)) {
          consumed.add(spanKey(target));
          tally.own++;
          tally.ownNames.add(called);
        }
      }
    }

    // Referencia DESNUDA a un dato propio — el punto (B) del docstring: sin
    // esto, el denominador de LAA queda en cero en todo lenguaje que no
    // exija receptor explícito (Java, C#, Ruby).
    if (consumed.has(spanKey(n))) return;
    if (SELF_DATA_NODE_TYPE.test(n.type)) {
      tally.own++;
      tally.ownNames.add(bareName(textOf(n)));
      tally.ownInstanceHops++;
      return;
    }
    if (!isIdentifierLike(n)) return;
    const name = textOf(n);
    if (bindings.shadowing.has(name) || bindings.parameters.has(name)) return;
    if (bindings.assigned.has(name) && !declaredFields.has(name)) return;
    // NO se cuenta acá el nombre SIN CALIFICAR que este archivo no declara.
    // Se probó en la ola O y se DESCARTÓ MIDIENDO — ver el punto (J) del
    // docstring del módulo: la hipótesis (un nombre desnudo que nada liga es
    // un envío implícito a `self`, igual que `foo(x)` por el punto E) es
    // cierta en Ruby y en Java, y FALSA en JS/TS/C#/Python, donde ese mismo
    // nombre suele ser un import, un global del lenguaje o un tipo. El
    // desglose por lenguaje lo mostró sin lugar a dudas.
    if (members.has(name)) {
      tally.own++;
      tally.ownNames.add(name);
    }
  });

  return tally;
}

/* ────────────────────────────────────────────────────────────────────────
 * ¿EXISTE EL DESTINO DEL `Move Method` EN ESTE REPO? — el punto (M)
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Para cada unidad NOMBRADA del repo (el camino calificado de una clase, un
 * módulo o un namespace), los nombres que declara adentro. Se deriva de los
 * nodos `symbol` del grafo: su `symbolPath` ya trae el contenedor, así que el
 * último segmento es el miembro y el prefijo es la unidad que lo declara.
 *
 * SE AGRUPA POR CAMINO CALIFICADO, NO POR (archivo, camino), a propósito: una
 * clase reabierta en varios archivos (Ruby/Python) o partial (C#) declara sus
 * miembros repartidos, y para la pregunta "¿existe acá adentro la unidad a la
 * que este método se mudaría?" juntar de más sólo puede CONSERVAR hallazgos,
 * nunca inventarlos. Sesgo hacia el falso positivo en la agrupación, que es el
 * sesgo correcto para un chequeo que QUITA hallazgos.
 *
 * Se memoiza por grafo (`WeakMap`): el runner construye UN grafo por corrida y
 * se lo pasa a todos los archivos, así que este recorrido O(N) se paga una vez
 * por repo y no una vez por archivo.
 */
const DECLARED_MEMBERS_BY_UNIT = new WeakMap<CodeGraph, ReadonlyMap<string, ReadonlySet<string>>>();

function declaredMembersByUnit(graph: CodeGraph): ReadonlyMap<string, ReadonlySet<string>> {
  const cached = DECLARED_MEMBERS_BY_UNIT.get(graph);
  if (cached) return cached;
  const index = new Map<string, Set<string>>();
  for (const node of graph.nodes) {
    if (node.kind !== "symbol") continue;
    if (node.symbolPath.length < 2) continue;
    const unit = node.symbolPath.slice(0, -1).join(".");
    const member = node.symbolPath[node.symbolPath.length - 1];
    if (member === undefined) continue;
    let members = index.get(unit);
    if (!members) index.set(unit, (members = new Set<string>()));
    members.add(member);
  }
  DECLARED_MEMBERS_BY_UNIT.set(graph, index);
  return index;
}

/**
 * Cuántos de `read` declara, JUNTOS, la unidad del repo que más comparte con
 * ellos. Es la evidencia de que el tipo del proveedor lo define ESTE repo, y
 * por lo tanto de que el `Move Method` tiene a dónde ir — ver el punto (M).
 */
function bestDestinationMatch(read: Iterable<string>, index: ReadonlyMap<string, ReadonlySet<string>>): number {
  const names = [...read];
  if (names.length === 0) return 0;
  let best = 0;
  for (const members of index.values()) {
    let hits = 0;
    for (const name of names) if (members.has(name)) hits++;
    if (hits > best) best = hits;
    if (best === names.length) break;
  }
  return best;
}

/* ────────────────────────────────────────────────────────────────────────
 * ¿QUIÉN ES EL PROVEEDOR? — el punto (O), Ola R (frente R5)
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * *** (O) EL DESTINO DEL `Move Method` TIENE QUE TENER NOMBRE DE UNIDAD, NO
 * DE VARIABLE. *** Es el cambio que la Ola R le pide a este kind, y el que la
 * relación `declares-type` (`graph/edges/declara-tipo.ts` + `propaga-tipo.ts`)
 * recién ahora hace posible.
 *
 * EL PROBLEMA, que este archivo venía documentando sin poder resolver: el
 * "proveedor" de este detector es un NOMBRE (`node`, `source`, `input`,
 * `cfg`), no una unidad. El consejo que emite es `Move Method`, y su destino
 * es la CLASE del proveedor — que hasta esta ola nadie sabía cuál era. La
 * familia dominante de falsos que el docstring nombra arriba es exactamente
 * ésa: *"un método que transforma su parámetro, donde el parámetro es de un
 * tipo que este proyecto no define (un nodo AST de una gema, un `JsonReader`,
 * una conexión de driver)"*. Mudar un método a una clase que este repo no
 * define no es un consejo: es imposible.
 *
 * LO QUE SE HACE: se le pregunta a `declares-type` de qué tipo es el sitio de
 * declaración del proveedor dominante, y **sólo se emite cuando la respuesta
 * es una CLASE DE ESTE REPO** (`outcome: "class"`). Los otros cinco outcomes
 * NO son huecos y cada uno dice algo distinto:
 *
 * | outcome | qué significa acá | por qué no se emite |
 * |---|---|---|
 * | `class` | el proveedor es de una unidad de ESTE repo | **se emite, y el hallazgo la NOMBRA** |
 * | `unresolved` | el tipo está escrito y no es del repo | *miré y el destino no existe acá*: `Move Method` a una gema/al runtime no es accionable — la familia dominante de falsos |
 * | `primitive` | el proveedor es un `int`/`string`/`bool` | no hay clase a la que mudar un método |
 * | `composite` | `Foo[]`, `map[K]V`, `A & B` | idem: el destino no es una unidad nombrable |
 * | `ambiguous` | "una de estas N clases" | CONTRATO-F9.md §4.5: fuera de toda consulta por defecto; un destino ambiguo no es un destino |
 * | `no-fact` | nadie escribió el tipo y la propagación no llegó al origen | **no se pudo determinar el destino**, y un `Move Method` sin destino afirma "este método pertenece a X" sin poder decir qué es X |
 *
 * *** DÓNDE ESTÁ EXACTAMENTE LA LÍNEA ENTRE "MIRÉ Y NO HAY" Y "NO PUDE
 * MIRAR" — la regla 2 de la ola, y NO es donde parece. *** La tentación es
 * leer `no-fact` como "no pude mirar" y emitir igual. Es al revés: `no-fact`
 * lo devuelve la relación DESPUÉS de haber mirado ese archivo — la vía 1 leyó
 * el campo `type` de cada declaración y la vía 2 (`propaga-tipo.ts`) siguió
 * el origen de cada asignación — así que con grafo presente significa *"miré
 * la declaración de este proveedor y no hay nada que diga de qué es"*. Eso es
 * un destino INDETERMINADO, y un `Move Method` sin destino afirma "este
 * método pertenece a X" sin poder decir qué es X. Es el mismo argumento del
 * punto (N) de este archivo ("NO MEDIR NO ES MEDIR CERO"): ahí, sin un solo
 * atributo propio, el numerador de LAA no vale 0 y el hallazgo no se emite.
 *
 * EL "NO PUDE MIRAR" DE VERDAD ES **`ctx.graph === null`**, y ahí el detector
 * emite EXACTAMENTE LO MISMO QUE ANTES DE ESTA OLA, sin unidad destino y
 * diciéndolo en el `detail`. Pasa en los tres casos que
 * `detect/types.ts#IntraGraphOptIn` enumera: la pasada 1, el interruptor de
 * vuelta atrás `CK_ANALISIS_DOS_PASADAS=0`, y un build de grafo que falló.
 * **Esto no es una cortesía: es el contrato.** `IntraGraphOptIn` dice, con
 * todas las letras, que `needsGraph` en un detector `intra-*` es ruteo y no
 * compuerta, y que apagar un detector con un interruptor de entorno está
 * prohibido. Un detector que sin grafo emitiera cero estaría apagado por una
 * variable de ambiente.
 *
 * La diferencia con ESCONDER (que está prohibido) es que esto **se declara y
 * se cuenta**: el desglose por lenguaje está medido abajo y en
 * `ola-r/informes/R5.md`, y el hallazgo que SÍ sale trae la unidad destino
 * escrita en su título, su `detail` y su evidencia.
 *
 * *** LO QUE ESTO CUESTA, MEDIDO SOBRE LA POBLACIÓN VIVA (315 tarjetas, 7
 * repos, `scratchpad/r5/probe-fei.mts` contra el grafo de producción): ***
 *
 * | repo (lenguaje) | vivos | `class` | `unresolved` | `primitive` | `ambiguous` | `no-fact` |
 * |---|---:|---:|---:|---:|---:|---:|
 * | guava (java) | 38 | 26 | 6 | 2 | 2 | 2 |
 * | newtonsoft-json (csharp) | 23 | 11 | 3 | 0 | 9 | 0 |
 * | nest (typescript) | 13 | 9 | 2 | 2 | 0 | 0 |
 * | sqlalchemy (python) | 20 | 1 | 2 | 0 | 0 | 17 |
 * | rubocop (ruby) | 217 | 1 | 0 | 0 | 0 | 216 |
 * | jekyll (ruby) | 3 | 0 | 0 | 0 | 0 | 3 |
 * | eslint (javascript) | 1 | 0 | 0 | 0 | 0 | 1 |
 * | **total** | **315** | **48** | **13** | **4** | **11** | **239** |
 *
 * **La asimetría no es un defecto de este detector: es la propiedad de los
 * lenguajes que la ola entera declara.** Donde el tipo está escrito la
 * pregunta se contesta casi siempre (java 36/38, csharp 23/23, typescript
 * 13/13 con respuesta); donde no está escrito, la propagación desde el origen
 * alcanza a casi nada del lado del PROVEEDOR (ruby 1/220, python 3/20). Ruby
 * y JavaScript quedan en ~0 población en el corpus congelado, y eso hay que
 * decirlo en el producto, no esconderlo detrás de un promedio.
 */
function providerUnit(
  fn: FunctionUnit,
  className: string,
  providerName: string,
  graph: CodeGraph | null,
  index: GraphIndex | null,
): string | null {
  // Un parámetro o una variable local cuelga de la FUNCIÓN; un campo propio,
  // de la clase. `FunctionUnit.symbolPath` es `[className, name]`.
  const asLocal = declaredTypeAtSite(graph, index, fn.file, fn.symbolPath, providerName);
  const answer = asLocal.outcome !== "no-fact" ? asLocal : declaredTypeAtSite(graph, index, fn.file, [className], providerName);
  if (answer.outcome !== "class") return null;
  return answer.nodeId;
}

/** El último segmento del `symbolPath` del nodo destino — el NOMBRE de la unidad a la que mudar el método. */
function unitNameOf(index: GraphIndex | null, nodeId: string): string | null {
  const node = index?.nodeById(nodeId);
  if (!node) return null;
  return node.symbolPath[node.symbolPath.length - 1] ?? null;
}

/**
 * Cuántos de `read` declara la unidad destino VERIFICADA. Es la versión
 * exacta del número aproximado del punto (M): aquél buscaba, entre TODAS las
 * unidades del repo, la que más nombres compartiera — y el propio punto (M)
 * mide que en un repo de 13.554 símbolos compartir dos nombres es
 * coincidencia garantizada, no identificación. Con el tipo del proveedor
 * resuelto ya no hay que buscar: se le pregunta a la unidad correcta.
 */
function membersDeclaredByDestination(index: GraphIndex | null, destinationId: string, read: Iterable<string>): number {
  if (!index) return 0;
  const declared = new Set<string>();
  for (const e of index.edgesFrom(destinationId)) {
    if (e.kind !== "contains") continue;
    const child = index.nodeById(e.to);
    if (!child || child.kind !== "symbol") continue;
    const name = child.symbolPath[child.symbolPath.length - 1];
    if (name !== undefined) declared.add(name);
  }
  let hits = 0;
  for (const name of read) if (declared.has(name)) hits++;
  return hits;
}

/* ────────────────────────────────────────────────────────────────────────
 * OLA AU (FRENTE AU4) — LOS TRES HECHOS QUE FALTABAN, Y POR QUÉ ÉSTOS
 * ────────────────────────────────────────────────────────────────────────
 *
 * EL NÚMERO QUE LOS MOTIVA: este kind mide **3 verdaderos de 82 juzgados en
 * toda la historia del proyecto (3,7 %)**, contra un piso de proyecto de 50 %
 * (`gate-logic.ts#PRECISION_FLOOR`). Leídas las 79 notas de la planilla
 * (`tests/golden/precision/*.verdicts.csv`) una por una, los falsos NO se
 * reparten al azar: **tres formas cubren la mayoría, y las tres son un HECHO
 * DEL CÓDIGO que se verifica abriendo el archivo, no una opinión de diseño.**
 *
 * NINGUNO ES UN UMBRAL. Los umbrales (ATFD, LAA, dominancia) ya están citados
 * y ya se cumplen en estos falsos: el problema nunca fue el corte, sino que
 * la pregunta "¿este método pertenece a la unidad del proveedor?" tiene tres
 * respuestas NEGATIVAS estructurales que el detector no estaba haciendo.
 *
 * ── (Q) EL NOMBRE DEL MÉTODO ES UN PROTOCOLO DEL REPO ───────────────────
 *
 * LA FORMA, tal como la escriben los veredictos: `on_send(node)` en rubocop
 * ("es el CALLBACK que la API de cop invoca con el nodo del AST; leer cinco
 * miembros del nodo que te acaban de pasar es literalmente el contrato del
 * framework"), `visit_VECTOR(self, type_)` en sqlalchemy ("VISITANTE / doble
 * despacho: el render por dialecto NO puede vivir en el tipo"),
 * `render(props, state)` en preact, `putBytes(ByteBuffer)` y
 * `update(ByteBuffer)` en guava ("@Override … la firma la impone el contrato
 * y el tipo del parámetro es de la plataforma"), `computeMultimapGetTestSuite
 * (parentBuilder)` en guava-testlib ("el método es polimórfico por subclase:
 * no se puede mudar a parentBuilder sin romper el despacho"),
 * `createAsyncProviders(options)` en nest ("repetido, con el mismo cuerpo, en
 * decenas de módulos del framework"), `create_connect_args(url)` en
 * sqlalchemy ("override de Template Method"). **Un veredicto de la Ola N lo
 * cuantifica: la familia VISITANTE sola es el 76 % del volumen vivo del
 * kind.**
 *
 * EL HECHO, y es uno solo para las siete: **el nombre de este método lo
 * declaran VARIAS unidades distintas de ESTE repo.** Cuando `on_send` lo
 * declaran 300 cops, `visit_*` cada dialecto y `render` cada componente, el
 * nombre no es de este método: es un PUNTO DE DESPACHO. Mudar UNA
 * implementación a la clase del proveedor no acerca la lógica a sus datos —
 * rompe el despacho que las otras N−1 comparten, y deja al framework llamando
 * a un método que ya no está donde lo busca. **La lógica no está mal ubicada:
 * está ubicada donde el polimorfismo la pone.**
 *
 * POR QUÉ ES VERIFICABLE ABRIENDO EL ARCHIVO (la prueba que la ola exige):
 * se abre el archivo, se busca el nombre del método en el repo y se cuenta en
 * cuántas clases aparece declarado. Es un conteo, no una intención.
 *
 * POR QUÉ NO SE USA `@Override`/`override`/`@staticmethod`: existe en Java y
 * C# y NO existe en Ruby, Python, JavaScript ni Go — que son cuatro de los
 * seis lenguajes. La forma se llama polimorfismo en los seis; el ANOTADOR
 * sólo en dos. Contar cuántas unidades declaran el nombre es el mismo hecho
 * leído de una fuente que los seis tienen (el propio grafo de símbolos que el
 * detector ya carga), y de paso cubre el despacho por convención —
 * `on_send`, `visit_X`, `demo.vue`— que ninguna anotación marca.
 *
 * ── (R) EL PROVEEDOR ES DEL MISMO TIPO QUE LA CLASE ─────────────────────
 *
 * LA FORMA: `StatsAccumulator.addAll(StatsAccumulator values)` ("fusionar dos
 * instancias del mismo tipo no es envidia por definición"),
 * `FloatArrayAsList.equals(that)` ("idioma canónico de equals, nunca es
 * envidia"), `JsonSchemaNode(JsonSchemaNode source)` ("constructor de COPIA").
 *
 * EL HECHO: la unidad destino que el punto (O) ya resolvió por `declares-type`
 * ES la clase que contiene al método. El consejo que el hallazgo emite
 * ("mudá este método a la unidad del proveedor") se lee entonces como "mudá
 * este método a donde ya está" — no es un consejo, es una tautología.
 * Verificable abriendo el archivo: el tipo del parámetro y el nombre de la
 * clase son la misma palabra.
 *
 * ── (S) LA UNIDAD DESTINO NO TIENE COMPORTAMIENTO ───────────────────────
 *
 * LA FORMA: `RoutesMapper.getRouteInfoFromObject` en nest ("es exactamente el
 * trabajo de una clase llamada Mapper: leer un DTO ajeno y reformarlo. Mover
 * esta lógica al propio RouteInfo (una INTERFAZ de datos) no tiene sentido"),
 * `provider-classifier.ts` ("no se puede 'mover' a una interfaz: las
 * interfaces de TS no tienen funciones"), `CalculatePropertyDetails` en
 * newtonsoft ("`property` es un JsonProperty, un DESCRIPTOR DE DATOS SIN
 * COMPORTAMIENTO"), `GraphInspector.insertClassNode`, `insertEntrypointDefinition`.
 *
 * EL HECHO: la unidad destino verificada NO DECLARA UN SOLO MIEMBRO
 * `function-like` — es una interfaz de TS, un `struct` de datos, un DTO, un
 * `TypedDict`, un descriptor. **Un método no se puede mudar a una unidad que
 * no admite métodos.** No es una opinión sobre si conviene: es que el destino
 * del consejo no existe. Verificable abriendo el archivo del destino.
 *
 * SESGO DECLARADO de (S): una gramática que no cuelgue los miembros de una
 * unidad con aristas `contains` haría que TODA unidad de ese lenguaje
 * contestara "cero métodos" y el hecho apagaría el lenguaje entero. Por eso
 * el desglose por lenguaje del delta se mide y se publica ANTES de aterrizar
 * (informe AU4), y por eso los tres hechos viajan primero como EVIDENCIA
 * numerada en el propio hallazgo: se miden sobre la población viva y recién
 * después se decide cuál compuerta.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * (Q) — nombre de miembro `function-like` ⇒ cuántas UNIDADES DISTINTAS del
 * repo lo declaran. Se deriva de los mismos nodos `symbol` que el punto (M)
 * ya recorre, filtrando por `family === "function-like"`: cero aristas
 * nuevas, cero vocabulario de gramática, un solo recorrido O(N) memoizado por
 * grafo (`WeakMap`, igual que `DECLARED_MEMBERS_BY_UNIT`).
 *
 * AGRUPA POR CAMINO CALIFICADO, no por (archivo, camino) — misma decisión y
 * mismo motivo que `declaredMembersByUnit`: guava mantiene un árbol de
 * fuentes DUPLICADO (`android/guava/…` y `guava/…`) y contar la copia Android
 * como una segunda unidad haría que TODO método de guava se leyera como
 * "declarado por 2 unidades". Con el camino calificado, las dos copias de
 * `com.google.common.math.StatsAccumulator` son una sola unidad, que es lo
 * correcto.
 */
const FUNCTION_NAME_UNITS = new WeakMap<CodeGraph, ReadonlyMap<string, number>>();

function functionNameUnitCount(graph: CodeGraph): ReadonlyMap<string, number> {
  const cached = FUNCTION_NAME_UNITS.get(graph);
  if (cached) return cached;
  const byName = new Map<string, Set<string>>();
  for (const node of graph.nodes) {
    if (node.kind !== "symbol" || node.family !== "function-like") continue;
    if (node.symbolPath.length < 2) continue;
    const unit = node.symbolPath.slice(0, -1).join(".");
    const member = node.symbolPath[node.symbolPath.length - 1];
    if (member === undefined) continue;
    let units = byName.get(member);
    if (!units) byName.set(member, (units = new Set<string>()));
    units.add(unit);
  }
  const counted = new Map<string, number>();
  for (const [name, units] of byName) counted.set(name, units.size);
  FUNCTION_NAME_UNITS.set(graph, counted);
  return counted;
}

/** (S) — cuántos miembros `function-like` declara la unidad destino. Cero ⇒
 *  no admite métodos y el `Move Method` no tiene a dónde ir. */
function behaviourMembersOf(index: GraphIndex | null, destinationId: string): number {
  if (!index) return -1; // no se pudo mirar (distinto de "miré y hay cero")
  return memberSignatures(index, destinationId).length;
}

/**
 * (S-bis) — LA FORMA DECLARADA DEL DESTINO, cuando el conteo de miembros no
 * alcanza. MEDIDO EN LA POBLACIÓN VIVA: de los 7 destinos sin comportamiento
 * de los 10 repos medidos, SEIS son interfaces de TypeScript sin un solo
 * método (`RouteInfo`, `ConsoleLoggerOptions`, `ClientsProviderAsyncOptions`,
 * `MulterModuleAsyncOptions`, `EventOrMessageListenerDefinition`) y el conteo
 * de (S) los agarra; el séptimo es `IJsonLineInfo` de C#, una interfaz que SÍ
 * declara `HasLineInfo()`, así que su conteo da 1 y (S) no la ve — y sin
 * embargo el argumento es EL MISMO y más fuerte: **una interfaz no tiene
 * cuerpos de método, así que un `Move Method` hacia ella es imposible por
 * construcción, tenga o no firmas declaradas.**
 *
 * SE LEE DE `shapeNodeType ?? nodeType`, que es el string de la GRAMÁTICA tal
 * cual (ver su docstring en `graph/types.ts`), y se busca la PALABRA
 * `interface` en él — misma técnica que `LOOP_NODE_WORD` o
 * `ASSIGNMENT_NODE_WORD` de este mismo archivo: una palabra de forma, no un
 * nombre de lenguaje ni una lista de gramáticas.
 *
 * Y SE LEE COMO LA GRAMÁTICA MANDA: `false` es "no dijo interfaz", NUNCA "es
 * una clase". Go declara struct e interfaz con el MISMO `type_spec` y por eso
 * `shapeNodeType` existe; donde ni uno ni otro lo diga, el hecho no contesta
 * y este número vale `false` sin afirmar nada.
 */
const INTERFACE_NODE_WORD = /(^|_)interfaces?(_|$)/;

function destinationIsInterface(index: GraphIndex | null, destinationId: string): boolean {
  const node = index?.nodeById(destinationId);
  if (!node) return false;
  const shape = node.shapeNodeType ?? node.nodeType;
  return shape !== undefined && INTERFACE_NODE_WORD.test(shape);
}

/**
 * LA TRAZA DE LA OLA AU — los tres hechos, por hallazgo emitido, para poder
 * medir CADA compuerta por separado sobre la población viva con UNA sola
 * corrida en vez de cuatro. Apagada por defecto (`null`): sólo el script de
 * medición la enciende, exactamente igual que
 * `hypotheses/collapse-hierarchy.ts#startCollapseHierarchyTrace`.
 */
export interface FeatureEnvyIntraFacts {
  file: string;
  symbol: string;
  className: string;
  provider: string;
  destination: string | null;
  /** (Q) unidades del repo que declaran un `function-like` con el nombre de este método. */
  protocolUnits: number;
  /** (R) la unidad destino ES la clase que contiene al método. */
  sameUnit: boolean;
  /** (S) miembros `function-like` de la unidad destino; -1 = no se pudo mirar. */
  destinationBehaviour: number;
  /** (S-bis) la gramática declaró la unidad destino como una INTERFAZ. `false` = no lo dijo, nunca "es una clase". */
  destinationInterface: boolean;
  language: string;
}

let auTrace: FeatureEnvyIntraFacts[] | null = null;

export function startFeatureEnvyIntraTrace(): void {
  auTrace = [];
}

export function takeFeatureEnvyIntraTrace(): readonly FeatureEnvyIntraFacts[] {
  const out = auTrace ?? [];
  auTrace = null;
  return out;
}

interface DominantProvider {
  name: string;
  /** Miembros DISTINTOS leídos directamente de este proveedor: el ATFD que
   *  se compara contra el umbral. */
  members: number;
}

function dominantProviderOf(foreign: ReadonlyMap<string, ProviderTally>): DominantProvider | null {
  let best: DominantProvider | null = null;
  for (const [name, provider] of foreign) {
    const members = provider.directMembers.size;
    if (best && members <= best.members) continue;
    best = { name, members };
  }
  return best;
}

/** ¿Esta función está contenida en OTRA función del mismo archivo? Ver el
 *  punto (D) del docstring: un lambda/callback anidado no es un método que se
 *  pueda mudar de clase, así que no se evalúa como unidad propia (sus accesos
 *  siguen contando dentro del método que lo contiene). */
function isNestedInAnotherFunction(functions: readonly FunctionUnit[], index: number): boolean {
  const own = spanOf(functions[index]!.node);
  for (let i = 0; i < functions.length; i++) {
    if (i === index) continue;
    const other = spanOf(functions[i]!.node);
    if (sameSpan(other, own)) continue;
    if (contains(other, own)) return true;
  }
  return false;
}

export const detector: IntraFileDetector<ThresholdKey, "feature-envy-intra"> = {
  id: "feature-envy-intra",
  kind: "feature-envy-intra",
  scope: "intra-file",
  title: "Envidia de las características",
  needs: ["unidad-tipo-clase"],
  thresholds: {
    atfd: citado(2, {
      work: "Lanza & Marinescu, Object-Oriented Metrics in Practice",
      rule: "Feature Envy — ATFD (Access To Foreign Data), FEW",
    }),
    laa: citado(1 / 3, {
      work: "Lanza & Marinescu, Object-Oriented Metrics in Practice",
      rule: "Feature Envy — LAA (Locality of Attribute Access), ONE_THIRD",
    }),
    dominance: DOMINANCE_SPEC,
  },
  // Punto (M) y, desde la Ola R, punto (O): las dos preguntas ("¿el destino
  // del `Move Method` existe en este repo?" y "¿de qué TIPO es el proveedor?")
  // son repo-completas y el árbol vivo del archivo hace falta igual.
  //
  // SIGUE SIN SER UNA COMPUERTA (ver `IntraGraphOptIn` en `detect/types.ts`):
  // sin grafo el detector corre igual y emite EXACTAMENTE lo que emitía antes
  // de la Ola R — sin nombrar unidad destino y diciéndolo en el `detail`. Lo
  // que cambió con el punto (O) es qué pasa CON grafo: ahí la relación
  // `declares-type` SÍ miró la declaración del proveedor, y un destino
  // indeterminado deja de emitirse. Ver el docstring de `providerUnit` para
  // por qué esa es la línea correcta entre "miré y no hay" y "no pude mirar",
  // y para el desglose medido por lenguaje.
  needsGraph: true,
  run(file: FileUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const atfdThreshold = ctx.threshold("atfd");
    const laaThreshold = ctx.threshold("laa");
    const dominanceThreshold = ctx.threshold("dominance");
    const graph = ctx.graph ?? null;
    const graphIndex = ctx.graphIndex?.() ?? null;
    const declaredMembers = graph ? declaredMembersByUnit(graph) : null;
    const findings: RawFinding[] = [];
    const scopes = classScopesOf(file);

    // PRIMERA PASADA — una `tallyAccess` por método de clase NO ANIDADO
    // (cacheada, se usa una sola vez más abajo). A propósito NO excluye acá
    // los métodos sin nombre (punto K): para saber si un campo es "estado
    // compartido de la clase" (punto P del docstring del módulo, Ola Z
    // frente Z2) hace falta ver quién lo TOCA, no sólo quién es candidato a
    // recibir un `Move Method`. LOS CONSTRUCTORES SÍ SE EXCLUYEN ACÁ, no sólo
    // como candidatos (punto F): un constructor que INICIALIZA el campo
    // (`this.x = x`, el patrón de inyección más común) registra ese campo en
    // su propio `ownNames` igual que cualquier lectura — contarlo como
    // "hermano que toca el campo" apagaría el caso CANÓNICO de Fowler
    // (`phone` se asigna una vez en el constructor y se lee en
    // `getPhoneNumber()`) en la inmensa mayoría del código real, donde casi
    // todo campo se inicializa en algún constructor. MEDIDO a mano contra
    // este caso antes de fijar la regla: incluir constructores aquí
    // suprimía el propio ejemplo que el punto (L) existe para poder emitir.
    interface ClassMethodEntry {
      fn: FunctionUnit;
      className: string;
      scope: ClassScope | null;
      bindings: FunctionBindings;
      tally: AccessTally;
    }
    const methods: ClassMethodEntry[] = [];
    for (const [index, fn] of file.functions.entries()) {
      const className = fn.metrics.className;
      if (className === null) continue; // sin unidad contenedora: no participa (mismo criterio que large-class)
      if (isNestedInAnotherFunction(file.functions, index)) continue; // punto (D) del docstring
      if (fn.metrics.isConstructor) continue; // punto (F) del docstring, y ver la nota de arriba
      const bindings = collectBindings(fn.node);
      const scope = scopeEnclosing(scopes, spanOf(fn.node));
      const members = scope?.members ?? EMPTY_NAMES;
      const declaredFields = scope?.declaredFields ?? EMPTY_NAMES;
      const tally = tallyAccess(fn.node, fn.language, bindings, members, declaredFields, ownParametersOf(bindings, className, members));
      methods.push({ fn, className, scope, bindings, tally });
    }

    // EL HECHO NUEVO (Ola Q §2.2, frente Z2) — por cada campo, QUÉ MÉTODOS de
    // la MISMA clase lo COMPARTEN de verdad, disparen o no su propio hallazgo.
    // Se agrupa por el objeto `ClassScope` (identidad, no nombre: dos clases
    // de este archivo con el mismo nombre —anidadas o reabiertas— no
    // comparten hermanos). Ver el punto (P) del docstring del módulo.
    //
    // "COMPARTIR" NO ES "APARECER EN `ownNames`" — MEDIDO Y CORREGIDO ANTES
    // DE PUBLICAR, no supuesto. La primera versión usaba `ownNames` (CUALQUIER
    // mención del nombre, incluida una única llamada de paso sin argumentos
    // de lectura, `@runtime.format(...)`) y ESO SUPRIMÍA EL ÚNICO HALLAZGO
    // VERDADERO VIVO DEL CORPUS: `rubocop/lib/rubocop/lsp/server.rb#configure`
    // (`tests/golden/precision/rubocop.verdicts.csv`, verdadero,
    // `stillPresent: true`). `Server` es una fachada de `Runtime`: `format`,
    // `offenses` y `reset_project_index` cada uno reenvía UNA sola llamada a
    // `@runtime` (un miembro distinto cada uno) — delegación limpia, no
    // estado compartido — mientras que `configure` escribe 3 atributos DE
    // `@runtime` directamente en vez de delegar, y ESO es la envidia real que
    // el humano juzgó. La versión por `ownNames` no distinguía "un hermano
    // reenvía una llamada" de "un hermano también manipula VARIOS datos de
    // este campo", así que contaba a los tres delegadores limpios como
    // evidencia de "estado compartido" y apagaba al único culpable real.
    //
    // LA REGLA CORREGIDA reusa el propio umbral ATFD del detector
    // (`atfdThreshold`, Lanza & Marinescu FEW=2): un hermano sólo cuenta como
    // "comparte este campo" si SU PROPIA relación con el proveedor —medida
    // con la MISMA tally por proveedor que ya calcula `tallyAccess`,
    // `distinctHops` (dato + orden + eslabón, igual que el denominador de LAA
    // en el punto I)— alcanza el mismo umbral que el propio detector exige
    // para hablar de envidia. Menos que eso es un dato o un envío aislado, la
    // forma normal de una llamada a un colaborador; nunca "estado
    // compartido". Es la MISMA pregunta que el detector ya le hace al método
    // candidato, aplicada también a sus hermanos — coherente con el resto del
    // archivo, no un umbral nuevo inventado para esta ola.
    const siblingsSharingField = new Map<ClassScope, Map<string, Set<number>>>();
    for (let i = 0; i < methods.length; i++) {
      const entry = methods[i]!;
      if (!entry.scope) continue;
      let byField = siblingsSharingField.get(entry.scope);
      if (!byField) siblingsSharingField.set(entry.scope, (byField = new Map()));
      for (const [name, provider] of entry.tally.foreign) {
        if (provider.distinctHops.size <= atfdThreshold.value) continue; // un solo dato o una sola orden: no es "compartir"
        let indices = byField.get(name);
        if (!indices) byField.set(name, (indices = new Set()));
        indices.add(i);
      }
    }

    for (let i = 0; i < methods.length; i++) {
      const { fn, className, scope, bindings, tally } = methods[i]!;
      // (punto F ya se aplicó en la primera pasada, arriba: los constructores
      // ni siquiera entran a `methods`, ver la nota de por qué.)
      // Punto (K): sin nombre no hay método que mudar. El hallazgo salía con
      // el título `"función anónima" usa más datos de "res" que de
      // "StreamableFile"` — no nombra nada que el usuario pueda mover, y sus
      // parámetros los ata quien la invoca, no un contrato de la clase (la
      // misma razón del punto D).
      if (fn.name === null) continue;

      const { own, ownNames, ownInstanceHops, foreign, ambiguousHops, localBoundHops, freeNameHops } = tally;

      // Método estático (o equivalente) sin estado de INSTANCIA que tocar: no
      // hay "propio" con qué comparar, por construcción. Se mira
      // `ownInstanceHops` y no `own` a propósito — ver el docstring: con los
      // puntos (B) y (E), `own` incluye llamadas y nombres que un método
      // estático SÍ puede tener (un hermano estático, una función libre), así
      // que usar `own` desactivaba este chequeo sin decirlo.
      if (ownInstanceHops === 0 && isStaticLike(fn.node, fn.language)) continue;

      // PUNTO (N) — NO MEDIR NO ES MEDIR CERO. Sin un solo atributo propio
      // distinto, el numerador de LAA no vale 0: no se pudo medir. `LAA < 1/3`
      // se cumple entonces por construcción y la regla citada degenera a
      // "ATFD > FEW", que es exactamente la regla de la ola M, medida al 3 %.
      // Ver el docstring del módulo.
      if (ownNames.size === 0) continue;

      const dominant = dominantProviderOf(foreign);
      if (!dominant) continue; // ningún proveedor foráneo: nada que medir

      let atfdTotal = 0;
      let foreignEvents = 0;
      let chainedHops = 0;
      let commandHops = 0;
      for (const provider of foreign.values()) {
        atfdTotal += provider.directMembers.size;
        chainedHops += provider.chainedHops;
        commandHops += provider.commandHops;
        foreignEvents += provider.chainedHops + provider.commandHops;
        for (const count of provider.directMembers.values()) foreignEvents += count;
      }
      if (atfdTotal === 0) continue; // sólo órdenes y saltos encadenados: ningún DATO foráneo que medir

      // LAA CONTRA EL PROVEEDOR DOMINANTE, no contra la suma de todos — punto
      // (G) del docstring — y entre ATRIBUTOS DISTINTOS a los dos lados de la
      // razón, no entre eventos — punto (I).
      const dominantTally = foreign.get(dominant.name);
      /* c8 ignore next */
      if (!dominantTally) continue;
      let dominantEvents = dominantTally.chainedHops + dominantTally.commandHops;
      for (const count of dominantTally.directMembers.values()) dominantEvents += count;

      const ownAttributes = ownNames.size;
      const dominantAttributes = dominantTally.distinctHops.size;
      const laa = ownAttributes / (ownAttributes + dominantAttributes);
      const dominance = dominant.members / atfdTotal;

      // Las tres condiciones, en el orden en que se leen: ATFD del proveedor
      // DOMINANTE (no la suma de todos — punto (C)), LAA contra ESE MISMO
      // proveedor (punto (G)), y concentración en una única unidad ajena.
      if (!(dominant.members > atfdThreshold.value && laa < laaThreshold.value)) continue;
      if (dominance < dominanceThreshold.value) continue;

      // PUNTO (P), Ola Z (frente Z2) — EL PROVEEDOR-COLABORADOR SÓLO ES
      // ENVIDIA SI NINGÚN HERMANO LO COMPARTE DE VERDAD. Sólo aplica cuando
      // el proveedor dominante NO es un parámetro de ESTA función (si lo es,
      // es la mitad cara del kind — resolución de tipo, Ola Q §2.2 — y este
      // chequeo no la toca). "Compartir" NO es "aparecer" — ver
      // `siblingsSharingField` más arriba para la corrección medida contra
      // el caso real que la versión ingenua apagaba.
      if (!bindings.parameters.has(dominant.name)) {
        const sharedBy = scope ? siblingsSharingField.get(scope)?.get(dominant.name) : undefined;
        if (sharedBy) {
          let sharedWithSibling = false;
          for (const idx of sharedBy) {
            if (idx !== i) {
              sharedWithSibling = true;
              break;
            }
          }
          if (sharedWithSibling) continue;
        }
      }

      // PUNTO (O), Ola R — SIN UNIDAD DESTINO NO HAY `Move Method` QUE
      // ACONSEJAR. Ver el docstring de `providerUnit`: el proveedor es un
      // NOMBRE, y el consejo apunta a su CLASE; si el grafo no puede decir
      // cuál es (o dice que no es una unidad de este repo), el hallazgo
      // afirmaría "este método pertenece a X" sin poder decir qué es X.
      // `graph === null` es el ÚNICO "no pude mirar": ahí la pregunta nunca se
      // hizo y el detector emite como antes de esta ola.
      const destinationId = graph === null ? null : providerUnit(fn, className, dominant.name, graph, graphIndex);
      if (graph !== null && destinationId === null) continue;
      const destinationName = destinationId === null ? null : (unitNameOf(graphIndex, destinationId) ?? dominant.name);

      // OLA AU (AU4) — LOS TRES HECHOS. Ver el bloque de docstring
      // "LOS TRES HECHOS QUE FALTABAN". Viajan como EVIDENCIA numerada y por
      // la traza; cuál de ellos se vuelve compuerta se decide MIDIENDO sobre
      // la población viva, no acá.
      const protocolUnits = graph === null ? -1 : (functionNameUnitCount(graph).get(fn.name) ?? 0);
      const sameUnit = destinationName !== null && destinationName === className;
      const destinationBehaviour = destinationId === null ? -1 : behaviourMembersOf(graphIndex, destinationId);
      const destinationInterface = destinationId !== null && destinationIsInterface(graphIndex, destinationId);
      if (auTrace) {
        auTrace.push({
          file: file.path,
          symbol: fn.name,
          className,
          provider: dominant.name,
          destination: destinationName,
          protocolUnits,
          sameUnit,
          destinationBehaviour,
          destinationInterface,
          language: fn.language,
        });
      }

      findings.push({
        title:
          `"${fn.name ?? "función anónima"}" usa más datos de "${dominant.name}"` +
          (destinationName === null ? "" : ` (${destinationName})`) +
          ` que de "${className}"`,
        detail:
          `Este método lee o invoca ${dominant.members} miembros distintos de "${dominant.name}" y sólo ${ownAttributes} ` +
          `miembro(s) distinto(s) propio(s) de "${className}": la lógica que decide sobre esos datos probablemente ` +
          `pertenece a la unidad que los tiene, no a ésta.` +
          (destinationName !== null
            ? ` El destino del \`Move Method\` está VERIFICADO en el grafo, no supuesto: "${dominant.name}" declara ` +
              `el tipo "${destinationName}", que es una unidad de este repo (relación \`declares-type\`); si el tipo ` +
              "del proveedor no fuera de este repo — una gema, el runtime, un framework — este hallazgo no se habría " +
              "emitido, porque mudar un método a una clase ajena no es accionable."
            : " Esta corrida NO tuvo grafo, así que el tipo del proveedor no se consultó: el destino del " +
              "`Move Method` es el nombre del proveedor y no una unidad verificada.") +
          (ambiguousHops > 0
            ? ` Medido sin resolución de tipos: ${ambiguousHops} salto(s) cuyo origen no se resuelve quedaron sin ` +
              "clasificar — el ATFD real podría ser mayor que el reportado."
            : ""),
        trigger: [
          { label: "ATFD (miembros distintos del proveedor dominante)", value: dominant.members, threshold: atfdThreshold },
          {
            label: "LAA (acceso propio frente al del proveedor dominante)",
            value: Math.round(laa * 1000) / 1000,
            threshold: laaThreshold,
          },
          { label: "concentración en un único proveedor", value: Math.round(dominance * 1000) / 1000, threshold: dominanceThreshold },
        ],
        evidence: [
          ...(destinationId !== null
            ? [
                {
                  label: `miembros leídos que declara la unidad destino "${destinationName}"`,
                  value: membersDeclaredByDestination(graphIndex, destinationId, dominantTally.directMembers.keys()),
                  note:
                    "PUNTO (O), Ola R: la unidad destino sale de la relación `declares-type` (el tipo ESCRITO del " +
                    "proveedor, o la propagación desde su origen cuando el lenguaje no lo escribe), así que este " +
                    "número se le pregunta a la clase CORRECTA en vez de buscar la que más nombres comparta en todo " +
                    "el repo (que es lo que hace el número del punto (M), y que el propio punto (M) mide como no " +
                    "separador). Bajo frente al ATFD ⇒ el proveedor expone esos miembros por herencia o por un mixin " +
                    "que este archivo no ve; 0 no significa que el destino no exista, ya está verificado que existe.",
                },
              ]
            : []),
          ...(protocolUnits >= 0
            ? [
                {
                  label: "(Q) unidades de este repo que declaran un método llamado \"" + fn.name + "\"",
                  value: protocolUnits,
                  note:
                    "OLA AU: si varias unidades del repo declaran este nombre, el nombre es un PUNTO DE DESPACHO " +
                    "(un callback del framework, un `visit_*`, un `@Override` de una jerarquía) y no un método de " +
                    "esta clase: mudar UNA implementación a la clase del proveedor rompe el despacho que las otras " +
                    "comparten. 1 = nombre único de esta unidad, que es la forma que SÍ se puede mudar.",
                },
              ]
            : []),
          ...(destinationName !== null
            ? [
                {
                  label: "(R) la unidad destino es la propia clase de este método",
                  value: sameUnit ? 1 : 0,
                  note:
                    "OLA AU: 1 = el proveedor es del MISMO tipo que la clase (`equals(that)`, `addAll(otro)`, un " +
                    "constructor de copia). El consejo se leería como \"mudá este método a donde ya está\".",
                },
                {
                  label: "(S-bis) la gramática declara la unidad destino como INTERFAZ",
                  value: destinationInterface ? 1 : 0,
                  note:
                    "OLA AU: 1 = el destino es una interfaz, así que no tiene cuerpos de método y el `Move Method` " +
                    "es imposible por construcción, tenga o no firmas declaradas. 0 = la gramática NO lo dijo, que " +
                    "no es lo mismo que \"es una clase\" (Go declara struct e interfaz con el mismo `type_spec`).",
                },
                {
                  label: "(S) miembros con comportamiento que declara la unidad destino",
                  value: destinationBehaviour,
                  note:
                    "OLA AU: miembros `function-like` de la unidad destino. 0 = es una interfaz de TS, un struct de " +
                    "datos, un DTO o un descriptor — no admite métodos, así que el `Move Method` no tiene a dónde " +
                    "ir. -1 = no se pudo mirar (sin índice de grafo), que NO es lo mismo que cero.",
                },
              ]
            : []),
          ...(declaredMembers
            ? [
                {
                  label: "miembros del proveedor que declara JUNTOS una misma unidad de este repo",
                  value: bestDestinationMatch(dominantTally.directMembers.keys(), declaredMembers),
                  note:
                    "cuántos de los miembros que este método le lee al proveedor los declara, JUNTOS, una misma " +
                    "unidad de este repo. Es la evidencia de si el `Move Method` tiene a dónde ir: bajo frente al " +
                    "ATFD ⇒ el tipo del proveedor lo define otro proyecto (una gema, el runtime, un framework) y " +
                    "el consejo no es accionable. ES EVIDENCIA, NO FILTRO — se midió como filtro y no separa: ver " +
                    "el punto (M) del docstring del módulo.",
                },
              ]
            : []),
          { label: "miembros propios distintos (numerador de LAA)", value: ownAttributes },
          { label: "accesos propios (eventos)", value: own },
          {
            label: "miembros distintos alcanzados por el proveedor dominante (denominador de LAA)",
            value: dominantAttributes,
            note:
              "cuenta TODO lo alcanzado a través del proveedor — dato, orden y eslabón de cadena — porque LAA mide " +
              "localidad de acceso, no sólo ATFD. La razón es entre ATRIBUTOS DISTINTOS a los dos lados, como en " +
              "Lanza & Marinescu: contar eventos de un lado y atributos del otro hacía que escribir DIEZ VECES el " +
              "mismo campo propio se leyera como diez datos propios.",
          },
          {
            label: "accesos al proveedor dominante (eventos)",
            value: dominantEvents,
            note:
              "es el número contra el que se mide LAA: el título afirma que este método usa más los datos de UNA " +
              "unidad ajena que los propios, así que la comparación tiene que ser contra ESA unidad y no contra la " +
              "suma de todas las que toca.",
          },
          { label: "accesos foráneos de todos los proveedores (eventos)", value: foreignEvents },
          {
            label: "saltos ambiguos sin clasificar",
            value: ambiguousHops,
            note:
              "degradación declarada: cadenas cuyo origen no es un identificador (un literal, un `new`, el " +
              "resultado de una llamada libre) — no cuentan como propias ni como foráneas, así que el ATFD " +
              "reportado es un piso, no un techo.",
          },
          ...(commandHops > 0
            ? [
                {
                  label: "órdenes al proveedor (invocación con argumentos)",
                  value: commandHops,
                  note:
                    "cuentan como acceso foráneo (bajan LAA) pero NO como miembros del proveedor: ATFD es Access " +
                    "To Foreign DATA — un atributo, o el accesor sin argumentos que lo reexpone. `w.escribir(x)` " +
                    "es una orden que se le da al colaborador, no un dato que se le saca.",
                },
              ]
            : []),
          ...(chainedHops > 0
            ? [
                {
                  label: "saltos encadenados más allá del proveedor",
                  value: chainedHops,
                  note:
                    "cuentan como acceso foráneo (bajan LAA) pero NO como miembros del proveedor: en `p.x.y`, `y` " +
                    "es un dato de la clase de `p.x`, no de la de `p`, y mudar este método a `p` no lo acercaría.",
                },
              ]
            : []),
          ...(localBoundHops > 0
            ? [
                {
                  label: "saltos hacia una atadura local",
                  value: localBoundHops,
                  note:
                    "excluidos: una variable local, la variable de un loop o el parámetro de un lambda anidado no " +
                    "es un objeto de otra unidad, aunque tenga la misma forma estructural que uno.",
                },
              ]
            : []),
          ...(freeNameHops > 0
            ? [
                {
                  label: "saltos hacia un nombre libre",
                  value: freeNameHops,
                  note:
                    "excluidos: un nombre que no declara ni la función ni su clase (un import, un módulo, un " +
                    "global, un tipo, un enum) no es una unidad a la que se pueda mudar este método — " +
                    "distinguirlo de un tipo de dominio importado exige resolver el import, que no está " +
                    "disponible en esta granularidad.",
                },
              ]
            : []),
        ],
        locations: [
          {
            file: file.path,
            startLine: fn.startLine,
            endLine: fn.endLine,
            symbol: fn.name ?? undefined,
            role: "método con más acceso foráneo que propio",
          },
        ],
        severity: Math.min(100, 40 + dominant.members * 5),
        advice: {
          primary: {
            name: "Move Method",
            kind: "refactorizacion",
            why:
              "Un método que usa mayormente los datos de otra unidad suele funcionar mejor viviendo en ella: " +
              "mover el método (o extraer la parte que depende de lo ajeno) elimina el ida y vuelta constante entre las dos.",
            source: "https://refactoring.guru/es/smells/feature-envy",
          },
        },
      });
    }

    return findings;
  },
};
