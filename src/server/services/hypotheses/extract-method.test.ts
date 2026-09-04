import { describe, expect, it } from "vitest";

import type { Capability } from "../detect/capabilities.js";
import { pisoDeclarado, resolveThreshold, type Threshold } from "../detect/thresholds.js";
import type { Finding, FileUnit, RoleLocation } from "../detect/types.js";
import { fileUnitFrom, nodeSetsFor, parseRoot } from "../detect/testing.js";
import { EMPTY_NEIGHBORHOOD } from "../graph/neighborhood.js";
import { hypothesis as extractMethod, analizarFormaDeLaFuncion, analizarFormaPorFrontera } from "./extract-method.js";
import type { HypothesisContext } from "./types.js";

/* ────────────────────────────────────────────────────────────────────────
 * Árboles REALES (`detect/testing.ts`, el mismo `web-tree-sitter` y las
 * mismas gramáticas `.wasm` que producción) — la clasificación que estos
 * tests ejercitan es de forma sintáctica (líneas en blanco, control de
 * flujo), y con un árbol simulado no se probaría nada.
 * ──────────────────────────────────────────────────────────────────────── */

const TS_WASM = "tree-sitter-typescript.wasm";
const PYTHON_WASM = "tree-sitter-python.wasm";
const TS_SETS_PROBE = `
function f(x: number): void {
  if (x > 0) { for (const y of []) { f(y); } } else { f(x); }
  try { f(x); } catch (e) { f(x); }
}
`;
const PYTHON_SETS_PROBE = `
class P:
    def m(self, x):
        if x > 0:
            for y in []:
                self.m(y)
        try:
            self.m(x)
        except Exception:
            self.m(x)
`;

/**
 * OLA AH (AH3) — probe de Python con `if/elif/else` Y `match/case`, como el
 * `PYTHON_PROBE` de producción (`code-analyzer.ts`). NO es un lujo: el probe
 * corto de arriba no tiene ninguna rama `else`, así que `deriveNodeSets` no
 * llega a clasificar `if_statement` como if-like y `nestingNodes` sale
 * {for_statement, except_clause}. El camino del ancla `complexity` mide
 * profundidad con `nestingNodes`, así que con el probe corto mediría sobre
 * una gramática incompleta y el test no probaría lo que dice probar —
 * verificado volcando los conjuntos derivados de los dos probes.
 */
const PYTHON_SETS_PROBE_COMPLETO = `
class P:
    def m(self, x):
        if x > 0:
            return 1
        elif x < 0:
            return 2
        else:
            return 3

    def describe(self, kind):
        match kind:
            case "a":
                return "a"
            case _:
                return "z"

    def loopy(self):
        while True:
            break
        for i in range(3):
            print(i)
        try:
            self.m(1)
        except Exception:
            pass
`;

async function unitFrom(wasm: string, probe: string, source: string, language: string, file: string): Promise<FileUnit> {
  const [sets, root] = await Promise.all([nodeSetsFor(wasm, probe), parseRoot(wasm, source)]);
  return fileUnitFrom(root, sets, language, { file });
}

/** OLA AH (AH3) — igual, pero con las métricas que el walker de producción
 *  calcula y el arnés no: el camino del ancla `complexity` las lee, así que el
 *  test dice explícitamente qué está asumiendo. */
async function unitConMetricas(
  wasm: string,
  probe: string,
  source: string,
  language: string,
  file: string,
  metrics: { cognitive: number; maxNesting: number },
): Promise<FileUnit> {
  const [sets, root] = await Promise.all([nodeSetsFor(wasm, probe), parseRoot(wasm, source)]);
  return fileUnitFrom(root, sets, language, { file, metrics });
}

function fakeThreshold(): Threshold {
  return resolveThreshold(pisoDeclarado(45, { rationale: "test" }), {
    language: "typescript",
    sampleSize: () => 0,
    corpusP95: () => null,
  });
}

function loc(file: string, startLine: number, endLine: number, symbol: string): RoleLocation {
  return { file, startLine, endLine, symbol, role: "función larga" };
}

function longFunctionFinding(file: string, startLine: number, endLine: number, symbol: string, lines: number): Finding {
  return {
    id: "f-long-1",
    detectorId: "long-function",
    kind: "long-function",
    scope: "intra-function",
    language: "typescript",
    title: `${symbol} ocupa ${lines} líneas`,
    detail: "d",
    trigger: [{ label: "líneas", value: lines, threshold: fakeThreshold() }],
    locations: [loc(file, startLine, endLine, symbol)],
    severity: 50,
    advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
  };
}

