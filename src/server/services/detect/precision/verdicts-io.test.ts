import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { mergeRows, readPrecisionCsv, writePrecisionCsv } from "./verdicts-io.js";
import { contentFindingKey } from "../../code-finding-ids.js";
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
    detail: "d, con coma",
    metricLabel: "m",
    metricValue: "1",
    evidence: "const x = 1;",
    verdict: "",
    patternFit: "",
    note: "",
    stillPresent: true,
    lossReason: "",
    ...overrides,
  };
}

describe("readPrecisionCsv / writePrecisionCsv", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "precision-io-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("archivo inexistente ⇒ []", () => {
    expect(readPrecisionCsv(path.join(dir, "nope.csv"))).toEqual([]);
  });

  it("ida y vuelta exacta, incluidos campos con coma", () => {
    const out = path.join(dir, "s.verdicts.csv");
    const rows = [row("k:1", { verdict: "verdadero" }), row("k:2", { detail: 'con "comillas"' })];
    writePrecisionCsv(out, rows);
    const back = readPrecisionCsv(out);
    expect(back).toHaveLength(2);
    expect(back.find((r) => r.id === "k:1")!.verdict).toBe("verdadero");
    expect(back.find((r) => r.id === "k:2")!.detail).toBe('con "comillas"');
  });

  it("rechaza un veredicto que no sea verdadero/falso/dudoso/vacío", () => {
    const out = path.join(dir, "s.verdicts.csv");
    fs.writeFileSync(out, "id,slug,kind,pattern,file,startLine,endLine,symbol,title,detail,metricLabel,metricValue,evidence,verdict,patternFit,note,stillPresent\nk:1,s,k,,a.ts,1,2,f,t,d,m,1,e,MAYBE,,,true\n");
    expect(() => readPrecisionCsv(out)).toThrow(/inválido/);
  });

  it("planilla de antes de `language` (9 del corpus) se lee igual, con language=\"\" — no un error de columna faltante", () => {
    const out = path.join(dir, "s.verdicts.csv");
    fs.writeFileSync(
      out,
      "id,slug,kind,pattern,file,startLine,endLine,symbol,title,detail,metricLabel,metricValue,evidence,verdict,patternFit,note,stillPresent\n" +
        "k:1,s,k,,a.ts,1,2,f,t,d,m,1,e,,,,true\n",
    );
    const rows = readPrecisionCsv(out);
    expect(rows).toHaveLength(1);
    expect(rows[0].language).toBe("");
  });

  it("falta de una columna del contrato original SÍ sigue siendo un error (no confundir con `language`, la única opcional)", () => {
    const out = path.join(dir, "s.verdicts.csv");
    fs.writeFileSync(out, "id,slug,kind,pattern,file,startLine,endLine,symbol,title,detail,metricLabel,metricValue,evidence,verdict,patternFit,note\nk:1,s,k,,a.ts,1,2,f,t,d,m,1,e,,,\n");
    expect(() => readPrecisionCsv(out)).toThrow(/falta la columna/);
  });
});

