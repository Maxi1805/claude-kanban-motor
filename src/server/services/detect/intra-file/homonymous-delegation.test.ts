import { describe, expect, it } from "vitest";

import { detector } from "./homonymous-delegation.js";
import { runIntraFile } from "../testing.js";

// `function probe(a) {}` (además de la clase) es DELIBERADO: en
// tree-sitter-javascript/typescript, un `function_declaration` de nivel
// superior es un TIPO de nodo DISTINTO de `method_definition` (dentro de una
// clase) — sin ejercitarlo acá, `deriveNodeSets` no clasificaría ese tipo
// como `functionNodes`, y la Ruta 3 (FUNCIONAL, sin clase) de este detector
// nunca vería un `FunctionUnit` para `useColorDecorator` (mismo aviso que
// documenta `refused-bequest.test.ts`: "si la sonda no ejercita una
// construcción, esa construcción no existe para el detector").
const JS_PROBE = "class Probe { constructor() { this.x = 1; } method(a) { return a; } }\nfunction probe(a) { return a; }\n";
const PYTHON_PROBE = "class Probe:\n    def __init__(self):\n        self.x = 1\n    def method(self, a):\n        return a\n";
const RUBY_PROBE = "class Probe\n  def initialize\n    @x = 1\n  end\n  def method(a)\n    a\n  end\nend\n";
const GO_PROBE = "package p\ntype T struct{ x int }\nfunc (t *T) Method(a int) int {\n\treturn a\n}\nfunc NewT() *T {\n\treturn &T{x: 1}\n}\n";

