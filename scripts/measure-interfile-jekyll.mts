/**
 * P5 (Ola 10) — medición (a): impacto de filtrar aristas `provenance:
 * "ambiguous"` en los detectores `inter-file`, sobre jekyll (único repo
 * donde el volumen de ambiguas importa — A6/CONTRATO-F9.md, 35,89% de sus
 * aristas resueltas). Corre el pipeline REAL (`analyzeRepo`, camino de
 * `code-inspector.ts`, `limits: "unlimited"`) y cuenta findings `inter-file`
 * por `detectorId`. Pensado para correr DOS VECES sobre el mismo checkout:
 * una vez ANTES del fix de P1 (aristas ambiguas sin filtrar en los 17
 * detectores inter-file) y otra vez DESPUÉS — el delta por detector es la
 * medición que decide el tamaño real del fix.
 *
 * UN repo (jekyll, chico) por proceso — regla de memoria de la ola.
 *
 * Uso:
 *   npx tsx scripts/measure-interfile-jekyll.mts <dir-jekyll> [salida.json]
 */
import { promises as fsp } from "node:fs";
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";

async function main(): Promise<void> {
  const [, , dir, outPath] = process.argv;
  if (!dir) {
    console.error("Uso: npx tsx scripts/measure-interfile-jekyll.mts <dir-jekyll> [salida.json]");
    process.exit(1);
  }
  const rootDir = path.resolve(dir);
  const t0 = performance.now();
  const analysis = await analyzeRepo({
    dir: rootDir,
    repoName: path.basename(rootDir),
    limits: { maxFindings: "unlimited" },
  });
  const wallMs = Math.round(performance.now() - t0);

  // `analysis.findings` es la salida RANKEADA/AGRUPADA para la UI (sin
  // `detectorId`/`scope`); `analysis.coverage` (DetectorCoverage[], una fila
  // por detector) sí los lleva y su `.findings` es el conteo CRUDO
  // (`kept.length` en `detect/run.ts`), no afectado por el cap/ranking — es
  // lo correcto para medir el volumen real por detector.
  const interFileCoverage = (analysis.coverage ?? []).filter((c) => c.scope === "inter-file");
  const byDetector: Record<string, number> = {};
  for (const c of interFileCoverage) byDetector[c.detectorId] = (byDetector[c.detectorId] ?? 0) + c.findings;
  const interFileTotal = interFileCoverage.reduce((sum, c) => sum + c.findings, 0);

  const result = {
    slug: path.basename(rootDir),
    analysedFiles: analysis.analysedFiles,
    scannedFiles: analysis.scannedFiles,
    findingsTotal: analysis.findingsTotal,
    interFileTotal,
    interFileByDetector: Object.fromEntries(Object.entries(byDetector).sort(([, a], [, b]) => b - a)),
    interFileCoverageRaw: interFileCoverage,
    wallMs,
  };

  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (outPath) {
    await fsp.mkdir(path.dirname(path.resolve(outPath)), { recursive: true });
    await fsp.writeFile(outPath, text, "utf8");
    console.error(`${result.slug}: inter-file=${interFileTotal} detectores=${Object.keys(byDetector).length} wallMs=${wallMs} -> ${outPath}`);
  } else {
    process.stdout.write(text);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
