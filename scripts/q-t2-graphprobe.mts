/**
 * T2 (Ola Q) — sonda de exploración, NO productiva. Vuelca las aristas de un
 * grafo real que salen o entran de un símbolo dado (por nombre exacto), con
 * su `kind` y `provenance`, para verificar a mano por qué un detector
 * incluye/excluye un candidato.
 *
 * Uso: npx tsx scripts/q-t2-graphprobe.mts <repoDir> <symbolName>
 */
import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";

async function main() {
  const [, , dir, symbolName] = process.argv;
  if (!dir || !symbolName) {
    console.error("Uso: npx tsx scripts/q-t2-graphprobe.mts <repoDir> <symbolName>");
    process.exit(1);
  }
  const { graph } = await analyzeRepoCached({
    dir,
    repoName: "q-t2-graphprobe",
    limits: { maxFindings: "unlimited" },
  });
  if (!graph) {
    console.log("sin grafo");
    return;
  }
  const matches = graph.nodes.filter(
    (n) => n.kind === "symbol" && (n.symbolPath[n.symbolPath.length - 1] ?? "") === symbolName,
  );
  console.log(`nodos con símbolo "${symbolName}": ${matches.length}`);
  for (const node of matches) {
    console.log(`  id=${node.id} file=${node.file} family=${node.family}`);
    const outgoing = graph.edges.filter((e) => e.from === node.id);
    const incoming = graph.edges.filter((e) => e.to === node.id);
    console.log(
      `  outgoing (${outgoing.length}):`,
      outgoing.map((e) => `${e.kind}[${e.provenance}]->${e.to}`).join(" | "),
    );
    console.log(
      `  incoming (${incoming.length}):`,
      incoming
        .filter((e) => e.kind !== "contains" && e.kind !== "references")
        .map((e) => `${e.kind}[${e.provenance}]<-${e.from}`)
        .join(" | "),
    );
  }
}

await main();
