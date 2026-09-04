/**
 * OLA AT - FRENTE AT5 - VOLCADO DE LAS TRES FAMILIAS DE "COMPONIENDO METODOS".
 *
 * Corre `analyzeRepo` sobre la COPIA CONGELADA `scratchpad-at5/src0` (el arbol
 * real se mueve: siete frentes en paralelo). Emite:
 *   1. `censo`: hallazgos por kind.
 *   2. `porPatron`: (patron x estado) de TODA hipotesis colgada - la linea base
 *      contra la que se verifica que los 19 patrones no se movieron.
 *   3. `mias`: la propuesta ENTERA de mis tres patrones (places/checks/cost),
 *      que es lo unico con lo que se puede juzgar abriendo el archivo.
 *   4. `embudo`: la traza de cada builder mio - donde muere cada candidato.
 *   5. `arbitraje`: la traza de `arbitrateRivalHypotheses`. Si ninguna entrada
 *      trae `discarded: true`, ninguna propuesta ajena fue retirada: es la
 *      verificacion DIRECTA de la trampa #2.
 *
 * Uso: npx tsx scripts/at5-dump.mts <dir-repo> <nombre> <salida.json>
 */
import { writeFileSync } from "node:fs";

const S0 = "../scratchpad-at5/src0";
const { analyzeRepo } = await import(`${S0}/server/services/code-analyzer.js`);
const { stableFindingId } = await import(`${S0}/server/services/code-finding-ids.js`);
const { startArbitrationTrace, takeArbitrationTrace } = await import(`${S0}/server/services/hypotheses/engine.js`);
const { startDecomposeConditionalTrace, takeDecomposeConditionalTrace } = await import(`${S0}/server/services/hypotheses/decompose-conditional.js`);
const { startExtractVariableTrace, takeExtractVariableTrace } = await import(`${S0}/server/services/hypotheses/extract-variable.js`);
const { startReplaceTempWithQueryTrace, takeReplaceTempWithQueryTrace } = await import(`${S0}/server/services/hypotheses/replace-temp-with-query.js`);

const MIOS = new Set(["Decompose Conditional", "Extract Variable", "Replace Temp with Query"]);

const [, , dir, nombre, out] = process.argv;
if (!dir || !nombre || !out) { console.error("Uso: npx tsx scripts/at5-dump.mts <dir-repo> <nombre> <salida.json>"); process.exit(1); }

startArbitrationTrace();
startDecomposeConditionalTrace();
startExtractVariableTrace();
startReplaceTempWithQueryTrace();

const t0 = performance.now();
const a: any = await analyzeRepo({ dir, repoName: nombre, limits: { maxFindings: "unlimited" } } as any);
const wallMs = Math.round(performance.now() - t0);

const censo: Record<string, number> = {};
const porPatron: Record<string, Record<string, number>> = {};
const mias: any[] = [];

for (const f of a.findings) {
  censo[f.kind] = (censo[f.kind] ?? 0) + 1;
  const id = f.id ?? stableFindingId(f);
  for (const h of f.hypotheses ?? []) {
    const p = (porPatron[h.pattern] ??= {});
    p[h.state] = (p[h.state] ?? 0) + 1;
    if (!MIOS.has(h.pattern)) continue;
    mias.push({
      id, kind: f.kind, lang: f.language ?? ((f.locations?.[0]?.file ?? "").split(".").pop() ?? "?"), pattern: h.pattern, state: h.state,
      confidence: h.confidence ?? null, provisional: h.provisional ?? null, cost: h.cost ?? null,
      places: (h.places ?? []).map((l: any) => ({ file: l.file, startLine: l.startLine, endLine: l.endLine, symbol: l.symbol ?? "", role: l.role })),
      checks: (h.checks ?? []).map((c: any) => ({ label: c.label, passed: c.passed, why: c.why, role: c.role })),
      discriminadores: (h.discriminators ?? []).map((c: any) => ({ label: c.label, passed: c.passed, why: c.why })),
      toConfirm: h.toConfirm ?? null,
    });
  }
}

const arbitraje = takeArbitrationTrace();
const descartes = arbitraje.filter((e: any) => e.hypotheses.some((h: any) => h.discarded));

const embudo = {
  dc: takeDecomposeConditionalTrace(),
  ev: takeExtractVariableTrace(),
  rtq: takeReplaceTempWithQueryTrace(),
};
const resumenEmbudo = (t: readonly any[]) => {
  const r: Record<string, number> = { total: t.length, emitidas: 0 };
  for (const e of t) { if (e.emitted) r.emitidas++; const d = e.diesAt ?? "-"; r[`muere:${d}`] = (r[`muere:${d}`] ?? 0) + 1; }
  return r;
};

writeFileSync(out, JSON.stringify({
  repo: nombre, dir, wallMs,
  totalHallazgos: a.findings.length,
  censo, porPatron,
  arbitrajeEntradas: arbitraje.length,
  arbitrajeDescartes: descartes.length,
  descartes: descartes.slice(0, 40),
  embudoResumen: { dc: resumenEmbudo(embudo.dc), ev: resumenEmbudo(embudo.ev), rtq: resumenEmbudo(embudo.rtq) },
  mias,
  embudoDC: embudo.dc,
}, null, 1));
console.error(`${nombre}: ${a.findings.length} hallazgos | mias=${mias.length} (DC=${mias.filter((m) => m.pattern === "Decompose Conditional").length} EV=${mias.filter((m) => m.pattern === "Extract Variable").length} RTQ=${mias.filter((m) => m.pattern === "Replace Temp with Query").length}) | arbitraje descartes=${descartes.length} | ${wallMs} ms`);
