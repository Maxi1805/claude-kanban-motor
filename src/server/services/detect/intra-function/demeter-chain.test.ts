import { describe, expect, it } from "vitest";

import { detector } from "./demeter-chain.js";
import { runIntraFunction, testContext } from "../testing.js";

/**
 * Cada PROBE ejercita una función (para que `testing.ts#fileUnitFrom` derive
 * `functionNodes` y arme el `FunctionUnit`) — la propia forma de la cadena
 * NO depende de `sets`, así que el probe no necesita ejercitar member/call
 * expressions en sí: le alcanza con lo mínimo que empty-catch.test.ts /
 * repeated-switch.test.ts ya usan.
 */
const JS_PROBE = `
function f(x) {
  return x;
}
`;

const PYTHON_PROBE = `
def f(x):
    return x
`;

const RUBY_PROBE = `
def f(x)
  x
end
`;

const JAVA_PROBE = `
public class Shape {
  public int f(int x) {
    return x;
  }
}
`;

const GO_PROBE = `
package main

func f(x int) int {
	return x
}
`;

const CSHARP_PROBE = `
class Shape {
  int F(int x) {
    return x;
  }
}
`;

/**
 * `base` seguido de `n` accesos a propiedad, el ÚLTIMO marcado privado por
 * convención (`_pN`): `chainOf(3, "a")` -> "a.p0.p1._p2" (3 eslabones, uno
 * privado) — JUICIO DE PRECISIÓN (ver el docstring del módulo) exige que AL
 * MENOS un eslabón cruce hacia estructura marcada privada/interna; sin esto
 * ninguno de los positivos de abajo dispararía. `chainOfPublic` (más abajo)
 * es la MISMA forma sin el guión bajo — la usan los negativos nuevos que
 * prueban la exclusión en sí.
 */
function chainOf(n: number, base = "a"): string {
  return base + Array.from({ length: n }, (_, i) => (i === n - 1 ? `._p${i}` : `.p${i}`)).join("");
}

/** Igual que `chainOf` pero cada eslabón es una LLAMADA, el último privado: "a.m0().m1()._m2()" (3 eslabones). */
function callChainOf(n: number, base = "a"): string {
  return base + Array.from({ length: n }, (_, i) => (i === n - 1 ? `._m${i}()` : `.m${i}()`)).join("");
}

/** Misma forma que `chainOf`, SIN ningún eslabón privado — para los negativos que prueban `crossesIntoPrivateStructure` en sí (API fluida/protocolo de iterador, ver el docstring del módulo). */
function chainOfPublic(n: number, base = "a"): string {
  return base + Array.from({ length: n }, (_, i) => `.p${i}`).join("");
}

