/**
 * PageRank sobre el grafo dirigido de referencias (proyección `file`), más
 * fan-in/fan-out crudos — CONTRATO-F4.md §3.1 (fila `pagerank`, damping
 * 0,85, proyección `file`, "todas menos `contains`", costo `iterativo`).
 *
 * Es la base declarada de la priorización por impacto: un archivo con
 * PageRank alto es uno al que apuntan (transitivamente) muchos archivos
 * importantes, no simplemente uno con fan-in alto — la diferencia entre las
 * dos es justamente lo que PageRank aporta sobre un conteo crudo. Por eso
 * el valor de cada nodo lleva las TRES cifras juntas: quien prioriza puede
 * comparar el ranking propagado contra el grado crudo y notar cuándo
 * difieren (un archivo con fan-in bajo pero PageRank alto porque lo
 * referencia un hub, o viceversa).
 *
 * Power iteration clásica de Brin & Page, ponderada por `ProjectedGraph.
 * weight` (occurrences colapsadas — CONTRATO-F4.md §3.1's `ProjectedGraph`),
 * con corrección de nodos "dangling" (fan-out cero: su masa se redistribuye
 * uniformemente en vez de perderse, si no el total dejaría de sumar 1 y la
 * comparación entre corridas de tamaño de grafo distinto dejaría de tener
 * sentido) y criterio de convergencia L1, EXACTAMENTE como lo hace la
 * implementación de referencia citada abajo (`networkx.pagerank`), para no
 * inventar un tercer criterio sin precedente.
 */
import { citado, resolveThreshold } from "../../detect/thresholds.js";
import { EDGE_KINDS_EXCEPT_CONTAINS } from "./projection.js";
import type { EdgeKind } from "../types.js";
import type { GraphMetric, MetricResult, ProjectedGraph } from "./types.js";

/**
 * CONTRATO-F4.md §3.1: "todas menos `contains`".
 *
 * OLA Q — **era una lista de siete escrita a mano y le faltaba `calls`**, o sea
 * que esta métrica (y los cuatro consumidores que reusan `pagerank.edgeKinds`
 * para proyectar) medía impacto sin ver ni una sola llamada. Hoy se DERIVA del
 * catálogo de `EdgeKind`; la razón completa, y por qué también se resta
 * `affects`, está en `EDGE_KINDS_EXCEPT_CONTAINS`.
 */
const EDGE_KINDS_FOR_PAGERANK: readonly EdgeKind[] = EDGE_KINDS_EXCEPT_CONTAINS;

// Los tres parámetros del algoritmo, con marca de procedencia obligatoria
// (`detect/thresholds.ts` — regla transversal de CONTRATO-F4.md: "todo
// umbral/lista nuevo... nunca como constante SCREAMING_CASE suelta"). Los
// tres citan la MISMA implementación de referencia para que damping/
// tolerancia/tope de iteraciones sean un conjunto coherente, no tres
// elecciones independientes.
const NETWORKX_PAGERANK = {
  work: "NetworkX, `networkx.algorithms.link_analysis.pagerank_alg.pagerank`",
  url: "https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.link_analysis.pagerank_alg.pagerank.html",
};

const DAMPING_SPEC = citado(0.85, {
  ...NETWORKX_PAGERANK,
  rule: "alpha=0.85 default, igual al 0,85 original de Brin & Page (1998)",
});
const TOLERANCE_SPEC = citado(1e-6, { ...NETWORKX_PAGERANK, rule: "tol=1e-06 default" });
const MAX_ITERATIONS_SPEC = citado(100, { ...NETWORKX_PAGERANK, rule: "max_iter=100 default" });

const NO_LANGUAGE_INPUT = { language: "n/a", sampleSize: () => 0, corpusP95: () => null };
const DAMPING = resolveThreshold(DAMPING_SPEC, NO_LANGUAGE_INPUT).value;
const TOLERANCE = resolveThreshold(TOLERANCE_SPEC, NO_LANGUAGE_INPUT).value;
const MAX_ITERATIONS = resolveThreshold(MAX_ITERATIONS_SPEC, NO_LANGUAGE_INPUT).value;

export interface PageRankValue {
  /** Puntaje de PageRank, converge a sumar ~1 sobre todos los nodos. */
  readonly pagerank: number;
  /** Fan-in CRUDO: cantidad de nodos distintos que referencian a éste (sin ponderar por ocurrencias). */
  readonly fanIn: number;
  /** Fan-out CRUDO: cantidad de nodos distintos a los que éste referencia. */
  readonly fanOut: number;
}

