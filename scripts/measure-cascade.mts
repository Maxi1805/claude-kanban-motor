/**
 * F5 — mide el EMBUDO de la cascada de resolución (`graph/resolve.ts`,
 * `ALL_STAGES`) sobre UN repo real, UN lenguaje por invocación —
 * CONTRATO-F8G.md §7, frente F5.
 *
 * Por qué existe fuera de `src/`: `graph/build.ts`'s propio docstring lo
 * señala ("quien quiera correr `buildGraph` sobre un repo real tiene que
 * parsear y llamar `extractSymbols`/`extractReferences` él mismo — ver el
 * script de medición de esta tarea, fuera de `src/`"). Mismo motivo que
 * `scripts/census.mts`/`scripts/language-coverage.mts`: UN repo (y una sola
 * gramática tree-sitter) por proceso — cargar una SEGUNDA gramática grande
 * (o un segundo repo pesado) en el mismo heap además de arriesgar memoria,
 * puede corromper el caché de `require` de `web-tree-sitter` si alguna vez
 * se hiciera `require("web-tree-sitter")` una segunda vez en el proceso (ver
 * el comentario de `loadRuntime` en `code-analyzer.ts` y en
 * `gate/probe-cascade.ts`) — no es un riesgo teórico, ya rompió un test antes.
 *
 * Uso:
 *   npx tsx scripts/measure-cascade.mts <dir> <language-id>[,<language-id>...] [salida.json]
 *
 * <language-id> es uno de `LANGUAGE_DECLS[].id` (`code-analyzer.ts`):
 * ruby | typescript | tsx | javascript | vue | python | go | java | csharp
 *
 * Lista separada por comas (p.ej. `typescript,vue` para vueuse): TODOS los
 * archivos de TODOS los lenguajes listados entran al MISMO
 * `GraphFileFacts[]`/`ResolutionContext` — necesario para un repo mixto
 * real, donde un `.vue` puede referenciar un símbolo declarado en un `.ts`
 * hermano; correr cada lenguaje en una invocación separada perdería esas
 * referencias cross-lenguaje (el candidato viviría, pero su target nunca
 * estaría en el índice). El embudo resultante es UNO SOLO para el conjunto.
 *
 * Sin `salida.json`: imprime el embudo formateado (`stage-recall.ts#formatFunnel`)
 * y el `CascadeFunnel` serializado a STDOUT. Con `salida.json`: escribe el
 * `CascadeFunnel` ahí y el embudo formateado a STDERR — mismo contrato de
 * separación stdout/stderr que `census.mts`.
 *
 * Reglas de memoria de esta ola (recordadas acá porque este script es
 * exactamente lo que las dispara si se corre mal): invocar UNA vez por repo,
 * nunca en paralelo con otro repo pesado, y NUNCA junto con otra corrida de
 * `guava` en simultáneo — `scripts/census-all.sh` ya documenta el mismo
 * patrón para el censo golden.
 */
import { createRequire } from "node:module";
import { promises as fsp } from "node:fs";
import fs from "node:fs";
import path from "node:path";

import { deriveNodeSets, type ProbeNode } from "../src/server/services/code-grammar.js";
import type { AstNode } from "../src/server/services/detect/types.js";
import { extractReferences } from "../src/server/services/graph/references.js";
import { extractSymbols } from "../src/server/services/graph/symbols.js";
import { ALL_STAGES, resolveReferences } from "../src/server/services/graph/resolve.js";
import { buildCandidates, buildResolutionContext, type GraphFileFacts } from "../src/server/services/graph/build.js";
import { collectFiles, LANGUAGE_DECLS, type LanguageDecl } from "../src/server/services/code-analyzer.js";
import { toCascadeFunnel, formatFunnel, type CascadeFunnel } from "../src/server/services/graph/gate/stage-recall.js";

