/**
 * N5 (Ola O) — medicion ad-hoc, NO produccion.
 *
 * Compara operacionalizaciones de "hacen lo mismo" (superficie de operaciones de un
 * archivo) sobre el volcado de `n5-dump-graph.mts`, contando cuantos candidatos
 * sobreviven con cada una, por lenguaje, y mostrando ejemplos.
 *
 *   V0 = produccion hoy: miembros function-like de los class-like de PRIMER nivel.
 *   V1 = V0 pero descendiendo por contenedores namespace-like/class-like a cualquier
 *        profundidad (arregla C#/Ruby).
 *   V2 = V1 + la unidad "archivo como modulo": function-like declarados fuera de todo
 *        class-like y fuera de toda funcion (arregla Go/JS/Vue/Python-modulo).
 *
 * Uso: npx tsx scripts/probes/n5-surface.mts <volcado.json> [--ej=N]
 */
import { readFileSync } from "node:fs";

interface N { id: string; kind: string; file: string; symbolPath: string[]; family: string | null }
interface E { kind: string; from: string; to: string; provenance: string }
interface Dump { dir: string; files: { path: string; lines: number; language: string }[]; nodes: N[]; edges: E[] }

const [, , dumpPath, ...rest] = process.argv;
const ej = Number(rest.find((r) => r.startsWith("--ej="))?.split("=")[1] ?? 0);
const dump = JSON.parse(readFileSync(dumpPath!, "utf8")) as Dump;
const nodeById = new Map(dump.nodes.map((n) => [n.id, n]));
const contains = new Map<string, string[]>();
const dependsOn = new Map<string, Set<string>>();
const dependedBy = new Map<string, Set<string>>();
const nominalPairs = new Set<string>();
const nominalTargetsOf = new Map<string, Set<string>>();
const pk = (a: string, b: string) => (a < b ? `${a} ${b}` : `${b} ${a}`);
const addTo = (m: Map<string, Set<string>>, k: string, v: string) => {
  let s = m.get(k);
  if (!s) m.set(k, (s = new Set()));
  s.add(v);
};
for (const e of dump.edges) {
  if (e.kind === "contains") {
    let a = contains.get(e.from);
    if (!a) contains.set(e.from, (a = []));
    a.push(e.to);
    continue;
  }
  const from = nodeById.get(e.from);
  const to = nodeById.get(e.to);
  if (!from || !to || from.file === to.file) continue;
  if (e.provenance === "inferred" || e.provenance === "ambiguous") continue;
  addTo(dependsOn, from.file, to.file);
  addTo(dependedBy, to.file, from.file);
  if (e.kind === "extends" || e.kind === "implements" || e.kind === "mixes-in" || e.kind === "satisfies") {
    nominalPairs.add(pk(from.file, to.file));
    addTo(nominalTargetsOf, from.file, to.file);
  }
}
const langByFile = new Map(dump.files.map((f) => [f.path, f.language]));
const ANON = /^<|>$/;

/** V0 */
function v0(file: string): Set<string>[] {
  const out: Set<string>[] = [];
  for (const cid of contains.get(`file:${file}`) ?? []) {
    const c = nodeById.get(cid);
    if (!c || c.kind !== "symbol" || c.family !== "class-like") continue;
    const s = new Set<string>();
    for (const mid of contains.get(c.id) ?? []) {
      const m = nodeById.get(mid);
      if (!m || m.kind !== "symbol" || m.family !== "function-like") continue;
      const n = m.symbolPath[m.symbolPath.length - 1];
      if (n && n !== "constructor") s.add(n);
    }
    if (s.size) out.push(s);
  }
  return out;
}

/** V1: class-like a cualquier profundidad bajo contenedores namespace-like/class-like */
function classUnits(file: string): { id: string; names: Set<string> }[] {
  const out: { id: string; names: Set<string> }[] = [];
  const walk = (id: string): void => {
    for (const cid of contains.get(id) ?? []) {
      const c = nodeById.get(cid);
      if (!c || c.kind !== "symbol") continue;
      if (c.family === "class-like") {
        const s = new Set<string>();
        for (const mid of contains.get(c.id) ?? []) {
          const m = nodeById.get(mid);
          if (!m || m.kind !== "symbol" || m.family !== "function-like") continue;
          const n = m.symbolPath[m.symbolPath.length - 1];
          if (n && n !== "constructor" && !ANON.test(n)) s.add(n);
        }
        if (s.size) out.push({ id: c.id, names: s });
        walk(c.id);
      } else if (c.family === "namespace-like") walk(c.id);
    }
  };
  walk(`file:${file}`);
  return out;
}

