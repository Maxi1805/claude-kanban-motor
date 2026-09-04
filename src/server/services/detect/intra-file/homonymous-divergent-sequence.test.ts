/**
 * `homonymous-divergent-sequence` — el ancla-FUERZA de Template Method
 * (Ola AC, frente AC3).
 *
 * QUÉ PRUEBA ESTE ARCHIVO, y por qué está organizado así: las CINCO
 * condiciones del detector (ver su docstring) existen cada una para cortar un
 * falso concreto, así que cada una tiene acá su test de FORMA COMPLETA (la
 * condición se cumple ⇒ dispara) y su test de EXCLUSIÓN (la condición no se
 * cumple ⇒ silencio). Un detector cuyas exclusiones no están probadas no tiene
 * exclusiones: tiene comentarios.
 *
 * Y el test que vale más que todos: **LA TRAMPA** — sobre la fixture canónica
 * del patrón YA APLICADO (`DataMiner`/`CsvDataMiner`/`LogDataMiner`, la misma
 * que usa `inheritance-family.test.ts`), este detector tiene que quedarse
 * CALLADO sobre el esqueleto, porque el esqueleto lo declara la base y ningún
 * hermano lo repite. Encontrar patrones ya aplicados es exactamente lo que la
 * Ola AC prohíbe (§0/§2.1 de su CONTEXTO).
 */
import { describe, expect, it } from "vitest";

import { detector } from "./homonymous-divergent-sequence.js";
import { DETECTORS } from "../registry.js";
import { fileUnitFrom, nodeSetsFor, parseRoot, runIntraFile, testContext } from "../testing.js";
import type { RawFinding } from "../types.js";
import type { CodeGraph, CodeGraphEdge, CodeGraphNode, GraphIndex } from "../../graph/types.js";

const TS_PROBE = `
class Animal {
  speak(): void {
    console.log("generic");
  }
}
abstract class AbstractAnimal {
  abstract speak(): void;
}
class Dog extends Animal {
  speak(): void {
    console.log("woof");
  }
}
`;

const PY_PROBE = `
class Animal:
    def speak(self):
        print("generic")

class Dog(Animal):
    def speak(self):
        print("woof")
`;

const RUBY_PROBE = `
class Animal
  def speak(volume)
    puts volume
  end
end

class Dog < Animal
  def speak(volume)
    puts "woof"
  end
end
`;

const JAVA_PROBE = `
abstract class Animal {
  void speak(int volume) {
    System.out.println(volume);
  }
}
class Dog extends Animal {
  void speak(int volume) {
    System.out.println("woof");
  }
}
`;

const CS_PROBE = `
abstract class Animal {
  public virtual void Speak(int volume) {
    System.Console.WriteLine(volume);
  }
}
class Dog : Animal {
  public override void Speak(int volume) {
    System.Console.WriteLine("woof");
  }
}
`;

/** Dos hermanos con el MISMO esqueleto (3 pasos comunes, mismo orden) y un
 *  paso propio cada uno. La base NO declara `render`: la secuencia está
 *  escrita dos veces. */
const TS_FORMA_COMPLETA = `
abstract class Report {
  protected open(): void {}
}

class HtmlReport extends Report {
  render(target: string): void {
    this.open();
    this.writeHeader(target);
    this.writeHtmlBody();
    this.writeFooter();
  }
}

class PdfReport extends Report {
  render(target: string): void {
    this.open();
    this.writeHeader(target);
    this.writePdfBody();
    this.writeFooter();
  }
}
`;

async function corre(source: string, probe = TS_PROBE, wasm = "tree-sitter-typescript.wasm", language = "typescript"): Promise<readonly RawFinding[]> {
  return runIntraFile(detector, { wasm, probe, language, source, capabilities: ["herencia", "unidad-tipo-clase", "tipos-explicitos"] });
}

/** Igual que `runIntraFile`, pero con un grafo REAL a mano: es la única forma
 *  de ejercitar la hermandad por `extends`/`mixes-in` hacia un ancestro que
 *  vive en OTRO archivo (lo que el camino de AST no puede ver) y la condición
 *  (5) — `runIntraFile` no arma grafo. */
