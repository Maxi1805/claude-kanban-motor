/**
 * OLA AS - FRENTE AS4 - VOLCADO DE LAS NUEVE ANCLAS DE JERARQUIA Y ACOPLAMIENTO.
 *
 * Corre `analyzeRepo` sobre la COPIA CONGELADA `scratchpad-as4/src0` (el arbol real
 * se mueve: seis frentes en paralelo). Emite:
 *   1. `censo`: hallazgos por kind, y aristas por (kind x provenance x resolvedBy).
 *   2. `anclas`: el registro COMPLETO de cada hallazgo de las 9 anclas del frente,
 *      y para `dependency-cycle` ademas el INVENTARIO DE ARISTAS de cada paso
 *      dirigido del ciclo - que es lo que decide POR DONDE cortar.
 *   3. `hipotesis`: (findingId, pattern, state) de TODA hipotesis colgada -
 *      la linea base contra la que se verifica que los 19 patrones no se movieron.
 *
 * Uso: npx tsx scripts/as4-dump.mts <dir-repo> <nombre> <salida.json>
 */
import { writeFileSync } from "node:fs";

const S0 = "../scratchpad-as4/src0";
const { analyzeRepo } = await import(`${S0}/server/services/code-analyzer.js`);
const { stableFindingId } = await import(`${S0}/server/services/code-finding-ids.js`);

const ANCLAS = new Set([
  "parallel-hierarchies",
  "inheritance-family",
  "distributed-duplication",
  "demeter-chain",
  "import-depth-demeter",
  "middle-man",
  "homonymous-delegation",
  "dependency-cycle",
  "layer-skip",
  "unstable-dependency",
]);

/** Los cuatro nombres que emite este frente — `hide-delegate.ts` emite DOS. */
const MIOS = new Set(["Pull Up", "Hide Delegate", "Remove Middle Man", "Break Dependency Cycle"]);

const [, , dir, nombre, out] = process.argv;
if (!dir || !nombre || !out) {
  console.error("Uso: npx tsx scripts/as4-dump.mts <dir-repo> <nombre> <salida.json>");
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

// indice de aristas por par de ARCHIVOS
const nodeById = new Map<string, any>();
if (graph) for (const n of graph.nodes) nodeById.set(n.id, n);
const fileOf = (id: string): string | null => nodeById.get(id)?.file ?? null;

const aristasPorPar = new Map<string, any[]>();
const aristasPorKindProv: Record<string, number> = {};
if (graph) {
  for (const e of graph.edges) {
    const k = `${e.kind}/${e.provenance}/${e.resolvedBy ?? "-"}`;
    aristasPorKindProv[k] = (aristasPorKindProv[k] ?? 0) + 1;
    if (e.kind === "contains") continue;
    const fa = fileOf(e.from);
    const fb = fileOf(e.to);
    if (!fa || !fb || fa === fb) continue;
    const key = `${fa} ${fb}`;
    const b = aristasPorPar.get(key);
    if (b) b.push(e);
    else aristasPorPar.set(key, [e]);
  }
}
const resumenPar = (fa: string, fb: string) => {
  const es = aristasPorPar.get(`${fa} ${fb}`) ?? [];
  return {
    n: es.length,
    peso: es.reduce((s: number, e: any) => s + (e.weight ?? 1), 0),
    aristas: es.slice(0, 24).map((e: any) => ({
      from: e.from, to: e.to, kind: e.kind, prov: e.provenance,
      by: e.resolvedBy ?? null, w: e.weight ?? 1, roles: e.roles ?? null,
    })),
  };
};

const censo: Record<string, number> = {};
const hipotesis: any[] = [];
const anclas: any[] = [];

for (const f of a.findings) {
  censo[f.kind] = (censo[f.kind] ?? 0) + 1;
  const id = f.id ?? stableFindingId(f);
  for (const h of f.hypotheses ?? []) {
    const fila: any = { id, kind: f.kind, pattern: h.pattern, state: h.state, confidence: h.confidence ?? null };
    // AS4 - de MIS cuatro nombres se guarda la propuesta ENTERA: sin `places`/`cost`/`checks`
    // no se puede juzgar abriendo el archivo, que es la unica forma de juicio que vale.
    if (MIOS.has(h.pattern)) {
      fila.cost = h.cost ?? null;
      fila.provisional = h.provisional ?? null;
      fila.places = (h.places ?? []).map((l: any) => ({ file: l.file, startLine: l.startLine, endLine: l.endLine, symbol: l.symbol ?? "", role: l.role }));
      fila.checks = (h.checks ?? []).map((c: any) => ({ label: c.label, passed: c.passed, why: c.why, role: c.role }));
      fila.discriminadores = (h.discriminators ?? []).map((c: any) => ({ label: c.label, passed: c.passed, why: c.why }));
      fila.toConfirm = h.toConfirm ?? null;
    }
    hipotesis.push(fila);
  }
  if (!ANCLAS.has(f.kind)) continue;
  const reg: any = {
    id,
    kind: f.kind,
    variant: f.variant ?? null,
    scope: f.scope,
    language: f.language,
    severity: f.severity,
    title: f.title,
    detail: f.detail.length > 900 ? f.detail.slice(0, 900) : f.detail,
    trigger: (f.trigger ?? []).map((m: any) => ({ label: m.label, value: m.value, umbral: m.threshold?.value ?? null })),
    evidence: (f.evidence ?? []).map((e: any) => ({ label: e.label, value: e.value })),
    locations: f.locations.map((l: any) => ({ file: l.file, startLine: l.startLine, endLine: l.endLine, symbol: l.symbol ?? "", role: l.role })),
    hypotheses: (f.hypotheses ?? []).map((h: any) => ({ pattern: h.pattern, state: h.state })),
  };
  if (f.kind === "dependency-cycle") {
    const miembros = f.locations.map((l: any) => l.file);
    reg.pasos = miembros.map((m: string, i: number) => {
      const sig = miembros[(i + 1) % miembros.length];
      return { de: m, a: sig, ...resumenPar(m, sig) };
    });
  }
  anclas.push(reg);
}

writeFileSync(out, JSON.stringify({
  repo: nombre, dir, wallMs,
  totalHallazgos: a.findings.length,
  nodos: graph ? graph.nodes.length : 0,
  aristas: graph ? graph.edges.length : 0,
  aristasPorKindProv,
  censo, anclas, hipotesis,
}, null, 1));
console.error(`${nombre}: ${a.findings.length} hallazgos - ${anclas.length} en mis anclas - ${hipotesis.length} hipotesis - ${wallMs} ms`);
