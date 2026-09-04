/**
 * El bucle Finding × builder — CONTRATO-F6.md §1.6:
 *
 *   para cada Finding f:
 *     para cada builder b en HYPOTHESES donde b.anchors.includes(f.kind):
 *       h = b.build(f, repo.graph, ctx)
 *       si h !== null → f.hypotheses.push(h)
 *
 * `Finding.hypotheses` se llena EN ESTE ÚNICO LUGAR, jamás en un detector —
 * el docstring de `detect/types.ts` ya lo exige y esto lo cumple.
 *
 * P2 (esta ola) — CABLEADO REAL: este módulo mismo no cambió (el campo
 * `files` ya estaba diseñado, sin usar); lo que cambió es el CALLER.
 * `code-analyzer.ts` ahora llama `attachHypotheses` DOS veces, cada una con
 * lo que de verdad tiene vivo en ese punto:
 *
 *   1. Dentro de `analyzeFile`, por archivo, ANTES de `tree.delete()`, con
 *      `files: [fileUnit]` — el único momento en que existe un árbol vivo.
 *      Cubre los findings `intra-function`/`intra-file` de ESE archivo (los
 *      únicos que `analyzeFile` calcula). `ctx.file`/`ctx.fileAt(esta misma
 *      ruta)` quedan poblados ahí; `repo.graph` es `null` (el grafo del repo
 *      todavía no existe a esa altura).
 *   2. Dentro de `crossAnalyze`, sobre `interFile.findings` ÚNICAMENTE (ya
 *      NO sobre `perFileFindings`, que ya pasaron por (1) — repetirlos acá
 *      pisaría, con un resultado peor por falta de árbol, el que ya se
 *      calculó con árbol vivo: ver `strategy.ts`, único builder con un
 *      camino permisivo cuando falta el árbol). Acá `repo.graph` SÍ es real
 *      (compilado más arriba en `crossAnalyze`).
 *
 * R1 (`RAICES.md`) — EL LÍMITE DE ARRIBA YA NO EXISTE. Hasta esa tarea,
 * `ctx.file`/`ctx.fileAt` eran SIEMPRE `null` en la llamada (2): ningún
 * finding `inter-file` tiene "un" archivo (su `language` casi siempre es
 * `null`, ver `detect/run.ts#findingLanguage`), y `analyzeFile` ya había
 * liberado el árbol de CADA archivo antes de que `crossAnalyze` corriera —
 * la raíz nombrada por `RAICES.md`. R1 la cierra reparseando BAJO DEMANDA
 * (`code-analyzer.ts#resolveLiveFileUnit`): antes de la llamada (2),
 * `crossAnalyze` junta el conjunto de `locations[].file` de TODOS los
 * `Finding`s `inter-file` de esta corrida (el conjunto de archivos que su
 * EVIDENCIA toca — nunca "todo el repo") y reparsea cada uno, pasando el
 * resultado como `input.files` acá. Esto también resuelve el caso de
 * `null-object`/`prototype` (necesitaban DOS archivos vivos a la vez,
 * target+origin): ambos quedan en `input.files` porque los dos viven en
 * `locations` del MISMO `Finding` — no hace falta un mecanismo por-hipótesis,
 * un `files` compartido para todo el lote alcanza. Los árboles se liberan
 * apenas la llamada (2) termina (ver `crossAnalyze`), así que el costo es
 * tiempo (un reparseo de más, sólo para los archivos realmente tocados) MÁS
 * memoria proporcional a esos archivos — acá decía "nunca memoria (nunca más
 * que unos pocos árboles vivos a la vez)" y es falso: `crossAnalyze` junta el
 * conjunto ENTERO antes de llamar acá, medido en 78 árboles vivos a la vez
 * sobre el Rails y 92 sobre `src/` (pico de RSS +16 % / +33 %). Los números
 * completos y qué hacer si algún día aprieta, en el docstring de
 * `code-analyzer.ts#resolveLiveFileUnit`.
 *
 * CONTRATO-F9.md §1 — `ctx.neighborhood`/`ctx.branches` (F0/Cimientos):
 *   - `neighborhood`: si `input.neighborhoodIndex` está presente, es
 *     `neighborhoodFor(index, finding)` — el índice REAL, construido UNA vez
 *     por corrida en `code-analyzer.ts#crossAnalyze` sobre el grafo YA
 *     ensanchado con nodos de hallazgo (`attachFindingNodes`). Si está
 *     ausente (la llamada (1) de arriba, dentro de `analyzeFile`, ANTES de
 *     que el grafo del repo exista), es `EMPTY_NEIGHBORHOOD` — misma clase
 *     de límite que `repo.graph === null` ahí: no hay índice repo-completo
 *     que construir todavía, y no lo va a haber NUNCA en esa llamada — es
 *     arquitectural, no un descuido (el grafo se arma recién en
 *     `crossAnalyze`, después de que TODOS los archivos pasaron por
 *     `analyzeFile`; construirlo antes violaría "UNA vez por corrida", el
 *     costo que este mismo módulo debe respetar). Este es el `ctx.neighborhood`
 *     que ve la llamada (1): SIEMPRE `EMPTY_NEIGHBORHOOD`, decisión permanente.
 *
 *     OLA V (frente V1) — EL LÍMITE DE `repo.graph === null` YA NO EXISTE
 *     PARA LAS ANCLAS INTRA. La llamada (1) sigue viendo `repo.graph === null`
 *     y `EMPTY_NEIGHBORHOOD` (es arquitectural, ver arriba), pero ya no es la
 *     última palabra: `crossAnalyze` corre después
 *     `rebuildHypothesesWithGraph` (exportada más abajo) sobre esos mismos
 *     `Finding`s, reviviendo su árbol con `resolveLiveFileUnit` y con el
 *     grafo del repo YA construido — la misma maquinaria de dos pasadas que
 *     la Ola N montó para los detectores `intra-*`
 *     (`ola-n/CONTRATO-UNIFICACION.md`), aplicada al `build()` de las
 *     hipótesis. El contrato completo, y por qué ahí sí se puede volver a
 *     llamar a `build()`, está en el docstring de esa función y en
 *     `ola-v/CONTRATO-GRAFO-HIPOTESIS.md`.
 *
 *     Ola 10 — CERRADO EL LÍMITE DE ARRIBA, sin repetir `build()`:
 *     `refreshHypotheses` (exportada más abajo) es una TERCERA función,
 *     llamada por `crossAnalyze` DESPUÉS de `attachFindingNodes`/
 *     `buildNeighborhoodIndex`, sobre `perFileFindings` (los mismos que
 *     recibieron `build()` con árbol vivo en la llamada (1)). No es
 *     "`attachHypotheses` de nuevo": nunca vuelve a llamar `builder.build`
 *     (que reevaluaría `required`/`appliedState` con `ctx.file === null`,
 *     arriesgando revertir una exclusión que la llamada (1) sí pudo
 *     confirmar con árbol vivo) — sólo llama al `builder.refresh` opcional
 *     de cada hipótesis YA construida, que por contrato (`hypotheses/types.ts`)
 *     jamás toca `state`/`checks`, sólo `discriminators`/`confidence`. Ver su
 *     propio docstring para el detalle completo.
 *   - `branches`: SIEMPRE `() => null` en este cableado — la derivación real
 *     (recorrer `ctx.file` con `sets.chainNodes`/`switchContainerNodes`) es
 *     trabajo de F1 (CONTRATO-F9.md §1.3), con `strategy.ts`/`state.ts` como
 *     prueba. `null` es el default seguro: "no se sabe", nunca `[]` (que
 *     afirmaría falsamente "no hay ramas").
 */
