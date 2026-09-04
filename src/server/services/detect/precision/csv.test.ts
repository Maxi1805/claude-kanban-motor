import { describe, expect, it } from "vitest";

import { encodeCsv, parseCsv } from "./csv.js";

describe("csv", () => {
  it("hace ida y vuelta con campos simples", () => {
    const text = encodeCsv(["a", "b"], [
      ["1", "hola"],
      ["2", "chau"],
    ]);
    const { header, records } = parseCsv(text);
    expect(header).toEqual(["a", "b"]);
    expect(records).toEqual([
      ["1", "hola"],
      ["2", "chau"],
    ]);
  });

  it("escapa comas, comillas y saltos de línea, y los recupera intactos", () => {
    const text = encodeCsv(["title", "detail"], [
      ['con "comillas" y, coma', "línea uno\nlínea dos"],
    ]);
    const { records } = parseCsv(text);
    expect(records).toEqual([['con "comillas" y, coma', "línea uno\nlínea dos"]]);
  });

  it("archivo vacío da header y records vacíos", () => {
    expect(parseCsv("")).toEqual({ header: [], records: [] });
  });

  it("sólo header, sin filas", () => {
    const { header, records } = parseCsv(encodeCsv(["a", "b"], []));
    expect(header).toEqual(["a", "b"]);
    expect(records).toEqual([]);
  });

  it("tolera un archivo sin salto de línea final", () => {
    const { header, records } = parseCsv("a,b\r\n1,2");
    expect(header).toEqual(["a", "b"]);
    expect(records).toEqual([["1", "2"]]);
  });
});
