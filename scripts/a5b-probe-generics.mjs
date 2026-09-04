import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const mod = require("web-tree-sitter");
const Parser = mod.Parser ?? mod.default ?? mod;
await Parser.init();
const Language = Parser.Language ?? mod.Language;

function wasmPath(file) {
  return path.join(path.dirname(require.resolve("tree-sitter-wasms/package.json")), "out", file);
}

const FIELD_CANDIDATES = ["value", "subject", "condition", "pattern", "guard"];

function dump(node, indent = "") {
  const hits = FIELD_CANDIDATES.filter((f) => node.childForFieldName(f) !== null);
  console.log(`${indent}${node.type} fields=[${hits.join(",")}] "${node.text.slice(0, 40).replace(/\n/g, "\\n")}"`);
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c) dump(c, indent + "  ");
  }
}

async function probe(wasmFile, source, label) {
  const language = await Language.load(wasmPath(wasmFile));
  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(source);
  console.log(`\n=== ${label} ===`);
  dump(tree.rootNode);
}

await probe("tree-sitter-python.wasm", `def f(kind):\n    match kind:\n        case "circle":\n            return 1\n        case "square":\n            return 2\n        case _:\n            return 0\n`, "Python match/case");
await probe("tree-sitter-go.wasm", `func f(kind string) int {\n\tswitch kind {\n\tcase "circle":\n\t\treturn 1\n\tcase "square":\n\t\treturn 2\n\tdefault:\n\t\treturn 0\n\t}\n}\n`, "Go switch/case");
await probe("tree-sitter-c_sharp.wasm", `int F(string kind) {\n  switch (kind) {\n    case "circle":\n      return 1;\n    case "square":\n      return 2;\n    default:\n      return 0;\n  }\n}\n`, "C# switch/case");
await probe("tree-sitter-ruby.wasm", `def f(kind)\n  case kind\n  when :circle\n    1\n  when :square\n    2\n  else\n    0\n  end\nend\n`, "Ruby case/when");
await probe("tree-sitter-javascript.wasm", `function f(kind) {\n  switch (kind) {\n    case "circle":\n      return 1;\n    case "square":\n      return 2;\n    default:\n      return 0;\n  }\n}\n`, "JS switch/case");
await probe("tree-sitter-java.wasm", `class S {\n  String f(String kind) {\n    switch (kind) {\n      case "circle":\n        return "1";\n      case "square":\n        return "2";\n      default:\n        return "0";\n    }\n  }\n}\n`, "Java switch/case");
