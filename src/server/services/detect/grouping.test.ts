import { describe, expect, it } from "vitest";

import {
  buildConfidenceOf,
  bucketFindings,
  byGroupRankDescThenId,
  declaredGroupKey,
  DEGENERATE_CONFIDENCE_FLOOR,
  DEGENERATE_MIN,
  defaultEvidenceQuality,
  finalizeGroups,
  GROUP_MIN,
  PROVENANCE_INFERRED_CONFIDENCE,
  PROVENANCE_MAJORITY_THRESHOLD,
  type FindingBucket,
  type FindingGroup,
} from "./grouping.js";
import type { Finding } from "./types.js";

function finding(opts: { id: string; detectorId: string; severity?: number; file?: string; kind?: string }): Finding {
  return {
    id: opts.id,
    detectorId: opts.detectorId,
    kind: opts.kind ?? "unused-variable",
    scope: "intra-function",
    language: "typescript",
    title: "t",
    detail: "d",
    trigger: [{ label: "m", value: 1, threshold: { value: 1, source: "test" } as never }],
    locations: [{ file: opts.file ?? "a.ts", startLine: 1, endLine: 1, role: "primary" }],
    severity: opts.severity ?? 50,
    advice: { primary: { name: "n", kind: "refactorizacion", why: "w", source: "s" } },
  };
}

const scoreIsSeverity = (f: Finding): number => f.severity;

describe("bucketFindings — Nivel 2 (archivo, kind), gateado por GROUP_MIN", () => {
  it("por debajo de GROUP_MIN, cada hallazgo queda en su propio bucket", () => {
    const findings = Array.from({ length: GROUP_MIN - 1 }, (_, i) => finding({ id: `f${i}`, detectorId: "long-function" }));
    const buckets = bucketFindings(findings);
    expect(buckets).toHaveLength(GROUP_MIN - 1);
    for (const b of buckets) expect(b.members).toHaveLength(1);
  });

  it("al llegar a GROUP_MIN, (mismo archivo, mismo kind) colapsa a UN bucket", () => {
    const findings = Array.from({ length: GROUP_MIN }, (_, i) => finding({ id: `f${i}`, detectorId: "long-function" }));
    const buckets = bucketFindings(findings);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.members).toHaveLength(GROUP_MIN);
  });

  it("archivos distintos nunca se mezclan, aunque el kind sea el mismo", () => {
    const findings = [
      ...Array.from({ length: GROUP_MIN }, (_, i) => finding({ id: `a${i}`, detectorId: "long-function", file: "a.ts" })),
      ...Array.from({ length: GROUP_MIN }, (_, i) => finding({ id: `b${i}`, detectorId: "long-function", file: "b.ts" })),
    ];
    const buckets = bucketFindings(findings);
    expect(buckets).toHaveLength(2);
    expect(buckets.map((b) => b.members.length).sort()).toEqual([GROUP_MIN, GROUP_MIN]);
  });

  it("kinds distintos en el mismo archivo nunca se mezclan — nunca 'una tarjeta por archivo'", () => {
    const findings = [
      ...Array.from({ length: GROUP_MIN }, (_, i) => finding({ id: `uv${i}`, detectorId: "unused-variable", kind: "unused-variable" })),
      ...Array.from({ length: GROUP_MIN }, (_, i) => finding({ id: `lf${i}`, detectorId: "long-function", kind: "long-function" })),
    ];
    const buckets = bucketFindings(findings);
    expect(buckets).toHaveLength(2);
  });

  it("guardia degenerada: memberCount >= DEGENERATE_MIN y confianza mediana baja -> degenerate", () => {
    const findings = Array.from({ length: DEGENERATE_MIN }, (_, i) => finding({ id: `f${i}`, detectorId: "long-function" }));
    const [bucket] = bucketFindings(findings, { evidenceQualityOf: () => 0.3 });
    expect(bucket!.degenerate).toBe(true);
  });

  it("con evidencia de alta calidad, NO degenera aunque el volumen sea alto", () => {
    const findings = Array.from({ length: DEGENERATE_MIN * 2 }, (_, i) => finding({ id: `f${i}`, detectorId: "long-function" }));
    const [bucket] = bucketFindings(findings, { evidenceQualityOf: () => 0.9 });
    expect(bucket!.degenerate).toBe(false);
  });

  it("justo por debajo de DEGENERATE_MIN, con evidencia mala, NO degenera (el piso es estricto)", () => {
    const findings = Array.from({ length: DEGENERATE_MIN - 1 }, (_, i) => finding({ id: `f${i}`, detectorId: "long-function" }));
    const [bucket] = bucketFindings(findings, { evidenceQualityOf: () => 0.1 });
    expect(bucket!.degenerate).toBe(false);
  });

  it("defaultEvidenceQuality es 0.5 para todos — por debajo del piso 0.7, así que la guardia hoy depende sólo del volumen", () => {
    expect(defaultEvidenceQuality(finding({ id: "x", detectorId: "long-function" }))).toBe(0.5);
    expect(0.5).toBeLessThan(DEGENERATE_CONFIDENCE_FLOOR);
  });
});

