/**
 * OLA AW - FRENTE AW4 - CENSO v2 DEL SUPUESTO DE MODULO, CON LA REGLA CORREGIDA.
 *
 * POR QUE EXISTE ESTE SEGUNDO CENSO. El primero (`aw4-censo.mts`) midio "cuantos
 * archivos declaran EXACTAMENTE UNA class-like EN EL NIVEL SUPERIOR" y dio ruby
 * 1,1 % y C# 5,8 %. Ese numero es un ARTEFACTO: en ruby la clase vive dentro de
 * `module` y en C# dentro de `namespace`, asi que su `symbolPath` tiene largo 2 y
 * el gate de nivel superior las descarta a todas. Este censo mide las DOS reglas
 * lado a lado para poder publicar la diferencia, y ademas vuelca los candidatos
 * bajo la UNIDAD REAL que usa el detector (`unitByFile` de src1).
 *
 * Uso: npx tsx scripts/aw4-censo2.mts <dir-repo> <nombre> <salida.json>
 */
import { writeFileSync } from "node:fs";
import { basename, extname } from "node:path";

const S1 = "../scratchpad-aw4/src1";
const { analyzeRepo } = await import(`${S1}/server/services/code-analyzer.js`);
const { unitByFile } = await import(`${S1}/server/services/detect/inter-file/modulo-envy.js`);
const { symbolNodeId } = await import(`${S1}/server/services/graph/types.js`);

const EXT_LANG: Record<string, string> = {
  ".rb": "ruby", ".rake": "ruby",
  ".ts": "typescript", ".mts": "typescript", ".cts": "typescript",
  ".tsx": "tsx", ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript", ".jsx": "javascript",
  ".vue": "vue", ".py": "python", ".go": "go", ".java": "java", ".cs": "csharp",
  ".rs": "rust", ".ex": "elixir", ".exs": "elixir",
};
const langOf = (f: string): string => EXT_LANG[extname(f)] ?? "otro";
const BARREL = new Set(["index.ts", "index.tsx", "index.js", "index.mjs", "index.cjs", "index.d.ts", "__init__.py", "mod.rs", "index.vue"]);

const [, , dir, nombre, out] = process.argv;
if (!dir || !nombre || !out) { console.error("uso: <dir> <nombre> <salida>"); process.exit(1); }

let graph: any = null;
const t0 = performance.now();
const a: any = await analyzeRepo({ dir, repoName: nombre, limits: { maxFindings: "unlimited" }, onGraph: (r: any) => { graph = r.graph; } } as any);
const wallMs = Math.round(performance.now() - t0);
if (!graph) { writeFileSync(out, JSON.stringify({ repo: nombre, sinGrafo: true })); process.exit(0); }

const byId = new Map<string, any>();
for (const n of graph.nodes) byId.set(n.id, n);
const familyById = new Map<string, string>();
for (const n of graph.nodes) if (n.kind === "symbol") familyById.set(n.id, n.family);

// ── clases por archivo bajo LAS DOS REGLAS ──────────────────────────────
const topPorArchivo = new Map<string, number>();   // regla VIEJA: symbolPath.length === 1
const anyPorArchivo = new Map<string, number>();   // regla NUEVA: cualquier profundidad, no dentro de function-like
const funcTopPorArchivo = new Map<string, number>();
for (const n of graph.nodes) {
  if (n.kind !== "symbol") continue;
  const path: string[] = n.symbolPath ?? [];
  if (n.family === "class-like") {
    if (path.length === 1) topPorArchivo.set(n.file, (topPorArchivo.get(n.file) ?? 0) + 1);
    let dentroDeFuncion = false;
    for (let cut = 1; cut < path.length; cut++) {
      if (familyById.get(symbolNodeId(n.file, path.slice(0, cut))) === "function-like") { dentroDeFuncion = true; break; }
    }
    if (!dentroDeFuncion) anyPorArchivo.set(n.file, (anyPorArchivo.get(n.file) ?? 0) + 1);
  }
  if (n.family === "function-like" && path.length === 1) funcTopPorArchivo.set(n.file, (funcTopPorArchivo.get(n.file) ?? 0) + 1);
}

