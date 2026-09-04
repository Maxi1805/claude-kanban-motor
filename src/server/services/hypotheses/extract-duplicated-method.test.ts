/**
 * `extract-duplicated-method.test.ts` — Ola AU, frente AU2.
 *
 * ÁRBOLES REALES Y LOS SEIS LENGUAJES, por la razón de siempre (la trampa de
 * `state.ts#SELF_PREFIX`, que dejó a Go mudo en cuatro anclas durante varias
 * olas sin que ningún test lo agarrara). Acá el riesgo concreto es doble:
 *   1. el nodo del CUERPO se llama distinto en cada gramática
 *      (`statement_block`, `block`, `body_statement`) y un lenguaje mal leído
 *      deja la familia muda sin ponerse roja;
 *   2. el nodo de SALTO también (`return_statement` contra el `return` pelado
 *      de Ruby), y ahí el fallo es peor: la compuerta se apaga en silencio y
 *      la familia empieza a proponer extracciones que cambian el flujo.
 *
 * El arnés reconstruye lo que hace el walker de clones de `code-analyzer.ts`
 * (recorrer, agrupar por texto normalizado, quedarse con los grupos de >= 2)
 * en vez de fabricar `CloneCandidate`s a mano: así el test ejercita el mismo
 * emparejamiento por rango + huella que la hipótesis usa en producción.
 */
import { describe, expect, it } from "vitest";

