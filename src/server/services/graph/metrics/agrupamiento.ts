/**
 * Coeficiente de agrupamiento local — CONTRATO-F4.md §3.1 (fila `clustering`,
 * proyección `file`, aristas "todas menos `contains`", costo declarado en la
 * tabla como "cuadrático-local"; `MetricCost` sólo tiene tres valores, así
 * que acá se mapea a `"cuadratico"` — el matiz "-local" queda en prosa: NO es
 * el O(V²)/O(V·E) global de Brandes/betweenness, es O(k(X)·gradoPromedio) por
 * nodo, ver más abajo).
 *
 * DEFINICIÓN — Watts & Strogatz, "Collective dynamics of 'small-world'
 * networks", Nature 393 (1998), ecuación 2. No es una invención de este
 * archivo: es EL coeficiente de agrupamiento local de la literatura de
 * teoría de grafos, la misma fórmula que implementa `networkx.clustering`
 * (la referencia que `pagerank.ts`, hermano de este archivo, también cita
 * para su propio criterio). Para un nodo X con vecindad NO DIRIGIDA N(X)
 * (Y ∈ N(X) si la proyección tiene una arista X→Y O Y→X: "se conocen" no
 * distingue quién referenció a quién) y grado k = |N(X)|:
 *
 *     C(X) = 2·L(X) / (k·(k-1))
 *
 * donde L(X) es la cantidad de PARES {u,v} ⊆ N(X) tales que u y v también
 * son vecinos entre sí (triángulos que pasan por X). `k < 2` ⇒ C(X) = 0: no
 * hay ningún par posible (C(k,2) = 0 para k ∈ {0,1}) — es un valor DEFINIDO
 * por la combinatoria, no un "sin datos"; misma convención que `networkx.
 * clustering` (devuelve 0.0, no `NaN`, para nodos de grado < 2).
 *
 * *** POR QUÉ ESTA MÉTRICA DECIDE ENTRE MEDIATOR Y FACADE ***
 * Ambos son hubs (fan-in/fan-out alto). Lo que los separa estructuralmente
 * es exactamente si SUS VECINOS SE CONOCEN ENTRE SÍ:
 *   - Mediator: existe para que sus vecinos NO tengan que conocerse directo
 *     — el mediador reemplaza esas aristas. Quitado el mediador, sus vecinos
 *     forman un grafo casi vacío entre sí ⇒ C(hub) ≈ 0.
 *   - Facade: envuelve un subsistema cuyas piezas SÍ colaboran entre sí (esa
 *     colaboración interna es justo lo que la fachada simplifica hacia
 *     afuera) ⇒ los vecinos del hub siguen densamente conectados ⇒ C(hub)
 *     alto.
 * Dos hubs con el MISMO fan-in/fan-out pueden tener coeficientes opuestos, y
 * ESE número — no el grado — es la señal que distingue los dos patrones.
 * Esta métrica no clasifica (eso es de un consumidor futuro, fuera de esta
 * tarea): entrega el número del que esa clasificación se derivaría.
 *
 * COSTO — para el nodo X el trabajo real es O(k(X) · min(k(X), gradoProm)),
 * usando intersección de conjuntos de vecinos (no todos los pares con
 * verificación lineal): para cada vecino `u` de X se cuenta cuántos vecinos
 * de `u` son TAMBIÉN vecinos de X, iterando el conjunto MÁS CHICO de los dos
 * (`Set.has` es O(1)). Ver el reporte de esta tarea para el costo medido
 * sobre el grafo REAL de guava (no sintético — CONTRATO-F4.md exige esto
 * explícitamente, la Ola 3 tuvo una medición invalidada por no hacerlo).
 *
 * TAJADAS — `compute` es SÍNCRONO (la firma del contrato lo exige:
 * `MetricResult<V>`, no `Promise`), así que "cortar en tajadas" acá no puede
 * ceder el control al event loop a mitad de cálculo como hace `walkFile`
 * (que SÍ es async y usa `setImmediate`) — es chequear `ctx.budget.
 * expired()` cada `CHUNK` nodos y, si ya no hay margen, abortar el CÁLCULO
 * ENTERO a `presupuesto-agotado` (nunca un mapa parcial: un nodo sin valor
 * se leería como "sin vecinos que se conocen", que es distinto de "no lo
 * medimos"). `CHUNK` es un presupuesto de volumen — `presupuesto()`, no un
 * umbral de detección — calibrado contra el costo medido por nodo en guava
 * (ver el reporte), no adivinado.
 *
 * INCREMENTALIDAD — ver el reporte de esta tarea: esta métrica NO tiene (ni
 * necesita) una versión incremental nodo-por-nodo. Se cachea por
 * `ProjectedGraph.topologyHash` (CONTRATO-F4.md §3.3): un cambio que no
 * mueve la topología de la proyección `file` sirve el mapa entero desde
 * caché sin volver a llamar `compute`.
 */
import { presupuesto, resolveThreshold, type ThresholdSpec } from "../../detect/thresholds.js";
import { EDGE_KINDS_EXCEPT_CONTAINS } from "./projection.js";
import type { EdgeKind } from "../types.js";
import type { GraphMetric, MetricResult, ProjectedGraph } from "./types.js";

