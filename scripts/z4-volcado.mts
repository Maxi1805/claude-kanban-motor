/**
 * SONDA DEL FRENTE Z4 (Ola Z) — VOLCADO ÚNICO para las TRES sondas de medición.
 *
 * Z4 es de SOLO MEDICIÓN: no toca `src/`. Este script corre `analyzeRepo` UNA
 * vez por repo y deja en disco, compacto, exactamente los hechos que las tres
 * sondas necesitan — para no re-pagar el análisis por variante de cálculo (el
 * mismo motivo por el que existen `p8-dump-grafo.mts` y `q1-dump-grafo.mts`).
 *
 * QUÉ GUARDA Y PARA QUÉ:
 *   (a) TIPO DEL RECEPTOR — `refs` (`ReferenceFacts` con rol `receiver-member`,
 *       o sea `x.m()`), `carriers` (nodos `carrier` con `declaredTypeForm`) y
 *       las aristas `declares-type`. Con eso se contesta, sin volver a parsear:
 *       "¿el tipo del receptor está ESCRITO y resuelve a un nodo del repo?".
 *   (b) IMPORT INTERNO — `imports` (los especificadores CRUDOS por archivo, tal
 *       como los escribió el programa) + la lista completa de rutas del repo, y
 *       los `EdgeFacts` de `implements`/`extends` sin resolver.
 *   (c) SUPERFICIE PÚBLICA — las aristas `imports` archivo→archivo del grafo, y
 *       `exported` por nodo.
 *
 * UN VOLCADO SE VENCE: lleva `generatedAt`. Sirve para un delta de diseño,
 * nunca para publicar un absoluto de cierre.
 *
 * Uso: npx tsx scripts/z4-volcado.mts <dir> <slug> <salida.json>
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { analyzeRepo, type FileFacts } from "../src/server/services/code-analyzer.js";
import { stableFindingId } from "../src/server/services/code-finding-ids.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";

const [, , dir, slug, outFile] = process.argv;
if (!dir || !slug || !outFile) {
  console.error("uso: npx tsx scripts/z4-volcado.mts <dir> <slug> <salida.json>");
  process.exit(1);
}

/** Los tres kinds cuyos hallazgos las sondas miden, más los que sirven de control. */
const KINDS_DE_INTERES = new Set([
  "concrete-over-abstraction",
  "feature-envy-intra",
  "speculative-abstraction",
  "coupling-without-abstraction",
  "scattered-instantiation",
]);

const state: { facts: readonly FileFacts[]; graph: CodeGraph | null } = { facts: [], graph: null };
/**
 * LA POBLACIÓN REAL, ANTES DEL TOPE DE ALMACENAMIENTO. `analysis.findings`
 * viene recortado por `MAX_STORED_FINDINGS` (5.000 grupos) incluso con
 * `maxFindings: "unlimited"`, y el propio docstring de esa constante mide que
 * guava ya lo supera (5.143 grupos). Sin este side-channel, el censo de guava
 * mediría una muestra truncada — exactamente el error que `census.ts` existe
 * para no cometer.
 */
let preCap: readonly { readonly kind: string }[] = [];

const t0 = performance.now();
const analysis = await analyzeRepo({
  dir: path.resolve(dir),
  repoName: slug,
  limits: { maxFindings: "unlimited" },
  onFacts: (f) => {
    state.facts = f;
  },
  onGraph: (r) => {
    state.graph = r.graph;
  },
  onPreCapFindings: (fs) => {
    preCap = fs.map((f) => ({ kind: f.kind }));
  },
});
const wallMs = Math.round(performance.now() - t0);

const g = state.graph;
if (!g) {
  console.error(`${slug}: SIN GRAFO — el volcado sería inútil.`);
  process.exit(1);
}

/* ── volumen por kind, sobre los hallazgos reales de esta corrida ─────────── */
const porKind: Record<string, number> = {};
for (const f of analysis.findings) porKind[f.kind] = (porKind[f.kind] ?? 0) + 1;
const porKindPreCap: Record<string, number> = {};
for (const f of preCap) porKindPreCap[f.kind] = (porKindPreCap[f.kind] ?? 0) + 1;

const findings = analysis.findings
  .filter((f) => KINDS_DE_INTERES.has(f.kind))
  .map((f) => ({
    id: f.id ?? stableFindingId(f),
    k: f.kind,
    t: f.title,
    d: f.detail,
    sv: f.severity,
    l: f.locations.map((l) => ({ f: l.file, s: l.startLine, e: l.endLine, y: l.symbol ?? null, r: (l as { role?: string }).role ?? null })),
  }));

/* ── (a) sitios `x.m()`: rol `receiver-member`, con su calificador ────────── */
const refs: { f: string; n: string; q: string; sc: string[]; ln: number; cal: boolean; sh: boolean }[] = [];
/* ── (b) especificadores de import CRUDOS + los EdgeFacts nominales ───────── */
const imports: { f: string; s: string; ln: number }[] = [];
const nominales: { f: string; k: string; from: string[]; n: string; q: string[]; ln: number }[] = [];

for (const ff of state.facts) {
  for (const r of ff.references) {
    if (r.role !== "receiver-member") continue;
    refs.push({
      f: ff.path,
      n: r.name,
      q: r.qualifier ?? "",
      sc: [...r.scope],
      ln: r.line,
      cal: r.isCallee === true,
      sh: r.shadowedLocally,
    });
  }
  for (const ef of ff.edges) {
    if (ef.kind === "imports") imports.push({ f: ff.path, s: ef.toName, ln: ef.startLine });
    else if (ef.kind === "implements" || ef.kind === "extends" || ef.kind === "instantiates")
      nominales.push({ f: ff.path, k: ef.kind, from: [...ef.fromPath], n: ef.toName, q: [...ef.toQualifier], ln: ef.startLine });
  }
}

/* ── nodos y aristas del grafo, sólo los campos que las sondas leen ───────── */
const nodes = g.nodes.map((n) => ({
  i: n.id,
  k: n.kind,
  f: n.file,
  p: n.symbolPath,
  m: n.family ?? null,
  nt: n.nodeType ?? null,
  sn: n.shapeNodeType ?? null,
  x: n.exported ?? null,
  cf: n.carrierForm ?? null,
  dtf: n.declaredTypeForm ?? null,
  dtp: n.declaredTypeProvenance ?? null,
  s: n.startLine ?? null,
  e: n.endLine ?? null,
}));

const KINDS_ARISTA = new Set(["declares-type", "imports", "implements", "extends", "satisfies", "references", "calls", "instantiates", "contains", "stores"]);
const edges = g.edges
  .filter((e) => KINDS_ARISTA.has(e.kind))
  .map((e) => ({ f: e.from, t: e.to, k: e.kind, p: e.provenance, w: e.weight, r: e.roles ?? null, a: e.alternatives ?? null }));

writeFileSync(
  outFile,
  JSON.stringify({
    slug,
    dir,
    generatedAt: new Date().toISOString(),
    wallMs,
    porKind,
    porKindPreCap,
    files: analysis.files.map((f) => ({ p: f.path, l: f.language, n: f.lines })),
    findings,
    refs,
    imports,
    nominales,
    nodes,
    edges,
  }),
);
console.log(
  `${slug}: ${analysis.findings.length} hallazgos · ${refs.length} sitios receptor · ${imports.length} imports crudos · ${nodes.length} nodos · ${edges.length} aristas · ${wallMs}ms → ${outFile}`,
);
