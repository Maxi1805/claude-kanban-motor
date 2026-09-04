import { describe, expect, it } from "vitest";

import { detector } from "./flag-accumulator.js";
import { withGraph } from "../primitivas/u1-grafo-en-contexto.js";
import { fileUnitFrom, nodeSetsFor, parseRoot, runIntraFunction, testContext } from "../testing.js";
import type { RawFinding } from "../types.js";
import { symbolNodeId, type CodeGraph } from "../../graph/types.js";

/**
 * Fixtures — deliberadamente las MISMAS que `pattern-wrapping.test.ts` ya usa
 * para el smell viejo de Decorator (`DECORATOR_OPPORTUNITY`, verificadas ahí
 * como "reconoce la fixture de oportunidad" en 6 lenguajes): reusar una forma
 * ya probada evita introducir una fixture nueva que accidentalmente no
 * ejercite el AST real de cada gramática. `flag-accumulator` es la promoción
 * a detector propio de esa misma forma (CONTRATO-F10.md, tarea Decorator).
 */

const TS_PROBE = "class Probe { method(x: number) { return x; } }\nfunction probeFn(x: number) { return x; }\n";
const JS_PROBE = "class Probe { method(x) { return x; } }\nfunction probeFn(x) { return x; }\n";
const PYTHON_PROBE = "class Probe:\n    def method(self, x):\n        return x\n";
const RUBY_PROBE = "class Probe\n  def method(x)\n    x\n  end\nend\n";
const GO_PROBE = "package p\ntype T struct{}\nfunc (t *T) Method(x int) int {\n\treturn x\n}\nfunc ProbeFn(x int) int {\n\treturn x\n}\n";

// Forma FUNCIONAL (sin clase) — acumulador LOCAL, 3 capas independientes.
const TS_OPPORTUNITY = `
function computePrice(order: Order): number {
  let total = order.base;
  if (order.isPremium) {
    total = total * 1.2;
  }
  if (order.hasInsurance) {
    total = total + 10;
  }
  if (order.needsShipping) {
    total = total + 5;
  }
  return total;
}
function applyDiscount(price: number, hasCoupon: boolean): number {
  let total = price;
  if (hasCoupon) {
    total = total - 5;
  }
  return total;
}
`;

// Forma de CLASE — acumulador CAMPO PROPIO (`this.total`), 3 capas.
const JS_OWN_FIELD = `
class PriceCalculator {
  constructor(order) {
    this.total = order.base;
    this.order = order;
  }
  compute() {
    if (this.order.isPremium) {
      this.total = this.total * 1.2;
    }
    if (this.order.hasInsurance) {
      this.total = this.total + 10;
    }
    if (this.order.needsShipping) {
      this.total = this.total + 5;
    }
    return this.total;
  }
}
`;

const PYTHON_OPPORTUNITY = `
def compute_price(order):
    total = order.base
    if order.is_premium:
        total = total * 1.2
    if order.has_insurance:
        total = total + 10
    if order.needs_shipping:
        total = total + 5
    return total


def apply_discount(price, has_coupon):
    total = price
    if has_coupon:
        total = total - 5
    return total
`;

const RUBY_OWN_FIELD = `
class PriceCalculator
  def initialize(order)
    @total = order.base
    @order = order
  end

  def compute
    if @order.premium?
      @total = @total * 1.2
    end
    if @order.insurance?
      @total = @total + 10
    end
    if @order.shipping?
      @total = @total + 5
    end
    @total
  end
end
`;

const GO_OWN_FIELD = `
package pricing

type Order struct {
	IsPremium     bool
	HasInsurance  bool
	NeedsShipping bool
}

type Calculator struct {
	Total float64
}

func (c *Calculator) Compute(order Order) float64 {
	c.Total = 100
	if order.IsPremium {
		c.Total = c.Total * 1.2
	}
	if order.HasInsurance {
		c.Total = c.Total + 10
	}
	if order.NeedsShipping {
		c.Total = c.Total + 5
	}
	return c.Total
}
`;

