import { describe, expect, it } from "vitest";

import { detector } from "./enumerated-field-dispatch.js";
import { runIntraFile } from "../testing.js";

/* ────────────────────────────────────────────────────────────────────────
 * Sondas — las mismas que `temporary-field.test.ts`, por la misma razón:
 * cada una ejercita clase + método CON parámetros (un `def` ruby sin
 * paréntesis no expone campo `parameters` y el tipo caería en `classNodes`).
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

/** Con un `switch` adentro a propósito: sin él `deriveNodeSets` deja
 *  `switchContainerNodes` vacío y el camino "sujeto de switch" del detector
 *  no se puede ejercitar (las sondas de producción de `code-analyzer.ts` sí
 *  traen uno — verificado antes de escribir este test). */
const CSHARP_PROBE = `
class Probe {
  private int seed;
  Probe(int seed) { this.seed = seed; }
  int Run(int value) { switch (value) { case 1: return 1; default: return 0; } }
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

/* ════════════════════════════════════════════════════════════════════════
 * ESTE DETECTOR ESTÁ DESREGISTRADO A PROPÓSITO — ver el docstring de
 * `enumerated-field-dispatch.ts`. Se midió sobre las dos poblaciones
 * completas (28 hallazgos, 20 recomendaciones, las 28 juzgadas a mano, 1
 * verdadera = 5,0 % [0,9 %, 23,6 %]) y R1 lo apaga. Estos tests corren
 * `detector.run` directamente, así que siguen siendo la red que congela lo
 * que la construcción destapó — sobre todo las seis trampas de gramática de
 * más abajo, que valen para cualquier detector que mire asignaciones.
 * ════════════════════════════════════════════════════════════════════════ */
describe("enumerated-field-dispatch — contrato del detector", () => {
  it("está DESREGISTRADO por R1 (medido 1/20 = 5,0 %) — el catálogo no lo emite", async () => {
    const { DETECTORS } = await import("../registry.js");
    expect(DETECTORS.map((d) => d.id)).not.toContain("enumerated-field-dispatch");
  });

  it("declara id, kind, scope y sus dos pisos", () => {
    expect(detector.id).toBe("enumerated-field-dispatch");
    expect(detector.kind).toBe("enumerated-field-dispatch");
    expect(detector.scope).toBe("intra-file");
    expect(detector.thresholds.miembrosQueDeciden.kind).toBe("piso-declarado");
    expect(detector.thresholds.valoresDistintos.kind).toBe("piso-declarado");
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * LA FORMA COMPLETA — las tres condiciones juntas, en las 7 gramáticas
 * ════════════════════════════════════════════════════════════════════════ */

const FORMA_JS = `
class Door {
  constructor() { this.mode = "closed"; }
  open() { if (this.mode === "closed") { this.mode = "open"; } }
  close() { if (this.mode === "open") { this.mode = "closed"; } }
  describe(prefix) { if (this.mode === "open") { return prefix; } return null; }
}
`;

const FORMA_TS = `
class Door {
  private mode: string = "closed";
  open(): void { if (this.mode === "closed") { this.mode = "open"; } }
  close(): void { if (this.mode === "open") { this.mode = "closed"; } }
  describe(prefix: string): string | null { if (this.mode === "open") { return prefix; } return null; }
}
`;

const FORMA_PY = `
class Door:
    def __init__(self, seed):
        self.mode = "closed"

    def open(self, value):
        if self.mode == "closed":
            self.mode = "open"

    def close(self, value):
        if self.mode == "open":
            self.mode = "closed"

    def describe(self, prefix):
        if self.mode == "open":
            return prefix
        return None
`;

const FORMA_RB = `
class Door
  def initialize(seed)
    @mode = :closed
  end

  def open(value)
    if @mode == :closed
      @mode = :open
    end
  end

  def close(value)
    if @mode == :open
      @mode = :closed
    end
  end

  def describe(prefix)
    if @mode == :open
      prefix
    end
  end
