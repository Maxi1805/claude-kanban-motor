/**
 * `lookup-table.test.ts` — Ola AS, frente AS2.
 *
 * Árboles REALES (`detect/testing.ts`: el mismo `web-tree-sitter` y las
 * mismas gramáticas `.wasm` que producción). Toda la hipótesis es lectura de
 * FORMA sintáctica; con un árbol simulado no se probaría nada.
 *
 * LOS SEIS LENGUAJES ESTÁN EN LA TABLA DE ABAJO, uno por fila, y es
 * deliberado: la trampa que `state.ts#SELF_PREFIX` pagó (Go MUDO en cuatro
 * anclas durante varias olas, sin que ningún test lo agarrara) se paga
 * exactamente cuando el test cubre un lenguaje solo.
 */
import { describe, expect, it } from "vitest";

import type { Capability } from "../detect/capabilities.js";
import { pisoDeclarado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import { fileUnitFrom, nodeSetsFor, parseRoot } from "../detect/testing.js";
import type { FileUnit, Finding } from "../detect/types.js";
import { EMPTY_NEIGHBORHOOD } from "../graph/neighborhood.js";
import { hypothesis as lookupTable } from "./lookup-table.js";
import type { HypothesisContext } from "./types.js";

function fakeThreshold(): Threshold {
  return resolveThreshold(pisoDeclarado(5, { rationale: "test" }), {
    language: "typescript",
    sampleSize: () => 0,
    corpusP95: () => null,
  });
}

function finding(kind: string, file: FileUnit, symbol: string, startLine: number, endLine: number): Finding {
  return {
    id: `f-${kind}-1`,
    detectorId: kind,
    kind: kind as Finding["kind"],
    scope: "intra-function",
    language: file.language,
    title: `${symbol}`,
    detail: "d",
    trigger: [{ label: "x", value: 20, threshold: fakeThreshold() }],
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
        functionNodes: new Set(),
        branchNodes: new Set(),
        chainNodes: new Set(),
        cloneNodes: new Set(),
        classNodes: new Set(),
        nestingNodes: new Set(),
        constructorNodes: new Set(),
        exceptionNodes: new Set(),
        switchContainerNodes: new Set(),
      },
    neighborhood: EMPTY_NEIGHBORHOOD,
    branches: () => null,
  };
}

async function unit(wasm: string, probe: string, source: string, language: string): Promise<FileUnit> {
  const [sets, root] = await Promise.all([nodeSetsFor(wasm, probe), parseRoot(wasm, source)]);
  return fileUnitFrom(root, sets, language, { file: `fixture.${language}` });
}

/** El mismo fixture con una complejidad cognitiva DECLARADA: la lee
 *  `reclamanCadena` para decidir si una función anidada puede reclamar la
 *  cadena que tiene adentro. */
async function unitConMetricas(wasm: string, probe: string, source: string, language: string, cognitive: number): Promise<FileUnit> {
  const [sets, root] = await Promise.all([nodeSetsFor(wasm, probe), parseRoot(wasm, source)]);
  return fileUnitFrom(root, sets, language, { file: `fixture.${language}`, metrics: { cognitive } });
}

/** La función que envuelve TODO el fixture — el rango que el ancla reporta. */
function wholeFile(file: FileUnit): { symbol: string; startLine: number; endLine: number } {
  const fn = file.functions[0];
  if (!fn) throw new Error(`el fixture no produjo ninguna función (${file.language})`);
  return { symbol: fn.name ?? "?", startLine: fn.startLine, endLine: fn.endLine };
}

/* ── Los seis lenguajes: sonda + fuente con la MISMA forma de tabla ──────── */

interface Caso {
  readonly lenguaje: string;
  readonly wasm: string;
  readonly probe: string;
  /** Escalera if/elsif de 5 peldaños, todas las ramas retornando un literal. */
  readonly tabla: string;
  /** La misma escalera, pero con una rama que INVOCA: no es una tabla. */
  readonly conInvocacion: string;
}

