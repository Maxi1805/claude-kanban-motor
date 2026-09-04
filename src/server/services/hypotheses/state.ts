/**
 * *** OLA AK, FRENTE AK1 — LA SEGUNDA COMPUERTA IMPOSIBLE DE ESTE ARCHIVO, Y
 * LA SEXTA FORMA DE "CAMPO PROPIO": EL DISCRIMINANTE **ES** EL RECEPTOR ***
 *
 * EL PUNTO DE PARTIDA, RE-CONTADO POR MÍ SOBRE MI PROPIO VOLCADO (no heredado
 * de ningún informe): Go aporta **382 candidatos** a las TRES anclas de
 * switch/cadena — **LIB 181** (hugo 180 + cobra 1) y **APP 201** (gitea 201) —
 * y con la QUINTA forma de AJ5 ya en producción sobreviven **6**.
 *
 * (A) **CONCLUSIÓN NEGATIVA, MEDIDA ANTES DE CONSTRUIR: la QUINTA forma
 *     (`R.campo`) está AGOTADA.** De los 73 discriminantes con forma `R.campo`,
 *     13 confirman hoy. Clasifiqué los 60 restantes UNO POR UNO resolviendo la
 *     función encerrante y preguntándole al árbol por su `receiver`:
 *       · **24** — la función SÍ tiene receptor, pero el calificador es OTRO
 *         nombre ⇒ es un local/parámetro (`ns.After` con `lv.kind`, `d` con
 *         `conf.TargetFormat`…).
 *       · **32** — NINGUNA función del stack declara receptor: es un `func`
 *         suelto (`cobra.go:118 func Gt(a, b any)` con `av.kind`,
 *         `IsTruthfulValue` con `val.Kind`…).
 *       · **4** — la más angosta no tiene receptor y ninguna envolvente coincide.
 *       · **0** — receptor de una función ENVOLVENTE. La hipótesis "el switch
 *         está en un literal anidado dentro del método y el receptor está una
 *         función más afuera" tiene **población CERO** en los tres repos de Go.
 *     **Los 60 están correctamente rechazados. Esa forma no se toca.**
 *
 * (B) **LA COMPUERTA QUE SÍ QUEDABA, Y ES LA FIGURA DE AH3 EXACTA.** Cuando la
 *     gramática declara el método sobre un VALOR, el discriminante del switch
 *     no es un campo *del* objeto: **ES el objeto**. Las CINCO formas que
 *     `selfPrefixCheck` reconocía describen todas "un campo DE algo" y ninguna
 *     puede reconocer esto **por construcción**: `SELF_PREFIX` pide un prefijo
 *     que aquí no tiene qué prefijar; `declaresMemberNamed` (fondo de la 2.ª y
 *     la 3.ª) exige un nodo class-like que CONTENGA al switch, y el método es
 *     una declaración de nivel superior ⇒ `narrowestClassAround` = `null`
 *     SIEMPRE; y `RECEIVER_QUALIFIED` (5.ª) exige un punto que aquí no existe.
 *     **Población medida antes de escribir una línea: 14 candidatos — LIB 4
 *     (hugo) · APP 10 (gitea) —, y los 14 tenían `hypotheses: []`: SILENCIO
 *     TOTAL, ningún patrón proponía nada sobre ellos.**
 *
 * EL HECHO QUE LA DECIDE (condición 4 de la receta, verificada PRIMERO):
 * `fnNode.childForFieldName("receiver")`, el mismo dato que `proxy.ts#goReceiverOf`,
 * `detect/intra-file/temporary-field.ts` y `lazy-init-repetida.ts` ya leen en
 * producción y que `receiverNameOf` (AJ5) usa acá. Umbral de existencia fijado
 * antes de medir —≥1 caso en ≥2 repos— y **cumplido: hugo y gitea**.
 *
 * ESCALA: **ningún número nuevo.** `STATE_MIN_METHODS`/`STATE_MIN_BRANCHES`
 * intactos; la forma entra ANTES de esas compuertas, nunca en lugar de ellas.
 * RESOLUCIÓN: `appliedState` sin un solo cambio.
 *
 * POR QUÉ NO ENTRA EN `implicitSelfNeedsTransitionEvidence` (decidido y escrito
 * ANTES de medir, `scratchpad-ak1/CRITERIO.md`): (a) ese gate vigila la duda
 * *"¿esto es siquiera propio?"*, y acá no hay duda ninguna — el receptor ES el
 * objeto, por gramática, sin una sola inferencia; es el mismo argumento por el
 * que `selfPrefixed` y `receiverQualifiedSelf` tampoco entran. (b) **MEDIDO:
 * `scanTransition` no lleva información para esta forma.** Su regex
 * (`(?:self\.|this\.|@)?NOMBRE\s*=(?!=)`) **no tiene límite de palabra a la
 * izquierda**, así que con un receptor corto matchea cualquier identificador
 * más largo terminado en ese nombre: verificado ejecutándolo, con `NOMBRE="h"`
 * tanto `"path = 1"` como `"length = 2"` dan `true`.
 *
 * LO QUE PRODUJO, MEDIDO CON UN CONTRAFÁCTICO DE UNA SOLA VARIABLE Y PUBLICADO
 * SIN RECORTAR NADA (informe `ola-ak/informes/AK1.md`): **+4 hipótesis en
 * bibliotecas (hugo) y +6 en aplicaciones (gitea), las 10 recomendaciones
 * (`ausente`), CERO perdidas.** Las 10 las abrí YO en el archivo real:
 * **0 verdaderas de 10 = 0,0 % [0,0 %, 27,8 %]**, contra un techo de ancla de
 * 87-90 %.
 *
 * Y EL DIAGNÓSTICO, QUE ES EL ENTREGABLE Y HAY QUE DEJARLO ESCRITO: **las 10
 * son la MISMA figura y es GRUPO 3.** Un tipo con nombre sobre un valor
 * (`Format int`, `CommentType int`, `packages.Type string`,
 * `HookEventType string`), con la decisión repetida en 2-3 miembros —el olor de
 * nivel 1 es REAL: agregar un valor obliga a tocar todos— pero **sin transición
 * POSIBLE** (un valor no cambia de estado) y con ramas que **devuelven un DATO**,
 * no comportamiento. Es, palabra por palabra, lo que el `toConfirm` de
 * `enumerated-field-dispatch` ya nombra: *"si cada una sólo devuelve un dato
 * distinto, la respuesta es una tabla, no una jerarquía de estados"*. **Y hay
 * precedente medido: la Ola AC midió esa misma población con su propio ancla y
 * dio 1 verdadera de 20 (5,0 %), y la retiró.** La compuerta era real e
 * imposible; **del otro lado hay un cuarto del grupo 3**. No se recorta nada, y
 * no se propone ningún patrón nuevo (regla 1).
 */

/**
 * *** OLA AJ, FRENTE AJ5 — LA AUDITORÍA DE COMPUERTAS DE ESTE MÓDULO, Y LA
 * QUINTA FORMA DE "CAMPO PROPIO" ***
 *
 * EL EMBUDO, MEDIDO SOBRE LAS 13 BIBLIOTECAS CON LA TRAZA QUE AI4 DEJÓ EN
 * PRODUCCIÓN (`startStateTrace`), UNA FILA POR ANCLA:
 *
 *   | ancla                | n   | pasan los 4 `required` | `discriminante-campo-propio` mata |
 *   |----------------------|----:|-----------------------:|----------------------------------:|
 *   | `repeated-switch`    | 156 |   5                    | 141 / 156 = **90,4 %**            |
 *   | `conditional-chain`  | 382 |   8                    | 368 / 382 = **96,3 %**            |
 *   | `type-switch`        | 286 |  15                    | 264 / 286 = **92,3 %**            |
 *   | `temporary-field`    | 214 | 206                    |   0 / 214 = **0,0 %**             |
 *
 * DOS CONCLUSIONES, Y LAS DOS SON DEL TIPO QUE LA OLA BUSCA:
 *
 * (A) **`temporary-field` NO TIENE COMPUERTA.** 206 de 214 candidatos pasan;
 *     la única que mata algo (`repetido-en-2-o-mas-metodos`) mata 8. Su celda
 *     mide 6,5 % contra un techo de ancla de 78,4 %, y **esos 72 puntos de
 *     holgura NO los explica ningún `required`: los explica la POBLACIÓN.** El
 *     propio detector-ancla lo dice en su `advice`: su remedio PRIMARIO es
 *     *Extract Class*, y State va con la salvedad escrita *"sólo aplica si el
 *     comportamiento cambia con el hueco"*. **No se toca nada acá** (regla
 *     aditiva): el número se publica y el ancla sigue emitiendo.
 *
 * (B) **`selfPrefixCheck` ERA IMPOSIBLE POR CONSTRUCCIÓN PARA GO ENTERO —
 *     RESUELTO por la QUINTA y la SEXTA forma (Olas AJ y AK); ver la medición
 *     de la Ola AZ pegada a `SELF_PREFIX`, más abajo: hoy Go emite 32 de 764
 *     (4,2 %), la tercera tasa más alta de los diez lenguajes.**
 *     Medido ENTONCES: **184 candidatos de Go en las tres anclas de
 *     switch/cadena (cobra + hugo), 0 supervivientes.** No es que rindiera
 *     mal: no podía pasar.
 *     Las cuatro formas que el check reconocía fallan las cuatro por la misma
 *     razón gramatical:
 *       1. `SELF_PREFIX` sólo reconoce `self.`/`this.`/`@`; el receptor de Go
 *          se llama como el autor quiso (`p`, `ps`, `av`, `r`).
 *       2. `BARE_IDENTIFIER` rechaza el punto, así que `r.campo` ni siquiera
 *          llega a preguntarse por `declaresMemberNamed`.
 *       3. `declaresMemberNamed` exige un nodo class-like que CONTENGA al
 *          switch, y **un método de Go es un `func` de nivel superior: el
 *          `type T struct` está en otra declaración.** `narrowestClassAround`
 *          devuelve `null` ⇒ el check es `false` SIEMPRE, para todo Go.
 *       4. `capturedViaOwnGetter` termina en el mismo `declaresMemberNamed`.
 *     Son propiedades del LUGAR DONDE SE ESCRIBE LA DECLARACIÓN, no de la
 *     relación que State necesita ("el discriminante es estado del propio
 *     objeto").
 *
 * LA QUINTA FORMA — el arreglo, y por qué es aditivo. `isReceiverQualified`:
 * el discriminante tiene forma `R.campo` y `R` es el RECEPTOR DECLARADO de la
 * función que contiene el switch/cadena, con la guarda de sombreado por
 * parámetro aplicada ANTES de confirmar. Se evalúa **sólo cuando las cuatro
 * formas viejas ya fallaron**, así que no puede cambiar el resultado de
 * ninguna hipótesis que ya existía: es una disyunción más, nunca un filtro.
 * Ninguna de las cuatro formas viejas se tocó, ningún umbral se movió
 * (`STATE_MIN_METHODS`/`STATE_MIN_BRANCHES` intactos), ningún `required` se
 * agregó ni se quitó.
 *
 * EL HECHO QUE LA DECIDE, VERIFICADO ANTES DE ESCRIBIR UNA LÍNEA (condición 4
 * de la receta): `fnNode.childForFieldName("receiver")` **ya está en
 * producción en tres archivos** — `hypotheses/proxy.ts#goReceiverOf` (:367),
 * `detect/intra-file/temporary-field.ts` y
 * `detect/intra-file/lazy-init-repetida.ts` —, y `ctx.file` llega no-nulo en
 * las DOS pasadas desde el wiring por archivo de `hypotheses/run.ts`. **Ésas
 * son, palabra por palabra, las dos condiciones que el docstring de este mismo
 * módulo puso para reabrir Go** (*"hasta que exista AMBAS cosas: resolución de
 * receptor y una ola de wiring por-archivo"*, sección "FORMA EN LENGUAJES SIN
 * CLASES"). **Las dos se cumplieron hace olas y nadie había vuelto a mirar.**
 *
 * POR QUÉ NO ENTRA EN `implicitSelfNeedsTransitionEvidence` (decidido y
 * escrito ANTES de medir, `scratchpad-aj5/CRITERIO.md`): ese gate existe
 * porque un identificador DESNUDO que resuelve a un miembro es
 * indistinguible de un accesor de configuración fijo. El receptor explícito no
 * tiene esa ambigüedad: `r.campo` es sintácticamente el equivalente EXACTO de
 * `this.campo` — el receptor ES el `this`, escrito con otro nombre —, y
 * `selfPrefixed` tampoco entra en ese gate por la misma razón.
 *
 * LA CAPA POR LENGUAJE TRADUCE, NO DECIDE: no hay ninguna comparación contra
 * un nombre de lenguaje en este camino. Se le pregunta a la gramática si
 * expone un `receiver`; la que lo expone, contesta; la que no, devuelve `null`
 * y el camino queda igual que antes.
 *
 * ALCANCE DECLARADO, NO ESCONDIDO — dos límites medidos escribiendo esto:
 *   (a) El título de `repeated-switch` cita el discriminante SIN paréntesis, así
 *       que una LLAMADA al receptor (`ps.Kind()`) llega acá con la misma forma
 *       que un campo (`ps.kind`) y esta forma la confirma. Es el MISMO criterio
 *       que `capturedViaOwnGetter` ya acepta desde la Ola X ("el resultado de
 *       llamar a un miembro propio es estado propio"), no una laxitud nueva —
 *       pero conviene saberlo al leer la evidencia. Caso real: `hugo
 *       hugolib/page.go:331`.
 *   (b) Sólo UN nivel (`R.campo`). `R.otro.campo` es un campo DE un campo y esta
 *       hipótesis no resuelve esa cadena: se rechaza, con un test que lo fija.
 *
 * LO QUE PRODUJO, MEDIDO Y PUBLICADO SIN RECORTAR (Ola AJ, informe `AJ5.md`):
 * **+3 hipótesis en bibliotecas (2 recomendaciones, hugo) y +3 en aplicaciones
 * (3 recomendaciones, gitea), CERO perdidas sobre 1.899 filas de ancla.** Las
 * seis se abrieron a mano en el archivo real: **1 verdadera, 5 falsas — 1/5 =
 * 20,0 % [3,6 %, 62,4 %] sobre recomendación**, contra un techo de ancla de
 * 87,0 % en biblioteca. **Con n=5 esta medición no distingue la forma nueva ni
 * del promedio del catálogo ni de cero, y se publica así.**
 *
 * Y EL DATO QUE HAY QUE DEJAR ESCRITO PARA LA PRÓXIMA OLA, porque contradice lo
 * que uno esperaría: las 5 falsas son valores de CONFIGURACIÓN fijos que nunca
 * transicionan, así que la tentación es exigirles `transitionConfirmed`. **Está
 * medido y sería PEOR:** `transitionConfirmed` sale `true` en exactamente una de
 * las seis, y es una de las FALSAS (y encima por un falso positivo del regex de
 * `scanTransition`); la ÚNICA VERDADERA sale `false`, porque el código reasigna
 * escribiendo `review.Type = …` y `scanTransition` busca el texto `r.type =`.
 * **Exigir transición acá habría matado la única verdadera y conservado una
 * falsa: 1/5 se habría vuelto 0/1.**
 */

/**
 * *** R1 APLICADA — DOS ANCLAS RETIRADAS EN LA MISMA OLA (Ola AC, frente AC2) ***
 *
 * `anchors` pasa de tres a DOS. Las dos que salen, con su número:
 *
 *   1. **`temporary-field` — RETIRADA.** 7 verdaderas de 48 juicios = **14,6 %
 *      [7,2 %, 27,2 %]**, medido por el frente AC1 de esta misma ola sobre la
 *      salida COMPLETA (después del arreglo del agrupado), con 178
 *      recomendaciones en los 13 repos y 45 en `corpus-app/`. R1 dice: celda
 *      con n≥12 y precisión <20 % deja de emitir, salvo defecto concreto
 *      arreglado y medido en la misma ola. **No hay tal arreglo: el ancla
 *      nueva de abajo no es una corrección de ésta, es un reemplazo, y
 *      fracasó.** Precio publicado, no escondido: **−223 recomendaciones y −7
 *      unidades de cobertura útil** (53/445 → 46/445), porque las 7 verdaderas
 *      del proyecto en esta celda se van con ella. Ver `ola-ac/informes/AC2.md`
 *      §6.
 *
 *   2. **`enumerated-field-dispatch` — NUNCA LLEGA A EMITIR.** Es el ancla
 *      nueva, construida en esta ola para nombrar la FUERZA en vez del
 *      síntoma; se midió sobre las dos poblaciones completas y da **1
 *      verdadera de 20 recomendaciones = 5,0 % [0,9 %, 23,6 %]**, con las 28
 *      hipótesis de la celda juzgadas a mano. R1 dispara igual que sobre la
 *      vieja. **El detector queda escrito y DESREGISTRADO** (`detect/
 *      intra-file/enumerated-field-dispatch.ts`, 30 tests verdes) y la rama de
 *      abajo queda escrita y sin cablear: volver a encenderlo son DOS líneas
 *      —la de `detect/registry.ts` y la del array `anchors`— y ninguna otra.
 *      El código se conserva porque el experimento es el entregable del frente
 *      y tiene que poder re-medirse desde el árbol.
 *
 * Lo que queda: `repeated-switch` (5 recomendaciones) y `conditional-chain`
 * (7). **Las dos se declaran NO MEDIDAS por R3 y no pueden dejar de estarlo:
 * su población TOTAL es menor que el n≥12 que la regla exige.**
 */

/**
 * *** CUARTA ANCLA: `enumerated-field-dispatch` — LA FUERZA, NO EL SÍNTOMA
 * (Ola AC, frente AC2) — MEDIDA Y RETIRADA EN LA MISMA OLA, ver arriba ***
 *
 * POR QUÉ. Las tres anclas anteriores miran SÍNTOMAS que correlacionan flojo
 * con la situación que State resuelve, y la más grande lo mide sin lugar a
 * duda: `temporary-field` produce 178 recomendaciones sobre la salida completa
 * y 7 verdaderas de 48 juicios (14,6 % [7,2 %, 27,2 %], Ola AC/AC1 §5) — el
 * 85 % de lo que emite es una caché perezosa, un cursor de iterador o un
 * acumulador, tres formas que cumplen "el campo a veces está vacío" y ninguna
 * es una máquina de estados.
 *
 * LA FUERZA, escrita como la resuelve el patrón: *el comportamiento del objeto
 * cambia según un valor interno de un conjunto CERRADO, el objeto reasigna ese
 * valor durante su vida, y la decisión está repetida a mano en varios
 * miembros.* `detect/intra-file/enumerated-field-dispatch.ts` nombra
 * exactamente eso y nada más — su docstring lleva la intención de cada una de
 * las tres condiciones.
 *
 * LA TRAMPA QUE ESTA RAMA NO PISA, y es la razón por la que el ancla no mira
 * jerarquías: el ancla detecta la FUERZA; **decidir si la RESOLUCIÓN está
 * ausente es trabajo de `appliedState`, acá abajo, sin un solo cambio** — la
 * misma pregunta ("¿el campo ya tiene detrás una abstracción polimórfica
 * real?") que las otras tres anclas hacen, con las mismas dos vías (el
 * excluder estructural de grafo y el de tipo declarado). Un ancla que mirara
 * la FORMA del patrón —el protocolo compartido, la familia de estados—
 * encontraría los patrones que YA ESTÁN, que es lo contrario de lo que se
 * busca.
 *
 * QUÉ APORTA CADA CAMPO DE `StateProblem` EN ESTA RAMA, y por qué ninguno es
 * una suposición:
 *
 *   - `isEnumeratedDispatch` — el detector-ancla ya verificó POR AST que el
 *     discriminante es un campo propio (receptor explícito, sigilo de Ruby,
 *     receptor de Go, o identificador desnudo DECLARADO como miembro con la
 *     regla de sombreado por parámetro). Misma clase de evidencia, más fuerte,
 *     que las cuatro formas que `selfPrefixCheck` re-deriva por texto — igual
 *     que `isTemporaryField` para la tercera ancla.
 *   - `distinctMethods` — los miembros que RAMIFICAN sobre el campo, que es el
 *     `trigger` mismo del ancla, no una re-derivación.
 *   - `transitionConfirmed` — SIEMPRE `true`, y no es una concesión: la
 *     condición (2) del detector ES "al menos una asignación constante fuera
 *     del constructor". La reasignación está medida por AST, no buscada por
 *     regex sobre el texto del archivo como en las otras tres ramas.
 *   - `branchesConfirmed` — el análogo exacto del "3+ ramas" original: el
 *     TAMAÑO DEL ALFABETO. Con 2 valores es un binario (una bandera encendida
 *     y apagada); con 3+ hay una máquina de estados con más de dos puntas.
 *     Sigue siendo DISCRIMINADOR, nunca requisito — el piso del ancla es 2
 *     porque por debajo la forma no existe, y esta ola publica la precisión
 *     por estrato.
 *   - `typedNonPrimitive`/`typedFieldTypeName` — se calculan igual que en las
 *     otras ramas, porque alimentan `legacyTypedFieldState`, que es la mitad
 *     de la verificación de "la resolución está ausente".
 */

/**
 * *** TERCERA ANCLA: `temporary-field` (Ola Y, frente Y2) ***
 *
 * Cablea el kind que la Ola X (B7) entregó sin consumidor
 * (`detect/intra-file/temporary-field.ts`, 195 hallazgos, 69 % [42 %, 87 %]
 * de precisión medida a mano) — "la mejor apuesta medida del tablero, y está
 * a una palabra" según el cierre de esa ola (`COBERTURA-NIVEL-2.md §2.9`,
 * `ola-x/informes/INTEGRADOR.md §12`, punto 2). Un campo que se LLENA y se
 * VACÍA fuera del constructor es el estado del objeto escrito a mano — el
 * caso testigo del propio cierre: `guava/MultiInputStream.java:56`, `in =
 * null` en `close()`, todos los demás métodos preguntando `in == null`.
 *
 * EL AVISO QUE DEJÓ B7, RESPETADO ACÁ: *"state.ts está escrito alrededor de
 * un DISCRIMINANTE de switch, así que este ancla necesita UNA RAMA PROPIA o
 * muere en la primera compuerta."* Confirmado antes de escribir código: el
 * título de `temporary-field` (`` `Clase.campo` sólo tiene valor durante
 * parte de la vida del objeto ``) no matchea `/^"([^"]+)"/` — el regex que
 * la rama `repeated-switch` de `buildProblem` usa —, así que sin rama propia
 * `fieldName` sale `null` y `selfPrefixCheck` (el primer `required`) corta
 * TODO antes de construir una sola hipótesis. Ver `buildTemporaryFieldProblem`,
 * más abajo.
 *
 * `buildTemporaryFieldProblem` NO RE-DERIVA "¿es un campo propio?" por
 * texto/grafo como las otras dos ramas: el propio detector-ancla
 * (`temporary-field.ts#selfFieldNameOf`) YA lo verificó por AST — receptor
 * explícito (`this`/`self`/`@`/receptor de Go) o identificador DECLARADO
 * como miembro del tipo (idiom de Java/C#) —, evidencia más fuerte que
 * cualquiera de las tres formas que `selfPrefixCheck` reconstruye por texto
 * para `repeated-switch`/`conditional-chain`. Bandera dedicada:
 * `isTemporaryField` (ver `StateProblem`) — nunca se activan
 * `selfPrefixed`/`implicitSelfMember`/`declaredMemberSelf`/
 * `capturedViaOwnGetter`: esas cuatro describen formas de RE-DERIVAR la
 * evidencia desde un discriminante de switch, algo que acá no existe.
 *
 * "MÉTODOS INVOLUCRADOS" (segundo `required`, `methodCountCheck`):
 * escritores DISTINTOS (`problem.locations` ya trae `symbol` = método —
 * mismo campo que la rama `repeated-switch` ya usa) MÁS lectores que
 * TOLERAN el hueco sin escribirlo (`problem.evidence`, la fila "miembros
 * que sólo lo leen" que el propio detector ya cuenta). Sin solape por
 * construcción: el detector excluye de "lector" a cualquier método que
 * también escriba el campo (`temporary-field.ts#computeTemporaryFieldFindings`,
 * `written.has(field)`).
 *
 * TRANSICIÓN (discriminador `transitionCheck`): SIEMPRE confirmada, no una
 * suposición — el propio criterio de disparo del ancla ES una reasignación
 * real del campo (a nulo Y a un valor), así que decir que el archivo
 * "muestra una reasignación" repite lo que el detector ya midió para emitir
 * el `Finding`, nunca una re-derivación nueva.
 *
 * "RAMAS" (discriminador `branchesCheck`; la razón original — "2 ramas es
 * un binario, 3+ es máquina de estados" — no tiene switch que contar acá):
 * el análogo es la RIQUEZA de participación, el MISMO dato que
 * `methodCountCheck` ya calculó (`distinctMethods`), contra el mismo piso
 * (`STATE_MIN_BRANCHES`). Con 2 (un llenado + un vaciado, cero lectores) es
 * un toggle interno; con 3+ ya hay comportamiento repartido que depende del
 * hueco.
 *
 * QUÉ NO CAMBIA: `appliedState` (el excluder fusionado, estructural + legado
 * por tipo) se reutiliza TAL CUAL — "¿el campo ya tiene una abstracción
 * polimórfica real detrás?" es la misma pregunta para las tres anclas, y
 * ninguna de las dos rutas (`evaluateStateStructure`, `legacyTypedFieldState`)
 * necesita saber de qué ancla vinieron `p.locations`/`p.fieldName` para
 * resolver el contexto en el grafo o escanear el tipo declarado.
 *
 * VEREDICTOS Y DELTA MEDIDOS: ver `ola-y/informes/Y2.md`.
 */

