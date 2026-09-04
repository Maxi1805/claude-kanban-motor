/**
 * Sonda B3 (Ola B) — Incógnita A del encargo: "`parallel-hierarchies` da 0
 * sobre el Rails con 152 aristas `extends` presentes, y sigue dando 0 con su
 * compuerta neutralizada." Corre el pipeline REAL (`analyzeRepo` + `onGraph`,
 * mismo patrón que `dump-graph-census.mts`/`debug-composite-graph.mts`) y
 * reproduce, a mano, EXACTAMENTE la misma lógica de
 * `detect/inter-file/parallel-hierarchies.ts` — `classNodesOf` →
 * `buildIsaAdjacency` → `connectedComponents` → filtro por `minHierarchySize`
 * → agrupar por firma de forma → filtro por `minGroupSize` — imprimiendo el
 * conteo en CADA paso, para ver en cuál se cae a cero. Nunca importa el
 * detector (que exigiría reconstruir `RunContext`); reimplementa el mismo
 * algoritmo puro sobre el `CodeGraph` capturado, línea por línea.
 *
 * Uso: npx tsx scripts/probe-parallel-hierarchies.mts <dir> <slug>
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

function isIsaEdge(e: CodeGraphEdge, classNodes: ReadonlyMap<string, ClassNode>, edgeKinds: ReadonlySet<string>): boolean {
  return edgeKinds.has(e.kind) && e.provenance !== "ambiguous" && e.from !== e.to && classNodes.has(e.from) && classNodes.has(e.to);
}

interface IsaAdjacency {
  readonly children: ReadonlyMap<string, ReadonlySet<string>>;
  readonly parents: ReadonlyMap<string, ReadonlySet<string>>;
}

function buildIsaAdjacency(graph: CodeGraph, classNodes: ReadonlyMap<string, ClassNode>, edgeKinds: ReadonlySet<string>): IsaAdjacency {
  const children = new Map<string, Set<string>>();
  const parents = new Map<string, Set<string>>();
  for (const e of graph.edges) {
    if (!isIsaEdge(e, classNodes, edgeKinds)) continue;
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

async function main(): Promise<void> {
  const [, , dir, slug] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/probe-parallel-hierarchies.mts <dir> <slug>");
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
    console.log(`[${slug}] onGraph nunca se llamó — sin CodeGraph.`);
    return;
  }

  console.log(`[${slug}] nodes=${graph.nodes.length} edges=${graph.edges.length}`);

  const classNodes = classNodesOf(graph);
  console.log(`[${slug}] paso 1 — classNodesOf: ${classNodes.size} nodos class-like`);
  if (classNodes.size === 0) {
    console.log(`[${slug}] CAE ACÁ: cero nodos class-like — sin candidatos, el detector nunca ve ni un extends/implements.`);
    return;
  }

  const edgeCounts: Record<string, number> = {};
  for (const e of graph.edges) edgeCounts[e.kind] = (edgeCounts[e.kind] ?? 0) + 1;
  console.log(`[${slug}] aristas por kind (grafo completo):`, edgeCounts);

  const extendsEdges = graph.edges.filter((e) => e.kind === "extends");
  const implementsEdges = graph.edges.filter((e) => e.kind === "implements");
  console.log(`[${slug}] extends totales=${extendsEdges.length} (provenance: ${JSON.stringify(tallyProv(extendsEdges))})`);
  console.log(`[${slug}] implements totales=${implementsEdges.length} (provenance: ${JSON.stringify(tallyProv(implementsEdges))})`);

  const extendsAmongClassNodes = extendsEdges.filter((e) => classNodes.has(e.from) && classNodes.has(e.to));
  const implementsAmongClassNodes = implementsEdges.filter((e) => classNodes.has(e.from) && classNodes.has(e.to));
  console.log(
    `[${slug}] de esas, con AMBOS extremos class-like: extends=${extendsAmongClassNodes.length} implements=${implementsAmongClassNodes.length}`,
  );

  for (const [label, edgeKinds] of [
    ["extends+implements (real, como el detector)", new Set(["extends", "implements"])],
    ["sólo extends (compuerta implements neutralizada)", new Set(["extends"])],
  ] as const) {
    console.log(`\n[${slug}] === ${label} ===`);
    const adj = buildIsaAdjacency(graph, classNodes, edgeKinds);
    const allComps = connectedComponents(adj);
    console.log(`[${slug}] paso 2 — connectedComponents (sin filtrar tamaño): ${allComps.length} componentes`);
    const sizes = allComps.map((c) => c.length).sort((a, b) => b - a);
    console.log(`[${slug}] tamaños de componente (desc, top 20): ${sizes.slice(0, 20).join(", ")}`);

    const MIN_HIERARCHY_SIZE = 3;
    const comps = allComps.filter((c) => c.length >= MIN_HIERARCHY_SIZE);
    console.log(`[${slug}] paso 3 — tras minHierarchySize>=${MIN_HIERARCHY_SIZE}: ${comps.length} componentes sobreviven`);
    if (comps.length === 0) {
      console.log(`[${slug}] CAE ACÁ: ninguna componente conexa alcanza tamaño ${MIN_HIERARCHY_SIZE}.`);
      continue;
    }

    const bySignature = new Map<string, string[][]>();
    for (const comp of comps) {
      const sig = shapeOf(comp, adj).signature;
      const list = bySignature.get(sig) ?? [];
      list.push(comp);
      bySignature.set(sig, list);
    }
    console.log(`[${slug}] paso 4 — firmas de forma distintas entre esas componentes: ${bySignature.size}`);
    const sigSizes = [...bySignature.entries()].map(([sig, list]) => `${sig} x${list.length}`).sort();
    console.log(`[${slug}] firmas (signature x cantidad de componentes con esa firma):`);
    for (const s of sigSizes) console.log(`    ${s}`);

    const MIN_GROUP_SIZE = 2;
    const groups = [...bySignature.entries()].filter(([, list]) => list.length >= MIN_GROUP_SIZE);
    console.log(`[${slug}] paso 5 — grupos con >=${MIN_GROUP_SIZE} componentes de la MISMA firma: ${groups.length}`);
    if (groups.length === 0) {
      console.log(
        `[${slug}] CAE ACÁ: ${bySignature.size} componente(s) sobrevivieron el piso de tamaño, pero cada una tiene una forma ÚNICA — ninguna firma se repite >=2 veces. Esto es "hay jerarquías, pero ninguna con una GEMELA de la misma forma", no "no hay jerarquías".`,
      );
    } else {
      console.log(`[${slug}] ${groups.length} grupo(s) producirían Finding — parallel-hierarchies debería disparar acá.`);
      for (const [sig, list] of groups) {
        console.log(`    firma ${sig}: ${list.length} familias — ejemplo raíces:`);
        for (const comp of list.slice(0, 3)) {
          const roots = comp.filter((id) => (adj.parents.get(id)?.size ?? 0) === 0);
          for (const r of roots) {
            const cn = classNodes.get(r)!;
            console.log(`        ${cn.file}#${cn.symbolPath.join(".")}`);
          }
        }
      }
    }
  }
}

function tallyProv(edges: readonly CodeGraphEdge[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of edges) out[e.provenance] = (out[e.provenance] ?? 0) + 1;
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
