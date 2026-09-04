/**
 * `stableFindingId` tests — F2. These wrap `detect/ids.ts#findingId`
 * (CONTRATOS.md §1.4); what is actually under test here is the wiring: no
 * line number, metric, or severity feeds the hash, `kind` stands in for a
 * detector id, and two findings that only differ by line number collapse to
 * the same id.
 */
import { describe, expect, it } from "vitest";

import { conIdsEstables, contentFindingKey, contentKeyForFinding, desambiguarIdsRepetidos, idDesambiguado, idPorOrdinalDeLectura, stableFindingId } from "./code-finding-ids.js";
import type { CodeFinding } from "../../shared/types.js";

function finding(overrides: Partial<CodeFinding> = {}): CodeFinding {
  return {
    kind: "long-function",
    title: "t",
    detail: "d",
    metric: { label: "líneas", value: 48 },
    severity: 50,
    locations: [{ file: "src/a.ts", startLine: 10, endLine: 60, symbol: "doWork" }],
    ...overrides,
  };
}

describe("stableFindingId", () => {
  it("is stable across a line-number-only change", () => {
    const a = finding({ locations: [{ file: "src/a.ts", startLine: 10, endLine: 60, symbol: "doWork" }] });
    const b = finding({ locations: [{ file: "src/a.ts", startLine: 40, endLine: 90, symbol: "doWork" }] });
    expect(stableFindingId(a)).toBe(stableFindingId(b));
  });

  it("is stable across a metric-value-only change", () => {
    const a = finding({ metric: { label: "líneas", value: 48 } });
    const b = finding({ metric: { label: "líneas", value: 51 } });
    expect(stableFindingId(a)).toBe(stableFindingId(b));
  });

  it("differs by kind", () => {
    expect(stableFindingId(finding({ kind: "long-function" }))).not.toBe(
      stableFindingId(finding({ kind: "complexity" })),
    );
  });

  it("differs by file or symbol", () => {
    const base = stableFindingId(finding());
    expect(
      stableFindingId(finding({ locations: [{ file: "src/b.ts", startLine: 10, endLine: 60, symbol: "doWork" }] })),
    ).not.toBe(base);
    expect(
      stableFindingId(finding({ locations: [{ file: "src/a.ts", startLine: 10, endLine: 60, symbol: "other" }] })),
    ).not.toBe(base);
  });

  it("is order-independent across multiple locations (sorted anchors)", () => {
    const a = finding({
      locations: [
        { file: "src/a.ts", startLine: 1, endLine: 2, symbol: "one" },
        { file: "src/b.ts", startLine: 1, endLine: 2, symbol: "two" },
      ],
    });
    const b = finding({
      locations: [
        { file: "src/b.ts", startLine: 1, endLine: 2, symbol: "two" },
        { file: "src/a.ts", startLine: 1, endLine: 2, symbol: "one" },
      ],
    });
    expect(stableFindingId(a)).toBe(stableFindingId(b));
  });

  it("has the `${detectorId}:${hash}` shape, detectorId visible", () => {
    expect(stableFindingId(finding({ kind: "long-function" }))).toMatch(/^long-function:[A-Za-z0-9_-]{16}$/);
  });
});

