/**
 * COMUNIDADES — detección de comunidades por Louvain (maximización de
 * modularidad, multi-nivel) — CONTRATO-F4.md §3.1, fila `louvain`
 * (id `louvain`, proyección `module`, aristas "todas menos `contains`, con
 * peso", costo `iterativo`).
 *
 * *** PORTADO, NO REESCRITO, como pide la tarea. *** La fuente es
 * `web/src/schema/cluster.ts#clusterSchema`, ya en producción en el panel de
 * esquema de BD (agrupa tablas por foreign keys) y con evidencia empírica
 * propia documentada ahí: sobre dos versiones reales de un esquema Rails (51
 * y 52 tablas), determinismo 30/30 corridas idéntico y ARI = 1,000 entre
 * ambas versiones. Las cuatro funciones internas de ese archivo
 * (`buildLevelGraph`/`runLocalMoving`/`aggregateGraph`/la cola de
 * `clusterSchema` que asigna ids canónicos) se portan acá CASI línea por
 * línea: la única adaptación real es de REPRESENTACIÓN, no de algoritmo —
 * `cluster.ts` opera sobre `Map<string, Map<string, number>>` (nodos = texto
 * de tabla) porque ese es el dato que el introspector de esquema produce;
 * acá el nodo válido es el ÍNDICE DENSO 0..n-1 que `ProjectedGraph` ya
 * entrega (`CONTRATO-F4.md §3.1`), así que la adaptación cambia `Map` por
 * `Int32Array`/arrays planos y evita las llamadas a `.sort()` que `cluster.ts`
 * hace en cada paso para forzar orden alfabético — ver la nota "DETERMINISMO"
 * más abajo para por qué el resultado es exactamente el mismo sin repetir
 * ese ordenamiento.
 *
 * NO REVALIDADA SÓLO SOBRE 51 TABLAS. Esa era justamente la brecha que esta
 * tarea señala como pendiente (CONTRATO-F4.md, tarea de esta métrica: "la
 * validación previa fue sobre un grafo de 51 tablas, que no es evidencia
 * sobre código"). Ver el reporte de esta tarea para la revalidación real
 * sobre el grafo REAL de guava (proyección `module`, 85 nodos, 412 aristas
 * módulo-a-módulo tras colapsar 21.730 referencias símbolo-a-símbolo que
 * cruzan de módulo): determinismo confirmado (5/5 corridas idénticas sobre
 * datos reales, no sintéticos) y una comunidad verificada a mano.
 *
 * PROYECCIÓN — `module`, no `file` ni `symbol`: la tabla del contrato lo fija
 * así, y tiene sentido con la propia justificación que `cluster.ts` ya trae
 * para hubs (ver su docstring: "logs"/"admin_notes" que sólo referencian al
 * hub) — a nivel de MÓDULO (paquete/carpeta) es donde "temas" cohesivos son
 * legibles; a nivel de símbolo, Louvain produciría miles de comunidades de 1
 * solo miembro sin agregar señal (el mismo motivo por el que Brandes/
 * betweenness está PROHIBIDO a esa granularidad, aunque acá el límite no es
 * de presupuesto sino de que el resultado dejaría de ser legible).
 *
 * DETERMINISMO — sin PRNG, exactamente como el original: en cada pasada de
 * "local moving", los nodos se visitan en orden 0..n-1 y las comunidades
 * candidatas se recorren ordenadas ascendentemente. Como `ProjectedGraph.
 * nodeIds` YA está ordenado alfabéticamente (`projection.ts`: `const nodeIds
 * = [...idSet].sort()`) y el índice denso 0..n-1 se asigna en ESE orden, "de
 * menor a mayor índice" y "orden alfabético del `nodeId` original" son EL
 * MISMO orden — así que recorrer `for (let i = 0; i < n; i++)` ya reproduce
 * el "orden alfabético fijo" que `cluster.ts` fuerza con `.sort()` explícito
 * en cada paso, sin repetir ese trabajo. La elección de super-nodo en
 * `aggregateGraph` (mínimo entre los miembros) hereda la misma propiedad de
 * forma transitiva: un super-nodo de nivel 2 es siempre, en última instancia,
 * el índice ORIGINAL más chico entre todos sus miembros originales — igual
 * que `cluster.ts` toma el nombre de tabla alfabéticamente menor.
 *
 * PESO — la proyección ya es DIRIGIDA (`references` tiene sentido de
 * dirección); Louvain, como `cluster.ts`, opera sobre modularidad NO
 * DIRIGIDA: se simetriza sumando el peso en ambos sentidos entre cada par de
 * módulos (mismo criterio que `cluster.ts#buildWeightedAdjacency`, que
 * colapsa relaciones hijo→padre a un peso no dirigido). `projectGraph` ya
 * descarta las auto-aristas (mismo módulo referenciándose a sí mismo) antes
 * de que este archivo vea el grafo, así que no hace falta repetir ese
 * filtro por auto-referencia que `cluster.ts` sí hace a mano.
 *
 * TAJADAS Y PRESUPUESTO — `compute` es SÍNCRONO (`MetricResult<V>`, no
 * `Promise` — igual restricción que ya documentan `agrupamiento.ts`/
 * `instability.ts`): no hay forma de ceder el control al event loop A MITAD
 * de una pasada. Se chequea `ctx.budget.expired()` al INICIO de cada PASADA
 * de local-moving (la unidad de trabajo más chica que tiene sentido cortar
 * sin dejar un resultado a medias: cortar a mitad de una pasada dejaría
 * algunos nodos ya movidos y otros no, una modularidad sin sentido) — mismo
 * criterio de granularidad que `pagerank.ts` aplica entre iteraciones
 * completas de power-iteration. Medido sobre guava (ver el reporte): el
 * cálculo COMPLETO (los 2 niveles que convergen) tarda unos pocos
 * milisegundos, muy por debajo de `DEFAULT_METRIC_BUDGET_MS`; el chequeo
 * entre pasadas es una red de seguridad para un módulo con muchísimos más
 * nodos de los que el corpus medido tiene, no algo que dispare hoy.
 *
 * INCREMENTALIDAD — igual conclusión que `instability.ts`/`agrupamiento.ts`:
 * NO hay (ni hace falta) una versión incremental nodo-por-nodo. Se cachea
 * por `ProjectedGraph.topologyHash` (CONTRATO-F4.md §3.3): un cambio que no
 * mueve qué módulo referencia a qué módulo no cambia el hash y sirve el mapa
 * cacheado sin volver a correr Louvain; cuando SÍ cambia, recomputar entero
 * cuesta los mismos pocos milisegundos medidos — escribir una versión
 * incremental sería más código para ahorrar un tiempo que ya es
 * imperceptible.
 */
