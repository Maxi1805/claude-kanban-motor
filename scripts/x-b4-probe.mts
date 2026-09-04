/**
 * OLA X — frente B4. Volcado de TODAS las hipótesis de Facade y Decorator con
 * su estado, sus checks (label/passed/why) y sus `places`, para poder juzgar a
 * mano abriendo el archivo real.
 *
 * `dump-hallazgos.mts` sólo trae `{pattern, state}` — sin el `why` no se puede
 * decidir si un `ya-aplicado`/`aplicado-eludido` está bien clasificado.
 *
 * Uso: npx tsx scripts/x-b4-probe.mts <dir-del-repo> <slug> <salida.json>
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";

const [, , dir, slug, out] = process.argv;
if (!dir || !slug || !out) {
  console.error("Uso: npx tsx scripts/x-b4-probe.mts <dir> <slug> <salida.json>");
  process.exit(1);
}

const MINE = new Set(["Facade", "Decorator"]);

const t0 = performance.now();
const { analysis, cache } = await analyzeRepoCached({
  dir: path.resolve(dir),
  repoName: slug,
  limits: { maxFindings: "unlimited" },
});
console.error(`[cache] ${slug}: ${cache.hit ? "HIT" : "MISS"} (${cache.reason}) analyzeMs=${cache.analyzeMs.toFixed(0)}`);

interface Row {
  repo: string;
  id: string;
  anchorKind: string;
  file: string;
  startLine: number;
  endLine: number;
  pattern: string;
  state: string;
  confidence: unknown;
  checks: { label: string; passed: boolean; why: string; role?: string }[];
  places: { file: string; startLine: number; role: string }[];
}

const rows: Row[] = [];
for (const f of analysis.findings) {
  for (const h of f.hypotheses ?? []) {
    if (!MINE.has(h.pattern)) continue;
    rows.push({
      repo: slug,
      id: f.id ?? stableFindingId(f),
      anchorKind: f.kind,
      file: f.locations[0]?.file ?? "",
      startLine: f.locations[0]?.startLine ?? 0,
      endLine: f.locations[0]?.endLine ?? 0,
      pattern: h.pattern,
      state: h.state,
      confidence: h.confidence ?? null,
      checks: (h.checks ?? []).map((c) => ({ label: c.label, passed: c.passed, why: c.why, role: c.role })),
      places: (h.places ?? []).map((p) => ({ file: p.file, startLine: p.startLine, role: p.role })),
    });
  }
}

// Denominador de la selectividad: cuántos hallazgos hay de cada ancla en este repo.
const anchorTotals: Record<string, number> = {};
for (const f of analysis.findings) anchorTotals[f.kind] = (anchorTotals[f.kind] ?? 0) + 1;

writeFileSync(out, JSON.stringify({ repo: slug, wallMs: Math.round(performance.now() - t0), anchorTotals, rows }, null, 1));

const byPatternState: Record<string, number> = {};
for (const r of rows) {
  const k = `${r.pattern}/${r.state}`;
  byPatternState[k] = (byPatternState[k] ?? 0) + 1;
}
console.error(slug, JSON.stringify(byPatternState));