import type { DerivedNodeSets } from "../code-grammar.js";
import type { Capability } from "../detect/capabilities.js";
import type { Finding, FileUnit, RepoUnit } from "../detect/types.js";
import { EMPTY_NEIGHBORHOOD, neighborhoodFor, type NeighborhoodIndex } from "../graph/neighborhood.js";
import { arbitrateRivalHypotheses } from "./engine.js";
import { HYPOTHESES } from "./registry.js";
import type { BranchFacts, HypothesisBuilder, HypothesisContext, PatternHypothesis, PatternHypothesisDraft } from "./types.js";

/** Todos los conjuntos vacíos — lo que `ctx.setsFor` devuelve para un
 *  lenguaje que esta corrida no resolvió (nunca lanza). Con capacidades
 *  igualmente vacías para ese caso, cualquier hipótesis con `needs` no
 *  vacío ya se reporta no-aplicable ANTES de llegar a usar `sets`. */
const EMPTY_NODE_SETS: DerivedNodeSets = {
  functionNodes: new Set(),
  branchNodes: new Set(),
  chainNodes: new Set(),
  cloneNodes: new Set(),
  classNodes: new Set(),
  nestingNodes: new Set(),
  constructorNodes: new Set(),
  exceptionNodes: new Set(),
  switchContainerNodes: new Set(),
};

