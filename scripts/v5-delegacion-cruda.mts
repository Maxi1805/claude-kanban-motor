/**
 * OLA V · FRENTE V5 — ¿"sin delegación" es un hecho del CÓDIGO o un hueco del GRAFO?
 *
 * Antes de promover `hasDelegatingCalls` a `required` de Facade hay que descartar la
 * explicación alternativa: que el archivo SÍ llame a sus colaboradores y el grafo no
 * resuelva esas llamadas. Para cada archivo pedido imprime: cuántas aristas `calls`
 * SALEN de sus símbolos, cuántas de ésas aterrizan en un colaborador, y cuántos símbolos
 * `function-like` propios tiene. Un archivo con 0 símbolos y 0 `calls` salientes es un
 * manifiesto; uno con 40 símbolos y 200 `calls` salientes que NO tocan colaboradores es
 * otra cosa y hay que mirarla.
 *
 * Uso: npx tsx scripts/v5-delegacion-cruda.mts <dir> <archivo> [<archivo> ...]
 */
import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";

const [, , dir, ...targets] = process.argv;
const { graph } = await analyzeRepoCached({ dir, repoName: "v5", limits: { maxFindings: "unlimited" } });
if (!graph) throw new Error("sin grafo");

const fileOf = new Map<string, string>();
for (const n of graph.nodes) fileOf.set(n.id, n.file);

for (const t of targets) {
  const symbols = graph.nodes.filter((n) => n.file === t && n.kind === "symbol");
  const outCalls = graph.edges.filter((e) => e.kind === "calls" && fileOf.get(e.from) === t);
  const destinos = new Map<string, number>();
  for (const e of outCalls) {
    const f = fileOf.get(e.to) ?? "(sin nodo)";
    destinos.set(f, (destinos.get(f) ?? 0) + 1);
  }
  const refs = graph.edges.filter((e) => e.kind !== "calls" && fileOf.get(e.from) === t && fileOf.get(e.to) !== t);
  console.log(`\n== ${t}`);
  console.log(`   símbolos propios: ${symbols.length} (function-like: ${symbols.filter((s) => s.family === "function-like").length})`);
  console.log(`   aristas 'calls' salientes: ${outCalls.length}; a OTRO archivo: ${[...destinos].filter(([f]) => f !== t).reduce((a, [, n]) => a + n, 0)}`);
  console.log(`   aristas no-'calls' hacia otros archivos: ${refs.length}`);
  for (const [f, n] of [...destinos].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`      calls → ${f}: ${n}`);
}

// Segunda pregunta (V5): ¿los `calls` salientes son AMBIGUAS? y ¿los archivos que este
// archivo LLAMA están dentro del conjunto de "colaboradores" (proyección PageRank)?
import { edgeIsAmbiguous } from "../src/server/services/graph/types.js";
for (const t of targets) {
  const outCalls = graph.edges.filter((e) => e.kind === "calls" && fileOf.get(e.from) === t && fileOf.get(e.to) !== t);
  const ambiguas = outCalls.filter((e) => edgeIsAmbiguous(e)).length;
  const porProv = new Map<string, number>();
  for (const e of outCalls) porProv.set(e.provenance, (porProv.get(e.provenance) ?? 0) + 1);
  console.log(`\n-- ${t}: calls a otro archivo=${outCalls.length}, ambiguas=${ambiguas}, provenance=${JSON.stringify([...porProv])}`);
}
