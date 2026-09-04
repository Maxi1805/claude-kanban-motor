/**
 * `unused-variable` — variable local o parámetro declarado y nunca usado
 * (PLAN.md §4.1 "Variable/parámetro sin uso | función | gramática",
 * SonarSource S1481 "Unused local variables should be removed" / S1172
 * "Unused function parameters should be removed").
 *
 * RELACIÓN (qué mide, sin jerga de AST): dentro de una función, un nombre
 * declarado (un parámetro, o una variable local con una declaración real,
 * NO una simple reasignación) cuyo texto no vuelve a aparecer en ningún otro
 * lugar del cuerpo de la función. El dato desaparece sin que nada lo lea:
 * ni se devuelve, ni se pasa a otra llamada, ni participa de ninguna
 * condición.
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO — dos piezas, cada una por FORMA:
 *
 *   1. PARÁMETROS: todo nodo función-like (`code-grammar.ts#isFunctionLike`)
 *      expone un campo genérico `parameters`/`parameter_list`; cada hijo
 *      NOMBRADO de ese contenedor es, o bien directamente un nodo
 *      `identifier` (JS/TS/Vue/Python/Ruby: el parámetro simple no tiene
 *      envoltorio propio), o bien un nodo que resuelve su propio nombre por
 *      un campo genérico `name` (Go `parameter_declaration`, Java
 *      `formal_parameter`, C# `parameter`) o `pattern` (TypeScript
 *      `required_parameter`/`optional_parameter`) — confirmado por sonda
 *      directa contra las 7 gramáticas (ver el resultado final de la tarea
 *      para el volcado completo). Un parámetro desestructurado o "rest"
 *      (`pattern` resolviendo a `object_pattern`/`array_pattern`/
 *      `rest_pattern`, no a un `identifier` bare) no resuelve un nombre
 *      simple y se salta sin adivinar — mismo criterio que
 *      `switchSubjectText` en `repeated-switch.ts` cuando ningún campo
 *      conocido resuelve.
 *
 *   2. VARIABLES LOCALES: un nodo cuyo TIPO termina en `declarator` o en
 *      `_declaration` (vocabulario GENÉRICO — mecanismo (B), el mismo
 *      espíritu que `TERNARY_NAME`/`CONSTRUCTOR_NODE_WORD` de
 *      `code-grammar.ts`: aplicado IDÉNTICAMENTE a los 7 lenguajes, nunca
 *      una lista de nombres por lenguaje) Y que NO es él mismo función-like
 *      ni clase-like (excluye `function_declaration`/`class_declaration`,
 *      que también terminan en `_declaration`) Y que NO expone
 *      `arguments`/`argument_list` (excluye invocaciones — ninguna de las 7
 *      gramáticas expone esa combinación exacta hoy, pero es una exclusión
 *      barata y documentada, no una adivinanza). Confirmado el candidato,
 *      su NOMBRE se resuelve así: primero el campo genérico `name` (JS/TS/
 *      Vue/Java lo exponen); si no resuelve — confirmado por sonda: el
 *      `variable_declarator` de C# NO expone `name` como campo en
 *      absoluto, mismo tipo de nodo que Java pero sin esa metadata — se cae
 *      a un fallback igualmente genérico: el primer hijo NOMBRADO del
 *      declarador, sólo si ese hijo es, él mismo, un `identifier` bare (una
 *      desestructuración no calificaría: su primer hijo nombrado es un
 *      nodo-patrón, no un `identifier`). El sufijo `declarator`/
 *      `_declaration` sólo aparece, entre TODOS los nodos que en algún
 *      momento resuelven `name`, en la forma real de declaración de
 *      variable de cada gramática — nunca en una invocación ni en un
 *      acceso a miembro (confirmado por sonda: `member_access_expression`
 *      de C# también resuelve `name`, pero su TIPO no termina en ninguno de
 *      los dos sufijos, así que no compite con esta clasificación).
 *
 * SIMPLIFICACIONES DECLARADAS (importante, léase antes de tocar el umbral o
 * los helpers):
 *
 *   - NO hay análisis de flujo de datos ni de scope léxico anidado real. El
 *     "uso" de un nombre se mide contando ocurrencias del mismo TEXTO de
 *     `identifier` en TODO el cuerpo de la función (incluidos los closures
 *     anidados que capturan una variable exterior — necesario para no
 *     marcar como "sin uso" una variable que sólo se lee dentro de un
 *     callback). El costo de esta simplificación es asimétrico A PROPÓSITO:
 *     puede producir FALSOS NEGATIVOS por "shadowing" (un nombre reutilizado
 *     en dos bloques distintos de la misma función: si CUALQUIERA de las dos
 *     variables se usa, ninguna de las dos se reporta), pero NUNCA falsos
 *     positivos por esa causa — se prefiere no reportar antes que reportar
 *     mal.
 *   - Cada FunctionUnit sólo declara/reporta lo que está DIRECTAMENTE en su
 *     propio scope: el recorrido de declaraciones NO desciende dentro de un
 *     nodo función-like anidado (un closure interno es su PROPIA
 *     `FunctionUnit` — `fileUnitFrom` ya lo separa — y de otro modo la misma
 *     declaración se reportaría dos veces, una por cada scope). El conteo de
 *     USOS, en cambio, sí recorre el nodo completo (ver el punto anterior):
 *     la asimetría entre "dónde busco declaraciones" y "dónde busco usos" es
 *     deliberada, no un descuido.
 *   - Variables locales en Python, Ruby y la forma idiomática `:=` de Go NO
 *     se detectan: ninguna de las tres tiene, para una asignación simple, un
 *     nodo de tipo `declarator`/`_declaration` con un campo `name` que la
 *     distinga estructuralmente de una REASIGNACIÓN — Python/Ruby resuelven
 *     su asignación con campos `left`/`right` (nunca `name`) y Go's
 *     `short_var_declaration` hace lo mismo, aunque su tipo SÍ termine en
 *     `_declaration` (confirmado por sonda: no tiene campo `name`). Cubrir
 *     esto exigiría tratar la PRIMERA aparición textual de un nombre como su
 *     declaración — heurística de una naturaleza completamente distinta (no
 *     estructural, basada en orden de aparición) que se dejó deliberadamente
 *     afuera de esta ola. Los PARÁMETROS de estos tres lenguajes SÍ se
 *     detectan con normalidad (mecanismo 1, sin este límite).
 *
 * FALSOS POSITIVOS CONOCIDOS (qué forma legítima se confunde con esto, y
 * cómo se maneja):
 *
 *   - **Método `abstract`/firma de interfaz (Java, C#): parámetros
 *     declarados en la FORMA pero sin cuerpo que los use.** El más
 *     IMPACTANTE de los cuatro, encontrado corriendo este detector contra
 *     el corpus externo (Guava: `protected abstract B doForward(A a);`
 *     anotado `@ForOverride`, el propio patrón Template Method que
 *     `refused-bequest.ts` documenta del otro lado). Confirmado por sonda
 *     directa: Java/C# reutilizan el MISMO tipo de nodo (`method_declaration`)
 *     tanto para un método real como para uno abstracto — `sets.
 *     functionNodes` clasifica por TIPO (ver `code-grammar.ts`), así que la
 *     versión abstracta también llega a `run()` como `FunctionUnit`, pero su
 *     `childForFieldName("body")` no resuelve nada: no hay cuerpo que leer
 *     ningún parámetro. Sin este caso, CADA parámetro de CADA método
 *     abstracto se leía como "sin uso" — ruido sistemático, no un hallazgo
 *     real. `run()` corta con un guard genérico al principio (`sin body,
 *     sin hallazgos`): no es un caso especial de Java/C#, es la misma regla
 *     aplicada a cualquier lenguaje cuya gramática permita una declaración de
 *     función sin cuerpo. Efecto colateral confirmado por sonda, y correcto
 *     por el mismo motivo: Python exige SIEMPRE un cuerpo real (ni siquiera
 *     `def f(x): pass` puede omitirlo), así que el guard nunca se activa
 *     ahí — pero Ruby's `method` resuelve `body` sólo cuando NO está vacío
 *     (idéntica asimetría a la que `empty-catch.ts` ya documenta para
 *     `rescue`), así que un stub Ruby genuinamente vacío (`def stub(x)
 *     end`) también quedó exento con este mismo guard: mismo espíritu que
 *     un hook de Template Method (ver el docstring de `refused-bequest.ts`),
 *     así que se trata igual, no una inconsistencia.
 *   - **Parámetro obligatorio por la forma de un callback/interfaz**
 *     (`items.map((item, index) => item)`, un manejador de evento
 *     `(event) => …` que no usa `event`, un método que implementa una
 *     interfaz con una firma fija). Esta es LA confusión real que el
 *     enunciado pide manejar. A la granularidad `intra-function` no hay
 *     acceso al nodo padre ni al sitio de llamada (`FunctionUnit` no lo
 *     expone — ver `types.ts`), así que no se puede saber con certeza si
 *     ESTA función se pasó como argumento a otra. Se usa la señal
 *     disponible más cercana: `fn.name === null` (función anónima/lambda
 *     inline) como aproximación de "probablemente un callback posicional",
 *     y se SUPRIME el chequeo de parámetros sin uso (no el de variables
 *     locales, que no tienen ninguna restricción de interfaz) para toda
 *     función anónima. Es una aproximación declarada, no perfecta: una
 *     función anónima asignada a una constante y nunca pasada a nadie
 *     (`const g = (unused) => {…}`) también queda exenta (falso negativo,
 *     lado seguro).
 *
 *     UNA SEGUNDA SEÑAL, agregada esta ola, SÍ cubre la función CON NOMBRE
 *     que el párrafo anterior deja afuera — cuando la propia gramática la
 *     hace visible SIN salir de `fn.node`. Medido contra muestra fresca de
 *     newtonsoft-json (C#, 41 hallazgos vivos juzgados a mano): de los 39
 *     falsos positivos, la aplastante mayoría son overrides de un método
 *     `abstract`/`virtual` (`JsonConverter.ReadJson`, `PathFilter.
 *     ExecuteFilter`, …) o implementaciones EXPLÍCITAS de interfaz
 *     (`object? ICustomTypeDescriptor.GetEditor(...)`) — ninguno de los dos
 *     es "un callback pasado a otro lado" (necesitaría el sitio de llamada),
 *     los DOS son autodeclarados en el propio nodo función: C# expone cada
 *     modificador (`override`/`virtual`) como un hijo POSICIONAL propio de
 *     tipo `modifier` (sin campo con nombre — confirmado por sonda directa)
 *     y la sintaxis de interfaz explícita como un nodo dedicado
 *     `explicit_interface_specifier`; Java empaqueta TODOS sus modificadores
 *     bajo un único contenedor `modifiers`, con `@Override` como una
 *     `marker_annotation` cuyo campo `name` resuelve el texto `"Override"`
 *     (misma convención universal del lenguaje: la anotación estándar del
 *     propio JDK, no un nombre inventado por este repo). `hasFixedSignature
 *     Marker` (abajo) chequea las TRES formas — genérico por FORMA/
 *     vocabulario de la OOP (`override`/`virtual` significan lo mismo en
 *     cualquier lenguaje con herencia de clases; `@Override` es el nombre
 *     que Java mismo le da), nunca `if (lang === "csharp")`. Sin acceso al
 *     sitio de llamada, sigue siendo cierto que una función CON NOMBRE
 *     registrada como callback en otro archivo (`el.addEventListener
 *     ("click", onClick)`) no queda exenta — ESE caso sigue siendo el hueco
 *     declarado; lo que se cierra acá es el caso, medido como DOMINANTE en
 *     C#, de una firma fijada por herencia o por una interfaz declarada
 *     EN EL MISMO ARCHIVO/CLASE.
 *   - **Convención de descarte intencional**: un nombre `_` exacto, o que
 *     empieza con `_`, nunca se reporta — ni como parámetro ni como
 *     variable local. No es vocabulario por lenguaje: es una única
 *     convención universal (el propio `no-unused-vars` de ESLint la usa
 *     como `argsIgnorePattern`/`varsIgnorePattern` por defecto; el `_` de Go
 *     es, más que convención, el identificador en blanco que el propio
 *     compilador reconoce) aplicada IDÉNTICAMENTE a los 7 lenguajes, misma
 *     categoría que `TERNARY_NAME`. Cubre el patrón bien aplicado más común
 *     que se confunde con este problema: descartar a propósito un valor de
 *     una tupla/desestructuración (`const [_, second] = pair`) o el índice
 *     de un `for _, v := range items` en Go.
 *   - **Devolver varias variables con la forma abreviada de un objeto**
 *     (`return { a, b, c }`, el patrón central de un "composable"/hook en
 *     Vue/React: declarar varias funciones/valores locales y devolverlos
 *     todos juntos). Encontrado corriendo este detector contra el corpus
 *     EXTERNO (nunca los repos del usuario — regla 4): sin manejo explícito,
 *     cada nombre devuelto así se leía como "sin uso", porque la forma
 *     abreviada se parsea con un tipo de nodo propio
 *     (`shorthand_property_identifier`), no como un `identifier` común. Ver
 *     `USAGE_REFERENCE_TYPES` más abajo — se cuenta como una referencia
 *     real, exactamente lo que significa (`{ a }` es azúcar sintáctico de
 *     `{ a: a }`).
 *
 * LÍMITES DECLARADOS POR LENGUAJE: ver "variables locales en Python, Ruby y
 * Go" arriba — no es un límite binario por lenguaje (esos tres SÍ producen
 * hallazgos, vía parámetros), así que no se declara ningún `needs`: los 7
 * lenguajes soportados tienen funciones con parámetros, que es lo único que
 * este detector necesita para poder correr en absoluto.
 *
 * TRES BUGS DE IMPLEMENTACIÓN NUEVOS (A/B/C/D), CONFIRMADOS CONTRA GUAVA
 * (Java) — Ola M, primera tarea del frente ("juzgar Java, que es donde está
 * el volumen y donde no hay juicio"). De 26 hallazgos `unused-variable`
 * VIVOS muestreados en guava (único repo Java del corpus) sin veredicto
 * previo, 0 eran verdaderos y AL MENOS 23 caían en una de las cuatro formas
 * de abajo — el mismo mecanismo que ya arregló C# la ola pasada
 * (`override`/`virtual`/interfaz explícita), pero para tres convenciones
 * distintas que ese arreglo no cubría. Un CUARTO bug (E, más abajo, sobre
 * `isHookLikeBody`) se encontró generalizando D después de re-muestrear con
 * el arreglo A-D ya aplicado: 33 hallazgos vivos nuevos, la mayoría el mismo
 * patrón de D pero con un cuerpo de UNA sentencia trivial en vez de cero.
 *
 *   A. **Convención de descarte intencional POR NOMBRE, segunda forma**: un
 *      nombre con PREFIJO "unused" (no sólo `_`). 9 de 26 hallazgos vivos
 *      eran variables NOMBRADAS LITERALMENTE "unused" por el propio autor
 *      del código (`HostSpecifier.java:141`, `Callables.java:107`,
 *      `LocalCache.java:4753`, `ClosingFuture.java:2191`,
 *      `MessageDigestHashFunction.java:66`, `SafeTreeMap.java:303`, …) — el
 *      patrón central es "llamar a algo por su efecto colateral y descartar
 *      el resultado a propósito" (`HostSpecifier unused = fromValid(x);`
 *      dispara la validación con su excepción; el valor en sí no importa).
 *      No es una convención inventada por este repo: es la que documenta
 *      Error Prone —la propia herramienta de análisis estático de Google, y
 *      guava es código de Google— en
 *      https://errorprone.info/bugpattern/UnusedVariable, cita textual:
 *      "False positives on fields and parameters can be suppressed by
 *      prefixing the variable name with `unused`", con el ejemplo
 *      `Application unusedApplication` — por eso el chequeo es de PREFIJO
 *      (case-insensitive), no de nombre exacto. Ver `UNUSED_NAME_CONVENTION`.
 *   B. **`@SuppressWarnings("unused")` explícito**: 2 hallazgos más
 *      (`CompactHashMap.java:617`, `CompactHashSet.java:535`,
 *      `@SuppressWarnings("unused") int indexRemoved`) tenían el propio
 *      AUTOR marcando, con sintaxis del lenguaje, que ya sabe que ese
 *      parámetro no se usa — la misma anotación que Error Prone reconoce
 *      como "alternative suppression method" en el mismo doc de arriba.
 *      Ignorar esa marca y reportarlo de todos modos no es ruido: es
 *      contradecir una decisión ya tomada y ya escrita en el código. Ver
 *      `hasSuppressWarningsUnused`.
 *   C. **Callback de serialización del JDK**: 6 hallazgos más eran
 *      `private void readObject(ObjectInputStream stream)` con el cuerpo
 *      `throw new InvalidObjectException("Use SerializedForm")` — el patrón
 *      estándar de Guava para prohibir deserialización directa de una clase
 *      que se serializa vía proxy (`writeReplace`). La Java Object
 *      Serialization Specification FIJA nombre y firma exactos de
 *      `readObject`/`writeObject`/`readObjectNoData`: los invoca por
 *      REFLEXIÓN la máquina de (de)serialización, nunca un sitio de llamada
 *      textual — mismo espíritu que "main" en `unused-symbol.ts`, un nombre
 *      reservado por convención de PLATAFORMA, no vocabulario inventado acá.
 *      Ver `JAVA_SERIALIZATION_CALLBACK_NAMES`.
 *   D. **Cuerpo vacío (`{}`) de un método CONCRETO — generalización, no
 *      invención**: el docstring de arriba YA trata "cuerpo vacío" como el
 *      mismo caso que "sin cuerpo" (el test de Ruby `def stub(x); end` lo
 *      dice explícitamente: "mismo guard que un abstract de Java/C#"), pero
 *      el guard `childForFieldName("body") === null` sólo detecta la forma
 *      en que RUBY representa un método sin cuerpo (el campo no resuelve en
 *      absoluto) — en las otras 6 gramáticas un body `{}` SIGUE resolviendo
 *      un nodo real, sólo que sin sentencias adentro. Al menos 6 de 26
 *      hallazgos eran exactamente esto: un método `public`/`protected`
 *      CONCRETO cuyo cuerpo es literalmente `{}` (a veces con un comentario,
 *      `// no-op by default`), documentado como HOOK de un patrón tipo
 *      Adapter/Template Method — javadoc textual de guava,
 *      `Service.Listener`/`ServiceManager.Listener`: *"All methods are
 *      no-ops by default, implementors should override the ones they care
 *      about."* La firma COMPLETA —parámetros incluidos, aunque este método
 *      nunca los use— es el contrato que las subclases necesitan para poder
 *      sobreescribir selectivamente; sacarle el parámetro a un no-op rompe
 *      la firma para todo el resto de las que sí lo implementan
 *      (`CompactHashMap.java:326#accessEntry`, comentario propio "no-op by
 *      default"; el método base de `ToStringHelperBenchmark.java`, con
 *      constantes de enum que SÍ lo sobreescriben). Un cuerpo vacío no
 *      puede, por construcción, tener un parámetro "olvidado": cualquiera
 *      que declare es forma del método, no descuido — y si el método está
 *      de verdad incompleto, el problema real es "no hace nada" (otro
 *      smell), duplicar la señal acá sólo agrega ruido. Ver `isBodyEmpty`.
 *      LÍMITE DECLARADO, no perseguido acá: un cuerpo trivial NO vacío que
 *      tampoco usa sus parámetros (`return true;` sin leer ninguno —
 *      `Platform.java` de guava-gwt, firma fijada por compatibilidad
 *      cross-build) queda fuera; distinguir "trivial" de "real" sin una
 *      lista de formas ad-hoc es un problema distinto.
 *
 * Un quinto candidato de los 26 (`ArrayBasedUnicodeEscaper.java:99`,
 * `unsafeReplacement`) NO entra en ninguna de las cuatro formas — es un
 * parámetro documentado en el javadoc ("the default replacement for unsafe
 * characters"), enhebrado desde un constructor delegante, y JAMÁS
 * almacenado ni leído por el constructor que lo declara. Ese SÍ es un
 * hallazgo verdadero: la clase promete un comportamiento en su propia
 * documentación que el código no implementa.
 *
 * OLA N, FRENTE B1a — DOS ARREGLOS NUEVOS DE CONTRATO IMPLÍCITO (E, F), NI
 * UNO NI OTRO NECESITAN EL GRAFO: los dos casos textuales del encargo del
 * frente eran, en el fondo, la MISMA familia que (C)/(D) arriba — una firma
 * que un contrato de OUTRO lado impone, sólo que acá el contrato lo impone
 * el propio LENGUAJE en vez de una anotación del framework/JDK.
 *
 *   E. **El receptor `self`/`cls` de Python, en la posición cero de un
 *      método** — GEMELO EXACTO del arreglo de Go para su `receiver` (ver
 *      `PARAMETER_CONTAINER_TYPES` más abajo), pero del lado de mecanismo 1
 *      (parámetro), no mecanismo 2: a diferencia de Go, que declara el
 *      receptor en un campo `receiver` SEPARADO de `parameters` (por eso
 *      `collectParameters`, que sólo lee `parameters`/`parameter_list`,
 *      nunca lo ve para empezar), Python es el ÚNICO de los 8 lenguajes
 *      soportados donde el receptor de un método es un parámetro NORMAL,
 *      en la lista de parámetros de siempre (ya documentado así en
 *      `argument-mutation.ts`, mismo dato de `FunctionUnit.language`) — así
 *      que acá SÍ hay que excluirlo explícitamente, por NOMBRE, porque no
 *      hay ningún campo de gramática separado que lo distinga. El arreglo
 *      más barato de todo el tablero, medido: en la muestra juzgada de
 *      `sqlalchemy` (`tests/golden/precision/sqlalchemy.verdicts.csv`), de
 *      55 hallazgos `unused-variable` vivos, 34 (25 `self` + 9 `cls`) tienen
 *      ese símbolo exacto como parámetro — de los 11 ya juzgados a mano con
 *      ese símbolo, LOS 11 son falsos, cada nota escrita a mano dice
 *      literalmente "'self'/'cls' es el receptor de Python, no un
 *      parámetro". `PYTHON_RECEIVER_NAMES` (abajo) cubre los dos nombres
 *      universales de la convención (`self` para método de instancia, `cls`
 *      para `@classmethod`/`__new__`/metaclase) — nunca un chequeo de
 *      `language === "python"` a secas: la condición completa exige
 *      ADEMÁS que sea el parámetro de índice CERO (la convención nunca
 *      pone el receptor en otra posición) de un método real
 *      (`fn.metrics.className !== null`, mismo dato que
 *      `argument-mutation.ts` ya usa para lo mismo) — así una función SUELTA
 *      (no un método) que por cualquier motivo tenga un parámetro llamado
 *      `self` sigue evaluándose con normalidad, sin exención.
 *   F. **`super` DESNUDO de Ruby ("zsuper")**: sin paréntesis, reenvía
 *      IMPLÍCITAMENTE todos los argumentos recibidos por el método actual
 *      al método del mismo nombre en la superclase — invisible para
 *      `countIdentifierOccurrences`, que sólo cuenta TEXTO de `identifier`,
 *      y el propio `super` desnudo no es un `identifier`, ni menciona
 *      ningún nombre de parámetro. Confirmado por sonda directa
 *      (`scratchpad/precision-front/probe-b1a-ruby-super-TEMP.mjs`): un
 *      `super` desnudo parsea como un nodo `super` HOJA, hijo DIRECTO del
 *      cuerpo — mientras que `super(a, b)`/`super()`/`super(a)` (CON
 *      paréntesis, cualquier cantidad de argumentos, incluido cero, que SÍ
 *      son reenvíos EXPLÍCITOS y por lo tanto visibles con normalidad si
 *      dejan algún parámetro afuera) parsean como un `call` cuyo primer
 *      hijo ES ese mismo nodo `super` — la presencia del `call` alrededor
 *      es la señal estructural de "esto es explícito". `hasBareSuperForward`
 *      (abajo) recorre el cuerpo entero SALTEANDO el `super` que es hijo de
 *      un `call` (nunca cuenta como zsuper) y PODANDO cualquier `method`/
 *      `singleton_method` ANIDADO (un `def` dentro de otro `def` — legal en
 *      Ruby, aunque infrecuente — tiene su PROPIO `super`, de OTRO scope) —
 *      pero SIN podar un `block`/lambda (`items.each { super }`): confirmado
 *      por sonda directa que el `block` de Ruby también resuelve `body`
 *      +`parameters` (es, por FORMA, `isFunctionLike` — entra en
 *      `fn.sets.functionNodes`), pero un `super` desnudo DENTRO de un bloque
 *      sigue perteneciendo al MÉTODO que lo envuelve, no al bloque (Ruby no
 *      abre un scope de método nuevo en un bloque) — por eso esta función NO
 *      reusa `fn.sets.functionNodes` para podar (a diferencia de
 *      `collectLocalDeclarations`, que si debe podar bloques: ahí el
 *      concern es scope de VARIABLES, acá es scope de MÉTODO) y en cambio
 *      usa su propio vocabulario mínimo, `RUBY_METHOD_DEF_TYPES`. Cuando
 *      `hasBareSuperForward` da `true`, TODOS los parámetros del método se
 *      saltan (mismo lugar que el guard de `hasFixedSignatureMarker` — un
 *      reenvío implícito, como una firma fijada desde afuera, hace que
 *      "no se lee por su nombre" deje de significar "no se usa": el valor
 *      SÍ viaja, sólo que sin que el AST lo mencione por texto). Revisado
 *      el resto de los 8 lenguajes soportados por sonda directa
 *      (`scratchpad/precision-front/probe-b1a-super-other-langs-TEMP.mjs`):
 *      JS/TS y Java SÍ tienen un nodo de gramática dedicado a `super`
 *      (`call_expression`/`explicit_constructor_invocation`), y C# tiene
 *      `base` (`base_list`), pero en LOS TRES la sintaxis del lenguaje EXIGE
 *      paréntesis con argumentos explícitos — no existe una forma sintáctica
 *      "super desnudo" que compile, así que ninguno de los tres puede tener
 *      este reenvío invisible; Python y Go no exponen NINGÚN nodo `super`/
 *      `base` en absoluto (Python resuelve `super()` como una llamada
 *      normal a una función identificador, siempre con paréntesis; Go no
 *      tiene herencia de clases). Ruby es, confirmado por sonda y no por
 *      suposición, el ÚNICO de los 8 lenguajes soportados con este
 *      mecanismo — `hasBareSuperForward` sólo se invoca cuando
 *      `fn.language === "ruby"`.
 *
 * OLA N, FRENTE B1b — (G) LA FIRMA LA IMPONE UN CONTRATO EXTERNO, VISIBLE
 * SÓLO POR EL GRAFO (`needsGraph: true`, `detect/primitivas/
 * b1b-contrato-grafo.ts`, compartido con `argument-mutation.ts`). Cubre lo
 * que (C)/(D)/hasFixedSignatureMarker NO pueden: una implementación
 * IMPLÍCITA de interfaz (sin `override`/`virtual`/`explicit_interface_
 * specifier`/`@Override` — ninguna marca visible en `fn.node`) y un delegado
 * registrado en OTRO archivo. Dos mecanismos, los dos vía
 * `CodeGraphEdge`, nunca vocabulario de dominio:
 *
 *   (A) el CONTENEDOR de `fn` (su clase) tiene una arista `implements`/
 *       `extends`/`satisfies` hacia un símbolo cuyos miembros
 *       (`memberSignatures`) incluyen uno con el MISMO nombre+aridad que
 *       `fn` — CASO REAL, verificado (evidencia exploratoria, ver la nota de
 *       proceso al final de `b1b-contrato-grafo.ts`) de punta a punta contra
 *       `analyzeRepo`: `XDocumentWrapper : XContainerWrapper, IXmlDocument`
 *       (newtonsoft-json,
 *       `Converters/XmlNodeConverter.cs`) implementa IMPLÍCITAMENTE
 *       `IXmlDocument.CreateXmlDocumentType(string, string?, string?,
 *       string?)` — interfaz declarada en el MISMO archivo, sin ninguna
 *       marca en `XDocumentWrapper.CreateXmlDocumentType` que
 *       `hasFixedSignatureMarker` pudiera ver — EXACTAMENTE el caso textual
 *       del encargo ("CreateXmlDocumentType... implementa IMPLÍCITAMENTE la
 *       interfaz interna IXmlDocument"). `extends` entra en la lista, no
 *       sólo `implements`: confirmado que C# con un ÚNICO
 *       candidato tras `:` (`class Inner : IWriter`, sin clase base) lo
 *       clasifica `herencia.ts` como `extends` — el lenguaje mismo no
 *       distingue base de interfaz cuando hay uno solo.
 *   (B) `fn` es DESTINO de una arista `carries` entrante — está guardada
 *       como VALOR en otro lugar (un delegado registrado, un callback
 *       pasado por nombre). Confirmado que esto SÍ resuelve para
 *       una función SUELTA referenciada por nombre (equivalente del
 *       `customDefaultsMerge` de lodash del encargo, con test permanente en
 *       este mismo archivo — ver "customDefaultsMerge"/lodash abajo) — pero
 *       NO para un MÉTODO referenciado desnudo desde dentro de su propia
 *       clase (equivalente EXACTO de `contract.OnSerializingCallbacks.Add
 *       (ThrowUnableToSerializeError)` del encargo): la etapa `class-member`
 *       de `graph/resolve.ts` (Ola 9, YA medida y justificada — evita hubs
 *       falsos de nombres comunes) rechaza SIEMPRE un nombre desnudo que
 *       resuelve a un MIEMBRO de clase salvo que sea una invocación
 *       (`isCallee`), en los 9 lenguajes — un nombre de MÉTODO leído como
 *       valor nunca sobrevive esa etapa, así que nunca llega a
 *       `carries-derive.ts`. Ese caso textual del encargo QUEDA SIN
 *       CUBRIR por (B); si el mismo método ADEMÁS cumple (A), sigue
 *       protegido por esa vía — `ThrowUnableToSerializeError` no la cumple
 *       (no implementa nada, es un callback de serialización JDK-like, ya
 *       cubierto por (C) arriba de todos modos, así que el caso real
 *       termina protegido, sólo que por (C), no por (B)).
 *
 * PROBLEMA RESUELTO PRIMERO, DOCUMENTADO EN `b1b-contrato-grafo.ts`: las
 * anclas de un `FunctionUnit` (`fn.symbolPath`/`fn.metrics.className`) NO
 * coinciden con el id real del grafo en cuanto hay más de un nivel de
 * contenedor con nombre (namespace, clase anidada dos niveles) — gap medido,
 * no supuesto. `signatureImposedByContract` resuelve por SUFIJO, no por id
 * exacto — ver ese archivo para el detalle completo y la evidencia.
 *
 * OLA O, FRENTE N6 — (H) EL CONTRATO QUE VIVE AFUERA DEL REPO, visible por
 * su HUELLA en el grafo (`detect/primitivas/n6-firma-impuesta.ts#
 * signatureSharedAcrossContainers`, sumado dentro de
 * `contractImposesSignature`).
 *
 * QUÉ AGUJERO TAPA, medido: de los 27 falsos positivos VIVOS ya juzgados a
 * mano en `tests/golden/precision/*.verdicts.csv` para este kind (44
 * veredictos vivos, 39 % de precisión al abrir la ola), DOCE son de Go y los
 * doce dicen lo mismo con distintas palabras — "la firma la impone una
 * interfaz que este repo no declara": `Transform(doc, reader, pctx)` de
 * `hugo/markup/goldmark/images/transform.go` cumple `parser.ASTTransformer`
 * de goldmark; `Draw(dst, src, options)` de `resources/images/overlay.go`
 * cumple `gift.Filter`; `ReadDir(n)` de `hugofs/decorators.go` cumple
 * `fs.ReadDirFile` de la stdlib; `PreRun(cd, runner)` cumple
 * `simplecobra.Commandeer`. Los cuatro contratos viven en una DEPENDENCIA:
 * `graph/build.ts` descarta el nombre externo como "unresolved... sin aportar
 * señal", así que NO EXISTE la arista `implements`/`satisfies` que el
 * mecanismo (G) necesita — y en Go, que no declara la satisfacción de
 * interfaz en ninguna parte de la sintaxis, tampoco hay ninguna marca que
 * (C)/(D)/`hasFixedSignatureMarker` pudiera leer del propio nodo. El detector
 * se quedaba sin ninguna vía.
 *
 * LA HUELLA QUE SÍ ESTÁ ADENTRO: un contrato externo cumplido deja, dentro
 * del repo, VARIAS declaraciones independientes de la misma firma exacta —
 * las propias notas de los veredictos lo dicen una por una ("hay otra
 * implementación hermana (DiagnosticsTraceWriter) con la misma firma", "está
 * declarado en una interfaz con CUATRO implementaciones", "también lo
 * implementa el tipo `startEnd` en el mismo archivo", "TODOS los
 * constructores `New(d *deps.Deps)` de `tpl/*` comparten esa firma"). Que dos
 * contenedores SIN relación de herencia entre sí declaren `Draw(dst, src,
 * options)` no es una coincidencia: es el contrato de afuera asomando. Eso es
 * contable sobre `graph.nodes` sin resolver ninguna referencia — ver el
 * docstring de la primitiva para por qué esto NO es el colapso de métodos por
 * nombre que el integrador de la Ola N documentó en `shotgun-surgery`.
 *
 * DEGRADA IGUAL QUE (G): sin grafo, `false` — CONTRATO-UNIFICACION.md §2.
 *
 * UN CONSTRUCTOR NUNCA PARTICIPA DE (H), y no es un detalle: que dos clases
 * sin relación entre sí declaren un constructor de la misma aridad es una
 * coincidencia aritmética, no un contrato. Sin esa exclusión el mecanismo
 * suprimía TODO parámetro de constructor de cualquier repo con dos clases —
 * medido: 33 de los 74 hallazgos que se retiraban en `corpus/nest` eran
 * `constructor`, y en `corpus/guava` habría tapado el ÚNICO verdadero
 * positivo documentado de este kind (`ArrayBasedUnicodeEscaper.java:99`,
 * `unsafeReplacement`, que es un parámetro de CONSTRUCTOR). Ver
 * `n6-firma-impuesta.ts#isConstructorSymbol`.
 *
 * OLA O, FRENTE N6 — (I) UN PARÁMETRO QUE LA SINTAXIS DECLARA COMO MIEMBRO
 * DEL OBJETO NO ES UN PARÁMETRO SIN USO (`declaresObjectMember`). AST puro,
 * sin grafo. La "parameter property" de TypeScript —`constructor(private
 * readonly container: NestContainer)`, `constructor(public readonly audio)`—
 * declara un CAMPO en la misma posición donde declara el parámetro: el
 * lenguaje lo guarda aunque el cuerpo no lo mencione nunca, y lo que lo lee
 * (`this.container`) no es un `identifier` sino un `property_identifier`, así
 * que `countIdentifierOccurrences` no puede verlo NI CUANDO SÍ SE USA. Es un
 * falso positivo doble y ya estaba medido y escrito a mano en la planilla —
 * `vueuse/packages/rxjs/watchExtractedObservable/_demo.vue:17`, veredicto
 * falso con la nota "parameter property (`public readonly audio`), reforzado
 * porque ADEMÁS se lee más abajo vía `this.audio` — invisible para el
 * detector porque el acceso a miembro usa un tipo de nodo distinto". Se
 * reutiliza el canal `NamedSite.suppressed` que ya existía para
 * `@SuppressWarnings("unused")`: la marca la pone el propio código, sólo que
 * con otra sintaxis.
 */
