/**
 * `references.ts` — verified against REAL grammars (`web-tree-sitter` +
 * `tree-sitter-wasms`), same infra `code-grammar.test.ts`/
 * `code-analyzer.test.ts` already use: a hand-built fake node tree would not
 * catch a wrong field name, and this module's whole job is field names.
 *
 * Per-language coverage lives in `fixtures/refs.*`, one file per grammar,
 * each exercising: a bare-constant receiver call (`PathManager.join`), a
 * plain-value receiver call (`array.join`/`obj.method`), an object/hash key,
 * a parameter (with a default value that is itself a legitimate reference),
 * a local binding, and a bare call. Scope-nesting, local-shadow-crossing and
 * occurrence dedup are covered separately with small inline snippets, where
 * pinning down the exact construct matters more than grammar breadth.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { deriveNodeSets, type ProbeNode } from "../code-grammar.js";
import { extractReferences, type ReferenceFacts } from "./references.js";
// P4 (Ola P): la promesa `scope` ↔ `container` se comprueba CONTRA el módulo
// hermano, no contra un literal — ver el test del receptor declarado.
import { extractSymbols } from "./symbols.js";

const require = createRequire(import.meta.url);
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

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
async function parseSource(wasmFile: string, source: string): Promise<ProbeNode> {
  const parser = await parserFor(wasmFile);
  return parser.parse(source).rootNode as ProbeNode;
}
async function extractFromSource(wasmFile: string, source: string): Promise<readonly ReferenceFacts[]> {
  const root = await parseSource(wasmFile, source);
  const sets = deriveNodeSets(root as any);
  return extractReferences(root as any, sets);
}
async function extractFixture(wasmFile: string, fixture: string): Promise<readonly ReferenceFacts[]> {
  const source = fs.readFileSync(path.join(FIXTURES, fixture), "utf8");
  return extractFromSource(wasmFile, source);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Every row matching `name` (and `role`/`qualifier` when given), for assertions without hand-indexing the array. */
function rowsFor(
  refs: readonly ReferenceFacts[],
  name: string,
  filter: { role?: ReferenceFacts["role"]; qualifier?: string | null } = {},
): ReferenceFacts[] {
  return refs.filter(
    (r) => r.name === name && (filter.role === undefined || r.role === filter.role) && (filter.qualifier === undefined || r.qualifier === filter.qualifier),
  );
}