/** OLA AH (AH3) — el `Finding` del ancla nueva, con la MISMA terna de
 *  `locations` que `detect/intra-function/complexity.ts` escribe. */
function complexityFinding(file: string, startLine: number, endLine: number, symbol: string, cognitive: number): Finding {
  return {
    id: "f-complexity-1",
    detectorId: "complexity",
    kind: "complexity",
    scope: "intra-function",
    language: "typescript",
    title: `${symbol}: complejidad cognitiva ${cognitive}`,
    detail: "d",
    trigger: [{ label: "complejidad cognitiva", value: cognitive, threshold: fakeThreshold() }],
    locations: [{ file, startLine, endLine, symbol, role: "función con complejidad cognitiva alta" }],
    severity: 60,
    advice: { primary: { name: "x", kind: "refactorizacion", why: "y", source: "z" } },
  };
}

function fakeCtx(file: FileUnit | null, overrides: Partial<HypothesisContext> = {}): HypothesisContext {
  return {
    file,
    fileAt: (p: string) => (file && file.path === p ? file : null),
    repo: { repoName: "r", files: [], functions: [], clones: [], graph: null },
    capabilities: new Set<Capability>(),
    setsFor: () => ({
      functionNodes: new Set(),
      branchNodes: new Set(),
      chainNodes: new Set(),
      cloneNodes: new Set(),
      classNodes: new Set(),
      nestingNodes: new Set(),
      constructorNodes: new Set(),
      exceptionNodes: new Set(),
      switchContainerNodes: new Set(),
    }),
    neighborhood: EMPTY_NEIGHBORHOOD,
    branches: () => null,
    ...overrides,
  };
}

function endLineOf(source: string): number {
  return source.split("\n").length;
}

describe("hypotheses/extract-method — analizarFormaDeLaFuncion", () => {
  it("sin ctx.file ⇒ null (no evaluado, nunca 'cumple')", () => {
    const problem = longFunctionFinding("a.ts", 1, 5, "slow", 50);
    expect(analizarFormaDeLaFuncion(problem, fakeCtx(null))).toBeNull();
  });

  it("cuenta 3 párrafos reales cuando el cuerpo tiene 3 bloques separados por líneas en blanco", async () => {
    const src = `function slow(x: number): number {
  const a = x + 1;
  const b = a * 2;

  if (b > 0) {
    for (const y of [1, 2]) {
      console.log(y);
    }
  }

  return b;
}`;
    const file = await unitFrom(TS_WASM, TS_SETS_PROBE, src, "typescript", "slow.ts");
    const problem = longFunctionFinding("slow.ts", 1, endLineOf(src), "slow", 45);
    const forma = analizarFormaDeLaFuncion(problem, fakeCtx(file));
    expect(forma?.parrafosReales.length).toBe(3);
  });
});

