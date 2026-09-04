import { describe, expect, it } from "vitest";

import { detector } from "./temporary-field.js";
import { runIntraFile } from "../testing.js";

/* ────────────────────────────────────────────────────────────────────────
 * Sondas — cada una ejercita clase + método CON parámetros (ver la nota de
 * `refused-bequest.test.ts`: un `def` ruby sin paréntesis no expone campo
 * `parameters` y el tipo caería en `classNodes`).
 * ──────────────────────────────────────────────────────────────────────── */
const JS_PROBE = `
class Probe {
  constructor(seed) { this.seed = seed; }
  run(value) { return value; }
}
`;

const TS_PROBE = `
class Probe {
  private seed: number = 0;
  constructor(seed: number) { this.seed = seed; }
  run(value: number): number { return value; }
}
`;

const PYTHON_PROBE = `
class Probe:
    def __init__(self, seed):
        self.seed = seed

    def run(self, value):
        return value
`;

const RUBY_PROBE = `
class Probe
  def initialize(seed)
    @seed = seed
  end

  def run(value)
    value
  end
end
`;

const GO_PROBE = `
package p

type Probe struct{ seed int }

func (p *Probe) Run(value int) int { return value }
`;

const JAVA_PROBE = `
class Probe {
  private int seed;
  Probe(int seed) { this.seed = seed; }
  int run(int value) { return value; }
}
`;

const CSHARP_PROBE = `
class Probe {
  private int seed;
  Probe(int seed) { this.seed = seed; }
  int Run(int value) { return value; }
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

describe("temporary-field — contrato del detector", () => {
  it("declara id, kind, scope y umbral de presencia", () => {
    expect(detector.id).toBe("temporary-field");
    expect(detector.kind).toBe("temporary-field");
    expect(detector.scope).toBe("intra-file");
    expect(detector.thresholds.ciclosFueraDelConstructor.kind).toBe("presencia");
  });
});

/* ── LA FORMA POSITIVA: se llena y se vacía FUERA del constructor ───────── */

describe("temporary-field — ciclo llenar/vaciar fuera del constructor", () => {
  it("javascript: `this.batch` se llena en un método y se vacía en otro", async () => {
    const findings = await run(
      "javascript",
      `
class Writer {
  constructor(sink) { this.sink = sink; }
  begin() { this.batch = new Batch(); }
  flush() { this.sink.write(this.batch); this.batch = null; }
  size() { return this.batch ? this.batch.length : 0; }
}
`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.title).toContain("batch");
    expect(findings[0]!.trigger[0].value).toBe(1);
    expect(findings[0]!.locations).toHaveLength(2);
  });

  it("typescript: la misma forma con campo declarado y tipado", async () => {
    const findings = await run(
      "typescript",
      `
class Writer {
  private batch: Batch | null = null;
  begin(): void { this.batch = new Batch(); }
  flush(): void { this.batch = null; }
}
`,
    );
    expect(findings).toHaveLength(1);
  });

  it("python: `self.buffer` llenado y puesto en None fuera de `__init__`", async () => {
    const findings = await run(
      "python",
      `
class Writer:
    def __init__(self, sink):
        self.sink = sink

    def begin(self):
        self.buffer = Buffer()

    def flush(self):
        self.sink.write(self.buffer)
        self.buffer = None
`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.title).toContain("buffer");
  });

  it("ruby: `@buffer` llenado y puesto en nil fuera de `initialize`", async () => {
    const findings = await run(
      "ruby",
      `
class Writer
  def initialize(sink)
    @sink = sink
  end

  def begin(batch)
    @buffer = Buffer.new(batch)
  end

  def flush(now)
    @sink.write(@buffer, now)
    @buffer = nil
  end
end
`,
    );
    expect(findings).toHaveLength(1);
  });

  it("go: el campo del receptor puesto en nil en un método y llenado en otro", async () => {
    const findings = await run(
      "go",
      `
package p

type Writer struct {
	buffer *Buffer
}

func (w *Writer) Begin(size int) {
	w.buffer = NewBuffer(size)
}

func (w *Writer) Flush(now int) {
	w.buffer = nil
}
`,
    );
    expect(findings).toHaveLength(1);
  });

  it("java: campo propio escrito DESNUDO (`buffer = null;`, sin `this.`)", async () => {
    const findings = await run(
      "java",
      `
class Writer {
  private Buffer buffer;

  void begin(int size) { buffer = new Buffer(size); }

  void flush(int now) { buffer = null; }
}
`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.title).toContain("buffer");
  });

  it("csharp: mismo idiom desnudo", async () => {
    const findings = await run(
      "csharp",
      `
class Writer {
  private Buffer buffer;

  void Begin(int size) { buffer = new Buffer(size); }

