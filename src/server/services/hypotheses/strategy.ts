/**
 * `strategy` — migración F6 de `pattern-behavioral.ts:234 findStrategyOpportunities`
 * al motor de hipótesis (CONTRATO-F6.md, Contrato 3). Cuelga de `conditional-chain`
 * (ancla primaria) y de `repeated-switch` (ancla secundaria — es literalmente la
 * señal que la regla vieja usaba para saltar a confianza alta cuando la misma
 * cadena aparecía en otro sitio).
 *
 * ─── required (candidata o no) ──────────────────────────────────────────────
 *  1. `no-construye-tipos` — el EXCLUDER hacia Factory Method que la regla vieja
 *     ya tenía (`chain.branches.some(b => b.constructsType !== null)`). Con el
 *     `Finding` de hoy sólo se ve `variant === "instantiates"` (TODAS las ramas
 *     construyen tipos distintos, `FunctionMetrics.chainInstantiates`) — la
 *     construcción PARCIAL (alguna rama sí, otras no) no es visible en el
 *     `Finding`: BRECHA declarada, no oculta. En el ancla `repeated-switch` esta
 *     exclusión no se puede aplicar en absoluto (el detector no expone si las
 *     ramas construyen nada) — también declarado, no asumido en silencio.
 *     REVISADO (ola "required no permisivo"): un excluder que no puede
 *     evaluarse y de todos modos aprueba es sospechoso por definición — pero
 *     ACÁ se dejó `holds: true` a propósito, no por descuido, y con el
 *     número que lo sostiene: sobre los 174 veredictos a mano
 *     (`tests/golden/precision/*.hypotheses.csv`), los 5 casos de Strategy
 *     anclados en `repeated-switch` se dividen en 4 falsos (ninguno por
 *     construcción de tipos — HTTP status dispatch, recursión por tipo en un
 *     script descartable, dispatch de resultado cerrado, enum cerrado) y 1
 *     verdadero (`app/models/hookable.rb:255`, `aplicado-eludido` — el caso
 *     que motiva `engine.ts#arbitrateRivalHypotheses`, que SUPRIME la
 *     oportunidad rival de State sobre esa misma ancla). Invertir esta rama a
 *     `false` apaga TODO `repeated-switch` para Strategy (el check fallaría
 *     siempre, sin camino alternativo) — cero falsos recuperados, y destruye
 *     el único verdadero, reabriendo además el falso positivo de State que
 *     `arbitrateRivalHypotheses` existe para evitar. Se mide, se nombra, y se
 *     deja como está: NO es el mismo defecto que `no-es-campo-propio`/
 *     `ramas-invocan-comportamiento-distinto`/`un-solo-discriminante` (abajo),
 *     donde invertir sí recupera precisión sin costo medido.
 *  2. `no-es-campo-propio` — el EXCLUDER hacia State que la regla vieja ya tenía
 *     (`chain.discriminantIsSelfField`). Para el ancla `repeated-switch`
 *     funciona HOY, sin AST vivo: el título del `Finding` ya cita el
 *     discriminante entre comillas (`repeated-switch.ts`), el mismo truco que
 *     la hipótesis vecina `state.ts` usa para su excluder simétrico. Para
 *     `conditional-chain` el título NO trae el discriminante — se reconstruye
 *     leyendo el AST vivo vía `ctx.file` (mismo vocabulario que
 *     `pattern-behavioral.ts#SELF_PREFIXES`: `self.`/`this.`/`@`/receptor de
 *     Go). P2 cableó `attachHypotheses` dentro de `analyzeFile` (con
 *     `files: [fileUnit]`, antes de `tree.delete()`) para los dos anclas de
 *     esta hipótesis (ambas `intra-function`/`intra-file`) — así que
 *     `ctx.file` YA NO es `null` en producción para un `Finding` real
 *     (verificado, `run.test.ts`/`strategy.test.ts` §"PASO 3"), pero la rama
 *     permisiva SÍ era alcanzable igual: cuando el árbol está vivo pero no
 *     ubica la función/cadena/texto (símbolo desalineado, forma que el
 *     recorrido no cubre), o cuando el título de `repeated-switch` no cita un
 *     discriminante extraíble. REVISADO (ola "required no permisivo",
 *     caso testigo: `XmlNodeConverter.cs` de `newtonsoft-json`): "no se pudo
 *     confirmar" no es una condición cumplida — TODAS las ramas de "no se
 *     pudo X" de este check ahora devuelven `holds: false`, con evidencia que
 *     dice qué no se pudo confirmar, nunca "se asume".
 *  3. `suficiente-senal` — >=5 ramas (conditional-chain) o >=2 repeticiones del
 *     discriminante (repeated-switch). `STRATEGY_MIN_BRANCHES`/`STRATEGY_MIN_REPEATS`
 *     [provisional]: ALINEADOS a propósito con el piso de su propio ancla
 *     (`conditional-chain` exige 5, `repeated-switch` exige 2 — Ola 10,
 *     `threshold-alignment.test.ts`). Antes de esta ola `STRATEGY_MIN_BRANCHES`
 *     era 3: un desajuste MUDO — ningún `conditional-chain` real llega nunca
 *     con menos de 5 ramas (el detector ya las descarta antes), así que el
 *     check nunca filtró nada, en ningún repo del corpus (medido: 0 casos de
 *     diferencia al subir 3→5). No es un filtro que hoy descarte nada, sigue
 *     siendo un piso propio para cuando el umbral del ancla cambie — pero
 *     ahora el número ESCRITO acá es el mismo que el que de verdad decide,
 *     no uno más bajo y falso.
 *  4. `ramas-invocan-comportamiento-distinto` [Ola D] — el diagnóstico del
 *     encargo: "el ancla detecta una FORMA (una escalera) y `required` no
 *     verificaba la SEMÁNTICA que hace que Strategy aplique". Los 9 falsos
 *     de la muestra juzgada a mano (rails.hypotheses.csv/
 *     ck-analyzer.hypotheses.csv, pattern=Strategy) se reducen a UNA forma
 *     bajo dos disfraces, los dos ya visibles en la ANATOMÍA del árbol
 *     (nunca vocabulario de framework):
 *       (a) TABLA DE CLASIFICACIÓN, no algoritmos — `map_job_title_to_function`/
 *           `map_experience_to_filter` (migratemate_tool.rb), `detect_source`
 *           (lead_attribution.rb), `visit()` (code-grammar.ts, la muestra de
 *           `ck-analyzer`): TODAS las ramas retornan un valor de un CONJUNTO
 *           CERRADO (string/símbolo fijo, o siempre el mismo `.add(...)`) en
 *           vez de invocar una operación SUSTANTIVA y DISTINTA por rama.
 *       (b) MISMA OPERACIÓN, argumentos distintos — `resolve_parent`
 *           (hookable.rb, la fila `estado-mal-clasificado`: su nota dice que
 *           el discriminante real es "cuál parámetro está presente", un
 *           diagnóstico de ARIDAD — éste igual la excluye, por convergencia
 *           de `.find` en 3 de 4 ramas, sin necesitar un check aparte para
 *           aridad), `make_request`/`make_multipart_request`
 *           (ghl_http_client.rb, `.raise`/`.parse` repetidos), `show_review_
 *           form_response` (deals_controller.rb, siempre `render`) y
 *           `config_has_chain_tokens?` (rake task, siempre `.any?`): las
 *           ramas SÍ invocan algo, pero la MAYORÍA converge en la MISMA
 *           operación nombrada — variación de DATOS sobre una operación,
 *           no una selección entre ALGORITMOS.
 *     Mecanismo (`distinctBehaviorCheck`, abajo): por cada rama (peldaño
 *     if/elsif o `arm` de switch, SIN el `else`/`default` final — mismo
 *     criterio de exclusión que `state.ts#countArms`), ¿su acción
 *     (`consequence`/`body`, los mismos dos campos que `code-grammar.ts:388`
 *     ya prueba en ese orden) contiene una invocación (`CALL_WORD`)? Si la
 *     MAYORÍA no la tiene ⇒ (a). Si la tienen pero la invocación MÁS GRANDE
 *     por span (la real, no una anidada como argumento) es la MISMA en la
 *     mayoría de las ramas con acción ⇒ (b). Los dos verdaderos de la
 *     muestra (`KQZUMXqaHtlr85i9`/`MigrateMateTool#call`, el único `ausente`
 *     real; `B2PkWn_o`/`Hookable.index_metadata`, el único `aplicado-eludido`
 *     real) pasan las dos pruebas — verificado a mano, fijado en
 *     `strategy.test.ts` como regresión. `CALL_WORD` extiende
 *     `chain-of-responsibility.ts:183`/`proxy.ts:340` (confirmado por sonda
 *     contra Go) para cubrir TAMBIÉN C# (`invocation_expression`, que
 *     ninguno de los dos cubre hoy); `CALLEE_FIELDS` son los mismos tres que
 *     `graph/references.ts` ya documenta como universales. LÍMITE
 *     DECLARADO: en los 5 grammars que anidan un member-access dentro del
 *     campo `function` (esa misma referencia, "CASE B"), esto lee el nodo
 *     anidado ENTERO como nombre (`obj.method`, no `method` a secas) — MÁS
 *     estricto, nunca EXCLUYE de más por esto (dos ramas que llaman al
 *     mismo método de un receptor distinto no cuentan como "misma
 *     operación"), sólo podría dejar de excluir un caso real; sin caso
 *     medido en las dos poblaciones (Ruby no anida). REVISADO (ola "required
 *     no permisivo", CASO TESTIGO real: `XmlNodeConverter.cs` de
 *     `newtonsoft-json` recibía Strategy por esta vía exacta): sin árbol vivo
 *     o sin ramas ubicables, este check ahora devuelve `holds: false` — "no
 *     se pudo confirmar que las ramas invocan comportamiento distinto" no es
 *     lo mismo que "se confirmó que sí" y no debe aprobar. Mismo criterio en
 *     la rama de <2 invocaciones identificables (antes "sin evidencia
 *     suficiente... se mantiene como candidata", ahora `holds: false`): un
 *     `required` que aprueba porque no alcanzan los datos para juzgar no es
 *     un `required`.
 *  5. `un-solo-discriminante` [Ola D] — complementa a 4 para la forma que el
 *     encargo nombra aparte: "discriminar por CUÁL parámetro vino no es
 *     elegir estrategia, es despachar por aridad" (`resolve_parent`, ya
 *     excluido por el check 4 pero por otra vía — ver arriba). Sólo aplica
 *     a `conditional-chain` cuando la cadena es una escalera if/elsif real
 *     (no un switch: ahí el discriminante es UNO por construcción
 *     gramatical, `holds: true` sin más). Reusa `discriminantSubject`
 *     (abajo) sobre la condición de CADA peldaño — si todas comparten
 *     sujeto (`kind === "circle"`, `kind === "square"`: mismo `kind`) ⇒
 *     discriminante único, forma real. Si cada peldaño testea una expresión
 *     distinta (`params[:question_id].present?` vs. `params[:form_id]
 *     .present?`) ⇒ aridad, no Strategy. REVISADO (ola "required no
 *     permisivo"): las ramas "no se pudo X" (árbol no disponible, función no
 *     ubicada, nodo de cadena no ubicado, menos de dos peldaños con condición
 *     legible) devolvían `holds: true` ("se asume sin confirmar" / "sin
 *     evidencia suficiente, se mantiene como candidata") — ahora `holds:
 *     false` en las cuatro. Quedan `true` únicamente las dos ramas donde la
 *     condición se cumple DE VERDAD sin ese dato, por construcción gramatical
 *     (switch/case: un discriminante por definición sintáctica) o por
 *     evidencia positiva real (todos los peldaños comparan el mismo sujeto) —
 *     nunca por no haber podido mirar.
 *  6. `tipo-discriminante-no-externo` [Ola Z, Z7] — LA COMPUERTA QUE FALTA
 *     que la Ola Y midió y dejó sin cerrar: "switch sobre un tipo que el
 *     repo no declara" (`RoundingMode` del JDK, `System.Reflection` de la
 *     BCL, `String`/`Regexp`/`Warning` y `str`/`type`/`TypeVar` de las
 *     stdlib de Ruby/Python — 8 casos medidos, 0 verdaderos, en las TRES
 *     anclas). Excluye cuando el tipo que discrimina la rama resuelve, por
 *     grafo (`CodeGraphNode.family === "class-like"`, nunca coincidencia de
 *     nombres para FABRICAR una relación — sólo para responder "¿existe?"),
 *     a NINGÚN nodo de este repo. Ver la sección propia más abajo
 *     (`externalDiscriminantTypeCheck`) para el mecanismo completo, las tres
 *     fuentes de candidatos y los límites declarados.
 *
 * ─── discriminators (escalera) ──────────────────────────────────────────────
 *  - `cuatro-o-mas`: >=4 ramas/repeticiones (`STRATEGY_STRONG_SIGNAL`), más
 *    fuerte que el piso.
 *  - `repeticion-cruzada`: SIEMPRE confirmado cuando el ancla es
 *    `repeated-switch` (esa es la definición del ancla: el mismo discriminante
 *    en >=2 lugares). Para `conditional-chain` (P2, CONTRATO-F9.md §1.1):
 *    YA NO es un `false` fijo — la justificación vieja ("un check no tiene
 *    acceso a otros Finding del repo, HypothesisContext no los expone") es
 *    OBSOLETA desde la Ola 9 (`ctx.neighborhood`). El check deriva el
 *    discriminante de ESTA cadena del árbol vivo (mismos pasos que el
 *    excluder de State, abajo) y lo busca en
 *    `ctx.neighborhood.findingsOfKind("repeated-switch")` (comparando contra
 *    el sujeto citado en el título, `REPEATED_SWITCH_SUBJECT`) y en
 *    `ctx.neighborhood.findingsOfKind("conditional-chain")` (resolviendo el
 *    archivo de cada candidato con `ctx.fileAt` y repitiendo la misma
 *    derivación — cubre dos cadenas EN EL MISMO archivo). Para un `if`/
 *    `elsif`, el campo leído es la condición COMPLETA de la primera rama
 *    (`"kind === \"circle\""`, no el sujeto limpio que da un `switch`):
 *    `discriminantSubject` recorta hasta el primer operador de comparación
 *    (genérico, regla 4) antes de comparar por igualdad.
 *    CERRADO EN OLA 10 (era "BRECHA REAL DE HOY" hasta acá): en la única
 *    llamada de `build()` (dentro de `analyzeFile`, árbol vivo),
 *    `ctx.neighborhood` sigue SIEMPRE `EMPTY_NEIGHBORHOOD` — eso no cambió,
 *    y es arquitectural (el grafo del repo no existe todavía ahí, ver
 *    `hypotheses/run.ts`). Lo que sí cambió: `build()` cachea el
 *    discriminante propio de la cadena en `refreshState` mientras el árbol
 *    está vivo, y una segunda pasada (`refresh()`, más abajo, invocada por
 *    `hypotheses/run.ts#refreshHypotheses` desde `crossAnalyze` DESPUÉS de
 *    construir el `NeighborhoodIndex` real) recorre ESTA MISMA consulta con
 *    ese discriminante cacheado en vez de `ctx.file`. Medido sobre el
 *    corpus: ver el informe de la Ola 10 para el conteo real de cuántos
 *    `conditional-chain` recuperan `repeticion-cruzada` así (queda acotado a
 *    matches contra `repeated-switch` del vecindario — el segundo bucle,
 *    contra otras `conditional-chain`, necesita `ctx.fileAt` con árbol vivo
 *    de OTRO archivo, que sigue sin existir en ningún cableado de hoy:
 *    brecha declarada, sin cambios esta ola).
 *
 * ─── excluder de "ya-aplicado"/"parcial" — Ola 10, CONTRATO-F10.md ─────────
 * CORREGIDO esta ola: el docstring de este módulo decía "por su forma NUNCA
 * puede producir `parcial` ni `ya-aplicado` — corolario estructural, no una
 * limitación oculta". Eso era consecuencia de que el grafo sólo tenía
 * `contains`/`references` cuando se escribió, no una propiedad del PATRÓN
 * (CONTRATO-F10.md §1, C2 corregido). Con `implements`/`satisfies` (interfaz
 * + implementadores), `calls` símbolo-a-símbolo y `carries`/`invokes-indirect`
 * (la tabla de despacho por VALOR) sí puede — `structuralStrategyEvidence`
 * (abajo) es esa forma, y reemplaza la heurística de AST como fuente de
 * verdad cuando hay grafo real.
 *
 * Dos rutas, cada una con su firma exacta de grafo:
 *   COMPLETA ⇒ `ya-aplicado`: una interfaz `I` con >=2 implementadores
 *   DECLARADOS en el archivo del hallazgo, compartiendo un miembro común
 *   (name,arity) — "la operación" — Y un consumidor real (`calls` directo
 *   al miembro de `I`, o un portador con `carries` fan-in >=2 hacia esos
 *   miembros + `invokes-indirect` fan-in >=1 — la tabla de despacho por
 *   grafo) Y la cadena de ESTE hallazgo vive DENTRO de uno de esos
 *   implementadores (localidad: si la cadena no vive en la Strategy ya
 *   armada, no es "esta" Strategy la que ya-aplica, es sólo una interfaz sin
 *   relación — mismo criterio de localidad que `decorator.ts#graphOverride`
 *   aplica a nivel de la clase dueña). Exclusión (de la tarea): si dos
 *   implementadores se instancian entre sí, es State, se descarta el grupo
 *   entero.
 *   PARCIAL: un portador REAL (grafo: `carries` fan-in >=2 + `invokes-indirect`
 *   fan-in >=1) existe en el archivo, pero sus invocables NO comparten firma
 *   — despacho ad hoc, funciona y no es sustituible. Sin la localidad de la
 *   ruta COMPLETA (no exige que ESTA cadena viva ahí): es una propiedad del
 *   archivo, no de la cadena puntual.
 *   Sin grafo (`graph === null`) — la regla de SIEMPRE: `ausente` (sin
 *   tabla) o `aplicado-eludido` (con el literal de AST, tal como antes de
 *   esta ola — ver `hasDispatchTable`).
 *
 * BUG 2 DE "TRES BUGS DE MECANISMO" (`RAICES.md`) — `app/models/hookable.rb:255`
 * mide el caso testigo: el MISMO ancla (`repeated-switch` sobre
 * `hookable_type`) cuelga esta hipótesis (`aplicado-eludido`, la CORRECTA)
 * EN PARALELO con `State: ausente` (la equivocada — ver `state.ts`, "SE
 * CONFUNDE CON"). No se tocó nada acá para arreglarlo: `engine.ts
 * #arbitrateRivalHypotheses`, llamado desde `hypotheses/run.ts
 * #attachHypotheses` (la única capa que ve TODAS las hipótesis de un mismo
 * `Finding` juntas), descarta la OPORTUNIDAD rival cuando esta hipótesis ya
 * CONFIRMÓ estructuralmente (`ya-aplicado`/`aplicado-eludido`) que su forma
 * existe. Ver el docstring de esa función para el mecanismo completo.
 *
 * *** BLOQUEO CERRADO POR LA OLA V (frente V1) — este párrafo describía la
 * ***  producción HASTA esa ola y quedó desactualizado sin que nadie lo
 * corrigiera acá (Ola Z, Z7, lo corrige leyendo `hypotheses/run.ts#
 * rebuildHypothesesWithGraph`/`code-analyzer.ts` de HOY, no de memoria): los
 * dos anclas de esta hipótesis son intra-function/intra-file, y la PRIMERA
 * llamada de producción a `build()` (dentro de `analyzeFile`) sigue pasando
 * `graph: null` siempre — pero desde la Ola V ya NO es la única. Después de
 * `crossAnalyze` construir el grafo del repo, `rebuildHypothesesWithGraph`
 * vuelve a llamar `build()` (no sólo `refresh()`) para cada `Finding` de
 * este tipo de ancla, con el árbol revivido Y el grafo real — activado por
 * default (`CK_ANALISIS_DOS_PASADAS`/`CK_HIPOTESIS_CON_GRAFO`, ambos `true`
 * si no se fijan). `structuralStrategyEvidence` (y, desde esta ola,
 * `externalDiscriminantTypeCheck` de más abajo) SÍ corren con evidencia real
 * en producción hoy — mismo mecanismo que `decorator.ts#graphOverride` ya
 * documenta para sus propias anclas. Medido además con
 * `scripts/measure-strategy-structural.mts`, que invoca `build()` a mano con
 * el `CodeGraph` real que `analyzeRepo` ya construyó.
 *
 * LÍMITE DECLARADO (requisito 3, no adivinado): no se verifica que los
 * implementadores retornen TIPOS DISTINTOS en el miembro común (la exclusión
 * de Factory Method a nivel de interfaz) — no existe arista de tipo de
 * retorno en el grafo de hoy (la "ranura tipada" de CONTRATO-F10.md
 * §0.4/§4.1 sigue sin construirse). La exclusión de Factory Method que sí se
 * aplica es la de siempre, `notFactoryMethodCheck` (sobre el `variant` de
 * ESTA cadena) — no una nueva a nivel de interfaz.
 *
 * LÍMITES DECLARADOS de la búsqueda de tabla: (a) es de ARCHIVO ENTERO, no
 * verifica que las claves de la tabla coincidan textualmente con las ramas de
 * ESTA cadena — puede sobre-disparar `aplicado-eludido` si hay una tabla no
 * relacionada en el mismo archivo. REVISADO en P2 (CONTRATO-F9.md §1.3): ni
 * el vecindario ni el AST vivo de `ctx` cierran esto hoy. `ctx.branches(problem)`
 * es EXACTAMENTE la API pensada para esto (`hypotheses/types.ts#BranchFacts`,
 * con `literal` = "la clave candidata de una tabla de despacho" en su propio
 * docstring) pero `hypotheses/run.ts#noBranchesYet` la deja `() => null`
 * SIEMPRE, en las dos llamadas de `attachHypotheses` (verificado por
 * lectura directa, no por prueba: no hay otro productor de `branches` en el
 * repo) — la derivación real es trabajo de F1, no de este paquete. El
 * vecindario tampoco ayuda: `Neighborhood` da OTROS `Finding` y el grafo,
 * nunca el texto de las ramas de ESTA cadena. Brecha REAL sigue abierta,
 * ya no por la razón vieja ("el Finding no expone el texto de cada rama" —
 * la razón real es que `ctx.branches` existe en el tipo pero no tiene
 * implementación todavía); (b) sólo reconoce el nodo `pair`, que cubre Ruby/Python/JS/TS/Vue
 * (confirmado por sonda) — Go (`keyed_element` en un `map_type`) y Java/C#
 * (sin literal de mapa nativo) quedan fuera, consistente con la nota de la
 * tarea ("en tres de los nueve lenguajes... Ruby/Python/JS") — no se agregó
 * vocabulario por lenguaje para Go/Java/C# a propósito (regla 4: genérico
 * antes que bueno en los lenguajes que privilegiaría el autor); (c) hasta P2,
 * `ctx.file` era SIEMPRE `null` en producción (ver `run.ts`), así que la
 * búsqueda de tabla nunca corría de verdad fuera de `strategy.test.ts`. P2
 * cableó `attachHypotheses` dentro de `analyzeFile` con el árbol vivo de cada
 * archivo — la búsqueda de tabla SÍ corre ahora en producción, no sólo en
 * el test sintético (verificado: `ctx.file`/`ctx.setsFor` llegan poblados,
 * `strategy.test.ts` §"PASO 3"). Medido sobre cobra/guava esta ronda: sigue
 * resolviendo `ausente` en los dos (ninguna tabla calificada cerca de las
 * cadenas ancladas de esos repos) — la búsqueda corre de verdad, no que haya
 * disparado `aplicado-eludido` todavía en este corpus puntual.
 *
 * ─── OLA U (frente N5) — cuatro correcciones, todas de INTENCIÓN ────────────
 * Las cuatro salieron de MEDIR el grafo real de `corpus/sqlalchemy` con
 * `scripts/n5-probe-strategy-registry.mts` (el caso que `PLAN-INTENCIONES.md`
 * §7 cita: `LoaderStrategy` + 11 subclases con `create_row_processor`,
 * seleccionadas por el registro `strategy_for`), no de releer el código.
 *
 *  A. `PROTOCOL_EDGE_KINDS` — la familia se arma con protocolo DECLARADO
 *     (`extends`/`implements`), nunca con `satisfies`. Antes era
 *     `{implements, satisfies}`: en sqlalchemy eso (a) no veía NINGUNA familia
 *     real, porque ahí hay 1.927 `extends` y 0 `implements`, y (b) fabricaba
 *     familias falsas, agrupando `_NoLoader` con nueve HERMANOS suyos como si
 *     fueran sus implementadores — la inferencia por coincidencia de miembros
 *     que `deriveSatisfiesEdges` hace y que esta ola tiene prohibida.
 *     `satisfies` quedó como CORROBORACIÓN (nota de riesgo), nunca como
 *     criterio de agrupación.
 *  B. Localidad de la familia: antes exigía que TODOS los hermanos estuvieran
 *     declarados en el archivo del hallazgo — eso no verifica una intención,
 *     verifica un estilo de organización de archivos. Ahora basta con que la
 *     familia esté ANCLADA acá (protocolo o >=1 hermano). Medido: 151 de 242
 *     familias de sqlalchemy (62 %) tienen hermanos en otro archivo. A cambio,
 *     la localidad de la CADENA se endureció: el miembro que la aloja tiene
 *     que estar declarado en este archivo, no sólo llamarse igual.
 *  C. `signatureIsKnown` — la ruta PARCIAL ("la tabla despacha entre cosas no
 *     sustituibles") ya no cuenta como "firmas distintas" a dos literales
 *     ANÓNIMOS, cuyos nodos sintéticos (`<anon@n>`, sin aridad) nunca coinciden
 *     entre sí por construcción. Medido: los 662 portadores con >=2 destinos de
 *     sqlalchemy se declaraban heterogéneos, casi todos por este artefacto.
 *  D. `findChainNode` ubica LA cadena que el hallazgo reporta. `repeated-switch`
 *     reporta el rango del switch mismo; antes se evaluaba siempre "el de más
 *     arms de la función encerrante", así que en una función con dos switches
 *     los tres `required` de intención juzgaban el switch equivocado.
 *
 * LO QUE ESTA OLA MIDIÓ Y NO ARREGLÓ (declarado, con el número):
 *  - La ruta COMPLETA pide un CONSUMIDOR (`calls` al miembro del protocolo).
 *    Sobre sqlalchemy, de 242 familias con miembro común, CERO tienen esa
 *    arista — el receptor tipado no resuelve (`graph/resolve.ts#syntacticRoleStage`,
 *    hueco #3 de `PLAN-INTENCIONES.md`). Sin eso, la forma COMPLETA sigue sin
 *    poder confirmarse en Python por más correcta que sea la consulta de acá.
 *  - El REGISTRO por decorador (`@X.strategy_for(...)` sobre la declaración de
 *    la clase) no deja NINGUNA arista en el grafo: verificado volcando los
 *    nodos de `_JoinedLoader`/`_LazyLoader`/`_DoNothingLoader` — sus aristas
 *    salientes son `contains`/`references`/`extends`, jamás una referencia al
 *    registrador. Por eso los `LoaderStrategy` concretos aparecen como
 *    `unused-symbol`. Sin esa arista, "seleccionado por registro" no es
 *    observable, y por eso esta ola NO agregó una vía de anclaje por registro:
 *    habría sido una consulta contra un hecho que el grafo no tiene.
 *
 * ─── ceiling: "media", no "alta" ────────────────────────────────────────────
 * Motivo explícito (requisito de la tarea: "si tu regla no puede
 * distinguirlas, el techo de confianza baja y se dice por qué"): originado
 * cuando `ctx.file` era SIEMPRE `null` en producción y ni el excluder de
 * State ni el de tabla de despacho podían correr de verdad. P2 arregló el
 * cableado (`ctx.file` ya llega poblado — ver arriba), pero bajar el techo
 * fue una decisión de esta ola anterior sobre datos que todavía no existían;
 * subirlo ahora sería recalibrar a ciegas, sin corpus externo de por medio —
 * fuera de esta tarea (K2, declarado abajo). `provisional: true` (K2):
 * subir a "alta" es un cambio propio, medido contra el corpus externo, no de
 * esta tarea.
 *
 * ─── forma en lenguajes sin clases ──────────────────────────────────────────
 * `conditional-chain`/`repeated-switch` son la MISMA forma sintáctica if/elsif
 * o switch/case/when/match en los 9 lenguajes — no requieren clases, así que
 * esta hipótesis está pareja en los 9. La brecha real no es de FORMA sino de
 * EVIDENCIA disponible (arriba): el `Finding` no expone branch-level detail.
 */
