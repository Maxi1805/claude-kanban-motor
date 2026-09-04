/**
 * `code-grammar.ts` unit tests — this module had NONE before the F1 hygiene
 * pass, despite being the central piece every language plugs into
 * (`code-analyzer.ts`, `pattern-structural.ts`, `pattern-behavioral.ts`,
 * `detect/capabilities.ts` all derive from it). A direct test on
 * `deriveNodeSets` is exactly what would have caught both bugs fixed in this
 * pass BEFORE they shipped:
 *
 *   1. Ruby's ternary node is `conditional` — bare, no `_expression` suffix —
 *      so it missed the old `TERNARY_NAME` regex and fell into `isIfLike`
 *      (it has `condition`+`alternative`), silently inflating conditional-chain
 *      length and nesting depth for every Ruby ternary in the corpus.
 *   2. `JAVA_PROBE`/`CSHARP_PROBE` never exercised a ternary at all, so
 *      `ternary_expression`/`conditional_expression` never entered those two
 *      languages' derived sets even though the regex would have matched —
 *      the operator was silently mute in Java/C#, not "unsupported".
 *
 * Fixtures are parsed with the REAL grammars (`web-tree-sitter` +
 * `tree-sitter-wasms`), same infra `code-analyzer.test.ts`/
 * `pattern-behavioral.test.ts` already use — a hand-built fake `ProbeNode`
 * tree would not have caught either bug above, since both are about what a
 * REAL grammar actually names its nodes and which fields it resolves.
 */
import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { deriveNodeSets, type ProbeNode } from "./code-grammar.js";

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

/**
 * Every named node type appearing ANYWHERE under `root`, for assertions of
 * the shape "this construct did/did not land in that derived set" without
 * hand-walking the tree in every test.
 */
function allNamedTypes(root: ProbeNode): Set<string> {
  const out = new Set<string>();
  const visit = (node: ProbeNode): void => {
    if (node.isNamed) out.add(node.type);
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) visit(child);
    }
  };
  visit(root);
  return out;
}

/** First node under `root` whose type is `type`, or null. */
function findFirst(root: ProbeNode, type: string): ProbeNode | null {
  if (root.isNamed && root.type === type) return root;
  for (let i = 0; i < root.childCount; i++) {
    const child = root.child(i);
    if (child) {
      const found = findFirst(child, type);
      if (found) return found;
    }
  }
  return null;
}

describe("deriveNodeSets — ruby", () => {
  // Same probe shape `code-analyzer.ts`'s RUBY_PROBE uses (class with a
  // constructor-like `initialize`, an if/elsif/else, a case/when, loops, a
  // rescue, and a ternary) — the ternary is the whole point of this test.
  const RUBY_SOURCE = `
class Shape
  def initialize(name)
    @name = name
  end

  def area(x)
    if x > 0
      1
    elsif x < 0
      2
    else
      3
    end
  end

  def describe(kind)
    case kind
    when :circle
      "circle"
    else
      "unknown"
    end
  end

  def risky
    begin
      go
    rescue => e
      handle(e)
    end
  end

  def ternary(x)
    x > 0 ? 1 : 2
  end
end
`;

  it("bug #1 regression: Ruby's bare `conditional` ternary node is captured as a branch, NOT as an if-rung", async () => {
    const root = await parseRoot("tree-sitter-ruby.wasm", RUBY_SOURCE);
    const sets = deriveNodeSets(root);

    // Confirmed by direct probe: Ruby's ternary node type is `conditional`
    // (bare, no `_expression` suffix) — this is what the old TERNARY_NAME
    // regex missed.
    const ternaryNode = findFirst(root, "conditional");
    expect(ternaryNode).not.toBeNull();

    // The module's OWN documented invariant: a ternary must count as a flat
    // branch (cognitive complexity +1) but must NEVER be a chain rung or a
    // nesting contributor — that would silently inflate conditional-chain
    // length and cognitive nesting depth for code that has no decision
    // ladder at all, just an expression.
    expect(sets.branchNodes.has("conditional")).toBe(true);
    expect(sets.chainNodes.has("conditional")).toBe(false);
    expect(sets.nestingNodes.has("conditional")).toBe(false);

    // And it must not have been miscategorised as an if (the bug's exact
    // failure mode): `if`/`elsif` in this grammar is a DIFFERENT node type.
    expect(ternaryNode!.type).not.toBe("if");
  });

  it("still derives the if/elsif ladder, the switch, the loop and the constructor-name fallback correctly", async () => {
    const root = await parseRoot("tree-sitter-ruby.wasm", RUBY_SOURCE);
    const sets = deriveNodeSets(root);
    const types = allNamedTypes(root);

    expect([...sets.chainNodes].some((t) => types.has(t))).toBe(true); // if/elsif and/or case do chain
    expect(sets.classNodes.has("class")).toBe(true);
    expect(sets.functionNodes.has("method")).toBe(true);
    // Ruby's `initialize` is an ordinary `method` node under a language-
    // mandated name — the grammar dedicates it NO node type of its own,
    // unlike Java/C#'s `constructor_declaration` (see the java describe
    // block below), so `constructorNodes` must derive EMPTY here.
    expect(sets.constructorNodes.size).toBe(0);
    expect(sets.exceptionNodes.has("rescue")).toBe(true);
  });
});