describe("homonymous-delegation", () => {
  it("TypeScript: ColorDecorator reenvía area()/describe() homónimamente a this.shape ⇒ 1 hallazgo", async () => {
    const source = `
class ColorDecorator extends Shape {
  private shape: Shape;
  constructor(shape: Shape) {
    super();
    this.shape = shape;
  }
  area(): number {
    return this.shape.area();
  }
  describe(): string {
    return this.shape.describe();
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("area");
  });

  it("JavaScript: mismo patrón sin anotaciones de tipo ⇒ 1 hallazgo", async () => {
    const source = `
class ColorDecorator extends Shape {
  constructor(shape) {
    super();
    this.shape = shape;
  }
  area() {
    return this.shape.area();
  }
  describe() {
    return this.shape.describe();
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
    expect(findings).toHaveLength(1);
  });

  it("Python: self.shape.area() dentro de area(self) ⇒ 1 hallazgo", async () => {
    const source = `
class ColorDecorator(Shape):
    def __init__(self, shape):
        self.shape = shape

    def area(self):
        return self.shape.area()

    def describe(self):
        return self.shape.describe()
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-python.wasm", probe: PYTHON_PROBE, language: "python", source });
    expect(findings).toHaveLength(1);
  });

  it("Ruby: @shape.area dentro de def area ⇒ 1 hallazgo", async () => {
    const source = `
class ColorDecorator < Shape
  def initialize(shape)
    @shape = shape
  end

  def area
    @shape.area
  end

  def describe
    @shape.describe
  end
end
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source });
    expect(findings).toHaveLength(1);
  });

  it("Go: d.shape.Area() dentro de func (d *ColorDecorator) Area() ⇒ 1 hallazgo anclado al struct por receptor", async () => {
    const source = `
package shapes

type ColorDecorator struct {
	shape Shape
}

func (d *ColorDecorator) Area() float64 {
	return d.shape.Area()
}

func (d *ColorDecorator) Describe() string {
	return d.shape.Describe()
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-go.wasm", probe: GO_PROBE, language: "go", source });
    expect(findings).toHaveLength(1);
  });

  it("forma FUNCIONAL (closure, sin clase): useColorDecorator retorna claves homónimas al parámetro capturado ⇒ 1 hallazgo", async () => {
    const source = `
function useColorDecorator(shape) {
  return {
    area: () => shape.area(),
    describe: () => shape.describe(),
  };
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("useColorDecorator");
  });

  it("Ruby: @numbers.each { |n| yield n } dentro de def each — BLOQUE (sin paréntesis) ⇒ 1 hallazgo (caso real, censo congelado tests/fixtures/patterns/iterator/ruby.rb — la primera versión del segundo anclaje regresionó esto)", async () => {
    const source = `
class NumberCollection
  def initialize(numbers)
    @numbers = numbers
  end

  def each
    @numbers.each { |n| yield n }
  end
end
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source });
    expect(findings).toHaveLength(1);
  });

  it("control negativo, ANCLA-EQUIVOCADA (ola de precisión posterior a la Ola D, caso real hypotheses/composite.ts#asGraphIndex): un adaptador Map→interfaz cuya clave (`nodeById`) es un PREFIJO del método realmente invocado dos niveles adentro (`index.nodeById.get(id)`) ⇒ 0 hallazgos — no debe matchear ni \"node\" ni \"nodeById\" como si fueran el método invocado", async () => {
    const source = `
function asGraphIndex(index) {
  return {
    nodeById: (id) => index.nodeById.get(id) ?? null,
    edgesFrom: (id) => index.edgesFrom.get(id) ?? [],
  };
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
    expect(findings).toHaveLength(0);
  });

  it("control negativo: ReportGenerator llama this.logger.info() — nombre DISTINTO del método contenedor ⇒ 0 hallazgos", async () => {
    const source = `
class ReportGenerator {
  constructor(logger) {
    this.logger = logger;
  }
  generate() {
    this.logger.info("generating");
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
    expect(findings).toHaveLength(0);
  });

  it("control negativo, ANCLA-EQUIVOCADA (caso real schema-script.ts#toGraph, mapper puro): retorna un objeto que COPIA propiedades (lectura, sin llamada) del parámetro con las mismas claves ⇒ 0 hallazgos", async () => {
    const source = `
function toGraph(source) {
  return {
    id: source.id,
    describe: source.describe,
  };
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
    expect(findings).toHaveLength(0);
  });

  it("control negativo, forma FUNCIONAL: useReportGenerator llama logger.info() dentro de la clave generate ⇒ 0 hallazgos", async () => {
    const source = `
function useReportGenerator(logger) {
  return {
    generate: () => logger.info("generating"),
  };
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
    expect(findings).toHaveLength(0);
  });

  /**
   * ESTA TAREA — los cuatro arreglos de precisión medidos sobre el corpus
   * (jekyll/Ruby y click/Python, ver los docstrings del módulo).
   */
  it("Ruby, ANCLA-EQUIVOCADA #2 (encadenado más allá — caso real document_drop.rb/url_drop.rb): @obj.collection.label NO es un reenvío de collection ⇒ 0 hallazgos", async () => {
    const source = `
class DocumentDrop
  def collection
    @obj.collection.label
  end
end
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source });
    expect(findings).toHaveLength(0);
  });

  it("Ruby, ANCLA-EQUIVOCADA #2 (embebido en interpolación de string — caso real layout.rb): @path.inspect dentro de \"#{...}\" NO es un reenvío de inspect ⇒ 0 hallazgos", async () => {
    const source = `
class Layout
  def inspect
    "#<#{self.class} @path=#{@path.inspect}>"
  end
end
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source });
    expect(findings).toHaveLength(0);
  });

  it("Ruby, ANCLA-EQUIVOCADA #3 (reflexión — caso real converter.rb): self.class.highlighter_prefix NO es un colaborador ⇒ 0 hallazgos", async () => {
    const source = `
class Converter
  def highlighter_prefix
    self.class.highlighter_prefix
  end
end
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source });
    expect(findings).toHaveLength(0);
  });

  it("Ruby, ANCLA-EQUIVOCADA #4 (sufijo `!` — caso real inclusion.rb): @template.render!(...) NO es un reenvío de render ⇒ 0 hallazgos", async () => {
    const source = `
class Inclusion
  def render(context)
    @template.render!(context)
  end
end
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source });
    expect(findings).toHaveLength(0);
  });

  it("Python, control negativo del arreglo #2 DESCARTADO (caso real testing.py#EchoingStdin.read): un candidato-argumento de un helper propio pass-through SIGUE siendo un hallazgo", async () => {
    const source = `
class EchoingStdin:
    def _echo(self, rv):
        return rv

    def read(self, n=-1):
        return self._echo(self._input.read(n))
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-python.wasm", probe: PYTHON_PROBE, language: "python", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("read");
  });

  /**
   * ARREGLO (Ola N, frente A5b) — ANCLA-EQUIVOCADA #5, el candidato es sólo
   * una clave de un dict compuesto MÁS GRANDE (falso medido, causa escrita
   * en la planilla de veredictos: `to_info_dict → self.type.to_info_dict()`).
   */
  it("Python, ANCLA-EQUIVOCADA #5 (caso real, dict compuesto): to_info_dict retorna un dict con VARIAS claves, una de ellas self.type.to_info_dict() ⇒ 0 hallazgos — no reenvía su comportamiento, construye un dict nuevo", async () => {
    const source = `
class Node:
    def __init__(self, kind_type, node_id):
        self.type = kind_type
        self.id = node_id

    def to_info_dict(self):
        return {"type": self.type.to_info_dict(), "id": self.id}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-python.wasm", probe: PYTHON_PROBE, language: "python", source });
    expect(findings).toHaveLength(0);
  });

  it("Python, control negativo del arreglo #5: dict de UNA SOLA clave que envuelve el candidato entero SIGUE contando como reenvío — el umbral es DOS O MÁS claves hermanas, no una", async () => {
    const source = `
class Node:
    def __init__(self, kind_type):
        self.type = kind_type

    def to_info_dict(self):
        return {"type": self.type.to_info_dict()}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-python.wasm", probe: PYTHON_PROBE, language: "python", source });
    expect(findings).toHaveLength(1);
  });

  it("TypeScript, ANCLA-EQUIVOCADA #5: un objeto literal con VARIAS claves, una de ellas this.shape.area(), y otra un dato NO relacionado ⇒ 0 hallazgos — construye un resumen compuesto, no reenvía", async () => {
    const source = `
class ShapeSummary {
  private shape: Shape;
  constructor(shape: Shape) {
    this.shape = shape;
  }
  area(): object {
    return { area: this.shape.area(), computedAt: Date.now() };
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source });
    expect(findings).toHaveLength(0);
  });

  it("Ruby, ANCLA-EQUIVOCADA #5: un hash literal con VARIAS claves, una de ellas @shape.area, no es un reenvío ⇒ 0 hallazgos", async () => {
    const source = `
class ShapeSummary
  def initialize(shape)
    @shape = shape
  end

  def area
    { area: @shape.area, label: "summary" }
  end
end
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source });
    expect(findings).toHaveLength(0);
  });

  it("una sola clase con 2 reenvíos homónimos distintos ⇒ 1 hallazgo (no uno por miembro)", async () => {
    const source = `
class ColorDecorator extends Shape {
  constructor(shape) {
    this.shape = shape;
  }
  area() {
    return this.shape.area();
  }
  describe() {
    return this.shape.describe();
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
    expect(findings).toHaveLength(1);
  });
  /* ────────────────────────────────────────────────────────────────────
   * OLA W (W4) — JAVA y C#, el 91 % del volumen del corpus, ciegos hasta acá
   * por `CALL_NODE_TYPE = /call/i` (Java escribe `method_invocation`, C#
   * `invocation_expression`). Los dos primeros tests son la forma real de
   * `corpus/guava/guava/src/com/google/common/collect/ForwardingList.java:
   * 60-90` (excerpt literal: `protected abstract List<E> delegate();` más
   * cuatro de sus reenvíos) — la implementación de Decorator más citada de la
   * industria, invisible entera hasta esta ola.
   * ──────────────────────────────────────────────────────────────────── */
  const JAVA_PROBE = `
class Animal {
  void speak() {
    System.out.println("generic sound");
  }
}

class Dog extends Animal {
  void speak() {
    System.out.println("woof");
  }
}
`;

  const CSHARP_PROBE = `
class Animal {
  void Speak() {
    System.Console.WriteLine("generic sound");
  }
}

class Dog : Animal {
  void Speak() {
    System.Console.WriteLine("woof");
  }
}
`;

  it("Java, ACCESSOR (guava ForwardingList): `delegate().add(...)` dentro de `add(...)` ⇒ 1 hallazgo — INTENCIÓN: el colaborador es PROPIO, venga de un campo o de un accessor de la misma unidad", async () => {
    const source = `
public abstract class ForwardingList<E> extends ForwardingCollection<E> implements List<E> {
  protected abstract List<E> delegate();

  @Override
  public void add(int index, E element) {
    delegate().add(index, element);
  }

  @Override
  public E get(int index) {
    return delegate().get(index);
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, language: "java", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.role).toContain("delegate");
  });

  it("Java, CAMPO con receptor explícito: `this.delegate.get(i)` dentro de `get(i)` ⇒ 1 hallazgo — la forma que `/call/i` también perdía en Java", async () => {
    const source = `
public class CountingList<E> implements List<E> {
  private final List<E> delegate;
  public CountingList(List<E> delegate) {
    this.delegate = delegate;
  }
  public E get(int index) {
    count++;
    return this.delegate.get(index);
  }
  public int size() {
    return this.delegate.size();
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, language: "java", source });
    expect(findings).toHaveLength(1);
  });

  it("C#: `this._inner.Read(b)` dentro de `Read(b)` ⇒ 1 hallazgo — `invocation_expression`, la otra gramática que `/call/i` no nombraba", async () => {
    const source = `
public class CountingReader {
  private readonly IReader _inner;
  public CountingReader(IReader inner) {
    this._inner = inner;
  }
  public int Read(byte[] b) {
    _count++;
    return this._inner.Read(b);
  }
  public void Close() {
    this._inner.Close();
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-c_sharp.wasm", probe: CSHARP_PROBE, language: "csharp", source });
    expect(findings).toHaveLength(1);
  });

  it("C# (Ola X, B2), CAMPO SIN receptor: `_innerReader.Read()` dentro de `Read()` ⇒ 1 hallazgo — caso real `TraceJsonReader.cs`, el idioma sin `this.` que newtonsoft-json usa en TODO el repo (0 apariciones de `this.campo.método(` medidas, 366 de la forma sin `this.`)", async () => {
    const source = `
class TraceJsonReader : JsonReader {
  private readonly JsonReader _innerReader;
  public TraceJsonReader(JsonReader innerReader) {
    _innerReader = innerReader;
  }
  public override bool Read() {
    bool value = _innerReader.Read();
    WriteCurrentToken();
    return value;
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-c_sharp.wasm", probe: CSHARP_PROBE, language: "csharp", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.role).toContain("_innerReader");
  });

  it("C# (Ola X, B2), CONTROL NEGATIVO del campo SIN receptor: `_innerReader` NUNCA declarado como campo de la clase ⇒ 0 hallazgos — un identificador suelto que sólo TEXTUALMENTE calza no alcanza sin el campo DECLARADO (evita que una variable local o un parámetro cuelen)", async () => {
    const source = `
class Wrapper {
  public bool Read() {
    var _innerReader = LocalFactory.Create();
    return _innerReader.Read();
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-c_sharp.wasm", probe: CSHARP_PROBE, language: "csharp", source });
    expect(findings).toHaveLength(0);
  });

  it("C# (Ola X, B2), CONTROL NEGATIVO del campo SIN receptor: clase estática (`Console.WriteLine(...)` dentro de `WriteLine(...)`) ⇒ 0 hallazgos — `Console` no es un campo declarado de la unidad", async () => {
    const source = `
class Logger {
  public void WriteLine(string s) {
    System.Console.WriteLine(s);
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-c_sharp.wasm", probe: CSHARP_PROBE, language: "csharp", source });
    expect(findings).toHaveLength(0);
  });

  it("Java, CONTROL NEGATIVO: el idioma BARE (sin receptor) está ACOTADO a C# — un campo Java `logger` reenviado SIN `this.` (`logger.info()` dentro de un método `info`) ⇒ 0 hallazgos, no se activa fuera del lenguaje medido", async () => {
    const source = `
public class Foo {
  private final Logger logger;
  public Foo(Logger logger) {
    this.logger = logger;
  }
  public void info(String msg) {
    logger.info(msg);
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, language: "java", source });
    expect(findings).toHaveLength(0);
  });

  it("Java, CONTROL NEGATIVO: un colaborador con método de nombre DISTINTO (`logger.info()` dentro de `add()`) ⇒ 0 hallazgos — el criterio sigue siendo MISMO NOMBRE en ambos lados, no 'hay una invocación'", async () => {
    const source = `
public class AuditedList<E> {
  private final Logger logger;
  public AuditedList(Logger logger) {
    this.logger = logger;
  }
  public void add(E element) {
    this.logger.info("adding");
  }
  public void clear() {
    this.logger.info("clearing");
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, language: "java", source });
    expect(findings).toHaveLength(0);
  });

  it("Java, CONTROL NEGATIVO del accessor: `delegate().size()` DENTRO de un miembro que NO se llama `size` ⇒ 0 hallazgos (no hay homonimia que anclar)", async () => {
    const source = `
public class Sizes {
  protected abstract List<E> delegate();
  public boolean isEmpty() {
    return delegate().size() == 0;
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, language: "java", source });
    expect(findings).toHaveLength(0);
  });
  it("OLA W (W4) — `super().__init__(...)` dentro de `__init__` NO es reenvío a un colaborador ⇒ 0 hallazgos: es la MISMA instancia mirando su herencia (566 apariciones medidas en corpus/click + corpus/sqlalchemy)", async () => {
    const source = `
class UsageError(ClickException):
    def __init__(self, message, ctx=None):
        super().__init__(message)
        self.ctx = ctx

    def show(self, file=None):
        super().show(file)
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-python.wasm", probe: PYTHON_PROBE, language: "python", source });
    expect(findings).toHaveLength(0);
  });
  it("OLA W (W4) — C#: `GetType().GetHashCode()` dentro de `GetHashCode()` ⇒ 0 hallazgos (caso real medido: corpus/newtonsoft-json Src/Newtonsoft.Json/Serialization/NamingStrategy.cs:109). `GetType()` es la reflexión del propio objeto escrita como método, no un colaborador", async () => {
    const source = `
public class NamingStrategy {
  private bool _processDictionaryKeys;
  public NamingStrategy(bool processDictionaryKeys) {
    _processDictionaryKeys = processDictionaryKeys;
  }
  public override int GetHashCode() {
    return GetType().GetHashCode();
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-c_sharp.wasm", probe: CSHARP_PROBE, language: "csharp", source });
    expect(findings).toHaveLength(0);
  });

  it("OLA W (W4) — Java: `getClass().hashCode()` dentro de `hashCode()` ⇒ 0 hallazgos — la misma reflexión, la palabra que usa la otra gramática", async () => {
    const source = `
public class Marker {
  private final String tag;
  public Marker(String tag) {
    this.tag = tag;
  }
  @Override
  public int hashCode() {
    return getClass().hashCode();
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, language: "java", source });
    expect(findings).toHaveLength(0);
  });
  it("OLA W (W4) — PROTOCOLO UNIVERSAL: `equals` reenviado a un campo propio NO es evidencia de protocolo compartido ⇒ 0 hallazgos (caso real medido: corpus/guava .../base/Converter.java:532 — el objeto compara SUS campos con los del OTRO, no reenvía comportamiento). Era el 30 % de las 299 filas nuevas de guava", async () => {
    const source = `
public class FunctionBasedConverter<A, B> {
  private final Function<A, B> forwardFunction;
  public FunctionBasedConverter(Function<A, B> forwardFunction) {
    this.forwardFunction = forwardFunction;
  }
  @Override
  public boolean equals(Object object) {
    if (object instanceof FunctionBasedConverter) {
      FunctionBasedConverter<?, ?> that = (FunctionBasedConverter<?, ?>) object;
      return this.forwardFunction.equals(that.forwardFunction);
    }
    return false;
  }
  @Override
  public int hashCode() {
    return forwardFunction.hashCode();
  }
  @Override
  public String toString() {
    return forwardFunction.toString();
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, language: "java", source });
    expect(findings).toHaveLength(0);
  });

  it("OLA W (W4) — control positivo del mismo filtro: la MISMA clase con UN miembro que NO es del protocolo universal (`apply`) sigue dando 1 hallazgo — se excluye el nombre universal, no la clase", async () => {
    const source = `
public class FunctionBasedConverter<A, B> {
  private final Function<A, B> forwardFunction;
  public FunctionBasedConverter(Function<A, B> forwardFunction) {
    this.forwardFunction = forwardFunction;
  }
  @Override
  public boolean equals(Object object) {
    return this.forwardFunction.equals(object);
  }
  public B apply(A a) {
    return this.forwardFunction.apply(a);
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, language: "java", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("apply");
  });
});
