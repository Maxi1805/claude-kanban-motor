/**
 * P5 (Ola 10) — medición (a), variante de control: en vez de esperar a que
 * el fix de P1 aterrice en los 17 archivos de `detect/inter-file/*.ts`,
 * simula el MISMO efecto (quitar `provenance: "ambiguous"` de `graph.edges`
 * antes de que corran los detectores `inter-file`) directamente sobre el
 * grafo REAL que entrega `analyzeRepo` (`onGraph`, camino de
 * `code-inspector.ts`) — mutando `graph.edges` in-place ANTES de que
 * `crossAnalyze` arme `repoUnit`/corra `runDetectors`. Ningún archivo de
 * `src/` se toca; el filtro se aplica desde afuera, con `edgeIsAmbiguous`
 * (`graph/types.ts`), la misma función que el fix real usa. Corre DOS veces
 * el pipeline completo (con y sin ambiguas) para tener el delta exacto,
 * detector por detector, sin depender de en qué archivo haya aterrizado el
 * fix ni de cuántos de los 17 ya lo tengan.
 *
 * UN repo (jekyll) por proceso.
 *
 * Uso:
 *   npx tsx scripts/measure-ambiguous-impact-jekyll.mts <dir-jekyll> [salida.json]
 */
import { promises as fsp } from "node:fs";
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { edgeIsAmbiguous, type CodeGraph } from "../src/server/services/graph/types.js";

async function runOnce(rootDir: string, filterAmbiguous: boolean) {
  const analysis = await analyzeRepo({
    dir: rootDir,
    repoName: path.basename(rootDir),
    limits: { maxFindings: "unlimited" },
    onGraph: (r) => {
      if (!filterAmbiguous) return;
      const g = r.graph as { edges: CodeGraph["edges"] } | null;
      if (!g) return;
      const before = g.edges.length;
      g.edges = g.edges.filter((e) => !edgeIsAmbiguous(e));
      const after = g.edges.length;
      console.error(`  (mutado in-place: edges ${before} -> ${after}, ${before - after} ambiguas quitadas ANTES de runDetectors)`);
    },
  });
  const interFileCoverage = (analysis.coverage ?? []).filter((c) => c.scope === "inter-file");
  const byDetector: Record<string, number> = {};
  for (const c of interFileCoverage) byDetector[c.detectorId] = (byDetector[c.detectorId] ?? 0) + c.findings;
  const total = interFileCoverage.reduce((sum, c) => sum + c.findings, 0);
  return { total, byDetector };
}

async function main(): Promise<void> {
  const [, , dir, outPath] = process.argv;
  if (!dir) {
    console.error("Uso: npx tsx scripts/measure-ambiguous-impact-jekyll.mts <dir-jekyll> [salida.json]");
    process.exit(1);
  }
  const rootDir = path.resolve(dir);

  console.error("== corrida 1/2: CON ambiguas (estado de hoy, sin filtro) ==");
  const withAmbiguous = await runOnce(rootDir, false);
  console.error("== corrida 2/2: SIN ambiguas (simulación del fix de P1) ==");
  const withoutAmbiguous = await runOnce(rootDir, true);

  const detectorIds = new Set([...Object.keys(withAmbiguous.byDetector), ...Object.keys(withoutAmbiguous.byDetector)]);
  const delta: Record<string, { before: number; after: number; delta: number }> = {};
  for (const id of detectorIds) {
    const before = withAmbiguous.byDetector[id] ?? 0;
    const after = withoutAmbiguous.byDetector[id] ?? 0;
    if (before !== after) delta[id] = { before, after, delta: after - before };
  }

  const result = {
    slug: path.basename(rootDir),
    interFileTotalConAmbiguas: withAmbiguous.total,
    interFileTotalSinAmbiguas: withoutAmbiguous.total,
    deltaTotal: withoutAmbiguous.total - withAmbiguous.total,
    byDetectorConAmbiguas: withAmbiguous.byDetector,
    byDetectorSinAmbiguas: withoutAmbiguous.byDetector,
    detectoresConCambio: delta,
  };

  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (outPath) {
    await fsp.mkdir(path.dirname(path.resolve(outPath)), { recursive: true });
    await fsp.writeFile(outPath, text, "utf8");
    console.error(`${result.slug}: con=${withAmbiguous.total} sin=${withoutAmbiguous.total} delta=${result.deltaTotal} -> ${outPath}`);
  } else {
    process.stdout.write(text);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
