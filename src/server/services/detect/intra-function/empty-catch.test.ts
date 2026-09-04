import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { deriveNodeSets, type DerivedNodeSets, type ProbeNode } from "../../code-grammar.js";
import { detector } from "./empty-catch.js";
import type { AstNode, FunctionMetrics, FunctionUnit } from "../types.js";

const require = createRequire(import.meta.url);

/* ────────────────────────────────────────────────────────────────────────
 * Infra de parseo mínima — mismo patrón que `pattern-behavioral.test.ts` /
 * `code-grammar.test.ts`: web-tree-sitter real, nada simulado.
 * ──────────────────────────────────────────────────────────────────────── */
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

/** Primer nodo cuyo tipo está en `sets.functionNodes`, envuelto como `FunctionUnit` — alcanza para un fixture de una sola función. */
function firstFunctionUnit(root: ProbeNode, sets: DerivedNodeSets, file: string, language: string): FunctionUnit {
  let found: ProbeNode | null = null;
  const visit = (node: ProbeNode): void => {
    if (found) return;
    if (node.isNamed && sets.functionNodes.has(node.type)) {
      found = node;
      return;
    }
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) visit(child);
    }
  };
  visit(root);
  if (!found) throw new Error(`fixture sin ningún nodo función (${language})`);
  const node = found as AstNode;
  const name = (node.childForFieldName("name") as AstNode | null)?.text ?? null;
  return {
    file,
    language,
    name,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    symbolPath: name ? [name] : [],
    node,
    sets,
    metrics: FAKE_METRICS,
  };
}

/** El runner real resuelve el Threshold; para un test directo del detector alcanza con invocar `resolveThreshold` una vez. */
async function run(wasmFile: string, probeSource: string, source: string, language: string): Promise<ReturnType<typeof detector.run>> {
  const probeRoot = await parseRoot(wasmFile, probeSource);
  const sets = deriveNodeSets(probeRoot);
  const root = await parseRoot(wasmFile, source);
  const fn = firstFunctionUnit(root, sets, `fixture.${language}`, language);
  const { resolveThreshold } = await import("../thresholds.js");
  const ctx = {
    language,
    capabilities: new Set<string>(),
    threshold: (name: "presence") =>
      resolveThreshold(detector.thresholds[name], {
        language,
        sampleSize: () => 0,
        corpusP95: () => null,
      }),
  };
  return detector.run(fn, ctx as never);
}

const RUBY_PROBE = `
def f(x)
  begin
    go
  rescue => e
    handle(e)
  end
end
`;

const JS_PROBE = `
function f() {
  try {
    go();
  } catch (e) {
    handle(e);
  }
}
`;

const PYTHON_PROBE = `
def f():
    try:
        go()
    except Exception as e:
        handle(e)
`;

const JAVA_PROBE = `
public class Shape {
  public void f() {
    try {
      go();
    } catch (Exception e) {
      handle(e);
    }
  }
}
`;

