import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { deriveNodeSets, type DerivedNodeSets, type ProbeNode } from "../../code-grammar.js";
import { resolveThreshold } from "../thresholds.js";
import { detector } from "./large-class.js";
import type { AstNode, FileUnit, FunctionMetrics, FunctionUnit } from "../types.js";

const require = createRequire(import.meta.url);

/* eslint-disable @typescript-eslint/no-explicit-any */
let runtime: Promise<{ Parser: any; Language: any }> | null = null;
function loadRuntime() {
  runtime ??= (async () => {
    const mod = require("web-tree-sitter") as any;
    const Parser = mod.Parser ?? mod.default ?? mod;
    await Parser.init();
    const Language = Parser.Language ?? mod.Language;
    return { Parser, Language };
  })();
  return runtime;
}
function wasmPath(file: string): string {
  return path.join(path.dirname(require.resolve("tree-sitter-wasms/package.json")), "out", file);
}
const parsers = new Map<string, any>();
async function parserFor(wasmFile: string): Promise<any> {
  const cached = parsers.get(wasmFile);
  if (cached) return cached;
  const { Parser, Language } = await loadRuntime();
  const language = await Language.load(wasmPath(wasmFile));
  const parser = new Parser();
  parser.setLanguage(language);
  parsers.set(wasmFile, parser);
  return parser;
}
async function parseRoot(wasmFile: string, source: string): Promise<ProbeNode> {
  const parser = await parserFor(wasmFile);
  return parser.parse(source).rootNode as ProbeNode;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const FAKE_METRICS: FunctionMetrics = {
  branches: 0,
  chain: 0,
  cognitive: 0,
  maxNesting: 0,
  parameters: 0,
  chainHasNullCheck: false,
  chainInstantiates: false,
  className: null,
  isConstructor: false,
  isFactoryLike: false,
};

/** Recorre `root` una vez y arma `functions[]` con `metrics.className` real, siguiendo la unidad tipo-clase envolvente. */
function buildFileUnit(root: ProbeNode, sets: DerivedNodeSets, filePath: string, language: string): FileUnit {
  const functions: FunctionUnit[] = [];
  const classStack: (string | null)[] = [];

  const visit = (node: ProbeNode): void => {
    let pushedClass = false;
    if (node.isNamed && sets.classNodes.has(node.type)) {
      classStack.push(((node as AstNode).childForFieldName("name") as AstNode | null)?.text ?? null);
      pushedClass = true;
    }
    if (node.isNamed && sets.functionNodes.has(node.type)) {
      const real = node as AstNode;
      const name = (real.childForFieldName("name") as AstNode | null)?.text ?? null;
      functions.push({
        file: filePath,
        language,
        name,
        startLine: real.startPosition.row + 1,
        endLine: real.endPosition.row + 1,
        symbolPath: name ? [name] : [],
        node: real,
        sets,
        metrics: { ...FAKE_METRICS, className: classStack[classStack.length - 1] ?? null },
      });
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) visit(child);
    }
    if (pushedClass) classStack.pop();
  };
  visit(root);

  return { path: filePath, language, lines: 0, root: root as AstNode, sets, functions };
}

async function run(wasmFile: string, probeSource: string, source: string, language: string): Promise<ReturnType<typeof detector.run>> {
  const probeRoot = await parseRoot(wasmFile, probeSource);
  const sets = deriveNodeSets(probeRoot);
  const root = await parseRoot(wasmFile, source);
  const file = buildFileUnit(root, sets, `fixture.${language}`, language);
  const ctx = {
    language,
    capabilities: new Set<string>(),
    threshold: (name: "memberCount") =>
      resolveThreshold(detector.thresholds[name], { language, sampleSize: () => 0, corpusP95: () => null }),
  };
  return detector.run(file, ctx as never);
}

const TS_PROBE = `
class Shape {
  area(x: number): number {
    return x;
  }
}
`;

const GO_PROBE = `
package main

type Shape struct {
	Name string
}

func (s *Shape) Area() int {
	return 0
}
`;

/** `n` métodos triviales dentro de una única clase. */
function manyMethodsClass(n: number, className: string): string {
  const methods = Array.from({ length: n }, (_, i) => `  m${i}(): number {\n    return ${i};\n  }`).join("\n");
  return `class ${className} {\n${methods}\n}\n`;
}

const RUBY_PROBE = `
class Shape
  def area(x)
    x
  end
end
`;

