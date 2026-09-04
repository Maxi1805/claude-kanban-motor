/**
 * `feature-envy-inter` — Envidia de las características entre unidades /
 * Feature Envy inter-archivo (PLAN.md §4.1 "Feature envy | archivo | ATFD+LAA";
 * versión `inter-file` de `feature-envy-intra.ts`).
 *
 * RELACIÓN (sin jerga de AST): un ARCHIVO cuyas referencias resueltas hacia
 * símbolos de OTROS archivos, concentradas en UN SOLO archivo externo,
 * superan a sus propias referencias hacia símbolos DE SÍ MISMO — el mismo
 * criterio ATFD/LAA de Lanza & Marinescu que usa `feature-envy-intra.ts`
 * (ATFD > FEW = 2, LAA < ONE_THIRD = 1/3), pero medido con el GRAFO YA
 * RESUELTO (`RepoUnit.graph`, aristas `references`) en vez de un heurístico
 * de AST, y a granularidad de ARCHIVO en vez de MÉTODO.
 *
 * NO DUPLICA `feature-envy-intra` — ESTRUCTURALMENTE, no por casualidad:
 *   - `feature-envy-intra` sólo mira DENTRO de un archivo (recorre el AST de
 *     una función, clasifica cada acceso a miembro como propio/foráneo por
 *     `this`/`self` vs. identificador plano) y NUNCA sabe en qué archivo vive
 *     el objeto foráneo — no tiene acceso al grafo. Un caso donde el objeto
 *     "foráneo" resulta estar declarado en el MISMO archivo (dos clases en un
 *     solo `.ts`) dispara `feature-envy-intra` y JAMÁS a este detector, porque
 *     acá "propio" (`ownEvents`) es exactamente "referencia a un símbolo del
 *     MISMO archivo" — mismo criterio que ya usa el detector hermano
 *     `orphan-file.ts` para "conexión intra-archivo no cuenta". Ver el test
 *     "no duplica…": un grafo con SÓLO aristas intra-archivo nunca produce un
 *     hallazgo acá, sea cual sea su ATFD/LAA.
 *   - Este detector, al revés, NUNCA ve el cuerpo de una función: no sabe si
 *     el acceso fue `this.foo`, `foo()` a secas o una llamada completamente
 *     indirecta — sólo ve que el símbolo A (donde sea que esté declarado)
 *     referencia al símbolo B, resuelto por la cascada de `graph/resolve.ts`.
 *     Un archivo con una única función suelta (sin clase contenedora, que
 *     `feature-envy-intra` DESCARTA explícitamente por `className === null`)
 *     que llama mayormente a funciones de otro archivo SÍ puede disparar
 *     acá — cobertura que `feature-envy-intra` no tiene en absoluto.
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: el criterio es un conteo de aristas
 * `references` del grafo agrupadas por `(archivo origen, archivo destino)` —
 * cero vocabulario de dominio, cero nombre de nodo de una gramática concreta.
 *
 * SIMPLIFICACIONES DECLARADAS:
 *   - Igual que `feature-envy-intra`, se reutilizan los valores NUMÉRICOS
 *     publicados por Lanza & Marinescu para ATFD (FEW=2) y LAA (ONE_THIRD=
 *     1/3), pero aplicados a una granularidad (archivo, no método) y una
 *     fuente de evidencia (arista de grafo resuelta, no acceso AST) que esa
 *     publicación NO define — es una generalización DECLARADA del mismo
 *     criterio, no una cita nueva de la literatura para "archivo".
 *   - `dominance` (concentración del tráfico foráneo en UN solo archivo
 *     externo) es un umbral PROPIO de este detector, `pisoDeclarado` — Lanza
 *     & Marinescu no lo necesitan porque su unidad (un objeto foráneo) ya es
 *     singular por definición; al subir la granularidad a archivo, un
 *     archivo puede depender de MUCHOS otros sin envidiar a NINGUNO en
 *     particular (el caso típico es un archivo "orquestador": un `cli.ts`,
 *     un `main.rb`, un índice que junta módulos — coordina muchas piezas por
 *     diseño y no debería marcarse). Sin `dominance`, este detector
 *     colapsaría en "archivo con muchas dependencias externas", que es un
 *     hallazgo distinto (y mucho más ruidoso) del que pide la tarea.
 *   - Conteo POR EVENTO (`edge.weight`, ocurrencias ya colapsadas por
 *     `graph/build.ts`), no por atributo lógico distinto — misma
 *     simplificación declarada que `feature-envy-intra` para LAA; ATFD sí
 *     cuenta símbolos DISTINTOS (`to` ids distintos) dentro del archivo
 *     dominante, igual que la intra.
 *   - Sólo se considera el archivo con MÁS tráfico foráneo como "proveedor
 *     dominante" candidato — si el tráfico foráneo está repartido sin que
 *     ninguno alcance `dominance`, no hay hallazgo (ver arriba).
 *
 * CON QUÉ SE CONFUNDE (patrón legítimo, no un smell):
 *   - **Visitor / Strategy / Adapter implementados en su PROPIO archivo**:
 *     un archivo cuyo único propósito es operar sobre el tipo definido en
 *     OTRO archivo (`RenderVisitor.ts` que opera casi enteramente sobre
 *     `Node` de `ast.ts`; un `Comparator`/`Adapter` dedicado a un tipo
 *     ajeno) tiene, por diseño, casi todas sus referencias apuntando a ESE
 *     archivo y casi ninguna a sí mismo — exactamente la firma que este
 *     detector busca. Es la misma confusión que ya documenta
 *     `feature-envy-intra.ts` para el caso método/objeto, generalizada a
 *     archivo/módulo.
 *   - **Archivos de test**: `foo.test.ts` referencia, por construcción,
 *     muchos más símbolos de `foo.ts` (lo que prueba) que símbolos propios
 *     (variables auxiliares locales del propio test) — es la forma correcta
 *     de un test, no código mal ubicado. Verificado a mano contra el corpus
 *     (ver el resultado de la tarea): es la explicación de más de uno de los
 *     hallazgos manuales revisados.
 *   - **HERENCIA ENTRE ARCHIVOS — ARREGLADO en esta ronda (frente de precisión,
 *     agosto 2026)**: encontrado en la verificación manual, no anticipado al
 *     escribir la primera versión de este docstring. Una subclase que hereda
 *     de una clase base declarada en OTRO archivo (p.ej. `newtonsoft-json`'s
 *     `JsonTextWriterAsyncTests : TestFixtureBase`, verificado a mano) y usa
 *     mucho de lo heredado (helpers/asserts de la base) referencia,
 *     estructuralmente, muchos símbolos "ajenos" del archivo de la base —
 *     exactamente la firma que busca este detector, aunque usar lo que la
 *     propia superclase expone es OOP normal, no envidia. ARREGLADO
 *     consultando las aristas `extends`/`implements` DEL MISMO grafo que ya
 *     recibe este detector (no hace falta cruzar nada nuevo): si CUALQUIER
 *     símbolo de `file` extiende o implementa CUALQUIER símbolo de
 *     `dominantFile`, el hallazgo no dispara — ver `inheritsFrom` más abajo.
 *     Grano de archivo, no de símbolo puntual (mismo grano que el resto de
 *     este detector): un archivo con VARIAS clases donde sólo UNA hereda de
 *     `dominantFile` deja de dispararse igual, aceptado por la misma razón
 *     que `dominance`/`maxUbiquitousFanInRatio` ya aceptan imprecisión de
 *     grano por archivo — sesgo hacia el falso negativo, no el falso
 *     positivo.
 *   - **Adaptador/envoltorio delgado de un único módulo**: un archivo cuyo
 *     único propósito es envolver o describir OTRO (un componente Vue que
 *     envuelve un composable — verificado a mano en `vueuse`'s
 *     `useClipboard/component.ts` sobre `useClipboard/index.ts` —, o un
 *     `.d.ts` que declara los tipos de su `.js` hermano — verificado a mano
 *     en `preact`'s `hooks/src/index.d.ts` sobre `hooks/src/index.js`) tiene,
 *     por diseño, casi todo su tráfico apuntando a ese único archivo.
 *   - **Archivo de tipos/interfaces puro o barril de re-exportación** que
 *     declara poco propio y reexpone mayormente símbolos de un único módulo
 *     interno: mismo patrón, legítimo por convención de organización.
 *
 * BUG AJENO CONFIRMADO, REPORTADO, NO TOCADO (regla 6 — `graph/resolve.ts`,
 * no es mío): verificación manual en `guava` encontró un PAR de hallazgos
 * mutuos y sospechosamente simétricos —
 * `android/guava/.../AbstractFutureState.java` "envidiando" a
 * `guava/.../AbstractFutureState.java` Y VICEVERSA (mismo patrón repetido con
 * `CacheBuilderSpec.java`, `MediaType.java`). Guava mantiene DOS árboles de
 * fuente PARALELOS con el mismo paquete y el mismo nombre de clase
 * (`android/guava/` para el subconjunto de Android, `guava/` para JRE
 * completo — confirmado con `diff`: son variantes del MISMO tipo, nunca
 * compilados juntos, sin ningún `import` real entre ambos árboles). Que
 * `graph/resolve.ts` produzca una arista `references` con provenance
 * `resolved` ENTRE esos dos archivos es un artefacto de resolución: dos
 * símbolos HOMÓNIMOS en dos raíces de fuente distintas parecen estar
 * colisionando en la búsqueda por `(scope, name)` sin que el árbol de origen
 * desambigüe — el mismo tipo de colisión que `unused-symbol.ts` ya documenta
 * para hermanos homónimos DENTRO de un archivo (`@n`), acá entre dos ARCHIVOS
 * distintos que nunca deberían verse el uno al otro. Efecto sobre ESTE
 * detector: los dos hallazgos de este par son FALSOS POSITIVOS de origen
 * ajeno, no un defecto de la lógica de acá — no hay forma de filtrarlo sin
 * tocar `graph/resolve.ts` (fuera de alcance). Ver el resultado de la tarea
 * para el repro completo.
 *
 * OJO CON JAVA — MEDIDO en Ola 3/4, no supuesto: la etapa heurística
 * `path-proximity` (`provenance: "inferred"`) resuelve el 81% de las aristas
 * `references` ACEPTADAS en guava, y el dataset etiquetado a mano que valida
 * la cascada de resolución es sólo Ruby. Para ESTE detector, una arista
 * `inferred` sería EVIDENCIA POSITIVA directa del hallazgo (cuenta a favor
 * de "A depende de B") — la regla general (CONTRATO-F5.md §4.4): si
 * `inferred` es evidencia positiva, se EXCLUYE (lo conservador es no
 * afirmar), mismo criterio que `dependency-cycle.ts` y a propósito lo
 * opuesto de `orphan-file.ts`/`unused-symbol.ts` (donde `inferred` sólo
 * puede DESCARTAR un candidato, así que ahí se incluye). Este detector
 * cuenta ÚNICAMENTE aristas `declared`/`resolved` — ver `TRUSTED_PROVENANCE`
 * abajo — así que en Java, con la mayoría de sus aristas excluidas, el
 * volumen esperado de hallazgos es BAJO, no alto: no hay compensación
 * adicional de severidad porque la exclusión ya es la medida conservadora;
 * lo que sí se pierde es COBERTURA (falsos negativos posibles), no precisión.
 *
 * TRES JUICIOS DE PRECISIÓN NUEVOS (frente P9, Ola P) — verificación manual
 * contra el corpus (13 repos) encontró que la mayoría de lo que sigue vivo
 * cae en tres formas, ninguna de las tres envidia real. Los tres se cablean
 * con hechos que YA estaban en el grafo (`CodeGraphNode.family`,
 * `symbolPath`) — nada de esto toca `graph/*`, sólo lee más de lo que ya
 * recibe este detector. Medido con `scripts/p9-probe-barrel.mts` sobre
 * `corpus/sqlalchemy` antes de escribir el código, no supuesto.
 *
 * (1) SIN LÓGICA PROPIA QUE MOVER (`filesWithOwnOperationalSymbols`). Un
 * archivo de RE-EXPORT puro (`lib/sqlalchemy/pool/__init__.py`: `from .base
 * import Pool as Pool`, …) declara CERO símbolos `function-like`/`class-like`
 * propios — medido: 0 nodos `symbol` en absoluto, y las 21 aristas
 * `references` que emite salen todas del nodo DE ARCHIVO (`from:
 * file:lib/sqlalchemy/pool/__init__.py`), nunca de un símbolo suyo. Un
 * archivo de puro dato (`lib/sqlalchemy/dialects/mysql/__init__.py`: 3
 * símbolos propios, los tres `family: "other"` — alias de módulo, no
 * función/clase) da el mismo resultado por la misma razón: "Move Method"
 * mueve UN MÉTODO, y un archivo sin un solo método/clase propio no tiene qué
 * mover — el LAA bajo que dispara el hallazgo es un artefacto de que el
 * archivo es, por diseño, casi puro tráfico hacia afuera (barril, shim de
 * re-export, módulo de sólo-constantes), no evidencia de una responsabilidad
 * mal ubicada. Coincide con `eslint/docs/src/_data/flags.js` (re-exporta
 * `lib/shared/flags.js`) y `preact/compat/server.mjs` (shim ESM de puro
 * re-export) de la muestra juzgada a mano.
 *
 * (2) TODO LO REFERENCIADO ES DATO, NO COMPORTAMIENTO (`isDataOnlyTraffic`).
 * `nest/packages/common/decorators/core/inject.decorator.ts` SÍ tiene lógica
 * propia (declara `export function Inject(...)`) pero sus 3 referencias al
 * archivo dominante apuntan a `PARAMTYPES_METADATA`/`PROPERTY_DEPS_METADATA`/
 * `SELF_DECLARED_DEPS_METADATA` — verificado en
 * `nest/packages/common/constants.ts`: los tres son `export const … = '…'`,
 * `family: "other"` en el grafo, nunca `function-like`. Leer una constante
 * compartida no es Feature Envy: no hay ningún MÉTODO que "Move Method"
 * pueda reubicar, sólo una lectura de dato — la misma razón por la que
 * `guava`'s `ListListIteratorTester` referenciando el enum `IteratorFeature`
 * y `rubocop`'s `VariableForce::Reference` (clase anidada, ver abajo)
 * referenciando las constantes `SCREAMING_CASE` del módulo que la contiene
 * (`VARIABLE_REFERENCE_TYPE`, `SEND_TYPE`, …, verificado leyendo
 * `lib/rubocop/cop/variable_force/reference.rb`) fueron juzgados falsos. El
 * filtro exige evidencia POSITIVA (`family` explícito en TODOS los destinos
 * distintos, ninguno ausente) antes de excluir — si algún destino no tiene
 * `family` conocido, el hallazgo se conserva (sesgo hacia el falso negativo,
 * mismo criterio que el resto de este detector).
 *
 * (3) ARCHIVO ESPEJO (`isMirrorFile`). BUG AJENO documentado más arriba
 * ("PAR de hallazgos mutuos y sospechosamente simétricos" en `guava`) —
 * resulta que SÍ se puede filtrar desde acá, sin tocar `graph/resolve.ts`:
 * `android/guava/.../AbstractFutureState.java` y
 * `guava/.../AbstractFutureState.java` declaran, cada uno, la MISMA clase
 * `AbstractFutureState` con casi el mismo conjunto de miembros — medido por
 * `diff` de las firmas de método antes de escribir el código: 46 vs. 52
 * nombres, 44 en común (96 % del archivo más chico, 85 % del más grande). La
 * arista `references` `resolved` entre los dos es un artefacto de colisión
 * de nombre entre dos raíces de fuente que nunca se compilan juntas, no un
 * acoplamiento real. El mismo mecanismo, más chico, explica un caso análogo
 * de `orphan-file.ts` (`common/hugo/vars_regular.go`/`vars_extended.go`, dos
 * variantes de build tag que declaran la MISMA `var IsExtended` — ver ese
 * módulo). Comparando el conjunto de nombres CALIFICADOS (`symbolPath.join
 * (".")`, así que "AbstractFutureState.foo" identifica el MISMO método en
 * las dos copias sin colisionar con un "foo" de otra clase) de `file` contra
 * `dominantFile`: `ratioMin` (intersección / el más chico de los dos
 * conjuntos) captura "casi todo mi archivo tiene un gemelo ahí", `ratioMax`
 * (intersección / el más grande) evita que dos archivos GRANDES y NO
 * relacionados que comparten un puñado de nombres comunes (`close`,
 * `toString`, …) se lean como espejos: con `ratioMin >= 0.5` solo, un
 * archivo de 4 métodos que comparte 2 nombres genéricos con un archivo de 40
 * pasaría (2/4 = 50 %); exigir TAMBIÉN `ratioMax >= 0.3` lo rechaza (2/40 =
 * 5 %) mientras sigue aceptando tanto el caso `guava` (0,96 / 0,85) como el
 * caso `hugo` (1,0 / 1,0, un único nombre en cada lado). Los dos pisos son
 * `pisoDeclarado`: no hay cita externa para "cuánto overlap hace a dos
 * archivos gemelos", el corpus no da más que estos dos casos positivos con
 * los que calibrar.
 *
 * MISMO DIRECTORIO — LA PREGUNTA CORRECTA (OLA R, FRENTE R4, triaje
 * heredado de ola-q/informes/INTEGRADOR.md §2.1): la RELACIÓN de este
 * detector seguía siendo "¿el archivo A referencia más símbolos de B que de
 * sí mismo?", con B un archivo cualquiera del repo. La pregunta correcta es
 * "¿…más símbolos de un archivo FUERA DE SU PROPIO DIRECTORIO que de sí
 * mismo?" — la generalización de lo que Go ya fuerza estructuralmente (el
 * PAQUETE, no el archivo, es la unidad de encapsulamiento: dos archivos del
 * mismo paquete se referencian entre sí como si fueran uno) a cualquier
 * lenguaje donde una carpeta agrupa un módulo por convención de
 * organización (varias vistas de un componente, un archivo y su demo, un
 * módulo partido en implementación + resolver). Un archivo que envidia a su
 * propio vecino de carpeta no está mal ubicado: ya está donde vive el resto
 * de su módulo.
 *
 * MEDIDO por este frente, reproduciendo el triaje de ola-q antes de escribir
 * el código (no aceptado de su informe): **20 de 36 hallazgos del corpus
 * (55,6 %) son mismo-directorio** — `parser/pageparser/pagelexer_intro.go`
 * envidiando a `parser/pageparser/pagelexer.go` en hugo (`tpl/tplimpl`,
 * `hugolib`, `commands`, `internal/warpc` dan cuatro casos más del mismo
 * repo), `usePointer/component.ts` a `usePointer/index.ts` en vueuse (5
 * pares component/index o index/demo del mismo directorio), `Bson*.cs` en
 * newtonsoft-json, `config_loader_resolver.rb`↔`config_loader.rb` en
 * rubocop, `processors.py`↔`_processors_cy.py` en sqlalchemy. Ninguno de los
 * tres JUICIOS DE PRECISIÓN de arriba los cubre — no son re-export puro
 * (tienen lógica propia), no son sólo dato (referencian funciones), no son
 * gemelos de nombre (declaran cosas DISTINTAS, sólo viven juntos). Cero
 * aristas nuevas: `path.dirname` sobre las dos rutas que el detector ya
 * tiene — ver `dirnameOf`.
 *
 * NOTA DE PROCESO — infraestructura de Contrato 4 NO aterrizada todavía
 * (verificado por grep antes de escribir este archivo: cero referencias a
 * `needsEdges`/`needsMetrics`/`minProvenance`/`RepoUnit.metrics`/
 * `trustedEdge`/`provenanceMix` fuera de `graph/metrics/**`): este detector
 * NO puede declarar `needsEdges: ["references"]` (el campo no existe en
 * `InterFileDetector` hoy) ni consultar `repo.metrics` (no existe en
 * `RepoUnit`). Ambas cosas están fuera de mi alcance (archivos compartidos
 * `detect/types.ts`/`detect/run.ts`, tarea de otro agente — P3/P4 de
 * CONTRATO-F5.md §5.2). Efecto práctico: si un repo no tuviera NINGUNA
 * arista `references` "confiable" (`declared`/`resolved`), este detector
 * hoy reporta `corrio, 0 hallazgos` en vez del `sin-aristas` más honesto que
 * pide la tarea — el propio `run()` de acá ya filtra ese caso devolviendo
 * `[]` de forma defensiva, pero la DISTINCIÓN de cobertura ("no aplicable
 * por falta de arista" vs. "corrió y no encontró nada") sólo la puede pintar
 * el runner una vez que Contrato 4 aterrice. No recomputo ninguna de las 6
 * métricas de `graph/metrics/registry.ts` (scc/componentes/pagerank/
 * instability/agrupamiento/comunidades): el conteo de aristas `references`
 * por par de archivos es el mismo primitivo crudo que ya leen directo del
 * grafo `orphan-file.ts`/`unused-symbol.ts`, no una de esas 6 métricas.
 */
