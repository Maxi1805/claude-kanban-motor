/**
 * Inestabilidad de Martin — `I = Ce / (Ca + Ce)`.
 * CONTRATO-F4.md §3.1, fila `instability` (proyección `module`, aristas
 * `imports`/`extends`/`implements`, costo `lineal`).
 *
 * FUENTE: Robert C. Martin, "OO Design Quality Metrics: An Analysis of
 * Dependencies", C++ Report (Object Mentor, 1994), y el mismo nombre y
 * fórmula en el capítulo "Principios de paquetes" de *Agile Software
 * Development, Principles, Patterns, and Practices* (Prentice Hall, 2002).
 * `Ca` = acoplamiento AFERENTE: cuántas otras unidades dependen de ésta.
 * `Ce` = acoplamiento EFERENTE: de cuántas otras unidades depende ésta.
 * `I = 0` ⇒ máximamente ESTABLE (todo depende de mí, yo de nadie: cambiarla
 * es caro para el resto del sistema). `I = 1` ⇒ máximamente INESTABLE
 * (dependo de todos, nadie de mí: cambiarla es barato, no rompe a nadie).
 *
 * PROYECCIÓN — `module`, no `file` ni `symbol`: Martin definió la métrica
 * sobre PAQUETES de clases, y `module` (CONTRATO-F4.md §3.1: "el nodo
 * `folder:` más profundo que contiene al archivo") es el análogo más fiel
 * que este grafo tiene hoy a un paquete.
 *
 * ARISTAS — `imports`/`extends`/`implements`, no `references` cruda: son
 * las tres formas de acoplamiento ESTRUCTURAL/de tipo entre unidades que
 * Martin mide (una unidad que importa, hereda o implementa otra DEPENDE de
 * ella en el sentido de paquetes). `references` mezclaría cualquier mención
 * textual resuelta, incluida la aceptada por la etapa heurística
 * `path-proximity` — la brecha ya declarada en CONTRATO-F4.md §2.5 y en el
 * reporte de F3 (domina el 81% de lo aceptado en guava, sin dataset
 * etiquetado que la cubra). Dejar `references` afuera es consistente con esa
 * brecha, no un descuido.
 *
 * `Ca`/`Ce` SE CUENTAN COMO GRADO (cantidad de MÓDULOS DISTINTOS acoplados),
 * no como suma de peso de arista: `projectGraph` ya colapsa la granularidad
 * símbolo-a-símbolo dentro de cada módulo a propósito (CONTRATO-F4.md §3.1),
 * así que "cuántas veces" ya no es una unidad significativa a este nivel —
 * lo que sobrevive y es honesto es "con cuántos OTROS módulos distintos".
 * `out[i].length` ya es ese grado sin duplicados (`projectGraph` colapsa
 * ocurrencias repetidas entre el mismo par de módulos a una sola entrada).
 *
 * `Ca + Ce === 0` (módulo sin NINGUNA arista de estos 3 tipos, ni entrante
 * ni saliente) ⇒ el módulo NO aparece en `values`: la razón es `0/0`, no
 * está definida, y reportar `0` se leería como "máximamente estable" — falso
 * para un módulo que simplemente no tiene señal en estos 3 tipos de arista
 * todavía (misma disciplina "no aplicable, nunca cero" de CONTRATO-F4.md,
 * aplicada acá a nivel de un nodo individual dentro de un mapa parcialmente
 * poblado, que SÍ está permitido — lo prohibido es un mapa parcial por
 * PRESUPUESTO agotado a mitad de cómputo, no por ausencia de señal en un
 * nodo puntual).
 *
 * ABSTRACCIÓN Y DISTANCIA A LA SECUENCIA PRINCIPAL (`A`, `D = |A + I - 1|`)
 * — DELIBERADAMENTE NO IMPLEMENTADAS. Martin combina `I` con la
 * Abstractness `A = Na/Nc` (proporción de clases abstractas/interfaces
 * sobre el total del paquete). Verificado contra `graph/symbols.ts`
 * (`SymbolFamily = "class-like" | "function-like" | "namespace-like" |
 * "other"`, el único vocabulario de "qué es un símbolo" que este grafo
 * tiene hoy): NINGUNA de las cuatro variantes distingue interfaz/clase
 * abstracta de clase concreta, en NINGÚN lenguaje — con o sin interfaces
 * declaradas. En un lenguaje CON interfaces declaradas (Java, C#, TS, Go)
 * `A` SERÍA derivable en principio filtrando por tipo de nodo de interfaz,
 * igual que ya hace `graph/edges/interfaz-declarada.ts` para las aristas
 * `implements` — pero en uno SIN interfaces declaradas (Ruby, Python)
 * "abstracto" sólo existe por convención (un método que levanta
 * `NotImplementedError`, un mixin de sólo-protocolo) y NO es derivable de
 * la gramática sola: sería una lista de nombres, exactamente lo que este
 * contrato prohíbe. Añadir `A`/`D` de verdad exigiría un campo nuevo en
 * `SymbolFacts`/`CodeGraphNode` — propiedad de `graph/symbols.ts`/
 * `graph/types.ts`, dueños ajenos a esta tarea (regla 6: no tocar un
 * archivo ajeno). Se deja fuera, declarado por escrito, en vez de simulado
 * con un proxy (p.ej. "cuántos otros módulos implementan a éste" como señal
 * indirecta de abstracción) que nadie validó.
 */
