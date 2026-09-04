/**
 * N5 (Ola O) — medicion ad-hoc, NO produccion.
 *
 * Experimento del ANCLA: en vez de partir de la co-dependencia (>=3 clientes que
 * dependen de A y de B a la vez) y filtrar por "hacen lo mismo", parte de "hacen lo
 * mismo" (>=k operaciones declaradas en comun, discriminativas por frecuencia
 * documental) y corrobora con la clientela (ambos con clientes propios, union >= 3).
 *
 * Uso: npx tsx scripts/probes/n5-ancla.mts <volcado.json>... [--k=2] [--df=0.02] [--ej=N]
 */
import { readFileSync } from "node:fs";

interface N { id: string; kind: string; file: string; symbolPath: string[]; family: string | null }
interface E { kind: string; from: string; to: string; provenance: string }
interface Dump { dir: string; files: { path: string; lines: number; language: string }[]; nodes: N[]; edges: E[] }

const args = process.argv.slice(2);
const K = Number(args.find((a) => a.startsWith("--k="))?.slice(4) ?? 2);
const DF_MAX = Number(args.find((a) => a.startsWith("--df="))?.slice(5) ?? 0.02);
const EJ = Number(args.find((a) => a.startsWith("--ej="))?.slice(5) ?? 0);
const RATIO = Number(args.find((a) => a.startsWith("--r="))?.slice(4) ?? 0);
const dumps = args.filter((a) => !a.startsWith("--"));
const ANON = /[<>]/;
const pk = (a: string, b: string) => (a < b ? `${a} ${b}` : `${b} ${a}`);

const totals = new Map<string, number>();
const supr = { nominal: 0, superficie: 0, clientes: 0 };