describe("deriveNodeSets — java", () => {
  // Exercises a for-each loop (`enhanced_for_statement` — the exact shape
  // that once got misclassified as a class, see the module's own docstring)
  // AND a ternary — bug #2: JAVA_PROBE never exercised one before this fix,
  // so `ternary_expression` never entered `functionNodes`'s sibling sets for
  // Java even though the shared TERNARY_NAME regex would have matched it.
  const JAVA_SOURCE = `
public class Shape extends Base {
  public Shape(String name) {
    this.name = name;
  }

  public int area(int x) {
    int t = x > 0 ? 1 : 2;
    if (x > 0) {
      return 1;
    } else {
      return t;
    }
  }

  public void loopy() {
    for (int v : values) {
      System.out.println(v);
    }
    try {
      risky();
    } catch (Exception e) {
      handle(e);
    }
  }
}
`;

  it("bug #2 regression: the ternary IS captured once the probe exercises it", async () => {
    const root = await parseRoot("tree-sitter-java.wasm", JAVA_SOURCE);
    const sets = deriveNodeSets(root);

    const ternaryNode = findFirst(root, "ternary_expression");
    expect(ternaryNode).not.toBeNull();
    expect(sets.branchNodes.has("ternary_expression")).toBe(true);
    expect(sets.chainNodes.has("ternary_expression")).toBe(false);
    expect(sets.nestingNodes.has("ternary_expression")).toBe(false);
  });

  it("derives a dedicated constructorNodes set (Java's own grammar rule), never confusing it with a for-each loop", async () => {
    const root = await parseRoot("tree-sitter-java.wasm", JAVA_SOURCE);
    const sets = deriveNodeSets(root);

    expect(sets.constructorNodes.has("constructor_declaration")).toBe(true);
    // The regular method must NOT also be treated as a constructor type.
    expect(sets.constructorNodes.has("method_declaration")).toBe(false);

    // The for-each loop (`enhanced_for_statement`) has a `body` AND a `name`
    // field (the loop variable) — structurally identical to `isClassLike`'s
    // test — and MUST be resolved as a loop, never as a class (the exact
    // regression this module's docstring documents having found and fixed).
    const forEach = findFirst(root, "enhanced_for_statement");
    expect(forEach).not.toBeNull();
    expect(sets.classNodes.has("enhanced_for_statement")).toBe(false);
    expect(sets.nestingNodes.has("enhanced_for_statement")).toBe(true);
    expect(sets.exceptionNodes.has("catch_clause")).toBe(true);
  });
});

