/**
 * `invocacion-indirecta.ts` — CONTRATO-F9.md §3.3 formas 3(a) y 4, dos
 * estilos de test distintos a propósito (ver el docstring del módulo):
 *   - Forma 3(a)/la correlación de Forma 4: fabricado a mano, sin AST —
 *     mismo estilo `satisfies-derive.test.ts`, porque esa mitad es
 *     post-grafo.
 *   - `extractIterationCallFacts` (Forma 4, la mitad AST): gramáticas REALES
 *     (`web-tree-sitter` + `tree-sitter-wasms`) — mismo motivo que
 *     `portador.test.ts`/`references.test.ts`: este extractor entero es una
 *     función de NOMBRES DE CAMPO de la gramática, un árbol fabricado a mano
 *     no probaría nada.
 */
import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { deriveNodeSets, type ProbeNode } from "../../code-grammar.js";
import {
  deriveInvokesIndirectEdges,
  extractIterationCallFacts,
  extractReceiverFacts,
  type FileReferences,
  type IterationLoopFact,
  type ReceiverFact,
} from "./invocacion-indirecta.js";
import { portadorCarrierId } from "./portador.js";
import type { CodeGraphEdge, CodeGraphNode } from "../types.js";
import type { ReferenceFacts } from "../references.js";

function classNode(id: string): CodeGraphNode {
  return { id, kind: "symbol", file: "a.ts", symbolPath: [id.split("#")[1]!], family: "class-like" };
}
function methodNode(id: string, name: string): CodeGraphNode {
  return { id, kind: "symbol", file: "a.ts", symbolPath: [name], family: "function-like" };
}
function contains(from: string, to: string): CodeGraphEdge {
  return { from, to, kind: "contains", provenance: "declared", weight: 1 };
}
function selfCallRef(name: string, scope: readonly string[], qualifier = "self"): ReferenceFacts {
  return { name, role: "receiver-member", scope, qualifier, qualifierIsBareConstant: false, shadowedLocally: false, line: 1, column: 1, occurrences: 1, isCallee: true };
}

