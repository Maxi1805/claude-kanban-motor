/** AN3 — SONDA (no toca producción). Verifica la CUARTA CONDICIÓN antes de escribir
 *  una línea: ¿existe, para un hallazgo de NIVEL 2 (`long-function`/`complexity`),
 *  el hecho de grafo "los archivos DISTINTOS que ESE símbolo invoca"? */
import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";
import { deriveAnchor } from "../src/server/services/detect/ids.js";
import { symbolNodeId } from "../src/server/services/graph/types.js";

const [, , dir] = process.argv;
const { analysis: a, graph } = await analyzeRepoCached({ dir, repoName: "an3", limits: { maxFindings: "unlimited" } });
if (!graph) { console.log("SIN GRAFO"); process.exit(0); }

const nodeById = new Map<string, any>();
for (const n of graph.nodes) if (!nodeById.has(n.id)) nodeById.set(n.id, n);
// calls símbolo→símbolo CRUDAS (ambiguas incluidas), por nodo de origen
const calleeFilesByNode = new Map<string, Set<string>>();
const calleeFilesByNodeConf = new Map<string, Set<string>>();
for (const e of graph.edges as any[]) {
  if (e.kind !== "calls") continue;
  const from = nodeById.get(e.from); const to = nodeById.get(e.to);
  if (!from || !to || from.kind !== "symbol" || to.kind !== "symbol") continue;
  if (from.file === to.file) continue;
  let s = calleeFilesByNode.get(e.from); if (!s) { s = new Set(); calleeFilesByNode.set(e.from, s); }
  s.add(to.file);
  if (e.provenance !== "ambiguous") {
    let c = calleeFilesByNodeConf.get(e.from); if (!c) { c = new Set(); calleeFilesByNodeConf.set(e.from, c); }
    c.add(to.file);
  }
}

const K = new Set(["long-function", "complexity"]);
let n = 0, conNodo = 0;
const hist = new Map<number, number>();
const conf4: string[] = [];
const raw4: string[] = [];
for (const f of a.findings as any[]) {
  if (!K.has(f.kind)) continue;
  n++;
  const loc = f.locations[0];
  if (!loc) continue;
  const anchor = deriveAnchor(loc);
  const id = symbolNodeId(anchor.file, anchor.symbolPath);
  const node = nodeById.get(id);
  if (!node) continue;
  conNodo++;
  const raw = calleeFilesByNode.get(id)?.size ?? 0;
  const cf = calleeFilesByNodeConf.get(id)?.size ?? 0;
  hist.set(raw, (hist.get(raw) ?? 0) + 1);
  const fid = stableFindingId(f);
  const pats = (f.hypotheses ?? []).map((h: any) => `${h.pattern}:${h.state}`).join(",");
  if (cf >= 4) conf4.push(`CONF ${cf}/${raw} ${fid} ${loc.file}:${loc.startLine} ${anchor.symbolPath.join(".")} [${pats}]`);
  else if (raw >= 4) raw4.push(`RAW  ${cf}/${raw} ${fid} ${loc.file}:${loc.startLine} ${anchor.symbolPath.join(".")} [${pats}]`);
}
console.log(`${dir}: hallazgos nivel2=${n}  con nodo de símbolo en el grafo=${conNodo} (${n ? (100 * conNodo / n).toFixed(1) : 0}%)`);
console.log("  histograma de archivos-callee DISTINTOS (crudo):", [...hist.entries()].sort((x, y) => x[0] - y[0]).map(([k, v]) => `${k}:${v}`).join(" "));
console.log(`  >=4 con aristas CONFIDENTES: ${conf4.length}   >=4 sólo con ambiguas: ${raw4.length}`);
for (const l of conf4.slice(0, 25)) console.log("   ", l);
for (const l of raw4.slice(0, 10)) console.log("   ", l);