// Control: 3 guardas, 2 comparten el mismo identificador final de condición —
// ramas de un único discriminante (Strategy/State), no capas ortogonales.
const TS_SAME_DISCRIMINANT = `
function computeRate(mode: boolean, extra: boolean): number {
  let total = 1;
  if (mode) {
    total = total * 2;
  }
  if (!mode) {
    total = total * 3;
  }
  if (extra) {
    total = total + 1;
  }
  return total;
}
`;

// Control: sólo 2 capas — por debajo del piso declarado (3).
const TS_TOO_FEW_LAYERS = `
function computeShort(a: boolean, b: boolean): number {
  let total = 0;
  if (a) {
    total = total + 1;
  }
  if (b) {
    total = total + 2;
  }
  return total;
}
`;

// Control: un `while` con `condition`+`body` tiene la MISMA forma de campos
// que un `if` sin `alternative` — verificado a mano (Ola 10, requisito 5)
// sobre un falso positivo real de `Files.java#simplifyPath` en guava, donde
// un lazo de normalización contaba como tercera "capa independiente". Acá:
// 2 `if` genuinos + 1 `while` que reasigna el MISMO target — debe seguir
// contando sólo 2 capas (el `while` no es una capa opcional, es un lazo),
// por debajo del piso ⇒ no dispara.
const TS_WHILE_IS_NOT_A_GUARD = `
function normalize(a: boolean, b: boolean): string {
  let result = "x";
  if (a) {
    result = result + "a";
  }
  if (b) {
    result = result + "b";
  }
  while (result.startsWith("/../")) {
    result = result.substring(3);
  }
  return result;
}
`;

// Ola de precisión posterior a la Ola D (caso real: `graph/edges/
// warmup.ts#warmUpLanguage`): 3 bloques `if` INDEPENDIENTES, cada uno con su
// PROPIO `for...of` que declara una variable de bucle con el MISMO nombre
// (`slot`) — nunca hay un acumulador compartido reasignado. `for_in_statement`
// (TS/JS) expone los mismos campos `left`/`right` que una asignación real
// (verificado por sonda) — sin el arreglo de tipo (`ASSIGNMENT_NODE_TYPE`),
// el detector leía `slot` como un único acumulador de 3 capas.
const TS_LOOP_VAR_IS_NOT_AN_ACCUMULATOR = `
function warmUpLanguage(language: string): void {
  if (a) {
    for (const slot of extractorA.slots) carriersBySlot.set(slot, x);
  }
  if (b) {
    for (const slot of extractorB.slots) carriersBySlot.set(slot, x);
  }
  if (c) {
    for (const slot of extractorC.slots) carriersBySlot.set(slot, x);
  }
}
`;

// Ola de precisión posterior a la Ola D (caso real: `graph/edges/
// imports.ts#factsFor`): dispatch por `language` con `if`/`return` en cada
// rama — NINGÚN acumulador real en ninguna rama. `const target = …` es una
// DECLARACIÓN (campos `name`/`value`, nunca `left`/`right`), pero el
// `binary_expression` de la condición del `return` ternario que la sigue
// (`target && target.text.length > 0`) SÍ expone `left`/`right` — sin el
// arreglo de tipo, el detector leía "target" como reasignado una vez por
// rama del dispatch, 3 capas "independientes" que en realidad son 3
// declaraciones locales sin relación entre sí.
const TS_DISPATCH_LOCAL_IS_NOT_AN_ACCUMULATOR = `
function factsFor(language: string, stmt: unknown): unknown[] {
  if (language === "typescript") {
    const target = ecmaTarget(stmt);
    return target && target.text.length > 0 ? [makeFact(stmt, target)] : [];
  }
  if (language === "python") {
    const target = pythonTarget(stmt);
    return target && target.text.length > 0 ? [makeFact(stmt, target)] : [];
  }
  if (language === "go") {
    const target = goTarget(stmt);
    return target && target.text.length > 0 ? [makeFact(stmt, target)] : [];
  }
  return [];
}
`;

