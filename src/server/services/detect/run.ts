/**
 * El runner — CONTRATOS.md §1.6/§1.7. Corre todos los detectores del registro
 * (o el subconjunto de `only`, para tests) sobre la unidad de entrada que le
 * corresponde a su `scope`, arma la identidad de cada `Finding`, y produce la
 * cobertura pareja que necesita el panel "Qué no estamos viendo".
 *
 * DESVIACIÓN reportada (ver el resultado final de la tarea): el contrato
 * original tipa `DetectorRunInput.repo: RepoUnit` como la única entrada, pero
 * `RepoUnit.functions` está documentado explícitamente SIN `node` ("los
 * árboles ya se liberaron" — ver `types.ts#RepoFunctionUnit`), lo que hace
 * imposible correr un detector `intra-function`/`intra-file` (que necesitan
 * un `AstNode` vivo) contra `RepoUnit` solo. Esta ola agrega un campo
 * ADITIVO y OPCIONAL, `files?: readonly FileUnit[]`, para que la migración
 * (F2+) tenga dónde enchufar las unidades vivas por archivo sin rediseñar el
 * runner; con el registro vacío de hoy, ningún detector real lo ejercita
 * todavía.
 *
 * F5b/tarea de esta ola: `runInterFile` ahora chequea `detector.needsEdges`/
 * `.needsMetrics` (`types.ts#InterFileDetector`) ANTES de correrlo — mismo
 * lugar y mismo estilo que el chequeo de `needsGraph`/`needs` que ya existía.
 * Ningún detector real del registro declara estos campos todavía (son
 * opcionales, un cambio propio de cada detector, no de este runner), así
 * que hoy este camino no lo ejercita ningún detector de producción —
 * `run.test.ts` lo prueba con detectores fake, mismo patrón que el resto de
 * este archivo.
 *
 * LA UNIFICACIÓN — Ola N, frente U1. Hasta esta ola un detector `intra-*` era
 * CIEGO al grafo por construcción, y no por un campo que faltara sino por un
 * problema de ORDEN: los `intra-*` corren por archivo, sobre el árbol vivo,
 * ANTES de que el grafo exista (el grafo necesita los hechos de TODOS los
 * archivos); cuando el grafo existe, el árbol ya se liberó. Ahora el runner
 * sabe partir los `intra-*` en dos pasadas complementarias (`intraPass`) y
 * lleva el grafo y su índice en el `RunContext` (`types.ts#RunContext.graph`/
 * `.graphIndex`). Tres piezas, todas en este archivo: `intraPass` (la
 * partición), `makeGraphView` (el índice perezoso y compartido) y
 * `hasIntraGraphDetectors` (para que `code-analyzer.ts` no monte la pasada 2
 * si nadie optó). Ver `claude-kanban-docs/ola-n/CONTRATO-UNIFICACION.md`.
 */
import type { DerivedNodeSets } from "../code-grammar.js";
import { createBudget } from "../graph/metrics/budget.js";
import type { CodeGraph, GraphIndex } from "../graph/types.js";
import type { Capability } from "./capabilities.js";
import { deriveAnchor, findingId } from "./ids.js";
import { buildGraphIndex } from "./primitivas/u1-grafo-en-contexto.js";
import { resolveThreshold, type Benchmarks, type MetricName, type Threshold, type ThresholdSpec } from "./thresholds.js";
import { DETECTORS } from "./registry.js";
import type {
  Detector,
  DetectorCoverage,
  FileUnit,
  Finding,
  RawFinding,
  RepoUnit,
  RunContext,
  Scope,
} from "./types.js";

