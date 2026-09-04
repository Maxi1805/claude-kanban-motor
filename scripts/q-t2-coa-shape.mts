/**
 * T2 (Ola Q) — sonda de exploración, NO productiva. Para `concrete-over-abstraction`:
 * sobre TODO el corpus, clasifica cada hallazgo por FORMA (verificado a nivel de
 * miembro vs. sólo referencia de clase; guava/android-guava duplicado vs. no) y
 * cuenta cuántos caen en cada forma.
 *
 * Uso: npx tsx scripts/q-t2-coa-shape.mts <repoDir> [repoDir...]
 */
import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";

async function main() {
  const dirs = process.argv.slice(2);
  let memberVerified = 0;
  let classLevelOnly = 0;
  const byPair = new Map<string, number>();
  for (const dir of dirs) {
    const { analysis } = await analyzeRepoCached({ dir, repoName: "q-t2-coa", limits: { maxFindings: "unlimited" } });
    const findings = analysis.findings.filter((f) => f.kind === "concrete-over-abstraction");
    for (const f of findings) {
      if (f.detail.includes("Confianza reducida")) classLevelOnly++;
      else memberVerified++;
      const b = f.locations[1]?.symbol ?? "?";
      const i = f.locations[2]?.symbol ?? "?";
      const key = `${b} -> ${i}`;
      byPair.set(key, (byPair.get(key) ?? 0) + 1);
    }
    console.log(`${dir}: ${findings.length} hallazgos`);
  }
  console.log(`TOTAL member-verified: ${memberVerified}, class-level-only (hipótesis débil): ${classLevelOnly}`);
  console.log(`pares distintos (B,I): ${byPair.size}`);
}

await main();
