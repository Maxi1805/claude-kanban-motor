/**
 * OLA AW - FRENTE AW4 - CENSO DEL SUPUESTO DE MODULO + VOLCADO DE LAS ANCLAS DE ACOPLAMIENTO.
 *
 * PASO 1: por lenguaje, que fraccion de archivos declara EXACTAMENTE UNA entidad
 *         class-like, cuantos tienen funciones sueltas, cuantos son barriles, y
 *         que fraccion de aristas ambiguas se RESCATA al atribuir por ARCHIVO o
 *         por CARPETA en vez de por simbolo.
 * PASO 2: volcado completo de las anclas de acoplamiento ya registradas.
 * PASO 3 (calibracion): ATFD/LAA con unidad de MODULO calculado sobre el grafo,
 *         con piso bajo, para barrer umbrales OFFLINE.
 *
 * Uso: npx tsx scripts/aw4-censo.mts <dir-repo> <nombre> <salida.json>
 */
import { writeFileSync } from "node:fs";
import { basename, extname, dirname } from "node:path";

const S0 = "../scratchpad-aw4/src0";
const { analyzeRepo } = await import(`${S0}/server/services/code-analyzer.js`);
const { stableFindingId } = await import(`${S0}/server/services/code-finding-ids.js`);

const ANCLAS = new Set([
  "coupling-without-abstraction", "fanout-without-cohesion", "layer-skip",
  "unstable-dependency", "god-component", "middle-man", "demeter-chain",
  "inappropriate-intimacy", "feature-envy-inter", "feature-envy-intra",
  "import-depth-demeter",
]);

const EXT_LANG: Record<string, string> = {
  ".rb": "ruby", ".rake": "ruby",
  ".ts": "typescript", ".mts": "typescript", ".cts": "typescript",
  ".tsx": "tsx", ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript", ".jsx": "javascript",
  ".vue": "vue", ".py": "python", ".go": "go", ".java": "java", ".cs": "csharp",
  ".rs": "rust", ".ex": "elixir", ".exs": "elixir",
};
const langOf = (f: string): string => EXT_LANG[extname(f)] ?? "otro";

const BARREL = new Set(["index.ts", "index.tsx", "index.js", "index.mjs", "index.cjs", "index.d.ts", "__init__.py", "mod.rs", "index.vue"]);
const CONSTRUCTORES = new Set(["initialize", "constructor", "__init__", "new"]);

// Aristas de USO desde el cuerpo de un simbolo hacia otro simbolo.
const USO = new Set(["references", "calls", "instantiates"]);

const [, , dir, nombre, out] = process.argv;
if (!dir || !nombre || !out) { console.error("Uso: npx tsx scripts/aw4-censo.mts <dir> <nombre> <salida.json>"); process.exit(1); }

const t0 = performance.now();
let graph: any = null;
const a: any = await analyzeRepo({ dir, repoName: nombre, limits: { maxFindings: "unlimited" }, onGraph: (r: any) => { graph = r.graph; } } as any);
const wallMs = Math.round(performance.now() - t0);

// ── censo de hallazgos + anclas + baseline de hipotesis ────────────────────
const censo: Record<string, number> = {};
const hipotesis: any[] = [];
const anclas: any[] = [];
for (const f of a.findings) {
  censo[f.kind] = (censo[f.kind] ?? 0) + 1;
  const id = f.id ?? stableFindingId(f);
  for (const h of f.hypotheses ?? []) hipotesis.push({ id, kind: f.kind, pattern: h.pattern, state: h.state });
  if (!ANCLAS.has(f.kind)) continue;
  anclas.push({
    id, kind: f.kind, scope: f.scope, language: f.language, severity: f.severity,
    title: f.title,
    detail: (f.detail ?? "").length > 2200 ? f.detail.slice(0, 2200) : f.detail,
    locations: (f.locations ?? []).map((l: any) => ({ file: l.file, startLine: l.startLine, endLine: l.endLine, symbol: l.symbol ?? "", role: l.role })),
    hypotheses: (f.hypotheses ?? []).map((h: any) => ({ pattern: h.pattern, state: h.state })),
  });
}

const salida: any = { repo: nombre, dir, wallMs, totalHallazgos: a.findings.length, censo, anclas, hipotesis };

