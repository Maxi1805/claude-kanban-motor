/**
 * OLA X, FRENTE B1 — SONDA: ¿cuántas de las "recomendaciones" que la métrica de
 * cobertura cuenta son en realidad hipótesis NO APLICABLES?
 *
 * POR QUÉ. `engine.ts#build` devuelve `state: "ausente"` cuando faltan
 * capacidades del lenguaje (`missingCapabilities` no vacío) — un relleno, no una
 * afirmación: la hipótesis ni siquiera se evaluó. `facade.ts#missingGraphHypothesis`
 * hace lo mismo a mano. Pero `scripts/w-cobertura-nivel2.mts` —la métrica de
 * cabecera— mira SÓLO `state`, así que un "no pude evaluarme" entra al numerador
 * como si fuera "acá falta este patrón". Esta sonda cuenta cuántas son.
 *
 * USO: ./scripts/con-analisis.sh npx tsx scripts/x-b1-sonda-no-aplicable.mts corpus/lodash
 */
import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";

const dir = process.argv[2];
if (!dir) {
  console.error("Uso: npx tsx scripts/x-b1-sonda-no-aplicable.mts <dir>");
  process.exit(1);
}

const { analysis: a, cache } = await analyzeRepoCached({ dir, repoName: "sonda", limits: { maxFindings: "unlimited" } });
console.error(`[analyzer-cache] ${dir}: ${cache.hit ? "HIT" : "MISS"} (${cache.reason})`);

let recomendaciones = 0;
let noAplicables = 0;
const porPatron = new Map<string, number>();
for (const f of a.findings) {
  for (const h of f.hypotheses ?? []) {
    if (h.state !== "ausente" && h.state !== "parcial") continue;
    recomendaciones++;
    if ((h.missingCapabilities?.length ?? 0) > 0) {
      noAplicables++;
      porPatron.set(h.pattern, (porPatron.get(h.pattern) ?? 0) + 1);
    }
  }
}
console.log(`${dir}: recomendaciones=${recomendaciones} de-esas-NO-APLICABLES=${noAplicables} ${JSON.stringify([...porPatron])}`);
