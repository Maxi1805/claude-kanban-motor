/**
 * Medición ad-hoc (Ola 10, agente Facade) — corre `analyzeRepo` real sobre un
 * directorio y reporta, para cada `Finding` de `fanout-without-cohesion` (el
 * ancla de esta hipótesis), qué `PatternHypothesis` de "Facade" (si alguna)
 * quedó colgada — `state`/`confidence`/primeros checks. Uso:
 *
 *   npx tsx scripts/measure-facade.mts <dir> <slug>
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeFinding } from "../src/shared/types.js";

async function main(): Promise<void> {
  const [, , dir, slug] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/measure-facade.mts <dir> <slug>");
    process.exit(1);
  }
  const collected: CodeFinding[] = [];
  await analyzeRepo({
    dir: path.resolve(dir),
    repoName: slug,
    limits: { maxFindings: "unlimited" },
    onPreCapFindings: (findings: readonly CodeFinding[]) => {
      collected.push(...findings);
    },
  });

  const findings = collected;
  const anchor = findings.filter((f) => f.kind === "fanout-without-cohesion");
  console.log(`[${slug}] fanout-without-cohesion findings: ${anchor.length}`);
  let withHypothesis = 0;
  const byState = new Map<string, number>();
  for (const f of anchor) {
    const fh = (f.hypotheses ?? []).find((h) => h.pattern === "Facade");
    if (!fh) {
      console.log(`  [SIN HIPOTESIS] ${f.locations.map((l) => `${l.file}#${l.symbol ?? ""}`).join(" | ")}`);
      continue;
    }
    withHypothesis++;
    byState.set(fh.state, (byState.get(fh.state) ?? 0) + 1);
    console.log(
      `  [${fh.state}] conf=${fh.confidence ?? "null"} ceiling=${fh.ceiling} ${f.locations.map((l) => `${l.file}#${l.symbol ?? ""}`).join(" | ")}`,
    );
  }
  console.log(`[${slug}] con hipótesis Facade: ${withHypothesis}/${anchor.length}`, Object.fromEntries(byState));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