export interface HypothesesRunInput {
  findings: readonly Finding[];
  repo: RepoUnit;
  /** Capacidades y sets por lenguaje, MISMA forma que `DetectorRunInput.languages` (`detect/run.ts`). */
  languages: ReadonlyMap<string, { capabilities: ReadonlySet<Capability>; sets: DerivedNodeSets }>;
  /** Archivos vivos disponibles esta corrida. P2: `code-analyzer.ts` lo llena
   *  con `[fileUnit]` en su llamada dentro de `analyzeFile` (un único archivo,
   *  el que está vivo en ese momento); lo deja ausente en su llamada dentro de
   *  `crossAnalyze` (ningún árbol vivo ahí) — ver el docstring del módulo. */
  files?: readonly FileUnit[];
  /**
   * NUEVO, CONTRATO-F9.md §1. El índice del vecindario de ESTA corrida —
   * `graph/neighborhood.ts#buildNeighborhoodIndex`, construido UNA vez en
   * `code-analyzer.ts#crossAnalyze`. Ausente ⇒ todo `Finding` recibe
   * `EMPTY_NEIGHBORHOOD` (ver el docstring del módulo para cuándo pasa esto
   * en el cableado real de hoy).
   */
  neighborhoodIndex?: NeighborhoodIndex;
  /** Sólo para tests: correr contra un registro distinto de `HYPOTHESES`. */
  registry?: readonly HypothesisBuilder[];
}

/** CONTRATO-F9.md §1.3 — placeholder seguro hasta que F1 implemente la derivación real. Ver el docstring del módulo. */
function noBranchesYet(): readonly BranchFacts[] | null {
  return null;
}

/** Unión de capacidades de TODOS los lenguajes presentes — mismo criterio
 *  que `detect/run.ts#unionCapabilities` (no importado: es privado ahí, y
 *  esta tarea no toca `detect/*`), para un `Finding` inter-file cuyo
 *  `language` es `null`. */
function unionCapabilities(languages: HypothesesRunInput["languages"]): ReadonlySet<Capability> {
  const union = new Set<Capability>();
  for (const { capabilities } of languages.values()) {
    for (const cap of capabilities) union.add(cap);
  }
  return union;
}

/** OLA V — `?? ""` defensivo: `contextFor` (abajo) lo llama también desde
 *  `refreshHypotheses`, que antes fijaba `file: null` a mano y por lo tanto
 *  nunca miraba `locations`. Una ruta vacía no matchea ningún archivo vivo, así
 *  que el resultado es el mismo `null` de siempre — pero sin tirar. */
function primaryPath(finding: Finding): string {
  return finding.locations[0]?.file ?? "";
}

/**
 * OLA V, FRENTE V1 — los `Finding` de esta corrida que MERECEN una segunda
 * pasada con el grafo, agrupados por el archivo cuyo árbol hay que revivir.
 *
 * QUÉ INTENCIÓN CONTESTA: *"¿de qué archivos hay que pagar un reparseo para
 * que alguna hipótesis pueda mirar el grafo del repo?"* — y la respuesta la
 * da el REGISTRO, no una lista de kinds escrita a mano acá: un `Finding`
 * entra si y sólo si algún `HypothesisBuilder` lo declara en sus `anchors`.
 * Un hallazgo sin ancla registrada no puede producir una hipótesis ni hoy ni
 * después de agregar un patrón nuevo, así que reparsear su archivo sería
 * costo puro. Ése es el ÚNICO acotamiento que se aplica, y es COMPLETO (no
 * pierde nada): no se acota por "estos patrones usan el grafo y estos no",
 * que sería un enumerado de mecanismos — la clase de parche que la Ola U
 * documentó como el que la ola siguiente rompe.
 *
 * El caller (`code-analyzer.ts#crossAnalyze`) recorre este mapa archivo por
 * archivo, revive UN árbol por vez y llama a `rebuildHypothesesWithGraph`.
 */
