/**
 * AI1 — SONDA DEL PRESUPUESTO DE RELOJ DE PARED.
 *
 * Hipotesis a falsar: los detectores/hipotesis que llaman `GraphMetric.compute`
 * con `graph/metrics/budget.ts#createBudget()` (techo de 30 ms de RELOJ DE PARED)
 * ABANDONAN el calculo cuando el presupuesto se agota y degradan a "sin hallazgos".
 * Si el mismo grafo, en el mismo proceso, a veces entra en 30 ms y a veces no,
 * el analizador NO es determinista y la variable es la CARGA DE LA MAQUINA.
 *
 * Metodo: se construye el grafo UNA vez (analyzeRepo real, cache apagada por el
 * caller) y despues se repite N veces cada una de las llamadas a metrica que hay
 * en produccion, con su MISMO `projectGraph` y su MISMO `createBudget()`.
 * Se publica status + elapsedMs de cada repeticion.
 *
 * Uso: CK_ANALYSIS_CACHE=0 npx tsx scripts/ai1-sonda-presupuesto.mts <dir> <salida.json> [reps]
 */
import { writeFileSync } from "node:fs";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";
import { projectGraph } from "../src/server/services/graph/metrics/projection.js";
import { createBudget, DEFAULT_METRIC_BUDGET_MS } from "../src/server/services/graph/metrics/budget.js";
import { pagerank } from "../src/server/services/graph/metrics/pagerank.js";
import { clustering } from "../src/server/services/graph/metrics/agrupamiento.js";
import { scc } from "../src/server/services/graph/metrics/ciclos.js";
import { connectedComponentsMetric } from "../src/server/services/graph/metrics/componentes.js";
import { instability } from "../src/server/services/graph/metrics/instability.js";

const [, , dir, out, repsRaw] = process.argv;
if (!dir || !out) {
  console.error("Uso: npx tsx scripts/ai1-sonda-presupuesto.mts <dir> <salida.json> [reps]");
  process.exit(1);
}
const REPS = Number(repsRaw ?? "15");

let graph: CodeGraph | null = null;
const analysis = await analyzeRepo({
  dir,
  repoName: "ai1-sonda",
  limits: { maxFindings: "unlimited" },
  onGraph: (r) => {
    graph = r.graph;
  },
});
if (!graph) {
  console.error("sin grafo");
  process.exit(2);
}
const g: CodeGraph = graph;

const sitios = [
  { sitio: "reach.ts:76 pagerank", metric: pagerank },
  { sitio: "reach.ts:80 scc", metric: scc },
  { sitio: "fanout-without-cohesion.ts:281 pagerank", metric: pagerank },
  { sitio: "fanout-without-cohesion.ts:283 clustering", metric: clustering },
  { sitio: "god-component.ts:452 pagerank", metric: pagerank },
  { sitio: "god-component.ts:456 scc", metric: scc },
  { sitio: "divergent-change.ts:391 clustering", metric: clustering },
  { sitio: "divergent-change.ts:392 pagerank", metric: pagerank },
  { sitio: "distributed-duplication.ts:272 connected-components", metric: connectedComponentsMetric },
  { sitio: "unstable-dependency.ts:265 instability", metric: instability },
  { sitio: "facade.ts:590 clustering", metric: clustering },
] as const;

const filas: unknown[] = [];
for (const s of sitios) {
  const pg = projectGraph(g, "file", s.metric.edgeKinds);
  const muestras: { status: string; elapsedMs: number }[] = [];
  for (let i = 0; i < REPS; i++) {
    const r = s.metric.compute(pg as never, { budget: createBudget() } as never);
    muestras.push({ status: r.status, elapsedMs: Math.round((r.elapsedMs ?? 0) * 100) / 100 });
  }
  const ms = muestras.map((m) => m.elapsedMs).sort((a, b) => a - b);
  const agotados = muestras.filter((m) => m.status !== "computed").length;
  filas.push({
    sitio: s.sitio,
    metric: s.metric.id,
    nodos: pg.nodeIds.length,
    reps: REPS,
    agotados,
    min: ms[0],
    p50: ms[Math.floor(ms.length / 2)],
    max: ms[ms.length - 1],
    muestras,
  });
  console.log(
    `${s.sitio.padEnd(50)} nodos=${String(pg.nodeIds.length).padStart(6)} agotados=${agotados}/${REPS}  ms min/p50/max = ${ms[0]}/${ms[Math.floor(ms.length / 2)]}/${ms[ms.length - 1]}`,
  );
}

writeFileSync(
  out,
  JSON.stringify(
    {
      dir,
      budgetMs: DEFAULT_METRIC_BUDGET_MS,
      nodos: g.nodes.length,
      aristas: g.edges.length,
      hallazgos: analysis.findings.length,
      fanout: analysis.findings.filter((f) => f.kind === "fanout-without-cohesion").length,
      godComponent: analysis.findings.filter((f) => f.kind === "god-component").length,
      divergentChange: analysis.findings.filter((f) => f.kind === "divergent-change").length,
      distributedDuplication: analysis.findings.filter((f) => f.kind === "distributed-duplication").length,
      unstableDependency: analysis.findings.filter((f) => f.kind === "unstable-dependency").length,
      filas,
    },
    null,
    1,
  ),
);
console.log(`\n${out} escrito. budget=${DEFAULT_METRIC_BUDGET_MS}ms  nodos=${g.nodes.length} aristas=${g.edges.length}`);