import { citado, pisoDeclarado, presupuesto } from "../thresholds.js";
import type { Threshold } from "../thresholds.js";
import type {
  CodeGraph,
  CodeGraphNode,
  Provenance,
} from "../../graph/types.js";
import type {
  FileSummary,
  InterFileDetector,
  RawFinding,
  RepoUnit,
  RunContext,
} from "../types.js";

type ThresholdKey =
  | "atfd"
  | "laa"
  | "dominance"
  | "maxUbiquitousFanInRatio"
  | "mirrorRatioMin"
  | "mirrorRatioMax";

const ATFD_SPEC = citado(2, {
  work: "Lanza & Marinescu, Object-Oriented Metrics in Practice",
  rule: "Feature Envy — ATFD (Access To Foreign Data), FEW. Generalizado acá de método a archivo — ver docstring del módulo.",
});

const LAA_SPEC = citado(1 / 3, {
  work: "Lanza & Marinescu, Object-Oriented Metrics in Practice",
  rule: "Feature Envy — LAA (Locality of Attribute Access), ONE_THIRD. Generalizado acá de método a archivo — ver docstring del módulo.",
});

/** Umbral PROPIO (no de Lanza & Marinescu, ver docstring): qué proporción del
 *  tráfico foráneo TOTAL tiene que concentrarse en un único archivo externo
 *  para hablar de "envidia hacia ESE archivo" en vez de "muchas dependencias
 *  externas repartidas" (el caso normal de un orquestador). */
