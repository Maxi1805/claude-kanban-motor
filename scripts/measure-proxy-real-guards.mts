/**
 * Medición ad hoc, Ola Proxy (frente propio) — antes de decidir arreglar o
 * apagar `hypotheses/proxy.ts`, cuenta cuántos grupos (clase, campo) tienen
 * una guarda REAL de inicialización perezosa repetida (`guardSites.length >=
 * 2`, vía `matchGuardFieldAst` — `if (!x) x = new Y()` o `x ||= new Y()`/`x
 * ??= new Y()`) en las dos poblaciones reales, usando el MISMO escaneo
 * (`scanFileForProxyFields`) y el MISMO camino de parseo bajo demanda
 * (`resolveLiveFileUnit`) que usa la hipótesis en producción — sin correr
 * `analyzeRepo` completo (nada de grafo/clones/cross-file, sólo parseo por
 * archivo, mucho más liviano).
 *
 * Uso: npx tsx scripts/measure-proxy-real-guards.mts <dir> <slug> [extensiones-csv]
 */
import fs from "node:fs/promises";
import path from "node:path";

import { resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import { scanFileForProxyFields } from "../src/server/services/hypotheses/proxy.js";

// Mismo criterio que `code-analyzer.ts` (`SKIP_DIRS`/`TEST_DIR_NAMES`/`TEST_FILE_PATTERNS`)
// para que el recuento de archivos se acerque al de la población real ("466 Ruby").
const DEFAULT_IGNORED_DIRS = new Set([
  ".git", "node_modules", "vendor", "tmp", "log", "dist", "build", "coverage",
  "public", ".next", ".nuxt", "__pycache__", ".venv", "venv", "target",
  ".bundle", "bower_components", ".cache", "storage",
]);
const TEST_DIR_NAMES = new Set(["spec", "test", "tests", "__tests__", "features"]);
const TEST_FILE_PATTERNS = [/_spec\.rb$/, /_test\.rb$/, /\.test\.[^.]+$/, /\.spec\.[^.]+$/];

function isTestPath(relativePath: string): boolean {
  const segments = relativePath.split("/");
  const basename = segments[segments.length - 1] ?? "";
  if (segments.slice(0, -1).some((segment) => TEST_DIR_NAMES.has(segment))) return true;
  return TEST_FILE_PATTERNS.some((pattern) => pattern.test(basename));
}

async function walk(dir: string, root: string, exts: Set<string>, out: string[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (DEFAULT_IGNORED_DIRS.has(e.name)) continue;
      await walk(full, root, exts, out);
    } else if (e.isFile()) {
      if (!exts.has(path.extname(e.name).toLowerCase())) continue;
      const rel = path.relative(root, full);
      if (isTestPath(rel)) continue;
      out.push(rel);
    }
  }
}

async function main(): Promise<void> {
  const [, , dir, slug, extsArg] = process.argv;
  if (!dir || !slug) {
    console.error("Uso: npx tsx scripts/measure-proxy-real-guards.mts <dir> <slug> [extensiones-csv]");
    process.exit(1);
  }
  const rootDir = path.resolve(dir);
  const exts = new Set((extsArg ?? ".rb,.ts,.tsx").split(",").map((s) => s.trim().toLowerCase()));

  const files: string[] = [];
  await walk(rootDir, rootDir, exts, files);

  let filesParsed = 0;
  let groupsTotal = 0;
  let groupsWithGuardSites2plus = 0;
  let groupsWithForwardSites1plus = 0;
  let groupsWithPlainWriteOnly = 0;
  const guardExamples: { file: string; className: string; field: string; guardSites: number; sites: { line: number; method: string; text: string }[] }[] = [];

  for (const rel of files) {
    const live = await resolveLiveFileUnit(rootDir, rel);
    if (!live) continue;
    filesParsed++;
    try {
      const scanned = scanFileForProxyFields(live.unit, live.unit.sets);
      for (const g of scanned.values()) {
        groupsTotal++;
        if (g.guardSites.length >= 2) {
          groupsWithGuardSites2plus++;
          guardExamples.push({
            file: rel,
            className: g.className,
            field: g.field,
            guardSites: g.guardSites.length,
            sites: g.guardSites.map((s) => ({ line: s.startLine, method: s.methodName, text: "" })),
          });
        } else if (g.forwardSites.length >= 1) {
          groupsWithForwardSites1plus++;
        } else if (g.plainWriteSites.length >= 1) {
          groupsWithPlainWriteOnly++;
        }
      }
    } finally {
      live.release();
    }
  }

  console.log(
    JSON.stringify(
      {
        slug,
        filesWalked: files.length,
        filesParsed,
        groupsTotal,
        groupsWithGuardSites2plus,
        groupsWithForwardSites1plus,
        groupsWithPlainWriteOnly,
        guardExamples,
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
