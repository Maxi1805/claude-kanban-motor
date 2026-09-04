/**
 * `argument-mutation` — reasignación o mutación de un parámetro dentro de su
 * propia función (PLAN.md §4.1; SonarSource RSPEC-1226, "Method parameters,
 * caught exceptions and foreach variables' initial values should not be
 * ignored").
 *
 * RELACIÓN: dentro del cuerpo de una función, el lado izquierdo de una
 * asignación (o el operando de un incremento/decremento) resuelve, siguiendo
 * la cadena de acceso estructural hacia su base, al nombre de UNO de los
 * parámetros declarados por esa misma función. Dos variantes, deliberadamente
 * distinguidas — la tarea pide separarlas porque en lenguajes de paso por
 * valor (Go, structs) significan cosas distintas:
 *
 *   - `reassignment`: el parámetro entero se reemplaza (`x = ...`, `x += 1`,
 *     `x++`) — el valor ORIGINAL que llegó como argumento deja de estar
 *     disponible. Nunca escapa de la función (es un rebind local en TODOS
 *     los lenguajes soportados, incluido Go), así que su costo es de lectura
 *     y depuración, no de efectos secundarios en quien llamó.
 *   - `mutation`: se asigna a través de un acceso a miembro o índice cuya
 *     BASE resuelve al parámetro (`x.campo = ...`, `x[0] = ...`) — el
 *     parámetro en sí sigue apuntando al mismo objeto, pero ese objeto
 *     cambió. En lenguajes de semántica de referencia (JS/TS/Python/Ruby/
 *     Java/C# para tipos no-struct) esto SÍ puede ser visible para quien
 *     llamó; en Go sólo si el parámetro es puntero/slice/mapa/canal — y ESO
 *     sí se puede confirmar sin inferencia de tipos, leyendo el campo `type`
 *     declarado del propio parámetro (`isGoConfirmedValueTypeParam`, JUICIO
 *     DE PRECISIÓN más abajo): cuando el tipo declarado NO es ninguno de los
 *     cuatro, Go garantiza por especificación que el cambio nunca sale de la
 *     función, así que el hallazgo de `mutation` se SUPRIME por completo
 *     para ese parámetro en vez de emitirse con menos severidad — no es un
 *     riesgo incierto que haya que hedgear, es la ausencia CONFIRMADA del
 *     fenómeno.
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: "esto es una asignación" se decide
 * partiendo el NOMBRE DE TIPO DE NODO por "_" y comparando los tokens contra
 * un vocabulario mínimo, genérico y aplicado IDÉNTICAMENTE a los lenguajes
 * soportados (`assignment` para "esto asigna"; `member`/`subscript`/
 * `attribute`/`field`/`selector`/`element`/`array`/`index` para "esto es un
 * acceso a través de algo"; `call`/`invocation` para "esto es una llamada,
 * no sigas bajando") — mismo estilo que `TERNARY_NAME`/`SWITCH_WORD` de
 * `code-grammar.ts`, nunca una lista de identificadores de dominio. "Cuál es
 * el parámetro" se decide por FORMA: el campo `parameters`/`parameter_list`
 * del nodo función (el mismo campo que `isFunctionLike` ya exige) y, dentro
 * de él, el campo genérico `name`/`pattern` de cada parámetro — nunca por
 * posición de texto ni por palabra reservada de un lenguaje concreto.
 *
 * SIMPLIFICACIONES DECLARADAS:
 *   - `a.b.c = valor` se atribuye por completo a "a" (la base MÁS externa
 *     alcanzable sin cruzar una llamada), nunca a "b": alcanza para saber
 *     "algo alcanzable desde este parámetro cambió", no pretende identificar
 *     LA propiedad exacta que cambió.
 *   - El recorrido usa `walkTree` sobre `fn.node` completo, que también
 *     desciende a funciones ANIDADAS (closures/callbacks) dentro de esta
 *     función — `walkTree` no soporta podar subárboles y no está permitido
 *     escribir un recorrido propio (ver `detect/tree-walk.ts`). Si una
 *     función anidada reasigna/muta un parámetro PROPIO que por casualidad
 *     tiene el MISMO NOMBRE que un parámetro de la función externa (shadowing
 *     exacto de nombre), ese caso se atribuye también a la función externa:
 *     un duplicado o una atribución cruzada, raro (exige coincidencia exacta
 *     de nombre) y de bajo impacto — no corregido acá.
 *   - Mutar el PRIMER parámetro de un método escrito en PYTHON nunca dispara
 *     la variante `mutation` (sí puede disparar `reassignment`): en Python,
 *     a diferencia de JS/TS/Java/Go/C#, `self`/`cls` es por convención un
 *     parámetro DECLARADO en la posición cero — el único de los seis
 *     lenguajes soportados donde el receptor de un método aparece en su
 *     propia lista de parámetros. `language` es la ÚNICA distinción por
 *     nombre que este detector se permite (ya un dato de primera clase de
 *     `FunctionUnit`, no un nombre de nodo) — misma excepción mínima y
 *     documentada que `isEmptyHandler` en `empty-catch.ts`. En el resto de
 *     los lenguajes el primer parámetro de un método se trata como
 *     cualquier otro: si se muta, dispara igual (ver el test de Java, que
 *     confirma esto por contraste). Ver "falsos positivos" abajo para lo
 *     que esta regla NO filtra.
 *
 * LÍMITE DECLARADO POR LENGUAJE — **LEVANTADO EN LA OLA O, VER JUICIO DE
 * PRECISIÓN #6 AL FINAL DE ESTE DOCSTRING**; el párrafo que sigue describe el
 * estado anterior y por qué el razonamiento, correcto en general, se estaba
 * aplicando en la posición equivocada: Ruby representa el LHS de
 * `obj.atributo = valor` con un nodo `call` (mismo tipo estructural que una
 * invocación de método común — confirmado por sonda directa: `obj.attr = 1`
 * parsea como `assignment(left: call(receiver: identifier, method: identifier),
 * right: ...)`), indistinguible sin vocabulario de nombres de método de
 * `obj.metodo_normal(...)`. Este detector aborta deliberadamente la
 * atribución en CUALQUIER nodo con forma de llamada (mismo criterio en todos
 * los lenguajes, ver `isCallShaped`) para no confundir "el resultado de
 * invocar algo" con "mutar el receptor de la llamada" — el costo es que
 * Ruby pierde la mutación POR ATRIBUTO (`obj.attr = valor`) específicamente.
 * La mutación POR ÍNDICE (`arr[i] = valor`, `hash[:clave] = valor`) SÍ se
 * detecta con normalidad en Ruby: su LHS es un `element_reference` (también
 * confirmado por sonda directa: `opts[:x] = 1` parsea con
 * `left: element_reference(identifier, "[", simple_symbol, "]")`), que cae
 * dentro de `ACCESSOR_TOKENS` vía el token "element" — nunca un `call`, así
 * que no cruza el guardia de arriba. `reassignment` (`x = valor`) también
 * funciona en Ruby con normalidad: su LHS en ese caso es un `identifier`
 * plano, sin ningún `call` de por medio. Confirmado además contra el corpus
 * externo (ver el resultado de la tarea): Ruby SÍ emite ambas variantes en
 * código real, no sólo en la fixture sintética.
 *
 * FALSOS POSITIVOS CONOCIDOS (documentados, no filtrados por vocabulario —
 * confianza baja donde no se pueden distinguir):
 *   - Normalizar un argumento al empezar la función (`valor = valor.trim()`,
 *     `opciones = { ...defaults, ...opciones }`) es una técnica DELIBERADA y
 *     recomendada (evita repetir una condición más abajo) y es
 *     ESTRUCTURALMENTE IDÉNTICA a una reasignación descuidada que pisa el
 *     argumento sin razón — no hay forma de distinguirlas sin leer la
 *     intención humana.
 *   - Mutar un parámetro que es explícitamente un ACUMULADOR (un visitor, un
 *     builder, un objeto "out" que la función llena a propósito —
 *     `function collect(sink) { sink.items.push(x); }`) es el diseño
 *     esperado, no un descuido; este detector no distingue un acumulador
 *     intencional de un objeto mutado por accidente.
 *   - La supresión de `mutation` en el primer parámetro de un método (arriba)
 *     no cubre `self`/`cls` reordenado a una posición distinta de la cero
 *     (infrecuente) ni protege del caso simétrico en lenguajes donde el
 *     receptor NO es un parámetro declarado (Ruby/JS/Java/C#, donde
 *     `self`/`this` no aparece en la lista de parámetros y por lo tanto
 *     nunca se rastrea en primer lugar — ahí no hay falso positivo posible
 *     por esta vía).
 *
 * JUICIO DE PRECISIÓN (frente de nivel 1, agosto 2026), FALSO POSITIVO
 * ENCONTRADO Y ARREGLADO: un parámetro C# `out`/`ref` ASIGNADO dentro del
 * método es, para este detector antes del arreglo, indistinguible de una
 * reasignación descuidada — pero asignarle un valor a un `out` no es
 * opcional: el compilador de C# RECHAZA un método que no le asigna algo a
 * cada parámetro `out` antes de cualquier `return`, y `ref` existe
 * específicamente para que el método modifique la variable del llamador a
 * propósito. Caso real verificado a mano contra `newtonsoft-json` (corpus
 * externo): `EnumUtils.cs#TryToString(..., out string name)` — `name =
 * enumInfo.ResolvedNames[index]` es la ÚNICA forma de que este método
 * `TryXxx` devuelva su segundo valor; el patrón `TryParse`/`TryGetValue`
 * (out-parameter) es ubicuo en C# idiomático, así que sin este arreglo CADA
 * método `TryXxx` de una base de código C# real dispara un falso positivo.
 * `hasOutOrRefModifier` (abajo) excluye estos parámetros de
 * `collectParameterNames` — nunca entran a `paramIndex`, así que asignarles
 * un valor nunca puede producir un hallazgo. Confirmado por sonda directa
 * que ningún otro de los seis lenguajes soportados tiene un mecanismo
 * estructural equivalente en la lista de PARÁMETROS (el retorno con nombre
 * de Go, `func f() (result int)`, vive en la firma de retorno, nunca en
 * `parameters`/`parameter_list`, así que ni siquiera entra a este código) —
 * es una excepción por lenguaje mínima y confirmada, no una lista inventada.
 *
 * JUICIO DE PRECISIÓN #2 (frente de nivel 1, agosto 2026), NÚMERO CABLEADO
 * POR LENGUAJE ENCONTRADO Y REEMPLAZADO POR ALGO ESTRUCTURAL:
 * `severityFor` tenía `const base = language === "go" ? 30 : 50;` — un valor
 * distinto por lenguaje SIN cita ni derivación, exactamente lo que la regla
 * de umbrales del proyecto prohíbe (y, más de fondo, la MISMA pregunta que
 * el ancla necesita responder — "¿este cambio puede verlo quien llamó?" —
 * resuelta por un promedio en vez de por el dato que la resuelve de verdad).
 * El motivo detrás del número SÍ era honesto (Go copia por valor salvo
 * puntero/slice/mapa/canal, ver el docstring de la variante `mutation`
 * arriba) pero la implementación promediaba sobre TODOS los parámetros Go
 * por igual en vez de mirar CUÁL es el tipo del parámetro concreto que se
 * está mutando — algo que sí está a la vista, sin inferencia de tipos, en el
 * campo `type` del propio parámetro (confirmado por sonda directa,
 * `scratchpad/precision-front/probe-go-param-types.mjs`): `*Config` parsea
 * `pointer_type`, `[]Item` parsea `slice_type`, `map[K]V` parsea `map_type`,
 * `chan T` parsea `channel_type` — los cuatro shapes que Go representa por
 * referencia; un nombre de tipo simple (`Config`, `int`), un tipo calificado
 * (`time.Time`) y un ARRAY de tamaño fijo (`[5]int`, que a diferencia de un
 * slice SÍ se copia por valor) parsean `type_identifier`/`qualified_type`/
 * `array_type` — los tres shapes que Go copia. `isGoConfirmedValueTypeParam`
 * clasifica cada parámetro por esto y `collectGoValueTypeParamNames` junta
 * los nombres confirmados-valor; `run()` (abajo) SUPRIME el hallazgo de
 * `mutation` para esos nombres en vez de emitirlo con severidad reducida —
 * ya no hace falta adivinar, así que ya no hace falta hedgear. Para los
 * parámetros CONFIRMADOS por referencia, la severidad ahora es la MISMA que
 * cualquier otro lenguaje (`severityFor` ya no recibe `language` en
 * absoluto): estaban subvaluados antes por el promedio, no por una razón
 * propia. Confirmado con el corpus externo que la distinción vale: en
 * `cobra/flag_groups.go:121`, `processFlagForGroupAnnotation(...,
 * groupStatus map[string]map[string]bool)` — un parámetro `map_type` — SIGUE
 * generando hallazgo (correcto: un mapa es por referencia en Go, el cambio
 * SÍ es visible; que el juicio humano lo haya marcado falso es por otra
 * razón, "es un acumulador construido por la propia función", la misma
 * categoría ya documentada arriba como sin arreglo estructural posible, no
 * por incertidumbre de tipo).
 *
 * LÍMITE DECLARADO (dos, simétricos, por lo mismo — Go no expone alias de
 * tipo ni parámetros genéricos por FORMA sintáctica):
 *   - Un parámetro de tipo GENÉRICO (`func F[T any](x T)`, Go 1.18+) parsea
 *     `type_identifier` — IDÉNTICO a un nombre de tipo concreto (`Config`) —
 *     confirmado por sonda directa. Si `T` se instancia con un puntero en
 *     alguna llamada, este detector lo trata igual que `int`: lo suprime.
 *     Es un falso NEGATIVO posible, no uno positivo, y estructuralmente
 *     indistinguible sin resolver la instanciación — se documenta acá en vez
 *     de adivinar.
 *   - Un ALIAS de tipo sobre una forma por referencia (`type Registry
 *     map[string]int; func F(r Registry)`) también parsea `type_identifier`
 *     por el mismo motivo (el parámetro nombra el ALIAS, no la forma
 *     subyacente) — mismo límite, misma dirección (falso negativo posible).
 *   - C# tiene el MISMO problema de fondo (`struct` vs `class` en una
 *     declaración de parámetro se ven IDÉNTICOS: `Config cfg` no dice cuál
 *     es) pero, a diferencia de Go, no hay siquiera un sigilo sintáctico
 *     (`*`/`[]`/`map`/`chan`) que distinga el caso ocasional — así que C#
 *     sigue sin ninguna reducción/supresión, exactamente como antes de este
 *     arreglo: no se inventa una distinción que el lenguaje no ofrece por
 *     sintaxis.
 *
 * JUICIO DE PRECISIÓN #3 (frente de ruido de nivel 1, agosto 2026) —
 * REDEFINICIÓN, no sólo bug: la ola anterior dejó el kind en 7 % (4/55)
 * habiendo ya reemplazado el número cableado por lenguaje (JUICIO #2,
 * arriba) sin mover la aguja. Muestreo fresco cargado en
 * `tests/golden/precision/*.verdicts.csv` (62 veredictos, 5 lenguajes —
 * python/csharp/go/ruby/javascript — 4 repos: click, newtonsoft-json,
 * cobra, jekyll) partido por VARIANTE mostró una asimetría enorme:
 * `reassignment` medía 1/41 verdaderos (2 %); `mutation` medía 3/21 (14 %,
 * siete veces mejor). La pregunta del encargo — "¿el criterio distingue
 * cuándo el cambio puede verlo quien llamó?" — para `reassignment` la
 * respuesta YA es "nunca, en ningún lenguaje" (ver el docstring de la
 * variante arriba, "nunca escapa de la función"); el detector la seguía
 * emitiendo igual por un argumento DISTINTO ("costo de lectura/depuración")
 * que la data muestra que NO describe el fenómeno: de los 36 falsos
 * positivos vivos de `reassignment`, TREINTA Y CUATRO caen en dos formas
 * idiomáticas — "valor por defecto si está ausente" (`if x is None: x =
 * default()`, `if header == nil { header = &Header{} }`, 19 casos, los seis
 * lenguajes) y "transformar-y-reasignar" (`value = value.trim()`, `s =
 * strings.ToLower(s)`, `count = count + 1` — el lado derecho SIEMPRE
 * lee el valor viejo para construir el nuevo, 15 casos) — más operadores
 * compuestos (`+=`, `%=`, `x++`, 3 casos) que ni siquiera pueden "ignorar"
 * el valor recibido (LEEN antes de escribir, la preocupación LITERAL de
 * S1226). El ÚNICO verdadero de `reassignment` en las 62 filas
 * (`termui.py:91`, `count = int(sum(steps))`) NO tiene ninguna de las tres
 * formas: ni guarda, ni auto-referencia, ni operador compuesto — reemplaza
 * el parámetro por un valor SIN relación con el original, sin condición.
 *
 * EL ARREGLO — tres exclusiones estructurales, confirmadas contra las 62
 * filas ANTES de escribirlas (recálculo manual línea por línea, ver el
 * resultado de la tarea): `markGuardedAssignments`/`containsChainReference`
 * (GUARDA: la condición de un `if`/`while`/ternario que envuelve la
 * asignación ya prueba la MISMA cadena — cubre ambas variantes, sólo donde
 * la gramática expone `condition` como CAMPO, ver el límite declarado en
 * ese docstring), `isCompoundAssignment`/`isUpdateShaped` (OPERADOR: `+=` y
 * `x++` excluidos SIEMPRE, ambas variantes — nunca ignoran el valor
 * anterior por construcción) y, sólo para `reassignment`, la AUTO-
 * REFERENCIA del lado derecho (`containsChainReference` contra `base.name`
 * en el campo `right`/`value`). Resultado sobre las 62 filas: `reassignment`
 * pasa de 36 falsos vivos a 1 (`completions.go:938`, `name = short.Name`,
 * resuelve un shorthand a su forma larga SIN guarda textual ni
 * auto-referencia de texto — miss aceptado, documentado, no perseguido con
 * un heurístico léxico) conservando el único verdadero; `mutation` pasa de
 * 17 a 15 (la GUARDA alcanza 2 casos con memoización real —
 * `contract.ItemContract = Resolve(...)` guardado por `if
 * (contract.ItemContract == null)`, `header.Title = ...` guardado por `if
 * (header.Title == "")` — conservando los 3 verdaderos, los tres mutaciones
 * de puntero Go SIN guarda ni auto-referencia).
 *
 * DELIBERADAMENTE NO ARREGLADO — el bulto de `mutation` (15 de 17 falsos
 * vivos restantes): la forma "acumulador/constructor" (`target[k] =
 * AddSchema(...)` en un método `AddProperty`, `cmds[i].parent = c` en
 * `AddCommand`, `ctx.verbose = verbose` sobre un objeto de contexto
 * compartido por diseño, `list[i] = list[j]` en un `Reverse` in-place) —
 * ninguna de las tres exclusiones de arriba la distingue de una mutación
 * real, y ya estaba documentada así ANTES de esta ola (ver "FALSOS
 * POSITIVOS CONOCIDOS" arriba, "acumulador intencional"): la única señal
 * que la separaría de una mutación por descuido es si la FUNCIÓN ENTERA
 * existe para llenar ese parámetro (nombre/contrato del método, no forma de
 * AST) — terreno léxico/semántico que este detector, por diseño, no pisa.
 * `mutation` queda en ~15-18 % (3/18-20, contando `dudoso`) — mejor que
 * `reassignment` pre-arreglo, lejos de precisión alta, y CONOCIDAMENTE así.
 *
 * NO ES EL ATAJO DE LA OLA PASADA (bajar volumen a cero sin medir, ver
 * RAICES.md "LA TRAMPA"): las tres exclusiones se derivaron de por qué CADA
 * caso falso es falso (confirmado abriendo el código fuente real, no
 * inferido de la nota del juicio), se verificaron contra el ÚNICO
 * verdadero de cada variante ANTES de escribir código (ninguno de los 4
 * verdaderos del pool tiene guarda/auto-referencia/operador compuesto), y
 * el kind SIGUE emitiendo — no se tocó ningún umbral para vaciarlo.
 *
 * JUICIO DE PRECISIÓN #4 (OLA N, FRENTE B1b) — CONTRATO EXTERNO VÍA GRAFO
 * (`needsGraph: true`, `detect/primitivas/b1b-contrato-grafo.ts`, compartido
 * con `unused-variable.ts`): sólo suprime `mutation` (nunca `reassignment` —
 * reasignar el parámetro nunca escapa a quien llama, con o sin contrato, ver
 * el docstring de la variante arriba), y sólo cuando el CONTENEDOR de `fn`
 * tiene una arista `implements`/`extends`/`satisfies` hacia un símbolo cuyos
 * miembros incluyen uno de igual nombre+aridad que `fn`, o `fn` mismo es
 * destino de una arista `carries` entrante (delegado registrado en otro
 * lado) — MISMO mecanismo, misma primitiva, que la pregunta 1 de
 * `unused-variable.ts`.
 *
 * MEDIDO CONTRA LOS CINCO FALSOS TEXTUALES DEL ENCARGO
 * (`B1-CONTRATO.md`), UNO POR UNO, ANTES DE INTEGRAR NADA — el resultado es
 * la razón por la que este arreglo NO se anuncia como el que baja `mutation`
 * al bulto: NINGUNO de los cinco lo activa.
 *
 *   - `CopyTo(JToken[] array, int arrayIndex)` (newtonsoft-json,
 *     `JProperty.cs` — clase interna `JPropertyList : IList<JToken>`):
 *     implementa `ICollection<T>.CopyTo`, pero `IList<JToken>`/
 *     `ICollection<JToken>` son del BCL (`System.Collections.Generic`), NUNCA
 *     un símbolo del repo — `graph/build.ts` (línea ~218) descarta
 *     explícitamente los nombres externos como "unresolved... sin aportar
 *     señal": no hay arista `implements`/`extends` que apuntar, así que este
 *     caso queda estructuralmente fuera del alcance del grafo, no por un bug
 *     de este archivo.
 *   - `list[i]=list[j]; list[j]=temp` en `Reverse(IList list)`
 *     (`CollectionUtils.cs`): `Reverse` no implementa ninguna interfaz — es
 *     un método utilitario que TOMA un `IList` como parámetro. El contrato
 *     que hace que mutar `list` sea el propósito es el NOMBRE del método
 *     ("Reverse"), terreno léxico que este detector no pisa (ya documentado
 *     arriba, "DELIBERADAMENTE NO ARREGLADO").
 *   - `target[propertyName] = AddSchema(...)` en `AddProperty(IDictionary<...>
 *     target, ...)` (`JsonSchemaModelBuilder.cs`): mismo caso — `AddProperty`
 *     no implementa nada, es un método propio cuyo nombre ya dice el
 *     propósito.
 *   - `token.Parent = this` en `Add(BsonToken token)` (`BsonObject:
 *     BsonToken, IEnumerable<BsonProperty>`): `IEnumerable<T>` no declara
 *     `Add` — no hay miembro que emparejar aunque la interfaz SÍ fuera del
 *     repo.
 *   - `contract.IsReference = ...` en `InitializeContract(JsonContract
 *     contract)` (`DefaultContractResolver.cs`): mismo patrón, el nombre del
 *     método ("Initialize...") es la única señal, no una interfaz.
 *
 * Los CINCO son la familia "acumulador/contrato ya documentado" que el
 * docstring de arriba ya marca como sin arreglo estructural posible — medido
 * de nuevo contra las notas COMPLETAS de `tests/golden/precision/
 * {newtonsoft-json,guava}.verdicts.csv` (no sólo los cinco del encargo): NI
 * UNA fila de `mutation` en esas dos planillas cita una interfaz/clase base
 * DEL REPO — todas citan o bien un contrato del BCL/JDK (CopyTo,
 * `Collection.toArray`) o bien el nombre propio del método (Reverse, sort,
 * swap, put*, fill). El mecanismo SÍ es correcto y SÍ está probado (ver
 * `argument-mutation.test.ts`, sección B1b, con una interfaz FICTICIA del
 * repo para que el caso positivo exista) — sólo que la muestra juzgada de
 * este corpus no tiene ningún caso real que lo dispare. Ver el informe de la
 * tarea para el detalle completo.
 *
 * JUICIO DE PRECISIÓN #5 (OLA O, FRENTE N6) — LA DISTINCIÓN QUE FALTABA:
 * ESCRIBIR EN UN ÍNDICE DEL PARÁMETRO NO ES MUTARLO A ESPALDAS DE QUIEN
 * LLAMÓ. Es la redefinición que el bulto documentado arriba
 * ("DELIBERADAMENTE NO ARREGLADO") pedía, y sale por FORMA, no por el nombre
 * del método.
 *
 * LA MEDICIÓN QUE LA PRODUJO. Al abrir la Ola O este kind tenía 40 veredictos
 * vivos en `tests/golden/precision/*.verdicts.csv`: 5 verdaderos, 35 falsos
 * (12 %). Clasificados por FORMA del sitio de escritura, no por su nota:
 *
 *   - VEINTIUNO de los 35 falsos escriben en un ÍNDICE del parámetro —
 *     `array[i] = …` (`ObjectArrays.fillArray`, `BaseEncoding.read(buf)`,
 *     `LittleEndianByteArray.putLongLittleEndian(sink)`,
 *     `ImmutableCollection.copyIntoArray(dst)`, `DateTimeUtils.
 *     WriteDefaultIsoDate(chars)`), `list[i] = list[j]` (los cuatro
 *     `reverse`/`sort` de `primitives/`, `CollectionUtils.FastReverse`),
 *     `target[clave] = …` (`JsonSchemaModelBuilder.AddProperty`,
 *     `JObject.TrySetMember`, `flag_groups.processFlagForGroupAnnotation`),
 *     `result[0] = …`/`output[0] = …` (out-param manual de Java),
 *     `array[i] = …` de `JProperty.CopyTo`, `cmds[i].parent = c` de
 *     `Command.AddCommand`.
 *   - NINGUNO de los 5 verdaderos lo hace: los tres de cobra
 *     (`genMan`/`GenMarkdownCustom`/`GenReSTCustom`) escriben en un CAMPO
 *     (`cmd.DisableAutoGenTag = c.DisableAutoGenTag`) y los otros dos son
 *     `reassignment`, que esta regla no toca en absoluto.
 *
 * POR QUÉ ES UNA RAZÓN Y NO UNA CORRELACIÓN. Para escribir `p[i] = v` hace
 * falta que quien llamó haya CONSTRUIDO Y ENTREGADO un agregado con lugar
 * donde escribir: un array dimensionado, una lista, un mapa. Entregar un
 * contenedor y no querer que se le escriba adentro es una contradicción — un
 * contenedor no tiene otra cosa que su contenido. Un CAMPO es lo contrario:
 * el llamador pasó un objeto por su identidad y su invariante, y quien lo
 * recibe le cambia un atributo — eso sí es un efecto que la firma no anuncia,
 * que es LITERALMENTE lo que el `detail` de esta variante afirma ("aunque
 * nunca haya pedido que se modificara"). La misma asimetría explica por qué
 * el bulto era irreductible mientras las dos formas se trataban igual.
 *
 * ACOTADO A PROPÓSITO al índice que se apoya DIRECTAMENTE sobre el parámetro
 * (`BaseResult.indexOnBase`): `p[i] = v` y `p[i].campo = v` sí; `p.items[i] =
 * v` NO — ahí el llamador entregó `p`, no `p.items`, y bajar por un campo
 * hasta encontrar un contenedor interno es exactamente el efecto secundario
 * invisible que el detector busca. La partición del vocabulario
 * (`INDEX_ACCESSOR_TOKENS` vs `FIELD_ACCESSOR_TOKENS`) sale de la gramática y
 * está confirmada por sonda directa contra las 7, sin ninguna rama por
 * lenguaje.
 *
 * LO QUE ESTA REGLA NO ARREGLA, y queda documentado en vez de disimulado: los
 * 14 falsos restantes escriben en un CAMPO y siguen emitiendo — enlazar/
 * desenlazar una estructura intrusiva (`node.prev.next = …` de
 * `HashBiMap.delete`, `guard.next = activeGuards` de `Monitor`,
 * `KeyList(firstNode)`), establecer la relación padre-hijo al agregar a una
 * colección (`token.Parent = this` de `BsonObject.Add`), rellenar un objeto
 * de configuración recibido (`contract.IsReference = …` de
 * `InitializeContract`, `ctx.verbose = verbose` de click). Los cinco tienen
 * la misma forma EXACTA que los tres verdaderos de cobra
 * (`cmd.DisableAutoGenTag = c.DisableAutoGenTag`): un campo del parámetro
 * asignado desde otro valor. Sin salir de la función no hay nada en el AST
 * que los separe, y el grafo tampoco: `b1b-contrato-grafo.ts` ya midió que
 * ninguno de ellos implementa nada del repo. Separar esa familia necesita
 * saber si el objeto ESCAPA de vuelta al llamador con el cambio puesto — un
 * dato por SITIO DE LLAMADA que el `CodeGraph` de hoy no produce (misma
 * carencia que B1b documentó para "un parámetro que ningún llamador pasa
 * nunca"): la aridad de un `CodeGraphNode` es la DECLARADA, y ninguna
 * `CodeGraphEdge` lleva qué se pasó en cada invocación.
 *
 * JUICIO DE PRECISIÓN #6 (OLA O, FRENTE N6) — EL "LÍMITE DECLARADO POR
 * LENGUAJE" DE RUBY, LEVANTADO. Va junto con #5 y no es opcional: sin esto,
 * #5 dejaría a Ruby con CERO hallazgos de `mutation` (su única forma
 * observable de mutación era el índice, y #5 la retira), y un detector que
 * queda en cero en un lenguaje donde emitía decenas está roto en ese
 * lenguaje aunque el número global se vea mejor.
 *
 * El límite decía: Ruby representa el LHS de `obj.atributo = valor` con un
 * nodo `call` —el mismo tipo estructural que `obj.metodo(...)`— y este
 * detector aborta la atribución en CUALQUIER nodo con forma de llamada, así
 * que Ruby perdía la mutación por atributo. El razonamiento era correcto pero
 * se aplicaba en el lugar equivocado: la ambigüedad entre "invocar" y
 * "escribir un atributo" **no existe en posición de DESTINO de una
 * asignación**. El resultado de una invocación no es asignable en ninguno de
 * los siete lenguajes soportados; si un nodo con forma de llamada aparece
 * como `left`/`target` de una asignación, la gramática está reutilizando su
 * regla de llamada para expresar una escritura, no una invocación.
 * `isAttributeWriteShaped` (abajo) lo reconoce por FORMA — expone `receiver`
 * y NO expone lista de argumentos — y `resolveBase` sigue por el `receiver`.
 * La condición "sin argumentos" deja afuera cualquier forma que sí los
 * traiga: ésa sigue abortando exactamente como antes.
 *
 * QUÉ CAMBIA EN RUBY, medido sobre `corpus/jekyll` antes de escribir el
 * código: de sus 11 hallazgos de `mutation`, 10 son escritura por índice
 * sobre un hash/array que el llamador entrega para llenar (`opts[:SSLCertificate] = …`
 * en `enable_ssl(opts)`, `site_payload["page"] = …` en `render(layouts,
 * site_payload)`, `data[key] = …` en `read_data_to(dir, data)`, `res[…] = …`
 * en `do_GET(req, res)`) — la familia que #5 retira con razón. Lo que #6
 * devuelve es la forma que SÍ es el fenómeno y que nunca se había podido
 * ver: `obj.campo = valor` sobre un parámetro, exactamente la misma forma que
 * los tres verdaderos de cobra (`cmd.DisableAutoGenTag = …`).
 */
