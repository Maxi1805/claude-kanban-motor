/**
 * Hipótesis de patrón: Builder — F6, migración S1 (CONTRATO-F6.md §Contrato 3,
 * fila `long-parameter-list` → Builder). Reemplaza (con SOLAPAMIENTO, no
 * apagado — ver el resultado final de esta tarea para la medición) a
 * `findBuilderOpportunities` de `pattern-behavioral.ts:379`.
 *
 * ANCLAS: `long-parameter-list` (primaria — "constructor telescópico",
 * refactoring.guru Builder §Applicability-1) y `data-clump` (secundaria —
 * el mismo grupo de datos viajando junto en ≥3 firmas es la misma presión
 * que un constructor con demasiados parámetros, vista desde el lado
 * "repetido entre firmas" en vez de "una firma sola"). Ninguna hipótesis se
 * dispara sola: `build()` exige uno de estos dos `Finding` ya detectados —
 * si el problema ancla no existiera como detector, sería un hallazgo a
 * reportar, no un motivo para inventarlo (no aplica acá: ambos detectores
 * ya existen y corren). ANCLA PROPIA: NO — Ola 10/11 decide que Builder
 * sigue colgando de estas dos, sin detector nuevo (CONTRATO-F10.md §2).
 *
 * OLA AN (FRENTE AN4) — LA CUARTA ANCLA, MEDIDA Y **NO ATERRIZADA**. Se
 * construyó, se midió sobre los 21 repos con un contrafáctico de UNA SOLA
 * VARIABLE y se RETIRÓ del `anchors` con su número publicado: un ancla de
 * NIVEL 2 (`long-function`/`complexity` con una propuesta VIVA de
 * `Extract Method` sobre el mismo símbolo) emitía **167 recomendaciones en
 * bibliotecas, en 7 repos, y acertaba 0 de 26** juzgadas a mano contra el
 * 12,5 % de `long-parameter-list`. El camino entero sigue en este archivo
 * (`buildRefactorSpec`/`buildDesdeRefactorizacion`) con sus 10 tests, porque
 * la MEDICIÓN vale y re-cablearlo es una línea — pero **no está en
 * `anchors`, así que en producción no corre**. Ver `ola-an/informes/AN4.md`
 * §5 para las tres razones estructurales por las que falla (el remedio real
 * es Extract Method a secas; el candidato suele ser un miembro del Builder
 * que YA existe; y la deduplicación —correcta— deja afuera justo los casos
 * donde el ancla vieja ya acierta).
 *
 * ─── required (TODOS deben cumplirse; si no, `build()` no es ni candidata) ──
 *  REDEFINIDO EN LA OLA 12 — ver la sección "OLA 12" más abajo para el porqué
 *  completo. Los tres checks de hoy:
 *  1. `ancla-reconocida`: el hallazgo ancla es uno de los dos que esta
 *     hipótesis reconoce (`long-parameter-list`/`data-clump`) — YA NO exige
 *     un piso de magnitud propio (era vacuo, ver "OLA 12").
 *  2. `construye-una-entidad`: al menos uno de los lugares señalados TIENE
 *     FORMA de construir una sola entidad — constructor real
 *     (`metrics.isConstructor`) o fábrica con nombre (`metrics.isFactoryLike`
 *     / `FACTORY_NAME` propio, ver abajo — YA NO incluye el modismo Vue/JS
 *     `useX`, ver "OLA 12").
 *  3. `ensambla-con-logica` (NUEVO, Ola 12): al menos uno de los lugares
 *     señalados muestra LÓGICA DE ENSAMBLAJE propia — condicionales que
 *     deciden qué/cómo construir, ≥2 sub-objetos propios instanciados, o un
 *     bloque/DSL — en vez de sólo asignar campos o reenviar sus parámetros.
 *     EL DISCRIMINADOR POR INTENCIÓN que esta ola vino a agregar.
 *
 * ─── discriminators (cada uno confirmado sube un peldaño de la escalera) ────
 *  1. `magnitud-fuerte`: la magnitud supera holgadamente el piso del
 *     detector-ancla (éste SÍ sigue siendo un peldaño de confianza, no un
 *     gate — ver "OLA 12" para por qué esto no es lo mismo que el
 *     `magnitud-suficiente` retirado).
 *  2. `constructor-real`: alguna de las funciones señaladas es un
 *     CONSTRUCTOR real (no sólo una fábrica con nombre).
 *
 * ─── ceiling: "alta", needs: [] ──────────────────────────────────────────
 * Sin señal de opcionalidad de parámetro disponible en el grafo/`FunctionMetrics`
 * de hoy, el techo no se condiciona por lenguaje — la escalera de
 * discriminadores hace el trabajo equivalente en los 9 lenguajes por igual.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * OLA 12 — BUILDER DEFINIDO POR INTENCIÓN, NO POR SÍNTOMA
 * (RAICES.md, frente "molde de los otros 16")
 * ═══════════════════════════════════════════════════════════════════════
 *
 * EL PROBLEMA MEDIDO (juicio a mano de los 7 casos vivos de Builder,
 * `tests/golden/precision/{rails,ck-analyzer}.hypotheses.csv`, filtrados por
 * `pattern === "Builder"`): el `required` de antes eran dos preguntas —
 * "¿la magnitud del ancla cruzó un piso?" + "¿el lugar señalado TIENE FORMA
 * de constructor/fábrica?" — es decir, "muchos parámetros + construye algo".
 * Ninguna pregunta sobre construcción POR ETAPAS, estado intermedio, ni
 * lógica de ensamblaje. Los 7 casos, verificados leyendo el código real del
 * usuario (`Visability/Backend`, sólo lectura) y de este mismo repo:
 *
 *   - `booking_configuration.rb#create_booking`, `calendar_module.rb#
 *     create_booking`: reenvían sus parámetros SIN TOCARLOS a la siguiente
 *     capa (`CalendarModule.create_booking` → `strategy.create_booking`) —
 *     una cadena de forwarding de 3 capas. Cero condicionales, cero
 *     sub-objetos instanciados.
 *   - `base_strategy.rb#create_booking`: la implementación real — llama a 4
 *     colaboradores privados (`find_or_create_contact`, `build_appointment_
 *     data`, `make_request`, `build_calendar_link`) SIEMPRE en la misma
 *     secuencia, con los mismos 6-7 parámetros, sin ninguna rama que decida
 *     QUÉ construir. Es una RECETA fija, no una construcción con
 *     combinaciones variables — el único condicional es un `rescue`
 *     (manejo de errores genérico, no ensamblado).
 *   - `orphan_responses_queryable.rb#build_orphan_payload`: arma un hash de
 *     respuesta a partir de piezas YA calculadas por el LLAMADOR —
 *     un solo call site, sin combinaciones opcionales. Tiene un ternario,
 *     pero calcula una variable LOCAL (`total_pages`), no un campo de la
 *     entidad — no es una decisión de ensamblaje.
 *   - `booking.rb#create_reserved!`, `field.rb#initialize` (19 parámetros):
 *     ya usan kwargs con default (el modismo Ruby correcto) — cuerpos
 *     lineales de asignación, sin condicionales.
 *   - `facts/units.ts#buildFileUnit` (este mismo repo): construye un objeto
 *     `FileUnit` en una única pasada determinística, 3 call sites, siempre
 *     los mismos 6 argumentos — el `if (!node) throw` que aparece en su
 *     texto vive DENTRO del closure anidado de `.map`, no en el cuerpo
 *     propio de `buildFileUnit` (ver `anyInOwnScope` más abajo: el mismo
 *     alcance que `code-analyzer.ts#walkFile` usa para atribuir
 *     `FunctionMetrics.branches` — lo que pasa dentro de un closure anidado
 *     es de ESE closure, nunca del que lo contiene).
 *
 * Las 7 pasaban el `required` viejo (parámetros ≥ piso + forma de
 * constructor/fábrica) y NINGUNA construye por etapas.
 *
 * ─── LA DEFINICIÓN CORRECTA (dictada por el usuario, verbatim) ───────────
 * Builder resuelve DOS cosas distintas:
 *   - DONDE NO HACE FALTA: un constructor con muchos parámetros opcionales
 *     que SÓLO SE ASIGNAN A CAMPOS. Ahí el remedio es nativo del lenguaje —
 *     kwargs con default en Ruby, un record o Parameter Object en Java/TS,
 *     `Data.define` en Ruby 3.2+ — y un Builder es sobre-ingeniería. Esto
 *     vale TAMBIÉN en Java: un constructor telescópico que sólo asigna NO
 *     es, por sí solo, el caso de Builder — el canon de Effective Java es
 *     justamente exponer la construcción por etapas cuando hay lógica real,
 *     no cualquier lista larga de parámetros.
 *   - DONDE SÍ: cuando la construcción tiene ETAPAS CON ESTADO INTERMEDIO
 *     VÁLIDO, o VALIDACIÓN INCREMENTAL entre pasos, o el ensamblado implica
 *     LÓGICA NO TRIVIAL (efectos, llamadas externas, armar sub-objetos), o
 *     es un DSL interno con bloques.
 *
 * EL DISCRIMINADOR (la pregunta que de verdad separa los dos casos, y NO
 * depende del lenguaje — lo que cambia entre lenguajes es el REMEDIO
 * sugerido, nunca este criterio): **¿hay lógica de ensamblaje ENTRE PASOS,
 * o el constructor/factoría SÓLO ASIGNA/REENVÍA sus propios parámetros?**
 *
 * ─── CÓMO SE VERIFICA (`ensambla-con-logica`, nuevo required) ────────────
 * Verificable por AST sobre `ctx.file` (el árbol vivo — el mismo, único dato
 * real disponible en `build()` para este ancla intra-*, ver el límite de
 * cableado ya documentado abajo para el excluder estructural). Sobre el
 * CUERPO PROPIO del lugar señalado (sin bajar a closures anidados —
 * `anyInOwnScope`/`countInOwnScope`, mismo alcance que
 * `FunctionMetrics.branches`), ALGUNA de estas tres señales:
 *   1. `sets.chainNodes` (if/elsif/switch-case — DELIBERADAMENTE excluye
 *      loops, `rescue`/`catch` y ternarios, que `code-grammar.ts` ya separa
 *      del resto de `branchNodes` para exactamente este propósito) presente
 *      en el cuerpo: decisión condicional que afecta la construcción —
 *      "validación incremental entre pasos". Un `rescue` de manejo de
 *      errores NO cuenta (por eso NO se usa `metrics.branches`, que sí lo
 *      mezclaría — verificado contra `base_strategy.rb#create_booking`, que
 *      tiene un `rescue` y CERO `if`/`case` propios: con `branches` a secas
 *      habría quedado adentro, con `chainNodes` queda afuera, correcto).
 *   2. ≥2 nodos de instanciación DISTINTOS (`new X(...)`/`X.new(...)`/
 *      `object_creation_expression`/`composite_literal` de Go — duplicado a
 *      propósito de `proxy.ts#isConstructionLike`) dentro del cuerpo: arma
 *      ≥2 sub-objetos, no un solo wrapper trivial de `return new T(...)`.
 *      El piso en 2 (no 1) es deliberado: UNA sola instantiación como único
 *      contenido del cuerpo es indistinguible de un factory-wrapper trivial
 *      — el mismo "sólo asigna" visto desde el otro lado.
 *   3. Un bloque/DSL: Ruby `yield`, o una llamada cuyo callee es
 *      DIRECTAMENTE uno de los parámetros propios (invocado como función/
 *      callback contra el objeto en construcción) — nunca una llamada A UN
 *      MÉTODO DE un parámetro (`param.metodo()`, que es sólo composición
 *      normal, no un DSL).
 * Ninguna de las tres ⇒ `holds: false` — el candidato sólo asigna/reenvía,
 * el remedio nativo del lenguaje alcanza, Builder no aporta.
 * SIN `ctx.file` (nunca pasa en producción para este ancla — ver el límite
 * de cableado — pero SÍ en algún test degenerado): `holds: false` también.
 * Es la polaridad correcta para un `required`: sin evidencia POSITIVA de
 * ensamblaje real, no hay candidata — al revés de un excluder de
 * "ya-aplicado" (que sí debe ser conservador hacia el otro lado).
 *
 * ─── EL PISO DE MAGNITUD RETIRADO (`magnitud-suficiente`) ────────────────
 * Estaba entre los `94 umbrales inventados` del proyecto (RAICES.md R3,
 * `pisoDeclarado` sin cita) — pero además, verificado leyendo los DOS
 * detectores-ancla, era VACUO: `long-parameter-list` (`detect/intra-
 * function/long-parameter-list.ts`) ya exige `parameters >= 6` ANTES de
 * emitir el `Finding`; `data-clump` (`detect/intra-file/data-clump.ts`) ya
 * exige `minGroupSize: citado(3, Fowler)` — y este archivo pedía ≥5 / ≥3
 * respectivamente. 6≥5 y 3≥3 SIEMPRE: el check no podía fallar NUNCA para
 * un `Finding` real, así que no discriminaba nada — la definición correcta
 * (`ensambla-con-logica`) hizo innecesaria la pregunta, tal como
 * RAICES.md preveía como "el mejor resultado posible". Reemplazado por
 * `ancla-reconocida` (sin piso, sólo confirma que el `kind` es uno de los
 * dos reconocidos — necesario porque `primaryMagnitude` sigue siendo la
 * única forma de leer la magnitud del ancla para `magnitud-fuerte`, que SÍ
 * sigue siendo un discriminador válido: su propio piso, 7/5, está POR
 * ENCIMA del piso del detector, así que ahí sí discrimina).
 *
 * ─── VOCABULARIO DE FRAMEWORK RETIRADO DE LA DETECCIÓN (`FACTORY_NAME`) ──
 * La copia local de `FACTORY_NAME` incluía el prefijo `use` — el modismo de
 * composable Vue/JS (`useWidget(...)`) — metido en la DETECCIÓN, exactamente
 * donde CONTRATO-F10/RAICES.md lo prohíben. El `FACTORY_NAME` REAL
 * (`code-analyzer.ts`, el que calcula `FunctionMetrics.isFactoryLike`)
 * NUNCA tuvo `use` — la fuga era sólo de la copia de este archivo. Retirado
 * sin reemplazo estructural: si una ola futura quiere reconocer composables
 * Vue, el lugar correcto es el TEXTO DEL REMEDIO (que sí puede nombrar el
 * framework, ver "detectar es genérico, sugerir puede conocer el lenguaje"
 * en RAICES.md), nunca esta regex de detección.
 *
 * ─── DETECTAR GENÉRICO, REMEDIO CON LENGUAJE ──────────────────────────────
 * El criterio de arriba (`ensambla-con-logica`) es 100% estructural — nodos
 * de rama/instanciación/llamada, ningún nombre de clase ni de framework — y
 * se mide contra el corpus de 8 repos externos (`CK_CORPUS_DIR`), NO sólo
 * contra Ruby/TypeScript (RAICES.md, advertencia de sesgo: 466 Ruby + 186 TS
 * son las únicas poblaciones con casos medidos hasta esta ola). El `cost`
 * de este archivo (más abajo) SÍ puede nombrar el modismo del lenguaje
 * (`kwargs`/`Data.define`/`record`) — eso es conocimiento del LENGUAJE, no
 * de un framework, y es lo que hace útil la sugerencia.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * OLA 10/11 — REDISEÑO DEL EXCLUDER DE ESTADO, CONTRATO-F10.md §1/§2:
 * LAS TRES FORMAS DEL PATRÓN, COMO HECHOS DE GRAFO
 * ═══════════════════════════════════════════════════════════════════════
 *
 * El excluder de "ya aplicado" original de este archivo (`bodyReturnsSelf`/
 * `findFluentSibling`, más abajo, INTACTO) leía TEXTO del cuerpo de un
 * método hermano ("¿la última línea es `return this`/`return self`?").
 * Es evidencia real (es la ÚNICA señal con `ya-aplicado` MEDIDO en
 * producción — click: `ProgressBar.__init__` 17 params, `_LazyFile.__init__`
 * 6 params, PENDIENTES §C2), pero no es la forma que refactoring.guru
 * describe: un encadenamiento fluido dentro de la MISMA clase es apenas un
 * indicio (podría ser cualquier método `with*` que configura el propio
 * objeto, no necesariamente un Builder de OTRO tipo). La forma real del
 * patrón — CONTRATO-F10.md §2, fila Builder — es una relación entre DOS
 * tipos: un Builder `B` con setters encadenables y un método `build()` que
 * INSTANCIA un Producto `T` distinto, con `T` protegido de construcción
 * directa. Eso SÍ es expresable hoy con hechos de grafo (`arity`,
 * `visibility`, aristas `calls`/`instantiates`) — nunca con vocabulario de
 * nombre (nada de `CLONE_METHOD_NAME`/`ITERATOR_PROTOCOL_NAME`/etc. acá).
 *
 * *** DECISIÓN: SUMAR, NO REEMPLAZAR ***. El reemplazo estructural IDEAL de
 * la señal vieja sería "un miembro que retorna SU PROPIO TIPO" — pero eso
 * NO ES EXPRESABLE hoy: el grafo no lleva tipo de retorno en ningún nodo ni
 * arista (CONTRATO-F10.md §0.4, "EL HECHO QUE FALTA"). Apagar el excluder
 * viejo sin ese reemplazo real perdería el ÚNICO `ya-aplicado` medido en
 * producción (rompería `census-golden`, compuerta que no se desactiva). Así
 * que el excluder viejo queda TAL CUAL (ver `fluentChainingState` abajo,
 * literalmente `bodyReturnsSelf`/`findFluentSibling` de antes, sin tocar su
 * lógica) y el nuevo excluder estructural (`evaluateGraphShape`) se agrega
 * EN PARALELO: si CUALQUIERA de los dos confirma una forma completa, el
 * estado sube; el nuevo cubre además `parcial` y `aplicado-eludido`, que el
 * viejo (un solo booleano) nunca pudo producir.
 *
 * LAS TRES FORMAS (CONTRATO-F10.md, encargo de esta ola), sobre el grafo:
 *
 *  COMPLETA (⇒ `ya-aplicado`, NUNCA una sugerencia — requisito 1 del
 *  encargo): existe `B` (`class-like`/`namespace-like`) con:
 *    - ≥3 miembros function-like de `arity === 1`, `visibility` pública o
 *      ausente, cuyo fan-out `calls` no sale de `B` (los setters: un setter
 *      que sólo asigna un campo no tiene NINGÚN `calls` saliente — vacuo,
 *      pasa; uno que además llama a OTRO miembro de `B` también pasa; uno
 *      que llama a un colaborador externo, no).
 *    - ≥1 miembro de `arity === 0` con una arista `instantiates` saliente
 *      hacia `T` (el método `build()`).
 *    - Y (protección real de `T`): el constructor de `T` tiene
 *      `visibility` privada/interna, O el fan-in `instantiates` de `T`
 *      está confinado al archivo de `B` (nadie fuera construye `T`
 *      directamente).
 *  Si la protección de `T` FALLA (hay `instantiates` hacia `T` desde un
 *  archivo ajeno al de `B`) pero el resto de la forma SÍ existe: eso es
 *  `aplicado-eludido` — el Builder existe pero alguien lo puentea con
 *  `new T(...)` directo (variante declarada en el encargo, distinta de
 *  `parcial`).
 *
 *  PARCIAL (⇒ sugiere Builder): ≥2 miembros-fábrica SEPARADOS (funciones o
 *  métodos DISTINTOS, ninguno parte de un `B` completo como el de arriba)
 *  con arista `instantiates` hacia el MISMO `T`, con `arity` DISTINTA entre
 *  sí — constructores telescópicos vistos como fábricas dispersas, sin
 *  Builder que los unifique.
 *
 *  AUSENTE: lo de siempre — `long-parameter-list`/`data-clump` sobre un
 *  constructor, sin ninguna de las dos formas de arriba.
 *
 * IDENTIFICAR `T` (el Producto): dos vías estructurales, en orden —
 *   1. El propio lugar señalado por el `Finding` ES un constructor (nombre
 *      mandado — `CONSTRUCTOR_NAMES`, Ruby/Python/JS/TS/Vue — O el mismo
 *      nombre que su clase contenedora — Java/C#, donde `constructor_
 *      declaration` se registra con el nombre de la clase, nunca la
 *      palabra "constructor"; ver `code-grammar.ts#CONSTRUCTOR_NODE_WORD`).
 *      Entonces `T` ES esa clase contenedora — el "exceso de parámetros" ES
 *      el propio constructor de `T`.
 *   2. Si no, y el lugar señalado tiene una arista `instantiates` saliente
 *      (una fábrica con nombre que construye otra cosa), `T` es el destino.
 *   Si ninguna resuelve (función suelta sin `instantiates` visible): sin
 *   `T` no hay forma de buscar un Builder — declarado (`sin-T` abajo), no
 *   adivinado (requisito 3 del encargo).
 *
 * *** LÍMITE DE CABLEADO ESTRUCTURAL, MEDIDO, NO OCULTO *** (el mismo
 * patrón de las siete repeticiones que abre esta ola — PENDIENTES,
 * encabezado): el ancla de Builder es `intra-function`/`intra-file`, así
 * que su ÚNICO paso por `attachHypotheses` ocurre DENTRO de `analyzeFile`
 * (`code-analyzer.ts`), function-verificado por lectura directa —
 * `repo.graph` es `null` ahí SIEMPRE (el grafo del repo se arma recién en
 * `crossAnalyze`, después de que TODOS los archivos pasaron por
 * `analyzeFile`) y el propio `code-analyzer.ts` lo documenta: "ninguna de
 * las hipótesis ancladas en un Finding intra-function/intra-file de HOY lee
 * repo.graph". La ÚNICA pasada posterior con grafo real (`refreshHypotheses`,
 * Ola 10) NUNCA llama `builder.build` de nuevo — por contrato
 * (`engine.ts#refreshDiscriminators`) sólo puede tocar `discriminators`/
 * `confidence`, JAMÁS `state`. Consecuencia MEDIDA, no adivinada: bajo el
 * cableado de HOY, `evaluateGraphShape` de abajo SIEMPRE ve `graph === null`
 * en producción para este ancla — la lógica es correcta (repo su propia
 * batería de tests con grafos sintéticos) pero queda TAN INERTE en
 * producción como `wrapping-chain.ts` (misma ola, mismo diagnóstico) hasta
 * que una ola futura le dé a esta llamada un grafo real (o implemente
 * `refresh()` para Builder — que hoy NO puede, porque necesita decidir
 * `state`, prohibido para `refresh`). Se declara con `checks[].why`
 * explícito (`sin-grafo`, abajo) en vez de fingir que "no se encontró
 * Builder" es lo mismo que "no se pudo buscar". No es mío arreglar
 * `code-analyzer.ts` (archivo compartido, fuera de mi alcance) — medido y
 * reportado en el resultado final de esta tarea con un script que llama
 * `hypothesis.build` directamente con el grafo real de cada repo (mismo
 * idiom que `scripts/measure-wrapping-chain-smoke.mts`), para separar "la
 * lógica es correcta" de "el cableado la deja inerte hoy".
 *
 * *** CORRECCIÓN, OLA AA (frente AA2) — EL PÁRRAFO DE ARRIBA QUEDÓ VIEJO ***:
 * lo anterior describe correctamente el cableado de la OLA 10/11, pero una
 * ola posterior (V, `hypotheses/run.ts#rebuildHypothesesWithGraph`, NO
 * `refreshHypotheses` — son dos funciones distintas) agregó una SEGUNDA
 * pasada que SÍ vuelve a llamar `builder.build()` completo, dentro de
 * `crossAnalyze`, con el grafo REAL del repo — `code-analyzer.ts` la corre
 * para todo `Finding` cuyo `kind` es ancla de CUALQUIER builder registrado
 * (`findingsNeedingGraphPass`), Builder incluido. **Instrumentado y medido
 * por mí** (side-channel `onRequiredDiagnosed`, más abajo): en producción,
 * `build()` corre DOS VECES por cada `Finding` `data-clump`/
 * `long-parameter-list` — la primera con `graph=null` (dentro de
 * `analyzeFile`, lo que este párrafo describe), la segunda con el grafo real
 * (`rebuildHypothesesWithGraph`), y la segunda SOBRESCRIBE `finding.
 * hypotheses` (`run.ts:369`, nunca lo funde con la primera). `evaluateGraphShape`
 * de abajo **NO** está inerte en producción hoy: corre con grafo real en la
 * segunda pasada. Lo que SÍ sigue siendo cierto: los tres `required`
 * (`anclaReconocida`/`construyeUnaEntidad`/`ensamblaConLogica`) no leen
 * `graph`, así que su resultado es idéntico en las dos pasadas — el límite
 * de cableado nunca afectó al `required`, sólo al excluder de `appliedState`,
 * y ESE límite ya no existe. Verificado con `scripts/aa2-diagnose-data-clump-
 * builder.mts` sobre los 13 repos + `corpus-app/`: ver el informe de AA2 para
 * el resultado completo.
 *
 * *** VERIFICADO CONTRA LOS FIXTURES CANÓNICOS DE BUILDER ***
 * (`scratchpad/smells/fixtures-multi/builder/*`): los 6 archivos (uno por
 * lenguaje) son el mismo par `PizzaBuilder`/`PizzaOrder`, cada setter con
 * UN solo parámetro propio (`setSize(size)`, `addTopping(topping)`) y sin
 * ningún constructor ni agrupación de datos que cruce el piso de
 * `long-parameter-list`(≥6)/`data-clump`(≥3 firmas) — confirmado corriendo
 * el analizador real sobre los 6: CERO `Finding`s de ninguna de las dos
 * anclas. Sin ancla, `build()` NUNCA se invoca ahí (ni antes ni después de
 * esta tarea) — silencio ESTRUCTURAL por diseño de fixture (construido para
 * ejercitar el excluder VIEJO, "encadenamiento fluido", con controles
 * negativos `PizzaOrder`), no por un hueco de esta hipótesis. Declarado en
 * el resultado final de esta tarea, con la verificación manual que sí
 * reproduce la forma COMPLETA/PARCIAL sobre grafos sintéticos y sobre el
 * grafo real de los 8 repos.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * OLA 13 — LA RAMA NEGATIVA PARTE EN DOS: PARAMETER OBJECT
 * (RAICES.md, frente "el remedio correcto es otro" — el 46% de las 174
 * hipótesis juzgadas a mano: el ancla acertaba (57%), el patrón propuesto
 * no (11%))
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Hasta la Ola 12, cuando `ensambla-con-logica` (arriba) da `holds: false`
 * — "sólo asigna/reenvía, sin lógica de ensamblaje real" — `build()` no
 * emite NADA: la información de que hay un problema real (muchos
 * parámetros/grupo repetido) Y de cuál es el remedio correcto (un
 * Parameter Object) YA ESTABA CALCULADA por ese mismo check, y se tiraba.
 *
 * `buildAlternative` (exportado, al final del archivo) es la rama negativa
 * hecha explícita: reusa `assemblyVerdict` (la MISMA evidencia estructural
 * que decide `ensambla-con-logica`, nunca una segunda pregunta que podría
 * desalinearse) y sostiene únicamente cuando esa evidencia CONFIRMA
 * positivamente "sólo asigna" (`kind: "confirmed-only-assigns"`) — nunca
 * cuando es `"unknown"` (sin árbol vivo, o ubicación no resuelta): ausencia
 * de evidencia no es evidencia de "sólo asigna", exactamente la misma regla
 * que ya rige `ensambla-con-logica` en la otra dirección.
 *
 * SU PROPIO `required`, tan exigente como el de Builder (condición no
 * negociable #1 del encargo): `ancla-reconocida` + `construye-una-entidad`
 * (LOS MISMOS DOS que Builder — sin esto, cualquier lista larga de
 * parámetros independientes, nunca una entidad, dispararía "Parameter
 * Object" por la puerta de atrás) + `solo-asigna-o-reenvia` (el tercero,
 * INVERTIDO). Ver `hypotheses/types.ts#PatternAlternative` para: (a) la
 * decisión de representación (tipo hermano, no un campo/marcador de
 * `PatternHypothesis` — el porqué completo de por qué esa forma es la que
 * MENOS miente) y (b) el límite de cableado declarado (no cuelga de
 * `Finding`/`CodeFinding` todavía: esta ola tiene prohibido tocar
 * `detect/`, que es donde vive el campo que faltaría agregar — un límite de
 * ALCANCE, no un descuido; la lógica está aquí, probada, y lista para esas
 * dos líneas de wiring cuando alguien con permiso las escriba).
 *
 * ─── EL RESULTADO MEDIDO: CONDICIÓN DE FRACASO, DECLARADA CON EL NÚMERO ──
 * `scripts/sample-builder-alternative-for-judgment.mts` (usa
 * `resolveLiveFileUnit`, R1, para tener `ctx.file` vivo — igual que
 * producción para este ancla) muestreó, vía `con-analisis.sh`, sobre
 * `Visability/Backend` (Ruby, sólo lectura), este mismo repo (`src/`,
 * TypeScript), y dos subárboles reales de `corpus/guava` (Java:
 * `guava/src/com/google/common/collect`, 216 archivos, y `.../util/
 * concurrent`, 84 archivos — RAICES.md, advertencia de sesgo: Java/C# eran
 * las dos poblaciones con CERO casos medidos antes de esta ola) y de
 * `corpus/newtonsoft-json` (C#). Un humano juzgó a mano las 15 ubicaciones
 * ÚNICAS que la alternativa emitió (deduplicadas por `(archivo, línea)` —
 * `analyzeRepo` produce, para overloads Java con el mismo nombre, ≥1
 * `Finding` "de más" apuntando a la MISMA línea; artefacto del pipeline
 * compartido, `code-analyzer.ts`/`detect/`, fuera de alcance de esta ola —
 * "no toques `detect/`"; el dedup vive en el script de muestreo, no acá),
 * contra el código fuente real, cargadas en
 * `tests/golden/precision/builder-alternative.hypotheses.csv`:
 *
 * | población | lenguaje | emitidas | verdadero | falso | dudoso |
 * |---|---|---|---|---|---|
 * | rails (Visability/Backend) | Ruby | 6 | 5 | 0 | 1 |
 * | ck-analyzer (`src/`) | TypeScript | 1 | 1 | 0 | 0 |
 * | guava-collect | Java | 8 | 0 | 8 | 0 |
 * | newtonsoft-json | C# | 0 (ninguna emitida) | — | — | — |
 * | guava-concurrent | Java | 0 (ninguna emitida) | — | — | — |
 * | **TOTAL** | **3 lenguajes** | **15** | **6** | **8** | **1** |
 *
 * **Precisión: 6/14 juzgadas (1 dudoso excluido, mismo criterio que
 * `hypotheses-precision-report.mts`) = 43%, Wilson95% [21%, 67%].**
 * Por DEBAJO del piso de 50% que el encargo exige.
 *
 * **Ruby/TypeScript solos: 100% (6/6).** Si esta ola se hubiera medido
 * SÓLO sobre las dos poblaciones ya usadas antes (exactamente el sesgo que
 * RAICES.md pide no repetir), habría cerrado en verde con confianza falsa.
 * Java (`guava-collect`) es el 100% de los falsos, y el patrón es
 * consistente en los 8: **no es ruido aleatorio, es un blindspot
 * estructural real** de las tres señales de `assemblyVerdict`:
 *   - **4 casos (`ya-usa-builder-interno`)**: el cuerpo YA delega a un
 *     Builder interno o local — `Builder<K,V> builder = builder();
 *     builder.put(k1,v1); builder.put(k2,v2); builder.put(k3,v3); return
 *     builder.build();` (`ImmutableListMultimap`/`ImmutableSetMultimap`), o
 *     `new Builder<E>().add(e1).add(e2)...add(e6).build()`
 *     (`ImmutableMultiset`), o `new RegularSetBuilderImpl<>(...)` + un
 *     `for` que llama `.add(...)` sobre cada elemento restante
 *     (`ImmutableSet`). Ninguna de las tres señales lo reconoce: la cuenta
 *     de instanciaciones exige ≥2 DISTINTAS (acá hay 0 o 1: `builder()` es
 *     una llamada en minúscula, no cuenta; `new Builder<E>()` es 1 sola);
 *     `chainNodes` sólo mira `if`/`case`, nunca loops (por diseño, ver
 *     arriba); y llamadas REPETIDAS al MISMO método sobre el MISMO
 *     receptor (`.put(...)` ×3, `.add(...)` ×7) nunca se cuentan como
 *     evidencia de ensamblaje — un 4º patrón de señal que esta ola NO
 *     implementó (ver "LO QUE UNA OLA FUTURA PODRÍA INTENTAR" abajo).
 *   - **4 casos (`remedio-tampoco-aplica`)**: ni Builder ni Parameter
 *     Object aportan nada — son la escalera deliberada de sobrecargas
 *     `of()`/`of(k,v)`/`of(k,v,k,v)`/... que Guava (y Effective Java) usan
 *     A PROPÓSITO para colecciones pequeñas, con Builder como fallback
 *     recién para N variable (`ImmutableBiMap`/`ImmutableList`/
 *     `ImmutableMultimap`, que reenvían a otra fábrica/constructor), o un
 *     stub `@Deprecated @DoNotCall` cuyo cuerpo ENTERO es `throw new
 *     UnsupportedOperationException()` (`ImmutableSortedMultiset`) — acá
 *     el problema real es "ninguno de los dos remedios, es diseño
 *     intencional o no hay nada que arreglar", una TERCERA categoría que
 *     una alternativa BINARIA (Builder descartado ⇒ Parameter Object) no
 *     puede expresar por construcción.
 *
 * **DECISIÓN, tal como el encargo la prevé como salida válida: la rama
 * negativa de Builder vuelve a ser silencio.** `buildAlternative` (abajo)
 * queda exportada e ÍNTEGRA — es código correcto, con su propio `required`
 * tan exigente como el positivo, probado, y sigue siendo la referencia de
 * INFRAESTRUCTURA para Command/Decorator (`hypotheses/types.ts#
 * PatternAlternative`, el tipo hermano y la separación criterio/texto,
 * son reutilizables tal cual) — pero NO se registra en `export const
 * hypothesis` (ver ahí mismo el porqué): con esta precisión medida, no
 * corresponde ofrecerla como si "funcionara".
 *
 * **LO QUE UNA OLA FUTURA PODRÍA INTENTAR, descrito y NO implementado a
 * propósito** (arriesgarlo sin volver a medir sobre el corpus completo de
 * 8 lenguajes sería exactamente "una definición correcta sobre un ancla
 * equivocada", RAICES.md): agregar una 4ª señal a `assemblyVerdict` — "≥2
 * llamadas al MISMO nombre de método, encadenadas (`_.foo().foo()`) o
 * sobre el MISMO receptor local repetido en sentencias separadas" — 100%
 * estructural, sin vocabulario. Arreglaría los 4 casos
 * `ya-usa-builder-interno` (movería esos candidatos a "Builder podría
 * aplicarse" en vez de silencio o Parameter Object, que es lo que la
 * evidencia real dice). NO arreglaría los otros 4 (`remedio-tampoco-
 * aplica`): ésos no ensamblan por ninguna definición razonable, el
 * problema es que el remedio correcto es "ninguno", no "el otro". Techo
 * teórico con esa 4ª señal, sobre ESTA MISMA muestra: 6 verdadero / 10
 * juzgadas = 60% — cruzaría el piso, pero es una proyección sobre 8 casos
 * de un solo paquete de un solo repo, no una medición nueva; la señal
 * también arriesga inflar `ensambla-con-logica` (el `required` POSITIVO de
 * Builder, compartido) en direcciones no verificadas contra las dos
 * poblaciones oficiales — exactamente el tipo de apuesta sin medir que
 * RAICES.md pide no hacer bajo presión de cierre.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * OLA 14 — `ensambla-con-logica` ACEPTABA SELECCIÓN ENTRE RAMAS COMO SI
 * FUERA ENSAMBLADO (RAICES.md, frente homónimo; medido primero en "LA
 * TERCERA MEDICIÓN", Ola G)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * EL PROBLEMA MEDIDO: Builder es el único de los 17 patrones con un check de
 * intención (`ensambla-con-logica`, arriba). Sobre `corpus/guava` aceptaba 3
 * casos que son Factory Method, no Builder:
 *
 *   - `MapMakerInternalMap#newEntry`: `next == null ? new
 *     StrongKeyStrongValueEntry(...) : new LinkedStrongKeyStrongValueEntry(
 *     ...)`.
 *   - `ClassPath.ResourceInfo#of`: `if (resourceName.endsWith(".class"))
 *     return new ClassInfo(...) else return new ResourceInfo(...)` (dos
 *     ubicaciones que comparten la misma forma).
 *
 * Las dos instanciaciones de cada caso son RAMAS MUTUAMENTE EXCLUYENTES: se
 * construye UN objeto, eligiendo cuál — exactamente lo que Builder debe
 * EXCLUIR (refactoring.guru: Builder separa la construcción de un objeto
 * complejo de su representación; Factory Method decide QUÉ subtipo
 * instanciar). Las DOS señales originales de `ensambla-con-logica`
 * confirmaban esto como ensamblaje: la señal (a) `sets.chainNodes` disparaba
 * con CUALQUIER `if`/`else` en el cuerpo, sin mirar qué había adentro; la
 * señal (b) contaba "≥2 instanciaciones" sin distinguir si convivían en el
 * resultado o si eran alternativas de las que sólo una corre.
 *
 * ─── LA DISTINCIÓN QUE FALTABA (dictada por el usuario, verbatim) ────────
 * **Ensamblado por etapas**: se acumula configuración o se arman
 * sub-objetos que CONVIVEN en el resultado. Los pasos son acumulativos —
 * TODOS corren en una misma ejecución.
 * **Selección entre ramas**: se elige UNA de varias construcciones
 * alternativas. Los caminos son excluyentes y SÓLO UNO corre.
 *
 * La señal estructural que las separa: en el primero, las instanciaciones
 * están en el MISMO camino de ejecución (secuencial, o ambas alcanzables en
 * una sola corrida); en el segundo, en RAMAS HERMANAS de un condicional
 * (`consequence`/`alternative` del MISMO `if`/ternario) — nunca ambas
 * alcanzables juntas. El árbol lo sabe: es exactamente la forma que
 * `code-grammar.ts#isIfLike` ya usa (`condition`+`alternative`), con
 * `consequence` sumado para poder inspeccionar las dos ramas.
 *
 * ─── EL ARREGLO: `isPureConstructionChain` (100% estructural) ────────────
 * Un nuevo predicado — `unwrapSoleValue`/`isSoleConstructionValue`/
 * `twoWayBranchFields`/`isPureConstructionChain`, todos arriba en este
 * archivo, junto a `isInstantiationLike` de la que dependen — que responde
 * "¿esta rama (o esta cadena de ramas `if`/`elsif`/`else`/ternario
 * anidado) es PURAMENTE una selección entre construcciones alternativas,
 * sin ninguna otra lógica?". Ninguna palabra de lenguaje ni de framework:
 * sólo forma de campos (`condition`/`consequence`/`alternative`, el MISMO
 * trío que `code-grammar.ts` ya deriva de las 6 gramáticas soportadas) y
 * conteo de hijos nombrados. Se usa en DOS puntos, porque el defecto vivía
 * en las DOS señales:
 *   - `countInOwnScope` (señal b, "≥2 sub-objetos"): un nodo que ES una
 *     cadena de selección pura cuenta como UNA unidad, no una por rama —
 *     arregla `newEntry` (el ternario es, él mismo, la cadena pura).
 *   - `hasGenuineChainLogic` (señal a, reemplaza el chequeo viejo "¿hay
 *     ALGÚN chainNodes?"): un `if`/`else` que ES una cadena de selección
 *     pura ya NO cuenta como "lógica condicional que ensambla" — arregla
 *     `ResourceInfo#of` (el `if` en sí es la cadena pura: cada rama, tras
 *     pelar el `return`, es sólo una instanciación).
 *
 * ─── VERIFICADO A MANO, LOS DOS CASOS DE GUAVA ───────────────────────────
 * `MapMakerInternalMap#newEntry` (`guava/src/com/google/common/collect/
 * MapMakerInternalMap.java`): construye una entrada de mapa distinta según
 * si hay un siguiente nodo en la cadena de colisión (`next == null`) —
 * despacho por caso, no ensamblaje: NUNCA se construyen las dos entradas
 * juntas, exactamente una corre. Factory Method, confirmado.
 * `ClassPath.ResourceInfo#of` (`guava/src/com/google/common/reflect/
 * ClassPath.java`): construye un `ClassInfo` o un `ResourceInfo` según la
 * extensión del nombre de archivo — el MISMO despacho por tipo, exactamente
 * el ejemplo canónico de Factory Method (refactoring.guru: "un método que
 * decide qué subclase instanciar"). Factory Method, confirmado.
 *
 * ─── LO QUE ESTA OLA NO TOCA, A PROPÓSITO ────────────────────────────────
 * "LA TERCERA MEDICIÓN" (RAICES.md) nombra una SEGUNDA causa, distinta:
 * `sets.chainNodes` también confirmaba sobre guardas de validación aisladas
 * sin ninguna construcción alternativa detrás (`click CliRunner.__init__`,
 * dos `if …: raise ValueError` sobre argumentos independientes). Esa causa
 * NO es "selección entre ramas" (no hay NINGUNA instanciación en juego,
 * mutuamente excluyente o no) — es un frente distinto ("¿esta rama
 * construye algo, lo que sea?"), fuera del alcance asignado a esta ola.
 * `hasGenuineChainLogic` lo declara en su propio docstring en vez de
 * esconderlo.
 *
 * ─── GUARDIÁN AGREGADO AL VERIFICAR A MANO (`isNonValueJump`) ────────────
 * Al verificar a mano el censo post-arreglo (abajo) apareció
 * `sqlalchemy dialects/postgresql/ext.py#AggregateOrderBy.__init__`: `if
 * _lob == 0: raise TypeError(...) elif _lob == 1: self.order_by =
 * coercions.expect(...) else: self.order_by = elements.ClauseList(...)`.
 * Este candidato sigue confirmando `ensambla-con-logica` CORRECTAMENTE (el
 * `elif`/`else` no reducen a una instanciación pura) — pero `raise
 * TypeError(...)`, AISLADO, sí pela hasta una instanciación (`TypeError(...)`
 * es un `call` bare-capitalizado, la misma convención Python/Go que
 * `isInstantiationLike` ya reconoce). Sin el guardián `isNonValueJump`
 * (`peelSoleChild`, más abajo), un `if (cond) return new A() else raise
 * Error(...)` — validar-o-construir, NO selección entre DOS alternativas
 * construidas — se hubiera leído como `isPureConstructionChain` por las
 * MISMAS razones que `newEntry`/`of` sí deben leerse así, reabriendo con una
 * mano lo que la otra cierra. Agregado y probado (`raiseVsConstructBodySpec`,
 * `builder.fixtures.ts`) antes de dar el arreglo por cerrado.
 *
 * ─── VERIFICADO SOBRE LOS 13 REPOS DEL CORPUS (censo completo) ───────────
 * `guava` (censo completo, `analyzeRepo` sobre el repo entero, 5000
 * hallazgos): **0 hipótesis Builder** — bajó de las 3 documentadas (todas
 * falsas) a 0. Ningún Builder vivo que abrir (criterio de cierre #2): guava
 * declara 25 clases `Builder` reales, bien aplicadas, y el analizador sigue
 * en silencio sobre ellas — el mismo límite ya documentado ("un patrón bien
 * aplicado es indetectable", RAICES.md), no un efecto de esta ola.
 *
 * Los 13 repos (click/cobra/eslint/guava/hugo/jekyll/lodash/nest/
 * newtonsoft-json/preact/rubocop/sqlalchemy/vueuse), un proceso por repo:
 *
 * | repo | Builder vivos |
 * |---|---|
 * | click | 6 |
 * | cobra | 0 |
 * | eslint | 4 |
 * | guava | 0 |
 * | hugo | 2 |
 * | jekyll | 0 |
 * | lodash | 0 |
 * | nest | 2 |
 * | newtonsoft-json | 1 |
 * | preact | 1 |
 * | rubocop | 2 |
 * | sqlalchemy | 23 |
 * | vueuse | 0 |
 * | **TOTAL** | **41** |
 *
 * 5 verificados a mano contra el código fuente real (uno por lenguaje,
 * ninguno relacionado con el defecto que esta ola arregla — todos muestran
 * lógica condicional propia genuina, no selección entre ramas):
 * `click ProgressBar.__init__` (Python, `ya-aplicado` — el mismo caso citado
 * en la Ola 12, default-fallback de `file`/`length`/`iterable`, ninguno de
 * dos ramas); `eslint createCursor` (JS, cadena de envoltura acumulativa —
 * `FilterCursor`/`SkipCursor`/`LimitCursor`, tres `if` de un solo brazo
 * independientes, ninguno mutuamente excluyente con otro); `hugo NewSpec`
 * (Go, default-fallback de `incr`/`logger`, mismo patrón que click); `newtonsoft-json
 * CreateElement` (C#, `if`/`foreach`/`switch` real más un ternario cuyas dos
 * ramas son llamadas `document.CreateAttribute(...)`, no instanciaciones —
 * irrelevante para el conteo); `sqlalchemy AggregateOrderBy.__init__`
 * (Python, el caso que motivó `isNonValueJump`, arriba).
 */
