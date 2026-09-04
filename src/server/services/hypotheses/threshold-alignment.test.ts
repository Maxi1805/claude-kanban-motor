/**
 * `threshold-alignment.test.ts` — Ola 10, registro de pendientes /
 * CONTRATO-F10.md, "la compuerta de umbrales alineados".
 *
 * CASO MEDIDO que motiva esta compuerta: `detect/intra-function/conditional-chain.ts`
 * exige un piso de 5 ramas (`pisoDeclarado(5, …)`), pero `hypotheses/strategy.ts`
 * declaraba `STRATEGY_MIN_BRANCHES = 3` — un desajuste MUDO. Ningún
 * `conditional-chain` real con 3 o 4 ramas puede existir (el detector ya lo
 * descartó antes de que el `Finding` naciera), así que el número escrito en
 * la hipótesis era una MENTIRA inofensiva por ahora, pero silenciosa: si el
 * piso del detector alguna vez bajara a 3, la hipótesis lo aceptaría sin que
 * nadie lo hubiera decidido a propósito. Nadie iba a ver esto sin correr los
 * dos números uno al lado del otro.
 *
 * LA COMPUERTA: para cada hipótesis registrada, para cada uno de sus
 * `anchors` cuyo detector declara un piso NUMÉRICO fijo (`piso-declarado` o
 * `citado` — nunca `derivado`, que se resuelve en runtime, ni `presupuesto`,
 * que no es un umbral de detección) sobre la métrica que ya viaja en
 * `Finding.trigger[0].value`, esta prueba construye el `Finding` MÁS CHICO
 * que ese detector JAMÁS produciría (`piso - 1`) y corre `hypothesis.build()`
 * sobre él con un `HypothesisContext` deliberadamente PERMISIVO (sin árbol,
 * sin vecindario, con TODAS las capacidades) — el escenario más favorable
 * posible para que la hipótesis acepte. Si alguna la acepta (`build()` no
 * devuelve `null`), es la firma exacta del bug: la hipótesis declara,
 * explícita o implícitamente, un piso propio MÁS BAJO que el de su ancla.
 *
 * Deliberadamente NO es una lectura de código fuente por regex (a diferencia
 * de `registries.test.ts`): cada hipótesis nombra su constante distinto
 * (`STRATEGY_MIN_BRANCHES`, `STATE_MIN_BRANCHES`, `THREE_OR_MORE_BRANCHES`…)
 * y no todas gatean sobre la MISMA métrica que su ancla (`state.ts` gatea
 * sobre "métodos distintos", una métrica DERIVADA, no `trigger[0].value`) —
 * un regex tendría que adivinar cuál constante es "la que importa" y fallaría
 * en silencio para la próxima forma que no anticipe. Correr el `build()` real
 * contra el dato MÁS CHICO posible prueba el CONTRATO observable (¿acepta o
 * no?), no una convención de nombres — genérico ante cualquier hipótesis
 * futura que gatee sobre `trigger[0].value`, y sin falsos positivos para las
 * que gatean sobre otra cosa (esas simplemente rechazan por SU propio motivo,
 * y la prueba no les exige nada).
 *
 * PROBADA ROTA A PROPÓSITO (ver el informe de esta ola): con
 * `STRATEGY_MIN_BRANCHES` vuelto a 3 a mano, este archivo falla en el caso
 * "conditional-chain" citando exactamente `strategy` y el valor `4` — la
 * compuerta SÍ se pone roja cuando el desajuste vuelve a existir.
 */
import { describe, expect, it } from "vitest";

import type { Capability } from "../detect/capabilities.js";
import { DETECTORS } from "../detect/registry.js";
import type { Finding, RepoUnit } from "../detect/types.js";
import { pisoDeclarado, resolveThreshold, type ThresholdSpec } from "../detect/thresholds.js";
import { EMPTY_NEIGHBORHOOD } from "../graph/neighborhood.js";
import { HYPOTHESES } from "./registry.js";
import type { HypothesisContext } from "./types.js";

/** Las 11 capacidades declaradas en `detect/capabilities.ts` — TODAS presentes, para que ninguna hipótesis quede fuera por `needs` sin relación con el umbral bajo prueba. */
const ALL_CAPABILITIES: readonly Capability[] = [
  "unidad-tipo-clase",
  "herencia",
  "interfaz",
  "tipos-explicitos",
  "imports",
  "excepciones",
  "ternario",
  "nodo-constructor",
  "visibilidad",
  "genericos",
  "modulos",
];

/** El contexto MÁS PERMISIVO posible: sin árbol (activa cualquier fallback "no confirmado, se asume que pasa"), sin vecindario, con toda capacidad. El escenario que más le facilita las cosas a una hipótesis floja. */
function permissiveContext(): HypothesisContext {
  const repo: RepoUnit = { repoName: "fixture", files: [], functions: [], clones: [], graph: null };
  return {
    file: null,
    fileAt: () => null,
    repo,
    capabilities: new Set(ALL_CAPABILITIES),
    setsFor: () => ({
      functionNodes: new Set(),
      branchNodes: new Set(),
      chainNodes: new Set(),
      cloneNodes: new Set(),
      classNodes: new Set(),
      nestingNodes: new Set(),
      constructorNodes: new Set(),
      exceptionNodes: new Set(),
      switchContainerNodes: new Set(),
    }),
    neighborhood: EMPTY_NEIGHBORHOOD,
    branches: () => null,
  };
}

