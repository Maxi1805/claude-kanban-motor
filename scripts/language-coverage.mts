/**
 * CLI de la cobertura por lenguaje — CONTRATO-F6.md Contrato 2.
 *
 * UN repo por invocación, sin excepción — mismo motivo que `scripts/census.mts`
 * (dos `analyzeRepo` en el mismo proceso corrompen el caché de `require` de
 * `web-tree-sitter`, ver `code-analyzer.ts#loadRuntime`). Este script SÓLO
 * arma la `RepoCoverageSample` de UN repo (analiza + serializa); la agregación
 * de N repos en la matriz `(lenguaje, detector)` vive en
 * `src/server/services/detect/language-coverage.ts#computeLanguageCoverage`,
 * que es pura y no toca disco — la llama quien junte varias muestras
 * (`language-coverage.test.ts`, o un futuro agregador de reporte).
 *
 * Uso:
 *   npx tsx scripts/language-coverage.mts <dir> <slug> [salida.json]
 *
 * Siempre `limits: "unlimited"` — mide detección, no corte de salida (igual
 * que el censo). Sin `salida.json`: imprime la muestra serializada a STDOUT.
 * Con `salida.json`: la escribe ahí y un resumen de una línea a STDERR.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import type { DetectorCoverageRow, RepoCoverageSample } from "../src/server/services/detect/language-coverage.js";
import type { CodeAnalysis, CodeFinding } from "../src/shared/types.js";

/**
 * `CodeAnalysis.coverage` (`shared/types.ts#CodeDetectorCoverage[]`) NO
 * declara `missingEdgeKinds`/`missingMetrics` — sólo el `DetectorCoverage`
 * server-only los tiene (`detect/types.ts`). Pero `crossAnalyze` asigna el
 * arreglo server-side DIRECTO a `coverage` (`aggregateCoverage(...)`, sin
 * copia campo a campo), así que el objeto en TIEMPO DE EJECUCIÓN sí trae esos
 * dos campos aunque el tipo compartido no los exponga — se leen acá por
 * duck-typing, igual que `silentIn` en `language-coverage.ts`, en vez de
 * mentir con `undefined` fijo.
 */
type RuntimeCoverageRow = NonNullable<CodeAnalysis["coverage"]>[number] & Partial<DetectorCoverageRow>;

/**
 * Atribución por lenguaje de un hallazgo `inter-file` (sin `language` propio
 * en `analysis.coverage` — es repo-wide). Se usa el archivo de la PRIMERA
 * ubicación como ancla — aproximación declarada (ver el docstring de
 * `RepoCoverageSample.interFileFindingsByLanguage`), no la atribución exacta
 * multi-lenguaje que hace el servidor internamente con `Finding.language`
 * (tipo server-only, no expuesto en `CodeFinding`/`onPreCapFindings`).
 */
function buildSample(analysis: CodeAnalysis, preCapFindings: readonly CodeFinding[], slug: string): RepoCoverageSample {
  const languageFacts: Record<string, { filesAnalysed: number; lines: number }> = {};
  const fileLanguage = new Map<string, string>();
  for (const file of analysis.files) {
    fileLanguage.set(file.path, file.language);
    const cur = languageFacts[file.language] ?? { filesAnalysed: 0, lines: 0 };
    cur.filesAnalysed += 1;
    cur.lines += file.lines;
    languageFacts[file.language] = cur;
  }

  const coverage: DetectorCoverageRow[] = ((analysis.coverage ?? []) as RuntimeCoverageRow[]).map((row) => ({
    detectorId: row.detectorId,
    title: row.title,
    scope: row.scope,
    kind: row.kind,
    language: row.language,
    status: row.status,
    missingCapabilities: row.missingCapabilities,
    missingEdgeKinds: row.missingEdgeKinds,
    missingMetrics: row.missingMetrics,
    unitsConsidered: row.unitsConsidered,
    findings: row.findings,
    error: row.error,
  }));

  const kindToDetectorId = new Map<string, string>();
  for (const row of analysis.coverage ?? []) if (row.scope === "inter-file") kindToDetectorId.set(row.kind, row.detectorId);

  const interFileFindingsByLanguage: Record<string, Record<string, number>> = {};
  for (const finding of preCapFindings) {
    const detectorId = kindToDetectorId.get(finding.kind);
    if (!detectorId) continue; // no es un kind inter-file conocido de esta corrida
    const primaryFile = finding.locations[0]?.file;
    const lang = (primaryFile && fileLanguage.get(primaryFile)) || "*cruzado*";
    const byLang = interFileFindingsByLanguage[detectorId] ?? {};
    byLang[lang] = (byLang[lang] ?? 0) + (finding.memberCount ?? 1); // misma convención que `census.ts#censusOf`.
    interFileFindingsByLanguage[detectorId] = byLang;
  }

  return { slug, languageFacts, coverage, interFileFindingsByLanguage };
}

async function main(): Promise<void> {
  const [dir, slug, outFile] = process.argv.slice(2);
  if (!dir || !slug) {
    console.error("uso: language-coverage.mts <dir> <slug> [salida.json]");
    process.exitCode = 1;
    return;
  }

  // Caché por SHA + huella del analizador (`analyze-cache.ts`) — mismo `limits:
  // "unlimited"` que `census.mts`/`edge-coverage.mts`, así que comparte entrada de
  // caché con esos dos cuando corren sobre el mismo repo en la misma corrida.
  const { analysis, preCapFindings: cachedPreCap, cache } = await analyzeRepoCached({
    dir: path.resolve(dir),
    repoName: slug,
    limits: { maxFindings: "unlimited" },
  });
  console.error(
    `[analyzer-cache] ${slug}: ${cache.hit ? "HIT" : "MISS"} (${cache.reason}) analyzeMs=${cache.analyzeMs.toFixed(0)} key=${cache.key || "-"}`,
  );
  const preCapFindings: readonly CodeFinding[] = cachedPreCap ?? [];

  const sample = buildSample(analysis, preCapFindings, slug);
  const text = `${JSON.stringify(sample, null, 2)}\n`;

  if (outFile) {
    const outPath = path.resolve(outFile);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, text, "utf8");
    console.error(
      `${slug}: ${analysis.analysedFiles}/${analysis.scannedFiles} archivos, ` +
        `${analysis.coverage?.length ?? 0} filas de cobertura -> ${outPath}`,
    );
  } else {
    process.stdout.write(text);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exitCode = 1;
});