import { signatureImposedByContract } from "../primitivas/b1b-contrato-grafo.js";
import { signatureMarkedAsImposed, signatureSharedAcrossContainers } from "../primitivas/n6-firma-impuesta.js";
import { citado, type Threshold } from "../thresholds.js";
import { walkTree } from "../tree-walk.js";
import type { AstNode, FunctionUnit, IntraFunctionDetector, RawFinding, RunContext } from "../types.js";

type ThresholdKey = "unusedParameter" | "unusedLocal";

/** Convención universal de descarte intencional — ver el docstring del módulo. */
const INTENTIONALLY_DISCARDED = /^_/;

/**
 * Segunda convención de descarte intencional por NOMBRE — prefijo "unused"
 * (case-insensitive), documentada por Error Prone
 * (https://errorprone.info/bugpattern/UnusedVariable, "prefixing the
 * variable name with `unused`", ejemplo `unusedApplication`) y CONFIRMADA
 * como bug de implementación contra guava — ver "TRES BUGS DE
 * IMPLEMENTACIÓN NUEVOS" (A) en el docstring del módulo.
 */
const UNUSED_NAME_CONVENTION = /^unused/i;

/** `true` cuando `name` matchea cualquiera de las dos convenciones universales de descarte intencional. */
function isIntentionallyDiscardedName(name: string): boolean {
  return INTENTIONALLY_DISCARDED.test(name) || UNUSED_NAME_CONVENTION.test(name);
}