const unitOf: Map<string, string> = new Map(unitByFile(graph) as any);

type Cel = {
  archivos: number;
  // regla vieja (nivel superior)
  vieja0: number; vieja1: number; vieja2mas: number;
  // regla nueva (cualquier profundidad)
  nueva0: number; nueva1: number; nueva2mas: number;
  unidadArchivo: number; unidadCarpeta: number;
  barriles: number; soloFunciones: number;
};
const cel = (): Cel => ({ archivos: 0, vieja0: 0, vieja1: 0, vieja2mas: 0, nueva0: 0, nueva1: 0, nueva2mas: 0, unidadArchivo: 0, unidadCarpeta: 0, barriles: 0, soloFunciones: 0 });
const porLang = new Map<string, Cel>();
for (const n of graph.nodes) {
  if (n.kind !== "file") continue;
  const l = langOf(n.file);
  let c = porLang.get(l); if (!c) { c = cel(); porLang.set(l, c); }
  c.archivos++;
  const v = topPorArchivo.get(n.file) ?? 0;
  if (v === 0) c.vieja0++; else if (v === 1) c.vieja1++; else c.vieja2mas++;
  const u = anyPorArchivo.get(n.file) ?? 0;
  if (u === 0) c.nueva0++; else if (u === 1) c.nueva1++; else c.nueva2mas++;
  if ((unitOf.get(n.file) ?? "").startsWith("file:")) c.unidadArchivo++; else c.unidadCarpeta++;
  if (BARREL.has(basename(n.file))) c.barriles++;
  if (u === 0 && (funcTopPorArchivo.get(n.file) ?? 0) > 0) c.soloFunciones++;
}

// ── cuantos SIMBOLOS resuelven a un modulo sin ambiguedad ────────────────
const USO = new Set(["references", "calls", "instantiates"]);
let usoTot = 0, usoResuelto = 0, usoAmbRescatado = 0, usoAmbPerdido = 0, usoSinNodo = 0;
const usoPorLang: Record<string, { total: number; resuelto: number; rescatado: number; perdido: number }> = {};
for (const e of graph.edges) {
  if (!USO.has(e.kind)) continue;
  const from = byId.get(e.from);
  if (!from || from.kind !== "symbol") continue;
  const l = langOf(from.file);
  const up = (usoPorLang[l] ??= { total: 0, resuelto: 0, rescatado: 0, perdido: 0 });
  usoTot++; up.total++;
  const to = byId.get(e.to);
  if (!to || to.kind !== "symbol") { usoSinNodo++; up.perdido++; usoAmbPerdido++; continue; }
  if (e.provenance !== "ambiguous") { usoResuelto++; up.resuelto++; continue; }
  const cands = [e.to, ...(e.alternatives ?? [])].map((id: string) => byId.get(id));
  const units = new Set<string>();
  let missing = false;
  for (const c of cands) { if (!c) { missing = true; break; } const u = unitOf.get(c.file); if (!u) { missing = true; break; } units.add(u); }
  if (!missing && units.size === 1) { usoAmbRescatado++; up.rescatado++; } else { usoAmbPerdido++; up.perdido++; }
}

const censo: Record<string, number> = {};
for (const f of a.findings) censo[f.kind] = (censo[f.kind] ?? 0) + 1;

writeFileSync(out, JSON.stringify({
  repo: nombre, dir, wallMs, nodos: graph.nodes.length, aristas: graph.edges.length,
  porLenguaje: Object.fromEntries([...porLang.entries()].sort()),
  uso: { total: usoTot, resuelto: usoResuelto, ambRescatado: usoAmbRescatado, ambPerdido: usoAmbPerdido, sinNodo: usoSinNodo, porLenguaje: usoPorLang },
  censo,
}, null, 1));
console.error(`${nombre}: unidades ok - uso ${usoResuelto}+${usoAmbRescatado}resc/${usoTot} - ${wallMs} ms`);
