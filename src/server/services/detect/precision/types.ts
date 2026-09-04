/**
 * El veredicto humano sobre UN hallazgo muestreado — CONTRATO del
 * instrumento de precisión (ver docstring de `verdicts-io.ts` para el
 * archivo que lo transporta).
 *
 *   "verdadero" — leyendo el código citado, el problema que describe el
 *     hallazgo es real: un revisor sin conocimiento especial del dominio de
 *     ESTE repo estaría de acuerdo en que hay un problema de diseño o
 *     mantenibilidad ahí.
 *   "falso" — la condición sintáctica dispara pero no hay problema real
 *     (un idiomatismo de lenguaje/plataforma, una API fluida, un método de
 *     ciclo de vida con un llamador que el detector no puede ver, etc.).
 *   "dudoso" — no se puede decidir con la evidencia visible sin
 *     conocimiento que sólo tiene quien mantiene ese código — se EXCLUYE
 *     del cálculo de precisión (mismo criterio que `LabelVerdict` en
 *     `graph/gate/labeled-dataset.ts`).
 *   "" — todavía sin juzgar.
 */
export type PrecisionVerdict = "verdadero" | "falso" | "dudoso";
export type PrecisionVerdictOrPending = PrecisionVerdict | "";

/**
 * Una fila de la planilla — un hallazgo REAL, muestreado de una corrida real
 * de `analyzeRepo`, para que un humano lo juzgue. `id` es el `CodeFinding.id`
 * estable (`detect/ids.ts#findingId`: detector/kind + anclas ordenadas, SIN
 * número de línea) — es la clave que permite volver a correr el analizador
 * (después de editar código en otra parte del repo, o de una mejora del
 * detector que no cambia la forma del hallazgo) sin perder un veredicto ya
 * cargado ni duplicar la fila.
 */
export interface PrecisionRow {
  id: string;
  slug: string;
  kind: string;
  /**
   * Lenguaje de la ubicación citada (`file`), resuelto contra `CodeAnalysis.files`
   * en el momento del muestreo — NO inferido del `slug` (un repo puede mezclar
   * lenguajes: `vueuse` es TS y Vue, `preact` es JS y JSX). "" cuando no se pudo
   * resolver (fila heredada de antes de este campo, o el archivo no está en
   * `analysis.files` — p.ej. quedó fuera de un árbol podado). Es la dimensión que
   * `report.ts#buildPrecisionReportByLanguage` estratifica — sin ella, un kind
   * "perfecto" en dos lenguajes y catastrófico en un tercero se promedia y el
   * promedio lo esconde (medido: `self-referential-member` 6/6 en Ruby/TS, 178
   * falsos en Java).
   */
  language: string;
  /** Nombres de patrón propuestos en estado ACCIONABLE (`ausente`/`parcial` — ver `sample.ts#actionablePatterns`), separados por `;`. "" si el hallazgo no tiene ninguna hipótesis de patrón colgando. */
  pattern: string;
  file: string;
  startLine: number;
  endLine: number;
  symbol: string;
  title: string;
  detail: string;
  metricLabel: string;
  metricValue: string;
  /** Línea de código en `file:startLine`, recortada — un adelanto para no tener que abrir el archivo para juzgar la mayoría de las filas; no reemplaza mirar el código citado cuando el adelanto no alcanza. */
  evidence: string;
  verdict: PrecisionVerdictOrPending;
  /** Sólo tiene sentido juzgado cuando `pattern !== ""` Y `verdict === "verdadero"` — en cualquier otro caso queda "" y el reporte lo ignora. Responde: dado que el problema es real, ¿el patrón propuesto es el remedio correcto (no sobre-ingeniería, ataca la causa real)? */
  patternFit: PrecisionVerdictOrPending;
  note: string;
  /** `false` sólo en filas heredadas de una corrida anterior cuyo `id` ya no aparece en el pool vivo de la corrida actual — el veredicto ya cargado sigue siendo evidencia válida, pero se marca para que quien audite sepa que el código pudo haber cambiado. Filas nuevas siempre `true`. */
  stillPresent: boolean;
  /**
   * LA VÍA DE ESCAPE DE LA COMPUERTA DE RECALL (`recall-gate.test.ts`), y la
   * única — la compuerta NO se afloja bajando un piso. Sólo tiene sentido en
   * una fila con `verdict === "verdadero"` que la medición de recall
   * (`recall-logic.ts`) ya no encuentra viva: quien mató ese verdadero
   * escribe ACÁ por qué, y la pérdida pasa de silenciosa a declarada.
   *
   * Un verdadero puede morir legítimamente — el criterio del detector cambió
   * y el veredicto viejo quedó vencido, el archivo resultó ser una copia de
   * upstream, el kind se redefinió. Lo que no puede es morir sin que quede
   * escrito. Con la columna vacía, la compuerta falla; con la columna
   * escrita, la compuerta pasa Y el reporte imprime el motivo, así que la
   * pérdida queda auditable en `git diff` de la planilla en vez de
   * evaporarse entre dos censos.
   *
   * NO es `note`: `note` es del JUEZ (por qué juzgó lo que juzgó, cargada
   * junto con el veredicto); ésta es de quien CAMBIÓ EL DETECTOR después. Dos
   * autores, dos momentos, dos preguntas distintas — mezclarlas haría
   * imposible contar las pérdidas declaradas sin leer prosa.
   *
   * Convención de la línea base: las pérdidas que YA existían el día que se
   * construyó la compuerta (25 sobre 275 verdaderos, olas N y O, sin poder
   * atribuirlas a un frente) llevan el prefijo `heredada:` — greppables y
   * contadas aparte del resto por `recall-report.mts`, para que la deuda
   * previa nunca se confunda con una pérdida nueva ya justificada.
   */
  lossReason: string;
}

/**
 * Orden de columnas del CSV — estable, para que `git diff` sobre la planilla muestre
 * sólo lo que cambió. `language` se agregó DESPUÉS de que las 9 planillas del corpus
 * ya existieran sin ella — `verdicts-io.ts#readPrecisionCsv` la trata como columna
 * OPCIONAL al leer (fallback `""`, nunca un error de "planilla de otra versión") para
 * no invalidar ni una fila vieja; se backfillea sola la próxima vez que
 * `scripts/sample-findings-for-judgment.mts` corre sobre ese slug.
 *
 * `lossReason` se agregó igual de tarde y por la misma vía (opcional al leer, última
 * columna al escribir), en la ola que construyó la compuerta de recall. Al FINAL a
 * propósito: un humano que abre la planilla para juzgar sigue encontrando `verdict` /
 * `patternFit` / `note` donde siempre estuvieron.
 */
export const CSV_COLUMNS: readonly string[] = [
  "id",
  "slug",
  "kind",
  "language",
  "pattern",
  "file",
  "startLine",
  "endLine",
  "symbol",
  "title",
  "detail",
  "metricLabel",
  "metricValue",
  "evidence",
  "verdict",
  "patternFit",
  "note",
  "stillPresent",
  "lossReason",
];
