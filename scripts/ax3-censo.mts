/**
 * OLA AX - FRENTE AX3 - CENSO DE POBLACION DE `Lazy Class`.
 *
 * PASO 1 del encargo: ¿HAY POBLACION? Antes de escribir una linea de deteccion,
 * contar cuantas clases hay en los 21 repos y caracterizarlas con los hechos
 * VISIBLES EN LO QUE EL ANALIZADOR CARGA (nodos y aristas del grafo), para poder
 * decidir despues si existe una precondicion que vuelva PROBLEMA a una clase chica.
 *
 * Uso: npx tsx scripts/ax3-censo.mts <dir-repo> <nombre> <salida.json>
 */
import { writeFileSync } from "node:fs";
import { basename, extname, dirname } from "node:path";

const S0 = "../scratchpad-ax3/src0";
const { analyzeRepo } = await import(`${S0}/server/services/code-analyzer.js`);

const EXT_LANG: Record<string, string> = {
  ".rb": "ruby", ".rake": "ruby",
  ".ts": "typescript", ".mts": "typescript", ".cts": "typescript",
  ".tsx": "tsx", ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript", ".jsx": "javascript",
  ".vue": "vue", ".py": "python", ".go": "go", ".java": "java", ".cs": "csharp",
  ".rs": "rust", ".ex": "elixir", ".exs": "elixir",
};
const langOf = (f: string): string => EXT_LANG[extname(f)] ?? "otro";

const USO = new Set(["references", "calls", "instantiates"]);
const SUBTIPO = new Set(["extends", "implements"]);

const esTest = (f: string): boolean =>
  /(^|\/)(test|tests|spec|specs|__tests__|testdata|fixtures|__fixtures__)(\/|$)/i.test(f) ||
  /(_test|\.test|\.spec|_spec|Test|Tests)\.[a-z]+$/.test(basename(f));

const [, , dir, nombre, out] = process.argv;
if (!dir || !nombre || !out) { console.error("Uso: npx tsx scripts/ax3-censo.mts <dir> <nombre> <salida.json>"); process.exit(1); }

const t0 = performance.now();
let graph: any = null;
const a: any = await analyzeRepo({ dir, repoName: nombre, limits: { maxFindings: "unlimited" }, onGraph: (r: any) => { graph = r.graph; } } as any);
const wallMs = Math.round(performance.now() - t0);
if (!graph) { writeFileSync(out, JSON.stringify({ repo: nombre, sinGrafo: true })); process.exit(0); }

const byId = new Map<string, any>();
for (const n of graph.nodes) byId.set(n.id, n);

// ── indices ───────────────────────────────────────────────────────────────
const simbolosPorArchivo = new Map<string, any[]>();
for (const n of graph.nodes) {
  if (n.kind !== "symbol") continue;
  let arr = simbolosPorArchivo.get(n.file); if (!arr) { arr = []; simbolosPorArchivo.set(n.file, arr); }
  arr.push(n);
}
// contains: padre -> hijos
const hijos = new Map<string, string[]>();
// entrantes por kind
const ent = new Map<string, any[]>();
const sal = new Map<string, any[]>();
for (const e of graph.edges) {
  if (e.kind === "contains") {
    let h = hijos.get(e.from); if (!h) { h = []; hijos.set(e.from, h); }
    h.push(e.to);
    continue;
  }
  let ee = ent.get(e.to); if (!ee) { ee = []; ent.set(e.to, ee); }
  ee.push(e);
  let ss = sal.get(e.from); if (!ss) { ss = []; sal.set(e.from, ss); }
  ss.push(e);
}

// nodos class-like
const clases = graph.nodes.filter((n: any) => n.kind === "symbol" && n.family === "class-like");

// miembros por camino de simbolo (mismo archivo, symbolPath prefijo)
const miembrosPorClase = new Map<string, any[]>();
for (const c of clases) {
  const ss = simbolosPorArchivo.get(c.file) ?? [];
  const p = c.symbolPath ?? [];
  const ms: any[] = [];
  for (const s of ss) {
    const sp = s.symbolPath ?? [];
    if (sp.length !== p.length + 1) continue;
    let ok = true;
    for (let i = 0; i < p.length; i++) if (sp[i] !== p[i]) { ok = false; break; }
    if (ok) ms.push(s);
  }
  miembrosPorClase.set(c.id, ms);
}
// miembros por arista `contains` (para Go, donde el metodo no anida por symbolPath)
const miembrosContains = new Map<string, any[]>();
for (const c of clases) {
  const hs = (hijos.get(c.id) ?? []).map((id) => byId.get(id)).filter((n) => n && n.kind === "symbol");
  miembrosContains.set(c.id, hs);
}

