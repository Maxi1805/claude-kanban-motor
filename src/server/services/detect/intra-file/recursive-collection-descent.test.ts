import { describe, expect, it } from "vitest";

import { symbolNodeId, type CodeGraph, type CodeGraphEdge, type CodeGraphNode, type EdgeKind } from "../../graph/types.js";
import { DETECTORS } from "../registry.js";
import { fileUnitFrom, nodeSetsFor, parseRoot, testContext } from "../testing.js";
import type { FileUnit, RawFinding } from "../types.js";
import { detector, RECURSIVE_COLLECTION_DESCENT_KIND } from "./recursive-collection-descent.js";

/* ────────────────────────────────────────────────────────────────────────
 * Sondas. Cada una ejercita lo que este detector necesita reconocer en ese
 * lenguaje: una clase con métodos, un bucle, un `if` con `else`, un `return`
 * y una llamada.
 * ──────────────────────────────────────────────────────────────────────── */

const TS_PROBE = `
class A {
  m(x: number): number {
    if (x > 0) { for (const y of this.zs) { this.m(y); } } else { return 0; }
    return 1;
  }
}
try { A; } catch (e) { }
switch (1) { case 1: break; default: break; }
const f = (v: number) => v;
[1].forEach((v) => f(v));
`;

const PY_PROBE = `
class A:
    def m(self, x):
        if x > 0:
            for y in self.zs:
                self.m(y)
        else:
            return 0
        return 1
try:
    pass
except Exception:
    pass
`;

const RUBY_PROBE = `
class A
  def m(x)
    if x > 0
      @zs.each do |y|
        m(y)
      end
    else
      return 0
    end
    1
  end
end
begin
rescue => e
end
case 1
when 1 then 1
else 2
end
`;

const GO_PROBE = `
package p
type A struct{}
func (a *A) M(x int) int {
	if x > 0 {
		for _, y := range a.Zs {
			a.M(y)
		}
	} else {
		return 0
	}
	switch x {
	case 1:
	default:
	}
	return 1
}
`;

const JAVA_PROBE = `
class A {
  int m(int x) {
    if (x > 0) { for (Node y : this.zs) { m(y); } } else { return 0; }
    switch (x) { case 1: break; default: break; }
    try { } catch (Exception e) { }
    return 1;
  }
}
`;

const CS_PROBE = `
class A {
  int M(int x) {
    if (x > 0) { foreach (var y in this.Zs) { M(y); } } else { return 0; }
    switch (x) { case 1: break; default: break; }
    try { } catch (System.Exception e) { }
    return 1;
  }
}
`;

interface Lang {
  readonly wasm: string;
  readonly probe: string;
  readonly language: string;
}

