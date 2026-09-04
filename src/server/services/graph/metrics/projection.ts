/**
 * `projectGraph` — CONTRATO-F4.md §3.1. Ver la nota de proceso en
 * `types.ts`: infraestructura compartida mínima, creada porque
 * `graph/metrics/` no existía.
 *
 * Colapsa un `CodeGraph` (grano carpeta/archivo/símbolo) a la granularidad
 * `p`, quedándose sólo con las aristas de `kinds`. Cada nodo de `g.nodes`
 * aporta su propio id proyectado aunque no tenga aristas — para que un
 * archivo sin referencias siga apareciendo con fan-in/fan-out cero, no
 * ausente (misma disciplina "no aplicable, nunca cero" del resto del
 * contrato, aplicada acá a "sin aristas" en vez de "sin capacidad"). Las
 * auto-aristas que resultan de colapsar dos extremos al mismo id proyectado
 * (dos símbolos del mismo archivo referenciándose entre sí, proyección
 * `file`) se descartan: no aportan señal de impacto ENTRE unidades, que es
 * lo que toda métrica de la tabla del contrato mide.
 */
import { createHash } from "node:crypto";

import { EDGE_KIND_SPECS } from "../edge-kinds.js";
import { edgeIsAmbiguous, type CodeGraph, type CodeGraphNode, type EdgeKind } from "../types.js";
import type { Projection, ProjectedGraph } from "./types.js";

/**
 * "Todas menos `contains`" (CONTRATO-F4.md §3.1) — **DERIVADA del catálogo de
 * `EdgeKind`, nunca copiada a mano**, y por eso vive acá y no en cada métrica.
 *
 * ── POR QUÉ DEJÓ DE SER UNA COPIA POR MÉTRICA ─────────────────────────────
 *
 * Hasta la Ola Q cuatro métricas (`pagerank`, `clustering`, `louvain`,
 * `connected-components`) escribían cada una su propia lista de SIETE kinds,
 * con el comentario "cada métrica es dueña de su propia copia… para no crear
 * una dependencia cruzada por una lista de 7 elementos". La lista era correcta
 * el día que se escribió, cuando el grafo tenía 8 `EdgeKind`. Hoy tiene 12, y
 * las cuatro copias envejecieron JUNTAS y en silencio: ninguna incluía
 * `calls` — que no es una relación nueva ni exótica, es la MISMA cascada que
 * `references`, sólo la partición callee (`graph/build.ts#
 * partitionCandidatesByCallee`, `graph/edge-kinds.ts`). O sea que toda métrica
 * de grafo del proyecto, y todo consumidor que reusaba `edgeKinds` para
 * proyectar (`detect/reach.ts`, `detect/inter-file/fanout-without-cohesion.ts`,
 * `detect/inter-file/distributed-duplication.ts`, `hypotheses/facade.ts`),
 * estaba ciego a las llamadas.
 *
 * Cuatro copias que se rompen a la vez no son cuatro decisiones
 * independientes: son una decisión repetida cuatro veces. La forma derivada la
 * inventó P8 (Ola P) dentro de un detector (`god-component.ts#
 * DEPENDENCY_EDGE_KINDS`), midiéndola, y dejó pedido subirla acá; esto es eso.
 * `Record<EdgeKind, EdgeKindSpec>` es exhaustivo por tipo, así que un
 * `EdgeKind` nuevo entra solo y **no hay una quinta copia que envejecer**.
 *
 * ── LAS DOS QUE SE RESTAN, con su razón ───────────────────────────────────
 *
 *  - `contains`: contención estructural (carpeta→archivo→símbolo), declarada
 *    siempre y para todo. No es una dependencia entre unidades; contarla haría
 *    que cada archivo dependiera de todos sus propios símbolos. Es la
 *    exclusión que el contrato ya nombra.
 *  - `affects`: `attachFindingNodes` (CONTRATO-F9.md §2.2) cuelga un nodo
 *    `finding` de los símbolos que un hallazgo toca. Su origen no es el código
 *    sino un hallazgo YA calculado, así que contarla sería medir la salida del
 *    analizador como si fuera estructura del repo — y encima cambiaría la
 *    respuesta de una métrica según cuántos hallazgos hubo. Se resta por
 *    definición, no por conveniencia: en la proyección que se usa durante la
 *    detección todavía no existe ninguna. Misma resta, y misma razón, que
 *    `DEPENDENCY_EDGE_KINDS` dejó medida.
 */
