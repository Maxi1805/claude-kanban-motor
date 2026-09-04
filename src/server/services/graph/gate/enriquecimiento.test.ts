/**
 * Test unitario de `stage-recall.ts` — CONTRATO-F8G.md §7, frente F5.
 *
 * A propósito NO corre la cascada sobre un repo real: eso es
 * `scripts/measure-cascade.mts` (fuera de `src/`, un proceso por repo, la
 * misma disciplina que `census-golden.test.ts` ya documenta para no cargar
 * dos análisis pesados en el mismo proceso vitest). Este archivo verifica
 * que la CONVERSIÓN (`ResolutionStats` → `CascadeFunnel`) y las dos
 * fracciones derivadas (`stageRejectRate`, `stageAcceptShare`) sean
 * correctas contra números conocidos — incluido el caso real que motivó
 * este frente: cobra (Go), donde 8 de las 9 etapas de la cascada no
 * aportaron nada (`considered` puede ser > 0 sin que la etapa acepte o
 * rechace un solo candidato — todo pasa de largo) y `global-uniqueness`
 * concentra el 100% de lo resuelto.
 */
import { describe, expect, it } from "vitest";

import type { ResolutionStageStat, ResolutionStats } from "../stages.js";

import {
  crudeAcceptanceRate,
  formatFunnel,
  formatFunnelTable,
  stageAcceptShare,
  stageRejectRate,
  toCascadeFunnel,
  type CascadeFunnel,
} from "./stage-recall.js";

/** Fila de etapa vacía — misma forma que `emptyStat` en `resolve.ts`, para no repetir 9 etapas a mano en cada caso. */
function stat(stage: ResolutionStageStat["stage"], order: number, partial: Partial<ResolutionStageStat>): ResolutionStageStat {
  return { stage, order, considered: 0, accepted: 0, rejected: 0, narrowed: 0, passed: 0, ...partial };
}

/**
 * Reproduce, con números simplificados, el caso medido de cobra (Go): 1074
 * candidatos, 727 resueltos (todos por `global-uniqueness`), 347 rechazados
 * por `syntactic-role`, y las 7 etapas restantes sin efecto — cada una
 * `considered === accepted+rejected+narrowed+passed` con todo en `passed`.
 */
function cobraLikeStats(): ResolutionStats {
  const untouched = (stage: ResolutionStageStat["stage"], order: number, considered: number): ResolutionStageStat =>
    stat(stage, order, { considered, passed: considered });
  return {
    candidates: 1074,
    resolved: 727,
    droppedAmbiguous: 0,
    unresolved: 0,
    byStage: [
      stat("syntactic-role", 1, { considered: 1074, rejected: 347, passed: 727 }),
      untouched("local-shadow", 2, 727),
      untouched("class-member", 3, 727),
      untouched("bare-constant-receiver", 4, 727),
      untouched("namespace-container", 5, 727),
      untouched("qualified-name", 6, 727),
      untouched("single-file-component", 7, 727),
      stat("global-uniqueness", 8, { considered: 727, accepted: 727 }),
      untouched("path-proximity", 9, 0),
    ],
  };
}

