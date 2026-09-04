/**
 * `fanout-without-cohesion` — fan-out sin cohesión (PLAN.md §4.1: una unidad
 * que orquesta muchas cosas que no tienen relación entre sí).
 *
 * RELACIÓN (sin jerga de AST): un archivo con FAN-OUT alto (depende de/hace
 * referencia a muchos otros archivos distintos) cuyos vecinos, a su vez,
 * prácticamente NO se conocen entre sí — el coeficiente de agrupamiento
 * local (Watts & Strogatz, "Collective dynamics of 'small-world' networks",
 * Nature 393, 1998, ecuación 2; misma fórmula que ya cita e implementa
 * `graph/metrics/agrupamiento.ts#clustering`) del propio archivo, sobre el
 * grafo de dependencias a grano archivo, es bajo.
 *
 * *** POR QUÉ ESTA COMBINACIÓN Y NO SÓLO "FAN-OUT ALTO" ***: el docstring de
 * `agrupamiento.ts` ya lo dice de forma textual y es la razón de ser de este
 * detector, citado acá porque es la observación central, no una nota al
 * margen: un fan-out alto por sí solo NO distingue nada — un Mediator y un
 * Facade bien aplicado tienen los dos fan-out alto. Lo que los separa es
 * exactamente si los vecinos del hub SE CONOCEN entre sí. Mediator existe
 * PARA que sus vecinos no tengan que conocerse (coeficiente ≈ 0); Facade
 * envuelve un subsistema cuyas piezas sí colaboran entre sí, así que sus
 * vecinos siguen densamente conectados (coeficiente alto). Este detector
 * dispara sólo en la esquina "fan-out alto Y coeficiente bajo" — la firma
 * de un Mediator roto o de un God Object que orquesta piezas ajenas entre
 * sí, no la de un Facade bien aplicado.
 *
 * POR QUÉ ES ESTRUCTURAL, NO LÉXICO: las dos señales son puramente de FORMA
 * del grafo (grado saliente distinto y coeficiente de agrupamiento local
 * sobre la proyección `file`) — cero vocabulario, cero nombres de archivo,
 * clase o carpeta.
 *
 * CÓMO ACCEDE A LAS MÉTRICAS SIN REIMPLEMENTAR EL ALGORITMO — Y LA
 * DESVIACIÓN MEDIDA frente al diseño de CONTRATO-F5.md §4.2/§4.3: ese
 * contrato describe un campo `RepoUnit.metrics` (poblado una vez por
 * `graph/metrics/run.ts#computeGraphMetrics`, con `needsEdges`/`needsMetrics`
 * en `InterFileDetector` y coverage `sin-aristas`/`sin-metricas` nuevos en el
 * runner) para que ningún detector llame a un `GraphMetric.compute` por su
 * cuenta. Verificado por grep antes de escribir este archivo: NADA de eso
 * existe hoy — `RepoUnit` (`detect/types.ts`) no tiene campo `metrics`,
 * `InterFileDetector` no tiene `needsEdges`/`needsMetrics`, y
 * `CoverageStatus` (`detect/types.ts`) no tiene `sin-aristas`/`sin-metricas`.
 * Ese campo es, hoy, infraestructura de otro agente que no aterrizó — y no
 * es de este archivo el construirla (regla: sólo mis archivos). Lo que SÍ
 * existe y ya corre en PRODUCCIÓN es `detect/reach.ts` (parte de Contrato 1,
 * ya cableado en `crossAnalyze`): llama directo a `projectGraph` +
 * `pagerank.compute`/`scc.compute`, sin pasar por ningún `RepoUnit.metrics`.
 * Este archivo sigue exactamente ese mismo precedente ya en producción:
 * importa `clustering`/`pagerank` (los objetos `GraphMetric` REGISTRADOS en
 * `graph/metrics/registry.ts`) y llama a su `.compute()` una vez por corrida
 * — nunca reimplementa la matemática de Watts-Strogatz ni la power-iteration
 * de PageRank, que es lo que "no recomputar" protege. Lo que este archivo NO
 * tiene, porque no existe todavía, es una CACHÉ compartida entre los 16
 * detectores de esta ola: si dos de ellos piden `pagerank` sobre el mismo
 * grafo, hoy cada uno paga su propia power-iteration. Documentado como
 * limitación de infraestructura, no de este detector — si `RepoUnit.metrics`
 * aterriza más adelante, este archivo debería migrar a leerlo en vez de
 * llamar `projectGraph`/`compute` acá.
 *
 * SIMPLIFICACIONES DECLARADAS:
 *  - Granularidad ARCHIVO, no clase/módulo: la proyección `file` es la que
 *    `pagerank`/`clustering` exponen hoy (mismo grano que el resto de F4).
 *    Un archivo con varias clases se trata como una sola unidad — mismo
 *    recorte que el resto de los detectores `inter-file` de este catálogo.
 *  - Fan-in y fan-out se leen de `pagerank.ts#PageRankValue` (ya los empaqueta
 *    junto al puntaje, "sin un segundo cómputo" — mismo criterio que
 *    `reach.ts` ya declara), no de un conteo propio.
 *  - "Vecinos totales" en `evidence` es `fanIn + fanOut`: una aproximación
 *    que puede sobreconstar si un vecino es simultáneamente fan-in Y fan-out
 *    del mismo archivo (par bidireccional) — declarado en el propio label,
 *    no oculto; no dispara nada, sólo se muestra.
 *  - Aristas consideradas: exactamente las que `pagerank.ts`/`agrupamiento.ts`
 *    ya declaran ("todas menos `contains`"), CUALQUIER `provenance` —
 *    incluida `inferred` — para no reimplementar un tercer criterio de
 *    filtrado por arista; la confianza de `inferred` se maneja bajando
 *    severidad (ver "OJO CON JAVA" abajo), no excluyendo la arista, porque
 *    excluirla cambiaría la topología que las métricas ya calcularon.
 *
 * CON QUÉ SE CONFUNDE — dos patrones legítimos, no uno solo:
 *
 * 1. FACADE BIEN APLICADO. Ya cubierto arriba: un Facade envuelve un
 *    subsistema cohesivo, así que sus vecinos siguen conectados entre sí
 *    (coeficiente alto) y el umbral de "bajo" de este detector existe
 *    exactamente para no confundirlo con un Mediator. El umbral elegido acá
 *    (`maxClustering`) es la línea que separa los dos patrones: subirlo
 *    hace este detector más permisivo con Facades imperfectos (los trata
 *    como Mediator); bajarlo lo hace más estricto y deja pasar Mediators
 *    con algo de acoplamiento incidental entre vecinos. No hay un valor
 *    "correcto" universal — es la decisión de diseño que este detector
 *    declara, con su fuente (o su ausencia) documentada en el umbral mismo.
 * 2. PUNTO DE ENTRADA / RAÍZ DE COMPOSICIÓN LEGÍTIMO. Un `main`, un
 *    bootstrap, o una raíz de inyección de dependencias que cablea muchos
 *    módulos INDEPENDIENTES entre sí en el arranque produce EXACTAMENTE la
 *    misma firma estructural que un Mediator roto: fan-out alto, coeficiente
 *    bajo (los módulos que cablea no se conocen entre sí — para eso existe
 *    la raíz de composición). No hay forma honesta de distinguir ambos sin
 *    una lista de nombres de archivo por convención (`main.*`, `index.*`,
 *    `bootstrap.*`, `Program.*`) — exactamente el vocabulario por lenguaje
 *    que la regla 4 prohíbe, aplicada a nombres de archivo en vez de nodos
 *    de gramática — así que este detector NO lo intenta: emite la señal
 *    completa y deja la distinción al lector, mismo criterio que
 *    `orphan-file.ts` ya declara para "punto de entrada" en su propio caso.
 *
 * LÍMITES POR LENGUAJE: ninguno explícito — el detector no lee `language`
 * salvo para decidir confianza (ver abajo), sólo `CodeGraphNode.file` y las
 * dos métricas ya proyectadas a `file`. Un lenguaje cuyo extractor todavía
 * no emite aristas tipadas de calidad se traduce en fan-out bajo para todos
 * sus archivos ⇒ cero candidatos, indistinguible de "no hay ningún Mediator
 * roto" — limitación heredada del grafo, no de este detector (mismo
 * criterio que `dependency-cycle.ts` ya declara para su propio caso).
 *
 * OJO CON JAVA — MEDIDO en la Ola 3/4, no supuesto: la etapa heurística
 * `path-proximity` (`provenance: "inferred"`) domina el 81% de las aristas
 * `references` ACEPTADAS en guava, y el dataset etiquetado a mano que valida
 * la cascada de resolución es sólo de Ruby. Este detector NO excluye
 * aristas `inferred` del cómputo de fan-out/coeficiente (excluirlas
 * cambiaría la topología que `pagerank`/`clustering` ya calcularon para
 * TODO el repo, no sólo para este hallazgo puntual), pero SÍ mide, por cada
 * archivo candidato, qué proporción de sus propias aristas (mismos kinds
 * que `pagerank`/`clustering`, cruzando archivo) tiene `provenance:
 * "inferred"`; si esa proporción supera 0.5 (mayoría heurística, mismo
 * corte que ya usa el resto del catálogo F5 para esta decisión), la
 * severidad se ACOTA (no sólo se reduce) a un techo bajo y `detail` lo dice
 * explícitamente — este archivo pide, en los hechos, evidencia `declared`/
 * `resolved` para emitir con confianza alta, tal como pide el brief de esta
 * tarea, aunque `RunContext` todavía no expone un `trustedEdge`/
 * `provenanceMix` genérico (esa pieza tampoco aterrizó — ver la nota de
 * arriba).
 *
 * CRITERIO UNIFICADO P5: este archivo fue el ORIGEN del criterio
 * `MAJORITY_INFERRED_RATIO`/`LOW_CONFIDENCE_SEVERITY_CEILING` de arriba —
 * en esta tarea se replicó, con los mismos nombres y el mismo corte (0.5 /
 * 35), en `layer-skip.ts`/`dependency-cycle.ts`/
 * `coupling-without-abstraction.ts`/`inappropriate-intimacy.ts` (los otros
 * cuatro detectores inter-file dependientes de aristas de dependencia, que
 * antes o no tenían amortiguador o usaban un criterio distinto —
 * `coupling-without-abstraction.ts` penalizaba por nombre de lenguaje
 * `.java`, no por provenance medido). Este archivo NO cambió: ya media
 * exactamente lo que el resto del catálogo unifica ahora. Límite MEDIDO,
 * compartido con los otros cuatro: en guava, este criterio ACOTA los 31
 * hallazgos de `fanout-without-cohesion` (100% de ellos, `path-proximity`
 * domina el cómputo de fan-out ahí) pero **no** ataja el bug de árbol espejo
 * que domina `dependency-cycle`/`layer-skip`/`inappropriate-intimacy` en el
 * mismo repo (esos pares se resuelven vía `resolved`/`global-uniqueness`, no
 * `inferred` — ver el docstring de `inappropriate-intimacy.ts` para la
 * medición completa). Es la MISMA regla aplicándose de forma desigual según
 * qué categoría de provenance domina cada detector, no una inconsistencia.
 */
