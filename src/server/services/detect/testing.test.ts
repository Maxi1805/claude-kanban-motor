/**
 * El arnés se verifica contra los detectores REALES de la Ola 1, uno de cada
 * scope: si `testing.ts` armara mal un `FileUnit` (sets equivocados,
 * `className` sin seguir, umbral resuelto de otra forma), estos tests
 * reproducirían un resultado distinto del que los propios tests de esos
 * detectores ya afirman. Es la única garantía de que doce detectores nuevos
 * pueden apoyarse en él.
 */
import { describe, expect, it } from "vitest";

import { detector as emptyCatch } from "./intra-function/empty-catch.js";
import { detector as largeClass } from "./intra-file/large-class.js";
import { fileUnitFrom, nodeSetsFor, parseRoot, runIntraFile, runIntraFunction, testContext } from "./testing.js";

const RUBY_PROBE = `
class Shape
  def area(x)
    begin
      go
    rescue => e
      handle(e)
    end
  end
end
`;

/**
 * La sonda tiene que ejercitar TODA construcción que las fixtures usen: los
 * `DerivedNodeSets` salen de ella, así que un `function` suelto que la sonda
 * no contiene simplemente no existe para el detector. Por eso acá hay a la vez
 * un método dentro de una clase y una función de nivel superior.
 */
const TS_PROBE = `
class Shape {
  area(x: number): number {
    return x;
  }
}

function free(x: number): number {
  return x;
}
`;

describe("arnés: runIntraFunction", () => {
  it("reproduce el hallazgo de empty-catch sobre un rescue vacío en ruby", async () => {
    const findings = await runIntraFunction(emptyCatch, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      language: "ruby",
      source: `
def risky
  begin
    go
  rescue => e
  end
end
`,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.role).toBe("manejador de excepción vacío");
  });

  it("control negativo: un rescue que maneja la excepción no dispara nada", async () => {
    const findings = await runIntraFunction(emptyCatch, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      language: "ruby",
      source: RUBY_PROBE,
    });
    expect(findings).toHaveLength(0);
  });

  it("corre sobre TODAS las funciones del archivo, no sólo la primera", async () => {
    const findings = await runIntraFunction(emptyCatch, {
      wasm: "tree-sitter-ruby.wasm",
      probe: RUBY_PROBE,
      language: "ruby",
      source: `
def a
  begin
    go
  rescue => e
  end
end

def b
  begin
    go
  rescue => e
  end
end
`,
    });
    expect(findings).toHaveLength(2);
  });
});

describe("arnés: runIntraFile", () => {
  /** `n` métodos triviales dentro de una única clase TypeScript. */
  function manyMethods(n: number, className: string): string {
    const methods = Array.from({ length: n }, (_, i) => `  m${i}(): number {\n    return ${i};\n  }`).join("\n");
    return `class ${className} {\n${methods}\n}\n`;
  }

  it("dispara large-class por encima del umbral y no por debajo, sin que el test elija el número", async () => {
    const threshold = testContext(largeClass, "typescript").threshold("memberCount").value;
    const options = { wasm: "tree-sitter-typescript.wasm", probe: TS_PROBE, language: "typescript" };

    const over = await runIntraFile(largeClass, { ...options, source: manyMethods(threshold, "Gorda") });
    expect(over).toHaveLength(1);
    expect(over[0]!.locations[0]!.symbol).toBe("Gorda");

    const under = await runIntraFile(largeClass, { ...options, source: manyMethods(threshold - 1, "Flaca") });
    expect(under).toHaveLength(0);
  });
});

describe("arnés: fileUnitFrom", () => {
  it("deriva className de verdad siguiendo la unidad tipo-clase envolvente", async () => {
    const sets = await nodeSetsFor("tree-sitter-typescript.wasm", TS_PROBE);
    const root = await parseRoot(
      "tree-sitter-typescript.wasm",
      `
class Caja {
  abrir(): void {}
}

function suelta(): void {}
`,
    );
    const file = fileUnitFrom(root, sets, "typescript");
    const byName = new Map(file.functions.map((f) => [f.name, f]));
    expect(byName.get("abrir")?.metrics.className).toBe("Caja");
    expect(byName.get("abrir")?.symbolPath).toEqual(["Caja", "abrir"]);
    expect(byName.get("suelta")?.metrics.className).toBeNull();
  });
});
