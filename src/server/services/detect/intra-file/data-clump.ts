/**
 * `data-clump` — Grupo de datos repetido / Data Clumps (PLAN.md §4.1: "el
 * mismo grupo de 3 o más datos aparece junto repetidamente, en firmas, en
 * campos").
 *
 * RELACIÓN: el MISMO conjunto de ≥3 nombres de parámetro (sin importar el
 * orden en que se declaran) aparece en ≥3 firmas de función DISTINTAS del
 * mismo archivo. Fowler (Refactoring, "Data Clumps") describe el olor como
 * "los mismos ítems de datos viajan juntos una y otra vez"; JDeodorant
 * formaliza esa misma heurística sobre parámetros de método. Esta
 * implementación mide exactamente esa pata: repetición de un GRUPO, no el
 * TAMAÑO de una firma individual — ver "NO ES `long-parameter-list`" abajo.
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: los nombres de parámetro se leen del
 * ÁRBOL (campo `parameters`/`parameter_list` de un nodo función-como, ya
 * derivado por `code-grammar.ts`/`FunctionUnit`), nunca de una lista de
 * palabras por lenguaje. `paramName()` resuelve el nombre de UN parámetro con
 * tres pasos, en este orden, los tres genéricos (misma técnica que
 * `extractSuperclass` de `pattern-structural.ts` y que `switchSubjectText` de
 * `repeated-switch.ts`):
 *   1. El nodo mismo es un `identifier` (convención de tipo compartida por
 *      las 7 gramáticas soportadas para "esto es un nombre suelto" — no una
 *      lista de nombres, el tipo de nodo que CADA gramática usa para
 *      cualquier identificador).
 *   2. Alguno de los campos GENÉRICOS `name` / `pattern` / `left` resuelve
 *      (confirmado por sonda directa: `name` en Java `formal_parameter`, Go
 *      `parameter_declaration`, C# `parameter`, Ruby `optional_parameter`/
 *      `splat_parameter`/`keyword_parameter`/`hash_splat_parameter`, Python
 *      `default_parameter`/`typed_default_parameter`; `pattern` en TS/TSX
 *      `required_parameter`/`optional_parameter`; `left` en el
 *      `assignment_pattern` de JS/TS, `p2 = 3`).
 *   3. Si ningún campo resuelve (Python `typed_parameter` sin default no
 *      expone ninguno; los `*args`/`**kwargs` de Python, el `...rest` de
 *      JS/TS tampoco), y el nodo tiene EXACTAMENTE un hijo nombrado que no es
 *      una anotación de tipo (`type`/`type_annotation`), se baja un nivel a
 *      ese único hijo. Confirmado por sonda: así se llega al `identifier`
 *      dentro de `list_splat_pattern`/`dictionary_splat_pattern` (Python) y
 *      de `rest_pattern` (JS/TS).
 *
 * Un parámetro que NO resuelve por ninguna de las tres vías (el caso real:
 * desestructuración de OBJETO/ARRAY — `function f({a, b, c})`, `def f((a,
 * b))` — que expone MÁS de un hijo nombrado sin campo que los distinga)
 * inutiliza TODA la firma para esta agrupación: mejor no agrupar que agrupar
 * con un nombre inventado o un grupo incompleto. Ver "LÍMITES DECLARADOS"
 * abajo.
 *
 * NO ES `long-parameter-list`: ese detector (todavía dentro de
 * `code-analyzer.ts`) mide el TAMAÑO de UNA firma contra un umbral fijo —
 * dispara con una sola función de 7 parámetros DISTINTOS, sin que se repitan
 * en ningún otro lado. `data-clump` mide lo contrario: el MISMO grupo de
 * datos repetido en firmas SEPARADAS — una función con 7 parámetros que no
 * comparte ninguno con otra no es un data clump, y tres funciones de 3
 * parámetros cada una que repiten exactamente ("nombre", "email",
 * "telefono") sí lo son aunque cada una, individualmente, esté lejos del
 * umbral de exceso de parámetros. Ambos pueden coexistir sobre el mismo
 * archivo sin pisarse: cada uno mide una cosa distinta del mismo dato crudo
 * (los parámetros), con su propio umbral y su propia fuente.
 *
 * SIMPLIFICACIONES DECLARADAS: Fowler describe el olor tanto en FIRMAS de
 * función como en CAMPOS de clase que viajan juntos ("bunches of data...
 * sitting in fields in a couple of classes"). Esta ola mide sólo la pata de
 * FIRMAS: un extractor genérico de "campos de instancia declarados" no
 * existe todavía en `code-grammar.ts`/`DerivedNodeSets` (los campos de una
 * clase se declaran con formas por-gramática que no comparten un campo
 * estructural único, a diferencia de `parameters`/`parameter_list` de una
 * función) y construirlo es trabajo de extractor, no de este detector — la
 * misma distinción que `large-class.ts` traza para TCC/ATFD. Declarado, no
 * escondido.
 *
 * LÍMITES DECLARADOS POR LENGUAJE: ninguno de los 7 lenguajes soportados
 * queda fuera de esta agrupación (todos tienen parámetros con nombre en
 * alguna forma), así que `needs: []`. El límite real no es por lenguaje sino
 * por FORMA de parámetro: la desestructuración de objeto/array de JS/TS/Vue
 * (`{a, b, c}`, `[a, b]`) nunca resuelve un nombre único (paso 3 exige
 * EXACTAMENTE un hijo nombrado; una desestructuración tiene varios) y por lo
 * tanto esa firma completa queda fuera de esta agrupación — ver el test que
 * lo documenta.
 *
 * FALSOS POSITIVOS CONOCIDOS (qué forma legítima se confunde con esto):
 *   - Conformidad de interfaz / Strategy / Visitor: varias implementaciones
 *     hermanas de un mismo método de interfaz comparten, por CONTRATO, la
 *     misma firma (`render(props, state, context)` en tres estrategias de
 *     render distintas dentro de un archivo). La repetición viene de un
 *     contrato explícito, no de datos contrabandeados: el remedio de Fowler
 *     (Introduce Parameter Object) no aplica — cambiar la firma exige tocar
 *     la interfaz entera, que es justo lo que el contrato quiere evitar.
 *   - Fluent/builder API: métodos encadenados que a propósito repiten un
 *     subconjunto de parámetros (`withX(a, b, c)`, `andY(a, b, c)`) para
 *     mantener una firma uniforme y previsible en la cadena — diseño
 *     deliberado, no smell.
 *   - Fixtures de test / inyección de dependencias: muchas funciones de test
 *     en el mismo archivo tomando `(client, db, user)` vía fixture del
 *     framework — el grupo viaja junto porque el framework lo inyecta así,
 *     no porque debiera vivir en una clase propia.
 *   - Firmas de handler impuestas por un framework: `(req, res, next)` de
 *     middleware, `(event, context, callback)` de una función serverless,
 *     repetidas en cada handler del archivo — la forma la fija el framework,
 *     no el diseño del código. Cuando los nombres de función SÍ difieren
 *     entre ocurrencias (`show_version`/`show_help` en click, cada uno
 *     asignado como `callback=` de una opción distinta), esta forma NO se
 *     puede distinguir estructuralmente de un data clump orgánico sin saber
 *     que existe un framework externo dictando la forma — queda sin
 *     arreglo, declarado (ver "SIGUE ABIERTO" abajo).
 *
 * OLA DE PRECISIÓN (medida: 5/19 = 26 % antes de esta ola → 7/21 = 33 %
 * después, muestra estratificada `tests/golden/precision`, fresca sobre 4
 * lenguajes reales — java 5/9 (56 %), csharp 1/3, python 1/7 (14 %) —)
 * — confirmado por RE-MUESTREO real post-arreglo, no sólo por lectura de
 * código: de las 16 filas "falso" ya juzgadas antes de esta ola, 12 YA NO SE
 * EMITEN (`stillPresent=false` al re-correr el analizador sobre el MISMO
 * código, sin tocar ningún archivo fuente de los repos): click `_clamp`/
 * `command`/`get_metavar`/`shell_complete`/`prompt`/`__call__`/
 * `format_usage`, Newtonsoft `WriteJson`/`CreateXmlDocumentType`, Guava
 * `verify`/`checkArgument`, y — sobre un TERCER corpus, sqlalchemy (Python)
 * — las 11 ocurrencias `__get__`/`_soft_close`/`_set_parent`/`__init__`/
 * `adapt`/`_load_for_state`/`_invoke_user_fn`/`do_savepoint`/
 * `_format_description` con la forma `(self, <2 datos reales>)`. Las 2
 * únicas "falso" que sobreviven son exactamente el caso declarado sin
 * arreglo abajo (`callback` en click). El precio de la precisión ganada:
 * python cae a 14 % (1/7) porque, sacado el ruido de `self` y de
 * overloads, lo que queda mayoritariamente vivo en el corpus muestreado es
 * la MISMA "conformidad de interfaz con nombres distintos" que el módulo ya
 * declaraba sin arreglo desde el principio (visitor methods de
 * sqlalchemy/compiler.py, familias `get_X_options` de Dialect, helpers de
 * test tipo `eq_`/`ne_`/`le_` con firma uniforme a propósito) — ningún
 * arreglo de ESTA ola la toca, ver "SIGUE ABIERTO" abajo —
 * DOS ARREGLOS ESTRUCTURALES, los dos por BUG DE IMPLEMENTACIÓN (el
 * concepto de Fowler está bien; lo que faltaba era limpiar la señal antes de
 * agrupar), no por redefinición del smell:
 *
 *   1. `self`/`this` NUNCA es un dato del grupo. Python (a diferencia de
 *      Ruby/JS/TS/Java/Go/C#) declara el receptor EXPLÍCITAMENTE como el
 *      PRIMER parámetro de la lista (`def get_metavar(self, param, ctx)`) —
 *      confirmado por sonda: es un `identifier` normal, estructuralmente
 *      indistinguible de un parámetro real. Sin filtrarlo, CADA método de
 *      instancia arrastra un miembro extra, universal y sin ningún valor de
 *      dato, que infla artificialmente el tamaño de cualquier grupo real de
 *      2 parámetros hasta cruzar `minGroupSize` (3). Medido real: click
 *      (Python) `get_metavar`/`get_missing_message` — grupo reportado
 *      `(self, param, ctx)`, tamaño 3 — es en realidad `(param, ctx)`,
 *      tamaño 2, por debajo del piso de Fowler; click `format_usage`/
 *      `format_options`/`format_epilog` — grupo `(self, ctx, formatter)` es
 *      en realidad `(ctx, formatter)`, tamaño 2. `paramNames` ahora omite el
 *      PRIMER parámetro cuando su nombre resuelto es exactamente `self` o
 *      `this` (mismo vocabulario mínimo de 2 palabras que ya usan
 *      `lazy-init-repetida.ts`/`manual-notification.ts`/
 *      `flag-accumulator.ts`/`homonymous-delegation.ts` — no una lista por
 *      lenguaje, un identificador de receptor reconocido en todo el
 *      proyecto). Restringido a la PRIMERA posición para no confundir un
 *      parámetro de negocio que casualmente se llame `self` más adelante en
 *      la lista (caso no visto en el corpus, pero barato de descartar).
 *
 *   2. Un grupo necesita ≥`minRepeats` OPERACIONES DISTINTAS, no sólo
 *      ≥`minRepeats` ocurrencias — contar OCURRENCIAS (firmas) sin mirar si
 *      varias comparten nombre de función/método deja pasar la MISMA
 *      operación lógica, declarada varias veces, como si fueran "N
 *      operaciones independientes que casualmente comparten datos" (la
 *      definición real de Fowler). Confirmado en DOS formas por sonda
 *      directa contra código real, y una TERCERA encontrada recién al medir
 *      contra el corpus tras la primera versión de este arreglo (ver
 *      "encontrado al medir" abajo):
 *      (a) sobrecarga del MISMO nombre en el MISMO scope — por aridad
 *      (Guava `Preconditions.checkArgument(expression, errorMessageTemplate,
 *      p1)` repetido en 8 firmas, `Verify.verify(...)` en 16: el idioma de
 *      Guava para simular varargs sin boxing, cada overload añade un `pN`
 *      con el MISMO nombre por convención) o por tipo (Python `@t.overload`
 *      apilado, stubs de tipado sin cuerpo ejecutable — Python EXIGE repetir
 *      la firma completa por cada overload, no hay "Extract Parameter
 *      Object" posible sobre un stub);
 *      (b) el MISMO método sobrescrito bajo el MISMO nombre por varias
 *      clases hermanas del archivo, implementando el mismo protocolo
 *      (click `ParamType.__call__`/`.shell_complete`, repetidos por cada
 *      subclase de tipo en `types.py`; Newtonsoft.Json `WriteJson`/
 *      `CreateXmlDocumentType`, un override por cada convertidor concreto);
 *      (c) ENCONTRADO AL MEDIR: dos (o más) operaciones DISTINTAS, cada una
 *      sobrecargada por separado, cuyas ocurrencias se SUMAN al mismo grupo
 *      sin que ninguna sola llegue al piso — click `command`/`group`
 *      (`decorators.py`): dos decoradores casi gemelos, CADA UNO con 4
 *      variantes `@t.overload` que comparten el grupo `(name, cls, attrs)`
 *      — 8 ocurrencias totales, pero sólo 2 nombres de operación DISTINTOS
 *      (4 "command" + 4 "group"), ninguno de los dos con las 3 repeticiones
 *      propias que exige `minRepeats` por sí solo. Una regla que sólo
 *      descarta "TODAS las ocurrencias comparten el mismo nombre" no ve
 *      esto (hay DOS nombres, no uno) — hace falta contar nombres
 *      DISTINTOS, no sólo preguntar si son todos iguales.
 *      En LOS TRES casos, "Introduce Parameter Object" o bien no aplica (una
 *      sobrecarga por aridad/tipo pierde su propósito si se empaqueta en un
 *      objeto) o bien exige tocar la interfaz entera que el contrato quiere
 *      preservar — la MISMA razón que ya excluía la "Conformidad de
 *      interfaz" documentada arriba, ahora detectable ESTRUCTURALMENTE (sin
 *      conocer el nombre de ninguna interfaz) porque el síntoma compartido
 *      de las tres formas es: nunca hay ≥`minRepeats` operaciones CON
 *      NOMBRE DISTINTO en el grupo.
 *
 *      TRADE-OFF DECLARADO: esta regla también descarta el caso RARO donde
 *      el mismo nombre se repite por overload/override Y el grupo SÍ es un
 *      candidato genuino a Parameter Object (medido: Guava
 *      `Maps`/`TreeRangeSet#subMap(fromKey, fromInclusive, toKey,
 *      toInclusive)`, mandado por la interfaz `NavigableMap` pero con un
 *      candidato real ya existente en el propio código — `Range`). Aceptado
 *      a propósito: de los casos con nombre repetido juzgados en el corpus,
 *      la abrumadora mayoría (sobrecarga por aridad/tipo, overrides de
 *      protocolo sin valor propio) es ruido, y separar "override con valor
 *      real" de "override sin valor real" exigiría saber si YA existe un
 *      tipo candidato en el codebase — información que un detector
 *      estructural sobre un solo archivo no tiene.
 *
 * SIGUE ABIERTO (no arreglado esta ola, declarado, y confirmado como la
 * causa DOMINANTE de lo que queda falso tras los dos arreglos — medido:
 * python cae a 14 % con esto como casi toda la población viva): la
 * "Conformidad de interfaz / Strategy / Visitor" YA documentada arriba,
 * en su variante con ≥`minRepeats` nombres DISTINTOS — que la regla 2 no
 * puede tocar porque su señal es justamente "hay pocos nombres distintos".
 * Confirmado en DOS formas adicionales, sobre un tercer corpus (sqlalchemy,
 * Python) más allá de click/Guava/Newtonsoft:
 *   - Familia de métodos Visitor con nombre DISTINTO por cada rama pero
 *     firma idéntica por CONTRATO del protocolo de visita
 *     (`sql/compiler.py`: `visit_truediv_binary`/`visit_floordiv_binary`/
 *     `visit_not_match_op_binary`/... , todos `(binary, operator, **kw)`).
 *   - Familia de métodos de una interfaz de Dialect implementada por cada
 *     backend (`get_table_options`/`get_multi_table_options`, cada
 *     dialecto — postgresql/oracle/mysql/mssql — con su propia variante).
 *   - Firma de callback impuesta por un framework EXTERNO cuando los
 *     nombres de función SÍ difieren entre ocurrencias (click:
 *     `callback`/`show_version`/`show_help`, las tres asignadas como
 *     `callback=` de una opción).
 * Las tres comparten la misma imposibilidad estructural: saber que N
 * nombres de método DISTINTOS son en realidad las N variantes de UN mismo
 * contrato (una interfaz, un protocolo de visita, una API externa) exige
 * resolver esa interfaz/protocolo/import — información de OTRO archivo (la
 * declaración de la interfaz, el paquete externo) que un detector
 * intra-archivo, por diseño, no tiene. Intentarlo con una heurística
 * puramente léxica (¿comparten prefijo los nombres, tipo `visit_`/`get_`?)
 * se descartó a propósito: es exactamente el "atajo por vocabulario" que
 * este módulo prohíbe, y además arriesgaría un nuevo falso negativo sobre
 * cualquier data clump real cuyos nombres coincidan por casualidad en un
 * prefijo común. Este caso queda sin arreglo estructural conocido dentro
 * del alcance de un detector de un solo archivo.
 *

 * ARREGLO 4 (Ola AW, frente AW5) — UNA FIRMA SIN CUERPO NO ES UNA OPERACIÓN.
 * De las 86 filas vivas juzgadas a mano de este detector (15 verdaderas,
 * 17,4 %), la familia de falsos más barata de cerrar es la DECLARACIÓN
 * repetida: los `@t.overload` apilados de Python (`AsyncSession.execute`, 14
 * firmas en `ext/asyncio/scoping.py`), los métodos de una INTERFAZ declarada
 * en el archivo (`LinkRenderer`/`RenderLink` en `hugo/markup/converter/hooks/
 * hooks.go`, 6 firmas), y los métodos abstractos sin cuerpo. La regla 2 de
 * arriba (≥`minRepeats` NOMBRES distintos) no los ve cuando los nombres SÍ
 * difieren. El hecho que los separa está en el árbol y se comprueba abriendo
 * el archivo: **la firma no tiene cuerpo ejecutable** — sin cuerpo no hay una
 * operación que use el grupo, hay una re-declaración del contrato. "Introduce
 * Parameter Object" sobre un stub no refactoriza nada: no hay código que
 * cambiar.
 *
 * ARREGLO 5 — CONSTRUIDO, MEDIDO Y **REFUTADO**, con su número. Se probó un
 * segundo excluidor: "reenviar el grupo ENTERO y VERBATIM a otra llamada es
 * plomería, no una operación" — el `super(...)` de un constructor de subclase
 * (guava `StrongEntry`, `WrappedCollection`, `FlatMapSpliteratorOfObject`), el
 * wrapper que delega (`hugo/hugolib/doctree/treeshifttree.go#WalkPrefix` →
 * `t.tree().WalkPrefix(lockType, s, f)`), los cuatro niveles de log de jekyll
 * (`debug`/`info`/`warn`/`error` → `write(:level, topic, message, &block)`),
 * `_run_coroutine_function(fn, args, kwargs)` → `fn(*args, **kwargs)`. El
 * arreglo 3 no podía verlos ni en principio: exige reenvío hacia >= 2 hermanos
 * del mismo grupo, y `calleeNameOf` devuelve `null` para `super`.
 *
 * MEDIDO sobre 18 repos (23.225 hallazgos de nivel 1) y contra las 85 filas
 * vivas del banco que el volcado re-encuentra: retira **93 de 288** grupos
 * (32,3 %). **Y NO SE CONECTÓ, por dos razones independientes, cada una
 * suficiente:**
 *   1. **EMPEORA LA PRECISIÓN Y CORTA 6 DE LAS 15 VERDADERAS.** 17,6 %
 *      (15/85) → **15,5 %** (9/58). Las seis: `sqlalchemy/orm/persistence.py:
 *      167`, `guava/cache/LocalCache.java:1189` (`WeakEntry`),
 *      `testing/FreshValueGenerator.java:890`, `reflect/ClassPath.java:209` y
 *      las DOS de `collect/StandardTable.java` (la tripleta canónica
 *      `(rowKey, columnKey, value)` de `Table`).
 *   2. **MUEVE UN PATRÓN CONGELADO.** `Builder` toma `data-clump` como ancla
 *      (`hypotheses/builder.ts`) y sus propuestas pasan de **11 a 7**. Con el
 *      arreglo 4 solo se quedan en **11**.
 *
 * LA LECCIÓN, que vale más que el excluidor: **con `minRepeats = 3`, un grupo
 * que tiene EXACTAMENTE 3 ocurrencias muere si se le descuenta UNA.**
 * `StandardTable` tiene 3 ocurrencias y 1 reenvío. Cualquier excluidor que
 * RESTE ocurrencias es desproporcionadamente destructivo justo en el piso, que
 * es donde vive buena parte de lo verdadero — el arreglo 4 se salva sólo
 * porque su población (firmas sin cuerpo) casi nunca convive con el piso.
 *
 * El código exacto está en `ola-aw/informes/AW5.md` §5.2 y el árbol que lo
 * lleva puesto y verde en `scratchpad-aw5/src1-con-arreglo5/`, para que la
 * próxima ola no lo re-invente: la medición es el activo, no las 40 líneas.
 *
 * EL ARREGLO 4 ES SUSTRACTIVO Y SE APLICA AL CONTEO DE OCURRENCIAS, no al
 * hallazgo entero: una ocurrencia stub deja de contar como repetición y como
 * nombre de operación distinto; si lo que queda sigue llegando a `minRepeats`
 * por las dos vías, el grupo se emite igual.
 *
 * LO QUE ESTE ARREGLO NO TOCA, declarado y medido: la familia dominante
 * de los falsos que quedan (≈68 % de los 71) es CONFORMIDAD DE CONTRATO con
 * ≥3 nombres distintos y cuerpo real — `(req, res, next)` de Express,
 * `(target, key, descriptor)` de un decorador de TS, `(w, source, node,
 * entering)` de goldmark, `(path, info, err)` de `filepath.WalkFunc`,
 * `(ctx, cd, r, args)` de simplecobra, la familia `visit_X_binary` del
 * compilador de sqlalchemy, `(a, b, msg)` de los helpers de aserto. La
 * evidencia de que la firma viene impuesta vive en OTRO archivo (la
 * declaración de la interfaz) o en el paquete externo, y este detector es
 * `intra-file`. Es el mismo límite que el módulo ya declaraba en "SIGUE
 * ABIERTO"; AW5 lo confirma con 71 falsos abiertos a mano en 6 lenguajes en
 * vez de con una muestra chica.
 *
 * RE-MEDICIÓN (frente de precisión, agosto 2026) — MISMA CAUSA, CONFIRMADA
 * FUERA DE PYTHON, SIN ARREGLO DE CÓDIGO ESTA PASADA. La planilla de
 * `tests/golden/precision` tenía sólo 21 filas juzgadas de `data-clump`
 * (33 %, `n` chico) — se amplió a 96 juzgadas (java 29, python 32, go 14,
 * ruby 9, typescript 8, csharp 3), leyendo el código real de cada caso, NO
 * sólo el título. **La precisión medida cae a 14 % (13/96)** — no porque el
 * detector haya cambiado (ningún arreglo de código en esta pasada), sino
 * porque la muestra anterior era demasiado chica para ver la población real:
 * la categoría "Conformidad de interfaz / Strategy / Visitor" de arriba
 * **no es un fenómeno de Python** — domina TAMBIÉN en java, go, ruby y
 * typescript, con la MISMA imposibilidad estructural (resolver el contrato
 * exige información de otro archivo o del lenguaje mismo), en formas nuevas:
 *   - **Firma mandada por el LENGUAJE, no por una librería**: decoradores de
 *     TypeScript — `(target, key, descriptor)`/`(target, key, index)` son la
 *     forma EXACTA que la especificación del lenguaje exige para todo
 *     decorador de método/parámetro (`nest/packages/microservices/decorators/
 *     message-pattern.decorator.ts:67`, `nest/packages/common/decorators/
 *     http/route-params.decorator.ts:49`).
 *   - **Firma mandada por una librería externa, confirmada en 3 ecosistemas
 *     más**: middleware Express `(req, res, next)`
 *     (`nest/packages/platform-express/adapters/express-adapter.ts:69`, ya
 *     documentado arriba como caso conocido); `filepath.WalkFunc` de la
 *     stdlib de Go, forma `(path, info, err)`
 *     (`hugo/hugolib/integrationtest_builder.go:411`); el contrato
 *     `NodeRenderer` de goldmark, forma `(w, source, node, entering)`
 *     (`hugo/markup/goldmark/render_hooks.go:126`, repetido 10 veces en el
 *     mismo archivo — el conteo alto es la firma, no la excepción).
 *   - **UN DESPACHADOR Y SUS VARIANTES — patrón nuevo, con nombre propio,
 *     confirmado en 3 lenguajes**: una función `A` con nombres DISTINTOS de
 *     `B`/`C`/`D` que sólo REENVÍA sus propios parámetros a exactamente una
 *     de ellas según una condición — no N operaciones independientes que
 *     comparten datos por casualidad, sino UNA operación con N
 *     implementaciones alternativas. Verificado abriendo el código en los
 *     tres casos: RuboCop `IndentationWidth#message` reenvía a
 *     `message_for_tabs`/`message_for_spaces`
 *     (`rubocop/lib/rubocop/cop/layout/indentation_width.rb:347,354`); NestJS
 *     `Module#addCustomProvider` reenvía a `addCustomClass`/`addCustomValue`/
 *     `addCustomFactory`/`addCustomUseExisting`, las 4 con la MISMA firma
 *     `(provider, collection, enhancerSubtype)`
 *     (`nest/packages/core/injector/module.ts:305,315,317,319,321`); Guava
 *     declara una FAMILIA DE CONSTRUCTORES que delega a `super(...)` con la
 *     MISMA forma exacta hacia arriba en la jerarquía (`AbstractWeakKeyEntry`
 *     → `WeakKeyDummyValueEntry`/`WeakKeyStrongValueEntry`/..., `guava/src/
 *     com/google/common/collect/MapMakerInternalMap.java:670,696`). Un
 *     despachador SÍ es estructuralmente distinguible sin vocabulario — a
 *     diferencia de la conformidad de interfaz "a distancia" (que exige
 *     resolver una declaración en OTRO archivo), acá la LLAMADA de una
 *     ocurrencia a otra vive DENTRO del mismo archivo, visible recorriendo
 *     hacia ABAJO desde cada `FunctionUnit.node` (nunca hace falta
 *     `.parent()`) — **IMPLEMENTADO como arreglo 3, ver más abajo.**
 *   - **El triple canónico de Guava `Table<R,C,V>` SIGUE siendo el contra-
 *     ejemplo real**: `(rowKey, columnKey, value)` repetido entre
 *     `StandardTable.put`/`ImmutableTable.of`/`Tables.immutableCell` (java,
 *     `guava/src/com/google/common/collect/StandardTable.java:154`) se juzgó
 *     VERDADERO — Guava ya tiene `Table.Cell` como Parameter Object real para
 *     este triple, y ninguna interfaz obliga esos 3 nombres de operación
 *     DISTINTOS a compartir la firma. Confirma que la regla 2 sigue
 *     discriminando bien cuando el candidato es genuino: el problema no es
 *     el arreglo, es la población de despachadores/protocolos que queda del
 *     otro lado, ahora medida en 5 lenguajes en vez de 1.
 *
 * ARREGLO 3 — "UN DESPACHADOR Y SUS VARIANTES", IMPLEMENTADO (frente A5a,
 * agosto 2026), completando lo que la sección anterior dejó nombrado sin
 * código. `isDispatcherGroup` (más abajo) excluye un grupo entero cuando AL
 * MENOS una ocurrencia invoca, dentro de su propio cuerpo, a DOS O MÁS
 * nombres de operación DISTINTOS de OTRAS ocurrencias del MISMO grupo,
 * reenviándoles al menos uno de los parámetros del grupo como argumento.
 * Nunca un nombre de nodo por lenguaje: `isCallShaped` reutiliza el MISMO
 * vocabulario que `argument-mutation.ts#CALL_TOKENS` ya valida en este
 * proyecto (tipo de nodo partido por `_`, ¿incluye `call` o `invocation`?) —
 * cubre `call_expression`/`call` (JS/TS/Vue/Go/Ruby/Python) e
 * `invocation_expression`/`method_invocation` (C#/Java) por igual, sin tabla
 * ad-hoc nueva. `calleeNameOf` resuelve el nombre invocado por los mismos
 * campos genéricos que ya usan `demeter-chain.ts` (`ACCESSED_NAME_FIELDS`) y
 * `homonymous-delegation.ts` para el mismo propósito en otro contexto.
 *
 * VERIFICADO POR SONDA CONTRA CÓDIGO REAL (no sólo por lectura): los dos
 * casos de la sección anterior, ejercitados en el test de este módulo
 * reproduciendo la forma exacta —
 *   - RuboCop `IndentationWidth#message(configured_indentation_width,
 *     indentation, name)` → `if using_tabs? / message_for_tabs(...) / else /
 *     message_for_spaces(...)` (`rubocop/lib/rubocop/cop/layout/
 *     indentation_width.rb:352-358`): 2 siblings invocados, EXCLUIDO.
 *   - NestJS `Module#addCustomProvider(provider, collection, enhancerSubtype)`
 *     → cadena de `if/else if` que invoca UNA de `addCustomClass`/
 *     `addCustomValue`/`addCustomFactory`/`addCustomUseExisting`
 *     (`nest/packages/core/injector/module.ts:313-321`): 4 siblings
 *     invocados, EXCLUIDO.
 *
 * EL PISO ES DELIBERADAMENTE ≥2, NO ≥1 — verificado que ≥1 rompería el ÚNICO
 * `verdadero` confirmado del catálogo: Guava `StandardTable.removeMapping`
 * llama `containsMapping(rowKey, columnKey, value)`
 * (`guava/src/com/google/common/collect/StandardTable.java:207`) — reenvía
 * TODO el grupo a UN SOLO sibling, pero como un paso normal de SU PROPIA
 * lógica (comprobar antes de borrar), nunca alternando con `put`. Con el
 * piso en 1 este arreglo hubiera excluido ese grupo — con el piso en 2, no
 * lo toca (test de control en el módulo de test, "reenvío a UN SOLO
 * sibling... sigue disparando"). Se exige además que la llamada REENVÍE al
 * menos un parámetro del grupo (no sólo que nombre a un sibling) — otro test
 * de control confirma que 2 siblings invocados con argumentos NO
 * relacionados con el grupo siguen disparando el hallazgo.
 *
 * LÍMITE DECLARADO, A PROPÓSITO — NO CUBIERTO: la delegación de CONSTRUCTOR
 * hacia `super(...)` (el tercer ejemplo de la sección anterior, familia
 * `AbstractWeakKeyEntry` de Guava, y 7 de los 19 falsos re-juzgados en java
 * esta misma pasada — ver más abajo) NO dispara este arreglo. `super(...)`
 * en Java es un `explicit_constructor_invocation` (matchea `isCallShaped` por
 * el token `invocation`) pero su callee es la palabra clave `super`, no un
 * identificador con campo `name`/`method`/`function` resoluble a un nombre
 * de OPERACIÓN del grupo (las operaciones del grupo son nombres de
 * CONSTRUCTOR, uno por clase de la jerarquía — `WeakKeyDummyValueEntry`,
 * `LinkedWeakKeyDummyValueEntry`, ninguno literalmente "super") —
 * `calleeNameOf` devuelve `null` ahí a propósito, nunca inventa un nombre.
 * Cubrirlo exigiría reconocer "llamada de constructor a la superclase" como
 * una FORMA aparte (no una coincidencia de nombre), verificada por sonda en
 * las gramáticas que tienen herencia de clase real (Java/C#/TS/Ruby/Python —
 * Go no tiene `super`) — no se intentó esta pasada por el mismo motivo que
 * ya declaraba la sección anterior: verificarlo con el rigor de sonda que
 * este proyecto exige es trabajo real, no una línea. Queda para la próxima.
 *
 * RE-MUESTREO DE VOLUMEN (frente A5a, agosto 2026), SOBRE EL CÓDIGO YA CON
 * LOS ARREGLOS 1+2 (no arreglo 3 — se corrió ANTES de escribirlo, para medir
 * su punto de partida): se re-juzgaron a mano 78 hallazgos ADICIONALES de
 * `data-clump` (java 19, python 25, go+ruby+typescript 34 combinados),
 * ampliando la planilla de `tests/golden/precision` de 96 a 135 filas
 * juzgadas totales (falso 94, dudoso 26, verdadero 15 — **11 % de precisión,
 * 15/135**). CONFIRMA la misma causa dominante que "RE-MEDICIÓN" ya
 * documentaba, ahora con evidencia directa en LOS CINCO LENGUAJES, no sólo
 * java/python/typescript: la delegación de constructor por jerarquía (Guava,
 * 7 de 19 falsos java — `StrongEntry`/`WeakKeyDummyValueEntry`/
 * `LinkedStrongKeyStrongValueEntry`/`WrappedCollection`/
 * `FlatMapSpliteratorOfObject`, ver arriba, NO cubierta por el arreglo 3), la
 * conformidad de protocolo/framework en go (`filepath.WalkFunc`,
 * `simplecobra.Commandeer` repetido en 4 archivos de comandos de Cobra,
 * `goldmark.NodeRenderer`/`LinkRenderer`), en ruby (vocabulario interno de
 * autocorrección de RuboCop — `corrector`+`node` fluyendo por convención
 * entre helpers privados de un mismo Cop) y en typescript (decoradores
 * mandados por el LENGUAJE, middleware Express, `AbstractHttpAdapter` de
 * NestJS). Precisión ligeramente por debajo del 14 % (13/96) previo — **no es
 * una regresión de los arreglos 1+2** (ningún arreglo de código entre una
 * medición y la otra, mismo motivo que "RE-MEDICIÓN"): la muestra creció y
 * siguió revelando la MISMA población de falsos ya diagnosticada, en más
 * lenguajes. El arreglo 3 (implementado DESPUÉS de este muestreo) reduce una
 * porción real pero acotada de esa población — el remanente dominante
 * (conformidad de protocolo "a distancia" + delegación de constructor) sigue
 * sin arreglo estructural conocido dentro del alcance de un detector
 * intra-archivo, ver "SIGUE ABIERTO" arriba y el límite declarado del
 * arreglo 3.
 */