import { CONSTRUCTOR_NAMES, type DerivedNodeSets } from "../code-grammar.js";
import type { AstNode, Finding, FileUnit, RepoFunctionUnit, RoleLocation } from "../detect/types.js";
import { deriveAnchor } from "../detect/ids.js";
import { confidentEdges } from "../detect/inter-file/confident-edges.js";
import { ROLE_DOOR } from "../detect/inter-file/optional-construction-combinations.js";
import type { CodeGraph, CodeGraphEdge, CodeGraphNode } from "../graph/types.js";
import { build as engineBuild, refreshDiscriminators, toPatternHypothesis, type AppliedStateResult, type Check, type HypothesisSpec } from "./engine.js";
import type { HypothesisBuilder, HypothesisContext, PatternAlternative, PatternHypothesis, PatternHypothesisCheck, PatternHypothesisDraft } from "./types.js";

const PATTERN = "Builder" as const;
const SOURCE = "https://refactoring.guru/es/design-patterns/builder";

// Ola 12 — `BUILDER_MIN_PARAMS`/`BUILDER_MIN_GROUP` (los pisos de
// `magnitud-suficiente`) se RETIRAN acá: eran vacuos (ver el docstring del
// módulo, "EL PISO DE MAGNITUD RETIRADO"). `BUILDER_STRONG_*` siguen en pie:
// alimentan `magnitud-fuerte` (discriminador, no required) y SÍ discriminan
// de verdad porque su piso está por encima del de cada detector-ancla.
const BUILDER_STRONG_PARAMS = 7;
const BUILDER_STRONG_GROUP = 5;

/* ═══════════════════════════════════════════════════════════════════════
 * OLA AE, FRENTE AE4 — LA TERCERA ANCLA: `optional-construction-combinations`
 *
 * SUMA, NO REEMPLAZA. Las dos anclas viejas (`long-parameter-list`,
 * `data-clump`) quedan EXACTAMENTE donde estaban, con su número publicado y
 * sin tocar una línea de su camino: la Ola AE es ADITIVA. Todo lo que sigue
 * cuelga de `if (problem.kind === OPTIONAL_COMBINATIONS_KIND)` y no toca ni un
 * `required`, ni un discriminador, ni una rama de `appliedState` del camino
 * viejo.
 *
 * POR QUÉ HACE FALTA, MEDIDO POR AE4 sobre los volcados del día de las DOS
 * poblaciones: las dos anclas viejas producen 1.045 hallazgos crudos → 103
 * hipótesis, y el triaje vigente le mide a la primaria 3/34 = 8,8 % en
 * bibliotecas y 0/9 en aplicaciones. La causa, dicha como la dice el patrón:
 * **una firma larga no es la situación que Builder resuelve**. Un constructor
 * de 6 parámetros al que TODOS los sitios le pasan los 6 no tiene ninguna
 * opcionalidad, y su remedio es un objeto de parámetros — que es exactamente
 * lo que el `cost` de este módulo ya dice en prosa y lo que ninguna de las dos
 * anclas puede verificar. El ancla nueva mide la opcionalidad **en los sitios
 * de construcción**: cuántas cantidades DISTINTAS de argumentos se observan.
 * Ver `detect/inter-file/optional-construction-combinations.ts` para las cinco
 * condiciones y sus intenciones.
 *
 * LOS TRES PISOS DE ESTA HIPÓTESIS SON LOS MISMOS TRES DEL DETECTOR, a
 * propósito y no por casualidad: el detector ya los exigió antes de emitir el
 * `Finding`, y `threshold-alignment.test.ts` existe justamente para que una
 * hipótesis no declare un piso propio MÁS BAJO que el de su ancla. Se repiten
 * acá porque estos `required` NO le creen al detector: los tres re-derivan el
 * hecho del grafo real, y sin grafo devuelven `holds: false` — nunca "no pude
 * mirar, apruebo".
 * ═══════════════════════════════════════════════════════════════════════ */
const OPTIONAL_COMBINATIONS_KIND = "optional-construction-combinations";
const BUILDER_MIN_COMBINATIONS = 3;
const BUILDER_MIN_OPTIONAL_SLOTS = 3;
const BUILDER_MIN_CONSTRUCTION_SITES = 3;
/** Discriminador (no gate), igual que `BUILDER_STRONG_PARAMS`/`_GROUP`: su piso está POR ENCIMA del del detector, así que sí discrimina. */
const BUILDER_STRONG_COMBINATIONS = 5;
const BUILDER_STRONG_OPTIONAL_SLOTS = 5;
const BUILDER_STRONG_SITES = 6;
/** La etiqueta EXACTA con la que el detector publica su primera medición — un solo literal, leído de un solo lado. */
const COMBINATIONS_TRIGGER_LABEL = "combinaciones distintas de argumentos observadas";

/**
 * Duplicado A PROPÓSITO de `code-analyzer.ts#FACTORY_NAME` (mismo criterio
 * que el resto de esta hipótesis: no depender de un archivo compartido que
 * el integrador pueda tocar). Ola 12 (ver el docstring del módulo,
 * "VOCABULARIO DE FRAMEWORK RETIRADO"): YA NO incluye `use` — el modismo de
 * composable Vue/JS estaba metido en la DETECCIÓN, prohibido por
 * RAICES.md/CONTRATO-F10. El `FACTORY_NAME` real de `code-analyzer.ts` (el
 * que calcula `FunctionMetrics.isFactoryLike`) nunca tuvo `use` — la fuga
 * era sólo de esta copia.
 *
 * *** DEFECTO ENCONTRADO Y ARREGLADO POR EL INTEGRADOR DE LA OLA G, MEDIDO
 * EN EL CORPUS, NO HIPOTÉTICO. *** Esta copia llevaba la bandera `/i`
 * ("case-insensitive para cubrir snake_case"), y `/i` NO se aplica sólo al
 * verbo: también convierte la GUARDA DE FRONTERA `([_A-Z]|$)` en "cualquier
 * letra o fin de nombre". Con `/i`, el verbo dejaba de tener que terminar
 * donde termina la palabra, así que TODO identificador que EMPIEZA con una
 * de las ocho sílabas contaba como fábrica: `format_usage`, `formatter`,
 * `forward`, `newline`, `offset`, `offer`, `format`… Verificado corriendo el
 * analizador real sobre `corpus/click` (Python): `src/click/core.py#
 * format_usage` —un formateador de texto de ayuda, cero construcción— pasaba
 * `construye-una-entidad` por esta vía y producía una hipótesis Builder viva
 * (ancla `data-clump` sobre `(self, ctx, formatter)`, el trío que se repite
 * en 8 firmas de `core.py`).
 *
 * El `FACTORY_NAME` de `code-analyzer.ts` no tiene `/i` y por eso nunca tuvo
 * el defecto; pero SIN `/i` se pierde el caso real que motivó la bandera:
 * PascalCase (`CreateElement`, `Converters/XmlNodeConverter.cs` de
 * `corpus/newtonsoft-json`), que es la convención de método público en
 * Java/C#/Go. Ninguna de las dos banderas sola es correcta — y ésta es la
 * cara concreta de la advertencia de sesgo de RAICES.md: la bandera se puso
 * mirando snake_case (Ruby/Python) y nadie la midió contra un lenguaje
 * PascalCase hasta que existió el corpus.
 *
 * La forma correcta separa las dos preguntas: el VERBO se compara sin
 * distinguir mayúsculas (cubre `create_x` de Ruby/Python, `createX` de
 * JS/TS y `CreateX` de Java/C#/Go) y la FRONTERA se exige aparte, estricta
 * (`_`, una mayúscula, o fin del nombre). Con esto `CreateElement`/
 * `createVNode`/`create_booking`/`newEntry` siguen dentro y `format_usage`/
 * `formatter`/`offset`/`newline` quedan afuera — comprobado sobre los 8
 * repos del corpus, ver el informe de la Ola G.
 */
const FACTORY_VERB = /^(create|build|make|new|for|from|of|instantiate)/i;

function looksLikeFactoryName(symbol: string): boolean {
  const m = FACTORY_VERB.exec(symbol);
  if (!m) return false;
  const rest = symbol.slice(m[0].length);
  return rest === "" || rest.startsWith("_") || /^[A-Z]/.test(rest);
}

/** Vía primaria (ver el docstring del módulo, §hallazgo de cableado): el
 *  nombre crudo tal como viaja en `RoleLocation.symbol`. */
function symbolLooksLikeConstruction(symbol: string | undefined): boolean {
  if (!symbol) return false;
  return CONSTRUCTOR_NAMES.has(symbol.toLowerCase()) || looksLikeFactoryName(symbol);
}

function symbolIsConstructorName(symbol: string | undefined): boolean {
  return symbol !== undefined && CONSTRUCTOR_NAMES.has(symbol.toLowerCase());
}

/** Enriquecimiento oportunista: si `ctx.repo.functions` para una vez trae la
 *  función (hoy siempre vacío, ver el docstring del módulo), se usa su
 *  `metrics` calculada por introspección de AST en vez de sólo el nombre. */
function findRepoFunction(loc: RoleLocation, ctx: HypothesisContext): RepoFunctionUnit | null {
  return ctx.repo.functions.find((f) => f.file === loc.file && f.startLine === loc.startLine && f.endLine === loc.endLine) ?? null;
}

