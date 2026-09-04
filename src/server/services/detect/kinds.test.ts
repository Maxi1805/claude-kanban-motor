import { describe, expect, it } from "vitest";

import { kindCatalog } from "./kinds.js";
import { DETECTORS } from "./registry.js";
import type { Detector, IntraFileDetector } from "./types.js";

/** Detector mínimo, sólo para ejercitar la derivación del catálogo. */
function fake(id: string, kind: string, title: string): Detector {
  const detector: IntraFileDetector<string, string> = {
    id,
    kind,
    scope: "intra-file",
    title,
    needs: [],
    thresholds: {},
    run: () => [],
  };
  return detector;
}

describe("kindCatalog", () => {
  it("deriva una entrada por kind del registro real, con el title del detector como etiqueta", () => {
    const catalog = kindCatalog();
    expect(catalog.map((entry) => entry.kind)).toEqual(
      [...new Set(DETECTORS.map((d) => d.kind))].sort(),
    );
    for (const entry of catalog) {
      const source = DETECTORS.find((d) => d.kind === entry.kind);
      expect(entry.label).toBe(source?.title);
    }
  });

  it("es determinista: ordenado por kind, sin duplicados aunque dos detectores compartan kind", () => {
    const catalog = kindCatalog([
      fake("zeta", "god-object", "Objeto Dios"),
      fake("alfa", "god-object", "Objeto Dios (variante)"),
      fake("beta", "feature-envy", "Envidia de atributos"),
    ]);
    expect(catalog).toEqual([
      { kind: "feature-envy", label: "Envidia de atributos" },
      { kind: "god-object", label: "Objeto Dios" },
    ]);
  });

  it("acepta un kind que NO está en la unión legada: agregar un detector no toca shared/types.ts", () => {
    const catalog = kindCatalog([fake("shotgun-surgery", "shotgun-surgery", "Cirugía con escopeta")]);
    expect(catalog).toEqual([{ kind: "shotgun-surgery", label: "Cirugía con escopeta" }]);
  });
});
