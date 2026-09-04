import { describe, expect, it } from "vitest";

import { detector } from "./boolean-complexity.js";
import { runIntraFunction, testContext } from "../testing.js";

const JS_PROBE = `
function probe(a, b) {
  if (a && b) {
    go();
  }
}
`;

const PYTHON_PROBE = `
def probe(a, b):
    if a and b:
        go()
`;

const RUBY_PROBE = `
def probe(a, b)
  if a && b
    go
  end
end
`;

const JAVA_PROBE = `
public class Shape {
  public void probe(boolean a, boolean b) {
    if (a && b) {
      go();
    }
  }
}
`;

const GO_PROBE = `
package main

func probe(a, b bool) {
	if a && b {
		go1()
	}
}
`;

const CSHARP_PROBE = `
class Shape {
  void probe(bool a, bool b) {
    if (a && b) {
      go();
    }
  }
}
`;

/** `n` operandos (`v0`, `v1`, …) unidos por `op` — genera `n - 1` operadores, todos de la MISMA familia (homogénea). */
function chain(op: string, n: number): string {
  return Array.from({ length: n }, (_, i) => `v${i}`).join(` ${op} `);
}

/** Igual que `chain`, pero alternando entre dos operadores — para probar el conteo cuando la cadena MEZCLA `&&`/`||` de verdad (dos familias). */
function altChain(ops: readonly [string, string], n: number): string {
  const parts = ["v0"];
  for (let i = 1; i < n; i++) parts.push(ops[(i - 1) % 2]!, `v${i}`);
  return parts.join(" ");
}

/** `n` pares `(pI0 op pI1)` — cada `&&`/`and` interno va entre paréntesis EXPLÍCITOS — unidos por `outerOp`, todos homogéneos a nivel externo. Prueba que un operando parentizado queda opaco y no contamina la familia de la cadena externa. */
function parenPairs(innerOp: string, outerOp: string, n: number): string {
  const parts = Array.from({ length: n }, (_, i) => `(p${i}0 ${innerOp} p${i}1)`);
  return parts.join(` ${outerOp} `);
}

function parenPairParams(n: number, suffix = ""): string {
  return Array.from({ length: n }, (_, i) => [`p${i}0`, `p${i}1`]).flat().map((name) => `${name}${suffix}`).join(", ");
}

