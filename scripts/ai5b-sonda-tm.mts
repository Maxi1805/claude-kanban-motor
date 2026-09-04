/**
 * AI5b — SONDA de la dirección RAÍZ de Template Method (auditoría, no producción).
 * Corre el analizador REAL desde la copia congelada `scratchpad-ai5b/srcP`,
 * instrumentada en UN solo punto (`buildFromStructuralAnchor`), y registra por
 * cada hallazgo de ancla estructural los TRES hechos de grafo que el CRITERIO
 * exige verificar ANTES de escribir producción.
 * Uso: npx tsx scripts/ai5b-sonda-tm.mts <dir-repo> <salida.json>
 */
import { writeFileSync } from "node:fs";
(globalThis as any).__AI5B = { rows: [], errors: [], pass: "?" };
const { analyzeRepo } = await import("../scratchpad-ai5b/srcP/server/services/code-analyzer.js");
const { stableFindingId } = await import("../scratchpad-ai5b/srcP/server/services/code-finding-ids.js");
const [, , dir, out] = process.argv;
if (!dir || !out) { console.error("Uso: npx tsx scripts/ai5b-sonda-tm.mts <dir> <out.json>"); process.exit(1); }
const t0 = performance.now();
const a = await analyzeRepo({ dir, repoName: "ai5b", limits: { maxFindings: "unlimited" } } as any);
const wallMs = Math.round(performance.now() - t0);
const G = (globalThis as any).__AI5B;
const findings = (a as any).findings.map((f: any) => ({
  id: f.id ?? stableFindingId(f), kind: f.kind,
  loc: f.locations[0] ? `${f.locations[0].file}:${f.locations[0].startLine}-${f.locations[0].endLine}` : null,
  sym: f.locations[0]?.symbol ?? null,
  hyp: (f.hypotheses ?? []).map((h: any) => `${h.pattern}:${h.state}`),
}));
writeFileSync(out, JSON.stringify({ dir, wallMs, rows: G.rows, errors: G.errors.slice(0, 20), findings }, null, 0));
console.log(`${out}: ${G.rows.length} filas, ${G.errors.length} errores, ${findings.length} hallazgos, ${wallMs}ms`);
