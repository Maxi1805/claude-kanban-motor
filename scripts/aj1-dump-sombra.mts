/**
 * AJ1 — volcado contrafáctico de UNA sola variable. Corre `analyzeRepo` REAL
 * desde el árbol que se le pase por env (`AJ1_SRC`), sin caché, para poder
 * comparar el árbol VIVO contra el MISMO árbol con mi único cambio revertido
 * (`scratchpad-aj1/src0`, que difiere en DOS líneas y nada más) el mismo día y
 * sin que los otros frentes de la ola muevan el suelo debajo.
 * Uso: AJ1_SRC=scratchpad-aj1/src0 npx tsx scripts/aj1-dump-sombra.mts <dir> <out.json>
 */
import { writeFileSync } from "node:fs";
const SRC = process.env.AJ1_SRC ?? "src";
const { analyzeRepo } = await import(`../${SRC}/server/services/code-analyzer.js`);
const { stableFindingId } = await import(`../${SRC}/server/services/code-finding-ids.js`);
const [, , dir, out] = process.argv;
if (!dir || !out) { console.error("Uso: AJ1_SRC=... npx tsx scripts/aj1-dump-sombra.mts <dir> <out.json>"); process.exit(1); }
const a = await analyzeRepo({ dir, repoName: "aj1", limits: { maxFindings: "unlimited" } } as any);
const findings = (a as any).findings.map((f: any) => ({
  id: f.id ?? stableFindingId(f),
  kind: f.kind,
  title: f.title,
  memberCount: f.memberCount ?? 1,
  locs: f.locations.map((l: any) => ({ f: l.file, s: l.startLine, e: l.endLine, y: l.symbol ?? "" })),
  hypotheses: (f.hypotheses ?? []).map((h: any) => ({ pattern: h.pattern, state: h.state })),
}));
writeFileSync(out, JSON.stringify({ src: SRC, dir, total: findings.length, findings }, null, 0));
console.log(`${out}: src=${SRC} ${findings.length} hallazgos`);