describe("contentFindingKey / contentKeyForFinding", () => {
  it("is stable across a detector-algorithm change — same kind/file/symbol/title, different hash inputs entirely", () => {
    // Regression for the demeter-chain case: two findings that a human would call
    // "the same finding" (same visible columns) must key identically even though
    // nothing about `stableFindingId`'s hash inputs is referenced here at all.
    const a = contentKeyForFinding(finding({ kind: "demeter-chain", locations: [{ file: "f.js", startLine: 10, endLine: 10, symbol: "s" }] }));
    const b = contentKeyForFinding(finding({ kind: "demeter-chain", locations: [{ file: "f.js", startLine: 999, endLine: 999, symbol: "s" }] }));
    expect(a).toBe(b);
  });

  it("differs by kind, file, symbol, or title independently", () => {
    const base = contentKeyForFinding(finding());
    expect(contentKeyForFinding(finding({ kind: "complexity" }))).not.toBe(base);
    expect(contentKeyForFinding(finding({ locations: [{ file: "other.ts", startLine: 10, endLine: 60, symbol: "doWork" }] }))).not.toBe(
      base,
    );
    expect(
      contentKeyForFinding(finding({ locations: [{ file: "src/a.ts", startLine: 10, endLine: 60, symbol: "other" }] })),
    ).not.toBe(base);
    expect(contentKeyForFinding(finding({ title: "otro título" }))).not.toBe(base);
  });

  it("does not collide across fields that could concatenate ambiguously (NUL separator, not space)", () => {
    const a = contentFindingKey({ kind: "a b", file: "c", symbol: "d", title: "e" });
    const b = contentFindingKey({ kind: "a", file: "b c", symbol: "d", title: "e" });
    expect(a).not.toBe(b);
  });

  it("empty symbol (module-level finding) is a valid, distinct cell — not treated as missing", () => {
    const a = contentKeyForFinding(finding({ locations: [{ file: "f.ts", startLine: 1, endLine: 1, symbol: undefined }] }));
    const b = contentKeyForFinding(finding({ locations: [{ file: "f.ts", startLine: 1, endLine: 1, symbol: "named" }] }));
    expect(a).not.toBe(b);
  });

  it("two real findings on the same (kind, file, symbol=\"\") but different title never collide — coupling-without-abstraction/duplication case", () => {
    const pairA = finding({
      kind: "coupling-without-abstraction",
      title: '4 archivos dependen a la vez de "a.ts" y "b.ts" sin ninguna abstracción común',
      locations: [{ file: "a.ts", startLine: 1, endLine: 21, symbol: undefined }],
    });
    const pairB = finding({
      kind: "coupling-without-abstraction",
      title: '4 archivos dependen a la vez de "a.ts" y "c.ts" sin ninguna abstracción común',
      locations: [{ file: "a.ts", startLine: 1, endLine: 21, symbol: undefined }],
    });
    expect(contentKeyForFinding(pairA)).not.toBe(contentKeyForFinding(pairB));
  });
});

/**
 * OLA AI, FRENTE AI3 — un test por INTENCIÓN, y la intención está escrita en
 * el nombre. Lo que se verifica no es "el hash cambia": es que la pasada sea
 * ADITIVA (ningún id existente desaparece), DETERMINISTA (dos corridas sobre
 * el mismo árbol dan la misma asignación) y INERTE donde no hay repetidos.
 */
