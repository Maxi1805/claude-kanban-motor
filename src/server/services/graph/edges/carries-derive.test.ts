/**
 * `carries-derive.ts` — CONTRATO-F9.md §3.3 formas 1/5, mismo estilo de
 * prueba que `satisfies-derive.test.ts`: nodos/aristas fabricados a mano,
 * sin AST (la propia función no toca AST).
 */
import { describe, expect, it } from "vitest";

import { deriveCarriesEdges } from "./carries-derive.js";
import type { CodeGraphEdge, CodeGraphNode } from "../types.js";

function fnNode(id: string): CodeGraphNode {
  return { id, kind: "symbol", file: "a.ts", symbolPath: [id], family: "function-like" };
}
function otherNode(id: string): CodeGraphNode {
  return { id, kind: "symbol", file: "a.ts", symbolPath: [id], family: "other" };
}
function refEdge(from: string, to: string, overrides: Partial<CodeGraphEdge> = {}): CodeGraphEdge {
  return { from, to, kind: "references", provenance: "resolved", weight: 1, ...overrides };
}

describe("deriveCarriesEdges", () => {
  it("una references hacia un símbolo function-like se convierte en carries", () => {
    const nodes = [otherNode("sym:a#handler"), fnNode("sym:a#processData")];
    const edges = [refEdge("sym:a#handler", "sym:a#processData")];
    expect(deriveCarriesEdges(nodes, edges)).toEqual([{ from: "sym:a#handler", to: "sym:a#processData", kind: "carries", provenance: "inferred", weight: 1 }]);
  });

  it("references hacia un símbolo NO function-like no produce carries", () => {
    const nodes = [otherNode("sym:a#x"), otherNode("sym:a#y")];
    const edges = [refEdge("sym:a#x", "sym:a#y")];
    expect(deriveCarriesEdges(nodes, edges)).toEqual([]);
  });

  it("aristas kind !== references (p.ej. calls) se ignoran — sólo el nombre en posición de VALOR cuenta", () => {
    const nodes = [otherNode("sym:a#x"), fnNode("sym:a#target")];
    const edges = [refEdge("sym:a#x", "sym:a#target", { kind: "calls" })];
    expect(deriveCarriesEdges(nodes, edges)).toEqual([]);
  });

  it("las ambiguas (provenance ambiguous) se excluyen — regla de seguridad de CONTRATO-F9.md §4.5", () => {
    const nodes = [otherNode("sym:a#x"), fnNode("sym:a#target")];
    const edges = [refEdge("sym:a#x", "sym:a#target", { provenance: "ambiguous", alternatives: ["sym:a#other"] })];
    expect(deriveCarriesEdges(nodes, edges)).toEqual([]);
  });

  it("dos references distintas al mismo par (from,to) funden weight, nunca duplican la arista", () => {
    const nodes = [otherNode("sym:a#x"), fnNode("sym:a#target")];
    const edges = [refEdge("sym:a#x", "sym:a#target", { weight: 2 }), refEdge("sym:a#x", "sym:a#target", { weight: 3, resolvedBy: "qualified-name" })];
    expect(deriveCarriesEdges(nodes, edges)).toEqual([{ from: "sym:a#x", to: "sym:a#target", kind: "carries", provenance: "inferred", weight: 5 }]);
  });

  it("una función que se referencia a sí misma (recursión) no es su propio portador", () => {
    const nodes = [fnNode("sym:a#self")];
    const edges = [refEdge("sym:a#self", "sym:a#self")];
    expect(deriveCarriesEdges(nodes, edges)).toEqual([]);
  });

  it("forma 5 (receiver-member, rol marcado vía EDGE_ROLE) produce la MISMA arista carries que forma 1 — no se duplica el mecanismo", () => {
    const nodes = [otherNode("sym:a#x"), fnNode("sym:a#Utils.transform")];
    const edges = [refEdge("sym:a#x", "sym:a#Utils.transform", { roles: 2 /* EDGE_ROLE_RECEIVER_MEMBER */ })];
    expect(deriveCarriesEdges(nodes, edges)).toEqual([{ from: "sym:a#x", to: "sym:a#Utils.transform", kind: "carries", provenance: "inferred", weight: 1 }]);
  });
});