/** Equivalente Ruby de `manyMethodsClass`: `n` métodos triviales dentro de una única clase. */
function manyMethodsClassRuby(n: number, className: string): string {
  const methods = Array.from({ length: n }, (_, i) => `  def m${i}\n    ${i}\n  end`).join("\n");
  return `class ${className}\n${methods}\nend\n`;
}

const JAVA_PROBE = `
class Shape {
  int area(int x) {
    return x;
  }
}
`;

/** Equivalente Java de `manyMethodsClass`: `n` métodos triviales dentro de una única clase. */
function manyMethodsClassJava(n: number, className: string): string {
  const methods = Array.from({ length: n }, (_, i) => `  int m${i}() {\n    return ${i};\n  }`).join("\n");
  return `class ${className} {\n${methods}\n}\n`;
}

describe("large-class", () => {
  it("una clase con métodos por encima del umbral (Lanza & Marinescu WMC, piso 47) es un hallazgo", async () => {
    const source = manyMethodsClass(50, "Overloaded");
    const findings = await run("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("Overloaded");
    expect(findings[0]!.trigger[0]!.value).toBe(50);
  });

  it("control negativo: una clase con pocos métodos, muy por debajo del umbral, no dispara", async () => {
    const source = manyMethodsClass(3, "Small");
    const findings = await run("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript");
    expect(findings).toHaveLength(0);
  });

  it("agrupa por clase: dos clases pequeñas en el mismo archivo no se suman entre sí (ninguna clave de agrupación es un centinela compartido)", async () => {
    const source = `${manyMethodsClass(3, "A")}\n${manyMethodsClass(3, "B")}`;
    const findings = await run("tree-sitter-typescript.wasm", TS_PROBE, source, "typescript");
    expect(findings).toHaveLength(0);
  });

  it("ruby: una clase con métodos por encima del umbral también dispara — segundo lenguaje real (junto a typescript)", async () => {
    const source = manyMethodsClassRuby(50, "Overloaded");
    const findings = await run("tree-sitter-ruby.wasm", RUBY_PROBE, source, "ruby");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("Overloaded");
    expect(findings[0]!.trigger[0]!.value).toBe(50);
  });

  it("java: una clase con métodos por encima del umbral también dispara — tercer lenguaje real, cierra el criterio de salida de F1 (≥3 lenguajes)", async () => {
    const source = manyMethodsClassJava(50, "Overloaded");
    const findings = await run("tree-sitter-java.wasm", JAVA_PROBE, source, "java");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.symbol).toBe("Overloaded");
    expect(findings[0]!.trigger[0]!.value).toBe(50);
  });

  // ROOT-CAUSE FIX (`code-grammar.ts#GO_TYPE_SPEC_WORD`): `classNodes` no
  // deriva más vacío para Go — `type_spec` entra vía un fallback de
  // vocabulario (ver ese módulo). Lo que sigue siendo cierto, y es lo que
  // este test en verdad ejercita: un método de Go (`method_declaration`,
  // asociado por RECEPTOR, no por anidamiento léxico) nunca cuelga DENTRO
  // del `type_spec` de su receptor en el árbol — declarado también en
  // `graph/symbols.ts`'s "DECLARED GAP 1" — así que `classStack` (armado acá
  // igual que `code-analyzer.ts#walkFile`, empujado sólo mientras se recorre
  // DENTRO del subárbol de un nodo `classNodes`) siempre está vacío cuando el
  // walker llega a un método de paquete de nivel superior, y `metrics.
  // className` sigue siendo `null` para los 60 métodos de este test.
  it("no aplicable sin unidad-tipo-clase — Go YA la tiene (`type_spec`, root-cause fix), pero un método no cuelga de ella (asociación por receptor, no anidamiento léxico): sigue en 0 hallazgos", async () => {
    const probeRoot = await parseRoot("tree-sitter-go.wasm", GO_PROBE);
    const sets = deriveNodeSets(probeRoot, ["type_declaration"]);
    expect(sets.classNodes.has("type_spec")).toBe(true);

    // Aun con MUCHOS métodos "de paquete" (mismo receiver): `metrics.
    // className` es SIEMPRE null para Go (el struct SÍ es class-like ahora,
    // pero sus métodos no están lexicamente adentro), así que ninguno
    // participa de la agrupación por clase de este detector.
    const manyGoFuncs = Array.from({ length: 60 }, (_, i) => `func (s *Shape) M${i}() int {\n\treturn ${i}\n}`).join("\n\n");
    const source = `package main\n\ntype Shape struct {\n\tName string\n}\n\n${manyGoFuncs}\n`;
    const findings = await run("tree-sitter-go.wasm", GO_PROBE, source, "go");
    expect(findings).toHaveLength(0);
  });
});