import { citado, presupuesto, resolveThreshold, type ThresholdSpec } from "../../detect/thresholds.js";
import { EDGE_KINDS_EXCEPT_CONTAINS } from "./projection.js";
import type { EdgeKind } from "../types.js";
import type { GraphMetric, MetricResult, ProjectedGraph } from "./types.js";

/**
 * CONTRATO-F4.md §3.1: "todas menos `contains`, con peso" — derivada, ya no
 * enumerada. Ver `EDGE_KINDS_EXCEPT_CONTAINS` en `projection.ts` (Ola Q: a las
 * cuatro copias enumeradas les faltaba `calls`).
 */
const EDGE_KINDS_FOR_LOUVAIN: readonly EdgeKind[] = EDGE_KINDS_EXCEPT_CONTAINS;

const NO_LANGUAGE_INPUT = { language: "n/a", sampleSize: () => 0, corpusP95: () => null };

/**
 * Parámetro de resolución γ de Reichardt-Bornholdt: γ=1 es la modularidad
 * ESTÁNDAR de Newman-Girvan (γ>1 produce más grupos más chicos, γ<1 menos
 * grupos más grandes). Mismo default, con la misma cita, que
 * `web/src/schema/cluster.ts#ClusterOptions.resolution` ya usa en producción
 * — el valor con el que esa implementación se validó (ARI=1,000, ver el
 * docstring del archivo), no uno nuevo sin evidencia.
 */