describe("extractReferences — per-language role classification", () => {
  it("ruby: bare-constant receiver, value receiver, qualified scope_resolution, key, parameter, binding", async () => {
    const refs = await extractFixture("tree-sitter-ruby.wasm", "refs.rb");

    const pathManagerJoin = rowsFor(refs, "join", { role: "receiver-member", qualifier: "PathManager" });
    expect(pathManagerJoin).toHaveLength(1);
    expect(pathManagerJoin[0]?.qualifierIsBareConstant).toBe(true);

    const arrayJoin = rowsFor(refs, "join", { role: "receiver-member", qualifier: "array" });
    expect(arrayJoin).toHaveLength(1);
    expect(arrayJoin[0]?.qualifierIsBareConstant).toBe(false);

    // `Jekyll::External.require_with_graceful_fail(path)`: the call's own
    // receiver is the WHOLE `scope_resolution` node, not a bare constant.
    const scoped = rowsFor(refs, "require_with_graceful_fail", { role: "receiver-member" });
    expect(scoped).toHaveLength(1);
    expect(scoped[0]?.qualifier).toBe("Jekyll::External");
    expect(scoped[0]?.qualifierIsBareConstant).toBe(false);

    // Inside that same scope_resolution, "External" IS qualified by the bare constant "Jekyll".
    const external = rowsFor(refs, "External", { role: "qualified", qualifier: "Jekyll" });
    expect(external).toHaveLength(1);
    expect(external[0]?.qualifierIsBareConstant).toBe(true);

    expect(rowsFor(refs, "bar", { role: "key" })).toHaveLength(1);
    expect(rowsFor(refs, "path", { role: "parameter" })).toHaveLength(1);
    expect(rowsFor(refs, "options", { role: "parameter" })).toHaveLength(1);
    expect(rowsFor(refs, "local", { role: "decl-name" })).toHaveLength(1);

    // The declaration names of the enclosing module/class/method are candidates too (role decl-name), not silently dropped.
    expect(rowsFor(refs, "Jekyll", { role: "decl-name" })).toHaveLength(1);
    expect(rowsFor(refs, "Renderer", { role: "decl-name" })).toHaveLength(1);
    expect(rowsFor(refs, "render", { role: "decl-name" })).toHaveLength(1);

    const render = rowsFor(refs, "render", { role: "decl-name" })[0]!;
    expect(render.scope).toEqual(["Jekyll", "Renderer"]);
  });

  it("typescript: receiver-member, qualified nested_type_identifier, key, parameter with default, binding", async () => {
    // `.txt`, not `.ts`: a real `.ts` file under `src/` would be picked up by
    // `tsconfig.json`'s `include` and fail `tsc --noEmit` as invalid TypeScript
    // (this fixture's whole point is to exercise grammar shapes, not compile).
    const refs = await extractFixture("tree-sitter-typescript.wasm", "refs-typescript.txt");

    expect(rowsFor(refs, "join", { role: "receiver-member", qualifier: "PathManager" })[0]?.qualifierIsBareConstant).toBe(false);
    expect(rowsFor(refs, "join", { role: "receiver-member", qualifier: "array" })[0]?.qualifierIsBareConstant).toBe(false);

    // `type Q = A.B;` — nested_type_identifier(module=A, name=B): B is qualified by A, but TS
    // never distinguishes a type-shaped receiver from a value one (documented gap), so false.
    const b = rowsFor(refs, "B", { role: "qualified", qualifier: "A" });
    expect(b).toHaveLength(1);
    expect(b[0]?.qualifierIsBareConstant).toBe(false);

    expect(rowsFor(refs, "key", { role: "key" })).toHaveLength(1);
    expect(rowsFor(refs, "options", { role: "parameter" })).toHaveLength(1);
    // The default value `DEFAULTS` is a real reference, not swallowed by the parameter role.
    expect(rowsFor(refs, "DEFAULTS", { role: "bare" })).toHaveLength(1);
    expect(rowsFor(refs, "local", { role: "decl-name" })).toHaveLength(1);
  });

  it("javascript: bare parameter (no type wrapper) still yields parameter role, default value stays a reference", async () => {
    const refs = await extractFixture("tree-sitter-javascript.wasm", "refs.js");
    expect(rowsFor(refs, "path", { role: "parameter" })).toHaveLength(1);
    expect(rowsFor(refs, "options", { role: "parameter" })).toHaveLength(1);
    expect(rowsFor(refs, "DEFAULTS", { role: "bare" })).toHaveLength(1);
    expect(rowsFor(refs, "join", { role: "receiver-member", qualifier: "PathManager" })[0]?.qualifierIsBareConstant).toBe(false);
  });

  it("go: selector_expression receiver-member, := binding is not a reference", async () => {
    const refs = await extractFixture("tree-sitter-go.wasm", "refs.go");
    expect(rowsFor(refs, "Func", { role: "receiver-member", qualifier: "pkg" })).toHaveLength(1);
    expect(rowsFor(refs, "Method", { role: "receiver-member", qualifier: "obj" })).toHaveLength(1);
    // Go's grammar exposes no `key` field on `keyed_element` for EITHER map or struct composite
    // literals (confirmed by direct parse of both shapes) — a real, declared gap: `role: "key"`
    // structurally never fires for Go. The map literal's own key here is a string LITERAL anyway
    // (`"key"`), not an identifier, so it is correctly invisible to this module entirely.
    expect(rowsFor(refs, "path", { role: "parameter" })).toHaveLength(1);
    expect(rowsFor(refs, "local", { role: "decl-name" })).toHaveLength(1); // Go's `:=`, not `assignment`
  });

  it("java: field_access AND method_invocation both land on receiver-member via the shared `name` field", async () => {
    const refs = await extractFixture("tree-sitter-java.wasm", "refs.java");
    expect(rowsFor(refs, "CONST", { role: "receiver-member", qualifier: "pkg.sub.Type" })).toHaveLength(1);
    expect(rowsFor(refs, "method", { role: "receiver-member", qualifier: "obj" })).toHaveLength(1);
    expect(rowsFor(refs, "path", { role: "parameter" })).toHaveLength(1);
  });

  it("python: attribute.attribute receiver-member, def default value", async () => {
    const refs = await extractFixture("tree-sitter-python.wasm", "refs.py");
    expect(rowsFor(refs, "CONST", { role: "receiver-member", qualifier: "pkg.sub.Type" })).toHaveLength(1);
    expect(rowsFor(refs, "method", { role: "receiver-member", qualifier: "obj" })).toHaveLength(1);
    // NOT asserted here: Python's dict-literal `key` field always holds an EXPRESSION — there is
    // no `{key: value}` shorthand the way JS/Ruby have it, so even a bare-identifier key is a
    // variable READ, never a name literal. Tagging it `role: "key"` the same way as the other
    // languages would be a real, minor over-application for a variable-keyed Python dict —
    // declared here, not fixed this wave (this fixture's key is a string literal, so it is not
    // even visible to this module either way).
    expect(rowsFor(refs, "DEFAULTS", { role: "bare" })).toHaveLength(1);
  });

  it("csharp: member_access_expression (expression/name) receiver-member, parameter", async () => {
    const refs = await extractFixture("tree-sitter-c_sharp.wasm", "refs.cs");
    expect(rowsFor(refs, "CONST", { role: "receiver-member", qualifier: "Ns.Sub.Type" })).toHaveLength(1);
    expect(rowsFor(refs, "Method", { role: "receiver-member", qualifier: "obj" })).toHaveLength(1);
    expect(rowsFor(refs, "path", { role: "parameter" })).toHaveLength(1);
  });
});

