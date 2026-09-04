/**
 * Sonda de juicio — confirma DIRECTAMENTE (no por inferencia de ausencia de
 * hipótesis) el `variant` real de cada Finding `conditional-chain` sobre una
 * población, y si tiene o no una hipótesis "Factory Method" colgada.
 *
 * Uso: npx tsx scripts/probe-factory-method-variant.mts <dir> <slug>
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeFinding } from "../src/shared/types.js";

async function main(): Promise<void> {
  const [, , dir, slug] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/probe-factory-method-variant.mts <dir> <slug>");
    process.exit(1);
  }
  const collected: CodeFinding[] = [];
  await analyzeRepo({
    dir: path.resolve(dir),
    repoName: slug,
    limits: { maxFindings: "unlimited" },
    onPreCapFindings: (findings) => collected.push(...findings),
  });
  const chain = collected.filter((f) => f.kind === "conditional-chain");
  console.log(`[${slug}] conditional-chain findings: ${chain.length}`);
  for (const f of chain) {
    const fm = (f.hypotheses ?? []).find((h) => h.pattern === "Factory Method");
    // `variant` (RawFinding) no sobrevive a `Finding`/`CodeFinding` — re-derivado
    // acá por el título literal que arma `conditional-chain.ts#buildConditionalChainFinding`
    // ("elige qué clase instanciar" ⇒ variant `instantiates`, cualquier otro
    // título ⇒ `ladder`), única forma de distinguirlos desde afuera sin tocar el tipo.
    const variant = /elige qué clase instanciar/.test(f.title) ? "instantiates" : "ladder";
    console.log(`  variant=${variant} @ ${f.locations[0]!.file}:${f.locations[0]!.startLine} factoryMethodHyp=${fm ? `${fm.state}` : "NINGUNA"}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
