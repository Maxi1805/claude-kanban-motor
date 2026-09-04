/**
 * EL MOTOR — heredado de
 * `impl/spikes/motor-hipotesis/engine.ts` (veredicto VIVE, 13/13 escenarios,
 * ver `RESULTADO-v2.md` ahí). Portado, no reescrito: la lógica interna —
 * required→candidata, `appliedState` fusionado (nunca una lista plana de
 * excluders), la escalera de discriminadores, `confidence = isOpportunity ?
 * min(ceiling, ladder) : null` — es BYTE A BYTE la del spike.
 *
 * Lo que cambió al portar (documentado, ninguno toca la lógica):
 *   - Los tipos locales del spike (`Confidence`, `AppliedState`) se
 *     reemplazan por los de producción (`PatternConfidence` de
 *     `shared/types.ts`, `PatternState` de `./types.ts`) — mismos 3 y 4
 *     valores, cero semántica nueva.
 *   - El spike devolvía un `PatternHypothesis` COMPLETO desde `build()`
 *     porque era el único tipo de salida del spike. En producción
 *     `PatternHypothesis` (`./types.ts`) tiene además `places`/`cost`/
 *     `anchorFindingId`/`provisional` — campos que sólo CADA hipótesis
 *     concreta puede llenar (de dónde saca sus "lugares", cuánto cuesta el
 *     refactor, de qué `Finding` cuelga). Por eso acá `build()` devuelve
 *     `EngineOutcome` (el resultado PURO del motor: estado + confianza +
 *     los tres grupos de checks, ya en la forma `PatternHypothesisCheck` que
 *     la UI consume) y cada regla lo envuelve con `toPatternHypothesis()`.
 *
 * NINGÚN archivo de hipótesis debe declarar un literal de confianza — el
 * grep de `no-declared-confidence.test.ts` audita que `confidence: "..."`
 * sólo aparezca acá.
 */
import type { PatternConfidence } from "../../../shared/types.js";
import type { Capability } from "../detect/capabilities.js";
import type { EdgeKind } from "../graph/types.js";
import type { PatternHypothesis, PatternHypothesisCheck, PatternHypothesisDraft, PatternState } from "./types.js";

/** Resultado crudo de UN check — evidencia SIEMPRE, también cuando `holds` es `false`:
 *  esa es la columna "qué NO se confirmó y por qué" que pide el producto. */
export interface CheckResult {
  holds: boolean;
  evidence: string;
}

/**
 * Un check: función angosta con firma fija — nunca un blob de JSON
 * interpretado (el spike probó esa forma y la mató: un intérprete genérico
 * necesita un operador nuevo por cada excluder real, que es exactamente la
 * opacidad que se quería evitar, escondida detrás de una capa de indirección
 * más). `P`/`G` quedan genéricos para que cada hipótesis los tipe con su
 * propia forma de problema/grafo — el motor no necesita saber qué hay adentro.
 */
export interface Check<P, G> {
  id: string;
  describe: string;
  run(problem: P, graph: G): CheckResult;
}

function toCheck<P, G>(
  check: Check<P, G>,
  role: "required" | "discriminator",
  problem: P,
  graph: G,
): PatternHypothesisCheck {
  const r = check.run(problem, graph);
  return { label: check.describe, passed: r.holds, why: r.evidence, role };
}

/**
 * Resultado de `appliedState`: decide `state` Y trae sus propios checks
 * (rol `"applied"`) — los excluders FUSIONADOS. Un excluder solo, sea cual
 * sea su forma, distingue "ya está" de "no está" (un booleano); los cuatro
 * estados dependen de CÓMO se combinan dos señales independientes (¿la
 * abstracción existe? ¿alguien la puentea?), no de si un único check
 * dispara — por eso esto es una función nombrada que devuelve un estado de
 * 4 valores, no una lista plana de checks que el motor tenga que interpretar.
 */
export interface AppliedStateResult {
  state: PatternState;
  checks: readonly PatternHypothesisCheck[];
}

/** La definición de una hipótesis — DATOS, no una función que decide sola.
 *  Heredado tal cual del spike (CONTRATO-F6.md §1.3): ningún rediseño. */
