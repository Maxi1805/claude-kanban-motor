/**
 * Medición ad-hoc (Ola 10, agente Abstract Factory) — corre `analyzeRepo`
 * real sobre un directorio y reporta, para cada `Finding` de
 * `parallel-hierarchies` (el ancla de esta hipótesis), qué `PatternHypothesis`
 * de "Abstract Factory" (si alguna) quedó colgada — `state`/`confidence`/
 * primeros checks. Uso:
 *
 *   npx tsx scripts/measure-abstract-factory.mts <dir> <slug>
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeFinding } from "../src/shared/types.js";

async function main(): Promise<void> {
  const [, , dir, slug] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/measure-abstract-factory.mts <dir> <slug>");
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
  const parallel = findings.filter((f) => f.kind === "parallel-hierarchies");
  console.log(`[${slug}] parallel-hierarchies findings: ${parallel.length}`);
  let withHypothesis = 0;
  const byState = new Map<string, number>();
  for (const f of parallel) {
    const af = (f.hypotheses ?? []).find((h) => h.pattern === "Abstract Factory");
    if (!af) {
      console.log(`  [SIN HIPOTESIS] ${f.locations.map((l) => `${l.file}#${l.symbol ?? ""}`).join(" | ")}`);
      continue;
    }
    withHypothesis++;
    byState.set(af.state, (byState.get(af.state) ?? 0) + 1);
    console.log(
      `  [${af.state}] conf=${af.confidence ?? "null"} ceiling=${af.ceiling} ${f.locations.map((l) => `${l.file}#${l.symbol ?? ""}`).join(" | ")}`,
    );
  }
  console.log(`[${slug}] con hipótesis Abstract Factory: ${withHypothesis}/${parallel.length}`, Object.fromEntries(byState));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
