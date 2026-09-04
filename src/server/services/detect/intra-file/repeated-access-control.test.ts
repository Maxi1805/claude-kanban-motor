/**
 * Tests de `repeated-access-control` — el ancla-FUERZA de Proxy (Ola AE, AE13).
 *
 * Cada test nombra la CONDICIÓN de la receta que ejercita, para que se lea qué
 * intención protege y no sólo qué número compara.
 */
import { describe, expect, it } from "vitest";

import { detector, scanRepeatedAccessControl, LUGARES_QUE_REPITEN_MIN } from "./repeated-access-control.js";
import { fileUnitFrom, nodeSetsFor, parseRoot, runIntraFile, type RunFixtureOptions } from "../testing.js";

/* Las sondas EJERCITAN el `if`, el bucle y el `return`: `deriveNodeSets`
 * deriva `branchNodes` de lo que la sonda contiene, así que una sonda sin
 * condicional deja `branchNodes` VACÍO y este detector —que necesita
 * distinguir un condicional de un bucle— queda mudo en el arnés aunque
 * funcione en producción. Encontrado escribiendo estos tests. */
const JS_PROBE =
  "class Probe { constructor() { this.x = 1; } method(a) { if (a) { return a; } else { this.x = 2; } for (let i = 0; i < 1; i++) { this.x = i; } while (a) { break; } return a; } }\n";
const PYTHON_PROBE =
  "class Probe:\n    def __init__(self):\n        self.x = 1\n    def method(self, a):\n        if a:\n            return a\n        else:\n            self.x = 2\n        for i in [1]:\n            self.x = i\n        while a:\n            break\n        return a\n";
const RUBY_PROBE =
  "class Probe\n  def initialize\n    @x = 1\n  end\n  def method(a)\n    return nil unless a\n    if a\n      @x = a\n    else\n      @x = 2\n    end\n    while a\n      break\n    end\n    a\n  end\nend\n";
const GO_PROBE =
  "package p\ntype T struct{ x int }\nfunc (t *T) Method(a int) int {\n\tif a > 0 {\n\t\treturn a\n\t} else {\n\t\tt.x = 2\n\t}\n\tfor i := 0; i < 1; i++ {\n\t\tt.x = i\n\t}\n\treturn a\n}\nfunc NewT() *T {\n\treturn &T{x: 1}\n}\n";
const JAVA_PROBE =
  "class Probe { private int x; Probe() { this.x = 1; } int method(int a) { if (a > 0) { return a; } else { this.x = 2; } for (int i = 0; i < 1; i++) { this.x = i; } while (a > 0) { break; } return a; } }\n";

async function run(options: RunFixtureOptions) {
  return runIntraFile(detector, options);
}

async function scan(options: RunFixtureOptions, minLugares = LUGARES_QUE_REPITEN_MIN) {
  const sets = await nodeSetsFor(options.wasm, options.probe, options.extraClone, options.functionExclusions);
  const root = await parseRoot(options.wasm, options.source);
  return scanRepeatedAccessControl(fileUnitFrom(root, sets, options.language, options), minLugares);
}

/* ── LA FORMA COMPLETA ─────────────────────────────────────────────────── */

