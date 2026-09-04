/**
 * Test de `interfaz-declarada` — ver el docstring de `interfaz-declarada.ts`
 * sobre por qué este archivo es autocontenido (no hay `graph/edges/testing.ts`
 * compartido: no existe, y crearlo está fuera de mi alcance declarado). Reusa,
 * sin editarlos, los módulos YA EXISTENTES `detect/testing.ts` (arranque real
 * de `web-tree-sitter`, `deriveNodeSets` real) y `code-grammar.ts`.
 */
import { describe, expect, it } from "vitest";

import { nodeSetsFor, parseRoot } from "../../detect/testing.js";
import { coverageFor, discoverCarrier, extractor, warmUp } from "./interfaz-declarada.js";
import type { EdgeContext } from "./interfaz-declarada.js";

const WASM: Readonly<Record<string, string>> = {
  java: "tree-sitter-java.wasm",
  csharp: "tree-sitter-c_sharp.wasm",
  typescript: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-tsx.wasm",
  go: "tree-sitter-go.wasm",
  ruby: "tree-sitter-ruby.wasm",
};

/** Sondas mínimas: ejercitan clase (con método) para que `classNodes` derive
 *  no vacío — ver §5 de la plantilla de detectores ("si la sonda no ejercita
 *  una construcción, esa construcción no existe"). */
const PROBE: Readonly<Record<string, string>> = {
  java: "class Probe { void m() { } }",
  csharp: "class Probe { void M() { } }",
  typescript: "class Probe { m(): void {} }",
  tsx: "class Probe { m(): void {} }",
  go: "package main\n\ntype Probe struct{}\n\nfunc (p *Probe) M() {}\n",
  ruby: "class Probe\n  def m\n  end\nend\n",
};

async function fileUnitFor(language: string, source: string) {
  const wasm = WASM[language]!;
  const sets = await nodeSetsFor(wasm, PROBE[language]!);
  const root = await parseRoot(wasm, source);
  return {
    path: `fixture.${language}`,
    language,
    lines: (root as unknown as { endPosition: { row: number } }).endPosition.row + 1,
    root,
    sets,
    functions: [],
  };
}

/** Corre `extractor.extract` de punta a punta: calienta la sonda sobre el
 *  centinela del extractor, arma el `FileUnit` real, y construye un
 *  `EdgeContext` cuyo `carriers()` devuelve EXACTAMENTE lo que `warmUp`
 *  resolvió — el mismo puente async→sync que documentó `interfaz-declarada.ts`. */
