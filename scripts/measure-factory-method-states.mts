/**
 * Ola 10 (F10, agente Factory Method) — estados por repo, vía el pipeline
 * REAL (`analyzeRepo`). Ancla: `conditional-chain` (`variant: "instantiates"`),
 * intra-function, así que `graph` es `null` en `build()` (ver el docstring de
 * `hypotheses/factory-method.ts` — el camino real de evidencia es el AST del
 * archivo vivo, `ctx.fileAt`, no el grafo). Cuenta ausente/parcial/
 * ya-aplicado/aplicado-eludido sobre `finding.hypotheses` con
 * `pattern === "Factory Method"`.
 *
 * UN repo por proceso, guava sola — regla de memoria de la ola.
 *
 * Uso:
 *   npx tsx scripts/measure-factory-method-states.mts <dir> <slug>
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";

async function main(): Promise<void> {
  const [, , dir, slug] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/measure-factory-method-states.mts <dir> <slug>");
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

  const states: Record<string, number> = { ausente: 0, parcial: 0, "ya-aplicado": 0, "aplicado-eludido": 0 };
  const examples: Record<string, string[]> = { ausente: [], parcial: [], "ya-aplicado": [], "aplicado-eludido": [] };
  let anchored = 0;
  let conditionalChainTotal = 0;
  // `CodeFinding` (shared/types.ts) NO carga `variant` — se pierde en
  // `toCodeFinding()` (code-analyzer.ts). El único rastro público de la
  // sub-forma "instantiates" es su plantilla de título propia
  // ("X elige qué clase instanciar entre N ramas", conditional-chain.ts:52),
  // distinta de la de "ladder" ("Cadena de N condiciones en X").
  let conditionalChainInstantiatesByTitle = 0;

  for (const f of analysis.findings) {
    if (f.kind === "conditional-chain") {
      conditionalChainTotal++;
      if (/elige qué clase instanciar entre/.test(f.title)) conditionalChainInstantiatesByTitle++;
    }
    const h = f.hypotheses?.find((x) => x.pattern === "Factory Method");
    if (!h) continue;
    anchored++;
    states[h.state] = (states[h.state] ?? 0) + 1;
    if (examples[h.state]!.length < 5) {
      examples[h.state]!.push(`${f.locations[0]?.file}:${f.locations[0]?.startLine} (${f.locations[0]?.symbol ?? "?"})`);
    }
  }

  console.log(
    JSON.stringify(
      {
        slug,
        wallMs,
        totalFindings: analysis.findings.length,
        conditionalChainTotal,
        conditionalChainInstantiatesByTitle,
        anchored,
        states,
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