end
`;

const FORMA_GO = `
package p

type Door struct{ mode string }

func (d *Door) Open(value int) {
	if d.mode == "closed" {
		d.mode = "open"
	}
}

func (d *Door) Close(value int) {
	if d.mode == "open" {
		d.mode = "closed"
	}
}

func (d *Door) Describe(prefix string) string {
	if d.mode == "open" {
		return prefix
	}
	return ""
}
`;

const FORMA_JAVA = `
class Door {
  private String mode = "closed";
  void open(int value) { if (mode == "closed") { mode = "open"; } }
  void close(int value) { if (mode == "open") { mode = "closed"; } }
  String describe(String prefix) { if (mode == "open") { return prefix; } return null; }
}
`;

const FORMA_CS = `
class Door {
  private string mode;
  void Open(int value) { if (mode == "closed") { mode = "open"; } }
  void Close(int value) { if (mode == "open") { mode = "closed"; } }
  string Describe(string prefix) { if (mode == "open") { return prefix; } return null; }
}
`;

describe("enumerated-field-dispatch — la forma completa dispara en las 7 gramáticas", () => {
  const casos: [Lang, string][] = [
    ["javascript", FORMA_JS],
    ["typescript", FORMA_TS],
    ["python", FORMA_PY],
    ["ruby", FORMA_RB],
    ["go", FORMA_GO],
    ["java", FORMA_JAVA],
    ["csharp", FORMA_CS],
  ];

  for (const [language, source] of casos) {
    it(`${language}: un campo con 2 valores constantes, reasignado fuera del constructor y leído en condición desde 3 miembros`, async () => {
      const findings = await run(language, source);
      expect(findings).toHaveLength(1);
      const f = findings[0]!;
      expect(f.title).toContain("mode");
      // trigger[0] = miembros que ramifican; trigger[1] = valores distintos
      expect(f.trigger[0]!.value).toBeGreaterThanOrEqual(3);
      expect(f.trigger[1]!.value).toBe(2);
      expect(f.advice.pattern?.name).toBe("State");
    });
  }
});

/* ════════════════════════════════════════════════════════════════════════
 * LAS EXCLUSIONES — una por familia de falso medida sobre la salida completa
 * (AC1 §6.2: caché perezosa, cursor de iterador, acumulador), más las dos
 * que separan State de Strategy y de una bandera.
 * ════════════════════════════════════════════════════════════════════════ */

describe("enumerated-field-dispatch — qué NO es", () => {
  it("una caché perezosa no dispara: el valor sale de una llamada, el alfabeto no está cerrado", async () => {
    const findings = await run(
      "javascript",
      `
class Cache {
  constructor() { this.value = null; }
  get(key) { if (this.value === null) { this.value = this.compute(key); } return this.value; }
  reset(key) { if (this.value !== null) { this.value = null; } }
  compute(key) { return key; }
}
`,
    );
    expect(findings).toHaveLength(0);
  });

  it("un cursor no dispara: el valor es una variable local", async () => {
    const findings = await run(
      "javascript",
      `
class Cursor {
  constructor() { this.current = null; }
  advance(list) { const next = list.shift(); if (this.current === null) { this.current = next; } }
  remove(list) { if (this.current !== null) { this.current = null; } }
}
`,
    );
    expect(findings).toHaveLength(0);
  });

  it("un acumulador no dispara: el valor es una construcción", async () => {
    const findings = await run(
      "javascript",
      `
class Acc {
  constructor() { this.items = []; }
  add(x) { if (this.items === null) { this.items = []; } this.push(x); }
  reset(x) { if (this.items !== null) { this.items = []; } }
  push(x) { return x; }
}
`,
    );
    expect(findings).toHaveLength(0);
  });

  it("un valor de configuración fijado sólo en el constructor no dispara (eso es Strategy, no State)", async () => {
    const findings = await run(
      "javascript",
      `
