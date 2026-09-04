/**
 * OLA AU - FRENTE AU4 - VOLCADO DE LAS CUATRO ANCLAS DE ACOPLAMIENTO.
 *
 * Corre `analyzeRepo` sobre la COPIA CONGELADA `scratchpad-au4/src0`.
 * Emite censo por kind, el registro completo de mis 4 anclas, y (findingId,
 * pattern, state) de TODA hipotesis colgada -- la linea base para verificar
 * que los 19 patrones no se movieron.
 *
 * Uso: npx tsx scripts/au4-dump.mts <dir-repo> <nombre> <salida.json>
 */
import { writeFileSync } from "node:fs";

const S0 = "../scratchpad-au4/src0";
const { analyzeRepo } = await import(`${S0}/server/services/code-analyzer.js`);
const { stableFindingId } = await import(`${S0}/server/services/code-finding-ids.js`);

const ANCLAS = new Set(["feature-envy-intra", "feature-envy-inter", "inappropriate-intimacy", "exposed-container-traversal"]);

const [, , dir, nombre, out] = process.argv;
if (!dir || !nombre || !out) {
  console.error("Uso: npx tsx scripts/au4-dump.mts <dir-repo> <nombre> <salida.json>");
  process.exit(1);
}

const t0 = performance.now();
let graph: any = null;
const a: any = await analyzeRepo({
  dir,
  repoName: nombre,
  limits: { maxFindings: "unlimited" },
  onGraph: (r: any) => { graph = r.graph; },
} as any);
const wallMs = Math.round(performance.now() - t0);

const censo: Record<string, number> = {};
const hipotesis: any[] = [];
const anclas: any[] = [];

for (const f of a.findings) {
  censo[f.kind] = (censo[f.kind] ?? 0) + 1;
  const id = f.id ?? stableFindingId(f);
  for (const h of f.hypotheses ?? []) {
    hipotesis.push({ id, kind: f.kind, pattern: h.pattern, state: h.state });
  }
  if (!ANCLAS.has(f.kind)) continue;
  anclas.push({
    id,
    kind: f.kind,
    scope: f.scope,
    language: f.language,
    severity: f.severity,
    title: f.title,
    detail: f.detail.length > 1500 ? f.detail.slice(0, 1500) : f.detail,
    trigger: (f.trigger ?? []).map((m: any) => ({ label: m.label, value: m.value, umbral: m.threshold?.value ?? null })),
    evidence: (f.evidence ?? []).map((e: any) => ({ label: e.label, value: e.value })),
    locations: f.locations.map((l: any) => ({ file: l.file, startLine: l.startLine, endLine: l.endLine, symbol: l.symbol ?? "", role: l.role })),
    hypotheses: (f.hypotheses ?? []).map((h: any) => ({ pattern: h.pattern, state: h.state })),
  });
}

writeFileSync(out, JSON.stringify({
  repo: nombre, dir, wallMs,
  totalHallazgos: a.findings.length,
  nodos: graph ? graph.nodes.length : 0,
  aristas: graph ? graph.edges.length : 0,
  censo, anclas, hipotesis,
}, null, 1));
console.error(`${nombre}: ${a.findings.length} hallazgos - ${anclas.length} en mis anclas - ${hipotesis.length} hipotesis - ${wallMs} ms`);