import type { ProbeNode } from "../../code-grammar.js";
import { signatureImposedByContract } from "../primitivas/b1b-contrato-grafo.js";
import { citado, type Threshold } from "../thresholds.js";
import { walkTree } from "../tree-walk.js";
import type { AstNode, FunctionUnit, IntraFunctionDetector, RawFinding, RunContext } from "../types.js";

type ThresholdKey = "presence";
type Variant = "reassignment" | "mutation";

/**
 * Vocabulario genérico compartido entre TODOS los lenguajes — nunca por
 * lenguaje (ver docstring del módulo). Partido en DOS mitades por JUICIO DE
 * PRECISIÓN #5 (ver el docstring del módulo): un acceso por ÍNDICE
 * (`p[i] = v`) y un acceso por CAMPO (`p.x = v`) no significan lo mismo, y la
 * partición sale de la gramática, no de una lista por lenguaje — confirmada
 * por sonda directa (`scratchpad/precision-front/probe-n6-index-TEMP.mts`)
 * contra las 7 gramáticas: el LHS indexado parsea `subscript_expression`
 * (JS/TS), `subscript` (Python), `element_reference` (Ruby),
 * `index_expression` (Go), `array_access` (Java), `element_access_expression`
 * (C#) — todos llevan uno de los cuatro tokens de `INDEX_ACCESSOR_TOKENS`; el
 * LHS por campo parsea `member_expression` (JS/TS), `attribute` (Python),
 * `selector_expression` (Go), `field_access` (Java),
 * `member_access_expression` (C#) — todos llevan uno de los cuatro de
 * `FIELD_ACCESSOR_TOKENS`. Ninguna forma cae en las dos.
 */