export const EDGE_KINDS_EXCEPT_CONTAINS: readonly EdgeKind[] = (Object.keys(EDGE_KIND_SPECS) as EdgeKind[]).filter(
  (k) => k !== "contains" && k !== "affects",
);

export function projectGraph(g: CodeGraph, p: Projection, kinds: readonly EdgeKind[]): ProjectedGraph {
  // `CodeGraph` es SÓLO DATOS (docstring de `../types.ts`): los índices son
  // responsabilidad de quien lo consume. Éste es el único que necesita
  // `projectGraph`, local a esta llamada — no se cachea entre proyecciones
  // distintas del mismo grafo porque O(nodes) es barato frente al resto.
  const nodeById = new Map(g.nodes.map((n) => [n.id, n]));
  const keyOf = projectionKeyFn(g, p);
  const kindSet = new Set(kinds);

  const idSet = new Set<string>();
  for (const n of g.nodes) idSet.add(keyOf(n));

  // from(id proyectado) -> to(id proyectado) -> peso acumulado
  const collapsed = new Map<string, Map<string, number>>();
  for (const e of g.edges) {
    if (!kindSet.has(e.kind)) continue;
    // CONTRATO-F9.md §4.5 — regla de seguridad no negociable: las aristas
    // `ambiguous` quedan FUERA de toda proyección por defecto (`edgeIsAmbiguous`,
    // `graph/types.ts`), para que ninguna métrica de la Ola 4 cambie de
    // respuesta por un cambio de la Ola 9 que no pidió — `census-golden`/
    // `ranking-acceptance` no se mueven por esto.
    if (edgeIsAmbiguous(e)) continue;
    const fromNode = nodeById.get(e.from);
    const toNode = nodeById.get(e.to);
    if (!fromNode || !toNode) continue; // defensivo: e.from/e.to son ids de g.nodes, no debería faltar
    const from = keyOf(fromNode);
    const to = keyOf(toNode);
    if (from === to) continue;
    idSet.add(from);
    idSet.add(to);
    let byTo = collapsed.get(from);
    if (!byTo) {
      byTo = new Map();
      collapsed.set(from, byTo);
    }
    byTo.set(to, (byTo.get(to) ?? 0) + e.weight);
  }

  const nodeIds = [...idSet].sort();
  const indexOf = new Map(nodeIds.map((id, i) => [id, i]));
  const out: number[][] = nodeIds.map(() => []);
  const weight: number[][] = nodeIds.map(() => []);
  const hashLines: string[] = [];

  for (const from of nodeIds) {
    const byTo = collapsed.get(from);
    if (!byTo) continue;
    const i = indexOf.get(from)!;
    for (const to of [...byTo.keys()].sort()) {
      const j = indexOf.get(to)!;
      const w = byTo.get(to)!;
      out[i]!.push(j);
      weight[i]!.push(w);
      hashLines.push(`${from} ${to} ${w}`);
    }
  }
  hashLines.sort();

  return { projection: p, nodeIds, indexOf, out, weight, topologyHash: sha1(hashLines.join("\n")) };
}

function projectionKeyFn(g: CodeGraph, p: Projection): (n: CodeGraphNode) => string {
  if (p === "symbol") return (n) => n.id;
  if (p === "file") return (n) => `file:${n.file}`;
  // "module" — CONTRATO-F4.md §3.1: "el nodo `folder:` más profundo que
  // contiene al archivo (ya existe en `CodeGraph.nodes`)". Empate a
  // profundidad: el candidato de ruta MÁS LARGA (más específico) gana.
  const folders = g.nodes
    .filter((n) => n.kind === "folder")
    .map((n) => n.file)
    .sort((a, b) => b.length - a.length);
  const cache = new Map<string, string>();
  return (n: CodeGraphNode) => {
    const cached = cache.get(n.file);
    if (cached) return cached;
    const hit = folders.find((f) => n.file === f || n.file.startsWith(f.length === 0 ? "" : `${f}/`));
    const id = `folder:${hit ?? ""}`;
    cache.set(n.file, id);
    return id;
  };
}

// sha1 hex — mismo algoritmo que `graph/build.ts`/`code-analyzer.ts` ya usan
// para hashes de contenido (no cripto: sólo clave de caché determinística).
function sha1(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}
