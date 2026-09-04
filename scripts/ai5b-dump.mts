/**
 * AI5b — volcado contrafáctico de UNA sola variable. Corre `analyzeRepo` REAL
 * desde un árbol congelado que se pasa por env (`AI5B_SRC`), para poder medir
 * el MISMO día el árbol de apertura (`src0`) y el árbol con mi único cambio
 * (`srcM`) sin que los otros frentes de la ola muevan el suelo.
 * Uso: AI5B_SRC=scratchpad-ai5b/srcM npx tsx scripts/ai5b-dump.mts <dir> <out.json>
 */
import { writeFileSync } from "node:fs";
const SRC = process.env.AI5B_SRC ?? "src";
const { analyzeRepo } = await import(`../${SRC}/server/services/code-analyzer.js`);
const { stableFindingId } = await import(`../${SRC}/server/services/code-finding-ids.js`);
const [, , dir, out] = process.argv;
if (!dir || !out) { console.error("Uso: AI5B_SRC=... npx tsx scripts/ai5b-dump.mts <dir> <out.json>"); process.exit(1); }
const t0 = performance.now();
const a = await analyzeRepo({ dir, repoName: "ai5b", limits: { maxFindings: "unlimited" } } as any);
const wallMs = Math.round(performance.now() - t0);
const findings = (a as any).findings.map((f: any) => ({
  id: f.id ?? stableFindingId(f), kind: f.kind,
  where: f.locations.map((l: any) => `${l.file}:${l.startLine}`),
  sym: f.locations[0]?.symbol ?? null,
  hyp: (f.hypotheses ?? []).map((h: any) => ({ p: h.pattern, s: h.state, c: h.confidence ?? null, prov: h.provisional ?? false, places: (h.places ?? []).length })),
}));
writeFileSync(out, JSON.stringify({ src: SRC, dir, wallMs, total: findings.length, findings }, null, 0));
console.log(`${out}: src=${SRC} ${findings.length} hallazgos, ${wallMs}ms`);