describe("extractReferences — scope nesting and local shadowing", () => {
  it("nests scope outer-to-inner through module/class/method, matching Anchor.symbolPath format", async () => {
    const refs = await extractFromSource(
      "tree-sitter-ruby.wasm",
      "module M\n  class C\n    def m\n      x\n    end\n  end\nend\n",
    );
    const x = rowsFor(refs, "x", { role: "bare" });
    expect(x).toHaveLength(1);
    expect(x[0]?.scope).toEqual(["M", "C", "m"]);
  });

  it("a parameter shadows a same-named global only inside ITS OWN function", async () => {
    const refs = await extractFromSource(
      "tree-sitter-ruby.wasm",
      "def a(site)\n  site\nend\ndef b\n  site\nend\n",
    );
    const inA = rowsFor(refs, "site", { role: "bare", }).find((r) => r.scope[0] === "a");
    const inB = rowsFor(refs, "site", { role: "bare" }).find((r) => r.scope[0] === "b");
    expect(inA?.shadowedLocally).toBe(true);
    expect(inB?.shadowedLocally).toBe(false);
  });

  it("a local binding shadows a later use in the same function but not an earlier one", async () => {
    const refs = await extractFromSource("tree-sitter-ruby.wasm", "def m(x)\n  x\n  x = 1\n  x\nend\n");
    const uses = rowsFor(refs, "x", { role: "bare" });
    // First use is the parameter itself (bare, but shadowed by its own binding since params seed
    // the locals set before the body is visited); the point under test is the ASSIGNMENT boundary:
    // the two `x` bare-reads collapse into ONE deduped row either way (same name/role/scope/qualifier),
    // so what this asserts is that a local declaration does not retroactively unshadow anything, and
    // occurrence collapsing (see the dedup test below) is exactly what makes this row `occurrences: 2`.
    expect(uses).toHaveLength(1);
    expect(uses[0]?.shadowedLocally).toBe(true);
    expect(uses[0]?.occurrences).toBe(2);
  });
});

