/**
 * Ola U, frente N2 — diagnóstico: por qué `resolveDeferredViaGraph` no
 * resuelve la familia de un `large-class` cuya base vive en otro archivo.
 * Reproduce a mano los pasos de `findGraphFamilyCandidates` sobre el grafo
 * REAL capturado con `onGraph` (mismo mecanismo que `dump-graph-census.mts`).
 *
 * Uso: npx tsx scripts/u-n2-diag-familia.mts <dir> <slug> <Clase> [<Clase>...]
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import { confidentEdges } from "../src/server/services/detect/inter-file/confident-edges.js";
import { memberSignatures, type CodeGraph, type CodeGraphEdge, type GraphIndex } from "../src/server/services/graph/types.js";

const FAMILY = new Set(["extends", "mixes-in"]);

async function main(): Promise<void> {
  const [, , dir, slug, ...classNames] = process.argv;
  if (!dir || !slug) process.exit(1);
  const state: { graph: CodeGraph | null } = { graph: null };
  await analyzeRepo({ dir: path.resolve(dir), repoName: slug, limits: { maxFindings: "unlimited" }, onGraph: (r) => { state.graph = r.graph; } });
  const graph = state.graph;
  if (!graph) { console.error("sin grafo"); process.exit(1); }

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const edgesFrom = new Map<string, CodeGraphEdge[]>();
  for (const e of confidentEdges(graph)) {
    const l = edgesFrom.get(e.from);
    if (l) l.push(e); else edgesFrom.set(e.from, [e]);
  }
  const gi: GraphIndex = { nodeById: (id) => nodeById.get(id) ?? null, edgesFrom: (id) => edgesFrom.get(id) ?? [] };
  const last = (p: readonly string[]): string => p[p.length - 1] ?? "";

  for (const cn of classNames) {
    const nodes = graph.nodes.filter((n) => n.kind === "symbol" && n.family === "class-like" && last(n.symbolPath) === cn);
    console.log(`\n### ${cn}: ${nodes.length} nodo(s) class-like`);
    for (const n of nodes) {
      console.log(`  ${n.id} (${n.file}:${n.startLine})`);
      const fam = (edgesFrom.get(n.id) ?? []).filter((e) => FAMILY.has(e.kind));
      const all = (graph.edges).filter((e) => e.from === n.id && FAMILY.has(e.kind));
      console.log(`    aristas familia confiadas: ${fam.map((e) => `${e.kind}->${nodeById.get(e.to) ? last(nodeById.get(e.to)!.symbolPath) : e.to}`).join(", ") || "(ninguna)"}`);
      console.log(`    aristas familia TOTALES:  ${all.map((e) => `${e.kind}[${e.provenance}]->${nodeById.get(e.to) ? last(nodeById.get(e.to)!.symbolPath) : e.to}`).join(", ") || "(ninguna)"}`);
      for (const e of fam) {
        const anc = nodeById.get(e.to);
        if (!anc) { console.log(`    ancestro ${e.to} SIN NODO`); continue; }
        const sibs = graph.nodes.filter((s) => s.kind === "symbol" && s.family === "class-like" && s.id !== anc.id && (edgesFrom.get(s.id) ?? []).some((x) => FAMILY.has(x.kind) && x.to === anc.id));
        console.log(`    ancestro "${last(anc.symbolPath)}": ${sibs.length} hermanos [${sibs.slice(0, 8).map((s) => last(s.symbolPath)).join(", ")}]`);
        const members = memberSignatures(gi, anc.id);
        console.log(`      miembros del ancestro: ${members.length} — ${members.slice(0, 12).map((m) => `${m.name}/${m.arity}${m.returnType ? ":" + m.returnType : ""}`).join(", ")}`);
        for (const s of sibs.slice(0, 8)) {
          const sm = memberSignatures(gi, s.id);
          const noRe = members.filter((m) => !sibs.some((z) => memberSignatures(gi, z.id).some((zm) => zm.name === m.name && zm.arity === m.arity)));
          console.log(`      hermano ${last(s.symbolPath)}: ${sm.length} miembros; ancestro con miembros que NADIE redeclara: ${noRe.length}`);
          break;
        }
        // ¿todas las unidades tienen ancestro común?
        const sinFamilia = sibs.filter((s) => (edgesFrom.get(s.id) ?? []).filter((x) => FAMILY.has(x.kind)).length === 0);
        console.log(`      hermanos SIN ninguna arista de familia confiada: ${sinFamilia.length}`);
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
