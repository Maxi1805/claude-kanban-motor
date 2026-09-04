/**
 * `unify-alternative-interfaces.test.ts` — Ola AU, frente AU5.
 *
 * ÁRBOLES REALES Y LOS SEIS LENGUAJES. El riesgo concreto acá es la ARIDAD:
 * cada gramática cuelga la lista de parámetros de un campo distinto
 * (`parameters`, `parameter_list`, `formal_parameters`) y le mete hijos
 * distintos; contar mal en un solo lenguaje deja la familia creyendo que todas
 * las firmas coinciden — o que ninguna coincide — y muda o ruidosa sin que
 * nada se ponga rojo.
 *
 * GO ESTÁ EN LA TABLA Y SE EXIGE SU SILENCIO por la misma razón estructural
 * que en `form-template-method.test.ts`: no declara miembros dentro del tipo
 * ni tiene ranura de herencia.
 */
import { describe, expect, it } from "vitest";

import type { Capability } from "../detect/capabilities.js";
import { fileUnitFrom, nodeSetsFor, parseRoot } from "../detect/testing.js";
import { pisoDeclarado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import type { FileUnit, Finding } from "../detect/types.js";
import { EMPTY_NEIGHBORHOOD } from "../graph/neighborhood.js";
import { hypothesis as formTemplateMethod } from "./form-template-method.js";
import { hypothesis as unify, startUnifyAlternativeInterfacesTrace, takeUnifyAlternativeInterfacesTrace } from "./unify-alternative-interfaces.js";
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
  /** Dos hermanos hacen lo mismo con aridades distintas. */
  readonly divergen: string;
  /** Igual pero con la MISMA aridad: es caso de `Form Template Method`, no de ésta. */
  readonly mismaFirma: string;
  /** Aridades distintas pero cuerpos que hacen otra cosa: sobrecarga legítima. */
  readonly sobrecarga: string;
  /** Aridades distintas pero el ancestro YA declara el contrato (trampa #3). */
  readonly yaUnificado: string;
  readonly homonimo: string;
  readonly mudo?: boolean;
}

