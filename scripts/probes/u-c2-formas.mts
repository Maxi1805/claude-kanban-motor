import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const mod = require("web-tree-sitter") as any;
const Parser = mod.Parser ?? mod.default ?? mod;
await Parser.init();
const Language = Parser.Language ?? mod.Language;
function wasmPath(f: string) { return path.join(path.dirname(require.resolve("tree-sitter-wasms/package.json")), "out", f); }
async function P(w: string) { const l = await Language.load(wasmPath(w)); const p = new Parser(); p.setLanguage(l); return p; }
const RECEIVER_FIELDS = ["receiver", "object", "operand", "expression"];
const MEMBER_FIELDS = ["method", "field", "property", "attribute", "name"];
function ff(n: any, fs: string[]) { for (const f of fs) { const c = n.childForFieldName(f); if (c) return [f, c]; } return null; }
function find(n: any, pred: (x:any)=>boolean, acc: any[] = []) { if (pred(n)) acc.push(n); for (let i=0;i<n.childCount;i++){const c=n.child(i); if(c) find(c,pred,acc);} return acc; }
const cases: [string,string,string][] = [
 ["csharp","tree-sitter-c_sharp.wasm",`class B { public B(int[] i){ this.items = i; } public IEnumerator<BsonProperty> GetEnumerator(){return null;} }`],
 ["java","tree-sitter-java.wasm",`class B { B(int i){ this.items = i; } public java.util.Iterator<String> it(){return null;} int n(){return 1;} }`],
 ["typescript","tree-sitter-typescript.wasm",`class B { constructor(i:number){ this.items = i; } size(): Map<string, Foo> { return null as any; } noRet() {} }`],
 ["python","tree-sitter-python.wasm",`class B:\n    def __init__(self, i):\n        self.items = i\n    def size(self) -> int:\n        return 1\n    def bare(self):\n        return 2\n`],
 ["ruby","tree-sitter-ruby.wasm",`class B\n  def initialize(i)\n    @items = i\n  end\n  def size\n    1\n  end\nend\n`],
 ["go","tree-sitter-go.wasm",`package p\ntype B struct{}\nfunc (b *B) Size() (int, error) { return 0, nil }\nfunc (b *B) One() int { return 0 }\nfunc (b *B) None() {}\n`],
];
for (const [name, wasm, src] of cases) {
  const p = await P(wasm);
  const root = p.parse(src).rootNode;
  console.log(`\n=== ${name} ===`);
  // asignaciones
  for (const a of find(root, (n:any)=>/(^|_)assignment$|(^|_)assignment_(expression|statement)$/.test(n.type))) {
    const lhs = a.childForFieldName("left") ?? a.childForFieldName("name");
    if (!lhs) { console.log(` assign ${a.type}: SIN LHS`); continue; }
    const r = ff(lhs, RECEIVER_FIELDS); const m = ff(lhs, MEMBER_FIELDS);
    console.log(` assign ${a.type} lhs=${lhs.type} recv=${r?`${r[0]}:${JSON.stringify(r[1].text)}`:"-"} member=${m?`${m[0]}:${JSON.stringify(m[1].text)}`:"-"}`);
  }
  // retornos
  for (const f of find(root, (n:any)=>/method_declaration|function_declaration|method_definition|function_definition|^method$|method_spec|constructor_declaration/.test(n.type))) {
    const nm = f.childForFieldName("name");
    const rt = ff(f, ["return_type","result","type"]);
    let txt = rt ? rt[1].text : null;
    let unwrapped = txt;
    if (rt) { let node = rt[1]; for (let k=0;k<2;k++){ let only=null,cnt=0; for(let i=0;i<node.childCount;i++){const c=node.child(i); if(c&&c.isNamed){cnt++;only=c;}} if(cnt===1&&only&&only.text!==node.text){node=only;} else break; } unwrapped = node.text; }
    console.log(` fn ${f.type} name=${nm?nm.text:"-"} rtField=${rt?rt[0]:"-"} raw=${JSON.stringify(txt)} unwrap=${JSON.stringify(unwrapped)}`);
  }
}
