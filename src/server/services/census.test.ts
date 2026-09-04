/**
 * Unitarios de `census.ts`: serializar/parsear, `censusOf` (contra un
 * `CodeAnalysis` sintético — sin tree-sitter, sin disco), `diffCensus` y sus
 * waivers. `census-golden.test.ts` es el gate contra el analizador real.
 */
import { describe, expect, it } from "vitest";

import {
  ANALYZER_VERSION,
  censusOf,
  diffCensus,
  parseCensus,
  serializeCensus,
  type Census,
  type CensusWaiver,
} from "./census.js";
import type { CodeAnalysis } from "../../shared/types.js";

/** Un `CodeAnalysis` mínimo pero completo, con overrides puntuales. */
function makeAnalysis(overrides: Partial<CodeAnalysis> = {}): CodeAnalysis {
  return {
    repoName: "fixture",
    scannedFiles: 2,
    analysedFiles: 2,
    totalLines: 20,
    languages: ["typescript"],
    files: [
      { path: "a.ts", lines: 10, language: "typescript" },
      { path: "b.ts", lines: 10, language: "typescript" },
    ],
    findings: [],
    ...overrides,
  };
}

describe("censusOf", () => {
  it("cuenta un archivo por lenguaje y la meta a nivel repo", () => {
    const census = censusOf(makeAnalysis(), "fixture", 123);
    expect(census.keys).toEqual({
      "a.ts|archivo:typescript": 1,
      "b.ts|archivo:typescript": 1,
      "|meta:scannedFiles": 2,
      "|meta:analysedFiles": 2,
      "|meta:totalLines": 20,
      "|meta:language:typescript": 2,
    });
    expect(census.meta).toEqual({
      slug: "fixture",
      analyzerVersion: ANALYZER_VERSION,
      scannedFiles: 2,
      analysedFiles: 2,
      totalLines: 20,
      languages: ["typescript"],
      elapsedMs: 123,
    });
  });

  it("un hallazgo cuenta UNA vez por archivo distinto entre sus locations, no una vez por ubicación", () => {
    const analysis = makeAnalysis({
      findings: [
        {
          kind: "duplication",
          title: "x",
          detail: "x",
          metric: { label: "x", value: 1 },
          severity: 50,
          locations: [
            { file: "a.ts", startLine: 1, endLine: 2 },
            { file: "a.ts", startLine: 5, endLine: 6 }, // misma archivo, otra ubicación
            { file: "b.ts", startLine: 1, endLine: 2 },
          ],
        },
      ],
    });
    const census = censusOf(analysis, "fixture", 0);
    expect(census.keys["a.ts|hallazgo:duplication"]).toBe(1);
    expect(census.keys["b.ts|hallazgo:duplication"]).toBe(1);
  });

  it("no escribe una clave con valor 0 (analysedFiles=0 no aparece)", () => {
    const census = censusOf(makeAnalysis({ scannedFiles: 0, analysedFiles: 0, totalLines: 0, files: [] }), "empty", 0);
    expect(census.keys["|meta:analysedFiles"]).toBeUndefined();
    expect(census.keys["|meta:scannedFiles"]).toBeUndefined();
    expect(census.keys["|meta:totalLines"]).toBeUndefined();
    expect(Object.keys(census.keys)).toEqual([]);
  });
});

