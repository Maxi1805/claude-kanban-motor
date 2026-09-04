/**
 * OLA AU - AU6 - SONDA DE CALIBRACION de `commented-out-code`.
 *
 * No pasa por `analyzeRepo`: el detector solo necesita `file.root` y
 * `file.path`, asi que la sonda parsea cada archivo con la misma
 * `web-tree-sitter` y las mismas gramaticas `.wasm` de produccion y llama a
 * `commentedOutBlocks` directo. Barato, y mide exactamente lo que el detector
 * va a emitir.
 *
 * Uso: npx tsx scripts/au6-sonda-comentarios.mts <dir-repo> <nombre> <min> <salida.json>
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const S0 = "../scratchpad-au6/src0";
const { collectFiles, LANGUAGE_DECLS } = await import(`${S0}/server/services/code-analyzer.js`);
const { commentedOutBlocks } = await import(`${S0}/server/services/detect/intra-file/commented-out-code.js`);

const require = createRequire(import.meta.url);
/* eslint-disable @typescript-eslint/no-explicit-any */
const mod = require("web-tree-sitter") as any;
const Parser = mod.Parser ?? mod.default ?? mod;
await Parser.init();
const Language = Parser.Language ?? mod.Language;
function wasmPath(file: string): string {
  return path.join(path.dirname(require.resolve("tree-sitter-wasms/package.json")), "out", file);
}
const parsers = new Map<string, any>();
async function parserFor(wasm: string): Promise<any> {
  const hit = parsers.get(wasm);
  if (hit) return hit;
  const lang = await Language.load(wasmPath(wasm));
  const p = new Parser();
  p.setLanguage(lang);
  parsers.set(wasm, p);
  return p;
}

const [, , dir, nombre, minRaw, out] = process.argv;
if (!dir || !nombre || !out) { console.error("Uso: <dir> <nombre> <min> <salida.json>"); process.exit(1); }
const MIN = Number(minRaw ?? 2);

const byExt = new Map<string, any>();
for (const d of LANGUAGE_DECLS as any[]) for (const e of d.extensions) byExt.set(e, d);

const files = await collectFiles(dir);
const bloques: any[] = [];
const porLenguaje: Record<string, number> = {};
let archivosLeidos = 0;
for (const f of files as any[]) {
  const decl = byExt.get(path.extname(f.path));
  if (!decl) continue;
  let source: string;
  try { source = readFileSync(path.join(dir, f.path), "utf8"); } catch { continue; }
  if (source.length > 900_000) continue;
  const parser = await parserFor(decl.wasm);
  let tree: any = null;
  try { tree = parser.parse(source); } catch { continue; }
  if (!tree) continue;
  archivosLeidos++;
  const fileUnit: any = { path: f.path, language: decl.id, lines: source.split("\n").length, root: tree.rootNode, sets: null, functions: [] };
  try {
    for (const b of commentedOutBlocks(fileUnit, MIN)) {
      bloques.push({ repo: nombre, lang: decl.id, file: f.path, ...b });
      porLenguaje[decl.id] = (porLenguaje[decl.id] ?? 0) + 1;
    }
  } finally { tree.delete?.(); }
}

writeFileSync(out, JSON.stringify({ repo: nombre, min: MIN, archivosLeidos, total: bloques.length, porLenguaje, bloques }, null, 1));
console.log(`${nombre}: ${bloques.length} bloques en ${archivosLeidos} archivos`, porLenguaje);