async function correConGrafo(source: string, graph: CodeGraph, path = "a.ts"): Promise<readonly RawFinding[]> {
  const sets = await nodeSetsFor("tree-sitter-typescript.wasm", TS_PROBE);
  const root = await parseRoot("tree-sitter-typescript.wasm", source);
  const file = fileUnitFrom(root, sets, "typescript", { file: path });
  const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const from = new Map<string, CodeGraphEdge[]>();
  for (const e of graph.edges) {
    const list = from.get(e.from);
    if (list) list.push(e);
    else from.set(e.from, [e]);
  }
  const index: GraphIndex = { nodeById: (id) => byId.get(id) ?? null, edgesFrom: (id) => from.get(id) ?? [] };
  const ctx = { ...testContext(detector, "typescript", ["herencia", "unidad-tipo-clase"]), graph, graphIndex: () => index };
  return detector.run(file, ctx);
}

function symbolNode(id: string, file: string, symbolPath: string[], family: CodeGraphNode["family"]): CodeGraphNode {
  return { id, kind: "symbol", file, symbolPath, family };
}

describe("homonymous-divergent-sequence — la forma completa", () => {
  it("TypeScript: 2 hermanos declaran `render` con 3 pasos comunes en el mismo orden y 1 propio cada uno ⇒ 1 hallazgo, anclado en las DOS declaraciones", async () => {
    const findings = await corre(TS_FORMA_COMPLETA);
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.variant).toBe("render");
    expect(f.locations).toHaveLength(2);
    expect(f.locations.map((l) => l.symbol)).toEqual(["HtmlReport.render", "PdfReport.render"]);
    // el trigger es el número de PASOS COMUNES, no el de unidades
    expect(f.trigger[0]!.value).toBe(3);
    expect(f.detail).toContain("open › writeHeader › writeFooter");
    expect(f.locations[0]!.role).toContain("writeHtmlBody");
    expect(f.locations[1]!.role).toContain("writePdfBody");
  });

  it("Python: la misma forma, con `self.` ⇒ 1 hallazgo", async () => {
    const source = `
class Report:
    def open(self):
        pass

class HtmlReport(Report):
    def render(self, target):
        self.open()
        self.write_header(target)
        self.write_html_body()
        self.write_footer()

class PdfReport(Report):
    def render(self, target):
        self.open()
        self.write_header(target)
        self.write_pdf_body()
        self.write_footer()
`;
    const findings = await corre(source, PY_PROBE, "tree-sitter-python.wasm", "python");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(2);
  });

  it("Ruby: la misma forma, con receptor implícito ⇒ 1 hallazgo", async () => {
    const source = `
class Report
  def open
  end
end

class HtmlReport < Report
  def render(target)
    open()
    write_header(target)
    write_html_body()
    write_footer()
  end
end

class PdfReport < Report
  def render(target)
    open()
    write_header(target)
    write_pdf_body()
    write_footer()
  end
end
`;
    const findings = await corre(source, RUBY_PROBE, "tree-sitter-ruby.wasm", "ruby");
    expect(findings).toHaveLength(1);
  });

  it("Java: la misma forma ⇒ 1 hallazgo", async () => {
    const source = `
abstract class Report {
  void open() {}
}
class HtmlReport extends Report {
  void render(String target) {
    open();
    writeHeader(target);
    writeHtmlBody();
    writeFooter();
  }
}
class PdfReport extends Report {
  void render(String target) {
    open();
    writeHeader(target);
    writePdfBody();
    writeFooter();
  }
}
`;
    const findings = await corre(source, JAVA_PROBE, "tree-sitter-java.wasm", "java");
    expect(findings).toHaveLength(1);
  });

  it("C#: la misma forma, con la lista de bases en el campo `bases` ⇒ 1 hallazgo", async () => {
    const source = `
abstract class Report {
  public void Open() {}
}
class HtmlReport : Report {
  public void Render(string target) {
    Open();
    WriteHeader(target);
    WriteHtmlBody();
    WriteFooter();
  }
}
class PdfReport : Report {
  public void Render(string target) {
    Open();
    WriteHeader(target);
    WritePdfBody();
    WriteFooter();
  }
}
`;
    const findings = await corre(source, CS_PROBE, "tree-sitter-c_sharp.wasm", "csharp");
    expect(findings).toHaveLength(1);
  });
});