class Fixed {
  constructor(flag) { this.mode = flag ? "a" : "b"; }
  run(x) { if (this.mode === "a") { return x; } return null; }
  other(x) { if (this.mode === "b") { return x; } return null; }
}
`,
    );
    expect(findings).toHaveLength(0);
  });

  it("una bandera con un solo valor constante no dispara: sin dos valores no hay alternativa", async () => {
    const findings = await run(
      "javascript",
      `
class Once {
  run(x) { if (this.done) { return null; } this.done = true; return x; }
  other(x) { if (this.done) { return x; } return null; }
}
`,
    );
    // Un único valor asignado (`true`): se enciende y no se apaga. No hay alfabeto.
    expect(findings).toHaveLength(0);
  });

  it("DOCUMENTA UNA DECISIÓN, no un defecto: una bandera de DOS valores SÍ dispara", async () => {
    // El piso `valoresDistintos` es 2 y está fijado ANTES de medir: por debajo
    // de 2 la forma no existe (una inicialización no es una alternancia), y 2
    // es el mínimo en el que hay una alternativa que elegir. Un booleano
    // encendido y apagado cumple la forma entera, así que entra — y la
    // medición de la ola reporta la precisión POR ESTRATO (|valores| = 2
    // contra |valores| >= 3) en vez de esconder el caso detrás de un umbral
    // elegido después de ver el resultado.
    const findings = await run(
      "javascript",
      `
class Toggle {
  run(x) { if (this.on === false) { this.on = true; } return x; }
  stop(x) { if (this.on === true) { this.on = false; } return x; }
}
`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[1]!.value).toBe(2);
  });

  it("un campo decidido en UN solo miembro no dispara: no hay dispersión que resolver", async () => {
    const findings = await run(
      "javascript",
      `
class Solo {
  constructor() { this.mode = "a"; }
  run(x) { if (this.mode === "a") { this.mode = "b"; return x; } this.mode = "a"; return null; }
  unrelated(x) { return x; }
}
`,
    );
    expect(findings).toHaveLength(0);
  });

  it("un parámetro homónimo no cuenta como campo propio (regla de sombreado)", async () => {
    const findings = await run(
      "java",
      `
class Shadow {
  private String mode;
  void a(String mode) { if (mode == "x") { mode = "y"; } }
  void b(String mode) { if (mode == "y") { mode = "x"; } }
}
`,
    );
    expect(findings).toHaveLength(0);
  });

  it("leer el campo en el CUERPO de una rama no es decidir por él", async () => {
    const findings = await run(
      "javascript",
      `
