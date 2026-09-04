/**
 * COMPONENTES CONEXAS (no dirigidas) — CONTRATO-F4.md §3.1, fila
 * `connected-components` de la tabla ("proyección `file`, aristas todas
 * menos `contains`, costo lineal").
 *
 * DEFINICIÓN, con fuente: componente conexa de un grafo NO dirigido, la
 * noción de teoría de grafos de libro de texto (Cormen/Leiserson/Rivest/
 * Stein, *Introduction to Algorithms*, cap. 21 "Data Structures for
 * Disjoint Sets" — el propio algoritmo Union-Find que esta métrica usa es
 * el que ese capítulo describe) — un subconjunto MAXIMAL de nodos tal que
 * entre cualquier par hay un camino ignorando el sentido de la arista. Acá
 * se aplica sobre la proyección a grano ARCHIVO del grafo de código: dos
 * archivos quedan en la misma componente si existe una cadena de
 * referencias/herencia/etc. (cualquier arista salvo `contains`, que es la
 * jerarquía de carpetas y no una relación de código) entre ellos, SIN
 * IMPORTAR el sentido — A referenciando a B basta para unirlos, igual que
 * B referenciando a A. Es la métrica más barata del catálogo (Union-Find
 * con compresión de camino y unión por rango, O((V+E)·α(V)), prácticamente
 * lineal) y la única forma barata de responder "¿qué archivos no tienen
 * NINGUNA arista con el resto del repo?": son exactamente las componentes
 * de tamaño 1.
 *
 * SIN UMBRAL DE DETECCIÓN: a diferencia de un detector, esta métrica no
 * clasifica nada contra un piso/cita — es puramente estructural (cada nodo
 * cae en exactamente una componente, sin excepción posible). El único
 * número con "fuente" que le compete es el PRESUPUESTO de CPU, y ese ya lo
 * declara `budget.ts` (`pisoDeclarado`, 30 ms) — nada que declarar acá.
 *
 * VALOR: por nodo, el id (string) del REPRESENTANTE de su componente —
 * el `nodeIds[i]` lexicográficamente menor entre los miembros — no un
 * índice interno de array (que no sobrevive a una re-proyección y no dice
 * nada por sí solo). Dos archivos con el mismo valor están en la misma
 * componente; ese es el contrato de lectura para cualquier consumidor
 * (p.ej. el futuro hallazgo "archivo sin ninguna arista": nodo cuyo único
 * miembro de componente es él mismo).
 *
 * INCREMENTALIDAD: NO HAY, Y NO HACE FALTA — mismo argumento que
 * CONTRATO-F4.md §3.3 ya asienta para toda la familia lineal (Tarjan/CC/
 * PageRank/Louvain): recomputar Union-Find COMPLETO cuesta, medido sobre
 * el grafo real de guava (ver el reporte de la tarea), un orden de magnitud
 * por debajo del presupuesto de 30 ms. `ProjectedGraph.topologyHash` ya es
 * la unidad de invalidación (§3.3): hash igual ⇒ se sirve el `Map` cacheado
 * sin tocar esta función; hash distinto ⇒ se recomputa entero. Un
 * Union-Find incremental (soporta unión pero no separación en O(1) — deshacer
 * una arista que desaparece exige rehacer el forest de todos modos) sería
 * más código para ahorrar milisegundos que ya sobran del presupuesto.
 */
import { EDGE_KINDS_EXCEPT_CONTAINS } from "./projection.js";
import type { GraphMetric, MetricBudget, MetricResult, ProjectedGraph } from "./types.js";

/**
 * Cada cuántas uniones se consulta el reloj — mismo criterio de
 * `code-analyzer.ts`'s `CLOCK_CHECK_INTERVAL` (amortizar el costo de
 * `performance.now()`, nunca preguntar por nodo: CONTRATO-F4.md §3.2). No es
 * un umbral de detección (no clasifica nada del código analizado), así que
 * no pasa por `detect/thresholds.ts` — es una cadencia de implementación,
 * como su análogo en `code-analyzer.ts`.
 */
const CLOCK_CHECK_INTERVAL = 4096;

function round2(ms: number): number {
  return Math.round(ms * 100) / 100;
}

/**
 * Union-Find con compresión de camino + unión por rango. Exportada suelta
 * (además de colgar de `connectedComponentsMetric.compute`) para que el test
 * pueda ejercitarla directo sobre un `ProjectedGraph` armado a mano, sin
 * pasar por `projectGraph`/un `CodeGraph` completo.
 */