import type { EdgeKind } from "../types.js";
import type { GraphMetric, MetricResult, ProjectedGraph } from "./types.js";

/** CONTRATO-F4.md §3.1, fila `instability`. Las tres formas de acoplamiento
 *  de tipo/estructura entre módulos — ver el docstring del módulo para por
 *  qué NO incluye `references`. */
const EDGE_KINDS_FOR_INSTABILITY: readonly EdgeKind[] = ["imports", "extends", "implements"];

function computeDegrees(g: ProjectedGraph): { readonly ce: Int32Array; readonly ca: Int32Array } {
  const n = g.nodeIds.length;
  const ce = new Int32Array(n);
  const ca = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const outs = g.out[i]!;
    ce[i] = outs.length; // grado saliente ya deduplicado por projectGraph
    for (const j of outs) ca[j]! += 1;
  }
  return { ce, ca };
}

export const instability: GraphMetric<number> = {
  id: "instability",
  title: "Inestabilidad de Martin (I = Ce/(Ca+Ce))",
  projection: "module",
  edgeKinds: EDGE_KINDS_FOR_INSTABILITY,
  cost: "lineal",

  compute(g, ctx): MetricResult<number> {
    const start = performance.now();
    if (g.projection !== "module") {
      return {
        status: "no-aplicable",
        elapsedMs: performance.now() - start,
        reason: `instability opera sobre la proyección "module"; se recibió "${g.projection}".`,
      };
    }

    // Chequeo ÚNICO antes de arrancar, no trocear a mitad del paso: medido
    // sobre el grafo real de guava (ver el reporte de esta tarea), un paso
    // lineal completo — incluso al tamaño de un grafo símbolo-a-símbolo
    // completo, muy por encima de lo que `module` produce nunca — corre en
    // milisegundos de un solo dígito, muy por debajo del piso de la tabla
    // (`DEFAULT_METRIC_BUDGET_MS`, `budget.ts`). Cortar a la MITAD de este
    // paso produciría el mapa parcial que `MetricResult` prohíbe
    // explícitamente, así que la única degradación honesta posible es
    // "todavía no" (antes de empezar), nunca "a medias".
    if (ctx.budget.expired()) {
      return {
        status: "presupuesto-agotado",
        elapsedMs: performance.now() - start,
        reason: `presupuesto ya agotado (${ctx.budget.maxMs} ms) antes de empezar; instability no trocea un paso lineal a medio camino.`,
      };
    }

    const n = g.nodeIds.length;
    if (n === 0) {
      return { status: "computed", values: new Map(), elapsedMs: performance.now() - start };
    }

    const { ce, ca } = computeDegrees(g);
    const values = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const denom = ca[i]! + ce[i]!;
      if (denom === 0) continue; // Ca=Ce=0: I no definida, ver docstring del módulo
      values.set(g.nodeIds[i]!, ce[i]! / denom);
    }

    return { status: "computed", values, elapsedMs: performance.now() - start };
  },
};