class Body {
  constructor() { this.mode = "a"; }
  run(flag) { if (flag) { this.mode = "b"; return this.mode; } return null; }
  other(flag) { if (flag) { this.mode = "a"; return this.mode; } return null; }
}
`,
    );
    expect(findings).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * LAS CUATRO TRAMPAS DE GRAMÁTICA, cada una un FALSO (o un mudo) MEDIDO
 * sobre el corpus mientras se escribía este detector. Cada test nombra la
 * forma exacta que lo produjo.
 * ════════════════════════════════════════════════════════════════════════ */

describe("enumerated-field-dispatch — trampas de gramática, medidas sobre el corpus", () => {
  it("C#: `+=` NO fija un valor del alfabeto — su operador es un HIJO NOMBRADO (`assignment_operator`), no un campo `operator`", async () => {
    // Falso medido: un contador de buffer (`_charsUsed = count` / `_charsUsed +=
    // charsRead`) entraba como alfabeto cerrado porque el `+=` se leía como `=`.
    const findings = await run(
      "csharp",
      `
class Buf {
  private int used;
  void Shift(int n) { if (used > 0) { used = 0; } }
  void Fill(int n) { if (used > 0) { used += n; } }
}
`,
    );
    expect(findings).toHaveLength(0);
  });

  it("C#: una variable local declarada con `int x = …` NO cuenta como constante — su `variable_declarator` no expone campo `name`", async () => {
    const findings = await run(
      "csharp",
      `
class Buf {
  private int used;
  void A(int n) { int count = n - 1; if (used > 0) { used = count; } }
  void B(int n) { int other = n + 1; if (used > 0) { used = other; } }
}
`,
    );
    expect(findings).toHaveLength(0);
  });

  it("Go: una variable declarada con `:=` NO cuenta como constante (`short_var_declaration`)", async () => {
    const findings = await run(
      "go",
      `
package p

type Box struct{ max int }

func (b *Box) Add(n int) {
	nameLen := n + 1
	if b.max < nameLen {
		b.max = nameLen
	}
}

func (b *Box) Remove(n int) {
	other := n - 1
	if b.max > 0 {
		b.max = other
	}
}
`,
    );
    expect(findings).toHaveLength(0);
  });

  it("Go: un CONTADOR con `++`/`--` no dispara aunque también reciba constantes — el incremento no es una asignación en ninguna gramática", async () => {
    const findings = await run(
      "go",
      `
package p

type Tree struct{ peekCount int }

func (t *Tree) Next() int {
	if t.peekCount > 0 {
		t.peekCount--
	}
	return t.peekCount
}

func (t *Tree) Backup2() {
	t.peekCount = 2
}

func (t *Tree) Peek() int {
	if t.peekCount > 0 {
		return t.peekCount
	}
	t.peekCount = 1
	return 0
}
`,
    );
    expect(findings).toHaveLength(0);
  });

  it("Python: la asignación ANOTADA (`self.x: bool = False`) SÍ aporta su valor — el `:` de la anotación no es el operador", async () => {
    // Mudo medido: leyendo el primer token anónimo se tomaba `:` como operador
    // y toda inicialización tipada quedaba fuera del alfabeto.
    const findings = await run(
      "python",
      `
class Bar:
    def __init__(self, n):
        self.done: bool = False

    def step(self, n):
        if not self.done:
            self.done = True

    def show(self, n):
        if self.done:
            return n
        return None
`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[1]!.value).toBe(2);
  });

  it("una condicional entre DOS constantes aporta las dos al alfabeto (`campo = bandera ? A : B`)", async () => {
    // Mudo medido: el ejemplo canónico del corpus asigna su campo de estado con
    // un ternario en uno de sus sitios, y tratarlo como valor calculado borraba
    // la máquina de estados entera.
    const findings = await run(
      "javascript",
      `
class Machine {
  start(flag) { if (this.phase === "idle") { this.phase = flag ? "fast" : "slow"; } }
  stop() { if (this.phase === "fast") { this.phase = "idle"; } }
}
`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[1]!.value).toBe(3);
  });

  it("una condicional con UNA rama calculada no aporta nada y rompe el alfabeto", async () => {
    const findings = await run(
      "javascript",
      `
class Machine {
  start(flag) { if (this.phase === "idle") { this.phase = flag ? this.compute() : "slow"; } }
  stop() { if (this.phase === "slow") { this.phase = "idle"; } }
  compute() { return "x"; }
}
`,
    );
    expect(findings).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════
 * EL DISCRIMINANTE DE SWITCH — la otra forma de "decidir según el campo"
 * ════════════════════════════════════════════════════════════════════════ */

describe("enumerated-field-dispatch — el sujeto de un switch cuenta como decisión", () => {
  it("csharp: switch sobre un campo desnudo declarado, reasignado a constantes de enum", async () => {
    const findings = await run(
      "csharp",
      `
class Reader {
  private State _state;
  void Start(int n) { switch (_state) { case State.Idle: _state = State.Busy; break; } }
  void Stop(int n) { switch (_state) { case State.Busy: _state = State.Idle; break; } }
}
`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.title).toContain("_state");
    expect(findings[0]!.trigger[1]!.value).toBe(2);
  });
});