/**
 * Nombres de los métodos de callback de `java.io.Serializable` — ver "TRES
 * BUGS DE IMPLEMENTACIÓN NUEVOS" (C) en el docstring del módulo. Vocabulario
 * fijado por la especificación del JDK, no una lista inventada por lenguaje
 * — mismo espíritu que `CONSTRUCTOR_NAMES`/"main": un nombre reservado por
 * convención de PLATAFORMA. `readResolve`/`writeReplace` no entran (no
 * declaran parámetros — nada que este chequeo necesite cubrir).
 */
const JAVA_SERIALIZATION_CALLBACK_NAMES = new Set(["readObject", "writeObject", "readObjectNoData"]);

/** Los dos nombres universales del receptor de método en Python — ver "OLA N, FRENTE B1a" (E) en el docstring del módulo. */
const PYTHON_RECEIVER_NAMES = new Set(["self", "cls"]);

/** Tipos de nodo de una definición de método Ruby REAL (`def`/`def self.…`) — nunca un bloque/lambda, ver "OLA N, FRENTE B1a" (F) en el docstring del módulo. Vocabulario usado sólo dentro de `hasBareSuperForward`, que a su vez sólo se invoca para Ruby. */
const RUBY_METHOD_DEF_TYPES = new Set(["method", "singleton_method"]);

