/**
 * OLA AH, FRENTE AH1 — EL EMBUDO DE LAS TRES ANCLAS DE STRATEGY.
 *
 * Corre el pipeline REAL (`analyzeRepo`, sin cambiar nada) con la traza de
 * `hypotheses/strategy.ts` prendida y deja en JSON, por hallazgo de las tres
 * anclas, en qué `required` muere (o si emite) y qué estado le habría dado
 * `appliedState`. Es el número que el volcado de producción no puede dar: el
 * volcado sólo publica lo que sobrevive.
 *
 * Además escribe el MISMO volcado que `dump-hallazgos.mts` (mismo esquema,
 * para `w-int-censo-nivel2.mts`) para no pagar dos veces el análisis.
 *
 * Uso: npx tsx scripts/ah1-embudo.mts <dir> <salida-traza.json> <salida-volcado.json>
 */
import { writeFileSync } from "node:fs";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";
import { startStrategyTrace, takeStrategyTrace } from "../src/server/services/hypotheses/strategy.js";

const [, , dir, outTraza, outVolcado] = process.argv;
if (!dir || !outTraza || !outVolcado) {
  console.error("Uso: npx tsx scripts/ah1-embudo.mts <dir> <traza.json> <volcado.json>");
  process.exit(1);
}

const t0 = performance.now();
startStrategyTrace();
const a = await analyzeRepo({ dir, repoName: "ah1", limits: { maxFindings: "unlimited" } });
const traza = takeStrategyTrace();
const wallMs = Math.round(performance.now() - t0);

/* La ÚLTIMA entrada por hallazgo es la que decide lo publicado:
 * `rebuildHypothesesWithGraph` vuelve a llamar `build()` con árbol vivo Y
 * grafo real y REEMPLAZA `finding.hypotheses` (ver `hypotheses/run.ts`). */
const ultima = new Map<string, (typeof traza)[number]>();
const pasadas = new Map<string, number>();
for (const e of traza) {
  ultima.set(e.findingId, e);
  pasadas.set(e.findingId, (pasadas.get(e.findingId) ?? 0) + 1);
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

/* ¿La hipótesis de Strategy sobrevive al ARBITRAJE? (`arbitrateRivalHypotheses`
 * corre después de `build()`, así que "emitido" en la traza no implica
 * "publicado"). Se cruza contra el volcado real. */
const publicado = new Set<string>();
for (const f of findings) if (f.hypotheses.some((h) => h.pattern === "Strategy")) publicado.add(f.id);
const anclas = new Set(["conditional-chain", "repeated-switch", "type-switch"]);
const poblacion = new Map<string, number>();
for (const f of findings) if (anclas.has(f.kind)) poblacion.set(f.kind, (poblacion.get(f.kind) ?? 0) + 1);

const filas = [...ultima.values()].map((e) => ({ ...e, pasadas: pasadas.get(e.findingId) ?? 0, publicado: publicado.has(e.findingId) }));
writeFileSync(outTraza, JSON.stringify({ dir, wallMs, poblacionPorAncla: Object.fromEntries(poblacion), entradas: filas }, null, 1));

console.log(`${dir}: ${findings.length} hallazgos · traza ${traza.length} entradas / ${filas.length} hallazgos únicos · ${wallMs}ms`);