import { citado, pisoDeclarado, presupuesto } from "../thresholds.js";
import type { Threshold } from "../thresholds.js";
import { clustering } from "../../graph/metrics/agrupamiento.js";
import { pagerank } from "../../graph/metrics/pagerank.js";
import { projectGraph } from "../../graph/metrics/projection.js";
import { createComputeBudget } from "../../graph/metrics/budget.js";
import { fileNodeId } from "../../graph/types.js";
import type { CodeGraph } from "../../graph/types.js";
import type { FileSummary, InterFileDetector, RawFinding, RepoUnit, RunContext } from "../types.js";

type ThresholdKey = "minFanOut" | "maxClustering";

/**
 * SonarSource, regla S1200 ("Classes should not have too many dependencies"
 * — acoplamiento eferente/fan-out de una unidad): umbral por defecto 20
 * para Java, verificado contra dos fuentes independientes de SonarSource
 * (foro de la comunidad y un issue de `sonar-dotnet` que cita el mismo
 * default). GRANULARIDAD DECLARADA: S1200 mide a nivel de CLASE; este
 * detector opera a nivel de ARCHIVO (la proyección `file` que
 * `pagerank`/`clustering` ya exponen) — se usa como el proxy más cercano
 * disponible hoy, no como una migración literal de la regla.
 */