/**
 * `true` cuando el cuerpo de `root` contiene un `super` DESNUDO ("zsuper") —
 * ver "OLA N, FRENTE B1a" (F) en el docstring del módulo. Recorrido propio,
 * no `walkTree`, por el mismo motivo que `collectLocalDeclarations`: hace
 * falta PODAR dos formas (el `super` que es callee explícito de un `call`, y
 * cualquier `method`/`singleton_method` ANIDADO), algo que un visitor plano
 * no puede expresar.
 */
function hasBareSuperForward(root: AstNode): boolean {
  let found = false;
  const visit = (node: AstNode, isRoot: boolean): void => {
    if (found || !node.isNamed) return;
    if (!isRoot && RUBY_METHOD_DEF_TYPES.has(node.type)) return; // método anidado: su propio `super` es de OTRO scope
    if (node.type === "call") {
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i) as AstNode | null;
        if (!child || !child.isNamed) continue;
        if (child.type === "super") continue; // callee EXPLÍCITO (`super(...)`/`super()`) — nunca zsuper
        visit(child, false);
      }
      return;
    }
    if (node.type === "super") {
      found = true;
      return;
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i) as AstNode | null;
      if (child) visit(child, false);
    }
  };
  visit(root, true);
  return found;
}

/**
 * `true` cuando `fn.node` lleva, en sí mismo, una marca de que su firma está
 * fijada desde AFUERA de esta función — ver "parámetro obligatorio por la
 * forma de un callback/interfaz" en el docstring del módulo.
 *
 * OLA O, FRENTE N6 — el cuerpo se MUDÓ a
 * `detect/primitivas/n6-firma-impuesta.ts#signatureMarkedAsImposed`, sin
 * cambiarle ni una condición: `boolean-flag-param.ts` necesita exactamente la
 * misma lectura (ver el docstring de esa primitiva) y dos copias del mismo
 * chequeo se separan con el tiempo. Este alias queda para que los llamadores y
 * los tests de este módulo sigan hablando en su propio vocabulario.
 */
