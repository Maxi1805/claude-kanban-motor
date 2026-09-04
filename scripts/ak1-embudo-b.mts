/**
 * OLA AJ, FRENTE AJ5 — EL EMBUDO COMPLETO DE `state.ts` (auditoría, no producción).
 *
 * Corre el pipeline REAL (`analyzeRepo`) sobre una COPIA CONGELADA del árbol
 * (`scratchpad-ak1/srcB`, byte a byte igual a `src/` al abrir la ola) y prende
 * la traza que el propio `state.ts` ya trae desde la Ola AI (`startStateTrace`/
 * `takeStateTrace`, costo cero cuando está apagada). No instrumenta NADA: la
 * traza ya registra, por hallazgo y por pasada, el resultado de CADA `required`
 * y el estado que `appliedState` habría decidido — también en los hallazgos que
 * NO emiten, que es exactamente lo que el volcado de producción no puede decir.
 *
 * La copia congelada existe porque corren varios frentes en paralelo sobre
 * `src/`: una medición contra un árbol que se mueve no vale.
 *
 * Uso: npx tsx scripts/aj5-embudo.mts <dir-repo> <traza.json>
 */
import { writeFileSync } from "node:fs";

const { analyzeRepo } = await import("../scratchpad-ak1/srcB/server/services/code-analyzer.js");
const { stableFindingId } = await import("../scratchpad-ak1/srcB/server/services/code-finding-ids.js");
const { startStateTrace, takeStateTrace } = await import("../scratchpad-ak1/srcB/server/services/hypotheses/state.js");

const [, , dir, out] = process.argv;
if (!dir || !out) {
  console.error("Uso: npx tsx scripts/aj5-embudo.mts <dir-repo> <traza.json>");
  process.exit(1);
}

const t0 = performance.now();
startStateTrace();
const a: any = await analyzeRepo({ dir, repoName: "ak1", limits: { maxFindings: "unlimited" } } as any);
const traza = takeStateTrace();
const wallMs = Math.round(performance.now() - t0);

const ANCLAS = new Set(["repeated-switch", "conditional-chain", "temporary-field", "type-switch"]);

// Todos los hallazgos de las 4 anclas de State, con lo que quedó PUBLICADO.
const findings = a.findings
  .filter((f: any) => ANCLAS.has(f.kind))
  .map((f: any) => ({
    id: f.id ?? stableFindingId(f),
    kind: f.kind,
    title: f.title,
    variant: f.variant ?? null,
    lang: f.language ?? null,
    locs: f.locations.map((l: any) => `${l.file}:${l.startLine}-${l.endLine}`),
    syms: f.locations.map((l: any) => l.symbol ?? ""),
    ev: (f.evidence ?? []).map((e: any) => `${e.label}=${e.value}`),
    hyp: (f.hypotheses ?? []).map((h: any) => `${h.pattern}:${h.state}`),
  }));

const porKind: Record<string, number> = {};
for (const f of a.findings) porKind[f.kind] = (porKind[f.kind] ?? 0) + 1;

writeFileSync(out, JSON.stringify({ dir, wallMs, totalHallazgos: a.findings.length, porKind, findings, traza }, null, 0));
console.log(`${out}: ${a.findings.length} hallazgos · ${findings.length} de las 4 anclas · traza ${traza.length} · ${wallMs}ms`);
