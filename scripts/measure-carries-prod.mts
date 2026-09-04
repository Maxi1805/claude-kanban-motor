/**
 * P5 (Ola 10) — medición (b): volumen REAL de `carries`/`invokes-indirect`
 * en producción, con el pipeline REAL (`analyzeRepo`, el mismo camino que
 * usa `code-inspector.ts`), NO el script standalone de medición
 * (`scripts/measure-carries.mts`, que arma `GraphFileFacts` a mano con
 * `carrierFacts` y por eso sobreestima — ver `ola9-revision-costo.md` #5).
 * Este script sólo LEE el grafo que `analyzeRepo` entrega vía `onGraph`
 * (mismo grafo que ve una hipótesis real) — no construye nada por su cuenta.
 * Sólo tiene sentido correr DESPUÉS de que `code-analyzer.ts` arme
 * `GraphFileFacts` con el campo `carrierFacts` (si P3 no cableó eso, este
 * script va a dar carries=0/carrierNodes=0 igual que en producción hoy —
 * eso también es una medición válida, no un error).
 *
 * UN repo por proceso, guava sola — regla de memoria de la ola.
 *
 * Uso:
 *   npx tsx scripts/measure-carries-prod.mts <dir> <slug> [salida.json]
 */
import { promises as fsp } from "node:fs";
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";

async function main(): Promise<void> {
  const [, , dir, slug, outPath] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/measure-carries-prod.mts <dir> <slug> [salida.json]");
    process.exit(1);
  }
  const rootDir = path.resolve(dir);
  let graph: CodeGraph | null = null;
  let buildMs = 0;
  const rss0 = process.memoryUsage().rss;
  const t0 = performance.now();
  const analysis = await analyzeRepo({
    dir: rootDir,
    repoName: slug,
    limits: { maxFindings: "unlimited" },
    onGraph: (r) => {
      graph = r.graph;
      buildMs = Math.round(r.buildMs);
    },
  });
  const wallMs = Math.round(performance.now() - t0);
  const rssPeakMB = Math.round(process.memoryUsage().rss / 1024 / 1024);

  if (!graph) {
    console.error(`${slug}: sin grafo (buildGraphIncremental falló) — nada que medir.`);
    process.exit(1);
  }
  const g = graph as CodeGraph;

  const carries = g.edges.filter((e) => e.kind === "carries");
  const invokesIndirect = g.edges.filter((e) => e.kind === "invokes-indirect");
  const carrierNodes = g.nodes.filter((n) => (n as { kind: string }).kind === "carrier");
  const carrierFormCounts: Record<string, number> = {};
  for (const n of carrierNodes) {
    const form = (n as { carrierForm?: string }).carrierForm ?? "sin-forma";
    carrierFormCounts[form] = (carrierFormCounts[form] ?? 0) + 1;
  }
  const carriesByProvenance: Record<string, number> = {};
  for (const e of carries) carriesByProvenance[e.provenance] = (carriesByProvenance[e.provenance] ?? 0) + 1;

  const fanIn = new Map<string, number>();
  for (const e of carries) fanIn.set(e.to, (fanIn.get(e.to) ?? 0) + 1);
  const fanInDist: Record<string, number> = {};
  for (const n of fanIn.values()) {
    const bucket = n >= 5 ? "5+" : String(n);
    fanInDist[bucket] = (fanInDist[bucket] ?? 0) + 1;
  }
  const observerCandidates = [...fanIn.entries()].filter(([, n]) => n >= 2);

  const result = {
    slug,
    files: analysis.analysedFiles,
    languages: analysis.languages,
    nodes: g.nodes.length,
    edges: g.edges.length,
    carries: { total: carries.length, byProvenance: carriesByProvenance },
    invokesIndirect: { total: invokesIndirect.length },
    carrierNodes: { total: carrierNodes.length, byForm: carrierFormCounts },
    carriesFanIn: { distinctTargets: fanIn.size, distribution: fanInDist, observerCandidatesFanInGte2: observerCandidates.length },
    sampleObserverCandidates: observerCandidates.slice(0, 10).map(([to, n]) => ({ to, fanIn: n })),
    buildMs,
    wallMs,
    rssPeakMB,
    rssDeltaMB: Math.round((process.memoryUsage().rss - rss0) / 1024 / 1024),
  };

  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (outPath) {
    await fsp.mkdir(path.dirname(path.resolve(outPath)), { recursive: true });
    await fsp.writeFile(outPath, text, "utf8");
    console.error(
      `${slug}: carries=${carries.length} invokes-indirect=${invokesIndirect.length} carrierNodes=${carrierNodes.length} ` +
        `fanIn>=2=${observerCandidates.length} nodes=${g.nodes.length} edges=${g.edges.length} buildMs=${buildMs} wallMs=${wallMs} rss=${rssPeakMB}MB -> ${outPath}`,
    );
  } else {
    process.stdout.write(text);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