export interface DetectorRunInput {
  repo: RepoUnit;
  /** Capacidades y sets por lenguaje, ya resueltos por `resolveLanguage`. */
  languages: ReadonlyMap<string, { capabilities: ReadonlySet<Capability>; sets: DerivedNodeSets }>;
  benchmarks: Benchmarks | null;
  /** ids, para tests. */
  only?: readonly string[];
  /**
   * ADITIVO, no parte del contrato original — ver el docstring del módulo.
   * Unidades vivas (con `AstNode`) para los detectores `intra-function` e
   * `intra-file`. Ausente u omitido ⇒ esos scopes simplemente no tienen
   * unidades que considerar esta corrida (coverage con `unitsConsidered: 0`),
   * nunca un error.
   */
  files?: readonly FileUnit[];
  /**
   * F4 — CONTRATO-F4.md §1.6: restringe la corrida a estos scopes. Ausente
   * ⇒ los tres, como hoy. `analyzeFile` (`code-analyzer.ts`) pasa
   * `["intra-function", "intra-file"]` (necesita el árbol vivo, que sólo
   * existe ahí); `crossAnalyze` pasa `["inter-file"]`. Ningún detector se
   * nombra a mano en ningún lado — un detector nuevo sigue siendo 1 archivo
   * + 1 línea en `registry.ts`.
   */
  scopes?: readonly Scope[];
  /**
   * LA UNIFICACIÓN (Ola N, frente U1) — qué MITAD de los detectores `intra-*`
   * corre en esta llamada, particionada por `IntraGraphOptIn.needsGraph`
   * (`types.ts`). Es lo que garantiza el requisito duro "un detector corre en
   * UNA pasada, nunca en las dos": las dos mitades son complementarias y
   * disjuntas por construcción.
   *
   *   - `"solo-sin-grafo"` — pasada 1 (`code-analyzer.ts#analyzeFile`, por
   *     archivo, con el árbol vivo y ANTES de que el grafo exista): corren los
   *     `intra-*` que NO declararon `needsGraph`.
   *   - `"solo-con-grafo"` — pasada 2 (`code-analyzer.ts#crossAnalyze`,
   *     reparseando bajo demanda DESPUÉS de construir el grafo): corren SÓLO
   *     los que sí lo declararon, con `ctx.graph` no nulo.
   *   - ausente (el DEFAULT) — sin partición: corren TODOS los `intra-*`, que
   *     es exactamente el comportamiento de antes de esta ola. Es lo que ven
   *     `detect/testing.ts`, todo test existente, y `analyzeFile` cuando el
   *     interruptor de vuelta atrás `CK_ANALISIS_DOS_PASADAS=0` está puesto.
   *
   * No toca los detectores `inter-file`: su ruteo ya lo decide `scopes`.
   */
  intraPass?: "solo-sin-grafo" | "solo-con-grafo";
  /**
   * LA UNIFICACIÓN — el índice de consulta del grafo (`graph/types.ts
   * #GraphIndex`) que va a `ctx.graphIndex()`. YA CONSTRUIDO por el caller
   * cuando éste va a llamar al runner MUCHAS veces sobre el MISMO grafo
   * (`crossAnalyze` lo llama una vez por archivo en la pasada 2): construirlo
   * es O(N+E) y pagarlo por archivo sería O(archivos × aristas).
   *
   * Ausente/`null` ⇒ el runner lo construye él, PEREZOSAMENTE (sólo si algún
   * detector llama a `ctx.graphIndex()`) y UNA vez por llamada, a partir de
   * `repo.graph`. Ausente y `repo.graph === null` ⇒ `ctx.graphIndex()`
   * devuelve `null`, igual que `ctx.graph`.
   */
  graphIndex?: GraphIndex | null;
}

