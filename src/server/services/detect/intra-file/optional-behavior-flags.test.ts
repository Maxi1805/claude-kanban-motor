import { describe, expect, it } from "vitest";

import { detector, capabilityUnitsOf, MIN_CAPABILITIES, MIN_EMBELLISHED_MEMBERS } from "./optional-behavior-flags.js";
import { DETECTORS } from "../registry.js";
import { runIntraFile } from "../testing.js";

/**
 * Sondas — clase + método CON parámetros (misma nota que
 * `temporary-field.test.ts`/`refused-bequest.test.ts`: un `def` ruby sin
 * paréntesis no expone el campo `parameters`).
 *
 * Las sondas ejercitan clase + constructor + método CON parámetros + `if/else`
 * + lazo + switch: `deriveNodeSets` (`code-grammar.ts`) clasifica SÓLO los
 * tipos de nodo que la sonda contiene, y este detector deriva su conjunto
 * "if-like" de `chainNodes ∩ nestingNodes − switchContainerNodes`. Una sonda
 * sin `if` deja los tres conjuntos vacíos y el detector mudo — encontrado
 * exactamente así al escribir este archivo (bug de la sonda, no del detector;
 * la misma trampa que `lazy-init-repetida.test.ts` documenta para
 * `singleton_method` en ruby).
 */
const JS_PROBE = `
class Probe {
  constructor(seed) { this.seed = seed; }
  run(value) {
    if (value) { return 1; } else { return 2; }
    for (const v of value) { console.log(v); }
    switch (value) { case 1: return 1; default: return 0; }
  }
}
`;

const TS_PROBE = `
class Probe {
  private seed: number = 0;
  constructor(seed: number) { this.seed = seed; }
  run(value: number): number {
    if (value) { return 1; } else { return 2; }
    for (const v of [value]) { console.log(v); }
    switch (value) { case 1: return 1; default: return 0; }
  }
}
`;

const PYTHON_PROBE = `
class Probe:
    def __init__(self, seed):
        self.seed = seed

    def run(self, value):
        if value:
            return 1
        else:
            return 2
        for v in value:
            print(v)
        match value:
            case 1:
                return 1
`;

const RUBY_PROBE = `
class Probe
  def initialize(seed)
    @seed = seed
  end

  def run(value)
    if value
      1
    else
      2
    end
    while value
      break
    end
    case value
    when 1
      1
    else
      0
    end
  end
end
`;

const GO_PROBE = `
package p

type Probe struct{ seed int }

func (p *Probe) Run(value int) int {
	if value > 0 {
		return 1
	} else {
		return 2
	}
	for i := 0; i < value; i++ {
		_ = i
	}
	switch value {
	case 1:
		return 1
	default:
		return 0
	}
}
`;

const JAVA_PROBE = `
class Probe {
  private int seed;
  Probe(int seed) { this.seed = seed; }
  int run(int value) {
    if (value > 0) { return 1; } else { return 2; }
    for (int i = 0; i < value; i++) { }
    switch (value) { case 1: return 1; default: return 0; }
  }
}
`;

const CSHARP_PROBE = `
class Probe {
  private int seed;
  Probe(int seed) { this.seed = seed; }
  int Run(int value) {
    if (value > 0) { return 1; } else { return 2; }
    for (int i = 0; i < value; i++) { }
    switch (value) { case 1: return 1; default: return 0; }
  }
}
`;

const GRAMMARS = {
  javascript: { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE },
  typescript: { wasm: "tree-sitter-typescript.wasm", probe: TS_PROBE },
  python: { wasm: "tree-sitter-python.wasm", probe: PYTHON_PROBE },
  ruby: { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE },
  go: { wasm: "tree-sitter-go.wasm", probe: GO_PROBE },
  java: { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE },
  csharp: { wasm: "tree-sitter-c_sharp.wasm", probe: CSHARP_PROBE },
} as const;

type Lang = keyof typeof GRAMMARS;

function run(language: Lang, source: string) {
  const g = GRAMMARS[language];
  return runIntraFile(detector, { wasm: g.wasm, probe: g.probe, source, language });
}