function hasFixedSignatureMarker(node: AstNode): boolean {
  return signatureMarkedAsImposed(node);
}

/**
 * `true` cuando `node` lleva, entre sus hijos DIRECTOS, un `modifiers` con
 * una anotación `@SuppressWarnings(...)` cuyo argumento menciona "unused" —
 * ver "TRES BUGS DE IMPLEMENTACIÓN NUEVOS" (B) en el docstring del módulo.
 * `node` es, según el llamador: el `formal_parameter` mismo (CONFIRMADO por
 * sonda directa: expone `modifiers` como hijo propio incluso para un solo
 * parámetro anotado — `int adjustAfterRemove(int a, @SuppressWarnings
 * ("unused") int b)`), o el CONTENEDOR de un declarador local
 * (`local_variable_declaration`, nunca el `variable_declarator` en sí —
 * CONFIRMADO por sonda directa: `modifiers` es hermano DIRECTO de
 * `variable_declarator`, nunca su hijo — por eso `collectLocalDeclarations`
 * chequea esto ANTES de descender al declarador real, no en el declarador).
 * Chequea el TEXTO completo de la anotación (`annotation.text`, incluidas
 * las comillas) en vez de bajar hasta el `string_fragment` — cubre tanto
 * `@SuppressWarnings("unused")` como `@SuppressWarnings({"unused",
 * "unchecked"})` sin tener que enumerar las formas del argumento.
 * Vocabulario de UNA anotación real del JDK, nunca `if (lang === "java")`:
 * esta forma de nodo (`modifiers` con hijo `annotation`/`marker_annotation`)
 * simplemente no existe en ninguna otra de las 7 gramáticas soportadas, así
 * que la función es un no-op inocuo en el resto.
 */
function hasSuppressWarningsUnused(node: AstNode): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i) as AstNode | null;
    if (!child || !child.isNamed || child.type !== "modifiers") continue;
    for (let j = 0; j < child.childCount; j++) {
      const annotation = child.child(j) as AstNode | null;
      if (!annotation || (annotation.type !== "annotation" && annotation.type !== "marker_annotation")) continue;
      const name = annotation.childForFieldName("name") as AstNode | null;
      if (name && name.text === "SuppressWarnings" && /unused/i.test(annotation.text)) return true;
    }
  }
  return false;
}

/**
 * `true` cuando el CUERPO de `fn` no tiene ni una sola sentencia real (sólo
 * comentarios, o nada) — ver "TRES BUGS DE IMPLEMENTACIÓN NUEVOS" (D) en el
 * docstring del módulo. Precondición: `fn.node.childForFieldName("body")`
 * ya se sabe no-null en el único sitio que llama a esto (`run()` ya cortó
 * arriba con el guard de "sin cuerpo" — ver ahí), así que el `if (!body)`
 * de acá es defensivo, no la vía principal.
 */
/** Sentencias REALES (no comentarios) entre los hijos directos de `body`, contadas hasta `cap + 1` (no hace falta seguir contando más allá). */
function countRealStatements(body: AstNode, cap: number): number {
  let count = 0;
  for (let i = 0; i < body.childCount; i++) {
    const child = body.child(i) as AstNode | null;
    if (!child || !child.isNamed) continue;
    if (/comment$/i.test(child.type)) continue; // un comentario no es una sentencia
    count++;
    if (count > cap) return count; // ya sabemos que supera el cap, no hace falta seguir
  }
  return count;
}

function isBodyEmpty(fn: FunctionUnit): boolean {
  const body = fn.node.childForFieldName("body") as AstNode | null;
  if (!body) return false;
  return countRealStatements(body, 0) === 0;
}

/**
 * GENERALIZACIÓN DE (D), CONFIRMADA CONTRA GUAVA — "TRES BUGS DE
 * IMPLEMENTACIÓN NUEVOS" del docstring del módulo trataba sólo el cuerpo
 * VACÍO (`{}`). Pero el MISMO patrón —hook de Template Method, firma fijada
 * por lo que las subclases necesitan sobreescribir— aparece igual de seguido
 * con un cuerpo de UNA sola sentencia trivial que TAMPOCO usa ninguno de sus
 * parámetros: `Cut.java:66#canonical(DiscreteDomain<C> domain) { return
 * this; }` ("// note: overridden by {BELOW,ABOVE}_ALL", comentario propio),
 * `AbstractMapBasedMultimap.java:172#createCollection(K key) { return
 * createCollection(); }` ("By default, it simply calls createCollection()…
 * The LinkedHashMultimap class overrides it.", javadoc propio),
 * `FreshValueGenerator.java:327#interfaceMethodCalled(Class<?>
 * interfaceType, Method method) { throw new UnsupportedOperationException();
 * }` ("Subclasses can override to provide different return value…", javadoc
 * propio) — de 33 hallazgos vivos re-muestreados tras el arreglo (D), la
 * mayoría eran exactamente esta forma.
 *
 * POR QUÉ EL CRITERIO ES MÁS ESTRICTO QUE "UNA SOLA SENTENCIA" A SECAS: una
 * sentencia SÍ puede usar un parámetro y olvidarse de otro (`void
 * configure(String key, String value) { store.put(key); }`, bug real,
 * `value` perdido) — ESE caso tiene que seguir reportándose. La condición
 * extra —TODOS los parámetros de `fn` sin excepción tienen cero ocurrencias,
 * no sólo el candidato actual— es lo que separa "esta función ignora su
 * firma ENTERA" (hook/stub, los tres ejemplos de arriba) de "esta función
 * usa la mayoría de su firma y se olvidó de una" (bug real, no se toca). Un
 * cuerpo de cero sentencias (D) cumple esto trivialmente —no hay sentencia
 * que pueda usar nada—, así que esta función reemplaza a `isBodyEmpty` como
 * el único guard del párrafo de parámetros en `run()`.
 */
function isHookLikeBody(fn: FunctionUnit, occurrences: ReadonlyMap<string, number>): boolean {
  const body = fn.node.childForFieldName("body") as AstNode | null;
  if (!body) return false;
  const stmts = countRealStatements(body, 1);
  if (stmts === 0) return true;
  if (stmts > 1) return false;
  const params = collectParameters(fn);
  if (params.length === 0) return false; // nada que "ignorar por completo"
  return params.every((p) => (occurrences.get(p.name) ?? 0) - 1 <= 0);
}

/** Vocabulario GENÉRICO de mecanismo (B): nunca una lista de nombres por lenguaje — ver el docstring del módulo. */
const DECLARATOR_LIKE = /(declarator|_declaration)$/i;

