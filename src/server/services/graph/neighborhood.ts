/**
 * El vecindario de un `Finding` — CONTRATO-F9.md §1. Lo que una hipótesis ve
 * hoy es UN hallazgo; los cuatro patrones sin ancla (Observer/Iterator/
 * Composite/Null Object) y varios discriminadores existentes (p.ej. el
 * `'repeticion-cruzada'` de `strategy.ts`, que hoy "devuelve SIEMPRE falso"
 * porque "un check no tiene acceso a otros Finding del repo") son
 * propiedades de CONJUNTOS de hallazgos y de su posición en el grafo. Este
 * módulo es el índice — construido UNA vez por corrida — y la vista barata
 * que cada hallazgo recibe sobre él.
 *
 * *** LO QUE ESTA OLA ATERRIZA (F0/Cimientos) vs. LO QUE LLENA F1: ***
 * `buildNeighborhoodIndex` construye los CUATRO índices reales descritos en
 * CONTRATO-F9.md §1.2 (nodeById, adyacencia CSR bidireccional en
 * `Int32Array`, y los tres índices de hallazgos por ancla/archivo/kind) y
 * `neighborhoodFor` implementa las siete consultas de `Neighborhood` contra
 * ellos — code mecánico, acotado por las constantes de abajo, sin ningún
 * juicio de detección. Se implementa completo (no sólo la firma) porque es
 * la única forma de MEDIR el costo real de construcción que el contrato pide
 * medir sobre guava (ver `neighborhood.bench.test.ts`) y porque construir el
 * índice es responsabilidad explícita de Cimientos ("el tipo del vecindario
 * y su constructor de índices"). Lo que se deja para F1 es la CALIBRACIÓN
 * sobre el corpus real (F0 corre con 0 corridas de corpus — la medición de
 * abajo usa un grafo SINTÉTICO, nunca `analyzeRepo`) y `ctx.branches`
 * (`hypotheses/types.ts#BranchFacts`), que necesita recorrer el árbol vivo
 * con `DerivedNodeSets` — eso sí es trabajo de F1, con `strategy.ts`/
 * `state.ts` como prueba.
 */
import { deriveAnchor, serializeAnchor } from "../detect/ids.js";
import type { Anchor, Finding, RoleLocation } from "../detect/types.js";
import { anchorNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode } from "./types.js";

/** CONTRATO-F9.md §1.1. `[provisional]` — ver el docstring de cada constante en `graph/stages.ts`-style: a calibrar con datos reales por F1. */
export const NEIGHBORHOOD_MAX_PEERS = 256;
/** `[provisional]`. Tope de vecinos POR NIVEL (no por dirección) que `ego` expande — ver `buildEgo` abajo para el criterio de corte determinista. */
export const EGO_MAX_DEGREE = 64;
/** `[provisional]`. Tope de nodos TOTALES (sin el centro) que `ego(...,2)` puede devolver. */
export const EGO_MAX_NODES = 512;

/** Tamaño del LRU de `ego` — memoiza por `(centerId, hops)`, compartido entre TODOS los `Finding` de la corrida (vía `NeighborhoodIndex`), no por hallazgo. */
const EGO_CACHE_SIZE = 1024;

export interface Ego {
  readonly centerId: string;
  /** Sin el centro, deduplicado, `hops` = distancia MÍNIMA real alcanzada. */
  readonly nodes: readonly { readonly node: CodeGraphNode; readonly hops: 1 | 2 }[];
  /** Aristas incidentes a `nodes ∪ {centro}`, en las dos direcciones, tal cual salieron de `CodeGraph.edges` — incluye `provenance: "ambiguous"` (el crudo; ver `edgeIsAmbiguous` en `./types.js` para cómo un consumidor las excluye). */
  readonly edges: readonly CodeGraphEdge[];
  /** Grado REAL del centro antes de cualquier corte — EXCLUYE aristas `ambiguous` (CONTRATO-F9.md §4.5: "los helpers de conteo... las excluyen"). Un check que pregunte "¿es un hub?" mide acá, no contando `edges`. */
  readonly degreeIn: number;
  readonly degreeOut: number;
  /** `true` si `EGO_MAX_DEGREE`/`EGO_MAX_NODES` dejaron vecinos afuera. */
  readonly truncated: boolean;
}

