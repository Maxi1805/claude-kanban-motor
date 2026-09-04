// SONDA AL1 (temporal, no forma parte del catálogo): imprime el hallazgo COMPLETO
// y TODAS sus hipótesis con `places`, `evidence` y `toConfirm`, para poder juzgar
// una propuesta abriendo el archivo real. Se distingue de `j3-inspect-finding.mts`
// en que ésa imprime el hallazgo (nivel 1) y ésta imprime las PROPUESTAS (nivel 2).
//
// Uso: npx tsx scripts/al1-sonda-hipotesis.mts <dir> <slug> <id> [<id>...]
import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";
import { direccionesDeFila } from "../src/server/services/detect/precision/direccion-hipotesis.js";

async function main(): Promise<void> {
  const [dir, slug, ...ids] = process.argv.slice(2);
  if (!dir || !slug) { console.error("uso: al1-sonda-hipotesis.mts <dir> <slug> <id>..."); process.exit(1); }
  const { analysis } = await analyzeRepoCached({ dir, repoName: slug, limits: { maxFindings: "unlimited" } });
  const wanted = new Set(ids);
  for (const f0 of analysis.findings) {
    const f = f0.id ? f0 : { ...f0, id: stableFindingId(f0) };
    if (!f.id || !wanted.has(f.id)) continue;
    console.log("=".repeat(90));
    console.log(`id=${f.id} kind=${f.kind}`);
    console.log(`title: ${f.title}`);
    console.log(`detail: ${f.detail}`);
    console.log(`locations (${f.locations.length}):`);
    for (const l of f.locations) console.log(`  - ${l.file}:${l.startLine}-${l.endLine} symbol=${l.symbol ?? ""}`);
    const hs = f.hypotheses ?? [];
    const at = direccionesDeFila(hs, f.locations[0]!);
    hs.forEach((h, i) => {
      console.log("-".repeat(80));
      console.log(`  [${i}] ${h.pattern} · ${h.state}   AT=${at[i] ?? ""}`);
      console.log(`      toConfirm: ${JSON.stringify(h.toConfirm ?? null)}`);
      console.log(`      places: ${JSON.stringify(h.places ?? null)}`);
    });
  }
}
void main();
