/**
 * El conjunto etiquetado a mano — carga y tipos.
 *
 * Fuente de verdad versionada en este repo:
 * `tests/golden/graph/cascade-labeled-dataset.jekyll.json`, copia exacta
 * (sin editar un byte) de
 * `scratchpad/impl/spikes/cascada-refs/labeled-dataset.json`: 200 aristas
 * candidatas de `jekyll/lib` (89 archivos Ruby), muestra estratificada con
 * semilla fija (`seed`), etiquetadas a mano leyendo el código real —
 * `correcta` | `incorrecta` | `dudosa` — con el criterio escrito ANTES de
 * mirar los datos (ver `spikes/cascada-refs/RESULTADO.md`, sección "Método").
 *
 * NO se recorta ni se resume acá: `useContext`/`declContext` (el código real
 * alrededor de cada sitio) viajan completos porque son lo que hace que un
 * fallo de esta compuerta sea auditable a simple vista, no sólo un número.
 *
 * SEGUNDO DATASET, mismo archivo (Ola F4): `tests/golden/graph/
 * cascade-labeled-dataset.guava.json`, copia exacta de
 * `scratchpad/impl/gate-java/labeled-dataset.json` — 200 aristas candidatas
 * de `guava` (1975 archivos Java), mismo método (muestra estratificada,
 * semilla fija, etiquetado a mano con criterio previo — ver su propio
 * `RESULTADO.md`), pero con OTROS estratos: la muestra Ruby estratifica por
 * la etapa que la RECHAZÓ en el probe de 4 etapas (`role`/`member`/`scope`,
 * más `accepted`); la muestra Java estratifica directamente sobre la
 * cascada REAL de 9 etapas (no hay probe intermedio) por etapa TERMINAL:
 * `path-proximity`/`structural` (aceptadas) y `rejected-role`/
 * `rejected-other`/`ambiguous-unresolved` (perdidas). `LabelStratum` (Ruby)
 * NO se toca — lo consumen `resolve-gate.test.ts` y `precision-recall.test.ts`,
 * archivos ajenos esta ola — así que el estrato Java vive en su propio tipo,
 * `JavaLabelStratum`, y `LabeledSample`/`LabeledDataset`/`loadLabeledDataset`
 * se generalizan con un parámetro de tipo (por defecto `LabelStratum`, para
 * que el consumidor Ruby siga viendo exactamente el mismo tipo de antes sin
 * tener que escribir un argumento de tipo).
 */
import fs from "node:fs";

export type LabelStratum = "accepted" | "role" | "member" | "scope";
/** Estratos del dataset Java (`cascade-labeled-dataset.guava.json`) — ver docstring de arriba. */
export type JavaLabelStratum =
  | "path-proximity"
  | "structural"
  | "rejected-role"
  | "rejected-other"
  | "ambiguous-unresolved";
export type LabelVerdict = "correcta" | "incorrecta" | "dudosa";

export interface LabeledContextLine {
  readonly n: number;
  readonly text: string;
  readonly mark: boolean;
}

export interface LabeledSample<S extends string = LabelStratum> {
  readonly id: number;
  readonly stratum: S;
  readonly symbol: string;
  readonly from: string;
  readonly useLine: number;
  readonly useNs: string;
  readonly to: string;
  readonly declLine: number;
  readonly declType: string;
  readonly declNs: string;
  readonly useContext: readonly LabeledContextLine[];
  readonly declContext: readonly LabeledContextLine[];
  readonly label: LabelVerdict;
  readonly note: string;
}

export interface LabeledDataset<S extends string = LabelStratum> {
  readonly seed: number;
  readonly quotas: Record<S, number>;
  /** Tamaño de la población total de la que se muestreó cada estrato (829 candidatos en total en el dataset Ruby; 211.869 en el Java). */
  readonly poolSizes: Record<S, number>;
  readonly sample: readonly LabeledSample<S>[];
}

export function loadLabeledDataset<S extends string = LabelStratum>(filePath: string): LabeledDataset<S> {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as LabeledDataset<S>;
  if (!Array.isArray(parsed.sample) || parsed.sample.length === 0) {
    throw new Error(`conjunto etiquetado vacío o mal formado: ${filePath}`);
  }
  return parsed;
}

/**
 * Mismo criterio de unicidad que `probe-cascade.ts` (`cascade-outcome.ts#candidateKey`): `(from, symbol)`.
 * SOLO para cruzar contra un runner que colapsa a una ocurrencia por (archivo,
 * símbolo) — `gate/probe-cascade.ts`, vía `gate/precision-recall.test.ts`.
 * `buildCandidates` REAL (`graph/build.ts`) NO colapsa así: guarda un
 * candidato por SITIO DE USO, así que cruzar la cascada real con esta clave
 * puede tomar prestada la traza de OTRA línea del mismo (archivo, símbolo) —
 * ver `labeledSampleLineKey`, la clave que sí distingue sitios, y el
 * docstring de `resolve-gate.test.ts` (BUG 3) para la medición concreta.
 */
export function labeledSampleKey(s: Pick<LabeledSample, "from" | "symbol">): string {
  return `${s.from}::${s.symbol}`;
}

/**
 * Como `labeledSampleKey`, pero exige además la LÍNEA exacta del sitio de
 * uso (`useLine` en `LabeledSample`, `ref.line` en un `ResolutionCandidate`
 * real) — la clave correcta para cruzar contra `buildCandidates`/
 * `resolveReferences` de la cascada REAL (`resolve-gate.test.ts`), que no
 * colapsa por (archivo, símbolo) la forma en que `gate/probe-cascade.ts` sí
 * lo hace. Medido: de las 200 filas etiquetadas, 82 caen en un grupo
 * (archivo, símbolo) con más de un candidato real vivo, y 59 de ellas
 * quedaban mal atribuidas bajo `labeledSampleKey` sola (ver
 * `resolve-gate.test.ts`'s docstring).
 */
export function labeledSampleLineKey(s: Pick<LabeledSample, "from" | "symbol" | "useLine">): string {
  return `${s.from}::${s.symbol}@${s.useLine}`;
}

/** El estrato en el que se muestreó una fila, mapeado al vocabulario de `ResolutionStageId`. `"accepted"` no es un rechazo — se maneja aparte (cláusula 1, no cláusula 2). */
export const STRATUM_TO_REJECT_STAGE: Record<Exclude<LabelStratum, "accepted">, string> = {
  role: "syntactic-role",
  member: "class-member",
  scope: "qualified-name",
};