/** CONTRATO-F9.md §1.1 — la superficie completa. Todo acá es O(resultado), nunca O(grafo): ver el docstring de cada método en el contrato, repetido brevemente abajo. */
export interface Neighborhood {
  /** Hallazgos cuyo `deriveAnchor(loc)` serializa IGUAL que `anchor` (incluyendo `ordinal`). NUNCA incluye al `problem`. Orden estable: `Finding.id` ascendente. */
  findingsAtSymbol(anchor: Anchor): readonly Finding[];
  /** Hallazgos con al menos una `location` en `file`. Sin el `problem`. Truncado a `NEIGHBORHOOD_MAX_PEERS` por `severity` desc, luego `id`. */
  findingsInFile(file: string): readonly Finding[];
  /** Hallazgos del mismo `kind` en CUALQUIER archivo. Sin el `problem`. Mismo truncado. Esto es lo que cierra `'repeticion-cruzada'` en `strategy.ts`. */
  findingsOfKind(kind: string): readonly Finding[];
  /** Cardinal REAL antes de truncar (y sin el `problem`) — nunca `.length` del array truncado. */
  countOfKind(kind: string): number;
  /** `true` si la ÚLTIMA consulta de ese tipo, sobre ESTE `Neighborhood`, se truncó. */
  truncated(q: "atSymbol" | "inFile" | "ofKind" | "ego"): boolean;
  /** Vecinos a 1 y 2 saltos del nodo de `anchor`, con sus aristas. `null` si el ancla no tiene nodo en el grafo (o no hay grafo). */
  ego(anchor: Anchor, hops: 1 | 2): Ego | null;
  /** Métrica de `graph/metrics/registry.ts` YA CALCULADA para el nodo del ancla. `undefined` = no se computó esta corrida — NUNCA dispara un cómputo, nunca `0` por defecto. */
  metric(anchor: Anchor, metricId: string): number | undefined;
}

/**
 * El vecindario VACÍO — lo que responde `[]`/`null`/`undefined` a todo, sin
 * excepción. Compartido (frozen, sin estado mutable real: `truncated()`
 * siempre `false` porque nada se corta cuando no hay nada que consultar), así
 * que es seguro reusar la MISMA instancia para cualquier `Finding` — cuando
 * no hay grafo ni índice de hallazgos (o el presupuesto de la corrida se
 * agotó — `hypotheses/run.ts` decide cuándo caer acá, ver su docstring).
 */
export const EMPTY_NEIGHBORHOOD: Neighborhood = Object.freeze({
  findingsAtSymbol: () => [],
  findingsInFile: () => [],
  findingsOfKind: () => [],
  countOfKind: () => 0,
  truncated: () => false,
  ego: () => null,
  metric: () => undefined,
});

/* ────────────────────────────────────────────────────────────────────────
 * El índice — construido UNA vez por corrida (CONTRATO-F9.md §1.2).
 * ──────────────────────────────────────────────────────────────────────── */

interface Csr {
  /** Longitud V+1 — `edgeIdx.subarray(offsets[i], offsets[i+1])` son los índices de arista incidentes al nodo `i`, en ESTE orden: `weight` desc, empate por el id del OTRO extremo, lexicográfico. */
  readonly offsets: Int32Array;
  /** Longitud E (o menos: sólo aristas cuyos dos extremos son nodos conocidos). Valores = índice en `edges`. */
  readonly edgeIdx: Int32Array;
}

