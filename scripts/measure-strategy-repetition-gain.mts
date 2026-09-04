/**
 * Ola 10 — P2/P3, "cableado del vecindario". Cuánto gana el discriminador
 * `repeticion-cruzada` de Strategy (hoy SIEMPRE `false` para el ancla
 * `conditional-chain` antes de esta ola — ver `hypotheses/strategy.ts`,
 * sección "discriminators" de su docstring) ahora que `refreshHypotheses`
 * (`hypotheses/run.ts`) corre con un `NeighborhoodIndex` real, vía el
 * pipeline REAL (`analyzeRepo`, no un `ctx` armado a mano).
 *
 * Antes de esta ola, para el ancla `conditional-chain` el discriminador era
 * MECÁNICAMENTE `false` siempre (`ctx.neighborhood` era SIEMPRE
 * `EMPTY_NEIGHBORHOOD` en la única llamada que procesaba ese `Finding`) —
 * así que "cuántos casos gana" es exactamente "cuántos hay CONFIRMADOS hoy".
 *
 * UN repo por proceso, guava sola — regla de memoria de la ola.
 *
 * Uso:
 *   npx tsx scripts/measure-strategy-repetition-gain.mts <dir> <slug>
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";

async function main(): Promise<void> {
  const [, , dir, slug] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/measure-strategy-repetition-gain.mts <dir> <slug>");
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

  const chainFindings = analysis.findings.filter((f) => f.kind === "conditional-chain");
  let strategyHypotheses = 0;
  let confirmed = 0;
  const examples: string[] = [];

  for (const f of chainFindings) {
    const strategy = f.hypotheses?.find((h) => h.pattern === "Strategy");
    if (!strategy) continue;
    strategyHypotheses++;
    const disc = strategy.discriminators.find((d) => d.why.toLowerCase().includes("discriminante"));
    if (disc?.passed) {
      confirmed++;
      if (examples.length < 5) examples.push(`${f.locations[0]?.file}:${f.locations[0]?.startLine} — ${disc.why}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        slug,
        wallMs,
        conditionalChainFindings: chainFindings.length,
        strategyHypotheses,
        repeticionCruzadaConfirmada: confirmed,
        ejemplos: examples,
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