const MIN_FAN_OUT_SPEC = citado(20, {
  work: "SonarSource",
  rule: "S1200: Classes should not have too many dependencies — acoplamiento eferente, default 20 (Java)",
  url: "https://rules.sonarsource.com/java/RSPEC-1200/",
});

/**
 * "Bajo" para el coeficiente de agrupamiento local: menos de 1 de cada 5
 * pares posibles de vecinos de este archivo se conocen entre sí. Elegido a
 * mano, no derivado de literatura: Watts & Strogatz (ya citado arriba y por
 * `agrupamiento.ts`) define la FÓRMULA del coeficiente, no un corte de
 * calidad de diseño que separe "Mediator" de "Facade" — hasta donde se
 * buscó, no existe una regla publicada de un linter/herramienta que
 * umbralice este coeficiente para este propósito. Es la línea que decide
 * entre los dos patrones (ver "CON QUÉ SE CONFUNDE" en el docstring del
 * módulo): subirla amplía qué se lee como Mediator, bajarla lo restringe.
 */
const MAX_CLUSTERING_SPEC = pisoDeclarado(0.2, {
  rationale:
    "menos de 1 de cada 5 pares posibles de vecinos conectados entre sí; sin cita porque no hay, hasta donde se " +
    "buscó, un umbral publicado que separe 'Mediator' de 'Facade' por este coeficiente — Watts & Strogatz define " +
    "la fórmula, no un corte de diseño. Es la línea que decide entre los dos patrones, documentada como tal.",
});