/**
 * Opaco por convención (CONTRATO-F9.md §1.2: "sólo `neighborhoodFor` lo
 * lee") — los campos son reales, no un tipo fantasma, porque TypeScript no
 * tiene visibilidad de módulo para tipos; `neighborhoodFor` es la única
 * función de este archivo pensada para leerlos.
 */
export interface NeighborhoodIndex {
  readonly nodeById: ReadonlyMap<string, CodeGraphNode>;
  readonly nodeIds: readonly string[];
  readonly indexOf: ReadonlyMap<string, number>;
  readonly edges: readonly CodeGraphEdge[];
  readonly out: Csr;
  readonly inn: Csr;
  readonly findings: readonly Finding[];
  /** `Finding.id` -> índice en `findings` — evita un `indexOf` O(N) por cada `neighborhoodFor` (que se llama UNA VEZ POR HALLAZGO: guava tiene 7.630). */
  readonly findingIndexById: ReadonlyMap<string, number>;
  readonly findingsByAnchor: ReadonlyMap<string, Int32Array>;
  readonly findingsByFile: ReadonlyMap<string, Int32Array>;
  readonly findingsByKind: ReadonlyMap<string, Int32Array>;
  /** `metricId -> nodeId -> valor`, tal cual llega a `buildNeighborhoodIndex`. `null` = sin métricas esta corrida (hoy siempre: `graph/metrics/registry.ts` no tiene todavía un call site en `code-analyzer.ts`). */
  readonly metrics: ReadonlyMap<string, ReadonlyMap<string, number>> | null;
  /** LRU compartido de `ego`, 1024 entradas — CONTRATO-F9.md §1.2 "Memoización". Mutable a propósito: es el único estado que sobrevive entre `neighborhoodFor` distintos. */
  readonly egoCache: Map<string, Ego | null>;
}

function buildCsr(nodeIds: readonly string[], indexOf: ReadonlyMap<string, number>, edges: readonly CodeGraphEdge[], endpoint: "from" | "to"): Csr {
  const v = nodeIds.length;
  const selfOf = endpoint === "from" ? (e: CodeGraphEdge) => e.from : (e: CodeGraphEdge) => e.to;
  const otherOf = endpoint === "from" ? (e: CodeGraphEdge) => e.to : (e: CodeGraphEdge) => e.from;

  const buckets: number[][] = Array.from({ length: v }, () => []);
  for (let i = 0; i < edges.length; i++) {
    const ni = indexOf.get(selfOf(edges[i]!));
    if (ni === undefined) continue; // defensivo: `from`/`to` de una arista siempre deberían estar en `nodes`, pero un índice construido sobre datos parciales no debe lanzar.
    buckets[ni]!.push(i);
  }
  // Orden determinista por bucket: `weight` desc, empate por el id del OTRO
  // extremo — el mismo criterio que CONTRATO-F9.md §1.2 fija para el corte
  // de `ego`: "aristas ordenadas por weight desc, desempate por to/from
  // lexicográfico". Esto es lo que vuelve el corte a `EGO_MAX_DEGREE`
  // determinista en vez de "los primeros que aparecieron en `edges`".
  for (const bucket of buckets) {
    bucket.sort((a, b) => {
      const ea = edges[a]!;
      const eb = edges[b]!;
      if (eb.weight !== ea.weight) return eb.weight - ea.weight;
      const oa = otherOf(ea);
      const ob = otherOf(eb);
      return oa < ob ? -1 : oa > ob ? 1 : 0;
    });
  }

  const offsets = new Int32Array(v + 1);
  for (let i = 0; i < v; i++) offsets[i + 1] = offsets[i]! + buckets[i]!.length;
  const edgeIdx = new Int32Array(offsets[v]!);
  let k = 0;
  for (let i = 0; i < v; i++) for (const e of buckets[i]!) edgeIdx[k++] = e;
  return { offsets, edgeIdx };
}

/** `deriveAnchor` + `serializeAnchor` de `detect/ids.ts` — la MISMA función que `Finding.id` ya usa, para que "misma ancla" signifique lo mismo en los dos lugares. */
function anchorKeyOf(loc: RoleLocation): string {
  return serializeAnchor(deriveAnchor(loc));
}