function computeRawDegrees(g: ProjectedGraph): { fanIn: number[]; fanOut: number[] } {
  const n = g.nodeIds.length;
  const fanOut = new Array<number>(n);
  const fanIn = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    fanOut[i] = g.out[i]!.length;
    for (const j of g.out[i]!) fanIn[j]! += 1;
  }
  return { fanIn, fanOut };
}

/**
 * Una iteración de power-iteration ponderada, con corrección de dangling —
 * CONTRATO-F4.md §3.2: "se consulta [el presupuesto] ENTRE tajadas". Cada
 * llamada a esta función ES una tajada: el llamador chequea el presupuesto
 * entre llamadas, nunca dentro de este loop sobre nodos/aristas.
 */
function iterate(
  g: ProjectedGraph,
  rank: Float64Array<ArrayBuffer>,
  totalOutWeight: Float64Array<ArrayBuffer>,
): Float64Array<ArrayBuffer> {
  const n = g.nodeIds.length;
  const next = new Float64Array(n).fill((1 - DAMPING) / n);

  let danglingMass = 0;
  for (let i = 0; i < n; i++) {
    if (g.out[i]!.length === 0) danglingMass += rank[i]!;
  }
  const danglingShare = (DAMPING * danglingMass) / n;

  for (let i = 0; i < n; i++) {
    const outIds = g.out[i]!;
    if (outIds.length === 0) continue;
    const total = totalOutWeight[i]!;
    const contribution = DAMPING * rank[i]!;
    const weights = g.weight[i]!;
    for (let k = 0; k < outIds.length; k++) {
      const j = outIds[k]!;
      next[j]! += (contribution * weights[k]!) / total;
    }
  }
  for (let i = 0; i < n; i++) next[i]! += danglingShare;
  return next;
}

export const pagerank: GraphMetric<PageRankValue> = {
  id: "pagerank",
  title: "PageRank (referencias)",
  projection: "file",
  edgeKinds: EDGE_KINDS_FOR_PAGERANK,
  cost: "iterativo",

  compute(g, ctx): MetricResult<PageRankValue> {
    const start = performance.now();
    if (g.projection !== "file") {
      return {
        status: "no-aplicable",
        elapsedMs: performance.now() - start,
        reason: `pagerank opera sobre la proyección "file"; se recibió "${g.projection}".`,
      };
    }

    const n = g.nodeIds.length;
    const { fanIn, fanOut } = computeRawDegrees(g);

    if (n === 0) {
      return { status: "computed", values: new Map(), elapsedMs: performance.now() - start };
    }

    const totalOutWeight = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (const w of g.weight[i]!) sum += w;
      totalOutWeight[i] = sum;
    }

    let rank = new Float64Array(n).fill(1 / n);
    let iterations = 0;
    let converged = false;

    for (; iterations < MAX_ITERATIONS; iterations++) {
      const next = iterate(g, rank, totalOutWeight);
      let err = 0;
      for (let i = 0; i < n; i++) err += Math.abs(next[i]! - rank[i]!);
      rank = next;
      if (err < n * TOLERANCE) {
        converged = true;
        iterations++;
        break;
      }
      // CONTRATO-F4.md §3.2: se consulta el presupuesto ENTRE tajadas
      // (acá, entre iteraciones completas de power-iteration), nunca por
      // nodo dentro de una iteración.
      if (ctx.budget.expired()) {
        return {
          status: "presupuesto-agotado",
          elapsedMs: performance.now() - start,
          reason: `agotado tras ${iterations + 1} iteración(es) de ${MAX_ITERATIONS}, sin converger (presupuesto ${ctx.budget.maxMs} ms).`,
        };
      }
    }

    const values = new Map<string, PageRankValue>();
    for (let i = 0; i < n; i++) {
      values.set(g.nodeIds[i]!, { pagerank: rank[i]!, fanIn: fanIn[i]!, fanOut: fanOut[i]! });
    }
    return {
      status: "computed",
      values,
      elapsedMs: performance.now() - start,
      reason: converged
        ? `convergió en ${iterations} iteración(es) (error L1 < N·${TOLERANCE}).`
        : `alcanzó el tope de ${MAX_ITERATIONS} iteraciones sin converger al ${TOLERANCE} de tolerancia; valores son la mejor aproximación disponible.`,
    };
  },
};