/**
 * *** SEGUNDA ANCLA + BUG DE 3 OLAS CERRADO (Ola W, frente W2) ***
 *
 * La Ola V dejó State en CERO hipótesis en los 13 repos
 * (`ola-v/informes/INTEGRADOR.md` §2 — el `required` nuevo,
 * `implicitSelfNeedsTransitionEvidence` abajo, apagó correctamente las 9/9
 * falsas de rubocop, pero el patrón entero seguía colgado de UNA sola ancla,
 * `repeated-switch`, 156 hallazgos). Dos cambios:
 *
 * 1. **SEGUNDA ANCLA: `conditional-chain`** (382 hallazgos, 85 % de precisión
 *    propia — ya alimenta a Strategy y a Factory Method, compartir ancla es
 *    la norma de este proyecto: `distributed-duplication` alimenta a cinco
 *    patrones). A diferencia de `repeated-switch` (que agrupa >= 2
 *    ocurrencias del MISMO discriminante en UN solo `Finding`),
 *    `conditional-chain` reporta UNA cadena por función — así que la
 *    evidencia de "decidido en >= 2 miembros del mismo tipo" (el criterio
 *    duro del encargo) no viene gratis del ancla acá: se deriva escaneando
 *    el árbol vivo del archivo (`crossMethodOccurrences`, más abajo) por
 *    OTRAS cadenas/switches del MISMO tipo contenedor (o del archivo entero
 *    cuando el tipo no resuelve — misma imprecisión ya declarada arriba para
 *    `repeated-switch`) que decidan el MISMO discriminante normalizado.
 *    Excluye la forma `variant: "instantiates"` (selección de tipo a
 *    instanciar — eso es Factory Method, mismo excluder que
 *    `strategy.ts#notFactoryMethodCheck` aplica para su propio ancla
 *    `conditional-chain`) vía `notTypeSelectionCheck`.
 *
 * 2. **BUG CERRADO, citado sin dueño en `PLAN-INTENCIONES.md` desde la Ola U
 *    y re-confirmado en la Ola V**: *"`selfPrefixCheck` sigue bloqueando el
 *    100 % de los candidatos en C#/Java/Go (sólo reconoce `this.x`; el idiom
 *    real es `_currentState` desnudo — verificado: `newtonsoft-json/.../
 *    JsonReader.cs:118` NO LLEGA a la hipótesis)."* El caso CANÓNICO del
 *    patrón (`JsonReader._currentState`/`JsonTextReader`, 10 switches reales
 *    sobre un campo enum) nunca pasaba `selfPrefixCheck` porque el título de
 *    `repeated-switch` cita el discriminante SIN prefijo (`this` implícito
 *    de C#/Java) y el check sólo reconocía `self.`/`this.`/`@` explícitos (o,
 *    en Ruby, despacho implícito vía `hasImplicitSelfReference`). Arreglo:
 *    `declaresMemberNamed` (duplicado, adaptado, de
 *    `strategy.ts#declaresMemberNamed` — mismo mecanismo que esa hipótesis
 *    YA usa, en dirección opuesta, como EXCLUDER hacia State) resuelve un
 *    identificador desnudo contra una declaración de miembro REAL en el tipo
 *    contenedor (fuera de cualquier cuerpo de función) — la evidencia
 *    estructural de "esto es un campo propio con `this` implícito", sin
 *    vocabulario. Aplica a LOS DOS anclas (repeated-switch vía el switch
 *    localizado por `findSwitchAt`; conditional-chain vía el nodo de cadena
 *    ya resuelto). Riesgo declarado: en lenguajes con declaración de campos
 *    tipados FUERA de constructores (TS/JS clase con campo público) un
 *    identificador desnudo NUNCA es un acceso implícito a ESE campo (JS/TS
 *    exige `this.` siempre) — mismo riesgo que YA acepta
 *    `strategy.ts#notStateCheck` sin gate de lenguaje adicional, mitigado acá
 *    por el mismo mecanismo que ya protege el camino de Ruby:
 *    `declaredMemberSelf`-SOLO (sin `self.`/`this.`/`@` explícito) exige
 *    ADEMÁS evidencia de reasignación real en el archivo
 *    (`implicitSelfNeedsTransitionEvidence`, extendido) antes de confirmar
 *    campo propio — un accesor de sólo lectura sigue sin pasar.
 *
 * NO tocado: el excluder `legacyTypedFieldState`/`resolveRealAbstraction`
 * (el bug del enum, ya cerrado en la Ola U), la rama de grafo
 * `evaluateStateStructure` (sigue inerte en producción, mismo límite de
 * cableado ya declarado: `graph` es SIEMPRE `null` dentro de `analyzeFile`
 * para AMBOS anclas, ambas `intra-*`).
 */

/**
 * `State` — F6, migración de `findStateOpportunities` (`pattern-behavioral.ts:548`)
 * al motor de hipótesis (CONTRATO-F6.md, Contrato 3).
 *
 * ANCLA: `repeated-switch` (`detect/intra-file/repeated-switch.ts`). Es una
 * ancla LIMPIA: el "conditionals in every method" que refactoring.guru cita
 * como el problema de State (refactoring.guru/design-patterns/state, sección
 * Problem) es exactamente la misma relación que `repeated-switch` ya mide —
 * el MISMO discriminante decidido por switch/case/match en ≥2 lugares del
 * mismo archivo. No se migra inventando un detector nuevo.
 *
 * QUÉ SE PIERDE AL COLGAR DE `repeated-switch` EN VEZ DE RE-EXTRAER (declarado,
 * no escondido): `repeated-switch` agrupa por (archivo + texto del
 * discriminante), NO por (archivo + CLASE + discriminante) como hacía
 * `findStateOpportunities`. Un archivo con dos clases no relacionadas que
 * casualmente usan el mismo nombre de campo (`self.status` en `Order` y en
 * `Ticket`) puede producir un único `Finding` que esta hipótesis trata como
 * una sola unidad. Es una pérdida de precisión real frente a la regla vieja,
 * mitigada — no eliminada — por exigir que el discriminante tenga FORMA de
 * campo propio (ver `selfPrefixCheck`), lo que ya descarta la mayoría de
 * coincidencias espurias de nombre entre clases sin relación (un parámetro
 * suelto no matchea; dos clases usando `self.status` sin relación SÍ podrían
 * seguir matcheando — declarado, no resuelto en esta ola).
 *
 * FORMA EN LENGUAJES SIN CLASES: el discriminante-como-campo-propio se
 * escribe `@x` (Ruby), `self.x` (Python), `this.x` (TS/JS/Vue) — las tres
 * reconocidas por texto puro, SIN árbol vivo, directamente del título del
 * `Finding` ancla (ver `SELF_PREFIX`). Go escribe la misma relación como
 * `recv.x` con `recv` arbitrario por archivo/tipo (p.ej. `s.status`) — esa
 * forma NO se puede distinguir por texto puro de "un parámetro cualquiera
 * con un campo" (`config.mode`, `order.status`) sin resolver que `recv` es
 * específicamente el receptor de la función envolvente, lo que exige el
 * árbol vivo de esa función (`node.childForFieldName("receiver")`, ver
 * `code-grammar.ts`/`pattern-behavioral.ts:809`). BRECHA DECLARADA: esta
 * hipótesis no resuelve Go hoy — ni por texto (ambiguo) ni por árbol vivo
 * (`ctx.file` es SIEMPRE `null` en el cableado actual de `crossAnalyze`, ver
 * `run.ts`), así que Go queda en cero por esta hipótesis hasta que exista
 * AMBAS cosas: resolución de receptor y una ola de wiring por-archivo.
 *
 * BRECHA MEDIDA Y CERRADA (esta ola, sólo para Ruby): las tres formas de
 * arriba no agotan Ruby — su receptor propio puede además ser IMPLICITO: se
 * escribe `hookable_type`, nunca `self.hookable_type`/`@hookable_type`, para
 * leer un atributo/metodo del propio objeto. Medido sobre los 5
 * `repeated-switch` reales de `Visability/Backend`: el check por texto
 * rechazaba los 5 — incluido `"hookable_type"` en `app/models/hookable.rb`,
 * donde 2 de sus 3 ubicaciones (`type_specific_json`, `target_label`) SI son
 * ese cuarto caso (la tercera, `index_metadata`, NO lo es: ahi
 * `hookable_type` es un parametro con nombre keyword que sombrea al
 * atributo — ver mas abajo como se distingue). Arreglo: cuando SI hay arbol
 * vivo (`ctx.file` no `null`) y el lenguaje del archivo es Ruby — mismo
 * alcance y mismo precedente que `graph/resolve.ts#classMemberStage`, "A3,
 * despacho implicito a self" —, se pregunta al grafo de referencias
 * (`graph/references.ts#extractReferences`, no un mecanismo nuevo: la misma
 * pieza que alimenta la resolucion de simbolos del repo) si el discriminante
 * aparece, en el rango de lineas de ALGUNA ubicacion del hallazgo, como una
 * referencia `role: "bare"` (sin receptor explicito) y SIN sombra local
 * (`shadowedLocally`, que ese modulo ya calcula correctamente recorriendo
 * parametros/bindings — la forma keyword-argument de Ruby incluida, que es
 * justo lo que excluye a `index_metadata`). NO generalizado a otro lenguaje:
 * en TS/JS/Python/Java/Go/C# un identificador desnudo sin sombra local casi
 * siempre es una constante de modulo, un import o una funcion libre — nunca
 * evidencia de "miembro del propio tipo" —, asi que extender esto ahi
 * reabriria exactamente el ruido que el precedente de `resolve.ts` ya midio
 * y evito restringiendose a Ruby.
 *
 * EL EXCLUDER DE 'YA APLICADO' (requisito duro de esta migración; la regla
 * vieja NO TENÍA ninguno — verificado línea por línea en
 * `findStateOpportunities`, que sólo filtra por nº de ramas y nº de métodos,
 * nunca por "¿ya está aplicado State?"). Señal estructural añadida acá:
 * ¿existe, en este archivo, una declaración con tipo explícito para el
 * campo discriminante cuyo tipo NO es un primitivo dedicado de la gramática
 * (mismo criterio que `primitive-obsession.ts#PRIMITIVE_TYPE_WORD`, duplicado
 * a propósito — mismo precedente que `TERNARY_NAME` en `capabilities.ts`)?
 * Si el campo YA es un tipo propio (una interfaz/clase, no un string/int/bool
 * de palabra clave), la abstracción de estado YA EXISTE — pero como esta
 * hipótesis sólo se dispara colgada de un `repeated-switch` real, la propia
 * ancla ES la prueba de que alguien igual decide por switch en vez de usar
 * esa abstracción: el estado correcto es SIEMPRE `aplicado-eludido`, nunca
 * `ya-aplicado` limpio — ese último estado es estructuralmente inalcanzable
 * para esta hipótesis particular (a diferencia de Facade en el spike), y es
 * una conclusión, no un descuido: sin bypass no habría `Finding` ancla.
 * Cuando el árbol no está vivo o el lenguaje no declara tipos explícitos, se
 * asume `ausente` por falta de evidencia — nunca se afirma `ya-aplicado`/
 * `aplicado-eludido` sin evidencia positiva.
 *
 * SE CONFUNDE CON (declarado en el encargo): Strategy — misma exclusión
 * mutua de ramas, pero el discriminante NO es un campo propio (es un
 * parámetro); y con la validación de un valor de configuración fijo que
 * nunca transiciona — de ahí que "reasignación confirmada en el archivo"
 * sea un discriminador (sube confianza), no un requisito (no bloquea: un
 * campo que aún no vimos reasignar puede seguir siendo un estado real que
 * el archivo analizado no muestra transicionando).
 *
 * BUG 2 DE "TRES BUGS DE MECANISMO" (`RAICES.md`), medido sobre Rails real
 * en `app/models/hookable.rb:255` — el `repeated-switch` de `hookable_type`
 * (un discriminador de asociación polimórfica, confirmado por Strategy vía
 * `appliedState`, ver `strategy.ts`) cuelga ESTA hipótesis como `ausente`
 * EN PARALELO con `Strategy: aplicado-eludido` sobre el MISMO ancla — y la
 * pregunta que el propio `transitionCheck` de arriba hace ("¿se reasigna
 * este campo?") ya la responde el archivo: no. Esta hipótesis SIGUE sin
 * bloquear por reasignación ausente (la razón de arriba sigue siendo
 * válida en aislamiento — no hay forma honesta de distinguir "campo fijo"
 * de "estado que este archivo no muestra transicionando" mirando sólo acá).
 * Lo que SÍ cambia: `engine.ts#arbitrateRivalHypotheses` — llamado desde
 * `hypotheses/run.ts#attachHypotheses`, la única capa que ve TODAS las
 * hipótesis de un mismo `Finding` juntas — descarta esta OPORTUNIDAD cuando
 * OTRO patrón sobre el MISMO ancla ya CONFIRMÓ estructuralmente
 * (`ya-aplicado`/`aplicado-eludido`) que su forma existe. Ver el docstring
 * de esa función para el mecanismo completo: NUNCA se tocó `required`
 * (seguiría rompiendo casos reales sin árbol vivo en otro archivo), el
 * arbitraje vive un nivel más arriba, entre hipótesis, no dentro de una.
 *
 * SILENCIO TOTAL sobre `tests/fixtures/patterns` — Ola 11a (P3), diagnóstico
 * de "el ancla nunca dispara" vs. "está roto" (distinción que pide el
 * encargo, NO se fuerza una salida si la conclusión es "correctamente
 * muda"). Medido con un script ad hoc (`analyzeRepo` real, sin mocks, sobre
 * `tests/fixtures/patterns/state` Y sobre `tests/fixtures/patterns`
 * completo — los 19 subdirectorios, los 6+ lenguajes): CERO Findings de
 * `repeated-switch` en TODO el árbol, en cualquier lenguaje — confirmado
 * además por `grep -rn "switch\|case \|match "` sobre el árbol entero: la
 * única coincidencia es un COMENTARIO (`state/go.go:5`, texto que describe
 * la fixture, no código). No es que `required` (`selfPrefixCheck`/
 * `methodCountCheck`) corte algo: NO HAY NINGÚN `Finding` ancla con el que
 * `build()` pueda siquiera intentar correr — `tests/fixtures/patterns/state/*`
 * es, a propósito, la forma YA APLICADA (polimorfismo limpio, sin un solo
 * `switch`/`if` repartido — ver los comentarios de cada archivo de esa
 * fixture), y el resto de `tests/fixtures/patterns` tampoco contiene el
 * olor "mismo discriminante decidido por switch en ≥2 lugares" en ningún
 * archivo. `state.test.ts` (Findings SINTÉTICOS, mismo criterio que
 * `factory-method.test.ts`/`prototype.test.ts` usan para sus propias
 * anclas) ya prueba que `required` SÍ pasa con un `Finding` bien formado
 * (título `"campo" se decide con switch en 2 lugares...` + ≥2 símbolos
 * distintos en `locations`) — el mecanismo no está roto, simplemente no
 * tiene con qué correr acá. El corpus de 8 repos (que si tiene switches
 * reales — de ahí que el encargo cite los 130 de Strategy, ancla
 * compartida con `conditional-chain`) NO ESTÁ EN DISCO esta ola
 * (`CK_CORPUS_DIR` sin setear, `corpus/` inexistente): no se puede repetir
 * esta medición contra él sin clonarlo, que está fuera de alcance. CONCLUSIÓN:
 * sobre lo que SÍ se pudo correr, State está correctamente muda (el ancla
 * no dispara, el mecanismo no está roto) — no se fuerza ninguna salida.
 */
import type { PatternConfidence } from "../../../shared/types.js";
import type { DerivedNodeSets, ProbeNode } from "../code-grammar.js";
import { confidentEdges } from "../detect/inter-file/confident-edges.js";
import { deriveAnchor } from "../detect/ids.js";
import type { AstNode, FileUnit, Finding, FunctionUnit, RoleLocation } from "../detect/types.js";
import { walkTree } from "../detect/tree-walk.js";
import { extractReferences, type ReferenceFacts } from "../graph/references.js";
import { fileNodeId, memberSignatures, type CodeGraph, type CodeGraphEdge, type CodeGraphNode } from "../graph/types.js";
import { build as engineBuild, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesisCheck } from "./types.js";

/** Mismo piso que `pattern-behavioral.ts:546` — no re-derivado, heredado tal cual (provisional, K2). */
const STATE_MIN_METHODS = 2;
/** Mismo piso que `pattern-behavioral.ts:545`. Acá es discriminador, no requisito — ver docstring del módulo. */
const STATE_MIN_BRANCHES = 3;

/** `self.`/`this.`/`@` por texto — el caso Ruby de receptor propio IMPLÍCITO (sin ningún prefijo) no puede reconocerse acá; ver `hasImplicitSelfReference` más abajo, y el docstring del módulo para por qué Go queda fuera de ambos caminos. */
const SELF_PREFIX = /^(?:self\.|this\.|@)/;

/**
 * *** OLA AZ (AZ3) — LA MEDICIÓN QUE HAY QUE LEER ANTES DE VOLVER A TOCAR
 * `SELF_PREFIX`, PORQUE REFUTA LA RAZÓN CON LA QUE VARIAS OLAS LO PIDIERON. ***
 *
 * El encargo de la Ola AZ (y los de varias anteriores) dice que este regex
 * *«dejó a Go MUDO en cuatro de las anclas de State durante varias olas»*.
 * **Medido hoy sobre los 21 repos, con la traza de este archivo
 * (`scratchpad-az3/traza0`, 3.162 entradas de las tres anclas de switch/cadena):
 * ES FALSO, y está invertido.**
 *
 *   · **Go NO está mudo: emite 32 de 764 candidatos (4,2 %)** — la TERCERA
 *     tasa más alta de los diez lenguajes, detrás de C# (8,2 %) y Java (5,8 %),
 *     y muy por encima de python (2,0 %), ruby (1,3 %), javascript (0,5 %) y
 *     **typescript (0 de 224)**. Los que de verdad casi no emiten son los
 *     lenguajes de `this.`, para los que este regex se escribió.
 *   · **`SELF_PREFIX` reconoce 0 de las 764 entradas de Go** — como debe ser:
 *     Go no escribe `self.`/`this.`/`@`. Todo lo que Go consigue lo consiguen
 *     `receiverQualifiedSelf` (Ola AJ, 26) y `receiverItself` (Ola AK, 28),
 *     que preguntan a la GRAMÁTICA por el receptor. **La mudez ya la cerraron
 *     esas dos olas; el (B) de más arriba está resuelto y su número (184
 *     candidatos, 0 supervivientes) es de un árbol viejo.**
 *   · **`SELF_PREFIX` es marginal en TODOS lados: matchea 42 de 3.162 entradas
 *     (1,3 %)** — java 2, javascript 6, ruby 14, python 16, tsx 4. No es lo que
 *     hace ni deshace a ningún lenguaje.
 *
 * POR ESO AZ3 **NO** LO REESCRIBIÓ, y no es pereza: **no hay un defecto medido
 * que arreglar.** Reescribir el camino más caliente de un archivo de 3.300
 * líneas para "arreglar" una mudez que ya no existe, en la misma ola en la que
 * se retira un ancla de 430 propuestas, es riesgo sin beneficio — y el proyecto
 * ya pagó dos veces por cambios elegidos antes de medir. Lo que SÍ queda dicho:
 * **si alguna vez se reescribe, el precedente correcto ya está en producción y
 * no es un regex** — `detect/intra-file/temporary-field.ts` arma
 * `selfNames = {"this","self"} ∪ {nombre del receptor que expone la gramática}`
 * y lo aplica igual a los nueve lenguajes.
 */

/** Duplicado a propósito de `detect/intra-file/primitive-obsession.ts#PRIMITIVE_TYPE_WORD` — mismo criterio que `TERNARY_NAME` en `capabilities.ts` documenta para este tipo de duplicación intencional. */
const PRIMITIVE_TYPE_WORD = /^(predefined|primitive|integral|floating_point|boolean)_type$/;

/** Ola W2 — duplicado de `strategy.ts#BARE_IDENTIFIER`: un identificador a
 *  secas, sin punto, sin paréntesis, sin operadores — la forma en la que un
 *  lenguaje con `this` IMPLÍCITO (C#/Java/Go) escribe el acceso a un campo
 *  propio. */
const BARE_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Ola AJ (AJ5) — QUINTA FORMA DE "CAMPO PROPIO": `R.campo`, donde `R` es el
 * RECEPTOR DECLARADO de la función encerrante. Ver el docstring del módulo,
 * sección "QUINTA FORMA", para la compuerta imposible que cierra y para los
 * números del embudo que la motivan.
 *
 * `X.y` de UN solo nivel, sin paréntesis ni operadores — la misma forma que
 * `BARE_IDENTIFIER` describe para el `this` implícito, con el receptor
 * explícito adelante. Dos niveles (`a.b.c`) quedan afuera a propósito: ahí el
 * sujeto ya no es un campo del receptor sino un campo DE un campo, y esta
 * hipótesis no resuelve esa cadena.
 */
const RECEIVER_QUALIFIED = /^([A-Za-z_$][A-Za-z0-9_$]*)\.([A-Za-z_$][A-Za-z0-9_$]*)$/;

/**
 * El NOMBRE del receptor declarado por `fnNode`, o `null` si la gramática no
 * expone un receptor para esa función.
 *
 * NO es un mecanismo nuevo ni una lectura de vocabulario: es el MISMO
 * `childForFieldName("receiver")` que ya está en producción en
 * `hypotheses/proxy.ts#goReceiverOf`, `detect/intra-file/temporary-field.ts` y
 * `detect/intra-file/lazy-init-repetida.ts` — la capa por lenguaje TRADUCE (la
 * gramática que tiene receptor lo expone; la que no, devuelve `null`), no
 * decide. Se pide sólo el nombre: el TIPO del receptor no hace falta acá,
 * porque la pregunta de este check es "¿el discriminante es del propio
 * objeto?", no "¿de qué tipo es?".
 */
function receiverNameOf(fnNode: AstNode): string | null {
  const receiver = fnNode.childForFieldName("receiver") as AstNode | null;
  if (!receiver) return null;
  let decl: AstNode = receiver;
  for (let i = 0; i < receiver.childCount; i++) {
    const child = receiver.child(i) as AstNode | null;
    if (child?.isNamed) {
      decl = child;
      break;
    }
  }
  const name = (decl.childForFieldName("name") as AstNode | null)?.text?.trim() ?? null;
  return name ? name : null;
}

/**
 * `true` si `fieldName` tiene la forma `R.campo` y `R` es el receptor
 * declarado de `fnNode` (comparación insensible a mayúsculas — el título de
 * `repeated-switch` cita el discriminante ya en minúsculas, mismo criterio que
 * `declaresMemberNamed`/`scanTransition` ya usan sobre el mismo dato).
 * `isShadowedByOwnParameter` va ANTES de confirmar, igual que en las otras
 * formas: un parámetro homónimo del receptor lo sombrearía.
 */
function isReceiverQualified(fnNode: AstNode, fieldName: string): boolean {
  const m = RECEIVER_QUALIFIED.exec(fieldName);
  if (!m) return false;
  const qualifier = m[1]!;
  if (isShadowedByOwnParameter(fnNode, qualifier)) return false;
  const receiver = receiverNameOf(fnNode);
  return receiver !== null && receiver.toLowerCase() === qualifier.toLowerCase();
}

/**
 * Ola AK (AK1) — SEXTA FORMA DE "CAMPO PROPIO": el discriminante **ES** el
 * receptor declarado, sin ningún punto. Ver el docstring del módulo, sección
 * "SEXTA FORMA", para la compuerta imposible que cierra y la población medida.
 *
 * `true` si `fieldName` es un identificador DESNUDO idéntico (insensible a
 * mayúsculas — el título del ancla cita el discriminante ya en minúsculas,
 * mismo criterio que `declaresMemberNamed`/`isReceiverQualified` ya usan sobre
 * el mismo dato) al nombre que la gramática expone en el campo `receiver` de la
 * función que contiene el switch/cadena. `isShadowedByOwnParameter` va ANTES de
 * confirmar, igual que en las otras cinco formas.
 *
 * Nada de esto es vocabulario de lenguaje: se le pregunta a la gramática si
 * NOMBRA su receptor. La que no lo nombra devuelve `null` en `receiverNameOf` y
 * este check contesta `false`, dejando el camino exactamente como estaba.
 */