describe("hypotheses/extract-method — required: varios-pasos-separados-por-blancos", () => {
  it("CANDIDATA: >= 3 párrafos reales ⇒ build() no nulo, estado ausente (hay lógica real)", async () => {
    const src = `function slow(items: number[]): number {
  let total = 0;
  const seen = new Set<number>();

  for (const item of items) {
    if (seen.has(item)) {
      continue;
    }
    seen.add(item);
    total += item;
  }

  try {
    total = normalize(total);
  } catch (e) {
    total = 0;
  }

  return total;
}`;
    const file = await unitFrom(TS_WASM, TS_SETS_PROBE, src, "typescript", "slow.ts");
    const problem = longFunctionFinding("slow.ts", 1, endLineOf(src), "slow", 45);
    const h = extractMethod.build(problem, null, fakeCtx(file));
    expect(h).not.toBeNull();
    expect(h?.pattern).toBe("Extract Method");
    expect(h?.state).toBe("ausente");
    expect(h?.confidence).not.toBeNull();
  });

  // Forma real, verificada a mano — ver el docstring del módulo:
  // `newtonsoft-json/Src/Newtonsoft.Json/JsonWriter.cs:1478 WriteValue`: el
  // cuerpo ENTERO es `while (true) { switch (typeCode) { ... } }` — un único
  // hijo directo del bloque, cero líneas en blanco entre sentencias.
  it("NO CANDIDATA: cuerpo dominado por un único switch de despacho (1 párrafo) ⇒ build() null (forma reducida a TS)", async () => {
    const src = `function writeValue(code: number, value: unknown): void {
  while (true) {
    switch (code) {
      case 1:
        writeA(value);
        return;
      case 2:
        writeB(value);
        return;
      default:
        return;
    }
  }
}`;
    const file = await unitFrom(TS_WASM, TS_SETS_PROBE, src, "typescript", "writer.ts");
    const problem = longFunctionFinding("writer.ts", 1, endLineOf(src), "writeValue", 45);
    const h = extractMethod.build(problem, null, fakeCtx(file));
    expect(h).toBeNull();
  });

  // Forma real, verificada a mano — ver el docstring del módulo:
  // `guava/.../AggregateFutureState.java:84 getOrInitSeenExceptions`: el
  // comentario, la declaración, el `if` y el `return` quedan TODOS pegados
  // sin una sola línea en blanco entre sí — 1 párrafo, dominado por comentario.
  it("NO CANDIDATA: comentario + código pegados sin líneas en blanco (1 párrafo) ⇒ build() null", async () => {
    const src = `function getOrInit(): number {
  // Explica una condición de carrera sutil entre dos hilos que compiten
  // por inicializar el mismo campo perezoso la primera vez.
  let cached = _cached;
  if (cached === null) {
    cached = 0;
  }
  return cached;
}`;
    const file = await unitFrom(TS_WASM, TS_SETS_PROBE, src, "typescript", "cache.ts");
    const problem = longFunctionFinding("cache.ts", 1, endLineOf(src), "getOrInit", 45);
    const h = extractMethod.build(problem, null, fakeCtx(file));
    expect(h).toBeNull();
  });

  it("no evaluable (ctx.file null) ⇒ build() null, nunca 'holds:true' permisivo", () => {
    const problem = longFunctionFinding("a.ts", 1, 50, "slow", 50);
    expect(extractMethod.build(problem, null, fakeCtx(null))).toBeNull();
  });
});

describe("hypotheses/extract-method — appliedState: ya-aplicado cuando ya es una secuencia plana de pasos con nombre", () => {
  it("3 párrafos, cada uno UNA sola llamada, sin control de flujo ⇒ ya-aplicado (nada más que extraer)", async () => {
    const src = `function orchestrate(): void {
  prepareInput();

  runCoreStep();

  finalizeOutput();
}`;
    const file = await unitFrom(TS_WASM, TS_SETS_PROBE, src, "typescript", "orchestrate.ts");
    const problem = longFunctionFinding("orchestrate.ts", 1, endLineOf(src), "orchestrate", 45);
    const h = extractMethod.build(problem, null, fakeCtx(file));
    expect(h).not.toBeNull();
    expect(h?.state).toBe("ya-aplicado");
    expect(h?.confidence).toBeNull();
  });
});

describe("hypotheses/extract-method — discriminadores", () => {
  it("varios-pasos-con-logica-real: sube con >= 2 bloques con control de flujo propio", async () => {
    const src = `function slow(items: number[]): number {
  let total = 0;

  if (items.length === 0) {
    return 0;
  }

  for (const item of items) {
    total += item;
  }

  return total;
}`;
    const file = await unitFrom(TS_WASM, TS_SETS_PROBE, src, "typescript", "slow.ts");
    const problem = longFunctionFinding("slow.ts", 1, endLineOf(src), "slow", 45);
    const h = extractMethod.build(problem, null, fakeCtx(file));
    const d = h?.discriminators.find((c) => c.label.includes("control de flujo propio o agrupan"));
    expect(d?.passed).toBe(true);
  });

  it("baja-densidad-de-comentario: falla cuando el comentario domina un bloque grande", async () => {
    const src = `function slow(x: number): number {
  /*
   * Un comentario deliberadamente largo, de varias líneas, para empujar la
   * proporción de comentario por encima de la mitad de las filas de este
   * primer bloque real del cuerpo de la función bajo prueba.
   */
  const a = x + 1;

  if (a > 0) {
    return a;
  }

  return 0;
}`;
    const file = await unitFrom(TS_WASM, TS_SETS_PROBE, src, "typescript", "slow.ts");
    const problem = longFunctionFinding("slow.ts", 1, endLineOf(src), "slow", 45);
    const h = extractMethod.build(problem, null, fakeCtx(file));
    const d = h?.discriminators.find((c) => c.label.includes("comentario"));
    expect(d?.passed).toBe(false);
  });
});

