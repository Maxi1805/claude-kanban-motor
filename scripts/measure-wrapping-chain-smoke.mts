/**
 * Ola 10 — verificación barata de `findWrappingChains` (CONTRATO-F10.md
 * §0.4/§1) contra un repo real, vía el pipeline REAL (`analyzeRepo#onGraph`,
 * el mismo grafo que vería una hipótesis en producción). Sólo humo: cuenta
 * matches y muestra un puñado, no valida que sean "Decorator" ni ningún otro
 * patrón en particular — eso es trabajo de cada `<patron>.ts`.
 *
 * UN repo por proceso, guava sola — regla de memoria de la ola.
 *
 * Uso:
 *   npx tsx scripts/measure-wrapping-chain-smoke.mts <dir> <slug>
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { findWrappingChains } from "../src/server/services/hypotheses/wrapping-chain.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";

async function main(): Promise<void> {
  const [, , dir, slug] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/measure-wrapping-chain-smoke.mts <dir> <slug>");
    process.exit(1);
  }
  let graph: CodeGraph | null = null;
  await analyzeRepo({
    dir: path.resolve(dir),
    repoName: slug,
    limits: { maxFindings: "unlimited" },
    onGraph: (r) => {
      graph = r.graph;
    },
  });

  const matches = findWrappingChains(graph);
  const viaSatisfies = matches.filter((m) => m.viaSatisfies).length;
  console.log(
    JSON.stringify(
      {
        slug,
        matches: matches.length,
        viaSatisfies,
        ejemplos: matches.slice(0, 5).map((m) => `${m.wrapperId} --calls(${m.memberName}/${m.memberArity})--> ${m.wrappedId} (interfaz: ${m.interfaceId}, satisfies: ${m.viaSatisfies})`),
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
