import path from "node:path";
import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";
async function main() {
  const dir = process.argv[2]!;
  const state: { graph: CodeGraph | null } = { graph: null };
  await analyzeRepo({ dir: path.resolve(dir), repoName: "x", limits: { maxFindings: "unlimited" }, onGraph: (r) => { state.graph = r.graph; } });
  const graph = state.graph!;
  const nodeById = new Map(graph.nodes.map(n => [n.id, n] as const));
  const IMPL_KINDS = new Set(["extends", "implements", "satisfies"]);
  const originsByDest = new Map<string, Set<string>>();
  for (const e of graph.edges) {
    if (!IMPL_KINDS.has(e.kind)) continue;
    const toNode = nodeById.get(e.to);
    if (toNode?.kind !== "symbol" || toNode.family !== "class-like") continue;
    const set = originsByDest.get(e.to) ?? new Set<string>();
    set.add(e.from);
    originsByDest.set(e.to, set);
  }
  const singleImpl = [...originsByDest.entries()].filter(([, s]) => s.size === 1);
  console.log(`destinos class-like con exactamente 1 origen (extends/implements/satisfies): ${singleImpl.length}`);
  for (const [dest, origins] of singleImpl.slice(0, 30)) {
    const dn = nodeById.get(dest);
    const on = nodeById.get([...origins][0]!);
    console.log(`  ${dn?.file}#${dn?.symbolPath.join(".")}  <-  ${on?.file}#${on?.symbolPath.join(".")}`);
  }
}
main();
