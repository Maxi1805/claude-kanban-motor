/**
 * T2 (Ola Q) — sonda de exploración, NO productiva. Vuelca el detalle completo
 * (title/detail/evidence/locations) de un kind sobre un repo, filtrando por
 * substring del título, para leer la forma real de una muestra.
 *
 * Uso: npx tsx scripts/q-t2-detail.mts <repoDir> <kind> [substring] [n]
 */
import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";

async function main() {
  const [, , dir, kind, substr, nStr] = process.argv;
  if (!dir || !kind) {
    console.error("Uso: npx tsx scripts/q-t2-detail.mts <repoDir> <kind> [substring] [n]");
    process.exit(1);
  }
  const n = nStr ? Number(nStr) : 10;
  const { analysis } = await analyzeRepoCached({
    dir,
    repoName: "q-t2-detail",
    limits: { maxFindings: "unlimited" },
  });
  let findings = analysis.findings.filter((f) => f.kind === kind);
  if (substr) findings = findings.filter((f) => f.title.includes(substr));
  console.log(`total matching: ${findings.length}`);
  for (const f of findings.slice(0, n)) {
    console.log("=====");
    console.log("title:", f.title);
    console.log("detail:", f.detail);
    console.log(
      "locations:",
      JSON.stringify(f.locations.map((l) => ({ file: l.file, line: l.startLine, symbol: l.symbol }))),
    );
  }
}

await main();
