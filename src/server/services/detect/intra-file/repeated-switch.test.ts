import { describe, expect, it } from "vitest";

import { detector } from "./repeated-switch.js";
import { runIntraFile } from "../testing.js";

// Migrado al arnés compartido (`../testing.js#runIntraFile`) — el harness
// anterior armaba el `FileUnit` a mano con `functions: []` SIEMPRE, así que
// ningún test podía haber ejercitado `enclosingFunctionName`/`role.symbol`
// sin que se notara (`symbol` quedaba `undefined` incondicionalmente). El
// arnés compartido deriva `functions` recorriendo el árbol de verdad — mismo
// patrón que `self-referential-member.test.ts`/`homonymous-delegation.test.ts`.
const JS_PROBE = `
function describe(kind) {
  switch (kind) {
    case "circle":
      return "circle";
    default:
      return "unknown";
  }
}
`;

const RUBY_PROBE = `
def describe(kind)
  case kind
  when :circle
    "circle"
  else
    "unknown"
  end
end
`;

const JAVA_PROBE = `
class Shape {
  String describe(String kind) {
    switch (kind) {
      case "circle":
        return "circle";
      default:
        return "unknown";
    }
  }
}
`;

// Sondas para las 3 gramáticas que el docstring del módulo declara
// soportadas pero que ningún test anterior ejercitaba (Ola N, frente A5b):
// Python (`match`/`case`, campo `subject`), C# (`switch`, campo `value`),
// Go (`switch`, campo `value` directo en `expression_case`) — confirmado por
// sonda directa contra las 3 gramáticas antes de escribir estos tests.
const PYTHON_PROBE = `
def describe(kind):
    match kind:
        case "circle":
            return "circle"
        case _:
            return "unknown"
`;

const CSHARP_PROBE = `
class Shape {
  string Describe(string kind) {
    switch (kind) {
      case "circle":
        return "circle";
      default:
        return "unknown";
    }
  }
}
`;

const GO_PROBE = `
package shapes

func describe(kind string) string {
	switch kind {
	case "circle":
		return "circle"
	default:
		return "unknown"
	}
}
`;

