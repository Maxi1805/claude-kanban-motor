import { describe, expect, it } from "vitest";

import { detector } from "./type-switch.js";
import { runIntraFunction } from "../testing.js";

/* ────────────────────────────────────────────────────────────────────────
 * Sondas — cada una ejercita función + switch, lo mínimo que
 * `deriveNodeSets` necesita para clasificar `functionNodes` y
 * `switchContainerNodes` (ver `testing.ts`: la sonda es de este archivo, no
 * la de producción, así que tiene que ejercitar TODO lo que el detector
 * mira).
 * ──────────────────────────────────────────────────────────────────────── */
const JS_PROBE = `
function probe(x) {
  switch (x) {
    case 1: return 1;
    default: return 0;
  }
}
`;

const TS_PROBE = `${JS_PROBE}
function typed(x: number): number { return x; }
`;

const PYTHON_PROBE = `
def probe(x):
    match x:
        case 1:
            return 1
        case _:
            return 0
`;

const RUBY_PROBE = `
def probe(x)
  case x
  when 1 then 1
  else 0
  end
end
`;

const GO_PROBE = `
package p

func probe(x int) int {
	switch x {
	case 1:
		return 1
	}
	return 0
}
`;

const JAVA_PROBE = `
class P {
  int probe(int x) {
    switch (x) {
      case 1: return 1;
      default: return 0;
    }
  }
}
`;

const CSHARP_PROBE = `
class P {
  int Probe(int x) {
    switch (x) {
      case 1: return 1;
      default: return 0;
    }
  }
}
`;

const GRAMMARS = {
  javascript: { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE },
  typescript: { wasm: "tree-sitter-typescript.wasm", probe: TS_PROBE },
  python: { wasm: "tree-sitter-python.wasm", probe: PYTHON_PROBE },
  ruby: { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE },
  go: { wasm: "tree-sitter-go.wasm", probe: GO_PROBE },
  java: { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE },
  csharp: { wasm: "tree-sitter-c_sharp.wasm", probe: CSHARP_PROBE },
} as const;

type Lang = keyof typeof GRAMMARS;

function run(language: Lang, source: string) {
  const g = GRAMMARS[language];
  return runIntraFunction(detector, { wasm: g.wasm, probe: g.probe, source, language });
}

describe("type-switch — contrato del detector", () => {
  it("declara id, kind, scope y umbral de presencia", () => {
    expect(detector.id).toBe("type-switch");
    expect(detector.kind).toBe("type-switch");
    expect(detector.scope).toBe("intra-function");
    expect(detector.thresholds.ramasQueDecidenPorTipo.kind).toBe("presencia");
  });
});

/* ── LA FORMA POSITIVA, en las 7 gramáticas ─────────────────────────────── */

describe("type-switch — escalera de pruebas de tipo sobre el MISMO sujeto", () => {
  it("javascript: dos `instanceof` encadenados sobre `x`", async () => {
    const findings = await run(
      "javascript",
      `
function area(x) {
  if (x instanceof Circle) { return x.r * x.r; }
  else if (x instanceof Square) { return x.s * x.s; }
  return 0;
}
`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.variant).toBe("escalera");
    expect(findings[0]!.trigger[0].value).toBe(2);
    expect(findings[0]!.title).toContain("`x`");
  });

  it("typescript: `typeof` encadenado sobre el mismo sujeto", async () => {
    const findings = await run(
      "typescript",
      `
function coerce(v: unknown): string {
  if (typeof v === "string") { return v; }
  else if (typeof v === "number") { return String(v); }
  return "";
}
`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0].value).toBe(2);
  });

  it("python: dos `isinstance` sobre el mismo sujeto", async () => {
    const findings = await run(
      "python",
      `
def render(node):
    if isinstance(node, Text):
        return node.value
    elif isinstance(node, Group):
        return "".join(node.parts)
    return ""
`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.variant).toBe("escalera");
  });

  it("python: `type(x) is C` encadenado también cuenta", async () => {
    const findings = await run(
      "python",
      `
def render(node):
    if type(node) is Text:
        return 1
    elif type(node) is Group:
        return 2
    return 0
`,
    );
    expect(findings).toHaveLength(1);
  });

  it("ruby: `is_a?`/`kind_of?` sobre el mismo receptor", async () => {
    const findings = await run(
      "ruby",
      `
def render(node)
  if node.is_a?(Text)
    node.value
  elsif node.kind_of?(Group)
    node.parts.join
  end
end
`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.variant).toBe("escalera");
  });

  it("java: dos `instanceof` encadenados", async () => {
    const findings = await run(
      "java",
      `
class R {
  int area(Object x) {
    if (x instanceof Circle) { return 1; }
    else if (x instanceof Square) { return 2; }
    return 0;
  }
}
`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0].value).toBe(2);
  });

  it("csharp: dos `is` encadenados (con y sin binding)", async () => {
    const findings = await run(
      "csharp",
      `
class R {
  int Area(object x) {
    if (x is Circle) { return 1; }
    else if (x is Square s) { return 2; }
    return 0;
  }
}
`,
    );
    expect(findings).toHaveLength(1);
  });

  it("go: dos aserciones de tipo encadenadas sobre el mismo sujeto", async () => {
    const findings = await run(
      "go",
      `
package p

func area(x interface{}) int {
	if _, ok := x.(*Circle); ok {
		return 1
	} else if _, ok := x.(*Square); ok {
		return 2
	}
	return 0
}
`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.variant).toBe("escalera");
  });
});