describe("extractReferences — N9 (Ola O): la lista de destinos de un binding, sin el nombre de nodo de Go", () => {
  it("go: la variable de un `for … := range` es decl-name (antes caía a `bare` y sembraba un hub global)", async () => {
    const refs = await extractFromSource(
      "tree-sitter-go.wasm",
      "package main\n\nfunc f(xs []int) int {\n\ttotal := 0\n\tfor i, v := range xs {\n\t\ttotal += i + v\n\t}\n\treturn total\n}\n",
    );
    expect(rowsFor(refs, "i", { role: "decl-name" })).toHaveLength(1);
    expect(rowsFor(refs, "v", { role: "decl-name" })).toHaveLength(1);
    // …y por eso el uso posterior dentro del cuerpo queda sombreado: no puede
    // resolver a un homónimo global de otro archivo.
    expect(rowsFor(refs, "i", { role: "bare" })[0]?.shadowedLocally).toBe(true);
    expect(rowsFor(refs, "v", { role: "bare" })[0]?.shadowedLocally).toBe(true);
    // `xs` (el operando derecho del range) NO es un destino de binding.
    expect(rowsFor(refs, "xs", { role: "bare" }).length).toBeGreaterThan(0);
  });

  // P4 (Ola P) — EL RECEPTOR DECLARADO. Este test no comprueba una preferencia
  // de este módulo: comprueba la PROMESA que los dos módulos hermanos hacen
  // (`scope` de un sitio de uso == `container` + `name` de la declaración que
  // lo encierra), y por eso compara contra `extractSymbols` en vez de contra
  // un literal escrito a mano. Si alguien toca una de las dos copias de
  // `declaredReceiverTypeName` y no la otra, esto se pone rojo.
  it("go: el scope de una referencia dentro de un método con receptor incluye el TIPO, igual que el container de su declaración", async () => {
    const src = `package p

type Command struct{ n int }
type Otro struct{ n int }

func (c *Command) Execute() int {
	return usada(c.n)
}

func (o Otro) Execute() int {
	return usada(o.n)
}

func Libre() int {
	return usada(0)
}
`;
    const root = await parseSource("tree-sitter-go.wasm", src);
    const sets = deriveNodeSets(root as never);
    const refs = extractReferences(root as never, sets);
    const symbols = extractSymbols(root as never, sets);

    const usos = refs.filter((r) => r.name === "usada" && r.role === "bare");
    expect(usos.map((r) => r.scope.join("."))).toEqual(["Command.Execute", "Otro.Execute", "Libre"]);

    // La promesa, comprobada contra el otro módulo: para cada uso existe una
    // declaración cuyo `container + name` es EXACTAMENTE ese scope.
    for (const uso of usos) {
      const dueño = symbols.find((s) => [...s.container, s.name].join(".") === uso.scope.join("."));
      expect(dueño, `sin declaración para el scope ${uso.scope.join(".")}`).toBeDefined();
    }
  });

  it("go: si el tipo receptor NO está declarado en el archivo, el scope queda plano (misma brecha declarada que en symbols.ts)", async () => {
    const refs = await extractFromSource(
      "tree-sitter-go.wasm",
      "package p\n\nfunc (c *Command) Execute() int {\n\treturn usada(0)\n}\n",
    );
    expect(rowsFor(refs, "usada", { role: "bare" })[0]?.scope).toEqual(["Execute"]);
  });

  it("go: el `left` de un `binary_expression` NO se confunde con una lista de destinos (la generalización no traga operandos)", async () => {
    const refs = await extractFromSource("tree-sitter-go.wasm", "package main\n\nfunc g(a int, b int) int {\n\treturn a + b\n}\n");
    expect(rowsFor(refs, "a", { role: "decl-name" })).toHaveLength(0);
    expect(rowsFor(refs, "b", { role: "decl-name" })).toHaveLength(0);
  });
});

describe("extractReferences — Bug 2 regression: a name of nothing but underscores is never a candidate", () => {
  it("Go's `_` is excluded from every role: decl-name (var_spec, :=) and bare", async () => {
    const refs = await extractFromSource(
      "tree-sitter-go.wasm",
      "package main\n\nvar _ Iface = (*T)(nil)\n\nfunc f() {\n\tx, _ := g()\n\t_ = x\n}\n",
    );
    expect(refs.some((r) => r.name === "_")).toBe(false);
    // Sanity: a REAL identifier in the same snippet is still picked up —
    // the guard excludes only the blank name, not the whole construct.
    expect(rowsFor(refs, "x", { role: "bare" }).length).toBeGreaterThan(0);
  });
});

describe("extractReferences — occurrence dedup", () => {
  it("collapses repeated (name, role, scope, qualifier) into one row with a summed count, keeping the first position", async () => {
    const refs = await extractFromSource(
      "tree-sitter-ruby.wasm",
      "def m(x)\n  helper(x)\n  helper(x)\n  helper(x)\nend\n",
    );
    const helper = rowsFor(refs, "helper", { role: "bare" });
    expect(helper).toHaveLength(1);
    expect(helper[0]?.occurrences).toBe(3);
    expect(helper[0]?.line).toBe(2); // first occurrence, not the last

    const xUses = rowsFor(refs, "x", { role: "bare" });
    expect(xUses).toHaveLength(1);
    expect(xUses[0]?.occurrences).toBe(3);
  });

  it("does NOT collapse the same name across different roles or different qualifiers", async () => {
    const refs = await extractFromSource(
      "tree-sitter-ruby.wasm",
      "def m\n  join\n  a.join\n  b.join\nend\n",
    );
    expect(rowsFor(refs, "join", { role: "bare" })).toHaveLength(1);
    expect(rowsFor(refs, "join", { role: "receiver-member", qualifier: "a" })).toHaveLength(1);
    expect(rowsFor(refs, "join", { role: "receiver-member", qualifier: "b" })).toHaveLength(1);
  });

  it("does NOT collapse the same (name, role, scope, qualifier) across a call site and a plain value use", async () => {
    // `foo` is called once (isCallee: true) and then passed BARE as a value
    // (isCallee: false) — same name/role/scope/qualifier, so without
    // `isCallee` in the dedup key this would wrongly collapse to one row.
    const refs = await extractFromSource(
      "tree-sitter-ruby.wasm",
      "def m\n  foo(1)\n  bar(foo)\nend\n",
    );
    const foo = rowsFor(refs, "foo", { role: "bare" });
    expect(foo).toHaveLength(2);
    expect(foo.some((r) => r.isCallee === true && r.occurrences === 1)).toBe(true);
    expect(foo.some((r) => r.isCallee === false && r.occurrences === 1)).toBe(true);
  });
});

