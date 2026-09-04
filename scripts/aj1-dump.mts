/**
 * OLA AJ · FRENTE AJ1 — volcado propio, con los campos que `dump-hallazgos.mts`
 * no lleva y que este frente necesita para simular un cambio de id SIN correr el
 * analizador dos veces: `endLine` de cada ubicación (entra en `ordenDeLectura`,
 * el criterio con el que `desambiguarIdsRepetidos` decide quién conserva el id) y
 * el `title` completo (último desempate del mismo criterio).
 *
 * NO reemplaza a `dump-hallazgos.mts` ni lo toca: es un volcado paralelo, con el
 * MISMO `stableFindingId`, para que las dos salidas se puedan cruzar por id.
 *
 * Uso: npx tsx scripts/aj1-dump.mts <dir> <salida.json>
 */
import { writeFileSync } from "node:fs";

import { analyzeRepoCached } from "../src/server/services/analyze-cache.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";

const [, , dir, out] = process.argv;
if (!dir || !out) {
  console.error("Uso: npx tsx scripts/aj1-dump.mts <dir> <salida.json>");
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
  hypotheses: (f.hypotheses ?? []).map((h) => ({ pattern: h.pattern, state: h.state })),
}));

writeFileSync(out, JSON.stringify({ dir, total: findings.length, findings }, null, 0));
console.log(`${out}: ${findings.length} hallazgos`);
