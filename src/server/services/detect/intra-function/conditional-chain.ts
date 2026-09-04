/**
 * `conditional-chain` — cadena larga de condicionales / type switch (P9:
 * migración de uno de los cinco detectores que hasta hoy vivían dentro de
 * `code-analyzer.ts`, CONTRATOS.md/PLAN.md §4.1 "Cadena de condicionales |
 * función | Sí, ya | nada nuevo").
 *
 * Relación: longitud de la escalera if/elsif o case/when más larga dentro
 * de una función, por encima de un umbral. Dos sub-formas, mutuamente
 * excluyentes, según lo que la escalera HACE (no cuántas ramas tiene):
 *   - cada rama CONSTRUYE un tipo distinto y la función NO es ella misma
 *     una fábrica (`isFactoryLike`) ⇒ es la selección de tipo a construir
 *     embebida en lógica de negocio, el síntoma que Factory Method aborda.
 *   - en cualquier otro caso (no instancia tipos distintos) ⇒ escalera
 *     genérica de condiciones, señal más débil, sin patrón sugerido.
 *   - EXCEPCIÓN: si construye tipos distintos PERO la función ya es una
 *     fábrica (`isFactoryLike`), no hay hallazgo — la escalera YA ES el
 *     método de creación, moverla sería puro churn. Ver `code-suggest.ts`.
 *
 * DESVIACIÓN DECLARADA (P9, misma razón que `complexity.ts`): `chain`,
 * `chainHasNullCheck`, `chainInstantiates` e `isFactoryLike` ya los calcula
 * el walker de `code-analyzer.ts` en su única pasada por archivo; este
 * módulo no vuelve a caminar `fn.node`. `buildConditionalChainFinding` es el
 * único lugar que arma el hallazgo; `run` (el contrato) y
 * `code-analyzer.ts` (el pipeline real) llaman a la misma función.
 */
import { suggest } from "../../code-suggest.js";
import { derivado } from "../thresholds.js";
import type { Threshold } from "../thresholds.js";
import type { FunctionMetrics, FunctionUnit, IntraFunctionDetector, RawFinding, RunContext } from "../types.js";

type ThresholdKey = "chainLength";

export type ConditionalChainInput = Pick<
  FunctionMetrics,
  "chain" | "chainHasNullCheck" | "chainInstantiates" | "isFactoryLike"
> & {
  name: string;
  file: string;
  startLine: number;
  endLine: number;
};

/** Único lugar que arma el `RawFinding` de `conditional-chain`. `null` si no cruza el umbral, o si la escalera ya es la fábrica misma. */
export function buildConditionalChainFinding(fn: ConditionalChainInput, threshold: Threshold): RawFinding | null {
  if (fn.chain < threshold.value) return null;

  const location = { file: fn.file, startLine: fn.startLine, endLine: fn.endLine, symbol: fn.name };

  if (fn.chainInstantiates && !fn.isFactoryLike) {
    return {
      variant: "instantiates",
      title: `${fn.name} elige qué clase instanciar entre ${fn.chain} ramas`,
      detail:
        "Un condicional que decide qué tipo construir, embebido en la lógica. " +
        "Cada tipo nuevo obliga a volver acá, y quien llama queda atado a los tipos concretos.",
      trigger: [{ label: "tipos construidos", value: fn.chain, threshold }],
      locations: [{ ...location, role: "selector de tipo a instanciar" }],
      severity: Math.min(100, 45 + fn.chain * 6),
      advice: {
        primary: {
          name: "Extract Method",
          kind: "refactorizacion",
          why: "Aislar la construcción en su propio método deja la decisión en un solo lugar.",
          source: "https://refactoring.guru/es/smells/switch-statements",
        },
        pattern: {
          name: "Factory Method",
          kind: "patron_de_diseno",
          why: "Ese método de creación, extendido por subclases, es literalmente el patrón.",
          source: "https://refactoring.guru/es/design-patterns/factory-method",
          caveat:
            "Requiere que los tipos construidos compartan una interfaz común, que el análisis sintáctico no puede verificar.",
          cost: "Suma una jerarquía de creadores: si los tipos no crecen, es más estructura sin beneficio.",
        },
      },
    };
  }

  // La construcción de tipos distintos dentro de una función que ya ES una
  // fábrica (`isFactoryLike`) no es un hallazgo: la escalera ya cumple el
  // rol que Factory Method propondría. Ninguna otra rama la reemplaza.
  if (fn.chainInstantiates) return null;

  return {
    variant: "ladder",
    title: `Cadena de ${fn.chain} condiciones en ${fn.name}`,
    detail:
      "Una escalera de condiciones larga suele estar decidiendo por tipo o por estado. " +
      "Cada rama nueva obliga a volver a tocar esta función.",
    trigger: [{ label: "ramas encadenadas", value: fn.chain, threshold }],
    locations: [{ ...location, role: "cadena larga de condicionales" }],
    severity: Math.min(100, 40 + fn.chain * 6),
    advice: suggest({
      type: "conditional_chain",
      context: {
        branchCount: fn.chain,
        // Sin resolución de tipos el discriminante no se puede clasificar
        // más allá de esto; el mapeo sabe quedarse tentativo.
        discriminantKind: fn.chainHasNullCheck ? "nullCheck" : "unknown",
        branchesInstantiateDistinctTypes: fn.chainInstantiates,
        branchesCallSameMethodWithDifferentArgs: false,
      },
    }),
  };
}

