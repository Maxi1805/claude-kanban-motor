/**
 * AI5 — SONDA DE EMBUDO DE COMPUERTAS (auditoría, no producción).
 *
 * Corre el analizador REAL sobre un repo, pero desde una COPIA CONGELADA del
 * árbol (`scratchpad-ai5/srcA`) instrumentada en DOS puntos y en ninguno más:
 *   - `hypotheses/run.ts` — antes/después de cada `builder.build(...)`, para
 *     saber de qué hallazgo se trata y si el builder murió ANTES de llegar al
 *     motor (muerte "aguas arriba", que el motor no puede ver).
 *   - `hypotheses/engine.ts#build` — justo después de correr los `required`,
 *     para registrar CADA `required` con su `passed` (el motor los corre TODOS
 *     antes de cortar, así que se ve el resultado de todos, no sólo del primero
 *     que falla).
 *
 * Salida: un JSONL con una fila por (hallazgo, builder, spec) y el estado de
 * cada `required`. Con eso se cuenta cuántos candidatos ENTRAN a cada
 * compuerta y cuántos MUEREN en ella.
 *
 * Uso: npx tsx scripts/ai5-embudo.mts <dir-repo> <salida.json>
 */
import { writeFileSync } from "node:fs";

(globalThis as any).__AI5 = { rows: [], pass: "?", findingId: null, kind: null, builder: null, loc: null, sym: null, nloc: 0, sawEngine: false };

const { analyzeRepo } = await import("../scratchpad-ai5/srcA/server/services/code-analyzer.js");
const { stableFindingId } = await import("../scratchpad-ai5/srcA/server/services/code-finding-ids.js");

const [, , dir, out] = process.argv;
if (!dir || !out) {
  console.error("Uso: npx tsx scripts/ai5-embudo.mts <dir-repo> <salida.json>");
  process.exit(1);
}

const t0 = performance.now();
const a = await analyzeRepo({ dir, repoName: "ai5", limits: { maxFindings: "unlimited" } } as any);
const wallMs = Math.round(performance.now() - t0);

const rows = (globalThis as any).__AI5.rows as any[];

// Los hallazgos publicados, con su id estable, para poder cruzar contra las
// planillas de veredictos de nivel 1.
const findings = (a as any).findings.map((f: any) => ({
  id: f.id ?? stableFindingId(f),
  kind: f.kind,
  loc: f.locations[0] ? `${f.locations[0].file}:${f.locations[0].startLine}-${f.locations[0].endLine}` : null,
  hyp: (f.hypotheses ?? []).map((h: any) => `${h.pattern}:${h.state}`),
}));

writeFileSync(out, JSON.stringify({ dir, wallMs, rows, findings }, null, 0));
console.log(`${out}: ${rows.length} filas de embudo, ${findings.length} hallazgos, ${wallMs}ms`);
