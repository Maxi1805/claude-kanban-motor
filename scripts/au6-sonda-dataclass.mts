/**
 * OLA AU - AU6 - SONDA de `data-class`. Parsea con las mismas gramaticas de
 * produccion, deriva los `DerivedNodeSets` reales y llama a
 * `dataClassCandidates` directo (con y sin compuertas).
 * Uso: npx tsx scripts/au6-sonda-dataclass.mts <dir> <nombre> <min> <salida.json>
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
const S0 = "../scratchpad-au6/src0";
const { collectFiles, LANGUAGE_DECLS } = await import(`${S0}/server/services/code-analyzer.js`);
const { deriveNodeSets } = await import(`${S0}/server/services/code-grammar.js`);
const { dataClassCandidates } = await import(`${S0}/server/services/detect/intra-file/data-class.js`);
const require = createRequire(import.meta.url);
/* eslint-disable */
const mod = require("web-tree-sitter") as any;
const Parser = mod.Parser ?? mod.default ?? mod;
await Parser.init();
const Language = Parser.Language ?? mod.Language;
function wasmPath(f: string) { return path.join(path.dirname(require.resolve("tree-sitter-wasms/package.json")), "out", f); }
const cache = new Map<string, any>();
async function langFor(decl: any) {
  const hit = cache.get(decl.id); if (hit) return hit;
  const lang = await Language.load(wasmPath(decl.wasm));
  const p = new Parser(); p.setLanguage(lang);
  const probe = p.parse(decl.probeSource);
  const sets = deriveNodeSets(probe.rootNode, decl.extraCloneNodes, decl.functionExclusions);
  probe.delete?.();
  const v = { parser: p, sets };
  cache.set(decl.id, v); return v;
}
const [, , dir, nombre, minRaw, out] = process.argv;
const MIN = Number(minRaw ?? 3);
const byExt = new Map<string, any>();
for (const d of LANGUAGE_DECLS as any[]) for (const e of d.extensions) byExt.set(e, d);
const files = await collectFiles(dir);
const conCompuertas: any[] = []; const sinCompuertas: any[] = [];
let archivos = 0;
for (const f of files as any[]) {
  const decl = byExt.get(path.extname(f.path)); if (!decl) continue;
  let source: string;
  try { source = readFileSync(path.join(dir, f.path), "utf8"); } catch { continue; }
  if (source.length > 900_000) continue;
  const { parser, sets } = await langFor(decl);
  let tree: any = null;
  try { tree = parser.parse(source); } catch { continue; }
  if (!tree) continue;
  archivos++;
  const fu: any = { path: f.path, language: decl.id, lines: source.split("\n").length, root: tree.rootNode, sets, functions: [] };
  try {
    for (const c of dataClassCandidates(fu, MIN, true)) conCompuertas.push({ repo: nombre, lang: decl.id, file: f.path, ...c });
    for (const c of dataClassCandidates(fu, MIN, false)) sinCompuertas.push({ repo: nombre, lang: decl.id, file: f.path, ...c });
  } catch (e) { console.error("ERR", f.path, e); }
  finally { tree.delete?.(); }
}
const porLang = (rs: any[]) => { const r: Record<string, number> = {}; for (const x of rs) r[x.lang] = (r[x.lang] ?? 0) + 1; return r; };
writeFileSync(out, JSON.stringify({ repo: nombre, min: MIN, archivos, conCompuertas: conCompuertas.length, sinCompuertas: sinCompuertas.length, porLenguaje: porLang(conCompuertas), candidatos: conCompuertas, todos: sinCompuertas }, null, 1));
console.log(`${nombre}: con=${conCompuertas.length} sin=${sinCompuertas.length} en ${archivos} archivos`, porLang(conCompuertas));
