/**
 * OLA AO · FRENTE AO4 — sonda de conteo para Template Method / Composite / Iterator.
 *
 * Corre `analyzeRepo` UNA vez contra una copia congelada de `src/` (CK_SRC_ROOT),
 * captura el GRAFO por `onGraph` y emite, en un solo JSON:
 *   (a) el detalle de hipótesis (checks incluidos) de los tres patrones del frente;
 *   (b) los CONTEOS DE SITIOS derivados del grafo que el frente necesita para el
 *       paso 4 del método (contar, no estimar).
 *
 * Uso: CK_SRC_ROOT=scratchpad-ao4/src0 npx tsx scripts/ao4-sonda.mts <dir> <salida.json>
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.env.CK_SRC_ROOT ?? "../src";
const base = ROOT.startsWith(".") ? ROOT : path.join("..", ROOT);
const { analyzeRepo } = await import(`${base}/server/services/code-analyzer.js`);
const { stableFindingId } = await import(`${base}/server/services/code-finding-ids.js`);
const { direccionesDeFila } = await import(`${base}/server/services/detect/precision/direccion-hipotesis.js`);

const [, , dir, out] = process.argv;
if (!dir || !out) { console.error("Uso: npx tsx scripts/ao4-sonda.mts <dir> <salida.json>"); process.exit(1); }

const MIOS = new Set(["Template Method", "Composite", "Iterator"]);
const FAMILY_EDGE_KINDS = new Set(["extends", "mixes-in"]);
const CONSTRUCTOR_NAMES = new Set(["__init__", "__new__", "constructor", "initialize", "new", "ctor"]);

let graph: any = null;
const t0 = performance.now();
const a: any = await analyzeRepo({
  dir, repoName: "dump", limits: { maxFindings: "unlimited" },
  onGraph: (r: any) => { graph = r.graph; },
} as any);
const wallMs = Math.round(performance.now() - t0);

/* ── (a) hipótesis ───────────────────────────────────────────────────── */
const findings = a.findings.map((f: any) => {
  const hs = f.hypotheses ?? [];
  const at = direccionesDeFila(hs, f.locations[0]);
  const mio = hs.some((h: any) => MIOS.has(h.pattern));
  return {
    id: f.id ?? stableFindingId(f), kind: f.kind, title: f.title,
    lang: f.language ?? null,
    where: f.locations.map((l: any) => `${l.file}:${l.startLine}`),
    symbols: f.locations.map((l: any) => l.symbol ?? ""),
    hypotheses: hs.map((h: any, i: number) => ({ pattern: h.pattern, state: h.state, at: at[i] ?? "" })),
    ...(mio ? {
      det: hs.map((h: any, i: number) => ({ h, i })).filter((x: any) => MIOS.has(x.h.pattern)).map((x: any) => ({
        pattern: x.h.pattern, at: at[x.i] ?? "", state: x.h.state, conf: x.h.confidence ?? null,
        checks: (x.h.checks ?? []).map((c: any) => ({ l: c.label, p: c.passed, r: c.role ?? "", w: String(c.why ?? "").slice(0, 400) })),
        disc: (x.h.discriminators ?? []).map((c: any) => ({ l: c.label, p: c.passed, w: String(c.why ?? "").slice(0, 200) })),
        places: (x.h.places ?? []).map((p: any) => ({ f: p.file ?? "", a: p.startLine ?? null, b: p.endLine ?? null, s: p.symbol ?? "", r: String(p.role ?? "").slice(0, 200) })),
      })),
    } : {}),
  };
});

const porKind: Record<string, number> = {};
for (const f of a.findings) porKind[f.kind] = (porKind[f.kind] ?? 0) + 1;

