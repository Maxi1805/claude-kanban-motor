/**
 * `layer-skip` — dependencia que salta niveles de contención (PLAN.md §4.1
 * catálogo; detector "de FORMA de grafo" en el sentido de CONTRATO-F4.md
 * §5.3: sólo mira rutas de archivo + qué kinds de arista existen entre dos
 * archivos, no depende de resolución fina de símbolos más allá de saber SI
 * hay una arista de código entre ellos).
 *
 * RELACIÓN (sin jerga de AST): un archivo referencia algo que vive varios
 * niveles de carpeta más profundo DENTRO de otro módulo, en vez de tocar la
 * "superficie" de ese módulo — el punto donde la ruta del archivo profundo
 * diverge de la del archivo que lo referencia. Para cada arista de código
 * que cruza de un archivo A a un archivo B:
 *
 *   nivelesSalteados = profundidad(carpeta de B) - profundidad(ancestro
 *                       común de las carpetas de A y B) - 1
 *
 * 0 o negativo: B está justo en el primer nivel de divergencia visto desde A
 * (su "superficie"), o más arriba — cruzar ahí es la forma normal de usar
 * otro módulo. 1+: B sigue existiendo varios niveles de carpeta más allá de
 * ese punto de divergencia — eso es lo que este detector reporta. La cuenta
 * es una función únicamente de las DOS RUTAS (nunca de qué símbolo puntual
 * se referencia), así que es la misma para cualquier arista entre el mismo
 * par de archivos.
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: la señal completa es geometría de rutas
 * (segmentos de carpeta, comparados por posición) más la forma del grafo
 * (`kind !== "contains"` como "existe una dependencia de código entre estos
 * dos archivos") — cero vocabulario de nodo de ninguna gramática, y CERO
 * nombre de archivo por convención: nunca se busca `index.*`/`__init__.py`/
 * `mod.rs` como marcador de "superficie de módulo" (eso sería exactamente la
 * lista de vocabulario por lenguaje que la regla 4 prohíbe, sólo que
 * aplicada a nombres de archivo en vez de nombres de nodo — ver "CON QUÉ SE
 * CONFUNDE" para el costo de precisión de esa renuncia deliberada). "Sale
 * gratis" de datos que el grafo YA tiene: las rutas de carpeta que usa este
 * detector son las MISMAS que codifican las aristas `contains`
 * (`graph/build.ts#folderChain` construye exactamente esta cadena por
 * archivo) — leerlas de `CodeGraphNode.file` es leer la misma información
 * sin tener que recorrer esas aristas nodo por nodo. No se recomputa
 * ninguna de las 6 métricas de `graph/metrics/registry.ts` (pagerank, scc,
 * instability, clustering, louvain, componentes conexas): ninguna de ellas
 * mide profundidad de carpeta ni hace falta para esta señal.
 *
 * SIMPLIFICACIONES DECLARADAS:
 *  - Aristas contadas como "dependencia de código": todo `kind` salvo
 *    `contains` (mismo criterio "todas menos contains" que
 *    `dependency-cycle.ts`/`orphan-file.ts`), y sólo provenance
 *    `declared`/`resolved` — ver "OJO CON JAVA" más abajo.
 *  - Un hallazgo por PAR (archivo que llama, archivo profundo referenciado),
 *    no por arista individual ni por símbolo puntual: como `nivelesSalteados`
 *    depende únicamente de las dos rutas, es idéntico para cualquier símbolo
 *    de B que A referencie — emitir uno por símbolo inflaría el mismo
 *    hallazgo arquitectónico N veces.
 *  - DISTINCIÓN ESTRUCTURAL "mismo árbol hacia abajo" vs. "rama cruzada": si
 *    la carpeta de A es EXACTAMENTE el ancestro común (A vive en el punto de
 *    divergencia, mirando hacia abajo dentro de su propio subárbol), la
 *    severidad se reduce — es la forma exacta de un archivo fachada/barril
 *    de ESE MISMO módulo reexportando sus propios internos (ver "CON QUÉ SE
 *    CONFUNDE"). Si A vive en una rama hermana sin relación de contención
 *    con B, severidad plena. Es geometría de rutas, no un nombre de archivo.
 *
 * CON QUÉ SE CONFUNDE (patrón legítimo, misma firma estructural — la
 * observación central de por qué esto es hipótesis con confianza, no un
 * veredicto):
 *  - MONOREPO PLANO SIN JERARQUÍA SIGNIFICATIVA: si el repo no organiza su
 *    código en capas de carpeta (todo a nivel raíz, o a un único nivel de
 *    subcarpeta), la fórmula NUNCA puede alcanzar el umbral —
 *    `nivelesSalteados` está acotado por la profundidad máxima del repo
 *    menos 1. No es que el detector esté roto: no hay jerarquía que saltear.
 *    Un repo así produce 0 hallazgos LEGÍTIMAMENTE, indistinguible en el
 *    output de "hay jerarquía y se respeta" — ver el resultado de la tarea
 *    para cuáles de los 8 repos del corpus caen en este caso.
 *  - ARCHIVO FACHADA/BARRIL: un archivo de nivel superior de un módulo que a
 *    propósito reexporta símbolos de varios niveles adentro de su propio
 *    árbol para aplanar su API pública produce EXACTAMENTE la firma que este
 *    detector busca (una ruta corta referenciando una ruta larga) — es
 *    precisamente el mecanismo que usa ese patrón BIEN aplicado. La
 *    distinción "mismo árbol hacia abajo" de arriba reduce la severidad para
 *    este caso (un archivo fachada casi siempre vive en el punto exacto de
 *    divergencia, mirando hacia su propio subárbol), pero no lo descarta:
 *    distinguirlo con certeza exigiría un nombre de archivo por convención,
 *    que la regla 4 prohíbe.
 *  - TEST DE CAJA BLANCA: un archivo bajo una carpeta de test que importa
 *    directamente una implementación interna profunda para probarla es
 *    normal y no es un smell de arquitectura. Este detector no lo distingue
 *    de una dependencia de producción real (no hay una convención de nombre
 *    de carpeta de test agnóstica de lenguaje que no sea, de nuevo,
 *    vocabulario por lenguaje).
 *
 * OJO CON JAVA / guava — MEDIDO en tareas previas de esta ola (ver el
 * docstring de `dependency-cycle.ts`/`unused-symbol.ts`/`orphan-file.ts`): la
 * etapa `path-proximity` (heurística, `provenance: "inferred"`) acepta el
 * 81% de las aristas `references` ACEPTADAS en guava, y el dataset etiquetado
 * a mano que valida la cascada es sólo Ruby. Este detector usa una arista
 * como EVIDENCIA POSITIVA del hallazgo (afirma "A referencia algo profundo
 * dentro de B"), así que aplica el mismo criterio que `dependency-cycle.ts`
 * (no el de `orphan-file.ts`/`unused-symbol.ts`, que usan la arista para
 * DESCARTAR un candidato, el riesgo inverso): se EXCLUYEN a propósito las
 * aristas `inferred`, contando sólo `declared`/`resolved`. Ver el resultado
 * de la tarea para cuántos pares califican en guava antes y después de ese
 * filtro.
 *
 * TECHO DE SEVERIDAD POR PROVENANCE (P5, CRITERIO UNIFICADO — mismo en
 * `dependency-cycle.ts`/`coupling-without-abstraction.ts`/
 * `inappropriate-intimacy.ts`/`fanout-without-cohesion.ts`, reemplaza a este
 * detector NO teniendo ningún amortiguador antes de esta tarea): además de
 * excluir `inferred` de lo que CUENTA como evidencia (arriba), se mide, para
 * el par (`fromFile`,`toFile`) de cada hallazgo, qué fracción de TODAS sus
 * aristas de dependencia — cualquier `provenance`, ambos sentidos, mismo
 * filtro de `kind` (`!== "contains"`) — es `inferred`. Si esa fracción supera
 * 0.5 (`MAJORITY_INFERRED_RATIO`, mayoría heurística), la severidad se ACOTA
 * a un techo bajo (`LOW_CONFIDENCE_SEVERITY_CEILING = 35`) sin importar qué
 * diga la fórmula normal — es una MEDICIÓN de provenance, no un nombre de
 * lenguaje: no lee `language` en ningún momento, preservando "LÍMITE
 * ESTRUCTURAL, NO DE LENGUAJE" de arriba.
 *
 * LÍMITE MEDIDO DE ESTE TECHO, NO OCULTO — verificado corriendo este
 * detector sobre el grafo real de guava (P5, antes de tocar código): de sus
 * 256 hallazgos sin tope de volumen (239 de ellos con AMBOS archivos
 * compartiendo basename — la firma del bug de árbol espejo `android/guava/**`
 * ↔ `guava/**` documentado en `inappropriate-intimacy.ts`), este techo por
 * `inferred` sólo alcanza a acotar **1 de 256**. La razón, medida en el mismo
 * grafo: las aristas que cierran esos pares espejo tienen `provenance:
 * "resolved"` con `resolvedBy: "global-uniqueness"` (7 de 134 pares
 * mismo-basename del repo tienen alguna arista `inferred`; 127 tienen CERO),
 * no `"inferred"` — una categoría de provenance distinta que este techo no
 * cubre.
 *
 * BUG ARREGLADO ACÁ — `global-uniqueness` SE EXCLUYE COMO EVIDENCIA (no sólo
 * se acota su severidad), MISMO TRATAMIENTO QUE `inferred`. El párrafo de
 * arriba ya nombraba la raíz exacta y la declaraba "fuera de alcance,
 * `graph/resolve.ts`, regla 6" — arreglar la ETAPA 9 de la cascada de
 * resolución (`resolve.ts#globalUniquenessStage`, archivo compartido por
 * TODA la cascada de `references`, usado por más de una decena de
 * detectores) sigue fuera de mi alcance. Lo que SÍ está adentro: qué CUENTA
 * como evidencia PARA ESTE detector, exactamente el mismo tipo de decisión
 * que ya excluye `inferred`/`ambiguous` unas líneas más arriba.
 *
 * MEDIDO, juzgando a mano la muestra existente de `tests/golden/precision`
 * (16 hallazgos juzgados de `layer-skip` en 7 lenguajes, TODOS falsos —
 * 0% de precisión, la cifra con la que arrancó esta tarea): **10 de esos 16
 * (62%, en go/java/js/python/ruby/vue)** tienen la nota "colisión de nombre
 * genérico vía resolución" — el símbolo destino es un nombre corto y común
 * (`error` el builtin de Go, `config`/`root`/`hash`/`Dir` en Ruby, `Any`/
 * `skip` en Python, `count` en TS/Vue) que por casualidad tiene un único
 * dueño alcanzable por la cascada, y la etapa 9 lo acepta sin ver que la
 * declaración "correcta" (local, o de otro candidato ya descartado por una
 * etapa anterior) es una completamente distinta. Re-verificado corriendo
 * este detector, ya arreglado, sobre el grafo real de 6 repos (`corpus/`,
 * medición de esta tarea, `scripts/` ad hoc, sin tope de volumen):
 *
 *   | repo (lenguaje dominante) | antes (crudo) | después (crudo) |
 *   |---|---|---|
 *   | hugo (go) | 813 | ~23 (790 dependían EXCLUSIVAMENTE de `global-uniqueness`; los 14-23 que quedan son, en su mayoría, aristas `imports` "sin-etapa" — incluye `hugolib/content_map.go` → `resources/page/pagemeta`, el mismo par que `import-depth-demeter.ts` tiene juzgado VERDADERO) |
 *   | nest (typescript/js, monorepo) | 1.395 | **0** (las 1.395 dependían al 100% de `global-uniqueness`; sin evidencia alternativa, el par completo desaparece — no hay hallazgo que se pierda: los 3 de nest ya juzgados en la planilla eran los 3 falsos) |
 *   | rubocop (ruby) | 30 | 22 (los 8 que caen son exactamente los 2 ya juzgados falsos — `config`/`root` — más 6 del mismo patrón; los 22 que sobreviven son TODOS `lib/rubocop.rb` requiriendo su propio árbol interno — el patrón "archivo fachada/barril" que la severidad ya descuenta, ver abajo) |
 *   | sqlalchemy (python) | ~513 | ~33 sin depender de `global-uniqueness` en solitario (480 de 513 dependían exclusivamente de esa etapa) |
 *   | vueuse (vue/ts) | 24 | ~1 (23 de 24 eran el mismo par repetido, `count` colisionando contra un archivo de demo) |
 *   | guava (java) | 743 | 727 (sólo 16 pares dependían EXCLUSIVAMENTE de `global-uniqueness`; los 727 restantes tienen evidencia alternativa — mayormente aristas `imports` reales, Ola K — que sostiene el hallazgo aun sin la etapa 9: esta unificación NO resuelve la saturación de guava, que sigue siendo su propio problema de volumen, no de esta etapa) |
 *
 * Ningún repo con señal real queda en cero por *este* cambio salvo `nest`,
 * y ahí el 100% de la señal previa —medida, no supuesta— era artefacto de
 * la misma etapa que ya se sabía problemática. Guava (el repo con más
 * profundidad de carpeta real del corpus) retiene la enorme mayoría de su
 * señal porque tiene evidencia INDEPENDIENTE de `global-uniqueness` para
 * casi todos sus pares — la prueba de que esto no es "apagar el detector":
 * el efecto es proporcional a cuánto dependía cada repo de la etapa más
 * débil de la cascada, no un corte parejo.
 *
 * Los otros 6 de 16 falsos juzgados (guava ×3, nest ×3) NO son
 * `global-uniqueness` — son el confundidor "archivo fachada/barril"/
 * "monorepo multi-módulo" que el docstring ya declaraba arriba
 * ("CON QUÉ SE CONFUNDE") — RAÍZ 3, ver abajo.
 *
 * RAÍZ 3 (Ola N, frente A2b) — "EL PAQUETE NO ES UNA CAPA": FAN-IN ANCHO
 * ACOTA LA SEVERIDAD. `tests/golden/precision/guava.verdicts.csv` ENTERO
 * (2.354 filas, filtrado por `kind`+`verdict` con un script de esta tarea,
 * no a mano) trae **8 falsos** de `layer-skip` con nota "módulo paralelo
 * Maven"/"paquete no es capa arquitectónica" — mismo patrón repetido:
 * `ClassSanityTester` ×3 (`ArrayListMultimap`/`ImmutableList`/`Invokable`,
 * "clase pública central de guava") más `SortedMultisetTestSuiteBuilder` /
 * `CollectionSerializationTester` / `SortedMapNavigationTester` /
 * `CollectionRetainAllTester` / `MultisetSerializationTester` (una vez cada
 * una, nota "integrador ola M: en Java el paquete no es una capa
 * arquitectónica"), todos desde `android/guava-testlib/**` hacia clases
 * públicas de `guava/`. guava publica `guava/`,
 * `android/guava/`, `android/guava-testlib/`, `guava-gwt/`,
 * `futures/failureaccess/` como directorios de NIVEL SUPERIOR separados
 * (build multi-módulo) para el MISMO árbol lógico de paquetes Java — el
 * ancestro común entre dos de esos directorios es casi siempre la raíz del
 * repo (`commonLen = 0`), así que la fórmula de este archivo (profundidad de
 * RUTA) infla `nivelesSalteados` por la profundidad ENTERA del paquete
 * destino sin poder distinguir la clase más pública del proyecto de un
 * detalle interno real.
 *
 * LA SEÑAL AGREGADA (no en la fórmula original: los dos detectores hermanos
 * ignoraban fan-in por completo pese a tenerlo disponible en el grafo — ver
 * CONTEXTO.md §5, "agregar comportamientos que le falten a una regla", no
 * sólo filtrar): un archivo destino alcanzado, a través de TODO el grafo (no
 * sólo del par bajo evaluación), desde `>= 3` raíces de carpeta de nivel
 * superior DISTINTAS (primer segmento de ruta) se comporta como superficie
 * pública de facto sin importar su profundidad de carpeta —
 * `computeTopAncestorFanIn`/`isWideFanIn` (`detect/primitivas/
 * a2b-module-boundary.ts`, compartida con `import-depth-demeter.ts`). Mismo
 * TRATAMIENTO que el techo por `inferred` de arriba (ACOTAR la severidad a
 * `WIDE_FANIN_SEVERITY_CEILING`, no excluir el par: sigue siendo un
 * candidato real, sólo de confianza reducida) — nunca 0 hallazgos, nunca un
 * detector escondido.
 *
 * MEDIDO contra el grafo real de guava (`scratchpad/
 * a2b-measure-module-boundary.mts`, este frente, ver el resultado de la
 * tarea para la corrida completa y el diagnóstico por-target): de los 727
 * pares crudos que sobreviven al fix de `global-uniqueness` de arriba, **9
 * quedan con fan-in ancho** (severidad acotada a <= 30) — los 9 apuntan al
 * MISMO archivo destino, `futures/failureaccess/.../
 * InternalFutureFailureAccess.java` (fan-in medido = 3 raíces de carpeta de
 * nivel superior distintas), exactamente el confundidor "idioma-framework:
 * futures/failureaccess es un micro-artefacto Maven deliberadamente
 * separado" ya juzgado falso en la planilla (3 filas de `layer-skip`
 * anotadas con esa nota: `Futures.java`/`AbstractFuture.java`/
 * `AbstractCatchingFuture.java`).
 *
 * LÍMITE MEDIDO DE ESTE FIX, NO OCULTO: los 8 falsos "módulo paralelo Maven"
 * de arriba, TODOS desde `android/guava-testlib/**`, NO quedan cubiertos por
 * el fan-in ancho: medido directamente (diagnóstico por-target de esta
 * tarea, ver el resultado de la tarea para el detalle completo), su fan-in
 * CONFIDENTE real queda por debajo del piso de 3 — la cascada de resolución
 * no arma suficientes aristas `declared`/`resolved` entre `guava-testlib` y
 * esas clases, así que no hay evidencia de fan-in que MEDIR, no que el
 * mecanismo pase por alto. Esto es compatible con un hueco del RESOLVEDOR
 * (la misma familia de causa que ya motivó excluir `global-uniqueness`
 * arriba), no del criterio de esta regla — `graph/resolve.ts` no es mío en
 * esta ola (A2a lo tiene corriendo en paralelo), así que queda anotado, no
 * arreglado: ver "PIDO A OTRO FRENTE" en el informe de esta tarea.
 *
 * DESCARTADO — generalizar el descuento "mismo árbol hacia abajo"
 * (`sameTreeTopDown`, hoy sólo el llamador EXACTAMENTE en el punto de
 * divergencia) a una tolerancia de profundidad (p.ej. "el llamador vive
 * hasta 1 nivel más allá de un ancestro real") para cubrir además el
 * confundidor de Go citado en A2-ALCANCE.md Raíz 3 (`internal/`, restricción
 * del propio compilador — ver `tpl/tplimpl/templatetransform.go` ->
 * `tpl/internal/go_templates/...`, `hugo.verdicts.csv`, juzgado falso,
 * "idioma-framework"). Se probó y se descartó: la MISMA geometría de
 * "carpetas hermanas bajo un ancestro compartido no-raíz" es EXACTAMENTE la
 * de un hallazgo real ya juzgado VERDADERO en `eslint.verdicts.csv`
 * (`lib/linter/linter.js` -> `lib/languages/js/source-code`, "el core del
 * linter reeempieza directo dentro del directorio interno del plugin de
 * lenguaje 'js', bypassa `languages/js/index.js`") — mismo `commonLen >= 1`,
 * mismo "el llamador vive 1 nivel más allá del ancestro compartido", verdict
 * opuesto. Path-geometry pura no alcanza para distinguir "restricción de
 * acceso reforzada por el compilador" de "carpeta hermana que igual se
 * viola" sin nombrar `internal/` literalmente — y nombrarlo sería la misma
 * clase de lista de vocabulario por lenguaje que este mismo documento ya
 * rechazó para `__init__.py`/`mod.rs`/`index.*` (ver el brief del frente,
 * Raíz 2). Queda sin arreglar, a propósito, documentado para la próxima ola
 * bajo "QUÉ NO CUBRÍ" del informe de esta tarea — no es un caso perdido, es
 * un caso donde el criterio de genericidad de esta ola gana sobre cerrar un
 * falso puntual.
 *
 * ════════════════════════════════════════════════════════════════════════
 * OLA O, FRENTE N3 — LA RAÍZ, ATACADA EN DOS LUGARES A LA VEZ
 * ════════════════════════════════════════════════════════════════════════
 *
 * La Ola N le puso a este archivo (y a su hermano) una primitiva de límite
 * de módulo por fan-in, y el volumen NO bajó: `layer-skip` SUBIÓ +24 y
 * `import-depth-demeter` +2. La razón, medida en esta ola, es que aquel
 * mecanismo sólo ACOTABA LA SEVERIDAD y el ruido se mide sobre el VOLUMEN.
 * Debajo de eso había dos defectos de DEFINICIÓN, los dos medidos acá:
 *
 * (1) UN SEGMENTO DE RUTA NO ES UNA CAPA — ver `detect/primitivas/
 *     n3-capas-reales.ts` para la evidencia completa. Una carpeta que no
 *     contiene NINGÚN archivo analizado no tiene superficie ni punto de
 *     entrada: atravesarla no es saltear una capa, es recorrer un namespace.
 *     Medido sobre el grafo real: 712 de los 727 pares de guava (98 % del
 *     volumen java del kind) cruzan CERO carpetas pobladas —
 *     `android/guava/src`, `…/com`, `…/google`, `…/common` tienen 0 archivos
 *     cada una: son los segmentos del paquete `com.google.common.*`, que el
 *     compilador de Java exige escribir como carpetas. Es exactamente lo que
 *     los 10 veredictos java (10 de 10 FALSOS) ya decían con esas palabras.
 *     Se agrega, por eso, el piso `minRealLayers` (`MIN_REAL_LAYERS = 1`):
 *     no un umbral de magnitud más duro, sino la CONDICIÓN DE EXISTENCIA del
 *     fenómeno. Los 15 pares java que SÍ cruzan una carpeta poblada
 *     (`futures/failureaccess/src`, que contiene `module-info.java`) siguen
 *     emitiendo: java no queda en cero, y el corte no es parejo por
 *     lenguaje sino proporcional a cuánta de la profundidad de cada repo es
 *     namespace (hugo 23 → 22, eslint 4 → 4, rubocop 22 → 22, sqlalchemy
 *     33 → 33, vueuse 1 → 1, nest 0 → 0).
 *
 * (2) LA UNIDAD DEL HALLAZGO ERA (ARCHIVO, ARCHIVO) CUANDO EL HECHO ES
 *     (MÓDULO, MÓDULO). Este archivo YA argumentaba, para el nivel de
 *     abajo, que emitir un hallazgo por SÍMBOLO "inflaría el mismo hallazgo
 *     arquitectónico N veces" y por eso colapsaba por par. El mismo
 *     argumento, un nivel más arriba, es el que faltaba: "el módulo X conoce
 *     el interior del módulo M" es UN hecho arquitectónico, no uno por cada
 *     archivo interno de M que X toque. Medido: en rubocop, `lib/rubocop.rb`
 *     alcanza 22 archivos internos de `lib/rubocop` — 22 hallazgos para UNA
 *     decisión, y como el censo suma `memberCount` a CADA archivo distinto
 *     que el grupo toca (`census.ts#censusOf`, cota superior declarada), esos
 *     22 hallazgos pesan 22 × 23 = **506 de volumen medido**, el 43 % del
 *     kind entero. Este detector pasa a emitir UN hallazgo por
 *     (carpeta del llamador, módulo cruzado) — la granularidad
 *     MÓDULO-A-MÓDULO, que es la que corresponde a la palabra "capa" — con
 *     la cuenta de archivos de cada lado en la evidencia.
 *
 * DIFERENCIA CON `import-depth-demeter`, AHORA REAL Y NO SÓLO DECLARADA —
 * DEFECTO MEDIDO EN ESTA OLA: los dos detectores producían, en producción,
 * el MISMO conjunto de pares, byte por byte, en los 7 repos con volumen
 * (guava 727/727, rubocop 22/22, hugo 23/23, sqlalchemy 33/33, eslint 4/4,
 * vueuse 1/1, nest 0/0). El docstring de arriba decía que este detector mira
 * "cualquier arista de dependencia" y el hermano "sólo `imports`" — pero
 * medido sobre el grafo real, el 100 % de los pares profundos de este
 * detector viene de aristas `imports`, y CERO de cualquier otra: TODAS las
 * aristas `references`/`calls`/`carries` que cruzan 2+ niveles de carpeta
 * son `inferred`, `ambiguous` o `global-uniqueness` en los 7 repos (guava
 * 1.854 pares crudos: 1.137 inferred + 743 global-uniqueness + 7 ambiguous,
 * cero confiables; nest 2.306: 1.628 + 1.395 + 49, cero confiables; ídem
 * hugo/eslint/sqlalchemy/rubocop/vueuse). O sea: los dos kinds contaban DOS
 * VECES el mismo hecho. Esta ola los separa por GRANULARIDAD, que es la
 * distinción que sí se sostiene con el grafo de hoy: este detector responde
 * "¿qué MÓDULO conoce el interior de qué otro módulo?" y el hermano
 * "¿qué ARCHIVO declara un import que nombra el interior de qué módulo?".
 * La falta de evidencia propia (aristas de dependencia confiables que no
 * sean `imports`) es un hueco del RESOLVEDOR, no de esta regla — anotado en
 * el informe de esta tarea bajo "PIDO A OTRO FRENTE".
 *
 * LÍMITE ESTRUCTURAL, NO DE LENGUAJE: la forma `contains` que arma
 * `graph/build.ts` (carpeta -> archivo -> símbolo) es idéntica en los 9
 * lenguajes soportados, así que este detector NO declara ningún `needs` de
 * capacidad de lenguaje: `needs: []`, aplica a cualquier repo con grafo. Lo
 * que sí puede faltar es la SEGUNDA arista (una dependencia de código real
 * `declared`/`resolved` que cruce archivos): un repo/lenguaje cuya cascada de
 * resolución no acepta ninguna hace que este detector reporte 0 hallazgos
 * indistinguible de "sin violaciones". El tipo `InterFileDetector` de hoy
 * (`detect/types.ts`, verificado antes de escribir este archivo) TODAVÍA NO
 * tiene el campo `needsEdges`/`needsMetrics` que CONTRATO-F4.md §4.3 describe
 * ni el `RepoUnit.metrics` de CONTRATO-F5.md §4.2 (el cableado de P3 no
 * había aterrizado en el momento de escribir este detector — mismo hueco que
 * ya documentó `detect/grouping.ts` para `provenanceMix`/`trustedEdge`), así
 * que esta ausencia se degrada hoy a "cero hallazgos" en vez de a un estado
 * `sin-aristas` explícito. Reportado, no arreglado acá: son archivos
 * compartidos (`detect/types.ts`/`detect/run.ts`) fuera de mi alcance.
 */
