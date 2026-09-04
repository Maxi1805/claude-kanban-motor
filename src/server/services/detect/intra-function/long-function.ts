/**
 * `long-function` — función larga (P9: migración de uno de los cinco
 * detectores que hasta hoy vivían dentro de `code-analyzer.ts`,
 * CONTRATOS.md/PLAN.md §4.1 "Función larga | función | Sí, ya | nada
 * nuevo").
 *
 * Relación: extensión en líneas (`endLine - startLine + 1`) por encima de un
 * umbral. La métrica más simple del lote — no depende de nada que el walker
 * no calcule ya trivialmente a partir de las posiciones del nodo función.
 *
 * DESVIACIÓN DECLARADA (misma que `complexity.ts`/`conditional-chain.ts`):
 * `startLine`/`endLine` ya los calcula el walker de `code-analyzer.ts`, así
 * que este módulo no vuelve a caminar `fn.node`. `buildLongFunctionFinding`
 * es el único lugar que arma el hallazgo.
 *
 * AUDITORÍA F4/E1 (post-congelamiento del censo golden): `lines: 45` NO
 * cambió — mismo bare number que `code-analyzer.ts` documenta como el que
 * tenía este umbral antes de la extracción. El censo sobre el corpus (8
 * repos externos) muestra +287 hallazgos nuevos de `long-function` frente a
 * la línea base congelada. Probado por fuerza bruta contra `click` que NO es
 * este umbral: ningún valor entero (55, 57, 58, 59...) reproduce la línea
 * base exacta — subirlo hace bajar unos archivos por debajo de lo congelado
 * mientras otros siguen por encima, la firma de una MÉTRICA que se movió
 * (líneas por función), no de un umbral. Ver `complexity.ts` para el caso
 * gemelo donde sí se identificó la causa exacta (un fix de
 * `code-grammar.ts`, ajeno a este archivo).
 *
 * JUICIO DE PRECISIÓN (frente de nivel 1, agosto 2026), FALSO POSITIVO
 * ENCONTRADO Y ARREGLADO: `endLine - startLine + 1` cuenta la EXTENSIÓN
 * FÍSICA del nodo función SIN distinguir código de TEXTO. Dos formas reales
 * verificadas a mano contra el corpus externo, mismo mecanismo de fondo:
 *
 *   1. Un DOCSTRING de Python (PEP-257) es, a diferencia de un comentario
 *      `#` o de un docblock JSDoc/Javadoc que precede a la firma (fuera del
 *      span del nodo, nunca cuenta), un STATEMENT real dentro del cuerpo.
 *      `click`: `make_pass_decorator` (`decorators.py:51`, 47 líneas) y
 *      `CliRunner.isolated_filesystem` (`testing.py:742`, 57 líneas) cruzan
 *      el umbral de 45 ÚNICAMENTE por un docstring de Sphinx
 *      (`:param:`/`.. versionchanged::`/`.. warning::`) de 20+ líneas — el
 *      cuerpo real, sin el docstring, tiene ~20 líneas en ambos casos, muy
 *      por debajo del umbral.
 *   2. Un TEMPLATE/HEREDOC de más de una línea (un `raw_string_literal` de
 *      Go entre backticks, un heredoc de Ruby, un template literal de
 *      JS/TS) es, estructuralmente, el mismo caso: texto estático que vive
 *      DENTRO del nodo función. `cobra`: `writePreamble`
 *      (`bash_completions.go:36`, 367 líneas) es ínTEGRAMENTE un script bash
 *      completo embebido como UN SOLO argumento string de `fmt.Sprintf` —
 *      el código Go real son 2 líneas (`WriteStringAndCheck(...)` dos
 *      veces); las otras ~365 son contenido de un archivo `.sh`, no lógica
 *      Go que "podría separarse en varias funciones" (la premisa exacta del
 *      `detail` de este hallazgo). Mismo patrón en `genZshComp`/
 *      `genFishComp`/`genBashComp`/`genPowerShellComp` del mismo repo.
 *
 * `multilineStringInteriorLines` generaliza la resta a UN mecanismo para las
 * dos formas: cualquier nodo de string/template/heredoc COMPLETO (nunca uno
 * de sus fragmentos internos) que ocupe más de una línea aporta sus filas
 * ESTRICTAMENTE INTERIORES (ni la de apertura ni la de cierre — ésas SIEMPRE
 * pueden compartir fila con código real, p.ej. `foo(\`` o `\`)`; las de en
 * medio de un literal multilínea están garantizadas 100% texto, nunca
 * código, en cualquiera de los 6 lenguajes soportados). Confirmado por
 * sonda directa contra las 6 gramáticas
 * (`scratchpad/precision-front/probe-string-nodes.mjs`): el nodo COMPLETO es
 * `string`/`string_literal` (simples), `verbatim_string_literal`/
 * `interpolated_string_expression` (C#), `raw_string_literal`/
 * `interpreted_string_literal` (Go), `template_string` (JS/TS), `heredoc_body`
 * (Ruby) — y sus fragmentos internos (`string_fragment`/
 * `multiline_string_fragment`/`string_start`/`string_content`/`string_end`/
 * `heredoc_beginning`/`heredoc_content`/`heredoc_end`/
 * `interpolated_string_text`) llevan todos una palabra de PARTE
 * (fragment/content/start/end/text/beginning) que los distingue del nodo
 * completo — UNA regex genérica aplicada idénticamente a los 6 lenguajes
 * (mismo estilo que `PRIMITIVE_TYPE_WORD`/`ACCESSOR_TOKENS` de otros
 * detectores de este mismo frente), nunca una lista de nombres por
 * lenguaje. Otros casos con literales igual de largos (`echo`, `wrap_text`,
 * `command`, `version_option` en `click`) SÍ siguen cruzando el umbral
 * incluso descontando el literal — el arreglo no los apaga, sólo saca los
 * que cruzaban ÚNICAMENTE por incluir texto estático.
 */