describe("mergeRows", () => {
  it("nunca pisa un veredicto ya cargado", () => {
    const existing = [row("k:1", { verdict: "verdadero", note: "ya juzgado" })];
    const fresh = [row("k:1", { verdict: "", note: "" })];
    const merged = mergeRows(existing, fresh);
    expect(merged).toHaveLength(1);
    expect(merged[0].verdict).toBe("verdadero");
    expect(merged[0].note).toBe("ya juzgado");
  });

  it("agrega filas nuevas que no estaban", () => {
    const merged = mergeRows([row("k:1")], [row("k:1"), row("k:2")]);
    expect(merged.map((r) => r.id).sort()).toEqual(["k:1", "k:2"]);
  });

  it("marca stillPresent=false para filas viejas ausentes del pool nuevo, sin borrarlas", () => {
    const existing = [row("k:1", { verdict: "falso" })];
    const merged = mergeRows(existing, [row("k:2")]);
    expect(merged).toHaveLength(2);
    const old = merged.find((r) => r.id === "k:1")!;
    expect(old.stillPresent).toBe(false);
    expect(old.verdict).toBe("falso");
  });

  // Ola H — las dos correcciones del instrumento, ver el docstring de `mergeRows`.
  it("un hallazgo VIVO que el sorteo no eligió sigue stillPresent=true (liveness ≠ estar en la muestra)", () => {
    const existing = [row("k:1", { verdict: "falso" })];
    // La muestra de esta corrida trae otro id, pero `k:1` sigue en el pool vivo.
    const merged = mergeRows(existing, [row("k:2")], new Set(["k:1", "k:2"]));
    expect(merged.find((r) => r.id === "k:1")!.stillPresent).toBe(true);
  });

  it("con livePool, sólo lo que el detector dejó de emitir queda stillPresent=false", () => {
    const existing = [row("k:1", { verdict: "falso" }), row("k:9", { verdict: "falso" })];
    const merged = mergeRows(existing, [row("k:1")], new Set(["k:1"]));
    expect(merged.find((r) => r.id === "k:1")!.stillPresent).toBe(true);
    expect(merged.find((r) => r.id === "k:9")!.stillPresent).toBe(false);
    expect(merged.find((r) => r.id === "k:9")!.verdict).toBe("falso");
  });

  it("no duplica una fila cuando la muestra trae dos hallazgos con el mismo id estable", () => {
    // El id no lleva número de línea: dos hallazgos del mismo kind en la misma
    // función comparten id — antes se escribían las dos filas e inflaban el
    // denominador de precisión.
    const merged = mergeRows([], [row("k:1", { startLine: 10 }), row("k:1", { startLine: 40 })]);
    expect(merged).toHaveLength(1);
  });

  it("dedupeById de `existing` — residuo de ANTES de que existiera el dedup de `fresh`: colapsa, conserva la juzgada", () => {
    // Medido en el corpus real: 50 grupos de id duplicado en las planillas ya
    // escritas (de una corrida anterior a la corrección de arriba), ninguno
    // con veredictos en desacuerdo — la Ola H sólo evitó escribir un
    // duplicado NUEVO, nunca limpió los que ya estaban en disco.
    const existing = [
      row("k:1", { verdict: "", note: "" }),
      row("k:1", { verdict: "verdadero", note: "juzgada" }),
    ];
    const merged = mergeRows(existing, []);
    expect(merged).toHaveLength(1);
    expect(merged[0].verdict).toBe("verdadero");
    expect(merged[0].note).toBe("juzgada");
  });

  it("dedupeById — ambas juzgadas (coincidiendo, como mide el corpus): se queda con la primera, ninguna se pierde en silencio", () => {
    const existing = [
      row("k:1", { verdict: "falso", note: "primera" }),
      row("k:1", { verdict: "falso", note: "segunda" }),
    ];
    const merged = mergeRows(existing, []);
    expect(merged).toHaveLength(1);
    expect(merged[0].note).toBe("primera");
  });

  it("dedupeById — sin duplicados, comportamiento idéntico (no reordena, no fusiona filas distintas)", () => {
    const existing = [row("k:1"), row("k:2")];
    const merged = mergeRows(existing, []);
    expect(merged.map((r) => r.id).sort()).toEqual(["k:1", "k:2"]);
  });
});

