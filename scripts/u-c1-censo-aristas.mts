/**
 * C1 (Ola U) — censo de aristas por (kind, provenance, resolvedBy) y, aparte,
 * cuántas llevan el bit de rol `receiver-member`. Contesta dos preguntas de
 * esta ola sin estimar ninguna:
 *   · ¿cuántas aristas emite `self-receiver`, por lenguaje del destino?
 *   · ¿había ANTES alguna arista NO ambigua con rol `receiver-member`? (o sea:
 *     ¿la PUERTA 3 de `unused-symbol` estaba abierta en este lenguaje?)
 *
 * Uso: npx tsx scripts/u-c1-censo-aristas.mts <dir>
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { edgeHasRole, edgeIsAmbiguous, type CodeGraph } from "../src/server/services/graph/types.js";

const [, , dir] = process.argv;
if (!dir) {
  console.error("Uso: npx tsx scripts/u-c1-censo-aristas.mts <dir>");
  process.exit(1);
}

let graph: CodeGraph | null = null;
await analyzeRepo({
  dir: path.resolve(dir),
  repoName: "censo",
  limits: { maxFindings: "unlimited" },
  onGraph: (r) => {
    graph = r.graph;
  },
});
if (!graph) {
  console.log("graph null");
  process.exit(0);
}
const g: CodeGraph = graph;

const byKindProv = new Map<string, number>();
const byResolvedBy = new Map<string, number>();
let recvBitFirme = 0;
let recvBitAmbigua = 0;
const recvBitFirmePorEtapa = new Map<string, number>();
for (const e of g.edges) {
  const k = `${e.kind}/${e.provenance}`;
  byKindProv.set(k, (byKindProv.get(k) ?? 0) + 1);
  byResolvedBy.set(e.resolvedBy ?? "(sin etapa)", (byResolvedBy.get(e.resolvedBy ?? "(sin etapa)") ?? 0) + 1);
  if (!edgeHasRole(e, "receiver-member")) continue;
  if (edgeIsAmbiguous(e)) recvBitAmbigua++;
  else {
    recvBitFirme++;
    const s = e.resolvedBy ?? "(sin etapa)";
    recvBitFirmePorEtapa.set(s, (recvBitFirmePorEtapa.get(s) ?? 0) + 1);
  }
}
console.log(`repo=${path.basename(dir)} nodos=${g.nodes.length} aristas=${g.edges.length}`);
console.log("por kind/provenance:");
for (const [k, n] of [...byKindProv].sort()) console.log(`  ${k}: ${n}`);
console.log("por etapa:");
for (const [k, n] of [...byResolvedBy].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`);
console.log(`bit receiver-member: firmes=${recvBitFirme} ambiguas=${recvBitAmbigua}`);
console.log(`  firmes por etapa: ${[...recvBitFirmePorEtapa].map(([k, n]) => `${k}=${n}`).join(" ")}`);
