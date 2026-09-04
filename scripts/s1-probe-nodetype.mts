/**
 * SONDA DEL FRENTE S1 (Ola S) — ¿de qué FORMA GRAMATICAL es el "único
 * implementador" de cada candidato de `speculative-abstraction`?
 *
 * Vuelca, por candidato (SIN tope de volumen, igual que `q1-probe-spec.mts`),
 * el `nodeType` verbatim del origen y del destino más de qué aristas vive la
 * relación. Un volcado SE VENCE: sirve para aislar un DELTA, nunca para
 * publicar un absoluto (CONTEXTO.md §3).
 *
 * Uso: npx tsx scripts/s1-probe-nodetype.mts <dir> <slug> <salida.json>
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { buildSpeculativeAbstractionFindings } from "../src/server/services/detect/inter-file/speculative-abstraction.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";

const [, , dir, slug, outFile] = process.argv;
if (!dir || !slug || !outFile) {
  console.error("uso: npx tsx scripts/s1-probe-nodetype.mts <dir> <slug> <salida.json>");
  process.exit(1);
}

const state: { graph: CodeGraph | null } = { graph: null };
const analysis = await analyzeRepo({
  dir: path.resolve(dir),
  repoName: slug,
  limits: { maxFindings: "unlimited" },
  onGraph: (r) => {
    state.graph = r.graph;
  },
});

const graph = state.graph;
if (!graph) {
  console.error("sin grafo");
  process.exit(1);
}

const nodeById = new Map(graph.nodes.map((n) => [n.id, n] as const));

const findings = buildSpeculativeAbstractionFindings(graph, { value: 1, source: "default" } as never, []);

type Row = {
  title: string;
  targetId: string;
  originId: string;
  targetNodeType: string | null;
  originNodeType: string | null;
  kinds: string[];
};

const rows: Row[] = findings.map((f) => {
  const anchors = (f.locations as readonly { anchor?: { file: string; symbolPath: readonly string[] } }[]).map((l) => l.anchor);
  const tid = anchors[0] ? `sym:${anchors[0].file}#${anchors[0].symbolPath.join(".")}` : "";
  const oid = anchors[1] ? `sym:${anchors[1].file}#${anchors[1].symbolPath.join(".")}` : "";
  const kinds = graph.edges.filter((e) => e.from === oid && e.to === tid).map((e) => e.kind);
  return {
    title: f.title,
    targetId: tid,
    originId: oid,
    targetNodeType: nodeById.get(tid)?.shapeNodeType ?? nodeById.get(tid)?.nodeType ?? null,
    originNodeType: nodeById.get(oid)?.shapeNodeType ?? nodeById.get(oid)?.nodeType ?? null,
    kinds: [...new Set(kinds)],
  };
});

const porOrigen = new Map<string, number>();
for (const r of rows) porOrigen.set(r.originNodeType ?? "?", (porOrigen.get(r.originNodeType ?? "?") ?? 0) + 1);
const porPar = new Map<string, number>();
for (const r of rows) {
  const k = `${r.targetNodeType ?? "?"} <- ${r.originNodeType ?? "?"}`;
  porPar.set(k, (porPar.get(k) ?? 0) + 1);
}

await fs.writeFile(
  outFile,
  JSON.stringify(
    {
      slug,
      generatedAt: new Date().toISOString(),
      nodos: graph.nodes.length,
      aristas: graph.edges.length,
      candidatos: rows.length,
      emitidos: analysis.findings.filter((f) => f.kind === "speculative-abstraction").length,
      porOrigen: Object.fromEntries([...porOrigen].sort((a, b) => b[1] - a[1])),
      porPar: Object.fromEntries([...porPar].sort((a, b) => b[1] - a[1])),
      rows,
    },
    null,
    1,
  ),
);

console.log(`${slug}: candidatos=${rows.length} emitidos=${analysis.findings.filter((f) => f.kind === "speculative-abstraction").length}`);
for (const [k, v] of [...porPar].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
