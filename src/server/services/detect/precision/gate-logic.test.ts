/**
 * `evaluateGate` con datos sintéticos — la parte de la compuerta que se puede
 * probar sin las 9 planillas reales del corpus. `gate.test.ts` es la
 * integración (planillas reales, siempre verde sin veredictos); esto prueba
 * el CRITERIO en aislamiento, incluida la propiedad que el encargo pide
 * romper a propósito: "que no se pueda usar para esconder una regresión".
 */
import { describe, expect, it } from "vitest";

import { evaluateGate, MIN_JUDGED, PRECISION_FLOOR } from "./gate-logic.js";
import type { PrecisionRow } from "./types.js";

function row(id: string, overrides: Partial<PrecisionRow> = {}): PrecisionRow {
  return {
    id,
    slug: "s",
    kind: "k",
    language: "",
    pattern: "",
    file: "a.ts",
    startLine: 1,
    endLine: 2,
    symbol: "f",
    title: "t",
    detail: "d",
    metricLabel: "m",
    metricValue: "1",
    evidence: "e",
    verdict: "",
    patternFit: "",
    note: "",
    stillPresent: true,
    lossReason: "",
    ...overrides,
  };
}

describe("evaluateGate — brokenPrecision (mide sólo lo vigente)", () => {
  it("un kind vigente con ≥minJudged y precisión < floor entra a brokenPrecision", () => {
    const rows = [
      row("1", { kind: "k", verdict: "falso" }),
      row("2", { kind: "k", verdict: "falso" }),
      row("3", { kind: "k", verdict: "falso" }),
      row("4", { kind: "k", verdict: "falso" }),
      row("5", { kind: "k", verdict: "verdadero" }),
    ];
    const result = evaluateGate(rows);
    expect(result.brokenPrecision.map((r) => r.kind)).toEqual(["k"]);
  });

  it("filas MUERTAS que arrastran la precisión hacia abajo NO cuentan para brokenPrecision — sólo lo vigente", () => {
    // Caso testigo del encargo: homonymous-delegation medía 39% mezclando
    // filas muertas de un detector viejo, y 83% mirando sólo lo vigente.
    const dead = Array.from({ length: 20 }, (_, i) => row(`dead:${i}`, { kind: "k", verdict: "falso", stillPresent: false }));
    const live = [
      row("live:1", { kind: "k", verdict: "verdadero" }),
      row("live:2", { kind: "k", verdict: "verdadero" }),
      row("live:3", { kind: "k", verdict: "verdadero" }),
      row("live:4", { kind: "k", verdict: "verdadero" }),
      row("live:5", { kind: "k", verdict: "falso" }),
    ];
    const result = evaluateGate([...dead, ...live]);
    expect(result.brokenPrecision).toHaveLength(0); // vigente: 4/5 = 80%, por encima del piso
    expect(result.historical.find((r) => r.kind === "k")!.precision).toBeCloseTo(4 / 25); // el número viejo, auditable al lado
    expect(result.live.find((r) => r.kind === "k")!.precision).toBeCloseTo(0.8);
  });

  it("menos de minJudged vigentes nunca rompe la compuerta, aunque la precisión sea 0%", () => {
    const rows = [row("1", { kind: "k", verdict: "falso" }), row("2", { kind: "k", verdict: "falso" })];
    const result = evaluateGate(rows, { floor: PRECISION_FLOOR, minJudged: MIN_JUDGED });
    expect(result.brokenPrecision).toHaveLength(0);
  });
});