import { pisoDeclarado, presupuesto } from "../thresholds.js";
import type { Threshold } from "../thresholds.js";
import type { CodeGraph, CodeGraphNode } from "../../graph/types.js";
import type { FileSummary, InterFileDetector, RawFinding, RepoUnit, RunContext } from "../types.js";
import { computeTopAncestorFanIn, isWideFanIn, topAncestorFanInCount } from "../primitivas/a2b-module-boundary.js";
import { countRealLayersCrossed, MIN_REAL_LAYERS, populatedFolders } from "../primitivas/n3-capas-reales.js";

type ThresholdKey = "minSkippedLevels" | "minRealLayers";

const MIN_SKIPPED_LEVELS_SPEC = pisoDeclarado(2, {
  rationale:
    "referenciar un archivo que vive exactamente en el primer nivel de divergencia de carpeta (la " +
    '"superficie" del otro módulo desde la perspectiva del llamador) es la forma normal de cruzar un límite ' +
    "de módulo y no debe dispararse (0 niveles salteados); seguir UN nivel más adentro (1) todavía es común " +
    "(un archivo referenciando directamente un helper del primer subdirectorio del otro módulo); recién a " +
    "partir de DOS niveles más allá del punto de divergencia la referencia atraviesa una capa intermedia " +
    "completa de organización interna ajena, que es la forma mínima del problema que este detector busca.",
});

