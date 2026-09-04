/**
 * Medición ad-hoc (Ola 10, agente Observer) — corre `analyzeRepo` real sobre
 * la fixture canónica multi-lenguaje de Observer (`tests/fixtures/patterns/
 * observer/*`, la copia versionada de `fixtures-multi`) y reporta, para cada
 * lenguaje, qué estado produce `hypotheses/observer.ts` (requisito 4 del
 * encargo: la forma COMPLETA — el patrón YA aplicado — tiene que dar
 * `ya-aplicado`, NUNCA una sugerencia y NUNCA silencio). Mismo molde que
 * `measure-proxy-canonical.mts` (Ola 10, agente Proxy).
 *
 * Uso:
 *   npx tsx scripts/measure-observer-canonical.mts <dirFixturesMultiObserver>
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeFinding } from "../src/shared/types.js";

async function main(): Promise<void> {
  const [, , dir] = process.argv;
  if (!dir) {
    console.error("Uso: npx tsx scripts/measure-observer-canonical.mts <dirFixturesMultiObserver>");
    process.exit(1);
  }
  const rootDir = path.resolve(dir);
  const collected: CodeFinding[] = [];
  const analysis = await analyzeRepo({
    dir: rootDir,
    repoName: "observer-canonical",
    limits: { maxFindings: "unlimited" },
    onPreCapFindings: (findings: readonly CodeFinding[]) => {
      collected.push(...findings);
    },
  });

  console.log(`TOTAL findings: ${analysis.findings.length} (pre-cap: ${collected.length}), kinds: ${[...new Set(collected.map((f) => f.kind))].sort().join(",")}`);

  const anchored = collected.filter((f) => f.kind === "manual-notification");
  console.log(`Hallazgos ancla (manual-notification): ${anchored.length}`);

  const byState: Record<string, { file: string; className: string | undefined; why: string }[]> = {};
  for (const f of anchored) {
    const p = (f.hypotheses ?? []).find((h) => h.pattern === "Observer");
    if (!p) {
      console.log(`  [SIN HIPOTESIS] kind=${f.kind} ${f.locations.map((l) => `${l.file}#${l.symbol ?? ""}`).join(" | ")}`);
      continue;
    }
    const appliedWhy = (p.checks ?? []).find((c) => c.role === "applied")?.why ?? "";
    (byState[p.state] ??= []).push({ file: f.locations[0]?.file ?? "?", className: f.locations[0]?.symbol, why: appliedWhy });
    console.log(`  [${p.state}] conf=${p.confidence ?? "null"} ceiling=${p.ceiling} kind=${f.kind} ${f.locations.map((l) => `${l.file}#${l.symbol ?? ""}`).join(" | ")}`);
    console.log(`      why: ${appliedWhy}`);
  }

  console.log("\nResumen por estado:", Object.fromEntries(Object.entries(byState).map(([k, v]) => [k, v.length])));

  // Todo lo que toque archivos del directorio de la fixture, para ver si algo quedó en silencio total.
  const touching = collected.filter((f) => f.locations.some((l) => rootDir && (path.resolve(rootDir, l.file).startsWith(rootDir) || l.file.includes("observer"))));
  console.log(`\nfindings que tocan la fixture (cualquier kind): ${touching.length}, kinds: ${[...new Set(touching.map((f) => f.kind))].sort().join(",")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
