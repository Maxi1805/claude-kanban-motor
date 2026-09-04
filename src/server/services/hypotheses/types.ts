/**
 * El hueco de las hipótesis de patrón — declarado en Ola 0/1, implementado en
 * F6 (CONTRATO-F6.md Contrato 1). La garantía "ningún patrón dispara solo"
 * está en la firma misma: el único productor del tipo `PatternHypothesis` es
 * `HypothesisBuilder.build`, y `build` exige un `Finding` (un PROBLEMA ya
 * detectado) como primer parámetro. No hay otra vía de construir uno: un
 * patrón sin problema es inexpresable.
 *
 * Import circular con `detect/types.ts` (que a su vez importa `PatternHypothesis`
 * para `Finding.hypotheses?`) es intencional y seguro: ambos lados son sólo
 * tipos (`import type`), sin valor en runtime, así que no hay ciclo de carga
 * real, sólo de tipos — TypeScript los resuelve estructuralmente. Esta ola
 * agrega el mismo trato para `FileUnit`/`RepoUnit` (también sólo tipo).
 *
 * F6 — LOS TRES CAMBIOS, y ninguno más (CONTRATO-F6.md §1.2):
 *   1. `build` gana un tercer parámetro, `ctx: HypothesisContext` — sin esto
 *      ninguna de las 17 reglas de patrón (que miran FORMA, no sólo los
 *      números/strings de un `Finding`) se puede escribir.
 *   2. `confidence` pasa de `PatternConfidence` a `PatternConfidence | null`:
 *      `ya-aplicado`/`aplicado-eludido` no compiten en el ranking de
 *      oportunidades (información positiva o alerta de fuga, no un "hacelo"),
 *      y una hipótesis no-aplicable no tiene confianza que declarar. Un
 *      `PatternConfidence` obligatorio obligaba a mentir con `"baja"`.
 *   3. Tres campos nuevos en `PatternHypothesis`: `missingCapabilities`
 *      (no vacío ⇒ no-aplicable, nunca "cero"), `anchorFindingId` (de qué
 *      `Finding` cuelga — lo que la UI usa para subordinarla visualmente) y
 *      `discriminators` (separado de `checks`, para poder EXPLICAR por qué
 *      la confianza quedó donde quedó). `PatternHypothesisCheck` gana además
 *      un `role` opcional (`required`/`discriminator`/`applied`) — la forma
 *      alternativa que el contrato deja abierta junto con `discriminators`
 *      separado; ambas conviven acá sin contradecirse.
 */
import type { PatternConfidence } from "../../../shared/types.js";
import type { DerivedNodeSets } from "../code-grammar.js";
import type { Capability } from "../detect/capabilities.js";
import type { Finding, FileUnit, RepoUnit, RoleLocation } from "../detect/types.js";
import type { CodeGraph, EdgeKind } from "../graph/types.js";
import type { Neighborhood } from "../graph/neighborhood.js";

export type PatternState = "ausente" | "parcial" | "ya-aplicado" | "aplicado-eludido";

/**
 * OLA BA, FRENTE BA1 — LA CAPA. Las 29 hipotesis registradas son DOS cosas
 * distintas con varas distintas: 12 son PATRONES DE DISENO (GoF; miden 28,3 %)
 * y 17 son FAMILIAS DE REFACTORIZACION (Fowler; miden 68,0 %). Mezclarlas en
 * una sola lista hace ilegible el panel — el usuario pidio verlas separadas,
 * y esa separacion tiene que venir del DATO, no del nombre.
 *
 * POR QUE UN CAMPO Y NO UNA LISTA DE NOMBRES: `scratchpad-ax7/censo-patrones.py`
 * buscaba el string `"Proxy"` y el volcado escribia `"Proxy (inicializacion
 * perezosa)"`; 137 propuestas quedaron invisibles para el instrumento que
 * existia justamente para que ninguna se perdiera. Una lista escrita a mano se
 * desincroniza y NO AVISA. Un campo obligatorio en `HypothesisBuilder` (abajo)
 * no puede desincronizarse: el compilador rechaza una hipotesis nueva que no
 * declare su capa.
 */
