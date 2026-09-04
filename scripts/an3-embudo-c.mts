/**
 * AN3 — verificación FINAL: el árbol que queda (`scratchpad-an3/srcC` = `src0` + el
 * `facade.ts` de cierre, con la traza y SIN las anclas nuevas) produce EXACTAMENTE lo mismo
 * que el árbol de apertura. Es la prueba de que lo que queda es neutral en comportamiento.
 */
import { writeFileSync } from "node:fs";
const { analyzeRepoCached } = await import("../scratchpad-an3/srcC/server/services/analyze-cache.js");
const { stableFindingId } = await import("../scratchpad-an3/srcC/server/services/code-finding-ids.js");
const { direccionesDeFila } = await import("../scratchpad-an3/srcC/server/services/detect/precision/direccion-hipotesis.js");
const [, , dir, out] = process.argv;
const { analysis: a } = await analyzeRepoCached({ dir, repoName: "an3c", limits: { maxFindings: "unlimited" } } as any) as any;
const findings = (a.findings as any[]).map((f) => {
  const hs = f.hypotheses ?? [];
  const at = direccionesDeFila(hs, f.locations[0]);
  return { id: f.id ?? stableFindingId(f), kind: f.kind, where: f.locations.map((l: any) => `${l.file}:${l.startLine}`),
    hypotheses: hs.map((h: any, i: number) => ({ pattern: h.pattern, state: h.state, at: at[i] ?? "" })) };
});
writeFileSync(out, JSON.stringify({ dir, total: findings.length, findings }, null, 0));
console.log(`${out}: ${findings.length} hallazgos`);