describe("declaredGroupKey — Nivel 1", () => {
  it("undefined para cualquier detector registrado que no declare groupKey (hoy: los 22)", () => {
    expect(declaredGroupKey(finding({ id: "x", detectorId: "long-function" }))).toBeUndefined();
    expect(declaredGroupKey(finding({ id: "y", detectorId: "unused-variable" }))).toBeUndefined();
  });

  it("un detectorId desconocido (fuera del registro) también da undefined, nunca revienta", () => {
    expect(declaredGroupKey(finding({ id: "z", detectorId: "no-existe" }))).toBeUndefined();
  });

  /**
   * OLA P, FRENTE P10. Hasta esta ola el Nivel 1 era un punto de extensión sin
   * un solo usuario, y el docstring del módulo lo decía así. `duplication` es
   * el primero que lo declara; si esto se cae, ese detector vuelve al Nivel 2
   * (agrupar por dónde cae la PRIMERA copia) y con él vuelve el sobre-conteo
   * de volumen que motivó el cambio.
   */
  it("`duplication` SÍ declara Nivel 1, contra el registro real (el primero del catálogo)", () => {
    const dup = finding({ id: "d", detectorId: "duplication", kind: "duplication" });
    const clave = declaredGroupKey({
      ...dup,
      locations: [
        { file: "b.ts", startLine: 1, endLine: 2, role: "primera copia" },
        { file: "a.ts", startLine: 9, endLine: 10, role: "copia #2" },
      ],
    });
    expect(clave).toBeDefined();
    expect(clave).toContain("duplication");
    // Estable frente al orden en que el recorrido trajo las ubicaciones.
    const misma = declaredGroupKey({
      ...dup,
      id: "d2",
      locations: [
        { file: "a.ts", startLine: 40, endLine: 41, role: "primera copia" },
        { file: "b.ts", startLine: 70, endLine: 71, role: "copia #2" },
      ],
    });
    expect(misma).toBe(clave);
  });
});

/**
 * OLA P, FRENTE P10 — ver el docstring de `makeBucket`: la guardia degenerada
 * se midió contra grupos formados por MERA VECINDAD `(archivo, kind)` y su
 * texto ("es más probable que sea un idioma de este archivo que N problemas
 * distintos") es una hipótesis sobre eso. Un grupo cuya causa raíz declaró el
 * propio detector no es esa hipótesis, y además `code-analyzer.ts
 * #toGroupedCodeFinding` PISA el `detail` del representante cuando el grupo es
 * degenerado — lo que, para `duplication`, borraría la lista de copias que es
 * justamente la evidencia que este frente agregó.
 */
describe("la guardia degenerada es de Nivel 2, no de Nivel 1", () => {
  it("un grupo declarado por el detector no degenera por volumen, por grande que sea", () => {
    const findings = Array.from({ length: DEGENERATE_MIN * 3 }, (_, i) => finding({ id: `f${i}`, detectorId: "d" }));
    const [bucket] = bucketFindings(findings, { groupKeyOf: () => "causa-raiz", evidenceQualityOf: () => 0.1 });
    expect(bucket!.members).toHaveLength(DEGENERATE_MIN * 3);
    expect(bucket!.degenerate).toBe(false);
  });

  it("control positivo: los MISMOS hallazgos, sin clave declarada, siguen degenerando por Nivel 2", () => {
    const findings = Array.from({ length: DEGENERATE_MIN * 3 }, (_, i) => finding({ id: `f${i}`, detectorId: "d" }));
    const [bucket] = bucketFindings(findings, { groupKeyOf: () => undefined, evidenceQualityOf: () => 0.1 });
    expect(bucket!.members).toHaveLength(DEGENERATE_MIN * 3);
    expect(bucket!.degenerate).toBe(true);
  });
});