export interface DetectorRunResult {
  findings: Finding[];
  coverage: DetectorCoverage[];
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function byIdAsc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Comparador DENTRO de un mismo detector — usado acá por
 * `capDetectorFindings` (el `maxFindings` propio de un detector, un
 * presupuesto de VOLUMEN, no de ranking) y todavía correcto ahí porque, a
 * esa granularidad, comparar `severity` es comparar dentro de la MISMA
 * escala (§1.3 de CONTRATO-F5.md).
 *
 * F5 — CONTRATO-F5.md §1.6: el orden FINAL del análisis (`code-analyzer.ts
 * #crossAnalyze`) YA NO usa esto — comparar `severity` cruda ENTRE
 * detectores distintos es exactamente el sesgo medido (guava:
 * `feature-envy-intra` 84/200 filas, `unused-variable`/`demeter-chain` en 0).
 * `crossAnalyze` ordena por `score` (`detect/ranking.ts#byScoreDescThenId`,
 * mismo desempate por `Finding.id` asc) — este export sigue existiendo
 * porque el uso DENTRO de un detector individual sigue siendo válido, y
 * `run.test.ts` lo ejercita.
 */
export function bySeverityDescThenId(a: Finding, b: Finding): number {
  return b.severity - a.severity || byIdAsc(a.id, b.id);
}

function toFinding(detector: Detector, raw: RawFinding, scope: Scope, language: string | null): Finding {
  const anchors = raw.locations.map(deriveAnchor);
  return {
    ...raw,
    id: findingId(detector.id, raw.variant, anchors),
    detectorId: detector.id,
    kind: detector.kind,
    scope,
    language,
  };
}

/** `sampleSize`/`corpusP95` reales — ver la nota de simplificación en `thresholds.ts`. */
function makeResolveInput(language: string, benchmarks: Benchmarks | null) {
  return {
    language,
    sampleSize: (_metric: MetricName) => 0,
    corpusP95: (metric: MetricName, lang: string) => benchmarks?.p95(metric, lang) ?? null,
  };
}

/**
 * LA UNIFICACIÓN — la vista del grafo que comparte TODA una llamada al runner:
 * el grafo tal cual, y su índice construido PEREZOSAMENTE y UNA sola vez para
 * todos los detectores/lenguajes/unidades de esa llamada.
 *
 * Perezoso de verdad: un repo donde ningún detector llama a `ctx.graphIndex()`
 * no paga el O(N+E) de construirlo. Compartido de verdad: dos detectores que
 * lo pidan reciben el MISMO objeto, no dos índices del mismo grafo.
 */
function makeGraphView(input: DetectorRunInput): { graph: CodeGraph | null; index(): GraphIndex | null } {
  const graph = input.repo.graph;
  let index: GraphIndex | null | undefined = input.graphIndex ?? undefined;
  return {
    graph,
    index() {
      if (index === undefined) index = graph ? buildGraphIndex(graph) : null;
      return index;
    },
  };
}

function makeRunContext<K extends string>(
  detector: Detector,
  language: string,
  capabilities: ReadonlySet<Capability>,
  benchmarks: Benchmarks | null,
  graphView: ReturnType<typeof makeGraphView>,
): RunContext<K> {
  const resolveInput = makeResolveInput(language, benchmarks);
  const resolved = new Map<string, Threshold>();
  const specs = detector.thresholds as unknown as Record<string, ThresholdSpec>;
  return {
    language,
    capabilities,
    threshold(name: K) {
      let t = resolved.get(name);
      if (!t) {
        t = resolveThreshold(specs[name], resolveInput);
        resolved.set(name, t);
      }
      return t;
    },
    graph: graphView.graph,
    graphIndex: () => graphView.index(),
  };
}

/** Aplica el `presupuesto` propio del detector (`maxFindings`), si declaró uno. */
function capDetectorFindings(
  detector: Detector,
  language: string,
  benchmarks: Benchmarks | null,
  built: Finding[],
): { kept: Finding[]; truncated: boolean } {
  if (!detector.maxFindings) return { kept: built, truncated: false };
  const cap = resolveThreshold(detector.maxFindings, makeResolveInput(language, benchmarks)).value;
  if (built.length <= cap) return { kept: built, truncated: false };
  const kept = [...built].sort(bySeverityDescThenId).slice(0, cap);
  return { kept, truncated: true };
}

/**
 * Unión de capacidades de TODOS los lenguajes presentes en el repo. Un
 * detector `inter-file` no corre contra un lenguaje en particular (su
 * `ctx.language` es el centinela `"*"`), así que la única lectura coherente
 * de `needs` a esta granularidad es "¿existe AL MENOS UN lenguaje en el repo
 * que provea cada capacidad declarada?": si ninguno la provee, el detector
 * no tiene sobre qué correr. `runPerLanguage` ya trata exactamente esa misma
 * ausencia (capacidad faltante en el único lenguaje que evalúa) como
 * `no-aplicable`, nunca como "corrió y no encontró nada" — este es el mismo
 * criterio, adaptado a que acá no hay UN lenguaje sino la unión de todos.
 *
 * Bug encontrado en revisión adversarial (ver el resultado final): antes de
 * este fix, `runInterFile` nunca leía `detector.needs` — cualquier detector
 * `inter-file` corría aunque ninguna capacidad que declarara existiera en
 * ningún lenguaje del repo. Pasaba inadvertido porque `duplication` (el
 * único detector `inter-file` de hoy) declara `needs: []`.
 */
function unionCapabilities(languages: DetectorRunInput["languages"]): ReadonlySet<Capability> {
  const union = new Set<Capability>();
  for (const { capabilities } of languages.values()) {
    for (const cap of capabilities) union.add(cap);
  }
  return union;
}

/**
 * R1 (`RAICES.md`) — antes de este fix, `toFinding` recibía `null`
 * INCONDICIONALMENTE para todo hallazgo `inter-file`, aunque
 * `Finding.language`'s propio contrato (`detect/types.ts:88`) dice `null`
 * "cuando el hallazgo cruza más de un lenguaje" — no siempre. Un hallazgo
 * `inter-file` cuya evidencia entera vive en UN SOLO lenguaje (el caso común:
 * `large-class`/`god-component`/`speculative-abstraction` casi siempre
 * anclan en un único archivo, y hasta `duplication`/`distributed-
 * duplication` sobre un repo de un solo lenguaje jamás cruza) puede — y debe
 * — llevar ese lenguaje real. `hypotheses/run.ts#attachHypotheses` lo usa
 * para `ctx.capabilities` (single-language en vez de la unión, más preciso)
 * — la unión sigue siendo el fallback correcto cuando de verdad se cruza de
 * lenguaje, o cuando alguna ubicación no resuelve a un archivo de esta
 * corrida (más conservador: no afirma un único lenguaje sin poder
 * confirmarlo en las CINCO ubicaciones, no sólo la primera).
 */
function buildFileLanguageMap(files: DetectorRunInput["repo"]["files"]): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const f of files) map.set(f.path, f.language);
  return map;
}

