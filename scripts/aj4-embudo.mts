/**
 * OLA AJ, FRENTE AJ4 — EL EMBUDO DE CHAIN OF RESPONSIBILITY.
 *
 * Corre el pipeline REAL (`analyzeRepo`) con la traza de
 * `hypotheses/chain-of-responsibility.ts` prendida (la que dejó AI7, ya en
 * producción, `null` por defecto ⇒ costo cero) y deja, por hallazgo-ancla,
 * en qué escalón muere `guardRunCandidate` y qué publica el patrón.
 *
 * Escribe además el MISMO volcado que `dump-hallazgos.mts` para no pagar dos
 * veces el análisis. Mismo idiom que `scripts/ai7-embudo.mts`.
 *
 * Uso: npx tsx scripts/aj4-embudo.mts <dir> <traza.json> <volcado.json>
 */
import { writeFileSync } from "node:fs";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";
import { startCorTrace, takeCorTrace } from "../src/server/services/hypotheses/chain-of-responsibility.js";

const [, , dir, outTraza, outVolcado] = process.argv;
if (!dir || !outTraza || !outVolcado) {
  console.error("Uso: npx tsx scripts/aj4-embudo.mts <dir> <traza.json> <volcado.json>");
  process.exit(1);
}

const t0 = performance.now();
startCorTrace();
const a = await analyzeRepo({ dir, repoName: "aj4", limits: { maxFindings: "unlimited" } });
const cor = takeCorTrace();
const wallMs = Math.round(performance.now() - t0);

if (cor.length === 0) {
  console.error(`[aj4] ABORTO: traza VACÍA en ${dir} — un HIT de caché no ejecuta las hipótesis. Corré con CK_ANALYSIS_CACHE=off.`);
  process.exit(2);
}

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
function ultimaPorHallazgo<T extends { findingId: string }>(t: readonly T[]): T[] {
  const ultima = new Map<string, T>();
  for (const e of t) ultima.set(e.findingId, e);
  return [...ultima.values()];
}

const corPublicado: string[] = [];
for (const f of findings) for (const h of f.hypotheses) if (h.pattern === "Chain of Responsibility") corPublicado.push(`${f.id}|${h.state}|${f.kind}|${f.where[0] ?? ""}`);

writeFileSync(outTraza, JSON.stringify({ dir, wallMs, porKind, corPublicado, filas: ultimaPorHallazgo(cor) }, null, 1));

console.error(`[aj4] ${dir}: ${findings.length} hallazgos · traza cor=${cor.length} (${ultimaPorHallazgo(cor).length} únicos) · publicadas ${corPublicado.length} · ${wallMs} ms`);