/**
 * Tipos de nodo CONTENEDOR-DE-PARÁMETROS, confirmados por sonda directa
 * contra las 8 gramáticas: `parameter_list` (Go, C#), `formal_parameters`
 * (JS/TS/Vue/Java), `method_parameters` (Ruby), `parameters` (Python). Igual
 * espíritu que `USAGE_REFERENCE_TYPES` más abajo: un puñado de nombres de
 * TIPO tomados literal de la gramática, no una decisión por lenguaje sobre
 * qué es un patrón — es el mismo tipo de nodo que la propia gramática usa
 * para "una lista de parámetros entre paréntesis", dondequiera que aparezca.
 *
 * POR QUÉ SE NECESITA, más allá del propio contenedor de `fn` (ya cubierto
 * por `paramsContainer` en `collectLocalDeclarations`): confirmado por sonda
 * directa (`scripts/probe-*-unused-*-TEMP.mts` de esta ola, sobre la sonda
 * REAL de producción `GO_PROBE`/`CSHARP_PROBE` de `code-analyzer.ts`, no una
 * sonda de test simplificada) que Go expone TRES contenedores de este mismo
 * tipo `parameter_list` en un solo `method_declaration` — `receiver`
 * (`func (ns *Namespace) …`), `parameters` (los de siempre) y `result` (los
 * RETORNOS NOMBRADOS, `func (…) (minimum float64, err error) { … }`) — y que
 * el recorrido de `collectLocalDeclarations` sólo conocía el del campo
 * `parameters`. Los otros dos quedaban SIN podar: el recorrido descendía
 * dentro de `receiver`/`result`, encontraba sus `parameter_declaration`/
 * `variadic_parameter_declaration` (ambos terminan en `_declaration`, matchean
 * `DECLARATOR_LIKE`, y SÍ resuelven `name` — mecanismo 1 completo, sólo que
 * mecanismo 2 tampoco tenía forma de saber que ya eran de otro mecanismo) y
 * los reportaba como "variable local declarada" — un receptor nunca usado
 * (`ns` sin `ns.algo` en el cuerpo) o un retorno nombrado usado sólo para
 * documentar la firma (`return calc(...)`, bypaseando `minimum`/`err` por
 * completo, IDIOMÁTICO en Go) se leían como código muerto cuando son, en el
 * primer caso, ruido idéntico al de un parámetro sin uso (mecanismo 1, no
 * mecanismo 2) y en el segundo, ni siquiera eso: un nombre de RETORNO no es
 * una variable que "se descarta sin que nada la use", es una anotación de
 * `godoc`. Encontrado además un TERCER caso, más profundo: un
 * `parameter_declaration` puede aparecer ANIDADO dentro de la anotación de
 * TIPO de una variable local completamente distinta (`var handler
 * func(ctx context.Context, token string) error`, el tipo de `handler` es
 * en sí mismo una firma de función con sus propios parámetros) — ningún
 * contenedor "propio de `fn`" cubre ese caso porque no es un contenedor de
 * `fn` en absoluto, es un contenedor anidado en la mitad del cuerpo. Podar
 * por TIPO en cualquier profundidad — no por identidad de un único nodo
 * conocido de antemano — resuelve los tres de una vez: dondequiera que
 * aparezca un `parameter_list` (o su equivalente en otra gramática), lo que
 * hay adentro es por definición "los parámetros de una firma", nunca "una
 * variable local de la función que se está analizando".
 *
 * UN CUARTO HALLAZGO, más fundamental, que hace esto no-opcional incluso
 * para el contenedor PROPIO de `fn`: `node === paramsContainer` en
 * `collectLocalDeclarations` es una comparación por IDENTIDAD DE OBJETO, y
 * `web-tree-sitter` no la garantiza estable — confirmado por sonda directa
 * (`scripts/probe-node-identity-TEMP.mts` de esta ola): dos llamadas
 * SEGUIDAS a `mismoNodo.childForFieldName("parameters")` devuelven dos
 * objetos JS DISTINTOS (`===` da `false`) para el mismísimo nodo del árbol
 * (`.id` sí coincide). El contenedor obtenido una vez como `paramsContainer`
 * y el mismo contenedor re-descubierto durante el recorrido vía `node.child
 * (i)` son, en la práctica, dos objetos distintos: la guarda `node ===
 * paramsContainer` NUNCA matcheaba, para ningún lenguaje — simplemente no
 * tenía consecuencias observables salvo en Go, porque es la ÚNICA gramática
 * de las 7 cuyo tipo de nodo de parámetro (`parameter_declaration`/
 * `variadic_parameter_declaration`) también termina en `_declaration` y por
 * lo tanto matchea `DECLARATOR_LIKE` — en las otras 6, lo que hay dentro del
 * contenedor de parámetros nunca competía con `isLocalDeclaratorLike` de
 * todos modos, guarda rota o no. Podar por TIPO (`PARAMETER_CONTAINER_TYPES.
 * has(node.type)`, una comparación de STRING, no de referencia de objeto) es
 * inmune a esta inestabilidad; la comparación `node === paramsContainer`
 * original queda igual arriba (no hace daño, documenta la intención) pero ya
 * no es la que hace el trabajo.
 *
 * UN QUINTO CASO, mismo mecanismo — los TYPE PARAMETERS de un genérico
 * (`func New[T any](cfg Config[T]) *NodeShiftTree[T]`): BUG CONFIRMADO
 * contra hugo (`hugolib/doctree/nodeshifttree.go`, `New`) — sonda directa
 * confirma que Go expone `[type_parameters]` como un `type_parameter_list`
 * con hijos `parameter_declaration` (el MISMO tipo de nodo que los
 * parámetros normales, reutilizando la regla de gramática), así que "T"
 * quedaba SIN podar (el contenedor de parámetros normal, vía `parameters`,
 * no cubre este OTRO campo) y se reportaba como "variable local declarada".
 * `type_parameter_list` entra al mismo Set por la misma razón que
 * `parameter_list`/`receiver`/`result`: es, por FORMA, un contenedor de
 * declaraciones-de-parámetro, nunca de variables locales — dondequiera que
 * aparezca. Confirmado por sonda que NINGUNA de las otras 6 gramáticas
 * reutiliza `parameter_declaration`/`declarator` para sus propios type
 * parameters (Java/C# usan `type_parameter`, TS usa `type_parameter` dentro
 * de `type_parameters`, ninguno de los dos matchea `DECLARATOR_LIKE`), así
 * que agregar `type_parameter_list` acá es inocuo para ellas — se agrega de
 * todos modos, por la misma lógica de vocabulario genérico que el resto de
 * este Set: si alguna otra gramática algún día reutiliza el mismo nombre de
 * tipo para el mismo propósito, ya queda cubierta.
 */
const PARAMETER_CONTAINER_TYPES = new Set([
  "parameter_list",
  "formal_parameters",
  "method_parameters",
  "parameters",
  "type_parameter_list",
]);

interface NamedSite {
  name: string;
  node: AstNode;
  /** `true` cuando el propio sitio (o, para una variable local, su declaración contenedora) lleva `@SuppressWarnings("unused")` — ver `hasSuppressWarningsUnused`. */
  suppressed: boolean;
}

function hasField(node: AstNode, field: string): boolean {
  return node.childForFieldName(field) !== null;
}

function isIdentifier(node: AstNode | null): node is AstNode {
  return node !== null && node.isNamed && node.type === "identifier";
}

/**
 * `true` cuando el parámetro NO es sólo un parámetro: la propia sintaxis lo
 * declara como MIEMBRO del objeto — ver "OLA O, FRENTE N6" (I) en el
 * docstring del módulo. Dos marcas, confirmadas por sonda directa
 * (`scratchpad/precision-front/probe-n6-paramprop-TEMP.mts`):
 *
 *   - un hijo NOMBRADO de tipo `accessibility_modifier` (`private`/`public`/
 *     `protected`) — nombre de nodo de la gramática, no una lista inventada;
 *   - un hijo ANÓNIMO cuyo texto es `readonly` (la otra forma que declara un
 *     miembro, sin modificador de acceso) — palabra clave del lenguaje, la
 *     misma clase de vocabulario que `override`/`virtual` ya usados acá.
 *
 * Un parámetro así no puede "sobrar": el lenguaje lo guarda como campo aunque
 * el cuerpo no lo mencione nunca, y lo que lo lee (`this.x`) ni siquiera es un
 * `identifier` para `countIdentifierOccurrences` — es un
 * `property_identifier`. Ninguna otra gramática soportada expone estas dos
 * formas dentro de una lista de parámetros, así que el chequeo es un no-op
 * inocuo en las demás.
 */
function declaresObjectMember(paramNode: AstNode): boolean {
  for (let i = 0; i < paramNode.childCount; i++) {
    const child = paramNode.child(i) as AstNode | null;
    if (!child) continue;
    if (child.isNamed && child.type === "accessibility_modifier") return true;
    if (!child.isNamed && child.text === "readonly") return true;
  }
  return false;
}

/** Nombre de un parámetro: el hijo ES un `identifier` bare, o resuelve uno vía `name`/`pattern`. */
function paramName(child: AstNode): AstNode | null {
  if (child.isNamed && child.type === "identifier") return child;
  const byName = child.childForFieldName("name") as AstNode | null;
  if (isIdentifier(byName)) return byName;
  const byPattern = child.childForFieldName("pattern") as AstNode | null;
  if (isIdentifier(byPattern)) return byPattern;
  return null;
}

/** Todos los parámetros con nombre simple resoluble — ver el mecanismo 1 del docstring. */
function collectParameters(fn: FunctionUnit): NamedSite[] {
  const container = (fn.node.childForFieldName("parameters") ?? fn.node.childForFieldName("parameter_list")) as AstNode | null;
  if (!container) return [];
  const sites: NamedSite[] = [];
  for (let i = 0; i < container.childCount; i++) {
    const child = container.child(i) as AstNode | null;
    if (!child || !child.isNamed) continue;
    const nameNode = paramName(child);
    if (nameNode) sites.push({ name: nameNode.text, node: nameNode, suppressed: hasSuppressWarningsUnused(child) || declaresObjectMember(child) });
  }
  return sites;
}