const DOMINANCE_SPEC = pisoDeclarado(0.5, {
  rationale:
    "mayoría simple (>=50%) del tráfico foráneo concentrado en UN solo archivo externo — sin esto, un archivo " +
    "orquestador que reparte referencias entre muchos módulos (normal, no un smell) calificaría igual que uno " +
    "genuinamente acoplado a un único proveedor.",
});

/**
 * JUICIO DE PRECISIÓN (frente de nivel 1, agosto 2026) — MISMO umbral y
 * MISMA medición que `coupling-without-abstraction.ts
 * #MAX_UBIQUITOUS_FAN_IN_RATIO_SPEC` (ver su docstring para la tabla
 * completa): un módulo de tipos/gramática/completado compartido por TODO el
 * repo (`detect/types.ts` en `src/`, `completions.go` en `cobra`, `core.py`
 * en `click`) apareció como "archivo dominante" en la ENORME mayoría de los
 * hallazgos muestreados de las cuatro poblaciones — no por envidia real,
 * sino porque cualquier archivo chico referencia, en términos absolutos,
 * más símbolos del módulo compartido que de sí mismo. Confirmado a mano:
 * `detect/types.ts` es fan-in global de decenas de archivos en `src/`;
 * `completions.go` lo es de los cuatro generadores de shell de `cobra`
 * (`bash`/`zsh`/`fish`/`powershell_completions.go`); `core.py`/
 * `shell_completion.py` lo son de los scripts `examples/*.py` de `click`
 * (código CLIENTE de la librería, no un wrapper de un solo tipo — usar la
 * API pública de un framework extensamente no es Feature Envy). Igual que
 * en el detector hermano, `dominance` no alcanza para filtrar esto: el
 * módulo compartido YA es, trivialmente, "el proveedor dominante" de casi
 * cualquier archivo chico, así que el chequeo de concentración pasa sin
 * decir nada sobre si ese proveedor es una infraestructura ubicua.
 */