import { citado } from "../thresholds.js";
import { walkTree } from "../tree-walk.js";
import type { AstNode, FileUnit, FunctionUnit, IntraFileDetector, RawFinding, RunContext } from "../types.js";

type ThresholdKey = "minGroupSize" | "minRepeats";

/** Tipos de nodo que una anotación de tipo puede tomar como hijo del propio
 *  parámetro — excluidos al buscar el único hijo "de nombre" restante (paso 3
 *  de `paramName`), para no confundir el nombre del TIPO con el del dato. */
const TYPE_CHILD_TYPES = new Set(["type", "type_annotation"]);

/** Campos genéricos, en orden de prioridad, que distintas gramáticas usan
 *  para resolver el nombre de un nodo-parámetro envuelto — ver el docstring
 *  del módulo, paso 2. */
const NAME_FIELDS = ["name", "pattern", "left"] as const;

/**
 * Nombre de UN parámetro, o `null` si esta forma no se puede resolver con
 * confianza (ver el docstring del módulo). Nunca decide por texto de
 * programa: sólo tipo de nodo (`identifier`, convención de las 7 gramáticas)
 * y campos genéricos / forma (un único hijo nombrado no-tipo).
 */
function paramName(node: AstNode): string | null {
  if (node.type === "identifier") return node.text.trim() || null;

  for (const field of NAME_FIELDS) {
    const named = node.childForFieldName(field) as AstNode | null;
    if (!named) continue;
    const resolved = paramName(named);
    if (resolved) return resolved;
  }

  const namedChildren: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i) as AstNode | null;
    if (child && child.isNamed && !TYPE_CHILD_TYPES.has(child.type)) namedChildren.push(child);
  }
  const only = namedChildren.length === 1 ? namedChildren[0] : undefined;
  return only ? paramName(only) : null;
}