describe("mergeRows — reconciliación por contenido (defecto 1: el id cambia cuando cambia el detector)", () => {
  it("una fila huérfana con gemela viva por (kind,file,symbol,title) migra: conserva el veredicto humano, adopta el id nuevo", () => {
    const existing = [
      row("demeter-chain:old", {
        kind: "demeter-chain",
        file: "compat/src/suspense.js",
        symbol: "detachedClone",
        title: 'Cadena de 4 eslabones: "vnode._component.__hooks._list.forEach"',
        verdict: "verdadero",
        note: "acoplamiento real entre paquetes",
      }),
    ];
    const key = contentFindingKey({
      kind: "demeter-chain",
      file: "compat/src/suspense.js",
      symbol: "detachedClone",
      title: 'Cadena de 4 eslabones: "vnode._component.__hooks._list.forEach"',
    });
    const liveContentKeyById = new Map([["demeter-chain:new", key]]);
    const merged = mergeRows(existing, [], new Set(["demeter-chain:new"]), liveContentKeyById);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("demeter-chain:new");
    expect(merged[0].verdict).toBe("verdadero");
    expect(merged[0].note).toBe("acoplamiento real entre paquetes");
    expect(merged[0].stillPresent).toBe(true);
  });

  it("sin gemela por contenido, la fila huérfana queda stillPresent=false — como antes de esta corrección", () => {
    const existing = [row("old:1", { kind: "k", file: "a.js", symbol: "f", title: "t1", verdict: "verdadero" })];
    const liveContentKeyById = new Map([["new:1", contentFindingKey({ kind: "k", file: "a.js", symbol: "f", title: "OTRO título" })]]);
    const merged = mergeRows(existing, [], new Set(["new:1"]), liveContentKeyById);
    expect(merged.find((r) => r.id === "old:1")!.stillPresent).toBe(false);
  });

  it("el CASO REAL del corpus (no sintético): la gemela viva YA tiene su propia fila sin juzgar — migra igual, nunca queda duplicada ni atascada", () => {
    // Antes de la corrección de esta ola, este escenario — el NORMAL en el
    // corpus real (`sample-findings-for-judgment.mts` hace top-up en cada
    // corrida, así que para cuando una fila queda huérfana su gemela con id
    // nuevo casi siempre YA está en `existing` como fila sin juzgar) — hacía
    // que la huérfana JAMÁS migrara: `existingIds.has(id)` bloqueaba el único
    // candidato para siempre. Medido contra `tests/golden/precision/preact.
    // verdicts.csv` real: las dos únicas `demeter-chain` verdaderas seguían
    // huérfanas bajo el id viejo mientras su gemela sin juzgar convivía al
    // lado — la reconciliación nunca se disparaba pese a estar implementada.
    const key = contentFindingKey({ kind: "k", file: "a.ts", symbol: "f", title: "t" });
    const existing = [
      row("live:1", { kind: "k", file: "a.ts", symbol: "f", title: "t", verdict: "" }), // gemela viva, ya en la planilla, sin juzgar
      row("orphan:1", { kind: "k", file: "a.ts", symbol: "f", title: "t", verdict: "verdadero" }), // huérfana, MISMA clave
    ];
    const liveContentKeyById = new Map([["live:1", key]]);
    const merged = mergeRows(existing, [], new Set(["live:1"]), liveContentKeyById);
    const ids = merged.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length); // sin id duplicado
    expect(merged).toHaveLength(1); // la huérfana se ABSORBE en la viva, no conviven las dos
    const survivor = merged.find((r) => r.id === "live:1")!;
    expect(survivor.verdict).toBe("verdadero"); // el juicio migró a la fila vigente
    expect(survivor.stillPresent).toBe(true); // y queda VIVA, no atascada para siempre
  });

  it("conflicto real: si la gemela viva YA tiene su PROPIO veredicto, ninguno de los dos se pisa — la huérfana queda archivada", () => {
    const key = contentFindingKey({ kind: "k", file: "a.ts", symbol: "f", title: "t" });
    const existing = [
      row("live:1", { kind: "k", file: "a.ts", symbol: "f", title: "t", verdict: "falso" }), // gemela viva, YA juzgada por su cuenta
      row("orphan:1", { kind: "k", file: "a.ts", symbol: "f", title: "t", verdict: "verdadero" }), // huérfana, MISMA clave, veredicto distinto
    ];
    const liveContentKeyById = new Map([["live:1", key]]);
    const merged = mergeRows(existing, [], new Set(["live:1"]), liveContentKeyById);
    const ids = merged.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(merged.find((r) => r.id === "live:1")!.verdict).toBe("falso"); // el veredicto propio de la viva no se toca
    expect(merged.find((r) => r.id === "orphan:1")!.stillPresent).toBe(false); // la huérfana queda archivada, sin pisar nada
  });

  it("dos huérfanas con la misma clave de contenido: sólo una reclama el único id vivo disponible, nunca las dos", () => {
    const key = contentFindingKey({ kind: "k", file: "a.ts", symbol: "f", title: "t" });
    const existing = [
      row("old:1", { kind: "k", file: "a.ts", symbol: "f", title: "t", verdict: "verdadero" }),
      row("old:2", { kind: "k", file: "a.ts", symbol: "f", title: "t", verdict: "falso" }),
    ];
    const liveContentKeyById = new Map([["new:1", key]]);
    const merged = mergeRows(existing, [], new Set(["new:1"]), liveContentKeyById);
    expect(merged.filter((r) => r.id === "new:1")).toHaveLength(1);
    expect(merged.filter((r) => r.stillPresent)).toHaveLength(1);
  });

  it("sin `liveContentKeyById` (llamador viejo), sin reconciliación — comportamiento idéntico a antes de esta corrección", () => {
    const existing = [row("old:1", { verdict: "verdadero" })];
    const merged = mergeRows(existing, [], new Set(["new:1"]));
    expect(merged[0].id).toBe("old:1");
    expect(merged[0].stillPresent).toBe(false);
  });
});
