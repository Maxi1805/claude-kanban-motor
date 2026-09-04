/**
 * Umbral con procedencia obligatoria — CONTRATOS.md §1.1.
 *
 * Dos tipos con marca NO exportada (`SPEC_BRAND`, `RESOLVED_BRAND`): ningún
 * literal de objeto escrito fuera de este archivo es asignable a `ThresholdSpec`
 * ni a `Threshold`. Las cinco factorías de abajo son la ÚNICA vía de
 * construcción de un `ThresholdSpec`, y las cinco exigen su fuente por firma,
 * sin default. `resolveThreshold` (más abajo, también sólo-este-archivo) es la
 * ÚNICA vía de construir un `Threshold`. Es el compilador quien impide un
 * umbral sin fuente, no un lint: un `RawFinding.trigger` sin al menos un
 * `Measurement` con un `Threshold` de acá no tipa.
 *
 * El cuerpo de un detector NUNCA ve un `ThresholdSpec` en runtime: lo declara
 * en `thresholds: Record<K, ThresholdSpec>` y pide el resuelto por nombre vía
 * `ctx.threshold(name): Threshold`. `run.ts` es quien llama a
 * `resolveThreshold` entre declarar y entregar.
 *
 * `presencia` — R3 (auditoría de umbrales inventados): un grupo de ~9 sitios
 * declaraba `pisoDeclarado(1, { rationale: "…presencia/ausencia,
 * no una magnitud…" })` — el propio rationale, repetido casi palabra por
 * palabra en cada uno, confesaba que NO había ningún número que buscar: la
 * pregunta es binaria (¿existe la forma o no?), y el "1" era un valor de
 * relleno que el molde de 4 kinds obligaba a inventar para que el tipo
 * compile. Eso es exactamente el caso "Eliminarlo" que R3 pide perseguir
 * activamente, no aceptar sólo cuando cae solo: la factoría `presencia()`
 * declara el caso sin fingir que hay una magnitud calibrada detrás. Sigue
 * pasando por `resolveThreshold` y sigue exigiendo una `Measurement` con
 * `Threshold` (no toca el contrato de arriba), pero ya no aparece contado
 * entre los "pisoDeclarado inventados" — es una forma sintáctica distinta,
 * con su propio `ThresholdKind`.
 */

// `Symbol()` (no `declare const`): la marca necesita existir en RUNTIME — se
// adjunta a objetos reales que las factorías devuelven — además de servir de
// tipo nominal. No exportado: es la única razón por la que ningún literal
// externo a este archivo puede construir un `ThresholdSpec`/`Threshold`.
const SPEC_BRAND: unique symbol = Symbol("ThresholdSpec");
const RESOLVED_BRAND: unique symbol = Symbol("Threshold");

export type ThresholdKind = "citado" | "derivado" | "piso-declarado" | "presupuesto" | "presencia";

/**
 * Nombre de una métrica agregable para `derivado` ("wmc", "cognitive",
 * "parameters", ...). Abierto a propósito: no hay un catálogo cerrado de
 * métricas todavía (F1 no migra detectores), así que cerrarlo a una unión
 * fija sería inventar un catálogo sin un solo consumidor real detrás.
 */
export type MetricName = string;

interface Citation {
  readonly work: string;
  readonly rule?: string;
  readonly url?: string;
}

/** Variantes internas de `ThresholdSpec`, una por factoría. Nunca se exportan
 *  sueltas: sólo la unión marcada de abajo, y sólo las factorías la producen. */
interface SpecCitado {
  readonly kind: "citado";
  readonly value: number;
  readonly citation: Citation;
}
interface SpecDerivado {
  readonly kind: "derivado";
  readonly floor: number;
  readonly stat: "p95" | "p90" | "media";
  readonly of: MetricName;
  readonly floorSource: Citation | { readonly rationale: string };
}
interface SpecPisoDeclarado {
  readonly kind: "piso-declarado";
  readonly value: number;
  readonly rationale: string;
}
interface SpecPresupuesto {
  readonly kind: "presupuesto";
  readonly value: number;
  readonly rationale: string;
}
/**
 * Presencia/ausencia, no magnitud: `value` es SIEMPRE 1 — no un piso elegido
 * dentro de un rango posible, sino el único valor que la pregunta binaria
 * admite ("¿existe esta forma en el código, sí o no?"). Ver el docstring de
 * cabecera del módulo ("`presencia` — R3") para el porqué de que sea un
 * `ThresholdKind` propio y no un `SpecPisoDeclarado` más.
 */
interface SpecPresencia {
  readonly kind: "presencia";
  readonly value: 1;
  readonly rationale: string;
}

/** Lo que un detector DECLARA. Sólo lo producen las cinco factorías de abajo. */
export type ThresholdSpec = { readonly [SPEC_BRAND]: true } & (
  | SpecCitado
  | SpecDerivado
  | SpecPisoDeclarado
  | SpecPresupuesto
  | SpecPresencia
);

export type ThresholdProvenance =
  | { kind: "citado"; work: string; rule?: string; url?: string }
  | {
      kind: "derivado";
      stat: "p95" | "p90" | "media";
      of: string;
      scope: "repo-analizado" | "corpus";
      language: string;
      n: number;
      floor: number;
    }
  | { kind: "piso-declarado"; rationale: string }
  | { kind: "presupuesto"; rationale: string }
  | { kind: "presencia"; rationale: string };

/** Lo que el runner ENTREGA al cuerpo del detector, ya con valor numérico. */
export interface Threshold {
  readonly [RESOLVED_BRAND]: true;
  readonly value: number;
  readonly kind: ThresholdKind;
  /** Texto listo para pantalla: "S3776 (SonarSource)" | "derivado: p95 de este repo (ruby, N=353)". */
  readonly label: string;
  readonly detail: ThresholdProvenance;
}