export interface HypothesisSpec<P, G> {
  pattern: string;
  /** Techo de confianza — provisional hasta re-derivar contra el corpus (K2). */
  ceiling: PatternConfidence;
  /** Capacidades del lenguaje que hacen falta para siquiera evaluar esto. */
  needs: readonly Capability[];
  /**
   * OLA A3 — el equivalente de `InterFileDetector.needsEdges` para una
   * hipótesis: `EdgeKind`s del grafo sin los que ninguno de `required`/
   * `discriminators`/`appliedState` puede evaluarse con sentido. Ausente/
   * vacío (default; ningún `<patron>.ts` de hoy lo declara todavía — mismo
   * estado en el que `needsEdges` vivió del lado de detectores antes de que
   * algo lo usara) ⇒ este chequeo no aplica, comportamiento IDÉNTICO al de
   * antes de que este campo existiera. Sólo tiene efecto si quien llama a
   * `build()` (abajo) pasa `edgeKindsPresent` — ver ese parámetro.
   */
  needsEdges?: readonly EdgeKind[];
  /** Sin esto en true para TODOS, no hay hipótesis — la firma lo garantiza. */
  required: readonly Check<P, G>[];
  /** Cada uno confirmado sube un peldaño de la escalera de confianza. */
  discriminators: readonly Check<P, G>[];
  /** Decide `ausente`/`parcial`/`ya-aplicado`/`aplicado-eludido` — ver `AppliedStateResult`. */
  appliedState(problem: P, graph: G): AppliedStateResult;
  toConfirm: readonly string[];
  source: string;
}

/** El resultado PURO del motor — sin los campos que sólo una hipótesis
 *  concreta puede llenar (`places`/`cost`/`anchorFindingId`/`provisional`). */
export interface EngineOutcome {
  state: PatternState;
  /** `null` ⇒ no aplicable (`missingCapabilities` no vacío) o el estado ya no
   *  es una oportunidad (`ya-aplicado`/`aplicado-eludido`). */
  confidence: PatternConfidence | null;
  /** No vacío ⇒ no aplicable — nunca "cero hallazgos" disfrazado. */
  missingCapabilities: readonly Capability[];
  /** OLA A3 — no vacío ⇒ "no pude evaluarme del todo" por falta de aristas, ver `HypothesisSpec.needsEdges`. */
  missingEdgeKinds: readonly EdgeKind[];
  /** `required` (rol `"required"`) + los checks de `appliedState` (rol `"applied"`). */
  checks: readonly PatternHypothesisCheck[];
  /** Separados de `checks` — cada uno confirmado sube un peldaño. */
  discriminators: readonly PatternHypothesisCheck[];
}

const LADDER: readonly PatternConfidence[] = ["baja", "media", "alta"];

function ladderStep(confirmedCount: number): PatternConfidence {
  return LADDER[Math.min(confirmedCount, LADDER.length - 1)]!;
}

function minConfidence(a: PatternConfidence, b: PatternConfidence): PatternConfidence {
  return LADDER.indexOf(a) <= LADDER.indexOf(b) ? a : b;
}

/**
 * EL CONTRATO BAJO PRUEBA EN EL SPIKE. Nótese la firma: no existe forma de
 * invocar esto sin un `problem` ya construido por otra capa — un detector de
 * patrón que dispara sin problema es inexpresable, lo garantiza el
 * compilador, no una convención de nombres. `null` ⇒ ni siquiera candidata
 * (algún `required` no se cumplió).
 */
