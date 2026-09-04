import { describe, expect, it } from "vitest";

import { detector } from "./feature-envy-intra.js";
import { withGraph } from "../primitivas/u1-grafo-en-contexto.js";
import { fileUnitFrom, nodeSetsFor, parseRoot, runIntraFile, testContext } from "../testing.js";
import type { RawFinding } from "../types.js";
import type { CodeGraph, CodeGraphNode } from "../../graph/types.js";

const JS_PROBE = `
class Shape {
  area(x) {
    return x;
  }
}
`;

const PYTHON_PROBE = `
class Shape:
    def area(self, x):
        return x
`;

const RUBY_PROBE = `
class Shape
  def area(x)
    x
  end
end
`;

/**
 * Igual que `RUBY_PROBE` más un método de CLASE (`def self.x`, nodo
 * `singleton_method` — un tipo de nodo DISTINTO de `method` en esta
 * gramática, mismo hallazgo ya documentado en `lazy-init-repetida.test.ts`):
 * necesaria para que `deriveNodeSets` (que deriva `functionNodes` de LO QUE
 * LA SONDA ejercita) reconozca `singleton_method` como función-like — sin
 * esto, un `def self.x` del `source` de un test ni siquiera se vuelve
 * `FunctionUnit`, y el test de JUICIO DE PRECISIÓN #4 pasaría por la razón
 * equivocada (grupo vacío, no el chequeo `isStaticLike`).
 */
const RUBY_PROBE_WITH_SELF = `
class Shape
  def self.build(x)
    x
  end
  def area(x)
    x
  end
end
`;

const JAVA_PROBE = `
class Shape {
  int area(int x) {
    return x;
  }
}
`;

const CSHARP_PROBE = `
class Shape {
  int Area(int x) {
    return x;
  }
}
`;

const GO_PROBE = `
package main

type Shape struct {
	Name string
}

func (s *Shape) Area() int {
	return 0
}
`;

