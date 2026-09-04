/**
 * D3 (Ola 11b, frente A3) — capacidades derivadas sobre la SONDA DE PRODUCCIÓN
 * (`LANGUAGE_DECLS`) y la gramática real, para los lenguajes que se pidan.
 * Uso: npx tsx scripts/probe-lang-caps.mts rust,elixir,go,java
 */
import path from "node:path";
import { createRequire } from "node:module";
import { LANGUAGE_DECLS } from "../src/server/services/code-analyzer.js";
import { deriveNodeSets, type ProbeNode } from "../src/server/services/code-grammar.js";
import { deriveCapabilities } from "../src/server/services/detect/capabilities.js";

const require = createRequire(import.meta.url);
/* eslint-disable @typescript-eslint/no-explicit-any */
const mod = require("web-tree-sitter") as any;
const Parser = mod.Parser ?? mod.default ?? mod;
await Parser.init();
const Language = Parser.Language ?? mod.Language;
const wasmDir = path.dirname(require.resolve("tree-sitter-wasms/package.json"));

const ids = (process.argv[2] ?? "rust,elixir").split(",");
const ALL = ["unidad-tipo-clase", "herencia", "interfaz", "tipos-explicitos", "imports", "excepciones", "ternario", "nodo-constructor", "visibilidad", "genericos", "modulos"];
for (const id of ids) {
  const decl = LANGUAGE_DECLS.find((d) => d.id === id);
  if (!decl) {
    console.log(`${id}: NO ESTA en LANGUAGE_DECLS`);
    continue;
  }
  const language = await Language.load(path.join(wasmDir, "out", decl.wasm));
  const p = new Parser();
  p.setLanguage(language);
  const tree = p.parse(decl.probeSource);
  const sets = deriveNodeSets(tree.rootNode as ProbeNode, decl.extraCloneNodes, decl.functionExclusions);
  const caps = deriveCapabilities(tree.rootNode as ProbeNode, sets);
  console.log(`\n=== ${id} (${decl.wasm}) — sonda de producción ===`);
  console.log(`  functionNodes=${sets.functionNodes.size} classNodes=${sets.classNodes.size} branchNodes=${sets.branchNodes.size} chainNodes=${sets.chainNodes.size} cloneNodes=${sets.cloneNodes.size} switchContainers=${sets.switchContainerNodes.size} exception=${sets.exceptionNodes.size} constructor=${sets.constructorNodes.size}`);
  for (const c of ALL) console.log(`  ${c.padEnd(20)} ${caps.has(c as any) ? "SI" : "no"}`);
}
/* eslint-enable @typescript-eslint/no-explicit-any */
