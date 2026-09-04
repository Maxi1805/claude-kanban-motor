/**
 * OLA AT - FRENTE AT3 - VOLCADO DE LAS CUATRO ANCLAS DE ABSTRACCION Y JERARQUIA.
 *
 * Corre `analyzeRepo` sobre la COPIA CONGELADA `scratchpad-at3/src0` (el arbol real
 * se mueve: siete frentes en paralelo). Emite:
 *   1. `censo`: hallazgos por kind.
 *   2. `anclas`: el registro COMPLETO de cada hallazgo de las 4 anclas del frente.
 *   3. `hipotesis`: (findingId, pattern, state) de TODA hipotesis colgada - la linea
 *      base contra la que se verifica que los 19 patrones no se movieron. De MIS dos
 *      nombres se guarda la propuesta ENTERA (sin `places`/`cost`/`checks` no se puede
 *      juzgar abriendo el archivo, que es la unica forma de juicio que vale).
 *   4. `embudo`: la traza de donde muere cada candidato, por `required`.
 *
 * Uso: npx tsx scripts/at3-dump.mts <dir-repo> <nombre> <salida.json>
 */
import { writeFileSync } from "node:fs";

const S0 = "../scratchpad-at3/src0";
const { analyzeRepo } = await import(`${S0}/server/services/code-analyzer.js`);
const { stableFindingId } = await import(`${S0}/server/services/code-finding-ids.js`);
const ch: any = await import(`${S0}/server/services/hypotheses/collapse-hierarchy.js`);
const ei: any = await import(`${S0}/server/services/hypotheses/extract-interface.js`);

const ANCLAS = new Set(["speculative-abstraction", "concrete-over-abstraction", "coupling-without-abstraction", "middle-man"]);
const MIOS = new Set(["Collapse Hierarchy", "Extract Interface"]);

const [, , dir, nombre, out] = process.argv;
if (!dir || !nombre || !out) {
  console.error("Uso: npx tsx scripts/at3-dump.mts <dir-repo> <nombre> <salida.json>");
  process.exit(1);
}

ch.startCollapseHierarchyTrace();
ei.startExtractInterfaceTrace();

const t0 = performance.now();
let graph: any = null;
const a: any = await analyzeRepo({
  dir,
  repoName: nombre,
  limits: { maxFindings: "unlimited" },
  onGraph: (r: any) => { graph = r.graph; },
} as any);
const wallMs = Math.round(performance.now() - t0);

const embudoCH = ch.takeCollapseHierarchyTrace();
const embudoEI = ei.takeExtractInterfaceTrace();

const censo: Record<string, number> = {};
const hipotesis: any[] = [];
const anclas: any[] = [];

for (const f of a.findings) {
  censo[f.kind] = (censo[f.kind] ?? 0) + 1;
  const id = f.id ?? stableFindingId(f);
  for (const h of f.hypotheses ?? []) {
    const fila: any = { id, kind: f.kind, pattern: h.pattern, state: h.state, confidence: h.confidence ?? null };
    if (MIOS.has(h.pattern)) {
      fila.cost = h.cost ?? null;
      fila.provisional = h.provisional ?? null;
      fila.lang = f.language ?? null;
      fila.places = (h.places ?? []).map((l: any) => ({ file: l.file, startLine: l.startLine, endLine: l.endLine, symbol: l.symbol ?? "", role: l.role }));
      fila.checks = (h.checks ?? []).map((c: any) => ({ label: c.label, passed: c.passed, why: c.why, role: c.role }));
      fila.discriminadores = (h.discriminators ?? []).map((c: any) => ({ label: c.label, passed: c.passed, why: c.why }));
      fila.toConfirm = h.toConfirm ?? null;
    }
    hipotesis.push(fila);
  }
  if (!ANCLAS.has(f.kind)) continue;
  anclas.push({
    id,
    kind: f.kind,
    scope: f.scope,
    language: f.language,
    severity: f.severity,
    title: f.title,
    detail: f.detail.length > 1200 ? f.detail.slice(0, 1200) : f.detail,
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
  embudoCH, embudoEI,
}, null, 1));
console.error(`${nombre}: ${a.findings.length} hallazgos - ${anclas.length} en mis anclas - ${hipotesis.length} hipotesis - CH ${embudoCH.length} cand - EI ${embudoEI.length} cand - ${wallMs} ms`);
