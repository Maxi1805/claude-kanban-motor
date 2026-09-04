/**
 * OLA AN, FRENTE AN2 — LA PRUEBA EMPÍRICA DEL MECANISMO (auditoría, no producción).
 *
 * Corre el pipeline REAL (`analyzeRepo`) sobre la copia congelada `scratchpad-an2/srcB`
 * (= `src0` del día + SÓLO `hypotheses/state.ts` encima; verificado por md5 sobre los 420 .ts)
 * y prende la traza de `state.ts`. La traza trae desde esta ola tres campos nuevos
 * —`n2OfKind`/`n2InFile`/`n2AtSymbol`— que cuentan los hallazgos de NIVEL 2
 * (`long-function`/`complexity`/`primitive-obsession`) que el VECINDARIO de cada hallazgo-ancla
 * de State ve, POR PASADA. Es la respuesta MEDIDA a la pregunta de mecanismo del encargo:
 * ¿el hecho de nivel 2 está disponible donde la hipótesis de State se evalúa?
 *
 * Uso: npx tsx scripts/an2-embudo.mts <dir-repo> <traza.json>
 */
import { writeFileSync } from "node:fs";

const { analyzeRepo } = await import("../scratchpad-an2/srcB/server/services/code-analyzer.js");
const { stableFindingId } = await import("../scratchpad-an2/srcB/server/services/code-finding-ids.js");
const { startStateTrace, takeStateTrace } = await import("../scratchpad-an2/srcB/server/services/hypotheses/state.js");

const [, , dir, out] = process.argv;
if (!dir || !out) {
  console.error("Uso: npx tsx scripts/an2-embudo.mts <dir-repo> <traza.json>");
  process.exit(1);
}

const t0 = performance.now();
startStateTrace();
const a: any = await analyzeRepo({ dir, repoName: "an2", limits: { maxFindings: "unlimited" } } as any);
const traza = takeStateTrace();
const wallMs = Math.round(performance.now() - t0);

const ANCLAS = new Set(["repeated-switch", "conditional-chain", "temporary-field", "type-switch"]);
const N2 = new Set(["long-function", "complexity", "primitive-obsession"]);

const findings = a.findings
  .filter((f: any) => ANCLAS.has(f.kind))
  .map((f: any) => ({
    id: f.id ?? stableFindingId(f),
    kind: f.kind,
    title: f.title,
    lang: f.language ?? null,
    locs: f.locations.map((l: any) => `${l.file}:${l.startLine}-${l.endLine}`),
    syms: f.locations.map((l: any) => l.symbol ?? ""),
    hyp: (f.hypotheses ?? []).map((h: any) => `${h.pattern}:${h.state}`),
  }));

// Los hallazgos de NIVEL 2, con su ubicación, para poder cruzar por archivo/símbolo fuera de acá.
const nivel2 = a.findings
  .filter((f: any) => N2.has(f.kind))
  .map((f: any) => ({
    id: f.id ?? stableFindingId(f),
    kind: f.kind,
    locs: f.locations.map((l: any) => `${l.file}:${l.startLine}-${l.endLine}`),
    syms: f.locations.map((l: any) => l.symbol ?? ""),
    hyp: (f.hypotheses ?? []).map((h: any) => `${h.pattern}:${h.state}`),
  }));

const porKind: Record<string, number> = {};
for (const f of a.findings) porKind[f.kind] = (porKind[f.kind] ?? 0) + 1;

writeFileSync(out, JSON.stringify({ dir, wallMs, totalHallazgos: a.findings.length, porKind, findings, nivel2, traza }, null, 0));
console.log(`${out}: ${a.findings.length} hallazgos · ${findings.length} de las 4 anclas · nivel2 ${nivel2.length} · traza ${traza.length} · ${wallMs}ms`);
