import { describe, expect, it } from "vitest";

import { computeLazyInitRepetidaFindings, detector } from "./lazy-init-repetida.js";
import { fileUnitFrom, nodeSetsFor, parseRoot, runIntraFile, testContext, type RunFixtureOptions } from "../testing.js";
import type { RawFinding } from "../types.js";

/* ────────────────────────────────────────────────────────────────────────
 * Sondas — una clase + un método con receptor Go, suficiente para que
 * `deriveNodeSets` clasifique `classNodes`/`functionNodes` en cada gramática.
 * ──────────────────────────────────────────────────────────────────────── */
const JS_PROBE = "class Probe { constructor() { this.x = 1; } method(a) { return a; } }\n";
const PYTHON_PROBE = "class Probe:\n    def __init__(self):\n        self.x = 1\n    def method(self, a):\n        return a\n";
const RUBY_PROBE = "class Probe\n  def initialize\n    @x = 1\n  end\n  def method(a)\n    a\n  end\nend\n";
/** Igual que `RUBY_PROBE` más un método de CLASE (`def self.x`, nodo
 *  `singleton_method` — un tipo de nodo DISTINTO de `method` en esta
 *  gramática) — necesaria para el caso real de `Jekyll::Plugin`, que declara
 *  `def self.catch_inheritance`/`def self.descendants`. Sin esto,
 *  `deriveNodeSets` (que deriva `functionNodes` de LO QUE LA SONDA
 *  ejercita, ver `code-grammar.ts`) nunca ve `singleton_method` y el walker
 *  de este detector no reconoce esos métodos como miembros en absoluto —
 *  encontrado exactamente así al escribir este test (grupo vacío, no un
 *  bug del detector: un bug de la sonda).*/
const RUBY_PROBE_WITH_SELF =
  "class Probe\n  def self.build(a)\n    @x = a\n  end\n  def initialize\n    @x = 1\n  end\n  def method(a)\n    a\n  end\nend\n";
const GO_PROBE = "package p\ntype T struct{ x int }\nfunc (t *T) Method(a int) int {\n\treturn a\n}\nfunc NewT() *T {\n\treturn &T{x: 1}\n}\n";

/**
 * REACTIVADO (frente de precisión de esta ola) — ver el docstring de
 * cabecera de `lazy-init-repetida.ts`. `detector.run` YA NO devuelve `[]`
 * incondicionalmente: llama a `computeLazyInitRepetidaFindings` con el
 * criterio ARREGLADO (exige `isGuarded`, no cualquier `isConstruction`). Los
 * tests de abajo ejercitan `computeLazyInitRepetidaFindings` directamente
 * (misma lógica que `detector.run` invoca) salvo el bloque final
 * "REACTIVADO: detector.run", que confirma que el objeto REGISTRADO —lo
 * único que `detect/registry.ts` llama en producción— coincide.
 */
async function runComputeDirect(options: RunFixtureOptions): Promise<readonly RawFinding[]> {
  const sets = await nodeSetsFor(options.wasm, options.probe, options.extraClone, options.functionExclusions);
  const root = await parseRoot(options.wasm, options.source);
  const file = fileUnitFrom(root, sets, options.language, options);
  return computeLazyInitRepetidaFindings(file, testContext(detector, options.language, options.capabilities));
}