import type { Capability } from "../detect/capabilities.js";
import { fileUnitFrom, nodeSetsFor, parseRoot } from "../detect/testing.js";
import { pisoDeclarado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import { walkTree } from "../detect/tree-walk.js";
import type { AstNode, CloneCandidate, FileUnit, Finding } from "../detect/types.js";
import { EMPTY_NEIGHBORHOOD } from "../graph/neighborhood.js";
import {
  equivalenciaDe,
  esRutaDeProducto,
  hypothesis as extractDuplicatedMethod,
  reconstruirGrupo,
  startExtractDuplicatedMethodTrace,
  takeExtractDuplicatedMethodTrace,
  tokenizar,
  tokensDelNodo,
} from "./extract-duplicated-method.js";
import type { HypothesisContext } from "./types.js";

/* ══════════════════════════════════════════════════════════════════════════
 * PARTE 1 — LAS FUNCIONES PURAS
 * ══════════════════════════════════════════════════════════════════════════ */

describe("extract-duplicated-method / tokenizar", () => {
  it("separa identificadores, literales y puntuación, y marca cuáles son VALORES", () => {
    const t = tokenizar('const a = foo(1, "x");');
    expect(t.map((x) => x.texto)).toEqual(["const", "a", "=", "foo", "(", "1", ",", '"x"', ")", ";"]);
    expect(t.filter((x) => x.esValor).map((x) => x.texto)).toEqual(["const", "a", "foo", "1", '"x"']);
  });

  it("no parte identificadores con Unicode ni con `$`/`_`", () => {
    expect(tokenizar("const año_$1 = 2;").map((x) => x.texto)).toEqual(["const", "año_$1", "=", "2", ";"]);
  });
});

describe("extract-duplicated-method / equivalenciaDe", () => {
  it("texto idéntico ⇒ `identica`, cero parámetros", () => {
    const e = equivalenciaDe(["a = b + c;", "a = b + c;"]);
    expect(e.clase).toBe("identica");
    expect(e.pares).toEqual([]);
  });

  it("una sustitución consistente en posición de VALOR ⇒ `parametrizable`", () => {
    const e = equivalenciaDe(["total = precio * 2; log(total);", "total = costo * 2; log(total);"]);
    expect(e.clase).toBe("parametrizable");
    expect(e.pares).toEqual(["precio->costo"]);
  });

  it("LA COMPUERTA CENTRAL: distinta cantidad de tokens ⇒ la diferencia es ESTRUCTURAL, no un parámetro", () => {
    const e = equivalenciaDe(["a = 1; b = 2;", "a = 1; if (x) { b = 2; }"]);
    expect(e.clase).toBe("no");
    expect(e.razon).toContain("ESTRUCTURAL");
  });

  it("EL CASO `jenkins LabelExpression:157`: lo que difiere está en posición de LLAMADA ⇒ es el doble despacho, no un parámetro", () => {
    const e = equivalenciaDe(["return visitor.onAnd(this, param);", "return visitor.onOr(this, param);"]);
    expect(e.clase).toBe("no");
    expect(e.razon).toContain("LLAMADA");
  });

  it("una sustitución inconsistente no es una biyección ⇒ no aplica", () => {
    const e = equivalenciaDe(["f = a + a;", "f = b + c;"]);
    expect(e.clase).toBe("no");
  });

  it("más de dos identificadores distintos ⇒ ya no es un movimiento mecánico", () => {
    const e = equivalenciaDe(["w = a + b + c + d;", "w = p + q + r + s;"]);
    expect(e.clase).toBe("no");
    expect(e.razon).toContain("parámetros");
  });

  it("un operador distinto no se puede pasar como parámetro", () => {
    const e = equivalenciaDe(["x = a + b;", "x = a - b;"]);
    expect(e.clase).toBe("no");
    expect(e.razon).toContain("no es un identificador");
  });
});

describe("extract-duplicated-method / esRutaDeProducto", () => {
  const noProducto = [
    "examples/inheritance/single.py",
    "benchmark/static-drop-vs-forwarded.rb",
    "db/migrate/20240101_create_channel_voice.rb",
    "sample/app.module.ts",
    "src/__tests__/util.ts",
    "pkg/store/store_test.go",
    "src/main/java/com/x/FooTest.java",
    "spec/models/user_spec.rb",
    "tests/test_parser.py",
    "vendor/lib/thing.go",
  ];
  const producto = ["src/server/services/code-analyzer.ts", "lib/rubocop/cop/lint.rb", "hugolib/pages_capture.go", "app/models/contact.rb"];

  it("descarta los directorios y nombres que por convención no son código de producto", () => {
    for (const r of noProducto) expect(esRutaDeProducto(r), r).toBe(false);
  });

  it("no descarta código de producto", () => {
    for (const r of producto) expect(esRutaDeProducto(r), r).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * PARTE 2 — EL ARNÉS: el walker de clones, reconstruido
 * ══════════════════════════════════════════════════════════════════════════ */

function normalizar(t: string): string {
  return t.replace(/\s+/g, " ").trim();
}

/** Todos los clones candidatos del archivo, con la clase/función que los contiene —
 *  mismo reparto de datos que `code-analyzer.ts` escribe en `CloneCandidate`. */
/** Huella ESTRUCTURAL (tipos de nodo, sin identificadores ni literales) — la
 *  misma nocion que `code-analyzer.ts` hashea: una copia renombrada matchea.
 *  El arnes la calcula asi a proposito: con una huella de TEXTO, dos cuerpos
 *  "de igual estructura" no formarian grupo y la compuerta `cuerpos-identicos`
 *  nunca llegaria a evaluarse. */
function contarNodos(n: AstNode): number {
  let total = 1;
  for (let i = 0; i < n.childCount; i++) {
    const c = n.child(i) as AstNode | null;
    if (c) total += contarNodos(c);
  }
  return total;
}

function huella(n: AstNode): string {
  const partes: string[] = [n.type];
  for (let i = 0; i < n.childCount; i++) {
    const c = n.child(i) as AstNode | null;
    if (c && c.isNamed) partes.push(huella(c));
  }
  return partes.length === 1 ? n.type : `${n.type}(${partes.slice(1).join(",")})`;
}

function clonesDe(file: FileUnit): CloneCandidate[] {
  const out: CloneCandidate[] = [];
  const clases: { nombre: string | null; base: string | null }[] = [];
  const funcs: (string | null)[] = [];
  const visit = (n: AstNode): void => {
    let pushC = false;
    let pushF = false;
    if (n.isNamed && file.sets.classNodes.has(n.type)) {
      clases.push({
        nombre: (n.childForFieldName("name") as AstNode | null)?.text ?? null,
        base: (n.childForFieldName("superclass") as AstNode | null)?.text?.replace(/^<\s*/, "") ?? null,
      });
      pushC = true;
    }
    if (n.isNamed && file.sets.functionNodes.has(n.type)) {
      funcs.push((n.childForFieldName("name") as AstNode | null)?.text ?? null);
      pushF = true;
    }
    if (n.isNamed) {
      out.push({
        fingerprint: huella(n),
        file: file.path,
        startLine: n.startPosition.row + 1,
        endLine: n.endPosition.row + 1,
        nodes: contarNodos(n),
        type: n.type,
        functionName: funcs[funcs.length - 1] ?? null,
        className: clases[clases.length - 1]?.nombre ?? null,
        superclassName: clases[clases.length - 1]?.base ?? null,
        normalized: normalizar(n.text),
      });
    }
    for (let i = 0; i < n.childCount; i++) {
      const c = n.child(i) as AstNode | null;
      if (c) visit(c);
    }
    if (pushF) funcs.pop();
    if (pushC) clases.pop();
  };
  visit(file.root as AstNode);
  return out;
}

/** El grupo de clones idénticos MÁS GRANDE que no es una declaración de función/clase. */
function grupoDeFragmentos(file: FileUnit): CloneCandidate[] {
  const porHuella = new Map<string, CloneCandidate[]>();
  for (const c of clonesDe(file)) {
    if (file.sets.functionNodes.has(c.type) || file.sets.classNodes.has(c.type)) continue;
    const l = porHuella.get(c.fingerprint);
    if (l) l.push(c);
    else porHuella.set(c.fingerprint, [c]);
  }
  const grupos = [...porHuella.values()].filter((g) => g.length >= 2);
  grupos.sort((a, b) => b[0]!.endLine - b[0]!.startLine - (a[0]!.endLine - a[0]!.startLine));
  return grupos[0] ?? [];
}

function fakeThreshold(): Threshold {
  return resolveThreshold(pisoDeclarado(1, { rationale: "test" }), { language: "typescript", sampleSize: () => 0, corpusP95: () => null });
}

function findingDe(grupo: readonly CloneCandidate[], kind = "duplication"): Finding {
  return {
    id: "f-dup-1",
    detectorId: kind,
    kind: kind as Finding["kind"],
    scope: "inter-file",
    language: null,
    title: `${grupo.length} fragmentos idénticos`,
    detail: "d",
    trigger: [{ label: "copias", value: grupo.length, threshold: fakeThreshold() }],
    locations: grupo.map((c, i) => ({ file: c.file, startLine: c.startLine, endLine: c.endLine, role: `copia ${i + 1}` })) as unknown as Finding["locations"],
    severity: 50,
    advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
  };
}

function ctxFor(files: readonly FileUnit[], clones: readonly CloneCandidate[]): HypothesisContext {
  const porRuta = new Map(files.map((f) => [f.path, f]));
  return {
    file: files[0] ?? null,
    fileAt: (p: string) => porRuta.get(p) ?? null,
    repo: { repoName: "r", files: files.map((f) => ({ path: f.path, lines: f.lines, language: f.language })), functions: [], clones, graph: null },
    capabilities: new Set<Capability>(),
    setsFor: (lang: string) => files.find((f) => f.language === lang)?.sets ?? files[0]!.sets,
    neighborhood: EMPTY_NEIGHBORHOOD,
    branches: () => null,
  };
}

async function unit(wasm: string, probe: string, source: string, language: string, path: string): Promise<FileUnit> {
  const [sets, root] = await Promise.all([nodeSetsFor(wasm, probe), parseRoot(wasm, source)]);
  return fileUnitFrom(root, sets, language, { file: path });
}

/* ══════════════════════════════════════════════════════════════════════════
 * PARTE 3 — LOS SEIS LENGUAJES, CON ÁRBOL REAL
 * ══════════════════════════════════════════════════════════════════════════ */

interface Caso {
  readonly lenguaje: string;
  readonly wasm: string;
  readonly probe: string;
  readonly ext: string;
  /** Dos funciones con nombres distintos y cuerpos idénticos de >= 8 líneas, sin salto. */
  readonly duplicado: string;
  /** Lo mismo, pero con un salto de control adentro del bloque. */
  readonly conSalto: string;
}

const CASOS: readonly Caso[] = [
  {
    lenguaje: "typescript",
    ext: "ts",
    wasm: "tree-sitter-typescript.wasm",
    probe: `function top(x: number): number { if (x > 0) { return 1; } else if (x < 0) { return 2; } else { return 3; } }\nclass P { m(x: number): void { if (x > 0) { this.m(1); } else { this.m(2); } switch (x) { case 1: break; default: break; } try { this.m(x); } catch (e) { this.m(x); } for (const y of []) { this.m(1); } } }`,
    duplicado: `function alpha(x: number): void {
  log("solo-alpha");
  if (x > 0) {
    const a = x + 1;
    const b = a * 2;
    const c = b - 3;
    const d = c * 4;
    const e = d + 5;
    const f = e * 6;
    const g = f - 7;
    sink(g);
  }
}
function beta(x: number, y: number): void {
  other(y);
  if (x > 0) {
    const a = x + 1;
    const b = a * 2;
    const c = b - 3;
    const d = c * 4;
    const e = d + 5;
    const f = e * 6;
    const g = f - 7;
    sink(g);
  }
}`,
    conSalto: `function alpha(x: number): number {
  log("solo-alpha");
  if (x > 0) {
    const a = x + 1;
    const b = a * 2;
    const c = b - 3;
    const d = c * 4;
    const e = d + 5;
    const f = e * 6;
    const g = f - 7;
    return g;
  }
  return 0;
}
function beta(x: number, y: number): number {
  other(y);
  if (x > 0) {
    const a = x + 1;
    const b = a * 2;
    const c = b - 3;
    const d = c * 4;
    const e = d + 5;
    const f = e * 6;
    const g = f - 7;
    return g;
  }
  return 0;
}`,
  },
  {
    lenguaje: "python",
    ext: "py",
    wasm: "tree-sitter-python.wasm",
    probe: `class P:\n    def m(self, x):\n        if x > 0:\n            return 1\n        elif x < 0:\n            return 2\n        else:\n            return 3\n        for y in []:\n            pass\n        try:\n            pass\n        except Exception:\n            pass\ndef top(x):\n    return x`,
    duplicado: `def alpha(x):
    log("solo-alpha")
    if x > 0:
        a = x + 1
        b = a * 2
        c = b - 3
        d = c * 4
        e = d + 5
        f = e * 6
        g = f - 7
        sink(g)

def beta(x, y):
    other(y)
    if x > 0:
        a = x + 1
        b = a * 2
        c = b - 3
        d = c * 4
        e = d + 5
        f = e * 6
        g = f - 7
        sink(g)`,
    conSalto: `def alpha(x):
    log("solo-alpha")
    if x > 0:
        a = x + 1
        b = a * 2
        c = b - 3
        d = c * 4
        e = d + 5
        f = e * 6
        g = f - 7
        return g

def beta(x, y):
    other(y)
    if x > 0:
        a = x + 1
        b = a * 2
        c = b - 3
        d = c * 4
        e = d + 5
        f = e * 6
        g = f - 7
        return g`,
  },
  {
    lenguaje: "ruby",
    ext: "rb",
    wasm: "tree-sitter-ruby.wasm",
    probe: `class P\n  def m(x)\n    if x > 0\n      1\n    elsif x < 0\n      2\n    else\n      3\n    end\n    case x\n    when 1 then 1\n    else 2\n    end\n    begin\n      1\n    rescue => e\n      2\n    end\n    while x > 0 do\n      x\n    end\n  end\nend\ndef top(x)\n  x\nend`,
    duplicado: `def alpha(x)
  log("solo-alpha")
  if x > 0
    a = x + 1
    b = a * 2
    c = b - 3
    d = c * 4
    e = d + 5
    f = e * 6
    g = f - 7
    sink(g)
  end
end

def beta(x, y)
  other(y)
  if x > 0
    a = x + 1
    b = a * 2
    c = b - 3
    d = c * 4
    e = d + 5
    f = e * 6
    g = f - 7
    sink(g)
  end
end`,
    conSalto: `def alpha(x)
  log("solo-alpha")
  if x > 0
    a = x + 1
    b = a * 2
    c = b - 3
    d = c * 4
    e = d + 5
    f = e * 6
    g = f - 7
    return g
  end
end

def beta(x, y)
  other(y)
  if x > 0
    a = x + 1
    b = a * 2
    c = b - 3
    d = c * 4
    e = d + 5
    f = e * 6
    g = f - 7
    return g
  end
end`,
  },
  {
    lenguaje: "go",
    ext: "go",
    wasm: "tree-sitter-go.wasm",
    probe: `package p\nfunc top(x int) int { if x > 0 { return 1 } else if x < 0 { return 2 } else { return 3 } }\ntype P struct{}\nfunc (p P) m(x int) { switch x { case 1: } for i := 0; i < 3; i++ { } }`,
    duplicado: `package p

func alpha(x int) {
	log("solo-alpha")
	if x > 0 {
		a := x + 1
		b := a * 2
		c := b - 3
		d := c * 4
		e := d + 5
		f := e * 6
		g := f - 7
		sink(g)
	}
}

func beta(x int, y int) {
	other(y)
	if x > 0 {
		a := x + 1
		b := a * 2
		c := b - 3
		d := c * 4
		e := d + 5
		f := e * 6
		g := f - 7
		sink(g)
	}
}`,
    conSalto: `package p

func alpha(x int) int {
	log("solo-alpha")
	if x > 0 {
		a := x + 1
		b := a * 2
		c := b - 3
		d := c * 4
		e := d + 5
		f := e * 6
		g := f - 7
		return g
	}
	return 0
}

func beta(x int, y int) int {
	other(y)
	if x > 0 {
		a := x + 1
		b := a * 2
		c := b - 3
		d := c * 4
		e := d + 5
		f := e * 6
		g := f - 7
		return g
	}
	return 0
}`,
  },
  {
    lenguaje: "java",
    ext: "java",
    wasm: "tree-sitter-java.wasm",
    probe: `class P {\n  int top(int x) { if (x > 0) { return 1; } else if (x < 0) { return 2; } else { return 3; } }\n  void m(int x) { switch (x) { case 1: break; default: break; } try { } catch (Exception e) { } for (int i = 0; i < 3; i++) { } }\n}`,
    duplicado: `class Holder {
  void alpha(int x) {
    log("solo-alpha");
    if (x > 0) {
      int a = x + 1;
      int b = a * 2;
      int c = b - 3;
      int d = c * 4;
      int e = d + 5;
      int f = e * 6;
      int g = f - 7;
      sink(g);
    }
  }
  void beta(int x, int y) {
    other(y);
    if (x > 0) {
      int a = x + 1;
      int b = a * 2;
      int c = b - 3;
      int d = c * 4;
      int e = d + 5;
      int f = e * 6;
      int g = f - 7;
      sink(g);
    }
  }
}`,
    conSalto: `class Holder {
  int alpha(int x) {
    log("solo-alpha");
    if (x > 0) {
      int a = x + 1;
      int b = a * 2;
      int c = b - 3;
      int d = c * 4;
      int e = d + 5;
      int f = e * 6;
      int g = f - 7;
      return g;
    }
    return 0;
  }
  int beta(int x, int y) {
    other(y);
    if (x > 0) {
      int a = x + 1;
      int b = a * 2;
      int c = b - 3;
      int d = c * 4;
      int e = d + 5;
      int f = e * 6;
      int g = f - 7;
      return g;
    }
    return 0;
  }
}`,
  },
  {
    lenguaje: "csharp",
    ext: "cs",
    wasm: "tree-sitter-c_sharp.wasm",
    probe: `class P {\n  int Top(int x) { if (x > 0) { return 1; } else if (x < 0) { return 2; } else { return 3; } }\n  void M(int x) { switch (x) { case 1: break; default: break; } try { } catch (Exception e) { } for (int i = 0; i < 3; i++) { } foreach (var y in new int[0]) { } }\n}`,
    duplicado: `class Holder {
  void Alpha(int x) {
    Log("solo-alpha");
    if (x > 0) {
      int a = x + 1;
      int b = a * 2;
      int c = b - 3;
      int d = c * 4;
      int e = d + 5;
      int f = e * 6;
      int g = f - 7;
      Sink(g);
    }
  }
  void Beta(int x, int y) {
    Other(y);
    if (x > 0) {
      int a = x + 1;
      int b = a * 2;
      int c = b - 3;
      int d = c * 4;
      int e = d + 5;
      int f = e * 6;
      int g = f - 7;
      Sink(g);
    }
  }
}`,
    conSalto: `class Holder {
  int Alpha(int x) {
    Log("solo-alpha");
    if (x > 0) {
      int a = x + 1;
      int b = a * 2;
      int c = b - 3;
      int d = c * 4;
      int e = d + 5;
      int f = e * 6;
      int g = f - 7;
      return g;
    }
    return 0;
  }
  int Beta(int x, int y) {
    Other(y);
    if (x > 0) {
      int a = x + 1;
      int b = a * 2;
      int c = b - 3;
      int d = c * 4;
      int e = d + 5;
      int f = e * 6;
      int g = f - 7;
      return g;
    }
    return 0;
  }
}`,
  },
];

describe("extract-duplicated-method — los seis lenguajes, con árbol real", () => {
  for (const caso of CASOS) {
    it(`${caso.lenguaje}: dos bloques idénticos de >= 8 líneas sin salto ⇒ propone extraer`, async () => {
      const file = await unit(caso.wasm, caso.probe, caso.duplicado, caso.lenguaje, `src/app.${caso.ext}`);
      const grupo = grupoDeFragmentos(file);
      expect(grupo.length, `sin grupo de fragmentos en ${caso.lenguaje}`).toBeGreaterThanOrEqual(2);
      expect(grupo[0]!.endLine - grupo[0]!.startLine + 1, `bloque corto en ${caso.lenguaje}`).toBeGreaterThanOrEqual(8);

      const problem = findingDe(grupo);
      const h = extractDuplicatedMethod.build(problem, null, ctxFor([file], clonesDe(file)));
      expect(h, `${caso.lenguaje}: no emitió`).not.toBeNull();
      expect(h!.state).toBe("ausente");
      expect(h!.places.length).toBe(grupo.length);
      expect(h!.checks.every((c) => c.passed)).toBe(true);
      // Nunca un estado confirmado: es lo que garantiza que no puede retirar
      // una verdadera de los 19 patrones vía `arbitrateRivalHypotheses`.
      expect(["ya-aplicado", "aplicado-eludido"]).not.toContain(h!.state);
    });

    it(`${caso.lenguaje}: el mismo bloque CON un salto de control ⇒ NO propone (extraerlo cambiaría el flujo)`, async () => {
      const file = await unit(caso.wasm, caso.probe, caso.conSalto, caso.lenguaje, `src/app.${caso.ext}`);
      const grupo = grupoDeFragmentos(file);
      expect(grupo.length).toBeGreaterThanOrEqual(2);

      startExtractDuplicatedMethodTrace();
      const h = extractDuplicatedMethod.build(findingDe(grupo), null, ctxFor([file], clonesDe(file)));
      const traza = takeExtractDuplicatedMethodTrace();
      expect(h, `${caso.lenguaje}: emitió sobre un bloque con salto`).toBeNull();
      expect(traza[0]?.diesAt, `${caso.lenguaje}: murió en otra compuerta`).toBe("sin-salto-de-control");
    });
  }
});

describe("extract-duplicated-method — las compuertas, una por una", () => {
  it("copias en archivos DISTINTOS ⇒ no aplica (ése es el terreno de Pull Up)", async () => {
    const caso = CASOS[0]!;
    const a = await unit(caso.wasm, caso.probe, caso.duplicado, caso.lenguaje, "src/a.ts");
    const b = await unit(caso.wasm, caso.probe, caso.duplicado, caso.lenguaje, "src/b.ts");
    const ga = grupoDeFragmentos(a);
    const gb = grupoDeFragmentos(b);
    const grupo = [ga[0]!, { ...gb[0]!, file: "src/b.ts" }];
    startExtractDuplicatedMethodTrace();
    const h = extractDuplicatedMethod.build(findingDe(grupo), null, ctxFor([a, b], [...clonesDe(a), ...clonesDe(b).map((c) => ({ ...c, file: "src/b.ts" }))]));
    const traza = takeExtractDuplicatedMethodTrace();
    expect(h).toBeNull();
    expect(traza[0]?.diesAt).toBe("copias-en-el-mismo-archivo");
  });

  it("una copia en `spec/` ⇒ no aplica (la repetición en pruebas es deliberada)", async () => {
    const caso = CASOS[0]!;
    const file = await unit(caso.wasm, caso.probe, caso.duplicado, caso.lenguaje, "spec/app.ts");
    const grupo = grupoDeFragmentos(file);
    startExtractDuplicatedMethodTrace();
    const h = extractDuplicatedMethod.build(findingDe(grupo), null, ctxFor([file], clonesDe(file)));
    const traza = takeExtractDuplicatedMethodTrace();
    expect(h).toBeNull();
    expect(traza[0]?.diesAt).toBe("codigo-de-producto");
  });

  it("sin árbol vivo NO se emite: un `required` que aprueba por no poder mirar no es un `required`", async () => {
    const caso = CASOS[0]!;
    const file = await unit(caso.wasm, caso.probe, caso.duplicado, caso.lenguaje, "src/app.ts");
    const grupo = grupoDeFragmentos(file);
    const ctx = ctxFor([file], clonesDe(file));
    const ciego: HypothesisContext = { ...ctx, file: null, fileAt: () => null };
    expect(extractDuplicatedMethod.build(findingDe(grupo), null, ciego)).toBeNull();
  });

  it("un hallazgo cuyas ubicaciones no cruzan contra `repo.clones` no emite nada (nunca inventa el grupo)", async () => {
    const caso = CASOS[0]!;
    const file = await unit(caso.wasm, caso.probe, caso.duplicado, caso.lenguaje, "src/app.ts");
    const grupo = grupoDeFragmentos(file);
    const problem = findingDe(grupo);
    expect(reconstruirGrupo(problem, [])).toBeNull();
    expect(extractDuplicatedMethod.build(problem, null, ctxFor([file], []))).toBeNull();
  });

  it("EL CASO `excalidraw App.tsx:12470`: un apóstrofo dentro de un COMENTARIO no puede tapar la diferencia real", async () => {
    // Los dos bloques difieren en `startBinding` contra `endBinding` — posición
    // de MIEMBRO — y el comentario lleva `don\'t`. Con un lexer de TEXTO, ese
    // apóstrofo abre un literal que se come el resto del bloque y la familia
    // emitía la propuesta. Con los tokens del ÁRBOL, el comentario se saltea y
    // la diferencia real queda a la vista.
    const caso = CASOS[0]!;
    const fuente = `function alpha(a: any, element: any): void {
  if (a?.startBinding?.elementId === element.id) {
    // NOTE: raw mutate because we don't want history
    // entries or multiplayer updates
    mutate(
      a,
      this.scene.getElementsMapIncludingDeleted(),
      { startBinding: null },
    );
  }
  if (a?.endBinding?.elementId === element.id) {
    // NOTE: raw mutate because we don't want history
    // entries or multiplayer updates
    mutate(
      a,
      this.scene.getElementsMapIncludingDeleted(),
      { endBinding: null },
    );
  }
}`;
    const file = await unit(caso.wasm, caso.probe, fuente, caso.lenguaje, "src/app.ts");
    const clones = clonesDe(file);
    const ifs = clones.filter((c) => c.type === "if_statement");
    expect(ifs.length).toBe(2);
    const grupo = [ifs[0]!, ifs[1]!];
    startExtractDuplicatedMethodTrace();
    const h = extractDuplicatedMethod.build(findingDe(grupo), null, ctxFor([file], clones));
    const traza = takeExtractDuplicatedMethodTrace();
    expect(h, "emitió sobre dos bloques que difieren en QUÉ campo tocan").toBeNull();
    expect(traza[0]?.diesAt).toBe("copias-equivalentes");
    expect(traza[0]?.razon).toContain("MIEMBRO");
  });

  it("un comentario distinto entre las dos copias NO cuenta como diferencia (los comentarios no se tokenizan)", async () => {
    const caso = CASOS[0]!;
    const fuente = `function alpha(x: number): void {
  log("solo-alpha");
  if (x > 0) {
    // primer comentario, distinto en cada copia
    const a = x + 1;
    const b = a * 2;
    const c = b - 3;
    const d = c * 4;
    const e = d + 5;
    const f = e * 6;
    const g = f - 7;
    sink(g);
  }
}
function beta(x: number, y: number): void {
  other(y);
  if (x > 0) {
    // segundo comentario, no debería importar
    const a = x + 1;
    const b = a * 2;
    const c = b - 3;
    const d = c * 4;
    const e = d + 5;
    const f = e * 6;
    const g = f - 7;
    sink(g);
  }
}`;
    const file = await unit(caso.wasm, caso.probe, fuente, caso.lenguaje, "src/app.ts");
    const clones = clonesDe(file);
    const ifs = clones.filter((c) => c.type === "if_statement");
    expect(ifs.length).toBe(2);
    const h = extractDuplicatedMethod.build(findingDe([ifs[0]!, ifs[1]!]), null, ctxFor([file], clones));
    expect(h, "un comentario distinto no debe impedir la propuesta").not.toBeNull();
  });

  it("EL CASO `newtonsoft-json JsonSerializerInternalReader.cs:1297`: el CONTENIDO de un literal de texto no puede desaparecer", async () => {
    // En tree-sitter C# el texto entre comillas NO es hijo del nodo
    // `string_literal`, asi que un recorrido de hojas devolvia `" "` y dos
    // mensajes de error distintos quedaban comparados como iguales. Este test
    // ejercita las SEIS gramaticas: si alguna esconde su contenido igual que
    // C#, la red de seguridad de `tokensDelNodo` tiene que agarrarlo.
    for (const caso of CASOS) {
      const file = await unit(caso.wasm, caso.probe, caso.duplicado, caso.lenguaje, `src/app.${caso.ext}`);
      const clones = clonesDe(file);
      const conTexto = clones.filter((c) => c.normalized.includes("solo-alpha"));
      expect(conTexto.length, `${caso.lenguaje}: sin nodo con el literal`).toBeGreaterThan(0);
      const nodo = (() => {
        let hallado: AstNode | null = null;
        walkTree(file.root as AstNode, (n) => {
          const a = n as AstNode;
          if (!hallado && a.text.includes("solo-alpha") && a.childCount > 0 && a.text.length < 40) hallado = a;
        });
        return hallado as AstNode | null;
      })();
      expect(nodo, `${caso.lenguaje}: sin nodo`).not.toBeNull();
      const textos = tokensDelNodo(nodo!)
        .map((t) => t.texto)
        .join(" ");
      expect(textos, `${caso.lenguaje}: el contenido del literal se perdió`).toContain("solo-alpha");
    }
  });

  it("el registro declara ancla y patrón, y el ancla es `duplication`", () => {
    expect(extractDuplicatedMethod.anchors).toEqual(["duplication"]);
    expect(extractDuplicatedMethod.pattern).toBe("Extract Duplicated Method");
    expect(extractDuplicatedMethod.id).toBe("extract-duplicated-method");
  });
});
