/**
 * `q-t4-sondas.mts` — Ola Q, frente T4 (triaje, SÓLO LECTURA sobre detectores).
 *
 * Vuelca, para UN repo, sólo los hallazgos de los 4 kinds candidatos a SIN
 * POBLACIÓN (manual-notification, inappropriate-intimacy,
 * distributed-duplication, flag-accumulator), con TODO el detalle
 * estructural que cada `RawFinding` ya trae (trigger/evidence/locations,
 * roles) — sin re-parsear AST, porque para estos 4 kinds el `detail`/
 * `evidence`/`role` de cada hallazgo YA contiene los campos estructurales que
 * el detector usó para decidir (nombre de método llamado, aridad, campos
 * destino, breadth mutua, componentes conexas, capas y condiciones) — es la
 * forma barata de agrupar por ESTRUCTURA DEL CASO sin escribir un segundo
 * analizador.
 *
 * Uso: npx tsx scripts/q-t4-sondas.mts <dir> <salida.json>
 */
import { writeFileSync } from "node:fs";

import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";

const KINDS = new Set([
  "manual-notification",
  "inappropriate-intimacy",
  "distributed-duplication",
  "flag-accumulator",
]);

const [, , dir, out] = process.argv;
if (!dir || !out) {
  console.error("Uso: npx tsx scripts/q-t4-sondas.mts <dir> <salida.json>");
  process.exit(1);
}

const t0 = performance.now();
const { analysis: a, cache } = await analyzeRepoCached({
  dir,
  repoName: "q-t4",
  limits: { maxFindings: "unlimited" },
});
console.error(
  `[analyzer-cache] ${dir}: ${cache.hit ? "HIT" : "MISS"} (${cache.reason}) analyzeMs=${cache.analyzeMs.toFixed(0)}`,
);
const wallMs = Math.round(performance.now() - t0);

const languageByFile = new Map(a.files.map((f) => [f.path, f.language] as const));

const findings = a.findings
  .filter((f) => KINDS.has(f.kind))
  .map((f) => ({
    id: f.id ?? stableFindingId(f),
    kind: f.kind,
    title: f.title,
    detail: f.detail,
    metric: f.metric,
    memberCount: f.memberCount ?? 1,
    languages: [...new Set(f.locations.map((l) => languageByFile.get(l.file) ?? "?"))],
    locations: f.locations.map((l) => ({
      file: l.file,
      startLine: l.startLine,
      endLine: l.endLine,
      symbol: l.symbol ?? null,
      role: (l as { role?: string }).role ?? null,
    })),
  }));

const porKind: Record<string, number> = {};
for (const f of findings) porKind[f.kind] = (porKind[f.kind] ?? 0) + 1;

writeFileSync(out, JSON.stringify({ dir, wallMs, total: findings.length, porKind, findings }, null, 1));
console.log(`${out}: ${findings.length} hallazgos (T4), ${JSON.stringify(porKind)}, ${wallMs}ms`);
