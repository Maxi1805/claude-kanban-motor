/**
 * CLI del censo golden — CONTRATOS.md §3.5.
 *
 * Censa UN repo por invocación, sin excepción: correr dos análisis en el
 * mismo proceso corrompe el caché de `require` de `web-tree-sitter` (ver el
 * comentario de `loadRuntime` en `src/server/services/code-analyzer.ts`).
 * `scripts/census-all.sh` invoca esto una vez POR REPO; `census-golden.test.ts`
 * hace lo mismo, como subproceso, por la misma razón.
 *
 * Uso:
 *   npx tsx scripts/census.mts <dir> <slug> [salida.json]
 *
 * Siempre corre con `limits: "unlimited"` (censusRepo lo fija) — el censo
 * mide la detección, no el corte de salida.
 *
 * Sin `salida.json`: imprime el censo serializado a STDOUT y nada más (para
 * que un llamador lo capture y lo parsee). Con `salida.json`: lo escribe ahí
 * (creando directorios intermedios) y en cambio imprime un resumen de una
 * línea a STDERR.
 *
 * E2: además, SI ya existe un golden congelado para este `slug` en
 * `tests/golden/`, compara contra él e imprime a STDERR los `increases` de
 * `diffCensus` (nunca a STDOUT — eso seguiría siendo SÓLO el censo
 * serializado, lo que `census-golden.test.ts` parsea). Puramente
 * informativo: un delta positivo es esperable (CONTRATOS.md §3.4) y esto no
 * toca el código de salida ni ningún criterio de éxito/fracaso — antes de
 * esto, un aumento en un kind CONGELADO (delta exigido = 0) podía colarse
 * sin que ningún consumidor de este script lo mostrara (ver E1).
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { censusRepo, serializeCensus, diffCensus, parseCensus, type Census } from "../src/server/services/census.js";

const GOLDEN_DIR = path.resolve(import.meta.dirname, "..", "tests", "golden");

/** Ver el docstring del módulo (E2). Nunca lanza: sin golden para este slug, o con un `analyzerVersion` que no coincide, no hay nada que reportar. */
async function reportIncreases(slug: string, head: Census): Promise<void> {
  let base: Census;
  try {
    base = parseCensus(await fs.readFile(path.join(GOLDEN_DIR, `${slug}.census.json`), "utf8"));
  } catch {
    return;
  }
  if (base.meta.analyzerVersion !== head.meta.analyzerVersion) return;

  const diff = diffCensus(base, head, []);
  if (diff.increases.length === 0) return;
  const lines = diff.increases
    .slice()
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((d) => `  ${d.key}: ${d.base} -> ${d.head}`);
  console.error(
    `[censo] ${slug}: ${diff.increases.length} aumento(s) respecto de tests/golden/${slug}.census.json ` +
      "(informativo, NO rompe — CONTRATOS.md §3.4):\n" +
      lines.join("\n"),
  );
}

async function main(): Promise<void> {
  const [dir, slug, outFile] = process.argv.slice(2);
  if (!dir || !slug) {
    console.error("uso: census.mts <dir> <slug> [salida.json]");
    process.exitCode = 1;
    return;
  }

  const census = await censusRepo(path.resolve(dir), slug);
  const text = serializeCensus(census);

  await reportIncreases(slug, census);

  if (outFile) {
    const outPath = path.resolve(outFile);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, text, "utf8");
    const keyCount = Object.keys(census.keys).length;
    console.error(
      `${slug}: ${census.meta.analysedFiles}/${census.meta.scannedFiles} archivos, ` +
        `${census.meta.totalLines} líneas, ${keyCount} claves, ${census.meta.elapsedMs} ms -> ${outPath}`,
    );
  } else {
    process.stdout.write(text);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exitCode = 1;
});
