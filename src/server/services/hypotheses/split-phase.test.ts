/**
 * `split-phase.test.ts` — Ola AT, frente AT4.
 *
 * Árboles REALES y LOS SEIS LENGUAJES, por la razón de siempre (la trampa de
 * `state.ts#SELF_PREFIX`). Acá el riesgo concreto es la lectura de
 * DECLARACIONES: cada gramática nombra distinto el nodo que ata un nombre a un
 * valor (`lexical_declaration`, `short_var_declaration`, `assignment`,
 * `local_variable_declaration`, `local_declaration_statement`) y un solo
 * lenguaje mal leído deja a la familia contando cero locales y muda para
 * siempre, sin que nada se ponga rojo.
 */
import { describe, expect, it } from "vitest";

import type { Capability } from "../detect/capabilities.js";
import { fileUnitFrom, nodeSetsFor, parseRoot } from "../detect/testing.js";
import { pisoDeclarado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import type { FileUnit, Finding } from "../detect/types.js";
import { EMPTY_NEIGHBORHOOD } from "../graph/neighborhood.js";
import { hypothesis as splitPhase, startSplitPhaseTrace, takeSplitPhaseTrace } from "./split-phase.js";
import type { HypothesisContext } from "./types.js";

function fakeThreshold(): Threshold {
  return resolveThreshold(pisoDeclarado(15, { rationale: "test" }), { language: "typescript", sampleSize: () => 0, corpusP95: () => null });
}

function finding(kind: string, file: FileUnit, symbol: string, startLine: number, endLine: number): Finding {
  return {
    id: `f-${kind}-1`, detectorId: kind, kind: kind as Finding["kind"], scope: "intra-function", language: file.language,
    title: symbol, detail: "d", trigger: [{ label: "x", value: 30, threshold: fakeThreshold() }],
    locations: [{ file: file.path, startLine, endLine, symbol, role: "r" }],
    severity: 50, advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
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
  return fileUnitFrom(root, sets, language, { file: `fixture.${language}`, metrics: { cognitive: 20, chain: 0 } });
}

function target(file: FileUnit, name: string): { symbol: string; startLine: number; endLine: number } {
  const fn = file.functions.find((f) => (f.name ?? "").toLowerCase() === name.toLowerCase()) ?? file.functions[file.functions.length - 1];
  if (!fn) throw new Error(`sin función ${name} en ${file.language}`);
  return { symbol: fn.name ?? "?", startLine: fn.startLine, endLine: fn.endLine };
}

interface Caso {
  readonly lenguaje: string;
  readonly wasm: string;
  readonly probe: string;
  /** Dos fases con una frontera de un solo valor. */
  readonly dosFases: string;
  /** La segunda mitad le escribe a una local de la primera. */
  readonly escrituraHaciaAtras: string;
  /** Todas las locales cruzan: no hay frontera estrecha en ningún punto. */
  readonly fronteraAncha: string;
}

const CASOS: readonly Caso[] = [
  {
    lenguaje: "typescript",
    wasm: "tree-sitter-typescript.wasm",
    probe: `function top(x: number): number { if (x > 0) { return 1; } else if (x < 0) { return 2; } else { return 3; } }\nclass P { m(x: number): void { if (x > 0) { this.m(1); } else if (x < 0) { this.m(2); } else { this.m(3); } switch (x) { case 1: this.m(1); break; default: break; } try { this.m(x); } catch (e) { this.m(x); } for (const y of []) { this.m(1); } } }`,
    dosFases: `function price(order: O, plan: P): number {
  const basePrice = order.q * order.p;
  const discount = order.q * order.p;
  const weight = order.q * plan.w;
  const region = plan.r;
  const shipping = weight * region;
  const total = basePrice - discount + shipping;
  const out = total * 2;
  const out2 = out + 1;
  const extra = out2 * 3;
  return extra;
}`,
    escrituraHaciaAtras: `function price(order: O, plan: P): number {
  const basePrice = order.q * order.p;
  const discount = order.q * order.p;
  const weight = order.q * plan.w;
  const region = plan.r;
  const shipping = weight * region;
  let total = basePrice - discount + shipping;
  const out = total * 2;
  total = out + 1;
  const extra = total * 3;
  return extra;
}`,
    fronteraAncha: `function price(order: O, plan: P): number {
  const a = order.q;
  const b = order.p;
  const c = plan.w;
  const d = plan.r;
  const e = a + b;
  const f = c + d;
  const g = e + f;
  const h = a + b + c;
  const i = d + e + f;
  return a + b + c + d + e + f + g + h + i;
}`,
  },
  {
    lenguaje: "python",
    wasm: "tree-sitter-python.wasm",
    probe: `class P:\n    def m(self, x):\n        if x > 0:\n            return 1\n        elif x < 0:\n            return 2\n        else:\n            return 3\n        for y in []:\n            pass\n        try:\n            pass\n        except Exception:\n            pass\ndef top(x):\n    return x`,
    dosFases: `def price(order, plan):
    base_price = order.q * order.p
    discount = order.q * order.p
    weight = order.q * plan.w
    region = plan.r
    shipping = weight * region
    total = base_price - discount + shipping
    out = total * 2
    out2 = out + 1
    extra = out2 * 3
    return extra`,
    escrituraHaciaAtras: `def price(order, plan):
    base_price = order.q * order.p
    discount = order.q * order.p
    weight = order.q * plan.w
    region = plan.r
    shipping = weight * region
    total = base_price - discount + shipping
    out = total * 2
    total = out + 1
    extra = total * 3
    return extra`,
    fronteraAncha: `def price(order, plan):
    a = order.q
    b = order.p
    c = plan.w
    d = plan.r
    e = a + b
    f = c + d
    g = e + f
    h = a + b + c
    i = d + e + f
    return a + b + c + d + e + f + g + h + i`,
  },
  {
    lenguaje: "ruby",
    wasm: "tree-sitter-ruby.wasm",
    probe: `class P\n  def m(x)\n    if x > 0\n      1\n    elsif x < 0\n      2\n    else\n      3\n    end\n    case x\n    when 1 then 1\n    else 2\n    end\n    begin\n      1\n    rescue => e\n      2\n    end\n    while x > 0 do\n      x\n    end\n  end\nend\ndef top(x)\n  x\nend`,
    dosFases: `def price(order, plan)
  base_price = order.q * order.p
  discount = order.q * order.p
  weight = order.q * plan.w
  region = plan.r
  shipping = weight * region
  total = base_price - discount + shipping
  out = total * 2
  out2 = out + 1
  extra = out2 * 3
  extra
end`,
    escrituraHaciaAtras: `def price(order, plan)
  base_price = order.q * order.p
  discount = order.q * order.p
  weight = order.q * plan.w
  region = plan.r
  shipping = weight * region
  total = base_price - discount + shipping
  out = total * 2
  total = out + 1
  extra = total * 3
  extra
end`,
    fronteraAncha: `def price(order, plan)
  a = order.q
  b = order.p
  c = plan.w
  d = plan.r
  e = a + b
  f = c + d
  g = e + f
  h = a + b + c
  i = d + e + f
  a + b + c + d + e + f + g + h + i
end`,
  },
  {
    lenguaje: "go",
    wasm: "tree-sitter-go.wasm",
    probe: `package p\nfunc top(x int) int { if x > 0 { return 1 } else if x < 0 { return 2 } else { return 3 } }\ntype P struct{}\nfunc (p P) m(x int) { switch x { case 1: } for i := 0; i < 3; i++ { } }`,
    dosFases: `package p
func price(order O, plan P) int {
	basePrice := order.Q * order.P
	discount := order.Q * order.P
	weight := order.Q * plan.W
	region := plan.R
	shipping := weight * region
	total := basePrice - discount + shipping
	out := total * 2
	out2 := out + 1
	extra := out2 * 3
	return extra
}`,
    escrituraHaciaAtras: `package p
func price(order O, plan P) int {
	basePrice := order.Q * order.P
	discount := order.Q * order.P
	weight := order.Q * plan.W
	region := plan.R
	shipping := weight * region
	total := basePrice - discount + shipping
	out := total * 2
	total = out + 1
	extra := total * 3
	return extra
}`,
    fronteraAncha: `package p
func price(order O, plan P) int {
	a := order.Q
	b := order.P
	c := plan.W
	d := plan.R
	e := a + b
	f := c + d
	g := e + f
	h := a + b + c
	i := d + e + f
	return a + b + c + d + e + f + g + h + i
}`,
  },
  {
    lenguaje: "java",
    wasm: "tree-sitter-java.wasm",
    probe: `class P {\n  int top(int x) { if (x > 0) { return 1; } else if (x < 0) { return 2; } else { return 3; } }\n  void m(int x) { switch (x) { case 1: break; default: break; } try { } catch (Exception e) { } for (int i = 0; i < 3; i++) { } }\n}`,
    dosFases: `class C {
  int price(O order, P plan) {
    int basePrice = order.q * order.p;
    int discount = order.q * order.p;
    int weight = order.q * plan.w;
    int region = plan.r;
    int shipping = weight * region;
    int total = basePrice - discount + shipping;
    int out = total * 2;
    int out2 = out + 1;
    int extra = out2 * 3;
    return extra;
  }
}`,
    escrituraHaciaAtras: `class C {
  int price(O order, P plan) {
    int basePrice = order.q * order.p;
    int discount = order.q * order.p;
    int weight = order.q * plan.w;
    int region = plan.r;
    int shipping = weight * region;
    int total = basePrice - discount + shipping;
    int out = total * 2;
    total = out + 1;
    int extra = total * 3;
    return extra;
  }
}`,
    fronteraAncha: `class C {
  int price(O order, P plan) {
    int a = order.q;
    int b = order.p;
    int c = plan.w;
    int d = plan.r;
    int e = a + b;
    int f = c + d;
    int g = e + f;
    int h = a + b + c;
    int i = d + e + f;
    return a + b + c + d + e + f + g + h + i;
  }
}`,
  },
  {
    lenguaje: "csharp",
    wasm: "tree-sitter-c_sharp.wasm",
    probe: `class P {\n  int Top(int x) { if (x > 0) { return 1; } else if (x < 0) { return 2; } else { return 3; } }\n  void M(int x) { switch (x) { case 1: break; default: break; } try { } catch (Exception e) { } for (int i = 0; i < 3; i++) { } foreach (var y in new int[0]) { } }\n}`,
    dosFases: `class C {
  int Price(O order, P plan) {
    int basePrice = order.q * order.p;
    int discount = order.q * order.p;
    int weight = order.q * plan.w;
    int region = plan.r;
    int shipping = weight * region;
    int total = basePrice - discount + shipping;
    int outv = total * 2;
    int out2 = outv + 1;
    int extra = out2 * 3;
    return extra;
  }
}`,
    escrituraHaciaAtras: `class C {
  int Price(O order, P plan) {
    int basePrice = order.q * order.p;
    int discount = order.q * order.p;
    int weight = order.q * plan.w;
    int region = plan.r;
    int shipping = weight * region;
    int total = basePrice - discount + shipping;
    int outv = total * 2;
    total = outv + 1;
    int extra = total * 3;
    return extra;
  }
}`,
    fronteraAncha: `class C {
  int Price(O order, P plan) {
    int a = order.q;
    int b = order.p;
    int c = plan.w;
    int d = plan.r;
    int e = a + b;
    int f = c + d;
    int g = e + f;
    int h = a + b + c;
    int i = d + e + f;
    return a + b + c + d + e + f + g + h + i;
  }
}`,
  },
];

function correr(file: FileUnit, kind = "complexity", nombre = "price") {
  const t = target(file, nombre);
  startSplitPhaseTrace();
  const h = splitPhase.build(finding(kind, file, t.symbol, t.startLine, t.endLine), null, ctxFor(file));
  const traza = takeSplitPhaseTrace()[0];
  return { h, traza };
}

describe("Split Phase — los seis lenguajes", () => {
  for (const caso of CASOS) {
    describe(caso.lenguaje, () => {
      it("encuentra el corte donde casi todas las locales mueren", async () => {
        const file = await unit(caso.wasm, caso.probe, caso.dosFases, caso.lenguaje);
        const { h, traza } = correr(file);
        expect(traza?.diesAt).toBeNull();
        expect(h).not.toBeNull();
        expect(h?.pattern).toBe("Split Phase");
        // Seis locales declaradas antes del corte y UNA sola cruza: es el hecho que la familia afirma.
        expect(traza?.declaraciones).toBeGreaterThanOrEqual(4);
        expect(traza?.puente.length).toBe(1);
        expect(h?.places).toHaveLength(2);
      });

      it("calla cuando la segunda mitad le escribe a una local de la primera", async () => {
        const file = await unit(caso.wasm, caso.probe, caso.escrituraHaciaAtras, caso.lenguaje);
        const { h, traza } = correr(file);
        expect(h).toBeNull();
        expect(traza?.diesAt).toBe("sin-escritura-hacia-atras");
      });

      it("calla cuando no hay ningún punto con una frontera estrecha", async () => {
        const file = await unit(caso.wasm, caso.probe, caso.fronteraAncha, caso.lenguaje);
        const { h, traza } = correr(file);
        expect(h).toBeNull();
        expect(traza?.diesAt).toBe("dos-fases");
      });
    });
  }

  /**
   * MEDIDO EN `nest` — `scanner.ts#scanForModules` salió con 59 líneas de un
   * lado y 8 del otro, y la "segunda fase" eran tres sentencias de retorno.
   * Señalarle a alguien la COLA de su función y llamarla "segunda fase" es
   * peor que callarse. El equilibrio dejó de ser un discriminador.
   */
  it("MEDIDO EN `nest` — una cola de tres sentencias no es una segunda fase", async () => {
    const caso = CASOS[0]!;
    const fuente = `function scan(mod: M, ctx: C): M[] {
  const a = mod.one;
  const b = mod.two;
  const c = mod.three;
  const d = mod.four;
  const e = mod.five;
  const f = mod.six;
  const g = mod.seven;
  const h = mod.eight;
  const i = mod.nine;
  const j = mod.ten;
  const registered = a + b + c + d + e + f + g + h + i + j;
  if (!ctx.ok) { return [registered]; }
  return [registered, 1];
}`;
    const file = await unit(caso.wasm, caso.probe, fuente, caso.lenguaje);
    const { h, traza } = correr(file, "complexity", "scan");
    expect(h).toBeNull();
    // Ningún corte deja dos mitades comparables: no hay candidato.
    expect(traza?.diesAt).toBe("dos-fases");
  });

  it("TRAMPA #2 — nunca declara un estado CONFIRMADO", async () => {
    const caso = CASOS[0]!;
    const file = await unit(caso.wasm, caso.probe, caso.dosFases, caso.lenguaje);
    expect(correr(file).h?.state).toBe("ausente");
  });

  it("EL ANCLA DUEÑA — una función compleja no publica la propuesta también por `long-function`", async () => {
    const caso = CASOS[0]!;
    const file = await unit(caso.wasm, caso.probe, caso.dosFases, caso.lenguaje);
    expect(correr(file, "complexity").h).not.toBeNull();
    const porLarga = correr(file, "long-function");
    expect(porLarga.h).toBeNull();
    expect(porLarga.traza?.diesAt).toBe("ancla-duena");
  });

  it("sin árbol vivo no inventa nada", async () => {
    const caso = CASOS[0]!;
    const file = await unit(caso.wasm, caso.probe, caso.dosFases, caso.lenguaje);
    const t = target(file, "price");
    expect(splitPhase.build(finding("complexity", file, t.symbol, t.startLine, t.endLine), null, ctxFor(null))).toBeNull();
  });

  it("declara sus dos anclas", () => {
    expect([...splitPhase.anchors].sort()).toEqual(["complexity", "long-function"]);
  });
});