export function build<P, G>(
  spec: HypothesisSpec<P, G>,
  capabilities: ReadonlySet<Capability>,
  problem: P,
  graph: G,
  /**
   * OLA A3 — OPCIONAL, aditivo: los `EdgeKind` presentes en el grafo de esta
   * corrida, si quien llama a `build()` los tiene a mano (ver
   * `HypothesisSpec.needsEdges`). Ausente (el default; los 17 `<patron>.ts`
   * de hoy no lo pasan) ⇒ este chequeo se salta ENTERO — comportamiento
   * IDÉNTICO al de antes de que este parámetro existiera, incluso para una
   * hipótesis que sí declare `needsEdges`: sin esta evidencia no hay forma
   * honesta de decir qué falta, así que no se afirma nada.
   */
  edgeKindsPresent?: ReadonlySet<string>,
): EngineOutcome | null {
  const missingCapabilities = spec.needs.filter((n) => !capabilities.has(n));
  if (missingCapabilities.length > 0) {
    return { state: "ausente", confidence: null, missingCapabilities, missingEdgeKinds: [], checks: [], discriminators: [] };
  }

  if (edgeKindsPresent && spec.needsEdges && spec.needsEdges.length > 0) {
    const missingEdgeKinds = spec.needsEdges.filter((k) => !edgeKindsPresent.has(k));
    if (missingEdgeKinds.length > 0) {
      return { state: "ausente", confidence: null, missingCapabilities: [], missingEdgeKinds, checks: [], discriminators: [] };
    }
  }

  const requiredResults = spec.required.map((c) => toCheck(c, "required", problem, graph));
  if (requiredResults.some((r) => !r.passed)) return null; // sin esto, ni siquiera es candidata

  const { state, checks: appliedChecks } = spec.appliedState(problem, graph);

  const discriminatorResults = spec.discriminators.map((c) => toCheck(c, "discriminator", problem, graph));
  const confirmed = discriminatorResults.filter((r) => r.passed).length;
  const laddered = ladderStep(confirmed);

  // ya-aplicado / aplicado-eludido no son oportunidades: no compiten por
  // confianza, se muestran distinto (información positiva o alerta de fuga).
  const isOpportunity = state === "ausente" || state === "parcial";
  const confidence = isOpportunity ? minConfidence(spec.ceiling, laddered) : null;

  return {
    state,
    confidence,
    missingCapabilities: [],
    missingEdgeKinds: [],
    checks: [...requiredResults, ...appliedChecks.map((c) => ({ ...c, role: "applied" as const }))],
    discriminators: discriminatorResults,
  };
}

/**
 * Envuelve un `EngineOutcome` en el `PatternHypothesis` completo que viaja a
 * la UI, agregando lo que sólo la hipótesis concreta sabe: de qué `Finding`
 * cuelga (`anchorFindingId`), sus lugares con rol (`places`) y el costo del
 * refactor (`cost`). Cada `<patron>.ts` de S1 llama esto una vez, al final de
 * su propio `build(problem, graph, ctx)` — nunca arma un `PatternHypothesis`
 * a mano.
 */
export function toPatternHypothesis<P, G>(
  spec: HypothesisSpec<P, G>,
  outcome: EngineOutcome,
  extra: {
    anchorFindingId: string;
    places: PatternHypothesis["places"];
    cost: string;
    provisional?: boolean;
  },
): PatternHypothesisDraft {
  return {
    pattern: spec.pattern,
    state: outcome.state,
    confidence: outcome.confidence,
    ceiling: spec.ceiling,
    provisional: extra.provisional ?? true,
    checks: outcome.checks,
    discriminators: outcome.discriminators,
    places: extra.places,
    toConfirm: spec.toConfirm,
    cost: extra.cost,
    source: spec.source,
    missingCapabilities: outcome.missingCapabilities,
    missingEdgeKinds: outcome.missingEdgeKinds.length > 0 ? outcome.missingEdgeKinds : undefined,
    anchorFindingId: extra.anchorFindingId,
  };
}

/**
 * Ola 10 — CONTRATO-F10.md / registro de pendientes §B1, "el vecindario que
 * no llegaba a nadie". Re-corre SÓLO `spec.discriminators` de una hipótesis
 * YA construida por `build()`, contra un `ctx`/`graph` MEJOR que el que
 * existía en ese momento (hoy: el único caso real es `ctx.neighborhood`,
 * siempre `EMPTY_NEIGHBORHOOD` durante la construcción per-archivo — ver
 * `hypotheses/run.ts#refreshHypotheses`). Deliberadamente NUNCA toca
 * `required`/`appliedState`: ambos ya corrieron una vez con el MEJOR contexto
 * disponible en su momento (p.ej. `ctx.file` con árbol vivo); volver a
 * correrlos acá, con un `ctx` que en la práctica es casi siempre PEOR en
 * algún otro eje (`ctx.file` ya `null`, el árbol se liberó), podría revertir
 * una exclusión que sí tenía datos reales — ver el fallback permisivo que
 * documenta `strategy.ts#notStateCheck`. Por eso `state` y `checks` de
 * `existing` viajan intactos; sólo `discriminators`/`confidence` se
 * recalculan, con la MISMA aritmética que `build()` usa
 * (`ladderStep`/`minConfidence`).
 */
