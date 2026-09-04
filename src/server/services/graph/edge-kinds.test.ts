/**
 * `graph/edge-kinds.ts` + `graph/edge-coverage.ts` — CONTRATO-F9.md §5. Fija
 * la forma que F6 va a consumir: las 12 entradas exhaustivas de
 * `EDGE_KIND_SPECS` y los 5 veredictos de `verdictForEdgeCell`, en el orden
 * en que se evalúan. NO es el test de dos bloques que el contrato reserva
 * para F6 (`graph/edge-coverage.test.ts`, con su bloque de corpus
 * condicional) — ver el docstring de `edge-coverage.ts` para por qué el
 * nombre es distinto a propósito.
 */
import { describe, expect, it } from "vitest";

import { LANGUAGES_MEASURED } from "../detect/language-coverage.js";
import { EDGE_KIND_SPECS, type EdgeKindSpec } from "./edge-kinds.js";
import { edgeCoverageMatrix, verdictForEdgeCell, type EdgeCoverageSample } from "./edge-coverage.js";
import type { EdgeKind } from "./types.js";

const ALL_KINDS: readonly EdgeKind[] = [
  "contains",
  "references",
  "extends",
  "implements",
  "mixes-in",
  "instantiates",
  "imports",
  "satisfies",
  "calls",
  "affects",
  "carries",
  "invokes-indirect",
  // Ola R — las dos que modelan FLUJO DE DATOS y no estructura: `declares-type`
  // (R1, tipo escrito en un sitio de declaración) y `stores` (R3, el eslabón
  // `construye → guarda` de la cadena de identidad).
  "declares-type",
  "stores",
];

function sample(overrides: Partial<EdgeCoverageSample> = {}): EdgeCoverageSample {
  return {
    language: "java",
    filesAnalysed: 200,
    lines: 20_000,
    edgesEmitted: 0,
    capabilities: new Set(),
    ...overrides,
  };
}

describe("EDGE_KIND_SPECS", () => {
  it("tiene una entrada por EdgeKind, exhaustivo — 14 desde la Ola R", () => {
    expect(Object.keys(EDGE_KIND_SPECS).sort()).toEqual([...ALL_KINDS].sort());
  });

  it("cada spec.kind coincide con su propia clave", () => {
    for (const [key, spec] of Object.entries(EDGE_KIND_SPECS)) {
      expect(spec.kind).toBe(key);
    }
  });

  // F6 (Ola 9) pobló `absentIn` para las celdas verificadas con fixture, tal
  // como el docstring del módulo lo delega ("Poblarlo... es trabajo de F6").
  // Esta fijación ya NO exige vacío en las 12: exige que las que TIENEN
  // razón sean EXACTAMENTE las verificadas (ni una de más sin fixture citado,
  // ni una de menos si alguien la borra sin querer) y que el resto siga
  // vacío. Ver `graph/edge-kinds.ts` para la razón + fixture de cada una.
  //
  // `extends`/`implements` YA NO tienen `csharp` acá — RETIRADO esta ola
  // (frente "el extractor no ve"): C# dejó de ser un cero de lenguaje
  // entero para las dos, ver `graph/edge-kinds.ts` y
  // `herencia.ts`/`interfaz-declarada.ts` §"AMBIGÜEDAD DECLARADA — C#".
  it("absentIn: sólo las celdas verificadas con fixture por F6 (Ola 9) tienen razón — el resto sigue vacío", () => {
    const withReason: Record<string, string[]> = {};
    for (const spec of Object.values(EDGE_KIND_SPECS)) {
      const langs = Object.keys(spec.absentIn);
      if (langs.length > 0) withReason[spec.kind] = langs.sort();
    }
    expect(withReason).toEqual({
      "mixes-in": ["csharp", "go", "java", "javascript", "python", "tsx", "typescript", "vue"].sort(),
      // `declares-type` YA NO ESTÁ acá — RETIRADO en la Ola R (frente R2), y
      // el cambio ESTRECHA la compuerta en vez de aflojarla. R1 había
      // declarado `ruby`/`javascript` como `sin-construccion` porque sus
      // gramáticas no tienen dónde ESCRIBIR un tipo. Sigue siendo cierto de
      // la VÍA 1, pero `absentIn` es del KIND: desde R2 hay una segunda vía
      // (`graph/edges/propaga-tipo.ts` — el tipo sale del ORIGEN del valor) y
      // las dos celdas EMITEN en producción (medido: jekyll 46 aristas /
      // 213 sitios, rubocop 64 / 1.488, eslint 40 / 1.405, preact 2 / 162).
      // Con la razón puesta, la compuerta habría contestado
      // `sin-construccion` con `n: 0` para dos celdas VIVAS — esconder
      // emisión real detrás de una excusa de lenguaje, que es exactamente lo
      // que este campo existe para impedir. Sin ella, esas dos celdas tienen
      // que sostenerse solas o la compuerta las marca `mudo-sin-razon`.
    });
  });

  it("producer es uno de los 4 valores del contrato", () => {
    const allowed = new Set(["extractor", "cascade", "derived", "attach"]);
    for (const spec of Object.values(EDGE_KIND_SPECS)) {
      expect(allowed.has(spec.producer)).toBe(true);
    }
  });
});

