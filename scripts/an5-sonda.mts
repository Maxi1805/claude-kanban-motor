/**
 * AN5 — SONDA del canal de nivel 2 hacia Template Method (auditoría, no producción).
 * Corre el analizador REAL desde la copia congelada `scratchpad-an5/srcP`,
 * instrumentada en UN solo punto (`build()` de template-method.ts).
 * Uso: npx tsx scripts/an5-sonda.mts <dir-repo> <salida.json>
 */
import { writeFileSync } from "node:fs";
(globalThis as any).__AN5 = { rows: [] };
(globalThis as any).__AN5B = { rows: [] };
const { analyzeRepo } = await import("../scratchpad-an5/srcP/server/services/code-analyzer.js");
const { stableFindingId } = await import("../scratchpad-an5/srcP/server/services/code-finding-ids.js");
const [, , dir, out] = process.argv;
if (!dir || !out) { console.error("Uso: npx tsx scripts/an5-sonda.mts <dir> <out.json>"); process.exit(1); }
const t0 = performance.now();
const a = await analyzeRepo({ dir, repoName: "an5", limits: { maxFindings: "unlimited" } } as any);
const wallMs = Math.round(performance.now() - t0);
const G = (globalThis as any).__AN5;
const findings = (a as any).findings.map((f: any) => ({
  id: f.id ?? stableFindingId(f), kind: f.kind,
  file: f.locations[0]?.file ?? null,
  line: f.locations[0]?.startLine ?? null,
  sym: f.locations[0]?.symbol ?? null,
  hyp: (f.hypotheses ?? []).map((h: any) => `${h.pattern}:${h.state}`),
}));
writeFileSync(out, JSON.stringify({ dir, wallMs, rows: G.rows, l2: (globalThis as any).__AN5B.rows, findings }, null, 0));
console.log(`${out}: ${G.rows.length} filas, ${findings.length} hallazgos, ${wallMs}ms`);
