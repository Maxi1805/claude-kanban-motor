/**
 * Facade — hipótesis de referencia de F6 (CONTRATO-F6.md §S0): la única de
 * las 17 que ejercita los cuatro estados incluido `aplicado-eludido`, la
 * única que usa el GRAFO en vez de un árbol de un solo archivo, y 4/4 en el
 * spike (`impl/spikes/motor-hipotesis/hypotheses/facade.ts`) desde el
 * baseline — cero superficie a los tres bugs de arnés que sí afectaron
 * Prototype/Factory Method ahí. Esta migración reemplaza el `FakeGraph`
 * simulado del spike por el `CodeGraph` REAL (`graph/types.ts`) y reusa,
 * NUNCA reimplementa, las métricas ya registradas (`graph/metrics/pagerank.ts`,
 * `graph/metrics/agrupamiento.ts`) — mismo idioma que
 * `detect/inter-file/fanout-without-cohesion.ts` ya establece como precedente
 * aceptado para "cómo un módulo fuera de `graph/metrics/` consulta el grafo
 * sin recomputar Watts-Strogatz/PageRank a mano".
 *
 * PROBLEMA ANCLA: `fanout-without-cohesion` (fan-out interno alto + bajo
 * coeficiente de agrupamiento entre vecinos — exactamente la firma de un
 * Facade candidato, ver el docstring de ese detector). Es la ÚNICA ancla de
 * esta migración: el enunciado de la tarea menciona `god-component` y
 * `coupling-without-abstraction` como anclas secundarias, y `layer-skip`
 * como fuente de la consulta del excluder — pero sus `Finding`s son de PAR
 * de archivos (no "un archivo candidato a fachada"), así que adaptarlos
 * exige decidir CUÁL de los dos archivos del par es el candidato, una
 * decisión propia que no ejercitó el spike y que merece su propia medición,
 * no una improvisación bajo el alcance de "un archivo mío, nada más". Se
 * declara como alcance reducido, no como limitación oculta — ver el
 * resultado final de la tarea.
 *
 * ─── required ───────────────────────────────────────────────────────────
 * `fanout-above-threshold`: fan-out interno (colaboradores DISTINTOS a los
 * que este archivo referencia, proyección `file`) >= `FACADE_MIN_COLLABORATORS`.
 * `has-external-fanin`: al menos un archivo FUERA de esos colaboradores
 * referencia a este candidato — sin cliente, no hay nada que "esconder".
 * `invoca-en-vez-de-solo-nombrar` (OLA V, frente V5 — ver la sección
 * "OLA V" al final de este docstring): el candidato emite al menos UNA
 * llamada propia; un archivo que sólo nombra a otros no coordina nada.
 *
 * ─── discriminators (cada uno confirmado sube un peldaño) ───────────────
 * `low-neighbor-clustering`: el coeficiente de agrupamiento LOCAL del
 * candidato (Watts & Strogatz — `graph/metrics/agrupamiento.ts`, mismo
 * número que ya usa `fanout-without-cohesion.ts` para la MISMA distinción
 * Facade-vs-Mediator) es <= `LOW_CLUSTERING_THRESHOLD`: sus colaboradores
 * casi no se conocen entre sí, así que este archivo es el único punto que
 * los une — más compatible con "oportunidad real" que con un subsistema ya
 * cohesivo que simplemente tiene un nombre feo.
 * `fanout-is-repo-max`: el fan-out de este candidato es el más alto (o
 * empata el más alto) del repo — refuerza que es un hub real, no un
 * artefacto del umbral.
 *
 * ─── excluder / estado aplicado ("applied", fusionado) ──────────────────
 * `external-bypasses-to-internals` — LA consulta que CONTRATO-F6.md §1.5
 * describe como "exactamente lo que `layer-skip` ya sabe hacer con las
 * aristas tipadas": ¿algún cliente externo que referencia a este candidato
 * TAMBIÉN referencia DIRECTAMENTE a uno de sus colaboradores internos, sin
 * pasar por el candidato? Si sí, la fachada DE FACTO existe (fan-out+fan-in
 * ya lo confirmó `required`) pero está siendo puenteada → `aplicado-eludido`,
 * con cada fuga listada por rol (`RoleLocation.role: "cliente que puentea la
 * fachada"`, el ejemplo TEXTUAL que ya trae el docstring de ese campo). Si
 * no hay fuga → `ausente`: oportunidad clásica, compite en el ranking.
 *
 * ─── OLA 10 (CONTRATO-F10.md) — LAS TRES FORMAS: `ya-aplicado` y `parcial`
 * YA SON EXPRESABLES, con la distinción del propio contrato ───────────────
 * La premisa de F6 de arriba (¶ anterior, dejada abajo tal cual para que se
 * vea el razonamiento que se corrige) era cierta cuando el grafo sólo tenía
 * `contains`/`references` a grano archivo. Hoy hay `calls` símbolo→símbolo
 * (`graph/build.ts`'s partición callee/no-callee) y el campo `family` en
 * cada nodo — eso alcanza para dos hechos NUEVOS que el spike no tenía:
 *
 *   1. `hasDelegatingCalls`: ¿hay al menos una arista `calls` confidente
 *      desde un SÍMBOLO de F hacia un símbolo de uno de sus colaboradores?
 *      Distingue "F llama a sus colaboradores" (delegación real, la firma
 *      de un Facade que hace algo) de "F sólo los importa/menciona" (un
 *      barrel file, un `index.ts` de re-exportación, que NUNCA es un Facade
 *      aplicado por más que agrupe 4+ archivos).
 *   2. `ownStateWithinBudget`: cuenta de miembros propios `family: "other"`
 *      (campo/constante de nivel clase, `graph/symbols.ts`) de F. APROXIMACIÓN
 *      DECLARADA, no exacta: CONTRATO-F10.md §0.4 confirma que NO existe
 *      ninguna arista/campo que diga "este campo es DE TIPO colaborador" (un
 *      `private PaymentGateway payment;` sale `family: "other"` sin slot de
 *      tipo — indistinguible de un campo de estado genuino). Sin esa ranura,
 *      "sin hijos `contains` de family `other` AJENOS" no se puede filtrar
 *      por relación con los colaboradores — el proxy medible que queda es
 *      contar: si F tiene MÁS miembros `"other"` que colaboradores tiene,
 *      es más compatible con "God Object con fachada superficial" que con
 *      un Facade limpio (constructor-injection: ~1 campo por colaborador).
 *      Ninguna de las dos aristas bloquea `ya-aplicado` cuando el bypass ya
 *      existe (ver `appliedState` — el orden de la escalera preserva P4 sin
 *      tocarlo) ni cuando NO hay bypass pero SÍ hay otra fachada parcial
 *      solapada (`parcial`, ver abajo) — sólo deciden entre `ya-aplicado` y
 *      `ausente` en el resto de los casos.
 *
 * `parcial` (CONTRATO-F10.md): `>=2 archivos con fan-out >= umbral hacia
 * colaboradores del MISMO cluster (intersección no vacía), NINGUNO cubriendo
 * el conjunto entero` — varias fachadas parciales, ninguna puerta única.
 * Independiente del bypass de arriba: un archivo hermano puede solapar sin
 * ser jamás "cliente de F" (`bypassesOf` no lo vería). Índice invertido
 * colaborador→archivos-hub, cacheado junto al resto de esta vista — ver
 * `partialSiblingsOf`.
 *
 * SESGO DE DISEÑO DELIBERADO (regla 1 de la tarea: `ya-aplicado` NUNCA
 * sugiere, así que el riesgo real es EQUIVOCARSE HACIA `ausente`/`parcial`
 * sobre un Facade que ya está bien, no al revés): toda la escalera nueva
 * SÓLO puede mover un caso DESDE `ausente` HACIA `ya-aplicado`/`parcial` —
 * nunca hace más estricto lo que antes ya era `aplicado-eludido` (ver el
 * orden en `appliedState`: el chequeo de bypass, ya calibrado en P4 contra
 * el corpus, corre PRIMERO y sin cambios).
 *
 * ─── DECLARADO, NO OCULTO (F6, el razonamiento que Ola 10 corrige arriba)
 * ───────────────────────────────────────────────────────────────────────
 * Herencia directa del spike (ver su docstring de `appliedState`, verbatim:
 * "sin un símbolo de clase 'fachada' dedicado, no hay evidencia estructural
 * para afirmar ya-aplicado — eso necesitaría el grafo real con distinción de
 * símbolo, no sólo fan-in/fan-out de archivo"). Eso era cierto porque el
 * grafo de F6 no tenía `calls` a grano símbolo ni `family` en los nodos; con
 * ambos, "F llama a sus colaboradores Y no acumula estado propio de más" SÍ
 * es una distinción estructural, aunque aproximada en su segunda mitad (ver
 * arriba). El techo se queda en `"media"` (no `"alta"`) precisamente porque
 * `ownStateWithinBudget` es una aproximación declarada, no una medición
 * exacta — mismo criterio que pide el requisito 3 de la tarea: si no se
 * puede separar con certeza, el techo no sube.
 *
 * ─── FORMA EN LENGUAJES SIN CLASES ──────────────────────────────────────
 * Esta hipótesis NO mira clases ni miembros: opera sobre archivos y aristas
 * del grafo (`needs: []`, ninguna `Capability` de lenguaje). Es, de las 17,
 * la única genuinamente agnóstica de gramática — un módulo Go con una sola
 * función libre, un archivo Ruby de sólo bloques, o un componente Vue de
 * sólo funciones exportadas producen la MISMA firma de grafo si coordinan
 * >=4 colaboradores para clientes externos. No hay brecha por lenguaje que
 * declarar acá — a diferencia de Prototype/Factory Method/Iterator, que sí
 * la tienen (miran forma de clase/miembro).
 *
 * ─── SIN GRAFO ───────────────────────────────────────────────────────────
 * `graph === null` ⇒ no-aplicable, NUNCA `ausente` (spike, escenario 13).
 * DESVIACIÓN REPORTADA: `PatternHypothesis.missingCapabilities` está tipado
 * `readonly Capability[]` (`detect/capabilities.ts`, archivo compartido
 * fuera de mi alcance en esta tarea) y esa unión son 11 capacidades
 * ESTRUCTURALES POR LENGUAJE (`unidad-tipo-clase`, `herencia`, ...) — no
 * incluye disponibilidad del GRAFO, que es un dato de la CORRIDA, no del
 * lenguaje (mismo espíritu que `InterFileDetector.needsGraph`, que es un
 * booleano SEPARADO de `needs: readonly Capability[]` para los detectores).
 * `types.ts` está congelado por S0 y no lo puedo tocar en esta tarea. Elijo
 * un cast documentado (`"grafo" as Capability`) en vez de silenciar el caso
 * como `ausente` o como `null` — ambas alternativas violarían "no-aplicable
 * nunca se disfraza de cero" (regla del proyecto) de forma más grave que un
 * valor fuera de la unión declarada en el cast. Reportado para el
 * integrador: `Capability` (o `HypothesisBuilder`) debería ganar una forma
 * de declarar "necesito el grafo", análoga a `needsGraph`, en una ola futura.
 *
 * ─── MEDIDO contra el corpus (8 repos), no supuesto: el excluder de bypass
 * SOBRE-CONTABA en paquetes de utilidades densamente interconectados — P4,
 * YA CORREGIDO ─────────────────────────────────────────────────────────────
 * Verificado a mano (5/5 casos leídos, ver el resultado de la tarea P4): en
 * `jekyll` (`lib/jekyll/site.rb`) y en `guava` (`Ordering`/`ImmutableMap`/
 * `Maps`/`Iterators.java`), el "colaborador interno alcanzado directamente"
 * que disparaba `aplicado-eludido` resultó, las 5 veces, ser una utilidad de
 * bajo nivel referenciada por la MAYORÍA del paquete de forma independiente
 * (`lib/jekyll.rb`/`Jekyll.logger`; `Preconditions`/`GwtCompatible`/
 * `ParametricNullness` en guava) — no un detalle privado que sólo debería
 * alcanzarse a través del candidato a fachada. El candidato-hub en sí (el
 * `required`: fan-out/fan-in) fue plausible las 5 veces (site.rb/Ordering/
 * Maps/etc. son orquestadores reales); era la EVIDENCIA DE FUGA la que se
 * inflaba cuando el "colaborador interno" era, él mismo, un util ampliamente
 * compartido.
 *
 * CORREGIDO (P4, `bypassesOf` en `buildFacadeGraphView`): un colaborador sólo
 * cuenta como "interno puenteado" si su PROPIO fan-in independiente (repo
 * entero, excluyendo la referencia del propio candidato) es MENOR al fan-in
 * del propio candidato — es decir, mayormente alcanzado a través de este
 * candidato, no independientemente popular. Ningún umbral nuevo: compara cada
 * candidato contra su PROPIA popularidad, con el mismo dato
 * (`externalReferencersOf`) que esta vista ya calculaba. Medido en guava:
 * 27/27 `aplicado-eludido` (100%, antes) → 19/27 (después); en jekyll: el
 * caso `site.rb` (el único de la muestra de 5 con datos en el corpus golden)
 * pasa de `aplicado-eludido` a `ausente` — ver el resultado de la tarea para
 * el detalle completo de la medición.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * OLA V (frente V5) — EL MANIFIESTO DE IMPORTS DEJA DE SER UNA
 * RECOMENDACIÓN: `hasDelegatingCalls` SUBE DE EXCLUDER A `required`
 * ═══════════════════════════════════════════════════════════════════════
 *
 * QUÉ INTENCIÓN VERIFICA. Facade existe para que un cliente no tenga que
 * hablar con muchos colaboradores para hacer UN trabajo: la fachada HACE ese
 * trabajo en su lugar. Un archivo que sólo NOMBRA a sus colaboradores — los
 * importa, los re-exporta, los enumera en una lista — no hace ningún trabajo
 * por nadie: no hay orquestación que simplificar, y "formalizá una fachada
 * acá" no le ahorra una sola llamada a ningún cliente. La pregunta no es
 * "¿este archivo toca muchos archivos?" (eso es fan-out, el ancla) sino
 * "¿este archivo TRABAJA con ellos?".
 *
 * EL DEFECTO MEDIDO, y estaba escrito en este mismo docstring. La Ola 10
 * introdujo `hasDelegatingCalls` con la frase (arriba, ¶ "OLA 10", punto 1):
 * un barrel file "NUNCA es un Facade aplicado por más que agrupe 4+
 * archivos". Pero el chequeo se cableó SÓLO dentro de `appliedState`, donde
 * su único efecto es NEGAR `ya-aplicado` — y la caída natural de ese `if` es
 * `parcial`/`ausente`, o sea una RECOMENDACIÓN. Resultado: la evidencia
 * "esto es un agregador de imports, no una fachada activa" empujaba el caso
 * hacia "te recomiendo formalizar una fachada acá". Polaridad invertida.
 *
 * LOS CASOS, reproducidos por el frente V5 corriendo el analizador (no
 * leídos de un informe ajeno) — los dos `problema-si-patrón-no` de Facade de
 * la Ola U son EL MISMO caso:
 *   - `rubocop/lib/rubocop.rb:1` — 106 colaboradores, 3 miembros propios,
 *     CERO aristas `calls` hacia colaboradores; el archivo es 147 líneas de
 *     `require`/`require_relative`. Emitía `parcial`.
 *   - `guava/guava-testlib/src/com/google/common/collect/testing/
 *     AbstractCollectionTestSuiteBuilder.java:1` — `getTesters()` devuelve
 *     una lista de literales `.class`; NO llama a los colaboradores (la
 *     orquestación real vive en la superclase). Emitía `parcial`.
 * Y la misma forma explica dos `falso` de la misma muestra:
 * `ck-analyzer/server/services/detect/registry.ts:1` (manifiesto de plugins,
 * documentado como tal en su propio docstring) y
 * `sqlalchemy/lib/sqlalchemy/sql/sqltypes.py:1` (módulo de definición de
 * tipos: el fan-out es de imports de tipos, no de llamadas).
 *
 * POR QUÉ `required` Y NO OTRO PELDAÑO DE `appliedState`. Sin delegación no
 * hay fachada NI de facto NI a medio hacer: tampoco tiene sentido decir que
 * "la fachada está siendo eludida" (`aplicado-eludido`) cuando no hay
 * fachada que eludir. La pregunta es previa a la del estado, y por eso va
 * donde van las preguntas previas.
 *
 * QUÉ NO CAMBIA. `delegatesCheck` sigue en `appliedState` con su evidencia:
 * el rastro de por qué el caso llegó hasta ahí no se borra (queda vacuo — un
 * `[OK]` garantizado por el `required` —, y se dice acá, no se esconde).
 *
 * CONSECUENCIA MEDIDA (antes → después, ver el informe V5 de la Ola V para
 * la tabla completa): desaparecen las `parcial` de Facade emitidas sobre
 * archivos que no invocan nada. Es una pérdida de VOLUMEN de
 * recomendaciones, y es deliberada: de las 4 `parcial` de Facade juzgadas a
 * mano en todo el proyecto, 3 son no-recomendaciones (2 `problema-si-patrón-no`
 * + 1 `falso`) y la cuarta cambió de estado (veredicto vencido).
 *
 * LO QUE ESTE `required` NO ARREGLA, declarado: `sqlalchemy/lib/sqlalchemy/
 * sql/sqltypes.py:1` (el `falso` de la muestra: "módulo de DEFINICIÓN DE
 * TIPOS, el fan-out es de imports de tipos, no de llamadas") SÍ declara
 * clases con métodos que invocan, así que sigue pasando este chequeo. Su
 * forma es otra —"el fan-out es de tipos, no de colaboración"— y necesita la
 * ranura tipada que CONTRATO-F10.md §0.4 declara ausente. Nombrado para una
 * ola futura, no arreglado acá.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * OLA W (frente W5) — SEGUNDA ANCLA: `god-component`
 * ═══════════════════════════════════════════════════════════════════════
 *
 * QUÉ INTENCIÓN VERIFICA. La métrica de esta ola es COBERTURA: de los
 * hallazgos `verdadero` del nivel 1, ¿cuántos reciben una hipótesis
 * `ausente`/`parcial`? `fanout-without-cohesion` sólo mira fan-OUT (más
 * bajo-agrupamiento); `god-component` (`detect/inter-file/god-component.ts`)
 * exige fan-IN Y fan-OUT simultáneamente altos — un archivo del que
 * dependen muchos otros Y que depende de muchos otros. Es la MISMA
 * pregunta que Facade contesta ("¿este archivo concentra coordinación que
 * un cliente debería recibir detrás de una puerta única?"), medida con un
 * criterio DISTINTO e independiente (piso relativo al p95 del propio repo
 * en cada eje — ver el docstring de ese detector — en vez de fan-out
 * absoluto + agrupamiento). No es estructura ("una interfaz con N
 * implementadores"): es el mismo SMELL de acoplamiento que la Ola P dejó
 * medido con 5 verdaderos vivos en 13 repos y volumen 73 — un ancla más
 * angosta y con menos ruido que la que ya tenía esta hipótesis.
 *
 * POR QUÉ NO HACE FALTA NINGÚN CHEQUEO NUEVO. `FacadeProblem` es sólo
 * `{ file }` — todo `required`/`discriminator`/`appliedState` de esta
 * hipótesis ya opera exclusivamente sobre el ARCHIVO candidato, nunca sobre
 * el `Finding` ancla en sí (ni su `title`, ni sus `trigger`s). Un
 * `god-component.ts#Finding` trae `locations[0].file` con la MISMA forma
 * que `fanout-without-cohesion.ts` (verificado leyendo las dos funciones
 * `run()`): el archivo candidato, línea 1 a última línea. Agregar el kind a
 * `anchors` alcanza — es exactamente el idiom que `distributed-duplication`
 * (Command/Null Object/Composite/Iterator) y `duplication`
 * (Command/Iterator) ya usan para alimentar varios patrones con el mismo
 * cuerpo de chequeos, y el que `strategy.ts`/`chain-of-responsibility.ts`
 * usan para escuchar más de un ancla ellos mismos.
 *
 * MEDIDO, no supuesto (`dump-hallazgos.mts` sobre 7 repos del corpus —
 * hugo/eslint/newtonsoft-json/rubocop/click/sqlalchemy/jekyll, los que
 * tienen `god-component` `verdadero` en la planilla —, antes/después de este
 * cambio; ver el informe W5 de la ola para la tabla completa). Antes: de los
 * 8 hallazgos `god-component` `verdadero` VIVOS del corpus (2 de los 10
 * juzgados ya no viven — línea movida/piso relativo cambiado, vigencia por
 * id: `eslint/lib/rule-tester/rule-tester.js`, `sqlalchemy/.../lambdas.py`),
 * CERO tenían una hipótesis de ningún patrón — `god-component` no alimentaba
 * a nadie. Después: **las 8 pasan a `aplicado-eludido`, CERO a
 * `ausente`/`parcial`** — la cobertura de esta ola (`ausente`/`parcial`
 * sobre verdaderos) NO SUBE con este cambio, medido, no una promesa. El
 * ancla sí deja de estar muda (8 hipótesis nuevas donde antes no había
 * ninguna) y la información que aporta es plausible por sí sola (en las 8,
 * `bypassesOf` encuentra fugas reales — ver el `why` de cada caso) — pero no
 * es el resultado que esta ola mide.
 *
 * POR QUÉ DA SIEMPRE `aplicado-eludido`, DIAGNOSTICADO — Y ES LA MISMA
 * CAUSA QUE YA EXPLICA POR QUÉ 46 DE LAS 65 HIPÓTESIS PREVIAS DE FACADE
 * (Ola V, tabla del INTEGRADOR §3.1) SON `aplicado-eludido`/`ya-aplicado`
 * SOBRE `fanout-without-cohesion`. `bypassesOf` (arriba, comentario "P4")
 * sólo cuenta un colaborador como "puenteado ilegítimamente" cuando su
 * fan-in INDEPENDIENTE es MENOR al fan-in del propio candidato — el
 * criterio que filtra al util realmente compartido (`Preconditions.java`,
 * fan-in 367). Un `god-component` tiene, POR DEFINICIÓN (`detect/inter-
 * file/god-component.ts`), fan-in ALTO — más alto que la mayoría del repo.
 * Con el propio fan-in ya arriba del percentil 95, el filtro de P4 queda
 * casi vacío: CUALQUIER archivo con fan-in menor al del candidato "cuenta"
 * como colaborador puenteado, aunque él mismo sea ampliamente compartido en
 * términos absolutos. Verificado en las 8 (no argumentado): en los 5 casos
 * con más de una fuga, los "colaboradores puenteados" son sistemáticamente
 * TIPOS/ENUMS de bajo nivel referenciados por media docena de archivos cada
 * uno — `Src/Newtonsoft.Json/{NullValueHandling,DateFormatHandling,
 * TraceLevel,...}.cs` puenteando a `JsonSerializer.cs` (fan-in 18: CUALQUIER
 * enum del namespace tiene menos), `src/click/{globals,utils,exceptions}.py`
 * puenteando a `core.py` (fan-in 54). Es la MISMA forma que P4 ya nombró y
 * arregló para `fanout-without-cohesion` (jekyll `lib/jekyll.rb` fan-in 50
 * vs. `site.rb` fan-in 5) — sólo que el umbral relativo al candidato, que
 * funciona cuando el candidato tiene fan-in MODESTO, deja de filtrar nada
 * cuando el candidato mismo es, por construcción del ancla, un outlier de
 * fan-in. **No arreglado acá**: tocar `bypassesOf` es tocar el excluder que
 * las 65 hipótesis EXISTENTES de Facade ya usan y que P4 calibró contra el
 * corpus completo (guava 19/27) — un cambio ahí exige re-medir esa
 * población entera, no sólo las 8 nuevas, y esta tarea es "segunda ancla",
 * no "rediseñar el excluder". Queda nombrado, con el mecanismo exacto y los
 * casos, para quien lo tome: el umbral de `bypassesOf` necesita ser relativo
 * al p95 del REPO (como ya hace `god-component.ts`, ver su propio
 * docstring), no al fan-in del candidato — mismo espíritu que Ola P ya
 * aplicó ahí, sin aplicarlo todavía acá.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * OLA X (frente B4) — `bypassesOf` DEJA DE CONTAR AL PROPIO SUBSISTEMA COMO
 * "CLIENTE QUE PUENTEA", Y EL UMBRAL SE CLAVA AL p95 DEL REPO
 * ═══════════════════════════════════════════════════════════════════════
 *
 * QUÉ INTENCIÓN VERIFICA. `aplicado-eludido` afirma una cosa muy concreta:
 * *"la fachada de facto existe y un CLIENTE la está esquivando para hablar
 * directo con un detalle interno"*. Eso exige dos hechos, y el chequeo sólo
 * verificaba medio segundo:
 *   (1) quien puentea tiene que ser un **cliente**, o sea alguien de AFUERA
 *       del subsistema. Un colaborador de F que referencia a otro colaborador
 *       de F no está esquivando ninguna puerta: es el subsistema funcionando
 *       por dentro. Si eso contara como fuga, "el subsistema tiene cohesión"
 *       se leería como "te están puenteando", que es lo contrario.
 *   (2) lo puenteado tiene que ser un **detalle interno**, o sea algo que NO
 *       es independientemente popular. Eso ya lo preguntaba P4, pero contra
 *       la popularidad del CANDIDATO.
 *
 * EL DEFECTO (1), MEDIDO Y NUEVO — no es el que la Ola W diagnosticó.
 * `externalReferencersOf` NO filtra: devuelve TODO referenciador entrante,
 * incluidos los propios colaboradores. El bucle de `bypassesOf` nunca
 * excluía `ext ∈ internals`. Casos abiertos a mano (frente B4, 13 repos):
 *   - `jekyll/lib/jekyll.rb` — 43 "fugas", y las 43 son `lib/jekyll/*.rb`
 *     hablando entre sí.
 *   - `hugo/hugolib/site.go` — 146, con `page.go`/`content_map.go`, que son
 *     sus PROPIOS colaboradores, contados como clientes que la puentean.
 *   - `newtonsoft-json/.../JsonSerializerProxy.cs` — 10, todas
 *     `Serialization/*` entre sí.
 *
 * EL DEFECTO (2): LA RECETA HEREDADA ESTÁ FALSADA, Y ESTÁ MEDIDO. El bloque
 * "OLA W" de arriba (y `COBERTURA-NIVEL-2.md` §3.C) prescriben que el umbral
 * sea "relativo al p95 del repo". Aplicada SOLA, esa receta no cambia UN SOLO
 * estado: en hugo baja el contador de fugas de 208 a 54, de 146 a 88, de 96 a
 * 46 — y **22 de los 23 candidatos siguen con ≥1 fuga**, así que siguen en
 * `aplicado-eludido`. Una compuerta que sólo pregunta `> 0` no se mueve
 * porque el contador baje. Por eso acá van las dos cosas, no una.
 *
 * CÓMO QUEDA EL UMBRAL, y por qué `min` y no `p95` a secas: P4 calibró contra
 * el corpus con "menor que el fan-in del candidato" y esa regla es CORRECTA
 * mientras el candidato tenga popularidad modesta (`site.rb` fan-in 5 vs.
 * `lib/jekyll.rb` fan-in 50). Lo que rompe es cuando el candidato mismo es un
 * outlier de fan-in — que es, POR CONSTRUCCIÓN del ancla `god-component`,
 * el caso normal de la mitad de esta población. `Math.min(fanInPropio, p95)`
 * conserva P4 intacto donde P4 acertaba y le pone techo donde el propio
 * candidato hacía de umbral. Ningún número inventado: el p95 se mide sobre el
 * fan-in de los archivos de ESTE repo, la misma forma relativa que
 * `god-component.ts` ya usa para sus dos ejes.
 *
 * QUÉ NO ARREGLA, declarado. Esto NO agrega ni una recomendación, y está
 * medido: los casos que dejan de tener fuga caen al peldaño siguiente de la
 * escalera, que es `ya-aplicado` — otra no-recomendación. La cobertura no se
 * mueve con este cambio; lo que se mueve es que `aplicado-eludido` deje de
 * significar "este archivo tiene vecinos". El frente B4 midió por qué la
 * cobertura NO puede moverse desde este archivo (ver su informe): Facade
 * ancla en el HUB, y una hipótesis anclada en el hub sólo puede contestar "la
 * fachada ya existe" o "la están puenteando" — la población donde una fachada
 * FALTA está del lado de los CLIENTES y ningún ancla del catálogo la ubica.
 * Por eso `ausente` da 0 de 140 en 13 repos.
 *
 * Y LO QUE B4 DECIDIÓ NO HACER, con el número que lo sostiene: reordenar la
 * escalera para que `parcial` ("varias fachadas parciales, ninguna puerta
 * única") gane antes que `ya-aplicado` parece la salida obvia y NO lo es —
 * `partialSiblingsOf` devuelve entre 30 y 239 hermanos por candidato en hugo,
 * así que ese reordenamiento convertiría ~137 de las 140 hipótesis en
 * recomendaciones sin una sola juzgada. Es la "cobertura falsa" de la Ola U.
 *
 * ESCAPE DE MEDICIÓN, RETIRADO POR EL INTEGRADOR DE LA OLA X. B4 dejó vivo un
 * `CK_B4_BYPASS_LEGACY=1` que restauraba el criterio anterior para poder medir
 * su delta aislado (resultado: 0 estados movidos en 6 repos y 6 lenguajes, lo
 * único que cambia son las ubicaciones fabricadas). Se retira porque
 * `analyze-cache.ts` documenta como INVARIANTE que ningún archivo del camino
 * de análisis lee `process.env`: `cacheKeyFor` combina `repoSignature` +
 * `analyzerFp` + `limits` y NO el valor de la variable, así que dos corridas
 * con el mismo código y distinto valor colisionan en la MISMA entrada de
 * caché y una de las dos se sirve mintiendo. El delta ya está medido y el
 * código queda con una sola forma.
 *
 * QUÉ NO CAMBIA. Ningún `required`/`discriminator`/`appliedState` se toca.
 * `ceiling` sigue en `"media"` — la aproximación de `ownStateWithinBudget`
 * (§ "OLA 10" arriba) es la misma para cualquier archivo, venga su ancla de
 * `fanout-without-cohesion` o de `god-component`. Un archivo con AMBOS
 * `Finding`s (siete casos en el corpus, ver el informe) recibe DOS
 * hipótesis de Facade — una por `Finding` ancla, cada una con su propio
 * `anchorFindingId` — no una fusionada: es el mismo comportamiento que ya
 * tiene cualquier archivo con dos anclas de patrones distintos en este
 * proyecto (`arbitrateRivalHypotheses` en `run.ts` sólo arbitra entre
 * PATRONES rivales sobre el MISMO `Finding`, nunca colapsa dos `Finding`s
 * del mismo patrón).
 */
