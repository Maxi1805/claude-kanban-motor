/** AM4 — sonda de auditoría: lista TODA hipótesis de Facade colgada de un hallazgo
 *  `repeated-collaborator-set`, con sus lugares por rol. No toca nada. */
import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";

const [, , dir, filtro] = process.argv;
const { analysis: a } = await analyzeRepoCached({ dir, repoName: "sonda", limits: { maxFindings: "unlimited" } });
for (const f of a.findings) {
  if (f.kind !== "repeated-collaborator-set") continue;
  const id = stableFindingId(f as never);
  if (filtro && !id.includes(filtro)) continue;
  console.log(`\n### ${id}  ${f.locations[0]?.file}:${f.locations[0]?.startLine}  «${f.title}»`);
  for (const h of f.hypotheses ?? []) {
    if (h.pattern !== "Facade") continue;
    const rep = (h.places ?? []).filter((p) => (p.role ?? "").startsWith("repite la coordinación"));
    const pz = (h.places ?? []).filter((p) => (p.role ?? "").startsWith("pieza del subsistema"));
    console.log(`   - estado=${h.state}  lugares=${rep.length} archivosCliente=${new Set(rep.map((p) => p.file)).size} piezas=${pz.length}`);
    console.log(`       clientes: ${[...new Set(rep.map((p) => p.file))].join(", ")}`);
    console.log(`       piezas  : ${[...new Set(pz.map((p) => p.file))].join(", ")}`);
  }
}