export function findingsNeedingGraphPass(
  findings: readonly Finding[],
  registry: readonly HypothesisBuilder[] = HYPOTHESES,
): ReadonlyMap<string, Finding[]> {
  const anchored = new Set<string>();
  for (const b of registry) for (const k of b.anchors) anchored.add(k);

  const byPath = new Map<string, Finding[]>();
  for (const finding of findings) {
    if (!anchored.has(finding.kind)) continue;
    if (finding.locations.length === 0) continue;
    const path = primaryPath(finding);
    const bucket = byPath.get(path);
    if (bucket) bucket.push(finding);
    else byPath.set(path, [finding]);
  }
  return byPath;
}

/**
 * OLA BA, FRENTE BA1 — EL ESTAMPADO DE LA CAPA, el UNICO sitio donde una
 * hipotesis pasa de `PatternHypothesisDraft` (lo que un builder sabe construir)
 * a `PatternHypothesis` (lo que viaja). La capa NO la elige la hipotesis: la
 * declara su builder, una sola vez, en `HypothesisBuilder.layer` (obligatorio
 * — el compilador lo exige), y de ahi sale sin que nadie la pueda reescribir.
 * Por eso `PatternHypothesis.layer` es obligatorio y `toPublicHypothesis`
 * (`code-analyzer.ts`) puede copiarlo sin `??` ni default: no existe un camino
 * por el que una hipotesis llegue al cliente sin capa.
 *
 * `{ ...draft }` copia por REFERENCIA los campos internos (`refreshState`
 * incluido, que puede apuntar al propio `Finding` — ver `code-inspector.ts`):
 * la identidad que esa maquinaria necesita se conserva intacta.
 */
function conCapa(draft: PatternHypothesisDraft, builder: HypothesisBuilder): PatternHypothesis {
  return { ...draft, layer: builder.layer };
}

/** El `HypothesisContext` de una corrida — lo comparten las tres pasadas
 *  (`attachHypotheses`, `rebuildHypothesesWithGraph`, `refreshHypotheses`),
 *  para que la única diferencia entre ellas sea QUÉ DATOS tienen a mano y
 *  nunca cómo se arma el contexto con esos datos. */
function contextFor(
  finding: Finding,
  input: HypothesesRunInput,
  fileAt: (path: string) => FileUnit | null,
  unionCaps: ReadonlySet<Capability>,
): HypothesisContext {
  return {
    file: fileAt(primaryPath(finding)),
    fileAt,
    repo: input.repo,
    capabilities: finding.language
      ? (input.languages.get(finding.language)?.capabilities ?? new Set<Capability>())
      : unionCaps,
    setsFor: (language: string) => input.languages.get(language)?.sets ?? EMPTY_NODE_SETS,
    neighborhood: input.neighborhoodIndex ? neighborhoodFor(input.neighborhoodIndex, finding) : EMPTY_NEIGHBORHOOD,
    branches: noBranchesYet,
  };
}

/**
 * Cuelga hipótesis de los `Finding`s que ya tienen anclas registradas. Muta
 * `finding.hypotheses` in-place (no hay otro sitio donde vivan) — sólo en
 * los que reciben al menos una hipótesis no-nula; el resto queda `undefined`,
 * exactamente como estaba (ausencia de hueco, no un array vacío disfrazado).
 */