import type { Capability } from "../detect/capabilities.js";
import { confidentEdges } from "../detect/inter-file/confident-edges.js";
import { ROLE_PIECE, ROLE_REPEATS } from "../detect/inter-file/repeated-collaborator-set.js";
import type { Anchor, Finding, RepoUnit, RoleLocation } from "../detect/types.js";
import { clustering } from "../graph/metrics/agrupamiento.js";
import { createComputeBudget } from "../graph/metrics/budget.js";
import { pagerank } from "../graph/metrics/pagerank.js";
import { projectGraph } from "../graph/metrics/projection.js";
import { EMPTY_NEIGHBORHOOD } from "../graph/neighborhood.js";
import { fileNodeId, type CodeGraph, type CodeGraphNode } from "../graph/types.js";
import { build, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisCheck, PatternHypothesisDraft, PatternState } from "./types.js";

/** Ver docstring del módulo, "SIN GRAFO": `Capability` no tiene un valor
 *  para "falta el grafo" — cast documentado, no un valor real del lenguaje. */
const GRAPH_CAPABILITY = "grafo" as Capability;

/** [provisional] mismo umbral que `pattern-structural.ts:776`
 *  (`FACADE_MIN_COLLABORATORS`), pendiente de re-derivar contra el corpus
 *  externo (K2) — no re-medido en esta tarea. */