const MAX_UBIQUITOUS_FAN_IN_RATIO_SPEC = pisoDeclarado(0.1, {
  rationale:
    "mismo piso, mismo concepto y misma medición que `coupling-without-abstraction.ts#MAX_UBIQUITOUS_FAN_IN_RATIO_SPEC`: " +
    "un archivo del que depende (como proveedor dominante) más de un 10% de los archivos del repo se comporta " +
    "como infraestructura compartida (tipos, gramática, núcleo de un framework) y no como el destino de una " +
    "envidia real hacia una unidad puntual.",
});

/** Sólo aristas `declared`/`resolved` cuentan — ver "OJO CON JAVA" arriba. */
const TRUSTED_PROVENANCE: ReadonlySet<Provenance> = new Set([
  "declared",
  "resolved",
]);

/** Ver "(1) SIN LÓGICA PROPIA QUE MOVER" en el docstring del módulo: sólo estas dos familias son algo que "Move Method" puede reubicar. */
const OPERATIONAL_FAMILIES: ReadonlySet<string> = new Set([
  "function-like",
  "class-like",
]);

/** Ver "(3) ARCHIVO ESPEJO". Calibrado a mano contra los dos únicos casos positivos medidos en el corpus (`guava`, `hugo`) — no hay cita externa para "cuánto overlap hace a dos archivos gemelos". */
const MIRROR_RATIO_MIN_SPEC = pisoDeclarado(0.5, {
  rationale:
    "intersección / el más chico de los dos conjuntos de nombres calificados declarados: mayoría del archivo más " +
    "chico tiene un gemelo de nombre idéntico en el otro archivo — medido en guava (0,96) y hugo (1,0).",
});
const MIRROR_RATIO_MAX_SPEC = pisoDeclarado(0.3, {
  rationale:
    "intersección / el más grande de los dos conjuntos: sin este segundo piso, dos archivos grandes y no " +
    "relacionados que comparten un puñado de nombres comunes (close, toString, …) pasarían el piso de arriba; " +
    "medido en guava (0,85) y hugo (1,0), ambos muy por encima.",
});