/**
 * `true` cuando `node` tiene la forma de una declaración de variable — ver el
 * mecanismo 2 del docstring.
 *
 * ÚLTIMO CHEQUEO — nunca un CONTENEDOR que envuelve su propio declarador
 * real: BUG CONFIRMADO por sonda directa (reproducido con un fixture mínimo
 * aislado, `IDictionaryEnumerator e = values.GetEnumerator();`) y por tres
 * hallazgos vivos del corpus externo (`QueryExpression`/`IDictionaryEnumerator`/
 * `Fallback`, newtonsoft-json). La `variable_declaration` de C# (tipo +
 * declarador, `IDictionaryEnumerator e = …`) TAMBIÉN termina en
 * `_declaration` y también matchea `DECLARATOR_LIKE`, pero no es ella misma
 * un sitio de ligadura — es el contenedor de uno (o más, `string a, b;`). Sin
 * este chequeo, `declaratorName` caía a su fallback de "primer hijo
 * nombrado" (necesario para el `variable_declarator` REAL, ver su propio
 * docstring) y, para un tipo NO primitivo, el tipo de C# se parsea como
 * `identifier` bare (a diferencia de Java, que usa un `type_identifier`
 * propio — por eso Java nunca disparó este bug pese a compartir la misma
 * forma envolvente): el fallback devolvía el NOMBRE DEL TIPO
 * (`IDictionaryEnumerator`) en vez del nombre real (`e`), que vive un nivel
 * más abajo, en el hijo `variable_declarator` — el propio recorrido de
 * `collectLocalDeclarations` YA visita ese hijo por separado y lo resuelve
 * bien; este chequeo sólo evita que el CONTENEDOR intente resolverse a sí
 * mismo. Detectado por FORMA (¿tengo un hijo directo nombrado que también
 * matchea `DECLARATOR_LIKE`?), no por lenguaje: si algún día otra gramática
 * reutiliza la misma envoltura tipo+declarador, queda cubierta sin tocar
 * este archivo.
 */
function isLocalDeclaratorLike(node: AstNode, fn: FunctionUnit): boolean {
  if (!DECLARATOR_LIKE.test(node.type)) return false;
  if (fn.sets.functionNodes.has(node.type) || fn.sets.classNodes.has(node.type)) return false;
  if (hasField(node, "parameters") || hasField(node, "parameter_list") || hasField(node, "body")) return false;
  if (hasField(node, "arguments") || hasField(node, "argument_list")) return false;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i) as AstNode | null;
    if (child && child.isNamed && DECLARATOR_LIKE.test(child.type)) return false; // envoltorio de un declarador real, no un sitio de ligadura en sí
  }
  return true;
}

/**
 * `true` cuando `a` y `b` son, en el árbol REAL, el mismo nodo — comparado
 * por POSICIÓN (`startPosition`), no por `===`. BUG CONFIRMADO por sonda
 * directa (`scripts/probe-node-identity-TEMP.mts` de esta ola): `web-tree-
 * sitter` no garantiza que dos llamadas a un accessor (`childForFieldName`,
 * `child(i)`) devuelvan el MISMO objeto JS para el mismo nodo del árbol —
 * `===` da `false` incluso cuando ambas envuelven idéntico nodo (`.id`
 * coincide, pero `ProbeNode`/`AstNode` no exponen `.id`). La posición
 * (fila+columna de inicio) sí es estable entre llamadas: dos nodos con la
 * misma posición de inicio, dentro del mismo padre, son el mismo nodo.
 */
function isSamePosition(a: AstNode, b: AstNode): boolean {
  return a.startPosition.row === b.startPosition.row && a.startPosition.column === b.startPosition.column;
}

/**
 * El nombre de un declarador ya confirmado por `isLocalDeclaratorLike`.
 * Primero el campo genérico `name` (JS/TS/Vue/Java); si no resuelve, un
 * fallback genérico — NO por lenguaje — confirmado necesario por sonda
 * directa: el `variable_declarator` de C# no expone `name` como campo en
 * absoluto (a diferencia de Java, con el mismo tipo de nodo), su
 * `identifier` es simplemente el primer hijo NOMBRADO, antes de la
 * `equals_value_clause`. El fallback exige que ese primer hijo nombrado sea,
 * él mismo, un `identifier` bare — una desestructuración no calificaría,
 * porque su primer hijo nombrado es un nodo patrón, no un `identifier`.
 *
 * NUNCA el campo `type`, aunque sea el primer hijo nombrado y aunque resuelva
 * `identifier` bare — BUG CONFIRMADO por sonda directa contra newtonsoft-json
 * (`catch (InvalidOperationException) // sin variable ligada`, C#): el
 * `catch_declaration` de C# TERMINA en `_declaration` (matchea
 * `DECLARATOR_LIKE`) y, cuando el `catch` no liga ninguna variable (`catch
 * (Tipo)`, sin `catch (Tipo nombre)`), no expone campo `name` EN ABSOLUTO —
 * sólo `type`. Sin este chequeo, el mismo fallback que `variable_declarator`
 * necesita para C# (arriba) confundía el TIPO de la excepción con su nombre,
 * exactamente el mismo mecanismo que el bug de `IDictionaryEnumerator`/
 * `QueryExpression`/`Fallback` documentado en `isLocalDeclaratorLike`, pero
 * en una forma que esa corrección NO cubre: ahí el arreglo fue "no soy yo,
 * el nombre real vive en mi hijo declarador anidado" — acá NO HAY ningún
 * declarador anidado que resolver: sin variable ligada, no hay NINGÚN nombre
 * que reportar, y `declaratorName` tiene que poder decir "no hay nombre"
 * (`null`) en vez de inventar uno con el tipo. Genérico por FORMA (el campo
 * `type`, no un nombre de nodo por lenguaje): si el candidato a fallback es,
 * por posición, el mismo nodo que resuelve `childForFieldName("type")`, se
 * descarta y se sigue buscando en el resto de los hijos nombrados — nunca se
 * lo confunde con el nombre.
 */
function declaratorName(node: AstNode): AstNode | null {
  const byField = node.childForFieldName("name") as AstNode | null;
  if (isIdentifier(byField)) return byField;
  const typeField = node.childForFieldName("type") as AstNode | null;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i) as AstNode | null;
    if (!child || !child.isNamed) continue;
    if (typeField && isSamePosition(child, typeField)) continue; // es el TIPO, no el nombre — ver el docstring
    return isIdentifier(child) ? child : null;
  }
  return null;
}

/**
 * Declaraciones de variable local DIRECTAS de `fn` — nunca las de un closure
 * anidado (su propia `FunctionUnit` las cubre) ni las de NINGÚN contenedor de
 * parámetros, propio o ajeno (mecanismo 1 ya las cubre cuando corresponde;
 * ver `PARAMETER_CONTAINER_TYPES`). Recorrido propio, no `walkTree`: a
 * diferencia de un recorrido plano, éste necesita PODAR tres formas de
 * subárbol completas (el contenedor de parámetros propio de `fn`, cualquier
 * función anidada, y cualquier OTRO contenedor de parámetros que aparezca en
 * el cuerpo — el receptor y los retornos nombrados de un método Go son
 * contenedores de este tipo aunque no sean EL contenedor de `fn`, y una
 * anotación de tipo de función también puede traer el suyo propio anidado
 * en cualquier profundidad), algo que el visitor de `walkTree` no puede
 * expresar — mismo motivo por el que `fileUnitFrom` (`detect/testing.ts`)
 * tampoco usa `walkTree` para su propia pila de clases.
 */
function collectLocalDeclarations(fn: FunctionUnit): NamedSite[] {
  const paramsContainer = (fn.node.childForFieldName("parameters") ?? fn.node.childForFieldName("parameter_list")) as AstNode | null;
  const sites: NamedSite[] = [];

  // `suppressed` viaja de PADRE a HIJO durante el descenso: el `modifiers`
  // con `@SuppressWarnings("unused")` de una variable local vive en el
  // CONTENEDOR (`local_variable_declaration`), un nivel arriba del
  // `variable_declarator` que de verdad matchea `isLocalDeclaratorLike` (ver
  // el docstring de `hasSuppressWarningsUnused`) — sin este arrastre, el
  // chequeo nunca vería la anotación desde el nodo que finalmente se reporta.
  const visit = (node: AstNode, suppressed: boolean): void => {
    if (node === paramsContainer) return;
    let childSuppressed = suppressed;
    if (node.isNamed) {
      if (PARAMETER_CONTAINER_TYPES.has(node.type)) return; // cualquier contenedor de parámetros, dondequiera que aparezca — ver PARAMETER_CONTAINER_TYPES
      if (node !== fn.node && fn.sets.functionNodes.has(node.type)) return; // scope de un closure anidado
      childSuppressed = suppressed || hasSuppressWarningsUnused(node);
      if (isLocalDeclaratorLike(node, fn)) {
        const nameNode = declaratorName(node);
        if (nameNode) sites.push({ name: nameNode.text, node: nameNode, suppressed: childSuppressed });
      }
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i) as AstNode | null;
      if (child) visit(child, childSuppressed);
    }
  };

  for (let i = 0; i < fn.node.childCount; i++) {
    const child = fn.node.child(i) as AstNode | null;
    if (child) visit(child, false);
  }
  return sites;
}

