import { describe, expect, it } from "vitest";

import {
  cloneDensity,
  computeContractTargets,
  hasSharedContractTarget,
  isLowDensityClone,
  isSymmetricNamePair,
  MIN_DENSITY_SPEC,
} from "./a4b-clone-shape.js";
import { resolveThreshold } from "../thresholds.js";
import type { CloneCandidate } from "../types.js";
import type { CodeGraph, CodeGraphEdge, CodeGraphNode } from "../../graph/types.js";

function clone(overrides: Partial<CloneCandidate> & Pick<CloneCandidate, "startLine" | "endLine">): CloneCandidate {
  return {
    fingerprint: "f",
    file: "a.ts",
    nodes: 40,
    type: "method_declaration",
    functionName: null,
    className: null,
    superclassName: null,
    normalized: "same shape",
    ...overrides,
  };
}

function classNode(file: string, name: string, id = `sym:${file}#${name}`): CodeGraphNode {
  return { id, kind: "symbol", file, symbolPath: [name], family: "class-like" };
}

function contractEdge(from: string, to: string, kind: CodeGraphEdge["kind"] = "implements"): CodeGraphEdge {
  return { from, to, kind, provenance: "declared", weight: 1 };
}

function graphOf(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): CodeGraph {
  return { nodes, edges, resolution: { candidates: 0, resolved: 0, droppedAmbiguous: 0, unresolved: 0, byStage: [] } };
}

const minDensity = resolveThreshold(MIN_DENSITY_SPEC, { language: "*", sampleSize: () => 0, corpusP95: () => null });

describe("cloneDensity / isLowDensityClone", () => {
  it("mide nodos por línea", () => {
    expect(cloneDensity(clone({ startLine: 1, endLine: 10, nodes: 50 }))).toBe(5);
  });

  it("ListenableFuture.java medido (57 nodos / 39 líneas ≈ 1.46) cae debajo del piso", () => {
    const c = clone({ startLine: 120, endLine: 158, nodes: 57 });
    expect(cloneDensity(c)).toBeCloseTo(1.46, 1);
    expect(isLowDensityClone(c, minDensity)).toBe(true);
  });

  it("el peor verdadero medido (jekyll#raise_markup_parse_error, 28 nodos / 6 líneas ≈ 4.67) NO cae debajo del piso", () => {
    const c = clone({ startLine: 110, endLine: 115, nodes: 28 });
    expect(cloneDensity(c)).toBeCloseTo(4.67, 1);
    expect(isLowDensityClone(c, minDensity)).toBe(false);
  });

  it("un rango degenerado (endLine < startLine) no lanza ni da Infinity", () => {
    const c = clone({ startLine: 10, endLine: 5, nodes: 10 });
    expect(Number.isFinite(cloneDensity(c))).toBe(true);
  });
});

