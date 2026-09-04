import { describe, expect, it } from "vitest";

import { HYPOTHESES } from "./registry.js";

describe("hypotheses/registry", () => {
  /**
   * CONTRATO-F6.md — S0 dejó el registro vacío a propósito ("no migres
   * ninguna regla: el registro queda vacío"). S1 (el abanico, 17 agentes en
   * paralelo, uno por regla) es quien lo llena — exactamente la señal que
   * el comentario original de este test anticipaba ("si algún día alguien
   * agrega una hipótesis acá sin querer romper este test, es la señal
   * correcta de que el motor ya se congeló y el abanico puede arrancar").
   * Se actualiza junto con el primer agregado, mismo trato que
   * `detect/registry.test.ts` le da a sus tres primeros detectores de F1.
   */
  it("S1: el registro deja de estar vacío a medida que cada regla se migra", () => {
    expect(HYPOTHESES.length).toBeGreaterThan(0);
  });

  it("invariante (una vez no-vacío): ids únicos y ordenados alfabéticamente por pattern", () => {
    const patterns = HYPOTHESES.map((h) => h.pattern);
    expect(new Set(HYPOTHESES.map((h) => h.id)).size).toBe(HYPOTHESES.length);
    expect(patterns).toEqual([...patterns].sort());
  });

  it("invariante: ninguna hipótesis registrada declara `anchors` vacío", () => {
    for (const h of HYPOTHESES) expect(h.anchors.length).toBeGreaterThan(0);
  });
});
