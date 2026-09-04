/**
 * Los contratos del registro de detectores — CONTRATOS.md §1.3-§1.7.
 *
 * `thresholds.ts` y `ids.ts` son los otros dos módulos "cerrados"; éste reúne
 * el resto: las unidades de entrada de las tres granularidades, el hallazgo
 * crudo y el resuelto, las tres formas de detector, y cómo viaja la cobertura
 * hasta la UI.
 */
import type { CodeAdvice, CodeFindingKind } from "../../../shared/types.js";
import type { DerivedNodeSets, ProbeNode } from "../code-grammar.js";
import type { CodeGraph, EdgeKind, GraphIndex } from "../graph/types.js";
import type { PatternHypothesis } from "../hypotheses/types.js";
import type { Capability } from "./capabilities.js";
import type { Threshold, ThresholdSpec } from "./thresholds.js";

/** Las tres granularidades en las que un detector puede correr. */
export type Scope = "intra-function" | "intra-file" | "inter-file";

/**
 * El nodo YA parseado — la misma forma estructural que `ProbeNode`
 * (`code-grammar.ts`) más lo que sólo un árbol REAL (no la sonda) tiene:
 * posición y texto fuente. Ningún detector re-parsea ni re-lee disco: si algo
 * no está en este nodo, no está disponible en esta granularidad.
 */
export interface AstNode extends ProbeNode {
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  text: string;
}

/** Ancla estable de una ubicación, sin números de línea — ver `ids.ts`. */
export interface Anchor {
  file: string;
  /** Camino de unidades nombradas, de afuera hacia adentro: ["Site", "process"]. Vacío = nivel archivo. */
  symbolPath: readonly string[];
  /** Sólo cuando `symbolPath` no desambigua: ordinal entre hermanos de la MISMA forma dentro del mismo camino. */
  ordinal?: number;
}

/** Ubicación CON ROL. Homogénea para findings, heterogénea para hipótesis: el rol siempre está. */
export interface RoleLocation {
  file: string;
  startLine: number;
  endLine: number;
  symbol?: string;
  /** Qué papel juega ESTE lugar ("copia #2", "acumulador", "cliente que puentea la fachada"). */
  role: string;
  /** Ancla estable, sin líneas. Si falta, se deriva de `file` + `symbol` — ver `ids.ts#deriveAnchor`. */
  anchor?: Anchor;
}

/** Un número CON el umbral que lo hace significativo, y la fuente de ese umbral. */
export interface Measurement {
  label: string;
  value: number;
  threshold: Threshold;
}

/** Números que se muestran como evidencia pero no disparan nada: no necesitan umbral. */
export interface Evidence {
  label: string;
  value: number;
  note?: string;
}

/** Lo que un detector devuelve: crudo, sin identidad todavía (la pone el runner). */
export interface RawFinding {
  /** Sub-forma dentro del detector, cuando emite más de una. Entra en el id estable. */
  variant?: string;
  title: string;
  detail: string;
  /** Al menos UN número con umbral con fuente. Tupla no vacía: lo exige el compilador. */
  trigger: readonly [Measurement, ...Measurement[]];
  evidence?: readonly Evidence[];
  /** >= 1, cada una con su rol. */
  locations: readonly [RoleLocation, ...RoleLocation[]];
  severity: number; // 0-100
  /** Refactor barato y mecánico. Obligatorio: el patrón viene después y es opcional. */
  advice: CodeAdvice;
}

/** Lo que sale del runner: `RawFinding` + identidad + procedencia. Nunca lo construye un detector. */
export interface Finding extends RawFinding {
  id: string;
  detectorId: string;
  kind: CodeFindingKind;
  scope: Scope;
  /** `null` para inter-file cuando el hallazgo cruza más de un lenguaje. */
  language: string | null;
  /** Hueco de F6. Lo llena `hypotheses/registry.ts` (F6), jamás un detector. */
  hypotheses?: readonly PatternHypothesis[];
}