function groupFindingsBy(findings: readonly Finding[], keyOf: (f: Finding, locIndex: number) => readonly string[]): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i]!;
    const keys = new Set(keyOf(f, i));
    for (const key of keys) {
      let list = groups.get(key);
      if (!list) {
        list = [];
        groups.set(key, list);
      }
      list.push(i);
    }
  }
  return groups;
}

/** `severity` desc, luego `Finding.id` asc — el orden de truncado de `findingsInFile`/`findingsOfKind` (CONTRATO-F9.md §1.1). */
function bySeverityDescThenId(findings: readonly Finding[]): (a: number, b: number) => number {
  return (a, b) => {
    const fa = findings[a]!;
    const fb = findings[b]!;
    if (fb.severity !== fa.severity) return fb.severity - fa.severity;
    return fa.id < fb.id ? -1 : fa.id > fb.id ? 1 : 0;
  };
}

function toInt32Sorted(indices: number[], cmp: (a: number, b: number) => number): Int32Array {
  const sorted = [...indices].sort(cmp);
  return Int32Array.from(sorted);
}

/**
 * CONTRATO-F9.md §1.2 — construye los cuatro índices una sola vez. `graph`
 * puede ser `null` (sin grafo esta corrida): `nodeById`/CSR quedan vacíos y
 * `ego` siempre devuelve `null`, pero los tres índices de hallazgos SIGUEN
 * construyéndose (no dependen del grafo). `metrics` (opcional, ausente en el
 * cableado de esta ola — `graph/metrics/registry.ts` no tiene todavía un
 * call site real en `code-analyzer.ts`) se lee tal cual: `metricId` primero,
 * `nodeId` después, la forma natural en la que `graph/metrics/registry.ts`
 * ya produce un `MetricResult<V>.values` por métrica.
 */
