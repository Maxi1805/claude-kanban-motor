import { describe, expect, it } from "vitest";

import {
  DEFAULT_MIRROR_THRESHOLDS,
  canonicalFile,
  collapseMirroredClones,
  detectMirrorTrees,
  NO_MIRRORS,
} from "./mirror-tree.js";
import type { CloneCandidate } from "./types.js";

function clone(overrides: Partial<CloneCandidate> & Pick<CloneCandidate, "fingerprint" | "file">): CloneCandidate {
  return {
    startLine: 1,
    endLine: 10,
    nodes: 40,
    type: "class_declaration",
    functionName: null,
    className: null,
    superclassName: null,
    normalized: "same shape",
    ...overrides,
  };
}

/** Genera N fingerprints compartidos entre `fileA`/`fileB` — el caso "gemelo real". */
function twinClones(fileA: string, fileB: string, count: number, startFp = 0): CloneCandidate[] {
  const out: CloneCandidate[] = [];
  for (let i = 0; i < count; i++) {
    const fp = `fp${startFp + i}`;
    out.push(clone({ fingerprint: fp, file: fileA }));
    out.push(clone({ fingerprint: fp, file: fileB }));
  }
  return out;
}

describe("mirror-tree — detectMirrorTrees", () => {
  it("dos archivos con mismo sufijo de ruta y fingerprints casi idénticos son declarados gemelos", () => {
    const clones = twinClones("guava/src/com/google/common/collect/Foo.java", "android/guava/src/com/google/common/collect/Foo.java", 5);
    const trees = detectMirrorTrees(clones);
    expect(trees.canonicalOf.size).toBe(1);
    const a = "guava/src/com/google/common/collect/Foo.java";
    const b = "android/guava/src/com/google/common/collect/Foo.java";
    // El canónico es determinístico (el menor lexicográficamente) y ambos
    // lados resuelven al MISMO archivo canónico.
    expect(canonicalFile(trees, a)).toBe(canonicalFile(trees, b));
  });

  it("control negativo: mismo nombre de archivo, pero en paquetes DISTINTOS (sufijo de ruta corto) — no son gemelos", () => {
    // Caso real de guava: `Internal.java` existe, a propósito, una vez en
    // `.../base` y otra en `.../collect` — mismo árbol, dos archivos
    // legítimamente distintos, no una copia.
    const clones = twinClones("guava/src/com/google/common/base/Internal.java", "guava/src/com/google/common/collect/Internal.java", 5);
    const trees = detectMirrorTrees(clones);
    expect(trees.canonicalOf.size).toBe(0);
  });

  it("control negativo: mismo sufijo de ruta, pero contenido realmente distinto (fingerprints sin overlap suficiente) — no son gemelos", () => {
    const clones = [
      clone({ fingerprint: "onlyA1", file: "guava/src/com/google/common/collect/RegularImmutableMap.java" }),
      clone({ fingerprint: "onlyA2", file: "guava/src/com/google/common/collect/RegularImmutableMap.java" }),
      clone({ fingerprint: "onlyA3", file: "guava/src/com/google/common/collect/RegularImmutableMap.java" }),
      clone({ fingerprint: "shared", file: "guava/src/com/google/common/collect/RegularImmutableMap.java" }),
      clone({ fingerprint: "onlyB1", file: "android/guava/src/com/google/common/collect/RegularImmutableMap.java" }),
      clone({ fingerprint: "onlyB2", file: "android/guava/src/com/google/common/collect/RegularImmutableMap.java" }),
      clone({ fingerprint: "shared", file: "android/guava/src/com/google/common/collect/RegularImmutableMap.java" }),
    ];
    const trees = detectMirrorTrees(clones);
    expect(trees.canonicalOf.size).toBe(0);
  });

  it("control negativo: overlap alto pero por debajo del piso ABSOLUTO de fingerprints compartidos (coincidencia débil)", () => {
    // 1 de 2 = ratio 0.5 (>= piso de ratio) pero sólo 1 compartido en
    // absoluto (< minSharedFingerprints): no alcanza.
    const clones = [
      clone({ fingerprint: "shared", file: "a/src/pkg/Trivial.java" }),
      clone({ fingerprint: "onlyA", file: "a/src/pkg/Trivial.java" }),
      clone({ fingerprint: "shared", file: "b/src/pkg/Trivial.java" }),
    ];
    const trees = detectMirrorTrees(clones);
    expect(trees.canonicalOf.size).toBe(0);
  });

  it("tres copias (3-way mirror, p.ej. jre/android/gwt) resuelven al MISMO canónico, no en pares sueltos", () => {
    const a = "guava/src/com/google/common/collect/Bar.java";
    const b = "android/guava/src/com/google/common/collect/Bar.java";
    const c = "guava-gwt/src/com/google/common/collect/Bar.java";
    const clones = [...twinClones(a, b, 4), ...twinClones(a, c, 4, 100)];
    const trees = detectMirrorTrees(clones);
    const canonA = canonicalFile(trees, a);
    expect(canonicalFile(trees, b)).toBe(canonA);
    expect(canonicalFile(trees, c)).toBe(canonA);
  });

  it("sin ningún par gemelo, devuelve NO_MIRRORS (identidad, no un Map recién creado con contenido)", () => {
    const clones = [clone({ fingerprint: "f", file: "a.ts" }), clone({ fingerprint: "f", file: "b.ts" })];
    const trees = detectMirrorTrees(clones);
    expect(trees).toBe(NO_MIRRORS);
  });

  it("determinístico: el mismo input en orden distinto produce el mismo canónico", () => {
    const a = "guava/src/com/google/common/collect/Baz.java";
    const b = "android/guava/src/com/google/common/collect/Baz.java";
    const forward = detectMirrorTrees(twinClones(a, b, 4));
    const backward = detectMirrorTrees([...twinClones(a, b, 4)].reverse());
    expect(canonicalFile(forward, a)).toBe(canonicalFile(backward, a));
    expect(canonicalFile(forward, b)).toBe(canonicalFile(backward, b));
  });

  it("umbrales por defecto expuestos y estables (contrato del helper, no un detalle interno)", () => {
    expect(DEFAULT_MIRROR_THRESHOLDS.minSuffixSegments).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_MIRROR_THRESHOLDS.minSharedFingerprints).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_MIRROR_THRESHOLDS.minOverlapRatio).toBeGreaterThan(0);
    expect(DEFAULT_MIRROR_THRESHOLDS.minOverlapRatio).toBeLessThanOrEqual(1);
  });
});