/* ────────────────────────────────────────────────────────────────────────
 * Unidades de entrada de las tres granularidades
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * El `FunctionInfo` de hoy (`code-analyzer.ts`), sin `name`/`file`/`startLine`/
 * `endLine` — esos ya viven en el `FunctionUnit` que envuelve esto, así que
 * repetirlos acá sería duplicar el mismo dato bajo dos nombres. Ver el
 * resultado final para la nota sobre esta lectura de "sin los campos de
 * consejo": ninguno de los campos de `FunctionInfo` de hoy es en sí mismo un
 * consejo (el consejo vive en `code-suggest.ts`, aparte); lo que se recorta
 * acá es lo que otro campo de `FunctionUnit` ya provee.
 */
export interface FunctionMetrics {
  branches: number;
  /** Longest if/elsif or case/when ladder found inside. */
  chain: number;
  /** Cognitive complexity (SonarSource S3776). */
  cognitive: number;
  /** Deepest nesting reached. */
  maxNesting: number;
  parameters: number;
  /** A branch of its longest ladder compares against nil/null/undefined. */
  chainHasNullCheck: boolean;
  /** Every arm of that ladder constructs a different type. */
  chainInstantiates: boolean;
  /** Syntactic class enclosing the function, if any. */
  className: string | null;
  /** Named like a constructor. */
  isConstructor: boolean;
  /** Named like a creation method (`create`, `build`, `for`, ...). */
  isFactoryLike: boolean;
}

export interface FunctionUnit {
  file: string;
  language: string;
  /** `null` real cuando la función es anónima — nunca el centinela "(anónima)". */
  name: string | null;
  startLine: number;
  endLine: number;
  symbolPath: readonly string[];
  /** El nodo YA parseado; nadie re-parsea ni re-lee disco. */
  node: AstNode;
  sets: DerivedNodeSets;
  metrics: FunctionMetrics;
}

export interface FileUnit {
  path: string;
  language: string;
  lines: number;
  root: AstNode;
  sets: DerivedNodeSets;
  functions: readonly FunctionUnit[];
}

/**
 * Un `CloneCandidate` de fingerprinting estructural (hoy privado a
 * `code-analyzer.ts`; redeclarado acá porque `RepoUnit` lo necesita antes de
 * que exista una migración real de `duplication`). Ver el resultado final:
 * cuando `duplication` se migre, este tipo y el de `code-analyzer.ts` deben
 * unificarse — hoy son estructuralmente idénticos a propósito.
 */
export interface CloneCandidate {
  fingerprint: string;
  file: string;
  startLine: number;
  endLine: number;
  nodes: number;
  type: string;
  functionName: string | null;
  className: string | null;
  superclassName: string | null;
  normalized: string;
}

export interface FileSummary {
  path: string;
  lines: number;
  language: string;
}

/**
 * `FunctionUnit` sin `node`: a nivel REPO (`RepoUnit.functions`) los árboles
 * ya se liberaron, tal como documenta el contrato original línea por línea
 * ("sin `node`: los árboles ya se liberaron"). Ese comentario y la anotación
 * de tipo del contrato (`FunctionUnit[]`) se contradicen tal como está escrito
 * — `FunctionUnit.node` es obligatorio — así que esta ola resuelve la
 * contradicción a favor de la prosa (que es inequívoca) introduciendo este
 * tipo derivado. Ver el resultado final para el detalle completo.
 */
export type RepoFunctionUnit = Omit<FunctionUnit, "node">;