const TS: Lang = { wasm: "tree-sitter-typescript.wasm", probe: TS_PROBE, language: "typescript" };
const PY: Lang = { wasm: "tree-sitter-python.wasm", probe: PY_PROBE, language: "python" };
const RB: Lang = { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby" };
const GO: Lang = { wasm: "tree-sitter-go.wasm", probe: GO_PROBE, language: "go" };
const JAVA: Lang = { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, language: "java" };
const CS: Lang = { wasm: "tree-sitter-c_sharp.wasm", probe: CS_PROBE, language: "csharp" };

async function unitOf(lang: Lang, source: string, file?: string): Promise<FileUnit> {
  const extraClone = lang.language === "ruby" ? ["block", "do_block"] : undefined;
  const exclusions = lang.language === "ruby" ? ["block", "do_block"] : undefined;
  const sets = await nodeSetsFor(lang.wasm, lang.probe, extraClone, exclusions);
  const root = await parseRoot(lang.wasm, source);
  return fileUnitFrom(root, sets, lang.language, { file: file ?? `fixture.${lang.language}` });
}

function graphOf(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): CodeGraph {
  return { nodes: [...nodes], edges: [...edges], resolution: {} as never };
}

function symNode(file: string, symbolPath: readonly string[], family: CodeGraphNode["family"]): CodeGraphNode {
  return { id: symbolNodeId(file, symbolPath), kind: "symbol", file, symbolPath, family, startLine: 1, endLine: 9 };
}

function edgeOf(fromFile: string, fromPath: readonly string[], toFile: string, toPath: readonly string[], kind: EdgeKind): CodeGraphEdge {
  return { from: symbolNodeId(fromFile, fromPath), to: symbolNodeId(toFile, toPath), kind, provenance: "resolved", weight: 1 };
}

async function run(lang: Lang, source: string, graph: CodeGraph | null = null, file?: string): Promise<readonly RawFinding[]> {
  const unit = await unitOf(lang, source, file);
  const ctx = { ...testContext(detector, lang.language, []), graph };
  return detector.run(unit, ctx);
}

/* ────────────────────────────────────────────────────────────────────────
 * LA FORMA COMPLETA — la misma en seis gramáticas
 * ──────────────────────────────────────────────────────────────────────── */

const TS_COMPLETA = `
class Item {
  kids: Item[] = [];
  render(out: string[]): void {
    if (this.kids.length === 0) { out.push(this.label()); return; }
    for (const k of this.kids) { k.render(out); }
  }
  total(): number {
    if (this.kids.length === 0) { return this.own(); }
    let n = 0;
    for (const k of this.kids) { n += k.total(); }
    return n;
  }
  label(): string { return ""; }
  own(): number { return 0; }
}
`;

describe("recursive-collection-descent — la forma completa", () => {
  it("dos operaciones de la misma clase deciden hoja-vs-compuesto sobre la misma colección ⇒ UN hallazgo", async () => {
    const findings = await run(TS, TS_COMPLETA);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(2);
    expect(findings[0]!.locations.map((l) => l.symbol).sort()).toEqual(["render", "total"]);
    expect(findings[0]!.advice?.pattern?.name).toBe("Composite");
  });

  it("Python: la misma forma con `for … in self.kids` ⇒ UN hallazgo", async () => {
    const findings = await run(
      PY,
      `
class Item:
    def render(self, out):
        if len(self.kids) == 0:
            out.append(self.label())
            return
        for k in self.kids:
            k.render(out)

    def total(self):
        if len(self.kids) == 0:
            return self.own()
        n = 0
        for k in self.kids:
            n += k.total()
        return n
`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(2);
  });

  it("Ruby SIN tipos declarados: `@kids.each do |k| … end` ⇒ UN hallazgo (el ancla vieja es ciega acá)", async () => {
    const findings = await run(
      RB,
      `
class Item
  def render(out)
    if @kids.empty?
      out << label
      return
    end
    @kids.each do |k|
      k.render(out)
    end
  end

  def total
    return own if @kids.empty?
    n = 0
    @kids.each do |k|
      n += k.total
    end
    n
  end
end
`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(2);
  });

  it("Go: método con receptor y `range` ⇒ UN hallazgo", async () => {
    const findings = await run(
      GO,
      `
package p

type Item struct{ Kids []*Item }

func (i *Item) Render(out []string) []string {
	if len(i.Kids) == 0 {
		return append(out, i.Label())
	}
	for _, k := range i.Kids {
		out = k.Render(out)
	}
	return out
}

func (i *Item) Total() int {
	if len(i.Kids) == 0 {
		return i.Own()
	}
	n := 0
	for _, k := range i.Kids {
		n += k.Total()
	}
	return n
}

func (i *Item) Label() string { return "" }
func (i *Item) Own() int      { return 0 }
`,
    );
    expect(findings).toHaveLength(1);
  });

  it("Java: `for (Item k : this.kids)` ⇒ UN hallazgo", async () => {
    const findings = await run(
      JAVA,
      `
class Item {
  java.util.List<Item> kids;
  void render(java.util.List<String> out) {
    if (kids.isEmpty()) { out.add(label()); return; }
    for (Item k : this.kids) { k.render(out); }
  }
  int total() {
    if (kids.isEmpty()) { return own(); }
    int n = 0;
    for (Item k : this.kids) { n += k.total(); }
    return n;
  }
  String label() { return ""; }
  int own() { return 0; }
}
`,
    );
    expect(findings).toHaveLength(1);
  });

  it("C#: `foreach (var k in this.Kids)` ⇒ UN hallazgo", async () => {
    const findings = await run(
      CS,
      `
class Item {
  System.Collections.Generic.List<Item> Kids;
  void Render(System.Collections.Generic.List<string> outp) {
    if (Kids.Count == 0) { outp.Add(Label()); return; }
    foreach (var k in this.Kids) { k.Render(outp); }
  }
  int Total() {
    if (Kids.Count == 0) { return Own(); }
    int n = 0;
    foreach (var k in this.Kids) { n += k.Total(); }
    return n;
  }
  string Label() { return ""; }
  int Own() { return 0; }
}
`,
    );
    expect(findings).toHaveLength(1);
  });

  it("iteración funcional (`this.kids.forEach(k => …)`) cuenta como recorrido", async () => {
    const findings = await run(
      TS,
      `
class Item {
  kids: Item[] = [];
  render(out: string[]): void {
    if (this.kids.length === 0) { out.push(this.label()); return; }
    this.kids.forEach((k) => { k.render(out); });
  }
  paint(out: string[]): void {
    if (this.kids.length === 0) { out.push(this.label()); return; }
    this.kids.forEach((k) => { k.paint(out); });
  }
  label(): string { return ""; }
}
`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(2);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * UNA EXCLUSIÓN POR CONDICIÓN
 * ──────────────────────────────────────────────────────────────────────── */

describe("recursive-collection-descent — una exclusión por condición", () => {
  it("(1) recursión que NO está dentro de un recorrido (aritmética) ⇒ silencio", async () => {
    const findings = await run(
      TS,
      `
class M {
  fact(n: number): number {
    if (n <= 1) { return 1; }
    return n * this.fact(n - 1);
  }
  fib(n: number): number {
    if (n < 2) { return n; }
    return this.fib(n - 1) + this.fib(n - 2);
  }
}
`,
    );
    expect(findings).toHaveLength(0);
  });

  it("(2) recorrido SIN decisión hoja-vs-compuesto (el código ya trata uno y muchos igual) ⇒ silencio", async () => {
    const findings = await run(
      TS,
      `
class Item {
  kids: Item[] = [];
  render(out: string[]): void {
    out.push(this.label());
    for (const k of this.kids) { k.render(out); }
  }
  total(): number {
    let n = this.own();
    for (const k of this.kids) { n += k.total(); }
    return n;
  }
  label(): string { return ""; }
  own(): number { return 0; }
}
`,
    );
    expect(findings).toHaveLength(0);
  });

  it("(3) ESCALA: UNA sola operación que distingue ⇒ silencio", async () => {
    const findings = await run(
      TS,
      `
class Item {
  kids: Item[] = [];
  render(out: string[]): void {
    if (this.kids.length === 0) { out.push(this.label()); return; }
    for (const k of this.kids) { k.render(out); }
  }
  label(): string { return ""; }
}
`,
    );
    expect(findings).toHaveLength(0);
  });

  it("(3) ESCALA: dos operaciones que descienden sobre colecciones DISTINTAS no se suman ⇒ silencio", async () => {
    const findings = await run(
      TS,
      `
class Item {
  render(out: string[]): void {
    if (this.kids.length === 0) { out.push("x"); return; }
    for (const k of this.kids) { k.render(out); }
  }
  total(): number {
    if (this.parts.length === 0) { return 0; }
    let n = 0;
    for (const p of this.parts) { n += p.total(); }
    return n;
  }
  kids: Item[] = [];
  parts: Item[] = [];
}
`,
    );
    expect(findings).toHaveLength(0);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * LA TRAMPA — RESOLUCIÓN VERIFICADA en sus DOS formas
 * ──────────────────────────────────────────────────────────────────────── */

describe("recursive-collection-descent — la trampa: si la puerta ya existe, silencio", () => {
  it("(4) puerta de AFUERA: el dueño implementa un tipo con >=2 subtipos que declara la operación homónima ⇒ silencio", async () => {
    const file = "fixture.typescript";
    const graph = graphOf(
      [
        symNode(file, ["Item"], "class-like"),
        symNode("otro.ts", ["Leaf"], "class-like"),
        symNode("proto.ts", ["Node"], "class-like"),
        symNode("proto.ts", ["Node", "render"], "function-like"),
      ],
      [
        edgeOf(file, ["Item"], "proto.ts", ["Node"], "implements"),
        edgeOf("otro.ts", ["Leaf"], "proto.ts", ["Node"], "implements"),
        edgeOf("proto.ts", ["Node"], "proto.ts", ["Node", "render"], "contains"),
      ],
    );
    expect(await run(TS, TS_COMPLETA, graph, file)).toHaveLength(0);
    // Y sin esa arista, el MISMO código sí emite: la diferencia es la puerta.
    expect(await run(TS, TS_COMPLETA, graphOf([], []), file)).toHaveLength(1);
  });

  it("(4) un supertipo con UN solo subtipo NO es una puerta ⇒ el hallazgo sigue", async () => {
    const file = "fixture.typescript";
    const graph = graphOf(
      [
        symNode(file, ["Item"], "class-like"),
        symNode("proto.ts", ["Node"], "class-like"),
        symNode("proto.ts", ["Node", "render"], "function-like"),
      ],
      [edgeOf(file, ["Item"], "proto.ts", ["Node"], "implements"), edgeOf("proto.ts", ["Node"], "proto.ts", ["Node", "render"], "contains")],
    );
    expect(await run(TS, TS_COMPLETA, graph, file)).toHaveLength(1);
  });

  it("(4) un supertipo con >=2 subtipos que NO declara la operación homónima NO es una puerta ⇒ el hallazgo sigue", async () => {
    const file = "fixture.typescript";
    const graph = graphOf(
      [
        symNode(file, ["Item"], "class-like"),
        symNode("otro.ts", ["Leaf"], "class-like"),
        symNode("proto.ts", ["Node"], "class-like"),
        symNode("proto.ts", ["Node", "otraCosa"], "function-like"),
      ],
      [
        edgeOf(file, ["Item"], "proto.ts", ["Node"], "implements"),
        edgeOf("otro.ts", ["Leaf"], "proto.ts", ["Node"], "implements"),
        edgeOf("proto.ts", ["Node"], "proto.ts", ["Node", "otraCosa"], "contains"),
      ],
    );
    expect(await run(TS, TS_COMPLETA, graph, file)).toHaveLength(1);
  });

  it("(5) puerta de ADENTRO: otro tipo del MISMO archivo declara el mismo supertipo ⇒ silencio, aun sin grafo", async () => {
    const findings = await run(
      TS,
      `
interface Node { render(out: string[]): void; }
class Leaf implements Node {
  render(out: string[]): void { out.push("x"); }
}
class Item implements Node {
  kids: Item[] = [];
  render(out: string[]): void {
    if (this.kids.length === 0) { out.push(this.label()); return; }
    for (const k of this.kids) { k.render(out); }
  }
  total(): number {
    if (this.kids.length === 0) { return this.own(); }
    let n = 0;
    for (const k of this.kids) { n += k.total(); }
    return n;
  }
  label(): string { return ""; }
  own(): number { return 0; }
}
`,
    );
    expect(findings).toHaveLength(0);
  });

  it("(5) el mismo archivo con UN solo implementador NO cierra la puerta ⇒ el hallazgo sigue", async () => {
    const findings = await run(
      TS,
      `
interface Node { render(out: string[]): void; }
class Item implements Node {
  kids: Item[] = [];
  render(out: string[]): void {
    if (this.kids.length === 0) { out.push(this.label()); return; }
    for (const k of this.kids) { k.render(out); }
  }
  total(): number {
    if (this.kids.length === 0) { return this.own(); }
    let n = 0;
    for (const k of this.kids) { n += k.total(); }
    return n;
  }
  label(): string { return ""; }
  own(): number { return 0; }
}
`,
    );
    expect(findings).toHaveLength(1);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * Contrato de registro
 * ──────────────────────────────────────────────────────────────────────── */

describe("recursive-collection-descent — contrato", () => {
  it("está registrado, es intra-file y pide el grafo por RUTEO (no como compuerta)", () => {
    const registered = DETECTORS.find((d) => d.id === "recursive-collection-descent");
    expect(registered).toBeDefined();
    expect(registered!.kind).toBe(RECURSIVE_COLLECTION_DESCENT_KIND);
    expect(registered!.scope).toBe("intra-file");
    expect((registered as { needsGraph?: boolean }).needsGraph).toBe(true);
  });

  it("sin grafo NO se calla: sigue verificando la puerta de adentro y lo declara en la evidencia", async () => {
    const findings = await run(TS, TS_COMPLETA, null);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.evidence?.[1]!.note).toContain("sin grafo");
  });
});
