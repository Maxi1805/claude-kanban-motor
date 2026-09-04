/**
 * `decompose-conditional.test.ts` — Ola AT, frente AT5.
 *
 * Árboles REALES (`detect/testing.ts`). LOS SEIS LENGUAJES en la tabla, por la
 * misma razón que en `guard-clauses.test.ts`: la trampa de
 * `state.ts#SELF_PREFIX` (Go MUDO durante varias olas sin que ningún test lo
 * agarrara) se paga cuando el test cubre un lenguaje solo.
 */
import { describe, expect, it } from "vitest";

import type { Capability } from "../detect/capabilities.js";
import { fileUnitFrom, nodeSetsFor, parseRoot } from "../detect/testing.js";
import { pisoDeclarado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import type { FileUnit, Finding } from "../detect/types.js";
import { EMPTY_NEIGHBORHOOD } from "../graph/neighborhood.js";
import { hypothesis as decomposeConditional } from "./decompose-conditional.js";
import { HYPOTHESES } from "./registry.js";
import type { HypothesisContext } from "./types.js";

function fakeThreshold(): Threshold {
  return resolveThreshold(pisoDeclarado(2, { rationale: "test" }), { language: "typescript", sampleSize: () => 0, corpusP95: () => null });
}

/** El hallazgo que `boolean-complexity` publica: la ubicación es LA CADENA, no la función. */
function finding(file: FileUnit, symbol: string, startLine: number, endLine: number): Finding {
  return {
    id: "f-bool-1",
    detectorId: "boolean-complexity",
    kind: "boolean-complexity" as Finding["kind"],
    scope: "intra-function",
    language: file.language,
    title: symbol,
    detail: "d",
    trigger: [{ label: "operadores lógicos mezclados en la cadena", value: 3, threshold: fakeThreshold() }],
    locations: [{ file: file.path, startLine, endLine, symbol, role: "condición que mezcla && y || sin paréntesis explícitos" }],
    severity: 60,
    advice: { primary: { name: "Decompose Conditional", kind: "refactorizacion", why: "y", source: "z" } },
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

/** La línea (1-based) donde vive la condición: la que trae el marcador. */
function lineOf(source: string, needle: string): number {
  const i = source.split("\n").findIndex((l) => l.includes(needle));
  if (i < 0) throw new Error(`sin línea con "${needle}"`);
  return i + 1;
}

interface Caso {
  readonly lenguaje: string;
  readonly wasm: string;
  readonly probe: string;
  readonly nombre: string;
  /** Condición MIXTA de 3 operadores sin paréntesis. */
  readonly mixta: string;
  /** La misma cadena, HOMOGÉNEA (un solo operador): no es esta forma. */
  readonly homogenea: string;
  /** La misma mezcla, YA agrupada por el autor con paréntesis: la cadena se corta sola. */
  readonly conParentesis: string;
  /** La mezcla, pero YA guardada en un local con nombre: `ya-aplicado`. */
  readonly conNombre: string;
}

const CASOS: readonly Caso[] = [
  {
    lenguaje: "typescript",
    wasm: "tree-sitter-typescript.wasm",
    probe: `function top(x: number): number { if (x > 0) { return 1; } else if (x < 0) { return 2; } else { return 3; } }\nclass P { m(x: number): void { if (x > 0) { this.m(1); } else if (x < 0) { this.m(2); } else { this.m(3); } switch (x) { case 1: this.m(1); break; default: break; } try { this.m(x); } catch (e) { this.m(x); } for (const y of []) { this.m(1); } } }`,
    nombre: "run",
    mixta: `function run(a: A, b: B, c: C, d: D): number {
  if (a.x > 0 && b.y > 0 || c.z > 0 && d.w > 0) {
    return 1;
  }
  return 0;
}
`,
    homogenea: `function run(a: A, b: B, c: C, d: D): number {
  if (a.x > 0 && b.y > 0 && c.z > 0 && d.w > 0) {
    return 1;
  }
  return 0;
}
`,
    conParentesis: `function run(a: A, b: B, c: C, d: D): number {
  if ((a.x > 0 && b.y > 0) || (c.z > 0 && d.w > 0)) {
    return 1;
  }
  return 0;
}
`,
    conNombre: `function run(a: A, b: B, c: C, d: D): number {
  const puedeSeguir = a.x > 0 && b.y > 0 || c.z > 0 && d.w > 0;
  if (puedeSeguir) {
    return 1;
  }
  return 0;
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
        elif x < 0:
            self.m(2)
        else:
            self.m(3)
`,
    nombre: "run",
    mixta: `def run(a, b, c, d):
    if a.x > 0 and b.y > 0 or c.z > 0 and d.w > 0:
        return 1
    return 0
`,
    homogenea: `def run(a, b, c, d):
    if a.x > 0 and b.y > 0 and c.z > 0 and d.w > 0:
        return 1
    return 0
`,
    conParentesis: `def run(a, b, c, d):
    if (a.x > 0 and b.y > 0) or (c.z > 0 and d.w > 0):
        return 1
    return 0
`,
    conNombre: `def run(a, b, c, d):
    puede_seguir = a.x > 0 and b.y > 0 or c.z > 0 and d.w > 0
    if puede_seguir:
        return 1
    return 0
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
  end
end
`,
    nombre: "run",
    mixta: `def run(a, b, c, d)
  if a.x > 0 && b.y > 0 || c.z > 0 && d.w > 0
    return 1
  end
  0
end
`,
    homogenea: `def run(a, b, c, d)
  if a.x > 0 && b.y > 0 && c.z > 0 && d.w > 0
    return 1
  end
  0
end
`,
    conParentesis: `def run(a, b, c, d)
  if (a.x > 0 && b.y > 0) || (c.z > 0 && d.w > 0)
    return 1
  end
  0
end
`,
    conNombre: `def run(a, b, c, d)
  puede_seguir = a.x > 0 && b.y > 0 || c.z > 0 && d.w > 0
  if puede_seguir
    return 1
  end
  0
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
`,
    nombre: "Run",
    mixta: `package p

func Run(a A, b B, c C, d D) int {
	if a.x > 0 && b.y > 0 || c.z > 0 && d.w > 0 {
		return 1
	}
	return 0
}
`,
    homogenea: `package p

func Run(a A, b B, c C, d D) int {
	if a.x > 0 && b.y > 0 && c.z > 0 && d.w > 0 {
		return 1
	}
	return 0
}
`,
    conParentesis: `package p

func Run(a A, b B, c C, d D) int {
	if (a.x > 0 && b.y > 0) || (c.z > 0 && d.w > 0) {
		return 1
	}
	return 0
}
`,
    conNombre: `package p

func Run(a A, b B, c C, d D) int {
	puedeSeguir := a.x > 0 && b.y > 0 || c.z > 0 && d.w > 0
	if puedeSeguir {
		return 1
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
  }
}
`,
    nombre: "run",
    mixta: `class R {
  int run(A a, B b, C c, D d) {
    if (a.x > 0 && b.y > 0 || c.z > 0 && d.w > 0) {
      return 1;
    }
    return 0;
  }
}
`,
    homogenea: `class R {
  int run(A a, B b, C c, D d) {
    if (a.x > 0 && b.y > 0 && c.z > 0 && d.w > 0) {
      return 1;
    }
    return 0;
  }
}
`,
    conParentesis: `class R {
  int run(A a, B b, C c, D d) {
    if ((a.x > 0 && b.y > 0) || (c.z > 0 && d.w > 0)) {
      return 1;
    }
    return 0;
  }
}
`,
    conNombre: `class R {
  int run(A a, B b, C c, D d) {
    boolean puedeSeguir = a.x > 0 && b.y > 0 || c.z > 0 && d.w > 0;
    if (puedeSeguir) {
      return 1;
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
  }
}
`,
    nombre: "Run",
    mixta: `class R {
  int Run(A a, B b, C c, D d) {
    if (a.x > 0 && b.y > 0 || c.z > 0 && d.w > 0) {
      return 1;
    }
    return 0;
  }
}
`,
    homogenea: `class R {
  int Run(A a, B b, C c, D d) {
    if (a.x > 0 && b.y > 0 && c.z > 0 && d.w > 0) {
      return 1;
    }
    return 0;
  }
}
`,
    conParentesis: `class R {
  int Run(A a, B b, C c, D d) {
    if ((a.x > 0 && b.y > 0) || (c.z > 0 && d.w > 0)) {
      return 1;
    }
    return 0;
  }
}
`,
    conNombre: `class R {
  int Run(A a, B b, C c, D d) {
    bool puedeSeguir = a.x > 0 && b.y > 0 || c.z > 0 && d.w > 0;
    if (puedeSeguir) {
      return 1;
    }
    return 0;
  }
}
`,
  },
];

/** El marcador que identifica la línea de la condición mixta en los seis fuentes. */
const MARCA_MIXTA = "c.z > 0";

describe("Decompose Conditional", () => {
  describe.each(CASOS)("$lenguaje", (caso) => {
    it("EMITE sobre una condición que mezcla && y || sin paréntesis", async () => {
      const file = await unit(caso.wasm, caso.probe, caso.mixta, caso.lenguaje);
      const line = lineOf(caso.mixta, MARCA_MIXTA);
      const h = decomposeConditional.build(finding(file, caso.nombre, line, line), null, ctxFor(file));
      expect(h, `${caso.lenguaje}: no emitió`).not.toBeNull();
      expect(h!.state).toBe("ausente");
      expect(h!.places.length).toBeGreaterThanOrEqual(2); // la condición + al menos un grupo
      expect(h!.checks.find((c) => c.label.includes("&&"))?.passed).toBe(true);
    });

    it("CALLA sobre una cadena homogénea (sin mezcla no hay ambigüedad de precedencia)", async () => {
      const file = await unit(caso.wasm, caso.probe, caso.homogenea, caso.lenguaje);
      const line = lineOf(caso.homogenea, MARCA_MIXTA);
      expect(decomposeConditional.build(finding(file, caso.nombre, line, line), null, ctxFor(file))).toBeNull();
    });

    it("CALLA cuando el autor ya agrupó con paréntesis (la cadena se corta sola)", async () => {
      const file = await unit(caso.wasm, caso.probe, caso.conParentesis, caso.lenguaje);
      const line = lineOf(caso.conParentesis, MARCA_MIXTA);
      expect(decomposeConditional.build(finding(file, caso.nombre, line, line), null, ctxFor(file))).toBeNull();
    });

    it("TRAMPA #3: la condición YA tiene nombre ⇒ `ya-aplicado`, no una oportunidad", async () => {
      const file = await unit(caso.wasm, caso.probe, caso.conNombre, caso.lenguaje);
      const line = lineOf(caso.conNombre, MARCA_MIXTA);
      const h = decomposeConditional.build(finding(file, caso.nombre, line, line), null, ctxFor(file));
      expect(h, `${caso.lenguaje}: no construyó`).not.toBeNull();
      expect(h!.state).toBe("ya-aplicado");
      expect(h!.confidence).toBeNull();
    });
  });

  it("sin árbol vivo (`ctx.file === null`) no inventa nada", async () => {
    const caso = CASOS[0]!;
    const file = await unit(caso.wasm, caso.probe, caso.mixta, caso.lenguaje);
    expect(decomposeConditional.build(finding(file, caso.nombre, 2, 2), null, ctxFor(null))).toBeNull();
  });

  it("CALLA cuando la condición tiene un efecto (mover el grupo cambia cuándo se evalúa)", async () => {
    const caso = CASOS[0]!;
    const src = `function run(a: A, b: B, c: C, d: D): number {
  if (a.x > 0 && (n = b.y) > 0 || c.z > 0 && d.w > 0) {
    return 1;
  }
  return 0;
}
`;
    const file = await unit(caso.wasm, caso.probe, src, caso.lenguaje);
    const h = decomposeConditional.build(finding(file, caso.nombre, lineOf(src, MARCA_MIXTA), lineOf(src, MARCA_MIXTA)), null, ctxFor(file));
    expect(h).toBeNull();
  });

  it("TRAMPA #2: no le puede borrar la propuesta a nadie de los 19 patrones sobre otra ancla", () => {
    // OLA AY (guardián de cierre) — EL RIVAL CAMBIÓ, NO DESAPARECIÓ.
    // `boolean-complexity` la declaraba, hasta esta ola, Chain of
    // Responsibility Y Decorator a la vez; el frente AY2 la retiró de CoR
    // (V=0, F=2, costo cero medido sobre la población entera —
    // `ola-ay/informes/AY2.md` §2), pero Decorator SIGUE anclándola
    // (`decorator.ts`, sin tocar por ninguna baja de esta ola). El test se
    // deriva del registro en vez de nombrar un patrón a mano, precisamente
    // para no volver a quedar desactualizado en silencio la próxima vez que
    // alguien recorte una ancla.
    expect([...decomposeConditional.anchors]).toEqual(["boolean-complexity"]);
    const otrosQueAnclanBooleanComplexity = HYPOTHESES.filter(
      (h) => h.pattern !== decomposeConditional.pattern && h.anchors.includes("boolean-complexity"),
    ).map((h) => h.pattern);
    expect(otrosQueAnclanBooleanComplexity).toEqual(["Decorator"]);
  });

  it("ANCLA DUEÑA: un hallazgo de una función ENVOLVENTE no vuelve a proponer la misma condición", async () => {
    // Una condición dentro de funciones anidadas dispara un hallazgo por cada
    // función que la contiene (`boolean-complexity` es `intra-function` y corre
    // sobre cada `FunctionUnit`). Sólo el de la función que la contiene
    // DIRECTAMENTE puede proponer; el de la envolvente calla.
    const caso = CASOS[0]!;
    const src = `function outer(a: A, b: B, c: C, d: D): number {
  function inner(): number {
    if (a.x > 0 && b.y > 0 || c.z > 0 && d.w > 0) {
      return 1;
    }
    return 0;
  }
  return inner();
}
`;
    const file = await unit(caso.wasm, caso.probe, src, caso.lenguaje);
    const line = lineOf(src, MARCA_MIXTA);
    expect(decomposeConditional.build(finding(file, "inner", line, line), null, ctxFor(file)), "la función que la contiene directamente SÍ propone").not.toBeNull();
    expect(decomposeConditional.build(finding(file, "outer", line, line), null, ctxFor(file)), "la envolvente NO vuelve a proponer").toBeNull();
  });

  it("el registro declara el nombre y el id que el informe publica", () => {
    expect(decomposeConditional.id).toBe("decompose-conditional");
    expect(decomposeConditional.pattern).toBe("Decompose Conditional");
  });
});
