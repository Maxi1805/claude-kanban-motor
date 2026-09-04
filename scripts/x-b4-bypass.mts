/**
 * OLA X — frente B4. Contrafáctico de `facade.ts#bypassesOf` SIN tocar el
 * analizador (así el fingerprint no cambia y la caché sigue sirviendo).
 *
 * Reimplementa la MISMA proyección que `buildFacadeGraphView` (`projectGraph`
 * con `pagerank.edgeKinds`, grano archivo) y calcula, para cada candidato de
 * Facade de la corrida:
 *   - fan-in propio y p95 de fan-in del repo
 *   - fugas con el criterio de HOY (independiente < fan-in del candidato)
 *   - fugas con el criterio corregido (independiente < min(fan-in, p95))
 *   - hermanos-hub que solapan (la forma PARCIAL)
 *
 * Uso: npx tsx scripts/x-b4-bypass.mts <dir> <slug> <hipotesis.json> <salida.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import { pagerank } from "../src/server/services/graph/metrics/pagerank.js";
import { projectGraph } from "../src/server/services/graph/metrics/projection.js";
import { fileNodeId } from "../src/server/services/graph/types.js";

const [, , dir, slug, hypFile, out] = process.argv;
if (!dir || !slug || !hypFile || !out) {
  console.error("Uso: npx tsx scripts/x-b4-bypass.mts <dir> <slug> <hipotesis.json> <salida.json>");
  process.exit(1);
}

const FACADE_MIN_COLLABORATORS = 4;

const { graph, cache } = await analyzeRepoCached({ dir: path.resolve(dir), repoName: slug, limits: { maxFindings: "unlimited" } });
console.error(`[cache] ${slug}: ${cache.hit ? "HIT" : "MISS"}`);
if (!graph) {
  console.error("sin grafo");
  process.exit(1);
}

const prGraph = projectGraph(graph, "file", pagerank.edgeKinds);
const { nodeIds, indexOf, out: adj } = prGraph;
const inbound: number[][] = nodeIds.map(() => []);
for (let i = 0; i < adj.length; i++) for (const j of adj[i]!) inbound[j]!.push(i);

const pathOf = (id: string): string | null => (id.startsWith("file:") ? id.slice("file:".length) : null);
const deduped = (idx: readonly number[]): string[] => {
  const seen = new Set<string>();
  for (const i of idx) {
    const p = pathOf(nodeIds[i]!);
    if (p) seen.add(p);
  }
  return [...seen];
};
const collabsOf = (f: string): string[] => {
  const i = indexOf.get(fileNodeId(f));
  return i === undefined ? [] : deduped(adj[i]!);
};
const refsOf = (f: string): string[] => {
  const i = indexOf.get(fileNodeId(f));
  return i === undefined ? [] : deduped(inbound[i]!);
};

// p95 del fan-in del repo, sobre los nodos-archivo de la proyección.
const fanIns: number[] = [];
for (let i = 0; i < nodeIds.length; i++) if (pathOf(nodeIds[i]!)) fanIns.push(deduped(inbound[i]!).length);
fanIns.sort((a, b) => a - b);
const p95 = fanIns.length === 0 ? 0 : fanIns[Math.min(fanIns.length - 1, Math.floor(0.95 * fanIns.length))]!;

// Índice de hubs para la forma PARCIAL — mismo criterio que `partialSiblingsOf`.
const hubSets = new Map<string, Set<string>>();
const hubsByCollab = new Map<string, string[]>();
for (const id of nodeIds) {
  const p = pathOf(id);
  if (!p) continue;
  const c = collabsOf(p);
  if (c.length < FACADE_MIN_COLLABORATORS) continue;
  const s = new Set(c);
  hubSets.set(p, s);
  for (const x of s) (hubsByCollab.get(x) ?? hubsByCollab.set(x, []).get(x)!).push(p);
}
const siblingsOf = (f: string): string[] => {
  const mine = hubSets.get(f);
  if (!mine) return [];
  const cand = new Set<string>();
  for (const c of mine) for (const h of hubsByCollab.get(c) ?? []) if (h !== f) cand.add(h);
  const res: string[] = [];
  for (const other of cand) {
    const theirs = hubSets.get(other)!;
    const overlap = [...mine].filter((c) => theirs.has(c));
    if (overlap.length === 0) continue;
    if ([...theirs].every((c) => mine.has(c))) continue;
    if ([...mine].every((c) => theirs.has(c))) continue;
    res.push(other);
  }
  return res;
};

const bypasses = (f: string, limit: number): { external: string; internal: string }[] => {
  const internals = new Set(collabsOf(f));
  const seen = new Set<string>();
  const res: { external: string; internal: string }[] = [];
  for (const ext of refsOf(f)) {
    for (const target of collabsOf(ext)) {
      if (target === f || !internals.has(target)) continue;
      const indep = refsOf(target).filter((r) => r !== f).length;
      if (indep >= limit) continue;
      const k = `${ext} ${target}`;
      if (seen.has(k)) continue;
      seen.add(k);
      res.push({ external: ext, internal: target });
    }
  }
  return res;
};

const hyp = JSON.parse(readFileSync(hypFile, "utf8")) as { rows: { pattern: string; state: string; file: string; id: string; anchorKind: string }[] };
const rows = hyp.rows.filter((r) => r.pattern === "Facade");
const outRows = rows.map((r) => {
  const ownFanIn = refsOf(r.file).length;
  const hoy = bypasses(r.file, ownFanIn);
  const nuevo = bypasses(r.file, Math.min(ownFanIn, p95));
  const sib = siblingsOf(r.file);
  return {
    repo: slug,
    id: r.id,
    anchorKind: r.anchorKind,
    file: r.file,
    stateHoy: r.state,
    ownFanIn,
    p95,
    colaboradores: collabsOf(r.file).length,
    fugasHoy: hoy.length,
    fugasNuevo: nuevo.length,
    ejemploNuevo: nuevo.slice(0, 6).map((b) => `${b.external}→${b.internal}`),
    hermanos: sib.length,
    ejemploHermanos: sib.slice(0, 6),
  };
});
writeFileSync(out, JSON.stringify({ repo: slug, p95, fanInMax: fanIns[fanIns.length - 1] ?? 0, rows: outRows }, null, 1));
console.error(slug, "p95=", p95, "candidatos=", outRows.length, "conFugaNueva=", outRows.filter((r) => r.fugasNuevo > 0).length);
