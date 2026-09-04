import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const mod = require("web-tree-sitter") as any;
const Parser = mod.Parser ?? mod.default ?? mod;
await Parser.init();
const Language = Parser.Language ?? mod.Language;

const wasmDir = path.join(path.dirname(require.resolve("tree-sitter-wasms/package.json")), "out");
const lang = await Language.load(path.join(wasmDir, "tree-sitter-go.wasm"));
const parser = new Parser();
parser.setLanguage(lang);

const src = `
package x
func f() {
	if a {
		handlers = append(handlers, h)
	}
}
`;
const tree = parser.parse(src);
function dump(node: any, depth = 0) {
  console.log("  ".repeat(depth) + node.type + (node.isNamed ? "" : " (anon)"));
  for (let i = 0; i < node.childCount; i++) dump(node.child(i), depth + 1);
}
dump(tree.rootNode);