  void Flush(int now) { buffer = null; }
}
`,
    );
    expect(findings).toHaveLength(1);
  });
});

/* ── LO QUE NO DEBE DISPARAR ────────────────────────────────────────────── */

describe("temporary-field — lo que NO es un campo temporal", () => {
  it("un campo inicializado en null en el CONSTRUCTOR y llenado después no dispara", async () => {
    const findings = await run(
      "javascript",
      `
class Writer {
  constructor() { this.batch = null; }
  begin() { this.batch = new Batch(); }
}
`,
    );
    expect(findings).toEqual([]);
  });

  it("memoización perezosa (`||=`) no dispara: nunca se vacía", async () => {
    const findings = await run(
      "ruby",
      `
class Registry
  def children(scope)
    @children ||= Set.new(scope)
  end

  def reset(scope)
    @children = Set.new(scope)
  end
end
`,
    );
    expect(findings).toEqual([]);
  });

  it("un campo que sólo se llena (sin vaciarse) no dispara", async () => {
    const findings = await run(
      "javascript",
      `
class Writer {
  begin() { this.batch = new Batch(); }
  again() { this.batch = new Batch(); }
}
`,
    );
    expect(findings).toEqual([]);
  });

  it("una variable LOCAL puesta en null no es un campo", async () => {
    const findings = await run(
      "javascript",
      `
class Writer {
  run() {
    let batch = new Batch();
    batch = null;
    return batch;
  }
}
`,
    );
    expect(findings).toEqual([]);
  });

  it("java: un parámetro que SOMBREA al campo no cuenta como campo propio", async () => {
    const findings = await run(
      "java",
      `
class Writer {
  private Buffer buffer;

  void take(Buffer buffer) {
    buffer = new Buffer();
    buffer = null;
  }
}
`,
    );
    expect(findings).toEqual([]);
  });

  it("`this.x = this.x` (reasignación de sí mismo) no cuenta como llenado", async () => {
    const findings = await run(
      "javascript",
      `
class Writer {
  keep() { this.batch = this.batch; }
  drop() { this.batch = null; }
}
`,
    );
    expect(findings).toEqual([]);
  });
});

/* ── EVIDENCIA ──────────────────────────────────────────────────────────── */

describe("temporary-field — evidencia", () => {
  it("cuenta los miembros que sólo LEEN el campo y los nombra", async () => {
    const findings = await run(
      "javascript",
      `
class Writer {
  begin() { this.batch = new Batch(); }
  flush() { this.batch = null; }
  size() { return this.batch.length; }
  dump() { return this.batch.toString(); }
}
`,
    );
    expect(findings).toHaveLength(1);
    const readers = findings[0]!.evidence?.find((e) => e.label === "miembros que sólo lo leen");
    expect(readers?.value).toBe(2);
    expect(readers?.note).toBe("dump, size");
  });

  it("las ubicaciones traen el rol (vacía/llena) y el ancla con la clase", async () => {
    const findings = await run(
      "javascript",
      `
class Writer {
  begin() { this.batch = new Batch(); }
  flush() { this.batch = null; }
}
`,
    );
    const roles = findings[0]!.locations.map((l) => l.role);
    expect(roles.some((r) => r.includes("llena"))).toBe(true);
    expect(roles.some((r) => r.includes("vacía"))).toBe(true);
    expect(findings[0]!.locations[0].anchor?.symbolPath[0]).toBe("Writer");
  });

  it("el consejo primario es Extract Class y el patrón sugerido es State", async () => {
    const findings = await run(
      "javascript",
      `
class Writer {
  begin() { this.batch = new Batch(); }
  flush() { this.batch = null; }
}
`,
    );
    expect(findings[0]!.advice.primary.name).toBe("Extract Class");
    expect(findings[0]!.advice.pattern?.name).toBe("State");
  });

  it("dos clases hermanas con el MISMO nombre de campo producen dos hallazgos distintos", async () => {
    const findings = await run(
      "javascript",
      `
class A {
  begin() { this.batch = new Batch(); }
  flush() { this.batch = null; }
}
class B {
  begin() { this.batch = new Batch(); }
  flush() { this.batch = null; }
}
`,
    );
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.locations[0].anchor?.symbolPath[0]).sort()).toEqual(["A", "B"]);
  });
  it("dos campos temporales de la MISMA clase reciben ordinal distinto (ids que no colapsan)", async () => {
    const findings = await run(
      "javascript",
      `
class Writer {
  begin() { this.batch = new Batch(); this.head = new Head(); }
  flush() { this.batch = null; this.head = null; }
}
`,
    );
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.locations[0].anchor?.ordinal).sort()).toEqual([0, 1]);
  });

  it("un solo campo temporal no lleva ordinal", async () => {
    const findings = await run(
      "javascript",
      `
class Writer {
  begin() { this.batch = new Batch(); }
  flush() { this.batch = null; }
}
`,
    );
    expect(findings[0]!.locations[0].anchor?.ordinal).toBeUndefined();
  });
});