export type HypothesisLayer = "patron" | "refactorizacion";

/**
 * CONTRATO-F9.md §1.3 — lo que el `Finding` NO expone y que una regla como
 * `strategy.ts` necesita para cruzar las CLAVES de una tabla de despacho
 * contra el TEXTO de cada rama de una cadena `if/elsif`/`switch`. Nunca
 * persistido (un cuerpo de 200 líneas × 7.630 hallazgos de guava sería más
 * grande que el grafo) — se deriva del árbol vivo bajo demanda, vía
 * `HypothesisContext.branches`.
 */
export interface BranchFacts {
  /** 0-based, orden sintáctico. La rama `else`/`default` va última. */
  readonly ordinal: number;
  /** Texto del test, normalizado (colapso de espacios). `null` en `else`/`default`. */
  readonly test: string | null;
  /** El identificador comparado, si la rama es una comparación contra un discriminante. `null` si no se pudo derivar por estructura. */
  readonly discriminant: string | null;
  /** El literal contra el que se compara — LA CLAVE CANDIDATA de una tabla de despacho. `null` si el lado derecho no es un literal. */
  readonly literal: string | null;
  readonly startLine: number;
  readonly endLine: number;
  /** Forma del CUERPO, derivada de `DerivedNodeSets` (nunca de nombres). */
  readonly shape: "instantiates" | "calls" | "returns-literal" | "assigns" | "other";
}

export interface PatternHypothesisCheck {
  label: string;
  passed: boolean;
  /** Obligatoria en la práctica (el motor siempre la llena, también cuando
   *  `passed` es `false`): es la columna "qué NO se confirmó y por qué" que
   *  pide el producto. Ver `engine.ts`. */
  why: string;
  /** F6: qué papel jugó este check en la escalera. Optativo por si algún
   *  lector sólo necesita label/passed/why (p.ej. UI vieja). */
  role?: "required" | "discriminator" | "applied";
}

/**
 * El contexto que `build` necesita para mirar FORMA, no sólo lo que ya trae
 * un `Finding` (números, strings, ubicaciones — CONTRATO-F6.md §1.2).
 */
