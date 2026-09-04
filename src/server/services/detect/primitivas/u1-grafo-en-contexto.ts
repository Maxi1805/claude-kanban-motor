/**
 * LA UNIFICACIÓN, pieza 1 de 3 — el índice de consulta del grafo que viaja en
 * el `RunContext` de un detector `intra-*` (Ola N, frente U1). Ver
 * `claude-kanban-docs/ola-n/CONTRATO-UNIFICACION.md`.
 *
 * POR QUÉ EXISTE, en un número: un detector `intra-function` corre UNA VEZ POR
 * FUNCIÓN del repo. Si para preguntarle algo al grafo tuviera que recorrer
 * `graph.edges` (guava: ~2·10^5 aristas) por cada una de sus ~5·10^4
 * funciones, la pregunta costaría del orden de 10^10 operaciones. Con este
 * índice — construido UNA vez por corrida, O(N+E) — cada pregunta es O(grado
 * del nodo). El runner (`detect/run.ts`) lo construye PEREZOSAMENTE: un repo
 * donde ningún detector pide el grafo no paga ni la construcción.
 *
 * Implementa `graph/types.ts#GraphIndex`, que ya era la superficie mínima
 * declarada ahí para "quien consuma el grafo" (`nodeById`/`edgesFrom`, más
 * `edgesTo` desde CONTRATO-F9.md §6 fila 1) — NO un tipo nuevo. Ese archivo
 * declaraba la forma y no traía constructor: el único implementador previo
 * (`graph/edges/satisfies-derive.ts`) arma el suyo a mano y sin `edgesTo`.
 *
 * Prefijo `u1-` por la regla de archivos nuevos de la ola (CONTEXTO.md §5.1):
 * trece frentes editan el mismo árbol a la vez y dos no pueden crear el mismo
 * archivo.
 */
import type { CodeGraph, CodeGraphEdge, CodeGraphNode, GraphIndex } from "../../graph/types.js";
import type { RunContext } from "../types.js";

const NO_EDGES: readonly CodeGraphEdge[] = [];

function pushInto(map: Map<string, CodeGraphEdge[]>, key: string, edge: CodeGraphEdge): void {
  const list = map.get(key);
  if (list) list.push(edge);
  else map.set(key, [edge]);
}

/**
 * Índice de consulta O(1) sobre un `CodeGraph` ya construido. Puro: no muta
 * `graph` ni guarda estado entre llamadas, y las listas que devuelve son las
 * mismas instancias en cada consulta (nunca copias nuevas por llamada — un
 * detector que consulte el mismo nodo un millón de veces no aloca un millón de
 * arreglos).
 *
 * NODOS DUPLICADOS: gana el PRIMERO en `graph.nodes`, el mismo criterio que
 * `graph/neighborhood.ts#buildNeighborhoodIndex` ya usa para su propio
 * `nodeById` — dos índices del mismo grafo tienen que responder lo mismo.
 * `graph/build.ts` desambigua los homónimos con `@n` al armar `nodes`, así que
 * en la práctica esto sólo protege contra un grafo mal armado.
 */
export function buildGraphIndex(graph: CodeGraph): GraphIndex {
  const byId = new Map<string, CodeGraphNode>();
  for (const node of graph.nodes) if (!byId.has(node.id)) byId.set(node.id, node);

  const outgoing = new Map<string, CodeGraphEdge[]>();
  const incoming = new Map<string, CodeGraphEdge[]>();
  for (const edge of graph.edges) {
    pushInto(outgoing, edge.from, edge);
    pushInto(incoming, edge.to, edge);
  }

  return {
    nodeById: (id) => byId.get(id) ?? null,
    edgesFrom: (id) => outgoing.get(id) ?? NO_EDGES,
    edgesTo: (id) => incoming.get(id) ?? NO_EDGES,
  };
}

/**
 * El `RunContext` de un test, CON grafo. Existe porque
 * `detect/testing.ts#testContext` es un módulo CERRADO ("se usa, no se edita")
 * y no conoce el grafo: un detector `intra-*` que declare `needsGraph` se
 * testea con `withGraph(testContext(detector, "typescript"), grafo)`.
 *
 * El índice se construye PEREZOSAMENTE y una sola vez, igual que en el runner
 * de producción, para que el test ejercite la misma forma de acceso que el
 * detector va a ver de verdad. `graph === null` ⇒ el contexto queda tal como
 * lo dejaría la pasada 1 (`ctx.graph === null`, `ctx.graphIndex() === null`),
 * que es como se prueba que el detector degrada bien sin grafo.
 */
export function withGraph<K extends string>(ctx: RunContext<K>, graph: CodeGraph | null): RunContext<K> {
  let index: GraphIndex | null | undefined;
  return {
    ...ctx,
    graph,
    graphIndex: () => {
      if (index === undefined) index = graph ? buildGraphIndex(graph) : null;
      return index;
    },
  };
}