/* ── (b) conteos de grafo ────────────────────────────────────────────── */
let g: any = { nodos: 0, aristas: 0, note: "sin grafo" };
if (graph) {
  const nodeById = new Map<string, any>(graph.nodes.map((n: any) => [n.id, n]));
  const edgesFrom = new Map<string, any[]>();
  const edgesTo = new Map<string, any[]>();
  for (const e of graph.edges) {
    { const l = edgesFrom.get(e.from); if (l) l.push(e); else edgesFrom.set(e.from, [e]); }
    { const l2 = edgesTo.get(e.to); if (l2) l2.push(e); else edgesTo.set(e.to, [e]); }
  }
  const last = (n: any) => n.symbolPath[n.symbolPath.length - 1] ?? "";
  const members = (id: string) => {
    const own = nodeById.get(id);
    const ownName = own ? last(own) : "";
    const out: any[] = [];
    for (const e of edgesFrom.get(id) ?? []) {
      if (e.kind !== "contains") continue;
      const t = nodeById.get(e.to);
      if (!t || t.kind !== "symbol" || t.family !== "function-like") continue;
      const name = last(t);
      if (!name) continue;
      if (name === ownName || CONSTRUCTOR_NAMES.has(name)) continue;
      out.push({ id: t.id, name, arity: t.arity ?? null, returnType: t.returnType, file: t.file, line: t.startLine ?? null });
    }
    return out;
  };
  const callsOut = (id: string) => (edgesFrom.get(id) ?? []).filter((e: any) => e.kind === "calls").length;

  // familias: ancestro -> hermanos (extends|mixes-in entrantes)
  const hermanosDe = new Map<string, any[]>();
  for (const n of graph.nodes) {
    if (n.kind !== "symbol" || n.family !== "class-like") continue;
    for (const e of edgesFrom.get(n.id) ?? []) {
      if (!FAMILY_EDGE_KINDS.has(e.kind)) continue;
      const anc = nodeById.get(e.to);
      if (!anc || anc.kind !== "symbol" || anc.family !== "class-like") continue;
      if (anc.id === n.id) continue;
      const l = hermanosDe.get(anc.id) ?? [];
      if (!l.some((x: any) => x.id === n.id)) l.push(n);
      hermanosDe.set(anc.id, l);
    }
  }

  // T1: pares (ancestro, nombre) con >=2 hermanos declarantes y el ancestro NO lo declara
  let familias2 = 0;
  let paresMismoArchivo = 0, paresRepartidos = 0;
  let paresRepartidosConCalls = 0, paresMismoArchivoConCalls = 0;
  let familiasMismoArchivo = 0, familiasRepartidas = 0;
  const muestraRepartidos: any[] = [];
  for (const [ancId, hs] of hermanosDe) {
    if (hs.length < 2) continue;
    familias2++;
    const ancMembers = new Set(members(ancId).map((m) => m.name));
    const byName = new Map<string, any[]>();
    for (const h of hs) for (const m of members(h.id)) {
      if (ancMembers.has(m.name)) continue;
      const l = byName.get(m.name) ?? []; l.push({ ...m, unit: last(h), unitFile: h.file }); byName.set(m.name, l);
    }
    let algunRepartido = false, algunMismo = false;
    for (const [name, list] of byName) {
      const unidades = new Map<string, any>();
      for (const m of list) if (!unidades.has(m.unit)) unidades.set(m.unit, m);
      if (unidades.size < 2) continue;
      // aridad compatible: al menos 2 con la misma aridad declarada (o null)
      const arid = new Map<string, any[]>();
      for (const m of unidades.values()) { const k = String(m.arity); const l = arid.get(k) ?? []; l.push(m); arid.set(k, l); }
      const mejor = [...arid.values()].sort((x, y) => y.length - x.length)[0]!;
      if (mejor.length < 2) continue;
      const archivos = new Set(mejor.map((m: any) => m.unitFile));
      const conCalls = mejor.filter((m: any) => callsOut(m.id) > 0).length;
      if (archivos.size === 1) {
        paresMismoArchivo++; algunMismo = true;
        if (conCalls >= 2) paresMismoArchivoConCalls++;
      } else {
        paresRepartidos++; algunRepartido = true;
        if (conCalls >= 2) paresRepartidosConCalls++;
        if (muestraRepartidos.length < 40) muestraRepartidos.push({
          anc: last(nodeById.get(ancId)), ancFile: nodeById.get(ancId).file, name,
          unidades: mejor.map((m: any) => `${m.unit}@${m.unitFile}:${m.line}`), conCalls,
        });
      }
    }
    if (algunRepartido) familiasRepartidas++;
    if (algunMismo) familiasMismoArchivo++;
  }

  // T2 large-class: cuántas clases grandes tienen familia en el grafo
  g = {
    nodos: graph.nodes.length, aristas: graph.edges.length,
    aristasPorKind: graph.edges.reduce((acc: any, e: any) => { acc[e.kind] = (acc[e.kind] ?? 0) + 1; return acc; }, {}),
    classLike: graph.nodes.filter((n: any) => n.kind === "symbol" && n.family === "class-like").length,
    familias2, familiasMismoArchivo, familiasRepartidas,
    paresMismoArchivo, paresRepartidos, paresMismoArchivoConCalls, paresRepartidosConCalls,
    muestraRepartidos,
  };
}

writeFileSync(out, JSON.stringify({ dir, srcRoot: ROOT, wallMs, total: findings.length, porKind, grafo: g, findings }, null, 1));
console.log(`${out}: ${findings.length} hallazgos, ${wallMs}ms, grafo=${g.nodos} nodos`);