export function refreshDiscriminators<P, G>(
  spec: HypothesisSpec<P, G>,
  existing: PatternHypothesisDraft,
  problem: P,
  graph: G,
): PatternHypothesisDraft {
  const discriminatorResults = spec.discriminators.map((c) => toCheck(c, "discriminator", problem, graph));
  const confirmed = discriminatorResults.filter((r) => r.passed).length;
  const laddered = ladderStep(confirmed);
  // `ya-aplicado`/`aplicado-eludido` no compiten por confianza — mismo
  // criterio que `build()`, sobre el `state` YA decidido (nunca se recalcula
  // acá).
  const isOpportunity = existing.state === "ausente" || existing.state === "parcial";
  const confidence = isOpportunity ? minConfidence(spec.ceiling, laddered) : existing.confidence;
  return { ...existing, confidence, discriminators: discriminatorResults };
}

/**
 * ARBITRAJE ENTRE HIPÓTESIS RIVALES SOBRE EL MISMO ANCLA — bug 2 de "tres
 * bugs de mecanismo" (`RAICES.md`). Hasta acá, cada `<patron>.ts` construye su
 * hipótesis EN AISLAMIENTO (`build()` no ve qué devolvieron los demás
 * builders para el mismo `Finding`) y `hypotheses/run.ts#attachHypotheses`
 * cuelga TODO lo que no dio `null`, sin decidir entre ellas — "el motor no
 * decide, las emite todas".
 *
 * CASO MEDIDO (Rails real, único conflicto entre patrones distintos en las
 * dos poblaciones oficiales — `census-golden`/`rails.json` verificado, ver
 * informe de esta tarea): `app/models/hookable.rb:255`, ancla
 * `repeated-switch` sobre `"hookable_type"`, cuelga DOS hipótesis a la vez —
 * `State: ausente` (una OPORTUNIDAD: "agregá el patrón") y
 * `Strategy: aplicado-eludido` (un HECHO ESTRUCTURAL: `appliedState` de
 * Strategy ya CONFIRMÓ, con evidencia positiva, que la forma de tabla de
 * despacho existe y algo la puentea). Las dos no pueden ser ciertas a la vez
 * sobre el MISMO discriminante: si Strategy ya confirmó estructuralmente que
 * `hookable_type` decide COMPORTAMIENTO (no transiciona: es exactamente lo
 * que el propio `toConfirm` de State pregunta y la respuesta ya está en el
 * `checks` de Strategy), recomendar agregar State sobre esa misma evidencia
 * es incoherente — el motor YA TENÍA la información para elegir bien.
 *
 * LA REGLA, general y sin casos especiales por par de patrones: entre
 * hipótesis que comparten `anchorFindingId`, un estado ESTRUCTURALMENTE
 * CONFIRMADO (`ya-aplicado`/`aplicado-eludido` — su `appliedState` verificó
 * POSITIVAMENTE que la forma existe, no que "podría existir") le gana a una
 * OPORTUNIDAD (`ausente`/`parcial` — una recomendación, nunca una
 * confirmación) de OTRO patrón: se descarta la oportunidad. Nunca al revés
 * (una oportunidad no calla a una confirmación: la confirmación es evidencia
 * más fuerte por construcción, ver `engine.build#isOpportunity`) y nunca
 * entre dos hipótesis del MISMO patrón (no puede pasar: `registries.test.ts`
 * garantiza un builder por patrón).
 *
 * DECLARADO, no resuelto: entre dos OPORTUNIDADES de patrones distintos, o
 * entre dos CONFIRMACIONES de patrones distintos, no hay señal en esta regla
 * para preferir una — hoy se muestran ambas. Medido: en las dos poblaciones
 * oficiales (`src/`, Rails) el ÚNICO `Finding` con más de una hipótesis es
 * exactamente el caso de arriba (`census-golden`, `hypotheses-precision-report`
 * verificado antes de este cambio) — no hay caso real medido de dos
 * oportunidades ni de dos confirmaciones compitiendo, así que esta regla no
 * se generalizó más allá de lo que el corpus disponible puede sostener.
 *
 * ─── OLA X, FRENTE B1: MEDIDO SOBRE LOS 13 REPOS DEL CORPUS ───────────────
 * Esta regla nunca se había medido sobre la población con la que se mide la
 * COBERTURA (`COBERTURA-NIVEL-2.md`) — sólo sobre `src/` y aquel Rails. Con la
 * traza de abajo (`startArbitrationTrace`), una corrida por repo:
 *
 *   · hallazgos con DOS o más hipótesis .................... 2
 *   · de ésos, con conflicto (oportunidad + confirmación) ... 0
 *   · OPORTUNIDADES QUE ESTA FUNCIÓN DESCARTA .............. 0
 *   · población EN RIESGO (kind con >=2 builders registrados
 *     Y >=1 hipótesis) ..................................... 253
 *     ⇒ tasa de conflicto 0,00 % [0,00 %, 1,50 %] (Wilson 95 %)
 *
 * Las DOS colisiones del corpus son, cada una, dos OPORTUNIDADES —el caso que
 * esta regla declara y decide no arbitrar—: `cursors.js:76` de eslint
 * (`long-parameter-list`: Builder + Decorator, las dos `ausente`) y
 * `QuantilesBenchmark.java:43` de guava (`distributed-duplication`: Iterator +
 * Template Method, las dos `ausente`). **El caso testigo de arriba no ocurre
 * ni una vez en los 13 repos.** La cobertura del nivel 2 sale IDÉNTICA con
 * esta función encendida, apagada, y con la compuerta de rivalidad
 * (37/319 en los tres brazos, medido con `scripts/w-cobertura-nivel2.mts`).
 *
 * Consecuencia, para que la próxima ola no vuelva a sospechar de acá: **este
 * eslabón no es una fuga de cobertura.** Lo que sí es un dato es lo que la
 * misma medición encontró aguas ARRIBA: sobre las anclas compartidas hay
 * builders que nunca emiten (Decorator en `large-class`, Proxy en
 * `duplication` y `scattered-instantiation`, Template Method en
 * `parallel-hierarchies`), y ese silencio es de sus `required`, no de acá.
 */