describe("empty-catch", () => {
  it("ruby: rescue sin cuerpo (`rescue => e; end`) es un hallazgo", async () => {
    const source = `
def risky
  begin
    go
  rescue => e
  end
end
`;
    const findings = await run("tree-sitter-ruby.wasm", RUBY_PROBE, source, "ruby");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.role).toBe("manejador de excepción vacío");
  });

  it("ruby control negativo: rescue que SÍ maneja la excepción no dispara nada", async () => {
    const findings = await run("tree-sitter-ruby.wasm", RUBY_PROBE, RUBY_PROBE, "ruby");
    expect(findings).toHaveLength(0);
  });

  it("BUG DE IMPLEMENTACIÓN ARREGLADO — ruby: `rescue` con SÓLO un comentario documentando la decisión NO dispara (caso real: `config_loader_resolver.rb:307` en `rubocop`, corpus externo)", async () => {
    // Antes del arreglo, `isEmptyHandler` asumía "vacío" para CUALQUIER
    // rescue de Ruby cuyo campo `body` no resolviera — y un comentario suelto
    // (sin sentencias) tampoco hace resolver `body`: es hermano del campo,
    // nunca hijo de él (confirmado por sonda directa,
    // `scratchpad/precision-front/probe-ruby-rescue-field.mjs`). El AST no
    // distinguía "vacío de verdad" de "documentado con un comentario".
    const source = `
def risky
  begin
    go
  rescue => e
    # se ignora a propósito: el fallo ya se registró más arriba
  end
end
`;
    const findings = await run("tree-sitter-ruby.wasm", RUBY_PROBE, source, "ruby");
    expect(findings).toHaveLength(0);
  });

  it("BUG DE IMPLEMENTACIÓN ARREGLADO — ruby: `rescue` SIN variable ligada ni tipo, con SÓLO un comentario, tampoco dispara (mismo mecanismo, forma más despojada)", async () => {
    const source = `
def risky
  begin
    go
  rescue
    # bare rescue, documentado
  end
end
`;
    const findings = await run("tree-sitter-ruby.wasm", RUBY_PROBE, source, "ruby");
    expect(findings).toHaveLength(0);
  });

  it("ruby control: `rescue` con MÚLTIPLES tipos de excepción y SÓLO un comentario tampoco dispara — confirma que el chequeo de campos declarativos no se rompe con `exceptions` de aridad >1", async () => {
    const source = `
def risky
  begin
    go
  rescue TypeA, TypeB => e
    # ambos tipos son variantes del mismo fallo externo, se ignoran
  end
end
`;
    const findings = await run("tree-sitter-ruby.wasm", RUBY_PROBE, source, "ruby");
    expect(findings).toHaveLength(0);
  });

  it("ruby control: `rescue` REALMENTE vacío con variable ligada (sin comentario) SIGUE disparando — el arreglo no tapa el caso real", async () => {
    const source = `
def risky
  begin
    go
  rescue => e
  end
end
`;
    const findings = await run("tree-sitter-ruby.wasm", RUBY_PROBE, source, "ruby");
    expect(findings).toHaveLength(1);
  });

  it("javascript: catch (e) {} vacío es un hallazgo", async () => {
    const source = `
function risky() {
  try {
    go();
  } catch (e) {}
}
`;
    const findings = await run("tree-sitter-javascript.wasm", JS_PROBE, source, "javascript");
    expect(findings).toHaveLength(1);
  });

  it("javascript control negativo: catch que maneja la excepción no dispara nada", async () => {
    const findings = await run("tree-sitter-javascript.wasm", JS_PROBE, JS_PROBE, "javascript");
    expect(findings).toHaveLength(0);
  });

  it("python: gap declarado — `except_clause` no resuelve NINGÚN campo (confirmado por sonda), así que ni el `except` con contenido real ni el `except: pass` disparan", async () => {
    // Ver el docstring de empty-catch.ts: Python queda explícitamente SIN
    // detección bajo esta regla (no una adivinanza que a veces acierta) —
    // este test documenta esa ausencia con un caso que TIENE contenido real
    // y confirma que, correctamente, tampoco se lo confunde con "vacío".
    const source = `
def risky():
    try:
        go()
    except Exception:
        1 + 1
`;
    const findings = await run("tree-sitter-python.wasm", PYTHON_PROBE, source, "python");
    expect(findings).toHaveLength(0);
  });

  it("java: catch (Exception e) {} vacío es un hallazgo — tercer lenguaje real que dispara (junto a ruby/javascript), cierra el criterio de salida de F1 (≥3 lenguajes)", async () => {
    const source = `
public class Shape {
  public void risky() {
    try {
      go();
    } catch (Exception e) {
    }
  }
}
`;
    const findings = await run("tree-sitter-java.wasm", JAVA_PROBE, source, "java");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.locations[0]!.role).toBe("manejador de excepción vacío");
  });

  it("java control negativo: catch que maneja la excepción no dispara nada", async () => {
    const findings = await run("tree-sitter-java.wasm", JAVA_PROBE, JAVA_PROBE, "java");
    expect(findings).toHaveLength(0);
  });

  /* ── Ola O / N10 — "código que no es producto" ───────────────────────── */

  it("N10: el manejador vacío de un método de ARNÉS no es un hallazgo (forma real de guava-testlib)", async () => {
    // Forma copiada de `corpus/guava/guava-testlib/src/com/google/common/
    // collect/testing/testers/MapRemoveTester.java`: alcanzar el catch ES la
    // aserción del arnés, no un error tragado.
    const source = `
class MapRemoveTester {
  public void testRemove_wrongType() {
    try {
      getMap().remove(WrongType.VALUE);
    } catch (ClassCastException tolerated) {
    }
  }
}
`;
    expect(await run("tree-sitter-java.wasm", JAVA_PROBE, source, "java")).toHaveLength(0);
  });

  it("N10 control negativo: el MISMO cuerpo en un método que ningún runner descubre SÍ dispara", async () => {
    // Una sola letra de diferencia con el caso de arriba: `tester` no es el
    // token `test`. Es el control que separa el criterio estructural de un
    // prefijo de nombre a secas.
    const source = `
class MapRemoveTester {
  public void tester() {
    try {
      getMap().remove(WrongType.VALUE);
    } catch (ClassCastException tolerated) {
    }
  }
}
`;
    expect(await run("tree-sitter-java.wasm", JAVA_PROBE, source, "java")).toHaveLength(1);
  });

  it("no aplicable sin excepciones: go no tiene ningún nodo de manejo de excepciones (usa `if err != nil`) — 0 hallazgos aunque el detector corriera igual", async () => {
    // El gate real (`needs: ["excepciones"]`, evaluado por el runner) es lo
    // que impide correr este detector sobre Go en producción. Esta prueba
    // confirma la otra mitad de la regla G3: aun si se lo forzara a correr,
    // Go no tiene NINGÚN nodo en `exceptionNodes` — no hay nada que
    // clasificar mal, `needs` describe una ausencia real del lenguaje, no
    // un defecto del extractor.
    const goSource = `
package main

func risky() error {
	v, err := attempt()
	if err != nil {
	}
	return err
}
`;
    const probeRoot = await parseRoot("tree-sitter-go.wasm", goSource);
    const sets = deriveNodeSets(probeRoot, ["type_declaration"]);
    expect(sets.exceptionNodes.size).toBe(0);
  });
});