/**
 * OLA AI (frente AI6) — TERCERA VÍA, ESTRICTAMENTE ADITIVA: EL NODO DE
 * CONSTRUCTOR QUE LA GRAMÁTICA YA DECLARA.
 *
 * *** EL DEFECTO QUE ARREGLA, MEDIDO ANTES DE ESCRIBIR UNA LÍNEA ***
 * Las dos vías de `locationLooksLikeConstruction` (abajo) reconocen un
 * constructor SÓLO POR SU NOMBRE: `CONSTRUCTOR_NAMES` (`code-grammar.ts` —
 * `initialize`/`constructor`/`__init__`) o un verbo-fábrica (`FACTORY_VERB`).
 * **En Java y en C# un constructor se llama COMO SU CLASE**
 * (`CacheStats(...)`, `GeneralRange(...)`), así que su `RoleLocation.symbol`
 * no puede ser ninguno de los tres nombres ni empezar por un verbo-fábrica:
 * **ningún constructor de Java ni de C# puede satisfacer
 * `construye-una-entidad`, POR CONSTRUCCIÓN** — no es un umbral mal puesto,
 * es una prueba que la gramática de esos dos lenguajes hace imposible de
 * pasar. La vía que lo habría salvado (`repoFn.metrics.isConstructor`, vía
 * `findRepoFunction`) está MUERTA y el árbol lo dice: `code-analyzer.ts`
 * arma el `RepoUnit` con `functions: []` a propósito ("va VACÍO a propósito:
 * ningún detector `inter-file` de hoy lee `repo.functions`").
 *
 * El propio archivo ya nombraba la mitad del problema — `constructorReal`
 * (DISCRIMINADOR) escribe en su evidencia "podría ser … un constructor de
 * Java/C# nombrado como su clase", y el docstring del módulo declara la
 * regla correcta para identificar `T` ("nombre mandado … O el mismo nombre
 * que su clase contenedora — Java/C#"). Lo que nadie había medido es que el
 * `required` tiene la MISMA ceguera, y que ahí no es una imprecisión: es una
 * compuerta imposible.
 *
 * LOS NÚMEROS, sobre el volcado del día de los 21 repos (informe AI6 §4): de
 * los **23** `long-parameter-list` juzgados VERDADEROS de nivel 1 y vivos en
 * las 13 bibliotecas, **15 no tienen ninguna hipótesis de Builder**, y **6 de
 * esos 15 son constructores de Java de guava** — `CacheStats.java:78`,
 * `GeneralRange.java:103`, `LocalCache.java:4709`,
 * `MapMakerInternalMap.java:2819`, `AbstractIteratorTester.java:280`,
 * `MapInterfaceTest.java:127`. Con la MISMA ancla y el mismo piso, los
 * `__init__` de click y de sqlalchemy SÍ pasan esta compuerta: la única
 * diferencia entre unos y otros es cómo se escribe "constructor" en cada
 * lenguaje.
 *
 * *** POR QUÉ ES GENÉRICO Y NO LÉXICO ***
 * No se compara ningún nombre y no se agrega ninguna constante. Se pregunta
 * si el nodo del árbol donde ancla el hallazgo es del TIPO que la gramática
 * de ese lenguaje declara como constructor (`sets.constructorNodes`, derivado
 * por sonda en `code-grammar.ts#CONSTRUCTOR_NODE_WORD`) — **el mismo
 * mecanismo que `composite.ts#esConstructor` ya usa en este mismo
 * directorio**, y el mismo que `code-grammar.test.ts` ya cubre
 * (`sets.constructorNodes.has("constructor_declaration") === true` para
 * Java). La capa por lenguaje TRADUCE (qué nodo es un constructor), no
 * decide.
 *
 * *** POR QUÉ NO PUEDE QUITAR NADA ***
 * Sólo se consulta cuando las dos vías viejas ya dieron `false`, y sólo puede
 * devolver `true`. Ninguna hipótesis que hoy existe puede desaparecer por
 * esto, en ningún lenguaje. Y cuando no hay árbol vivo, o el lugar no se
 * puede ubicar en él, devuelve `false` — nunca "no pude mirar, apruebo"
 * (`no-permissive-required.test.ts`).
 *
 * *** LO QUE NO CAMBIA, A PROPÓSITO ***
 * `ensambla-con-logica` (el `required` Nº3, Ola 12) queda intacto: un
 * constructor de Java que sólo valida y asigna sus campos sigue muriendo ahí,
 * con su razón declarada. Esta vía abre la compuerta Nº2, no la Nº3. Y
 * `locationIsConstructor` (el DISCRIMINADOR `constructor-real`) tampoco se
 * toca: moverlo cambiaría la confianza de hipótesis que YA existen, y este
 * frente es aditivo sobre la CANDIDATURA, no sobre la escalera.
 */
function locationIsGrammarConstructor(loc: RoleLocation, ctx: HypothesisContext): boolean {
  const file = ctx.file;
  if (!file || file.path !== loc.file) return false;
  const fn = findAnchoredFunction(file, loc);
  return fn !== undefined && fn.sets.constructorNodes.has(fn.node.type);
}

function locationLooksLikeConstruction(loc: RoleLocation, ctx: HypothesisContext): boolean {
  const repoFn = findRepoFunction(loc, ctx);
  if (repoFn && (repoFn.metrics.isConstructor || repoFn.metrics.isFactoryLike)) return true;
  if (symbolLooksLikeConstruction(loc.symbol)) return true;
  // OLA AI (AI6) — ver `locationIsGrammarConstructor`, arriba: la tercera vía
  // corre SÓLO cuando las dos de arriba ya dijeron que no, y sólo puede sumar.
  return locationIsGrammarConstructor(loc, ctx);
}

function locationIsConstructor(loc: RoleLocation, ctx: HypothesisContext): boolean {
  const repoFn = findRepoFunction(loc, ctx);
  if (repoFn?.metrics.isConstructor) return true;
  return symbolIsConstructorName(loc.symbol);
}

interface Magnitude {
  label: string;
  value: number;
  strongFloor: number;
}

/** Lee la magnitud relevante del `trigger` del `Finding` ancla — nunca
 *  recalcula nada, sólo lee lo que el detector ya midió. `null` para
 *  cualquier `kind` que no sea uno de los dos anclas de esta hipótesis. */
function primaryMagnitude(finding: Finding): Magnitude | null {
  if (finding.kind === "long-parameter-list") {
    const m = finding.trigger.find((t) => t.label === "parámetros");
    return m ? { label: m.label, value: m.value, strongFloor: BUILDER_STRONG_PARAMS } : null;
  }
  if (finding.kind === "data-clump") {
    const m = finding.trigger.find((t) => t.label === "tamaño del grupo");
    return m ? { label: m.label, value: m.value, strongFloor: BUILDER_STRONG_GROUP } : null;
  }
  // OLA AE (AE4) — rama NUEVA, aditiva: sólo se alcanza con el `kind` nuevo, así
  // que el resultado de esta función para los dos kinds viejos es idéntico al
  // de antes, línea por línea.
  if (finding.kind === OPTIONAL_COMBINATIONS_KIND) {
    const m = finding.trigger.find((t) => t.label === COMBINATIONS_TRIGGER_LABEL);
    return m ? { label: m.label, value: m.value, strongFloor: BUILDER_STRONG_COMBINATIONS } : null;
  }
  return null;
}

/**
 * Ola 12 — REEMPLAZA a `magnitud-suficiente` (retirado, ver el docstring del
 * módulo "EL PISO DE MAGNITUD RETIRADO"): ya no compara contra un piso propio
 * — sólo confirma que el `kind` del hallazgo ancla es uno de los dos que
 * esta hipótesis reconoce, que es lo único que `primaryMagnitude` puede
 * fallar sin inventar un número. La magnitud en sí ya cruzó el piso CITADO
 * del propio detector-ancla antes de que el `Finding` existiera — no hay
 * nada que volver a exigir acá.
 */
const anclaReconocida: Check<Finding, CodeGraph | null> = {
  id: "ancla-reconocida",
  describe: "¿El hallazgo ancla es uno de los dos que esta hipótesis reconoce (long-parameter-list/data-clump)?",
  run: (finding) => {
    const mag = primaryMagnitude(finding);
    return mag
      ? {
          holds: true,
          evidence: `${mag.label}: ${mag.value} (el propio detector-ancla "${finding.kind}" ya exige su piso citado antes de emitir el Finding — nada que este archivo vuelva a exigir).`,
        }
      : { holds: false, evidence: `el hallazgo ancla (kind="${finding.kind}") no es uno de los dos que esta hipótesis reconoce.` };
  },
};

