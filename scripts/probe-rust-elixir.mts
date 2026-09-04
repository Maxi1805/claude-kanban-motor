/**
 * Sonda exploratoria (frente A3, Ola 11b — D3 "Rust y Elixir").
 *
 * NO agrega conocimiento de dominio: carga los dos `.wasm` que ya vienen en
 * `tree-sitter-wasms` y corre las MISMAS funciones genéricas que usa
 * producción (`deriveNodeSets`, `deriveCapabilities`) sobre una sonda de
 * código real, para ver qué deriva el mecanismo estructural por sí solo.
 *
 * Uso: npx tsx scripts/probe-rust-elixir.mts
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { deriveNodeSets, type ProbeNode, type DerivedNodeSets } from "../src/server/services/code-grammar.js";
import { deriveCapabilities } from "../src/server/services/detect/capabilities.js";

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

const FIELD_CANDIDATES = [
  "body", "parameters", "parameter_list", "name", "condition", "alternative",
  "consequence", "value", "type", "declarator", "left", "right", "operator",
  "target", "pattern", "arguments", "function", "field", "object", "path",
];

function dumpTypes(root: ProbeNode): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const visit = (n: ProbeNode): void => {
    if (n.isNamed) {
      let fields = out.get(n.type);
      if (!fields) {
        fields = new Set();
        out.set(n.type, fields);
      }
      for (const f of FIELD_CANDIDATES) if (n.childForFieldName(f)) fields.add(f);
    }
    for (let i = 0; i < n.childCount; i++) {
      const c = n.child(i);
      if (c) visit(c);
    }
  };
  visit(root);
  return out;
}

function show(sets: DerivedNodeSets): void {
  const fmt = (s: Set<string>): string => (s.size ? [...s].sort().join(", ") : "(VACIO)");
  console.log(`  functionNodes        : ${fmt(sets.functionNodes)}`);
  console.log(`  classNodes           : ${fmt(sets.classNodes)}`);
  console.log(`  branchNodes          : ${fmt(sets.branchNodes)}`);
  console.log(`  chainNodes           : ${fmt(sets.chainNodes)}`);
  console.log(`  nestingNodes         : ${fmt(sets.nestingNodes)}`);
  console.log(`  cloneNodes           : ${fmt(sets.cloneNodes)}`);
  console.log(`  constructorNodes     : ${fmt(sets.constructorNodes)}`);
  console.log(`  exceptionNodes       : ${fmt(sets.exceptionNodes)}`);
  console.log(`  switchContainerNodes : ${fmt(sets.switchContainerNodes)}`);
}

async function main(): Promise<void> {
  const [, , dumpFlag] = process.argv;
  const cases: { id: string; wasm: string; file: string }[] = [
    { id: "rust", wasm: "tree-sitter-rust.wasm", file: "scripts/probes/rust.rs" },
    { id: "elixir", wasm: "tree-sitter-elixir.wasm", file: "scripts/probes/elixir.ex" },
  ];
  for (const c of cases) {
    const src = fs.readFileSync(path.resolve(c.file), "utf8");
    const parser = await parserFor(c.wasm);
    const root = parser.parse(src).rootNode as unknown as ProbeNode;
    console.log(`\n=== ${c.id} (${c.wasm}) ===`);
    if (dumpFlag === "--dump") {
      const types = dumpTypes(root);
      for (const [t, f] of [...types.entries()].sort()) {
        console.log(`  ${t}  [${[...f].sort().join(" ")}]`);
      }
      console.log("");
    }
    const sets = deriveNodeSets(root);
    show(sets);
    const caps = deriveCapabilities(root, sets);
    console.log(`  capabilities         : ${[...caps].sort().join(", ") || "(VACIO)"}`);
  }
}

void main();

/*
 * Anexo: capacidades derivadas sobre la SONDA DE PRODUCCIÓN (`LANGUAGE_DECLS`),
 * no sobre los archivos de `scripts/probes/` — es lo que ve el pipeline real.
 */
