/**
 * `extract-variable.test.ts` — Ola AT, frente AT5.
 *
 * Árboles REALES (`detect/testing.ts`), LOS SEIS LENGUAJES. La forma que se
 * congela acá es la única que esta familia afirma: la MISMA cadena de
 * navegación escrita idéntica tres veces o más dentro de la misma función.
 */
import { describe, expect, it } from "vitest";

import type { Capability } from "../detect/capabilities.js";
import { fileUnitFrom, nodeSetsFor, parseRoot } from "../detect/testing.js";
import { pisoDeclarado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import type { FileUnit, Finding } from "../detect/types.js";
import { EMPTY_NEIGHBORHOOD } from "../graph/neighborhood.js";
import { hypothesis as extractVariable } from "./extract-variable.js";
import { hypothesis as extractMethod } from "./extract-method.js";
import type { HypothesisContext } from "./types.js";

function fakeThreshold(): Threshold {
  return resolveThreshold(pisoDeclarado(15, { rationale: "test" }), { language: "typescript", sampleSize: () => 0, corpusP95: () => null });
}

function finding(kind: string, file: FileUnit, symbol: string, startLine: number, endLine: number): Finding {
  return {
    id: `f-${kind}-1`,
    detectorId: kind,
    kind: kind as Finding["kind"],
    scope: "intra-function",
    language: file.language,
    title: symbol,
    detail: "d",
    trigger: [{ label: "x", value: 30, threshold: fakeThreshold() }],
    locations: [{ file: file.path, startLine, endLine, symbol, role: "r" }],
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

/** `cognitive: 20` ⇒ el ancla DUEÑA es `complexity` (piso 15 de S3776). */
async function unit(wasm: string, probe: string, source: string, language: string): Promise<FileUnit> {
  const [sets, root] = await Promise.all([nodeSetsFor(wasm, probe), parseRoot(wasm, source)]);
  return fileUnitFrom(root, sets, language, { file: `fixture.${language}`, metrics: { cognitive: 20, chain: 0 } });
}

function target(file: FileUnit, name: string): { symbol: string; startLine: number; endLine: number } {
  const fn = file.functions.find((f) => f.name === name) ?? file.functions[0];
  if (!fn) throw new Error(`sin función ${name}`);
  return { symbol: fn.name ?? "?", startLine: fn.startLine, endLine: fn.endLine };
}

interface Caso {
  readonly lenguaje: string;
  readonly wasm: string;
  readonly probe: string;
  readonly nombre: string;
  /** La cadena repetida TRES veces. */
  readonly repetida: string;
  /** La misma, repetida sólo DOS veces: no es esta forma. */
  readonly dosVeces: string;
  /** Repetida tres veces, pero la función YA le puso nombre: silencio (trampa #3). */
  readonly yaNombrada: string;
  /** Repetida tres veces, pero la raíz se reasigna en el medio: las lecturas no son el mismo valor. */
  readonly raizReasignada: string;
}

const PROBE_TS = `function top(x: number): number { if (x > 0) { return 1; } else if (x < 0) { return 2; } else { return 3; } }\nclass P { m(x: number): void { if (x > 0) { this.m(1); } else { this.m(3); } switch (x) { case 1: this.m(1); break; default: break; } try { this.m(x); } catch (e) { this.m(x); } for (const y of []) { this.m(1); } } }`;

const CASOS: readonly Caso[] = [
  {
    lenguaje: "typescript",
    wasm: "tree-sitter-typescript.wasm",
    probe: PROBE_TS,
    nombre: "run",
    repetida: `function run(cfg: Cfg): number {
  const a = compute(cfg.server.options, 1);
  const b = compute(cfg.server.options, a);
  const c = merge(b, cfg.server.options);
  return c;
}
`,
    dosVeces: `function run(cfg: Cfg): number {
  const a = compute(cfg.server.options, 1);
  const c = merge(a, cfg.server.options);
  return c;
}
`,
    yaNombrada: `function run(cfg: Cfg): number {
  const opts = cfg.server.options;
  const b = compute(cfg.server.options, opts);
  const c = merge(b, cfg.server.options);
  return c;
}
`,
    raizReasignada: `function run(cfg: Cfg): number {
  const a = compute(cfg.server.options, 1);
  cfg.server = other();
  const b = compute(cfg.server.options, a);
  const c = merge(b, cfg.server.options);
  return c;
}
`,
  },
  {
    lenguaje: "python",
    wasm: "tree-sitter-python.wasm",
    probe: `class P:
    def m(self, x):
        if x > 0:
            self.m(1)
        else:
            self.m(3)
`,
    nombre: "run",
    repetida: `def run(cfg):
    a = compute(cfg.server.options, 1)
    b = compute(cfg.server.options, a)
    c = merge(b, cfg.server.options)
    return c
`,
    dosVeces: `def run(cfg):
    a = compute(cfg.server.options, 1)
    c = merge(a, cfg.server.options)
    return c
`,
    yaNombrada: `def run(cfg):
    opts = cfg.server.options
    b = compute(cfg.server.options, opts)
    c = merge(b, cfg.server.options)
    return c
`,
    raizReasignada: `def run(cfg):
    a = compute(cfg.server.options, 1)
    cfg.server = other()
    b = compute(cfg.server.options, a)
    c = merge(b, cfg.server.options)
    return c
`,
  },
  {
    lenguaje: "ruby",
    wasm: "tree-sitter-ruby.wasm",
    probe: `class P
  def m(x)
    if x > 0
      m(1)
    else
      m(3)
    end
  end
end
`,
    nombre: "run",
    repetida: `def run(cfg)
  a = compute(cfg.server.options, 1)
  b = compute(cfg.server.options, a)
  c = merge(b, cfg.server.options)
  c
end
`,
    dosVeces: `def run(cfg)
  a = compute(cfg.server.options, 1)
  c = merge(a, cfg.server.options)
  c
end
`,
    yaNombrada: `def run(cfg)
  opts = cfg.server.options
  b = compute(cfg.server.options, opts)
  c = merge(b, cfg.server.options)
  c
end
`,
    raizReasignada: `def run(cfg)
  a = compute(cfg.server.options, 1)
  cfg.server = other()
  b = compute(cfg.server.options, a)
  c = merge(b, cfg.server.options)
  c
end
`,
  },
  {
    lenguaje: "go",
    wasm: "tree-sitter-go.wasm",
    probe: `package p

type T struct{ n int }

func Top(x int) int {
	if x > 0 {
		return 1
	}
	return 3
}
`,
    nombre: "Run",
    repetida: `package p

func Run(cfg Cfg) int {
	a := compute(cfg.server.options, 1)
	b := compute(cfg.server.options, a)
	c := merge(b, cfg.server.options)
	return c
}
`,
    dosVeces: `package p

func Run(cfg Cfg) int {
	a := compute(cfg.server.options, 1)
	c := merge(a, cfg.server.options)
	return c
}
`,
    yaNombrada: `package p

func Run(cfg Cfg) int {
	opts := cfg.server.options
	b := compute(cfg.server.options, opts)
	c := merge(b, cfg.server.options)
	return c
}
`,
    raizReasignada: `package p

func Run(cfg Cfg) int {
	a := compute(cfg.server.options, 1)
	cfg.server = other()
	b := compute(cfg.server.options, a)
	c := merge(b, cfg.server.options)
	return c
}
`,
  },
  {
    lenguaje: "java",
    wasm: "tree-sitter-java.wasm",
    probe: `class P {
  void m(int x) {
    if (x > 0) { m(1); } else { m(3); }
  }
}
`,
    nombre: "run",
    repetida: `class R {
  int run(Cfg cfg) {
    int a = compute(cfg.server.options, 1);
    int b = compute(cfg.server.options, a);
    int c = merge(b, cfg.server.options);
    return c;
  }
}
`,
    dosVeces: `class R {
  int run(Cfg cfg) {
    int a = compute(cfg.server.options, 1);
    int c = merge(a, cfg.server.options);
    return c;
  }
}
`,
    yaNombrada: `class R {
  int run(Cfg cfg) {
    Opts opts = cfg.server.options;
    int b = compute(cfg.server.options, opts);
    int c = merge(b, cfg.server.options);
    return c;
  }
}
`,
    raizReasignada: `class R {
  int run(Cfg cfg) {
    int a = compute(cfg.server.options, 1);
    cfg.server = other();
    int b = compute(cfg.server.options, a);
    int c = merge(b, cfg.server.options);
    return c;
  }
}
`,
  },
  {
    lenguaje: "csharp",
    wasm: "tree-sitter-c_sharp.wasm",
    probe: `class P {
  void M(int x) {
    if (x > 0) { M(1); } else { M(3); }
  }
}
`,
    nombre: "Run",
    repetida: `class R {
  int Run(Cfg cfg) {
    int a = Compute(cfg.server.options, 1);
    int b = Compute(cfg.server.options, a);
    int c = Merge(b, cfg.server.options);
    return c;
  }
}
`,
    dosVeces: `class R {
  int Run(Cfg cfg) {
    int a = Compute(cfg.server.options, 1);
    int c = Merge(a, cfg.server.options);
    return c;
  }
}
`,
    yaNombrada: `class R {
  int Run(Cfg cfg) {
    Opts opts = cfg.server.options;
    int b = Compute(cfg.server.options, opts);
    int c = Merge(b, cfg.server.options);
    return c;
  }
}
`,
    raizReasignada: `class R {
  int Run(Cfg cfg) {
    int a = Compute(cfg.server.options, 1);
    cfg.server = Other();
    int b = Compute(cfg.server.options, a);
    int c = Merge(b, cfg.server.options);
    return c;
  }
}
`,
  },
];

describe("Extract Variable", () => {
  describe.each(CASOS)("$lenguaje", (caso) => {
    it("EMITE cuando la misma cadena de navegación se lee tres veces", async () => {
      const file = await unit(caso.wasm, caso.probe, caso.repetida, caso.lenguaje);
      const t = target(file, caso.nombre);
      const h = extractVariable.build(finding("complexity", file, t.symbol, t.startLine, t.endLine), null, ctxFor(file));
      expect(h, `${caso.lenguaje}: no emitió`).not.toBeNull();
      expect(h!.state).toBe("ausente");
      expect(h!.places[0]!.role).toContain("cfg.server.options");
    });

    it("CALLA con sólo dos lecturas (dos es una comparación, tres es un patrón de escritura)", async () => {
      const file = await unit(caso.wasm, caso.probe, caso.dosVeces, caso.lenguaje);
      const t = target(file, caso.nombre);
      expect(extractVariable.build(finding("complexity", file, t.symbol, t.startLine, t.endLine), null, ctxFor(file))).toBeNull();
    });

    it("TRAMPA #3: si la función YA le puso nombre a la cadena, silencio", async () => {
      const file = await unit(caso.wasm, caso.probe, caso.yaNombrada, caso.lenguaje);
      const t = target(file, caso.nombre);
      expect(extractVariable.build(finding("complexity", file, t.symbol, t.startLine, t.endLine), null, ctxFor(file))).toBeNull();
    });

    it("CALLA cuando la raíz se reasigna en el medio (las lecturas no devuelven el mismo valor)", async () => {
      const file = await unit(caso.wasm, caso.probe, caso.raizReasignada, caso.lenguaje);
      const t = target(file, caso.nombre);
      expect(extractVariable.build(finding("complexity", file, t.symbol, t.startLine, t.endLine), null, ctxFor(file))).toBeNull();
    });

    it("ANCLA DUEÑA: la MISMA función con complejidad 20 no vuelve a proponer por `long-function`", async () => {
      const file = await unit(caso.wasm, caso.probe, caso.repetida, caso.lenguaje);
      const t = target(file, caso.nombre);
      expect(extractVariable.build(finding("long-function", file, t.symbol, t.startLine, t.endLine), null, ctxFor(file))).toBeNull();
    });
  });

  it("sin árbol vivo (`ctx.file === null`) no inventa nada", async () => {
    const caso = CASOS[0]!;
    const file = await unit(caso.wasm, caso.probe, caso.repetida, caso.lenguaje);
    const t = target(file, caso.nombre);
    expect(extractVariable.build(finding("complexity", file, t.symbol, t.startLine, t.endLine), null, ctxFor(null))).toBeNull();
  });

  it("TRAMPA #2: comparte las DOS anclas con Extract Method y aun así no le puede retirar nada", async () => {
    const caso = CASOS[0]!;
    const file = await unit(caso.wasm, caso.probe, caso.repetida, caso.lenguaje);
    const t = target(file, caso.nombre);
    const h = extractVariable.build(finding("complexity", file, t.symbol, t.startLine, t.endLine), null, ctxFor(file));
    // Mismas anclas, y aun así inofensiva: `arbitrateRivalHypotheses` sólo
    // retira una oportunidad frente a un estado CONFIRMADO, y `appliedState`
    // de esta hipótesis devuelve SIEMPRE `"ausente"`.
    expect([...extractVariable.anchors].sort()).toEqual([...extractMethod.anchors].sort());
    expect(h!.state).toBe("ausente");
  });

  it("el registro declara el nombre y el id que el informe publica", () => {
    expect(extractVariable.id).toBe("extract-variable");
    expect(extractVariable.pattern).toBe("Extract Variable");
  });
});