/** OLA O, N3 — ver `detect/primitivas/n3-capas-reales.ts` y el bloque "LA RAÍZ" del docstring del módulo. */
const MIN_REAL_LAYERS_SPEC = pisoDeclarado(MIN_REAL_LAYERS, {
  rationale:
    "una carpeta que no contiene directamente ningún archivo analizado no tiene superficie ni punto de " +
    "entrada: no hay nada que enrutar a través suyo, así que atravesarla no es saltear una capa sino " +
    "recorrer un namespace (el caso medido del paquete Java: `src/com/google/common` son cuatro carpetas con " +
    "CERO archivos). El piso es 1 porque es el mínimo que hace VERDADERA la afirmación del hallazgo — que " +
    "existía al menos un punto de entrada real por el que el llamador podría haber pasado y no pasó; con 0 la " +
    "afirmación es literalmente falsa. No mide magnitud (eso lo sigue haciendo minSkippedLevels): es la " +
    "condición de existencia del fenómeno.",
});

/** CONTRATO-F4.md §1.8: tope de VOLUMEN propio, no de detección. */
const MAX_FINDINGS_SPEC = presupuesto(150, {
  rationale:
    "un panel legible no lista de forma útil más de un par de cientos de pares módulo-llamador/módulo-" +
    "cruzado a la vez; es tope de volumen, no de detección.",
});

