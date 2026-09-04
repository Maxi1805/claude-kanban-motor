/**
 * OLA V · FRENTE V4 — vuelca, para UN repo, las hipótesis de State y Chain of Responsibility
 * con su archivo:línea, estado, y el texto completo de sus checks — para medir antes de tocar
 * nada (CONTEXTO.md §6: "medir, no estimar").
 *
 * Uso: npx tsx scripts/v4-probe.mts <dir> <slug>
 */
import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";

const [, , dir, slug] = process.argv;
if (!dir || !slug) {
  console.error("Uso: npx tsx scripts/v4-probe.mts <dir> <slug>");
  process.exit(1);
}

const { analysis, cache } = await analyzeRepoCached({ dir, repoName: slug, limits: { maxFindings: "unlimited" } });
console.error(`[cache] ${slug}: ${cache.hit ? "HIT" : "MISS"} (${cache.reason})`);

const WANTED = new Set(["State", "Chain of Responsibility"]);
let n = 0;
for (const f of analysis.findings) {
  for (const h of f.hypotheses ?? []) {
    if (!WANTED.has(h.pattern)) continue;
    n++;
    const loc = f.locations[0];
    console.log(`\n=== ${h.pattern} · ${h.state} · ${slug}/${loc?.file}:${loc?.startLine} (conf=${h.confidence ?? "null"})`);
    console.log(`ANCLA ${f.kind}: ${f.title}`);
    console.log(`checks:`);
    for (const c of h.checks) console.log(`  [${c.passed ? "OK" : "--"}] ${c.label}\n      ${c.why}`);
    console.log(`discriminators:`);
    for (const c of h.discriminators) console.log(`  [${c.passed ? "OK" : "--"}] ${c.label}\n      ${c.why}`);
  }
}
console.error(`[total] ${slug}: ${n} hipótesis State/CoR`);