describe("verdictForEdgeCell", () => {
  const spec: EdgeKindSpec = { kind: "extends", producer: "extractor", needs: ["herencia"], absentIn: {} };

  it("no-aplicable: falta una capacidad de `needs`", () => {
    const cell = verdictForEdgeCell(spec, sample({ capabilities: new Set() }));
    expect(cell.verdict).toBe("no-aplicable");
  });

  it("sin-construccion: absentIn tiene razón para este lenguaje", () => {
    const withReason: EdgeKindSpec = { ...spec, needs: [], absentIn: { go: "Go no tiene herencia de clases" } };
    const cell = verdictForEdgeCell(withReason, sample({ language: "go" }));
    expect(cell.verdict).toBe("sin-construccion");
    expect(cell.reason).toBe("Go no tiene herencia de clases");
  });

  it("sin-muestra: bajo el piso de medición", () => {
    const cell = verdictForEdgeCell({ ...spec, needs: [] }, sample({ filesAnalysed: 5, capabilities: new Set(["herencia"]) }));
    expect(cell.verdict).toBe("sin-muestra");
  });

  it("emitio: n > 0, capacidad presente, sobre el piso", () => {
    const cell = verdictForEdgeCell(spec, sample({ capabilities: new Set(["herencia"]), edgesEmitted: 12 }));
    expect(cell.verdict).toBe("emitio");
    expect(cell.n).toBe(12);
  });

  it("mudo-sin-razon: corrió, capacidad presente, sobre el piso, n = 0 — VIOLACIÓN", () => {
    const cell = verdictForEdgeCell(spec, sample({ capabilities: new Set(["herencia"]), edgesEmitted: 0 }));
    expect(cell.verdict).toBe("mudo-sin-razon");
  });

  it("el orden de evaluación es no-aplicable antes que sin-construccion", () => {
    const both: EdgeKindSpec = { kind: "extends", producer: "extractor", needs: ["herencia"], absentIn: { go: "x" } };
    const cell = verdictForEdgeCell(both, sample({ language: "go", capabilities: new Set() }));
    expect(cell.verdict).toBe("no-aplicable"); // no llega a mirar absentIn.
  });
});

describe("edgeCoverageMatrix", () => {
  it("una celda por (kind, lenguaje) sobre LANGUAGES_MEASURED — sin muestra ⇒ sin-muestra, no una excepción", () => {
    const cells = edgeCoverageMatrix(Object.values(EDGE_KIND_SPECS), new Map());
    expect(cells.length).toBe(ALL_KINDS.length * LANGUAGES_MEASURED.length);
    // Ola R (R1) — la aserción se ESTRECHA, no se afloja. Antes decía
    // "sin-muestra o no-aplicable" y se cumplía por casualidad: la única
    // entrada con `absentIn` poblado (`mixes-in`) declara `needs`, y
    // `no-aplicable` gana ANTES que `sin-construccion` en el orden de
    // evaluación, así que su `absentIn` nunca llegaba a leerse acá. La
    // primera entrada con `absentIn` y `needs: []` (`declares-type`) sí lo
    // alcanza — y `sin-construccion` es el veredicto CORRECTO ahí, es
    // exactamente el punto 2 de la tabla de `verdictForEdgeCell`. Así que en
    // vez de agregar un tercer valor suelto a un `every`, cada celda tiene
    // que justificar SU veredicto contra la spec de su propio kind: una
    // celda `sin-construccion` sin razón declarada para ESE lenguaje ahora
    // pone esto en rojo, cosa que la versión anterior no hacía.
    for (const c of cells) {
      const spec = EDGE_KIND_SPECS[c.kind as EdgeKind];
      const declaredAbsent = spec.absentIn[c.language] !== undefined;
      const esperado = spec.needs.length > 0 ? "no-aplicable" : declaredAbsent ? "sin-construccion" : "sin-muestra";
      expect({ kind: c.kind, language: c.language, verdict: c.verdict }).toEqual({ kind: c.kind, language: c.language, verdict: esperado });
    }
  });
});
