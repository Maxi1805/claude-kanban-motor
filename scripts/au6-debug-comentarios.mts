import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
const S0 = "../scratchpad-au6/src0";
const { LANGUAGE_DECLS } = await import(`${S0}/server/services/code-analyzer.js`);
const { commentBlockDiagnostics } = await import(`${S0}/server/services/detect/intra-file/commented-out-code.js`);
const require = createRequire(import.meta.url);
/* eslint-disable */
const mod = require("web-tree-sitter") as any;
const Parser = mod.Parser ?? mod.default ?? mod;
await Parser.init();
const Language = Parser.Language ?? mod.Language;
function wasmPath(f: string) { return path.join(path.dirname(require.resolve("tree-sitter-wasms/package.json")), "out", f); }
const [, , file] = process.argv;
const byExt = new Map<string, any>();
for (const d of LANGUAGE_DECLS as any[]) for (const e of d.extensions) byExt.set(e, d);
const decl = byExt.get(path.extname(file));
const lang = await Language.load(wasmPath(decl.wasm));
const p = new Parser(); p.setLanguage(lang);
const source = readFileSync(file, "utf8");
const tree = p.parse(source);
const fu: any = { path: file, language: decl.id, lines: 0, root: tree.rootNode, sets: null, functions: [] };
const diags = commentBlockDiagnostics(fu, 2);
console.log("bloques:", diags.length);
const byReason: Record<string, number> = {};
for (const d of diags) { const k = d.reason.split(":")[0]!; byReason[k] = (byReason[k] ?? 0) + 1; }
console.log(byReason);
for (const d of diags.slice(0, 25)) console.log(`[${d.reason}] L${d.startLine}-${d.endLine}`, JSON.stringify(d.lines.slice(0,4)));
