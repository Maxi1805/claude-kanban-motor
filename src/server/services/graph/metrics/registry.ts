/**
 * LA LISTA — el ÚNICO archivo compartido que una métrica nueva toca.
 * Réplica exacta del patrón de `detect/registry.ts`/`graph/edges/registry.ts`
 * (CONTRATO-F4.md §3): métrica nueva = 1 archivo bajo `graph/metrics/` con
 * su `<id>.test.ts`, y acá UNA línea de `import` y UNA línea en el array,
 * ambas ordenadas alfabéticamente por `id`. Dos agentes que agregan métricas
 * distintas chocan como máximo en dos líneas contiguas y el merge es
 * trivial — no reordenar ni reformatear lo ajeno.
 *
 * Ver la nota de proceso en `types.ts`: este archivo, junto con
 * `types.ts`/`projection.ts`/`budget.ts`, se creó como infraestructura
 * mínima porque `graph/metrics/` no existía todavía. A cierre de la Ola 4
 * el arreglo ya lista las 6 métricas de la tabla de CONTRATO-F4.md §3.1
 * (`scc`/ciclos, `connected-components`, `instability`, `clustering`/
 * agrupamiento, `louvain`/comunidades, `pagerank`), cada una con
 * `projection` y presupuesto de CPU propios; `betweenness` no forma parte
 * de esta lista y no está implementada.
 */
import { clustering } from "./agrupamiento.js";
import { connectedComponentsMetric } from "./componentes.js";
import { instability } from "./instability.js";
import { louvain } from "./comunidades.js";
import { pagerank } from "./pagerank.js";
import { scc } from "./ciclos.js";
import type { GraphMetric } from "./types.js";

export const GRAPH_METRICS = [
  clustering,
  connectedComponentsMetric,
  instability,
  louvain,
  pagerank,
  scc,
] as const satisfies readonly GraphMetric<unknown>[];
