/**
 * SONDA T3 (Ola Q) — DE QUÉ ESTÁ HECHO EL VOLUMEN de `parallel-hierarchies`.
 *
 * Corre el pipeline real UNA vez, usa el detector real (`buildParallelHierarchiesFindings`,
 * importado sin editar) para obtener los hallazgos de HOY, y ADEMÁS reconstruye
 * (duplicando lectura, no lógica del detector — mismo patrón que
 * `scripts/p7-probe-parallel.mts`) cuántos componentes >= minHierarchySize
 * comparten CADA firma de forma ANTES de cualquier dedupe, para saber si el par
 * final es "los únicos dos que existen con esa forma en todo el repo" o "lo que
 * sobrevivió de un grupo más grande después del dedupe".
 *
 * También mide, para cada hallazgo final, si hay composición cruzada
 * (bridgeLikely, ya lo calcula y lo deja en el `detail` el propio detector —
 * lo leemos del texto en vez de recalcular, porque es determinístico y el
 * propio detector ya lo computó).
 *
 * Uso: npx tsx scripts/q-t3-parallel-classify.mts <dir> <slug>
 */
import path from "node:path";
import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { buildParallelHierarchiesFindings } from "../src/server/services/detect/inter-file/parallel-hierarchies.js";
import { presencia, pisoDeclarado, resolveThreshold } from "../src/server/services/detect/thresholds.js";
import type { CodeGraph, CodeGraphEdge } from "../src/server/services/graph/types.js";
import type { RepoUnit } from "../src/server/services/detect/types.js";

const [, , dir, slug] = process.argv;
if (!dir || !slug) {
  console.error("uso: npx tsx scripts/q-t3-parallel-classify.mts <dir> <slug>");
  process.exit(1);
}

let graph: CodeGraph | null = null;
const analysis = await analyzeRepo({
  dir: path.resolve(dir),
  repoName: slug,
  limits: { maxFindings: "unlimited" },
  onGraph: (r) => {
    graph = r.graph;
  },
});
if (!graph) {
  console.error(`[${slug}] sin grafo.`);
  process.exit(1);
}
const g: CodeGraph = graph;

const resolveInput = { language: slug, sampleSize: () => 0, corpusP95: () => null };
const minHierarchySize = resolveThreshold(pisoDeclarado(3, { rationale: "sonda" }), resolveInput);
const minGroupSize = resolveThreshold(presencia({ rationale: "sonda" }), resolveInput);

const repo: RepoUnit = {
  repoName: slug,
  files: analysis.files as unknown as RepoUnit["files"],
  functions: [],
  clones: [],
  graph: g,
};

const findings = buildParallelHierarchiesFindings(repo, g, minHierarchySize, minGroupSize);
console.log(`# ${slug}: total parallel-hierarchies findings HOY = ${findings.length}`);
for (const f of findings) {
  const bridgeLikely = f.detail.includes("compatible con una implementación a propósito del patrón Bridge");
  console.log(`  ${f.title} | bridgeLikely=${bridgeLikely} | locs=${f.locations.map((l) => `${l.symbol}@${l.file}`).join(" || ")}`);
}

// --- Reconstrucción de firmas ANTES de dedupe (misma lógica que el detector, sólo lectura) ---
interface ClassNode { id: string; file: string; symbolPath: readonly string[] }
const classNodes = new Map<string, ClassNode>();
for (const n of g.nodes) if (n.kind === "symbol" && n.family === "class-like") classNodes.set(n.id, { id: n.id, file: n.file, symbolPath: n.symbolPath });

function isIsaEdge(e: CodeGraphEdge): boolean {
  return (e.kind === "extends" || e.kind === "implements") && e.provenance !== "ambiguous" && e.from !== e.to && classNodes.has(e.from) && classNodes.has(e.to);
}
const children = new Map<string, Set<string>>();
const parents = new Map<string, Set<string>>();
for (const e of g.edges) {
  if (!isIsaEdge(e)) continue;
  if (!children.has(e.to)) children.set(e.to, new Set());
  children.get(e.to)!.add(e.from);
  if (!parents.has(e.from)) parents.set(e.from, new Set());
  parents.get(e.from)!.add(e.to);
}
const participants = new Set<string>([...children.keys(), ...parents.keys()]);
for (const s of children.values()) for (const id of s) participants.add(id);
for (const s of parents.values()) for (const id of s) participants.add(id);
const seen = new Set<string>();
const comps: string[][] = [];
for (const start of participants) {
  if (seen.has(start)) continue;
  const stack = [start];
  seen.add(start);
  const comp: string[] = [];
  while (stack.length) {
    const cur = stack.pop()!;
    comp.push(cur);
    const nb = new Set<string>([...(children.get(cur) ?? []), ...(parents.get(cur) ?? [])]);
    for (const n of nb) if (!seen.has(n)) { seen.add(n); stack.push(n); }
  }
  comps.push(comp);
}
function shapeSig(comp: string[]): string {
  const roots = comp.filter((id) => (parents.get(id)?.size ?? 0) === 0);
  const degrees = comp.map((id) => children.get(id)?.size ?? 0).sort((a, b) => a - b);
  return `${comp.length}|${roots.length}|${degrees.join(",")}`;
}
const bigComps = comps.filter((c) => c.length >= 3);
const bySig = new Map<string, number>();
for (const c of bigComps) bySig.set(shapeSig(c), (bySig.get(shapeSig(c)) ?? 0) + 1);
console.log(`# ${slug}: componentes>=3 totales=${bigComps.length}, firmas distintas=${bySig.size}`);
const repeated = [...bySig.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
console.log(`# ${slug}: firmas repetidas (ANTES de cualquier dedupe): ${repeated.map(([s, n]) => `${s}x${n}`).join(", ") || "ninguna"}`);
