/**
 * OLA X, FRENTE B1 — VOLCADO + TRAZA DE ARBITRAJE, en UNA sola corrida.
 *
 * POR QUÉ NO SON DOS CORRIDAS. El encargo exige medir el delta AISLANDO el
 * propio cambio, y diez frentes editan el mismo árbol: dos corridas separadas
 * por minutos pueden ver dos analizadores distintos (la huella de
 * `analyze-cache.ts` es el sha de `src/server/services/**`). El arbitraje
 * (`hypotheses/engine.ts#arbitrateRivalHypotheses`) es un FILTRO puro sobre
 * `finding.hypotheses` y no alimenta nada más — verificado por grep: ni
 * `detect/ranking.ts`, ni `detect/impact.ts`, ni `detect/grouping.ts` leen
 * `hypotheses`, así que no puede mover el conjunto de hallazgos, sus ids ni su
 * puntaje. Por eso la traza de UNA corrida basta para reconstruir, sin volver
 * a analizar, los tres brazos:
 *
 *   · SIN arbitraje       — sobreviven todas
 *   · regla VIEJA         — se descarta la oportunidad si ALGÚN otro patrón confirmó
 *   · regla NUEVA         — … y además sus `places` se solapan
 *
 * Salida: el mismo shape que `scripts/dump-hallazgos.mts` (para que
 * `scripts/w-cobertura-nivel2.mts` lo lea sin tocarlo) MÁS el campo
 * `arbitraje`.
 *
 * USO: ./scripts/con-analisis.sh npx tsx scripts/x-b1-dump-arbitraje.mts corpus/nest /tmp/x-b1/nest.json
 */
import { writeFileSync } from "node:fs";

import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";
import { startArbitrationTrace, takeArbitrationTrace } from "../src/server/services/hypotheses/engine.js";

const [, , dir, out] = process.argv;
if (!dir || !out) {
  console.error("Uso: npx tsx scripts/x-b1-dump-arbitraje.mts <dir> <salida.json>");
  process.exit(1);
}

startArbitrationTrace();

const t0 = performance.now();
const { analysis: a, cache } = await analyzeRepoCached({
  dir,
  repoName: "dump",
  limits: { maxFindings: "unlimited" },
});
console.error(
  `[analyzer-cache] ${dir}: ${cache.hit ? "HIT" : "MISS"} (${cache.reason}) analyzeMs=${cache.analyzeMs.toFixed(0)}`,
);
if (cache.hit) {
  console.error("ABORTO: un HIT de caché no ejecuta el arbitraje, así que la traza estaría vacía. Corré con CK_ANALYSIS_CACHE=off.");
  process.exit(2);
}
const wallMs = Math.round(performance.now() - t0);

// `arbitrateRivalHypotheses` corre hasta DOS veces por hallazgo
// (`attachHypotheses` dentro de `analyzeFile`, y después
// `rebuildHypothesesWithGraph` en `crossAnalyze`). Lo que se publica es la
// ÚLTIMA, así que la traza se deduplica por ancla quedándose con la última.
const trazaCruda = takeArbitrationTrace();
const porAncla = new Map<string, (typeof trazaCruda)[number]>();
for (const e of trazaCruda) porAncla.set(e.anchorFindingId, e);

const findings = a.findings.map((f) => ({
  id: f.id ?? stableFindingId(f),
  kind: f.kind,
  title: f.title,
  where: f.locations.map((l) => `${l.file}:${l.startLine}`),
  symbols: f.locations.map((l) => l.symbol ?? ""),
  hypotheses: (f.hypotheses ?? []).map((h) => ({ pattern: h.pattern, state: h.state })),
}));

const porKind: Record<string, { n: number; conHipotesis: number }> = {};
for (const f of findings) {
  const e = (porKind[f.kind] ??= { n: 0, conHipotesis: 0 });
  e.n++;
  if (f.hypotheses.length) e.conHipotesis++;
}

writeFileSync(
  out,
  JSON.stringify(
    { dir, wallMs, total: findings.length, porKind, findings, arbitraje: [...porAncla.values()] },
    null,
    1,
  ),
);
console.log(
  `${out}: ${findings.length} hallazgos, ${Object.keys(porKind).length} kinds, ` +
    `${porAncla.size} anclas con >=2 hipótesis (de ${trazaCruda.length} llamadas), ${wallMs}ms`,
);
