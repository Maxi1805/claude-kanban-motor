/**
 * SONDA DEL FRENTE N4 (Ola U) — no es producto, es instrumento de medición.
 *
 * Corre el pipeline REAL (`analyzeRepoCached`) sobre un repo y vuelca, para
 * CADA hipótesis de los dos patrones de este frente (Chain of Responsibility
 * y Decorator), el estado, el ancla, la ubicación y los `checks` con su `why`
 * — que es lo único que explica POR QUÉ cada una salió como salió.
 *
 * Uso: npx tsx scripts/u-n4-probe.mts <dir> <salida.json> [patron]
 */
import { writeFileSync } from "node:fs";

import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";

const [, , dir, out, only] = process.argv;
if (!dir || !out) {
  console.error("Uso: npx tsx scripts/u-n4-probe.mts <dir> <salida.json> [patron]");
  process.exit(1);
}

const PATTERNS = only ? [only] : ["Chain of Responsibility", "Decorator"];

const { analysis, cache } = await analyzeRepoCached({ dir, repoName: "u-n4", limits: { maxFindings: "unlimited" } });
console.error(`[cache] ${dir}: ${cache.hit ? "HIT" : "MISS"} (${cache.reason})`);

interface Row {
  pattern: string;
  state: string;
  anchorKind: string;
  where: string;
  symbol: string;
  checks: { label: string; passed: boolean; why: string }[];
}

const rows: Row[] = [];
for (const f of analysis.findings) {
  for (const h of f.hypotheses ?? []) {
    if (!PATTERNS.includes(h.pattern)) continue;
    const loc = f.locations[0];
    rows.push({
      pattern: h.pattern,
      state: h.state,
      anchorKind: f.kind,
      where: `${loc?.file}:${loc?.startLine}`,
      symbol: loc?.symbol ?? "",
      checks: (h.checks ?? []).map((c) => ({ label: c.label.slice(0, 110), passed: c.passed, why: c.why.slice(0, 300) })),
    });
  }
}

const byPattern: Record<string, Record<string, number>> = {};
for (const r of rows) {
  const b = (byPattern[r.pattern] ??= {});
  b[r.state] = (b[r.state] ?? 0) + 1;
}

writeFileSync(out, JSON.stringify({ dir, total: analysis.findings.length, byPattern, rows }, null, 1));
console.log(`${out}: ${rows.length} hipótesis`, JSON.stringify(byPattern));
