/**
 * AP5 — volcado del dia, restringido a las anclas de Observer y Singleton.
 * Deja, por hallazgo, la hipotesis ENTERA (state, confidence, required/checks).
 * Uso: npx tsx scripts/ap5-dump.mts <raiz-src> <dir-repo> <salida.json>
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [, , srcRoot, dir, out] = process.argv;
if (!srcRoot || !dir || !out) { console.error("uso: <raiz-src> <dir> <out>"); process.exit(1); }
const base = resolve(process.cwd(), srcRoot);
const { analyzeRepo } = await import(`${base}/server/services/code-analyzer.js`);
const { stableFindingId } = await import(`${base}/server/services/code-finding-ids.js`);

const ANCLAS = new Set(["scattered-instantiation", "hard-wired-notification", "manual-notification"]);
const PATRONES = new Set(["Observer", "Singleton"]);

const t0 = performance.now();
const a: any = await analyzeRepo({ dir, repoName: "ap5", limits: { maxFindings: "unlimited" } } as any);
const wallMs = Math.round(performance.now() - t0);

const porKind: Record<string, number> = {};
for (const f of a.findings) porKind[f.kind] = (porKind[f.kind] ?? 0) + 1;

const filas = a.findings
  .filter((f: any) => ANCLAS.has(f.kind) || (f.hypotheses ?? []).some((h: any) => PATRONES.has(h.pattern)))
  .map((f: any) => ({
    id: f.id ?? stableFindingId(f),
    stableId: stableFindingId(f),
    kind: f.kind,
    title: f.title,
    where: (f.locations ?? []).map((l: any) => `${l.file}:${l.startLine}-${l.endLine}${l.symbol ? "#" + l.symbol : ""}`),
    trigger: f.trigger,
    evidence: f.evidence,
    hypotheses: (f.hypotheses ?? []).map((h: any) => ({
      pattern: h.pattern, state: h.state, confidence: h.confidence, provisional: h.provisional,
      checks: (h.checks ?? []).map((c: any) => ({ label: c.label, passed: c.passed, role: c.role })),
    })),
  }));

writeFileSync(out, JSON.stringify({ dir, wallMs, total: a.findings.length, porKind, filas }, null, 1));
const n2 = filas.flatMap((f: any) => f.hypotheses).filter((h: any) => PATRONES.has(h.pattern));
console.log(`${dir}: total=${a.findings.length} filas=${filas.length} obs/sing-hip=${n2.length} ms=${wallMs}`);
