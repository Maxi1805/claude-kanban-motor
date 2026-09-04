/**
 * OLA AJ · FRENTE AJ2 — volcado con los campos que ningún volcado del proyecto lleva y
 * sin los cuales la pregunta de este frente no se puede ni formular: los `places` de CADA
 * hipótesis.
 *
 * POR QUÉ. `dump-hallazgos.mts` publica `hypotheses: [{pattern, state}]`, y
 * `w-int-censo-nivel2.mts` construye la fila del censo de nivel 2 con la ubicación del
 * HALLAZGO (`where[0]`), no la de la hipótesis. Dos hipótesis del mismo patrón en la misma
 * fila salen del censo como dos filas IDÉNTICAS, y `v-int-precision-nivel2.mts` las mete en
 * un `Map` con clave `<id>::<patrón>`: la segunda pisa a la primera. Ése es el techo que
 * AI3b midió (590 propuestas recuperadas, 118 direccionables) y el que este frente ataca.
 *
 * NO reemplaza ni toca `dump-hallazgos.mts`: es paralelo, con el MISMO id de salida, para
 * que las dos salidas se crucen por id.
 *
 * Uso: npx tsx scripts/aj2-dump.mts <dir> <salida.json>
 */
import { writeFileSync } from "node:fs";

import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";

const [, , dir, out] = process.argv;
if (!dir || !out) {
  console.error("Uso: npx tsx scripts/aj2-dump.mts <dir> <salida.json>");
  process.exit(1);
}

const { analysis: a, cache } = await analyzeRepoCached({ dir, repoName: "dump", limits: { maxFindings: "unlimited" } });
console.error(`[analyzer-cache] ${dir}: ${cache.hit ? "HIT" : "MISS"} (${cache.reason})`);

const findings = a.findings.map((f) => ({
  id: f.id ?? stableFindingId(f),
  kind: f.kind,
  title: f.title,
  memberCount: f.memberCount ?? 1,
  locs: f.locations.map((l) => ({ f: l.file, s: l.startLine, e: l.endLine, y: l.symbol ?? "" })),
  hypotheses: (f.hypotheses ?? []).map((h) => ({
    pattern: h.pattern,
    state: h.state,
    anchorFindingId: h.anchorFindingId ?? null,
    places: h.places.map((p) => ({ f: p.file, s: p.startLine, e: p.endLine, y: p.symbol ?? "", r: p.role })),
  })),
}));

writeFileSync(out, JSON.stringify({ dir, total: findings.length, findings }, null, 0));
console.log(`${out}: ${findings.length} hallazgos`);
