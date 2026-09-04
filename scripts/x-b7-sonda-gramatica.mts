/** Sonda de gramática: cómo escribe cada gramática un TEST DE TIPO y un CAMPO puesto en nulo. */
import { parseRoot } from "../src/server/services/detect/testing.js";

const CASES: Record<string, { wasm: string; src: string }> = {
  javascript: {
    wasm: "tree-sitter-javascript.wasm",
    src: `
function f(x) {
  if (x instanceof Circle) { return 1; }
  else if (typeof x === "string") { return 2; }
  else if (Array.isArray(x)) { return 3; }
  return 0;
}
class C { constructor() { this.a = null; } m() { this.a = new X(); } n() { this.a = null; } }
`,
  },
  typescript: {
    wasm: "tree-sitter-typescript.wasm",
    src: `
function f(x: unknown) {
  if (x instanceof Circle) { return 1; }
  else if (typeof x === "string") { return 2; }
  return 0;
}
class C { private a: X | null = null; m() { this.a = new X(); } n() { this.a = null; } }
`,
  },
  python: {
    wasm: "tree-sitter-python.wasm",
    src: `
def f(x):
    if isinstance(x, Circle):
        return 1
    elif type(x) is Square:
        return 2
    return 0

class C:
    def __init__(self):
        self.a = None
    def m(self):
        self.a = X()
    def n(self):
        self.a = None
`,
  },
  ruby: {
    wasm: "tree-sitter-ruby.wasm",
    src: `
def f(x)
  if x.is_a?(Circle)
    1
  elsif x.kind_of?(Square)
    2
  end
end
case x
when Circle then 1
when Square then 2
end
class C
  def initialize
    @a = nil
  end
  def m
    @a = X.new
  end
  def n
    @a = nil
  end
end
`,
  },
  go: {
    wasm: "tree-sitter-go.wasm",
    src: `
package p

func f(x interface{}) int {
	switch v := x.(type) {
	case *Circle:
		return 1
	case *Square:
		return 2
	}
	if c, ok := x.(*Circle); ok {
		_ = c
	}
	return 0
}

type C struct{ a *X }

func (c *C) M() { c.a = &X{} }
func (c *C) N() { c.a = nil }
`,
  },
  java: {
    wasm: "tree-sitter-java.wasm",
    src: `
class D {
  private X a = null;
  int f(Object x) {
    if (x instanceof Circle) { return 1; }
    else if (x instanceof Square) { return 2; }
    else if (x.getClass() == Tri.class) { return 3; }
    return 0;
  }
  void m() { this.a = new X(); }
  void n() { a = null; }
}
`,
  },
  csharp: {
    wasm: "tree-sitter-c_sharp.wasm",
    src: `
class D {
  private X a = null;
  int F(object x) {
    if (x is Circle) { return 1; }
    else if (x is Square s) { return 2; }
    else if (x.GetType() == typeof(Tri)) { return 3; }
    switch (x) {
      case Circle c: return 4;
      case Square q: return 5;
    }
    return 0;
  }
  void M() { a = new X(); }
  void N() { a = null; }
}
`,
  },
};

const want = process.argv[2];
for (const [lang, { wasm, src }] of Object.entries(CASES)) {
  if (want && lang !== want) continue;
  const root = await parseRoot(wasm, src);
  console.log("=".repeat(20), lang);
  const seen = new Set<string>();
  const walk = (n: any, depth: number): void => {
    if (n.isNamed) {
      const t = n.text.replace(/\s+/g, " ").slice(0, 60);
      console.log(`${"  ".repeat(depth)}${n.type}  ::  ${t}`);
      seen.add(n.type);
    }
    for (let i = 0; i < n.childCount; i++) {
      const c = n.child(i);
      if (c) walk(c, depth + 1);
    }
  };
  walk(root, 0);
}