/** Nodos hijos de una lista de parámetros que son de verdad un parámetro
 *  (no puntuación) — mismo criterio que `countParameters` de
 *  `code-analyzer.ts`, reusado por forma (no importado: ese archivo no es de
 *  este detector y no expone esta función). */
const PARAM_LIKE = /identifier|parameter|pattern/;

/** El receptor propio (`self`/`this`) nunca es un DATO — ver el docstring
 *  del módulo, arreglo 1. Mismo vocabulario mínimo de 2 palabras que ya usan
 *  `lazy-init-repetida.ts`/`manual-notification.ts`/`flag-accumulator.ts`/
 *  `homonymous-delegation.ts` en este mismo proyecto. */
const SELF_WORDS = new Set(["this", "self"]);

/**
 * Todos los nombres de parámetro de una función, o `null` si la lista está
 * vacía (una vez descartado el receptor) o si AL MENOS UNO de sus
 * parámetros no se puede nombrar con confianza (desestructuración de
 * objeto/array — ver el docstring del módulo). Un grupo parcial es peor que
 * ninguno: este detector nunca fabrica un grupo a partir de sólo los
 * parámetros que logró nombrar.
 *
 * El PRIMER parámetro resuelto se omite (no cuenta como dato, pero tampoco
 * invalida la firma) si su nombre es exactamente `self`/`this` — el
 * receptor explícito que Python antepone a todo método de instancia. Sólo
 * la primera posición: un parámetro de negocio más adelante en la lista que
 * casualmente se llame `self` sigue contando como dato real.
 */
