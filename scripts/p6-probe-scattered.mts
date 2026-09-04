/**
 * P6 (Ola P) — sonda de medición para `scattered-instantiation`, NO productiva.
 * Reimplementa la MISMA agrupación que el detector (mismo criterio que
 * `measure-scattered-instantiation-histogram.mts` ya documenta: no se
 * importa la función interna porque no está exportada) para listar, por
 * grupo que hoy SUPERA minSites=3, los archivos de origen y su fan-out de
 * instanciación, más el conteo de miembros propios (function-like) del tipo
 * destino vía aristas `contains`.
 *
 * Uso: npx tsx scripts/p6-probe-scattered.mts <dir> <slug>
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeGraph, CodeGraphEdge, CodeGraphNode } from "../src/server/services/graph/types.js";

const MIN_SITES = 3;
const MAX_FANOUT = 6;

function isConfidentInstantiationEdge(edge: CodeGraphEdge): boolean {
  return edge.kind === "instantiates" && edge.provenance !== "inferred" && edge.provenance !== "ambiguous";
}
const HIERARCHY_EDGE_KINDS = new Set(["extends", "implements", "satisfies"]);

async function main(): Promise<void> {
  const [, , dir, slug] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/p6-probe-scattered.mts <dir> <slug>");
    process.exit(1);
  }
  const rootDir = path.resolve(dir);
  let graph: CodeGraph | null = null;
  await analyzeRepo({
    dir: rootDir,
    repoName: slug,
    limits: { maxFindings: "unlimited" },
    onGraph: (r: { graph: CodeGraph }) => (graph = r.graph),
  });
  if (!graph) {
    console.log(JSON.stringify({ slug, error: "sin grafo" }));
    return;
  }
  const g = graph as CodeGraph;
  const nodeById = new Map(g.nodes.map((n) => [n.id, n] as const));

  const hierarchyParticipants = new Set<string>();
  for (const e of g.edges) {
    if (!HIERARCHY_EDGE_KINDS.has(e.kind)) continue;
    if (e.provenance === "inferred" || e.provenance === "ambiguous") continue;
    hierarchyParticipants.add(e.from);
  }

  const targetsByOrigin = new Map<string, Set<string>>();
  for (const e of g.edges) {
    if (!isConfidentInstantiationEdge(e)) continue;
    const to = nodeById.get(e.to);
    const from = nodeById.get(e.from);
    if (!to || !from || to.family !== "class-like") continue;
    let s = targetsByOrigin.get(from.file);
    if (!s) targetsByOrigin.set(from.file, (s = new Set()));
    s.add(e.to);
  }
  const fanoutByFile = new Map<string, number>();
  for (const [f, s] of targetsByOrigin) fanoutByFile.set(f, s.size);

  // Miembros propios (function-like) por nodo class-like, vía `contains`.
  const ownMethodCount = new Map<string, number>();
  for (const e of g.edges) {
    if (e.kind !== "contains") continue;
    const to = nodeById.get(e.to);
    if (!to || to.kind !== "symbol" || to.family !== "function-like") continue;
    ownMethodCount.set(e.from, (ownMethodCount.get(e.from) ?? 0) + 1);
  }
  // Incoming instantiates por nodo (¿alguien construye este tipo/archivo?) —
  // usado para ver si el ORIGEN mismo es "raíz" (nadie lo instancia).
  const incomingInstantiates = new Map<string, number>();
  for (const e of g.edges) {
    if (!isConfidentInstantiationEdge(e)) continue;
    incomingInstantiates.set(e.to, (incomingInstantiates.get(e.to) ?? 0) + 1);
  }

  interface Group {
    toId: string;
    label: string;
    sites: Map<string, number>; // file -> occurrences (weight sum)
  }
  const groups = new Map<string, Group>();
  for (const e of g.edges) {
    if (!isConfidentInstantiationEdge(e)) continue;
    const to = nodeById.get(e.to);
    const from = nodeById.get(e.from);
    if (!to || !from || to.family !== "class-like") continue;
    if (hierarchyParticipants.has(e.to)) continue;
    if ((fanoutByFile.get(from.file) ?? 0) > MAX_FANOUT) continue;
    let grp = groups.get(e.to);
    if (!grp) {
      const label = `${to.symbolPath[to.symbolPath.length - 1] ?? to.file} (${to.file})`;
      groups.set(e.to, (grp = { toId: e.to, label, sites: new Map() }));
    }
    grp.sites.set(from.file, (grp.sites.get(from.file) ?? 0) + e.weight);
  }

  const surviving = [...groups.values()].filter((g2) => g2.sites.size >= MIN_SITES);
  surviving.sort((a, b) => b.sites.size - a.sites.size);

  const out = surviving.map((g2) => ({
    target: g2.label,
    distinctFiles: g2.sites.size,
    ownMethodCount: ownMethodCount.get(g2.toId) ?? 0,
    incomingInstantiatesOnTargetItself: incomingInstantiates.get(g2.toId) ?? 0,
    sites: [...g2.sites.entries()].map(([file, occ]) => ({
      file,
      occurrences: occ,
      originFanout: fanoutByFile.get(file) ?? 0,
    })),
  }));

  console.log(JSON.stringify({ slug, groupsSurvivingMinSites: out.length, groups: out }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