describe("feature-envy-intra", () => {
  it("javascript: un método que usa 3 miembros distintos del parámetro y sólo 1 propio es un hallazgo", async () => {
    // OJO CON EL `this.log`: desde el punto (N) el método tiene que tener al
    // menos UN atributo propio distinto para que el numerador de LAA se pueda
    // MEDIR. Sin él, `LAA < 1/3` se cumple por construcción y la regla citada
    // degenera a "ATFD > FEW" — ver el docstring del módulo.
    const source = `
class OrderProcessor {
  constructor() {
    this.log = 1;
  }
  process(order) {
    return this.log + order.getPrice() + order.getQuantity() + order.getTax();
  }
}
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source,
      language: "javascript",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("process");
    expect(findings[0]!.locations[0]!.role).toBe("método con más acceso foráneo que propio");
    expect(findings[0]!.trigger[0]!.value).toBe(3); // ATFD
  });

  it("javascript: JUICIO DE PRECISIÓN — un método ORQUESTADOR que reparte accesos entre VARIOS proveedores distintos (ninguno concentrado) NO dispara, aunque ATFD>2 y LAA<1/3 — caso real encontrado en `src/` (`task-lifecycle.ts#createTask`, ATFD=30, repartido entre `this.repos.projects`/`.projectRepos`/`.tasks`/`config`)", async () => {
    const source = `
class Coordinator {
  createTask(a, b, c) {
    return a.x() + a.y() + b.p() + b.q() + c.m() + c.n();
  }
}
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source,
      language: "javascript",
    });
    // ATFD=6 (>2), LAA=0 (<1/3): sin el chequeo de `dominance`, esto disparaba.
    // Con él: el proveedor más concentrado (a, b o c) sólo aporta 2 de los 6
    // miembros distintos (dominance=1/3 < 0.5) — ninguno domina, es un
    // orquestador, no envidia hacia un único otro tipo.
    expect(findings).toHaveLength(0);
  });

  it("javascript control: un único proveedor SÍ concentra el ATFD (dominance=1) y sigue disparando igual que antes del arreglo", async () => {
    const source = `
class Coordinator {
  constructor() {
    this.log = 1;
  }
  createTask(a) {
    return this.log + a.x() + a.y() + a.z();
  }
}
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source,
      language: "javascript",
    });
    expect(findings).toHaveLength(1);
  });

  it("javascript control negativo: un método mayormente propio (4 propios) con un solo miembro foráneo (ATFD=1, bajo el umbral) no dispara", async () => {
    const source = `
class OrderProcessor {
  constructor() {
    this.a = 1;
    this.b = 2;
    this.c = 3;
    this.d = 4;
  }
  total(extra) {
    return this.a + this.b + this.c + this.d + extra.value;
  }
}
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source,
      language: "javascript",
    });
    expect(findings).toHaveLength(0);
  });

  it("python: un método que usa 3 miembros del parámetro y 1 propio también dispara — segundo lenguaje real", async () => {
    const source = `
class OrderProcessor:
    def __init__(self):
        self.log = 1

    def process(self, order):
        return self.log + order.get_price() + order.get_quantity() + order.get_tax()
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-python.wasm",
      probe: PYTHON_PROBE,
      source,
      language: "python",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("process");
  });

  it("python control negativo: `self.` explícito se reconoce como propio, ATFD queda bajo el umbral", async () => {
    const source = `
class OrderProcessor:
    def __init__(self):
        self.a = 1
        self.b = 2
        self.c = 3
        self.d = 4

    def total(self, extra):
        return self.a + self.b + self.c + self.d + extra.value
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-python.wasm",
      probe: PYTHON_PROBE,
      source,
      language: "python",
    });
    expect(findings).toHaveLength(0);
  });

  it("ruby: un método que usa 3 miembros del parámetro y 1 propio también dispara — tercer lenguaje real, cierra ≥3", async () => {
    const source = `
class OrderProcessor
  def process(order)
    @log + order.get_price + order.get_quantity + order.get_tax
  end
end
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      source,
      language: "ruby",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("process");
  });

  it("ruby control negativo: `self.` explícito se reconoce como propio, igual que en Python", async () => {
    const source = `
class OrderProcessor
  def total(extra)
    self.a + self.b + self.c + self.d + extra.value
  end
end
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      source,
      language: "ruby",
    });
    expect(findings).toHaveLength(0);
  });

  it("ruby: el límite del punto (J) SIGUE (una lectura de miembro propio sin `self.` no declarada acá no cuenta como propia) pero ya NO produce un hallazgo: LAA=0 con CERO atributos propios es NO MEDIDO, no medido cero (punto N)", async () => {
    // `volume`, `weight` y `margin` son, en la intención del autor, lecturas de
    // miembros propios sin `self.` (idiomático en Ruby) — pero la clase de este
    // archivo no los declara (vendrían de una superclase o un mixin de OTRO
    // archivo), así que quedan como nombres libres: ni propios ni foráneos. El
    // resultado es que un método legítimamente mixto puede leer con LAA=0 y
    // disparar: la degradación documentada en el docstring del módulo, no un
    // comportamiento oculto. Lo que la ola N SÍ arregló es el caso hermano —
    // el nombre declarado en este archivo (punto B) y la LLAMADA sin receptor
    // (punto E) — ver los dos tests de más abajo.
    //
    // LA OLA O MIDIÓ EL ARREGLO Y LO DESCARTÓ, y por eso el límite SIGUE en
    // pie: contar TODO nombre desnudo no ligado como propio baja el corpus de
    // 541 a 449 pero deja C# en 4 de 53, TypeScript en 1 de 13 y JavaScript en
    // 0 de 2, porque en esas gramáticas el nombre desnudo es un import o un
    // global, no un envío implícito a `self`. Ver el punto (J).
    //
    // LO QUE LA OLA P CAMBIÓ es la CONSECUENCIA del límite, no el límite: con
    // cero atributos propios distintos el numerador de LAA no vale cero, no se
    // pudo medir, y un hallazgo cuya mitad de la regla nunca se evaluó no se
    // emite (punto N). El falso positivo conocido que este test documentaba
    // desde la ola N deja de emitirse; el límite queda igual de visible.
    const source = `
class OrderProcessor
  def total(order)
    volume + weight + margin + order.get_price + order.get_quantity + order.get_tax
  end
end
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      source,
      language: "ruby",
    });
    expect(findings).toHaveLength(0);
  });

  it("ruby control del punto (N): el MISMO método con UN solo miembro propio VISIBLE sí dispara — el chequeo es \"¿se pudo medir el numerador?\", no \"¿es chico?\"", async () => {
    const source = `
class OrderProcessor
  def total(order)
    @volume + weight + margin + order.get_price + order.get_quantity + order.get_tax
  end
end
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      source,
      language: "ruby",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[1]!.value).toBe(0.25); // 1 propio / (1 propio + 3 del proveedor)
  });

  it("java: un método que usa 3 miembros del parámetro y 1 propio también dispara — cuarto lenguaje real", async () => {
    const source = `
class OrderProcessor {
  int log;
  int process(Order order) {
    return this.log + order.getPrice() + order.getQuantity() + order.getTax();
  }
}
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-java.wasm",
      probe: JAVA_PROBE,
      source,
      language: "java",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("process");
  });

  it("java control negativo: acceso a campos propios vía `this.` no cuenta como foráneo", async () => {
    const source = `
class OrderProcessor {
  int a, b, c, d;
  int total(Extra extra) {
    return this.a + this.b + this.c + this.d + extra.getValue();
  }
}
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-java.wasm",
      probe: JAVA_PROBE,
      source,
      language: "java",
    });
    expect(findings).toHaveLength(0);
  });

  it("c#: un método que usa 3 miembros del parámetro y 1 propio también dispara — quinto lenguaje real", async () => {
    const source = `
class OrderProcessor {
  int log;
  int Process(Order order) {
    return this.log + order.GetPrice() + order.GetQuantity() + order.GetTax();
  }
}
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-c_sharp.wasm",
      probe: CSHARP_PROBE,
      source,
      language: "csharp",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("Process");
  });

  it("c# control negativo: `this.` explícito se reconoce como propio", async () => {
    const source = `
class OrderProcessor {
  int a, b, c, d;
  int Total(Extra extra) {
    return this.a + this.b + this.c + this.d + extra.GetValue();
  }
}
`;
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-c_sharp.wasm",
      probe: CSHARP_PROBE,
      source,
      language: "csharp",
    });
    expect(findings).toHaveLength(0);
  });

  it("borde del umbral ATFD: exactamente en el umbral (FEW=2) no dispara, uno más sí (Lanza & Marinescu)", async () => {
    const atfd = testContext(detector, "javascript").threshold("atfd").value;
    const cuerpo = (n: number): string =>
      `class C {\n  constructor() {\n    this.log = 1;\n  }\n  use(o) {\n    return this.log + ${Array.from({ length: n }, (_, i) => `o.m${i}()`).join(" + ")};\n  }\n}\n`;
    const atThreshold = cuerpo(atfd);
    const overThreshold = cuerpo(atfd + 1);

    const atFindings = await runIntraFile(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source: atThreshold,
      language: "javascript",
    });
    expect(atFindings).toHaveLength(0);

    const overFindings = await runIntraFile(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source: overThreshold,
      language: "javascript",
    });
    expect(overFindings).toHaveLength(1);
  });

  it("las dos condiciones son necesarias: ATFD por encima del umbral pero LAA por encima de 1/3 (mitad propio, mitad foráneo) no dispara", async () => {
    const source = `
class OrderProcessor {
  constructor() {
    this.a = 1;
    this.b = 2;
    this.c = 3;
  }
  mixed(order) {
    return this.a + this.b + this.c + order.getPrice() + order.getQuantity() + order.getTax();
  }
}
`;
    // ATFD = 3 (getPrice/getQuantity/getTax) > 2, pero LAA = 3/(3+3) = 0.5, no < 1/3.
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      source,
      language: "javascript",
    });
    expect(findings).toHaveLength(0);
  });

  it("no aplicable sin unidad-tipo-clase: Go no tiene nodo de clase (structs no tienen campo `body` en esta gramática) — 0 hallazgos posibles aunque el cuerpo sea mayormente foráneo", async () => {
    const source = `
package main

type Invoice struct {
	Other *Other
}

func (i *Invoice) Compute(order *Order) int {
	return order.GetPrice() + order.GetQuantity() + order.GetTax()
}
`;
    // Forzado igual que en el gate real (`runIntraFile` no aplica `needs`):
    // si esto disparara, el `needs` sería falso. No dispara porque
    // `metrics.className` es SIEMPRE null para Go — la limitación es del
    // lenguaje (sin unidad tipo-clase), no del extractor.
    const findings = await runIntraFile(detector, {
      wasm: "tree-sitter-go.wasm",
      probe: GO_PROBE,
      source,
      language: "go",
    });
    expect(findings).toHaveLength(0);
  });

  describe("JUICIO DE PRECISIÓN #3 — variable local de iteración (loop/bloque) NO es un objeto foráneo", () => {
    it("javascript: la variable de un `for...of` no cuenta como envidia — caso real `jekyll/site.rb#each_site_file` generalizado", async () => {
      const source = `
class Reporter {
  summarize(pages) {
    let total = 0;
    for (const page of pages) {
      total += page.getSize() + page.getWeight() + page.getDepth();
    }
    return total;
  }
}
`;
      // Antes del arreglo: "page" es un identificador plano usado como base de
      // acceso a miembro (getSize/getWeight/getDepth), indistinguible
      // estructuralmente de un parámetro foráneo genuino — ATFD=3, own=0,
      // dominance=1: disparaba. Con `collectLocallyBoundNames`, "page" está
      // ligado por `for_in_statement.left` y se excluye: no queda nada
      // clasificable.
      const findings = await runIntraFile(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        source,
        language: "javascript",
      });
      expect(findings).toHaveLength(0);
    });

    it("javascript: el parámetro de un callback `forEach` anidado tampoco cuenta — mecanismo (b), función-like anidada", async () => {
      const source = `
class Reporter {
  summarize(pages) {
    let total = 0;
    pages.forEach((page) => {
      total += page.getSize() + page.getWeight() + page.getDepth();
    });
    return total;
  }
}
`;
      const findings = await runIntraFile(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        source,
        language: "javascript",
      });
      expect(findings).toHaveLength(0);
    });

    it("javascript control: un identificador foráneo genuino (no ligado por ningún loop/bloque) sigue disparando igual que antes", async () => {
      const source = `
class Coordinator {
  constructor() {
    this.log = 1;
  }
  process(order) {
    return this.log + order.getPrice() + order.getQuantity() + order.getTax();
  }
}
`;
      const findings = await runIntraFile(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        source,
        language: "javascript",
      });
      expect(findings).toHaveLength(1);
    });

    it("python: la variable de un `for` tampoco cuenta — mismo mecanismo, campo `left`", async () => {
      const source = `
class Reporter:
    def summarize(self, pages):
        total = 0
        for page in pages:
            total += page.get_size() + page.get_weight() + page.get_depth()
        return total
`;
      const findings = await runIntraFile(detector, {
        wasm: "tree-sitter-python.wasm",
        probe: PYTHON_PROBE,
        source,
        language: "python",
      });
      expect(findings).toHaveLength(0);
    });

    it("java: la variable de un `for` mejorado tampoco cuenta — campo `name`, distinto de `left`", async () => {
      const source = `
class Reporter {
  int summarize(List<Page> pages) {
    int total = 0;
    for (Page page : pages) {
      total += page.getSize() + page.getWeight() + page.getDepth();
    }
    return total;
  }
}
`;
      const findings = await runIntraFile(detector, {
        wasm: "tree-sitter-java.wasm",
        probe: JAVA_PROBE,
        source,
        language: "java",
      });
      expect(findings).toHaveLength(0);
    });

    it("c#: la variable de un `foreach` tampoco cuenta — campo `left`, igual que JS/Python", async () => {
      const source = `
class Reporter {
  int Summarize(List<Page> pages) {
    int total = 0;
    foreach (var page in pages) {
      total += page.GetSize() + page.GetWeight() + page.GetDepth();
    }
    return total;
  }
}
`;
      const findings = await runIntraFile(detector, {
        wasm: "tree-sitter-c_sharp.wasm",
        probe: CSHARP_PROBE,
        source,
        language: "csharp",
      });
      expect(findings).toHaveLength(0);
    });

    it("ruby: el parámetro de un bloque `.each { |x| }` tampoco cuenta — caso real exacto de `jekyll/site.rb#each_site_file`", async () => {
      const source = `
class Reporter
  def summarize(pages)
    total = 0
    pages.each { |page| total += page.get_size + page.get_weight + page.get_depth }
    total
  end
end
`;
      const findings = await runIntraFile(detector, {
        wasm: "tree-sitter-ruby.wasm",
        probe: RUBY_PROBE,
        source,
        language: "ruby",
      });
      expect(findings).toHaveLength(0);
    });
  });

  describe("JUICIO DE PRECISIÓN #4 — método estático (o equivalente) sin estado propio posible no es envidia", () => {
    it("javascript: `static` no dispara aunque ATFD>2 y own=0 — caso real `MethodBinder.cs#FilterParameters` generalizado", async () => {
      const source = `
class Helper {
  static filter(order) {
    return order.getA() + order.getB() + order.getC();
  }
}
`;
      const findings = await runIntraFile(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        source,
        language: "javascript",
      });
      expect(findings).toHaveLength(0);
    });

    it("javascript control: `static` que SÍ toca `this.miembroEstático` conserva su propia señal (own>0, no se excluye a priori)", async () => {
      const source = `
class Helper {
  static filter(order) {
    return this.threshold + order.getA() + order.getB() + order.getC();
  }
}
`;
      // own=1 (this.threshold) > 0: el chequeo de estático NUNCA se consulta acá
      // (sólo se activa cuando own === 0) — ATFD=3>2, LAA=1/4=0.25<1/3: dispara igual.
      const findings = await runIntraFile(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        source,
        language: "javascript",
      });
      expect(findings).toHaveLength(1);
    });

    it("python: sin `self`/`cls` en la firma (equivalente a `@staticmethod`) no dispara", async () => {
      const source = `
class Helper:
    def filter(order):
        return order.get_a() + order.get_b() + order.get_c()
`;
      const findings = await runIntraFile(detector, {
        wasm: "tree-sitter-python.wasm",
        probe: PYTHON_PROBE,
        source,
        language: "python",
      });
      expect(findings).toHaveLength(0);
    });

    it("c#: `private static` no dispara — caso real exacto de `MethodBinder.cs#FilterParameters`", async () => {
      const source = `
class Helper {
  private static int Filter(Order order) {
    return order.GetA() + order.GetB() + order.GetC();
  }
}
`;
      const findings = await runIntraFile(detector, {
        wasm: "tree-sitter-c_sharp.wasm",
        probe: CSHARP_PROBE,
        source,
        language: "csharp",
      });
      expect(findings).toHaveLength(0);
    });

    it("java: `static` no dispara, mismo mecanismo que C#/TS", async () => {
      const source = `
class Helper {
  static int filter(Order order) {
    return order.getA() + order.getB() + order.getC();
  }
}
`;
      const findings = await runIntraFile(detector, {
        wasm: "tree-sitter-java.wasm",
        probe: JAVA_PROBE,
        source,
        language: "java",
      });
      expect(findings).toHaveLength(0);
    });

    it("java: un helper estático que llama a HERMANOS estáticos o a funciones libres sigue sin disparar — el chequeo mira el acceso por auto-referencia EXPLÍCITA, no el conteo propio total (regresión encontrada midiendo `guava/UnsignedLongs.java#parseUnsignedLong`)", async () => {
      const source = `
class UnsignedLongs {
  static long parse(String string, int radix) {
    checkNotNull(string);
    if (string.isEmpty()) {
      throw new NumberFormatException(overflowMessage());
    }
    return string.length() + string.charAt(0) + string.codePointAt(1);
  }

  static String overflowMessage() {
    return "";
  }
}
`;
      // `checkNotNull` y `overflowMessage()` suman acceso propio por el punto
      // (E): con el chequeo viejo (`own === 0`) este método volvía a disparar.
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, source, language: "java" });
      expect(findings).toHaveLength(0);
    });

    it("ruby: un método de clase (`def self.x`, nodo `singleton_method`) no dispara", async () => {
      const source = `
class Helper
  def self.filter(order)
    order.get_a + order.get_b + order.get_c
  end
end
`;
      const findings = await runIntraFile(detector, {
        wasm: "tree-sitter-ruby.wasm",
        probe: RUBY_PROBE_WITH_SELF,
        source,
        language: "ruby",
      });
      expect(findings).toHaveLength(0);
    });
  });

  /* ────────────────────────────────────────────────────────────────────
   * OLA N — la pregunta nueva. Cada test de acá abajo nombra el caso REAL
   * medido del corpus que lo motiva (planillas `*.verdicts.csv`).
   * ──────────────────────────────────────────────────────────────────── */

  describe("una VARIABLE LOCAL no es otra unidad (12 de los 38 falsos juzgados)", () => {
    it("javascript: `const info = …` seguido de `info.a/b/c` no dispara — caso real `schema-inspector.ts#scriptInfo` (\"info/meta/job son variables LOCALES\")", async () => {
      const source = `
class Inspector {
  scriptInfo(id) {
    const info = load(id);
    return info.name + info.size + info.owner;
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, source, language: "javascript" });
      expect(findings).toHaveLength(0);
    });

    it("java: una local declarada con `variable_declarator` (campo `name`) tampoco dispara — caso real `MessageDigestAlgorithmBenchmark.java#hash` (\"md es variable LOCAL\")", async () => {
      const source = `
class Bench {
  byte[] hash(Algorithm algorithm) {
    MessageDigest md = build();
    md.update();
    md.reset();
    return md.digest();
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, source, language: "java" });
      expect(findings).toHaveLength(0);
    });

    it("c#: la misma local, pero con el identificador POSICIONAL dentro del declarador (C# no expone campo `name` acá) — confirmado por sonda", async () => {
      const source = `
class Runner {
  int Run(Order order) {
    var record = Build(order);
    return record.A + record.B + record.C;
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-c_sharp.wasm", probe: CSHARP_PROBE, source, language: "csharp" });
      expect(findings).toHaveLength(0);
    });

    it("python: una local asignada (`parser = …`) no dispara — caso real `click/examples/aliases.py#read_config`", async () => {
      const source = `
class Config:
    def read_config(self, filename):
        parser = make_parser()
        parser.read(filename)
        parser.get_a()
        return parser.get_b()
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-python.wasm", probe: PYTHON_PROBE, source, language: "python" });
      expect(findings).toHaveLength(0);
    });

    it("ruby: una local asignada (`entry_filter = …`) no dispara — caso real `jekyll/reader.rb#read_included_excludes`", async () => {
      const source = `
class Reader
  def read_included_excludes(entry)
    entry_filter = build_filter
    entry_filter.symlink?(entry) || entry_filter.glob?(entry) || entry_filter.name?(entry)
  end
end
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, source, language: "ruby" });
      expect(findings).toHaveLength(0);
    });

    it("javascript: una comparación (`a == b`) NO liga nada — el nodo `binary` también expone `left`/`right`, y confundirlo con una asignación borraba el acceso propio de todo método de comparación (bug encontrado midiendo `jekyll/post_url.rb#deprecated_equality`)", async () => {
      const source = `
class Comparer {
  same(other) {
    return this.a == other.a && this.b == other.b && this.c == other.c;
  }
}
`;
      // Si `left`/`right` de un `binary` se leyeran como ataduras locales,
      // `this.a/b/c` dejaría de contar y LAA caería a 0: dispararía.
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, source, language: "javascript" });
      expect(findings).toHaveLength(0);
    });
  });

  describe("un NOMBRE LIBRE (módulo, global, tipo, enum) no es otra unidad (15 de los 38 falsos juzgados)", () => {
    it("javascript: `Math.max/min/abs` no dispara — caso real `preact/demo/spiral.jsx#render` (\"'Math' es global del lenguaje\")", async () => {
      const source = `
class Spiral {
  render(n) {
    return Math.max(n, 1) + Math.min(n, 2) + Math.abs(n);
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, source, language: "javascript" });
      expect(findings).toHaveLength(0);
    });

    it("python: un módulo de biblioteca estándar no dispara — caso real `click/testing.py#isolation` (\"sys.stdout, os.environ\")", async () => {
      const source = `
class Runner:
    def isolation(self, text):
        sys.stdout.write(text)
        sys.stderr.write(text)
        sys.stdin.close()
        return os.environ
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-python.wasm", probe: PYTHON_PROBE, source, language: "python" });
      expect(findings).toHaveLength(0);
    });

    it("typescript: un `switch` sobre constantes de un enum importado no dispara — caso real `nest/rpc-params-factory.ts#exchangeKeyForValue`", async () => {
      const source = `
class Factory {
  exchangeKeyForValue(key: number) {
    switch (key) {
      case ParamKind.PAYLOAD:
        return ParamKind.PAYLOAD;
      case ParamKind.CONTEXT:
        return ParamKind.CONTEXT;
      default:
        return ParamKind.UNKNOWN;
    }
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, source, language: "typescript" });
      expect(findings).toHaveLength(0);
    });

    it("ruby: una constante (`File.…`) no dispara — caso real `jekyll/reader.rb` (\"File, módulo stdlib de Ruby\")", async () => {
      const source = `
class Reader
  def check(entry)
    File.directory?(entry) || File.file?(entry) || File.symlink?(entry)
  end
end
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, source, language: "ruby" });
      expect(findings).toHaveLength(0);
    });
  });

  describe("el ACCESO PROPIO SIN RECEPTOR EXPLÍCITO cuenta (puntos B y E — lo que dejaba LAA en 0 en java/c#/ruby)", () => {
    it("java: campos declarados en la clase, usados sin `this.`, cuentan como propios — caso real `guava/Floats.java#equals` (\"array/start SÍ son campos propios\")", async () => {
      const source = `
class FloatArrayAsList {
  float[] array;
  int start;
  boolean equals(Object that) {
    return array[start] == that.getArray()[that.getStart()] && start == that.getStart();
  }
}
`;
      // 3 miembros distintos de `that` pero también 3 accesos propios (array,
      // start x2): LAA = 3/7 > 1/3. Sin el punto B, own=0 y disparaba.
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, source, language: "java" });
      expect(findings).toHaveLength(0);
    });

    it("java: la MISMA forma SIN un solo campo declarado en el archivo ya no dispara — el denominador de LAA existe pero el NUMERADOR no se pudo medir (punto N)", async () => {
      // Hasta la ola O esto emitía un hallazgo con LAA=0. Ese cero no era
      // "casi no usa lo suyo": era "no vi nada suyo", que es distinto y no se
      // puede afirmar. Ver el punto (N) del docstring del módulo.
      const source = `
class FloatArrayAsList {
  boolean equals(Object that) {
    return that.getArray() == that.getStart() && that.getSize() > 0;
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, source, language: "java" });
      expect(findings).toHaveLength(0);
    });

    it("java control: la MISMA forma con UN campo declarado y leído sin `this.` sí dispara — el arreglo no apaga la señal, mide su denominador", async () => {
      const source = `
class FloatArrayAsList {
  int start;
  boolean equals(Object that) {
    return start > 0 && that.getArray() == that.getStart() && that.getSize() > 0;
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, source, language: "java" });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.trigger[1]!.value).toBe(0.25); // 1 propio / (1 propio + 3 del proveedor)
    });

    it("c#: un campo `private readonly` (declarador con identificador posicional) cuenta como propio — caso real `newtonsoft-json/JsonValidatingReader.cs` (\"_reader/_model/_schema son campos propios\")", async () => {
      const source = `
class Validating {
  private readonly int _reader;
  private readonly int _model;
  int Validate(Token token) {
    return _reader + _model + _reader + token.A() + token.B() + token.C();
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-c_sharp.wasm", probe: CSHARP_PROBE, source, language: "csharp" });
      expect(findings).toHaveLength(0);
    });

    it("c#: ESCRIBIR un campo propio con nombre desnudo (`_a = original._a`) cuenta como acceso propio — caso real `newtonsoft-json/JsonSerializerSettings.cs`, constructor de copia, y el veredicto ya juzgado de `JsonSerializer.cs:557` (\"el constructor ESCRIBE 13 campos propios y el detector no lo cuenta\")", async () => {
      const source = `
class Settings {
  private int _a;
  private int _b;
  private int _c;
  public Settings(Settings original) {
    _a = original.A;
    _b = original.B;
    _c = original.C;
  }
}
`;
      // La atadura "asignado" es la evidencia más débil: pierde contra los
      // miembros declarados por la clase. Sin eso, own=0 y esto disparaba.
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-c_sharp.wasm", probe: CSHARP_PROBE, source, language: "csharp" });
      expect(findings).toHaveLength(0);
    });

    it("ruby: `attr_reader :site` declara un miembro, y `site.…` es acceso PROPIO — caso real `jekyll/reader.rb` (\"site\" es un accesor propio)", async () => {
      const source = `
class Reader
  attr_reader :site

  def read_data(dir)
    site.in_source_dir(dir)
    site.data
    site.reader
  end
end
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, source, language: "ruby" });
      expect(findings).toHaveLength(0);
    });

    it("ruby control negativo: tres variables de instancia distintas son tres atributos propios — `@x` cuenta como acceso propio sin punto", async () => {
      const source = `
class Cache
  def fill(other)
    @a = other.x
    @b = other.y
    @c = other.z
  end
end
`;
      // 3 miembros distintos de `other` contra 3 atributos propios: LAA = 0.5.
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, source, language: "ruby" });
      expect(findings).toHaveLength(0);
    });

    it("ruby: `@cache.freeze` cuenta a `cache` como atributo PROPIO y a `freeze` como miembro de la unidad `cache` — el punto (L): lo que se alcanza A TRAVÉS de un colaborador propio es dato de la clase de ESE colaborador", async () => {
      const source = `
class Cache
  def fill(other)
    @cache = other.a
    @cache.freeze
    other.b
    other.c
  end
end
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, source, language: "ruby" });
      expect(findings).toHaveLength(1);
      // `cache` es el ÚNICO atributo propio distinto, en sus dos formas (`@cache = …` y `@cache.freeze`).
      expect(findings[0]!.evidence!.find((e) => e.label.startsWith("miembros propios distintos"))?.value).toBe(1);
      // El proveedor dominante es `other` (a, b, c), no `cache` (freeze).
      expect(findings[0]!.title).toContain('de "other" que de "Cache"');
      expect(findings[0]!.trigger[0]!.value).toBe(3);
    });

    it("ruby: una LLAMADA sin receptor cuenta como propia aunque el método venga de una superclase de OTRO archivo (punto E) — caso real `rubocop/mixin_grouping.rb#check_grouped_style` (\"add_offense/group_mixins son propios\")", async () => {
      const source = `
class MixinGrouping
  def check_grouped_style(send_node)
    add_offense(send_node)
    group_mixins(send_node)
    range_to_remove(send_node)
    send_node.method_name
    send_node.source_range
    send_node.arguments
  end
end
`;
      // 3 miembros distintos de send_node y 3 llamadas sin receptor: LAA = 0.5.
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, source, language: "ruby" });
      expect(findings).toHaveLength(0);
    });

    it("javascript: `this.options` es el atributo PROPIO y `a`/`b`/`c` son miembros de la unidad `options` — punto (L), la envidia hacia un COLABORADOR que la clase sostiene", async () => {
      // Ésta es la forma CANÓNICA de la Envidia de Características (Fowler:
      // `getPhoneNumber()` leyendo `phone.areaCode`/`.prefix`/`.number`) y
      // hasta la ola O este detector NO PODÍA EMITIRLA: la cadena entera
      // contaba como propia por un desvío declarado respecto de Lanza &
      // Marinescu, cuya justificación aritmética dejó de ser cierta cuando la
      // ola O pasó LAA a contar ATRIBUTOS DISTINTOS (punto I).
      const source = `
class Job {
  run() {
    return this.options.a + this.options.b + this.options.c;
  }
}
`;
      // 1 propio (`options`) contra 3 miembros de `options`: LAA = 0.25.
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, source, language: "javascript" });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.title).toContain('de "options" que de "Job"');
      expect(findings[0]!.trigger[0]!.value).toBe(3);
      expect(findings[0]!.trigger[1]!.value).toBe(0.25);
    });

    it("javascript control del punto (L): un método que lee UN dato del colaborador y varios propios NO dispara — el colaborador tiene que dominar", async () => {
      const source = `
class Job {
  run() {
    return this.options.a + this.x + this.y + this.z;
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, source, language: "javascript" });
      expect(findings).toHaveLength(0);
    });

    it("javascript: PROFUNDIDAD también del lado propio — en `this.a.b.c`, `c` NO es un miembro de `a` (punto L + PROFUNDIDAD)", async () => {
      const source = `
class Job {
  run() {
    return this.a.b.c + this.a.b.d + this.a.b.e;
  }
}
`;
      // `b` es el único miembro DIRECTO de `a`: ATFD=1, bajo el umbral.
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, source, language: "javascript" });
      expect(findings).toHaveLength(0);
    });
  });

  describe("PROFUNDIDAD — `p.x.y` es dato foráneo pero NO un miembro de `p`", () => {
    it("java: un adaptador de una línea (`a.b().c().d()`) no dispara — caso real `guava/MessageDigestAlgorithmBenchmark.java#hash`", async () => {
      const source = `
class Bench {
  byte[] hash(Algorithm algorithm, byte[] input) {
    return algorithm.getHashFunction().hashBytes(input).asBytes();
  }
}
`;
      // Una sola visita a `algorithm`: ATFD = 1 (getHashFunction). Los otros
      // dos saltos son datos de OTRAS clases, alcanzados a través suyo.
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, source, language: "java" });
      expect(findings).toHaveLength(0);
    });

    it("javascript: los saltos encadenados igual BAJAN LAA y se reportan como evidencia — no se descartan como antes", async () => {
      const source = `
class Job {
  constructor() {
    this.log = 1;
  }
  run(order) {
    return this.log + order.a() + order.b() + order.c() + order.a().deep().deeper();
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, source, language: "javascript" });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.trigger[0]!.value).toBe(3); // ATFD: a, b, c — nunca 5
      const encadenados = findings[0]!.evidence!.find((e) => e.label.startsWith("saltos encadenados"));
      expect(encadenados?.value).toBe(2); // deep, deeper
    });

    it("javascript: una cadena fluida sobre el parámetro (`s.gsub(…).gsub(…).gsub(…)`) aporta UN miembro, no uno por eslabón — caso real `rubocop/check_single_line_suitability.rb#to_single_line`", async () => {
      const source = `
class Formatter {
  clean(source) {
    return source.gsub(1).gsub(2).gsub(3).gsub(4).gsub(5);
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, source, language: "javascript" });
      expect(findings).toHaveLength(0);
    });
  });

  describe("DATO vs ORDEN — ATFD es Access To Foreign DATA, no \"cuántos mensajes le mando\"", () => {
    it("javascript: tres invocaciones CON argumentos sobre el parámetro no son tres atributos suyos — la llamada ENVUELVE al acceso en esta gramática", async () => {
      const source = `
class Writer {
  dump(writer) {
    writer.writeStart("a");
    writer.writeValue("b");
    writer.writeEnd("c");
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, source, language: "javascript" });
      expect(findings).toHaveLength(0);
    });

    it("java: la misma distinción donde la llamada ES el acceso (`method_invocation{object,name,arguments}`) — confirmado por sonda", async () => {
      const source = `
class Writer {
  void dump(JsonWriter writer) {
    writer.writeStart("a");
    writer.writeValue("b");
    writer.writeEnd("c");
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, source, language: "java" });
      expect(findings).toHaveLength(0);
    });

    it("ruby: un utilitario que TRANSFORMA su argumento (`input.nil?`, `input.empty?`, `input.sub(re, x)`) lee ATFD=2 y no dispara — caso real `jekyll/url_filters.rb#strip_index`", async () => {
      const source = `
module URLFilters
  def strip_index(input)
    return if input.nil? || input.empty?

    input.sub(%r{/index\\.html?$}, "/")
  end
end
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, source, language: "ruby" });
      expect(findings).toHaveLength(0);
    });

    it("ruby control: LEER tres atributos de otra unidad para decidir con ellos sí dispara — caso real `jekyll/doctor.rb#urls_only_differ_by_case`", async () => {
      const source = `
class Doctor
  def urls_only_differ_by_case(site)
    @issues
    site.pages
    site.docs_to_write
    site.dest
  end
end
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, source, language: "ruby" });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.trigger[0]!.value).toBe(3);
    });

    it("la orden igual BAJA LAA y se reporta como evidencia — no desaparece del cálculo", async () => {
      const source = `
class Writer {
  dump(writer) {
    return this.a + writer.state + writer.mode + writer.kind + writer.push(1) + writer.push(2);
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, source, language: "javascript" });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.trigger[0]!.value).toBe(3); // state, mode, kind — `push` no es dato
      const ordenes = findings[0]!.evidence!.find((e) => e.label.startsWith("órdenes al proveedor"));
      expect(ordenes?.value).toBe(2);
      // LAA = 1 miembro propio distinto (`a`) / (1 + 4 miembros distintos
      // alcanzados por `writer`: state, mode, kind y `push`). Ola O, punto (I):
      // la razón es entre ATRIBUTOS DISTINTOS a los dos lados, como en Lanza &
      // Marinescu — las DOS invocaciones de `push` son UN atributo invocado dos
      // veces, no dos. Con el conteo por evento de la ola N este mismo caso
      // leía 0.167 (1 / (1 + 5 eventos)).
      expect(findings[0]!.trigger[1]!.value).toBe(0.2);
      const propios = findings[0]!.evidence!.find((e) => e.label.startsWith("miembros propios distintos"));
      expect(propios?.value).toBe(1);
      const alcanzados = findings[0]!.evidence!.find((e) => e.label.startsWith("miembros distintos alcanzados"));
      expect(alcanzados?.value).toBe(4);
    });
  });

  describe("el proveedor DOMINANTE es el que se mide (punto C)", () => {
    it("javascript: ATFD total 4 repartido 2+2 no dispara aunque `dominance` llegue a 0.5 — el consejo `Move Method` no tendría a dónde mudarse", async () => {
      const source = `
class Coordinator {
  run(a, b) {
    return a.x() + a.y() + b.p() + b.q();
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, source, language: "javascript" });
      expect(findings).toHaveLength(0);
    });

    it("javascript: el hallazgo nombra SIEMPRE una unidad concreta, nunca \"2 unidades distintas\"", async () => {
      const source = `
class Coordinator {
  constructor() {
    this.log = 1;
  }
  run(a, b) {
    return this.log + a.x() + a.y() + a.z() + b.p();
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, source, language: "javascript" });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.title).toContain('de "a" que de "Coordinator"');
      expect(findings[0]!.trigger[0]!.value).toBe(3); // el ATFD del dominante, no el total (4)
    });
  });

  describe("una función ANIDADA no es un método (punto D — 5 de los 38 falsos juzgados)", () => {
    it("javascript: el callback de un `.map` no se evalúa como unidad propia — caso real `schema-inspector.ts:91` (\"'tr' es el parámetro del lambda\")", async () => {
      const source = `
class Inspector {
  inspect(rows) {
    return rows.map((tr) => ({ name: tr.name, size: tr.size, kind: tr.kind }));
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, source, language: "javascript" });
      expect(findings).toHaveLength(0);
    });

    it("javascript: un manejador anidado con DOS parámetros ajenos tampoco — caso real `ws/events.ts:33` (\"req es parámetro del callback, wss del constructor\")", async () => {
      const source = `
class Events {
  wire(server) {
    server.on("upgrade", function (req, socket) {
      return req.url + req.headers + req.method + socket.write(req.url);
    });
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, source, language: "javascript" });
      expect(findings).toHaveLength(0);
    });
  });

  /* ══════════════════════════════════════════════════════════════════════
   * OLA O — los cuatro arreglos contra los 20 falsos de la muestra
   * estratificada del integrador de la ola N (0 % de precisión con n=20).
   * Cada test cita el caso REAL del corpus que lo motiva, con su veredicto
   * en `tests/golden/precision/*.verdicts.csv` (nota `ola N, integrador:`).
   * ══════════════════════════════════════════════════════════════════════ */

  describe("un CONSTRUCTOR no tiene a dónde mudarse (punto F — 4 de los 20 falsos)", () => {
    // POR QUÉ JS Y NO JAVA, aunque el caso real sea de Java: el
    // `constructor_declaration` de Java es un tipo de nodo que la SONDA de
    // este test no ejercita, así que `deriveNodeSets` no lo reconoce como
    // función-like y el constructor ni siquiera se vuelve `FunctionUnit` —
    // el test pasaría por la razón equivocada (grupo vacío, no el filtro).
    // En JS/TS el constructor ES un `method_definition` como cualquier otro
    // método, o sea que el ÚNICO motivo por el que no dispara es el filtro
    // nuevo. `metrics.isConstructor` lo resuelve en producción
    // `code-analyzer.ts` (por `CONSTRUCTOR_NAMES` acá, por
    // `constructor_declaration` en Java/C#); el arnés lo deja en `false` si
    // no se lo pide, así que se pasa explícito para dejar escrito qué
    // métrica asume el test.
    const source = `
class StandardNetwork {
  constructor(builder) {
    init(builder.nodeOrder, builder.edgeOrder, builder.expectedNodeCount, builder.expectedEdgeCount);
  }
}
`;

    it("javascript: un constructor que consume un Builder no dispara — caso real `guava/StandardNetwork.java:66` (\"leer nodeOrder/edgeOrder/expectedNodeCount del builder ES el patrón Builder\")", async () => {
      const findings = await runIntraFile(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        source,
        language: "javascript",
        metrics: { isConstructor: true },
      });
      expect(findings).toHaveLength(0);
    });

    it("javascript control: el MISMO cuerpo en un método que NO es constructor sí se evalúa — el filtro es \"es un constructor\", no \"lee muchos campos de un parámetro\"", async () => {
      const findings = await runIntraFile(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        source,
        language: "javascript",
      });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.trigger[0]!.value).toBe(4);
    });
  });

  describe("LAA se mide contra el proveedor DOMINANTE, no contra la suma (punto G)", () => {
    it("javascript: dos proveedores cuyos eventos SUMADOS bajaban LAA por debajo de 1/3 ya no disparan — el título afirma UNA unidad, la aritmética tiene que ser contra ESA", async () => {
      // Con LAA global: 2 propios / (2 + 3 de `a` + 3 de `b`) = 0,25 < 1/3 y
      // ATFD del dominante = 3 > FEW: disparaba, y el título decía "usa más
      // datos de a que de Coordinator" contradiciendo sus propios números.
      // Con LAA contra el dominante: 2 / (2 + 3) = 0,4 — no dispara.
      const source = `
class Coordinator {
  run(a, b) {
    return this.uno + this.dos + a.x + a.y + a.z + b.p + b.q + b.r;
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, source, language: "javascript" });
      expect(findings).toHaveLength(0);
    });

    it("javascript control: concentrado en UN solo proveedor, la misma aritmética sigue disparando", async () => {
      const source = `
class Coordinator {
  run(a) {
    return this.uno + a.x + a.y + a.z + a.w;
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, source, language: "javascript" });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.trigger[1]!.value).toBe(0.2); // 1 propio distinto / (1 + 4 de `a`)
    });
  });

  describe("un PARÁMETRO puede ser dato propio (punto H — 3 de los 20 falsos)", () => {
    it("java: el parámetro del MISMO TIPO que la clase no es otra unidad — caso real `guava/StatsAccumulator.java:184` (\"fusionar dos instancias del mismo tipo no es envidia por definición\")", async () => {
      const source = `
class StatsAccumulator {
  public void addAll(StatsAccumulator values) {
    merge(values.count, values.mean, values.min, values.max);
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, source, language: "java" });
      expect(findings).toHaveLength(0);
    });

    it("c#: la misma regla donde el tipo del parámetro es un hijo `type` de `parameter` — confirmado por sonda directa", async () => {
      const source = `
class StatsAccumulator {
  public void AddAll(StatsAccumulator values) {
    Merge(values.Count, values.Mean, values.Min, values.Max);
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-c_sharp.wasm", probe: CSHARP_PROBE, source, language: "csharp" });
      expect(findings).toHaveLength(0);
    });

    it("typescript: ídem con `type_annotation` (`: Acc`), que trae el sigilo `:` adelante", async () => {
      const source = `
class StatsAccumulator {
  addAll(values: StatsAccumulator) {
    return values.count + values.mean + values.min + values.max;
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, source, language: "typescript" });
      expect(findings).toHaveLength(0);
    });

    it("java control: un parámetro de OTRO tipo sigue siendo proveedor foráneo — el filtro es el tipo, no \"tiene tipo\"", async () => {
      const source = `
class StatsAccumulator {
  public void addAll(OtherThing values) {
    merge(values.count, values.mean, values.min, values.max);
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, source, language: "java" });
      expect(findings).toHaveLength(1);
    });

    it("javascript: el parámetro que lleva el NOMBRE de un miembro que la clase declara es estado propio entregado por un protocolo externo — caso real `preact/demo/suspense.jsx:76` (`render(props, state)` con `this.state = …`)", async () => {
      const source = `
class DevtoolsDemo {
  setup() {
    this.state = { s1: 1, s2: 2, s3: 3 };
  }
  render(props, state) {
    return [state.s1, state.s2, state.s3, state.s4];
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, source, language: "javascript" });
      expect(findings).toHaveLength(0);
    });
  });

  describe("sin nombre no hay método que mudar (punto K)", () => {
    it("javascript: una flecha asignada a un campo de clase no emite un hallazgo cuyo sujeto es \"función anónima\" — caso real `nest/streamable-file.ts:20`", async () => {
      const source = `
class StreamableFile {
  errorLogger = (err, res) => {
    if (res.destroyed) return;
    if (res.headersSent) { res.end(); return; }
    res.statusCode = 400;
    res.send(err.message);
  };
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, source, language: "javascript" });
      expect(findings).toHaveLength(0);
    });

    it("javascript control: el MISMO cuerpo como método CON nombre sí se evalúa", async () => {
      const source = `
class StreamableFile {
  errorLogger(err, res) {
    this.log;
    if (res.destroyed) return;
    if (res.headersSent) { res.end(); return; }
    res.statusCode = 400;
    res.send(err.message);
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, source, language: "javascript" });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.title).toContain('"errorLogger"');
    });
  });

  describe("¿EXISTE EL DESTINO DEL `Move Method` EN ESTE REPO? — punto (M), EVIDENCIA y no filtro", () => {
    const JS_WASM = "tree-sitter-javascript.wasm";
    const SOURCE = `
class Job {
  constructor() {
    this.log = 1;
  }
  run(order) {
    return this.log + order.total + order.tax + order.discount;
  }
}
`;

    function symNode(id: string, file: string, symbolPath: readonly string[]): CodeGraphNode {
      return { id, kind: "symbol", file, symbolPath } as CodeGraphNode;
    }
    /**
     * OLA R (R5), punto (O): el proveedor `order` es un PARÁMETRO de `Job.run`,
     * así que su sitio de declaración es `carrier:fixture.javascript#Job.run.order@0`
     * y su tipo (escrito o propagado) es la clase `Order` de `o.js`. Sin ese par
     * — nodo `carrier` + arista `declares-type` — el destino del `Move Method`
     * queda indeterminado y el detector no emite; eso lo prueban los dos tests
     * nuevos del final de este bloque. Los tres tests del punto (M) llevan el
     * ancla puesta para que lo ÚNICO que varíe entre ellos siga siendo qué
     * unidad del repo declara los miembros leídos.
     */
    const CARRIER_ORDER = "carrier:fixture.javascript#Job.run.order@0";
    const ORDER_CLASS = symNode("sym:o.js#Order", "o.js", ["Order"]);
    const ORDER_CARRIER = {
      id: CARRIER_ORDER,
      kind: "carrier",
      file: "fixture.javascript",
      symbolPath: ["Job", "run", "order"],
      carrierForm: "parameter",
      declaredTypeForm: "nominal",
    } as CodeGraphNode;

    function graphWithoutTypeAnchor(nodes: CodeGraphNode[]): CodeGraph {
      return { nodes, edges: [], resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] } };
    }
    function graphOf(nodes: CodeGraphNode[]): CodeGraph {
      return {
        nodes: [...nodes, ORDER_CARRIER, ORDER_CLASS],
        edges: [{ from: CARRIER_ORDER, to: ORDER_CLASS.id, kind: "declares-type", provenance: "declared", weight: 1 }],
        resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
      };
    }
    async function run(graph: CodeGraph | null): Promise<readonly RawFinding[]> {
      const sets = await nodeSetsFor(JS_WASM, JS_PROBE);
      const root = await parseRoot(JS_WASM, SOURCE);
      const file = fileUnitFrom(root, sets, "javascript");
      return detector.run(file, withGraph(testContext(detector, "javascript"), graph));
    }
    const evidencia = (f: RawFinding): number | undefined =>
      f.evidence!.find((e) => e.label.startsWith("miembros del proveedor que declara JUNTOS"))?.value;

    it("una unidad del repo que declara los TRES miembros leídos: el destino existe y se reporta", async () => {
      const graph = graphOf([
        symNode("sym:o.js#Order", "o.js", ["Order"]),
        symNode("sym:o.js#Order.total", "o.js", ["Order", "total"]),
        symNode("sym:o.js#Order.tax", "o.js", ["Order", "tax"]),
        symNode("sym:o.js#Order.discount", "o.js", ["Order", "discount"]),
      ]);
      const findings = await run(graph);
      expect(findings).toHaveLength(1);
      expect(evidencia(findings[0]!)).toBe(3);
    });

    it("los mismos tres nombres REPARTIDOS entre unidades distintas no identifican destino: el máximo por unidad es 1", async () => {
      const graph = graphOf([
        symNode("sym:a.js#A.total", "a.js", ["A", "total"]),
        symNode("sym:b.js#B.tax", "b.js", ["B", "tax"]),
        symNode("sym:c.js#C.discount", "c.js", ["C", "discount"]),
      ]);
      const findings = await run(graph);
      expect(findings).toHaveLength(1);
      expect(evidencia(findings[0]!)).toBe(1);
    });

    it("un repo que no declara ninguno de los tres: cero — el tipo del proveedor lo define otro proyecto", async () => {
      const findings = await run(graphOf([symNode("sym:x.js#X.otra", "x.js", ["X", "otra"])]));
      expect(findings).toHaveLength(1);
      expect(evidencia(findings[0]!)).toBe(0);
    });

    it("ES EVIDENCIA, NO FILTRO: los tres grafos anteriores emiten EXACTAMENTE el mismo hallazgo — se midió como filtro y no separa (punto M)", async () => {
      const conAncla = await run(graphOf([]));
      expect(conAncla).toHaveLength(1);
      expect(evidencia(conAncla[0]!)).toBe(0);
      const tresMiembros = await run(
        graphOf([
          symNode("sym:o.js#Order.total", "o.js", ["Order", "total"]),
          symNode("sym:o.js#Order.tax", "o.js", ["Order", "tax"]),
          symNode("sym:o.js#Order.discount", "o.js", ["Order", "discount"]),
        ]),
      );
      expect(tresMiembros[0]!.title).toBe(conAncla[0]!.title);
      expect(tresMiembros[0]!.trigger).toEqual(conAncla[0]!.trigger);
    });

    it(
      "OLA R (R5), punto (O) — SIN GRAFO ('no pude mirar') el detector emite EXACTAMENTE como antes de esta ola: " +
        "el título no nombra unidad destino y la evidencia del punto (O) no está. Es el contrato de `IntraGraphOptIn`: " +
        "`needsGraph` en un detector `intra-*` es RUTEO, no compuerta, y `CK_ANALISIS_DOS_PASADAS=0` no puede apagarlo",
      async () => {
        const sinGrafo = await run(null);
        expect(sinGrafo).toHaveLength(1);
        expect(sinGrafo[0]!.title).toContain('usa más datos de "order" que de "Job"');
        expect(evidencia(sinGrafo[0]!)).toBeUndefined();
        expect(sinGrafo[0]!.evidence!.some((e) => e.label.startsWith("miembros leídos que declara la unidad destino"))).toBe(false);
      },
    );

    it(
      "OLA R (R5), punto (O) — CON GRAFO y sin poder determinar el tipo del proveedor, NO emite: un `Move Method` " +
        "cuyo destino es un nombre de variable y no una unidad afirma 'este método pertenece a X' sin poder decir qué es X",
      async () => {
        const sinAncla = await run(graphWithoutTypeAnchor([symNode("sym:o.js#Order", "o.js", ["Order"])]));
        expect(sinAncla).toHaveLength(0);
      },
    );

    it(
      "OLA R (R5), punto (O) — el título y el `detail` NOMBRAN la unidad destino verificada cuando el grafo la conoce: " +
        "es la mitad 'emite COMPLETO' del cambio, no sólo la mitad que filtra",
      async () => {
        const findings = await run(graphOf([]));
        expect(findings[0]!.title).toContain('"order" (Order)');
        expect(findings[0]!.detail).toContain("VERIFICADO en el grafo");
      },
    );
  });

  describe("LAA es una razón entre ATRIBUTOS DISTINTOS, no entre eventos (punto I)", () => {
    it("javascript: escribir DIEZ VECES el mismo campo propio es UN dato propio, no diez — el conteo por evento de la ola N escondía el hallazgo", async () => {
      const source = `
class Copier {
  fill(other) {
    this.buf = other.a;
    this.buf = other.b;
    this.buf = other.c;
    this.buf = other.d;
    this.buf = other.e;
    return this.buf;
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, source, language: "javascript" });
      expect(findings).toHaveLength(1);
      const propios = findings[0]!.evidence!.find((e) => e.label.startsWith("miembros propios distintos"));
      expect(propios?.value).toBe(1); // `buf`, una vez — no seis
      const eventos = findings[0]!.evidence!.find((e) => e.label.startsWith("accesos propios (eventos)"));
      expect(eventos?.value).toBe(6); // los eventos siguen contados y visibles
      expect(findings[0]!.trigger[1]!.value).toBe(0.167); // 1 / (1 + 5)
    });

    it("javascript: y al revés, invocar cinco veces el MISMO miembro ajeno es un atributo, no cinco — no alcanza para disparar", async () => {
      const source = `
class Reader {
  drain(src) {
    return this.a + this.b + src.next() + src.next() + src.next() + src.next() + src.next();
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, source, language: "javascript" });
      expect(findings).toHaveLength(0);
    });
  });

  /* ══════════════════════════════════════════════════════════════════════
   * OLA Z (frente Z2) — punto (P): el proveedor COLABORADOR sólo es envidia
   * si NINGÚN HERMANO de la misma clase lo COMPARTE de verdad. Ola Q §2.2
   * nombró el hecho para el 6,5 % del kind donde el proveedor NO es un
   * parámetro. "Compartir" exige que el hermano alcance el MISMO umbral ATFD
   * que el propio detector — una sola mención de paso (una llamada de
   * delegación limpia) no cuenta, ver el caso real de rubocop más abajo.
   * ══════════════════════════════════════════════════════════════════════ */

  describe("punto (P) — cuántos HERMANOS de la misma clase COMPARTEN de verdad el mismo campo", () => {
    it('javascript: un hermano que EXPLOTA VARIOS datos del mismo campo (ATFD propio > umbral) suprime el hallazgo — "options" es estado compartido, no posesión exclusiva de `run`', async () => {
      const source = `
class Job {
  run() {
    return this.options.a + this.options.b + this.options.c;
  }
  configure() {
    this.options.x = 1;
    this.options.y = 2;
    this.options.z = 3;
  }
}
`;
      // Sin el punto (P): `run` disparaba solo (1 propio "options" contra 3
      // miembros de "options", LAA=0.25<1/3, ATFD=3>2 — es el mismo cuerpo del
      // test del punto L más arriba). Con él: `configure` TAMBIÉN alcanza
      // ATFD=3>2 sobre "options" (x, y, z) — aunque su propio LAA/dominance
      // nunca dispare SU hallazgo, "disparen o no el hallazgo" es la
      // condición — así que el campo es estado que la clase entera coordina,
      // no algo que sólo `run` pueda mudarse.
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, source, language: "javascript" });
      expect(findings).toHaveLength(0);
    });

    it('javascript control: un hermano que sólo REENVÍA UNA llamada al campo (1 solo miembro, bajo el umbral) NO cuenta como "compartir" — CASO REAL: sin este control, el único hallazgo VERDADERO vivo del corpus (`rubocop/lib/rubocop/lsp/server.rb#configure`) se apagaba', async () => {
      // Estructura EXACTA del caso real, generalizada a JS. `Server` es una
      // fachada de `Runtime`: `format`/`offenses`/`resetIndex` cada uno
      // REENVÍA una única llamada a `this.runtime` (un miembro distinto cada
      // uno — delegación limpia de fachada, la forma NORMAL de este patrón),
      // mientras que `configure` escribe TRES atributos DE `runtime`
      // directamente en vez de delegar: la envidia real. La primera versión
      // de este punto (por MENCIÓN, no por EXPLOTACIÓN) contaba a los tres
      // delegadores limpios como "hermanos que comparten el campo" y apagaba
      // a `configure` — medido contra
      // `tests/golden/precision/rubocop.verdicts.csv` (verdict=verdadero,
      // stillPresent=true) antes de corregir la regla.
      const source = `
class Server {
  format(path, text) {
    return this.runtime.format(path, text);
  }
  offenses(path, text) {
    return this.runtime.offenses(path, text);
  }
  resetIndex() {
    return this.runtime.resetIndex();
  }
  configure(options) {
    this.runtime.safeAutocorrect = options.safeAutocorrect;
    this.runtime.lintMode = options.lintMode;
    this.runtime.layoutMode = options.layoutMode;
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, source, language: "javascript" });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.locations[0]!.symbol).toBe("configure");
      expect(findings[0]!.title).toContain('de "runtime" que de "Server"');
    });

    it('javascript control: un hermano que toca un campo DISTINTO no suprime nada — el filtro es por CAMPO, no por "tiene hermanos"', async () => {
      const source = `
class Job {
  run() {
    return this.options.a + this.options.b + this.options.c;
  }
  reset() {
    this.cache = null;
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, source, language: "javascript" });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.title).toContain('de "options" que de "Job"');
    });

    it("javascript control: sin ningún hermano, sigue disparando — es el mismo caso que el punto (L) ya cubre, sin regresión", async () => {
      const source = `
class Job {
  run() {
    return this.options.a + this.options.b + this.options.c;
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, source, language: "javascript" });
      expect(findings).toHaveLength(1);
    });

    it("javascript: el CONSTRUCTOR que INICIALIZA el campo no cuenta como hermano — si contara, el caso CANÓNICO de Fowler (`phone` asignado una vez en el constructor, leído en `getPhoneNumber`) no podría dispararse NUNCA en código real, donde casi todo campo se inicializa en algún constructor", async () => {
      const source = `
class Job {
  constructor(options) {
    this.options = options;
  }
  run() {
    return this.options.a + this.options.b + this.options.c;
  }
}
`;
      // `runIntraFile`/`metrics.isConstructor` del arnés se aplica a TODAS las
      // funciones de la fixture por igual (ver `FileUnitOptions` en
      // `testing.ts`), así que acá se arma el `FileUnit` a mano y se marca
      // `isConstructor` SÓLO en el nodo que se llama "constructor" — la manera
      // en que `code-analyzer.ts` lo hace en producción vía `CONSTRUCTOR_NAMES`.
      const sets = await nodeSetsFor("tree-sitter-javascript.wasm", JS_PROBE);
      const root = await parseRoot("tree-sitter-javascript.wasm", source);
      const file = fileUnitFrom(root, sets, "javascript");
      const withConstructorFlagged = {
        ...file,
        functions: file.functions.map((fn) => (fn.name === "constructor" ? { ...fn, metrics: { ...fn.metrics, isConstructor: true } } : fn)),
      };
      const findings = detector.run(withConstructorFlagged, testContext(detector, "javascript"));
      expect(findings).toHaveLength(1);
      expect(findings[0]!.locations[0]!.symbol).toBe("run");
    });

    it("javascript: el proveedor PARÁMETRO queda AFUERA de este chequeo — dos métodos que envidian, cada uno, SU PROPIO parámetro del mismo nombre disparan los DOS: el punto (P) sólo mira proveedores colaboradores", async () => {
      const source = `
class Job {
  constructor() {
    this.log = 1;
  }
  first(order) {
    return this.log + order.a() + order.b() + order.c();
  }
  second(order) {
    return this.log + order.x() + order.y() + order.z();
  }
}
`;
      const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, source, language: "javascript" });
      expect(findings).toHaveLength(2);
    });
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * OLA AU (FRENTE AU4) — LOS TRES HECHOS QUE FALTABAN
 *
 * Los tres viajan como EVIDENCIA, no como compuerta: el hallazgo sale igual
 * y con el mismo título. Estos tests verifican (a) que cada hecho DISTINGUE
 * las dos situaciones que separa y (b) que NINGUNO cambia la población — que
 * es la única razón por la que se pueden medir sobre el corpus sin mover el
 * nivel 1.
 * ──────────────────────────────────────────────────────────────────────── */
describe("feature-envy-intra — los hechos (Q), (R), (S) y (S-bis) de la Ola AU", () => {
  const JS_WASM = "tree-sitter-javascript.wasm";
  const SOURCE = `
class Job {
  constructor() {
    this.log = 1;
  }
  run(order) {
    return this.log + order.total + order.tax + order.discount;
  }
}
`;
  const CARRIER_ORDER = "carrier:fixture.javascript#Job.run.order@0";
  const ORDER_CARRIER = {
    id: CARRIER_ORDER,
    kind: "carrier",
    file: "fixture.javascript",
    symbolPath: ["Job", "run", "order"],
    carrierForm: "parameter",
    declaredTypeForm: "nominal",
  } as CodeGraphNode;

  function sym(id: string, file: string, symbolPath: readonly string[], over: Partial<CodeGraphNode> = {}): CodeGraphNode {
    return { id, kind: "symbol", file, symbolPath, ...over } as CodeGraphNode;
  }

  /** Grafo con el ancla de tipo puesta hacia `destino`, más los nodos extra que pida el test. */
  function graphTo(destino: CodeGraphNode, extra: CodeGraphNode[] = [], contains: readonly string[] = []): CodeGraph {
    return {
      nodes: [ORDER_CARRIER, destino, ...extra],
      edges: [
        { from: CARRIER_ORDER, to: destino.id, kind: "declares-type", provenance: "declared", weight: 1 },
        ...contains.map((to) => ({ from: destino.id, to, kind: "contains", provenance: "declared", weight: 1 }) as const),
      ],
      resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
    } as CodeGraph;
  }

  async function run(graph: CodeGraph): Promise<readonly RawFinding[]> {
    const sets = await nodeSetsFor(JS_WASM, JS_PROBE);
    const root = await parseRoot(JS_WASM, SOURCE);
    const file = fileUnitFrom(root, sets, "javascript");
    return detector.run(file, withGraph(testContext(detector, "javascript"), graph));
  }
  const dato = (f: RawFinding, prefijo: string): number | undefined =>
    f.evidence!.find((e) => e.label.startsWith(prefijo))?.value;

  const ORDER = sym("sym:o.js#Order", "o.js", ["Order"]);

  it("(Q) — un nombre de método que declara UNA sola unidad del repo cuenta 1: es un método propio, mudable", async () => {
    const findings = await run(graphTo(ORDER, [sym("sym:fixture.javascript#Job.run", "fixture.javascript", ["Job", "run"], { family: "function-like" })]));
    expect(findings).toHaveLength(1);
    expect(dato(findings[0]!, "(Q)")).toBe(1);
  });

  it("(Q) — el MISMO nombre declarado por tres unidades cuenta 3: es un punto de despacho, no un método de esta clase", async () => {
    const findings = await run(
      graphTo(ORDER, [
        sym("sym:fixture.javascript#Job.run", "fixture.javascript", ["Job", "run"], { family: "function-like" }),
        sym("sym:a.js#TaskA.run", "a.js", ["TaskA", "run"], { family: "function-like" }),
        sym("sym:b.js#TaskB.run", "b.js", ["TaskB", "run"], { family: "function-like" }),
      ]),
    );
    expect(findings).toHaveLength(1);
    expect(dato(findings[0]!, "(Q)")).toBe(3);
  });

  it("(Q) — un CAMPO homónimo no cuenta: sólo los miembros `function-like` son puntos de despacho", async () => {
    const findings = await run(
      graphTo(ORDER, [
        sym("sym:fixture.javascript#Job.run", "fixture.javascript", ["Job", "run"], { family: "function-like" }),
        sym("sym:a.js#Config.run", "a.js", ["Config", "run"], { family: "other" }),
      ]),
    );
    expect(dato(findings[0]!, "(Q)")).toBe(1);
  });

  it("(R) — con el destino distinto de la clase que contiene el método, el hecho no dispara", async () => {
    const findings = await run(graphTo(ORDER));
    expect(dato(findings[0]!, "(R)")).toBe(0);
  });

  it("(R) — cuando el proveedor es del MISMO tipo que la clase, el consejo diría 'mudalo a donde ya está'", async () => {
    const findings = await run(graphTo(sym("sym:j.js#Job", "j.js", ["Job"])));
    expect(findings).toHaveLength(1);
    expect(dato(findings[0]!, "(R)")).toBe(1);
  });

  it("(S) — un destino SIN un solo miembro `function-like` no admite métodos: el `Move Method` no tiene a dónde ir", async () => {
    const findings = await run(graphTo(ORDER, [sym("sym:o.js#Order.total", "o.js", ["Order", "total"], { family: "other" })], ["sym:o.js#Order.total"]));
    expect(dato(findings[0]!, "(S) ")).toBe(0);
  });

  it("(S) — un destino con un método propio cuenta 1: ahí sí hay dónde mudar", async () => {
    const findings = await run(graphTo(ORDER, [sym("sym:o.js#Order.recalcular", "o.js", ["Order", "recalcular"], { family: "function-like" })], ["sym:o.js#Order.recalcular"]));
    expect(dato(findings[0]!, "(S) ")).toBe(1);
  });

  it("(S-bis) — la gramática que declara el destino como INTERFAZ lo dice, aunque la interfaz declare firmas", async () => {
    const iface = sym("sym:o.js#Order", "o.js", ["Order"], { nodeType: "interface_declaration" });
    const findings = await run(graphTo(iface, [sym("sym:o.js#Order.total", "o.js", ["Order", "total"], { family: "function-like" })], ["sym:o.js#Order.total"]));
    expect(dato(findings[0]!, "(S-bis)")).toBe(1);
    // (S) cuenta 1 miembro y no ve nada raro; (S-bis) sí: una interfaz no tiene CUERPOS.
    expect(dato(findings[0]!, "(S) ")).toBe(1);
  });

  it("(S-bis) — `shapeNodeType` gana sobre `nodeType`: es la forma para la gramática que no la escribe arriba (Go)", async () => {
    const goIface = sym("sym:o.go#Order", "o.go", ["Order"], { nodeType: "type_spec", shapeNodeType: "interface_type" });
    const findings = await run(graphTo(goIface));
    expect(dato(findings[0]!, "(S-bis)")).toBe(1);
  });

  it("(S-bis) — AUSENTE ES UN `no sé`, NUNCA UN `no`: sin tipo de nodo el hecho contesta 0 sin afirmar que sea una clase", async () => {
    const findings = await run(graphTo(ORDER));
    expect(dato(findings[0]!, "(S-bis)")).toBe(0);
  });

  it("NINGUNO ES COMPUERTA: los cuatro grafos anteriores emiten el MISMO hallazgo, con el mismo título y el mismo `trigger`", async () => {
    const base = await run(graphTo(ORDER));
    const conProtocolo = await run(
      graphTo(ORDER, [
        sym("sym:a.js#TaskA.run", "a.js", ["TaskA", "run"], { family: "function-like" }),
        sym("sym:b.js#TaskB.run", "b.js", ["TaskB", "run"], { family: "function-like" }),
      ]),
    );
    const comoInterfaz = await run(graphTo(sym("sym:o.js#Order", "o.js", ["Order"], { nodeType: "interface_declaration" })));
    for (const otro of [conProtocolo, comoInterfaz]) {
      expect(otro).toHaveLength(1);
      expect(otro[0]!.title).toBe(base[0]!.title);
      expect(otro[0]!.trigger).toEqual(base[0]!.trigger);
    }
  });
});