export function attachHypotheses(input: HypothesesRunInput): void {
  const registry = input.registry ?? HYPOTHESES;
  if (registry.length === 0) return;

  const filesByPath = new Map((input.files ?? []).map((f) => [f.path, f] as const));
  const fileAt = (path: string): FileUnit | null => filesByPath.get(path) ?? null;
  const unionCaps = unionCapabilities(input.languages);

  for (const finding of input.findings) {
    const applicable = registry.filter((b) => b.anchors.includes(finding.kind));
    if (applicable.length === 0) continue;

    // R1 (`RAICES.md`) — ANTES: `finding.language ? fileAt(...) : null`, así
    // que un `Finding` `inter-file` (`language` casi siempre `null`, ver
    // `detect/run.ts#findingLanguage`) tenía `ctx.file` FORZADO a `null`
    // incluso cuando `input.files` sí traía el árbol de su archivo primario —
    // el gate miraba el campo equivocado. `fileAt` YA sabe devolver `null`
    // cuando el archivo no está vivo esta corrida (ver su definición arriba);
    // no hace falta un segundo gate por `language` encima. Esto es lo que
    // permite que `crossAnalyze` (que ahora sí puebla `input.files` con los
    // archivos que la evidencia `inter-file` toca, vía `resolveLiveFileUnit`)
    // le entregue `ctx.file` real a una hipótesis anclada en un `Finding`
    // `inter-file` por primera vez. Vive en `contextFor` (arriba), compartido
    // con la pasada de grafo.
    const ctx = contextFor(finding, input, fileAt, unionCaps);

    const built: PatternHypothesis[] = [];
    for (const builder of applicable) {
      const h = builder.build(finding, input.repo.graph, ctx);
      if (h) built.push(conCapa(h, builder));
    }
    // Bug 2 de "tres bugs de mecanismo" (`RAICES.md`) — cada builder arriba
    // construye su hipótesis EN AISLAMIENTO; acá, y sólo acá, están TODAS las
    // de este `Finding` juntas por primera vez. `arbitrateRivalHypotheses`
    // (`engine.ts`) descarta una OPORTUNIDAD (`ausente`/`parcial`) de un
    // patrón cuando OTRO patrón sobre el MISMO ancla ya CONFIRMÓ
    // estructuralmente (`ya-aplicado`/`aplicado-eludido`) que su forma existe
    // — ver el docstring de esa función para el caso medido
    // (`hookable.rb:255`, State enterrado por Strategy). No-op cuando hay
    // 0 ó 1 hipótesis (la inmensa mayoría de los casos).
    if (built.length > 0) finding.hypotheses = arbitrateRivalHypotheses(built);
  }
}

/**
 * OLA V, FRENTE V1 — LA PASADA DE GRAFO DE LAS HIPÓTESIS.
 *
 * QUÉ INTENCIÓN VERIFICA ESTA PASADA (la frase que el CONTEXTO de la ola
 * exige poder escribir): *"¿la afirmación que esta hipótesis hace sobre el
 * repo se sostiene cuando se la mira con el REPO ENTERO a la vista, y no
 * sólo con el archivo?"* Hasta esta ola, toda hipótesis anclada en un
 * `Finding` `intra-function`/`intra-file` — Strategy, Chain of
 * Responsibility, Decorator, Composite, State, Builder, Factory Method,
 * Observer y la mitad de Template Method — se construía DENTRO de
 * `analyzeFile`, donde `repo.graph` es `null` por construcción (el grafo del
 * repo recién se arma en `crossAnalyze`, de los hechos de TODOS los
 * archivos). Sus caminos de grafo — `strategy.ts#structuralStrategyEvidence`,
 * `decorator.ts#graphOverride`, y los equivalentes de CoR y Composite —
 * estaban escritos, probados y **INERTES en producción**: el propio docstring
 * de cada uno lo declaraba, ola tras ola.
 *
 * ES EL MISMO PROBLEMA DE ORDEN QUE LA OLA N RESOLVIÓ PARA LOS DETECTORES
 * (`ola-n/CONTRATO-UNIFICACION.md`): el AST vivo y el grafo no coexisten.
 * Y se resuelve con la MISMA maquinaria, no con una nueva: `crossAnalyze`
 * revive el árbol de un archivo bajo demanda (`resolveLiveFileUnit`), ya con
 * el grafo construido, y vuelve a preguntar. Lo único propio de acá es QUÉ se
 * vuelve a preguntar: `builder.build`, entero.
 *
 * POR QUÉ ACÁ SÍ SE PUEDE VOLVER A LLAMAR `build()`, Y EN `refreshHypotheses`
 * NO. El argumento que prohíbe re-construir en `refreshHypotheses` (ver su
 * docstring, más abajo) no es "no se puede llamar dos veces a `build`": es
 * "no se puede llamar con un contexto PEOR", porque un `required` permisivo
 * ante la falta de árbol (`strategy.ts#notStateCheck`) revertiría en silencio
 * una exclusión que la primera pasada sí pudo confirmar. Esta pasada no tiene
 * ese problema porque su contexto es **estrictamente mejor en todos los ejes
 * a la vez**, y eso es una PRECONDICIÓN, no una esperanza:
 *
 *   | eje            | pasada 1 (`analyzeFile`) | esta pasada           |
 *   |----------------|--------------------------|-----------------------|
 *   | `ctx.file`     | árbol vivo               | árbol vivo (revivido) |
 *   | `graph`        | **`null` SIEMPRE**       | el grafo del repo     |
 *   | `ctx.repo`     | `RepoUnit` vacío         | el `RepoUnit` real    |
 *   | `ctx.neighborhood` | `EMPTY_NEIGHBORHOOD` | el índice real        |
 *
 * La precondición del árbol vivo se VERIFICA, no se supone: un `Finding`
 * cuyo archivo primario no está en `input.files` (no se pudo releer, no se
 * pudo parsear) se SALTEA y queda exactamente como lo dejó la pasada 1 —
 * nunca se lo re-evalúa con `ctx.file === null`, que es justo el caso peor.
 *
 * POR QUÉ PUEDE **RETIRAR** UNA HIPÓTESIS, y por qué eso es el punto y no un
 * efecto colateral: `refresh()` no puede retirar nada (es el pedido huérfano
 * que el informe de la Ola U cita en `run.ts:279-287`), así que una promesa
 * que el grafo desmiente se seguía publicando como recomendación. Acá, si
 * `build()` con TODA la evidencia devuelve `null` —su `required` no se
 * sostiene—, la hipótesis se retira: `finding.hypotheses` vuelve a
 * `undefined`, la misma ausencia de hueco que tendría si nunca hubiera
 * existido. Emitir con menos evidencia y callar con más sería exactamente al
 * revés.
 *
 * DEVUELVE los `Finding` que de verdad re-evaluó (los que tenían árbol vivo).
 * El caller los usa para NO pasarlos por `refreshHypotheses`: ahí `ctx.file`
 * es `null`, así que refrescar después de esta pasada recalcularía los
 * discriminadores con MENOS datos de los que acaban de usarse — el mismo
 * "pisar lo mejor con lo peor", una pasada más tarde.
 */
