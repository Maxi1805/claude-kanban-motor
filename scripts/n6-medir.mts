/**
 * OLA O, FRENTE N6 — volumen por (kind, lenguaje) para los tres consumidores de la
 * unificación AST+grafo (`argument-mutation`, `unused-variable`, `boolean-flag-param`).
 *
 * POR QUÉ EXISTE. CONTEXTO.md §3 de la Ola O exige medir el volumen ANTES y DESPUÉS
 * DESGLOSADO POR LENGUAJE: la lección más cara de la Ola N fue un frente que bajó su kind
 * un 68 % global matándolo en cuatro lenguajes, y ningún informe lo vio porque nadie cruzó
 * `(kind, lenguaje)`. `dump-hallazgos.mts` no lleva lenguaje; `census.mts` lleva
 * `hallazgo:<kind>` y `archivo:<lenguaje>` por separado, nunca cruzados.
 *
 * Acá el lenguaje sale de `analysis.files` (mapa path → language, el mismo que usa
 * `scripts/language-coverage.mts`), atribuido por el archivo de la PRIMERA ubicación del
 * hallazgo — aproximación declarada, exacta para un `intra-function` (todas sus
 * ubicaciones viven en el mismo archivo).
 *
 * UN repo por invocación, sin excepción — misma razón que `census.mts`/`foto-lenguajes.mts`
 * (dos `analyzeRepo` en el mismo proceso corrompen el caché de `require` de
 * `web-tree-sitter`).
 *
 * Uso: npx tsx scripts/n6-medir.mts <dir> <slug> <salida.json>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";

const KINDS = new Set(["argument-mutation", "unused-variable", "boolean-flag-param"]);

const [, , dir, slug, out] = process.argv;
if (!dir || !slug || !out) {
  console.error("uso: n6-medir.mts <dir> <slug> <salida.json>");
  process.exit(1);
}

const t0 = performance.now();
const { analysis, cache } = await analyzeRepoCached({
  dir,
  repoName: slug,
  limits: { maxFindings: "unlimited" },
});
console.error(`[n6] ${slug}: ${cache.hit ? "HIT" : "MISS"} (${cache.reason}) analyzeMs=${cache.analyzeMs.toFixed(0)}`);

const fileLanguage = new Map<string, string>();
for (const f of analysis.files) fileLanguage.set(f.path, f.language);

const porKindLenguaje: Record<string, number> = {};
const filas: unknown[] = [];
for (const f of analysis.findings) {
  if (!KINDS.has(f.kind)) continue;
  const first = f.locations[0];
  const lang = first ? (fileLanguage.get(first.file) ?? "(desconocido)") : "(sin ubicación)";
  const key = `${f.kind}|${lang}`;
  porKindLenguaje[key] = (porKindLenguaje[key] ?? 0) + 1;
  filas.push({
    id: f.id ?? stableFindingId(f),
    kind: f.kind,
    language: lang,
    file: first?.file ?? "",
    line: first?.startLine ?? 0,
    symbol: first?.symbol ?? "",
    title: f.title,
  });
}

mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ slug, dir, wallMs: Math.round(performance.now() - t0), porKindLenguaje, filas }, null, 1));
console.log(`${slug}: ${filas.length} hallazgos de los 3 kinds — ${JSON.stringify(porKindLenguaje)}`);
