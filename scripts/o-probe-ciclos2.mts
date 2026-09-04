/**
 * Sonda 2 del integrador (Ola O): replica el pipeline de
 * `dependency-cycle.ts` (grafo de archivos con `isConfidentDependencyEdge`,
 * Tarjan, ciclo mínimo por componente) y dice, POR COMPONENTE, cuál es el
 * ciclo mínimo elegido y qué filtro lo descarta.
 *
 * Uso: npx tsx scripts/o-probe-ciclos2.mts corpus/preact
 */
import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import type { CodeGraphEdge } from "../src/server/services/graph/types.js";

const dir = process.argv[2]!;
const { graph } = await analyzeRepoCached({ dir, repoName: "probe", limits: { maxFindings: "unlimited" } });
if (!graph) { console.error("sin grafo"); process.exit(1); }

// --- réplica literal de los predicados del detector
const edgeIsAmbiguous = (e: CodeGraphEdge): boolean => e.provenance === "ambiguous";
const isBareGlobalUniqueness = (e: CodeGraphEdge): boolean =>
  e.provenance === "resolved" && (e as { resolvedBy?: string }).resolvedBy === "global-uniqueness" &&
  e.roles !== undefined && (e.roles & 1) === 1; // EDGE_ROLE_BARE = bit 0 (aprox; sólo informativo)
const isDeclNameOnly = (e: CodeGraphEdge): boolean =>
  e.kind === "references" && e.provenance === "resolved" && e.roles === undefined;
const confident = (e: CodeGraphEdge): boolean =>
  e.kind !== "contains" && e.provenance !== "inferred" && !edgeIsAmbiguous(e) && !isBareGlobalUniqueness(e) && !isDeclNameOnly(e);

const nodeById = new Map(graph.nodes.map((n) => [n.id, n] as const));
const idxOf = new Map<string, number>();
const files: string[] = [];
const adj: Set<number>[] = [];
const fi = (f: string): number => {
  let i = idxOf.get(f);
  if (i === undefined) { i = files.length; files.push(f); idxOf.set(f, i); adj.push(new Set()); }
  return i;
};
const kindsBetween = new Map<string, Set<string>>();
for (const e of graph.edges) {
  if (!confident(e)) continue;
  const f = nodeById.get(e.from); const t = nodeById.get(e.to);
  if (!f || !t || f.file === t.file) continue;
  adj[fi(f.file)]!.add(fi(t.file));
  const k = `${f.file} -> ${t.file}`;
  if (!kindsBetween.has(k)) kindsBetween.set(k, new Set());
  kindsBetween.get(k)!.add(`${e.kind}/${e.provenance}`);
}
const out = adj.map((s) => [...s].sort((a, b) => a - b));

// Tarjan
const n = files.length;
const index = new Array<number>(n).fill(-1), low = new Array<number>(n).fill(0);
const onStack = new Array<boolean>(n).fill(false); const stack: number[] = [];
let counter = 0; const comps: number[][] = [];
for (let s = 0; s < n; s++) {
  if (index[s] !== -1) continue;
  const work: Array<[number, number]> = [[s, 0]];
  while (work.length) {
    const top = work[work.length - 1]!; const v = top[0];
    if (top[1] === 0) { index[v] = counter; low[v] = counter; counter++; stack.push(v); onStack[v] = true; }
    let rec = false;
    for (let i = top[1]; i < out[v]!.length; i++) {
      const w = out[v]![i]!;
      if (index[w] === -1) { top[1] = i + 1; work.push([w, 0]); rec = true; break; }
      else if (onStack[w]) low[v] = Math.min(low[v]!, index[w]!);
      top[1] = i + 1;
    }
    if (rec) continue;
    if (low[v] === index[v]) {
      const c: number[] = [];
      for (;;) { const w = stack.pop()!; onStack[w] = false; c.push(w); if (w === v) break; }
      if (c.length > 1) comps.push(c);
    }
    work.pop();
    if (work.length) { const p = work[work.length - 1]![0]; low[p] = Math.min(low[p]!, low[v]!); }
  }
}

// ciclo mínimo por componente (BFS multi-fuente, orden determinista)
function shortestCycle(comp: number[]): number[] {
  const inComp = new Set(comp);
  let best: number[] | null = null;
  for (const start of comp) { // MISMO orden que `shortestCycleInComponent` (el de Tarjan), no ordenado
    const prev = new Map<number, number>();
    const dist = new Map<number, number>([[start, 0]]);
    const q = [start];
    let found: number[] | null = null;
    while (q.length && !found) {
      const v = q.shift()!;
      for (const w of out[v]!) {
        if (!inComp.has(w)) continue;
        if (w === start) {
          const path = [v]; let cur = v;
          while (cur !== start) { cur = prev.get(cur)!; path.push(cur); }
          found = path.reverse();
          break;
        }
        if (!dist.has(w)) { dist.set(w, dist.get(v)! + 1); prev.set(w, v); q.push(w); }
      }
    }
    if (found && (best === null || found.length < best.length)) best = found;
    if (best && best.length === 2) break;
  }
  return best ?? [];
}

const immediateFolder = (p: string): string => { const i = p.lastIndexOf("/"); return i < 0 ? "" : p.slice(0, i); };
const stemOf = (p: string): string => { const d = p.lastIndexOf("."); const s = p.lastIndexOf("/"); return d > s ? p.slice(0, d) : p; };
const isNamespaceHub = (m: string[]): boolean =>
  m.some((hub) => m.every((o) => o === hub || o.startsWith(stemOf(hub) + "/")));

console.log(`[${dir}] componentes SCC (aristas confiables) >=2: ${comps.length}`);
for (const c of comps.sort((a, b) => b.length - a.length).slice(0, 12)) {
  const cyc = shortestCycle(c);
  const members = cyc.map((i) => files[i]!).sort();
  const folders = new Set(members.map(immediateFolder));
  const razon = members.length < 2 ? "ciclo vacío" : folders.size <= 1 ? `DESCARTADO: una sola carpeta (${[...folders][0]})` : isNamespaceHub(members) ? "DESCARTADO: namespace-hub" : "EMITE";
  console.log(`  comp(${c.length}) -> ciclo mínimo ${members.length}: ${members.join(" | ")}   => ${razon}`);
  if (folders.size <= 1 && c.length > members.length) {
    // ¿hay OTRO par mutuo dentro del componente que SÍ cruza carpeta?
    const alt: string[] = [];
    for (const a of c) for (const b of out[a]!) {
      if (b <= a || !c.includes(b)) continue;
      if (out[b]!.includes(a) && immediateFolder(files[a]!) !== immediateFolder(files[b]!)) alt.push(`${files[a]} <-> ${files[b]}`);
    }
    if (alt.length) console.log(`      >>> PERO el componente contiene ${alt.length} par(es) mutuo(s) que SÍ cruzan carpeta, p.ej.: ${alt.slice(0, 3).join(" ; ")}`);
  }
}