/**
 * Cuántos archivos de CADA lado (módulo que llama, módulo cruzado) se listan
 * como `locations` de ejemplo. El resto va como CUENTA en la evidencia — ver
 * el punto (2) de "LA RAÍZ" en el docstring del módulo: listarlos todos
 * vuelve a inflar el mismo hecho arquitectónico (y el censo, que suma
 * `memberCount` por archivo tocado, es cuadrático en eso).
 *
 * POR QUÉ NO 1 SOLO POR LADO, medido: con un único llamador listado, un
 * hallazgo ya juzgado VERDADERO cambiaba de archivo-ancla
 * (`config/allconfig/alldecoders.go` -> `config/allconfig/allconfig.go`, los
 * dos del mismo módulo llamador en hugo) y la planilla de precisión lo
 * marcaba como desaparecido aunque el hecho siguiera reportado. Con 3 por
 * lado el ancla se conserva y el costo medido de volumen de censo es chico
 * (layer-skip 83 -> 100 en los 6 repos con volumen, contra los 1.170 de
 * partida).
 */
const MAX_FILE_EXAMPLES = 3;

/** Mayoría de aristas `inferred` entre el par (mismo corte 0.5 que el resto
 *  del catálogo F5 usa para esta decisión) — ver "TECHO DE SEVERIDAD POR
 *  PROVENANCE" en el docstring del módulo. No es un `Threshold` de detección:
 *  no decide SI se emite, sólo cuánto se acota la severidad de lo que ya se
 *  decidió emitir. */