const INDEX_ACCESSOR_TOKENS = new Set(["subscript", "element", "array", "index"]);
const FIELD_ACCESSOR_TOKENS = new Set(["member", "attribute", "field", "selector"]);
const ACCESSOR_TOKENS = new Set([...INDEX_ACCESSOR_TOKENS, ...FIELD_ACCESSOR_TOKENS]);
const CALL_TOKENS = new Set(["call", "invocation"]);

function tokensOf(node: ProbeNode): string[] {
  return node.type.split("_");
}

function isIdentifier(node: ProbeNode): boolean {
  return node.type === "identifier";
}

/** `x = ...`, `x += ...`, `x.y = ...`: cualquier nodo cuyo tipo lleve el token "assignment". */
function isAssignmentShaped(node: ProbeNode): boolean {
  return tokensOf(node).includes("assignment");
}

/** Acceso a través de algo: miembro, subíndice, atributo — nunca la llamada en sí. */
function isAccessorShaped(node: ProbeNode): boolean {
  return tokensOf(node).some((t) => ACCESSOR_TOKENS.has(t));
}

/** Acceso por ÍNDICE específicamente (`p[i]`), nunca por campo — ver `INDEX_ACCESSOR_TOKENS` y JUICIO DE PRECISIÓN #5. */
function isIndexAccessorShaped(node: ProbeNode): boolean {
  return tokensOf(node).some((t) => INDEX_ACCESSOR_TOKENS.has(t));
}