if (!graph) { writeFileSync(out, JSON.stringify(salida, null, 1)); console.error(`${nombre}: SIN GRAFO`); process.exit(0); }

salida.nodos = graph.nodes.length;
salida.aristas = graph.edges.length;

const byId = new Map<string, any>();
for (const n of graph.nodes) byId.set(n.id, n);

// ── PASO 1.a: censo por archivo/lenguaje ──────────────────────────────────
type Cel = { archivos: number; c0: number; c1: number; c2mas: number; conFuncSuelta: number; barriles: number; soloFunciones: number; simbolos: number; classLike: number; functionLike: number; namespaceLike: number; miembros: number; clasesTotal: number };
const cel = (): Cel => ({ archivos: 0, c0: 0, c1: 0, c2mas: 0, conFuncSuelta: 0, barriles: 0, soloFunciones: 0, simbolos: 0, classLike: 0, functionLike: 0, namespaceLike: 0, miembros: 0, clasesTotal: 0 });
const porLang = new Map<string, Cel>();
const cellFor = (l: string): Cel => { let c = porLang.get(l); if (!c) { c = cel(); porLang.set(l, c); } return c; };

const simbolosPorArchivo = new Map<string, any[]>();
for (const n of graph.nodes) {
  if (n.kind !== "symbol") continue;
  let arr = simbolosPorArchivo.get(n.file); if (!arr) { arr = []; simbolosPorArchivo.set(n.file, arr); }
  arr.push(n);
}
const archivos: string[] = graph.nodes.filter((n: any) => n.kind === "file").map((n: any) => n.file);
// class-like top-level por archivo, para reusar
const claseTopPorArchivo = new Map<string, number>();
const claseTotPorArchivo = new Map<string, number>();
const funcTopPorArchivo = new Map<string, number>();
for (const f of archivos) {
  const ss = simbolosPorArchivo.get(f) ?? [];
  let ct = 0, cTot = 0, ft = 0;
  for (const s of ss) {
    if (s.family === "class-like") { cTot++; if ((s.symbolPath?.length ?? 0) === 1) ct++; }
    if (s.family === "function-like" && (s.symbolPath?.length ?? 0) === 1 && !(s.memberOfClassLike ?? false)) ft++;
  }
  claseTopPorArchivo.set(f, ct); claseTotPorArchivo.set(f, cTot); funcTopPorArchivo.set(f, ft);
}
for (const f of archivos) {
  const l = langOf(f); const c = cellFor(l);
  c.archivos++;
  const ct = claseTopPorArchivo.get(f) ?? 0; const ft = funcTopPorArchivo.get(f) ?? 0;
  if (ct === 0) c.c0++; else if (ct === 1) c.c1++; else c.c2mas++;
  if (ft > 0) c.conFuncSuelta++;
  if (ct === 0 && ft > 0) c.soloFunciones++;
  if (BARREL.has(basename(f))) c.barriles++;
  c.clasesTotal += claseTotPorArchivo.get(f) ?? 0;
  for (const s of simbolosPorArchivo.get(f) ?? []) {
    c.simbolos++;
    if (s.family === "class-like") c.classLike++;
    else if (s.family === "function-like") c.functionLike++;
    else if (s.family === "namespace-like") c.namespaceLike++;
    if ((s.symbolPath?.length ?? 0) > 1 || (s.memberOfClassLike ?? false)) c.miembros++;
  }
}
salida.porLenguaje = Object.fromEntries([...porLang.entries()].sort());

