/**
 * `complexity` — Complejidad cognitiva alta (P9: migración de uno de los
 * cinco detectores que hasta hoy vivían dentro de `code-analyzer.ts`,
 * CONTRATOS.md/PLAN.md §4.1 "Complejidad cognitiva | función | Sí, ya |
 * nada nuevo").
 *
 * Relación: complejidad cognitiva (SonarSource S3776) de una función por
 * encima de un umbral — cada bifurcación suma 1, más 1 por cada nivel de
 * anidamiento en el que aparece, así que tres `if` anidados pesan más que
 * tres `if` consecutivos aunque el conteo de ramas sea igual.
 *
 * DESVIACIÓN DECLARADA (P9, no una elección de estilo): este detector NO
 * recorre `fn.node` — `branches`/`cognitive`/`maxNesting` ya los calcula, en
 * UN solo recorrido por archivo, el walker de `code-analyzer.ts`
 * (`walkFile`), que también arma `CloneCandidate`s en la misma pasada por
 * costo (ver el docstring de ese archivo). Reconstruir esa cuenta acá
 * caminando `fn.node` sería la métrica dos veces, con dos oportunidades de
 * que se desalineen. La lógica de CONSTRUCCIÓN del hallazgo (título, texto,
 * severidad, consejo) vive acá, en `buildComplexityFinding`, exportada: el
 * `run` del contrato la usa adaptando un `FunctionUnit`, y
 * `code-analyzer.ts` la usa directo sobre su propio `FunctionInfo` (que ya
 * trae los mismos campos que `FunctionMetrics` — coincidencia de forma
 * verificada por el compilador, no repetida a mano) — así la salida es
 * IDÉNTICA sin que el número se calcule dos veces.
 *
 * AUDITORÍA F4/E1 (post-congelamiento del censo golden): `cognitive: 15` NO
 * cambió — coincide con el bare number que `code-analyzer.ts` documenta como
 * el que tenía este mismo umbral antes de esta extracción. Aun así, el censo
 * sobre el corpus (8 repos externos) muestra +204 hallazgos nuevos de
 * `complexity` frente a la línea base congelada. Verificado que NO es este
 * umbral: revirtiendo a mano, sólo como experimento, el fix de
 * `code-grammar.ts` que hace que el `except_clause` de Python cuente para
 * `branchNodes`/`nestingNodes` (antes invisible ahí — una cuenta baja
 * silenciosa), el censo de `click` vuelve a calzar EXACTO (15/15) con este
 * mismo `citado(15)` sin tocar. La causa del delta es ese fix de gramática,
 * ajeno a este archivo — no un cambio de umbral.
 */
import { suggest } from "../../code-suggest.js";
import { citado } from "../thresholds.js";
import type { Threshold } from "../thresholds.js";
import type { FunctionMetrics, FunctionUnit, IntraFunctionDetector, RawFinding, RunContext } from "../types.js";

type ThresholdKey = "cognitive";

/** Lo mínimo que hace falta para construir el hallazgo: métricas + ubicación con nombre ya resuelto (nunca `null`: quien llama decide el texto para función anónima). */
export type ComplexityInput = Pick<FunctionMetrics, "branches" | "cognitive" | "maxNesting"> & {
  name: string;
  file: string;
  startLine: number;
  endLine: number;
};

