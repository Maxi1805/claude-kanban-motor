/**
 * Ola U, frente N2 (Template Method) — medición por repo, vía el pipeline
 * REAL (`analyzeRepo`). Cuenta estados (ausente/parcial/ya-aplicado/
 * aplicado-eludido) y, sobre todo, RECOMENDACIONES REALES (ausente+parcial),
 * desagregado por ancla. Vuelca a JSON para poder comparar antes/después.
 *
 * UN repo por proceso (regla de memoria de la ola).
 *
 * Uso:
 *   npx tsx scripts/u-n2-template-method.mts <dir> <slug> [salida.json]
 */
import fs from "node:fs";
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";

interface Row {
  file: string;
  startLine: number;
  symbol: string;
  anchor: string;
  state: string;
  confidence: string | null;
  checks: { label: string; passed: boolean }[];
  why: string[];
}

async function main(): Promise<void> {
  const [, , dir, slug, out] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/u-n2-template-method.mts <dir> <slug> [salida.json]");
    process.exit(1);
  }
  const rootDir = path.resolve(dir);
  const analysis = await analyzeRepo({ dir: rootDir, repoName: slug, limits: { maxFindings: "unlimited" } });

  const rows: Row[] = [];
  for (const f of analysis.findings) {
    const h = f.hypotheses?.find((x) => x.pattern === "Template Method");
    if (!h) continue;
    rows.push({
      file: f.locations[0]?.file ?? "?",
      startLine: f.locations[0]?.startLine ?? 0,
      symbol: f.locations[0]?.symbol ?? "?",
      anchor: f.kind,
      state: h.state,
      confidence: (h.confidence as string | null) ?? null,
      checks: (h.checks ?? []).map((c) => ({ label: String(c.label), passed: Boolean(c.passed) })),
      why: (h.checks ?? []).map((c) => String(c.why ?? "")),
    });
  }

  const byState: Record<string, number> = {};
  const byAnchorState: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    byState[r.state] = (byState[r.state] ?? 0) + 1;
    (byAnchorState[r.anchor] ??= {})[r.state] = ((byAnchorState[r.anchor] ??= {})[r.state] ?? 0) + 1;
  }
  const recomendaciones = (byState["ausente"] ?? 0) + (byState["parcial"] ?? 0);

  const summary = { slug, total: rows.length, byState, recomendaciones, byAnchorState };
  console.log(JSON.stringify(summary, null, 2));
  if (out) fs.writeFileSync(out, JSON.stringify({ summary, rows }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
