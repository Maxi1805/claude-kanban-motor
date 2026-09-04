/**
 * N5 (Ola O) — medicion ad-hoc, NO produccion.
 *
 * Mide el criterio PROPUESTO ("hacen lo mismo" con superficie de operaciones
 * generica + nombres discriminativos por frecuencia documental + abstraccion ya
 * existente detectada por superficie) contra el de produccion, por lenguaje.
 *
 * Uso: npx tsx scripts/probes/n5-final.mts <volcado.json>... [--ej=N] [--df=0.05]
 */
import { readFileSync } from "node:fs";

interface N { id: string; kind: string; file: string; symbolPath: string[]; family: string | null }
interface E { kind: string; from: string; to: string; provenance: string }
interface Dump { dir: string; files: { path: string; lines: number; language: string }[]; nodes: N[]; edges: E[] }

const args = process.argv.slice(2);
const ejN = Number(args.find((a) => a.startsWith("--ej="))?.slice(5) ?? 0);
const DF_MAX = Number(args.find((a) => a.startsWith("--df="))?.slice(5) ?? 0.05);
const MIN_SHARED = Number(args.find((a) => a.startsWith("--min="))?.slice(6) ?? 1);
const UBIQ = args.includes("--ubiq") ? 0.1 : null;
const OV = Number(args.find((a) => a.startsWith("--ov="))?.slice(5) ?? 0);
const CONC = args.includes("--conc") ? 0.3 : null;
const dumps = args.filter((a) => !a.startsWith("--"));
const ANON = /[<>]/;
const pk = (a: string, b: string) => (a < b ? `${a} ${b}` : `${b} ${a}`);
const addTo = (m: Map<string, Set<string>>, k: string, v: string) => {
  let s = m.get(k);
  if (!s) m.set(k, (s = new Set()));
  s.add(v);
};

const totalsProd = new Map<string, number>();
const totalsNew = new Map<string, number>();
const supprReason = { nominalDirecto: 0, nominalTransitivo: 0, superficieExistente: 0 };
const etapa = new Map<string, { conc: number; supViejaNoVacia: number; supNuevaNoVacia: number; compartenRaw: number; compartenDiscr: number; emite: number }>();
const bumpE = (l: string, k: string) => { let r = etapa.get(l); if (!r) etapa.set(l, r = { conc: 0, supViejaNoVacia: 0, supNuevaNoVacia: 0, compartenRaw: 0, compartenDiscr: 0, emite: 0 }); (r as any)[k]++; };