export interface RepoUnit {
  repoName: string;
  /**
   * OLA AW, FRENTE AW6 — OPCIONAL Y ADITIVO: la raíz del repo en disco, para
   * detectores que necesitan leer los BYTES CRUDOS del árbol (ver
   * `inter-file/repo-name-index.ts`) en vez de sólo lo que `FileFacts` ya
   * cargó. Ausente ⇒ el índice de texto queda INERTE (`filesRead === 0`) y
   * todo detector que lo consuma se comporta exactamente como si el campo no
   * existiera — mismo criterio que `graph`/`metrics` en esta misma interfaz.
   */
  dir?: string;
  files: readonly FileSummary[];
  /** Repo-wide, SIN `node` — ver `RepoFunctionUnit`. */
  functions: readonly RepoFunctionUnit[];
  clones: readonly CloneCandidate[];
  /** EL HUECO. `null` hasta F3. Se declara ahora para no rediseñar después. */
  graph: CodeGraph | null;
  /**
   * OTRO HUECO, mismo espíritu que `graph`, pero OPCIONAL (a diferencia de
   * `graph`, que es obligatorio): `RepoUnit.metrics`/`computeGraphMetrics`
   * NO existen en producción todavía (ver DIAGNÓSTICO-5B §5, F3 — "dos
   * productores": ni `EDGE_EXTRACTORS` ni `GRAPH_METRICS` tienen un
   * call site real). Optativo para que ningún sitio que ya construye un
   * `RepoUnit` hoy (`code-analyzer.ts`, `detect/testing.ts`, los fakes de
   * `run.test.ts`) tenga que tocarse para seguir compilando — esta ola NO
   * es dueña de esos archivos. Ids de métricas (`graph/metrics/registry.ts
   * #GRAPH_METRICS`) que SÍ se resolvieron para este repo esta corrida.
   * Ausente/`undefined` ⇒ "no hay métricas todavía", la misma lectura
   * honesta que motiva `CoverageStatus`'s `"sin-metricas"`.
   */
  metrics?: ReadonlySet<string>;
}

/* ────────────────────────────────────────────────────────────────────────
 * Las tres formas de detector
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * `Kind` es un parámetro de tipo a propósito: **el `kind` de un hallazgo lo
 * aporta el detector**, no una unión cerrada que viva en un archivo
 * compartido. Un detector se escribe
 * `IntraFileDetector<"memberCount", "large-class">` y con eso su literal queda
 * preservado en el tipo, lo que permite que `registry.ts` DERIVE la unión de
 * kinds registrados (`RegisteredFindingKind`) del propio arreglo, en vez de
 * que cada detector nuevo tenga que agregar su variante a
 * `shared/types.ts#CodeFindingKind`. Ver el comentario de `CodeFindingKind`,
 * que documenta la inversión completa.
 *
 * El default `string` existe sólo para que la unión `Detector` (que borra los
 * literales al unificar) siga siendo escribible y para no romper a nadie que
 * escriba `IntraFileDetector<"x">` a secas; un detector concreto SIEMPRE pasa
 * su literal, y `registry.test.ts` lo verifica.
 */