const FACADE_MIN_COLLABORATORS = 4;

/** [provisional] mismo umbral que `fanout-without-cohesion.ts`'s
 *  `MAX_CLUSTERING_SPEC` (0.2) — reusado, no reinventado, porque es
 *  literalmente la misma distinción Facade-vs-Mediator que ese detector ya
 *  declara y mide. Pendiente K2. */
const LOW_CLUSTERING_THRESHOLD = 0.2;

const FACADE_TO_CONFIRM = [
  "¿Los colaboradores internos son en verdad un subsistema coherente, o son responsabilidades sin relación entre sí? " +
    "Si es lo segundo, el remedio es repartir este archivo en varios módulos más chicos (Extract Class), no envolverlo " +
    "en una única fachada — una fachada sobre responsabilidades ajenas entre sí sólo esconde un God Object detrás de " +
    "una API más prolija.",
  "Ola 10 — si hay más de un archivo concentrando cada uno un subconjunto solapado del mismo subsistema (estado " +
    "`parcial`), ¿conviene consolidarlos en una única fachada, o en realidad sirven audiencias/casos de uso distintos " +
    "que no deberían compartir una sola puerta?",
];

const FACADE_COST =
  "Una clase/módulo más (la fachada) que exponga sólo la API que sus clientes externos necesitan, delegando en los " +
  "colaboradores internos; alguien debe mantenerla sincronizada si el subsistema cambia, y puede volverse un God " +
  "Object si se le sigue agregando responsabilidad sin límite.";

/** El "problema" tal como lo ve esta hipótesis: sólo el archivo candidato — todo lo demás sale de `FacadeGraphView`. */
interface FacadeProblem {
  file: string;
}

/**
 * Vista sobre el grafo, cacheada por identidad de `CodeGraph` (una corrida
 * procesa el MISMO grafo para todos los `Finding`s de `fanout-without-cohesion`
 * que anclen esta hipótesis — sin esta caché, cada `Finding` repetiría su
 * propia proyección + power-iteration de agrupamiento, mismo costo evitable
 * que `fanout-without-cohesion.ts` ya documenta como limitación de
 * infraestructura, no de este archivo).
 */
interface FacadeGraphView {
  internalCollaboratorsOf(file: string): readonly string[];
  externalReferencersOf(file: string): readonly string[];
  clusteringOf(file: string): number;
  readonly maxFanOut: number;
  bypassesOf(file: string): readonly { external: string; internal: string }[];
  /** Ola 10 — ¿algún símbolo de `file` tiene `calls` confidente hacia un símbolo de uno de sus colaboradores internos? Ver docstring del módulo. */
  hasDelegatingCalls(file: string): boolean;
  /** Ola 10 — cuenta de miembros propios `family: "other"` de `file` (aproximación de "estado propio", ver docstring). */
  ownStateCount(file: string): number;
  /**
   * OLA V (frente V5) — cuántas aristas `calls` SALEN de un símbolo de
   * `file`, contando TODAS: ambiguas, inferidas, y también las que aterrizan
   * en el propio archivo. Deliberadamente NO usa `confidentEdges` — ver
   * `emiteTrabajoPropio` y la sección "OLA V" del docstring del módulo: la
   * pregunta no es "¿a quién le llama?" (eso lo contesta
   * `hasDelegatingCalls`, y en C# la resolución lo deja en cero por hueco de
   * grafo) sino "¿este archivo invoca ALGO?" — cero es un hecho del código.
   */
  outgoingCallCount(file: string): number;
  /** Ola 10 — otros archivos con fan-out >= umbral hacia colaboradores que solapan con los de `file`, sin que ninguno cubra al otro entero (la forma PARCIAL). */
  partialSiblingsOf(file: string): readonly { file: string; overlap: readonly string[] }[];
  /**
   * OLA AD (frente AD4) — archivos que `file` INVOCA (arista `calls`
   * símbolo→símbolo hacia otro archivo), **contando también las ambiguas**.
   *
   * POR QUÉ NO ALCANZA `internalCollaboratorsOf`, Y ES UN HECHO MEDIDO, NO UNA
   * PREFERENCIA: esa consulta sale de `projectGraph`, que por contrato
   * (`CONTRATO-F9.md` §4.5, `projection.ts:85-90`) deja FUERA de toda
   * proyección las aristas `provenance: "ambiguous"`. El ancla
   * `repeated-collaborator-set` vive justamente sobre ellas — **medido sobre
   * los 16 repos: excluyendo las ambiguas, ese detector emite CERO en los
   * 16** —, así que la proyección no puede ver ni una de las coordinaciones
   * que el ancla encuentra, y un `required` apoyado en ella daría `false`
   * siempre. Es el MISMO argumento que esta hipótesis ya escribió para
   * `outgoingCallCount` (que también recorre `graph.edges` en crudo a
   * propósito): la existencia de la llamada es un hecho del CÓDIGO, y sólo su
   * DESTINO es lo que el resolutor no supo fijar.
   *
   * CONSECUENCIA DECLARADA: un destino ambiguo puede ser el equivocado. Por
   * eso esta consulta la usa SÓLO el camino del ancla nueva —ningún
   * `required`/discriminador/`appliedState` del camino viejo la ve— y el
   * propio ancla publica, por hallazgo, cuántos de sus pasos apoyan en al
   * menos una arista NO ambigua.
   */
  rawCalleeFilesOf(file: string): ReadonlySet<string>;
  /** OLA AD — el inverso de `rawCalleeFilesOf`: archivos que invocan a `file`, ambiguas incluidas. */
  rawCallerFilesOf(file: string): ReadonlySet<string>;
  /**
   * OLA AD (frente AD4) — cuántas de `pieces` invoca cada archivo que invoca
   * al menos una, ordenado de mayor a menor cobertura. Es la consulta que el
   * camino de entrada del ancla `repeated-collaborator-set` necesita para
   * decidir la RESOLUCIÓN: quién, si alguien, ya coordina ese subsistema.
   *
   * Se calcula sobre `rawCallerFilesOf` —el índice inverso de arriba, con las
   * ambiguas incluidas— por el mismo motivo, y no recorriendo los archivos
   * del repo.
   */
  coverageOfPieces(pieces: readonly string[]): readonly { file: string; covers: number; fanIn: number }[];
}

const VIEW_CACHE = new WeakMap<CodeGraph, FacadeGraphView>();

function pathOfProjectedId(id: string): string | null {
  return id.startsWith("file:") ? id.slice("file:".length) : null;
}