describe("homonymous-divergent-sequence — LA TRAMPA: el patrón YA APLICADO no se reporta", () => {
  it("la fixture canónica del patrón aplicado (el esqueleto SÓLO en la base, los hijos redefinen el gancho) ⇒ CERO hallazgos", async () => {
    const source = `
abstract class DataMiner {
  mine(path: string): void {
    this.openFile(path);
    this.extractData();
    this.analyzeData();
    this.sendReport();
    this.closeFile();
  }
  abstract extractData(): void;
}

class CsvDataMiner extends DataMiner {
  extractData(): void {
    this.extractCsvData();
  }
}

class LogDataMiner extends DataMiner {
  extractData(): void {
    this.extractLogLines();
  }
}
`;
    // `inheritance-family` SÍ dispara acá (mide el síntoma "existe la familia").
    // Este detector no puede: `mine` lo declara sólo la base, y `extractData`
    // no comparte ningún paso entre los hermanos.
    expect(await corre(source)).toHaveLength(0);
  });

  it("los hermanos sólo delegan hacia arriba (`super.render()` + un paso propio) ⇒ CERO: eso es extensión, no una secuencia repetida", async () => {
    const source = `
abstract class Report {
  render(target: string): void {
    this.open();
    this.write(target);
    this.close();
  }
}
class HtmlReport extends Report {
  render(target: string): void {
    super.render(target);
    this.writeHtmlBody();
    this.flushHtml();
  }
}
class PdfReport extends Report {
  render(target: string): void {
    super.render(target);
    this.writePdfBody();
    this.flushPdf();
  }
}
`;
    expect(await corre(source)).toHaveLength(0);
  });
});

describe("homonymous-divergent-sequence — las exclusiones, una por condición", () => {
  it("(1) sin ancestro común declarado ⇒ CERO, aunque las dos secuencias coincidan en parte", async () => {
    const source = `
class HtmlReport {
  render(target: string): void {
    this.open();
    this.writeHeader(target);
    this.writeHtmlBody();
    this.writeFooter();
  }
}
class PdfReport {
  render(target: string): void {
    this.open();
    this.writeHeader(target);
    this.writePdfBody();
    this.writeFooter();
  }
}
`;
    expect(await corre(source)).toHaveLength(0);
  });

  it("(2) aridades distintas ⇒ CERO — el falso medido `BsonObject.Add(name, token)` / `BsonArray.Add(token)`", async () => {
    const source = TS_FORMA_COMPLETA.replace("render(target: string): void {\n    this.open();\n    this.writeHeader(target);\n    this.writePdfBody();", "render(target: string, extra: number): void {\n    this.open();\n    this.writeHeader(target);\n    this.writePdfBody();");
    expect(source).toContain("extra: number");
    expect(await corre(source)).toHaveLength(0);
  });

  it("(2) tipos de retorno ESCRITOS distintos ⇒ CERO — el falso medido `GetEnumerator(): IEnumerator<A>` / `IEnumerator<B>`", async () => {
    const source = TS_FORMA_COMPLETA.replace("render(target: string): void {\n    this.open();\n    this.writeHeader(target);\n    this.writePdfBody();", "render(target: string): string {\n    this.open();\n    this.writeHeader(target);\n    this.writePdfBody();");
    expect(source).toContain("): string {");
    expect(await corre(source)).toHaveLength(0);
  });

  it("(3) menos pasos que el piso por copia ⇒ CERO", async () => {
    const source = `
abstract class Report {}
class HtmlReport extends Report {
  render(): void {
    this.open();
    this.writeHtmlBody();
  }
}
class PdfReport extends Report {
  render(): void {
    this.open();
    this.writePdfBody();
  }
}
`;
    expect(await corre(source)).toHaveLength(0);
  });

  it("(3) sin ningún paso propio (secuencias IDÉNTICAS) ⇒ CERO: eso es duplicación pura, y su mitigación es subir el método entero, no una plantilla", async () => {
    const source = `
abstract class Report {}
class HtmlReport extends Report {
  render(target: string): void {
    this.open();
    this.writeHeader(target);
    this.writeFooter();
  }
}
class PdfReport extends Report {
  render(target: string): void {
    this.open();
    this.writeHeader(target);
    this.writeFooter();
  }
}
`;
    expect(await corre(source)).toHaveLength(0);
  });

  it("(3) sin ningún paso común ⇒ CERO: son dos algoritmos distintos que comparten un nombre genérico", async () => {
    const source = `
abstract class Report {}
class HtmlReport extends Report {
  run(): void {
    this.a();
    this.b();
    this.c();
  }
}
class PdfReport extends Report {
  run(): void {
    this.x();
    this.y();
    this.z();
  }
}
`;
    expect(await corre(source)).toHaveLength(0);
  });

  it("(4) los MISMOS pasos comunes en ORDEN distinto ⇒ CERO: comparten vocabulario, no esqueleto", async () => {
    const source = `
abstract class Report {}
class HtmlReport extends Report {
  render(target: string): void {
    this.open();
    this.writeHeader(target);
    this.writeFooter();
    this.writeHtmlBody();
  }
}
class PdfReport extends Report {
  render(target: string): void {
    this.writeFooter();
    this.writeHeader(target);
    this.open();
    this.writePdfBody();
  }
}
`;
    expect(await corre(source)).toHaveLength(0);
  });

  it("un constructor no es un esqueleto: dos constructores con la misma forma ⇒ CERO", async () => {
    const source = `
abstract class Report {}
class HtmlReport extends Report {
  constructor(target: string) {
    super();
    this.open();
    this.writeHeader(target);
    this.writeHtmlBody();
    this.writeFooter();
  }
}
class PdfReport extends Report {
  constructor(target: string) {
    super();
    this.open();
    this.writeHeader(target);
    this.writePdfBody();
    this.writeFooter();
  }
}
`;
    expect(await corre(source)).toHaveLength(0);
  });
});

