/**
 * Ola 10 — Null Object, verificación de las DOS FORMAS ESTRUCTURALES
 * (COMPLETA/PARCIAL, `hypotheses/null-object.ts#findNullObjectStructuralCandidates`)
 * contra un repo real, vía el grafo REAL (`analyzeRepo#onGraph`).
 *
 * Corre `findNullObjectStructuralCandidates` DIRECTAMENTE sobre el grafo
 * (no pasa por `attachHypotheses`/`crossAnalyze`) porque quiero contar TODOS
 * los candidatos estructurales del repo, no sólo los que terminan colgando
 * de un `Finding` `distributed-duplication` real (que puede no existir en un
 * repo/fixture chico). Esto responde la pregunta "¿la lógica estructural,
 * con un grafo real, encuentra la forma?" — la misma pregunta que
 * `measure-builder-structural.mts`/`measure-wrapping-chain-smoke.mts` ya
 * hacen para sus propias hipótesis.
 *
 * También corre `nullObject.build()` END TO END sobre cada `distributed-
 * duplication` real que el repo produzca (si alguno), para reportar la
 * distribución de estados que un usuario vería en el panel — reusa
 * `attachHypotheses`'s misma señal (`ctx.repo.graph` real, `ctx.file`/
 * `ctx.fileAt` null) sin reconstruir el analizador completo.
 *
 * UN repo por proceso, guava sola — regla de memoria de la ola.
 *
 * Uso:
 *   npx tsx scripts/measure-null-object-structural.mts <dir> <slug>
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { Capability } from "../src/server/services/detect/capabilities.js";
import { pisoDeclarado, resolveThreshold } from "../src/server/services/detect/thresholds.js";
import { EMPTY_NEIGHBORHOOD } from "../src/server/services/graph/neighborhood.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";
import {
  findNullObjectStructuralCandidates,
  nullObject,
  type NullObjectStructuralCandidate,
} from "../src/server/services/hypotheses/null-object.js";
import type { HypothesisContext } from "../src/server/services/hypotheses/types.js";

function ctxFor(graph: CodeGraph | null): HypothesisContext {
  return {
    file: null,
    fileAt: () => null,
    repo: { repoName: "", files: [], functions: [], clones: [], graph },
    capabilities: new Set<Capability>(),
    setsFor: () => ({
      functionNodes: new Set(),
      branchNodes: new Set(),
      chainNodes: new Set(),
      cloneNodes: new Set(),
      classNodes: new Set(),
      nestingNodes: new Set(),
      constructorNodes: new Set(),
      exceptionNodes: new Set(),
      switchContainerNodes: new Set(),
    }),
    neighborhood: EMPTY_NEIGHBORHOOD,
    branches: () => null,
  };
}

function describe(graph: CodeGraph, id: string): string {
  const n = graph.nodes.find((x) => x.id === id);
  if (!n) return id;
  return n.symbolPath.length > 0 ? `${n.file}#${n.symbolPath.join(".")}` : n.file;
}

async function main(): Promise<void> {
  const [, , dir, slug] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/measure-null-object-structural.mts <dir> <slug>");
    process.exit(1);
  }

  let graph: CodeGraph | null = null;
  const analysis = await analyzeRepo({
    dir: path.resolve(dir),
    repoName: slug,
    limits: { maxFindings: "unlimited" },
    onGraph: (r) => {
      graph = r.graph;
    },
  });

  const candidates: readonly NullObjectStructuralCandidate[] = findNullObjectStructuralCandidates(graph);
  const completa = candidates.filter((c) => c.form === "completa");
  const parcial = candidates.filter((c) => c.form === "parcial");

  const ddFindings = analysis.findings.filter((f) => f.kind === "distributed-duplication");
  const ctx = ctxFor(graph);
  const stateCounts: Record<string, number> = { ausente: 0, parcial: 0, "ya-aplicado": 0, "aplicado-eludido": 0, "sin-candidata": 0 };
  for (const cf of ddFindings) {
    const threshold = resolveThreshold(pisoDeclarado(cf.metric.value, { rationale: "adaptador de medición (no de producción)" }), {
      language: "javascript",
      sampleSize: () => 0,
      corpusP95: () => null,
    });
    const finding = {
      id: cf.id ?? "n/a",
      detectorId: cf.kind,
      kind: cf.kind,
      scope: "inter-file" as const,
      language: null,
      title: cf.title,
      detail: cf.detail,
      trigger: [{ label: cf.metric.label, value: cf.metric.value, threshold }] as const,
      locations: cf.locations.map((l) => ({ file: l.file, startLine: l.startLine, endLine: l.endLine, symbol: l.symbol, role: "n/a" })),
      severity: cf.severity,
      advice: cf.advice ?? { primary: { name: "n/a", kind: "refactorizacion" as const, why: "n/a", source: "n/a" } },
    };
    const h = nullObject.build(finding as any, graph, ctx);
    stateCounts[h ? h.state : "sin-candidata"] = (stateCounts[h ? h.state : "sin-candidata"] ?? 0) + 1;
  }

  console.log(
    JSON.stringify(
      {
        slug,
        estructural: {
          completa: completa.length,
          parcial: parcial.length,
          ejemplosCompleta: completa.slice(0, 5).map((c) => ({
            nullType: graph ? describe(graph, c.nullTypeId) : c.nullTypeId,
            interfaz: graph && c.interfaceId ? describe(graph, c.interfaceId) : c.interfaceId,
            viaSatisfies: c.viaSatisfies,
            miembros: c.coveredMembers.map((m) => `${m.name}/${m.arity}`),
            sitiosInstanciacion: c.instantiationSites.length,
          })),
          ejemplosParcial: parcial.slice(0, 5).map((c) => ({
            nullType: graph ? describe(graph, c.nullTypeId) : c.nullTypeId,
            miembros: c.coveredMembers.map((m) => `${m.name}/${m.arity}`),
            sitiosInstanciacion: c.instantiationSites.length,
          })),
        },
        distributedDuplicationFindings: ddFindings.length,
        estadosEndToEnd: stateCounts,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