export function computeConnectedComponents(g: ProjectedGraph, ctx: { budget: MetricBudget }): MetricResult<string> {
  const start = performance.now();
  const n = g.nodeIds.length;

  if (g.projection !== "file") {
    // Declarado en el registro como proyección `file` (tabla del contrato);
    // si algún llamador proyecta distinto, "no aplicable", nunca un mapa
    // calculado sobre una granularidad que esta métrica no declaró soportar.
    return {
      status: "no-aplicable",
      elapsedMs: round2(performance.now() - start),
      reason: `connected-components declara proyección "file"; se recibió "${g.projection}"`,
    };
  }

  if (n === 0) {
    return { status: "computed", values: new Map(), elapsedMs: round2(performance.now() - start) };
  }

  // Chequeo de entrada, UNA vez (no es "por nodo": es antes de arrancar el
  // trabajo) — cubre el caso de un presupuesto que llega YA agotado (p.ej.
  // otra métrica de la misma tajada ya lo consumió), sin esperar a acumular
  // `CLOCK_CHECK_INTERVAL` uniones en un grafo chico donde nunca se
  // alcanzaría el chequeo periódico de abajo.
  if (ctx.budget.expired()) {
    return {
      status: "presupuesto-agotado",
      elapsedMs: round2(performance.now() - start),
      reason: `presupuesto de ${ctx.budget.maxMs} ms ya agotado antes de empezar (${n} nodos)`,
    };
  }

  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const rank = new Uint8Array(n);

  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root]!;
    while (parent[x] !== root) {
      const next = parent[x]!;
      parent[x] = root;
      x = next;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    let ra = find(a);
    let rb = find(b);
    if (ra === rb) return;
    if (rank[ra]! < rank[rb]!) {
      const t = ra;
      ra = rb;
      rb = t;
    }
    parent[rb] = ra;
    if (rank[ra] === rank[rb]) rank[ra]!++;
  };

  let sinceClockCheck = 0;
  let unionsDone = 0;
  const totalEdges = g.out.reduce((acc, row) => acc + row.length, 0);
  for (let i = 0; i < n; i++) {
    for (const j of g.out[i]!) {
      union(i, j);
      unionsDone++;
      if (++sinceClockCheck >= CLOCK_CHECK_INTERVAL) {
        sinceClockCheck = 0;
        if (ctx.budget.expired()) {
          return {
            status: "presupuesto-agotado",
            elapsedMs: round2(performance.now() - start),
            reason:
              `presupuesto de ${ctx.budget.maxMs} ms agotado tras ${unionsDone}/${totalEdges} aristas ` +
              `(${n} nodos) — sin resultado parcial, nunca un mapa incompleto`,
          };
        }
      }
    }
  }

  // Representante = el nodeId lexicográficamente menor de cada componente —
  // estable y legible (no un índice interno de array), ver docstring.
  const repOfRoot = new Map<number, string>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const id = g.nodeIds[i]!;
    const cur = repOfRoot.get(root);
    if (cur === undefined || id < cur) repOfRoot.set(root, id);
  }

  const values = new Map<string, string>();
  const sizeByRoot = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    values.set(g.nodeIds[i]!, repOfRoot.get(root)!);
    sizeByRoot.set(root, (sizeByRoot.get(root) ?? 0) + 1);
  }

  const sizes = [...sizeByRoot.values()].sort((a, b) => b - a);
  const largest = sizes[0] ?? 0;
  const isolated = sizes.filter((s) => s === 1).length;
  const reason =
    `${n} nodos, ${sizes.length} componentes; mayor=${largest} nodos ` +
    `(${((largest / n) * 100).toFixed(1)}%); ${isolated} archivos sin ninguna arista`;

  return { status: "computed", values, elapsedMs: round2(performance.now() - start), reason };
}

export const connectedComponentsMetric: GraphMetric<string> = {
  id: "connected-components",
  title: "Componentes conexas",
  projection: "file",
  // "todas menos contains" (tabla CONTRATO-F4.md §3.1) — `contains` es la
  // jerarquía de carpetas, declarada siempre, no una relación de código; el
  // resto sí importa para la conectividad. OLA Q: estaba enumerada acá y le
  // faltaba `calls`; hoy se deriva del catálogo de `EdgeKind` — ver
  // `EDGE_KINDS_EXCEPT_CONTAINS` en `projection.ts`.
  edgeKinds: EDGE_KINDS_EXCEPT_CONTAINS,
  cost: "lineal",
  compute: computeConnectedComponents,
};
