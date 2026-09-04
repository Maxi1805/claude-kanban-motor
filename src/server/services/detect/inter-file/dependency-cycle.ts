/**
 * `dependency-cycle` — ciclo de dependencia entre archivos (PLAN.md K3: uno
 * de los "3 hallazgos inter-archivo baratos" que no dependen de la
 * resolución fina de símbolos: ciclos, archivo huérfano, símbolo sin uso).
 *
 * RELACIÓN (qué mide, sin jerga de AST): dos o más archivos que se alcanzan
 * mutuamente siguiendo sólo aristas DIRIGIDAS de dependencia — una
 * componente fuertemente conexa (SCC) de tamaño >= 2 sobre el grafo de
 * archivos. Definición con fuente: Arcan, "Cyclic Dependency"
 * (docs.arcan.tech/2.9.0, ESSeRE Lab) — la misma fuente que ya cita
 * `graph/metrics/ciclos.ts` (la métrica hermana de panel, id `scc`). Este
 * detector es una implementación INDEPENDIENTE: `graph/metrics/` está
 * pensado para un dashboard interactivo con proyección cacheada por
 * `topologyHash` y presupuesto de tiempo (`MetricBudget`), una superficie
 * que el contrato de detectores (`detect/types.ts`) no expone — un detector
 * `inter-file` recibe `RepoUnit.graph: CodeGraph` (nodos+aristas planos) y
 * nada más, así que este archivo calcula su propio Tarjan directamente sobre
 * eso, sin importar ni tocar el módulo del hermano.
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: sólo mira la FORMA del grafo (qué
 * archivo referencia a qué otro archivo) — cero vocabulario, cero nombres de
 * variable, clase o carpeta.
 *
 * FALSO POSITIVO CONOCIDO Y DOCUMENTADO — léase antes de tocar `severityOf`:
 * una implementación LEGÍTIMA de callbacks o del patrón Observer produce
 * EXACTAMENTE la misma firma estructural: dos (o más) archivos que se llaman
 * mutuamente A PROPÓSITO (el sujeto notifica al observador; el observador
 * vuelve a consultar al sujeto para leer su estado). Por eso todo hallazgo
 * declara `crossesFolderBoundary`: un ciclo de 2 archivos que viven en la
 * MISMA carpeta inmediata es mucho más compatible con ese patrón bien
 * aplicado (el par vive junto a propósito, con una relación de notificación
 * explícita) que con una dependencia arquitectónica accidental, y el
 * `detail` de cada hallazgo lo dice en vez de recomendar "romper el ciclo" a
 * ciegas — `severityOf` además castiga MENOS a un ciclo chico que no cruza
 * carpeta, por la misma razón.
 *
 * SIMPLIFICACIONES DECLARADAS:
 *  - Aristas consideradas: todas salvo `contains` (jerárquica — carpeta
 *    contiene archivo, archivo contiene símbolo — nunca de dependencia).
 *    Mismo criterio que la métrica hermana `connected-components` documenta
 *    ("todas menos contains"). En la práctica, HOY sólo `references` tiene
 *    volumen real: `imports`/`extends`/`implements`/... todavía emiten 0
 *    aristas en los 8 repos del corpus (Contrato 2 de aristas tipadas aún no
 *    cableado a `build.ts` — mismo hallazgo que reportó el agente de
 *    `ciclos.ts`, reproducido acá de forma independiente). El filtro es
 *    genérico a propósito, para no requerir rediseño el día que eso cambie.
 *  - **PROVENANCE — la brecha de Java, no escondida**: sólo cuentan aristas
 *    `declared` o `resolved`. Se EXCLUYEN a propósito las `inferred` (la
 *    etapa heurística `path-proximity` de la cascada de resolución, Ola 3):
 *    en guava resuelve el 81% de las aristas ACEPTADAS y su precisión no
 *    está validada contra el dataset etiquetado (que es sólo Ruby). Emitir
 *    con confianza alta un ciclo que sólo existe gracias a una arista
 *    heurística sin piso de precisión medido sería mentir por omisión sobre
 *    la certeza del hallazgo. Cuántos ciclos aparecen SÓLO si se agregan las
 *    `inferred`, por repo del corpus: ver el reporte de esta tarea (fuera de
 *    este archivo, no hay cifras de un repo del usuario acá).
 *  - Un hallazgo por COMPONENTE fuertemente conexo que califica (mismo
 *    criterio de agrupación que `graph/metrics/ciclos.ts#DependencyCycle`),
 *    pero el CONTENIDO del hallazgo (`members`/`size`/`locations`) YA NO es
 *    el componente entero — ver "EL CICLO MÍNIMO, NO EL SCC ENTERO" más
 *    abajo (Ola O): es el ciclo mínimo extraído de ese componente. No hay
 *    un hallazgo por archivo miembro tampoco (eso no cambió).
 *

 * TECHO DE SEVERIDAD POR PROVENANCE (P5, CRITERIO UNIFICADO — mismo en
 * `layer-skip.ts`/`coupling-without-abstraction.ts`/
 * `inappropriate-intimacy.ts`/`fanout-without-cohesion.ts`; reemplaza a este
 * detector NO teniendo ningún amortiguador de confianza antes de esta tarea,
 * pese a que sólo cuenta aristas `declared`/`resolved`): se mide, para el
 * conjunto de miembros de cada ciclo, qué fracción de TODAS sus aristas de
 * dependencia entre sí — cualquier `provenance`, mismo filtro de `kind`
 * (`!== "contains"`) — es de baja confianza: `inferred`, o (agregado en A3b,
 * ver "GLOBAL-UNIQUENESS DESNUDO" más abajo) `resolved/global-uniqueness`
 * sobre una referencia "bare". Si esa fracción supera 0.5
 * (`MAJORITY_LOW_CONFIDENCE_RATIO`), la severidad se ACOTA a un techo bajo
 * (`LOW_CONFIDENCE_SEVERITY_CEILING = 35`) sin importar `size`/
 * `crossesFolderBoundary`. Medición de provenance, no de lenguaje: este
 * detector sigue sin leer `language` en ningún momento (ver "LÍMITES
 * DECLARADOS POR LENGUAJE" abajo, sin cambios).
 *
 * LÍMITE MEDIDO DE ESTE TECHO, NO OCULTO — verificado corriendo este
 * detector sobre el grafo real de guava (P5, antes de tocar código): de sus
 * 112 hallazgos sin tope de volumen (111 de ellos con AMBOS miembros
 * compartiendo basename — la firma del bug de árbol espejo `android/guava/**`
 * ↔ `guava/**` que `inappropriate-intimacy.ts` documenta con su propio
 * repro), este techo por `inferred` acota **0 de 112**: las aristas que
 * cierran esos ciclos espejo son `provenance: "resolved"` con `resolvedBy:
 * "global-uniqueness"` (no `"inferred"`), una categoría de provenance
 * distinta que este techo no cubre. Es la raíz que `inappropriate-
 * intimacy.ts` ya documenta (`graph/resolve.ts`, fuera de alcance — regla 6):
 * esta unificación entrega el criterio pedido (una regla, medida, no un
 * nombre de lenguaje) pero NO resuelve por sí sola la saturación de guava que
 * motivó esta tarea. Reportado, no escondido.
 *
 * LÍMITES DECLARADOS POR LENGUAJE: ninguno explícito — el detector no lee
 * `language` en absoluto, sólo `CodeGraphNode.file`/`.kind`, así que es
 * agnóstico de lenguaje por construcción. Un lenguaje sin aristas
 * `references` de calidad (porque el extractor todavía es débil ahí) se
 * traduce en "no encontró ciclos", indistinguible de "no hay ciclos" —
 * limitación heredada del grafo, no de este detector, declarada arriba.
 *
 * REDEFINICIÓN (frente de precisión, agosto 2026) — `crossesFolderBoundary`
 * PASA DE SEÑAL DE SEVERIDAD A CONDICIÓN DE EMISIÓN. Antes de esta ola el
 * detector reportaba TODO SCC de tamaño >= 2 (la definición cruda de Arcan) y
 * sólo bajaba la severidad cuando los miembros vivían en la misma carpeta —
 * medía 6% de precisión (1/17, `tests/golden/precision`). Re-muestreado y
 * juzgado a mano ESTA ola sobre 4 lenguajes (java/guava, ruby/rubocop,
 * typescript/nest, vue/vueuse) con hallazgos FRESCOS (no la planilla vieja):
 * **el ÚNICO verdadero positivo de los 17 juzgados es el ÚNICO que cruza
 * carpeta** (`rubocop/lib/rubocop/cop/correctors/ordered_gem_corrector.rb`
 * ↔ `rubocop/lib/rubocop/cop/mixin/ordered_gem_node.rb` —
 * `OrderedGemCorrector` hace `include OrderedGemNode` y
 * `OrderedGemNode#register_offense` llama de vuelta a
 * `OrderedGemCorrector.correct` — una dependencia mutua real entre un mixin y
 * la clase que lo incluye, cruzando `cop/mixin/` ↔ `cop/correctors/`). TODOS
 * los ciclos de tamaño 2 sin cruzar carpeta que se juzgaron son pares de
 * clases utilitarias hermanas del MISMO paquete con imports estáticos
 * cruzados genuinos (`guava/.../Iterators.java` ↔ `.../Lists.java`, cada uno
 * con un `import static` real al otro — verificado leyendo ambos archivos),
 * pares de fixtures DELIBERADAMENTE circulares para probar el mecanismo
 * `forwardRef()` de NestJS (`nest/integration/.../circular-modules/
 * circular.service.ts` ↔ `input.service.ts`, con `forwardRef` importado en el
 * propio archivo), o un componente y su archivo de demo
 * (`vueuse/packages/core/useIntersectionObserver/demo.vue` ↔ `index.ts`, 4
 * pares juzgados, los 4 falsos). Ningún revisor sin
 * conocimiento especial de estos repos concluiría que un par de clases
 * utilitarias hermanas, un fixture de prueba de una feature de
 * resolución-de-ciclos, o un componente con su propio demo son un problema
 * de arquitectura — son exactamente la forma que la intención original de
 * "Cyclic Dependency" (Arcan) busca EXCLUIR: cohesión esperada dentro de un
 * mismo módulo, no acoplamiento accidental entre módulos. La intención
 * arquitectónica del smell siempre fue sobre FRONTERAS de módulo cruzadas
 * sin querer — `crossesFolderBoundary` ya medía exactamente esa distinción,
 * sólo que como amortiguador de severidad, dejando pasar el 100% de esos
 * casos como hallazgo igual. Ahora es un `continue`, no una resta.
 *
 * LÍMITE MEDIDO DE ESTA REDEFINICIÓN, NO OCULTO. Cruzar carpeta NO garantiza
 * verdad: dos casos juzgados falsos SÍ cruzan carpeta y sobreviven a este
 * filtro. (1) `click/examples/imagepipe/imagepipe.py` (17 archivos en un solo
 * SCC, `folders=4`) — repro exacto, `scratchpad/probe-click-cycle2-mbzt.mts`
 * de esta tarea: `src/click/_termui_impl.py`'s `ProgressBar` referencia un
 * parámetro propio llamado `generator` y `global-uniqueness` (etapa 9,
 * `graph/resolve.ts`) lo resuelve, por ser el ÚNICO OTRO `generator`
 * declarado en el repo, contra una variable local sin relación del script de
 * EJEMPLO `imagepipe.py` — la arista que cierra el ciclo en ESE sentido no
 * existe en la realidad, existe sólo porque dos identificadores genéricos
 * comparten nombre. (2) `guava-gwt/src-super/.../cache/super/.../
 * CapacityEnforcingMap.java` ↔ `guava/.../cache/LocalCache.java` — el mismo
 * árbol-espejo de fuente que `inappropriate-intimacy.ts` ya documenta
 * ("SEGUNDA BRECHA"), acá con una ruta de `guava-gwt` en vez de `android/`.
 * Los dos casos comparten la MISMA raíz: `graph/resolve.ts#global-uniqueness`
 * no distingue "este nombre es realmente único en todo el repo" de "este
 * nombre sólo aparece dos veces y AMBAS son declaraciones no relacionadas
 * que casualmente coinciden" — pero el ÚNICO verdadero positivo del corpus
 * (rubocop, `OrderedGemNode`) TAMBIÉN se resuelve vía `global-uniqueness` en
 * AMBOS sentidos, así que excluir esa etapa de forma ciega (como ya se hace
 * con `inferred`) mata el único verdadero junto con los falsos — probado y
 * descartado, no ignorado: la diferencia entre "OrderedGemNode" (nombre
 * propio, capitalizado, genuinamente único) y "generator" (palabra genérica,
 * coincide por accidente) es semántica de identificador, no de provenance ni
 * de estructura de grafo — resolverla bien pertenece a `graph/resolve.ts`
 * (archivo compartido, fuera de alcance de este detector). Declarado, no
 * escondido: este filtro reduce el volumen de casos como éste (mata TODOS
 * los pares same-folder, que eran la mayoría) pero no los elimina cuando el
 * accidente de nombre cruza una carpeta real.
 *
 * GLOBAL-UNIQUENESS DESNUDO (frente A3b, agosto 2026) — SEGUNDO ARREGLO DE
 * CONFIANZA, complementario al de arriba, no un reemplazo. Medido de nuevo
 * (`tests/golden/precision/lodash.verdicts.csv`, verificado leyendo el
 * código fuente real, no sólo la planilla): el ciclo #1 de lodash (7
 * archivos: `fp/_baseConvert.js`, `fp/_mapping.js`, `lib/common/file.js`,
 * `lib/common/util.js`, `lib/main/build-dist.js`, `lib/main/build-doc.js`,
 * `lodash.js`) está fabricado — `lodash.js` tiene un único `require` en todo
 * el archivo y NINGUNO apunta a los scripts de build. Las aristas que
 * cierran el ciclo hacia atrás son SEIS colisiones de nombre genérico entre
 * declaraciones LOCALES sin relación: `config` (una constante de build en
 * `build-doc.js:17` Y una variable local en `_baseConvert.js:152`), `Hash`
 * (un constructor de utilidad de build en `common/util.js:15` Y la
 * estructura interna de lodash en `lodash.js:1951`), `baseLodash` (una RUTA
 * de archivo en `build-dist.js:13` Y el constructor del wrapper central de
 * toda la librería en `lodash.js:1732`), `min`/`object`/`result` (mismo
 * patrón). Cada par es la ÚNICA declaración con ese nombre fuera de
 * parámetros en todo el repo, así que `global-uniqueness` (etapa 9,
 * `graph/resolve.ts`) los empareja sin ninguna evidencia de import o alcance
 * — exactamente la raíz que ya documenta el bug espejo de guava/click
 * arriba, pero sin necesitar `inferred`: acá el `provenance` es `"resolved"`.
 *
 * LA DISTINCIÓN QUE SÍ SE PUEDE MEDIR SIN TOCAR `graph/resolve.ts` (archivo
 * compartido, fuera de alcance — regla 6): `CodeGraphEdge.roles` (CONTRATO-
 * F8G.md §1.2) ya viaja con la arista aceptada, sea cual sea la etapa que la
 * aceptó (`resolve.ts` arma `roles` desde `candidate.from.ref.role` ANTES de
 * saber qué etapa va a aceptar, no después) — así que una arista
 * `resolved/global-uniqueness` que además es "bare" (identificador desnudo,
 * sin receptor ni calificador NUNCA, en NINGUNA de sus ocurrencias
 * colapsadas) es estructuralmente distinta de una `receiver-member`/
 * `qualified` (alguna forma de `X.miembro`): la primera no tiene NINGÚN
 * contexto sintáctico que la ate a un tipo o módulo — es el nombre solo,
 * global-uniqueness la aceptó por descarte, sin evidencia positiva. Las seis
 * colisiones de lodash son las seis "bare": `Hash(...)`, `baseLodash()`,
 * `min(...)` etc. se llaman desnudos dentro de sus respectivos archivos —
 * exactamente la forma que produce un candidato "bare" en
 * `graph/references.ts#classifyRole`, paso 9.
 *
 * POR QUÉ NO TOCA EL ÚNICO VERDADERO DEL CORPUS (rubocop,
 * `OrderedGemNode`/`OrderedGemCorrector`, ver "REDEFINICIÓN" arriba):
 * `OrderedGemNode#register_offense` llama a `OrderedGemCorrector.correct(...)`
 * — receptor explícito (`OrderedGemCorrector`), rol `receiver-member`, no
 * `bare`. Verificado corriendo `dependency-cycle.test.ts` con ambos roles por
 * separado (ver los tests nuevos de esta sección) antes de aceptar el
 * arreglo. TAMPOCO toca el caso ya declarado de `_termui_impl.py`
 * (`self.generator()`, LÍMITE MEDIDO arriba): ese `self.` también es
 * `receiver-member`, así que sigue siendo el mismo límite declarado, sin
 * regresión ni arreglo — `self`/`cls` de Python necesitarían su propio
 * tratamiento (ya anotado como pendiente sistémico en otro detector,
 * `unused-variable`, fuera de este archivo).
 *
 * `isBareGlobalUniquenessEdge` corta la arista en DOS lugares, no uno:
 * (1) `isConfidentDependencyEdge` — ya no puede CERRAR un ciclo, la raíz del
 * arreglo, mismo tratamiento que `inferred`; (2) el cómputo de confianza que
 * alimenta `severityOf` ahora también cuenta estas aristas como evidencia de
 * baja confianza (junto a `inferred`) para un ciclo que sobreviva por OTRO
 * lado con aristas confiables pero tenga ruido "bare" alrededor del mismo
 * par — ver `computeLowConfidenceRatioByPair` (antes
 * `computeInferredRatioByPair`, renombrada porque ya no mide sólo
 * `inferred`).
 *
 * LÍMITE DE ESTE ARREGLO, MEDIDO, NO OCULTO: sólo aplica a `kind ===
 * "references"` (el único que hoy escribe `roles` — CONTRATO-F8G.md §1.2,
 * ver el docstring de `CodeGraphEdge.roles`); una arista `resolved/global-
 * uniqueness` de cualquier OTRO kind (`instantiates`/`calls` sin `roles`
 * todavía escrito/etc.) no tiene `roles` y por lo tanto NO se excluye —
 * conservador a propósito: sin evidencia de que sea "bare", se la trata como
 * confiable, igual que antes. No se corrió sobre el corpus completo (regla
 * de la ola: la mide el integrador); medido a mano sobre lodash (arriba,
 * leyendo el código fuente real de los 7 archivos) y con los tests unitarios
 * de este archivo.
 *
 * REFERENCIA SIN NINGÚN ROL — "decl-name" puro (frente de precisión, Ola O,
 * agosto 2026) — TERCER ARREGLO DE CONFIANZA, la misma familia de bug que
 * "GLOBAL-UNIQUENESS DESNUDO" pero un mecanismo DISTINTO y más amplio: no
 * hace falta `resolvedBy === "global-uniqueness"`, alcanza con que la arista
 * `references` no traiga NINGÚN bit de rol.
 *
 * EL HALLAZGO QUE LO EXPUSO: el ciclo #1 de lodash que "GLOBAL-UNIQUENESS
 * DESNUDO" (arriba) declaró arreglado NO estaba arreglado — sobrevivió (3
 * archivos: `fp/_baseConvert.js`, `fp/_mapping.js`, `lodash.js`) esta ola
 * porque las seis colisiones ya no cierran vía "bare" pero el `roles` de
 * ESTAS aristas concretas viene AUSENTE, no con el bit `bare` puesto — así
 * que el chequeo `edge.roles !== undefined` de `isBareGlobalUniquenessEdge`
 * las deja pasar sin tocarlas. Repro (`scratchpad/probe-lodash-cycle-n4.mts`,
 * dump de aristas reales, esta tarea): `sym:fp/_baseConvert.js#baseConvert
 * -> sym:lodash.js#overArg` (`references/resolved/global-uniqueness`,
 * `roles` ausente) y dos pares más con `object`/`result`, misma forma.
 *
 * LA CAUSA, LEÍDA EN `graph/resolve.ts` (archivo compartido, fuera de
 * alcance — regla 6, ver PIDO A OTRO FRENTE más abajo): `roleMaskFor`
 * (`resolve.ts`) devuelve `undefined` — y por lo tanto NINGÚN bit — para
 * exactamente UN valor de `ReferenceRole` que de todos modos puede llegar a
 * `accept`: `"decl-name"`. `graph/references.ts#classifyRole` documenta sin
 * ambigüedad qué es ese rol: "it is the function/class's own declared name,
 * **not a use of anything**" (pasos 3 y 5 del clasificador: el propio nombre
 * declarado de una función/clase, o el nombre a la izquierda de un `binding`
 * — `var`/`const`/`let`). Verificado leyendo el código fuente real: `overArg`
 * en la colisión de arriba ES el nombre de `function overArg(func,
 * transform) {` declarado DENTRO de `_baseConvert.js` (línea 443) — no una
 * llamada a nada, el sitio es la propia declaración. `object`/`result` en
 * `_mapping.js` son las declaraciones `var object = ..., result = {}`
 * (líneas 267-268) — mismo patrón. Declarar una función o variable local
 * llamada igual que algo declarado en OTRO archivo nunca es una dependencia
 * — es una coincidencia de nombre en el sitio donde el nombre NACE, ni
 * siquiera en un sitio de uso.
 *
 * `syntacticRoleStage` (`resolve.ts`, etapa 1) SÍ rechaza los otros dos roles
 * de "no es un uso" (`key`, `parameter`) en la misma etapa, con el mismo
 * razonamiento — pero deja pasar `decl-name` de largo ("bare/qualified/
 * decl-name siguen de largo: ninguno de los tres tiene evidencia estructural
 * en el ROL solo que los descarte", cita textual del comentario de esa
 * etapa) asumiendo que OTRA etapa lo va a filtrar por otra vía. Ninguna lo
 * hace: `decl-name` no tiene guarda en ninguna etapa de la cascada (7
 * etapas restantes revisadas, ninguna comprueba `role`), así que sobrevive
 * hasta `global-uniqueness` o `path-proximity` igual que un `bare`
 * legítimo. El propio `resolve.ts` ya deja constancia de la incertidumbre
 * ("un candidato que de todos modos llegara a `accept` con uno de los tres
 * roles sin arista (no debería, pero esta función no asume la garantía de
 * otro módulo)") — y el docstring de `EdgeRole`/`CodeGraphEdge.roles` en
 * `graph/types.ts` afirma lo contrario ("los otros tres [`decl-name`,
 * `parameter`, `key`] nunca llegan a una arista, la etapa `syntactic-role`
 * los rechaza antes") — afirmación que este hallazgo demuestra FALSA para
 * `decl-name` específicamente, con caso real, no hipotético.
 *
 * QUÉ EXCLUYE ESTE ARREGLO, PRECISO: `isDeclNameOnlyReferenceEdge` —
 * `kind === "references" && provenance === "resolved" && roles ===
 * undefined`. Restringido a `provenance === "resolved"` a propósito, NO a
 * cualquier `references` sin `roles`: en producción un `kind: "references"`
 * SIEMPRE pasa por `roleMaskFor` (los dos únicos sitios que lo emiten,
 * `resolve.ts` líneas ~746/791, tanto para `accept` como para `ambiguous`) —
 * `provenance: "declared"` NUNCA ocurre para este `kind` en producción (grep
 * propio de esta tarea sobre los 8 archivos de `graph/edges/*.ts` que emiten
 * `"declared"`: ninguno escribe `kind: "references"`). Restringir a
 * `"resolved"` por dos motivos: (a) es semánticamente correcto — `inferred`
 * ya está excluido arriba sin condición, y `ambiguous` lo excluye
 * `edgeIsAmbiguous` en la misma función, así que `"resolved"` es el único
 * valor de `provenance` que puede llegar hasta acá con `kind ===
 * "references"`; (b) preserva los fixtures de este archivo que usan
 * `provenance: "declared"` como el valor de arista "confiable, sin matices"
 * (el default de `edge()` en el test) — un fixture de test no pasa por
 * `resolve.ts`, así que no hereda la garantía "declared nunca ocurre acá" de
 * producción, y tratarlo igual rompería toda la batería existente por un
 * caso que la producción real no fabrica.
 *
 * NO ES UN REEMPLAZO de `isBareGlobalUniquenessEdge`: son dos condiciones
 * disjuntas por construcción (una exige `roles !== undefined` con el bit
 * `bare` puesto y ningún otro; la otra exige `roles === undefined`) — las
 * dos se declaran por separado y las dos alimentan `isConfidentDependencyEdge`
 * y `computeLowConfidenceRatioByPair`.
 *
 * PIDO A OTRO FRENTE (dueño del grafo, N9): `graph/resolve.ts#
 * syntacticRoleStage` — rechazar `role === "decl-name"` en la etapa 1, el
 * mismo tratamiento que ya reciben `key`/`parameter` ahí mismo (misma razón:
 * "nunca es una referencia real, ninguno de los tres usa un símbolo"). Es la
 * raíz real: arreglarla ahí cierra el hueco para TODO consumidor de
 * `references`/`roles`, no sólo este detector, y hace cierta la afirmación
 * que `graph/types.ts`'s `EdgeRole` docstring ya da por hecha. Este detector
 * sólo puede parchear el síntoma del lado de acá (`roles === undefined` ⇒
 * baja confianza) porque `resolve.ts` es de otro frente — regla 6.
 */
