/** OLA AO / AO2 — volcado con UBICACIONES COMPLETAS (start/end/symbol/role) y `trigger`,
 *  que `dump-hallazgos.mts` no emite. Lee de la caché (`analyzeRepoCached`): no re-analiza. */
import { writeFileSync } from "node:fs";
import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";

const [, , dir, out] = process.argv;
if (!dir || !out) { console.error("Uso: ao2-vol-loc.mts <dir> <out.json>"); process.exit(1); }
const { analysis: a, cache } = await analyzeRepoCached({ dir, repoName: "dump", limits: { maxFindings: "unlimited" } });
const findings = a.findings.map((f) => ({
  id: f.id ?? stableFindingId(f),
  kind: f.kind,
  variant: (f as { variant?: string }).variant ?? null,
  title: f.title,
  locations: f.locations.map((l) => ({ file: l.file, s: l.startLine, e: l.endLine, symbol: l.symbol ?? "", role: (l as { role?: string }).role ?? "" })),
  trigger: ((f as { trigger?: readonly { label: string; value: string }[] }).trigger ?? []).map((t) => ({ label: t.label, value: t.value })),
  hypotheses: (f.hypotheses ?? []).map((h) => ({ pattern: h.pattern, state: h.state })),
}));
writeFileSync(out, JSON.stringify({ dir, cacheHit: cache.hit, total: findings.length, findings }, null, 0));
console.log(`${dir}: ${findings.length} (${cache.hit ? "HIT" : "MISS"})`);
