/**
 * OLA X · FRENTE A1 — volcado RICO de un repo: meta + hallazgos + hipótesis COMPLETAS.
 *
 * POR QUÉ NO ALCANZA `dump-hallazgos.mts`. Ese volcado guarda de cada hipótesis sólo
 * `{pattern, state}`. Para la pregunta de este frente —«¿en código de APLICACIÓN el nivel 2
 * emite más, y lo que emite es CORRECTO?»— hacen falta tres cosas más y todas en la MISMA
 * corrida, para no repagar el análisis:
 *   1. `meta.totalLines` / `analysedFiles`, porque la comparación entre repos de tamaños muy
 *      distintos sólo es justa por cada mil líneas ANALIZADAS.
 *   2. el `language` de cada hallazgo, resuelto por el propio análisis (`files[].language`),
 *      no por una tabla de extensiones paralela.
 *   3. el TEXTO de la hipótesis (checks, places, toConfirm, source) para poder juzgarla
 *      abriendo el archivo real, que es lo único que contesta «¿es correcto?».
 *
 * Sólo lectura: no toca `src/`, no escribe planillas, no re-congela nada.
 *
 * Uso: npx tsx scripts/x-a1-volcado.mts <dir> <slug> <salida.json>
 */
import { writeFileSync } from "node:fs";

import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";

const [, , dir, slug, out] = process.argv;
if (!dir || !slug || !out) {
  console.error("Uso: npx tsx scripts/x-a1-volcado.mts <dir> <slug> <salida.json>");
  process.exit(1);
}

const t0 = performance.now();
const { analysis: a, cache } = await analyzeRepoCached({
  dir,
  repoName: slug,
  limits: { maxFindings: "unlimited" },
});
console.error(
  `[analyzer-cache] ${slug} (${dir}): ${cache.hit ? "HIT" : "MISS"} (${cache.reason}) analyzeMs=${cache.analyzeMs.toFixed(0)}`,
);

/** Lenguaje por archivo, tal como lo resolvió el propio análisis. */
const langOf = new Map<string, string>();
for (const f of a.files) langOf.set(f.path, f.language);
const linesOf = new Map<string, number>();
for (const f of a.files) linesOf.set(f.path, f.lines);

const findings = a.findings.map((f) => {
  const first = f.locations[0];
  return {
    id: f.id ?? stableFindingId(f),
    kind: f.kind,
    title: f.title,
    language: first ? (langOf.get(first.file) ?? "?") : "?",
    memberCount: f.memberCount ?? 1,
    where: f.locations.map((l) => `${l.file}:${l.startLine}`),
    symbols: f.locations.map((l) => l.symbol ?? ""),
    hypotheses: (f.hypotheses ?? []).map((h) => ({
      pattern: h.pattern,
      state: h.state,
      confidence: h.confidence,
      source: h.source,
      cost: h.cost,
      checks: h.checks.map((c) => ({ label: c.label, passed: c.passed, why: c.why, role: c.role ?? "" })),
      discriminators: h.discriminators.map((c) => ({ label: c.label, passed: c.passed, why: c.why })),
      places: h.places.map((p) => ({ where: `${p.file}:${p.startLine}-${p.endLine}`, symbol: p.symbol ?? "", role: p.role })),
      toConfirm: h.toConfirm,
    })),
  };
});

const porKind: Record<string, number> = {};
for (const f of findings) porKind[f.kind] = (porKind[f.kind] ?? 0) + 1;

const porLenguajeLineas: Record<string, number> = {};
for (const f of a.files) porLenguajeLineas[f.language] = (porLenguajeLineas[f.language] ?? 0) + f.lines;

writeFileSync(
  out,
  JSON.stringify(
    {
      slug,
      dir,
      meta: {
        scannedFiles: a.scannedFiles,
        analysedFiles: a.analysedFiles,
        totalLines: a.totalLines,
        languages: a.languages,
        porLenguajeLineas,
        wallMs: Math.round(performance.now() - t0),
        cacheHit: cache.hit,
      },
      porKind,
      findings,
    },
    null,
    1,
  ),
);
console.log(
  `${out}: ${findings.length} hallazgos · ${a.analysedFiles}/${a.scannedFiles} archivos · ${a.totalLines} líneas`,
);