import type { ProbeNode } from "../../code-grammar.js";
import { suggest } from "../../code-suggest.js";
import { derivado } from "../thresholds.js";
import type { Threshold } from "../thresholds.js";
import { walkTree } from "../tree-walk.js";
import type { AstNode, FunctionUnit, IntraFunctionDetector, RawFinding, RunContext } from "../types.js";

type ThresholdKey = "lines";

export interface LongFunctionInput {
  name: string;
  file: string;
  startLine: number;
  endLine: number;
  /** Líneas a EXCLUIR del conteo — interior de literales string/template/heredoc multilínea (ver docstring del módulo). `0`/`undefined` si no hay ninguno. */
  excludedLines?: number;
}

/** Palabra de nodo GENÉRICA de "esto es un string/template/heredoc" — ver el docstring del módulo para la sonda que confirma los nombres exactos por gramática. */
const STRING_LITERAL_WORD = /string|heredoc/;
/** Palabra de nodo que marca un FRAGMENTO interno (no el literal completo) — se resta para no contar el mismo texto dos veces (el fragmento ya vive DENTRO del nodo completo que lo contiene). */
const STRING_LITERAL_PART_WORD = /fragment|content|start|end|text|beginning/;

/** `true` sólo para el nodo COMPLETO de un literal de string/template/heredoc — nunca uno de sus fragmentos internos. */
function isWholeStringLiteral(node: ProbeNode): boolean {
  return STRING_LITERAL_WORD.test(node.type) && !STRING_LITERAL_PART_WORD.test(node.type);
}

/**
 * Filas ESTRICTAMENTE INTERIORES (ni apertura ni cierre) de todo literal de
 * string/template/heredoc de más de una línea dentro de `fnNode` — ver el
 * docstring del módulo. Un `Set` de números de fila (no una suma) para que
 * dos literales cuyo rango se solape (no debería pasar entre hermanos, pero
 * es la defensa barata) no cuenten la misma fila dos veces.
 */
function multilineStringInteriorLines(fnNode: AstNode): number {
  const rows = new Set<number>();
  walkTree(fnNode, (node) => {
    if (!node.isNamed || !isWholeStringLiteral(node)) return;
    const real = node as AstNode;
    for (let row = real.startPosition.row + 1; row < real.endPosition.row; row++) rows.add(row);
  });
  return rows.size;
}