export interface HypothesisContext {
  /** El archivo del `problem`, YA parseado. `null` cuando ese archivo no está
   *  vivo en esta corrida — nunca por ser `inter-file` en sí mismo: R1
   *  (`RAICES.md`) cerró el límite por el que `crossAnalyze` reevaluaba TODO
   *  hallazgo `inter-file` con `null` incondicional (cada árbol se liberaba
   *  por archivo dentro de `analyzeFile`, antes de que existiera un
   *  `RepoUnit`) — hoy `crossAnalyze` reparsea bajo demanda
   *  (`code-analyzer.ts#resolveLiveFileUnit`) cada archivo que la evidencia
   *  de algún `Finding` `inter-file` de la corrida toca, así que esto es
   *  no-nulo siempre que ese archivo exista y se haya podido parsear. */
  file: FileUnit | null;
  /** Acceso por ruta a cualquier otro archivo vivo de la corrida. `null` si
   *  ese archivo ya se liberó — nunca lanza. */
  fileAt(path: string): FileUnit | null;
  /** El repo. Sin `node` en `functions` (`RepoFunctionUnit`) — los árboles ya se liberaron. */
  repo: RepoUnit;
  /** Capacidades del lenguaje del `problem`. Vacío ⇒ lenguaje desconocido, toda hipótesis es no-aplicable. */
  capabilities: ReadonlySet<Capability>;
  /**
   * `DerivedNodeSets` del LENGUAJE, cacheados desde su `probeSource` dedicado
   * (`code-analyzer.ts`). NUNCA derivados del archivo analizado — Bug C del
   * spike (`impl/spikes/motor-hipotesis/RESULTADO-v2.md`): derivarlo del
   * árbol bajo análisis mal-clasifica método↔clase cuando ese árbol no tiene
   * ninguna instancia de método CON parámetros (confirmado: 46% de mal-
   * clasificación en los fixtures Ruby de Prototype). Ninguna hipótesis debe
   * llamar `deriveNodeSets` directamente — test de contrato lo prohíbe.
   */
  setsFor(language: string): DerivedNodeSets;
  /**
   * NUEVO, CONTRATO-F9.md §1.1. El vecindario del `problem` — otros
   * hallazgos y el grafo alrededor de su ancla. NUNCA `null`: cuando no hay
   * grafo ni pares, es `graph/neighborhood.ts#EMPTY_NEIGHBORHOOD`, que
   * responde `[]`/`null`/`undefined` a todo — una hipótesis no tiene que
   * preguntar si existe antes de usarlo.
   */
  neighborhood: Neighborhood;
  /**
   * NUEVO, CONTRATO-F9.md §1.3. Lo que el `Finding` no expone: el texto/
   * forma de cada rama de la cadena en la que ancla `problem`. `null` = no
   * había árbol vivo para este hallazgo (mismo caso que `ctx.file === null`
   * — HOY siempre `null` en la llamada de `attachHypotheses` dentro de
   * `crossAnalyze`, real dentro de `analyzeFile`); `[]` = había árbol y la
   * cadena no tiene ramas. Los dos casos son distintos y un check no puede
   * confundirlos. Implementación real (recorrer `ctx.file` con
   * `sets.chainNodes`/`switchContainerNodes`) es trabajo de F1
   * (CONTRATO-F9.md §1.3) — el cableado de esta ola (`hypotheses/run.ts`)
   * la deja siempre `null`, el default seguro cuando no se sabe.
   */
  branches(problem: Finding): readonly BranchFacts[] | null;
}