const MAJORITY_INFERRED_RATIO = 0.5;
const LOW_CONFIDENCE_SEVERITY_CEILING = 35;

/** Ver "RAÍZ 3 — EL PAQUETE NO ES UNA CAPA" en el docstring del módulo. Mismo estilo de techo que `LOW_CONFIDENCE_SEVERITY_CEILING`, pero por una señal distinta (fan-in ancho, no provenance). */
const WIDE_FANIN_SEVERITY_CEILING = 30;

/** Todo id de nodo del grafo -> el nodo completo (necesitamos `.file` y, si es un símbolo, `.symbolPath`). */
function nodeIndex(graph: CodeGraph): ReadonlyMap<string, CodeGraphNode> {
  const map = new Map<string, CodeGraphNode>();
  for (const n of graph.nodes) map.set(n.id, n);
  return map;
}

/** Todo kind salvo `contains`, y sólo provenance `declared`/`resolved` — ver "OJO CON JAVA" en el
 *  docstring del módulo. Excluye también `ambiguous` (CONTRATO-F9.md §4.5: fuera de toda consulta
 *  por defecto) y `resolvedBy === "global-uniqueness"` — ver "BUG ARREGLADO — GLOBAL-UNIQUENESS"
 *  en el docstring del módulo, la MAYORÍA medida de los falsos positivos juzgados. */