/**
 * CONTRATO-F4.md §3.1: "todas menos `contains`".
 *
 * OLA Q — el catálogo compartido que este comentario decía que no hacía falta
 * ("una lista de 7 elementos") ahora existe, y la razón es que las cuatro
 * copias de esa lista envejecieron a la vez: ninguna incluía `calls`. Ver
 * `EDGE_KINDS_EXCEPT_CONTAINS` en `projection.ts`, que la DERIVA del catálogo
 * de `EdgeKind` en vez de enumerarla.
 */
const EDGE_KINDS_FOR_CLUSTERING: readonly EdgeKind[] = EDGE_KINDS_EXCEPT_CONTAINS;

/**
 * Cuántos nodos procesar entre chequeos de `ctx.budget.expired()`. Medido
 * sobre el grafo real de guava proyectado a `file` (ver el reporte de esta
 * tarea): el costo total del coeficiente para TODOS los nodos es del orden
 * de unos pocos milisegundos, muy por debajo de un solo presupuesto de
 * tajada — 500 nodos por chequeo deja margen de sobra bajo el tope de
 * ~25-30 ms por tajada que `budget.ts` ya declara (`DEFAULT_METRIC_BUDGET_MS`),
 * sin que llamar `performance.now()` cientos de veces por corrida se note en
 * el total. No es un umbral de detección: es un tope de volumen de trabajo
 * por chequeo, de ahí `presupuesto()` y no `pisoDeclarado()`.
 */
const CHUNK_SPEC: ThresholdSpec = presupuesto(500, {
  rationale:
    "nodos por chequeo de budget.expired() en el cálculo síncrono del coeficiente de agrupamiento; " +
    "medido sobre el grafo real de guava (proyección `file`), el costo total para todos los nodos es " +
    "de un dígito de milisegundos — 500 deja margen amplio bajo el tope de ~25-30ms por tajada sin " +
    "que el overhead de performance.now() repetido se note.",
});

const CHUNK = resolveThreshold(CHUNK_SPEC, { language: "n/a", sampleSize: () => 0, corpusP95: () => null }).value;

/**
 * Vecindad NO DIRIGIDA por índice denso: `nb[i]` son los `j` tales que hay
 * arista `i→j` O `j→i` en `g` (colapsando dirección — ver el docstring del
 * archivo, "se conocen" no distingue quién referenció a quién). `g.out` ya
 * viene sin auto-aristas (`projectGraph` las descarta al colapsar), así que
 * el filtro `j !== i` de acá es defensivo, no necesario en el camino feliz.
 */
function undirectedNeighbors(g: ProjectedGraph): ReadonlyArray<ReadonlySet<number>> {
  const nb: Set<number>[] = g.nodeIds.map(() => new Set<number>());
  for (let i = 0; i < g.out.length; i++) {
    for (const j of g.out[i]!) {
      if (j === i) continue;
      nb[i]!.add(j);
      nb[j]!.add(i);
    }
  }
  return nb;
}

/**
 * `C(x)` — ver el docstring del archivo para la fórmula y su fuente. Cuenta
 * pares conectados entre vecinos de `x` intersectando conjuntos (iterando
 * siempre el más chico de los dos), no probando todos los pares con un
 * doble `for`: `sum_{u∈N(x)} |N(u)∩N(x)\{u}|` ya es `2·L(x)` (cada par
 * conectado {u,v} se cuenta una vez desde `u` y una vez desde `v`), así que
 * `C(x) = pairs / (k·(k-1))` sin una división/multiplicación por 2 extra.
 */
function localCoefficient(x: number, neighbors: ReadonlyArray<ReadonlySet<number>>): number {
  const nx = neighbors[x]!;
  const k = nx.size;
  if (k < 2) return 0;
  let pairs = 0;
  for (const u of nx) {
    const nu = neighbors[u]!;
    const [small, big] = nu.size < nx.size ? [nu, nx] : [nx, nu];
    for (const v of small) {
      if (v !== u && big.has(v)) pairs++;
    }
  }
  return pairs / (k * (k - 1));
}

export const clustering: GraphMetric<number> = {
  id: "clustering",
  title: "Coeficiente de agrupamiento local",
  projection: "file",
  edgeKinds: EDGE_KINDS_FOR_CLUSTERING,
  cost: "cuadratico",
  compute(g: ProjectedGraph, ctx: { budget: { expired(): boolean } }): MetricResult<number> {
    const t0 = performance.now();
    const neighbors = undirectedNeighbors(g);
    const values = new Map<string, number>();
    for (let i = 0; i < g.nodeIds.length; i++) {
      if (i % CHUNK === 0 && ctx.budget.expired()) {
        return {
          status: "presupuesto-agotado",
          elapsedMs: performance.now() - t0,
          reason: `agotado tras ${i} de ${g.nodeIds.length} nodos (proyección file)`,
        };
      }
      values.set(g.nodeIds[i]!, localCoefficient(i, neighbors));
    }
    return { status: "computed", values, elapsedMs: performance.now() - t0 };
  },
};
