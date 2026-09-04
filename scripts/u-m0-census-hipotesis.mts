/**
 * OLA U · FRENTE M0 — línea base del nivel 2 sobre UN repo del corpus.
 *
 * Corre `analyzeRepoCached` (mismo mecanismo que `dump-hallazgos.mts`, caché
 * por SHA+huella del analizador) sobre un único directorio y agrega, por
 * PATRÓN × ESTADO × LENGUAJE, cuántas hipótesis emite el motor hoy — sin
 * muestrear nada, población completa. `pattern` recorre TODO
 * `hypotheses/registry.ts` (derivado, nunca escrito a mano: un patrón nuevo
 * aparece solo). El lenguaje de una hipótesis es el de su PRIMERA ubicación
 * (`finding.locations[0].file`), resuelto contra la MISMA tabla de
 * extensiones que usa el analizador real (`LANGUAGE_DECLS` de
 * `code-analyzer.ts`) — no una tabla propia reinventada.
 *
 * UN repo por proceso — misma regla que `measure-hypothesis-states.mts`
 * (dos `analyzeRepo` en el mismo proceso corrompen el caché de
 * `web-tree-sitter`). Este script no hace fan-out: se invoca una vez por
 * repo, típicamente bajo `scripts/con-analisis.sh`.
 *
 * Uso: npx tsx scripts/u-m0-census-hipotesis.mts <dir> <slug> <salida.json>
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import { LANGUAGE_DECLS } from "../src/server/services/code-analyzer.js";
import { HYPOTHESES } from "../src/server/services/hypotheses/registry.js";
import type { CodeFindingHypothesisState } from "../src/shared/types.js";

const STATES: readonly CodeFindingHypothesisState[] = ["ausente", "parcial", "ya-aplicado", "aplicado-eludido"];

const EXT_TO_LANG = new Map<string, string>();
for (const decl of LANGUAGE_DECLS) for (const ext of decl.extensions) EXT_TO_LANG.set(ext, decl.id);

function languageOfFile(file: string): string {
  return EXT_TO_LANG.get(path.extname(file).toLowerCase()) ?? "?";
}

async function main(): Promise<void> {
  const [, , dir, slug, out] = process.argv;
  if (!dir || !slug || !out) {
    console.error("Uso: npx tsx scripts/u-m0-census-hipotesis.mts <dir> <slug> <salida.json>");
    process.exit(1);
  }
  const rootDir = path.resolve(dir);
  const allPatterns = HYPOTHESES.map((h) => h.pattern);

  const t0 = performance.now();
  const { analysis, cache } = await analyzeRepoCached({ dir: rootDir, repoName: slug, limits: { maxFindings: "unlimited" } });
  const wallMs = Math.round(performance.now() - t0);
  console.error(`[u-m0] ${slug}: ${cache.hit ? "HIT" : "MISS"} (${cache.reason}) analyzeMs=${cache.analyzeMs.toFixed(0)} wallMs=${wallMs}`);

  // clave: `${pattern}|${state}|${lang}` -> n
  const counts = new Map<string, number>();
  // hasta 6 ejemplos por (pattern,state) -> "archivo:línea"
  const examples = new Map<string, string[]>();

  for (const finding of analysis.findings) {
    const loc = finding.locations[0];
    const lang = loc ? languageOfFile(loc.file) : "?";
    for (const h of finding.hypotheses ?? []) {
      const key = `${h.pattern}|${h.state}|${lang}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      const exKey = `${h.pattern}|${h.state}`;
      const bucket = examples.get(exKey) ?? [];
      if (bucket.length < 6 && loc) {
        bucket.push(`${loc.file}:${loc.startLine}`);
        examples.set(exKey, bucket);
      }
    }
  }

  const rows: { pattern: string; state: string; lang: string; n: number }[] = [];
  for (const [key, n] of counts) {
    const [pattern, state, lang] = key.split("|");
    rows.push({ pattern: pattern!, state: state!, lang: lang!, n });
  }

  const byPattern: Record<string, { total: number; states: Record<string, number>; byLang: Record<string, number> }> = {};
  for (const pattern of allPatterns) {
    const total = rows.filter((r) => r.pattern === pattern).reduce((s, r) => s + r.n, 0);
    const states: Record<string, number> = {};
    for (const s of STATES) states[s] = rows.filter((r) => r.pattern === pattern && r.state === s).reduce((s2, r) => s2 + r.n, 0);
    const byLang: Record<string, number> = {};
    for (const r of rows.filter((r) => r.pattern === pattern)) byLang[r.lang] = (byLang[r.lang] ?? 0) + r.n;
    byPattern[pattern] = { total, states, byLang };
  }

  const exampleObj: Record<string, string[]> = {};
  for (const [k, v] of examples) exampleObj[k] = v;

  writeFileSync(
    out,
    JSON.stringify(
      {
        slug,
        dir: rootDir,
        wallMs,
        cacheHit: cache.hit,
        totalFindings: analysis.findings.length,
        rows,
        byPattern,
        examples: exampleObj,
      },
      null,
      1,
    ),
  );
  const totalHyp = rows.reduce((s, r) => s + r.n, 0);
  console.error(`[u-m0] ${slug}: ${totalHyp} hipótesis totales -> ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