// ── PASO 1.b: rescate de la ambiguedad al subir a archivo/carpeta ─────────
const provPorKind: Record<string, Record<string, number>> = {};
let ambTot = 0, ambMismoArchivo = 0, ambMismaCarpeta = 0, ambDistinto = 0, ambSinNodo = 0;
const ambPorLang: Record<string, { total: number; mismoArchivo: number; mismaCarpeta: number }> = {};
for (const e of graph.edges) {
  const pk = (provPorKind[e.kind] ??= {});
  pk[e.provenance] = (pk[e.provenance] ?? 0) + 1;
  if (e.provenance !== "ambiguous") continue;
  if (!USO.has(e.kind)) continue;
  ambTot++;
  const cands = [e.to, ...(e.alternatives ?? [])];
  const nodes = cands.map((id: string) => byId.get(id)).filter(Boolean);
  if (nodes.length !== cands.length) { ambSinNodo++; }
  const files = new Set(nodes.map((n: any) => n.file));
  const folders = new Set(nodes.map((n: any) => dirname(n.file)));
  const l = langOf(byId.get(e.from)?.file ?? "");
  const ap = (ambPorLang[l] ??= { total: 0, mismoArchivo: 0, mismaCarpeta: 0 });
  ap.total++;
  if (files.size === 1) { ambMismoArchivo++; ap.mismoArchivo++; }
  else if (folders.size === 1) { ambMismaCarpeta++; ap.mismaCarpeta++; }
  else ambDistinto++;
}
salida.provenancePorKind = provPorKind;
salida.ambiguedad = { totalUso: ambTot, mismoArchivo: ambMismoArchivo, mismaCarpetaNoMismoArchivo: ambMismaCarpeta, distinto: ambDistinto, sinNodo: ambSinNodo, porLenguaje: ambPorLang };

// ── PASO 3 (calibracion): ATFD/LAA con unidad de MODULO ──────────────────
// Aristas de uso salientes de cada simbolo function-like, agrupadas por el
// ARCHIVO (y por la CARPETA) que declara el destino: la idea del usuario,
// `contains`. Se calculan LAS DOS granularidades porque la unidad correcta no
// es la misma en los seis lenguajes (Go: paquete = carpeta).
type Sal = { file: string; member: string; amb: boolean; rm: boolean };
const salientes = new Map<string, Sal[]>();
const escrituras = new Map<string, Set<string>>(); // simbolo -> archivos donde ESCRIBE (arista `stores`)
let ambDescartadas = 0, ambRescatadas = 0;
const cobPorLang: Record<string, { funcs: number; conSalida: number; conAjeno: number }> = {};
for (const e of graph.edges) {
  const from = byId.get(e.from);
  if (!from || from.kind !== "symbol") continue;
  const to = byId.get(e.to);
  if (!to || to.kind !== "symbol") continue;
  if (e.kind === "stores") {
    let st = escrituras.get(e.from); if (!st) { st = new Set(); escrituras.set(e.from, st); }
    st.add(to.file);
    continue;
  }
  if (!USO.has(e.kind)) continue;
  const amb = e.provenance === "ambiguous";
  if (amb) {
    const cs = [e.to, ...(e.alternatives ?? [])].map((id: string) => byId.get(id)).filter(Boolean);
    const files = new Set(cs.map((n: any) => n.file));
    if (files.size !== 1) { ambDescartadas++; continue; }
    ambRescatadas++;
  }
  const member = (to.symbolPath ?? []).length ? to.symbolPath[to.symbolPath.length - 1] : basename(to.file);
  const rm = ((e.roles ?? 0) & 2) !== 0;
  let arr = salientes.get(e.from); if (!arr) { arr = []; salientes.set(e.from, arr); }
  arr.push({ file: to.file, member, amb, rm });
}
salida.rescate = { ambRescatadas, ambDescartadas };

