/**
 * T1 (Ola Q) — sonda de FORMA para los tres kinds del frente: `coupling-without-abstraction`,
 * `feature-envy-intra`, `speculative-abstraction`.
 *
 * Vuelca, para cada hallazgo de esos tres kinds, TODOS los campos que dump-hallazgos.mts no
 * guarda (detail, locations[].role, evidence, trigger) — necesarios para agrupar por FORMA
 * ESTRUCTURAL del caso, no por el texto del título. Sólo lee: no cambia ningún detector ni
 * umbral.
 *
 * Uso: npx tsx scripts/q-t1-formas.mts <dir> <repoLabel> <salida.json>
 */
import { writeFileSync } from "node:fs";

import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";

const KINDS = new Set(["coupling-without-abstraction", "feature-envy-intra", "speculative-abstraction"]);

const [, , dir, repoLabel, out] = process.argv;
if (!dir || !repoLabel || !out) {
  console.error("Uso: npx tsx scripts/q-t1-formas.mts <dir> <repoLabel> <salida.json>");
  process.exit(1);
}

const t0 = performance.now();
const { analysis: a, cache } = await analyzeRepoCached({
  dir,
  repoName: repoLabel,
  limits: { maxFindings: "unlimited" },
});
console.error(
  `[q-t1] ${repoLabel}: ${cache.hit ? "HIT" : "MISS"} (${cache.reason}) analyzeMs=${cache.analyzeMs.toFixed(0)} wallMs=${Math.round(performance.now() - t0)}`,
);

// NOTA: `analysis.findings` es `readonly CodeFinding[]` (el tipo público, angosto), NO
// `readonly Finding[]` (el tipo interno de `detect/types.ts` con `trigger`/`evidence`/
// `RoleLocation.role`) — verificado con `tsc` DESPUÉS de escribir este archivo: esos tres
// campos no existen en `CodeFinding`/`CodeLocation`. La sonda sólo lee lo que el tipo
// público sí expone; la categorización por FORMA de este frente usa `detail` (que SÍ trae,
// en texto, el rol declarado y las señales de confianza — ver T1.md).
const rows = a.findings
  .filter((f) => KINDS.has(f.kind))
  .map((f) => ({
    repo: repoLabel,
    kind: f.kind,
    id: f.id,
    title: f.title,
    detail: f.detail,
    severity: f.severity,
    locations: f.locations.map((l) => ({ file: l.file, symbol: l.symbol ?? null })),
  }));

const porKind: Record<string, number> = {};
for (const r of rows) porKind[r.kind] = (porKind[r.kind] ?? 0) + 1;

writeFileSync(out, JSON.stringify({ repo: repoLabel, generatedAt: new Date().toISOString(), porKind, rows }, null, 2));
console.error(`[q-t1] ${repoLabel}: ${JSON.stringify(porKind)}`);