function isReceiverItself(fnNode: AstNode, fieldName: string): boolean {
  if (!BARE_IDENTIFIER.test(fieldName)) return false;
  if (isShadowedByOwnParameter(fnNode, fieldName)) return false;
  const receiver = receiverNameOf(fnNode);
  return receiver !== null && receiver.toLowerCase() === fieldName.toLowerCase();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Único lenguaje donde se admite un discriminante SIN prefijo self./this./@
 * como evidencia de campo propio — mismo alcance exacto que
 * `graph/resolve.ts#classMemberStage` ya usa para "despacho implícito a
 * self" (A3), no un precedente nuevo. Ver `hasImplicitSelfReference` y el
 * docstring del módulo (sección "BRECHA MEDIDA Y CERRADA") para la
 * justificación de por qué NO se generaliza a los otros 8 lenguajes
 * soportados: ahí un identificador desnudo sin sombra local casi siempre es
 * una constante de módulo/un import/una función libre, nunca evidencia de
 * "miembro del propio tipo".
 */
const IMPLICIT_SELF_LANGUAGE = "ruby";

/** Cacheado por identidad del árbol vivo (`FileUnit.root`) — mismo idiom que `STATE_GRAPH_INDEX_CACHE` más abajo: evita recorrer el archivo una vez por cada ubicación/hallazgo que comparte el mismo `ctx.file`. */
const FILE_REFERENCE_CACHE = new WeakMap<AstNode, readonly ReferenceFacts[]>();

function referencesFor(file: FileUnit): readonly ReferenceFacts[] {
  const cached = FILE_REFERENCE_CACHE.get(file.root);
  if (cached) return cached;
  const refs = extractReferences(file.root, file.sets);
  FILE_REFERENCE_CACHE.set(file.root, refs);
  return refs;
}

/**
 * `true` si, en ALGUNA de las `locations` del `Finding` ancla, el grafo de
 * referencias (`graph/references.ts#extractReferences` — la misma pieza que
 * alimenta la resolución de símbolos del repo, no un mecanismo nuevo) ve
 * `fieldName` como una referencia `role: "bare"` (sin receptor explícito) Y
 * sin sombra local (`shadowedLocally`: ningún parámetro/variable local con
 * ese nombre visible en el sitio de uso — la forma keyword-argument de Ruby
 * incluida, que es justo lo que EXCLUYE el caso real medido,
 * `index_metadata` en `app/models/hookable.rb`, donde `hookable_type` es un
 * parámetro, no el atributo). Restringido a líneas dentro del rango
 * `[loc.startLine, loc.endLine]` de cada ocurrencia — el mismo span que
 * `repeated-switch.ts` ya reporta para el switch entero — para no confundir
 * una coincidencia de nombre en otra parte del archivo con el discriminante
 * mismo. `false` sin árbol vivo o fuera de `IMPLICIT_SELF_LANGUAGE` — nunca
 * se afirma sin evidencia positiva.
 */
function hasImplicitSelfReference(file: FileUnit, fieldName: string, locations: readonly RoleLocation[]): boolean {
  if (file.language !== IMPLICIT_SELF_LANGUAGE) return false;
  const refs = referencesFor(file);
  return locations.some((loc) =>
    refs.some((r) => r.name === fieldName && r.role === "bare" && !r.shadowedLocally && r.line >= loc.startLine && r.line <= loc.endLine),
  );
}

/**
 * Ola W2 — el nodo class-like MÁS ANGOSTO que CONTIENE a `anchor` (un switch,
 * una cadena, cualquier nodo con posición) — mismo criterio que
 * `strategy.ts#declaresMemberNamed` usa internamente para resolver su propio
 * "owner", extraído acá como función compartida (dos consumidores dentro de
 * ESTE archivo: `declaresMemberNamed` y `crossMethodOccurrences`, ver abajo).
 */
function narrowestClassAround(root: AstNode, sets: DerivedNodeSets, anchor: AstNode): AstNode | null {
  const within = (n: AstNode): boolean => n.startPosition.row <= anchor.startPosition.row && anchor.endPosition.row <= n.endPosition.row;
  let owner: AstNode | null = null;
  walkTree(root, (raw) => {
    const node = raw as AstNode;
    if (!node.isNamed || !sets.classNodes.has(node.type) || !within(node)) return;
    const prev: AstNode | null = owner;
    if (!prev || node.endPosition.row - node.startPosition.row < prev.endPosition.row - prev.startPosition.row) owner = node;
  });
  return owner;
}

/**
 * Ola W2 — duplicado, adaptado, de `strategy.ts#declaresMemberNamed` (esa
 * hipótesis lo usa en dirección OPUESTA, como EXCLUDER hacia State — acá se
 * usa para CONFIRMAR: cierra el bug citado en `PLAN-INTENCIONES.md` desde la
 * Ola U, "selfPrefixCheck bloquea el 100 % de C#/Java/Go", ver docstring del
 * módulo). `true` si `name` (insensible a mayúsculas — el título de
 * `repeated-switch` ya cita el discriminante en minúsculas) aparece como un
 * TOKEN HOJA dentro del tipo class-like más angosto que contiene `anchor`,
 * FUERA de todo cuerpo function-like: por posición, eso es un miembro
 * declarado del tipo — nunca un parámetro ni una variable local, que sólo
 * pueden existir DENTRO de un cuerpo de función.
 */
function declaresMemberNamed(root: AstNode, sets: DerivedNodeSets, anchor: AstNode, name: string): boolean {
  const ownerNode = narrowestClassAround(root, sets, anchor);
  if (!ownerNode) return false;
  const needle = name.toLowerCase();
  let found = false;
  const scan = (node: AstNode): void => {
    if (found) return;
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i) as AstNode | null;
      if (!child) continue;
      if (child.isNamed && sets.functionNodes.has(child.type)) continue; // cuerpo de método: ahí un nombre es local o parámetro, no un miembro.
      if (child.childCount === 0 && child.text.trim().toLowerCase() === needle) {
        found = true;
        return;
      }
      scan(child);
    }
  };
  scan(ownerNode);
  return found;
}

/**
 * Ola X (B6) — CIERRA EL PIDO ABIERTO DESDE W1/W2, citado sin dueño en
 * `PLAN-INTENCIONES.md` y en `COBERTURA-NIVEL-2.md §5`: *"`AbstractService.java:264`
 * y `:463` son 4 verdaderos de `conditional-chain` con `switch (previous)` sobre
 * un enum que la propia clase declara y cada rama asignando un `new
 * StateSnapshot(...)`. Es State escrito como switch, y ningún camino de
 * `state.ts` lo reconoce porque el discriminante es una VARIABLE LOCAL
 * (`State previous = state();`) inicializada con un getter del propio tipo."*
 *
 * TERCERA forma de "campo/estado propio" (además de `selfPrefixed` y
 * `declaredMemberSelf`): el discriminante no es el campo en sí, es una
 * CAPTURA — una variable local, declarada en la MISMA función que contiene
 * el switch/cadena, cuyo inicializador es una llamada `[this.]getter()` SIN
 * argumentos. Si `getter` resuelve, vía `declaresMemberNamed` (el MISMO
 * mecanismo que ya usa `declaredMemberSelf`, sin duplicar la pregunta "¿es
 * un miembro real?"), a un miembro real del tipo contenedor, la variable
 * local es un snapshot de ESE miembro — no una variable arbitraria.
 * Verificado exacto contra el caso citado: `AbstractService#stopAsync`
 * declara `State previous = state();` e inmediatamente `switch (previous)`.
 *
 * POR TEXTO, grammar-agnostic (mismo criterio que `RETURN_CONSTRUCTS`/
 * `RETURN_BARE_CALL` de `factory-method.ts`, y que el resto de este archivo:
 * `SELF_PREFIX`/`COMPARISON_OPERATOR`), NO por un nodo de declaración
 * tipado: `Tipo nombre = getter();` (C#/Java/Go) y `nombre = getter()`
 * (Python/Ruby) son formas de AST distintas por gramática — pedir un nodo
 * "declaración de variable local" multiplicaría el trabajo por seis sin
 * cambiar la pregunta. Riesgo declarado y ACOTADO: un comentario o string
 * con el mismo texto podría matchear el regex, pero la confirmación
 * adicional ("el nombre llamado es un miembro REAL del tipo") ya descarta
 * casi cualquier coincidencia espuria — mismo nivel de riesgo que el resto
 * del archivo ya acepta para `scanTransition`/`hasImplicitSelfReference`.
 *
 * Alcance declarado, no escondido: sólo cubre la forma SIN argumentos
 * (`state()`, nunca `computeState(a, b)`) — ampliarla a llamadas con
 * argumentos exigiría distinguir "getter" de "método con efectos", una
 * pregunta que este check no responde.
 */
function localFromOwnGetter(fnNode: AstNode, root: AstNode, sets: DerivedNodeSets, name: string): boolean {
  const captureRe = new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(?:this\\.|self\\.)?([A-Za-z_]\\w*)\\s*\\(\\s*\\)`, "i");
  const getterName = captureRe.exec(fnNode.text)?.[1];
  if (!getterName) return false;
  return declaresMemberNamed(root, sets, fnNode, getterName);
}

/**
 * BUG MEDIDO ESCRIBIENDO ESTA OLA (`newtonsoft-json/.../Linq/JValue.cs:611`
 * — `private static JTokenType GetValueType(JTokenType? current, object?
 * value)`, un método ESTÁTICO cuyo PARÁMETRO `value` homonimiza la propiedad
 * `public object? Value` de la misma clase, línea 708): `declaresMemberNamed`
 * sólo pregunta *"¿existe un miembro con este nombre en el tipo?"*, nunca
 * *"¿ESTE método puede alcanzarlo?"* — un parámetro SIEMPRE sombrea a un
 * miembro homónimo, sea el método estático o no (un método estático ni
 * siquiera tiene `this` a través del cual el miembro sería alcanzable).
 * Filtro barato: ¿`name` es el nombre de algún parámetro DIRECTO de la
 * función que contiene `anchor`? Heurística "último identificador hoja por
 * parámetro" (el patrón `tipo nombre` es común a las gramáticas soportadas,
 * usado con `childForFieldName("name")` primero cuando la gramática lo
 * expone) — CONSERVADOR a propósito: un parámetro con valor por defecto
 * (`int x = 0`, último leaf el literal) puede no detectarse, lo que sólo
 * pierde ALGO de protección, nunca fabrica un rechazo nuevo. NO cubre
 * sombra por VARIABLE LOCAL (declarada dentro del cuerpo, no en la firma) —
 * gap declarado, no escondido: acotar a parámetros ya cierra el caso medido
 * sin necesitar resolución de alcance completa.
 */
function isShadowedByOwnParameter(fnNode: AstNode, name: string): boolean {
  const params = fnNode.childForFieldName("parameters") as AstNode | null;
  if (!params) return false;
  const needle = name.toLowerCase();
  for (let i = 0; i < params.childCount; i++) {
    const param = params.child(i) as AstNode | null;
    if (!param || !param.isNamed) continue;
    const byField = param.childForFieldName("name") as AstNode | null;
    if (byField) {
      if (byField.text.trim().toLowerCase() === needle) return true;
      continue;
    }
    let lastLeaf: AstNode | null = null;
    const scan = (node: AstNode): void => {
      if (node.childCount === 0) {
        lastLeaf = node;
        return;
      }
      for (let j = 0; j < node.childCount; j++) {
        const c = node.child(j) as AstNode | null;
        if (c) scan(c);
      }
    };
    scan(param);
    if (lastLeaf && (lastLeaf as AstNode).text.trim().toLowerCase() === needle) return true;
  }
  return false;
}

/**
 * Ola W2 — evidencia de "decidido en >= 2 miembros" para el ancla
 * `conditional-chain`, que (a diferencia de `repeated-switch`) reporta UNA
 * sola cadena por `Finding`. Cuenta ESTE método + cuántos OTROS métodos del
 * MISMO tipo contenedor (o, sin tipo resoluble, del archivo entero — misma
 * imprecisión ya declarada arriba para `repeated-switch`: "un archivo con
 * dos clases no relacionadas... puede producir un único Finding") tienen,
 * en su propio cuerpo, una cadena/switch cuyo discriminante normaliza al
 * MISMO `normalizedField`. Nunca inferido por conjunto de miembros: es
 * comparación de TEXTO del discriminante (mismo criterio de agrupación que
 * `repeated-switch.ts#bySubject` ya usa, `.toLowerCase()`), no una inferencia
 * estructural sobre qué miembros "pertenecen juntos".
 */
function crossMethodOccurrences(file: FileUnit, sets: DerivedNodeSets, fn: FunctionUnit, chain: AstNode, normalizedField: string): number {
  const owner = narrowestClassAround(file.root, sets, chain);
  let matches = 0;
  for (const candidate of file.functions) {
    if (candidate === fn) continue;
    if (owner) {
      const withinOwner = owner.startPosition.row <= candidate.startLine - 1 && candidate.endLine - 1 <= owner.endPosition.row;
      if (!withinOwner) continue;
    }
    const hit = chainCandidatesIn(candidate.node, sets).some((c) => {
      const text = chainDiscriminantText(c.node);
      if (!text) return false;
      const subject = discriminantSubject(text);
      const stripped = SELF_PREFIX.test(text) ? subject.replace(SELF_PREFIX, "") : subject;
      return stripped.toLowerCase() === normalizedField;
    });
    if (hit) matches++;
  }
  return 1 + matches;
}

interface StateProblem {
  fieldName: string | null;
  selfPrefixed: boolean;
  /** Ola de esta tarea — ver `hasImplicitSelfReference`: evidencia de GRAFO (no de texto) de que `fieldName` es un campo propio en un lenguaje de receptor implícito (Ruby). */
  implicitSelfMember: boolean;
  /** Ola W2 — ver `declaresMemberNamed`: el discriminante es un identificador
   *  DESNUDO (`this` implícito de C#/Java/Go) declarado como miembro real del
   *  tipo que contiene el switch/cadena — cierra el bug de 3 olas
   *  ("selfPrefixCheck bloquea el 100 % de C#/Java/Go"), ver docstring del
   *  módulo. */
  declaredMemberSelf: boolean;
  /** Ola X (B6) — ver `localFromOwnGetter`: el discriminante es una VARIABLE
   *  LOCAL, declarada en la MISMA función, cuyo inicializador es una llamada
   *  `[this.]getter()` sin argumentos cuyo NOMBRE resuelve a un miembro real
   *  del tipo contenedor — "State previous = state(); switch (previous)",
   *  el caso que `AbstractService.java` deja sin resolver desde la Ola W1
   *  (ver docstring del módulo). */
  capturedViaOwnGetter: boolean;
  /** Ola AJ (AJ5) — ver `isReceiverQualified`: el discriminante es `R.campo`
   *  y `R` es el RECEPTOR declarado de la función encerrante (el `this` de una
   *  gramática que nombra su receptor en vez de reservarle una palabra). Cierra
   *  la compuerta imposible que dejaba a Go en CERO por construcción: sus
   *  métodos son funciones de nivel superior, así que ningún nodo class-like
   *  contiene al switch y `declaresMemberNamed` no puede ser `true` nunca — ver
   *  el docstring del módulo, sección "QUINTA FORMA". */
  receiverQualifiedSelf: boolean;
  /** Ola AK (AK1) — ver `isReceiverItself`: el discriminante ES el receptor
   *  declarado de la función que contiene el switch/cadena, sin ningún punto.
   *  Cierra la segunda compuerta imposible de este archivo: cuando la gramática
   *  declara el método sobre un VALOR, el discriminante no es un campo DE algo
   *  —es el objeto entero—, y las cinco formas anteriores describen todas "un
   *  campo de", así que ninguna puede reconocerlo por construcción. Ver el
   *  docstring del módulo, sección "SEXTA FORMA". */
  receiverItself: boolean;
  /** Ola Y (Y2) — `true` sólo para el ancla `temporary-field`: marca que
   *  "¿es un campo propio?" ya lo verificó por AST el detector-ancla mismo
   *  (ver el docstring del módulo, sección "TERCERA ANCLA"), evidencia más
   *  fuerte que las cuatro formas de arriba, que RE-DERIVAN esa pregunta
   *  desde un discriminante de switch. `selfPrefixCheck`/`branchesCheck` la
   *  usan para dar evidencia honesta en vez de reusar texto de "switch"/
   *  "self./this./@" que no aplica a esta forma. */
  isTemporaryField: boolean;
  /** Ola AC (AC2) — `true` sólo para el ancla `enumerated-field-dispatch`:
   *  igual que `isTemporaryField`, marca que "¿es un campo propio?" ya lo
   *  verificó por AST el detector-ancla. Ver el docstring del módulo, sección
   *  "CUARTA ANCLA". */
  isEnumeratedDispatch: boolean;
  /** Ola AI (AI4) — `true` sólo para el ancla `type-switch`: marca que el
   *  discriminante y la escala vienen de la CUARTA rama (ver el docstring de
   *  la sección "CUARTA ANCLA: `type-switch`"). Las cuatro formas de "campo
   *  propio" (`selfPrefixed`/`implicitSelfMember`/`declaredMemberSelf`/
   *  `capturedViaOwnGetter`) SÍ se activan en esta rama —a diferencia de
   *  `isTemporaryField`/`isEnumeratedDispatch`, donde el detector-ancla ya
   *  había verificado el acceso por AST—, porque acá el discriminante viene
   *  del título y hay que re-derivar la pregunta como en `repeated-switch`/
   *  `conditional-chain`. Sólo la usan las EVIDENCIAS, para no describir la
   *  escala con la frase de otro ancla. */
  isTypeSwitch: boolean;
  /** Ola AC (AC2) — tamaño del ALFABETO del campo (valores constantes
   *  distintos) para el ancla `enumerated-field-dispatch`; `null` para las
   *  otras tres, que no tienen esta medida. Es el análogo del "3+ ramas". */
  alphabetSize: number | null;
  distinctMethods: number;
  hasLiveTree: boolean;
  hasTypesCapability: boolean;
  transitionConfirmed: boolean;
  branchesConfirmed: boolean;
  /** `null` = no se pudo determinar (sin árbol vivo, sin capacidad, o sin declaración encontrada). */
  typedNonPrimitive: boolean | null;
  /** Texto crudo del nodo de tipo cuando `typedNonPrimitive` no es `null` — ola de este bug (ver `legacyTypedFieldState`/`resolveRealAbstraction`), para resolver el NOMBRE contra el grafo en vez de asumir "no primitivo" = "abstracción real". `null` cuando no se encontró declaración tipada. */
  typedFieldTypeName: string | null;
  /** Ola AK (AK4) — SÓLO para el ancla `temporary-field`: cuántos MIEMBROS
   *  distintos reparten el ciclo llenar/vaciar, contados por NOMBRE y por
   *  POSICIÓN y quedándose con el mayor (ver `cycleSpreadCheck` para por qué
   *  las dos lecturas). `null`/ausente = no se pudo determinar, o el ancla no
   *  es `temporary-field`: ahí el check se sostiene y no silencia nada. Campo
   *  OPCIONAL a propósito — ninguna de las otras cuatro ramas de construcción
   *  de `StateProblem` se toca. */
  cycleMembers?: number | null;
  /** Ola AL (AL2) — SÓLO para el ancla `temporary-field`: cuántos miembros de
   *  la unidad quedan AFUERA del campo (los que ni lo escriben ni lo leen),
   *  es decir `miembros de la unidad − distinctMethods`. Ver
   *  `unitSlackCheck`. `null`/ausente = no se pudo contar la unidad (sin
   *  árbol vivo, unidad no resuelta) o el ancla no es `temporary-field`: ahí
   *  el check se sostiene y no silencia nada. Campo OPCIONAL a propósito,
   *  igual que `cycleMembers`: ninguna de las otras cuatro ramas de
   *  construcción de `StateProblem` se toca. */
  membersOutsideField?: number | null;
  /** Ola 10 — lugares del `Finding` ancla, para que el excluder ESTRUCTURAL (ver más abajo) resuelva el contexto `C` en el grafo sin necesitar el `Finding` original. */
  locations: readonly RoleLocation[];
  /** Ola W2 — `true` cuando el ancla es `conditional-chain` con
   *  `variant === "instantiates"` (selección de tipo a instanciar en cada
   *  rama): eso es Factory Method, nunca State — ver `notTypeSelectionCheck`.
   *  Siempre `false` para el ancla `repeated-switch`, que no expone esta
   *  forma. */
  isTypeSelection: boolean;
}

/**
 * Vocabulario duplicado a propósito de `code-grammar.ts` (mismo criterio que
 * `TERNARY_NAME`/`PRIMITIVE_TYPE_WORD`): ese módulo no expone un
 * `switchArmNodes` propio en `DerivedNodeSets` (los funde en `branchNodes`
 * junto con if/loop/ternario, que no sirven acá), así que contar ramas de UN
 * contenedor puntual exige repetir el mismo recorrido RELACIONAL que
 * `switchWalk` — nunca "hijos nombrados directos", porque toda gramática
 * soportada envuelve las ramas en un contenedor intermedio (`switch_body` en
 * TS, `switch_block` en Java) que un conteo plano no atraviesa.
 */
const SWITCH_WORD = /(^|_)(switch|case|when|match|select)(_|$)/;
const SWITCH_ARM_EXCLUDE = /(pattern|else|default)/;
const SWITCH_WRAPPER_EXCLUDE = /(^|_)(body|block|label)$/;

/**
 * Cuenta las ramas de ESTE contenedor de switch ya localizado — nunca
 * recursa DENTRO de una rama encontrada (un switch anidado dentro de una
 * rama no debe sumar sus propias ramas a las de `container`), y salta a
 * través de envoltorios (`switch_body`/`switch_block`) que agrupan ramas sin
 * decidir nada por sí mismos. El `default`/`else` nunca cuenta como rama —
 * mismo criterio que `code-grammar.ts` documenta para `chainNodes`.
 */
function countArms(container: ProbeNode): number {
  let count = 0;
  const visit = (node: ProbeNode): void => {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (!child || !child.isNamed) continue;
      const isWrapper = SWITCH_WORD.test(child.type) && SWITCH_WRAPPER_EXCLUDE.test(child.type);
      const isArm = SWITCH_WORD.test(child.type) && !SWITCH_ARM_EXCLUDE.test(child.type) && !isWrapper;
      if (isArm) count++;
      else visit(child);
    }
  };
  visit(container);
  return count;
}

/** Busca, en `root`, un contenedor de switch cuya línea de inicio coincide EXACTAMENTE con `startLine` — la misma línea que `repeated-switch.ts` ya reportó para esa ocurrencia. */
function findSwitchAt(root: AstNode, switchContainerNodes: ReadonlySet<string>, startLine: number): AstNode | null {
  let found: AstNode | null = null;
  walkTree(root, (node) => {
    if (found || !node.isNamed || !switchContainerNodes.has(node.type)) return;
    const real = node as AstNode;
    if (real.startPosition.row + 1 === startLine) found = real;
  });
  return found;
}

/**
 * Insensible a mayúsculas (Ola W2, bug encontrado escribiendo el test de
 * `declaredMemberSelf`): para el ancla `repeated-switch`, `fieldName` sale
 * YA EN MINÚSCULAS del título del hallazgo (`repeated-switch.ts` agrupa por
 * `subject.toLowerCase()`), así que un campo con mayúsculas en el código
 * real (el caso canónico del patrón, `_currentState`) nunca matcheaba una
 * reasignación real (`_currentState = …`) contra el `fieldName` lowercased
 * — mismo criterio de insensibilidad que `declaresMemberNamed`/
 * `repeated-switch.ts#bySubject` ya usan para el mismo dato.
 */
function scanTransition(root: AstNode, fieldName: string): boolean {
  const assignRe = new RegExp(`(?:self\\.|this\\.|@)?${escapeRegExp(fieldName)}\\s*=(?!=)`, "i");
  return assignRe.test(root.text);
}

/**
 * `true` si ALGÚN nodo del subárbol de `typeNode` es un tipo primitivo
 * dedicado de la gramática — nunca sólo `typeNode.type` en sí: varias
 * gramáticas (TypeScript incluida) envuelven la anotación en un nodo
 * contenedor propio (p.ej. `type_annotation`) que nunca matchea
 * `PRIMITIVE_TYPE_WORD` diga lo que diga adentro, así que mirar sólo el nodo
 * inmediato clasificaría TODO campo tipado como "no primitivo" — el mismo
 * criterio (buscar en TODO el subárbol) que
 * `primitive-obsession.ts#primitiveTypeText` ya usa para la razón idéntica.
 */
function hasPrimitiveTypeNode(typeNode: ProbeNode): boolean {
  let found = false;
  walkTree(typeNode, (node) => {
    if (found || !node.isNamed) return;
    if (PRIMITIVE_TYPE_WORD.test(node.type)) found = true;
  });
  return found;
}

/** Resultado de `scanTypedField` — el booleano viejo (`nonPrimitive`) MÁS el texto crudo del nodo de tipo, agregado esta ola para poder resolverlo contra el grafo (ver `resolveRealAbstraction`) sin volver a caminar el árbol. */
interface TypedFieldScan {
  readonly nonPrimitive: boolean;
  readonly typeText: string;
}

/**
 * Primera declaración con campo `type`/`return_type` cuyo texto menciona
 * `fieldName` como palabra completa. Heurística POR TEXTO (no hay un nombre
 * de campo "declaración de propiedad" uniforme entre las 9 gramáticas para
 * acotar esto a "el campo que se llama exactamente X") — declarado como
 * simplificación, no como bug: el riesgo es matchear una declaración NO
 * relacionada que sólo menciona el nombre en un comentario o string dentro
 * de su propio subárbol. Se detiene en el primer match (aproximación).
 */
function scanTypedField(root: AstNode, fieldName: string): TypedFieldScan | null {
  let result: TypedFieldScan | null = null;
  const mentions = new RegExp(`\\b${escapeRegExp(fieldName)}\\b`);
  walkTree(root, (node) => {
    if (result !== null || !node.isNamed) return;
    const typeNode: ProbeNode | null = node.childForFieldName("type") ?? node.childForFieldName("return_type");
    if (!typeNode) return;
    const real = node as AstNode;
    if (!mentions.test(real.text)) return;
    // TS/JS/Vue envuelven la anotación en `type_annotation`, cuyo `.text`
    // INCLUYE el `:` (verificado: "handler: Probe" da typeNode.text === ": Probe")
    // — se descarta acá, no en `resolveRealAbstraction`, para que el resto del
    // módulo siga viendo un nombre de tipo limpio. Sin efecto en gramáticas
    // (C#/Java/...) donde el campo "type" ya resuelve al identificador solo.
    result = { nonPrimitive: !hasPrimitiveTypeNode(typeNode), typeText: (typeNode as AstNode).text.trim().replace(/^:\s*/, "") };
  });
  return result;
}

/* ═══════════════════════════════════════════════════════════════════════
 * Ola W2 — ANCLA `conditional-chain`: localizar la cadena/switch en el árbol
 * vivo y leer su discriminante. Duplicado, adaptado y simplificado, de
 * `strategy.ts#chainCandidates`/`#chainDiscriminantText`/`#discriminantSubject`
 * — mismo precedente de duplicación intencional que `PRIMITIVE_TYPE_WORD`/
 * `SWITCH_WORD` arriba ("cada hipótesis arma su propio resolutor pequeño").
 * SIMPLIFICADO respecto de `strategy.ts`: desempata por TAMAÑO del subárbol
 * (líneas), no por conteo de peldaños/arms — alcanza para elegir "la cadena
 * real" cuando una función tiene más de una, y evita duplicar
 * `ifLadderBranchActions`/`switchArmActions` (que exigen replicar
 * `branchAction`/`armHasOwnContent`, mucho más código para un desempate que
 * esta hipótesis no necesita con esa precisión: a diferencia de Strategy,
 * State sólo lee el DISCRIMINANTE, nunca juzga el contenido de cada rama).
 * ═══════════════════════════════════════════════════════════════════════ */