export function buildNeighborhoodIndex(
  graph: CodeGraph | null,
  findings: readonly Finding[],
  metrics: ReadonlyMap<string, ReadonlyMap<string, number>> | null,
): NeighborhoodIndex {
  const nodeById = new Map<string, CodeGraphNode>();
  const nodeIds: string[] = [];
  if (graph) {
    for (const n of graph.nodes) {
      if (nodeById.has(n.id)) continue;
      nodeById.set(n.id, n);
      nodeIds.push(n.id);
    }
  }
  const indexOf = new Map(nodeIds.map((id, i) => [id, i] as const));
  const edges = graph?.edges ?? [];
  const out = buildCsr(nodeIds, indexOf, edges, "from");
  const inn = buildCsr(nodeIds, indexOf, edges, "to");

  const byAnchorRaw = groupFindingsBy(findings, (f) => f.locations.map((loc) => anchorKeyOf(loc)));
  const byFileRaw = groupFindingsBy(findings, (f) => [...new Set(f.locations.map((loc) => loc.file))]);
  const byKindRaw = groupFindingsBy(findings, (f) => [f.kind]);

  const findingsByAnchor = new Map<string, Int32Array>();
  // Orden estable: `Finding.id` ascendente — CONTRATO-F9.md §1.1 (distinto del orden de truncado de archivo/kind, que es por severidad).
  const byId = (a: number, b: number): number => {
    const fa = findings[a]!.id;
    const fb = findings[b]!.id;
    return fa < fb ? -1 : fa > fb ? 1 : 0;
  };
  for (const [key, list] of byAnchorRaw) findingsByAnchor.set(key, toInt32Sorted(list, byId));

  const bySeverity = bySeverityDescThenId(findings);
  const findingsByFile = new Map<string, Int32Array>();
  for (const [key, list] of byFileRaw) findingsByFile.set(key, toInt32Sorted(list, bySeverity));
  const findingsByKind = new Map<string, Int32Array>();
  for (const [key, list] of byKindRaw) findingsByKind.set(key, toInt32Sorted(list, bySeverity));

  return {
    nodeById,
    nodeIds,
    indexOf,
    edges,
    out,
    inn,
    findings,
    findingIndexById: new Map(findings.map((f, i) => [f.id, i] as const)),
    findingsByAnchor,
    findingsByFile,
    findingsByKind,
    metrics,
    egoCache: new Map(),
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * `ego` — BFS acotado (CONTRATO-F9.md §1.2, cota dura 64 + 64×64 = 4.160).
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Grado REAL de `nodeIdx`, sin cortar, EXCLUYENDO `ambiguous` (CONTRATO-F9.md
 * §1.1/§4.5). O(grado) — inevitable: es justo el número que un consumidor no
 * puede obtener de otra forma. Se llama SÓLO para el CENTRO de un `ego`
 * (nunca para un vecino intermedio de hop 2 — ver el docstring de `buildEgo`
 * para por qué esa distinción es la que mantiene el costo acotado).
 */
function realDegree(index: NeighborhoodIndex, nodeIdx: number): { readonly degreeIn: number; readonly degreeOut: number } {
  const outStart = index.out.offsets[nodeIdx]!;
  const outEnd = index.out.offsets[nodeIdx + 1]!;
  const innStart = index.inn.offsets[nodeIdx]!;
  const innEnd = index.inn.offsets[nodeIdx + 1]!;
  let degreeOut = 0;
  for (let i = outStart; i < outEnd; i++) {
    if (index.edges[index.out.edgeIdx[i]!]!.provenance !== "ambiguous") degreeOut++;
  }
  let degreeIn = 0;
  for (let i = innStart; i < innEnd; i++) {
    if (index.edges[index.inn.edgeIdx[i]!]!.provenance !== "ambiguous") degreeIn++;
  }
  return { degreeIn, degreeOut };
}

/** Cota dura de cuántas entradas de CSR se escanean por dirección al buscar `limit` candidatos NO-ambiguos — sin esto, un bucket patológico (todo `ambiguous`) escanearía el grado completo. `[provisional]`, generoso a propósito (4×): con cero aristas `ambiguous` producidas hoy por nadie, nunca se acerca a este techo. */
const CANDIDATE_SCAN_FACTOR = 4;

/**
 * Los mejores `limit` vecinos NO-ambiguos de `nodeIdx` (ambas direcciones,
 * mezcladas y re-cortadas por el mismo criterio `weight` desc / id
 * lexicográfico), como pares `[otherNodeIdx, edgeIdx]` — MÁS las aristas
 * `ambiguous` tocadas en la MISMA ventana escaneada (CONTRATO-F9.md §1.1:
 * `Ego.edges` "incluye `provenance:"ambiguous"`" — se recolectan pero NUNCA
 * contribuyen un nodo nuevo ni cuentan para `degreeIn`/`degreeOut`, ver
 * `buildEgo`/`realDegree`). *** A PROPÓSITO no calcula grado real: *** el CSR
 * ya viene ordenado `weight` desc por bucket, así que tomar los primeros
 * `limit` de CADA dirección alcanza sin recorrer el resto — esto es lo que
 * mantiene `ego(...,2)` en la cota dura del contrato (64 + 64×64): si esta
 * función recorriera el grado COMPLETO de cada vecino de hop 1 para poder
 * cortarlo (como hace `realDegree`), un solo hub alcanzado en hop 1 (guava:
 * `Preconditions`, miles de aristas) volvería `ego(...,2)` O(grado del hub)
 * en vez de O(`EGO_MAX_DEGREE`).
 */
function topCandidates(index: NeighborhoodIndex, nodeIdx: number, limit: number): { readonly candidates: readonly (readonly [number, number])[]; readonly ambiguousTouched: readonly number[] } {
  const outStart = index.out.offsets[nodeIdx]!;
  const outEnd = index.out.offsets[nodeIdx + 1]!;
  const innStart = index.inn.offsets[nodeIdx]!;
  const innEnd = index.inn.offsets[nodeIdx + 1]!;
  const scanCap = limit * CANDIDATE_SCAN_FACTOR;

  const candidates: [number, number][] = []; // [otherNodeIdx, edgeIdx]
  const ambiguousTouched: number[] = [];
  let scanned = 0;
  for (let i = outStart; i < outEnd && candidates.length < limit && scanned < scanCap; i++, scanned++) {
    const ei = index.out.edgeIdx[i]!;
    const e = index.edges[ei]!;
    if (e.provenance === "ambiguous") {
      ambiguousTouched.push(ei);
      continue;
    }
    const otherIdx = index.indexOf.get(e.to);
    if (otherIdx !== undefined) candidates.push([otherIdx, ei]);
  }
  const outCandidateCount = candidates.length;
  scanned = 0;
  for (let i = innStart; i < innEnd && candidates.length < outCandidateCount + limit && scanned < scanCap; i++, scanned++) {
    const ei = index.inn.edgeIdx[i]!;
    const e = index.edges[ei]!;
    if (e.provenance === "ambiguous") {
      ambiguousTouched.push(ei);
      continue;
    }
    const otherIdx = index.indexOf.get(e.from);
    if (otherIdx !== undefined) candidates.push([otherIdx, ei]);
  }
  // Mezclar out+inn requiere un re-sort para que el corte final a `limit` respete el mismo criterio a través de ambas direcciones.
  candidates.sort((a, b) => {
    const wa = index.edges[a[1]]!.weight;
    const wb = index.edges[b[1]]!.weight;
    if (wb !== wa) return wb - wa;
    const ia = index.nodeIds[a[0]]!;
    const ib = index.nodeIds[b[0]]!;
    return ia < ib ? -1 : ia > ib ? 1 : 0;
  });
  return { candidates: candidates.slice(0, limit), ambiguousTouched };
}

function buildEgo(index: NeighborhoodIndex, centerId: string, hops: 1 | 2): Ego | null {
  const centerIdx = index.indexOf.get(centerId);
  if (centerIdx === undefined) return null;

  const { degreeIn, degreeOut } = realDegree(index, centerIdx);
  const { candidates: hop1Pairs, ambiguousTouched: hop1Ambiguous } = topCandidates(index, centerIdx, EGO_MAX_DEGREE);
  let truncated = degreeIn + degreeOut > hop1Pairs.length;

  const hopsByNode = new Map<number, 1 | 2>();
  const edgeIdxSet = new Set<number>();
  for (const ei of hop1Ambiguous) edgeIdxSet.add(ei); // crudo: `Ego.edges` sí las incluye, aunque no aporten nodo ni cuenten en degreeIn/Out.
  for (const [otherIdx, ei] of hop1Pairs) {
    hopsByNode.set(otherIdx, 1);
    edgeIdxSet.add(ei);
  }

  if (hops === 2) {
    for (const [hop1Idx] of hop1Pairs) {
      const { candidates: hop2Pairs, ambiguousTouched: hop2Ambiguous } = topCandidates(index, hop1Idx, EGO_MAX_DEGREE);
      for (const ei of hop2Ambiguous) edgeIdxSet.add(ei);
      for (const [otherIdx, ei] of hop2Pairs) {
        if (otherIdx === centerIdx) continue;
        if (!hopsByNode.has(otherIdx)) {
          if (hopsByNode.size >= EGO_MAX_NODES) {
            truncated = true;
            continue;
          }
          hopsByNode.set(otherIdx, 2);
        }
        edgeIdxSet.add(ei);
      }
    }
  }

  if (hopsByNode.size > EGO_MAX_NODES) truncated = true;
  const nodes = [...hopsByNode.entries()]
    .slice(0, EGO_MAX_NODES)
    .map(([idx, h]) => ({ node: index.nodeById.get(index.nodeIds[idx]!)!, hops: h }));
  const edges = [...edgeIdxSet].map((ei) => index.edges[ei]!);

  return { centerId, nodes, edges, degreeIn, degreeOut, truncated };
}

function cachedEgo(index: NeighborhoodIndex, centerId: string, hops: 1 | 2): Ego | null {
  const key = `${centerId} ${hops}`;
  if (index.egoCache.has(key)) {
    const hit = index.egoCache.get(key)!;
    // Reinsertar para recencia (Map preserva orden de inserción — el primero en iterar es el más viejo).
    index.egoCache.delete(key);
    index.egoCache.set(key, hit);
    return hit;
  }
  const built = buildEgo(index, centerId, hops);
  if (index.egoCache.size >= EGO_CACHE_SIZE) {
    const oldest = index.egoCache.keys().next().value;
    if (oldest !== undefined) index.egoCache.delete(oldest);
  }
  index.egoCache.set(key, built);
  return built;
}

/* ────────────────────────────────────────────────────────────────────────
 * `neighborhoodFor` — la vista barata por `Finding` (CONTRATO-F9.md §1.2).
 * ──────────────────────────────────────────────────────────────────────── */

function truncateToPeers(indices: Int32Array, excludeIdx: number): { readonly kept: readonly number[]; readonly truncated: boolean } {
  const kept: number[] = [];
  for (let i = 0; i < indices.length && kept.length < NEIGHBORHOOD_MAX_PEERS; i++) {
    if (indices[i] === excludeIdx) continue;
    kept.push(indices[i]!);
  }
  const realCount = indices.length - (indices.includes(excludeIdx) ? 1 : 0);
  return { kept, truncated: realCount > kept.length };
}

/** Barato: cierra sobre `index`, no copia nada — CONTRATO-F9.md §1.2. Se llama UNA vez por `Finding`. */
export function neighborhoodFor(index: NeighborhoodIndex, problem: Finding): Neighborhood {
  const problemIdx = index.findingIndexById.get(problem.id) ?? -1;
  const lastTruncated: Record<"atSymbol" | "inFile" | "ofKind" | "ego", boolean> = {
    atSymbol: false,
    inFile: false,
    ofKind: false,
    ego: false,
  };

  const findingsAtSymbol = (anchor: Anchor): readonly Finding[] => {
    const key = serializeAnchor(anchor);
    const group = index.findingsByAnchor.get(key);
    if (!group) {
      lastTruncated.atSymbol = false;
      return [];
    }
    const { kept, truncated } = truncateToPeers(group, problemIdx);
    lastTruncated.atSymbol = truncated;
    return kept.map((i) => index.findings[i]!);
  };

  const findingsInGroup = (groups: ReadonlyMap<string, Int32Array>, key: string, flag: "inFile" | "ofKind"): readonly Finding[] => {
    const group = groups.get(key);
    if (!group) {
      lastTruncated[flag] = false;
      return [];
    }
    const { kept, truncated } = truncateToPeers(group, problemIdx);
    lastTruncated[flag] = truncated;
    return kept.map((i) => index.findings[i]!);
  };

  return {
    findingsAtSymbol,
    findingsInFile: (file) => findingsInGroup(index.findingsByFile, file, "inFile"),
    findingsOfKind: (kind) => findingsInGroup(index.findingsByKind, kind, "ofKind"),
    countOfKind: (kind) => {
      const group = index.findingsByKind.get(kind);
      if (!group) return 0;
      return group.length - (problemIdx >= 0 && group.includes(problemIdx) ? 1 : 0);
    },
    truncated: (q) => lastTruncated[q],
    ego: (anchor, hops) => {
      const nodeId = anchorNodeId(anchor);
      const ego = cachedEgo(index, nodeId, hops);
      lastTruncated.ego = ego?.truncated ?? false;
      return ego;
    },
    metric: (anchor, metricId) => index.metrics?.get(metricId)?.get(anchorNodeId(anchor)),
  };
}
