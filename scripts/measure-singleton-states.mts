/**
 * Ola 10 (F10, agente Singleton) — estados por repo, vía el pipeline REAL
 * (`analyzeRepo`, mismo camino que produción). Ancla `scattered-instantiation`
 * (inter-file, `Finding.language === null`, `graph` real disponible en
 * `build()`). Cuenta ausente/parcial/ya-aplicado/aplicado-eludido sobre
 * `finding.hypotheses` con `pattern === "Singleton"`.
 *
 * UN repo por proceso, guava sola — regla de memoria de la ola.
 *
 * Uso:
 *   npx tsx scripts/measure-singleton-states.mts <dir> <slug>
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";

async function main(): Promise<void> {
  const [, , dir, slug] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/measure-singleton-states.mts <dir> <slug>");
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
  let scatteredFindings = 0;

  for (const f of analysis.findings) {
    if (f.kind === "scattered-instantiation") scatteredFindings++;
    const h = f.hypotheses?.find((x) => x.pattern === "Singleton");
    if (!h) continue;
    anchored++;
    states[h.state] = (states[h.state] ?? 0) + 1;
    if (examples.length < 8) {
      examples.push(`${h.state} — ${f.locations[0]?.file}:${f.locations[0]?.startLine} (dispersión=${f.metric?.value})`);
    }
  }

  console.log(JSON.stringify({ slug, wallMs, scatteredFindings, anchored, states, ejemplos: examples }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
