/**
 * Sonda B3 (Ola B) — Prototype cuelga de `speculative-abstraction`, y esa
 * ancla depende de `needsEdges: ["extends","implements","satisfies"]`
 * (`detect/inter-file/speculative-abstraction.ts:365`), un gate que
 * `detect/run.ts:252-266` interpreta como "TODOS presentes en el grafo de
 * esta corrida" (nunca "al menos uno") — verificado leyendo ese archivo.
 * En Ruby, `implements` es SIEMPRE 0 (sin sintaxis de interfaz), así que el
 * gate marca el detector "sin-aristas" y `run()` NUNCA se invoca, aunque
 * `extends`+`satisfies` solos ya alcancen para hallazgos reales.
 *
 * Esta sonda llama `buildSpeculativeAbstractionFindings` (la función PURA,
 * separada del wrapper `detector.run`) DIRECTO sobre el mismo `CodeGraph`
 * real que produce `analyzeRepo` — sin pasar por el gate — para medir
 * cuántos hallazgos genuinos se están perdiendo. Comparar contra
 * `measure-hypothesis-states.mts` (que sí pasa por el gate real): si esta
 * sonda encuentra N>0 y la corrida real reporta "sin-insumo"/0, el gate es
 * la causa exacta, no el algoritmo del detector.
 *
 * Uso: npx tsx scripts/probe-specabs-direct.mts <dir>
 */
import path from "node:path";
import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { buildSpeculativeAbstractionFindings } from "../src/server/services/detect/inter-file/speculative-abstraction.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";
async function main() {
  const dir = process.argv[2]!;
  const state: { graph: CodeGraph | null; clones: any[] } = { graph: null, clones: [] };
  await analyzeRepo({ dir: path.resolve(dir), repoName: "x", limits: { maxFindings: "unlimited" }, onGraph: (r) => { state.graph = r.graph; } });
  const graph = state.graph!;
  const findings = buildSpeculativeAbstractionFindings(graph, { value: 1 } as any, []);
  console.log(`buildSpeculativeAbstractionFindings directo: ${findings.length} findings`);
  for (const f of findings) console.log(`  ${f.title} — ${f.locations.map((l: any) => `${l.file}#${l.symbol ?? ""}`).join(" | ")}`);
}
main();
