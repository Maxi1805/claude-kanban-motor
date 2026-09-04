/**
 * T2 (Ola Q) — sonda de exploración, NO productiva. Para `shotgun-surgery`:
 * sobre un repo, para cada hallazgo mira si el símbolo destino tiene
 * `CodeGraphNode.exported === true/false/undefined` — para evaluar si
 * "exported" es un discriminador útil (REDEFINIBLE) sin agregar ningún hecho
 * nuevo al grafo.
 *
 * Uso: npx tsx scripts/q-t2-ss-exported.mts <repoDir>
 */
import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";

async function main() {
  const [, , dir] = process.argv;
  if (!dir) {
    console.error("Uso: npx tsx scripts/q-t2-ss-exported.mts <repoDir>");
    process.exit(1);
  }
  const { analysis, graph } = await analyzeRepoCached({
    dir,
    repoName: "q-t2-ss-exported",
    limits: { maxFindings: "unlimited" },
  });
  if (!graph) {
    console.log("sin grafo");
    return;
  }
  const findings = analysis.findings.filter((f) => f.kind === "shotgun-surgery");
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n] as const));
  let expTrue = 0,
    expFalse = 0,
    expUndef = 0;
  for (const f of findings) {
    const loc = f.locations[0];
    if (!loc?.symbol) continue;
    // Buscar el nodo por archivo+symbol (mismo criterio que symbolName): el finding no trae el id.
    const candidates = graph.nodes.filter(
      (n) => n.kind === "symbol" && n.file === loc.file && (n.symbolPath[n.symbolPath.length - 1] ?? "") === loc.symbol,
    );
    const node = candidates[0];
    if (!node) {
      console.log(`  NO-NODE: ${loc.file} ${loc.symbol}`);
      continue;
    }
    if (node.exported === true) expTrue++;
    else if (node.exported === false) expFalse++;
    else expUndef++;
    console.log(`${f.title} | exported=${node.exported}`);
  }
  console.log(`\nTOTAL: exported=true:${expTrue} exported=false:${expFalse} undefined:${expUndef}`);
}

await main();
