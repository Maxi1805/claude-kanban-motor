/**
 * SONDA DEL FRENTE F1 (Ola Q) — composición de `speculative-abstraction` y de
 * las aristas `satisfies` que lo alimentan, en UNA sola corrida del pipeline
 * real (`analyzeRepo` + `onGraph`).
 *
 * Para cada hallazgo del detector dice de qué arista vive (`extends`/
 * `implements`/`satisfies`) y, cuando vive de `satisfies`, si esa arista es
 * MUTUA (los dos tipos se satisfacen entre sí: conjuntos de firma IGUALES, o
 * sea ninguno es la abstracción del otro) y cuántos destinos distintos
 * satisface ese mismo origen.
 *
 * Uso: npx tsx scripts/q1-probe-spec.mts <dir> <slug> <salida.json>
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { buildSpeculativeAbstractionFindings } from "../src/server/services/detect/inter-file/speculative-abstraction.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";

const [, , dir, slug, outFile] = process.argv;
if (!dir || !slug || !outFile) {
  console.error("uso: npx tsx scripts/q1-probe-spec.mts <dir> <slug> <salida.json>");
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
const satPairs = new Set<string>();
const targetsByOrigin = new Map<string, Set<string>>();
const originsByTarget = new Map<string, Set<string>>();
for (const e of graph.edges) {
  if (e.kind !== "satisfies") continue;
  satPairs.add(`${e.from}->${e.to}`);
  let b = targetsByOrigin.get(e.from);
  if (!b) targetsByOrigin.set(e.from, (b = new Set()));
  b.add(e.to);
  let a = originsByTarget.get(e.to);
  if (!a) originsByTarget.set(e.to, (a = new Set()));
  a.add(e.from);
}

// Sin tope de volumen: `presence` = 1 implementador, igual que el detector real.
const findings = buildSpeculativeAbstractionFindings(
  graph,
  { value: 1, source: "default" } as never,
  [],
);

type Row = {
  title: string;
  target: string;
  targetFile: string;
  origin: string;
  originFile: string;
  viaSatisfiesOnly: boolean;
  mutual: boolean;
  targetsForOrigin: number;
};

const rows: Row[] = findings.map((f) => {
  const [tl, ol] = f.locations as unknown as [{ file: string; symbol?: string }, { file: string; symbol?: string }];
  // reconstruir ids: locations llevan anchor {file, symbolPath}
  const anchors = (f.locations as readonly { anchor?: { file: string; symbolPath: readonly string[] } }[]).map((l) => l.anchor);
  const tid = anchors[0] ? `sym:${anchors[0].file}#${anchors[0].symbolPath.join(".")}` : "";
  const oid = anchors[1] ? `sym:${anchors[1].file}#${anchors[1].symbolPath.join(".")}` : "";
  const viaSat = satPairs.has(`${oid}->${tid}`);
  const declared = graph.edges.some(
    (e) => (e.kind === "extends" || e.kind === "implements") && e.from === oid && e.to === tid,
  );
  return {
    title: f.title,
    target: tl.symbol ?? "?",
    targetFile: tl.file,
    origin: ol.symbol ?? "?",
    originFile: ol.file,
    viaSatisfiesOnly: viaSat && !declared,
    mutual: viaSat && satPairs.has(`${tid}->${oid}`),
    targetsForOrigin: targetsByOrigin.get(oid)?.size ?? 0,
  };
});

await fs.writeFile(
  outFile,
  JSON.stringify(
    {
      slug,
      satisfiesEdges: satPairs.size,
      findings: rows.length,
      findingsEmitidos: analysis.findings.filter((f) => f.kind === "speculative-abstraction").length,
      rows,
    },
    null,
    1,
  ),
);

const n = rows.length;
const only = rows.filter((r) => r.viaSatisfiesOnly);
const mut = only.filter((r) => r.mutual);
console.log(`${slug}: satisfies=${satPairs.size} · candidatos spec-abs=${n} · emitidos=${analysis.findings.filter((f) => f.kind === "speculative-abstraction").length}`);
console.log(`  sólo por satisfies: ${only.length} (${n ? ((100 * only.length) / n).toFixed(1) : 0}%) · de ésas MUTUAS: ${mut.length}`);
console.log(`  sólo-satisfies con origen que satisface 2+ destinos: ${only.filter((r) => r.targetsForOrigin > 1).length}`);