export interface PatternHypothesis {
  pattern: string;
  /**
   * OLA BA, FRENTE BA1 — patron de diseno o familia de refactorizacion. NO lo
   * escribe ninguna hipotesis: lo ESTAMPA `hypotheses/run.ts`, copiandolo del
   * `HypothesisBuilder.layer` del builder que produjo esta hipotesis (los tres
   * sitios: `attachHypotheses`, `rebuildHypothesesWithGraph`,
   * `refreshHypotheses`). Por eso `build`/`refresh` devuelven
   * `PatternHypothesisDraft` (sin capa) y este tipo — el que de verdad viaja —
   * la tiene OBLIGATORIA: la unica forma de que exista un `PatternHypothesis`
   * es que haya pasado por el estampado, y la unica fuente de la capa es el
   * builder registrado. Imposible desincronizar por construccion.
   */
  layer: HypothesisLayer;
  state: PatternState;
  /** CALCULADA: min(ceiling, escalera de discriminadores confirmados) — SIEMPRE
   *  vía `engine.ts#build`. `null` cuando el estado no es una oportunidad
   *  (`ya-aplicado`/`aplicado-eludido`) o cuando la hipótesis no es aplicable
   *  (`missingCapabilities` no vacío). Ningún archivo de hipótesis declara un
   *  literal acá — `no-declared-confidence.test.ts` lo audita. */
  confidence: PatternConfidence | null;
  /** Tope que ni una escalera perfecta de checks puede superar para este patrón. */
  ceiling: PatternConfidence;
  /** K2: arranca en `true`; se baja a medida que la escalera de checks madura contra el corpus externo. */
  provisional: boolean;
  /** Los checks `required` + `applied` (el excluder fusionado que decide `state`). */
  checks: readonly PatternHypothesisCheck[];
  /** F6: separados de `checks` — cada uno confirmado sube un peldaño de la escalera. */
  discriminators: readonly PatternHypothesisCheck[];
  places: readonly RoleLocation[];
  toConfirm: readonly string[];
  cost: string;
  source: string;
  /** F6: no vacío ⇒ "no aplicable" para el lenguaje de `problem` — nunca "cero hallazgos". */
  missingCapabilities: readonly Capability[];
  /**
   * OLA A3 — el equivalente de `InterFileDetector.needsEdges`/
   * `DetectorCoverage.missingEdgeKinds` (`detect/types.ts`) para una
   * hipótesis YA construida (es decir, que SÍ tenía un `Finding`-ancla:
   * `HypothesisBuilder.build` exige uno, así que esto NUNCA cubre el caso
   * "el detector-ancla mismo está `sin-aristas` y no produjo ningún
   * `Finding`" — para ESE caso, que es estructuralmente anterior a que
   * exista un `PatternHypothesis`, ver `pattern-coverage.ts#computePatternCoverage`,
   * que cruza `HypothesisBuilder.anchors` contra la cobertura de detectores.
   * Este campo cubre el otro caso: el `Finding`-ancla SÍ existe, `build()`
   * corrió, pero alguno de los checks de la hipótesis necesitaba un
   * `EdgeKind` del grafo que esta corrida no tiene — no vacío ⇒ "no pude
   * evaluarme del todo", una lectura más débil que `state`/`confidence`
   * calculados sin reservas.
   *
   * *** VERIFICADO EN LA OLA 11b (frente B0): HOY ESTE CAMPO ESTÁ MUERTO DE
   * PUNTA A PUNTA, NO SÓLO "SIN USAR TODAVÍA". *** Tres eslabones, cada uno
   * confirmado por lectura directa, no supuesto:
   *   1. Ningún `<patron>.ts` de los 17 registrados declara
   *      `HypothesisSpec.needsEdges` (`engine.ts`) — grep sobre el
   *      directorio, cero resultados fuera de este propio comentario y de
   *      `engine.test.ts` (que ejercita el mecanismo con specs FALSOS).
   *   2. Nadie llama a `engine.ts#build` pasándole su parámetro opcional
   *      `edgeKindsPresent` — sin eso, el chequeo de `needsEdges` ni siquiera
   *      se evalúa (`if (edgeKindsPresent && spec.needsEdges...)`), así que
   *      aunque el punto 1 cambiara mañana, este campo seguiría en blanco
   *      hasta que ALGO en `hypotheses/run.ts` empiece a pasarlo.
   *   3. Aunque los dos puntos de arriba se resolvieran, el valor NUNCA
   *      cruzaría al cliente: `shared/types.ts#CodeFindingHypothesis` — el
   *      tipo que de verdad viaja a la UI — no tiene un campo equivalente.
   *      `toPatternHypothesis` (`engine.ts`) lo escribe acá, en el tipo
   *      SERVER-ONLY, y ahí muere.
   *
   * CONSECUENCIA PARA QUIEN LEA ESTE CAMPO: `undefined`/ausente NO significa
   * "se evaluó con todas las aristas necesarias presentes" — significa "nadie
   * preguntó". Es la MISMA confusión ("cero" leído como "verificado") que
   * motivó todo este mecanismo del lado de los detectores, un nivel más
   * arriba y sin ninguna de las tres compuertas que la volverían observable.
   * No hay una razón viva para tratar la AUSENCIA de este campo como
   * evidencia de nada, en ningún sentido, hasta que los tres eslabones de
   * arriba se completen.
   */
  missingEdgeKinds?: readonly EdgeKind[];
  /** F6: el `Finding.id` del que cuelga esta hipótesis — lo que la UI usa para subordinarla dentro de su tarjeta. */
  anchorFindingId: string;
  /**
   * Ola 10 — registro de pendientes §B1. Payload OPACO que `build()` puede
   * guardar mientras tiene contexto que después no va a tener (hoy: sólo
   * `ctx.file` con árbol vivo — se libera antes de `crossAnalyze`), para que
   * `HypothesisBuilder.refresh` lo use en vez de recalcularlo. `undefined` ⇒
   * nada que refrescar (el default: las hipótesis que no lo usan). Sólo el
   * builder que lo escribió sabe su forma real — nadie más debe leerlo.
   * Nunca cruza a `CodeFindingHypothesis` (`shared/types.ts`): es interno al
   * servidor.
   */
  refreshState?: unknown;
}

