/**
 * Ola 10 — encargo "Command, las tres formas". Cuenta los estados
 * (`ausente`/`parcial`/`ya-aplicado`/`aplicado-eludido`) que produce
 * `hypotheses/command.ts` sobre un repo real, vía el pipeline REAL
 * (`analyzeRepo`, el mismo grafo y los mismos `Finding` que vería la
 * hipótesis en producción — `attachHypotheses` corre dentro de
 * `crossAnalyze`, `repo.graph` YA es el grafo real ahí).
 *
 * UN repo por proceso, guava sola — regla de memoria de la ola.
 *
 * Uso:
 *   npx tsx scripts/measure-command-states.mts <dir> <slug>
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";

async function main(): Promise<void> {
  const [, , dir, slug] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/measure-command-states.mts <dir> <slug>");
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

  const anchored = analysis.findings.filter((f) => f.kind === "duplication" || f.kind === "distributed-duplication");
  const counts: Record<string, number> = { ausente: 0, parcial: 0, "ya-aplicado": 0, "aplicado-eludido": 0 };
  const examples: { state: string; file: string; line: number; why: string }[] = [];

  for (const f of anchored) {
    const command = f.hypotheses?.find((h) => h.pattern === "Command");
    if (!command) continue;
    counts[command.state] = (counts[command.state] ?? 0) + 1;
    if (examples.filter((e) => e.state === command.state).length < 3) {
      const existsCheck = command.checks.find((c) => c.label.startsWith("Existe una interfaz")) ?? command.checks[0];
      examples.push({ state: command.state, file: f.locations[0]?.file ?? "?", line: f.locations[0]?.startLine ?? 0, why: existsCheck?.why ?? "" });
    }
  }

  console.log(
    JSON.stringify(
      {
        slug,
        wallMs,
        anchoredFindings: anchored.length,
        commandHypotheses: anchored.filter((f) => f.hypotheses?.some((h) => h.pattern === "Command")).length,
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