export function arbitrateRivalHypotheses(hypotheses: readonly PatternHypothesis[]): readonly PatternHypothesis[] {
  if (hypotheses.length < 2) return hypotheses;
  const isConfirmed = (h: PatternHypothesis): boolean => h.state === "ya-aplicado" || h.state === "aplicado-eludido";
  const isOpportunity = (h: PatternHypothesis): boolean => h.state === "ausente" || h.state === "parcial";
  const confirmedRivals = (h: PatternHypothesis): readonly PatternHypothesis[] =>
    hypotheses.filter((other) => other.pattern !== h.pattern && isConfirmed(other));
  const overlappingRivals = (h: PatternHypothesis): readonly PatternHypothesis[] =>
    confirmedRivals(h).filter((other) => sameSubject(h, other));
  // OLA X, B1 — la regla de la Ola 11b, MÁS la compuerta de rivalidad
  // (`sameSubject`, abajo). `confirmedRivals` se sigue calculando porque la
  // traza publica las DOS lecturas: eso es lo que permite reconstruir el
  // contrafáctico de las dos reglas desde UNA sola corrida.
  const survivors = hypotheses.filter((h) => !(isOpportunity(h) && overlappingRivals(h).length > 0));
  if (arbitrationTrace) recordArbitration(hypotheses, survivors, confirmedRivals, overlappingRivals);
  return survivors;
}