/**
 * OLA BA, FRENTE BA1 — lo que un `HypothesisBuilder` produce: un
 * `PatternHypothesis` MENOS su `layer`. Un builder no declara la capa de cada
 * hipotesis que construye (podria mentir, o dos ramas del mismo archivo podrian
 * discrepar): la declara UNA vez, en `HypothesisBuilder.layer`, y `run.ts` la
 * estampa. Este tipo es el que devuelven `build`/`refresh` y el que
 * `engine.ts#toPatternHypothesis` arma.
 */
export type PatternHypothesisDraft = Omit<PatternHypothesis, "layer">;

/**
 * F-ALT — Ola 13, frente "el remedio correcto es otro" (RAICES.md: de 174
 * hipótesis juzgadas a mano, el ancla acierta el 57%, el patrón sólo el 11%
 * — la diferencia, 46%, es "hay un problema real, el remedio correcto es
 * otro"). Lo que la rama NEGATIVA de un `required` de patrón puede producir
 * (PILOTO MEDIDO EN BUILDER, ver `builder.ts` §"OLA 13 — EL RESULTADO
 * MEDIDO": 43% de precisión sobre 15 ubicaciones/3 lenguajes, por debajo
 * del piso de 50% — condición de fracaso declarada, `builder.ts` NO
 * registra su `buildAlternative` en el `HypothesisBuilder` por esto mismo.
 * Este tipo queda como infraestructura probada para quien intente Command/
 * Decorator, o retente Builder con un `required` más ajustado.)
 * en vez de silencio puro — ver `builder.ts#buildAlternative` para el caso
 * piloto (Builder → Parameter Object cuando el candidato SÓLO asigna/
 * reenvía, sin lógica de ensamblaje real).
 *
 * ─── DECISIÓN DE REPRESENTACIÓN (pedida explícitamente por el encargo:
 * "elegí lo que menos mienta, y escribí por qué") ───────────────────────────
 * Se evaluaron las tres formas que el encargo nombra:
 *   1. Un CAMPO en `PatternHypothesis` (p.ej. `alternative?: ...`): exige que
 *      YA EXISTA una `PatternHypothesis` a la que colgarlo — pero cuando el
 *      `required` de Builder falla (el caso que dispara la alternativa),
 *      `engine.ts#build` devuelve `null` ANTES de que exista ningún objeto
 *      (CONTRATO: "sin esto, ni siquiera es candidata"). No hay dónde
 *      colgar el campo sin cambiar ese contrato para los otros 16 patrones.
 *   2. Una `PatternHypothesis` CON MARCADOR (p.ej. reusar el tipo, agregar
 *      `isAlternative: true`): obligaría a INVENTAR un `PatternState` (¿qué
 *      sería "aplicado-eludido" para un Parameter Object?), una `confidence`
 *      de tres escalones que no existe (el check es BINARIO: el `required`
 *      propio sostiene o no, sin escalera de discriminadores) y un `ceiling`
 *      sin sentido. Es exactamente la mentira que el encargo pide evitar.
 *   3. Un TIPO HERMANO — la opción elegida. `PatternAlternative` (acá abajo)
 *      no tiene `state` ni `confidence` ni `discriminators`: tiene su propio
 *      `checks` (el `required` propio, tan exigente como el del patrón
 *      descartado) y listo. No compite en ninguna escalera de confianza
 *      porque no es una oportunidad de PATRÓN — es una alternativa BINARIA.
 *
 * ─── POR QUÉ TODAVÍA NO CUELGA DE `Finding`/`CodeFindingHypothesis`
 * (límite de ALCANCE DECLARADO, no un descuido) ─────────────────────────────
 * `Finding.hypotheses` (`detect/types.ts`) es el único gancho hoy, y su tipo
 * de elemento es `PatternHypothesis` — agregar un campo HERMANO
 * (`Finding.alternatives?: readonly PatternAlternative[]`) exigiría tocar
 * `detect/types.ts`. Esta ola tiene prohibido tocar `detect/` (RAICES.md:
 * "hay otra ola trabajando ahí ahora mismo — tu área es hypotheses/"). Por
 * eso `PatternAlternative` queda PROBADA con datos reales (`buildAlternative`,
 * exportado, ejercitado por `scripts/measure-builder-alternative.mts` contra
 * repos reales con `ctx.file` vivo) pero SIN wiring de producción todavía.
 * Conectarla, para quien tenga permiso de tocar `detect/`, son DOS líneas:
 * un campo en `Finding` y, en `hypotheses/run.ts#attachHypotheses`, juntar lo
 * que cada `builder.buildAlternative?.(...)` devuelva — el mismo bucle que
 * ya existe para `builder.build(...)`, nada nuevo que diseñar. Mismo espíritu
 * que el "límite de cableado" que ya documentan `builder.ts#evaluateGraphShape`
 * y este archivo (`missingEdgeKinds`, arriba): la lógica es correcta y
 * medida, el cableado a la UI es un paso aparte, declarado, no fingido.
 *
 * ─── SEPARACIÓN CRITERIO/TEXTO (condición no negociable #3 del encargo) ────
 * `why` es el CRITERIO — 100% estructural, nunca nombra un lenguaje ni un
 * framework: la MISMA evidencia (invertida) que decidió que el patrón
 * descartado no aplica (ver `builder.ts#assemblyVerdict`, compartida por las
 * dos ramas del check de intención). `suggestion` es el TEXTO del remedio:
 * PUEDE nombrar el idioma del LENGUAJE (kwargs, `Data.define`, un `record`
 * — gramática, permitida) pero NUNCA un framework/librería (prohibido por
 * RAICES.md sin excepción). Cada `<patron>.ts` que agregue su propia
 * alternativa debe mantener esta misma separación: el criterio vive en el
 * `required` propio (`checks`, abajo), el texto vive en una función aparte
 * que sólo redacta lo que el `required` ya decidió — nunca al revés.
 */