/**
 * Tipos de nodo que son, estructuralmente, una REFERENCIA a un nombre ya
 * ligado — no toda declaración de un nombre. `identifier` es la referencia
 * bare universal (parámetro, variable, llamada, lo que sea). El segundo
 * caso es un hallazgo de la propia calibración contra el corpus externo,
 * confirmado por sonda directa: la forma abreviada de un literal de objeto
 * en JS/TS (`{ inc }`, equivalente exacto a `{ inc: inc }`) NO se parsea
 * como `identifier` sino como `shorthand_property_identifier` — un tipo de
 * nodo PROPIO, distinto tanto de `identifier` como de `property_identifier`
 * (el nombre de una propiedad en `obj.prop`, que NO es una referencia a
 * ningún binding y correctamente NO se cuenta acá). Sin esto, toda función
 * que devuelve varios valores con la forma idiomática `return { a, b, c }`
 * (el patrón central de "composables"/hooks en Vue/React) marcaba cada
 * nombre devuelto como "sin uso" — un falso positivo real, no teórico,
 * encontrado corriendo este detector contra el corpus externo (no contra
 * los repos del usuario). `shorthand_property_identifier_pattern` (el
 * espejo de ESTA forma pero del lado de una DESESTRUCTURACIÓN,
 * `const { inc } = obj`) es, en cambio, un sitio de LIGADURA, no de
 * referencia — deliberadamente NO entra acá; entra en la categoría general
 * de "variables locales desestructuradas no cubiertas" del docstring del
 * módulo.
 */
const USAGE_REFERENCE_TYPES = new Set(["identifier", "shorthand_property_identifier"]);

/** Ocurrencias de cada texto que REFERENCIA un nombre ya ligado en TODO el subárbol de `fn` — incluidos los closures anidados, ver "simplificaciones declaradas". */
function countIdentifierOccurrences(fn: FunctionUnit): Map<string, number> {
  const counts = new Map<string, number>();
  walkTree(fn.node, (node) => {
    if (!node.isNamed || !USAGE_REFERENCE_TYPES.has(node.type)) return;
    const text = (node as AstNode).text;
    counts.set(text, (counts.get(text) ?? 0) + 1);
  });
  return counts;
}

function buildFinding(fn: FunctionUnit, site: NamedSite, variant: "parametro" | "variable-local", threshold: Threshold): RawFinding {
  const startLine = site.node.startPosition.row + 1;
  const endLine = site.node.endPosition.row + 1;
  const fnLabel = fn.name ?? "función anónima";
  const isParam = variant === "parametro";

  return {
    variant,
    title: isParam
      ? `Parámetro "${site.name}" sin uso en "${fnLabel}"`
      : `Variable "${site.name}" declarada y nunca usada en "${fnLabel}"`,
    detail: isParam
      ? "El parámetro se declara en la firma pero el cuerpo de la función nunca lo lee: puede ser un resto de una " +
        "refactorización anterior, o directamente un argumento que ya no hace falta pedir."
      : "La variable se declara pero nunca se vuelve a leer: el valor que produce se descarta sin que nada lo use, " +
        "código que ejecuta trabajo cuyo resultado nadie observa.",
    trigger: [{ label: isParam ? "parámetros sin uso" : "variables sin uso", value: 1, threshold }],
    locations: [
      {
        file: fn.file,
        startLine,
        endLine,
        symbol: site.name,
        role: isParam ? "parámetro sin uso" : "variable local sin uso",
      },
    ],
    severity: isParam ? 25 : 35,
    advice: {
      primary: {
        name: "Eliminar la declaración sin uso",
        kind: "refactorizacion",
        why: isParam
          ? "Un parámetro que nadie lee es ruido en la firma: quien llama a la función no puede saber, sin leer su " +
            "cuerpo, que ese argumento no tiene ningún efecto."
          : "Una variable declarada y nunca leída es la forma más simple de código muerto: eliminarla no cambia " +
            "ningún comportamiento observable.",
        source: "https://refactoring.guru/es/smells/dead-code",
      },
    },
  };
}

/**
 * `true` cuando el grafo (si está disponible — ver "OLA N, FRENTE B1b" (G)
 * en el docstring del módulo) confirma que un contrato EXTERNO impone la
 * firma de `fn`. `ctx.graph`/`ctx.graphIndex()` son `null` en pasada 1, con
 * el interruptor de vuelta atrás, o si el build del grafo de esta corrida
 * falló — en los tres casos se degrada a `false` (comportamiento IDÉNTICO a
 * antes de esta ola), nunca se lanza ni se oculta el detector: CONTRATO-
 * UNIFICACION.md §2 exige exactamente esto de un `intra-*` que opta.
 */
function contractImposesSignature(fn: FunctionUnit, ctx: RunContext<ThresholdKey>): boolean {
  const graph = ctx.graph ?? null;
  const index = ctx.graphIndex?.() ?? null;
  if (!graph || !index) return false;
  if (signatureImposedByContract(fn, graph, index)) return true;
  // OLA O, FRENTE N6 — (H) en el docstring del módulo: el contrato que vive
  // AFUERA del repo no deja ninguna arista que seguir, pero sí deja su huella
  // adentro (varias declaraciones independientes de la misma firma exacta).
  return signatureSharedAcrossContainers(fn, graph);
}

export const detector: IntraFunctionDetector<ThresholdKey, "unused-variable"> = {
  id: "unused-variable",
  kind: "unused-variable",
  scope: "intra-function",
  title: "Variable o parámetro sin uso",
  needs: [],
  // OLA N, FRENTE B1b — ver "OLA N, FRENTE B1b" (G) en el docstring del
  // módulo y CONTRATO-UNIFICACION.md. Detector `intra-function` que corre
  // con árbol vivo Y grafo disponible a la vez; sigue siendo correcto sin
  // grafo (ver `contractImposesSignature`, que degrada a `false`).
  needsGraph: true,
  thresholds: {
    // Presencia/ausencia, no magnitud: un único parámetro sin uso ya es el
    // hallazgo completo. SonarSource lo trata igual (S1172 no tiene una
    // propiedad de "cuántos son demasiados"): dispara con el primero.
    unusedParameter: citado(1, {
      work: "SonarSource",
      rule: "S1172",
      url: "https://rules.sonarsource.com/typescript/RSPEC-1172/",
    }),
    // Misma lógica de presencia/ausencia que `unusedParameter`, regla
    // hermana de SonarSource para variables locales.
    unusedLocal: citado(1, {
      work: "SonarSource",
      rule: "S1481",
      url: "https://rules.sonarsource.com/typescript/RSPEC-1481/",
    }),
  },
  run(fn: FunctionUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    // Sin cuerpo: una DECLARACIÓN sin implementación (Java/C# `abstract`,
    // una firma de interfaz) — ver "falsos positivos conocidos" en el
    // docstring. `fn.node` sigue siendo la misma FORMA de nodo que un
    // método real (`sets.functionNodes` clasifica por TIPO, no por
    // instancia — ver `code-grammar.ts`), así que llega hasta acá con
    // `parameters` resuelto pero sin nada de cuerpo que recorrer: no hay
    // "uso" que evaluar, ni con este mecanismo ni con ninguno.
    if (fn.node.childForFieldName("body") === null) return [];

    const occurrences = countIdentifierOccurrences(fn);
    const findings: RawFinding[] = [];

    // Parámetros: suprimidos para función anónima, para una firma
    // autodeclarada como fijada desde afuera (`override`/`virtual`/
    // implementación explícita de interfaz — ver "falsos positivos
    // conocidos"), para un callback de serialización del JDK, para un
    // cuerpo vacío o trivial que ignora TODA su firma (hook de un patrón
    // Adapter/Template Method) — ver "TRES BUGS DE IMPLEMENTACIÓN NUEVOS"
    // (C, D) y `isHookLikeBody` (generalización de D) — para un método Ruby
    // cuyo cuerpo reenvía TODOS sus argumentos vía `super` desnudo (ver
    // "OLA N, FRENTE B1a" (F) y `hasBareSuperForward` en el docstring del
    // módulo) — o, arreglo nuevo de esta ola, para una firma que un
    // contrato EXTERNO impone y que sólo el grafo puede ver (ver "OLA N,
    // FRENTE B1b" (G) y `contractImposesSignature`).
    if (
      fn.name !== null &&
      !hasFixedSignatureMarker(fn.node) &&
      !JAVA_SERIALIZATION_CALLBACK_NAMES.has(fn.name) &&
      !isHookLikeBody(fn, occurrences) &&
      !(fn.language === "ruby" && hasBareSuperForward(fn.node)) &&
      !contractImposesSignature(fn, ctx)
    ) {
      const paramThreshold = ctx.threshold("unusedParameter");
      // El receptor `self`/`cls` de Python (posición cero de un método real)
      // nunca "sobra" — ver "OLA N, FRENTE B1a" (E) en el docstring del
      // módulo. `isMethod` es el mismo dato (`fn.metrics.className`) que
      // `argument-mutation.ts` ya usa para la exención GEMELA de ese
      // detector.
      const isMethod = fn.metrics.className !== null;
      const params = collectParameters(fn);
      for (let i = 0; i < params.length; i++) {
        const site = params[i]!;
        if (isIntentionallyDiscardedName(site.name) || site.suppressed) continue;
        if (i === 0 && isMethod && fn.language === "python" && PYTHON_RECEIVER_NAMES.has(site.name)) continue;
        const remaining = (occurrences.get(site.name) ?? 0) - 1;
        if (remaining > 0) continue;
        findings.push(buildFinding(fn, site, "parametro", paramThreshold));
      }
    }

    const localThreshold = ctx.threshold("unusedLocal");
    for (const site of collectLocalDeclarations(fn)) {
      if (isIntentionallyDiscardedName(site.name) || site.suppressed) continue;
      const remaining = (occurrences.get(site.name) ?? 0) - 1;
      if (remaining > 0) continue;
      findings.push(buildFinding(fn, site, "variable-local", localThreshold));
    }

    return findings;
  },
};
