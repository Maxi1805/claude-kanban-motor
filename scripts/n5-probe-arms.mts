/**
 * Ola U / frente N5 — SONDA DE GRAMÁTICA, no parte del analizador.
 *
 * Responde una sola pregunta, la que motivó la corrección de
 * `hypotheses/strategy.ts#switchArmActions`: **¿qué campo expone el nodo de
 * "arm" de un switch en cada gramática, y por lo tanto qué lee (o no lee) un
 * chequeo que pide `consequence`/`body`?**
 *
 * Resultado medido con este script (Ola U):
 *
 *   Ruby   `when`                          → body        ✔
 *   JS/TS  `switch_case`                   → body        ✔
 *   Python `case_clause`                   → consequence ✔
 *   C#     `switch_section`                → (ninguno)   ✘
 *   Java   `switch_block_statement_group`  → (ninguno)   ✘
 *   Go     `expression_case`               → sólo `value`, que es la ETIQUETA ✘
 *
 * Uso: npx tsx scripts/n5-probe-arms.mts
 */
import { parseRoot } from "../src/server/services/detect/testing.js";

const cases: readonly (readonly [string, string])[] = [
  ["tree-sitter-c_sharp.wasm", "class X { void f(int t){ switch(t){ case 1: a(); break; case 2: b(); break; } } }"],
  ["tree-sitter-java.wasm", "class X { void f(int t){ switch(t){ case 1: a(); break; case 2: b(); break; } } }"],
  ["tree-sitter-go.wasm", "package p\nfunc f(t int) {\n switch t {\n case 1:\n  a()\n case 2:\n  b()\n }\n}"],
  ["tree-sitter-ruby.wasm", "def f(t)\n case t\n when 1 then a()\n when 2 then b()\n end\nend"],
  ["tree-sitter-javascript.wasm", "function f(t){ switch(t){ case 1: return a(); case 2: return b(); } }"],
  ["tree-sitter-python.wasm", "def f(t):\n match t:\n  case 1:\n   a()\n  case 2:\n   b()"],
];

/** Mismo conjunto que `strategy.ts#ACTION_FIELDS` más los que las gramáticas usan para la etiqueta/sujeto, para poder distinguir "acción" de "etiqueta". */
const FIELDS = ["consequence", "body", "value", "condition", "subject", "pattern"];
/** Mismo `BRANCH_SWITCH_WORD` que `strategy.ts` — la sonda mira exactamente los nodos que ese módulo mira. */
const SWITCH_WORD = /(^|_)(switch|case|when|match|select)(_|$)/;

for (const [wasm, src] of cases) {
  const root = await parseRoot(wasm, src);
  const out: string[] = [];
  const walk = (n: { isNamed: boolean; type: string; childCount: number; child(i: number): unknown; childForFieldName(f: string): { text: string } | null }, d = 0): void => {
    if (n.isNamed && SWITCH_WORD.test(n.type)) {
      const f = FIELDS.filter((x) => n.childForFieldName(x)).map((x) => `${x}="${String(n.childForFieldName(x)!.text).replace(/\s+/g, " ").slice(0, 24)}"`);
      out.push(`${" ".repeat(d)}${n.type} [${f.join(" ")}]`);
    }
    for (let i = 0; i < n.childCount; i++) {
      const c = n.child(i) as Parameters<typeof walk>[0] | null;
      if (c) walk(c, d + 1);
    }
  };
  walk(root as unknown as Parameters<typeof walk>[0]);
  console.log("###", wasm, "\n" + out.join("\n"));
}