export interface DetectorBase<K extends string, Kind extends string = string> {
  /** kebab-case, único, INMUTABLE (entra en el id — ver `ids.ts`). */
  id: string;
  /**
   * El kind que este detector emite. String kebab-case libre: no hay que
   * darlo de alta en ningún archivo compartido antes de usarlo. Es lo que la
   * UI agrupa y lo que el censo cuenta como `hallazgo:<kind>`, así que una vez
   * publicado NO se renombra (renombrarlo mueve la línea base del censo).
   */
  kind: Kind;
  /** Nombre humano, para el panel "Qué no estamos viendo". */
  title: string;
  needs: readonly Capability[];
  /** Declarados una vez: los enumera la UI y los audita el lint del inventario. */
  thresholds: Readonly<Record<K, ThresholdSpec>>;
  /** Tope propio de este detector, si tiene sentido. Es un `presupuesto`, no un umbral de detección. */
  maxFindings?: ThresholdSpec;
  /**
   * LA RAZÓN DE UN SILENCIO CORRECTO — CONTRATO-F6.md §2.4, aterrizada en la
   * Ola 11b (frente B1, ítem D1 de PENDIENTES.md).
   *
   * `lenguaje → por qué este detector NO PUEDE encontrar nada ahí`. Es el
   * caso 4 de la compuerta `detect/language-coverage.ts#verdictFor`: un par
   * `(detector, lenguaje)` que corre, da cero y no declara por qué es una
   * VIOLACIÓN; con una entrada acá pasa a ser una celda declarada. La
   * diferencia entre declarar y silenciar es que la razón queda escrita,
   * versionada y auditable — `language-coverage.test.ts` verifica que cada
   * clave sea un lenguaje real de `LANGUAGES_MEASURED` y que la razón no sea
   * un relleno.
   *
   * *** ESTE ES EL ÚLTIMO RECURSO, NO EL PRIMERO. *** Hay tres mecanismos
   * MEJORES, todos verificables por máquina, y hay que descartarlos antes:
   *
   *   1. `needs` (capacidad de lenguaje) ⇒ `no-aplicable` + la capacidad
   *      exacta que falta. Es el correcto cuando el lenguaje carece de la
   *      CONSTRUCCIÓN (Go sin excepciones para `empty-catch`).
   *   2. `needsEdges` ⇒ `sin-aristas` + los `EdgeKind` que faltan. Es el
   *      correcto cuando el silencio viene de que una arista no aterrizó en
   *      esta corrida (no del lenguaje).
   *   3. `needsMetrics` ⇒ `sin-metricas`, mismo espíritu.
   *
   * `silentIn` es TEXTO LIBRE y por lo tanto no se puede verificar contra el
   * grafo: sirve sólo para lo que ninguno de los tres puede expresar — el
   * lenguaje tiene la capacidad y las aristas están, pero la FORMA que este
   * detector busca no se escribe así en ese lenguaje. Una entrada que se
   * pueda reemplazar por uno de los tres de arriba es un error, no un
   * atajo.
   *
   * Hasta esta ola el campo no existía acá: `language-coverage.ts` lo leía
   * por duck-typing (`silentReasonOf`) contra una forma local, esperando que
   * "otro agente" lo declarara. Nadie lo declaró en cuatro olas. Declararlo
   * en el tipo es lo que hace que un detector pueda usarlo sin castear.
   */
  silentIn?: Readonly<Record<string, string>>;
  /**
   * F5 — CONTRATO-F5.md Contrato 2 §2.2, nivel 1 ("causa raíz semántica").
   * Dos hallazgos de ESTE detector con la MISMA clave son el MISMO problema
   * visto desde N lugares — `detect/grouping.ts#groupFindings` los colapsa en
   * una tarjeta con `memberCount`. `undefined` (el default: la mayoría de los
   * detectores no lo declaran) ⇒ este detector no agrupa por causa raíz; sus
   * hallazgos sólo pueden colapsar por la localidad genérica de nivel 2
   * (`(file, kind)`, `GROUP_MIN`), que no necesita cooperación del detector.
   * Ningún detector registrado hoy lo implementa — es un punto de extensión,
   * no una migración de `duplication` (que sigue agrupando fingerprints
   * puertas adentro, como hace desde antes de esta ola).
   */
  groupKey?(f: RawFinding): string | undefined;
}