function paramNames(fnNode: AstNode): readonly string[] | null {
  const params =
    fnNode.childForFieldName("parameters") ?? fnNode.childForFieldName("parameter_list");
  if (!params) return null;

  const names: string[] = [];
  let position = 0;
  for (let i = 0; i < params.childCount; i++) {
    const child = params.child(i) as AstNode | null;
    if (!child || !PARAM_LIKE.test(child.type)) continue;
    const name = paramName(child);
    if (name === null) return null;
    const isReceiver = position === 0 && SELF_WORDS.has(name);
    if (!isReceiver) names.push(name);
    position++;
  }
  return names.length > 0 ? names : null;
}

interface GroupOccurrence {
  /** Nombres únicos, en el orden de la PRIMERA firma que formó el grupo. */
  orderedNames: readonly string[];
  fn: FunctionUnit;
}

/**
 * Arreglo 3 — "UN DESPACHADOR Y SUS VARIANTES" (ver el docstring del módulo,
 * sección homónima): nunca un nombre de nodo por lenguaje, mismo vocabulario
 * ya validado en este proyecto (`argument-mutation.ts#CALL_TOKENS`) — un nodo
 * es una LLAMADA cuando su tipo, partido por `_`, incluye el token `call`
 * (`call_expression` JS/TS/Vue/Go, `call` Ruby/Python) o `invocation`
 * (`method_invocation`/`explicit_constructor_invocation` Java,
 * `invocation_expression` C#).
 */
