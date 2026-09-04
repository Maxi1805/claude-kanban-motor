/**
 * Medición ad-hoc (Ola 10, agente Composite) — corre `analyzeRepo` real
 * sobre un directorio y reporta, para cada `Finding` de `distributed-duplication`
 * (el ancla de esta hipótesis), qué `PatternHypothesis` de "Composite" (si
 * alguna) quedó colgada — `state`/`confidence`/primeros checks.
 *
 * Uso:
 *   npx tsx scripts/measure-composite-canonical.mts <dir> <slug>
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeFinding } from "../src/shared/types.js";

async function main(): Promise<void> {
  const [, , dir, slug] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/measure-composite-canonical.mts <dir> <slug>");
    process.exit(1);
  }
  const collected: CodeFinding[] = [];
  await analyzeRepo({
    dir: path.resolve(dir),
    repoName: slug,
    limits: { maxFindings: "unlimited" },
    onPreCapFindings: (findings: readonly CodeFinding[]) => {
      collected.push(...findings);
    },
  });

  const findings = collected;
  console.log(`[${slug}] TOTAL findings: ${findings.length}, kinds: ${[...new Set(findings.map((f) => f.kind))].sort().join(",")}`);
  const dd = findings.filter((f) => f.kind === "distributed-duplication");
  console.log(`[${slug}] distributed-duplication findings: ${dd.length}`);
  let withHypothesis = 0;
  const byState = new Map<string, number>();
  for (const f of dd) {
    const c = (f.hypotheses ?? []).find((h) => h.pattern === "Composite");
    if (!c) {
      console.log(`  [SIN HIPOTESIS] ${f.locations.map((l) => `${l.file}#${l.symbol ?? ""}`).join(" | ")}`);
      continue;
    }
    withHypothesis++;
    byState.set(c.state, (byState.get(c.state) ?? 0) + 1);
    const appliedWhy = (c.checks ?? []).find((chk) => chk.role === "applied")?.why ?? "";
    console.log(
      `  [${c.state}] conf=${c.confidence ?? "null"} ceiling=${c.ceiling} ${f.locations.map((l) => `${l.file}#${l.symbol ?? ""}`).join(" | ")}`,
    );
    console.log(`      why: ${appliedWhy}`);
  }
  console.log(`[${slug}] con hipótesis Composite: ${withHypothesis}/${dd.length}`, Object.fromEntries(byState));

  // ¿Alguna referencia a "composite" o "shape" en TODOS los findings (de cualquier kind), para
  // confirmar si el directorio composite/ produce ALGÚN finding que ancle la hipótesis?
  const touchingComposite = findings.filter((f) => f.locations.some((l) => l.file.includes("/composite/") || l.file === "composite"));
  console.log(`[${slug}] findings que tocan archivos de composite/: ${touchingComposite.length}`);
  for (const f of touchingComposite) {
    console.log(`  kind=${f.kind} locations=${f.locations.map((l) => `${l.file}#${l.symbol ?? ""}`).join(" | ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
