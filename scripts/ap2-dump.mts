/**
 * OLA AP · FRENTE AP2 — VOLCADO PROPIO PARA LA PREGUNTA DEL SILENCIO.
 *
 * Corre `analyzeRepo` sobre la COPIA CONGELADA `scratchpad-ap2/src0` (byte a byte
 * igual a `src/` a las 12:14:28 del 26-08) porque corren seis frentes en paralelo
 * sobre `src/` y una medicion contra un arbol que se mueve no vale.
 *
 * Emite DOS cosas por repo:
 *   1. `findings`: la forma estandar (id, kind, where, symbols, hypotheses) para
 *      TODOS los hallazgos — con eso se re-cuenta el silencio y el volumen de nivel 1.
 *   2. `ricos`: el registro COMPLETO de cada hallazgo cuyo `id` esta en el conjunto
 *      de foco (los ids con veredicto `verdadero` en las planillas de nivel 1), con
 *      todo lo que el analizador YA sabe: trigger/evidence/detail/advice/severity/
 *      locations-con-rol + hechos de grafo (grado del nodo del hallazgo, aristas
 *      salientes/entrantes por kind del simbolo afectado) + vecindario (hallazgos en
 *      el mismo simbolo y en el mismo archivo, por kind).
 *
 * El conjunto de foco se conoce ANTES de correr (sale de las planillas CSV), asi
 * que no hace falta una segunda corrida pesada.
 *
 * Uso: npx tsx scripts/ap2-dump.mts <dir-repo> <foco.json> <salida.json>
 */
import { readFileSync, writeFileSync } from "node:fs";

const S0 = "../scratchpad-ap2/src0";
const { analyzeRepo } = await import(`${S0}/server/services/code-analyzer.js`);
const { stableFindingId } = await import(`${S0}/server/services/code-finding-ids.js`);
const { direccionesDeFila } = await import(`${S0}/server/services/detect/precision/direccion-hipotesis.js`);
const { attachFindingNodes } = await import(`${S0}/server/services/graph/finding-nodes.js`);
const { buildNeighborhoodIndex, neighborhoodFor } = await import(`${S0}/server/services/graph/neighborhood.js`);
const { deriveAnchor } = await import(`${S0}/server/services/detect/ids.js`);
const { anchorNodeId } = await import(`${S0}/server/services/graph/types.js`);

const [, , dir, focoFile, out] = process.argv;
if (!dir || !focoFile || !out) {
  console.error("Uso: npx tsx scripts/ap2-dump.mts <dir-repo> <foco.json> <salida.json>");
  process.exit(1);
}
const foco: Set<string> = new Set(JSON.parse(readFileSync(focoFile, "utf8")));

const t0 = performance.now();
let graph: any = null;
const a: any = await analyzeRepo({
  dir,
  repoName: "ap2",
  limits: { maxFindings: "unlimited" },
  onGraph: (r: any) => { graph = r.graph; },
} as any);
const wallMs = Math.round(performance.now() - t0);

const findings = a.findings.map((f: any) => {
  const hs = f.hypotheses ?? [];
  const at = direccionesDeFila(hs, f.locations[0]);
  return {
    id: f.id ?? stableFindingId(f),
    kind: f.kind,
    title: f.title,
    where: f.locations.map((l: any) => `${l.file}:${l.startLine}`),
    symbols: f.locations.map((l: any) => l.symbol ?? ""),
    hypotheses: hs.map((h: any, i: number) => ({ pattern: h.pattern, state: h.state, at: at[i] ?? "" })),
  };
});

// ── hechos de grafo y vecindario, SOLO para el conjunto de foco ────────────────
const graphForHyp = graph ? attachFindingNodes(graph, a.findings) : null;
const index = buildNeighborhoodIndex(graphForHyp, a.findings, null);

const nodeById = new Map<string, any>();
if (graphForHyp) for (const n of graphForHyp.nodes) nodeById.set(n.id, n);
const outBy = new Map<string, any[]>();
const inBy = new Map<string, any[]>();
if (graphForHyp) {
  for (const e of graphForHyp.edges) {
    if (!outBy.has(e.from)) outBy.set(e.from, []);
    outBy.get(e.from)!.push(e);
    if (!inBy.has(e.to)) inBy.set(e.to, []);
    inBy.get(e.to)!.push(e);
  }
}
const cuenta = (xs: any[], k: (x: any) => string) => {
  const m: Record<string, number> = {};
  for (const x of xs) m[k(x)] = (m[k(x)] ?? 0) + 1;
  return m;
};

