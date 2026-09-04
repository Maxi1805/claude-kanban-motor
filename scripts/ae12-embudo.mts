/**
 * AE12 — EL EMBUDO del ancla-fuerza de Prototype, condición por condición.
 *
 * SÓLO LECTURA sobre el código del usuario: corre el pipeline de producción
 * (`analyzeRepo` con `onGraph`, igual que `dump-graph-census.mts`) para
 * obtener el MISMO grafo que ve el detector, y después re-resuelve cada
 * archivo con `resolveLiveFileUnit` (el mismo mecanismo que `crossAnalyze`
 * usa para darle árbol vivo a una hipótesis) para contar cuántos candidatos
 * descarta CADA condición por separado — el número que la receta pide y que
 * el volcado de producción no puede dar (sólo publica lo que sobrevive).
 *
 * Uso: npx tsx scripts/ae12-embudo.mts <dir-del-repo> <salida.json>
 */
import { writeFileSync } from "node:fs";

import { analyzeRepo, collectFiles, resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import {
  assemblyGraphFacts,
  assemblySitesOf,
  assembledInsideOwnType,
  copyProtocolExists,
  groupAssemblies,
  sharedAssemblyDoorReach,
  MIN_COINCIDENT_SLOTS,
  MIN_REBUILDING_PLACES,
} from "../src/server/services/detect/intra-file/repeated-configured-assembly.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";

const [, , dir, out] = process.argv;
if (!dir || !out) {
  console.error("Uso: npx tsx scripts/ae12-embudo.mts <dir> <salida.json>");
  process.exit(1);
}

let graph: CodeGraph | null = null;
await analyzeRepo({
  dir,
  repoName: "ae12",
  limits: { maxFindings: "unlimited" },
  onGraph: (r) => {
    graph = r.graph;
  },
});
if (!graph) {
  console.error("sin grafo: no hay nada que medir");
  process.exit(2);
}
const facts = assemblyGraphFacts(graph);

const pasos = {
  archivos: 0,
  sitios: 0,
  gruposBase: 0,
  conTipoReal: 0,
  c1_lugares: 0,
  c2_coincidentes: 0,
  c3a_varia_algo: 0,
  c3b_varia_minoria: 0,
  r3_dentro_del_tipo: 0,
  r1_protocolo_existe: 0,
  r2_puerta_compartida: 0,
  emitidos: 0,
};
const emitidos: unknown[] = [];
const mediaPuerta: unknown[] = [];
/** Diagnóstico: qué nombres agrupan y NO resuelven a un `class-like` del grafo (¿la compuerta de construcción descarta bien?). */
const sinTipo = new Map<string, number>();
/** Diagnóstico: los que SÍ resuelven a un tipo pero mueren en ESCALA, con su número de puntos/ranuras. */
const murioEnEscala: unknown[] = [];

const files = await collectFiles(dir);
for (const f of files) {
  const live = await resolveLiveFileUnit(dir, f.path);
  if (!live) continue;
  try {
    pasos.archivos++;
    const sites = assemblySitesOf(live.unit.root, live.unit.sets, 4000);
    pasos.sitios += sites.length;
    for (const group of groupAssemblies(sites)) {
      if (group.sites.length < 2) continue;
      pasos.gruposBase++;
      if (!facts.classNodesByName.has(group.typeName)) {
        sinTipo.set(group.typeName, (sinTipo.get(group.typeName) ?? 0) + 1);
        continue;
      }
      pasos.conTipoReal++;
      if (group.places.length < MIN_REBUILDING_PLACES) {
        murioEnEscala.push({ file: live.unit.path, tipo: group.typeName, puntos: group.places.length, sitios: group.sites.length, ranuras: group.slotKeys.length, coincidentes: group.coincident.length });
        continue;
      }
      pasos.c1_lugares++;
      if (group.coincident.length < MIN_COINCIDENT_SLOTS) {
        murioEnEscala.push({ file: live.unit.path, tipo: group.typeName, puntos: group.places.length, ranuras: group.slotKeys.length, coincidentes: group.coincident.length, murioEn: "coincidentes" });
        continue;
      }
      pasos.c2_coincidentes++;
      if (group.varyingKeys.length < 1) continue;
      pasos.c3a_varia_algo++;
      if (group.varyingKeys.length * 2 > group.slotKeys.length) continue;
      pasos.c3b_varia_minoria++;
      if (assembledInsideOwnType(group)) {
        pasos.r3_dentro_del_tipo++;
        continue;
      }
      if (copyProtocolExists(facts, group.typeName)) {
        pasos.r1_protocolo_existe++;
        continue;
      }
      const ownerIds = [
        ...new Set(
          group.sites.filter((s) => s.ownerSymbolPath.length > 0).map((s) => `sym:${live.unit.path}#${s.ownerSymbolPath.join(".")}`),
        ),
      ];
      const reach = sharedAssemblyDoorReach(facts, group.typeName, ownerIds);
      if (reach >= 2) {
        pasos.r2_puerta_compartida++;
        continue;
      }
      pasos.emitidos++;
      const row = {
        file: live.unit.path,
        tipo: group.typeName,
        puntos: group.places,
        ranuras: group.slotKeys.length,
        coincidentes: group.coincident.map((c) => `${c.key}=${c.value}`),
        varian: group.varyingKeys,
        lineas: group.sites.map((s) => `${s.startLine}-${s.endLine}`),
        doorReach: reach,
      };
      emitidos.push(row);
      if (reach === 1) mediaPuerta.push(row);
    }
  } finally {
    live.release();
  }
}

const sinTipoTop = [...sinTipo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
writeFileSync(out, JSON.stringify({ dir, pasos, mediaPuerta: mediaPuerta.length, emitidos, sinTipoTop, murioEnEscala }, null, 2));
console.log(JSON.stringify({ dir, pasos }, null, 2));
