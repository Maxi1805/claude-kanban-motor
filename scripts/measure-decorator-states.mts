/**
 * P2 (esta tarea) — estados de Decorator vía el pipeline REAL (`analyzeRepo`).
 * Cuenta ausente/parcial/ya-aplicado sobre `finding.hypotheses` con
 * `pattern === "Decorator"`, separando por qué ancla disparó cada uno
 * (olor: flag-accumulator/boolean-flag-param/boolean-complexity/
 * long-parameter-list, vs. estructural: large-class/refused-bequest).
 *
 * UN repo por proceso — regla de memoria de la ola.
 * Uso: npx tsx scripts/measure-decorator-states.mts <dir> <slug>
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";

const STRUCTURAL_KINDS = new Set(["large-class", "refused-bequest"]);

async function main(): Promise<void> {
  const [, , dir, slug] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/measure-decorator-states.mts <dir> <slug>");
    process.exit(1);
  }
  const t0 = performance.now();
  const analysis = await analyzeRepo({
    dir: path.resolve(dir),
    repoName: slug,
    limits: { maxFindings: "unlimited" },
  });
  const wallMs = Math.round(performance.now() - t0);

  const states: Record<string, number> = { ausente: 0, parcial: 0, "ya-aplicado": 0, "aplicado-eludido": 0 };
  const byAnchorKind: Record<string, Record<string, number>> = {};
  const examples: Record<string, string[]> = { ausente: [], parcial: [], "ya-aplicado": [], "aplicado-eludido": [] };
  let anchored = 0;
  let structuralAnchored = 0;

  for (const f of analysis.findings) {
    const h = f.hypotheses?.find((x) => x.pattern === "Decorator");
    if (!h) continue;
    anchored++;
    if (STRUCTURAL_KINDS.has(f.kind)) structuralAnchored++;
    states[h.state] = (states[h.state] ?? 0) + 1;
    const bucket = byAnchorKind[f.kind] ?? {};
    bucket[h.state] = (bucket[h.state] ?? 0) + 1;
    byAnchorKind[f.kind] = bucket;
    if (examples[h.state]!.length < 6) {
      examples[h.state]!.push(`[${f.kind}] ${f.locations[0]?.file}:${f.locations[0]?.startLine} (${f.locations[0]?.symbol ?? "?"})`);
    }
  }

  console.log(JSON.stringify({ slug, wallMs, totalFindings: analysis.findings.length, anchored, structuralAnchored, states, byAnchorKind, examples }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
