import { describe, expect, it } from "vitest";

import { deriveAnchor, findingId, serializeAnchor } from "./ids.js";
import type { RoleLocation } from "./types.js";

describe("serializeAnchor — CONTRATO-F9.md §2.3, congelada", () => {
  it("nivel archivo: `f#`", () => {
    expect(serializeAnchor({ file: "a.rb", symbolPath: [] })).toBe("a.rb#");
  });

  it("símbolo sin ordinal: `f#a.b`", () => {
    expect(serializeAnchor({ file: "a.rb", symbolPath: ["A", "b"] })).toBe("a.rb#A.b");
  });

  it("símbolo con ordinal: `f#a.b@2`", () => {
    expect(serializeAnchor({ file: "a.rb", symbolPath: ["A", "b"], ordinal: 2 })).toBe("a.rb#A.b@2");
  });
});

describe("findingId", () => {
  it("es determinista", () => {
    const anchors = [{ file: "a.rb", symbolPath: ["A", "b"] }];
    expect(findingId("long-function", undefined, anchors)).toBe(findingId("long-function", undefined, anchors));
  });

  it("el orden de las copias de un clon no cambia el id", () => {
    const a = { file: "a.rb", symbolPath: ["A"] };
    const b = { file: "b.rb", symbolPath: ["B"] };
    expect(findingId("duplication", undefined, [a, b])).toBe(findingId("duplication", undefined, [b, a]));
  });

  it("no entra la línea, el valor de la métrica ni la severidad: sólo detectorId + variant + anclas", () => {
    // El propio tipo de `Anchor`/`findingId` no acepta línea/valor/severidad como
    // parámetro — este test documenta que dos "hallazgos" con anclas idénticas
    // pero que en la práctica vendrían de mediciones distintas (48 miembros vs.
    // 51) producen el MISMO id, que es la propiedad que el contrato pide.
    const anchors = [{ file: "big.rb", symbolPath: ["BigClass"] }];
    expect(findingId("large-class", undefined, anchors)).toBe(findingId("large-class", undefined, anchors));
  });

  it("detectorId distinto ⇒ id distinto, aun con las mismas anclas", () => {
    const anchors = [{ file: "a.rb", symbolPath: [] }];
    expect(findingId("long-function", undefined, anchors)).not.toBe(findingId("complexity", undefined, anchors));
  });

  it("variant distinto ⇒ id distinto", () => {
    const anchors = [{ file: "a.rb", symbolPath: [] }];
    expect(findingId("conditional-chain", "null-check", anchors)).not.toBe(
      findingId("conditional-chain", "type-switch", anchors),
    );
  });

  it("archivo distinto ⇒ id distinto (renombrar/mover SÍ acuña un id nuevo — aceptado)", () => {
    const a = [{ file: "old.rb", symbolPath: ["X"] }];
    const b = [{ file: "new.rb", symbolPath: ["X"] }];
    expect(findingId("long-function", undefined, a)).not.toBe(findingId("long-function", undefined, b));
  });

  it("tiene el prefijo `${detectorId}:`", () => {
    const id = findingId("long-function", undefined, [{ file: "a.rb", symbolPath: [] }]);
    expect(id.startsWith("long-function:")).toBe(true);
  });

  it("ordinal entra en la serialización cuando está presente", () => {
    const withOrdinal = [{ file: "a.rb", symbolPath: ["each"], ordinal: 2 }];
    const withoutOrdinal = [{ file: "a.rb", symbolPath: ["each"] }];
    expect(findingId("long-function", undefined, withOrdinal)).not.toBe(
      findingId("long-function", undefined, withoutOrdinal),
    );
  });
});

describe("deriveAnchor", () => {
  it("usa el anchor si está presente", () => {
    const loc: RoleLocation = {
      file: "a.rb",
      startLine: 1,
      endLine: 2,
      role: "copia",
      anchor: { file: "b.rb", symbolPath: ["X"] },
    };
    expect(deriveAnchor(loc)).toEqual({ file: "b.rb", symbolPath: ["X"] });
  });

  it("si falta, se deriva de file + symbol", () => {
    const loc: RoleLocation = { file: "a.rb", startLine: 1, endLine: 2, role: "copia", symbol: "Foo#bar" };
    expect(deriveAnchor(loc)).toEqual({ file: "a.rb", symbolPath: ["Foo#bar"] });
  });

  it("si falta symbol también, symbolPath queda vacío (nivel archivo)", () => {
    const loc: RoleLocation = { file: "a.rb", startLine: 1, endLine: 2, role: "copia" };
    expect(deriveAnchor(loc)).toEqual({ file: "a.rb", symbolPath: [] });
  });
});