describe("extractReferences — isCallee (CONTRATO-F8G.md §3.1)", () => {
  it("ruby: receiver-less call, receiver call (single `call` node, no intermediate member-access), scoped receiver call, non-call reference", async () => {
    const refs = await extractFixture("tree-sitter-ruby.wasm", "refs.rb");
    // `helper(local)` — CASE A, bare call.
    expect(rowsFor(refs, "helper", { role: "bare" })[0]?.isCallee).toBe(true);
    // `foo(bar: options)` — CASE A, bare call with a hash-literal argument.
    expect(rowsFor(refs, "foo", { role: "bare" })[0]?.isCallee).toBe(true);
    // `PathManager.join(path, "x")` / `array.join(",")` — CASE A: Ruby's `call`
    // node carries receiver + method + arguments as SIBLING fields, no nesting.
    expect(rowsFor(refs, "join", { role: "receiver-member", qualifier: "PathManager" })[0]?.isCallee).toBe(true);
    expect(rowsFor(refs, "join", { role: "receiver-member", qualifier: "array" })[0]?.isCallee).toBe(true);
    // `Jekyll::External.require_with_graceful_fail(path)` — receiver is a whole
    // `scope_resolution` node, still the same single-node CASE A shape.
    expect(rowsFor(refs, "require_with_graceful_fail", { role: "receiver-member" })[0]?.isCallee).toBe(true);
    // `path`/`options`/`local` are never a callee anywhere in this fixture.
    expect(rowsFor(refs, "path", { role: "parameter" })[0]?.isCallee).toBe(false);
    expect(rowsFor(refs, "local", { role: "decl-name" })[0]?.isCallee).toBe(false);
  });

  it("ruby: a bare read with no arguments and no block is NOT a callee (declared gap)", async () => {
    // `obj.value` — no parens, no arguments node, no block: structurally
    // indistinguishable from a plain attribute read (CONTRATO-F8G.md §3.1).
    const refs = await extractFromSource("tree-sitter-ruby.wasm", "def m\n  obj.value\nend\n");
    expect(rowsFor(refs, "value", { role: "receiver-member", qualifier: "obj" })[0]?.isCallee).toBe(false);
  });

  it("ruby: a block-only call (no parens, no positional arguments) is also NOT a callee (declared gap, block field not treated as evidence)", async () => {
    const refs = await extractFromSource("tree-sitter-ruby.wasm", "def m\n  arr.each { |x| x }\nend\n");
    expect(rowsFor(refs, "each", { role: "receiver-member", qualifier: "arr" })[0]?.isCallee).toBe(false);
  });

  it("typescript/javascript: CASE B — the property fills the member-access node, which fills `function` of the outer call_expression", async () => {
    const tsRefs = await extractFixture("tree-sitter-typescript.wasm", "refs-typescript.txt");
    expect(rowsFor(tsRefs, "join", { role: "receiver-member", qualifier: "PathManager" })[0]?.isCallee).toBe(true);
    expect(rowsFor(tsRefs, "join", { role: "receiver-member", qualifier: "array" })[0]?.isCallee).toBe(true);
    // `helper(local)` — CASE A, bare call_expression.
    expect(rowsFor(tsRefs, "helper", { role: "bare" })[0]?.isCallee).toBe(true);
    // `type Q = A.B;` — a type position, never a call.
    expect(rowsFor(tsRefs, "B", { role: "qualified", qualifier: "A" })[0]?.isCallee).toBe(false);

    const jsRefs = await extractFixture("tree-sitter-javascript.wasm", "refs.js");
    expect(rowsFor(jsRefs, "join", { role: "receiver-member", qualifier: "PathManager" })[0]?.isCallee).toBe(true);
    expect(rowsFor(jsRefs, "helper", { role: "bare" })[0]?.isCallee).toBe(true);
    // `options = DEFAULTS` — a default parameter VALUE, never invoked.
    expect(rowsFor(jsRefs, "DEFAULTS", { role: "bare" })[0]?.isCallee).toBe(false);
  });

  it("go: CASE B via selector_expression, CASE A for the bare call, chained call resolves only the outermost accessor", async () => {
    const refs = await extractFixture("tree-sitter-go.wasm", "refs.go");
    expect(rowsFor(refs, "Func", { role: "receiver-member", qualifier: "pkg" })[0]?.isCallee).toBe(true);
    expect(rowsFor(refs, "Method", { role: "receiver-member", qualifier: "obj" })[0]?.isCallee).toBe(true);
    expect(rowsFor(refs, "helper", { role: "bare" })[0]?.isCallee).toBe(true);
    expect(rowsFor(refs, "local", { role: "decl-name" })[0]?.isCallee).toBe(false);

    // `newShape().Area()` — chained: BOTH the inner bare call (CASE A) and the
    // outer method call (CASE B) are flagged; nothing in between is.
    const chain = await extractFromSource(
      "tree-sitter-go.wasm",
      "package main\nfunc f() {\n\tnewShape().Area()\n}\n",
    );
    expect(rowsFor(chain, "newShape", { role: "bare" })[0]?.isCallee).toBe(true);
    expect(rowsFor(chain, "Area", { role: "receiver-member" })[0]?.isCallee).toBe(true);
  });

  it("java: CASE A covers BOTH the receiver-less call and the with-receiver call (method_invocation conflates object+name+arguments in one node); a plain field_access is never a callee", async () => {
    const refs = await extractFixture("tree-sitter-java.wasm", "refs.java");
    expect(rowsFor(refs, "method", { role: "receiver-member", qualifier: "obj" })[0]?.isCallee).toBe(true);
    expect(rowsFor(refs, "helper", { role: "bare" })[0]?.isCallee).toBe(true);
    // `pkg.sub.Type.CONST.toString()` — `CONST` is a plain `field_access.field`
    // (no `arguments` anywhere near it), only `toString` is actually invoked.
    expect(rowsFor(refs, "CONST", { role: "receiver-member", qualifier: "pkg.sub.Type" })[0]?.isCallee).toBe(false);
    const chain = await extractFromSource(
      "tree-sitter-java.wasm",
      "class C { void f() {\n  pkg.sub.Type.CONST.toString();\n} }\n",
    );
    expect(rowsFor(chain, "toString", { role: "receiver-member" })[0]?.isCallee).toBe(true);
  });

  it("python: CASE B via `attribute`, CASE A for the bare call; a plain attribute chain with no call is never a callee", async () => {
    const refs = await extractFixture("tree-sitter-python.wasm", "refs.py");
    expect(rowsFor(refs, "method", { role: "receiver-member", qualifier: "obj" })[0]?.isCallee).toBe(true);
    expect(rowsFor(refs, "helper", { role: "bare" })[0]?.isCallee).toBe(true);
    expect(rowsFor(refs, "CONST", { role: "receiver-member", qualifier: "pkg.sub.Type" })[0]?.isCallee).toBe(false);
  });

  it("c#: CASE B via member_access_expression, CASE A for the bare call; a decorator-free plain field access in a chain is never a callee", async () => {
    const refs = await extractFixture("tree-sitter-c_sharp.wasm", "refs.cs");
    expect(rowsFor(refs, "Method", { role: "receiver-member", qualifier: "obj" })[0]?.isCallee).toBe(true);
    expect(rowsFor(refs, "Helper", { role: "bare" })[0]?.isCallee).toBe(true);
    expect(rowsFor(refs, "CONST", { role: "receiver-member", qualifier: "Ns.Sub.Type" })[0]?.isCallee).toBe(false);
  });

  it("an empty argument list (`foo()`) still counts as a call — presence of the (possibly empty) arguments node is what matters", async () => {
    const refs = await extractFromSource("tree-sitter-ruby.wasm", "def m\n  foo()\nend\n");
    expect(rowsFor(refs, "foo", { role: "bare" })[0]?.isCallee).toBe(true);
  });

  it("java: an annotation (`@Target({...})`) is NOT a callee, even though `annotation` resolves the exact same `name`+`arguments` field shape as `method_invocation` (measured false-positive, corpus sample: guava's Beta.java)", async () => {
    const refs = await extractFromSource(
      "tree-sitter-java.wasm",
      "@Target({ElementType.TYPE})\n@Retention(RetentionPolicy.CLASS)\npublic @interface Beta {}\n",
    );
    expect(rowsFor(refs, "Target", { role: "bare" })[0]?.isCallee).toBe(false);
    expect(rowsFor(refs, "Retention", { role: "bare" })[0]?.isCallee).toBe(false);
  });
});

