/**
 * OLA AN, FRENTE AN4 — EL EMBUDO DE LAS TRES ANCLAS DE BUILDER, CON EL SONDEO
 * DEL CANAL DE NIVEL 2.
 *
 * Corre el pipeline REAL (`analyzeRepo`, sin cambiarle nada) con la traza que
 * AI6 dejó en `hypotheses/builder.ts`, ampliada por este frente con
 * `Ai6Level2Probe` (sólo medición). Deja en JSON, por hallazgo y POR PASADA:
 * en qué `required` muere (o si emite), qué estado le habría dado
 * `appliedState`, y el tamaño/contenido del vecindario de nivel 2 en el mismo
 * archivo y en el mismo símbolo.
 *
 * Para qué: contestar la PREGUNTA DE MECANISMO (¿el hecho de nivel 2 está
 * disponible en el punto donde la hipótesis se evalúa?) sin suponerla, y
 * evaluar OFFLINE un ancla nueva y un descuento contra el BANCO de veredictos
 * ANTES de escribir una línea de producción.
 *
 * Escribe además el volcado con el MISMO esquema que `dump-hallazgos.mts`.
 *
 * Uso: npx tsx scripts/an4-embudo.mts <dir-repo> <traza.json> <volcado.json>
 */
import { writeFileSync } from "node:fs";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";
import { direccionesDeFila } from "../src/server/services/detect/precision/direccion-hipotesis.js";
import { startAi6Trace, takeAi6Trace } from "../src/server/services/hypotheses/builder.js";

const [, , dir, outTraza, outVolcado] = process.argv;
if (!dir || !outTraza || !outVolcado) {
  console.error("Uso: npx tsx scripts/an4-embudo.mts <dir-repo> <traza.json> <volcado.json>");
  process.exit(1);
}

const t0 = performance.now();
startAi6Trace();
const a = await analyzeRepo({ dir, repoName: "an4", limits: { maxFindings: "unlimited" } });
const traza = takeAi6Trace();
const wallMs = Math.round(performance.now() - t0);

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

/* Lo PUBLICADO (después del arbitraje) por hallazgo, para cruzar contra la traza. */
const publicado = new Map<string, string>();
for (const f of findings) {
  const h = f.hypotheses.find((x) => x.pattern === "Builder");
  if (h) publicado.set(f.id, h.state);
}
const pasadas = new Map<string, number>();
for (const e of traza) pasadas.set(e.findingId, (pasadas.get(e.findingId) ?? 0) + 1);

writeFileSync(
  outTraza,
  JSON.stringify(
    {
      dir,
      wallMs,
      entradas: traza.length,
      hallazgosDistintos: pasadas.size,
      /* TODAS las pasadas, en orden: la pregunta de mecanismo se contesta comparando la pasada 1 con la última. */
      traza: traza.map((e, i) => ({ ...e, orden: i, pasadasDeEsteHallazgo: pasadas.get(e.findingId) ?? 0, publicado: publicado.get(e.findingId) ?? null })),
    },
    null,
    1,
  ),
);
console.log(`${dir}: ${findings.length} hallazgos · traza ${traza.length} entradas sobre ${pasadas.size} hallazgos · ${wallMs} ms`);
