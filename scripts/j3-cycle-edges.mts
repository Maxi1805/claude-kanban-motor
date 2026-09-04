// SONDA J3 (temporal): para un conjunto de archivos (un ciclo ya reportado),
// imprime las aristas de CodeGraph.edges entre ESOS archivos con su kind/provenance/resolvedBy.
import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";

async function main() {
  const [dir, slug, ...files] = process.argv.slice(2);
  const { graph } = await analyzeRepoCached({ dir, repoName: slug, limits: { maxFindings: "unlimited" } });
  if (!graph) {
    console.log("sin graph en analysis");
    return;
  }
  const fileSet = new Set(files);
  const nodeById = new Map(graph.nodes.map((n: any) => [n.id, n]));
  let count = 0;
  for (const e of graph.edges) {
    const from = nodeById.get(e.from) as any;
    const to = nodeById.get(e.to) as any;
    if (!from || !to) continue;
    if (from.file === to.file) continue;
    if (!fileSet.has(from.file) || !fileSet.has(to.file)) continue;
    if (e.kind === "contains") continue;
    console.log(`${from.file} --[${e.kind}/${e.provenance}${e.resolvedBy ? "/" + e.resolvedBy : ""}]--> ${to.file}  (${from.id} -> ${to.id})`);
    count++;
    if (count > 60) { console.log("... (truncado)"); break; }
  }
  console.log(`total mostrado: ${count}`);
}
main();
