/**
 * `form-template-method.test.ts` — Ola AU, frente AU5.
 *
 * ÁRBOLES REALES Y LOS SEIS LENGUAJES, por la razón de siempre (la trampa de
 * `state.ts#SELF_PREFIX`, que dejó a Go MUDO en cuatro anclas durante varias
 * olas sin que ningún test se pusiera rojo). Acá el riesgo concreto es doble:
 * cada gramática nombra distinto la ranura de herencia (`superclass`,
 * `superclasses`, `bases`, `base_list`, `class_heritage`) y cada una nombra
 * distinto el nodo de llamada. Un solo lenguaje mal leído deja la familia sin
 * hermanos y muda para siempre.
 *
 * GO ESTÁ EN LA TABLA Y SE EXIGE SU SILENCIO, con la razón escrita: Go no
 * declara métodos DENTRO del tipo (van sueltos con un receptor) ni tiene una
 * ranura de herencia, así que la forma que esta familia busca —hermanos de un
 * ancestro que DECLARAN el mismo miembro— no existe en su gramática. El test
 * lo congela para que nadie lea el cero como cobertura.
 */
import { describe, expect, it } from "vitest";

import type { Capability } from "../detect/capabilities.js";
import { fileUnitFrom, nodeSetsFor, parseRoot } from "../detect/testing.js";
import { pisoDeclarado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import type { FileUnit, Finding } from "../detect/types.js";
import { EMPTY_NEIGHBORHOOD } from "../graph/neighborhood.js";
import { hypothesis as formTemplateMethod, startFormTemplateMethodTrace, takeFormTemplateMethodTrace } from "./form-template-method.js";
import type { HypothesisContext } from "./types.js";

function fakeThreshold(): Threshold {
  return resolveThreshold(pisoDeclarado(2, { rationale: "test" }), { language: "typescript", sampleSize: () => 0, corpusP95: () => null });
}

function finding(file: FileUnit, startLine: number, endLine: number, kind = "homonymous-divergent-sequence"): Finding {
  return {
    id: `f-${kind}-1`,
    detectorId: kind,
    kind: kind as Finding["kind"],
    scope: "intra-file",
    language: file.language,
    title: "t",
    detail: "d",
    trigger: [{ label: "x", value: 2, threshold: fakeThreshold() }],
    locations: [{ file: file.path, startLine, endLine, symbol: "s", role: "r" }],
    severity: 50,
    advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
  };
}

function ctxFor(file: FileUnit | null): HypothesisContext {
  return {
    file,
    fileAt: (p: string) => (file && file.path === p ? file : null),
    repo: { repoName: "r", files: [], functions: [], clones: [], graph: null },
    capabilities: new Set<Capability>(),
    setsFor: () =>
      file?.sets ?? {
        functionNodes: new Set(), branchNodes: new Set(), chainNodes: new Set(), cloneNodes: new Set(),
        classNodes: new Set(), nestingNodes: new Set(), constructorNodes: new Set(), exceptionNodes: new Set(), switchContainerNodes: new Set(),
      },
    neighborhood: EMPTY_NEIGHBORHOOD,
    branches: () => null,
  };
}

async function unit(wasm: string, probe: string, source: string, language: string): Promise<FileUnit> {
  const [sets, root] = await Promise.all([nodeSetsFor(wasm, probe), parseRoot(wasm, source)]);
  return fileUnitFrom(root, sets, language, { file: `fixture.${language}` });
}

/** La ubicación de un miembro homónimo — es lo que el ancla señala. `cual`
 *  elige entre las declaraciones con ese nombre: la del PRIMER hermano
 *  ("primero") o la del ÚLTIMO ("ultimo"). Hace falta porque en el fixture
 *  `yaEstaArriba` la primera declaración de `run` es la del ANCESTRO, y un
 *  ancla que señala al ancestro muere —correctamente— en otro check. */
function rangoDe(file: FileUnit, nombre: string, cual: "primero" | "ultimo" = "primero"): { startLine: number; endLine: number } {
  const todas = file.functions.filter((f) => (f.name ?? "").toLowerCase() === nombre.toLowerCase());
  const fn = cual === "primero" ? todas[0] : todas[todas.length - 1];
  if (!fn) throw new Error(`sin miembro ${nombre} en ${file.language} (funciones: ${file.functions.map((f) => f.name).join(",")})`);
  return { startLine: fn.startLine, endLine: fn.endLine };
}

interface Caso {
  readonly lenguaje: string;
  readonly wasm: string;
  readonly probe: string;
  /** Dos hermanos con la misma secuencia y un gancho propio cada uno. */
  readonly plantilla: string;
  /** Igual, pero el ancestro YA declara el homónimo (trampa #3). */
  readonly yaEstaArriba: string;
  /** Igual, pero el paso propio NO es un miembro del hermano. */
  readonly sinGancho: string;
  /** Nombre del miembro homónimo, para ubicar el ancla. */
  readonly homonimo: string;
  /** Go: la forma no existe en la gramática. */
  readonly mudo?: boolean;
}

const CASOS: readonly Caso[] = [
  {
    lenguaje: "typescript",
    wasm: "tree-sitter-typescript.wasm",
    probe: `function top(x: number): number { if (x > 0) { return 1; } else if (x < 0) { return 2; } else { return 3; } }\nclass P { m(x: number): void { if (x > 0) { this.m(1); } else if (x < 0) { this.m(2); } else { this.m(3); } switch (x) { case 1: this.m(1); break; default: break; } try { this.m(x); } catch (e) { this.m(x); } for (const y of []) { this.m(1); } } }`,
    homonimo: "run",
    plantilla: `class Base {
  common(): void { this.noop(); }
}
class Alpha extends Base {
  run(): void {
    this.load();
    this.parse();
    this.tweakAlpha();
  }
  tweakAlpha(): void { this.log(); }
}
class Beta extends Base {
  run(): void {
    this.load();
    this.parse();
    this.tweakBeta();
  }
  tweakBeta(): void { this.log(); }
}`,
    yaEstaArriba: `class Base {
  run(): void { this.load(); this.parse(); this.noop(); }
}
class Alpha extends Base {
  run(): void {
    this.load();
    this.parse();
    this.tweakAlpha();
  }
  tweakAlpha(): void { this.log(); }
}
class Beta extends Base {
  run(): void {
    this.load();
    this.parse();
    this.tweakBeta();
  }
  tweakBeta(): void { this.log(); }
}`,
    sinGancho: `class Base {
  common(): void { this.noop(); }
}
class Alpha extends Base {
  run(): void {
    this.load();
    this.parse();
    helperAlpha();
  }
}
class Beta extends Base {
  run(): void {
    this.load();
    this.parse();
    helperBeta();
  }
}`,
  },
  {
    lenguaje: "python",
    wasm: "tree-sitter-python.wasm",
    probe: `class P:\n    def m(self, x):\n        if x > 0:\n            return 1\n        elif x < 0:\n            return 2\n        else:\n            return 3\n        for y in []:\n            pass\n        try:\n            pass\n        except Exception:\n            pass\ndef top(x):\n    return x`,
    homonimo: "run",
    plantilla: `class Base:
    def common(self):
        self.noop()

class Alpha(Base):
    def run(self):
        self.load()
        self.parse()
        self.tweak_alpha()

    def tweak_alpha(self):
        self.log()

class Beta(Base):
    def run(self):
        self.load()
        self.parse()
        self.tweak_beta()

    def tweak_beta(self):
        self.log()`,
    yaEstaArriba: `class Base:
    def run(self):
        self.load()
        self.parse()
        self.noop()

class Alpha(Base):
    def run(self):
        self.load()
        self.parse()
        self.tweak_alpha()

    def tweak_alpha(self):
        self.log()

class Beta(Base):
    def run(self):
        self.load()
        self.parse()
        self.tweak_beta()

    def tweak_beta(self):
        self.log()`,
    sinGancho: `class Base:
    def common(self):
        self.noop()

class Alpha(Base):
    def run(self):
        self.load()
        self.parse()
        helper_alpha()

class Beta(Base):
    def run(self):
        self.load()
        self.parse()
        helper_beta()`,
  },
  {
    lenguaje: "ruby",
    wasm: "tree-sitter-ruby.wasm",
    probe: `class P\n  def m(x)\n    if x > 0\n      1\n    elsif x < 0\n      2\n    else\n      3\n    end\n    case x\n    when 1 then 1\n    else 2\n    end\n    begin\n      1\n    rescue => e\n      2\n    end\n    while x > 0 do\n      x\n    end\n  end\nend\ndef top(x)\n  x\nend`,
    homonimo: "run",
    plantilla: `class Base
  def common
    noop()
  end
end
class Alpha < Base
  def run
    load_it()
    parse_it()
    tweak_alpha()
  end
  def tweak_alpha
    log_it()
  end
end
class Beta < Base
  def run
    load_it()
    parse_it()
    tweak_beta()
  end
  def tweak_beta
    log_it()
  end
end`,
    yaEstaArriba: `class Base
  def run
    load_it()
    parse_it()
    noop()
  end
end
class Alpha < Base
  def run
    load_it()
    parse_it()
    tweak_alpha()
  end
  def tweak_alpha
    log_it()
  end
end
class Beta < Base
  def run
    load_it()
    parse_it()
    tweak_beta()
  end
  def tweak_beta
    log_it()
  end
end`,
    sinGancho: `class Base
  def common
    noop()
  end
end
class Alpha < Base
  def run
    load_it()
    parse_it()
    helper_alpha()
  end
end
class Beta < Base
  def run
    load_it()
    parse_it()
    helper_beta()
  end
end`,
  },
  {
    lenguaje: "java",
    wasm: "tree-sitter-java.wasm",
    probe: `class P {\n  int top(int x) { if (x > 0) { return 1; } else if (x < 0) { return 2; } else { return 3; } }\n  void m(int x) { switch (x) { case 1: break; default: break; } try { } catch (Exception e) { } for (int i = 0; i < 3; i++) { } }\n}`,
    homonimo: "run",
    plantilla: `class Base {
  void common() { noop(); }
}
class Alpha extends Base {
  void run() {
    load();
    parse();
    tweakAlpha();
  }
  void tweakAlpha() { log(); }
}
class Beta extends Base {
  void run() {
    load();
    parse();
    tweakBeta();
  }
  void tweakBeta() { log(); }
}`,
    yaEstaArriba: `class Base {
  void run() { load(); parse(); noop(); }
}
class Alpha extends Base {
  void run() {
    load();
    parse();
    tweakAlpha();
  }
  void tweakAlpha() { log(); }
}
class Beta extends Base {
  void run() {
    load();
    parse();
    tweakBeta();
  }
  void tweakBeta() { log(); }
}`,
    sinGancho: `class Base {
  void common() { noop(); }
}
class Alpha extends Base {
  void run() {
    load();
    parse();
    helperAlpha();
  }
}
class Beta extends Base {
  void run() {
    load();
    parse();
    helperBeta();
  }
}`,
  },
  {
    lenguaje: "csharp",
    wasm: "tree-sitter-c_sharp.wasm",
    probe: `class P {\n  int Top(int x) { if (x > 0) { return 1; } else if (x < 0) { return 2; } else { return 3; } }\n  void M(int x) { switch (x) { case 1: break; default: break; } try { } catch (Exception e) { } for (int i = 0; i < 3; i++) { } foreach (var y in new int[0]) { } }\n}`,
    homonimo: "Run",
    plantilla: `class Base {
  public void Common() { Noop(); }
}
class Alpha : Base {
  public void Run() {
    Load();
    Parse();
    TweakAlpha();
  }
  public void TweakAlpha() { Log(); }
}
class Beta : Base {
  public void Run() {
    Load();
    Parse();
    TweakBeta();
  }
  public void TweakBeta() { Log(); }
}`,
    yaEstaArriba: `class Base {
  public void Run() { Load(); Parse(); Noop(); }
}
class Alpha : Base {
  public void Run() {
    Load();
    Parse();
    TweakAlpha();
  }
  public void TweakAlpha() { Log(); }
}
class Beta : Base {
  public void Run() {
    Load();
    Parse();
    TweakBeta();
  }
  public void TweakBeta() { Log(); }
}`,
    sinGancho: `class Base {
  public void Common() { Noop(); }
}
class Alpha : Base {
  public void Run() {
    Load();
    Parse();
    HelperAlpha();
  }
}
class Beta : Base {
  public void Run() {
    Load();
    Parse();
    HelperBeta();
  }
}`,
  },
  {
    lenguaje: "go",
    wasm: "tree-sitter-go.wasm",
    probe: `package p\nfunc top(x int) int { if x > 0 { return 1 } else if x < 0 { return 2 } else { return 3 } }\ntype P struct{}\nfunc (p P) m(x int) { switch x { case 1: } for i := 0; i < 3; i++ { } }`,
    homonimo: "run",
    mudo: true,
    plantilla: `package p

type Base struct{}

type Alpha struct{ Base }

func (a Alpha) run() {
	load()
	parse()
	a.tweakAlpha()
}

func (a Alpha) tweakAlpha() { logIt() }

type Beta struct{ Base }

func (b Beta) run() {
	load()
	parse()
	b.tweakBeta()
}

func (b Beta) tweakBeta() { logIt() }`,
    yaEstaArriba: `package p

type Base struct{}

func (b Base) run() { load(); parse(); noop() }

type Alpha struct{ Base }

func (a Alpha) run() {
	load()
	parse()
	a.tweakAlpha()
}

func (a Alpha) tweakAlpha() { logIt() }`,
    sinGancho: `package p

type Base struct{}

type Alpha struct{ Base }

func (a Alpha) run() {
	load()
	parse()
	helperAlpha()
}`,
  },
];

describe("Form Template Method — la refactorización, no el patrón", () => {
  for (const caso of CASOS) {
    describe(caso.lenguaje, () => {
      it(caso.mudo
        ? "MUDO por la GRAMÁTICA, no por un umbral: Go no declara miembros dentro del tipo ni tiene ranura de herencia"
        : "propone cuando dos hermanos repiten la misma secuencia y su paso propio ya es un miembro propio", async () => {
        const file = await unit(caso.wasm, caso.probe, caso.plantilla, caso.lenguaje);
        const rango = caso.mudo ? { startLine: 1, endLine: file.lines } : rangoDe(file, caso.homonimo);
        startFormTemplateMethodTrace();
        const h = formTemplateMethod.build(finding(file, rango.startLine, rango.endLine), null, ctxFor(file));
        const traza = takeFormTemplateMethodTrace();
        if (caso.mudo) {
          expect(h).toBeNull();
          expect(traza[0]?.diesAt).toBe("hermanos-repiten-la-secuencia");
          return;
        }
        expect(h).not.toBeNull();
        expect(h!.pattern).toBe("Form Template Method");
        expect(h!.checks.every((c) => c.role !== "required" || c.passed)).toBe(true);
        expect(h!.places.length).toBeGreaterThanOrEqual(2);
        expect(traza[0]?.hermanos).toBe(2);
        expect(traza[0]?.comunes).toBeGreaterThanOrEqual(2);
        expect(traza[0]?.conGancho).toBe(2);
      });

      it(caso.mudo
        ? "sigue mudo cuando el ancestro ya declara el homónimo (no hay forma que encontrar en Go)"
        : "TRAMPA #3 — CALLA cuando el ancestro YA declara el homónimo: la plantilla ya está puesta", async () => {
        const file = await unit(caso.wasm, caso.probe, caso.yaEstaArriba, caso.lenguaje);
        const rango = caso.mudo ? { startLine: 1, endLine: file.lines } : rangoDe(file, caso.homonimo, "ultimo");
        startFormTemplateMethodTrace();
        const h = formTemplateMethod.build(finding(file, rango.startLine, rango.endLine), null, ctxFor(file));
        const traza = takeFormTemplateMethodTrace();
        expect(h).toBeNull();
        expect(traza[0]?.diesAt).toBe(caso.mudo ? "hermanos-repiten-la-secuencia" : "el-esqueleto-no-vive-ya-en-el-ancestro");
      });

      it(caso.mudo
        ? "sigue mudo cuando el paso propio no es un miembro (no hay forma que encontrar en Go)"
        : "CALLA cuando el paso propio NO es un miembro del hermano: no hay gancho que volver abstracto", async () => {
        const file = await unit(caso.wasm, caso.probe, caso.sinGancho, caso.lenguaje);
        const rango = caso.mudo ? { startLine: 1, endLine: file.lines } : rangoDe(file, caso.homonimo);
        startFormTemplateMethodTrace();
        const h = formTemplateMethod.build(finding(file, rango.startLine, rango.endLine), null, ctxFor(file));
        const traza = takeFormTemplateMethodTrace();
        expect(h).toBeNull();
        expect(traza[0]?.diesAt).toBe(caso.mudo ? "hermanos-repiten-la-secuencia" : "los-pasos-propios-ya-son-miembros-del-hermano");
      });
    });
  }

  it("TRAMPA #2 — `appliedState` es SIEMPRE `ausente`: no puede retirarle la propuesta a `Template Method` (CONGELADO)", async () => {
    const caso = CASOS[0]!;
    const file = await unit(caso.wasm, caso.probe, caso.plantilla, caso.lenguaje);
    const rango = rangoDe(file, caso.homonimo);
    const h = formTemplateMethod.build(finding(file, rango.startLine, rango.endLine), null, ctxFor(file));
    expect(h!.state).toBe("ausente");
    // Y también cuando la hipótesis no se publica: el estado nunca es confirmado.
    const otro = await unit(caso.wasm, caso.probe, caso.yaEstaArriba, caso.lenguaje);
    expect(formTemplateMethod.build(finding(otro, 1, otro.lines), null, ctxFor(otro))).toBeNull();
  });

  it("el ANCLA tiene que tocar la familia: un hallazgo del mismo archivo que no cae en ninguna declaración no publica", async () => {
    const caso = CASOS[0]!;
    const file = await unit(caso.wasm, caso.probe, caso.plantilla, caso.lenguaje);
    startFormTemplateMethodTrace();
    const h = formTemplateMethod.build(finding(file, 1, 2), null, ctxFor(file));
    const traza = takeFormTemplateMethodTrace();
    expect(h).toBeNull();
    expect(traza[0]?.diesAt).toBe("el-ancla-toca-la-familia");
  });

  it("sin árbol vivo NO inventa nada, y lo dice: muere en el primer required con evidencia explícita", () => {
    const problem: Finding = {
      id: "f-1", detectorId: "parallel-hierarchies", kind: "parallel-hierarchies" as Finding["kind"], scope: "inter-file", language: null,
      title: "t", detail: "d", trigger: [{ label: "x", value: 2, threshold: fakeThreshold() }],
      locations: [{ file: "a.ts", startLine: 1, endLine: 9, role: "r" }],
      severity: 10, advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
    };
    startFormTemplateMethodTrace();
    const h = formTemplateMethod.build(problem, null, ctxFor(null));
    const traza = takeFormTemplateMethodTrace();
    expect(h).toBeNull();
    expect(traza[0]?.diesAt).toBe("hermanos-repiten-la-secuencia");
    expect(traza[0]?.withFile).toBe(false);
  });

  it("LA COMPUERTA MÁS CARA — el ancestro que NO es visible en los archivos del hallazgo hace CALLAR a la familia (TypeScript y Java)", async () => {
    const fuentes: readonly { readonly caso: Caso; readonly src: string }[] = [
      {
        caso: CASOS[0]!,
        src: `class Alpha extends Missing {
  run(): void { this.load(); this.parse(); this.tweakAlpha(); }
  tweakAlpha(): void { this.log(); }
}
class Beta extends Missing {
  run(): void { this.load(); this.parse(); this.tweakBeta(); }
  tweakBeta(): void { this.log(); }
}`,
      },
      {
        caso: CASOS[3]!,
        src: `class Alpha extends Missing {
  void run() { load(); parse(); tweakAlpha(); }
  void tweakAlpha() { log(); }
}
class Beta extends Missing {
  void run() { load(); parse(); tweakBeta(); }
  void tweakBeta() { log(); }
}`,
      },
    ];
    for (const { caso, src } of fuentes) {
      const file = await unit(caso.wasm, caso.probe, src, caso.lenguaje);
      const rango = rangoDe(file, caso.homonimo);
      startFormTemplateMethodTrace();
      const h = formTemplateMethod.build(finding(file, rango.startLine, rango.endLine), null, ctxFor(file));
      const traza = takeFormTemplateMethodTrace();
      expect(h, `${caso.lenguaje}: el ancestro "Missing" no está en el archivo y la familia igual publicó`).toBeNull();
      expect(traza[0]?.diesAt).toBe("el-esqueleto-no-vive-ya-en-el-ancestro");
    }
  });

  it("REGRESIÓN (misma causa que en `jenkins · ExtensionPoint`) — una interfaz MARCADORA (cero miembros) no es una familia de comportamiento", async () => {
    const caso = CASOS[3]!; // java
    const src = `interface Marker {
}
class Alpha implements Marker {
  void run() { load(); parse(); tweakAlpha(); }
  void tweakAlpha() { log(); }
}
class Beta implements Marker {
  void run() { load(); parse(); tweakBeta(); }
  void tweakBeta() { log(); }
}`;
    const file = await unit(caso.wasm, caso.probe, src, caso.lenguaje);
    const rango = rangoDe(file, caso.homonimo);
    startFormTemplateMethodTrace();
    const h = formTemplateMethod.build(finding(file, rango.startLine, rango.endLine), null, ctxFor(file));
    const traza = takeFormTemplateMethodTrace();
    expect(h, "dos tipos que sólo comparten una marca no son hermanos de comportamiento").toBeNull();
    expect(traza[0]?.diesAt).toBe("el-esqueleto-no-vive-ya-en-el-ancestro");
    expect(traza[0]?.ancestor).toBe("Marker");
  });

  it("REGRESIÓN (medida en `guava · collect/StandardTable.java:750`) — `iterator.remove()` NO es el gancho de un `Set` que declara `remove`: el RECEPTOR decide, y en Java vive en el propio nodo de llamada", async () => {
    const caso = CASOS[3]!; // java
    const src = `class TableSet {
  void common() { noop(); }
}
class ColumnKeySet extends TableSet {
  boolean retainAll(Collection c) {
    checkNotNull(c);
    Iterator it = backingMap.values().iterator();
    while (it.hasNext()) { it.remove(); }
    return true;
  }
  boolean remove(Object o) { return backingMap.remove(o); }
}
class ColumnMapEntrySet extends TableSet {
  boolean retainAll(Collection c) {
    checkNotNull(c);
    for (Object k : columnKeySet().iterator()) { c.contains(k); }
    return true;
  }
  boolean contains(Object o) { return columnKeySet().contains(o); }
}`;
    const file = await unit(caso.wasm, caso.probe, src, caso.lenguaje);
    const rango = rangoDe(file, "retainAll");
    startFormTemplateMethodTrace();
    const h = formTemplateMethod.build(finding(file, rango.startLine, rango.endLine), null, ctxFor(file));
    const traza = takeFormTemplateMethodTrace();
    expect(h, "`it.remove()` y `c.contains(k)` son llamadas sobre objetos AJENOS: no son ganchos").toBeNull();
    expect(traza[0]?.diesAt).toBe("los-pasos-propios-ya-son-miembros-del-hermano");
    expect(traza[0]?.conGancho, "ningún hermano tiene el gancho escrito SOBRE SÍ MISMO").toBe(0);
    // Y la familia SÍ se encontró: muere en el check correcto, no antes.
    expect(traza[0]?.ancestor).toBe("TableSet");
    expect(traza[0]?.hermanos).toBe(2);
  });

  it("cuelga de las TRES anclas de jerarquía y de ninguna más", () => {
    expect([...formTemplateMethod.anchors].sort()).toEqual(["homonymous-divergent-sequence", "parallel-hierarchies", "refused-bequest"]);
  });
});