const RESOLUTION_SPEC = citado(1.0, {
  work: "Reichardt & Bornholdt (2006), 'Statistical mechanics of community detection'",
  rule: "parámetro de resolución γ=1 (modularidad estándar de Newman-Girvan); mismo default validado en web/src/schema/cluster.ts",
});
const RESOLUTION = resolveThreshold(RESOLUTION_SPEC, NO_LANGUAGE_INPUT).value;

/**
 * Redes de seguridad ANTI-LOOP, no umbrales de detección — mismos valores y
 * mismo rol que `web/src/schema/cluster.ts#ClusterOptions` declara
 * (`maxPassesPerLevel`/`maxLevels`, "red de seguridad anti-loop"): acotan
 * cuánto puede iterar el algoritmo antes de rendirse aunque siguiera
 * "mejorando" por un margen numérico despreciable — de ahí `presupuesto()`
 * y no `citado()`/`pisoDeclarado()` (no citan literatura ni son un piso de
 * significancia estadística, son un tope de trabajo).
 */
const MAX_PASSES_PER_LEVEL_SPEC: ThresholdSpec = presupuesto(100, {
  rationale: "tope de pasadas de local-moving por nivel; mismo valor y mismo rol anti-loop que web/src/schema/cluster.ts.",
});
const MAX_LEVELS_SPEC: ThresholdSpec = presupuesto(20, {
  rationale: "tope de niveles de agregación multi-nivel; mismo valor y mismo rol anti-loop que web/src/schema/cluster.ts.",
});
const MAX_PASSES_PER_LEVEL = resolveThreshold(MAX_PASSES_PER_LEVEL_SPEC, NO_LANGUAGE_INPUT).value;
const MAX_LEVELS = resolveThreshold(MAX_LEVELS_SPEC, NO_LANGUAGE_INPUT).value;

/** Estado de UN nivel de agregación — igual forma que `cluster.ts#LevelGraph`,
 *  índices numéricos en vez de nombres de tabla. */
interface LevelGraph {
  readonly n: number;
  /** Adyacencia NO dirigida, ya simetrizada — `adjacency[i].get(j)` es el peso `i↔j`. */
  readonly adjacency: readonly ReadonlyMap<number, number>[];
  readonly nodeWeight: Float64Array;
  readonly totalWeight: number;
}

/** Simetriza la proyección dirigida en adyacencia no dirigida ponderada —
 *  ver "PESO" en el docstring del archivo. Nivel 0 (los nodos originales de
 *  `ProjectedGraph`). */
function buildInitialAdjacency(g: ProjectedGraph): ReadonlyMap<number, number>[] {
  const n = g.nodeIds.length;
  const adjacency: Map<number, number>[] = Array.from({ length: n }, () => new Map<number, number>());
  for (let i = 0; i < n; i++) {
    const outs = g.out[i]!;
    const weights = g.weight[i]!;
    for (let k = 0; k < outs.length; k++) {
      const j = outs[k]!;
      if (j === i) continue; // defensivo: `projectGraph` ya descarta auto-aristas
      const w = weights[k]!;
      adjacency[i]!.set(j, (adjacency[i]!.get(j) ?? 0) + w);
      adjacency[j]!.set(i, (adjacency[j]!.get(i) ?? 0) + w);
    }
  }
  return adjacency;
}

function buildLevelGraph(n: number, adjacency: readonly ReadonlyMap<number, number>[]): LevelGraph {
  const nodeWeight = new Float64Array(n);
  let totalWeight = 0;
  for (let i = 0; i < n; i++) {
    let w = 0;
    for (const wt of adjacency[i]!.values()) w += wt;
    nodeWeight[i] = w;
    totalWeight += w;
  }
  return { n, adjacency, nodeWeight, totalWeight };
}

/**
 * Port directo de `cluster.ts#runLocalMoving`. `budget` se consulta al
 * INICIO de cada pasada (ver "TAJADAS Y PRESUPUESTO" arriba): si ya expiró,
 * se corta ANTES de tocar un solo nodo de esta pasada — nunca a mitad, para
 * no dejar una asignación de comunidad parcialmente movida.
 */