describe("bucketFindings — inyección de groupKeyOf (Nivel 1 sin depender del registro real)", () => {
  it("una clave declarada agrupa aunque esté por debajo de GROUP_MIN — a diferencia de Nivel 2", () => {
    const findings = [
      finding({ id: "a", detectorId: "dependency-cycle" }),
      finding({ id: "b", detectorId: "dependency-cycle" }),
    ];
    const buckets = bucketFindings(findings, { groupKeyOf: () => "same-cycle" });
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.members).toHaveLength(2);
  });

  it("bucketFindings usa la clave de groupKeyOf tal cual, opaca — es responsabilidad del resolutor namespacear (declaredGroupKey lo hace, ver abajo)", () => {
    const findings = [
      finding({ id: "a", detectorId: "det-x" }),
      finding({ id: "b", detectorId: "det-y" }),
    ];
    // Un `groupKeyOf` que NO namespacea por detector (caso patológico,
    // deliberado acá) sí puede colisionar entre detectores distintos —
    // exactamente por eso `declaredGroupKey` (el resolutor real) namespacea
    // por `detectorId` él mismo, como confirma el siguiente test.
    const collided = bucketFindings(findings, { groupKeyOf: () => "same-raw-key" });
    expect(collided).toHaveLength(1);

    const namespaced = bucketFindings(findings, { groupKeyOf: (f) => `${f.detectorId}:same-raw-key` });
    expect(namespaced).toHaveLength(2);
  });

  it("groupKeyOf puede devolver undefined para un hallazgo puntual y usar Nivel 2 para ese caso", () => {
    const grouped = Array.from({ length: GROUP_MIN }, (_, i) => finding({ id: `g${i}`, detectorId: "d" }));
    const ungroupable = finding({ id: "solo", detectorId: "d", file: "other.ts" });
    const buckets = bucketFindings([...grouped, ungroupable], {
      groupKeyOf: (f) => (f.id === "solo" ? undefined : "shared-cause"),
    });
    // el grupo declarado (5 miembros) + el suelto que cayó a Nivel 2 pero no llegó a GROUP_MIN por sí solo.
    expect(buckets).toHaveLength(2);
    expect(buckets.find((b) => b.members.length === 5)).toBeDefined();
    expect(buckets.find((b) => b.members.length === 1)).toBeDefined();
  });
});

