import { describe, expect, it } from "vitest";

import { commentedOutBlocks, detector } from "./commented-out-code.js";
import { runIntraFile } from "../testing.js";

/* ────────────────────────────────────────────────────────────────────────
 * Sondas — cada una ejercita clase + método CON parámetros (misma nota que
 * `temporary-field.test.ts`: un `def` ruby sin paréntesis no expone campo
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

describe("commented-out-code — contrato del detector", () => {
  it("declara id, kind, scope, umbral y presupuesto", () => {
    expect(detector.id).toBe("commented-out-code");
    expect(detector.kind).toBe("commented-out-code");
    expect(detector.scope).toBe("intra-file");
    expect(detector.needs).toEqual([]);
    expect(detector.thresholds.lineasDeCodigo).toBeDefined();
    expect(detector.maxFindings).toBeDefined();
  });

  it("el hallazgo trae el remedio en el propio advice: no necesita una hipótesis colgada", async () => {
    const found = await run("javascript", `
function f() {
  // const a = compute(1);
  // const b = compute(2);
  return 0;
}
`);
    expect(found).toHaveLength(1);
    expect(found[0]!.advice.primary.kind).toBe("refactorizacion");
    expect(found[0]!.advice.pattern).toBeUndefined();
    expect(found[0]!.trigger[0]!.value).toBe(2);
  });
});

describe("commented-out-code — la forma que dispara, en los seis lenguajes", () => {
  it("javascript: dos sentencias apagadas seguidas", async () => {
    const found = await run("javascript", `
function f() {
  // const a = compute(1);
  // send(a);
  return 1;
}
`);
    expect(found).toHaveLength(1);
    expect(found[0]!.locations[0]!.startLine).toBe(3);
    expect(found[0]!.locations[0]!.endLine).toBe(4);
  });

  it("typescript: un bloque con apertura, cuerpo y cierre", async () => {
    const found = await run("typescript", `
function f(): number {
  // if (ready) {
  //   emit(payload);
  // }
  return 1;
}
`);
    expect(found).toHaveLength(1);
    expect(found[0]!.trigger[0]!.value).toBe(3);
  });

  it("python: asignaciones apagadas con almohadilla", async () => {
    const found = await run("python", `
def f():
    # dialect.favor_returning = True
    # dialect.insert_null_pk = True
    return 1
`);
    expect(found).toHaveLength(1);
  });

  it("ruby: llamadas apagadas con almohadilla", async () => {
    const found = await run("ruby", `
def f
  # logger.debug(payload)
  # notifier.notify(payload)
  1
end
`);
    expect(found).toHaveLength(1);
  });

  it("go: asignación y llamada apagadas", async () => {
    const found = await run("go", `
package p

func f() int {
	// seen := map[string]int{}
	// fmt.Println(seen)
	return 1
}
`);
    expect(found).toHaveLength(1);
  });

  it("java: un bloque /* */ que apaga un try/catch", async () => {
    const found = await run("java", `
class C {
  void f() {
    /*
    try {
      run(1);
    } catch (Exception e) {
    }
    */
  }
}
`);
    expect(found).toHaveLength(1);
  });

  it("csharp: campos apagados", async () => {
    const found = await run("csharp", `
class C {
  //public List<Tag> Tags;
  //public List<File> Files;
  public int Count;
}
`);
    expect(found).toHaveLength(1);
  });
});

describe("commented-out-code — lo que NO dispara", () => {
  it("una sola fila apagada no alcanza: es tan probablemente una nota", async () => {
    const found = await run("javascript", `
function f() {
  // send(payload);
  return 1;
}
`);
    expect(found).toEqual([]);
  });

  it("un comentario al final de una línea de código no participa", async () => {
    const found = await run("javascript", `
function f() {
  const a = 1; // send(a);
  const b = 2; // send(b);
  return a + b;
}
`);
    expect(found).toEqual([]);
  });

  it("UNA sola fila de prosa mata el bloque entero, aunque las otras sean sentencias", async () => {
    const found = await run("javascript", `
function f() {
  // The old implementation used to look like this instead:
  // const a = compute(1);
  // send(a);
  return 1;
}
`);
    expect(found).toEqual([]);
  });

  it("un docblock con ejemplo de uso no es código apagado", async () => {
    const found = await run("javascript", `
/**
 * doIt(1);
 * doIt(2);
 */
function doIt(n) { return n; }
`);
    expect(found).toEqual([]);
  });

  it("un bloque en ESTILO DOCUMENTACIÓN (filas con asterisco) es un ejemplo, no código apagado", async () => {
    const found = await run("javascript", `
function f() {
  /*
   * var {a} = foo;
   * const {b} = bar;
   */
  return 1;
}
`);
    expect(found).toEqual([]);
  });

  it("un rótulo seguido de firmas es documentación de uso", async () => {
    const found = await run("javascript", `
// Usage:
//    buffer.fill(number)
//    buffer.fill(buffer)
const x = 1;
`);
    expect(found).toEqual([]);
  });

  it("una frase que termina en punto y coma no es una sentencia", async () => {
    const found = await run("ruby", `
# Exchange Online rejects proxy addresses in the SASL user field;
# it must match the token UPN instead of the alias;
def f
  1
end
`);
    expect(found).toEqual([]);
  });

  it("tipografía de prosa (flechas, comparadores) veta el bloque", async () => {
    const found = await run("javascript", `
// dayFirst=false → month first
// dayFirst=true → day first
const x = 1;
`);
    expect(found).toEqual([]);
  });

  it("prosa con paréntesis pero sin llamada real no cuenta como sentencia", async () => {
    const found = await run("python", `
# DEFAULT ('value' | CURRENT_TIMESTAMP)
# STORAGE (DISK|MEMORY)
x = 1
`);
    expect(found).toEqual([]);
  });

  it("una fila con dos asignaciones y sin terminador es una tabla, no una sentencia", async () => {
    const found = await run("javascript", `
function f() {
  // text = "small", query = "mall", not complete
  // text = "small", query = "smal", complete
  return 1;
}
`);
    expect(found).toEqual([]);
  });

  it("un encabezado de licencia no dispara", async () => {
    const found = await run("java", `
/*
 * Copyright 2020 The Authors.
 * Licensed under the Apache License, Version 2.0.
 */
class C { int f() { return 1; } }
`);
    expect(found).toEqual([]);
  });
});

describe("commented-out-code — `commentedOutBlocks` es la unidad medible", () => {
  it("acepta el piso como parámetro, así que la calibración no toca el detector", async () => {
    const g = GRAMMARS.javascript;
    const { nodeSetsFor, parseRoot, fileUnitFrom } = await import("../testing.js");
    const sets = await nodeSetsFor(g.wasm, g.probe);
    const root = await parseRoot(g.wasm, `
function f() {
  // send(payload);
  return 1;
}
`);
    const file = fileUnitFrom(root, sets, "javascript");
    expect(commentedOutBlocks(file, 1)).toHaveLength(1);
    expect(commentedOutBlocks(file, 2)).toHaveLength(0);
  });
});