const CASOS: readonly Caso[] = [
  {
    lenguaje: "typescript",
    wasm: "tree-sitter-typescript.wasm",
    probe: `function top(x: number): number { if (x > 0) { return 1; } else if (x < 0) { return 2; } else { return 3; } }\nclass P { m(x: number): void { if (x > 0) { this.m(1); } else if (x < 0) { this.m(2); } else { this.m(3); } switch (x) { case 1: this.m(1); break; default: break; } try { this.m(x); } catch (e) { this.m(x); } for (const y of []) { this.m(1); } } }`,
    homonimo: "write",
    divergen: `class Base {
  common() { this.noop(); }
}
class FileWriter extends Base {
  write(data) { this.open(); this.emit(data); this.close(); }
}
class NetWriter extends Base {
  write(data, opts) { this.open(); this.emit(data); this.close(); this.retry(opts); }
}`,
    mismaFirma: `class Base {
  common() { this.noop(); }
}
class FileWriter extends Base {
  write(data) { this.open(); this.emit(data); this.tweakA(); }
  tweakA() { this.log(); }
}
class NetWriter extends Base {
  write(data) { this.open(); this.emit(data); this.tweakB(); }
  tweakB() { this.log(); }
}`,
    sobrecarga: `class Base {
  common() { this.noop(); }
}
class FileWriter extends Base {
  write(data) { this.open(); this.emit(data); this.close(); }
}
class NetWriter extends Base {
  write(data, opts) { this.emit(data); this.open(); this.flush(opts); }
}`,
    yaUnificado: `class Base {
  write(data, opts) { this.open(); this.emit(data); this.close(); }
}
class FileWriter extends Base {
  write(data) { this.open(); this.emit(data); this.close(); }
}
class NetWriter extends Base {
  write(data, opts) { this.open(); this.emit(data); this.close(); this.retry(opts); }
}`,
  },
  {
    lenguaje: "python",
    wasm: "tree-sitter-python.wasm",
    probe: `class P:\n    def m(self, x):\n        if x > 0:\n            return 1\n        elif x < 0:\n            return 2\n        else:\n            return 3\n        for y in []:\n            pass\n        try:\n            pass\n        except Exception:\n            pass\ndef top(x):\n    return x`,
    homonimo: "write",
    divergen: `class Base:
    def common(self):
        self.noop()

class FileWriter(Base):
    def write(self, data):
        self.open()
        self.emit(data)
        self.close()

class NetWriter(Base):
    def write(self, data, opts):
        self.open()
        self.emit(data)
        self.close()
        self.retry(opts)`,
    mismaFirma: `class Base:
    def common(self):
        self.noop()

class FileWriter(Base):
    def write(self, data):
        self.open()
        self.emit(data)
        self.tweak_a()

    def tweak_a(self):
        self.log()

class NetWriter(Base):
    def write(self, data):
        self.open()
        self.emit(data)
        self.tweak_b()

    def tweak_b(self):
        self.log()`,
    sobrecarga: `class Base:
    def common(self):
        self.noop()

class FileWriter(Base):
    def write(self, data):
        self.open()
        self.emit(data)
        self.close()

class NetWriter(Base):
    def write(self, data, opts):
        self.emit(data)
        self.open()
        self.flush(opts)`,
    yaUnificado: `class Base:
    def write(self, data, opts):
        self.open()
        self.emit(data)
        self.close()

class FileWriter(Base):
    def write(self, data):
        self.open()
        self.emit(data)
        self.close()

class NetWriter(Base):
    def write(self, data, opts):
        self.open()
        self.emit(data)
        self.close()
        self.retry(opts)`,
  },
  {
    lenguaje: "ruby",
    wasm: "tree-sitter-ruby.wasm",
    probe: `class P\n  def m(x)\n    if x > 0\n      1\n    elsif x < 0\n      2\n    else\n      3\n    end\n    case x\n    when 1 then 1\n    else 2\n    end\n    begin\n      1\n    rescue => e\n      2\n    end\n    while x > 0 do\n      x\n    end\n  end\nend\ndef top(x)\n  x\nend`,
    homonimo: "write",
    divergen: `class Base
  def common
    noop()
  end
end
class FileWriter < Base
  def write(data)
    open_it()
    emit(data)
    close_it()
  end
end
class NetWriter < Base
  def write(data, opts)
    open_it()
    emit(data)
    close_it()
    retry_it(opts)
  end
end`,
    mismaFirma: `class Base
  def common
    noop()
  end
end
class FileWriter < Base
  def write(data)
    open_it()
    emit(data)
    tweak_a()
  end
  def tweak_a
    log_it()
  end
end
class NetWriter < Base
  def write(data)
    open_it()
    emit(data)
    tweak_b()
  end
  def tweak_b
    log_it()
  end
end`,
    sobrecarga: `class Base
  def common
    noop()
  end
end
class FileWriter < Base
  def write(data)
    open_it()
    emit(data)
    close_it()
  end
end
class NetWriter < Base
  def write(data, opts)
    emit(data)
    open_it()
    flush_it(opts)
  end
end`,
    yaUnificado: `class Base
  def write(data, opts)
    open_it()
    emit(data)
    close_it()
  end
end
class FileWriter < Base
  def write(data)
    open_it()
    emit(data)
    close_it()
  end
end
class NetWriter < Base
  def write(data, opts)
    open_it()
    emit(data)
    close_it()
    retry_it(opts)
  end
end`,
  },
  {
    lenguaje: "java",
    wasm: "tree-sitter-java.wasm",
    probe: `class P {\n  int top(int x) { if (x > 0) { return 1; } else if (x < 0) { return 2; } else { return 3; } }\n  void m(int x) { switch (x) { case 1: break; default: break; } try { } catch (Exception e) { } for (int i = 0; i < 3; i++) { } }\n}`,
    homonimo: "write",
    divergen: `class Base {
  void common() { noop(); }
}
class FileWriter extends Base {
  void write(String data) { open(); emit(data); close(); }
}
class NetWriter extends Base {
  void write(String data, int opts) { open(); emit(data); close(); retry(opts); }
}`,
    mismaFirma: `class Base {
  void common() { noop(); }
}
class FileWriter extends Base {
  void write(String data) { open(); emit(data); tweakA(); }
  void tweakA() { log(); }
}
class NetWriter extends Base {
  void write(String data) { open(); emit(data); tweakB(); }
  void tweakB() { log(); }
}`,
    sobrecarga: `class Base {
  void common() { noop(); }
}
class FileWriter extends Base {
  void write(String data) { open(); emit(data); close(); }
}
class NetWriter extends Base {
  void write(String data, int opts) { emit(data); open(); flush(opts); }
}`,
    yaUnificado: `class Base {
  void write(String data, int opts) { open(); emit(data); close(); }
}
class FileWriter extends Base {
  void write(String data) { open(); emit(data); close(); }
}
class NetWriter extends Base {
  void write(String data, int opts) { open(); emit(data); close(); retry(opts); }
}`,
  },
  {
    lenguaje: "csharp",
    wasm: "tree-sitter-c_sharp.wasm",
    probe: `class P {\n  int Top(int x) { if (x > 0) { return 1; } else if (x < 0) { return 2; } else { return 3; } }\n  void M(int x) { switch (x) { case 1: break; default: break; } try { } catch (Exception e) { } for (int i = 0; i < 3; i++) { } foreach (var y in new int[0]) { } }\n}`,
    homonimo: "Write",
    divergen: `class Base {
  public void Common() { Noop(); }
}
class FileWriter : Base {
  public void Write(string data) { Open(); Emit(data); Close(); }
}
class NetWriter : Base {
  public void Write(string data, int opts) { Open(); Emit(data); Close(); Retry(opts); }
}`,
    mismaFirma: `class Base {
  public void Common() { Noop(); }
}
class FileWriter : Base {
  public void Write(string data) { Open(); Emit(data); TweakA(); }
  public void TweakA() { Log(); }
}
class NetWriter : Base {
  public void Write(string data) { Open(); Emit(data); TweakB(); }
  public void TweakB() { Log(); }
}`,
    sobrecarga: `class Base {
  public void Common() { Noop(); }
}
class FileWriter : Base {
  public void Write(string data) { Open(); Emit(data); Close(); }
}
class NetWriter : Base {
  public void Write(string data, int opts) { Emit(data); Open(); Flush(opts); }
}`,
    yaUnificado: `class Base {
  public void Write(string data, int opts) { Open(); Emit(data); Close(); }
}
class FileWriter : Base {
  public void Write(string data) { Open(); Emit(data); Close(); }
}
class NetWriter : Base {
  public void Write(string data, int opts) { Open(); Emit(data); Close(); Retry(opts); }
}`,
  },
  {
    lenguaje: "go",
    wasm: "tree-sitter-go.wasm",
    probe: `package p\nfunc top(x int) int { if x > 0 { return 1 } else if x < 0 { return 2 } else { return 3 } }\ntype P struct{}\nfunc (p P) m(x int) { switch x { case 1: } for i := 0; i < 3; i++ { } }`,
    homonimo: "write",
    mudo: true,
    divergen: `package p

type Base struct{}

type FileWriter struct{ Base }

func (w FileWriter) write(data string) { openIt(); emit(data); closeIt() }

type NetWriter struct{ Base }

func (w NetWriter) write(data string, opts int) { openIt(); emit(data); closeIt(); retryIt(opts) }`,
    mismaFirma: `package p

type Base struct{}

type FileWriter struct{ Base }

func (w FileWriter) write(data string) { openIt(); emit(data); closeIt() }

type NetWriter struct{ Base }

func (w NetWriter) write(data string) { openIt(); emit(data); closeIt() }`,
    sobrecarga: `package p

type Base struct{}

type FileWriter struct{ Base }

func (w FileWriter) write(data string) { openIt(); emit(data); closeIt() }

type NetWriter struct{ Base }

func (w NetWriter) write(data string, opts int) { emit(data); openIt(); flushIt(opts) }`,
    yaUnificado: `package p

type Base struct{}

func (b Base) write(data string, opts int) { openIt(); emit(data); closeIt() }

type FileWriter struct{ Base }

func (w FileWriter) write(data string) { openIt(); emit(data); closeIt() }`,
  },
];