export interface PatternAlternative {
  /** Patrón cuya rama NEGATIVA produjo esta alternativa (p.ej. "Builder"). */
  discardedPattern: string;
  /** Nombre del remedio propuesto — NO necesariamente del catálogo GoF/refactoring.guru (p.ej. "Parameter Object", "Extraer método", "Query Object"/scopes nombrados). */
  remedy: string;
  /**
   * El `required` PROPIO de la alternativa — condición no negociable #1 del
   * encargo: "tan exigente como la positiva". Nunca vacío: sin al menos un
   * check que confirme por qué el patrón NO aplica Y por qué el remedio SÍ,
   * `buildAlternative` debe devolver `null`, jamás un objeto con `checks: []`.
   */
  checks: readonly PatternHypothesisCheck[];
  /** El criterio GENÉRICO que decidió esto — sin nombre de lenguaje ni de framework. Redundante con `checks[].why` a propósito: mismo criterio de "evidencia SIEMPRE" que `PatternHypothesisCheck.why`. */
  why: string;
  /** El texto del remedio — puede nombrar el idioma del LENGUAJE, nunca un framework. Ver la separación criterio/texto arriba. */
  suggestion: string;
  places: readonly RoleLocation[];
  toConfirm: readonly string[];
  /** refactoring.guru (o, cuando el remedio no es un patrón GoF, su fuente real — p.ej. la página de la CODE SMELL que ya recomienda este remedio). */
  source: string;
  /** El `Finding.id` del que cuelga — mismo campo que `PatternHypothesis.anchorFindingId`. */
  anchorFindingId: string;
}

