/**
 * `guard-clauses.test.ts` — Ola AS, frente AS2.
 *
 * Árboles REALES (`detect/testing.ts`). LOS SEIS LENGUAJES en la tabla, por
 * la misma razón que en `lookup-table.test.ts`: la trampa de
 * `state.ts#SELF_PREFIX` (Go MUDO durante varias olas) se paga cuando el test
 * cubre un lenguaje solo.
 */
import { describe, expect, it } from "vitest";

import type { Capability } from "../detect/capabilities.js";
import { pisoDeclarado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import { fileUnitFrom, nodeSetsFor, parseRoot } from "../detect/testing.js";
import type { FileUnit, Finding } from "../detect/types.js";
import { EMPTY_NEIGHBORHOOD } from "../graph/neighborhood.js";
import { hypothesis as guardClauses } from "./guard-clauses.js";
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

/**
 * OLA AS, AS2 — las métricas del fixture NO son decorativas: `ancla-duena` las
 * lee para decidir cuál de las dos anclas de esta hipótesis es la dueña del
 * lugar. `cognitive: 20` es la afirmación coherente con `finding("complexity",
 * …)`: el detector `complexity` dispara EXACTAMENTE cuando la complejidad
 * cognitiva llega a 15 (`citado(15, SonarSource S3776)`), así que un fixture
 * que dice "acá disparó `complexity`" tiene que declarar una métrica que lo
 * haga disparar. `unitLarga` es el caso contrario: larga pero NO compleja, que
 * es cuando el dueño es `long-function`.
 */
async function unit(wasm: string, probe: string, source: string, language: string): Promise<FileUnit> {
  const [sets, root] = await Promise.all([nodeSetsFor(wasm, probe), parseRoot(wasm, source)]);
  return fileUnitFrom(root, sets, language, { file: `fixture.${language}`, metrics: { cognitive: 20, chain: 0 } });
}

/** El mismo fixture, pero declarado LARGO Y NO COMPLEJO (cognitiva < 15). */
async function unitLarga(wasm: string, probe: string, source: string, language: string): Promise<FileUnit> {
  const [sets, root] = await Promise.all([nodeSetsFor(wasm, probe), parseRoot(wasm, source)]);
  return fileUnitFrom(root, sets, language, { file: `fixture.${language}`, metrics: { cognitive: 3, chain: 0 } });
}

function target(file: FileUnit, name: string): { symbol: string; startLine: number; endLine: number } {
  const fn = file.functions.find((f) => f.name === name) ?? file.functions[0];
  if (!fn) throw new Error(`sin función ${name} en ${file.language}`);
  return { symbol: fn.name ?? "?", startLine: fn.startLine, endLine: fn.endLine };
}

interface Caso {
  readonly lenguaje: string;
  readonly wasm: string;
  readonly probe: string;
  readonly nombre: string;
  /** Punta de flecha de 3 niveles con el trabajo al fondo. */
  readonly flecha: string;
  /** La misma, pero con una sentencia DESPUÉS del condicional externo: invertir cambiaría el comportamiento. */
  readonly conColaDespues: string;
}

const CASOS: readonly Caso[] = [
  {
    lenguaje: "typescript",
    wasm: "tree-sitter-typescript.wasm",
    probe: `function top(x: number): number { if (x > 0) { return 1; } else if (x < 0) { return 2; } else { return 3; } }\nclass P { m(x: number): void { if (x > 0) { this.m(1); } else if (x < 0) { this.m(2); } else { this.m(3); } switch (x) { case 1: this.m(1); break; default: break; } try { this.m(x); } catch (e) { this.m(x); } for (const y of []) { this.m(1); } } }`,
    nombre: "run",
    flecha: `function run(a: A, b: B, c: C): number {
  if (a) {
    if (b) {
      if (c) {
        const one = a.x + b.y;
        const two = one * c.z;
        const three = two - one;
        return three;
      }
    }
  }
  return 0;
}`,
    conColaDespues: `function run(a: A, b: B, c: C): number {
  if (a) {
    if (b) {
      if (c) {
        const one = a.x + b.y;
        const two = one * c.z;
        const three = two - one;
        return three;
      }
    }
    b.close();
  }
  return 0;
}`,
  },
  {
    lenguaje: "python",
    wasm: "tree-sitter-python.wasm",
    probe: `class P:
    def m(self, x):
        if x > 0:
            self.m(1)
        elif x < 0:
            self.m(2)
        else:
            self.m(3)
        match x:
            case 1:
                self.m(1)
            case _:
                self.m(2)
        try:
            self.m(x)
        except Exception:
            self.m(x)
        for y in []:
            self.m(1)
`,
    nombre: "run",
    flecha: `def run(a, b, c):
    if a:
        if b:
            if c:
                one = a.x + b.y
                two = one * c.z
                three = two - one
                return three
`,
    conColaDespues: `def run(a, b, c):
    if a:
        if b:
            if c:
                one = a.x + b.y
                two = one * c.z
                three = two - one
                return three
        b.close()
`,
  },
  {
    lenguaje: "ruby",
    wasm: "tree-sitter-ruby.wasm",
    probe: `class P
  def m(x)
    if x > 0
      m(1)
    elsif x < 0
      m(2)
    else
      m(3)
    end
    case x
    when 1 then m(1)
    else m(2)
    end
    begin
      m(x)
    rescue => e
      m(x)
    end
    while x > 0
      m(1)
    end
  end
end
`,
    nombre: "run",
    flecha: `def run(a, b, c)
  if a
    if b
      if c
        one = a.x + b.y
        two = one * c.z
        three = two - one
        return three
      end
    end
  end
end
`,
    conColaDespues: `def run(a, b, c)
  if a
    if b
      if c
        one = a.x + b.y
        two = one * c.z
        three = two - one
        return three
      end
    end
    b.close
  end
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
	} else if x < 0 {
		return 2
	}
	return 3
}

func (t *T) M(x int) int {
	if x > 0 {
		t.M(1)
	} else if x < 0 {
		t.M(2)
	} else {
		t.M(3)
	}
	switch x {
	case 1:
		t.M(1)
	default:
		t.M(2)
	}
	for i := 0; i < 3; i++ {
		t.M(i)
	}
	return 0
}
`,
    nombre: "Run",
    flecha: `package p

func Run(a *A, b *B, c *C) int {
	if a != nil {
		if b != nil {
			if c != nil {
				one := a.X + b.Y
				two := one * c.Z
				three := two - one
				return three
			}
		}
	}
	return 0
}
`,
    conColaDespues: `package p

func Run(a *A, b *B, c *C) int {
	if a != nil {
		if b != nil {
			if c != nil {
				one := a.X + b.Y
				two := one * c.Z
				three := two - one
				return three
			}
		}
		b.Close()
	}
	return 0
}
`,
  },
  {
    lenguaje: "java",
    wasm: "tree-sitter-java.wasm",
    probe: `class P {
  void m(int x) {
    if (x > 0) { m(1); } else if (x < 0) { m(2); } else { m(3); }
    switch (x) { case 1: m(1); break; default: m(2); }
    try { m(x); } catch (Exception e) { m(x); }
    for (int i = 0; i < 3; i++) { m(i); }
  }
}
`,
    nombre: "run",
    flecha: `class R {
  int run(A a, B b, C c) {
    if (a != null) {
      if (b != null) {
        if (c != null) {
          int one = a.x + b.y;
          int two = one * c.z;
          int three = two - one;
          return three;
        }
      }
    }
    return 0;
  }
}
`,
    conColaDespues: `class R {
  int run(A a, B b, C c) {
    if (a != null) {
      if (b != null) {
        if (c != null) {
          int one = a.x + b.y;
          int two = one * c.z;
          int three = two - one;
          return three;
        }
      }
      b.close();
    }
    return 0;
  }
}
`,
  },
  {
    lenguaje: "csharp",
    wasm: "tree-sitter-c_sharp.wasm",
    probe: `class P {
  void M(int x) {
    if (x > 0) { M(1); } else if (x < 0) { M(2); } else { M(3); }
    switch (x) { case 1: M(1); break; default: M(2); break; }
    try { M(x); } catch (System.Exception e) { M(x); }
    for (int i = 0; i < 3; i++) { M(i); }
  }
}
`,
    nombre: "Run",
    flecha: `class R {
  int Run(A a, B b, C c) {
    if (a != null) {
      if (b != null) {
        if (c != null) {
          int one = a.x + b.y;
          int two = one * c.z;
          int three = two - one;
          return three;
        }
      }
    }
    return 0;
  }
}
`,
    conColaDespues: `class R {
  int Run(A a, B b, C c) {
    if (a != null) {
      if (b != null) {
        if (c != null) {
          int one = a.x + b.y;
          int two = one * c.z;
          int three = two - one;
          return three;
        }
      }
      b.Close();
    }
    return 0;
  }
}
`,
  },
];

describe("hypotheses/guard-clauses — LOS SEIS LENGUAJES", () => {
  for (const caso of CASOS) {
    it(`${caso.lenguaje}: punta de flecha de 3 niveles con el trabajo al fondo ⇒ emite`, async () => {
      const file = await unit(caso.wasm, caso.probe, caso.flecha, caso.lenguaje);
      const t = target(file, caso.nombre);
      const h = guardClauses.build(finding("complexity", file, t.symbol, t.startLine, t.endLine), null, ctxFor(file));
      expect(h, `${caso.lenguaje} no emitió — la hipótesis quedó MUDA en ese lenguaje`).not.toBeNull();
      expect(h!.state).toBe("ausente");
    });

    it(`${caso.lenguaje}: si hay algo DESPUÉS del condicional, invertir cambiaría el comportamiento ⇒ silencio`, async () => {
      const file = await unit(caso.wasm, caso.probe, caso.conColaDespues, caso.lenguaje);
      const t = target(file, caso.nombre);
      expect(guardClauses.build(finding("complexity", file, t.symbol, t.startLine, t.endLine), null, ctxFor(file))).toBeNull();
    });
  }
});

describe("hypotheses/guard-clauses — los `required` que la vuelven una forma y no un gusto", () => {
  const TS = CASOS[0]!;

  it("UN nivel ⇒ null (un `if` solo no es una punta de flecha)", async () => {
    const src = `function run(a: A, b: B): number {
  if (a) {
    const one = a.x + b.y;
    const two = one * 2;
    const three = two - one;
    return three;
  }
  return 0;
}`;
    const file = await unit(TS.wasm, TS.probe, src, "typescript");
    const t = target(file, "run");
    expect(guardClauses.build(finding("complexity", file, t.symbol, t.startLine, t.endLine), null, ctxFor(file))).toBeNull();
  });

  it("DOS niveles con el trabajo al fondo ⇒ emite (el piso es 2, medido: con 3 la familia es vacía en el corpus)", async () => {
    const src = `function run(a: A, b: B): number {
  if (a) {
    if (b) {
      const one = a.x + b.y;
      const two = one * 2;
      const three = two - one;
      return three;
    }
  }
  return 0;
}`;
    const file = await unit(TS.wasm, TS.probe, src, "typescript");
    const t = target(file, "run");
    expect(guardClauses.build(finding("complexity", file, t.symbol, t.startLine, t.endLine), null, ctxFor(file))).not.toBeNull();
  });

  it("con `else` en la espina ⇒ null (ahí la inversión ya no es mecánica)", async () => {
    const src = `function run(a: A, b: B, c: C): number {
  if (a) {
    if (b) {
      if (c) {
        const one = a.x + b.y;
        const two = one * c.z;
        const three = two - one;
        return three;
      }
    } else {
      return -1;
    }
  }
  return 0;
}`;
    const file = await unit(TS.wasm, TS.probe, src, "typescript");
    const t = target(file, "run");
    expect(guardClauses.build(finding("complexity", file, t.symbol, t.startLine, t.endLine), null, ctxFor(file))).toBeNull();
  });

  it("el fondo es una línea ⇒ null (no hay 'caso principal' que desanidar)", async () => {
    const src = `function run(a: A, b: B, c: C): number {
  const x = 1;
  const y = 2;
  const z = 3;
  const w = 4;
  const v = 5;
  const u = 6;
  if (a) {
    if (b) {
      if (c) {
        return 1;
      }
    }
  }
  return 0;
}`;
    const file = await unit(TS.wasm, TS.probe, src, "typescript");
    const t = target(file, "run");
    expect(guardClauses.build(finding("complexity", file, t.symbol, t.startLine, t.endLine), null, ctxFor(file))).toBeNull();
  });

  it("LA TRAMPA #3: si la función YA usa guardas ⇒ silencio (el autor ya escribe así)", async () => {
    const src = `function run(a: A, b: B, c: C): number {
  if (!a) return 0;
  if (!b) return 0;
  if (a.stale) {
    if (b.stale) {
      if (c) {
        const one = a.x + b.y;
        const two = one * c.z;
        const three = two - one;
        return three;
      }
    }
  }
  return 0;
}`;
    const file = await unit(TS.wasm, TS.probe, src, "typescript");
    const t = target(file, "run");
    expect(guardClauses.build(finding("complexity", file, t.symbol, t.startLine, t.endLine), null, ctxFor(file))).toBeNull();
  });

  it("sin `ctx.file` ⇒ null (no evaluado, NUNCA 'cumple')", async () => {
    const file = await unit(TS.wasm, TS.probe, TS.flecha, "typescript");
    const t = target(file, "run");
    expect(guardClauses.build(finding("complexity", file, t.symbol, t.startLine, t.endLine), null, ctxFor(null))).toBeNull();
  });
});

describe("hypotheses/guard-clauses — LA TRAMPA #2: no puede borrarle la propuesta a nadie", () => {
  it("CONTRATO: `state` es SIEMPRE 'ausente'", async () => {
    for (const caso of CASOS) {
      for (const src of [caso.flecha, caso.conColaDespues]) {
        const file = await unit(caso.wasm, caso.probe, src, caso.lenguaje);
        const t = target(file, caso.nombre);
        for (const kind of ["complexity", "long-function"]) {
          const h = guardClauses.build(finding(kind, file, t.symbol, t.startLine, t.endLine), null, ctxFor(file));
          if (h) expect(h.state, `${caso.lenguaje}/${kind} devolvió un estado CONFIRMADO`).toBe("ausente");
        }
      }
    }
  });

  it("las anclas declaradas son exactamente las dos medidas", () => {
    expect([...guardClauses.anchors].sort()).toEqual(["complexity", "long-function"]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * OLA AS, AS2 — EL ANCLA DUEÑA, y el duplicado que la obligó
 *
 * `Ghost .../milestones/milestones-service.js:206-256 #runARRQueries` salió
 * publicado DOS VECES con texto idéntico en la primera medición: una vez desde
 * el hallazgo de `complexity` y otra desde el de `long-function`. Una función
 * larga Y compleja dispara las dos anclas de esta hipótesis.
 * ══════════════════════════════════════════════════════════════════════════ */
describe("hypotheses/guard-clauses — el ancla DUEÑA (una punta de flecha, una propuesta)", () => {
  const TS = CASOS[0]!;
  const CANONICO = `function run(a: boolean, b: boolean): number {
  if (a) {
    if (b) {
      const x = 1;
      const y = 2;
      const z = 3;
      const w = 4;
      return x + y + z + w;
    }
  }
  return 0;
}`;

  it("función LARGA Y COMPLEJA: emite por `complexity` y CALLA por `long-function`", async () => {
    const file = await unit(TS.wasm, TS.probe, CANONICO, "typescript");
    const t = target(file, "run");
    expect(
      guardClauses.build(finding("complexity", file, t.symbol, t.startLine, t.endLine), null, ctxFor(file)),
      "el dueño con cognitiva >= 15 es `complexity`",
    ).not.toBeNull();
    expect(
      guardClauses.build(finding("long-function", file, t.symbol, t.startLine, t.endLine), null, ctxFor(file)),
      "la MISMA punta de flecha no puede salir dos veces",
    ).toBeNull();
  });

  it("función LARGA Y NO COMPLEJA: emite por `long-function` y CALLA por `complexity`", async () => {
    /* El desempate no APAGA `long-function`: le da el lugar cuando es suyo.
     * Es el caso de `Ghost koenig/kg-default-nodes/.../embed-parser.ts:8-58`,
     * que en la primera medición salió sólo por `long-function`. */
    const file = await unitLarga(TS.wasm, TS.probe, CANONICO, "typescript");
    const t = target(file, "run");
    expect(
      guardClauses.build(finding("long-function", file, t.symbol, t.startLine, t.endLine), null, ctxFor(file)),
      "con cognitiva < 15 el dueño es `long-function`",
    ).not.toBeNull();
    expect(
      guardClauses.build(finding("complexity", file, t.symbol, t.startLine, t.endLine), null, ctxFor(file)),
      "`complexity` no pudo haber disparado con cognitiva < 15",
    ).toBeNull();
  });
});
