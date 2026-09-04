/**
 * OLA AX - FRENTE AX8 - volcado de `feature-envy-intra` y `parallel-hierarchies`
 * contra la copia congelada `scratchpad-ax8/src0`.
 *
 * Uso: npx tsx scripts/ax8-dump.mts <dir-repo> <nombre> <salida.json>
 */
import { writeFileSync } from "node:fs";

const S0 = "../scratchpad-ax8/src0";
const { analyzeRepo } = await import(`${S0}/server/services/code-analyzer.js`);
const { stableFindingId } = await import(`${S0}/server/services/code-finding-ids.js`);

const MIOS = new Set(["feature-envy-intra", "parallel-hierarchies"]);

const [, , dir, nombre, out] = process.argv;
if (!dir || !nombre || !out) { console.error("Uso: <dir> <nombre> <salida.json>"); process.exit(1); }

const t0 = performance.now();
const a: any = await analyzeRepo({ dir, repoName: nombre, limits: { maxFindings: "unlimited" } } as any);
const wallMs = Math.round(performance.now() - t0);

const censo: Record<string, number> = {};
const propuestasPorPatron: Record<string, Record<string, number>> = {};
const mios: any[] = [];
for (const f of a.findings) {
  censo[f.kind] = (censo[f.kind] ?? 0) + 1;
  const id = f.id ?? stableFindingId(f);
  for (const h of f.hypotheses ?? []) {
    const p = String(h.pattern);
    (propuestasPorPatron[p] ??= {});
    propuestasPorPatron[p][String(h.state)] = (propuestasPorPatron[p][String(h.state)] ?? 0) + 1;
  }
  if (!MIOS.has(f.kind)) continue;
  mios.push({
    id, kind: f.kind, scope: f.scope, language: f.language, severity: f.severity,
    title: f.title,
    detail: (f.detail ?? "").length > 3000 ? f.detail.slice(0, 3000) : f.detail,
    locations: (f.locations ?? []).map((l: any) => ({ file: l.file, startLine: l.startLine, endLine: l.endLine, symbol: l.symbol ?? "", role: l.role })),
    hypotheses: (f.hypotheses ?? []).map((h: any) => ({ pattern: h.pattern, state: h.state })),
  });
}

const cobertura = (a.detectorCoverage ?? a.coverage ?? []).map((r: any) => ({ detectorId: r.detectorId, kind: r.kind, status: r.status, language: r.language ?? null }));
writeFileSync(out, JSON.stringify({ repo: nombre, dir, wallMs, total: a.findings.length, censo, propuestasPorPatron, cobertura, mios }, null, 1));
console.error(`${nombre}: ${a.findings.length} hallazgos, ${mios.length} mios, ${wallMs}ms`);