/** CONTRATO-F4.md §1.8: tope de VOLUMEN propio, no de detección. Un archivo
 *  con fan-out >= 20 Y coeficiente de agrupamiento bajo ya es un caso
 *  relativamente raro (sólo los verdaderos hubs del repo lo alcanzan); un
 *  panel legible no necesita mostrar más de unas pocas decenas a la vez. */
const MAX_FINDINGS_SPEC = presupuesto(40, {
  rationale:
    "fan-out >= 20 con coeficiente de agrupamiento bajo entre vecinos ya filtra a los verdaderos hubs del repo; " +
    "un panel legible no lista de forma útil más de unas pocas decenas de casos a la vez.",
});

/** Mayoría de aristas `inferred` (mismo corte 0.5 que el resto del catálogo
 *  F5 usa para esta decisión — ver "OJO CON JAVA" en el docstring). No es
 *  un `Threshold` de detección: no decide SI se emite, sólo cuánto se acota
 *  la severidad de lo que ya se decidió emitir. */
const MAJORITY_INFERRED_RATIO = 0.5;
const LOW_CONFIDENCE_SEVERITY_CEILING = 35;

interface FileProvenanceCount {
  total: number;
  inferred: number;
}

/**
 * Una pasada O(E) sobre `graph.edges`, contando por archivo cuántas de sus
 * aristas (mismos `kinds` que `pagerank`/`clustering`, cruzando archivo)
 * son `provenance: "inferred"` — mismo idioma de una sola pasada que
 * `orphan-file.ts#computeCrossFileConnectedFiles` ya usa para su propio
 * conteo, aplicado acá a provenance en vez de a conectividad.
 */
function computeInferredRatioByFile(graph: CodeGraph, kinds: ReadonlySet<string>): Map<string, FileProvenanceCount> {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const counts = new Map<string, FileProvenanceCount>();
  const bump = (file: string, isInferred: boolean): void => {
    let c = counts.get(file);
    if (!c) {
      c = { total: 0, inferred: 0 };
      counts.set(file, c);
    }
    c.total++;
    if (isInferred) c.inferred++;
  };
  for (const e of graph.edges) {
    if (!kinds.has(e.kind)) continue;
    const from = nodeById.get(e.from);
    const to = nodeById.get(e.to);
    if (!from || !to || from.file === to.file) continue;
    const isInferred = e.provenance === "inferred";
    bump(from.file, isInferred);
    bump(to.file, isInferred);
  }
  return counts;
}

function inferredRatioOf(counts: ReadonlyMap<string, FileProvenanceCount>, file: string): number {
  const c = counts.get(file);
  if (!c || c.total === 0) return 0;
  return c.inferred / c.total;
}