describe("hypotheses/extract-method — cruza lenguajes (Python: indentación, sin llaves)", () => {
  it("misma regla de líneas en blanco en Python", async () => {
    const src = `def slow(items):
    total = 0
    seen = set()

    for item in items:
        if item in seen:
            continue
        seen.add(item)
        total += item

    try:
        total = normalize(total)
    except Exception:
        total = 0

    return total
`;
    const file = await unitFrom(PYTHON_WASM, PYTHON_SETS_PROBE, src, "python", "slow.py");
    const problem: Finding = {
      ...longFunctionFinding("slow.py", 1, endLineOf(src) - 1, "slow", 45),
      language: "python",
    };
    const h = extractMethod.build(problem, null, fakeCtx(file));
    expect(h).not.toBeNull();
    expect(h?.state).toBe("ausente");
  });
});


/* ────────────────────────────────────────────────────────────────────────
 * OLA AH (AH3) — EL CAMINO DEL ANCLA `complexity`. Cada test nombra la
 * INTENCIÓN que verifica el check que ejercita.
 * ──────────────────────────────────────────────────────────────────────── */

/** Bloque anidado con lógica propia: el `if` de adentro está envuelto por el
 *  `for` y carga otra decisión (el `if` interno). Sin una sola línea en
 *  blanco: el camino viejo no lo vería ni con un `long-function` al lado. */
const TS_ANIDADA = `function recorrer(items: number[], modo: string): number {
  let total = 0;
  for (const it of items) {
    if (it > 0) {
      if (modo === "doble") {
        total += it * 2;
      } else {
        total += it;
      }
    }
  }
  return total;
}`;

describe("hypotheses/extract-method — ancla `complexity`: required 1 (el anidamiento es el driver del costo)", () => {
  it("CANDIDATA: maxNesting >= 3 y un bloque anidado con decisión propia ⇒ build() no nulo, estado ausente", async () => {
    const unit = await unitConMetricas(TS_WASM, TS_SETS_PROBE, TS_ANIDADA, "typescript", "a.ts", { cognitive: 21, maxNesting: 4 });
    const finding = complexityFinding("a.ts", 1, endLineOf(TS_ANIDADA), "recorrer", 21);
    const built = extractMethod.build(finding, null, fakeCtx(unit));
    expect(built).not.toBeNull();
    expect(built!.pattern).toBe("Extract Method");
    expect(built!.state).toBe("ausente");
    expect(built!.checks.some((c) => c.label.includes("niveles de anidamiento") && c.passed)).toBe(true);
  });

  it("NO CANDIDATA: maxNesting < 3 ⇒ el costo lo domina el conteo de ramas, no la profundidad ⇒ build() null", async () => {
    const unit = await unitConMetricas(TS_WASM, TS_SETS_PROBE, TS_ANIDADA, "typescript", "a.ts", { cognitive: 21, maxNesting: 2 });
    const finding = complexityFinding("a.ts", 1, endLineOf(TS_ANIDADA), "recorrer", 21);
    expect(extractMethod.build(finding, null, fakeCtx(unit))).toBeNull();
  });

  it("no evaluable (ctx.file null) ⇒ build() null, nunca 'holds:true' permisivo", () => {
    const finding = complexityFinding("a.ts", 1, 12, "recorrer", 21);
    expect(extractMethod.build(finding, null, fakeCtx(null))).toBeNull();
  });
});