describe("homonymous-divergent-sequence — el defecto de gramática que cierra, y el grafo", () => {
  it("PARÁMETROS DE TIPO: `extends Base<Html>` y `extends Base<Pdf>` son HERMANOS (el defecto que parte la familia de `ParamType` de click en ocho)", async () => {
    const source = `
abstract class Report<T> {}
class HtmlReport extends Report<string> {
  render(target: string): void {
    this.open();
    this.writeHeader(target);
    this.writeHtmlBody();
    this.writeFooter();
  }
}
class PdfReport extends Report<number> {
  render(target: string): void {
    this.open();
    this.writeHeader(target);
    this.writePdfBody();
    this.writeFooter();
  }
}
`;
    const findings = await corre(source);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.title).toContain('"Report"');
  });

  it("GRAFO: hermandad por `mixes-in` hacia un ancestro de OTRO archivo — lo que la superclase escrita no puede ver", async () => {
    const source = `
class HtmlReport {
  render(target: string): void {
    this.open();
    this.writeHeader(target);
    this.writeHtmlBody();
    this.writeFooter();
  }
}
class PdfReport {
  render(target: string): void {
    this.open();
    this.writeHeader(target);
    this.writePdfBody();
    this.writeFooter();
  }
}
`;
    const graph: CodeGraph = {
      nodes: [
        symbolNode("sym:a.ts#HtmlReport", "a.ts", ["HtmlReport"], "class-like"),
        symbolNode("sym:a.ts#PdfReport", "a.ts", ["PdfReport"], "class-like"),
        symbolNode("sym:otro.ts#Reportable", "otro.ts", ["Reportable"], "class-like"),
        symbolNode("sym:otro.ts#Reportable.open", "otro.ts", ["Reportable", "open"], "function-like"),
      ],
      edges: [
        { from: "sym:a.ts#HtmlReport", to: "sym:otro.ts#Reportable", kind: "mixes-in", provenance: "declared", weight: 1 },
        { from: "sym:a.ts#PdfReport", to: "sym:otro.ts#Reportable", kind: "mixes-in", provenance: "declared", weight: 1 },
      ],
      resolution: {} as never,
    };
    const findings = await correConGrafo(source, graph);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.title).toContain('"Reportable"');
    // sin grafo, las mismas dos clases no son hermanas de nadie
    expect(await corre(source)).toHaveLength(0);
  });

  it("(5) CON GRAFO, ningún paso común es un símbolo que este repo declare ⇒ CERO (un nombre de la biblioteca estándar no es un paso de ESTE algoritmo)", async () => {
    const source = `
class HtmlReport {
  render(target: string): void {
    this.open();
    this.writeHeader(target);
    this.writeHtmlBody();
    this.writeFooter();
  }
}
class PdfReport {
  render(target: string): void {
    this.open();
    this.writeHeader(target);
    this.writePdfBody();
    this.writeFooter();
  }
}
`;
    const graph: CodeGraph = {
      nodes: [
        symbolNode("sym:a.ts#HtmlReport", "a.ts", ["HtmlReport"], "class-like"),
        symbolNode("sym:a.ts#PdfReport", "a.ts", ["PdfReport"], "class-like"),
        symbolNode("sym:otro.ts#Reportable", "otro.ts", ["Reportable"], "class-like"),
      ],
      edges: [
        { from: "sym:a.ts#HtmlReport", to: "sym:otro.ts#Reportable", kind: "extends", provenance: "declared", weight: 1 },
        { from: "sym:a.ts#PdfReport", to: "sym:otro.ts#Reportable", kind: "extends", provenance: "declared", weight: 1 },
      ],
      resolution: {} as never,
    };
    // el grafo NO declara `open`/`writeHeader`/`writeFooter` en ninguna parte
    expect(await correConGrafo(source, graph)).toHaveLength(0);
  });

  it("una arista `ambiguous` no hace familia", async () => {
    const source = `
class HtmlReport {
  render(target: string): void {
    this.open();
    this.writeHeader(target);
    this.writeHtmlBody();
    this.writeFooter();
  }
}
class PdfReport {
  render(target: string): void {
    this.open();
    this.writeHeader(target);
    this.writePdfBody();
    this.writeFooter();
  }
}
`;
    const graph: CodeGraph = {
      nodes: [
        symbolNode("sym:a.ts#HtmlReport", "a.ts", ["HtmlReport"], "class-like"),
        symbolNode("sym:a.ts#PdfReport", "a.ts", ["PdfReport"], "class-like"),
        symbolNode("sym:otro.ts#Reportable", "otro.ts", ["Reportable"], "class-like"),
        symbolNode("sym:otro.ts#Reportable.open", "otro.ts", ["Reportable", "open"], "function-like"),
      ],
      edges: [
        { from: "sym:a.ts#HtmlReport", to: "sym:otro.ts#Reportable", kind: "extends", provenance: "ambiguous", weight: 1 },
        { from: "sym:a.ts#PdfReport", to: "sym:otro.ts#Reportable", kind: "extends", provenance: "ambiguous", weight: 1 },
      ],
      resolution: {} as never,
    };
    expect(await correConGrafo(source, graph)).toHaveLength(0);
  });
});

