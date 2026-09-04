/**
 * A3a - medicion ad-hoc. Para cada archivo ORIGEN, cuenta cuantos TIPOS DISTINTOS
 * (class-like) construye via aristas `instantiates` confiables (declared/resolved) -
 * el fan-out de instanciacion. Sirve para calibrar si "excluir archivos
 * agregador/composition-root" (mismo criterio que
 * coupling-without-abstraction.ts#maxFanoutConsidered) tiene sentido para
 * scattered-instantiation: ¿los archivos que construyen los tipos hoy señalados
 * como "dispersos" son, ellos mismos, ensambladores de MUCHOS tipos (un bootstrap),
 * o son sitios de negocio genuinamente independientes?
 *
 * Uso: npx tsx scripts/a3a-measure-instantiation-fanout.mts <dir>
 */
import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeGraph, CodeGraphEdge, CodeGraphNode } from "../src/server/services/graph/types.js";

function isConfident(edge: CodeGraphEdge): boolean {
  return edge.kind === "instantiates" && edge.provenance !== "inferred" && edge.provenance !== "ambiguous";
}

async function main(): Promise<void> {
  const [, , dir] = process.argv;
  if (!dir) {
    console.error("Uso: npx tsx scripts/a3a-measure-instantiation-fanout.mts <dir>");
    process.exit(1);
  }
  let graph: CodeGraph | null = null;
  await analyzeRepo({ dir, repoName: "a3a-fanout", limits: { maxFindings: "unlimited" }, onGraph: (r: { graph: CodeGraph }) => (graph = r.graph) });
  if (!graph) {
    console.error("sin grafo");
    process.exit(1);
  }
  const g: CodeGraph = graph;
  const nodeById = new Map<string, CodeGraphNode>(g.nodes.map((n) => [n.id, n]));

  // MIN_SITES_SPEC = 3, replicando groupInstantiationsByTarget + hierarchy exclusion
  // (simplificado: sin excluir jerarquia acá, sólo para ver distribución de fan-out).
  const targetsByFile = new Map<string, Set<string>>(); // origin file -> set of distinct target type ids
  const sitesByTarget = new Map<string, Set<string>>(); // target type id -> set of distinct origin files

  for (const edge of g.edges) {
    if (!isConfident(edge)) continue;
    const to = nodeById.get(edge.to);
    const from = nodeById.get(edge.from);
    if (!to || !from || to.family !== "class-like") continue;
    let s = targetsByFile.get(from.file);
    if (!s) {
      s = new Set();
      targetsByFile.set(from.file, s);
    }
    s.add(edge.to);
    let s2 = sitesByTarget.get(edge.to);
    if (!s2) {
      s2 = new Set();
      sitesByTarget.set(edge.to, s2);
    }
    s2.add(from.file);
  }

  // Distribución completa de fan-out de instanciación por archivo origen (cuántos
  // TIPOS DISTINTOS construye cada archivo), para calibrar un piso de "archivo
  // agregador/composition-root" con un número medido, no adivinado.
  const allFanouts = [...targetsByFile.values()].map((s) => s.size).sort((a, b) => a - b);
  console.log(`archivos que instancian >=1 tipo class-like: ${allFanouts.length}`);
  for (const p of [50, 75, 90, 95, 99]) {
    const idx = Math.min(allFanouts.length - 1, Math.floor((p / 100) * allFanouts.length));
    console.log(`  p${p} = ${allFanouts[idx]}`);
  }
  console.log(`  max = ${allFanouts[allFanouts.length - 1]}`);
  const histBuckets = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20, Infinity];
  let prev = 0;
  for (const b of histBuckets) {
    const count = allFanouts.filter((v) => v > prev && v <= b).length;
    console.log(`  fanout (${prev},${b === Infinity ? "inf" : b}]: ${count}`);
    prev = b;
  }

  // Tipos con dispersion (>=3 archivos de origen distintos, el MIN_SITES_SPEC actual).
  const dispersed = [...sitesByTarget.entries()].filter(([, files]) => files.size >= 3);
  console.log(`tipos con >=3 archivos de origen distintos: ${dispersed.length}`);
  for (const [targetId, files] of dispersed) {
    const targetNode = nodeById.get(targetId)!;
    const name = targetNode.symbolPath[targetNode.symbolPath.length - 1] ?? targetNode.file;
    const fanouts = [...files].map((f) => targetsByFile.get(f)?.size ?? 0).sort((a, b) => b - a);
    console.log(`${name} (${targetNode.file}) sitios=${files.size} fanoutDeCadaSitio=[${fanouts.join(",")}]`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