describe("optional-behavior-flags — contrato del detector", () => {
  it("declara id, kind, scope y sus dos pisos", () => {
    expect(detector.id).toBe("optional-behavior-flags");
    expect(detector.kind).toBe("optional-behavior-flags");
    expect(detector.scope).toBe("intra-file");
    expect(detector.thresholds.capacidadesOpcionales.kind).toBe("piso-declarado");
    expect(detector.thresholds.miembrosEmbellecidos.kind).toBe("piso-declarado");
    expect(MIN_CAPABILITIES).toBe(2);
    expect(MIN_EMBELLISHED_MEMBERS).toBe(2);
  });

  it("está dado de alta en el registro, una sola vez", () => {
    expect(DETECTORS.filter((d) => d.id === "optional-behavior-flags")).toHaveLength(1);
  });

  it("exporta `capabilityUnitsOf` para que la capa de hipótesis re-verifique contra su propio árbol", () => {
    expect(typeof capabilityUnitsOf).toBe("function");
  });
});

/* ── LA FORMA POSITIVA, EN LAS SEIS GRAMÁTICAS CON UNIDAD-TIPO ─────────── */

describe("optional-behavior-flags — la forma completa", () => {
  it("javascript: dos capacidades inyectadas, consultadas en dos operaciones", async () => {
    const findings = await run(
      "javascript",
      `
class Report {
  constructor(rows, withHeader, withTotals) {
    this.rows = rows;
    this.withHeader = withHeader;
    this.withTotals = withTotals;
  }
  render(out) {
    if (this.withHeader) { out.push("head"); }
    out.push(this.rows);
    if (this.withTotals) { out.push("total"); }
  }
  size() {
    let n = this.rows.length;
    if (this.withHeader) { n += 1; }
    return n;
  }
}
`,
    );
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(f.title).toContain("Report");
    expect(f.trigger[0].value).toBe(2);
    expect(f.trigger[1].value).toBe(2);
    // Una ubicación de cabecera + una por capacidad.
    expect(f.locations).toHaveLength(3);
    expect(f.locations[0]!.symbol).toBe("Report");
    expect(f.advice.pattern?.name).toBe("Decorator");
  });

  it("typescript: la misma forma con campos declarados y tipados", async () => {
    const findings = await run(
      "typescript",
      `
class Report {
  private withHeader: boolean;
  private withTotals: boolean;
  constructor(withHeader: boolean, withTotals: boolean) {
    this.withHeader = withHeader;
    this.withTotals = withTotals;
  }
  render(out: string[]): void {
    if (this.withHeader) { out.push("head"); }
    if (this.withTotals) { out.push("total"); }
  }
  describe(out: string[]): void {
    if (this.withHeader) { out.push("h"); }
  }
}
`,
    );
    expect(findings).toHaveLength(1);
  });

  it("python: `self.x` inyectado en `__init__`, consultado en dos métodos", async () => {
    const findings = await run(
      "python",
      `
class Report:
    def __init__(self, with_header, with_totals):
        self.with_header = with_header
        self.with_totals = with_totals

    def render(self, out):
        if self.with_header:
            out.append("head")
        if self.with_totals:
            out.append("total")

    def size(self):
        n = 0
        if self.with_header:
            n += 1
        return n
`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0].value).toBe(2);
  });

  it("ruby: `@x` inyectado en `initialize`, consultado en dos métodos", async () => {
    const findings = await run(
      "ruby",
      `
class Report
  def initialize(with_header, with_totals)
    @with_header = with_header
    @with_totals = with_totals
  end

  def render(out)
    if @with_header
      out << "head"
    end
    if @with_totals
      out << "total"
    end
  end

  def size(n)
    if @with_header
      n += 1
    end
    n
  end
end
`,
    );
    expect(findings).toHaveLength(1);
  });

  it("java: campo desnudo declarado por la clase, sin `this.` en la lectura", async () => {
    const findings = await run(
      "java",
      `
class Report {
  private boolean withHeader;
  private boolean withTotals;
  Report(boolean withHeader, boolean withTotals) {
    this.withHeader = withHeader;
    this.withTotals = withTotals;
  }
  void render(List<String> out) {
    if (withHeader) { out.add("head"); }
    if (withTotals) { out.add("total"); }
  }
  int size(int n) {
    if (withHeader) { n += 1; }
    return n;
  }
}
`,
    );
    expect(findings).toHaveLength(1);
  });

  it("go: el receptor es la unidad-tipo, sin nodo de clase", async () => {
    const findings = await run(
      "go",
      `
package p

type Report struct {
	withHeader bool
	withTotals bool
}

func (r *Report) Configure(withHeader bool, withTotals bool) {
	r.withHeader = withHeader
	r.withTotals = withTotals
}

func (r *Report) Render(out []string) []string {
	if r.withHeader {
		out = append(out, "head")
	}
	if r.withTotals {
		out = append(out, "total")
	}
	return out
}

func (r *Report) Size(n int) int {
	if r.withHeader {
		n = n + 1
	}
	return n
}
`,
    );
    expect(findings).toHaveLength(1);
  });
});

