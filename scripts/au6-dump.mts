/**
 * OLA AU - AU6 - VOLCADO de `Split by Reason to Change` sobre la copia
 * congelada `scratchpad-au6/src0`. Emite censo, (patron x estado) de TODA
 * hipotesis colgada (la linea base de los 19 patrones), la propuesta entera de
 * la mia, el embudo y la traza de arbitraje.
 * Uso: npx tsx scripts/au6-dump.mts <dir-repo> <nombre> <salida.json>
 */
import { writeFileSync } from "node:fs";
const S0 = "../scratchpad-au6/src0";
const { analyzeRepo } = await import(`${S0}/server/services/code-analyzer.js`);
const { stableFindingId } = await import(`${S0}/server/services/code-finding-ids.js`);
const { startArbitrationTrace, takeArbitrationTrace } = await import(`${S0}/server/services/hypotheses/engine.js`);
const { startSplitByReasonTrace, takeSplitByReasonTrace } = await import(`${S0}/server/services/hypotheses/split-by-reason-to-change.js`);

const MIA = "Split by Reason to Change";
const [, , dir, nombre, out] = process.argv;
if (!dir || !nombre || !out) { console.error("Uso: <dir> <nombre> <salida.json>"); process.exit(1); }

startArbitrationTrace();
startSplitByReasonTrace();
const t0 = performance.now();
const a: any = await analyzeRepo({ dir, repoName: nombre, limits: { maxFindings: "unlimited" } } as any);
const wallMs = Math.round(performance.now() - t0);

const censo: Record<string, number> = {};
const porPatron: Record<string, Record<string, number>> = {};
const mias: any[] = [];
for (const f of a.findings) {
  censo[f.kind] = (censo[f.kind] ?? 0) + 1;
  const id = f.id ?? stableFindingId(f);
  for (const h of f.hypotheses ?? []) {
    const p = (porPatron[h.pattern] ??= {});
    p[h.state] = (p[h.state] ?? 0) + 1;
    if (h.pattern !== MIA) continue;
    mias.push({
      id, kind: f.kind, pattern: h.pattern, state: h.state, confidence: h.confidence ?? null,
      file: f.locations?.[0]?.file ?? "", cost: h.cost ?? null,
      places: (h.places ?? []).map((l: any) => ({ file: l.file, startLine: l.startLine, endLine: l.endLine, role: l.role })),
      checks: (h.checks ?? []).map((c: any) => ({ label: c.label, passed: c.passed, why: c.why, role: c.role })),
      discriminadores: (h.discriminators ?? []).map((c: any) => ({ label: c.label, passed: c.passed, why: c.why })),
      toConfirm: h.toConfirm ?? null,
    });
  }
}
const arbitraje = takeArbitrationTrace();
const descartes = arbitraje.filter((e: any) => e.hypotheses.some((h: any) => h.discarded));
const embudo = takeSplitByReasonTrace();
const resumen: Record<string, number> = { total: embudo.length, emitidas: 0 };
for (const e of embudo as any[]) { if (e.emitted) resumen.emitidas!++; const d = e.diesAt ?? "-"; resumen[`muere:${d}`] = (resumen[`muere:${d}`] ?? 0) + 1; }

writeFileSync(out, JSON.stringify({ repo: nombre, dir, wallMs, totalHallazgos: a.findings.length, censo, porPatron, mias, embudo, resumenEmbudo: resumen, descartesArbitraje: descartes }, null, 1));
console.log(`${nombre}: hallazgos=${a.findings.length} divergent-change=${censo["divergent-change"] ?? 0} mias=${mias.length} embudo=`, resumen, `descartes=${descartes.length}`);