const CALL_TOKENS = new Set(["call", "invocation"]);
function isCallShaped(node: AstNode): boolean {
  return node.type.split("_").some((token) => CALL_TOKENS.has(token));
}

/**
 * Campos GENÉRICOS bajo los que una llamada expone su callee, en orden de
 * prioridad — `method` (Ruby `call`, funciona con o sin receptor), `name`
 * (Java `method_invocation`), `function` (JS/TS/Vue/Go/Python/C#, misma
 * técnica que `demeter-chain.ts#CALLEE_FIELD`). Cuando `function` resuelve a
 * un nodo de ACCESO (`this.addCustomClass`, no un `identifier` suelto) baja
 * un nivel con los mismos campos genéricos de nombre accedido que
 * `demeter-chain.ts#ACCESSED_NAME_FIELDS` usa para member/attribute/field.
 */
const CALLEE_FIELDS = ["method", "name", "function"] as const;
const ACCESS_NAME_FIELDS = ["property", "attribute", "field", "name", "method"] as const;

function calleeNameOf(call: AstNode): string | null {
  for (const field of CALLEE_FIELDS) {
    const child = call.childForFieldName(field) as AstNode | null;
    if (!child) continue;
    if (child.type === "identifier") return child.text.trim() || null;
    for (const accessField of ACCESS_NAME_FIELDS) {
      const inner = child.childForFieldName(accessField) as AstNode | null;
      if (inner) return inner.text.trim() || null;
    }
    // `function`/`name`/`method` resolvió a un nodo que no es ni un
    // identificador suelto ni un acceso reconocible (p. ej. la palabra clave
    // `super` de una invocación de constructor) — no hay nombre que comparar.
    return null;
  }
  return null;
}