interface ChainCandidate {
  readonly node: AstNode;
  readonly span: number;
}

/** Todos los nodos-raíz de cadena (if-ladder o switch) dentro de `root` — recursa DENTRO de un candidato ya encontrado (mismo criterio que `strategy.ts#chainCandidates`: un elsif/if anidado vuelve a aparecer como candidato menor, pierde el desempate por tamaño). */
function chainCandidatesIn(root: AstNode, sets: DerivedNodeSets): ChainCandidate[] {
  const out: ChainCandidate[] = [];
  const visit = (node: AstNode): void => {
    if (node.isNamed) {
      if (sets.switchContainerNodes.has(node.type)) {
        out.push({ node, span: node.endPosition.row - node.startPosition.row });
      } else if (sets.chainNodes.has(node.type) && node.childForFieldName("condition")) {
        out.push({ node, span: node.endPosition.row - node.startPosition.row });
      }
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i) as AstNode | null;
      if (child) visit(child);
    }
  };
  visit(root);
  return out;
}

/** La cadena/switch de MAYOR span dentro de `node` — `null` si no hay ninguna. */
function biggestChainIn(node: AstNode, sets: DerivedNodeSets): AstNode | null {
  const candidates = chainCandidatesIn(node, sets);
  if (candidates.length === 0) return null;
  let best = candidates[0]!;
  for (const c of candidates.slice(1)) if (c.span > best.span) best = c;
  return best.node;
}

/** Texto del discriminante/condición — mismos campos genéricos que `repeated-switch.ts#switchSubjectText`/`strategy.ts#chainDiscriminantText`. */
const CHAIN_DISCRIMINANT_FIELDS = ["value", "subject", "condition"];
function chainDiscriminantText(node: AstNode): string | null {
  for (const field of CHAIN_DISCRIMINANT_FIELDS) {
    const child = node.childForFieldName(field) as AstNode | null;
    if (child) return child.text.replace(/[()]/g, "").trim();
  }
  return null;
}

/** Operadores de comparación genéricos (no vocabulario de un lenguaje) que separan un SUJETO de lo que se compara contra él — para un `if`, `chainDiscriminantText` devuelve la condición ENTERA (`"kind === \"circle\""`); para un `switch`/`match` ya es el sujeto limpio, sin operador que recortar. */
const COMPARISON_OPERATOR = /^(.*?)\s*(===|!==|==|!=|>=|<=|>|<)\s*/;
function discriminantSubject(text: string): string {
  return (COMPARISON_OPERATOR.exec(text)?.[1] ?? text).trim();
}

/** La función cuyo rango de líneas CONTIENE `loc` — la más angosta si hay anidamiento. Mismo criterio que `strategy.ts#findEnclosingFunction`. */
function enclosingFunctionUnit(file: FileUnit, loc: RoleLocation): FunctionUnit | null {
  let best: FunctionUnit | null = null;
  for (const fn of file.functions) {
    if (fn.startLine <= loc.startLine && loc.endLine <= fn.endLine) {
      if (!best || fn.endLine - fn.startLine < best.endLine - best.startLine) best = fn;
    }
  }
  return best;
}

/** `Finding.variant` que `conditional-chain.ts#buildConditionalChainFinding` usa para marcar "todas las ramas construyen un tipo distinto" — eso es Factory Method, nunca State (ver `notTypeSelectionCheck`). */
const TYPE_SELECTION_VARIANT = "instantiates";

/**
 * `buildProblem` para el ancla `conditional-chain`. `isTypeSelection` se
 * computa SIEMPRE (aunque no haya árbol vivo, para que `notTypeSelectionCheck`
 * tenga evidencia); el resto de los campos quedan en sus valores neutros
 * ("sin evidencia", nunca "ausente confirmado") si no hay árbol vivo, no hay
 * función encerrante, no hay cadena localizable, o no se pudo leer el
 * discriminante — mismo criterio declarado que la rama `repeated-switch`
 * de abajo ya sigue.
 */
function buildConditionalChainProblem(problem: Finding, ctx: HypothesisContext): StateProblem {
  const isTypeSelection = problem.variant === TYPE_SELECTION_VARIANT;
  const hasTypesCapability = ctx.capabilities.has("tipos-explicitos");
  const neutral: StateProblem = {
    fieldName: null,
    selfPrefixed: false,
    implicitSelfMember: false,
    declaredMemberSelf: false,
    capturedViaOwnGetter: false,
    receiverQualifiedSelf: false,
    receiverItself: false,
    isTemporaryField: false,
    isEnumeratedDispatch: false,
    isTypeSwitch: false,
    alphabetSize: null,
    distinctMethods: 0,
    hasLiveTree: false,
    hasTypesCapability,
    transitionConfirmed: false,
    branchesConfirmed: false,
    typedNonPrimitive: null,
    typedFieldTypeName: null,
    locations: problem.locations,
    isTypeSelection,
  };

  const file = ctx.file;
  const loc = problem.locations[0];
  if (!file || !loc || isTypeSelection) return neutral; // territorio de Factory Method, o sin árbol vivo: nada más que derivar.

  const sets = ctx.setsFor(file.language);
  const fn = enclosingFunctionUnit(file, loc);
  if (!fn) return neutral;

  const chain = biggestChainIn(fn.node, sets);
  if (!chain) return neutral;

  const text = chainDiscriminantText(chain);
  if (!text) return neutral;

  const subject = discriminantSubject(text);
  const selfPrefixed = SELF_PREFIX.test(text);
  const fieldName = selfPrefixed ? subject.replace(SELF_PREFIX, "") : subject;

  let implicitSelfMember = false;
  if (!selfPrefixed) implicitSelfMember = hasImplicitSelfReference(file, fieldName, [loc]);

  let declaredMemberSelf = false;
  if (!selfPrefixed && !implicitSelfMember && BARE_IDENTIFIER.test(fieldName) && !isShadowedByOwnParameter(fn.node, fieldName)) {
    declaredMemberSelf = declaresMemberNamed(file.root, sets, chain, fieldName);
  }

  // Ola X (B6) — ver `localFromOwnGetter`: sólo se intenta cuando las dos
  // formas más fuertes ya fallaron, sobre la MISMA función que contiene la
  // cadena (`fn.node`, no `chain`: el `= getter()` puede estar en cualquier
  // statement anterior de la función, no dentro del propio nodo de cadena).
  let capturedViaOwnGetter = false;
  if (!selfPrefixed && !implicitSelfMember && !declaredMemberSelf && BARE_IDENTIFIER.test(fieldName) && !isShadowedByOwnParameter(fn.node, fieldName)) {
    capturedViaOwnGetter = localFromOwnGetter(fn.node, file.root, sets, fieldName);
  }

  // Ola AJ (AJ5) — QUINTA forma, ver `isReceiverQualified`: sólo se intenta
  // cuando las cuatro de arriba ya fallaron, y sólo puede ser `true` para una
  // forma (`R.campo`) que ninguna de ellas puede reconocer por construcción.
  const receiverQualifiedSelf =
    !selfPrefixed && !implicitSelfMember && !declaredMemberSelf && !capturedViaOwnGetter && isReceiverQualified(fn.node, fieldName);

  // Ola AK (AK1) — SEXTA forma, ver `isReceiverItself`: sólo se intenta cuando
  // las CINCO de arriba ya fallaron, y sólo puede ser `true` para una forma (el
  // discriminante desnudo idéntico al receptor) que ninguna de ellas puede
  // reconocer por construcción.
  const receiverItself =
    !selfPrefixed &&
    !implicitSelfMember &&
    !declaredMemberSelf &&
    !capturedViaOwnGetter &&
    !receiverQualifiedSelf &&
    isReceiverItself(fn.node, fieldName);

  const distinctMethods = crossMethodOccurrences(file, sets, fn, chain, fieldName.toLowerCase());
  const transitionConfirmed = scanTransition(file.root, fieldName);
  // El ancla YA garantiza >= 5 ramas (piso de `conditional-chain.ts`, por
  // encima de STATE_MIN_BRANCHES=3) — se lee el trigger que el detector ya
  // calculó, sin re-caminar el árbol.
  const branchesConfirmed = (problem.trigger[0]?.value ?? 0) >= STATE_MIN_BRANCHES;

  let typedNonPrimitive: boolean | null = null;
  let typedFieldTypeName: string | null = null;
  if (hasTypesCapability) {
    const scan = scanTypedField(file.root, fieldName);
    typedNonPrimitive = scan ? scan.nonPrimitive : null;
    typedFieldTypeName = scan ? scan.typeText : null;
  }

  return {
    ...neutral,
    fieldName,
    selfPrefixed,
    implicitSelfMember,
    declaredMemberSelf,
    capturedViaOwnGetter,
    receiverQualifiedSelf,
    receiverItself,
    distinctMethods,
    hasLiveTree: true,
    transitionConfirmed,
    branchesConfirmed,
    typedNonPrimitive,
    typedFieldTypeName,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
 * OLA AI, FRENTE AI4 — CUARTA ANCLA: `type-switch`. EL ANCLA HUÉRFANA.
 *
 * QUÉ CIERRA. `strategy.ts#notStateCheck` DESCARTA un `type-switch` cuando su
 * discriminante ES un campo propio, con la evidencia textual *"eso es State
 * (regla 16), no Strategy"* — y `state.ts` NO escuchaba `type-switch`. El caso
 * quedaba en SILENCIO TOTAL: un patrón lo descarta nombrando al otro, y el otro
 * no lo recoge. AH1 lo midió y lo dejó pedido (`ola-ah/informes/AH1.md` §5.1,
 * "PIDO A OTRO FRENTE"); el integrador de la Ola AH lo repitió en su lista de
 * pendientes (§12.19). NO es un patrón nuevo (el catálogo sigue en 19) ni un
 * ancla nueva de DETECCIÓN: es conectar un ancla que YA existe a un patrón que
 * YA existe.
 *
 * POR QUÉ HACE FALTA UNA RAMA PROPIA — es el MISMO defecto de forma que la
 * TERCERA ANCLA documenta más arriba, y son DOS `required` que la entrada de
 * este ancla no puede satisfacer POR CONSTRUCCIÓN. Agregar `type-switch` al
 * array `anchors` SIN esta rama produce CERO:
 *
 *   (D1) La rama por defecto de `buildProblem` saca el discriminante con
 *        `/^"([^"]+)"/`. El título de `type-switch` es
 *        `` `X decide por el TIPO de \`s\` en N ramas` `` (`detect/
 *        intra-function/type-switch.ts`) — NUNCA empieza con comilla, así que
 *        `fieldName` sale `null` y `selfPrefixCheck`, el primer `required`,
 *        corta el 100 %.
 *   (D2) La rama por defecto cuenta `distinctMethods` como los `symbol`
 *        DISTINTOS de `problem.locations`. `type-switch.ts` emite UN `Finding`
 *        POR SITIO, con UNA sola location, así que `distinctMethods` vale
 *        SIEMPRE 1 y `methodCountCheck` (`>= STATE_MIN_METHODS`) corta el
 *        100 %. Es la misma razón por la que la rama `conditional-chain`
 *        calcula `crossMethodOccurrences` en vez de leer `locations`.
 *
 * LA FUERZA, y por qué no es un síntoma correlacionado. State es *"el
 * comportamiento del objeto cambia según un valor interno de un conjunto
 * CERRADO, el objeto reasigna ese valor durante su vida, y la decisión está
 * repetida a mano en varios miembros"*. Un `type-switch` cuyo discriminante es
 * un campo del PROPIO tipo es esa situación escrita con el TIPO como valor: el
 * conjunto cerrado es la lista de tipos que el detector ya extrajo, el valor
 * interno es el campo, y "repetida en varios miembros" es lo que
 * `methodCountCheck` exige. Cuando el discriminante es un PARÁMETRO o un local,
 * la MISMA forma es Strategy — y esa mitad YA tiene dueño.
 *
 * POR ESO ESTE CAMINO ES EL COMPLEMENTO EXACTO, NUNCA UN RIVAL:
 * `strategy.ts#notStateCheck` exige que el discriminante NO sea campo propio y
 * esta rama exige que SÍ lo sea, así que sobre el MISMO `Finding` los dos no
 * pueden emitir a la vez — y el arbitraje (`engine.ts#arbitrateRivalHypotheses`)
 * es POR HALLAZGO (`run.ts#attachHypotheses`/`#rebuildHypothesesWithGraph`). Sin
 * doble conteo y sin entierro de una oportunidad ajena.
 *
 * LA ESCALA — NINGÚN NÚMERO NUEVO. `STATE_MIN_METHODS = 2`, el piso que este
 * módulo ya tiene, y por la vía débil la reasignación real que
 * `implicitSelfNeedsTransitionEvidence` ya exige. `STATE_MIN_BRANCHES` queda
 * DISCRIMINADOR, como está hoy: el piso del ancla es 2 y subirlo sería recortar
 * población — AH1 midió el precio del otro lado (2→3 destruye 4 de las 8
 * verdaderas de Strategy sobre este mismo ancla).
 *
 * LA GUARDA QUE SÍ SE APLICA, decidida ANTES de medir: `declaresMemberNamed`
 * contesta *"¿este texto aparece en el cuerpo del tipo, fuera de un método?"*,
 * no *"¿es un campo alcanzable desde ESTE método?"* — el defecto que AH1
 * diagnosticó (`Iterables.getLast(Iterable<T> iterable)`: el PARÁMETRO
 * `iterable` "resuelve a miembro" por un campo de una clase ANIDADA). Este
 * módulo ya tiene su propia guarda (`isShadowedByOwnParameter`, Ola W2, con su
 * caso medido `JValue.cs:611`) y su rama `conditional-chain` ya la aplica antes
 * de preguntar; esta rama la aplica igual. `declaresMemberNamed` NO se toca: lo
 * comparte la rama `conditional-chain` y moverlo podría PERDER propuestas
 * verdaderas ya juzgadas.
 *
 * EL HECHO VERIFICADO ANTES DE ESCRIBIR ESTA RAMA (condición 4 de la receta):
 * `ctx.file` (árbol vivo) y `graph` (CodeGraph del repo) son los DOS no-nulos
 * cuando `build()` corre sobre un `type-switch` en la pasada que PUBLICA
 * (`run.ts#rebuildHypothesesWithGraph`). Medido con la traza que AH1 dejó en
 * producción (`strategy.ts#startStrategyTrace`, no tocada), corrida sobre guava:
 * `withFile: true` y `withGraph: true` en 69 de 69 entradas de `type-switch`.
 * Sin el árbol esta rama sería 100 % "no demostrado"; sin el grafo
 * `appliedState` no podría distinguir nunca `aplicado-eludido`/`parcial` de
 * `ausente` y la condición 3 de la receta quedaría inerte.
 * ═══════════════════════════════════════════════════════════════════════ */
const TYPE_SWITCH_ANCHOR = "type-switch";

/**
 * El detector escribe el sujeto entre backticks en el título — MISMO dato que
 * `strategy.ts#TYPE_SWITCH_SUBJECT` lee para su excluder simétrico, y mismo
 * truco que la rama `repeated-switch` de `buildProblem` usa sobre SU título. No
 * es una re-derivación: es leer lo que el detector-ancla ya calculó.
 */
const TYPE_SWITCH_SUBJECT = /decide por el TIPO de `([^`]+)`/;

/**
 * El nodo de cadena/switch que EMPIEZA en `startLine` — la línea exacta que
 * `type-switch.ts` reporta para ESE sitio (`site.node.startPosition.row + 1`).
 * El más angosto si hay más de uno. Mismo criterio de anclaje por línea que
 * `findSwitchAt` ya usa para `repeated-switch`, extendido a las cadenas porque
 * este ancla también emite sobre escaleras `if`/`else if`.
 */
function chainNodeAtLine(fnNode: AstNode, sets: DerivedNodeSets, startLine: number): AstNode | null {
  let best: ChainCandidate | null = null;
  for (const c of chainCandidatesIn(fnNode, sets)) {
    if (c.node.startPosition.row + 1 !== startLine) continue;
    if (!best || c.span < best.span) best = c;
  }
  return best ? best.node : null;
}

/**
 * "La decisión está repetida a mano en varios miembros", contada en LA MONEDA
 * DEL ANCLA: cuántos `symbol` DISTINTOS del MISMO archivo tienen un
 * `type-switch` sobre el MISMO sujeto normalizado, éste incluido.
 *
 * POR QUÉ NO ALCANZA `crossMethodOccurrences` SOLO, y es un hecho medido, no una
 * suposición: esa función compara el sujeto que `discriminantSubject` recorta
 * con `COMPARISON_OPERATOR`, y ese operador NO incluye la prueba de tipo
 * (`x instanceof T`, `isinstance(x, T)`, `x.is_a?(T)`) — el mismo defecto que
 * AH1 midió sobre el gemelo de esa función en `strategy.ts`. Para la variante
 * ESCALERA de este ancla el sujeto sale con la prueba de tipo pegada y nunca
 * normaliza al nombre del campo, así que `crossMethodOccurrences` SUB-CUENTA por
 * construcción. El vecindario contesta la MISMA pregunta con el dato que el
 * detector ya calculó, sin re-derivar ninguna gramática de prueba de tipo.
 *
 * Se toma el MÁXIMO de las dos cuentas, nunca la suma: son dos maneras de mirar
 * el mismo hecho y sumarlas contaría dos veces al mismo miembro.
 * `findingsOfKind` trunca a `NEIGHBORHOOD_MAX_PEERS` (`graph/neighborhood.ts`);
 * cuando trunca, esta cuenta es una COTA INFERIOR — sólo puede sub-contar, nunca
 * inventar un miembro que no existe.
 */
function typeSwitchSiblingMembers(problem: Finding, ctx: HypothesisContext, normalizedField: string): number {
  const loc = problem.locations[0];
  if (!loc) return 1;
  const members = new Set<string>([loc.symbol ?? ""]);
  for (const peer of ctx.neighborhood.findingsOfKind(TYPE_SWITCH_ANCHOR)) {
    const peerLoc = peer.locations[0];
    if (!peerLoc || peerLoc.file !== loc.file) continue;
    const raw = TYPE_SWITCH_SUBJECT.exec(peer.title)?.[1];
    if (!raw) continue;
    const subject = discriminantSubject(raw);
    const stripped = SELF_PREFIX.test(subject) ? subject.replace(SELF_PREFIX, "") : subject;
    if (stripped.toLowerCase() !== normalizedField) continue;
    members.add(peerLoc.symbol ?? "");
  }
  return members.size;
}

/**
 * `buildProblem` para el ancla `type-switch`. Los campos quedan en sus valores
 * neutros ("sin evidencia", nunca "ausente confirmado") si no hay árbol vivo, no
 * se pudo leer el sujeto del título, o no hay función encerrante — mismo
 * criterio declarado que las otras tres ramas ya siguen.
 */
function buildTypeSwitchProblem(problem: Finding, ctx: HypothesisContext): StateProblem {
  const hasTypesCapability = ctx.capabilities.has("tipos-explicitos");
  const neutral: StateProblem = {
    fieldName: null,
    selfPrefixed: false,
    implicitSelfMember: false,
    declaredMemberSelf: false,
    capturedViaOwnGetter: false,
    receiverQualifiedSelf: false,
    receiverItself: false,
    isTemporaryField: false,
    isEnumeratedDispatch: false,
    isTypeSwitch: true,
    alphabetSize: null,
    distinctMethods: 0,
    hasLiveTree: false,
    hasTypesCapability,
    transitionConfirmed: false,
    branchesConfirmed: false,
    typedNonPrimitive: null,
    typedFieldTypeName: null,
    locations: problem.locations,
    isTypeSelection: false,
  };

  const file = ctx.file;
  const loc = problem.locations[0];
  if (!file || !loc) return neutral;

  const rawSubject = TYPE_SWITCH_SUBJECT.exec(problem.title)?.[1] ?? null;
  if (!rawSubject) return neutral;
  const subject = discriminantSubject(rawSubject);
  const selfPrefixed = SELF_PREFIX.test(subject);
  const fieldName = selfPrefixed ? subject.replace(SELF_PREFIX, "") : subject;
  if (!fieldName) return neutral;

  const sets = ctx.setsFor(file.language);
  const fn = enclosingFunctionUnit(file, loc);
  if (!fn) return neutral;
  // El sitio EXACTO que el detector reportó; si la gramática no lo expone como
  // candidato de cadena, el cuerpo de la función encerrante da el MISMO dueño
  // class-like (`narrowestClassAround` sube hasta la clase en los dos casos).
  const site = chainNodeAtLine(fn.node, sets, loc.startLine) ?? fn.node;

  let implicitSelfMember = false;
  if (!selfPrefixed) implicitSelfMember = hasImplicitSelfReference(file, fieldName, [loc]);

  // La guarda de sombreado por parámetro va ANTES de preguntar, igual que en la
  // rama `conditional-chain` — ver el docstring de arriba, "LA GUARDA QUE SÍ SE
  // APLICA".
  const bareCandidate = !selfPrefixed && !implicitSelfMember && BARE_IDENTIFIER.test(fieldName) && !isShadowedByOwnParameter(fn.node, fieldName);
  let declaredMemberSelf = false;
  if (bareCandidate) declaredMemberSelf = declaresMemberNamed(file.root, sets, site, fieldName);

  let capturedViaOwnGetter = false;
  if (bareCandidate && !declaredMemberSelf) capturedViaOwnGetter = localFromOwnGetter(fn.node, file.root, sets, fieldName);

  // Ola AJ (AJ5) — QUINTA forma, ver `isReceiverQualified`.
  const receiverQualifiedSelf =
    !selfPrefixed && !implicitSelfMember && !declaredMemberSelf && !capturedViaOwnGetter && isReceiverQualified(fn.node, fieldName);

  // Ola AK (AK1) — SEXTA forma, ver `isReceiverItself`: sólo cuando las cinco
  // de arriba ya fallaron.
  const receiverItself =
    !selfPrefixed &&
    !implicitSelfMember &&
    !declaredMemberSelf &&
    !capturedViaOwnGetter &&
    !receiverQualifiedSelf &&
    isReceiverItself(fn.node, fieldName);

  const normalizedField = fieldName.toLowerCase();
  const distinctMethods = Math.max(
    crossMethodOccurrences(file, sets, fn, site, normalizedField),
    typeSwitchSiblingMembers(problem, ctx, normalizedField),
  );
  const transitionConfirmed = scanTransition(file.root, fieldName);
  // El ancla ya garantiza >= 2 ramas que deciden por tipo (`presencia`, el piso
  // del propio detector) — se lee el trigger que el detector ya calculó, sin
  // re-caminar el árbol, igual que la rama `conditional-chain`.
  const branchesConfirmed = (problem.trigger[0]?.value ?? 0) >= STATE_MIN_BRANCHES;

  let typedNonPrimitive: boolean | null = null;
  let typedFieldTypeName: string | null = null;
  if (hasTypesCapability) {
    const scan = scanTypedField(file.root, fieldName);
    typedNonPrimitive = scan ? scan.nonPrimitive : null;
    typedFieldTypeName = scan ? scan.typeText : null;
  }

  return {
    ...neutral,
    fieldName,
    selfPrefixed,
    implicitSelfMember,
    declaredMemberSelf,
    capturedViaOwnGetter,
    receiverQualifiedSelf,
    receiverItself,
    distinctMethods,
    hasLiveTree: true,
    transitionConfirmed,
    branchesConfirmed,
    typedNonPrimitive,
    typedFieldTypeName,
  };
}

function buildProblem(problem: Finding, ctx: HypothesisContext): StateProblem {
  if (problem.kind === "conditional-chain") return buildConditionalChainProblem(problem, ctx);
  if (problem.kind === "temporary-field") return buildTemporaryFieldProblem(problem, ctx);
  if (problem.kind === "enumerated-field-dispatch") return buildEnumeratedDispatchProblem(problem, ctx);
  if (problem.kind === TYPE_SWITCH_ANCHOR) return buildTypeSwitchProblem(problem, ctx);

  const subjectMatch = /^"([^"]+)"/.exec(problem.title);
  const subject = subjectMatch?.[1] ?? null;
  const selfPrefixed = subject !== null && SELF_PREFIX.test(subject);
  const fieldName = subject !== null ? subject.replace(SELF_PREFIX, "") : null;

  const methodNames = problem.locations.map((l) => l.symbol).filter((s): s is string => Boolean(s));
  const distinctMethods = new Set(methodNames).size;

  const file = ctx.file;
  const hasLiveTree = file !== null && fieldName !== null;
  const hasTypesCapability = ctx.capabilities.has("tipos-explicitos");

  let transitionConfirmed = false;
  let branchesConfirmed = false;
  let typedNonPrimitive: boolean | null = null;
  let typedFieldTypeName: string | null = null;
  // Sin prefijo por texto y sin árbol vivo, no hay forma honesta de preguntar
  // al grafo de referencias — se queda en `false`, nunca se afirma sin
  // evidencia (mismo criterio que `transitionConfirmed`/`branchesConfirmed`
  // de acá abajo, que también dependen de `file`).
  let implicitSelfMember = false;
  // Ola W2 — ver `declaresMemberNamed` en el docstring del módulo: cierra el
  // bug de 3 olas ("selfPrefixCheck bloquea el 100 % de C#/Java/Go").
  let declaredMemberSelf = false;
  // Ola X (B6) — ver `localFromOwnGetter`: TERCERA forma, sólo para
  // `repeated-switch` (el ancla `conditional-chain` tiene su propio camino
  // en `buildConditionalChainProblem`, arriba).
  let capturedViaOwnGetter = false;
  // Ola AJ (AJ5) — QUINTA forma, ver `isReceiverQualified`.
  let receiverQualifiedSelf = false;
  // Ola AK (AK1) — SEXTA forma, ver `isReceiverItself`.
  let receiverItself = false;

  if (file && fieldName) {
    transitionConfirmed = scanTransition(file.root, fieldName);
    // El PRIMER switch localizado (de cualquiera de las locations) queda
    // como ancla real para `declaresMemberNamed` — nunca cambia
    // `branchesConfirmed`, que sigue siendo la MISMA pregunta de siempre
    // (`.some` ya recorre TODAS las locations hasta confirmar o agotarlas).
    let switchNode: AstNode | null = null;
    branchesConfirmed = problem.locations.some((loc) => {
      const node = findSwitchAt(file.root, file.sets.switchContainerNodes, loc.startLine);
      if (node && !switchNode) switchNode = node;
      return node !== null && countArms(node) >= STATE_MIN_BRANCHES;
    });
    if (hasTypesCapability) {
      const scan = scanTypedField(file.root, fieldName);
      typedNonPrimitive = scan ? scan.nonPrimitive : null;
      typedFieldTypeName = scan ? scan.typeText : null;
    }
    if (!selfPrefixed) implicitSelfMember = hasImplicitSelfReference(file, fieldName, problem.locations);
    // La función que contiene EL SWITCH — el mismo dato que las dos formas de
    // abajo ya necesitaban, izado acá porque la QUINTA (Ola AJ) también lo
    // necesita y su forma (`R.campo`) NO pasa por `BARE_IDENTIFIER`.
    // Byte a byte el mismo cálculo que hacía la rama de abajo.
    const enclosingFn =
      switchNode !== null
        ? enclosingFunctionUnit(file, {
            file: file.path,
            startLine: (switchNode as AstNode).startPosition.row + 1,
            endLine: (switchNode as AstNode).endPosition.row + 1,
            role: "",
          })
        : null;
    if (!selfPrefixed && !implicitSelfMember && switchNode && BARE_IDENTIFIER.test(fieldName)) {
      // Ver `isShadowedByOwnParameter`: un parámetro del método que contiene
      // EL SWITCH sombrea a un miembro homónimo — resuelto acá vía el rango
      // del propio `switchNode` (el mismo dato que ya localizamos), sin
      // depender de qué `loc` puntual disparó el `.some` de arriba.
      const shadowed = enclosingFn !== null && isShadowedByOwnParameter(enclosingFn.node, fieldName);
      if (!shadowed) declaredMemberSelf = declaresMemberNamed(file.root, file.sets, switchNode, fieldName);
      if (!shadowed && !declaredMemberSelf && enclosingFn) {
        capturedViaOwnGetter = localFromOwnGetter(enclosingFn.node, file.root, file.sets, fieldName);
      }
    }
    // Ola AJ (AJ5) — QUINTA forma: sólo se intenta cuando las cuatro de arriba
    // ya fallaron. `enclosingFn` es la función del SWITCH, la misma que ancla
    // la guarda de sombreado de la rama de arriba.
    if (!selfPrefixed && !implicitSelfMember && !declaredMemberSelf && !capturedViaOwnGetter && enclosingFn) {
      receiverQualifiedSelf = isReceiverQualified(enclosingFn.node, fieldName);
    }
    // Ola AK (AK1) — SEXTA forma: sólo se intenta cuando las CINCO de arriba ya
    // fallaron, sobre la MISMA función encerrante que ancla la guarda de
    // sombreado y la quinta forma.
    if (!selfPrefixed && !implicitSelfMember && !declaredMemberSelf && !capturedViaOwnGetter && !receiverQualifiedSelf && enclosingFn) {
      receiverItself = isReceiverItself(enclosingFn.node, fieldName);
    }
  }

  return {
    fieldName,
    selfPrefixed,
    implicitSelfMember,
    declaredMemberSelf,
    capturedViaOwnGetter,
    receiverQualifiedSelf,
    receiverItself,
    isTemporaryField: false,
    isEnumeratedDispatch: false,
    isTypeSwitch: false,
    alphabetSize: null,
    distinctMethods,
    hasLiveTree,
    hasTypesCapability,
    transitionConfirmed,
    branchesConfirmed,
    typedNonPrimitive,
    typedFieldTypeName,
    locations: problem.locations,
    isTypeSelection: false,
  };
}

/**
 * Ola Y (Y2) — TERCERA ANCLA, `temporary-field`. Ver el docstring del
 * módulo ("TERCERA ANCLA") para la justificación completa de cada campo.
 *
 * Duplicado a propósito de `temporary-field.ts`, la fila EXACTA que ese
 * detector emite para "miembros que sólo lo leen" — mismo precedente de
 * duplicación intencional que el resto del archivo (`PRIMITIVE_TYPE_WORD`/
 * `SWITCH_WORD`): las dos capas no comparten un módulo de vocabulario, y
 * `detect/*` no puede importar de `hypotheses/*` (capas invertidas).
 */