const cands: any[] = [];
const histA: Record<string, number> = {};   // ATFD por ARCHIVO
const histC: Record<string, number> = {};   // ATFD por CARPETA
for (const n of graph.nodes) {
  if (n.kind !== "symbol" || n.family !== "function-like") continue;
  const lang = langOf(n.file);
  const cb = (cobPorLang[lang] ??= { funcs: 0, conSalida: 0, conAjeno: 0 });
  cb.funcs++;
  const sal = salientes.get(n.id); if (!sal) continue;
  cb.conSalida++;
  const propioDir = dirname(n.file);
  const propiosF = new Set<string>(); const ajenosF = new Map<string, Set<string>>();
  const propiosC = new Set<string>(); const ajenosC = new Map<string, Set<string>>();
  let ambUsadas = 0, rmCount = 0;
  for (const s of sal) {
    if (s.amb) ambUsadas++;
    if (s.rm) rmCount++;
    if (s.file === n.file) propiosF.add(s.member);
    else { let st = ajenosF.get(s.file); if (!st) { st = new Set(); ajenosF.set(s.file, st); } st.add(s.member); }
    const d = dirname(s.file);
    if (d === propioDir) propiosC.add(s.member);
    else { let st = ajenosC.get(d); if (!st) { st = new Set(); ajenosC.set(d, st); } st.add(s.member); }
  }
  const dominante = (m: Map<string, Set<string>>): [string, number] => {
    let df = "", dn = 0;
    for (const [f, st] of m) if (st.size > dn || (st.size === dn && f < df)) { df = f; dn = st.size; }
    return [df, dn];
  };
  const [domF, domNF] = dominante(ajenosF);
  const [domC, domNC] = dominante(ajenosC);
  if (domNF > 0) cb.conAjeno++;
  histA[String(Math.min(domNF, 12))] = (histA[String(Math.min(domNF, 12))] ?? 0) + 1;
  histC[String(Math.min(domNC, 12))] = (histC[String(Math.min(domNC, 12))] ?? 0) + 1;
  if (domNF < 2 && domNC < 2) continue;
  const nombre2 = (n.symbolPath ?? []).length ? n.symbolPath[n.symbolPath.length - 1] : "";
  // anidada: el contenedor inmediato es otra function-like del mismo archivo
  let anidada = false;
  if ((n.symbolPath ?? []).length > 1) {
    const padreId = `sym:${n.file}#${n.symbolPath.slice(0, -1).join(".")}`;
    const padre = byId.get(padreId);
    anidada = !!padre && padre.family === "function-like";
  }
  const topProv = [...ajenosF.entries()].map(([f, st]) => [f, st.size] as [string, number]).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, 5);
  cands.push({
    id: n.id, file: n.file, lang, symbolPath: n.symbolPath, name: nombre2,
    startLine: n.startLine ?? null, endLine: n.endLine ?? null,
    miembro: n.memberOfClassLike ?? null, nodeType: n.nodeType ?? null,
    ctor: CONSTRUCTORES.has(nombre2), anidada, anon: nombre2 === "",
    atfdF: domNF, ownF: propiosF.size, domF,
    laaF: propiosF.size + domNF === 0 ? null : Number((propiosF.size / (propiosF.size + domNF)).toFixed(3)),
    atfdC: domNC, ownC: propiosC.size, domC,
    laaC: propiosC.size + domNC === 0 ? null : Number((propiosC.size / (propiosC.size + domNC)).toFixed(3)),
    domClasesTop: claseTopPorArchivo.get(domF) ?? 0,
    domClasesTot: claseTotPorArchivo.get(domF) ?? 0,
    domFuncTop: funcTopPorArchivo.get(domF) ?? 0,
    domBarril: BARREL.has(basename(domF)),
    mismaCarpeta: dirname(domF) === propioDir,
    proveedoresF: ajenosF.size, proveedoresC: ajenosC.size,
    ajenosTot: [...ajenosF.values()].reduce((s, x) => s + x.size, 0),
    ambUsadas, rmCount, saltos: sal.length,
    escribeEnDom: (escrituras.get(n.id) ?? new Set()).has(domF),
    escribeEn: [...(escrituras.get(n.id) ?? new Set())].slice(0, 4),
    domMiembros: [...(ajenosF.get(domF) ?? [])].sort().slice(0, 14),
    domMiembrosC: [...(ajenosC.get(domC) ?? [])].sort().slice(0, 14),
    propiosMuestra: [...propiosF].sort().slice(0, 10),
    propioClasesTop: claseTopPorArchivo.get(n.file) ?? 0,
    propioBarril: BARREL.has(basename(n.file)),
    topProv,
  });
}
cands.sort((x, y) => (x.id < y.id ? -1 : 1));
salida.cobertura = cobPorLang;
salida.moduloEnvy = { histArchivo: histA, histCarpeta: histC, totalCandidatos: cands.length, candidatos: cands.slice(0, 12000) };

writeFileSync(out, JSON.stringify(salida, null, 1));
console.error(`${nombre}: ${a.findings.length} hallazgos - ${anclas.length} anclas - ${cands.length} cand - amb ${ambRescatadas} resc / ${ambDescartadas} desc - ${wallMs} ms`);
