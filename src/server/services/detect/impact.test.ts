import { describe, expect, it } from "vitest";

import { DETECTOR_IMPACT, IMPACT_TIER_VALUE, impactOf } from "./impact.js";
import { DETECTORS } from "./registry.js";

describe("DETECTOR_IMPACT", () => {
  it("has exactly one entry per registered detector — no missing, no stale", () => {
    const registered = new Set(DETECTORS.map((d) => d.id));
    const declared = new Set(Object.keys(DETECTOR_IMPACT));

    const missing = [...registered].filter((id) => !declared.has(id));
    const stale = [...declared].filter((id) => !registered.has(id));

    expect(missing, `detectores registrados sin tier: ${missing.join(", ")}`).toHaveLength(0);
    expect(stale, `tiers de detectores que ya no existen: ${stale.join(", ")}`).toHaveLength(0);
  });

  it("every value is a known tier", () => {
    for (const [id, tier] of Object.entries(DETECTOR_IMPACT)) {
      expect(Object.keys(IMPACT_TIER_VALUE), `${id} declara un tier desconocido: ${tier}`).toContain(tier);
    }
  });

  it("impactOf resolves every registered detector to a value in (0, 1]", () => {
    for (const d of DETECTORS) {
      const value = impactOf(d.id);
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("impactOf throws for an unregistered detector id — no silent average default", () => {
    expect(() => impactOf("not-a-real-detector")).toThrow();
  });

  it("the examples CONTRATO-F5.md §1.4 names verbatim keep their stated tier", () => {
    // OLA AW, guardián: `demeter-chain` (mantenibilidad) y `unused-variable`
    // (higiene) eran dos de los ejemplos verbatim de este test y esta ola
    // los DESREGISTRÓ (ver `registries.test.ts#DELIBERATELY_UNREGISTERED` y
    // `ola-aw/informes/guardian.md`) — ya no tienen entrada en
    // `DETECTOR_IMPACT`, así que sus dos líneas se sacan de acá. El resto de
    // los ejemplos de CONTRATO-F5.md §1.4 sigue en pie sin tocar.
    expect(DETECTOR_IMPACT["unreachable-code"]).toBe("correccion");
    expect(DETECTOR_IMPACT["empty-catch"]).toBe("correccion");
    expect(DETECTOR_IMPACT["argument-mutation"]).toBe("correccion");
    expect(DETECTOR_IMPACT["dependency-cycle"]).toBe("arquitectura");
    expect(DETECTOR_IMPACT["duplication"]).toBe("arquitectura");
    expect(DETECTOR_IMPACT["orphan-file"]).toBe("arquitectura");
    expect(DETECTOR_IMPACT["unused-symbol"]).toBe("arquitectura");
    expect(DETECTOR_IMPACT["complexity"]).toBe("mantenibilidad");
    expect(DETECTOR_IMPACT["long-function"]).toBe("mantenibilidad");
    expect(DETECTOR_IMPACT["large-class"]).toBe("mantenibilidad");
    expect(DETECTOR_IMPACT["many-returns"]).toBe("higiene");
    expect(DETECTOR_IMPACT["boolean-flag-param"]).toBe("higiene");
    expect(DETECTOR_IMPACT["long-parameter-list"]).toBe("higiene");
  });
});
