/**
 * D3 (Ola 11b, frente A3) — segunda sonda: qué extraen `extractSymbols` /
 * `extractReferences` (los mismos que usa producción) sobre las fixtures de
 * Rust y Elixir, y qué campos expone la gramática en los nodos que deciden
 * `isCallee` / `instantiates` / `imports`.
 *
 * Uso: npx tsx scripts/probe-rust-elixir-refs.mts [--fields <tipo,tipo,...>]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { deriveNodeSets, type ProbeNode } from "../src/server/services/code-grammar.js";
import { extractSymbols } from "../src/server/services/graph/symbols.js";
import { extractReferences } from "../src/server/services/graph/references.js";
import type { AstNode } from "../src/server/services/detect/types.js";

const require = createRequire(import.meta.url);

/* eslint-disable @typescript-eslint/no-explicit-any */
let runtime: Promise<{ Parser: any; Language: any }> | null = null;
async function loadRuntime(): Promise<{ Parser: any; Language: any }> {
  runtime ??= (async () => {
    const mod = require("web-tree-sitter") as any;
    const Parser = mod.Parser ?? mod.default ?? mod;
    await Parser.init();
    const Language = Parser.Language ?? mod.Language;
    return { Parser, Language };
  })();
  return runtime;
}
async function parserFor(wasm: string): Promise<any> {
  const { Parser, Language } = await loadRuntime();
  const wasmDir = path.dirname(require.resolve("tree-sitter-wasms/package.json"));
  const language = await Language.load(path.join(wasmDir, "out", wasm));
  const p = new Parser();
  p.setLanguage(language);
  return p;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const FIELDS = [
  "function", "method", "name", "arguments", "argument_list", "receiver",
  "object", "operand", "expression", "field", "property", "attribute",
  "scope", "module", "path", "type", "body", "parameters", "trait", "target",
  "left", "right", "value", "pattern", "alias", "declarator",
];

const CASES = [
  { id: "rust", wasm: "tree-sitter-rust.wasm", file: "tests/fixtures/rust-elixir/shapes.rs" },
  { id: "elixir", wasm: "tree-sitter-elixir.wasm", file: "tests/fixtures/rust-elixir/notifier.ex" },
];

async function main(): Promise<void> {
  const wantFields = process.argv.includes("--fields");
  for (const c of CASES) {
    const src = fs.readFileSync(path.resolve(c.file), "utf8");
    const parser = await parserFor(c.wasm);
    const root = parser.parse(src).rootNode;
    const sets = deriveNodeSets(root as unknown as ProbeNode);
    const symbols = extractSymbols(root as unknown as AstNode, sets);
    const refs = extractReferences(root as unknown as AstNode, sets);

    console.log(`\n===== ${c.id} — ${c.file} =====`);
    console.log(`extractSymbols: ${symbols.length}`);
    for (const s of symbols as any[]) {
      console.log(`  ${s.family.padEnd(15)} ${s.nodeType.padEnd(22)} [${s.container.join(".")}] ${s.name}  arity=${s.arity ?? "-"} vis=${s.visibility ?? "-"} member=${s.memberOfClassLike}`);
    }
    console.log(`extractReferences: ${refs.length}`);
    const byRole = new Map<string, number>();
    let callees = 0;
    for (const r of refs as any[]) {
      byRole.set(r.role, (byRole.get(r.role) ?? 0) + 1);
      if (r.isCallee) callees += 1;
    }
    console.log(`  por rol: ${[...byRole.entries()].map(([k, v]) => `${k}=${v}`).join(", ") || "(ninguna)"}`);
    console.log(`  isCallee=true: ${callees}`);
    for (const r of (refs as any[]).slice(0, 40)) {
      console.log(`    ${r.role.padEnd(16)} callee=${r.isCallee ? "SI" : "no"}  ${r.qualifier ? r.qualifier + "::" : ""}${r.name}   scope=[${r.scope.join(".")}]`);
    }
    if ((refs as any[]).length > 40) console.log(`    … (${(refs as any[]).length - 40} más)`);

    if (wantFields) {
      const types = new Map<string, Set<string>>();
      const visit = (n: any): void => {
        if (n.isNamed) {
          let f = types.get(n.type);
          if (!f) {
            f = new Set();
            types.set(n.type, f);
          }
          for (const field of FIELDS) if (n.childForFieldName(field)) f.add(field);
        }
        for (let i = 0; i < n.childCount; i++) {
          const ch = n.child(i);
          if (ch) visit(ch);
        }
      };
      visit(root);
      console.log("  tipos de nodo -> campos resueltos:");
      for (const [t, f] of [...types.entries()].sort()) console.log(`    ${t}  [${[...f].sort().join(" ")}]`);
    }
  }
}

void main();
