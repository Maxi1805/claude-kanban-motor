/**
 * Probe diagnóstico (no forma parte de la suite) — mide, sobre guava real,
 * cuántos imports internos (`com.google.*`) resuelven hoy con
 * `resolveImportTarget` y cuántos fallan por AMBIGÜEDAD (2+ candidatos por
 * sufijo) vs por AUSENCIA (0 candidatos). Replica la construcción del
 * conjunto `known` (rutas relativas de archivos analizados) con las mismas
 * exclusiones de `ingest-exclusion.ts` que aplican a `.java` (test-dir por
 * nombre; los demás criterios de esa clase no aplican a `.java`: sufijos
 * generados y patrones de archivo de test son todos de otros lenguajes).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveImportTarget } from "../../src/server/services/graph/imports-target.js";

const ROOT = "/home/maxi1805/claude-kanban/corpus/guava";
const TEST_DIR_NAMES = new Set(["spec", "test", "tests", "__tests__", "features"]);

async function walk(dir: string, out: string[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (TEST_DIR_NAMES.has(e.name.toLowerCase())) continue;
      await walk(full, out);
    } else if (e.isFile() && e.name.endsWith(".java")) {
      out.push(path.relative(ROOT, full));
    }
  }
}

async function main() {
  const files: string[] = [];
  await walk(ROOT, files);
  console.error(`archivos .java analizados (post-exclusión de test-dir): ${files.length}`);
  const known = new Set(files);

  let internalImports = 0;
  let resolved = 0;
  let unresolvedAmbiguous = 0;
  let unresolvedNoMatch = 0;
  const ambiguousSamples: { file: string; spec: string; candidates: string[] }[] = [];
  const noMatchSamples: { file: string; spec: string }[] = [];

  for (const relFile of files) {
    const abs = path.join(ROOT, relFile);
    const text = await fs.readFile(abs, "utf8");
    const lines = text.split("\n");
    for (const line of lines) {
      const m = /^import\s+(?:static\s+)?([\w.]+)\s*;/.exec(line.trim());
      if (!m) continue;
      const spec = m[1];
      if (!spec.startsWith("com.google.")) continue; // sólo internos del propio repo
      internalImports++;
      const target = resolveImportTarget(relFile, spec, known);
      if (target !== null && target !== relFile) {
        resolved++;
      } else {
        // Diagnóstico manual: contar candidatos por sufijo para separar
        // "ambiguo" (2+) de "sin match" (0).
        const asPath = spec.split(".").join("/");
        const hits: string[] = [];
        for (const p of known) {
          const base = p.includes(".") ? p.slice(0, p.lastIndexOf(".")) : p;
          if (base === asPath || base.endsWith(`/${asPath}`)) hits.push(p);
        }
        if (hits.length >= 2) {
          unresolvedAmbiguous++;
          if (ambiguousSamples.length < 10) ambiguousSamples.push({ file: relFile, spec, candidates: hits });
        } else {
          unresolvedNoMatch++;
          if (noMatchSamples.length < 10) noMatchSamples.push({ file: relFile, spec });
        }
      }
    }
  }

  console.log(JSON.stringify({ internalImports, resolved, unresolvedAmbiguous, unresolvedNoMatch }, null, 2));
  console.log("--- muestras ambiguas ---");
  console.log(JSON.stringify(ambiguousSamples, null, 2));
  console.log("--- muestras sin match ---");
  console.log(JSON.stringify(noMatchSamples, null, 2));
}

main();
