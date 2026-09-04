/**
 * Ola 10 (F10, agente Chain of Responsibility) — estados por repo, vía el
 * pipeline REAL (`analyzeRepo`, mismo camino que ve producción hoy: anclas
 * `many-returns`/`complexity`/`boolean-complexity`, todas intra-*, así que
 * `graph` es `null` en `build()` — ver el docstring de
 * `hypotheses/chain-of-responsibility.ts` para el límite de cableado
 * declarado). Cuenta ausente/parcial/ya-aplicado/aplicado-eludido sobre
 * `finding.hypotheses` con `pattern === "Chain of Responsibility"`.
 *
 * UN repo por proceso, guava sola — regla de memoria de la ola.
 *
 * Uso:
 *   npx tsx scripts/measure-cor-states.mts <dir> <slug>
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";

async function main(): Promise<void> {
  const [, , dir, slug] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/measure-cor-states.mts <dir> <slug>");
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
  const examples: string[] = [];
  let anchored = 0;

  for (const f of analysis.findings) {
    const h = f.hypotheses?.find((x) => x.pattern === "Chain of Responsibility");
    if (!h) continue;
    anchored++;
    states[h.state] = (states[h.state] ?? 0) + 1;
    if (h.state === "ya-aplicado" && examples.length < 5) {
      examples.push(`${f.locations[0]?.file}:${f.locations[0]?.startLine} (${f.kind})`);
    }
  }

  console.log(JSON.stringify({ slug, wallMs, anchored, states, ejemplosYaAplicado: examples }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
