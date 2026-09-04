/**
 * El vocabulario compartido de métricas de grafo — CONTRATO-F4.md §3.1/§3.2.
 *
 * *** NOTA DE PROCESO, para quien reconcilie esta ola: *** este archivo, y
 * `projection.ts`/`budget.ts`/`registry.ts` a su lado, están marcados en el
 * contrato como la infraestructura compartida de la interfaz de métricas,
 * pero a diferencia del registro de aristas (CONTRATO-F4.md §2, que asigna
 * un "agente-sonda" S0 explícito para `graph/edges/{types,sentinel}.ts`), el
 * Contrato 3 no asigna un dueño para ella — sólo dice "una métrica nueva =
 * un archivo + una línea en `registry.ts`". Verificado por grep antes de
 * este cambio: `graph/metrics/` no existía en absoluto. Sin esta forma,
 * ninguna métrica (empezando por `pagerank`, la de esta tarea) compila, así
 * que se crea acá, mínima y fiel a la firma congelada del contrato — mismo
 * criterio, y misma nota, que `graph/edges/types.ts` dejó escrita cuando le
 * tocó resolver el mismo agujero de proceso para las aristas. Si un agente
 * hermano (dueño de `scc`/`connected-components`/`instability`/`clustering`/
 * `louvain`/`betweenness`) también la creó por su cuenta en paralelo, ambas
 * son independientes del mismo contrato congelado y deberían converger
 * estructuralmente; el integrador de la fase de arreglos decide cuál queda.
 *
 * Sólo tipos acá — la implementación de `projectGraph` vive en
 * `projection.ts`, al lado, mismo split que el contrato describe.
 */
import type { EdgeKind } from "../types.js";

export type Projection = "file" | "module" | "symbol";

export interface ProjectedGraph {
  readonly projection: Projection;
  /** Índice denso: posición = índice interno usado por `out`/`weight`. */
  readonly nodeIds: readonly string[];
  readonly indexOf: ReadonlyMap<string, number>;
  /** Listas de adyacencia, un array por nodo, en el mismo orden que `nodeIds`. */
  readonly out: readonly (readonly number[])[];
  /** Peso paralelo a `out[i]`: `weight[i][k]` es el peso de la arista `out[i][k]`. */
  readonly weight: readonly (readonly number[])[];
  /** sha1 de las aristas proyectadas, ordenadas — CONTRATO-F4.md §3.3: la CLAVE DE CACHÉ. */
  readonly topologyHash: string;
}

export interface MetricBudget {
  readonly maxMs: number;
  /** `true` cuando se agotó. Se consulta ENTRE tajadas (p.ej. entre
   *  iteraciones de un algoritmo iterativo), NUNCA por nodo. */
  expired(): boolean;
}

export interface MetricResult<V> {
  readonly status: "computed" | "no-aplicable" | "presupuesto-agotado";
  /** `undefined` salvo `status === "computed"`. Nunca un mapa parcial ni ceros. */
  readonly values?: ReadonlyMap<string, V>;
  readonly elapsedMs: number;
  readonly reason?: string;
}

export interface GraphMetric<V = number> {
  readonly id: string;
  readonly title: string;
  readonly projection: Projection;
  readonly edgeKinds: readonly EdgeKind[];
  readonly cost: "lineal" | "iterativo" | "cuadratico";
  compute(g: ProjectedGraph, ctx: { budget: MetricBudget }): MetricResult<V>;
}