describe("mirror-tree — canonicalFile", () => {
  it("un archivo que no participa de ningún par gemelo es su propio canónico", () => {
    expect(canonicalFile(NO_MIRRORS, "solo.ts")).toBe("solo.ts");
  });
});

describe("mirror-tree — collapseMirroredClones", () => {
  // Título corregido — el viejo decía "no se borra, se reporta una vez",
  // una afirmación sobre lo que hace `duplication.ts` con el resultado, no
  // sobre lo que ESTA función hace (sólo reduce `CloneCandidate[]`). Esa
  // afirmación además es al revés: con 1 sola copia restante por
  // fingerprint, `duplication.ts#buildDuplicationFindings` lo descarta
  // ENTERO — ver `duplication.test.ts#"árbol espejo"` más abajo y el
  // docstring de cabecera de este módulo, sección "TEXTO CORREGIDO".
  it("un fingerprint que SÓLO el par gemelo comparte queda con UNA sola copia tras colapsar — de 2 candidatos (uno por archivo) a 1", () => {
    const a = "guava/src/com/google/common/collect/Foo.java";
    const b = "android/guava/src/com/google/common/collect/Foo.java";
    const clones = twinClones(a, b, 5);
    const trees = detectMirrorTrees(clones);
    const collapsed = collapseMirroredClones(clones, trees);
    // 5 fingerprints, cada uno con 2 copias (a+b) -> tras colapsar, 5 (una por fingerprint).
    expect(collapsed).toHaveLength(5);
    // Cada fingerprint sigue representado — no se perdió ninguno.
    const fps = new Set(collapsed.map((c) => c.fingerprint));
    expect(fps.size).toBe(5);
  });

  it("preserva duplicación GENUINA: un fingerprint que aparece en un TERCER archivo no gemelo sigue como grupo de 2 tras colapsar el par", () => {
    const a = "guava/src/com/google/common/collect/Foo.java";
    const b = "android/guava/src/com/google/common/collect/Foo.java";
    const other = "guava/src/com/google/common/collect/Unrelated.java";
    const mirror = twinClones(a, b, 4); // fp0..fp3, sólo para establecer el par gemelo
    const genuineDup = [
      clone({ fingerprint: "genuine", file: a }),
      clone({ fingerprint: "genuine", file: b }),
      clone({ fingerprint: "genuine", file: other }),
    ];
    const clones = [...mirror, ...genuineDup];
    const trees = detectMirrorTrees(clones);
    const collapsed = collapseMirroredClones(clones, trees);
    const genuineCollapsed = collapsed.filter((c) => c.fingerprint === "genuine");
    // El par gemelo (a,b) colapsa a 1, pero `other` no es gemelo de nadie:
    // sigue estando, así que el fingerprint "genuine" queda con 2 copias
    // reales (una del par colapsado + `other`), no 1 ni 3.
    expect(genuineCollapsed).toHaveLength(2);
    expect(genuineCollapsed.some((c) => c.file === other)).toBe(true);
  });

  it("no toca fingerprints que sólo aparecen en UNO de los dos archivos gemelos (contenido que sí divergió)", () => {
    const a = "guava/src/com/google/common/collect/Foo.java";
    const b = "android/guava/src/com/google/common/collect/Foo.java";
    const mirror = twinClones(a, b, 4);
    const onlyInA = clone({ fingerprint: "unico-de-a", file: a });
    const clones = [...mirror, onlyInA];
    const trees = detectMirrorTrees(clones);
    const collapsed = collapseMirroredClones(clones, trees);
    expect(collapsed.some((c) => c.fingerprint === "unico-de-a" && c.file === a)).toBe(true);
  });

  it("sin pares gemelos (NO_MIRRORS), devuelve exactamente el mismo array (no-op, sin copiar)", () => {
    const clones = [clone({ fingerprint: "f1", file: "a.ts" }), clone({ fingerprint: "f1", file: "b.ts" })];
    expect(collapseMirroredClones(clones, NO_MIRRORS)).toBe(clones);
  });

  it("prefiere el archivo CANÓNICO como ganador cuando también aportó el fingerprint (determinístico, no depende del orden de aparición)", () => {
    // "android/..." < "guava/..." lexicográficamente ⇒ "android/..." ES el
    // canónico del par (regla determinística de `detectMirrorTrees`).
    const canonical = "android/guava/src/com/google/common/collect/Foo.java";
    const twin = "guava/src/com/google/common/collect/Foo.java";
    const mirror = twinClones(canonical, twin, 4);
    const trees = detectMirrorTrees(mirror);
    expect(canonicalFile(trees, canonical)).toBe(canonical);
    expect(canonicalFile(trees, twin)).toBe(canonical);
    // El array pone la copia del gemelo (no canónico) ANTES que la del
    // canónico para el mismo fingerprint — el ganador debe ser igual el
    // canónico, sin importar el orden de aparición.
    const clones = [clone({ fingerprint: "z", file: twin }), clone({ fingerprint: "z", file: canonical }), ...mirror];
    const collapsed = collapseMirroredClones(clones, trees);
    const z = collapsed.filter((c) => c.fingerprint === "z");
    expect(z).toHaveLength(1);
    expect(z[0]!.file).toBe(canonical);
  });
});
