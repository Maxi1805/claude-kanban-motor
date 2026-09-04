/**
 * C1 (Ola U) — SONDA: la FORMA REAL de los candidatos `receiver-member` que
 * hoy caen en `typeless-receiver` (etapa 9) y salen como `ambiguous`.
 *
 * No decide nada; cuenta. Tres preguntas, ninguna estimada:
 *   1. ¿Cuántos candidatos `receiver-member` hay, y con qué texto de receptor?
 *   2. ¿Cuántos de ellos tienen un receptor que es el PROPIO OBJETO
 *      (`this`/`self`/`@`), donde el tipo del receptor no es una inferencia
 *      sino la clase que encierra léxicamente al sitio de uso?
 *   3. De ésos, ¿cuántos tienen EXACTAMENTE UN destino sobreviviente que
 *      además es miembro de un contenedor que engloba al scope de uso — o
 *      sea, resolubles con certeza estructural?
 *
 * Mismo arnés de carga que `scripts/measure-cascade.mts` (un repo, una lista
 * de gramáticas, por invocación).
 *
 * Uso: npx tsx scripts/u-c1-probe-receptor.mts <dir> <language-id>[,<id>...]
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

import { deriveNodeSets, type ProbeNode } from "../src/server/services/code-grammar.js";
import type { AstNode } from "../src/server/services/detect/types.js";
import { extractReferences } from "../src/server/services/graph/references.js";
import { extractSymbols } from "../src/server/services/graph/symbols.js";
import { buildCandidates, buildResolutionContext, type GraphFileFacts } from "../src/server/services/graph/build.js";
import { collectFiles, LANGUAGE_DECLS, type LanguageDecl } from "../src/server/services/code-analyzer.js";

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

async function loadParserFor(decl: LanguageDecl): Promise<any> {
  const { Parser, Language } = await loadRuntime();
  const wasmDir = path.dirname(require.resolve("tree-sitter-wasms/package.json"));
  const language = await Language.load(path.join(wasmDir, "out", decl.wasm));
  const p = new Parser();
  p.setLanguage(language);
  return p;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function buildGraphFileFacts(rootDir: string, decl: LanguageDecl, parser: any): Promise<GraphFileFacts[]> {
  const probeRoot = parser.parse(decl.probeSource).rootNode as unknown as ProbeNode;
  const sets = deriveNodeSets(probeRoot);
  const scanned = await collectFiles(rootDir);
  const extSet = new Set(decl.extensions);
  const files: GraphFileFacts[] = [];
  for (const sf of scanned) {
    const ext = path.extname(sf.path).toLowerCase();
    if (!extSet.has(ext)) continue;
    let src: string;
    try {
      src = fs.readFileSync(path.join(rootDir, sf.path), "utf8");
    } catch {
      continue;
    }
    if (decl.extractScript) {
      const extracted = decl.extractScript(src);
      if (extracted == null) continue;
      src = extracted;
    }
    const root = parser.parse(src).rootNode as unknown as AstNode;
    files.push({ path: sf.path, language: decl.id, symbols: extractSymbols(root, sets), references: extractReferences(root, sets) });
  }
  return files;
}

function enclosesScope(container: readonly string[], scope: readonly string[]): boolean {
  return container.length <= scope.length && container.every((v, i) => v === scope[i]);
}

const CLASS_LIKE = new Set(["class-like", "namespace-like"]);

/** El prefijo MÁS LARGO de `scope` que, en `file`, es una declaración tipo-clase. `null` si ninguno. */
function deepestClassLikePrefix(
  ctx: { symbol: (r: { file: string; symbolPath: readonly string[] }) => { family: string } | null },
  file: string,
  scope: readonly string[],
): readonly string[] | null {
  for (let n = scope.length; n >= 1; n--) {
    const p = scope.slice(0, n);
    const sym = ctx.symbol({ file, symbolPath: p });
    if (sym && CLASS_LIKE.has(sym.family)) return p;
  }
  return null;
}

