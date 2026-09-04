/**
 * Sonda puntual T4: ¿qué TIPO de nodo produce el gramática C# de este
 * proyecto para una llamada a método estática/simple (`Foo(bar)`)? Necesario
 * para verificar si `flag-accumulator.ts#CALL_NODE_TYPE` (`/call/i`) puede
 * reconocer una envoltura hecha con una llamada (no un `new`) en C#.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const mod = require("web-tree-sitter") as any;
const Parser = mod.Parser ?? mod.default ?? mod;
await Parser.init();
const Language = Parser.Language ?? mod.Language;

const wasmDir = path.join(path.dirname(require.resolve("tree-sitter-wasms/package.json")), "out");
const lang = await Language.load(path.join(wasmDir, "tree-sitter-c_sharp.wasm"));
const parser = new Parser();
parser.setLanguage(lang);

const src = `
class X {
  void M() {
    if (a) {
      callExpression = EnsureCastExpression(callExpression, type);
    }
    if (b) {
      callExpression = Expression.Call(readParameter, method, argsExpression);
    }
    if (c) {
      allowNonPublicAccess = true;
    }
  }
}
`;
const tree = parser.parse(src);

function dump(node: any, depth = 0) {
  console.log("  ".repeat(depth) + node.type + (node.isNamed ? "" : " (anon)"));
  for (let i = 0; i < node.childCount; i++) dump(node.child(i), depth + 1);
}
dump(tree.rootNode);