export interface RunContext<K extends string> {
  language: string;
  capabilities: ReadonlySet<Capability>;
  /** El umbral YA RESUELTO. Única vía de obtener un `Threshold`. */
  threshold(name: K): Threshold;
  /**
   * LA UNIFICACIÓN — Ola N, frente U1. El grafo del repo, DISPONIBLE AL MISMO
   * TIEMPO QUE EL ÁRBOL VIVO para un detector `intra-*` que lo pidió
   * (`needsGraph`, abajo). Ver `CONTRATO-UNIFICACION.md`.
   *
   * Hasta esta ola un detector `intra-function`/`intra-file` era CIEGO al
   * grafo por construcción: `code-analyzer.ts#analyzeFile` los corre por
   * archivo, con el árbol vivo, ANTES de que exista el grafo (que necesita los
   * hechos de todos los archivos); en `crossAnalyze`, donde el grafo ya
   * existe, el árbol de cada archivo ya se liberó con `tree.delete()`. Los dos
   * nunca coexistían. Ahora sí, para el que lo pide.
   *
   * `null`/ausente ⇒ esta corrida no tiene grafo para este detector. Pasa en
   * TRES casos, todos legítimos, y un detector que declare `needsGraph` tiene
   * que seguir siendo correcto en los tres (ver el docstring de `needsGraph`):
   *   1. la pasada 1 (todo detector que NO declaró `needsGraph`);
   *   2. el interruptor de vuelta atrás `CK_ANALISIS_DOS_PASADAS=0`;
   *   3. el build de grafo de esta corrida falló (`crossAnalyze` lo aísla en
   *      su propio try/catch y sigue).
   *
   * OPCIONAL a propósito: decenas de tests de detector arman su `RunContext`
   * como objeto literal (`{ language, capabilities, threshold }`) y
   * `detect/testing.ts#testContext` — módulo CERRADO — también. Un campo
   * requerido los habría roto a todos sin ganar nada: un detector lee
   * `ctx.graph ?? null`.
   */
  graph?: CodeGraph | null;
  /**
   * Índice de consulta O(1) sobre `ctx.graph` (`nodeById`/`edgesFrom`/
   * `edgesTo`). Es una FUNCIÓN, no un campo, porque construirlo es O(N+E) y
   * sólo se paga si alguien lo pide: el runner lo construye PEREZOSAMENTE y
   * UNA sola vez por corrida, compartido entre todos los detectores.
   *
   * Sin esto, un detector `intra-function` que quisiera preguntarle algo al
   * grafo tendría que recorrer `graph.edges` entero por CADA función del repo
   * — O(funciones × aristas), que en guava es del orden de 10^9. Devuelve
   * `null` exactamente cuando `ctx.graph` es `null`.
   */
  graphIndex?(): GraphIndex | null;
}

/**
 * LA UNIFICACIÓN — el opt-in de un detector `intra-*` al grafo (Ola N, U1).
 *
 * Mismo vocabulario que `InterFileDetector.needsGraph`, con UNA diferencia de
 * semántica que está escrita acá porque es deliberada y no obvia:
 *
 *   - `InterFileDetector.needsGraph: true` es una COMPUERTA DURA: sin grafo el
 *     detector NO corre y el runner reporta `sin-grafo`. Puede permitírselo
 *     porque esos detectores no existen sin grafo — no tienen nada que decir.
 *   - `IntraGraphOptIn.needsGraph: true` es una declaración de RUTEO: "correme
 *     en la pasada donde el grafo existe". NO es una compuerta. Un detector
 *     `intra-*` que lo declara SIGUE CORRIENDO cuando no hay grafo (con
 *     `ctx.graph === null`) y tiene que degradar solo.
 *
 * La razón de la diferencia, medida y no estética: los consumidores de esta
 * unificación son detectores QUE YA EXISTEN y que hoy producen verdaderos
 * positivos reales sin grafo (`unused-variable`, `argument-mutation`,
 * `boolean-flag-param`). Si `needsGraph` fuera compuerta dura, apretar el
 * interruptor de vuelta atrás (`CK_ANALISIS_DOS_PASADAS=0`) los apagaría
 * enteros — y apagar un detector está PROHIBIDO en esta ola: esconde en vez de
 * mejorar, y esos kinds son el ancla de las hipótesis de patrón. Con la
 * semántica de ruteo, el interruptor devuelve exactamente el comportamiento de
 * hoy: el detector corre en la pasada 1, sin grafo, igual que siempre.
 */
export interface IntraGraphOptIn {
  /**
   * `true` ⇒ este detector se corre en la PASADA CON GRAFO (`ctx.graph` no
   * nulo y `ctx.graphIndex()` disponible, con el árbol vivo del archivo).
   * Ausente/`false` (el default, y lo que declaran 23 de los 24 detectores
   * `intra-*` de hoy) ⇒ corre exactamente donde corre hoy, en la pasada 1,
   * sin pagar NADA del costo de la unificación.
   *
   * INVARIANTE: un detector corre en UNA pasada, nunca en las dos (el runner
   * particiona por este campo — ver `detect/run.ts#DetectorRunInput.intraPass`
   * y `run.test.ts`). Sus hallazgos no se pueden duplicar.
   *
   * NO es una compuerta: ver el docstring de `IntraGraphOptIn`.
   */
  needsGraph?: boolean;
}