describe("serializeCensus / parseCensus", () => {
  const census: Census = {
    meta: {
      slug: "fixture",
      analyzerVersion: "1",
      scannedFiles: 2,
      analysedFiles: 2,
      totalLines: 20,
      languages: ["typescript"],
      elapsedMs: 42,
    },
    keys: {
      "z.ts|archivo:typescript": 1,
      "a.ts|archivo:typescript": 1,
      "|meta:scannedFiles": 2,
    },
  };

  it("ordena las claves lexicográficamente y termina en newline", () => {
    const text = serializeCensus(census);
    expect(text.endsWith("\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
    const keyOrder = Object.keys(JSON.parse(text).keys);
    expect(keyOrder).toEqual(["a.ts|archivo:typescript", "z.ts|archivo:typescript", "|meta:scannedFiles"]);
  });

  it("hace un roundtrip exacto", () => {
    const text = serializeCensus(census);
    const parsed = parseCensus(text);
    expect(parsed).toEqual(census);
  });

  it("filtra claves con valor <= 0 al serializar", () => {
    const withZero: Census = { ...census, keys: { ...census.keys, "x.ts|archivo:typescript": 0 } };
    const text = serializeCensus(withZero);
    expect(JSON.parse(text).keys["x.ts|archivo:typescript"]).toBeUndefined();
  });

  it("rechaza un texto sin `meta` o `keys`", () => {
    expect(() => parseCensus(JSON.stringify({ meta: {} }))).toThrow();
    expect(() => parseCensus(JSON.stringify({ keys: {} }))).toThrow();
  });
});

describe("diffCensus", () => {
  function census(slug: string, keys: Record<string, number>, meta: Partial<Census["meta"]> = {}): Census {
    return {
      meta: {
        slug,
        analyzerVersion: "1",
        scannedFiles: 10,
        analysedFiles: 10,
        totalLines: 100,
        languages: ["typescript"],
        elapsedMs: 1,
        ...meta,
      },
      keys,
    };
  }

  it("sin cambios: unchanged cuenta todas las claves, nada más se llena", () => {
    const base = census("r", { "a.ts|archivo:ts": 1, "|meta:scannedFiles": 10 });
    const head = census("r", { "a.ts|archivo:ts": 1, "|meta:scannedFiles": 10 });
    const diff = diffCensus(base, head, []);
    expect(diff.regressions).toEqual([]);
    expect(diff.increases).toEqual([]);
    expect(diff.staleWaivers).toEqual([]);
    expect(diff.metaMismatch).toEqual([]);
    expect(diff.unchanged).toBe(2);
  });

  it("una clave que baja sin waiver es una regresión; una clave nueva en head es sólo informativa", () => {
    const base = census("r", { "a.ts|hallazgo:complexity": 3 });
    const head = census("r", { "b.ts|hallazgo:complexity": 1 }); // "a" desaparece, "b" es nueva
    const diff = diffCensus(base, head, []);
    expect(diff.regressions).toEqual([{ slug: "r", key: "a.ts|hallazgo:complexity", base: 3, head: 0 }]);
  });

  it("una clave que sube es 'increases', nunca rompe", () => {
    const base = census("r", { "a.ts|hallazgo:complexity": 3 });
    const head = census("r", { "a.ts|hallazgo:complexity": 5 });
    const diff = diffCensus(base, head, []);
    expect(diff.regressions).toEqual([]);
    expect(diff.increases).toEqual([{ slug: "r", key: "a.ts|hallazgo:complexity", base: 3, head: 5 }]);
  });

  it("waiver 'desaparece' cubre una clave que baja a ausente, y sólo eso", () => {
    const waiver: CensusWaiver = {
      slug: "r",
      key: "a.ts|hallazgo:complexity",
      expected: "desaparece",
      reason: "x",
      spec: "x",
      addedIn: "x",
    };
    const base = census("r", { "a.ts|hallazgo:complexity": 3 });
    const gone = diffCensus(base, census("r", {}), [waiver]);
    expect(gone.regressions).toEqual([]);
    expect(gone.waived).toEqual([{ slug: "r", key: "a.ts|hallazgo:complexity", base: 3, head: 0 }]);
    expect(gone.staleWaivers).toEqual([]);

    // Baja pero NO desaparece del todo: el waiver "desaparece" no lo cubre.
    const lowered = diffCensus(base, census("r", { "a.ts|hallazgo:complexity": 1 }), [waiver]);
    expect(lowered.regressions).toEqual([{ slug: "r", key: "a.ts|hallazgo:complexity", base: 3, head: 1 }]);
    expect(lowered.staleWaivers).toEqual([waiver]); // no cubrió la regresión real de esta corrida
  });

  it("waiver 'baja' cubre mientras head >= min, y no cubre por debajo del piso", () => {
    const waiver: CensusWaiver = {
      slug: "r",
      key: "a.ts|hallazgo:complexity",
      expected: "baja",
      min: 2,
      reason: "x",
      spec: "x",
      addedIn: "x",
    };
    const base = census("r", { "a.ts|hallazgo:complexity": 5 });
    const okDiff = diffCensus(base, census("r", { "a.ts|hallazgo:complexity": 2 }), [waiver]);
    expect(okDiff.regressions).toEqual([]);
    expect(okDiff.waived).toEqual([{ slug: "r", key: "a.ts|hallazgo:complexity", base: 5, head: 2 }]);

    const tooLow = diffCensus(base, census("r", { "a.ts|hallazgo:complexity": 1 }), [waiver]);
    expect(tooLow.regressions).toEqual([{ slug: "r", key: "a.ts|hallazgo:complexity", base: 5, head: 1 }]);

    // Ausente del todo: "baja" no lo cubre (eso es "desaparece").
    const goneEntirely = diffCensus(base, census("r", {}), [waiver]);
    expect(goneEntirely.regressions).toEqual([{ slug: "r", key: "a.ts|hallazgo:complexity", base: 5, head: 0 }]);
  });

  it("un waiver que no cubre ninguna regresión real de esta corrida es 'rancio'", () => {
    const waiver: CensusWaiver = {
      slug: "r",
      key: "a.ts|hallazgo:complexity",
      expected: "baja",
      min: 0,
      reason: "x",
      spec: "x",
      addedIn: "x",
    };
    // Nada bajó: el waiver no tuvo nada que cubrir.
    const base = census("r", { "a.ts|hallazgo:complexity": 5 });
    const diff = diffCensus(base, census("r", { "a.ts|hallazgo:complexity": 5 }), [waiver]);
    expect(diff.staleWaivers).toEqual([waiver]);
  });

  it("slug '*' aplica a cualquier repo; un slug específico sólo al suyo", () => {
    const wildcard: CensusWaiver = {
      slug: "*",
      key: "a.rb|hallazgo:conditional-chain",
      expected: "baja",
      min: 0,
      reason: "x",
      spec: "x",
      addedIn: "x",
    };
    const base = census("otro-repo", { "a.rb|hallazgo:conditional-chain": 4 });
    const diff = diffCensus(base, census("otro-repo", { "a.rb|hallazgo:conditional-chain": 1 }), [wildcard]);
    expect(diff.regressions).toEqual([]);
    expect(diff.waived.length).toBe(1);

    const scoped: CensusWaiver = { ...wildcard, slug: "jekyll" };
    const diff2 = diffCensus(base, census("otro-repo", { "a.rb|hallazgo:conditional-chain": 1 }), [scoped]);
    expect(diff2.regressions.length).toBe(1); // "jekyll" no matchea "otro-repo"
  });

  it("glob de un sólo '*' matchea por prefijo/sufijo sobre la clave completa", () => {
    const waiver: CensusWaiver = {
      slug: "*",
      key: "*.rb|hallazgo:conditional-chain",
      expected: "baja",
      min: 0,
      reason: "x",
      spec: "x",
      addedIn: "x",
    };
    const base = census("jekyll", {
      "lib/site.rb|hallazgo:conditional-chain": 4,
      "lib/site.py|hallazgo:conditional-chain": 4, // no matchea el glob (no termina en .rb|...)
    });
    const head = census("jekyll", {
      "lib/site.rb|hallazgo:conditional-chain": 1,
      "lib/site.py|hallazgo:conditional-chain": 1,
    });
    const diff = diffCensus(base, head, [waiver]);
    expect(diff.waived).toEqual([
      { slug: "jekyll", key: "lib/site.rb|hallazgo:conditional-chain", base: 4, head: 1 },
    ]);
    expect(diff.regressions).toEqual([
      { slug: "jekyll", key: "lib/site.py|hallazgo:conditional-chain", base: 4, head: 1 },
    ]);
  });

  it("un waiver con más de un '*' tira, no matchea en silencio", () => {
    const waiver: CensusWaiver = {
      slug: "*",
      key: "*.rb|*:conditional-chain",
      expected: "baja",
      min: 0,
      reason: "x",
      spec: "x",
      addedIn: "x",
    };
    const base = census("jekyll", { "lib/site.rb|hallazgo:conditional-chain": 4 });
    const head = census("jekyll", { "lib/site.rb|hallazgo:conditional-chain": 1 });
    expect(() => diffCensus(base, head, [waiver])).toThrow(/más de un/);
  });

  it("meta.scannedFiles/analysedFiles/totalLines/languages se comparan EXACTO en las dos direcciones", () => {
    const base = census("r", {}, { scannedFiles: 10, languages: ["ruby"] });
    const moreFiles = diffCensus(base, census("r", {}, { scannedFiles: 12 }), []);
    expect(moreFiles.metaMismatch).toContainEqual({ field: "scannedFiles", base: 10, head: 12 });

    const fewerFiles = diffCensus(census("r", {}, { scannedFiles: 12 }), base, []);
    expect(fewerFiles.metaMismatch).toContainEqual({ field: "scannedFiles", base: 12, head: 10 });

    const diffLangs = diffCensus(base, census("r", {}, { languages: ["ruby", "python"] }), []);
    expect(diffLangs.metaMismatch).toContainEqual({ field: "languages", base: "ruby", head: "python,ruby" });
  });

  it("analyzerVersion distinta: el diff no se hace, sólo reporta el mismatch", () => {
    const base = census("r", { "a.ts|hallazgo:complexity": 5 }, { analyzerVersion: "1" });
    const head = census("r", { "a.ts|hallazgo:complexity": 1 }, { analyzerVersion: "2" });
    const diff = diffCensus(base, head, []);
    expect(diff.metaMismatch).toEqual([{ field: "analyzerVersion", base: "1", head: "2" }]);
    expect(diff.regressions).toEqual([]);
    expect(diff.increases).toEqual([]);
    expect(diff.unchanged).toBe(0);
  });
});
