/**
 * Sonda T3 (Ola Q) — ¿por qué `orphan-file` marca huérfanos archivos de Go
 * cuyas funciones SÍ se llaman desde otros archivos por nombre calificado de
 * paquete (`bufferpool.GetBuffer()`, `compare.LessStrings()`, `hiter.Concat()`)?
 * Corre el pipeline real sobre `corpus/hugo` y vuelca, para un símbolo dado
 * (por archivo + nombre), TODAS las aristas entrantes de CUALQUIER kind, sin
 * filtrar por `confidentEdges` — para ver si el grafo genera la arista y el
 * detector la descarta, o si el grafo directamente no la genera.
 *
 * Uso: npx tsx scripts/q-t3-probe-go-refs.mts <dir> <slug> <archivo> [nombreSimbolo]
 */
import path from "node:path";
import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";

const [, , dir, slug, target, symName] = process.argv;
if (!dir || !slug || !target) {
  console.error("uso: npx tsx scripts/q-t3-probe-go-refs.mts <dir> <slug> <archivo> [nombreSimbolo]");
  process.exit(1);
}

let graph: CodeGraph | null = null;
await analyzeRepo({
  dir: path.resolve(dir),
  repoName: slug,
  limits: { maxFindings: "unlimited" },
  onGraph: (r) => {
    graph = r.graph;
  },
});
if (!graph) {
  console.error(`[q-t3] ${slug}: sin grafo.`);
  process.exit(1);
}
const g: CodeGraph = graph;

const ownNodes = g.nodes.filter((n) => n.file === target && n.kind === "symbol");
console.log(`\n=== ${target} — nodos symbol propios (${ownNodes.length}) ===`);
for (const n of ownNodes) {
  console.log(`  ${n.id}  symbolPath=${n.symbolPath.join(".")}  family=${n.family}`);
}

const idsOfInterest = symName
  ? ownNodes.filter((n) => n.symbolPath.join(".").includes(symName)).map((n) => n.id)
  : ownNodes.map((n) => n.id);

console.log(`\n=== aristas ENTRANTES (cualquier kind, cualquier provenance) hacia esos símbolos o hacia el nodo de archivo ===`);
const fileNodeId = `file:${target}`;
const allTargets = new Set([...idsOfInterest, fileNodeId]);
let count = 0;
for (const e of g.edges) {
  if (allTargets.has(e.to)) {
    console.log(`  ${e.kind} (${e.provenance}) ${e.from} -> ${e.to} weight=${e.weight}`);
    count++;
  }
}
console.log(`total entrantes: ${count}`);

console.log(`\n=== aristas SALIENTES desde el archivo (cualquier kind) ===`);
let outCount = 0;
for (const e of g.edges) {
  const fromNode = g.nodes.find((n) => n.id === e.from);
  if (fromNode?.file === target) {
    outCount++;
  }
}
console.log(`total salientes: ${outCount}`);
