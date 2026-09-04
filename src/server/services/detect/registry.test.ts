import { describe, expect, it } from "vitest";

import { DETECTORS, type RegisteredFindingKind } from "./registry.js";

/**
 * Assertion de TIPO, no de runtime. Si alguien vuelve a anotar `DETECTORS`
 * como `readonly Detector[]` (en vez de `as const satisfies`), o si un
 * detector se olvida de pasar su literal de `kind` como parámetro de tipo,
 * `RegisteredFindingKind` colapsa a `string`, `Equals<…, string>` da `true` y
 * ESTE archivo deja de compilar bajo `tsc --noEmit`. Es la única forma de
 * proteger la derivación del catálogo: en runtime la regresión no se nota,
 * porque los kinds siguen estando ahí como datos.
 *
 * A propósito NO enumera los kinds esperados: eso volvería a hacer de este
 * archivo algo que cada detector nuevo tiene que editar, exactamente el
 * problema que la apertura de `CodeFindingKind` vino a resolver.
 */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const _kindNoColapsoAString: Equals<RegisteredFindingKind, string> = false;
void _kindNoColapsoAString;

describe("registry", () => {
  /**
   * Deliberadamente `arrayContaining` y no una igualdad exacta: un detector
   * nuevo NO debe tener que editar este test. Lo que importa como invariante
   * es que los tres de F1 sigan registrados, no que sean los únicos.
   */
  it("F1: los tres primeros detectores reales siguen registrados (empty-catch, large-class, repeated-switch)", () => {
    expect(DETECTORS.map((d) => d.id)).toEqual(
      expect.arrayContaining(["empty-catch", "large-class", "repeated-switch"]),
    );
  });

  it("invariante: ids únicos y ordenados alfabéticamente", () => {
    const ids = DETECTORS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort());
  });

  it("invariante: todo detector declara un kind kebab-case no vacío (lo consume el censo como `hallazgo:<kind>`)", () => {
    for (const detector of DETECTORS) {
      expect(detector.kind).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});