describe("hypotheses/extract-method — ancla `complexity`: required 2 (la escala: el bloque tiene que pagar un método)", () => {
  it("NO CANDIDATA: bloque anidado con UNA sola decisión (guarda suelta) ⇒ build() null", async () => {
    const src = `function f(items: number[]): number {
  let total = 0;
  for (const it of items) {
    if (it > 0) {
      total += it;
    }
  }
  return total;
}`;
    const unit = await unitConMetricas(TS_WASM, TS_SETS_PROBE, src, "typescript", "a.ts", { cognitive: 16, maxNesting: 3 });
    const finding = complexityFinding("a.ts", 1, endLineOf(src), "f", 16);
    expect(extractMethod.build(finding, null, fakeCtx(unit))).toBeNull();
  });

  it("NO CANDIDATA: un contenedor de switch nunca es el bloque candidato (sus brazos son UNA decisión: eso es Strategy/State)", async () => {
    const src = `function f(items: string[]): number {
  let total = 0;
  for (const it of items) {
    switch (it) {
      case "a":
        total += 1;
        break;
      case "b":
        total += 2;
        break;
      default:
        total += 3;
    }
  }
  return total;
}`;
    const unit = await unitConMetricas(TS_WASM, TS_SETS_PROBE, src, "typescript", "a.ts", { cognitive: 20, maxNesting: 3 });
    const finding = complexityFinding("a.ts", 1, endLineOf(src), "f", 20);
    expect(extractMethod.build(finding, null, fakeCtx(unit))).toBeNull();
  });
});

describe("hypotheses/extract-method — ancla `complexity`: required 3 (no proponer dos veces lo mismo sobre la misma función)", () => {
  /** Un cuerpo con >= 3 párrafos reales Y bloque anidado: el camino viejo SÍ
   *  dispararía si hubiera un `long-function` sobre el mismo rango. */
  const TS_PARRAFOS_Y_ANIDADA = `function f(items: number[], modo: string): number {
  let total = 0;

  for (const it of items) {
    if (it > 0) {
      if (modo === "doble") {
        total += it * 2;
      } else {
        total += it;
      }
    }
  }

  return total;
}`;

  it("NO CANDIDATA: el ancla `long-function` cubre el mismo rango y su required se cumple ⇒ build() null (no es cobertura nueva)", async () => {
    const unit = await unitConMetricas(TS_WASM, TS_SETS_PROBE, TS_PARRAFOS_Y_ANIDADA, "typescript", "a.ts", { cognitive: 21, maxNesting: 4 });
    const fin = endLineOf(TS_PARRAFOS_Y_ANIDADA);
    const gemelo = longFunctionFinding("a.ts", 1, fin, "f", 60);
    const ctx = fakeCtx(unit, { neighborhood: { ...EMPTY_NEIGHBORHOOD, findingsInFile: () => [gemelo] } });
    expect(extractMethod.build(complexityFinding("a.ts", 1, fin, "f", 21), null, ctx)).toBeNull();
  });

  it("SÍ CANDIDATA con gemelo MUDO: hay `long-function` sobre el mismo rango pero el cuerpo no llega a 3 párrafos ⇒ el camino viejo no propone nada, éste sí", async () => {
    const unit = await unitConMetricas(TS_WASM, TS_SETS_PROBE, TS_ANIDADA, "typescript", "a.ts", { cognitive: 21, maxNesting: 4 });
    const fin = endLineOf(TS_ANIDADA);
    const gemelo = longFunctionFinding("a.ts", 1, fin, "recorrer", 60);
    const ctx = fakeCtx(unit, { neighborhood: { ...EMPTY_NEIGHBORHOOD, findingsInFile: () => [gemelo] } });
    const built = extractMethod.build(complexityFinding("a.ts", 1, fin, "recorrer", 21), null, ctx);
    expect(built).not.toBeNull();
    expect(built!.state).toBe("ausente");
  });

  it("un `long-function` en OTRO rango del mismo archivo no calla nada (la comparación es por rango exacto, no por archivo)", async () => {
    const unit = await unitConMetricas(TS_WASM, TS_SETS_PROBE, TS_PARRAFOS_Y_ANIDADA, "typescript", "a.ts", { cognitive: 21, maxNesting: 4 });
    const fin = endLineOf(TS_PARRAFOS_Y_ANIDADA);
    const otro = longFunctionFinding("a.ts", 200, 260, "g", 60);
    const ctx = fakeCtx(unit, { neighborhood: { ...EMPTY_NEIGHBORHOOD, findingsInFile: () => [otro] } });
    expect(extractMethod.build(complexityFinding("a.ts", 1, fin, "f", 21), null, ctx)).not.toBeNull();
  });
});