describe("boolean-complexity", () => {
  describe("javascript", () => {
    it("una cadena HOMOGÉNEA (todo &&) por encima del umbral ya NO es un hallazgo — redefinición: sin mezcla de familias no hay ambigüedad de precedencia que señalar", async () => {
      const threshold = testContext(detector, "javascript").threshold("operatorCount").value;
      const source = `
function risky(${Array.from({ length: threshold + 2 }, (_, i) => `v${i}`).join(", ")}) {
  if (${chain("&&", threshold + 2)}) {
    go();
  }
}
`;
      const findings = await runIntraFunction(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
      expect(findings).toHaveLength(0);
    });

    it("una cadena que MEZCLA && y || de verdad (sin paréntesis) por encima del umbral es un hallazgo, contado una sola vez pese al anidamiento", async () => {
      const threshold = testContext(detector, "javascript").threshold("operatorCount").value;
      const source = `
function risky(${Array.from({ length: threshold + 2 }, (_, i) => `v${i}`).join(", ")}) {
  if (${altChain(["&&", "||"], threshold + 2)}) {
    go();
  }
}
`;
      const findings = await runIntraFunction(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.trigger[0]!.value).toBe(threshold + 1);
      expect(findings[0]!.locations[0]!.role).toBe("condición que mezcla && y || sin paréntesis explícitos");
    });

    it("REGRESIÓN (RAICES.md PENDIENTES §1-BIS, 'el apagado'): el caso mínimo de mezcla real encadenada, `a && b || c && d` (3 operadores), SÍ dispara — con el umbral viejo de S1067 (>3) este caso nunca disparaba y apagó el detector (289 hallazgos → 10)", async () => {
      const findings = await runIntraFunction(detector, {
        wasm: "tree-sitter-javascript.wasm",
        probe: JS_PROBE,
        language: "javascript",
        source: `
function risky(a, b, c, d) {
  if (a && b || c && d) {
    go();
  }
}
`,
      });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.trigger[0]!.value).toBe(3);
    });

    it("mezcla justo en el umbral (no lo excede) no dispara nada", async () => {
      const threshold = testContext(detector, "javascript").threshold("operatorCount").value;
      const source = `
function ok(${Array.from({ length: threshold + 1 }, (_, i) => `v${i}`).join(", ")}) {
  if (${altChain(["&&", "||"], threshold + 1)}) {
    go();
  }
}
`;
      const findings = await runIntraFunction(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
      expect(findings).toHaveLength(0);
    });

    it("control negativo: una condición con un solo operador lógico no dispara nada", async () => {
      const findings = await runIntraFunction(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source: JS_PROBE });
      expect(findings).toHaveLength(0);
    });

    it("paréntesis explícitos que ya agrupan cada && dejan la cadena externa homogénea (todo ||): no dispara aunque el texto completo mezcle && y ||", async () => {
      const threshold = testContext(detector, "javascript").threshold("operatorCount").value;
      const pairs = threshold + 2; // outer count = pairs - 1 > threshold
      const source = `
function risky(${parenPairParams(pairs)}) {
  if (${parenPairs("&&", "||", pairs)}) {
    go();
  }
}
`;
      const findings = await runIntraFunction(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
      expect(findings).toHaveLength(0);
    });
  });

  describe("python", () => {
    it("una cadena HOMOGÉNEA (`and` encadenado) por encima del umbral ya no es un hallazgo", async () => {
      const threshold = testContext(detector, "python").threshold("operatorCount").value;
      const source = `
def risky(${Array.from({ length: threshold + 2 }, (_, i) => `v${i}`).join(", ")}):
    if ${chain("and", threshold + 2)}:
        go()
`;
      const findings = await runIntraFunction(detector, { wasm: "tree-sitter-python.wasm", probe: PYTHON_PROBE, language: "python", source });
      expect(findings).toHaveLength(0);
    });

    it("una cadena que MEZCLA `and`/`or` de verdad por encima del umbral es un hallazgo", async () => {
      const threshold = testContext(detector, "python").threshold("operatorCount").value;
      const source = `
def risky(${Array.from({ length: threshold + 2 }, (_, i) => `v${i}`).join(", ")}):
    if ${altChain(["and", "or"], threshold + 2)}:
        go()
`;
      const findings = await runIntraFunction(detector, { wasm: "tree-sitter-python.wasm", probe: PYTHON_PROBE, language: "python", source });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.trigger[0]!.value).toBe(threshold + 1);
    });

    it("control negativo: `and` con un solo operador no dispara nada", async () => {
      const findings = await runIntraFunction(detector, { wasm: "tree-sitter-python.wasm", probe: PYTHON_PROBE, language: "python", source: PYTHON_PROBE });
      expect(findings).toHaveLength(0);
    });
  });

  describe("ruby", () => {
    it("una cadena HOMOGÉNEA (&& encadenado) por encima del umbral ya no es un hallazgo", async () => {
      const threshold = testContext(detector, "ruby").threshold("operatorCount").value;
      const source = `
def risky(${Array.from({ length: threshold + 2 }, (_, i) => `v${i}`).join(", ")})
  if ${chain("&&", threshold + 2)}
    go
  end
end
`;
      const findings = await runIntraFunction(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source });
      expect(findings).toHaveLength(0);
    });

    it("la forma-palabra `and` homogénea (alternativa de baja precedencia a &&) tampoco dispara — misma redefinición, misma forma estructural", async () => {
      const threshold = testContext(detector, "ruby").threshold("operatorCount").value;
      const source = `
def risky(${Array.from({ length: threshold + 2 }, (_, i) => `v${i}`).join(", ")})
  if ${chain("and", threshold + 2)}
    go
  end
end
`;
      const findings = await runIntraFunction(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source });
      expect(findings).toHaveLength(0);
    });

    it("una cadena que MEZCLA && y || de verdad por encima del umbral es un hallazgo", async () => {
      const threshold = testContext(detector, "ruby").threshold("operatorCount").value;
      const source = `
def risky(${Array.from({ length: threshold + 2 }, (_, i) => `v${i}`).join(", ")})
  if ${altChain(["&&", "||"], threshold + 2)}
    go
  end
end
`;
      const findings = await runIntraFunction(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.trigger[0]!.value).toBe(threshold + 1);
    });

    it("control negativo: && con un solo operador no dispara nada", async () => {
      const findings = await runIntraFunction(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source: RUBY_PROBE });
      expect(findings).toHaveLength(0);
    });
  });

  describe("java", () => {
    it("una cadena HOMOGÉNEA (&& encadenado) por encima del umbral ya no es un hallazgo", async () => {
      const threshold = testContext(detector, "java").threshold("operatorCount").value;
      const params = Array.from({ length: threshold + 2 }, (_, i) => `boolean v${i}`).join(", ");
      const source = `
public class Shape {
  public void risky(${params}) {
    if (${chain("&&", threshold + 2)}) {
      go();
    }
  }
}
`;
      const findings = await runIntraFunction(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, language: "java", source });
      expect(findings).toHaveLength(0);
    });

    it("una cadena que MEZCLA && y || de verdad por encima del umbral es un hallazgo", async () => {
      const threshold = testContext(detector, "java").threshold("operatorCount").value;
      const params = Array.from({ length: threshold + 2 }, (_, i) => `boolean v${i}`).join(", ");
      const source = `
public class Shape {
  public void risky(${params}) {
    if (${altChain(["&&", "||"], threshold + 2)}) {
      go();
    }
  }
}
`;
      const findings = await runIntraFunction(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, language: "java", source });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.trigger[0]!.value).toBe(threshold + 1);
      expect(findings[0]!.locations[0]!.role).toBe("condición que mezcla && y || sin paréntesis explícitos");
    });

    it("control negativo: && con un solo operador no dispara nada", async () => {
      const findings = await runIntraFunction(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, language: "java", source: JAVA_PROBE });
      expect(findings).toHaveLength(0);
    });
  });

  describe("go", () => {
    it("una cadena HOMOGÉNEA (&& encadenado) por encima del umbral ya no es un hallazgo", async () => {
      const threshold = testContext(detector, "go").threshold("operatorCount").value;
      const params = Array.from({ length: threshold + 2 }, (_, i) => `v${i}`).join(", ") + " bool";
      const source = `
package main

func risky(${params}) {
	if ${chain("&&", threshold + 2)} {
		go1()
	}
}
`;
      const findings = await runIntraFunction(detector, { wasm: "tree-sitter-go.wasm", probe: GO_PROBE, language: "go", source });
      expect(findings).toHaveLength(0);
    });

    it("una cadena que MEZCLA && y || de verdad por encima del umbral es un hallazgo", async () => {
      const threshold = testContext(detector, "go").threshold("operatorCount").value;
      const params = Array.from({ length: threshold + 2 }, (_, i) => `v${i}`).join(", ") + " bool";
      const source = `
package main

func risky(${params}) {
	if ${altChain(["&&", "||"], threshold + 2)} {
		go1()
	}
}
`;
      const findings = await runIntraFunction(detector, { wasm: "tree-sitter-go.wasm", probe: GO_PROBE, language: "go", source });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.trigger[0]!.value).toBe(threshold + 1);
    });

    it("control negativo: && con un solo operador no dispara nada", async () => {
      const findings = await runIntraFunction(detector, { wasm: "tree-sitter-go.wasm", probe: GO_PROBE, language: "go", source: GO_PROBE });
      expect(findings).toHaveLength(0);
    });
  });

  describe("csharp", () => {
    it("una cadena HOMOGÉNEA (&& encadenado) por encima del umbral ya no es un hallazgo", async () => {
      const threshold = testContext(detector, "csharp").threshold("operatorCount").value;
      const params = Array.from({ length: threshold + 2 }, (_, i) => `bool v${i}`).join(", ");
      const source = `
class Shape {
  void risky(${params}) {
    if (${chain("&&", threshold + 2)}) {
      go();
    }
  }
}
`;
      const findings = await runIntraFunction(detector, { wasm: "tree-sitter-c_sharp.wasm", probe: CSHARP_PROBE, language: "csharp", source });
      expect(findings).toHaveLength(0);
    });

    it("una cadena que MEZCLA && y || de verdad por encima del umbral es un hallazgo", async () => {
      const threshold = testContext(detector, "csharp").threshold("operatorCount").value;
      const params = Array.from({ length: threshold + 2 }, (_, i) => `bool v${i}`).join(", ");
      const source = `
class Shape {
  void risky(${params}) {
    if (${altChain(["&&", "||"], threshold + 2)}) {
      go();
    }
  }
}
`;
      const findings = await runIntraFunction(detector, { wasm: "tree-sitter-c_sharp.wasm", probe: CSHARP_PROBE, language: "csharp", source });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.trigger[0]!.value).toBe(threshold + 1);
    });

    it("control negativo: && con un solo operador no dispara nada", async () => {
      const findings = await runIntraFunction(detector, { wasm: "tree-sitter-c_sharp.wasm", probe: CSHARP_PROBE, language: "csharp", source: CSHARP_PROBE });
      expect(findings).toHaveLength(0);
    });
  });

  /* ── Ola O / N10 — "código que no es producto" ─────────────────────────── */
  describe("N10 — arnés de test", () => {
    it("la MISMA condición no es un hallazgo dentro de un método que un runner descubre por su nombre y ejecuta sin argumentos", async () => {
      // Las tres fuentes de este bloque tienen el MISMO cuerpo y difieren
      // sólo en la firma del método: es lo que separa el criterio
      // estructural (nombre de descubrimiento + aridad cero) de un prefijo
      // de nombre suelto.
      const cuerpo = `if (a() && b() || c() && d()) { go(); }`;
      const arnes = `class Suite { void testMixedGuard() { ${cuerpo} } }`;
      const produccion = `class Suite { void tester() { ${cuerpo} } }`;
      // `runIntraFunction` no deriva métricas del árbol: parte de
      // `ZERO_METRICS` (`detect/testing.ts`) y sólo mezcla lo que el test
      // declare. Por eso la aridad va explícita — que es además lo que el
      // arnés de tests pide (“qué métrica se está asumiendo, escrita”).
      const correr = (source: string, parameters = 0) =>
        runIntraFunction(detector, { wasm: "tree-sitter-c_sharp.wasm", probe: CSHARP_PROBE, language: "csharp", source, metrics: { parameters } });

      expect(await correr(arnes)).toHaveLength(0);
      // Con parámetros ningún runner reflexivo podría invocarlo: no es arnés.
      expect(await correr(arnes, 1)).toHaveLength(1);
      // `tester` contiene las mismas cuatro letras y no es el token `test`.
      expect(await correr(produccion)).toHaveLength(1);
    });
  });
});