describe("desambiguarIdsRepetidos", () => {
  function h(id: string, file: string, startLine: number, endLine = startLine + 5, title = "t") {
    return { id, title, locations: [{ file, startLine, endLine }] };
  }

  it("ADITIVA: el primero en orden de lectura conserva su id BYTE A BYTE — ningún id existente desaparece", () => {
    const findings = [h("complexity:AAAA", "f.java", 831), h("complexity:AAAA", "f.java", 782)];
    const antes = new Set(findings.map((f) => f.id));
    desambiguarIdsRepetidos(findings);
    const ids = findings.map((f) => f.id);
    // el de la línea 782 es el primero del archivo y es el que conserva el id
    expect(findings.find((f) => f.locations[0].startLine === 782)!.id).toBe("complexity:AAAA");
    expect(new Set(ids).size).toBe(2);
    // superconjunto: todo id de entrada sigue estando en la salida
    for (const id of antes) expect(ids).toContain(id);
  });

  it("MUTA EN EL SITIO: el mismo objeto queda con el id nuevo — de eso depende que las hipótesis que se cuelgan DESPUÉS lleguen", () => {
    const segundo = h("k:1", "x.ts", 90);
    desambiguarIdsRepetidos([h("k:1", "x.ts", 10), segundo]);
    expect(segundo.id).not.toBe("k:1");
    expect(segundo.id).toMatch(/^k:[A-Za-z0-9_-]{16}$/);
  });

  it("INERTE: sin ids repetidos no cambia ni un id", () => {
    const findings = [h("a:1", "x.ts", 1), h("b:2", "x.ts", 9)];
    const report = desambiguarIdsRepetidos(findings);
    expect(findings.map((f) => f.id)).toEqual(["a:1", "b:2"]);
    expect(report).toEqual({ idsRepetidos: 0, hallazgosImplicados: 0, idsAcunados: 0 });
  });

  it("PRESERVA EL ORDEN Y EL CONTENIDO: sólo cambia el campo `id`, nunca la posición ni la ubicación", () => {
    const findings = [h("k:1", "x.ts", 50), h("otro:9", "x.ts", 1), h("k:1", "x.ts", 10)];
    desambiguarIdsRepetidos(findings);
    expect(findings.map((f) => f.locations[0].startLine)).toEqual([50, 1, 10]);
    expect(findings[1].id).toBe("otro:9");
    // el de la línea 10 va antes que el de la 50 en orden de lectura: conserva el id
    expect(findings[2].id).toBe("k:1");
    expect(findings[0].id).not.toBe("k:1");
  });

  it("CONSERVA LA FORMA DEL ID: `${detectorId}:${16 chars base64url}`, la misma que `findingId`", () => {
    const findings = [h("complexity:AAAA", "f.ts", 5), h("complexity:AAAA", "f.ts", 90)];
    desambiguarIdsRepetidos(findings);
    expect(findings.find((f) => f.id !== "complexity:AAAA")!.id).toMatch(/^complexity:[A-Za-z0-9_-]{16}$/);
  });

  it("DETERMINISTA E IDEMPOTENTE: dos corridas dan los mismos ids, y la segunda no cambia nada", () => {
    const a = [h("k:1", "a.ts", 30), h("k:1", "a.ts", 10), h("k:1", "a.ts", 20)];
    const b = [h("k:1", "a.ts", 30), h("k:1", "a.ts", 10), h("k:1", "a.ts", 20)];
    desambiguarIdsRepetidos(a);
    desambiguarIdsRepetidos(b);
    expect(a.map((f) => f.id)).toEqual(b.map((f) => f.id));
    expect(new Set(a.map((f) => f.id)).size).toBe(3);
    const otraVez = desambiguarIdsRepetidos(a);
    expect(otraVez).toEqual({ idsRepetidos: 0, hallazgosImplicados: 0, idsAcunados: 0 });
    expect(a.map((f) => f.id)).toEqual(b.map((f) => f.id));
  });

  it("DESEMPATA sin líneas cuando dos hallazgos comparten rango: título, y después posición de entrada", () => {
    const findings = [
      { id: "k:1", title: "zeta", locations: [{ file: "a.ts", startLine: 1, endLine: 1 }] },
      { id: "k:1", title: "alfa", locations: [{ file: "a.ts", startLine: 1, endLine: 1 }] },
    ];
    desambiguarIdsRepetidos(findings);
    expect(findings.find((f) => f.title === "alfa")!.id).toBe("k:1");
    expect(new Set(findings.map((f) => f.id)).size).toBe(2);
  });

  it("CUENTA lo que hizo, para que quien la llame pueda declarar su delta sin volver a contar", () => {
    const report = desambiguarIdsRepetidos([
      h("k:1", "a.ts", 1),
      h("k:1", "a.ts", 2),
      h("k:1", "a.ts", 3),
      h("k:2", "a.ts", 4),
      h("k:2", "a.ts", 5),
      h("solo:3", "a.ts", 6),
    ]);
    expect(report).toEqual({ idsRepetidos: 2, hallazgosImplicados: 5, idsAcunados: 3 });
  });

  /**
   * OLA AI, FRENTE AI3b — LA INTENCIÓN QUE ESTE TEST ATAJA, Y SU COSTO MEDIDO.
   *
   * `crossAnalyze` arma la lista sobre la que corre esta pasada como
   * `[...perFileFindings, ...interFile.findings]`. Si ese orden cambiara —otro
   * frente que reordene la concatenación, un detector que emita en otro orden—
   * y la asignación de ids dependiera de él, TODOS los ids acuñados se moverían
   * en silencio, y con ellos el representante de cada grupo (`grouping.ts:439`
   * desempata por id). NO es hipotético: medido en la Ola AI sobre 16 repos,
   * cada vez que un id de fila se mueve se caen veredictos humanos — 21 claves
   * de nivel 2 y 36 filas juzgadas de nivel 1 hubo que migrar por ESA sola
   * razón. Por eso `ordenDeLectura` ordena por (archivo, startLine, endLine,
   * title) y deja el índice de entrada SÓLO como último desempate: mientras las
   * ubicaciones se distingan, la asignación es función del CÓDIGO ANALIZADO y
   * no del orden en que los hallazgos llegaron.
   */
  it("NO DEPENDE DEL ORDEN DE ENTRADA: la misma población en otro orden acuña exactamente los mismos ids", () => {
    const enOrden = [h("k:1", "a.ts", 10), h("k:1", "a.ts", 20), h("k:1", "a.ts", 30), h("otro:9", "a.ts", 5)];
    const alReves = [h("otro:9", "a.ts", 5), h("k:1", "a.ts", 30), h("k:1", "a.ts", 20), h("k:1", "a.ts", 10)];
    desambiguarIdsRepetidos(enOrden);
    desambiguarIdsRepetidos(alReves);
    const porLinea = (fs: typeof enOrden): Record<number, string> =>
      Object.fromEntries(fs.map((f) => [f.locations[0]!.startLine, f.id]));
    expect(porLinea(alReves)).toEqual(porLinea(enOrden));
    // y el que conserva el id sigue siendo el primero del ARCHIVO, no el primero del arreglo
    expect(porLinea(alReves)[10]).toBe("k:1");
  });

  it("NO CHOCA con un id ya presente en la corrida: el acuñado se corre hasta ser libre", () => {
    const chocado = idDesambiguado("k:1", 1);
    const findings = [h("k:1", "a.ts", 1), h("k:1", "a.ts", 2), h(chocado, "b.ts", 1)];
    desambiguarIdsRepetidos(findings);
    expect(new Set(findings.map((f) => f.id)).size).toBe(3);
  });
});