const ricos: any[] = [];
for (const f of a.findings) {
  const id = f.id ?? stableFindingId(f);
  if (!foco.has(id)) continue;
  const hs = f.hypotheses ?? [];
  const at = direccionesDeFila(hs, f.locations[0]);
  const nb = index ? neighborhoodFor(index, f) : null;
  // el nodo del SIMBOLO afectado por la primera location
  let simNodeId: string | null = null;
  let simGrado: any = null;
  let ego: any = null;
  let anc: any = null;
  try { anc = deriveAnchor(f.locations[0]); } catch { /* nada */ }
  if (anc) {
    const sid = anchorNodeId(anc);
    simNodeId = nodeById.has(sid) ? sid : null;
    if (simNodeId) {
      simGrado = {
        salientes: cuenta(outBy.get(sid) ?? [], (e: any) => e.kind),
        entrantes: cuenta(inBy.get(sid) ?? [], (e: any) => e.kind),
        gradoOut: (outBy.get(sid) ?? []).length,
        gradoIn: (inBy.get(sid) ?? []).length,
      };
    }
    try {
      if (nb) {
        const e = nb.ego(anc, 1);
        if (e) ego = { degreeIn: e.degreeIn, degreeOut: e.degreeOut, nodos: e.nodes.length, truncated: e.truncated, vecinosPorKind: cuenta(e.nodes.map((x: any) => x.node), (n: any) => n.kind) };
      }
    } catch { /* nada */ }
  }
  let vecinos: any = null;
  try {
    if (nb && anc) {
      const enSimbolo = nb.findingsAtSymbol(anc) ?? [];
      const enArchivo = nb.findingsInFile(f.locations[0].file) ?? [];
      vecinos = {
        enSimbolo: cuenta(enSimbolo as any[], (x: any) => x.kind),
        enSimboloN: (enSimbolo as any[]).length,
        enArchivo: cuenta(enArchivo as any[], (x: any) => x.kind),
        enArchivoN: (enArchivo as any[]).length,
      };
    }
  } catch { /* nada */ }

  ricos.push({
    id,
    kind: f.kind,
    variant: f.variant ?? null,
    detectorId: f.detectorId,
    scope: f.scope,
    language: f.language,
    severity: f.severity,
    title: f.title,
    detail: f.detail,
    trigger: (f.trigger ?? []).map((m: any) => ({ label: m.label, value: m.value, umbral: m.threshold?.value ?? null, fuente: m.threshold?.source ?? null })),
    evidence: (f.evidence ?? []).map((e: any) => ({ label: e.label, value: e.value, note: e.note ?? null })),
    locations: f.locations.map((l: any) => ({ file: l.file, startLine: l.startLine, endLine: l.endLine, symbol: l.symbol ?? "", role: l.role })),
    advice: f.advice ? { primary: f.advice.primary ?? null, kind: f.advice.kind ?? null, pattern: f.advice.pattern ?? null, caveat: f.advice.caveat ?? null, detail: f.advice.detail ?? null } : null,
    hypotheses: hs.map((h: any, i: number) => ({ pattern: h.pattern, state: h.state, at: at[i] ?? "", rationale: h.rationale ?? null })),
    ancla: anc ? { file: anc.file, symbolPath: anc.symbolPath ?? [], ordinal: anc.ordinal ?? null } : null,
    grafo: { simNodeId, simGrado, ego },
    vecinos,
  });
}

writeFileSync(out, JSON.stringify({
  dir, wallMs,
  totalHallazgos: a.findings.length,
  nodos: graph ? graph.nodes.length : 0,
  aristas: graph ? graph.edges.length : 0,
  findings, ricos,
}, null, 1));
console.error(`${dir}: ${a.findings.length} hallazgos · ${ricos.length} ricos · ${wallMs} ms`);
