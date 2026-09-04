/**
 * AK4 — SONDA DE POBLACIÓN: cuántas propuestas de `State · temporary-field`
 * quedarían vivas con el discriminador DZ ("el ciclo llenar/vaciar reparte
 * entre ≥2 miembros"), en las DOS poblaciones y con desglose por repo.
 *
 * NO es producción y NO corre `analyzeRepo`: parsea cada archivo con la MISMA
 * gramática y corre el detector-ancla REAL, igual que `ak4-sonda-banco.mts`.
 * La entrada es el censo de filas con hipótesis de State sacado de los volcados.
 *
 * Uso: npx tsx scripts/ak4-sonda-poblacion.mts <poblacion.json> <salida.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { LANGUAGE_DECLS } from "../src/server/services/code-analyzer.js";
import { detector as temporaryFieldDetector } from "../src/server/services/detect/intra-file/temporary-field.js";
import { fileUnitFrom, nodeSetsFor, parseRoot, testContext } from "../src/server/services/detect/testing.js";
import type { FileUnit, RawFinding } from "../src/server/services/detect/types.js";
import type { DerivedNodeSets } from "../src/server/services/code-grammar.js";

const [, , poblacionPath, outPath] = process.argv;
if (!poblacionPath || !outPath) {
  console.error("Uso: npx tsx scripts/ak4-sonda-poblacion.mts <poblacion.json> <salida.json>");
  process.exit(1);
}

interface Row {
  pop: string;
  repo: string;
  id: string;
  title: string;
  where: string[];
  states: string[];
  at: (string | null)[];
}

/**
 * Los miembros DISTINTOS que contienen las ubicaciones del hallazgo, contados
 * POR POSICIÓN (la función más angosta que contiene cada sitio), nunca por
 * NOMBRE: en TS/JS un miembro escrito como propiedad de clase con función
 * flecha no tiene campo `name`, así que CINCO miembros distintos salen los
 * cinco como "(anónima)" y un conteo por nombre los colapsa en uno.
 * `null` = no se pudo resolver algún sitio (sin árbol vivo o sin función
 * contenedora): el llamador NO debe afirmar nada.
 */
function miembrosPorPosicion(file: FileUnit, locs: readonly { startLine: number; endLine: number }[]): number | null {
  const ids = new Set<number>();
  for (const l of locs) {
    let best: { startLine: number; endLine: number } | null = null;
    for (const fn of file.functions) {
      if (fn.startLine > l.startLine || fn.endLine < l.endLine) continue;
      if (!best || fn.endLine - fn.startLine < best.endLine - best.startLine) best = fn;
    }
    if (!best) return null;
    ids.add(best.startLine);
  }
  return ids.size;
}

const rows = JSON.parse(readFileSync(poblacionPath, "utf8")) as Row[];
const setsCache = new Map<string, Promise<DerivedNodeSets>>();
const byExt = new Map<string, (typeof LANGUAGE_DECLS)[number]>();
for (const d of LANGUAGE_DECLS) for (const e of d.extensions) byExt.set(e, d);

const fileCache = new Map<string, { file: FileUnit; findings: readonly RawFinding[] }>();
const out: Record<string, unknown>[] = [];
let sinGramatica = 0;
let sinAncla = 0;

for (const row of rows) {
  const rootDir = row.pop === "LIB" ? "corpus" : "corpus-app";
  // `where`/`at` vienen como `<ruta relativa al repo>:<línea>`
  for (let i = 0; i < row.states.length; i++) {
    const at = row.at[i] ?? row.where[0] ?? null;
    if (!at) continue;
    const [relPath, lineStr] = [at.slice(0, at.lastIndexOf(":")), at.slice(at.lastIndexOf(":") + 1)];
    const line = Number(lineStr);
    const abs = path.join("/home/maxi1805/claude-kanban", rootDir, row.repo, relPath);
    const decl = byExt.get(path.extname(relPath));
    if (!decl) {
      sinGramatica++;
      continue;
    }
    let cached = fileCache.get(abs);
    if (!cached) {
      let sets = setsCache.get(decl.id);
      if (!sets) {
        sets = nodeSetsFor(decl.wasm, decl.probeSource, decl.extraCloneNodes, decl.functionExclusions);
        setsCache.set(decl.id, sets);
      }
      const src = readFileSync(abs, "utf8");
      const astRoot = await parseRoot(decl.wasm, src);
      const file = fileUnitFrom(astRoot, sets ? await sets : await sets!, decl.id, { file: relPath });
      cached = { file, findings: temporaryFieldDetector.run(file, testContext(temporaryFieldDetector, decl.id)) };
      fileCache.set(abs, cached);
    }
    const findings = cached.findings;
    // El hallazgo cuya PRIMERA ubicación coincide con `at`, o —para filas
    // agrupadas— el que contiene esa línea entre sus ubicaciones.
    const hit =
      findings.find((f) => f.locations[0]?.startLine === line) ?? findings.find((f) => f.locations.some((l) => l.startLine === line));
    if (!hit) {
      sinAncla++;
      out.push({ pop: row.pop, repo: row.repo, id: row.id, at, state: row.states[i], escritores: null });
      continue;
    }
    const escritores = new Set(hit.locations.map((l) => l.symbol).filter((s): s is string => Boolean(s))).size;
    const porPosicion = miembrosPorPosicion(cached.file, hit.locations);
    out.push({ pop: row.pop, repo: row.repo, id: row.id, at, state: row.states[i], titulo: hit.title, escritores, porPosicion });
  }
}

writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`propuestas ${out.length} · sin gramática ${sinGramatica} · sin ancla resuelta ${sinAncla}`);