function isConfidentDependencyEdge(edge: { kind: string; provenance: string; resolvedBy?: string }): boolean {
  return (
    edge.kind !== "contains" &&
    edge.provenance !== "inferred" &&
    edge.provenance !== "ambiguous" &&
    edge.resolvedBy !== "global-uniqueness"
  );
}

/** Segmentos de carpeta de una ruta de archivo, sin el nombre de archivo ("a/b/c.rb" -> ["a","b"]). Misma cadena que `graph/build.ts#folderChain` codifica en las aristas `contains` — ver el docstring del módulo. */
function folderSegmentsOf(filePath: string): readonly string[] {
  const segments = filePath.split("/");
  segments.pop();
  return segments;
}

/** Cuántos segmentos iniciales comparten dos rutas de carpeta, comparados por posición. */
function commonPrefixLength(a: readonly string[], b: readonly string[]): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function symbolLabel(node: CodeGraphNode): string | null {
  if (node.kind !== "symbol" || node.symbolPath.length === 0) return null;
  return node.symbolPath[node.symbolPath.length - 1] ?? null;
}

/** Par no ordenado — para medir confianza sin importar en qué sentido está la
 *  arista ruidosa (a diferencia de `pairKey`, que sí es direccional). */
function unorderedPairKey(a: string, b: string): string {
  return a < b ? `${a} ${b}` : `${b} ${a}`;
}

interface PairProvenanceCount {
  total: number;
  inferred: number;
}

/**
 * Segunda pasada O(E), independiente de `isConfidentDependencyEdge`: mide,
 * para cada par NO ORDENADO de archivos, cuántas de TODAS sus aristas de
 * dependencia (cualquier `provenance`, mismo filtro de `kind`) son
 * `inferred` — ver "TECHO DE SEVERIDAD POR PROVENANCE" en el docstring del
 * módulo. Deliberadamente separada de la pasada de arriba: esa decide qué
 * CUENTA como evidencia (declared/resolved), ésta mide qué tan ruidoso es el
 * vecindario del par, incluyendo la evidencia que la primera pasada excluyó.
 */
function computeInferredRatioByPair(edges: CodeGraph["edges"], nodeById: ReadonlyMap<string, CodeGraphNode>): Map<string, PairProvenanceCount> {
  const counts = new Map<string, PairProvenanceCount>();
  for (const edge of edges) {
    if (edge.kind === "contains") continue;
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to || from.file === to.file) continue;
    const key = unorderedPairKey(from.file, to.file);
    let c = counts.get(key);
    if (!c) {
      c = { total: 0, inferred: 0 };
      counts.set(key, c);
    }
    c.total++;
    if (edge.provenance === "inferred") c.inferred++;
  }
  return counts;
}

function inferredRatioOfPair(counts: ReadonlyMap<string, PairProvenanceCount>, a: string, b: string): number {
  const c = counts.get(unorderedPairKey(a, b));
  if (!c || c.total === 0) return 0;
  return c.inferred / c.total;
}

/**
 * Severidad: crece con `skippedLevels` (magnitud del `trigger`). Un par
 * "mismo árbol hacia abajo" (la carpeta del llamador ES el ancestro común)
 * pesa MENOS — firma de un archivo fachada/barril de su propio módulo
 * reexportando sus internos (ver "CON QUÉ SE CONFUNDE" del docstring del
 * módulo); una rama cruzada sin relación de contención pesa MÁS. Monótona en
 * `skippedLevels` para `sameTreeTopDown` fijo. Si la mayoría de las aristas
 * del par son `inferred`, se ACOTA (no sólo se resta) a un techo bajo — ver
 * "TECHO DE SEVERIDAD POR PROVENANCE" en el docstring del módulo (criterio
 * unificado P5, con su límite medido documentado ahí). Mismo tratamiento
 * (ACOTAR, no restar) para `wideFanIn` — ver "RAÍZ 3 — EL PAQUETE NO ES UNA
 * CAPA" en el docstring del módulo: un archivo destino alcanzado desde
 * muchas raíces de carpeta de nivel superior distintas es, con evidencia
 * medida, superficie pública de facto, sin importar cuántos niveles de
 * carpeta lo separan del punto de divergencia de ESTE par puntual.
 */
function severityOf(skippedLevels: number, sameTreeTopDown: boolean, inferredRatio: number, wideFanIn: boolean): number {
  const base = 35 + skippedLevels * 12;
  const adjusted = sameTreeTopDown ? base - 20 : base + 5;
  const capped = Math.max(15, Math.min(100, adjusted));
  const afterProvenance = inferredRatio > MAJORITY_INFERRED_RATIO ? Math.min(capped, LOW_CONFIDENCE_SEVERITY_CEILING) : capped;
  return wideFanIn ? Math.min(afterProvenance, WIDE_FANIN_SEVERITY_CEILING) : afterProvenance;
}

/**
 * Un par (archivo que llama, archivo profundo). Sigue siendo la unidad de
 * MEDICIÓN (la geometría se calcula por par), pero YA NO es la unidad de
 * HALLAZGO — ver el punto (2) de "LA RAÍZ" en el docstring del módulo.
 */
interface PairAccumulator {
  fromFile: string;
  toFile: string;
  skippedLevels: number;
  realLayers: number;
  sameTreeTopDown: boolean;
  commonAncestorDepth: number;
  targetDepth: number;
  moduleBoundary: string;
  callerFolder: string;
  edgeCount: number;
  targetSymbols: Set<string>;
}

/**
 * La unidad de HALLAZGO de este detector: (módulo que llama, módulo
 * cruzado). "El módulo X conoce el interior del módulo M" es UN hecho
 * arquitectónico — ver el punto (2) de "LA RAÍZ" en el docstring del módulo.
 */
interface ModulePairAccumulator {
  callerFolder: string;
  moduleBoundary: string;
  pairs: PairAccumulator[];
  callerFiles: Set<string>;
  targetFiles: Set<string>;
}

function pairKey(fromFile: string, toFile: string): string {
  return `${fromFile} ${toFile}`;
}

