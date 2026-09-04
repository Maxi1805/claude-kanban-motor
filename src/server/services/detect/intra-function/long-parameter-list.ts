/**
 * `long-parameter-list` — exceso de parámetros (P9: migración de uno de los
 * cinco detectores que hasta hoy vivían dentro de `code-analyzer.ts`,
 * CONTRATOS.md/PLAN.md §4.1 "Exceso de parámetros | función | Sí, ya | nada
 * nuevo").
 *
 * Relación: cantidad de parámetros declarados por encima de un umbral.
 * Cuando la función además es un constructor (`isConstructor`), se agrega
 * la hipótesis de patrón Builder — el caso clásico de constructor
 * telescópico — porque ahí sí hay evidencia sintáctica de que se está
 * construyendo por combinación de argumentos, no sólo recibiendo muchos.
 *
 * DESVIACIÓN DECLARADA (misma que el resto del lote P9): `parameters` e
 * `isConstructor` ya los calcula el walker de `code-analyzer.ts`, así que
 * este módulo no vuelve a caminar `fn.node`.
 * `buildLongParameterListFinding` es el único lugar que arma el hallazgo.
 *
 * AUDITORÍA F4/E1 (post-congelamiento del censo golden): `parameters: 6` NO
 * cambió — mismo bare number que `code-analyzer.ts` documenta como el que
 * tenía este umbral antes de la extracción. El censo sobre el corpus (8
 * repos externos) muestra +29 hallazgos nuevos de `long-parameter-list`
 * frente a la línea base congelada. Probado por fuerza bruta contra `click`
 * que NO es este umbral (7, 8, 9, 10 — ninguno reproduce la línea base
 * exacta, y subir de 6 a 7 hace CAER el total muy por debajo de lo
 * congelado en vez de acercarlo): la firma de una cuenta de parámetros por
 * función que se movió entre el congelamiento y hoy, no de este número. Ver
 * `complexity.ts` para el caso gemelo donde sí se identificó la causa
 * exacta (un fix de `code-grammar.ts`, ajeno a este archivo).
 */
import { citado } from "../thresholds.js";
import type { Threshold } from "../thresholds.js";
import type { FunctionMetrics, FunctionUnit, IntraFunctionDetector, RawFinding, RunContext } from "../types.js";

type ThresholdKey = "parameters";

export type LongParameterListInput = Pick<FunctionMetrics, "parameters" | "isConstructor"> & {
  name: string;
  file: string;
  startLine: number;
  endLine: number;
};

/** Único lugar que arma el `RawFinding` de `long-parameter-list`. `null` si no cruza el umbral. */
export function buildLongParameterListFinding(fn: LongParameterListInput, threshold: Threshold): RawFinding | null {
  if (fn.parameters < threshold.value) return null;

  return {
    title: `${fn.name} recibe ${fn.parameters} parámetros`,
    detail: "Muchos parámetros son difíciles de recordar y suelen viajar juntos: a menudo son un objeto esperando a nacer.",
    trigger: [{ label: "parámetros", value: fn.parameters, threshold }],
    locations: [
      {
        file: fn.file,
        startLine: fn.startLine,
        endLine: fn.endLine,
        symbol: fn.name,
        role: "función con exceso de parámetros",
      },
    ],
    severity: Math.min(100, 25 + fn.parameters * 5),
    advice: {
      primary: {
        name: "Introduce Parameter Object",
        kind: "refactorizacion",
        why: "Los parámetros que siempre viajan juntos suelen ser un objeto que todavía no existe.",
        source: "https://refactoring.guru/es/smells/long-parameter-list",
      },
      // Sólo en un CONSTRUCTOR: esa es la forma de constructor telescópico
      // que Builder resuelve. En un método común sería sobre-ingeniería.
      ...(fn.isConstructor
        ? {
            pattern: {
              name: "Builder",
              kind: "patron_de_diseno" as const,
              why: "Un constructor telescópico es el caso que Builder resuelve: construir por pasos en vez de con una lista larga.",
              source: "https://refactoring.guru/es/design-patterns/builder",
              caveat:
                "Conviene cuando hay varias combinaciones válidas de argumentos; con una sola, un objeto de parámetros alcanza.",
              cost: "Agrega una clase por cada objeto construido y aleja la construcción del tipo.",
            },
          }
        : {}),
    },
  };
}

export const detector: IntraFunctionDetector<ThresholdKey, "long-parameter-list"> = {
  id: "long-parameter-list",
  kind: "long-parameter-list",
  scope: "intra-function",
  title: "Exceso de parámetros",
  needs: [],
  thresholds: {
    // Entre el 5 de RuboCop y el 7 de SonarQube: se elige el punto medio
    // para que la señal siga siendo poco frecuente, con ambas fuentes
    // citadas en vez de un número inventado.
    parameters: citado(6, {
      work: "RuboCop Metrics/ParameterLists (máx. 5) y SonarQube S107 (máx. 7)",
      rule: "punto medio entre ambas reglas, para mantener la señal poco frecuente",
    }),
  },
  run(fn: FunctionUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const threshold = ctx.threshold("parameters");
    const finding = buildLongParameterListFinding(
      { ...fn.metrics, name: fn.name ?? "(anónima)", file: fn.file, startLine: fn.startLine, endLine: fn.endLine },
      threshold,
    );
    return finding ? [finding] : [];
  },
};