const TEMPORARY_FIELD_READERS_LABEL = "miembros que sólo lo leen";

/**
 * `` `Clase.campo` sólo tiene valor durante parte de la vida del objeto ``
 * — el título EXACTO de `temporary-field.ts`. A diferencia del título de
 * `repeated-switch` (comillas dobles, `"sujeto"`), éste usa backtick +
 * `Clase.campo`: el regex de la rama vieja (`/^"([^"]+)"/`) nunca matchea
 * acá, la razón medida por la que este ancla necesitaba su propia rama.
 */
const TEMPORARY_FIELD_SUBJECT = /^`([^`.]+)\.([^`]+)`/;

function buildTemporaryFieldProblem(problem: Finding, ctx: HypothesisContext): StateProblem {
  const match = TEMPORARY_FIELD_SUBJECT.exec(problem.title);
  const fieldName = match?.[2] ?? null;

  // Mismo cómputo que la rama `repeated-switch` ya hace para `distinctMethods`
  // (locations trae `symbol` = método que ESCRIBE el campo) — acá se le suma
  // a los ESCRITORES los LECTORES que el propio detector ya contó (evidencia
  // "miembros que sólo lo leen"), sin solape por construcción: ver el
  // docstring del módulo, sección "MÉTODOS INVOLUCRADOS".
  const writerMethods = problem.locations.map((l) => l.symbol).filter((s): s is string => Boolean(s));
  const readerCount = problem.evidence?.find((e) => e.label === TEMPORARY_FIELD_READERS_LABEL)?.value ?? 0;
  const distinctMethods = new Set(writerMethods).size + readerCount;

  const file = ctx.file;
  const hasTypesCapability = ctx.capabilities.has("tipos-explicitos");
  // Reutiliza `scanTypedField` TAL CUAL (ver el docstring del módulo, "QUÉ NO
  // CAMBIA") — la misma pregunta ("¿el campo ya está declarado con un tipo
  // con nombre propio?") para las tres anclas.
  let typedNonPrimitive: boolean | null = null;
  let typedFieldTypeName: string | null = null;
  if (file && fieldName && hasTypesCapability) {
    const scan = scanTypedField(file.root, fieldName);
    typedNonPrimitive = scan ? scan.nonPrimitive : null;
    typedFieldTypeName = scan ? scan.typeText : null;
  }

  return {
    fieldName,
    selfPrefixed: false,
    implicitSelfMember: false,
    declaredMemberSelf: false,
    capturedViaOwnGetter: false,
    receiverQualifiedSelf: false,
    receiverItself: false,
    isTemporaryField: fieldName !== null,
    isEnumeratedDispatch: false,
    isTypeSwitch: false,
    alphabetSize: null,
    distinctMethods,
    // No depende de `ctx.file` para lo esencial (a diferencia de las otras
    // dos ramas): todo lo que `selfPrefixCheck`/`methodCountCheck`/
    // `transitionCheck`/`branchesCheck` necesitan ya viene resuelto en el
    // propio `Finding` (título, locations, evidence) — el detector-ancla
    // hizo ese trabajo. `hasLiveTree` acá sólo gatea "¿se pudo leer el
    // título?", no "¿hay árbol vivo?".
    hasLiveTree: fieldName !== null,
    hasTypesCapability,
    // Ver el docstring del módulo, "TRANSICIÓN": el propio criterio de
    // disparo del ancla YA ES una reasignación real (a nulo y a un valor)
    // — nunca una suposición sin evidencia.
    transitionConfirmed: fieldName !== null,
    // Ver el docstring del módulo, "RAMAS": mismo dato que `distinctMethods`,
    // mismo piso (`STATE_MIN_BRANCHES`) que la forma switch usa para
    // distinguir un binario de una máquina de estados real.
    branchesConfirmed: distinctMethods >= STATE_MIN_BRANCHES,
    typedNonPrimitive,
    typedFieldTypeName,
    locations: problem.locations,
    isTypeSelection: false,
    // Ola AK (AK4) — ver `cycleSpreadCheck`. Las DOS lecturas, y el máximo:
    // cada una es una cota inferior que falla por un artefacto de gramática
    // distinto (la propiedad-flecha sin `name`, la lambda anidada que duplica
    // el sitio). Sin árbol vivo la lectura por posición no existe y el número
    // queda en `null`: el check se sostiene y no silencia nada.
    cycleMembers: cycleMembersOf(problem.locations, file),
    // Ola AL (AL2) — ver `unitSlackCheck`. `distinctMethods` ya está contado
    // arriba (escritores DISTINTOS + lectores, sin solape por construcción):
    // lo único que falta es cuántos miembros tiene la unidad entera, y eso
    // sólo se puede leer con árbol vivo.
    membersOutsideField: membersOutsideFieldOf(file, match?.[1] ?? null, problem.locations, distinctMethods),
  };
}

/**
 * Ola AL (AL2) — cuántos miembros de la UNIDAD quedan afuera del campo:
 * `miembros de la unidad − distinctMethods`. `null` cuando la unidad no se
 * puede resolver (sin árbol vivo, sin nodo de unidad y sin receptor que la
 * nombre): ahí no hay evidencia y `unitSlackCheck` se sostiene.
 *
 * NUNCA devuelve un número negativo: `distinctMethods` cuenta escritores por
 * NOMBRE (dos sobrecargas homónimas, o el idiom de la propiedad-flecha de
 * TS/JS que el ancla nombra `"(anónima)"`, colapsan en uno) mientras que el
 * conteo de la unidad es por NODO, así que las dos lecturas no son
 * comparables término a término. La resta se satura en 0 y el check refuta
 * sólo por debajo del piso: el sesgo del colapso empuja el resultado hacia
 * "hay MENOS miembros adentro de los que hay", o sea hacia MÁS holgura, o sea
 * hacia NO refutar. Conservador por construcción.
 */
function membersOutsideFieldOf(
  file: FileUnit | null,
  className: string | null,
  locations: readonly RoleLocation[],
  distinctMethods: number,
): number | null {
  if (!file || !className) return null;
  const total = unitMemberCount(file, className, locations);
  if (total === null) return null;
  return Math.max(0, total - distinctMethods);
}

/**
 * Cuántos miembros function-like tiene la unidad-tipo llamada `className`.
 * `null` si no se pudo resolver.
 *
 * DOS VÍAS, las mismas dos que el resto de este módulo ya usa para "unidad
 * dueña de campos" y por la misma razón escrita en el docstring del módulo
 * (sección "QUINTA FORMA"): la gramática que tiene un nodo class-like lo
 * expone, y la que define la unidad por el RECEPTOR de sus funciones —Go— la
 * nombra ahí. Sin las dos, Go no podría satisfacer este check NUNCA, que es
 * exactamente el defecto que las Olas AH/AI/AJ/AK se pasaron quitando.
 *
 *   (a) nodo class-like cuyo `name` es `className` (el más angosto que
 *       contiene el primer sitio del ciclo, si hay homónimos): se cuentan los
 *       nodos function-like que contiene.
 *   (b) funciones cuyo RECEPTOR declarado es del tipo `className`
 *       (`childForFieldName("receiver")`, el mismo mecanismo que ya está en
 *       producción en `proxy.ts#goReceiverOf`,
 *       `detect/intra-file/temporary-field.ts` y `lazy-init-repetida.ts`).
 *
 * SE TOMA EL MÁXIMO DE LAS DOS, y NO es una precaución teórica: **en Go la
 * vía (a) devuelve SIEMPRE 0**. `code-grammar.ts` clasifica como class-like
 * el `type_spec` de Go —sonda directa contra `tree-sitter-go.wasm`:
 * `classNodes = { type_spec }`— y un `type_spec` es la declaración del
 * struct, que **no contiene ni un método**: los métodos son `func` de nivel
 * superior con receptor, en OTRA declaración (la misma gramática que AJ5
 * documentó para `selfPrefixCheck`). Quedarse con la vía (a) para Go daba
 * `0` miembros y refutaba el 100 % de sus candidatos — una compuerta que una
 * gramática entera no puede pasar, medido: `cobra Command.iflags` (un
 * `Command` con ~100 métodos) refutaba. Con el máximo, Go se cuenta por la
 * vía (b) y el check se comporta igual que en las demás gramáticas. Un
 * máximo de 0 significa "no se pudo contar" y devuelve `null`.
 */
function unitMemberCount(file: FileUnit, className: string, locations: readonly RoleLocation[]): number | null {
  const sets = file.sets;
  const anchorLine = locations[0]?.startLine ?? null;
  const candidates: AstNode[] = [];
  walkTree(file.root, (raw) => {
    const node = raw as AstNode;
    if (!node.isNamed || !sets.classNodes.has(node.type)) return;
    if ((node.childForFieldName("name") as AstNode | null)?.text?.trim() !== className) return;
    candidates.push(node);
  });
  let owner: AstNode | null = null;
  for (const node of candidates) {
    const contains = anchorLine === null || (node.startPosition.row + 1 <= anchorLine && anchorLine <= node.endPosition.row + 1);
    if (!contains) continue;
    if (!owner || node.endPosition.row - node.startPosition.row < owner.endPosition.row - owner.startPosition.row) owner = node;
  }
  if (owner === null && candidates.length === 1) owner = candidates[0]!;
  const byClassNode = owner !== null ? countUnitMembers(owner, sets) : 0;
  const byReceiver = receiverUnitMemberCount(file, className) ?? 0;
  const total = Math.max(byClassNode, byReceiver);
  return total > 0 ? total : null;
}

/**
 * Nodos function-like dentro de `owner`, SIN entrar en una unidad-tipo
 * anidada (los miembros de una clase interna son de OTRA unidad).
 *
 * SÍ se entra en el cuerpo de un miembro ya contado, y NO es un descuido: es
 * lo que hace que las dos mitades de la resta cuenten el MISMO universo.
 * `distinctMethods` sale de `problem.locations[].symbol`, y el detector-ancla
 * RECORRE LOS CUERPOS ANIDADOS: una escritura dentro de una lambda dentro de
 * un método se registra con la LAMBDA como símbolo (lo mismo que AK4 midió
 * para `cycleMembersByPosition`, `ShareX ScreenRecordManager.cs`). Si el
 * universo de arriba excluyera las lambdas y el de abajo las incluyera, la
 * resta daría MENOS holgura de la que hay y el check refutaría de más — que
 * es exactamente lo que pasó midiendo la primera versión de esta función
 * (contaba sólo miembros DIRECTOS y silenciaba `ShareX
 * ScreenRecordManager.recordForm`, una VERDADERA del banco). Contar de más
 * empuja siempre hacia MÁS holgura, o sea hacia NO refutar.
 */
function countUnitMembers(owner: AstNode, sets: DerivedNodeSets): number {
  let count = 0;
  const scan = (node: AstNode): void => {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i) as AstNode | null;
      if (!child?.isNamed) continue;
      if (sets.classNodes.has(child.type)) continue;
      if (sets.functionNodes.has(child.type)) count++;
      scan(child);
    }
  };
  scan(owner);
  return count;
}

/**
 * Vía (b): la unidad que la gramática define por el RECEPTOR de sus funciones.
 * `null` si ninguna función nombra a `className` como tipo de su receptor —
 * ahí no hay unidad que contar y el llamador no debe afirmar nada. Cada
 * función con ese receptor cuenta 1, MÁS las function-like anidadas en su
 * cuerpo, por la misma razón de universo común que `countUnitMembers`
 * documenta.
 */
function receiverUnitMemberCount(file: FileUnit, className: string): number | null {
  const sets = file.sets;
  let count = 0;
  walkTree(file.root, (raw) => {
    const node = raw as AstNode;
    if (!node.isNamed || !sets.functionNodes.has(node.type)) return;
    if (receiverTypeNameOf(node) !== className) return;
    count += 1 + countUnitMembers(node, sets);
  });
  return count > 0 ? count : null;
}

/** El NOMBRE DEL TIPO del receptor declarado por `fnNode`, o `null`. Mismo mecanismo, y mismo camino de lectura, que `receiverNameOf` (que devuelve el nombre del PARÁMETRO): la gramática que tiene receptor lo expone, la que no, devuelve `null`. */
function receiverTypeNameOf(fnNode: AstNode): string | null {
  const receiver = fnNode.childForFieldName("receiver") as AstNode | null;
  if (!receiver) return null;
  let decl: AstNode = receiver;
  for (let i = 0; i < receiver.childCount; i++) {
    const child = receiver.child(i) as AstNode | null;
    if (child?.isNamed) {
      decl = child;
      break;
    }
  }
  const typeNode = (decl.childForFieldName("type") as AstNode | null) ?? null;
  const text = (typeNode?.text ?? decl.text).trim();
  const bare = text.replace(/^[*&]+/, "").trim();
  return BARE_IDENTIFIER.test(bare) ? bare : null;
}

/**
 * Ola AK (AK4) — el número que `cycleSpreadCheck` consume, calculado acá
 * porque es el único punto de esta rama que ve `ctx.file`. `null` cuando no
 * hay árbol vivo o algún sitio no cae dentro de ninguna función: ahí no hay
 * evidencia y el check se sostiene.
 */
function cycleMembersOf(locations: readonly RoleLocation[], file: FileUnit | null): number | null {
  const bySymbol = new Set(locations.map((l) => l.symbol).filter((s): s is string => Boolean(s))).size;
  if (!file) return null;
  const byPosition = cycleMembersByPosition(file, locations);
  if (byPosition === null) return null;
  return Math.max(bySymbol, byPosition);
}

/* ═══════════════════════════════════════════════════════════════════════
 * CUARTA ANCLA — `enumerated-field-dispatch`. Ver el docstring del módulo.
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * `` `Clase.campo` decide el comportamiento de N miembros y toma M valores
 * constantes `` — el título EXACTO de `enumerated-field-dispatch.ts`. Comparte
 * el prefijo `` `Clase.campo` `` con el de `temporary-field`, así que el ruteo
 * NUNCA se hace por título: `buildProblem` despacha por `problem.kind`, que es
 * el dato que no admite ambigüedad.
 */