/* ── UNA EXCLUSIÓN POR CONDICIÓN, CADA UNA CON SU INTENCIÓN ────────────── */

describe("optional-behavior-flags — las cuatro condiciones, una exclusión por cada una", () => {
  it("(1) NO dispara si el campo NUNCA se asigna desde un parámetro — es estado interno, no una capacidad elegida", async () => {
    const findings = await run(
      "javascript",
      `
class Session {
  constructor() { this.open = false; this.dirty = false; }
  begin() { this.open = true; }
  write(v) {
    if (this.open) { this.dirty = true; }
    if (this.dirty) { this.flushNeeded = true; }
  }
  close() {
    if (this.open) { this.open = false; }
    if (this.dirty) { this.dirty = false; }
  }
}
`,
    );
    expect(findings).toHaveLength(0);
  });

  it("(2) NO dispara si la guarda COMPARA contra un valor — eso es un discriminante (State/Strategy), no una capa opcional", async () => {
    const findings = await run(
      "javascript",
      `
class Report {
  constructor(mode, level) { this.mode = mode; this.level = level; }
  render(out) {
    if (this.mode === "wide") { out.push("wide"); }
    if (this.level > 3) { out.push("deep"); }
  }
  size(n) {
    if (this.mode === "wide") { n += 1; }
    if (this.level > 3) { n += 1; }
    return n;
  }
}
`,
    );
    expect(findings).toHaveLength(0);
  });

  it("(2 bis) lo AMBIGUO viaja como ambiguo: una guarda con una llamada adentro no se cuenta", async () => {
    const findings = await run(
      "javascript",
      `
class Report {
  constructor(withHeader, withTotals) { this.withHeader = withHeader; this.withTotals = withTotals; }
  render(out) {
    if (this.withHeader.isEnabled()) { out.push("head"); }
    if (this.withTotals.isEnabled()) { out.push("total"); }
  }
  size(n) {
    if (this.withHeader.isEnabled()) { n += 1; }
    return n;
  }
}
`,
    );
    expect(findings).toHaveLength(0);
  });

  it("(3) NO dispara si las guardas viven SÓLO en el constructor — eso es configuración, no embellecimiento", async () => {
    const findings = await run(
      "javascript",
      `
class Report {
  constructor(withHeader, withTotals) {
    this.withHeader = withHeader;
    this.withTotals = withTotals;
    if (this.withHeader) { this.head = "head"; }
    if (this.withTotals) { this.total = "total"; }
  }
  render(out) { out.push(this.head, this.total); }
}
`,
    );
    expect(findings).toHaveLength(0);
  });

  it("(3 bis) NO dispara si las capacidades embellecen UNA sola operación — la respuesta barata ahí es Extract Method", async () => {
    const findings = await run(
      "javascript",
      `
class Report {
  constructor(withHeader, withTotals) { this.withHeader = withHeader; this.withTotals = withTotals; }
  render(out) {
    if (this.withHeader) { out.push("head"); }
    if (this.withTotals) { out.push("total"); }
  }
  size() { return 1; }
}
`,
    );
    expect(findings).toHaveLength(0);
  });

  it("(4) NO dispara con UNA sola capacidad, por más operaciones que atraviese — el patrón no paga", async () => {
    const findings = await run(
      "javascript",
      `
class Report {
  constructor(withHeader) { this.withHeader = withHeader; }
  render(out) { if (this.withHeader) { out.push("head"); } }
  size(n) { if (this.withHeader) { n += 1; } return n; }
  describe(out) { if (this.withHeader) { out.push("h"); } }
}
`,
    );
    expect(findings).toHaveLength(0);
  });
});

/* ── LA TRAMPA: el patrón YA APLICADO ⇒ silencio ───────────────────────── */

