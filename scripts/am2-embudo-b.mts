/**
 * OLA AM, FRENTE AM2 (copia de am2-embudo.mts, misma lógica, ÁRBOL CONGELADO src0) — EL EMBUDO Y LOS RASGOS DE FORMA DE LAS TRES ANCLAS DE
 * STRATEGY.
 *
 * Corre el pipeline REAL (`analyzeRepo`, sin cambiarle nada) con la traza de
 * `hypotheses/strategy.ts` prendida —la que dejó AH1 en la Ola AH, ampliada
 * por este frente con los RASGOS DE FORMA (`StrategyFormFeatures`)— y deja en
 * JSON, por hallazgo de las tres anclas: en qué `required` muere (o si emite),
 * qué estado le habría dado `appliedState`, y el valor de cada rasgo de forma.
 *
 * Para qué: un discriminador candidato se evalúa OFFLINE sobre este volcado
 * contra el BANCO de veredictos (cuántas falsas conocidas apaga, cuántas
 * verdaderas toca) ANTES de escribir una línea de producción.
 *
 * Escribe además el volcado con el MISMO esquema que `dump-hallazgos.mts`
 * (para `w-int-censo-nivel2.mts`), para no pagar dos veces el análisis.
 *
 * Uso: npx tsx scripts/am2-embudo.mts <dir-repo> <traza.json> <volcado.json>
 */
import { writeFileSync } from "node:fs";

import { analyzeRepo } from "../scratchpad-am2/srcB/server/services/code-analyzer.js";
import { stableFindingId } from "../scratchpad-am2/srcB/server/services/code-finding-ids.js";
import { direccionesDeFila } from "../scratchpad-am2/srcB/server/services/detect/precision/direccion-hipotesis.js";
import { startStrategyTrace, takeStrategyTrace } from "../scratchpad-am2/srcB/server/services/hypotheses/strategy.js";

const [, , dir, outTraza, outVolcado] = process.argv;
if (!dir || !outTraza || !outVolcado) {
  console.error("Uso: npx tsx scripts/am2-embudo.mts <dir-repo> <traza.json> <volcado.json>");
  process.exit(1);
}

const t0 = performance.now();
startStrategyTrace();
const a = await analyzeRepo({ dir, repoName: "am2", limits: { maxFindings: "unlimited" } });
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

/* MISMO esquema, campo por campo, que `scripts/dump-hallazgos.mts` — incluida
 * la DIRECCIÓN de cada hipótesis (`at`), que `w-int-censo-nivel2.mts` necesita
 * para no colapsar dos hermanas del mismo patrón en una sola fila del censo.
 * Sin ella el censo salía 35 filas más chico en bibliotecas y 51 en
 * aplicaciones, y las dos columnas no se podían comparar contra las oficiales. */
const findings = a.findings.map((f) => {
  const hs = f.hypotheses ?? [];
  const at = direccionesDeFila(hs, f.locations[0]);
  return {
    id: f.id ?? stableFindingId(f),
    kind: f.kind,
    title: f.title,
    where: f.locations.map((l) => `${l.file}:${l.startLine}`),
    symbols: f.locations.map((l) => l.symbol ?? ""),
    hypotheses: hs.map((h, i) => ({ pattern: h.pattern, state: h.state, at: at[i] ?? "" })),
  };
});
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
const estadoPublicado = new Map<string, string>();
for (const f of findings) {
  const h = f.hypotheses.find((x) => x.pattern === "Strategy");
  if (h) estadoPublicado.set(f.id, h.state);
}
const anclas = new Set(["conditional-chain", "repeated-switch", "type-switch"]);
const poblacion = new Map<string, number>();
for (const f of findings) if (anclas.has(f.kind)) poblacion.set(f.kind, (poblacion.get(f.kind) ?? 0) + 1);

const filas = [...ultima.values()].map((e) => ({
  ...e,
  pasadas: pasadas.get(e.findingId) ?? 0,
  publicado: estadoPublicado.has(e.findingId),
  estadoPublicado: estadoPublicado.get(e.findingId) ?? null,
}));
writeFileSync(outTraza, JSON.stringify({ dir, wallMs, poblacionPorAncla: Object.fromEntries(poblacion), entradas: filas }, null, 1));

console.log(`${dir}: ${findings.length} hallazgos · traza ${traza.length} entradas / ${filas.length} hallazgos únicos · ${wallMs}ms`);
