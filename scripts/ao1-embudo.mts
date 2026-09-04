/**
 * OLA AO · FRENTE AO1 — EL EMBUDO DEL CAMINO DE NIVEL 2 DE `Strategy` Y LA
 * SONDA DE LA POBLACIÓN AMPLIADA, contra un ÁRBOL CONGELADO.
 *
 * Corre `analyzeRepo` con la traza de `startStrategyRefactoringTrace()`
 * prendida (sólo medición, costo cero apagada) y deja, por hallazgo de nivel 2
 * (`complexity`/`long-function`) que llega a la hipótesis: en qué `required`
 * muere, qué estado le habría dado `appliedState`, y la SONDA del archivo
 * entero (los sujetos decididos en >= 2 escaleras, con sus valores, sus
 * funciones, si cruzan de función y si alguna escalera es un `switch`).
 *
 * Escribe además el volcado con el mismo esquema que `ao1-dump.mts`.
 *
 * Uso: AO1_SRC=../scratchpad-ao1/srcP npx tsx scripts/ao1-embudo.mts <dir> <traza.json> <volcado.json>
 */
import { writeFileSync } from "node:fs";

const SRC = process.env.AO1_SRC ?? "../scratchpad-ao1/srcP";
const { analyzeRepo } = await import(`${SRC}/server/services/code-analyzer.js`);
const { stableFindingId } = await import(`${SRC}/server/services/code-finding-ids.js`);
const { direccionesDeFila } = await import(`${SRC}/server/services/detect/precision/direccion-hipotesis.js`);
const { startStrategyRefactoringTrace, takeStrategyRefactoringTrace } = await import(`${SRC}/server/services/hypotheses/strategy.js`);

const [, , dir, outTraza, outVolcado] = process.argv;
if (!dir || !outTraza || !outVolcado) {
  console.error("Uso: npx tsx scripts/ao1-embudo.mts <dir> <traza.json> <volcado.json>");
  process.exit(1);
}

const t0 = performance.now();
startStrategyRefactoringTrace();
const a = await analyzeRepo({ dir, repoName: "ao1", limits: { maxFindings: "unlimited" } });
const traza = takeStrategyRefactoringTrace() as any[];
const wallMs = Math.round(performance.now() - t0);

/* La ÚLTIMA entrada por hallazgo es la que decide lo publicado:
 * `rebuildHypothesesWithGraph` vuelve a llamar `build()` con árbol vivo Y
 * grafo real y REEMPLAZA `finding.hypotheses` (ver `hypotheses/run.ts`). */
const ultima = new Map<string, any>();
const pasadas = new Map<string, number>();
for (const e of traza) {
  ultima.set(`${e.findingId}|${e.file}|${e.line}`, e);
  pasadas.set(`${e.findingId}|${e.file}|${e.line}`, (pasadas.get(`${e.findingId}|${e.file}|${e.line}`) ?? 0) + 1);
}

const findings = (a.findings as any[]).map((f) => {
  const hs = f.hypotheses ?? [];
  const at = direccionesDeFila(hs, f.locations[0]);
  return {
    id: f.id ?? stableFindingId(f),
    kind: f.kind,
    title: f.title,
    where: f.locations.map((l: any) => `${l.file}:${l.startLine}`),
    spans: f.locations.map((l: any) => [l.file, l.startLine, l.endLine]),
    symbols: f.locations.map((l: any) => l.symbol ?? ""),
    hypotheses: hs.map((h: any, i: number) => ({ pattern: h.pattern, state: h.state, at: at[i] ?? "" })),
  };
});
const porKind: Record<string, { n: number; conHipotesis: number }> = {};
for (const f of findings) {
  const e = (porKind[f.kind] ??= { n: 0, conHipotesis: 0 });
  e.n++;
  if (f.hypotheses.length) e.conHipotesis++;
}
writeFileSync(outVolcado, JSON.stringify({ dir, wallMs, total: findings.length, porKind, findings }, null, 1));

const filas = [...ultima.entries()].map(([k, e]) => ({ ...e, pasadas: pasadas.get(k) ?? 1 }));
const resumen = {
  dir,
  wallMs,
  entradas: traza.length,
  hallazgosNivel2: filas.length,
  emitidas: filas.filter((f) => f.emitted).length,
  muertes: filas.reduce((m: Record<string, number>, f) => { const k = f.diesAt ?? "(emite)"; m[k] = (m[k] ?? 0) + 1; return m; }, {}),
};
writeFileSync(outTraza, JSON.stringify({ resumen, filas }, null, 1));
console.log(`${dir}: nivel2 ${filas.length} · emite ${resumen.emitidas} · ${JSON.stringify(resumen.muertes)} · ${wallMs}ms`);