describe("buildConfidenceOf", () => {
  it("0.5 para todo miembro de un bucket degenerado, 1.0 para el resto", () => {
    const degenerate: FindingBucket = {
      key: "d",
      members: [finding({ id: "d1", detectorId: "x" }), finding({ id: "d2", detectorId: "x" })],
      degenerate: true,
    };
    const healthy: FindingBucket = {
      key: "h",
      members: [finding({ id: "h1", detectorId: "y" })],
      degenerate: false,
    };
    const confidenceOf = buildConfidenceOf([degenerate, healthy]);
    expect(confidenceOf(degenerate.members[0]!)).toBe(0.5);
    expect(confidenceOf(degenerate.members[1]!)).toBe(0.5);
    expect(confidenceOf(healthy.members[0]!)).toBe(1.0);
  });

  it("sin `inferredShareOf` (default), el comportamiento es EXACTAMENTE el de antes de esta ola — el único call site de producción (code-analyzer.ts) llama con un solo argumento", () => {
    const degenerate: FindingBucket = {
      key: "d",
      members: [finding({ id: "d1", detectorId: "x" })],
      degenerate: true,
    };
    const healthy: FindingBucket = { key: "h", members: [finding({ id: "h1", detectorId: "y" })], degenerate: false };
    const confidenceOf = buildConfidenceOf([degenerate, healthy]);
    expect(confidenceOf(degenerate.members[0]!)).toBe(0.5);
    expect(confidenceOf(healthy.members[0]!)).toBe(1.0);
  });

  it("CONTRATO-F5.md §4.4: share de evidencia `inferred` > 0.5 -> conf = 0.7 para un hallazgo de un grupo NO degenerado", () => {
    const healthy: FindingBucket = { key: "h", members: [finding({ id: "h1", detectorId: "y" })], degenerate: false };
    const confidenceOf = buildConfidenceOf([healthy], (f) => (f.id === "h1" ? 0.81 : undefined));
    expect(confidenceOf(healthy.members[0]!)).toBe(PROVENANCE_INFERRED_CONFIDENCE);
  });

  it("el piso es estricto ('>' no '>='): exactamente 0.5 de share NO degrada", () => {
    const healthy: FindingBucket = { key: "h", members: [finding({ id: "h1", detectorId: "y" })], degenerate: false };
    const confidenceOf = buildConfidenceOf([healthy], () => PROVENANCE_MAJORITY_THRESHOLD);
    expect(confidenceOf(healthy.members[0]!)).toBe(1.0);
  });

  it("`inferredShareOf` -> undefined es 'sin señal', nunca se lee como 0 (que afirmaría evidencia toda confiable) ni degrada", () => {
    const healthy: FindingBucket = { key: "h", members: [finding({ id: "h1", detectorId: "y" })], degenerate: false };
    const confidenceOf = buildConfidenceOf([healthy], () => undefined);
    expect(confidenceOf(healthy.members[0]!)).toBe(1.0);
  });

  it("las dos degradaciones combinan por MÍNIMO, nunca producto: 0.7 * 0.5 = 0.35 rompería el piso [0.5,1.0]", () => {
    const degenerate: FindingBucket = {
      key: "d",
      members: [finding({ id: "d1", detectorId: "x" })],
      degenerate: true,
    };
    const confidenceOf = buildConfidenceOf([degenerate], () => 0.9); // degenerado Y mayoría inferred
    expect(confidenceOf(degenerate.members[0]!)).toBe(0.5); // min(0.5, 0.7), NUNCA 0.35
    expect(confidenceOf(degenerate.members[0]!)).toBeGreaterThanOrEqual(0.5); // respeta el piso declarado
  });
});

describe("finalizeGroups — Fase 2, ya con score", () => {
  it("el representante es el de MEJOR score, y el rank de un grupo sano es el máximo, no la suma", () => {
    const bucket: FindingBucket = {
      key: "k",
      members: [
        finding({ id: "a", detectorId: "x", severity: 10 }),
        finding({ id: "b", detectorId: "x", severity: 90 }),
        finding({ id: "c", detectorId: "x", severity: 50 }),
      ],
      degenerate: false,
    };
    const [group] = finalizeGroups([bucket], scoreIsSeverity);
    expect(group!.representative.id).toBe("b");
    expect(group!.rank).toBe(90);
  });

  it("un grupo degenerado usa la MEDIANA de sus miembros como rank, no el máximo", () => {
    const bucket: FindingBucket = {
      key: "k",
      members: [
        finding({ id: "a", detectorId: "x", severity: 10 }),
        finding({ id: "b", detectorId: "x", severity: 90 }),
        finding({ id: "c", detectorId: "x", severity: 50 }),
      ],
      degenerate: true,
    };
    const [group] = finalizeGroups([bucket], scoreIsSeverity);
    expect(group!.rank).toBe(50);
  });

  it("los miembros quedan ordenados score desc, luego id asc en empate", () => {
    const bucket: FindingBucket = {
      key: "k",
      members: [
        finding({ id: "b", detectorId: "x", severity: 10 }),
        finding({ id: "a", detectorId: "x", severity: 10 }),
        finding({ id: "c", detectorId: "x", severity: 90 }),
      ],
      degenerate: false,
    };
    const [group] = finalizeGroups([bucket], scoreIsSeverity);
    expect(group!.members.map((m) => m.id)).toEqual(["c", "a", "b"]);
  });
});

describe("byGroupRankDescThenId", () => {
  it("ordena por rank desc, y por id del representante asc en empate", () => {
    const groupOf = (id: string, rank: number): FindingGroup => ({
      key: id,
      members: [finding({ id, detectorId: "x", severity: rank })],
      representative: finding({ id, detectorId: "x", severity: rank }),
      degenerate: false,
      rank,
    });
    const groups = [groupOf("b", 50), groupOf("a", 50), groupOf("c", 90)];
    const sorted = [...groups].sort(byGroupRankDescThenId);
    expect(sorted.map((g) => g.representative.id)).toEqual(["c", "a", "b"]);
  });
});
