/**
 * AI1 — UNA CORRIDA REPRODUCIBLE DEL ANALIZADOR, PARA COMPARAR HALLAZGO POR HALLAZGO.
 *
 * Igual que `dump-hallazgos.mts` pero (a) llama `analyzeRepo` DIRECTO, sin pasar por
 * la cache, y (b) deja al lado, sobre EL MISMO grafo que acaba de construir, una
 * sonda del presupuesto de reloj de pared de `graph/metrics/budget.ts#createBudget()`
 * en cada uno de los sitios de produccion que ABANDONAN el calculo cuando se agota.
 *
 * Uso: npx tsx scripts/ai1-corrida.mts <dir> <salida.json> [repsSonda]
 */
import { writeFileSync } from "node:fs";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";
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
  console.error("Uso: npx tsx scripts/ai1-corrida.mts <dir> <salida.json> [repsSonda]");
  process.exit(1);
}
const REPS = Number(repsRaw ?? "5");

const t0 = performance.now();
let graph: CodeGraph | null = null;
const a = await analyzeRepo({
  dir,
  repoName: "ai1",
  limits: { maxFindings: "unlimited" },
  onGraph: (r) => {
    graph = r.graph;
  },
});
const wallMs = Math.round(performance.now() - t0);

const findings = a.findings.map((f) => ({
  id: f.id ?? stableFindingId(f),
  kind: f.kind,
  where: f.locations[0] ? `${f.locations[0].file}:${f.locations[0].startLine}` : "",
  nHip: (f.hypotheses ?? []).length,
}));
const porKind: Record<string, number> = {};
for (const f of findings) porKind[f.kind] = (porKind[f.kind] ?? 0) + 1;

const sitios = [
  { sitio: "reach.ts:76 pagerank", metric: pagerank, proj: "file" as const },
  { sitio: "reach.ts:80 scc", metric: scc, proj: "file" as const },
  { sitio: "fanout-without-cohesion.ts:281 pagerank", metric: pagerank, proj: "file" as const },
  { sitio: "fanout-without-cohesion.ts:283 clustering", metric: clustering, proj: "file" as const },
  { sitio: "god-component.ts:452 pagerank", metric: pagerank, proj: "file" as const },
  { sitio: "god-component.ts:456 scc", metric: scc, proj: "file" as const },
  { sitio: "divergent-change.ts:391 clustering", metric: clustering, proj: "file" as const },
  { sitio: "divergent-change.ts:392 pagerank", metric: pagerank, proj: "file" as const },
  { sitio: "distributed-duplication.ts:272 connected-components", metric: connectedComponentsMetric, proj: "file" as const },
  { sitio: "unstable-dependency.ts:265 instability", metric: instability, proj: "module" as const },
  { sitio: "facade.ts:590 clustering", metric: clustering, proj: "file" as const },
];

const sondas: unknown[] = [];
if (graph) {
  const g: CodeGraph = graph;
  for (const s of sitios) {
    const pg = projectGraph(g, s.proj, s.metric.edgeKinds);
    const muestras: { status: string; elapsedMs: number }[] = [];
    for (let i = 0; i < REPS; i++) {
      const r = s.metric.compute(pg as never, { budget: createBudget() } as never);
      muestras.push({ status: r.status, elapsedMs: Math.round((r.elapsedMs ?? 0) * 100) / 100 });
    }
    sondas.push({
      sitio: s.sitio,
      nodos: pg.nodeIds.length,
      agotados: muestras.filter((m) => m.status !== "computed").length,
      reps: REPS,
      ms: muestras.map((m) => m.elapsedMs),
    });
  }
}

writeFileSync(
  out,
  JSON.stringify(
    {
      dir,
      wallMs,
      budgetMs: DEFAULT_METRIC_BUDGET_MS,
      nodosGrafo: graph ? (graph as CodeGraph).nodes.length : 0,
      aristasGrafo: graph ? (graph as CodeGraph).edges.length : 0,
      total: findings.length,
      porKind,
      sondas,
      findings,
    },
    null,
    1,
  ),
);
console.log(`${out}: ${findings.length} hallazgos, ${wallMs}ms`);
