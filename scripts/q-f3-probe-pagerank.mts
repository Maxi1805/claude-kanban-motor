/**
 * Sonda del frente F3 (Ola Q) — CUÁNTO le cambia a la proyección de métricas
 * que la lista "todas menos `contains`" pase de SIETE kinds enumerados a mano
 * al catálogo derivado.
 *
 * Mide el DELTA sobre el MISMO grafo (la huella se imprime), nunca un
 * absoluto: cuántas aristas entran a la proyección `file` con la lista vieja y
 * cuántas con la nueva, y cuántos pares (archivo→archivo) aparecen que antes
 * no existían. La proyección descarta las `ambiguous` (CONTRATO-F9.md §4.5),
 * así que el conteo crudo por `kind` no alcanza y se separa.
 *
 * Uso: npx tsx scripts/q-f3-probe-pagerank.mts <dir> [<dir> ...]
 */
import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { projectGraph } from "../src/server/services/graph/metrics/projection.js";
import { edgeIsAmbiguous, type CodeGraph, type EdgeKind } from "../src/server/services/graph/types.js";

/** La lista que las cuatro métricas enumeraban a mano hasta la Ola Q. */
const VIEJA: readonly EdgeKind[] = [
  "references",
  "extends",
  "implements",
  "mixes-in",
  "instantiates",
  "imports",
  "satisfies",
];
const NUEVA: readonly EdgeKind[] = [...VIEJA, "calls", "carries", "invokes-indirect"];

function aristasProyectadas(p: ReturnType<typeof projectGraph>): number {
  let n = 0;
  for (const adj of p.out) n += adj.length;
  return n;
}

for (const dir of process.argv.slice(2)) {
  let capturado: CodeGraph | null = null;
  await analyzeRepo({
    dir,
    repoName: "q-f3",
    limits: { maxFindings: "unlimited" },
    onGraph: (r) => {
      capturado = r.graph;
    },
  });
  if (!capturado) continue;
  const g: CodeGraph = capturado;

  const crudas = new Map<string, { total: number; firmes: number }>();
  for (const e of g.edges) {
    const b = crudas.get(e.kind) ?? { total: 0, firmes: 0 };
    b.total++;
    if (!edgeIsAmbiguous(e)) b.firmes++;
    crudas.set(e.kind, b);
  }

  const pv = projectGraph(g, "file", VIEJA);
  const pn = projectGraph(g, "file", NUEVA);
  const av = aristasProyectadas(pv);
  const an = aristasProyectadas(pn);

  // Pares (i,j) nuevos, no sólo peso extra.
  const paresV = new Set<string>();
  for (let i = 0; i < pv.out.length; i++) for (const j of pv.out[i]!) paresV.add(`${pv.nodeIds[i]}→${pv.nodeIds[j]}`);
  const paresN = new Set<string>();
  for (let i = 0; i < pn.out.length; i++) for (const j of pn.out[i]!) paresN.add(`${pn.nodeIds[i]}→${pn.nodeIds[j]}`);
  let nuevos = 0;
  for (const p of paresN) if (!paresV.has(p)) nuevos++;

  console.log(`\n===== ${dir} — ${g.nodes.length} nodos, ${g.edges.length} aristas =====`);
  console.log("  crudas por kind (total / no-ambiguas):");
  for (const [k, v] of [...crudas].sort()) console.log(`    ${k.padEnd(18)} ${String(v.total).padStart(7)} / ${String(v.firmes).padStart(7)}`);
  console.log(
    `  proyección file: lista VIEJA ${av} aristas · lista NUEVA ${an} aristas ` +
      `(${av === 0 ? "—" : `${(((an - av) / av) * 100).toFixed(1)}%`}), ` +
      `${nuevos} pares archivo→archivo que antes NO existían`,
  );
}