describe("repeated-access-control — la forma completa", () => {
  it("TypeScript: 3 miembros con la MISMA guarda de salida antes de usar el MISMO objeto ⇒ 1 hallazgo con 3 lugares", async () => {
    const source = `
class Injector {
  printA() {
    if (!this.isDebugMode()) return;
    this.logger.log("a");
  }
  printB() {
    if (!this.isDebugMode()) return;
    this.logger.log("b");
  }
  printC() {
    if (!this.isDebugMode()) return;
    this.logger.log("c");
  }
}
`;
    const findings = await run({ wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(3);
    expect(findings[0]!.locations.map((l) => l.symbol)).toEqual(["printA", "printB", "printC"]);
    expect(findings[0]!.title).toContain("logger");
  });

  it("TypeScript: el uso DENTRO del condicional también cuenta (no hace falta salida temprana)", async () => {
    const source = `
class Container {
  addA(token) {
    if (this.modules.has(token)) { this.modules.get(token).addA(); }
  }
  addB(token) {
    if (this.modules.has(token)) { this.modules.get(token).addB(); }
  }
  addC(token) {
    if (this.modules.has(token)) { this.modules.get(token).addC(); }
  }
}
`;
    const findings = await run({ wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(3);
  });

  it("Python (`self.`): la misma forma, sin una sola línea por lenguaje", async () => {
    const source = `
class Service:
    def a(self):
        if not self.ready:
            return None
        return self.conn.query("a")

    def b(self):
        if not self.ready:
            return None
        return self.conn.query("b")

    def c(self):
        if not self.ready:
            return None
        return self.conn.query("c")
`;
    const findings = await run({ wasm: "tree-sitter-python.wasm", probe: PYTHON_PROBE, language: "python", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(3);
  });

  it("Ruby (`@x`): la misma forma", async () => {
    const source = `
class Service
  def a
    return nil unless @ready
    @conn.query("a")
  end

  def b
    return nil unless @ready
    @conn.query("b")
  end

  def c
    return nil unless @ready
    @conn.query("c")
  end
end
`;
    const { grupos } = await scan({ wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source }, 1);
    expect(grupos.length).toBeGreaterThan(0);
  });

  it("Go (receptor de método, sin `this` ni `class`): la misma forma", async () => {
    const source = `package p

type S struct {
	ready bool
	conn  *C
}

func (s *S) A() {
	if !s.ready {
		return
	}
	s.conn.Query("a")
}

func (s *S) B() {
	if !s.ready {
		return
	}
	s.conn.Query("b")
}

func (s *S) C() {
	if !s.ready {
		return
	}
	s.conn.Query("c")
}
`;
    const findings = await run({ wasm: "tree-sitter-go.wasm", probe: GO_PROBE, language: "go", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(3);
  });

  it("Java (campo DESNUDO, sin `this.`): la vía sin la que el detector daba CERO en guava y newtonsoft-json", async () => {
    const source = `
class Service {
  private boolean ready;
  private Conn conn;

  void a() {
    if (!ready) { return; }
    conn.query("a");
  }

  void b() {
    if (!ready) { return; }
    conn.query("b");
  }

  void c() {
    if (!ready) { return; }
    conn.query("c");
  }
}
`;
    const findings = await run({ wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, language: "java", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations).toHaveLength(3);
  });
});

/* ── LAS EXCLUSIONES, UNA POR CONDICIÓN ────────────────────────────────── */

describe("repeated-access-control — ESCALA: el umbral que exige que la puerta pague", () => {
  it("DOS miembros ⇒ silencio (la mitigación más barata es una función compartida, no una puerta)", async () => {
    const source = `
class Injector {
  printA() {
    if (!this.isDebugMode()) return;
    this.logger.log("a");
  }
  printB() {
    if (!this.isDebugMode()) return;
    this.logger.log("b");
  }
}
`;
    expect(await run({ wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source })).toHaveLength(0);
  });

  it("y con el piso bajado a 2 el MISMO archivo sí produce — la diferencia es el umbral, no la forma", async () => {
    const source = `
class Injector {
  printA() {
    if (!this.isDebugMode()) return;
    this.logger.log("a");
  }
  printB() {
    if (!this.isDebugMode()) return;
    this.logger.log("b");
  }
}
`;
    const { grupos } = await scan({ wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source }, 2);
    expect(grupos).toHaveLength(1);
  });
});

describe("repeated-access-control — FUERZA: el control tiene que ser EL MISMO y GOBERNAR el acceso", () => {
  it("tres condiciones DISTINTAS sobre el mismo objeto ⇒ silencio (tres decisiones, no un control repetido)", async () => {
    const source = `
class Injector {
  printA() {
    if (!this.a) return;
    this.logger.log("a");
  }
  printB() {
    if (!this.b) return;
    this.logger.log("b");
  }
  printC() {
    if (!this.c) return;
    this.logger.log("c");
  }
}
`;
    expect(await run({ wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source })).toHaveLength(0);
  });

  it("el condicional está DESPUÉS del uso y no lo envuelve ⇒ silencio (no hay interposición)", async () => {
    const source = `
class Injector {
  printA() {
    this.logger.log("a");
    if (!this.isDebugMode()) { this.count = 1; }
  }
  printB() {
    this.logger.log("b");
    if (!this.isDebugMode()) { this.count = 2; }
  }
  printC() {
    this.logger.log("c");
    if (!this.isDebugMode()) { this.count = 3; }
  }
}
`;
    expect(await run({ wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source })).toHaveLength(0);
  });

  it("un BUCLE no es un control interpuesto ⇒ silencio (la clase de falso MÁS grande medida sobre guava)", async () => {
    const source = `
class Bench {
  a(reps) {
    for (let i = 0; i < reps; i++) { this.impl.run("a"); }
  }
  b(reps) {
    for (let i = 0; i < reps; i++) { this.impl.run("b"); }
  }
  c(reps) {
    for (let i = 0; i < reps; i++) { this.impl.run("c"); }
  }
}
`;
    expect(await run({ wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source })).toHaveLength(0);
  });

  it("una función y sus clausuras anidadas NO son tres clientes ⇒ silencio", async () => {
    const source = `
class Router {
  apply() {
    if (!this.isDebugMode()) return;
    const outer = () => {
      const inner = () => {
        this.logger.log("x");
      };
      return inner;
    };
    return outer;
  }
}
`;
    expect(await run({ wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source })).toHaveLength(0);
  });

  it("un parámetro que se llama IGUAL que un campo de una clase anidada no es el objeto ⇒ silencio", async () => {
    const source = `
class Util {
  static a(conn) {
    if (!Util.ready) { return; }
    conn.query("a");
  }
  static b(conn) {
    if (!Util.ready) { return; }
    conn.query("b");
  }
  static c(conn) {
    if (!Util.ready) { return; }
    conn.query("c");
  }
  static inner = class { constructor() { this.conn = null; } };
}
`;
    expect(await run({ wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source })).toHaveLength(0);
  });
});

describe("repeated-access-control — RESOLUCIÓN VERIFICADA: se calla cuando la puerta ya está", () => {
  it("PUERTA DE ADENTRO: si uno de los que repiten es llamado por otro, ése es ya la puerta ⇒ silencio", async () => {
    const source = `
class Injector {
  printA() {
    if (!this.isDebugMode()) return;
    this.logger.log("a");
  }
  printB() {
    if (!this.isDebugMode()) return;
    this.logger.log("b");
    this.printA();
  }
  printC() {
    if (!this.isDebugMode()) return;
    this.logger.log("c");
  }
}
`;
    expect(await run({ wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source })).toHaveLength(0);
  });

  it("PUERTA YA ESCRITA: un miembro corto con el MISMO control sobre el MISMO objeto, y alguien lo llama ⇒ silencio", async () => {
    const source = `
class Injector {
  trace(msg) {
    if (!this.isDebugMode()) return;
    this.logger.log(msg);
  }
  printA() {
    if (!this.isDebugMode()) return;
    this.logger.log("a");
  }
  printB() {
    if (!this.isDebugMode()) return;
    this.logger.log("b");
  }
  printC() {
    if (!this.isDebugMode()) return;
    this.logger.log("c");
  }
  usa() {
    this.trace("z");
  }
}
`;
    expect(await run({ wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source })).toHaveLength(0);
  });
});

describe("repeated-access-control — el dedupe y la evidencia", () => {
  it("el MISMO control y los MISMOS miembros sobre DOS objetos ⇒ UN solo hallazgo (es un solo refactor)", async () => {
    const source = `
class Micro {
  useA() {
    if (this.initialized) { this.logger.warn("a"); this.config.useA(); }
  }
  useB() {
    if (this.initialized) { this.logger.warn("b"); this.config.useB(); }
  }
  useC() {
    if (this.initialized) { this.logger.warn("c"); this.config.useC(); }
  }
}
`;
    const findings = await run({ wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source });
    expect(findings).toHaveLength(1);
  });

  it("publica cuántos usos gobierna desde adentro y cuántos por guarda de salida", async () => {
    const source = `
class Injector {
  printA() {
    if (!this.isDebugMode()) return;
    this.logger.log("a");
  }
  printB() {
    if (!this.isDebugMode()) return;
    this.logger.log("b");
  }
  printC() {
    if (!this.isDebugMode()) return;
    this.logger.log("c");
  }
}
`;
    const findings = await run({ wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source });
    const labels = (findings[0]!.evidence ?? []).map((e) => e.label);
    expect(labels).toContain("usos gobernados por una guarda de salida temprana");
  });

  it("marca `delegaLaDecision` cuando la condición invoca un miembro propio (media puerta ya construida)", async () => {
    const delegando = `
class Injector {
  printA() { if (!this.isDebugMode()) return; this.logger.log("a"); }
  printB() { if (!this.isDebugMode()) return; this.logger.log("b"); }
  printC() { if (!this.isDebugMode()) return; this.logger.log("c"); }
  isDebugMode() { return true; }
}
`;
    const crudo = `
class Injector {
  printA() { if (this.level == null) return; this.logger.log("a"); }
  printB() { if (this.level == null) return; this.logger.log("b"); }
  printC() { if (this.level == null) return; this.logger.log("c"); }
}
`;
    const a = await scan({ wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source: delegando });
    const b = await scan({ wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source: crudo });
    expect(a.grupos[0]!.delegaLaDecision).toBe(true);
    expect(b.grupos[0]!.delegaLaDecision).toBe(false);
  });
});

describe("repeated-access-control — contrato de registro", () => {
  it("declara id, kind, scope y su umbral de escala", () => {
    expect(detector.id).toBe("repeated-access-control");
    expect(detector.kind).toBe("repeated-access-control");
    expect(detector.scope).toBe("intra-file");
    expect(detector.needs).toEqual([]);
    expect(LUGARES_QUE_REPITEN_MIN).toBe(3);
  });
});