const filas: any[] = [];
for (const c of clases) {
  const lang = langOf(c.file);
  const mp = miembrosPorClase.get(c.id) ?? [];
  const mc = miembrosContains.get(c.id) ?? [];
  // union de las dos vias
  const union = new Map<string, any>();
  for (const m of mp) union.set(m.id, m);
  for (const m of mc) union.set(m.id, m);
  const miembros = [...union.values()];
  const metodos = miembros.filter((m) => m.family === "function-like");
  const campos = miembros.filter((m) => m.family !== "function-like");

  // entrantes
  const entradas = ent.get(c.id) ?? [];
  let inUso = 0, inUsoExt = 0, inInst = 0, inInstExt = 0, subtipos = 0, inDecl = 0, inSat = 0;
  const archUsuarios = new Set<string>();
  const simUsuarios = new Set<string>();
  const archTodos = new Set<string>();
  for (const e of entradas) {
    const from = byId.get(e.from);
    const fFile = from?.file ?? "";
    if (SUBTIPO.has(e.kind)) { subtipos++; continue; }
    if (e.kind === "satisfies") { inSat++; continue; }
    if (e.kind === "declares-type") { inDecl++; if (fFile && fFile !== c.file) { archUsuarios.add(fFile); simUsuarios.add(e.from); } archTodos.add(fFile); continue; }
    if (!USO.has(e.kind)) continue;
    inUso++;
    if (e.kind === "instantiates") inInst++;
    archTodos.add(fFile);
    if (fFile && fFile !== c.file) {
      inUsoExt++;
      if (e.kind === "instantiates") inInstExt++;
      archUsuarios.add(fFile);
      simUsuarios.add(e.from);
    }
  }
  // salientes de la clase y de sus miembros: a que archivos ajenos van
  const destArch = new Map<string, number>();
  let outTot = 0;
  const metDet: any[] = [];
  for (const m of [c, ...miembros]) {
    const ss = sal.get(m.id) ?? [];
    const propios = new Set<string>();
    let mOut = 0;
    for (const e of ss) {
      if (!USO.has(e.kind)) continue;
      const to = byId.get(e.to);
      if (!to) continue;
      mOut++;
      if (to.file === c.file) continue;
      outTot++;
      destArch.set(to.file, (destArch.get(to.file) ?? 0) + 1);
      propios.add(to.file);
    }
    if (m !== c && m.family === "function-like") {
      metDet.push({
        n: (m.symbolPath ?? []).slice(-1)[0] ?? "",
        loc: (m.endLine ?? 0) - (m.startLine ?? 0) + 1,
        ar: m.arity ?? null,
        out: mOut, arch: propios.size,
      });
    }
  }
  let domArch = "", domN = 0;
  for (const [f, n] of destArch) if (n > domN) { domArch = f; domN = n; }

  // padre declarado
  const salC = sal.get(c.id) ?? [];
  const padres = salC.filter((e: any) => e.kind === "extends").map((e: any) => byId.get(e.to)?.id ?? e.to);
  const interfaces = salC.filter((e: any) => e.kind === "implements").length;
  const subIds = entradas.filter((e: any) => SUBTIPO.has(e.kind)).map((e: any) => e.from);

  filas.push({
    id: c.id, file: c.file, lang, path: c.symbolPath, nt: c.nodeType ?? null,
    exp: c.exported ?? null, vis: c.visibility ?? null,
    sl: c.startLine ?? null, el: c.endLine ?? null,
    loc: (c.endLine ?? 0) - (c.startLine ?? 0) + 1,
    test: esTest(c.file),
    nm: miembros.length, nmet: metodos.length, ncamp: campos.length,
    nmPath: mp.length, nmCont: mc.length,
    inUso, inUsoExt, inInst, inInstExt, inDecl, inSat, subtipos,
    usArch: archUsuarios.size, usSim: simUsuarios.size,
    usArchLista: [...archUsuarios].slice(0, 6),
    padres: padres.length, interfaces,
    padresIds: padres.slice(0, 4), subIds: subIds.slice(0, 8),
    outTot, domArch, domN, destArchN: destArch.size,
    met: metDet.slice(0, 40),
  });
}

filas.sort((x, y) => (x.id < y.id ? -1 : 1));
writeFileSync(out, JSON.stringify({ repo: nombre, dir, wallMs, nodos: graph.nodes.length, aristas: graph.edges.length, totalClases: filas.length, clases: filas }, null, 0));
console.error(`${nombre}: ${filas.length} class-like - ${graph.nodes.length} nodos - ${wallMs} ms`);
