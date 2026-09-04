/**
 * OLA G — la foto de genericidad que nunca se pudo sacar: el analizador
 * corrido sobre las 8 poblaciones del corpus externo, una por proceso.
 *
 * POR QUÉ EXISTE. Las 35 recomendaciones vivas que se juzgaron a mano salían
 * de DOS poblaciones (466 Ruby + 186 TS, y las TS son este mismo analizador
 * midiéndose a sí mismo). Java, C#, Python y Go tenían CERO casos medidos.
 * `dump-hallazgos.mts` vuelca hallazgos pero agrupa las hipótesis sólo por
 * `pattern`/`state`, sin la evidencia ni la ubicación que hacen falta para
 * juzgar una a mano. Esto vuelca las dos cosas: el resumen por patrón/estado
 * y la fila completa de cada hipótesis viva.
 *
 * UN REPO POR INVOCACIÓN, sin excepción — misma razón que `census.mts`:
 * dos `analyzeRepo` en el mismo proceso corrompen el caché de `require` de
 * `web-tree-sitter`.
 *
 * Uso: npx tsx scripts/foto-lenguajes.mts <dir> <slug> <salida.json>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";

const [, , dir, slug, out] = process.argv;
if (!dir || !slug || !out) {
  console.error("uso: foto-lenguajes.mts <dir> <slug> <salida.json>");
  process.exit(1);
}

const t0 = performance.now();
const a = await analyzeRepo({ dir, repoName: slug, limits: { maxFindings: "unlimited" } });
const wallMs = Math.round(performance.now() - t0);

const porKind: Record<string, number> = {};
const porPatronEstado: Record<string, number> = {};
const porExtension: Record<string, number> = {};
const filas: unknown[] = [];

// `CodeFinding` (el tipo del PRODUCTO, `shared/types.ts`) no lleva `language`
// — sólo el `Finding` del servidor lo tiene, y `toCodeFinding` no lo copia.
// La extensión del primer archivo de la evidencia es la única lectura honesta
// desde acá; para repos de un solo lenguaje coincide con `a.languages`.
const extOf = (p: string): string => p.slice(p.lastIndexOf(".") + 1) || "(sin ext)";

for (const f of a.findings) {
  porKind[f.kind] = (porKind[f.kind] ?? 0) + 1;
  const lang = f.locations[0] ? extOf(f.locations[0].file) : "(sin ubicación)";
  porExtension[lang] = (porExtension[lang] ?? 0) + 1;
  for (const h of f.hypotheses ?? []) {
    const key = `${h.pattern}|${h.state}`;
    porPatronEstado[key] = (porPatronEstado[key] ?? 0) + 1;
    filas.push({
      pattern: h.pattern,
      state: h.state,
      confidence: h.confidence,
      kind: f.kind,
      language: lang,
      where: f.locations.map((l) => `${l.file}:${l.startLine}-${l.endLine}`),
      symbol: f.locations[0]?.symbol ?? null,
      title: f.title,
      places: h.places.map((p) => `${p.file}:${p.startLine}-${p.endLine} ${p.symbol ?? ""} [${p.role ?? ""}]`),
      checks: h.checks.map((c) => `${c.passed ? "OK" : "NO"} ${c.label}: ${c.why}`),
      discriminators: h.discriminators.map((c) => `${c.passed ? "OK" : "NO"} ${c.label}`),
      cost: h.cost,
      toConfirm: h.toConfirm,
      missingCapabilities: h.missingCapabilities,
    });
  }
}

const vivas = filas.filter((r) => {
  const s = (r as { state: string }).state;
  return s !== "ya-aplicado" && s !== "aplicado-eludido" && s !== "no-aplicable";
});

const resumen = {
  slug,
  dir,
  wallMs,
  archivosAnalizados: a.analysedFiles,
  archivosEscaneados: a.scannedFiles,
  lenguajes: a.languages,
  hallazgos: a.findings.length,
  hallazgosTotal: a.findingsTotal,
  hipotesis: filas.length,
  hipotesisVivas: vivas.length,
  porKind,
  porExtension,
  porPatronEstado,
};

mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
writeFileSync(out, JSON.stringify({ ...resumen, filas }, null, 1));
console.log(JSON.stringify(resumen, null, 1));