import type { DerivedNodeSets } from "../code-grammar.js";
import { confidentEdges } from "../detect/inter-file/confident-edges.js";
import { deriveAnchor } from "../detect/ids.js";
import { walkTree } from "../detect/tree-walk.js";
import type { AstNode, FileUnit, Finding, FunctionUnit, RoleLocation } from "../detect/types.js";
import { memberSignatures, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type GraphIndex } from "../graph/types.js";
import {
  build,
  refreshDiscriminators,
  toPatternHypothesis,
  type AppliedStateResult,
  type Check,
  type HypothesisSpec,
} from "./engine.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisDraft } from "./types.js";

/**
 * [provisional] — ver docstring del módulo. Ola 10: alineado con el piso
 * declarado de su ancla (`conditional-chain.ts#chainLength`, `pisoDeclarado(5,…)`)
 * — `threshold-alignment.test.ts` rompe si vuelven a divergir.
 */
const STRATEGY_MIN_BRANCHES = 5;
const STRATEGY_MIN_REPEATS = 2;
const STRATEGY_STRONG_SIGNAL = 4;

type Problem = Finding;
type Graph = CodeGraph | null;

function triggerValue(problem: Problem, label: string): number {
  return problem.trigger.find((t) => t.label === label)?.value ?? problem.trigger[0].value;
}

/** La función cuyo rango de líneas contiene la primera location del problema — la más angosta si hay anidamiento. */
function findEnclosingFunction(file: FileUnit, problem: Problem): FunctionUnit | null {
  const loc = problem.locations[0];
  let best: FunctionUnit | null = null;
  for (const fn of file.functions) {
    if (fn.startLine <= loc.startLine && loc.endLine <= fn.endLine) {
      if (!best || fn.endLine - fn.startLine < best.endLine - best.startLine) best = fn;
    }
  }
  return best;
}

interface ChainCandidate {
  readonly node: AstNode;
  readonly rungCount: number;
}

/**
 * TODOS los nodos-raíz de cadena (if-ladder o switch) dentro de `root`, con
 * su propio conteo de peldaños/arms (`ifLadderBranchActions`/
 * `switchArmActions`, más abajo en el archivo — `function`, hoisted, sin
 * problema de orden). Hace falta la lista completa, no "el primero", porque
 * el `Finding` de `conditional-chain` reporta el rango de la FUNCIÓN
 * encerrante (`conditional-chain.ts` usa `fn.startLine`/`fn.endLine`), NO el
 * de la cadena específica — cuando una función tiene más de una cadena
 * independiente (un guard de una rama de un solo peldaño, la cadena real de
 * otra), "el primer nodo encontrado en orden de documento" puede no ser el
 * que el `Finding` mide. BUG REAL encontrado escribiendo
 * `strategy.test.ts`/verificando sobre `code-grammar.ts#deriveNodeSets`
 * (Ola D): `visit()` tiene un `if (node.isNamed) { ... }` de UN peldaño
 * ENVOLVIENDO la cadena real de 6 peldaños — la versión vieja de esta
 * función (un solo `walkTree` que paraba en el primer match) devolvía
 * SIEMPRE el guard externo, nunca la cadena que el `Finding` reporta.
 * No se poda la recursión al entrar a un candidato (a diferencia de
 * `switchArmActions`, que sí lo hace para SUS arms): un elsif/if anidado
 * vuelve a aparecer como candidato PARCIAL (menos peldaños desde ahí), pero
 * pierde contra la cadena completa por conteo — nunca gana por empate
 * porque `rungCount` de un sufijo es siempre `<` el de la cadena entera.
 */
function chainCandidates(root: AstNode, sets: DerivedNodeSets): ChainCandidate[] {
  const out: ChainCandidate[] = [];
  const visit = (node: AstNode): void => {
    if (node.isNamed) {
      if (sets.switchContainerNodes.has(node.type)) {
        out.push({ node, rungCount: switchArmActions(node).length });
      } else if (sets.chainNodes.has(node.type) && node.childForFieldName("condition")) {
        out.push({ node, rungCount: ifLadderBranchActions(node).length });
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

/**
 * La cadena de condicionales o el contenedor switch que el `Finding` REALMENTE
 * mide, dentro de `node`. `null` si no hay ninguna.
 *
 * INTENCIÓN QUE VERIFICA (Ola U, N5): *"las ramas cuyo comportamiento vamos a
 * juzgar son las ramas de LA cadena de la que habla este hallazgo"*. Todos los
 * `required` de intención de esta hipótesis (`ramas-invocan-comportamiento-
 * distinto`, `un-solo-discriminante`, el excluder de State) se evalúan sobre la
 * cadena que esta función devuelve — si devuelve OTRA cadena de la misma
 * función, los tres juzgan código que el hallazgo no reportó.
 *
 * Dos anclas, dos formas de ubicarla, porque los dos detectores reportan cosas
 * distintas en `locations[0]`:
 *   - `repeated-switch` reporta el rango del SWITCH mismo
 *     (`detect/intra-file/repeated-switch.ts`: `startLine: o.line`, la línea de
 *     inicio del nodo switch) ⇒ se elige el candidato que EMPIEZA en esa línea.
 *     Antes se elegía siempre "el de más arms de la función encerrante", que en
 *     una función con varios switches es, por construcción, el switch
 *     equivocado siempre que el reportado no sea el más grande.
 *   - `conditional-chain` reporta el rango de la FUNCIÓN encerrante
 *     (`conditional-chain.ts` usa `fn.startLine`/`fn.endLine`), así que no hay
 *     línea propia que emparejar ⇒ se cae al criterio de siempre, el de MÁS
 *     peldaños (ver `chainCandidates` para por qué "el primero encontrado" no
 *     alcanza), sin ningún cambio de comportamiento.
 */
function findChainNode(node: AstNode, sets: DerivedNodeSets, reportedStartLine?: number): AstNode | null {
  const candidates = chainCandidates(node, sets);
  if (candidates.length === 0) return null;
  if (reportedStartLine !== undefined) {
    const exact = candidates.find((c) => c.node.startPosition.row + 1 === reportedStartLine);
    if (exact) return exact.node;
  }
  let best = candidates[0]!;
  for (const c of candidates.slice(1)) {
    if (c.rungCount > best.rungCount) best = c;
  }
  return best.node;
}

/** La línea que el ancla reporta como inicio de LA cadena, cuando el detector reporta la cadena y no la función que la contiene. Ver `findChainNode`. */
function reportedChainStartLine(problem: Problem): number | undefined {
  // `type-switch` (Ola X) reporta, igual que `repeated-switch`, el nodo de la
  // DECISIÓN y no la función que la contiene — así que su línea ubica la
  // escalera/switch exacto y `findChainNode` no tiene que adivinar cuál de
  // las cadenas de la función es.
  return problem.kind === "repeated-switch" || problem.kind === TYPE_SWITCH_ANCHOR ? problem.locations[0].startLine : undefined;
}

/** Texto del discriminante/condición — mismos campos genéricos que `repeated-switch.ts#switchSubjectText`. */
const DISCRIMINANT_FIELDS = ["value", "subject", "condition"];
function chainDiscriminantText(node: AstNode): string | null {
  for (const field of DISCRIMINANT_FIELDS) {
    const child = node.childForFieldName(field) as AstNode | null;
    if (child) return child.text.replace(/[()]/g, "").trim();
  }
  return null;
}

/** Mismo vocabulario que `pattern-behavioral.ts#SELF_PREFIXES` — no reimportado
 *  a propósito (ese archivo se apaga en S3; esta hipótesis no depende de él). */
const SELF_PREFIXES = ["self.", "this.", "@"];
function isSelfFieldDiscriminant(text: string, fnNode: AstNode): boolean {
  if (SELF_PREFIXES.some((p) => text.startsWith(p))) return true;
  const receiver = fnNode.childForFieldName("receiver") as AstNode | null;
  if (!receiver) return false;
  const name = ((receiver.childForFieldName("name") as AstNode | null)?.text ?? receiver.text).trim();
  return name.length > 0 && text.startsWith(`${name}.`);
}

/** Un identificador a secas — sin punto, sin paréntesis, sin operadores: la forma en la que un lenguaje con `this` IMPLÍCITO (C#, Java, C++) escribe el acceso a un campo propio. */
const BARE_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * INTENCIÓN QUE VERIFICA (Ola U, N5): *"el discriminante llega de AFUERA
 * (parámetro, valor calculado) y no es un campo que el propio objeto muta con
 * el tiempo"* — la frontera exacta entre Strategy y State (`state.ts`, "SE
 * CONFUNDE CON").
 *
 * `isSelfFieldDiscriminant` (arriba) sólo reconoce la auto-referencia
 * EXPLÍCITA (`self.`/`this.`/`@`/receptor de Go). En C#, Java y C++ el `this`
 * es implícito: `switch (_currentState)` es exactamente lo mismo que
 * `switch (this._currentState)` y el texto no lo dice. Verificado a mano sobre
 * los hallazgos que esta ola destrabó en `corpus/newtonsoft-json`:
 * `Src/Newtonsoft.Json/JsonTextReader.cs:421` (`switch (_currentState)`, el
 * caso canónico de State que `PLAN-INTENCIONES.md` §3 documenta) y
 * `Src/Newtonsoft.Json/Bson/BsonReader.cs:192` (`switch (_bsonReaderState)`)
 * son State, no Strategy, y el excluder de texto los dejaba pasar.
 *
 * Criterio estructural, sin léxico: un nombre A SECAS que aparece dentro del
 * tipo contenedor PERO FUERA de todo cuerpo function-like es, por posición, un
 * miembro declarado del tipo — no un parámetro ni un local. Se busca en el
 * nodo class-like MÁS ANGOSTO que contiene la cadena.
 */
function declaresMemberNamed(root: AstNode, sets: DerivedNodeSets, chain: AstNode, name: string): boolean {
  const within = (n: AstNode): boolean =>
    n.startPosition.row <= chain.startPosition.row && chain.endPosition.row <= n.endPosition.row;
  let owner: AstNode | null = null;
  walkTree(root, (raw) => {
    const node = raw as AstNode;
    if (!node.isNamed || !sets.classNodes.has(node.type) || !within(node)) return;
    const prev: AstNode | null = owner;
    if (!prev || node.endPosition.row - node.startPosition.row < prev.endPosition.row - prev.startPosition.row) owner = node;
  });
  const ownerNode: AstNode | null = owner;
  if (!ownerNode) return false;
  // `repeated-switch` cita el discriminante YA EN MINÚSCULAS en su título
  // (`detect/intra-file/repeated-switch.ts` agrupa por `subject.toLowerCase()`
  // y titula con esa clave), así que la comparación tiene que ser
  // insensible a mayúsculas o nunca emparejaría con el nombre real del
  // miembro en el árbol. Mismo criterio de normalización que
  // `normalizeDiscriminant`, ya usado en este archivo para el mismo dato.
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

/** >=2 entradas `pair` (key+value) cuyo valor es función-como o un identificador con mayúscula inicial — heurística de "tabla de despacho". Ver límites en el docstring del módulo. */
function hasDispatchTable(root: AstNode, sets: DerivedNodeSets): boolean {
  let found = false;
  walkTree(root, (node) => {
    if (found || !node.isNamed) return;
    let callableEntries = 0;
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i) as AstNode | null;
      if (!child?.isNamed || child.type !== "pair") continue;
      const key = child.childForFieldName("key");
      const value = child.childForFieldName("value") as AstNode | null;
      if (!key || !value) continue;
      if (sets.functionNodes.has(value.type) || /^[A-Z]/.test(value.text.trim())) callableEntries++;
    }
    if (callableEntries >= 2) found = true;
  });
  return found;
}

const notFactoryMethodCheck: Check<Problem, Graph> = {
  id: "no-construye-tipos",
  describe: "ninguna rama de la cadena construye un tipo distinto (si TODAS construyen, es Factory Method, no Strategy)",
  run: (problem) => {
    if (problem.kind === TYPE_SWITCH_ANCHOR) {
      // BRECHA DECLARADA, no una aprobación silenciosa: el ancla `type-switch`
      // mide QUÉ decide la escalera (el tipo), no qué HACE cada rama, así que
      // no puede decir si todas construyen un tipo distinto. La frontera con
      // Factory Method queda en `toConfirm`, igual que para `repeated-switch`.
      return {
        holds: true,
        evidence:
          "el ancla 'type-switch' no expone si las ramas construyen tipos: no se puede aplicar esta exclusión acá (brecha declarada). La frontera con Factory Method queda en la pregunta a confirmar.",
      };
    }
    if (problem.kind !== "conditional-chain") {
      // NO invertido — decisión medida (ola "required no permisivo"), ver el
      // docstring del módulo, punto 1. Sobre los 174 veredictos a mano, los
      // 5 casos de Strategy anclados en `repeated-switch` son 4 falsos (por
      // otra causa: ninguno construye tipos por rama) y 1 verdadero
      // (`hookable.rb:255`, `aplicado-eludido`, del que depende
      // `engine.ts#arbitrateRivalHypotheses` para suprimir el falso positivo
      // rival de State). Invertir a `false` apaga TODO `repeated-switch`
      // para Strategy sin recuperar ningún falso — costo medido, no ganancia.
      return {
        holds: true,
        evidence:
          "el ancla 'repeated-switch' no expone si las ramas construyen tipos: no se puede aplicar esta exclusión acá (brecha declarada). Medido, no asumido: sobre los 174 veredictos a mano (tests/golden/precision), ningún falso positivo de Strategy en repeated-switch fue por construcción de tipos (0/4), e invertir este check destruiría el único verdadero (hookable.rb:255) sin recuperar nada.",
      };
    }
    const instantiates = problem.variant === "instantiates";
    return {
      holds: !instantiates,
      evidence: instantiates
        ? `la cadena instancia un tipo distinto por rama (variant="instantiates"): eso es Factory Method, no Strategy.`
        : `variant="${problem.variant ?? "ladder"}": el detector no marcó esta cadena como "instantiates" (que sólo dispara cuando TODAS las ramas construyen un tipo). Construcción PARCIAL (alguna rama sí, otras no) no se distingue con este ancla: brecha declarada.`,
    };
  },
};

/** El título de `repeated-switch` ya cita el discriminante entre comillas
 *  (`"${subject}" se decide con switch en...`, ver `repeated-switch.ts`) —
 *  mismo truco que la hipótesis vecina `state.ts#buildProblem` usa para SU
 *  propio excluder simétrico (discriminante SÍ es campo propio ⇒ State). Acá
 *  es al revés: discriminante NO es campo propio ⇒ sigue siendo candidato a
 *  Strategy. A diferencia de la rama `conditional-chain` (abajo), ESTA no
 *  necesita `ctx.file`: funciona en producción HOY, con el cableado actual. */
const REPEATED_SWITCH_SUBJECT = /^"([^"]+)"/;

/* ────────────────────────────────────────────────────────────────────────
 * TERCERA ANCLA — `type-switch` (Ola X, frente B7)
 *
 * `detect/intra-function/type-switch.ts` emite el DESPACHO POR TIPO: ≥2 ramas
 * de una misma decisión preguntan de qué tipo es el MISMO objeto. Es el
 * disparador canónico de "Replace Conditional with Polymorphism", o sea de
 * Strategy — y cubre el hueco exacto que las otras dos anclas dejan:
 * `conditional-chain` exige 5 peldaños (un `if (x instanceof A) … else if
 * (x instanceof B)` de DOS ramas no llega) y `repeated-switch` exige que el
 * mismo sujeto se decida en ≥2 lugares del archivo.
 *
 * TODO lo que se agrega por esta ancla está detrás de un
 * `problem.kind === TYPE_SWITCH_ANCHOR`, así que el comportamiento sobre las
 * dos anclas viejas es IDÉNTICO por construcción — verificable leyendo, y
 * verificado midiendo (informe `ola-x/informes/B7.md`).
 * ──────────────────────────────────────────────────────────────────────── */
const TYPE_SWITCH_ANCHOR = "type-switch";
/** El detector escribe el sujeto entre backticks en el título (`… decide por el TIPO de \`x\` en N ramas`) — mismo truco que `REPEATED_SWITCH_SUBJECT` sobre el título de `repeated-switch`. */
const TYPE_SWITCH_SUBJECT = /decide por el TIPO de `([^`]+)`/;
/** Piso propio: el detector ya exige ≥2 ramas que deciden por tipos DISTINTOS (`presencia`), y ESA es la definición de despacho. No es un número nuevo elegido a mano: es el umbral del ancla, leído acá. */
const TYPE_SWITCH_MIN_BRANCHES = 2;

function notStateCheck(ctx: HypothesisContext): Check<Problem, Graph> {
  return {
    id: "no-es-campo-propio",
    describe: "el discriminante no es un campo propio de la instancia (eso sería State, no Strategy)",
    run: (problem) => {
      if (problem.kind === "repeated-switch" || problem.kind === TYPE_SWITCH_ANCHOR) {
        const subject =
          problem.kind === TYPE_SWITCH_ANCHOR
            ? (TYPE_SWITCH_SUBJECT.exec(problem.title)?.[1] ?? null)
            : (REPEATED_SWITCH_SUBJECT.exec(problem.title)?.[1] ?? null);
        if (!subject) {
          // INVERTIDO (ola "required no permisivo"): antes `holds: true`
          // ("se asume que no es campo propio"). No poder extraer el
          // discriminante no demuestra que NO es un campo propio de State —
          // es simplemente no saber. No demostrado, no cumplido.
          return { holds: false, evidence: "no se pudo extraer el discriminante del título del hallazgo: no se puede confirmar que no sea un campo propio (State), no demostrado." };
        }
        if (SELF_PREFIXES.some((p) => subject.startsWith(p))) {
          return { holds: false, evidence: `"${subject}" tiene forma de campo propio (self./this./@): eso es State (regla 16), no Strategy.` };
        }
        // Ola U (N5) — `this` IMPLÍCITO: en C#/Java/C++ un campo propio se
        // escribe a secas y el texto del título no lo distingue de un
        // parámetro. Ver `declaresMemberNamed`.
        if (ctx.file && BARE_IDENTIFIER.test(subject)) {
          const sets = ctx.setsFor(ctx.file.language);
          const fn = findEnclosingFunction(ctx.file, problem);
          const chainNode = fn ? findChainNode(fn.node, sets, reportedChainStartLine(problem)) : null;
          if (chainNode && declaresMemberNamed(ctx.file.root, sets, chainNode, subject)) {
            return {
              holds: false,
              evidence: `"${subject}" está declarado como miembro del tipo que contiene esta cadena (auto-referencia implícita, la forma de C#/Java/C++): es un campo propio que el objeto muta — eso es State (regla 16), no Strategy.`,
            };
          }
        }
        return { holds: true, evidence: `"${subject}" no tiene forma de campo propio (ni prefijo de auto-referencia ni declaración de miembro en el tipo contenedor) — compatible con un parámetro o un valor calculado (Strategy).` };
      }
      if (!ctx.file) {
        // INVERTIDO — CASO TESTIGO de la ola: antes `holds: true` ("se
        // asume, SIN CONFIRMAR"), exactamente el defecto que produjo la
        // Strategy sin evidencia sobre `XmlNodeConverter.cs`
        // (newtonsoft-json). Sin árbol no hay forma de confirmar que el
        // discriminante NO es un campo propio — required no demostrado.
        return {
          holds: false,
          evidence: "árbol no disponible (ctx.file es null en el cableado actual de crossAnalyze, ver hypotheses/run.ts): no se puede confirmar que el discriminante no sea un campo propio, no demostrado.",
        };
      }
      const fn = findEnclosingFunction(ctx.file, problem);
      if (!fn) {
        // INVERTIDO, mismo criterio.
        return { holds: false, evidence: "no se encontró, en el árbol vivo, la función que contiene esta cadena: no se puede confirmar que el discriminante no sea un campo propio, no demostrado." };
      }
      const sets = ctx.setsFor(ctx.file.language);
      const chainNode = findChainNode(fn.node, sets, reportedChainStartLine(problem));
      if (!chainNode) {
        // INVERTIDO, mismo criterio.
        return { holds: false, evidence: "no se encontró el nodo de la cadena dentro de la función: no se puede confirmar que el discriminante no sea un campo propio, no demostrado." };
      }
      const text = chainDiscriminantText(chainNode);
      if (!text) {
        // INVERTIDO, mismo criterio.
        return { holds: false, evidence: "no se pudo leer el texto del discriminante: no se puede confirmar que no sea un campo propio, no demostrado." };
      }
      if (isSelfFieldDiscriminant(text, fn.node)) {
        return { holds: false, evidence: `el discriminante "${text}" es un campo propio de la unidad (self./this./@/receptor): eso es State (regla 16), no Strategy.` };
      }
      // Ola U (N5) — mismo criterio que la rama de `repeated-switch`: `this`
      // implícito. Se compara el SUJETO ya recortado (`discriminantSubject`),
      // porque para un `if` el texto es la condición entera.
      const subject = discriminantSubject(text);
      if (BARE_IDENTIFIER.test(subject) && declaresMemberNamed(ctx.file.root, sets, chainNode, subject)) {
        return {
          holds: false,
          evidence: `el discriminante "${subject}" está declarado como miembro del tipo que contiene esta cadena (auto-referencia implícita, la forma de C#/Java/C++): eso es State (regla 16), no Strategy.`,
        };
      }
      return { holds: true, evidence: `discriminante "${text}" no muestra el prefijo de auto-referencia que distingue State, ni está declarado como miembro del tipo contenedor.` };
    },
  };
}

const enoughSignalCheck: Check<Problem, Graph> = {
  id: "suficiente-senal",
  describe: `al menos ${STRATEGY_MIN_BRANCHES} ramas encadenadas (conditional-chain) o ${STRATEGY_MIN_REPEATS} apariciones del mismo discriminante (repeated-switch)`,
  run: (problem) => {
    if (problem.kind === "repeated-switch") {
      const value = triggerValue(problem, "apariciones");
      return { holds: value >= STRATEGY_MIN_REPEATS, evidence: `${value} apariciones del mismo discriminante (mínimo ${STRATEGY_MIN_REPEATS}, provisional).` };
    }
    if (problem.kind === TYPE_SWITCH_ANCHOR) {
      const value = triggerValue(problem, "ramas que deciden por tipo");
      return {
        holds: value >= TYPE_SWITCH_MIN_BRANCHES,
        evidence: `${value} ramas que deciden por el tipo del mismo sujeto (mínimo ${TYPE_SWITCH_MIN_BRANCHES}: es el umbral del propio ancla — una sola prueba de tipo es una guarda, dos ya son un despacho).`,
      };
    }
    const value = problem.trigger[0].value;
    return { holds: value >= STRATEGY_MIN_BRANCHES, evidence: `${value} ramas encadenadas (mínimo ${STRATEGY_MIN_BRANCHES}, provisional).` };
  },
};

const strongSignalDiscriminator: Check<Problem, Graph> = {
  id: "cuatro-o-mas",
  describe: `${STRATEGY_STRONG_SIGNAL} o más ramas/repeticiones — más fuerte que el piso`,
  run: (problem) => {
    const label = problem.kind === "repeated-switch" ? "apariciones" : undefined;
    const value = label ? triggerValue(problem, label) : problem.trigger[0].value;
    return { holds: value >= STRATEGY_STRONG_SIGNAL, evidence: `${value} (>= ${STRATEGY_STRONG_SIGNAL} sube un peldaño).` };
  },
};

/** Mismo criterio de agrupación que `repeated-switch.ts#bySubject` (`.toLowerCase()`), para que "mismo discriminante" signifique lo mismo en los dos lugares. */
function normalizeDiscriminant(text: string): string {
  return text.trim().toLowerCase();
}

/** Operadores de comparación genéricos (no vocabulario de un lenguaje — regla 4) que separan un SUJETO de lo que se compara contra él. */
const COMPARISON_OPERATOR = /^(.*?)\s*(===|!==|==|!=|>=|<=|>|<)\s*/;

/**
 * `chainDiscriminantText` (arriba) lee el campo `condition`/`value`/`subject`
 * del nodo de cadena — para un `switch`/`match` eso YA es el sujeto limpio
 * (`"kind"`), pero para un `if`/`elsif` es la condición COMPLETA de la
 * PRIMERA rama (`"kind === \"circle\""`, ver `notStateCheck`, que sólo
 * necesita `startsWith`). Este check compara por IGUALDAD contra el sujeto
 * ya limpio de un `repeated-switch` (`REPEATED_SWITCH_SUBJECT`), así que
 * recorta hasta el primer operador de comparación cuando hay uno — sin
 * operador, el texto ya es el sujeto (caso switch), se devuelve tal cual.
 */
