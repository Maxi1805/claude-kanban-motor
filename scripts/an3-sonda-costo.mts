/** AN3 — ¿cuántos archivos MÁS habría que revivir si `long-function`/`complexity` fueran ancla? */
const { analyzeRepoCached } = await import("../scratchpad-an3/src0/server/services/analyze-cache.js");
const { HYPOTHESES } = await import("../scratchpad-an3/src0/server/services/hypotheses/registry.js");
const [, , dir] = process.argv;
const { analysis: a } = await analyzeRepoCached({ dir, repoName: "an3", limits: { maxFindings: "unlimited" } } as any) as any;
const anclas = new Set<string>(); for (const b of HYPOTHESES as readonly any[]) for (const k of b.anchors) anclas.add(k);
const hoy = new Set<string>(), conNuevas = new Set<string>();
let n2 = 0;
for (const f of a.findings as any[]) {
  if (f.locations.length === 0) continue;
  const p = f.locations[0].file;
  if (anclas.has(f.kind)) { hoy.add(p); conNuevas.add(p); }
  if (f.kind === "long-function" || f.kind === "complexity") { conNuevas.add(p); n2++; }
}
console.log(`${dir}: hallazgos=${a.findings.length} nivel2(lf+cx)=${n2}  archivos revividos HOY=${hoy.size}  con las anclas nuevas=${conNuevas.size}  (+${conNuevas.size - hoy.size})`);
