/**
 * OLA AI, FRENTE AI4 — EL EMBUDO DE STATE Y DE STRATEGY SOBRE EL MISMO ANCLA.
 *
 * Corre el pipeline REAL (`analyzeRepo`, sin cambiar nada) con las DOS trazas
 * prendidas —`hypotheses/state.ts#startStateTrace` (de este frente) y
 * `hypotheses/strategy.ts#startStrategyTrace` (de AH1, no tocada)— y deja en
 * JSON, por hallazgo, en qué `required` muere cada una (o si emite) y qué
 * estado le habría dado `appliedState`. Es el número que el volcado de
 * producción no puede dar: el volcado sólo publica lo que sobrevive.
 *
 * Con las dos juntas se puede contestar, sobre el MISMO `Finding`, la pregunta
 * que decide si este frente es aditivo: ¿pueden emitir las dos a la vez?
 *
 * Además escribe el MISMO volcado que `dump-hallazgos.mts` (mismo esquema)
 * para no pagar dos veces el análisis.
 *
 * Uso: npx tsx scripts/ai4-embudo.mts <dir> <traza.json> <volcado.json>
 */
import { writeFileSync } from "node:fs";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";
import { startStateTrace, takeStateTrace } from "../src/server/services/hypotheses/state.js";
import { startStrategyTrace, takeStrategyTrace } from "../src/server/services/hypotheses/strategy.js";

const [, , dir, outTraza, outVolcado] = process.argv;
if (!dir || !outTraza || !outVolcado) {
  console.error("Uso: npx tsx scripts/ai4-embudo.mts <dir> <traza.json> <volcado.json>");
  process.exit(1);
}

const t0 = performance.now();
startStateTrace();
startStrategyTrace();
const a = await analyzeRepo({ dir, repoName: "ai4", limits: { maxFindings: "unlimited" } });
const trazaState = takeStateTrace();
const trazaStrategy = takeStrategyTrace();
const wallMs = Math.round(performance.now() - t0);

/* La ÚLTIMA entrada por hallazgo es la que decide lo publicado:
 * `rebuildHypothesesWithGraph` vuelve a llamar `build()` con árbol vivo Y
 * grafo real y REEMPLAZA `finding.hypotheses` (ver `hypotheses/run.ts`). */
function ultimaPorHallazgo<T extends { findingId: string }>(t: readonly T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const e of t) m.set(e.findingId, e);
  return m;
}
const st = ultimaPorHallazgo(trazaState);
const sy = ultimaPorHallazgo(trazaStrategy);

const findings = a.findings.map((f) => ({
  id: f.id ?? stableFindingId(f),
  kind: f.kind,
  title: f.title,
  where: f.locations.map((l) => `${l.file}:${l.startLine}`),
  symbols: f.locations.map((l) => l.symbol ?? ""),
  hypotheses: (f.hypotheses ?? []).map((h) => ({ pattern: h.pattern, state: h.state, confidence: h.confidence ?? null })),
}));
const porKind: Record<string, { n: number; conHipotesis: number }> = {};
for (const f of findings) {
  const e = (porKind[f.kind] ??= { n: 0, conHipotesis: 0 });
  e.n++;
  if (f.hypotheses.length) e.conHipotesis++;
}
writeFileSync(outVolcado, JSON.stringify({ dir, wallMs, total: findings.length, porKind, findings }, null, 1));

const publicadoState = new Set<string>();
const publicadoStrategy = new Set<string>();
for (const f of findings) {
  if (f.hypotheses.some((h) => h.pattern === "State")) publicadoState.add(f.id);
  if (f.hypotheses.some((h) => h.pattern === "Strategy")) publicadoStrategy.add(f.id);
}

const ids = new Set<string>([...st.keys(), ...sy.keys()]);
const filas = [...ids].map((id) => ({
  findingId: id,
  state: st.get(id) ?? null,
  strategy: sy.get(id) ?? null,
  publicadoState: publicadoState.has(id),
  publicadoStrategy: publicadoStrategy.has(id),
}));

const poblacion = new Map<string, number>();
for (const f of findings) poblacion.set(f.kind, (poblacion.get(f.kind) ?? 0) + 1);

writeFileSync(
  outTraza,
  JSON.stringify({ dir, wallMs, poblacionPorKind: Object.fromEntries(poblacion), entradas: filas }, null, 1),
);

console.log(`${dir}: ${findings.length} hallazgos · state ${trazaState.length}/${st.size} · strategy ${trazaStrategy.length}/${sy.size} · ${wallMs}ms`);