for (const path of dumps) {
  const dump = JSON.parse(readFileSync(path, "utf8")) as Dump;
  const nodeById = new Map(dump.nodes.map((n) => [n.id, n]));
  const contains = new Map<string, string[]>();
  const dependsOn = new Map<string, Set<string>>();
  const dependedBy = new Map<string, Set<string>>();
  const nomAllPairs = new Set<string>();
  const nomAllTargets = new Map<string, Set<string>>();
  const nomConfPairs = new Set<string>();
  const nomConfTargets = new Map<string, Set<string>>();
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
      nomAllPairs.add(pk(from.file, to.file));
      addTo(nomAllTargets, from.file, to.file);
    }
    if (e.provenance === "inferred" || e.provenance === "ambiguous") continue;
    addTo(dependsOn, from.file, to.file);
    addTo(dependedBy, to.file, from.file);
    if (nominal) {
      nomConfPairs.add(pk(from.file, to.file));
      addTo(nomConfTargets, from.file, to.file);
    }
  }
  // cierre transitivo de ancestros nominales a grano archivo
  const ancestors = new Map<string, Set<string>>();
  const ancOf = (f: string, seen = new Set<string>()): Set<string> => {
    const hit = ancestors.get(f);
    if (hit) return hit;
    if (seen.has(f)) return new Set();
    seen.add(f);
    const out = new Set<string>();
    for (const t of nomAllTargets.get(f) ?? []) {
      out.add(t);
      for (const u of ancOf(t, seen)) out.add(u);
    }
    ancestors.set(f, out);
    return out;
  };

  const unitsCache = new Map<string, { file: string; names: Set<string> }[]>();
  const unitsOf = (file: string) => {
    let u = unitsCache.get(file);
    if (u) return u;
    u = [];
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
          if (s.size) u!.push({ file, names: s });
          walk(c.id, true);
        } else if (c.family === "namespace-like") walk(c.id, inClass);
        else if (c.family === "function-like" && !inClass && nm && !ANON.test(nm)) mod.add(nm);
      }
    };
    walk(`file:${file}`, false);
    if (mod.size) u.push({ file, names: mod });
    unitsCache.set(file, u);
    return u;
  };

  const allUnits: { file: string; names: Set<string> }[] = [];
  for (const f of dump.files) allUnits.push(...unitsOf(f.path));
  const df = new Map<string, number>();
  const unitsByName = new Map<string, { file: string; names: Set<string> }[]>();
  for (const u of allUnits)
    for (const n of u.names) {
      df.set(n, (df.get(n) ?? 0) + 1);
      let l = unitsByName.get(n);
      if (!l) unitsByName.set(n, (l = []));
      l.push(u);
    }
  const discr = (n: string) => (df.get(n) ?? 0) / Math.max(1, allUnits.length) <= DF_MAX;

  const langByFile = new Map(dump.files.map((f) => [f.path, f.language]));
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

  let prod = 0;
  let nue = 0;
  const ej: string[] = [];
  for (const [key, clients] of clientsOfPair) {
    if (clients.size < 3) continue;
    const [a, b] = key.split(" ") as [string, string];
    const la = langByFile.get(a) ?? "?";
    const lb = langByFile.get(b) ?? "?";
    const lang = la === lb ? la : "mixto";
    const fanInA = dependedBy.get(a)?.size ?? 0;
    const fanInB = dependedBy.get(b)?.size ?? 0;

    /* ── produccion de hoy ── */
    prodBlock: {
      if (nomConfPairs.has(pk(a, b))) break prodBlock;
      const ta = nomConfTargets.get(a);
      const tb = nomConfTargets.get(b);
      if (ta && tb) for (const t of ta) if (tb.has(t)) break prodBlock;
      if (fanInA / totalFiles >= 0.1 || fanInB / totalFiles >= 0.1) break prodBlock;
      const sh = Math.min(fanInA === 0 ? 0 : clients.size / fanInA, fanInB === 0 ? 0 : clients.size / fanInB);
      if (sh < 0.3) break prodBlock;
      const v0 = (f: string): Set<string> => {
        const s = new Set<string>();
        for (const cid of contains.get(`file:${f}`) ?? []) {
          const c = nodeById.get(cid);
          if (!c || c.kind !== "symbol" || c.family !== "class-like") continue;
          for (const mid of contains.get(c.id) ?? []) {
            const m = nodeById.get(mid);
            if (!m || m.kind !== "symbol" || m.family !== "function-like") continue;
            const n = m.symbolPath[m.symbolPath.length - 1];
            if (n && n !== "constructor") s.add(n);
          }
        }
        return s;
      };
      const oa = v0(a);
      const ob = v0(b);
      if (oa.size === 0 || ob.size === 0) break prodBlock;
      if (![...oa].some((n) => ob.has(n))) break prodBlock;
      prod++;
      totalsProd.set(lang, (totalsProd.get(lang) ?? 0) + 1);
    }

    /* ── criterio propuesto ── */
    newBlock: {
      if (UBIQ !== null && (fanInA / totalFiles >= UBIQ || fanInB / totalFiles >= UBIQ)) break newBlock;
      if (CONC !== null) {
        const sh = Math.min(fanInA === 0 ? 0 : clients.size / fanInA, fanInB === 0 ? 0 : clients.size / fanInB);
        if (sh < CONC) break newBlock;
      }
      if (nomAllPairs.has(pk(a, b))) {
        supprReason.nominalDirecto++;
        break newBlock;
      }
      const aa = ancOf(a);
      const ab = ancOf(b);
      if (aa.size && ab.size) {
        for (const t of aa)
          if (ab.has(t)) {
            supprReason.nominalTransitivo++;
            break newBlock;
          }
      }
      bumpE(lang, "conc");
      { const v0 = (f: string): Set<string> => { const s2 = new Set<string>(); for (const cid of contains.get(`file:${f}`) ?? []) { const c = nodeById.get(cid); if (!c || c.kind !== "symbol" || c.family !== "class-like") continue; for (const mid of contains.get(c.id) ?? []) { const m = nodeById.get(mid); if (!m || m.kind !== "symbol" || m.family !== "function-like") continue; const n = m.symbolPath[m.symbolPath.length - 1]; if (n && n !== "constructor") s2.add(n); } } return s2; };
        if (v0(a).size > 0 && v0(b).size > 0) bumpE(lang, "supViejaNoVacia"); }
      if (unitsOf(a).length > 0 && unitsOf(b).length > 0) bumpE(lang, "supNuevaNoVacia");
      { let anyRaw = false; for (const x of unitsOf(a)) for (const y of unitsOf(b)) for (const n of x.names) if (y.names.has(n)) anyRaw = true; if (anyRaw) bumpE(lang, "compartenRaw"); }
      let best: string[] = [];
      let bestOv = 0;
      for (const x of unitsOf(a))
        for (const y of unitsOf(b)) {
          const s = [...x.names].filter((n) => y.names.has(n) && discr(n));
          const ov = s.length / Math.max(1, Math.min(x.names.size, y.names.size));
          if (s.length >= MIN_SHARED && ov >= OV && (s.length > best.length || (s.length === best.length && ov > bestOv))) {
            best = s;
            bestOv = ov;
          }
        }
      if (best.length < MIN_SHARED) break newBlock;
      bumpE(lang, "compartenDiscr");
      // ¿existe ya una unidad en OTRO archivo cuyo protocolo ENTERO declaran las dos?
      // (la forma de una interfaz: sus miembros son un subconjunto de los de cada implementacion)
      let rawInter = new Set<string>();
      for (const x of unitsOf(a)) for (const y of unitsOf(b)) {
        const s = new Set([...x.names].filter((n) => y.names.has(n)));
        if (s.size > rawInter.size) rawInter = s;
      }
      for (const anchor of best) for (const u of unitsByName.get(anchor) ?? []) {
        if (u.file === a || u.file === b) continue;
        let inC = 0; for (const x of u.names) if (rawInter.has(x)) inC++;
        if (inC >= 2 && inC / u.names.size > 0.5) { supprReason.superficieExistente++; break newBlock; }
      }
      bumpE(lang, "emite");
      nue++;
      totalsNew.set(lang, (totalsNew.get(lang) ?? 0) + 1);
      if (ej.length < ejN) ej.push(`  ${clients.size}c [${lang}] ${a} <-> ${b} ops=[${best.slice(0, 8).join(",")}]`);
    }
  }
  console.log(`== ${dump.dir}: ${dump.files.length} arch, ${allUnits.length} unidades — PROD=${prod} NUEVO=${nue}`);
  for (const e of ej) console.log(e);
}

const fmt = (m: Map<string, number>) =>
  `total=${[...m.values()].reduce((a, b) => a + b, 0)}  ${[...m].sort((x, y) => y[1] - x[1]).map(([l, n]) => `${l}=${n}`).join(" ")}`;
console.log(`\nPROD  : ${fmt(totalsProd)}`);
console.log(`NUEVO : ${fmt(totalsNew)}   (df<=${DF_MAX}, minShared=${MIN_SHARED}, ubiq=${UBIQ}, conc=${CONC})`);
for (const [l, r] of etapa) console.log(`  ETAPA ${l}: ${Object.entries(r).map(([k, v]) => `${k}=${v}`).join(" ")}`);
console.log(`suprimidos por abstraccion ya existente: ${JSON.stringify(supprReason)}`);