function discriminantSubject(text: string): string {
  return (COMPARISON_OPERATOR.exec(text)?.[1] ?? text).trim();
}

/** El discriminante de la cadena que ancla `problem`, leído del árbol vivo `file` — mismos tres pasos que el excluder de State usa para el `conditional-chain` de ESTE check (encontrar la función encerrante, encontrar el nodo de cadena, leer el campo del discriminante). A diferencia de `notStateCheck`, sin evidencia por paso: acá sólo importa el texto (o `null`), la evidencia la arma el caller. Sirve tanto para el `problem` propio como para OTRO `Finding` del vecindario que viva en `file` (mismo archivo). */
function chainDiscriminantOf(ctx: HypothesisContext, file: FileUnit, problem: Problem): string | null {
  const fn = findEnclosingFunction(file, problem);
  if (!fn) return null;
  const sets = ctx.setsFor(file.language);
  const chainNode = findChainNode(fn.node, sets, reportedChainStartLine(problem));
  if (!chainNode) return null;
  return chainDiscriminantText(chainNode);
}

/**
 * Ola 10 — CERRADA la brecha P2/P3 que el docstring del módulo describía
 * ("vecindario vacío en producción de HOY"). Dos caminos para el discriminante
 * PROPIO de esta cadena, según de dónde se llame:
 *   - `build()` (árbol vivo, `analyzeFile`): `ownOverride` ausente ⇒ se deriva
 *     de `ctx.file` como siempre (comportamiento IDÉNTICO a antes de esta ola).
 *   - `refresh()` (Ola 10, `crossAnalyze`, sin árbol — ver
 *     `hypotheses/run.ts#refreshHypotheses`): `ownOverride` es el texto que
 *     `build()` ya cacheó en `refreshState` cuando el árbol SÍ estaba vivo
 *     (`PatternHypothesis.refreshState`, más abajo en `build()`). Nunca se
 *     re-deriva del árbol acá porque no hay árbol que leer — el punto entero
 *     de `refreshState` es evitar necesitarlo.
 * En los dos casos, una vez resuelto el discriminante propio, la búsqueda en
 * `ctx.neighborhood` es la MISMA — hoy real en ambos casos (`build()` per-archivo
 * recibe `EMPTY_NEIGHBORHOOD`, así que ahí nunca encuentra nada; `refresh()`
 * recibe el índice real armado en `crossAnalyze`, así que ahí sí puede).
 */
function crossRepetitionDiscriminator(ctx: HypothesisContext, ownOverride?: string | null): Check<Problem, Graph> {
  return {
    id: "repeticion-cruzada",
    describe: "el mismo discriminante se decide en más de un lugar — la señal que la regla vieja usaba para saltar a confianza alta",
    run: (problem) => {
      if (problem.kind === "repeated-switch") {
        return { holds: true, evidence: `este hallazgo ES la repetición cruzada: "${problem.title}".` };
      }

      let ownDiscriminant: string | null;
      if (ownOverride !== undefined) {
        // Camino de `refresh()` (Ola 10): reusa el texto cacheado en `build()`, sin árbol.
        ownDiscriminant = ownOverride;
      } else if (!ctx.file) {
        return {
          holds: false,
          evidence: "árbol no disponible: no se pudo derivar el discriminante propio de esta cadena para buscar repetición cruzada en el vecindario.",
        };
      } else {
        ownDiscriminant = chainDiscriminantOf(ctx, ctx.file, problem);
      }
      if (!ownDiscriminant) {
        return {
          holds: false,
          evidence: "no se pudo leer el texto del discriminante de esta cadena: no hay con qué buscar repetición cruzada en el vecindario.",
        };
      }
      const own = normalizeDiscriminant(discriminantSubject(ownDiscriminant));

      for (const other of ctx.neighborhood.findingsOfKind("repeated-switch")) {
        const subject = REPEATED_SWITCH_SUBJECT.exec(other.title)?.[1];
        if (subject && normalizeDiscriminant(subject) === own) {
          return {
            holds: true,
            evidence: `el vecindario confirma repetición cruzada: "${other.title}" (${other.locations[0].file}) decide el mismo discriminante "${ownDiscriminant}" por switch.`,
          };
        }
      }
      for (const other of ctx.neighborhood.findingsOfKind("conditional-chain")) {
        const otherFile = ctx.fileAt(other.locations[0].file);
        if (!otherFile) continue; // hoy: siempre null salvo que sea EL MISMO archivo que `ctx.file` — ver docstring de `HypothesisContext.fileAt`. En `refresh()` (`ctx.file` ya null) esto nunca resuelve: brecha declarada, sin cambios esta ola — sólo la búsqueda contra `repeated-switch` (arriba) se benefició del vecindario real.
        const otherDiscriminant = chainDiscriminantOf(ctx, otherFile, other);
        if (otherDiscriminant && normalizeDiscriminant(discriminantSubject(otherDiscriminant)) === own) {
          return {
            holds: true,
            evidence: `el vecindario confirma repetición cruzada: otra cadena en "${otherFile.path}:${other.locations[0].startLine}-${other.locations[0].endLine}" decide el mismo discriminante "${ownDiscriminant}".`,
          };
        }
      }

      return {
        holds: false,
        evidence: `discriminante "${ownDiscriminant}" no aparece en ningún 'repeated-switch' ni otra 'conditional-chain' visible por ctx.neighborhood.findingsOfKind.`,
      };
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * Ola D — `distinctBehaviorCheck` / `sameDiscriminantSubjectCheck`: ver el
 * docstring del módulo (requisitos 4 y 5) para el diagnóstico completo y las
 * filas concretas que motivan cada pieza. Todo lo de acá abajo es AST puro
 * (`ctx.file`), nunca toca `graph` — mismo perímetro que `notStateCheck`.
 * ──────────────────────────────────────────────────────────────────────── */

/** Vocabulario de GRAMÁTICA (nunca de framework — regla 4) para "esto es una
 *  invocación": extiende `chain-of-responsibility.ts:183`
 *  (`call`/`call_expression`/`method_invocation`) y `proxy.ts:340`
 *  (`/call/i`, confirmado por sonda contra Go) para cubrir TAMBIÉN
 *  `invocation_expression` (C#) con el mismo criterio de palabra-límite que
 *  `code-grammar.ts#SWITCH_WORD`/`LOOP_WORD`. */
const CALL_WORD = /(^|_)(call|invocation)(_|$)/;
/** Mismos tres campos que `graph/references.ts` documenta como universales para el nombre de una invocación. */
const CALLEE_FIELDS = ["method", "function", "name"] as const;
/** Mismos dos campos, mismo orden, que `code-grammar.ts:388` ya prueba para "la acción de una rama". */
const ACTION_FIELDS = ["consequence", "body"] as const;
/** Duplicado a propósito de `state.ts#SWITCH_WORD`/`SWITCH_ARM_EXCLUDE`/`SWITCH_WRAPPER_EXCLUDE` — mismo precedente de duplicación que ese módulo ya declara para `code-grammar.ts`. Prefijo `BRANCH_` para no colisionar con el `SWITCH_WORD` del propio `state.ts` si algún día se importa. */
const BRANCH_SWITCH_WORD = /(^|_)(switch|case|when|match|select)(_|$)/;
const BRANCH_SWITCH_ARM_EXCLUDE = /(pattern|else|default)/;
const BRANCH_SWITCH_WRAPPER_EXCLUDE = /(^|_)(body|block|label)$/;

function branchAction(node: AstNode): AstNode | null {
  for (const f of ACTION_FIELDS) {
    const child = node.childForFieldName(f) as AstNode | null;
    if (child) return child;
  }
  return null;
}

/**
 * El campo `alternative` de un `if` NO siempre ES el peldaño siguiente
 * directamente: Ruby's `elsif` SÍ lo es (mismos campos `condition`/
 * `consequence`/`alternative` que el `if` raíz — confirmado por sonda), pero
 * JS/TS/Vue/Java/C#/Go envuelven el `if` anidado del "else if" dentro de un
 * nodo contenedor SIN campos propios (`else_clause` en JS/TS, análogo en los
 * demás) — el `if` anidado es un hijo NOMBRADO posicional, sin field name
 * (confirmado por sonda contra `tree-sitter-javascript.wasm`: `else_clause`
 * expone `childForFieldName("condition")` como `null`, y su `if_statement`
 * anidado es `child(1)`, sin field). Sin desenvolver esto, un `else if`
 * multi-peldaño en esos 6 lenguajes se leía como UN solo peldaño seguido de
 * un `else` — bug real encontrado escribiendo `strategy.test.ts` para esta
 * misma ola, no una limitación teórica. Desenvuelve UN solo nivel: un
 * `else if` real nunca anida un contenedor dentro de otro contenedor sin un
 * `if` de por medio.
 */
function unwrapAlternative(node: AstNode): AstNode {
  if (node.childForFieldName("condition")) return node; // Ruby: `elsif` ya es el peldaño.
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i) as AstNode | null;
    if (child?.isNamed && child.childForFieldName("condition")) return child; // JS/TS/Java/C#/Go: el `if` anidado dentro del contenedor.
  }
  return node; // `else` terminal (bloque sin condición): se deja tal cual, el caller lo detecta y para.
}

/** Peldaños de una escalera if/elsif — el `else` final (sin campo `condition`) queda FUERA a propósito: es el catch-all, no una variante a comparar (mismo criterio que excluye `default`/`else` en `switchArmActions`, abajo). */
function ifLadderBranchActions(root: AstNode): AstNode[] {
  const out: AstNode[] = [];
  let current: AstNode | null = root;
  while (current && current.childForFieldName("condition")) {
    const action = branchAction(current);
    if (action) out.push(action);
    const alt = current.childForFieldName("alternative") as AstNode | null;
    current = alt ? unwrapAlternative(alt) : null;
  }
  return out;
}

/** Etiqueta de reserva de un arm, cuando la gramática la expresa como un HIJO
 *  del arm en vez de como un tipo de arm propio (C#: `switch_section` con un
 *  `default_switch_label` adentro). Palabra de gramática, no de dominio. */
const BRANCH_DEFAULT_LABEL = /(^|_)(default|else)(_|$)/;

/** Campos con los que las gramáticas nombran la ETIQUETA de un arm (`case 1:` / `when 1`). Sonda: `value` en JS/TS/Go/Ruby, `pattern` en Ruby. */
const ARM_LABEL_FIELDS = ["value", "pattern"] as const;

/** `true` si el arm tiene algo propio además de sus etiquetas — ver el uso en `switchArmActions`. */
function armHasOwnContent(arm: AstNode): boolean {
  const labels: AstNode[] = [];
  for (const f of ARM_LABEL_FIELDS) {
    const l = arm.childForFieldName(f) as AstNode | null;
    if (l) labels.push(l);
  }
  const isLabel = (n: AstNode): boolean =>
    BRANCH_SWITCH_WORD.test(n.type) ||
    labels.some((l) => l.startPosition.row === n.startPosition.row && l.startPosition.column === n.startPosition.column && l.endPosition.column === n.endPosition.column);
  for (let i = 0; i < arm.childCount; i++) {
    const c = arm.child(i) as AstNode | null;
    if (c?.isNamed && !isLabel(c)) return true;
  }
  return false;
}

/**
 * Arms reales de un switch/case YA localizado — nunca recursa dentro de un arm
 * encontrado, salta envoltorios, excluye el `else`/`default` — MISMO recorrido
 * que `state.ts#countArms`, duplicado porque ese módulo no expone los NODOS,
 * sólo la cuenta.
 *
 * INTENCIÓN QUE VERIFICA (la corrección de la Ola U, N5): *"la acción de un
 * arm es TODO lo que ese arm hace"*. Antes, la acción se pedía por los campos
 * `consequence`/`body` — y si la gramática no expone ninguno, el arm se
 * DESCARTABA en silencio. Sonda directa contra las seis gramáticas
 * (`scripts/n5-probe-arms.mts`, corrida en esta ola, no supuesta):
 *
 *   Ruby   `when`                          → body        ✔
 *   JS/TS  `switch_case`                   → body        ✔
 *   Python `case_clause`                   → consequence ✔
 *   C#     `switch_section`                → (ninguno)   ✘
 *   Java   `switch_block_statement_group`  → (ninguno)   ✘
 *   Go     `expression_case`               → sólo `value`, que es la ETIQUETA ✘
 *
 * O sea: en TRES de los nueve lenguajes esta función devolvía SIEMPRE la lista
 * vacía, y `distinctBehaviorCheck` —el único `required` de intención de esta
 * hipótesis— no podía juzgar un `switch` nunca. Quedaba enmascarado porque
 * `findChainNode` elegía "la cadena de más peldaños" y terminaba juzgando otra
 * cadena de la misma función; al ubicar la cadena por línea (ver
 * `findChainNode`) el hueco quedó a la vista, medido: los 4 hallazgos
 * `repeated-switch` de C# con Strategy en `corpus/newtonsoft-json` pasaron a
 * morir por "no se pudieron ubicar las ramas", no por su forma.
 *
 * La corrección es genérica y no agrega vocabulario por lenguaje: si el arm no
 * expone un campo de acción, la acción ES EL ARM ENTERO (etiqueta incluida —
 * una etiqueta es un patrón/constante, no una invocación, así que no altera
 * ninguna de las dos preguntas de `distinctBehaviorCheck`).
 */
function switchArmActions(container: AstNode): AstNode[] {
  const out: AstNode[] = [];
  const visit = (node: AstNode): void => {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i) as AstNode | null;
      if (!child || !child.isNamed) continue;
      const isWrapper = BRANCH_SWITCH_WORD.test(child.type) && BRANCH_SWITCH_WRAPPER_EXCLUDE.test(child.type);
      const isArm = BRANCH_SWITCH_WORD.test(child.type) && !BRANCH_SWITCH_ARM_EXCLUDE.test(child.type) && !isWrapper;
      if (isArm) {
        // El arm de reserva expresado como HIJO (C# `default_switch_label`)
        // sigue fuera, igual que cuando la gramática lo expresa como tipo de
        // arm propio (`switch_default`/`default_case`): es el catch-all, no
        // una variante a comparar. LÍMITE DECLARADO: en Java el `default` es
        // un token ANÓNIMO dentro de un `switch_label` genérico, así que ahí
        // el grupo de reserva sí entra como un arm más — sin caso medido de
        // que eso cambie un veredicto, se dice y no se estima.
        let esReserva = false;
        for (let j = 0; j < child.childCount; j++) {
          const label = child.child(j) as AstNode | null;
          if (label?.isNamed && BRANCH_DEFAULT_LABEL.test(label.type)) esReserva = true;
        }
        if (esReserva) continue;
        const declared = branchAction(child);
        if (declared) {
          out.push(declared);
          continue;
        }
        // Sin campo de acción declarado: la acción es el arm entero, PERO sólo
        // si el arm tiene contenido propio. Una etiqueta de CAÍDA (`case a:`
        // seguido de `case b:` con el cuerpo en el segundo) no es una rama:
        // es parte del conjunto de etiquetas de la rama siguiente. REGRESIÓN
        // REAL, medida: sin este filtro, `lodash.js:6280 initCloneByTag` (que
        // agrupa `case boolTag: case dateTag:` y ocho pares más) pasaba a
        // contarse como mayoría de ramas "sin invocar nada" y se excluía como
        // tabla de clasificación. Se cuenta como contenido propio cualquier
        // hijo nombrado que no sea una etiqueta (nodo de la familia
        // switch/case, o el hijo apuntado por el campo `value`/`pattern`).
        if (armHasOwnContent(child)) out.push(child);
      } else {
        visit(child);
      }
    }
  };
  visit(container);
  return out;
}

/** `true` si el subárbol de la rama contiene, en cualquier profundidad, un nodo de invocación (`CALL_WORD`). */
function branchInvokesCall(action: AstNode): boolean {
  let found = false;
  walkTree(action, (n) => {
    if (found || !n.isNamed) return;
    if (CALL_WORD.test(n.type)) found = true;
  });
  return found;
}

/** El nombre de la invocación MÁS GRANDE por span de texto dentro de la rama — la más EXTERNA (una invocación anidada como argumento de otra siempre tiene un span menor que la que la envuelve), no la primera ni la última por orden de recorrido. `null` si no hay ninguna. */
function branchPrimaryCallee(action: AstNode): string | null {
  let best: AstNode | null = null;
  walkTree(action, (n) => {
    if (!n.isNamed || !CALL_WORD.test(n.type)) return;
    const candidate = n as AstNode;
    if (!best || candidate.text.length > best.text.length) best = candidate;
  });
  if (!best) return null;
  const node: AstNode = best;
  for (const f of CALLEE_FIELDS) {
    const child = node.childForFieldName(f) as AstNode | null;
    if (child) return child.text.trim();
  }
  return node.text.trim();
}

/** Ramas de LA cadena que ancla `problem` (peldaños if/elsif o arms de switch, sin el `else`/`default`) — `null` si no hay árbol vivo o no se pudo ubicar la cadena. */
function branchActionsOf(ctx: HypothesisContext, problem: Problem): readonly AstNode[] | null {
  if (!ctx.file) return null;
  const fn = findEnclosingFunction(ctx.file, problem);
  if (!fn) return null;
  const sets = ctx.setsFor(ctx.file.language);
  const chainNode = findChainNode(fn.node, sets, reportedChainStartLine(problem));
  if (!chainNode) return null;
  return sets.switchContainerNodes.has(chainNode.type) ? switchArmActions(chainNode) : ifLadderBranchActions(chainNode);
}

/** Umbral de "mayoría" para las dos preguntas de `distinctBehaviorCheck" — nunca cita externa (no hay una para "¿cuánta clasificación es demasiada?"): mitad o más basta para que la forma predominante sea la de datos, no la de algoritmos. */
const MAJORITY_RATIO = 0.5;

function distinctBehaviorCheck(ctx: HypothesisContext): Check<Problem, Graph> {
  return {
    id: "ramas-invocan-comportamiento-distinto",
    describe:
      "la mayoría de las ramas invoca una operación sustantiva, y no todas convergen en la MISMA operación (si no, es una tabla de clasificación o una única operación parametrizada, no Strategy)",
    run: (problem) => {
      const branches = branchActionsOf(ctx, problem);
      if (!branches || branches.length === 0) {
        // INVERTIDO — CASO TESTIGO de la ola (`XmlNodeConverter.cs`,
        // newtonsoft-json): antes `holds: true` ("se asume, SIN CONFIRMAR").
        // Sin poder ubicar las ramas no hay evidencia de que invoquen
        // comportamiento distinto — required no demostrado, no cumplido.
        return {
          holds: false,
          evidence: "árbol no disponible o no se pudieron ubicar las ramas de esta cadena: no se puede confirmar que invocan comportamiento distinto, no demostrado.",
        };
      }
      const literalCount = branches.filter((b) => !branchInvokesCall(b)).length;
      if (literalCount / branches.length >= MAJORITY_RATIO) {
        return {
          holds: false,
          evidence: `${literalCount}/${branches.length} ramas retornan un valor fijo (sin invocar nada) — forma de tabla de clasificación (datos de un conjunto cerrado), no de algoritmos intercambiables.`,
        };
      }
      const callees = branches.map(branchPrimaryCallee).filter((n): n is string => n !== null);
      if (callees.length < 2) {
        // INVERTIDO (ola "required no permisivo"): antes `holds: true`
        // ("sin evidencia suficiente... se mantiene como candidata") — no
        // alcanzar a juzgar convergencia no es lo mismo que confirmar
        // divergencia. No demostrado, no cumplido.
        return {
          holds: false,
          evidence: "menos de dos ramas con una invocación identificable: no se puede confirmar si convergen o divergen en la misma operación, no demostrado.",
        };
      }
      const counts = new Map<string, number>();
      for (const c of callees) counts.set(c, (counts.get(c) ?? 0) + 1);
      const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      const [topName, topCount] = ranked[0]!;
      // `topCount >= 2` (no sólo la proporción) importa para NO confundir "dos
      // ramas, cada una con su propio nombre único" (proporción 1/2 = 50%,
      // pasaría el umbral de todos modos) con "el mismo nombre repetido" —
      // sin repetición real no hay convergencia que objetar.
      if (topCount >= 2 && topCount / callees.length >= MAJORITY_RATIO) {
        return {
          holds: false,
          evidence: `${topCount}/${callees.length} ramas con acción invocan la MISMA operación ("${topName}") con argumentos/receptor distintos — variación de datos sobre una única operación, no una selección entre algoritmos.`,
        };
      }
      return {
        holds: true,
        evidence: `cada rama invoca una operación distinta (${ranked.map(([n]) => n).join(", ")}) — forma compatible con variantes intercambiables de un mismo trabajo.`,
      };
    },
  };
}

/**
 * OLA AM (AM2) — LA 5.ª FORMA DE "UN SOLO DISCRIMINANTE": el vecino que YA
 * leyó las pruebas de tipo de ESTA MISMA cadena.
 *
 * EL DEFECTO QUE CIERRA, que es una COMPUERTA IMPOSIBLE POR CONSTRUCCIÓN.
 * `sameDiscriminantSubjectCheck` lee el sujeto de cada peldaño con
 * `discriminantSubject`, que parte el TEXTO de la condición por
 * `COMPARISON_OPERATOR` y, si no hay operador de comparación, devuelve el
 * texto ENTERO. Un peldaño que decide por el TIPO de su sujeto NUNCA tiene
 * operador de comparación —Java/JS escriben `x instanceof T`, C# `x is T`,
 * Python `isinstance(x, T)`, Ruby `x.is_a?(T)`—, así que el "sujeto" de cada
 * peldaño resulta ser su condición entera, `distinct.size > 1` da SIEMPRE, y
 * el `required` **no se puede satisfacer nunca** para toda la clase de
 * escaleras de despacho por tipo: exactamente la forma canónica del problema
 * que Strategy resuelve. Medido sobre las dos poblaciones antes de escribir
 * esto: de las 44 cadenas que mueren en este `required`, las de guava
 * (`MoreObjects#isEmpty`, `TypeResolver#resolveType`, `TypeVisitor#visit`,
 * `Multimaps#unmodifiableCollectionSubclass`) y las de sqlalchemy
 * (`ranges.py#_resolve_for_literal`, `mysql/base.py#visit_typeclause`) son
 * escaleras `instanceof`/`isinstance` de un solo sujeto.
 *
 * Y LA PRUEBA DE QUE ESTE MISMO CHECK YA CONSIDERA CUMPLIDO ESE CASO: cuando
 * la MISMA escalera llega por el ancla `type-switch`, la primera línea de
 * `run` devuelve `holds: true` con la justificación escrita ("el detector
 * sólo emite cuando TODAS las ramas contadas prueban el tipo del MISMO
 * sujeto"). El mismo código, el mismo hecho — y por el ancla
 * `conditional-chain` se descartaba.
 *
 * QUÉ INTENCIÓN VERIFICA ESTA FUNCIÓN: *"¿otro hallazgo del propio analizador
 * declara que TODOS los peldaños de ESTA cadena deciden por el tipo del MISMO
 * sujeto?"*. No pregunta por la intención del patrón ni agrega vocabulario de
 * ningún lenguaje: lee un hallazgo que ya existe.
 *
 * TRES EXIGENCIAS, y las tres son de FORMA:
 *   1. el vecino es del ancla `type-switch` y vive en el MISMO archivo;
 *   2. su `locations[0].startLine` es EXACTAMENTE la línea de inicio del nodo
 *      de cadena que este check ya ubicó — no "cerca". Si es otra cadena de la
 *      misma función no confirma nada (caso real que esto excluye:
 *      `hugo parser/metadecoders/decoder.go:391`, cuya función vecina
 *      `unmarshalORG` tiene su propio `type-switch` en la línea 415);
 *   3. sus ramas contadas (`trigger[0].value` = `ramasQueDecidenPorTipo`, los
 *      peldaños que prueban el tipo del MISMO sujeto) son AL MENOS tantas como
 *      los peldaños de esta cadena. NINGÚN NÚMERO NUEVO: es la igualdad de dos
 *      conteos que el analizador ya produce, y es la lectura literal de "TODAS
 *      las ramas comparan la misma expresión".
 *
 * `null` si no hay tal vecino. Nunca lanza, nunca recorre el grafo: la
 * consulta del vecindario es O(resultado) por contrato (CONTRATO-F9.md §1.1) y
 * es la MISMA que `formFeaturesOf` ya hace en este archivo.
 */
function typeSwitchOverThisChain(
  ctx: HypothesisContext,
  problem: Problem,
  chain: AstNode,
  rungCount: number,
): { readonly line: number; readonly subject: string; readonly branches: number } | null {
  const file = problem.locations[0]?.file;
  if (!file) return null;
  const chainStartLine = chain.startPosition.row + 1;
  for (const otro of ctx.neighborhood.findingsOfKind(TYPE_SWITCH_ANCHOR)) {
    const loc = otro.locations[0];
    if (!loc || loc.file !== file || loc.startLine !== chainStartLine) continue;
    const subject = anchorSubjectOf(otro);
    if (!subject) continue;
    const branches = otro.trigger[0]?.value ?? 0;
    if (branches < rungCount) continue;
    return { line: loc.startLine, subject, branches };
  }
  return null;
}

