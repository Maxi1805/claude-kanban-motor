/**
 * V1 (Ola V) — A/B de la PASADA DE GRAFO DE LAS HIPÓTESIS, dentro del MISMO
 * proceso y sobre el MISMO árbol.
 *
 * POR QUÉ NO ALCANZA CON DOS VOLCADOS SEPARADOS EN EL TIEMPO. Siete frentes
 * editan `src/` durante la misma ola. Medido: entre mi volcado "antes" y mi
 * volcado "después" de `corpus/click` cambiaron `hypotheses/command.ts` e
 * `hypotheses/iterator.ts`, y la ÚNICA diferencia del volcado (una hipótesis
 * de Command retirada) era de ELLOS, no mía. Un A/B separado por reloj mide
 * "lo que pasó en el árbol", no "lo que hizo mi cambio".
 *
 * QUÉ HACE. Corre `analyzeRepo` (NO `analyzeRepoCached`: el caché está
 * clavado por SHA + huella del analizador, y la huella NO incluye el entorno,
 * así que la segunda corrida devolvería la primera) dos veces seguidas sobre
 * el mismo repo, con `CK_HIPOTESIS_CON_GRAFO` en `0` y en `1`. Lo único que
 * cambia entre las dos corridas es ese interruptor. Todo lo demás —el árbol,
 * los otros frentes, el corpus— es idéntico por construcción.
 *
 * SALIDA: un JSON con las dos poblaciones de hipótesis (fila por
 * `hallazgo × patrón`) y el volumen del nivel 1 por kind de las dos, para
 * poder afirmar (no suponer) que el nivel 1 no se movió.
 *
 * Uso: npx tsx scripts/v1-ab.mts <dir> <salida.json>
 */
import { writeFileSync } from "node:fs";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";

const [, , dir, out] = process.argv;
if (!dir || !out) {
  console.error("Uso: npx tsx scripts/v1-ab.mts <dir> <salida.json>");
  process.exit(1);
}

interface Fila {
  id: string;
  kind: string;
  pattern: string;
  state: string;
  where: string;
  /** `null` cuando el estado no es una oportunidad — mismo criterio que `engine.ts`. */
  confidence: string | null;
  /**
   * Cuántos checks/discriminadores PUBLICADOS de esta hipótesis dicen, con
   * todas las letras, que no pudieron evaluarse por falta de grafo. Es la
   * medida directa de lo que esta ola arregla: un check así no es "no está",
   * es "no miré", y el producto lo muestra igual.
   */
  sinGrafo: number;
  /** Checks confirmados (los tres roles juntos) — para ver si la evidencia se movió aunque el estado no. */
  confirmados: number;
}

async function corrida(conGrafo: boolean): Promise<{ filas: Fila[]; porKind: Record<string, number>; total: number; ms: number }> {
  process.env.CK_HIPOTESIS_CON_GRAFO = conGrafo ? "1" : "0";
  const t0 = performance.now();
  const a = await analyzeRepo({ dir, repoName: "v1-ab", limits: { maxFindings: "unlimited" } });
  const ms = Math.round(performance.now() - t0);
  const filas: Fila[] = [];
  const porKind: Record<string, number> = {};
  for (const f of a.findings) {
    porKind[f.kind] = (porKind[f.kind] ?? 0) + 1;
    const id = f.id ?? stableFindingId(f);
    const where = f.locations[0] ? `${f.locations[0].file}:${f.locations[0].startLine}` : "";
    for (const h of f.hypotheses ?? []) {
      const todos = [...(h.checks ?? []), ...(h.discriminators ?? [])];
      filas.push({
        id,
        kind: f.kind,
        pattern: h.pattern,
        state: h.state,
        where,
        confidence: h.confidence ?? null,
        sinGrafo: todos.filter((c) => /sin grafo/i.test(c.why ?? "")).length,
        confirmados: todos.filter((c) => c.passed).length,
      });
    }
  }
  return { filas, porKind, total: a.findings.length, ms };
}

// Orden deliberado: primero SIN la pasada (la línea base), después CON ella.
// Al revés, cualquier caché perezoso que la pasada caliente (parsers de
// `resolveLanguage`) le regalaría tiempo a la corrida de referencia.
const sin = await corrida(false);
const con = await corrida(true);

const clave = (f: Fila) => `${f.id}|${f.pattern}`;
const mapSin = new Map(sin.filas.map((f) => [clave(f), f] as const));
const mapCon = new Map(con.filas.map((f) => [clave(f), f] as const));
const retiradas = [...mapSin.values()].filter((f) => !mapCon.has(clave(f)));
const nuevas = [...mapCon.values()].filter((f) => !mapSin.has(clave(f)));
const cambian = [...mapCon.values()]
  .filter((f) => mapSin.has(clave(f)) && mapSin.get(clave(f))!.state !== f.state)
  .map((f) => ({ ...f, estadoPrevio: mapSin.get(clave(f))!.state }));

const cambiaConfianza = [...mapCon.values()]
  .filter((f) => mapSin.has(clave(f)) && mapSin.get(clave(f))!.confidence !== f.confidence)
  .map((f) => ({ ...f, confianzaPrevia: mapSin.get(clave(f))!.confidence }));
const dejanDeDecirSinGrafo = [...mapCon.values()].filter(
  (f) => (mapSin.get(clave(f))?.sinGrafo ?? 0) > 0 && f.sinGrafo === 0,
);
const suma = (fs: readonly Fila[], campo: "sinGrafo" | "confirmados") => fs.reduce((a, f) => a + f[campo], 0);
const reales = (fs: readonly Fila[]) => fs.filter((f) => f.state === "ausente" || f.state === "parcial").length;

const kinds = [...new Set([...Object.keys(sin.porKind), ...Object.keys(con.porKind)])].sort();
const nivel1Movido = kinds.filter((k) => (sin.porKind[k] ?? 0) !== (con.porKind[k] ?? 0));

writeFileSync(
  out,
  JSON.stringify({ dir, sin, con, retiradas, nuevas, cambian, cambiaConfianza, dejanDeDecirSinGrafo, nivel1Movido }, null, 1),
);
console.log(
  `${dir}: nivel1 ${sin.total} → ${con.total} (kinds movidos: ${nivel1Movido.length}) · ` +
    `hipótesis ${sin.filas.length} → ${con.filas.length} (REALES ${reales(sin.filas)} → ${reales(con.filas)}) · ` +
    `retiradas ${retiradas.length} · nuevas ${nuevas.length} · cambian estado ${cambian.length} · cambian confianza ${cambiaConfianza.length} · ` +
    `checks "sin grafo" ${suma(sin.filas, "sinGrafo")} → ${suma(con.filas, "sinGrafo")} (hipótesis que dejan de decirlo: ${dejanDeDecirSinGrafo.length}) · ` +
    `checks confirmados ${suma(sin.filas, "confirmados")} → ${suma(con.filas, "confirmados")} · ` +
    `${sin.ms}ms → ${con.ms}ms`,
);