const MAX_FINDINGS_SPEC = presupuesto(100, {
  rationale:
    "tope de volumen propio: un repo grande puede tener decenas de archivos con esta forma; el tope global de " +
    "`AnalyzeLimits` ya existe aguas abajo, esto es sólo una defensa propia (mismo orden de magnitud que el resto " +
    "de los detectores `inter-file` ya registrados).",
});

interface ForeignTally {
  events: number;
  distinct: Set<string>;
}

interface FileTally {
  ownEvents: number;
  foreignByFile: Map<string, ForeignTally>;
}

/** Todo id de nodo del grafo -> el archivo al que pertenece. */
function fileOfNode(graph: CodeGraph): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const n of graph.nodes) map.set(n.id, n.file);
  return map;
}

/**
 * Carpeta contenedora INMEDIATA de una ruta de archivo — mismo criterio y
 * misma implementación (por texto, sin tocar el filesystem) que
 * `unstable-dependency.ts#dirnameOf`: la ruta de un archivo del grafo ya
 * viene relativa a la raíz del repo, con `/` como separador siempre (nunca
 * `\`, ver el resto del catálogo). `""` para un archivo de la raíz del repo
 * (sin `/`).
 */
function dirnameOf(file: string): string {
  const slash = file.lastIndexOf("/");
  return slash === -1 ? "" : file.slice(0, slash);
}

/**
 * JUICIO DE PRECISIÓN — HERENCIA ENTRE ARCHIVOS (ver docstring del módulo):
 * archivo origen -> conjunto de archivos destino con los que existe AL
 * MENOS una arista `extends`/`implements` entre un símbolo de uno y un
 * símbolo del otro — sin filtrar por `provenance`, a diferencia de
 * `references` (`extends`/`implements` no tienen la misma etapa heurística
 * `path-proximity` que motiva "OJO CON JAVA"; son declaradas por la propia
 * cláusula `extends`/`implements`/`: Base` del lenguaje, resueltas o no).
 * `Map<string, Set<string>>`, no una clave de texto concatenada: dos rutas
 * de archivo reales podrían colisionar contra cualquier separador que se
 * elija, así que anidar en vez de concatenar no tiene ese riesgo. Grano de
 * ARCHIVO, no de símbolo puntual — mismo grano que el resto de este
 * detector, ver "CON QUÉ SE CONFUNDE" en el docstring del módulo.
 */
function inheritsFrom(
  graph: CodeGraph,
): ReadonlyMap<string, ReadonlySet<string>> {
  const fileOf = fileOfNode(graph);
  const pairs = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (edge.kind !== "extends" && edge.kind !== "implements") continue;
    const fromFile = fileOf.get(edge.from);
    const toFile = fileOf.get(edge.to);
    if (fromFile === undefined || toFile === undefined || fromFile === toFile)
      continue;
    let targets = pairs.get(fromFile);
    if (!targets) {
      targets = new Set();
      pairs.set(fromFile, targets);
    }
    targets.add(toFile);
  }
  return pairs;
}

/**
 * JUICIO DE PRECISIÓN (1) — SIN LÓGICA PROPIA QUE MOVER: el conjunto de
 * archivos que declaran AL MENOS UN símbolo `function-like`/`class-like`
 * propio (`OPERATIONAL_FAMILIES`, ver docstring del módulo). Un archivo de
 * puro re-export o de puras constantes queda AFUERA de este conjunto — no
 * porque no tenga símbolos, sino porque ninguno de los que tiene es algo que
 * "Move Method" pueda reubicar.
 */
function filesWithOwnOperationalSymbols(graph: CodeGraph): ReadonlySet<string> {
  const files = new Set<string>();
  for (const n of graph.nodes) {
    if (n.kind !== "symbol" || !n.family) continue;
    if (OPERATIONAL_FAMILIES.has(n.family)) files.add(n.file);
  }
  return files;
}

/**
 * JUICIO DE PRECISIÓN (2) — TODO LO REFERENCIADO ES DATO, NO COMPORTAMIENTO:
 * ¿son TODOS los símbolos distintos referenciados en el archivo dominante
 * `family: "other"` (constantes, alias de módulo, campos — nunca función ni
 * clase)? Exige `family` conocido para los `distinct` — si algún destino no
 * trae el hecho (`family` ausente), no se afirma nada y el hallazgo se
 * conserva (sesgo hacia el falso negativo, ver docstring del módulo).
 */
