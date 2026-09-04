/**
 * AE12 — EL EMBUDO del ancla-fuerza de Prototype, condición por condición,
 * SIN volver a correr `analyzeRepo`.
 *
 * POR QUÉ EXISTE ESTA SEGUNDA VERSIÓN: `ae12-embudo.mts` corre el pipeline
 * entero sólo para conseguir el grafo, y con doce frentes midiendo a la vez el
 * semáforo (`con-analisis.sh`, 4 cupos) hace que esa corrida quede en cola
 * indefinidamente. Ésta parsea los archivos UNA vez (`resolveLiveFileUnit`, el
 * mismo mecanismo que `crossAnalyze` usa para darle árbol vivo a una
 * hipótesis) y toma el grafo de un VOLCADO YA EXISTENTE
 * (`scratchpad-ac3/grafos/<slug>.json`, heredado de la Ola AC y usado SIN
 * tocarlo — el mismo insumo, por el mismo motivo, que usó AD4).
 *
 * LO QUE ESO CUESTA, DECLARADO: el ÁRBOL es el de hoy y el GRAFO es el de la
 * Ola AC. Sirve para medir PROPORCIONES del embudo (cuánto descarta cada
 * condición), no para publicar el número absoluto de hallazgos — ése sale del
 * volcado de producción con `dump-hallazgos.mts`, que corre sobre el árbol de
 * hoy de punta a punta.
 *
 * Uso: npx tsx scripts/ae12-embudo2.mts <dir-del-repo> <grafo.json> <salida.json>
 */
import { readFileSync, writeFileSync } from "node:fs";

import { collectFiles, resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import {
  ASSEMBLY_SITE_BUDGET,
  MIN_COINCIDENT_SLOTS,
  MIN_REBUILDING_PLACES,
  assemblyGraphFacts,
  assemblySitesOf,
  assembledInsideOwnType,
  copyProtocolExists,
  groupAssemblies,
  sharedAssemblyDoorReach,
  symbolNodeIdOf,
} from "../src/server/services/detect/intra-file/repeated-configured-assembly.js";
import type { CodeGraph, CodeGraphEdge, CodeGraphNode } from "../src/server/services/graph/types.js";

const [, , dir, grafoPath, out] = process.argv;
if (!dir || !grafoPath || !out) {
  console.error("Uso: npx tsx scripts/ae12-embudo2.mts <dir> <grafo.json> <salida.json>");
  process.exit(1);
}

interface VolcadoNodo {
  id: string;
  file: string;
  symbolPath: string[];
  family?: string;
  startLine?: number;
  endLine?: number;
}

const volcado = JSON.parse(readFileSync(grafoPath, "utf8")) as { nodes: VolcadoNodo[]; edges: CodeGraphEdge[] };
const nodes: CodeGraphNode[] = volcado.nodes.map((n) => ({
  id: n.id,
  kind: n.id.startsWith("sym:") ? "symbol" : n.id.startsWith("file:") ? "file" : "folder",
  file: n.file,
  symbolPath: n.symbolPath,
  family: n.family as CodeGraphNode["family"],
  startLine: n.startLine,
  endLine: n.endLine,
}));
const graph = { nodes, edges: volcado.edges, resolution: {} } as unknown as CodeGraph;
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
  conMediaPuerta: 0,
};
const emitidos: unknown[] = [];

const files = await collectFiles(dir);
for (const f of files) {
  const live = await resolveLiveFileUnit(dir, f.path);
  if (!live) continue;
  try {
    pasos.archivos++;
    const sites = assemblySitesOf(live.unit.root, live.unit.sets, ASSEMBLY_SITE_BUDGET);
    pasos.sitios += sites.length;
    for (const group of groupAssemblies(sites)) {
      if (group.sites.length < 2) continue;
      pasos.gruposBase++;
      if (!facts.classNodesByName.has(group.typeName)) continue;
      pasos.conTipoReal++;
      if (group.places.length < MIN_REBUILDING_PLACES) continue;
      pasos.c1_lugares++;
      if (group.coincident.length < MIN_COINCIDENT_SLOTS) continue;
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
        ...new Set(group.sites.filter((s) => s.ownerSymbolPath.length > 0).map((s) => symbolNodeIdOf(live.unit.path, s.ownerSymbolPath))),
      ];
      const reach = sharedAssemblyDoorReach(facts, group.typeName, ownerIds);
      if (reach >= 2) {
        pasos.r2_puerta_compartida++;
        continue;
      }
      pasos.emitidos++;
      if (reach === 1) pasos.conMediaPuerta++;
      emitidos.push({
        file: live.unit.path,
        tipo: group.typeName,
        puntos: group.places,
        ranuras: group.slotKeys.length,
        coincidentes: group.coincident.map((c) => `${c.key}=${c.value}`),
        varian: group.varyingKeys,
        lineas: group.sites.map((s) => `${s.startLine}-${s.endLine}`),
        doorReach: reach,
      });
    }
  } finally {
    live.release();
  }
}

writeFileSync(out, JSON.stringify({ dir, grafo: grafoPath, pasos, emitidos }, null, 2));
console.log(JSON.stringify({ dir, pasos }, null, 2));
