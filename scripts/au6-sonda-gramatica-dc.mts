import { createRequire } from "node:module";
import path from "node:path";
const S0 = "../scratchpad-au6/src0";
const { LANGUAGE_DECLS } = await import(`${S0}/server/services/code-analyzer.js`);
const { deriveNodeSets } = await import(`${S0}/server/services/code-grammar.js`);
const require = createRequire(import.meta.url);
/* eslint-disable */
const mod = require("web-tree-sitter") as any;
const Parser = mod.Parser ?? mod.default ?? mod;
await Parser.init();
const Language = Parser.Language ?? mod.Language;
function wasmPath(f: string) { return path.join(path.dirname(require.resolve("tree-sitter-wasms/package.json")), "out", f); }

const SAMPLES: Record<string, string> = {
  java: `class P {\n  private int a;\n  private String b;\n  private long c;\n  public int getA() { return a; }\n  public void setA(int a) { this.a = a; }\n  public String getB() { return b; }\n}`,
  csharp: `class P {\n  private int a;\n  public int A { get; set; }\n  public string B { get; set; }\n  public int GetA() { return a; }\n}`,
  go: `package p\n\ntype P struct {\n  A int\n  B string\n  C bool\n}\n\nfunc (p *P) GetA() int { return p.A }\nfunc (p *P) SetA(a int) { p.A = a }`,
  ruby: `class P\n  attr_accessor :a, :b\n  attr_reader :c\n  def initialize(a, b)\n    @a = a\n    @b = b\n  end\nend`,
  python: `class P:\n    def __init__(self, a, b):\n        self.a = a\n        self.b = b\n        self.c = None\n\n    @property\n    def a2(self):\n        return self.a\n`,
  typescript: `class P {\n  public a: number = 0;\n  private b: string = "";\n  get A(): number { return this.a; }\n  set A(v: number) { this.a = v; }\n}`,
  javascript: `class P {\n  constructor(a, b) { this.a = a; this.b = b; }\n  get A() { return this.a; }\n  set A(v) { this.a = v; }\n}`,
};

const byId = new Map<string, any>();
for (const d of LANGUAGE_DECLS as any[]) byId.set(d.id, d);

for (const [id, src] of Object.entries(SAMPLES)) {
  const decl = byId.get(id)!;
  const lang = await Language.load(wasmPath(decl.wasm));
  const p = new Parser(); p.setLanguage(lang);
  const probe = p.parse(decl.probeSource);
  const sets = deriveNodeSets(probe.rootNode, decl.extraCloneNodes, decl.functionExclusions);
  const tree = p.parse(src);
  const types = new Set<string>();
  const walk = (n: any, d: number) => {
    if (n.isNamed) types.add(n.type);
    for (let i = 0; i < n.childCount; i++) { const c = n.child(i); if (c) walk(c, d + 1); }
  };
  walk(tree.rootNode, 0);
  console.log(`\n=== ${id}`);
  console.log("  classNodes   :", [...sets.classNodes].join(", "));
  console.log("  functionNodes:", [...sets.functionNodes].join(", "));
  console.log("  tipos vistos :", [...types].sort().join(" "));
}
