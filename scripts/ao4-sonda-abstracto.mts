/** AO4 — ¿el grafo trae los miembros declarados ABSTRACTOS (sin cuerpo)? */
import path from "node:path";
const ROOT = process.env.CK_SRC_ROOT ?? "../src";
const base = ROOT.startsWith(".") ? ROOT : path.join("..", ROOT);
const { analyzeRepo } = await import(`${base}/server/services/code-analyzer.js`);
const [, , dir, clase] = process.argv;
let graph: any = null;
await analyzeRepo({ dir, repoName: "s", limits: { maxFindings: 1 }, onGraph: (r: any) => { graph = r.graph; } } as any);
const last = (n: any) => n.symbolPath[n.symbolPath.length - 1] ?? "";
const byId = new Map<string, any>(graph.nodes.map((n: any) => [n.id, n]));
const ef = new Map<string, any[]>();
for (const e of graph.edges) { const l = ef.get(e.from); if (l) l.push(e); else ef.set(e.from, [e]); }
for (const n of graph.nodes) {
  if (n.kind !== "symbol" || n.family !== "class-like" || last(n) !== clase) continue;
  const ms = (ef.get(n.id) ?? []).filter((e: any) => e.kind === "contains").map((e: any) => byId.get(e.to)).filter((t: any) => t?.family === "function-like").map((t: any) => `${last(t)}/${t.arity ?? "?"}`);
  console.log(`${clase} @ ${n.file}:${n.startLine} -> ${ms.length} miembros function-like`);
  console.log("  " + ms.sort().join(" "));
}
