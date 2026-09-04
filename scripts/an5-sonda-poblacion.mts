/**
 * AN5 — SONDA DE POBLACIÓN (auditoría, no producción). NO toca `src/`.
 * Corre el analizador REAL de la copia congelada `scratchpad-an5/src0`,
 * captura el GRAFO por `onGraph` y responde, sin escribir una línea de
 * producción, el embudo de la VÍA NUEVA: de cada hallazgo de NIVEL 2
 * (`long-function`/`complexity`), ¿cuántos llegan a "estos hermanos comparten
 * un esqueleto extraíble"?
 * Uso: npx tsx scripts/an5-sonda-poblacion.mts <dir-repo> <slug> <salida.json>
 */
import { writeFileSync } from "node:fs";

const { analyzeRepo } = await import("../scratchpad-an5/src0/server/services/code-analyzer.js");
const { stableFindingId } = await import("../scratchpad-an5/src0/server/services/code-finding-ids.js");
const { memberSignatures } = await import("../scratchpad-an5/src0/server/services/graph/types.js");

const [, , dir, slug, out] = process.argv;
if (!dir || !slug || !out) { console.error("Uso: npx tsx scripts/an5-sonda-poblacion.mts <dir> <slug> <out.json>"); process.exit(1); }

const N2_KINDS = new Set(["long-function", "complexity"]);
const FAMILY_EDGES = new Set(["extends", "mixes-in"]);

let graph: any = null;
const t0 = performance.now();
const a: any = await analyzeRepo({ dir, repoName: slug, limits: { maxFindings: "unlimited" }, onGraph: (r: any) => { graph = r.graph; } } as any);
const wallMs = Math.round(performance.now() - t0);

const rows: any[] = [];
const stats: Record<string, number> = {};
const bump = (k: string) => { stats[k] = (stats[k] ?? 0) + 1; };

