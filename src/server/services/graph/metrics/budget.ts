/**
 * Presupuesto de CPU de una métrica — CONTRATO-F4.md §3.2. Ver la nota de
 * proceso en `types.ts`: infraestructura compartida mínima, creada porque
 * `graph/metrics/` no existía.
 *
 * `maxMs` por defecto se declara con `pisoDeclarado()` (nunca un número
 * suelto — regla transversal de CONTRATO-F4.md), reutilizando las mismas
 * factorías con marca de `detect/thresholds.ts` que ya exigen fuente para
 * todo umbral de detector. El techo elegido replica el que `code-analyzer.ts`
 * ya documenta y aplica para su propia tajada síncrona más grande
 * (`MAX_WALK_SLICE_MS`/`CLOCK_CHECK_INTERVAL`, ver su docstring): "acota el
 * peor caso de bloqueo de una corrida completa a una cifra de decenas bajas
 * de ms" — el requisito de esta tarea lo cita como "~25-30 ms". Se elige el
 * extremo superior declarado (30 ms) como TECHO por tajada: una métrica
 * puede cortar antes si su propio criterio de convergencia lo permite, pero
 * nunca debe reclamar más que eso sin devolver el control al event loop.
 */
import { pisoDeclarado, resolveThreshold } from "../../detect/thresholds.js";
import type { MetricBudget } from "./types.js";

const DEFAULT_METRIC_BUDGET_SPEC = pisoDeclarado(30, {
  rationale:
    "Techo de bloqueo síncrono por tajada de una métrica de grafo, replicando el rango " +
    "~25-30 ms que code-analyzer.ts's MAX_WALK_SLICE_MS/CLOCK_CHECK_INTERVAL documentan " +
    "como el peor caso tolerable de un corte de event loop en este proceso (mismo proceso " +
    "que sirve las PTYs/WebSockets de las tareas abiertas).",
});

/** Resuelto una sola vez por proceso — `pisoDeclarado` no depende de lenguaje ni corpus. */
export const DEFAULT_METRIC_BUDGET_MS: number = resolveThreshold(DEFAULT_METRIC_BUDGET_SPEC, {
  language: "n/a",
  sampleSize: () => 0,
  corpusP95: () => null,
}).value;

/**
 * *** LA DISTINCIÓN QUE ESTE ARCHIVO NO HACÍA, Y QUE COSTÓ LA REPRODUCIBILIDAD
 * DEL ANALIZADOR ENTERO (Ola AI, frente AI1). ***
 *
 * `createBudget()` es un presupuesto de TAJADA y se agota por RELOJ DE PARED.
 * Su único uso legítimo es el de `detect/run.ts:515`, que lo dice en su propio
 * comentario: cuando se agota, se CEDE el event loop y se vuelve a empezar —
 * "TODAS las unidades se visitan siempre; el orden y el conjunto de hallazgos
 * no puede depender de cuántas veces cede el proceso".
 *
 * Los `GraphMetric.compute` hacen lo contrario: cuando el presupuesto se
 * agota ABANDONAN el resultado (`status: "presupuesto-agotado"`, `values`
 * `undefined`), y sus siete llamadores de producción degradan eso a "sin
 * hallazgos" (`return []` / `return null` / `NEUTRAL_REACH`). Con un reloj de
 * pared adentro, **el CONTENIDO de la salida del analizador pasa a depender de
 * la carga de la máquina**: medido sobre el grafo real de `corpus-app/Ghost`,
 * `clustering` tarda 20,6–31,0 ms contra este techo de 30 ms y se agota ~4 de
 * cada 15 veces — es exactamente el `Ghost · fanout-without-cohesion` que pasó
 * de 0 a 40 hallazgos entre dos corridas del MISMO código.
 *
 * Un presupuesto puede decidir CUÁNTO TARDA algo. Nunca QUÉ DEVUELVE.
 *
 * De ahí esta segunda fábrica: el presupuesto de un cálculo que abandona **no
 * es un reloj**. No se agota nunca, y el techo de trabajo lo pone el propio
 * algoritmo de cada métrica, que ya lo tiene y es determinista:
 * `pagerank` corta en `MAX_ITERATIONS = 100` (`pagerank.ts:56`, citado de
 * NetworkX), `scc` es Tarjan O(V+E), `connected-components` es union-find
 * sobre las aristas, `instability` es una pasada lineal, y `clustering` recorre
 * cada nodo una vez. **Ninguna de las cinco puede no terminar.**
 *
 * NO reemplaza a `createBudget()` ni cambia su valor: `detect/run.ts` sigue
 * cediendo el event loop cada 30 ms exactos, que es la latencia que este
 * módulo existe para proteger.
 */
export function createComputeBudget(): MetricBudget {
  return { maxMs: Number.POSITIVE_INFINITY, expired: () => false };
}

/** Fábrica de `MetricBudget`: arranca el reloj en el momento de la llamada. */
export function createBudget(maxMs: number = DEFAULT_METRIC_BUDGET_MS): MetricBudget {
  const startedAt = performance.now();
  return {
    maxMs,
    expired: () => performance.now() - startedAt >= maxMs,
  };
}
