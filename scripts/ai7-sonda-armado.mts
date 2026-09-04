/**
 * SONDA AI7 (Ola AI) — COTA SUPERIOR, sin grafo, del camino de ARMADO sobre el
 * ancla `duplication`.
 *
 * Revive los archivos que nombra cada hallazgo `duplication` de un volcado y
 * corre, con las MISMAS funciones que el detector `repeated-configured-assembly`
 * exporta, la mitad AST del camino nuevo de `hypotheses/prototype.ts`:
 *
 *   (i)   `ctx.fileAt` — ¿el archivo revive con árbol vivo?
 *   (ii)  `assemblySitesOf`/`groupAssemblies` — ¿hay grupos de armado?
 *   (iii) el gate de ubicación — ¿algún grupo solapa >= 2 rangos del ancla?
 *   (iv)  los TRES `required` de escala de AE12, calcados: >= 3 puntos,
 *         >= 3 ranuras coincidentes, variación en minoría.
 *   (v)   R3 (`assembledInsideOwnType`), la única de las tres compuertas de
 *         resolución que NO necesita grafo.
 *
 * ES UNA COTA SUPERIOR, no el número de producción: R1 (`copyProtocolExists`),
 * R2 (`sharedAssemblyDoorReach >= 2`), la compuerta de construcción
 * (`classNodesByName`) y la de doble conteo necesitan el grafo del repo y la
 * corrida real. Lo que salga de acá SÓLO puede bajar.
 *
 * No toca producción. Uso:
 *   npx tsx scripts/ai7-sonda-armado.mts <dirRepo> <dump.json>
 */
import { readFileSync } from "node:fs";

import { resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import {
  ASSEMBLY_SITE_BUDGET,
  MIN_COINCIDENT_SLOTS,
  MIN_REBUILDING_PLACES,
  assembledInsideOwnType,
  assemblySitesOf,
  groupAssemblies,
} from "../src/server/services/detect/intra-file/repeated-configured-assembly.js";
import type { FileUnit } from "../src/server/services/detect/types.js";

const [, , dir, dumpPath] = process.argv;
if (!dir || !dumpPath) {
  console.error("uso: npx tsx scripts/ai7-sonda-armado.mts <dirRepo> <dump.json>");
  process.exit(1);
}

interface DumpFinding {
  id: string;
  kind: string;
  where: string[];
  hypotheses: { pattern: string; state: string }[];
}
const dump = JSON.parse(readFileSync(dumpPath, "utf8")) as { findings: DumpFinding[] };
const dups = dump.findings.filter((f) => f.kind === "duplication");

/** Los rangos que el ancla señala por archivo. El volcado sólo guarda `file:startLine`, así que el
 *  rango es de UNA fila: es la lectura CONSERVADORA (menos solapamiento, nunca más). */
function rangosPorArchivo(f: DumpFinding): Map<string, [number, number][]> {
  const m = new Map<string, [number, number][]>();
  for (const w of f.where) {
    const i = w.lastIndexOf(":");
    const path = w.slice(0, i);
    const line = Number(w.slice(i + 1));
    const list = m.get(path) ?? [];
    list.push([line, line]);
    m.set(path, list);
  }
  return m;
}

function solapa(a: number, b: number, rangos: readonly (readonly [number, number])[]): boolean {
  return rangos.some(([x, y]) => a <= y && x <= b);
}

const cacheArchivos = new Map<string, FileUnit | null>();
const cacheGrupos = new Map<string, ReturnType<typeof groupAssemblies>>();

async function grupos(path: string): Promise<ReturnType<typeof groupAssemblies> | null> {
  if (!cacheArchivos.has(path)) {
    const live = await resolveLiveFileUnit(dir, path);
    cacheArchivos.set(path, live ? live.unit : null);
    if (live) cacheGrupos.set(path, groupAssemblies(assemblySitesOf(live.unit.root, live.unit.sets, ASSEMBLY_SITE_BUDGET)));
  }
  return cacheArchivos.get(path) ? (cacheGrupos.get(path) ?? []) : null;
}

/** SEGUNDA MEDICIÓN, más ancha: TODOS los grupos de armado de los archivos que el ancla toca,
 *  pasen o no el gate de ubicación. Contesta si lo que mata es el gate de ubicación o la ESCALA. */
const g2 = { archivos: 0, grupos: 0, places3: 0, coinc3: 0, minoria: 0, r3: 0, histoCoinc: {} as Record<string, number> };

const c = {
  hallazgos: 0,
  conArchivoVivo: 0,
  conAlgunGrupo: 0,
  conGrupoSolapado: 0,
  paso_rearmadoEnVariosPuntos: 0,
  paso_estadoInicialCompartido: 0,
  paso_variacionMinoritaria: 0,
  sobrevive_R3: 0,
  yaEmiteHoy: 0,
};
const ejemplos: string[] = [];

for (const f of dups) {
  c.hallazgos++;
  if (f.hypotheses.some((h) => h.pattern === "Prototype")) c.yaEmiteHoy++;
  let vivo = false;
  let algunGrupo = false;
  let mejor: { g: ReturnType<typeof groupAssemblies>[number]; path: string } | null = null;
  let mejorSolape = 0;
  for (const [path, rangos] of rangosPorArchivo(f)) {
    const gs = await grupos(path);
    if (gs === null) continue;
    vivo = true;
    if (gs.length > 0) algunGrupo = true;
    for (const g of gs) {
      const overlap = g.sites.filter((s) => solapa(s.startLine, s.endLine, rangos)).length;
      if (overlap >= 2 && overlap > mejorSolape) {
        mejorSolape = overlap;
        mejor = { g, path };
      }
    }
  }
  if (vivo) c.conArchivoVivo++;
  if (algunGrupo) c.conAlgunGrupo++;
  if (!mejor) continue;
  c.conGrupoSolapado++;
  const g = mejor.g;
  if (g.places.length < MIN_REBUILDING_PLACES) continue;
  c.paso_rearmadoEnVariosPuntos++;
  if (g.coincident.length < MIN_COINCIDENT_SLOTS) continue;
  c.paso_estadoInicialCompartido++;
  const varying = g.varyingKeys.length;
  if (!(varying >= 1 && varying * 2 <= g.slotKeys.length)) continue;
  c.paso_variacionMinoritaria++;
  if (assembledInsideOwnType(g)) continue;
  c.sobrevive_R3++;
  if (ejemplos.length < 40) ejemplos.push(`${f.id} | ${mejor.path}:${g.sites.map((s) => s.startLine).join(",")} | ${g.typeName} | ${g.places.length}p ${g.coincident.length}/${g.slotKeys.length}coinc`);
}

for (const [path, file] of cacheArchivos) {
  if (!file) continue;
  g2.archivos++;
  for (const g of cacheGrupos.get(path) ?? []) {
    g2.grupos++;
    const k = String(Math.min(g.coincident.length, 6));
    g2.histoCoinc[k] = (g2.histoCoinc[k] ?? 0) + 1;
    if (g.places.length < MIN_REBUILDING_PLACES) continue;
    g2.places3++;
    if (g.coincident.length < MIN_COINCIDENT_SLOTS) continue;
    g2.coinc3++;
    const v = g.varyingKeys.length;
    if (!(v >= 1 && v * 2 <= g.slotKeys.length)) continue;
    g2.minoria++;
    if (assembledInsideOwnType(g)) continue;
    g2.r3++;
    if (ejemplos.length < 60) ejemplos.push(`ANCHO ${path}:${g.sites.map((s) => s.startLine).join(",")} | ${g.typeName} | ${g.places.length}p ${g.coincident.length}/${g.slotKeys.length}coinc`);
  }
}

console.log(JSON.stringify({ dir, conteo: c, anchos: g2, ejemplos }, null, 1));
