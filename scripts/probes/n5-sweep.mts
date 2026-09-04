/**
 * N5 (Ola O) — medicion ad-hoc, NO produccion.
 *
 * Barrido de configuraciones del embudo de `coupling-without-abstraction` sobre el
 * volcado de `n5-dump-graph.mts`, por lenguaje. Sirve para decidir con datos que
 * filtro esta haciendo el recorte en cada lenguaje.
 *
 * Uso: npx tsx scripts/probes/n5-sweep.mts <volcado.json>... [--ej=CONF:N]
 */
import { readFileSync } from "node:fs";

interface N { id: string; kind: string; file: string; symbolPath: string[]; family: string | null }
interface E { kind: string; from: string; to: string; provenance: string }
interface Dump { dir: string; files: { path: string; lines: number; language: string }[]; nodes: N[]; edges: E[] }

const args = process.argv.slice(2);
const ejArg = args.find((a) => a.startsWith("--ej="))?.slice(5);
const [ejConf, ejN] = ejArg ? [ejArg.split(":")[0]!, Number(ejArg.split(":")[1] ?? 10)] : ["", 0];
const dumps = args.filter((a) => !a.startsWith("--"));

const ANON = /[<>]/;

interface Ctx {
  dump: Dump;
  contains: Map<string, string[]>;
  nodeById: Map<string, N>;
  dependsOn: Map<string, Set<string>>;
  dependedBy: Map<string, Set<string>>;
  nominalPairsConf: Set<string>;
  nominalTargetsConf: Map<string, Set<string>>;
  nominalPairsAll: Set<string>;
  nominalTargetsAll: Map<string, Set<string>>;
  langByFile: Map<string, string>;
  unitsOf: (f: string) => Set<string>[];
  df: Map<string, number>;
  unitCount: number;
}

const pk = (a: string, b: string) => (a < b ? `${a} ${b}` : `${b} ${a}`);
const addTo = (m: Map<string, Set<string>>, k: string, v: string) => {
  let s = m.get(k);
  if (!s) m.set(k, (s = new Set()));
  s.add(v);
};

function load(path: string): Ctx {
  const dump = JSON.parse(readFileSync(path, "utf8")) as Dump;
  const nodeById = new Map(dump.nodes.map((n) => [n.id, n]));
  const contains = new Map<string, string[]>();
  const dependsOn = new Map<string, Set<string>>();
  const dependedBy = new Map<string, Set<string>>();
  const nominalPairsConf = new Set<string>();
  const nominalTargetsConf = new Map<string, Set<string>>();
  const nominalPairsAll = new Set<string>();
  const nominalTargetsAll = new Map<string, Set<string>>();
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
    const nominal = e.kind === "extends" || e.kind === "implements" || e.kind === "mixes-in" || e.kind === "satisfies";
    if (nominal) {
      nominalPairsAll.add(pk(from.file, to.file));
      addTo(nominalTargetsAll, from.file, to.file);
    }
    if (e.provenance === "inferred" || e.provenance === "ambiguous") continue;
    addTo(dependsOn, from.file, to.file);
    addTo(dependedBy, to.file, from.file);
    if (nominal) {
      nominalPairsConf.add(pk(from.file, to.file));
      addTo(nominalTargetsConf, from.file, to.file);
    }
  }
  const unitsCache = new Map<string, Set<string>[]>();
  const unitsOf = (file: string): Set<string>[] => {
    let u = unitsCache.get(file);
    if (u) return u;
    u = [];
    const mod = new Set<string>();
    const walk = (id: string, inClass: Set<string> | null): void => {
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
          if (s.size) u!.push(s);
          walk(c.id, s);
        } else if (c.family === "namespace-like") {
          walk(c.id, inClass);
        } else if (c.family === "function-like") {
          if (!inClass && nm && !ANON.test(nm)) mod.add(nm);
        }
      }
    };
    walk(`file:${file}`, null);
    if (mod.size) u.push(mod);
    unitsCache.set(file, u);
    return u;
  };
  // frecuencia documental de cada nombre de operacion sobre las unidades del repo
  const df = new Map<string, number>();
  let unitCount = 0;
  for (const f of dump.files) {
    for (const u of unitsOf(f.path)) {
      unitCount++;
      for (const n of u) df.set(n, (df.get(n) ?? 0) + 1);
    }
  }
  return {
    dump,
    contains,
    nodeById,
    dependsOn,
    dependedBy,
    nominalPairsConf,
    nominalTargetsConf,
    nominalPairsAll,
    nominalTargetsAll,
    langByFile: new Map(dump.files.map((f) => [f.path, f.language])),
    unitsOf,
    df,
    unitCount,
  };
}

interface Conf {
  name: string;
  ubiq: number | null;
  conc: number | null;
  minShared: number;
  dfMax: number | null;
  nominalAll: boolean;
}