/**
 * OLA P (P2) — `argCounts`: cuántos argumentos pasa cada SITIO de llamada.
 * `SymbolFacts.arity` (la aridad DECLARADA) ya existía; esto es la otra
 * mitad, pedida por N6 en la Ola O. Se prueba contra gramáticas reales, con
 * las mismas dos formas (CASE A / CASE B) que `isCallee` ya cubre.
 */
describe("extractReferences — argCounts (Ola P, aridad por sitio de llamada)", () => {
  it("ruby: cuenta los argumentos reales de cada sitio, y ausente cuando no hay lista de argumentos", async () => {
    const refs = await extractFromSource("tree-sitter-ruby.wasm", "def m\n  helper(1, 2)\n  vacia()\n  obj.value\nend\n");
    expect(rowsFor(refs, "helper", { role: "bare" })[0]?.argCounts).toEqual([2]);
    // Una llamada SIN argumentos resuelve una lista VACÍA pero real: `[0]`, no ausente.
    expect(rowsFor(refs, "vacia", { role: "bare" })[0]?.argCounts).toEqual([0]);
    // `obj.value` no resuelve `arguments`: misma brecha declarada que `isCallee`.
    expect(rowsFor(refs, "value", { role: "receiver-member", qualifier: "obj" })[0]?.argCounts).toBeUndefined();
  });

  it("dos sitios del MISMO nombre y scope con distinta cantidad de argumentos NO colapsan a uno: la fila lleva los dos conteos, ordenados", async () => {
    const refs = await extractFromSource("tree-sitter-ruby.wasm", "def m\n  f(1)\n  f(1, 2, 3)\n  f(1)\nend\n");
    const filas = rowsFor(refs, "f", { role: "bare" });
    expect(filas).toHaveLength(1);
    expect(filas[0]?.occurrences).toBe(3);
    expect(filas[0]?.argCounts).toEqual([1, 3]);
  });

  it("typescript: CASE B (obj.metodo(x, y)) cuenta los argumentos del call_expression EXTERNO, no del member-access", async () => {
    const refs = await extractFromSource("tree-sitter-typescript.wasm", "function m() {\n  obj.metodo(a, b, c);\n  bare();\n}\n");
    expect(rowsFor(refs, "metodo", { role: "receiver-member", qualifier: "obj" })[0]?.argCounts).toEqual([3]);
    expect(rowsFor(refs, "bare", { role: "bare" })[0]?.argCounts).toEqual([0]);
  });

  it("python: los argumentos con nombre cuentan como argumentos; un comentario adentro del paréntesis no", async () => {
    const refs = await extractFromSource("tree-sitter-python.wasm", "def m():\n    f(1, x=2)\n    g(  # nota\n        1)\n");
    expect(rowsFor(refs, "f", { role: "bare" })[0]?.argCounts).toEqual([2]);
    expect(rowsFor(refs, "g", { role: "bare" })[0]?.argCounts).toEqual([1]);
  });

  it("go: CASE B vía selector_expression", async () => {
    const refs = await extractFromSource("tree-sitter-go.wasm", "package p\n\nfunc m() {\n\tpkg.Func(a, b)\n\tlibre()\n}\n");
    expect(rowsFor(refs, "Func", { role: "receiver-member", qualifier: "pkg" })[0]?.argCounts).toEqual([2]);
    expect(rowsFor(refs, "libre", { role: "bare" })[0]?.argCounts).toEqual([0]);
  });
});