/**
 * Severidad: crece con el EXCESO de fan-out sobre el umbral y con qué tan
 * por debajo del umbral cae el coeficiente de agrupamiento (más bajo =
 * vecindario más "extraño entre sí" = más compatible con Mediator roto que
 * con Facade). Monótona en ambas magnitudes por separado. Si la mayoría de
 * las aristas de este archivo son `inferred`, se ACOTA (no sólo se resta) a
 * un techo bajo — ver "OJO CON JAVA" en el docstring del módulo.
 */
function severityOf(fanOut: number, minFanOut: number, coefficient: number, maxClustering: number, inferredRatio: number): number {
  const fanOutExcess = Math.max(0, fanOut - minFanOut);
  const cohesionGap = Math.max(0, maxClustering - coefficient) / Math.max(maxClustering, 1e-6);
  let severity = 35 + Math.min(35, fanOutExcess * 1.5) + Math.min(30, cohesionGap * 30);
  if (inferredRatio > MAJORITY_INFERRED_RATIO) severity = Math.min(severity, LOW_CONFIDENCE_SEVERITY_CEILING);
  return Math.max(15, Math.min(100, Math.round(severity)));
}

/**
 * Único lugar que arma los `RawFinding[]` — separado de `detector.run` para
 * testear sin `RunContext`, mismo patrón que los detectores hermanos.
 */
export function buildFanoutWithoutCohesionFindings(
  repo: RepoUnit,
  graph: CodeGraph,
  minFanOut: Threshold,
  maxClustering: Threshold,
): RawFinding[] {
  if (graph.nodes.length === 0) return [];

  const prGraph = projectGraph(graph, "file", pagerank.edgeKinds);
  const prResult = pagerank.compute(prGraph, { budget: createComputeBudget() });
  const clGraph = projectGraph(graph, "file", clustering.edgeKinds);
  const clResult = clustering.compute(clGraph, { budget: createComputeBudget() });

  // Presupuesto agotado sobre un grafo excepcionalmente grande, o proyección
  // vacía: degradar a "sin hallazgos" en vez de un mapa parcial — mismo
  // criterio neutro que `reach.ts` ya declara para el mismo caso.
  //
  // OLA AI (frente AI1) — ESTA RAMA ERA EL NO-DETERMINISMO DEL ANALIZADOR, y
  // se deja EXACTAMENTE COMO ESTÁ porque no es la rama la que estaba mal: era
  // su condición. Con `createBudget()` (reloj de pared, 30 ms) `clustering`
  // sobre el grafo real de `corpus-app/Ghost` mide 20,6–31,0 ms y se agota ~4
  // de cada 15 veces, así que este `return []` convertía 40 hallazgos en 0
  // según la carga de la máquina — y sin dejar rastro: la fila de `coverage`
  // que `run.ts` escribe sale `corrio` con `findings: 0`, indistinguible de
  // "no hay hubs". Con `createComputeBudget()` la condición ya no es un reloj
  // y la rama sólo queda para la proyección vacía. Ver `budget.ts`.
  if (prResult.status !== "computed" || !prResult.values || clResult.status !== "computed" || !clResult.values) {
    return [];
  }

  const inferredCounts = computeInferredRatioByFile(graph, new Set(pagerank.edgeKinds));
  const summaryByFileId = new Map<string, FileSummary>(repo.files.map((f) => [fileNodeId(f.path), f] as const));

  const findings: RawFinding[] = [];

  for (const fileId of prGraph.nodeIds) {
    const summary = summaryByFileId.get(fileId);
    if (!summary) continue; // nodo proyectado sin archivo real correspondiente (p.ej. una carpeta) — defensivo

    const pr = prResult.values.get(fileId);
    const fanOut = pr?.fanOut ?? 0;
    const fanIn = pr?.fanIn ?? 0;
    if (fanOut < minFanOut.value) continue;

    const coefficient = clResult.values.get(fileId) ?? 0;
    if (coefficient > maxClustering.value) continue;

    const inferredRatio = inferredRatioOf(inferredCounts, summary.path);
    const severity = severityOf(fanOut, minFanOut.value, coefficient, maxClustering.value, inferredRatio);
    const lowConfidence = inferredRatio > MAJORITY_INFERRED_RATIO;

    const detailParts = [
      `"${summary.path}" depende de ${fanOut} archivos distintos, y esos archivos apenas se conocen entre sí ` +
        "(coeficiente de agrupamiento de su vecindario muy por debajo del umbral): cada uno de ellos aporta una " +
        "pieza sin relación estructural con las demás, así que entender o probar lo que este archivo coordina " +
        "exige leer TODAS las piezas por separado, porque ninguna se explica a través de otra.",
      "Esta misma firma (fan-out alto, vecinos que no se conocen) la produce también un Facade bien aplicado " +
        "SI su umbral de agrupamiento fuera más generoso, y la produce un punto de entrada o raíz de composición " +
        "legítimo que cablea módulos independientes a propósito en el arranque — confirmar cuál es este archivo " +
        "antes de refactorizar, revisando si las piezas que coordina deberían, en los hechos, conocerse entre sí.",
    ];
    if (lowConfidence) {
      detailParts.push(
        `Confianza reducida: ${Math.round(inferredRatio * 100)}% de las aristas de este archivo provienen de ` +
          "la etapa heurística de resolución (path-proximity, provenance 'inferred'), no validada contra un " +
          "dataset etiquetado fuera de Ruby — la severidad se acota en consecuencia.",
      );
    }

    findings.push({
      title: `"${summary.path}" orquesta ${fanOut} archivos que no colaboran entre sí`,
      detail: detailParts.join(" "),
      trigger: [
        { label: "archivos distintos de los que depende (fan-out)", value: fanOut, threshold: minFanOut },
        {
          label: "coeficiente de agrupamiento entre sus vecinos (más bajo = vecinos más desconocidos entre sí)",
          value: Math.round(coefficient * 1000) / 1000,
          threshold: maxClustering,
        },
      ],
      evidence: [
        {
          label: "vecinos totales (fan-in + fan-out, con posible solapamiento si un vecino es ambos)",
          value: fanIn + fanOut,
        },
        { label: "% de sus aristas con provenance 'inferred'", value: Math.round(inferredRatio * 100) },
      ],
      locations: [
        {
          file: summary.path,
          startLine: 1,
          endLine: Math.max(1, summary.lines),
          role: "archivo con fan-out alto y coeficiente de agrupamiento bajo entre sus vecinos",
        },
      ],
      severity,
      advice: {
        primary: {
          name: "Extract Class / Introduce Facade sobre un subsistema real",
          kind: "refactorizacion",
          why:
            "Si las piezas que este archivo coordina deberían colaborar entre sí, agruparlas detrás de una " +
            "fachada real las vuelve mutuamente inteligibles; si de verdad no deberían conocerse, partir este " +
            "archivo en varios mediadores más chicos, cada uno con menos piezas ajenas, reduce cuánto hay que " +
            "leer para entender un solo cambio.",
          source: "https://refactoring.guru/es/smells/inappropriate-intimacy",
        },
      },
    });
  }

  return findings;
}