describe("repeated-switch", () => {
  it("javascript: el mismo discriminante decidido en 2 switches distintos del archivo es un hallazgo", async () => {
    const source = `
function priceFor(shape) {
  switch (shape.kind) {
    case "circle":
      return 1;
    default:
      return 0;
  }
}

function iconFor(shape) {
  switch (shape.kind) {
    case "circle":
      return "o";
    default:
      return "?";
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(2);
    expect(findings[0]!.locations).toHaveLength(2);
  });

  it("control negativo: dos switches sobre discriminantes DISTINTOS no se agrupan entre sí", async () => {
    const source = `
function priceFor(shape) {
  switch (shape.kind) {
    case "circle":
      return 1;
    default:
      return 0;
  }
}

function labelFor(status) {
  switch (status.code) {
    case "ok":
      return "OK";
    default:
      return "?";
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
    expect(findings).toHaveLength(0);
  });

  it("control negativo: un único switch en todo el archivo no es evidencia de nada", async () => {
    const source = `
function priceFor(shape) {
  switch (shape.kind) {
    case "circle":
      return 1;
    default:
      return 0;
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
    expect(findings).toHaveLength(0);
  });

  it("ruby: el mismo discriminante (`case kind`) repetido en 2 métodos distintos también dispara — no depende de una gramática de `switch` específica", async () => {
    const source = `
def price_for(shape)
  case shape.kind
  when :circle
    1
  else
    0
  end
end

def icon_for(shape)
  case shape.kind
  when :circle
    "o"
  else
    "?"
  end
end
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-ruby.wasm", probe: RUBY_PROBE, language: "ruby", source });
    expect(findings).toHaveLength(1);
  });

  it("java: el mismo discriminante decidido en 2 switches distintos también dispara — tercer lenguaje real (junto a javascript/ruby), cierra el criterio de salida de F1 (≥3 lenguajes); campo `condition`, no `value`", async () => {
    const source = `
class Shapes {
  String priceFor(String kind) {
    switch (kind) {
      case "circle":
        return "1";
      default:
        return "0";
    }
  }

  String iconFor(String kind) {
    switch (kind) {
      case "circle":
        return "o";
      default:
        return "?";
    }
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-java.wasm", probe: JAVA_PROBE, language: "java", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(2);
  });

  it("typescript: mismo mecanismo que javascript (comparten `switch_case`, sólo se confirma que las anotaciones de tipo no interfieren)", async () => {
    const source = `
function priceFor(shape: Shape): number {
  switch (shape.kind) {
    case "circle":
      return 1;
    default:
      return 0;
  }
}

function iconFor(shape: Shape): string {
  switch (shape.kind) {
    case "circle":
      return "o";
    default:
      return "?";
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-typescript.wasm", probe: JS_PROBE, language: "typescript", source });
    expect(findings).toHaveLength(1);
  });

  it("una escalera if/elsif sobre el mismo nombre repetida NO cuenta como switch repetido (chainNodes fusiona if+switch; switchContainerNodes no)", async () => {
    const source = `
function priceFor(kind) {
  if (kind === "circle") {
    return 1;
  } else if (kind === "square") {
    return 2;
  }
}

function iconFor(kind) {
  if (kind === "circle") {
    return "o";
  } else if (kind === "square") {
    return "sq";
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
    expect(findings).toHaveLength(0);
  });

  // ── Los 3 lenguajes restantes de los 6 que el docstring declara (Ola N,
  // frente A5b): "ningún lenguaje es especial" — un detector que declara 6
  // gramáticas soportadas pero sólo prueba 3 es exactamente el hueco que
  // CONTEXTO.md pide cerrar, no aceptar. ────────────────────────────────────

  it("python: el mismo discriminante decidido en 2 `match` distintos también dispara — campo `subject`, brazo `case_clause` sin envoltorio propio", async () => {
    const source = `
def price_for(shape):
    match shape.kind:
        case "circle":
            return 1
        case _:
            return 0

def icon_for(shape):
    match shape.kind:
        case "circle":
            return "o"
        case _:
            return "?"
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-python.wasm", probe: PYTHON_PROBE, language: "python", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(2);
  });

  it("c#: el mismo discriminante decidido en 2 switches distintos también dispara — campo `value`, brazo `switch_section` con `case_switch_label` envolviendo la etiqueta", async () => {
    const source = `
class Shapes {
  int PriceFor(string kind) {
    switch (kind) {
      case "circle":
        return 1;
      default:
        return 0;
    }
  }

  string IconFor(string kind) {
    switch (kind) {
      case "circle":
        return "o";
      default:
        return "?";
    }
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-c_sharp.wasm", probe: CSHARP_PROBE, language: "csharp", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(2);
  });

  it("go: el mismo discriminante decidido en 2 switches distintos también dispara — campo `value` directo en `expression_case`, sin envoltorio de brazos en absoluto", async () => {
    const source = `
package shapes

func priceFor(kind string) int {
	switch kind {
	case "circle":
		return 1
	default:
		return 0
	}
}

func iconFor(kind string) string {
	switch kind {
	case "circle":
		return "o"
	default:
		return "?"
	}
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-go.wasm", probe: GO_PROBE, language: "go", source });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trigger[0]!.value).toBe(2);
  });

  // ── EVIDENCIA (Ola N, frente A5b): el propio arreglo del ancla — 28/41
  // dudosos en la planilla eran "no verifiqué las otras apariciones", porque
  // `toPrecisionRow` sólo mostraba `locations[0]`. `detail`/`role` ahora
  // llevan los CASOS de cada ubicación para que un juez no tenga que abrir
  // el archivo. Ningún test anterior lo ejercitaba: el código ya estaba
  // escrito, pero sin aserción no hay evidencia de que funcione. ───────────

  it("EVIDENCIA: `detail` lista los casos de CADA ubicación por separado, y cada `location.role` lleva el resumen de sus propios casos", async () => {
    const source = `
function priceFor(shape) {
  switch (shape.kind) {
    case "circle":
      return 1;
    case "square":
      return 2;
    default:
      return 0;
  }
}

function iconFor(shape) {
  switch (shape.kind) {
    case "circle":
      return "o";
    case "square":
      return "sq";
    default:
      return "?";
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    // El `default` NUNCA es un caso real — no debe aparecer como evidencia.
    expect(finding.detail).not.toContain("default");
    expect(finding.detail).toContain("circle");
    expect(finding.detail).toContain("square");
    // Ambas ubicaciones comparten el MISMO vocabulario de casos — la señal
    // real de un discriminante compartido, visible sin abrir el archivo.
    expect(finding.locations[0]!.role).toContain("circle");
    expect(finding.locations[1]!.role).toContain("circle");
  });

  it("EVIDENCIA: dos switches con el MISMO discriminante pero casos que NO coinciden en absoluto también quedan visibles en `detail` — la evidencia no filtra, sólo informa (un juez puede ver que los casos NO se solapan y decidir por su cuenta)", async () => {
    const source = `
function priceFor(shape) {
  switch (shape.kind) {
    case "circle":
      return 1;
    default:
      return 0;
  }
}

function labelFor(shape) {
  switch (shape.kind) {
    case "square":
      return "sq";
    default:
      return "?";
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
    // Sigue disparando — la evidencia no cambia el criterio de disparo, sólo
    // lo que se MUESTRA (ver docstring del módulo, "MAX_ARM_LABELS").
    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.detail).toContain("circle");
    expect(finding.detail).toContain("square");
  });

  it("EVIDENCIA: el `role` de cada ubicación identifica la función que la contiene, vía `enclosingFunctionName` (arnés compartido, `functions` real)", async () => {
    const source = `
function priceFor(shape) {
  switch (shape.kind) {
    case "circle":
      return 1;
    default:
      return 0;
  }
}

function iconFor(shape) {
  switch (shape.kind) {
    case "circle":
      return "o";
    default:
      return "?";
  }
}
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-javascript.wasm", probe: JS_PROBE, language: "javascript", source });
    expect(findings).toHaveLength(1);
    const symbols = findings[0]!.locations.map((l) => l.symbol);
    expect(symbols).toContain("priceFor");
    expect(symbols).toContain("iconFor");
  });

  it("EVIDENCIA (Ola N, frente A5b, arreglo de esta pasada): el comodín `_` de Python (`case _:`) es el brazo de reserva de `match`, igual que `default`/`else` en el resto — nunca aparece como caso en la evidencia", async () => {
    const source = `
def price_for(shape):
    match shape.kind:
        case "circle":
            return 1
        case _:
            return 0

def icon_for(shape):
    match shape.kind:
        case "circle":
            return "o"
        case _:
            return "?"
`;
    const findings = await runIntraFile(detector, { wasm: "tree-sitter-python.wasm", probe: PYTHON_PROBE, language: "python", source });
    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    // Tokeniza `detail` y confirma que ningún token es EXACTAMENTE "_" (en
    // vez de un regex frágil sobre puntuación circundante).
    const tokens = finding.detail.split(/[\s,.:·]+/).filter(Boolean);
    expect(tokens.includes("_")).toBe(false);
    expect(finding.detail).toContain("circle");
  });
});