describe("optional-behavior-flags — LA TRAMPA (el Decorator ya aplicado)", () => {
  it("se queda CALLADO sobre la fixture canónica de Decorator: un envoltorio no lleva banderas opcionales adentro", async () => {
    const findings = await run(
      "javascript",
      `
class ColorDecorator {
  constructor(shape, color) { this.shape = shape; this.color = color; }
  area() { return this.shape.area(); }
  render() { return this.color + this.shape.render(); }
}
class BorderDecorator {
  constructor(shape, width) { this.shape = shape; this.width = width; }
  area() { return this.shape.area(); }
  render() { return this.shape.render() + this.width; }
}
`,
    );
    expect(findings).toHaveLength(0);
  });
});

/* ── LA NEGACIÓN Y LA CONJUNCIÓN, QUE SÍ SON GUARDAS DE PRESENCIA ──────── */

describe("optional-behavior-flags — negación y conjunción de capacidades propias", () => {
  it("`if (!this.x)` cuenta igual que `if (this.x)`: sigue siendo una guarda de presencia", async () => {
    const findings = await run(
      "javascript",
      `
class Report {
  constructor(quiet, compact) { this.quiet = quiet; this.compact = compact; }
  render(out) {
    if (!this.quiet) { out.push("noise"); }
    if (!this.compact) { out.push("pad"); }
  }
  size(n) {
    if (!this.quiet) { n += 1; }
    return n;
  }
}
`,
    );
    expect(findings).toHaveLength(1);
  });

  it("`if (this.a && this.b)` aporta LAS DOS capacidades: los átomos del árbol lógico son ambos campos propios", async () => {
    const findings = await run(
      "javascript",
      `
class Report {
  constructor(withHeader, withTotals) { this.withHeader = withHeader; this.withTotals = withTotals; }
  render(out) { if (this.withHeader && this.withTotals) { out.push("both"); } }
  size(n) { if (this.withHeader && this.withTotals) { n += 1; } return n; }
}
`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0].value).toBe(2);
  });

  it("una conjunción MIXTA (campo propio y algo que no lo es) no cuenta: la guarda no es de presencia pura", async () => {
    const findings = await run(
      "javascript",
      `
class Report {
  constructor(withHeader, withTotals) { this.withHeader = withHeader; this.withTotals = withTotals; }
  render(out, flag) {
    if (this.withHeader && flag) { out.push("head"); }
    if (this.withTotals && flag) { out.push("total"); }
  }
  size(n, flag) {
    if (this.withHeader && flag) { n += 1; }
    return n;
  }
}
`,
    );
    expect(findings).toHaveLength(0);
  });
});

/* ── SOMBREADO Y ANIDAMIENTO ───────────────────────────────────────────── */

describe("optional-behavior-flags — higiene", () => {
  it("csharp: un parámetro con el mismo nombre que el campo lo TAPA en ese miembro", async () => {
    const findings = await run(
      "csharp",
      `
class Report {
  private bool withHeader;
  private bool withTotals;
  Report(bool withHeader, bool withTotals) { this.withHeader = withHeader; this.withTotals = withTotals; }
  void Render(List<string> out, bool withHeader) {
    if (withHeader) { out.Add("head"); }
    if (withTotals) { out.Add("total"); }
  }
  int Size(int n) {
    if (withTotals) { n += 1; }
    return n;
  }
}
`,
    );
    // `withHeader` queda tapado en `Render`, así que sólo `withTotals` es
    // capacidad: una sola, por debajo del piso.
    expect(findings).toHaveLength(0);
  });

  it("dos unidades-tipo en el mismo archivo producen DOS hallazgos, con anclas distintas", async () => {
    const findings = await run(
      "javascript",
      `
class A {
  constructor(x, y) { this.x = x; this.y = y; }
  p(o) { if (this.x) { o.push(1); } if (this.y) { o.push(2); } }
  q(o) { if (this.x) { o.push(3); } }
}
class B {
  constructor(x, y) { this.x = x; this.y = y; }
  p(o) { if (this.x) { o.push(1); } if (this.y) { o.push(2); } }
  q(o) { if (this.y) { o.push(3); } }
}
`,
    );
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.locations[0]!.symbol).sort()).toEqual(["A", "B"]);
  });
});