describe("hypotheses/extract-method — ancla `complexity`: el camino viejo queda intacto", () => {
  it("un Finding `long-function` sigue evaluándose por el camino de los párrafos, no por el nuevo", async () => {
    const src = `function tres(): number {
  const a = 1;
  if (a > 0) {
    return a;
  }

  const b = 2;
  for (let i = 0; i < b; i++) {
    console.log(i);
  }

  const c = 3;
  return c;
}`;
    const unit = await unitConMetricas(TS_WASM, TS_SETS_PROBE, src, "typescript", "a.ts", { cognitive: 4, maxNesting: 1 });
    const built = extractMethod.build(longFunctionFinding("a.ts", 1, endLineOf(src), "tres", 60), null, fakeCtx(unit));
    expect(built).not.toBeNull();
    // El required del camino viejo, no los del nuevo: maxNesting=1 habría matado al nuevo.
    expect(built!.checks.some((c) => c.label.includes("bloques separados por líneas en blanco"))).toBe(true);
  });

  it("cruza lenguajes: la misma regla de anidamiento en Python (sin llaves)", async () => {
    const src = `def recorrer(items, modo):
    total = 0
    for it in items:
        if it > 0:
            if modo == "doble":
                total += it * 2
            else:
                total += it
    return total`;
    const unit = await unitConMetricas(PYTHON_WASM, PYTHON_SETS_PROBE_COMPLETO, src, "python", "a.py", { cognitive: 19, maxNesting: 4 });
    const finding = complexityFinding("a.py", 1, endLineOf(src), "recorrer", 19);
    const built = extractMethod.build(finding, null, fakeCtx(unit));
    expect(built).not.toBeNull();
    expect(built!.state).toBe("ausente");
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * OLA AI (AI5) — EL TERCER CAMINO: la frontera que dibuja la gramática.
 *
 * Un test por INTENCIÓN, y ninguno toca los tests de los dos caminos
 * anteriores. El probe de TypeScript de arriba (`TS_SETS_PROBE`) NO tiene
 * ningún `switch`, así que `switchContainerNodes` sale vacío y
 * `switch_statement` ni siquiera entra en `nestingNodes` — el mismo hallazgo
 * del arnés que AH3 dejó escrito para Python, en TypeScript. Un test escrito
 * con ese probe mediría sobre una gramática incompleta y NO probaría la
 * exclusión del contenedor de `switch`, que es justamente una de las
 * intenciones de este camino. De ahí el probe completo de acá abajo; el corto
 * queda donde estaba, sin tocar.
 * ──────────────────────────────────────────────────────────────────────── */
const TS_SETS_PROBE_COMPLETO = `
function f(x: number): string {
  if (x > 0) { for (const y of []) { f(y); } } else { f(x); }
  while (x > 0) { x--; }
  try { f(x); } catch (e) { f(x); }
  switch (x) {
    case 1: return "a";
    default: return "b";
  }
}
`;

/** Denso: NINGUNA línea en blanco (la regla vieja cuenta 1 párrafo), pero la
 *  gramática marca cuatro grupos y dos de ellos son bloques de control
 *  multi-fila que no son `switch`. */
const TS_DENSA_CON_BLOQUES = `function slow(items: number[]): number {
  let total = 0;
  const seen = new Set<number>();
  for (const item of items) {
    if (seen.has(item)) { continue; }
    seen.add(item);
    total += item;
  }
  try {
    total = normalize(total);
  } catch (e) {
    total = 0;
  }
  return total;
}`;

/** Igual de densa, pero con un bloque ANIDADO que SÍ cumple las dos
 *  condiciones estructurales del camino de AH3 (>= 1 envoltura y >= 2
 *  decisiones propias): sirve para probar que este camino se calla cuando
 *  aquél ya propone. */
const TS_DENSA_ANIDADA = `function slow(items: number[]): number {
  let total = 0;
  for (const item of items) {
    if (item > 0) {
      for (const y of [1, 2]) {
        total += y;
      }
    }
  }
  try {
    total = normalize(total);
  } catch (e) {
    total = 0;
  }
  return total;
}`;

describe("hypotheses/extract-method — AI5, tercer camino: frontera de bloque", () => {
  it("sin ctx.file ⇒ null (no evaluado, nunca 'cumple')", () => {
    const problem = longFunctionFinding("a.ts", 1, 5, "slow", 50);
    expect(analizarFormaPorFrontera(problem, fakeCtx(null))).toBeNull();
  });

  it("INTENCIÓN 'la gramática marca los pasos': cuerpo SIN una sola línea en blanco ⇒ el camino viejo cuenta 1 párrafo y éste cuenta 4 grupos con 2 bloques", async () => {
    const unit = await unitFrom(TS_WASM, TS_SETS_PROBE_COMPLETO, TS_DENSA_CON_BLOQUES, "typescript", "a.ts");
    const problem = longFunctionFinding("a.ts", 1, endLineOf(TS_DENSA_CON_BLOQUES), "slow", 60);
    const forma = analizarFormaPorFrontera(problem, fakeCtx(unit));
    expect(forma?.parrafosDeLaReglaVieja).toBe(1);
    expect(forma?.gruposReales.length).toBe(4);
    expect(forma?.bloquesDelimitadores).toBe(2);
  });

  it("CANDIDATA: el mismo cuerpo denso produce hipótesis `ausente` por el camino NUEVO (y no por el viejo)", async () => {
    const unit = await unitFrom(TS_WASM, TS_SETS_PROBE_COMPLETO, TS_DENSA_CON_BLOQUES, "typescript", "a.ts");
    const problem = longFunctionFinding("a.ts", 1, endLineOf(TS_DENSA_CON_BLOQUES), "slow", 60);
    const h = extractMethod.build(problem, null, fakeCtx(unit));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
    expect(h!.checks.some((c) => c.label.includes("grupos delimitados por la gramática"))).toBe(true);
    expect(h!.checks.some((c) => c.label.includes("bloques separados por líneas en blanco"))).toBe(false);
  });

  it("NO candidata: lista plana de sentencias (cero bloques de control) — ahí el camino viejo tiene razón en callarse", async () => {
    const src = `function plano(): number {
  const a = 1;
  const b = 2;
  const c = 3;
  const d = 4;
  const e = 5;
  return a + b + c + d + e;
}`;
    const unit = await unitFrom(TS_WASM, TS_SETS_PROBE_COMPLETO, src, "typescript", "a.ts");
    expect(extractMethod.build(longFunctionFinding("a.ts", 1, endLineOf(src), "plano", 60), null, fakeCtx(unit))).toBeNull();
  });

  it("NO candidata: un contenedor de `switch` DELIMITA grupo pero NO cuenta para el piso de bloques (sus brazos son una sola decisión)", async () => {
    const src = `function despacho(k: string): number {
  const base = 1;
  switch (k) {
    case "a": { return base; }
    case "b": { return base + 1; }
    default: { break; }
  }
  return 0;
}`;
    const unit = await unitFrom(TS_WASM, TS_SETS_PROBE_COMPLETO, src, "typescript", "a.ts");
    const problem = longFunctionFinding("a.ts", 1, endLineOf(src), "despacho", 60);
    const forma = analizarFormaPorFrontera(problem, fakeCtx(unit));
    expect(forma!.gruposReales.length).toBeGreaterThanOrEqual(3);
    expect(forma!.bloquesDelimitadores).toBe(0);
    expect(extractMethod.build(problem, null, fakeCtx(unit))).toBeNull();
  });

  it("NO se propone dos veces: si el camino VIEJO ya emite (>= 3 párrafos), la hipótesis que sale es la suya", async () => {
    const src = `function tres(items: number[]): number {
  let total = 0;

  for (const item of items) {
    total += item;
  }

  try {
    total = normalize(total);
  } catch (e) {
    total = 0;
  }

  return total;
}`;
    const unit = await unitFrom(TS_WASM, TS_SETS_PROBE_COMPLETO, src, "typescript", "a.ts");
    const h = extractMethod.build(longFunctionFinding("a.ts", 1, endLineOf(src), "tres", 60), null, fakeCtx(unit));
    expect(h).not.toBeNull();
    expect(h!.checks.some((c) => c.label.includes("bloques separados por líneas en blanco"))).toBe(true);
    expect(h!.checks.some((c) => c.label.includes("grupos delimitados por la gramática"))).toBe(false);
  });

  it("NO se propone dos veces: con un gemelo `complexity` sobre el rango exacto Y las dos condiciones estructurales de AH3, este camino se calla", async () => {
    const unit = await unitConMetricas(TS_WASM, TS_SETS_PROBE_COMPLETO, TS_DENSA_ANIDADA, "typescript", "a.ts", { cognitive: 21, maxNesting: 4 });
    const fin = endLineOf(TS_DENSA_ANIDADA);
    const gemelo = complexityFinding("a.ts", 1, fin, "slow", 21);
    const ctx = fakeCtx(unit, { neighborhood: { ...EMPTY_NEIGHBORHOOD, findingsInFile: () => [gemelo] } });
    expect(extractMethod.build(longFunctionFinding("a.ts", 1, fin, "slow", 60), null, ctx)).toBeNull();
  });

  it("… y el MISMO cuerpo, sin ningún gemelo `complexity` en el vecindario, SÍ es candidata (la compuerta mira al gemelo, no a la forma)", async () => {
    const unit = await unitConMetricas(TS_WASM, TS_SETS_PROBE_COMPLETO, TS_DENSA_ANIDADA, "typescript", "a.ts", { cognitive: 21, maxNesting: 4 });
    const fin = endLineOf(TS_DENSA_ANIDADA);
    expect(extractMethod.build(longFunctionFinding("a.ts", 1, fin, "slow", 60), null, fakeCtx(unit))).not.toBeNull();
  });

  it("SÍ candidata: hay gemelo `complexity` pero sus condiciones estructurales NO se cumplen (maxNesting < 3) ⇒ nadie más lo propone", async () => {
    const unit = await unitConMetricas(TS_WASM, TS_SETS_PROBE_COMPLETO, TS_DENSA_CON_BLOQUES, "typescript", "a.ts", { cognitive: 21, maxNesting: 1 });
    const fin = endLineOf(TS_DENSA_CON_BLOQUES);
    const gemelo = complexityFinding("a.ts", 1, fin, "slow", 21);
    const ctx = fakeCtx(unit, { neighborhood: { ...EMPTY_NEIGHBORHOOD, findingsInFile: () => [gemelo] } });
    expect(extractMethod.build(longFunctionFinding("a.ts", 1, fin, "slow", 60), null, ctx)).not.toBeNull();
  });

  it("un gemelo `complexity` en OTRO rango del mismo archivo no calla nada (la comparación es por rango exacto)", async () => {
    const unit = await unitConMetricas(TS_WASM, TS_SETS_PROBE_COMPLETO, TS_DENSA_CON_BLOQUES, "typescript", "a.ts", { cognitive: 21, maxNesting: 4 });
    const fin = endLineOf(TS_DENSA_CON_BLOQUES);
    const otro = complexityFinding("a.ts", 200, 260, "g", 21);
    const ctx = fakeCtx(unit, { neighborhood: { ...EMPTY_NEIGHBORHOOD, findingsInFile: () => [otro] } });
    expect(extractMethod.build(longFunctionFinding("a.ts", 1, fin, "slow", 60), null, ctx)).not.toBeNull();
  });

  it("los comentarios se pegan al grupo que SIGUE, no abren uno propio sin código", async () => {
    const src = `function conComentarios(items: number[]): number {
  let total = 0;
  // acumula
  for (const item of items) {
    total += item;
  }
  // normaliza
  try {
    total = normalize(total);
  } catch (e) {
    total = 0;
  }
  // listo
  return total;
}`;
    const unit = await unitFrom(TS_WASM, TS_SETS_PROBE_COMPLETO, src, "typescript", "a.ts");
    const forma = analizarFormaPorFrontera(longFunctionFinding("a.ts", 1, endLineOf(src), "conComentarios", 60), fakeCtx(unit));
    expect(forma!.gruposReales.length).toBe(4);
    expect(forma!.gruposReales.every((g) => g.codigo.length > 0)).toBe(true);
  });

  it("cruza lenguajes: la misma frontera de bloque en Python (sin llaves)", async () => {
    const src = `def recorrer(items, modo):
    total = 0
    for it in items:
        total += it
    try:
        total = normalizar(total)
    except Exception:
        total = 0
    return total`;
    const unit = await unitConMetricas(PYTHON_WASM, PYTHON_SETS_PROBE_COMPLETO, src, "python", "a.py", { cognitive: 4, maxNesting: 1 });
    const problem = longFunctionFinding("a.py", 1, endLineOf(src), "recorrer", 60);
    const forma = analizarFormaPorFrontera(problem, fakeCtx(unit));
    expect(forma!.parrafosDeLaReglaVieja).toBe(1);
    expect(forma!.bloquesDelimitadores).toBeGreaterThanOrEqual(2);
    const h = extractMethod.build(problem, null, fakeCtx(unit));
    expect(h).not.toBeNull();
    expect(h!.state).toBe("ausente");
  });
});