export const detector: InterFileDetector<ThresholdKey, "fanout-without-cohesion"> = {
  id: "fanout-without-cohesion",
  kind: "fanout-without-cohesion",
  scope: "inter-file",
  needsGraph: true,
  title: "Fan-out sin cohesión",
  // Graph-shape puro (grado saliente + coeficiente de agrupamiento sobre la
  // proyección `file`), no gramática de lenguaje — mismo criterio que
  // `dependency-cycle`/`orphan-file`/`unused-symbol` ya declaran.
  needs: [],
  // OLA A3: mismo par `pagerank`/`clustering` que `divergent-change.ts` —
  // unión genérica de 7 kinds importada del metric compartido. Se declara
  // sólo `references` — ver `types.ts#needsEdges`, "unión genérica".
  needsEdges: ["references"],
  thresholds: {
    minFanOut: MIN_FAN_OUT_SPEC,
    maxClustering: MAX_CLUSTERING_SPEC,
  },
  maxFindings: MAX_FINDINGS_SPEC,
  run(repo: RepoUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const graph = repo.graph;
    // Defensivo: `run.ts#runInterFile` ya filtra `needsGraph && graph ===
    // null` ANTES de llamar a `run()` (reporta `sin-grafo`) — mismo patrón
    // que los tres detectores hermanos.
    if (!graph) return [];
    return buildFanoutWithoutCohesionFindings(repo, graph, ctx.threshold("minFanOut"), ctx.threshold("maxClustering"));
  },
};
