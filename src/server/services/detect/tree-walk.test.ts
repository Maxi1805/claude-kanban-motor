import { describe, expect, it } from "vitest";

import type { ProbeNode } from "../code-grammar.js";
import { walkTree } from "./tree-walk.js";

interface FakeSpec {
  type: string;
  isNamed?: boolean;
  children?: FakeSpec[];
}

function buildNode(spec: FakeSpec): ProbeNode {
  const children = (spec.children ?? []).map(buildNode);
  return {
    type: spec.type,
    isNamed: spec.isNamed ?? true,
    childCount: children.length,
    child: (i: number) => children[i] ?? null,
    childForFieldName: () => null,
  };
}

describe("walkTree", () => {
  it("visita la raíz y cada descendiente exactamente una vez, en pre-order", () => {
    const root = buildNode({
      type: "root",
      children: [{ type: "a", children: [{ type: "a1" }, { type: "a2" }] }, { type: "b" }],
    });
    const seen: string[] = [];
    walkTree(root, (n) => seen.push(n.type));
    expect(seen).toEqual(["root", "a", "a1", "a2", "b"]);
  });

  it("un nodo sin hijos visita sólo a sí mismo", () => {
    const root = buildNode({ type: "leaf" });
    const seen: string[] = [];
    walkTree(root, (n) => seen.push(n.type));
    expect(seen).toEqual(["leaf"]);
  });
});