export interface IntraFunctionDetector<K extends string = string, Kind extends string = string>
  extends DetectorBase<K, Kind>,
    IntraGraphOptIn {
  scope: "intra-function";
  run(fn: FunctionUnit, ctx: RunContext<K>): readonly RawFinding[];
}

export interface IntraFileDetector<K extends string = string, Kind extends string = string>
  extends DetectorBase<K, Kind>,
    IntraGraphOptIn {
  scope: "intra-file";
  run(file: FileUnit, ctx: RunContext<K>): readonly RawFinding[];
}

export interface InterFileDetector<K extends string = string, Kind extends string = string>
  extends DetectorBase<K, Kind> {
  scope: "inter-file";
  /** `true` ⇒ no corre hasta F3; el runner reporta `sin-grafo`, nunca "cero hallazgos". */
  needsGraph: boolean;
  /**
   * Aristas TIPADAS (`graph/types.ts#EdgeKind`) que este detector necesita
   * ver TODAS en `repo.graph.edges` para considerarse "corrió de verdad" —
   * ver DIAGNÓSTICO-5B §5, Problema 3: varios detectores dependen de aristas
   * que `EDGE_EXTRACTORS`/los 6 extractores tipados todavía no producen en
   * producción y devolvían `[]` en silencio, indistinguible de "corrió y no
   * encontró nada".
   *
   * ES UNA CONJUNCIÓN (AND) ESTRICTA — y ESTE campo es EXCLUSIVAMENTE para
   * conjunción; para alternativa existe `needsAnyEdge` (abajo), un campo
   * DISTINTO. Declarado y CUALQUIERA de estos `kind` está ausente del grafo
   * (aunque otro de la lista sí esté) ⇒ el runner reporta `sin-aristas` con
   * `missingEdgeKinds` = el subconjunto declarado que faltó, sin ejecutar
   * `run()`. Es lo que hace que `missingEdgeKinds` pueda ser un subconjunto
   * propio (útil: "te faltan 2 de las 3 que declaraste"), no siempre la
   * lista entera. Ausente/vacío (default) ⇒ este chequeo no aplica.
   *
   * *** REGRESIÓN MEDIDA, LA RAZÓN DE QUE ESTE PÁRRAFO EXISTA — Ola 11b,
   * frente B0. *** La versión anterior de este docstring guiaba a declarar
   * acá un "vocabulario CERRADO" cada vez que un detector usaba EXACTAMENTE
   * un conjunto fijo de kinds, sin distinguir SI el detector necesitaba
   * TODOS esos kinds A LA VEZ (conjunción real) o si le alcanzaba con
   * CUALQUIERA de ellos (alternativa dentro de un vocabulario cerrado). Tres
   * detectores se declararon mal por seguir esa guía al pie de la letra —
   * `speculative-abstraction` (cuenta un origen "es-un" vía `extends` O
   * `implements` O `satisfies`, cualquiera alcanza), `unstable-dependency`
   * (mide inestabilidad sobre aristas `imports` O `extends` O `implements`,
   * cualquiera alcanza) y `parallel-hierarchies` (agrupa familias por
   * `extends` O `implements`, cualquiera alcanza) — y el AND de este runner
   * los apagaba enteros cuando a un repo real le faltaba UN SOLO kind de la
   * lista (Ruby no tiene `implements`/`satisfies`; TypeScript en este repo
   * casi no tiene `extends` real — hereda de `Error`, un global sin nodo).
   * Medido neutralizando el gate: 5 hallazgos verdaderos volvían (4 de
   * `speculative-abstraction` en Rails + 1 en `src/`, 1 de
   * `unstable-dependency` en `src/`) — "cero" leído como "no aplicable"
   * cuando en realidad el detector SÍ tenía insumo real, sólo que por una
   * vía alternativa del vocabulario. Ver el resultado de la tarea que dejó
   * este comentario para la corrida completa.
   *
   * CÓMO NO VOLVER A CONFUNDIRLO — mirá el FILTRO REAL dentro de `run()`,
   * NUNCA el docstring del módulo (este repo tiene docstrings vencidos que
   * afirman cosas falsas desde hace olas):
   *   - `algo.kind === "a" || algo.kind === "b"` / `SET.has(edge.kind)` sobre
   *     un `Set` de varios kinds usado para decidir si UNA arista cualquiera
   *     cuenta como testigo de la relación ⇒ los kinds de ese `Set` juegan el
   *     MISMO ROL (formas alternativas de testimoniar la MISMA relación) ⇒
   *     van en `needsAnyEdge`, nunca acá.
   *   - Dos (o más) aristas de kinds DISTINTOS que la MISMA instancia de un
   *     hallazgo necesita a la vez, cada una jugando un ROL DIFERENTE (p.ej.
   *     `concrete-over-abstraction`: una arista `references` A→B, de rol
   *     "uso", Y una arista `implements`/`satisfies` B→I, de rol
   *     "abstracción disponible" — sin las DOS no hay candidato) ⇒ ESO es
   *     conjunción real, y va acá. Cuando la relación combina un rol
   *     obligatorio con un rol alternativo (ese mismo ejemplo: el rol
   *     "abstracción disponible" admite `implements` O `satisfies`), los dos
   *     campos se declaran JUNTOS en el mismo detector — `needsEdges` con el
   *     rol obligatorio, `needsAnyEdge` con el grupo alternativo — nunca se
   *     fuerza todo a uno solo.
   *
   * QUÉ MÁS DECLARAR ACÁ (esto no cambió):
   *   - Unión GENÉRICA "cualquier arista de dependencia real" (heredada de un
   *     helper compartido de `graph/metrics/*`, o un filtro propio
   *     `kind !== "contains"`): declarar sólo `"references"`, el kind más
   *     universal y el que de verdad sostiene la señal en la práctica — exigir
   *     TODA la unión (que en muchos repos/lenguajes nunca está completa,
   *     p.ej. un repo sin `mixes-in`) produciría `sin-aristas` incluso cuando
   *     el detector está genuinamente funcionando con señal real. (Es un caso
   *     particular de "rol único, un solo kind mandatorio": con un solo
   *     elemento, `needsEdges`/`needsAnyEdge` son indistinguibles en
   *     comportamiento, así que declararlo acá es la convención.)
   *   - `"contains"` NUNCA se declara: es la arista estructural de fondo
   *     (carpeta→archivo→símbolo) que todo grafo no vacío tiene por
   *     construcción — su ausencia total sería un grafo roto, un caso ya
   *     cubierto por `needsGraph`/`repo.files.length === 0`, no por este
   *     campo.
   *   - Un kind usado sólo para AJUSTAR CONFIANZA/SEVERIDAD, o para EXCLUIR
   *     candidatos que ya tienen otra cosa (nunca para decidir si se emite un
   *     hallazgo), no se declara en ninguno de los dos campos: su ausencia no
   *     impide que el detector encuentre algo, sólo que lo module.
   *
   * `needs-edges-audit.test.ts` es la compuerta MECÁNICA que audita, para
   * cada detector `inter-file`, que todo `EdgeKind` que su código realmente
   * lee esté en `needsEdges`, en `needsAnyEdge`, o excluido con razón
   * explícita — nunca mudo por omisión.
   */
  needsEdges?: readonly EdgeKind[];
  /**
   * ALTERNATIVA (OR) — lo que `needsEdges` NO puede expresar sin mentir.
   * Declarado y NINGUNO de estos `EdgeKind`s está presente en
   * `repo.graph.edges` ⇒ el runner reporta `sin-aristas` con
   * `missingEdgeKinds` = la lista COMPLETA declarada (a diferencia de
   * `needsEdges`, acá no hay un subconjunto más chico que reportar: como
   * ninguno alcanzó, los declaró todos "faltantes" por igual — no hay forma
   * de saber cuál de ellos, si hubiera aparecido, habría bastado). Con que
   * UNO SOLO de estos kinds esté presente, este chequeo pasa entero y
   * `run()` se ejecuta — los demás kinds de la lista pueden faltar sin que
   * eso importe. Ausente/vacío (default) ⇒ este chequeo no aplica.
   *
   * Ver el párrafo largo de `needsEdges` de arriba ("CÓMO NO VOLVER A
   * CONFUNDIRLO") para el criterio completo de cuál de los dos campos usar —
   * en una frase: si en el `run()` real de este detector los kinds de la
   * lista están unidos por `||`/`Set.has()` para decidir si UNA arista
   * cualquiera testimonia la relación, es este campo; si hacen falta TODOS a
   * la vez para una misma instancia del hallazgo, es `needsEdges`. Los dos
   * campos pueden declararse juntos en el mismo detector cuando su relación
   * combina un rol obligatorio con un rol alternativo.
   *
   * Mismas dos exclusiones que `needsEdges`: `"contains"` nunca se declara
   * (arista de fondo, cubierta por `needsGraph`), y un kind que sólo AJUSTA
   * confianza/severidad o EXCLUYE candidatos (nunca decide si se emite un
   * hallazgo) tampoco se declara acá.
   */
  needsAnyEdge?: readonly EdgeKind[];
  /**
   * Ids de métrica (`graph/metrics/registry.ts#GRAPH_METRICS`) que este
   * detector necesita resueltos en `repo.metrics`. Mismo principio que
   * `needsEdges`: declarado y con al menos uno ausente de `repo.metrics`
   * ⇒ `sin-metricas`, nunca cero disfrazado de "corrió". Ausente/vacío
   * (default) ⇒ este chequeo no aplica.
   */
  needsMetrics?: readonly string[];
  run(repo: RepoUnit, ctx: RunContext<K>): readonly RawFinding[];
}