function samePath(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function main(): Promise<void> {
  const [, , dir, languageIds] = process.argv;
  if (!dir || !languageIds) {
    console.error("Uso: npx tsx scripts/u-c1-probe-receptor.mts <dir> <language-id>[,<id>...]");
    process.exit(1);
  }
  const decls = languageIds.split(",").map((id) => {
    const d = LANGUAGE_DECLS.find((x) => x.id === id.trim());
    if (!d) throw new Error(`language-id desconocido: ${id}`);
    return d;
  });
  const rootDir = path.resolve(dir);
  const files: GraphFileFacts[] = [];
  for (const decl of decls) files.push(...(await buildGraphFileFacts(rootDir, decl, await loadParserFor(decl))));

  const ctx = buildResolutionContext(files);
  const candidates = buildCandidates(files, undefined);

  let total = 0;
  let recv = 0;
  let bareConst = 0;
  const porQualifier = new Map<string, number>();
  let selfRecv = 0;
  let selfRecvCallee = 0;
  let selfUnicoMiembroEnglobante = 0;
  let selfCeroMiembroEnglobante = 0;
  let selfVariosMiembroEnglobante = 0;
  let selfTargetsMultiples = 0;
  let estrictoUno = 0;
  let estrictoUnoDesambigua = 0;
  let estrictoCero = 0;
  let estrictoVarios = 0;
  let estrictoSinClase = 0;

  for (const c of candidates) {
    total++;
    const r = c.from.ref;
    if (r.role !== "receiver-member") continue;
    recv++;
    if (r.qualifierIsBareConstant) {
      bareConst++;
      continue;
    }
    const q = r.qualifier ?? "";
    porQualifier.set(q, (porQualifier.get(q) ?? 0) + 1);
    if (q !== "this" && q !== "self") continue;
    selfRecv++;
    if (r.isCallee) selfRecvCallee++;
    if (c.targets.length > 1) selfTargetsMultiples++;
    const englobantes = c.targets.filter((t) => {
      const sym = ctx.symbol(t);
      return !!sym && sym.memberOfClassLike && sym.container.length > 0 && enclosesScope(sym.container, r.scope);
    });
    if (englobantes.length === 1) selfUnicoMiembroEnglobante++;
    else if (englobantes.length === 0) selfCeroMiembroEnglobante++;
    else selfVariosMiembroEnglobante++;

    // REGLA ESTRICTA CANDIDATA: destino en el MISMO archivo cuyo `container`
    // es EXACTAMENTE la unidad tipo-clase más profunda que encierra al sitio.
    const p = deepestClassLikePrefix(ctx as never, c.from.file, r.scope);
    if (p === null) {
      estrictoSinClase++;
      continue;
    }
    const estrictos = c.targets.filter((t) => {
      const sym = ctx.symbol(t);
      return !!sym && t.file === c.from.file && samePath(sym.container, p);
    });
    if (estrictos.length === 1) {
      estrictoUno++;
      if (c.targets.length > 1) estrictoUnoDesambigua++;
    } else if (estrictos.length === 0) estrictoCero++;
    else estrictoVarios++;
  }

  const top = [...porQualifier].sort((a, b) => b[1] - a[1]).slice(0, 15);
  console.log(`repo=${path.basename(rootDir)} langs=${languageIds} archivos=${files.length}`);
  console.log(`candidatos totales=${total} receiver-member=${recv} (constante-desnuda=${bareConst})`);
  console.log(`receptor propio (this/self)=${selfRecv} de ellos isCallee=${selfRecvCallee} conMasDeUnDestino=${selfTargetsMultiples}`);
  console.log(`  destinos que son miembro de un contenedor englobante: exactamente 1 => ${selfUnicoMiembroEnglobante}; 0 => ${selfCeroMiembroEnglobante}; >1 => ${selfVariosMiembroEnglobante}`);
  console.log(`  REGLA ESTRICTA (mismo archivo + container == clase más profunda que encierra): unico=${estrictoUno} (de los cuales desambiguan >1 destino: ${estrictoUnoDesambigua}) cero=${estrictoCero} varios=${estrictoVarios} sinClaseEnclosante=${estrictoSinClase}`);
  console.log(`top receptores por texto:`);
  for (const [q, n] of top) console.log(`  ${String(n).padStart(6)}  ${JSON.stringify(q)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
