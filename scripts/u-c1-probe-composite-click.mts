/**
 * C1 (Ola U) — ¿existe hoy, en el grafo REAL de `corpus/click`, la arista que
 * `hypotheses/composite.ts#callsReceiverMember` busca para el caso canónico
 * que PLAN-INTENCIONES.md §9 cita (`click/src/click/core.py:1642` `class
 * Group(Command)`, `:1991` `def invoke`, `:2025` `sub_ctx.command.invoke(...)`)?
 * Y si existe, ¿con qué `provenance` — o sea, la ve `confidentEdges` o no?
 *
 * Uso: npx tsx scripts/u-c1-probe-composite-click.mts <dir>
 */
import path from "node:path";

import { analyzeRepo } from "../src/server/services/code-analyzer.js";
import type { CodeGraph } from "../src/server/services/graph/types.js";

const [, , dir] = process.argv;
let graph: CodeGraph | null = null;
await analyzeRepo({
  dir: path.resolve(dir ?? "corpus/click"),
  repoName: "probe",
  limits: { maxFindings: "unlimited" },
  onGraph: (r) => {
    graph = r.graph;
  },
});
if (!graph) process.exit(0);
const g: CodeGraph = graph;

const interesting = (id: string): boolean => /#(Group|Command|MultiCommand|CommandCollection)\./.test(id);
console.log("--- aristas calls/references entre miembros de Group/Command ---");
for (const e of g.edges) {
  if (e.kind !== "calls" && e.kind !== "references") continue;
  if (!interesting(e.from) || !interesting(e.to)) continue;
  console.log(`${e.kind} ${e.from} -> ${e.to} prov=${e.provenance} roles=${e.roles ?? "-"} by=${e.resolvedBy ?? "-"} alts=${(e.alternatives ?? []).length}`);
}
console.log("--- implements/satisfies/extends de Group ---");
for (const e of g.edges) {
  if (!["implements", "satisfies", "extends"].includes(e.kind)) continue;
  if (!/Group|Command/.test(e.from) && !/Group|Command/.test(e.to)) continue;
  console.log(`${e.kind} ${e.from} -> ${e.to} prov=${e.provenance}`);
}