describe("Unify Alternative Interfaces — el mismo miembro con firmas que no se pueden usar igual", () => {
  for (const caso of CASOS) {
    describe(caso.lenguaje, () => {
      it(caso.mudo
        ? "MUDO por la GRAMÁTICA: Go no declara miembros dentro del tipo ni tiene ranura de herencia"
        : "propone cuando dos hermanos hacen lo mismo con aridades distintas", async () => {
        const file = await unit(caso.wasm, caso.probe, caso.divergen, caso.lenguaje);
        const rango = caso.mudo ? { startLine: 1, endLine: file.lines } : rangoDe(file, caso.homonimo);
        startUnifyAlternativeInterfacesTrace();
        const h = unify.build(finding(file, rango.startLine, rango.endLine), null, ctxFor(file));
        const traza = takeUnifyAlternativeInterfacesTrace();
        if (caso.mudo) {
          expect(h).toBeNull();
          expect(traza[0]?.diesAt).toBe("mismo-nombre-en-hermanos");
          return;
        }
        expect(h).not.toBeNull();
        expect(h!.pattern).toBe("Unify Alternative Interfaces");
        expect(h!.checks.every((c) => c.role !== "required" || c.passed)).toBe(true);
        expect(traza[0]?.aridades.length).toBe(2);
        expect(traza[0]?.declaraciones).toBe(2);
        expect(traza[0]?.comunes).toBeGreaterThanOrEqual(2);
      });

      it(caso.mudo
        ? "sigue muda con la misma firma (no hay forma que encontrar en Go)"
        : "CALLA con la MISMA aridad: ése es el terreno de `Form Template Method`, no de ésta", async () => {
        const file = await unit(caso.wasm, caso.probe, caso.mismaFirma, caso.lenguaje);
        const rango = caso.mudo ? { startLine: 1, endLine: file.lines } : rangoDe(file, caso.homonimo);
        startUnifyAlternativeInterfacesTrace();
        const h = unify.build(finding(file, rango.startLine, rango.endLine), null, ctxFor(file));
        const traza = takeUnifyAlternativeInterfacesTrace();
        expect(h).toBeNull();
        expect(traza[0]?.diesAt).toBe("mismo-nombre-en-hermanos");
      });

      it(caso.mudo
        ? "sigue muda con una sobrecarga legítima (no hay forma que encontrar en Go)"
        : "CALLA cuando las aridades difieren pero los cuerpos NO hacen lo mismo: es una sobrecarga legítima", async () => {
        const file = await unit(caso.wasm, caso.probe, caso.sobrecarga, caso.lenguaje);
        const rango = caso.mudo ? { startLine: 1, endLine: file.lines } : rangoDe(file, caso.homonimo);
        startUnifyAlternativeInterfacesTrace();
        const h = unify.build(finding(file, rango.startLine, rango.endLine), null, ctxFor(file));
        const traza = takeUnifyAlternativeInterfacesTrace();
        expect(h).toBeNull();
        expect(traza[0]?.diesAt).toBe(caso.mudo ? "mismo-nombre-en-hermanos" : "hacen-lo-mismo");
      });

      it(caso.mudo
        ? "sigue muda con el contrato ya unificado (no hay forma que encontrar en Go)"
        : "TRAMPA #3 — CALLA cuando el ancestro YA declara el contrato unificado", async () => {
        const file = await unit(caso.wasm, caso.probe, caso.yaUnificado, caso.lenguaje);
        const rango = caso.mudo ? { startLine: 1, endLine: file.lines } : rangoDe(file, caso.homonimo, "ultimo");
        startUnifyAlternativeInterfacesTrace();
        const h = unify.build(finding(file, rango.startLine, rango.endLine), null, ctxFor(file));
        const traza = takeUnifyAlternativeInterfacesTrace();
        expect(h).toBeNull();
        expect(traza[0]?.diesAt).toBe(caso.mudo ? "mismo-nombre-en-hermanos" : "el-ancestro-no-declara-ya-el-contrato");
      });
    });
  }

  it("PARTICIÓN con `Form Template Method`: ninguna población puede satisfacer las dos", async () => {
    const caso = CASOS[0]!;
    const divergen = await unit(caso.wasm, caso.probe, caso.divergen, caso.lenguaje);
    const misma = await unit(caso.wasm, caso.probe, caso.mismaFirma, caso.lenguaje);
    const rDiv = rangoDe(divergen, caso.homonimo);
    const rMis = rangoDe(misma, caso.homonimo);
    // Aridades distintas ⇒ Unify sí, Form Template Method no.
    expect(unify.build(finding(divergen, rDiv.startLine, rDiv.endLine), null, ctxFor(divergen))).not.toBeNull();
    expect(formTemplateMethod.build(finding(divergen, rDiv.startLine, rDiv.endLine), null, ctxFor(divergen))).toBeNull();
    // Misma aridad ⇒ Form Template Method sí, Unify no.
    expect(formTemplateMethod.build(finding(misma, rMis.startLine, rMis.endLine), null, ctxFor(misma))).not.toBeNull();
    expect(unify.build(finding(misma, rMis.startLine, rMis.endLine), null, ctxFor(misma))).toBeNull();
  });

  it("TRAMPA #2 — `appliedState` es SIEMPRE `ausente`: no puede retirarle la propuesta a `Template Method` ni a `Factory Method` (CONGELADOS)", async () => {
    const caso = CASOS[0]!;
    const file = await unit(caso.wasm, caso.probe, caso.divergen, caso.lenguaje);
    const rango = rangoDe(file, caso.homonimo);
    const h = unify.build(finding(file, rango.startLine, rango.endLine), null, ctxFor(file));
    expect(h!.state).toBe("ausente");
  });

  it("el ANCLA tiene que tocar la familia: un hallazgo fuera de las unidades-tipo no publica", async () => {
    const caso = CASOS[0]!;
    const file = await unit(caso.wasm, caso.probe, caso.divergen, caso.lenguaje);
    startUnifyAlternativeInterfacesTrace();
    const h = unify.build(finding(file, file.lines + 10, file.lines + 12), null, ctxFor(file));
    const traza = takeUnifyAlternativeInterfacesTrace();
    expect(h).toBeNull();
    expect(traza[0]?.diesAt).toBe("el-ancla-toca-la-familia");
  });

  it("sin árbol vivo NO inventa nada", () => {
    const problem: Finding = {
      id: "f-1", detectorId: "homonymous-divergent-construction", kind: "homonymous-divergent-construction" as Finding["kind"], scope: "inter-file", language: null,
      title: "t", detail: "d", trigger: [{ label: "x", value: 2, threshold: fakeThreshold() }],
      locations: [{ file: "a.ts", startLine: 1, endLine: 9, role: "r" }],
      severity: 10, advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
    };
    startUnifyAlternativeInterfacesTrace();
    expect(unify.build(problem, null, ctxFor(null))).toBeNull();
    const traza = takeUnifyAlternativeInterfacesTrace();
    expect(traza[0]?.diesAt).toBe("mismo-nombre-en-hermanos");
    expect(traza[0]?.withFile).toBe(false);
  });

  it("LA COMPUERTA MÁS CARA — el ancestro que NO es visible en los archivos del hallazgo hace CALLAR a la familia (TypeScript y Java)", async () => {
    const fuentes: readonly { readonly caso: Caso; readonly src: string }[] = [
      {
        caso: CASOS[0]!,
        src: `class FileWriter extends Missing {
  write(data) { this.open(); this.emit(data); this.close(); }
}
class NetWriter extends Missing {
  write(data, opts) { this.open(); this.emit(data); this.close(); this.retry(opts); }
}`,
      },
      {
        caso: CASOS[3]!,
        src: `class FileWriter extends Missing {
  void write(String data) { open(); emit(data); close(); }
}
class NetWriter extends Missing {
  void write(String data, int opts) { open(); emit(data); close(); retry(opts); }
}`,
      },
    ];
    for (const { caso, src } of fuentes) {
      const file = await unit(caso.wasm, caso.probe, src, caso.lenguaje);
      const rango = rangoDe(file, caso.homonimo);
      startUnifyAlternativeInterfacesTrace();
      const h = unify.build(finding(file, rango.startLine, rango.endLine), null, ctxFor(file));
      const traza = takeUnifyAlternativeInterfacesTrace();
      expect(h, `${caso.lenguaje}: el ancestro "Missing" no está en el archivo y la familia igual publicó`).toBeNull();
      expect(traza[0]?.diesAt).toBe("el-ancestro-no-declara-ya-el-contrato");
    }
  });

  it("REGRESIÓN (medida en `jenkins · jenkins/mvn/SettingsProvider.java` + `GlobalSettingsProvider.java`) — un tipo de retorno divergente NO alcanza: dos fábricas ESTÁTICAS de la misma aridad no son dos interfaces alternativas", async () => {
    const caso = CASOS[3]!; // java
    const src = `class Describable {
  void getDescriptor() { noop(); }
}
class SettingsProvider extends Describable {
  static SettingsProvider parseSettingsProvider(StaplerRequest req) {
    JSONObject settings = req.getSubmittedForm().getJSONObject("settings");
    if (settings == null) { return new DefaultSettingsProvider(); }
    return req.bindJSON(SettingsProvider.class, settings);
  }
}
class GlobalSettingsProvider extends Describable {
  static GlobalSettingsProvider parseSettingsProvider(StaplerRequest req) {
    JSONObject settings = req.getSubmittedForm().getJSONObject("globalSettings");
    if (settings == null) { return new DefaultGlobalSettingsProvider(); }
    return req.bindJSON(GlobalSettingsProvider.class, settings);
  }
}`;
    const file = await unit(caso.wasm, caso.probe, src, caso.lenguaje);
    const rango = rangoDe(file, "parseSettingsProvider");
    startUnifyAlternativeInterfacesTrace();
    const h = unify.build(finding(file, rango.startLine, rango.endLine), null, ctxFor(file));
    const traza = takeUnifyAlternativeInterfacesTrace();
    expect(h).toBeNull();
    // Las dos declaran aridad 1: sin divergencia de ARIDAD no hay candidata, así
    // que la familia ni siquiera llega al check de firmas.
    expect(traza[0]?.diesAt).toBe("mismo-nombre-en-hermanos");
  });

  it("REGRESIÓN (medida en `jenkins · hudson/model/Job.java` + `Run.java` bajo `ExtensionPoint`) — una interfaz MARCADORA (cero miembros) no es una familia por la que nadie invoca", async () => {
    const caso = CASOS[3]!; // java
    const src = `interface ExtensionPoint {
}
class Job implements ExtensionPoint {
  void doConfigSubmit(Req req, Rsp rsp) {
    checkPermission(CONFIGURE);
    getSubmittedForm();
    submit(req, rsp);
    commit();
    success();
  }
}
class Run implements ExtensionPoint {
  Response doConfigSubmit(Req req) {
    checkPermission(UPDATE);
    getSubmittedForm();
    submit(json);
    commit();
    return success();
  }
}`;
    const file = await unit(caso.wasm, caso.probe, src, caso.lenguaje);
    const rango = rangoDe(file, "doConfigSubmit");
    startUnifyAlternativeInterfacesTrace();
    const h = unify.build(finding(file, rango.startLine, rango.endLine), null, ctxFor(file));
    const traza = takeUnifyAlternativeInterfacesTrace();
    expect(h, "una interfaz marcadora no puede sostener un contrato unificado").toBeNull();
    expect(traza[0]?.diesAt).toBe("el-ancestro-no-declara-ya-el-contrato");
    // Y la forma SÍ se encontró: la familia muere en el check correcto, no antes.
    expect(traza[0]?.ancestor).toBe("ExtensionPoint");
    expect(traza[0]?.aridades).toEqual([1, 2]);
  });

  /* ── OLA AW · AW3 — LOS DOS ARREGLOS, CON SU REGRESIÓN ─────────────────── */

  /** Tres hermanos que hacen lo mismo con aridades distintas y cuerpos NO
   *  anidados: cada uno invoca algo propio además de los tres pasos comunes.
   *  Es la forma de `nest · Server.handleMessage` (seis hermanos, 10-18 pasos
   *  cada uno, siete comunes) reducida a lo mínimo. */
  const TRES_HERMANOS_NO_ANIDADOS = `
class Base { protected step(): void {} }
class Uno extends Base {
  run(a: number) { abrir(); leer(); cerrar(); soloUno(); }
}
class Dos extends Base {
  run(a: number, b: number) { abrir(); leer(); cerrar(); soloDos(); }
}
class Tres extends Base {
  run(a: number, b: number, c: number) { abrir(); leer(); cerrar(); soloTres(); }
}
`;

  it("AW3 — TRES o más hermanos: la INTERSECCIÓN reemplaza al anidamiento (regresión de `nest · Server.handleMessage`, que callaba)", async () => {
    const caso = CASOS[0]!;
    const file = await unit(caso.wasm, caso.probe, TRES_HERMANOS_NO_ANIDADOS, caso.lenguaje);
    const rango = rangoDe(file, "run");
    startUnifyAlternativeInterfacesTrace();
    const h = unify.build(finding(file, rango.startLine, rango.endLine), null, ctxFor(file));
    const traza = takeUnifyAlternativeInterfacesTrace();
    // NINGÚN cuerpo es subconjunto de otro (cada uno tiene su paso propio), así
    // que la regla vieja —orden + subconjunto— lo mataba en `hacen-lo-mismo`.
    expect(traza[0]?.declaraciones).toBe(3);
    expect(traza[0]?.comunes).toBeGreaterThanOrEqual(3);
    expect(h).not.toBeNull();
    expect(h!.checks.every((c) => c.role !== "required" || c.passed)).toBe(true);
  });

  it("AW3 — con DOS hermanos NO cambia nada: sin anidamiento sigue muriendo en `hacen-lo-mismo`", async () => {
    const caso = CASOS[0]!;
    const dos = `
class Base { protected step(): void {} }
class Uno extends Base {
  run(a: number) { abrir(); leer(); cerrar(); soloUno(); }
}
class Dos extends Base {
  run(a: number, b: number) { abrir(); leer(); cerrar(); soloDos(); }
}
`;
    const file = await unit(caso.wasm, caso.probe, dos, caso.lenguaje);
    const rango = rangoDe(file, "run");
    startUnifyAlternativeInterfacesTrace();
    const h = unify.build(finding(file, rango.startLine, rango.endLine), null, ctxFor(file));
    const traza = takeUnifyAlternativeInterfacesTrace();
    expect(traza[0]?.declaraciones).toBe(2);
    expect(h).toBeNull();
    expect(traza[0]?.diesAt).toBe("hacen-lo-mismo");
  });

  it("AW3 — el DESEMPATE ya no elige una forma que se sabe que va a morir (regresión de `nest`: ganaba `getPublisher` y `handleMessage` ni se consideraba)", async () => {
    const caso = CASOS[0]!;
    // `senuelo` está ANIDADO (el corto es subconjunto del largo) pero sólo tiene
    // DOS pasos comunes; `bueno` tiene TRES hermanos y CUATRO pasos comunes sin
    // anidamiento. Con el desempate viejo ganaba `senuelo` y moría todo.
    const conSenuelo = `
class Base { protected step(): void {} }
class Uno extends Base {
  senuelo(a: number) { abrir(); leer(); }
  bueno(a: number) { uno(); dos(); tres(); cuatro(); propioUno(); }
}
class Dos extends Base {
  senuelo(a: number, b: number) { abrir(); leer(); extra(); }
  bueno(a: number, b: number) { uno(); dos(); tres(); cuatro(); propioDos(); }
}
class Tres extends Base {
  bueno(a: number, b: number, c: number) { uno(); dos(); tres(); cuatro(); propioTres(); }
}
`;
    const file = await unit(caso.wasm, caso.probe, conSenuelo, caso.lenguaje);
    const rango = rangoDe(file, "bueno");
    startUnifyAlternativeInterfacesTrace();
    const h = unify.build(finding(file, rango.startLine, rango.endLine), null, ctxFor(file));
    const traza = takeUnifyAlternativeInterfacesTrace();
    expect(traza[0]?.methodName).toBe("bueno");
    expect(h).not.toBeNull();
  });

  it("AW3 — LA JAULA: sin grafo, una familia repartida en TRES archivos es invisible; con las aristas `extends` del grafo, se ve", async () => {
    const caso = CASOS[0]!;
    // CADA UNO CON SU PROPIA RUTA: `archivosDe` deduplica por `path`, y
    // `fileUnitFrom` le pone a todas las fixtures la misma si no se le dice otra.
    const enRuta = async (ruta: string, fuente: string): Promise<FileUnit> => {
      const [sets, root] = await Promise.all([nodeSetsFor(caso.wasm, caso.probe), parseRoot(caso.wasm, fuente)]);
      return fileUnitFrom(root, sets, caso.lenguaje, { file: ruta });
    };
    const uno = await enRuta("a/uno.ts", `class Uno extends Base {\n  run(a: number) { abrir(); leer(); cerrar(); soloUno(); }\n}\n`);
    const dos = await enRuta("a/dos.ts", `class Dos extends Base {\n  run(a: number, b: number) { abrir(); leer(); cerrar(); soloDos(); }\n}\n`);
    const base = await enRuta("a/base.ts", `class Base {\n  protected step(): void {}\n}\n`);
    const tres = await enRuta("a/tres.ts", `class Tres extends Base {\n  run(a: number, b: number, c: number) { abrir(); leer(); cerrar(); soloTres(); }\n}\n`);
    const porRuta = new Map<string, FileUnit>([
      ["a/uno.ts", uno], ["a/dos.ts", dos], ["a/base.ts", base], ["a/tres.ts", tres],
    ]);
    const ctx: HypothesisContext = { ...ctxFor(uno), fileAt: (p: string) => porRuta.get(p) ?? null };
    const nodo = (id: string, file: string, symbolPath: readonly string[]) =>
      ({ id, kind: "symbol" as const, file, symbolPath });
    const graph = {
      nodes: [
        nodo("sym:a/uno.ts#Uno", "a/uno.ts", ["Uno"]),
        nodo("sym:a/dos.ts#Dos", "a/dos.ts", ["Dos"]),
        nodo("sym:a/tres.ts#Tres", "a/tres.ts", ["Tres"]),
        nodo("sym:a/base.ts#Base", "a/base.ts", ["Base"]),
      ],
      edges: [
        { from: "sym:a/uno.ts#Uno", to: "sym:a/base.ts#Base", kind: "extends", provenance: "resolved" },
        { from: "sym:a/dos.ts#Dos", to: "sym:a/base.ts#Base", kind: "extends", provenance: "resolved" },
        { from: "sym:a/tres.ts#Tres", to: "sym:a/base.ts#Base", kind: "extends", provenance: "resolved" },
      ],
      resolution: null,
    } as unknown as Parameters<typeof unify.build>[1];

    const rango = rangoDe(uno, "run");
    const problema: Finding = { ...finding(uno, rango.startLine, rango.endLine), locations: [{ file: "a/uno.ts", startLine: rango.startLine, endLine: rango.endLine, symbol: "Uno.run", role: "r" }] };

    // SIN grafo: sólo se carga `a/uno.ts` y no hay con quién comparar.
    startUnifyAlternativeInterfacesTrace();
    expect(unify.build(problema, null, ctx)).toBeNull();
    expect(takeUnifyAlternativeInterfacesTrace()[0]?.diesAt).toBe("mismo-nombre-en-hermanos");

    // CON grafo: las tres hermanas entran por las aristas `extends`.
    startUnifyAlternativeInterfacesTrace();
    const h = unify.build(problema, graph, ctx);
    const traza = takeUnifyAlternativeInterfacesTrace();
    expect(traza[0]?.archivosVistos?.length ?? 0).toBeGreaterThan(1);
    expect(traza[0]?.declaraciones).toBe(3);
    expect(h).not.toBeNull();
  });

  it("AW3 — `alguien-la-invoca-desde-afuera`: cuenta 0 cuando el miembro sólo se usa dentro de su propia unidad-tipo, y >0 cuando lo llama otra (regresión de `nest · Server.getPublisher` y `jenkins · doConfigSubmit`)", async () => {
    const caso = CASOS[0]!;
    const enRuta = async (ruta: string, fuente: string): Promise<FileUnit> => {
      const [sets, root] = await Promise.all([nodeSetsFor(caso.wasm, caso.probe), parseRoot(caso.wasm, fuente)]);
      return fileUnitFrom(root, sets, caso.lenguaje, { file: ruta });
    };
    const uno = await enRuta("a/uno.ts", `class Uno extends Base {\n  run(a: number) { abrir(); leer(); cerrar(); soloUno(); }\n}\n`);
    const dos = await enRuta("a/dos.ts", `class Dos extends Base {\n  run(a: number, b: number) { abrir(); leer(); cerrar(); soloDos(); }\n}\n`);
    const base = await enRuta("a/base.ts", `class Base {\n  protected step(): void {}\n}\n`);
    const porRuta = new Map<string, FileUnit>([["a/uno.ts", uno], ["a/dos.ts", dos], ["a/base.ts", base]]);
    const ctx: HypothesisContext = { ...ctxFor(uno), fileAt: (p: string) => porRuta.get(p) ?? null };
    const nodo = (id: string, file: string, symbolPath: readonly string[]) => ({ id, kind: "symbol" as const, file, symbolPath });
    const nodos = [
      nodo("sym:a/uno.ts#Uno", "a/uno.ts", ["Uno"]),
      nodo("sym:a/uno.ts#Uno.run", "a/uno.ts", ["Uno", "run"]),
      nodo("sym:a/uno.ts#Uno.otro", "a/uno.ts", ["Uno", "otro"]),
      nodo("sym:a/dos.ts#Dos", "a/dos.ts", ["Dos"]),
      nodo("sym:a/dos.ts#Dos.run", "a/dos.ts", ["Dos", "run"]),
      nodo("sym:a/base.ts#Base", "a/base.ts", ["Base"]),
      nodo("sym:a/cliente.ts#Cliente.usa", "a/cliente.ts", ["Cliente", "usa"]),
    ];
    const herencia = [
      { from: "sym:a/uno.ts#Uno", to: "sym:a/base.ts#Base", kind: "extends", provenance: "resolved" },
      { from: "sym:a/dos.ts#Dos", to: "sym:a/base.ts#Base", kind: "extends", provenance: "resolved" },
    ];
    const grafoCon = (extra: readonly unknown[]) =>
      ({ nodes: nodos, edges: [...herencia, ...extra], resolution: null }) as unknown as Parameters<typeof unify.build>[1];

    const rango = rangoDe(uno, "run");
    const problema: Finding = { ...finding(uno, rango.startLine, rango.endLine), locations: [{ file: "a/uno.ts", startLine: rango.startLine, endLine: rango.endLine, symbol: "Uno.run", role: "r" }] };

    // SÓLO uso interno: `Uno.otro` llama a `Uno.run`. Mismo dueño ⇒ no cuenta.
    startUnifyAlternativeInterfacesTrace();
    unify.build(problema, grafoCon([{ from: "sym:a/uno.ts#Uno.otro", to: "sym:a/uno.ts#Uno.run", kind: "calls", provenance: "resolved" }]), ctx);
    expect(takeUnifyAlternativeInterfacesTrace()[0]?.invocadaDesdeAfuera).toBe(0);

    // Un cliente EXTERNO llama a `Dos.run`: eso sí es un contrato que alguien usa.
    startUnifyAlternativeInterfacesTrace();
    unify.build(problema, grafoCon([{ from: "sym:a/cliente.ts#Cliente.usa", to: "sym:a/dos.ts#Dos.run", kind: "calls", provenance: "resolved" }]), ctx);
    expect(takeUnifyAlternativeInterfacesTrace()[0]?.invocadaDesdeAfuera).toBe(1);
  });

  it("cuelga de las DOS anclas de homonimia divergente y de ninguna más", () => {
    expect([...unify.anchors].sort()).toEqual(["homonymous-divergent-construction", "homonymous-divergent-sequence"]);
  });
});
