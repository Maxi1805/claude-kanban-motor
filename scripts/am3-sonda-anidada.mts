/**
 * OLA AM · FRENTE AM3 — SONDA K3 (no toca producción): ¿el lugar que repite el tratamiento
 * es una función ANIDADA dentro de otra función, en vez de un miembro de un tipo o una
 * función de nivel superior? Puro AST: se pregunta si ALGUNA otra función del mismo archivo
 * CONTIENE estrictamente el rango de líneas del sitio.
 *
 * Uso: npx tsx scripts/am3-sonda-anidada.mts <entrada.json> <salida.json>
 * entrada: [{repo, dirRepo, sitios:[{file,startLine,endLine,symbol}], ...}]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";

const [, , inPath, outPath] = process.argv;
const entrada = JSON.parse(readFileSync(inPath!, "utf8")) as any[];
const cache = new Map<string, any>();
async function unidad(dir: string, file: string) {
  const k = `${dir}|${file}`;
  if (!cache.has(k)) cache.set(k, await resolveLiveFileUnit(dir, file));
  return cache.get(k);
}
for (const e of entrada) {
  for (const s of e.sitios) {
    const live = await unidad(e.dirRepo, s.file);
    if (!live) { s.anidada = null; continue; }
    const fns = live.unit.functions as { file: string; startLine: number; endLine: number; name?: string }[];
    const propia = fns.find((f) => f.file === s.file && f.startLine === s.startLine);
    s.ubicada = propia !== undefined;
    s.anidada = propia
      ? fns.some((f) => f !== propia && f.file === s.file && f.startLine < propia.startLine && f.endLine >= propia.endLine)
      : null;
  }
}
writeFileSync(outPath!, JSON.stringify(entrada, null, 1));
console.error(`${outPath}: ${entrada.length}`);
