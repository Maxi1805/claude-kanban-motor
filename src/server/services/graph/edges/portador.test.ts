/**
 * `portador.ts` — CONTRATO-F9.md §3.3 forma 2, verificado contra REAL
 * grammars (`web-tree-sitter` + `tree-sitter-wasms`), mismo motivo que
 * `references.test.ts`: este módulo entero es una función de NOMBRES DE
 * CAMPO de la gramática — un árbol fabricado a mano no probaría nada.
 */
import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { deriveNodeSets, type ProbeNode } from "../../code-grammar.js";
import { extractCarrierFacts, materializeCarrierFacts, type CarrierFact } from "./portador.js";

const require = createRequire(import.meta.url);

/* eslint-disable @typescript-eslint/no-explicit-any */
let runtime: Promise<{ Parser: any; Language: any }> | null = null;
function loadRuntime() {
  runtime ??= (async () => {
    const mod = require("web-tree-sitter") as any;
    const Parser = mod.Parser ?? mod.default ?? mod;
    await Parser.init();
    const Language = Parser.Language ?? mod.Language;
    return { Parser, Language };
  })();
  return runtime;
}
function wasmPath(file: string): string {
  return path.join(path.dirname(require.resolve("tree-sitter-wasms/package.json")), "out", file);
}
const parsers = new Map<string, any>();
async function parserFor(wasmFile: string): Promise<any> {
  const cached = parsers.get(wasmFile);
  if (cached) return cached;
  const { Parser, Language } = await loadRuntime();
  const language = await Language.load(wasmPath(wasmFile));
  const parser = new Parser();
  parser.setLanguage(language);
  parsers.set(wasmFile, parser);
  return parser;
}
/**
 * `deriveNodeSets` sólo agrega un TIPO de nodo a `functionNodes` si el
 * texto de sonda tiene al menos UNA ocurrencia con forma completa
 * (`body`+`parameters`) — un lambda de Python sin parámetros (`lambda:
 * None`) omite el campo `parameters` por completo (confirmado por sonda
 * directa), así que una fuente de prueba donde TODOS los lambdas son de
 * cero argumentos nunca registraría `lambda` como function-like. Se deriva
 * `sets` de una fuente REPRESENTATIVA separada (con al menos un lambda CON
 * parámetro, igual que el `PYTHON_FAMILY_PROBE` real de `code-analyzer.ts`
 * línea 486), nunca del snippet de cada test — mismo principio que la
 * producción real, donde `deriveNodeSets` corre UNA vez por lenguaje sobre
 * un texto de sonda amplio, no por archivo.
 */
