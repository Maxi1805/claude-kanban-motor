/** AN5 — volcado desde una copia congelada (auditoria; MISMO formato que dump-hallazgos.mts).
 *  Uso: npx tsx scripts/an5-dumpC.mts <srcDir> <repo> <out.json> */
import { writeFileSync } from "node:fs";
const [, , srcDir, dir, out] = process.argv;
if (!srcDir || !dir || !out) { console.error("Uso: npx tsx scripts/an5-dumpC.mts <srcDir> <dir> <out.json>"); process.exit(1); }
const { analyzeRepo } = await import(`../${srcDir}/server/services/code-analyzer.js`);
const { stableFindingId } = await import(`../${srcDir}/server/services/code-finding-ids.js`);
const { direccionesDeFila } = await import(`../${srcDir}/server/services/detect/precision/direccion-hipotesis.js`);
const t0 = performance.now();
const a: any = await analyzeRepo({ dir, repoName: "dump", limits: { maxFindings: "unlimited" } } as any);
const wallMs = Math.round(performance.now() - t0);
const findings = a.findings.map((f: any) => {
  const hs = f.hypotheses ?? [];
  const at = direccionesDeFila(hs, f.locations[0]);
  return {
    id: f.id ?? stableFindingId(f), kind: f.kind, title: f.title,
    where: f.locations.map((l: any) => `${l.file}:${l.startLine}`),
    symbols: f.locations.map((l: any) => l.symbol ?? ""),
    hypotheses: hs.map((h: any, i: number) => ({ pattern: h.pattern, state: h.state, at: at[i] ?? "" })),
  };
});
writeFileSync(out, JSON.stringify({ dir, wallMs, total: findings.length, findings }, null, 1));
console.log(`${out}: ${findings.length} hallazgos, ${wallMs}ms`);