const CASOS: readonly Caso[] = [
  {
    lenguaje: "typescript",
    wasm: "tree-sitter-typescript.wasm",
    probe: `function top(x: number): number { if (x > 0) { return 1; } else if (x < 0) { return 2; } else { return 3; } }\nclass P { m(x: number): void { if (x > 0) { this.m(1); } else if (x < 0) { this.m(2); } else { this.m(3); } switch (x) { case 1: this.m(1); break; default: break; } try { this.m(x); } catch (e) { this.m(x); } for (const y of []) { this.m(1); } } }`,
    tabla: `function icon(kind: string): string {
  if (kind === "a") { return "alpha"; }
  else if (kind === "b") { return "beta"; }
  else if (kind === "c") { return "gamma"; }
  else if (kind === "d") { return "delta"; }
  else if (kind === "e") { return "epsilon"; }
  else { return "?"; }
}`,
    conInvocacion: `function icon(kind: string): string {
  if (kind === "a") { return compute("alpha"); }
  else if (kind === "b") { return compute("beta"); }
  else if (kind === "c") { return compute("gamma"); }
  else if (kind === "d") { return compute("delta"); }
  else if (kind === "e") { return compute("epsilon"); }
  else { return "?"; }
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
    tabla: `def icon(kind):
    if kind == "a":
        return "alpha"
    elif kind == "b":
        return "beta"
    elif kind == "c":
        return "gamma"
    elif kind == "d":
        return "delta"
    elif kind == "e":
        return "epsilon"
    else:
        return "?"
`,
    conInvocacion: `def icon(kind):
    if kind == "a":
        return compute("alpha")
    elif kind == "b":
        return compute("beta")
    elif kind == "c":
        return compute("gamma")
    elif kind == "d":
        return compute("delta")
    elif kind == "e":
        return compute("epsilon")
    else:
        return "?"
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
    tabla: `def icon(kind)
  if kind == "a"
    return "alpha"
  elsif kind == "b"
    return "beta"
  elsif kind == "c"
    return "gamma"
  elsif kind == "d"
    return "delta"
  elsif kind == "e"
    return "epsilon"
  else
    return "?"
  end
end
`,
    conInvocacion: `def icon(kind)
  if kind == "a"
    return compute("alpha")
  elsif kind == "b"
    return compute("beta")
  elsif kind == "c"
    return compute("gamma")
  elsif kind == "d"
    return compute("delta")
  elsif kind == "e"
    return compute("epsilon")
  else
    return "?"
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
    tabla: `package p

func Icon(kind string) string {
	if kind == "a" {
		return "alpha"
	} else if kind == "b" {
		return "beta"
	} else if kind == "c" {
		return "gamma"
	} else if kind == "d" {
		return "delta"
	} else if kind == "e" {
		return "epsilon"
	}
	return "?"
}
`,
    conInvocacion: `package p

func Icon(kind string) string {
	if kind == "a" {
		return compute("alpha")
	} else if kind == "b" {
		return compute("beta")
	} else if kind == "c" {
		return compute("gamma")
	} else if kind == "d" {
		return compute("delta")
	} else if kind == "e" {
		return compute("epsilon")
	}
	return "?"
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
    tabla: `class Icons {
  static String icon(String kind) {
    if (kind == "a") { return "alpha"; }
    else if (kind == "b") { return "beta"; }
    else if (kind == "c") { return "gamma"; }
    else if (kind == "d") { return "delta"; }
    else if (kind == "e") { return "epsilon"; }
    return "?";
  }
}
`,
    conInvocacion: `class Icons {
  static String icon(String kind) {
    if (kind == "a") { return compute("alpha"); }
    else if (kind == "b") { return compute("beta"); }
    else if (kind == "c") { return compute("gamma"); }
    else if (kind == "d") { return compute("delta"); }
    else if (kind == "e") { return compute("epsilon"); }
    return "?";
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
    tabla: `class Icons {
  static string Icon(string kind) {
    if (kind == "a") { return "alpha"; }
    else if (kind == "b") { return "beta"; }
    else if (kind == "c") { return "gamma"; }
    else if (kind == "d") { return "delta"; }
    else if (kind == "e") { return "epsilon"; }
    return "?";
  }
}
`,
    conInvocacion: `class Icons {
  static string Icon(string kind) {
    if (kind == "a") { return Compute("alpha"); }
    else if (kind == "b") { return Compute("beta"); }
    else if (kind == "c") { return Compute("gamma"); }
    else if (kind == "d") { return Compute("delta"); }
    else if (kind == "e") { return Compute("epsilon"); }
    return "?";
  }
}
`,
  },
];

describe("hypotheses/lookup-table — LOS SEIS LENGUAJES, misma forma", () => {
  for (const caso of CASOS) {
    it(`${caso.lenguaje}: escalera de 5 ramas que retornan literales ⇒ emite`, async () => {
      const file = await unit(caso.wasm, caso.probe, caso.tabla, caso.lenguaje);
      const { symbol, startLine, endLine } = wholeFile(file);
      const h = lookupTable.build(finding("conditional-chain", file, symbol, startLine, endLine), null, ctxFor(file));
      expect(h, `${caso.lenguaje} no emitió — si esto se pone rojo, la hipótesis quedó MUDA en ese lenguaje`).not.toBeNull();
      expect(h!.pattern).toBe("Lookup Table");
      expect(h!.state).toBe("ausente");
      expect(h!.checks.every((c) => c.role !== "required" || c.passed)).toBe(true);
    });

    it(`${caso.lenguaje}: la misma escalera pero cada rama INVOCA ⇒ silencio (es comportamiento, no un dato)`, async () => {
      const file = await unit(caso.wasm, caso.probe, caso.conInvocacion, caso.lenguaje);
      const { symbol, startLine, endLine } = wholeFile(file);
      const h = lookupTable.build(finding("conditional-chain", file, symbol, startLine, endLine), null, ctxFor(file));
      expect(h).toBeNull();
    });
  }
});

describe("hypotheses/lookup-table — la forma que ningún detector ve: `if` HERMANOS", () => {
  const HERMANOS = `function icon(kind: string): string {
  if (kind === "a") { return "alpha"; }
  if (kind === "b") { return "beta"; }
  if (kind === "c") { return "gamma"; }
  if (kind === "d") { return "delta"; }
  if (kind === "e") { return "epsilon"; }
  return "?";
}`;

  const HERMANOS_ASIGNAN = `function icon(kind: string): string {
  let out = "?";
  if (kind === "a") { out = "alpha"; }
  if (kind === "b") { out = "beta"; }
  if (kind === "c") { out = "gamma"; }
  if (kind === "d") { out = "delta"; }
  if (kind === "e") { out = "epsilon"; }
  return out;
}`;

  const TS = CASOS[0]!;

  it("cinco `if` sueltos que retornan ⇒ emite, y el ancla dueña es `many-returns`", async () => {
    const file = await unit(TS.wasm, TS.probe, HERMANOS, "typescript");
    const { symbol, startLine, endLine } = wholeFile(file);
    expect(lookupTable.build(finding("many-returns", file, symbol, startLine, endLine), null, ctxFor(file))).not.toBeNull();
  });

  it("EL DESEMPATE: el MISMO caso llegando por `complexity` ⇒ null (si no, la misma tabla se propone dos veces)", async () => {
    const file = await unit(TS.wasm, TS.probe, HERMANOS, "typescript");
    const { symbol, startLine, endLine } = wholeFile(file);
    expect(lookupTable.build(finding("complexity", file, symbol, startLine, endLine), null, ctxFor(file))).toBeNull();
  });

  it("cinco `if` sueltos que ASIGNAN a la misma variable ⇒ emite por `complexity`, y NO por `many-returns`", async () => {
    const file = await unit(TS.wasm, TS.probe, HERMANOS_ASIGNAN, "typescript");
    const { symbol, startLine, endLine } = wholeFile(file);
    expect(lookupTable.build(finding("complexity", file, symbol, startLine, endLine), null, ctxFor(file))).not.toBeNull();
    expect(lookupTable.build(finding("many-returns", file, symbol, startLine, endLine), null, ctxFor(file))).toBeNull();
  });
});

describe("hypotheses/lookup-table — los `required` que hacen dura la precondición", () => {
  const TS = CASOS[0]!;

  it("menos de 5 ramas ⇒ null", async () => {
    const src = `function icon(kind: string): string {
  if (kind === "a") { return "alpha"; }
  else if (kind === "b") { return "beta"; }
  else { return "?"; }
}`;
    const file = await unit(TS.wasm, TS.probe, src, "typescript");
    const { symbol, startLine, endLine } = wholeFile(file);
    expect(lookupTable.build(finding("conditional-chain", file, symbol, startLine, endLine), null, ctxFor(file))).toBeNull();
  });

  it("sujetos DISTINTOS por rama ⇒ null (no hay clave de tabla)", async () => {
    const src = `function icon(a: string, b: string, c: string, d: string, e: string): string {
  if (a === "1") { return "alpha"; }
  else if (b === "2") { return "beta"; }
  else if (c === "3") { return "gamma"; }
  else if (d === "4") { return "delta"; }
  else if (e === "5") { return "epsilon"; }
  else { return "?"; }
}`;
    const file = await unit(TS.wasm, TS.probe, src, "typescript");
    const { symbol, startLine, endLine } = wholeFile(file);
    expect(lookupTable.build(finding("conditional-chain", file, symbol, startLine, endLine), null, ctxFor(file))).toBeNull();
  });

  it("comparación por RANGO (no por igualdad) ⇒ null (un rango no es una clave)", async () => {
    const src = `function grade(n: number): string {
  if (n > 90) { return "A"; }
  else if (n > 80) { return "B"; }
  else if (n > 70) { return "C"; }
  else if (n > 60) { return "D"; }
  else if (n > 50) { return "E"; }
  else { return "F"; }
}`;
    const file = await unit(TS.wasm, TS.probe, src, "typescript");
    const { symbol, startLine, endLine } = wholeFile(file);
    expect(lookupTable.build(finding("conditional-chain", file, symbol, startLine, endLine), null, ctxFor(file))).toBeNull();
  });

  it("salida MIXTA (unas retornan, otras asignan) ⇒ null", async () => {
    const src = `function icon(kind: string): string {
  let out = "?";
  if (kind === "a") { return "alpha"; }
  else if (kind === "b") { out = "beta"; }
  else if (kind === "c") { return "gamma"; }
  else if (kind === "d") { out = "delta"; }
  else if (kind === "e") { return "epsilon"; }
  return out;
}`;
    const file = await unit(TS.wasm, TS.probe, src, "typescript");
    const { symbol, startLine, endLine } = wholeFile(file);
    expect(lookupTable.build(finding("conditional-chain", file, symbol, startLine, endLine), null, ctxFor(file))).toBeNull();
  });

  it("LA TRAMPA #3: si el archivo YA declara la tabla con estas claves ⇒ SILENCIO, no una propuesta con menos confianza", async () => {
    const src = `const ICONS = { "a": "alpha", "b": "beta", "c": "gamma", "d": "delta", "e": "epsilon" };
function icon(kind: string): string {
  if (kind === "a") { return "alpha"; }
  else if (kind === "b") { return "beta"; }
  else if (kind === "c") { return "gamma"; }
  else if (kind === "d") { return "delta"; }
  else if (kind === "e") { return "epsilon"; }
  else { return "?"; }
}`;
    const file = await unit(TS.wasm, TS.probe, src, "typescript");
    const fn = file.functions.find((f) => f.name === "icon")!;
    const h = lookupTable.build(finding("conditional-chain", file, "icon", fn.startLine, fn.endLine), null, ctxFor(file));
    expect(h).toBeNull();
  });

  it("EL ARM ENTERO, NO SU PRIMERA SENTENCIA: un `switch` cuyas ramas asignan DOS variables y una invoca ⇒ null", async () => {
    /* DEFECTO REAL congelado acá (encontrado juzgando `Ghost ui-btn.js:11`): el
     * campo `body` de `switch_case` es REPETIDO en tree-sitter-javascript y
     * `childForFieldName` devuelve sólo la PRIMERA sentencia. Con la lectura
     * vieja, este fixture emitía —juzgaba únicamente `a = "..."` y no veía la
     * invocación de la segunda línea. */
    const src = `function styles(kind: string): void {
  let a = "";
  let b = "";
  switch (kind) {
  case "one": a = "x1"; b = compute("y1"); break;
  case "two": a = "x2"; b = compute("y2"); break;
  case "three": a = "x3"; b = compute("y3"); break;
  case "four": a = "x4"; b = compute("y4"); break;
  case "five": a = "x5"; b = compute("y5"); break;
  }
}`;
    const file = await unit(TS.wasm, TS.probe, src, "typescript");
    const { symbol, startLine, endLine } = wholeFile(file);
    expect(lookupTable.build(finding("conditional-chain", file, symbol, startLine, endLine), null, ctxFor(file))).toBeNull();
  });

  it("dos destinos, pero los MISMOS en todas las ramas y todos literales ⇒ emite (el valor de la tabla es un par)", async () => {
    const src = `function styles(kind: string): void {
  let a = "";
  let b = "";
  switch (kind) {
  case "one": a = "x1"; b = "y1"; break;
  case "two": a = "x2"; b = "y2"; break;
  case "three": a = "x3"; b = "y3"; break;
  case "four": a = "x4"; b = "y4"; break;
  case "five": a = "x5"; b = "y5"; break;
  }
}`;
    const file = await unit(TS.wasm, TS.probe, src, "typescript");
    const { symbol, startLine, endLine } = wholeFile(file);
    expect(lookupTable.build(finding("conditional-chain", file, symbol, startLine, endLine), null, ctxFor(file))).not.toBeNull();
  });

  it("sin `ctx.file` ⇒ null (no evaluado, NUNCA 'cumple')", async () => {
    const file = await unit(TS.wasm, TS.probe, CASOS[0]!.tabla, "typescript");
    const { symbol, startLine, endLine } = wholeFile(file);
    expect(lookupTable.build(finding("conditional-chain", file, symbol, startLine, endLine), null, ctxFor(null))).toBeNull();
  });
});

describe("hypotheses/lookup-table — LA TRAMPA #2: no puede borrarle la propuesta a nadie", () => {
  it("CONTRATO: `state` es SIEMPRE 'ausente' — nunca un estado CONFIRMADO", async () => {
    /* `engine.ts#arbitrateRivalHypotheses` sólo retira una oportunidad cuando
     * OTRO patrón sobre el mismo `Finding` está en `ya-aplicado`/
     * `aplicado-eludido` y sus `places` solapan. Una hipótesis que no puede
     * estar confirmada nunca puede retirar la propuesta de `Extract Method`
     * ni la de `Value Object`. Esto lo congela. */
    const TS = CASOS[0]!;
    for (const src of [TS.tabla, TS.conInvocacion]) {
      const file = await unit(TS.wasm, TS.probe, src, "typescript");
      const { symbol, startLine, endLine } = wholeFile(file);
      for (const kind of ["complexity", "conditional-chain", "many-returns", "repeated-switch"]) {
        const h = lookupTable.build(finding(kind, file, symbol, startLine, endLine), null, ctxFor(file));
        if (h) expect(h.state, `${kind} devolvió un estado CONFIRMADO`).toBe("ausente");
      }
    }
  });

  it("las anclas declaradas son exactamente las cuatro medidas", () => {
    expect([...lookupTable.anchors].sort()).toEqual(["complexity", "conditional-chain", "many-returns", "repeated-switch"]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * OLA AS, AS2 — LO QUE ENCONTRÓ JUZGAR LA PRIMERA MEDICIÓN
 *
 * Los dos casos de abajo salieron EMITIDOS con la evidencia «N/N ramas
 * producen un valor fijo (sin invocación...)» y abriendo el archivo real la
 * evidencia era falsa. Los dos son de `Ghost
 * apps/admin/src/members/detail/member-event.ts`, que es el testigo que el
 * encargo de la ola nombra: el árbol de Ghost de HOY ya no es la cadena de 20
 * literales que el encargo describe.
 * ══════════════════════════════════════════════════════════════════════════ */
describe("hypotheses/lookup-table — la ACCIÓN ENTERA de la rama, no sólo el valor", () => {
  const TS = CASOS[0]!;

  it("una rama que INVOCA en una declaración antes de retornar un literal ⇒ silencio", async () => {
    /* La forma exacta de `getAction`: la invocación no está ni en el `return`
     * ni en una asignación, está en un `const`. `isFixedValue` mira el valor
     * retornado y no la veía. Misma clase de defecto que el `if x := f(); cond`
     * de Go. */
    const src = `function act(t: string): string {
  if (t === "a") { return "one"; }
  if (t === "b") { return "two"; }
  if (t === "c") { return "three"; }
  if (t === "d") { return "four"; }
  if (t === "e") { const s = trim("x"); return s ? "five" : "six"; }
  return "";
}`;
    const file = await unit(TS.wasm, TS.probe, src, "typescript");
    const { symbol, startLine, endLine } = wholeFile(file);
    expect(lookupTable.build(finding("many-returns", file, symbol, startLine, endLine), null, ctxFor(file))).toBeNull();
  });

  it("las MISMAS cinco ramas SIN la invocación ⇒ emite (el que cambia es el defecto, no la forma)", async () => {
    const src = `function act(t: string): string {
  if (t === "a") { return "one"; }
  if (t === "b") { return "two"; }
  if (t === "c") { return "three"; }
  if (t === "d") { return "four"; }
  if (t === "e") { return "five"; }
  return "";
}`;
    const file = await unit(TS.wasm, TS.probe, src, "typescript");
    const { symbol, startLine, endLine } = wholeFile(file);
    expect(lookupTable.build(finding("many-returns", file, symbol, startLine, endLine), null, ctxFor(file))).not.toBeNull();
  });

  it("una rama con un `if` ANIDADO que pisa el valor ya asignado ⇒ silencio", async () => {
    /* La forma exacta de `getIcon`: `icon = 'subscriptions'` y después
     * `if (event.data.type === 'canceled') { icon = 'canceled-subscription' }`.
     * Es un sub-despacho sobre OTRO campo: una tabla sobre el primero no lo
     * expresa, y aplicarla cambiaría el comportamiento. */
    const src = `function ico(t: string, sub: string): string {
  let icon = "";
  if (t === "a") { icon = "one"; }
  if (t === "b") { icon = "two"; }
  if (t === "c") { icon = "three"; }
  if (t === "d") { icon = "four"; }
  if (t === "e") { icon = "five"; if (sub === "x") { icon = "six"; } }
  return icon;
}`;
    const file = await unit(TS.wasm, TS.probe, src, "typescript");
    const { symbol, startLine, endLine } = wholeFile(file);
    expect(lookupTable.build(finding("complexity", file, symbol, startLine, endLine), null, ctxFor(file))).toBeNull();
  });

  it("un ternario entre dos literales SIGUE pasando (es una entrada de tabla de dos casos)", async () => {
    const src = `function ico(t: string, sub: boolean): string {
  let icon = "";
  if (t === "a") { icon = "one"; }
  if (t === "b") { icon = "two"; }
  if (t === "c") { icon = "three"; }
  if (t === "d") { icon = "four"; }
  if (t === "e") { icon = sub ? "five" : "six"; }
  return icon;
}`;
    const file = await unit(TS.wasm, TS.probe, src, "typescript");
    const { symbol, startLine, endLine } = wholeFile(file);
    expect(lookupTable.build(finding("complexity", file, symbol, startLine, endLine), null, ctxFor(file))).not.toBeNull();
  });

  it("cadena en una función anidada que RECLAMA (cognitiva >= 15) ⇒ la de afuera calla, la de adentro propone", async () => {
    /* 13 de 96 propuestas de la primera medición eran este duplicado: la
     * función anidada tiene su PROPIO hallazgo y la de afuera "veía" su cadena
     * con `walkTree`. */
    const src = `function outer(items: string[]): string[] {
  function inner(t: string): string {
    if (t === "a") { return "one"; }
    if (t === "b") { return "two"; }
    if (t === "c") { return "three"; }
    if (t === "d") { return "four"; }
    if (t === "e") { return "five"; }
    return "";
  }
  return items.map(inner);
}`;
    const file = await unitConMetricas(TS.wasm, TS.probe, src, "typescript", 20);
    const outer = file.functions.find((f) => f.name === "outer")!;
    const inner = file.functions.find((f) => f.name === "inner")!;
    expect(
      lookupTable.build(finding("many-returns", file, "outer", outer.startLine, outer.endLine), null, ctxFor(file)),
      "la de AFUERA no debe proponer una cadena que la de adentro puede reclamar",
    ).toBeNull();
    expect(
      lookupTable.build(finding("many-returns", file, "inner", inner.startLine, inner.endLine), null, ctxFor(file)),
      "la de adentro, que es su dueña, SÍ debe proponerla",
    ).not.toBeNull();
  });

  it("cadena en una función anidada que NO reclama (chica) ⇒ la de afuera SÍ la propone", async () => {
    /* La corrección de la corrección, y también medida: cortar en TODA función
     * anidada bajó `eslint` de 23 propuestas a 11 y se llevó puestas dos
     * verdaderas juzgadas. En eslint TODO vive adentro de
     * `create(context) { … return { Handler(node) {…} } }`, y el handler de
     * adentro es chico: si el de afuera no puede mirar adentro, esa cadena no
     * la propone NADIE. Con métricas en cero la anidada no reclama nada. */
    const src = `function outer(items: string[]): string[] {
  function inner(t: string): string {
    if (t === "a") { return "one"; }
    if (t === "b") { return "two"; }
    if (t === "c") { return "three"; }
    if (t === "d") { return "four"; }
    if (t === "e") { return "five"; }
    return "";
  }
  return items.map(inner);
}`;
    const file = await unit(TS.wasm, TS.probe, src, "typescript");
    const outer = file.functions.find((f) => f.name === "outer")!;
    expect(
      lookupTable.build(finding("many-returns", file, "outer", outer.startLine, outer.endLine), null, ctxFor(file)),
      "si la anidada no puede reclamarla, perderla es peor que proponerla desde afuera",
    ).not.toBeNull();
  });
});