function modulePairKey(callerFolder: string, moduleBoundary: string): string {
  return `${callerFolder} -> ${moduleBoundary}`;
}

/** Etiqueta legible de una carpeta, incluida la raíz del repo (`""`). */
function folderLabel(folder: string): string {
  return folder === "" ? "(raíz)" : folder;
}

/**
 * El par que REPRESENTA al módulo-a-módulo en el título, las `locations` y
 * la severidad: el más profundo en capas REALES, desempatando por niveles de
 * ruta y después por ruta, para que la elección sea determinista y no
 * dependa del orden de las aristas.
 */
function representativeOf(pairs: readonly PairAccumulator[]): PairAccumulator {
  return [...pairs].sort(
    (a, b) =>
      b.realLayers - a.realLayers ||
      b.skippedLevels - a.skippedLevels ||
      pairKey(a.fromFile, a.toFile).localeCompare(pairKey(b.fromFile, b.toFile)),
  )[0]!;
}

/**
 * Único lugar que arma los `RawFinding[]` — separado de `detector.run` para
 * poder testearlo sin pasar por `RunContext`, mismo patrón que
 * `buildOrphanFileFindings`/`findDependencyCycles`.
 */
export function buildLayerSkipFindings(
  files: readonly FileSummary[],
  graph: CodeGraph,
  minSkippedLevels: Threshold,
  minRealLayers: Threshold,
): RawFinding[] {
  const nodeById = nodeIndex(graph);
  const linesByFile = new Map(files.map((f) => [f.path, f.lines] as const));
  // OLA O, N3, punto (1) de "LA RAÍZ": qué carpetas son CAPAS (contienen archivos) y cuáles
  // son sólo namespace. O(F), una pasada sobre la lista de archivos que ya recibimos.
  const populated = populatedFolders(files);
  const pairs = new Map<string, PairAccumulator>();

  for (const edge of graph.edges) {
    if (!isConfidentDependencyEdge(edge)) continue;
    const fromNode = nodeById.get(edge.from);
    const toNode = nodeById.get(edge.to);
    if (!fromNode || !toNode) continue;
    const fromFile = fromNode.file;
    const toFile = toNode.file;
    if (fromFile === toFile) continue; // intra-archivo: no hay límite de módulo que saltear

    const fromFolder = folderSegmentsOf(fromFile);
    const toFolder = folderSegmentsOf(toFile);
    const commonLen = commonPrefixLength(fromFolder, toFolder);
    const skippedLevels = toFolder.length - commonLen - 1;
    if (skippedLevels < minSkippedLevels.value) continue;
    // OLA O, N3, punto (1): niveles de RUTA que además son capas REALES. Sin esto, el paquete
    // Java (`src/com/google/common`, 4 carpetas con 0 archivos) se contaba como 4 capas.
    const realLayers = countRealLayersCrossed(populated, toFolder, commonLen);
    if (realLayers < minRealLayers.value) continue;

    const sameTreeTopDown = fromFolder.length === commonLen;
    const key = pairKey(fromFile, toFile);
    let acc = pairs.get(key);
    if (!acc) {
      const moduleBoundary = toFolder.slice(0, commonLen + 1).join("/") || "(raíz)";
      acc = {
        fromFile,
        toFile,
        skippedLevels,
        realLayers,
        sameTreeTopDown,
        commonAncestorDepth: commonLen,
        targetDepth: toFolder.length,
        moduleBoundary,
        callerFolder: fromFolder.join("/"),
        edgeCount: 0,
        targetSymbols: new Set(),
      };
      pairs.set(key, acc);
    }
    acc.edgeCount += edge.weight;
    const label = symbolLabel(toNode);
    if (label) acc.targetSymbols.add(label);
  }

  // OLA O, N3, punto (2): la unidad del hallazgo es (módulo que llama, módulo cruzado).
  const modulePairs = new Map<string, ModulePairAccumulator>();
  for (const p of pairs.values()) {
    const key = modulePairKey(p.callerFolder, p.moduleBoundary);
    let m = modulePairs.get(key);
    if (!m) {
      m = {
        callerFolder: p.callerFolder,
        moduleBoundary: p.moduleBoundary,
        pairs: [],
        callerFiles: new Set(),
        targetFiles: new Set(),
      };
      modulePairs.set(key, m);
    }
    m.pairs.push(p);
    m.callerFiles.add(p.fromFile);
    m.targetFiles.add(p.toFile);
  }

  const provenanceByPair = computeInferredRatioByPair(graph.edges, nodeById);
  // RAÍZ 3 — "el paquete no es una capa" (ver el docstring del módulo). Una sola pasada O(E)
  // sobre TODO el grafo, igual que `computeInferredRatioByPair`: mide qué tan ampliamente se
  // referencia cada archivo DESTINO, no sólo desde el par bajo análisis.
  const fanInByFile = computeTopAncestorFanIn(graph.edges, nodeById, isConfidentDependencyEdge);

  const sortedModuleKeys = [...modulePairs.keys()].sort((a, b) => {
    const ma = modulePairs.get(a)!;
    const mb = modulePairs.get(b)!;
    return representativeOf(mb.pairs).skippedLevels - representativeOf(ma.pairs).skippedLevels || a.localeCompare(b);
  });

  const findings: RawFinding[] = [];
  for (const key of sortedModuleKeys) {
    const m = modulePairs.get(key)!;
    const p = representativeOf(m.pairs);
    const targetList = [...p.targetSymbols].sort();
    const symbolsText =
      targetList.length === 0
        ? "el archivo"
        : targetList.length === 1
          ? `"${targetList[0]}"`
          : `${targetList.length} símbolos (p.ej. "${targetList[0]}")`;
    const inferredRatio = inferredRatioOfPair(provenanceByPair, p.fromFile, p.toFile);
    const lowConfidence = inferredRatio > MAJORITY_INFERRED_RATIO;
    const fanInCount = topAncestorFanInCount(fanInByFile, p.toFile);
    const wideFanIn = isWideFanIn(fanInCount);
    // El representativo va SIEMPRE primero de cada lado (el llamador es además `locations[0]`,
    // que es lo que agrupa `grouping.ts`; el destino es el que lleva el símbolo en el título).
    const callerExamples = [p.fromFile, ...[...m.callerFiles].sort().filter((f) => f !== p.fromFile)].slice(0, MAX_FILE_EXAMPLES);
    const targetExamples = [p.toFile, ...[...m.targetFiles].sort().filter((f) => f !== p.toFile)].slice(0, MAX_FILE_EXAMPLES);
    const edgeTotal = m.pairs.reduce((sum, x) => sum + x.edgeCount, 0);
    const internosText =
      m.targetFiles.size === 1
        ? `${symbolsText} dentro de "${p.toFile}"`
        : `${m.targetFiles.size} archivos internos (p.ej. ${symbolsText} dentro de "${p.toFile}")`;

    findings.push({
      title: `"${folderLabel(m.callerFolder)}" salta ${p.realLayers} capa(s) de "${m.moduleBoundary}" para llegar a ${internosText}`,
      detail:
        `${m.callerFiles.size === 1 ? `"${p.fromFile}"` : `${m.callerFiles.size} archivos de "${folderLabel(m.callerFolder)}" (p.ej. "${p.fromFile}")`} ` +
        `referencia directamente ${m.targetFiles.size === 1 ? "un archivo" : `${m.targetFiles.size} archivos`} ` +
        `del interior de "${m.moduleBoundary}", atravesando ${p.realLayers} carpeta(s) que SÍ contienen archivos ` +
        `del módulo (de ${p.skippedLevels} nivel(es) de ruta salteados: el resto son segmentos de namespace, sin ` +
        "archivos propios, que no son capas). Cada cambio en la organización INTERNA de ese módulo (mover, " +
        "renombrar o reestructurar sus subcarpetas pobladas) puede romper a este módulo llamador, que no debería " +
        "conocer esa estructura interna en absoluto." +
        (p.sameTreeTopDown
          ? " El módulo que llama vive justo en el punto de divergencia, mirando hacia su propio subárbol: es " +
            "compatible con un archivo fachada/barril que reexporta a propósito sus propios internos para aplanar " +
            "su API pública — verificá esa intención antes de tratarlo como un problema."
          : " Los dos módulos no comparten ninguna relación de contención directa (viven en ramas distintas): es " +
            "menos compatible con una fachada del propio módulo profundo y más con una dependencia cruzada " +
            "accidental.") +
        (lowConfidence
          ? ` Confianza reducida: ${Math.round(inferredRatio * 100)}% de las aristas de dependencia entre los dos ` +
            "archivos representativos (cualquier sentido) provienen de la etapa heurística de resolución " +
            "(path-proximity, provenance 'inferred'), no validada contra un dataset etiquetado fuera de Ruby — la " +
            "severidad se acota en consecuencia."
          : "") +
        (wideFanIn
          ? ` Confianza reducida: "${p.toFile}" también se referencia desde otras ${fanInCount - 1} raíz(ces) ` +
            "de carpeta de nivel superior distintas de ésta, en cualquier otro punto del repositorio — un " +
            "archivo alcanzado tan ampliamente se comporta como superficie pública de facto de su propio " +
            "módulo, sin importar cuántos niveles de carpeta lo separan del punto de divergencia de ESTE " +
            "llamador puntual; la profundidad de carpeta puede ser namespace, no una capa que se está saltando."
          : ""),
      trigger: [
        { label: "niveles de carpeta salteados", value: p.skippedLevels, threshold: minSkippedLevels },
        { label: "capas reales salteadas (carpetas con archivos propios)", value: p.realLayers, threshold: minRealLayers },
      ],
      evidence: [
        { label: "aristas de dependencia colapsadas entre los dos módulos (declared/resolved)", value: edgeTotal },
        { label: "archivos del módulo que llama involucrados", value: m.callerFiles.size },
        { label: "archivos internos del módulo cruzado alcanzados", value: m.targetFiles.size },
        { label: "profundidad de carpeta del archivo referenciado", value: p.targetDepth },
        { label: "profundidad del ancestro común de carpetas", value: p.commonAncestorDepth },
        { label: "% de las aristas del par con provenance 'inferred'", value: Math.round(inferredRatio * 100) },
        { label: "raíces de carpeta de nivel superior distintas que también referencian este archivo", value: fanInCount },
      ],
      locations: [
        {
          file: p.fromFile,
          startLine: 1,
          endLine: Math.max(1, linesByFile.get(p.fromFile) ?? 1),
          role: "archivo que salta la superficie del módulo referenciado",
        },
        ...callerExamples.slice(1).map((file) => ({
          file,
          startLine: 1,
          endLine: Math.max(1, linesByFile.get(file) ?? 1),
          role: "archivo que salta la superficie del módulo referenciado",
        })),
        ...targetExamples.map((file) => ({
          file,
          startLine: 1,
          endLine: Math.max(1, linesByFile.get(file) ?? 1),
          ...(file === p.toFile && targetList[0] !== undefined ? { symbol: targetList[0] } : {}),
          role: "archivo profundo dentro de otro módulo, fuera de su superficie",
        })),
      ],
      severity: severityOf(p.skippedLevels, p.sameTreeTopDown, inferredRatio, wideFanIn),
      advice: {
        primary: {
          name: "Hide Delegate",
          kind: "refactorizacion",
          why:
            "Enrutar la dependencia a través de la superficie del módulo (en vez de directo a su interior) " +
            "permite reorganizar los internos de ese módulo sin tener que auditar a todo el que lo usa desde " +
            "afuera.",
          source: "https://refactoring.guru/es/hide-delegate",
        },
      },
    });
  }

  return findings;
}