/** Invocación: cruzarla aborta la atribución (ver el límite de Ruby en el docstring del módulo). */
function isCallShaped(node: ProbeNode): boolean {
  return tokensOf(node).some((t) => CALL_TOKENS.has(t));
}

/**
 * `true` para un nodo con FORMA DE LLAMADA que, sin embargo, es una ESCRITURA
 * POR ATRIBUTO: expone un `receiver` propio y NO expone ninguna lista de
 * argumentos — ver "LÍMITE DE RUBY LEVANTADO" (JUICIO DE PRECISIÓN #6) en el
 * docstring del módulo.
 *
 * POR QUÉ ES SEGURO Y GENÉRICO. Este chequeo sólo se consulta bajando por el
 * DESTINO de una asignación (`resolveBase`, cuyo único llamador es el target
 * de un sitio de asignación): en esa posición un nodo con forma de llamada no
 * puede ser "el resultado de invocar algo" — el resultado de una invocación
 * no es asignable en ninguno de los lenguajes soportados. Lo único que puede
 * ser es la sintaxis de escritura de un atributo que la gramática representa
 * reutilizando su regla de llamada. La condición "sin lista de argumentos"
 * mantiene la ambigüedad afuera: cualquier forma que SÍ traiga argumentos
 * sigue abortando la atribución exactamente como antes.
 *
 * Confirmado por sonda directa (`scratchpad/precision-front/
 * probe-n6-ruby-attr-TEMP.mts`): en Ruby `sink.value = 1` parsea
 * `assignment(left: call(receiver: identifier, method: identifier))` sin
 * campo `arguments`, y `obj.a.b = 2` anida un `call` como `receiver` de otro,
 * así que la recursión llega a `obj` con normalidad. Ninguna de las otras 6
 * gramáticas soportadas representa la escritura por atributo con un nodo con
 * forma de llamada (todas usan `member`/`attribute`/`field`/`selector`), así
 * que esta rama es inocua fuera de Ruby — no es una excepción por lenguaje,
 * es una forma que sólo una gramática produce.
 */
