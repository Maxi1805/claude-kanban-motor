/**
 * OLA AU - GUARDIAN - volcado minimo, standard-shape, sobre el arbol REAL consolidado
 * (no una copia congelada: esta corrida ES la verificacion de que lo consolidado
 * funciona). Produce el mismo esquema `DumpedFinding` que `w-int-censo-nivel2.mts`
 * espera ({id, kind, where, hypotheses:[{pattern,state,at?}]}), para poder correr
 * el instrumento oficial de nivel 2 (`v-int-precision-nivel2.mts`) sin adaptarlo.
 *
 * Objetivo puntual (tarea 6 del encargo del guardian): probar que las hipotesis y
 * el detector nuevos NO SON INERTES en el arbol consolidado, con un caso real.
 *
 * Uso: npx tsx scripts/guardian-au-dump.mts <dir-repo> <salida.json>
 */
import { writeFileSync } from "node:fs";

const { analyzeRepo } = await import("../src/server/services/code-analyzer.js");
const { stableFindingId } = await import("../src/server/services/code-finding-ids.js");

const [, , dir, out] = process.argv;
if (!dir || !out) {
  console.error("Uso: npx tsx scripts/guardian-au-dump.mts <dir-repo> <salida.json>");
  process.exit(1);
}

const t0 = performance.now();
const a: any = await analyzeRepo({ dir, repoName: "guardian-au", limits: { maxFindings: "unlimited" } });
const wallMs = Math.round(performance.now() - t0);

const findings = a.findings.map((f: any) => {
  const id = f.id ?? stableFindingId(f);
  const where = (f.locations ?? []).map((p: any) => `${p.file}:${p.startLine}`);
  const hypotheses = (f.hypotheses ?? []).map((h: any) => ({ pattern: h.pattern, state: h.state }));
  return { id, kind: f.kind, where: where.length ? where : ["?:0"], hypotheses };
});

const censo: Record<string, number> = {};
for (const f of a.findings) censo[f.kind] = (censo[f.kind] ?? 0) + 1;

writeFileSync(out, JSON.stringify({ dir, wallMs, total: a.findings.length, censo, findings }, null, 1));
console.log(`${a.findings.length} hallazgos, ${findings.reduce((n: number, f: any) => n + f.hypotheses.length, 0)} hipotesis -> ${out} (${wallMs} ms)`);