/**
 * OLA AJ, FRENTE AJ1 — un test por INTENCIÓN. Lo que se verifica no es que el
 * hash cambie: es que el id de SALIDA (el que juzga todo veredicto de nivel 1 y
 * de nivel 2, y con el que cruza la compuerta de recall) distinga dos hallazgos
 * distintos del mismo kind en el mismo archivo SIN que ningún id existente
 * desaparezca.
 */
describe("conIdsEstables — el id de salida, con la lista completa a la vista", () => {
  const enFila = (kind: CodeFinding["kind"], file: string, startLine: number, symbol?: string, title = "t"): CodeFinding =>
    finding({ kind, title, locations: [{ file, startLine, endLine: startLine + 5, ...(symbol !== undefined ? { symbol } : {}) }] });

  it("EL DEFECTO QUE ARREGLA: dos hallazgos del mismo kind y archivo con símbolo ANÓNIMO comparten id si se los mira de a uno", () => {
    const a = enFila("complexity", "f.js", 26, "(anónima)");
    const b = enFila("complexity", "f.js", 240, "(anónima)");
    expect(stableFindingId(a)).toBe(stableFindingId(b));
  });

  it("Y LA MISMA POBLACIÓN, MIRADA ENTERA, LES DA DIRECCIONES DISTINTAS", () => {
    const { findings } = conIdsEstables([enFila("complexity", "f.js", 26, "(anónima)"), enFila("complexity", "f.js", 240, "(anónima)")]);
    expect(new Set(findings.map((f) => f.id)).size).toBe(2);
  });

  it("ADITIVA: la primera EN ORDEN DE LECTURA conserva el id que tiene hoy, byte a byte — ningún id existente desaparece", () => {
    const arriba = enFila("complexity", "f.js", 26, "(anónima)");
    const abajo = enFila("complexity", "f.js", 240, "(anónima)");
    const hoy = stableFindingId(arriba);
    const { findings } = conIdsEstables([abajo, arriba]); // llegan en orden INVERSO al del archivo
    expect(findings[1]!.id).toBe(hoy); // `arriba` es la primera del ARCHIVO
    expect(findings.map((f) => f.id)).toContain(hoy);
  });

  it("SUPERCONJUNTO, la propiedad de la que depende que no se pierda nada: todo id de HOY sigue nombrando una fila", () => {
    const pob = [
      enFila("complexity", "f.js", 26, "(anónima)"),
      enFila("complexity", "f.js", 240, "(anónima)"),
      enFila("long-function", "f.js", 26, "(anónima)"),
      enFila("duplication", "g.ts", 5),
    ];
    const hoy = new Set(pob.map(stableFindingId));
    const { findings } = conIdsEstables(pob);
    const despues = new Set(findings.map((f) => f.id!));
    for (const id of hoy) expect(despues.has(id)).toBe(true);
    expect(despues.size).toBeGreaterThan(hoy.size);
  });

  it("EL ID ACUÑADO ES UN ANCLA, no un id sintético paralelo: es `findingId` sobre `(archivo, símbolo, ordinal)`", () => {
    const primera = enFila("complexity", "f.js", 26, "(anónima)");
    const segunda = enFila("complexity", "f.js", 240, "(anónima)");
    const { findings } = conIdsEstables([primera, segunda]);
    expect(findings[1]!.id).toBe(idPorOrdinalDeLectura(segunda, 1));
    expect(findings[1]!.id).toMatch(/^complexity:[A-Za-z0-9_-]{16}$/);
  });

  it("INERTE donde no hay repetidos: cada fila recibe exactamente el `stableFindingId` de siempre", () => {
    const pob = [enFila("complexity", "a.ts", 1, "uno"), enFila("complexity", "a.ts", 9, "dos")];
    const { findings, report } = conIdsEstables(pob);
    expect(findings.map((f) => f.id)).toEqual(pob.map(stableFindingId));
    expect(report).toEqual({ idsRepetidos: 0, filasImplicadas: 0, idsAcunados: 0 });
  });

  it("NO REORDENA NI TOCA NADA MÁS: misma posición, mismas ubicaciones, sólo aparece `id`", () => {
    const pob = [enFila("complexity", "f.js", 240, "(anónima)"), enFila("other-kind" as CodeFinding["kind"], "f.js", 1), enFila("complexity", "f.js", 26, "(anónima)")];
    const { findings } = conIdsEstables(pob);
    expect(findings.map((f) => f.locations[0]!.startLine)).toEqual([240, 1, 26]);
    for (let i = 0; i < pob.length; i++) expect(findings[i]!.locations).toEqual(pob[i]!.locations);
  });

  it("NO MUTA LA ENTRADA: la lista que recibe queda sin `id`, porque quien la llama la sigue usando", () => {
    const pob = [enFila("complexity", "f.js", 26, "(anónima)"), enFila("complexity", "f.js", 240, "(anónima)")];
    conIdsEstables(pob);
    expect(pob.every((f) => f.id === undefined)).toBe(true);
  });

  /**
   * LA INTENCIÓN, Y POR QUÉ NO ES DECORATIVA: `crossAnalyze` llama a esto sobre
   * `groups.map(...)`, y `groups` viene de `finalizeGroups(...).sort(byGroupRankDescThenId)`
   * — un orden que depende del SCORE. Si la asignación dependiera de ese orden,
   * cualquier cambio de score de un frente futuro movería ids que nadie tocó, y
   * cada id movido cuesta veredictos humanos (medido en la Ola AI: 52 claves de
   * nivel 2 y 48 filas de nivel 1 por un solo corrimiento).
   */
  it("NO DEPENDE DEL ORDEN DE ENTRADA: la misma población en otro orden acuña exactamente los mismos ids", () => {
    const pob = () => [
      enFila("complexity", "f.js", 26, "(anónima)"),
      enFila("complexity", "f.js", 240, "(anónima)"),
      enFila("complexity", "f.js", 900, "(anónima)"),
    ];
    const directo = conIdsEstables(pob()).findings;
    const alReves = conIdsEstables([...pob()].reverse()).findings;
    const porLinea = (fs: CodeFinding[]): Record<number, string> =>
      Object.fromEntries(fs.map((f) => [f.locations[0]!.startLine, f.id!]));
    expect(porLinea(alReves)).toEqual(porLinea(directo));
  });

  it("NO DEPENDE DE LA PAGINACIÓN, que es la razón de llamarla ANTES del cap: la misma fila recibe el mismo id venga o no acompañada de la cola", () => {
    const cabeza = [enFila("complexity", "f.js", 26, "(anónima)"), enFila("complexity", "f.js", 240, "(anónima)")];
    const conCola = conIdsEstables([...cabeza, enFila("duplication", "z.ts", 1)]).findings;
    const sinCola = conIdsEstables(cabeza).findings;
    expect(conCola.slice(0, 2).map((f) => f.id)).toEqual(sinCola.map((f) => f.id));
  });

  it("NO USA LA LÍNEA EN EL ID (CONTRATOS.md §1.4): correr las dos funciones hacia abajo no acuña ids nuevos", () => {
    const antes = conIdsEstables([enFila("complexity", "f.js", 26, "(anónima)"), enFila("complexity", "f.js", 240, "(anónima)")]).findings;
    const despues = conIdsEstables([enFila("complexity", "f.js", 126, "(anónima)"), enFila("complexity", "f.js", 340, "(anónima)")]).findings;
    expect(despues.map((f) => f.id)).toEqual(antes.map((f) => f.id));
  });

  it("SÍMBOLO VACÍO (el 56 % de las filas ciegas del corpus): también se distingue", () => {
    const { findings } = conIdsEstables([enFila("duplication", "f.ts", 5), enFila("duplication", "f.ts", 90)]);
    expect(new Set(findings.map((f) => f.id)).size).toBe(2);
  });

  it("HOMÓNIMAS (el 55 % de las colisiones del corpus, y NO son filas de ancla ciega): dos miembros con el MISMO nombre real también se distinguen", () => {
    const { findings } = conIdsEstables([enFila("long-parameter-list", "types.py", 100, "__init__"), enFila("long-parameter-list", "types.py", 943, "__init__")]);
    expect(new Set(findings.map((f) => f.id)).size).toBe(2);
  });

  it("CUENTA lo que hizo, para que quien la llame pueda declarar su delta sin volver a contar", () => {
    const { report } = conIdsEstables([
      enFila("complexity", "f.js", 1, "(anónima)"),
      enFila("complexity", "f.js", 2, "(anónima)"),
      enFila("complexity", "f.js", 3, "(anónima)"),
      enFila("duplication", "g.ts", 4),
      enFila("duplication", "g.ts", 5),
      enFila("long-function", "h.rb", 6, "solo"),
    ]);
    expect(report).toEqual({ idsRepetidos: 2, filasImplicadas: 5, idsAcunados: 3 });
  });

  it("NO CHOCA con un id ya presente en la corrida: el acuñado se corre hasta ser libre", () => {
    const segunda = enFila("complexity", "f.js", 240, "(anónima)");
    const ocupado = { ...enFila("complexity", "z.ts", 1), id: idPorOrdinalDeLectura(segunda, 1) };
    const { findings } = conIdsEstables([enFila("complexity", "f.js", 26, "(anónima)"), segunda, ocupado]);
    expect(new Set(findings.map((f) => f.id)).size).toBe(3);
  });
});