/** Lista de argumentos de una llamada — `arguments` (JS/TS/Vue/Go/Ruby/Python/C#)
 *  o `argument_list` (Java), misma técnica ya usada en
 *  `hypotheses/{chain-of-responsibility,observer}.ts`. */
function callArguments(call: AstNode): AstNode | null {
  return (call.childForFieldName("arguments") as AstNode | null) ?? (call.childForFieldName("argument_list") as AstNode | null);
}

/**
 * `true` si CUALQUIER argumento (nombrado) de `call` es textualmente
 * exactamente uno de `paramNames` — confirma que la llamada REENVÍA el
 * grupo de datos, no que casualmente invoca a alguien con otros datos.
 */
function forwardsAnyParam(call: AstNode, paramNames: ReadonlySet<string>): boolean {
  const args = callArguments(call);
  if (!args) return false;
  for (let i = 0; i < args.childCount; i++) {
    const arg = args.child(i) as AstNode | null;
    if (arg && arg.isNamed && paramNames.has(arg.text.trim())) return true;
  }
  return false;
}

/**
 * Nombres de OTRAS operaciones del mismo grupo que `fn` invoca dentro de su
 * propio cuerpo, reenviándole al menos uno de los parámetros del grupo —
 * ver el docstring del módulo, "UN DESPACHADOR Y SUS VARIANTES". Recorre
 * `fn.node` completo (nunca `.parent()`, la llamada vive DENTRO de la propia
 * función que despacha).
 */