export function rebuildHypothesesWithGraph(
  input: HypothesesRunInput & { neighborhoodIndex: NeighborhoodIndex },
): readonly Finding[] {
  const registry = input.registry ?? HYPOTHESES;
  if (registry.length === 0) return [];

  const filesByPath = new Map((input.files ?? []).map((f) => [f.path, f] as const));
  const fileAt = (path: string): FileUnit | null => filesByPath.get(path) ?? null;
  const unionCaps = unionCapabilities(input.languages);

  const rebuilt: Finding[] = [];
  for (const finding of input.findings) {
    const applicable = registry.filter((b) => b.anchors.includes(finding.kind));
    if (applicable.length === 0) continue;
    // La precondición, verificada: sin árbol vivo esta pasada NO es mejor que
    // la primera, así que no toca nada.
    if (finding.locations.length === 0 || !fileAt(primaryPath(finding))) continue;

    const ctx = contextFor(finding, input, fileAt, unionCaps);
    const built: PatternHypothesis[] = [];
    for (const builder of applicable) {
      const h = builder.build(finding, input.repo.graph, ctx);
      if (h) built.push(conCapa(h, builder));
    }
    // Mismo arbitraje que `attachHypotheses`: es la única capa que ve todas
    // las hipótesis de un mismo `Finding` juntas, y el conjunto que ve acá es
    // el que se publica.
    finding.hypotheses = built.length > 0 ? arbitrateRivalHypotheses(built) : undefined;
    rebuilt.push(finding);
  }
  return rebuilt;
}

