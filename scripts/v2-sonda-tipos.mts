/**
 * V2 (Ola V) — SONDA de la FORMA del nodo de tipo de un miembro
 * autorreferencial, en las gramáticas donde `self-referential-member` tiene
 * población (TypeScript, Java, C#).
 *
 * PARA QUÉ. Composite compone MUCHOS. `Folder[]`/`List<Folder>` (una
 * colección de hijos) y `Folder parent`/`Listener next`/`Foo<K,V> cachedView`
 * (un enlace escalar) son, para el detector de hoy, exactamente el mismo
 * hallazgo. Esta sonda mide qué distingue las dos formas EN EL ÁRBOL — no en
 * el texto — para poder escribir el chequeo sin adivinar nombres de nodo.
 *
 * No decide nada: imprime el subárbol del campo `type` de cada miembro.
 *
 * Uso: npx tsx scripts/v2-sonda-tipos.mts
 */
import { createRequire } from "node:module";
import path from "node:path";

import { LANGUAGE_DECLS } from "../src/server/services/code-analyzer.js";

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

async function loadParserFor(id: string): Promise<any> {
  const { Parser, Language } = await loadRuntime();
  const decl = LANGUAGE_DECLS.find((d) => d.id === id)!;
  const wasmDir = path.dirname(require.resolve("tree-sitter-wasms/package.json"));
  const language = await Language.load(path.join(wasmDir, "out", decl.wasm));
  const p = new Parser();
  p.setLanguage(language);
  return p;
}

function dump(node: any, depth = 0): void {
  const fields: string[] = [];
  for (const f of ["type", "name", "parameters", "return_type", "element", "dimensions", "key", "value"]) {
    if (node.childForFieldName?.(f)) fields.push(f);
  }
  const anon: string[] = [];
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c && !c.isNamed) anon.push(c.text);
  }
  console.log(
    `${"  ".repeat(depth)}${node.type}${node.isNamed ? "" : " (anon)"} :: ${JSON.stringify(node.text.slice(0, 60))}` +
      `${fields.length ? ` [campos: ${fields.join(",")}]` : ""}${anon.length ? ` [anon: ${anon.join(" ")}]` : ""}`,
  );
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c?.isNamed) dump(c, depth + 1);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const CASOS: { lang: string; src: string }[] = [
  {
    lang: "typescript",
    src: `class Folder {
  children: Folder[] = [];
  parent: Folder | undefined;
  twin: Folder;
  make: () => Folder;
  kids: Array<Folder>;
  byName: Map<string, Folder>;
  maybe?: Folder;
}`,
  },
  {
    lang: "java",
    src: `class Folder<K, V> {
  private List<Folder<K, V>> children;
  private Folder[] kids;
  private Folder parent;
  private Folder<K, V> cachedView;
  private Map<String, Folder> byName;
}`,
  },
  {
    lang: "csharp",
    src: `class Folder {
  private IList<Folder> Items;
  private Folder[] Kids;
  private Folder Parent;
  private Folder? Maybe;
  public IList<Folder> Children { get; set; }
}`,
  },
];

for (const caso of CASOS) {
  const parser = await loadParserFor(caso.lang);
  const root = parser.parse(caso.src).rootNode;
  console.log(`\n════════ ${caso.lang} ════════`);
  dump(root);
}