function construyeUnaEntidad(ctx: HypothesisContext): Check<Finding, CodeGraph | null> {
  return {
    id: "construye-una-entidad",
    describe:
      "¿Alguno de los lugares señalados tiene forma de construir UNA entidad — un constructor (por el nombre que el " +
      "lenguaje manda, o por el NODO que su gramática declara constructor: OLA AI/AI6, ver `locationIsGrammarConstructor`) " +
      "o una fábrica con nombre?",
    run: (finding) => {
      const hit = finding.locations.find((loc) => locationLooksLikeConstruction(loc, ctx));
      if (!hit) {
        const names = finding.locations.map((l) => l.symbol ?? "(anónima)").join(", ");
        return {
          holds: false,
          evidence: `ninguno de los lugares señalados (${names}) tiene forma de constructor/fábrica: probablemente son argumentos independientes, no una entidad a construir.`,
        };
      }
      return {
        holds: true,
        evidence: `"${hit.symbol ?? "(anónima)"}" tiene forma de construir una entidad.`,
      };
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════
 * OLA 12 — `ensambla-con-logica`: EL DISCRIMINADOR POR INTENCIÓN.
 * Ver el docstring del módulo, sección "OLA 12", para el razonamiento
 * completo y los 7 casos verificados a mano. Corre sobre `ctx.file` (el
 * árbol vivo — el mismo, único dato real disponible en `build()` para este
 * ancla intra-function/intra-file, ver el límite de cableado documentado
 * más abajo para el excluder estructural de grafo).
 * ═══════════════════════════════════════════════════════════════════════ */

function namedChildren(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c?.isNamed) out.push(c);
  }
  return out;
}

function findDescendant(node: AstNode, pred: (n: AstNode) => boolean, maxDepth = 8): AstNode | null {
  if (pred(node)) return node;
  if (maxDepth <= 0) return null;
  for (const c of namedChildren(node)) {
    const hit = findDescendant(c, pred, maxDepth - 1);
    if (hit) return hit;
  }
  return null;
}

/**
 * Recorre `node` COMPLETO buscando `pred`, pero sin bajar a una función/
 * closure ANIDADA (`sets.functionNodes`) — el MISMO alcance que
 * `code-analyzer.ts#walkFile` usa para atribuir `FunctionMetrics.branches`
 * a un scope (`if (current && spec.branchNodes.has(node.type))
 * current.branches++`, donde `current` es SIEMPRE el tope de la pila de
 * funciones abiertas): lo que pasa dentro de un closure anidado es de ESE
 * closure, nunca del candidato que lo contiene. Verificado contra
 * `facts/units.ts#buildFileUnit` (uno de los 7 casos, ver el docstring del
 * módulo): su `if (!node) throw` vive dentro del callback de `.map`, así que
 * con este alcance NO cuenta para `buildFileUnit` mismo.
 */
function anyInOwnScope(node: AstNode, sets: DerivedNodeSets, pred: (n: AstNode) => boolean): boolean {
  if (pred(node)) return true;
  for (const c of namedChildren(node)) {
    if (sets.functionNodes.has(c.type)) continue;
    if (anyInOwnScope(c, sets, pred)) return true;
  }
  return false;
}

/**
 * Igual que `anyInOwnScope`, pero CUENTA ocurrencias — necesario para "¿arma
 * ≥2 sub-objetos?", donde UNA sola no alcanza (ver el docstring del módulo:
 * indistinguible de un factory-wrapper trivial, "return new T(...)").
 *
 * *** AJUSTE MEDIDO, guardián post-Ola 12 *** (corrida real sobre
 * `corpus/newtonsoft-json`, el segundo corpus que la propia ola dejó sin
 * terminar de verificar — ver la advertencia del resultado de esta tarea):
 * al TOCAR un nodo que ya cuenta como instanciación, esta función DEJA DE
 * BAJAR a sus hijos — un `new` anidado DENTRO de los argumentos de otro
 * `new` (el idiom de Adapter/Wrapper universal, `return new Wrapper(new
 * Inner(args))`) es UNA sola envoltura, no ≥2 sub-objetos independientes, y
 * contarlo como 2 reabre exactamente el falso positivo que este discriminador
 * dice evitar. Verificado contra el caso real: `XmlNodeConverter.cs#
 * CreateXmlDocumentType` (`return new XDocumentTypeWrapper(new
 * XDocumentType(name, publicId, systemId, internalSubset));`) pasaba de 2
 * instanciaciones (falso "arma sub-objetos") a 1 (correctamente "sólo
 * envuelve") con este cambio. Este ajuste (anidamiento dentro de UNA sola
 * instanciación) NO afectaba, por sí solo, al otro caso real medido de guava
 * (`newEntry`, `next == null ? new A(...) : new B(...)`): las dos
 * instanciaciones ahí son HERMANAS bajo el ternario, ninguna anidada dentro
 * de la otra, así que este ajuste puntual no las tocaba — pero eran, desde
 * OTRO ángulo, el MISMO falso positivo "cuenta como ensamblaje" que este
 * discriminador existe para evitar: no anidamiento, sino SELECCIÓN ENTRE
 * RAMAS (se construye UN objeto, eligiendo cuál — Factory Method, no
 * Builder). Corregido en la OLA 14, más abajo (`isPureConstructionChain`):
 * hoy `newEntry` cuenta 1, no 2 — ver el docstring del módulo, sección OLA
 * 14, para el razonamiento completo y el otro caso medido
 * (`ClassPath.ResourceInfo#of`).
 */
function countInOwnScope(node: AstNode, sets: DerivedNodeSets, pred: (n: AstNode) => boolean): number {
  if (pred(node)) return 1; // instanciación encontrada: sus propios argumentos son parte de ESTA construcción, no sub-objetos adicionales — no bajar.
  // OLA 14 — ver `isPureConstructionChain`, definida más abajo (hoisting de
  // `function`, sin problema de orden): un `if`/ternario que SÓLO elige
  // entre construcciones alternativas MUTUAMENTE EXCLUYENTES (nunca las dos
  // a la vez en una misma ejecución) cuenta como UNA sola unidad — nunca N,
  // una por rama — porque sólo UNA construcción de esa cadena corre jamás.
  // El caso medido que este corte arregla: `MapMakerInternalMap#newEntry`
  // (RAICES.md, docstring del módulo sección OLA 14).
  if (isPureConstructionChain(node)) return 1;
  let count = 0;
  for (const c of namedChildren(node)) {
    if (sets.functionNodes.has(c.type)) continue;
    count += countInOwnScope(c, sets, pred);
  }
  return count;
}

/**
 * Instanciación de sub-objetos — duplicado A PROPÓSITO de
 * `proxy.ts#isConstructionLike` (mismo criterio de todo este directorio de
 * hipótesis: cada archivo es autosuficiente, sin depender del interior
 * no-exportado de otro), pero MÁS ESTRICTO en la rama de llamada — ver el
 * ajuste medido abajo. `new X(...)`/`object_creation_expression` (Java/C#),
 * `composite_literal`/`&Type{...}` (Go), `X.new(...)` (Ruby: sufijo `.new`,
 * sin ambigüedad), o un identificador BARE (sin punto) que empieza en
 * mayúscula (`Type(...)` de Python/Go).
 *
 * *** AJUSTE MEDIDO, no hipotético *** (corrida real sobre
 * `Visability/Backend`, este frente): la versión de `proxy.ts` acepta
 * CUALQUIER callee cuyo PRIMER segmento empiece en mayúscula, con o sin
 * punto — correcto para su propio uso (un guard `@campo ||= X.new(...)`, ya
 * acotado a un patrón de asignación perezosa) pero DEMASIADO ancho acá,
 * donde se cuenta CUALQUIER llamada del cuerpo: `Rails.logger.info(...)`/
 * `Rails.logger.error(...)` (Ruby, módulo con mayúscula por CONVENCIÓN,
 * llamando un método de logging, cero instanciación) contaban como 2
 * instanciaciones DISTINTAS y cruzaban el piso de `≥2`, marcando
 * `base_strategy.rb#create_booking` (uno de los 7 casos medidos, ver el
 * docstring del módulo) como "arma sub-objetos" cuando en realidad sólo
 * loguea. La entrada `.new`/`composite_literal`/`new_expression` no tiene
 * este problema (piden una forma exacta); la entrada "bare capitalizado" SÍ
 * lo tenía porque Ruby califica CUALQUIER llamada a un método de módulo con
 * el nombre del módulo (mayúscula) antes del punto — `Type(...)` de
 * Python/Go, en cambio, NUNCA lleva punto. Exigir CERO puntos en esa rama
 * (`!lead.includes(".")`) mantiene el caso real (Python/Go) y elimina el
 * falso: verificado, con este cambio `create_booking` pasa a 0
 * instanciaciones y `ensambla-con-logica` ya no lo confirma por esta vía.
 */
const NEW_EXPR_TYPE = /^(new_expression|object_creation_expression)$/;
const INSTANTIATION_CALL_TYPE = /call/i;

function calleeLeadText(node: AstNode): string {
  const m = /^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/.exec(node.text);
  return m ? m[1]! : "";
}

function isInstantiationLike(node: AstNode): boolean {
  if (NEW_EXPR_TYPE.test(node.type)) return true;
  if (node.type === "composite_literal") return true;
  if (node.type === "unary_expression" && node.text.startsWith("&")) {
    return findDescendant(node, (n) => n.type === "composite_literal", 2) !== null;
  }
  if (INSTANTIATION_CALL_TYPE.test(node.type)) {
    const lead = calleeLeadText(node);
    if (!lead) return false;
    if (/\.new$/.test(lead)) return true;
    return !lead.includes(".") && /^[A-Z]/.test(lead);
  }
  return false;
}

/**
 * Vocabulario de "salto que NO produce el valor de la rama" — duplicado A
 * PROPÓSITO de `detect/intra-function/unreachable-code.ts#JUMP_WORD` (mismo
 * vocabulario de gramática, MENOS `return`: acá `return` SÍ es "esta rama
 * produce el valor elegido", así que queda fuera de esta lista a propósito).
 * `throw`/`raise` tienen nodo de gramática dedicado en JS/TS/Java/C#/Python;
 * Ruby's `raise` NO (es un `call` común, sin tipo de nodo propio — mismo
 * comentario que `unreachable-code.ts`), así que se detecta por el NOMBRE
 * del callee (`RAISE_CALLEE_NAME`, abajo) — vocabulario de la PALABRA CLAVE
 * del lenguaje, la misma categoría permitida que `CONSTRUCTOR_NAMES`.
 */
const NON_VALUE_JUMP_TYPE = /^(throw|raise)(_statement)?$/;
const RAISE_CALLEE_NAME = "raise";

/**
 * *** GUARDIÁN, verificado contra un candidato real *** (corrida real sobre
 * `corpus/sqlalchemy`, `dialects/postgresql/ext.py#AggregateOrderBy.__init__`
 * — Ola 14): `if _lob == 0: raise TypeError(...) elif _lob == 1: self.
 * order_by = coercions.expect(...) else: self.order_by = elements.ClauseList
 * (...)`. Verificado que ESTE candidato sigue confirmando `ensambla-con-
 * logica` correctamente (el `elif`/`else` no reducen a una instanciación
 * pura) — pero `raise TypeError(...)`, aislado, SÍ pela hasta una
 * instanciación (`TypeError(...)` es un `call` bare-capitalizado, la misma
 * convención Python/Go que `isInstantiationLike` reconoce para
 * instanciación sin `new`). Sin este guardián, un `if (cond) return new A()
 * else raise Error(...)` — validar-o-construir, NO selección entre DOS
 * alternativas construidas — se leería como `isPureConstructionChain` por
 * las mismas razones que `newEntry`/`of` SÍ deben leerse así, perdiendo la
 * distinción que esta ola existe para trazar: un `raise`/`throw` es una
 * salida de control, nunca "la alternativa construida" de una selección.
 */
function isNonValueJump(node: AstNode): boolean {
  if (NON_VALUE_JUMP_TYPE.test(node.type)) return true;
  if (INSTANTIATION_CALL_TYPE.test(node.type)) {
    const callee = (node.childForFieldName("method") as AstNode | null) ?? (node.childForFieldName("function") as AstNode | null);
    return callee !== null && callee.type === "identifier" && callee.text === RAISE_CALLEE_NAME;
  }
  return false;
}

/**
 * OLA 14 — EL DISCRIMINADOR "SELECCIÓN ENTRE RAMAS" (RAICES.md, frente
 * "`ensamblaConLogica` acepta selección entre ramas como si fuera
 * ensamblado"; medido primero en "LA TERCERA MEDICIÓN", Ola G). Ver el
 * docstring del módulo, sección OLA 14, para el razonamiento completo y los
 * dos casos medidos de guava.
 *
 * Pela envoltorios de UN SOLO HIJO NOMBRADO (un `return <valor>`, un bloque
 * con una única sentencia, o ambos anidados) hasta encontrar un nodo que
 * cumpla `pred` — o hasta que deja de haber un envoltorio de un solo hijo, O
 * hasta un `throw`/`raise` (`isNonValueJump`: una salida de control nunca es
 * "el valor de esta rama", aunque lo que lance sea, él mismo, una
 * instanciación) — en cualquiera de los dos casos se devuelve el último nodo
 * alcanzado tal cual (sin cumplir `pred`). Genérico a propósito: usado tanto
 * para "¿esta rama, pelada, ES una instanciación?" (`unwrapSoleValue`, abajo,
 * `pred = isInstantiationLike`) como para "¿esta rama, pelada, ES un
 * `if`/ternario anidado?" (`isPureConstructionChain`, para el `else { if
 * (...) ... }` que un `else if` real a veces envuelve en un bloque de por
 * medio). Nunca desciende a los ARGUMENTOS de un nodo que ya cumple `pred`
 * — corta el bucle de inmediato, el mismo límite que `countInOwnScope` ya
 * respeta para instanciaciones. Tope de 6 iteraciones: ninguna gramática
 * soportada anida return→bloque→if/return más profundo para esta pregunta
 * puntual.
 */
function peelSoleChild(node: AstNode, pred: (n: AstNode) => boolean, maxDepth = 6): AstNode {
  let current = node;
  for (let guard = 0; guard < maxDepth; guard++) {
    if (pred(current)) return current;
    if (isNonValueJump(current)) return current;
    const children = namedChildren(current);
    if (children.length !== 1) return current;
    current = children[0]!;
  }
  return current;
}

/** `peelSoleChild` especializado en instanciaciones — ver su docstring. */
function unwrapSoleValue(node: AstNode): AstNode {
  return peelSoleChild(node, isInstantiationLike);
}

/**
 * ¿El CONTENIDO ÍNTEGRO de esta rama (tras pelar `return`/bloque-de-una-
 * sentencia con `unwrapSoleValue`) es UNA instanciación, sin ninguna otra
 * sentencia ni lógica adicional? La pregunta base de "selección entre
 * ramas": una rama que sólo construye-y-devuelve.
 */
function isSoleConstructionValue(node: AstNode): boolean {
  return isInstantiationLike(unwrapSoleValue(node));
}

/**
 * ¿`node` tiene la FORMA de dos ramas mutuamente excluyentes — `if`/`else` O
 * ternario, da igual el nombre del tipo de nodo — de las que sólo UNA corre
 * en cualquier ejecución dada? 100% estructural, mismo mecanismo que
 * `code-grammar.ts#isIfLike` (`condition`+`alternative`), con `consequence`
 * sumado para poder EXTRAER las dos ramas — el mismo trío de campos que el
 * propio `code-grammar.ts` ya usa (su recorrido `bodyTargetParents` lee
 * `body`/`consequence`; su `isIfLike` lee `condition`/`alternative`) y que
 * el ternario de Java/C#/TS/Ruby comparte estructuralmente con el `if`
 * (confirmado en `code-grammar.ts`, comentario de `TERNARY_NAME`). Límite ya
 * documentado ahí, no uno nuevo: Python's `conditional_expression` no
 * expone estos campos, así que un ternario Python queda fuera de este
 * discriminador — el mismo hueco que `code-grammar.ts` ya declara, nunca uno
 * escondido acá.
 */
function twoWayBranchFields(node: AstNode): { consequence: AstNode; alternative: AstNode } | null {
  if (!node.childForFieldName("condition")) return null;
  const consequence = node.childForFieldName("consequence") as AstNode | null;
  const alternative = node.childForFieldName("alternative") as AstNode | null;
  if (!consequence || !alternative) return null;
  return { consequence, alternative };
}

/**
 * *** EL DISCRIMINADOR — OLA 14 *** ¿Es `node` — o la cadena que cuelga de
 * su `alternative` (un `if`/`elsif`/`else` o un ternario anidado) —
 * PURAMENTE una selección entre construcciones alternativas, mutuamente
 * excluyentes, SIN ninguna otra lógica? Recursivo: la rama `consequence` de
 * CADA nivel debe ser sólo-construcción (`isSoleConstructionValue`); la rama
 * `alternative` debe ser sólo-construcción O, recursivamente, otro nivel
 * igual de puro (el `else if`/ternario anidado de una cadena de 3+
 * alternativas — `ClassPath.ResourceInfo#of` es de 2, pero la recursión no
 * depende de eso).
 *
 * Verificado a mano contra los dos casos medidos de guava (RAICES.md,
 * docstring del módulo sección OLA 14):
 *   - `MapMakerInternalMap#newEntry`, ternario `next == null ? new
 *     StrongKeyStrongValueEntry(...) : new LinkedStrongKeyStrongValueEntry(
 *     ...)`: el propio nodo ternario cumple directo — sus dos ramas SON, ya,
 *     cada una una instanciación pura, sin envoltorio.
 *   - `ClassPath.ResourceInfo#of`, `if (…endsWith(".class")) return new
 *     ClassInfo(...) else return new ResourceInfo(...)`: cada rama, tras
 *     pelar el `return`, es una instanciación pura.
 * En AMBOS casos: `true` — selección entre ramas, no ensamblaje.
 *
 * `peelSoleChild` entra ANTES de buscar la forma de dos ramas en
 * `alternative`: una cadena `if/elsif/else` real puede tener su
 * `alternative` apuntando DIRECTO al `if` anidado (la mayoría de las
 * gramáticas soportadas) o envuelto en un bloque (`else { if (...) ... }`,
 * semánticamente idéntico) — sin este paso, la segunda forma se leería como
 * "no es una construcción pura ni una rama de dos", perdiendo cadenas de
 * 3+ alternativas puramente constructivas.
 */
function isPureConstructionChain(node: AstNode): boolean {
  if (isSoleConstructionValue(node)) return true;
  const branchNode = peelSoleChild(node, (n) => twoWayBranchFields(n) !== null);
  const branch = twoWayBranchFields(branchNode);
  if (!branch) return false;
  return isSoleConstructionValue(branch.consequence) && isPureConstructionChain(branch.alternative);
}

/**
 * Reemplaza, para la señal (a) de `ensamblaConLogica`, el chequeo viejo
 * "¿hay ALGÚN `chainNodes` en el cuerpo?" — que contaba un `if`/`else` de
 * SELECCIÓN ENTRE RAMAS como si fuera "validación/ensamblado incremental
 * entre pasos" (el defecto medido de esta ola: `ClassPath.ResourceInfo#of`
 * lo confirmaba por esta vía). Mismo alcance propio que
 * `anyInOwnScope`/`countInOwnScope` (nunca baja a una función/closure
 * anidada) y, para cada `chainNodes` encontrado, descarta los que son
 * PURAMENTE una selección entre construcciones alternativas
 * (`isPureConstructionChain`) — sin bajar más adentro de uno de ésos: sus
 * dos ramas ya quedan agotadas por la propia recursión de
 * `isPureConstructionChain` (cada rama es, o una construcción pura, o otro
 * nivel de la MISMA cadena — nunca lógica adicional escondida, porque
 * `isSoleConstructionValue` exige que la rama entera, sin nada más, se pele
 * hasta una instanciación).
 *
 * NO toca el otro defecto medido en "LA TERCERA MEDICIÓN" (Ola G) —
 * `chainNodes` también confirma sobre guardas de validación aisladas
 * (`click CliRunner.__init__`, dos `if …: raise ValueError` sobre un
 * argumento cada una) — deliberadamente: es una causa DISTINTA ("¿esta rama
 * construye algo, lo que sea?" vs "¿construye eligiendo entre alternativas
 * excluyentes?"), fuera del frente asignado a esta ola (RAICES.md), y se
 * declara acá para no esconderla, no para arreglarla de paso.
 */
function hasGenuineChainLogic(node: AstNode, sets: DerivedNodeSets, paramNames: ReadonlySet<string>): boolean {
  if (sets.chainNodes.has(node.type)) {
    if (isPureConstructionChain(node)) return false; // OLA 14, intacto
    if (chainOnlyInvokes(node, sets)) return false; // OLA AM · AM3 · C9
    return true;
  }
  for (const c of namedChildren(node)) {
    if (sets.functionNodes.has(c.type)) continue;
    if (hasGenuineChainLogic(c, sets, paramNames)) return true;
  }
  return false;
}

/* ═══════════════════════════════════════════════════════════════════════
 * OLA AM · FRENTE AM3 — LOS DOS DISCRIMINADORES DE FORMA SOBRE LA SEÑAL (a)
 *
 * Ninguno pregunta por la INTENCIÓN del patrón (lo que la Ola AK midió que más
 * verdaderas mata): los dos preguntan por la FORMA del nodo, y los dos se
 * midieron contra el BANCO ENTERO de la celda —98 recomendaciones juzgadas de
 * `Builder`, 7 verdaderas / 69 falsas / 15 `problema-si-patrón-no`, en las DOS
 * poblaciones— ANTES de aterrizar. Los dos tocan **CERO verdaderas**. La tabla
 * completa de los NUEVE candidatos evaluados —siete descartados por tocar una
 * verdadera— está en `ola-am/informes/AM3.md`.
 * ═══════════════════════════════════════════════════════════════════════ */

/** Recorrido con el MISMO alcance propio que `anyInOwnScope`/`countInOwnScope`
 *  (nunca baja a una función/closure anidada), pero visitando TODO el subárbol
 *  en vez de cortar en el primer acierto. */
function forEachInOwnScope(node: AstNode, sets: DerivedNodeSets, visit: (n: AstNode) => void): void {
  visit(node);
  for (const c of namedChildren(node)) {
    if (sets.functionNodes.has(c.type)) continue;
    forEachInOwnScope(c, sets, visit);
  }
}

/**
 * Vocabulario de gramática de "esto ESCRIBE algo" — duplicado a propósito, como
 * todo este directorio. NO es una lista de tipos de nodo: es una forma de la
 * PALABRA de gramática (`…assignment…` / `…declaration…` / `…declarator…`), y
 * por eso cubre las veinte variantes que las nueve gramáticas del corpus usan
 * para lo mismo, sin nombrar ni un lenguaje.
 *
 * *** POR QUÉ NO ES UNA LISTA, Y ESTÁ MEDIDO ***: la primera versión de este
 * frente enumeraba seis tipos (`assignment`, `assignment_expression`,
 * `augmented_assignment`, `short_var_declaration`, `var_declaration`,
 * `operator_assignment`) y con eso `chainOnlyInvokes` apagaba 8 recomendaciones
 * en vez de 6. Barriendo el corpus entero (`scripts/am3-sonda-guarda.mts`, las
 * 3.529 ubicaciones de las dos anclas) aparecen **veinte** tipos de nodo con
 * `assign`/`declar` en el nombre: `assignment_statement` (Go),
 * `lexical_declaration`/`variable_declarator` (JS/TS),
 * `local_variable_declaration` (Java), `local_declaration_statement`/
 * `declaration_expression`/`declaration_pattern`/`catch_declaration` (C#),
 * `augmented_assignment_expression`, `left_assignment_list`/
 * `right_assignment_list` (Ruby), `object_assignment_pattern`… **Las dos
 * recomendaciones de diferencia eran la lista incompleta, no una forma del
 * código** (`hugo newImportResolver`, cuyo `imp.importContext = …` es un
 * `assignment_statement` de Go, y `Ghost page.js:6`, cuyo `const saveRevision =
 * …` es un `lexical_declaration`) — la misma trampa que el frente AL2 dejó
 * escrita, encontrada por segunda vez en este mismo frente.
 *
 * Se excluyen los nodos que las propias `DerivedNodeSets` ya clasifican como
 * función o como clase (`function_declaration`, `class_declaration`,
 * `method_declaration`…): declarar una función no es escribir un campo.
 */
const WRITE_LIKE_WORD = /(^|_)(assignment|declaration|declarator)(_|$)/;

function isWriteLike(node: AstNode, sets: DerivedNodeSets): boolean {
  if (!WRITE_LIKE_WORD.test(node.type)) return false;
  return !sets.functionNodes.has(node.type) && !sets.classNodes.has(node.type);
}

/**
 * *** C9 — "REENVIAR NO ES ENSAMBLAR" ***
 *
 * QUÉ RECONOCE (forma): una cadena (`if`/`elsif`/`case`) cuyo subárbol propio
 * contiene AL MENOS una llamada y NINGUNA asignación NI ninguna instanciación.
 * QUÉ NO reconoce: una cadena con cualquier asignación (`self.x = …`,
 * `cursor = …`, `kwargs["length"] = …`) o con cualquier instanciación
 * (`new X(...)`, `X.new(...)`, `&T{…}`, `Type(...)`) en alguna de sus ramas.
 *
 * POR QUÉ (la fuerza, no un síntoma): el propio docstring de este módulo define
 * el caso donde Builder NO va como *"una cadena de forwarding"* — un cuerpo que
 * despacha a la capa siguiente sin acumular nada. "Ensamblado/validación
 * incremental ENTRE PASOS" exige que la etapa DEJE algo escrito; una rama que
 * sólo invoca no acumula estado y no crea ninguna etapa intermedia válida.
 *
 * NINGÚN NÚMERO NUEVO. No hay umbral: es una forma.
 *
 * MEDIDO CONTRA EL BANCO ENTERO (98 recomendaciones juzgadas de `Builder` en las
 * dos poblaciones): apaga **6 recomendaciones juzgadas — 1 FALSA en bibliotecas
 * (`sqlalchemy orm/exc.py:180`) y 5 FALSAS en aplicaciones (`Ghost
 * buildIncludeURL` ×2, `gitea CreateIssueComment` ×2, `gitea CreateArchive`) — y
 * CERO verdaderas y CERO `problema-si-patrón-no` en las dos poblaciones.** Toca
 * 3 repos de 2 poblaciones: no es el hallazgo de un solo repo.
 */
function chainOnlyInvokes(node: AstNode, sets: DerivedNodeSets): boolean {
  let invokes = false;
  let writes = false;
  forEachInOwnScope(node, sets, (n) => {
    if (isWriteLike(n, sets) || isInstantiationLike(n)) writes = true;
    else if (INSTANTIATION_CALL_TYPE.test(n.type)) invokes = true;
  });
  return invokes && !writes;
}

/* *** C4 — "LA DECISIÓN TIENE QUE SER SOBRE LO QUE SE RECIBE": MEDIDO Y DESCARTADO ***
 *
 * El segundo candidato de forma de este frente preguntaba si la CONDICIÓN de la
 * cadena nombra al menos un parámetro propio de la función señalada — la idea
 * era que la "validación incremental entre pasos" de Builder decide a partir de
 * lo que el llamador entrega. Contra el banco entero tocaba **CERO verdaderas** y
 * apagaba 5 recomendaciones juzgadas (1 falsa en bibliotecas, 3 falsas y 1
 * `problema-si-patrón-no` en aplicaciones). **No se aterrizó, y la razón es la
 * regla de esta ola, no el número:** hacía fallar **32 de las 73 aserciones de
 * `builder.test.ts`, empezando por el fixture CANÓNICO de la Ola 12**
 * (`conditionalBodySpec`, `if (flag) this.x = a else this.x = b`) — es decir,
 * contradice la forma que este mismo módulo declara como EL caso de Builder. Para
 * aterrizarlo había que reescribir esas 32 aserciones, y aflojar una aserción
 * para que pase un cambio está prohibido. Queda publicado con su número en
 * `ola-am/informes/AM3.md` §candidatos, junto con el dato que lo desarma solo:
 * con el lector de parámetros VIEJO apagaba 9 y **4 de esas 9 eran el lector
 * fallando en Python, no una forma del código**.
 */

/** Nombre de UN parámetro — misma técnica genérica (campos `name`/`pattern`/
 *  `left`, o único hijo nombrado) que `data-clump.ts#paramName`/
 *  `decorator.ts#paramNameOf` ya usan; duplicada acá a propósito. */
function paramNameOf(node: AstNode): string | null {
  if (node.type === "identifier") return node.text.trim() || null;
  const named =
    (node.childForFieldName("name") as AstNode | null) ??
    (node.childForFieldName("pattern") as AstNode | null) ??
    (node.childForFieldName("left") as AstNode | null);
  if (named) return paramNameOf(named);
  for (const c of namedChildren(node)) if (c.type === "identifier") return c.text;
  return null;
}

/**
 * *** OLA AM · FRENTE AM3 — UNA COMPUERTA IMPOSIBLE POR CONSTRUCCIÓN, MEDIDA ANTES DE TOCAR NADA ***
 *
 * `paramNameOf` (arriba, INTACTO) resuelve un parámetro por su campo `name`/
 * `pattern`/`left`, o por su ÚNICO hijo nombrado. Una gramática que declara el
 * TIPO como un segundo hijo nombrado —`typed_parameter` de Python
 * (`fn: _ListenerFnType`), o una declaración de Go con varios nombres por tipo—
 * deja DOS hijos nombrados y `paramNameOf` devuelve `null`: **para una función
 * de Python con parámetros anotados el conjunto queda VACÍO, y
 * `callsOwnParamAsCallback` (abajo) corta de entrada con `paramNames.size === 0`
 * — no puede dar `true` NUNCA.** No es un umbral mal puesto: es una prueba que
 * la gramática hace imposible de pasar para un subconjunto identificable de la
 * entrada — el mismo tipo de defecto que la Ola AH encontró en
 * `extract-method.ts`.
 *
 * *** ESTRICTAMENTE ADITIVO, Y MEDIDO: NO PUEDE QUITAR NADA. *** `usesBlockDsl`
 * es una de las TRES señales OR-eadas de `assemblySignalFor`; leer MÁS nombres
 * de parámetro sólo puede hacer que `callsOwnParamAsCallback` confirme donde
 * antes no confirmaba. Medido sobre las **3.529 ubicaciones** de las dos anclas
 * de este archivo en los 21 repos (`scripts/am3-sonda-guarda.mts`): la mediana
 * de parámetros leídos en `.py` pasa de 6 a 7 (en las otras nueve extensiones no
 * se mueve) y **4 ubicaciones — 2 únicas, las dos en un solo repo** — pasan de
 * "no confirma ensamblaje" a "confirma por DSL". Las dos mueren igual en
 * `construye-una-entidad`, así que el delta de hipótesis emitidas es **CERO**.
 * Se aterriza igual, con el delta CERO declarado, porque la compuerta imposible
 * es real y porque fue el instrumento que desarmó el candidato C4 de este frente
 * (ver su bloque más abajo): con el lector VIEJO, C4 apagaba 9 recomendaciones y
 * **4 de esas 9 eran el lector fallando en Python, no una forma del código** — la
 * trampa exacta que el frente AL2 dejó escrita ("contabilidad del banco, no
 * señal"). Un chequeo de forma que dependa de leer parámetros no puede medirse
 * hasta que esta reparación exista.
 */
function functionParamNames(fnNode: AstNode): ReadonlySet<string> {
  const names = new Set<string>();
  const paramList = (fnNode.childForFieldName("parameters") as AstNode | null) ?? (fnNode.childForFieldName("parameter_list") as AstNode | null);
  if (paramList) {
    for (const child of namedChildren(paramList)) {
      const name = paramNameOf(child);
      if (name) {
        names.add(name);
        continue;
      }
      // La gramática declaró el tipo aparte: los identificadores de este nodo de
      // parámetro que NO son su campo `type` son los nombres. Genérico — sólo se
      // nombran campos de gramática (`type`) y el tipo de nodo `identifier`, que
      // las nueve gramáticas comparten; ningún lenguaje se menciona.
      for (const part of namedChildren(child)) {
        // Sólo el tipo de nodo `identifier` desnudo. El nodo del TIPO nunca lo
        // es en las gramáticas soportadas (`type` en Python, `type_identifier`/
        // `pointer_type`/`slice_type` en Go), así que esta condición separa
        // nombre de tipo sin comparar contra ninguna tabla de lenguaje.
        if (part.type !== "identifier") continue;
        const text = part.text.trim();
        if (text) names.add(text);
      }
    }
  }
  return names;
}

/**
 * DSL con bloques: Ruby `yield`, o una llamada cuyo callee es DIRECTAMENTE
 * uno de los parámetros propios (invocado como función/callback contra el
 * objeto en construcción) — nunca una llamada A UN MÉTODO de un parámetro
 * (`param.metodo()`, que es sólo composición normal con un colaborador, no
 * un DSL de configuración).
 */
function callsOwnParamAsCallback(node: AstNode, paramNames: ReadonlySet<string>): boolean {
  if (paramNames.size === 0 || !INSTANTIATION_CALL_TYPE.test(node.type)) return false;
  const callee = (node.childForFieldName("function") as AstNode | null) ?? (node.childForFieldName("method") as AstNode | null);
  return callee !== null && callee.type === "identifier" && paramNames.has(callee.text);
}

const YIELD_NODE_TYPE = /^yield$/;

function usesBlockDsl(node: AstNode, sets: DerivedNodeSets, paramNames: ReadonlySet<string>): boolean {
  return anyInOwnScope(node, sets, (n) => YIELD_NODE_TYPE.test(n.type) || callsOwnParamAsCallback(n, paramNames));
}

interface AssemblySignal {
  readonly holds: boolean;
  readonly why: string;
}

function findAnchoredFunction(file: FileUnit, loc: RoleLocation): FileUnit["functions"][number] | undefined {
  return file.functions.find((fn) => fn.file === loc.file && fn.startLine === loc.startLine && fn.endLine === loc.endLine);
}

/**
 * Las tres señales de "SÍ hay lógica de ensamblaje" para UN lugar señalado
 * — ver el docstring del módulo. `null` cuando este lugar ni siquiera se
 * pudo ubicar en el árbol vivo (símbolo/línea desalineados, o de otro
 * archivo) — distinto de "se ubicó y no mostró ensamblaje" (`holds: false`).
 */
function assemblySignalFor(loc: RoleLocation, file: FileUnit): AssemblySignal | null {
  const fn = findAnchoredFunction(file, loc);
  if (!fn) return null;
  const sets = fn.sets;
  const body = (fn.node.childForFieldName("body") as AstNode | null) ?? fn.node;
  const label = fn.name ?? "(anónima)";
  // OLA AM (AM3): los nombres de parámetro se resuelven UNA vez y los usan las
  // dos señales que los necesitan — `chainConditionNamesOwnParam` (señal a) y
  // `usesBlockDsl` (señal c). Antes se resolvían sólo para la tercera.
  const paramNames = functionParamNames(fn.node);

  // OLA 14 — `hasGenuineChainLogic` reemplaza el chequeo viejo (¿hay ALGÚN
  // chainNodes en el cuerpo?): ver su docstring, más abajo, para por qué un
  // `if`/`else` que sólo ELIGE entre construcciones alternativas mutuamente
  // excluyentes (selección entre ramas, Factory Method) ya NO cuenta como
  // "validación/ensamblado incremental entre pasos".
  // OLA AM (AM3) — y por qué una cadena que SÓLO INVOCA (`chainOnlyInvokes`) o
  // cuya condición no nombra ningún parámetro propio
  // (`chainConditionNamesOwnParam`) tampoco cuenta.
  if (hasGenuineChainLogic(body, sets, paramNames)) {
    return {
      holds: true,
      why: `"${label}" tiene lógica condicional propia (if/case) dentro de su construcción: decide qué o cómo se ensambla — validación/ensamblado incremental entre pasos, no sólo asignación.`,
    };
  }

  const instantiations = countInOwnScope(body, sets, isInstantiationLike);
  if (instantiations >= 2) {
    return {
      holds: true,
      why: `"${label}" instancia ${instantiations} sub-objetos/colaboradores distintos dentro de su propio cuerpo: ensamblado no trivial, no sólo asignación/reenvío.`,
    };
  }

  if (usesBlockDsl(body, sets, paramNames)) {
    return {
      holds: true,
      why: `"${label}" ejecuta un bloque/callback recibido como parámetro contra el objeto en construcción: DSL interno con bloques.`,
    };
  }

  return {
    holds: false,
    why: `"${label}": su cuerpo, hasta donde el árbol vivo permite verlo, no muestra lógica de ensamblaje propia — sin condicionales que decidan la construcción, sin ≥2 sub-objetos propios, sin bloque/DSL. Sólo asigna o reenvía sus propios parámetros: el remedio nativo del lenguaje (kwargs/record/Parameter Object) alcanza.`,
  };
}

/**
 * *** EL CRITERIO — Ola 12/13, SIN texto de remedio *** (ver el docstring
 * del módulo, sección "OLA 13" más abajo, para la separación completa
 * criterio/texto). Un ÚNICO lugar que particiona la MISMA evidencia
 * estructural en tres resultados — nunca dos preguntas independientes que
 * podrían desalinearse entre sí:
 *   - `shows-assembly`: al menos un lugar señalado muestra alguna de las
 *     tres señales de ensamblaje real (`assemblySignalFor` arriba).
 *   - `confirmed-only-assigns`: TODOS los lugares señalados SE PUDIERON
 *     UBICAR en el árbol vivo y NINGUNO mostró ensamblaje — evidencia
 *     POSITIVA de "sólo asigna/reenvía", no un default.
 *   - `unknown`: sin árbol vivo, o ningún lugar señalado se pudo ubicar en
 *     él — NI evidencia de ensamblaje NI evidencia de "sólo asigna": no se
 *     sabe, y ninguna de las dos ramas (`ensamblaConLogica` NI
 *     `soloAsignaOReenvia`, más abajo) debe leer esto como una confirmación
 *     de lo suyo. Ésta es la garantía que hace que la rama negativa sea "tan
 *     exigente como la positiva" (RAICES.md, condición no negociable #1):
 *     ninguna de las dos ramas gana por ausencia de evidencia.
 */
type AssemblyVerdict =
  | { readonly kind: "shows-assembly"; readonly evidence: string }
  | { readonly kind: "confirmed-only-assigns"; readonly evidence: string }
  | { readonly kind: "unknown"; readonly evidence: string };

function assemblyVerdict(finding: Finding, ctx: HypothesisContext): AssemblyVerdict {
  const file = ctx.file;
  if (!file) {
    return {
      kind: "unknown",
      evidence:
        "no se pudo verificar: el árbol de este archivo no está vivo en esta corrida (en producción esto NUNCA pasa para este ancla — intra-function/intra-file, ver el docstring del módulo). Sin árbol no hay forma de confirmar ensamblaje real NI de confirmar que sólo asigna — ninguna de las dos ramas del check de intención gana por esta ausencia.",
    };
  }
  const signals = finding.locations.map((loc) => assemblySignalFor(loc, file)).filter((s): s is AssemblySignal => s !== null);
  const hit = signals.find((s) => s.holds);
  if (hit) return { kind: "shows-assembly", evidence: hit.why };
  if (signals.length > 0) return { kind: "confirmed-only-assigns", evidence: signals[0]!.why };
  return {
    kind: "unknown",
    evidence:
      "ninguno de los lugares señalados se pudo ubicar en el árbol vivo de este archivo (símbolo/línea desalineados): sin cuerpo que inspeccionar, no se confirma ensamblaje real NI que sólo asigna.",
  };
}

/* ═══════════════════════════════════════════════════════════════════════
 * OLA AP · FRENTE AP4 — LA CUARTA SEÑAL DE ENSAMBLAJE: **CONSTRUCCIÓN
 * SOBRECARGADA** (el "constructor telescópico" de refactoring.guru
 * §Applicability-1 — LA MISMA FUENTE QUE ESTE MÓDULO YA CITA para Builder,
 * ver `SOURCE`).
 *
 * *** EL DEFECTO QUE ARREGLA, MEDIDO ANTES DE ESCRIBIR UNA LÍNEA ***
 * `ensambla-con-logica` pregunta por lógica de ensamblaje **en el CUERPO de
 * la función anclada**: condicionales que deciden la construcción, ≥2
 * sub-objetos propios, o un bloque/DSL. Para un constructor SOBRECARGADO
 * —una de varias puertas de construcción del mismo tipo, cuyo trabajo es
 * justamente completar valores por defecto y reenviar a otra puerta— **el
 * cuerpo está VACÍO o sólo asigna, POR CONSTRUCCIÓN**: un cuerpo vacío no
 * puede tener ramas, ni dos instanciaciones, ni un bloque. No es un umbral
 * mal puesto: es una prueba que la gramática del caso hace imposible de
 * pasar, la misma forma exacta que la Ola AH encontró en
 * `extract-method.ts#variosPasosSeparados` (un `required` que un subconjunto
 * identificable de su entrada no puede satisfacer nunca).
 *
 * MEDIDO con la traza de producción sobre el árbol congelado de esta ola
 * (`scratchpad-ap4/emb0`, los 21 repos): en `guava`, **166 de 200**
 * candidatos de `long-parameter-list` mueren EN ESTA COMPUERTA (83 %) —
 * después de que la Ola AI/AI6 abriera la compuerta anterior
 * (`construye-una-entidad`) para los constructores de Java/C#, que se
 * llaman como su clase. La cola entera se corrió a la compuerta 3.
 * El caso testigo, con archivo y línea:
 * `corpus-app/ShareX/ShareX.ImageEditor/Presentation/Effects/
 * EffectDefinition.cs:58` — un constructor de 10 parámetros cuyo cuerpo es
 * un `block` VACÍO porque delega en el otro constructor del mismo tipo
 * (`constructor_initializer`), mientras que **el otro constructor del MISMO
 * tipo, `:83`, ya está juzgado `verdadero` para Builder** (`ola-aj/AJ1.json`).
 * La única diferencia entre los dos es CUÁL de las dos puertas escribió el
 * cuerpo.
 *
 * *** LA FUERZA, no el síntoma ***
 * Lo que Builder resuelve acá no es "una firma con muchos parámetros" —para
 * eso alcanza un Parameter Object, y este módulo ya lo dice en su
 * `cost`— sino que **el cliente tenga que ELEGIR entre varias puertas de
 * construcción del mismo tipo y pasar los valores por posición**. Un
 * Parameter Object NO resuelve eso: un objeto de 10 campos sigue exigiendo
 * las mismas combinaciones. Es la Applicability-1 textual de la fuente que
 * este archivo ya cita.
 *
 * *** LA ESCALA, escrita ANTES de medir precisión ***
 * **≥2 puertas PESADAS**: el tipo declarante tiene ≥2 constructores y **al
 * menos DOS de ellos cruzan el piso CITADO del propio detector-ancla**
 * (`long-parameter-list`, `citado(6, …)` — RuboCop 5 / SonarQube 7). **Ni un
 * número nuevo**: el piso se LEE del `Measurement` que el propio `Finding`
 * trae (`trigger[].threshold.value`), así que si el detector mueve su piso,
 * esta señal lo sigue sola.
 * POR QUÉ DOS PESADAS Y NO "≥2 constructores": un constructor por defecto sin
 * parámetros junto a uno pesado NO es un telescopio — hay UNA sola puerta
 * real, y el modismo nativo (inicializador de objeto en C#, `kwargs` en
 * Python, argumentos con nombre) alcanza. Verificado sobre el caso real que
 * este corte deja AFUERA: `ShareX.ImageEditor/Core/ImageEffects/Filters/
 * GlowImageEffect.cs:56/:60` (un `()` y un `(6 parámetros)`, con todas las
 * propiedades públicas y con `set`: el inicializador de objeto ya lo cubre).
 *
 * *** RESOLUCIÓN VERIFICADA ***
 * `appliedState` no se toca: si el Builder YA existe (cadena fluida, tipo
 * Builder en el grafo), el estado sigue saliendo `ya-aplicado`/`parcial`
 * exactamente como hoy. Esta señal decide CANDIDATURA, nunca estado.
 *
 * *** POR QUÉ NO PUEDE QUITAR NADA ***
 * Se consulta SÓLO cuando `assemblyVerdict` ya devolvió algo distinto de
 * `shows-assembly`, y sólo puede devolver evidencia POSITIVA. Ninguna
 * hipótesis que hoy existe puede desaparecer por esto. Y NO toca
 * `assemblyVerdict` ni `soloAsignaOReenvia` (la rama negativa de la Ola 13):
 * ésos siguen leyendo exactamente las mismas tres señales de cuerpo de
 * antes. Cuando no hay árbol vivo, o el lugar no se ubica en él, devuelve
 * `null` — nunca "no pude mirar, apruebo" (`no-permissive-required.test.ts`).
 *
 * *** GENERICIDAD ***
 * Cero léxico de dominio y cero nombre de lenguaje. "Es un constructor" se
 * pregunta con `sets.constructorNodes` (el mecanismo B de
 * `code-grammar.ts#CONSTRUCTOR_NODE_WORD`, el MISMO que
 * `locationIsGrammarConstructor` ya usa en producción desde la Ola AI) o con
 * `CONSTRUCTOR_NAMES` (el mecanismo A, ya importado acá). "De qué tipo es"
 * se lee de `FunctionUnit.symbolPath` — el camino de unidades nombradas que
 * `facts/units.ts` ya arma para todas las gramáticas. Una gramática sin
 * sobrecarga de constructores (Python, Ruby, Go, JS/TS/Vue) nunca junta dos
 * puertas bajo el mismo tipo, así que esta señal no dispara ahí sola, sin
 * una sola comparación contra un nombre de lenguaje.
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * ¿Esta unidad de función es una PUERTA DE CONSTRUCCIÓN DECLARADA POR LA
 * GRAMÁTICA? SÓLO el mecanismo B de `code-grammar.ts#CONSTRUCTOR_NODE_WORD`
 * (`sets.constructorNodes`), NUNCA el mecanismo A (`CONSTRUCTOR_NAMES`), y la
 * razón está VERIFICADA CONTRA CÓDIGO REAL antes de medir precisión:
 *
 * Una gramática que declara el constructor como una REGLA PROPIA es una
 * gramática donde el mismo tipo puede declarar VARIAS puertas y el cliente
 * tiene que elegir. Donde el constructor es una función común bajo un nombre
 * mandado (mecanismo A), el lenguaje admite EXACTAMENTE UNA: dos ocurrencias
 * bajo el mismo tipo no son una elección del cliente sino **stubs de tipado**
 * — el caso medido: `corpus/sqlalchemy/lib/sqlalchemy/sql/schema.py:562/585`
 * son dos `@overload def __init__` sin cuerpo ejecutable (`-> None: ...`) y
 * `:617` es el único `__init__` real. `detect/intra-file/data-clump.ts` ya
 * documenta exactamente esa trampa ("Python EXIGE repetir la firma completa
 * por cada overload"); esta señal la evita preguntándole a la gramática, sin
 * nombrar un solo lenguaje.
 *
 * Medido sobre los 21 repos (`scratchpad-ap4/sonda`): con el mecanismo A
 * incluido, los ÚNICOS grupos de biblioteca con ≥2 puertas pesadas son
 * CUATRO de `sqlalchemy` y los cuatro son stubs `@overload`.
 */
function unitIsConstructor(fn: FileUnit["functions"][number]): boolean {
  return fn.sets.constructorNodes.has(fn.node.type);
}

/** El TIPO que declara esta función: el `symbolPath` sin su último segmento.
 *  `null` para una función de nivel superior (no hay tipo que sobrecargar). */
function declaringTypeKey(fn: FileUnit["functions"][number]): string | null {
  if (fn.symbolPath.length < 2) return null;
  return fn.symbolPath.slice(0, -1).join("\u0000");
}

/** El piso CITADO del propio detector-ancla, leído del `Finding` — nunca un
 *  número escrito acá. `null` para cualquier ancla que no mida parámetros
 *  (la fuerza de esta señal es la ARIDAD de la puerta de construcción, que es
 *  exactamente lo que `long-parameter-list` mide). */
function anchorParameterFloor(finding: Finding): number | null {
  if (finding.kind !== "long-parameter-list") return null;
  const m = finding.trigger.find((t) => t.label === "parámetros");
  return m ? m.threshold.value : null;
}

/** La cuarta señal. `null` = no aplica o no se pudo mirar; un texto = evidencia POSITIVA. */
function overloadedConstructionEvidence(finding: Finding, ctx: HypothesisContext): string | null {
  const file = ctx.file;
  if (!file) return null;
  const floor = anchorParameterFloor(finding);
  if (floor === null) return null;
  for (const loc of finding.locations) {
    if (loc.file !== file.path) continue;
    const fn = findAnchoredFunction(file, loc);
    if (!fn || !unitIsConstructor(fn)) continue;
    const owner = declaringTypeKey(fn);
    if (owner === null) continue;
    const puertasPesadas = file.functions.filter((otra) => unitIsConstructor(otra) && declaringTypeKey(otra) === owner && otra.metrics.parameters >= floor);
    if (puertasPesadas.length < 2) continue;
    const detalle = puertasPesadas.map((p) => `${p.name ?? "(anónima)"}@${p.startLine} (${p.metrics.parameters} parámetros)`).join(", ");
    return (
      `"${fn.name ?? "(anónima)"}" es UNA de las ${puertasPesadas.length} puertas de construcción PESADAS que "${fn.symbolPath.slice(0, -1).join(".")}" ofrece — ` +
      `${detalle}, todas por encima del piso citado del propio detector-ancla (${floor}). El cliente tiene que ELEGIR una puerta y pasar los valores ` +
      `por posición: es el constructor telescópico que Builder resuelve (refactoring.guru §Applicability-1), y un objeto de parámetros NO lo resuelve ` +
      `— un objeto con esos campos sigue exigiendo las mismas combinaciones. El cuerpo de una puerta sobrecargada no puede mostrar ensamblaje propio: ` +
      `su trabajo es completar valores y reenviar.`
    );
  }
  return null;
}

function ensamblaConLogica(ctx: HypothesisContext): Check<Finding, CodeGraph | null> {
  return {
    id: "ensambla-con-logica",
    describe:
      "¿Alguno de los lugares señalados muestra LÓGICA DE ENSAMBLAJE propia — condicionales que deciden qué/cómo construir, ≥2 sub-objetos propios, o un bloque/DSL — en vez de sólo asignar campos o reenviar sus parámetros? EL DISCRIMINADOR de esta ola (ver el docstring del módulo, sección OLA 12): Builder resuelve construcción por etapas con lógica real entre pasos, no un constructor/fábrica que sólo copia sus argumentos.",
    run: (finding) => {
      const verdict = assemblyVerdict(finding, ctx);
      if (verdict.kind === "shows-assembly") return { holds: true, evidence: verdict.evidence };
      // OLA AP · AP4 — LA CUARTA SEÑAL, ESTRICTAMENTE ADITIVA: se consulta
      // SÓLO cuando las tres señales de CUERPO ya dijeron que no, y sólo
      // puede devolver `true`. Ver su docstring, arriba, para el defecto
      // medido que arregla y para por qué no puede quitar ninguna hipótesis
      // que hoy exista.
      const sobrecargada = overloadedConstructionEvidence(finding, ctx);
      if (sobrecargada !== null) return { holds: true, evidence: sobrecargada };
      return { holds: false, evidence: verdict.evidence };
    },
  };
}

/**
 * Ola 13 — LA RAMA NEGATIVA, como `required` PROPIO (ver el docstring del
 * módulo, sección "OLA 13"). NO es "lo que no pasó `ensambla-con-logica`"
 * leído por omisión: usa la MISMA `assemblyVerdict` de arriba y sólo
 * sostiene con el tercer resultado (`confirmed-only-assigns`), evidencia
 * POSITIVA de que el cuerpo se pudo inspeccionar y no ensambla. Cuando
 * `assemblyVerdict` es `unknown` (sin árbol vivo, o ubicación no resuelta),
 * ESTE check tampoco sostiene — misma polaridad conservadora que
 * `ensamblaConLogica`, nunca una alternativa por default.
 */
function soloAsignaOReenvia(ctx: HypothesisContext): Check<Finding, CodeGraph | null> {
  return {
    id: "solo-asigna-o-reenvia",
    describe:
      "¿El cuerpo, con evidencia POSITIVA (se pudo inspeccionar el árbol vivo, no por ausencia de él) SÓLO asigna sus propios parámetros a campos o los reenvía, sin ninguna de las tres señales de ensamblaje de `ensambla-con-logica`? EL CRITERIO GENÉRICO de la rama negativa (RAICES.md, frente 'el remedio correcto es otro'): la MISMA partición estructural que el required positivo, nunca un fallback por 'no se pudo ver'.",
    run: (finding) => {
      const verdict = assemblyVerdict(finding, ctx);
      return { holds: verdict.kind === "confirmed-only-assigns", evidence: verdict.evidence };
    },
  };
}

const magnitudFuerte: Check<Finding, CodeGraph | null> = {
  id: "magnitud-fuerte",
  describe: "¿La magnitud supera holgadamente el piso mínimo (más que lo justo para cruzarlo)?",
  run: (finding) => {
    const mag = primaryMagnitude(finding);
    if (!mag) return { holds: false, evidence: "sin magnitud reconocible para este `kind`." };
    return mag.value >= mag.strongFloor
      ? { holds: true, evidence: `${mag.label}: ${mag.value} (≥ ${mag.strongFloor}, umbral fuerte).` }
      : { holds: false, evidence: `${mag.label}: ${mag.value}, no llega al umbral fuerte (${mag.strongFloor}).` };
  },
};

function constructorReal(ctx: HypothesisContext): Check<Finding, CodeGraph | null> {
  return {
    id: "constructor-real",
    describe: "¿Alguna de las funciones señaladas es un CONSTRUCTOR real (no sólo una fábrica con nombre)?",
    run: (finding) => {
      const hit = finding.locations.find((loc) => locationIsConstructor(loc, ctx));
      return hit
        ? {
            holds: true,
            evidence: `"${hit.symbol ?? "(anónima)"}" es un constructor real: el caso clásico de constructor telescópico (refactoring.guru Builder §Applicability-1).`,
          }
        : {
            holds: false,
            evidence: "ninguno de los lugares señalados es un constructor real por nombre (podría ser sólo una fábrica con nombre, o un constructor de Java/C# nombrado como su clase — ver el límite declarado en el docstring del módulo).",
          };
    },
  };
}

/**
 * Ola 11 — el vecindario, requisito del paquete P6 (registro de pendientes,
 * §B1: "1 de 17 hipótesis lee ctx.neighborhood"). `countOfKind` distingue un
 * constructor puntualmente sobrecargado (que se destaca: pocos casos más en
 * TODO el repo) de una convención del propio repo o lenguaje (Python
 * `**kwargs`, Ruby `initialize(opts = {})` contado como un solo parámetro
 * sintáctico varias veces — ver el `toConfirm` de este módulo). Discriminador
 * PURO: sólo SUMA confianza cuando confirma rareza, nunca resta cuando no
 * puede — con `EMPTY_NEIGHBORHOOD` (`build()`, SIEMPRE el caso hoy para este
 * ancla intra-*, ver el límite de cableado más abajo) `refreshing` es
 * `false` y el check devuelve `holds:false` de forma conservadora (mismo
 * criterio "ausencia de evidencia, no evidencia de ausencia" que ya usa
 * `fluentChainingState`); sólo con `refreshing:true` (Ola 10, `refresh()`,
 * vecindario real de `crossAnalyze`) compara de verdad.
 */
const BUILDER_REPO_CONVENTION_CEILING = 5; // [provisional] K2 — a calibrar contra corpus externo.

function noEsConvencionDelRepo(ctx: HypothesisContext, refreshing: boolean): Check<Finding, CodeGraph | null> {
  return {
    id: "no-es-convencion-del-repo",
    describe: `el vecindario (ctx.neighborhood.countOfKind) muestra que este ancla NO es una convención extendida del repo (≤${BUILDER_REPO_CONVENTION_CEILING} apariciones más del mismo \`kind\`)`,
    run: (finding) => {
      if (!refreshing) {
        return {
          holds: false,
          evidence:
            "sin vecindario real en esta corrida (build() corre dentro de analyzeFile, antes de que el grafo del repo — y su índice de vecindario — existan; ver hypotheses/run.ts). No se puede comparar todavía contra el resto del repo.",
        };
      }
      const count = ctx.neighborhood.countOfKind(finding.kind);
      const holds = count <= BUILDER_REPO_CONVENTION_CEILING;
      return {
        holds,
        evidence: holds
          ? `sólo ${count} hallazgo(s) más de "${finding.kind}" en todo el repo (vecindario real, refresh()): no es una convención extendida, este caso se destaca.`
          : `${count} hallazgo(s) más de "${finding.kind}" en el repo (vecindario real): con tantos casos, es más compatible con una convención del propio repo/lenguaje que con un constructor puntualmente sobrecargado — señal más débil, no se suma.`,
      };
    },
  };
}

/**
 * Ola 11 — el excluder estructural (`evaluateGraphShape`, protección real del
 * tipo vía fan-in `instantiates`) SIEMPRE ve `graph === null` en `build()`
 * (ver el límite de cableado declarado en el docstring del módulo): correcto,
 * probado, INERTE en producción hasta hoy. Este discriminador lo re-corre
 * con el grafo REAL de `refresh()` (Ola 10, `crossAnalyze`) — nunca cambia
 * `state` (prohibido por contrato: `refresh()` sólo toca
 * `discriminators`/`confidence`), pero si el grafo real confirma una de las
 * formas estructurales (COMPLETA seguro/eludida, o PARCIAL) eso SÍ es
 * evidencia real que suma un peldaño de confianza — la única vía, hoy, para
 * que `arity`/`visibility`/`instantiates` dejen de ser inertes para Builder.
 */
const grafoConfirmaFormaEstructural: Check<Finding, CodeGraph | null> = {
  id: "grafo-confirma-forma-estructural",
  describe: "el grafo real (instantiates + visibility + arity — CONTRATO-F10.md §2) confirma alguna de las formas estructurales de Builder para este candidato — evidencia adicional a la del excluder de texto, sólo alcanzable con grafo real (ver el límite de cableado del docstring del módulo)",
  run: (finding, graph) => {
    if (!graph) {
      return {
        holds: false,
        evidence: "sin grafo real en esta corrida (build() ve graph=null para este ancla intra-function/intra-file, ver el límite de cableado declarado en el docstring del módulo).",
      };
    }
    const shape = evaluateGraphShape(finding, graph);
    const holds = shape.outcome === "completa-segura" || shape.outcome === "completa-eludida" || shape.outcome === "parcial";
    return {
      holds,
      evidence: holds
        ? `el grafo real confirma una forma estructural (${shape.outcome}): ${shape.check.why}`
        : `el grafo real no confirmó ninguna forma estructural para este candidato (${shape.outcome}): ${shape.check.why}`,
    };
  },
};

/**
 * EXCLUDER VIEJO — INTACTO, ver el docstring del módulo §"SUMAR, NO
 * REEMPLAZAR". Misma heurística de texto que
 * `pattern-behavioral.ts#bodyReturnsSelf`: ¿algún método de la MISMA unidad
 * (clase, o el archivo entero si no hay clase) retorna el receptor
 * (`self`/`this`)? Único `ya-aplicado` MEDIDO en producción hoy (click).
 */
function lastMeaningfulLine(text: string): string | null {
  const withoutComments = text.replace(/\/\/.*$/gm, "").replace(/#.*$/gm, "");
  const lines = withoutComments
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  while (lines.length > 0 && /^(\}|end)$/.test(lines[lines.length - 1]!)) lines.pop();
  return lines.length > 0 ? lines[lines.length - 1]! : null;
}

function bodyReturnsSelf(node: AstNode | null | undefined): boolean {
  if (!node) return false;
  const text = node.text;
  if (!text || text.length > 20000) return false;
  const last = lastMeaningfulLine(text);
  return last !== null && /^(?:return\s+)?(?:self|this)\s*;?$/.test(last);
}

function findFluentSibling(file: FileUnit, className: string | null): FileUnit["functions"][number] | undefined {
  return file.functions.find((fn) => fn.metrics.className === className && bodyReturnsSelf(fn.node));
}

/**
 * El excluder VIEJO, aislado — ver el docstring del módulo. Sigue leyendo
 * `ctx.file` (el único dato vivo que tenía antes de esta ola); su límite de
 * cableado sigue igual de declarado (`ctx.file` es `null` en `crossAnalyze`,
 * pero HOY SÍ vive dentro de `analyzeFile`, que es la única llamada real
 * para este ancla — ver el docstring del módulo).
 */
function fluentChainingState(finding: Finding, ctx: HypothesisContext): { state: "ya-aplicado" | "ausente"; check: PatternHypothesisCheck } {
  const file = ctx.file;
  if (!file) {
    return {
      state: "ausente",
      check: {
        label: "encadenamiento-fluido-existente (excluder heredado, texto — ver docstring del módulo)",
        passed: false,
        why:
          "no se pudo verificar: el árbol de este archivo ya no está vivo en esta corrida. Se asume 'no aplicado' " +
          "por ausencia de evidencia, nunca por evidencia de ausencia.",
        role: "applied",
      },
    };
  }

  const anchorInFile = finding.locations
    .map((loc) => file.functions.find((fn) => fn.file === loc.file && fn.startLine === loc.startLine && fn.endLine === loc.endLine))
    .find((fn): fn is NonNullable<typeof fn> => fn !== undefined);
  const className = anchorInFile?.metrics.className ?? null;
  const unitLabel = className ?? "(nivel superior, mismo archivo)";
  const fluentSibling = findFluentSibling(file, className);

  return {
    state: fluentSibling ? "ya-aplicado" : "ausente",
    check: {
      label: "encadenamiento-fluido-existente (excluder heredado, texto — ver docstring del módulo)",
      passed: Boolean(fluentSibling),
      why: fluentSibling
        ? `"${fluentSibling.name ?? "(anónima)"}" (misma unidad "${unitLabel}") ya retorna el receptor (self/this): ya hay un flujo de construcción por pasos.`
        : `ningún método de "${unitLabel}" retorna el receptor: no hay encadenamiento fluido previo en la MISMA clase.`,
      role: "applied",
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════
 * EXCLUDER NUEVO — LA FORMA ESTRUCTURAL (grafo), CONTRATO-F10.md §0.4/§2.
 * Ver el docstring del módulo para las tres formas completas.
 * ═══════════════════════════════════════════════════════════════════════ */

const BUILDER_MIN_SETTERS = 3;

interface BuilderGraphIndex {
  readonly nodeById: ReadonlyMap<string, CodeGraphNode>;
  readonly edgesFrom: ReadonlyMap<string, readonly CodeGraphEdge[]>;
  readonly edgesTo: ReadonlyMap<string, readonly CodeGraphEdge[]>;
}

/** Cacheado por identidad de `CodeGraph` — mismo idiom que `facade.ts#VIEW_CACHE`:
 *  una corrida procesa el MISMO grafo para todos los `Finding`s de
 *  `long-parameter-list`/`data-clump`, sin repetir el barrido O(aristas) por hallazgo. */
const GRAPH_INDEX_CACHE = new WeakMap<CodeGraph, BuilderGraphIndex>();

function buildGraphIndex(graph: CodeGraph): BuilderGraphIndex {
  const cached = GRAPH_INDEX_CACHE.get(graph);
  if (cached) return cached;

  const nodeById = new Map<string, CodeGraphNode>();
  for (const n of graph.nodes) if (!nodeById.has(n.id)) nodeById.set(n.id, n);

  const edgesFrom = new Map<string, CodeGraphEdge[]>();
  const edgesTo = new Map<string, CodeGraphEdge[]>();
  for (const e of confidentEdges(graph)) {
    const from = edgesFrom.get(e.from);
    if (from) from.push(e);
    else edgesFrom.set(e.from, [e]);
    const to = edgesTo.get(e.to);
    if (to) to.push(e);
    else edgesTo.set(e.to, [e]);
  }

  const index: BuilderGraphIndex = { nodeById, edgesFrom, edgesTo };
  GRAPH_INDEX_CACHE.set(graph, index);
  return index;
}

function lastSegment(node: CodeGraphNode): string | undefined {
  return node.symbolPath[node.symbolPath.length - 1];
}

function isOwnerLike(node: CodeGraphNode | undefined): node is CodeGraphNode {
  return node !== undefined && node.kind === "symbol" && (node.family === "class-like" || node.family === "namespace-like");
}

/** Miembros function-like DIRECTOS de `ownerId`, vía `contains` — el mismo
 *  recorrido que `memberSignatures` (`graph/types.ts`) hace, pero devolviendo
 *  el `CodeGraphNode` completo (acá hace falta `visibility`/`id`, no sólo la firma). */
function directMembersOf(index: BuilderGraphIndex, ownerId: string): readonly CodeGraphNode[] {
  const out: CodeGraphNode[] = [];
  for (const e of index.edgesFrom.get(ownerId) ?? []) {
    if (e.kind !== "contains") continue;
    const target = index.nodeById.get(e.to);
    if (target && target.kind === "symbol" && target.family === "function-like") out.push(target);
  }
  return out;
}

/** El nodo `class-like`/`namespace-like` que contiene DIRECTAMENTE a `memberId`. */
function containingOwnerOf(index: BuilderGraphIndex, memberId: string): CodeGraphNode | null {
  for (const e of index.edgesTo.get(memberId) ?? []) {
    if (e.kind !== "contains") continue;
    const owner = index.nodeById.get(e.from);
    if (isOwnerLike(owner)) return owner;
  }
  return null;
}

/**
 * ¿`member` es un constructor por FORMA — nombre mandado (`CONSTRUCTOR_NAMES`:
 * Ruby/Python/JS/TS/Vue) O mismo nombre que su clase contenedora (Java/C#:
 * `constructor_declaration` se registra con el nombre de la clase, jamás la
 * palabra "constructor" — ver `code-grammar.ts#CONSTRUCTOR_NODE_WORD`)?
 */
function isConstructorMember(member: CodeGraphNode, owner: CodeGraphNode | null): boolean {
  const name = lastSegment(member);
  if (!name) return false;
  if (CONSTRUCTOR_NAMES.has(name.toLowerCase())) return true;
  const ownerName = owner ? lastSegment(owner) : undefined;
  return ownerName !== undefined && name === ownerName;
}

function constructorOf(index: BuilderGraphIndex, owner: CodeGraphNode): CodeGraphNode | null {
  return directMembersOf(index, owner.id).find((m) => isConstructorMember(m, owner)) ?? null;
}

function outgoingInstantiateTargets(index: BuilderGraphIndex, memberId: string): readonly string[] {
  const out: string[] = [];
  for (const e of index.edgesFrom.get(memberId) ?? []) if (e.kind === "instantiates") out.push(e.to);
  return out;
}

function incomingInstantiateEdges(index: BuilderGraphIndex, targetId: string): readonly CodeGraphEdge[] {
  return (index.edgesTo.get(targetId) ?? []).filter((e) => e.kind === "instantiates");
}

/**
 * ¿Todas las aristas `calls` salientes de `memberId` se quedan DENTRO de
 * `ownerId` (el destino es un miembro DIRECTO del mismo owner)? Vacuamente
 * `true` sin ninguna `calls` saliente — el caso típico de un setter que sólo
 * asigna un campo (`this.x = v`), que nunca produce una arista `calls`.
 */
function callsStayWithinOwner(index: BuilderGraphIndex, memberId: string, ownerId: string): boolean {
  const ownMembers = new Set(directMembersOf(index, ownerId).map((m) => m.id));
  for (const e of index.edgesFrom.get(memberId) ?? []) {
    if (e.kind !== "calls") continue;
    if (!ownMembers.has(e.to)) return false;
  }
  return true;
}

function flaggedGraphNode(graph: CodeGraph, loc: RoleLocation): CodeGraphNode | null {
  return (
    graph.nodes.find(
      (n) => n.kind === "symbol" && n.family === "function-like" && n.file === loc.file && n.startLine === loc.startLine && n.endLine === loc.endLine,
    ) ?? null
  );
}

/**
 * `T` — el Producto que el ancla construye. Ver el docstring del módulo,
 * §"IDENTIFICAR T". `null` cuando ninguna de las dos vías resuelve —
 * declarado (requisito 3 del encargo), nunca adivinado.
 */
function resolveTargetType(index: BuilderGraphIndex, graph: CodeGraph, loc: RoleLocation): CodeGraphNode | null {
  const flagged = flaggedGraphNode(graph, loc);
  if (!flagged) return null;
  const owner = containingOwnerOf(index, flagged.id);
  if (owner && isConstructorMember(flagged, owner)) return owner;
  for (const targetId of outgoingInstantiateTargets(index, flagged.id)) {
    const node = index.nodeById.get(targetId);
    if (node) return node;
  }
  return null;
}

interface CompleteBuilderMatch {
  readonly builder: CodeGraphNode;
  readonly setters: readonly CodeGraphNode[];
  readonly buildMember: CodeGraphNode;
}

function isSetterCandidate(index: BuilderGraphIndex, member: CodeGraphNode, ownerId: string): boolean {
  if (member.arity !== 1) return false;
  if (member.visibility !== undefined && member.visibility !== "public") return false;
  return callsStayWithinOwner(index, member.id, ownerId);
}

/** La forma COMPLETA — ver el docstring del módulo. Recorre TODOS los nodos
 *  `class-like`/`namespace-like` del grafo (salvo `target` mismo) buscando
 *  uno con ≥3 setters + 1 miembro que instancia `target`. */
function findCompleteBuilder(index: BuilderGraphIndex, target: CodeGraphNode): CompleteBuilderMatch | null {
  for (const owner of index.nodeById.values()) {
    if (owner.id === target.id || !isOwnerLike(owner)) continue;
    const members = directMembersOf(index, owner.id);
    const setters = members.filter((m) => isSetterCandidate(index, m, owner.id));
    if (setters.length < BUILDER_MIN_SETTERS) continue;
    const buildMember = members.find((m) => m.arity === 0 && outgoingInstantiateTargets(index, m.id).includes(target.id));
    if (!buildMember) continue;
    return { builder: owner, setters, buildMember };
  }
  return null;
}

/** Archivos, DISTINTOS del archivo de `builderFile`, que construyen `target`
 *  directamente — el puenteo real de la forma COMPLETA (⇒ `aplicado-eludido`). */
function bypassFilesOf(index: BuilderGraphIndex, target: CodeGraphNode, builderFile: string): readonly string[] {
  const files = new Set<string>();
  for (const e of incomingInstantiateEdges(index, target.id)) {
    const from = index.nodeById.get(e.from);
    if (from && from.file !== builderFile) files.add(from.file);
  }
  return [...files];
}

interface TelescopingMatch {
  readonly members: readonly CodeGraphNode[];
  readonly arities: ReadonlySet<number>;
}

/** La forma PARCIAL — ≥2 miembros-fábrica SEPARADOS (excluyendo `excludeIds`,
 *  típicamente el propio lugar señalado por el `Finding`) que instancian
 *  `target` con aridad propia DISTINTA, sin ningún `B` completo detrás. */
function findTelescopingFactories(index: BuilderGraphIndex, target: CodeGraphNode, excludeIds: ReadonlySet<string>): TelescopingMatch | null {
  const members = new Map<string, CodeGraphNode>();
  for (const e of incomingInstantiateEdges(index, target.id)) {
    if (excludeIds.has(e.from) || e.from === target.id) continue;
    const member = index.nodeById.get(e.from);
    if (member && member.kind === "symbol" && member.family === "function-like") members.set(member.id, member);
  }
  const arities = new Set<number>();
  for (const m of members.values()) if (typeof m.arity === "number") arities.add(m.arity);
  if (members.size < 2 || arities.size < 2) return null;
  return { members: [...members.values()], arities };
}

type GraphShapeOutcome = "completa-segura" | "completa-eludida" | "parcial" | "sin-senal" | "sin-T" | "sin-grafo";

interface GraphShapeSignal {
  readonly outcome: GraphShapeOutcome;
  readonly check: PatternHypothesisCheck;
}

const STRUCTURAL_CHECK_LABEL = "forma estructural del grafo (Builder + Producto — CONTRATO-F10.md §2)";

/**
 * El excluder NUEVO — ver el docstring del módulo. `graph === null` es el
 * caso REAL de producción hoy (límite de cableado declarado ahí) — se
 * reporta como evidencia ausente, nunca como "no hay Builder".
 */
function evaluateGraphShape(finding: Finding, graph: CodeGraph | null): GraphShapeSignal {
  if (!graph) {
    return {
      outcome: "sin-grafo",
      check: {
        label: STRUCTURAL_CHECK_LABEL,
        passed: false,
        why:
          "no se pudo verificar: el grafo del repo todavía no existe en esta corrida (límite de cableado — el ancla " +
          "de esta hipótesis es intra-function/intra-file, y `code-analyzer.ts` sólo llama `build()` DENTRO de " +
          "`analyzeFile`, ANTES de que `repo.graph` exista; ver el docstring del módulo). Se asume 'sin evidencia', " +
          "nunca 'evidencia de ausencia'.",
        role: "applied",
      },
    };
  }

  const index = buildGraphIndex(graph);
  let target: CodeGraphNode | null = null;
  let anchorMemberId: string | null = null;
  for (const loc of finding.locations) {
    const t = resolveTargetType(index, graph, loc);
    if (t) {
      target = t;
      anchorMemberId = flaggedGraphNode(graph, loc)?.id ?? null;
      break;
    }
  }

  if (!target) {
    return {
      outcome: "sin-T",
      check: {
        label: STRUCTURAL_CHECK_LABEL,
        passed: false,
        why:
          "no se pudo identificar estructuralmente el tipo construido (Producto): ni el lugar señalado es un " +
          "constructor con clase contenedora, ni tiene una arista `instantiates` saliente. Sin ese tipo no hay forma " +
          "de buscar un Builder que lo construya — declarado, no adivinado.",
        role: "applied",
      },
    };
  }

  const complete = findCompleteBuilder(index, target);
  if (complete) {
    const bypassFiles = bypassFilesOf(index, target, complete.builder.file);
    const ctor = constructorOf(index, target);
    const ctorLocked = ctor !== null && (ctor.visibility === "private" || ctor.visibility === "internal");
    const targetName = target.symbolPath.join(".");
    const builderName = complete.builder.symbolPath.join(".");
    const buildName = lastSegment(complete.buildMember) ?? "(build)";

    if (ctorLocked || bypassFiles.length === 0) {
      return {
        outcome: "completa-segura",
        check: {
          label: STRUCTURAL_CHECK_LABEL,
          passed: true,
          why:
            `"${builderName}" tiene ${complete.setters.length} setter(s) de un parámetro cuyas llamadas no salen de la clase, ` +
            `y un miembro "${buildName}" que instancia "${targetName}": el patrón YA ESTÁ implementado. ` +
            (ctorLocked
              ? `El constructor de "${targetName}" es ${ctor!.visibility}: nadie externo puede construirlo sin pasar por el builder.`
              : `Todos los sitios que construyen "${targetName}" directamente están confinados al archivo de "${builderName}".`),
          role: "applied",
        },
      };
    }
    return {
      outcome: "completa-eludida",
      check: {
        label: STRUCTURAL_CHECK_LABEL,
        passed: true,
        why:
          `"${builderName}" tiene la forma completa de un Builder para "${targetName}" (≥${BUILDER_MIN_SETTERS} setters + ` +
          `"${buildName}" que lo instancia), PERO ${bypassFiles.length} archivo(s) fuera de "${complete.builder.file}" también ` +
          `construyen "${targetName}" directamente, puenteando el builder: ${bypassFiles.slice(0, 5).join(", ")}${bypassFiles.length > 5 ? ", …" : ""}.`,
        role: "applied",
      },
    };
  }

  const excludeIds = new Set<string>();
  if (anchorMemberId) excludeIds.add(anchorMemberId);
  const ctorOfTarget = constructorOf(index, target);
  if (ctorOfTarget) excludeIds.add(ctorOfTarget.id);
  const telescoping = findTelescopingFactories(index, target, excludeIds);
  if (telescoping) {
    const targetName = target.symbolPath.join(".");
    const arities = [...telescoping.arities].sort((a, b) => a - b).join(", ");
    return {
      outcome: "parcial",
      check: {
        label: STRUCTURAL_CHECK_LABEL,
        passed: true,
        why:
          `${telescoping.members.length} miembro(s)-fábrica SEPARADOS construyen "${targetName}" con aridades distintas ` +
          `(${arities}) — constructores telescópicos sin ningún Builder que los unifique: la forma PARCIAL de este patrón.`,
        role: "applied",
      },
    };
  }

  return {
    outcome: "sin-senal",
    check: {
      label: STRUCTURAL_CHECK_LABEL,
      passed: false,
      why: `ningún Builder (≥${BUILDER_MIN_SETTERS} setters + miembro que instancia "${target.symbolPath.join(".")}") ni fábricas telescópicas separadas alrededor de ese tipo.`,
      role: "applied",
    },
  };
}

/**
 * Fusión de los dos excluders — ver el docstring del módulo, §"SUMAR, NO
 * REEMPLAZAR". Prioridad: la forma NUEVA (estructural, más fuerte porque
 * cruza DOS tipos) manda cuando confirma algo; si no confirma nada, el
 * excluder VIEJO (texto, un solo tipo) sigue siendo la única vía real de
 * `ya-aplicado` en producción hoy (ver el límite de cableado). El array de
 * `checks` siempre trae AMBAS señales, confirmen o no — auditable — con la
 * que DECIDIÓ el estado primero (para un consumidor que sólo lee el primer
 * check `role === "applied"`, como `hypotheses/builder.test.ts` ya hacía
 * antes de esta ola).
 */
function appliedState(finding: Finding, graph: CodeGraph | null, ctx: HypothesisContext): AppliedStateResult {
  const structural = evaluateGraphShape(finding, graph);
  const fluent = fluentChainingState(finding, ctx);

  if (structural.outcome === "completa-segura") return { state: "ya-aplicado", checks: [structural.check, fluent.check] };
  if (structural.outcome === "completa-eludida") return { state: "aplicado-eludido", checks: [structural.check, fluent.check] };
  if (fluent.state === "ya-aplicado") return { state: "ya-aplicado", checks: [fluent.check, structural.check] };
  if (structural.outcome === "parcial") return { state: "parcial", checks: [structural.check, fluent.check] };
  return { state: "ausente", checks: [structural.check, fluent.check] };
}

/* ═══════════════════════════════════════════════════════════════════════
 * OLA AE, FRENTE AE4 — EL CAMINO DE ENTRADA DEL ANCLA-FUERZA.
 *
 * TODO lo de acá abajo es CÓDIGO NUEVO detrás de
 * `problem.kind === OPTIONAL_COMBINATIONS_KIND`. No toca el camino viejo.
 *
 * LOS TRES `required` NO LE CREEN AL DETECTOR: los tres re-derivan su hecho
 * del grafo real (`confidentEdges`, las aristas NO ambiguas) y, sin grafo,
 * devuelven `holds: false`. Es la polaridad correcta para un `required` — la
 * misma que `ensamblaConLogica` ya tiene en este archivo y la que
 * `no-permissive-required.test.ts` exige.
 * ═══════════════════════════════════════════════════════════════════════ */

interface OptionalCombinationFacts {
  /** El nodo por el que se construye (la clase invocada, o el miembro constructor). */
  readonly door: CodeGraphNode;
  /** El tipo construido. */
  readonly target: CodeGraphNode;
  /** Cantidades DISTINTAS de argumentos observadas en los sitios, ascendentes. */
  readonly argCounts: readonly number[];
  /** Símbolos DISTINTOS que construyen por esa puerta. */
  readonly sites: readonly string[];
}

/** Cualquier nodo `symbol` declarado exactamente en esa ubicación — a
 *  diferencia de `flaggedGraphNode` (camino viejo, `function-like` obligatorio),
 *  acá la puerta puede ser un `class-like`: en Python/Ruby/JS/Go construir ES
 *  invocar el propio tipo, y ése es el nodo que recibe las aristas `calls`. */
function symbolNodeAt(graph: CodeGraph, loc: RoleLocation): CodeGraphNode | null {
  return graph.nodes.find((n) => n.kind === "symbol" && n.file === loc.file && n.startLine === loc.startLine && n.endLine === loc.endLine) ?? null;
}

/**
 * Re-deriva del GRAFO REAL los tres hechos que el ancla midió, sin leerlos del
 * `Finding`. `null` cuando la puerta no resuelve o cuando el nodo que resuelve
 * no es una puerta de construcción — declarado, nunca adivinado.
 */
function optionalCombinationFacts(finding: Finding, graph: CodeGraph | null): OptionalCombinationFacts | null {
  if (!graph) return null;
  const index = buildGraphIndex(graph);
  const doorLoc = finding.locations.find((l) => l.role.startsWith(ROLE_DOOR));
  if (!doorLoc) return null;
  const door = symbolNodeAt(graph, doorLoc);
  if (!door) return null;

  // (1) ¿es una PUERTA DE CONSTRUCCIÓN? — un tipo invocado como función, o un
  // miembro constructor de un tipo. Mismo criterio de FORMA que
  // `isConstructorMember` ya usa en este archivo desde la Ola 10/11.
  let target: CodeGraphNode | null = null;
  if (door.family === "class-like") target = door;
  else if (door.family === "function-like") {
    const owner = containingOwnerOf(index, door.id);
    if (owner && owner.family === "class-like" && isConstructorMember(door, owner)) target = owner;
  }
  if (!target) return null;

  const counts = new Set<number>();
  const sites = new Set<string>();
  for (const e of confidentEdges(graph)) {
    if (e.kind !== "calls" || e.to !== door.id) continue;
    if (!e.callArities || e.callArities.length === 0) continue;
    if (!index.nodeById.has(e.from)) continue;
    for (const a of e.callArities) counts.add(a);
    sites.add(e.from);
  }
  if (counts.size === 0) return null;
  return { door, target, argCounts: [...counts].sort((a, b) => a - b), sites: [...sites].sort() };
}

function spreadOf(facts: OptionalCombinationFacts): number {
  return facts.argCounts[facts.argCounts.length - 1]! - facts.argCounts[0]!;
}

/** `required` 1 — *"lo que se arma es una ENTIDAD, no cualquier función con argumentos opcionales"*. */
const puertaDeConstruccion: Check<Finding, CodeGraph | null> = {
  id: "puerta-de-construccion",
  describe: "¿El lugar señalado es, EN EL GRAFO, una puerta de construcción de un tipo (el tipo invocado como función, o un miembro constructor suyo)?",
  run: (finding, graph) => {
    if (!graph) {
      return {
        holds: false,
        evidence: "el grafo del repo no está disponible en esta corrida, así que no hay forma de confirmar que el lugar señalado construya un tipo. Sin ese hecho no hay candidata.",
      };
    }
    const facts = optionalCombinationFacts(finding, graph);
    if (!facts) {
      return {
        holds: false,
        evidence: "el lugar señalado no resuelve, en el grafo, a un tipo invocado como función ni a un miembro constructor de un tipo: lo que se construye no es una entidad identificable.",
      };
    }
    return {
      holds: true,
      evidence: `"${facts.door.symbolPath.join(".")}" construye "${facts.target.symbolPath.join(".")}" (${facts.door.family === "class-like" ? "el tipo se invoca como función" : "miembro constructor del tipo"}).`,
    };
  },
};

/** `required` 2 — *"la opcionalidad está MEDIDA en los sitios, no supuesta desde la firma"*. */
const combinatoriaMedidaEnLosSitios: Check<Finding, CodeGraph | null> = {
  id: "combinatoria-medida-en-los-sitios",
  describe: `¿Los sitios invocan esa puerta con ≥${BUILDER_MIN_COMBINATIONS} cantidades DISTINTAS de argumentos y un rango de ≥${BUILDER_MIN_OPTIONAL_SLOTS} ranuras (aristas NO ambiguas del grafo real, no el número del detector)?`,
  run: (finding, graph) => {
    const facts = optionalCombinationFacts(finding, graph);
    if (!facts) {
      return {
        holds: false,
        evidence: "sin grafo real (o sin puerta resuelta) no hay cómo contar con cuántos argumentos llama cada sitio: la opcionalidad quedaría supuesta desde la firma, que es exactamente lo que este ancla existe para no hacer.",
      };
    }
    const spread = spreadOf(facts);
    const holds = facts.argCounts.length >= BUILDER_MIN_COMBINATIONS && spread >= BUILDER_MIN_OPTIONAL_SLOTS;
    return {
      holds,
      evidence: holds
        ? `los sitios pasan ${facts.argCounts.length} cantidades distintas de argumentos (${facts.argCounts.join(", ")}): hay al menos ${spread} ranuras que unos llenan y otros omiten.`
        : `sólo ${facts.argCounts.length} cantidad(es) distinta(s) de argumentos (${facts.argCounts.join(", ")}), rango ${spread}: con eso la construcción no tiene combinatoria, y el remedio barato (un valor por defecto, un objeto de parámetros) alcanza.`,
    };
  },
};

/** `required` 3 — *"la combinatoria la resuelve MUCHA gente, cada una por su cuenta"*. */
const combinatoriaRepartida: Check<Finding, CodeGraph | null> = {
  id: "combinatoria-repartida",
  describe: `¿≥${BUILDER_MIN_CONSTRUCTION_SITES} símbolos DISTINTOS construyen por esa puerta (grafo real)?`,
  run: (finding, graph) => {
    const facts = optionalCombinationFacts(finding, graph);
    if (!facts) {
      return { holds: false, evidence: "sin grafo real (o sin puerta resuelta) no hay cómo contar los sitios de construcción." };
    }
    const holds = facts.sites.length >= BUILDER_MIN_CONSTRUCTION_SITES;
    return {
      holds,
      evidence: holds
        ? `${facts.sites.length} símbolos distintos construyen por esa puerta, cada uno eligiendo qué pasos opcionales pasa.`
        : `sólo ${facts.sites.length} sitio(s) construyen por esa puerta: con tan pocos, una segunda fábrica con nombre cuesta menos que un Builder.`,
    };
  },
};

/**
 * `required` 4 — *"la construcción tiene ETAPAS, no sólo ranuras opcionales"*.
 *
 * ═══ POR QUÉ ESTE CHECK EXISTE, Y CUÁNDO LO AGREGUÉ (AE4) ═══
 * Lo agregué **antes de medir ninguna precisión del ancla nueva**, al abrir los
 * DOS PRIMEROS candidatos reales del embudo y leerlos:
 * `netbox/utilities/forms/rendering.py#FieldSet` (`__init__(self, *items,
 * name=None)` — VARIÁDICO: el rango de argumentos no es opcionalidad, es
 * `*args`) y `netbox/utilities/views.py#ViewTab` (`__init__(self, label,
 * visible=None, badge=None, weight=1000, permission=None, hide_if_empty=False)`
 * — seis líneas de asignación a campos y nada más). Los dos tienen la fuerza de
 * OPCIONALIDAD perfectamente medida en los sitios, y los dos son exactamente el
 * caso que ESTE MISMO ARCHIVO ya decidió, con siete casos juzgados a mano en la
 * Ola 12, que **NO es Builder**: *"un constructor con muchos parámetros
 * opcionales que SÓLO SE ASIGNAN A CAMPOS … el remedio es nativo del lenguaje
 * (kwargs, record, Data.define) y un Builder es sobre-ingeniería"*.
 *
 * O sea: **la opcionalidad sola no alcanza; la otra mitad de la fuerza de
 * Builder es que el ensamblado tenga lógica real entre pasos.** El ancla nueva
 * mide la primera mitad con el GRAFO (los sitios de construcción) y este check
 * mide la segunda con el ÁRBOL VIVO — y no con un criterio nuevo, sino
 * REUSANDO VERBATIM `assemblySignalFor`, el discriminador que este archivo ya
 * tiene medido desde la Ola 12 y corregido en la 14. No hay una segunda
 * definición que pueda desalinearse.
 *
 * **Es un `required` NUEVO en un camino NUEVO, no un umbral movido después de
 * ver un resultado:** cuando lo escribí, la precisión del ancla nueva no estaba
 * medida ni juzgada ni publicada.
 *
 * El cuerpo que se inspecciona es el del CONSTRUCTOR del tipo (no el del
 * sitio): en un ancla `inter-file` el árbol llega por `ctx.fileAt(path)`, no por
 * `ctx.file`. Sin árbol vivo ⇒ `holds: false` — nunca "no pude mirar, apruebo".
 */
function ensamblaEnLaPuerta(ctx: HypothesisContext): Check<Finding, CodeGraph | null> {
  return {
    id: "ensambla-en-la-puerta",
    describe:
      "¿El cuerpo del constructor del tipo muestra LÓGICA DE ENSAMBLAJE propia — condicionales que deciden qué/cómo construir, ≥2 sub-objetos propios, o un bloque/DSL — en vez de sólo asignar sus parámetros a campos? La OTRA MITAD de la fuerza de Builder: la opcionalidad sola la resuelve el modismo nativo del lenguaje (kwargs/record/objeto de opciones). Mismo criterio, mismo código, que `ensambla-con-logica` (Ola 12/14).",
    run: (finding, graph) => {
      const facts = optionalCombinationFacts(finding, graph);
      if (!facts || !graph) {
        return { holds: false, evidence: "sin grafo real (o sin puerta resuelta) no hay cómo ubicar el cuerpo del constructor del tipo." };
      }
      const index = buildGraphIndex(graph);
      const ctorNode = facts.door.family === "function-like" ? facts.door : constructorOf(index, facts.target);
      if (!ctorNode) {
        return {
          holds: false,
          evidence: `"${facts.target.symbolPath.join(".")}" no expone, en el grafo, un miembro constructor cuyo cuerpo se pueda inspeccionar: sin cuerpo no hay evidencia POSITIVA de ensamblaje entre pasos, y sin ella la combinatoria de argumentos la resuelve el modismo nativo del lenguaje.`,
        };
      }
      const file = ctx.fileAt(ctorNode.file);
      if (!file) {
        return { holds: false, evidence: `el árbol vivo de "${ctorNode.file}" no está disponible en esta corrida: no hay forma de confirmar ensamblaje real.` };
      }
      const signal = assemblySignalFor(
        {
          file: ctorNode.file,
          startLine: ctorNode.startLine ?? 1,
          endLine: ctorNode.endLine ?? ctorNode.startLine ?? 1,
          symbol: ctorNode.symbolPath.join("."),
          role: "constructor del tipo construido",
        },
        file,
      );
      if (!signal) {
        return {
          holds: false,
          evidence: `el constructor de "${facts.target.symbolPath.join(".")}" no se pudo ubicar en el árbol vivo de "${ctorNode.file}" (líneas desalineadas): sin cuerpo que inspeccionar no se confirma ensamblaje.`,
        };
      }
      return { holds: signal.holds, evidence: signal.why };
    },
  };
}

const combinatoriaMuyAncha: Check<Finding, CodeGraph | null> = {
  id: "combinatoria-muy-ancha",
  describe: `el rango de argumentos observados supera holgadamente el piso del detector (≥${BUILDER_STRONG_OPTIONAL_SLOTS} ranuras opcionales)`,
  run: (finding, graph) => {
    const facts = optionalCombinationFacts(finding, graph);
    if (!facts) return { holds: false, evidence: "sin grafo real no hay rango que medir." };
    const spread = spreadOf(facts);
    return {
      holds: spread >= BUILDER_STRONG_OPTIONAL_SLOTS,
      evidence: `rango de ${spread} ranuras opcionales (piso del detector: ${BUILDER_MIN_OPTIONAL_SLOTS}; piso de este discriminador: ${BUILDER_STRONG_OPTIONAL_SLOTS}).`,
    };
  },
};

const muchosSitiosDeConstruccion: Check<Finding, CodeGraph | null> = {
  id: "muchos-sitios-de-construccion",
  describe: `la combinatoria está repartida entre muchos sitios (≥${BUILDER_STRONG_SITES}) — cuantos más, más trabajo ahorra un punto único de construcción`,
  run: (finding, graph) => {
    const facts = optionalCombinationFacts(finding, graph);
    if (!facts) return { holds: false, evidence: "sin grafo real no hay sitios que contar." };
    return {
      holds: facts.sites.length >= BUILDER_STRONG_SITES,
      evidence: `${facts.sites.length} sitios de construcción (piso del detector: ${BUILDER_MIN_CONSTRUCTION_SITES}; piso de este discriminador: ${BUILDER_STRONG_SITES}).`,
    };
  },
};

/**
 * LA ESCALERA DE ESTADO DEL CAMINO NUEVO. Reusa las MISMAS funciones de forma
 * que el camino viejo ya tenía (`findCompleteBuilder`, `bypassFilesOf`,
 * `findTelescopingFactories`) — no una segunda definición que podría
 * desalinearse — pero aplicadas al tipo que resolvió ESTE ancla.
 *
 * `ya-aplicado` y `aplicado-eludido` son alcanzables en principio y CASI
 * imposibles en la práctica, y lo digo con todas las letras con el mismo
 * criterio con el que AC3 y AD4 lo dijeron de las suyas: **el detector ya se
 * calla (condición 5b) cuando existe un Builder para el tipo**, así que un
 * `Finding` de este ancla con un Builder completo detrás sólo puede aparecer
 * cuando la definición del detector y la de este archivo difieren (este
 * archivo además exige `visibility` pública y que las llamadas del setter no
 * salgan de la clase). **Que casi no produzca `ya-aplicado` NO me acredita
 * nada.** Lo que sí es mérito medible es que el DETECTOR se calle, y hay un
 * test que lo exige.
 */
function optionalCombinationsState(finding: Finding, graph: CodeGraph | null): AppliedStateResult {
  const facts = optionalCombinationFacts(finding, graph);
  const label = "forma estructural del grafo alrededor del tipo construido (ancla-fuerza, Ola AE)";
  if (!facts || !graph) {
    return {
      state: "ausente",
      checks: [
        {
          label,
          passed: false,
          why: "el grafo del repo no está disponible en esta corrida: no hay forma de buscar un Builder ya puesto alrededor del tipo construido. Sin evidencia, se reporta el estado más conservador para una recomendación.",
          role: "applied",
        },
      ],
    };
  }

  const index = buildGraphIndex(graph);
  const targetName = facts.target.symbolPath.join(".");
  const complete = findCompleteBuilder(index, facts.target);
  if (complete) {
    const bypassFiles = bypassFilesOf(index, facts.target, complete.builder.file);
    const builderName = complete.builder.symbolPath.join(".");
    return {
      state: bypassFiles.length === 0 ? "ya-aplicado" : "aplicado-eludido",
      checks: [
        {
          label,
          passed: true,
          why:
            `"${builderName}" ya tiene la forma completa de un Builder para "${targetName}"` +
            (bypassFiles.length === 0
              ? ": el patrón ya está puesto."
              : `, pero ${bypassFiles.length} archivo(s) ajeno(s) construyen "${targetName}" directamente: ${bypassFiles.slice(0, 5).join(", ")}${bypassFiles.length > 5 ? ", …" : ""}.`),
          role: "applied",
        },
      ],
    };
  }

  const telescoping = findTelescopingFactories(index, facts.target, new Set([facts.door.id]));
  if (telescoping) {
    const arities = [...telescoping.arities].sort((a, b) => a - b).join(", ");
    return {
      state: "parcial",
      checks: [
        {
          label,
          passed: true,
          why:
            `${telescoping.members.length} miembro(s)-fábrica SEPARADOS construyen "${targetName}" con aridades distintas (${arities}): ` +
            "media puerta — la combinatoria ya empezó a embudarse en fábricas con nombre, pero nada las unifica.",
          role: "applied",
        },
      ],
    };
  }

  return {
    state: "ausente",
    checks: [
      {
        label,
        passed: false,
        why: `no hay ningún Builder (≥${BUILDER_MIN_SETTERS} setters + un miembro sin argumentos que lo instancie) ni fábricas telescópicas separadas alrededor de "${targetName}": la combinatoria vive entera del lado de los ${facts.sites.length} sitios.`,
        role: "applied",
      },
    ],
  };
}

function buildOptionalCombinationsSpec(ctx: HypothesisContext): HypothesisSpec<Finding, CodeGraph | null> {
  return {
    pattern: PATTERN,
    ceiling: "alta",
    needs: [],
    required: [puertaDeConstruccion, combinatoriaMedidaEnLosSitios, combinatoriaRepartida, ensamblaEnLaPuerta(ctx)],
    discriminators: [magnitudFuerte, combinatoriaMuyAncha, muchosSitiosDeConstruccion],
    appliedState: (p, g) => optionalCombinationsState(p, g),
    toConfirm: [
      "¿Las combinaciones de argumentos son de verdad OPCIONALIDAD, o son sobrecargas/variantes deliberadas que el autor quiere ofrecer (la escalera `of()` de una biblioteca de colecciones es el caso canónico)?",
      "Este ancla mide el CONJUNTO de cantidades de argumentos, nunca el ORDEN de los pasos: las aristas del grafo colapsan las ocurrencias y no llevan posición. Si la fuerza real es 'el orden importa', confirmarlo a mano.",
      "¿Los parámetros opcionales configuran UNA entidad, o son argumentos independientes que la firma junta por conveniencia? Si son independientes, el remedio es dividir la función, no construir por pasos.",
      "Un lenguaje con valores por defecto (Python/Ruby/TS/C#) ya resuelve buena parte de esta combinatoria sin ningún patrón: confirmar que lo que falta es ACUMULACIÓN y validación entre pasos, no sólo poder omitir argumentos.",
    ],
    source: SOURCE,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
 * OLA AN, FRENTE AN4 — EL ANCLA DE NIVEL 2 ("la refactorización como canal
 * de detección"). CÓDIGO NUEVO detrás de `esAnclaDeRefactorizacion(kind)`:
 * ni una línea del camino viejo pasa por acá, y ningún `required`, umbral o
 * discriminador de `long-parameter-list`/`data-clump`/
 * `optional-construction-combinations` se toca. **Es aditivo.**
 *
 * QUÉ INTENCIÓN VERIFICA, y por qué el ancla vieja no la puede verificar.
 * `long-parameter-list` nombra un SÍNTOMA — *"la firma es larga"* — y mide
 * 12,5 % en bibliotecas y 6,1 % en aplicaciones. Builder resuelve otra cosa:
 * *"construir esta entidad exige lógica real ENTRE PASOS"*. El hecho que
 * nombra ESA fuerza no vive en el ancla de Builder sino en la capa de
 * REFACTORIZACIÓN: un `long-function`/`complexity` con una propuesta VIVA de
 * `Extract Method` es, literalmente, *"acá hay pasos separables"*. Este
 * camino cuelga de ese hecho y le agrega las dos condiciones que separan
 * "función larga" de "construcción por etapas": que el símbolo sea una
 * PUERTA DE CONSTRUCCIÓN y que el cuerpo ENSAMBLE con lógica — los dos
 * predicados que el camino viejo ya usa, reusados sin cambiarlos.
 *
 * DE DÓNDE SALE EL PISO, Y POR QUÉ NO HAY UNA CONSTANTE NUEVA EN ESTE
 * CAMINO. No fija ningún umbral propio de tamaño: exige (i) que el hallazgo
 * de nivel 2 EXISTA —su detector ya cruzó su piso citado— y (ii) que la capa
 * de nivel 2 ya haya decidido que hay pasos extraíbles (propuesta viva). Los
 * dos pisos son ajenos y están publicados.
 *
 * EL HECHO, VERIFICADO EN DISCO ANTES DE ESCRIBIR ESTO (y no supuesto):
 * `hypotheses/run.ts#rebuildHypothesesWithGraph` vuelve a llamar `build()`
 * con `ctx.neighborhood` REAL para todo `Finding` cuyo `kind` esté en
 * `anchors` y cuyo archivo primario esté vivo; el docstring de
 * `noEsConvencionDelRepo` (Ola 11) afirma lo contrario porque es ANTERIOR a
 * esa pasada. MEDIDO con la traza de este módulo sobre `corpus/click`: en la
 * ÚLTIMA pasada de los 37 candidatos de las anclas viejas,
 * `findingsInFile` devuelve > 0 en 37 de 37 y `findingsAtSymbol` devuelve un
 * hallazgo de refactorización con propuesta VIVA en 16 de 37. **El canal NO
 * es inerte para este patrón.**
 *
 * POR QUÉ EL HECHO SE LEE DE DOS FUENTES A LA VEZ. En la pasada 2 el
 * `Finding` ancla ES el hallazgo de nivel 2, así que `findingsAtSymbol` —que
 * por contrato EXCLUYE al problema— no lo devuelve: la propuesta de
 * `Extract Method` sobre ÉL MISMO está en `problem.hypotheses`, que en ese
 * momento todavía sostiene el resultado de la pasada 1 (`run.ts` reasigna
 * `finding.hypotheses` recién al terminar el bucle de builders). Se leen las
 * DOS —la propia y la del vecindario— para no depender del orden en que el
 * registro recorre los builders. En la pasada 1 las dos están vacías, el
 * `required` no se sostiene y este camino NO emite: correcto, es la pasada
 * que no tiene el dato.
 * ═══════════════════════════════════════════════════════════════════════ */

/** OLA AN · AN4 — los `kind` que la capa de REFACTORIZACIÓN ancla (nivel 2). Vocabulario de gramática de análisis, no de dominio: son los mismos identificadores que `hypotheses/extract-method.ts` declara en su `anchors`. */
const AN4_ANCLAS_DE_REFACTORIZACION: readonly string[] = ["long-function", "complexity"];
/** OLA AN · AN4 — los patrones de la capa de refactorización cuya propuesta VIVA cuenta como *"acá hay pasos separables"*. */
const AN4_PATRONES_DE_REFACTORIZACION: readonly string[] = ["Extract Method"];
/** OLA AN · AN4 — las tres anclas VIEJAS de este módulo. Se usan sólo para la deduplicación (ver `sinAnclaViejaEnElMismoSimbolo`), nunca para decidir nada del camino viejo. */
const AN4_ANCLAS_VIEJAS: readonly string[] = ["long-parameter-list", "data-clump", OPTIONAL_COMBINATIONS_KIND];

function esAnclaDeRefactorizacion(kind: string): boolean {
  return AN4_ANCLAS_DE_REFACTORIZACION.includes(kind);
}

/** Los dos estados CONFIRMADOS — los que `engine.ts#arbitrateRivalHypotheses` usa para retirar la oportunidad de un patrón rival sobre el mismo rango. */
function esConfirmado(state: string): boolean {
  return state === "ya-aplicado" || state === "aplicado-eludido";
}

/** Hallazgos que comparten ANCLA (archivo + símbolo + ordinal) con alguna ubicación del problema — `findingsAtSymbol` EXCLUYE al problema por contrato (`graph/neighborhood.ts`). */
function an4VecinosEnElSimbolo(problem: Finding, ctx: HypothesisContext): readonly Finding[] {
  const out: Finding[] = [];
  const vistos = new Set<string>();
  for (const loc of problem.locations) {
    for (const f of ctx.neighborhood.findingsAtSymbol(deriveAnchor(loc))) {
      if (vistos.has(f.id)) continue;
      vistos.add(f.id);
      out.push(f);
    }
  }
  return out;
}

function an4ProponeRefactorizacion(f: Finding): readonly string[] {
  return (f.hypotheses ?? [])
    .filter((h) => AN4_PATRONES_DE_REFACTORIZACION.includes(h.pattern) && (h.state === "ausente" || h.state === "parcial"))
    .map((h) => h.pattern);
}

/**
 * `required` 1 del camino nuevo — *"¿la capa de REFACTORIZACIÓN afirma que
 * este cuerpo tiene PASOS separables?"*. NO pregunta por el tamaño (eso es el
 * síntoma que el `kind` crudo ya trae): pregunta por la PROPUESTA VIVA, que
 * es la decisión del nivel 2. Sin vecindario real y sin propuesta propia no
 * se sostiene — nunca aprueba por no haber podido mirar.
 */
function laRefactorizacionVePasos(ctx: HypothesisContext): Check<Finding, CodeGraph | null> {
  return {
    id: "la-refactorizacion-ve-pasos",
    describe:
      "¿La capa de REFACTORIZACIÓN (nivel 2) ya propuso extraer pasos de este mismo símbolo — sobre el propio hallazgo ancla o sobre otro hallazgo que comparte su ancla? Es el hecho que nombra la FUERZA de Builder (construir por etapas), a diferencia del `kind` crudo, que sólo dice que el cuerpo es grande.",
    run: (finding) => {
      const propias = an4ProponeRefactorizacion(finding);
      const vecinas = an4VecinosEnElSimbolo(finding, ctx).flatMap((f) => (esAnclaDeRefactorizacion(f.kind) ? an4ProponeRefactorizacion(f) : []));
      const todas = [...new Set([...propias, ...vecinas])].sort();
      if (todas.length === 0) {
        return {
          holds: false,
          evidence:
            "la capa de refactorización no tiene ninguna propuesta viva sobre este símbolo (ni sobre el propio hallazgo ancla ni sobre otro que comparta su ancla). " +
            "Sin ese hecho, lo único que hay es un cuerpo grande, y para eso el remedio ya lo da el nivel 2: este archivo no agrega un patrón encima.",
        };
      }
      return {
        holds: true,
        evidence: `la capa de refactorización ya propone ${todas.join(", ")} sobre este símbolo: hay pasos separables, que es la forma de la construcción por etapas.`,
      };
    },
  };
}

/**
 * `required` 2 del camino nuevo — LA DEDUPLICACIÓN, escrita en el criterio
 * ANTES de medir el rendimiento. Si sobre este mismo símbolo ya hay un
 * hallazgo de una de las TRES anclas viejas, el camino viejo YA habla ahí:
 * emitir de nuevo no agrega cobertura, duplica la propuesta e infla el
 * denominador. **No le quita nada al camino viejo — le prohíbe al nuevo
 * pisarlo.**
 */
function sinAnclaViejaEnElMismoSimbolo(ctx: HypothesisContext): Check<Finding, CodeGraph | null> {
  return {
    id: "sin-ancla-vieja-en-el-mismo-simbolo",
    describe:
      "¿Este símbolo está libre de las tres anclas VIEJAS de Builder (long-parameter-list / data-clump / optional-construction-combinations)? Si alguna ya está ahí, el camino viejo ya habla y este camino calla para no duplicar la propuesta.",
    run: (finding) => {
      const vecinos = an4VecinosEnElSimbolo(finding, ctx);
      const choque = vecinos.filter((f) => AN4_ANCLAS_VIEJAS.includes(f.kind));
      if (choque.length > 0) {
        return {
          holds: false,
          evidence: `sobre este mismo símbolo ya hay ${choque.length} hallazgo(s) de las anclas viejas de Builder (${[...new Set(choque.map((f) => f.kind))].sort().join(", ")}): el camino viejo ya habla acá.`,
        };
      }
      // Y LA MISMA INTENCIÓN CONTRA SÍ MISMO — medido, no previsto: las DOS
      // anclas de nivel 2 (`long-function` y `complexity`) caen sobre EL MISMO
      // símbolo muy seguido, y sin esto la propuesta sale DUPLICADA y sólo
      // infla el denominador. Contado sobre `corpus/eslint` antes de poner
      // estas líneas: 113 emisiones sobre 71 símbolos distintos — **42
      // duplicadas**. El desempate es determinista y no mira el `kind` (que
      // sería elegir un ancla por gusto): habla el hallazgo de `id` menor.
      const hermanos = vecinos.filter((f) => esAnclaDeRefactorizacion(f.kind));
      const menor = hermanos.find((f) => f.id < finding.id);
      if (menor) {
        return {
          holds: false,
          evidence: `otro hallazgo de la capa de refactorización sobre el MISMO símbolo (${menor.kind}, id ${menor.id}) ya habla por este lugar: una sola propuesta por símbolo, y el desempate es por \`id\` para que sea determinista.`,
        };
      }
      return { holds: true, evidence: "ninguna de las tres anclas viejas de Builder toca este símbolo y ningún hermano de nivel 2 le gana el desempate: no hay propuesta que duplicar." };
    },
  };
}

function buildRefactorSpec(ctx: HypothesisContext): HypothesisSpec<Finding, CodeGraph | null> {
  return {
    pattern: PATTERN,
    ceiling: "alta",
    needs: [],
    required: [laRefactorizacionVePasos(ctx), sinAnclaViejaEnElMismoSimbolo(ctx), construyeUnaEntidad(ctx), ensamblaConLogica(ctx)],
    discriminators: [constructorReal(ctx), grafoConfirmaFormaEstructural],
    appliedState: (p, g) => appliedState(p, g, ctx),
    toConfirm: [
      "Este camino cuelga de una propuesta de la capa de REFACTORIZACIÓN, no de un ancla propia: confirmar a mano que los pasos que `Extract Method` ve son pasos de la CONSTRUCCIÓN de la entidad, y no trabajo ajeno al ensamblado (validación de entrada, logging, manejo de errores) que casualmente vive en el mismo cuerpo.",
      "Si los pasos extraíbles son independientes entre sí y no acumulan estado hacia UNA entidad, el remedio es la refactorización sola (extraer los métodos) y NO un Builder: la refactorización cuesta menos y no agrega un tipo nuevo.",
      "¿Hay más de UNA combinación real de uso parcial? Con una sola forma de construir, un método bien nombrado alcanza — este camino no mide combinatoria (ésa la mide el ancla `optional-construction-combinations`, con su propio número publicado).",
      "Si lo que sobra son DATOS primitivos agrupables y no PASOS, el remedio es un objeto de valor / objeto de parámetros, no construir por etapas.",
    ],
    source: SOURCE,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
 * OLA AZ · FRENTE AZ2 — LAS DOS COMPUERTAS DE PODA, Y SU PRECIO PUBLICADO.
 *
 * POR PRIMERA VEZ ESTE ARCHIVO RETIRA PROPUESTAS QUE COSTABAN UNA VERDADERA.
 * El usuario levantó el límite de costo cero SÓLO para `Builder` y `State`
 * («parten de una gran base que sólo tiene que afinarse, AUNQUE CUESTE
 * VERDADEROS»). El precio va acá, con las dos cifras juntas, porque un corte
 * sin su precio no se puede leer:
 *
 *   `Builder` 11/129 = 8,5 % [5 %, 15 %]  →  10/55 = 18,2 % [10 %, 30 %]
 *   falsas apagadas: 73 · VERDADERAS PERDIDAS: 1 · razón 73 falsas por verdadera.
 *
 * LA VERDADERA QUE ESTO CUESTA, NOMBRADA:
 *   `sqlalchemy lib/sqlalchemy/engine/default.py:445` — `DefaultDialect.__init__`
 *   («12+ parámetros, validación cruzada real: server_side_cursors vs
 *   supports_server_side_cursors», dice su veredicto). La mata la compuerta 2:
 *   sus 13 ranuras tienen 12 valores por defecto y además `**kwargs`.
 *
 * NO ES UNA LISTA DE LENGUAJES, Y ESO ES DELIBERADO. La Ola AY midió que
 * mudar `Builder` en {python, ruby, javascript, typescript} lleva la celda a
 * 19,5 %. Ese conjunto NO es una capacidad: **C# tiene argumentos por nombre
 * Y valores por defecto desde C# 4.0 y está FUERA de la lista; JavaScript no
 * tiene argumentos por nombre y está DENTRO**. Es una lista de resultados
 * vestida de mecanismo, y aterrizarla sería el hardcodeo de lenguaje que dejó
 * a Go mudo en cuatro anclas de `state.ts` durante varias olas. Las dos
 * compuertas de acá abajo leen **el sitio**, con las mismas regex genéricas
 * sobre TIPOS de nodo que ya usan `code-grammar.ts` y `detect/capabilities.ts`
 * — ni un nombre de lenguaje, ni una extensión.
 *
 * VERIFICADO POR SONDA EN LOS SIETE LENGUAJES DEL CORPUS
 * (`scratchpad-az2/probe-params.mts`): python · ruby · javascript ·
 * typescript · go · java · csharp. Los siete leen bien sus ranuras, sus
 * valores por defecto y sus colectores; Go y Java dan `ndef = 0` porque **no
 * tienen** valores por defecto, que es la lectura correcta y no una ceguera.
 * ═══════════════════════════════════════════════════════════════════════ */

/** Vocabulario GENÉRICO compartido por todas las gramáticas — mismo estilo que
 *  `LOOP_WORD`/`EXCEPTION_WORD` de `code-grammar.ts` y que las regex de
 *  `detect/capabilities.ts`. Nunca una lista por lenguaje. */
const RANURA_OPCIONAL_WORD = /(^|_)(default|optional)(_|$)/;
/** El nodo que una gramática interpone para "= <valor>" (C# `equals_value_clause`). */
const RANURA_IGUAL_WORD = /(^|_)(equals|initializer|assignment)(_|$)/;
/** Colector nombrado/variádico: `**kwargs` · `*args` · `...rest` · `*rest` · `xs ...int`. */
const RANURA_COLECTOR_WORD = /(^|_)(splat|rest|spread|variadic)(_|$)/;
/** Qué hijo de una lista de parámetros ES un parámetro (y no un separador o un tipo suelto). */
const RANURA_PARAM_WORD = /(^|_)param(eter)?s?(_|$)/;
/** Campos de gramática que llevan el VALOR por defecto de una ranura. */
const RANURA_VALOR_FIELDS = ["value", "default_value", "right"] as const;

function todosLosHijos(node: AstNode): AstNode[] {
  const out: AstNode[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i) as AstNode | null;
    if (c) out.push(c);
  }
  return out;
}

function esRanura(n: AstNode): boolean {
  return RANURA_PARAM_WORD.test(n.type) || n.type === "identifier" || RANURA_OPCIONAL_WORD.test(n.type) || RANURA_COLECTOR_WORD.test(n.type) || n.type.endsWith("_pattern");
}

function ranuraTieneDefault(p: AstNode): boolean {
  // El TIPO de la propia ranura ya puede ser el del "= valor": `default_parameter`
  // y `optional_parameter` (Python/Ruby/TS) lo dicen con la primera palabra;
  // `assignment_pattern` (JS) y `equals_value_clause` (C#) con la segunda.
  if (RANURA_OPCIONAL_WORD.test(p.type) || RANURA_IGUAL_WORD.test(p.type)) return true;
  for (const f of RANURA_VALOR_FIELDS) if (p.childForFieldName(f)) return true;
  for (const k of todosLosHijos(p)) {
    if (k.isNamed && (RANURA_OPCIONAL_WORD.test(k.type) || RANURA_IGUAL_WORD.test(k.type))) return true;
    // El token desnudo. `?` es la ranura opcional de TypeScript, que la gramática
    // sí nombra (`optional_parameter`) pero que otras podrían no nombrar.
    if (!k.isNamed && (k.text === "=" || k.text === "?")) return true;
  }
  return false;
}

function ranuraEsColector(p: AstNode): boolean {
  if (RANURA_COLECTOR_WORD.test(p.type)) return true;
  for (const k of todosLosHijos(p)) {
    if (k.isNamed && RANURA_COLECTOR_WORD.test(k.type)) return true;
    if (!k.isNamed && (k.text === "**" || k.text === "..." || k.text === "*")) return true;
  }
  return false;
}

/** Lo que la DECLARACIÓN ofrece por sí sola. `null` = no se pudo leer su lista de ranuras. */
interface OptionalidadDeclarada {
  readonly total: number;
  readonly opcionales: number;
  readonly colector: boolean;
}

function optionalidadDeclarada(fnNode: AstNode): OptionalidadDeclarada | null {
  const lista = ((fnNode.childForFieldName("parameters") ?? fnNode.childForFieldName("parameter_list")) as AstNode | null);
  if (!lista) return null;
  const ranuras = namedChildren(lista).filter(esRanura);
  if (ranuras.length === 0) return null;
  return {
    total: ranuras.length,
    opcionales: ranuras.filter(ranuraTieneDefault).length,
    colector: ranuras.some(ranuraEsColector),
  };
}

/** La declaración señalada, si este `Finding` se puede ubicar en el árbol vivo del archivo. */
function declaracionAnclada(finding: Finding, ctx: HypothesisContext): FileUnit["functions"][number] | null {
  const file = ctx.file;
  if (!file) return null;
  for (const loc of finding.locations) {
    if (loc.file !== file.path) continue;
    const fn = findAnchoredFunction(file, loc);
    if (fn) return fn;
  }
  return null;
}

/**
 * COMPUERTA 1 — «LA LISTA LARGA ES LA CONVENCIÓN DE ESTE ARCHIVO».
 *
 * EL MECANISMO, y es el que el propio módulo ya declaraba sin poder medirlo:
 * Builder es el remedio del constructor telescópico, que es un caso PUNTUAL —
 * una puerta de construcción que se destaca. Si el MISMO archivo tiene diez o
 * más declaraciones por encima del piso citado por el detector-ancla, la lista
 * larga no es un defecto puntual: es la forma que tiene ese archivo, y ningún
 * Builder la cambia. (`noEsConvencionDelRepo` decía esto mismo desde la Ola 11,
 * pero es un DISCRIMINADOR y además está inerte en `build()`, donde el
 * vecindario del repo todavía no existe; el archivo, en cambio, sí existe.)
 *
 * EL NÚMERO, sobre los 129 juicios del banco entero: apaga **34 falsas y CERO
 * verdaderas**. Las 11 verdaderas viven en grupos de 1, 3 y 7 declaraciones
 * hermanas; ninguna llega a 10. El umbral se eligió CON MARGEN sobre ese 7 y
 * no en el borde exacto (el borde de costo cero está en 8, y apagaría 43
 * falsas): un umbral pegado al dato es el que se rompe con sujetos frescos, y
 * acá no hay sujetos frescos donde validarlo — la población está juzgada al
 * 100 %.
 *
 * SIN `ctx.file` NO MUDA NADA. Esta compuerta sólo RESTA: es un excluder, y su
 * condición —"esto NO es la convención del archivo"— se cumple de verdad
 * cuando no hay un archivo con diez hermanas, no por no haber podido mirar.
 * Mismo criterio que `prototype.ts#distinctPresets` documenta.
 */
const BUILDER_FILE_CONVENTION_CEILING = 10;

function noEsLaConvencionDelArchivo(ctx: HypothesisContext): Check<Finding, CodeGraph | null> {
  return {
    id: "no-es-la-convencion-del-archivo",
    describe: `el archivo NO tiene ${String(BUILDER_FILE_CONVENTION_CEILING)} o más declaraciones por encima del piso del detector-ancla (si las tiene, la lista larga es la forma del archivo, no un constructor telescópico puntual)`,
    run: (finding) => {
      const file = ctx.file;
      const floor = anchorParameterFloor(finding);
      if (!file || floor === null) {
        return {
          holds: true,
          evidence: "esta compuerta sólo RESTA: sin el árbol del archivo (o sin piso citado por el detector-ancla, que es el caso de `data-clump`) no hay un conjunto de hermanas que contar, así que no hay convención de archivo que oponer y el candidato sigue.",
        };
      }
      const hermanas = file.functions.filter((fn) => fn.metrics.parameters >= floor);
      const holds = hermanas.length < BUILDER_FILE_CONVENTION_CEILING;
      return {
        holds,
        evidence: holds
          ? `${String(hermanas.length)} declaración(es) de "${file.path}" están por encima del piso del detector-ancla (${String(floor)} parámetros), por debajo del techo de ${String(BUILDER_FILE_CONVENTION_CEILING)}: la lista larga NO es la forma de este archivo, este caso se destaca.`
          : `${String(hermanas.length)} declaraciones de "${file.path}" están por encima del piso del detector-ancla (${String(floor)} parámetros). Con tantas hermanas, la lista larga es la FORMA de este archivo y no un constructor telescópico puntual: Builder no es el remedio de una convención (refactoring.guru §Applicability-1 pide una puerta que se destaque).`,
      };
    },
  };
}

/**
 * COMPUERTA 2 — «LA DECLARACIÓN YA ES CONSTRUCCIÓN NOMBRADA Y OPCIONAL».
 *
 * EL MECANISMO: la precondición de Builder no es "muchos parámetros", es que
 * el sitio de construcción esté OBLIGADO A CONTAR POSICIONES, de modo que
 * agregar una ranura opcional obligue a una sobrecarga nueva. Si la propia
 * declaración ya tiene sus ranuras con valor por defecto —o un colector
 * nombrado (`**kwargs`, `opts = {}`, `...options`)— el cliente ya puede
 * nombrar y omitir, y el Builder no compra nada. Es exactamente lo que el
 * `toConfirm` de este módulo declara desde la Ola 12 como su propio punto
 * ciego, convertido por fin en compuerta.
 *
 * DOS ESCALONES, Y LOS DOS TIENEN SU PRECIO MEDIDO POR SEPARADO:
 *
 *  · **CERO ranuras obligatorias ⇒ muda SIEMPRE.** No queda una sola posición
 *    que el cliente esté forzado a pasar: no hay constructor telescópico, ni
 *    siquiera en potencia. Apaga **7 falsas y CERO verdaderas**.
 *  · **La mitad o más de las ranuras ya opcionales, o hay colector nombrado
 *    ⇒ muda SÓLO si el estado sería una RECOMENDACIÓN** (`ausente`/`parcial`).
 *    Apaga **57 falsas y 1 verdadera**. El escalón se restringe a las
 *    recomendaciones porque `ya-aplicado`/`aplicado-eludido` no son
 *    recomendaciones sino confirmaciones: no son el ruido que el usuario
 *    recibe, y ahí viven dos de las once verdaderas.
 *
 * EL UMBRAL DE LA MITAD NO ESTÁ EN UN BORDE. La fracción de ranuras ya
 * opcionales de las once verdaderas es 0 % (×6), 20 %, 30 %, 92 %, 94 % y
 * 96 %: hay un hueco entero entre 30 % y 92 %, así que CUALQUIER umbral entre
 * 1/3 y 2/3 parte la población de verdaderas exactamente igual. La mitad es el
 * medio de esa meseta, no su filo.
 *
 * SIN ÁRBOL NO MUDA NADA — mismo criterio de excluder que la compuerta 1.
 */
function noEsConstruccionYaNombrada(ctx: HypothesisContext): Check<Finding, CodeGraph | null> {
  return {
    id: "no-es-construccion-ya-nombrada",
    describe:
      "la declaración señalada NO ofrece ya construcción nombrada y opcional (ranuras con valor por defecto, o un colector nombrado): si ya la ofrece, el cliente no está forzado a contar posiciones y el constructor telescópico que Builder resuelve no existe",
    run: (finding, graph) => {
      const fn = declaracionAnclada(finding, ctx);
      if (!fn) {
        return {
          holds: true,
          evidence: "esta compuerta sólo RESTA: sin la declaración ubicada en el árbol vivo no hay lista de ranuras que leer, así que no hay construcción ya nombrada que oponer y el candidato sigue.",
        };
      }
      const opt = optionalidadDeclarada(fn.node);
      if (opt === null) {
        return {
          holds: true,
          evidence: `la gramática no expuso una lista de ranuras para "${fn.name ?? "(anónima)"}": esta compuerta sólo RESTA y no hay nada que oponer.`,
        };
      }
      const obligatorias = opt.total - opt.opcionales;
      const detalle = `"${fn.name ?? "(anónima)"}" declara ${String(opt.total)} ranura(s), ${String(opt.opcionales)} con valor por defecto${opt.colector ? " y un colector nombrado (`**kwargs`/`opts`/`...rest`)" : ""}`;
      if (obligatorias === 0) {
        return {
          holds: false,
          evidence: `${detalle}: NO queda una sola posición que el cliente esté obligado a pasar. La construcción ya es enteramente nombrada y opcional, así que el constructor telescópico que Builder resuelve no existe acá (refactoring.guru §Applicability-1).`,
        };
      }
      const mayoritariamenteOpcional = opt.colector || opt.opcionales * 2 >= opt.total;
      if (!mayoritariamenteOpcional) {
        return {
          holds: true,
          evidence: `${detalle}: ${String(obligatorias)} de ${String(opt.total)} ranuras son OBLIGATORIAS y no hay colector nombrado — el cliente está forzado a contar posiciones, que es la precondición de Builder.`,
        };
      }
      // Segundo escalón: sólo pisa RECOMENDACIONES. `ya-aplicado`/`aplicado-eludido`
      // son confirmaciones, no el ruido que el usuario recibe — y ahí viven dos de
      // las once verdaderas del banco.
      const estado = appliedState(finding, graph, ctx).state;
      if (estado !== "ausente" && estado !== "parcial") {
        return {
          holds: true,
          evidence: `${detalle}, pero el estado de esta afirmación es "${estado}": una confirmación, no una recomendación. Esta compuerta sólo pisa recomendaciones.`,
        };
      }
      return {
        holds: false,
        evidence: `${detalle}: la mitad o más de las ranuras ya son opcionales (o hay un colector nombrado), así que el cliente YA puede nombrar y omitir. Un Builder no compra nada acá — el remedio que sí puede faltar es el que el propio ancla señala (agrupar los datos), no construir por etapas.`,
      };
    },
  };
}

/**
 * Ola 11 — `refreshing` (default `false`): controla únicamente
 * `noEsConvencionDelRepo` (ver su docstring). `grafoConfirmaFormaEstructural`
 * no necesita el flag: ya se declara conservador por sí solo cuando
 * `graph === null` (el caso real de `build()` para este ancla).
 */
function buildSpec(ctx: HypothesisContext, refreshing = false): HypothesisSpec<Finding, CodeGraph | null> {
  return {
    pattern: PATTERN,
    // "alta": sin señal de opcionalidad de parámetro disponible, el techo no
    // se condiciona por lenguaje; la escalera de discriminadores (ambos
    // disponibles en los 9 lenguajes) hace el trabajo equivalente.
    ceiling: "alta",
    needs: [],
    // Ola 12 — `ensambla-con-logica` es EL DISCRIMINADOR nuevo (ver el
    // docstring del módulo): sin él, "muchos parámetros + forma de
    // constructor/fábrica" alcanzaba para sugerir Builder, aunque el cuerpo
    // sólo asignara/reenviara — la causa medida de los 7 falsos vivos.
    // OLA AZ (AZ2) — LAS DOS COMPUERTAS DE PODA VAN AL FINAL, y el orden es
    // deliberado: `engineBuild` corta en el PRIMER `required` que falla, así
    // que `no-es-construccion-ya-nombrada` —el único que vuelve a evaluar
    // `appliedState`— sólo corre para los candidatos que ya pasaron los tres
    // de siempre, que es exactamente la población que iba a evaluarlo igual.
    required: [anclaReconocida, construyeUnaEntidad(ctx), ensamblaConLogica(ctx), noEsLaConvencionDelArchivo(ctx), noEsConstruccionYaNombrada(ctx)],
    discriminators: [magnitudFuerte, constructorReal(ctx), noEsConvencionDelRepo(ctx, refreshing), grafoConfirmaFormaEstructural],
    appliedState: (p, g) => appliedState(p, g, ctx),
    toConfirm: [
      "¿Los parámetros/el grupo configuran de verdad UNA sola entidad, o son argumentos independientes que coinciden en número por casualidad?",
      "¿Los call sites existentes ya pasan casi siempre los mismos valores en los parámetros candidatos a opcional?",
      'Este lenguaje puede tener el modismo idiomático real (hash de opciones en Ruby `initialize(opts = {})`, `**kwargs` en Python) que esta regla NO ve — cuenta como UN solo parámetro sintáctico, así que la señal estructural es ciega ahí; confirmar a mano.',
      "Si el estado quedó en 'ausente' o 'parcial' por falta de grafo (ver el check 'forma estructural del grafo'): confirmar a mano si ya existe un Builder en OTRO archivo antes de sugerir uno nuevo — el límite es de cableado, no de evidencia real.",
      "El chequeo 'ensambla-con-logica' es un proxy estructural: confirmar a mano que la lógica condicional/los sub-objetos/el bloque detectados de verdad CONSTRUYEN esta entidad por etapas, y no son trabajo no relacionado con el ensamblado (manejo de errores genérico, logging, validación de un solo campo aislado).",
    ],
    source: SOURCE,
  };
}

/**
 * OLA AA (frente AA2) — SIDE-CHANNEL DE DIAGNÓSTICO, mismo patrón exacto que
 * `AnalyzeOptions.onGraph`/`onFacts`/`onPreCapFindings` de `code-analyzer.ts`:
 * ausente (el default) ⇒ cero costo, cero cambio de comportamiento para
 * `build()` ni para ningún caller que no lo sepa. Existe porque
 * `engineBuild()` (`engine.ts`) descarta el detalle de CUÁL `required` falló
 * en cuanto uno solo no se cumple (`requiredResults.some(...) => return null`)
 * — la pregunta del encargo ("en QUÉ compuerta mueren") no es respondible
 * desde `finding.hypotheses` en producción, que sólo ve "no hay Builder acá".
 * Un script de medición setea `onRequiredDiagnosed` antes de correr
 * `analyzeRepo` real (mismo `ctx.file` vivo que ve la producción, ver el
 * límite de cableado documentado arriba) y recibe, para CADA `Finding` que
 * pasa por `build()`, el resultado de sus tres `required` en orden — sin
 * volver a evaluarlos una segunda vez salvo cuando el hook está seteado.
 */
export let onRequiredDiagnosed: ((problem: Finding, results: readonly { id: string; holds: boolean; evidence: string }[]) => void) | null = null;
export function setRequiredDiagnostics(fn: typeof onRequiredDiagnosed): void {
  onRequiredDiagnosed = fn;
}

export function build(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
  // OLA AE (AE4) — DESVÍO ADITIVO: el ancla nueva tiene su propio `required`,
  // sus propios discriminadores y su propia escalera de estado. Para los dos
  // kinds viejos esta línea devuelve exactamente el mismo `spec` de antes.
  if (problem.kind === OPTIONAL_COMBINATIONS_KIND) return buildOptionalCombinations(problem, graph, ctx);
  // OLA AN (AN4) — segundo DESVÍO ADITIVO, misma forma exacta que el de AE4: el
  // ancla de NIVEL 2 tiene su propio `spec`, sus propios `required` y su propio
  // camino. Para los dos kinds viejos esta línea no cambia nada.
  if (esAnclaDeRefactorizacion(problem.kind)) return buildDesdeRefactorizacion(problem, graph, ctx);
  const spec = buildSpec(ctx);
  if (onRequiredDiagnosed) {
    const results = spec.required.map((c) => {
      const r = c.run(problem, graph);
      return { id: c.id, holds: r.holds, evidence: r.evidence };
    });
    // SONDA ADICIONAL (no forma parte de `required`, ver la firma de
    // `engineBuild`: se corta en el PRIMER `required` que falla) — corre
    // `ensambla-con-logica` IGUAL, aunque `construye-una-entidad` ya haya
    // matado al candidato, para responder la pregunta que la cadena
    // corto-circuitada no puede: "si la compuerta 1 no lo hubiera cortado,
    // ¿la compuerta 2 lo habría dejado pasar?" — reusa el MISMO `Check`
    // (`ensamblaConLogica(ctx)`), nunca una segunda implementación que podría
    // desalinearse.
    results.push({ id: "ensambla-con-logica[sonda-sin-cortocircuito]", ...ensamblaConLogica(ctx).run(problem, graph) });
    onRequiredDiagnosed(problem, results);
  }
  const outcome = engineBuild(spec, ctx.capabilities, problem, graph);
  if (ai6TraceEnabled()) ai6Record("lpl/data-clump", spec, problem, problem, graph, ctx, graph !== null, outcome !== null);
  if (!outcome) return null;

  return toPatternHypothesis(spec, outcome, {
    anchorFindingId: problem.id,
    places: problem.locations.map((loc) => ({ ...loc, role: `candidato a Builder: ${loc.role}` })),
    cost:
      "Una clase Builder (o, en Ruby/Python, una función que arma el objeto a partir de un bloque/kwargs) — " +
      "se justifica cuando construir la entidad tiene lógica real entre pasos (condicionales, validación " +
      "incremental, ensamblar sub-objetos, un DSL con bloques) y además hay ≥2 combinaciones reales de uso " +
      "parcial; un constructor/fábrica que sólo asigna o reenvía sus parámetros no lo necesita — un objeto de " +
      "parámetros (Parameter Object / kwargs / record) alcanza y cuesta menos.",
  });
}

/**
 * OLA AE (AE4) — el camino del ancla-fuerza, entero. Ni una línea del camino
 * viejo pasa por acá.
 */
function buildOptionalCombinations(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
  const spec = buildOptionalCombinationsSpec(ctx);
  if (onRequiredDiagnosed) {
    onRequiredDiagnosed(
      problem,
      spec.required.map((c) => {
        const r = c.run(problem, graph);
        return { id: c.id, holds: r.holds, evidence: r.evidence };
      }),
    );
  }
  const outcome = engineBuild(spec, ctx.capabilities, problem, graph);
  if (ai6TraceEnabled()) ai6Record("optional-combinations", spec, problem, problem, graph, ctx, graph !== null, outcome !== null);
  if (!outcome) return null;

  return toPatternHypothesis(spec, outcome, {
    anchorFindingId: problem.id,
    places: problem.locations.map((loc) => ({ ...loc, role: `candidato a Builder: ${loc.role}` })),
    cost:
      "Un objeto que acumule los pasos elegidos y construya la entidad al final (una clase Builder, o en Ruby/Python una " +
      "función que arma el objeto a partir de un bloque/kwargs) — se justifica cuando la combinatoria de pasos opcionales " +
      "es real y está repartida entre los sitios, que es lo que este ancla mide. Si las combinaciones son pocas y estables, " +
      "una escalera de fábricas con nombre (o un objeto de parámetros) cuesta menos.",
  });
}

/**
 * OLA AN (AN4) — el camino del ancla de NIVEL 2, entero. Ni una línea de los
 * dos caminos viejos pasa por acá.
 */
function buildDesdeRefactorizacion(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
  const spec = buildRefactorSpec(ctx);
  if (onRequiredDiagnosed) {
    onRequiredDiagnosed(
      problem,
      spec.required.map((c) => {
        const r = c.run(problem, graph);
        return { id: c.id, holds: r.holds, evidence: r.evidence };
      }),
    );
  }
  const outcome = engineBuild(spec, ctx.capabilities, problem, graph);
  if (ai6TraceEnabled()) ai6Record("nivel-2", spec, problem, problem, graph, ctx, graph !== null, outcome !== null && !esConfirmado(outcome.state));
  if (!outcome) return null;
  // LA COMPUERTA QUE PROTEGE A LA CAPA DE LA QUE ESTE CAMINO CUELGA — y no es
  // teórica, está MEDIDA. `engine.ts#arbitrateRivalHypotheses` RETIRA una
  // oportunidad cuando un patrón RIVAL la confirma sobre el mismo rango
  // (`ya-aplicado`/`aplicado-eludido` + `sameSubject`). Como este camino ancla
  // en el MISMO `Finding` que `Extract Method`, un estado confirmado acá
  // BORRA la propuesta de refactorización que lo disparó: medido sobre el
  // corpus antes de poner esta línea — `rubocop lib/rubocop/config.rb:31`
  // (1) y `nest ws-adapter.ts:65` + `module-ref.ts:163` (2) perdieron su
  // `Extract Method`, TRES propuestas de nivel 2 destruidas por un camino que
  // vino a SUMAR. Además `ya-aplicado` no es el entregable de este proyecto
  // (el entregable es `ausente` + `parcial`), así que callar acá no pierde
  // ninguna recomendación: sólo deja de emitir una confirmación que nadie
  // pidió y que costaba una propuesta ajena.
  if (esConfirmado(outcome.state)) return null;

  return toPatternHypothesis(spec, outcome, {
    anchorFindingId: problem.id,
    places: problem.locations.map((loc) => ({ ...loc, role: `candidato a Builder (vía la capa de refactorización): ${loc.role}` })),
    cost:
      "Una clase Builder (o, en Ruby/Python, una función que arma el objeto a partir de un bloque/kwargs) que reciba los pasos que la " +
      "refactorización ya identificó como separables — se justifica cuando esos pasos ACUMULAN hacia UNA entidad y hay más de una " +
      "combinación real de uso parcial; si los pasos son independientes, extraer los métodos (la refactorización sola) alcanza y " +
      "cuesta menos, y si lo que sobra son datos primitivos agrupables el remedio es un objeto de valor.",
  });
}

/**
 * Ola 11 — sin `refreshState`: a diferencia de `strategy.ts`/`chain-of-
 * responsibility.ts`, ninguno de los dos discriminadores nuevos necesita
 * nada derivado del árbol vivo (`noEsConvencionDelRepo` sólo lee
 * `ctx.neighborhood`/`finding.kind`; `grafoConfirmaFormaEstructural` sólo
 * lee `finding.locations` + el grafo real) — ambos se re-evalúan desde cero
 * en `refresh()` sin caché. `state`/`checks` (`appliedState`, el excluder
 * fusionado con `evaluateGraphShape`) NUNCA se re-corren acá — prohibido por
 * contrato; sólo `discriminators`/`confidence` cambian.
 */
export function refresh(existing: PatternHypothesisDraft, problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null {
  if (existing.state !== "ausente" && existing.state !== "parcial") return null; // no compiten por confianza — mismo criterio que engine.ts#refreshDiscriminators.
  // OLA AE (AE4) — mismo desvío aditivo que en `build()`: para los dos kinds
  // viejos esta línea devuelve exactamente el mismo `spec` de antes.
  const spec = problem.kind === OPTIONAL_COMBINATIONS_KIND
    ? buildOptionalCombinationsSpec(ctx)
    : esAnclaDeRefactorizacion(problem.kind)
      ? buildRefactorSpec(ctx) // OLA AN (AN4) — mismo desvío aditivo que en `build()`.
      : buildSpec(ctx, true);
  return refreshDiscriminators(spec, existing, problem, graph ?? ctx.repo.graph);
}

/* ═══════════════════════════════════════════════════════════════════════
 * OLA 13 — LA RAMA NEGATIVA: PARAMETER OBJECT (RAICES.md, frente "el
 * remedio correcto es otro"). Ver `hypotheses/types.ts#PatternAlternative`
 * para la decisión de representación completa (por qué es un tipo hermano,
 * no un campo/marcador de `PatternHypothesis`) y para el límite de cableado
 * declarado (no cuelga de `Finding`/`CodeFinding` todavía — prohibido tocar
 * `detect/` esta ola).
 *
 * EL REQUIRED DE LA ALTERNATIVA — condición no negociable #1 del encargo,
 * "tan exigente como la positiva": reusa LOS MISMOS DOS PRIMEROS checks que
 * el `required` de Builder (`ancla-reconocida`, `construye-una-entidad`) y
 * agrega el tercero INVERTIDO (`solo-asigna-o-reenvia`, arriba) — la
 * partición exacta de `ensambla-con-logica`, nunca un fallback permisivo.
 * Consecuencia deliberada: "cualquier lista larga de parámetros que no es
 * Builder" NO se convierte en Parameter Object sólo por descartar Builder —
 * también tiene que tener forma de construir UNA entidad (`construye-una-
 * entidad`), igual que Builder. Sin esa segunda condición, cualquier función
 * con muchos parámetros independientes (nunca una entidad) dispararía la
 * alternativa por la puerta de atrás — exactamente el ruido que RAICES.md
 * pide no reabrir "con nuestro nombre puesto".
 * ═══════════════════════════════════════════════════════════════════════ */

const PARAMETER_OBJECT_REMEDY = "Parameter Object" as const;
// Misma fuente que ya cita el detector-ancla (`detect/intra-function/long-
// parameter-list.ts`): la página de refactoring.guru sobre ESTE code smell
// ya nombra "Introduce Parameter Object" como uno de sus dos remedios (el
// otro es Builder) — no hace falta una fuente nueva.
const PARAMETER_OBJECT_SOURCE = "https://refactoring.guru/es/smells/long-parameter-list";

/**
 * *** SEPARACIÓN CRITERIO/TEXTO, LA MITAD TEXTO *** (condición no negociable
 * #3 del encargo). Todo lo de ARRIBA (`assemblyVerdict`/`soloAsignaOReenvia`)
 * es el CRITERIO: 100% estructural, nunca nombra un lenguaje. Esto de ACÁ es
 * el REMEDIO: puede nombrar el idioma del LENGUAJE (`kwargs`, `Data.define`,
 * un `record`) — conocimiento de GRAMÁTICA, permitido — pero nunca nombra un
 * framework/librería (`Rails.application.routes.draw` sigue prohibido). Si
 * un lenguaje no tiene un modismo dedicado (o no se reconoce el `language`),
 * el texto genérico ("agrupar en un objeto") sigue siendo correcto en los 9
 * lenguajes del corpus — nunca falla por lenguaje desconocido.
 */
function parameterObjectSuggestion(language: string | null): string {
  switch (language) {
    case "ruby":
      return (
        "Un Parameter Object: un hash de opciones (`initialize(opts = {})`, el modismo " +
        "clásico de Ruby) o, en Ruby 3.2+, `Data.define(...)` — ninguno de los dos necesita " +
        "un Builder para construirse por etapas."
      );
    case "python":
      return (
        "Un Parameter Object: `**kwargs`, o un `dataclass`/`NamedTuple` que agrupe los campos — " +
        "la lista de parámetros deja de crecer sin necesitar construcción por etapas."
      );
    case "java":
      return (
        "Un Parameter Object: un `record` (Java 16+) o una clase de sólo datos con un único " +
        "constructor — un Builder no aporta nada sobre eso si no hay ensamblaje entre pasos."
      );
    case "csharp":
      return (
        "Un Parameter Object: un `record` (C# 9+) o una clase/`struct` de opciones — evita el " +
        "constructor telescópico sin necesitar un Builder."
      );
    case "typescript":
    case "tsx":
      return (
        "Un Parameter Object: un objeto de opciones TIPADO, desestructurado en la firma — sin " +
        "ensamblaje entre pasos, un Builder es sobre-ingeniería."
      );
    case "javascript":
    case "vue":
      return (
        "Un Parameter Object: un objeto de opciones desestructurado en la firma — sin ensamblaje " +
        "entre pasos, un Builder es sobre-ingeniería."
      );
    case "go":
      return (
        "Un Parameter Object: un struct de opciones pasado por valor — el modismo nativo de Go " +
        "para reemplazar un constructor con muchos parámetros, sin builder-pattern encima."
      );
    default:
      return (
        "Un Parameter Object: agrupar los parámetros que viajan juntos en un solo objeto/" +
        "estructura de datos — sin ensamblaje entre pasos, un Builder no aporta nada sobre eso."
      );
  }
}

/**
 * Ver el docstring de más arriba en esta sección ("OLA 13") para el
 * `required` completo. `null` en la MISMA polaridad que `build`: sin
 * evidencia positiva de las tres condiciones, silencio — nunca una
 * alternativa a medias.
 */
export function buildAlternative(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternAlternative | null {
  const ancla = anclaReconocida.run(problem, graph);
  const anclaCheck: PatternHypothesisCheck = { label: anclaReconocida.describe, passed: ancla.holds, why: ancla.evidence, role: "required" };
  if (!ancla.holds) return null;

  const entidadSpec = construyeUnaEntidad(ctx);
  const entidad = entidadSpec.run(problem, graph);
  const entidadCheck: PatternHypothesisCheck = { label: entidadSpec.describe, passed: entidad.holds, why: entidad.evidence, role: "required" };
  if (!entidad.holds) return null;

  const soloAsignaSpec = soloAsignaOReenvia(ctx);
  const soloAsigna = soloAsignaSpec.run(problem, graph);
  const soloAsignaCheck: PatternHypothesisCheck = { label: soloAsignaSpec.describe, passed: soloAsigna.holds, why: soloAsigna.evidence, role: "required" };
  if (!soloAsigna.holds) return null;

  return {
    discardedPattern: PATTERN,
    remedy: PARAMETER_OBJECT_REMEDY,
    checks: [anclaCheck, entidadCheck, soloAsignaCheck],
    why: soloAsigna.evidence,
    suggestion: parameterObjectSuggestion(problem.language),
    places: problem.locations.map((loc) => ({ ...loc, role: `candidato a Parameter Object: ${loc.role}` })),
    toConfirm: [
      "¿Los parámetros que sólo se asignan de verdad conforman UN objeto de datos cohesivo, o son argumentos independientes que coinciden en número por casualidad (misma pregunta que Builder, ver arriba)?",
      "¿El lenguaje ya tiene, en la mayoría de los call sites, el modismo nativo que haría innecesario incluso este Parameter Object (un hash/kwargs ya usado casi siempre)?",
      "Este chequeo sólo mira el CUERPO del lugar señalado: si la lógica de ensamblaje vive en OTRO lugar (otro archivo, otra función que arma este mismo tipo por etapas) que este análisis no cruza, confirmar a mano antes de descartar Builder del todo.",
    ],
    source: PARAMETER_OBJECT_SOURCE,
    anchorFindingId: problem.id,
  };
}

/**
 * *** `buildAlternative` NO SE REGISTRA ACÁ — CONDICIÓN DE FRACASO MEDIDA,
 * NO UN OLVIDO *** (ver el docstring del módulo, sección "OLA 13 — EL
 * RESULTADO MEDIDO", para el número completo y el razonamiento). La función
 * `buildAlternative` (exportada arriba) es correcta y está probada — hace
 * exactamente lo que documenta — pero SU PRECISIÓN MEDIDA sobre 15
 * ubicaciones reales de código, 3 lenguajes (Ruby/TypeScript/Java),
 * juzgadas a mano y cargadas en
 * `tests/golden/precision/builder-alternative.hypotheses.csv`, es **43%
 * (6 verdadero / 14 juzgadas, Wilson95 [21%, 67%], 1 dudoso excluido)** —
 * por DEBAJO del piso de 50% que el encargo exige. La rama negativa
 * **vuelve a ser silencio**, tal como el encargo prevé como salida válida:
 * "si no llegan, la rama negativa vuelve a ser silencio y lo declarás con
 * el número". No se registra `buildAlternative` en el `HypothesisBuilder`
 * — mismo comportamiento que CUALQUIER patrón que no la implementa
 * ("un builder que no la implementa simplemente no propone ninguna").
 */
/* ────────────────────────────────────────────────────────────────────────
 * OLA AI, FRENTE AI6 — LA TRAZA DEL EMBUDO. Mismo mecanismo, misma forma y
 * mismo default que `strategy.ts#startStrategyTrace` (Ola AH) y que
 * `engine.ts#startArbitrationTrace`: ningún `process.env` en el camino de
 * análisis, se prende llamando `startAi6Trace()` desde un script de medición
 * y se apaga sola al leerla. `null` (el default de producción) ⇒ costo cero:
 * ni una rama de más por hallazgo, ni un check de más corrido.
 *
 * QUÉ CONTESTA, y por qué el volcado de producción no puede contestarlo: el
 * volcado sólo publica lo que SOBREVIVE — `engine.ts#build` devuelve `null`
 * en cuanto UN `required` no se sostiene, y con él se pierde CUÁL no se
 * sostuvo. La pregunta de esta ola ("¿hay un `required` que, para un
 * subconjunto identificable de su entrada, no se pueda satisfacer POR
 * CONSTRUCCIÓN?") no es respondible sin el resultado de CADA `required`
 * también en los hallazgos que no emiten. Con la traza prendida se re-corren
 * los `required` y `appliedState` de esta hipótesis (son puros: leen
 * `problem`/`graph`/`ctx` y no escriben nada) para registrar el resultado
 * por check y el estado que la hipótesis HABRÍA tenido.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * OLA AN, FRENTE AN4 — **SÓLO MEDICIÓN.** El sondeo del canal de nivel 2, calculado
 * ÚNICAMENTE dentro de `ai6Record` (o sea sólo con la traza prendida desde un script):
 * en producción (`ai6Trace === null`) no se calcula ni uno, ningún `required` lo lee y
 * ninguna decisión del analizador depende de él.
 *
 * QUÉ CONTESTA, y es la pregunta que decide si este frente puede aterrizar algo: **¿el
 * hecho de nivel 2 está DISPONIBLE en el punto donde esta hipótesis se evalúa?** El
 * docstring de `noEsConvencionDelRepo` (Ola 11) afirma que `build()` ve SIEMPRE
 * `EMPTY_NEIGHBORHOOD` para este ancla — pero la pasada de grafo de la Ola V
 * (`hypotheses/run.ts#rebuildHypothesesWithGraph`) es POSTERIOR a esa afirmación y vuelve
 * a llamar `build()` con el índice real. `vecinosEnArchivo === 0` en la ÚLTIMA pasada
 * significa vecindario vacío ⇒ cualquier chequeo que lea el canal sería INERTE.
 */
export interface Ai6Level2Probe {
  /** Cuántos hallazgos ve `findingsInFile` sobre el archivo del problema (0 = vecindario vacío). */
  readonly vecinosEnArchivo: number;
  /** De ésos, cuántos traen al menos una hipótesis ya colgada — la prueba de que el RESULTADO de otra hipótesis es legible desde acá. */
  readonly vecinosConHipotesis: number;
  /** Hallazgos de `kind` de refactorización en el MISMO ARCHIVO, por kind. */
  readonly refacEnArchivo: readonly (readonly [string, number])[];
  /** Hallazgos de `kind` de refactorización sobre el MISMO SÍMBOLO (`findingsAtSymbol` sobre CADA ubicación del problema), por kind. */
  readonly refacEnSimbolo: readonly (readonly [string, number])[];
  /** De `refacEnSimbolo`, los patrones de refactorización con propuesta VIVA (`ausente`/`parcial`) colgada. */
  readonly refacEnSimboloConPropuesta: readonly string[];
  /** Ídem, en el mismo ARCHIVO — para separar "por archivo" de "por símbolo". */
  readonly refacEnArchivoConPropuesta: readonly string[];
}

export interface Ai6TraceEntry {
  readonly findingId: string;
  readonly kind: string;
  readonly language: string | null;
  readonly file: string;
  readonly line: number;
  readonly symbol: string;
  /** `locations[0].role` — el detector escribe ahí la sub-forma (p.ej. `(tipado)`/`(literal)`). */
  readonly role: string;
  /** Cuál de los caminos del archivo corrió (un archivo puede tener specs distintos por ancla). */
  readonly camino: string;
  readonly withGraph: boolean;
  /** ¿había árbol vivo? — el eje que separa "no se pudo confirmar" de "se confirmó que no". */
  readonly withFile: boolean;
  readonly checks: readonly { readonly id: string; readonly holds: boolean; readonly why: string }[];
  /** El primero de `required` que NO se sostiene; `null` si todos se sostienen. Con `spec === null` (muerte ANTES del motor) lleva el motivo, prefijado `pre-spec:`. */
  readonly diesAt: string | null;
  /** El estado que `appliedState` decide — se registra TAMBIÉN cuando un `required` mata la hipótesis, porque es el dato que dice qué se está perdiendo. */
  readonly appliedState: string;
  readonly emitted: boolean;
  /** OLA AN · AN4 — sólo medición, ver `Ai6Level2Probe`. */
  readonly nivel2: Ai6Level2Probe;
}

let ai6Trace: Ai6TraceEntry[] | null = null;

export function startAi6Trace(): void {
  ai6Trace = [];
}

export function takeAi6Trace(): readonly Ai6TraceEntry[] {
  const t = ai6Trace ?? [];
  ai6Trace = null;
  return t;
}

export function ai6TraceEnabled(): boolean {
  return ai6Trace !== null;
}

/** OLA AN · AN4 — los tres `kind` que la CAPA DE REFACTORIZACIÓN (nivel 2) ancla hoy: `long-function` y `complexity` (Extract Method) y `primitive-obsession` (Value Object). SÓLO MEDICIÓN: no lo lee ningún `required`. */
const AN4_REFACTORING_KINDS: readonly string[] = ["long-function", "complexity", "primitive-obsession"];
/** OLA AN · AN4 — los patrones de la capa de refactorización, para reconocer una PROPUESTA VIVA (no sólo el `kind` crudo). SÓLO MEDICIÓN. */
const AN4_REFACTORING_PATTERNS: readonly string[] = ["Extract Method", "Value Object", "Null Object"];

/** OLA AN · AN4 — SÓLO MEDICIÓN, corre sólo con la traza prendida. Ver `Ai6Level2Probe`. */
function an4Level2Probe(problem: Finding, ctx: HypothesisContext): Ai6Level2Probe {
  const file = problem.locations[0]?.file ?? "";
  const enArchivo = file ? ctx.neighborhood.findingsInFile(file) : [];
  const vivas = (f: Finding): readonly string[] =>
    (f.hypotheses ?? []).filter((h) => AN4_REFACTORING_PATTERNS.includes(h.pattern) && (h.state === "ausente" || h.state === "parcial")).map((h) => h.pattern);
  const cuenta = (list: readonly Finding[]): readonly (readonly [string, number])[] => {
    const m = new Map<string, number>();
    for (const f of list) if (AN4_REFACTORING_KINDS.includes(f.kind)) m.set(f.kind, (m.get(f.kind) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  };
  const enSimbolo: Finding[] = [];
  const seen = new Set<string>();
  for (const loc of problem.locations) {
    for (const f of ctx.neighborhood.findingsAtSymbol(deriveAnchor(loc))) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      enSimbolo.push(f);
    }
  }
  const propSim = new Set<string>();
  for (const f of enSimbolo) if (AN4_REFACTORING_KINDS.includes(f.kind)) for (const p of vivas(f)) propSim.add(p);
  const propArch = new Set<string>();
  for (const f of enArchivo) if (AN4_REFACTORING_KINDS.includes(f.kind)) for (const p of vivas(f)) propArch.add(p);
  return {
    vecinosEnArchivo: enArchivo.length,
    vecinosConHipotesis: enArchivo.filter((f) => (f.hypotheses ?? []).length > 0).length,
    refacEnArchivo: cuenta(enArchivo),
    refacEnSimbolo: cuenta(enSimbolo),
    refacEnSimboloConPropuesta: [...propSim].sort(),
    refacEnArchivoConPropuesta: [...propArch].sort(),
  };
}

function ai6Record<P, G>(
  camino: string,
  spec: HypothesisSpec<P, G> | null,
  problem: Finding,
  p: P,
  g: G,
  ctx: HypothesisContext,
  graphPresent: boolean,
  emitted: boolean,
  motivo?: string,
): void {
  if (!ai6Trace) return;
  const loc = problem.locations[0];
  const checks = spec
    ? spec.required.map((c) => {
        const r = c.run(p, g);
        return { id: c.id, holds: r.holds, why: r.evidence };
      })
    : [];
  ai6Trace.push({
    findingId: problem.id,
    kind: problem.kind,
    language: problem.language,
    file: loc?.file ?? "",
    line: loc?.startLine ?? 0,
    symbol: loc?.symbol ?? "",
    role: loc?.role ?? "",
    camino,
    withGraph: graphPresent,
    withFile: ctx.file !== null,
    checks,
    diesAt: spec ? (checks.find((c) => !c.holds)?.id ?? null) : `pre-spec:${motivo ?? "?"}`,
    // `appliedState` sólo se evalúa cuando TODOS los `required` se sostienen —
    // que es exactamente cuando producción también lo evalúa. Evaluarlo
    // siempre (la forma de `strategy.ts#recordStrategyTrace`) multiplicaba por
    // ~2 el costo de guava: `command.ts#appliedState` recorre el grafo del
    // repo y el ancla `duplication` tiene 1.089 hallazgos en ese repo, de los
    // que 1.067 mueren en el primer `required`. Medido: 4,7 min → 8,3 min.
    appliedState: spec ? (checks.every((c) => c.holds) ? spec.appliedState(p, g).state : "(no evaluado: murió en un required)") : "(sin spec)",
    emitted,
    nivel2: an4Level2Probe(problem, ctx),
  });
}

export const hypothesis: HypothesisBuilder = {
  id: "builder",
  pattern: PATTERN,
  layer: "patron",
  // OLA AE (AE4): el array SUMA la tercera ancla y CONSERVA las dos viejas —
  // la Ola AE es ADITIVA. Las dos viejas rinden mal y su número está publicado
  // (3/34 = 8,8 % en bibliotecas, 0/9 en aplicaciones; `data-clump` produce
  // CERO hipótesis sobre 149 hallazgos crudos en los 13 repos), y aun así NO se
  // tocan: el recorte de falsos lo decide el usuario, no un frente.
  // OLA AN (AN4) — EL ARRAY QUEDA EXACTAMENTE COMO ESTABA, y eso es el
  // RESULTADO, no una omisión. Se construyó, se cableó y se midió una CUARTA
  // vía —el ancla de NIVEL 2, `long-function`/`complexity`— sobre los 21 repos
  // con un contrafáctico de una sola variable: emitió **395 recomendaciones**
  // (167 en bibliotecas, 7 repos; 228 en aplicaciones, 8 repos) y acertó
  // **0 de 58** juzgadas a mano abriendo el archivo real, contra el 12,5 % de
  // `long-parameter-list` en bibliotecas y el 6,1 % en aplicaciones. La
  // condición de aterrizaje —escrita ANTES de medir— era "no peor que la celda
  // actual", así que **NO SE ATERRIZA**: el número se publica y el camino
  // queda en el archivo, probado y desconectado. Ver `ola-an/informes/AN4.md`.
  //
  // OLA AY (AY3) — LA TERCERA ANCLA SE DA DE BAJA. Y es la PRIMERA vez que
  // este array se recorta, así que la razón va entera y con el número.
  //
  // La regla que regía hasta hoy —"la ola es ADITIVA; el recorte de falsos lo
  // decide el usuario, no un frente"— sigue siendo la regla. Lo que cambia es
  // que **el usuario la levantó para esta ola**, con estas palabras:
  // *"priorizar aumentar el numerador, pero no descartes disminuir el
  // denominador"*, y con un límite explícito: **costo cero sobre las
  // verdaderas ya juzgadas**.
  //
  // EL NÚMERO, CONTADO SOBRE LOS 162 ARCHIVOS DE VEREDICTOS DE TODAS LAS OLAS,
  // NO SOBRE UNA MUESTRA: `optional-construction-combinations::Builder` tiene
  // **12 juicios escritos y los 12 son `falso`** — 10 vivos contra el censo de
  // los 21 repos y 2 vencidos, **cero `verdadero`, cero `problema-si-patrón-no`,
  // cero `dudoso`, ni vivo ni vencido**. La población viva del ancla es de 10
  // propuestas y **las 10 están juzgadas**: no hay una sola propuesta de esta
  // celda sin veredicto, así que el costo de darla de baja no es "estimado en
  // cero", es **cero medido sobre el censo entero**. El propio AE4 ya había
  // publicado 0/7 y 0/3 (las dos líneas de abajo): dos olas después, con el
  // banco entero, sigue siendo 0 de 12.
  //
  // QUÉ SE DA DE BAJA Y QUÉ NO — la distinción importa y es la que mantiene el
  // delta de NIVEL 1 en CERO: se retira el ancla de ESTE array, que es lo único
  // que `run.ts#attachHypotheses` mira (`registry.filter((b) =>
  // b.anchors.includes(finding.kind))`). **El detector
  // `detect/inter-file/optional-construction-combinations.ts` NO se toca**:
  // sigue registrado, sigue corriendo y sigue emitiendo exactamente los mismos
  // `Finding`s de nivel 1. Por eso `interFileEvidencePaths` no puede moverse
  // —no hay menos hallazgos inter-file, hay menos hipótesis colgadas de ellos—
  // y por eso ninguna otra hipótesis pierde evidencia: Builder era el ÚNICO
  // consumidor de este ancla en todo el registro (verificado sobre los 17
  // `anchors:` de `hypotheses/`).
  //
  // Y NO SE BORRA NADA: `buildOptionalCombinations`, `buildOptionalCombinationsSpec`
  // y sus cinco puertas quedan en este archivo, y sus tests quedan en
  // `builder.test.ts` ejercitando `build()` directamente con un `Finding` de
  // ese `kind`. Volver a conectarla es agregar una cadena a este array.
  //
  // Las dos anclas viejas que QUEDAN no se tocan, y su número está publicado:
  // `long-parameter-list` 5/40 = 12,5 % en bibliotecas y 2/33 = 6,1 % en
  // aplicaciones (hoy, sobre el banco entero: 10/105 = 9,5 %); `data-clump`
  // 1/9 = 11 %. Rinden mal, pero tienen VERDADERAS juzgadas y por eso el
  // límite de costo cero prohíbe recortarlas — ver `ola-ay/informes/AY3.md`,
  // que publica el costo en verdaderas de cada corte más grande que se midió.
  anchors: ["long-parameter-list", "data-clump"],
  build,
  refresh: refresh,
};