function buildFacadeGraphView(graph: CodeGraph): FacadeGraphView {
  const cached = VIEW_CACHE.get(graph);
  if (cached) return cached;

  // Estructura pura (fan-out/fan-in CRUDOS): se lee directo de la proyección
  // `file` — mismos `kinds` ("todas menos contains") que `pagerank.ts`
  // declara, reusados como LISTA (no se llama `pagerank.compute`: el
  // grado crudo no necesita power-iteration, y `PageRankValue.fanOut`/
  // `.fanIn` de la métrica registrada son, por construcción, exactamente
  // `out[i].length`/`inbound[i].length` de esta misma proyección).
  const prGraph = projectGraph(graph, "file", pagerank.edgeKinds);
  const { nodeIds, indexOf, out } = prGraph;
  const inbound: number[][] = nodeIds.map(() => []);
  for (let i = 0; i < out.length; i++) {
    for (const j of out[i]!) inbound[j]!.push(i);
  }

  const dedupedPaths = (indices: readonly number[]): readonly string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const idx of indices) {
      const p = pathOfProjectedId(nodeIds[idx]!);
      if (p && !seen.has(p)) {
        seen.add(p);
        result.push(p);
      }
    }
    return result;
  };

  const internalCollaboratorsOf = (file: string): readonly string[] => {
    const idx = indexOf.get(fileNodeId(file));
    return idx === undefined ? [] : dedupedPaths(out[idx]!);
  };

  const externalReferencersOf = (file: string): readonly string[] => {
    const idx = indexOf.get(fileNodeId(file));
    return idx === undefined ? [] : dedupedPaths(inbound[idx]!);
  };

  let maxFanOut = 0;
  for (const adj of out) maxFanOut = Math.max(maxFanOut, adj.length);

  // OLA X (B4) — p95 del fan-in de los archivos de ESTE repo. Es el techo del
  // umbral de `bypassesOf` (ver "OLA X" en el docstring del módulo): la
  // popularidad a partir de la cual un archivo deja de ser un "detalle
  // interno" del subsistema de nadie. Se mide sobre la MISMA proyección que
  // el resto de esta vista, una sola vez por grafo (cacheada con la vista).
  const fanInSamples: number[] = [];
  for (let i = 0; i < nodeIds.length; i++) {
    if (pathOfProjectedId(nodeIds[i]!) !== null) fanInSamples.push(dedupedPaths(inbound[i]!).length);
  }
  fanInSamples.sort((a, b) => a - b);
  const fanInP95 = fanInSamples.length === 0 ? 0 : fanInSamples[Math.min(fanInSamples.length - 1, Math.floor(0.95 * fanInSamples.length))]!;

  // El ÚNICO cómputo no-trivial que este archivo reusa (nunca reimplementa):
  // Watts-Strogatz local, ya registrado en `graph/metrics/agrupamiento.ts`.
  const clGraph = projectGraph(graph, "file", clustering.edgeKinds);
  const clResult = clustering.compute(clGraph, { budget: createComputeBudget() });
  const clValues = clResult.status === "computed" ? clResult.values : null;

  // OLA AI (frente AI1) — el presupuesto de acá pasó a `createComputeBudget()`
  // porque era un RELOJ DE PARED: medido sobre `corpus-app/Ghost`, `clustering`
  // se agotaba ~1 de cada 15 veces, y con el mapa vacío `clusteringOf` devuelve
  // 0 para TODO archivo, o sea que `lowNeighborClustering` confirmaba de más
  // según la carga de la máquina. Era no-determinismo de NIVEL 2. La
  // degradación de abajo NO se toca. Ver `budget.ts`.
  //
  // Si el presupuesto se agota, no hay valor medido: se degrada a 0, que
  // ata a `lowNeighborClustering` (un DISCRIMINADOR, nunca un `required`) a
  // confirmar de más en el peor caso — nunca a inventar un estado. Mismo
  // criterio de degradación neutra que el resto del catálogo F4/F5 declara
  // para presupuesto agotado.
  const clusteringOf = (file: string): number => clValues?.get(fileNodeId(file)) ?? 0;

  // LA CONSULTA DEL EXCLUDER — CONTRATO-F6.md §1.5: "es exactamente lo que
  // `layer-skip` ya sabe hacer con las aristas tipadas". No se reimporta
  // `layer-skip.ts` (su unidad es un PAR de archivos con profundidad de
  // carpeta, no "candidato a fachada + sus colaboradores"): se reusa la
  // MISMA idea estructural (arista directa que salta el nivel intermedio),
  // expresada sobre la proyección que este archivo ya construyó.
  //
  // SIMPLIFICACIÓN DECLARADA (no oculta): a diferencia de `layer-skip.ts`/
  // `dependency-cycle.ts` (que excluyen `provenance: "inferred"` de lo que
  // CUENTA como evidencia — "OJO CON JAVA", medido en guava: 81% de
  // `references` aceptadas ahí son `inferred`), esta consulta usa TODAS las
  // aristas de la proyección, la MISMA topología que `fanout-without-cohesion`
  // ya usó para emitir el `Finding` ancla. Acotar por provenance acá exigiría
  // su propio umbral citado (`MAJORITY_INFERRED_RATIO`) y una medición propia
  // contra el corpus que esta tarea no corrió — declarado como limitación,
  // no como bug: un cliente con `provenance: "inferred"` puede sobre-contar
  // fugas en repos donde `path-proximity` domina (guava, medido en el
  // docstring de `fanout-without-cohesion.ts`).
  const bypassesOf = (file: string): readonly { external: string; internal: string }[] => {
    const internals = new Set(internalCollaboratorsOf(file));
    // P4 (precisión medida en corpus) — IMPLEMENTA el refinamiento que el
    // docstring del módulo dejaba "declarado, no implementado": un
    // colaborador cuyo PROPIO fan-in independiente (repo entero, EXCLUYENDO
    // la propia referencia del candidato — es obvio que la fachada referencia
    // a su colaborador, eso no dice nada de qué tan privado es) es >= el
    // fan-in del propio candidato es, por definición, AL MENOS tan
    // independientemente popular como la fachada que se está evaluando — no
    // es un detalle privado del subsistema, es una utilidad compartida
    // (medido: `Preconditions.java` fan-in 367 vs. candidatos como
    // `Ordering.java` fan-in 62; `lib/jekyll.rb` fan-in 50 vs. `site.rb`
    // fan-in 5 — ver el resultado de la tarea). Ningún umbral nuevo: reusa
    // `externalReferencersOf`, ya calculado por esta misma vista, comparando
    // cada candidato contra SU PROPIA popularidad en vez de contra una
    // constante inventada.
    const ownFanIn = externalReferencersOf(file).length;
    const limit = Math.min(ownFanIn, fanInP95);
    const seen = new Set<string>();
    const result: { external: string; internal: string }[] = [];
    for (const ext of externalReferencersOf(file)) {
      // OLA X (B4) — un COLABORADOR del candidato no es un cliente que lo
      // puentee: es el subsistema hablando por dentro. Sin esta línea, la
      // cohesión del subsistema se leía como fuga (jekyll: 43 de 43 fugas
      // eran `lib/jekyll/*.rb` entre sí).
      if (internals.has(ext)) continue;
      for (const target of internalCollaboratorsOf(ext)) {
        if (target === file || !internals.has(target)) continue;
        const targetIndependentFanIn = externalReferencersOf(target).filter((r) => r !== file).length;
        if (targetIndependentFanIn >= limit) continue;
        const key = `${ext} ${target}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ external: ext, internal: target });
      }
    }
    return result;
  };

  // ── Ola 10 (CONTRATO-F10.md) — LA FORMA COMPLETA / PARCIAL ───────────────
  // Índice por id: SÓLO para leer `.file`/`.kind`/`.family` de un extremo de
  // arista — nunca para reconstruir aristas (`graph.edges`/`confidentEdges`
  // ya las trae).
  const nodeById = new Map<string, CodeGraphNode>();
  for (const n of graph.nodes) if (!nodeById.has(n.id)) nodeById.set(n.id, n);

  // `calls` símbolo→símbolo, agrupadas por el ARCHIVO del llamador — evidencia
  // de DELEGACIÓN real (un miembro de F invoca a un colaborador), no sólo de
  // que F lo menciona/importa. Una sola pasada O(E) sobre `confidentEdges`,
  // cacheada junto al resto de esta vista (misma disciplina que el resto del
  // archivo: nunca recorrer `graph.edges` crudo dos veces por la misma corrida).
  const callsToFilesByFromFile = new Map<string, Set<string>>();
  for (const e of confidentEdges(graph)) {
    if (e.kind !== "calls") continue;
    const from = nodeById.get(e.from);
    const to = nodeById.get(e.to);
    if (!from || !to || from.kind !== "symbol" || to.kind !== "symbol") continue;
    let set = callsToFilesByFromFile.get(from.file);
    if (!set) {
      set = new Set();
      callsToFilesByFromFile.set(from.file, set);
    }
    set.add(to.file);
  }

  // Miembros `family: "other"` (campo/constante de nivel clase, `graph/symbols.ts`)
  // propios de cada archivo — el proxy DECLARADO (no exacto, ver docstring del
  // módulo) de "estado propio" que usa `ownStateWithinBudget` más abajo.
  const otherFamilyCountByFile = new Map<string, number>();
  for (const n of graph.nodes) {
    if (n.kind !== "symbol" || n.family !== "other") continue;
    otherFamilyCountByFile.set(n.file, (otherFamilyCountByFile.get(n.file) ?? 0) + 1);
  }

  // Archivos "hub" (fan-out >= `FACADE_MIN_COLLABORATORS`) con su propio
  // conjunto de colaboradores, más el índice invertido colaborador→hubs —
  // para que `partialSiblingsOf` no recorra TODOS los pares de archivos del
  // repo, sólo los que comparten al menos un colaborador con `file`.
  const hubCollaboratorSets = new Map<string, ReadonlySet<string>>();
  const hubsByCollaborator = new Map<string, string[]>();
  for (const id of nodeIds) {
    const p = pathOfProjectedId(id);
    if (!p) continue;
    const collabs = internalCollaboratorsOf(p);
    if (collabs.length < FACADE_MIN_COLLABORATORS) continue;
    const set = new Set(collabs);
    hubCollaboratorSets.set(p, set);
    for (const c of set) {
      const list = hubsByCollaborator.get(c) ?? [];
      list.push(p);
      hubsByCollaborator.set(c, list);
    }
  }

  const hasDelegatingCalls = (file: string): boolean => {
    const collabSet = new Set(internalCollaboratorsOf(file));
    if (collabSet.size === 0) return false;
    const calledFiles = callsToFilesByFromFile.get(file);
    if (!calledFiles) return false;
    for (const f of calledFiles) if (collabSet.has(f)) return true;
    return false;
  };

  const ownStateCount = (file: string): number => otherFamilyCountByFile.get(file) ?? 0;

  // OLA V (frente V5) — `calls` que SALEN de un símbolo de cada archivo, SIN
  // filtro de confianza y SIN excluir las intra-archivo. Es la contraparte
  // deliberada de `callsToFilesByFromFile` (que sí filtra y sí exige destino
  // colaborador): acá la pregunta es sólo "¿este archivo invoca algo?".
  const outgoingCallsByFile = new Map<string, number>();
  for (const e of graph.edges) {
    if (e.kind !== "calls") continue;
    const from = nodeById.get(e.from);
    if (!from || from.kind !== "symbol") continue;
    outgoingCallsByFile.set(from.file, (outgoingCallsByFile.get(from.file) ?? 0) + 1);
  }
  const outgoingCallCount = (file: string): number => outgoingCallsByFile.get(file) ?? 0;

  const partialSiblingsOf = (file: string): readonly { file: string; overlap: readonly string[] }[] => {
    const mine = hubCollaboratorSets.get(file);
    if (!mine) return []; // no debería pasar: `required` ya exigió fan-out >= umbral para llegar hasta acá
    const candidates = new Set<string>();
    for (const c of mine) for (const hub of hubsByCollaborator.get(c) ?? []) if (hub !== file) candidates.add(hub);
    const result: { file: string; overlap: readonly string[] }[] = [];
    for (const other of candidates) {
      const theirs = hubCollaboratorSets.get(other);
      if (!theirs) continue;
      const overlap = [...mine].filter((c) => theirs.has(c));
      if (overlap.length === 0) continue;
      const mineCoversTheirs = [...theirs].every((c) => mine.has(c));
      const theirsCoversMine = [...mine].every((c) => theirs.has(c));
      if (mineCoversTheirs || theirsCoversMine) continue; // uno cubre al otro entero: no es "ninguno cubriéndolo entero"
      result.push({ file: other, overlap });
    }
    return result;
  };

  // OLA AD (frente AD4) — las aristas `calls` símbolo→símbolo CRUDAS (ambiguas
  // incluidas), agrupadas por archivo en las dos direcciones. Ver el docstring
  // de `rawCalleeFilesOf` para la medición que obliga a no pasar por
  // `projectGraph`. Una sola pasada O(E), cacheada con el resto de la vista.
  const rawCalleeByFile = new Map<string, Set<string>>();
  const rawCallerByFile = new Map<string, Set<string>>();
  for (const e of graph.edges) {
    if (e.kind !== "calls") continue;
    const from = nodeById.get(e.from);
    const to = nodeById.get(e.to);
    if (!from || !to || from.kind !== "symbol" || to.kind !== "symbol" || from.file === to.file) continue;
    let out = rawCalleeByFile.get(from.file);
    if (!out) {
      out = new Set();
      rawCalleeByFile.set(from.file, out);
    }
    out.add(to.file);
    let inbound = rawCallerByFile.get(to.file);
    if (!inbound) {
      inbound = new Set();
      rawCallerByFile.set(to.file, inbound);
    }
    inbound.add(from.file);
  }
  const EMPTY: ReadonlySet<string> = new Set();
  const rawCalleeFilesOf = (file: string): ReadonlySet<string> => rawCalleeByFile.get(file) ?? EMPTY;
  const rawCallerFilesOf = (file: string): ReadonlySet<string> => rawCallerByFile.get(file) ?? EMPTY;

  const coverageOfPieces = (pieces: readonly string[]): readonly { file: string; covers: number; fanIn: number }[] => {
    const counts = new Map<string, number>();
    for (const piece of new Set(pieces)) {
      for (const caller of rawCallerFilesOf(piece)) counts.set(caller, (counts.get(caller) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([file, covers]) => ({ file, covers, fanIn: rawCallerFilesOf(file).size }))
      .sort((a, b) => b.covers - a.covers || b.fanIn - a.fanIn || (a.file < b.file ? -1 : 1));
  };

  const view: FacadeGraphView = {
    internalCollaboratorsOf,
    externalReferencersOf,
    clusteringOf,
    maxFanOut,
    bypassesOf,
    hasDelegatingCalls,
    ownStateCount,
    outgoingCallCount,
    partialSiblingsOf,
    rawCalleeFilesOf,
    rawCallerFilesOf,
    coverageOfPieces,
  };
  VIEW_CACHE.set(graph, view);
  return view;
}

const fanOutAboveThreshold: Check<FacadeProblem, FacadeGraphView> = {
  id: "fanout-above-threshold",
  describe: `Fan-out interno >= ${FACADE_MIN_COLLABORATORS} colaboradores distintos.`,
  run(problem, view) {
    const collaborators = view.internalCollaboratorsOf(problem.file);
    return {
      holds: collaborators.length >= FACADE_MIN_COLLABORATORS,
      evidence:
        collaborators.length > 0
          ? `${collaborators.length} colaboradores internos: ${collaborators.join(", ")}.`
          : "Sin colaboradores internos (fan-out cero en la proyección de archivo).",
    };
  },
};

const hasExternalFanIn: Check<FacadeProblem, FacadeGraphView> = {
  id: "has-external-fanin",
  describe: "Al menos un archivo externo a los colaboradores referencia a este candidato.",
  run(problem, view) {
    const referencers = view.externalReferencersOf(problem.file);
    return {
      holds: referencers.length >= 1,
      evidence: referencers.length > 0 ? `Referenciado por: ${referencers.join(", ")}.` : "Ningún archivo externo referencia a este candidato.",
    };
  },
};

/**
 * OLA V (frente V5) — EL `required` DE INTENCIÓN de esta hipótesis; ver la
 * sección "OLA V" del docstring del módulo para los casos que lo motivan y
 * para la medición que descartó la versión ingenua de este mismo chequeo.
 *
 * QUÉ INTENCIÓN VERIFICA: que este archivo HAGA algún trabajo. Facade no
 * resuelve "muchos archivos juntos" — resuelve "el cliente tiene que
 * coordinar a varios colaboradores para hacer UNA tarea", y la fachada
 * existe para hacer esa tarea en su lugar. Un archivo que no INVOCA nada —
 * ni una sola llamada en todo su cuerpo — no hace ninguna tarea: todo lo que
 * contiene es el NOMBRE de otros archivos (`require`/`import`, barrel de
 * re-exportación, lista de literales de clase). No hay coordinación que
 * simplificar, ni fachada de facto que pueda estar siendo eludida.
 *
 * POR QUÉ CUENTA LLAMADAS CRUDAS Y NO `hasDelegatingCalls`. La versión
 * ingenua de este `required` era "¿tiene una arista `calls` CONFIDENTE hacia
 * un colaborador?" (o sea, `hasDelegatingCalls`, el chequeo que ya vivía en
 * el excluder). MEDIDO sobre `corpus/newtonsoft-json` con
 * `scripts/v5-delegacion-cruda.mts`: `Serialization/
 * JsonSerializerInternalReader.cs` declara 54 miembros `function-like` y
 * emite 321 aristas `calls`, de las cuales 184 cruzan de archivo — y las
 * **184 son `provenance: "ambiguous"`**, así que `confidentEdges` las
 * descarta todas y `hasDelegatingCalls` da `false` para un archivo que
 * evidentemente delega. Eso NO es un manifiesto: es un hueco de resolución
 * del grafo en C#. La pregunta robusta a ese hueco es la otra: **¿el archivo
 * invoca ALGO?** — las ambiguas cuentan, las intra-archivo cuentan, porque
 * la existencia de la llamada es un hecho del CÓDIGO y sólo su DESTINO es lo
 * que el resolutor no supo fijar.
 *
 * Contraste medido, mismos scripts, los cuatro archivos:
 *   - `rubocop/lib/rubocop.rb`: 0 símbolos `function-like`, **0 aristas
 *     `calls` de cualquier tipo**, 108 referencias no-`calls` a otros
 *     archivos. Manifiesto. ⇒ gateado.
 *   - `rubocop/lib/rubocop/cop/internal_affairs.rb`: 0 símbolos, **0
 *     `calls`**, 39 referencias. Manifiesto. ⇒ gateado.
 *   - `guava/guava-testlib/src/com/google/common/collect/testing/
 *     AbstractCollectionTestSuiteBuilder.java`: 1 símbolo `function-like`
 *     (`getTesters`), **0 `calls`**, 66 referencias — el cuerpo devuelve una
 *     lista de literales `.class`, no llama a nadie. ⇒ gateado.
 *   - `newtonsoft-json/.../JsonSerializerInternalReader.cs` y
 *     `.../JsonSerializerInternalWriter.cs`: 321/224 `calls`. ⇒ NO gateados.
 *
 * Polaridad: evidencia POSITIVA de que el archivo invoca algo, o no hay
 * candidata.
 */
const emiteTrabajoPropio: Check<FacadeProblem, FacadeGraphView> = {
  id: "invoca-en-vez-de-solo-nombrar",
  describe:
    "El archivo candidato emite al menos UNA llamada propia (arista `calls` saliente de alguno de sus símbolos, contando también las ambiguas y las intra-archivo): hace trabajo, en vez de sólo NOMBRAR a otros archivos. Un manifiesto de `require`/`import`, un barrel de re-exportación o un método que devuelve una lista de literales no coordinan nada: no hay fachada que formalizar ni que eludir.",
  run(problem, view) {
    const calls = view.outgoingCallCount(problem.file);
    return {
      holds: calls > 0,
      evidence:
        calls > 0
          ? `${calls} llamada(s) salen de los símbolos de este archivo: invoca trabajo, no sólo nombra colaboradores.`
          : "CERO llamadas salen de los símbolos de este archivo (contando ambiguas e intra-archivo): sólo NOMBRA a sus colaboradores — manifiesto de imports, barrel de re-exportación o enumeración de literales, no una fachada a la que le falte algo.",
    };
  },
};

const lowNeighborClustering: Check<FacadeProblem, FacadeGraphView> = {
  id: "low-neighbor-clustering",
  describe: `Coeficiente de agrupamiento del candidato <= ${LOW_CLUSTERING_THRESHOLD} (sus colaboradores casi no se conocen entre sí — la firma de Mediator, no de un subsistema ya cohesivo).`,
  run(problem, view) {
    const c = view.clusteringOf(problem.file);
    return { holds: c <= LOW_CLUSTERING_THRESHOLD, evidence: `Coeficiente de agrupamiento: ${c.toFixed(2)}.` };
  },
};

const fanOutIsRepoMax: Check<FacadeProblem, FacadeGraphView> = {
  id: "fanout-is-repo-max",
  describe: "El fan-out de este candidato es el más alto (o empata el más alto) del repositorio.",
  run(problem, view) {
    const mine = view.internalCollaboratorsOf(problem.file).length;
    return { holds: mine >= view.maxFanOut, evidence: `Fan-out ${mine} vs. máximo del repo ${view.maxFanOut}.` };
  },
};

/**
 * Ola 11a (P5, registro de pendientes — "1 de 17 lee ctx.neighborhood"):
 * `ctx.neighborhood.ego(ancla, 1)` da el degreeIn/degreeOut REALES del nodo
 * (aristas `ambiguous` ya excluidas) — una medición INDEPENDIENTE del
 * fan-out/fan-in que `FacadeGraphView` computa vía `projectGraph` (proyección
 * a grano archivo, sólo los `edgeKinds` de PageRank). `ego` en cambio mira
 * TODAS las aristas incidentes al nodo-archivo en el grafo crudo (incluidas
 * `contains`/`calls` hacia sus propios símbolos) — por eso NO reemplaza la
 * medición existente (declarado, no escondido: un archivo con muchos
 * símbolos propios va a tener `ego` alto aunque no coordine ningún
 * colaborador externo), pero SÍ sirve para respaldar o desmentir un
 * `aplicado-eludido` con una segunda fuente de verdad, independiente del
 * cálculo de `bypassesOf`. Encargo de la ola: usarlo para los 20
 * `aplicado-eludido` (19 en guava, sin corpus acá — se declara en el `why`
 * de cada caso, verificable sobre `tests/fixtures/patterns/facade`).
 */
function egoDegreeNote(ctx: HypothesisContext, file: string): string {
  const anchor: Anchor = { file, symbolPath: [] };
  const ego = ctx.neighborhood.ego(anchor, 1);
  if (!ego) {
    return " Vecindario (ctx.neighborhood.ego): sin nodo de grafo para este archivo — no se puede respaldar ni desmentir desde ahí.";
  }
  const total = ego.degreeIn + ego.degreeOut;
  return total >= FACADE_MIN_COLLABORATORS
    ? ` Vecindario (ctx.neighborhood.ego, 1 salto, aristas ambiguas ya excluidas): degreeIn=${ego.degreeIn}, degreeOut=${ego.degreeOut} — RESPALDA, desde una medición independiente de grafo crudo, que este archivo es un hub real.`
    : ` Vecindario (ctx.neighborhood.ego, 1 salto, aristas ambiguas ya excluidas): degreeIn=${ego.degreeIn}, degreeOut=${ego.degreeOut} — bajo el piso de ${FACADE_MIN_COLLABORATORS}; DESMIENTE, desde una medición independiente, que sea un hub tan central como sugiere la proyección de archivo (declarado: esta cuenta incluye TODAS las aristas incidentes, no sólo las de PageRank — ver docstring).`;
}

/**
 * `ctx.neighborhood.ego(ancla, 1)` como DISCRIMINADOR — el mismo dato de
 * arriba, pero como peldaño de la escalera cuando el estado sigue siendo una
 * oportunidad (`ausente`/`parcial`): un hub confirmado también desde el
 * grafo crudo (no sólo la proyección de archivo) es una señal más fuerte de
 * que de verdad hace falta una fachada acá.
 */
function egoConfirmsHubCheck(ctx: HypothesisContext): Check<FacadeProblem, FacadeGraphView> {
  return {
    id: "ego-confirma-hub",
    describe: `ctx.neighborhood.ego(1 salto): degreeIn+degreeOut REALES (aristas ambiguas ya excluidas) también >= ${FACADE_MIN_COLLABORATORS} — refuerzo cruzado, independiente de la proyección de archivo.`,
    run(problem) {
      const anchor: Anchor = { file: problem.file, symbolPath: [] };
      const ego = ctx.neighborhood.ego(anchor, 1);
      if (!ego) {
        return { holds: false, evidence: `Sin nodo de grafo para "${problem.file}" en ctx.neighborhood: ego no disponible, no evaluado.` };
      }
      const total = ego.degreeIn + ego.degreeOut;
      return {
        holds: total >= FACADE_MIN_COLLABORATORS,
        evidence: `ego(1 salto) real: degreeIn=${ego.degreeIn}, degreeOut=${ego.degreeOut} (aristas ambiguas ya excluidas).`,
      };
    },
  };
}

/**
 * EL EXCLUDER FUSIONADO — Ola 10 (CONTRATO-F10.md), las tres formas. Ver
 * "OLA 10" en el docstring del módulo para el razonamiento completo. Orden
 * de la escalera, deliberado:
 *
 *   1. `bypasses` — SIN CAMBIOS respecto de F6/P4, calibrado contra el
 *      corpus (guava 19/27). Si hay fuga, `aplicado-eludido`, punto: nunca
 *      se re-evalúa contra las señales nuevas de abajo (ver "SESGO DE DISEÑO
 *      DELIBERADO"). Ola 11a: el `why` agrega la nota de `ego` (ver arriba)
 *      para respaldar o desmentir el caso desde el vecindario — NUNCA cambia
 *      el estado, sólo lo declara.
 *   2. Sin fuga: `hasDelegatingCalls` + `ownStateWithinBudget` (COMPLETA,
 *      §0 del módulo) ⇒ `ya-aplicado`. Información positiva, nunca sugiere
 *      (regla 1 de la tarea).
 *   3. Ninguna de las dos: `partialSiblingsOf` (PARCIAL, varias fachadas
 *      incompletas sobre el mismo subsistema) ⇒ `parcial`, que SÍ compite en
 *      el ranking (es una oportunidad real: formalizar).
 *   4. Nada de lo anterior ⇒ `ausente`, la lectura de hoy.
 */
function appliedState(problem: FacadeProblem, view: FacadeGraphView, ctx: HypothesisContext): AppliedStateResult {
  const bypasses = view.bypassesOf(problem.file);
  const hasBypass = bypasses.length > 0;
  const bypassCheck: PatternHypothesisCheck = {
    label: "Algún cliente externo referencia un colaborador interno DIRECTAMENTE, sin pasar por este candidato.",
    passed: hasBypass,
    why:
      (hasBypass
        ? `${bypasses.length} fuga(s): ${bypasses.map((b) => `${b.external}→${b.internal}`).join(", ")}.`
        : "Ningún cliente externo detectado referenciando un colaborador interno directamente.") + egoDegreeNote(ctx, problem.file),
    role: "applied",
  };
  if (hasBypass) return { state: "aplicado-eludido", checks: [bypassCheck] };

  const collaboratorsCount = view.internalCollaboratorsOf(problem.file).length;
  const delegates = view.hasDelegatingCalls(problem.file);
  const ownCount = view.ownStateCount(problem.file);
  const boundedOwnState = ownCount <= collaboratorsCount;

  // OLA V (frente V5): este check quedó VACUO — `delegatesToCollaborators` ya
  // lo exige como `required`, así que acá siempre pasa. Se deja porque es el
  // rastro de evidencia que explica por qué el caso llegó a este estado, y
  // porque borrarlo escondería la pregunta. Declarado, no oculto.
  const delegatesCheck: PatternHypothesisCheck = {
    label: "Al menos un miembro de este candidato tiene `calls` confidente hacia un símbolo de uno de sus colaboradores (delegación real, no sólo mención/import).",
    passed: delegates,
    why: delegates
      ? "Al menos una llamada `calls` símbolo→símbolo desde este archivo hacia uno de sus colaboradores internos."
      : "Ninguna arista `calls` confidente desde un símbolo de este archivo hacia un símbolo de sus colaboradores — sin evidencia de delegación (podría ser un agregador de imports, no un Facade activo).",
    role: "applied",
  };
  const ownStateCheck: PatternHypothesisCheck = {
    label: `No declara más miembros propios "other" (campo/constante de nivel clase) que colaboradores tiene — aproximación declarada, sin ranura tipada (CONTRATO-F10.md §0.4).`,
    passed: boundedOwnState,
    why:
      `${ownCount} miembro(s) propio(s) "other" vs. ${collaboratorsCount} colaborador(es) interno(s).` +
      (boundedOwnState ? "" : " Más estado propio que colaboradores: más compatible con un God Object detrás de una fachada superficial que con un Facade limpio."),
    role: "applied",
  };

  if (delegates && boundedOwnState) {
    return { state: "ya-aplicado", checks: [bypassCheck, delegatesCheck, ownStateCheck] };
  }

  const siblings = view.partialSiblingsOf(problem.file);
  const hasPartialSiblings = siblings.length > 0;
  const partialCheck: PatternHypothesisCheck = {
    label: "Otro archivo, distinto de este candidato, también concentra fan-out >= umbral hacia colaboradores del mismo subsistema (intersección no vacía, ninguno lo cubre entero) — varias fachadas parciales, ninguna puerta única.",
    passed: hasPartialSiblings,
    why: hasPartialSiblings
      ? `${siblings.length} archivo(s) hermano(s): ${siblings.map((s) => `${s.file} (solapa en ${s.overlap.join(", ")})`).join("; ")}.`
      : "Ningún otro archivo concentra un subconjunto solapado del mismo subsistema con fan-out >= umbral.",
    role: "applied",
  };
  const state: PatternState = hasPartialSiblings ? "parcial" : "ausente";
  return { state, checks: [bypassCheck, delegatesCheck, ownStateCheck, partialCheck] };
}

const FACADE_SOURCE = "https://refactoring.guru/es/design-patterns/facade";

/* ────────────────────────────────────────────────────────────────────────
 * OLA AD (frente AD4) — EL CAMINO DE ENTRADA DEL ANCLA-FUERZA
 * `repeated-collaborator-set`.
 *
 * POR QUÉ HACE FALTA UN CAMINO PROPIO Y NO ALCANZA CON AGREGAR EL ANCLA AL
 * ARRAY. Las dos anclas viejas (`fanout-without-cohesion`, `god-component`)
 * apuntan a UN ARCHIVO CANDIDATO A FACHADA: el `Finding` dice "acá hay un hub",
 * y `problem.locations[0].file` ES la fachada de facto que se está evaluando.
 * El ancla nueva apunta a lo contrario: un GRUPO de clientes y un SUBSISTEMA,
 * y el archivo que sería la fachada NO EXISTE — eso es exactamente lo que se
 * está diciendo. No hay `file` candidato que pasarle a `fanOutAboveThreshold`,
 * así que el problema, los `required`, los discriminadores y la escalera de
 * estado son otros. Mismo reparto que `hypotheses/template-method.ts
 * #buildFromSequenceAnchor` estableció en la Ola AC.
 *
 * LO QUE ESTE CAMINO **NO** CAMBIA: ni un `required`, ni un discriminador, ni
 * una rama de `appliedState` del camino viejo. Las dos anclas viejas siguen
 * emitiendo exactamente lo mismo que emitían — esta ola es ADITIVA.
 *
 * `ya-aplicado` ES INALCANZABLE DESDE ACÁ, Y HAY QUE DECIRLO EN VOZ ALTA, con
 * el mismo criterio con el que AC3 lo dijo de su propia ancla: el detector
 * exige que CADA lugar invoque las piezas ÉL MISMO, y "el patrón ya está
 * aplicado" significa que los clientes pasan por una puerta en vez de invocar
 * las piezas. Son incompatibles por construcción. Que este camino no produzca
 * `ya-aplicado` NO es mérito suyo, y no se puede leer como "evitó la trampa":
 * lo que sí es mérito, y sí se mide, es que el propio detector se CALLA cuando
 * ya existe un archivo que coordina el subsistema entero (su condición (5)).
 * ──────────────────────────────────────────────────────────────────────── */

/** El problema tal como lo ve el camino del ancla nueva: dónde vive la
 *  coordinación repetida, y sobre qué piezas. */
interface RepeatedSetProblem {
  /** Archivos donde vive la coordinación repetida (los que el ancla marcó con `ROLE_REPEATS`). */
  readonly callerFiles: readonly string[];
  /** Archivos del subsistema que cada uno de ellos coordina (los marcados con `ROLE_PIECE`). */
  readonly pieceFiles: readonly string[];
}

/**
 * REQUIRED 1 — LA COORDINACIÓN ESTÁ DEL LADO DEL CLIENTE, CONFIRMADO POR UNA
 * SEGUNDA MEDICIÓN.
 *
 * QUÉ INTENCIÓN VERIFICA: *"cada lugar que repite alcanza el subsistema ENTERO
 * por su cuenta"*. Es la mitad de la trampa que se puede contestar acá: si los
 * clientes pasaran por una puerta, cada uno invocaría UN archivo, no todos.
 *
 * POR QUÉ LO PREGUNTA A GRANO ARCHIVO Y CON LAS ARISTAS CRUDAS, Y NO SOBRE LA
 * PROYECCIÓN QUE USA EL RESTO DE ESTE MÓDULO — es un hecho medido y hay que
 * dejarlo escrito: la primera versión de este check usaba
 * `internalCollaboratorsOf`, y **sobre el corpus entero dejó pasar UNA sola
 * hipótesis de 72 hallazgos**. La causa no es el código del ancla: es que
 * `projectGraph` descarta por contrato las aristas `provenance: "ambiguous"`
 * (`CONTRATO-F9.md` §4.5), y este ancla vive sobre ellas (sin las ambiguas
 * emite CERO en los 16 repos). La proyección **no puede** ver ninguna de las
 * coordinaciones que el ancla encuentra, así que un `required` apoyado en ella
 * es `false` por construcción, no por evidencia. Se usa `rawCalleeFilesOf`
 * (ver su docstring), con el mismo argumento que este módulo ya escribió para
 * `outgoingCallCount`.
 *
 * Sigue siendo una comprobación con contenido y no un sello: se pregunta a
 * grano ARCHIVO (el ancla decidió a grano SÍMBOLO) y sobre el conjunto de
 * archivos que el ancla afirmó, así que un hallazgo cuyas ubicaciones no se
 * correspondan con el grafo NO pasa. Si no lo confirma, la candidata no
 * existe: `holds: false`, nunca "no se pudo mirar, apruebo".
 */
const coordinacionDelLadoDelCliente: Check<RepeatedSetProblem, FacadeGraphView> = {
  id: "coordinacion-del-lado-del-cliente",
  describe:
    "Cada archivo donde vive la coordinación repetida INVOCA, por sí mismo, TODAS las piezas del subsistema (aristas `calls` crudas, ambiguas incluidas — ver `rawCalleeFilesOf`). Si pasaran por una puerta invocarían una sola.",
  run(problem, view) {
    const faltantes: string[] = [];
    for (const caller of problem.callerFiles) {
      const alcanza = view.rawCalleeFilesOf(caller);
      const sinAlcanzar = problem.pieceFiles.filter((p) => !alcanza.has(p));
      if (sinAlcanzar.length > 0) faltantes.push(`${caller} (le faltan ${sinAlcanzar.length}: ${sinAlcanzar.join(", ")})`);
    }
    return {
      holds: faltantes.length === 0 && problem.callerFiles.length > 0,
      evidence:
        faltantes.length === 0
          ? `Los ${problem.callerFiles.length} archivos que repiten INVOCAN cada uno las ${problem.pieceFiles.length} piezas: ${problem.callerFiles.join(", ")}.`
          : `${faltantes.length} de ${problem.callerFiles.length} archivos NO invocan todas las piezas: ${faltantes.join("; ")}.`,
    };
  },
};

/**
 * REQUIRED 2 — HAY UN SUBSISTEMA, NO UNA PIEZA.
 *
 * QUÉ INTENCIÓN VERIFICA: *"lo que habría detrás de la puerta es un
 * SUBSISTEMA"*. Mismo `FACADE_MIN_COLLABORATORS` que el camino viejo exige al
 * fan-out del candidato; acá se le exige al tamaño del subsistema coordinado.
 * Es la condición de ESCALA: sin ella el ancla dispararía sobre cualquier cosa
 * que llame a dos funciones, que es el error que la Ola AC midió.
 */
const subsistemaConTamano: Check<RepeatedSetProblem, FacadeGraphView> = {
  id: "subsistema-con-tamano",
  describe: `El subsistema coordinado tiene >= ${FACADE_MIN_COLLABORATORS} archivos distintos — una puerta delante de menos que eso es un Proxy/Adapter, no un Facade.`,
  run(problem) {
    return {
      holds: problem.pieceFiles.length >= FACADE_MIN_COLLABORATORS,
      evidence: `${problem.pieceFiles.length} archivo(s) del subsistema: ${problem.pieceFiles.join(", ")}.`,
    };
  },
};

/**
 * REQUIRED 3 — LA REPETICIÓN CRUZA EL ARCHIVO.
 *
 * QUÉ INTENCIÓN VERIFICA: *"la puerta es la mitigación más barata"*. Con toda
 * la repetición dentro de un solo archivo, una función privada de ese archivo
 * la borra sin crear nada: proponer un módulo nuevo sería peor que el problema.
 */
const repeticionCruzaElArchivo: Check<RepeatedSetProblem, FacadeGraphView> = {
  id: "repeticion-cruza-el-archivo",
  describe: "La coordinación repetida vive en al menos DOS archivos distintos; dentro de uno solo la mitigación barata es una función privada, no una fachada.",
  run(problem) {
    return {
      holds: problem.callerFiles.length >= 2,
      evidence: `${problem.callerFiles.length} archivo(s) repiten la coordinación: ${problem.callerFiles.join(", ")}.`,
    };
  },
};

/**
 * DISCRIMINADOR — la repetición cruza TRES archivos o más. Más lugares que
 * repiten es más trabajo que la puerta ahorra; con dos, el caso es real pero
 * está en el borde de lo que paga.
 */
const repeticionEnTresOMas: Check<RepeatedSetProblem, FacadeGraphView> = {
  id: "repeticion-en-tres-o-mas",
  describe: "La coordinación repetida vive en TRES archivos distintos o más.",
  run(problem) {
    return { holds: problem.callerFiles.length >= 3, evidence: `${problem.callerFiles.length} archivo(s) distintos repiten la coordinación.` };
  },
};

/**
 * DISCRIMINADOR — el subsistema no depende de vuelta de sus clientes. Cuando
 * ninguna pieza referencia a un archivo que repite, la frontera donde iría la
 * puerta está limpia y la fachada es dibujable; si el subsistema llama de
 * vuelta a sus clientes, la frontera está mezclada y la mitigación probablemente
 * sea otra (invertir la dependencia antes que tapar).
 */
const fronteraLimpia: Check<RepeatedSetProblem, FacadeGraphView> = {
  id: "frontera-limpia",
  describe: "Ninguna pieza del subsistema referencia de vuelta a un archivo donde vive la coordinación repetida.",
  run(problem, view) {
    const callers = new Set(problem.callerFiles);
    const vueltas: string[] = [];
    for (const piece of problem.pieceFiles) {
      for (const target of view.rawCalleeFilesOf(piece)) if (callers.has(target)) vueltas.push(`${piece}→${target}`);
    }
    return {
      holds: vueltas.length === 0,
      evidence: vueltas.length === 0 ? "Ninguna pieza referencia de vuelta a un archivo que repite." : `${vueltas.length} dependencia(s) de vuelta: ${vueltas.slice(0, 6).join(", ")}.`,
    };
  },
};

/**
 * LA ESCALERA DE ESTADO DEL CAMINO NUEVO. El ancla ya garantizó que NINGÚN
 * archivo coordina el subsistema ENTERO estando referenciado por >= 2 archivos
 * (su condición (5)); lo que esta escalera decide es cuánto de la puerta
 * existe igual:
 *
 *   1. Un archivo cubre TODAS las piezas y al menos uno de los que repiten lo
 *      referencia ⇒ `aplicado-eludido`: la puerta existe y la puentean. (Es
 *      alcanzable pese a la condición (5) del ancla: ésa exige además que la
 *      puerta esté referenciada por >= 2 archivos, y acá basta con uno.)
 *   2. Un archivo cubre MÁS DE LA MITAD de las piezas (pero no todas) y está
 *      referenciado por >= 2 archivos ⇒ `parcial`: hay media puerta; la
 *      mitigación es completarla o consolidarla, no inventar otra.
 *   3. Nada de eso ⇒ `ausente`: la puerta no existe ni a medias.
 *
 * `ya-aplicado` no aparece, y no puede: ver el comentario de bloque de arriba.
 */
function repeatedSetAppliedState(problem: RepeatedSetProblem, view: FacadeGraphView): AppliedStateResult {
  const callers = new Set(problem.callerFiles);
  const pieces = new Set(problem.pieceFiles);
  const cobertura = view.coverageOfPieces(problem.pieceFiles).filter((c) => !callers.has(c.file) && !pieces.has(c.file));

  const completa = cobertura.find((c) => c.covers === problem.pieceFiles.length);
  const puenteada = completa ? problem.callerFiles.filter((f) => view.rawCalleeFilesOf(f).has(completa.file)) : [];
  const puertaCompletaCheck: PatternHypothesisCheck = {
    label: "Ya existe un archivo, ajeno al grupo, que alcanza TODAS las piezas del subsistema (una puerta completa).",
    passed: completa !== undefined,
    why: completa
      ? `"${completa.file}" alcanza las ${problem.pieceFiles.length} piezas y lo referencian ${completa.fanIn} archivo(s).`
      : `Ningún archivo ajeno al grupo alcanza las ${problem.pieceFiles.length} piezas; la mejor cobertura ajena es ${cobertura[0]?.covers ?? 0}.`,
    role: "applied",
  };
  if (completa && puenteada.length > 0) {
    return {
      state: "aplicado-eludido",
      checks: [
        puertaCompletaCheck,
        {
          label: "Al menos uno de los archivos que repiten la coordinación TAMBIÉN referencia esa puerta: la tiene a mano y la puentea.",
          passed: true,
          why: `${puenteada.length} de ${problem.callerFiles.length} la referencian y aun así invocan las piezas por su cuenta: ${puenteada.join(", ")}.`,
          role: "applied",
        },
      ],
    };
  }

  // MÁS DE LA MITAD, y el número tiene su historia medida: la primera versión de
  // este peldaño pedía ">= 2 piezas", y sobre el corpus entero eso resultó VACUO —
  // el 100 % de la población caía en `parcial`, porque en un repo grande siempre
  // hay algún archivo que toca dos piezas cualesquiera y tiene dos clientes. Un
  // peldaño que contesta siempre lo mismo no informa nada, que es exactamente el
  // defecto que este frente le midió a las dos anclas viejas de Facade (84,7 % de
  // su producto es `aplicado-eludido`). "Más de la mitad" es un piso de FORMA — la
  // lectura mínima de "ya cubre buena parte del subsistema" —, no una magnitud
  // calibrada. **No cambia CUÁNTAS recomendaciones se emiten: `ausente` y `parcial`
  // son las dos recomendaciones, así que esto sólo decide cuál de las dos etiquetas
  // honestas se muestra.**
  const parcial = cobertura.find((c) => c.covers * 2 > problem.pieceFiles.length && c.covers < problem.pieceFiles.length && c.fanIn >= 2);
  const mediaPuertaCheck: PatternHypothesisCheck = {
    label: "Existe un archivo, ajeno al grupo, que ya concentra MÁS DE LA MITAD del subsistema y que ya tiene clientes.",
    passed: parcial !== undefined,
    why: parcial
      ? `"${parcial.file}" alcanza ${parcial.covers} de ${problem.pieceFiles.length} piezas y lo referencian ${parcial.fanIn} archivo(s): media puerta, sin cubrir el subsistema.`
      : `Ningún archivo ajeno al grupo concentra más de la mitad de las ${problem.pieceFiles.length} piezas con clientes propios (la mejor cobertura ajena es ${cobertura[0]?.covers ?? 0}): no hay media puerta que completar.`,
    role: "applied",
  };
  return { state: parcial ? "parcial" : "ausente", checks: [puertaCompletaCheck, mediaPuertaCheck] };
}

const REPEATED_SET_TO_CONFIRM = [
  ...FACADE_TO_CONFIRM,
  "Ola AD — el ancla verifica el mismo CONJUNTO de pasos, no el mismo ORDEN: las aristas `calls` del grafo colapsan las ocurrencias y no llevan posición " +
    "(medido, ver el docstring de `detect/inter-file/repeated-collaborator-set.ts`). ¿Los N lugares ejecutan de verdad la misma secuencia, o el mismo conjunto " +
    "de llamadas en órdenes distintos? Si es lo segundo, comparten vocabulario, no una coordinación.",
];

function buildRepeatedSetSpec(): HypothesisSpec<RepeatedSetProblem, FacadeGraphView> {
  return {
    pattern: "Facade",
    ceiling: "media", // mismo techo que el camino viejo — ver "DECLARADO, NO OCULTO" en el docstring del módulo
    needs: [], // agnóstico de lenguaje: nada de esto necesita clases (la población más grande medida está en Go)
    required: [coordinacionDelLadoDelCliente, subsistemaConTamano, repeticionCruzaElArchivo],
    discriminators: [repeticionEnTresOMas, fronteraLimpia],
    appliedState: (problem, view) => repeatedSetAppliedState(problem, view),
    toConfirm: REPEATED_SET_TO_CONFIRM,
    source: FACADE_SOURCE,
  };
}

/**
 * Recupera del `Finding` del ancla nueva las dos mitades que este camino
 * necesita. El ancla marca cada `RoleLocation` con uno de los dos prefijos que
 * `repeated-collaborator-set.ts` EXPORTA (`ROLE_REPEATS`/`ROLE_PIECE`), así que
 * no hay un literal duplicado en dos archivos ni un formato que adivinar.
 */
function repeatedSetProblemOf(problem: Finding): RepeatedSetProblem | null {
  const callerFiles: string[] = [];
  const pieceFiles: string[] = [];
  for (const location of problem.locations) {
    if (location.role.startsWith(ROLE_REPEATS)) {
      if (!callerFiles.includes(location.file)) callerFiles.push(location.file);
    } else if (location.role.startsWith(ROLE_PIECE)) {
      if (!pieceFiles.includes(location.file)) pieceFiles.push(location.file);
    }
  }
  if (callerFiles.length === 0 || pieceFiles.length === 0) return null;
  return { callerFiles, pieceFiles };
}

/**
 * Ola 11a: fábrica (antes `const` estática) — `egoConfirmsHubCheck`/
 * `appliedState` necesitan cerrar sobre `ctx.neighborhood`, mismo patrón que
 * `strategy.ts#buildSpec`/`composite.ts#buildSpec`.
 */
function buildSpec(ctx: HypothesisContext): HypothesisSpec<FacadeProblem, FacadeGraphView> {
  return {
    pattern: "Facade",
    ceiling: "media", // ver "DECLARADO, NO OCULTO" en el docstring del módulo — por qué no "alta"
    needs: [], // agnóstico de lenguaje — ver "FORMA EN LENGUAJES SIN CLASES"
    required: [fanOutAboveThreshold, hasExternalFanIn, emiteTrabajoPropio],
    discriminators: [lowNeighborClustering, fanOutIsRepoMax, egoConfirmsHubCheck(ctx)],
    appliedState: (problem, view) => appliedState(problem, view, ctx),
    toConfirm: FACADE_TO_CONFIRM,
    source: FACADE_SOURCE,
  };
}

function fileSpan(repo: RepoUnit, path: string): { startLine: number; endLine: number } {
  const summary = repo.files.find((f) => f.path === path);
  return { startLine: 1, endLine: Math.max(1, summary?.lines ?? 1) };
}

/** `places` con rol — el rol EXACTO de `RoleLocation`'s propio ejemplo
 *  ("cliente que puentea la fachada") para cada fuga, cuando el estado es
 *  `aplicado-eludido`; Ola 10 agrega el rol análogo para `parcial` (los
 *  archivos hermanos que cubren un subconjunto solapado del subsistema). */
function placesFor(repo: RepoUnit, file: string, view: FacadeGraphView, state: PatternState): readonly RoleLocation[] {
  const hub = fileSpan(repo, file);
  const places: RoleLocation[] = [
    { file, startLine: hub.startLine, endLine: hub.endLine, role: "archivo candidato a fachada: fan-out interno alto, coordinado por clientes externos" },
  ];
  if (state === "aplicado-eludido") {
    const seenExternal = new Set<string>();
    const seenInternal = new Set<string>();
    for (const { external, internal } of view.bypassesOf(file)) {
      if (!seenExternal.has(external)) {
        seenExternal.add(external);
        const span = fileSpan(repo, external);
        places.push({ file: external, startLine: span.startLine, endLine: span.endLine, role: "cliente que puentea la fachada" });
      }
      if (!seenInternal.has(internal)) {
        seenInternal.add(internal);
        const span = fileSpan(repo, internal);
        places.push({ file: internal, startLine: span.startLine, endLine: span.endLine, role: "colaborador interno alcanzado directamente, sin pasar por la fachada" });
      }
    }
    return places;
  }
  if (state === "parcial") {
    for (const sibling of view.partialSiblingsOf(file)) {
      const span = fileSpan(repo, sibling.file);
      places.push({
        file: sibling.file,
        startLine: span.startLine,
        endLine: span.endLine,
        role: `otra fachada parcial: cubre un subconjunto solapado del mismo subsistema (${sibling.overlap.join(", ")}), sin puerta única`,
      });
    }
    return places;
  }
  return places;
}


/* ────────────────────────────────────────────────────────────────────────
 * OLA AN (frente AN3) — EL CANAL DE LA CAPA DE REFACTORIZACIÓN: **MEDIDO,
 * CONSTRUIDO Y RETIRADO.** Lo que queda en producción es la TRAZA (costo cero
 * apagada) y este bloque, para que la próxima ola no vuelva a pagarlo.
 *
 * LA PREGUNTA DE LA OLA: si el hecho *"acá aplica esta refactorización"*
 * (nivel 2) es un ANCLA mejor que el smell crudo (nivel 1) para descubrir
 * dónde FALTA un patrón (nivel 3).
 *
 * EL MECANISMO EXISTE Y LLEGA VIVO — verificado en producción, no supuesto.
 * `code-analyzer.ts` construye `rawFindings = [...perFileFindings,
 * ...interFile.findings]` y con ESO llama a `buildNeighborhoodIndex`, así que
 * el índice CONTIENE los hallazgos de nivel 2; y las tres anclas de esta
 * hipótesis son `inter-file`, así que se evalúa en la llamada (2), donde
 * `ctx.neighborhood` ya es el índice REAL. **Medido sobre los 21 repos:
 * `vecindarioVivo` = 13.191 de 13.191 entradas de traza.** Además el costo de
 * reparseo de anclar en nivel 2 es CERO: `findingsNeedingGraphPass` deriva los
 * archivos del REGISTRO y `long-function` ya es ancla de `extract-method.ts` y
 * `complexity` de `chain-of-responsibility.ts` (nest 223 → 223, cobra 10 → 10,
 * preact 24 → 24).
 *
 * LA BRECHA ERA REAL: los dos `required` de escala piden 4 colaboradores
 * (`FACADE_MIN_COLLABORATORS`), y el ancla `fanout-without-cohesion` exige
 * **20** (`MIN_FAN_OUT_SPEC`, `detect/inter-file/fanout-without-cohesion.ts`)
 * — cinco veces el piso de la propia hipótesis. Se construyó el camino que la
 * cubre: ancla en `long-function`/`complexity`, calla donde alguna de las tres
 * anclas viejas ya habla, una sola propuesta por archivo, y el MISMO
 * `appliedState` de siempre.
 *
 * POR QUÉ SE RETIRÓ, CON EL NÚMERO: **emitió 688 propuestas nuevas (178 en
 * bibliotecas, 510 en aplicaciones) y el 100 % salió en el estado `parcial`
 * del camino de archivo — el que produce `partialSiblingsOf`, documentado más
 * abajo como "entre 30 y 239 hermanos por candidato en hugo".** Ese estado
 * mide **0 verdaderas de 36** en el banco existente, y las 27 que juzgó el
 * frente abriendo el archivo real dieron **0 de 27**: juntas **0 de 63,
 * [0,0 %, 5,7 %]**, contra el 10,8 % / 9,7 % que Facade mide hoy sobre sus
 * recomendaciones. Emitir mucho y acertar poco no es el encargo.
 *
 * EL RIESGO QUE ESTE FRENTE DEJA ESCRITO PARA QUIEN VUELVA A INTENTARLO, y no
 * es teórico: `engine.ts#arbitrateRivalHypotheses` DESCARTA una oportunidad
 * cuando otro patrón del mismo ancla CONFIRMÓ (`ya-aplicado`/
 * `aplicado-eludido`) y sus `places` SOLAPAN. El primer `place` de Facade es
 * el ARCHIVO ENTERO (`fileSpan`), así que solapa por construcción con la
 * función que `Extract Method` propone extraer. **Medido sobre los 21 repos:
 * el camino nuevo habría publicado 907 confirmaciones (332 en bibliotecas,
 * 575 en aplicaciones), y **431 de ellas caen sobre un hallazgo que carga una
 * oportunidad de otro patrón: las 431 son `Extract Method`**, la celda más
 * grande del catálogo, con verdaderas ya juzgadas. Anclar un
 * patrón de nivel 3 en un ancla de nivel 2 **no es gratis: lo vuelve capaz de
 * BORRAR la propuesta de nivel 2 sobre la que se apoya.** El camino sólo
 * publicaba oportunidades, nunca confirmaciones, justamente por eso.
 * ──────────────────────────────────────────────────────────────────────── */

/** Los tres `kind` de NIVEL 2 del catálogo (`Extract Method` × 2, `Value Object` × 1). Se cuentan los tres para la evidencia; sólo los dos de arriba anclan. */
const AN3_KINDS_DE_NIVEL_2: ReadonlySet<string> = new Set(["long-function", "complexity", "primitive-obsession"]);

/**
 * QUÉ INTENCIÓN VERIFICA: *"¿la capa de refactorización dijo algo sobre ESTE
 * archivo, y cuánto?"* Devuelve la cuenta y los `kind` distintos, contando
 * también al propio problema (que `findingsInFile` excluye por contrato).
 */
function an3Nivel2EnArchivo(ctx: HypothesisContext, file: string, problem: Finding): { readonly total: number; readonly kinds: readonly string[]; readonly truncado: boolean } {
  const vecinos = ctx.neighborhood.findingsInFile(file);
  const truncado = ctx.neighborhood.truncated("inFile");
  const kinds = new Set<string>();
  let total = 0;
  for (const f of vecinos) {
    if (!AN3_KINDS_DE_NIVEL_2.has(f.kind)) continue;
    total++;
    kinds.add(f.kind);
  }
  if (AN3_KINDS_DE_NIVEL_2.has(problem.kind)) {
    total++;
    kinds.add(problem.kind);
  }
  return { total, kinds: [...kinds].sort(), truncado };
}



/* ────────────────────────────────────────────────────────────────────────
 * LA TRAZA DEL EMBUDO DE FACADE — copia deliberada, en forma y en default, de
 * `state.ts#startStateTrace` (Ola AI) y `strategy.ts#startStrategyTrace` (Ola
 * AH). Es el pedido que el integrador de la Ola AH dejó escrito para este
 * archivo (§14.1: *"copiar esa traza a `proxy.ts`, `state.ts` y `facade.ts`"*).
 * `null` (el default de producción) ⇒ costo cero: ni una rama de más por
 * hallazgo. Se prende desde un script de medición y se apaga sola al leerla.
 * ──────────────────────────────────────────────────────────────────────── */
export interface FacadeTraceEntry {
  readonly findingId: string;
  readonly kind: string;
  readonly file: string;
  readonly line: number;
  /** `"archivo"` = las dos anclas de archivo; `"conjunto"` = `repeated-collaborator-set`; `"refactorizacion"` = el camino nuevo de la Ola AN. */
  readonly camino: string;
  /** LA PRUEBA DE QUE EL CANAL NO ESTÁ INERTE: `false` si `ctx.neighborhood` es `EMPTY_NEIGHBORHOOD`. */
  readonly vecindarioVivo: boolean;
  readonly conGrafo: boolean;
  readonly colaboradores: number;
  readonly fanInExterno: number;
  readonly nivel2Total: number;
  readonly nivel2Kinds: readonly string[];
  readonly nivel2Truncado: boolean;
  readonly caminoViejoYaHabla: boolean;
  readonly primeroDeSuArchivo: boolean;
  readonly emitted: boolean;
  readonly state: string | null;
}

let facadeTrace: FacadeTraceEntry[] | null = null;

export function startFacadeTrace(): void {
  facadeTrace = [];
}

export function takeFacadeTrace(): readonly FacadeTraceEntry[] {
  const t = facadeTrace ?? [];
  facadeTrace = null;
  return t;
}

function an3Registrar(entry: FacadeTraceEntry): void {
  facadeTrace?.push(entry);
}


/**
 * TRAZA del camino VIEJO — no decide nada, sólo registra. Es lo que permite
 * medir el DESCUENTO de la Ola AN (¿cuántas propuestas apagaría la regla
 * "el archivo tiene MÁS hallazgos de nivel 2 que colaboradores internos"?)
 * SIN tocar una sola compuerta. Costo cero con la traza apagada.
 */
function an3TrazarCaminoViejo(problem: Finding, ctx: HypothesisContext, view: FacadeGraphView, camino: string, state: string | null): void {
  if (!facadeTrace) return;
  const loc = problem.locations[0];
  if (!loc) return;
  const n2 = an3Nivel2EnArchivo(ctx, loc.file, problem);
  an3Registrar({
    findingId: problem.id,
    kind: problem.kind,
    file: loc.file,
    line: loc.startLine,
    camino,
    vecindarioVivo: ctx.neighborhood !== EMPTY_NEIGHBORHOOD,
    conGrafo: true,
    colaboradores: view.internalCollaboratorsOf(loc.file).length,
    fanInExterno: view.externalReferencersOf(loc.file).length,
    nivel2Total: n2.total,
    nivel2Kinds: n2.kinds,
    nivel2Truncado: n2.truncado,
    caminoViejoYaHabla: true,
    primeroDeSuArchivo: false,
    emitted: state !== null,
    state,
  });
}

/** Hipótesis "no-aplicable" por falta de grafo — ver "SIN GRAFO" en el docstring del módulo. */
function missingGraphHypothesis(anchorFindingId: string): PatternHypothesisDraft {
  return {
    pattern: "Facade",
    // Relleno: NUNCA se lee sin chequear `missingCapabilities` primero — ver
    // el docstring de `HypothesisContext`/`PatternHypothesis` en `types.ts`.
    state: "ausente",
    confidence: null,
    ceiling: "media",
    provisional: true,
    checks: [],
    discriminators: [],
    places: [],
    toConfirm: FACADE_TO_CONFIRM,
    cost: FACADE_COST,
    source: FACADE_SOURCE,
    missingCapabilities: [GRAPH_CAPABILITY],
    anchorFindingId,
  };
}

/**
 * EL CAMINO DE ARCHIVO ENTERO, **ANTES** DE LA COMPUERTA DE LA OLA AY (G1).
 *
 * Se separó de `build()` por una razón concreta y no por gusto: G1 apaga el estado `parcial`
 * de este camino (ver el comentario en `build`), y sin esta función los tests que cubren la
 * MÁQUINA DE ESTADOS del `parcial` —el `applied` que nombra al hermano solapado y el `role`
 * de `placesFor` para ese hermano— se quedarían sin sujeto y habría que borrarlos. Borrar la
 * aserción en vez de conservar la cobertura es exactamente lo que este proyecto tiene
 * prohibido. Así que el cálculo queda entero y verificable, y lo único que cambia es que
 * `build()` no lo publica cuando el estado es `parcial`.
 *
 * NO ES UN CAMINO DE PRODUCCIÓN ALTERNATIVO: `build()` es el único que llama acá con
 * intención de emitir, y aplica la compuerta sobre lo que devuelve.
 */
function evaluarCaminoDeArchivo(problem: Finding, graph: CodeGraph, ctx: HypothesisContext): PatternHypothesisDraft | null {
  const file = problem.locations[0].file;
  const view = buildFacadeGraphView(graph);
  const spec = buildSpec(ctx);
  const outcome = build(spec, ctx.capabilities, { file }, view);
  // OLA AN (AN3) — SÓLO TRAZA (costo cero apagada), ver el docstring de `an3TrazarCaminoViejo`.
  // `state` sigue siendo el que calcula la máquina de estados —eso es lo que la traza existe
  // para registrar—; quien quiera saber si además SE EMITIÓ tiene `emitted`, que `build()`
  // corrige más abajo cuando la compuerta de la Ola AY apaga el `parcial`.
  an3TrazarCaminoViejo(problem, ctx, view, "archivo", outcome ? outcome.state : null);
  if (!outcome) return null;

  return toPatternHypothesis(spec, outcome, {
    anchorFindingId: problem.id,
    places: placesFor(ctx.repo, file, view, outcome.state),
    cost: FACADE_COST,
    provisional: true,
  });
}

/** Exportado SÓLO para los tests, con el mismo criterio con el que `decorator.ts` exporta su
 *  `__internals`: verificar la máquina de estados del camino de archivo directamente, incluido
 *  el estado que `build()` ya no publica. */
export const __internals = { evaluarCaminoDeArchivo };

export const hypothesis: HypothesisBuilder = {
  id: "facade",
  pattern: "Facade",
  layer: "patron",
  // OLA AD (frente AD4) — el ancla-fuerza se SUMA; las dos viejas siguen
  // exactamente donde estaban. Sus números medidos por AD4 sobre las dos
  // poblaciones quedan publicados en el informe del frente y NO se tocan:
  // `fanout-without-cohesion` 68 hip / 3 recs (13 repos) y 45 / 6 (`corpus-app/`);
  // `god-component` 73 / 0 y 102 / 4. Las dos juntas: 288 hipótesis, CERO
  // `ausente`.
  //
  // OLA AN (frente AN3) — LAS DOS ANCLAS DE LA CAPA DE REFACTORIZACIÓN SE
  // MIDIERON Y SE RETIRARON. La lista vuelve a las tres de siempre. El número
  // que decidió está en "EL CANAL DE LA CAPA DE REFACTORIZACIÓN" arriba y en
  // `ola-an/informes/AN3.md`: 688 propuestas nuevas, **el 100 % en el estado
  // `parcial` del camino de archivo, que mide 0 de 63**.
  anchors: ["fanout-without-cohesion", "god-component", "repeated-collaborator-set"],
  build(problem: Finding, graph, ctx: HypothesisContext): PatternHypothesisDraft | null {
    if (graph === null) return missingGraphHypothesis(problem.id);

    // OLA AD (frente AD4) — camino de entrada propio del ancla-fuerza. Ver el
    // bloque "EL CAMINO DE ENTRADA DEL ANCLA-FUERZA" más arriba para por qué
    // no puede compartir el `required`/`appliedState` del camino viejo.
    if (problem.kind === "repeated-collaborator-set") {
      const repeated = repeatedSetProblemOf(problem);
      if (!repeated) return null;
      const view = buildFacadeGraphView(graph);
      const spec = buildRepeatedSetSpec();
      const outcome = build(spec, ctx.capabilities, repeated, view);
      // OLA AN (AN3) — SÓLO TRAZA (costo cero apagada): ni un `required` se
      // mueve. Registra, por hallazgo, cuánto dice la capa de NIVEL 2 sobre el
      // archivo primario, para poder medir el DESCUENTO (dirección (b) del
      // encargo) sin aterrizarlo.
      an3TrazarCaminoViejo(problem, ctx, view, "conjunto", outcome ? outcome.state : null);
      if (!outcome) return null;
      return toPatternHypothesis(spec, outcome, {
        anchorFindingId: problem.id,
        // Los `places` son los del propio ancla: ya vienen con el rol exacto
        // de cada archivo (quién repite y qué pieza aporta qué paso).
        places: problem.locations,
        cost: FACADE_COST,
        provisional: true,
      });
    }

    const hipotesis = evaluarCaminoDeArchivo(problem, graph, ctx);
    if (!hipotesis) return null;
    // ────────────────────────────────────────────────────────────────────
    // OLA AY (frente AY4) — EL ESTADO `parcial` DEL CAMINO DE ARCHIVO NO
    // EMITE. Compuerta escrita ANTES de mirar un solo sujeto fresco
    // (`scratchpad-ay4/DECISION-ESCRITA-ANTES.md`, G1) y aterrizada sobre un
    // CENSO, no sobre una muestra: las DOS celdas que produce este estado
    // están enumeradas al 100 % en los 21 repos —
    //
    //   `fanout-without-cohesion` · parcial   26 propuestas, 26 JUZGADAS, V=0 F=26
    //   `god-component`           · parcial   11 propuestas, 11 JUZGADAS, V=0 F=10 psp=1
    //
    // — o sea 37 de 37, con CERO verdaderas. No es una extrapolación desde
    // una muestra: dentro de esta población no queda un sujeto fresco que
    // esta compuerta pueda matar, así que su costo sobre verdaderas juzgadas
    // es cero POR CENSO. Precedente independiente, ya escrito en este mismo
    // módulo y en `ola-an/informes/AN3.md`: «el 100 % en el estado `parcial`
    // del camino de archivo, que mide 0 de 63».
    //
    // POR QUÉ EL ESTADO Y NO EL ANCLA: las mismas dos anclas siguen
    // produciendo `aplicado-eludido` y `ya-aplicado` (381 filas), que son
    // afirmaciones sobre el código y NO recomendaciones (`engine.ts` les pone
    // `confidence: null`). Lo que se apaga es exactamente la SUGERENCIA que
    // este camino sabe emitir, que es la que mide 0 de 37.
    //
    // LÍMITE DECLARADO, sin adornos: el censo es el de estos 21 repos. Fuera
    // de ellos esto es una extrapolación, y se dice así.
    //
    // AGNÓSTICA DE LENGUAJE: mira `problem.kind` y `outcome.state`, dos datos
    // del propio motor. No hay un literal de sintaxis, de extensión ni de
    // idioma — corre igual en los seis lenguajes, y las 37 propuestas que apaga
    // los cruzan: python 11, javascript 7, go 7, csharp 4, java 4, vue 2,
    // tsx 1, ruby 1.
    //
    // LA TRAZA QUEDA HONESTA: `an3TrazarCaminoViejo` ya registró el `state` que
    // la máquina calculó (`parcial`), que es lo que la traza existe para medir;
    // acá se corrige `emitted` a `false`, porque ya no se emite. Un lector de la
    // traza ve «state=parcial, emitted=false» y sabe exactamente qué pasó.
    // ────────────────────────────────────────────────────────────────────
    if (hipotesis.state === "parcial") {
      const ultima = facadeTrace?.[facadeTrace.length - 1];
      if (ultima && ultima.findingId === problem.id) facadeTrace![facadeTrace!.length - 1] = { ...ultima, emitted: false };
      return null;
    }

    return hipotesis;
  },
};