export const detector: IntraFunctionDetector<ThresholdKey, "conditional-chain"> = {
  id: "conditional-chain",
  kind: "conditional-chain",
  scope: "intra-function",
  title: "Cadena de condicionales",
  needs: [],
  thresholds: {
    // R3 (auditoría de umbrales inventados): éste era el caso que el propio
    // repo citaba textualmente como confesión ("elegido a mano, ninguna
    // herramienta externa consultada"). Sigue sin haber una fuente PUBLICADA
    // que fije "cuántos peldaños son demasiados" para una escalera if/elsif
    // o case/when, así que no hay `citado()` posible — pero con el corpus de
    // 8 repos externos (`scripts/generate-benchmarks.mts`, `graph/benchmarks.json`,
    // generado 2026-07-29) ya hay una DISTRIBUCIÓN real contra la que medir
    // el piso 5, en vez de aceptar el número a ciegas:
    //   p95 de `chainLength` por lenguaje — java=1, tsx=1, go=1, ruby=2,
    //   python=2, javascript=2, csharp=2, typescript=2, vue=2 (p99 más alto,
    //   go=4 es el techo de todo el corpus). 5 queda POR ENCIMA del p95 y del
    //   p99 de los 9 lenguajes medidos — el piso no es un número mágico, es
    //   deliberadamente más conservador que la cola alta de la distribución
    //   real, exactamente lo que el rationale original decía en prosa
    //   ("mantener la señal poco frecuente") pero ahora con la medición atrás.
    // `of: "chainLength"` usa textualmente el nombre que
    // `graph/thresholds.ts#getCorpusBenchmarks` ya sabe leer: cuando ese
    // `Benchmarks` se cablee en producción (código fuera de `detect/**`,
    // pendiente — ver el docstring de `graph/thresholds.ts`), este umbral
    // pasa a `Max(5, p95(corpus, lenguaje))` sin tocar este archivo de nuevo.
    // Hoy, sin ese cableado, resuelve exactamente a 5 — mismo valor y mismo
    // comportamiento que el `pisoDeclarado(5, …)` que reemplaza.
    chainLength: derivado({
      floor: 5,
      stat: "p95",
      of: "chainLength",
      floorSource: {
        rationale:
          "p95 de chainLength medido contra el corpus de 8 repos externos (9 lenguajes, n=671..33194 por lenguaje, " +
          "graph/benchmarks.json, generado 2026-07-29): el máximo p95 observado es 2 (p99 máximo 4, en go); un " +
          "piso de 5 queda por encima de la cola alta de los 9 lenguajes, manteniendo la señal poco frecuente " +
          "con una medición real detrás en vez de un número elegido a mano sin consultar nada externo.",
      },
    }),
  },
  run(fn: FunctionUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const threshold = ctx.threshold("chainLength");
    const finding = buildConditionalChainFinding(
      { ...fn.metrics, name: fn.name ?? "(anónima)", file: fn.file, startLine: fn.startLine, endLine: fn.endLine },
      threshold,
    );
    return finding ? [finding] : [];
  },
};
