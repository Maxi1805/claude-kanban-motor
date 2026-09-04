/**
 * AUDITORÍA DE LA COMPUERTA (integración Ola J, punto 5 del encargo).
 *
 * La compuerta pasó a filtrar por vigencia (`stillPresent`) — el cambio que la
 * pondría verde. La pregunta a contestar NO es "¿pasa el test que J2 escribió?"
 * sino "¿se puede usar este filtro para esconder una regresión?".
 *
 * Se prueba sobre las PLANILLAS REALES del corpus (no fixtures sintéticas),
 * fabricando a mano cada forma de regresión y viendo si la compuerta la nota.
 */
import { readPrecisionCsv } from "../src/server/services/detect/precision/verdicts-io.js";
import { evaluateGate, PRECISION_FLOOR, MIN_JUDGED } from "../src/server/services/detect/precision/gate-logic.js";
import type { PrecisionRow } from "../src/server/services/detect/precision/types.js";
import { readdirSync } from "node:fs";

const DIR = "/home/maxi1805/claude-kanban/tests/golden/precision";
const files = readdirSync(DIR).filter((f) => f.endsWith(".verdicts.csv"));
const rows: PrecisionRow[] = files.flatMap((f) => readPrecisionCsv(`${DIR}/${f}`));
console.log(`Planillas leídas: ${files.length} · filas: ${rows.length}`);

const base = evaluateGate(rows);
console.log(`\nBASE (datos reales tal cual están hoy)`);
console.log(`  kinds vivos: ${base.live.length} · kinds históricos: ${base.historical.length}`);
console.log(`  brokenPrecision (< ${PRECISION_FLOOR * 100}% con >= ${MIN_JUDGED} juzgados): ${base.brokenPrecision.length}`);
console.log(`    ${base.brokenPrecision.map((r) => `${r.kind} ${Math.round((r.precision ?? 0) * 100)}% (n=${r.judged})`).join("\n    ")}`);
console.log(`  disappeared: ${base.disappeared.length} — ${base.disappeared.map((d) => d.kind).join(", ") || "(ninguno)"}`);

function clone(rs: readonly PrecisionRow[]): PrecisionRow[] {
  return rs.map((r) => ({ ...r }));
}

// ── ESCENARIO 1 (el que pide el encargo) — un kind BUENO desaparece del todo.
// Elegimos el kind vigente con mejor precisión y más juzgados: si el detector
// dejara de emitirlo, ¿la compuerta lo nota o pasa en silencio?
const candidato = [...base.live]
  .filter((r) => r.judged >= MIN_JUDGED && (r.precision ?? 0) >= 0.8)
  .sort((a, b) => b.judged - a.judged)[0];
console.log(`\n=== ESCENARIO 1 — desaparición TOTAL de un kind sano ===`);
console.log(`  víctima: ${candidato.kind} (hoy ${Math.round((candidato.precision ?? 0) * 100)}% con ${candidato.judged} juzgados vivos)`);
{
  const sabotaje = clone(rows).map((r) => (r.kind === candidato.kind ? { ...r, stillPresent: false } : r));
  const g = evaluateGate(sabotaje);
  const notado = g.disappeared.some((d) => d.kind === candidato.kind);
  console.log(`  ¿aparece en 'disappeared'?  ${notado ? "SÍ — la compuerta lo nota" : "NO — SE ESCONDIÓ"}`);
  console.log(`  ¿aparece en 'brokenPrecision'? ${g.brokenPrecision.some((r) => r.kind === candidato.kind) ? "sí" : "no (esperado: ya no tiene filas vivas)"}`);
  if (notado) {
    const d = g.disappeared.find((x) => x.kind === candidato.kind)!;
    console.log(`  reporta histórico: ${d.historicalJudged} juzgados, ${Math.round(d.historicalPrecision * 100)}% — el número viejo viaja con el aviso`);
  }
}

// ── ESCENARIO 2 — el agujero real: el kind SIGUE VIVO pero se le mueren
// TODOS los veredictos (el detector cambió de forma y los ids/contenidos
// juzgados ya no salen; los que sí salen nadie los juzgó todavía).
console.log(`\n=== ESCENARIO 2 — el kind sigue emitiendo, pero se mueren todos sus juicios ===`);
{
  const victima = candidato.kind;
  const sabotaje = clone(rows).map((r) => {
    if (r.kind !== victima) return r;
    // los juzgados se mueren; queda viva UNA fila sin juzgar (el detector sigue emitiendo)
    return r.verdict !== "" ? { ...r, stillPresent: false } : r;
  });
  const vivasSinJuzgar = sabotaje.filter((r) => r.kind === victima && r.stillPresent).length;
  const g = evaluateGate(sabotaje);
  console.log(`  ${victima}: quedan ${vivasSinJuzgar} filas vivas (todas sin juzgar), 0 juicios vivos`);
  console.log(`  ¿aparece en 'disappeared'?    ${g.disappeared.some((d) => d.kind === victima) ? "SÍ" : "NO"}`);
  console.log(`  ¿aparece en 'brokenPrecision'? ${g.brokenPrecision.some((r) => r.kind === victima) ? "SÍ" : "NO"}`);
  console.log(`  ¿aparece en 'basisLost'?      ${g.basisLost.some((b) => b.kind === victima) ? "SÍ" : "NO"}`);
  const escondido =
    !g.disappeared.some((d) => d.kind === victima) &&
    !g.brokenPrecision.some((r) => r.kind === victima) &&
    !g.basisLost.some((b) => b.kind === victima);
  console.log(`  VEREDICTO: ${escondido ? "AGUJERO — la compuerta NO lo nota por ninguna vía" : "cubierto (basisLost)"}`);
}