const CONFS: Conf[] = [
  { name: "C0-prod", ubiq: 0.1, conc: 0.3, minShared: 1, dfMax: null, nominalAll: false },
  { name: "C1-sup", ubiq: 0.1, conc: 0.3, minShared: 1, dfMax: null, nominalAll: false },
  { name: "C2-sinConc", ubiq: 0.1, conc: null, minShared: 1, dfMax: null, nominalAll: false },
  { name: "C3-sinConc-2ops", ubiq: 0.1, conc: null, minShared: 2, dfMax: null, nominalAll: false },
  { name: "C4-sinConc-2ops-df", ubiq: 0.1, conc: null, minShared: 2, dfMax: 0.05, nominalAll: false },
  { name: "C5-sinUbiq-2ops-df", ubiq: null, conc: null, minShared: 2, dfMax: 0.05, nominalAll: false },
  { name: "C6-C4-nominalAll", ubiq: 0.1, conc: null, minShared: 2, dfMax: 0.05, nominalAll: true },
  { name: "C7-C4-3ops", ubiq: 0.1, conc: null, minShared: 3, dfMax: 0.05, nominalAll: true },
  { name: "C8-solo-ops1", ubiq: null, conc: null, minShared: 1, dfMax: null, nominalAll: false },
  { name: "C9-solo-ops2", ubiq: null, conc: null, minShared: 2, dfMax: null, nominalAll: false },
  { name: "C10-solo-ops1-nomAll", ubiq: null, conc: null, minShared: 1, dfMax: null, nominalAll: true },
  { name: "C11-ops1-df05", ubiq: null, conc: null, minShared: 1, dfMax: 0.05, nominalAll: true },
  { name: "C12-ops1-df02", ubiq: null, conc: null, minShared: 1, dfMax: 0.02, nominalAll: true },
  { name: "C13-ops2-df05", ubiq: null, conc: null, minShared: 2, dfMax: 0.05, nominalAll: true },
  { name: "C14-ops2-df02", ubiq: null, conc: null, minShared: 2, dfMax: 0.02, nominalAll: true },
];

const totals = new Map<string, Map<string, number>>(); // conf -> lang -> n

for (const path of dumps) {
  const ctx = load(path);
  const totalFiles = ctx.dump.files.length;
  const clientsOfPair = new Map<string, Set<string>>();
  for (const [source, targets] of ctx.dependsOn) {
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
  const perRepo = new Map<string, number>();
  const ej: string[] = [];
  for (const [key, clients] of clientsOfPair) {
    if (clients.size < 3) continue;
    const [a, b] = key.split(" ") as [string, string];
    const la = ctx.langByFile.get(a) ?? "?";
    const lb = ctx.langByFile.get(b) ?? "?";
    const lang = la === lb ? la : "mixto";
    const fanInA = ctx.dependedBy.get(a)?.size ?? 0;
    const fanInB = ctx.dependedBy.get(b)?.size ?? 0;
    const ratioA = fanInA / totalFiles;
    const ratioB = fanInB / totalFiles;
    const share = Math.min(fanInA === 0 ? 0 : clients.size / fanInA, fanInB === 0 ? 0 : clients.size / fanInB);

    for (const conf of CONFS) {
      const np = conf.nominalAll ? ctx.nominalPairsAll : ctx.nominalPairsConf;
      const nt = conf.nominalAll ? ctx.nominalTargetsAll : ctx.nominalTargetsConf;
      if (np.has(pk(a, b))) continue;
      const ta = nt.get(a);
      const tb = nt.get(b);
      if (ta && tb) {
        let common = false;
        for (const t of ta) if (tb.has(t)) common = true;
        if (common) continue;
      }
      if (conf.ubiq !== null && (ratioA >= conf.ubiq || ratioB >= conf.ubiq)) continue;
      if (conf.conc !== null && share < conf.conc) continue;
      let ua: Set<string>[];
      let ub: Set<string>[];
      if (conf.name === "C0-prod") {
        const v0 = (f: string): Set<string>[] => {
          const out: Set<string>[] = [];
          for (const cid of ctx.contains.get(`file:${f}`) ?? []) {
            const c = ctx.nodeById.get(cid);
            if (!c || c.kind !== "symbol" || c.family !== "class-like") continue;
            const s = new Set<string>();
            for (const mid of ctx.contains.get(c.id) ?? []) {
              const m = ctx.nodeById.get(mid);
              if (!m || m.kind !== "symbol" || m.family !== "function-like") continue;
              const n = m.symbolPath[m.symbolPath.length - 1];
              if (n && n !== "constructor") s.add(n);
            }
            if (s.size) out.push(s);
          }
          return out;
        };
        ua = v0(a);
        ub = v0(b);
      } else {
        ua = ctx.unitsOf(a);
        ub = ctx.unitsOf(b);
      }
      let best: string[] = [];
      for (const x of ua)
        for (const y of ub) {
          let s = [...x].filter((n) => y.has(n));
          const dfMax = conf.dfMax;
          if (dfMax !== null) s = s.filter((n) => (ctx.df.get(n) ?? 0) / Math.max(1, ctx.unitCount) <= dfMax);
          if (conf.name === "C0-prod") s = s.filter((n) => n !== "constructor");
          if (s.length > best.length) best = s;
        }
      if (best.length < conf.minShared) continue;
      let m = totals.get(conf.name);
      if (!m) totals.set(conf.name, (m = new Map()));
      m.set(lang, (m.get(lang) ?? 0) + 1);
      perRepo.set(conf.name, (perRepo.get(conf.name) ?? 0) + 1);
      if (conf.name === ejConf && ej.length < ejN) {
        ej.push(`  ${clients.size}c [${lang}] ${a} <-> ${b}  ops=[${best.slice(0, 8).join(",")}] conc=${share.toFixed(2)} fanIn=${fanInA}/${fanInB}`);
      }
    }
  }
  console.log(`== ${ctx.dump.dir} (${totalFiles} archivos, ${ctx.unitCount} unidades)`);
  console.log("   " + CONFS.map((c) => `${c.name}=${perRepo.get(c.name) ?? 0}`).join(" "));
  for (const e of ej) console.log(e);
}

console.log("\n=== TOTAL por configuracion y lenguaje");
for (const c of CONFS) {
  const m = totals.get(c.name) ?? new Map();
  const tot = [...m.values()].reduce((a, b) => a + b, 0);
  console.log(`${c.name}: total=${tot}  ${[...m].sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l}=${n}`).join(" ")}`);
}
