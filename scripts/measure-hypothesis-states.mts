/**
 * Consolida en UN script genérico lo que antes se escribía a mano, un
 * archivo por patrón: `measure-proxy-canonical.mts`, `measure-observer-
 * canonical.mts` (Ola 10, sin `slug`, filtran por `kind` ancla a mano) y la
 * familia `measure-{proxy,observer,singleton,template-method,command,cor,
 * factory-method,prototype}-states.mts` (Ola 10, uno por patrón, cada uno
 * repitiendo el mismo cuerpo con el nombre del patrón cableado). Ninguno se
 * borra acá (no es archivo de este paquete) — este reemplaza la necesidad de
 * escribir EL PRÓXIMO a mano: toma el patrón por parámetro, o reporta los 17
 * registrados de una vez.
 *
 * Corre `analyzeRepo` REAL (el mismo grafo y los mismos `Finding` que
 * produciría un análisis de verdad) sobre UN directorio, y reporta el
 * histograma de estados (`ausente`/`parcial`/`ya-aplicado`/
 * `aplicado-eludido`) por patrón — incluidos los patrones en CERO: el cero
 * es exactamente la señal que le faltaba a este proyecto (PENDIENTES.md
 * "Problema 2" / paquete P3, `hypothesis-state-gate.test.ts`): una hipótesis
 * silenciosa y una correctamente clasificada se ven igual en cualquier
 * conteo que no distinga "no hay entrada" de "hay una entrada en estado X".
 *
 * UN repo por proceso, guava sola — regla de memoria del proyecto. Este
 * script no impone eso por sí mismo (no hace fan-out): quien lo invoque
 * varias veces en tandas es responsable de esperar entre ellas.
 *
 * Uso:
 *   npx tsx scripts/measure-hypothesis-states.mts <dir> <slug> [patrón]
 *
 * Sin [patrón]: reporta los 17 patrones registrados en `hypotheses/
 * registry.ts` (derivados de ahí, nunca una lista escrita a mano — un
 * patrón nuevo aparece solo). Con [patrón]: filtra a ese único string
 * exacto (p.ej. "Proxy (inicialización perezosa)", "Template Method").
 *
 * Ejemplo — histograma completo sobre la fixture canónica versionada, sin
 * corpus:
 *   npx tsx scripts/measure-hypothesis-states.mts tests/fixtures/patterns fixtures-multi
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { computePatternCoverage } from "../src/server/services/hypotheses/pattern-coverage.js";
import { HYPOTHESES } from "../src/server/services/hypotheses/registry.js";
import type { CodeFindingHypothesisState } from "../src/shared/types.js";

const STATES: readonly CodeFindingHypothesisState[] = ["ausente", "parcial", "ya-aplicado", "aplicado-eludido"];

interface PatternReport {
  total: number;
  states: Record<CodeFindingHypothesisState, number>;
  /** Hasta 5 ejemplos por estado: "archivo:línea". */
  examples: Record<CodeFindingHypothesisState, string[]>;
}

async function main(): Promise<void> {
  const [, , dir, slug, patternFilter] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/measure-hypothesis-states.mts <dir> <slug> [patrón]");
    process.exit(1);
  }
  const rootDir = path.resolve(dir);
  const patterns = patternFilter ? [patternFilter] : HYPOTHESES.map((h) => h.pattern);

  const t0 = performance.now();
  const analysis = await analyzeRepo({
    dir: rootDir,
    repoName: slug,
    limits: { maxFindings: "unlimited" },
  });
  const wallMs = Math.round(performance.now() - t0);

  const report: Record<string, PatternReport> = {};
  for (const pattern of patterns) {
    const states = Object.fromEntries(STATES.map((s) => [s, 0])) as Record<CodeFindingHypothesisState, number>;
    const examples = Object.fromEntries(STATES.map((s) => [s, [] as string[]])) as Record<CodeFindingHypothesisState, string[]>;
    let total = 0;

    for (const finding of analysis.findings) {
      for (const h of finding.hypotheses ?? []) {
        if (h.pattern !== pattern) continue;
        total++;
        states[h.state]++;
        const bucket = examples[h.state];
        if (bucket.length < 5) {
          const loc = finding.locations[0];
          bucket.push(loc ? `${loc.file}:${loc.startLine}` : "?");
        }
      }
    }
    report[pattern] = { total, states, examples };
  }

  const silent = Object.entries(report)
    .filter(([, r]) => r.total === 0)
    .map(([pattern]) => pattern);

  // OLA A3, ítem 3 — "sin-insumo" vs "evaluado" para los patrones en
  // `silentPatterns`: ver `hypotheses/pattern-coverage.ts` para el porqué
  // completo. `analysis.coverage` es la MISMA cobertura que ya usa
  // `language-coverage.mts` (duck-typing por las mismas dos razones
  // documentadas ahí: `missingEdgeKinds` no está en el tipo compartido, pero
  // sí en el objeto real — acá ni siquiera hace falta leerlo, sólo `status`).
  const relevantHypotheses = patternFilter ? HYPOTHESES.filter((h) => h.pattern === patternFilter) : HYPOTHESES;
  const totalsByPattern = new Map(Object.entries(report).map(([pattern, r]) => [pattern, r.total] as const));
  const patternCoverage = computePatternCoverage(
    relevantHypotheses.map((h) => ({ pattern: h.pattern, anchors: h.anchors })),
    totalsByPattern,
    ((analysis.coverage ?? []) as { detectorId: string; kind: string; status: string }[]).map((row) => ({
      detectorId: row.detectorId,
      kind: row.kind,
      status: row.status,
    })),
  );
  const silentSinInsumo = patternCoverage.filter((p) => p.status === "sin-insumo").map((p) => p.pattern);
  const silentEvaluado = silent.filter((p) => !silentSinInsumo.includes(p));

  console.log(
    JSON.stringify(
      {
        slug,
        dir: rootDir,
        wallMs,
        totalFindings: analysis.findings.length,
        patternsReported: patterns.length,
        silentPatterns: silent,
        /** De `silentPatterns`: cuáles se callaron porque ningún detector-ancla corrió de verdad esta corrida. */
        silentPatternsSinInsumo: silentSinInsumo,
        /** De `silentPatterns`: cuáles SÍ tuvieron oportunidad (detector-ancla corrió) y aun así no hay hipótesis. */
        silentPatternsEvaluados: silentEvaluado,
        patternCoverage,
        patterns: report,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