function runLocalMoving(
  level: LevelGraph,
  resolution: number,
  maxPasses: number,
  budget: { expired(): boolean },
): { readonly community: Int32Array; readonly changed: boolean; readonly aborted: boolean } {
  const { n, adjacency, nodeWeight, totalWeight: m2 } = level;
  const community = Int32Array.from({ length: n }, (_, i) => i);
  if (m2 === 0 || n === 0) return { community, changed: false, aborted: false };

  const commTotal = Float64Array.from(nodeWeight);
  let anyChangeEver = false;

  for (let pass = 0; pass < maxPasses; pass++) {
    if (budget.expired()) return { community, changed: anyChangeEver, aborted: true };

    let improved = false;
    for (let node = 0; node < n; node++) {
      // `node` recorre 0..n-1 en orden ascendente — el mismo "orden
      // alfabético fijo" que `cluster.ts` fuerza a mano (ver "DETERMINISMO").
      const curComm = community[node]!;
      const kNode = nodeWeight[node]!;
      commTotal[curComm] = commTotal[curComm]! - kNode;

      const neighborWeight = new Map<number, number>();
      for (const [nb, wt] of adjacency[node]!) {
        if (nb === node) continue;
        const c = community[nb]!;
        neighborWeight.set(c, (neighborWeight.get(c) ?? 0) + wt);
      }

      const candidates = new Set<number>(neighborWeight.keys());
      candidates.add(curComm);
      const sortedCandidates = [...candidates].sort((a, b) => a - b);

      let bestComm = curComm;
      let bestGain = -Infinity;
      for (const c of sortedCandidates) {
        const kIn = neighborWeight.get(c) ?? 0;
        const sigmaTot = commTotal[c] ?? 0;
        const gain = kIn - (resolution * sigmaTot * kNode) / m2;
        // Desempate determinista: sólo mejora con ganancia ESTRICTAMENTE
        // mayor (`+ 1e-12` de margen contra ruido de punto flotante) — en
        // empate exacto gana la primera candidata en orden ascendente, igual
        // que `cluster.ts`.
        if (gain > bestGain + 1e-12) {
          bestGain = gain;
          bestComm = c;
        }
      }

      commTotal[bestComm] = (commTotal[bestComm] ?? 0) + kNode;
      community[node] = bestComm;
      if (bestComm !== curComm) {
        improved = true;
        anyChangeEver = true;
      }
    }
    if (!improved) break;
  }

  return { community, changed: anyChangeEver, aborted: false };
}

/**
 * Port directo de `cluster.ts#aggregateGraph`. El id de cada super-nodo es
 * el MÍNIMO índice entre sus miembros — equivalente numérico exacto de "el
 * nombre de tabla alfabéticamente menor" (ver "DETERMINISMO").
 */
function aggregateGraph(level: LevelGraph, community: Int32Array): { readonly next: LevelGraph; readonly superNodeOf: Map<number, number> } {
  const { n, adjacency, nodeWeight } = level;
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const c = community[i]!;
    let members = groups.get(c);
    if (!members) {
      members = [];
      groups.set(c, members);
    }
    members.push(i);
  }

  const superIdOf = new Map<number, number>(); // community-id-actual -> super-node-id (mínimo índice del grupo)
  for (const [c, members] of groups) superIdOf.set(c, Math.min(...members));

  const superNodes = [...new Set(superIdOf.values())].sort((a, b) => a - b);
  const remap = new Map(superNodes.map((sn, i) => [sn, i]));

  const newAdjacency: Map<number, number>[] = superNodes.map(() => new Map<number, number>());
  const newNodeWeight = new Float64Array(superNodes.length);

  for (let i = 0; i < n; i++) {
    const sn = remap.get(superIdOf.get(community[i]!)!)!;
    newNodeWeight[sn] = newNodeWeight[sn]! + nodeWeight[i]!;
    for (const [nb, wt] of adjacency[i]!) {
      const snb = remap.get(superIdOf.get(community[nb]!)!)!;
      if (snb === sn) continue; // self-loop intra-comunidad: no afecta a qué comunidad moverse (igual que cluster.ts)
      const m = newAdjacency[sn]!;
      m.set(snb, (m.get(snb) ?? 0) + wt);
    }
  }

  let newTotalWeight = 0;
  for (const w of newNodeWeight) newTotalWeight += w;

  const next: LevelGraph = { n: superNodes.length, adjacency: newAdjacency, nodeWeight: newNodeWeight, totalWeight: newTotalWeight };
  const superNodeOf = new Map<number, number>();
  for (const [c, sn] of superIdOf) superNodeOf.set(c, remap.get(sn)!);
  return { next, superNodeOf };
}

