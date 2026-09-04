/**
 * `reach` — CONTRATO-F5.md §1.5. Cuánto código depende del archivo afectado
 * por un hallazgo, para que el ranking no dependa sólo de qué tan malo es UN
 * caso (`R_sev`, `ranking.ts`) ni de qué tan grave es la CLASE de problema
 * (`impact.ts`), sino también de dónde vive.
 *
 * ```
 * reach(file) = 0.50·R(pagerank[file]) + 0.30·R(fanIn[file]) + 0.20·sccBoost(file)
 * sccBoost(file) = 1 si file pertenece a una SCC (`scc`, tamaño >= 2), si no 0
 * ```
 *
 * `R(·)` es rango normalizado (`rank.ts#normalizedRanks`), NUNCA el valor
 * crudo — la razón, medida y ya declarada por `pagerank.ts`/CONTRATO-F4.md:
 * fan-in tiene cola larguísima (un hub contra una mediana baja) y en una
 * suma ponderada por VALOR se comería todo lo demás. El rango la aplasta a
 * [0,1] por construcción, sin elegir log ni winsorizar.
 *
 * DE DÓNDE SALE CADA NÚMERO, SIN RECOMPUTAR NINGÚN ALGORITMO — sólo se llama
 * a `GRAPH_METRICS` ya implementadas, proyección `file`:
 *   - `pagerank` → `graph/metrics/pagerank.ts#pagerank`, campo `.pagerank`.
 *   - `fanIn` → el MISMO resultado de `pagerank.compute`, campo `.fanIn`
 *     (fan-in crudo, ya lo trae empaquetado junto al puntaje — no hace falta
 *     un segundo cómputo). DESVIACIÓN medida respecto al texto del contrato:
 *     CONTRATO-F5.md §1.5 dice que fanIn "lo publica ... el resultado de
 *     `instability`" — verificado (`instability.ts`): esa métrica opera
 *     EXCLUSIVAMENTE sobre la proyección `module` (devuelve `no-aplicable`
 *     para cualquier otra) y expone `Ca`/`Ce` agregados a nivel paquete, no
 *     fan-in crudo por archivo. `pagerank.ts` sí expone fan-in crudo a nivel
 *     `file` — exactamente la granularidad que pide la fórmula — así que se
 *     usa esa fuente en su lugar: mismo principio ("sin recomputar"), fuente
 *     distinta a la que el texto nombra, elegida porque es la que realmente
 *     tiene el dato a esta granularidad.
 *   - `sccBoost` → `graph/metrics/ciclos.ts#scc`, `DependencyCycle` con
 *     `size >= 2` ya filtrado por la propia métrica (los tamaños 1 no entran
 *     en `values`).
 *
 * `clustering`/`louvain`/`connected-components` NO se computan acá — CONTRATO-F5.md
 * §1.5: describen la forma del vecindario, no cuánto se rompe si se toca
 * esto; agregarlas sería 2 grados de libertad más al barrido sin hipótesis
 * medible detrás.
 *
 * Presupuesto: se midió (fuera de este archivo, corpus de la Ola 5) que
 * `pagerank`/`scc` convergen muy por debajo del techo por tajada de
 * `graph/metrics/budget.ts#createBudget()` incluso en el repo más grande del
 * corpus de calibración.
 *
 * OLA AI (frente AI1) — ESE TECHO YA NO SE USA ACÁ, y la razón no es que la
 * medición estuviera mal sino que la CONDICIÓN estaba mal elegida: el techo
 * por tajada es un RELOJ DE PARED, y acá un presupuesto agotado no retrasa el
 * resultado sino que lo CAMBIA (`NEUTRAL_REACH` para el repo entero ⇒ otro
 * `score` para TODOS los hallazgos, `code-analyzer.ts#scoreFindings`). Con un
 * reloj adentro, el ranking del analizador depende de la carga de la máquina.
 * Se usa `createComputeBudget()` (ver su docstring en `budget.ts`): el techo
 * de trabajo lo pone el propio algoritmo — `MAX_ITERATIONS = 100` en
 * `pagerank`, Tarjan O(V+E) en `scc` — que es determinista. La rama de caída
 * a `NEUTRAL_REACH` NO se toca: sigue cubriendo el `catch` y el "sin grafo".
 */
import { scc } from "../graph/metrics/ciclos.js";
import { pagerank } from "../graph/metrics/pagerank.js";
import { projectGraph } from "../graph/metrics/projection.js";
import { createComputeBudget } from "../graph/metrics/budget.js";
import type { CodeGraph } from "../graph/types.js";
import { normalizedRanks } from "./rank.js";

const PAGERANK_WEIGHT = 0.5;
const FAN_IN_WEIGHT = 0.3;
const SCC_BOOST_WEIGHT = 0.2;

/** `reach ∈ [0, 1]` por archivo (ruta relativa al repo, sin el prefijo `file:` del grafo). */
export interface ReachIndex {
  reachFor(file: string): number;
}

/** Sin grafo, o ninguna métrica computó: 0.5 para todo — CONTRATO-F5.md §1.5,
 *  "nunca 0: 0 afirmaría que el archivo no le importa a nadie". */
const NEUTRAL_REACH: ReachIndex = { reachFor: () => 0.5 };

export function computeReachIndex(graph: CodeGraph | null): ReachIndex {
  if (!graph) return NEUTRAL_REACH;

  try {
    const prGraph = projectGraph(graph, "file", pagerank.edgeKinds);
    const prResult = pagerank.compute(prGraph, { budget: createComputeBudget() });
    if (prResult.status !== "computed" || !prResult.values) return NEUTRAL_REACH;

    const sccGraph = projectGraph(graph, "file", scc.edgeKinds);
    const sccResult = scc.compute(sccGraph, { budget: createComputeBudget() });
    const cycleMembers = sccResult.status === "computed" && sccResult.values ? sccResult.values : new Map();

    const fileIds = prGraph.nodeIds; // "file:<path>", ya denso — projectGraph los ordena
    const pageRankValues = fileIds.map((id) => prResult.values!.get(id)?.pagerank ?? 0);
    const fanInValues = fileIds.map((id) => prResult.values!.get(id)?.fanIn ?? 0);
    const rPagerank = normalizedRanks(pageRankValues);
    const rFanIn = normalizedRanks(fanInValues);

    const reachById = new Map<string, number>();
    for (let i = 0; i < fileIds.length; i++) {
      const sccBoost = cycleMembers.has(fileIds[i]!) ? 1 : 0;
      reachById.set(
        fileIds[i]!,
        PAGERANK_WEIGHT * rPagerank[i]! + FAN_IN_WEIGHT * rFanIn[i]! + SCC_BOOST_WEIGHT * sccBoost,
      );
    }

    return {
      reachFor(file: string): number {
        return reachById.get(`file:${file}`) ?? 0.5;
      },
    };
  } catch {
    // Misma disciplina que el resto de crossAnalyze: un fallo en las
    // métricas de grafo no debe tumbar el ranking completo, sólo degradarlo
    // al neutro declarado.
    return NEUTRAL_REACH;
  }
}
