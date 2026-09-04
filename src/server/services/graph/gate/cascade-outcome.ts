/**
 * La forma mínima que la compuerta de precisión/recall de F3 necesita de
 * CUALQUIER cascada — la del probe (hoy) o `resolveReferences` real
 * (`graph/resolve.ts`, cuando exista). Es el punto de costura: todo lo que
 * `precision-recall.test.ts` hace después de obtener un
 * `readonly CascadeOutcome[]` es igual sin importar quién los produjo.
 *
 * Ver el docstring de `precision-recall.test.ts`, sección "CABLEADO A LA
 * CASCADA REAL", para el adaptador concreto que falta escribir cuando
 * `graph/resolve.ts` + `graph/stages.ts` existan.
 */

/** Mismo vocabulario que `ResolutionStageId` (CONTRATO-F3.md §3.3) — un subconjunto hoy. */
export interface CascadeOutcome {
  /** Archivo de origen de la referencia (relativo a la raíz analizada). */
  readonly from: string;
  /** Nombre del identificador referenciado, tal como aparece en el sitio de uso. */
  readonly symbol: string;
  /** Línea 1-based del sitio de uso — es la clave que cruza con `labeled-dataset.json`. */
  readonly useLine: number;
  readonly accepted: boolean;
  /** Etapa que decidió el destino final de este candidato. */
  readonly finalStage: string;
}

/** Firma común que cualquier cascada (probe o real) implementa para alimentar el arnés. */
export type CascadeRunner = (rootDir: string) => Promise<readonly CascadeOutcome[]>;

/** Clave de cruce con `LabeledSample` — MISMO criterio en ambos lados: `(archivo, símbolo)` es único porque tanto `collect.mjs` como este puerto guardan sólo la PRIMERA ocurrencia de cada símbolo por archivo. */
export function candidateKey(from: string, symbol: string): string {
  return `${from}::${symbol}`;
}
