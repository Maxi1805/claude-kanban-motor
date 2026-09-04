/**
 * OLA AW - FRENTE AW4 - VOLCADO INSTRUMENTADO (src1).
 * Corre sobre la copia CON `modulo-envy` registrado y con el arreglo de
 * `middle-man` (aristas `calls`). Emite censo por kind, los registros de
 * `modulo-envy` y `middle-man`, y toda hipotesis colgada (linea base de los
 * 19 patrones).
 * Uso: npx tsx scripts/aw4-dump2.mts <dir-repo> <nombre> <salida.json>
 */
import { writeFileSync } from "node:fs";
const S1 = "../scratchpad-aw4/src1";
const { analyzeRepo } = await import(`${S1}/server/services/code-analyzer.js`);
const { stableFindingId } = await import(`${S1}/server/services/code-finding-ids.js`);
const MIOS = new Set(["modulo-envy", "middle-man"]);
const [, , dir, nombre, out] = process.argv;
if (!dir || !nombre || !out) { console.error("uso: <dir> <nombre> <salida>"); process.exit(1); }
const t0 = performance.now();
const a: any = await analyzeRepo({ dir, repoName: nombre, limits: { maxFindings: "unlimited" } } as any);
const censo: Record<string, number> = {}; const hipotesis: any[] = []; const registros: any[] = [];
for (const f of a.findings) {
  censo[f.kind] = (censo[f.kind] ?? 0) + 1;
  const id = f.id ?? stableFindingId(f);
  for (const h of f.hypotheses ?? []) hipotesis.push({ id, kind: f.kind, pattern: h.pattern, state: h.state });
  if (!MIOS.has(f.kind)) continue;
  registros.push({
    id, kind: f.kind, scope: f.scope, language: f.language, severity: f.severity, title: f.title,
    detail: (f.detail ?? "").slice(0, 1800),
    trigger: (f.trigger ?? []).map((m: any) => ({ label: m.label, value: m.value, umbral: m.threshold?.value ?? null })),
    evidence: (f.evidence ?? []).map((e: any) => ({ label: e.label, value: e.value })),
    locations: (f.locations ?? []).map((l: any) => ({ file: l.file, startLine: l.startLine, endLine: l.endLine, symbol: l.symbol ?? "", role: l.role })),
    hypotheses: (f.hypotheses ?? []).map((h: any) => ({ pattern: h.pattern, state: h.state })),
  });
}
writeFileSync(out, JSON.stringify({ repo: nombre, dir, wallMs: Math.round(performance.now() - t0), totalHallazgos: a.findings.length, censo, registros, hipotesis }, null, 1));
console.error(`${nombre}: ${a.findings.length} hallazgos - modulo-envy ${censo["modulo-envy"] ?? 0} - middle-man ${censo["middle-man"] ?? 0} - ${hipotesis.length} hipotesis`);