export const detector: InterFileDetector<ThresholdKey, "layer-skip"> = {
  id: "layer-skip",
  kind: "layer-skip",
  scope: "inter-file",
  needsGraph: true,
  title: "Salto de nivel de contención",
  needs: [],
  // OLA A3: `isConfidentDependencyEdge` acepta "todo kind salvo contains" —
  // unión genérica, no un vocabulario cerrado (ver el docstring del módulo,
  // que ya lo documentaba y declaraba pendiente). Se declara sólo
  // `references` — ver `types.ts#needsEdges`, "unión genérica".
  needsEdges: ["references"],
  thresholds: {
    minSkippedLevels: MIN_SKIPPED_LEVELS_SPEC,
    minRealLayers: MIN_REAL_LAYERS_SPEC,
  },
  maxFindings: MAX_FINDINGS_SPEC,
  run(repo: RepoUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const graph = repo.graph;
    // Defensivo: `run.ts#runInterFile` ya filtra `needsGraph && graph === null`
    // ANTES de llamar a `run()` (reporta `sin-grafo`) — este `return []` nunca
    // debería ejecutarse en producción, pero `CodeGraph | null` sigue siendo
    // el tipo declarado.
    if (!graph) return [];
    return buildLayerSkipFindings(repo.files, graph, ctx.threshold("minSkippedLevels"), ctx.threshold("minRealLayers"));
  },
};