describe("evaluateGate — disappeared (defecto 2, condición 'no puede esconder una desaparición')", () => {
  it("ROMPIÉNDOLA A PROPÓSITO: un kind con ≥minJudged histórico y CERO filas vivas se reporta, nunca desaparece en silencio", () => {
    // Simula exactamente lo que el encargo pide poder detectar: un detector
    // que deja de emitir un kind entero entre una corrida y la siguiente —
    // las 10 filas siguen en la planilla (nunca se borran), todas stillPresent=false.
    const rows = Array.from({ length: 10 }, (_, i) =>
      row(`old:${i}`, { kind: "kind-que-desaparecio", verdict: i < 7 ? "verdadero" : "falso", stillPresent: false }),
    );
    const result = evaluateGate(rows);
    expect(result.disappeared).toHaveLength(1);
    expect(result.disappeared[0]).toEqual({
      kind: "kind-que-desaparecio",
      historicalJudged: 10,
      historicalTruePositive: 7,
      historicalPrecision: 0.7,
    });
    // Y el reporte "vigente" — el que antes era el ÚNICO que existía — no
    // trae ni rastro del kind: sin `disappeared`, esto se perdía en silencio.
    expect(result.live.some((r) => r.kind === "kind-que-desaparecio")).toBe(false);
  });

  it("un kind que se REDUCE (sigue con alguna fila viva) no dispara disappeared — eso es la medida funcionando, no una regresión", () => {
    const rows = [
      ...Array.from({ length: 9 }, (_, i) => row(`old:${i}`, { kind: "k", verdict: "falso", stillPresent: false })),
      row("live:1", { kind: "k", verdict: "verdadero", stillPresent: true }),
    ];
    const result = evaluateGate(rows);
    expect(result.disappeared).toHaveLength(0);
  });

  it("un kind con MENOS de minJudged histórico nunca dispara disappeared, aunque desaparezca del todo — no hay señal suficiente para llamarlo regresión", () => {
    const rows = [row("old:1", { kind: "k", verdict: "verdadero", stillPresent: false })];
    const result = evaluateGate(rows, { floor: PRECISION_FLOOR, minJudged: MIN_JUDGED });
    expect(result.disappeared).toHaveLength(0);
  });

  it("un kind sin ninguna fila juzgada nunca dispara disappeared — 'sin medir' no es 'desaparecido'", () => {
    const rows = [row("old:1", { kind: "k", verdict: "", stillPresent: false })];
    const result = evaluateGate(rows);
    expect(result.disappeared).toHaveLength(0);
  });
});

