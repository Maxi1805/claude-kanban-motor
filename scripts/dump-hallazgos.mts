/**
 * Volcado compartido: corre `analyzeRepo` UNA vez sobre una población y deja en JSON
 * todos los hallazgos con su ubicación y las hipótesis colgadas.
 *
 * Existe para que varios agentes no tengan que correr `analyzeRepo` cada uno sólo para
 * explorar: la exploración se hace sobre el archivo, y cada uno corre el análisis real
 * únicamente para verificar SU arreglo.
 *
 * `id` — AGREGADO EN LA INTEGRACIÓN DE LA OLA H, y no es cosmético: es el MISMO
 * `stableFindingId` con el que `tests/golden/precision/*.verdicts.csv` referencia cada
 * fila juzgada (ver `detect/precision/sample.ts#withStableIds`). Sin él, un volcado no se
 * puede cruzar contra la planilla de veredictos, y esa cruza es la ÚNICA forma de
 * responder "de lo que el detector emite HOY, ¿cuánto está juzgado y cuánto de eso es
 * verdadero?" — la pregunta del eje 1. La columna `stillPresent` de la planilla NO sirve
 * para eso: la escribe `mergeRows` comparando contra la MUESTRA de la corrida (hasta `n`
 * por kind), no contra el pool completo, así que un hallazgo vivo que simplemente no salió
 * sorteado esa vez queda marcado como ausente.
 *
 * `at` — AGREGADO POR EL FRENTE AJ2 DE LA OLA AJ, y por la misma razón que el `id`: sin él,
 * un volcado NO PUEDE nombrar dos propuestas del mismo patrón en la misma fila. Desde la Ola
 * AC una fila agrupada cuelga las hipótesis de TODOS sus miembros
 * (`code-analyzer.ts#hypothesesOfAllMembers`), así que `{pattern, state}` a secas colapsa N
 * propuestas de N lugares distintos del código en una sola entrada indistinguible — medido:
 * `click · long-function:_c7REnnTm-LveJA_ · Extract Method` son 14 propuestas sobre 14
 * funciones de `src/click/core.py` bajo UNA clave. `at` es la DIRECCIÓN de cada propuesta
 * dentro de su fila (`detect/precision/direccion-hipotesis.ts`), y con ella la clave de
 * veredicto pasa a ser `<id>@<at>::<Patrón>`. **Es un campo NUEVO: la forma vieja de la clave
 * sigue siendo válida y sigue resolviendo, así que ningún consumidor viejo cambia.**
 *
 * Uso: npx tsx scripts/dump-hallazgos.mts <dir> <salida.json>
 */
import { writeFileSync } from "node:fs";

import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";
import { direccionesDeFila } from "../src/server/services/detect/precision/direccion-hipotesis.js";

const [, , dir, out] = process.argv;
if (!dir || !out) {
  console.error("Uso: npx tsx scripts/dump-hallazgos.mts <dir> <salida.json>");
  process.exit(1);
}

const t0 = performance.now();
// Caché por SHA + huella del analizador (`analyze-cache.ts`): un agente que vuelve a
// volcar el mismo repo (mismo SHA) sin que el analizador haya cambiado desde la última
// vez lee el resultado en vez de repagar `analyzeRepo`. Verificabilidad: se loguea el
// hit/miss antes del resumen de siempre.
const { analysis: a, cache } = await analyzeRepoCached({
  dir,
  repoName: "dump",
  limits: { maxFindings: "unlimited" },
});
console.error(
  `[analyzer-cache] ${dir}: ${cache.hit ? "HIT" : "MISS"} (${cache.reason}) analyzeMs=${cache.analyzeMs.toFixed(0)}`,
);
const wallMs = Math.round(performance.now() - t0);

const findings = a.findings.map((f) => {
  const hs = f.hypotheses ?? [];
  // La dirección se calcula sobre la fila ENTERA porque el empate no es visible desde UNA
  // hipótesis: hace falta ver a las hermanas del mismo patrón (ver `direccion-hipotesis.ts`).
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

writeFileSync(
  out,
  JSON.stringify({ dir, wallMs, total: findings.length, porKind, findings }, null, 1),
);
console.log(`${out}: ${findings.length} hallazgos, ${Object.keys(porKind).length} kinds, ${wallMs}ms`);