function isAttributeWriteShaped(node: ProbeNode): boolean {
  if (!isCallShaped(node)) return false;
  if (node.childForFieldName("receiver") === null) return false;
  return node.childForFieldName("arguments") === null && node.childForFieldName("argument_list") === null;
}

/** `x++`/`x--` (JS/TS/Java/C#) o `x++`/`x--` como sentencia (Go: `inc_dec_statement`). */
function isUpdateShaped(node: ProbeNode): boolean {
  const tokens = tokensOf(node);
  return tokens.includes("update") || (tokens.includes("inc") && tokens.includes("dec"));
}

/**
 * Campo GENÉRICO de "prueba" de un condicional/bucle — los MISMOS cuatro
 * nombres que `unreachable-code.ts#CONTROL_FIELDS` ya usa para reconocer
 * if/while por FORMA. Ver JUICIO DE PRECISIÓN #3 en el docstring del módulo.
 */
const CONDITION_FIELD = "condition";
/** Las ramas que se EJECUTAN según esa prueba — nunca la prueba en sí. */
const BRANCH_FIELDS = ["consequence", "alternative", "body"] as const;

function hasConditionField(node: ProbeNode): boolean {
  return node.childForFieldName(CONDITION_FIELD) !== null;
}

/**
 * Identificador o acceso a través de algo — nunca un literal, que podría
 * coincidir de casualidad con el mismo texto que una cadena de acceso real.
 * `isAttributeWriteShaped` entra acá (JUICIO DE PRECISIÓN #6) para que la
 * exclusión por GUARDA de JUICIO #3 vea en Ruby lo mismo que ve en los otros
 * seis: sin esto, `sink.value = x if sink.value.nil?` no reconocería su
 * propia cadena dentro de la condición y volvería a emitir un hallazgo que en
 * cualquier otro lenguaje ya se excluye.
 */
function isReferenceShaped(node: ProbeNode): boolean {
  return isIdentifier(node) || isAccessorShaped(node) || isAttributeWriteShaped(node);
}

function chainText(node: ProbeNode): string {
  return (node as AstNode).text.trim();
}

/**
 * `true` cuando `root` (o algún descendiente con FORMA de referencia,
 * acotado en profundidad) tiene el texto EXACTO `needle` — la prueba
 * estructural detrás de las dos exclusiones de JUICIO DE PRECISIÓN #3: la
 * GUARDA (¿la condición que envuelve esta asignación ya prueba la MISMA
 * cadena que se está asignando?) y la AUTO-REFERENCIA (¿el lado derecho ya
 * lee el mismo parámetro que está reasignando?). Restringido a nodos con
 * forma de referencia (`isReferenceShaped`) para no confundir un LITERAL de
 * texto que coincide por casualidad con una referencia real.
 */
function containsChainReference(root: ProbeNode, needle: string, depth: number): boolean {
  if (needle && isReferenceShaped(root) && chainText(root) === needle) return true;
  if (depth <= 0) return false;
  for (let i = 0; i < root.childCount; i++) {
    const child = root.child(i);
    if (child && child.isNamed && containsChainReference(child, needle, depth - 1)) return true;
  }
  return false;
}

/**
 * Clave posicional estable — NUNCA identidad de objeto: dos llamadas a
 * `child()`/`childForFieldName()` sobre el mismo nodo lógico pueden devolver
 * wrappers distintos según el binding (mismo motivo documentado en
 * `demeter-chain.ts#positionKey`, que este archivo no importa para no
 * acoplarse a otro detector por algo tan chico — DUPLICACIÓN DECLARADA).
 */
function positionKey(node: ProbeNode): string {
  const real = node as AstNode;
  return `${real.startPosition.row}:${real.startPosition.column}:${real.endPosition.row}:${real.endPosition.column}`;
}

