/**
 * AN3 — SONDA de la CUARTA CONDICIÓN, corrida contra la copia congelada `scratchpad-an3/src0`.
 * Pregunta: para un hallazgo de NIVEL 2 (`long-function`/`complexity`), ¿EXISTE el hecho de grafo
 * "los archivos DISTINTOS que ESE símbolo invoca"? Y si existe, ¿cuántos llegan a >= 4?
 * No toca producción.
 */
import { writeFileSync } from "node:fs";

const { analyzeRepoCached } = await import("../scratchpad-an3/src0/server/services/analyze-cache.js");
const { stableFindingId } = await import("../scratchpad-an3/src0/server/services/code-finding-ids.js");
const { deriveAnchor } = await import("../scratchpad-an3/src0/server/services/detect/ids.js");
const { symbolNodeId } = await import("../scratchpad-an3/src0/server/services/graph/types.js");

const [, , dir, out] = process.argv;
const { analysis: a, graph } = await analyzeRepoCached({ dir, repoName: "an3", limits: { maxFindings: "unlimited" } } as any) as any;
if (!graph) { console.log(`${dir}: SIN GRAFO`); process.exit(0); }

const nodeById = new Map<string, any>();
for (const n of graph.nodes) if (!nodeById.has(n.id)) nodeById.set(n.id, n);
const calleeFiles = new Map<string, Set<string>>();        // nodo símbolo -> archivos callee DISTINTOS (crudo)
const calleeFilesConf = new Map<string, Set<string>>();    // ídem, sólo aristas NO ambiguas
let callsTotal = 0, callsSymSym = 0;
for (const e of graph.edges as any[]) {
  if (e.kind !== "calls") continue;
  callsTotal++;
  const from = nodeById.get(e.from); const to = nodeById.get(e.to);
  if (!from || !to || from.kind !== "symbol" || to.kind !== "symbol") continue;
  callsSymSym++;
  if (from.file === to.file) continue;
  let s = calleeFiles.get(e.from); if (!s) { s = new Set(); calleeFiles.set(e.from, s); } s.add(to.file);
  if (e.provenance !== "ambiguous") { let c = calleeFilesConf.get(e.from); if (!c) { c = new Set(); calleeFilesConf.set(e.from, c); } c.add(to.file); }
}

const K = new Set(["long-function", "complexity"]);
const hist = new Map<number, number>(); const histConf = new Map<number, number>();
let n = 0, conNodo = 0;
const filas: any[] = [];
for (const f of a.findings as any[]) {
  if (!K.has(f.kind)) continue;
  n++;
  const loc = f.locations[0]; if (!loc) continue;
  const anchor = deriveAnchor(loc);
  const id = symbolNodeId(anchor.file, anchor.symbolPath);
  const node = nodeById.get(id);
  const raw = node ? (calleeFiles.get(id)?.size ?? 0) : -1;
  const cf = node ? (calleeFilesConf.get(id)?.size ?? 0) : -1;
  if (node) conNodo++;
  hist.set(raw, (hist.get(raw) ?? 0) + 1); histConf.set(cf, (histConf.get(cf) ?? 0) + 1);
  if (cf >= 4 || raw >= 4) {
    filas.push({ id: f.id ?? stableFindingId(f), kind: f.kind, file: loc.file, line: loc.startLine,
      sym: anchor.symbolPath.join("."), raw, cf,
      hyp: (f.hypotheses ?? []).map((h: any) => `${h.pattern}:${h.state}`),
      callees: [...(calleeFilesConf.get(id) ?? [])].sort() });
  }
}
const ord = (m: Map<number, number>) => [...m.entries()].sort((x, y) => x[0] - y[0]).map(([k, v]) => `${k}:${v}`).join(" ");
console.log(`${dir}: nivel2=${n} conNodo=${conNodo} (${n ? (100 * conNodo / n).toFixed(1) : 0}%) callsTot=${callsTotal} symsym=${callsSymSym}`);
console.log(`  hist CRUDO  : ${ord(hist)}`);
console.log(`  hist CONFID.: ${ord(histConf)}`);
console.log(`  >=4 confidentes: ${filas.filter((r) => r.cf >= 4).length}   >=4 sólo crudo: ${filas.filter((r) => r.cf < 4 && r.raw >= 4).length}`);
if (out) writeFileSync(out, JSON.stringify({ dir, n, conNodo, filas }, null, 1));