async function runOn(language: string, source: string) {
  const wasm = WASM[language]!;
  const sets = await nodeSetsFor(wasm, PROBE[language]!);
  const sentinelSource = extractor.sentinel[language];
  let carriers: ReturnType<typeof warmUp>["carriers"] = [];
  if (sentinelSource) {
    const sentinelRoot = await parseRoot(wasm, sentinelSource);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const warmed = warmUp(language, sentinelRoot as any, sets.classNodes);
    carriers = warmed.carriers;
  }
  const file = await fileUnitFor(language, source);
  const ctx: EdgeContext = {
    language,
    capabilities: new Set(["interfaz"]),
    carriers: (slot) => (slot === extractor.slots[0] ? carriers : []),
    suppressedRolePaths: [],
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return extractor.extract(file as any, ctx);
}

describe("interfaz-declarada", () => {
  it("java: una clase que implementa dos interfaces emite dos aristas", async () => {
    const facts = await runOn(
      "java",
      "interface Payable { }\ninterface Taxable { }\nclass Account implements Payable, Taxable {\n  void pay() { }\n}\n",
    );
    expect(facts.map((f) => f.toName).sort()).toEqual(["Payable", "Taxable"]);
    expect(facts[0]!.kind).toBe("implements");
    expect(facts[0]!.fromPath).toEqual(["Account"]);
    expect(facts[0]!.provenance).toBe("declared");
  });

  it("java: interfaces GENÉRICAS en la lista sí se reconocen, con el nombre pelado (Ola P; antes eran invisibles por ser otro `nodeType`)", async () => {
    const facts = await runOn(
      "java",
      "class Shape implements Comparable<Shape>, Iterable<String>, Plain {\n  void m() { }\n}\n",
    );
    expect(facts.map((f) => f.toName)).toEqual(["Comparable", "Iterable", "Plain"]);
  });

  it("java: interfaz genérica Y calificada (`java.util.Comparator<T>`) se parte en toName + toQualifier", async () => {
    const facts = await runOn("java", "class Shape implements java.util.Comparator<Shape> {\n  void m() { }\n}\n");
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ toName: "Comparator", toQualifier: ["java", "util"] });
  });

  it("typescript: `implements I<T>, J` emite LAS DOS (el genérico ya no se pierde)", async () => {
    const facts = await runOn("typescript", "class A implements I<string>, J {\n  m(): void {}\n}\n");
    expect(facts.map((f) => f.toName)).toEqual(["I", "J"]);
  });

  it("csharp: con genéricos, la ARIDAD real vuelve a ser la de la lista — `: B<T>, IFoo<T>, IBar` reclama las posiciones 1..2", async () => {
    // Antes de la Ola P los dos `generic_name` eran invisibles: la lista
    // medía 1 y este extractor no reclamaba nada (mientras `herencia.ts`
    // reclamaba `IBar`, la posición 2, como CLASE BASE — una arista falsa).
    const facts = await runOn("csharp", "class Derived : Base<T>, IFoo<T>, IBar {\n  void M() { }\n}\n");
    expect(facts.map((f) => f.toName)).toEqual(["IFoo", "IBar"]);
  });

  it("java control negativo: una clase sin implements no dispara nada", async () => {
    const facts = await runOn("java", "class Base { }\nclass Wallet extends Base {\n  void save() { }\n}\n");
    expect(facts).toHaveLength(0);
  });

  it("typescript: una clase que implementa dos interfaces emite dos aristas", async () => {
    const facts = await runOn(
      "typescript",
      "class Base {}\ninterface Payable {}\ninterface Taxable {}\nclass Account extends Base implements Payable, Taxable {\n  pay(): void {}\n}\n",
    );
    expect(facts.map((f) => f.toName).sort()).toEqual(["Payable", "Taxable"]);
  });

  it("typescript control negativo: una clase sin implements no dispara nada", async () => {
    const facts = await runOn("typescript", "class Simple {\n  method(): void {}\n}\n");
    expect(facts).toHaveLength(0);
  });

  it("tsx: emite igual que typescript (misma gramática de clases)", async () => {
    const facts = await runOn("tsx", "class Base {}\ninterface Payable {}\nclass Account extends Base implements Payable {\n  pay(): void {}\n}\n");
    expect(facts.map((f) => f.toName)).toEqual(["Payable"]);
  });

  it("csharp: lista de 2+ candidatos — reclama las posiciones 1..N (ciertas), nunca la posición 0", async () => {
    const facts = await runOn(
      "csharp",
      "interface IPayable { }\ninterface ITaxable { }\nclass Account : Base, IPayable, ITaxable {\n  void Pay() { }\n}\n",
    );
    // La aridad de C# (a lo sumo una clase base, y si existe va PRIMERO)
    // garantiza que las posiciones 1 y 2 (`IPayable`, `ITaxable`) son
    // interfaz con certeza estructural — se reclaman. La posición 0
    // (`Base`) sigue genuinamente ambigua (contraejemplo real en el corpus,
    // ver docstring del módulo) — es de `herencia.ts` en el caso de UN solo
    // candidato, nunca de acá cuando hay 2+.
    expect(facts.map((f) => f.toName).sort()).toEqual(["IPayable", "ITaxable"]);
    expect(facts.every((f) => f.kind === "implements")).toBe(true);
  });

  it("csharp: lista de UN solo candidato — no emite acá (es de `herencia.ts`, para no clasificar la misma relación dos veces)", async () => {
    const facts = await runOn(
      "csharp",
      "interface ITaxable { }\nclass Wallet : ITaxable {\n  void Pay() { }\n}\n",
    );
    expect(facts).toHaveLength(0);
  });

  it("csharp: warmUp sigue detectando la ambigüedad estructural (mismo camino que la superclase) pero YA NO vacía `carriers`", async () => {
    const wasm = WASM.csharp!;
    const sets = await nodeSetsFor(wasm, PROBE.csharp!);
    const sentinelRoot = await parseRoot(wasm, extractor.sentinel.csharp!);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = warmUp("csharp", sentinelRoot as any, sets.classNodes);
    expect(result.status).toBe("ambiguous");
    expect(result.ambiguous).toBe(true);
    // A diferencia de antes: `extract()` necesita el carrier para localizar
    // el contenedor de cada declaración real y reclamar las posiciones 1..N
    // — ver "AMBIGÜEDAD DECLARADA — C#" en el docstring del módulo.
    expect(result.carriers).toHaveLength(1);
  });

  // ROOT-CAUSE FIX, otro frente (`code-grammar.ts#GO_TYPE_SPEC_WORD`, ver ese
  // módulo): `classNodes` ya NO deriva vacío para Go — `type_spec` ahora
  // entra vía un fallback de vocabulario, mismo estándar que
  // `RECORD_NODE_WORD`/`CONSTRUCTOR_NODE_WORD`. Este test bloqueaba
  // exactamente el gap que el docstring de este archivo (línea ~55-66) ya
  // documentaba como "la ausencia es de `classNodes`, no de la sonda" — con
  // `classNodes` arreglado, ESTE extractor (sin ningún cambio propio: su
  // `SENTINEL.go` y `discoverCarrier` ya estaban listos) empieza a emitir.
  it("go: una interfaz que embebe otra emite una arista `implements` (classNodes ya no deriva vacío)", async () => {
    const sentinelRoot = await parseRoot(WASM.go!, extractor.sentinel.go!);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const path = discoverCarrier(sentinelRoot as any, extractor.expect.from, extractor.expect.to);
    expect(path).not.toBeNull();
    expect(path!.ownerType).toBe("type_spec");

    const sets = await nodeSetsFor(WASM.go!, PROBE.go!);
    expect(sets.classNodes.has("type_spec")).toBe(true);

    const facts = await runOn(
      "go",
      "package main\n\ntype Payable interface {\n\tPay()\n}\n\ntype Account interface {\n\tPayable\n}\n",
    );
    expect(facts.map((f) => f.toName)).toEqual(["Payable"]);
    expect(facts[0]!.kind).toBe("implements");
    expect(facts[0]!.fromPath).toEqual(["Account"]);
    expect(facts[0]!.provenance).toBe("declared");
  });

  it("go control negativo: un struct (sin embedding de interfaz) no dispara nada", async () => {
    const facts = await runOn(
      "go",
      "package main\n\ntype Shape struct {\n\tName string\n}\n\ntype Named struct {\n\tShape\n\tLabel string\n}\n",
    );
    expect(facts).toHaveLength(0);
  });

  it('no aplicable sin "interfaz": forzado a correr sobre ruby (sin SENTINEL declarado) da 0 hallazgos', async () => {
    const facts = await runOn("ruby", "class Account\n  def pay\n  end\nend\n");
    expect(facts).toHaveLength(0);
  });

  it("coverageFor reporta no-aplicable cuando falta la capacidad", () => {
    const coverage = coverageFor("ruby", new Set(), 1, 0);
    expect(coverage.status).toBe("no-aplicable");
    expect(coverage.missingCapabilities).toEqual(["interfaz"]);
  });
});