/** Profundidad compartida por las tres búsquedas acotadas de JUICIO DE PRECISIÓN #3 — misma magnitud que `lazy-init-repetida.ts`/`flag-accumulator.ts` (10-12) para el mismo tipo de búsqueda ("dentro del cuerpo de un bloque, acotado"). */
const STRUCTURAL_SEARCH_DEPTH = 12;

interface AssignmentSite {
  target: ProbeNode;
  site: ProbeNode;
}

/** Todos los sitios de asignación/actualización dentro de `node` (misma forma que el bucle principal de `run()`), acotados en profundidad — para preguntarle a cada uno, antes de que el recorrido principal los visite, "¿tu cadena ya aparece en la condición que te envuelve?". */
function collectAssignmentSites(node: ProbeNode, depth: number, out: AssignmentSite[]): void {
  if (depth <= 0) return;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child || !child.isNamed) continue;
    if (isAssignmentShaped(child)) {
      const target = child.childForFieldName("left") ?? child.childForFieldName("target");
      if (target) out.push({ target, site: child });
    } else if (isUpdateShaped(child)) {
      out.push({ target: child, site: child });
    }
    collectAssignmentSites(child, depth - 1, out);
  }
}

/**
 * Marca en `guarded` (por posición) cada asignación dentro de las ramas
 * EJECUTADAS de `condNode` cuya cadena YA aparece, textualmente, en la
 * condición que la envuelve — JUICIO DE PRECISIÓN #3 (ver el docstring del
 * módulo): `if (x is None) { x = default() }`, `if (header.Title == "") {
 * header.Title = ... }`. `condNode` es cualquier nodo con campo `condition`
 * propio (`hasConditionField`) — confirmado por sonda directa
 * (`scratchpad/probe-loop-fields.mjs`) que esto cubre `if`/ternario en los
 * seis lenguajes y `while` en JS/TS/Java/Python, pero NO el `for` de estilo
 * "mientras" de Go ni el `do-while` de C# (ninguno de los dos expone
 * `condition` como CAMPO, sólo posicionalmente) — límite declarado, no
 * escondido: esos dos casos dependen en cambio de la auto-referencia de
 * abajo cuando el lado derecho la tiene (`args = args[1:]` sí cae ahí;
 * `value = quotient` de un extractor de dígitos por `do-while`, no).
 */
function markGuardedAssignments(condNode: ProbeNode, guarded: Set<string>): void {
  const condition = condNode.childForFieldName(CONDITION_FIELD);
  if (!condition) return;
  for (const field of BRANCH_FIELDS) {
    const branch = condNode.childForFieldName(field);
    if (!branch) continue;
    const sites: AssignmentSite[] = [];
    collectAssignmentSites(branch, STRUCTURAL_SEARCH_DEPTH, sites);
    for (const { target, site } of sites) {
      const needle = chainText(target);
      if (needle && containsChainReference(condition, needle, STRUCTURAL_SEARCH_DEPTH)) {
        guarded.add(positionKey(site));
      }
    }
  }
}

/**
 * Texto del operador de una asignación, o `null` cuando la gramática lo deja
 * IMPLÍCITO (`=` liso, sin campo ni hijo propio — Python/Ruby/TS/JS lo
 * hacen así para la asignación simple). Dos formas confirmadas por sonda
 * directa (`scratchpad/probe-compound-assign2.mjs`, JUICIO DE PRECISIÓN #3):
 *   - Campo `operator` — Python (`augmented_assignment`), Ruby
 *     (`operator_assignment`), TS/JS (`augmented_assignment_expression`) lo
 *     exponen SÓLO en la forma compuesta; Go y Java usan el MISMO tipo de
 *     nodo para `=` y para compuesto, con el campo resolviendo el texto
 *     real en AMBOS casos (incluido `"="` liso).
 *   - Ningún campo, pero un HIJO NOMBRADO propio cuyo tipo lleva el token
 *     "operator" (`assignment_operator`) — el único caso confirmado es C#,
 *     que no expone este dato como campo en absoluto.
 */
function assignmentOperatorText(node: ProbeNode): string | null {
  const field = node.childForFieldName("operator");
  if (field) return (field as AstNode).text.trim();
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.isNamed && tokensOf(child).includes("operator")) {
      return (child as AstNode).text.trim();
    }
  }
  return null;
}

/**
 * `true` para cualquier operador de asignación que NO sea el `=` liso —
 * `+=`, `-=`, `%=`, `|=`, etc. JUICIO DE PRECISIÓN #3: un operador compuesto
 * LEE el valor anterior para calcular el nuevo — nunca "ignora" el valor
 * recibido, la preocupación LITERAL de S1226 — así que nunca es este smell,
 * en NINGÚN lenguaje soportado, nunca sólo en unos cuantos.
 */
function isCompoundAssignment(node: ProbeNode): boolean {
  const operator = assignmentOperatorText(node);
  return operator !== null && operator !== "=";
}

function firstNamedChild(node: ProbeNode): ProbeNode | null {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.isNamed) return child;
  }
  return null;
}

/** El único hijo nombrado de `node`, o `null` si tiene cero o más de uno. Wrappers de agrupación (listas de un solo elemento, paréntesis) se atraviesan de forma transparente con esto. */
function onlyNamedChild(node: ProbeNode): ProbeNode | null {
  let only: ProbeNode | null = null;
  let count = 0;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.isNamed) {
      count++;
      if (count > 1) return null;
      only = child;
    }
  }
  return count === 1 ? only : null;
}

interface BaseResult {
  name: string;
  /** `true` cuando `node` (tras atravesar sólo wrappers de agrupación) ES el identificador — reasignación. `false` cuando se llegó a él bajando por al menos un acceso a miembro/índice — mutación. */
  direct: boolean;
  /**
   * `true` cuando el acceso que se apoya DIRECTAMENTE sobre la base es por
   * ÍNDICE (`p[i] = …`, `p[i].campo = …`) y no por campo (`p.campo = …`,
   * `p.campo[i] = …`) — ver JUICIO DE PRECISIÓN #5 en el docstring del
   * módulo. Es "directamente sobre la base" a propósito: lo que decide es
   * qué se le hace AL PARÁMETRO, no qué se le hace a algo que cuelga de él.
   */
  indexOnBase: boolean;
  /** Uso interno de la recursión: `true` mientras el resultado viene del identificador mismo (o de un wrapper de agrupación sobre él) y todavía no lo envolvió ningún accesor. */
  atBase: boolean;
}

/**
 * Sigue la cadena estructural de `node` hacia su base. Recursión ACOTADA por
 * construcción: cada llamada baja a un hijo real del árbol, que es finito —
 * no hace falta un límite de profundidad artificial.
 */
function resolveBase(node: ProbeNode, topLevel: boolean): BaseResult | null {
  if (isIdentifier(node)) {
    // Cast en la hoja, igual que `empty-catch.ts`/`repeated-switch.ts`: sólo acá hace falta `.text`.
    return { name: (node as AstNode).text, direct: topLevel, indexOnBase: false, atBase: true };
  }
  // JUICIO DE PRECISIÓN #6: una escritura POR ATRIBUTO que la gramática
  // representa con forma de llamada (Ruby) sigue por su `receiver` — nunca
  // por el primer hijo nombrado, que acá también lo es pero podría no serlo.
  if (isAttributeWriteShaped(node)) {
    const receiver = node.childForFieldName("receiver");
    if (!receiver) return null;
    const result = resolveBase(receiver, false);
    if (!result) return null;
    return { name: result.name, direct: false, indexOnBase: result.atBase ? false : result.indexOnBase, atBase: false };
  }
  if (isCallShaped(node)) return null;
  if (isAccessorShaped(node)) {
    const inner = firstNamedChild(node);
    if (!inner) return null;
    const result = resolveBase(inner, false);
    if (!result) return null;
    return {
      name: result.name,
      direct: false,
      // Sólo el accesor que se apoya sobre la base decide (`result.atBase`);
      // más arriba en la cadena, lo que ya se supo se conserva.
      indexOnBase: result.atBase ? isIndexAccessorShaped(node) : result.indexOnBase,
      atBase: false,
    };
  }
  const only = onlyNamedChild(node);
  if (only) return resolveBase(only, topLevel);
  return null;
}