/**
 * OLA X, FRENTE B1 — LA COMPUERTA DE RIVALIDAD, y por qué la regla de arriba
 * la necesitaba.
 *
 * QUÉ INTENCIÓN VERIFICA: *"¿las dos hipótesis hablan del MISMO pedazo de
 * código, o sólo comparten el hallazgo que las disparó?"* La regla original
 * daba por sentado lo primero porque el ÚNICO caso que había podido observar
 * (`hookable.rb:255`, State vs Strategy sobre el mismo `switch`) era de esa
 * clase: dos patrones proponiendo la MISMA transformación sobre el MISMO
 * discriminante. Pero compartir `anchorFindingId` no implica eso. Un
 * `Finding` de `large-class` tiene por ancla la clase ENTERA, y Decorator y
 * Template Method cuelgan de él hablando de miembros distintos; un
 * `god-component` es un archivo entero. En esos casos "otro patrón confirmó"
 * no contradice nada: es una afirmación sobre OTRO lugar.
 *
 * LA SEÑAL, y por qué es ésta y no la confianza: la confianza de una
 * oportunidad no dice nada sobre si la CONFIRMACIÓN rival es correcta, y las
 * confirmaciones de hoy son medidamente frágiles (los `aplicado-eludido` de
 * Facade y los `ya-aplicado` de Decorator son poblaciones enteras
 * cuestionadas en `COBERTURA-NIVEL-2.md §3`). Lo que SÍ es verificable sin
 * creerle a ninguno de los dos es la EXTENSIÓN: `places` es lo que cada
 * hipótesis afirma que hay que tocar. Si las dos afirman sobre rangos
 * disjuntos del código, no son rivales — no hay contradicción que arbitrar.
 * Si se solapan, la regla original se aplica intacta (por eso el caso medido
 * que la justifica se conserva: State y Strategy apuntan al mismo `switch`).
 *
 * GENÉRICA: se compara `file` + rango de líneas, nunca el nombre del patrón
 * ni un par especial. Sin `places` en alguno de los dos lados no hay forma de
 * afirmar disyunción, así que se asume rivalidad — el comportamiento viejo,
 * que es el conservador.
 */
function sameSubject(a: PatternHypothesis, b: PatternHypothesis): boolean {
  if (a.places.length === 0 || b.places.length === 0) return true;
  return a.places.some((pa) =>
    b.places.some((pb) => pa.file === pb.file && pa.startLine <= pb.endLine && pb.startLine <= pa.endLine),
  );
}

/**
 * OLA X, FRENTE B1 — LA TRAZA. Ningún `process.env` en el camino de análisis
 * (invariante que documenta `analyze-cache.ts`): se prende llamando
 * `startArbitrationTrace()` desde un script de medición y se apaga sola.
 * `null` (el default de producción) ⇒ costo cero, ni una rama de más por
 * hipótesis.
 */
export interface ArbitrationTraceEntry {
  anchorFindingId: string;
  hypotheses: readonly {
    pattern: string;
    state: PatternState;
    confidence: PatternConfidence | null;
    places: readonly { file: string; startLine: number; endLine: number; symbol?: string }[];
    /** Patrones CONFIRMADOS de este mismo ancla que solapan lugares con éste. */
    overlappingConfirmed: readonly string[];
    /** Patrones CONFIRMADOS de este mismo ancla, solapen o no (la regla vieja). */
    anyConfirmed: readonly string[];
    /** ¿la regla EN VIGOR la descartó? */
    discarded: boolean;
  }[];
}

let arbitrationTrace: ArbitrationTraceEntry[] | null = null;

export function startArbitrationTrace(): void {
  arbitrationTrace = [];
}

export function takeArbitrationTrace(): readonly ArbitrationTraceEntry[] {
  const t = arbitrationTrace ?? [];
  arbitrationTrace = null;
  return t;
}

function recordArbitration(
  all: readonly PatternHypothesis[],
  survivors: readonly PatternHypothesis[],
  confirmedRivals: (h: PatternHypothesis) => readonly PatternHypothesis[],
  overlappingRivals: (h: PatternHypothesis) => readonly PatternHypothesis[],
): void {
  arbitrationTrace?.push({
    anchorFindingId: all[0]?.anchorFindingId ?? "",
    hypotheses: all.map((h) => ({
      pattern: h.pattern,
      state: h.state,
      confidence: h.confidence,
      places: h.places.map((p) => ({ file: p.file, startLine: p.startLine, endLine: p.endLine, symbol: p.symbol })),
      overlappingConfirmed: overlappingRivals(h).map((r) => r.pattern),
      anyConfirmed: confirmedRivals(h).map((o) => o.pattern),
      discarded: !survivors.includes(h),
    })),
  });
}