/** Único lugar que arma el `RawFinding` de `long-function`. `null` si no cruza el umbral. */
export function buildLongFunctionFinding(fn: LongFunctionInput, threshold: Threshold): RawFinding | null {
  const rawLines = fn.endLine - fn.startLine + 1;
  const excluded = fn.excludedLines ?? 0;
  const lines = rawLines - excluded;
  if (lines < threshold.value) return null;

  return {
    title: `${fn.name} ocupa ${lines} líneas`,
    detail:
      "Una función larga suele estar haciendo varias cosas que podrían separarse." +
      (excluded > 0
        ? ` (${excluded} línea(s) de texto dentro de un literal de string/template/heredoc se excluyen de este conteo: un bloque de texto estático no es lógica que "podría separarse".)`
        : ""),
    trigger: [{ label: "líneas", value: lines, threshold }],
    ...(excluded > 0
      ? {
          evidence: [
            { label: "líneas totales del cuerpo (con el texto del literal)", value: rawLines },
            { label: "líneas de literal de string/template/heredoc excluidas", value: excluded },
          ],
        }
      : {}),
    locations: [
      {
        file: fn.file,
        startLine: fn.startLine,
        endLine: fn.endLine,
        symbol: fn.name,
        role: "función larga",
      },
    ],
    severity: Math.min(100, 20 + lines / 2),
    advice: suggest({
      type: "long_function",
      context: { lineCount: lines, threshold: threshold.value, containsLoop: false },
    }),
  };
}

export const detector: IntraFunctionDetector<ThresholdKey, "long-function"> = {
  id: "long-function",
  kind: "long-function",
  scope: "intra-function",
  title: "Función larga",
  needs: [],
  thresholds: {
    // R3 (auditoría de umbrales inventados): sigue sin haber una fuente
    // PUBLICADA que fije "cuántas líneas son demasiadas" para una función —
    // ninguna herramienta o paper consultado da un número universal — pero
    // el corpus de 8 repos externos (`scripts/generate-benchmarks.mts`,
    // `graph/benchmarks.json`, generado 2026-07-29) ya mide la distribución
    // real de `functionLines` por lenguaje: p95 va de vue=11 y ruby=19 hasta
    // go=66 y python=55, con java=21/javascript=43/csharp=51/typescript=52/
    // tsx=44 en el medio. 45 (el piso de siempre) cae DENTRO de ese rango,
    // no en un extremo — ni tan bajo como para disparar sobre el p95 de
    // ruby/java/vue, ni tan alto como para no significar nada en go/python.
    // `of: "functionLines"` usa textualmente el nombre que
    // `graph/thresholds.ts#getCorpusBenchmarks` ya sabe leer: cuando ese
    // `Benchmarks` se cablee en producción (código fuera de `detect/**`,
    // pendiente — ver el docstring de `graph/thresholds.ts`), este umbral
    // pasa a `Max(45, p95(corpus, lenguaje))` sin tocar este archivo de
    // nuevo — subiendo el piso efectivo en los lenguajes donde 45 líneas es
    // normal (go, python, csharp, typescript) sin bajarlo en los que no
    // (ruby, java, vue quedan en 45, igual que hoy). Hoy, sin ese cableado,
    // resuelve exactamente a 45 — mismo valor y mismo comportamiento que el
    // `pisoDeclarado(45, …)` que reemplaza.
    lines: derivado({
      floor: 45,
      stat: "p95",
      of: "functionLines",
      floorSource: {
        rationale:
          "p95 de functionLines medido contra el corpus de 8 repos externos (9 lenguajes, n=270..33194 por " +
          "lenguaje, graph/benchmarks.json, generado 2026-07-29): vue=11, ruby=19, java=21, tsx=44, " +
          "javascript=43, csharp=51, typescript=52, python=55, go=66. 45 queda dentro del rango medido en vez " +
          "de ser un número sin respaldo — ver AUDITORÍA F4/E1 arriba para por qué NO se ajusta el número " +
          "exacto ahora (mover el piso, a diferencia de re-declarar su procedencia, cambia qué findings existen " +
          "y esa medición es una tarea aparte).",
      },
    }),
  },
  run(fn: FunctionUnit, ctx: RunContext<ThresholdKey>): readonly RawFinding[] {
    const threshold = ctx.threshold("lines");
    const excludedLines = multilineStringInteriorLines(fn.node);
    const finding = buildLongFunctionFinding(
      { name: fn.name ?? "(anónima)", file: fn.file, startLine: fn.startLine, endLine: fn.endLine, excludedLines },
      threshold,
    );
    return finding ? [finding] : [];
  },
};