/** Citado en literatura/herramienta externa: SonarQube, RuboCop, un paper. */
export function citado(value: number, src: { work: string; rule?: string; url?: string }): ThresholdSpec {
  return { [SPEC_BRAND]: true, kind: "citado", value, citation: { ...src } };
}

/**
 * Derivado de los datos: `Max(floor, p95(repo, lenguaje), p95(corpus, lenguaje))`.
 * Sin `value`: se resuelve en runtime (ver `resolveThreshold`). Mientras no
 * exista `benchmarks.json` (F4), el resuelto vale siempre `floor`.
 */
export function derivado(src: {
  floor: number;
  stat: "p95" | "p90" | "media";
  of: MetricName;
  floorSource: { work: string; rule?: string; url?: string } | { rationale: string };
}): ThresholdSpec {
  return { [SPEC_BRAND]: true, kind: "derivado", ...src };
}

/** Piso elegido a mano, sin cita externa ni derivación — declarado, no adivinado. */
export function pisoDeclarado(value: number, src: { rationale: string }): ThresholdSpec {
  return { [SPEC_BRAND]: true, kind: "piso-declarado", value, rationale: src.rationale };
}

/** Un tope de VOLUMEN (p.ej. `maxFindings` de un detector), no un umbral de detección. */
export function presupuesto(value: number, src: { rationale: string }): ThresholdSpec {
  return { [SPEC_BRAND]: true, kind: "presupuesto", value, rationale: src.rationale };
}

/**
 * Presencia/ausencia: la forma que el detector busca YA ES el hallazgo
 * completo en su primera ocurrencia — no hay una magnitud intermedia que
 * calibrar, así que no toma `value` (siempre 1, ver `SpecPresencia`). Usarla
 * en vez de `pisoDeclarado(1, …)` cuando el rationale sería, de todos modos,
 * "no hay una magnitud que umbralizar, es presencia/ausencia": ésa es la
 * señal de que la pregunta correcta no necesita un piso, sólo un booleano.
 */
export function presencia(src: { rationale: string }): ThresholdSpec {
  return { [SPEC_BRAND]: true, kind: "presencia", value: 1, rationale: src.rationale };
}

function brand(value: number, kind: ThresholdKind, label: string, detail: ThresholdProvenance): Threshold {
  return { [RESOLVED_BRAND]: true, value, kind, label, detail };
}

/**
 * Declarado ahora (F1), llenado en F4 desde `benchmarks.json`. Hasta entonces
 * nadie construye un `Benchmarks` real: `resolveThreshold` recibe siempre
 * `null` y todo `derivado` resuelve a su `floor` — ver CONTRATOS.md §1.1.
 */
export interface Benchmarks {
  p95(metric: MetricName, language: string): number | null;
}

export interface ThresholdResolveInput {
  language: string;
  /**
   * Tamaño real de muestra que el runner conoce para esta métrica en el repo
   * analizado, si la conoce. F1: ningún detector migrado todavía produce una
   * muestra por métrica con nombre, así que el runner de esta ola siempre
   * pasa `() => 0` — ver `detect/run.ts`. Queda tipado para que la migración
   * (F2+) no tenga que tocar esta firma.
   */
  sampleSize(metric: MetricName): number;
  /** `benchmarks?.p95(metric, language) ?? null`. `null` hasta F4. */
  corpusP95(metric: MetricName, language: string): number | null;
}

/**
 * Única función que produce un `Threshold`. La spec original describe el
 * valor de `derivado` como `Max(floor, p95(repo), p95(corpus))`; esta ola no
 * calcula todavía el p95 del REPO analizado (ninguna canalización de muestras
 * por métrica existe aún, porque ningún detector real está migrado — ver el
 * resultado final para el detalle de esta simplificación), así que mientras
 * `corpusP95` sea `null` el resuelto es exactamente `floor`, con
 * `detail.scope = "repo-analizado"` y `n` real — tal como el contrato exige
 * explícitamente para el período sin `benchmarks.json`.
 */
export function resolveThreshold(spec: ThresholdSpec, input: ThresholdResolveInput): Threshold {
  switch (spec.kind) {
    case "citado": {
      const label = `${spec.citation.work}${spec.citation.rule ? ` (${spec.citation.rule})` : ""}`;
      return brand(spec.value, "citado", label, { kind: "citado", ...spec.citation });
    }
    case "piso-declarado":
      return brand(spec.value, "piso-declarado", `piso declarado: ${spec.rationale}`, {
        kind: "piso-declarado",
        rationale: spec.rationale,
      });
    case "presupuesto":
      return brand(spec.value, "presupuesto", `presupuesto: ${spec.rationale}`, {
        kind: "presupuesto",
        rationale: spec.rationale,
      });
    case "presencia":
      return brand(spec.value, "presencia", `presencia: ${spec.rationale}`, {
        kind: "presencia",
        rationale: spec.rationale,
      });
    case "derivado": {
      const corpus = input.corpusP95(spec.of, input.language);
      const n = input.sampleSize(spec.of);
      const value = corpus !== null && corpus > spec.floor ? corpus : spec.floor;
      const scope: "repo-analizado" | "corpus" = corpus !== null && corpus > spec.floor ? "corpus" : "repo-analizado";
      const label =
        scope === "corpus"
          ? `derivado: ${spec.stat} del corpus (${input.language}, N=${n})`
          : `derivado: ${spec.stat} de este repo (${input.language}, N=${n})`;
      return brand(value, "derivado", label, {
        kind: "derivado",
        stat: spec.stat,
        of: spec.of,
        scope,
        language: input.language,
        n,
        floor: spec.floor,
      });
    }
  }
}