import { citado, presupuesto } from "../thresholds.js";
import type { Threshold } from "../thresholds.js";
import { edgeHasRole, edgeIsAmbiguous, type CodeGraphEdge, type CodeGraphNode } from "../../graph/types.js";
import type { InterFileDetector, RawFinding, RepoUnit, RoleLocation, RunContext } from "../types.js";

type ThresholdKey = "minCycleSize";

/** Misma cita que `graph/metrics/ciclos.ts` (misma definición de Arcan, archivo independiente). */
const MIN_CYCLE_SIZE_SPEC = citado(2, {
  work: "Arcan",
  rule: "Cyclic Dependency: SCC de tamaño >= 2 sobre el grafo de dependencias",
  url: "https://docs.arcan.tech/2.9.0",
});

/** CONTRATO-F4.md §1.8: tope de VOLUMEN propio, no de detección. Un panel no
 *  lista de forma útil más de unas pocas decenas de ciclos a la vez. */
const MAX_FINDINGS_SPEC = presupuesto(30, {
  rationale:
    "un panel legible no muestra de forma útil más de unas pocas decenas de ciclos a la vez; es un tope de volumen, no un umbral de detección.",
});

/** Mayoría de aristas de baja confianza (`inferred` o `resolved/global-
 *  uniqueness` "bare", A3b) entre los miembros del ciclo (mismo corte 0.5
 *  que el resto del catálogo F5) — ver "TECHO DE SEVERIDAD POR PROVENANCE" y
 *  "GLOBAL-UNIQUENESS DESNUDO" en el docstring del módulo. No es un
 *  `Threshold` de detección: no decide SI se emite, sólo cuánto se acota la
 *  severidad de lo que ya se decidió emitir. */