describe("stage-recall.ts — conversión y fracciones derivadas", () => {
  it("toCascadeFunnel copia candidates/resolved/droppedAmbiguous/unresolved y cada fila de etapa tal cual", () => {
    const funnel = toCascadeFunnel("cobra", "go", 36, cobraLikeStats());
    expect(funnel.repo).toBe("cobra");
    expect(funnel.language).toBe("go");
    expect(funnel.files).toBe(36);
    expect(funnel.candidates).toBe(1074);
    expect(funnel.resolved).toBe(727);
    expect(funnel.droppedAmbiguous).toBe(0);
    expect(funnel.unresolved).toBe(0);
    expect(funnel.byStage).toHaveLength(9);
    expect(funnel.byStage[0]).toEqual({
      stage: "syntactic-role",
      order: 1,
      considered: 1074,
      accepted: 0,
      rejected: 347,
      narrowed: 0,
      passed: 727,
    });
  });

  it("stageRejectRate: syntactic-role rechaza 347/1074 (~32.3%) en el caso cobra", () => {
    const funnel = toCascadeFunnel("cobra", "go", 36, cobraLikeStats());
    const role = funnel.byStage.find((r) => r.stage === "syntactic-role")!;
    expect(stageRejectRate(role)).toBeCloseTo(347 / 1074, 10);
  });

  it("stageRejectRate: una etapa que no rechazó nada da 0, no NaN — las 7 etapas intermedias de cobra", () => {
    const funnel = toCascadeFunnel("cobra", "go", 36, cobraLikeStats());
    const untouchedStages = funnel.byStage.filter(
      (r) => !["syntactic-role", "global-uniqueness"].includes(r.stage),
    );
    expect(untouchedStages).toHaveLength(7);
    for (const r of untouchedStages) expect(stageRejectRate(r)).toBe(0);
  });

  it("stageRejectRate: sin candidatos vivos (considered=0), da 0 — path-proximity en cobra", () => {
    const funnel = toCascadeFunnel("cobra", "go", 36, cobraLikeStats());
    const pathProximity = funnel.byStage.find((r) => r.stage === "path-proximity")!;
    expect(pathProximity.considered).toBe(0);
    expect(stageRejectRate(pathProximity)).toBe(0);
  });

  it("stageAcceptShare: global-uniqueness concentra el 100% de lo resuelto en cobra — la brecha central de este frente", () => {
    const funnel = toCascadeFunnel("cobra", "go", 36, cobraLikeStats());
    const globalUniqueness = funnel.byStage.find((r) => r.stage === "global-uniqueness")!;
    expect(stageAcceptShare(globalUniqueness, funnel.resolved)).toBe(1);
    const otherAcceptingStages = funnel.byStage.filter((r) => r.stage !== "global-uniqueness" && r.accepted > 0);
    expect(otherAcceptingStages).toHaveLength(0);
  });

  it("stageAcceptShare: con resolved=0 da 0, no NaN", () => {
    const empty: CascadeFunnel = {
      repo: "vacío",
      language: "x",
      files: 0,
      candidates: 0,
      resolved: 0,
      droppedAmbiguous: 0,
      unresolved: 0,
      byStage: [{ stage: "global-uniqueness", order: 8, considered: 0, accepted: 0, rejected: 0, narrowed: 0, passed: 0 }],
    };
    expect(stageAcceptShare(empty.byStage[0]!, empty.resolved)).toBe(0);
  });

  it("crudeAcceptanceRate: 727/1074 en el caso cobra, 0 cuando no hay candidatos", () => {
    const funnel = toCascadeFunnel("cobra", "go", 36, cobraLikeStats());
    expect(crudeAcceptanceRate(funnel)).toBeCloseTo(727 / 1074, 10);
    expect(
      crudeAcceptanceRate({
        repo: "x",
        language: "y",
        files: 0,
        candidates: 0,
        resolved: 0,
        droppedAmbiguous: 0,
        unresolved: 0,
        byStage: [],
      }),
    ).toBe(0);
  });

  it("formatFunnel: imprime las 9 etapas EN ORDEN de ejecución (order), no en orden de inserción del arreglo", () => {
    const funnel = toCascadeFunnel("cobra", "go", 36, cobraLikeStats());
    // Reordeno el arreglo de entrada a propósito (mismo contenido, distinto
    // orden de `byStage`) para probar que `formatFunnel` ordena por `order`,
    // no confía en el orden en que llegó el arreglo.
    const shuffled: CascadeFunnel = { ...funnel, byStage: [...funnel.byStage].reverse() };
    const text = formatFunnel(shuffled);
    const roleIdx = text.indexOf("syntactic-role");
    const pathIdx = text.indexOf("path-proximity");
    expect(roleIdx).toBeGreaterThan(-1);
    expect(pathIdx).toBeGreaterThan(roleIdx);
    expect(text).toContain("resolved=727");
    expect(text).toContain("droppedAmbiguous=0");
  });

  it("formatFunnelTable: una fila por (repo, etapa), 9 etapas para un solo repo", () => {
    const funnel = toCascadeFunnel("cobra", "go", 36, cobraLikeStats());
    const table = formatFunnelTable([funnel]);
    const lines = table.split("\n");
    // encabezado + 9 filas de etapa
    expect(lines).toHaveLength(1 + 9);
    expect(lines[0]).toContain("repo");
    expect(table).toContain("cobra");
    expect(table).toContain("global-uniqueness");
  });
});
