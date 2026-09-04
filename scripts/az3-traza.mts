/**
 * OLA AZ, FRENTE AZ3 — traza de `state.ts` sobre la copia CONGELADA `scratchpad-az3/src0`.
 *
 * POR QUE: los cortes candidatos de esta ola (retiro de ancla, `branchesCheck`/`transitionCheck`
 * promovidos a `required`) son MECANISMOS que el detector YA computa. La traza los expone por
 * hallazgo (`distinctMethods`, `branchesConfirmed`, `transitionConfirmed`, `diesAt`,
 * `appliedState`, `emitted`) sin re-derivar nada desde los volcados. Auditoria, no produccion.
 *
 * Uso: npx tsx scripts/az3-traza.mts <dir-repo> <salida.json>
 */
import { writeFileSync } from "node:fs";

const { analyzeRepo } = await import("../scratchpad-az3/src0/server/services/code-analyzer.js");
const { stableFindingId } = await import("../scratchpad-az3/src0/server/services/code-finding-ids.js");
const { startStateTrace, takeStateTrace } = await import("../scratchpad-az3/src0/server/services/hypotheses/state.js");

const [, , dir, out] = process.argv;
if (!dir || !out) { console.error("Uso: npx tsx scripts/az3-traza.mts <dir-repo> <salida.json>"); process.exit(1); }

const t0 = performance.now();
startStateTrace();
const a: any = await analyzeRepo({ dir, repoName: "az3", limits: { maxFindings: "unlimited" } } as any);
const traza = takeStateTrace();
const wallMs = Math.round(performance.now() - t0);

const ANCLAS = new Set(["repeated-switch", "conditional-chain", "temporary-field", "type-switch"]);
const findings = a.findings.filter((f: any) => ANCLAS.has(f.kind)).map((f: any) => ({
  id: f.id ?? stableFindingId(f),
  kind: f.kind,
  title: f.title,
  lang: f.language ?? null,
  where: f.locations.map((l: any) => `${l.file}:${l.startLine}`),
  symbols: f.locations.map((l: any) => l.symbol ?? ""),
  hyp: (f.hypotheses ?? []).map((h: any) => ({ pattern: h.pattern, state: h.state, at: h.at ?? null })),
}));

writeFileSync(out, JSON.stringify({ dir, wallMs, total: a.findings.length, findings, traza }, null, 0));
console.log(`${out}: ${a.findings.length} hallazgos · ${findings.length} de las 4 anclas · traza ${traza.length} · ${wallMs}ms`);
