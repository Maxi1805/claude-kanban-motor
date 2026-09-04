import { describe, expect, it } from "vitest";

import { dataClassCandidates, detector } from "./data-class.js";
import { nodeSetsFor, parseRoot, runIntraFile } from "../testing.js";
import type { FileUnit } from "../types.js";

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

async function unitOf(language: Lang, source: string): Promise<FileUnit> {
  const g = GRAMMARS[language];
  const sets = await nodeSetsFor(g.wasm, g.probe);
  const root = await parseRoot(g.wasm, source);
  return { path: `fixture.${language}`, language, lines: root.endPosition.row + 1, root, sets, functions: [] };
}

describe("data-class — contrato del detector", () => {
  it("declara id, kind, scope, umbral y presupuesto", () => {
    expect(detector.id).toBe("data-class");
    expect(detector.kind).toBe("data-class");
    expect(detector.scope).toBe("intra-file");
    expect(detector.needs).toEqual([]);
    expect(detector.thresholds.camposExpuestos).toBeDefined();
    expect(detector.maxFindings).toBeDefined();
  });
});

describe("data-class — la forma que dispara", () => {
  it("java: tres campos con getter y nada más", async () => {
    const found = await run("java", `
class Point {
  private int x;
  private int y;
  private int z;
  public int getX() { return x; }
  public int getY() { return y; }
  public int getZ() { return z; }
}
`);
    expect(found).toHaveLength(1);
    expect(found[0]!.trigger[0]!.value).toBe(3);
  });

  it("csharp: propiedades automáticas, que traen su accesor puesto", async () => {
    const found = await run("csharp", `
class Point {
  public int X { get; set; }
  public int Y { get; set; }
  public int Z { get; set; }
}
`);
    expect(found).toHaveLength(1);
  });

  it("ruby: el macro de accesores cuenta como accesor", async () => {
    const found = await run("ruby", `
class Point
  attr_accessor :x, :y, :z

  def initialize(x, y, z)
    @x = x
    @y = y
    @z = z
  end
end
`);
    expect(found).toHaveLength(1);
  });

  it("go: los métodos viven AFUERA del tipo y se atribuyen por el receptor", async () => {
    const found = await run("go", `
package p

type Point struct {
	x int
	y int
	z int
}

func (p Point) X() int { return p.x }
func (p Point) Y() int { return p.y }
func (p Point) Z() int { return p.z }
`);
    expect(found).toHaveLength(1);
    expect(found[0]!.locations[0]!.symbol).toBe("Point");
  });

  it("javascript: campos puestos en el constructor, expuestos por get/set", async () => {
    const found = await run("javascript", `
class Point {
  constructor(x, y, z) { this.x = x; this.y = y; this.z = z; }
  get X() { return this.x; }
  get Y() { return this.y; }
  get Z() { return this.z; }
}
`);
    expect(found).toHaveLength(1);
  });

  it("python: getters que sólo devuelven el atributo", async () => {
    const found = await run("python", `
class Point:
    def __init__(self, x, y, z):
        self.x = x
        self.y = y
        self.z = z

    def get_x(self):
        return self.x

    def get_y(self):
        return self.y

    def get_z(self):
        return self.z
`);
    expect(found).toHaveLength(1);
  });
});

describe("data-class — lo que NO dispara", () => {
  it("UN solo miembro con comportamiento apaga la clase entera", async () => {
    const found = await run("java", `
class Point {
  private int x;
  private int y;
  private int z;
  public int getX() { return x; }
  public int getY() { return y; }
  public int getZ() { return z; }
  public double norm() { return Math.sqrt(x * x + y * y + z * z); }
}
`);
    expect(found).toEqual([]);
  });

  it("un REGISTRO sin un solo accesor no es este olor: es un registro", async () => {
    const found = await run("go", `
package p

type Point struct {
	X int
	Y int
	Z int
}
`);
    expect(found).toEqual([]);
  });

  it("un `record` no es una clase: está declarado como datos a propósito", async () => {
    const found = await run("java", `
record Point(int x, int y, int z) {}
`);
    expect(found).toEqual([]);
  });

  it("una interfaz tampoco", async () => {
    const found = await run("java", `
interface Point {
  int getX();
  int getY();
  int getZ();
}
`);
    expect(found).toEqual([]);
  });

  it("una clase ANOTADA declara que algo de afuera la lee o la escribe", async () => {
    const found = await run("java", `
@Entity
class Point {
  private int x;
  private int y;
  private int z;
  public int getX() { return x; }
  public int getY() { return y; }
  public int getZ() { return z; }
}
`);
    expect(found).toEqual([]);
  });

  it("una unidad-tipo PARCIAL tiene la otra mitad en un archivo que este detector no ve", async () => {
    const found = await run("csharp", `
partial class Point {
  public int X { get; set; }
  public int Y { get; set; }
  public int Z { get; set; }
}
`);
    expect(found).toEqual([]);
  });

  it("un archivo GENERADO va a volver a nacer igual en el próximo build", async () => {
    const found = await run("go", `
// Code generated by protoc-gen-go. DO NOT EDIT.

package p

type Point struct {
	x int
	y int
	z int
}

func (p Point) X() int { return p.x }
func (p Point) Y() int { return p.y }
func (p Point) Z() int { return p.z }
`);
    expect(found).toEqual([]);
  });

  it("dos campos no alcanzan: eso es un envoltorio de valor", async () => {
    const found = await run("java", `
class Pair {
  private int a;
  private int b;
  public int getA() { return a; }
  public int getB() { return b; }
}
`);
    expect(found).toEqual([]);
  });
});

describe("data-class — `dataClassCandidates` mide con y sin compuertas", () => {
  it("`gates: false` devuelve también lo que una compuerta descartaría", async () => {
    const file = await unitOf("java", `
@Entity
class Point {
  private int x;
  private int y;
  private int z;
  public int getX() { return x; }
  public int getY() { return y; }
  public int getZ() { return z; }
}
`);
    expect(dataClassCandidates(file, 3, true)).toHaveLength(0);
    const sinCompuertas = dataClassCandidates(file, 3, false);
    expect(sinCompuertas).toHaveLength(1);
    expect(sinCompuertas[0]!.annotated).toBe(true);
  });
});
