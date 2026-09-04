/**
 * Sonda C2 (Ola U) — HUECOS DE GRAFO #1 y #2 del PLAN-INTENCIONES.
 *
 * #1: qué escribe cada gramática para `this.x = param` DENTRO del constructor.
 * #2: qué campo lleva el TIPO DE RETORNO declarado de un miembro.
 *
 * No lee ninguna tabla: parsea y vuelca. Ver `scripts/probes/p4-recv.mts`
 * para el mismo andamiaje.
 */
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const mod = require("web-tree-sitter") as any;
const Parser = mod.Parser ?? mod.default ?? mod;
await Parser.init();
const Language = Parser.Language ?? mod.Language;
function wasmPath(f: string) {
  return path.join(path.dirname(require.resolve("tree-sitter-wasms/package.json")), "out", f);
}
async function P(w: string) {
  const l = await Language.load(wasmPath(w));
  const p = new Parser();
  p.setLanguage(l);
  return p;
}

const FIELDS = ["name", "type", "left", "right", "object", "property", "field", "result", "return_type", "body", "parameters", "parameter_list", "value", "declarator"];
function dump(n: any, d = 0, maxd = 8) {
  if (d > maxd) return;
  const fields: string[] = [];
  for (const f of FIELDS) {
    try {
      if (n.childForFieldName(f)) fields.push(f);
    } catch {}
  }
  console.log("  ".repeat(d) + n.type + (n.isNamed ? "" : " (anon)") + " [" + fields.join(",") + "] " + JSON.stringify(n.text.slice(0, 50)));
  for (let i = 0; i < n.childCount; i++) dump(n.child(i), d + 1, maxd);
}

const CASES: Record<string, { wasm: string; src: string; depth: number }> = {
  python: {
    wasm: "tree-sitter-python.wasm",
    depth: 8,
    src: `
class Bag:
    def __init__(self, items):
        self.items = items
        self._n = 0
        local = 1
    def size(self) -> int:
        return self._n
`,
  },
  ruby: {
    wasm: "tree-sitter-ruby.wasm",
    depth: 8,
    src: `
class Bag
  def initialize(items)
    @items = items
    @n = 0
    local = 1
  end
  def size
    @n
  end
end
`,
  },
  typescript: {
    wasm: "tree-sitter-typescript.wasm",
    depth: 9,
    src: `
class Bag {
  private declared: number = 0;
  constructor(items: string[]) {
    this.items = items;
    this.n = 0;
    const local = 1;
  }
  size(): number { return this.n; }
}
`,
  },
  javascript: {
    wasm: "tree-sitter-javascript.wasm",
    depth: 9,
    src: `
class Bag {
  constructor(items) {
    this.items = items;
    const local = 1;
  }
  size() { return this.n; }
}
`,
  },
  java: {
    wasm: "tree-sitter-java.wasm",
    depth: 9,
    src: `
class Bag {
  private int n;
  Bag(int[] items) { this.items = items; this.n = 0; }
  public java.util.Iterator<String> iterator() { return null; }
  int size() { return n; }
}
`,
  },
  csharp: {
    wasm: "tree-sitter-c_sharp.wasm",
    depth: 9,
    src: `
class Bag {
  private int n;
  public Bag(int[] items) { this.items = items; this.n = 0; }
  public IEnumerator<BsonProperty> GetEnumerator() { return null; }
}
`,
  },
  go: {
    wasm: "tree-sitter-go.wasm",
    depth: 8,
    src: `
package p
type Bag struct { n int }
func NewBag(n int) *Bag { b := &Bag{}; b.n = n; return b }
func (b *Bag) Size() (int, error) { return b.n, nil }
`,
  },
};

const only = process.argv[2];
for (const [lang, c] of Object.entries(CASES)) {
  if (only && lang !== only) continue;
  console.log(`\n═══════════ ${lang} ═══════════`);
  const p = await P(c.wasm);
  dump(p.parse(c.src).rootNode, 0, c.depth);
}