/**
 * El piso NUMÉRICO fijo de `detector.thresholds`, si declara EXACTAMENTE uno
 * y es `piso-declarado`/`citado`/`presencia` (nunca `presupuesto`: no es un
 * umbral de detección).
 *
 * `derivado` SÍ entra acá, vía `.floor` — actualizado en R3 (auditoría de
 * umbrales inventados) cuando `conditional-chain.ts#chainLength` migró de
 * `pisoDeclarado` a `derivado`: la exclusión original razonaba "se resuelve
 * en runtime contra el corpus, no hay 'el número' a comparar", pero eso
 * subestima la garantía real de `resolveThreshold` (`detect/thresholds.ts`):
 * el valor resuelto es SIEMPRE `Max(floor, corpusP95)` ⇒ SIEMPRE `>= floor`,
 * cableado el corpus o no. Probar en `floor - 1` sigue siendo, por
 * construcción, un valor por DEBAJO de cualquier resuelto posible — la
 * compuerta no se debilita si algún día `code-analyzer.ts` empieza a pasar
 * un `Benchmarks` no nulo, sólo deja de cubrir el caso (imposible) de que el
 * corpus empuje el resuelto por DEBAJO del floor.
 *
 * `null` si el detector no aplica a esta compuerta.
 */
function fixedFloor(detectorId: string): number | null {
  const detector = DETECTORS.find((d) => d.id === detectorId);
  if (!detector) return null;
  // `Detector` es una unión con un `K` distinto por detector — el índice
  // genérico por `string` sólo es seguro después de este cast (misma forma
  // que ya usa `ctx.threshold(name)` en `detect/run.ts`).
  const thresholds = detector.thresholds as Readonly<Record<string, ThresholdSpec>>;
  const keys = Object.keys(thresholds);
  if (keys.length !== 1) return null; // más de un umbral: cuál es "el" piso a comparar deja de ser inequívoco — fuera de esta compuerta.
  const spec = thresholds[keys[0]!]!;
  if (spec.kind === "presupuesto") return null;
  if (spec.kind === "derivado") return spec.floor;
  return spec.value;
}

/** Un `Finding` mínimo, genérico en `kind`, con `trigger[0].value` = el número bajo prueba — misma forma que un detector real produciría, sin vocabulario de dominio (regla 4). */
function minimalFinding(kind: string, value: number): Finding {
  return {
    id: `threshold-probe-${kind}-${value}`,
    detectorId: kind,
    kind: kind as Finding["kind"],
    scope: "intra-function",
    language: "javascript",
    variant: undefined,
    title: `sonda de umbral para ${kind}`,
    detail: "sonda generada por threshold-alignment.test.ts, no un hallazgo real.",
    trigger: [
      {
        label: "sonda",
        value,
        threshold: resolveThreshold(pisoDeclarado(value, { rationale: "sonda de compuerta, no un umbral real" }), {
          language: "javascript",
          sampleSize: () => 0,
          corpusP95: () => null,
        }),
      },
    ],
    locations: [{ file: "sonda.javascript", startLine: 1, endLine: 1, role: "sonda" }],
    severity: 50,
    advice: { primary: { name: "n/a", kind: "refactorizacion", why: "sonda", source: "https://x.test" } },
  };
}

describe("threshold-alignment — ninguna hipótesis acepta un piso más bajo que el de su ancla", () => {
  // Un caso por (kind de ancla, con piso fijo) × (hipótesis anclada a ese kind) — armado desde los registros reales, no una lista a mano: si mañana un detector nuevo declara un piso fijo, o una hipótesis nueva se ancla a un `kind` con piso, esta compuerta lo cubre solo.
  const anchoredKinds = [...new Set(HYPOTHESES.flatMap((h) => h.anchors))];
  const cases = anchoredKinds
    .map((kind) => ({ kind, floor: fixedFloor(kind) }))
    .filter((c): c is { kind: string; floor: number } => c.floor !== null && c.floor > 0);

  it("al menos un ancla con piso fijo existe hoy (conditional-chain=5, repeated-switch=2) — si esto falla, la compuerta quedó vacía y no prueba nada", () => {
    expect(cases.map((c) => c.kind)).toEqual(expect.arrayContaining(["conditional-chain", "repeated-switch"]));
  });

  for (const { kind, floor } of cases) {
    const anchored = HYPOTHESES.filter((h) => h.anchors.includes(kind));

    it(`"${kind}" (piso declarado del detector: ${floor}): ninguna hipótesis anclada acepta un Finding con valor ${floor - 1}`, () => {
      const belowFloor = minimalFinding(kind, floor - 1);
      const offenders: string[] = [];
      for (const h of anchored) {
        const result = h.build(belowFloor, null, permissiveContext());
        if (result !== null) offenders.push(h.id);
      }
      expect(
        offenders,
        `hipótesis que aceptaron un valor (${floor - 1}) por debajo del piso declarado de su ancla "${kind}" (${floor}): ${offenders.join(", ")} — alinear su propio umbral con el del detector.`,
      ).toEqual([]);
    });
  }
});