const require = createRequire(import.meta.url);

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * CACHEADO A NIVEL DE MÓDULO — MUST, no optimización: `web-tree-sitter`
 * sobreescribe `require.cache` como efecto colateral de `Parser.init()`
 * (glue de Emscripten), así que un SEGUNDO `require("web-tree-sitter")` en
 * el mismo proceso devuelve el runtime wasm crudo, no la clase `Parser` —
 * medido acá mismo (`TypeError: Parser.init is not a function` al pedir
 * `typescript,vue` en una sola invocación antes de este caché, mismo
 * síntoma que documenta `gate/probe-cascade.ts`). Cargar VARIAS gramáticas
 * (`Language.load` con distintos `.wasm`) en el mismo proceso SÍ es seguro
 * — lo que no lo es es un segundo `require()` del propio módulo.
 */
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

async function buildGraphFileFacts(
  rootDir: string,
  decl: LanguageDecl,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parser: any,
): Promise<GraphFileFacts[]> {
  const probeRoot = parser.parse(decl.probeSource).rootNode as unknown as ProbeNode;
  const sets = deriveNodeSets(probeRoot);
  const scanned = await collectFiles(rootDir);
  const extSet = new Set(decl.extensions);
  const files: GraphFileFacts[] = [];
  for (const sf of scanned) {
    const ext = path.extname(sf.path).toLowerCase();
    if (!extSet.has(ext)) continue;
    const abs = path.join(rootDir, sf.path);
    let src: string;
    try {
      src = fs.readFileSync(abs, "utf8");
    } catch {
      continue; // desapareció entre el walk y la lectura
    }
    if (decl.extractScript) {
      const extracted = decl.extractScript(src);
      if (extracted == null) continue;
      src = extracted;
    }
    const root = parser.parse(src).rootNode as unknown as AstNode;
    files.push({
      path: sf.path,
      language: decl.id,
      symbols: extractSymbols(root, sets),
      references: extractReferences(root, sets),
    });
  }
  return files;
}

async function main(): Promise<void> {
  const [, , dir, languageIds, outPath] = process.argv;
  if (!dir || !languageIds) {
    console.error("Uso: npx tsx scripts/measure-cascade.mts <dir> <language-id>[,<language-id>...] [salida.json]");
    process.exit(1);
  }
  const ids = languageIds.split(",").map((s) => s.trim());
  const decls: LanguageDecl[] = [];
  for (const id of ids) {
    const decl = LANGUAGE_DECLS.find((d) => d.id === id);
    if (!decl) {
      console.error(`language-id desconocido: "${id}". Válidos: ${LANGUAGE_DECLS.map((d) => d.id).join(", ")}`);
      process.exit(1);
    }
    decls.push(decl);
  }

  const rootDir = path.resolve(dir);
  const t0 = performance.now();
  const files: GraphFileFacts[] = [];
  for (const decl of decls) {
    const parser = await loadParserFor(decl);
    files.push(...(await buildGraphFileFacts(rootDir, decl, parser)));
  }
  if (files.length === 0) {
    console.error(`0 archivos "${languageIds}" bajo ${rootDir} — nada que medir.`);
    process.exit(1);
  }

  const ctx = buildResolutionContext(files);
  const candidates = buildCandidates(files, undefined);
  const { stats } = resolveReferences(ALL_STAGES, candidates, ctx);
  const elapsedMs = performance.now() - t0;

  const repoSlug = path.basename(rootDir);
  const funnel: CascadeFunnel = toCascadeFunnel(repoSlug, languageIds, files.length, stats);

  const formatted = formatFunnel(funnel) + `\n  tiempo de pared: ${elapsedMs.toFixed(0)} ms\n`;

  if (outPath) {
    await fsp.mkdir(path.dirname(path.resolve(outPath)), { recursive: true });
    await fsp.writeFile(outPath, JSON.stringify(funnel, null, 2), "utf8");
    console.error(formatted);
    console.error(`[measure-cascade] escrito en ${path.resolve(outPath)}`);
  } else {
    console.log(formatted);
    console.log(JSON.stringify(funnel, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
