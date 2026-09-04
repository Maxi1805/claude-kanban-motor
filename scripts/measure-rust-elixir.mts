/**
 * D3 (Ola 11b, frente A3) — corre el PIPELINE COMPLETO (`analyzeRepo`, sin
 * mocks) sobre un directorio y reporta, por lenguaje: archivos analizados,
 * nodos del grafo, aristas por tipo, hallazgos por kind y estado de hipótesis.
 *
 * Nada acá calibra ni ajusta: sólo mide lo que el mecanismo genérico produce.
 *
 * Uso: npx tsx scripts/measure-rust-elixir.mts <dir> [repoName]
 */
import path from "node:path";
import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";

const dir = process.argv[2] ?? "tests/fixtures/rust-elixir";
const repoName = process.argv[3] ?? "rust-elixir";

let graph: CodeGraph | null = null;
const analysis = await analyzeRepo({
  dir: path.resolve(dir),
  repoName,
  limits: { maxFindings: "unlimited" },
  onGraph: (r: { graph: CodeGraph }) => {
    graph = r.graph;
  },
});

const count = <T,>(items: readonly T[], key: (t: T) => string): Map<string, number> => {
  const m = new Map<string, number>();
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + 1);
  return m;
};
const show = (title: string, m: Map<string, number>): void => {
  console.log(`\n${title}`);
  if (m.size === 0) {
    console.log("  (VACIO — cero)");
    return;
  }
  for (const [k, v] of [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))) {
    console.log(`  ${k}: ${v}`);
  }
};

console.log(`=== analyzeRepo(${repoName}) sobre ${path.resolve(dir)} ===`);
console.log(`scannedFiles=${analysis.scannedFiles} analysedFiles=${analysis.analysedFiles} totalLines=${analysis.totalLines}`);
console.log(`languages=${analysis.languages.join(", ")}`);
console.log(`findingsTotal=${analysis.findingsTotal} groupsTotal=${analysis.groupsTotal}`);

/* eslint-disable @typescript-eslint/no-explicit-any */
show("archivos por lenguaje (analysis.files):", count(analysis.files as any[], (f) => f.language ?? "(sin lenguaje)"));
show("findings por kind:", new Map(Object.entries(analysis.totalByKind as Record<string, number>)));

const findings = analysis.findings as any[];
const byLang = new Map<string, number>();
const fileLang = new Map<string, string>();
for (const f of analysis.files as any[]) fileLang.set(f.path, f.language ?? "?");
console.log(`\nfileLang: ${[...fileLang.entries()].map(([k, v]) => `${k}=${v}`).join(", ")}`);
for (const f of findings) {
  const lang = fileLang.get(f.locations?.[0]?.file) ?? "(cruzado)";
  byLang.set(lang, (byLang.get(lang) ?? 0) + 1);
}
show("findings por lenguaje (archivo de la primer ubicación):", byLang);

const langOfFile = (file: string): string => fileLang.get(file) ?? path.extname(file || "") ?? "?";

const g = graph as CodeGraph | null;
if (!g) {
  console.log("\nGRAFO: null (no se construyó)");
} else {
  console.log(`\nGRAFO: nodes=${g.nodes.length} edges=${g.edges.length}`);
  show("nodos por lenguaje:", count(g.nodes as any[], (n) => langOfFile(n.file)));
  show("nodos por (lenguaje, kind/family):", count(g.nodes as any[], (n) => `${langOfFile(n.file)} / ${n.kind}${n.family ? ":" + n.family : ""}`));
  console.log("\nnodos symbol, uno por uno:");
  for (const n of (g.nodes as any[]).filter((x) => x.kind === "symbol")) {
    console.log(`  ${langOfFile(n.file)}  ${n.family}  arity=${n.arity ?? "-"} vis=${n.visibility ?? "-"}  ${n.id}`);
  }
  show("aristas por kind:", count(g.edges as any[], (e) => e.kind));
  const nodeById = new Map<string, any>((g.nodes as any[]).map((n) => [n.id, n]));
  show(
    "aristas por (kind, lenguaje del origen):",
    count(g.edges as any[], (e) => `${e.kind} / ${langOfFile(nodeById.get(e.from)?.file ?? "")}`),
  );
  show("aristas por (kind, provenance):", count(g.edges as any[], (e) => `${e.kind} / ${e.provenance ?? "?"}`));
}

// Hipótesis: estado por patrón, sobre los findings reales.
const hyp = new Map<string, number>();
for (const f of findings) {
  for (const h of (f.hypotheses ?? []) as any[]) {
    const key = `${h.pattern} :: ${h.state}`;
    hyp.set(key, (hyp.get(key) ?? 0) + 1);
  }
}
show("hipótesis (patrón :: estado):", hyp);

// Cobertura por (detector, lenguaje) — sólo las filas de los lenguajes pedidos.
const wanted = new Set((process.env.CK_LANGS ?? "rust,elixir").split(","));
const cov = (analysis.coverage ?? []) as any[];
const rows = cov.filter((r) => !r.language || wanted.has(r.language));
const statusCount = count(rows, (r) => `${r.language ?? "(inter-file)"} / ${r.status}`);
show("coverage: filas por (lenguaje, status):", statusCount);
const ran = rows.filter((r) => r.status === "corrio");
console.log(`\ncoverage: detectores con status "corrio" y hallazgos>0: ${ran.filter((r) => r.findings > 0).length} de ${ran.length}`);
for (const r of ran.filter((x) => x.findings > 0).sort((a, b) => b.findings - a.findings)) {
  console.log(`  ${r.language ?? "(inter-file)"} ${r.detectorId}: ${r.findings} hallazgos / ${r.unitsConsidered} unidades`);
}
const noAplicable = rows.filter((r) => r.status === "no-aplicable");
if (noAplicable.length) {
  console.log(`\ncoverage: "no-aplicable", fila por fila:`);
  for (const r of noAplicable) {
    console.log(`  ${(r.language ?? "(inter-file)").padEnd(8)} ${r.detectorId}: faltan [${(r.missingCapabilities ?? []).join(", ")}]`);
  }
}
console.log(`\ncoverage: detectores "corrio" con CERO hallazgos (los mudos), por lenguaje:`);
for (const lang of [...wanted]) {
  const mudos = rows.filter((r) => r.language === lang && r.status === "corrio" && r.findings === 0).map((r) => r.detectorId);
  console.log(`  ${lang} (${mudos.length}): ${mudos.sort().join(", ")}`);
}
/* eslint-enable @typescript-eslint/no-explicit-any */