describe("lazy-init-repetida (computeLazyInitRepetidaFindings)", () => {
  it("TypeScript: guarda de inicialización perezosa REAL (`if (!this.x) {...}`) repetida en 2 métodos ⇒ 1 hallazgo, 2 sitios", async () => {
    const source = `
class ReportBuilder {
  buildSummary() {
    if (!this.engine) { this.engine = new HeavyEngine(); }
    return this.engine.summarize();
  }
  buildDetail() {
    if (!this.engine) { this.engine = new HeavyEngine(); }
    return this.engine.detail();
  }
}
`;
    const findings = await runComputeDirect({ wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(2);
    expect(findings[0]!.locations.map((l) => l.symbol)).toEqual(["buildSummary", "buildDetail"]);
    expect(findings[0]!.title).toContain("guarda de inicialización perezosa");
  });

  it("TypeScript: forma `||=` (operador compuesto, sin `if` envolvente) repetida en 2 métodos ⇒ 1 hallazgo", async () => {
    const source = `
class Cache {
  read() {
    this.store ||= new Map();
    return this.store.get("a");
  }
  write(v) {
    this.store ||= new Map();
    this.store.set("a", v);
  }
}
`;
    const findings = await runComputeDirect({ wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(2);
  });

  it("ARREGLO — TypeScript: colaborador construido UNA vez SIN guarda en el constructor y reenviado desde 2 métodos ⇒ SIN hallazgo (0% de precisión medido para esta forma, Ola D: 28 juzgados, 0 verdaderos)", async () => {
    const source = `
class ShapeProxy {
  constructor() {
    this.real = new RealShape();
  }
  area() {
    return this.real.area();
  }
  paint(color) {
    console.log("painting");
    this.real.paint(color);
  }
}
`;
    const findings = await runComputeDirect({ wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source });
    expect(findings).toHaveLength(0);
  });

  it("ARREGLO — Python: misma forma general SIN guarda (`__init__` construye, 2 métodos reenvían) ⇒ SIN hallazgo", async () => {
    const source = `
class ShapeProxy:
    def __init__(self):
        self.real = RealShape()

    def area(self):
        return self.real.area()

    def paint(self, color):
        return self.real.paint(color)
`;
    const findings = await runComputeDirect({ wasm: "tree-sitter-python.wasm", probe: PYTHON_PROBE, language: "python", source });
    expect(findings).toHaveLength(0);
  });

  it("Python: guarda real (`if self.x is None: self.x = X()`) repetida en 2 métodos ⇒ 1 hallazgo", async () => {
    const source = `
class ReportBuilder:
    def build_summary(self):
        if self.engine is None:
            self.engine = HeavyEngine()
        return self.engine.summarize()

    def build_detail(self):
        if self.engine is None:
            self.engine = HeavyEngine()
        return self.engine.detail()
`;
    const findings = await runComputeDirect({ wasm: "tree-sitter-python.wasm", probe: PYTHON_PROBE, language: "python", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(2);
  });

  it("ARREGLO — Ruby: `@real` construido SIN guarda en `initialize`, reenviado desde 2 métodos ⇒ SIN hallazgo", async () => {
    const source = `
class ShapeProxy
  def initialize
    @real = RealShape.new
  end

  def area
    @real.area
  end

  def paint(color)
    @real.paint(color)
  end
end
`;
    const findings = await runComputeDirect({ wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source });
    expect(findings).toHaveLength(0);
  });

  it(
    "Ruby, CASO REAL (corpus/jekyll, lib/jekyll/plugin.rb): `(@children ||= Set.new)` repetido de forma independiente en `catch_inheritance` y `descendants` ⇒ 1 hallazgo — el ÚNICO grupo con guarda repetida real encontrado en 337 grupos de jekyll (measure-proxy-real-guards.mts)",
    async () => {
      const source = `
class Plugin
  def self.catch_inheritance(const)
    const.define_singleton_method :inherited do |const_|
      (@children ||= Set.new).add const_
      yield const_ if block_given?
    end
  end

  def self.descendants
    @children ||= Set.new
    out = @children.map(&:descendants)
    out << self unless superclass == Plugin
    Set.new(out).flatten
  end
end
`;
      const findings = await runComputeDirect({ wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE_WITH_SELF, language: "ruby", source });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.locations).toHaveLength(2);
      expect(findings[0]!.locations.map((l) => l.symbol)).toEqual(["catch_inheritance", "descendants"]);
    },
  );

  it("ARREGLO — Go: struct sin clase, constructor libre (`NewShapeProxy`, sin receptor, literal de composición SIN guarda) + 2 métodos CON receptor reenviando ⇒ SIN hallazgo (un literal de composición nunca puede ser una guarda)", async () => {
    const source = `
package shapes

type ShapeProxy struct {
	real *RealShape
}

func NewShapeProxy() *ShapeProxy {
	return &ShapeProxy{real: NewRealShape()}
}

func (p *ShapeProxy) Area() float64 {
	return p.real.Area()
}

func (p *ShapeProxy) Paint(color string) {
	p.real.Paint(color)
}
`;
    const findings = await runComputeDirect({ wasm: "tree-sitter-go.wasm", probe: GO_PROBE, language: "go", source });
    expect(findings).toHaveLength(0);
  });

  it("Go: guarda real con receptor (`if p.real == nil { p.real = &RealShape{} }`) repetida en 2 métodos ⇒ 1 hallazgo", async () => {
    const source = `
package shapes

type ShapeProxy struct {
	real *RealShape
}

func (p *ShapeProxy) Area() float64 {
	if p.real == nil {
		p.real = &RealShape{}
	}
	return p.real.Area()
}

func (p *ShapeProxy) Paint(color string) {
	if p.real == nil {
		p.real = &RealShape{}
	}
	p.real.Paint(color)
}
`;
    const findings = await runComputeDirect({ wasm: "tree-sitter-go.wasm", probe: GO_PROBE, language: "go", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(2);
  });

  it("2 clases hermanas con miembros HOMÓNIMOS y guarda real en el mismo archivo ⇒ 2 hallazgos separados, ninguno se pisa (ver el bug de anchor sin clase)", async () => {
    const source = `
class ShapeProxy {
  area() { if (!this.real) { this.real = new RealShape(); } return this.real.area(); }
  paint(color) { if (!this.real) { this.real = new RealShape(); } this.real.paint(color); }
}
class PureWrapper {
  area() { if (!this.real) { this.real = new RealShape(); } return this.real.area(); }
  paint(color) { if (!this.real) { this.real = new RealShape(); } this.real.paint(color); }
}
`;
    const findings = await runComputeDirect({ wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source });
    expect(findings).toHaveLength(2);
    const titles = findings.map((f) => f.title).sort();
    expect(titles[0]).toContain("PureWrapper");
    expect(titles[1]).toContain("ShapeProxy");
    // El `anchor` explícito debe incluir la clase — si no, `ids.ts#findingId`
    // colisiona entre las dos (mismos nombres de método, mismo archivo) y
    // una de las dos desaparece silenciosamente (bug real encontrado y
    // arreglado durante la Ola 10).
    const anchors = findings.flatMap((f) => f.locations.map((l) => l.anchor?.symbolPath.join(".")));
    expect(new Set(anchors).size).toBe(anchors.length);
  });

  it("1 solo miembro guarda el campo (memoización normal de un getter) ⇒ sin hallazgo", async () => {
    const source = `
class Cache {
  get engine() {
    if (!this.engine_) { this.engine_ = new HeavyEngine(); }
    return this.engine_;
  }
}
`;
    const findings = await runComputeDirect({ wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source });
    expect(findings).toHaveLength(0);
  });

  it("2 métodos usan el campo pero NUNCA se construye en la clase ⇒ sin hallazgo (no hay evidencia de colaborador propio, ni de guarda)", async () => {
    const source = `
class Reader {
  area() { return this.real.area(); }
  paint(color) { this.real.paint(color); }
}
`;
    const findings = await runComputeDirect({ wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source });
    expect(findings).toHaveLength(0);
  });

  it("2 clases DISTINTAS con el MISMO campo, cada una con 1 solo sitio guardado ⇒ sin hallazgo en ninguna (no cruza clases)", async () => {
    const source = `
class A { m() { if (!this.real) { this.real = new RealShape(); } } }
class B { m() { if (!this.real) { this.real = new RealShape(); } } }
`;
    const findings = await runComputeDirect({ wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source });
    expect(findings).toHaveLength(0);
  });

  it("declara su id, kind, scope y umbral", () => {
    expect(detector.id).toBe("lazy-init-repetida");
    expect(detector.kind).toBe("lazy-init-repetida");
    expect(detector.scope).toBe("intra-file");
    expect(detector.needs).toEqual([]);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * REACTIVADO — la compuerta real. `detect/registry.ts` llama a
 * `detector.run`, y ahora coincide con `computeLazyInitRepetidaFindings`
 * (antes de esta ola, `detector.run` devolvía `[]` incondicionalmente pese
 * a que el escaneo SÍ reconocía la forma — ver el docstring de cabecera).
 * ──────────────────────────────────────────────────────────────────────── */
describe("lazy-init-repetida — REACTIVADO: detector.run coincide con el escaneo arreglado", () => {
  it("guarda de inicialización perezosa repetida en 2 métodos ⇒ detector.run SÍ emite (antes de esta ola: [])", async () => {
    const source = `
class ReportBuilder {
  buildSummary() {
    if (!this.engine) { this.engine = new HeavyEngine(); }
    return this.engine.summarize();
  }
  buildDetail() {
    if (!this.engine) { this.engine = new HeavyEngine(); }
    return this.engine.detail();
  }
}
`;
    const wired = await runIntraFile(detector, { wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source });
    expect(wired).toHaveLength(1);
    expect(wired[0]!.locations).toHaveLength(2);
  });

  it("fixture canónica ShapeProxy (forma general, SIN guarda) ⇒ detector.run sigue sin emitir — es la forma que midió 0% de precisión", async () => {
    const source = `
class ShapeProxy {
  constructor() {
    this.real = new RealShape();
  }
  area() {
    return this.real.area();
  }
  paint(color) {
    console.log("painting");
    this.real.paint(color);
  }
}
`;
    const wired = await runIntraFile(detector, { wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source });
    expect(wired).toHaveLength(0);
  });
});