/**
 * AA6 (Ola AA) — `inTypeSlot`: LA RANURA DE TIPO DE LA GRAMÁTICA.
 *
 * Qué INTENCIÓN verifica cada caso: no "el nodo se llama `type_identifier`"
 * (eso es la forma, y cambia de gramática en gramática), sino **"la gramática
 * escribió este nombre en la ranura donde va un TIPO"** — el campo
 * `type`/`return_type`/`result`, atravesando los envoltorios intermedios que
 * cada gramática interpone. Los seis lenguajes con tipos escritos se prueban
 * con la MISMA aserción, y los dos que no los tienen se prueban en negativo.
 */
describe("extractReferences — inTypeSlot (AA6, la ranura de tipo)", () => {
  it("python: el tipo del parámetro, el del retorno y el de una anotación de asignación son ranura; el valor NO", async () => {
    const refs = await extractFromSource(
      "tree-sitter-python.wasm",
      "def uno(x: Alfa, y: Any = None) -> Dict[str, Beta]:\n    z: Gamma = x\n    return Delta(x)\n",
    );
    expect(rowsFor(refs, "Alfa")[0]?.inTypeSlot).toBe(true);
    expect(rowsFor(refs, "Any")[0]?.inTypeSlot).toBe(true);
    // `Dict[str, Beta]` — el envoltorio `generic_type`/`type_parameter` NO corta la ranura.
    expect(rowsFor(refs, "Dict")[0]?.inTypeSlot).toBe(true);
    expect(rowsFor(refs, "Beta")[0]?.inTypeSlot).toBe(true);
    expect(rowsFor(refs, "Gamma")[0]?.inTypeSlot).toBe(true);
    // El VALOR de la anotación (`= x`) y una llamada del cuerpo no lo son.
    expect(rowsFor(refs, "Delta", { role: "bare" })[0]?.inTypeSlot).toBe(false);
    expect(rowsFor(refs, "x", { role: "bare" }).every((r) => r.inTypeSlot === false)).toBe(true);
  });

  it("go: `type` del parámetro y `result` del retorno son ranura, atravesando pointer/map/slice", async () => {
    const refs = await extractFromSource(
      "tree-sitter-go.wasm",
      "package p\n\nfunc uno(x *Alfa, m map[string]Beta) []Gamma {\n\tvar z Delta\n\treturn hacer(z)\n}\n",
    );
    expect(rowsFor(refs, "Alfa")[0]?.inTypeSlot).toBe(true); // pointer_type
    expect(rowsFor(refs, "Beta")[0]?.inTypeSlot).toBe(true); // map_type[value]
    expect(rowsFor(refs, "Gamma")[0]?.inTypeSlot).toBe(true); // slice_type bajo `result`
    expect(rowsFor(refs, "Delta")[0]?.inTypeSlot).toBe(true); // var_spec[type]
    expect(rowsFor(refs, "hacer", { role: "bare" })[0]?.inTypeSlot).toBe(false);
  });

  it("typescript: `type_annotation` no corta la ranura, ni en parámetro ni en retorno ni en binding local", async () => {
    const refs = await extractFromSource(
      "tree-sitter-typescript.wasm",
      "function uno(x: Alfa, y?: Beta): Gamma[] {\n  const z: Delta = crear(x);\n  return [z];\n}\n",
    );
    expect(rowsFor(refs, "Alfa")[0]?.inTypeSlot).toBe(true);
    expect(rowsFor(refs, "Beta")[0]?.inTypeSlot).toBe(true);
    expect(rowsFor(refs, "Gamma")[0]?.inTypeSlot).toBe(true);
    expect(rowsFor(refs, "Delta")[0]?.inTypeSlot).toBe(true);
    expect(rowsFor(refs, "crear", { role: "bare" })[0]?.inTypeSlot).toBe(false);
  });

  it("java: tipo de campo, de parámetro, de retorno y de variable local, incluido el argumento genérico", async () => {
    const refs = await extractFromSource(
      "tree-sitter-java.wasm",
      "class C {\n  private Alfa campo;\n  public Beta uno(Gamma x, java.util.List<Delta> y) {\n    Epsilon z = x.get();\n    return null;\n  }\n}\n",
    );
    for (const n of ["Alfa", "Beta", "Gamma", "Delta", "Epsilon"]) {
      expect(rowsFor(refs, n)[0]?.inTypeSlot, n).toBe(true);
    }
    expect(rowsFor(refs, "get", { role: "receiver-member" })[0]?.inTypeSlot).toBe(false);
  });

  it("c#: `variable_declaration[type]`, `parameter[type]` y `method_declaration[type]`, atravesando qualified_name/generic_name", async () => {
    const refs = await extractFromSource(
      "tree-sitter-c_sharp.wasm",
      "class C {\n  private Alfa campo;\n  public Beta Uno(Gamma x, System.Collections.Generic.List<Delta> y) {\n    Epsilon z = x.Get();\n    return null;\n  }\n}\n",
    );
    for (const n of ["Alfa", "Beta", "Gamma", "Delta", "Epsilon"]) {
      expect(rowsFor(refs, n)[0]?.inTypeSlot, n).toBe(true);
    }
    expect(rowsFor(refs, "Get", { role: "receiver-member" })[0]?.inTypeSlot).toBe(false);
  });

  it("BRECHA DECLARADA: ruby y javascript no tienen ranura de tipo, así que todo sale `false` — no se parcha con una convención", async () => {
    const rb = await extractFromSource("tree-sitter-ruby.wasm", "class Alfa\n  def uno(x, y = nil)\n    Beta.new(x)\n  end\nend\n");
    expect(rb.every((r) => r.inTypeSlot === false)).toBe(true);
    const js = await extractFromSource("tree-sitter-javascript.wasm", "function uno(x, ...props) {\n  return Alfa(props);\n}\n");
    expect(js.every((r) => r.inTypeSlot === false)).toBe(true);
  });

  it("el mismo nombre escrito como TIPO y como VALOR en el mismo scope no colapsa a una fila", async () => {
    const refs = await extractFromSource("tree-sitter-typescript.wasm", "function m() {\n  const a: Alfa = otra;\n  usar(Alfa);\n}\n");
    const filas = rowsFor(refs, "Alfa", { role: "bare" });
    expect(filas).toHaveLength(2);
    expect(filas.map((f) => f.inTypeSlot).sort()).toEqual([false, true]);
  });
});