describe("homonymous-divergent-sequence — la capacidad que declara", () => {
  it("no aplicable sin herencia: Go no expone ningún campo de herencia en esta gramática (structs sin base; el embedding no es `superclass`/`extends`), así que ninguna unidad declara un ancestro y no hay hermandad que agrupar — 0 hallazgos aunque el detector corriera igual", async () => {
    // El gate real (`needs: ["herencia"]`, evaluado por el runner) es lo que
    // impide correr este detector sobre Go en producción; mismo criterio y
    // mismas palabras que `inheritance-family.test.ts`/`refused-bequest.test.ts`
    // ya documentan para su propio "no aplicable sin herencia". Esta prueba
    // confirma la otra mitad de la regla G3: aun FORZADO a correr
    // (`runIntraFile` no aplica el gate de `needs`), Go no tiene ningún
    // ancestro declarado que la condición (1) pueda leer, y sin ancestro no
    // hay "en vez de estar arriba" que medir.
    const goProbe = `
package main

type Report struct{}

func (r *Report) Open() {}

type HtmlReport struct {
	Report
}

func (h *HtmlReport) Render(target string) {
	h.Open()
	h.WriteHeader(target)
	h.WriteHtmlBody()
	h.WriteFooter()
}

type PdfReport struct {
	Report
}

func (p *PdfReport) Render(target string) {
	p.Open()
	p.WriteHeader(target)
	p.WritePdfBody()
	p.WriteFooter()
}
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-go.wasm",
      probe: goProbe,
      language: "go",
      source: goProbe,
      capabilities: [],
    });
    expect(findings).toHaveLength(0);
  });
});

describe("homonymous-divergent-sequence — contrato de registro", () => {
  it("está registrado en `detect/registry.ts` y su tier está declarado", async () => {
    expect(DETECTORS.map((d) => d.id)).toContain("homonymous-divergent-sequence");
    const { DETECTOR_IMPACT } = await import("../impact.js");
    expect(DETECTOR_IMPACT["homonymous-divergent-sequence"]).toBe("mantenibilidad");
  });
});