// ── ESCENARIO 3 — la muestra viva juzgada se encoge por debajo del piso de
// base (MIN_JUDGED) mientras la precisión se desploma a 0%.
console.log(`\n=== ESCENARIO 3 — precisión al 0% pero con menos de ${MIN_JUDGED} juicios vivos ===`);
{
  // Víctima distinta a la del escenario 1: hace falta un kind que TENGA
  // veredictos `falso` vivos para poder dejar unos pocos y hundir la precisión.
  const victima = [...base.live]
    .filter((r) => r.judged >= MIN_JUDGED && r.falsePositive >= MIN_JUDGED - 1 && (r.precision ?? 0) >= 0.5)
    .sort((a, b) => b.judged - a.judged)[0].kind;
  console.log(`  víctima: ${victima}`);
  let dejados = 0;
  const sabotaje = clone(rows).map((r) => {
    if (r.kind !== victima || r.verdict === "") return r;
    if (r.verdict === "falso" && dejados < MIN_JUDGED - 1) {
      dejados++;
      return r; // deja vivos unos pocos falsos → precisión viva = 0%
    }
    return { ...r, stillPresent: false };
  });
  const g = evaluateGate(sabotaje);
  const rep = g.live.find((r) => r.kind === victima);
  console.log(`  ${victima} vivo: ${rep?.judged} juzgados, precisión ${rep?.precision === null ? "—" : Math.round((rep!.precision ?? 0) * 100) + "%"}`);
  console.log(`  ¿aparece en 'brokenPrecision'? ${g.brokenPrecision.some((r) => r.kind === victima) ? "SÍ" : "NO"}`);
  console.log(`  ¿aparece en 'disappeared'?    ${g.disappeared.some((d) => d.kind === victima) ? "SÍ" : "NO"}`);
  console.log(`  ¿aparece en 'basisLost'?      ${g.basisLost.some((b) => b.kind === victima) ? "SÍ" : "NO"}`);
  const escondido =
    !g.disappeared.some((d) => d.kind === victima) &&
    !g.brokenPrecision.some((r) => r.kind === victima) &&
    !g.basisLost.some((b) => b.kind === victima);
  console.log(`  VEREDICTO: ${escondido ? "AGUJERO — 0% de precisión viva que la compuerta no reporta" : "cubierto (basisLost)"}`);
}

// ── ESCENARIO 4 — el que MOTIVÓ el cambio, al revés: marcar TODO como muerto.
console.log(`\n=== ESCENARIO 4 — todo muerto (el sabotaje máximo del filtro por vigencia) ===`);
{
  const sabotaje = clone(rows).map((r) => ({ ...r, stillPresent: false }));
  const g = evaluateGate(sabotaje);
  console.log(`  brokenPrecision: ${g.brokenPrecision.length} (compuerta verde) · disappeared: ${g.disappeared.length}`);
  console.log(`  VEREDICTO: ${g.disappeared.length > 0 ? "cubierto — el filtro no puede vaciar la compuerta sin gritar" : "AGUJERO — se puede vaciar la compuerta en silencio"}`);
}

// ── MEDICIÓN SOBRE DATOS REALES del agujero del escenario 2/3: ¿cuántos kinds
// tienen HOY base histórica suficiente pero base VIVA insuficiente? Ésos son
// los que la compuerta dejó de mirar al pasar a filtrar por vigencia.
console.log(`\n=== ¿El agujero ya está abierto en los datos de hoy? ===`);
{
  const liveByKind = new Map(base.live.map((r) => [r.kind, r]));
  const perdidos = base.historical
    .filter((h) => h.judged >= MIN_JUDGED)
    .map((h) => ({ h, l: liveByKind.get(h.kind) }))
    .filter(({ l }) => !l || l.judged < MIN_JUDGED);
  console.log(`  kinds con >= ${MIN_JUDGED} juicios históricos y < ${MIN_JUDGED} juicios VIVOS: ${perdidos.length}`);
  for (const { h, l } of perdidos) {
    console.log(
      `    ${h.kind}: histórico ${h.truePositive}/${h.judged} (${Math.round((h.precision ?? 0) * 100)}%) → vivo ${l ? `${l.truePositive}/${l.judged}` : "sin filas"} · ¿reportado hoy? ${base.disappeared.some((d) => d.kind === h.kind) ? "sí (disappeared)" : base.basisLost.some((b) => b.kind === h.kind) ? "sí (basisLost)" : "NO"}`,
    );
  }
}
