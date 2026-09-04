/**
 * OLA AJ, FRENTE AJ3 — EL EMBUDO DE `prototype.ts` SOBRE `duplication`.
 *
 * Corre el pipeline REAL (`analyzeRepo`, sin cambiar nada) con la traza de
 * `hypotheses/prototype.ts` prendida y deja en JSON, por hallazgo-ancla, en
 * qué etapa/compuerta muere el camino nuevo (`armado-copiado`) — y los dos
 * hechos de grafo de la condición 4. Escribe además el MISMO volcado que
 * `dump-hallazgos.mts` (mismo esquema) para no pagar dos veces el análisis.
 *
 * Uso: npx tsx scripts/aj3-embudo.mts <dir> <traza.json> <volcado.json>
 */
import { writeFileSync } from "node:fs";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";
import { startPrototypeTrace, takePrototypeTrace } from "../src/server/services/hypotheses/prototype.js";

const [, , dir, outTraza, outVolcado] = process.argv;
if (!dir || !outTraza || !outVolcado) {
  console.error("Uso: npx tsx scripts/aj3-embudo.mts <dir> <traza.json> <volcado.json>");
  process.exit(1);
}

const t0 = performance.now();
startPrototypeTrace();
const a = await analyzeRepo({ dir, repoName: "aj3", limits: { maxFindings: "unlimited" } });
const traza = takePrototypeTrace();
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
const ultima = new Map<string, (typeof traza)[number]>();
for (const e of traza) ultima.set(e.findingId, e);
const filas = [...ultima.values()];

const publicadoPorPatron: Record<string, string[]> = {};
for (const f of findings) for (const h of f.hypotheses) (publicadoPorPatron[h.pattern] ??= []).push(`${f.id}|${h.state}`);

writeFileSync(outTraza, JSON.stringify({ dir, wallMs, porKind, publicadoPorPatron, pasadas: traza.length, prototype: filas }, null, 1));

console.error(`[aj3] ${dir}: ${findings.length} hallazgos · traza proto=${traza.length} (últimas ${filas.length}) · ${wallMs} ms`);