describe("deriveInvokesIndirectEdges", () => {
  it("self.foo() donde `foo` NO es un método declarado ⇒ invokes-indirect al portador `foo` de la clase", () => {
    const nodes = [classNode("sym:a#Widget"), methodNode("sym:a#Widget.render", "render")];
    const containsEdges = [contains("sym:a#Widget", "sym:a#Widget.render")];
    const files: FileReferences[] = [{ path: "a", references: [selfCallRef("onChange", ["Widget", "render"])] }];

    const result = deriveInvokesIndirectEdges(nodes, containsEdges, files);
    const carrierId = portadorCarrierId("a", ["Widget"], "onChange", 0);

    expect(result.nodes).toEqual([{ id: carrierId, kind: "carrier", file: "a", symbolPath: ["Widget", "onChange"], carrierForm: "field" }]);
    expect(result.edges).toEqual([{ from: "sym:a#Widget.render", to: carrierId, kind: "invokes-indirect", provenance: "inferred", weight: 1 }]);
  });

  it("self.metodoDeclarado() ⇒ nada (la cascada normal ya lo resuelve como calls, no se duplica)", () => {
    const nodes = [classNode("sym:a#Widget"), methodNode("sym:a#Widget.render", "render"), methodNode("sym:a#Widget.helper", "helper")];
    const containsEdges = [contains("sym:a#Widget", "sym:a#Widget.render"), contains("sym:a#Widget", "sym:a#Widget.helper")];
    const files: FileReferences[] = [{ path: "a", references: [selfCallRef("helper", ["Widget", "render"])] }];

    expect(deriveInvokesIndirectEdges(nodes, containsEdges, files)).toEqual({ nodes: [], edges: [] });
  });

  it("qualifier que no es self/this ⇒ nada (Go no tiene la palabra reservada, brecha declarada)", () => {
    const nodes = [classNode("sym:a#Widget"), methodNode("sym:a#Widget.render", "render")];
    const files: FileReferences[] = [{ path: "a", references: [selfCallRef("onChange", ["Widget", "render"], "w")] }];
    expect(deriveInvokesIndirectEdges(nodes, [], files)).toEqual({ nodes: [], edges: [] });
  });

  it("isCallee false (es un valor, no un sitio de llamada) ⇒ nada — eso es forma 1/5, carries-derive.ts", () => {
    const nodes = [classNode("sym:a#Widget"), methodNode("sym:a#Widget.render", "render")];
    const files: FileReferences[] = [{ path: "a", references: [{ ...selfCallRef("onChange", ["Widget", "render"]), isCallee: false }] }];
    expect(deriveInvokesIndirectEdges(nodes, [], files)).toEqual({ nodes: [], edges: [] });
  });

  it("dos sitios que llaman self.onChange() en el mismo método funden weight, un solo nodo carrier", () => {
    const nodes = [classNode("sym:a#Widget"), methodNode("sym:a#Widget.render", "render")];
    const files: FileReferences[] = [{ path: "a", references: [selfCallRef("onChange", ["Widget", "render"]), selfCallRef("onChange", ["Widget", "render"])] }];
    const result = deriveInvokesIndirectEdges(nodes, [], files);
    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toEqual([{ from: "sym:a#Widget.render", to: result.nodes[0]!.id, kind: "invokes-indirect", provenance: "inferred", weight: 2 }]);
  });

  it("dos MÉTODOS distintos llamando self.onChange() convergen en el MISMO portador (fan-in — lo que Observer necesita)", () => {
    const nodes = [classNode("sym:a#Widget"), methodNode("sym:a#Widget.render", "render"), methodNode("sym:a#Widget.mount", "mount")];
    const files: FileReferences[] = [{ path: "a", references: [selfCallRef("onChange", ["Widget", "render"]), selfCallRef("onChange", ["Widget", "mount"])] }];
    const result = deriveInvokesIndirectEdges(nodes, [], files);
    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(2);
    expect(new Set(result.edges.map((e) => e.to))).toEqual(new Set([result.nodes[0]!.id]));
  });

  it("HALLAZGO MEDIDO EN click REAL: self.metodoHeredado() (declarado en la SUPERCLASE, no en ésta) NO es invokes-indirect — la cascada normal ya lo resuelve subiendo `extends`", () => {
    const nodes = [classNode("sym:a#Base"), methodNode("sym:a#Base.fail", "fail"), classNode("sym:a#Derived")];
    const containsEdges = [contains("sym:a#Base", "sym:a#Base.fail")];
    const inheritanceEdges: CodeGraphEdge[] = [{ from: "sym:a#Derived", to: "sym:a#Base", kind: "extends", provenance: "declared", weight: 1 }];
    const files: FileReferences[] = [{ path: "a", references: [selfCallRef("fail", ["Derived", "convert"])] }];
    // "convert" no tiene nodo propio (no hace falta: sólo se usa para armar el scope), pero classPath se recalcula igual a ["Derived"].
    expect(deriveInvokesIndirectEdges(nodes, containsEdges, files, inheritanceEdges)).toEqual({ nodes: [], edges: [] });
  });

  it("cadena de herencia de 2 niveles (Derived -> Mid -> Base) también resuelve el miembro heredado", () => {
    const nodes = [classNode("sym:a#Base"), methodNode("sym:a#Base.fail", "fail"), classNode("sym:a#Mid"), classNode("sym:a#Derived")];
    const containsEdges = [contains("sym:a#Base", "sym:a#Base.fail")];
    const inheritanceEdges: CodeGraphEdge[] = [
      { from: "sym:a#Derived", to: "sym:a#Mid", kind: "extends", provenance: "declared", weight: 1 },
      { from: "sym:a#Mid", to: "sym:a#Base", kind: "extends", provenance: "declared", weight: 1 },
    ];
    const files: FileReferences[] = [{ path: "a", references: [selfCallRef("fail", ["Derived", "convert"])] }];
    expect(deriveInvokesIndirectEdges(nodes, containsEdges, files, inheritanceEdges)).toEqual({ nodes: [], edges: [] });
  });

  it("sin inheritanceEdges (parámetro por defecto, callers viejos) sigue funcionando — sólo pierde la resolución de heredados", () => {
    const nodes = [classNode("sym:a#Widget"), methodNode("sym:a#Widget.render", "render")];
    const files: FileReferences[] = [{ path: "a", references: [selfCallRef("onChange", ["Widget", "render"])] }];
    const result = deriveInvokesIndirectEdges(nodes, [], files);
    expect(result.edges).toHaveLength(1);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * GENERALIZACIÓN DEL RECEPTOR (Go) — `ReceiverFact`, la mitad post-grafo
 * (fabricada a mano, mismo estilo que el describe de arriba: esta mitad NO
 * lee AST). `classNodes` vacío para Go (ver el docstring del módulo) ⇒
 * estos casos NUNCA pasan por `classNode`/`contains` — a propósito, ni un
 * solo `CodeGraphNode` de familia "class-like" aparece en `nodes` acá.
 * ──────────────────────────────────────────────────────────────────────── */

function receiverFact(over: Partial<ReceiverFact>): ReceiverFact {
  return { functionScope: ["Handle"], receiverName: "s", receiverTypeName: "Server", ...over };
}

describe("deriveInvokesIndirectEdges — GENERALIZACIÓN DEL RECEPTOR (Go)", () => {
  it("func (s *Server) Handle() { s.onChange() } donde `onChange` NO es un método declarado ⇒ invokes-indirect al portador `onChange` de Server — SIN ningún nodo class-like en `nodes`", () => {
    const nodes = [methodNode("sym:a#Handle", "Handle")]; // Go: ni un símbolo "Server" class-like, ni un `contains` — ver el docstring del módulo.
    const files: FileReferences[] = [{ path: "a", references: [selfCallRef("onChange", ["Handle"], "s")], receivers: [receiverFact({})] }];

    const result = deriveInvokesIndirectEdges(nodes, [], files);
    const carrierId = portadorCarrierId("a", ["Server"], "onChange", 0);

    expect(result.nodes).toEqual([{ id: carrierId, kind: "carrier", file: "a", symbolPath: ["Server", "onChange"], carrierForm: "field" }]);
    expect(result.edges).toEqual([{ from: "sym:a#Handle", to: carrierId, kind: "invokes-indirect", provenance: "inferred", weight: 1 }]);
  });

  it("func (s *Server) Handle() { s.log() } donde `log` SÍ es un método declarado con receptor Server (en OTRO archivo) ⇒ nada — no duplica lo que ya es un método real", () => {
    const nodes = [methodNode("sym:a#Handle", "Handle"), methodNode("sym:b#log", "log")];
    const files: FileReferences[] = [
      { path: "a", references: [selfCallRef("log", ["Handle"], "s")], receivers: [receiverFact({})] },
      { path: "b", references: [], receivers: [receiverFact({ functionScope: ["log"], receiverName: "s" })] }, // `log` declarado con receptor Server, en b.go.
    ];
    expect(deriveInvokesIndirectEdges(nodes, [], files)).toEqual({ nodes: [], edges: [] });
  });

  it("dos structs DISTINTOS reusando la MISMA convención de nombre de receptor (`s`) no colisionan — el portador se ancla al TIPO, no al nombre del receptor", () => {
    const nodes = [methodNode("sym:a#Handle", "Handle"), methodNode("sym:a#Run", "Run")];
    const files: FileReferences[] = [
      {
        path: "a",
        references: [selfCallRef("onChange", ["Handle"], "s"), selfCallRef("onStart", ["Run"], "s")],
        receivers: [receiverFact({ functionScope: ["Handle"], receiverTypeName: "Server" }), receiverFact({ functionScope: ["Run"], receiverTypeName: "Client" })],
      },
    ];
    const result = deriveInvokesIndirectEdges(nodes, [], files);
    expect(result.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ symbolPath: ["Server", "onChange"] }),
        expect.objectContaining({ symbolPath: ["Client", "onStart"] }),
      ]),
    );
    expect(result.nodes).toHaveLength(2); // portadores DISTINTOS — nunca fundidos por compartir el nombre de receptor `s`.
  });

  it("qualifier que NO es el receptor declarado de ESTA función (otro parámetro cualquiera) ⇒ nada", () => {
    const nodes = [methodNode("sym:a#Handle", "Handle")];
    const files: FileReferences[] = [{ path: "a", references: [selfCallRef("onChange", ["Handle"], "other")], receivers: [receiverFact({})] }];
    expect(deriveInvokesIndirectEdges(nodes, [], files)).toEqual({ nodes: [], edges: [] });
  });

  it("sin `receivers` (archivo/lenguaje sin campo `receiver` propio) ⇒ esta rama no aporta nada, nunca rompe — mismo principio aditivo que `loops`", () => {
    const nodes = [methodNode("sym:a#Handle", "Handle")];
    const files: FileReferences[] = [{ path: "a", references: [selfCallRef("onChange", ["Handle"], "s")] }];
    expect(deriveInvokesIndirectEdges(nodes, [], files)).toEqual({ nodes: [], edges: [] });
  });

  it("dos sitios de llamada en el MISMO método funden weight en un solo portador", () => {
    const nodes = [methodNode("sym:a#Handle", "Handle")];
    const files: FileReferences[] = [
      { path: "a", references: [selfCallRef("onChange", ["Handle"], "s"), selfCallRef("onChange", ["Handle"], "s")], receivers: [receiverFact({})] },
    ];
    const result = deriveInvokesIndirectEdges(nodes, [], files);
    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toEqual([{ from: "sym:a#Handle", to: result.nodes[0]!.id, kind: "invokes-indirect", provenance: "inferred", weight: 2 }]);
  });

  it("dos MÉTODOS del MISMO struct (receptores `s`/`l` distintos, mismo tipo) convergen en el MISMO portador — fan-in real de Observer, generalizado al receptor explícito", () => {
    const nodes = [methodNode("sym:a#Handle", "Handle"), methodNode("sym:a#Log", "Log")];
    const files: FileReferences[] = [
      {
        path: "a",
        references: [selfCallRef("onChange", ["Handle"], "s"), selfCallRef("onChange", ["Log"], "l")],
        receivers: [receiverFact({ functionScope: ["Handle"], receiverName: "s" }), receiverFact({ functionScope: ["Log"], receiverName: "l" })],
      },
    ];
    const result = deriveInvokesIndirectEdges(nodes, [], files);
    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(2);
    expect(new Set(result.edges.map((e) => e.to))).toEqual(new Set([result.nodes[0]!.id]));
  });

  it("COLISIÓN MEDIDA (hugo real, resources/resource.go): dos métodos DISTINTOS con el MISMO nombre y receptores de TIPOS distintos en el mismo archivo (`container: []` los aplana al mismo `functionScope`) ⇒ clave ambigua, NO se adivina ningún receptor — un parámetro ordinario que casualmente se llama igual que el receptor de la OTRA función homónima NO dispara nada", () => {
    const nodes = [methodNode("sym:a#init@1", "init"), methodNode("sym:a#init@2", "init")];
    const files: FileReferences[] = [
      {
        path: "a",
        // `(fd *ResourceSourceDescriptor) init(r *Spec)`: `r` es un PARÁMETRO ordinario, llama `r.MediaTypes()` — NUNCA su propio receptor.
        // `(r *resourceHash) init(...)`: acá SÍ `r` es el receptor — misma `functionScope` aplanada ["init"], nombre de receptor COINCIDENTE por casualidad.
        references: [selfCallRef("MediaTypes", ["init"], "r")],
        receivers: [receiverFact({ functionScope: ["init"], receiverName: "fd", receiverTypeName: "ResourceSourceDescriptor" }), receiverFact({ functionScope: ["init"], receiverName: "r", receiverTypeName: "resourceHash" })],
      },
    ];
    expect(deriveInvokesIndirectEdges(nodes, [], files)).toEqual({ nodes: [], edges: [] });
  });

  it("misma clave de scope con el MISMO receptor repetido (dos `ReceiverFact` idénticos) NO se marca ambigua — sigue resolviendo normal", () => {
    const nodes = [methodNode("sym:a#Handle", "Handle")];
    const files: FileReferences[] = [
      {
        path: "a",
        references: [selfCallRef("onChange", ["Handle"], "s")],
        receivers: [receiverFact({}), receiverFact({})], // idénticos a propósito — no es una colisión real.
      },
    ];
    const result = deriveInvokesIndirectEdges(nodes, [], files);
    expect(result.edges).toHaveLength(1);
  });

  it("self/this (Forma 3a original) y receptor explícito (Go) conviven sin interferir en el MISMO archivo", () => {
    const nodes = [classNode("sym:a#Widget"), methodNode("sym:a#Widget.render", "render"), methodNode("sym:a#Handle", "Handle")];
    const containsEdges = [contains("sym:a#Widget", "sym:a#Widget.render")];
    const files: FileReferences[] = [
      {
        path: "a",
        references: [selfCallRef("onChange", ["Widget", "render"]), selfCallRef("onStart", ["Handle"], "s")],
        receivers: [receiverFact({ functionScope: ["Handle"] })],
      },
    ];
    const result = deriveInvokesIndirectEdges(nodes, containsEdges, files);
    expect(result.edges).toHaveLength(2);
    const carrierWidget = portadorCarrierId("a", ["Widget"], "onChange", 0);
    const carrierServer = portadorCarrierId("a", ["Server"], "onStart", 0);
    expect(new Set(result.nodes.map((n) => n.id))).toEqual(new Set([carrierWidget, carrierServer]));
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * FORMA 4 — la correlación post-grafo (`loops` fabricado a mano, sin AST).
 * ──────────────────────────────────────────────────────────────────────── */

function loopFact(over: Partial<IterationLoopFact>): IterationLoopFact {
  return {
    containerPath: ["Widget", "notify"],
    classPath: ["Widget"],
    loopVarName: "o",
    bodyStartLine: 1,
    bodyEndLine: 10,
    collection: { ownerIsEnclosingClass: true, name: "observers" },
    ...over,
  };
}
function elementCallRef(varName: string, line: number, scope: readonly string[] = ["Widget", "notify"]): ReferenceFacts {
  return { name: "update", role: "receiver-member", scope, qualifier: varName, qualifierIsBareConstant: false, shadowedLocally: false, line, column: 1, occurrences: 1, isCallee: true };
}

describe("deriveInvokesIndirectEdges — Forma 4 (recorrido de colección)", () => {
  it("for (const o of this.observers) { o.update() } ⇒ invokes-indirect al portador `observers` de la clase", () => {
    const nodes = [classNode("sym:a#Widget"), methodNode("sym:a#Widget.notify", "notify")];
    const files: FileReferences[] = [{ path: "a", references: [elementCallRef("o", 3)], loops: [loopFact({})] }];

    const result = deriveInvokesIndirectEdges(nodes, [], files);
    const carrierId = portadorCarrierId("a", ["Widget"], "observers", 0);

    expect(result.nodes).toEqual([{ id: carrierId, kind: "carrier", file: "a", symbolPath: ["Widget", "observers"], carrierForm: "field" }]);
    expect(result.edges).toEqual([{ from: "sym:a#Widget.notify", to: carrierId, kind: "invokes-indirect", provenance: "inferred", weight: 1 }]);
  });

  it("converge con el MISMO portador que la Forma 3a produciría para self.observers (fan-in real de Observer)", () => {
    const nodes = [classNode("sym:a#Widget"), methodNode("sym:a#Widget.notify", "notify"), methodNode("sym:a#Widget.mount", "mount")];
    const files: FileReferences[] = [
      { path: "a", references: [selfCallRef("observers", ["Widget", "mount"])], loops: [] }, // self.observers() en OTRO método — Forma 3a, mismo id
      { path: "a", references: [elementCallRef("o", 3)], loops: [loopFact({})] },
    ];
    const result = deriveInvokesIndirectEdges(nodes, [], files);
    const carrierIds = new Set(result.nodes.filter((n) => n.kind === "carrier").map((n) => n.id));
    expect(carrierIds.size).toBe(1); // un solo portador `observers` de Widget, alimentado por las dos formas.
    expect(result.edges).toHaveLength(2);
  });

  it("colección BARE (variable/parámetro local, no self/this) ⇒ portador `local`, scope de la función", () => {
    const nodes = [classNode("sym:a#Widget"), methodNode("sym:a#Widget.notify", "notify")];
    const loop = loopFact({ classPath: null, collection: { ownerIsEnclosingClass: false, name: "handlers" } });
    const files: FileReferences[] = [{ path: "a", references: [elementCallRef("o", 3)], loops: [loop] }];

    const result = deriveInvokesIndirectEdges(nodes, [], files);
    const carrierId = portadorCarrierId("a", ["Widget", "notify"], "handlers", 0);
    expect(result.nodes).toEqual([{ id: carrierId, kind: "carrier", file: "a", symbolPath: ["Widget", "notify", "handlers"], carrierForm: "local" }]);
  });

  it("colección `null` (brecha declarada: acceso anidado/llamada, p.ej. self.getObservers()) ⇒ nada", () => {
    const nodes = [classNode("sym:a#Widget"), methodNode("sym:a#Widget.notify", "notify")];
    const files: FileReferences[] = [{ path: "a", references: [elementCallRef("o", 3)], loops: [loopFact({ collection: null })] }];
    expect(deriveInvokesIndirectEdges(nodes, [], files)).toEqual({ nodes: [], edges: [] });
  });

  it("llamada FUERA del rango de línea del cuerpo del bucle ⇒ no cuenta (mismo nombre de variable, otro sitio)", () => {
    const nodes = [classNode("sym:a#Widget"), methodNode("sym:a#Widget.notify", "notify")];
    const loop = loopFact({ bodyStartLine: 5, bodyEndLine: 8 });
    const files: FileReferences[] = [{ path: "a", references: [elementCallRef("o", 20)], loops: [loop] }];
    expect(deriveInvokesIndirectEdges(nodes, [], files)).toEqual({ nodes: [], edges: [] });
  });

  it("qualifier que no es la variable de bucle ⇒ no cuenta", () => {
    const nodes = [classNode("sym:a#Widget"), methodNode("sym:a#Widget.notify", "notify")];
    const files: FileReferences[] = [{ path: "a", references: [elementCallRef("otraVariable", 3)], loops: [loopFact({})] }];
    expect(deriveInvokesIndirectEdges(nodes, [], files)).toEqual({ nodes: [], edges: [] });
  });

  it("scope distinto al containerPath del bucle (otro método, mismo nombre de variable) ⇒ no cuenta", () => {
    const nodes = [classNode("sym:a#Widget"), methodNode("sym:a#Widget.notify", "notify"), methodNode("sym:a#Widget.other", "other")];
    const files: FileReferences[] = [{ path: "a", references: [elementCallRef("o", 3, ["Widget", "other"])], loops: [loopFact({})] }];
    expect(deriveInvokesIndirectEdges(nodes, [], files)).toEqual({ nodes: [], edges: [] });
  });

  it("dos elementos invocados dentro del MISMO bucle funden weight en una sola arista", () => {
    const nodes = [classNode("sym:a#Widget"), methodNode("sym:a#Widget.notify", "notify")];
    const files: FileReferences[] = [{ path: "a", references: [elementCallRef("o", 3), elementCallRef("o", 4)], loops: [loopFact({})] }];
    const result = deriveInvokesIndirectEdges(nodes, [], files);
    expect(result.edges).toEqual([{ from: "sym:a#Widget.notify", to: result.nodes[0]!.id, kind: "invokes-indirect", provenance: "inferred", weight: 2 }]);
  });

  it("`loops` ausente (FileReferences/GraphFileFacts de antes de esta ola) ⇒ Forma 4 simplemente no aporta nada, sin romper", () => {
    const nodes = [classNode("sym:a#Widget"), methodNode("sym:a#Widget.notify", "notify")];
    const files: FileReferences[] = [{ path: "a", references: [elementCallRef("o", 3)] }];
    expect(deriveInvokesIndirectEdges(nodes, [], files)).toEqual({ nodes: [], edges: [] });
  });

  it("self/this-qualificada sin classPath (función suelta, sin clase envolvente) ⇒ brecha declarada, no ancla", () => {
    const nodes = [methodNode("sym:a#notify", "notify")];
    const loop = loopFact({ containerPath: ["notify"], classPath: null });
    const files: FileReferences[] = [{ path: "a", references: [elementCallRef("o", 3, ["notify"])], loops: [loop] }];
    expect(deriveInvokesIndirectEdges(nodes, [], files)).toEqual({ nodes: [], edges: [] });
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * `extractIterationCallFacts` — la mitad AST de la Forma 4, sobre gramáticas
 * REALES (mismo motivo que `portador.test.ts`: es una función de nombres de
 * campo de la gramática).
 * ──────────────────────────────────────────────────────────────────────── */

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
/**
 * Sondas representativas por lenguaje — mismo principio que
 * `portador.test.ts#SETS_PROBE`: `deriveNodeSets` necesita ver al menos una
 * forma completa de función/clase para clasificar el tipo de nodo, no basta
 * el snippet de cada test (que a veces sólo tiene métodos SIN parámetros).
 */
const SETS_PROBE: Readonly<Record<string, string>> = {
  "tree-sitter-javascript.wasm": "class C { m(a) { return a; } }\nfunction f(a) { return a; }",
  "tree-sitter-python.wasm": "class C:\n    def m(self, a):\n        return a",
  "tree-sitter-ruby.wasm": "class C\n  def m(a)\n    a\n  end\nend",
  // Incluye un `method_declaration` CON receptor (no sólo la función suelta
  // de antes): sin esto, `deriveNodeSets` nunca ve ese tipo de nodo en la
  // sonda y `sets.functionNodes` no lo reconoce — ni `extractReceiverFacts`
  // (GENERALIZACIÓN DEL RECEPTOR, acá) ni `extractIterationCallFacts` (Forma
  // 4) podrían empujar el scope del método envolvente, MISMO gap que
  // `code-analyzer.ts`'s `GO_PROBE` real ya evita incluyendo `func (s
  // *Shape) Area()`.
  "tree-sitter-go.wasm": "package main\nfunc f(a int) int { return a }\nfunc (s *Shape) Area() int { return 1 }",
  "tree-sitter-java.wasm": "class C { void m(int a) { } }",
  "tree-sitter-c_sharp.wasm": "class C { void M(int a) { } }",
};
const setsCache = new Map<string, ReturnType<typeof deriveNodeSets>>();
async function setsFor(wasmFile: string) {
  const cached = setsCache.get(wasmFile);
  if (cached) return cached;
  const parser = await parserFor(wasmFile);
  const root = parser.parse(SETS_PROBE[wasmFile] ?? "").rootNode as ProbeNode;
  const sets = deriveNodeSets(root);
  setsCache.set(wasmFile, sets);
  return sets;
}
async function loopFactsFor(wasmFile: string, source: string): Promise<readonly IterationLoopFact[]> {
  const parser = await parserFor(wasmFile);
  const root = parser.parse(source).rootNode as ProbeNode;
  const sets = await setsFor(wasmFile);
  return extractIterationCallFacts(root as any, sets);
}
async function receiverFactsFor(wasmFile: string, source: string): Promise<readonly ReceiverFact[]> {
  const parser = await parserFor(wasmFile);
  const root = parser.parse(source).rootNode as ProbeNode;
  const sets = await setsFor(wasmFile);
  return extractReceiverFacts(root as any, sets);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

describe("extractIterationCallFacts — JavaScript/TypeScript (for...of, forma DIRECTA)", () => {
  it("for (const o of this.observers) { o.update(x); } dentro de un método", async () => {
    const facts = await loopFactsFor(
      "tree-sitter-javascript.wasm",
      "class Widget {\n  notify() {\n    for (const o of this.observers) {\n      o.update(x);\n    }\n  }\n}\n",
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      containerPath: ["Widget", "notify"],
      classPath: ["Widget"],
      loopVarName: "o",
      collection: { ownerIsEnclosingClass: true, name: "observers" },
    });
    expect(facts[0]!.bodyStartLine).toBeLessThanOrEqual(4);
    expect(facts[0]!.bodyEndLine).toBeGreaterThanOrEqual(4);
  });

  it("colección BARE (parámetro local, no self/this) ⇒ ownerIsEnclosingClass: false", async () => {
    const facts = await loopFactsFor("tree-sitter-javascript.wasm", "function notify(handlers) {\n  for (const h of handlers) {\n    h.run();\n  }\n}\n");
    expect(facts).toEqual([expect.objectContaining({ loopVarName: "h", collection: { ownerIsEnclosingClass: false, name: "handlers" } })]);
  });

  it("while/C-style for (sin colección) ⇒ ningún hecho — no hay variable de bucle que anclar", async () => {
    const facts = await loopFactsFor("tree-sitter-javascript.wasm", "function f() {\n  while (x < 10) { x.update(); }\n  for (let i = 0; i < 10; i++) { a[i].update(); }\n}\n");
    expect(facts).toEqual([]);
  });
});

describe("extractIterationCallFacts — Python (for...in, forma DIRECTA)", () => {
  it("for o in self.observers: o.update(x)", async () => {
    const facts = await loopFactsFor("tree-sitter-python.wasm", "class Widget:\n    def notify(self):\n        for o in self.observers:\n            o.update(x)\n");
    expect(facts).toEqual([
      expect.objectContaining({ containerPath: ["Widget", "notify"], classPath: ["Widget"], loopVarName: "o", collection: { ownerIsEnclosingClass: true, name: "observers" } }),
    ]);
  });
});

describe("extractIterationCallFacts — Ruby (`.each do |o| … end`, forma LLAMADA CON BLOQUE)", () => {
  it("@observers.each do |o| o.update(x) end — variable del `parameters` del bloque, colección del receptor del `call` padre", async () => {
    const facts = await loopFactsFor("tree-sitter-ruby.wasm", "class Widget\n  def notify\n    @observers.each do |o|\n      o.update(x)\n    end\n  end\nend\n");
    expect(facts).toEqual([
      expect.objectContaining({ containerPath: ["Widget", "notify"], classPath: ["Widget"], loopVarName: "o", collection: { ownerIsEnclosingClass: true, name: "observers" } }),
    ]);
  });

  it("self.observers.each do |o| ... end — forma self explícita, mismo resultado", async () => {
    const facts = await loopFactsFor("tree-sitter-ruby.wasm", "class Widget\n  def notify\n    self.observers.each do |o|\n      o.update(x)\n    end\n  end\nend\n");
    expect(facts).toEqual([expect.objectContaining({ loopVarName: "o", collection: { ownerIsEnclosingClass: true, name: "observers" } })]);
  });
});

describe("extractIterationCallFacts — Go (`range`, forma ANIDADA UN NIVEL vía `range_clause`)", () => {
  it("for _, o := range w.observers { o.Update(x) } — receptor arbitrario (Go no tiene self/this) ⇒ collection: null, brecha declarada", async () => {
    const facts = await loopFactsFor(
      "tree-sitter-go.wasm",
      "package main\nfunc (w *Widget) Notify() {\n\tfor _, o := range w.observers {\n\t\to.Update(x)\n\t}\n}\n",
    );
    expect(facts).toEqual([expect.objectContaining({ loopVarName: "o", collection: null })]); // ver el docstring del módulo, "BRECHA DECLARADA".
  });

  it("C-style for (init;cond;post) ⇒ ningún hecho — `for_clause` no resuelve left/right, no matchea por nombre", async () => {
    const facts = await loopFactsFor("tree-sitter-go.wasm", "package main\nfunc Notify() {\n\tfor i := 0; i < 10; i++ {\n\t\titems[i].Update()\n\t}\n}\n");
    expect(facts).toEqual([]);
  });

  it("range sobre variable local/parámetro (no receptor) ⇒ collection bare", async () => {
    const facts = await loopFactsFor("tree-sitter-go.wasm", "package main\nfunc Notify(observers []Observer) {\n\tfor _, o := range observers {\n\t\to.Update()\n\t}\n}\n");
    expect(facts).toEqual([expect.objectContaining({ loopVarName: "o", collection: { ownerIsEnclosingClass: false, name: "observers" } })]);
  });
});

describe("extractIterationCallFacts — Java (enhanced for, forma DIRECTA vía `name`/`value`)", () => {
  it("for (Observer o : this.observers) { o.update(x); }", async () => {
    const facts = await loopFactsFor("tree-sitter-java.wasm", "class Widget {\n  void notify() {\n    for (Observer o : this.observers) {\n      o.update(x);\n    }\n  }\n}\n");
    expect(facts).toEqual([
      expect.objectContaining({ containerPath: ["Widget", "notify"], classPath: ["Widget"], loopVarName: "o", collection: { ownerIsEnclosingClass: true, name: "observers" } }),
    ]);
  });
});

describe("extractIterationCallFacts — C# (foreach, forma DIRECTA vía `left`/`right`)", () => {
  it("foreach (var o in this.observers) { o.Update(x); }", async () => {
    const facts = await loopFactsFor("tree-sitter-c_sharp.wasm", "class Widget {\n  void Notify() {\n    foreach (var o in this.observers) {\n      o.Update(x);\n    }\n  }\n}\n");
    expect(facts).toEqual([
      expect.objectContaining({ containerPath: ["Widget", "Notify"], classPath: ["Widget"], loopVarName: "o", collection: { ownerIsEnclosingClass: true, name: "observers" } }),
    ]);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * `extractReceiverFacts` — la mitad AST de GENERALIZACIÓN DEL RECEPTOR (Go),
 * sobre gramáticas REALES (mismo motivo que `extractIterationCallFacts`
 * arriba: es una función de nombres de CAMPO de la gramática, no de nombres
 * de nodo — un árbol fabricado a mano no probaría que el campo `receiver`
 * real de Go resuelve como se espera).
 * ──────────────────────────────────────────────────────────────────────── */

describe("extractReceiverFacts — Go (`method_declaration.receiver`, el único caso hoy)", () => {
  it("func (s *Server) Handle() { ... } — receptor por PUNTERO: nombre y tipo despojado de `*` por posición, no por nombre de nodo", async () => {
    const facts = await receiverFactsFor("tree-sitter-go.wasm", "package main\ntype Server struct{}\nfunc (s *Server) Handle() {\n\ts.log()\n}\n");
    expect(facts).toEqual([{ functionScope: ["Handle"], receiverName: "s", receiverTypeName: "Server" }]);
  });

  it("func (s Server) Handle() { ... } — receptor por VALOR (sin `*`): mismo resultado, la hoja ya es el `type_identifier`", async () => {
    const facts = await receiverFactsFor("tree-sitter-go.wasm", "package main\ntype Server struct{}\nfunc (s Server) Handle() {\n\ts.log()\n}\n");
    expect(facts).toEqual([{ functionScope: ["Handle"], receiverName: "s", receiverTypeName: "Server" }]);
  });

  it("func Notify() { ... } — función SUELTA sin campo `receiver` ⇒ ningún hecho, nunca un error", async () => {
    const facts = await receiverFactsFor("tree-sitter-go.wasm", "package main\nfunc Notify() {\n\tfoo()\n}\n");
    expect(facts).toEqual([]);
  });

  it("dos métodos con receptores de TIPOS distintos (`*Server`, `*Client`) ⇒ un `ReceiverFact` por método, cada uno con SU propio tipo", async () => {
    const facts = await receiverFactsFor(
      "tree-sitter-go.wasm",
      "package main\nfunc (s *Server) Handle() {}\nfunc (c *Client) Send() {}\n",
    );
    expect(facts).toEqual(
      expect.arrayContaining([
        { functionScope: ["Handle"], receiverName: "s", receiverTypeName: "Server" },
        { functionScope: ["Send"], receiverName: "c", receiverTypeName: "Client" },
      ]),
    );
    expect(facts).toHaveLength(2);
  });

  it("receptor DESCARTADO (`_`, convención de \"no lo uso\") ⇒ se extrae igual, tal cual — nunca se especial-casa un nombre, ni siquiera éste", async () => {
    const facts = await receiverFactsFor("tree-sitter-go.wasm", "package main\nfunc (_ *Server) Ping() {}\n");
    expect(facts).toEqual([{ functionScope: ["Ping"], receiverName: "_", receiverTypeName: "Server" }]);
  });
});

describe("extractReceiverFacts — lenguajes SIN campo `receiver` propio (despacho implícito) ⇒ siempre []", () => {
  it("JavaScript: ningún método expone un campo `receiver` distinto de `parameters` — `this` es implícito, no declarado", async () => {
    const facts = await receiverFactsFor("tree-sitter-javascript.wasm", "class Widget {\n  notify() {\n    this.onChange();\n  }\n}\n");
    expect(facts).toEqual([]);
  });

  it("Python: `self` es el PRIMER parámetro ordinario de `parameters`, no un campo `receiver` separado", async () => {
    const facts = await receiverFactsFor("tree-sitter-python.wasm", "class Widget:\n    def notify(self):\n        self.on_change()\n");
    expect(facts).toEqual([]);
  });
});