function isDataOnlyTraffic(
  distinct: ReadonlySet<string>,
  nodeById: ReadonlyMap<string, CodeGraphNode>,
): boolean {
  if (distinct.size === 0) return false;
  for (const id of distinct) {
    const family = nodeById.get(id)?.family;
    if (family !== "other") return false;
  }
  return true;
}

/**
 * JUICIO DE PRECISIÓN (3) — ARCHIVO ESPEJO: por archivo, el conjunto de
 * nombres CALIFICADOS (`symbolPath.join(".")`, mismo criterio que
 * `symbolNodeId` en `graph/types.ts`) de sus símbolos propios. Sirve para
 * `isMirrorFile` de abajo — ver "(3)" en el docstring del módulo para el
 * caso real (`guava`'s `AbstractFutureState.java` duplicado en dos raíces de
 * fuente) y la calibración de los dos umbrales.
 *
 * BUG ENCONTRADO Y ARREGLADO POR EL GUARDIÁN (grupo detectores, Ola P):
 * `family === "namespace-like"` queda EXCLUIDO — mismo fix y misma
 * evidencia medida que `orphan-file.ts#qualifiedNamesByFile` (que comparte
 * este mecanismo, ver su docstring para el caso citado en `newtonsoft-json`).
 * Sin el filtro, dos archivos cualesquiera del mismo namespace/paquete
 * comparten ese nombre "gratis" y la proporción de espejo puede cruzar el
 * piso sin ningún nombre de CLASE en común.
 */
function qualifiedNamesByFile(
  graph: CodeGraph,
): ReadonlyMap<string, ReadonlySet<string>> {
  const byFile = new Map<string, Set<string>>();
  for (const n of graph.nodes) {
    if (n.kind !== "symbol" || n.symbolPath.length === 0) continue;
    if (n.family === "namespace-like") continue;
    const name = n.symbolPath.join(".");
    let names = byFile.get(n.file);
    if (!names) {
      names = new Set();
      byFile.set(n.file, names);
    }
    names.add(name);
  }
  return byFile;
}

/**
 * Ver "(3) ARCHIVO ESPEJO" en el docstring del módulo para la derivación de
 * los dos pisos.
 *
 * BUG ENCONTRADO Y ARREGLADO POR EL GUARDIÁN (grupo detectores, Ola P):
 * `languageA`/`languageB` — el espejo sólo cuenta dentro del MISMO lenguaje.
 * Mismo hallazgo y misma evidencia que `orphan-file.ts#hasMirrorFile` (ver
 * su docstring): `tests/fixtures/patterns/` reescribe cada caso a propósito
 * en varios lenguajes con los MISMOS nombres de clase/método — sin este
 * filtro, cualquier archivo dominante que coincidiera de nombre con un
 * hermano de OTRO lenguaje se leía como "copia", nunca como envidia. Un
 * archivo espejo real (el caso citado, `guava`'s `AbstractFutureState.java`
 * en dos raíces de fuente) es siempre mismo-lenguaje.
 */
function isMirrorFile(
  namesA: ReadonlySet<string> | undefined,
  namesB: ReadonlySet<string> | undefined,
  languageA: string | undefined,
  languageB: string | undefined,
  ratioMin: number,
  ratioMax: number,
): boolean {
  if (languageA !== undefined && languageA !== languageB) return false;
  if (!namesA || !namesB || namesA.size === 0 || namesB.size === 0)
    return false;
  const [small, big] =
    namesA.size <= namesB.size ? [namesA, namesB] : [namesB, namesA];
  let intersection = 0;
  for (const name of small) if (big.has(name)) intersection++;
  if (intersection === 0) return false;
  return (
    intersection / small.size >= ratioMin && intersection / big.size >= ratioMax
  );
}

/**
 * Una sola pasada por `graph.edges` (O(E), mismo costo que `orphan-file.ts`):
 * por archivo ORIGEN, cuántos eventos de referencia van hacia sí mismo
 * (`ownEvents`) y, por cada archivo destino DISTINTO, cuántos eventos y
 * cuántos símbolos distintos (ATFD) recibe. Sólo `references` con
 * provenance confiable — ver "OJO CON JAVA".
 */
function tallyReferencesByFile(
  graph: CodeGraph,
): ReadonlyMap<string, FileTally> {
  const fileOf = fileOfNode(graph);
  const tallies = new Map<string, FileTally>();

  for (const edge of graph.edges) {
    if (edge.kind !== "references") continue;
    if (!TRUSTED_PROVENANCE.has(edge.provenance)) continue; // ver docstring: inferred es evidencia positiva, se excluye

    const fromFile = fileOf.get(edge.from);
    const toFile = fileOf.get(edge.to);
    if (fromFile === undefined || toFile === undefined) continue;

    let tally = tallies.get(fromFile);
    if (!tally) {
      tally = { ownEvents: 0, foreignByFile: new Map() };
      tallies.set(fromFile, tally);
    }

    if (toFile === fromFile) {
      tally.ownEvents += edge.weight;
      continue;
    }

    let foreign = tally.foreignByFile.get(toFile);
    if (!foreign) {
      foreign = { events: 0, distinct: new Set() };
      tally.foreignByFile.set(toFile, foreign);
    }
    foreign.events += edge.weight;
    foreign.distinct.add(edge.to);
  }

  return tallies;
}

/** El archivo destino con más eventos foráneos, o `null` si no hay ninguno. */
function dominantForeignFile(
  foreignByFile: ReadonlyMap<string, ForeignTally>,
): [string, ForeignTally] | null {
  let best: [string, ForeignTally] | null = null;
  for (const entry of foreignByFile) {
    if (!best || entry[1].events > best[1].events) best = entry;
  }
  return best;
}

