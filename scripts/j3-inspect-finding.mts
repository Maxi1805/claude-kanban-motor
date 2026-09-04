// SONDA J3 (temporal, no forma parte del catalogo): imprime el CodeFinding
// completo (todas las locations) para uno o mas ids dados, de una corrida
// cacheada — para juzgar hallazgos inter-file cuya fila de planilla sólo
// trae la PRIMERA location (dependency-cycle, orphan-file, god-component...).
import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";

async function main() {
  const [dir, slug, ...ids] = process.argv.slice(2);
  const { analysis } = await analyzeRepoCached({ dir, repoName: slug, limits: { maxFindings: "unlimited" } });
  const withIds = analysis.findings.map((f) => (f.id ? f : { ...f, id: stableFindingId(f) }));
  const wanted = new Set(ids);
  for (const f of withIds) {
    if (f.id && wanted.has(f.id)) {
      console.log("=".repeat(80));
      console.log(`id=${f.id} kind=${f.kind}`);
      console.log(`title: ${f.title}`);
      console.log(`detail: ${f.detail}`);
      console.log(`locations (${f.locations.length}):`);
      for (const l of f.locations as readonly (typeof f.locations[number] & { role?: string })[]) {
        console.log(`  - ${l.file}:${l.startLine}-${l.endLine} symbol=${l.symbol ?? ""} role=${l.role ?? ""}`);
      }
      console.log(`evidence: ${JSON.stringify((f as unknown as { evidence?: unknown }).evidence)}`);
    }
  }
}
main();