describe("evaluateGate — basisLost (tercer agujero: el kind sigue vivo pero se le mueren los veredictos)", () => {
  it("ROMPIÉNDOLA A PROPÓSITO: un kind que sigue EMITIENDO pero se queda sin veredictos vigentes se reporta, no se cae de las dos cláusulas en silencio", () => {
    // La forma real del agujero, medida sobre el corpus el día de la auditoría:
    // el detector cambia de forma, sus filas juzgadas quedan huérfanas
    // (stillPresent=false) y las nuevas que sí emite no las juzgó nadie.
    // `disappeared` no dispara (hay filas vivas) y `brokenPrecision` tampoco
    // (no hay >= minJudged vivos): sin `basisLost` la compuerta queda verde.
    const rows = [
      ...Array.from({ length: 11 }, (_, i) => row(`muerta:${i}`, { kind: "k", verdict: "falso", stillPresent: false })),
      ...Array.from({ length: 8 }, (_, i) => row(`viva:${i}`, { kind: "k", verdict: "", stillPresent: true })),
    ];
    const result = evaluateGate(rows);
    expect(result.disappeared).toHaveLength(0);
    expect(result.brokenPrecision).toHaveLength(0);
    expect(result.basisLost).toEqual([
      {
        kind: "k",
        historicalJudged: 11,
        historicalTruePositive: 0,
        historicalPrecision: 0,
        liveJudged: 0,
        liveSampled: 8,
      },
    ]);
  });

  it("la base se encoge por DEBAJO del piso aunque queden algunos veredictos vivos — también se reporta", () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) =>
        row(`muerta:${i}`, { kind: "k", verdict: "verdadero", stillPresent: false }),
      ),
      row("viva:1", { kind: "k", verdict: "verdadero", stillPresent: true }),
      row("viva:2", { kind: "k", verdict: "falso", stillPresent: true }),
    ];
    const result = evaluateGate(rows);
    expect(result.basisLost.map((b) => [b.kind, b.liveJudged])).toEqual([["k", 2]]);
  });

  it("un kind con base VIGENTE suficiente nunca entra a basisLost, aunque tenga muchas filas muertas", () => {
    const rows = [
      ...Array.from({ length: 20 }, (_, i) => row(`muerta:${i}`, { kind: "k", verdict: "falso", stillPresent: false })),
      ...Array.from({ length: MIN_JUDGED }, (_, i) =>
        row(`viva:${i}`, { kind: "k", verdict: "verdadero", stillPresent: true }),
      ),
    ];
    const result = evaluateGate(rows);
    expect(result.basisLost).toHaveLength(0);
  });

  it("un kind que nunca tuvo base histórica no entra a basisLost — 'nunca medido' no es 'perdió la medición'", () => {
    const rows = [
      row("muerta:1", { kind: "k", verdict: "falso", stillPresent: false }),
      row("viva:1", { kind: "k", verdict: "", stillPresent: true }),
    ];
    const result = evaluateGate(rows);
    expect(result.basisLost).toHaveLength(0);
  });

  it("CASO REAL — `boolean-complexity` (RAICES.md PENDIENTES §1-BIS, 'el apagado'): un umbral mal conjugado colapsó el volumen de 289 a 10 hallazgos y ninguno de los veredictos históricamente juzgados (18, todos 'falso') sigue vivo — la compuerta tiene que dar rojo, no 'no medido'. Números reales tomados de tests/golden/precision el día de la auditoría: 18 juzgados históricos (0 verdaderos), 18 filas vivas, 0 juzgados vivos", () => {
    const rows = [
      ...Array.from({ length: 18 }, (_, i) => row(`historico:${i}`, { kind: "boolean-complexity", verdict: "falso", stillPresent: false })),
      ...Array.from({ length: 18 }, (_, i) => row(`vivo:${i}`, { kind: "boolean-complexity", verdict: "", stillPresent: true })),
    ];
    const result = evaluateGate(rows);
    // Ni disappeared (sigue emitiendo, hay 18 filas vivas) ni brokenPrecision
    // (0 juzgados vivos, por debajo de minJudged: no hay número que comparar
    // contra el piso) lo atrapan — SÓLO basisLost puede, y tiene que hacerlo.
    expect(result.disappeared.map((d) => d.kind)).not.toContain("boolean-complexity");
    expect(result.brokenPrecision.map((r) => r.kind)).not.toContain("boolean-complexity");
    expect(result.basisLost.map((b) => b.kind)).toContain("boolean-complexity");
    const bc = result.basisLost.find((b) => b.kind === "boolean-complexity")!;
    expect(bc.historicalJudged).toBe(18);
    expect(bc.historicalTruePositive).toBe(0);
    expect(bc.liveJudged).toBe(0);
    expect(bc.liveSampled).toBe(18);
  });

  it("ROMPIÉNDOLA A PROPÓSITO — si `basisLost` sólo mirara 'murieron TODOS los veredictos' (liveJudged === 0) en vez de 'la base cayó bajo el mínimo' (liveJudged < minJudged), el caso real de `boolean-complexity` con ALGUNOS veredictos vivos pero insuficientes seguiría colándose en silencio: 4 juzgados vivos (< 5) tiene que reportarse igual que 0", () => {
    const rows = [
      ...Array.from({ length: 18 }, (_, i) => row(`historico:${i}`, { kind: "boolean-complexity", verdict: "falso", stillPresent: false })),
      ...Array.from({ length: 4 }, (_, i) => row(`vivo-juzgado:${i}`, { kind: "boolean-complexity", verdict: "falso", stillPresent: true })),
      ...Array.from({ length: 6 }, (_, i) => row(`vivo-pendiente:${i}`, { kind: "boolean-complexity", verdict: "", stillPresent: true })),
    ];
    const result = evaluateGate(rows);
    expect(result.basisLost.map((b) => b.kind)).toContain("boolean-complexity");
    const bc = result.basisLost.find((b) => b.kind === "boolean-complexity")!;
    expect(bc.liveJudged).toBe(4); // < minJudged (5), no 0 — y aun así tiene que dar rojo
  });

  it("un kind que desapareció DEL TODO va a disappeared y NO se duplica en basisLost", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      row(`muerta:${i}`, { kind: "k", verdict: "falso", stillPresent: false }),
    );
    const result = evaluateGate(rows);
    expect(result.disappeared.map((d) => d.kind)).toEqual(["k"]);
    expect(result.basisLost).toHaveLength(0);
  });
});

describe("evaluateGate — el número viejo viaja siempre al lado del vigente", () => {
  it("historical y live cubren la MISMA población de kinds cuando nada desapareció, con cifras potencialmente distintas", () => {
    const rows = [
      row("1", { kind: "k", verdict: "verdadero", stillPresent: true }),
      row("2", { kind: "k", verdict: "falso", stillPresent: false }),
    ];
    const result = evaluateGate(rows);
    expect(result.historical.find((r) => r.kind === "k")!.sampledTotal).toBe(2);
    expect(result.live.find((r) => r.kind === "k")!.sampledTotal).toBe(1);
  });
});