/**
 * Por archivo DESTINO, de cuántos archivos ORIGEN distintos recibe AL MENOS
 * una referencia foránea (fan-in global, la misma pregunta que
 * `coupling-without-abstraction.ts#dependedBy` — ver JUICIO DE PRECISIÓN en
 * el docstring del módulo). `dominance` (arriba) sólo mide si el tráfico
 * foráneo de UN archivo se concentra en un único proveedor, pero un módulo
 * de tipos/gramática compartido por TODO el repo (`detect/types.ts`,
 * `completions.go`, `core.py`) es trivialmente "el proveedor dominante" de
 * casi cualquier archivo chico — sin esto, ese módulo compartido se
 * confunde con envidia real hacia él.
 */
function globalReferenceFanIn(
  tallies: ReadonlyMap<string, FileTally>,
): ReadonlyMap<string, number> {
  const fanIn = new Map<string, number>();
  for (const tally of tallies.values()) {
    for (const destFile of tally.foreignByFile.keys()) {
      fanIn.set(destFile, (fanIn.get(destFile) ?? 0) + 1);
    }
  }
  return fanIn;
}

/**
 * Único lugar que arma los `RawFinding[]` — separado de `detector.run` para
 * poder testearlo sin pasar por `RunContext`, mismo patrón que
 * `buildOrphanFileFindings`/`findDependencyCycles`.
 */
export function buildFeatureEnvyInterFindings(
  files: readonly FileSummary[],
  graph: CodeGraph,
  atfd: Threshold,
  laa: Threshold,
  dominance: Threshold,
  maxUbiquitousFanInRatio: Threshold,
  mirrorRatioMin: Threshold,
  mirrorRatioMax: Threshold,
): RawFinding[] {
  const tallies = tallyReferencesByFile(graph);
  const languageByFile = new Map(files.map((f) => [f.path, f.language]));
  const linesByFile = new Map(files.map((f) => [f.path, f.lines]));
  const totalFiles = files.length;
  const fanIn = globalReferenceFanIn(tallies);
  const inheritance = inheritsFrom(graph);
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const operationalFiles = filesWithOwnOperationalSymbols(graph);
  const qualifiedNames = qualifiedNamesByFile(graph);
  const findings: RawFinding[] = [];

  for (const [file, tally] of tallies) {
    // JUICIO DE PRECISIÓN (1) — SIN LÓGICA PROPIA QUE MOVER: ver docstring
    // del módulo. Chequeo más barato primero, antes de tocar `foreignByFile`.
    if (!operationalFiles.has(file)) continue;

    const foreignEventsTotal = [...tally.foreignByFile.values()].reduce(
      (a, b) => a + b.events,
      0,
    );
    const total = tally.ownEvents + foreignEventsTotal;
    if (total === 0 || foreignEventsTotal === 0) continue; // nada foráneo que medir

    const dominant = dominantForeignFile(tally.foreignByFile);
    if (!dominant) continue;
    const [dominantFile, dominantTally] = dominant;

    // JUICIO DE PRECISIÓN — MISMO DIRECTORIO (OLA R, FRENTE R4): ver "LA
    // PREGUNTA CORRECTA" arriba en el docstring del módulo. Un archivo y su
    // proveedor dominante que viven en la MISMA carpeta son, generalizando lo
    // que Go ya fuerza a nivel de paquete, la MISMA unidad de encapsulamiento
    // — helpers/vistas/tests partidos en varios archivos de un mismo módulo
    // por convención de organización, no dos módulos distintos donde uno
    // envidia al otro. `dominance` no filtra esto (el tráfico sigue
    // concentrado en un único archivo, sea vecino o no) y ninguno de los tres
    // JUICIOS DE PRECISIÓN de arriba lo cubre (no son re-export puro, no son
    // sólo dato, no son gemelos de nombre). MEDIDO por este frente sobre el
    // corpus, reproduciendo el triaje de la ola pasada: **20 de 36 hallazgos
    // (56 %) son mismo-directorio** — `parser/pageparser/pagelexer_intro.go`
    // envidiando a `parser/pageparser/pagelexer.go` en hugo,
    // `usePointer/component.ts` a `usePointer/index.ts` en vueuse,
    // `config_loader_resolver.rb` a `config_loader.rb` en rubocop, los tres
    // en la MISMA carpeta que su "proveedor". Cero aristas nuevas: es
    // `path.dirname` sobre dos rutas que el detector ya tiene.
    //
    // LA RAÍZ DEL REPO NO CUENTA COMO "CARPETA COMÚN" (`dirnameOf === ""`
    // para los dos): a diferencia de una subcarpeta real, la raíz no agrupa
    // un módulo por convención — es donde caen los archivos de nivel
    // superior sin relación entre sí (puntos de entrada, configuración,
    // scripts sueltos). Tratar "los dos están en la raíz" como "mismo
    // módulo" apagaría el detector entero en cualquier repo chico o de
    // ejemplo con todo a nivel superior, sin ninguna evidencia de
    // organización deliberada. Verificado contra el corpus: ninguno de los
    // 20 casos mismo-directorio medidos es raíz-contra-raíz — la carpeta
    // compartida es siempre una subcarpeta real (`tpl/tplimpl`,
    // `usePointer`, `lib/rubocop`, …).
    if (dirnameOf(file) !== "" && dirnameOf(file) === dirnameOf(dominantFile)) continue;

    const dominanceRatio = dominantTally.events / foreignEventsTotal;
    const atfdValue = dominantTally.distinct.size;
    const laaValue = tally.ownEvents / total;

    if (!(
      atfdValue > atfd.value &&
      laaValue < laa.value &&
      dominanceRatio >= dominance.value
    ))
      continue;

    // JUICIO DE PRECISIÓN: ver docstring del módulo — el archivo dominante
    // es, él mismo, infraestructura compartida por buena parte del repo
    // (un módulo de tipos, la gramática, el núcleo de un framework), no la
    // unidad puntual que la envidia real señalaría.
    if (
      totalFiles > 0 &&
      (fanIn.get(dominantFile) ?? 0) / totalFiles >=
        maxUbiquitousFanInRatio.value
    )
      continue;

    // JUICIO DE PRECISIÓN — HERENCIA ENTRE ARCHIVOS: ver docstring del
    // módulo — si `file` extiende o implementa algo declarado en
    // `dominantFile`, el tráfico foráneo concentrado ahí es, muy
    // probablemente, uso normal de lo heredado (helpers/asserts de la
    // clase base), no envidia hacia una unidad ajena.
    if (inheritance.get(file)?.has(dominantFile)) continue;

    // JUICIO DE PRECISIÓN (2) — TODO LO REFERENCIADO ES DATO, NO
    // COMPORTAMIENTO: ver docstring del módulo — leer constantes/alias
    // compartidos no es Feature Envy, no hay ningún método que reubicar.
    if (isDataOnlyTraffic(dominantTally.distinct, nodeById)) continue;

    // JUICIO DE PRECISIÓN (3) — ARCHIVO ESPEJO: ver docstring del módulo —
    // dos archivos que declaran, cada uno, casi el mismo conjunto de
    // nombres calificados son variantes/copias del mismo tipo, no un
    // archivo que envidia al otro.
    if (
      isMirrorFile(
        qualifiedNames.get(file),
        qualifiedNames.get(dominantFile),
        languageByFile.get(file),
        languageByFile.get(dominantFile),
        mirrorRatioMin.value,
        mirrorRatioMax.value,
      )
    )
      continue;

    const isJava = languageByFile.get(file) === "java";
    let severity = Math.min(100, 40 + atfdValue * 5);
    if (isJava) severity = Math.max(15, severity - 15); // ver "OJO CON JAVA": cobertura reducida, no sólo confianza

    findings.push({
      title: `"${file}" referencia más símbolos de "${dominantFile}" que de sí mismo`,
      detail:
        `Este archivo hace ${atfdValue} referencias distintas a símbolos de "${dominantFile}" (${Math.round(dominanceRatio * 100)}% ` +
        `de todo su tráfico foráneo) y sólo ${tally.ownEvents} de sus referencias son a símbolos propios: la lógica que ` +
        `depende tan fuertemente de "${dominantFile}" probablemente pertenece más cerca de ese archivo que de éste.` +
        (isJava
          ? " Cobertura reducida: en Java la mayoría de las aristas de referencia las acepta una etapa heurística " +
            "(path-proximity) que este detector EXCLUYE por no estar validada contra un dataset etiquetado — el " +
            "volumen de hallazgos aquí es un piso, no un techo: puede haber envidia real que la exclusión no ve."
          : ""),
      trigger: [
        {
          label:
            "símbolos distintos referenciados en el archivo dominante (ATFD)",
          value: atfdValue,
          threshold: atfd,
        },
        {
          label: "proporción de referencias propias (LAA)",
          value: Math.round(laaValue * 1000) / 1000,
          threshold: laa,
        },
        {
          label: "concentración del tráfico foráneo en el archivo dominante",
          value: Math.round(dominanceRatio * 1000) / 1000,
          threshold: dominance,
        },
      ],
      evidence: [
        { label: "referencias propias (eventos)", value: tally.ownEvents },
        {
          label: "referencias foráneas totales (eventos)",
          value: foreignEventsTotal,
        },
        {
          label:
            "% del repo que referencia al archivo dominante (fan-in global)",
          value: Math.round(
            ((fanIn.get(dominantFile) ?? 0) / Math.max(1, totalFiles)) * 100,
          ),
          note: "por debajo del piso de infraestructura ubicua — ver JUICIO DE PRECISIÓN en el docstring del módulo.",
        },
      ],
      locations: [
        {
          file,
          startLine: 1,
          endLine: Math.max(1, linesByFile.get(file) ?? 1),
          role: "archivo con más referencias foráneas que propias",
        },
      ],
      severity,
      advice: {
        primary: {
          name: "Move Method",
          kind: "refactorizacion",
          why:
            "Cuando un archivo concentra la mayoría de sus referencias en un único archivo externo, el o los " +
            "símbolos responsables de esa dependencia suelen funcionar mejor viviendo junto a lo que usan — " +
            "identificar cuáles miembros de este archivo impulsan la referencia y moverlos (no necesariamente " +
            "el archivo entero) suele ser el cambio mínimo.",
          source: "https://refactoring.guru/es/smells/feature-envy",
        },
      },
    });
  }

  return findings;
}

