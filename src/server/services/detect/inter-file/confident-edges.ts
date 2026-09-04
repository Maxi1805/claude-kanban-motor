/**
 * `confidentEdges` — CONTRATO-F9.md §4.5: "las aristas ambiguas quedan FUERA
 * de toda consulta por defecto. Un consumidor que las quiera las pide
 * explícitamente." Los 17 detectores `inter-file` de este directorio
 * calculan su propia proyección directamente sobre `RepoUnit.graph` (no
 * pasan por `graph/metrics/*`, documentado en varios de sus docstrings:
 * "no tenían acceso a la superficie compartida, así que resuelven
 * localmente") y, hasta esta ola, ninguno de los 17 mencionaba `ambiguous`
 * en absoluto — trataban "sabemos que hay relación, no cuál" como si fuera
 * una arista firme. Mismo criterio ya usado por
 * `graph/metrics/projection.ts#projectGraph` y
 * `graph/edges/carries-derive.ts`: filtrar con `edgeIsAmbiguous`
 * (`graph/types.ts`), la única fuente de verdad de la condición — este
 * módulo no la reinventa, sólo la aplica a `CodeGraph.edges` entero para los
 * detectores cuyo barrido no tenía ya un predicado propio por arista.
 *
 * Sólo excluye `ambiguous`. Un detector que además excluye `inferred`
 * (evidencia heurística — decisión propia de CADA detector, documentada en
 * su docstring, p.ej. `dependency-cycle.ts#isConfidentDependencyEdge`) sigue
 * aplicando ese segundo filtro él mismo, con su propio predicado — este
 * helper no sustituye a esos, sólo les agrega la exclusión que les faltaba
 * (ver el `&& !edgeIsAmbiguous(...)` agregado a cada uno).
 */
import { edgeIsAmbiguous, type CodeGraph, type CodeGraphEdge } from "../../graph/types.js";

/**
 * OLA V — MEMOIZACIÓN POR IDENTIDAD DEL ARREGLO DE ARISTAS.
 *
 * *Intención del caché:* **"esta proyección es una función PURA del arreglo de
 * aristas; dos llamadas con el MISMO arreglo tienen por definición la misma
 * respuesta, así que recorrerlo dos veces es trabajo repetido, nunca información
 * nueva."** No es una heurística ni un umbral: si la clave es la misma
 * referencia de arreglo, el resultado es idénticamente el mismo valor que
 * devolvería el `filter`.
 *
 * **Por qué hizo falta.** Hasta la Ola V esta función se llamaba con
 * `graph === null` en el camino de hipótesis (el grafo nunca llegaba), así que
 * su costo no existía. El cableado del grafo a las hipótesis (Ola V, frente V1,
 * `hypotheses/run.ts#rebuildHypothesesWithGraph`) la puso en el camino caliente:
 * **16 de los 17 `<patron>.ts` la llaman DENTRO de `build()`**, varios dos veces,
 * o sea una o dos veces POR HIPÓTESIS CANDIDATA. Medido por V1 en hugo: 50.461
 * aristas, 1,4 ms por llamada, 881 hallazgos-ancla ⇒ el 92 % del sobrecosto de
 * la pasada nueva (`+39,6 s` en hugo, `+159 s` en guava) es esta función, no el
 * reparseo (3,2 s medidos aislando `resolveLiveFileUnit`). Es la misma regla que
 * `ola-n/CONTRATO-UNIFICACION.md` §3 ya le había prohibido a los DETECTORES
 * ("usá `ctx.graphIndex()`, no `graph.edges.filter(...)`: recorrer las aristas
 * por función es O(funciones × aristas)"), que del lado de las hipótesis nunca
 * había importado porque el grafo llegaba `null`.
 *
 * **Por qué la clave es `graph.edges` y no `graph`.** Un `CodeGraph` se ensambla
 * SIEMPRE con un arreglo `edges` recién construido (`graph/build.ts#buildGraph`
 * y `#assembleGraph`, los dos únicos caminos que producen un `CodeGraph`
 * completo: los dos hacen `edges: [ ...listas ]`), y **nadie muta `edges` en
 * sitio** — verificado: no hay un solo `.push`/`.splice`/`.sort` sobre las
 * aristas de un `CodeGraph` ya ensamblado en todo `src/`, los `push` que existen
 * son sobre arreglos LOCALES durante la construcción. Clavar la clave al arreglo
 * y no al grafo hace que un grafo re-ensamblado (o cualquier grafo cuyo `edges`
 * se reemplace) produzca automáticamente una entrada nueva: la caché no puede
 * quedar vencida sin que la clave cambie.
 *
 * `WeakMap` ⇒ la entrada muere con el grafo; no retiene memoria entre corridas.
 */
const CACHE = new WeakMap<readonly CodeGraphEdge[], readonly CodeGraphEdge[]>();

/** `graph.edges` sin las `provenance === "ambiguous"`. Drop-in para un barrido `for (const edge of graph.edges)` que hoy no tiene ningún predicado de confianza propio. */
export function confidentEdges(graph: CodeGraph): readonly CodeGraphEdge[] {
  const key = graph.edges;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const computed = key.filter((e) => !edgeIsAmbiguous(e));
  CACHE.set(key, computed);
  return computed;
}