function siblingCalleesInvoked(
  fn: FunctionUnit,
  ownName: string | undefined,
  groupParamNames: ReadonlySet<string>,
  operationNames: ReadonlySet<string>,
): ReadonlySet<string> {
  const found = new Set<string>();
  walkTree(fn.node, (node) => {
    const real = node as AstNode;
    if (!real.isNamed || !isCallShaped(real)) return;
    const callee = calleeNameOf(real);
    if (!callee || callee === ownName || !operationNames.has(callee)) return;
    if (forwardsAnyParam(real, groupParamNames)) found.add(callee);
  });
  return found;
}

/**
 * `true` si AL MENOS una ocurrencia del grupo despacha, reenviando datos del
 * grupo, hacia DOS O MÁS nombres de operación DISTINTOS de otras ocurrencias
 * del MISMO grupo — la firma estructural de "una operación con N
 * implementaciones alternativas seleccionadas por condición" (RuboCop
 * `message` → `message_for_tabs`/`message_for_spaces`; NestJS
 * `addCustomProvider` → `addCustomClass`/`addCustomValue`/.../..., ver el
 * docstring del módulo).
 *
 * DELIBERADAMENTE ≥2, no ≥1: una función que reenvía a UN SOLO sibling
 * (Guava `StandardTable.removeMapping` llama `containsMapping(rowKey,
 * columnKey, value)`, un paso normal de su propia lógica, no una alternativa
 * condicional) es composición corriente, no un despachador — confirmado
 * contra el propio corpus: con el piso en 1, este arreglo excluiría el ÚNICO
 * grupo `verdadero` confirmado del catálogo (`Table<R,C,V>`, ver el docstring
 * del módulo); con el piso en 2, no lo toca (`removeMapping` sólo llama a
 * `containsMapping`, nunca a `put`) y sigue excluyendo los dos casos reales
 * de despachador.
 */
function isDispatcherGroup(
  occurrences: readonly GroupOccurrence[],
  groupParamNames: ReadonlySet<string>,
  operationNames: ReadonlySet<string>,
): boolean {
  return occurrences.some((o) => siblingCalleesInvoked(o.fn, o.fn.name ?? undefined, groupParamNames, operationNames).size >= 2);
}


/** Cuerpo de la función, por los campos genéricos que las 7 gramáticas
 *  comparten (`body` en JS/TS/Vue/Python/Ruby/Go/C#, `block` en algunas formas
 *  de Java/Ruby) — misma técnica de campo genérico que `paramNames`. */
function bodyOf(fnNode: AstNode): AstNode | null {
  return (fnNode.childForFieldName("body") as AstNode | null) ?? (fnNode.childForFieldName("block") as AstNode | null);
}

/**
 * ARREGLO 4 — `true` si la firma NO tiene cuerpo ejecutable. TRES formas, las
 * tres del árbol y ninguna por lenguaje:
 *   1. no hay nodo de cuerpo — la declaración de un método en una `interface`
 *      de Java/TS/Go, un método `abstract`, la firma de una sobrecarga de TS;
 *   2. el cuerpo entero, sin llaves ni espacios, es exactamente `...` o `pass`
 *      — el cuerpo obligatorio de un `@t.overload`/`@abstractmethod` de Python.
 *      Dos palabras, el MISMO vocabulario mínimo que este módulo ya acepta para
 *      `self`/`this` en `SELF_WORDS`, no una lista por lenguaje.
 * EL CUERPO VACÍO (`{}`) NO CUENTA, a propósito: no hay ni un caso en los 86
 * juicios abiertos donde el cuerpo vacío fuera el discriminador, y un `void
 * onEvent(a, b, c) {}` es una implementación no-op real, no una re-declaración.
 * Sólo se declara lo que la medición sostiene.
 * DELIBERADAMENTE ESTRECHO: una primera versión que trataba "una sola sentencia
 * sin llamadas" como stub dejaba fuera `return { nombre, email, telefono }` —
 * un cuerpo real de una línea — y apagaba el detector entero. Un cuerpo con UNA
 * sentencia de verdad NO es un stub.
 */
