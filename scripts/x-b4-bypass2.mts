/**
 * OLA X — frente B4, contrafáctico v2 de `facade.ts#bypassesOf`, SIN tocar el
 * analizador (el fingerprint no cambia y la caché sirve).
 *
 * Cuatro variantes sobre la MISMA proyección de `buildFacadeGraphView`:
 *   A (hoy)  el colaborador cuenta si su fan-in independiente < fan-in del candidato
 *   B (p95)  ... < min(fan-in del candidato, p95 de fan-in del repo)   [receta W5]
 *   C (ext)  como A, pero el "cliente" no puede ser uno de los propios colaboradores
 *   D (C+B)  las dos a la vez
 *
 * Uso: npx tsx scripts/x-b4-bypass2.mts <dir> <slug> <hipotesis.json> <salida.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import { pagerank } from "../src/server/services/graph/metrics/pagerank.js";
import { projectGraph } from "../src/server/services/graph/metrics/projection.js";
import { fileNodeId } from "../src/server/services/graph/types.js";

const [, , dir, slug, hypFile, out] = process.argv;
if (!dir || !slug || !hypFile || !out) process.exit(1);

const { graph } = await analyzeRepoCached({ dir: path.resolve(dir), repoName: slug, limits: { maxFindings: "unlimited" } });
if (!graph) process.exit(1);

const prGraph = projectGraph(graph, "file", pagerank.edgeKinds);
const { nodeIds, indexOf, out: adj } = prGraph;
const inbound: number[][] = nodeIds.map(() => []);
for (let i = 0; i < adj.length; i++) for (const j of adj[i]!) inbound[j]!.push(i);

const pathOf = (id: string): string | null => (id.startsWith("file:") ? id.slice("file:".length) : null);
const deduped = (idx: readonly number[]): string[] => {
  const s = new Set<string>();
  for (const i of idx) {
    const p = pathOf(nodeIds[i]!);
    if (p) s.add(p);
  }
  return [...s];
};
const memoC = new Map<string, string[]>();
const collabsOf = (f: string): string[] => {
  let v = memoC.get(f);
  if (v) return v;
  const i = indexOf.get(fileNodeId(f));
  v = i === undefined ? [] : deduped(adj[i]!);
  memoC.set(f, v);
  return v;
};
const memoR = new Map<string, string[]>();
const refsOf = (f: string): string[] => {
  let v = memoR.get(f);
  if (v) return v;
  const i = indexOf.get(fileNodeId(f));
  v = i === undefined ? [] : deduped(inbound[i]!);
  memoR.set(f, v);
  return v;
};

const fanIns: number[] = [];
for (let i = 0; i < nodeIds.length; i++) if (pathOf(nodeIds[i]!)) fanIns.push(deduped(inbound[i]!).length);
fanIns.sort((a, b) => a - b);
const p95 = fanIns.length === 0 ? 0 : fanIns[Math.min(fanIns.length - 1, Math.floor(0.95 * fanIns.length))]!;

function count(f: string, limit: number, excludeInternalClients: boolean): { n: number; sample: string[] } {
  const internals = new Set(collabsOf(f));
  const seen = new Set<string>();
  const sample: string[] = [];
  for (const ext of refsOf(f)) {
    if (excludeInternalClients && internals.has(ext)) continue;
    for (const target of collabsOf(ext)) {
      if (target === f || !internals.has(target)) continue;
      const indep = refsOf(target).filter((r) => r !== f).length;
      if (indep >= limit) continue;
      const k = `${ext} ${target}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (sample.length < 8) sample.push(`${ext}→${target}`);
    }
  }
  return { n: seen.size, sample };
}

const hyp = JSON.parse(readFileSync(hypFile, "utf8")) as { rows: { pattern: string; state: string; file: string; id: string; anchorKind: string }[] };
const rows = hyp.rows
  .filter((r) => r.pattern === "Facade")
  .map((r) => {
    const own = refsOf(r.file).length;
    const lim = Math.min(own, p95);
    const A = count(r.file, own, false);
    const B = count(r.file, lim, false);
    const C = count(r.file, own, true);
    const D = count(r.file, lim, true);
    return { repo: slug, id: r.id, anchorKind: r.anchorKind, file: r.file, stateHoy: r.state, ownFanIn: own, p95, A: A.n, B: B.n, C: C.n, D: D.n, sampleD: D.sample };
  });
writeFileSync(out, JSON.stringify({ repo: slug, p95, rows }, null, 1));
const z = (k: "A" | "B" | "C" | "D"): number => rows.filter((r) => r[k] === 0).length;
console.error(`${slug} p95=${p95} n=${rows.length} sinFuga: A=${z("A")} B=${z("B")} C=${z("C")} D=${z("D")}`);
