/**
 * Ola 10 — encargo "Prototype, las tres formas". Cuenta los estados
 * (`ausente`/`parcial`/`ya-aplicado`/`aplicado-eludido`) que produce
 * `hypotheses/prototype.ts` sobre un repo real, vía el pipeline REAL
 * (`analyzeRepo`) — el ancla es `speculative-abstraction`, así que se
 * cuenta sobre TODOS los findings de ese kind (no sólo los que terminan con
 * hipótesis Prototype colgada) para reportar también cuántos quedan sin
 * hipótesis en absoluto.
 *
 * UN repo por proceso, guava sola — regla de memoria de la ola.
 *
 * Uso:
 *   npx tsx scripts/measure-prototype-states.mts <dir> <slug>
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";

async function main(): Promise<void> {
  const [, , dir, slug] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/measure-prototype-states.mts <dir> <slug>");
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

  const anchored = analysis.findings.filter((f) => f.kind === "speculative-abstraction");
  const counts: Record<string, number> = { ausente: 0, parcial: 0, "ya-aplicado": 0, "aplicado-eludido": 0 };
  const examples: { state: string; file: string; line: number; why: string }[] = [];
  let withHypothesis = 0;

  for (const f of anchored) {
    const proto = f.hypotheses?.find((h) => h.pattern === "Prototype");
    if (!proto) continue;
    withHypothesis++;
    counts[proto.state] = (counts[proto.state] ?? 0) + 1;
    if (examples.filter((e) => e.state === proto.state).length < 3) {
      const applied = proto.checks.find((c) => c.role === "applied" && c.label.startsWith("self-constructing-member"));
      examples.push({ state: proto.state, file: f.locations[0]?.file ?? "?", line: f.locations[0]?.startLine ?? 0, why: applied?.why ?? "" });
    }
  }

  console.log(
    JSON.stringify(
      {
        slug,
        wallMs,
        speculativeAbstractionFindings: anchored.length,
        conHipotesisPrototype: withHypothesis,
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
