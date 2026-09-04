/**
 * SONDA DEL FRENTE F1 (Ola Q) — de qué está hecha una arista `satisfies`.
 *
 * Vuelca, para un repo, TODAS las aristas `satisfies` del grafo de producción
 * (`analyzeRepo` + `onGraph`) junto con los hechos que la derivación tiene a
 * mano y los que sólo se ven con el grafo entero:
 *
 *   - firma requerida del destino (nombre/aridad de sus miembros conocidos)
 *   - cuántos ORÍGENES distintos satisfacen ese mismo destino
 *   - cuántos DESTINOS distintos satisface ese mismo origen  ← la ambigüedad
 *   - si el par ya está unido por una arista de familia DECLARADA
 *   - si el destino es destino de alguna `extends`/`implements`/`mixes-in`
 *     declarada (ancla nominal)
 *
 * Uso: npx tsx scripts/q1-probe-satisfies.mts <dir> <slug> <salida.json>
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { memberSignatures, type CodeGraph, type CodeGraphEdge, type GraphIndex } from "../src/server/services/graph/types.js";

const [, , dir, slug, outFile] = process.argv;
if (!dir || !slug || !outFile) {
  console.error("uso: npx tsx scripts/q1-probe-satisfies.mts <dir> <slug> <salida.json>");
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
  console.error("sin grafo");
  process.exit(1);
}

const nodeById = new Map(graph.nodes.map((n) => [n.id, n] as const));
const containsFrom = new Map<string, CodeGraphEdge[]>();
for (const e of graph.edges) {
  if (e.kind !== "contains") continue;
  const l = containsFrom.get(e.from);
  if (l) l.push(e);
  else containsFrom.set(e.from, [e]);
}
const index: GraphIndex = {
  nodeById: (id) => nodeById.get(id) ?? null,
  edgesFrom: (id) => containsFrom.get(id) ?? [],
};

const FAMILY = new Set(["extends", "implements", "mixes-in"]);
const nominalTargets = new Set<string>();
const nominalOrigins = new Set<string>();
const declaredPair = new Set<string>();
for (const e of graph.edges) {
  if (!FAMILY.has(e.kind)) continue;
  nominalTargets.add(e.to);
  nominalOrigins.add(e.from);
  declaredPair.add(`${e.from}->${e.to}`);
  declaredPair.add(`${e.to}->${e.from}`);
}

const sat = graph.edges.filter((e) => e.kind === "satisfies");
const originsByTarget = new Map<string, Set<string>>();
const targetsByOrigin = new Map<string, Set<string>>();
for (const e of sat) {
  let a = originsByTarget.get(e.to);
  if (!a) originsByTarget.set(e.to, (a = new Set()));
  a.add(e.from);
  let b = targetsByOrigin.get(e.from);
  if (!b) targetsByOrigin.set(e.from, (b = new Set()));
  b.add(e.to);
}

function sigs(id: string): string[] {
  return memberSignatures(index, id)
    .filter((m) => m.arity !== null)
    .map((m) => `${m.name}/${m.arity}`)
    .sort();
}

const rows = sat.map((e) => {
  const t = nodeById.get(e.to);
  const o = nodeById.get(e.from);
  const req = sigs(e.to);
  const have = sigs(e.from);
  return {
    targetId: e.to,
    target: t?.symbolPath.at(-1) ?? "?",
    targetFile: t?.file ?? "?",
    originId: e.from,
    origin: o?.symbolPath.at(-1) ?? "?",
    originFile: o?.file ?? "?",
    provenance: e.provenance,
    reqSize: req.length,
    haveSize: have.length,
    required: req,
    originsForTarget: originsByTarget.get(e.to)!.size,
    targetsForOrigin: targetsByOrigin.get(e.from)!.size,
    declaredPair: declaredPair.has(`${e.from}->${e.to}`),
    targetHasNominalImplementer: nominalTargets.has(e.to),
    targetIsNominalChild: nominalOrigins.has(e.to),
    sameFile: t?.file === o?.file,
  };
});

await fs.writeFile(outFile, JSON.stringify({ slug, total: sat.length, rows }, null, 1));

const n = rows.length;
const pct = (k: number) => (n === 0 ? "0" : ((100 * k) / n).toFixed(1));
console.log(`${slug}: ${n} aristas satisfies`);
console.log(`  origen con 1 solo destino:      ${rows.filter((r) => r.targetsForOrigin === 1).length} (${pct(rows.filter((r) => r.targetsForOrigin === 1).length)}%)`);
console.log(`  origen con 2+ destinos:         ${rows.filter((r) => r.targetsForOrigin > 1).length} (${pct(rows.filter((r) => r.targetsForOrigin > 1).length)}%)`);
console.log(`  destino con 1 solo origen:      ${rows.filter((r) => r.originsForTarget === 1).length} (${pct(rows.filter((r) => r.originsForTarget === 1).length)}%)`);
console.log(`  par YA declarado (familia):     ${rows.filter((r) => r.declaredPair).length} (${pct(rows.filter((r) => r.declaredPair).length)}%)`);
console.log(`  destino con implementador nominal: ${rows.filter((r) => r.targetHasNominalImplementer).length} (${pct(rows.filter((r) => r.targetHasNominalImplementer).length)}%)`);
console.log(`  reqSize=2: ${rows.filter((r) => r.reqSize === 2).length} · 3: ${rows.filter((r) => r.reqSize === 3).length} · 4+: ${rows.filter((r) => r.reqSize >= 4).length}`);
