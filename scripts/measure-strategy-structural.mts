/**
 * Ola 10, agente Strategy — CONTRATO-F10.md. Dos mediciones independientes
 * sobre UN repo real por invocación (regla de memoria: guava sola):
 *
 *   1. ESTADOS DE HOY, pipeline real (`analyzeRepo`, sin tocar nada): para
 *      cada `Finding` `conditional-chain`/`repeated-switch` con hipótesis
 *      "Strategy" ya colgada, cuenta su `state`. Esto es exactamente lo que
 *      la producción de HOY entrega — `build()` para esta hipótesis siempre
 *      recibe `graph: null` (las dos anclas son intra-function/intra-file,
 *      ver el docstring de `hypotheses/strategy.ts`), así que
 *      `structuralStrategyEvidence` nunca corre acá. Sirve para confirmar
 *      que NO hay regresión (mismos números que antes de esta ola).
 *
 *   2. PRECONDICIONES DE LA FORMA NUEVA, sobre el grafo real (capturado con
 *      `onGraph`): para cada archivo del repo, `probeStrategyStructure`
 *      (exportada de `hypotheses/strategy.ts` sólo para esto) cuenta grupos
 *      de interfaz con/sin consumidor confirmado (COMPLETA) y portadores
 *      heterogéneos (PARCIAL) — sin reconstruir un `Finding` (el
 *      `CodeFinding` que expone `analyzeRepo` no lleva `trigger`, formas
 *      distintas). Mide si la FORMA aparece en el grafo real, aunque el
 *      cableado de hoy no pueda mostrarla en producción (bloqueo declarado
 *      en el docstring del módulo — mismo que `decorator.ts#graphOverride`).
 *
 * Uso:
 *   npx tsx scripts/measure-strategy-structural.mts <dir> <slug>
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";
import { probeStrategyStructure } from "../src/server/services/hypotheses/strategy.js";

async function main(): Promise<void> {
  const [, , dir, slug] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/measure-strategy-structural.mts <dir> <slug>");
    process.exit(1);
  }
  const rootDir = path.resolve(dir);
  let graph: CodeGraph | null = null;
  const t0 = performance.now();
  const analysis = await analyzeRepo({
    dir: rootDir,
    repoName: slug,
    limits: { maxFindings: "unlimited" },
    onGraph: (result) => {
      graph = result.graph;
    },
  });
  const wallMs = Math.round(performance.now() - t0);

  // 1) Estados de HOY (pipeline real, sin modificar nada).
  const anchored = analysis.findings.filter((f) => f.kind === "conditional-chain" || f.kind === "repeated-switch");
  const byState = new Map<string, number>();
  let withStrategyHypothesis = 0;
  const examples: string[] = [];
  for (const f of anchored) {
    const strategy = f.hypotheses?.find((h) => h.pattern === "Strategy");
    if (!strategy) continue;
    withStrategyHypothesis++;
    byState.set(strategy.state, (byState.get(strategy.state) ?? 0) + 1);
    if (examples.length < 5) {
      examples.push(`[${strategy.state}] ${f.locations[0]?.file}:${f.locations[0]?.startLine} — ${f.title}`);
    }
  }

  // 2) Precondiciones de la forma nueva, sobre el grafo real.
  let groupsWithConsumer = 0;
  let groupsWithoutConsumer = 0;
  let heterogeneousCarriers = 0;
  if (graph) {
    const files = new Set<string>((graph as CodeGraph).nodes.map((n) => n.file));
    for (const file of files) {
      const probe = probeStrategyStructure(graph, file);
      groupsWithConsumer += probe.groupsWithConsumer;
      groupsWithoutConsumer += probe.groupsWithoutConsumer;
      heterogeneousCarriers += probe.heterogeneousCarriers;
    }
  }

  console.log(
    JSON.stringify(
      {
        slug,
        wallMs,
        conditionalChainOrRepeatedSwitch: anchored.length,
        conStrategyHypothesis: withStrategyHypothesis,
        estadosDeHoy: Object.fromEntries(byState),
        ejemplos: examples,
        precondicionesFormaNueva: {
          gruposInterfazConConsumidor_COMPLETA: groupsWithConsumer,
          gruposInterfazSinConsumidor: groupsWithoutConsumer,
          portadoresHeterogeneos_PARCIAL: heterogeneousCarriers,
        },
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