const SETS_PROBE: Readonly<Record<string, string>> = {
  "tree-sitter-javascript.wasm": "function named(a) { return a; }\nclass C { m(a) { return a; } }\nconst f = (a) => a;\nconst g = function(a) { return a; };",
  "tree-sitter-python.wasm": "def named(a):\n    return a\nclass C:\n    def m(self, a):\n        return a\nhelper = lambda x: x + 1",
  "tree-sitter-go.wasm": "package main\nfunc named(a int) int { return a }\nvar f = func(a int) int { return a }",
};
const setsCache = new Map<string, ReturnType<typeof deriveNodeSets>>();
async function setsFor(wasmFile: string) {
  const cached = setsCache.get(wasmFile);
  if (cached) return cached;
  const parser = await parserFor(wasmFile);
  const root = parser.parse(SETS_PROBE[wasmFile] ?? "").rootNode as ProbeNode;
  const sets = deriveNodeSets(root);
  setsCache.set(wasmFile, sets);
  return sets;
}
async function factsFor(wasmFile: string, source: string): Promise<readonly CarrierFact[]> {
  const parser = await parserFor(wasmFile);
  const root = parser.parse(source).rootNode as ProbeNode;
  const sets = await setsFor(wasmFile);
  return extractCarrierFacts(root as any, sets);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe("extractCarrierFacts — JavaScript", () => {
  const SRC = `
class Widget {
  constructor() {
    this.onChange = () => {};
    const local = function() {};
    list.push(function() {});
    const handlers = [function() {}, () => {}];
    const table = { a: function() {}, b: () => {} };
  }
}
`;

  it("cinco formas: field(self), local, argument, 2x collection-element, 2x map-value", async () => {
    const facts = await factsFor("tree-sitter-javascript.wasm", SRC);
    const byForm = (form: CarrierFact["carrierForm"]) => facts.filter((f) => f.carrierForm === form);

    expect(byForm("field")).toEqual([expect.objectContaining({ carrierName: "onChange", containerPath: ["Widget"] })]);
    expect(byForm("local")).toEqual([expect.objectContaining({ carrierName: "local", containerPath: ["Widget", "constructor"] })]);
    expect(byForm("argument")).toHaveLength(1);
    expect(byForm("collection-element")).toHaveLength(2);
    expect(byForm("map-value")).toHaveLength(2);
  });

  it("dos elementos del MISMO array literal comparten carrierOrdinal (fan-in) pero tienen `ordinal` (id del closure) DISTINTO — dos objetos literales distintos no comparten carrierOrdinal", async () => {
    const facts = await factsFor("tree-sitter-javascript.wasm", SRC);
    const collection = facts.filter((f) => f.carrierForm === "collection-element");
    expect(new Set(collection.map((f) => f.carrierOrdinal)).size).toBe(1); // el array `handlers` tiene 2 elementos, un solo portador.
    expect(new Set(collection.map((f) => f.ordinal)).size).toBe(2); // pero son DOS closures distintos — HALLAZGO MEDIDO en lodash real (ver el docstring de `CarrierFact.ordinal`).
    const mapValues = facts.filter((f) => f.carrierForm === "map-value");
    expect(new Set(mapValues.map((f) => f.carrierOrdinal)).size).toBe(1); // el objeto `table` tiene 2 pares, un solo portador.
    expect(new Set(mapValues.map((f) => f.ordinal)).size).toBe(2);
  });

  it("materializeCarrierFacts: el array de 2 elementos produce UN nodo carrier con 2 aristas carries (fan-in real) Y DOS nodos closure distintos — REGRESIÓN: la primera versión colapsaba los 2 closures en 1 (medido en lodash/fp/_baseConvert.js real, ver el docstring de CarrierFact.ordinal)", async () => {
    const facts = await factsFor("tree-sitter-javascript.wasm", SRC);
    const collectionFacts = facts.filter((f) => f.carrierForm === "collection-element");
    const { nodes, edges } = materializeCarrierFacts("w.js", collectionFacts);
    const carrierNodes = nodes.filter((n) => n.kind === "carrier");
    const closureNodes = nodes.filter((n) => n.kind === "symbol");
    expect(carrierNodes).toHaveLength(1);
    expect(closureNodes).toHaveLength(2);
    expect(new Set(closureNodes.map((n) => n.id)).size).toBe(2); // ids DISTINTOS, no la misma closure repetida.
    expect(edges).toHaveLength(2);
    expect(new Set(edges.map((e) => e.to)).size).toBe(2); // cada arista apunta a un closure DIFERENTE.
    expect(new Set(edges.map((e) => e.from))).toEqual(new Set([carrierNodes[0]!.id]));
  });

  it("un closure devuelto (return function(){}) NO es un portador — CONTRATO-F9.md §3.4, cruza un return, exige interprocedural", async () => {
    const facts = await factsFor("tree-sitter-javascript.wasm", "function make() { return function() {}; }");
    expect(facts).toEqual([]);
  });

  it("una función NOMBRADA (declaración) nunca es un portador de forma 2 — eso es carries-derive.ts, forma 1", async () => {
    const facts = await factsFor("tree-sitter-javascript.wasm", "function named() {} const x = named;");
    expect(facts).toEqual([]);
  });
});

describe("extractCarrierFacts — Python", () => {
  const SRC = `
class Widget:
    def __init__(self):
        self.on_change = lambda: None
        local = lambda: None
        handlers = [lambda: 1, lambda: 2]
        table = {"a": lambda: 1}
        register(lambda: None)
`;

  it("self.x = lambda ⇒ field; local = lambda ⇒ local; lista/dict ⇒ colapsan a 1 portador cada una; argumento", async () => {
    const facts = await factsFor("tree-sitter-python.wasm", SRC);
    const byForm = (form: CarrierFact["carrierForm"]) => facts.filter((f) => f.carrierForm === form);

    expect(byForm("field")).toEqual([expect.objectContaining({ carrierName: "on_change", containerPath: ["Widget"] })]);
    expect(byForm("local")).toEqual([expect.objectContaining({ carrierName: "local" })]);
    expect(new Set(byForm("collection-element").map((f) => f.carrierOrdinal)).size).toBe(1);
    expect(byForm("map-value")).toHaveLength(1);
    expect(byForm("argument")).toHaveLength(1);
  });
});

describe("extractCarrierFacts — Go (brecha MEDIDA: `expression_list` envuelve ambos lados de una asignación — ver el docstring del módulo)", () => {
  it("un argumento posicional SÍ se recupera correctamente (Go's argument_list no interpone envoltorio)", async () => {
    const facts = await factsFor(
      "tree-sitter-go.wasm",
      `package main
func main() {
  register(func() {})
}`,
    );
    expect(facts).toEqual([expect.objectContaining({ carrierForm: "argument" })]);
  });

  it("local := func(){} SE RECUPERA pero MAL ETIQUETADO como collection-element (el expression_list wrapper cae al caso posicional) — brecha declarada, no un falso positivo silencioso: sigue dando un portador, con la forma incorrecta", async () => {
    const facts = await factsFor("tree-sitter-go.wasm", `package main\nfunc main() {\n  local := func() {}\n}`);
    expect(facts).toEqual([expect.objectContaining({ carrierForm: "collection-element", carrierName: null })]);
  });

  it("return func(){} (idiomático en Go — higher-order constructors, medido en cobra real) NO es un portador — la exclusión de §3.4 atraviesa el expression_list de Go también", async () => {
    const facts = await factsFor("tree-sitter-go.wasm", `package main\nfunc make() func() {\n  return func() {}\n}`);
    expect(facts).toEqual([]);
  });
});