export interface HypothesisBuilder {
  id: string;
  /** Nombre del patrón — refactoring.guru. Fuente de `registry.ts#RegisteredPattern`. */
  pattern: string;
  /**
   * OLA BA, FRENTE BA1 — DE QUE CAPA ES ESTA HIPOTESIS. OBLIGATORIO, nunca
   * opcional: es el punto entero del diseno. Una hipotesis nueva no compila si
   * no dice si es un patron de diseno o una familia de refactorizacion, asi que
   * la separacion que ve el panel no puede quedarse atras del catalogo — a
   * diferencia de la lista de nombres escrita a mano de
   * `scratchpad-ax7/censo-patrones.py`, que dejo 137 propuestas invisibles sin
   * avisar. `hypotheses/run.ts` copia este valor a cada `PatternHypothesis` que
   * este builder produce; ningun otro codigo decide la capa.
   */
  layer: HypothesisLayer;
  /**
   * Los `kind` de `Finding` de los que esta hipótesis puede colgar. Tupla NO
   * VACÍA: mismo truco que `RawFinding.trigger` ya usa — una hipótesis sin
   * ancla es un error de compilación, no un olvido en runtime.
   */
  anchors: readonly [string, ...string[]];
  /**
   * El problema es el PRIMER parámetro, siempre. No hay otra forma de producir
   * un `PatternHypothesis`: sin `Finding` no hay hipótesis. `ctx` (F6) es lo
   * que permite mirar FORMA además de lo que ya trae el `Finding`.
   */
  build(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null;
  /**
   * Ola 10 — OPCIONAL. Segunda pasada: recalcula SÓLO discriminadores/
   * confianza de una hipótesis ya construida por `build()`, con un `ctx`
   * mejor en algún eje (hoy: `ctx.neighborhood` real en vez de
   * `EMPTY_NEIGHBORHOOD` — ver `hypotheses/run.ts#refreshHypotheses`, el
   * único llamador). `existing` es EXACTAMENTE lo que `build()` devolvió
   * antes (nunca un `Finding` nuevo); `null` ⇒ nada que mejorar, la hipótesis
   * queda como estaba. Un builder que no la implementa simplemente no se
   * refresca — comportamiento IDÉNTICO al de antes de que este campo
   * existiera. Contrato duro (ver `engine.ts#refreshDiscriminators`): NUNCA
   * debe cambiar `state` ni los checks `required`/`applied` de `existing` —
   * ese es trabajo exclusivo de `build()`, con el mejor `ctx.file` que hubo.
   */
  refresh?(existing: PatternHypothesisDraft, problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternHypothesisDraft | null;
  /**
   * OPCIONAL — Ola 13, frente "el remedio correcto es otro" (RAICES.md). Ver
   * `PatternAlternative` para el porqué completo de la forma y del límite de
   * cableado declarado. MISMA polaridad que `build`: `null` cuando ni
   * siquiera la alternativa es candidata (su propio `required` no se
   * cumplió) — sin evidencia POSITIVA de "esto es lo que corresponde en vez
   * del patrón", silencio, nunca una alternativa sin sostén. Un builder que
   * no la implementa simplemente no propone ninguna — comportamiento
   * IDÉNTICO al de antes de que este campo existiera.
   *
   * *** NINGÚN PATRÓN LO IMPLEMENTA HOY, NI SIQUIERA BUILDER *** — Ola 13
   * escribió `builder.ts#buildAlternative` (función correcta, probada,
   * required propio) pero la MIDIÓ a 15 ubicaciones reales, 3 lenguajes
   * (Ruby/TypeScript/Java): 43% de precisión (6/14, Wilson95 [21%,67%], 1
   * dudoso excluido) — por debajo del piso de 50% del encargo. Condición de
   * fracaso declarada (ver el docstring de `builder.ts`, sección "OLA 13 —
   * EL RESULTADO MEDIDO", para el desglose completo): la rama negativa de
   * Builder vuelve a ser silencio, así que `builder.ts` NO la registra acá.
   * El tipo/mecanismo queda como INFRAESTRUCTURA proba para Command/
   * Decorator — el fracaso es de la instancia (Builder → Parameter Object),
   * no del molde.
   */
  buildAlternative?(problem: Finding, graph: CodeGraph | null, ctx: HypothesisContext): PatternAlternative | null;
}