describe("type-switch — switch cuyos brazos nombran TIPOS", () => {
  it("go: `switch x.(type)` con dos brazos de tipo", async () => {
    const findings = await run(
      "go",
      `
package p

func area(x interface{}) int {
	switch v := x.(type) {
	case *Circle:
		return v.R
	case *Square:
		return v.S
	}
	return 0
}
`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.variant).toBe("switch");
    expect(findings[0]!.trigger[0].value).toBe(2);
    expect(findings[0]!.detail).toContain("Circle");
  });

  it("csharp: `case Circle c:` con dos brazos tipados", async () => {
    const findings = await run(
      "csharp",
      `
class R {
  int Area(object x) {
    switch (x) {
      case Circle c: return c.R;
      case Square s: return s.S;
      default: return 0;
    }
  }
}
`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.variant).toBe("switch");
    expect(findings[0]!.trigger[0].value).toBe(2);
  });

  it("ruby: `case x when Circle` con constantes CamelCase", async () => {
    const findings = await run(
      "ruby",
      `
def area(x)
  case x
  when Circle then x.r
  when Square then x.s
  end
end
`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.variant).toBe("switch");
  });
});

/* ── LO QUE NO DEBE DISPARAR ────────────────────────────────────────────── */

describe("type-switch — lo que NO es despacho por tipo", () => {
  it("una sola prueba de tipo es una guarda, no un despacho", async () => {
    const findings = await run(
      "javascript",
      `
function area(x) {
  if (x instanceof Circle) { return x.r; }
  return 0;
}
`,
    );
    expect(findings).toEqual([]);
  });

  it("dos pruebas de tipo sobre sujetos DISTINTOS no son un despacho", async () => {
    const findings = await run(
      "javascript",
      `
function combine(a, b) {
  if (a instanceof Circle) { return 1; }
  else if (b instanceof Square) { return 2; }
  return 0;
}
`,
    );
    expect(findings).toEqual([]);
  });

  it("una escalera larga que compara VALORES no dispara (eso es conditional-chain)", async () => {
    const findings = await run(
      "javascript",
      `
function grade(n) {
  if (n > 90) { return "a"; }
  else if (n > 80) { return "b"; }
  else if (n > 70) { return "c"; }
  else if (n > 60) { return "d"; }
  return "f";
}
`,
    );
    expect(findings).toEqual([]);
  });

  it("un switch sobre valores (números/cadenas) no dispara", async () => {
    const findings = await run(
      "csharp",
      `
class R {
  int Area(int x) {
    switch (x) {
      case 1: return 1;
      case 2: return 2;
      default: return 0;
    }
  }
}
`,
    );
    expect(findings).toEqual([]);
  });

  it("`x is null` pregunta por AUSENCIA, no por tipo: no cuenta como rama", async () => {
    const findings = await run(
      "csharp",
      `
class R {
  int Area(object x) {
    if (x is null) { return 0; }
    else if (x is Circle) { return 1; }
    return 2;
  }
}
`,
    );
    expect(findings).toEqual([]);
  });

  it("ruby: `when CONSTANTE_DE_VALOR` (SCREAMING_CASE) no se toma como tipo — límite declarado", async () => {
    const findings = await run(
      "ruby",
      `
def size(x)
  case x
  when MAX_SIZE then 1
  when MIN_SIZE then 2
  end
end
`,
    );
    expect(findings).toEqual([]);
  });
});

/* ── EVIDENCIA Y UBICACIÓN ──────────────────────────────────────────────── */