// Ola de precisión posterior a la Ola D (caso real: `dashboardable.rb#
// build_search_result`): `matched_in << 'x' if guard` NO es una asignación
// — Ruby parsea `<<` (Array#<<, un método, no un operador de asignación)
// como nodo "binary", que TAMBIÉN expone campos `left`/`right` (mismo
// vocabulario genérico de la gramática que ya confundía comparaciones y
// lazos). `matched_in` nunca se REASIGNA en esta función: sólo se MUTA vía
// `<<`, así que no hay ningún acumulador que Decorator pueda envolver.
const RUBY_APPEND_IS_NOT_A_REASSIGNMENT = `
def build_search_result(response, query)
  matched_in = []
  matched_in << 'email' if response.email.downcase.include?(query)
  matched_in << 'user_name' if name_matches?(response, query)
  matched_in << 'answer_value' if answer_matches?(response, query)
  { matched_in: matched_in.uniq }
end
`;

const CSHARP_PROBE = "class Probe { int Method(int x) { return x; } }\n";

/**
 * OLA R (R5) — el MISMO fixture corrido con tres estados del grafo, para
 * probar la regla 2 de la ola sin depender de que exista un extractor real
 * de tipos en esta corrida: el sitio `Calc.compute.total` sostiene un
 * PRIMITIVO, sostiene una CLASE del repo, o no hay grafo en absoluto.
 *
 * El acumulador es aritmético a propósito: es la MISMA forma del control
 * positivo clásico de Kerievsky que ya vive más arriba en este archivo, así
 * que lo único que cambia entre los tres casos es lo que el grafo dice del
 * TIPO ESCRITO — nunca la forma del AST.
 */
const CARRIER_SOURCE = `
class Calc {
  compute(order) {
    let total = order.base;
    if (order.isPremium) {
      total = total * 1.2;
    }
    if (order.hasInsurance) {
      total = total + 10;
    }
    if (order.needsShipping) {
      total = total + 5;
    }
    return total;
  }
}
`;

const CARRIER_FILE = "fixture.typescript";
const CARRIER_ID = "carrier:fixture.typescript#Calc.compute.total@0";

async function runWithCarrier(form: "primitive" | "nominal" | null): Promise<readonly RawFinding[]> {
  const sets = await nodeSetsFor("tree-sitter-typescript.wasm", TS_PROBE);
  const root = await parseRoot("tree-sitter-typescript.wasm", CARRIER_SOURCE);
  const file = fileUnitFrom(root, sets, "typescript");
  const graph: CodeGraph | null =
    form === null
      ? null
      : {
          nodes: [
            {
              id: CARRIER_ID,
              kind: "carrier",
              file: CARRIER_FILE,
              symbolPath: ["Calc", "compute", "total"],
              carrierForm: "local",
              declaredTypeForm: form,
            },
            { id: symbolNodeId(CARRIER_FILE, ["Money"]), kind: "symbol", file: CARRIER_FILE, symbolPath: ["Money"], family: "class-like" },
          ],
          edges:
            form === "nominal"
              ? [
                  {
                    from: CARRIER_ID,
                    to: symbolNodeId(CARRIER_FILE, ["Money"]),
                    kind: "declares-type" as const,
                    provenance: "declared" as const,
                    weight: 1,
                  },
                ]
              : [],
          resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] },
        };
  const ctx = withGraph(testContext(detector, "typescript"), graph);
  const findings: RawFinding[] = [];
  for (const fn of file.functions) findings.push(...detector.run(fn, ctx));
  return findings;
}

