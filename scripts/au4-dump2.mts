/**
 * OLA AU - AU4 - VOLCADO INSTRUMENTADO. Igual que `au4-dump.mts` pero corre
 * sobre `scratchpad-au4/src1` (la copia con los hechos de la ola) y ademas
 * recoge las DOS trazas: `feature-envy-intra` (hechos Q/R/S) y
 * `exposed-container-traversal` (hecho U). Hace falta porque `trigger` y
 * `evidence` NO sobreviven al `Finding` final -- verificado volcando los 21
 * repos: llegan vacios.
 *
 * Uso: npx tsx scripts/au4-dump2.mts <dir-repo> <nombre> <salida.json>
 */
import { writeFileSync } from "node:fs";

const S0 = "../scratchpad-au4/src1";
const { analyzeRepo } = await import(`${S0}/server/services/code-analyzer.js`);
const { stableFindingId } = await import(`${S0}/server/services/code-finding-ids.js`);
const fei: any = await import(`${S0}/server/services/detect/intra-file/feature-envy-intra.js`);
const ect: any = await import(`${S0}/server/services/detect/intra-file/exposed-container-traversal.js`);

const ANCLAS = new Set(["feature-envy-intra", "feature-envy-inter", "inappropriate-intimacy", "exposed-container-traversal"]);

const [, , dir, nombre, out] = process.argv;
if (!dir || !nombre || !out) { console.error("Uso: npx tsx scripts/au4-dump2.mts <dir> <nombre> <salida.json>"); process.exit(1); }

fei.startFeatureEnvyIntraTrace();
ect.startExposedContainerTrace();

const t0 = performance.now();
let graph: any = null;
const a: any = await analyzeRepo({ dir, repoName: nombre, limits: { maxFindings: "unlimited" }, onGraph: (r: any) => { graph = r.graph; } } as any);
const wallMs = Math.round(performance.now() - t0);

const trazaFEI = fei.takeFeatureEnvyIntraTrace();
const trazaECT = ect.takeExposedContainerTrace();

const censo: Record<string, number> = {};
const hipotesis: any[] = [];
const anclas: any[] = [];
for (const f of a.findings) {
  censo[f.kind] = (censo[f.kind] ?? 0) + 1;
  const id = f.id ?? stableFindingId(f);
  for (const h of f.hypotheses ?? []) hipotesis.push({ id, kind: f.kind, pattern: h.pattern, state: h.state });
  if (!ANCLAS.has(f.kind)) continue;
  anclas.push({
    id, kind: f.kind, severity: f.severity, title: f.title,
    detail: f.detail.length > 1800 ? f.detail.slice(0, 1800) : f.detail,
    locations: f.locations.map((l: any) => ({ file: l.file, startLine: l.startLine, endLine: l.endLine, symbol: l.symbol ?? "", role: l.role })),
    hypotheses: (f.hypotheses ?? []).map((h: any) => ({ pattern: h.pattern, state: h.state })),
  });
}

writeFileSync(out, JSON.stringify({
  repo: nombre, dir, wallMs, totalHallazgos: a.findings.length,
  nodos: graph ? graph.nodes.length : 0, aristas: graph ? graph.edges.length : 0,
  censo, anclas, hipotesis, trazaFEI, trazaECT,
}, null, 1));
console.error(`${nombre}: ${a.findings.length} hallazgos - ${anclas.length} anclas - FEI ${trazaFEI.length} - ECT ${trazaECT.length} - ${wallMs} ms`);
