import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const mod = require("web-tree-sitter") as any;
const Parser = mod.Parser ?? mod.default ?? mod;
await Parser.init();
const Language = Parser.Language ?? mod.Language;
function wasmPath(f: string) { return path.join(path.dirname(require.resolve("tree-sitter-wasms/package.json")), "out", f); }
async function P(w: string) { const l = await Language.load(wasmPath(w)); const p = new Parser(); p.setLanguage(l); return p; }

const GO = `
package p
type Command struct { X int }
type List[T any] struct{}
func (c *Command) Name() string { return "" }
func (c Command) Value() int { return 0 }
func (l *List[T]) Push(v T) {}
func Free(x int) int { return x }
func (t *tree) walk() {}
`;
const RB = `
class Foo
  def self.build; end
end
def OBJ.thing; end
`;
function dump(n: any, d = 0, maxd = 6) {
  if (d > maxd) return;
  const fields: string[] = [];
  for (const f of ["name","type","receiver","object","parameters","body"]) {
    try { if (n.childForFieldName(f)) fields.push(f); } catch {}
  }
  console.log("  ".repeat(d) + n.type + (n.isNamed ? "" : " (anon)") + " [" + fields.join(",") + "] " + JSON.stringify(n.text.slice(0, 40)));
  for (let i = 0; i < n.childCount; i++) dump(n.child(i), d + 1, maxd);
}
const go = await P("tree-sitter-go.wasm");
dump(go.parse(GO).rootNode, 0, 5);
console.log("===RUBY===");
const rb = await P("tree-sitter-ruby.wasm");
dump(rb.parse(RB).rootNode, 0, 4);