describe("flag-accumulator", () => {
  it("typescript: función sin clase, acumulador local con 3 capas independientes — oportunidad, variable local", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-typescript.wasm",
      probe: TS_PROBE,
      language: "typescript",
      source: TS_OPPORTUNITY,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(3);
    expect(findings[0]!.locations[0]!.symbol).toBe("computePrice");
    expect(findings[0]!.locations[0]!.role).toMatch(/variable local/);
    expect(findings[0]!.locations).toHaveLength(3);
  });

  it("typescript: el control negativo del mismo archivo (applyDiscount, 1 sola capa) no dispara", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-typescript.wasm",
      probe: TS_PROBE,
      language: "typescript",
      source: TS_OPPORTUNITY,
    });
    expect(findings.some((f) => f.locations[0]!.symbol === "applyDiscount")).toBe(false);
  });

  it("typescript: 3 guardas pero 2 comparten el mismo identificador final de condición (mode/!mode) ⇒ no dispara — ramas de un discriminante único, no capas ortogonales", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-typescript.wasm",
      probe: TS_PROBE,
      language: "typescript",
      source: TS_SAME_DISCRIMINANT,
    });
    expect(findings).toHaveLength(0);
  });

  it("typescript: sólo 2 capas (por debajo del piso declarado, 3) ⇒ no dispara", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-typescript.wasm",
      probe: TS_PROBE,
      language: "typescript",
      source: TS_TOO_FEW_LAYERS,
    });
    expect(findings).toHaveLength(0);
  });

  it("javascript: clase con acumulador CAMPO PROPIO (this.total), 3 capas — oportunidad, campo propio", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: JS_OWN_FIELD,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("compute");
    expect(findings[0]!.locations[0]!.role).toMatch(/campo propio/);
  });

  it("python: función sin clase, acumulador local con 3 capas — oportunidad, variable local", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-python.wasm",
      probe: PYTHON_PROBE,
      language: "python",
      source: PYTHON_OPPORTUNITY,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("compute_price");
    expect(findings[0]!.locations[0]!.role).toMatch(/variable local/);
  });

  it("ruby: acumulador de variable de instancia (@total) sin clase que componga — oportunidad, campo propio", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      language: "ruby",
      source: RUBY_OWN_FIELD,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("compute");
    expect(findings[0]!.locations[0]!.role).toMatch(/campo propio/);
  });

  it("go: acumulador de campo del struct receptor (c.Total) — oportunidad, campo propio", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-go.wasm",
      probe: GO_PROBE,
      language: "go",
      source: GO_OWN_FIELD,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("Compute");
    expect(findings[0]!.locations[0]!.role).toMatch(/campo propio/);
  });

  it("typescript: un `while` que reasigna el mismo target NO cuenta como capa opcional (misma forma de campos condition+body que un `if` sin alternative, verificado a mano contra un falso positivo real de guava) ⇒ sólo 2 capas reales, no dispara", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-typescript.wasm",
      probe: TS_PROBE,
      language: "typescript",
      source: TS_WHILE_IS_NOT_A_GUARD,
    });
    expect(findings).toHaveLength(0);
  });

  it("typescript (caso real warmUpLanguage): la variable de un `for...of` ANIDADO en 3 guardas independientes NO es un acumulador compartido (for_in_statement comparte campos left/right con una asignación real) ⇒ no dispara", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-typescript.wasm",
      probe: TS_PROBE,
      language: "typescript",
      source: TS_LOOP_VAR_IS_NOT_AN_ACCUMULATOR,
    });
    expect(findings).toHaveLength(0);
  });

  it("typescript (caso real factsFor): un dispatch por `language` con una declaración local + comparación en cada rama NO es un acumulador (binary_expression de la comparación comparte campos left/right con una asignación real) ⇒ no dispara", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-typescript.wasm",
      probe: TS_PROBE,
      language: "typescript",
      source: TS_DISPATCH_LOCAL_IS_NOT_AN_ACCUMULATOR,
    });
    expect(findings).toHaveLength(0);
  });

  it("ruby (caso real build_search_result): `matched_in << 'x' if guard` (Array#<<, nodo \"binary\") NO es una reasignación — sin acumulador que envolver ⇒ no dispara", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      language: "ruby",
      source: RUBY_APPEND_IS_NOT_A_REASSIGNMENT,
    });
    expect(findings).toHaveLength(0);
  });

  it(
    "ARREGLO (frente de precisión, medido en C# real — Newtonsoft.Json ConvertUtils.GetTypeCode): " +
      "3 ramas MUTUAMENTE EXCLUYENTES que reasignan `isEnum` y TERMINAN con `return` cada una " +
      "⇒ no dispara — son alternativas de un árbol de decisión, nunca pueden coexistir en la misma llamada, " +
      "así que no son capas de embellecimiento acumulándose",
    async () => {
      const source = `
function getTypeCode(t) {
  if (conditionA) {
    isEnum = false;
    return typeCode;
  }
  if (conditionB) {
    isEnum = true;
    return underlying;
  }
  if (conditionC) {
    isEnum = true;
    return nullableUnderlying;
  }
  return fallback;
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-typescript.wasm",
        probe: TS_PROBE,
        language: "typescript",
        source,
      });
      expect(findings).toHaveLength(0);
    },
  );

  it(
    "control positivo: las MISMAS 3 guardas, pero SIN `return` (ninguna termina) ⇒ SÍ dispara — " +
      "ahora sí pueden coexistir en la misma llamada, es la forma real de capas acumulándose",
    async () => {
      const source = `
function getTypeCode(t) {
  if (conditionA) {
    isEnum = false;
  }
  if (conditionB) {
    isEnum = true;
  }
  if (conditionC) {
    isEnum = true;
  }
  return isEnum;
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-typescript.wasm",
        probe: TS_PROBE,
        language: "typescript",
        source,
      });
      expect(findings).toHaveLength(1);
    },
  );

  it(
    "ARREGLO RAÍZ (Ola O, medido real — eslint token-store/cursors.js#createCursor): " +
      "3 guardas que envuelven el valor VIEJO del target en un wrapper nuevo (`cursor = new FilterCursor(cursor, filter)`, " +
      "`new SkipCursor(cursor, skip)`, `new LimitCursor(cursor, count)`) ⇒ no dispara — es el Decorator YA APLICADO, " +
      "el detector no puede acusar la solución que él mismo recomendaría",
    async () => {
      const source = `
function createCursor(filter, skip, count) {
  let cursor = createBaseCursor();
  if (filter) {
    cursor = new FilterCursor(cursor, filter);
  }
  if (skip >= 1) {
    cursor = new SkipCursor(cursor, skip);
  }
  if (count >= 0) {
    cursor = new LimitCursor(cursor, count);
  }
  return cursor;
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-typescript.wasm",
        probe: TS_PROBE,
        language: "typescript",
        source,
      });
      expect(findings).toHaveLength(0);
    },
  );

  it(
    "control positivo: las MISMAS 3 guardas, pero la construcción NO envuelve el valor viejo del target " +
      "(cada capa construye desde CERO, sin recibir `cursor` como argumento) ⇒ SÍ dispara — no hay wrapping, " +
      "así que no hay Decorator ya aplicado que el detector deba respetar",
    async () => {
      const source = `
function createCursor(filter, skip, count) {
  let cursor = createBaseCursor();
  if (filter) {
    cursor = new FilterCursor(filter);
  }
  if (skip >= 1) {
    cursor = new SkipCursor(skip);
  }
  if (count >= 0) {
    cursor = new LimitCursor(count);
  }
  return cursor;
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-typescript.wasm",
        probe: TS_PROBE,
        language: "typescript",
        source,
      });
      expect(findings).toHaveLength(1);
    },
  );

  it(
    "control positivo: acumulador aritmético genuino (Kerievsky) sigue disparando -- el arreglo de wrapping " +
      "no toca la forma clásica del olor, sólo la forma en la que se confunde con Decorator ya aplicado",
    async () => {
      const source = `
function total(order) {
  let total = order.base;
  if (order.isPremium) {
    total = total * 0.9;
  }
  if (order.hasInsurance) {
    total = total + 5;
  }
  if (order.isExpress) {
    total = total + 10;
  }
  return total;
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-typescript.wasm",
        probe: TS_PROBE,
        language: "typescript",
        source,
      });
      expect(findings).toHaveLength(1);
    },
  );

  it(
    "REDEFINICIÓN (Ola P, frente P6, medido real — cobra completions.go): ≥3 guardas que acumulan un LITERAL DE " +
      "CADENA en cada una (`directives = append(directives, \"...\")`) ⇒ no dispara — acumular TEXTO no es " +
      "envolver un objeto con comportamiento, es la misma forma de AST que el olor real pero sobre datos",
    async () => {
      const source = `
function directivesString(a, b, c) {
  let directives = [];
  if (a) {
    directives = append(directives, "ShellCompDirectiveError");
  }
  if (b) {
    directives = append(directives, "ShellCompDirectiveNoSpace");
  }
  if (c) {
    directives = append(directives, "ShellCompDirectiveNoFileComp");
  }
  return directives;
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-typescript.wasm",
        probe: TS_PROBE,
        language: "typescript",
        source,
      });
      expect(findings).toHaveLength(0);
    },
  );

  it(
    "REDEFINICIÓN (Ola P, frente P6, medido real — jekyll servlet.rb#livereload_args): ≥3 guardas que concatenan " +
      "un literal de cadena vía `+=` (`src += \"&mindelay=...\"`) ⇒ no dispara — mismo caso, forma de concatenación " +
      "en vez de llamada",
    async () => {
      const source = `
function buildQuery(a, b, c) {
  let src = "";
  if (a) {
    src = src + "&mindelay=1";
  }
  if (b) {
    src = src + "&maxdelay=2";
  }
  if (c) {
    src = src + "&port=3";
  }
  return src;
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-typescript.wasm",
        probe: TS_PROBE,
        language: "typescript",
        source,
      });
      expect(findings).toHaveLength(0);
    },
  );

  it(
    "control positivo: 3 guardas que reasignan con LITERAL NUMÉRICO (no de cadena) en el lado derecho ⇒ SÍ dispara " +
      "— el filtro es específico de literales de CADENA, no de cualquier literal (ver también el control positivo " +
      "aritmético ya existente más abajo, que reutiliza esta misma distinción)",
    async () => {
      const source = `
function score(a, b, c) {
  let points = 0;
  if (a) {
    points = points + 1;
  }
  if (b) {
    points = points + 2;
  }
  if (c) {
    points = points + 3;
  }
  return points;
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-typescript.wasm",
        probe: TS_PROBE,
        language: "typescript",
        source,
      });
      expect(findings).toHaveLength(1);
    },
  );

  /* ══════════════════════════════════════════════════════════════════════
   * OLA R (R5) — el arreglo de ALCANCE de `rebuildsFromOldValue` y la
   * pregunta "¿el acumulador es un PRIMITIVO?".
   * ══════════════════════════════════════════════════════════════════════ */

  it(
    "ARREGLO DE ALCANCE (Ola R, R5, medido real — newtonsoft-json ExpressionReflectionDelegateFactory.cs" +
      "#BuildMethodCall): en C# la reasignación `x = F(x, t)` es un `invocation_expression`, tipo de nodo que NO " +
      "contiene la subcadena 'call' — el `/call/i` de la Ola O no lo veía y las 3 guardas contaban como capas",
    async () => {
      const source = `
class Factory {
    private object BuildMethodCall(object method, object type) {
        object callExpression = null;
        if (isConstructor) {
            callExpression = Expression.New(method);
        }
        if (isValue) {
            callExpression = EnsureCastExpression(callExpression, type);
        }
        if (isBlock) {
            callExpression = Expression.Block(callExpression, nullConstant);
        }
        if (isRef) {
            callExpression = EnsureCastExpression(callExpression, other);
        }
        return callExpression;
    }
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-c_sharp.wasm",
        probe: CSHARP_PROBE,
        language: "csharp",
        source,
      });
      expect(findings).toHaveLength(0);
    },
  );

  it(
    "control positivo del mismo arreglo, en C#: las MISMAS guardas pero SIN pasar el valor viejo del acumulador " +
      "como argumento ⇒ SÍ dispara — lo que descarta es 'el valor viejo vuelve a entrar', no 'hay una llamada'",
    async () => {
      const source = `
class Factory {
    private object BuildMethodCall(object method, object type) {
        object callExpression = null;
        if (isConstructor) {
            callExpression = Expression.New(method);
        }
        if (isValue) {
            callExpression = EnsureCastExpression(method, type);
        }
        if (isBlock) {
            callExpression = Expression.Block(method, nullConstant);
        }
        return callExpression;
    }
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-c_sharp.wasm",
        probe: CSHARP_PROBE,
        language: "csharp",
        source,
      });
      expect(findings).toHaveLength(1);
    },
  );

  it(
    "ARREGLO DE ALCANCE (Ola R, R5, medido real — hugo markup/goldmark/convert.go, common/loggers/logger.go, " +
      "publisher/publisher.go): `x = append(x, v)` es LA forma de acumular una lista en Go, y el callee en " +
      "minúscula la dejaba fuera del chequeo de la Ola O",
    async () => {
      const source = `
package p

func newMarkdown(cfg Config) []Extension {
	extensions := baseExtensions()
	if cfg.Table {
		extensions = append(extensions, tableExtension)
	}
	if cfg.Strikethrough {
		extensions = append(extensions, strikeExtension)
	}
	if cfg.Linkify {
		extensions = append(extensions, linkifyExtension)
	}
	return extensions
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-go.wasm",
        probe: GO_PROBE,
        language: "go",
        source,
      });
      expect(findings).toHaveLength(0);
    },
  );

  it(
    "ARREGLO DE ALCANCE (Ola R, R5, medido real — lodash.js#wrapper y nest fastify-adapter.ts#sanitizeUrl): " +
      "`x = composeArgs(x, …)` / `url = this.trimLastSlash(url)` — callee en minúscula o con receptor `this`, " +
      "que la inicial-mayúscula de la Ola O tampoco veía",
    async () => {
      const source = `
function sanitizeUrl(url) {
  if (ignoreDuplicateSlashes) {
    url = removeDuplicateSlashes(url);
  }
  if (ignoreTrailingSlash) {
    url = this.trimLastSlash(url);
  }
  if (caseSensitive) {
    url = composeArgs(url, opts);
  }
  return url;
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-typescript.wasm",
        probe: TS_PROBE,
        language: "typescript",
        source,
      });
      expect(findings).toHaveLength(0);
    },
  );

  it(
    "BUG DE TOKENIZACIÓN (Ola R, R5, medido real — newtonsoft-json ConvertUtils.cs#PackDouble): 8 guardas que " +
      "comparan LA MISMA variable contra máscaras hexadecimales distintas son ramas de un discriminante único, " +
      "pero `0xFF00…` matcheaba como identificador `xFF00…` y cada una parecía una condición independiente",
    async () => {
      const source = `
function packDouble(v) {
  let val = v;
  if ((val & 0xFFFFFFFF00000000) == 0) {
    val = val * 2;
  }
  if ((val & 0xFFFF000000000000) == 0) {
    val = val * 3;
  }
  if ((val & 0xFF00000000000000) == 0) {
    val = val * 4;
  }
  return val;
}
`;
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-typescript.wasm",
        probe: TS_PROBE,
        language: "typescript",
        source,
      });
      expect(findings).toHaveLength(0);
    },
  );

  it(
    '"¿el acumulador es un PRIMITIVO?" (Ola R, R5): con `declares-type` diciendo que el sitio sostiene un ' +
      "primitivo, no hay objeto que envolver y el remedio (Move Embellishment to Decorator) es INAPLICABLE ⇒ no dispara",
    async () => {
      const findings = await runWithCarrier("primitive");
      expect(findings).toHaveLength(0);
    },
  );

  it(
    "REGLA 2 DE LA OLA — `no-fact` NO es `primitive`: el MISMO fixture, con el grafo diciendo que el sitio " +
      "sostiene una CLASE del repo, sigue disparando; y sin grafo en absoluto también (que es el caso de ruby y " +
      "javascript, donde no hay dónde escribir un tipo)",
    async () => {
      expect(await runWithCarrier("nominal")).toHaveLength(1);
      expect(await runWithCarrier(null)).toHaveLength(1);
    },
  );

  it("needs: [] — el detector es puro AST para decidir la FORMA; el grafo sólo aporta el tipo escrito, y su ausencia no cambia nada", () => {
    expect(detector.needs).toEqual([]);
    expect(detector.needsGraph).toBe(true);
  });

  it("el piso declarado es 3 (Kerievsky cap. 8: ≥3 capas opcionales) — mismo número que hypotheses/decorator.ts#REQUIRED_ACCUMULATOR", () => {
    const threshold = testContext(detector, "typescript").threshold("layers");
    expect(threshold.value).toBe(3);
  });

  it("la severidad escala con la cantidad de capas y el advice primario es el refactor mecánico (Kerievsky), sin sugerir el patrón directamente — eso lo decide la hipótesis, no el detector", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-typescript.wasm",
      probe: TS_PROBE,
      language: "typescript",
      source: TS_OPPORTUNITY,
    });
    expect(findings[0]!.severity).toBeGreaterThan(0);
    expect(findings[0]!.advice.primary.name).toBe("Move Embellishment to Decorator");
    expect(findings[0]!.advice.pattern).toBeUndefined();
  });
});