const ENUMERATED_DISPATCH_SUBJECT = /^`([^`.]+)\.([^`]+)`/;
/** La fila EXACTA que `enumerated-field-dispatch.ts` emite para el alfabeto. */
const ENUMERATED_DISPATCH_ALPHABET_LABEL = "valores del alfabeto";

function buildEnumeratedDispatchProblem(problem: Finding, ctx: HypothesisContext): StateProblem {
  const match = ENUMERATED_DISPATCH_SUBJECT.exec(problem.title);
  const fieldName = match?.[2] ?? null;

  // Los miembros que RAMIFICAN sobre el campo — el primer `trigger` del ancla,
  // no una re-derivación. Se leen de `locations` (un lugar por miembro que
  // decide, más los sitios de reasignación), que es el mismo dato con el que
  // el detector construyó ese número.
  const methodNames = problem.locations.map((l) => l.symbol).filter((s): s is string => Boolean(s));
  const distinctMethods = new Set(methodNames).size;
  const alphabetSize = problem.evidence?.find((e) => e.label === ENUMERATED_DISPATCH_ALPHABET_LABEL)?.value ?? null;

  const file = ctx.file;
  const hasTypesCapability = ctx.capabilities.has("tipos-explicitos");
  // Reutiliza `scanTypedField` TAL CUAL, igual que la tercera ancla: es la
  // mitad de la verificación de "¿la resolución está ausente?" (la otra mitad
  // es el excluder estructural de grafo), y esa pregunta no depende del ancla.
  let typedNonPrimitive: boolean | null = null;
  let typedFieldTypeName: string | null = null;
  if (file && fieldName && hasTypesCapability) {
    const scan = scanTypedField(file.root, fieldName);
    typedNonPrimitive = scan ? scan.nonPrimitive : null;
    typedFieldTypeName = scan ? scan.typeText : null;
  }

  return {
    fieldName,
    selfPrefixed: false,
    implicitSelfMember: false,
    declaredMemberSelf: false,
    capturedViaOwnGetter: false,
    receiverQualifiedSelf: false,
    receiverItself: false,
    isTemporaryField: false,
    isEnumeratedDispatch: fieldName !== null,
    isTypeSwitch: false,
    alphabetSize,
    distinctMethods,
    // Igual que la tercera ancla: todo lo que los `required` necesitan ya vino
    // resuelto por AST en el propio `Finding`. Esto gatea "¿se pudo leer el
    // título?", no "¿hay árbol vivo?".
    hasLiveTree: fieldName !== null,
    hasTypesCapability,
    // NO es una suposición: la condición (2) del detector es exactamente "al
    // menos una asignación constante FUERA del constructor", medida por AST.
    // Es la única de las cuatro anclas donde la transición está verificada por
    // árbol y no por un regex sobre el texto del archivo.
    transitionConfirmed: fieldName !== null,
    // El análogo exacto del "2 ramas es un binario, 3+ es máquina de estados":
    // el tamaño del ALFABETO. Discriminador, nunca requisito.
    branchesConfirmed: alphabetSize !== null && alphabetSize >= STATE_MIN_BRANCHES,
    typedNonPrimitive,
    typedFieldTypeName,
    locations: problem.locations,
    isTypeSelection: false,
  };
}

const selfPrefixCheck: Check<StateProblem, CodeGraph | null> = {
  id: "discriminante-campo-propio",
  describe:
    "El discriminante del switch/cadena es un campo de la propia unidad (@x/self.x/this.x; en Ruby, por grafo de " +
    "referencias, un acceso implícito sin prefijo; un identificador desnudo DECLARADO como miembro real del tipo " +
    "(this implícito de C#/Java/Go); una VARIABLE LOCAL capturada de un getter propio ([this.]getter(), getter " +
    "DECLARADO como miembro real) — Ola X (B6); o — Ola Y (Y2), ancla temporary-field — un campo que el propio " +
    "detector-ancla ya verificó por AST, no un parámetro. Para el ancla type-switch (Ola AI, AI4) rigen las MISMAS " +
    "cuatro formas, con el sujeto leído del título del hallazgo y la guarda de sombreado por parámetro aplicada antes " +
    "de preguntar. Ola AJ (AJ5): un discriminante R.campo con R = el receptor DECLARADO de la función encerrante. " +
    "Ola AK (AK1): un discriminante DESNUDO que ES ese receptor — cuando la gramática declara el método sobre un " +
    "valor, ese valor no es un campo del objeto, es el objeto.",
  run(p) {
    if (!p.fieldName) return { holds: false, evidence: "no se pudo extraer el discriminante (del título del hallazgo para repeated-switch/temporary-field/type-switch, o de la cadena en el árbol vivo para conditional-chain)." };
    // Ola Y (Y2) — ver el docstring del módulo, "TERCERA ANCLA": acá no hay
    // texto de discriminante que re-derivar, el detector-ancla YA verificó
    // por AST que esto es un campo propio (receptor explícito o
    // identificador declarado como miembro), evidencia más fuerte que las
    // cuatro formas de abajo.
    if (p.isTemporaryField) {
      return {
        holds: true,
        evidence: `"${p.fieldName}" es un campo propio ya verificado por AST por el detector-ancla (temporary-field): receptor explícito (this./self./@/receptor de Go) o identificador declarado como miembro del tipo — nunca un parámetro ni una variable local.`,
      };
    }
    // Ola AC (AC2) — misma clase de evidencia que la tercera ancla: el
    // detector `enumerated-field-dispatch` resuelve "campo propio" por AST,
    // con la regla de sombreado por parámetro aplicada, antes de emitir.
    if (p.isEnumeratedDispatch) {
      return {
        holds: true,
        evidence: `"${p.fieldName}" es un campo propio ya verificado por AST por el detector-ancla (enumerated-field-dispatch): receptor explícito (this./self./@/receptor de Go) o identificador declarado como miembro del tipo y no sombreado por un parámetro del método — nunca un parámetro ni una variable local.`,
      };
    }
    if (p.selfPrefixed) return { holds: true, evidence: `"${p.fieldName}" tiene forma de campo propio (self./this./@).` };
    if (p.implicitSelfMember) {
      return {
        holds: true,
        evidence: `"${p.fieldName}" no tiene prefijo, pero el grafo de referencias lo ve como una lectura sin receptor y sin sombra local en Ruby (despacho implícito a self, mismo criterio que graph/resolve.ts#classMemberStage) — campo/método propio, no un parámetro.`,
      };
    }
    if (p.declaredMemberSelf) {
      return {
        holds: true,
        evidence: `"${p.fieldName}" no tiene prefijo, pero está DECLARADO como miembro del tipo que contiene el switch/cadena (this implícito de C#/Java/Go — ningún parámetro ni variable local puede aparecer fuera de un cuerpo de función) — campo propio, no un parámetro.`,
      };
    }
    if (p.capturedViaOwnGetter) {
      return {
        holds: true,
        evidence: `"${p.fieldName}" es una variable LOCAL, pero se declara con "${p.fieldName} = [this.]getter()" y "getter" está DECLARADO como miembro real del tipo contenedor — una captura del estado propio (forma "State previous = state(); switch (previous)"), no un parámetro ni una variable arbitraria.`,
      };
    }
    if (p.receiverQualifiedSelf) {
      return {
        holds: true,
        evidence: `"${p.fieldName}" está calificado con el RECEPTOR DECLARADO de la función que contiene el switch/cadena (el nodo que la gramática expone en el campo "receiver", el mismo dato que proxy.ts/temporary-field.ts/lazy-init-repetida.ts ya leen en producción) y ningún parámetro de esa función lo sombrea — es el "this" de una gramática que NOMBRA su receptor en vez de reservarle una palabra: campo del propio objeto, no un parámetro cualquiera con un campo.`,
      };
    }
    if (p.receiverItself) {
      return {
        holds: true,
        evidence: `"${p.fieldName}" ES el RECEPTOR DECLARADO de la función que contiene el switch/cadena (el nodo que la gramática expone en el campo "receiver", el mismo dato que proxy.ts/temporary-field.ts/lazy-init-repetida.ts ya leen en producción), sin ningún punto y sin ningún parámetro de esa función que lo sombree: cuando la gramática declara el método sobre un VALOR, ese valor no es un campo DEL objeto — ES el objeto, así que la decisión se toma sobre el estado propio ENTERO. Es la respuesta más fuerte posible a la misma pregunta, no una más laxa.`,
      };
    }
    return {
      holds: false,
      evidence: `"${p.fieldName}" no tiene forma de campo propio por texto, evidencia de grafo de acceso implícito, declaración de miembro en el tipo contenedor, captura de un getter propio, calificación por el receptor declarado de la función encerrante, ni identidad con ese receptor — puede ser un parámetro/variable local (Strategy, no State).`,
    };
  },
};

const methodCountCheck: Check<StateProblem, CodeGraph | null> = {
  id: "repetido-en-2-o-mas-metodos",
  describe: `El discriminante se decide en ${STATE_MIN_METHODS}+ métodos distintos.`,
  run(p) {
    return {
      holds: p.distinctMethods >= STATE_MIN_METHODS,
      evidence: `${p.distinctMethods} método(s) distinto(s) involucrados (mínimo ${STATE_MIN_METHODS}).`,
    };
  },
};

/**
 * REQUERIDO NUEVO (Ola V, frente V4). INTENCIÓN QUE VERIFICA: la definición
 * de State (docstring del módulo, primer párrafo, y "SE CONFUNDE CON" más
 * abajo) exige un campo que el objeto MUTA CON EL TIEMPO — no un valor de
 * configuración fijo, elegido una sola vez, que es el discriminante de
 * Strategy. Cuando la ÚNICA evidencia de que el discriminante es "propio"
 * es el despacho implícito de Ruby (`implicitSelfMember`, sin @/self.), la
 * GRAMÁTICA de Ruby garantiza que lo que se está leyendo es un MÉTODO,
 * nunca directamente un ivar — el propio texto de `hasImplicitSelfReference`
 * ya lo admite ("campo/MÉTODO propio"). Un método puede envolver tanto un
 * `@ivar` mutable como un valor de sólo lectura calculado desde
 * configuración (`cop_config['EnforcedStyle']`, un mixin, una constante):
 * las dos lecturas son ESTRUCTURALMENTE INDISTINGUIBLES sin más evidencia.
 * La evidencia que sí existe y ya se calcula (`transitionConfirmed`, la
 * misma que usa `transitionCheck` como discriminador para el resto de los
 * casos) es la que decide acá — promovida a GATE, pero sólo en este camino.
 *
 * MEDIDO, no estimado (`scripts/v4-probe.mts`, los 13 repos del corpus): las
 * 9 hipótesis reales de State que existen HOY en el corpus son TODAS de
 * esta forma exacta, cero excepciones — un cop de RuboCop que declara
 * `include ConfigurableEnforcedStyle` y decide por `case style when
 * :leading / :trailing` (o `empty_else_style`), nunca reasignando ese
 * nombre en el archivo. Las 9/9 fallan exactamente en
 * `transitionConfirmed`. Caso verificado a mano:
 * `corpus/rubocop/lib/rubocop/cop/layout/dot_position.rb:56` — `style` se
 * lee de `ConfigurableEnforcedStyle` (mixin, línea 26), se decide por
 * `case style` en 3 lugares (líneas 56, 66, 121 aprox.) y NUNCA se
 * reasigna en el archivo. Es exactamente el discriminante de Strategy (una
 * elección de comportamiento fija desde configuración), no el de State —
 * coincide, además, con lo que V5 verificó de forma independiente sobre el
 * MISMO archivo para Strategy (`ola-v/informes/V5.md` #9: "la clasificación
 * del integrador es la equivocada acá: no es 'gramática externa', es 'dos
 * ramas no son una familia'" — un juicio distinto, mismo síntoma: `style`
 * no es un campo de State).
 *
 * NO se aplica al camino self./this./@ prefijado: ahí la SINTAXIS del
 * campo (una asignación de atributo real en el lenguaje) es evidencia
 * independiente de "campo propio", y la ausencia de una reasignación
 * VISIBLE EN ESTE ARCHIVO no descarta que transicione en otro lugar —razón
 * ya documentada en el módulo para `transitionCheck`, sin cambios—: sin
 * población medida que la contradiga esta ola, ese camino se deja EXACTO
 * como estaba (ningún caso real del corpus lo ejercita: "SILENCIO TOTAL"
 * sigue siendo la situación fuera de Ruby).
 *
 * EXTENDIDO (Ola W2): la MISMA ambigüedad aplica a `declaredMemberSelf`
 * (identificador desnudo declarado como miembro — `this` implícito de
 * C#/Java/Go, ver `declaresMemberNamed`): un campo declarado FUERA de un
 * constructor puede ser tanto un `_currentState` mutable como una PROPIEDAD
 * de sólo lectura calculada (un accessor fijo). Sin reasignación visible en
 * el archivo, las dos lecturas son estructuralmente indistinguibles — mismo
 * riesgo, mismo remedio: exigir `transitionConfirmed` cuando ésta es la
 * ÚNICA evidencia de campo propio. El caso canónico del patrón
 * (`newtonsoft-json/.../JsonReader.cs:118`, `internal State _currentState;`)
 * SÍ se reasigna en el archivo (búsquedas de `_currentState =` en
 * `JsonTextReader.cs`) — verificado no bloquea el caso que motiva este
 * arreglo.
 *
 * `capturedViaOwnGetter` (Ola X, B6) NO entra en `onlyWeakEvidence` — DECISIÓN
 * DECLARADA, no un olvido. `scanTransition(root, fieldName)` busca
 * `fieldName\s*=` en TODO el archivo; para esta forma `fieldName` es la
 * variable LOCAL, y su propia declaración ("`State previous = state();`") YA
 * matchea ese patrón — exigir `transitionConfirmed` acá sería exigir que el
 * check se confirme a sí mismo, cero filtro real. La evidencia que SÍ separa
 * esta forma de un accesor fijo es otra, más fuerte que la de los dos caminos
 * de arriba: no alcanza con que el nombre exista como miembro (eso también lo
 * cumple una propiedad de sólo lectura) — hace falta ADEMÁS que el
 * discriminante sea el RESULTADO DE LLAMAR a ese miembro (`getter()`, no una
 * referencia directa), la forma que un valor fijo de configuración casi nunca
 * toma (un `ConfigurableEnforcedStyle#style` se LEE, no se invoca como
 * función sin argumentos para volver a preguntarlo). Alcance: sólo cierra el
 * caso medido (`AbstractService.java`, 4 verdaderos); si una ola futura mide
 * falsos de esta forma, el remedio es acá, no en este gate.
 */
const implicitSelfNeedsTransitionEvidence: Check<StateProblem, CodeGraph | null> = {
  id: "despacho-implicito-exige-transicion",
  describe:
    "Cuando el discriminante sólo se reconoce como propio por despacho implícito de Ruby O por declaración de miembro this-implícito (sin @/self./this. explícito), tiene que mostrar una reasignación real del mismo nombre en el archivo — si no, es indistinguible de un accesor de configuración fijo (Strategy), no de un campo que el objeto muta con el tiempo (State).",
  run(p) {
    const onlyWeakEvidence = !p.selfPrefixed && (p.implicitSelfMember || p.declaredMemberSelf);
    if (!onlyWeakEvidence) {
      // Ola Y (Y2) — `isTemporaryField` nunca activa `implicitSelfMember`/
      // `declaredMemberSelf` (ver el docstring del módulo): cae acá, con
      // evidencia propia en vez del texto genérico de "forma de campo por
      // texto", que no describe cómo se verificó este ancla.
      return {
        holds: true,
        evidence:
          p.isTemporaryField || p.isEnumeratedDispatch
            ? `no aplica: el ancla ${p.isTemporaryField ? "temporary-field" : "enumerated-field-dispatch"} ya verificó el acceso a campo propio por AST — evidencia más fuerte que las dos vías débiles que este check vigila (despacho implícito de Ruby / declaración de miembro this-implícito).`
            : "no aplica: el discriminante tiene forma de campo por texto (@x/self.x/this.x), o no se reconoce como propio por ninguna vía débil (despacho implícito de Ruby / declaración de miembro this-implícito).",
      };
    }
    const via = p.implicitSelfMember ? "despacho implícito de Ruby" : "declaración de miembro this-implícito (C#/Java/Go)";
    if (p.transitionConfirmed) {
      return {
        holds: true,
        evidence: `"${p.fieldName}" se reasigna en el archivo — hay evidencia de transición real detrás de la evidencia débil (${via}), no sólo un accesor.`,
      };
    }
    return {
      holds: false,
      evidence: `"${p.fieldName}" sólo se reconoce como campo propio por ${via} (sin @/self./this. explícito) — sin ninguna reasignación de "${p.fieldName}" en el archivo es indistinguible de un accesor de configuración fijo (el discriminante de Strategy, no el de State).${p.implicitSelfMember ? " Medido: 9 de 9 hipótesis reales de esta forma en el corpus (p.ej. rubocop \"style\"/\"empty_else_style\" vía ConfigurableEnforcedStyle) son exactamente esto." : ""}`,
    };
  },
};

const transitionCheck: Check<StateProblem, CodeGraph | null> = {
  id: "transicion-confirmada",
  describe: "El campo discriminante se REASIGNA en algún lugar del archivo (evidencia de transición real, no sólo lectura defensiva).",
  run(p) {
    if (!p.hasLiveTree) return { holds: false, evidence: "árbol no disponible en esta corrida: no se pudo buscar una reasignación." };
    return {
      holds: p.transitionConfirmed,
      evidence: p.transitionConfirmed
        ? `se encontró una reasignación de "${p.fieldName}" en el archivo.`
        : `no se encontró ninguna reasignación de "${p.fieldName}" en el archivo — puede ser un valor de sólo lectura, no un estado que transiciona.`,
    };
  },
};

const branchesCheck: Check<StateProblem, CodeGraph | null> = {
  id: "tres-o-mas-ramas",
  describe:
    `Al menos una ocurrencia tiene ${STATE_MIN_BRANCHES}+ ramas (2 ramas suele ser una validación binaria, no una máquina de estados) — ` +
    `para temporary-field (Ola Y, Y2), el análogo es ${STATE_MIN_BRANCHES}+ miembros distintos participando del ciclo llenar/vaciar/leer.`,
  run(p) {
    if (!p.hasLiveTree) return { holds: false, evidence: "árbol no disponible en esta corrida: no se pudo contar ramas." };
    // Ola Y (Y2) — no hay switch que contar acá (ver el docstring del
    // módulo, "RAMAS"): el análogo de "2 ramas es un binario" es la riqueza
    // de participación, el mismo dato que `methodCountCheck` ya calculó.
    if (p.isTemporaryField) {
      return {
        holds: p.branchesConfirmed,
        evidence: p.branchesConfirmed
          ? `${p.distinctMethods} miembros distintos escriben o leen el campo temporal — participación suficiente para ser una máquina de estados real, no un toggle de dos puntas.`
          : `sólo ${p.distinctMethods} miembro(s) participan del ciclo llenar/vaciar — puede ser un toggle interno de uno o dos métodos, no una máquina de estados con ${STATE_MIN_BRANCHES}+ participantes.`,
      };
    }
    // Ola AC (AC2) — para `enumerated-field-dispatch` el análogo exacto de
    // "2 ramas es un binario" es el TAMAÑO DEL ALFABETO, que el ancla mide.
    if (p.isEnumeratedDispatch) {
      return {
        holds: p.branchesConfirmed,
        evidence: p.branchesConfirmed
          ? `el campo toma ${p.alphabetSize ?? "?"} valores constantes distintos — un alfabeto de ${STATE_MIN_BRANCHES}+ puntas, no una bandera encendida y apagada.`
          : `el campo toma sólo ${p.alphabetSize ?? "?"} valores constantes distintos — con 2 es una alternancia binaria (una bandera), que suele resolverse con una guarda y no con una jerarquía de estados.`,
      };
    }
    // Ola AI (AI4) — para `type-switch` el número de ramas lo mide el propio
    // detector y viaja en `trigger[0].value` ("ramas que deciden por tipo"): no
    // hay nada que aproximar caminando el árbol, y decirlo con la frase de
    // `repeated-switch` describiría mal cómo se obtuvo el dato.
    if (p.isTypeSwitch) {
      return {
        holds: p.branchesConfirmed,
        evidence: p.branchesConfirmed
          ? `el despacho por tipo tiene ${STATE_MIN_BRANCHES}+ ramas, contadas por el propio detector-ancla — un alfabeto de estados con más de dos puntas.`
          : `el despacho por tipo tiene menos de ${STATE_MIN_BRANCHES} ramas, contadas por el propio detector-ancla — con 2 es una alternancia binaria, que suele resolverse con una guarda y no con una jerarquía de estados.`,
      };
    }
    return {
      holds: p.branchesConfirmed,
      evidence: p.branchesConfirmed
        ? `al menos una ocurrencia confirma ${STATE_MIN_BRANCHES}+ ramas.`
        : `ninguna ocurrencia confirmó ${STATE_MIN_BRANCHES}+ ramas (aproximado por hijos nombrados del contenedor del switch).`,
    };
  },
};

/**
 * REQUERIDO NUEVO (Ola W2, sólo relevante para el ancla `conditional-chain`).
 * INTENCIÓN QUE VERIFICA: `conditional-chain.ts` reporta DOS formas
 * mutuamente excluyentes bajo el mismo `kind` — una escalera que decide QUÉ
 * TIPO instanciar en cada rama (`variant: "instantiates"`, el síntoma de
 * Factory Method) y una escalera genérica de condiciones. State es sobre un
 * CAMPO cuyo VALOR es un dato plano, nunca sobre elegir QUÉ CLASE construir
 * — mismo excluder de intención que `strategy.ts#notFactoryMethodCheck`
 * aplica para su propio ancla `conditional-chain`. `repeated-switch` no
 * expone esta forma (su `Finding` no distingue instanciación de cualquier
 * otro cuerpo de rama), así que ahí el check no tiene nada que excluir.
 */
const notTypeSelectionCheck: Check<StateProblem, CodeGraph | null> = {
  id: "no-selecciona-tipo-a-instanciar",
  describe:
    'El ancla conditional-chain no instancia un tipo distinto por rama (variant="instantiates" es Factory Method, ' +
    "no State) — repeated-switch y type-switch no exponen esta forma, ahí no aplica.",
  run(p) {
    if (!p.isTypeSelection) {
      return {
        holds: true,
        evidence:
          "no es una cadena que instancie un tipo distinto por rama (o el ancla es repeated-switch/temporary-field/" +
          "enumerated-field-dispatch/type-switch, que no exponen esta forma: `type-switch.ts` mide QUÉ decide la escalera, " +
          "no qué construye cada rama — brecha declarada, igual que en strategy.ts#notFactoryMethodCheck, y la frontera con " +
          "Factory Method queda en la pregunta a confirmar).",
      };
    }
    return {
      holds: false,
      evidence:
        'la cadena conditional-chain instancia un tipo distinto por rama (variant="instantiates"): eso es Factory ' +
        "Method (selección de QUÉ CLASE construir), no State (un campo cuyo valor es un dato plano) — mismo excluder " +
        "que strategy.ts#notFactoryMethodCheck aplica para su propio ancla conditional-chain.",
    };
  },
};

/**
 * *** OLA AK, FRENTE AK4 — REQUERIDO NUEVO, **SÓLO** PARA EL ANCLA
 * `temporary-field`. EL PRIMER DISCRIMINADOR DE ESTE MÓDULO QUE SE ATERRIZA
 * CON SU COSTO SOBRE LAS VERDADERAS MEDIDO **ANTES** DE ATERRIZARLO. ***
 *
 * INTENCIÓN QUE VERIFICA: *¿el ciclo LLENAR/VACIAR se reparte entre DOS o más
 * miembros del tipo?* State reemplaza una condición que está **repartida entre
 * los miembros del objeto** por un tipo — ésa es la fuerza que el patrón
 * resuelve ("conditionals in every method"). Si el ciclo entero —el llenado Y
 * el vaciado— nace y muere dentro de UN SOLO miembro, ningún otro miembro ve
 * al objeto pasar por dos momentos: el campo es una **variable de trabajo de
 * UNA operación** que vive en el objeto, y el remedio es el que el propio
 * detector-ancla pone PRIMERO (`advice.primary` = *Extract Class*), nunca
 * State.
 *
 * QUÉ **NO** RECONOCE (la mitad que el precedente de `builder.ts` exige
 * nombrar): un campo cuyo llenado y vaciado están en miembros DISTINTOS. Ahí
 * el objeto sí atraviesa dos momentos observables desde fuera del miembro que
 * los produce, y esta hipótesis sigue emitiendo exactamente igual que antes.
 *
 * ESCALA — **NINGÚN NÚMERO NUEVO**: reusa `STATE_MIN_METHODS` (= 2), el mismo
 * piso que `methodCountCheck` aplica desde F6. Lo que cambia es SOBRE QUÉ se
 * cuenta: `methodCountCheck` suma escritores + lectores (`distinctMethods`),
 * así que un único miembro que llena y vacía, más un lector cualquiera, ya
 * pasaba. Este check cuenta los miembros del CICLO —que es donde
 * `temporary-field` mide la forma— y es la traducción literal, para esta
 * ancla, del "decidido en 2+ miembros" que las otras tres anclas exigen sobre
 * el discriminante.
 *
 * POR QUÉ SE CUENTA DOS VECES Y SE TOMA EL MÁXIMO — y las dos razones se
 * MIDIERON escribiendo esto, no se supusieron:
 *
 *   1. **POR NOMBRE** (`location.symbol`) COLAPSA UN IDIOM ENTERO. En TS/JS un
 *      miembro escrito como PROPIEDAD DE CLASE con función flecha
 *      (`handleMove = (e) => {…}`) no tiene campo `name`, así que el ancla lo
 *      nombra `"(anónima)"`: medido en `excalidraw
 *      packages/excalidraw/components/App.tsx` — `App.hitLinkElement` escribe
 *      en **CINCO miembros distintos** y los cinco salen `"(anónima)"`, o sea
 *      UNO. Contar sólo por nombre haría este check **imposible de satisfacer
 *      por construcción** para todo ese idiom, que es exactamente el defecto
 *      que esta ola vino a buscar, cometido de nuevo.
 *   2. **POR POSICIÓN** (la función más angosta que contiene el sitio) COLAPSA
 *      LA FORMA OPUESTA. El ancla recorre los cuerpos anidados, así que una
 *      escritura dentro de una lambda dentro de un método se registra DOS
 *      veces —una por cada cuerpo— y la lectura por posición devuelve la
 *      lambda para las dos: medido en `ShareX ShareX/ScreenRecordManager.cs`
 *      — `screenRecorder` tiene 4 sitios, 2 nombres distintos y UNA sola
 *      función por posición.
 *
 * De las dos lecturas, cada una es una COTA INFERIOR del número real de
 * miembros y cada una falla por un artefacto de gramática distinto, así que se
 * silencia sólo cuando **LAS DOS** coinciden en que hay un solo miembro. Es la
 * misma disciplina que el resto del módulo aplica ("nunca se afirma sin
 * evidencia positiva"): sin árbol vivo la lectura por posición no existe y el
 * check **se sostiene**, nunca silencia a ciegas.
 *
 * EL DATO QUE LA DECIDE, VERIFICADO ANTES DE ESCRIBIR UNA LÍNEA:
 * `problem.locations[].symbol` + `ctx.file.functions`.
 * `temporary-field.ts#computeTemporaryFieldFindings` emite UNA `location` por
 * sitio de vaciado y por sitio de llenado, con `symbol` = el miembro que lo
 * escribe, y NINGUNA por lectura; y `ctx.file` llega vivo en las dos pasadas
 * que llaman a `build` (verificado por AJ5 para la QUINTA forma, mismo
 * cableado de `hypotheses/run.ts`, y usado ya en esta misma rama por
 * `scanTypedField`).
 *
 * COSTO MEDIDO SOBRE EL BANCO ENTERO DE VEREDICTOS (los 93 archivos de
 * veredictos de todas las olas; 214 juicios de esta celda: 18 `verdadero`,
 * 188 `falso`, 8 `problema-si-patron-no`) — ver `ola-ak/informes/AK4.md`:
 * **silencia 23 falsas conocidas (12 en bibliotecas + 11 en aplicaciones, en 9
 * repos distintos) y CERO verdaderas conocidas: 0 de 18.** Las 18 verdaderas
 * tienen 2, 3, 4, 5 y 6 miembros en su ciclo; ninguna tiene uno solo.
 *
 * LÍMITE DECLARADO, NO ESCONDIDO: con n = 18 verdaderas, "costo cero" tiene un
 * techo de intervalo de Wilson del 17,6 % — la medición dice que este check no
 * tocó NINGUNA de las verdaderas que el proyecto conoce, no que sea imposible
 * que toque una que nadie juzgó todavía. Y dos miembros HOMÓNIMOS
 * (sobrecargas de Java/C#) cuentan como uno por nombre; la lectura por
 * posición los separa, y el máximo se queda con la mayor: conservador (deja
 * pasar), nunca al revés.
 */

/**
 * Cuántos MIEMBROS distintos contienen `locations`, contados POR POSICIÓN: la
 * función más angosta de `file.functions` que contiene cada sitio. `null` si
 * algún sitio no cae dentro de ninguna función del archivo — ahí no hay
 * evidencia y el llamador no debe afirmar nada. Es identidad estructural pura
 * (la línea de inicio de la función), sin leer un solo nombre.
 */
function cycleMembersByPosition(file: FileUnit, locations: readonly RoleLocation[]): number | null {
  const ids = new Set<number>();
  for (const loc of locations) {
    let narrowest: FunctionUnit | null = null;
    for (const fn of file.functions) {
      if (fn.startLine > loc.startLine || fn.endLine < loc.endLine) continue;
      if (!narrowest || fn.endLine - fn.startLine < narrowest.endLine - narrowest.startLine) narrowest = fn;
    }
    if (!narrowest) return null;
    ids.add(narrowest.startLine);
  }
  return ids.size;
}

const cycleSpreadCheck: Check<StateProblem, CodeGraph | null> = {
  id: "ciclo-en-2-o-mas-miembros",
  describe:
    `(temporary-field) El ciclo llenar/vaciar del campo se reparte entre ${STATE_MIN_METHODS}+ miembros distintos ` +
    "— las otras tres anclas no miden un ciclo, ahí no aplica.",
  run(p) {
    if (!p.isTemporaryField) {
      return {
        holds: true,
        evidence:
          "el ancla no es temporary-field (repeated-switch/conditional-chain/type-switch/enumerated-field-dispatch miden un " +
          "DISCRIMINANTE, no un ciclo llenar/vaciar): este check no tiene nada que contar acá.",
      };
    }
    const members = p.cycleMembers;
    if (members === null || members === undefined) {
      // EXCEPCIÓN DOCUMENTADA a `no-permissive-required.test.ts`, del cuarto
      // tipo que ese archivo protege ("medido contra el corpus, con el número
      // escrito"): este check REFUTA, nunca AFIRMA, y su regla de refutación
      // es "las DOS lecturas ven un solo miembro". Con una sola lectura la
      // regla no se cumple y por lo tanto no refuta — no es una aprobación por
      // no haber podido mirar, es la regla aplicada tal cual está escrita. Y
      // está medido lo que pasaría al revés: refutar con la lectura de NOMBRES
      // sola cuesta 1 verdadera de 18 (`excalidraw App.hitLinkElement`,
      // `ola-ak/informes/AK4.md` §4.1/§4.3), que es exactamente lo que el
      // criterio de este frente prohíbe.
      return {
        holds: true,
        evidence:
          "este check refuta sólo cuando LAS DOS lecturas —por nombre de miembro y por posición en el árbol— coinciden en " +
          "que el ciclo cabe en un solo miembro; acá hay una sola lectura disponible, así que la regla de refutación no se " +
          "cumple y la hipótesis sigue viva.",
      };
    }
    if (members >= STATE_MIN_METHODS) {
      return {
        holds: true,
        evidence:
          `el ciclo llenar/vaciar se reparte entre ${members} miembro(s) distinto(s) (mínimo ${STATE_MIN_METHODS}): el ` +
          "objeto atraviesa dos momentos que otros miembros ven, que es la fuerza que State resuelve.",
      };
    }
    return {
      holds: false,
      evidence:
        `el ciclo llenar/vaciar entero cabe en ${members} miembro(s) (mínimo ${STATE_MIN_METHODS}, contando por nombre Y por ` +
        "posición y quedándose con el mayor): el campo se llena y se vacía dentro de una sola operación, así que es una " +
        "VARIABLE DE TRABAJO que vive en el objeto — el remedio es el que el propio detector-ancla pone primero (Extract " +
        "Class), no una jerarquía de estados.",
    };
  },
};

/**
 * ═══════════════════════════════════════════════════════════════════════
 * Ola AL (AL2) — `unitSlackCheck`, SEXTO `required`: **¿le queda algo a la
 * unidad DESPUÉS de que State se lleve el campo?**
 * ═══════════════════════════════════════════════════════════════════════
 *
 * FUERZA — no un síntoma. State no "marca" un campo: MUDA la condición del
 * objeto a una jerarquía de tipos y deja en la unidad original los miembros
 * que NO dependen de ese campo. Si a la unidad no le quedan miembros afuera
 * del campo —si el campo lo escriben o lo leen prácticamente todos sus
 * miembros—, la jerarquía no descarga a nadie: se llevaría la unidad entera
 * y dejaría una cáscara. Eso no es State; es exactamente el `Extract Class`
 * que el propio detector-ancla pone PRIMERO en su `advice.primary`.
 *
 * ESCALA — **NINGÚN NÚMERO NUEVO**: reusa `STATE_MIN_METHODS` (= 2), el mismo
 * piso que `methodCountCheck` aplica desde F6, del OTRO lado de la cuenta.
 * `methodCountCheck` exige `distinctMethods >= 2` miembros ADENTRO del campo;
 * este check exige `miembros de la unidad − distinctMethods >= 2` miembros
 * AFUERA. Es la misma pregunta de reparto, aplicada al resto de la unidad.
 *
 * RESOLUCIÓN VERIFICADA — `appliedState` no se toca y el ancla sigue
 * emitiendo exactamente igual: esto no cambia dónde se detecta el olor, sólo
 * si State es la respuesta.
 *
 * EL DATO QUE LA DECIDE, VERIFICADO ANTES DE ESCRIBIR UNA LÍNEA:
 * `ctx.file` (árbol vivo, ya usado por `cycleMembersByPosition` y
 * `scanTypedField` en esta misma rama) + `distinctMethods`, que
 * `buildTemporaryFieldProblem` YA calcula. No hace falta ningún hecho de
 * grafo, que para esta ancla intra-file es `null` en la pasada que publica.
 *
 * COSTO MEDIDO SOBRE EL BANCO ENTERO (los 99 archivos de veredictos de todas
 * las olas; **252 juicios** de esta celda —19 `verdadero`, 221 `falso`,
 * 12 `problema-si-patrón-no`—, resueltos contra el volcado de cierre de la
 * Ola AK, 0 huérfanos) — ver `ola-al/informes/AL2.md`:
 * **silencia 31 falsas conocidas (25 en bibliotecas + 6 en aplicaciones, en 9
 * repos y 6 gramáticas: java 16, go 6, cs 4, py 2, rb 2, js 1) y CERO
 * verdaderas conocidas: 0 de 19.**
 *
 * DÓNDE ESTÁ EL BORDE, DECLARADO Y NO ESCONDIDO: la verdadera más cercana al
 * corte es `guava MultiInputStream.in`, con **exactamente 2** miembros
 * afuera — el piso justo. Subir el piso a 3 costaría esa verdadera (medido:
 * `afuera < 3` ⇒ 1 de 19). Y con n = 19, "costo cero" tiene un techo de
 * intervalo de Wilson del 17,6 %: la medición dice que este check no tocó
 * NINGUNA de las verdaderas que el proyecto conoce, no que sea imposible que
 * toque una que nadie juzgó.
 *
 * LAS NUEVE GRAMÁTICAS PUEDEN SATISFACERLO, y está verificado sobre el
 * corpus, no supuesto: de las 31 falsas que apaga, **6 son de Go** (hugo 3 +
 * gitea 3), donde la unidad no es un nodo class-like sino el RECEPTOR de sus
 * funciones — la vía (b) de `unitMemberCount`. Sin esa vía este check habría
 * sido justo la clase de compuerta que una gramática entera no puede pasar
 * (el defecto ④ que el integrador de la Ola AK dejó escrito, y por el que
 * AK6 descartó su D1 aunque costara cero).
 */
const unitSlackCheck: Check<StateProblem, CodeGraph | null> = {
  id: "unidad-con-miembros-afuera",
  describe:
    `(temporary-field) A la unidad le quedan ${STATE_MIN_METHODS}+ miembros que NO tocan el campo ` +
    "— las otras tres anclas no miden un campo con dueño único, ahí no aplica.",
  run(p) {
    if (!p.isTemporaryField) {
      return {
        holds: true,
        evidence:
          "el ancla no es temporary-field (repeated-switch/conditional-chain/type-switch/enumerated-field-dispatch miden un " +
          "DISCRIMINANTE repartido, no el reparto de UNA unidad alrededor de un campo): este check no tiene nada que contar acá.",
      };
    }
    const outside = p.membersOutsideField;
    if (outside === null || outside === undefined) {
      // Este check REFUTA, nunca AFIRMA: su regla de refutación es "la unidad
      // se pudo contar Y le quedan menos de STATE_MIN_METHODS miembros
      // afuera". Sin unidad contada la regla no se cumple, así que no refuta
      // — no es una aprobación por no haber podido mirar, es la regla
      // aplicada tal cual está escrita (misma excepción documentada, del
      // cuarto tipo, que `cycleSpreadCheck` ya lleva arriba).
      return {
        holds: true,
        evidence:
          "la regla de refutación de este check exige un conteo POSITIVO de la unidad —un nodo de unidad con miembros, o " +
          "funciones que la nombren como receptor— y acá no hay ninguno de los dos: la regla no se cumple, así que este " +
          "check no refuta y la hipótesis sigue viva.",
      };
    }
    if (outside >= STATE_MIN_METHODS) {
      return {
        holds: true,
        evidence:
          `a la unidad le quedan ${outside} miembro(s) que no tocan el campo (mínimo ${STATE_MIN_METHODS}): mudar la ` +
          "condición a una jerarquía de estados descarga a esos miembros y deja una unidad que sigue teniendo trabajo propio.",
      };
    }
    return {
      holds: false,
      evidence:
        `a la unidad le quedan ${outside} miembro(s) afuera del campo (mínimo ${STATE_MIN_METHODS}): el campo lo escriben o lo ` +
        "leen casi todos los miembros, así que una jerarquía de estados se llevaría la unidad entera y dejaría una cáscara — " +
        "el remedio es el que el propio detector-ancla pone primero (Extract Class), no una jerarquía de estados.",
    };
  },
};

/**
 * BUG DE ESTA OLA, VERIFICADO (newtonsoft-json `JsonReader.cs:46,118` — `enum
 * State { ... }` + `internal State _currentState;`, testeado por switch en 10
 * sitios de `JsonTextReader.cs`/`JsonTextReader.Async.cs`): "el campo tiene un
 * tipo con NOMBRE PROPIO" (`typedNonPrimitive === true`, más abajo) NO es lo
 * mismo que "el campo ya tiene la abstracción POLIMÓRFICA que State propone".
 * Un `enum` es, sintácticamente, un tipo con nombre — `code-grammar.ts#isClassLike`
 * lo clasifica `family: "class-like"` (mismo criterio estructural que una
 * clase real: tiene `body`+`name`, no tiene `parameters`) — pero es EXACTAMENTE
 * el dato plano sin comportamiento que el patrón reemplaza, no una
 * abstracción que ya lo resuelve. INTENCIÓN QUE VERIFICA ESTA FUNCIÓN: ¿el
 * tipo nombrado del discriminante es una abstracción polimórfica REAL —algo
 * que ≥2 tipos EXTIENDEN/IMPLEMENTAN, la forma que el patrón State pide— o
 * sólo un dato con nombre propio (un enum, o cualquier tipo sin subtipos)?
 * Reutiliza el mismo criterio de resolución nombre→nodo que
 * `singleton.ts#findTypeNode` (duplicado localmente a propósito, mismo
 * precedente que `PRIMITIVE_TYPE_WORD`/`SWITCH_WORD` arriba: cada hipótesis
 * arma su propio resolutor pequeño, sin depender del interior no-exportado
 * de otra), MÁS la evidencia nueva que el caso medido exige: contar aristas
 * `extends`/`implements` ENTRANTES — nada extiende ni implementa un enum, así
 * que ese conteo por sí solo ya distingue el caso sin necesitar un
 * `SymbolFamily` dedicado a "enum" (que la gramática de este proyecto no
 * tiene, `graph/symbols.ts` no lo menciona). `null` (sin grafo, sin nombre de
 * tipo, tipo no resuelto en el MISMO archivo, o resuelto sin subtipos reales)
 * significa "sin evidencia de abstracción real" — nunca se afirma
 * `aplicado-eludido` por tipo sin esa evidencia positiva, ni siquiera cuando
 * el grafo simplemente no está disponible (el caso REAL de producción hoy
 * para esta ancla intra-file, ver el docstring del módulo).
 */
function resolveRealAbstraction(graph: CodeGraph | null, file: string | null, typeName: string | null): CodeGraphNode | null {
  if (!graph || !file || !typeName) return null;
  let typeNode: CodeGraphNode | null = null;
  for (const node of graph.nodes) {
    if (node.kind !== "symbol" || node.file !== file) continue;
    if (node.family !== "class-like" && node.family !== "namespace-like") continue;
    if (node.symbolPath[node.symbolPath.length - 1] === typeName) {
      typeNode = node;
      break;
    }
  }
  if (!typeNode) return null;
  const subtypeOwners = new Set<string>();
  for (const e of confidentEdges(graph)) {
    if ((e.kind === "extends" || e.kind === "implements") && e.to === typeNode.id) subtypeOwners.add(e.from);
  }
  return subtypeOwners.size >= 2 ? typeNode : null;
}

/**
 * EXCLUDER VIEJO — INTACTO EN SU DISEÑO, CORREGIDO EN SU EVIDENCIA (Ola 10:
 * "SUMAR, NO REEMPLAZAR", mismo criterio que `builder.ts` documenta para su
 * propio excluder heredado). Mira el TIPO declarado del campo discriminante
 * (¿primitivo o propio?) — evidencia real pero débil: un campo `status:
 * OrderStatus` puede ser un enum tonto, no necesariamente un protocolo
 * polimórfico. ESTA OLA cierra exactamente ese hueco (ver
 * `resolveRealAbstraction` arriba) en vez de tratarlo como declarado-pero-sin-
 * arreglar. El excluder ESTRUCTURAL nuevo (`evaluateStateStructure`, más
 * abajo) tiene prioridad; este queda como respaldo para cuando no hay grafo
 * (el caso real de producción hoy) o el grafo no muestra ninguna máquina de
 * estados alrededor del contexto.
 */
function legacyTypedFieldState(p: StateProblem, graph: CodeGraph | null): AppliedStateResult {
  if (!p.hasLiveTree) {
    return {
      state: "ausente",
      checks: [
        {
          label: "estado-ya-modelado-con-tipo",
          passed: false,
          why: "árbol no disponible en esta corrida: no se pudo verificar si el discriminante ya es un tipo propio (protocolo) en vez de un primitivo — se asume ausente por falta de evidencia, nunca se declara ya-aplicado/aplicado-eludido sin evidencia positiva.",
        },
      ],
    };
  }
  if (!p.hasTypesCapability) {
    return {
      state: "ausente",
      checks: [
        {
          label: "estado-ya-modelado-con-tipo",
          passed: false,
          why: 'el lenguaje no declara tipos explícitos (capacidad "tipos-explicitos" ausente): no hay forma de inspeccionar el tipo del campo discriminante, se asume ausente.',
        },
      ],
    };
  }
  if (p.typedNonPrimitive === true) {
    const file = p.locations[0]?.file ?? null;
    const abstraction = resolveRealAbstraction(graph, file, p.typedFieldTypeName);
    if (abstraction) {
      return {
        state: "aplicado-eludido",
        checks: [
          {
            label: "estado-ya-modelado-con-tipo",
            passed: true,
            why: `"${p.fieldName}" está declarado con "${p.typedFieldTypeName}", que el grafo confirma como una abstracción con ≥2 subtipos reales (extends/implements) en este archivo: la abstracción de estado ya existe, pero igual se decide por switch en ${p.distinctMethods} métodos — es una fuga (aplicado-eludido), no una ausencia. "ya-aplicado" limpio es inalcanzable para esta hipótesis: sin un switch que la puentee no habría Finding ancla.`,
          },
        ],
      };
    }
    return {
      state: "ausente",
      checks: [
        {
          label: "estado-ya-modelado-con-tipo",
          passed: false,
          why: graph
            ? `"${p.fieldName}" está declarado con un tipo con nombre propio ("${p.typedFieldTypeName ?? "?"}"), pero el grafo no lo resuelve, en este archivo, a una abstracción con ≥2 subtipos reales (extends/implements) — puede ser un enum (dato plano, exactamente lo que State reemplaza, no lo que ya lo resuelve) u otro tipo sin jerarquía: "tipo no primitivo" por sí solo no es evidencia de que el patrón ya esté aplicado.`
            : `"${p.fieldName}" está declarado con un tipo con nombre propio ("${p.typedFieldTypeName ?? "?"}"), pero sin grafo en esta corrida no hay forma de distinguir un enum (dato plano) de una abstracción polimórfica real con subtipos — "tipo no primitivo" por sí solo NO es evidencia de que el patrón ya esté aplicado (bug corregido esta ola: antes se afirmaba aplicado-eludido sin esta evidencia — ver JsonReader._currentState en el docstring del módulo).`,
        },
      ],
    };
  }
  return {
    state: "ausente",
    checks: [
      {
        label: "estado-ya-modelado-con-tipo",
        passed: false,
        why:
          p.typedNonPrimitive === false
            ? `"${p.fieldName}" está declarado con un tipo primitivo dedicado de la gramática — el olor "estado como string/int crudo" queda confirmado, no sólo sospechado.`
            : `no se encontró, en este archivo, una declaración de "${p.fieldName}" con tipo explícito.`,
      },
    ],
  };
}

/* ═══════════════════════════════════════════════════════════════════════
 * EXCLUDER ESTRUCTURAL NUEVO — Ola 10, CONTRATO-F10.md §0.4/§2/§3.
 *
 * Reemplaza la mirada de VOCABULARIO/AST-por-texto (`legacyTypedFieldState`
 * de arriba: "¿el campo tiene un tipo con nombre no-primitivo?") por una
 * mirada de ESTRUCTURA DE GRAFO: ¿existe, alrededor del contexto `C` que
 * ancla este `Finding`, una MÁQUINA DE ESTADOS real — un sitio de
 * construcción inicial, un grupo de tipos que se instancian/llaman entre sí
 * (la transición estado→estado) y comparten un miembro por (name, arity)?
 *
 * ADAPTADO respecto de la redacción literal del encargo, en TRES puntos —
 * cada uno MEDIDO contra el grafo real de
 * `scratchpad/smells/fixtures-multi/state/*` (los 6 lenguajes, vía
 * `scripts/debug-composite-graph.mts` apuntado a cada fixture — no
 * adivinado, ver el resultado final de esta tarea para el detalle):
 *
 *  1. "cuyos implementadores comparten >=2 miembros" → acá basta CON UNO.
 *     La fixture canónica (TrafficLight/RedState/GreenState/YellowState)
 *     comparte exactamente un miembro ("next"/"handle") — el State de la
 *     Banda de los Cuatro típicamente es una interfaz de un solo método.
 *     Exigir 2 dejaría la fixture canónica misma afuera. Mismo criterio que
 *     la TERNA DE ENVOLTURA ya implementada (`wrapping-chain.ts`: "∃ m", no
 *     "≥2 m").
 *  2. "reasignado desde ≥2 miembros de C, cada uno con `instantiates` hacia
 *     un implementador DISTINTO" → medido: la fixture sólo construye el
 *     estado INICIAL desde UN sitio de `C` (el constructor — o, en
 *     TypeScript/Vue sin constructor explícito, el inicializador de campo,
 *     que el grafo atribuye al NODO ARCHIVO, no a `C` ni a ninguno de sus
 *     miembros: `instantiates file:… -> RedState`, nunca `TrafficLight.<algo>
 *     -> RedState`). Las transiciones RESTANTES pasan DENTRO de los propios
 *     estados (`RedState.next --instantiates--> GreenState`), nunca vía un
 *     segundo miembro de `C`. Por eso acá se acepta UN sitio de
 *     construcción alcanzable desde `C` (miembro propio o, a falta de eso,
 *     el archivo — misma imprecisión "de archivo entero" que
 *     `strategy.ts#hasDispatchTable` ya declara) y se EXIGE, en cambio, que
 *     la transición ENTRE los estados descubiertos exista de verdad — es lo
 *     que el encargo llama "el discriminador que separa State de Strategy";
 *     acá se usa como evidencia REQUERIDA de la forma (no sólo como
 *     discriminador de la escalera), porque es la única evidencia de
 *     "protocolo compartido, EJERCITADO" que el grafo de HOY deja ver.
 *  3. "los miembros de C reenvían con `calls` hacia `sym:I.m`" → NUNCA
 *     observado: en los 6 lenguajes de la fixture canónica,
 *     `this.state.next()`/`self.state.next` con receptor de tipo NO
 *     RASTREADO (CONTRATO-F10.md §0.4, "el hecho que falta") no produce
 *     NINGUNA arista `calls` desde el miembro de `C` — cero, en los 6
 *     archivos, confirmado por instrumentación directa. Mismo diagnóstico,
 *     mismo origen, que `wrapping-chain.ts` ya declaró "correcto pero
 *     inerte" para el mismo motivo (`classifyRole` calcula el rol pero
 *     ninguna arista real lo trae puesto cuando el receptor no tiene tipo
 *     rastreado). Se DECLARA, no se exige: si `graph/resolve.ts` algún día
 *     resuelve esto, esta hipótesis no necesita cambiar para beneficiarse —
 *     la evidencia ya disponible sin ese requisito alcanza para decidir
 *     `aplicado-eludido`/`parcial`.
 *
 * QUÉ DECIDE (dado un contexto `C` resuelto desde `problem.locations`):
 *   - Máquina encontrada CON interfaz nominal común (`implements`/
 *     `satisfies` de ≥2 miembros de la familia hacia el MISMO nodo) ⇒ forma
 *     COMPLETA. Como esta hipótesis SIEMPRE cuelga de un `repeated-switch`
 *     real (evidencia de que alguien decide por switch en vez de delegar),
 *     COMPLETA nunca es "ya-aplicado" limpio ACÁ — es "aplicado-eludido"
 *     (mismo corolario que la redacción vieja del excluder ya probaba,
 *     ahora con evidencia de GRAFO en vez de sólo de tipo declarado). Este
 *     es el reemplazo REAL de `legacyTypedFieldState`, no un estado nuevo
 *     inventado — "ya-aplicado" sigue siendo, para ESTA hipótesis anclada
 *     en bypass, estructuralmente inalcanzable por la misma razón que el
 *     texto original documentaba (sin bypass no habría `Finding` ancla);
 *     ver el resultado final de esta tarea para la verificación directa
 *     (`hypothesis.build` con grafo real, fuera del cableado de
 *     producción) de que la forma SÍ se reconoce, y para la corrección
 *     explícita de la premisa del encargo en ese punto.
 *   - Máquina encontrada SIN interfaz nominal (sólo firma compartida por
 *     duck typing — Ruby/Python, que no declaran protocolo estático) ⇒
 *     forma PARCIAL EXACTA del encargo ("≥2 tipos con los MISMOS miembros
 *     por (name, arity)... sin protocolo compartido"). Sugiere formalizar
 *     (introducir el módulo/protocolo explícito) — a diferencia de COMPLETA,
 *     esto SÍ es una sugerencia (requisito 1 del encargo).
 *   - Sin máquina (Go: los `struct` salen `family: "other"`, no
 *     `class-like`/`namespace-like` — `graph/symbols.ts`, archivo
 *     compartido, fuera de mi alcance —, y la fixture canónica de Go
 *     además no conecta `TrafficLight` con ningún estado por NINGUNA
 *     arista; o cualquier repo real sin la forma) ⇒ cae a
 *     `legacyTypedFieldState`, con esta señal estructural agregada como
 *     evidencia auditable adicional en `checks`, nunca reemplazando la del
 *     excluder viejo cuando este no encuentra nada.
 *
 * ESTE PÁRRAFO ESTABA VENCIDO (corregido Ola Y, Y2, leyendo el árbol de hoy
 * en vez de creerle a la cita): decía que el parámetro `graph` de `build()`
 * es SIEMPRE `null` en producción para esta hipótesis, citando la llamada
 * (1) de `hypotheses/run.ts#attachHypotheses` — cierto para ESA llamada,
 * pero no es la ÚLTIMA: desde la Ola V (frente V1), `hypotheses/
 * run.ts#rebuildHypothesesWithGraph` vuelve a llamar `builder.build` para
 * TODO `Finding` con ancla intra-* después de que `crossAnalyze` arma el
 * grafo del repo, y **reemplaza entero** el resultado de la llamada (1)
 * (`finding.hypotheses = built...`) — no lo completa, lo pisa. `graph` SÍ es
 * real ahí, y es el que termina publicado. `COBERTURA-NIVEL-2.md §5` ya lo
 * había verificado ("el grafo llega vivo en el 100 % de las evaluaciones,
 * traza de W1") — este módulo simplemente no había actualizado su propia
 * cita. CONSECUENCIA MEDIDA (Ola Y, Y2, corpus real, no fixture): el
 * excluder estructural de acá abajo (`evaluateStateStructure`) SÍ decide en
 * producción, y con un bug propio, encontrado sobre
 * `guava/src/com/google/common/collect/HashBiMap.java` (campos
 * `firstInKeyInsertionOrder`/`lastInKeyInsertionOrder`, ancla
 * `temporary-field`): `discoverStateFamily` cae al respaldo de archivo
 * entero (punto 2 del docstring de arriba) porque ningún miembro directo de
 * `HashBiMap` CONSTRUYE un `Node` — son punteros de una lista enlazada, no
 * un sitio de construcción —, y en un archivo de 1500+ líneas con varias
 * clases anidadas ese respaldo trae ~50 tipos SIN relación (`Maps.*`,
 * `ForwardingSet`, `Range`, …) de los que dos casualmente implementan
 * `BiMap` en común, lo que basta para que el check confirme "completa" y la
 * hipótesis salga `aplicado-eludido` — una máquina de estados que no existe.
 * NO ARREGLADO ACÁ (ver el informe `ola-y/informes/Y2.md`): el respaldo de
 * archivo entero es una decisión de diseño de Ola 10, compartida por las TRES
 * anclas de este módulo, y estrecharla exige re-medir `repeated-switch` y
 * `conditional-chain` además de `temporary-field` — fuera del tiempo de esta
 * ola. `aplicado-eludido` no es una recomendación (no entra en la cobertura
 * útil), así que el bug no mueve esa métrica, pero SÍ es información
 * mostrada como cierta cuando no lo es.
 */
interface StateGraphIndex {
  readonly nodeById: ReadonlyMap<string, CodeGraphNode>;
  readonly edgesFrom: ReadonlyMap<string, readonly CodeGraphEdge[]>;
}

/** Cacheado por identidad de `CodeGraph` — mismo idiom que `builder.ts#GRAPH_INDEX_CACHE`. */
const STATE_GRAPH_INDEX_CACHE = new WeakMap<CodeGraph, StateGraphIndex>();

function buildStateGraphIndex(graph: CodeGraph): StateGraphIndex {
  const cached = STATE_GRAPH_INDEX_CACHE.get(graph);
  if (cached) return cached;
  const nodeById = new Map<string, CodeGraphNode>();
  for (const n of graph.nodes) if (!nodeById.has(n.id)) nodeById.set(n.id, n);
  const edgesFrom = new Map<string, CodeGraphEdge[]>();
  for (const e of confidentEdges(graph)) {
    const list = edgesFrom.get(e.from);
    if (list) list.push(e);
    else edgesFrom.set(e.from, [e]);
  }
  const index: StateGraphIndex = { nodeById, edgesFrom };
  STATE_GRAPH_INDEX_CACHE.set(graph, index);
  return index;
}

/** `GraphIndex` mínimo que `memberSignatures` necesita, sobre el índice local de arriba. */
function asMemberIndex(index: StateGraphIndex): { nodeById: (id: string) => CodeGraphNode | null; edgesFrom: (id: string) => readonly CodeGraphEdge[] } {
  return {
    nodeById: (id) => index.nodeById.get(id) ?? null,
    edgesFrom: (id) => index.edgesFrom.get(id) ?? [],
  };
}

function isOwnerLike(node: CodeGraphNode | undefined): node is CodeGraphNode {
  return node !== undefined && node.kind === "symbol" && (node.family === "class-like" || node.family === "namespace-like");
}

/** Miembros function-like DIRECTOS de `ownerId`, vía `contains` — mismo recorrido que `builder.ts#directMembersOf`/`memberSignatures`, reescrito localmente: cada hipótesis mantiene su propio índice pequeño en vez de compartir uno (ninguna de las dos migraciones depende de la otra). */
function directMembers(index: StateGraphIndex, ownerId: string): readonly CodeGraphNode[] {
  const out: CodeGraphNode[] = [];
  for (const e of index.edgesFrom.get(ownerId) ?? []) {
    if (e.kind !== "contains") continue;
    const target = index.nodeById.get(e.to);
    if (target?.kind === "symbol" && target.family === "function-like") out.push(target);
  }
  return out;
}

/** El nodo `class-like`/`namespace-like` que CONTIENE a `memberId` — recorre todos los owners porque `StateGraphIndex` sólo indexa `edgesFrom` (un único llamador, no vale la pena el índice inverso). */
function ownerOfMember(index: StateGraphIndex, memberId: string): CodeGraphNode | null {
  for (const owner of index.nodeById.values()) {
    if (!isOwnerLike(owner)) continue;
    for (const e of index.edgesFrom.get(owner.id) ?? []) {
      if (e.kind === "contains" && e.to === memberId) return owner;
    }
  }
  return null;
}

/** Contexto `C` — el owner que contiene el/los método(s) señalados por el `Finding` ancla, resuelto por NOMBRE de símbolo (`RoleLocation.symbol`, lo único que `repeated-switch` expone) + archivo. `null` si ningún lugar resuelve — declarado, nunca adivinado. */
function resolveStateContext(index: StateGraphIndex, locations: readonly RoleLocation[]): CodeGraphNode | null {
  for (const loc of locations) {
    if (!loc.symbol) continue;
    for (const node of index.nodeById.values()) {
      if (node.kind === "symbol" && node.family === "function-like" && node.file === loc.file && node.symbolPath[node.symbolPath.length - 1] === loc.symbol) {
        const owner = ownerOfMember(index, node.id);
        if (owner) return owner;
      }
    }
  }
  return null;
}

/** Aristas que cuentan como "esto construye/produce aquello" — ver punto 2 del docstring del módulo: `instantiates` (TS/JS/Go con `new`), `calls` (Python/Ruby, donde llamar a la clase/`.new` construye sin una arista `instantiates` dedicada). */
const CONSTRUCT_EDGE_KINDS = new Set<CodeGraphEdge["kind"]>(["instantiates", "calls"]);
/** Aristas que cuentan como "un estado transiciona/apunta a otro" — más amplio que `CONSTRUCT_EDGE_KINDS`: incluye `references`, la única arista que algunas cascadas dejan para `GreenState.new` (Ruby) cuando no clasifican la llamada como constructora. */
const TRANSITION_EDGE_KINDS = new Set<CodeGraphEdge["kind"]>(["instantiates", "calls", "references"]);
/** Cota de recorrido de la familia de estados — ningún patrón State real necesita más; evita un recorrido sin límite si el grafo tuviera un ciclo patológico. */
const STATE_FAMILY_MAX_NODES = 32;

interface StateFamily {
  readonly familyIds: ReadonlySet<string>;
  readonly sharedMember: { readonly name: string; readonly arity: number | null };
  /** Nodo de la interfaz/protocolo común, sólo si ≥2 miembros de la familia la implementan/satisfacen — `null` ⇒ duck typing (forma PARCIAL). */
  readonly interfaceId: string | null;
}

/**
 * Descubre la familia de "estados" alcanzable desde `contextId`: arranca en
 * lo que `contextId` (sus propios miembros function-like, o — a falta de
 * eso — el nodo archivo, ver punto 2 del docstring del módulo) construye, y
 * CIERRA por transición estado→estado hasta `STATE_FAMILY_MAX_NODES`.
 * `null` si no hay al menos 2 nodos en la familia, o si ninguno comparte un
 * miembro por (name, arity) — sin eso no hay protocolo que evidenciar, sea
 * nominal o de hecho.
 */
function discoverStateFamily(index: StateGraphIndex, contextId: string, contextFile: string): StateFamily | null {
  const seeds = new Set<string>();
  const sources = [...directMembers(index, contextId).map((m) => m.id), fileNodeId(contextFile)];
  for (const sourceId of sources) {
    for (const e of index.edgesFrom.get(sourceId) ?? []) {
      if (!CONSTRUCT_EDGE_KINDS.has(e.kind)) continue;
      const target = index.nodeById.get(e.to);
      if (isOwnerLike(target) && target.id !== contextId) seeds.add(target.id);
    }
  }
  if (seeds.size === 0) return null;

  const family = new Set<string>(seeds);
  const queue = [...seeds];
  while (queue.length > 0 && family.size < STATE_FAMILY_MAX_NODES) {
    const current = queue.shift()!;
    // Las aristas de transición (`RedState.next --instantiates--> GreenState`)
    // salen del MIEMBRO, no de la clase — mismo hecho medido que el punto 2
    // del docstring del módulo documenta para el primer salto. Por eso acá
    // se recorren las aristas de `current` Y de cada uno de sus miembros
    // function-like, no sólo las de `current` mismo.
    const sourcesFromCurrent = [current, ...directMembers(index, current).map((m) => m.id)];
    for (const sourceId of sourcesFromCurrent) {
      for (const e of index.edgesFrom.get(sourceId) ?? []) {
        if (!TRANSITION_EDGE_KINDS.has(e.kind)) continue;
        const target = index.nodeById.get(e.to);
        if (!isOwnerLike(target) || target.id === contextId || family.has(target.id)) continue;
        family.add(target.id);
        queue.push(target.id);
      }
    }
  }
  if (family.size < 2) return null;

  const memberOwners = new Map<string, Set<string>>();
  for (const id of family) {
    for (const m of memberSignatures(asMemberIndex(index), id)) {
      const key = `${m.name} ${m.arity === null ? "null" : m.arity}`;
      const owners = memberOwners.get(key) ?? new Set<string>();
      owners.add(id);
      memberOwners.set(key, owners);
    }
  }
  let sharedMember: { name: string; arity: number | null } | null = null;
  for (const [key, owners] of memberOwners) {
    if (owners.size < 2) continue;
    const sep = key.indexOf(" ");
    const name = key.slice(0, sep);
    const arityText = key.slice(sep + 1);
    sharedMember = { name, arity: arityText === "null" ? null : Number(arityText) };
    break;
  }
  if (!sharedMember) return null;

  let interfaceId: string | null = null;
  const implementersByInterface = new Map<string, Set<string>>();
  for (const id of family) {
    for (const e of index.edgesFrom.get(id) ?? []) {
      if (e.kind !== "implements" && e.kind !== "satisfies") continue;
      const owners = implementersByInterface.get(e.to) ?? new Set<string>();
      owners.add(id);
      implementersByInterface.set(e.to, owners);
    }
  }
  for (const [iface, owners] of implementersByInterface) {
    if (owners.size >= 2) {
      interfaceId = iface;
      break;
    }
  }

  return { familyIds: family, sharedMember, interfaceId };
}

type StructuralOutcome = "completa" | "parcial" | "sin-senal" | "sin-contexto" | "sin-grafo";

interface StructuralSignal {
  readonly outcome: StructuralOutcome;
  readonly check: PatternHypothesisCheck;
}

const STRUCTURAL_LABEL = "máquina de estados en el grafo (protocolo compartido + transición estado→estado — CONTRATO-F10.md §2)";

function nodeLabel(index: StateGraphIndex, id: string): string {
  return index.nodeById.get(id)?.symbolPath.join(".") ?? id;
}

/** El excluder ESTRUCTURAL — ver el docstring del módulo para las tres formas y sus tres adaptaciones medidas. `graph === null` es el caso REAL de producción hoy (límite de cableado declarado ahí). */
function evaluateStateStructure(p: StateProblem, graph: CodeGraph | null): StructuralSignal {
  if (!graph) {
    return {
      outcome: "sin-grafo",
      check: {
        label: STRUCTURAL_LABEL,
        passed: false,
        why:
          "no se pudo verificar: el grafo del repo todavía no existe en esta corrida (límite de cableado — el ancla de esta " +
          "hipótesis, repeated-switch, es intra-file, y `code-analyzer.ts` sólo llama `build()` dentro de `analyzeFile`, antes " +
          "de que `repo.graph` exista; ver el docstring del módulo). Se asume 'sin evidencia', nunca 'evidencia de ausencia'.",
        role: "applied",
      },
    };
  }
  const index = buildStateGraphIndex(graph);
  const context = resolveStateContext(index, p.locations);
  if (!context) {
    return {
      outcome: "sin-contexto",
      check: {
        label: STRUCTURAL_LABEL,
        passed: false,
        why:
          "no se pudo resolver, en el grafo, la clase/módulo que contiene los métodos señalados por este hallazgo (o el " +
          'lenguaje no modela ese contenedor como class-like/namespace-like — p.ej. Go, donde un struct sale family="other"): ' +
          "sin contexto no hay dónde buscar una máquina de estados.",
        role: "applied",
      },
    };
  }
  const family = discoverStateFamily(index, context.id, context.file);
  if (!family) {
    return {
      outcome: "sin-senal",
      check: {
        label: STRUCTURAL_LABEL,
        passed: false,
        why: `"${nodeLabel(index, context.id)}" no muestra, en el grafo, ningún grupo de ≥2 tipos que se construyan/llamen entre sí compartiendo un miembro — sin evidencia de máquina de estados ya construida.`,
        role: "applied",
      },
    };
  }
  const members = [...family.familyIds].map((id) => nodeLabel(index, id)).join(", ");
  const arityText = family.sharedMember.arity === null ? "?" : String(family.sharedMember.arity);
  if (family.interfaceId) {
    return {
      outcome: "completa",
      check: {
        label: STRUCTURAL_LABEL,
        passed: true,
        why:
          `"${nodeLabel(index, context.id)}" construye un estado inicial de {${members}}, que implementan/satisfacen ` +
          `"${nodeLabel(index, family.interfaceId)}" en común y transicionan entre sí (uno instancia/llama al siguiente), ` +
          `compartiendo "${family.sharedMember.name}"/${arityText} — la máquina de estados YA EXISTE. Este hallazgo, de todos ` +
          "modos, decide por switch: la abstracción está siendo puenteada (aplicado-eludido, no ya-aplicado limpio — ver el " +
          "docstring del módulo sobre por qué ese estado es estructuralmente inalcanzable para una hipótesis anclada en bypass).",
        role: "applied",
      },
    };
  }
  return {
    outcome: "parcial",
    check: {
      label: STRUCTURAL_LABEL,
      passed: true,
      why:
        `{${members}} se usan como estados alternos de "${nodeLabel(index, context.id)}" (comparten ` +
        `"${family.sharedMember.name}"/${arityText}, se construyen/llaman entre sí), pero NINGUNO declara una interfaz/` +
        "protocolo común (implements/satisfies): envoltura ad hoc sin protocolo compartido — la forma PARCIAL del patrón " +
        "(CONTRATO-F10.md §2), no el olor sin estructura.",
      role: "applied",
    },
  };
}

/**
 * Combina los dos excluders — ver "SUMAR, NO REEMPLAZAR" en el docstring del
 * módulo. La señal ESTRUCTURAL decide cuando confirma algo (`completa`/
 * `parcial`); si no confirma nada (`sin-senal`/`sin-contexto`/`sin-grafo`),
 * el excluder VIEJO decide, con la señal estructural agregada como evidencia
 * auditable adicional en `checks` (nunca oculta, aunque no haya decidido).
 */
function appliedState(p: StateProblem, graph: CodeGraph | null): AppliedStateResult {
  const structural = evaluateStateStructure(p, graph);
  if (structural.outcome === "completa") {
    return { state: "aplicado-eludido", checks: [structural.check] };
  }
  if (structural.outcome === "parcial") {
    return { state: "parcial", checks: [structural.check] };
  }
  const legacy = legacyTypedFieldState(p, graph);
  return { state: legacy.state, checks: [...legacy.checks, structural.check] };
}

const SPEC: HypothesisSpec<StateProblem, CodeGraph | null> = {
  pattern: "State",
  ceiling: "media" as PatternConfidence,
  needs: [],
  required: [
    selfPrefixCheck,
    methodCountCheck,
    implicitSelfNeedsTransitionEvidence,
    notTypeSelectionCheck,
    cycleSpreadCheck,
    unitSlackCheck,
  ],
  discriminators: [transitionCheck, branchesCheck],
  appliedState,
  toConfirm: [
    "¿Las ramas representan ESTADOS del objeto (con transición real) y no la validación de un valor de configuración fijo que nunca cambia?",
    "¿La exclusión mutua es sobre el MISMO objeto que transiciona (State), o sobre un algoritmo intercambiable elegido una sola vez (Strategy)?",
    "(conditional-chain) ¿La cadena prueba el MISMO campo que otro miembro del mismo tipo, o es una validación puntual de este único lugar?",
    "(temporary-field) ¿Los miembros que leen el campo se COMPORTAN distinto según esté lleno o vacío, o el campo simplemente no se usa mientras está vacío (ahí la respuesta es Extract Class, no State)?",
    "(enumerated-field-dispatch) ¿Las ramas que dependen del campo cambian COMPORTAMIENTO, o cada una sólo devuelve un dato distinto? Si es lo segundo, la respuesta es una tabla, no una jerarquía de estados.",
    "(type-switch) ¿El objeto REASIGNA ese campo durante su vida (State) o lo recibe una vez y no cambia más (Strategy)? Y si cada rama CONSTRUYE un tipo distinto, el patrón es Factory Method: el ancla type-switch no expone esa forma y no puede excluirla sola.",
    "(type-switch) ¿Los tipos que las ramas prueban son del propio repo —donde se les puede agregar el método— o de una biblioteca ajena? Si son ajenos, el remedio es un registro/tabla, no una jerarquía de estados.",
  ],
  source: "https://refactoring.guru/es/design-patterns/state",
};

/* ────────────────────────────────────────────────────────────────────────
 * OLA AI, FRENTE AI4 — LA TRAZA DEL EMBUDO DE STATE. Copia deliberada, en
 * forma y en default, de `strategy.ts#startStrategyTrace` (Ola AH, AH1) —
 * mismo mecanismo que `engine.ts#startArbitrationTrace`: ningún `process.env`
 * en el camino de análisis, se prende llamando `startStateTrace()` desde un
 * script de medición y se apaga sola al leerla. `null` (el default de
 * producción) ⇒ costo cero: ni una rama de más por hallazgo, ni un check de
 * más corrido.
 *
 * QUÉ CONTESTA, y por qué el volcado de producción no puede contestarlo: el
 * volcado sólo publica lo que SOBREVIVE (`build()` devuelve `null` cuando un
 * `required` no se sostiene, y con él se pierde CUÁL no se sostuvo). Para
 * medir el techo aditivo de una compuerta ANTES de tocarla hace falta el
 * resultado de CADA `required`, también en los hallazgos que no emiten. Es
 * exactamente la inversión de instrumento que el integrador de la Ola AH pidió
 * para este archivo (§14.1: *"copiar esa traza a `proxy.ts`, `state.ts` y
 * `facade.ts`"*). Cuando la traza está prendida se re-corren los `required` y
 * `appliedState` de esta hipótesis (son puros: leen `problem`, `graph` y `ctx`,
 * no escriben nada) para poder registrar el resultado por check y el estado que
 * la hipótesis HABRÍA tenido.
 * ──────────────────────────────────────────────────────────────────────── */
export interface StateTraceEntry {
  readonly findingId: string;
  readonly kind: string;
  readonly file: string;
  readonly line: number;
  readonly title: string;
  readonly variant: string | null;
  readonly triggerValue: number;
  /** `true` en la pasada con grafo del repo (`rebuildHypothesesWithGraph`), `false` en la primera (dentro de `analyzeFile`). */
  readonly withGraph: boolean;
  /** ¿había árbol vivo? — el eje que separa "no se pudo confirmar" de "se confirmó que no". */
  readonly withFile: boolean;
  /** Las cuatro formas de "campo propio" y la escala derivada, para poder contar el embudo sin re-derivar nada. */
  readonly fieldName: string | null;
  readonly selfPrefixed: boolean;
  readonly implicitSelfMember: boolean;
  readonly declaredMemberSelf: boolean;
  readonly capturedViaOwnGetter: boolean;
  /** Ola AJ (AJ5) — la QUINTA forma: `R.campo` con `R` = receptor declarado. */
  readonly receiverQualifiedSelf: boolean;
  /** Ola AK (AK1) — la SEXTA forma: el discriminante ES el receptor declarado. */
  readonly receiverItself: boolean;
  readonly distinctMethods: number;
  readonly transitionConfirmed: boolean;
  readonly branchesConfirmed: boolean;
  /**
   * OLA AN (AN2) — LA PRUEBA EMPÍRICA DE QUE EL CANAL DEL NIVEL 2 LLEGA VIVO A
   * ESTE PUNTO, y no una lectura de código. Cuántos hallazgos de cada kind de
   * NIVEL 2 (`long-function`/`complexity`/`primitive-obsession`: las anclas de
   * `Extract Method` y de `Value Object`) ve el vecindario de ESTE hallazgo en
   * ESTA pasada, en las tres resoluciones que el sustrato de la ola midió.
   *
   * QUÉ INTENCIÓN VERIFICA: *"¿el hecho de nivel 2 está DISPONIBLE en el punto
   * donde la hipótesis de State se evalúa?"* — la pregunta de mecanismo del
   * encargo, contestada con una medición y no con una lectura. En la pasada 1
   * (`analyzeFile`) `ctx.neighborhood` es `EMPTY_NEIGHBORHOOD` por
   * construcción y las tres salen vacías; en la pasada con grafo
   * (`rebuildHypothesesWithGraph`) salen los números reales. **La diferencia
   * entre las dos filas de un mismo `findingId` ES la prueba de que un chequeo
   * que lea el vecindario acá no sería inerte.**
   *
   * COSTO CERO EN PRODUCCIÓN: `recordStateTrace` es el único llamador y sólo
   * corre con la traza prendida (`stateTrace !== null`, que en producción es
   * `null`). Con la traza apagada estas consultas no se ejecutan nunca.
   */
  readonly n2OfKind: Readonly<Record<string, number>>;
  /** Ídem, sólo los que COMPARTEN ARCHIVO con este hallazgo (`findingsInFile`). */
  readonly n2InFile: Readonly<Record<string, number>>;
  /** Ídem, sólo los del MISMO símbolo (`findingsAtSymbol` sobre el ancla de la primera ubicación). */
  readonly n2AtSymbol: Readonly<Record<string, number>>;
  readonly checks: readonly { readonly id: string; readonly holds: boolean; readonly why: string }[];
  /** El primero de `required` que NO se sostiene, o `null` si todos se sostienen. */
  readonly diesAt: string | null;
  /** El estado que `appliedState` decide — se registra TAMBIÉN cuando algún `required` mata la hipótesis, porque es el dato que dice qué se está perdiendo. */
  readonly appliedState: string;
  /** ¿la hipótesis se emitió de verdad en esta pasada? */
  readonly emitted: boolean;
}

let stateTrace: StateTraceEntry[] | null = null;

export function startStateTrace(): void {
  stateTrace = [];
}

export function takeStateTrace(): readonly StateTraceEntry[] {
  const t = stateTrace ?? [];
  stateTrace = null;
  return t;
}

/**
 * OLA AN (AN2) — los tres kinds del NIVEL 2 (las refactorizaciones), leídos del
 * vecindario para la traza. NO es vocabulario de dominio: son los `kind` que
 * `extract-method.ts` (`LONG_FUNCTION_KIND`, `COMPLEXITY_KIND`) y
 * `value-object.ts` (`PRIMITIVE_OBSESSION_KIND`) declaran como sus anclas. Vive
 * acá, y no en el camino de análisis, porque su ÚNICO consumidor es
 * `recordStateTrace`.
 */
const N2_KINDS_TRAZA = ["long-function", "complexity", "primitive-obsession"] as const;

function n2Counts(ctx: HypothesisContext, problem: Finding): { ofKind: Record<string, number>; inFile: Record<string, number>; atSymbol: Record<string, number> } {
  const ofKind: Record<string, number> = {};
  const inFile: Record<string, number> = {};
  const atSymbol: Record<string, number> = {};
  const loc = problem.locations[0];
  const anchor = loc ? deriveAnchor(loc) : null;
  const enFile = loc ? ctx.neighborhood.findingsInFile(loc.file) : [];
  const enSimbolo = anchor ? ctx.neighborhood.findingsAtSymbol(anchor) : [];
  for (const k of N2_KINDS_TRAZA) {
    ofKind[k] = ctx.neighborhood.countOfKind(k);
    inFile[k] = enFile.filter((f) => f.kind === k).length;
    atSymbol[k] = enSimbolo.filter((f) => f.kind === k).length;
  }
  return { ofKind, inFile, atSymbol };
}

function recordStateTrace(problem: Finding, p: StateProblem, graph: CodeGraph | null, ctx: HypothesisContext, emitted: boolean): void {
  const checks = SPEC.required.map((c) => {
    const r = c.run(p, graph);
    return { id: c.id, holds: r.holds, why: r.evidence };
  });
  const n2 = n2Counts(ctx, problem);
  const loc = problem.locations[0];
  stateTrace?.push({
    findingId: problem.id ?? "",
    kind: problem.kind,
    file: loc?.file ?? "",
    line: loc?.startLine ?? 0,
    title: problem.title,
    variant: problem.variant ?? null,
    triggerValue: problem.trigger[0]?.value ?? 0,
    withGraph: graph !== null,
    withFile: ctx.file !== null,
    fieldName: p.fieldName,
    selfPrefixed: p.selfPrefixed,
    implicitSelfMember: p.implicitSelfMember,
    declaredMemberSelf: p.declaredMemberSelf,
    capturedViaOwnGetter: p.capturedViaOwnGetter,
    receiverQualifiedSelf: p.receiverQualifiedSelf,
    receiverItself: p.receiverItself,
    distinctMethods: p.distinctMethods,
    transitionConfirmed: p.transitionConfirmed,
    branchesConfirmed: p.branchesConfirmed,
    n2OfKind: n2.ofKind,
    n2InFile: n2.inFile,
    n2AtSymbol: n2.atSymbol,
    checks,
    diesAt: checks.find((c) => !c.holds)?.id ?? null,
    appliedState: SPEC.appliedState(p, graph).state,
    emitted,
  });
}

export const hypothesis: HypothesisBuilder = {
  id: "state",
  pattern: "State",
  layer: "patron",
  // Ola W2 — segunda ancla: `conditional-chain` (382 hallazgos, 85 % de
  // precisión propia) comparte la MISMA forma sintáctica if/elsif o
  // switch/case que `repeated-switch` — ver docstring del módulo.
  // Ola Y (Y2) — TERCERA ancla: `temporary-field` (195 hallazgos, 69 %
  // [42 %, 87 %] de precisión medida a mano, Ola X/B7) — ver el docstring
  // del módulo, sección "TERCERA ANCLA", para la rama propia que necesitó.
  // Ola AC (AC2) — R1 sacó `temporary-field` (14,6 %, n=48) y dejó fuera
  // `enumerated-field-dispatch` (5,0 %, n=20, refutada en esa misma ola).
  // REVERTIDO en la misma ola: quitar un ancla que rinde 14,6 % —el promedio
  // del catálogo sin Extract Method es 15,0 %— costó 7 de las 8 propuestas
  // correctas que perdió el proyecto, y el umbral que la condenó (20 %) no
  // estaba validado contra el valor de lo que se pierde. `temporary-field`
  // VUELVE. La poda de falsos se decide con un criterio de costo/beneficio
  // acordado, no con un umbral inventado. `enumerated-field-dispatch` sigue
  // fuera: fue medida y refutada (1 verdadera de 20), no podada por umbral.
  // Ola AI (AI4) — CUARTA ancla: `type-switch`. `strategy.ts#notStateCheck`
  // descarta un `type-switch` diciendo "eso es State, no Strategy" y State no
  // lo escuchaba: nadie proponía nada. Ver el docstring de la sección "CUARTA
  // ANCLA: `type-switch`" para los DOS `required` que su entrada no podía
  // satisfacer por construcción, y por qué la rama propia es el arreglo.
  // *** OLA AZ (AZ3) — `temporary-field` SALE DE `anchors`, POR SEGUNDA Y
  // ÚLTIMA VEZ, Y AHORA CON EL PRECIO PUBLICADO. ***
  //
  // NO es un umbral: es un RUTEO. El ancla ACIERTA —el campo sí es un hueco
  // con significado— y lo que falla es colgarle `State`, que además exige una
  // FAMILIA DE ESTADOS con nombre. El ancla ya tiene dueño:
  // `extract-class-from-temporary-fields.ts` la consume y mide 63,2 %.
  //
  // LOS NÚMEROS, medidos en la Ola AZ sobre los 21 repos con el instrumento
  // oficial (`ola-az/informes/AZ3.md` §1, §3, §4):
  //   · el ancla: 430 de las 497 propuestas de `State` y **20 verdaderas de
  //     211 juicios = 9,5 % [6 %, 14 %]** — Wilson entero por debajo de la meta.
  //   · **26 sujetos FRESCOS** (nunca juzgados, sorteados con semilla fija
  //     ANTES de decidir el corte, abiertos uno por uno en el archivo real):
  //     **1 verdadera · 23 falsas · 2 `psp` = 4,2 % [0,7 %, 21 %]**. Las 23
  //     falsas son CINCO formas y ninguna es una máquina de estados: handle de
  //     recurso (8), memoización (5), contenedor/acumulador (4), valor de
  //     salida (3), cursor/selección (3).
  //   · efecto: `State` 32/252 = 12,7 % → **12/41 = 29,3 % [18 %, 44 %]**.
  //
  // EL PRECIO, QUE NO SE ESCONDE: **20 verdaderas**, nombradas una por una en
  // `AZ3.md` §4.2 — y entre ellas está `guava/MultiInputStream.java:56`, el
  // CASO TESTIGO con el que la Ola Y justificó cablear esta ancla. Se paga
  // porque el usuario levantó la regla de costo cero para `State` en esta ola,
  // con la condición de publicar las dos cifras juntas.
  //
  // POR QUÉ NO ALCANZABA UNA COMPUERTA. Se evaluaron CATORCE cortes (tabla
  // completa en `AZ3.md` §4.1). Los baratos existen y son buenísimos de razón
  // —`branchesCheck` a `required` apaga 72 falsas por 2 verdaderas (36 a 1)—
  // pero dejan a `State` en 16,9 %: **4,2 puntos, dentro de la barra de error
  // de ±8 a 12 puntos del juicio, o sea NO es un resultado.** Los únicos que
  // cruzan el 25 % con mejor razón que éste (`distinctMethods >= 8`, 10,9 a 1)
  // son un NÚMERO NUEVO leído de la curva: es la trampa de elegir el corte
  // después de ver los datos, y este archivo no la pisa ("ESCALA: ningún
  // número nuevo").
  //
  // ES UN RECORTE DE RUTEO, NO DE CONSTRUCCIÓN: `build()` sigue construyendo
  // para `temporary-field` (`buildTemporaryFieldProblem` intacto, con sus
  // tests), y `run.ts` filtra por `b.anchors.includes(finding.kind)`. **Volver
  // a encenderla es esta línea y ninguna otra.** El delta de nivel 1 es CERO y
  // está probado por un test, no por un argumento: ver
  // `state.test.ts` → "el ancla retirada sigue ANCLADA por otra hipótesis".
  anchors: ["repeated-switch", "conditional-chain", TYPE_SWITCH_ANCHOR],
  build(problem, graph, ctx) {
    const p = buildProblem(problem, ctx);
    const outcome = engineBuild(SPEC, ctx.capabilities, p, graph);
    if (stateTrace) recordStateTrace(problem, p, graph, ctx, outcome !== null);
    if (!outcome) return null;
    return toPatternHypothesis(SPEC, outcome, {
      anchorFindingId: problem.id,
      places: problem.locations,
      cost: "Una clase por estado, implementando la misma interfaz, más la lógica de transición movida a esas clases — se justifica cuando el número de estados crece o la lógica de transición cambia seguido; con 2-3 estados estables un enum con la cadena actual puede alcanzar.",
    });
  },
};
