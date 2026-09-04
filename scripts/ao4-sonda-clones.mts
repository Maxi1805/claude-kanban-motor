/**
 * OLA AO · AO4 — CONDICIÓN 4 DE LA RECETA, VERIFICADA ANTES DE ESCRIBIR NADA:
 * ¿existe el hecho "cuerpo de un miembro de OTRO archivo" que el camino de GRAFO de
 * `template-method.ts#resolveGraphFamily` necesita y hoy no pide?
 *
 * Mide, sobre el grafo REAL y los `repo.clones` REALES de una corrida:
 *   - familias (ancestro + >=2 hermanos por extends|mixes-in)
 *   - pares (ancestro, nombre de miembro) con >=2 hermanos declarantes y ancestro que NO lo declara
 *   - de esos, cuántos tienen >=2 declaraciones con CUERPO recuperable desde `repo.clones`
 *     (match por className + functionName + solape de líneas en el mismo archivo)
 *   - y cuántas de esas parejas superan el piso de secuencia (>= MIN_SEQUENCE_LEN llamadas)
 *
 * Uso: CK_SRC_ROOT=scratchpad-ao4/src0 npx tsx scripts/ao4-sonda-clones.mts <dir> <out.json>
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
const ROOT = process.env.CK_SRC_ROOT ?? "../src";
const base = ROOT.startsWith(".") ? ROOT : path.join("..", ROOT);
const { analyzeRepo } = await import(`${base}/server/services/code-analyzer.js`);

const [, , dir, out] = process.argv;
if (!dir || !out) { console.error("Uso: ... <dir> <out.json>"); process.exit(1); }

const FAMILY = new Set(["extends", "mixes-in"]);
const CTOR = new Set(["__init__", "__new__", "constructor", "initialize", "new", "ctor"]);
const CALL_LIKE = /\b([A-Za-z_]\w*)\s*\(/g;
const CONTROL = new Set(["if","else","elsif","elif","unless","while","until","for","foreach","switch","case","when","catch","rescue","function","def","fn","func","class","module","struct","interface","return","yield","new","super","base","this","self","typeof","instanceof"]);
const MIN_SEQ = 3;

let graph: any = null;
let clones: any[] = [];
const a: any = await analyzeRepo({
  dir, repoName: "sonda", limits: { maxFindings: 1 },
  onGraph: (r: any) => { graph = r.graph; },
  onFacts: (facts: any[]) => { for (const f of facts) clones.push(...(f.clones ?? [])); },
} as any);

const seqOf = (norm: string): string[] => {
  const out: string[] = []; CALL_LIKE.lastIndex = 0; let m;
  while ((m = CALL_LIKE.exec(norm))) { const n = m[1]!; if (!CONTROL.has(n)) out.push(n); }
  return out;
};

// índice de clones por archivo
const clonesByFile = new Map<string, any[]>();
for (const c of clones) { const l = clonesByFile.get(c.file); if (l) l.push(c); else clonesByFile.set(c.file, [c]); }

const nodeById = new Map<string, any>(graph.nodes.map((n: any) => [n.id, n]));
const edgesFrom = new Map<string, any[]>();
for (const e of graph.edges) { const l = edgesFrom.get(e.from); if (l) l.push(e); else edgesFrom.set(e.from, [e]); }
const last = (n: any) => n.symbolPath[n.symbolPath.length - 1] ?? "";
const members = (id: string) => {
  const own = nodeById.get(id); const ownName = own ? last(own) : "";
  const o: any[] = [];
  for (const e of edgesFrom.get(id) ?? []) {
    if (e.kind !== "contains") continue;
    const t = nodeById.get(e.to);
    if (!t || t.kind !== "symbol" || t.family !== "function-like") continue;
    const nm = last(t); if (!nm || nm === ownName || CTOR.has(nm)) continue;
    o.push({ id: t.id, name: nm, arity: t.arity ?? null, file: t.file, a: t.startLine ?? null, b: t.endLine ?? null });
  }
  return o;
};
// cuerpo de un miembro: clon del mismo archivo cuyo functionName coincide y cuyo span solapa
const bodyOf = (unitName: string, m: any): string | null => {
  const cs = clonesByFile.get(m.file) ?? [];
  let best: any = null;
  for (const c of cs) {
    if (c.functionName !== m.name) continue;
    if (c.className !== null && c.className !== unitName) continue;
    if (m.a !== null && (c.endLine < m.a || (m.b !== null && c.startLine > m.b))) continue;
    if (!best || c.nodes > best.nodes) best = c;
  }
  return best ? best.normalized : null;
};

const hermanosDe = new Map<string, any[]>();
for (const n of graph.nodes) {
  if (n.kind !== "symbol" || n.family !== "class-like") continue;
  for (const e of edgesFrom.get(n.id) ?? []) {
    if (!FAMILY.has(e.kind)) continue;
    const anc = nodeById.get(e.to);
    if (!anc || anc.kind !== "symbol" || anc.family !== "class-like" || anc.id === n.id) continue;
    const l = hermanosDe.get(anc.id) ?? [];
    if (!l.some((x: any) => x.id === n.id)) l.push(n);
    hermanosDe.set(anc.id, l);
  }
}

let familias = 0, pares = 0, paresRepartidos = 0;
let paresConCuerpo2 = 0, paresRepartidosConCuerpo2 = 0, paresConSeq = 0, paresRepartidosConSeq = 0;
const muestra: any[] = [];
for (const [ancId, hs] of hermanosDe) {
  if (hs.length < 2) continue;
  familias++;
  const ancMembers = new Set(members(ancId).map((m) => m.name));
  const byName = new Map<string, any[]>();
  for (const h of hs) for (const m of members(h.id)) {
    if (ancMembers.has(m.name)) continue;
    const l = byName.get(m.name) ?? []; l.push({ ...m, unit: last(h) }); byName.set(m.name, l);
  }
  for (const [name, list] of byName) {
    const porUnidad = new Map<string, any>();
    for (const m of list) if (!porUnidad.has(m.unit)) porUnidad.set(m.unit, m);
    if (porUnidad.size < 2) continue;
    const arid = new Map<string, any[]>();
    for (const m of porUnidad.values()) { const k = String(m.arity); const l = arid.get(k) ?? []; l.push(m); arid.set(k, l); }
    const grupo = [...arid.values()].sort((x, y) => y.length - x.length)[0]!;
    if (grupo.length < 2) continue;
    pares++;
    const repartido = new Set(grupo.map((m: any) => m.file)).size > 1;
    if (repartido) paresRepartidos++;
    const cuerpos = grupo.map((m: any) => ({ m, body: bodyOf(m.unit, m) })).filter((x: any) => x.body);
    if (cuerpos.length >= 2) {
      paresConCuerpo2++; if (repartido) paresRepartidosConCuerpo2++;
      const seqs = cuerpos.map((x: any) => seqOf(x.body));
      const conSeq = seqs.filter((s: string[]) => s.length >= MIN_SEQ).length;
      if (conSeq >= 2) {
        paresConSeq++; if (repartido) paresRepartidosConSeq++;
        if (repartido && muestra.length < 25) muestra.push({ anc: last(nodeById.get(ancId)), name, u: cuerpos.map((x: any) => `${x.m.unit}@${x.m.file}:${x.m.a}`), seqs: seqs.map((s: string[]) => s.slice(0, 12)) });
      }
    }
  }
}
const res = { dir, clones: clones.length, nodos: graph.nodes.length, familias, pares, paresRepartidos, paresConCuerpo2, paresRepartidosConCuerpo2, paresConSeq, paresRepartidosConSeq, muestra };
writeFileSync(out, JSON.stringify(res, null, 1));
console.log(JSON.stringify({ ...res, muestra: undefined }));