describe("computeContractTargets / hasSharedContractTarget", () => {
  it("grafo null da el mapa vacío: el filtro nunca dispara sin grafo", () => {
    const targets = computeContractTargets(null);
    expect(targets.size).toBe(0);
    const group = [
      clone({ startLine: 1, endLine: 10, file: "a.ts", className: "A" }),
      clone({ startLine: 1, endLine: 10, file: "b.ts", className: "B" }),
    ];
    expect(hasSharedContractTarget(group, targets)).toBe(false);
  });

  it("dos clases HERMANAS que implementan el MISMO target: dispara (familia de contrato, ListGenerators.java)", () => {
    const graph = graphOf(
      [classNode("a.ts", "BuilderAddListGenerator"), classNode("b.ts", "BuilderAddAllListGenerator")],
      [
        contractEdge("sym:a.ts#BuilderAddListGenerator", "sym:base.ts#TestStringListGenerator", "extends"),
        contractEdge("sym:b.ts#BuilderAddAllListGenerator", "sym:base.ts#TestStringListGenerator", "extends"),
      ],
    );
    const targets = computeContractTargets(graph);
    const group = [
      clone({ startLine: 1, endLine: 10, file: "a.ts", className: "BuilderAddListGenerator" }),
      clone({ startLine: 1, endLine: 10, file: "b.ts", className: "BuilderAddAllListGenerator" }),
    ];
    expect(hasSharedContractTarget(group, targets)).toBe(true);
  });

  it("implements (no sólo extends) cuenta — la brecha que superclassName no cubre (ForwardingLock/ForwardingCondition)", () => {
    const graph = graphOf(
      [classNode("Lock1.java", "ForwardingLock"), classNode("Cond1.java", "ForwardingCondition")],
      [
        contractEdge("sym:Lock1.java#ForwardingLock", "sym:jdk#Lock", "implements"),
        contractEdge("sym:Cond1.java#ForwardingCondition", "sym:jdk#Lock", "implements"),
      ],
    );
    const targets = computeContractTargets(graph);
    const group = [
      clone({ startLine: 1, endLine: 10, file: "Lock1.java", className: "ForwardingLock" }),
      clone({ startLine: 1, endLine: 10, file: "Cond1.java", className: "ForwardingCondition" }),
    ];
    expect(hasSharedContractTarget(group, targets)).toBe(true);
  });

  it("control negativo: cada clase implementa un target DISTINTO (sin blanco compartido) — no dispara", () => {
    const graph = graphOf(
      [classNode("a.ts", "A"), classNode("b.ts", "B")],
      [contractEdge("sym:a.ts#A", "sym:x.ts#IFoo"), contractEdge("sym:b.ts#B", "sym:x.ts#IBar")],
    );
    const targets = computeContractTargets(graph);
    const group = [
      clone({ startLine: 1, endLine: 10, file: "a.ts", className: "A" }),
      clone({ startLine: 1, endLine: 10, file: "b.ts", className: "B" }),
    ];
    expect(hasSharedContractTarget(group, targets)).toBe(false);
  });

  it("control negativo: una sola clase (auto-duplicación, no hermanas) — no dispara aunque implemente algo", () => {
    const graph = graphOf(
      [classNode("a.ts", "A")],
      [contractEdge("sym:a.ts#A", "sym:x.ts#IFoo")],
    );
    const targets = computeContractTargets(graph);
    const group = [
      clone({ startLine: 1, endLine: 10, file: "a.ts", className: "A" }),
      clone({ startLine: 20, endLine: 29, file: "a.ts", className: "A" }),
    ];
    expect(hasSharedContractTarget(group, targets)).toBe(false);
  });

  it("control negativo: className null (no es un cuerpo de clase) — no dispara", () => {
    const targets = computeContractTargets(graphOf([], []));
    const group = [clone({ startLine: 1, endLine: 10, file: "a.ts", className: null }), clone({ startLine: 1, endLine: 10, file: "b.ts", className: "B" })];
    expect(hasSharedContractTarget(group, targets)).toBe(false);
  });

  it("control negativo (setSucceeds): una clase que SÍ extiende algo, pero sin hermana en el grupo que comparta ese padre, no dispara", () => {
    const graph = graphOf(
      [classNode("AbstractFuture.java", "AbstractFuture"), classNode("Other.java", "Unrelated")],
      [
        contractEdge("sym:AbstractFuture.java#AbstractFuture", "sym:x.ts#InternalFutureFailureAccess", "extends"),
        contractEdge("sym:Other.java#Unrelated", "sym:x.ts#SomethingElse", "extends"),
      ],
    );
    const targets = computeContractTargets(graph);
    const group = [
      clone({ startLine: 1, endLine: 13, file: "AbstractFuture.java", className: "AbstractFuture" }),
      clone({ startLine: 1, endLine: 13, file: "Other.java", className: "Unrelated" }),
    ];
    expect(hasSharedContractTarget(group, targets)).toBe(false);
  });
});