if (!graph) {
  writeFileSync(out, JSON.stringify({ slug, dir, wallMs, error: "sin grafo", stats, rows }, null, 0));
  console.log(`${out}: SIN GRAFO`);
} else {
  const nodeById = new Map<string, any>();
  for (const n of graph.nodes) if (!nodeById.has(n.id)) nodeById.set(n.id, n);
  const edgesFrom = new Map<string, any[]>();
  const edgesTo = new Map<string, any[]>();
  for (const e of graph.edges) {
    (edgesFrom.get(e.from) ?? edgesFrom.set(e.from, []).get(e.from)!).push(e);
    (edgesTo.get(e.to) ?? edgesTo.set(e.to, []).get(e.to)!).push(e);
  }
  const gindex = { nodeById: (id: string) => nodeById.get(id) ?? null, edgesFrom: (id: string) => edgesFrom.get(id) ?? [] };

  // función-like por archivo, ordenadas
  const fnByFile = new Map<string, any[]>();
  const clsByFile = new Map<string, any[]>();
  for (const n of graph.nodes) {
    if (n.kind !== "symbol") continue;
    if (n.family === "function-like") (fnByFile.get(n.file) ?? fnByFile.set(n.file, []).get(n.file)!).push(n);
    if (n.family === "class-like") (clsByFile.get(n.file) ?? clsByFile.set(n.file, []).get(n.file)!).push(n);
  }
  // owner (class-like) de un símbolo: arista `contains` entrante desde un class-like
  const ownerOf = (id: string): any | null => {
    for (const e of edgesTo.get(id) ?? []) {
      if (e.kind !== "contains") continue;
      const src = nodeById.get(e.from);
      if (src?.kind === "symbol" && src.family === "class-like") return src;
    }
    return null;
  };
  // hallazgos de nivel 2 por (archivo, símbolo)
  const n2At = new Map<string, string[]>();
  for (const f of a.findings) {
    if (!N2_KINDS.has(f.kind)) continue;
    for (const l of f.locations) {
      const k = `${l.file}#${l.symbol ?? ""}`;
      (n2At.get(k) ?? n2At.set(k, []).get(k)!).push(f.kind);
    }
  }

  for (const f of a.findings) {
    if (!N2_KINDS.has(f.kind)) continue;
    bump("0-anclas");
    const loc = f.locations[0];
    if (!loc) { bump("1-sin-loc"); continue; }
    // nodo función: mismo archivo, símbolo final == loc.symbol, o que contenga startLine
    const cands = (fnByFile.get(loc.file) ?? []);
    let fn = cands.find((n) => loc.symbol && n.symbolPath[n.symbolPath.length - 1] === loc.symbol && n.startLine === loc.startLine)
      ?? cands.find((n) => loc.symbol && n.symbolPath[n.symbolPath.length - 1] === loc.symbol)
      ?? cands.find((n) => n.startLine !== undefined && n.endLine !== undefined && n.startLine <= loc.startLine && loc.startLine <= n.endLine);
    if (!fn) { bump("2-sin-nodo-funcion"); continue; }
    bump("2-con-nodo-funcion");
    const owner = ownerOf(fn.id);
    if (!owner) { bump("3-sin-clase-duena"); continue; }
    bump("3-con-clase-duena");
    const mName = fn.symbolPath[fn.symbolPath.length - 1];
    // familia: hermanos = otros nodos con la MISMA arista de familia hacia el MISMO ancestro,
    //          o subtipos del propio owner.
    const ancestors: any[] = [];
    for (const e of edgesFrom.get(owner.id) ?? []) if (FAMILY_EDGES.has(e.kind)) { const t = nodeById.get(e.to); if (t?.family === "class-like") ancestors.push(t); }
    const subtypes: any[] = [];
    for (const e of edgesTo.get(owner.id) ?? []) if (FAMILY_EDGES.has(e.kind)) { const s = nodeById.get(e.from); if (s?.family === "class-like") subtypes.push(s); }
    if (ancestors.length === 0 && subtypes.length === 0) { bump("4-sin-familia"); continue; }
    bump("4-con-familia");
    // hermanos = subtipos del ancestro (excluyendo al owner) ∪ subtipos del owner
    const sibs = new Map<string, any>();
    for (const anc of ancestors) for (const e of edgesTo.get(anc.id) ?? []) {
      if (!FAMILY_EDGES.has(e.kind)) continue;
      const s = nodeById.get(e.from);
      if (s?.family === "class-like" && s.id !== owner.id) sibs.set(s.id, s);
    }
    for (const s of subtypes) sibs.set(s.id, s);
    if (sibs.size === 0) { bump("5-sin-hermanos"); continue; }
    bump("5-con-hermanos");
    // hermanos que DECLARAN un método homónimo
    const homs: any[] = [];
    for (const s of sibs.values()) {
      const sigs = memberSignatures(gindex as any, s.id);
      const hit = sigs.find((sg: any) => sg.name === mName);
      if (hit) homs.push({ cls: s, sig: hit });
    }
    if (homs.length === 0) { bump("6-sin-homonimo"); continue; }
    bump("6-con-homonimo");
    // ¿ese homónimo TAMBIÉN tiene hallazgo de nivel 2?
    const conN2 = homs.filter((h) => (n2At.get(`${h.cls.file}#${mName}`) ?? []).length > 0);
    if (conN2.length === 0) { bump("7-hermano-sin-n2"); continue; }
    bump("7-hermano-con-n2");
    if (conN2.length >= 2) bump("8-dos-o-mas-hermanos-con-n2");
    rows.push({
      id: f.id ?? stableFindingId(f),
      kind: f.kind,
      file: loc.file, line: loc.startLine, sym: loc.symbol ?? null, metodo: mName,
      owner: owner.symbolPath.join("."), ownerFile: owner.file,
      ancestros: ancestors.map((x) => x.symbolPath.join(".") + "@" + x.file),
      hermanos: sibs.size,
      homonimos: homs.map((h) => h.cls.symbolPath.join(".") + "@" + h.cls.file),
      hermanosConN2: conN2.map((h) => h.cls.symbolPath.join(".") + "@" + h.cls.file + " [" + (n2At.get(`${h.cls.file}#${mName}`) ?? []).join(",") + "]"),
      yaHipotesis: (f.hypotheses ?? []).map((h: any) => `${h.pattern}:${h.state}`),
    });
  }
  writeFileSync(out, JSON.stringify({ slug, dir, wallMs, nodos: graph.nodes.length, aristas: graph.edges.length, stats, rows }, null, 1));
  console.log(`${out}: ${rows.length} filas | ${JSON.stringify(stats)} | ${wallMs}ms`);
}