const STUB_BODIES: ReadonlySet<string> = new Set(["...", "pass"]);
function isStubSignature(fnNode: AstNode): boolean {
  const body = bodyOf(fnNode);
  if (!body) return true;
  return STUB_BODIES.has(body.text.trim().replace(/^[{:\s]+|[}\s;]+$/g, "").trim());
}

export const detector: IntraFileDetector<ThresholdKey, "data-clump"> = {
  id: "data-clump",
  kind: "data-clump",
  scope: "intra-file",
  title: "Grupo de datos repetido",
  needs: [],
  thresholds: {
    minGroupSize: citado(3, {
      work: "Fowler, Refactoring: Improving the Design of Existing Code",
      rule: "Data Clumps — tamaño mínimo de un grupo de datos que viaja junto",
    }),
    minRepeats: citado(3, {
      work: "JDeodorant (Tsantalis et al.) — formalización de la heurística de Data Clumps de Fowler",
      rule: "repeticiones mínimas del mismo grupo antes de señalarlo",
    }),
  },

  run(file: FileUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const minGroupSize = ctx.threshold("minGroupSize");
    const minRepeats = ctx.threshold("minRepeats");

    // Agrupa por CONJUNTO de nombres (orden-independiente: el mismo grupo de
    // datos declarado en otro orden en otra firma sigue siendo el mismo
    // clump — la clave normaliza con dedupe + sort; lo que se MUESTRA usa el
    // orden real de la primera firma).
    const groups = new Map<string, GroupOccurrence[]>();

    for (const fn of file.functions) {
      const names = paramNames(fn.node);
      if (!names) continue;
      const unique = [...new Set(names)];
      if (unique.length < minGroupSize.value) continue;

      const key = [...unique].sort().join(" ");
      const list = groups.get(key) ?? [];
      list.push({ orderedNames: unique, fn });
      groups.set(key, list);
    }

    const findings: RawFinding[] = [];

    for (const occurrences of groups.values()) {
      if (occurrences.length < minRepeats.value) continue;
      const first = occurrences[0];
      if (!first) continue;

      // Arreglo 2 (ver docstring del módulo): un grupo necesita al menos
      // `minRepeats` OPERACIONES DISTINTAS, no sólo `minRepeats` ocurrencias.
      // Si dos (o más) nombres de operación se REPARTEN las ocurrencias sin
      // que ninguno solo llegue a `minRepeats` (medido real: click
      // `command`+`group`, dos decoradores casi gemelos, 4 sobrecargas de
      // tipo CADA UNO con el mismo grupo `(name, cls, attrs)` — 8 ocurrencias
      // pero sólo 2 operaciones DISTINTAS), tampoco es un data clump: cada
      // operación, tomada sola, es la MISMA operación repetida por sobrecarga
      // (ver docstring) y ninguna junta el piso de repeticiones de Fowler por
      // SÍ misma. Un nombre `null` (función anónima) nunca colapsa con otro
      // nombre `null`: sin nombre no hay forma de afirmar que dos anónimas
      // son la MISMA operación, así que cada una cuenta por separado.
      const groupNames = first.orderedNames;

      // ARREGLOS 4 y 5 (ver el docstring del módulo): una firma sin cuerpo
      // ejecutable, o que retransmite el grupo ENTERO a otra llamada, no es
      // una OPERACIÓN que posea el grupo — es una re-declaración del contrato
      // o plomería. Se descuentan de las ocurrencias ANTES de contar
      // repeticiones y nombres distintos, que es donde Fowler pone el piso.
      const groupSet = new Set(groupNames);
      const substantive = occurrences.filter((o) => !isStubSignature(o.fn.node));
      if (substantive.length < minRepeats.value) continue;

      const distinctOperationNames = new Set(substantive.map((o, i) => o.fn.name ?? `#${i}`));
      if (distinctOperationNames.size < minRepeats.value) continue;

      // Arreglo 3 (ver docstring del módulo, "UN DESPACHADOR Y SUS
      // VARIANTES"): si alguna ocurrencia reenvía el grupo de datos hacia
      // DOS O MÁS operaciones DISTINTAS de este mismo grupo, no son N
      // operaciones independientes que comparten datos por casualidad — es
      // UNA operación con N implementaciones alternativas seleccionadas por
      // condición, y "Introduce Parameter Object" exigiría tocar todas las
      // variantes del despacho por la misma razón de contrato que ya excluye
      // la conformidad de interfaz.
      if (isDispatcherGroup(occurrences, new Set(groupNames), distinctOperationNames)) continue;

      const locations = occurrences.map((o, i) => ({
        file: file.path,
        startLine: o.fn.startLine,
        endLine: o.fn.endLine,
        symbol: o.fn.name ?? undefined,
        role: i === 0 ? "primera firma con este grupo" : `repetición #${i}`,
      }));
      const [firstLocation, ...restLocations] = locations;
      if (!firstLocation) continue;

      findings.push({
        title: `El grupo (${groupNames.join(", ")}) se repite en ${substantive.length} firmas de este archivo`,
        detail:
          "El mismo conjunto de datos aparece junto en varias firmas separadas: cada dato nuevo del grupo " +
          "obliga a tocar todas las firmas que lo repiten, la señal clásica de una clase propia (o un " +
          "value object) que todavía no se extrajo.",
        trigger: [
          { label: "firmas con el mismo grupo", value: substantive.length, threshold: minRepeats },
          { label: "tamaño del grupo", value: groupNames.length, threshold: minGroupSize },
        ],
        locations: [firstLocation, ...restLocations],
        severity: Math.min(100, 30 + substantive.length * 10 + groupNames.length * 3),
        advice: {
          primary: {
            name: "Introduce Parameter Object",
            kind: "refactorizacion",
            why: "Un grupo de datos que siempre viaja junto es, en los hechos, un objeto propio esperando a nombrarse: extraerlo reemplaza N parámetros repetidos por uno solo en cada firma que lo usa.",
            source: "https://refactoring.guru/es/smells/data-clumps",
          },
        },
      });
    }

    return findings;
  },
};