export const detector: InterFileDetector<ThresholdKey, "feature-envy-inter"> = {
  id: "feature-envy-inter",
  kind: "feature-envy-inter",
  scope: "inter-file",
  needsGraph: true,
  title: "Envidia de las características entre archivos",
  needs: [],
  /**
   * OLA 11b, frente B1 — LAS CELDAS MUDAS. Igual que en `shotgun-surgery.ts`:
   * la "NOTA DE PROCESO" del docstring de este módulo dice que este detector
   * "NO puede declarar `needsEdges: ["references"]` (el campo no existe en
   * `InterFileDetector` hoy)" y esa afirmación está VENCIDA — el campo existe
   * y `run.ts` lo implementa. La distinción que esa nota pedía ("no aplicable
   * por falta de arista" vs "corrió y no encontró nada") la pinta el runner
   * en cuanto el detector la declara, que es esta línea.
   *
   * EFECTO MEDIDO SOBRE FIXTURES: NINGUNO (214 aristas `references`).
   */
  needsEdges: ["references"],
  thresholds: {
    atfd: ATFD_SPEC,
    laa: LAA_SPEC,
    dominance: DOMINANCE_SPEC,
    maxUbiquitousFanInRatio: MAX_UBIQUITOUS_FAN_IN_RATIO_SPEC,
    mirrorRatioMin: MIRROR_RATIO_MIN_SPEC,
    mirrorRatioMax: MIRROR_RATIO_MAX_SPEC,
  },
  maxFindings: MAX_FINDINGS_SPEC,
  run(repo: RepoUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const graph = repo.graph;
    // Defensivo: `run.ts#runInterFile` ya filtra `needsGraph && graph ===
    // null` ANTES de llamar a `run()` (reporta `sin-grafo`, nunca invoca esto
    // con grafo nulo) — ver la "NOTA DE PROCESO" del docstring del módulo
    // sobre por qué no hay todavía un status `sin-aristas` más fino.
    if (!graph) return [];
    return buildFeatureEnvyInterFindings(
      repo.files,
      graph,
      ctx.threshold("atfd"),
      ctx.threshold("laa"),
      ctx.threshold("dominance"),
      ctx.threshold("maxUbiquitousFanInRatio"),
      ctx.threshold("mirrorRatioMin"),
      ctx.threshold("mirrorRatioMax"),
    );
  },
};
