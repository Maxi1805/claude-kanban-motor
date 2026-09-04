/**
 * Ola 11a, paquete P1-umbral-singleton-y-censo — MEDICIÓN antes de tocar el
 * número. `MIN_SITES_SPEC = pisoDeclarado(6, …)` en
 * `detect/inter-file/scattered-instantiation.ts:129` es la causa única del
 * silencio total de Singleton (ver docstring de `hypotheses/singleton.ts`).
 * Antes de bajar ese piso hace falta saber la distribución REAL de
 * `distinctFiles` (archivos DISTINTOS que instancian el MISMO tipo destino)
 * — no adivinarla.
 *
 * Reimplementa, a propósito, la MISMA agrupación que
 * `scattered-instantiation.ts#groupInstantiationsByTarget` (aristas
 * `instantiates` con provenance `declared`/`resolved` — nunca `inferred` ni
 * `ambiguous` — agrupadas por `edge.to`, contando archivos de origen
 * distintos) en vez de importarla: esa función no está exportada (no hace
 * falta exportar producción sólo para medir), y el criterio de "arista
 * confiable" es público y estable (mismo texto que `isConfidentInstantiationEdge`).
 *
 * NO corre sobre corpus externo: `CK_CORPUS_DIR` no está seteado y no existe
 * `corpus/guava` en disco (ver PENDIENTES.md/encargo de esta ola) — sólo
 * `tests/fixtures/patterns/singleton` y `tests/fixtures/patterns` completo.
 *
 * Uso:
 *   npx tsx scripts/measure-scattered-instantiation-histogram.mts <dir> <slug>
 *
 * Ejemplos usados por este paquete:
 *   npx tsx scripts/measure-scattered-instantiation-histogram.mts tests/fixtures/patterns/singleton singleton-solo
 *   npx tsx scripts/measure-scattered-instantiation-histogram.mts tests/fixtures/patterns fixtures-multi
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeGraph, CodeGraphEdge, CodeGraphNode } from "../src/server/services/graph/types.js";

function isConfidentInstantiationEdge(edge: CodeGraphEdge): boolean {
  return edge.kind === "instantiates" && edge.provenance !== "inferred" && edge.provenance !== "ambiguous";
}

function typeName(node: CodeGraphNode): string {
  return node.symbolPath[node.symbolPath.length - 1] ?? node.file;
}

interface TargetGroup {
  readonly toId: string;
  readonly typeLabel: string;
  readonly files: Set<string>;
  totalOccurrences: number;
}

function histogram(graph: CodeGraph): { groups: TargetGroup[]; distinctFilesCounts: number[] } {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const groups = new Map<string, TargetGroup>();

  for (const edge of graph.edges) {
    if (!isConfidentInstantiationEdge(edge)) continue;
    const toNode = nodeById.get(edge.to);
    const fromNode = nodeById.get(edge.from);
    if (!toNode || !fromNode) continue;
    if (toNode.family !== "class-like") continue; // mismo filtro que la producción: sólo tipos declarados en el repo

    let group = groups.get(edge.to);
    if (!group) {
      group = { toId: edge.to, typeLabel: `${typeName(toNode)} (${toNode.file})`, files: new Set(), totalOccurrences: 0 };
      groups.set(edge.to, group);
    }
    group.files.add(fromNode.file);
    group.totalOccurrences += edge.weight;
  }

  const list = [...groups.values()];
  return { groups: list, distinctFilesCounts: list.map((g) => g.files.size) };
}

async function main(): Promise<void> {
  const [, , dir, slug] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/measure-scattered-instantiation-histogram.mts <dir> <slug>");
    process.exit(1);
  }
  const rootDir = path.resolve(dir);

  let graph: CodeGraph | null = null;
  const t0 = performance.now();
  await analyzeRepo({
    dir: rootDir,
    repoName: slug,
    limits: { maxFindings: "unlimited" },
    onGraph: (r: { graph: CodeGraph }) => (graph = r.graph),
  });
  const wallMs = Math.round(performance.now() - t0);

  if (!graph) {
    console.log(JSON.stringify({ slug, dir: rootDir, wallMs, error: "sin grafo (repo vacío o falla de build)" }, null, 2));
    return;
  }

  const { groups, distinctFilesCounts } = histogram(graph);
  const sorted = [...distinctFilesCounts].sort((a, b) => b - a);
  const maxDistinctFiles = sorted[0] ?? 0;
  const buckets = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6+": 0 } as Record<string, number>;
  for (const n of distinctFilesCounts) {
    const key = n >= 6 ? "6+" : String(n);
    buckets[key] = (buckets[key] ?? 0) + 1;
  }
  const top = [...groups]
    .sort((a, b) => b.files.size - a.files.size)
    .slice(0, 10)
    .map((g) => ({ type: g.typeLabel, distinctFiles: g.files.size, totalOccurrences: g.totalOccurrences }));

  console.log(
    JSON.stringify(
      {
        slug,
        dir: rootDir,
        wallMs,
        graphNodes: (graph as CodeGraph).nodes.length,
        graphEdges: (graph as CodeGraph).edges.length,
        distinctTargetTypesWithAnyInstantiation: groups.length,
        maxDistinctFiles,
        histogramByDistinctFileCount: buckets,
        top10ByDistinctFiles: top,
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