describe("isSymmetricNamePair", () => {
  it("MathUtils.Min/Max: única diferencia es el propio nombre mencionado dentro del cuerpo — dispara", () => {
    const body = (name: string) =>
      `public static int? ${name}(int? val1, int? val2) { if (val1 == null) { return val2; } if (val2 == null) { return val1; } return Math.${name}(val1.GetValueOrDefault(), val2.GetValueOrDefault()); }`;
    const group = [
      clone({ startLine: 1, endLine: 9, file: "MathUtils.cs", functionName: "Min", normalized: body("Min") }),
      clone({ startLine: 12, endLine: 20, file: "MathUtils.cs", functionName: "Max", normalized: body("Max") }),
    ];
    expect(isSymmetricNamePair(group)).toBe(true);
  });

  it("control negativo: mismo functionName en las dos copias (no es un par de nombres distintos) — no dispara", () => {
    const group = [
      clone({ startLine: 1, endLine: 9, file: "a.ts", functionName: "foo", normalized: "same" }),
      clone({ startLine: 12, endLine: 20, file: "b.ts", functionName: "foo", normalized: "same" }),
    ];
    expect(isSymmetricNamePair(group)).toBe(false);
  });

  it("control negativo: además del nombre propio, difiere OTRO identificador — no dispara (no es SÓLO el nombre)", () => {
    const group = [
      clone({ startLine: 1, endLine: 9, file: "a.ts", functionName: "min", normalized: "return min(a, low);" }),
      clone({ startLine: 12, endLine: 20, file: "b.ts", functionName: "max", normalized: "return max(a, high);" }),
    ];
    expect(isSymmetricNamePair(group)).toBe(false);
  });

  it("control negativo: grupo de 3 copias — sin evidencia medida más allá de pares, no dispara", () => {
    const body = (name: string) => `return Math.${name}(a, b);`;
    const group = [
      clone({ startLine: 1, endLine: 3, file: "a.ts", functionName: "min", normalized: body("min") }),
      clone({ startLine: 5, endLine: 7, file: "b.ts", functionName: "max", normalized: body("max") }),
      clone({ startLine: 9, endLine: 11, file: "c.ts", functionName: "mid", normalized: body("mid") }),
    ];
    expect(isSymmetricNamePair(group)).toBe(false);
  });

  it("control negativo: functionName null en algún miembro — no dispara", () => {
    const group = [
      clone({ startLine: 1, endLine: 9, file: "a.ts", functionName: null, normalized: "x" }),
      clone({ startLine: 12, endLine: 20, file: "b.ts", functionName: "max", normalized: "x" }),
    ];
    expect(isSymmetricNamePair(group)).toBe(false);
  });

  it("REGRESIÓN medida (jekyll, texto real vía analyzeFile): highlighter_prefix/highlighter_suffix NO dispara — el nombre propio aparece TAMBIÉN como nombre de PARÁMETRO y como variable de instancia, no sólo en posición de llamada, así que sigue habiendo una diferencia real tras sacar sólo las invocaciones", () => {
    // `lib/jekyll/converter.rb:12-17` / `:26-31`, verdadero MEDIDO en
    // `tests/golden/precision/jekyll.verdicts.csv` ("getter/setter con
    // default… repetido con distinto nombre de variable, duplicación
    // real"). `.normalized` es el texto REAL, capturado con `analyzeFile`
    // directo sobre el archivo del corpus (no escrito a mano) — ver el
    // docstring de `isSymmetricNamePair` para por qué la primera versión
    // de este filtro sí disparaba acá (falso negativo de suspensión: un
    // verdadero medido hubiera desaparecido).
    const group = [
      clone({
        startLine: 12,
        endLine: 17,
        file: "lib/jekyll/converter.rb",
        functionName: "highlighter_prefix",
        normalized:
          "def self.highlighter_prefix(highlighter_prefix = nil) unless defined?(@highlighter_prefix) && " +
          "highlighter_prefix.nil? @highlighter_prefix = highlighter_prefix end @highlighter_prefix end",
      }),
      clone({
        startLine: 26,
        endLine: 31,
        file: "lib/jekyll/converter.rb",
        functionName: "highlighter_suffix",
        normalized:
          "def self.highlighter_suffix(highlighter_suffix = nil) unless defined?(@highlighter_suffix) && " +
          "highlighter_suffix.nil? @highlighter_suffix = highlighter_suffix end @highlighter_suffix end",
      }),
    ];
    expect(isSymmetricNamePair(group)).toBe(false);
  });
});
