/**
 * Sonda P7 — compara, sobre el MISMO volcado de grafo (`p8-dump-grafo.mts`),
 * el algoritmo de `parallel-hierarchies` DE HOY (post-arreglo, importado de
 * verdad) contra el de ANTES de mi cambio (reimplementado a mano, idéntico
 * al árbol previo a esta ola salvo por mis dos filtros nuevos) — aísla MI
 * delta del de los otros once frentes que tocan el mismo grafo esta ola.
 *
 * Uso: npx tsx scripts/p7-compare-dump.mts <volcado.json>
 */
import { readFileSync } from "node:fs";

import { buildParallelHierarchiesFindings } from "../src/server/services/detect/inter-file/parallel-hierarchies.js";
import { pisoDeclarado, presencia, resolveThreshold } from "../src/server/services/detect/thresholds.js";
import type { CodeGraph, CodeGraphEdge } from "../src/server/services/graph/types.js";
import type { RepoUnit } from "../src/server/services/detect/types.js";

const RESOLVE_INPUT = { language: "*", sampleSize: () => 0, corpusP95: () => null };

interface ClassNode {
  readonly id: string;
  readonly file: string;
  readonly symbolPath: readonly string[];
}
function classNodesOf(graph: CodeGraph): Map<string, ClassNode> {
  const out = new Map<string, ClassNode>();
  for (const n of graph.nodes) if (n.kind === "symbol" && n.family === "class-like") out.set(n.id, { id: n.id, file: n.file, symbolPath: n.symbolPath });
  return out;
}
function isIsaEdge(e: CodeGraphEdge, classNodes: ReadonlyMap<string, ClassNode>): boolean {
  return (e.kind === "extends" || e.kind === "implements") && e.provenance !== "ambiguous" && e.from !== e.to && classNodes.has(e.from) && classNodes.has(e.to);
}
interface IsaAdjacency { children: Map<string, Set<string>>; parents: Map<string, Set<string>> }
function buildIsaAdjacency(graph: CodeGraph, classNodes: ReadonlyMap<string, ClassNode>): IsaAdjacency {
  const children = new Map<string, Set<string>>();
  const parents = new Map<string, Set<string>>();
  for (const e of graph.edges) {
    if (!isIsaEdge(e, classNodes)) continue;
    if (!children.has(e.to)) children.set(e.to, new Set());
    children.get(e.to)!.add(e.from);
    if (!parents.has(e.from)) parents.set(e.from, new Set());
    parents.get(e.from)!.add(e.to);
  }
  return { children, parents };
}
function connectedComponents(adj: IsaAdjacency): string[][] {
  const participants = new Set<string>([...adj.children.keys(), ...adj.parents.keys()]);
  for (const set of adj.children.values()) for (const id of set) participants.add(id);
  for (const set of adj.parents.values()) for (const id of set) participants.add(id);
  const seen = new Set<string>();
  const comps: string[][] = [];
  for (const start of participants) {
    if (seen.has(start)) continue;
    const stack = [start];
    seen.add(start);
    const comp: string[] = [];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      comp.push(cur);
      const neighbors = new Set<string>([...(adj.children.get(cur) ?? []), ...(adj.parents.get(cur) ?? [])]);
      for (const nb of neighbors) if (!seen.has(nb)) { seen.add(nb); stack.push(nb); }
    }
    comps.push(comp.sort());
  }
  return comps;
}
function shapeOf(comp: readonly string[], adj: IsaAdjacency): string {
  const roots = comp.filter((id) => (adj.parents.get(id)?.size ?? 0) === 0);
  const degrees = comp.map((id) => adj.children.get(id)?.size ?? 0).sort((a, b) => a - b);
  return `${comp.length}|${roots.length}|${degrees.join(",")}`;
}
function memberSignature(comp: readonly string[], classNodes: ReadonlyMap<string, ClassNode>): string {
  return comp.map((id) => classNodes.get(id)!.symbolPath.join(".")).sort().join("|");
}
function dedupeMirroredComponents(list: readonly string[][], classNodes: ReadonlyMap<string, ClassNode>): string[][] {
  const bestByMembers = new Map<string, string[]>();
  for (const comp of list) {
    const key = memberSignature(comp, classNodes);
    const prev = bestByMembers.get(key);
    if (!prev) { bestByMembers.set(key, comp); continue; }
    const prevFile = classNodes.get(prev[0]!)!.file;
    const compFile = classNodes.get(comp[0]!)!.file;
    if (compFile < prevFile) bestByMembers.set(key, comp);
  }
  return [...bestByMembers.values()];
}
/** Reproduce el algoritmo EXACTO previo a esta ola (Ola O): sólo dedupe de espejo, sin
 *  dedupe por archivo compartido y sin el tope de EXACTAMENTE 2 familias por firma. */
function oldAlgorithm(repo: RepoUnit, graph: CodeGraph): { title: string; files: string[] }[] {
  const classNodes = classNodesOf(graph);
  if (classNodes.size === 0) return [];
  const adj = buildIsaAdjacency(graph, classNodes);
  const comps = connectedComponents(adj).filter((c) => c.length >= 3);
  if (comps.length <= 1) return [];
  const bySignature = new Map<string, string[][]>();
  for (const comp of comps) {
    const sig = shapeOf(comp, adj);
    const list = bySignature.get(sig);
    if (list) list.push(comp); else bySignature.set(sig, [comp]);
  }
  for (const [sig, list] of bySignature) bySignature.set(sig, dedupeMirroredComponents(list, classNodes));
  const groups = [...bySignature.entries()].filter(([, list]) => list.length > 1);
  return groups.map(([sig, group]) => ({
    title: `${group.length} jerarquías, firma ${sig}`,
    files: group.map((comp) => classNodes.get(comp[0]!)!.file),
  }));
}

const [, , dumpFile] = process.argv;
if (!dumpFile) { console.error("Uso: npx tsx scripts/p7-compare-dump.mts <volcado.json>"); process.exit(1); }
const dump = JSON.parse(readFileSync(dumpFile, "utf8")) as {
  slug: string; files: { path: string; lines: number; language: string }[];
  resolution: CodeGraph["resolution"]; nodes: CodeGraph["nodes"]; edges: CodeGraph["edges"];
};
const graph: CodeGraph = { nodes: dump.nodes, edges: dump.edges, resolution: dump.resolution };
const repo: RepoUnit = { repoName: dump.slug, files: dump.files, functions: [], clones: [], graph };

const oldFindings = oldAlgorithm(repo, graph);
const newFindings = buildParallelHierarchiesFindings(
  repo,
  graph,
  resolveThreshold(pisoDeclarado(3, { rationale: "sonda" }), RESOLVE_INPUT),
  resolveThreshold(presencia({ rationale: "sonda" }), RESOLVE_INPUT),
);

console.log(`[${dump.slug}] ANTES (algoritmo Ola O, mismo grafo de hoy): ${oldFindings.length} hallazgos`);
for (const f of oldFindings) console.log(`    - ${f.title} :: ${f.files.join(" | ")}`);
console.log(`[${dump.slug}] DESPUÉS (con el arreglo P7): ${newFindings.length} hallazgos`);
for (const f of newFindings) console.log(`    - ${f.title} :: ${f.locations.map((l) => l.file).join(" | ")}`);