/** Ver `buildFileLanguageMap`. `null` si cruza lenguajes, o si alguna
 *  ubicación no resuelve a un archivo conocido de esta corrida. */
function findingLanguage(locations: RawFinding["locations"], fileLanguage: ReadonlyMap<string, string>): string | null {
  let language: string | null = null;
  for (const loc of locations) {
    const lang = fileLanguage.get(loc.file);
    if (lang === undefined) return null;
    if (language === null) language = lang;
    else if (language !== lang) return null;
  }
  return language;
}

async function runInterFile(
  detector: Extract<Detector, { scope: "inter-file" }>,
  input: DetectorRunInput,
  findings: Finding[],
  coverage: DetectorCoverage[],
  graphView: ReturnType<typeof makeGraphView>,
): Promise<void> {
  if (detector.needsGraph && input.repo.graph === null) {
    coverage.push({
      detectorId: detector.id,
      title: detector.title,
      scope: "inter-file",
      kind: detector.kind,
      status: "sin-grafo",
      unitsConsidered: 0,
      findings: 0,
    });
    return;
  }

  // ORDEN — CAMBIADO EN LA OLA 11b (frente B1), con el argumento escrito
  // porque invierte lo que este archivo decía antes.
  //
  // Hasta esta ola `needsEdges`/`needsMetrics` se chequeaban ANTES que
  // `needs`, con este razonamiento: "son un chequeo de infraestructura del
  // GRAFO de esta corrida, más cercano en espíritu a `sin-grafo` que a
  // `no-aplicable`". El orden se invierte porque lo que importa no es de qué
  // capa viene el chequeo sino QUÉ TAN PERMANENTE es la respuesta que da:
  //
  //   `no-aplicable` habla del LENGUAJE: la construcción no existe ahí y no
  //     va a existir en ninguna corrida. Es la respuesta más fuerte y la más
  //     útil para quien lee la cobertura.
  //   `sin-aristas`/`sin-metricas` hablan de ESTA CORRIDA: el dato no
  //     aterrizó. Mañana puede aterrizar.
  //
  // Cuando las dos cosas son ciertas a la vez, decir la transitoria y callar
  // la permanente es perder información. El caso concreto que lo forzó:
  // `import-depth-demeter` declara `needs: ["imports"]` Y (desde esta ola)
  // `needsEdges: ["imports"]`; sobre un repo SÓLO ruby las dos aplican, y
  // "ruby no tiene imports como construcción" es estrictamente más
  // informativo que "no hubo aristas imports" — su propio test lo afirmaba
  // desde antes y este orden es el que lo respeta.
  //
  // Alcance real del cambio, medido: hoy `import-depth-demeter` es el ÚNICO
  // detector registrado que declara `needs` no vacío Y `needsEdges` — los
  // otros cuatro que declaran `needsEdges` tienen `needs: []`, así que para
  // ellos el orden es indistinguible.
  const missing = detector.needs.filter((c) => !unionCapabilities(input.languages).has(c));
  if (missing.length > 0) {
    coverage.push({
      detectorId: detector.id,
      title: detector.title,
      scope: "inter-file",
      kind: detector.kind,
      status: "no-aplicable",
      missingCapabilities: missing,
      unitsConsidered: 0,
      findings: 0,
    });
    return;
  }

  // Las dos compuertas que faltaban (DIAGNÓSTICO-5B §5, Problema 3): un
  // detector puede declarar QUÉ aristas tipadas / qué métricas de grafo
  // necesita, y si el grafo de ESTA corrida no las tiene, el runner lo
  // reporta honesto en vez de dejarlo caer a `run()` y volver `[]` en
  // silencio (indistinguible de "corrió y no encontró nada").
  //
  // DOS CHEQUEOS DE ARISTAS, NO UNO — Ola 11b (frente B0), la regresión que
  // motivó separarlos. `needsEdges` es conjunción (AND: hacen falta TODOS los
  // kinds declarados) y `needsAnyEdge` es alternativa (OR: alcanza con UNO).
  // Antes de esta ola sólo existía el primero, y tres detectores que en
  // realidad necesitaban alternativa (`speculative-abstraction`,
  // `unstable-dependency`, `parallel-hierarchies`) se habían declarado como
  // si necesitaran conjunción — el AND los apagaba enteros («sin-aristas»)
  // cada vez que al repo le faltaba UN SOLO kind de la lista, aunque otro
  // kind de esa misma lista alcanzara y sobrara para encontrar algo real. Ver
  // `types.ts#InterFileDetector.needsEdges`/`.needsAnyEdge` para el criterio
  // completo de cuál declarar. Los dos chequeos son independientes y pueden
  // convivir en el mismo detector (uno cubre un rol obligatorio, el otro un
  // grupo de alternativas para OTRO rol) — cualquiera de los dos que falle
  // corta acá, antes de `run()`.
  if ((detector.needsEdges && detector.needsEdges.length > 0) || (detector.needsAnyEdge && detector.needsAnyEdge.length > 0)) {
    const kindsPresent = new Set((input.repo.graph?.edges ?? []).map((e) => e.kind));

    if (detector.needsEdges && detector.needsEdges.length > 0) {
      const missingEdgeKinds = detector.needsEdges.filter((k) => !kindsPresent.has(k));
      if (missingEdgeKinds.length > 0) {
        coverage.push({
          detectorId: detector.id,
          title: detector.title,
          scope: "inter-file",
          kind: detector.kind,
          status: "sin-aristas",
          missingEdgeKinds,
          unitsConsidered: 0,
          findings: 0,
        });
        return;
      }
    }

    // Alternativa: alcanza con que UNO SOLO de los kinds declarados esté
    // presente. Si ninguno lo está, no hay un subconjunto más chico que
    // reportar — `missingEdgeKinds` es la lista COMPLETA declarada, porque
    // ninguno de ellos, individualmente, habría bastado.
    if (detector.needsAnyEdge && detector.needsAnyEdge.length > 0) {
      const anySatisfied = detector.needsAnyEdge.some((k) => kindsPresent.has(k));
      if (!anySatisfied) {
        coverage.push({
          detectorId: detector.id,
          title: detector.title,
          scope: "inter-file",
          kind: detector.kind,
          status: "sin-aristas",
          missingEdgeKinds: detector.needsAnyEdge,
          unitsConsidered: 0,
          findings: 0,
        });
        return;
      }
    }
  }
  if (detector.needsMetrics && detector.needsMetrics.length > 0) {
    const resolved = input.repo.metrics ?? new Set<string>();
    const missingMetrics = detector.needsMetrics.filter((m) => !resolved.has(m));
    if (missingMetrics.length > 0) {
      coverage.push({
        detectorId: detector.id,
        title: detector.title,
        scope: "inter-file",
        kind: detector.kind,
        status: "sin-metricas",
        missingMetrics,
        unitsConsidered: 0,
        findings: 0,
      });
      return;
    }
  }

  try {
    // No hay un único "lenguaje" para un detector que mira todo el repo a la
    // vez; `"*"` es el centinela de "repo-wide / potencialmente multi-lenguaje"
    // — ver la nota del resultado final sobre esta simplificación.
    const ctx = makeRunContext<string>(detector, "*", new Set<Capability>(), input.benchmarks, graphView);
    const raw = detector.run(input.repo, ctx);
    const fileLanguage = buildFileLanguageMap(input.repo.files);
    const built = raw.map((r) => toFinding(detector, r, "inter-file", findingLanguage(r.locations, fileLanguage)));
    const { kept, truncated } = capDetectorFindings(detector, "*", input.benchmarks, built);
    findings.push(...kept);
    coverage.push({
      detectorId: detector.id,
      title: detector.title,
      scope: "inter-file",
      kind: detector.kind,
      status: truncated ? "presupuesto-agotado" : "corrio",
      unitsConsidered: input.repo.functions.length + input.repo.clones.length,
      findings: kept.length,
    });
  } catch (err) {
    coverage.push({
      detectorId: detector.id,
      title: detector.title,
      scope: "inter-file",
      kind: detector.kind,
      status: "error",
      unitsConsidered: 0,
      findings: 0,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function runPerLanguage(
  detector: Extract<Detector, { scope: "intra-function" | "intra-file" }>,
  input: DetectorRunInput,
  findings: Finding[],
  coverage: DetectorCoverage[],
  graphView: ReturnType<typeof makeGraphView>,
): Promise<void> {
  const files = input.files ?? [];

  for (const [language, langInfo] of input.languages) {
    const missing = detector.needs.filter((c) => !langInfo.capabilities.has(c));
    if (missing.length > 0) {
      coverage.push({
        detectorId: detector.id,
        title: detector.title,
        scope: detector.scope,
        kind: detector.kind,
        language,
        status: "no-aplicable",
        missingCapabilities: missing,
        unitsConsidered: 0,
        findings: 0,
      });
      continue;
    }

    const filesForLanguage = files.filter((f) => f.language === language);
    let unitsConsidered = 0;
    const built: Finding[] = [];
    try {
      const ctx = makeRunContext<string>(detector, language, langInfo.capabilities, input.benchmarks, graphView);
      // Cede el event loop DENTRO del recorrido de un mismo detector, no sólo
      // entre detectores (eso ya lo hace `runDetectorSet`). Antes de esto, un
      // archivo grande (p.ej. `LocalCache.java` de guava, 448 funciones) hacía
      // que UN detector recorriera sus centenares de funciones de un tirón,
      // llevando ese tramo del gap del event loop muy por encima del
      // presupuesto declarado (ver el resultado final de la tarea para la
      // medición, y su alcance real: el gap DE ESTE recorrido, no el de todo
      // `analyzeFile`, que incluye otras etapas fuera de este archivo). El
      // presupuesto es el mismo que ya declara `graph/metrics/budget.ts` — el
      // mismo techo que ese módulo documenta como réplica de
      // `MAX_WALK_SLICE_MS`/`CLOCK_CHECK_INTERVAL` de `code-analyzer.ts` —
      // NUNCA una constante nueva. `slice.expired()` sólo dispara un
      // yield-y-reinicio, jamás un corte de trabajo: a diferencia de
      // `ctx.budget` en `graph/metrics/` (que ABANDONA el cálculo cuando se
      // agota), acá TODAS las unidades se visitan siempre — el orden y el
      // conjunto de hallazgos no puede depender de cuántas veces cede el
      // proceso.
      let slice = createBudget();
      if (detector.scope === "intra-function") {
        for (const file of filesForLanguage) {
          for (const fn of file.functions) {
            unitsConsidered++;
            for (const r of detector.run(fn, ctx)) built.push(toFinding(detector, r, "intra-function", language));
            if (slice.expired()) {
              await yieldToEventLoop();
              slice = createBudget();
            }
          }
        }
      } else {
        for (const file of filesForLanguage) {
          unitsConsidered++;
          for (const r of detector.run(file, ctx)) built.push(toFinding(detector, r, "intra-file", language));
          if (slice.expired()) {
            await yieldToEventLoop();
            slice = createBudget();
          }
        }
      }
      const { kept, truncated } = capDetectorFindings(detector, language, input.benchmarks, built);
      findings.push(...kept);
      coverage.push({
        detectorId: detector.id,
        title: detector.title,
        scope: detector.scope,
        kind: detector.kind,
        language,
        status: truncated ? "presupuesto-agotado" : "corrio",
        unitsConsidered,
        findings: kept.length,
      });
    } catch (err) {
      coverage.push({
        detectorId: detector.id,
        title: detector.title,
        scope: detector.scope,
        kind: detector.kind,
        language,
        status: "error",
        unitsConsidered,
        findings: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * Corre un conjunto EXPLÍCITO de detectores contra `input`. `runDetectors`
 * (abajo) es un envoltorio fino sobre esto que fija la fuente de detectores en
 * `DETECTORS` — este export adicional (no parte del contrato literal) es lo
 * que permite testear el runner con detectores fake sin pasar por el
 * registro real. Ver el resultado final.
 */
export async function runDetectorSet(detectors: readonly Detector[], input: DetectorRunInput): Promise<DetectorRunResult> {
  const findings: Finding[] = [];
  const coverage: DetectorCoverage[] = [];
  // UNA sola vista del grafo para toda la llamada: el índice se construye a lo
  // sumo una vez, y sólo si algún detector lo pide.
  const graphView = makeGraphView(input);

  for (const detector of detectors) {
    if (detector.scope === "inter-file") {
      await runInterFile(detector, input, findings, coverage, graphView);
    } else {
      if (!intraRunsInThisPass(detector, input.intraPass)) continue;
      await runPerLanguage(detector, input, findings, coverage, graphView);
    }
    // Cede el event loop ENTRE detectores — misma disciplina de slicing que
    // el resto del pipeline aplica a trabajo síncrono largo.
    await yieldToEventLoop();
  }

  findings.sort(bySeverityDescThenId);
  return { findings, coverage };
}

/**
 * LA UNIFICACIÓN — la partición, en una función, para que "corre en UNA
 * pasada, nunca en las dos" sea una propiedad LEGIBLE y no una condición
 * repartida por el archivo. Los dos valores de `intraPass` son complementarios
 * sobre el MISMO predicado (`needsGraph === true`), así que para todo detector
 * `intra-*` y todo grafo: exactamente uno de los dos lo deja pasar.
 *
 * Ojo con el silencio: un detector filtrado acá NO deja fila de cobertura. Es
 * correcto — no es que no encontró nada, es que esta llamada no era la suya, y
 * la OTRA pasada emite su fila. `code-analyzer.ts#aggregateCoverage` junta las
 * dos pasadas en la misma tabla.
 */
function intraRunsInThisPass(
  detector: Extract<Detector, { scope: "intra-function" | "intra-file" }>,
  intraPass: DetectorRunInput["intraPass"],
): boolean {
  if (intraPass === undefined) return true;
  const wantsGraph = detector.needsGraph === true;
  return intraPass === "solo-con-grafo" ? wantsGraph : !wantsGraph;
}

/**
 * SEAM DE MEDICIÓN Y DE TEST DE PUNTA A PUNTA — Ola N, frente U1.
 *
 * `DETECTORS` (`registry.ts`) es una constante, y `analyzeRepo`/`crossAnalyze`
 * llegan a ella sólo por `runDetectors`. Sin este seam no hay forma de correr
 * el pipeline REAL (con su caché, su grafo, sus dos pasadas) con un detector
 * que opte por el grafo, que es exactamente lo que hacen falta para (a) medir
 * el costo REAL de la unificación aislado del costo de un detector, y (b)
 * probar de punta a punta que un `intra-*` recibe árbol vivo y grafo a la vez.
 *
 * Vacío por defecto ⇒ `allDetectors()` devuelve `DETECTORS`, la MISMA
 * instancia, y el comportamiento de producción es idéntico byte a byte. Quien
 * registra algo recibe la función para desregistrarlo y DEBE llamarla (un test
 * que no lo haga contamina a los que siguen en el mismo proceso).
 *
 * No es una vía para que un detector de verdad entre al análisis: un detector
 * de producción sigue siendo 1 archivo + 1 línea en `registry.ts`.
 */
const DETECTORES_EXTRA: Detector[] = [];

export function registerExtraDetector(detector: Detector): () => void {
  DETECTORES_EXTRA.push(detector);
  return () => {
    const i = DETECTORES_EXTRA.indexOf(detector);
    if (i >= 0) DETECTORES_EXTRA.splice(i, 1);
  };
}

/** `DETECTORS` más lo que haya registrado el seam de arriba (vacío en producción). */
export function allDetectors(): readonly Detector[] {
  return DETECTORES_EXTRA.length === 0 ? DETECTORS : [...DETECTORS, ...DETECTORES_EXTRA];
}

/**
 * LA UNIFICACIÓN — ¿hay ALGÚN detector `intra-*` que haya optado por el grafo?
 *
 * `code-analyzer.ts#crossAnalyze` lo pregunta ANTES de montar la pasada 2: si
 * la respuesta es `false` (hoy, y hasta que B1 aterrice), la pasada 2 no
 * existe — ni un reparseo, ni un índice de grafo, ni una llamada al runner.
 * Eso es lo que hace que el costo de la unificación se pague SÓLO si alguien
 * la usa, que es el requisito duro 1 del frente.
 */
export function hasIntraGraphDetectors(): boolean {
  return allDetectors().some((d) => d.scope !== "inter-file" && d.needsGraph === true);
}

export async function runDetectors(input: DetectorRunInput): Promise<DetectorRunResult> {
  const source = allDetectors();
  let detectors: readonly Detector[] = input.only ? source.filter((d) => input.only!.includes(d.id)) : source;
  if (input.scopes) detectors = detectors.filter((d) => input.scopes!.includes(d.scope));
  return runDetectorSet(detectors, input);
}