/**
 * Único lugar que arma el `RawFinding` de `complexity`. `null` si no cruza el umbral.
 *
 * OLA AI, FRENTE AI3 — POR QUÉ `symbol` SIGUE SIENDO `fn.name` Y NO SE TOCÓ.
 * El integrador de la Ola AH nombró esta línea (`symbol: fn.name`) como una de
 * las tres causas de que 122 ids de `complexity` nombraran a más de un
 * hallazgo: `run` de abajo escribe `fn.name ?? "(anónima)"`, así que TODAS las
 * funciones anónimas de un archivo comparten ancla y por lo tanto id
 * (`detect/ids.ts#findingId` no usa la línea, a propósito). Re-contado sobre
 * los 21 repos: **16 ids de `complexity` colisionados por función anónima en
 * bibliotecas y 86 en aplicaciones**; los otros 20 son dos miembros
 * HOMÓNIMOS del mismo archivo (sobrecargas de Java, dos clases en un
 * archivo), que un símbolo mejor para las anónimas no arreglaría.
 *
 * NO SE CAMBIA ACÁ, y la razón es la regla 2 de la Ola AI ("ninguna propuesta
 * juzgada verdadera puede perderse"): darle otro símbolo a las anónimas
 * cambiaría el id de TODOS los `complexity` anónimos del corpus —incluidos
 * los que la Ola AH ya juzgó— y dejaría esos veredictos huérfanos. El
 * problema se resuelve una sola vez, en
 * `code-finding-ids.ts#desambiguarIdsRepetidos`, que conserva el id del
 * primero en orden de lectura y sólo acuña uno nuevo para los siguientes.
 * Ver ahí el docstring completo.
 *
 * OLA AI, FRENTE AI3b — DOS CORRECCIONES DE CIFRA, re-contadas sobre los
 * mismos 21 volcados con un script escrito de cero:
 *
 *   · los kinds que hoy tienen al menos un id repetido son **24**, no 26 (18
 *     en biblioteca, 23 en aplicación, unión 24). Los 102/20 de arriba SÍ se
 *     reproducen dígito a dígito.
 *   · y `complexity` **no es el kind más golpeado por el símbolo anónimo**:
 *     de las 465 colisiones por símbolo ausente o anónimo del corpus,
 *     `long-function` se lleva **233 (50 %)** y `complexity` **102 (22 %)**.
 *     Medido además sobre los 60 kinds REGISTRADOS: **24 de 60 emiten al
 *     menos una fila cuya ancla entera es `(kind, archivo)` y nada más** —
 *     1.080 filas en biblioteca (10,7 %) y 4.241 en aplicación (22,1 %).
 */
export function buildComplexityFinding(fn: ComplexityInput, threshold: Threshold): RawFinding | null {
  if (fn.cognitive < threshold.value) return null;

  return {
    title: `${fn.name}: complejidad cognitiva ${fn.cognitive}`,
    detail:
      `Cuesta seguirla: ${fn.branches} bifurcaciones y hasta ${fn.maxNesting} niveles de ` +
      "anidamiento. Cada nivel pesa más que el anterior porque hay que sostener más contexto en la cabeza.",
    trigger: [{ label: "complejidad cognitiva", value: fn.cognitive, threshold }],
    locations: [
      {
        file: fn.file,
        startLine: fn.startLine,
        endLine: fn.endLine,
        symbol: fn.name,
        role: "función con complejidad cognitiva alta",
      },
    ],
    severity: Math.min(100, 30 + (fn.cognitive - threshold.value) * 3),
    advice: suggest({
      type: "high_complexity",
      context: {
        metric: "cognitive",
        value: fn.cognitive,
        threshold: threshold.value,
        dominantDriver: fn.maxNesting >= 3 ? "nesting" : "branchCount",
      },
    }),
  };
}

export const detector: IntraFunctionDetector<ThresholdKey, "complexity"> = {
  id: "complexity",
  kind: "complexity",
  scope: "intra-function",
  title: "Complejidad alta",
  needs: [],
  thresholds: {
    // 15 es el default de la propia regla S3776 de SonarSource — se
    // conserva en vez de inventar uno propio, para que el número se pueda
    // defender citando la fuente.
    cognitive: citado(15, { work: "SonarSource", rule: "S3776 — Cognitive Complexity" }),
  },
  run(fn: FunctionUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const threshold = ctx.threshold("cognitive");
    const finding = buildComplexityFinding(
      { ...fn.metrics, name: fn.name ?? "(anónima)", file: fn.file, startLine: fn.startLine, endLine: fn.endLine },
      threshold,
    );
    return finding ? [finding] : [];
  },
};