const MAJORITY_LOW_CONFIDENCE_RATIO = 0.5;
const LOW_CONFIDENCE_SEVERITY_CEILING = 35;

function fileName(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

function immediateFolderOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

/**
 * `path` sin su extensión de archivo, conservando el directorio — sólo forma
 * de PATH, cero vocabulario de lenguaje: "a/b/foo.rb" → "a/b/foo",
 * "a/b/foo.test.ts" → "a/b/foo.test" (sólo el último segmento después del
 * último punto del BASENAME, igual que cualquier extensión de archivo).
 * Un basename sin punto, o cuyo único punto es el primer carácter (dotfile,
 * `.gitignore`), no tiene "extensión" que quitar — se devuelve entero.
 */
function stemOf(path: string): string {
  const slash = path.lastIndexOf("/");
  const base = slash === -1 ? path : path.slice(slash + 1);
  const dot = base.lastIndexOf(".");
  const stem = dot <= 0 ? base : base.slice(0, dot);
  return slash === -1 ? stem : path.slice(0, slash + 1) + stem;
}

/**
 * NAMESPACING, NO CICLO (frente de precisión, Ola O, agosto 2026) — PRIMER
 * DEFECTO nombrado en el encargo de esta tarea.
 *
 * EL PATRÓN: un archivo `foo.ext` y un directorio HOMÓNIMO `foo/` (mismo
 * stem — ver `stemOf` arriba) que vive junto a él son estructura
 * padre-hijo declarada por el propio autor del repo (el archivo es el
 * "índice"/fachada del módulo; el directorio homónimo es su despliegue
 * interno) — no dos módulos independientes que casualmente se llaman entre
 * sí. Es una convención de organización de archivos, no de ningún lenguaje
 * puntual: no hay nombre de framework ni de ecosistema en esta función,
 * sólo comparación de rutas.
 *
 * POR QUÉ `crossesFolderBoundary` NO LO ATRAPA: el archivo "hub" y su
 * subdirectorio homónimo están, por definición, en carpetas INMEDIATAS
 * distintas (`immediateFolderOf("a/foo.rb")` = "a"; `immediateFolderOf(
 * "a/foo/bar.rb")` = "a/foo") — la redefinición de esta ola (ver
 * "REDEFINICIÓN" arriba) exige cruce de carpeta como condición de emisión,
 * y este patrón SIEMPRE lo cumple. Cruzar carpeta filtra acoplamiento
 * accidental entre módulos hermanos; no filtra un módulo y su propio
 * contenido interno.
 *
 * EVIDENCIA MEDIDA (esta tarea, `corpus/rubocop`, hallazgos frescos, no la
 * planilla vieja — dump completo en el informe de esta tarea): TRES de los
 * ciclos que este detector emitía antes del arreglo son EXACTAMENTE esta
 * forma — `lib/rubocop/cop/mixin/hash_transform_method.rb` ↔
 * `lib/rubocop/cop/mixin/hash_transform_method/autocorrection.rb`;
 * `lib/rubocop/cop/style/bisected_attr_accessor.rb` ↔
 * `lib/rubocop/cop/style/bisected_attr_accessor/macro.rb`;
 * `lib/rubocop/cop/internal_affairs/node_pattern_groups.rb` + sus dos
 * archivos en `.../node_pattern_groups/` (ciclo de 3, el hub más DOS
 * archivos de su propio subdirectorio) — la misma familia que el
 * integrador de la ola anterior ya había juzgado a mano en Jekyll
 * (`liquid_renderer.rb` ↔ `liquid_renderer/`) y calificado "no es un
 * ciclo, es namespacing" (INTEGRADOR.md §4.2 punto 6).
 *
 * QUÉ CUENTA COMO "HUB": basta con que EXISTA un miembro `hub` del ciclo tal
 * que TODOS los demás miembros vivan dentro de `stemOf(hub) + "/"` — no
 * exige que el ciclo tenga tamaño 2: el caso de 3 archivos de arriba (un
 * hub + dos archivos de su propio subdirectorio, sin ningún miembro FUERA
 * de esa relación) también es namespacing puro y también se excluye. Un
 * ciclo con un tercer miembro ajeno al par hub/subdirectorio NO cumple esta
 * condición para ningún `hub` candidato y sigue evaluándose normalmente —
 * esta función no perdona acoplamiento real sólo porque UNA de sus aristas
 * tenga esta forma.
 *
 * LÍMITE DECLARADO: esto es una condición NECESARIA de namespacing, no
 * suficiente en el otro sentido — un hub y su subdirectorio homónimo
 * PODRÍAN en principio tener una dependencia mutua real y accidental
 * (código legítimamente enredado dentro del propio módulo). No hay forma
 * de distinguir eso sin leer el CONTENIDO de las aristas (qué se importa,
 * por qué), que es exactamente lo que "GLOBAL-UNIQUENESS DESNUDO"/
 * "REFERENCIA SIN NINGÚN ROL" arriba ya hacen por su cuenta — si esas dos
 * exclusiones no bastan para descartar la arista, esta función todavía
 * asume que la relación estructural padre-hijo domina, medido: de los 3
 * casos rubocop, CERO sobrevivían como una dependencia real bajo lectura
 * directa del código (los tres son `require_relative` del propio
 * subdirectorio, sin ninguna forma de acoplamiento cruzado real).
 */
function isNamespaceHubCycle(members: readonly string[]): boolean {
  if (members.length < 2) return false;
  for (const hub of members) {
    const hubPrefix = `${stemOf(hub)}/`;
    let allRestUnderHub = true;
    for (const other of members) {
      if (other === hub) continue;
      if (!other.startsWith(hubPrefix)) {
        allRestUnderHub = false;
        break;
      }
    }
    if (allRestUnderHub) return true;
  }
  return false;
}

/**
 * Ver "GLOBAL-UNIQUENESS DESNUDO" en el docstring del módulo — el segundo
 * amortiguador de confianza (A3b, agosto 2026), el caso lodash. `roles` sólo
 * viaja en aristas `references`/`calls` (CONTRATO-F8G.md §1.2); en cualquier
 * otro `kind` es `undefined` y esta función responde `false` (conservadora:
 * sin evidencia de que sea "bare", no se excluye).
 */
function isBareGlobalUniquenessEdge(edge: CodeGraphEdge): boolean {
  return (
    edge.provenance === "resolved" &&
    edge.resolvedBy === "global-uniqueness" &&
    edge.roles !== undefined &&
    edgeHasRole(edge, "bare") &&
    !edgeHasRole(edge, "qualified") &&
    !edgeHasRole(edge, "receiver-member")
  );
}

/**
 * Ver "REFERENCIA SIN NINGÚN ROL — decl-name puro" en el docstring del
 * módulo (Ola O). Distinta de `isBareGlobalUniquenessEdge`: no exige
 * `resolvedBy === "global-uniqueness"` (una candidata `decl-name` puede
 * aceptarse en cualquier etapa posterior a `syntactic-role`, no sólo esa) —
 * exige `roles === undefined`, la firma de que TODAS las ocurrencias
 * colapsadas en esta arista fueron el propio nombre declarado de una
 * función/clase/binding, nunca un uso.
 */
function isDeclNameOnlyReferenceEdge(edge: CodeGraphEdge): boolean {
  return edge.kind === "references" && edge.provenance === "resolved" && edge.roles === undefined;
}

/** Todo kind salvo `contains`, y sólo provenance `declared`/`resolved` — ver
 *  "SIMPLIFICACIONES DECLARADAS" en el docstring del módulo. Excluye también
 *  `ambiguous` (CONTRATO-F9.md §4.5: fuera de toda consulta por defecto) —
 *  "sabemos que hay relación, no cuál" no debe cerrar un ciclo —, una arista
 *  `resolved/global-uniqueness` "bare" (`isBareGlobalUniquenessEdge`, ver el
 *  docstring del módulo): nombre globalmente único no es lo mismo que import
 *  real, y sin receptor ni calificador no hay ninguna evidencia sintáctica
 *  que la ate al destino elegido — y una arista `references` sin NINGÚN rol
 *  (`isDeclNameOnlyReferenceEdge`, "REFERENCIA SIN NINGÚN ROL" en el
 *  docstring del módulo): todas sus ocurrencias fueron el propio nombre
 *  declarado de una función/clase/binding, nunca un uso real. */
function isConfidentDependencyEdge(edge: CodeGraphEdge): boolean {
  return (
    edge.kind !== "contains" &&
    edge.provenance !== "inferred" &&
    !edgeIsAmbiguous(edge) &&
    !isBareGlobalUniquenessEdge(edge) &&
    !isDeclNameOnlyReferenceEdge(edge)
  );
}

interface FileGraph {
  readonly files: readonly string[];
  readonly out: readonly (readonly number[])[];
  /** Nº de aristas de dependencia crudas colapsadas por PAR de archivos (no dirigido, para evidencia). */
  readonly edgeCountBetween: ReadonlyMap<string, number>;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a} ${b}` : `${b} ${a}`;
}

interface PairProvenanceCount {
  total: number;
  /** `inferred` (path-proximity) + `isBareGlobalUniquenessEdge` (global-uniqueness desnudo) + `isDeclNameOnlyReferenceEdge` (decl-name puro, Ola O) — ver "GLOBAL-UNIQUENESS DESNUDO" y "REFERENCIA SIN NINGÚN ROL" en el docstring del módulo. */
  lowConfidence: number;
}

/**
 * Segunda pasada O(E), independiente de `isConfidentDependencyEdge`: mide,
 * para cada par no ordenado de archivos, cuántas de TODAS sus aristas de
 * dependencia (cualquier `provenance`, mismo filtro de `kind`) son de baja
 * confianza — `inferred` (path-proximity, "TECHO DE SEVERIDAD POR
 * PROVENANCE" en el docstring del módulo), `resolved/global-uniqueness`
 * "bare" (sin receptor ni calificador nunca, "GLOBAL-UNIQUENESS DESNUDO" en
 * el mismo docstring — el caso lodash) o `references` sin ningún `roles`
 * ("REFERENCIA SIN NINGÚN ROL", Ola O — decl-name puro, el caso lodash que
 * "GLOBAL-UNIQUENESS DESNUDO" no cubría). Deliberadamente separada de
 * `buildFileGraph` (que sólo usa aristas confiables para el propio Tarjan):
 * ésta mide qué tan ruidoso es el vecindario del par, incluyendo la
 * evidencia que esa pasada excluyó — así un ciclo que sobrevive por OTRA
 * arista confiable pero tiene mucho ruido de baja confianza alrededor del
 * mismo par sigue viendo su severidad acotada. Antes se llamaba
 * `computeInferredRatioByPair` — renombrada porque ya no mide sólo
 * `inferred` (A3b).
 */
function computeLowConfidenceRatioByPair(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): Map<string, PairProvenanceCount> {
  const nodeById = new Map(nodes.map((n) => [n.id, n] as const));
  const counts = new Map<string, PairProvenanceCount>();
  for (const edge of edges) {
    if (edge.kind === "contains") continue;
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to || from.file === to.file) continue;
    const key = pairKey(from.file, to.file);
    let c = counts.get(key);
    if (!c) {
      c = { total: 0, lowConfidence: 0 };
      counts.set(key, c);
    }
    c.total++;
    if (edge.provenance === "inferred" || isBareGlobalUniquenessEdge(edge) || isDeclNameOnlyReferenceEdge(edge)) c.lowConfidence++;
  }
  return counts;
}

/** Proyecta `CodeGraph.nodes`/`.edges` a un grafo dirigido a grano archivo,
 *  usando sólo las aristas de `isConfidentDependencyEdge`. */
function buildFileGraph(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): FileGraph {
  const nodeById = new Map(nodes.map((n) => [n.id, n] as const));
  const indexOf = new Map<string, number>();
  const files: string[] = [];
  const adj: Set<number>[] = [];
  const edgeCountBetween = new Map<string, number>();

  const indexFor = (file: string): number => {
    let i = indexOf.get(file);
    if (i === undefined) {
      i = files.length;
      files.push(file);
      indexOf.set(file, i);
      adj.push(new Set());
    }
    return i;
  };

  for (const edge of edges) {
    if (!isConfidentDependencyEdge(edge)) continue;
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to || from.file === to.file) continue; // intra-archivo: no es dependencia entre archivos
    const fi = indexFor(from.file);
    const ti = indexFor(to.file);
    adj[fi]!.add(ti);
    const key = pairKey(from.file, to.file);
    edgeCountBetween.set(key, (edgeCountBetween.get(key) ?? 0) + 1);
  }

  return { files, out: adj.map((s) => [...s]), edgeCountBetween };
}

/**
 * Tarjan clásico, ITERATIVO (pila explícita: nodo + próximo índice de hijo),
 * no recursivo: un repo real puede tener una SCC de cientos de archivos (la
 * métrica hermana mide 732 en guava) y esa profundidad de recursión puede
 * exceder la pila de V8. Devuelve TODAS las componentes, sin filtrar por
 * tamaño (el filtro por `minCycleSize` es responsabilidad de quien llama).
 */
function tarjanSCC(n: number, out: readonly (readonly number[])[]): number[][] {
  const index = new Int32Array(n).fill(-1);
  const lowlink = new Int32Array(n);
  const onStack = new Uint8Array(n);
  const stack: number[] = [];
  const components: number[][] = [];
  let nextIndex = 0;

  const nodeStack: number[] = [];
  const childStack: number[] = [];

  for (let root = 0; root < n; root++) {
    if (index[root] !== -1) continue;
    index[root] = lowlink[root] = nextIndex++;
    stack.push(root);
    onStack[root] = 1;
    nodeStack.push(root);
    childStack.push(0);

    while (nodeStack.length > 0) {
      const v = nodeStack[nodeStack.length - 1]!;
      const childPos = childStack[childStack.length - 1]!;
      const neighbors = out[v]!;

      if (childPos < neighbors.length) {
        childStack[childStack.length - 1] = childPos + 1;
        const w = neighbors[childPos]!;
        if (index[w] === -1) {
          index[w] = lowlink[w] = nextIndex++;
          stack.push(w);
          onStack[w] = 1;
          nodeStack.push(w);
          childStack.push(0);
        } else if (onStack[w] && index[w]! < lowlink[v]!) {
          lowlink[v] = index[w]!;
        }
        continue;
      }

      // Terminó de explorar todos los hijos de `v`: se desapila y propaga su
      // `lowlink` al padre — el mismo trabajo que haría el `return` de la
      // versión recursiva justo antes de volver.
      nodeStack.pop();
      childStack.pop();
      const parent = nodeStack[nodeStack.length - 1];
      if (parent !== undefined && lowlink[v]! < lowlink[parent]!) lowlink[parent] = lowlink[v]!;

      if (lowlink[v] === index[v]) {
        const comp: number[] = [];
        let w: number;
        do {
          w = stack.pop()!;
          onStack[w] = 0;
          comp.push(w);
        } while (w !== v);
        components.push(comp);
      }
    }
  }
  return components;
}

/**
 * EL CICLO MÍNIMO, NO EL SCC ENTERO (frente de precisión, Ola O, agosto
 * 2026) — SEGUNDO DEFECTO nombrado en el encargo de esta tarea.
 *
 * ANTES: `findDependencyCycles` reportaba la componente fuertemente conexa
 * (SCC) ENTERA que Tarjan devuelve como el hallazgo — "un hallazgo por CICLO
 * completo (todos sus miembros)" (ver "SIMPLIFICACIONES DECLARADAS" arriba,
 * ahora corregido). Un SCC de tamaño >= 2 es la definición de Arcan, pero
 * NO es lo mismo que "el ciclo": un SCC grande casi siempre contiene un
 * ciclo mucho más chico en su núcleo, más un montón de archivos que
 * simplemente son ALCANZABLES desde y hacia ese núcleo por caminos que no
 * son ellos mismos parte de ningún ciclo corto. Medido esta ola, hallazgos
 * FRESCOS (no la planilla vieja): `corpus/hugo` reportaba un SCC de **111
 * archivos**; `corpus/nest`, uno de **160**; `corpus/rubocop`, uno de
 * **84** — ningún revisor humano puede "romper" un hallazgo de 111 archivos
 * ni decidir cuál de sus ~5.500 aristas internas es la que hay que cortar
 * (`scratchpad/probe-scc-shape-n4.mts` de esta tarea). Coincide exactamente
 * con la cita del encargo: "un hallazgo de 114 archivos con 85% de aristas
 * dudosas no es accionable, y un ciclo de 114 archivos no se puede romper."
 *
 * AHORA: `findDependencyCycles` extrae el ciclo MÍNIMO — el camino dirigido
 * más corto que sale de un nodo del SCC y vuelve a él mismo, sin repetir
 * ningún nodo intermedio — y ES ESE el hallazgo, no el SCC que lo contiene.
 * Aplicado UNIFORMEMENTE (no sólo a los SCC gigantes): un SCC ya chico
 * (2/3/4 archivos) casi siempre ES su propio ciclo mínimo (nada que
 * recortar, mismo resultado que antes — ver los tests de este archivo que
 * no cambiaron), pero incluso ahí puede haber una diferencia: un SCC de 4
 * archivos donde sólo 2 forman el ciclo real y los otros 2 son alcanzables
 * pero no forman parte de NINGÚN camino de vuelta corto también se recorta
 * al núcleo real — es el mismo principio "mínimo, no el componente entero"
 * aplicado sin excepción de tamaño, no un parche sólo para los outliers.
 *
 * ALGORITMO: definición estándar de "girth" (la circunferencia mínima) de
 * un grafo dirigido, restringida al SUBGRAFO del propio SCC (ninguna arista
 * fuera de él puede formar parte de un ciclo del SCC, por definición de
 * componente fuertemente conexo) y a las MISMAS aristas confiables que
 * `buildFileGraph` ya usó (nunca se vuelve a mirar una arista de baja
 * confianza que el resto del detector ya descartó). Para cada nodo `s` del
 * componente: BFS multi-fuente arrancando en los sucesores directos de `s`
 * (distancia 1), buscando el camino más corto de vuelta a `s` — eso da el
 * ciclo más corto que PASA por `s`. El mínimo sobre todos los `s` del
 * componente es el ciclo mínimo del componente completo. Determinista: para
 * un mismo grafo, mismo resultado siempre — el orden de `comp` (que viene
 * de Tarjan, determinista) fija el orden en que se prueba cada `s`, y en
 * caso de empate de longitud gana el primero encontrado; corte temprano en
 * cuanto aparece un ciclo de longitud 2 (el mínimo posible: no hay
 * self-loops, `buildFileGraph` ya los excluye).
 *
 * COSTO, MEDIDO: O(tamaño_del_SCC × (tamaño_del_SCC + aristas_internas)),
 * un BFS acotado al componente por cada uno de sus nodos. Sobre los tres
 * SCC gigantes medidos arriba (111, 160 y 84 archivos, miles de aristas
 * internas cada uno) esta función corre en milisegundos —
 * `scratchpad/probe-scc-shape-n4.mts` mide 111×5.631 ≈ 625K y
 * 160×1.925 ≈ 308K operaciones en el peor caso, trivial para Node. No hay
 * tope artificial de tamaño de componente: si algún repo tuviera un SCC de
 * varios miles de archivos con aristas igual de densas el costo crecería,
 * pero ningún repo del corpus se acerca a eso hoy — declarado, no medido
 * contra ese caso porque no existe en los 13 repos disponibles.
 *
 * QUÉ SE PIERDE, DECLARADO: un SCC grande puede contener MÁS de un ciclo
 * mínimo disjunto (dos tangles independientes que sólo se tocan por una
 * arista de paso) — esta función devuelve UNO solo por SCC, el primero que
 * el orden determinista encuentra, no una descomposición exhaustiva en
 * "base de ciclos". Se declara así a propósito: enumerar todos los ciclos
 * simples de un grafo es EXPONENCIAL en el peor caso (no hay cota
 * polinómica conocida), y la alternativa acotada (pelar el ciclo mínimo,
 * quitar sus aristas, repetir) agrega una segunda pasada de Tarjan por
 * iteración sin evidencia medida de que el corpus la necesite — ver
 * "QUÉ NO CUBRISTE" en el informe de esta tarea. Lo que si se conserva es
 * la transparencia: `findDependencyCycles` agrega una evidencia con el
 * tamaño del componente ORIGINAL cuando es mayor al ciclo reportado, así
 * que el panel nunca esconde que el archivo pertenece a un tangle mayor —
 * sólo dirige la acción al núcleo mínimo, no al tangle entero.
 */
function shortestCycleInComponent(comp: readonly number[], out: readonly (readonly number[])[]): number[] {
  const inComp = new Set(comp);
  let best: number[] | null = null;

  for (const s of comp) {
    const prev = new Map<number, number>();
    const visited = new Set<number>([s]);
    const queue: number[] = [];
    for (const w of out[s]!) {
      if (!inComp.has(w) || w === s || visited.has(w)) continue;
      visited.add(w);
      prev.set(w, s);
      queue.push(w);
    }

    let closingNode: number | null = null;
    for (let qi = 0; qi < queue.length && closingNode === null; qi++) {
      const v = queue[qi]!;
      for (const w of out[v]!) {
        if (!inComp.has(w)) continue;
        if (w === s) {
          closingNode = v;
          break;
        }
        if (!visited.has(w)) {
          visited.add(w);
          prev.set(w, v);
          queue.push(w);
        }
      }
    }
    if (closingNode === null) continue; // no debería pasar dentro de un SCC ya confirmado; defensivo

    const reversed: number[] = [];
    for (let cur: number | undefined = closingNode; cur !== undefined && cur !== s; cur = prev.get(cur)) reversed.push(cur);
    reversed.reverse();
    const path = [s, ...reversed];

    if (best === null || path.length < best.length) best = path;
    if (best.length <= 2) break; // no hay self-loops (buildFileGraph los excluye): 2 es el mínimo posible.
  }

  // Inalcanzable en la práctica: `comp` ya viene de `tarjanSCC` con tamaño
  // >= 2, así que por definición de componente fuertemente conexo TODO nodo
  // tiene un camino de vuelta a sí mismo dentro del propio componente. Se
  // devuelve el componente entero como último recurso, nunca `[]`, para que
  // el llamador nunca reciba un ciclo vacío.
  return best ?? [...comp];
}

/**
 * Severidad: crece con el tamaño del ciclo (magnitud del `trigger`). Ya no
 * recibe `crossesFolderBoundary`: desde la redefinición de esta ola (ver el
 * docstring del módulo) TODO hallazgo emitido cruza carpeta por construcción
 * — `findDependencyCycles` descarta los que no antes de llegar acá — así que
 * el término que antes restaba 10 por vivir en la misma carpeta quedaría
 * SIEMPRE en la rama que suma, código inalcanzable disfrazado de rama viva.
 * Se deja plegado en la constante de base. Si la mayoría de las aristas
 * entre los miembros del ciclo son de baja confianza (`inferred` o
 * `resolved/global-uniqueness` "bare" — ver "GLOBAL-UNIQUENESS DESNUDO" en
 * el docstring del módulo), la severidad se ACOTA (no sólo se resta) a un
 * techo bajo — ver "TECHO DE SEVERIDAD POR PROVENANCE" (criterio unificado
 * P5, con su límite medido documentado ahí).
 */
function severityOf(size: number, lowConfidenceRatio: number): number {
  const base = 30 + size * 7 + 10; // +10: todo hallazgo emitido cruza carpeta (ver arriba).
  const capped = Math.max(15, Math.min(100, base));
  return lowConfidenceRatio > MAJORITY_LOW_CONFIDENCE_RATIO ? Math.min(capped, LOW_CONFIDENCE_SEVERITY_CEILING) : capped;
}

/** Único lugar que arma los `RawFinding[]` — separado de `detector.run` para
 *  poder testear la lógica sin pasar por `RunContext`, mismo patrón que
 *  `buildDuplicationFindings` en el detector hermano. */
export function findDependencyCycles(repo: RepoUnit, minCycleSize: Threshold): readonly RawFinding[] {
  const graph = repo.graph;
  if (!graph) return [];

  const { files, out, edgeCountBetween } = buildFileGraph(graph.nodes, graph.edges);
  if (files.length === 0) return [];

  const components = tarjanSCC(files.length, out);
  const provenanceByPair = computeLowConfidenceRatioByPair(graph.nodes, graph.edges);
  const findings: RawFinding[] = [];

  for (const comp of components) {
    if (comp.length < minCycleSize.value) continue;
    // EL CICLO MÍNIMO, NO EL SCC ENTERO (ver el docstring de
    // `shortestCycleInComponent` arriba): el hallazgo es el ciclo más corto
    // DENTRO del componente, no el componente completo — `comp` sigue
    // sirviendo como universo de búsqueda (ningún ciclo puede salir de él)
    // y como el tamaño original que `originalComponentSize` reporta abajo
    // cuando es mayor al ciclo extraído.
    const cycleIndices = shortestCycleInComponent(comp, out);
    if (cycleIndices.length < minCycleSize.value) continue; // defensivo, ver el docstring
    const members = cycleIndices.map((i) => files[i]!).sort();
    const originalComponentSize = comp.length;
    const folders = new Set(members.map(immediateFolderOf));
    const crossesFolderBoundary = folders.size > 1;
    // REDEFINICIÓN (ver el docstring del módulo, "REDEFINICIÓN"): un SCC que
    // vive entero dentro de UNA carpeta ya no se reporta. Medido: de 17
    // hallazgos juzgados a mano antes de este cambio, el ÚNICO verdadero
    // cruzaba carpeta y el 100% de los que NO cruzaban (pares de clases
    // utilitarias hermanas, fixtures de prueba de `forwardRef`, componente +
    // demo) eran falsos. `continue`, no una resta de severidad — antes de
    // esta ola SÍ se emitía con severidad más baja, lo que sigue contando
    // como ruido para quien lee el panel y para la precisión medida.
    if (!crossesFolderBoundary) continue;
    // NAMESPACING, NO CICLO (ver "NAMESPACING, NO CICLO" en el docstring de
    // `isNamespaceHubCycle` arriba): un archivo y su propio subdirectorio
    // homónimo SIEMPRE cruzan carpeta inmediata, así que este `continue` es
    // un filtro DISTINTO del de arriba, no redundante con él.
    if (isNamespaceHubCycle(members)) continue;
    const size = members.length;

    let edgesWithinCycle = 0;
    let totalAnyProvenance = 0;
    let lowConfidenceWithinCycle = 0;
    for (let a = 0; a < members.length; a++) {
      for (let b = a + 1; b < members.length; b++) {
        edgesWithinCycle += edgeCountBetween.get(pairKey(members[a]!, members[b]!)) ?? 0;
        const pc = provenanceByPair.get(pairKey(members[a]!, members[b]!));
        if (pc) {
          totalAnyProvenance += pc.total;
          lowConfidenceWithinCycle += pc.lowConfidence;
        }
      }
    }
    const lowConfidenceRatio = totalAnyProvenance === 0 ? 0 : lowConfidenceWithinCycle / totalAnyProvenance;
    const lowConfidence = lowConfidenceRatio > MAJORITY_LOW_CONFIDENCE_RATIO;

    const title =
      size === 2
        ? `"${fileName(members[0]!)}" y "${fileName(members[1]!)}" dependen mutuamente`
        : `Ciclo de dependencia entre ${size} archivos`;
    // EL CICLO MÍNIMO, NO EL SCC ENTERO: cuando el ciclo extraído es más
    // chico que el componente conexo del que salió, se lo dice — nunca se
    // esconde el tangle mayor, sólo se deja de reportarlo COMO el hallazgo
    // (ver el docstring de `shortestCycleInComponent`).
    const partOfLargerTangle = originalComponentSize > size;

    const roleLocations: RoleLocation[] = members.map((file, i) => ({
      file,
      startLine: 1,
      endLine: repo.files.find((f) => f.path === file)?.lines ?? 1,
      role: i === 0 ? "primer miembro del ciclo" : `miembro #${i + 1} del ciclo`,
    }));
    const [firstLocation, ...restLocations] = roleLocations;
    if (!firstLocation) continue; // inalcanzable (size >= minCycleSize.value >= 1), sólo para que TS vea la tupla no vacía

    findings.push({
      title,
      detail:
        "Ninguno de estos archivos se puede leer, cambiar o probar de forma aislada: un cambio en cualquiera " +
        "de ellos obliga a considerar el resto del grupo. " +
        "El ciclo cruza más de una carpeta: es más compatible con una dependencia arquitectónica accidental " +
        "que con un diseño a propósito." +
        (partOfLargerTangle
          ? ` Este es el ciclo MÍNIMO — el más corto posible — dentro de un grupo mayor de ${originalComponentSize} ` +
            "archivos interconectados entre sí; el resto del grupo no forma parte de ningún camino de vuelta " +
            "corto y no se lista acá porque no es lo que hay que romper."
          : "") +
        (lowConfidence
          ? ` Confianza reducida: ${Math.round(lowConfidenceRatio * 100)}% de las aristas de dependencia entre los ` +
            "miembros de este ciclo (cualquier sentido) son de baja confianza — etapa heurística de resolución " +
            "(path-proximity, provenance 'inferred', no validada contra un dataset etiquetado fuera de Ruby) o " +
            "coincidencia de nombre sin ningún receptor/calificador o rol sintáctico (resolved/global-uniqueness " +
            "sobre una referencia desnuda, o una referencia sin ningún rol registrado) — la severidad se acota " +
            "en consecuencia."
          : ""),
      trigger: [{ label: "archivos en el ciclo", value: size, threshold: minCycleSize }],
      evidence: [
        { label: "carpetas distintas involucradas", value: folders.size },
        { label: "aristas de dependencia entre miembros (declared/resolved)", value: edgesWithinCycle },
        { label: "% de las aristas entre miembros de baja confianza (inferred, global-uniqueness desnudo o sin rol)", value: Math.round(lowConfidenceRatio * 100) },
        ...(partOfLargerTangle ? [{ label: "archivos en el componente conexo mayor del que se extrajo este ciclo mínimo", value: originalComponentSize }] : []),
      ],
      locations: [firstLocation, ...restLocations],
      severity: severityOf(size, lowConfidenceRatio),
      advice: {
        primary: {
          name: "Change Bidirectional Association to Unidirectional",
          kind: "refactorizacion",
          why:
            "Elegir cuál de las dos direcciones de dependencia es prescindible y eliminarla es el primer paso " +
            "mecánico para romper el ciclo, sin decidir todavía ningún rediseño de arquitectura.",
          source: "https://refactoring.guru/es/change-bidirectional-association-to-unidirectional",
        },
      },
    });
  }

  return findings;
}

export const detector: InterFileDetector<ThresholdKey, "dependency-cycle"> = {
  id: "dependency-cycle",
  kind: "dependency-cycle",
  scope: "inter-file",
  needsGraph: true,
  title: "Ciclo de dependencia",
  needs: [],
  // OLA A3: `isConfidentDependencyEdge` acepta "todo kind salvo contains" —
  // unión genérica, no un vocabulario cerrado (ver "SIMPLIFICACIONES
  // DECLARADAS" arriba). Se declara sólo `references`, el kind que en la
  // práctica sostiene esa unión — ver `types.ts#needsEdges`, "unión genérica".
  needsEdges: ["references"],
  thresholds: {
    minCycleSize: MIN_CYCLE_SIZE_SPEC,
  },
  maxFindings: MAX_FINDINGS_SPEC,
  run(repo: RepoUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    return findDependencyCycles(repo, ctx.threshold("minCycleSize"));
  },
};
