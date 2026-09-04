/** AN3 — sonda 2: ¿por qué el ancla de un hallazgo de nivel 2 no encuentra nodo de símbolo? */
const { analyzeRepoCached } = await import("../scratchpad-an3/src0/server/services/analyze-cache.js");
const { deriveAnchor } = await import("../scratchpad-an3/src0/server/services/detect/ids.js");
const { symbolNodeId } = await import("../scratchpad-an3/src0/server/services/graph/types.js");
const [, , dir] = process.argv;
const { analysis: a, graph } = await analyzeRepoCached({ dir, repoName: "an3", limits: { maxFindings: "unlimited" } } as any) as any;
const nodes = new Map<string, any>(); for (const n of graph.nodes) if (!nodes.has(n.id)) nodes.set(n.id, n);
const symsByFile = new Map<string, string[]>();
for (const n of graph.nodes) if (n.kind === "symbol") { const l = symsByFile.get(n.file) ?? []; l.push(n.id.slice(n.id.indexOf("#") + 1)); symsByFile.set(n.file, l); }
let shown = 0;
for (const f of a.findings as any[]) {
  if (f.kind !== "long-function" && f.kind !== "complexity") continue;
  const loc = f.locations[0]; const anc = deriveAnchor(loc);
  const id = symbolNodeId(anc.file, anc.symbolPath);
  const hit = nodes.has(id);
  if (!hit && shown < 12) {
    shown++;
    console.log(`MISS ${f.kind} ${loc.file}:${loc.startLine} symbol=${JSON.stringify(loc.symbol)} anchorPath=${JSON.stringify(anc.symbolPath)} loc.anchor=${JSON.stringify(loc.anchor)}`);
    console.log(`     símbolos del grafo en ese archivo (${(symsByFile.get(loc.file) ?? []).length}): ${(symsByFile.get(loc.file) ?? []).slice(0, 12).join(" | ")}`);
  }
}
console.log(`nodos symbol totales: ${[...nodes.values()].filter((n) => n.kind === "symbol").length}, archivos con símbolos: ${symsByFile.size}`);