function paramListNode(fnNode: ProbeNode): ProbeNode | null {
  return fnNode.childForFieldName("parameters") ?? fnNode.childForFieldName("parameter_list");
}

/** Nombre de un parámetro individual, probando las formas genéricas confirmadas por sonda: identificador directo, campo `name`, campo `pattern` (TypeScript tipado). `null` si ninguna resuelve a un identificador — destructuring y formas no reconocidas quedan fuera, a propósito (confianza baja). */
function paramName(node: ProbeNode): string | null {
  if (isIdentifier(node)) return (node as AstNode).text;
  const named = node.childForFieldName("name");
  if (named && isIdentifier(named)) return (named as AstNode).text;
  const pattern = node.childForFieldName("pattern");
  if (pattern && isIdentifier(pattern)) return (pattern as AstNode).text;
  return null;
}

/**
 * C# `out`/`ref` (nunca `in`, que es de sólo lectura y no se puede reasignar
 * de todos modos): confirmado por sonda directa
 * (`scratchpad/precision-front/probe-csharp-outref.mjs`) que un parámetro
 * con uno de estos dos modificadores lleva un hijo NOMBRADO propio
 * `parameter_modifier` — nunca vocabulario de dominio, es el nombre de
 * campo que la gramática de C# ya dedica a esto. Ver JUICIO DE PRECISIÓN en
 * el docstring del módulo: asignarle un valor a un parámetro `out`/`ref` no
 * es "mutar/reasignar un argumento" en el sentido del olor — es LA FORMA en
 * que C# devuelve un valor por esa vía (`out` incluso lo EXIGE: el
 * compilador rechaza un método que no le asigna algo a cada `out` antes de
 * `return`).
 */
const OUT_OR_REF_MODIFIER = /^(out|ref)$/;

function hasOutOrRefModifier(paramNode: ProbeNode): boolean {
  for (let i = 0; i < paramNode.childCount; i++) {
    const child = paramNode.child(i);
    if (child && child.isNamed && child.type === "parameter_modifier" && OUT_OR_REF_MODIFIER.test((child as AstNode).text.trim())) {
      return true;
    }
  }
  return false;
}

/** Nombres de parámetro en orden de declaración — el orden es lo que deja saber cuál es "el primero" (ver la supresión del receptor de método en el docstring). Un parámetro C# `out`/`ref` queda AFUERA (ver `hasOutOrRefModifier`, JUICIO DE PRECISIÓN en el docstring del módulo): nunca se rastrea, así que asignarle nunca puede disparar un hallazgo. */
function collectParameterNames(fnNode: ProbeNode): readonly string[] {
  const list = paramListNode(fnNode);
  if (!list) return [];
  const names: string[] = [];
  for (let i = 0; i < list.childCount; i++) {
    const child = list.child(i);
    if (!child || !child.isNamed) continue;
    if (hasOutOrRefModifier(child)) continue;
    const name = paramName(child);
    if (name) names.push(name);
  }
  return names;
}

/**
 * Los cuatro shapes de tipo declarado que Go representa POR REFERENCIA — ver
 * JUICIO DE PRECISIÓN #2 en el docstring del módulo. Nombres de nodo de la
 * gramática, confirmados por sonda directa, nunca vocabulario de dominio.
 */
const GO_REFERENCE_TYPE_NODES = new Set(["pointer_type", "slice_type", "map_type", "channel_type"]);

/**
 * Los tres shapes de tipo declarado que Go COPIA por valor — un nombre de
 * tipo simple (que también cubre, sin poder distinguirlo, un parámetro
 * genérico — ver el límite declarado en el docstring del módulo), un tipo
 * calificado por paquete, y un array de tamaño fijo (a diferencia de un
 * slice). Confirmado por sonda directa.
 */
const GO_VALUE_TYPE_NODES = new Set(["type_identifier", "qualified_type", "array_type"]);

/**
 * `true` sólo cuando el tipo declarado de `paramNode` resuelve a uno de
 * `GO_VALUE_TYPE_NODES` — es decir, cuando SÍ se puede confirmar, sin
 * inferencia, que una mutación a través de este parámetro nunca sale de la
 * función. Cualquier otra forma (`GO_REFERENCE_TYPE_NODES`, o un tipo que no
 * resuelve, o un shape no reconocido como `function_type`) devuelve `false`:
 * el default es NO suprimir, igual que en cualquier otro lenguaje.
 */
function isGoConfirmedValueTypeParam(paramNode: ProbeNode): boolean {
  const type = paramNode.childForFieldName("type");
  return !!type && GO_VALUE_TYPE_NODES.has(type.type);
}

const EMPTY_STRING_SET: ReadonlySet<string> = new Set();

/**
 * Nombres de parámetro Go confirmados de tipo valor (`isGoConfirmedValueTypeParam`).
 * Vacío para cualquier otro lenguaje — nunca se computa fuera de Go, así que
 * nunca puede suprimir nada fuera de Go (ver `run()`, único llamador).
 */
function collectGoValueTypeParamNames(fnNode: ProbeNode, language: string): ReadonlySet<string> {
  if (language !== "go") return EMPTY_STRING_SET;
  const list = paramListNode(fnNode);
  if (!list) return EMPTY_STRING_SET;
  const names = new Set<string>();
  for (let i = 0; i < list.childCount; i++) {
    const child = list.child(i);
    if (!child || !child.isNamed) continue;
    if (!isGoConfirmedValueTypeParam(child)) continue;
    const name = paramName(child);
    if (name) names.add(name);
  }
  return names;
}

function severityFor(variant: Variant, occurrences: number): number {
  const base = variant === "reassignment" ? 35 : 50;
  return Math.min(100, base + occurrences * 10);
}

function buildFinding(fn: FunctionUnit, paramName_: string, variant: Variant, hits: readonly AstNode[], threshold: Threshold): RawFinding | null {
  const fnLabel = fn.name ?? "función anónima";
  const isReassignment = variant === "reassignment";
  const locations = hits.map((hit) => ({
    file: fn.file,
    startLine: hit.startPosition.row + 1,
    endLine: hit.endPosition.row + 1,
    symbol: paramName_,
    role: isReassignment ? `reasignación de "${paramName_}"` : `mutación de "${paramName_}"`,
  }));
  // `.map()` sólo tipa `T[]`; destructurar el primer elemento (garantizado por
  // el llamador: `hits.length > 0`) es lo que deja ver la tupla no vacía sin
  // un cast — mismo patrón que `repeated-switch.ts`.
  const [firstLocation, ...restLocations] = locations;
  if (!firstLocation) return null;

  const count = hits.length;
  // Para `mutation`: cuando llegamos acá, el llamador (`run()`) ya descartó
  // los parámetros Go confirmados de tipo valor
  // (`collectGoValueTypeParamNames`) — todo lo que queda, en CUALQUIER
  // lenguaje soportado, es un caso donde el cambio SÍ puede ser visible para
  // quien llamó (confirmado por tipo declarado en Go; por semántica del
  // lenguaje en el resto), así que ya no hace falta un texto hedgeado por
  // lenguaje — ver JUICIO DE PRECISIÓN #2 en el docstring del módulo.
  const detail = isReassignment
    ? `El valor original recibido en "${paramName_}" deja de estar disponible dentro de "${fnLabel}": quien necesite depurar qué llegó realmente como argumento ya no puede recuperarlo, y el nombre del parámetro deja de significar una sola cosa a lo largo del cuerpo de la función.`
    : `"${fnLabel}" modifica el objeto recibido en "${paramName_}" en lugar de trabajar sobre una copia propia. Quien llamó a la función puede ver ese cambio reflejado en el valor que pasó, aunque nunca haya pedido que se modificara.`;

  return {
    variant,
    title: isReassignment ? `El parámetro "${paramName_}" se reasigna dentro de "${fnLabel}"` : `El parámetro "${paramName_}" se muta dentro de "${fnLabel}"`,
    detail,
    trigger: [{ label: isReassignment ? "reasignaciones" : "mutaciones", value: count, threshold }],
    locations: [firstLocation, ...restLocations],
    severity: severityFor(variant, count),
    advice: {
      primary: isReassignment
        ? {
            name: "Introducir una variable nueva en vez de reasignar el parámetro",
            kind: "refactorizacion",
            why: "Reasignar un parámetro tapa el valor original con el que se invocó la función; una variable local nueva deja ambos valores disponibles y hace explícito que se trata de una transformación, no del argumento crudo.",
            source: "https://rules.sonarsource.com/rspec/S1226/",
          }
        : {
            name: "Clonar el argumento antes de modificarlo, o documentar la mutación como intencional",
            kind: "refactorizacion",
            why: "Mutar un objeto recibido como parámetro acopla a quien llama con un efecto secundario invisible en la firma de la función; clonarlo antes de modificarlo (o declarar explícitamente que la función muta su argumento a propósito) hace ese contrato visible.",
            source: "https://rules.sonarsource.com/rspec/S1226/",
          },
    },
  };
}

