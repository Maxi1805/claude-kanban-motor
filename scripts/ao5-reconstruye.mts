/**
 * AO5 — reconstruye, SÓLO PARA JUZGAR, qué concepto propone cada hipótesis
 * `Null Object · duplication` sin volver a correr el analizador: escanea con el
 * extractor REAL (`null-object.ts#scanFile`) los archivos de la evidencia del
 * hallazgo ancla y lista las guardas que SOLAPAN EN RANGO con esa evidencia —
 * que es exactamente el filtro `dentroDeLaEvidencia` de `build()` ruta (2).
 *
 * Uso: npx tsx scripts/ao5-reconstruye.mts <dir> <dump.json> <id1,id2,...> <salida.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolveLiveFileUnit } from "../src/server/services/code-analyzer.js";
import { scanFile } from "../src/server/services/hypotheses/null-object.js";

const [, , dir, dump, idsCsv, out] = process.argv;
if (!dir || !dump || !idsCsv || !out) { console.error("uso: <dir> <dump.json> <ids> <salida>"); process.exit(1); }
const ids = new Set(idsCsv.split(","));
const d = JSON.parse(readFileSync(dump, "utf8")) as { findings: { id: string; kind: string; where: string[]; title: string; hypotheses: { pattern: string; state: string }[] }[] };

const cache = new Map<string, Awaited<ReturnType<typeof scanFile>> | null>();
async function scan(rel: string) {
  if (cache.has(rel)) return cache.get(rel)!;
  const live = await resolveLiveFileUnit(dir, rel);
  if (!live) { cache.set(rel, null); return null; }
  try { const r = scanFile(live.unit.root, live.unit.sets); cache.set(rel, r); return r; } finally { live.release(); }
}

const filas: unknown[] = [];
for (const f of d.findings) {
  if (!ids.has(f.id)) continue;
  const rangos = f.where.map((w) => { const i = w.lastIndexOf(":"); return { file: w.slice(0, i), line: Number(w.slice(i + 1)) }; });
  const dentro: unknown[] = [];
  for (const r of rangos) {
    const s = await scan(r.file);
    if (!s) continue;
    for (const g of s.guards) {
      // el `where` del volcado sólo trae startLine; se toma una ventana amplia
      // alrededor del inicio de la copia (los clones son de >= 6 líneas).
      if (g.startLine >= r.line - 2 && g.startLine <= r.line + 60) {
        dentro.push({ file: r.file, guardLine: g.startLine, miembro: g.memberName, concepto: g.guardedName, estricto: g.strict, atributo: g.isMemberAccess });
      }
    }
  }
  filas.push({ id: f.id, kind: f.kind, title: f.title, where: f.where, hipotesis: f.hypotheses.filter((h) => h.pattern === "Null Object"), guardasEnLaEvidencia: dentro });
}
writeFileSync(out, JSON.stringify(filas, null, 1));
console.log(`${out}: ${filas.length} hallazgos reconstruidos`);