/** unidad "archivo como modulo": function-like fuera de todo class-like/function-like */
function moduleUnit(file: string): Set<string> {
  const s = new Set<string>();
  const walk = (id: string): void => {
    for (const cid of contains.get(id) ?? []) {
      const c = nodeById.get(cid);
      if (!c || c.kind !== "symbol") continue;
      const n = c.symbolPath[c.symbolPath.length - 1];
      if (c.family === "function-like") {
        if (n && n !== "constructor" && !ANON.test(n)) s.add(n);
      } else if (c.family === "namespace-like") walk(c.id);
    }
  };
  walk(`file:${file}`);
  return s;
}

function unitsV1(file: string): Set<string>[] {
  return classUnits(file).map((u) => u.names);
}
function unitsV2(file: string): Set<string>[] {
  const u = unitsV1(file);
  const m = moduleUnit(file);
  if (m.size) u.push(m);
  return u;
}
function sharedBetween(ua: Set<string>[], ub: Set<string>[]): string[] {
  let best: string[] = [];
  for (const a of ua) for (const b of ub) {
    const s = [...a].filter((n) => b.has(n));
    if (s.length > best.length) best = s;
  }
  return best;
}

const totalFiles = dump.files.length;
const clientsOfPair = new Map<string, Set<string>>();
for (const [source, targets] of dependsOn) {
  if (targets.size < 2 || targets.size > 60) continue;
  const sorted = [...targets].sort();
  for (let i = 0; i < sorted.length; i++)
    for (let j = i + 1; j < sorted.length; j++) {
      const key = pk(sorted[i]!, sorted[j]!);
      let c = clientsOfPair.get(key);
      if (!c) clientsOfPair.set(key, (c = new Set()));
      c.add(source);
    }
}

const res = new Map<string, { cand: number; v0: number; v1: number; v2: number }>();
const ejemplos: string[] = [];
for (const [key, clients] of clientsOfPair) {
  if (clients.size < 3) continue;
  const [a, b] = key.split(" ") as [string, string];
  if (nominalPairs.has(pk(a, b))) continue;
  const ta = nominalTargetsOf.get(a);
  const tb = nominalTargetsOf.get(b);
  if (ta && tb) {
    let common = false;
    for (const t of ta) if (tb.has(t)) common = true;
    if (common) continue;
  }
  const ratioA = (dependedBy.get(a)?.size ?? 0) / totalFiles;
  const ratioB = (dependedBy.get(b)?.size ?? 0) / totalFiles;
  if (ratioA >= 0.1 || ratioB >= 0.1) continue;
  const fA = dependedBy.get(a)?.size ?? 0;
  const fB = dependedBy.get(b)?.size ?? 0;
  if (Math.min(fA === 0 ? 0 : clients.size / fA, fB === 0 ? 0 : clients.size / fB) < 0.3) continue;

  const la = langByFile.get(a) ?? "?";
  const lb = langByFile.get(b) ?? "?";
  const lang = la === lb ? la : "mixto";
  let r = res.get(lang);
  if (!r) res.set(lang, (r = { cand: 0, v0: 0, v1: 0, v2: 0 }));
  r.cand++;
  const s0 = sharedBetween(v0(a), v0(b));
  const s1 = sharedBetween(unitsV1(a), unitsV1(b));
  const s2 = sharedBetween(unitsV2(a), unitsV2(b));
  if (s0.length) r.v0++;
  if (s1.length) r.v1++;
  if (s2.length) r.v2++;
  if (ej > 0 && ejemplos.length < ej) {
    ejemplos.push(`${clients.size}c [${lang}] ${a} <-> ${b}  u1A=${unitsV1(a).map((u)=>u.size).join("/")} u1B=${unitsV1(b).map((u)=>u.size).join("/")} modA=${moduleUnit(a).size} modB=${moduleUnit(b).size} V1=[${s1.slice(0,6).join(",")}] V2=[${s2.slice(0,8).join(",")}]`);
  }
}

console.log(`== ${dump.dir}`);
let t = { cand: 0, v0: 0, v1: 0, v2: 0 };
for (const [l, r] of [...res].sort((a, b) => b[1].cand - a[1].cand)) {
  console.log(`  ${l}: candidatos=${r.cand} V0=${r.v0} V1=${r.v1} V2=${r.v2}`);
  t = { cand: t.cand + r.cand, v0: t.v0 + r.v0, v1: t.v1 + r.v1, v2: t.v2 + r.v2 };
}
console.log(`  TOTAL: candidatos=${t.cand} V0=${t.v0} V1=${t.v1} V2=${t.v2}`);
for (const e of ejemplos) console.log("    " + e);
