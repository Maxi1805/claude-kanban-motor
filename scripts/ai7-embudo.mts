/**
 * OLA AI, FRENTE AI7 — EL EMBUDO DE LAS SEIS HIPÓTESIS DEL GRUPO 3.
 *
 * Corre el pipeline REAL (`analyzeRepo`, sin cambiar nada) con las seis
 * trazas de `hypotheses/{null-object,observer,prototype,singleton,
 * chain-of-responsibility,value-object}.ts` prendidas y deja en JSON, por
 * hallazgo-ancla, en qué etapa/`required` muere (o si emite). Es el número
 * que el volcado de producción no puede dar: el volcado sólo publica lo que
 * sobrevive.
 *
 * Además escribe el MISMO volcado que `dump-hallazgos.mts` (mismo esquema),
 * para no pagar dos veces el análisis. Mismo idiom que `scripts/ah1-embudo.mts`.
 *
 * Uso: npx tsx scripts/ai7-embudo.mts <dir> <traza.json> <volcado.json>
 */
import { writeFileSync } from "node:fs";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";
import { startCorTrace, takeCorTrace } from "../src/server/services/hypotheses/chain-of-responsibility.js";
import { startNullObjectTrace, takeNullObjectTrace } from "../src/server/services/hypotheses/null-object.js";
import { startObserverTrace, takeObserverTrace } from "../src/server/services/hypotheses/observer.js";
import { startPrototypeTrace, takePrototypeTrace } from "../src/server/services/hypotheses/prototype.js";
import { startSingletonTrace, takeSingletonTrace } from "../src/server/services/hypotheses/singleton.js";
import { startValueObjectTrace, takeValueObjectTrace } from "../src/server/services/hypotheses/value-object.js";

const [, , dir, outTraza, outVolcado] = process.argv;
if (!dir || !outTraza || !outVolcado) {
  console.error("Uso: npx tsx scripts/ai7-embudo.mts <dir> <traza.json> <volcado.json>");
  process.exit(1);
}

const t0 = performance.now();
startCorTrace();
startNullObjectTrace();
startObserverTrace();
startPrototypeTrace();
startSingletonTrace();
startValueObjectTrace();
const a = await analyzeRepo({ dir, repoName: "ai7", limits: { maxFindings: "unlimited" } });
const trazas = {
  cor: takeCorTrace(),
  nullObject: takeNullObjectTrace(),
  observer: takeObserverTrace(),
  prototype: takePrototypeTrace(),
  singleton: takeSingletonTrace(),
  valueObject: takeValueObjectTrace(),
};
const wallMs = Math.round(performance.now() - t0);

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
writeFileSync(outVolcado, JSON.stringify({ dir, wallMs, total: findings.length, porKind, findings }, null, 1));

/* La ÚLTIMA entrada por hallazgo es la que decide lo publicado:
 * `rebuildHypothesesWithGraph` vuelve a llamar `build()` con árbol vivo Y
 * grafo real y REEMPLAZA `finding.hypotheses` (`hypotheses/run.ts`). */
function ultimaPorHallazgo<T extends { findingId: string }>(t: readonly T[]): { filas: T[]; pasadas: Record<string, number> } {
  const ultima = new Map<string, T>();
  const pasadas: Record<string, number> = {};
  for (const e of t) {
    ultima.set(e.findingId, e);
    pasadas[e.findingId] = (pasadas[e.findingId] ?? 0) + 1;
  }
  return { filas: [...ultima.values()], pasadas };
}

const publicadoPorPatron: Record<string, string[]> = {};
for (const f of findings) for (const h of f.hypotheses) (publicadoPorPatron[h.pattern] ??= []).push(`${f.id}|${h.state}`);

writeFileSync(
  outTraza,
  JSON.stringify(
    {
      dir,
      wallMs,
      porKind,
      publicadoPorPatron,
      cor: ultimaPorHallazgo(trazas.cor),
      nullObject: ultimaPorHallazgo(trazas.nullObject),
      observer: ultimaPorHallazgo(trazas.observer),
      prototype: ultimaPorHallazgo(trazas.prototype),
      singleton: ultimaPorHallazgo(trazas.singleton),
      valueObject: ultimaPorHallazgo(trazas.valueObject),
    },
    null,
    1,
  ),
);

console.error(
  `[ai7] ${dir}: ${findings.length} hallazgos · traza cor=${trazas.cor.length} no=${trazas.nullObject.length} obs=${trazas.observer.length} proto=${trazas.prototype.length} sing=${trazas.singleton.length} vo=${trazas.valueObject.length} · ${wallMs} ms`,
);