/**
 * Louvain multi-nivel completo — port de `cluster.ts#louvainRepresentative`.
 * Devuelve `null` si el presupuesto se agotó a mitad de una pasada (nunca un
 * resultado parcial — misma disciplina que `ciclos.ts#tarjanSCC`).
 */
function louvainRepresentative(
  g: ProjectedGraph,
  resolution: number,
  maxPassesPerLevel: number,
  maxLevels: number,
  budget: { expired(): boolean },
): Int32Array | null {
  const n = g.nodeIds.length;
  const membership = Int32Array.from({ length: n }, (_, i) => i);
  let level = buildLevelGraph(n, buildInitialAdjacency(g));

  for (let iter = 0; iter < maxLevels; iter++) {
    if (level.totalWeight === 0) break; // sin aristas: nada más que agregar

    const { community, changed, aborted } = runLocalMoving(level, resolution, maxPassesPerLevel, budget);
    if (aborted) return null;
    if (!changed) break;

    const { next, superNodeOf } = aggregateGraph(level, community);
    if (next.n >= level.n) break; // la agregación no redujo nodos: sin progreso, cortar

    for (let i = 0; i < n; i++) {
      const c = community[membership[i]!]!;
      const sn = superNodeOf.get(c);
      if (sn !== undefined) membership[i] = sn;
    }
    level = next;
  }

  return membership;
}

export const louvain: GraphMetric<number> = {
  id: "louvain",
  title: "Comunidades (Louvain)",
  projection: "module",
  edgeKinds: EDGE_KINDS_FOR_LOUVAIN,
  cost: "iterativo",

  compute(g, ctx): MetricResult<number> {
    const start = performance.now();
    if (g.projection !== "module") {
      return {
        status: "no-aplicable",
        elapsedMs: performance.now() - start,
        reason: `louvain opera sobre la proyección "module"; se recibió "${g.projection}".`,
      };
    }

    const n = g.nodeIds.length;
    if (n === 0) {
      return { status: "computed", values: new Map(), elapsedMs: performance.now() - start };
    }

    const membership = louvainRepresentative(g, RESOLUTION, MAX_PASSES_PER_LEVEL, MAX_LEVELS, ctx.budget);
    if (membership === null) {
      return {
        status: "presupuesto-agotado",
        elapsedMs: performance.now() - start,
        reason: `Louvain sobre ${n} nodos (proyección module) no terminó dentro del presupuesto de ${ctx.budget.maxMs} ms.`,
      };
    }

    // Cola de `clusterSchema` (ver el docstring del archivo): agrupar por
    // representante final y asignar ids canónicos 0..k-1, orden tamaño
    // DESCENDENTE y empate por el miembro de MENOR índice (equivalente
    // numérico de "alfabéticamente menor" — ver "DETERMINISMO") — así el
    // mismo clúster conceptual tiende a conservar su id entre recomputos
    // sucesivos donde el grafo no cambió demasiado.
    const groups = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const rep = membership[i]!;
      let members = groups.get(rep);
      if (!members) {
        members = [];
        groups.set(rep, members);
      }
      members.push(i);
    }
    const orderedGroups = [...groups.values()]
      .map((members) => [...members].sort((a, b) => a - b))
      .sort((a, b) => (b.length !== a.length ? b.length - a.length : a[0]! - b[0]!));

    const values = new Map<string, number>();
    orderedGroups.forEach((members, groupId) => {
      for (const i of members) values.set(g.nodeIds[i]!, groupId);
    });

    return { status: "computed", values, elapsedMs: performance.now() - start };
  },
};
