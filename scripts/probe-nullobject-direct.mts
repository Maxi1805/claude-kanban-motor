/**
 * Sonda B3 (Ola B) — Null Object cuelga ÚNICAMENTE de `distributed-duplication`
 * (`hypotheses/null-object.ts:917`), pero su ruta estructural (§B del mismo
 * archivo, `findNullObjectStructuralCandidates`) NO necesita duplicación de
 * código para existir: es un candidato de UNA sola clase (fan-out `calls`=0
 * en todos sus miembros + >=1 sitio que la instancia). El `build()` de
 * producción sólo la evalúa si el candidato cae DENTRO de
 * `relatedFiles(ctx, problem)` — el vecindario del `distributed-duplication`
 * que ancla la corrida (Ola 11a, fix de espurios) — nunca sobre el repo
 * entero sin relación.
 *
 * Esta sonda llama `findNullObjectStructuralCandidates` DIRECTO sobre el
 * `CodeGraph` real, sin el filtro de localidad ni el requisito de ancla, para
 * medir cuántos candidatos estructurales genuinos existen en el repo aunque
 * NUNCA lleguen a producir una hipótesis porque no hay ningún
 * `distributed-duplication` cerca de ellos.
 *
 * Uso: npx tsx scripts/probe-nullobject-direct.mts <dir>
 */
import path from "node:path";
import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { findNullObjectStructuralCandidates } from "../src/server/services/hypotheses/null-object.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";
async function main() {
  const dir = process.argv[2]!;
  const state: { graph: CodeGraph | null } = { graph: null };
  await analyzeRepo({ dir: path.resolve(dir), repoName: "x", limits: { maxFindings: "unlimited" }, onGraph: (r) => { state.graph = r.graph; } });
  const graph = state.graph!;
  const cands = findNullObjectStructuralCandidates(graph);
  console.log(`findNullObjectStructuralCandidates DIRECTO (repo entero, sin gate de ancla): ${cands.length}`);
  for (const c of cands.slice(0, 20)) {
    console.log(`  [${c.form}] nullType=${c.nullTypeId} interface=${c.interfaceId} miembros=${c.coveredMembers.length} instanciadoEn=${c.instantiationSites.length}`);
  }
}
main();