describe("demeter-chain", () => {
  it("javascript: cadena de acceso llano por encima del umbral es un hallazgo, y no por debajo — sin que el test elija el número", async () => {
    const threshold = testContext(detector, "javascript").threshold("linkCount").value;
    const options = { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript" };

    const over = await runIntraFunction(detector, {
      ...options,
      source: `function f() {\n  return ${chainOf(threshold)};\n}\n`,
    });
    expect(over).toHaveLength(1);
    expect(over[0]!.trigger[0]!.value).toBe(threshold);
    expect(over[0]!.locations[0]!.role).toBe("cadena de acceso hacia estructura interna ajena");

    const under = await runIntraFunction(detector, {
      ...options,
      source: `function g() {\n  return ${chainOf(threshold - 1)};\n}\n`,
    });
    expect(under).toHaveLength(0);
  });

  it("JUICIO DE PRECISIÓN — javascript: una cadena por encima del umbral SIN ningún eslabón privado por convención NO dispara (API fluida/protocolo de iterador, misma forma sintáctica que un positivo, pero sin cruzar hacia estructura marcada interna)", async () => {
    const threshold = testContext(detector, "javascript").threshold("linkCount").value;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: `function f() {\n  return ${chainOfPublic(threshold)};\n}\n`,
    });
    expect(findings).toHaveLength(0);
  });

  it("JUICIO DE PRECISIÓN — javascript: API fluida real (`crypto.createHash('sha1').update(x).digest().toString('hex')`) no dispara — el ejemplo canónico que el docstring del módulo cita", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: `function hash(x) {\n  return crypto.createHash('sha1').update(x).digest().toString('hex');\n}\n`,
    });
    expect(findings).toHaveLength(0);
  });

  it("JUICIO DE PRECISIÓN — javascript: cruzar hacia un campo interno (`vnode._component.__hooks._list`) SÍ dispara — caso real medido en preact/compat/src/suspense.js:45", async () => {
    const threshold = testContext(detector, "javascript").threshold("linkCount").value;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: `function f(vnode) {\n  vnode._component.__hooks._list.forEach((x) => x());\n}\n`,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBeGreaterThanOrEqual(threshold);
  });

  it("javascript control negativo: un solo acceso (`a.b`) no dispara nada", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: `function f() {\n  return a.b;\n}\n`,
    });
    expect(findings).toHaveLength(0);
  });

  it("javascript: cadena de LLAMADAS encadenadas (`a.m0().m1().m2()`) dispara igual que la de propiedades — el desenvuelto de `call_expression` funciona", async () => {
    const threshold = testContext(detector, "javascript").threshold("linkCount").value;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: `function f() {\n  return ${callChainOf(threshold)};\n}\n`,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(threshold);
  });

  it("javascript control negativo: dos cadenas cortas SEPARADAS en la misma función no se suman entre sí", async () => {
    // Cada una por debajo del umbral por separado: si el detector las sumara
    // en vez de medir cadenas independientes, esto dispararía por error.
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: `function f() {\n  return a.b + c.d;\n}\n`,
    });
    expect(findings).toHaveLength(0);
  });

  it("javascript: no cuenta dos veces la MISMA cadena (la sub-cadena interna queda 'reclamada' por la externa)", async () => {
    const threshold = testContext(detector, "javascript").threshold("linkCount").value;
    // Una cadena de longitud threshold+2: si el detector reportara también
    // en cada nodo intermedio, habría más de un hallazgo para la misma
    // expresión.
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-javascript.wasm",
      probe: JS_PROBE,
      language: "javascript",
      source: `function f() {\n  return ${chainOf(threshold + 2)};\n}\n`,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(threshold + 2);
  });

  it("python: cadena de atributos (`a.p0.p1.p2`) por encima del umbral es un hallazgo", async () => {
    const threshold = testContext(detector, "python").threshold("linkCount").value;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-python.wasm",
      probe: PYTHON_PROBE,
      language: "python",
      source: `def f():\n    return ${chainOf(threshold)}\n`,
    });
    expect(findings).toHaveLength(1);
  });

  it("JUICIO DE PRECISIÓN — python: cadena sin eslabón privado por convención no dispara, aunque supere el umbral", async () => {
    const threshold = testContext(detector, "python").threshold("linkCount").value;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-python.wasm",
      probe: PYTHON_PROBE,
      language: "python",
      source: `def f():\n    return ${chainOfPublic(threshold)}\n`,
    });
    expect(findings).toHaveLength(0);
  });

  it("JUICIO DE PRECISIÓN — python: protocolo de iterador (`index.keys().next().value`) no dispara — el ejemplo canónico que el docstring del módulo cita, caso real medido en ck-analyzer/graph/neighborhood.ts:408", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-python.wasm",
      probe: PYTHON_PROBE,
      language: "python",
      source: `def f(index):\n    return index.ego_cache.keys().next().value\n`,
    });
    expect(findings).toHaveLength(0);
  });

  it("JUICIO DE PRECISIÓN — python: un DUNDER (`clause.operator.__name__.rstrip('_')`) NO dispara — es reflexión PÚBLICA del lenguaje, no estructura privada, aunque empiece con guión bajo (caso real medido en sqlalchemy/orm/evaluator.py:165)", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-python.wasm",
      probe: PYTHON_PROBE,
      language: "python",
      source: `def f(clause):\n    return clause.operator.__name__.rstrip('_')\n`,
    });
    expect(findings).toHaveLength(0);
  });

  it("JUICIO DE PRECISIÓN — python: un atributo mapeado por convención ORM (`Customer.__table__.insert().values(...)`) NO dispara — dunder público, API de mapeo documentada (caso real medido en sqlalchemy examples/performance/bulk_inserts.py:142)", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-python.wasm",
      probe: PYTHON_PROBE,
      language: "python",
      source: `def f():\n    return Customer.__table__.insert().values(name=x).compile(dialect=y)\n`,
    });
    expect(findings).toHaveLength(0);
  });

  it("python control negativo: `a.b` no dispara nada", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-python.wasm",
      probe: PYTHON_PROBE,
      language: "python",
      source: `def f():\n    return a.b\n`,
    });
    expect(findings).toHaveLength(0);
  });

  it("python: cadena de LLAMADAS encadenadas también dispara (desenvuelto de `call`)", async () => {
    const threshold = testContext(detector, "python").threshold("linkCount").value;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-python.wasm",
      probe: PYTHON_PROBE,
      language: "python",
      source: `def f():\n    return ${callChainOf(threshold)}\n`,
    });
    expect(findings).toHaveLength(1);
  });

  it("ruby: cadena de método sin paréntesis (`a.p0.p1.p2`, todo `call` con `receiver`) es un hallazgo", async () => {
    const threshold = testContext(detector, "ruby").threshold("linkCount").value;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      language: "ruby",
      source: `def f\n  ${chainOf(threshold)}\nend\n`,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("f");
  });

  it("JUICIO DE PRECISIÓN — ruby: cadena sin eslabón privado por convención no dispara, aunque supere el umbral", async () => {
    const threshold = testContext(detector, "ruby").threshold("linkCount").value;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      language: "ruby",
      source: `def f\n  ${chainOfPublic(threshold)}\nend\n`,
    });
    expect(findings).toHaveLength(0);
  });

  it("ruby control negativo: `a.b` no dispara nada", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      language: "ruby",
      source: `def f\n  a.b\nend\n`,
    });
    expect(findings).toHaveLength(0);
  });

  it("java: cadena de `field_access`/`method_invocation` (`a.p0.p1.p2`) es un hallazgo", async () => {
    const threshold = testContext(detector, "java").threshold("linkCount").value;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-java.wasm",
      probe: JAVA_PROBE,
      language: "java",
      source: `
public class Shape {
  public Object f() {
    return ${chainOf(threshold)};
  }
}
`,
    });
    expect(findings).toHaveLength(1);
  });

  it("JUICIO DE PRECISIÓN — java: builder textbook (`new MapMaker().initialCapacity(1).setKeyStrength(k).weakKeys().weakValues()`, 4 llamadas encadenadas) no dispara — caso real medido en guava/.../MapMakerInternalMap.java:2850", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-java.wasm",
      probe: JAVA_PROBE,
      language: "java",
      source: `
public class Shape {
  public Object f(Strength k) {
    return new MapMaker().initialCapacity(1).setKeyStrength(k).weakKeys().weakValues();
  }
}
`,
    });
    expect(findings).toHaveLength(0);
  });

  it("java control negativo: `a.b` no dispara nada", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-java.wasm",
      probe: JAVA_PROBE,
      language: "java",
      source: `
public class Shape {
  public Object f() {
    return a.b;
  }
}
`,
    });
    expect(findings).toHaveLength(0);
  });

  it("go: cadena de `selector_expression` (`a.p0.p1.p2`) es un hallazgo", async () => {
    const threshold = testContext(detector, "go").threshold("linkCount").value;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-go.wasm",
      probe: GO_PROBE,
      language: "go",
      source: `
package main

func f() int {
	return ${chainOf(threshold)}
}
`,
    });
    expect(findings).toHaveLength(1);
  });

  it("JUICIO DE PRECISIÓN — go: cadena sin eslabón privado por convención no dispara, aunque supere el umbral", async () => {
    const threshold = testContext(detector, "go").threshold("linkCount").value;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-go.wasm",
      probe: GO_PROBE,
      language: "go",
      source: `
package main

func f() int {
	return ${chainOfPublic(threshold)}
}
`,
    });
    expect(findings).toHaveLength(0);
  });

  it("go control negativo: `a.b` no dispara nada", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-go.wasm",
      probe: GO_PROBE,
      language: "go",
      source: `
package main

func f() int {
	return a.b
}
`,
    });
    expect(findings).toHaveLength(0);
  });

  it("csharp: cadena de `member_access_expression` (`a.p0.p1.p2`) es un hallazgo", async () => {
    const threshold = testContext(detector, "csharp").threshold("linkCount").value;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-c_sharp.wasm",
      probe: CSHARP_PROBE,
      language: "csharp",
      source: `
class Shape {
  object F() {
    return ${chainOf(threshold)};
  }
}
`,
    });
    expect(findings).toHaveLength(1);
  });

  it("JUICIO DE PRECISIÓN — csharp: cadena sin eslabón privado por convención no dispara, aunque supere el umbral", async () => {
    const threshold = testContext(detector, "csharp").threshold("linkCount").value;
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-c_sharp.wasm",
      probe: CSHARP_PROBE,
      language: "csharp",
      source: `
class Shape {
  object F() {
    return ${chainOfPublic(threshold)};
  }
}
`,
    });
    expect(findings).toHaveLength(0);
  });

  it("csharp control negativo: `a.b` no dispara nada", async () => {
    const findings = await runIntraFunction(detector, {
      wasm: "tree-sitter-c_sharp.wasm",
      probe: CSHARP_PROBE,
      language: "csharp",
      source: `
class Shape {
  object F() {
    return a.b;
  }
}
`,
    });
    expect(findings).toHaveLength(0);
  });
});
