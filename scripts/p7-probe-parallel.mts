/**
 * Sonda P7 (Ola P) — investigar la SEGUNDA causa de `parallel-hierarchies` en cero
 * (después de que la Ola O arreglara el auto-emparejamiento con `dedupeMirroredComponents`).
 *
 * Corre `analyzeRepo` real y reimplementa EXACTAMENTE la lógica de
 * `detect/inter-file/parallel-hierarchies.ts` (con el dedupe de espejo incluido) para
 * imprimir, por firma de forma, cuántas componentes sobreviven y sus raíces/archivos —
 * la misma técnica que `probe-parallel-hierarchies.mts` (Ola B) pero con el dedupe de
 * espejo de la Ola O ya aplicado, para ver qué queda vivo HOY.
 *
 * Uso: npx tsx scripts/p7-probe-parallel.mts <dir> <slug>
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeGraph, CodeGraphEdge } from "../src/server/services/graph/types.js";

interface ClassNode {
  readonly id: string;
  readonly file: string;
  readonly symbolPath: readonly string[];
}

function classNodesOf(graph: CodeGraph): Map<string, ClassNode> {
  const out = new Map<string, ClassNode>();
  for (const n of graph.nodes) {
    if (n.kind === "symbol" && n.family === "class-like") {
      out.set(n.id, { id: n.id, file: n.file, symbolPath: n.symbolPath });
    }
  }
  return out;
}

function isIsaEdge(e: CodeGraphEdge, classNodes: ReadonlyMap<string, ClassNode>): boolean {
  return (e.kind === "extends" || e.kind === "implements") && e.provenance !== "ambiguous" && e.from !== e.to && classNodes.has(e.from) && classNodes.has(e.to);
}

interface IsaAdjacency {
  readonly children: ReadonlyMap<string, ReadonlySet<string>>;
  readonly parents: ReadonlyMap<string, ReadonlySet<string>>;
}

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
      for (const nb of neighbors) {
        if (!seen.has(nb)) {
          seen.add(nb);
          stack.push(nb);
        }
      }
    }
    comps.push(comp.sort());
  }
  return comps;
}

interface HierarchyShape {
  readonly size: number;
  readonly rootCount: number;
  readonly signature: string;
}

function shapeOf(comp: readonly string[], adj: IsaAdjacency): HierarchyShape {
  const roots = comp.filter((id) => (adj.parents.get(id)?.size ?? 0) === 0);
  const degrees = comp.map((id) => adj.children.get(id)?.size ?? 0).sort((a, b) => a - b);
  return { size: comp.length, rootCount: roots.length, signature: `${comp.length}|${roots.length}|${degrees.join(",")}` };
}

function memberSignature(comp: readonly string[], classNodes: ReadonlyMap<string, ClassNode>): string {
  return comp.map((id) => classNodes.get(id)!.symbolPath.join(".")).sort().join("|");
}

function dedupeMirroredComponents(list: readonly string[][], classNodes: ReadonlyMap<string, ClassNode>): string[][] {
  const bestByMembers = new Map<string, string[]>();
  for (const comp of list) {
    const key = memberSignature(comp, classNodes);
    const prev = bestByMembers.get(key);
    if (!prev) {
      bestByMembers.set(key, comp);
      continue;
    }
    const prevFile = classNodes.get(prev[0]!)!.file;
    const compFile = classNodes.get(comp[0]!)!.file;
    if (compFile < prevFile) bestByMembers.set(key, comp);
  }
  return [...bestByMembers.values()];
}

async function main(): Promise<void> {
  const [, , dir, slug] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/p7-probe-parallel.mts <dir> <slug>");
    process.exit(1);
  }
  const state: { graph: CodeGraph | null } = { graph: null };
  await analyzeRepo({
    dir: path.resolve(dir),
    repoName: slug,
    limits: { maxFindings: "unlimited" },
    onGraph: (r) => {
      state.graph = r.graph;
    },
  });
  const graph = state.graph;
  if (!graph) {
    console.log(`[${slug}] sin CodeGraph.`);
    return;
  }

  const classNodes = classNodesOf(graph);
  const adj = buildIsaAdjacency(graph, classNodes);
  const MIN_HIERARCHY_SIZE = 3;
  const comps = connectedComponents(adj).filter((c) => c.length >= MIN_HIERARCHY_SIZE);

  const bySignature = new Map<string, string[][]>();
  for (const comp of comps) {
    const sig = shapeOf(comp, adj).signature;
    const list = bySignature.get(sig) ?? [];
    list.push(comp);
    bySignature.set(sig, list);
  }
  for (const [sig, list] of bySignature) bySignature.set(sig, dedupeMirroredComponents(list, classNodes));

  const groups = [...bySignature.entries()].filter(([, list]) => list.length > 1);
  console.log(`[${slug}] classNodes=${classNodes.size} componentes>=3=${comps.length} firmas=${bySignature.size} grupos(>1 tras dedupe espejo)=${groups.length}`);
  for (const [sig, list] of groups.sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  firma ${sig} x${list.length} familias:`);
    for (const comp of list) {
      const roots = comp.filter((id) => (adj.parents.get(id)?.size ?? 0) === 0);
      const rootDesc = roots.map((r) => `${classNodes.get(r)!.file}#${classNodes.get(r)!.symbolPath.join(".")}`).join(" & ");
      console.log(`      [${comp.length}m] ${rootDesc}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
