/**
 * Ola 10 — encargo "Proxy, las tres formas". Cuenta los estados
 * (`ausente`/`parcial`/`ya-aplicado`/`aplicado-eludido`) que produce
 * `hypotheses/proxy.ts` sobre un repo real, vía el pipeline REAL
 * (`analyzeRepo`, el mismo grafo y los mismos `Finding` que vería la
 * hipótesis en producción).
 *
 * UN repo por proceso, guava sola — regla de memoria de la ola.
 *
 * Uso:
 *   npx tsx scripts/measure-proxy-states.mts <dir> <slug>
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";

async function main(): Promise<void> {
  const [, , dir, slug] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/measure-proxy-states.mts <dir> <slug>");
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

  const anchored = analysis.findings.filter((f) => f.kind === "duplication" || f.kind === "scattered-instantiation" || f.kind === "lazy-init-repetida");
  const counts: Record<string, number> = { ausente: 0, parcial: 0, "ya-aplicado": 0, "aplicado-eludido": 0 };
  const examples: { state: string; kind: string; file: string; line: number; why: string }[] = [];

  for (const f of anchored) {
    const proxy = f.hypotheses?.find((h) => h.pattern === "Proxy (inicialización perezosa)");
    if (!proxy) continue;
    counts[proxy.state] = (counts[proxy.state] ?? 0) + 1;
    if (examples.filter((e) => e.state === proxy.state).length < 3) {
      const appliedWhy = proxy.checks.find((c) => c.role === "applied")?.why ?? "";
      examples.push({ state: proxy.state, kind: f.kind, file: f.locations[0]?.file ?? "?", line: f.locations[0]?.startLine ?? 0, why: appliedWhy });
    }
  }

  console.log(
    JSON.stringify(
      {
        slug,
        wallMs,
        totalFindings: analysis.findings.length,
        anchoredFindings: anchored.length,
        proxyHypotheses: anchored.filter((f) => f.hypotheses?.some((h) => h.pattern === "Proxy (inicialización perezosa)")).length,
        lazyInitRepetidaFindings: analysis.findings.filter((f) => f.kind === "lazy-init-repetida").length,
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