function sameDiscriminantSubjectCheck(ctx: HypothesisContext): Check<Problem, Graph> {
  return {
    id: "un-solo-discriminante",
    describe:
      "todas las ramas de la escalera comparan la MISMA expresión contra valores distintos (si cada rama testea una variable distinta, es despacho por presencia de argumento/aridad, no selección de estrategia)",
    run: (problem) => {
      if (problem.kind === TYPE_SWITCH_ANCHOR) {
        return {
          holds: true,
          evidence:
            "el ancla 'type-switch' ya garantiza un único discriminante por construcción: el detector sólo emite cuando TODAS las ramas contadas prueban el tipo del MISMO sujeto (ver `detect/intra-function/type-switch.ts`, variante 'escalera').",
        };
      }
      if (problem.kind !== "conditional-chain") {
        return {
          holds: true,
          evidence: "el ancla 'repeated-switch' ya garantiza un único discriminante por construcción (el mismo sujeto decidido por switch): no aplica esta exclusión.",
        };
      }
      if (!ctx.file) {
        // INVERTIDO (ola "required no permisivo"): antes `holds: true`
        // ("se asume, SIN CONFIRMAR"). Sin árbol no hay evidencia de que la
        // escalera comparta un único discriminante — no demostrado, no
        // cumplido.
        return { holds: false, evidence: "árbol no disponible: no se puede confirmar que la escalera comparte un único discriminante, no demostrado." };
      }
      const fn = findEnclosingFunction(ctx.file, problem);
      if (!fn) return { holds: false, evidence: "no se encontró la función encerrante en el árbol vivo: no se puede confirmar discriminante único, no demostrado." };
      const sets = ctx.setsFor(ctx.file.language);
      const chainNode = findChainNode(fn.node, sets, reportedChainStartLine(problem));
      if (!chainNode) return { holds: false, evidence: "no se encontró el nodo de la cadena: no se puede confirmar discriminante único, no demostrado." };
      if (sets.switchContainerNodes.has(chainNode.type)) {
        return { holds: true, evidence: "esta cadena es sintácticamente un switch/case: un único discriminante por construcción, no aplica." };
      }
      const subjects: string[] = [];
      let current: AstNode | null = chainNode;
      while (current && current.childForFieldName("condition")) {
        const cond = current.childForFieldName("condition") as AstNode | null;
        if (cond) {
          const text = cond.text.replace(/[()]/g, "").trim();
          const subject = normalizeDiscriminant(discriminantSubject(text));
          if (subject.length > 0) subjects.push(subject);
        }
        const alt = current.childForFieldName("alternative") as AstNode | null;
        current = alt ? unwrapAlternative(alt) : null;
      }
      // OLA AM (AM2) — 5.ª FORMA, ver `typeSwitchOverThisChain`. Se evalúa SÓLO
      // acá y en la salida negativa de abajo, o sea SÓLO cuando la lectura por
      // TEXTO ya falló: es una DISYUNCIÓN más, nunca un filtro. No puede
      // cambiar el resultado de ninguna hipótesis que ya exista.
      const porTipo = typeSwitchOverThisChain(ctx, problem, chainNode, ifLadderBranchActions(chainNode).length);
      if (subjects.length < 2) {
        if (porTipo) {
          return {
            holds: true,
            evidence: `todos los peldaños de esta cadena deciden por el TIPO del MISMO sujeto ("${porTipo.subject}"): lo declara el hallazgo 'type-switch' que el propio analizador emitió sobre ESTA cadena (línea ${porTipo.line}, ${porTipo.branches} ramas). Una prueba de tipo no tiene operador de comparación que separar, así que la lectura por texto no la puede ver.`,
          };
        }
        // INVERTIDO (ola "required no permisivo"): antes `holds: true`
        // ("sin evidencia suficiente, se mantiene como candidata").
        return { holds: false, evidence: "menos de dos peldaños con condición legible: no se puede confirmar discriminante único, no demostrado." };
      }
      const distinct = new Set(subjects);
      if (distinct.size <= 1) {
        return {
          holds: true,
          evidence: `todos los peldaños comparan la misma expresión ("${[...distinct][0]}") contra valores distintos: discriminante único, forma real de Strategy.`,
        };
      }
      if (porTipo) {
        return {
          holds: true,
          evidence: `todos los peldaños de esta cadena deciden por el TIPO del MISMO sujeto ("${porTipo.subject}"): lo declara el hallazgo 'type-switch' que el propio analizador emitió sobre ESTA cadena (línea ${porTipo.line}, ${porTipo.branches} ramas). Una prueba de tipo no tiene operador de comparación que separar, así que la lectura por texto lee cada condición entera como si fuera un sujeto distinto.`,
        };
      }
      return {
        holds: false,
        evidence: `los peldaños comparan expresiones DISTINTAS entre sí (${[...distinct].slice(0, 4).join(" | ")}) — cada rama testea una variable propia, no el mismo discriminante con valores distintos: despacho por presencia de argumento (aridad), no selección de estrategia.`,
      };
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * Ola Z (Z7) — `externalDiscriminantTypeCheck`: LA COMPUERTA QUE FALTA.
 *
 * EL HECHO MEDIDO (Ola Y): ocho casos a mano, cuatro lenguajes, CERO
 * verdaderos — `RoundingMode` del JDK ×3 (`conditional-chain`+
 * `repeated-switch`, `guava/BigIntegerMath.log2`/`DoubleMath.
 * roundIntermediate`), `System.Reflection` (`Type`/`Assembly`/`MemberInfo`/
 * `Module`/`ParameterInfo`, C#, `type-switch`), `String`/`Regexp`/`Warning`
 * de Ruby (`type-switch`) y `str`/`type`/`TypeVar` de Python (`type-switch`).
 * La causa es SIEMPRE la misma: el switch/cadena discrimina sobre un tipo
 * que ESTE repo no declara y no puede extender — un enum/clase del JDK, la
 * BCL o la stdlib. Proponer Strategy ahí es incorrecto por definición: no
 * se puede reemplazar por polimorfismo un tipo que no se controla.
 *
 * LA PREGUNTA, y quién la contesta: *¿el tipo que discrimina esta rama está
 * DECLARADO en este repo?* Es alcance y gramática (`CodeGraphNode.family
 * === "class-like"`, estructural — clase/struct/record/interfaz/enum,
 * cualquier declaración con campo `name` y `body` que no sea función-like,
 * `code-grammar.ts#isClassLike` — nunca un enumerado de palabras de
 * lenguaje), no inferencia: se responde `declarado` (resuelve a EXACTAMENTE
 * un nodo `class-like` del repo), `externo` (resuelve a NINGUNO) o
 * `ambiguo` (resuelve a MÁS de uno — viaja como ambiguo, nunca colapsado a
 * un candidato, y NO se excluye por él: sólo `externo` excluye).
 *
 * TRES FUENTES DE CANDIDATOS, cada una acotada a lo que de verdad puede
 * nombrar un tipo — nunca "cualquier identificador del condicional", que
 * fabricaría falsos positivos de exclusión sobre cadenas que no discriminan
 * por tipo en absoluto:
 *
 *   1. `type-switch`: reusa `site.typeNames` que el propio detector YA
 *      extrajo por gramática (`detail`: "Tipos decididos: X, Y, Z." —
 *      `type-switch.ts`, sonda de 9 lenguajes) — CERO trabajo de AST nuevo.
 *   2. `conditional-chain`/`repeated-switch`, la mitad CUALIFICADA: el
 *      VALOR comparado (nunca el sujeto ni el condicional entero — evita
 *      capturar una llamada no relacionada como `Math.abs(x)` del lado del
 *      sujeto) de cada peldaño/etiqueta, cuando es un camino con punto o
 *      `::` (`RoundingMode.HALF_UP`, `SomeEnum::VALUE`) o una CONSTANTE a
 *      secas con forma de clase (Ruby `when Regexp`, la misma convención
 *      "mayúscula inicial + alguna minúscula" que `type-switch.ts#
 *      armTypeName` ya usa para el mismo defecto de gramática: `constant`
 *      no distingue clase de constante en Ruby).
 *   3. `conditional-chain`/`repeated-switch`, la mitad SIN CALIFICAR — LA
 *      QUE CUBRE EL CASO MEDIDO REAL (`RoundingMode`): Java/C# EXIGEN
 *      etiquetas de `switch` sobre enum SIN calificar (`case HALF_UP:`,
 *      nunca `case RoundingMode.HALF_UP:` — error de compilación si se
 *      califica), así que el nombre del tipo NUNCA aparece en el texto de
 *      las ramas — sólo vive en la FIRMA. Si el sujeto es un identificador a
 *      secas que nombra un PARÁMETRO de la función encerrante con tipo
 *      ESCRITO (`declaredParamTypeText`, mismo campo `type` que las cinco
 *      gramáticas tipadas comparten — verificado por
 *      `graph/edges/declara-tipo.ts`, sonda directa, reusado acá como HECHO
 *      YA VALIDADO, no re-derivado), ESE tipo es un candidato. Verificado
 *      contra la fuente real: `guava/DoubleMath.java#roundIntermediate(double
 *      x, RoundingMode mode)` — `switch (mode)` con etiquetas `case
 *      UNNECESSARY:`/`case FLOOR:`/… sin calificar en ningún lado.
 *
 * POR QUÉ `holds: true` CUANDO NO HAY CANDIDATOS O NO HAY GRAFO (mismo
 * criterio que el excluder de Factory Method, NO el de "required no
 * permisivo" de los otros cuatro `required` de arriba): este check afirma
 * una EXCLUSIÓN ("no es un tipo externo"), no evidencia POSITIVA de
 * Strategy — la ausencia de candidatos no demuestra que el tipo SEA
 * externo, así que no se excluye. Sólo se excluye (`holds: false`) con
 * evidencia POSITIVA: al menos un candidato, y NINGUNO resuelve (ni
 * `declarado` ni `ambiguo`) a un nodo del repo.
 *
 * MEMOIZADO por identidad de `CodeGraph` (`CLASS_LIKE_NAME_INDEX_CACHE`,
 * regla de costo de esta ola) — una sola pasada sobre `graph.nodes` por
 * corrida, nunca por hallazgo.
 *
 * LÍMITES DECLARADOS, no escondidos: (a) el candidato #3 sólo mira
 * PARÁMETROS (no campos ni locales) — cubre el caso medido, no cierra el
 * resto del universo; (b) sin resolución de importaciones: un tipo del repo
 * que comparte nombre CORTO con algo ajeno puede colar como `ambiguo` en vez
 * de `declarado` si el repo tiene dos símbolos `class-like` homónimos en
 * archivos distintos — no excluye por eso (`ambiguo` no rechaza), así que el
 * costo de este límite es "no excluye algunos externos con nombre
 * duplicado", nunca "excluye un verdadero"; (c) Ruby/Python/JS sin anotación
 * de tipo en parámetros: el candidato #3 no aporta nada ahí (`declaredParamTypeText`
 * devuelve `null`, ningún campo `type` que leer) — los dos verdaderos
 * conocidos del corpus (`rubocop/literal_in_interpolation.rb`,
 * `app/models/hookable.rb:255`) son Ruby, sin anotación de tipo y sin
 * comparación cualificada (switchean sobre `node.type`/`hookable_type`, un
 * símbolo y un string, no un camino con punto) — por diseño, ninguna de las
 * tres fuentes les extrae un candidato, así que este check nunca los toca:
 * verificado leyendo el código citado en las dos planillas doradas, no
 * supuesto.
 * ──────────────────────────────────────────────────────────────────────── */

/** Un camino con punto o `::`, primer segmento con mayúscula inicial — la
 *  forma "Tipo.MIEMBRO"/"Tipo::MIEMBRO" de una constante/enum cualificado.
 *  Vocabulario de FORMA (la misma convención de mayúscula inicial que
 *  `hasDispatchTable`/`state.ts` ya usan en este proyecto), nunca de
 *  dominio: no nombra ningún framework ni ecosistema. */
const QUALIFIED_TYPE_LEADING_SEGMENT = /\b([A-Z][A-Za-z0-9_$]*)(?:\.[A-Za-z0-9_$]+|::[A-Za-z0-9_$]+)+/g;

function qualifiedTypeCandidatesIn(text: string): string[] {
  return [...text.matchAll(QUALIFIED_TYPE_LEADING_SEGMENT)].map((m) => m[1]!);
}

/** El VALOR comparado (lo que sigue al operador) de un texto de condición o
 *  etiqueta — nunca el sujeto: acota la búsqueda de tipo al lado que de
 *  verdad puede nombrar el discriminante, sin capturar una llamada no
 *  relacionada del lado del sujeto (`Math.abs(x) > 5`: sujeto `Math.abs(x)`,
 *  nunca candidato). Mismo `COMPARISON_OPERATOR` que `discriminantSubject`
 *  ya usa para el lado opuesto. `null` sin operador reconocible (guarda
 *  booleana, llamada suelta, etc.) — no aporta candidato, no rechaza nada. */
function comparedValueText(text: string): string | null {
  const match = COMPARISON_OPERATOR.exec(text);
  return match ? text.slice(match[0].length).trim() : null;
}

/** Etiqueta de un arm de switch (Ruby `when Regexp`) o valor comparado de un
 *  peldaño if/elsif, con forma de tipo — camino cualificado, o CONSTANTE a
 *  secas con "mayúscula inicial + alguna minúscula" (la misma convención que
 *  `armTypeName` de `type-switch.ts` usa para el mismo defecto de gramática
 *  de Ruby: `constant` no distingue clase de constante). */
/**
 * BUG REAL, medido contra `corpus/hugo/hugolib/doctree/nodeshifttree.go:505`
 * y CERRADO en esta misma ola: la primera versión de esta función también
 * aceptaba una CONSTANTE a secas con "mayúscula inicial + alguna minúscula"
 * como candidato — pensada para el Ruby `when Regexp`/`when String`
 * (`type-switch.ts#armTypeName` hace lo mismo, PERO ahí está atado a un
 * detector que ya exige, por construcción, que el discriminante nombre un
 * TIPO). Acá NO hay esa garantía: `repeated-switch`/`conditional-chain` no
 * saben si la etiqueta es un tipo o un VALOR, y Go nombra sus constantes de
 * enum con la MISMA convención CamelCase que un nombre de clase
 * (`LockTypeRead`/`LockTypeWrite`, `hugolib/doctree/support.go:136: type
 * LockType int` — declarado EN ESTE MISMO repo). Con el fallback viejo,
 * `switch r.LockType { case LockTypeRead: … }` extraía "LockTypeRead"/
 * "LockTypeWrite" como candidatos, ninguno de los dos es una clase (son
 * CONSTANTES), ninguno resolvía en el índice `class-like` — EXCLUÍA un
 * caso cuyo tipo discriminante real (`LockType`) SÍ está declarado en el
 * repo. Medido: 1 de los 4 casos que esta compuerta excluía en `hugo` era
 * este falso — cerrado sacando el fallback, no acotándolo por lenguaje
 * (ninguna lista de "en qué lenguajes SÍ" sería genérica). La forma Ruby que
 * motivó el fallback (`case comment; when Regexp; when String`) sigue
 * cubierta por la vía 1 (`type-switch`, que si el mismo código además
 * dispara ese ancla, lo hace con la garantía real del detector).
 */
function typeLikeCandidatesIn(text: string): string[] {
  return qualifiedTypeCandidatesIn(text.trim());
}

/** Etiquetas (`value`/`pattern`) de cada arm real de un switch YA
 *  localizado — mismo recorrido y misma exclusión de reserva/wrapper que
 *  `switchArmActions`, pero devolviendo la ETIQUETA en vez de la acción:
 *  duplicado a propósito (misma disciplina que el resto del archivo, ver el
 *  docstring del módulo), porque esa función descarta el nodo entero apenas
 *  encuentra su acción y acá hace falta lo contrario. */
/** Envoltorio propio de la etiqueta cuando la gramática no la expone como
 *  CAMPO del arm — mismo fallback, mismo criterio de nombre, que
 *  `type-switch.ts#armLabelNodes` ya usa para el mismo defecto de gramática
 *  (C# `switch_section` → `case_pattern_switch_label`/`case_switch_label`,
 *  Java `switch_block_statement_group` → `switch_label`). Sonda directa
 *  contra `newtonsoft-json/Utilities/ReflectionUtils.cs:836`
 *  (`switch (provider) { case Type t: … }`) — sin este fallback, un `case
 *  Type t:` de C# no devuelve ninguna etiqueta (`ARM_LABEL_FIELDS` no
 *  resuelve ningún campo sobre `switch_section`), y el caso REAL que la Ola
 *  Y nombró como "System.Reflection" (`Type`/`Assembly`/`MemberInfo`/
 *  `Module`/`ParameterInfo`) queda invisible para esta compuerta. */
const ARM_LABEL_WRAPPER = /(^|_)(label|pattern)$/;

/**
 * El campo `type` — mismo nombre UNIVERSAL que `graph/edges/declara-tipo.ts`
 * ya documenta, sonda directa, para las cinco gramáticas tipadas — del
 * primer descendiente que lo expone dentro de una etiqueta envuelta,
 * profundidad acotada (una etiqueta de switch no anida patrones sin fondo).
 *
 * POR QUÉ HACE FALTA, verificado por sonda directa contra
 * `tree-sitter-c_sharp.wasm` (`scratchpad/probe-cs-switch.mts` de esta ola):
 * `case Type t:` parsea `case_pattern_switch_label` → `declaration_pattern`
 * ("Type t", SIN campo propio) → dos hijos `identifier` SIN nombre de campo
 * que los distinga… salvo que `declaration_pattern` SÍ resuelve
 * `childForFieldName("type")` → el `identifier` "Type" solo, y
 * `childForFieldName("name")` → el `identifier` "t" — la gramática YA
 * separa "el tipo" de "el nombre ligado" por CAMPO, nunca por posición ni
 * por texto. Sin esto, el `.text` del wrapper entero ("Type t") no matchea
 * ni un camino calificado ni un identificador a secas, y el caso REAL que
 * motiva esta función (`newtonsoft-json/Utilities/ReflectionUtils.cs:836`,
 * "System.Reflection" — `Type`/`Assembly`/`MemberInfo`/`Module`/
 * `ParameterInfo`, los cinco medidos por la Ola Y) queda invisible.
 */
function typeFieldWithinLabel(node: AstNode, depth = 0): AstNode | null {
  const own = node.childForFieldName("type") as AstNode | null;
  if (own) return own;
  if (depth >= 3) return null;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i) as AstNode | null;
    if (!child?.isNamed) continue;
    const found = typeFieldWithinLabel(child, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * Candidatos a tipo de las etiquetas de un switch YA localizado — DOS
 * fuentes, con confianza DISTINTA y por eso tratadas distinto:
 *
 *   - el campo `value`/`pattern` DIRECTO del arm (Ruby `when Regexp`): texto
 *     CRUDO de la etiqueta. AMBIGUO entre tipo y valor — pasa sólo por
 *     `qualifiedTypeCandidatesIn` (nunca acepta un identificador a secas:
 *     ver el porqué en `typeLikeCandidatesIn`, mismo defecto medido).
 *   - el campo `type`, ESTRUCTURAL, de un descendiente dentro del envoltorio
 *     propio (C# `declaration_pattern.type`, `typeFieldWithinLabel`): la
 *     GRAMÁTICA ya garantiza que esto es un tipo, nunca un valor — por eso
 *     ACÁ sí se acepta la forma a secas (`simpleNominalTypeName`, que
 *     también filtra primitivos).
 */
function switchArmLabelCandidates(container: AstNode): string[] {
  const out: string[] = [];
  const visit = (node: AstNode): void => {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i) as AstNode | null;
      if (!child || !child.isNamed) continue;
      const isWrapper = BRANCH_SWITCH_WORD.test(child.type) && BRANCH_SWITCH_WRAPPER_EXCLUDE.test(child.type);
      const isArm = BRANCH_SWITCH_WORD.test(child.type) && !BRANCH_SWITCH_ARM_EXCLUDE.test(child.type) && !isWrapper;
      if (isArm) {
        let found = false;
        for (const f of ARM_LABEL_FIELDS) {
          const label = child.childForFieldName(f) as AstNode | null;
          if (label) {
            out.push(...qualifiedTypeCandidatesIn(label.text));
            found = true;
          }
        }
        if (!found) {
          // Envoltorio propio (C# `switch_section` → `case_pattern_switch_label`,
          // Java `switch_block_statement_group` → `switch_label`): el texto
          // CRUDO del envoltorio (calificado solamente) más el campo `type`
          // ESTRUCTURAL, cuando existe, de cualquier descendiente cercano
          // — la forma que SÍ trae mezclado el nombre ligado
          // (`declaration_pattern`, arriba), pero cuyo campo `type` la
          // gramática ya aísla.
          for (let j = 0; j < child.childCount; j++) {
            const grand = child.child(j) as AstNode | null;
            if (!grand?.isNamed || !ARM_LABEL_WRAPPER.test(grand.type)) continue;
            out.push(...qualifiedTypeCandidatesIn(grand.text));
            const typeField = typeFieldWithinLabel(grand);
            const simple = typeField ? simpleNominalTypeName(typeField.text) : null;
            if (simple) out.push(simple);
          }
        }
        continue; // el cuerpo del arm no es una etiqueta — no recursar adentro.
      }
      visit(child);
    }
  };
  visit(container);
  return out;
}

/** Campos con los que la lista de parámetros cuelga del nodo de la función —
 *  mismo par que `graph/edges/declara-tipo.ts#PARAM_LIST_FIELDS` documenta
 *  (sonda directa contra las cinco gramáticas tipadas), sin el `receiver` de
 *  Go (esta pregunta es sobre el SUJETO del switch, nunca el receptor). */
const PARAM_LIST_FIELD_NAMES = ["parameters", "parameter_list"] as const;
/** Campos con los que un parámetro nombra AL PARÁMETRO (no a su tipo) —
 *  mismo trío que `graph/edges/declara-tipo.ts#DECL_NAME_FIELDS` reduce a lo
 *  que aplica a un parámetro (sin `declarator`, que es de binding de
 *  variable, no de parámetro). */
const PARAM_NAME_FIELDS = ["name", "pattern", "left"] as const;

/**
 * El tipo ESCRITO de un parámetro de `fn` llamado exactamente `paramName` —
 * mismo campo `type` que las cinco gramáticas tipadas comparten (java,
 * csharp, typescript, go, python — verificado por
 * `graph/edges/declara-tipo.ts`, sonda directa contra las cinco, reusado acá
 * como hecho ya validado). `null` sin lista de parámetros, sin ninguno con
 * ese nombre, o si el que tiene ese nombre no escribió tipo (Ruby/JS/Python
 * sin anotación — PEP 526 aparte, fuera de esta lectura simple a propósito:
 * ver LÍMITES DECLARADOS arriba).
 *
 * Por qué se lee EN VIVO acá y no se reusa `declares-type` del grafo: esa
 * arista nace de una PREGUNTA distinta ("¿a qué clase del repo apunta este
 * sitio de declaración?", resuelta en tiempo de construcción del grafo para
 * TODO parámetro/campo/local del repo); acá la pregunta es "¿cuál es el
 * TEXTO que este parámetro puntual escribió?", y ese texto ya está disponible
 * en el árbol vivo que esta hipótesis ya tiene (`ctx.file`) sin pagar un
 * segundo recorrido del grafo completo — la resolución de SI ese texto es un
 * nodo del repo la hace `classLikeNameIndex`, abajo, sobre el mismo `graph`.
 */
function declaredParamTypeText(fn: FunctionUnit, paramName: string): string | null {
  if (!paramName) return null;
  for (const listField of PARAM_LIST_FIELD_NAMES) {
    const list = fn.node.childForFieldName(listField) as AstNode | null;
    if (!list) continue;
    for (let i = 0; i < list.childCount; i++) {
      const param = list.child(i) as AstNode | null;
      if (!param?.isNamed) continue;
      const nameNode = PARAM_NAME_FIELDS.map((f) => param.childForFieldName(f) as AstNode | null).find((n) => n !== null) ?? null;
      if (!nameNode || nameNode.text.trim() !== paramName) continue;
      const typeNode = param.childForFieldName("type") as AstNode | null;
      return typeNode ? typeNode.text : null;
    }
  }
  return null;
}

/** Palabra reservada del LENGUAJE para un primitivo — copia deliberada (ver
 *  el resto del archivo: `SELF_PREFIXES`, `BRANCH_SWITCH_WORD`, todos
 *  duplicados a propósito de un archivo de otro dueño) de
 *  `graph/edges/declara-tipo.ts#PRIMITIVE_TYPE_WORDS`, nunca léxico de
 *  dominio: un primitivo escrito no es candidato a "tipo externo" — no es un
 *  tipo del repo, pero tampoco es lo que esta compuerta pregunta. */
const PRIMITIVE_TYPE_WORDS: ReadonlySet<string> = new Set([
  "bool", "byte", "complex64", "complex128", "float32", "float64", "int", "int8", "int16", "int32", "int64",
  "rune", "string", "uint", "uint8", "uint16", "uint32", "uint64", "uintptr",
  "float", "complex", "str", "bytes", "bytearray", "None", "NoneType",
]);

/** Texto de tipo escrito (posiblemente con puntero/nullable/genérico/array)
 *  reducido al nombre NOMINAL simple, o `null` si no tiene forma de tipo
 *  nominal (primitivo, compuesto, vacío). Nunca resuelve nada — sólo
 *  normaliza texto, mismo espíritu que `discriminantSubject`. */
const NOMINAL_TYPE_TEXT = /^[A-Za-z_$][\w$]*([.:]{1,2}[A-Za-z_$][\w$]*)*$/;
function simpleNominalTypeName(raw: string): string | null {
  let t = raw.trim();
  // Desenvolvimiento de FORMA, no de lenguaje: en TypeScript el campo `type`
  // de un parámetro resuelve a un nodo `type_annotation` cuyo `.text`
  // INCLUYE el separador (`": RoundingMode"`, verificado por sonda directa,
  // `scratchpad/probe-ts-param.mts` de esta ola) — el mismo desenvolvimiento
  // que `graph/edges/declara-tipo.ts#TRANSPARENT_TYPE_NODE` ya documenta
  // para el mismo nodo. Sin este paso el texto entero fallaba
  // `NOMINAL_TYPE_TEXT` (no arranca con un identificador) y TODO parámetro
  // tipado de TS quedaba invisible para esta compuerta.
  t = t.replace(/^:\s*/, "");
  t = t.replace(/^\*+/, "").replace(/[?\s]+$/, "");
  const cut = t.search(/[<[({]/);
  if (cut >= 0) t = t.slice(0, cut).trim();
  if (t.length === 0 || !NOMINAL_TYPE_TEXT.test(t)) return null;
  const segments = t.split(/[.:]+/).filter((s) => s.length > 0);
  const simple = segments[segments.length - 1] ?? null;
  if (!simple || !/^[A-Z]/.test(simple) || PRIMITIVE_TYPE_WORDS.has(simple)) return null;
  return simple;
}

/**
 * Los nombres de tipo que `problem.detail` ya trae para `type-switch`
 * (`"Tipos decididos: X, Y, Z."`, ver `type-switch.ts`, SIEMPRE al final del
 * texto) — CERO trabajo de AST nuevo, reusa lo que ese detector ya extrajo
 * por gramática.
 *
 * BUG MEDIDO Y CERRADO en esta misma ola (verificado contra
 * `corpus-app/gitea/modules/markup/markdown/goldmark.go:63`, un `switch v :=
 * n.(type) { case *ast.Paragraph: … }` real sobre el paquete EXTERNO
 * `goldmark/ast`): la primera versión de este regex cortaba en el PRIMER
 * punto (`[^.]+`), y un tipo CALIFICADO (`ast.Paragraph`, `ast.List`, …) YA
 * TIENE un punto adentro — el mismo caso que esta compuerta más necesita
 * atrapar (un tipo con paquete/namespace es la forma típica de un tipo
 * EXTERNO). Con `[^.]+` la captura se truncaba en "*ast" y ningún candidato
 * sobrevivía `simpleNominalTypeName` (minúscula, se descarta): cero
 * candidatos, cero exclusión — el defecto exacto que dejaba pasar el caso
 * que more debía atrapar. `(.+)\.\s*$`, ávido y anclado al FINAL del texto
 * (la oración siempre termina con exactamente un punto final, nunca uno
 * interno sin más texto detrás — `type-switch.ts` la construye así), captura
 * TODO lo que hay entre "Tipos decididos: " y el ÚLTIMO punto, puntos
 * internos de nombres calificados incluidos.
 */
const TYPE_SWITCH_TYPES_LIST = /Tipos decididos: (.+)\.\s*$/;

/* ────────────────────────────────────────────────────────────────────────
 * OLA AL, FRENTE AL4 — LA COMPUERTA QUE, PARA UN SUBCONJUNTO IDENTIFICABLE
 * DE SU ENTRADA, NO PODÍA EXCLUIR NUNCA POR CONSTRUCCIÓN.
 *
 * `externalDiscriminantTypeCheck` pregunta *"¿el tipo que discrimina esta
 * rama resuelve a una declaración de ESTE repo?"*. Para el ancla
 * `type-switch` sus candidatos salían de `simpleNominalTypeName`, que
 * descarta:
 *   (i)  todo nombre SIN INICIAL MAYÚSCULA — pero en Go la mayúscula dice
 *        "exportado", no "tipo": `type shortcode struct` es un tipo del
 *        propio paquete y se escribe en minúscula (caso real, medido:
 *        `hugo/hugolib/shortcode.go:446`);
 *   (ii) todo nombre que no sea un camino nominal a secas — y las cinco
 *        gramáticas tipadas escriben la prueba de tipo de un `case` como un
 *        PATRÓN DE DECLARACIÓN, o sea `Tipo nombre`: el detector cita
 *        literalmente `"Type t"`, `"JArray a"`, `"RectangleAnnotation
 *        rectangle"` (casos reales, medidos: `newtonsoft-json/…/
 *        ReflectionUtils.cs:838` —el "System.Reflection" que la Ola Y
 *        nombró— y `ShareX/…/ShareXResources.cs:294`).
 * Con las dos, la lista de candidatos quedaba VACÍA y la compuerta devolvía
 * `holds: true` con la evidencia *"no se extrajo ningún nombre con forma de
 * tipo"*: **para ese subconjunto la exclusión era imposible, no improbable.**
 *
 * EL LÍMITE, Y ES LA RAZÓN POR LA QUE ESTO SÓLO CORRE EN LA VARIANTE
 * `switch`: el detector `type-switch` pasa el nombre del tipo por
 * `normalizeSubject` —que lo BAJA A MINÚSCULAS— únicamente en su camino de
 * ESCALERA (`type-switch.ts:300`); en el camino de `switch`/`case` lo cita
 * tal como se escribió. Sobre un nombre ya aplastado a minúsculas la única
 * comparación posible contra las declaraciones del repo es insensible a
 * mayúsculas, y una resolución así es AMBIGUA — y lo ambiguo viaja como
 * ambiguo, nunca decide una exclusión. Medido, y por eso no se hace: con
 * resolución insensible sobre la escalera la compuerta apagaría además 30
 * propuestas falsas conocidas, pero **también una VERDADERA**
 * (`hugo/markup/goldmark/render_hooks.go:274`, `*ast.String`/`*ast.Text`).
 * Se publica el número y no se aterriza.
 * ──────────────────────────────────────────────────────────────────────── */

/** La variante del ancla `type-switch` en la que el nombre del tipo llega con su CASE original — ver el bloque de arriba. */
const TYPE_SWITCH_CASE_PRESERVING_VARIANT = "switch";

/** Cómo leyó la gramática cada nombre citado. `primitivo` = palabra reservada del lenguaje para un primitivo (no hay declaración a la que mudarle comportamiento); `nominal` = un nombre que PODRÍA ser una declaración; `ilegible` = no tiene forma de nombre. */
type CitedTypeName = { readonly clase: "primitivo" | "nominal" | "ilegible"; readonly nombre: string | null };

/**
 * El nombre citado por el detector, desenvuelto SÓLO por FORMA:
 *   1. el PRIMER token — el patrón de declaración escribe `Tipo nombre` y el
 *      nombre ligado nunca es el tipo (mismo criterio, y por el mismo motivo,
 *      que `typeFieldWithinLabel` ya aplica leyendo el campo `type` del
 *      `declaration_pattern`: la gramática separa el tipo del nombre ligado);
 *   2. puntero/referencia, genérico, arreglo y calificación por punto o doble
 *      dos-puntos — los mismos desenvolvimientos que `simpleNominalTypeName`;
 *   3. una palabra primitiva **a secas** se marca `primitivo`; una CALIFICADA
 *      (`ast.String`) NO, porque el último segmento de un camino calificado
 *      no es una palabra del lenguaje aunque se escriba igual.
 * NO exige inicial mayúscula: ver (i) arriba.
 */
function citedTypeName(raw: string): CitedTypeName {
  let t = raw.trim().split(/\s+/)[0] ?? "";
  t = t.replace(/^[*&]+/, "").replace(/[?]+$/, "");
  const cut = t.search(/[<[({]/);
  if (cut >= 0) t = t.slice(0, cut).trim();
  if (t.length === 0 || !NOMINAL_TYPE_TEXT.test(t)) return { clase: "ilegible", nombre: null };
  const segments = t.split(/[.:]+/).filter((s) => s.length > 0);
  const simple = segments[segments.length - 1] ?? null;
  if (!simple) return { clase: "ilegible", nombre: null };
  if (segments.length === 1 && PRIMITIVE_TYPE_WORDS.has(simple)) return { clase: "primitivo", nombre: simple };
  return { clase: "nominal", nombre: simple };
}

/** Los nombres que el detector `type-switch` citó en su `detail`, ya clasificados. `[]` si no citó ninguno o si el ancla aplastó su case (variante escalera). */
function citedTypeNames(problem: Problem): CitedTypeName[] {
  if (problem.variant !== TYPE_SWITCH_CASE_PRESERVING_VARIANT) return [];
  const match = TYPE_SWITCH_TYPES_LIST.exec(problem.detail);
  if (!match) return [];
  return match[1]!.split(",").map((raw) => citedTypeName(raw));
}

/**
 * INTENCIÓN QUE VERIFICA: *"la escalera decide entre las formas BÁSICAS que
 * la gramática del lenguaje ya provee — un entero de tal ancho, un texto, un
 * flotante — y no entre miembros de una familia que alguien declaró"*. No hay
 * ninguna declaración a la que mudarle el comportamiento: `int8` no puede
 * recibir un método de este repo. Reconoce: `switch target.(type) { case
 * int: … case int8: … }`. NO reconoce: una escalera con AL MENOS UN nombre
 * que podría ser una declaración, aunque los demás sean primitivos —
 * `case string: … case *shortcode:` sigue viva, y es una propuesta VERDADERA
 * conocida (`hugo/hugolib/shortcode.go:446`).
 */
function allCitedNamesAreLanguageWords(problem: Problem): CitedTypeName[] | null {
  const cited = citedTypeNames(problem);
  if (cited.length < 2) return null; // el ancla ya exige ≥2 tipos distintos; menos que eso no es esta figura.
  return cited.every((c) => c.clase === "primitivo") ? cited : null;
}

function typeSwitchDetailCandidates(problem: Problem): string[] {
  const cited = citedTypeNames(problem);
  if (cited.length > 0) {
    return cited.filter((c) => c.clase === "nominal").map((c) => c.nombre!);
  }
  // Variante ESCALERA (o `detail` sin lista): se lee como siempre, con el
  // filtro de inicial mayúscula intacto. Ver el bloque de arriba para por qué
  // acá no se ensancha nada.
  const match = TYPE_SWITCH_TYPES_LIST.exec(problem.detail);
  if (!match) return [];
  return match[1]!
    .split(",")
    .map((raw) => simpleNominalTypeName(raw))
    .filter((n): n is string => n !== null);
}

/** Los candidatos a "tipo que discrimina esta rama", de las tres fuentes del
 *  docstring de arriba. `[]` cuando no hay ninguno reconocible — nunca una
 *  señal de exclusión por sí sola (ver `externalDiscriminantTypeCheck`). */
function discriminatingTypeCandidates(ctx: HypothesisContext, problem: Problem): readonly string[] {
  if (problem.kind === TYPE_SWITCH_ANCHOR) return typeSwitchDetailCandidates(problem);
  if (!ctx.file) return [];
  const fn = findEnclosingFunction(ctx.file, problem);
  if (!fn) return [];
  const sets = ctx.setsFor(ctx.file.language);
  const chainNode = findChainNode(fn.node, sets, reportedChainStartLine(problem));
  if (!chainNode) return [];

  const names = new Set<string>();
  if (sets.switchContainerNodes.has(chainNode.type)) {
    for (const c of switchArmLabelCandidates(chainNode)) names.add(c);
  } else {
    let current: AstNode | null = chainNode;
    while (current && current.childForFieldName("condition")) {
      const cond = current.childForFieldName("condition") as AstNode | null;
      if (cond) {
        const value = comparedValueText(cond.text.replace(/[()]/g, "").trim());
        if (value) for (const c of typeLikeCandidatesIn(value)) names.add(c);
      }
      const alt = current.childForFieldName("alternative") as AstNode | null;
      current = alt ? unwrapAlternative(alt) : null;
    }
  }

  const subjectText = chainDiscriminantText(chainNode);
  const subject = subjectText ? discriminantSubject(subjectText) : null;
  if (subject && BARE_IDENTIFIER.test(subject)) {
    const paramType = declaredParamTypeText(fn, subject);
    const simple = paramType ? simpleNominalTypeName(paramType) : null;
    if (simple) names.add(simple);
  }

  return [...names].map((n) => simpleNominalTypeName(n) ?? n).filter((n, i, arr) => arr.indexOf(n) === i);
}

/** `nombre simple ⇒ ids de nodo` de TODO símbolo `family === "class-like"`
 *  del grafo — memoizado por identidad de `CodeGraph` (regla de costo de
 *  esta ola). `class-like` es estructural (`code-grammar.ts#isClassLike`:
 *  campo `body` + campo `name`, no función-like — clase, struct, record,
 *  interfaz, enum, en los 9 lenguajes) y GENÉRICO: ni un nombre de framework
 *  ni de ecosistema entra acá. */
const CLASS_LIKE_NAME_INDEX_CACHE = new WeakMap<CodeGraph, ReadonlyMap<string, ReadonlySet<string>>>();
function classLikeNameIndex(graph: CodeGraph): ReadonlyMap<string, ReadonlySet<string>> {
  const hit = CLASS_LIKE_NAME_INDEX_CACHE.get(graph);
  if (hit) return hit;
  const byName = new Map<string, Set<string>>();
  for (const n of graph.nodes) {
    if (n.kind !== "symbol" || n.family !== "class-like") continue;
    const name = n.symbolPath[n.symbolPath.length - 1];
    if (!name) continue;
    const set = byName.get(name) ?? new Set<string>();
    set.add(n.id);
    byName.set(name, set);
  }
  CLASS_LIKE_NAME_INDEX_CACHE.set(graph, byName);
  return byName;
}

/**
 * Interruptor de SÓLO MEDICIÓN (Ola Z, Z7) — apaga ÚNICAMENTE esta
 * compuerta, sin tocar nada más, para poder medir su delta A/B sobre el
 * MISMO estado del árbol: el analizador está sin trackear en git, así que
 * no hay `git stash`/`checkout` con el que "volver a antes" para comparar.
 * Corriendo `dump-hallazgos.mts` una vez con `CK_STRATEGY_TIPO_EXTERNO=0` y
 * otra vez sin fijarla (default: activada), la diferencia de población de
 * Strategy entre las dos corridas es exactamente el efecto de esta
 * compuerta — nunca el de otro frente tocando el mismo árbol en paralelo,
 * porque las dos corridas comparten el mismo commit implícito del árbol.
 * Nunca se lee en ningún otro lugar del archivo.
 */
function externalDiscriminantGateEnabled(): boolean {
  const raw = process.env.CK_STRATEGY_TIPO_EXTERNO;
  if (raw === undefined) return true;
  return !["0", "off", "false", "no"].includes(raw.trim().toLowerCase());
}

function externalDiscriminantTypeCheck(ctx: HypothesisContext): Check<Problem, Graph> {
  return {
    id: "tipo-discriminante-no-externo",
    describe:
      "el tipo que discrimina esta rama no es, con evidencia, un tipo EXTERNO (de una gramática/biblioteca/stdlib que este repo no declara) — no se puede reemplazar por polimorfismo un tipo que el repo no controla ni puede extender",
    run: (problem, graph) => {
      if (!externalDiscriminantGateEnabled()) {
        return { holds: true, evidence: "compuerta apagada por CK_STRATEGY_TIPO_EXTERNO=0 (interruptor de sólo medición, Ola Z Z7)." };
      }
      if (!graph) {
        return { holds: true, evidence: "grafo no disponible en este cableado: no se puede confirmar que el tipo discriminante sea externo, no se excluye." };
      }
      const candidates = discriminatingTypeCandidates(ctx, problem);
      if (candidates.length === 0) {
        // OLA AL, AL4 — la figura "formas básicas de la gramática". Ver
        // `allCitedNamesAreLanguageWords`: NO es "no se pudo mirar", es
        // "se miró y lo que hay son palabras del lenguaje".
        const soloPalabrasDelLenguaje = allCitedNamesAreLanguageWords(problem);
        if (soloPalabrasDelLenguaje) {
          return {
            holds: false,
            evidence: `los ${soloPalabrasDelLenguaje.length} tipos que decide esta escalera (${soloPalabrasDelLenguaje.map((c) => c.nombre).join(", ")}) son palabras primitivas del propio lenguaje, ninguna con una declaración de este repo detrás: no hay ningún tipo al que mudarle el comportamiento — Strategy no aplica sobre las formas básicas que la gramática ya provee.`,
          };
        }
        return {
          holds: true,
          evidence: "no se extrajo ningún nombre con forma de tipo (camino cualificado, constante-clase, o tipo escrito del parámetro discriminante) de esta cadena: no se puede confirmar externalidad, no se excluye.",
        };
      }
      const index = classLikeNameIndex(graph);
      const declared: string[] = [];
      const ambiguous: string[] = [];
      const external: string[] = [];
      for (const name of candidates) {
        const hits = index.get(name);
        if (!hits || hits.size === 0) external.push(name);
        else if (hits.size === 1) declared.push(name);
        else ambiguous.push(name);
      }
      if (declared.length > 0 || ambiguous.length > 0) {
        const parts: string[] = [];
        if (declared.length > 0) parts.push(`"${declared.join(", ")}" resuelve a una declaración de este repo`);
        if (ambiguous.length > 0) parts.push(`"${ambiguous.join(", ")}" resuelve a MÁS DE UNA declaración de este repo (ambiguo, no se colapsa a un candidato)`);
        return { holds: true, evidence: `de los tipos discriminados (${candidates.join(", ")}), ${parts.join(" y ")} — no se confirma que el despacho sea sobre un tipo externo.` };
      }
      return {
        holds: false,
        evidence: `el/los tipo(s) que discrimina(n) esta rama (${external.join(", ")}) no resuelve(n) a NINGÚN nodo "class-like" de este repo: es despacho sobre un tipo que este repo no declara y no puede extender — Strategy no aplica sobre un tipo que no se controla.`,
      };
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * Ola 10 — `structuralStrategyEvidence`: la forma COMPLETA/PARCIAL vía
 * GRAFO. Ver el docstring del módulo ("excluder de ya-aplicado/parcial")
 * para las dos rutas — el bloqueo de producción que citaba ese docstring
 * quedó CERRADO por la Ola V (ver la nota al pie de esa sección): esta
 * función corre con `graph` real en la segunda pasada de
 * `code-analyzer.ts#crossAnalyze` (`rebuildHypothesesWithGraph`), no sólo en
 * los tests. Todo lo de acá abajo es puro sobre `graph`/`problem` — nunca
 * toca `ctx.file`.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * INTENCIÓN QUE VERIFICA (Ola U, N5): *"las ≥2 candidatas comparten UN protocolo
 * DECLARADO por el autor — un cliente puede sostener a cualquiera de ellas por
 * el mismo tipo"*. No verifica "estos dos tipos tienen los mismos miembros":
 * eso es una COINCIDENCIA de forma, no una decisión de diseño, y es exactamente
 * la inferencia por conjunto de miembros que `deriveSatisfiesEdges` hace
 * (`graph/edges/satisfies-derive.ts:430`, `provenance: "inferred"|"ambiguous"`
 * SIEMPRE — nunca `declared`).
 *
 * POR QUÉ CAMBIÓ, medido, no supuesto: hasta esta ola el conjunto era
 * `{implements, satisfies}`. Sobre el grafo REAL de `corpus/sqlalchemy`
 * (sonda `scripts/n5-probe-strategy-registry.mts`) eso agrupaba, por ejemplo,
 * `_NoLoader` como "protocolo" con NUEVE "implementadores" que en realidad son
 * sus propios HERMANOS (`satisfies←LoaderStrategy`, `←_ColumnLoader`,
 * `←_ExpressionColumnLoader`, `←_DeferredColumnLoader`, `←_LazyLoader`,
 * `←_ImmediateLoader`, `←_SubqueryLoader`, `←_JoinedLoader`, `←_SelectInLoader`)
 * — una familia FABRICADA, del mismo modo que las 1.360 aristas falsas que ese
 * derivador ya produjo. Y a la vez el protocolo REAL de esa misma familia
 * (`extends → LoaderStrategy`/`_AbstractRelationshipLoader`/`_PostLoader`) era
 * INVISIBLE porque `extends` no estaba en el conjunto: en `sqlalchemy` hay
 * 1.927 aristas `extends` y CERO `implements`. Las dos mitades del bug se
 * arreglan con el mismo cambio.
 *
 * `satisfies` sigue leyéndose, pero SÓLO para corroborar (y para bajar la
 * confianza con una nota de riesgo) una familia que ya existe por herencia o
 * interfaz declarada — nunca para crear una.
 */
const PROTOCOL_EDGE_KINDS = new Set(["extends", "implements"]);
/** Inferida por coincidencia de miembros — se LEE para corroborar (nota de riesgo), nunca para agrupar. Ver arriba. */
const CORROBORATING_EDGE_KINDS = new Set(["satisfies"]);

interface StrategyGraphIndex {
  readonly nodeById: ReadonlyMap<string, CodeGraphNode>;
  readonly edgesFrom: ReadonlyMap<string, readonly CodeGraphEdge[]>;
}

/**
 * Memoizado por identidad del `CodeGraph` (Ola Y, Y5 — costo), misma disciplina
 * que `wrapping-chain.ts#CHAINS_CACHE` y `chain-of-responsibility.ts#GINDEX_CACHE`
 * (Ola V): `structuralStrategyEvidence` corre por hallazgo que pasa los
 * `required`, y `run.ts` corre `build()` dos veces por hallazgo, así que este
 * índice de repo entero se reconstruía una vez por cada uno. Es una función pura
 * de `(edges, graph)`. La clave es el ARREGLO `edges` y no el grafo, por la
 * misma razón que `confident-edges.ts#CACHE` documenta: un arreglo de aristas
 * distinto —el único parámetro que puede variar sin que varíe el otro— produce
 * automáticamente una entrada nueva, así que la caché no puede quedar vencida
 * sin que la clave cambie. `WeakMap` ⇒ la entrada muere con el arreglo.
 */
const STRATEGY_INDEX_CACHE = new WeakMap<readonly CodeGraphEdge[], StrategyGraphIndex>();

/** Mismo índice mínimo que `wrapping-chain.ts#buildIndex` — O(nodos+aristas), sobre las aristas YA filtradas por `confidentEdges` (nunca `ambiguous`, CONTRATO-F9.md §4.5). */
function buildStrategyGraphIndex(edges: readonly CodeGraphEdge[], graph: CodeGraph): StrategyGraphIndex {
  const hit = STRATEGY_INDEX_CACHE.get(edges);
  if (hit) return hit;
  const nodeById = new Map<string, CodeGraphNode>();
  for (const n of graph.nodes) if (!nodeById.has(n.id)) nodeById.set(n.id, n);
  const edgesFrom = new Map<string, CodeGraphEdge[]>();
  for (const e of edges) {
    const list = edgesFrom.get(e.from);
    if (list) list.push(e);
    else edgesFrom.set(e.from, [e]);
  }
  const index: StrategyGraphIndex = { nodeById, edgesFrom };
  STRATEGY_INDEX_CACHE.set(edges, index);
  return index;
}

function asGraphIndex(idx: StrategyGraphIndex): GraphIndex {
  return { nodeById: (id) => idx.nodeById.get(id) ?? null, edgesFrom: (id) => idx.edgesFrom.get(id) ?? [] };
}

/** Id del nodo símbolo `ownerId.<name>` — misma técnica que `wrapping-chain.ts#memberNodeId`: leído de la arista `contains` real, nunca reconstruido por concatenación de `symbolPath` (evita asumir que se concatena igual en los 9 lenguajes). */
function strategyMemberNodeId(idx: StrategyGraphIndex, ownerId: string, name: string): string | null {
  for (const e of idx.edgesFrom.get(ownerId) ?? []) {
    if (e.kind !== "contains") continue;
    const target = idx.nodeById.get(e.to);
    if (target?.kind === "symbol" && target.family === "function-like" && target.symbolPath[target.symbolPath.length - 1] === name) {
      return target.id;
    }
  }
  return null;
}

interface InterfaceGroup {
  readonly interfaceId: string;
  readonly implementers: readonly { readonly id: string; readonly viaSatisfies: boolean }[];
  readonly memberName: string;
  readonly memberArity: number | null;
}

/**
 * Familias por PROTOCOLO DECLARADO (`extends`/`implements` — ver
 * `PROTOCOL_EDGE_KINDS`) con >=2 miembros de familia, compartiendo UN miembro
 * (name,arity) — "la operación" — en TODOS ellos (vía `memberSignatures`).
 * Excluye el grupo ENTERO si dos de ellos se instancian entre sí
 * (`instantiates` confidente, cualquier dirección): esa es la forma de State,
 * no Strategy — la exclusión que pide la tarea.
 *
 * LOCALIDAD (Ola U, N5 — antes: TODOS los implementadores tenían que estar
 * declarados en `file`). La intención que la localidad protege es *"la familia
 * de la que habla este hallazgo es la que vive acá, no una cualquiera del
 * repo"* — y para eso alcanza con que la familia ESTÉ ANCLADA en este archivo
 * (el protocolo o al menos un miembro declarado acá). Exigir que la familia
 * ENTERA viva en un solo archivo no verifica ninguna intención: verifica un
 * estilo de organización de archivos. Medido sobre `corpus/sqlalchemy`
 * (`scripts/n5-probe-strategy-registry.mts`): de las 242 familias con miembro
 * común, 151 (62 %) tienen al menos un hermano en OTRO archivo — con la regla
 * vieja eran invisibles todas.
 */
function findInterfaceGroups(edges: readonly CodeGraphEdge[], idx: StrategyGraphIndex, file: string): readonly InterfaceGroup[] {
  const byInterface = new Map<string, Map<string, boolean>>(); // interfaceId -> implementerId -> corroborado por satisfies
  const corroborated = new Set<string>(); // `${interfaceId}|${implementerId}` con arista `satisfies` además de la declarada
  for (const e of edges) {
    if (CORROBORATING_EDGE_KINDS.has(e.kind)) {
      corroborated.add(`${e.to}|${e.from}`);
      continue;
    }
    if (!PROTOCOL_EDGE_KINDS.has(e.kind)) continue;
    const implementer = idx.nodeById.get(e.from);
    if (!implementer || implementer.kind !== "symbol") continue;
    const byImpl = byInterface.get(e.to) ?? new Map<string, boolean>();
    byImpl.set(e.from, byImpl.get(e.from) ?? false);
    byInterface.set(e.to, byImpl);
  }

  const gi = asGraphIndex(idx);
  const groups: InterfaceGroup[] = [];
  for (const [interfaceId, byImpl] of byInterface) {
    const implementers = [...byImpl.entries()].map(([id]) => ({ id, viaSatisfies: corroborated.has(`${interfaceId}|${id}`) }));
    if (implementers.length < 2) continue;
    // Localidad: el protocolo o al menos un miembro de la familia se declara acá.
    const anchoredHere = idx.nodeById.get(interfaceId)?.file === file || implementers.some((i) => idx.nodeById.get(i.id)?.file === file);
    if (!anchoredHere) continue;

    const ids = new Set(implementers.map((i) => i.id));
    const instantiateAmongThemselves = implementers.some((a) =>
      (idx.edgesFrom.get(a.id) ?? []).some((e) => e.kind === "instantiates" && e.to !== a.id && ids.has(e.to)),
    );
    if (instantiateAmongThemselves) continue; // State, no Strategy — exclusión de la tarea.

    const firstMembers = memberSignatures(gi, implementers[0]!.id);
    let common: { name: string; arity: number | null } | null = null;
    for (const m of firstMembers) {
      if (implementers.every((impl) => memberSignatures(gi, impl.id).some((mm) => mm.name === m.name && mm.arity === m.arity))) {
        common = { name: m.name, arity: m.arity };
        break;
      }
    }
    if (!common) continue;

    groups.push({ interfaceId, implementers, memberName: common.name, memberArity: common.arity });
  }
  return groups;
}

interface DispatchCarrier {
  readonly carrierId: string;
  readonly targets: readonly { readonly id: string; readonly name: string; readonly arity: number | null }[];
}

/**
 * INTENCIÓN QUE VERIFICA (Ola U, N5): *"del grafo se puede LEER la firma de
 * este invocable"* — condición previa para poder afirmar después que dos
 * invocables de la misma tabla NO son intercambiables. Un literal anónimo
 * (`sym:...<anon@n>`, `graph/edges/portador.ts`) no tiene nombre ni aridad en
 * el grafo: su "firma" es `<anon@0>#?`, distinta de `<anon@2>#?` por
 * construcción, aunque las dos lambdas tengan exactamente la misma forma.
 *
 * MEDIDO, no supuesto: sobre el grafo real de `corpus/sqlalchemy` hay 662
 * portadores con >=2 destinos, y la ruta PARCIAL los declaraba a los 662
 * "heterogéneos" — casi todos por este artefacto (ejemplos volcados por
 * `scripts/n5-probe-strategy-registry.mts`:
 * `PGDialect_asyncpg._disable_asyncpg_inet_codecs.encoder@0 → [<anon@0>#?,
 * <anon@4>#?]`). "No se conoce la firma" no es "las firmas difieren".
 */
function signatureIsKnown(t: { readonly name: string; readonly arity: number | null }): boolean {
  // `<` es el marcador de nodo SINTÉTICO del propio grafo (CONTRATO-F9.md §3.2,
  // `sym:...<anon@n>`) — vocabulario de la representación, nunca de dominio.
  return t.arity !== null && t.name.length > 0 && !t.name.startsWith("<");
}

/**
 * Portadores DECLARADOS en `file` con `carries` fan-in >=2 (hacia >=2
 * símbolos function-like DISTINTOS) e `invokes-indirect` fan-in >=1 — la
 * tabla de despacho medida por VALOR (grafo), no por forma de AST. Esto es
 * el requisito 2 de la tarea aplicado a la pieza que faltaba: reemplaza la
 * heurística de `hasDispatchTable` (forma de literal `pair`) por estructura
 * real cuando hay grafo — `hasDispatchTable` sigue siendo el único camino
 * cuando no lo hay (`graph === null`, la producción de hoy).
 */
function findDispatchCarriers(edges: readonly CodeGraphEdge[], idx: StrategyGraphIndex, file: string): readonly DispatchCarrier[] {
  const byCarrier = new Map<string, Map<string, { name: string; arity: number | null }>>();
  for (const e of edges) {
    if (e.kind !== "carries") continue;
    const carrier = idx.nodeById.get(e.from);
    if (!carrier || carrier.file !== file) continue;
    const target = idx.nodeById.get(e.to);
    if (!target || target.kind !== "symbol" || target.family !== "function-like") continue;
    const targets = byCarrier.get(e.from) ?? new Map<string, { name: string; arity: number | null }>();
    const name = target.symbolPath[target.symbolPath.length - 1] ?? "";
    targets.set(target.id, { name, arity: target.arity ?? null });
    byCarrier.set(e.from, targets);
  }
  const invoked = new Set<string>();
  for (const e of edges) {
    if (e.kind === "invokes-indirect" && byCarrier.has(e.to)) invoked.add(e.to);
  }
  const out: DispatchCarrier[] = [];
  for (const [carrierId, targets] of byCarrier) {
    if (targets.size >= 2 && invoked.has(carrierId)) {
      out.push({ carrierId, targets: [...targets.entries()].map(([id, t]) => ({ id, ...t })) });
    }
  }
  return out;
}

interface StructuralEvidence {
  readonly state: "ya-aplicado" | "parcial";
  readonly why: string;
}

/**
 * La forma COMPLETA/PARCIAL vía grafo — ver el docstring del módulo para las
 * dos rutas exactas. `null` ⇒ sin evidencia de grafo (incluye `graph ===
 * null`, el caso de producción de hoy): el resto de `appliedStateFor` decide
 * como siempre (AST o el fallback conservador).
 */
function structuralStrategyEvidence(graph: Graph, problem: Problem): StructuralEvidence | null {
  if (!graph) return null;
  const file = problem.locations[0].file;
  const ownSymbol = problem.locations[0].symbol ?? null;
  const edges = confidentEdges(graph);
  const idx = buildStrategyGraphIndex(edges, graph);
  const groups = findInterfaceGroups(edges, idx, file);
  const carriers = findDispatchCarriers(edges, idx, file);

  for (const g of groups) {
    const memberIdByImpl = new Map<string, string>();
    for (const impl of g.implementers) {
      const id = strategyMemberNodeId(idx, impl.id, g.memberName);
      if (id) memberIdByImpl.set(impl.id, id);
    }
    if (memberIdByImpl.size < 2) continue; // no se pudo ubicar el nodo del miembro en >=2 implementadores — sin eso no hay con qué exigir consumidor ni localidad.
    const memberIds = new Set(memberIdByImpl.values());

    const interfaceMemberId = strategyMemberNodeId(idx, g.interfaceId, g.memberName);
    const directCall = interfaceMemberId ? edges.some((e) => e.kind === "calls" && e.to === interfaceMemberId) : false;
    const carrierMatch = carriers.find((c) => c.targets.filter((t) => memberIds.has(t.id)).length >= 2) ?? null;
    if (!directCall && !carrierMatch) continue; // interfaz + implementadores reales, pero sin consumidor: no alcanza para COMPLETA (podría ser una jerarquía sin uso, no Strategy en funcionamiento).

    // Localidad (mismo criterio que `decorator.ts#graphOverride` a nivel de
    // clase dueña): esta cadena tiene que VIVIR dentro de uno de los
    // implementadores confirmados. Si no, hay una Strategy en el archivo
    // pero SIN relación con esta cadena puntual — no es "esta" Strategy la
    // que ya-aplica.
    // Ola U (N5): además del nombre, el miembro que aloja la cadena tiene que
    // estar DECLARADO EN ESTE ARCHIVO. Con familias que ahora pueden cruzar
    // archivos (ver `findInterfaceGroups`), sólo comparar el nombre corto
    // volvería a abrir la puerta a un homónimo de otro archivo — la localidad
    // que este bloque protege es "esta cadena vive dentro de la familia", no
    // "existe en el repo algo que se llama igual".
    const ownIsImplementer = ownSymbol
      ? [...memberIdByImpl.values()].some((mid) => {
          const n = idx.nodeById.get(mid);
          return n?.symbolPath.at(-1) === ownSymbol && n.file === file;
        })
      : false;
    if (!ownIsImplementer) continue;

    const riskNote = g.implementers.some((i) => i.viaSatisfies)
      ? " — nota: alguna relación de la familia está además corroborada por `satisfies` (inferida por coincidencia de miembros, `graph/edges/satisfies-derive.ts`); la familia NO se armó con esa arista, sólo con protocolo declarado."
      : "";
    const consumerWhy = directCall
      ? `un consumidor llama directamente al miembro de la interfaz ("${g.interfaceId}.${g.memberName}")`
      : `un portador porta >=2 de esos miembros (carries fan-in ${carrierMatch!.targets.length}) y se invoca indirectamente (invokes-indirect) — la tabla de despacho, por grafo`;

    return {
      state: "ya-aplicado",
      why: `esta cadena vive dentro de "${ownSymbol}", un miembro que ya es parte de una Strategy COMPLETA: >=2 implementadores de la interfaz comparten "${g.memberName}/${g.memberArity ?? "?"}" y ${consumerWhy}${riskNote} La cadena reportada es la lógica interna de ESTA variante, no ausencia de Strategy.`,
    };
  }

  // PARCIAL: sin la localidad de arriba — es una propiedad del ARCHIVO (hay
  // un despacho ad hoc real, verificado por grafo), no de esta cadena puntual.
  //
  // INTENCIÓN QUE VERIFICA: *"la selección dinámica YA EXISTE, pero lo que se
  // selecciona no es sustituible: los invocables de la tabla no comparten
  // contrato, así que el llamador no puede tratarlos como variantes de un
  // mismo trabajo"*. Ola U (N5): sólo se puede AFIRMAR eso sobre invocables
  // cuya firma el grafo realmente conoce (ver `signatureIsKnown`) — antes,
  // dos lambdas anónimas alcanzaban para declararlo, porque sus nodos
  // sintéticos nunca coinciden entre sí.
  for (const c of carriers) {
    const known = c.targets.filter(signatureIsKnown);
    if (known.length < 2) continue;
    const firmas = new Set(known.map((t) => `${t.name}#${t.arity ?? "?"}`));
    if (firmas.size >= 2) {
      return {
        state: "parcial",
        why: `un portador real (grafo: carries fan-in ${c.targets.length} + invokes-indirect) ya despacha entre ${c.targets.length} invocables, y de los ${known.length} cuya firma el grafo conoce NO comparten firma (${[...firmas].join(", ")}) ni una interfaz común confirmada — despacho ad hoc: funciona, no es sustituible.`,
      };
    }
  }
  return null;
}

/**
 * SÓLO PARA MEDICIÓN (Ola 10, `scripts/measure-strategy-structural.mts`) —
 * no es parte de `HypothesisBuilder` ni la consume ningún `Check`. Cuenta,
 * para UN archivo, cuántos grupos de interfaz (>=2 implementadores, miembro
 * común, sin instanciarse entre sí) tienen consumidor real (COMPLETA) vs. no
 * (interfaz sin uso confirmado), y cuántos portadores heterogéneos (PARCIAL)
 * hay — sin necesitar un `Finding` (a diferencia de `structuralStrategyEvidence`,
 * que sí lo pide para la localidad de COMPLETA). Existe para poder medir
 * sobre el grafo real de los 8 repos SIN reconstruir un `Finding` a mano
 * desde el `CodeFinding` que expone `analyzeRepo` (formas distintas — éste
 * no lleva `trigger`, ver `shared/types.ts#CodeFinding`).
 */
export function probeStrategyStructure(
  graph: CodeGraph,
  file: string,
): {
  readonly groupsWithConsumer: number;
  readonly groupsWithoutConsumer: number;
  readonly heterogeneousCarriers: number;
  /** Ola U (N5): portadores con >=2 destinos de los que el grafo NO conoce la firma de al menos dos — no se puede afirmar NI negar sustituibilidad. Ver `signatureIsKnown`. */
  readonly carriersWithoutKnownSignatures: number;
  readonly carriers: number;
} {
  const edges = confidentEdges(graph);
  const idx = buildStrategyGraphIndex(edges, graph);
  const groups = findInterfaceGroups(edges, idx, file);
  const carriers = findDispatchCarriers(edges, idx, file);

  let groupsWithConsumer = 0;
  let groupsWithoutConsumer = 0;
  for (const g of groups) {
    const memberIds = new Set(g.implementers.map((impl) => strategyMemberNodeId(idx, impl.id, g.memberName)).filter((id): id is string => id !== null));
    const interfaceMemberId = strategyMemberNodeId(idx, g.interfaceId, g.memberName);
    const directCall = interfaceMemberId ? edges.some((e) => e.kind === "calls" && e.to === interfaceMemberId) : false;
    const carrierMatch = carriers.some((c) => c.targets.filter((t) => memberIds.has(t.id)).length >= 2);
    if (directCall || carrierMatch) groupsWithConsumer++;
    else groupsWithoutConsumer++;
  }

  let heterogeneousCarriers = 0;
  let carriersWithoutKnownSignatures = 0;
  for (const c of carriers) {
    const known = c.targets.filter(signatureIsKnown);
    if (known.length < 2) {
      carriersWithoutKnownSignatures++;
      continue;
    }
    if (new Set(known.map((t) => `${t.name}#${t.arity ?? "?"}`)).size >= 2) heterogeneousCarriers++;
  }
  return { groupsWithConsumer, groupsWithoutConsumer, heterogeneousCarriers, carriersWithoutKnownSignatures, carriers: carriers.length };
}

function appliedStateFor(problem: Problem, graph: Graph, ctx: HypothesisContext): AppliedStateResult {
  const structural = structuralStrategyEvidence(graph, problem);

  if (structural?.state === "ya-aplicado") {
    return {
      state: "ya-aplicado",
      checks: [{ label: "estructura-strategy-completa", passed: true, why: structural.why, role: "applied" }],
    };
  }

  if (!ctx.file) {
    if (structural?.state === "parcial") {
      return {
        state: "parcial",
        checks: [{ label: "tabla-de-despacho-existente", passed: true, why: structural.why, role: "applied" }],
      };
    }
    return {
      state: "ausente",
      checks: [
        {
          label: "tabla-de-despacho-existente",
          passed: false,
          why: "árbol no disponible en este cableado (ctx.file es siempre null hoy en crossAnalyze, ver hypotheses/run.ts): no se pudo buscar una tabla Hash/dict/objeto que ya mitigue este discriminante. Se asume 'ausente' de forma conservadora.",
          role: "applied",
        },
      ],
    };
  }
  const sets = ctx.setsFor(ctx.file.language);
  if (!hasDispatchTable(ctx.file.root, sets)) {
    if (structural?.state === "parcial") {
      return {
        state: "parcial",
        checks: [{ label: "tabla-de-despacho-existente", passed: true, why: structural.why, role: "applied" }],
      };
    }
    return {
      state: "ausente",
      checks: [
        {
          label: "tabla-de-despacho-existente",
          passed: false,
          why: `no se encontró, en "${ctx.file.path}", un literal con >=2 entradas cuyo valor sea invocable o un tipo — la mitigación real de este problema en Ruby/Python/JS/TS.`,
          role: "applied",
        },
      ],
    };
  }
  // AST encontró una tabla candidata. Con evidencia de GRAFO real de que es
  // ad hoc (heterogénea) — Ola 10, requisito 2 — se corrige a 'parcial' en
  // vez de asumir homogeneidad por la sola FORMA del literal.
  if (structural?.state === "parcial") {
    return {
      state: "parcial",
      checks: [
        {
          label: "tabla-de-despacho-existente",
          passed: true,
          why: `${structural.why} (el literal detectado por AST en "${ctx.file.path}" es consistente con esto.)`,
          role: "applied",
        },
      ],
    };
  }
  return {
    state: "aplicado-eludido",
    checks: [
      {
        label: "tabla-de-despacho-existente",
        passed: true,
        why: `existe, en "${ctx.file.path}", un literal función/tipo-como que ya resolvería este despacho, pero "${problem.title}" decide el mismo tipo de discriminante por fuera de esa tabla.`,
        role: "applied",
      },
    ],
  };
}

/**
 * `ownDiscriminantOverride` (Ola 10) — pasa a `crossRepetitionDiscriminator`
 * tal cual. Ausente en la llamada real de `build()`; presente (posiblemente
 * `null`) sólo cuando `refresh()` reconstruye un spec "de sólo lectura" para
 * recalcular discriminadores contra un `ctx.neighborhood` real, sin árbol.
 */
function buildSpec(ctx: HypothesisContext, ownDiscriminantOverride?: string | null): HypothesisSpec<Problem, Graph> {
  return {
    pattern: "Strategy",
    ceiling: "media", // ver docstring del módulo, sección "ceiling": no recalibrado por P2 a propósito (K2).
    needs: [],
    required: [
      notFactoryMethodCheck,
      notStateCheck(ctx),
      enoughSignalCheck,
      distinctBehaviorCheck(ctx),
      sameDiscriminantSubjectCheck(ctx),
      externalDiscriminantTypeCheck(ctx),
    ],
    discriminators: [strongSignalDiscriminator, crossRepetitionDiscriminator(ctx, ownDiscriminantOverride)],
    appliedState: (problem, graph) => appliedStateFor(problem, graph, ctx),
    toConfirm: [
      "¿Las ramas son variantes del MISMO algoritmo, no casos de negocio genuinamente distintos?",
      "¿El discriminante puede crecer, o es un enum cerrado que no va a cambiar?",
      "¿El discriminante es un campo propio de la instancia (@estado/this.state/self.status)? Si no había árbol vivo, esta ancla no lo pudo confirmar — es la frontera con State (regla 16).",
      "¿Alguna rama construye un tipo distinto sin que TODAS lo hagan? El ancla 'conditional-chain' sólo excluye cuando el detector marca 'instantiates' (todas construyen) — frontera con Factory Method.",
      "Bridge es estructuralmente idéntico a Strategy: confirmar que la intención es 'variar el algoritmo', no 'desacoplar abstracción de implementación'.",
    ],
    source: "https://refactoring.guru/design-patterns/strategy",
  };
}

/** Forma real (privada) de `PatternHypothesis.refreshState` para esta hipótesis — ver `refresh()` abajo. */
interface StrategyRefreshState {
  /** El discriminante propio de la cadena, cacheado con árbol vivo en `build()` (`null` si no había árbol o no se pudo leer) — lo que `refresh()` reusa para no necesitar `ctx.file` una segunda vez. */
  readonly ownDiscriminant: string | null;
}

/* ────────────────────────────────────────────────────────────────────────
 * OLA AH, FRENTE AH1 — LA TRAZA DEL EMBUDO. Mismo mecanismo, misma forma y
 * mismo default que `engine.ts#startArbitrationTrace`: ningún `process.env`
 * en el camino de análisis, se prende llamando `startStrategyTrace()` desde
 * un script de medición y se apaga sola al leerla. `null` (el default de
 * producción) ⇒ costo cero: ni una rama de más por hallazgo, ni un check de
 * más corrido.
 *
 * QUÉ CONTESTA, y por qué el volcado de producción no puede contestarlo: el
 * volcado sólo publica lo que SOBREVIVE (`build()` devuelve `null` cuando un
 * `required` no se sostiene, y con él se pierde CUÁL no se sostuvo). Para
 * comparar el embudo de `type-switch` contra el de `conditional-chain` sobre
 * los mismos repos hace falta el resultado de CADA `required`, también en los
 * hallazgos que no emiten. Cuando la traza está prendida se re-corren los
 * `required` y `appliedState` de esta hipótesis (son puros: leen `problem`,
 * `graph` y `ctx`, no escriben nada) para poder registrar el resultado por
 * check y el estado que la hipótesis HABRÍA tenido.
 * ──────────────────────────────────────────────────────────────────────── */

export interface StrategyTraceEntry {
  readonly findingId: string;
  readonly kind: string;
  readonly file: string;
  readonly line: number;
  readonly title: string;
  readonly detail: string;
  readonly variant: string | null;
  readonly triggerValue: number;
  /** `true` en la pasada con grafo del repo (`rebuildHypothesesWithGraph`), `false` en la primera (dentro de `analyzeFile`). */
  readonly withGraph: boolean;
  /** ¿había árbol vivo? — el eje que separa "no se pudo confirmar" de "se confirmó que no". */
  readonly withFile: boolean;
  readonly checks: readonly { readonly id: string; readonly holds: boolean; readonly why: string }[];
  /** El primero de `required` que NO se sostiene, o `null` si todos se sostienen. */
  readonly diesAt: string | null;
  /** El estado que `appliedState` decide — se registra TAMBIÉN cuando algún `required` mata la hipótesis, porque es el dato que dice qué se está perdiendo. */
  readonly appliedState: string;
  /** ¿la hipótesis se emitió de verdad en esta pasada? */
  readonly emitted: boolean;
  /** OLA AL, FRENTE AL4 — rasgos de FORMA, SÓLO MEDICIÓN. Ver `StrategyFormFeatures`. */
  readonly form: StrategyFormFeatures;
  /**
   * OLA AN · AN1 — SÓLO MEDICIÓN. El CANAL DE NIVEL 2 leído desde este mismo
   * punto de evaluación: qué ve `ctx.neighborhood` sobre los kinds de
   * refactorización (`long-function`/`complexity`/`primitive-obsession`) y si
   * esos vecinos traen ya su propuesta colgada. Se calcula ÚNICAMENTE dentro
   * de `recordStrategyTrace` (traza apagada en producción ⇒ costo cero) y
   * ningún `required` lo lee. Contesta la pregunta de MECANISMO de la ola —
   * "¿el hecho de nivel 2 está disponible acá?"— con datos, no por lectura.
   */
  readonly nivel2: StrategyLevel2Probe;
}

/** OLA AN · AN1 — SÓLO MEDICIÓN. Ver `StrategyTraceEntry.nivel2`. */
export interface StrategyLevel2Probe {
  /** Cuántos hallazgos ve `findingsInFile` sobre el archivo del problema (0 = vecindario vacío). */
  readonly vecinosEnArchivo: number;
  /** De ésos, cuántos traen al menos una hipótesis YA colgada — la prueba de que el RESULTADO de otra hipótesis es legible desde acá. */
  readonly vecinosConHipotesis: number;
  /** Hallazgos de kind de refactorización en el MISMO archivo, por kind. */
  readonly refacEnArchivo: readonly (readonly [string, number])[];
  /** Los mismos, restringidos a los que comparten SÍMBOLO con alguna ubicación del problema. */
  readonly refacEnSimbolo: readonly (readonly [string, number])[];
  /** De `refacEnSimbolo`, cuántos cuelgan una propuesta de refactorización VIVA (`ausente`/`parcial`). */
  readonly refacEnSimboloConPropuesta: number;
  /** Lo que devuelve `findingsAtSymbol` sobre el ancla primaria del problema, contando sólo kinds de refactorización. */
  readonly refacEnAncla: number;
}

/**
 * OLA AL, FRENTE AL4 — LOS RASGOS DE FORMA DE UNA CADENA, SÓLO PARA MEDIR.
 *
 * Se calculan ÚNICAMENTE dentro de `recordStrategyTrace`, o sea sólo cuando
 * la traza está prendida desde un script: en producción (`strategyTrace ===
 * null`) no se calcula ni uno. Ningún `required` los lee, ninguna decisión
 * del analizador depende de ellos.
 *
 * QUÉ CONTESTAN, y por qué el volcado no puede contestarlo: para evaluar un
 * discriminador candidato contra el BANCO de veredictos hace falta, por
 * hallazgo, el valor de cada rasgo — también en los hallazgos que no emiten.
 * Con esto, un candidato se evalúa OFFLINE sobre el volcado (cuántas falsas
 * conocidas apaga, cuántas verdaderas toca) ANTES de escribir una línea de
 * producción, que es lo que la Ola AK midió que hay que hacer.
 *
 * Todo es vocabulario de GRAMÁTICA: nombres de tipo tal como los escribió el
 * autor, conteos de ramas, spans de líneas, campos de parámetro. Ningún
 * nombre de dominio, de framework ni de ecosistema.
 */
export interface StrategyFormFeatures {
  /** El sujeto que el título del ancla cita (`type-switch`/`repeated-switch`), o `null`. */
  readonly sujeto: string | null;
  /** Los nombres de tipo tal cual los escribió el detector en `Tipos decididos: …` (sólo `type-switch`). */
  readonly tiposCrudos: readonly string[];
  /** Los candidatos que sobreviven `simpleNominalTypeName` — o sea los que tienen forma de tipo NOMINAL con inicial mayúscula y no son una palabra primitiva del lenguaje. */
  readonly tiposNominales: readonly string[];
  /** De `tiposNominales`, los que resuelven a un nodo `class-like` de ESTE repo (`null` sin grafo). */
  readonly tiposEnRepo: readonly string[] | null;
  /** De `tiposNominales`, los que no resuelven a ninguno (`null` sin grafo). */
  readonly tiposFueraDelRepo: readonly string[] | null;
  /** Ramas de la cadena ubicadas en el árbol vivo (`null` sin árbol o sin poder ubicarla). */
  readonly nRamas: number | null;
  /** De ellas, cuántas NO contienen ninguna invocación. */
  readonly ramasSinInvocacion: number | null;
  /** Nombres de invocación primaria distintos entre las ramas. */
  readonly calleesDistintos: number | null;
  /** Líneas que ocupa cada rama, en orden sintáctico. */
  readonly lineasPorRama: readonly number[] | null;
  /** Líneas que ocupa la función que contiene la cadena. */
  readonly lineasFuncion: number | null;
  /** ¿el sujeto es, textualmente, el nombre de un parámetro declarado de esa función? */
  readonly sujetoEsParametro: boolean | null;
  /** El tipo ESCRITO de ese parámetro, si lo escribió. */
  readonly tipoEscritoDelSujeto: string | null;
  /** Otros hallazgos del vecindario, de CUALQUIERA de las tres anclas, cuyo sujeto citado en el título normaliza igual que el nuestro. `null` si el vecindario está vacío (primera pasada). */
  readonly hermanosMismoSujeto: number | null;
  /** Otros hallazgos del vecindario que están en el MISMO archivo y comparten sujeto. */
  readonly hermanosMismoSujetoMismoArchivo: number | null;
  /**
   * SÓLO MEDICIÓN (Ola AM · AM2): el hallazgo `type-switch` que el analizador
   * emitió sobre ESTA MISMA cadena, si existe — el hecho que habilita la 5.ª
   * forma de `un-solo-discriminante` (ver `typeSwitchOverThisChain`). Queda en
   * la traza para que la próxima ola cuente este embudo sin re-derivar nada.
   */
  readonly despachoPorTipoDelVecino: { readonly line: number; readonly subject: string; readonly branches: number } | null;
  /**
   * Por cada nombre de tipo CRUDO: su último segmento nominal SIN filtrar por
   * inicial mayúscula ni por palabra primitiva —o sea el nombre tal como la
   * gramática lo escribió, sólo desenvuelto de punteros/genéricos/calificación—
   * y si ese nombre resuelve a un nodo `class-like` de ESTE repo.
   *
   * POR QUÉ HACE FALTA APARTE de `tiposNominales`: `simpleNominalTypeName`
   * descarta todo nombre con INICIAL MINÚSCULA, y en Go un tipo NO EXPORTADO
   * del propio paquete se escribe así (`*shortcode` en
   * `hugo/hugolib/shortcode.go:446`). Sin esta columna no se puede medir la
   * diferencia entre "el repo no declara este tipo" y "el nombre no tiene la
   * forma que el filtro exige".
   */
  readonly crudoResuelve: readonly {
    readonly crudo: string;
    readonly simple: string | null;
    readonly enRepo: boolean | null;
    /**
     * Lo mismo, comparando SIN distinguir mayúsculas de minúsculas. Hace falta
     * porque el ancla `type-switch`, en su variante ESCALERA, pasa el nombre
     * del tipo por `normalizeSubject` —que lo baja a minúsculas— antes de
     * escribirlo en el `detail` (`type-switch.ts:300`): `AsTimeProvider` llega
     * como `astimeprovider` y nunca emparejaría con el índice, que guarda el
     * nombre tal como se declaró. Mismo criterio, y por la misma razón, que
     * `declaresMemberNamed` ya aplica en este archivo para el título de
     * `repeated-switch`.
     */
    readonly enRepoCI: boolean | null;
  }[];
}

/** `nombre en minúsculas ⇒ ids de nodo` de todo símbolo `class-like` — el mismo índice que `classLikeNameIndex`, con la clave normalizada. SÓLO MEDICIÓN (lo usa `formFeaturesOf`). */
const CLASS_LIKE_CI_INDEX_CACHE = new WeakMap<CodeGraph, ReadonlyMap<string, number>>();
function classLikeNameIndexCI(graph: CodeGraph): ReadonlyMap<string, number> {
  const hit = CLASS_LIKE_CI_INDEX_CACHE.get(graph);
  if (hit) return hit;
  const byName = new Map<string, number>();
  for (const [name, ids] of classLikeNameIndex(graph)) {
    const k = name.toLowerCase();
    byName.set(k, (byName.get(k) ?? 0) + ids.size);
  }
  CLASS_LIKE_CI_INDEX_CACHE.set(graph, byName);
  return byName;
}

/**
 * El último segmento nominal de un texto de tipo, SIN filtrar por inicial ni
 * por palabra primitiva — mismo desenvolvimiento de FORMA que
 * `simpleNominalTypeName` (anotación, puntero, nullable, genérico, array,
 * calificación por punto o doble dos-puntos), sin su último paso de descarte.
 * Sólo para medir.
 */
function rawNominalSegment(raw: string): string | null {
  let t = raw.trim();
  t = t.replace(/^:\s*/, "");
  t = t.replace(/^[*&]+/, "").replace(/[?\s]+$/, "");
  const cut = t.search(/[<[({]/);
  if (cut >= 0) t = t.slice(0, cut).trim();
  if (t.length === 0 || !NOMINAL_TYPE_TEXT.test(t)) return null;
  const segments = t.split(/[.:]+/).filter((s) => s.length > 0);
  return segments[segments.length - 1] ?? null;
}

/** Sujeto citado en el título de un hallazgo de cualquiera de las tres anclas — `null` para `conditional-chain` (su título no lo cita). */
function anchorSubjectOf(problem: Problem): string | null {
  if (problem.kind === TYPE_SWITCH_ANCHOR) return TYPE_SWITCH_SUBJECT.exec(problem.title)?.[1] ?? null;
  if (problem.kind === "repeated-switch") return REPEATED_SWITCH_SUBJECT.exec(problem.title)?.[1] ?? null;
  return null;
}

/** Los nombres de tipo CRUDOS que el detector `type-switch` escribió en su detail — antes de cualquier normalización. */
function rawTypeNames(problem: Problem): string[] {
  const match = TYPE_SWITCH_TYPES_LIST.exec(problem.detail);
  if (!match) return [];
  return match[1]!.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

function formFeaturesOf(problem: Problem, graph: Graph, ctx: HypothesisContext): StrategyFormFeatures {
  const sujeto = anchorSubjectOf(problem);
  const tiposCrudos = rawTypeNames(problem);
  const tiposNominales = [...discriminatingTypeCandidates(ctx, problem)];
  let tiposEnRepo: string[] | null = null;
  let tiposFueraDelRepo: string[] | null = null;
  if (graph) {
    const index = classLikeNameIndex(graph);
    tiposEnRepo = tiposNominales.filter((n) => (index.get(n)?.size ?? 0) > 0);
    tiposFueraDelRepo = tiposNominales.filter((n) => (index.get(n)?.size ?? 0) === 0);
  }

  const branches = branchActionsOf(ctx, problem);
  let nRamas: number | null = null;
  let ramasSinInvocacion: number | null = null;
  let calleesDistintos: number | null = null;
  let lineasPorRama: number[] | null = null;
  if (branches) {
    nRamas = branches.length;
    ramasSinInvocacion = branches.filter((b) => !branchInvokesCall(b)).length;
    calleesDistintos = new Set(branches.map(branchPrimaryCallee).filter((n): n is string => n !== null)).size;
    lineasPorRama = branches.map((b) => b.endPosition.row - b.startPosition.row + 1);
  }

  let lineasFuncion: number | null = null;
  let sujetoEsParametro: boolean | null = null;
  let tipoEscritoDelSujeto: string | null = null;
  if (ctx.file) {
    const fn = findEnclosingFunction(ctx.file, problem);
    if (fn) {
      lineasFuncion = fn.endLine - fn.startLine + 1;
      const nombre = sujeto && BARE_IDENTIFIER.test(sujeto) ? sujeto : null;
      if (nombre) {
        tipoEscritoDelSujeto = declaredParamTypeText(fn, nombre);
        sujetoEsParametro = tipoEscritoDelSujeto !== null || paramNamed(fn, nombre);
      } else {
        sujetoEsParametro = false;
      }
    }
  }

  let despachoPorTipoDelVecino: { readonly line: number; readonly subject: string; readonly branches: number } | null = null;
  if (ctx.file && problem.kind === "conditional-chain") {
    const fn = findEnclosingFunction(ctx.file, problem);
    const chainNode = fn ? findChainNode(fn.node, ctx.setsFor(ctx.file.language), reportedChainStartLine(problem)) : null;
    if (chainNode) despachoPorTipoDelVecino = typeSwitchOverThisChain(ctx, problem, chainNode, ifLadderBranchActions(chainNode).length);
  }

  let hermanosMismoSujeto: number | null = null;
  let hermanosMismoSujetoMismoArchivo: number | null = null;
  if (sujeto) {
    const clave = normalizeDiscriminant(sujeto);
    let total = 0;
    let mismoArchivo = 0;
    const miArchivo = problem.locations[0]?.file ?? "";
    for (const kind of [TYPE_SWITCH_ANCHOR, "repeated-switch"]) {
      for (const otro of ctx.neighborhood.findingsOfKind(kind)) {
        const suSujeto = anchorSubjectOf(otro);
        if (!suSujeto || normalizeDiscriminant(suSujeto) !== clave) continue;
        total++;
        if ((otro.locations[0]?.file ?? "") === miArchivo) mismoArchivo++;
      }
    }
    hermanosMismoSujeto = total;
    hermanosMismoSujetoMismoArchivo = mismoArchivo;
  }

  return {
    sujeto,
    tiposCrudos,
    tiposNominales,
    tiposEnRepo,
    tiposFueraDelRepo,
    nRamas,
    ramasSinInvocacion,
    calleesDistintos,
    lineasPorRama,
    lineasFuncion,
    sujetoEsParametro,
    tipoEscritoDelSujeto,
    hermanosMismoSujeto,
    hermanosMismoSujetoMismoArchivo,
    despachoPorTipoDelVecino,
    crudoResuelve: tiposCrudos.map((crudo) => {
      const simple = rawNominalSegment(crudo);
      const enRepo = graph && simple ? (classLikeNameIndex(graph).get(simple)?.size ?? 0) > 0 : null;
      const enRepoCI = graph && simple ? (classLikeNameIndexCI(graph).get(simple.toLowerCase()) ?? 0) > 0 : null;
      return { crudo, simple, enRepo, enRepoCI };
    }),
  };
}

/** ¿`fn` declara un parámetro llamado exactamente `nombre`? — mismos campos que `declaredParamTypeText` ya recorre, sin exigir que haya escrito tipo. */
function paramNamed(fn: FunctionUnit, nombre: string): boolean {
  for (const listField of PARAM_LIST_FIELD_NAMES) {
    const list = fn.node.childForFieldName(listField) as AstNode | null;
    if (!list) continue;
    for (let i = 0; i < list.childCount; i++) {
      const param = list.child(i) as AstNode | null;
      if (!param?.isNamed) continue;
      const nameNode = PARAM_NAME_FIELDS.map((f) => param.childForFieldName(f) as AstNode | null).find((n) => n !== null) ?? null;
      if (nameNode && nameNode.text.trim() === nombre) return true;
      if (!nameNode && param.text.trim() === nombre) return true;
    }
  }
  return false;
}

/**
 * OLA AN · AN1 — SÓLO MEDICIÓN, nunca una decisión. Lee el canal de nivel 2
 * desde el MISMO punto en el que esta hipótesis se evalúa, para contestar con
 * datos —no por lectura de código— si el hecho "acá aplica una
 * refactorización" está disponible acá. Se llama sólo desde
 * `recordStrategyTrace`, o sea sólo con la traza prendida desde un script.
 *
 * Vocabulario de GRAMÁTICA y de la propia taxonomía de kinds del analizador:
 * no nombra un lenguaje, un framework ni un dominio.
 */
const REFACTORING_KINDS = ["long-function", "complexity", "primitive-obsession"] as const;
const REFACTORING_PATTERNS = new Set(["Extract Method", "Value Object", "Null Object"]);

function level2Probe(problem: Problem, ctx: HypothesisContext): StrategyLevel2Probe {
  const miArchivo = problem.locations[0]?.file ?? "";
  const misSimbolos = new Set(problem.locations.map((l) => l.symbol ?? "").filter((s) => s.length > 0));
  const enArchivo = ctx.neighborhood.findingsInFile(miArchivo);
  const refacArchivo = new Map<string, number>();
  const refacSimbolo = new Map<string, number>();
  let conPropuesta = 0;
  let conHipotesis = 0;
  for (const vecino of enArchivo) {
    if ((vecino.hypotheses?.length ?? 0) > 0) conHipotesis++;
    if (!(REFACTORING_KINDS as readonly string[]).includes(vecino.kind)) continue;
    refacArchivo.set(vecino.kind, (refacArchivo.get(vecino.kind) ?? 0) + 1);
    const comparteSimbolo = vecino.locations.some((l) => (l.symbol ?? "").length > 0 && misSimbolos.has(l.symbol ?? ""));
    if (!comparteSimbolo) continue;
    refacSimbolo.set(vecino.kind, (refacSimbolo.get(vecino.kind) ?? 0) + 1);
    if ((vecino.hypotheses ?? []).some((h) => REFACTORING_PATTERNS.has(h.pattern) && (h.state === "ausente" || h.state === "parcial"))) conPropuesta++;
  }
  const primera = problem.locations[0];
  const enAncla = primera
    ? ctx.neighborhood.findingsAtSymbol(deriveAnchor(primera)).filter((f) => (REFACTORING_KINDS as readonly string[]).includes(f.kind)).length
    : 0;
  return {
    vecinosEnArchivo: enArchivo.length,
    vecinosConHipotesis: conHipotesis,
    refacEnArchivo: [...refacArchivo].sort(),
    refacEnSimbolo: [...refacSimbolo].sort(),
    refacEnSimboloConPropuesta: conPropuesta,
    refacEnAncla: enAncla,
  };
}

let strategyTrace: StrategyTraceEntry[] | null = null;

export function startStrategyTrace(): void {
  strategyTrace = [];
}

export function takeStrategyTrace(): readonly StrategyTraceEntry[] {
  const t = strategyTrace ?? [];
  strategyTrace = null;
  return t;
}

function recordStrategyTrace(
  spec: HypothesisSpec<Problem, Graph>,
  problem: Problem,
  graph: Graph,
  ctx: HypothesisContext,
  emitted: boolean,
): void {
  const checks = spec.required.map((c) => {
    const r = c.run(problem, graph);
    return { id: c.id, holds: r.holds, why: r.evidence };
  });
  const loc = problem.locations[0];
  strategyTrace?.push({
    findingId: problem.id ?? "",
    kind: problem.kind,
    file: loc?.file ?? "",
    line: loc?.startLine ?? 0,
    title: problem.title,
    detail: problem.detail,
    variant: problem.variant ?? null,
    triggerValue: problem.trigger[0]?.value ?? 0,
    withGraph: graph !== null,
    withFile: ctx.file !== null,
    checks,
    diesAt: checks.find((c) => !c.holds)?.id ?? null,
    appliedState: spec.appliedState(problem, graph).state,
    emitted,
    form: formFeaturesOf(problem, graph, ctx),
    nivel2: level2Probe(problem, ctx),
  });
}


/* ────────────────────────────────────────────────────────────────────────
 * OLA AN, FRENTE AN1 — EL ANCLA DE NIVEL 2: LA DECISIÓN REPETIDA QUE NINGUNA
 * DE LAS TRES ANCLAS DE STRATEGY PUEDE VER.
 *
 * EL HUECO, y es de CONSTRUCCIÓN, no de calibración — se lee en tres archivos
 * del propio analizador:
 *   · `detect/intra-function/conditional-chain.ts` mide `fn.chain`, que es LA
 *     ESCALERA MÁS LARGA de la función, contra un piso de 5. Dos escaleras de
 *     3 peldaños sobre el MISMO sujeto dan `chain = 3`: no hay hallazgo.
 *   · `detect/intra-file/repeated-switch.ts` es, con todas las letras de su
 *     docstring, "deliberadamente sobre `switchContainerNodes`, NO sobre
 *     `chainNodes` … nunca una escalera de `if`". El mismo sujeto decidido en
 *     dos escaleras de `if` no es su población.
 *   · `detect/intra-function/type-switch.ts` exige que las ramas prueben el
 *     TIPO del sujeto; comparar su VALOR no es su población.
 * ⇒ **el mismo sujeto decidido por >= 2 escaleras de `if` SEPARADAS, ninguna
 * de las cuales llega sola a 5 peldaños, es invisible para las tres.** El
 * único hallazgo que queda sobre ese código es de NIVEL 2 (`complexity` /
 * `long-function`), y por eso ESE es el ancla.
 *
 * MEDIDO ANTES DE ESCRIBIR ESTO (`scripts/an1-sonda-a{,2,3}.mts`, los 21
 * repos): hay **2.604 sitios de nivel 2 en bibliotecas y 5.096 en
 * aplicaciones donde NINGUNA de las tres anclas de Strategy dispara**; de
 * ésos, los que cumplen fuerza + escala + comportamiento son **4 filas en
 * bibliotecas (3 repos) y 8 en aplicaciones (4 repos)**. Umbral de existencia
 * fijado ANTES de medir (`scratchpad-an1/CRITERIO.md`): >= 1 caso en >= 2
 * repos por población. Cumplido.
 *
 * LAS CUATRO CONDICIONES DE LA RECETA, con la CUARTA primero:
 *   4. EL HECHO QUE LA DECIDE: `ctx.neighborhood.findingsInFile` (para saber
 *      que NINGUNA ancla de despacho cubre este símbolo, y que el vecindario
 *      de verdad se pudo leer) más `ctx.file` (el árbol vivo, para leer las
 *      escaleras). VERIFICADO con la sonda de producción antes de escribir
 *      una línea: en la pasada 2 `findingsInFile` devuelve vecinos en 51 de
 *      53 candidatos de rubocop y hallazgos de kind de refactorización en 40
 *      de 53; en la pasada 1 devuelve 0 en 53 de 53. Por eso
 *      `neighborhoodReadableCheck` es un `required` y no una comodidad: sin
 *      él, este camino sería INERTE en la pasada 1 y mentiroso en la 2.
 *   1. FUERZA — sin cambiarle una palabra a la de Strategy: *"la MISMA
 *      expresión se decide contra un ALFABETO de valores DISTINTOS, en más de
 *      un lugar"*. Cambia DÓNDE se la busca, no qué se pide. Es la condición
 *      que separa un despacho de una GUARDA: la primera sonda, sin ella,
 *      devolvió 462 casos en gitea y 447 tenían sujeto `err` (`if err != nil`
 *      repetido, que compara siempre contra el MISMO valor).
 *   2. ESCALA — NINGÚN NÚMERO NUEVO. `STRATEGY_MIN_BRANCHES` (5) valores
 *      DISTINTOS, la constante que este archivo ya usa y que no se mueve; y
 *      >= 2 escaleras separadas, que no es un umbral elegido sino la
 *      condición literal de "esto es población que el ancla vieja no
 *      alcanza" (con UNA sola escalera de 5, `conditional-chain` ya la vería).
 *   3. RESOLUCIÓN VERIFICADA — `alreadyResolvedCheck`: si `appliedStateFor`
 *      concluye que la forma de Strategy YA está (`ya-aplicado`) o que la
 *      tabla de despacho ya existe y este código la elude
 *      (`aplicado-eludido`), la hipótesis NO SE CONSTRUYE. Es un `required`,
 *      no un estado, y la razón es medida: `engine.ts#arbitrateRivalHypotheses`
 *      DESCARTA una oportunidad cuando otro patrón sobre el MISMO hallazgo
 *      confirmó con `places` solapadas — un `aplicado-eludido` de Strategy
 *      sobre un hallazgo `complexity` borraría la propuesta de `Extract
 *      Method` de ese mismo hallazgo. Con este `required` el camino nuevo
 *      SÓLO puede publicar oportunidades, así que no puede descartar a nadie.
 *
 * QUÉ NO CUBRE, declarado: no hay en este camino un equivalente de
 * `no-es-campo-propio` (la frontera con State). No hace falta y no es un
 * descuido: `notStateCheck` existe porque el ancla vieja cita el
 * discriminante en su título y hay que leerlo por texto, y sobre todo porque
 * ahí State COMPITE — pero las cuatro anclas de State (`temporary-field`,
 * `type-switch`, `conditional-chain`, `repeated-switch`) están, por el
 * `required` `sinAnclaDeDespacho` de abajo, TODAS ausentes en esta población.
 * State no puede perder nada acá porque State no llega acá.
 *
 * GENERICIDAD: todo lo de abajo es vocabulario de GRAMÁTICA (`condition`,
 * `consequence`/`body`, operadores de comparación) y de la propia taxonomía
 * de kinds del analizador. Ni un nombre de lenguaje, de framework ni de
 * dominio.
 * ──────────────────────────────────────────────────────────────────────── */

/** Los dos kinds de NIVEL 2 que anclan este camino. `primitive-obsession` (el ancla de `Value Object`) queda afuera a propósito y medido: acompaña a 3 propuestas de Strategy en bibliotecas y 2 en aplicaciones sobre las dos poblaciones enteras — no tiene población. */
const REFACTORING_ANCHORS = ["complexity", "long-function"] as const;
/** Las tres anclas de despacho de esta misma hipótesis — si alguna cubre el símbolo, este camino NO es población nueva y se calla. */
const DISPATCH_ANCHORS = ["conditional-chain", "repeated-switch", TYPE_SWITCH_ANCHOR] as const;

/** Un peldaño de escalera de `if` leído para esta hipótesis: el sujeto, el valor contra el que se lo compara, y si su rama invoca algo. */
interface RefactoringRung {
  readonly subject: string;
  readonly value: string;
  /** Línea de inicio de la ESCALERA a la que pertenece — la unidad con la que se cuenta "escaleras separadas". */
  readonly ladderLine: number;
  /** Línea de inicio del PELDAÑO — un `else if` es a su vez un nodo de cadena, y sin marcarlo la misma escalera se contaría tantas veces como peldaños tiene. */
  readonly ownLine: number;
  readonly invokes: boolean;
  readonly callee: string | null;
}

/** El resultado del análisis: el sujeto ganador y los peldaños que lo deciden. */
interface RepeatedDecision {
  readonly subject: string;
  readonly ladders: number;
  readonly values: readonly string[];
  readonly rungs: readonly RefactoringRung[];
  readonly fn: FunctionUnit;
}

/**
 * Los peldaños de UNA escalera de `if`, con su sujeto y su valor. Reusa
 * `COMPARISON_OPERATOR` —la misma constante que `discriminantSubject` ya
 * usa— y `branchAction`/`branchInvokesCall`/`branchPrimaryCallee`, las mismas
 * tres funciones con las que `distinctBehaviorCheck` juzga una rama. Un
 * peldaño SIN operador de comparación no aporta: sin operador no hay alfabeto
 * que leer, y ése es justamente el caso que la fuerza excluye.
 */
function refactoringRungsOf(root: AstNode): RefactoringRung[] {
  const out: RefactoringRung[] = [];
  const ladderLine = root.startPosition.row + 1;
  let current: AstNode | null = root;
  while (current && current.childForFieldName("condition")) {
    const cond = current.childForFieldName("condition") as AstNode;
    const m = COMPARISON_OPERATOR_SPLIT.exec(cond.text.replace(/[()]/g, "").trim());
    if (m) {
      const action = branchAction(current);
      out.push({
        subject: normalizeDiscriminant(m[1] ?? ""),
        value: normalizeDiscriminant(m[3] ?? ""),
        ladderLine,
        ownLine: current.startPosition.row + 1,
        invokes: action ? branchInvokesCall(action) : false,
        callee: action ? branchPrimaryCallee(action) : null,
      });
    }
    // MISMO recorrido que `ifLadderBranchActions` — `unwrapAlternative` es la
    // función que este archivo ya usa para saltar el contenedor del `else`.
    const alt = current.childForFieldName("alternative") as AstNode | null;
    const siguiente = alt ? unwrapAlternative(alt) : null;
    current = siguiente && siguiente.childForFieldName("condition") ? siguiente : null;
  }
  return out;
}

/** `COMPARISON_OPERATOR` con el lado DERECHO capturado — misma lista de operadores, mismo orden, misma semántica; sólo se agrega el tercer grupo, porque acá hace falta el VALOR además del sujeto. */
const COMPARISON_OPERATOR_SPLIT = /^(.*?)\s*(===|!==|==|!=|>=|<=|>|<)\s*(.*)$/s;

/**
 * El sujeto decidido MÁS DE UNA VEZ dentro de `fn`, con >= `STRATEGY_MIN_BRANCHES`
 * valores distintos. `null` si no hay ninguno. Cuando hay más de uno gana el
 * que tiene más valores distintos (empate: más escaleras, luego orden
 * alfabético) — determinista, sin azar.
 */
function repeatedDecisionIn(fn: FunctionUnit, sets: DerivedNodeSets): RepeatedDecision | null {
  const rungs: RefactoringRung[] = [];
  const seen = new Set<number>();
  const visit = (node: AstNode): void => {
    if (node.isNamed && sets.chainNodes.has(node.type) && node.childForFieldName("condition")) {
      const line = node.startPosition.row + 1;
      if (!seen.has(line)) {
        const propios = refactoringRungsOf(node);
        for (const r of propios) seen.add(r.ownLine);
        seen.add(line);
        rungs.push(...propios);
      }
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i) as AstNode | null;
      if (child) visit(child);
    }
  };
  visit(fn.node);

  const bySubject = new Map<string, RefactoringRung[]>();
  for (const r of rungs) {
    if (!r.subject) continue;
    const l = bySubject.get(r.subject) ?? [];
    l.push(r);
    bySubject.set(r.subject, l);
  }
  let best: RepeatedDecision | null = null;
  for (const [subject, l] of [...bySubject.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const ladders = new Set(l.map((r) => r.ladderLine)).size;
    const values = [...new Set(l.map((r) => r.value))].sort();
    if (ladders < 2 || values.length < STRATEGY_MIN_BRANCHES) continue;
    const cand: RepeatedDecision = { subject, ladders, values, rungs: l, fn };
    if (!best || values.length > best.values.length || (values.length === best.values.length && ladders > best.ladders)) best = cand;
  }
  return best;
}

/**
 * La decisión repetida de ESTE problema, buscada en TODAS sus ubicaciones (un
 * `long-function` puede traer varias funciones en `locations`; el ancla vieja
 * sólo mira `locations[0]`, acá hace falta mirarlas todas o la población
 * medida por la sonda no es la misma que la de producción). Determinista:
 * gana la PRIMERA ubicación, en orden de `locations`, que califica.
 */
function refactoringDecisionOf(ctx: HypothesisContext, problem: Problem): RepeatedDecision | null {
  if (!ctx.file) return null;
  const sets = ctx.setsFor(ctx.file.language);
  for (const loc of problem.locations) {
    if (loc.file !== ctx.file.path) continue;
    const fn = ctx.file.functions.find((f) => f.startLine <= loc.startLine && loc.endLine <= f.endLine && (loc.symbol ? (f.name ?? "") === loc.symbol : true));
    if (!fn) continue;
    const found = repeatedDecisionIn(fn, sets);
    if (found) return found;
  }
  return null;
}

/** Los símbolos que este problema nombra — la unidad con la que se compara contra los vecinos. */
function symbolsOf(problem: Problem): Set<string> {
  return new Set(problem.locations.map((l) => l.symbol ?? "").filter((s) => s.length > 0));
}

/**
 * `required` 1 — *"¿el canal de nivel 2 se puede LEER desde acá?"*. Sin esto,
 * este camino sería inerte en la pasada 1 (`analyzeFile`, donde
 * `ctx.neighborhood` es `EMPTY_NEIGHBORHOOD` SIEMPRE por diseño, ver
 * `hypotheses/run.ts`) y, peor, aprobaría por vacío el `required` siguiente.
 * Medido: en la pasada 1 devuelve 0 vecinos en el 100 % de los candidatos, y
 * en la pasada 2 devuelve vecinos en 51 de 53.
 */
function neighborhoodReadableCheck(ctx: HypothesisContext): Check<Problem, Graph> {
  return {
    id: "vecindario-legible",
    describe: "el vecindario del hallazgo se puede consultar desde este punto de evaluación (sin él, la ausencia de otras anclas no es un hecho, es una ignorancia)",
    run: (problem) => {
      const file = problem.locations[0]?.file ?? "";
      const n = ctx.neighborhood.findingsInFile(file).length;
      if (n === 0) {
        return { holds: false, evidence: `el vecindario de "${file}" devuelve 0 hallazgos: en esta pasada el índice todavía no existe, así que la ausencia de otras anclas no está demostrada.` };
      }
      return { holds: true, evidence: `${n} hallazgos vecinos en "${file}" — el índice del repo está construido y responde.` };
    },
  };
}

/**
 * `required` 2 — *"¿ninguna de las tres anclas de despacho de esta misma
 * hipótesis cubre este símbolo?"*. Es lo que hace que este camino sea
 * POBLACIÓN NUEVA y no una segunda opinión sobre lo que el ancla vieja ya
 * dice: si `conditional-chain`/`repeated-switch`/`type-switch` ven este
 * código, la propuesta ya existe por la vía vieja y ésta sobraría.
 *
 * Incluye la DEDUPLICACIÓN entre los dos kinds de nivel 2: cuando el ancla es
 * `long-function` y un `complexity` cubre el mismo símbolo, se calla — así el
 * mismo código no produce DOS propuestas idénticas por dos anclas hermanas.
 * `complexity` es el que habla, porque es el que dice "esta función DECIDE
 * mucho"; `long-function` sólo dice "es larga".
 */
function noDispatchAnchorHereCheck(ctx: HypothesisContext): Check<Problem, Graph> {
  return {
    id: "sin-ancla-de-despacho-en-este-simbolo",
    describe: "ninguna de las tres anclas de despacho de Strategy (conditional-chain/repeated-switch/type-switch) cubre este símbolo — si alguna lo cubriera, la propuesta ya existiría por esa vía",
    run: (problem) => {
      const file = problem.locations[0]?.file ?? "";
      const mios = symbolsOf(problem);
      const comparte = (otro: Finding): boolean => otro.locations.some((l) => (l.symbol ?? "").length > 0 && mios.has(l.symbol ?? ""));
      for (const otro of ctx.neighborhood.findingsInFile(file)) {
        if ((DISPATCH_ANCHORS as readonly string[]).includes(otro.kind) && comparte(otro)) {
          return { holds: false, evidence: `"${otro.kind}" ya cubre este mismo símbolo en "${file}": la propuesta de Strategy sobre este código llega por el ancla vieja, no por ésta.` };
        }
        if (problem.kind === "long-function" && otro.kind === "complexity" && comparte(otro)) {
          return { holds: false, evidence: `un hallazgo "complexity" cubre el mismo símbolo: habla ese ancla, no ésta — para que el mismo código no produzca dos propuestas iguales.` };
        }
      }
      return { holds: true, evidence: `ninguna de las anclas ${DISPATCH_ANCHORS.join("/")} cubre los símbolos de este hallazgo en "${file}" — población que la vía del smell no alcanza.` };
    },
  };
}

/**
 * `required` 3 — LA FUERZA Y LA ESCALA: *"¿la MISMA expresión se decide,
 * en más de un lugar de esta función, contra un alfabeto de al menos
 * `STRATEGY_MIN_BRANCHES` valores distintos?"*.
 */
function repeatedDecisionCheck(ctx: HypothesisContext): Check<Problem, Graph> {
  return {
    id: "decision-repetida-sobre-un-solo-sujeto",
    describe: `la misma expresión se decide en >= 2 escaleras SEPARADAS contra >= ${STRATEGY_MIN_BRANCHES} valores distintos (una sola escalera de ese tamaño ya la vería 'conditional-chain'; el mismo valor repetido es una guarda, no un despacho)`,
    run: (problem) => {
      if (!ctx.file) {
        return { holds: false, evidence: "árbol no disponible para este hallazgo: la repetición de la decisión no está demostrada." };
      }
      const d = refactoringDecisionOf(ctx, problem);
      if (!d) {
        return { holds: false, evidence: `en "${ctx.file.path}" no hay ninguna expresión decidida en >= 2 escaleras contra >= ${STRATEGY_MIN_BRANCHES} valores distintos.` };
      }
      return {
        holds: true,
        evidence: `"${d.subject}" se decide en ${d.ladders} escaleras separadas de "${d.fn.name ?? ""}" contra ${d.values.length} valores distintos (${d.values.slice(0, 5).join(", ")}${d.values.length > 5 ? ", …" : ""}).`,
      };
    },
  };
}

/**
 * `required` 4 — la MISMA prueba de intención que `distinctBehaviorCheck`,
 * con los MISMOS dos umbrales (`MAJORITY_RATIO`, `topCount >= 2`) y las
 * MISMAS tres salidas, aplicada a los peldaños de las escaleras que deciden
 * el sujeto ganador. No es un criterio nuevo: es el criterio de este archivo,
 * evaluado sobre las ramas que este camino ubica.
 */
function refactoringDistinctBehaviorCheck(ctx: HypothesisContext): Check<Problem, Graph> {
  return {
    id: "ramas-invocan-comportamiento-distinto",
    describe:
      "la mayoría de las ramas invoca una operación sustantiva, y no todas convergen en la MISMA operación (si no, es una tabla de clasificación o una única operación parametrizada, no Strategy)",
    run: (problem) => {
      const d = refactoringDecisionOf(ctx, problem);
      if (!d) {
        return { holds: false, evidence: "no hay decisión repetida que juzgar: sin ramas ubicadas, la divergencia de comportamiento no está demostrada." };
      }
      const literales = d.rungs.filter((r) => !r.invokes).length;
      if (literales / d.rungs.length >= MAJORITY_RATIO) {
        return {
          holds: false,
          evidence: `${literales}/${d.rungs.length} ramas retornan un valor fijo (sin invocar nada) — forma de tabla de clasificación (datos de un conjunto cerrado), no de algoritmos intercambiables.`,
        };
      }
      const callees = d.rungs.map((r) => r.callee).filter((n): n is string => n !== null);
      if (callees.length < 2) {
        return { holds: false, evidence: "menos de dos ramas con una invocación identificable: la divergencia de comportamiento queda indemostrada." };
      }
      const counts = new Map<string, number>();
      for (const c of callees) counts.set(c, (counts.get(c) ?? 0) + 1);
      const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      const [topName, topCount] = ranked[0]!;
      if (topCount >= 2 && topCount / callees.length >= MAJORITY_RATIO) {
        return {
          holds: false,
          evidence: `${topCount}/${callees.length} ramas con acción invocan la MISMA operación ("${topName}") — variación de datos sobre una única operación, no una selección entre algoritmos.`,
        };
      }
      return {
        holds: true,
        evidence: `cada rama invoca una operación distinta (${ranked.map(([n]) => n).join(", ")}) — forma compatible con variantes intercambiables de un mismo trabajo.`,
      };
    },
  };
}

/**
 * `required` 5 — RESOLUCIÓN VERIFICADA, y como `required` a propósito (ver el
 * bloque de arriba): si la forma de Strategy ya está o la tabla de despacho
 * ya existe, este camino NO construye nada. Así el ancla nueva sólo puede
 * publicar OPORTUNIDADES, y por lo tanto no puede descartar, vía
 * `arbitrateRivalHypotheses`, la propuesta de `Extract Method` que cuelga del
 * MISMO hallazgo.
 */
function notAlreadyResolvedCheck(ctx: HypothesisContext): Check<Problem, Graph> {
  return {
    id: "resolucion-no-presente",
    describe: "el despacho todavía no está resuelto: no hay estructura de Strategy completa ni una tabla de despacho que este código esté eludiendo",
    run: (problem, graph) => {
      const st = appliedStateFor(problem, graph, ctx).state;
      if (st === "ya-aplicado" || st === "aplicado-eludido") {
        return { holds: false, evidence: `la resolución ya existe en este archivo (estado "${st}"): esta ancla no propone sobre código que ya tiene su tabla o su jerarquía.` };
      }
      return { holds: true, evidence: `no hay estructura de Strategy ni tabla de despacho que ya resuelva "${problem.title}" (estado calculado: "${st}").` };
    },
  };
}

/** El spec del ancla de nivel 2. NO comparte un solo `required` con `buildSpec`: los seis de allá leen el TÍTULO y el `trigger` de las anclas de despacho, que un hallazgo de nivel 2 no tiene. */
function buildRefactoringSpec(ctx: HypothesisContext): HypothesisSpec<Problem, Graph> {
  return {
    pattern: "Strategy",
    ceiling: "media",
    needs: [],
    required: [
      neighborhoodReadableCheck(ctx),
      noDispatchAnchorHereCheck(ctx),
      repeatedDecisionCheck(ctx),
      refactoringDistinctBehaviorCheck(ctx),
      notAlreadyResolvedCheck(ctx),
    ],
    discriminators: [],
    appliedState: (problem, graph) => appliedStateFor(problem, graph, ctx),
    toConfirm: [
      "¿Las ramas son variantes del MISMO algoritmo, no casos de negocio genuinamente distintos?",
      "¿El discriminante puede crecer, o es un enum cerrado que no va a cambiar?",
      "¿El discriminante es un campo propio de la instancia? Esta ancla NO tiene el excluder de State — no hace falta, porque ninguna de las cuatro anclas de State cubre este símbolo (lo garantiza 'sin-ancla-de-despacho-en-este-simbolo'), pero el juez tiene que mirarlo igual.",
      "Bridge es estructuralmente idéntico a Strategy: confirmar que la intención es 'variar el algoritmo', no 'desacoplar abstracción de implementación'.",
    ],
    source: "https://refactoring.guru/design-patterns/strategy",
  };
}


/* ══════════════════════════════════════════════════════════════════════════
 * OLA AO · FRENTE AO1 — LA TRAZA DEL CAMINO DE NIVEL 2, Y LA SONDA DE LA
 * POBLACIÓN AMPLIADA. **SÓLO MEDICIÓN.**
 *
 * Mismo mecanismo, misma forma y mismo default que `startStrategyTrace`: se
 * prende llamando `startStrategyRefactoringTrace()` desde un script de
 * medición y se apaga sola al leerla. `null` (el default de producción) ⇒
 * costo cero. Ningún `required` lee nada de acá.
 *
 * QUÉ CONTESTA, y por qué el volcado no puede: `buildFromRefactoringAnchor`
 * devuelve `null` en cuanto un `required` no se sostiene, y con él se pierde
 * CUÁL. Además `repeatedDecisionIn` recorre **`fn.node`** — una sola función —
 * así que el volcado no puede decir cuánta población hay si la MISMA pregunta
 * se hiciera sobre el ARCHIVO ENTERO, que es lo que `repeated-switch.ts` hace
 * para los `switch` y NADIE hace para las escaleras de `if`.
 * ══════════════════════════════════════════════════════════════════════════ */

/** Una VISTA de un candidato: la misma pregunta hecha sobre un subconjunto de las escaleras. */
export interface Ao1Vista {
  readonly escaleras: number;
  readonly funciones: readonly string[];
  readonly lineas: readonly number[];
  readonly valores: number;
  readonly valoresLista: readonly string[];
  /** Valores DISTINTOS que aparecen en >= 2 escaleras separadas. */
  readonly compartidos: number;
  readonly cruzaFuncion: boolean;
  readonly ramasInvocan: boolean;
  readonly porQueRamas: string;
  readonly switches: number;
}

/** Un candidato de la sonda: un SUJETO del archivo decidido en >= 2 escaleras, en DOS vistas. */
export interface Ao1Candidato {
  readonly subject: string;
  /** TODAS las escaleras del sujeto: `if` y `switch`. */
  readonly todo: Ao1Vista;
  /** SÓLO las escaleras de `if` — la vista que no depende de la lectura de etiquetas de `switch`. */
  readonly soloIf: Ao1Vista | null;
}

export interface Ao1Ampliado {
  /** Lo que la producción de HOY encuentra (intra-FUNCIÓN, sólo `if`), o `null`. */
  readonly hoy: { readonly subject: string; readonly ladders: number; readonly valores: number } | null;
  readonly candidatos: readonly Ao1Candidato[];
  /** Símbolos del archivo que el vecindario muestra cubiertos por un ancla de despacho. */
  readonly simbolosConAnclaDespacho: readonly string[];
  /** Peldaños de escalera de `if` SIN operador de comparación en todo el archivo (límite L3). */
  readonly peldanosSinOperador: number;
  readonly funcionesEnArchivo: number;
}

export interface StrategyRefactoringTraceEntry {
  readonly findingId: string;
  readonly kind: string;
  readonly file: string;
  readonly line: number;
  readonly symbols: readonly string[];
  readonly withGraph: boolean;
  readonly withFile: boolean;
  readonly checks: readonly { readonly id: string; readonly holds: boolean; readonly why: string }[];
  readonly diesAt: string | null;
  readonly appliedState: string;
  readonly emitted: boolean;
  readonly ampliado: Ao1Ampliado | null;
}

let refactoringTrace: StrategyRefactoringTraceEntry[] | null = null;
export function startStrategyRefactoringTrace(): void {
  refactoringTrace = [];
}
export function takeStrategyRefactoringTrace(): readonly StrategyRefactoringTraceEntry[] {
  const t = refactoringTrace ?? [];
  refactoringTrace = null;
  return t;
}

/** Un peldaño leído para la SONDA: puede venir de una escalera de `if` o de un brazo de `switch`. */
interface Ao1Rung {
  readonly subject: string;
  readonly value: string;
  readonly ladderLine: number;
  readonly esSwitch: boolean;
  readonly fnName: string;
  readonly invokes: boolean;
  readonly callee: string | null;
}

/** Peldaños de `if` de UNA función, con el MISMO recorrido de `repeatedDecisionIn` (sin sufijos duplicados). */
function ao1IfRungs(fn: FunctionUnit, sets: DerivedNodeSets, sinOperador: { n: number }): Ao1Rung[] {
  const out: Ao1Rung[] = [];
  const seen = new Set<number>();
  const name = fn.name ?? "";
  const visit = (node: AstNode): void => {
    if (node.isNamed && sets.chainNodes.has(node.type) && node.childForFieldName("condition") && !sets.switchContainerNodes.has(node.type)) {
      const line = node.startPosition.row + 1;
      if (!seen.has(line)) {
        const ladderLine = line;
        let current: AstNode | null = node;
        while (current && current.childForFieldName("condition")) {
          const cond = current.childForFieldName("condition") as AstNode;
          const m = COMPARISON_OPERATOR_SPLIT.exec(cond.text.replace(/[()]/g, "").trim());
          seen.add(current.startPosition.row + 1);
          if (m) {
            const action = branchAction(current);
            out.push({
              subject: normalizeDiscriminant(m[1] ?? ""),
              value: normalizeDiscriminant(m[3] ?? ""),
              ladderLine,
              esSwitch: false,
              fnName: name,
              invokes: action ? branchInvokesCall(action) : false,
              callee: action ? branchPrimaryCallee(action) : null,
            });
          } else {
            sinOperador.n++;
          }
          const alt = current.childForFieldName("alternative") as AstNode | null;
          const siguiente = alt ? unwrapAlternative(alt) : null;
          current = siguiente && siguiente.childForFieldName("condition") ? siguiente : null;
        }
        seen.add(line);
      }
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i) as AstNode | null;
      if (child) visit(child);
    }
  };
  visit(fn.node);
  return out;
}

/**
 * Peldaños de `switch` de UNA función. EL VALOR ES LA ETIQUETA DEL BRAZO
 * (`case "a":` ⇒ `"a"`), no el texto de la acción: leído del campo `value`/
 * `pattern` que la gramática expone, y si no lo expone, del primer hijo
 * nombrado, descendiendo un salto cuando ese hijo es el envoltorio `_label`
 * que Java/C# usan — MISMA técnica, campo por campo, que
 * `detect/intra-file/repeated-switch.ts#armLabelText`, duplicada a propósito
 * (ese módulo no la exporta) igual que este archivo ya duplica `SWITCH_WORD`.
 *
 * POR QUÉ IMPORTA, y es un defecto que encontré midiendo: con el texto de la
 * ACCIÓN como valor, dos brazos nunca comparten valor con un peldaño de `if`,
 * así que "alfabetos que se solapan" era IMPOSIBLE por construcción para todo
 * caso mixto — exactamente la clase de compuerta que esta ola busca, dentro de
 * mi propio instrumento.
 */
const AO1_ARM_LABEL_FIELDS = ["value", "pattern"] as const;
const AO1_LABEL_WRAPPER = /(^|_)label$/;

function ao1NamedChildren(n: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < n.childCount; i++) {
    const c = n.child(i) as AstNode | null;
    if (c?.isNamed) out.push(c);
  }
  return out;
}

function ao1ArmLabel(arm: AstNode): string | null {
  for (const f of AO1_ARM_LABEL_FIELDS) {
    const v = arm.childForFieldName(f) as AstNode | null;
    if (v) return v.text.replace(/\s+/g, " ").trim();
  }
  let cand = ao1NamedChildren(arm)[0] ?? null;
  if (cand && AO1_LABEL_WRAPPER.test(cand.type)) cand = ao1NamedChildren(cand)[0] ?? cand;
  return cand ? cand.text.replace(/\s+/g, " ").trim() : null;
}

/** Brazos REALES de un `switch` ya localizado, con su etiqueta y su acción — mismo recorrido que `switchArmActions`, que sólo devuelve la acción. */
function ao1SwitchArms(container: AstNode): { label: string | null; action: AstNode }[] {
  const out: { label: string | null; action: AstNode }[] = [];
  const visit = (node: AstNode): void => {
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i) as AstNode | null;
      if (!child || !child.isNamed) continue;
      const isWrapper = BRANCH_SWITCH_WORD.test(child.type) && BRANCH_SWITCH_WRAPPER_EXCLUDE.test(child.type);
      const isArm = BRANCH_SWITCH_WORD.test(child.type) && !BRANCH_SWITCH_ARM_EXCLUDE.test(child.type) && !isWrapper;
      if (isArm) {
        let esReserva = false;
        for (let j = 0; j < child.childCount; j++) {
          const label = child.child(j) as AstNode | null;
          if (label?.isNamed && BRANCH_DEFAULT_LABEL.test(label.type)) esReserva = true;
        }
        if (esReserva) continue;
        const label = ao1ArmLabel(child);
        if (label === "default" || label === "else" || label === "_") continue;
        const declared = branchAction(child);
        out.push({ label, action: declared ?? child });
      } else {
        visit(child);
      }
    }
  };
  visit(container);
  return out;
}

function ao1SwitchRungs(fn: FunctionUnit, sets: DerivedNodeSets): Ao1Rung[] {
  const out: Ao1Rung[] = [];
  const name = fn.name ?? "";
  const visit = (node: AstNode): void => {
    if (node.isNamed && sets.switchContainerNodes.has(node.type)) {
      const texto = chainDiscriminantText(node);
      if (texto) {
        const subject = normalizeDiscriminant(texto);
        const ladderLine = node.startPosition.row + 1;
        for (const arm of ao1SwitchArms(node)) {
          if (!arm.label) continue;
          out.push({
            subject,
            value: normalizeDiscriminant(arm.label),
            ladderLine,
            esSwitch: true,
            fnName: name,
            invokes: branchInvokesCall(arm.action),
            callee: branchPrimaryCallee(arm.action),
          });
        }
      }
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i) as AstNode | null;
      if (child) visit(child);
    }
  };
  visit(fn.node);
  return out;
}

/** La MISMA prueba de `refactoringDistinctBehaviorCheck`, sobre los peldaños que le pasan. */
function ao1RamasInvocan(rungs: readonly Ao1Rung[]): { holds: boolean; why: string } {
  const literales = rungs.filter((r) => !r.invokes).length;
  if (literales / rungs.length >= MAJORITY_RATIO) return { holds: false, why: `tabla:${literales}/${rungs.length}` };
  const callees = rungs.map((r) => r.callee).filter((n): n is string => n !== null);
  if (callees.length < 2) return { holds: false, why: "menos-de-2-invocaciones" };
  const counts = new Map<string, number>();
  for (const c of callees) counts.set(c, (counts.get(c) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [topName, topCount] = ranked[0]!;
  if (topCount >= 2 && topCount / callees.length >= MAJORITY_RATIO) return { holds: false, why: `misma-operacion:${topName}` };
  return { holds: true, why: "distintas" };
}

/** LA SONDA. Recorre TODAS las funciones del archivo y agrupa por sujeto. Sólo medición. */
function ao1Ampliado(problem: Problem, ctx: HypothesisContext): Ao1Ampliado | null {
  if (!ctx.file) return null;
  const sets = ctx.setsFor(ctx.file.language);
  const sinOperador = { n: 0 };
  const todos: Ao1Rung[] = [];
  for (const fn of ctx.file.functions) {
    todos.push(...ao1IfRungs(fn, sets, sinOperador));
    todos.push(...ao1SwitchRungs(fn, sets));
  }
  const bySubject = new Map<string, Ao1Rung[]>();
  for (const r of todos) {
    if (!r.subject) continue;
    const l = bySubject.get(r.subject) ?? [];
    l.push(r);
    bySubject.set(r.subject, l);
  }
  const vistaDe = (l: readonly Ao1Rung[]): Ao1Vista | null => {
    const escaleras = new Set(l.map((r) => r.ladderLine));
    if (escaleras.size < 2) return null;
    const valores = [...new Set(l.map((r) => r.value))];
    if (valores.length < STRATEGY_MIN_BRANCHES) return null;
    const porValor = new Map<string, Set<number>>();
    for (const r of l) {
      const st = porValor.get(r.value) ?? new Set<number>();
      st.add(r.ladderLine);
      porValor.set(r.value, st);
    }
    const funciones = [...new Set(l.map((r) => r.fnName))];
    const ramas = ao1RamasInvocan(l);
    return {
      escaleras: escaleras.size,
      funciones,
      lineas: [...escaleras].sort((a, b) => a - b),
      valores: valores.length,
      valoresLista: valores.slice(0, 12),
      compartidos: [...porValor.values()].filter((st) => st.size >= 2).length,
      cruzaFuncion: funciones.length >= 2,
      ramasInvocan: ramas.holds,
      porQueRamas: ramas.why,
      switches: new Set(l.filter((r) => r.esSwitch).map((r) => r.ladderLine)).size,
    };
  };
  const candidatos: Ao1Candidato[] = [];
  for (const [subject, l] of [...bySubject.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const todo = vistaDe(l);
    if (!todo) continue;
    candidatos.push({ subject, todo, soloIf: vistaDe(l.filter((r) => !r.esSwitch)) });
  }
  const hoyD = refactoringDecisionOf(ctx, problem);
  const archivo = problem.locations[0]?.file ?? "";
  const conAncla = new Set<string>();
  for (const otro of ctx.neighborhood.findingsInFile(archivo)) {
    if (!(DISPATCH_ANCHORS as readonly string[]).includes(otro.kind)) continue;
    for (const loc of otro.locations) if ((loc.symbol ?? "").length > 0) conAncla.add(loc.symbol ?? "");
  }
  return {
    hoy: hoyD ? { subject: hoyD.subject, ladders: hoyD.ladders, valores: hoyD.values.length } : null,
    candidatos,
    simbolosConAnclaDespacho: [...conAncla].sort(),
    peldanosSinOperador: sinOperador.n,
    funcionesEnArchivo: ctx.file.functions.length,
  };
}

function recordRefactoringTrace(
  spec: HypothesisSpec<Problem, Graph>,
  problem: Problem,
  graph: Graph,
  ctx: HypothesisContext,
  emitted: boolean,
): void {
  const checks = spec.required.map((c) => {
    const r = c.run(problem, graph);
    return { id: c.id, holds: r.holds, why: r.evidence };
  });
  const loc = problem.locations[0];
  refactoringTrace?.push({
    findingId: problem.id ?? "",
    kind: problem.kind,
    file: loc?.file ?? "",
    line: loc?.startLine ?? 0,
    symbols: problem.locations.map((l) => l.symbol ?? ""),
    withGraph: graph !== null,
    withFile: ctx.file !== null,
    checks,
    diesAt: checks.find((c) => !c.holds)?.id ?? null,
    appliedState: spec.appliedState(problem, graph).state,
    emitted,
    ampliado: ao1Ampliado(problem, ctx),
  });
}

/**
 * OLA AN · AN1 — el camino del ancla de NIVEL 2, entero y aparte. Devuelve
 * `null` en cuanto un `required` no se sostiene, igual que el motor hace con
 * cualquier otra hipótesis; nunca puede devolver un estado CONFIRMADO
 * (`notAlreadyResolvedCheck` lo garantiza), así que no puede descartar la
 * propuesta de `Extract Method` que cuelga del mismo hallazgo.
 *
 * `places` es la FUNCIÓN donde vive la decisión repetida, no el hallazgo
 * entero: un `long-function` agrupado puede traer varias funciones y proponer
 * "tocá todo el archivo" sería mentira.
 */
function buildFromRefactoringAnchor(problem: Problem, graph: Graph, ctx: HypothesisContext): PatternHypothesisDraft | null {
  const spec = buildRefactoringSpec(ctx);
  const outcome = build(spec, ctx.capabilities, problem, graph);
  if (refactoringTrace) recordRefactoringTrace(spec, problem, graph, ctx, outcome !== null);
  if (!outcome) return null;
  const d = refactoringDecisionOf(ctx, problem);
  const places: readonly RoleLocation[] = d
    ? [{ file: d.fn.file, startLine: d.fn.startLine, endLine: d.fn.endLine, symbol: d.fn.name ?? undefined, role: `decide "${d.subject}" en ${d.ladders} escaleras separadas` }]
    : problem.locations;
  return toPatternHypothesis(spec, outcome, {
    anchorFindingId: problem.id,
    places,
    cost:
      "Una interfaz + una clase por variante (o, en Ruby/JS/Python, una función/lambda/bloque por variante inyectada, la forma real de Strategy en esos lenguajes) más el costo de inyectar la estrategia en cada call site.",
  });
}

export const hypothesis: HypothesisBuilder = {
  id: "strategy",
  pattern: "Strategy",
  layer: "patron",
  anchors: ["conditional-chain", "repeated-switch", TYPE_SWITCH_ANCHOR, ...REFACTORING_ANCHORS],
  build(problem, graph, ctx) {
    // OLA AN · AN1 — el ancla de NIVEL 2 tiene su propio spec y su propio
    // camino: los seis `required` del spec viejo leen el TÍTULO y el
    // `trigger` de las anclas de despacho, que un hallazgo `complexity`/
    // `long-function` no tiene. Se bifurca acá y en ningún otro lado, así que
    // NINGUNA hipótesis de las tres anclas viejas cambia de camino.
    if ((REFACTORING_ANCHORS as readonly string[]).includes(problem.kind)) {
      return buildFromRefactoringAnchor(problem, graph, ctx);
    }
    const spec = buildSpec(ctx);
    const outcome = build(spec, ctx.capabilities, problem, graph);
    if (strategyTrace) recordStrategyTrace(spec, problem, graph, ctx, outcome !== null);
    if (!outcome) return null;
    const hyp = toPatternHypothesis(spec, outcome, {
      anchorFindingId: problem.id,
      places: problem.locations,
      cost:
        "Una interfaz + una clase por variante (o, en Ruby/JS/Python, una función/lambda/bloque por variante inyectada, la forma real de Strategy en esos lenguajes) más el costo de inyectar la estrategia en cada call site.",
    });
    // Ola 10 — cachea el discriminante propio MIENTRAS el árbol está vivo
    // (sólo aplica a 'conditional-chain': 'repeated-switch' ya resuelve
    // 'repeticion-cruzada' sin árbol, ver crossRepetitionDiscriminator) para
    // que `refresh()`, corrida más tarde sin árbol pero con vecindario real,
    // pueda buscar repetición cruzada sin volver a necesitarlo.
    const refreshState: StrategyRefreshState = {
      ownDiscriminant: problem.kind === "conditional-chain" && ctx.file ? chainDiscriminantOf(ctx, ctx.file, problem) : null,
    };
    return { ...hyp, refreshState };
  },
  refresh(existing, problem, graph, ctx) {
    // OLA AN · AN1 — el ancla de nivel 2 no tiene discriminadores y no cachea
    // `ownDiscriminant`, así que no hay nada que refrescar; se dice explícito
    // en vez de depender del guard de `stored?.ownDiscriminant` de más abajo.
    if ((REFACTORING_ANCHORS as readonly string[]).includes(problem.kind)) return null;
    // 'ya-aplicado'/'aplicado-eludido' no compiten por confianza — nada que
    // una escalera de discriminadores pueda mejorar (mismo criterio que
    // `refreshDiscriminators`, chequeado antes para no construir un spec al pedo).
    if (existing.state !== "ausente" && existing.state !== "parcial") return null;
    const stored = existing.refreshState as StrategyRefreshState | undefined;
    if (!stored?.ownDiscriminant) return null; // sin discriminante cacheado (árbol no disponible en build(), o hipótesis de una caché anterior a esta ola) — nada que reusar, se deja como está.
    const spec = buildSpec(ctx, stored.ownDiscriminant);
    return refreshDiscriminators(spec, existing, problem, graph);
  },
};
