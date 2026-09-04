/**
 * Medición de la exclusión de ingesta: cuántos archivos saca del análisis
 * cada categoría — vendorizado/generado/minificado (D5) y árbol de test
 * (D-TEST) — y CUÁLES.
 *
 * Uso:
 *   npx tsx scripts/measure-ingest-exclusion.mts <dir> [<dir> ...]
 *
 * Corre `collectFiles` —la ingesta real de producción, no una imitación— con
 * el callback `onExcluded`, y separa las exclusiones en TRES clases de
 * granularidad distinta (clasificadas por `stat` real, no adivinando por la
 * razón: D-TEST agregó `test-tree` como razón compartida entre un directorio
 * podado entero — `isTestDirName`/proyecto .NET — y un archivo suelto
 * descartado por sufijo, así que sólo el propio filesystem puede decir cuál
 * de los dos es cada entrada):
 *
 *   · ARCHIVOS excluidos por nombre generado, marca de cabecera, forma
 *     minificada o nombre/sufijo de archivo de test: se reportan uno por uno.
 *   · ÁRBOLES DE DEPENDENCIAS podados (`dependency-tree`, D5): se reporta el
 *     directorio y, sólo para esta medición, se cuenta a mano cuántos
 *     archivos analizables tenía adentro, distinguiendo los que la Ola 11b
 *     AGREGÓ a la lista de los que ya se excluían antes: el delta de D5 son
 *     sólo los primeros.
 *   · ÁRBOLES DE TEST podados (`test-tree` sobre un DIRECTORIO, D-TEST): el
 *     hueco que esta ola midió y cerró — antes de D-TEST, un directorio de
 *     test podado (`spec`/`test`/`tests` por nombre, o un proyecto .NET vía
 *     `Microsoft.NET.Test.Sdk`) NO pasaba por acá: `dependency-tree` era la
 *     única razón que este script sabía contar como directorio, así que un
 *     árbol de test entero se veía, erróneamente, como "un archivo excluido
 *     más" (una sola entrada, sin sumar lo de adentro al total).
 *
 * El punto de listar nombre por nombre y no un total es el requisito de
 * seguridad del frente: la exclusión no puede sacar código legítimo del
 * usuario, y eso sólo se puede afirmar mirando los nombres.
 */
import { promises as fsp } from "node:fs";
import path from "node:path";

import { collectFiles, LANGUAGE_DECLS } from "../src/server/services/code-analyzer.js";
import type { ExcludedFile } from "../src/server/services/ingest-exclusion.js";

/**
 * La lista de directorios podados TAL COMO ESTABA antes de D5, congelada acá
 * como línea base de la medición. No se importa de `code-analyzer.ts` a
 * propósito: si se importara, el "antes" se movería solo con el "después" y
 * la comparación no diría nada.
 */
const SKIP_DIRS_PRE_D5 = new Set([
  ".git", "node_modules", "vendor", "tmp", "log", "dist", "build", "coverage",
  "public", ".next", ".nuxt", "__pycache__", ".venv", "venv", "target",
  ".bundle", "bower_components", ".cache", "storage",
]);

const EXTENSIONS = new Set(LANGUAGE_DECLS.flatMap((d) => d.extensions));

/** Archivos con extensión analizable, a cualquier profundidad, sin podar nada. */
async function analysableUnder(dir: string): Promise<number> {
  let count = 0;
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) count += await analysableUnder(full);
    else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name).toLowerCase())) count++;
  }
  return count;
}

async function main(): Promise<void> {
  const dirs = process.argv.slice(2);
  if (dirs.length === 0) {
    console.error("uso: npx tsx scripts/measure-ingest-exclusion.mts <dir> [<dir> ...]");
    process.exit(2);
  }

  for (const dir of dirs) {
    const excluded: ExcludedFile[] = [];
    const t0 = Date.now();
    const kept = await collectFiles(dir, { onExcluded: (e) => excluded.push(e) });
    const elapsed = Date.now() - t0;

    // Clasificar por STAT real, no por razón: D-TEST hizo que `test-tree`
    // pueda ser un directorio entero (`isTestDirName`, proyecto .NET) o un
    // archivo suelto (sufijo de nombre), y sólo el filesystem lo distingue.
    const files: ExcludedFile[] = [];
    const dependencyDirs: ExcludedFile[] = [];
    const testDirs: ExcludedFile[] = [];
    for (const e of excluded) {
      let isDir = false;
      try {
        isDir = (await fsp.stat(path.join(dir, e.path))).isDirectory();
      } catch {
        // Podado antes de que este script lo vuelva a mirar: confiar en la
        // razón, que para `dependency-tree` siempre es un directorio.
        isDir = e.reason === "dependency-tree";
      }
      if (e.reason === "dependency-tree") dependencyDirs.push(e);
      else if (isDir) testDirs.push(e);
      else files.push(e);
    }

    let newlyPrunedDeps = 0;
    const depLines: string[] = [];
    for (const d of dependencyDirs.sort((a, b) => a.path.localeCompare(b.path))) {
      const name = path.basename(d.path);
      const inside = await analysableUnder(path.join(dir, d.path));
      const isNew = !SKIP_DIRS_PRE_D5.has(name);
      if (isNew) newlyPrunedDeps += inside;
      depLines.push(`  - ${d.path}/ (${inside} analizables adentro) ${isNew ? "[NUEVO en D5]" : "[ya se podaba antes de D5]"}`);
    }

    let prunedByTestTree = 0;
    const testDirLines: string[] = [];
    for (const d of testDirs.sort((a, b) => a.path.localeCompare(b.path))) {
      const inside = await analysableUnder(path.join(dir, d.path));
      prunedByTestTree += inside;
      testDirLines.push(`  - ${d.path}/ (${inside} analizables adentro) [D-TEST]`);
    }

    const after = kept.length;
    const before = after + files.length + newlyPrunedDeps + prunedByTestTree;
    console.log(`\n=== ${dir} ===`);
    console.log(`ANTES (ingesta pre-D5, SIN D-TEST):  ${before} archivos`);
    console.log(`DESPUÉS (con D5 + D-TEST):           ${after} archivos`);
    console.log(
      `DELTA:                               -${before - after}` +
        `  (${files.length} por archivo, ${newlyPrunedDeps} dentro de árboles de dependencias nuevos,` +
        ` ${prunedByTestTree} dentro de árboles de test)`,
    );
    console.log(`recorrido: ${elapsed} ms`);

    const byReason = new Map<string, number>();
    for (const e of files) byReason.set(e.reason, (byReason.get(e.reason) ?? 0) + 1);
    if (files.length > 0) {
      console.log("ARCHIVOS EXCLUIDOS:");
      for (const [reason, count] of [...byReason].sort()) console.log(`  ${reason}: ${count}`);
      for (const e of files.slice().sort((a, b) => a.path.localeCompare(b.path))) {
        console.log(`  - ${e.path} [${e.reason}] ${e.detail}`);
      }
    }
    if (dependencyDirs.length > 0) {
      console.log(`ÁRBOLES DE DEPENDENCIAS PODADOS: ${dependencyDirs.length}`);
      for (const line of depLines) console.log(line);
    }
    if (testDirs.length > 0) {
      console.log(`ÁRBOLES DE TEST PODADOS (D-TEST): ${testDirs.length}`);
      for (const line of testDirLines) console.log(line);
    }
  }
}

await main();