for (const path of dumps) {
  const dump = JSON.parse(readFileSync(path, "utf8")) as Dump;
  const nodeById = new Map(dump.nodes.map((n) => [n.id, n]));
  const contains = new Map<string, string[]>();
  const dependedBy = new Map<string, Set<string>>();
  const nomTargets = new Map<string, Set<string>>();
  const nomPairs = new Set<string>();
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
    if (["extends", "implements", "mixes-in", "satisfies"].includes(e.kind)) {
      nomPairs.add(pk(from.file, to.file));
      let s = nomTargets.get(from.file);
      if (!s) nomTargets.set(from.file, (s = new Set()));
      s.add(to.file);
    }
    if (e.provenance === "inferred" || e.provenance === "ambiguous") continue;
    let s = dependedBy.get(to.file);
    if (!s) dependedBy.set(to.file, (s = new Set()));
    s.add(from.file);
  }
  const ancCache = new Map<string, Set<string>>();
  const ancOf = (f: string, seen = new Set<string>()): Set<string> => {
    const h = ancCache.get(f);
    if (h) return h;
    if (seen.has(f)) return new Set();
    seen.add(f);
    const out = new Set<string>();
    for (const t of nomTargets.get(f) ?? []) {
      out.add(t);
      for (const u of ancOf(t, seen)) out.add(u);
    }
    ancCache.set(f, out);
    return out;
  };

  interface U { file: string; names: Set<string> }
  const units: U[] = [];
  const unitsOfFile = new Map<string, U[]>();
  for (const f of dump.files) {
    const list: U[] = [];
    const mod = new Set<string>();
    const walk = (id: string, inClass: boolean): void => {
      for (const cid of contains.get(id) ?? []) {
        const c = nodeById.get(cid);
        if (!c || c.kind !== "symbol") continue;
        const nm = c.symbolPath[c.symbolPath.length - 1];
        if (c.family === "class-like") {
          const s = new Set<string>();
          for (const mid of contains.get(c.id) ?? []) {
            const m = nodeById.get(mid);
            if (!m || m.kind !== "symbol" || m.family !== "function-like") continue;
            const n = m.symbolPath[m.symbolPath.length - 1];
            if (n && !ANON.test(n)) s.add(n);
          }
          if (s.size) list.push({ file: f.path, names: s });
          walk(c.id, true);
        } else if (c.family === "namespace-like") walk(c.id, inClass);
        else if (c.family === "function-like" && !inClass && nm && !ANON.test(nm)) mod.add(nm);
      }
    };
    walk(`file:${f.path}`, false);
    if (mod.size) list.push({ file: f.path, names: mod });
    unitsOfFile.set(f.path, list);
    units.push(...list);
  }
  const df = new Map<string, number>();
  for (const u of units) for (const n of u.names) df.set(n, (df.get(n) ?? 0) + 1);
  const discr = (n: string) => (df.get(n) ?? 0) / Math.max(1, units.length) <= DF_MAX;

  // indice invertido sobre nombres discriminativos
  const posting = new Map<string, number[]>();
  units.forEach((u, i) => {
    for (const n of u.names)
      if (discr(n)) {
        let l = posting.get(n);
        if (!l) posting.set(n, (l = []));
        l.push(i);
      }
  });
  // conteo de nombres compartidos por par de unidades
  const shared = new Map<string, number>();
  for (const [, list] of posting) {
    if (list.length < 2 || list.length > 200) continue;
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const ui = units[list[i]!]!;
        const uj = units[list[j]!]!;
        if (ui.file === uj.file) continue;
        const key = `${list[i]}|${list[j]}`;
        shared.set(key, (shared.get(key) ?? 0) + 1);
      }
  }

  const langByFile = new Map(dump.files.map((f) => [f.path, f.language]));
  let n = 0;
  const ej: string[] = [];
  const emitted = new Set<string>();
  for (const [key, count] of shared) {
    if (count < K) continue;
    const [i, j] = key.split("|").map(Number) as [number, number];
    const ua = units[i]!;
    const ub = units[j]!;
    const a = ua.file;
    const b = ub.file;
    if (emitted.has(pk(a, b))) continue;
    // sin abstraccion nominal comun (cualquier provenance, transitiva)
    if (nomPairs.has(pk(a, b))) {
      supr.nominal++;
      continue;
    }
    const aa = ancOf(a);
    const ab = ancOf(b);
    let com = false;
    for (const t of aa) if (ab.has(t)) com = true;
    if (com) {
      supr.nominal++;
      continue;
    }
    // ni abstraccion YA declarada como unidad de un tercer archivo: names(U) subconjunto de ambas, |U|>=2
    const inter = new Set([...ua.names].filter((x) => ub.names.has(x)));
    let existing = false;
    for (const u of units) {
      if (u.file === a || u.file === b) continue;
      if (u.names.size < 2 || u.names.size > inter.size) continue;
      let all = true;
      for (const x of u.names) if (!inter.has(x)) { all = false; break; }
      if (all) { existing = true; break; }
    }
    if (existing) {
      supr.superficie++;
      continue;
    }
    const ov = count / Math.max(1, Math.min(ua.names.size, ub.names.size));
    if (ov < RATIO) continue;
    const ca = dependedBy.get(a) ?? new Set();
    const cb = dependedBy.get(b) ?? new Set();
    if (ca.size === 0 || cb.size === 0 || new Set([...ca, ...cb]).size < 3) {
      supr.clientes++;
      continue;
    }
    emitted.add(pk(a, b));
    n++;
    const la = langByFile.get(a) ?? "?";
    const lb = langByFile.get(b) ?? "?";
    const lang = la === lb ? la : "mixto";
    totals.set(lang, (totals.get(lang) ?? 0) + 1);
    if (ej.length < EJ) ej.push(`  [${lang}] ${a} <-> ${b} comp=${count} ops=[${[...inter].filter(discr).slice(0, 8).join(",")}] sup=${ua.names.size}/${ub.names.size} ov=${ov.toFixed(2)} clientes=${ca.size}/${cb.size}`);
  }
  console.log(`== ${dump.dir}: ${units.length} unidades, pares con >=${K} ops: ${[...shared.values()].filter((v) => v >= K).length} -> EMITIDOS ${n}`);
  for (const e of ej) console.log(e);
}
console.log(`\nTOTAL: ${[...totals.values()].reduce((a, b) => a + b, 0)}  ${[...totals].sort((a, b) => b[1] - a[1]).map(([l, x]) => `${l}=${x}`).join(" ")}`);
console.log(`suprimidos: ${JSON.stringify(supr)}`);