export type Detector = IntraFunctionDetector | IntraFileDetector | InterFileDetector;

/* ────────────────────────────────────────────────────────────────────────
 * Cobertura — cómo viaja "no aplicable" hasta la UI (§1.7)
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * `sin-aristas`/`sin-metricas` — LAS DOS COMPUERTAS QUE FALTABAN
 * (DIAGNÓSTICO-5B §5, Problema 3, tarea de esta ola): "no aplicable" ya
 * distinguía "no corre en este lenguaje" de "corrió y no encontró nada"
 * para capacidades de LENGUAJE, pero un detector `inter-file` que depende
 * de una arista tipada o de una métrica de grafo ausente reportaba
 * `corrio, 0 hallazgos` — indistinguible de uno que sí miró. Mismo
 * principio que `sin-grafo` (que ya existía): el análisis no llegó a
 * intentarlo de verdad, no que miró y no había nada.
 */
export type CoverageStatus =
  | "corrio"
  | "no-aplicable"
  | "sin-grafo"
  | "sin-aristas"
  | "sin-metricas"
  | "presupuesto-agotado"
  | "error";

export interface DetectorCoverage {
  detectorId: string;
  title: string;
  scope: Scope;
  kind: CodeFindingKind;
  /** Presente para intra-*: la cobertura es POR LENGUAJE. Ausente para inter-file. */
  language?: string;
  status: CoverageStatus;
  /** Sólo con status "no-aplicable": qué capacidad falta. Nunca vacío en ese caso. */
  missingCapabilities?: readonly Capability[];
  /**
   * Sólo con status "sin-aristas": qué `EdgeKind`s declarados no aparecieron
   * en el grafo. Nunca vacío en ese caso. Si el detector falló por
   * `needsEdges` (conjunción), es el subconjunto propio de los que faltaron
   * — puede ser menos que toda la lista declarada. Si falló por
   * `needsAnyEdge` (alternativa), es la lista COMPLETA declarada — ninguno
   * alcanzó, así que no hay un subconjunto más chico que nombrar.
   */
  missingEdgeKinds?: readonly EdgeKind[];
  /** Sólo con status "sin-metricas": qué ids de métrica declarados no estaban resueltos. Nunca vacío en ese caso. */
  missingMetrics?: readonly string[];
  unitsConsidered: number;
  findings: number;
  error?: string;
}
