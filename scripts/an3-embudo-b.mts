/**
 * OLA AN, FRENTE AN3 — EL EMBUDO DE `facade.ts` CONTRA EL CONTRAFÁCTICO DE UNA SOLA VARIABLE.
 *
 * Corre el pipeline REAL sobre `scratchpad-an3/srcB` = copia byte a byte de `src/` a las
 * 18:34:26 del 25-08 (`scratchpad-an3/src0`) MÁS `hypotheses/facade.ts` y NADA MÁS
 * (verificado con `cmp` archivo por archivo sobre los 420 `.ts`). Prende la traza que
 * `facade.ts` trae desde esta ola (`startFacadeTrace`/`takeFacadeTrace`, costo cero apagada).
 *
 * Uso: npx tsx scripts/an3-embudo-b.mts <dir-repo> <salida.json>
 */
import { writeFileSync } from "node:fs";

const { analyzeRepoCached } = await import("../scratchpad-an3/srcB/server/services/analyze-cache.js");
const { stableFindingId } = await import("../scratchpad-an3/srcB/server/services/code-finding-ids.js");
const { direccionesDeFila } = await import("../scratchpad-an3/srcB/server/services/detect/precision/direccion-hipotesis.js");
const { startFacadeTrace, takeFacadeTrace } = await import("../scratchpad-an3/srcB/server/services/hypotheses/facade.js");

const [, , dir, out] = process.argv;
if (!dir || !out) { console.error("uso: an3-embudo-b.mts <dir> <out.json>"); process.exit(1); }

const t0 = performance.now();
startFacadeTrace();
const { analysis: a, cache } = await analyzeRepoCached({ dir, repoName: "an3b", limits: { maxFindings: "unlimited" } } as any) as any;
const traza = takeFacadeTrace();
console.error(`[analyzer-cache] ${dir}: ${cache.hit ? "HIT" : "MISS"} (${cache.reason})`);
const wallMs = Math.round(performance.now() - t0);

const findings = (a.findings as any[]).map((f) => {
  const hs = f.hypotheses ?? [];
  const at = direccionesDeFila(hs, f.locations[0]);
  return {
    id: f.id ?? stableFindingId(f),
    kind: f.kind,
    title: f.title,
    where: f.locations.map((l: any) => `${l.file}:${l.startLine}`),
    symbols: f.locations.map((l: any) => l.symbol ?? ""),
    hypotheses: hs.map((h: any, i: number) => ({ pattern: h.pattern, state: h.state, at: at[i] ?? "", places: (h.places ?? []).map((p: any) => `${p.file}:${p.startLine}-${p.endLine}`) })),
  };
});
const porKind: Record<string, number> = {};
for (const f of findings) porKind[f.kind] = (porKind[f.kind] ?? 0) + 1;
writeFileSync(out, JSON.stringify({ dir, wallMs, total: findings.length, porKind, findings, traza }, null, 0));
const vivo = traza.filter((t: any) => t.vecindarioVivo).length;
console.log(`${out}: ${findings.length} hallazgos · traza ${traza.length} (vecindario VIVO en ${vivo}) · ${wallMs}ms`);
