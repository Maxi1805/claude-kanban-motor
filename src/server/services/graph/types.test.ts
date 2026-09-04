/**
 * `graph/types.ts` — CONTRATO-F8G.md, las formas enriquecidas que Cimientos
 * aterriza para que F1-F5 escriban contra algo real. Este archivo fija la
 * FORMA (bits de rol, campos opcionales aditivos, `memberSignatures` puro),
 * no ninguna extracción — todavía no hay ningún frente que produzca
 * `roles`/`arity`/`visibility`/`isCallee` de verdad.
 */
import { describe, expect, it } from "vitest";

import {
  EDGE_ROLE_BARE,
  EDGE_ROLE_QUALIFIED,
  EDGE_ROLE_RECEIVER_MEMBER,
  edgeHasRole,
  edgeRoleBit,
  memberSignatures,
  type CodeGraphEdge,
  type CodeGraphNode,
  type GraphIndex,
} from "./types.js";

describe("EdgeRole — máscara de bits (CONTRATO-F8G.md §1.2)", () => {
  it("cada rol tiene un bit propio, potencia de dos, sin solaparse", () => {
    expect(EDGE_ROLE_BARE).toBe(1);
    expect(EDGE_ROLE_RECEIVER_MEMBER).toBe(2);
    expect(EDGE_ROLE_QUALIFIED).toBe(4);
    expect(edgeRoleBit("bare")).toBe(EDGE_ROLE_BARE);
    expect(edgeRoleBit("receiver-member")).toBe(EDGE_ROLE_RECEIVER_MEMBER);
    expect(edgeRoleBit("qualified")).toBe(EDGE_ROLE_QUALIFIED);
  });

  const baseEdge: CodeGraphEdge = { from: "sym:a#A", to: "sym:b#B", kind: "references", provenance: "resolved", weight: 1 };

  it("una arista sin `roles` no tiene ningún rol", () => {
    expect(edgeHasRole(baseEdge, "bare")).toBe(false);
    expect(edgeHasRole(baseEdge, "qualified")).toBe(false);
  });

  it("`roles` es un OR de bits: detecta cada rol presente en la máscara, ninguno de los ausentes", () => {
    const edge: CodeGraphEdge = { ...baseEdge, roles: EDGE_ROLE_BARE | EDGE_ROLE_QUALIFIED };
    expect(edgeHasRole(edge, "bare")).toBe(true);
    expect(edgeHasRole(edge, "qualified")).toBe(true);
    expect(edgeHasRole(edge, "receiver-member")).toBe(false);
  });
});

describe("CodeGraphNode/CodeGraphEdge — campos nuevos, aditivos y opcionales (CONTRATO-F8G.md §1-3)", () => {
  it("un nodo de antes de esta ola (sin arity/visibility) sigue siendo un CodeGraphNode válido", () => {
    const node: CodeGraphNode = { id: "sym:a#A", kind: "symbol", file: "a.rb", symbolPath: ["A"] };
    expect(node.arity).toBeUndefined();
    expect(node.visibility).toBeUndefined();
  });

  it("`arity: null` es distinguible de `arity` ausente (CONTRATO-F8G.md §2.1: null = la gramática no expuso lista de parámetros)", () => {
    const withNull: CodeGraphNode = { id: "sym:a#f", kind: "symbol", file: "a.rb", symbolPath: ["f"], arity: null };
    const withoutField: CodeGraphNode = { id: "sym:a#g", kind: "symbol", file: "a.rb", symbolPath: ["g"] };
    expect(withNull.arity).toBeNull();
    expect(withoutField.arity).toBeUndefined();
  });

  it("`\"calls\"` es un EdgeKind válido, y una arista `calls` puede llevar `roles` igual que `references`", () => {
    const edge: CodeGraphEdge = {
      from: "sym:a#f",
      to: "sym:b#g",
      kind: "calls",
      provenance: "resolved",
      weight: 1,
      roles: EDGE_ROLE_BARE,
    };
    expect(edge.kind).toBe("calls");
    expect(edgeHasRole(edge, "bare")).toBe(true);
  });
});

describe("memberSignatures — CONTRATO-F8G.md §2.1: derivado de `contains`, nunca almacenado", () => {
  function indexOf(nodes: readonly CodeGraphNode[], edges: readonly CodeGraphEdge[]): GraphIndex {
    const byId = new Map(nodes.map((n) => [n.id, n] as const));
    const from = new Map<string, CodeGraphEdge[]>();
    for (const e of edges) {
      const list = from.get(e.from);
      if (list) list.push(e);
      else from.set(e.from, [e]);
    }
    return {
      nodeById: (id) => byId.get(id) ?? null,
      edgesFrom: (id) => from.get(id) ?? [],
    };
  }

  it("proyecta cada miembro function-like contenido, con su aridad y visibilidad", () => {
    const owner: CodeGraphNode = { id: "sym:a#Shape", kind: "symbol", file: "a.rb", symbolPath: ["Shape"], family: "class-like" };
    const method: CodeGraphNode = {
      id: "sym:a#Shape.area",
      kind: "symbol",
      file: "a.rb",
      symbolPath: ["Shape", "area"],
      family: "function-like",
      arity: 0,
      visibility: "public",
    };
    const field: CodeGraphNode = {
      id: "sym:a#Shape.x",
      kind: "symbol",
      file: "a.rb",
      symbolPath: ["Shape", "x"],
      family: "other",
    };
    const edges: CodeGraphEdge[] = [
      { from: owner.id, to: method.id, kind: "contains", provenance: "declared", weight: 1 },
      { from: owner.id, to: field.id, kind: "contains", provenance: "declared", weight: 1 },
    ];
    const index = indexOf([owner, method, field], edges);
    expect(memberSignatures(index, owner.id)).toEqual([{ name: "area", arity: 0, visibility: "public" }]);
  });

  it("un miembro sin `arity` (F2 no corrió) sale con `arity: null`, no con el campo ausente", () => {
    const owner: CodeGraphNode = { id: "sym:a#Shape", kind: "symbol", file: "a.rb", symbolPath: ["Shape"], family: "class-like" };
    const method: CodeGraphNode = {
      id: "sym:a#Shape.area",
      kind: "symbol",
      file: "a.rb",
      symbolPath: ["Shape", "area"],
      family: "function-like",
    };
    const edges: CodeGraphEdge[] = [{ from: owner.id, to: method.id, kind: "contains", provenance: "declared", weight: 1 }];
    const index = indexOf([owner, method], edges);
    expect(memberSignatures(index, owner.id)).toEqual([{ name: "area", arity: null, visibility: undefined }]);
  });

  it("ignora aristas que no son `contains` y nodos que no son function-like", () => {
    const owner: CodeGraphNode = { id: "sym:a#Shape", kind: "symbol", file: "a.rb", symbolPath: ["Shape"], family: "class-like" };
    const field: CodeGraphNode = { id: "sym:a#Shape.x", kind: "symbol", file: "a.rb", symbolPath: ["Shape", "x"], family: "other" };
    const edges: CodeGraphEdge[] = [
      { from: owner.id, to: field.id, kind: "contains", provenance: "declared", weight: 1 },
      { from: owner.id, to: field.id, kind: "references", provenance: "resolved", weight: 1 },
    ];
    const index = indexOf([owner, field], edges);
    expect(memberSignatures(index, owner.id)).toEqual([]);
  });

  it("un `ownerId` sin ninguna arista saliente (o inexistente en el índice) da `[]`", () => {
    const index = indexOf([], []);
    expect(memberSignatures(index, "sym:nope#Nope")).toEqual([]);
  });
});
