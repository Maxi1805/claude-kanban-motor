/** AK6 — depuración: por qué la fixture Java de `optional-behavior-flags` no emite. */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { deriveNodeSets } from "../src/server/services/code-grammar.js";
import { capabilityUnitsOf } from "../src/server/services/detect/intra-file/optional-behavior-flags.js";

const require = createRequire(import.meta.url);
const Parser = require("web-tree-sitter");

await Parser.init();
const parser = new Parser();
import path from "node:path";
const wasm = path.join(path.dirname(require.resolve("tree-sitter-wasms/package.json")), "out", "tree-sitter-java.wasm");
const lang = await Parser.Language.load(wasm);
parser.setLanguage(lang);

const PROBE = "class Probe { int method(int x) { if (x > 0) { return 1; } else { return 2; } for (int i = 0; i < x; i++) { } switch (x) { case 1: return 1; default: return 0; } } }\n";
const sets = deriveNodeSets(parser.parse(PROBE).rootNode);
console.log("chainNodes", [...sets.chainNodes]);
console.log("nestingNodes", [...sets.nestingNodes]);
console.log("switchContainerNodes", [...sets.switchContainerNodes]);
console.log("classNodes", [...sets.classNodes]);
console.log("constructorNodes", [...sets.constructorNodes]);

const SRC = `
class ForcingWriter {
  private final boolean forceOnFlush;
  private final boolean forceOnClose;
  ForcingWriter(boolean forceOnFlush, boolean forceOnClose) {
    this.forceOnFlush = forceOnFlush;
    this.forceOnClose = forceOnClose;
  }
  public void flush() {
    if (forceOnFlush) { force(); }
  }
  public void close() {
    if (forceOnClose) { force(); }
  }
  private void force() { }
}
`;
const root = parser.parse(SRC).rootNode;
const units = capabilityUnitsOf(root, sets, sets.constructorNodes);
console.log(JSON.stringify(units, null, 1));

console.log("functionNodes", [...sets.functionNodes]);
const walk = (n: any, d = 0): void => {
  if (d < 4) console.log(" ".repeat(d * 2), n.type, JSON.stringify(n.text.slice(0, 50).replace(/\n/g, "\\n")));
  for (let i = 0; i < n.namedChildCount; i++) walk(n.namedChild(i), d + 1);
};
walk(root);