describe("type-switch — evidencia", () => {
  it("la ubicación apunta a la escalera, no a la función entera, y trae el rol", async () => {
    const findings = await run(
      "java",
      `
class R {
  int area(Object x) {
    int seed = 0;
    if (x instanceof Circle) { return 1; }
    else if (x instanceof Square) { return 2; }
    return seed;
  }
}
`,
    );
    expect(findings).toHaveLength(1);
    const loc = findings[0]!.locations[0];
    expect(loc.startLine).toBe(5);
    expect(loc.symbol).toBe("area");
    expect(loc.role).toContain("escalera");
  });

  it("el consejo primario es Replace Conditional with Polymorphism y el patrón sugerido es Strategy", async () => {
    const findings = await run(
      "javascript",
      `
function area(x) {
  if (x instanceof Circle) { return 1; }
  else if (x instanceof Square) { return 2; }
  return 0;
}
`,
    );
    expect(findings[0]!.advice.primary.name).toBe("Replace Conditional with Polymorphism");
    expect(findings[0]!.advice.pattern?.name).toBe("Strategy");
  });

  it("tres ramas producen severidad mayor que dos", async () => {
    const dos = await run(
      "javascript",
      `
function f(x) {
  if (x instanceof A) { return 1; } else if (x instanceof B) { return 2; }
  return 0;
}
`,
    );
    const tres = await run(
      "javascript",
      `
function f(x) {
  if (x instanceof A) { return 1; } else if (x instanceof B) { return 2; } else if (x instanceof C) { return 3; }
  return 0;
}
`,
    );
    expect(tres[0]!.severity).toBeGreaterThan(dos[0]!.severity);
  });
  it("dos despachos en la MISMA función reciben ordinal distinto (ids que no colapsan)", async () => {
    const findings = await run(
      "javascript",
      `
function render(a, b) {
  if (a instanceof Circle) { return 1; } else if (a instanceof Square) { return 2; }
  if (b instanceof Circle) { return 3; } else if (b instanceof Square) { return 4; }
  return 0;
}
`,
    );
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.locations[0].anchor?.ordinal)).toEqual([0, 1]);
  });

  it("un solo despacho no lleva ordinal, y el ancla usa el symbolPath completo", async () => {
    const findings = await run(
      "java",
      `
class R {
  int area(Object x) {
    if (x instanceof Circle) { return 1; } else if (x instanceof Square) { return 2; }
    return 0;
  }
}
`,
    );
    expect(findings[0]!.locations[0].anchor?.ordinal).toBeUndefined();
    expect(findings[0]!.locations[0].anchor?.symbolPath).toEqual(["R", "area"]);
  });
  it("go: un `switch` sobre CONSTANTES cuyo cuerpo declara un tipo NO dispara (bug medido en cobra)", async () => {
    const findings = await run(
      "go",
      `
package p

func write(key string) int {
	switch key {
	case BashCompFilenameExt:
		var ext string
		_ = ext
		return 1
	case BashCompCustom:
		var other string
		_ = other
		return 2
	}
	return 0
}
`,
    );
    expect(findings).toEqual([]);
  });
  it("un despacho dentro de una función ANIDADA se reporta UNA sola vez (no dos)", async () => {
    const findings = await run(
      "javascript",
      `
function outer(list) {
  function inner(x) {
    if (x instanceof Circle) { return 1; }
    else if (x instanceof Square) { return 2; }
    return 0;
  }
  return list.map(inner);
}
`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0].symbol).toBe("inner");
  });
  it("dos peldaños que prueban el MISMO tipo con otra condición al lado NO son despacho (bug medido en sqlalchemy)", async () => {
    const findings = await run(
      "python",
      `
def dump(attributes):
    for key in attributes:
        if isinstance(key, tuple) and key[0] == "loader":
            print(1)
        elif isinstance(key, tuple) and key[0] == "path":
            print(2)
`,
    );
    expect(findings).toEqual([]);
  });

  it("una escalera de CINCO peldaños se reporta UNA sola vez (deduplicación por EXTENSIÓN, no por identidad de nodo)", async () => {
    // BUG MEDIDO Y CERRADO (Ola X, integrador, encontrado por el guardián de
    // nivel 1): `consumed` era un `Set<AstNode>` y los nodos de tree-sitter NO
    // tienen identidad de referencia estable, así que la MISMA escalera se
    // reportaba una vez por peldaño (5 peldaños ⇒ 4 hallazgos, con 5/4/3/2
    // ramas). Los tests existentes usaban SIEMPRE escaleras de 2 peldaños,
    // donde el defecto no se manifiesta: el peldaño suelto queda por debajo
    // del umbral de presencia y se descarta solo.
    const findings = await run(
      "java",
      `
class P {
  void visit(Object type) {
    if (type instanceof A) { doA(); }
    else if (type instanceof B) { doB(); }
    else if (type instanceof C) { doC(); }
    else if (type instanceof D) { doD(); }
    else if (type instanceof E) { doE(); }
    else { throw new AssertionError(); }
  }
}
`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0].value).toBe(5);
  });

  it("go: una escalera de TRES aserciones de tipo se reporta UNA sola vez", async () => {
    const findings = await run(
      "go",
      `
package p

func walk(fs Fs) bool {
	if afs, ok := fs.(FilesystemUnwrapper); ok {
		_ = afs
		return true
	} else if bfs, ok := fs.(FilesystemsUnwrapper); ok {
		_ = bfs
		return true
	} else if cfs, ok := fs.(FilesystemIterator); ok {
		_ = cfs
		return true
	}
	return false
}
`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0].value).toBe(3);
  });

  it("el despacho por `typeof` sigue disparando: los tipos comparados SÍ son distintos", async () => {
    const findings = await run(
      "javascript",
      `
function guess(v) {
  if (typeof v === "boolean") { return "bool"; }
  else if (typeof v === "string") { return "str"; }
  return "any";
}
`,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0].value).toBe(2);
  });
});