/**
 * `true` cuando el grafo confirma que un contrato EXTERNO impone la firma
 * de `fn` — ver JUICIO DE PRECISIÓN #4 en el docstring del módulo. Degrada a
 * `false` sin grafo (pasada 1, interruptor de vuelta atrás, o build de
 * grafo fallido) — CONTRATO-UNIFICACION.md §2 lo exige.
 */
function contractImposesSignature(fn: FunctionUnit, ctx: RunContext<ThresholdKey>): boolean {
  const graph = ctx.graph ?? null;
  const index = ctx.graphIndex?.() ?? null;
  if (!graph || !index) return false;
  return signatureImposedByContract(fn, graph, index);
}

export const detector: IntraFunctionDetector<ThresholdKey, "argument-mutation"> = {
  id: "argument-mutation",
  kind: "argument-mutation",
  scope: "intra-function",
  title: "Mutación de argumento",
  needs: [],
  // OLA N, FRENTE B1b — ver JUICIO DE PRECISIÓN #4 en el docstring del
  // módulo y CONTRATO-UNIFICACION.md. Sigue siendo correcto sin grafo (ver
  // `contractImposesSignature`, que degrada a `false`).
  needsGraph: true,
  thresholds: {
    // SonarSource RSPEC-1226: la propia norma cita el número — a partir de la
    // PRIMERA reasignación/mutación ya está el hallazgo completo, no hay una
    // magnitud "cuántas es demasiadas" por debajo de eso.
    presence: citado(1, {
      work: "SonarSource",
      rule: "S1226",
      url: "https://rules.sonarsource.com/rspec/S1226/",
    }),
  },

  run(fn: FunctionUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const paramNames = collectParameterNames(fn.node);
    if (paramNames.length === 0) return [];
    const paramIndex = new Map(paramNames.map((name, i) => [name, i] as const));
    const isMethod = fn.metrics.className !== null;

    // JUICIO DE PRECISIÓN #3 (ver el docstring del módulo): sitios cuya
    // cadena YA aparece en la condición que los envuelve — un pase aparte
    // porque hace falta CONOCER esa condición antes de decidir si el sitio
    // cuenta, y `walkTree` no da acceso al padre de un nodo.
    const guardedPositions = new Set<string>();
    walkTree(fn.node, (node) => {
      if (node.isNamed && hasConditionField(node)) markGuardedAssignments(node, guardedPositions);
    });

    const reassign = new Map<string, AstNode[]>();
    const mutate = new Map<string, AstNode[]>();

    walkTree(fn.node, (node) => {
      if (!node.isNamed) return;
      let target: ProbeNode | null = null;
      if (isAssignmentShaped(node)) {
        target = node.childForFieldName("left") ?? node.childForFieldName("target");
      } else if (isUpdateShaped(node)) {
        target = node;
      }
      if (!target) return;

      // JUICIO DE PRECISIÓN #3: un incremento (`x++`) o un operador
      // compuesto (`+=`) LEE el valor anterior para construir el nuevo —
      // nunca "ignora" el valor recibido, así que nunca es este smell (ver
      // `isCompoundAssignment`/`isUpdateShaped` y el docstring del módulo).
      if (isUpdateShaped(node) || isCompoundAssignment(node)) return;

      // JUICIO DE PRECISIÓN #3: el sitio ya está guardado por una condición
      // que prueba la MISMA cadena (`markGuardedAssignments`, arriba) — un
      // valor por defecto o una construcción perezosa no es un descuido.
      if (guardedPositions.has(positionKey(node))) return;

      const base = resolveBase(target, true);
      if (!base) return;
      const idx = paramIndex.get(base.name);
      if (idx === undefined) return;
      // Receptor de método en Python (posición cero, `self`/`cls` por
      // convención): mutar sus atributos es el diseño OO normal, no un
      // smell — ver el docstring del módulo. Acotado a Python porque es el
      // único de los seis lenguajes soportados donde el receptor es un
      // parámetro declarado.
      if (!base.direct && isMethod && idx === 0 && fn.language === "python") return;

      // JUICIO DE PRECISIÓN #5 (ver el docstring del módulo): escribir EN UN
      // ÍNDICE del parámetro (`p[i] = …`, `p[i].campo = …`) es usarlo como
      // ALMACENAMIENTO que el llamador entregó para eso — no es la mutación
      // sorpresiva que este detector describe. Sólo cuando el índice se apoya
      // DIRECTAMENTE sobre el parámetro (`base.indexOnBase`): `p.items[i] =
      // …` no es lo mismo y sigue reportándose.
      if (!base.direct && base.indexOnBase) return;

      // JUICIO DE PRECISIÓN #3, sólo `reassignment`: el lado derecho YA LEE
      // el mismo parámetro que reasigna (`value = value.trim()`, `count =
      // count + 1`) — transformar-y-reasignar CONSUME el valor original
      // para producir el nuevo, nunca lo pierde. `mutation` no aplica esta
      // exclusión a propósito: ahí "acumulador legítimo" y "mutación real"
      // siguen siendo indistinguibles por esta vía (ver el docstring).
      if (base.direct) {
        const rhs = node.childForFieldName("right") ?? node.childForFieldName("value");
        if (rhs && containsChainReference(rhs, base.name, STRUCTURAL_SEARCH_DEPTH)) return;
      }

      const real = node as AstNode;
      const bucket = base.direct ? reassign : mutate;
      const list = bucket.get(base.name) ?? [];
      list.push(real);
      bucket.set(base.name, list);
    });

    // Sólo para Go, y sólo cuando el tipo declarado lo confirma (ver JUICIO
    // DE PRECISIÓN #2 en el docstring del módulo) — vacío en cualquier otro
    // lenguaje, así que la línea de abajo nunca suprime nada fuera de Go.
    const goValueTypeParams = collectGoValueTypeParamNames(fn.node, fn.language);

    // JUICIO DE PRECISIÓN #4 (ver el docstring del módulo): un contrato
    // EXTERNO, visible sólo por el grafo, impone la firma COMPLETA de `fn`
    // — un miembro de igual nombre+aridad en algo que su contenedor
    // implementa/extiende, o `fn` guardada como valor en otro lado
    // (delegado registrado). Sólo afecta `mutation`: `reassignment` nunca
    // escapa a quien llama, con o sin contrato (ver el docstring de la
    // variante, arriba). Calculado UNA vez por función, no por parámetro:
    // la firma se impone entera o no se impone.
    const contractFixed = contractImposesSignature(fn, ctx);

    const threshold = ctx.threshold("presence");
    const findings: RawFinding[] = [];
    for (const name of paramNames) {
      const reassignHits = reassign.get(name);
      if (reassignHits && reassignHits.length > 0) {
        const built = buildFinding(fn, name, "reassignment", reassignHits, threshold);
        if (built) findings.push(built);
      }
      const mutateHits = mutate.get(name);
      // Un parámetro Go confirmado de tipo valor: Go garantiza que este
      // cambio nunca sale de la función — no es el fenómeno que este
      // detector describe, así que no genera hallazgo (nunca sólo baja
      // severidad). `contractFixed`: el grafo confirma que ESTA firma
      // completa la impone algo externo — ver JUICIO DE PRECISIÓN #4.
      if (mutateHits && mutateHits.length > 0 && !goValueTypeParams.has(name) && !contractFixed) {
        const built = buildFinding(fn, name, "mutation", mutateHits, threshold);
        if (built) findings.push(built);
      }
    }
    return findings;
  },
};