/**
 * Ola 10 — CONTRATO-F10.md / registro de pendientes §B1, "el vecindario que
 * no llegaba a nadie". Segunda pasada, SOLO sobre `Finding`s que YA
 * recibieron `build()` con árbol vivo (llamada (1) del docstring de arriba,
 * dentro de `analyzeFile`) — nunca sobre los `inter-file`, que
 * `attachHypotheses` (llamada (2)) ya procesa con `ctx.neighborhood` REAL
 * desde que ese cableado existe. `neighborhoodIndex` es OBLIGATORIO acá (a
 * diferencia de `attachHypotheses`): sin vecindario real no hay nada que
 * esta pasada pueda mejorar, y el único llamador
 * (`code-analyzer.ts#crossAnalyze`) sólo la invoca después de construirlo —
 * UNA vez por corrida, nunca por hallazgo ni por archivo (`buildNeighborhoodIndex`
 * ya paga ese costo una sola vez, más arriba).
 *
 * POR QUÉ esto NO es "attachHypotheses de nuevo, con más datos": acá
 * `ctx.file` es SIEMPRE `null` (los árboles de `analyzeFile` ya se
 * liberaron antes de que `crossAnalyze` corriera). Volver a llamar
 * `builder.build` con ese `ctx` degradado podría dar un resultado PEOR que
 * el de la primera pasada para cualquier check que dependiera del árbol —
 * el fallback permisivo que `strategy.ts#notStateCheck` documenta
 * (`ctx.file` ausente ⇒ "se asume, SIN CONFIRMAR") se volvería alcanzable en
 * PRODUCCIÓN por primera vez, revirtiendo silenciosamente una exclusión real
 * (State en vez de Strategy) que la primera pasada sí pudo confirmar. Por
 * eso esta función NUNCA llama a `builder.build`: sólo a `builder.refresh`
 * (opcional — ver `hypotheses/types.ts`), que por contrato jamás toca
 * `state`/`checks`, sólo `discriminators`/`confidence`
 * (`engine.ts#refreshDiscriminators`). Un builder sin `refresh` deja sus
 * hipótesis intactas acá — comportamiento idéntico al de antes de que este
 * mecanismo existiera.
 *
 * Muta `finding.hypotheses` in-place, igual que `attachHypotheses` — sólo
 * cuando al menos un builder devolvió una versión refrescada; si ninguno lo
 * hizo (todos ausentes de `refresh`, o todos devolvieron `null`), el array
 * no se toca ni se reasigna.
 */
export function refreshHypotheses(input: HypothesesRunInput & { neighborhoodIndex: NeighborhoodIndex }): void {
  const registry = input.registry ?? HYPOTHESES;
  if (registry.length === 0) return;

  // Un builder por nombre de patrón — `registries.test.ts` (invariante de
  // ids únicos) ya garantiza que no hay dos entradas de `HYPOTHESES` con el
  // mismo `pattern` de refactoring.guru.
  const byPattern = new Map(registry.map((b) => [b.pattern, b] as const));
  const unionCaps = unionCapabilities(input.languages);
  // OLA V — `input.files` PUEDE venir poblado, y eso es nuevo. Hasta esta ola
  // no existía forma de tener un árbol vivo acá y `ctx.file` era `null` por
  // construcción (lo decía el docstring de arriba). Ahora `crossAnalyze`
  // llama a esta función también DENTRO de su bucle de reparseo, con el
  // MISMO árbol que acaba de usar `rebuildHypothesesWithGraph`: la etapa
  // `refresh` de un builder —la que resuelve la PROMESA DIFERIDA de Template
  // Method (`template-method.ts#resolveDeferredViaGraph`)— corre por primera
  // vez con árbol vivo, y sobre todo SIGUE CORRIENDO para los hallazgos que
  // la pasada de grafo re-construyó. Sin esto, re-construir un hallazgo de
  // Template Method le devolvía su placeholder diferido y nadie lo resolvía
  // después: MEDIDO en `newtonsoft-json/Src/Newtonsoft.Json/Serialization/
  // JsonSerializerInternalReader.cs:62`, que perdía sus 4 checks confirmados
  // y su confianza. Sin `files` se comporta exactamente como antes: `fileAt`
  // devuelve `null` para todo.
  const filesByPath = new Map((input.files ?? []).map((f) => [f.path, f] as const));
  const fileAt = (path: string): FileUnit | null => filesByPath.get(path) ?? null;

  for (const finding of input.findings) {
    if (!finding.hypotheses || finding.hypotheses.length === 0) continue;

    const ctx = contextFor(finding, input, fileAt, unionCaps);

    let changed = false;
    const refreshed = finding.hypotheses.map((h) => {
      const builder = byPattern.get(h.pattern);
      if (!builder?.refresh) return h;
      const next = builder.refresh(h, finding, input.repo.graph, ctx);
      if (!next) return h;
      changed = true;
      // Re-estampado: `refresh` tambien devuelve un draft, y la capa vuelve a
      // salir del builder — nunca de lo que la hipotesis vieja traia.
      return conCapa(next, builder);
    });
    if (changed) finding.hypotheses = refreshed;
  }
}