describe("deriveNodeSets — go", () => {
  const GO_SOURCE = `
package main

type Shaper interface {
	Area() int
}

type Shape struct {
	Name string
}

type UserID int

func (s *Shape) Area(x int) int {
	if x > 0 {
		return 1
	} else if x < 0 {
		return 2
	}
	return 0
}

func NewShape(name string) *Shape {
	return &Shape{Name: name}
}
`;

  // ROOT-CAUSE FIX regression: before `GO_TYPE_SPEC_WORD`/`GO_METHOD_SPEC_WORD`,
  // `type_spec` never exposed a `body` field so `isClassLike` could never match
  // it — `classNodes` derived EMPTY for Go, always, no matter how many structs
  // or interfaces a repo declared (confirmed against hugo/cobra: this silently
  // zeroed `extends`/`implements`/`mixes-in`/`satisfies` for the whole
  // language, not for lack of the construct in real code). This test used to
  // assert exactly that empty set as "the honest, documented gap, not a bug" —
  // it now asserts the fixed behaviour instead: `type_spec` (Go's ONE node
  // type for every `type X ...` declaration — struct, interface, and the
  // scalar alias `UserID` all included) is class-like.
  it("`type_spec` is class-like for EVERY Go type declaration — struct, interface, and scalar alias alike", async () => {
    const root = await parseRoot("tree-sitter-go.wasm", GO_SOURCE);
    const sets = deriveNodeSets(root, ["type_declaration"]);

    expect(sets.classNodes.has("type_spec")).toBe(true);
    // Go has no OOP constructor at all — no node type here should ever be
    // treated as one (there is nothing to derive it FROM: no dedicated
    // grammar rule, and `NewShape` is just a function under a naming
    // convention, not a language-mandated spelling like Ruby/Python/JS's).
    expect(sets.constructorNodes.size).toBe(0);
    // The Go-only exception this module documents: struct declarations get
    // added back for CLONE fingerprinting too, via `extraCloneNodes` — on
    // top of `type_spec` now already being in `cloneNodes` via `classNodes`.
    expect(sets.cloneNodes.has("type_declaration")).toBe(true);
    expect(sets.cloneNodes.has("type_spec")).toBe(true);
  });

  // ROOT-CAUSE FIX, second half: an interface's method signature
  // (`method_spec`, e.g. `Area() int` above) never has a `body` — by
  // construction of the language, a signature has no implementation — so
  // `isFunctionLike` alone can never match it, unlike Java/C#'s
  // `method_declaration`, which covers an abstract signature AND a concrete
  // method under the SAME node type (one probed concrete instance is then
  // enough for both forms). Without this, `graph/edges/satisfies-derive.ts`
  // would still find zero comparable member signatures for every Go
  // interface even after `type_spec` became class-like above.
  it("`method_spec` (an interface's body-less method signature) is function-like", async () => {
    const root = await parseRoot("tree-sitter-go.wasm", GO_SOURCE);
    const sets = deriveNodeSets(root, ["type_declaration"]);

    const methodSpec = findFirst(root, "method_spec");
    expect(methodSpec).not.toBeNull();
    expect(methodSpec!.childForFieldName("body")).toBeNull();
    expect(sets.functionNodes.has("method_spec")).toBe(true);
  });

  it("still derives functions and the if/elsif ladder generically", async () => {
    const root = await parseRoot("tree-sitter-go.wasm", GO_SOURCE);
    const sets = deriveNodeSets(root, ["type_declaration"]);
    expect(sets.functionNodes.has("function_declaration")).toBe(true);
    expect(sets.chainNodes.size).toBeGreaterThan(0);
  });
});

describe("deriveNodeSets — python", () => {
  const PYTHON_SOURCE = `
class Shape:
    def __init__(self, name):
        self.name = name

    def area(self, x):
        if x > 0:
            return 1
        elif x < 0:
            return 2
        return 0

    def ternary(self, x):
        return 1 if x > 0 else 2

    def risky(self):
        try:
            go()
        except Exception as e:
            handle(e)
`;

  it("Python's `conditional_expression` ternary has no named fields at all — matched by NAME, not by isIfLike shape", async () => {
    const root = await parseRoot("tree-sitter-python.wasm", PYTHON_SOURCE);
    const sets = deriveNodeSets(root);

    const ternaryNode = findFirst(root, "conditional_expression");
    expect(ternaryNode).not.toBeNull();
    // Confirms the module docstring's claim directly: no condition/alternative
    // fields resolve on this node, so ONLY the name-based fallback could ever
    // have caught it.
    expect(ternaryNode!.childForFieldName("condition")).toBeNull();
    expect(ternaryNode!.childForFieldName("alternative")).toBeNull();

    expect(sets.branchNodes.has("conditional_expression")).toBe(true);
    expect(sets.chainNodes.has("conditional_expression")).toBe(false);
    expect(sets.nestingNodes.has("conditional_expression")).toBe(false);
  });

  it("Python's `__init__` is an ordinary function under a mandated name — no dedicated constructor node either", async () => {
    const root = await parseRoot("tree-sitter-python.wasm", PYTHON_SOURCE);
    const sets = deriveNodeSets(root);
    expect(sets.constructorNodes.size).toBe(0);
    expect(sets.exceptionNodes.has("except_clause")).toBe(true);
  });
});
