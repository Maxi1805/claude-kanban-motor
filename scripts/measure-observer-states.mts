/**
 * Ola 10 — encargo "Observer, las tres formas". Cuenta los estados
 * (`ausente`/`parcial`/`ya-aplicado`/`aplicado-eludido`) que produce
 * `hypotheses/observer.ts` sobre un repo real, vía el pipeline REAL
 * (`analyzeRepo`, el mismo grafo y los mismos `Finding` que vería la
 * hipótesis en producción). Mismo molde que `measure-command-states.mts`.
 *
 * UN repo por proceso, guava sola — regla de memoria de la ola.
 *
 * Uso:
 *   npx tsx scripts/measure-observer-states.mts <dir> <slug>
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";

async function main(): Promise<void> {
  const [, , dir, slug] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/measure-observer-states.mts <dir> <slug>");
    process.exit(1);
  }
  const rootDir = path.resolve(dir);
  const t0 = performance.now();
  const analysis = await analyzeRepo({
    dir: rootDir,
    repoName: slug,
    limits: { maxFindings: "unlimited" },
  });
  const wallMs = Math.round(performance.now() - t0);

  const anchored = analysis.findings.filter((f) => f.kind === "manual-notification");
  const counts: Record<string, number> = { ausente: 0, parcial: 0, "ya-aplicado": 0, "aplicado-eludido": 0 };
  const examples: { state: string; file: string; line: number; symbol: string | undefined; why: string }[] = [];

  for (const f of anchored) {
    const observer = f.hypotheses?.find((h) => h.pattern === "Observer");
    if (!observer) continue;
    counts[observer.state] = (counts[observer.state] ?? 0) + 1;
    if (examples.filter((e) => e.state === observer.state).length < 5) {
      const appliedCheck = observer.checks.find((c) => c.role === "applied") ?? observer.checks[0];
      examples.push({
        state: observer.state,
        file: f.locations[0]?.file ?? "?",
        line: f.locations[0]?.startLine ?? 0,
        symbol: f.locations[0]?.symbol,
        why: appliedCheck?.why ?? "",
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        slug,
        wallMs,
        totalFindings: analysis.findings.length,
        anchoredFindings: anchored.length,
        observerHypotheses: anchored.filter((f) => f.hypotheses?.some((h) => h.pattern === "Observer")).length,
        counts,
        examples,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
